-- =============================================================================
-- CONSULTIFY · Migración v21
-- Bloques de ejecución de una tarea: [{fecha, horas}] (4h por defecto, editables).
-- Cada bloque se vuelca como un evento independiente en la agenda.
-- =============================================================================

begin;

alter table public.cliente_tareas
  add column if not exists bloques_ejecucion jsonb not null default '[]'::jsonb;

comment on column public.cliente_tareas.bloques_ejecucion is
  'Bloques de ejecución [{"fecha":"YYYY-MM-DD","horas":4}]. Una tarea de 20h = 5 bloques.';

commit;

notify pgrst, 'reload schema';
