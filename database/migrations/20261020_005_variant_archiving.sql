-- Permite retirar una variante del catálogo sin romper pedidos, ventas ni trazabilidad.
alter table public.product_variants
  add column if not exists activo boolean not null default true;

create index if not exists product_variants_activo_idx
  on public.product_variants (activo);
