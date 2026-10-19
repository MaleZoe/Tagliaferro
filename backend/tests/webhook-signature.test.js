// Verifica firma, formato y tolerancia temporal con firmas HMAC sintéticas sin credenciales externas.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validarFirmaWebhook } = require('../webhook-signature');

function makeSignature({ secret, timestamp, xRequestId, dataId }) {
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
  return `ts=${timestamp},v1=${crypto.createHmac('sha256', secret).update(manifest).digest('hex')}`;
}

test('acepta firma HMAC válida con los valores crudos recibidos', () => {
  const input = { secret: 'secret-test-only', now: 1700000000000, xRequestId: 'request-1', dataId: 'payment-9' };
  const timestamp = String(input.now);
  assert.equal(validarFirmaWebhook({ ...input, xSignature: makeSignature({ ...input, timestamp }) }), true);
});

test('rechaza firma incorrecta, faltante, duplicada o expirada', () => {
  const input = { secret: 'secret-test-only', now: 1700000000000, xRequestId: 'request-1', dataId: 'payment-9' };
  const timestamp = String(input.now);
  const valid = makeSignature({ ...input, timestamp });
  assert.equal(validarFirmaWebhook({ ...input, xSignature: `${valid},v1=${'0'.repeat(64)}` }), false);
  assert.equal(validarFirmaWebhook({ ...input, xSignature: valid, dataId: 'payment-other' }), false);
  assert.equal(validarFirmaWebhook({ ...input, xSignature: valid, now: input.now + 301000 }), false);
  assert.equal(validarFirmaWebhook({ ...input, xSignature: valid, xRequestId: ['request-1'] }), false);
  assert.equal(validarFirmaWebhook({ ...input, xSignature: 'ts=bad,v1=abcd' }), false);
});

test('acepta el formato de timestamp en segundos dentro de la tolerancia', () => {
  const input = { secret: 'secret-test-only', now: 1700000000000, xRequestId: 'request-2', dataId: 'pay-2' };
  const timestamp = String(input.now / 1000);
  assert.equal(validarFirmaWebhook({ ...input, xSignature: makeSignature({ ...input, timestamp }) }), true);
});
