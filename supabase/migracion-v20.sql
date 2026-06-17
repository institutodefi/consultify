-- =============================================================================
-- CONSULTIFY · Migración v20
-- Horas reales en las tareas de proyecto (registro de ejecución).
-- =============================================================================

begin;

alter table public.cliente_tareas add column if not exists horas_reales numeric(6,2);

comment on column public.cliente_tareas.horas_reales is 'Horas reales dedicadas a la tarea (ajuste manual durante la ejecución).';

commit;

notify pgrst, 'reload schema';
