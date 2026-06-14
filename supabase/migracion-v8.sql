-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · MIGRACIÓN v8 — Catálogo "Tareas por Norma" (consolidada)
-- Corrige el error «column "proceso" does not exist»: crea TODAS las
-- columnas del catálogo ANTES de insertar el seed.
-- Sustituye/consolida v5–v7. Idempotente.
-- Ejecutar en proyecto "consultify" → SQL Editor → Run
--   (y después seed-tareas.sql)
-- ════════════════════════════════════════════════════════════════

-- 1 · CATÁLOGO DE TAREAS (una fila por norma × modelo × tarea)
--     titulo = "Proceso - Subproceso" · horas_base MENSUALES
create table if not exists tareas_catalogo (
  id          uuid primary key default gen_random_uuid(),
  norma_id    text not null references normas_catalogo(id) on delete cascade,
  modelo      text not null check (modelo in ('Apoyo','Relación','Implicación','Compromiso','Implantación')),
  titulo      text not null,
  proceso     text,
  subproceso  text,
  descripcion text,
  tipo        text not null default 'produccion' check (tipo in ('produccion','gestion','coordinacion')),
  horas_base  numeric(6,2) not null default 0,
  orden       int not null default 0,
  creado      timestamptz default now()
);
-- Asegurar columnas si la tabla ya existía sin ellas (causa del error original)
alter table tareas_catalogo add column if not exists proceso     text;
alter table tareas_catalogo add column if not exists subproceso  text;
alter table tareas_catalogo add column if not exists descripcion text;
alter table tareas_catalogo add column if not exists tipo        text not null default 'produccion';
alter table tareas_catalogo add column if not exists horas_base  numeric(6,2) not null default 0;
alter table tareas_catalogo add column if not exists orden       int not null default 0;
alter table tareas_catalogo alter column horas_base type numeric(6,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='tareas_catalogo_tipo_check') then
    alter table tareas_catalogo add constraint tareas_catalogo_tipo_check
      check (tipo in ('produccion','gestion','coordinacion'));
  end if;
end $$;
create unique index if not exists ux_tareas_catalogo on tareas_catalogo (norma_id, modelo, titulo);

-- 2 · ELIMINAR el modelo de "tareas de sistema" (volvemos al anterior)
drop trigger if exists trg_propagar_catalogo on tareas_catalogo;
drop function if exists public.propagar_catalogo();
drop table if exists tareas_sistema cascade;
-- Quitar columnas que solo servían para tareas_sistema
alter table agenda_tareas drop column if exists tarea_sistema_id;
alter table agenda_tareas drop column if exists mes;

-- 3 · AGENDA: campos que la tarea conserva (Proceso/Subproceso/descr/horas)
alter table agenda_tareas add column if not exists proceso     text;
alter table agenda_tareas add column if not exists subproceso  text;
alter table agenda_tareas add column if not exists descripcion text;
alter table agenda_tareas add column if not exists norma_id    text references normas_catalogo(id);
alter table agenda_tareas add column if not exists catalogo_id uuid references tareas_catalogo(id) on delete set null;
alter table agenda_tareas add column if not exists tipo        text not null default 'produccion';
alter table agenda_tareas add column if not exists hora_inicio text default '09:00';
alter table agenda_tareas add column if not exists horas_base  numeric(6,2);

-- 4 · RLS del catálogo (solo equipo interno)
alter table tareas_catalogo enable row level security;
drop policy if exists tareas_catalogo_team_all on tareas_catalogo;
create policy tareas_catalogo_team_all on tareas_catalogo for all
  using (es_equipo()) with check (es_equipo());
