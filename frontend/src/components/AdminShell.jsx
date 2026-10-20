import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const links = [
  { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/inventario', label: 'Productos y stock', icon: 'box' },
  { to: '/caja', label: 'Caja del local', icon: 'cash' },
  { to: '/ventas-online', label: 'Ventas online', icon: 'chart' },
  { to: '/pedidos', label: 'Pedidos', icon: 'orders' },
  { to: '/clientes', label: 'Clientes', icon: 'users' },
  { to: '/proveedores', label: 'Proveedores', icon: 'truck' },
  { to: '/movimientos-stock', label: 'Movimientos de stock', icon: 'arrows' },
  { to: '/reportes', label: 'Reportes', icon: 'reports' },
  { to: '/proyectos', label: 'Proyectos', icon: 'folder' },
  { to: '/configuracion', label: 'Configuración', icon: 'settings' },
];

function MenuIcon({ name }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12v9"/></>,
    cash: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h3"/><circle cx="16" cy="14" r="2"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></>,
    orders: <><path d="M7 3h10l4 4v14H3V3h4Z"/><path d="M7 3v5h10V3M7 13h10M7 17h7"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1"/></>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    arrows: <><path d="M4 7h15l-3-3M20 17H5l3 3"/><path d="M19 7v4M5 13v4"/></>,
    reports: <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-8h4v8"/></>,
    folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export default function AdminShell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const auth = useAuth();
  const location = useLocation();
  const isOnlineSales = location.pathname === '/ventas-online';

  return <div className={`admin-shell${collapsed ? ' admin-shell--collapsed' : ''}${mobileOpen ? ' admin-shell--mobile-open' : ''}`}>
    <button className="admin-mobile-toggle" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={mobileOpen}>☰</button>
    <aside className="admin-sidebar" aria-label="Menú de administración">
      <Link className="admin-brand" to={auth.role === 'empleado' ? '/pos' : '/admin'}><img className="admin-brand-logo" src="/img/logo-elite-sport.png" alt="Élite Sport" /><span className="admin-brand-copy"><strong>ÉLITE SPORT</strong><small>Administración</small></span></Link>
      <nav className="admin-nav">
        <p className="admin-nav-caption">OPERACIÓN</p>
        {links.filter((item) => auth.role !== 'empleado' || ['/caja', '/pos', '/inventario', '/movimientos-stock', '/proyectos'].includes(item.to)).map((item) =>
          <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({ isActive }) => `admin-nav-link${isActive || (isOnlineSales && item.to === '/pedidos') ? ' active' : ''}`} title={collapsed ? item.label : undefined}><span className="admin-nav-icon"><MenuIcon name={item.icon} /></span><span className="admin-nav-label">{item.label}</span></NavLink>)}
      </nav>
      <div className="admin-sidebar-bottom">
        <button className="admin-collapse" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}><span aria-hidden="true">{collapsed ? '»' : '«'}</span><span className="admin-nav-label">{collapsed ? '' : 'Contraer menú'}</span></button>
        <Link to="/" className="admin-store-link"><span aria-hidden="true">↖</span><span className="admin-nav-label">Volver a la tienda</span></Link>
        <button className="admin-logout" type="button" onClick={() => auth.signOut()}><span aria-hidden="true">⇥</span><span className="admin-nav-label">Cerrar sesión</span></button>
      </div>
    </aside>
    {mobileOpen && <button className="admin-mobile-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}
    <div className="admin-main"><header className="admin-topbar"><div><span>Panel administrativo</span><strong>{auth.user?.email || 'Cuenta'}</strong></div><span className="admin-role">{auth.role || 'Acceso autorizado'}</span></header>{children}</div>
  </div>;
}
