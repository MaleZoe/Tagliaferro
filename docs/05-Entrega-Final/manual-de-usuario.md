# Manual de usuario — Élite Sport

## Estado y alcance

Este manual describe las pantallas React y las rutas que existen en el repositorio. La operación requiere una instancia Supabase de desarrollo con el esquema y las migraciones correspondientes, variables de entorno configuradas y compilación exitosa. No representa una certificación de producción.

## Inicio local

1. Instalar Node.js 22 o superior.
2. En `backend/`, copiar `.env.example` a `.env` y completar URL/clave de servidor de Supabase, token de pruebas de Mercado Pago y `FRONT_URL`. Nunca copiar la clave de servicio al frontend.
3. Instalar dependencias del backend y ejecutar `npm run dev`.
4. En otra terminal, en `frontend/`, copiar `.env.example` a `.env`, cargar URL y clave anon pública de Supabase y ejecutar `npm install` seguido de `npm run dev`.
5. Abrir la URL local que informa Vite. Si npm no puede resolver `registry.npmjs.org`, la instalación y la compilación quedan bloqueadas; no quitar ni regenerar lockfiles para resolverlo.

La página original sigue en el `index.html` de la raíz. La aplicación React usa el punto de entrada `frontend/index.html`.

## Cliente

1. Crear una cuenta o iniciar sesión desde **Mi cuenta**. La recuperación usa el correo configurado en Supabase Auth.
2. Buscar productos, filtrar por deporte, abrir el detalle y seleccionar un talle disponible.
3. Ajustar cantidades en el carrito. Los precios que muestra el carrito son informativos; el servidor vuelve a leer precio y stock al crear el pedido.
4. Completar dirección y continuar a Mercado Pago. El servidor crea un pedido pendiente y devuelve el enlace de pago.
5. El retorno del navegador no confirma el pago. La aplicación solicita al backend una verificación con la API de Mercado Pago. Si la consulta falla, consultar **Mis pedidos** antes de reintentar.
6. **Mis pedidos** muestra el historial de la cuenta autenticada. La ruta de cancelación solo acepta pedidos pendientes.

La clave idempotente persistida del checkout y el webhook durable aún no están implementados; evitar reintentar manualmente un checkout si se perdió la respuesta hasta consultar el pedido.

## Empleado

El personal con rol activo puede consultar inventario, registrar entradas/salidas con motivo y operar el POS. El POS registra el medio de pago que informa el empleado; no procesa tarjetas ni verifica transferencias. Cada venta se valida contra precios y stock del servidor y requiere una base con la migración POS revisada. Si se corta la conexión después de enviar una venta, la pantalla conserva el mismo carrito y clave para reintentarla; esperá el resultado antes de iniciar otra venta. El borrador se guarda por cuenta en ese navegador y el servidor vuelve a verificar usuario, precio, stock y clave idempotente.

El empleado también puede consultar tareas asignadas y actualizar su estado u observaciones. Las rutas del backend vuelven a comprobar asignación y rol.

## Administrador

El administrador puede consultar y editar clientes, invitar empleados, cambiar permisos, ajustar inventario, revertir ventas con motivo, crear y editar proyectos, administrar fases y tareas y abrir reportes.

El alta de productos y categorías no se documenta como disponible: hace falta confirmar en Supabase el esquema real y la relación de productos con deportes. La edición de productos existentes opera solo sobre columnas que ya utiliza el catálogo.

No hay un botón de creación pública de administrador. El primer administrador debe asignarse mediante el procedimiento seguro definido por el operador de Supabase, después de validar la instancia.

## Soporte y errores

- **No se pudo validar el catálogo/perfil:** comprobar disponibilidad de la API y conectividad con Supabase.
- **La migración debe estar aplicada:** validar y aplicar primero en una instancia de desarrollo; no ejecutar las migraciones locales directamente en producción.
- **Pago pendiente:** abrir el historial y verificar el estado con el backend; no usar los parámetros de la URL como confirmación.
- **No hay stock suficiente:** actualizar el carrito y volver a confirmar disponibilidad.

Las políticas RLS, triggers de pedidos online y flujo integral de pago deben revisarse con el esquema y credenciales de desarrollo antes de usar el sistema con datos reales.
