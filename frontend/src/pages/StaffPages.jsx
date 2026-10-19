// Contiene las vistas de inventario y POS; las operaciones sensibles siempre se autorizan en Express.
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { finishPosDraft, readPosDraft, savePosDraft } from '../services/request-key.js';

const api = import.meta.env.VITE_API_URL || '/api/v1';
const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);

async function apiRequest(path, token, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return data;
}

// Restringe la navegación de interfaz y comunica por qué un usuario no puede abrir el módulo.
export function ProtectedStaffPage({ children }) {
  const auth = useAuth();
  if (!auth.ready || (auth.user && !auth.roleReady)) return <main className="staff-page"><p role="status">Verificando sesión y permisos…</p></main>;
  if (!auth.user) return <main className="staff-page"><h1>Iniciá sesión</h1><p>Este módulo está disponible para personal autorizado.</p></main>;
  if (!['administrador', 'empleado'].includes(auth.role)) return <main className="staff-page"><h1>Acceso restringido</h1><p>Tu cuenta no tiene permisos de personal. Un administrador debe asignar el rol desde el proceso autorizado.</p></main>;
  return children;
}

// Aísla pantallas de administración y usa el rol de servidor solo para navegación, no como única barrera.
export function ProtectedAdminPage({ children }) {
  const auth = useAuth();
  if (!auth.ready || (auth.user && !auth.roleReady)) return <main className="staff-page"><p role="status">Verificando sesión y permisos…</p></main>;
  if (!auth.user || auth.role !== 'administrador') return <main className="staff-page"><h1>Acceso restringido</h1><p>Esta pantalla requiere una cuenta administradora.</p></main>;
  return children;
}

