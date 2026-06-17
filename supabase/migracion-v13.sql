-- =============================================================================
-- CONSULTIFY · Migración v13
-- Puente Planificador (cliente_tareas) → Agenda (agenda_tareas).
-- Añade el vínculo para sincronizar sin duplicar.
-- =============================================================================

begin;

alter table public.agenda_tareas
  add column if not exists origen_cliente_tarea_id uuid references public.cliente_tareas(id) on delete cascade;

create unique index if not exists uq_agenda_origen_cliente_tarea
  on public.agenda_tareas (origen_cliente_tarea_id)
  where origen_cliente_tarea_id is not null;

comment on column public.agenda_tareas.origen_cliente_tarea_id is
  'Si la tarea de agenda proviene del planificador de un cliente, referencia a cliente_tareas. Permite sincronizar sin duplicar.';

commit;

-- VERIFICACIÓN (aparte):
-- select count(*) from public.agenda_tareas where origen_cliente_tarea_id is not null;
