// Recupera o crea una clave estable para reintentar una operación POS después de recargar la página.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Separa los borradores por usuario para que cuentas distintas en una caja no compartan operaciones.
function storageKeys(ownerId = 'default') {
  const owner = encodeURIComponent(String(ownerId || 'default'));
  return { key: `es_pos_${owner}_request_key`, pending: `es_pos_${owner}_pending_operation` };
}

export function getOrCreateRequestKey(storage, cryptoApi, ownerId) {
  const keys = storageKeys(ownerId);
  const saved = storage.getItem(keys.key);
  if (saved && UUID_PATTERN.test(saved)) return saved;
  const created = cryptoApi.randomUUID();
  storage.setItem(keys.key, created);
  return created;
}

// Recupera exactamente la operación no resuelta; los datos guardados solo restauran la interfaz, no son autoridad.
export function readPosDraft(storage, cryptoApi, ownerId) {
  const keys = storageKeys(ownerId);
  try {
    const draft = JSON.parse(storage.getItem(keys.pending) || 'null');
    const validKey = typeof draft?.requestKey === 'string' && UUID_PATTERN.test(draft.requestKey);
    const validMethod = ['efectivo', 'tarjeta', 'transferencia', 'otro'].includes(draft?.paymentMethod);
    const validItems = Array.isArray(draft?.items) && draft.items.length > 0 && draft.items.every((item) =>
      Number.isSafeInteger(item.variantId) && item.variantId > 0 && Number.isInteger(item.qty) && item.qty > 0 &&
      typeof item.name === 'string' && typeof item.size === 'string' && Number.isFinite(Number(item.price)));
    if (validKey && validMethod && validItems) return { requestKey: draft.requestKey, paymentMethod: draft.paymentMethod, cart: draft.items, pending: true };
  } catch { /* Un borrador corrupto se descarta y se inicia una operación nueva. */ }
  return { requestKey: getOrCreateRequestKey(storage, cryptoApi, ownerId), paymentMethod: 'efectivo', cart: [], pending: false };
}

// Guarda el carrito antes del POST para poder reintentar con la misma clave si se pierde la respuesta.
export function savePosDraft(storage, operation, ownerId) {
  storage.setItem(storageKeys(ownerId).pending, JSON.stringify({
    requestKey: operation.requestKey,
    paymentMethod: operation.paymentMethod,
    items: operation.items,
  }));
}

// Solo se rota la clave después de recibir éxito del servidor o rechazo definitivo de validación.
export function finishPosDraft(storage, cryptoApi, ownerId) {
  const keys = storageKeys(ownerId);
  storage.removeItem(keys.pending);
  const nextKey = cryptoApi.randomUUID();
  storage.setItem(keys.key, nextKey);
  return nextKey;
}
