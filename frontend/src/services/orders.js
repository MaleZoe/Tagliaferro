// Centraliza los pedidos y la confirmación de pago para no duplicar llamadas HTTP en componentes.
const apiBase = import.meta.env.VITE_API_URL || '/api/v1';

async function request(path, token, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la operación.');
  return body;
}

/** Crea el pedido; el backend vuelve a consultar precio, variante y stock antes de cobrar. */
export function createOrder(token, payload) {
  return request('/orders', token, { method: 'POST', body: JSON.stringify(payload) });
}

/** Consulta únicamente los pedidos vinculados a la identidad autenticada. */
export function getOrders(token) {
  return request('/orders', token);
}

/** Pide al backend que verifique el pago consultando a Mercado Pago. */
export function confirmPayment(token, orderId, paymentId) {
  return request(`/orders/${encodeURIComponent(orderId)}/confirm-payment`, token, {
    method: 'POST', body: JSON.stringify({ payment_id: paymentId }),
  });
}

/** Cancela solo pedidos pendientes del cliente autenticado. */
export function cancelOrder(token, orderId) {
  return request(`/orders/${encodeURIComponent(orderId)}/cancel`, token, { method: 'POST', body: '{}' });
}
