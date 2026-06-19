-- =============================================================================
-- CONSULTIFY · Migración v22
-- Agenda: varias fechas efectivas que suman horas reales + horas planificadas.
-- =============================================================================

begin;

-- Número de tarea dentro del proyecto (para el código CLI-Txxx).
alter table public.cliente_tareas
  add column if not exists num_tarea integer;

-- Varias ejecuciones reales por evento: [{fecha, horas}]. La suma = horas reales.
alter table public.agenda_tareas
  add column if not exists ejecuciones jsonb not null default '[]'::jsonb;

-- Horas planificadas (inicio/fin) del bloque.
alter table public.agenda_tareas
  add column if not exists hora_inicio text;
alter table public.agenda_tareas
  add column if not exists hora_fin    text;

-- Código legible de la tarea/bloque (CLI001-T005-B2).
alter table public.agenda_tareas
  add column if not exists codigo text;

comment on column public.agenda_tareas.ejecuciones is
  'Fechas efectivas con horas: [{"fecha":"YYYY-MM-DD","horas":n}]. La suma alimenta horas_reales.';
comment on column public.agenda_tareas.hora_inicio is 'Hora de inicio planificada (HH:MM).';
comment on column public.agenda_tareas.hora_fin is 'Hora de fin planificada (HH:MM).';
comment on column public.agenda_tareas.codigo is 'Código legible: Cliente-Txxx-By.';

-- La restricción de horas_reales <= 9 estorba si sumamos varias ejecuciones.
-- La relajamos (la suma puede superar 9 entre varios días).
alter table public.agenda_tareas drop constraint if exists agenda_tareas_horas_reales_check;

commit;

notify pgrst, 'reload schema';
