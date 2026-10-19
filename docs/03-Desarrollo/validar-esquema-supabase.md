# Validar el esquema real de Supabase

La consulta [consulta-esquema-supabase-readonly.sql](consulta-esquema-supabase-readonly.sql) obtiene metadatos de `products`, `sports`, `product_variants`, `profiles`, `orders` y `order_items`. Usa catálogos del sistema e `information_schema`; no lee filas de negocio ni modifica la base.

## Ejecutarla y exportar resultados

1. Abrí el proyecto **de desarrollo** correcto en Supabase y entrá a **SQL Editor**.
2. Abrí el archivo SQL del repositorio y pegá su contenido en una consulta nueva. Revisá que el proyecto seleccionado sea el de desarrollo, nunca producción.
3. Ejecutá cada bloque `SELECT` por separado para que cada grilla corresponda a una sección: columnas, restricciones, índices, estado de RLS, políticas, triggers y funciones relacionadas.
4. Descargá cada grilla como CSV desde el resultado del editor, o copiá sus filas a CSV. Nombralas `columnas.csv`, `restricciones.csv`, `indices.csv`, `rls.csv`, `politicas.csv`, `triggers.csv` y `funciones.csv`.
5. Revisá las exportaciones antes de compartirlas. No agregues capturas de configuración del proyecto, filas de clientes, credenciales, variables de entorno ni cuerpos de funciones que pudieran contener valores literales sensibles.
6. Compartí los CSV de metadatos para comparar tipos, relaciones y políticas. Para revisar la lógica de un trigger, inspeccioná su función dentro de Supabase y compartí únicamente una versión revisada y redactada si contiene literales privados.

La consulta devuelve firmas, permisos de ejecución y configuración de las funciones, pero omite intencionalmente sus cuerpos. Los cuerpos pueden revisarse por separado sin exportarlos sin filtrar.

## Alcance de esta revisión

No hay credenciales de servidor ni acceso de red a la instancia Supabase en este entorno. Por eso no se afirma que los nombres, tipos, triggers, RLS o relaciones descritos por el código coincidan con el esquema real. La relación entre productos y deportes, y la compatibilidad de las migraciones con los tipos de clave existentes, quedan pendientes de comparar contra estos resultados. No se ejecutó ninguna migración.
