// Valida la respuesta de Mercado Pago antes de permitir cualquier transición del pedido.
const ESTADOS_MP_CONOCIDOS = new Set(['approved', 'rejected', 'cancelled', 'pending', 'in_process']);

/** Compara referencia, estado, moneda e importe usando el pedido guardado por el servidor. */
function evaluarPagoMercadoPago(pago, pedido) {
  if (!pago || !pedido || String(pago.external_reference ?? '') !== String(pedido.id)) {
    return { valido: false, motivo: 'referencia' };
  }
  if (!ESTADOS_MP_CONOCIDOS.has(pago.status)) {
    return { valido: false, motivo: 'estado' };
  }
  if (pago.status === 'approved') {
    const importe = Number(pago.transaction_amount);
    const total = Number(pedido.total);
    if (pago.currency_id !== 'ARS') return { valido: false, motivo: 'moneda' };
    if (!Number.isFinite(importe) || !Number.isFinite(total) || importe !== total) {
      return { valido: false, motivo: 'importe' };
    }
    return { valido: true, estado: 'pagado' };
  }
  // Ningún estado de pago no aprobado cancela el pedido ni libera stock automáticamente.
  // El cliente puede volver a intentar el pago o cancelar el pedido por la ruta explícita.
  return { valido: true, estado: 'pendiente' };
}

module.exports = { evaluarPagoMercadoPago };
