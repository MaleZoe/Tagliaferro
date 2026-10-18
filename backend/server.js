// =====================================================================
// ÉLITE SPORT — Backend (Node.js + Express + Supabase + Mercado Pago)
// Archivo: backend/server.js
// =====================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, MP_ACCESS_TOKEN } = process.env;
const FRONT_URL = process.env.FRONT_URL || 'http://127.0.0.1:5500';
const PORT = process.env.PORT || 3000;

// Reglas de negocio (RN-01)
const ENVIO_GRATIS_DESDE = 50000;
const COSTO_ENVIO = 3500;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !MP_ACCESS_TOKEN) {
  console.error('Faltan variables en backend/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY, MP_ACCESS_TOKEN)');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

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
  next();
}

// ---------------------------------------------------------------------
// Rutas básicas
// ---------------------------------------------------------------------
app.get('/', (req, res) => res.send('API de Élite Sport funcionando'));
app.get('/api/salud', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------
// PASO 1 — Catálogo (formato igual al array PRODUCTS que usaba el frontend)
// ---------------------------------------------------------------------
app.get('/api/productos', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('id, nombre, descripcion, precio, precio_anterior, badge, imagen_url, sports(slug), product_variants(id, talle, stock)')
    .eq('activo', true)
    .order('id');

  if (error) return res.status(500).json({ error: error.message });

  const productos = data.map(p => {
    const variantes = [...p.product_variants].sort((a, b) => a.id - b.id);
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
      sport: p.sports.slug,
      sizes: variantes.map(v => v.talle),
      stock
    };
  });

  res.json(productos);
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

  const volver = `${FRONT_URL}/index.html`;
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
  // El trigger de la base de datos devuelve el stock automáticamente
  await supabase.from('orders').update({ estado: 'cancelado' }).eq('id', id).eq('estado', 'pendiente');
}

app.post('/api/pedidos', requireAuth, async (req, res) => {
  try {
    const { items, envio } = req.body;

    // 1. Validar datos recibidos
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'El carrito está vacío o es inválido' });
    }
    const e = envio || {};
    for (const campo of ['direccion', 'ciudad', 'cp', 'telefono']) {
      if (!String(e[campo] || '').trim()) {
        return res.status(400).json({ error: `Falta completar: ${campo}` });
      }
    }
    for (const it of items) {
      if (!Number.isInteger(it.id) || typeof it.size !== 'string' ||
          !Number.isInteger(it.qty) || it.qty < 1 || it.qty > 10) {
        return res.status(400).json({ error: 'Hay un producto inválido en el carrito' });
      }
    }

    // 2. Buscar variantes reales (precio y stock salen de la base de datos)
    const ids = [...new Set(items.map(i => i.id))];
    const { data: variantes, error: errVar } = await supabase
      .from('product_variants')
      .select('id, talle, stock, product_id, products(nombre, precio, activo)')
      .in('product_id', ids);
    if (errVar) return res.status(500).json({ error: errVar.message });

    const lineas = [];
    for (const it of items) {
      const v = variantes.find(x => x.product_id === it.id && x.talle === it.size);
      if (!v || !v.products.activo) {
        return res.status(400).json({ error: 'Un producto del carrito ya no está disponible' });
      }
      if (v.stock < it.qty) {
        return res.status(409).json({ error: `Sin stock suficiente de "${v.products.nombre}" (talle ${v.talle})` });
      }
      lineas.push({
        variant_id: v.id,
        cantidad: it.qty,
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
    if (errPed) return res.status(500).json({ error: errPed.message });

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
    } catch (err) {
      await cancelarPedido(pedido.id);
      return res.status(502).json({ error: err.message });
    }

    res.json({ orderId: pedido.id, init_point: pref.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ---------------------------------------------------------------------
// Confirmar el pago: el backend le pregunta a Mercado Pago (no confía en la URL)
// ---------------------------------------------------------------------
app.post('/api/pedidos/:id/confirmar-pago', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const paymentId = String(req.body.payment_id || '');
    if (!Number.isInteger(id) || !/^\d+$/.test(paymentId)) {
      return res.status(400).json({ error: 'Datos de pago inválidos' });
    }

    const { data: pedido } = await supabase
      .from('orders').select('*')
      .eq('id', id).eq('customer_id', req.user.id).single();
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (pedido.estado !== 'pendiente') {
      return res.json({ estado: pedido.estado, orderId: id });
    }

    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    const pago = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'No se pudo verificar el pago' });

    if (String(pago.external_reference) !== String(id)) {
      return res.status(400).json({ error: 'El pago no corresponde a este pedido' });
    }

    if (pago.status === 'approved') {
      if (Number(pago.transaction_amount) < Number(pedido.total)) {
        return res.status(400).json({ error: 'El monto pagado no coincide con el pedido' });
      }
      await supabase.from('orders')
        .update({ estado: 'pagado', mp_payment_id: paymentId })
        .eq('id', id).eq('estado', 'pendiente');
      return res.json({ estado: 'pagado', orderId: id });
    }

    if (pago.status === 'rejected' || pago.status === 'cancelled') {
      await cancelarPedido(id);
      return res.json({ estado: 'cancelado', orderId: id });
    }

    // in_process / pending: queda pendiente
    res.json({ estado: 'pendiente', orderId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Cancelar un pedido pendiente (si el cliente vuelve sin pagar)
app.post('/api/pedidos/:id/cancelar', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Pedido inválido' });

  const { data: pedido } = await supabase
    .from('orders').select('id, estado')
    .eq('id', id).eq('customer_id', req.user.id).single();
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

  await cancelarPedido(id);
  res.json({ estado: 'cancelado', orderId: id });
});

app.listen(PORT, () => console.log('Backend corriendo en http://localhost:' + PORT));