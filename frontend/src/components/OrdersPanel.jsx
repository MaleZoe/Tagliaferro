// Muestra el historial del usuario autenticado consultado de forma segura en el backend.
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getOrders } from '../services/orders.js';

const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);
const labels = { pendiente: 'Pendiente de pago', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado', devuelto: 'Devuelto' };

export default function OrdersPanel({ open, onClose }) {
  const auth = useAuth();
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Actualiza el historial al abrirlo y obtiene datos solo para la sesión actual.
  useEffect(() => {
    if (!open || !auth.session) return;
    let active = true;
    setBusy(true);
    auth.getAccessToken().then(getOrders).then((rows) => { if (active) setOrders(rows); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [open, auth.session]);

  if (!open) return null;
  return <div className="react-scrim" onClick={onClose}>
    <aside className="react-orders-panel" aria-label="Mis pedidos" onClick={(event) => event.stopPropagation()}>
      <div className="cart-header"><h2>Mis pedidos</h2><button className="panel-close" onClick={onClose} aria-label="Cerrar pedidos">×</button></div>
      {busy && <p role="status">Cargando pedidos…</p>}
      {error && <p className="react-form-error" role="alert">{error}</p>}
      {!busy && !error && orders.length === 0 && <p className="cart-empty">Todavía no hiciste pedidos.</p>}
      <ul className="react-orders-list">{orders.map((order) => <li className="order-card" key={order.id}>
        <div className="order-card-header"><div><strong>Pedido #{order.id}</strong><p className="order-card-date">{new Date(order.created_at).toLocaleDateString('es-AR')}</p></div><span className="order-badge">{labels[order.estado] || order.estado}</span></div>
        <div className="order-card-items">{(order.order_items || []).map((line, index) => {
          const variant = line.product_variants;
          const product = variant?.products;
          return <div className="order-item" key={`${order.id}-${index}`}><div className="order-item-img">{product?.imagen_url && <img src={product.imagen_url} alt="" />}</div><div><p className="order-item-name">{product?.nombre || 'Producto'}</p><p className="order-item-meta">Talle {variant?.talle || '—'} · Cant. {line.cantidad} · {money(line.precio_unitario)}</p></div></div>;
        })}</div>
        <div className="order-card-footer"><span>{order.medio_de_pago || '—'}</span><strong>{money(order.total)}</strong></div>
      </li>)}</ul>
    </aside>
  </div>;
}
