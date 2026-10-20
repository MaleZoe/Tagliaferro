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

function DashboardIcon({ name }) {
  const paths = {
    revenue: <><path d="M4 7h16v12H4z"/><path d="M4 10h16M8 15h3"/><circle cx="16" cy="15" r="2"/></>,
    store: <><path d="M4 10h16v10H4zM3 10l2-6h14l2 6"/><path d="M8 20v-6h4v6M4 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/></>,
    online: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></>,
    orders: <><path d="M7 3h10l4 4v14H3V3h4Z"/><path d="M7 3v5h10V3M7 13h10M7 17h7"/></>,
    cash: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h3"/><circle cx="16" cy="14" r="2"/></>,
    products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12v9"/></>,
    stock: <><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 16h.01"/></>,
    empty: <><path d="M4 5h16v14H4z"/><path d="M8 10h8M8 14h5"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

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
      const response = await fetch(`${api}/reports/summary?from=${localDate(start)}&to=${today()}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
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
  const primaryCards = summary ? [
    { label: 'Ventas del período', value: money(summary.revenue.total), note: 'Ingresos confirmados', icon: 'revenue', tone: 'primary' },
    { label: 'Ventas del local', value: money(summary.revenue.inPerson), note: 'Punto de venta', icon: 'store', tone: 'steel' },
    { label: 'Ventas online', value: money(summary.revenue.online), note: 'Pedidos confirmados', icon: 'online', tone: 'soft' },
    { label: 'Pedidos pendientes', value: summary.counts.pendingOrders, note: 'Pendientes de seguimiento', icon: 'orders', tone: 'cream' },
  ] : [];
  const operationalStats = summary ? [
    { label: 'Efectivo', value: money(summary.revenue.cash), icon: 'cash' },
    { label: 'Otros medios', value: money(summary.revenue.otherPayments), icon: 'revenue' },
    { label: 'Productos activos', value: summary.counts.activeProducts, icon: 'products' },
    { label: 'Stock bajo', value: summary.lowStock.length, icon: 'stock' },
    { label: 'Sin stock', value: summary.outOfStock.length, icon: 'empty' },
  ] : [];
  const stockRows = [...(summary?.lowStock || []).map((row) => ({ ...row, state: 'Stock bajo' })), ...(summary?.outOfStock || []).map((row) => ({ ...row, state: 'Agotado' }))].slice(0, 6);
  const dateLabel = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  return <main className="staff-page admin-content admin-dashboard">
    <header className="admin-dashboard-header">
      <div className="admin-dashboard-title"><p className="section-eyebrow">CENTRO DE OPERACIONES</p><h1>Dashboard</h1><p>Una vista clara de las ventas y el estado de tu tienda.</p></div>
      <div className="admin-dashboard-toolbar"><span className="admin-dashboard-date">{dateLabel}</span><div className="admin-dashboard-controls"><label className="admin-period-control"><span>Período</span><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período del resumen"><option value="day">Hoy</option><option value="week">7 días</option><option value="month">30 días</option></select></label><button className="admin-refresh-button" onClick={load} disabled={busy}><DashboardIcon name="refresh" />{busy ? 'Actualizando' : 'Actualizar'}</button></div></div>
    </header>

    {error && <div className="admin-dashboard-error" role="alert"><span>{error}</span><button onClick={load}>Reintentar</button></div>}
    {busy && !summary && <section className="admin-dashboard-loading" role="status"><span className="admin-loading-mark" /><div><strong>Cargando tu resumen</strong><small>Consultando ventas e inventario registrados</small></div></section>}
    {summary && <>
      <section className="admin-overview-grid" aria-label="Indicadores de ventas">{primaryCards.map((card) => <article className={`admin-overview-card tone-${card.tone}`} key={card.label}><div className="admin-overview-card-top"><span>{card.label}</span><i><DashboardIcon name={card.icon} /></i></div><strong>{card.value}</strong><small>{card.note}</small></article>)}</section>

      <div className="admin-dashboard-main-grid">
        <section className="admin-dashboard-panel admin-revenue-panel">
          <div className="admin-panel-heading"><div><p className="section-eyebrow">RENDIMIENTO</p><h2>Ingresos por día</h2><p>Ventas completadas en el período seleccionado.</p></div><div className="admin-chart-legend"><span><i className="local" />Local</span><span><i className="online" />Online</span></div></div>
          <div className={`admin-trend-chart admin-trend-chart--${period}`} role="img" aria-label={`Gráfico de ingresos de los últimos ${chartDays} días`}>
            <div className="admin-chart-guides"><i /><i /><i /><i /></div>
            {series.map((point) => <div className="admin-trend-column" key={point.key} title={`${point.key} · local ${money(point.local)} · online ${money(point.online)}`}><div className="admin-trend-bar-area"><div className="admin-trend-stack" style={{ height: `${point.total ? Math.max(5, point.total / seriesMax * 100) : 0}%` }}><i className="local" style={{ height: `${point.total ? point.local / point.total * 100 : 0}%` }} /><i className="online" style={{ height: `${point.total ? point.online / point.total * 100 : 0}%` }} /></div></div><small>{point.label}</small></div>)}
          </div>
          <div className="admin-chart-total"><span>Total del período</span><strong>{money(summary.revenue.total)}</strong></div>
        </section>

        <section className="admin-dashboard-panel admin-operations-panel"><div className="admin-panel-heading"><div><p className="section-eyebrow">OPERACIÓN</p><h2>Resumen operativo</h2><p>Cobros y disponibilidad del catálogo.</p></div></div><div className="admin-operation-list">{operationalStats.map((stat) => <div className="admin-operation-row" key={stat.label}><span className="admin-operation-icon"><DashboardIcon name={stat.icon} /></span><span className="admin-operation-label">{stat.label}</span><strong>{stat.value}</strong></div>)}</div><Link className="admin-panel-link" to="/reportes">Ver reportes <DashboardIcon name="arrow" /></Link></section>
      </div>

      <div className="admin-dashboard-bottom-grid">
        <section className="admin-dashboard-panel admin-shortcuts-panel"><div className="admin-panel-heading"><div><p className="section-eyebrow">ACCIONES FRECUENTES</p><h2>Accesos rápidos</h2></div></div><div className="admin-shortcuts-grid">
          <Link to="/pos" className="admin-shortcut-card"><span className="admin-shortcut-icon"><DashboardIcon name="store" /></span><span><strong>Nueva venta</strong><small>Registrar una venta en el local</small></span><DashboardIcon name="arrow" /></Link>
          <Link to="/inventario" className="admin-shortcut-card"><span className="admin-shortcut-icon"><DashboardIcon name="products" /></span><span><strong>Inventario</strong><small>Revisar productos y existencias</small></span><DashboardIcon name="arrow" /></Link>
          <Link to="/pedidos" className="admin-shortcut-card"><span className="admin-shortcut-icon"><DashboardIcon name="orders" /></span><span><strong>Pedidos</strong><small>{summary.counts.pendingOrders} pendientes por revisar</small></span><DashboardIcon name="arrow" /></Link>
        </div></section>

        <section className="admin-dashboard-panel admin-stock-panel"><div className="admin-panel-heading"><div><p className="section-eyebrow">INVENTARIO</p><h2>Requieren atención</h2></div><Link className="admin-panel-link" to="/inventario">Ver inventario <DashboardIcon name="arrow" /></Link></div>
          {stockRows.length ? <div className="admin-stock-table-wrap"><table className="admin-stock-table"><thead><tr><th>Producto</th><th>Variante</th><th>Stock</th><th>Estado</th></tr></thead><tbody>{stockRows.map((row, index) => <tr key={`${row.variantId || row.product}-${index}`}><td>{row.product}</td><td>{row.size || '—'}</td><td><strong>{row.stock}</strong><small>mín. {row.minimum ?? 0}</small></td><td><span className={`admin-stock-badge ${row.state === 'Agotado' ? 'is-empty' : ''}`}>{row.state}</span></td></tr>)}</tbody></table></div> : <div className="admin-stock-empty"><span><DashboardIcon name="products" /></span><strong>Todo en orden</strong><p>No hay productos con stock bajo o agotado.</p></div>}
        </section>
      </div>
    </>}
  </main>;
}
