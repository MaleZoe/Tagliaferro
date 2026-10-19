// =====================================================================
// ÉLITE SPORT — Backend (Node.js + Express + Supabase + Mercado Pago)
// Archivo: backend/server.js
// =====================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { validarPedido, validarMovimientoInventario, validarVentaPOS, validarReversionVenta, validarEdicionCliente } = require('./validators');
const { verificarYAplicarPago } = require('./payment-service');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, MP_ACCESS_TOKEN } = process.env;
// Apunta al servidor React de Vite por defecto; producción debe definir el dominio público en FRONT_URL.
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 3000;

// Reglas de negocio (RN-01)
const ENVIO_GRATIS_DESDE = 50000;
const COSTO_ENVIO = 3500;

// Acepta fechas calendario reales en formato ISO para no depender de coerciones del navegador.
function fechaValida(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !MP_ACCESS_TOKEN) {
  console.error('Faltan variables en backend/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY, MP_ACCESS_TOKEN)');
  process.exit(1);
}

const app = express();
// Limita los orígenes permitidos y el tamaño del JSON para reducir solicitudes no deseadas.
const origins = (process.env.CORS_ORIGINS || FRONT_URL).split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '100kb' }));

// Aplica límites por IP en este proceso para amortiguar abusos simples de la API.
function limitarSolicitudes(maximo, ventanaMs) {
  const visitas = new Map();
  return (req, res, next) => {
    const ahora = Date.now();
    const clave = req.ip || req.socket.remoteAddress || 'desconocida';
    const actual = visitas.get(clave);
    const registro = !actual || ahora >= actual.fin
      ? { cantidad: 0, fin: ahora + ventanaMs }
      : actual;
    registro.cantidad += 1;
    visitas.set(clave, registro);
    if (visitas.size > 5000) {
      for (const [ip, valor] of visitas) if (ahora >= valor.fin) visitas.delete(ip);
    }
    if (registro.cantidad > maximo) {
      res.set('Retry-After', String(Math.ceil((registro.fin - ahora) / 1000)));
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intentá nuevamente más tarde.' });
    }
    next();
  };
}

app.use('/api', limitarSolicitudes(120, 15 * 60 * 1000));
app.use('/api/pedidos', limitarSolicitudes(15, 15 * 60 * 1000));
app.use('/api/v1/orders', limitarSolicitudes(15, 15 * 60 * 1000));

// Cliente con la clave secreta: se saltea RLS. NUNCA usar en el frontend.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------------------------------------------------------------------
// Middleware: verifica el token de sesión que manda el frontend
// ---------------------------------------------------------------------
async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Tenés que iniciar sesión' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data || !data.user) return res.status(401).json({ error: 'Sesión inválida o vencida' });

  req.user = data.user;
  return next();
}

// Consulta roles asignados por personal autorizado; nunca acepta el rol desde el navegador.
function requireRole(...roles) {
  return async (req, res, next) => {
    const { data, error } = await supabase.from('app_user_roles')
      .select('role, active').eq('user_id', req.user.id).maybeSingle();
    if (error) {
      console.error('No se pudo verificar el rol:', error.message);
      return res.status(503).json({ error: 'No se pudieron verificar los permisos' });
    }
    if (!data?.active || !roles.includes(data.role)) {
      return res.status(403).json({ error: 'No tenés permisos para esta operación' });
    }
    req.role = data.role;
    return next();
  };
}

// ---------------------------------------------------------------------
// Rutas básicas
// ---------------------------------------------------------------------
app.get('/', (req, res) => res.send('API de Élite Sport funcionando'));
app.get('/api/salud', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------
// PASO 1 — Catálogo (formato igual al array PRODUCTS que usaba el frontend)
// ---------------------------------------------------------------------
// Devuelve únicamente productos activos con sus talles y existencias disponibles.
async function listarProductos(req, res) {
  const { data, error } = await supabase
    .from('products')
    .select('id, nombre, descripcion, precio, precio_anterior, badge, imagen_url, sports(slug), product_variants(id, talle, stock)')
    .eq('activo', true)
    .order('id');

  if (error) {
    console.error('No se pudo consultar el catálogo:', error.message);
    return res.status(500).json({ error: 'No se pudo cargar el catálogo' });
  }

  const productos = data.map(p => {
    const variantes = [...(p.product_variants || [])].sort((a, b) => a.id - b.id);
    const stock = {};
    variantes.forEach(v => { stock[v.talle] = v.stock; });
    return {
      id: p.id,
      name: p.nombre,
      desc: p.descripcion,
      price: Number(p.precio),
      oldPrice: p.precio_anterior ? Number(p.precio_anterior) : undefined,
      badge: p.badge || undefined,
      img: p.imagen_url,
      sport: p.sports?.slug || '',
      sizes: variantes.map(v => v.talle),
      stock
    };
  });

  res.json(productos);
}

// Mantiene la ruta original y ofrece la ruta versionada que consume la interfaz React.
app.get('/api/productos', listarProductos);
app.get('/api/v1/products', listarProductos);

// Devuelve el rol de la sesión actual para adaptar la navegación; la autorización se repite en cada ruta privada.
app.get('/api/v1/me', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('app_user_roles')
    .select('role, active').eq('user_id', req.user.id).maybeSingle();
  if (error) {
    console.error('No se pudo consultar el rol de la sesión:', error.message);
    return res.status(503).json({ error: 'No se pudo consultar el perfil de acceso' });
  }
  res.json({ id: req.user.id, email: req.user.email, role: data?.active ? data.role : 'cliente' });
});

// Actualiza datos conocidos de productos sin borrar registros ni aceptar columnas arbitrarias.
app.patch('/api/v1/products/:id', requireAuth, requireRole('administrador'), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const allowed = ['nombre', 'descripcion', 'precio', 'precio_anterior', 'badge', 'imagen_url', 'activo'];
  const update = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
  if (!Number.isSafeInteger(id) || id < 1 || !Object.keys(update).length) return res.status(400).json({ error: 'Producto o cambios inválidos' });
  if (update.nombre !== undefined && (typeof update.nombre !== 'string' || update.nombre.trim().length < 2 || update.nombre.trim().length > 200)) return res.status(400).json({ error: 'El nombre debe tener entre 2 y 200 caracteres' });
  if (update.descripcion !== undefined && (typeof update.descripcion !== 'string' || update.descripcion.length > 4000)) return res.status(400).json({ error: 'La descripción no puede superar 4000 caracteres' });
  if (update.precio !== undefined && (!Number.isFinite(Number(update.precio)) || Number(update.precio) <= 0 || Number(update.precio) > 100000000)) return res.status(400).json({ error: 'El precio debe ser positivo y válido' });
  if (update.precio_anterior !== undefined && update.precio_anterior !== null && (!Number.isFinite(Number(update.precio_anterior)) || Number(update.precio_anterior) <= 0)) return res.status(400).json({ error: 'El precio anterior debe ser positivo o nulo' });
  if (update.badge !== undefined && (typeof update.badge !== 'string' || update.badge.length > 60)) return res.status(400).json({ error: 'La etiqueta no puede superar 60 caracteres' });
  if (update.imagen_url !== undefined && (typeof update.imagen_url !== 'string' || update.imagen_url.length > 1000)) return res.status(400).json({ error: 'La ruta de imagen es inválida' });
  if (update.activo !== undefined && typeof update.activo !== 'boolean') return res.status(400).json({ error: 'El estado activo debe ser verdadero o falso' });
  if (update.nombre !== undefined) update.nombre = update.nombre.trim();
  if (update.precio !== undefined) update.precio = Number(update.precio);
  if (update.precio_anterior !== undefined && update.precio_anterior !== null) update.precio_anterior = Number(update.precio_anterior);
  const { data, error } = await supabase.from('products').update(update).eq('id', id).select('id, nombre, descripcion, precio, precio_anterior, badge, imagen_url, activo').maybeSingle();
  if (error) {
    console.error('No se pudo actualizar producto:', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar el producto' });
  }
  if (!data) return res.status(404).json({ error: 'Producto inexistente' });
  res.json(data);
});

