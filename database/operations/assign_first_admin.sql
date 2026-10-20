-- Asigna explícitamente el primer administrador en Supabase.
-- Reemplazá el correo de ejemplo por el correo exacto con el que iniciás sesión.
-- Ejecutar en SQL Editor con una cuenta operadora de confianza, después de aplicar
-- database/migrations/20261018_001_inventory_pos.sql.
begin;

do $$
declare
  admin_email text := 'REEMPLAZAR_POR_EL_CORREO_ADMIN';
  admin_user_id uuid;
begin
  if admin_email = 'REEMPLAZAR_POR_EL_CORREO_ADMIN' then
    raise exception 'Reemplazá admin_email por el correo real antes de ejecutar este SQL.';
  end if;

  select id into admin_user_id
    from auth.users
   where lower(email) = lower(trim(admin_email));

  if admin_user_id is null then
    raise exception 'No existe una cuenta Auth con el correo indicado: %', admin_email;
  end if;

  insert into public.app_user_roles (user_id, role, active, updated_at)
  values (admin_user_id, 'administrador', true, now())
  on conflict (user_id) do update
    set role = excluded.role,
        active = true,
        updated_at = now();
end $$;

commit;
