-- Consulta exclusivamente de lectura para ejecutar en el SQL Editor de una instancia
-- Supabase de desarrollo. No consulta filas de negocio ni datos personales.
-- Exportá los resultados de cada bloque por separado y revisá el contenido antes de compartirlo.

-- 1. Columnas, tipos, nulabilidad, valores por defecto e identidad.
select table_name, ordinal_position, column_name, data_type, udt_schema, udt_name,
       is_nullable, column_default, is_identity, identity_generation, is_generated
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('products', 'sports', 'product_variants', 'profiles', 'orders', 'order_items')
 order by table_name, ordinal_position;

-- 2. Claves primarias, foráneas, restricciones únicas y CHECK.
select rel.relname as table_name, con.conname as constraint_name,
       case con.contype when 'p' then 'PRIMARY KEY'
                        when 'f' then 'FOREIGN KEY'
                        when 'u' then 'UNIQUE'
                        when 'c' then 'CHECK'
                        when 'x' then 'EXCLUDE'
                        else con.contype::text end as constraint_type,
       pg_get_constraintdef(con.oid, true) as definition,
       ref.relname as referenced_table
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  left join pg_class ref on ref.oid = con.confrelid
 where ns.nspname = 'public'
   and rel.relname in ('products', 'sports', 'product_variants', 'profiles', 'orders', 'order_items')
 order by rel.relname, con.contype, con.conname;

-- 3. Índices, incluso índices únicos y parciales.
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('products', 'sports', 'product_variants', 'profiles', 'orders', 'order_items')
 order by tablename, indexname;

-- 4. Estado de RLS y políticas (sin consultar filas ni identidades de usuarios).
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('products', 'sports', 'product_variants', 'profiles', 'orders', 'order_items')
 order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('products', 'sports', 'product_variants', 'profiles', 'orders', 'order_items')
 order by tablename, policyname;

-- 5. Triggers no internos y metadatos de la función asociada.
select rel.relname as table_name, trg.tgname as trigger_name,
       pg_get_triggerdef(trg.oid, true) as trigger_definition,
       proc.proname as function_name,
       pg_get_function_identity_arguments(proc.oid) as function_arguments,
       lang.lanname as function_language, proc.prosecdef as security_definer,
       proc.proconfig as function_settings
  from pg_trigger trg
  join pg_class rel on rel.oid = trg.tgrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  join pg_proc proc on proc.oid = trg.tgfoid
  join pg_language lang on lang.oid = proc.prolang
 where ns.nspname = 'public'
   and rel.relname in ('products', 'sports', 'product_variants', 'profiles', 'orders', 'order_items')
   and not trg.tgisinternal
 order by rel.relname, trg.tgname;

-- 6. Firmas y atributos de funciones relacionadas. Incluye funciones de triggers y
-- funciones cuyo código menciona estas tablas. No devuelve cuerpos de función, que
-- podrían contener literales sensibles; inspeccioná esos cuerpos en Supabase y
-- compartí solo una copia revisada/redactada si hace falta validar la lógica.
select distinct proc.oid::regprocedure::text as function_signature,
       lang.lanname as function_language, proc.prosecdef as security_definer,
       proc.provolatile as volatility, proc.proconfig as function_settings
  from pg_proc proc
  join pg_language lang on lang.oid = proc.prolang
 where proc.pronamespace = 'public'::regnamespace
   and (
     exists (
       select 1 from pg_trigger trg
       join pg_class rel on rel.oid = trg.tgrelid
       join pg_namespace ns on ns.oid = rel.relnamespace
       where trg.tgfoid = proc.oid and not trg.tgisinternal
         and ns.nspname = 'public'
         and rel.relname in ('products', 'sports', 'product_variants', 'profiles', 'orders', 'order_items')
     )
     or proc.prosrc ~* '(products|sports|product_variants|profiles|orders|order_items)'
   )
 order by function_signature;
