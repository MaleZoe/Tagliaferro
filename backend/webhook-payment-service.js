// Orquesta una notificación ya autenticada; la persistencia deduplicada se delega a una transacción de Supabase.
const { evaluarPagoMercadoPago } = require('./payment-validation');

/**
 * Procesa solo señales de pago. aplicarNotificacionIdempotente debe insertar una clave única de evento
 * y actualizar el pedido/stock en una única transacción; no hay adaptador productivo hasta validar el esquema.
 */
async function procesarNotificacionPago({ notification, consultarPago, buscarPedido, aplicarNotificacionIdempotente }) {
  const notificationId = notification?.id == null ? '' : String(notification.id);
  const paymentId = notification?.data?.id == null ? '' : String(notification.data.id);
  if (notification?.type !== 'payment' || !notificationId || !/^\d+$/.test(paymentId)) {
    return { tipo: 'notificacion_invalida' };
  }

  let payment;
  try {
    payment = await consultarPago(paymentId);
  } catch {
    return { tipo: 'error_consulta_pago' };
  }
  const externalReference = String(payment?.external_reference ?? '');
  if (!/^\d+$/.test(externalReference)) return { tipo: 'pago_sin_referencia' };

  let pedido;
  try {
    pedido = await buscarPedido(externalReference);
  } catch {
    return { tipo: 'error_consulta_pedido' };
  }
  if (!pedido) return { tipo: 'pedido_inexistente' };

  const validacion = evaluarPagoMercadoPago(payment, pedido);
  if (!validacion.valido) return { tipo: 'pago_invalido', motivo: validacion.motivo };
  const estado = validacion.estado === 'pagado' ? 'pagado' : 'pendiente';

  try {
    const resultado = await aplicarNotificacionIdempotente({
      notificationId, paymentId, pedidoId: pedido.id, estado
    });
    return resultado?.duplicada
      ? { tipo: 'duplicada', estado: resultado.estado || pedido.estado }
      : { tipo: 'procesada', estado: resultado?.estado || estado };
  } catch {
    return { tipo: 'error_persistencia' };
  }
}

module.exports = { procesarNotificacionPago };