// Lista cuentas con roles sin incluir contraseñas ni tokens; el servicio de Auth solo se consulta en backend.
app.get('/api/v1/employees', requireAuth, requireRole('administrador'), async (req, res) => {
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (usersError) return res.status(502).json({ error: 'No se pudo consultar el servicio de cuentas' });
  const ids = (users?.users || []).map(user => user.id);
  if (!ids.length) return res.json([]);
  const { data: roles, error: rolesError } = await supabase.from('app_user_roles').select('user_id, role, active, updated_at').in('user_id', ids);
  if (rolesError) return res.status(500).json({ error: 'No se pudieron consultar los roles' });
  const roleById = new Map((roles || []).map(row => [row.user_id, row]));
  res.json((users?.users || []).filter(user => roleById.get(user.id)?.role === 'empleado').map(user => ({
    id: user.id, email: user.email, nombre: user.user_metadata?.nombre || '', apellido: user.user_metadata?.apellido || '',
    active: roleById.get(user.id).active, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at,
  })));
});

// Invita por correo con Supabase Auth y asigna únicamente rol de empleado desde la operación protegida.
app.post('/api/v1/employees/invite', requireAuth, requireRole('administrador'), async (req, res) => {
  const { email, nombre, apellido } = req.body || {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof nombre !== 'string' || !nombre.trim() || typeof apellido !== 'string' || !apellido.trim()) {
    return res.status(400).json({ error: 'Indicá un correo válido, nombre y apellido' });
  }
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email.trim(), { data: { nombre: nombre.trim(), apellido: apellido.trim() } });
  if (error || !data?.user) {
    console.error('No se pudo invitar empleado:', error?.message);
    return res.status(502).json({ error: 'No se pudo enviar la invitación; revisá la configuración de correo de Supabase' });
  }
  const { error: roleError } = await supabase.from('app_user_roles').upsert({ user_id: data.user.id, role: 'empleado', active: true, updated_at: new Date().toISOString() });
  if (roleError) {
    console.error('No se pudo asignar el rol al empleado invitado:', roleError.message);
    return res.status(500).json({ error: 'La cuenta fue invitada, pero no se pudo asignar el rol; un administrador debe completar la asignación' });
  }
  res.status(201).json({ id: data.user.id, email: data.user.email, role: 'empleado', active: true });
});

// Permite cambiar permisos o desactivar personal, pero prohíbe que la sesión cambie sus propios permisos.
app.patch('/api/v1/employees/:id', requireAuth, requireRole('administrador'), async (req, res) => {
  const id = String(req.params.id || '');
  const { role, active } = req.body || {};
  if (!/^[0-9a-f-]{36}$/i.test(id) || id === req.user.id || (role !== undefined && !['administrador', 'empleado', 'cliente'].includes(role)) || (active !== undefined && typeof active !== 'boolean') || (role === undefined && active === undefined)) {
    return res.status(400).json({ error: 'La cuenta o los permisos no son válidos; no podés modificar tus propios permisos' });
  }
  const update = { updated_at: new Date().toISOString() };
  if (role !== undefined) update.role = role;
  if (active !== undefined) update.active = active;
  const { data, error } = await supabase.from('app_user_roles').update(update).eq('user_id', id).select('user_id, role, active').maybeSingle();
  if (error) return res.status(500).json({ error: 'No se pudieron actualizar los permisos' });
  if (!data) return res.status(404).json({ error: 'La cuenta no tiene un rol interno asignado' });
  res.json(data);
});

// Busca clientes desde Auth y perfiles, agregando compras guardadas sin exponer credenciales.
app.get('/api/v1/customers', requireAuth, requireRole('administrador'), async (req, res) => {
  const search = String(req.query.q || '').trim().toLocaleLowerCase('es').slice(0, 100);
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return res.status(502).json({ error: 'No se pudo consultar el servicio de cuentas' });
  const users = authData?.users || [];
  const ids = users.map(user => user.id);
  if (!ids.length) return res.json([]);
  const [{ data: roleRows, error: roleError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from('app_user_roles').select('user_id, role, active').in('user_id', ids),
    supabase.from('profiles').select('id, nombre, apellido').in('id', ids),
  ]);
  if (roleError || profileError) return res.status(500).json({ error: 'No se pudieron consultar los perfiles' });
  const roleById = new Map((roleRows || []).map(row => [row.user_id, row]));
  const profileById = new Map((profiles || []).map(row => [row.id, row]));
  const customers = users.filter(user => {
    const role = roleById.get(user.id)?.role;
    return role !== 'administrador' && role !== 'empleado';
  }).map(user => {
    const profile = profileById.get(user.id) || {};
    return { id: user.id, email: user.email, nombre: profile.nombre || user.user_metadata?.nombre || '', apellido: profile.apellido || user.user_metadata?.apellido || '', active: roleById.get(user.id)?.active !== false, created_at: user.created_at };
  }).filter(customer => !search || `${customer.nombre} ${customer.apellido} ${customer.email}`.toLocaleLowerCase('es').includes(search));
  const customerIds = customers.map(customer => customer.id);
  const { data: orders, error: orderError } = customerIds.length
    ? await cargarFilasPaginadas((startRow, endRow) => supabase.from('orders').select('customer_id, total, estado').in('customer_id', customerIds).range(startRow, endRow))
    : { data: [], error: null };
  if (orderError) return res.status(500).json({ error: 'No se pudo consultar el historial de compras' });
  const totals = new Map();
  for (const order of orders || []) {
    const current = totals.get(order.customer_id) || { orderCount: 0, completedSpend: 0 };
    current.orderCount += 1;
    if (['pagado', 'enviado', 'entregado'].includes(order.estado)) current.completedSpend += Number(order.total);
    totals.set(order.customer_id, current);
  }
  res.json(customers.map(customer => ({ ...customer, ...(totals.get(customer.id) || { orderCount: 0, completedSpend: 0 }) })));
});

