// Prueba las decisiones puras del flujo de pagos sin credenciales ni llamadas externas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluarPagoMercadoPago } = require('../payment-validation');

const pedido = { id: 42, total: 53500 };
const pago = { external_reference: '42', status: 'approved', currency_id: 'ARS', transaction_amount: 53500 };

test('acepta aprobación solo con referencia, importe y moneda exactos', () => {
  assert.deepEqual(evaluarPagoMercadoPago(pago, pedido), { valido: true, estado: 'pagado' });
});

test('rechaza una referencia distinta aunque el pago figure aprobado', () => {
  assert.deepEqual(evaluarPagoMercadoPago({ ...pago, external_reference: '43' }, pedido), { valido: false, motivo: 'referencia' });
});

test('rechaza importes menores, mayores o no numéricos', () => {
  assert.equal(evaluarPagoMercadoPago({ ...pago, transaction_amount: 53500.01 }, pedido).motivo, 'importe');
  assert.equal(evaluarPagoMercadoPago({ ...pago, transaction_amount: 'no-numérico' }, pedido).motivo, 'importe');
});

test('rechaza la aprobación con una moneda distinta de ARS', () => {
  assert.equal(evaluarPagoMercadoPago({ ...pago, currency_id: 'USD' }, pedido).motivo, 'moneda');
});

test('mantiene pendiente una operación pendiente o en proceso', () => {
  assert.deepEqual(evaluarPagoMercadoPago({ ...pago, status: 'pending' }, pedido), { valido: true, estado: 'pendiente' });
  assert.deepEqual(evaluarPagoMercadoPago({ ...pago, status: 'in_process' }, pedido), { valido: true, estado: 'pendiente' });
});

test('los rechazos y cancelaciones del pago conservan el pedido pendiente', () => {
  assert.deepEqual(evaluarPagoMercadoPago({ ...pago, status: 'rejected' }, pedido), { valido: true, estado: 'pendiente' });
  assert.deepEqual(evaluarPagoMercadoPago({ ...pago, status: 'cancelled' }, pedido), { valido: true, estado: 'pendiente' });
  assert.equal(evaluarPagoMercadoPago({ ...pago, status: 'refunded' }, pedido).valido, false);
});
