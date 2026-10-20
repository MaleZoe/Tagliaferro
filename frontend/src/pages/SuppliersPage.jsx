import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import ActionModal from '../components/ActionModal.jsx';

const api = import.meta.env.VITE_API_URL || '/api/v1';
const money = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(value) || 0);
async function request(path, token, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

export default function SuppliersPage() {
  const auth = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [variants, setVariants] = useState([]);
  const [associations, setAssociations] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [receipts, setReceipts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editingAssociation, setEditingAssociation] = useState(null);
  const [removingAssociation, setRemovingAssociation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const token = await auth.getAccessToken();
    const [supplierData, inventory] = await Promise.all([request('/suppliers', token), request('/inventory', token)]);
    setSuppliers(supplierData); setVariants(inventory.items || []);
    if (!supplierId && supplierData.length) setSupplierId(String(supplierData[0].id));
  }
  useEffect(() => { if (auth.user && auth.role === 'administrador' && auth.roleReady) load().catch((e) => setError(e.message)); }, [auth.user, auth.role, auth.roleReady]);
  useEffect(() => {
    if (!supplierId || !auth.user) { setReceipts([]); return; }
    auth.getAccessToken().then((token) => Promise.all([request(`/suppliers/${supplierId}/receipts`, token), request(`/suppliers/${supplierId}/products`, token)])).then(([history, products]) => { setReceipts(history); setAssociations(products); }).catch((e) => setError(e.message));
  }, [supplierId, auth.user]);

  async function saveSupplier(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(['nombre', 'contacto', 'email', 'telefono', 'direccion', 'observaciones'].map((key) => [key, String(form.get(key) || '')]));
    try {
      const token = await auth.getAccessToken();
      if (editing) await request(`/suppliers/${editing.id}`, token, { method: 'PATCH', body: JSON.stringify(values) });
      else await request('/suppliers', token, { method: 'POST', body: JSON.stringify(values) });
      setEditing(null); setNotice(editing ? 'Proveedor actualizado.' : 'Proveedor registrado.'); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function toggleActive(supplier) {
    try { const token = await auth.getAccessToken(); await request(`/suppliers/${supplier.id}`, token, { method: 'PATCH', body: JSON.stringify({ activo: !supplier.activo }) }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function addProduct(event) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    try { const token = await auth.getAccessToken(); await request(`/suppliers/${supplierId}/products/${form.get('productId')}`, token, { method: 'PUT', body: JSON.stringify({ supplierSku: form.get('supplierSku'), unitCost: form.get('unitCost') ? Number(form.get('unitCost')) : null }) }); setNotice(editingAssociation ? 'Asociación actualizada.' : 'Producto vinculado al proveedor.'); setEditingAssociation(null); setAssociations(await request(`/suppliers/${supplierId}/products`, token)); formElement.reset(); }
    catch (e) { setError(e.message); }
  }
  async function removeProductAssociation() {
    if (!removingAssociation) return;
    try { const token = await auth.getAccessToken(); await request(`/suppliers/${supplierId}/products/${removingAssociation.product_id}`, token, { method: 'DELETE' }); setRemovingAssociation(null); setNotice('Producto desvinculado del proveedor.'); setAssociations(await request(`/suppliers/${supplierId}/products`, token)); }
    catch (e) { setError(e.message); }
  }
  async function receiveStock(event) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true);
    try { const token = await auth.getAccessToken(); await request(`/suppliers/${supplierId}/receipts`, token, { method: 'POST', body: JSON.stringify({ reference: form.get('reference'), notes: form.get('notes'), items: [{ variantId: Number(form.get('variantId')), quantity: Number(form.get('quantity')), unitCost: Number(form.get('unitCost')) }] }) }); setNotice('Reposición registrada y stock actualizado.'); formElement.reset(); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const selected = suppliers.find((supplier) => String(supplier.id) === supplierId);

  return <main className="staff-page admin-content"><div className="staff-page-heading"><div><p className="section-eyebrow">ABASTECIMIENTO</p><h1>Proveedores</h1><p>Contactos, productos asociados y reposiciones que actualizan el mismo inventario de la tienda.</p></div><button className="btn btn-outline-dark" onClick={() => { setEditing(null); document.getElementById('supplier-form')?.reset(); }}>NUEVO PROVEEDOR</button></div>
    {error && <p className="react-form-error" role="alert">{error}</p>}{notice && <p className="react-form-success" role="status">{notice}</p>}
    <div className="admin-supplier-layout"><section className="staff-card"><h2>Proveedores registrados</h2><div className="staff-table-wrap"><table className="staff-table"><thead><tr><th>Proveedor</th><th>Contacto</th><th>Estado</th><th>Reposiciones</th><th>Acciones</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id} className={supplierId === String(supplier.id) ? 'admin-selected-row' : ''}><td><button className="admin-order-detail" onClick={() => setSupplierId(String(supplier.id))}>{supplier.nombre}</button></td><td>{supplier.email || supplier.telefono || '—'}</td><td>{supplier.activo ? 'Activo' : 'Inactivo'}</td><td>{supplier.purchase_receipts?.length || 0}</td><td><button className="admin-action-button" onClick={() => { setEditing(supplier); document.getElementById('supplier-form')?.scrollIntoView({ behavior: 'smooth' }); }}>Editar</button><button className="admin-action-button" onClick={() => toggleActive(supplier)}>{supplier.activo ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div>{!suppliers.length && <p className="staff-empty">Todavía no hay proveedores. Registrá el primero en el formulario.</p>}</section>
      <section id="supplier-form" className="staff-card"><h2>{editing ? 'Editar proveedor' : 'Registrar proveedor'}</h2><form className="admin-form-grid" onSubmit={saveSupplier} key={editing?.id || 'new'}><label>Nombre<input name="nombre" defaultValue={editing?.nombre || ''} required minLength="2" maxLength="160" /></label><label>Persona de contacto<input name="contacto" defaultValue={editing?.contacto || ''} maxLength="160" /></label><label>Correo<input name="email" type="email" defaultValue={editing?.email || ''} /></label><label>Teléfono<input name="telefono" defaultValue={editing?.telefono || ''} maxLength="100" /></label><label>Dirección<input name="direccion" defaultValue={editing?.direccion || ''} maxLength="500" /></label><label className="admin-span-all">Observaciones<textarea name="observaciones" defaultValue={editing?.observaciones || ''} rows="2" maxLength="2000" /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'GUARDANDO…' : editing ? 'GUARDAR CAMBIOS' : 'REGISTRAR PROVEEDOR'}</button></form></section></div>
    {selected && <div className="admin-dashboard-grid"><section className="staff-card"><h2>{editingAssociation ? `Editar asociación · ${selected.nombre}` : `Asociar producto · ${selected.nombre}`}</h2><form className="admin-form-grid" onSubmit={addProduct} key={editingAssociation?.product_id || 'new'}><label>Producto<select name="productId" defaultValue={editingAssociation?.product_id || ''} required>{[...new Map(variants.map((row) => [row.products?.id, row.products])).values()].filter(Boolean).map((product) => <option key={product.id} value={product.id}>{product.nombre}</option>)}</select></label><label>SKU del proveedor<input name="supplierSku" defaultValue={editingAssociation?.supplier_sku || ''} maxLength="100" /></label><label>Costo unitario<input name="unitCost" type="number" min="0" step="0.01" defaultValue={editingAssociation?.unit_cost ?? ''} /></label><button className="btn btn-outline-dark">{editingAssociation ? 'GUARDAR ASOCIACIÓN' : 'ASOCIAR'}</button>{editingAssociation && <button type="button" className="btn btn-outline-dark" onClick={() => setEditingAssociation(null)}>CANCELAR</button>}</form><ul className="staff-movements">{associations.map((item) => <li key={item.product_id}><strong>{item.products?.nombre}</strong><span>SKU proveedor: {item.supplier_sku || '—'} · Costo: {item.unit_cost === null ? 'Sin registrar' : money(item.unit_cost)}</span><span><button className="admin-action-button" onClick={() => setEditingAssociation(item)}>Editar</button><button className="admin-action-button" onClick={() => setRemovingAssociation(item)}>Desvincular</button></span></li>)}</ul>{!associations.length && <p className="staff-empty">Todavía no hay productos asociados.</p>}</section>
      <section className="staff-card"><h2>Registrar reposición</h2><form className="admin-form-grid" onSubmit={receiveStock}><label>Variante<select name="variantId" required>{variants.map((row) => <option key={row.id} value={row.id}>{row.products?.nombre} · {row.talle}{row.color ? ` · ${row.color}` : ''} · stock {row.stock}</option>)}</select></label><label>Cantidad<input name="quantity" type="number" min="1" max="100000" required /></label><label>Costo unitario<input name="unitCost" type="number" min="0" step="0.01" required /></label><label>Referencia<input name="reference" maxLength="120" placeholder="Factura o remito" /></label><label className="admin-span-all">Observaciones<input name="notes" maxLength="1000" /></label><button className="btn btn-primary" disabled={busy}>REGISTRAR Y SUMAR STOCK</button></form></section></div>}
    {selected && <section className="staff-card"><h2>Reposiciones · {selected.nombre}</h2>{receipts.map((receipt) => <article className="admin-receipt" key={receipt.id}><strong>{receipt.reference || `Reposición #${receipt.id}`}</strong><small>{new Date(receipt.created_at).toLocaleString('es-AR')} · {receipt.notes || 'Sin observaciones'}</small>{(receipt.purchase_receipt_items || []).map((line) => <p key={line.id}>{line.product_variants?.products?.nombre} · {line.product_variants?.talle} × {line.quantity} · costo {money(line.unit_cost)}</p>)}</article>)}{!receipts.length && <p className="staff-empty">Este proveedor todavía no tiene reposiciones.</p>}</section>}
    <ActionModal open={Boolean(removingAssociation)} title="Desvincular producto" description={removingAssociation ? `Se quitará ${removingAssociation.products?.nombre || 'el producto'} de este proveedor. Las reposiciones anteriores se conservan.` : ''} confirmLabel="Desvincular" danger onCancel={() => setRemovingAssociation(null)} onConfirm={removeProductAssociation} />
  </main>;
}
