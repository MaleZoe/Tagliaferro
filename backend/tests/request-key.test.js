// Prueba que la clave POS se guarde antes de la primera petición y sobreviva a nuevos montajes.
const test = require('node:test');
const assert = require('node:assert/strict');

test('la clave POS creada se persiste y se reutiliza tras recargar', async () => {
  const { getOrCreateRequestKey } = await import('../../frontend/src/services/request-key.js');
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  let generated = 0;
  const cryptoApi = { randomUUID: () => { generated += 1; return '123e4567-e89b-42d3-a456-426614174000'; } };
  const initial = getOrCreateRequestKey(storage, cryptoApi);
  const afterReload = getOrCreateRequestKey(storage, cryptoApi);
  assert.equal(initial, afterReload);
  assert.equal(values.get('es_pos_default_request_key'), initial);
  assert.equal(generated, 1);
});

test('una clave almacenada inválida se reemplaza antes de enviarla al servidor', async () => {
  const { getOrCreateRequestKey } = await import('../../frontend/src/services/request-key.js');
  const values = new Map([['es_pos_default_request_key', 'no-es-uuid']]);
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const valid = '123e4567-e89b-42d3-a456-426614174000';
  assert.equal(getOrCreateRequestKey(storage, { randomUUID: () => valid }), valid);
  assert.equal(values.get('es_pos_default_request_key'), valid);
});

test('las cuentas de personal conservan borradores y claves independientes', async () => {
  const { getOrCreateRequestKey, readPosDraft, savePosDraft } = await import('../../frontend/src/services/request-key.js');
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const first = '123e4567-e89b-42d3-a456-426614174000';
  const second = '123e4567-e89b-42d3-a456-426614174001';
  const cryptoApi = { randomUUID: () => first };
  const firstKey = getOrCreateRequestKey(storage, cryptoApi, 'employee-a');
  const secondKey = getOrCreateRequestKey(storage, { randomUUID: () => second }, 'employee-b');
  savePosDraft(storage, { requestKey: firstKey, paymentMethod: 'efectivo', items: [{ variantId: 1, qty: 1, name: 'Producto', size: 'M', price: 100 }] }, 'employee-a');
  assert.equal(readPosDraft(storage, cryptoApi, 'employee-a').requestKey, firstKey);
  assert.equal(readPosDraft(storage, cryptoApi, 'employee-a').pending, true);
  assert.equal(readPosDraft(storage, cryptoApi, 'employee-b').requestKey, secondKey);
  assert.equal(readPosDraft(storage, cryptoApi, 'employee-b').pending, false);
});
