// Permite buscar clientes y consultar su historial únicamente a perfiles administradores.
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const api = import.meta.env.VITE_API_URL || '/api/v1';
const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value) || 0);

export default function CustomersPage() {
  const auth = useAuth();
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Busca datos desde el backend; el navegador no recibe contraseñas, tokens ni credenciales de Auth.
  useEffect(() => {
    if (!auth.user || auth.role !== 'administrador' || !auth.roleReady) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const token = await auth.getAccessToken();
        const response = await fetch(`${api}/customers?q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo consultar clientes.');
        if (active) { setCustomers(data); setError(''); }
      } catch (requestError) { if (active) setError(requestError.message); }
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [auth.user, auth.role, auth.roleReady, query]);

  // Recupera pedidos de un cliente seleccionado; el servidor vuelve a validar el rol administrador.
  async function showOrders(customer) {
    setSelected(customer); setOrders([]); setError('');
    try {
      const token = await auth.getAccessToken();
      const response = await fetch(`${api}/customers/${customer.id}/orders`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el historial.');
      setOrders(data);
    } catch (requestError) { setError(requestError.message); }
  }

  // Envía solo nombre y apellido; el backend valida el rol y actualiza un perfil existente.
  async function saveCustomer(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const profile = { nombre: String(form.get('nombre') || '').trim(), apellido: String(form.get('apellido') || '').trim() };
    setSaving(true); setError('');
    try {
      const token = await auth.getAccessToken();
      const response = await fetch(`${api}/customers/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(profile),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el perfil.');
      setCustomers((current) => current.map((customer) => customer.id === result.id ? { ...customer, ...result } : customer));
      setEditing(null);
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }

  return <main className="staff-page"><div className="staff-page-heading"><div><p className="section-eyebrow">ADMINISTRACIÓN</p><h1>Clientes</h1><p>Consulta protegida de perfiles e historial de pedidos.</p></div></div>
    <label className="staff-search">Buscar por nombre o correo<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o correo" /></label>
    {error && <p className="react-form-error" role="alert">{error}</p>}
    <section className="staff-card"><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Cliente</th><th>Correo</th><th>Estado</th><th>Pedidos</th><th>Compras confirmadas</th><th></th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td>{customer.nombre} {customer.apellido}</td><td>{customer.email}</td><td>{customer.active ? 'Activo' : 'Inactivo'}</td><td>{customer.orderCount}</td><td>{money(customer.completedSpend)}</td><td><button className="react-remove" onClick={() => setEditing(customer)}>Editar datos</button><button className="react-remove" onClick={() => showOrders(customer)}>Ver compras</button></td></tr>)}</tbody></table></div>{customers.length === 0 && <p className="staff-empty">No hay clientes que coincidan con la búsqueda.</p>}</section>
    {editing && <div className="react-scrim" onClick={() => setEditing(null)}><section className="react-form-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-edit-title" onClick={(event) => event.stopPropagation()}><button className="react-modal-close" onClick={() => setEditing(null)} aria-label="Cerrar">×</button><h2 id="customer-edit-title">Editar datos del cliente</h2><p>{editing.email}</p><form className="staff-form" onSubmit={saveCustomer}><label>Nombre<input name="nombre" defaultValue={editing.nombre} minLength="1" maxLength="100" required /></label><label>Apellido<input name="apellido" defaultValue={editing.apellido} minLength="1" maxLength="100" required /></label>{error && <p className="react-form-error" role="alert">{error}</p>}<button className="btn btn-primary btn-full" disabled={saving}>{saving ? 'GUARDANDO…' : 'GUARDAR CAMBIOS'}</button></form></section></div>}
    {selected && <section className="staff-card"><div className="project-title-row"><h2>Pedidos de {selected.nombre} {selected.apellido}</h2><button className="react-remove" onClick={() => setSelected(null)}>Cerrar</button></div>{orders.length ? orders.map((order) => <article className="customer-order" key={order.id}><strong>Pedido #{order.id} · {order.estado} · {money(order.total)}</strong><small>{new Date(order.created_at).toLocaleString('es-AR')} · {order.medio_de_pago || '—'}</small>{(order.order_items || []).map((line, index) => <p key={`${order.id}-${index}`}>{line.product_variants?.products?.nombre || 'Producto'} · talle {line.product_variants?.talle || '—'} × {line.cantidad} · {money(line.precio_unitario)}</p>)}</article>) : <p className="staff-empty">No hay pedidos para este cliente.</p>}</section>}
  </main>;
}