// Actualiza solo nombre y apellido de un perfil ya existente; no modifica Auth, roles ni datos de pago.
app.patch('/api/v1/customers/:id', requireAuth, requireRole('administrador'), async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || id === req.user.id) {
    return res.status(400).json({ error: 'El identificador del cliente no es válido' });
  }
  if (!validarEdicionCliente(req.body)) {
    return res.status(400).json({ error: 'El nombre y el apellido deben tener entre 1 y 100 caracteres' });
  }

  const { data: authResult, error: authError } = await supabase.auth.admin.getUserById(id);
  if (authError) return res.status(502).json({ error: 'No se pudo comprobar la cuenta del cliente' });
  if (!authResult?.user) return res.status(404).json({ error: 'Cliente inexistente' });

  const { data: internalRole, error: roleError } = await supabase.from('app_user_roles')
    .select('role').eq('user_id', id).maybeSingle();
  if (roleError) return res.status(503).json({ error: 'No se pudo validar el tipo de cuenta' });
  if (internalRole && ['administrador', 'empleado'].includes(internalRole.role)) {
    return res.status(404).json({ error: 'Cliente inexistente' });
  }

  const { data, error } = await supabase.from('profiles')
    .update({ nombre: req.body.nombre.trim(), apellido: req.body.apellido.trim() })
    .eq('id', id).select('id, nombre, apellido').maybeSingle();
  if (error) {
    console.error('No se pudo actualizar el perfil del cliente:', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar el perfil' });
  }
  if (!data) return res.status(404).json({ error: 'No existe un perfil editable para esa cuenta' });
  res.json(data);
});

// El administrador puede consultar el historial de un cliente concreto, validando primero su identidad Auth.
app.get('/api/v1/customers/:id/orders', requireAuth, requireRole('administrador'), async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Cliente inválido' });
  const { data, error } = await supabase.from('orders').select(`
    id, estado, total, subtotal, envio, created_at, medio_de_pago, direccion_envio,
    order_items(cantidad, precio_unitario, product_variants(talle, products(nombre, imagen_url)))
  `).eq('customer_id', id).order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: 'No se pudo consultar el historial de compras' });
  res.json(data || []);
});

// Lista inventario paginado y permite filtrar por nombre o deporte sin aceptar cambios de stock del cliente.
app.get('/api/v1/inventory', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 30));
  const query = String(req.query.q || '').trim().slice(0, 100);
  const sport = String(req.query.sport || '').trim().toLocaleLowerCase('es').slice(0, 40);
  let request = supabase.from('product_variants')
    .select('id, talle, stock, stock_minimo, products!inner(id, nombre, descripcion, precio, activo, imagen_url, sports(slug))', { count: 'exact' })
    .eq('products.activo', true).order('id').range((page - 1) * pageSize, page * pageSize - 1);
  if (query) request = request.ilike('products.nombre', `%${query.replace(/[%_]/g, '')}%`);
  if (sport) request = request.eq('products.sports.slug', sport);
  const { data, error, count } = await request;
  if (error) {
    console.error('No se pudo consultar inventario:', error.message);
    return res.status(500).json({ error: 'No se pudo cargar el inventario' });
  }
  res.json({ items: data || [], page, pageSize, total: count || 0 });
});

// Da de alta un talle con cantidad inicial auditada dentro de una sola operación SQL.
app.post('/api/v1/inventory/variants', requireAuth, requireRole('administrador'), async (req, res) => {
  const { productId, size, initialStock, minimum = 0 } = req.body || {};
  if (!Number.isInteger(productId) || productId < 1 || typeof size !== 'string' || !size.trim() || size.trim().length > 40 || !Number.isInteger(initialStock) || initialStock < 0 || initialStock > 100000 || !Number.isInteger(minimum) || minimum < 0 || minimum > 100000) {
    return res.status(400).json({ error: 'Producto, talle, stock inicial o mínimo inválidos' });
  }
  const { data, error } = await supabase.rpc('create_product_variant', {
    p_product_id: productId, p_size: size.trim(), p_initial_stock: initialStock,
    p_minimum: minimum, p_responsible_id: req.user.id,
  });
  if (error) {
    console.error('No se pudo crear la variante:', error.message);
    return res.status(error.code === '23505' ? 409 : error.code === 'P0002' ? 404 : 400)
      .json({ error: error.code === '23505' ? 'Ese talle ya existe para el producto' : error.code === 'P0002' ? 'Producto inexistente o inactivo' : 'No se pudo crear la variante' });
  }
  res.status(201).json(data?.[0] || {});
});

// Obtiene trazabilidad filtrada por variante y rango temporal.
app.get('/api/v1/inventory/movements', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const from = req.query.from ? String(req.query.from) : '';
  const to = req.query.to ? String(req.query.to) : '';
  if (!fechaValida(from) || !fechaValida(to) || (from && to && from > to)) return res.status(400).json({ error: 'El rango de fechas no es válido' });
  let request = supabase.from('inventory_movements')
    .select('id, variant_id, cantidad, motivo, responsable_id, stock_anterior, stock_actual, created_at, sale_id, product_variants(talle, products(nombre))')
    .order('created_at', { ascending: false }).limit(limit);
  if (req.query.variantId && Number.isInteger(Number(req.query.variantId))) request = request.eq('variant_id', Number(req.query.variantId));
  if (from) request = request.gte('created_at', new Date(`${from}T00:00:00.000Z`).toISOString());
  if (to) request = request.lte('created_at', new Date(`${to}T23:59:59.999Z`).toISOString());
  const { data, error } = await request;
  if (error) {
    console.error('No se pudo consultar movimientos:', error.message);
    return res.status(500).json({ error: 'No se pudo cargar el historial de movimientos' });
  }
  res.json(data || []);
});

// Permite al administrador definir el umbral de alerta sin modificar las existencias actuales.
app.patch('/api/v1/inventory/variants/:id/minimum', requireAuth, requireRole('administrador'), async (req, res) => {
  const variantId = Number(req.params.id);
  const minimum = req.body?.stockMinimo;
  if (!Number.isInteger(variantId) || variantId < 1 || !Number.isInteger(minimum) || minimum < 0 || minimum > 100000) {
    return res.status(400).json({ error: 'El talle o el stock mínimo no son válidos' });
  }
  const { data, error } = await supabase.from('product_variants').update({ stock_minimo: minimum })
    .eq('id', variantId).select('id, stock_minimo').maybeSingle();
  if (error) {
    console.error('No se pudo actualizar el stock mínimo:', error.message);
    return res.status(500).json({ error: 'No se pudo actualizar el stock mínimo; revisá que la migración esté aplicada' });
  }
  if (!data) return res.status(404).json({ error: 'Variante inexistente' });
  res.json(data);
});

