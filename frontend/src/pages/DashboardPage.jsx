import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const api = import.meta.env.VITE_API_URL || '/api/v1';
const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function DashboardPage() {
  const auth = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [period, setPeriod] = useState('day');

  async function load() {
    setBusy(true); setError('');
    try {
      const token = await auth.getAccessToken();
      const end = new Date(); const start = new Date(end);
      const dayCount = period === 'month' ? 30 : period === 'week' ? 7 : 1;
      start.setDate(start.getDate() - dayCount + 1);
      const from = localDate(start); const to = today();
      const response = await fetch(`${api}/reports/summary?from=${from}&to=${to}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el resumen del negocio.');
      setSummary(data);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (auth.user && auth.role === 'administrador' && auth.roleReady) load(); }, [auth.user, auth.role, auth.roleReady, period]);

  const chartDays = period === 'month' ? 30 : period === 'week' ? 7 : 1;
  const series = Array.from({ length: chartDays }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - chartDays + index + 1);
    const key = localDate(date);
    const local = (summary?.recentSales || []).filter((sale) => sale.status === 'completada' && String(sale.created_at).slice(0, 10) === key).reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const online = (summary?.recentOrders || []).filter((order) => order.canal === 'online' && ['pagado', 'enviado', 'entregado'].includes(order.estado) && String(order.created_at).slice(0, 10) === key).reduce((sum, order) => sum + Number(order.total || 0), 0);
    return { key, label: period === 'month' ? date.toLocaleDateString('es-AR', { day: '2-digit' }) : date.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit' }), local, online, total: local + online };
  });
  const seriesMax = Math.max(...series.map((point) => point.total), 1);

  const cards = summary ? [
    ['Ventas del período', money(summary.revenue.total), 'Online y local, sin duplicar canales'],
    ['Ventas del local', money(summary.revenue.inPerson), 'Ventas POS completadas'],
    ['Ventas online', money(summary.revenue.online), 'Pedidos online confirmados'],
    ['Cobrado en efectivo', money(summary.revenue.cash), 'Ventas POS completadas'],
    ['Otros medios de pago', money(summary.revenue.otherPayments), 'Tarjeta, transferencia y otros'],
    ['Pedidos pendientes', summary.counts.pendingOrders, 'Requieren seguimiento'],
    ['Productos activos', summary.counts.activeProducts, 'Catálogo compartido con la tienda'],
    ['Stock bajo', summary.lowStock.length, 'Variantes en o bajo el mínimo'],
    ['Sin stock', summary.outOfStock.length, 'Variantes agotadas'],
  ] : [];
  const channelMax = Math.max(Number(summary?.revenue.online) || 0, Number(summary?.revenue.inPerson) || 0, 1);

  return <main className="staff-page admin-content"><div className="staff-page-heading"><div><p className="section-eyebrow">RESUMEN DEL NEGOCIO</p><h1>Dashboard</h1><p>Indicadores calculados desde las ventas, pedidos e inventario registrados.</p></div><div className="cash-heading-actions"><select className="admin-period-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período del resumen"><option value="day">Hoy</option><option value="week">Últimos 7 días</option><option value="month">Últimos 30 días</option></select><button className="btn btn-outline-dark" onClick={load} disabled={busy}>{busy ? 'ACTUALIZANDO…' : 'ACTUALIZAR'}</button></div></div>
    {error && <div className="react-form-error" role="alert">{error}<button className="admin-retry" onClick={load}>Reintentar</button></div>}
    {busy && !summary && <p className="staff-empty" role="status">Cargando datos reales del negocio…</p>}
    {summary && <>
      <section className="report-cards admin-metric-grid" aria-label="Indicadores del período">{cards.map(([label, value, note]) => <article className="staff-card admin-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>
      <section className="staff-card admin-channel-card"><div><p className="section-eyebrow">COMPARACIÓN DE CANALES</p><h2>Ventas del período</h2><p className="staff-empty">Solo operaciones completadas o pagos confirmados.</p><div className="admin-channel-legend"><span><i className="local" />Local {money(summary.revenue.inPerson)}</span><span><i className="online" />Online {money(summary.revenue.online)}</span></div></div><div className={`admin-trend-chart admin-trend-chart--${period}`} aria-label="Ventas diarias separadas por canal">{series.map((point) => <div className="admin-trend-column" key={point.key} title={`${point.key} · local ${money(point.local)} · online ${money(point.online)}`}><div className="admin-trend-stack" style={{ height: `${Math.max(point.total ? 3 : 0, point.total / seriesMax * 100)}%` }}><i className="local" style={{ height: `${point.total ? point.local / point.total * 100 : 0}%` }} /><i className="online" style={{ height: `${point.total ? point.online / point.total * 100 : 0}%` }} /></div><small>{point.label}</small></div>)}</div></section>
      <div className="admin-dashboard-grid"><section className="staff-card"><div className="project-title-row"><h2>Accesos rápidos</h2></div><div className="admin-quick-links"><Link to="/pos"><span>＋</span><strong>Registrar venta presencial</strong><small>Ir a caja del local</small></Link><Link to="/inventario"><span>▤</span><strong>Revisar productos y stock</strong><small>Consultar disponibilidad</small></Link><Link to="/pedidos"><span>≡</span><strong>Consultar pedidos pendientes</strong><small>{summary.counts.pendingOrders} pendientes</small></Link></div></section>
        <section className="staff-card"><div className="project-title-row"><h2>Alertas de stock</h2><Link to="/movimientos-stock">Ver inventario</Link></div>{summary.lowStock.length ? <div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Producto</th><th>Talle</th><th>Disponible</th><th>Mínimo</th></tr></thead><tbody>{summary.lowStock.slice(0, 6).map((row) => <tr key={row.variantId}><td>{row.product}</td><td>{row.size}</td><td>{row.stock}</td><td>{row.minimum}</td></tr>)}</tbody></table></div> : <p className="staff-empty">No hay alertas de stock bajo.</p>}</section></div>
    </>}
  </main>;
}
