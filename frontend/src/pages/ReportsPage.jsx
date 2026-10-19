// Presenta indicadores calculados por el backend a partir de pedidos, ventas e inventario persistidos.
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const api = import.meta.env.VITE_API_URL || '/api/v1';
const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);

export default function ReportsPage() {
  const auth = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Solicita indicadores del período; la consulta y los totales se calculan en la API.
  async function load() {
    setBusy(true); setError('');
    try {
      const token = await auth.getAccessToken();
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const response = await fetch(`${api}/reports/summary?${params}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los reportes.');
      setReport(data);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (auth.user && auth.role === 'administrador' && auth.roleReady) load();
  }, [auth.user, auth.role, auth.roleReady]);

  return <main className="staff-page"><div className="staff-page-heading"><div><p className="section-eyebrow">DATOS DE LA TIENDA</p><h1>Reportes</h1><p>Los importes distinguen pedidos pagados de pagos pendientes y ventas presenciales.</p></div></div>
    <form className="report-filters" onSubmit={(event) => { event.preventDefault(); load(); }}><label>Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Hasta<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'CARGANDO…' : 'APLICAR'}</button></form>
    {error && <p className="react-form-error" role="alert">{error}</p>}
    {report && <><section className="report-cards"><article className="staff-card"><span>Ventas totales</span><strong>{money(report.revenue.total)}</strong></article><article className="staff-card"><span>Online pagadas</span><strong>{money(report.revenue.online)}</strong></article><article className="staff-card"><span>POS completadas</span><strong>{money(report.revenue.inPerson)}</strong></article><article className="staff-card"><span>Pedidos pendientes</span><strong>{report.counts.pendingOrders}</strong></article><article className="staff-card"><span>Cancelados / devueltos</span><strong>{report.counts.cancelledOrders + report.counts.returnedOrders}</strong></article><article className="staff-card"><span>Proyectos en curso</span><strong>{report.projectsInProgress}</strong></article><article className="staff-card"><span>Tareas vencidas</span><strong>{report.overdueTasks}</strong></article></section>
      <section className="staff-card"><h2>Stock bajo</h2>{report.lowStock.length ? <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Producto</th><th>Talle</th><th>Disponible</th><th>Mínimo</th></tr></thead><tbody>{report.lowStock.map((row) => <tr key={row.variantId}><td>{row.product}</td><td>{row.size}</td><td>{row.stock}</td><td>{row.minimum}</td></tr>)}</tbody></table></div> : <p className="staff-empty">No hay alertas de stock bajo.</p>}</section>
      <section className="staff-card"><h2>Productos más vendidos</h2>{report.topProducts.length ? <ol className="report-top-products">{report.topProducts.map((product) => <li key={product.name}><span>{product.name}</span><strong>{product.quantity} unidades</strong></li>)}</ol> : <p className="staff-empty">No hay ventas confirmadas en este período.</p>}</section>
      <section className="staff-card"><h2>Pedidos recientes</h2>{report.recentOrders.length ? <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Pedido</th><th>Fecha</th><th>Canal</th><th>Estado</th><th>Total</th></tr></thead><tbody>{report.recentOrders.slice(0, 20).map((order) => <tr key={order.id}><td>#{order.id}</td><td>{new Date(order.created_at).toLocaleDateString('es-AR')}</td><td>{order.canal}</td><td>{order.estado}</td><td>{money(order.total)}</td></tr>)}</tbody></table></div> : <p className="staff-empty">No hay pedidos en este período.</p>}</section>
      <section className="staff-card"><h2>Ventas presenciales recientes</h2>{report.recentSales.length ? <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Venta</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead><tbody>{report.recentSales.slice(0, 20).map((sale) => <tr key={sale.id}><td>#{sale.id}</td><td>{new Date(sale.created_at).toLocaleDateString('es-AR')}</td><td>{sale.status}</td><td>{money(sale.total)}</td></tr>)}</tbody></table></div> : <p className="staff-empty">No hay ventas presenciales en este período.</p>}</section>
    </>}
  </main>;
}