// Recibe un ajuste justificado y delega el bloqueo, control de saldo y auditoría a una función SQL atómica.
app.post('/api/v1/inventory/movements', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  const { variantId, delta, reason } = req.body || {};
  if (!validarMovimientoInventario(req.body)) {
    return res.status(400).json({ error: 'Indicá una variante, una cantidad válida y un motivo de al menos 3 caracteres' });
  }
  const { data, error } = await supabase.rpc('register_inventory_movement', {
    p_variant_id: variantId, p_delta: delta, p_reason: reason.trim(), p_responsible_id: req.user.id,
  });
  if (error) {
    console.error('No se pudo registrar el movimiento:', error.message);
    return res.status(error.code === '23514' ? 409 : error.code === 'P0002' ? 404 : 400)
      .json({ error: error.code === '23514' ? 'El ajuste dejaría el stock en negativo' : error.code === 'P0002' ? 'Variante inexistente' : 'No se pudo registrar el movimiento' });
  }
  res.status(201).json(data?.[0] || {});
});

// Lista ventas presenciales y detalles históricos solo para empleados autorizados.
app.get('/api/v1/sales', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  let request = supabase.from('sales').select('id, employee_id, payment_method, status, total, created_at, sale_items(id, variant_id, product_name, size, quantity, unit_price, line_total)')
    .order('created_at', { ascending: false }).limit(limit);
  if (req.query.from && !Number.isNaN(Date.parse(req.query.from))) request = request.gte('created_at', new Date(req.query.from).toISOString());
  if (req.query.to && !Number.isNaN(Date.parse(req.query.to))) request = request.lte('created_at', new Date(req.query.to).toISOString());
  const { data, error } = await request;
  if (error) {
    console.error('No se pudieron consultar ventas presenciales:', error.message);
    return res.status(500).json({ error: 'No se pudo cargar el historial de ventas' });
  }
  res.json(data || []);
});

// La base de datos vuelve a leer precios, bloquea variantes, actualiza stock y guarda la venta en una sola transacción.
app.post('/api/v1/sales', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  const { requestKey, paymentMethod, items } = req.body || {};
  if (!validarVentaPOS(req.body)) {
    return res.status(400).json({ error: 'Los datos de la venta son inválidos' });
  }
  const { data, error } = await supabase.rpc('register_pos_sale', {
    p_request_key: requestKey, p_employee_id: req.user.id, p_payment_method: paymentMethod,
    p_items: items.map(item => ({ variant_id: item.variantId, quantity: item.qty })),
  });
  if (error) {
    console.error('No se pudo registrar venta POS:', error.message);
    return res.status(error.code === '23514' ? 409 : error.code === 'P0002' ? 409 : 400)
      .json({ error: error.code === '23514' ? 'No hay stock suficiente para completar la venta' : 'No se pudo registrar la venta' });
  }
  const result = data?.[0] || {};
  res.status(result.repeated ? 200 : 201).json(result);
});

// Solo administración puede anular/devolver ventas; la función SQL repone stock y registra la auditoría.
app.post('/api/v1/sales/:id/reverse', requireAuth, requireRole('administrador'), async (req, res) => {
  const saleId = Number(req.params.id);
  const { status, reason } = req.body || {};
  if (!Number.isSafeInteger(saleId) || saleId < 1 || !validarReversionVenta(req.body)) {
    return res.status(400).json({ error: 'Indicá una venta, el tipo de reversión y un motivo válido' });
  }
  const { data, error } = await supabase.rpc('reverse_pos_sale', {
    p_sale_id: saleId, p_responsible_id: req.user.id, p_new_status: status, p_reason: reason.trim(),
  });
  if (error) {
    console.error('No se pudo revertir la venta:', error.message);
    return res.status(error.code === 'P0002' ? 404 : 409).json({ error: error.code === 'P0002' ? 'Venta o variante inexistente' : 'No se pudo revertir esta venta' });
  }
  res.json(data?.[0] || {});
});

// Registra cambios de proyecto con actor y detalle para mantener una bitácora explicable.
async function registrarHistorialProyecto(projectId, taskId, actorId, action, details = {}) {
  const { error } = await supabase.from('project_history').insert({
    project_id: projectId, task_id: taskId, actor_id: actorId, action, details,
  });
  if (error) {
    console.error('No se pudo guardar el historial del proyecto:', error.message);
    throw new Error('No se pudo guardar la trazabilidad de la operación');
  }
}

// Devuelve proyectos a administradores y a empleados que son responsables o tienen una tarea asignada.
app.get('/api/v1/projects', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  let query = supabase.from('projects').select('*, project_tasks(id, status, due_date), project_phases(id, name, start_date, due_date)').order('updated_at', { ascending: false }).limit(100);
  if (req.role === 'empleado') {
    const { data: assignments, error: taskError } = await supabase.from('project_tasks').select('project_id').eq('assignee_id', req.user.id);
    if (taskError) return res.status(500).json({ error: 'No se pudieron consultar las asignaciones' });
    const projectIds = [...new Set((assignments || []).map(row => Number(row.project_id)).filter(Number.isSafeInteger))];
    const clauses = [`owner_id.eq.${req.user.id}`];
    if (projectIds.length) clauses.push(`id.in.(${projectIds.join(',')})`);
    query = query.or(clauses.join(','));
  }
  const { data, error } = await query;
  if (error) {
    console.error('No se pudieron cargar proyectos:', error.message);
    return res.status(500).json({ error: 'No se pudieron cargar los proyectos; revisá que la migración esté aplicada' });
  }
  const projects = (data || []).map(project => {
    const tasks = project.project_tasks || [];
    const complete = tasks.filter(task => task.status === 'completada').length;
    return { ...project, progress: tasks.length ? Math.round(complete * 100 / tasks.length) : 0, overdueTasks: tasks.filter(task => task.status !== 'completada' && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)).length };
  });
  res.json(projects);
});

// Devuelve la bitácora solo a administración, responsable del proyecto o personal con tareas asignadas.
app.get('/api/v1/projects/:id/history', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  const projectId = Number(req.params.id);
  if (!Number.isSafeInteger(projectId) || projectId < 1) return res.status(400).json({ error: 'Proyecto inválido' });
  if (req.role === 'empleado') {
    const [{ data: project }, { data: assignment }] = await Promise.all([
      supabase.from('projects').select('id, owner_id').eq('id', projectId).maybeSingle(),
      supabase.from('project_tasks').select('id').eq('project_id', projectId).eq('assignee_id', req.user.id).limit(1).maybeSingle(),
    ]);
    if (!project || (project.owner_id !== req.user.id && !assignment)) return res.status(403).json({ error: 'No tenés acceso a este proyecto' });
  }
  const { data, error } = await supabase.from('project_history')
    .select('id, task_id, actor_id, action, details, created_at').eq('project_id', projectId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: 'No se pudo cargar la bitácora del proyecto' });
  res.json(data || []);
});

