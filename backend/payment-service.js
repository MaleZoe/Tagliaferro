// Encapsula la verificación y transición condicional del pago para probar reintentos sin servicios externos.
const { evaluarPagoMercadoPago } = require('./payment-validation');

/**
 * Consulta el pago a través de un adaptador del servidor y solo actualiza pedidos aún pendientes.
 * El adaptador de actualización debe realizar el filtro de estado pendiente en la base de datos.
 */
async function verificarYAplicarPago({ pedido, paymentId, consultarPago, actualizarPedidoPendiente, consultarEstado }) {
  let pago;
  try {
    pago = await consultarPago(paymentId);
  } catch {
    return { tipo: 'error_consulta' };
  }

  const validacion = evaluarPagoMercadoPago(pago, pedido);
  if (!validacion.valido) return { tipo: 'pago_invalido', motivo: validacion.motivo };
  if (validacion.estado !== 'pagado') {
    // Un rechazo, cancelación de pago o estado en proceso no cancela el pedido ni libera stock automáticamente.
    return { tipo: 'sin_confirmacion', estado: 'pendiente' };
  }

  let actualizado;
  try {
    actualizado = await actualizarPedidoPendiente({ pedidoId: pedido.id, paymentId });
  } catch {
    return { tipo: 'error_actualizacion' };
  }
  if (actualizado) return { tipo: 'confirmado', estado: 'pagado' };

  // Un callback repetido u otra transición concurrente se resuelve leyendo el estado persistido.
  try {
    const estadoActual = await consultarEstado(pedido.id);
    if (!estadoActual) return { tipo: 'error_consulta_estado' };
    return { tipo: 'estado_existente', estado: estadoActual };
  } catch {
    return { tipo: 'error_consulta_estado' };
  }
}

module.exports = { verificarYAplicarPago };
