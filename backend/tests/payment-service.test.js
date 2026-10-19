// Prueba reintentos y fallos del flujo de confirmación con adaptadores de Supabase/Mercado Pago simulados.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verificarYAplicarPago } = require('../payment-service');

const pedido = { id: 41, total: 53500, estado: 'pendiente' };
const pagoAprobado = {
  external_reference: '41', status: 'approved', transaction_amount: 53500, currency_id: 'ARS'
};

test('una respuesta aprobada actualiza una sola vez y el reintento observa el estado persistido', async () => {
  let estado = 'pendiente';
  let escrituras = 0;
  const deps = {
    pedido, paymentId: '9001', consultarPago: async () => pagoAprobado,
    actualizarPedidoPendiente: async () => {
      if (estado !== 'pendiente') return null;
      escrituras += 1;
      estado = 'pagado';
      return { estado };
    },
    consultarEstado: async () => estado
  };

  assert.deepEqual(await verificarYAplicarPago(deps), { tipo: 'confirmado', estado: 'pagado' });
  assert.deepEqual(await verificarYAplicarPago(deps), { tipo: 'estado_existente', estado: 'pagado' });
  assert.equal(escrituras, 1);
});

test('un estado inesperado no intenta modificar el pedido', async () => {
  let escrituras = 0;
  const result = await verificarYAplicarPago({
    pedido, paymentId: '9001', consultarPago: async () => ({ ...pagoAprobado, status: 'chargeback' }),
    actualizarPedidoPendiente: async () => { escrituras += 1; }, consultarEstado: async () => 'pendiente'
  });
  assert.deepEqual(result, { tipo: 'pago_invalido', motivo: 'estado' });
  assert.equal(escrituras, 0);
});

test('un rechazo/cancelación de Mercado Pago no cancela el pedido ni libera stock', async () => {
  for (const status of ['rejected', 'cancelled']) {
    let escrituras = 0;
    const result = await verificarYAplicarPago({
      pedido, paymentId: '9001', consultarPago: async () => ({ ...pagoAprobado, status }),
      actualizarPedidoPendiente: async () => { escrituras += 1; }, consultarEstado: async () => 'pendiente'
    });
    assert.deepEqual(result, { tipo: 'sin_confirmacion', estado: 'pendiente' });
    assert.equal(escrituras, 0);
  }
});

test('el error consultando Mercado Pago deja el pedido sin cambios', async () => {
  let escrituras = 0;
  const result = await verificarYAplicarPago({
    pedido, paymentId: '9001', consultarPago: async () => { throw new Error('red'); },
    actualizarPedidoPendiente: async () => { escrituras += 1; }, consultarEstado: async () => 'pendiente'
  });
  assert.deepEqual(result, { tipo: 'error_consulta' });
  assert.equal(escrituras, 0);
});

test('los errores al actualizar o volver a consultar el estado se informan sin fingir confirmación', async () => {
  const base = { pedido, paymentId: '9001', consultarPago: async () => pagoAprobado };
  assert.deepEqual(await verificarYAplicarPago({
    ...base, actualizarPedidoPendiente: async () => { throw new Error('db'); }, consultarEstado: async () => 'pendiente'
  }), { tipo: 'error_actualizacion' });
  assert.deepEqual(await verificarYAplicarPago({
    ...base, actualizarPedidoPendiente: async () => null, consultarEstado: async () => { throw new Error('db'); }
  }), { tipo: 'error_consulta_estado' });
});
