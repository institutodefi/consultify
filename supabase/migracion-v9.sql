-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · MIGRACIÓN v9 — Horas TOTALES por tarea (no mensuales)
-- Modelo definitivo de tareas:
--   · tareas_catalogo.horas_base = TOTAL de la tarea (se hace una vez)
--   · La tarea se PROGRAMA en una fecha concreta (agenda_tareas), sin
--     prorrateo por meses.
--   · La EFICIENCIA del nivel NO altera las horas de la tarea (4h=4h),
--     pero SÍ las horas que consume el consultor de su capacidad
--     (eso se calcula en la app/Agenda, no se almacena distinto).
-- Ejecutar DESPUÉS de migracion-v8.sql. Idempotente.
-- ════════════════════════════════════════════════════════════════

-- 1 · Semántica de horas: total de tarea (no mensual)
comment on column tareas_catalogo.horas_base is 'Horas TOTALES de la tarea (no mensuales). Se programa una vez en una fecha.';
comment on column agenda_tareas.horas_previstas is 'Horas planificadas de la tarea (total, no mensual)';
comment on column agenda_tareas.horas_base is 'Horas de la tarea según catálogo (antes de eficiencia del consultor)';
comment on column agenda_tareas.horas_reales is 'Horas hechas (ejecución real)';

-- 2 · Asegurar que NO queda rastro del modelo "mensual / tareas_sistema"
drop trigger if exists trg_propagar_catalogo on tareas_catalogo;
drop function if exists public.propagar_catalogo();
drop table if exists tareas_sistema cascade;
alter table agenda_tareas drop column if exists tarea_sistema_id;
alter table agenda_tareas drop column if exists mes;

-- 3 · La programación de una tarea vincula a su casuística de catálogo
--     (para saber de qué casuística salió, sin propagación automática)
alter table agenda_tareas add column if not exists catalogo_id uuid references tareas_catalogo(id) on delete set null;

-- 4 · Campo opcional: horas que consume el consultor (tras eficiencia).
--     Lo calcula la app al asignar; se guarda para reporting de capacidad.
alter table agenda_tareas add column if not exists horas_consultor numeric(6,2);
comment on column agenda_tareas.horas_consultor is 'Horas que la tarea consume de la capacidad del consultor (= horas_previstas × eficiencia del nivel)';
