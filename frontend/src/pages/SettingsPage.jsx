import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const api = import.meta.env.VITE_API_URL || '/api/v1';
export default function SettingsPage() {
  const auth = useAuth();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { const token = await auth.getAccessToken(); const response = await fetch(`${api}/settings`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las preferencias.'); setSettings(data.settings || {}); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (auth.user && auth.role === 'administrador' && auth.roleReady) load(); }, [auth.user, auth.role, auth.roleReady]);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice(''); const form = new FormData(event.currentTarget);
    const values = { businessName: form.get('businessName'), logoUrl: form.get('logoUrl'), phone: form.get('phone'), email: form.get('email'), address: form.get('address'), receiptFooter: form.get('receiptFooter'), lowStockThreshold: Number(form.get('lowStockThreshold')) };
    try { const token = await auth.getAccessToken(); const response = await fetch(`${api}/settings`, { method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'No se pudieron guardar las preferencias.'); setSettings(data.settings || values); setNotice('Preferencias comerciales guardadas.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="staff-page admin-content"><div className="staff-page-heading"><div><p className="section-eyebrow">PREFERENCIAS</p><h1>Configuración</h1><p>Datos que se guardan para la operación comercial y la impresión de comprobantes.</p></div></div>
    {error && <p className="react-form-error" role="alert">{error}</p>}{notice && <p className="react-form-success" role="status">{notice}</p>}{loading ? <p className="staff-empty">Cargando preferencias…</p> : <form className="staff-card admin-settings-form" onSubmit={save}><h2>Datos del comercio</h2><div className="admin-form-grid"><label>Nombre comercial<input name="businessName" defaultValue={settings.businessName || ''} minLength="2" maxLength="160" required /></label><label>Logo (URL o ruta)<input name="logoUrl" defaultValue={settings.logoUrl || ''} maxLength="1000" /></label><label>Teléfono<input name="phone" defaultValue={settings.phone || ''} maxLength="100" /></label><label>Correo<input name="email" type="email" defaultValue={settings.email || ''} maxLength="254" /></label><label className="admin-span-all">Dirección comercial<input name="address" defaultValue={settings.address || ''} maxLength="500" /></label><label className="admin-span-all">Pie de ticket<textarea name="receiptFooter" rows="3" maxLength="500" defaultValue={settings.receiptFooter || ''} /></label><label>Alerta global de stock bajo<input name="lowStockThreshold" type="number" min="0" max="100000" defaultValue={settings.lowStockThreshold ?? 0} required /></label><div className="admin-settings-note">El umbral global se usa cuando una variante no tiene un mínimo propio. Los permisos de acceso se administran desde la sección de empleados.</div></div><button className="btn btn-primary" disabled={busy}>{busy ? 'GUARDANDO…' : 'GUARDAR CONFIGURACIÓN'}</button></form>}
  </main>;
}