// Solo administración puede iniciar proyectos; el responsable debe ser un empleado activo.
app.post('/api/v1/projects', requireAuth, requireRole('administrador'), async (req, res) => {
  const { name, description = '', objective = '', ownerId, startDate = null, dueDate = null, priority = 'media', status = 'planificacion' } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160 || typeof description !== 'string' || description.length > 4000 || typeof objective !== 'string' || objective.length > 2000 || !/^[0-9a-f-]{36}$/i.test(String(ownerId || '')) || !fechaValida(startDate) || !fechaValida(dueDate) || !['baja', 'media', 'alta', 'urgente'].includes(priority) || !['planificacion', 'pendiente', 'en_curso', 'pausado', 'completado', 'cancelado'].includes(status) || (startDate && dueDate && dueDate < startDate)) {
    return res.status(400).json({ error: 'Completá nombre, responsable, fechas y valores válidos' });
  }
  const { data: owner } = await supabase.from('app_user_roles').select('user_id').eq('user_id', ownerId).eq('role', 'empleado').eq('active', true).maybeSingle();
  if (!owner) return res.status(400).json({ error: 'El responsable debe ser un empleado activo' });
  const { data, error } = await supabase.from('projects').insert({
    name: name.trim(), description, objective, owner_id: ownerId, created_by: req.user.id,
    start_date: startDate, due_date: dueDate, priority, status,
  }).select('*').single();
  if (error) {
    console.error('No se pudo crear el proyecto:', error.message);
    return res.status(500).json({ error: 'No se pudo crear el proyecto; revisá que la migración esté aplicada' });
  }
  try { await registrarHistorialProyecto(data.id, null, req.user.id, 'proyecto_creado', { name: data.name }); }
  catch (historyError) { return res.status(500).json({ error: historyError.message, projectId: data.id }); }
  res.status(201).json({ ...data, progress: 0 });
});

// Actualiza campos de proyecto e incorpora el cambio a la bitácora.
app.patch('/api/v1/projects/:id', requireAuth, requireRole('administrador'), async (req, res) => {
  const id = Number(req.params.id);
  const allowed = { name: 'name', description: 'description', objective: 'objective', ownerId: 'owner_id', startDate: 'start_date', dueDate: 'due_date', priority: 'priority', status: 'status' };
  const update = Object.fromEntries(Object.entries(allowed).filter(([field]) => Object.hasOwn(req.body || {}, field)).map(([field, column]) => [column, req.body[field]]));
  if (!Number.isSafeInteger(id) || id < 1 || !Object.keys(update).length) return res.status(400).json({ error: 'Indicá un proyecto y campos válidos para actualizar' });
  if (update.name !== undefined && (typeof update.name !== 'string' || update.name.trim().length < 2 || update.name.trim().length > 160)) return res.status(400).json({ error: 'Nombre de proyecto inválido' });
  if (update.description !== undefined && (typeof update.description !== 'string' || update.description.length > 4000)) return res.status(400).json({ error: 'Descripción inválida' });
  if (update.objective !== undefined && (typeof update.objective !== 'string' || update.objective.length > 2000)) return res.status(400).json({ error: 'Objetivo inválido' });
  if (update.priority !== undefined && !['baja', 'media', 'alta', 'urgente'].includes(update.priority)) return res.status(400).json({ error: 'Prioridad inválida' });
  if (update.status !== undefined && !['planificacion', 'pendiente', 'en_curso', 'pausado', 'completado', 'cancelado'].includes(update.status)) return res.status(400).json({ error: 'Estado de proyecto inválido' });
  if (!fechaValida(update.start_date) || !fechaValida(update.due_date)) return res.status(400).json({ error: 'Fecha de proyecto inválida' });
  const { data: existingProject } = await supabase.from('projects').select('start_date, due_date').eq('id', id).maybeSingle();
  if (!existingProject) return res.status(404).json({ error: 'Proyecto inexistente' });
  const startDate = update.start_date === undefined ? existingProject.start_date : update.start_date;
  const dueDate = update.due_date === undefined ? existingProject.due_date : update.due_date;
  if (startDate && dueDate && dueDate < startDate) return res.status(400).json({ error: 'La fecha límite debe ser posterior al inicio' });
  if (update.owner_id) {
    const { data: owner } = await supabase.from('app_user_roles').select('user_id').eq('user_id', update.owner_id).eq('role', 'empleado').eq('active', true).maybeSingle();
    if (!owner) return res.status(400).json({ error: 'El responsable debe ser un empleado activo' });
  }
  update.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('projects').update(update).eq('id', id).select('*').maybeSingle();
  if (error) return res.status(500).json({ error: 'No se pudo actualizar el proyecto' });
  if (!data) return res.status(404).json({ error: 'Proyecto inexistente' });
  try { await registrarHistorialProyecto(id, null, req.user.id, 'proyecto_actualizado', update); }
  catch (historyError) { return res.status(500).json({ error: historyError.message, projectId: id }); }
  res.json(data);
});

// Agrega una fase únicamente a un proyecto existente y conserva fechas ordenadas.
app.post('/api/v1/projects/:id/phases', requireAuth, requireRole('administrador'), async (req, res) => {
  const projectId = Number(req.params.id);
  const { name, description = '', startDate = null, dueDate = null, position = 0 } = req.body || {};
  if (!Number.isSafeInteger(projectId) || projectId < 1 || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160 || typeof description !== 'string' || description.length > 4000 || !Number.isInteger(position) || !fechaValida(startDate) || !fechaValida(dueDate) || (startDate && dueDate && dueDate < startDate)) return res.status(400).json({ error: 'Datos de fase inválidos' });
  const { data, error } = await supabase.from('project_phases').insert({ project_id: projectId, name: name.trim(), description, start_date: startDate, due_date: dueDate, position }).select('*').single();
  if (error) return res.status(500).json({ error: 'No se pudo crear la fase' });
  try { await registrarHistorialProyecto(projectId, null, req.user.id, 'fase_creada', { phaseId: data.id, name: data.name }); }
  catch (historyError) { return res.status(500).json({ error: historyError.message, phaseId: data.id }); }
  res.status(201).json(data);
});

// Crea tareas y verifica que el responsable asignado tenga el rol de empleado activo.
app.post('/api/v1/projects/:id/tasks', requireAuth, requireRole('administrador'), async (req, res) => {
  const projectId = Number(req.params.id);
  const { phaseId = null, title, description = '', assigneeId = null, dueDate = null, priority = 'media' } = req.body || {};
  if (!Number.isSafeInteger(projectId) || projectId < 1 || typeof title !== 'string' || title.trim().length < 2 || title.trim().length > 200 || typeof description !== 'string' || description.length > 4000 || !fechaValida(dueDate) || (phaseId !== null && (!Number.isSafeInteger(Number(phaseId)) || Number(phaseId) < 1)) || !['baja', 'media', 'alta', 'urgente'].includes(priority)) return res.status(400).json({ error: 'Datos de tarea inválidos' });
  if (phaseId !== null) {
    const { data: phase } = await supabase.from('project_phases').select('id').eq('id', phaseId).eq('project_id', projectId).maybeSingle();
    if (!phase) return res.status(400).json({ error: 'La fase no pertenece a este proyecto' });
  }
  if (assigneeId) {
    const { data: employee } = await supabase.from('app_user_roles').select('user_id').eq('user_id', assigneeId).eq('role', 'empleado').eq('active', true).maybeSingle();
    if (!employee) return res.status(400).json({ error: 'La persona asignada debe ser un empleado activo' });
  }
  const { data, error } = await supabase.from('project_tasks').insert({ project_id: projectId, phase_id: phaseId, title: title.trim(), description, assignee_id: assigneeId, due_date: dueDate, priority, created_by: req.user.id }).select('*').single();
  if (error) {
    console.error('No se pudo crear tarea:', error.message);
    return res.status(500).json({ error: 'No se pudo crear la tarea' });
  }
  try { await registrarHistorialProyecto(projectId, data.id, req.user.id, 'tarea_creada', { title: data.title, assigneeId }); }
  catch (historyError) { return res.status(500).json({ error: historyError.message, taskId: data.id }); }
  res.status(201).json(data);
});