export function InventoryPage() {
  const auth = useAuth();
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('');
  const [movementFrom, setMovementFrom] = useState('');
  const [movementTo, setMovementTo] = useState('');
  const [variantId, setVariantId] = useState('');
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [minimums, setMinimums] = useState({});
  const [editingProduct, setEditingProduct] = useState(null);

  // Carga existencias y su trazabilidad desde Supabase a través de rutas protegidas.
  async function loadInventory(search = query, sportFilter = sport, from = movementFrom, to = movementTo) {
    const token = await auth.getAccessToken();
    const inventoryParams = new URLSearchParams({ q: search });
    if (sportFilter) inventoryParams.set('sport', sportFilter);
    const movementParams = new URLSearchParams({ limit: '20' });
    if (from) movementParams.set('from', from);
    if (to) movementParams.set('to', to);
    const [inventory, history] = await Promise.all([
      apiRequest(`/inventory?${inventoryParams}`, token),
      apiRequest(`/inventory/movements?${movementParams}`, token),
    ]);
    setItems(inventory.items || []);
    setMovements(history);
  }

  useEffect(() => {
    if (!auth.user || !auth.roleReady || !['administrador', 'empleado'].includes(auth.role)) return;
    let active = true;
    const timer = window.setTimeout(() => loadInventory().catch((requestError) => { if (active) setError(requestError.message); }), 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [auth.user, auth.role, auth.roleReady, query, sport, movementFrom, movementTo]);

  // Registra entradas y salidas con motivo; el procedimiento SQL evita dejar stock negativo.
  async function submitMovement(event) {
    event.preventDefault();
    const amount = Number(delta);
    if (!variantId || !Number.isInteger(amount) || amount === 0 || !reason.trim()) { setError('Elegí una variante, una cantidad distinta de cero y un motivo.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const token = await auth.getAccessToken();
      const result = await apiRequest('/inventory/movements', token, { method: 'POST', body: JSON.stringify({ variantId: Number(variantId), delta: amount, reason }) });
      setNotice(`Movimiento registrado. Stock actualizado: ${result.stock_after}.`);
      setReason('');
      await loadInventory();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  // El mínimo solo genera alertas; cambiarlo no altera el stock disponible.
  async function saveMinimum(row) {
    const stockMinimo = Number(minimums[row.id] ?? row.stock_minimo);
    if (!Number.isInteger(stockMinimo) || stockMinimo < 0) { setError('El stock mínimo debe ser un número entero no negativo.'); return; }
    setError('');
    try {
      const token = await auth.getAccessToken();
      await apiRequest(`/inventory/variants/${row.id}/minimum`, token, { method: 'PATCH', body: JSON.stringify({ stockMinimo }) });
      setNotice('Stock mínimo actualizado.');
      await loadInventory();
    } catch (requestError) { setError(requestError.message); }
  }

  // Edita campos que el catálogo actual ya conoce y conserva la desactivación lógica.
  async function saveProduct(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const changes = { nombre: form.get('nombre'), descripcion: form.get('descripcion'), precio: Number(form.get('precio')), activo: form.get('activo') === 'true' };
    try {
      const token = await auth.getAccessToken();
      await apiRequest(`/products/${editingProduct.id}`, token, { method: 'PATCH', body: JSON.stringify(changes) });
      setNotice('Producto actualizado en el catálogo.');
      setEditingProduct(null);
      await loadInventory();
    } catch (requestError) { setError(requestError.message); }
  }

  // Crea una variante con stock inicial registrado por la función SQL transaccional.
  async function createVariant(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const token = await auth.getAccessToken();
      await apiRequest('/inventory/variants', token, { method: 'POST', body: JSON.stringify({ productId: Number(form.get('productId')), size: form.get('size'), initialStock: Number(form.get('initialStock')), minimum: Number(form.get('minimum')) }) });
      setNotice('Variante creada; el stock inicial quedó registrado.');
      formElement.reset();
      await loadInventory();
    } catch (requestError) { setError(requestError.message); }
  }

  return <main className="staff-page"><div className="staff-page-heading"><div><p className="section-eyebrow">GESTIÓN DE TIENDA</p><h1>Inventario</h1><p>Existencias por producto y talle, con movimientos auditados.</p></div></div>
    <div className="staff-filters"><label>Buscar producto<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre del producto" /></label><label>Deporte/categoría<select value={sport} onChange={(event) => setSport(event.target.value)}><option value="">Todos</option>{['tenis', 'golf', 'equitacion', 'natacion', 'remo', 'hockey'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Movimientos desde<input type="date" value={movementFrom} onChange={(event) => setMovementFrom(event.target.value)} /></label><label>Hasta<input type="date" value={movementTo} onChange={(event) => setMovementTo(event.target.value)} /></label></div>
    {error && <p className="react-form-error" role="alert">{error}</p>}{notice && <p className="react-form-success" role="status">{notice}</p>}
    <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Producto</th><th>Deporte</th><th>Talle</th><th>Stock</th><th>Mínimo</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}>
      <td>{row.products?.nombre || 'Producto'}</td><td>{row.products?.sports?.slug || '—'}</td><td>{row.talle}</td><td>{row.stock}</td><td>{auth.role === 'administrador' ? <div className="minimum-control"><input aria-label={`Stock mínimo ${row.products?.nombre} talle ${row.talle}`} type="number" min="0" value={minimums[row.id] ?? row.stock_minimo} onChange={(event) => setMinimums((current) => ({ ...current, [row.id]: event.target.value }))} /><button onClick={() => saveMinimum(row)}>Guardar</button></div> : row.stock_minimo}</td><td>{money(row.products?.precio)}</td><td>{row.stock === 0 ? 'Agotado' : row.stock <= row.stock_minimo ? 'Stock bajo' : 'Disponible'}</td><td>{auth.role === 'administrador' && <button className="react-remove" onClick={() => setEditingProduct(row.products)}>Editar</button>}</td>
    </tr>)}</tbody></table>{items.length === 0 && <p className="staff-empty">No hay variantes para mostrar.</p>}</div>
    <section className="staff-card"><h2>Registrar movimiento</h2><form className="staff-form" onSubmit={submitMovement}>
      <label>Variante<select value={variantId} onChange={(event) => setVariantId(event.target.value)} required><option value="">Seleccioná producto y talle</option>{items.map((row) => <option key={row.id} value={row.id}>{row.products?.nombre} · {row.talle} · stock {row.stock}</option>)}</select></label>
      <label>Cantidad (negativa para salida)<input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} min="-10000" max="10000" step="1" required /></label>
      <label>Motivo<input value={reason} onChange={(event) => setReason(event.target.value)} minLength="3" maxLength="500" required /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? 'REGISTRANDO…' : 'REGISTRAR MOVIMIENTO'}</button>
    </form></section>
    {auth.role === 'administrador' && <section className="staff-card"><h2>Crear variante</h2><p>Seleccioná un producto existente; el alta de productos y categorías requiere definir las columnas de relación deportiva que usa Supabase.</p><form className="staff-form" onSubmit={createVariant}><label>Producto<select name="productId" required>{[...new Map(items.map((row) => [row.products?.id, row.products])).values()].filter(Boolean).map((product) => <option key={product.id} value={product.id}>{product.nombre}</option>)}</select></label><label>Talle<input name="size" required maxLength="40" /></label><label>Stock inicial<input name="initialStock" type="number" min="0" max="100000" defaultValue="0" required /></label><label>Stock mínimo<input name="minimum" type="number" min="0" max="100000" defaultValue="0" required /></label><button className="btn btn-primary">CREAR VARIANTE</button></form></section>}
    {editingProduct && <div className="react-scrim" onClick={() => setEditingProduct(null)}><section className="react-form-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-product-title" onClick={(event) => event.stopPropagation()}><button className="react-modal-close" onClick={() => setEditingProduct(null)} aria-label="Cerrar">×</button><h2 id="edit-product-title">Editar producto</h2><form onSubmit={saveProduct} key={editingProduct.id}><label>Nombre<input name="nombre" defaultValue={editingProduct.nombre} required /></label><label>Descripción<input name="descripcion" defaultValue={editingProduct.descripcion} /></label><label>Precio<input name="precio" type="number" min="1" step="0.01" defaultValue={editingProduct.precio} required /></label><label>Estado<select name="activo" defaultValue={String(editingProduct.activo)}><option value="true">Activo</option><option value="false">Desactivado</option></select></label><button className="btn btn-primary btn-full">GUARDAR CAMBIOS</button></form></section></div>}
    <section className="staff-card"><h2>Movimientos recientes</h2><ul className="staff-movements">{movements.map((movement) => <li key={movement.id}><strong>{movement.product_variants?.products?.nombre || `Variante ${movement.variant_id}`} · {movement.product_variants?.talle}</strong><span>{movement.cantidad > 0 ? '+' : ''}{movement.cantidad} unidades · {movement.stock_anterior} → {movement.stock_actual}</span><small>{movement.motivo} · {new Date(movement.created_at).toLocaleString('es-AR')}</small></li>)}</ul>{!movements.length && <p className="staff-empty">No hay movimientos registrados.</p>}</section>
  </main>;
}

