// Centraliza la comunicación del frontend con el catálogo versionado de la API.
const catalogUrl = import.meta.env.VITE_API_URL || '/api/v1/products';

/**
 * Obtiene el catálogo activo del servidor y normaliza los errores para mostrarlos en pantalla.
 * Devuelve una lista de productos con precios y variantes leídos desde la base configurada.
 */
export async function getProducts() {
  const response = await fetch(catalogUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('No se pudo cargar el catálogo. Intentá nuevamente.');
  const products = await response.json();
  if (!Array.isArray(products)) throw new Error('El servidor devolvió un catálogo inválido.');
  return products;
}
