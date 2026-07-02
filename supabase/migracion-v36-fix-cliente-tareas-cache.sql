-- =============================================================================
-- CONSULTIFY · Reparación v36 · Columnas de cliente_tareas + recarga de schema
-- -----------------------------------------------------------------------------
-- Soluciona: "Could not find the 'bloques_ejecucion' column of 'cliente_tareas'
-- in the schema cache" al distribuir la agenda.
--
-- Causa: la columna no existe en la BD (migración v21 no ejecutada) o PostgREST
-- tiene el schema cache desactualizado. Este script es IDEMPOTENTE: se puede
-- ejecutar tantas veces como haga falta sin romper nada.
--
-- Cómo ejecutarlo: Supabase → SQL Editor → pega esto → Run.
-- =============================================================================

begin;

-- 1) Asegurar TODAS las columnas jsonb/flags que usa la distribución de agenda.
--    (add column if not exists no falla si ya existen.)
alter table public.cliente_tareas
  add column if not exists bloques_ejecucion jsonb not null default '[]'::jsonb;

alter table public.cliente_tareas
  add column if not exists seguimientos jsonb not null default '[]'::jsonb;

alter table public.cliente_tareas
  add column if not exists normas_integradas jsonb not null default '[]'::jsonb;

alter table public.cliente_tareas
  add column if not exists editada_manual boolean not null default false;

-- Columnas de fecha/estado que el insert también usa (por si acaso faltara alguna):
alter table public.cliente_tareas
  add column if not exists fecha_estimada date;
alter table public.cliente_tareas
  add column if not exists fecha_real date;
alter table public.cliente_tareas
  add column if not exists hecha boolean not null default false;

comment on column public.cliente_tareas.bloques_ejecucion is
  'Bloques de ejecución [{"fecha":"YYYY-MM-DD","horas":4}]. Una tarea de 20h = 5 bloques.';

commit;

-- 2) Verificación rápida: lista las columnas actuales de cliente_tareas.
--    (Deberías ver bloques_ejecucion, seguimientos, normas_integradas, etc.)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'cliente_tareas'
order by ordinal_position;

-- 3) Forzar la recarga del schema cache de PostgREST.
--    El NOTIFY es la vía oficial; si el cache siguiera obsoleto tras esto,
--    ve a Supabase → Settings → API → "Restart server" / "Reload schema",
--    o Database → Extensions y guarda para provocar un reload.
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
