// Prueba el contrato del procesador webhook; el adaptador transaccional real requiere validar Supabase.
const test = require('node:test');
const assert = require('node:assert/strict');
const { procesarNotificacionPago } = require('../webhook-payment-service');

const notification = { id: 'event-1', type: 'payment', data: { id: '9001' } };
const payment = { external_reference: '41', status: 'approved', transaction_amount: 53500, currency_id: 'ARS' };
const pedido = { id: 41, total: 53500, estado: 'pendiente' };

test('una notificación repetida delega deduplicación atómica y no confirma dos veces', async () => {
  const seen = new Set(); // Mock de repositorio solo para la prueba; no representa persistencia del servidor.
  let cambios = 0;
  const dependencies = {
    notification,
    consultarPago: async () => payment,
    buscarPedido: async () => pedido,
    aplicarNotificacionIdempotente: async ({ notificationId, estado }) => {
      if (seen.has(notificationId)) return { duplicada: true, estado: 'pagado' };
      seen.add(notificationId);
      cambios += 1;
      return { estado };
    }
  };

  assert.deepEqual(await procesarNotificacionPago(dependencies), { tipo: 'procesada', estado: 'pagado' });
  assert.deepEqual(await procesarNotificacionPago(dependencies), { tipo: 'duplicada', estado: 'pagado' });
  assert.equal(cambios, 1);
});

test('consulta fallida no confirma ni persiste notificación', async () => {
  let persistencias = 0;
  const result = await procesarNotificacionPago({
    notification, consultarPago: async () => { throw new Error('red'); }, buscarPedido: async () => pedido,
    aplicarNotificacionIdempotente: async () => { persistencias += 1; }
  });
  assert.deepEqual(result, { tipo: 'error_consulta_pago' });
  assert.equal(persistencias, 0);
});

test('notificación no relacionada o pedido que no existe no altera datos', async () => {
  let persistencias = 0;
  const common = {
    consultarPago: async () => payment,
    buscarPedido: async () => null,
    aplicarNotificacionIdempotente: async () => { persistencias += 1; }
  };
  assert.deepEqual(await procesarNotificacionPago({ ...common, notification: { ...notification, type: 'merchant_order' } }), { tipo: 'notificacion_invalida' });
  assert.deepEqual(await procesarNotificacionPago({ ...common, notification }), { tipo: 'pedido_inexistente' });
  assert.equal(persistencias, 0);
});
