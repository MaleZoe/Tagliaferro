# Requerimientos iniciales

Este documento separa capacidades observadas de objetivos todavía no verificados. No contiene resultados de encuestas ni datos de participantes.

## Problema y objetivo

La tienda actual concentra interfaz, lógica y acceso al servicio en scripts de navegador y un servidor Express pequeño. El objetivo es evolucionar gradualmente a una aplicación React con API mantenible, persistencia confiable, controles por rol y documentación para el ciclo de vida escolar, conservando el catálogo y la identidad de Élite Sport.

## Roles objetivo

- **Cliente:** consultar productos, gestionar carrito, comprar y consultar sus propios pedidos.
- **Empleado:** operar tareas autorizadas, consultar catálogo/inventario y realizar ventas presenciales cuando esos módulos estén disponibles.
- **Administrador:** gestionar catálogo, inventario, pedidos, personal, proyectos y reportes.

Los roles empleado y administrador son objetivos del sistema; el repositorio inicial no evidencia su implementación ni su origen de confianza.

## Requerimientos funcionales objetivo

1. Consultar catálogo activo, filtrar deportes, buscar, ver detalles y talles disponibles.
2. Mantener carrito y recalcular precio, disponibilidad y envío en el servidor al crear un pedido.
3. Autenticar clientes y limitar acceso a sus propios pedidos.
4. Administrar productos y categorías con desactivación lógica.
5. Registrar movimientos de inventario con responsable y motivo, evitando stock negativo concurrente.
6. Registrar ventas presenciales y actualizar inventario dentro de una operación confiable.
7. Gestionar clientes, empleados, roles y estados de cuenta con autorización.
8. Gestionar proyectos, fases, tareas, responsables, vencimientos e historial.
9. Calcular indicadores desde datos persistidos y distinguir estados de pedido/pago.

## Requerimientos no funcionales y reglas

- Contraseñas y sesiones se delegan a Supabase Auth existente hasta revisar su configuración; nunca aceptar roles administrativos desde registro público.
- La interfaz no es autoridad para precio, stock o permisos.
- Conservar capturas históricas de nombre/precio de artículo en ventas/pedidos.
- No ejecutar migraciones de producción sin revisión y autorización explícitas.
- Mantener la versión original mientras la regresión no esté verificada.
- Interfaz responsive, mensajes de carga/error/vacío y navegación accesible.

## Encuestas

Preparar encuestas para clientes, empleados y administradores. Las preguntas y plantillas de captura se entregarán en la fase de relevamiento; las respuestas quedan pendientes de recolección real y no deben inventarse.

## Criterio de aceptación de esta fase

El nuevo catálogo se carga desde una API versionada, permite búsqueda, filtro, detalle y selección de talles, y el carrito se conserva entre recargas. La instalación y la revisión visual aún requieren ejecución en un entorno con npm y los servicios configurados.
