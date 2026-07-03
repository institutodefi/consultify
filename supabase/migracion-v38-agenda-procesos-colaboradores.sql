-- =============================================================================
-- CONSULTIFY · Migración v38
-- Las tareas MANUALES de la agenda se guardan en 'agenda_tareas'. Al añadir el
-- tipo 'proceso_interno' y los colaboradores, el modal intenta escribir estas
-- columnas en agenda_tareas, pero solo existían en cliente_tareas → el guardado
-- fallaba con "No se pudo guardar la tarea".
-- Esta migración añade esas columnas a agenda_tareas. Idempotente.
-- =============================================================================

begin;

alter table public.agenda_tareas
  add column if not exists proceso_interno_id uuid references public.procesos_internos(id) on delete set null;

alter table public.agenda_tareas
  add column if not exists colaboradores jsonb not null default '[]'::jsonb;

comment on column public.agenda_tareas.colaboradores is
  'Colaboradores invitados a la tarea: [{"id":"<uuid>","nombre":"...","email":"..."}]';

commit;

-- Recargar el schema cache de PostgREST
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
