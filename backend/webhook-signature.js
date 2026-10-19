// Verifica la firma HMAC de Webhooks de Mercado Pago sin registrar ni exponer el secreto.
const crypto = require('node:crypto');

/** Comprueba firma y antigüedad; se esperan los valores crudos recibidos en headers y query. */
function validarFirmaWebhook({ xSignature, xRequestId, dataId, secret, now = Date.now(), toleranceSeconds = 300 }) {
  if (typeof xSignature !== 'string' || typeof xRequestId !== 'string' ||
      typeof dataId !== 'string' || !dataId || typeof secret !== 'string' || !secret) return false;

  const parts = new Map();
  for (const segment of xSignature.split(',')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (name === 'ts' || name === 'v1') {
      if (parts.has(name)) return false;
      parts.set(name, value);
    }
  }
  const timestamp = parts.get('ts');
  const provided = parts.get('v1');
  if (!/^\d+$/.test(timestamp || '') || !/^[a-f0-9]{64}$/i.test(provided || '')) return false;

  const parsedTimestamp = Number(timestamp);
  // Mercado Pago publica timestamps en milisegundos; se toleran segundos para SDKs/formats previos.
  const timestampMs = parsedTimestamp > 1e12 ? parsedTimestamp : parsedTimestamp * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > toleranceSeconds * 1000) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest();
  const received = Buffer.from(provided, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

module.exports = { validarFirmaWebhook };
