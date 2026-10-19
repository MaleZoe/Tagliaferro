// Comprueba límites y formatos que Express valida antes de iniciar cambios en la base.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPedido, validarMovimientoInventario, validarVentaPOS, validarReversionVenta, validarEdicionCliente } = require('../validators');

const shipping = { direccion: 'Calle 123', ciudad: 'Buenos Aires', cp: '1000', telefono: '1112345678' };

test('acepta un pedido estructuralmente válido sin admitir precio del cliente', () => {
  assert.equal(validarPedido([{ id: 4, size: 'M', qty: 2, price: 1 }], shipping), null);
});

test('rechaza carrito vacío, cantidad excesiva y talle ausente', () => {
  assert.match(validarPedido([], shipping), /carrito/i);
  assert.match(validarPedido([{ id: 4, size: 'M', qty: 11 }], shipping), /inválido/i);
  assert.match(validarPedido([{ id: 4, size: '', qty: 1 }], shipping), /inválido/i);
});

test('requiere los campos de entrega que usa la ruta de pedidos existente', () => {
  assert.match(validarPedido([{ id: 4, size: 'M', qty: 1 }], { direccion: 'Calle 123' }), /envío/i);
});

test('permite entradas y salidas justificadas, pero rechaza ajustes nulos o sin motivo', () => {
  assert.equal(validarMovimientoInventario({ variantId: 2, delta: 3, reason: 'Reposición' }), true);
  assert.equal(validarMovimientoInventario({ variantId: 2, delta: -2, reason: 'Venta manual' }), true);
  assert.equal(validarMovimientoInventario({ variantId: 2, delta: 0, reason: 'Cambio' }), false);
  assert.equal(validarMovimientoInventario({ variantId: 2, delta: -1, reason: 'x' }), false);
});

test('requiere una clave UUID y cantidades válidas para una venta POS', () => {
  const sale = { requestKey: '6ba7b810-9dad-41d1-80b4-00c04fd430c8', paymentMethod: 'efectivo', items: [{ variantId: 2, qty: 1 }] };
  assert.equal(validarVentaPOS(sale), true);
  assert.equal(validarVentaPOS({ ...sale, requestKey: 'no-es-uuid' }), false);
  assert.equal(validarVentaPOS({ ...sale, items: [{ variantId: 2, qty: 0 }] }), false);
  assert.equal(validarVentaPOS({ ...sale, paymentMethod: 'mercado_pago' }), false);
});

test('restringe la reversión a estados admitidos y con motivo', () => {
  assert.equal(validarReversionVenta({ status: 'anulada', reason: 'Error de carga' }), true);
  assert.equal(validarReversionVenta({ status: 'completada', reason: 'Error' }), false);
  assert.equal(validarReversionVenta({ status: 'devuelta', reason: '' }), false);
});

test('limita la edición de clientes a nombre y apellido acotados', () => {
  assert.equal(validarEdicionCliente({ nombre: 'Ana', apellido: 'Pérez' }), true);
  assert.equal(validarEdicionCliente({ nombre: ' ', apellido: 'Pérez' }), false);
  assert.equal(validarEdicionCliente({ nombre: 'A'.repeat(101), apellido: 'Pérez' }), false);
  assert.equal(validarEdicionCliente({ nombre: 'Ana', apellido: 'Pérez', role: 'administrador' }), false);
});
