# Flujo de pedidos, idempotencia y webhooks

## Estado observado en el repositorio

- `POST /api/v1/orders` y su ruta heredada `POST /api/pedidos` llaman al mismo creador. Valida el carrito y consulta precios y stock desde `product_variants` y `products`.
- La creación del pedido, la inserción de `order_items` y la creación de preferencia son llamadas separadas. No hay transacción que abarque el flujo HTTP ni clave idempotente persistida. Si el cliente pierde la respuesta y reintenta, se puede crear otro pedido.
- El comentario del servidor atribuye el descuento de stock a un trigger al insertar `order_items`, pero las migraciones disponibles en el repositorio no definen ese trigger. No se da por comprobado que exista en la instancia.
- Si insertar los ítems falla, el código solicita borrar el pedido. Si la preferencia de Mercado Pago falla, intenta cambiarlo a cancelado. El efecto de ambas operaciones sobre stock depende de triggers/reglas de la instancia y debe validarse; no se presume cascada ni reversión.
- El callback del navegador `POST /api/v1/orders/:id/confirm-payment` consulta el pago por API desde el servidor y comprueba referencia, estado, moneda e importe antes de actualizar. La actualización de aprobación filtra `estado = pendiente`; una repetición concurrente vuelve a leer el estado persistido. El navegador por sí solo no puede marcarlo como pagado.
- No existe ruta de webhook de Mercado Pago ni `notification_url` en la preferencia. El retorno/callback de navegador no sustituye a la notificación de servidor.
- POS sí tiene un patrón distinto en la migración local: `register_pos_sale` recibe `p_request_key` y opera en SQL, en una transacción, con idempotencia por clave. Esa migración local no demuestra nada sobre la instancia Supabase ni sobre pedidos online.

## Cambios de código realizados

- `backend/payment-service.js` encapsula la consulta autoritativa y la escritura condicional del callback existente. Los errores de consulta o escritura no producen confirmación.
- `backend/payment-validation.js` mantiene pendiente un pedido ante pagos pendientes, en proceso, rechazados o cancelados. Solo `approved` con referencia, importe y moneda ARS exactos permite proponer `pagado`; el pedido se cancela por la operación explícita de cancelación, no por una respuesta de error/rechazo del pago.
- `backend/webhook-signature.js` implementa verificación HMAC SHA-256 de `x-signature` usando `data.id`, `x-request-id`, `ts`, comparación de tiempo constante y tolerancia de cinco minutos. Se debe alimentar con los valores crudos de headers y query. La utilidad no está conectada a una ruta porque aún no hay persistencia idempotente verificada.
- `backend/webhook-payment-service.js` define el contrato del procesador: obtiene el pago actual desde Mercado Pago, consulta el pedido y delega la deduplicación y transición a un adaptador que debe ser atómico en Supabase. No es persistencia ni endpoint productivo por sí solo.

## Cambios de esquema que deben prepararse después de validar la instancia

No se generó ni ejecutó SQL de modificación. Antes de diseñarlo hay que ejecutar `docs/03-Desarrollo/consulta-esquema-supabase-readonly.sql` en la instancia de desarrollo y exportar sus resultados. Faltan confirmar, como mínimo:

- tipo y generación de `orders.id`, columnas de importe/estado, nulabilidad, defaults, claves y restricciones;
- FK, políticas RLS, grants y triggers sobre `orders`, `order_items` y `product_variants`, además de funciones invocadas por ellos;
- cómo se reserva, descuenta y devuelve el stock de pedidos online, y si `order_items` se borra en cascada;
- si ya existe una clave de solicitud o identificador único de pago con semántica compatible.

La propuesta funcional que debe mapearse a ese esquema es:

1. Recibir una clave estable de checkout por pedido lógico y hacerla única por cliente en persistencia. Guardar o calcular un fingerprint del carrito/dirección para rechazar reutilización de clave con contenido distinto. Repetir una solicitud debe devolver el mismo pedido y enlace de preferencia, no crear otra reserva.
2. Mover creación de pedido, detalles y reserva/descuento de stock a una función transaccional SQL que vuelva a leer precios, bloquee variantes y revierta todos los cambios si una línea no tiene stock. No basarse en lecturas previas de stock hechas por el API.
3. Para notificaciones, agregar deduplicación durable de evento (y protección única por pago cuando aplique) y aplicar el estado de pedido/stock en una sola transacción. Una notificación repetida o fuera de orden no debe confirmar, cancelar ni descontar stock por segunda vez.
4. Diseñar la reversión/liberación de reservas únicamente después de inspeccionar triggers y estados reales. `rejected`, fallos de red o respuestas inválidas no son instrucción para cancelar automáticamente.

Esos puntos son requisitos de diseño, no nombres de columnas/tablas ni SQL listo para ejecutar. Se necesitan los metadatos reales antes de proponer la migración concreta. No se tuvo acceso a Supabase y no se ejecutó ninguna migración.

## Mercado Pago: verificación necesaria

Para un endpoint futuro se debe configurar Webhooks de pago en la aplicación de Mercado Pago, guardar la clave webhook solo en backend (`MP_WEBHOOK_SECRET`) y validar la firma antes de confiar en IDs. Luego se consulta el pago en `GET /v1/payments/{id}` con el token de servidor, se comprueba referencia/importe/moneda/estado contra el pedido persistido y se encola/procesa idempotentemente. Se debe responder éxito solo después de registrar duraderamente el evento o encolar su identificador. No se debe confiar en el JSON recibido ni en los parámetros del retorno del navegador.

La implementación HMAC unitaria sigue el formato documentado por Mercado Pago. No se validó con simulador ni cuenta de desarrollo; no se creó preferencia/cobro real. Hasta añadir el adaptador transaccional verificado, no registrar un webhook de producción ni declarar listo el checkout.

## Pruebas unitarias

Los mocks prueban reglas de servicio, no simulan persistencia en la aplicación:

- callbacks repetidos y transición condicional;
- estado de pago desconocido;
- rechazo/cancelación sin transición automática;
- errores al consultar Mercado Pago, actualizar o releer Supabase;
- firma HMAC correcta, inválida, manipulada, duplicada y fuera de tolerancia;
- contrato del procesador para notificación repetida, errores de consulta y pedido inexistente.

La última prueba de webhook usa un repositorio falso que demuestra el contrato requerido; no demuestra que la instancia tenga la restricción/transacción necesaria ni que ya exista un endpoint HTTP de webhook.
