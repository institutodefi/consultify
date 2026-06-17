-- =============================================================================
-- CONSULTIFY · Migración v19 (consolidada)
-- Asegura TODAS las columnas que la app escribe en cliente_tareas.
-- Resuelve: "Could not find the 'tipo' column of 'cliente_tareas'".
-- Idempotente: se puede ejecutar aunque ya hayas corrido v15/v16/v18.
-- =============================================================================

begin;

alter table public.cliente_tareas add column if not exists tipo              text default 'produccion';
alter table public.cliente_tareas add column if not exists reduccion_pct     numeric(5,2) not null default 0;
alter table public.cliente_tareas add column if not exists seguimientos      jsonb not null default '[]'::jsonb;
alter table public.cliente_tareas add column if not exists proyecto_id       uuid references public.proyectos_cliente(id) on delete cascade;
alter table public.cliente_tareas add column if not exists integrada         boolean not null default false;
alter table public.cliente_tareas add column if not exists normas_integradas text[] not null default '{}';
alter table public.cliente_tareas add column if not exists editada_manual    boolean not null default false;

comment on column public.cliente_tareas.tipo is 'produccion | gestion | coordinacion';

commit;

-- Forzar a PostgREST a recargar el esquema (evita que el error persista por caché).
notify pgrst, 'reload schema';

-- VERIFICACIÓN (aparte):
-- select column_name from information_schema.columns
--   where table_name='cliente_tareas' order by column_name;