// Los empleados solo ven tareas propias; los administradores pueden aplicar filtros generales.
app.get('/api/v1/tasks', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  let query = supabase.from('project_tasks').select('*, projects(name, status), project_phases(name)').order('due_date', { ascending: true }).limit(200);
  if (req.role === 'empleado') query = query.eq('assignee_id', req.user.id);
  if (req.query.status && ['pendiente', 'en_curso', 'bloqueada', 'completada'].includes(req.query.status)) query = query.eq('status', req.query.status);
  if (req.query.priority && ['baja', 'media', 'alta', 'urgente'].includes(req.query.priority)) query = query.eq('priority', req.query.priority);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'No se pudieron cargar las tareas' });
  res.json(data || []);
});

// Los empleados pueden actualizar estado/observaciones propias; la administración puede editar la tarea completa.
app.patch('/api/v1/tasks/:id', requireAuth, requireRole('administrador', 'empleado'), async (req, res) => {
  const taskId = Number(req.params.id);
  if (!Number.isSafeInteger(taskId) || taskId < 1) return res.status(400).json({ error: 'Tarea inválida' });
  const { data: existing, error: lookupError } = await supabase.from('project_tasks').select('*').eq('id', taskId).maybeSingle();
  if (lookupError) return res.status(500).json({ error: 'No se pudo consultar la tarea' });
  if (!existing) return res.status(404).json({ error: 'Tarea inexistente' });
  if (req.role === 'empleado' && existing.assignee_id !== req.user.id) return res.status(403).json({ error: 'Solo podés actualizar tareas asignadas a tu cuenta' });
  const allowed = req.role === 'administrador' ? ['title', 'description', 'assignee_id', 'due_date', 'priority', 'status', 'observations'] : ['status', 'observations'];
  const changes = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(changes).length || (changes.status && !['pendiente', 'en_curso', 'bloqueada', 'completada'].includes(changes.status)) || (changes.priority && !['baja', 'media', 'alta', 'urgente'].includes(changes.priority))) return res.status(400).json({ error: 'Cambios de tarea inválidos' });
  if (changes.title !== undefined && (typeof changes.title !== 'string' || changes.title.trim().length < 2 || changes.title.trim().length > 200)) return res.status(400).json({ error: 'Título de tarea inválido' });
  if (changes.description !== undefined && (typeof changes.description !== 'string' || changes.description.length > 4000)) return res.status(400).json({ error: 'Descripción de tarea inválida' });
  if (changes.observations !== undefined && (typeof changes.observations !== 'string' || changes.observations.length > 4000)) return res.status(400).json({ error: 'Observaciones inválidas' });
  if (changes.due_date !== undefined && !fechaValida(changes.due_date)) return res.status(400).json({ error: 'Fecha de tarea inválida' });
  if (changes.assignee_id !== undefined && changes.assignee_id !== null) {
    const { data: employee } = await supabase.from('app_user_roles').select('user_id').eq('user_id', changes.assignee_id).eq('role', 'empleado').eq('active', true).maybeSingle();
    if (!employee) return res.status(400).json({ error: 'La persona asignada debe ser un empleado activo' });
  }
  if (changes.status) changes.completed_at = changes.status === 'completada' ? new Date().toISOString() : null;
  changes.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('project_tasks').update(changes).eq('id', taskId).select('*').single();
  if (error) return res.status(500).json({ error: 'No se pudo actualizar la tarea' });
  try { await registrarHistorialProyecto(existing.project_id, taskId, req.user.id, 'tarea_actualizada', changes); }
  catch (historyError) { return res.status(500).json({ error: historyError.message, taskId }); }
  res.json(data);
});

