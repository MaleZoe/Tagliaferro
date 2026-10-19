// Reúne validaciones de entrada reutilizables antes de acceder a Supabase o Mercado Pago.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paymentMethods = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

/** Valida la estructura del pedido sin aceptar precios ni totales enviados por el navegador. */
function validarPedido(items, envio) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) return 'El carrito está vacío o es inválido';
  if (!envio || ['direccion', 'ciudad', 'cp', 'telefono'].some((field) => !String(envio[field] || '').trim())) return 'Faltan datos de envío obligatorios';
  if (items.some((item) => !Number.isInteger(item.id) || typeof item.size !== 'string' || !item.size.trim() || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10)) return 'Hay un producto inválido en el carrito';
  return null;
}

/** Valida un movimiento de inventario y exige una explicación auditable. */
function validarMovimientoInventario(body) {
  const { variantId, delta, reason } = body || {};
  return Number.isInteger(variantId) && variantId > 0 && Number.isInteger(delta) && delta !== 0 && Math.abs(delta) <= 10000 && typeof reason === 'string' && reason.trim().length >= 3 && reason.trim().length <= 500;
}

/** Valida una venta presencial idempotente sin recibir precio ni total desde la interfaz. */
function validarVentaPOS(body) {
  const { requestKey, paymentMethod, items } = body || {};
  return uuidPattern.test(String(requestKey || '')) && paymentMethods.includes(paymentMethod) && Array.isArray(items) && items.length >= 1 && items.length <= 50 && items.every((item) => Number.isInteger(item.variantId) && item.variantId > 0 && Number.isInteger(item.qty) && item.qty > 0 && item.qty <= 100);
}

/** Valida una anulación/devolución y su motivo. */
function validarReversionVenta(body) {
  return body && ['anulada', 'devuelta'].includes(body.status) && typeof body.reason === 'string' && body.reason.trim().length >= 3 && body.reason.trim().length <= 500;
}

/** Acepta únicamente los dos campos de perfil que la consulta existente conoce. */
function validarEdicionCliente(body) {
  return Boolean(body)
    && Object.keys(body).every((key) => key === 'nombre' || key === 'apellido')
    && typeof body.nombre === 'string' && body.nombre.trim().length >= 1 && body.nombre.trim().length <= 100
    && typeof body.apellido === 'string' && body.apellido.trim().length >= 1 && body.apellido.trim().length <= 100;
}

module.exports = { validarPedido, validarMovimientoInventario, validarVentaPOS, validarReversionVenta, validarEdicionCliente };
