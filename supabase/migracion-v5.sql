-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · MIGRACIÓN v5 — Catálogo de tareas (Proceso-Subproceso)
-- Tareas con forma "Proceso - Subproceso", horas hechas, y propagación
-- a sistemas integrados.
-- Ejecutar DESPUÉS de migracion-v4.sql y ANTES de seed-tareas.sql
-- ════════════════════════════════════════════════════════════════

-- ── 1 · CATÁLOGO DE TAREAS (plantilla por norma × modelo) ──
-- Ya creado en v4; aseguramos columnas de Proceso/Subproceso explícitas.
create table if not exists tareas_catalogo (
  id          uuid primary key default gen_random_uuid(),
  norma_id    text not null references normas_catalogo(id) on delete cascade,
  modelo      text not null check (modelo in ('Apoyo','Relación','Implicación','Compromiso','Implantación')),
  titulo      text not null,                 -- "Proceso - Subproceso"
  proceso     text,
  subproceso  text,
  tipo        text not null default 'produccion' check (tipo in ('produccion','gestion','coordinacion')),
  horas_base  numeric(6,2) not null default 1,
  orden       int not null default 0,
  creado      timestamptz default now()
);
alter table tareas_catalogo add column if not exists proceso    text;
alter table tareas_catalogo add column if not exists subproceso text;
-- horas con 2 decimales (el Excel trae 0.11, 2.4, etc.)
alter table tareas_catalogo alter column horas_base type numeric(6,2);
create unique index if not exists ux_tareas_catalogo on tareas_catalogo (norma_id, modelo, titulo);

-- ── 2 · AGENDA_TAREAS: forma Proceso/Subproceso + horas hechas ──
alter table agenda_tareas add column if not exists proceso     text;
alter table agenda_tareas add column if not exists subproceso  text;
alter table agenda_tareas add column if not exists norma_id    text references normas_catalogo(id);
-- "horas hechas" = horas_reales (ya existe). Aseguramos default y comentario.
comment on column agenda_tareas.horas_reales is 'Horas HECHAS (ejecución real)';
comment on column agenda_tareas.horas_previstas is 'Horas programadas (plan)';

-- ── 3 · PROPAGACIÓN A SISTEMAS INTEGRADOS ──
-- Cuando se edita una tarea del catálogo (norma+modelo+titulo), se
-- actualizan las horas previstas de las tareas YA programadas de esa
-- misma norma+modelo+proceso/subproceso en proyectos que integran la
-- norma, salvo las que tengan horas reales ya imputadas (intocables).
create or replace function public.propagar_catalogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.horas_base is distinct from old.horas_base then
    update agenda_tareas t
       set horas_previstas = round(new.horas_base * coalesce(
             (select multiplicador from (values
                ('J1',1.0),('J2',0.75),('J3',0.5),('Senior',0.4)) as e(niv,multiplicador)
              where e.niv = coalesce(c.nivel,'J2')), 1), 2)
      from proyectos p
      left join consultores c on c.id = t.consultor_id
     where t.proyecto_id = p.id
       and new.norma_id = any(p.normas)          -- la norma está integrada en el proyecto
       and p.modelo = new.modelo
       and t.titulo = new.titulo
       and t.horas_reales is null;               -- no tocar lo ya ejecutado
  end if;
  return new;
end; $$;

drop trigger if exists trg_propagar_catalogo on tareas_catalogo;
create trigger trg_propagar_catalogo
  after update on tareas_catalogo
  for each row execute function public.propagar_catalogo();

-- ── 4 · RLS del catálogo (equipo interno) ──
alter table tareas_catalogo enable row level security;
drop policy if exists tareas_catalogo_team_all on tareas_catalogo;
create policy tareas_catalogo_team_all on tareas_catalogo for all
  using (es_equipo()) with check (es_equipo());