// Calcula indicadores administrativos desde pedidos, ventas, variantes y tareas guardadas.
async function cargarFilasPaginadas(crearConsulta, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; offset <= 1000000; offset += pageSize) {
    const { data, error } = await crearConsulta(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
  return { data: null, error: new Error('El conjunto supera el máximo de filas procesables') };
}

app.get('/api/v1/reports/summary', requireAuth, requireRole('administrador'), async (req, res) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const validDate = (value) => {
    if (!value) return true;
    if (!datePattern.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) return res.status(400).json({ error: 'El rango de fechas no es válido' });
  const start = from ? new Date(`${from}T00:00:00.000Z`).toISOString() : null;
  const end = to ? new Date(`${to}T23:59:59.999Z`).toISOString() : null;
  const dateRange = (query) => {
    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', end);
    return query;
  };
  const [ordersResult, salesResult, variantsResult, projectsResult, tasksResult] = await Promise.all([
    cargarFilasPaginadas((startRow, endRow) => dateRange(supabase.from('orders').select('id, canal, estado, total, created_at').order('created_at', { ascending: false }).range(startRow, endRow))),
    cargarFilasPaginadas((startRow, endRow) => dateRange(supabase.from('sales').select('id, status, total, created_at').order('created_at', { ascending: false }).range(startRow, endRow))),
    cargarFilasPaginadas((startRow, endRow) => supabase.from('product_variants').select('id, talle, stock, stock_minimo, products!inner(id, nombre, activo)').eq('products.activo', true).range(startRow, endRow)),
    cargarFilasPaginadas((startRow, endRow) => supabase.from('projects').select('id, status').range(startRow, endRow)),
    cargarFilasPaginadas((startRow, endRow) => supabase.from('project_tasks').select('id, status, due_date').range(startRow, endRow)),
  ]);
  const failed = [ordersResult, salesResult, variantsResult, projectsResult, tasksResult].find((result) => result.error);
  if (failed) {
    console.error('No se pudo calcular el panel:', failed.error.message);
    return res.status(500).json({ error: 'No se pudieron cargar los indicadores; revisá que las migraciones estén aplicadas' });
  }

  const onlineOrders = (ordersResult.data || []).filter(order => order.canal === 'online');
  const confirmedOrders = onlineOrders.filter(order => ['pagado', 'enviado', 'entregado'].includes(order.estado));
  const completedSales = (salesResult.data || []).filter(sale => sale.status === 'completada');
  const pendingOrders = onlineOrders.filter(order => order.estado === 'pendiente');
  const lowStock = (variantsResult.data || []).filter(variant => variant.stock <= variant.stock_minimo);
  const projectRows = projectsResult.data || [];
  const taskRows = tasksResult.data || [];
  const today = new Date().toISOString().slice(0, 10);

  // Suma cantidades de pedidos pagados y ventas POS para ordenar artículos realmente vendidos.
  const quantities = new Map();
  if (confirmedOrders.length) {
    for (let offset = 0; offset < confirmedOrders.length; offset += 200) {
      const ids = confirmedOrders.slice(offset, offset + 200).map(order => order.id);
      const { data, error } = await cargarFilasPaginadas((startRow, endRow) => supabase.from('order_items').select('cantidad, product_variants(products(nombre))').in('order_id', ids).range(startRow, endRow));
      if (error) return res.status(500).json({ error: 'No se pudieron calcular los productos vendidos' });
      for (const line of data || []) {
        const name = line.product_variants?.products?.nombre || 'Producto';
        quantities.set(name, (quantities.get(name) || 0) + line.cantidad);
      }
    }
  }
  if (completedSales.length) {
    for (let offset = 0; offset < completedSales.length; offset += 200) {
      const ids = completedSales.slice(offset, offset + 200).map(sale => sale.id);
      const { data, error } = await cargarFilasPaginadas((startRow, endRow) => supabase.from('sale_items').select('product_name, quantity').in('sale_id', ids).range(startRow, endRow));
      if (error) return res.status(500).json({ error: 'No se pudieron calcular los productos vendidos' });
      for (const line of data || []) quantities.set(line.product_name, (quantities.get(line.product_name) || 0) + line.quantity);
    }
  }

  const onlineRevenue = confirmedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const posRevenue = completedSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  res.json({
    period: { from, to },
    revenue: { total: onlineRevenue + posRevenue, online: onlineRevenue, inPerson: posRevenue },
    counts: { confirmedOrders: confirmedOrders.length, pendingOrders: pendingOrders.length, cancelledOrders: onlineOrders.filter(order => order.estado === 'cancelado').length, returnedOrders: onlineOrders.filter(order => order.estado === 'devuelto').length, inPersonSales: completedSales.length },
    lowStock: lowStock.map(row => ({ variantId: row.id, product: row.products.nombre, size: row.talle, stock: row.stock, minimum: row.stock_minimo })),
    outOfStock: lowStock.filter(row => row.stock === 0).map(row => ({ variantId: row.id, product: row.products.nombre, size: row.talle })),
    topProducts: [...quantities.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    projectsInProgress: projectRows.filter(project => project.status === 'en_curso').length,
    overdueTasks: taskRows.filter(task => task.status !== 'completada' && task.due_date && task.due_date < today).length,
    recentOrders: ordersResult.data || [],
    recentSales: salesResult.data || [],
  });
});

// ---------------------------------------------------------------------
// PASO 3 y 4 — Crear pedido + preferencia de pago de Mercado Pago
// El precio y el total los calcula el SERVIDOR, nunca se confía en el navegador.
// ---------------------------------------------------------------------
async function crearPreferenciaMP(pedidoId, lineas, costoEnvio) {
  const items = lineas.map(l => ({
    title: `${l.nombre} (Talle ${l.talle})`,
    quantity: l.cantidad,
    unit_price: l.precio_unitario,
    currency_id: 'ARS'
  }));
  if (costoEnvio > 0) {
    items.push({ title: 'Envío', quantity: 1, unit_price: costoEnvio, currency_id: 'ARS' });
  }

  // Vuelve al punto de entrada configurado, que puede ser la aplicación React.
  const volver = `${FRONT_URL}/`;
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      items,
      external_reference: String(pedidoId),
      back_urls: { success: volver, failure: volver, pending: volver },
      statement_descriptor: 'ELITE SPORT'
    })
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Error al crear el pago en Mercado Pago');
  return data;
}

async function cancelarPedido(id) {
  // Comprueba el resultado real del cambio; no informa cancelación si la base no la confirmó.
  const { data, error } = await supabase.from('orders')
    .update({ estado: 'cancelado' }).eq('id', id).eq('estado', 'pendiente')
    .select('id, estado').maybeSingle();
  if (error) throw new Error('No se pudo cancelar el pedido');
  if (data) return data.estado;
  const { data: actual, error: readError } = await supabase.from('orders')
    .select('estado').eq('id', id).maybeSingle();
  if (readError || !actual) throw new Error('No se pudo consultar el estado del pedido');
  return actual.estado;
}