export function PosPage() {
  const auth = useAuth();
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [query, setQuery] = useState('');
  const [initialDraft] = useState(() => readPosDraft(localStorage, window.crypto, auth.user?.id));
  const [cart, setCart] = useState(initialDraft.cart);
  const [paymentMethod, setPaymentMethod] = useState(initialDraft.paymentMethod);
  const [requestKey, setRequestKey] = useState(initialDraft.requestKey);
  const [pendingOperation, setPendingOperation] = useState(initialDraft.pending);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const estimatedTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);

  // El catálogo interno y el historial se cargan desde rutas que exigen un rol de personal.
  async function loadPos(search = query) {
    const token = await auth.getAccessToken();
    const [stock, history] = await Promise.all([
      apiRequest(`/inventory?q=${encodeURIComponent(search)}&pageSize=100`, token),
      apiRequest('/sales?limit=20', token),
    ]);
    setInventory(stock.items || []);
    setSales(history || []);
    return history || [];
  }

  useEffect(() => {
    if (!auth.user || !auth.roleReady || !['administrador', 'empleado'].includes(auth.role)) return;
    let active = true;
    const timer = window.setTimeout(() => loadPos(query).catch((requestError) => { if (active) setError(requestError.message); }), 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [auth.user, auth.role, auth.roleReady, query]);

  function addVariant(row) {
    if (row.stock <= 0 || pendingOperation || busy) return;
    setCart((current) => {
      const existing = current.find((line) => line.variantId === row.id);
      if (existing) return current.map((line) => line.variantId === row.id ? { ...line, qty: Math.min(row.stock, line.qty + 1) } : line);
      return [...current, { variantId: row.id, name: row.products?.nombre || 'Producto', size: row.talle, price: Number(row.products?.precio) || 0, qty: 1, available: row.stock }];
    });
  }

  function updateLine(item, delta) {
    if (!pendingOperation && !busy) setCart((current) => current.map((line) => line.variantId === item.variantId ? { ...line, qty: Math.min(line.available, Math.max(1, line.qty + delta)) } : line));
  }

  // Envía una clave estable para que un reintento con la misma operación no duplique la venta.
  async function confirmSale() {
    if (!cart.length || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const token = await auth.getAccessToken();
      // Persiste la misma clave y contenido antes de enviar la solicitud para permitir reintentos seguros.
      savePosDraft(localStorage, { requestKey, paymentMethod, items: cart }, auth.user?.id);
      setPendingOperation(true);
      const result = await apiRequest('/sales', token, { method: 'POST', body: JSON.stringify({ requestKey, paymentMethod, items: cart.map((line) => ({ variantId: line.variantId, qty: line.qty })) }) });
      setReceipt({ id: result.sale_id, total: Number(result.total), paymentMethod, items: cart, authoritativeLines: false });
      setCart([]);
      setNotice(result.repeated ? `La venta #${result.sale_id} ya se había registrado.` : `Venta #${result.sale_id} confirmada.`);
      setRequestKey(finishPosDraft(localStorage, window.crypto, auth.user?.id));
      setPendingOperation(false);
      const history = await loadPos();
      const savedSale = history.find((sale) => String(sale.id) === String(result.sale_id));
      if (savedSale) setReceipt({ id: savedSale.id, total: Number(savedSale.total), paymentMethod: savedSale.payment_method, authoritativeLines: true, items: (savedSale.sale_items || []).map((line) => ({ variantId: line.variant_id, name: line.product_name, size: line.size, qty: line.quantity, price: Number(line.unit_price) })) });
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.status >= 400 && requestError.status < 500) {
        // Un rechazo HTTP definitivo ocurre antes de registrar la venta; permite corregir el carrito.
        setRequestKey(finishPosDraft(localStorage, window.crypto, auth.user?.id));
        setPendingOperation(false);
      }
    }
    finally { setBusy(false); }
  }

  // Las reversiones están restringidas a administración en el frontend y se vuelven a autorizar en la API.
  async function reverseSale(sale, status) {
    const reason = window.prompt(`Motivo para ${status === 'anulada' ? 'anular' : 'devolver'} la venta #${sale.id}:`);
    if (!reason || reason.trim().length < 3) return;
    try {
      const token = await auth.getAccessToken();
      await apiRequest(`/sales/${sale.id}/reverse`, token, { method: 'POST', body: JSON.stringify({ status, reason: reason.trim() }) });
      setNotice(`Venta #${sale.id}: ${status}. Stock repuesto y operación auditada.`);
      await loadPos();
    } catch (requestError) { setError(requestError.message); }
  }

  return <main className="staff-page pos-page"><div className="staff-page-heading"><div><p className="section-eyebrow">VENTA PRESENCIAL</p><h1>Punto de venta</h1><p>El servidor valida precio y disponibilidad. El método de pago se registra como informado por el empleado.</p></div></div>
    <label className="staff-search">Buscar producto<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre del producto" /></label>
    {error && <p className="react-form-error" role="alert">{error}</p>}{notice && <p className="react-form-success" role="status">{notice}</p>}
      <div className="pos-layout"><section className="staff-card"><h2>Productos disponibles</h2><div className="pos-products">{inventory.map((row) => <article key={row.id}><div><strong>{row.products?.nombre}</strong><small>Talle {row.talle} · Stock {row.stock}</small><span>{money(row.products?.precio)}</span></div><button className="btn btn-outline-dark" disabled={row.stock < 1 || pendingOperation || busy} onClick={() => addVariant(row)}>{row.stock ? 'AGREGAR' : 'AGOTADO'}</button></article>)}</div>{inventory.length === 0 && <p className="staff-empty">No hay productos disponibles.</p>}</section>
      <section className="staff-card"><h2>Venta actual</h2>{pendingOperation && <p className="react-form-error" role="status">Hay una venta enviada sin respuesta confirmada. Reintentá la misma operación para consultar su resultado.</p>}{cart.length === 0 ? <p className="staff-empty">Agregá productos para iniciar una venta.</p> : <ul className="pos-cart">{cart.map((line) => <li key={line.variantId}><div><strong>{line.name}</strong><small>Talle {line.size} · {money(line.price)}</small></div><div className="qty-control"><button className="qty-btn" disabled={pendingOperation || busy} onClick={() => updateLine(line, -1)} aria-label="Restar">−</button><span>{line.qty}</span><button className="qty-btn" disabled={pendingOperation || busy} onClick={() => updateLine(line, 1)} aria-label="Sumar">+</button></div></li>)}</ul>}
        <label>Medio de pago informado<select disabled={pendingOperation || busy} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta (registrada, no verificada)</option><option value="transferencia">Transferencia (registrada, no verificada)</option><option value="otro">Otro</option></select></label>
        <div className="pos-total"><span>Total estimado</span><strong>{money(estimatedTotal)}</strong></div>
        <button className="btn btn-primary btn-full" onClick={confirmSale} disabled={!cart.length || busy}>{busy ? 'REGISTRANDO…' : pendingOperation ? 'REINTENTAR MISMA VENTA' : 'CONFIRMAR VENTA'}</button>
      </section></div>
    {receipt && <section className="staff-card pos-receipt"><h2>Comprobante de venta #{receipt.id}</h2><p>{new Date().toLocaleString('es-AR')} · Medio informado: {receipt.paymentMethod}</p>{receipt.items.map((line) => <p key={line.variantId}>{line.name} · Talle {line.size} × {line.qty}{receipt.authoritativeLines ? ` · ${money(line.price * line.qty)}` : ''}</p>)}{!receipt.authoritativeLines && <small>Importes por artículo pendientes de lectura del comprobante registrado.</small>}<strong>Total registrado por el servidor: {money(receipt.total)}</strong><button className="btn btn-outline-dark" onClick={() => window.print()}>IMPRIMIR COMPROBANTE</button></section>}
    <section className="staff-card"><h2>Ventas recientes</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Venta</th><th>Fecha</th><th>Empleado</th><th>Medio informado</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td>#{sale.id}</td><td>{new Date(sale.created_at).toLocaleString('es-AR')}</td><td>{sale.employee_id}</td><td>{sale.payment_method}</td><td>{sale.status}</td><td>{money(sale.total)}</td><td>{auth.role === 'administrador' && sale.status === 'completada' && <div className="sale-actions"><button onClick={() => reverseSale(sale, 'anulada')}>Anular</button><button onClick={() => reverseSale(sale, 'devuelta')}>Devolver</button></div>}</td></tr>)}</tbody></table></div>{sales.length === 0 && <p className="staff-empty">Todavía no hay ventas presenciales.</p>}</section>
  </main>;
}

// Gestiona invitaciones y estado laboral; la API asigna el rol y prohíbe modificaciones propias.
export function EmployeesPage() {
  const auth = useAuth();
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadEmployees() {
    const token = await auth.getAccessToken();
    setEmployees(await apiRequest('/employees', token));
  }

  useEffect(() => {
    if (!auth.user || auth.role !== 'administrador' || !auth.roleReady) return;
    loadEmployees().catch((requestError) => setError(requestError.message));
  }, [auth.user, auth.role, auth.roleReady]);

  // Supabase envía el enlace de invitación; la aplicación nunca recibe ni crea una contraseña manualmente.
  async function invite(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true); setError(''); setNotice('');
    try {
      const token = await auth.getAccessToken();
      await apiRequest('/employees/invite', token, { method: 'POST', body: JSON.stringify(values) });
      form.reset();
      setNotice('Invitación enviada y rol de empleado asignado.');
      await loadEmployees();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  // Activa o desactiva el acceso operativo sin borrar la cuenta ni su historial.
  async function toggle(employee) {
    setError('');
    try {
      const token = await auth.getAccessToken();
      await apiRequest(`/employees/${employee.id}`, token, { method: 'PATCH', body: JSON.stringify({ active: !employee.active }) });
      setNotice(`Acceso ${employee.active ? 'desactivado' : 'activado'} para ${employee.email}.`);
      await loadEmployees();
    } catch (requestError) { setError(requestError.message); }
  }

  // Un administrador puede cambiar el rol de otra cuenta, pero el backend impide modificar el propio.
  async function changeRole(employee, role) {
    try {
      const token = await auth.getAccessToken();
      await apiRequest(`/employees/${employee.id}`, token, { method: 'PATCH', body: JSON.stringify({ role }) });
      setNotice(`Rol actualizado para ${employee.email}.`);
      await loadEmployees();
    } catch (requestError) { setError(requestError.message); }
  }

  return <main className="staff-page"><div className="staff-page-heading"><div><p className="section-eyebrow">ADMINISTRACIÓN</p><h1>Empleados</h1><p>Las invitaciones y permisos se verifican en el backend.</p></div></div>
    {error && <p className="react-form-error" role="alert">{error}</p>}{notice && <p className="react-form-success" role="status">{notice}</p>}
    <section className="staff-card"><h2>Invitar empleado</h2><form className="staff-form project-form" onSubmit={invite}><label>Nombre<input name="nombre" required maxLength="100" /></label><label>Apellido<input name="apellido" required maxLength="100" /></label><label>Correo<input name="email" type="email" required /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'ENVIANDO…' : 'ENVIAR INVITACIÓN'}</button></form></section>
    <section className="staff-card"><h2>Personal</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Alta</th><th>Último acceso</th><th>Estado</th><th>Rol</th><th></th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td>{employee.nombre} {employee.apellido}</td><td>{employee.email}</td><td>{employee.created_at ? new Date(employee.created_at).toLocaleDateString('es-AR') : '—'}</td><td>{employee.last_sign_in_at ? new Date(employee.last_sign_in_at).toLocaleString('es-AR') : 'Sin ingreso'}</td><td>{employee.active ? 'Activo' : 'Inactivo'}</td><td><select defaultValue="empleado" aria-label={`Cambiar rol de ${employee.email}`} onChange={(event) => changeRole(employee, event.target.value)}><option value="empleado">Empleado</option><option value="administrador">Administrador</option><option value="cliente">Cliente</option></select></td><td><button className="btn btn-outline-dark" onClick={() => toggle(employee)}>{employee.active ? 'DESACTIVAR' : 'ACTIVAR'}</button></td></tr>)}</tbody></table></div>{employees.length === 0 && <p className="staff-empty">No hay empleados registrados.</p>}</section>
  </main>;
}
