import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const api = import.meta.env.VITE_API_URL || '/api/v1';
const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);

export default function AdminOrdersPage({ onlineOnly = false }) {
  const auth = useAuth();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [exportOrders, setExportOrders] = useState(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const token = await auth.getAccessToken();
      const params = new URLSearchParams({ limit: '30', page: String(page) });
      if (onlineOnly) params.set('canal', 'online');
      if (status) params.set('estado', status);
      if (search) params.set('q', search);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const [response, summaryResponse] = await Promise.all([
        fetch(`${api}/admin/orders?${params}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }),
        fetch(`${api}/admin/orders/summary`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }),
      ]);
      const [data, summaryData] = await Promise.all([response.json().catch(() => ({})), summaryResponse.json().catch(() => ({}))]);
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los pedidos.');
      if (!summaryResponse.ok) throw new Error(summaryData.error || 'No se pudieron calcular los indicadores de pedidos.');
      setOrders(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setSummary(summaryData);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (auth.user && auth.role === 'administrador' && auth.roleReady) load(); }, [auth.user, auth.role, auth.roleReady, status, onlineOnly, page, search, from, to]);
  const visibleOrders = orders.filter((order) => !query || String(order.id).includes(query.trim()));
  const title = onlineOnly ? 'Ventas online' : 'Pedidos';

  useEffect(() => {
    if (!exportOrders) return;
    document.body.classList.add('admin-orders-export-mode');
    const timer = window.setTimeout(() => {
      window.addEventListener('afterprint', () => { document.body.classList.remove('admin-orders-export-mode'); setExportOrders(null); }, { once: true });
      window.print();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [exportOrders]);

  function printTicket(order) {
    setSelectedOrder(order);
    document.body.classList.add('admin-order-ticket-mode');
    window.addEventListener('afterprint', () => document.body.classList.remove('admin-order-ticket-mode'), { once: true });
    window.print();
  }

  async function exportOnline() {
    try {
      const token = await auth.getAccessToken();
      const params = new URLSearchParams(); if (from) params.set('from', from); if (to) params.set('to', to); if (status) params.set('estado', status); if (search) params.set('q', search);
      const response = await fetch(`${api}/admin/orders/export?${params}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo preparar el reporte.');
      setExportOrders(data);
    } catch (requestError) { setError(requestError.message); }
  }

  async function updateStatus(order, nextStatus) {
    try {
      const token = await auth.getAccessToken();
      const response = await fetch(`${api}/admin/orders/${order.id}/status`, { method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: nextStatus }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el estado.');
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, estado: data.estado } : item));
      await load();
    } catch (requestError) { setError(requestError.message); }
  }

  return <main className="staff-page admin-content"><div className="staff-page-heading"><div><p className="section-eyebrow">COMERCIO ELECTRÓNICO</p><h1>{title}</h1><p>{onlineOnly ? 'Pedidos del canal online registrados en el sistema.' : 'Consulta de pedidos y estados persistidos en la plataforma.'}</p></div><button className="btn btn-outline-dark" onClick={load} disabled={loading}>{loading ? 'CARGANDO…' : 'ACTUALIZAR'}</button></div>
    <form className="staff-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}><label>Buscar número de pedido<input inputMode="numeric" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: 1042" /></label><label>Estado<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos</option>{['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado', 'devuelto'].map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><label>Desde<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label>Hasta<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label><button className="btn btn-primary" disabled={loading}>BUSCAR</button>{onlineOnly && <button type="button" className="btn btn-outline-dark" onClick={exportOnline}>IMPRIMIR / GUARDAR PDF</button>}</form>
    {error && <p className="react-form-error" role="alert">{error}</p>}
    {summary && <section className="report-cards admin-order-metrics"><article className="staff-card"><span>Total de pedidos</span><strong>{summary.total}</strong></article><article className="staff-card"><span>Pedidos pendientes</span><strong>{summary.pending}</strong></article><article className="staff-card"><span>Pedidos hoy</span><strong>{summary.today}</strong></article><article className="staff-card"><span>Facturación confirmada</span><strong>{money(summary.revenue)}</strong></article></section>}
    {loading && !orders.length && <p className="staff-empty" role="status">Cargando pedidos…</p>}
    <section className="staff-card"><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>#</th><th>Pedido</th><th>Fecha</th><th>Canal</th><th>Estado</th><th>Medio de pago</th><th>Artículos</th><th>Total</th><th>Acciones</th></tr></thead><tbody>{visibleOrders.map((order) => <tr key={order.id}><td>{order.id}</td><td><button className="admin-order-detail" type="button" onClick={() => setSelectedOrder((current) => current?.id === order.id ? null : order)}>#{order.id}</button></td><td>{new Date(order.created_at).toLocaleString('es-AR')}</td><td><span className="admin-channel-dot">●</span> {order.canal || '—'}</td><td><span className={`admin-status admin-status--${order.estado}`}>{order.estado}</span></td><td>{order.medio_de_pago || '—'}</td><td>{(order.order_items || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0)}</td><td><strong>{money(order.total)}</strong></td><td>{order.estado === 'pagado' ? <button className="admin-action-button" onClick={() => updateStatus(order, 'enviado')}>Marcar enviado</button> : order.estado === 'enviado' ? <button className="admin-action-button" onClick={() => updateStatus(order, 'entregado')}>Marcar entregado</button> : order.estado === 'pendiente' ? <small>Pago pendiente</small> : '—'}</td></tr>)}</tbody></table></div>
      {selectedOrder && <div className="admin-order-lines"><div className="project-title-row"><h2>Detalle del pedido #{selectedOrder.id}</h2>{onlineOnly && <button className="admin-action-button" onClick={() => printTicket(selectedOrder)}>IMPRIMIR / GUARDAR TICKET</button>}</div><p>Cliente #{selectedOrder.customer_id || '—'} · Envío: {Object.values(selectedOrder.direccion_envio || {}).filter(Boolean).join(', ') || 'Sin domicilio guardado'}</p>{(selectedOrder.order_items || []).map((line, index) => <p key={`${selectedOrder.id}-${index}`}>{line.product_variants?.products?.nombre || 'Producto'} · talle {line.product_variants?.talle || '—'}{line.product_variants?.color ? ` · ${line.product_variants.color}` : ''} · × {line.cantidad} · {money(line.precio_unitario)} c/u</p>)}<strong>Subtotal: {money(selectedOrder.subtotal)} · Envío: {money(selectedOrder.envio)} · Total: {money(selectedOrder.total)}</strong></div>}
      {!loading && visibleOrders.length === 0 && <p className="staff-empty">{search || status ? 'No hay pedidos que coincidan con esos filtros.' : 'Todavía no hay pedidos registrados.'}</p>}
      {total > 30 && <div className="admin-pagination"><span>{(page - 1) * 30 + 1}–{Math.min(page * 30, total)} de {total}</span><button className="btn btn-outline-dark" disabled={loading || page === 1} onClick={() => setPage((value) => value - 1)}>ANTERIOR</button><button className="btn btn-outline-dark" disabled={loading || page * 30 >= total} onClick={() => setPage((value) => value + 1)}>SIGUIENTE</button></div>}</section>
    {selectedOrder && <section className="admin-order-print"><img className="admin-print-logo" src="/img/logo-elite-sport.png" alt="Élite Sport" /><h1>Élite Sport · Pedido #{selectedOrder.id}</h1><p>{new Date(selectedOrder.created_at).toLocaleString('es-AR')} · {selectedOrder.estado} · {selectedOrder.medio_de_pago || '—'}</p><p>Cliente #{selectedOrder.customer_id || '—'} · {Object.values(selectedOrder.direccion_envio || {}).filter(Boolean).join(', ') || 'Sin domicilio guardado'}</p><table><thead><tr><th>Producto</th><th>Variante</th><th>Cantidad</th><th>Precio unitario</th><th>Subtotal</th></tr></thead><tbody>{(selectedOrder.order_items || []).map((line, index) => <tr key={index}><td>{line.product_variants?.products?.nombre || 'Producto'}</td><td>{line.product_variants?.talle || '—'}{line.product_variants?.color ? ` · ${line.product_variants.color}` : ''}</td><td>{line.cantidad}</td><td>{money(line.precio_unitario)}</td><td>{money(Number(line.precio_unitario) * Number(line.cantidad))}</td></tr>)}</tbody></table><p>Subtotal: {money(selectedOrder.subtotal)} · Envío: {money(selectedOrder.envio)}</p><strong>Total: {money(selectedOrder.total)}</strong></section>}
    {exportOrders && <section className="admin-orders-print-content"><img className="admin-print-logo" src="/img/logo-elite-sport.png" alt="Élite Sport" /><h1>Reporte de ventas online · Élite Sport</h1><p>Período: {exportOrders.period.from || 'Inicio'} al {exportOrders.period.to || 'Hoy'} · Estado: {status || 'Todos'} · Registros: {exportOrders.orders.length}</p><p>Confirmadas: {money(exportOrders.orders.filter((order) => ['pagado', 'enviado', 'entregado'].includes(order.estado)).reduce((sum, order) => sum + Number(order.total), 0))} · Pendientes: {exportOrders.orders.filter((order) => order.estado === 'pendiente').length} · Canceladas: {exportOrders.orders.filter((order) => ['cancelado', 'devuelto'].includes(order.estado)).length}</p><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Artículos</th><th>Medio de pago</th><th>Estado</th><th>Total</th></tr></thead><tbody>{exportOrders.orders.map((order) => <tr key={order.id}><td>#{order.id}</td><td>{new Date(order.created_at).toLocaleString('es-AR')}</td><td>{(order.order_items || []).map((line) => `${line.product_variants?.products?.nombre || 'Producto'} ${line.product_variants?.talle || ''} × ${line.cantidad}`).join('; ')}</td><td>{order.medio_de_pago || '—'}</td><td>{order.estado}</td><td>{money(order.total)}</td></tr>)}</tbody></table></section>}
  </main>;
}
