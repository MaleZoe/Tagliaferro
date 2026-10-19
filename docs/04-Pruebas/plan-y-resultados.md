# Plan y resultados de pruebas

## Casos previstos

| ID | Escenario | Resultado esperado | Estado |
|---|---|---|---|
| CAT-01 | API disponible y catálogo cargado en React | Productos desde Supabase, sin productos de ejemplo | Pendiente de entorno |
| CAT-02 | Fallo HTTP de catálogo | Mensaje claro y botón de reintento | Implementado, ejecución pendiente |
| CAT-03 | Buscar por nombre o deporte | Lista filtrada coincide con consulta | Implementado, ejecución pendiente |
| CAT-04 | Filtrar por deporte | Solo productos de ese deporte | Implementado, ejecución pendiente |
| CAT-05 | Elegir talle agotado | Variante no seleccionable | Implementado, ejecución pendiente |
| CART-01 | Agregar producto y recargar | Carrito persiste | Implementado, ejecución pendiente |
| ORD-01 | Crear compra con stock insuficiente | API rechaza y no confirma pedido | Requiere Supabase y pruebas de integración |
| SEC-01 | Cliente solicita recurso de otro usuario | Backend niega acceso | Revisar RLS y cubrir por pruebas |
| INV-01 | Descontar concurrentemente última unidad | Una operación como máximo tiene éxito; no hay stock negativo | Requiere esquema/trigger y prueba concurrente |
| AUTH-01 | Crear cuenta, entrar, recuperar contraseña | Supabase gestiona sesión y recuperación | Código agregado; ejecución pendiente |
| ORD-02 | Volver aprobado desde Mercado Pago | Backend consulta pago y actualiza el pedido propio | Requiere credenciales y entorno de pruebas |
| POS-01 | Confirmar venta con clave repetida | Solo queda una venta y un descuento de stock | Requiere aplicar migración en entorno de prueba |
| POS-02 | Revertir venta | Restituye stock con responsable y motivo | Requiere aplicar migración en entorno de prueba |
| PRJ-01 | Crear proyecto, fase y tarea | Registra historial y avance basado en tareas | Requiere aplicar migración en entorno de prueba |
| EMP-01 | Invitar y desactivar empleado | Auth envía invitación; backend modifica rol activo | Requiere proyecto Supabase/correo |
| REP-01 | Filtrar período sin registros | Muestra ceros/estados vacíos desde datos reales | Requiere migraciones y datos de entorno |

## Resultados ejecutados

En la revisión anterior pasaron 13 pruebas unitarias. Se ampliaron para callbacks repetidos, estados inesperados, rechazos/cancelaciones sin cancelación automática, errores de consulta/escritura, firmas HMAC, el contrato de deduplicación de notificaciones y persistencia de la clave de reintento del POS.

Resultado actualizado: `node --test backend/tests/*.test.js` ejecutó 27 pruebas y pasaron las 27 (0 fallos). Incluye pruebas con mocks para repetición de venta POS, aislamiento de claves entre cuentas, clave inválida, callbacks repetidos, firma y errores de consulta/escritura; no equivale a una prueba integral de las transacciones de Supabase. La interfaz React fue editada pero no compilada en este entorno.

`npm run build` en `frontend/` no pudo compilar: el comando termina con `"vite" no se reconoce`, porque no existe `frontend/node_modules`. `npm ping --fetch-retries=0 --fetch-timeout=5000` devuelve `ENOTFOUND registry.npmjs.org` (`getaddrinfo`); el registro configurado es el predeterminado HTTPS, `offline=false`, proxy y https-proxy de npm son `null`, no hay `.npmrc` en el repositorio ni variables de proxy/configuración npm activas. `Resolve-DnsName registry.npmjs.org` devuelve `Acceso denegado` en este entorno. No se modificó ningún lockfile ni se cambiaron versiones.

La lógica de validación de pago se prueba sin credenciales ni solicitudes externas. La actualización condicional del pedido impide aplicar dos veces la transición del callback: la repetición consulta el estado persistido. Rechazos y cancelaciones de pago dejan el pedido pendiente y no llaman la transición de cancelación. No hay endpoint webhook/notificaciones productivo en el backend. El módulo de firma tiene pruebas unitarias sintéticas; no se probó mediante simulador de Mercado Pago. El procesador webhook se prueba con un repositorio falso y requiere un adaptador transaccional real antes de estar disponible en producción.

La compilación React, los flujos de navegador, Supabase y Mercado Pago no se pudieron ejecutar. Las búsquedas `npm cache ls` para Vite, React, Supabase JS y Express no devolvieron entradas. Las migraciones SQL no se ejecutaron ni se reportan como aprobadas. El retorno sin `payment_id` conserva el pedido pendiente; una respuesta de error al consultar Mercado Pago tampoco cancela el pedido. Un rechazo/cancelación solo se procesa tras consultar el ID del pago en Mercado Pago. Si falla la creación de la preferencia antes de redirigir, el backend intenta liberar la reserva y registra si no pudo hacerlo. La función de edición de clientes se limita a `nombre` y `apellido`, pero requiere confirmar en la instancia que exista el perfil correspondiente.

La creación de pedidos en línea no tiene todavía una clave de idempotencia persistida: un reintento del `POST /orders` después de perder la respuesta podría crear otro pedido pendiente. No se agregó una columna ni una migración para resolverlo porque falta confirmar el esquema real. En el POS, el cliente conserva y reutiliza una clave UUID y el mismo borrador después de un resultado de red incierto; la protección durable requiere la migración y función SQL existente, cuya aplicación/prueba real sigue pendiente. Como no existe webhook ni protección durable contra eventos repetidos, la reconciliación externa automática está pendiente. Los detalles y propuesta están en `docs/03-Desarrollo/flujo-pedidos-idempotencia-webhooks.md`.

La consulta de esquema de solo lectura está en `docs/03-Desarrollo/consulta-esquema-supabase-readonly.sql`; debe ejecutarse en SQL Editor de una instancia de desarrollo. No se tuvo acceso a Supabase para obtener resultados reales.
