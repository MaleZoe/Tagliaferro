# Proyectos, tareas y empleados

`20261018_002_projects.sql` agrega tablas para proyectos, fases, tareas y bitácora, con fechas, prioridades y estados controlados por restricciones. Las rutas Express limitan la consulta de empleados a su responsable o asignaciones y restringen las actualizaciones de empleados a sus propias tareas. La administración puede invitar empleados con Supabase Auth, activar/desactivar roles, crear fases y tareas, y consultar la bitácora.

`20261018_001_inventory_pos.sql` incorpora movimientos de inventario, niveles mínimos, variantes, POS y roles internos. Los endpoints administran precios/descripciones de productos existentes, stock mínimo y altas de variantes. La creación de productos y categorías sigue pendiente porque las consultas actuales no revelan la columna de relación de `products` con `sports`.

El progreso del proyecto es `tareas completadas / tareas totales`. Un proyecto sin tareas muestra 0 %. Las tareas vencidas se calculan comparando fecha límite y estado actual. La asignación inicial de administrador se realiza fuera de la aplicación por una persona autorizada; no hay alta pública de roles.

Los reportes agregan órdenes online confirmadas (`pagado`, `enviado`, `entregado`) y ventas POS completadas. Las órdenes pendientes y canceladas no se suman a ingresos. Los medios informados en POS no prueban una transacción externa.

La compilación, las políticas reales, las migraciones, el envío de invitaciones y los indicadores requieren verificación con una instancia de Supabase de desarrollo.
