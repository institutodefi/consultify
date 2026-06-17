-- =============================================================================
-- CONSULTIFY · Migración v18
-- Flag para saber si una tarea de proyecto fue editada a mano. La sincronización
-- desde el catálogo (tareas_catalogo) solo pisará las que NO estén editadas.
-- =============================================================================

begin;

alter table public.cliente_tareas
  add column if not exists editada_manual boolean not null default false;

comment on column public.cliente_tareas.editada_manual is
  'true si el usuario editó horas/título a mano. La sincronización desde el catálogo no la sobrescribe.';

commit;
