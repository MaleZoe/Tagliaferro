# Migración aditiva de inventario y POS

Archivo: `database/migrations/20261018_001_inventory_pos.sql`. Se preparó para revisión y no se aplicó.

## Estructuras agregadas

- `app_user_roles`: rol activo ligado a usuario Auth (`administrador`, `empleado`, `cliente`). No hay escritura pública; el primer administrador se designa mediante operación manual autorizada.
- `product_variants.stock_minimo`: alerta por talle, separada de las existencias actuales.
- `inventory_movements`: responsable, motivo, cantidad, saldos previo/posterior, fecha y vínculo opcional a una venta.
- `sales` y `sale_items`: operación POS idempotente con medio informado y captura histórica del artículo, talle, cantidad y precio.

## Operaciones atómicas

`register_inventory_movement` bloquea una variante, impide saldo negativo, cambia existencias y audita dentro de la transacción. `register_pos_sale` bloquea variantes ordenadas por ID, vuelve a leer precio y stock, guarda venta/detalle/movimientos juntos y devuelve el resultado previo ante reintentos con la misma clave. `reverse_pos_sale` solo revierte ventas completadas, repone existencias y conserva el motivo.

Las funciones `SECURITY DEFINER` fijan `search_path`, revocan ejecución a `public`, `anon` y `authenticated`, y conceden uso a `service_role`, que permanece solo en backend. Express consulta el rol asignado antes de invocar funciones.

## Revisión necesaria

Las consultas legadas confirman los nombres `products.id/nombre/precio/activo` y `product_variants.id/product_id/talle/stock`, pero no hay exportación SQL para comprobar tipos y constraints. Validar los tipos ID, privilegios/RLS y funcionamiento en un proyecto de desarrollo, incluyendo stock concurrente y rollback. No ejecutar esta migración en producción antes de revisarla.
