# Auditoría inicial e inventario

Fecha de inspección: 18 de octubre de 2026. Rama `main`, commit base `8b8eb4c`. Al inicio de la inspección `git status --short --branch` indicó que no había cambios locales.

## Archivos y recursos localizados

| Ruta | Responsabilidad observada |
|---|---|
| `index.html` | Página única de tienda, con modales, paneles, navegación y secciones de marca. |
| `styles.css` | Estilo global responsive, componentes del e-commerce, paneles y estados de pedido. |
| `script.js` | Catálogo, autenticación Supabase, sesión, carrito, lista de deseos, pedidos, pago y comportamiento de interfaz. |
| `config.js` | URL, clave pública anon de Supabase y URL local de API; inicializa Supabase JS en el navegador. |
| `backend/server.js` | API Express que verifica tokens Supabase, consulta productos, registra pedidos y conversa con Mercado Pago. |
| `backend/package.json` | Dependencias de Express, CORS, dotenv y cliente Supabase. No tenía pruebas configuradas. |
| `img/` | Imágenes del catálogo por deporte (Tenis, Natación, Equitación, Golf, Remo y Hockey), colecciones y tarjetas. |
| `upscale.py` | Script auxiliar Python; no se encontró evidencia de que sea parte del flujo de la aplicación. |
| `actualizado.zip` | Archivo empaquetado; no se modificó ni se usó como fuente durante esta auditoría. |

No se localizaron otros HTML, scripts de esquema SQL, migraciones, semillas, `.env.example` previo, README o manifiestos frontend. Tampoco hay archivos de configuración de pasarela aparte del backend y `config.js`.

## Base de datos e integraciones

El repositorio revela un proyecto Supabase: el navegador usa Supabase Auth con la clave anon y la API usa `@supabase/supabase-js` con `SUPABASE_SERVICE_KEY`. Las consultas muestran tablas o relaciones llamadas `products`, `sports`, `product_variants`, `profiles`, `orders` y `order_items`. El backend espera un trigger que descuente y devuelva stock al insertar los detalles o cancelar pedidos. No se encontró su definición, por lo que la atomicidad, RLS, restricciones, índices y política de roles no se pueden verificar aquí. Mercado Pago recibe preferencias y se consulta para validar el pago; no se encontraron webhooks.

La URL de Supabase y una clave anon están escritas en `config.js`. Esa clave es identificador público del cliente; la protección efectiva depende de RLS, que falta revisar. La clave `SUPABASE_SERVICE_KEY` se usa solo en servidor y no debe divulgarse. La credencial de Mercado Pago tampoco está en el repositorio inspeccionado.

## Rutas y flujos actuales

| Ruta/flujo | Estado según el código encontrado |
|---|---|
| `GET /api/salud` | Responde estado básico del proceso; no verifica base ni Mercado Pago. |
| `GET /api/productos` | Consulta productos activos, deporte, variantes y stock. Si falla, el cliente original cae a productos de ejemplo locales. |
| `POST /api/pedidos` | Requiere token Supabase; valida forma del carrito/dirección, obtiene precio/stock de Supabase, calcula envío, crea pedido y detalles, y crea preferencia Mercado Pago. |
| `POST /api/pedidos/:id/confirmar-pago` | Verifica el pago consultando Mercado Pago y relaciona la referencia externa con el pedido del cliente. |
| `POST /api/pedidos/:id/cancelar` | Permite al cliente cancelar su pedido; el código espera devolución automática de stock. |
| Registro e inicio de sesión | El cliente usa `signUp` y `signInWithPassword` directamente en Supabase Auth; el perfil se consulta en `profiles`. No se observó recuperación de contraseña. |
| Pedidos propios | Se leen directamente con Supabase desde el navegador, según el ID de la sesión; depende de RLS. |
| Catálogo | Se filtra por deporte en el navegador; detalle muestra talles/stock; lista de deseos se guarda en navegador. |
| Carrito | Persistido en `localStorage`; suma, resta, quita ítems y calcula una vista previa. El backend calcula precio y envío definitivos. |
| Checkout | Valida dirección, crea pedido a través de API y redirige a Mercado Pago. |
| Sitio/marketing | Hero, deportes, colecciones, novedades, tecnología, membresía, nosotros y footer; carrusel, menú móvil y búsqueda. |

No se hallaron pantallas ni endpoints de administración, empleados, POS, gestión de stock, clientes, proyectos, reportes o roles administrativos. Esos puntos no se consideran implementados.

## Arquitectura inicial y estrategia gradual

Se conserva `index.html` como referencia sin sobrescribirlo. `frontend/` introduce Vite, React y React Router; el catálogo usa un módulo central de servicios y consulta la API versionada. `backend/` mantiene rutas anteriores para no romper la página existente, agrega la versión `/api/v1/products`, limita los orígenes CORS y aplica límites básicos de solicitudes en memoria. El limitador en memoria es por proceso y no reemplaza una política distribuida si se ejecuta con varias instancias. Las imágenes se copian a `frontend/public/img` y la hoja de estilos original se importa para preservar la apariencia.

La próxima fase debe obtener el esquema y políticas reales de Supabase, documentar restricciones/triggers/RLS, y recién entonces definir transacciones, roles y migraciones. Después corresponde migrar auth/pedidos y añadir módulos de inventario, POS y proyectos con pruebas y datos reales. La interfaz nueva todavía no se declara reemplazo completo.
