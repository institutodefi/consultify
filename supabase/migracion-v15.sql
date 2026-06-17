-- =============================================================================
-- CONSULTIFY · Migración v15
-- Seguimientos de una tarea: una tarea >6h se ejecuta en varios días.
-- Guardamos los tramos como JSONB: [{fecha, horas, hecho}].
-- =============================================================================

begin;

alter table public.cliente_tareas
  add column if not exists seguimientos jsonb not null default '[]'::jsonb;

comment on column public.cliente_tareas.seguimientos is
  'Tramos de ejecución de la tarea cuando supera el tope diario: [{"fecha":"YYYY-MM-DD","horas":n,"hecho":false}].';

commit;
