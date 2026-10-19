// Recopila el domicilio y crea un pedido; precios y stock definitivos los valida la API.
import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createOrder } from '../services/orders.js';

const money = (amount) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amount || 0);

export default function CheckoutDialog({ cart, open, onClose, onPaymentCreated }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + Number(line.price) * line.qty, 0), [cart]);
  const shipping = subtotal >= 50000 ? 0 : 3500;

  if (!open) return null;

  // Envía solo identificadores, talle y cantidad; la API obtiene importes reales y controla el stock.
  async function submit(event) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const address = Object.fromEntries(['nombre', 'apellido', 'direccion', 'ciudad', 'cp', 'telefono'].map((field) => [field, String(form.get(field) || '').trim()]));
    if (Object.values(address).some((value) => !value)) { setError('Completá todos los datos de envío.'); return; }
    if (!cart.length) { setError('El carrito está vacío.'); return; }
    setBusy(true);
    try {
      const token = await auth.getAccessToken();
      const result = await createOrder(token, { items: cart.map(({ id, size, qty }) => ({ id, size, qty })), envio: address });
      if (!result.init_point || !Number.isInteger(Number(result.orderId))) throw new Error('La API no devolvió un enlace de pago válido.');
      onPaymentCreated(result);
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  return <div className="react-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="react-form-dialog react-checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <button className="react-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
      <h2 id="checkout-title">Finalizar compra</h2>
      <p>Subtotal de referencia: {money(subtotal)} · Envío estimado: {shipping ? money(shipping) : 'Gratis'}</p>
      <p className="react-checkout-note">El servidor vuelve a calcular el precio y el envío al crear el pedido.</p>
      <form onSubmit={submit} noValidate>
        <div className="react-form-row"><label>Nombre<input name="nombre" defaultValue={auth.user?.user_metadata?.nombre || ''} required /></label><label>Apellido<input name="apellido" defaultValue={auth.user?.user_metadata?.apellido || ''} required /></label></div>
        <label>Dirección<input name="direccion" autoComplete="street-address" required /></label>
        <div className="react-form-row"><label>Ciudad<input name="ciudad" autoComplete="address-level2" required /></label><label>Código postal<input name="cp" autoComplete="postal-code" required /></label></div>
        <label>Teléfono<input name="telefono" type="tel" autoComplete="tel" required /></label>
        {error && <p className="react-form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-full" disabled={busy}>{busy ? 'CREANDO PEDIDO…' : 'CONTINUAR A MERCADO PAGO'}</button>
      </form>
    </section>
  </div>;
}
