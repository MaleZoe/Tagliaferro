-- Archiva proyectos sin borrar su historial, tareas ni fases.
alter table public.projects
  add column if not exists archived_at timestamptz;

create index if not exists projects_archived_updated_idx
  on public.projects (archived_at, updated_at desc);