async function crearPedido(req, res) {
  try {
    const { items, envio } = req.body;

    // Valida estructura, cantidad y dirección; el precio y el stock se leen de la base real.
    const validationError = validarPedido(items, envio);
    if (validationError) return res.status(400).json({ error: validationError });
    const e = envio;

    // 2. Buscar variantes reales (precio y stock salen de la base de datos)
    // Une líneas repetidas del mismo talle para validar el total contra una sola existencia.
    const cantidades = new Map();
    for (const item of items) {
      const key = `${item.id}:${item.size.trim()}`;
      cantidades.set(key, (cantidades.get(key) || 0) + item.qty);
    }
    if ([...cantidades.values()].some((quantity) => quantity > 10)) {
      return res.status(400).json({ error: 'La cantidad máxima por talle es 10 unidades' });
    }
    const ids = [...new Set(items.map(i => i.id))];
    const { data: variantes, error: errVar } = await supabase
      .from('product_variants')
      .select('id, talle, stock, product_id, products(nombre, precio, activo)')
      .in('product_id', ids);
    if (errVar) {
      console.error('No se pudieron consultar las variantes para el pedido:', errVar.message);
      return res.status(500).json({ error: 'No se pudo validar la disponibilidad de los productos' });
    }

    const lineas = [];
    for (const [key, quantity] of cantidades) {
      const separator = key.indexOf(':');
      const productId = Number(key.slice(0, separator));
      const size = key.slice(separator + 1);
      const v = variantes.find(x => x.product_id === productId && x.talle === size);
      if (!v || !v.products.activo) {
        return res.status(400).json({ error: 'Un producto del carrito ya no está disponible' });
      }
      if (v.stock < quantity) {
        return res.status(409).json({ error: `Sin stock suficiente de "${v.products.nombre}" (talle ${v.talle})` });
      }
      lineas.push({
        variant_id: v.id,
        cantidad: quantity,
        precio_unitario: Number(v.products.precio),
        nombre: v.products.nombre,
        talle: v.talle
      });
    }

    // 3. Calcular totales según las reglas de negocio
    const subtotal = lineas.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0);
    const costoEnvio = subtotal >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO;
    const total = subtotal + costoEnvio;

    // 4. Crear el pedido (queda "pendiente" hasta que se confirme el pago)
    const { data: pedido, error: errPed } = await supabase
      .from('orders')
      .insert({
        customer_id: req.user.id,
        canal: 'online',
        estado: 'pendiente',
        subtotal,
        envio: costoEnvio,
        total,
        medio_de_pago: 'mercadopago',
        direccion_envio: {
          nombre: e.nombre || '', apellido: e.apellido || '',
          direccion: e.direccion, ciudad: e.ciudad, cp: e.cp, telefono: e.telefono
        }
      })
      .select()
      .single();
    if (errPed) {
      console.error('No se pudo crear el pedido:', errPed.message);
      return res.status(500).json({ error: 'No se pudo crear el pedido' });
    }

    // 5. Insertar ítems: el trigger descuenta el stock. Si falta stock, se revierte todo.
    const { error: errItems } = await supabase
      .from('order_items')
      .insert(lineas.map(l => ({
        order_id: pedido.id,
        variant_id: l.variant_id,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario
      })));
    if (errItems) {
      await supabase.from('orders').delete().eq('id', pedido.id);
      return res.status(409).json({ error: 'No hay stock suficiente para completar la compra' });
    }

    // 6. Crear el pago en Mercado Pago
    let pref;
    try {
      pref = await crearPreferenciaMP(pedido.id, lineas, costoEnvio);
      if (typeof pref?.init_point !== 'string' || !/^https:\/\//i.test(pref.init_point)) {
        throw new Error('Mercado Pago no devolvió un enlace de pago válido');
      }
    } catch (err) {
      console.error('No se pudo crear la preferencia de Mercado Pago:', err.message);
      let reservaLiberada = false;
      try { reservaLiberada = (await cancelarPedido(pedido.id)) === 'cancelado'; }
      catch (cancelError) { console.error('No se pudo liberar la reserva del pedido:', cancelError.message); }
      return res.status(502).json({ error: reservaLiberada
        ? 'No se pudo iniciar el pago; el pedido fue cancelado y podés intentar nuevamente.'
        : 'No se pudo iniciar el pago ni confirmar la liberación de stock. Consultá el estado del pedido antes de reintentar.' });
    }

    res.json({ orderId: pedido.id, init_point: pref.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// La ruta versionada es la que usa React; se conserva también el endpoint legado.
app.post('/api/pedidos', requireAuth, crearPedido);
app.post('/api/v1/orders', requireAuth, crearPedido);

// ---------------------------------------------------------------------
// Confirmar el pago: el backend le pregunta a Mercado Pago (no confía en la URL)
// ---------------------------------------------------------------------
async function confirmarPagoPedido(req, res) {
  try {
    const id = Number(req.params.id);
    const paymentId = String(req.body.payment_id || '');
    if (!Number.isSafeInteger(id) || id < 1 || !/^\d+$/.test(paymentId)) {
      return res.status(400).json({ error: 'Datos de pago inválidos' });
    }

    const { data: pedido, error: pedidoError } = await supabase
      .from('orders').select('*')
      .eq('id', id).eq('customer_id', req.user.id).maybeSingle();
    if (pedidoError) return res.status(500).json({ error: 'No se pudo consultar el pedido' });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (pedido.estado !== 'pendiente') {
      return res.json({ estado: pedido.estado, orderId: id });
    }

    const resultado = await verificarYAplicarPago({
      pedido,
      paymentId,
      consultarPago: async (idPago) => {
        const respuesta = await fetch(`https://api.mercadopago.com/v1/payments/${idPago}`, {
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
        });
        if (!respuesta.ok) throw new Error('Consulta de pago no aceptada');
        return respuesta.json();
      },
      // El filtro estado=pendiente hace que callbacks concurrentes no apliquen dos transiciones.
      actualizarPedidoPendiente: async ({ pedidoId, paymentId: idPago }) => {
        const { data, error } = await supabase.from('orders')
          .update({ estado: 'pagado', mp_payment_id: idPago })
          .eq('id', pedidoId).eq('estado', 'pendiente').select('estado').maybeSingle();
        if (error) throw new Error('No se pudo guardar la confirmación del pago');
        return data;
      },
      consultarEstado: async (pedidoId) => {
        const { data, error } = await supabase.from('orders').select('estado').eq('id', pedidoId).maybeSingle();
        if (error) throw new Error('No se pudo consultar el pedido');
        return data?.estado;
      }
    });

    if (resultado.tipo === 'error_consulta') return res.status(502).json({ error: 'No se pudo verificar el pago' });
    if (resultado.tipo === 'error_actualizacion') return res.status(500).json({ error: 'No se pudo guardar la confirmación del pago' });
    if (resultado.tipo === 'error_consulta_estado') return res.status(500).json({ error: 'No se pudo confirmar el estado del pedido' });
    if (resultado.tipo === 'pago_invalido') {
      if (resultado.motivo === 'estado') {
        console.error('Mercado Pago devolvió un estado no reconocido para el pedido', id);
        return res.status(502).json({ error: 'Mercado Pago devolvió un estado de pago no reconocido; el pedido sigue pendiente' });
      }
      const mensaje = resultado.motivo === 'referencia'
        ? 'El pago no corresponde a este pedido'
        : resultado.motivo === 'moneda'
          ? 'La moneda del pago no coincide con el pedido'
          : 'El monto pagado no coincide con el pedido';
      return res.status(400).json({ error: mensaje });
    }
    // La confirmación depende de consulta servidor a servidor y actualización condicional persistida.
    res.json({ estado: resultado.estado, orderId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

app.post('/api/pedidos/:id/confirmar-pago', requireAuth, confirmarPagoPedido);
app.post('/api/v1/orders/:id/confirm-payment', requireAuth, confirmarPagoPedido);

// Cancelar un pedido pendiente (si el cliente vuelve sin pagar)
async function cancelarPedidoCliente(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Pedido inválido' });

  const { data: pedido, error } = await supabase
    .from('orders').select('id, estado')
    .eq('id', id).eq('customer_id', req.user.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'No se pudo consultar el pedido' });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  try {
    const estado = await cancelarPedido(id);
    res.json({ estado, orderId: id });
  } catch (cancelError) {
    console.error('No se pudo cancelar el pedido:', cancelError.message);
    res.status(500).json({ error: 'No se pudo cancelar el pedido' });
  }
}

app.post('/api/pedidos/:id/cancelar', requireAuth, cancelarPedidoCliente);
app.post('/api/v1/orders/:id/cancel', requireAuth, cancelarPedidoCliente);

// El servidor filtra por el ID del usuario autenticado para no depender de RLS en el navegador.
async function listarPedidosCliente(req, res) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, estado, total, subtotal, envio, created_at, medio_de_pago, direccion_envio,
      order_items (
        cantidad, precio_unitario,
        product_variants ( talle, products ( nombre, imagen_url ) )
      )
    `)
    .eq('customer_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('No se pudieron consultar los pedidos del cliente:', error.message);
    return res.status(500).json({ error: 'No se pudieron cargar los pedidos' });
  }
  res.json(data || []);
}

app.get('/api/v1/orders', requireAuth, listarPedidosCliente);

// Mantiene errores de API en JSON y evita enviar mensajes internos o consultas al navegador.
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de API inexistente' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Error no controlado en la API:', error.message);
  res.status(Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500)
    .json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => console.log('Backend corriendo en http://localhost:' + PORT));
