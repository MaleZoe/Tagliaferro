# Seguimiento de migración

## Fase 1 — Auditoría e inicio de React (18/10/2026)

**Completado:** inspección de archivos y Git; identificación de Supabase PostgreSQL y Mercado Pago a partir del código; inventario inicial de páginas, recursos, rutas y flujos; base Vite + React Router; catálogo React conectado a una ruta versionada; filtros, búsqueda, detalle, talles con disponibilidad leída, carrito local; copia de imágenes y uso del CSS existente; README y documentación de auditoría.

## Fase 2 — Cuenta y compra React; inventario y POS (18/10/2026)

**Implementado en código:** sesión persistente Supabase Auth; registro, inicio/cierre y recuperación/actualización de contraseña; checkout con pedido y pago Mercado Pago; retorno verificado por el backend; historial de pedidos filtrado por identidad; carrito recuperable si se cancela el pago.

**Preparado en código, requiere migración:** roles internos asignables manualmente, stock mínimo, movimientos auditados, venta POS idempotente, anulación/devolución atómica, rutas Express con permisos y vistas React de inventario/POS.

**Implementado en código en esta continuación:** edición lógica de productos, alta de variantes con stock inicial, actualización de mínimos, filtros e historial de movimientos; POS con reintento idempotente, recibo y reversión autorizada; invitación/activación de empleados; proyectos, fases, tareas, bitácora y avance calculado; panel de reportes con fechas y agregados persistidos.

**Implementado en código en esta revisión:** edición controlada de nombre y apellido de un perfil existente, restringida a administración en el servidor; pantalla de edición de proyectos conectada al endpoint existente; clave estable y borrador persistido por cuenta en el POS para reintentar una venta tras perder la respuesta. El POS bloquea cambios de carrito mientras una venta está en curso o pendiente de confirmación. **Pendiente de implementar:** alta de productos y administración de categorías; edición de fases y comentarios independientes en tareas. El historial de clientes es de consulta.

**Pendiente de verificar:** instalación/compilación (`npm.cmd` respondió `ENOTFOUND registry.npmjs.org`), conexión real a Supabase, ejecutar migraciones en una base de desarrollo, navegador responsive, proveedor de invitación por correo y Mercado Pago Sandbox.

La consulta de solo lectura para exportar el esquema real está en `consulta-esquema-supabase-readonly.sql`. Hasta comparar ese resultado, no se agregarán campos de categoría ni relaciones para productos. La creación de pedidos en línea aún carece de una clave idempotente persistida; definirla requiere validar la tabla `orders` y preparar un cambio aditivo revisable. La clave POS sí se reintenta de forma estable desde el navegador, pero su garantía durable depende de la restricción/función atómica prevista en la migración y no se considera validada hasta probarla en Supabase de desarrollo.

**Revisión antes de aplicar:** los SQL aditivos infieren tipos enteros para IDs de productos/variantes y nombres de columnas por las consultas legadas; los proyectos usan tablas nuevas. Confirmar tipos/nombres y dependencias en Supabase, ensayar en una instancia de desarrollo y revisar privilegios antes de producción. No se ejecutaron cambios en la base.

## Riesgos observados para la próxima fase

- El trigger de stock de pedidos existente aún debe revisarse; el SQL nuevo de inventario/POS sí define operaciones atómicas, pendiente de ejecución y pruebas.
- RLS define si el acceso directo desde Supabase al perfil y pedidos propios está protegido.
- El servidor usa una clave con privilegios elevados; cada endpoint debe verificar autenticación y permisos explícitamente.
- Las pruebas de pago requieren credenciales de sandbox y una configuración de callback disponible.
- La página original utiliza datos de ejemplo como fallback de catálogo, que no deben confundirse con persistencia.
