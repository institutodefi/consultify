-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · MIGRACIÓN v7 — Tareas de sistema vs tareas de agenda
-- Corrige el flujo:
--   1) El catálogo se vuelca a TAREAS DE SISTEMA (por proyecto), con
--      horas MENSUALES, SIN fecha. Es el "qué hay que hacer cada mes".
--   2) El consultor COGE esas tareas y las programa en su AGENDA en el
--      mes que decida (agenda_tareas), generando la instancia con fecha.
-- Ejecutar DESPUÉS de migracion-v6.sql
-- ════════════════════════════════════════════════════════════════

-- 1 · TAREAS DE SISTEMA (plantilla viva por proyecto, horas/mes, sin fecha)
create table if not exists tareas_sistema (
  id            uuid primary key default gen_random_uuid(),
  proyecto_id   uuid not null references proyectos(id) on delete cascade,
  norma_id      text not null references normas_catalogo(id),
  catalogo_id   uuid references tareas_catalogo(id) on delete set null,
  proceso       text,
  subproceso    text,
  titulo        text not null,              -- "Proceso - Subproceso"
  descripcion   text,
  tipo          text not null default 'produccion' check (tipo in ('produccion','gestion','coordinacion')),
  horas_base    numeric(6,2) not null default 0,   -- horas tipo MENSUALES (antes de eficiencia)
  activa        boolean not null default true,
  orden         int not null default 0,
  creado        timestamptz default now(),
  unique (proyecto_id, norma_id, titulo)
);
create index if not exists idx_tareas_sistema_proy on tareas_sistema (proyecto_id, norma_id);

-- 2 · La tarea de agenda recuerda de qué tarea de sistema salió (para
--     prorrateo por meses: varias instancias de agenda → 1 tarea sistema)
alter table agenda_tareas add column if not exists tarea_sistema_id uuid references tareas_sistema(id) on delete set null;
alter table agenda_tareas add column if not exists mes int;   -- 1..12 del mes programado
create index if not exists idx_agenda_tsistema on agenda_tareas (tarea_sistema_id);

-- 3 · RLS
alter table tareas_sistema enable row level security;
drop policy if exists tareas_sistema_team_all on tareas_sistema;
create policy tareas_sistema_team_all on tareas_sistema for all
  using (es_equipo()) with check (es_equipo());

-- 4 · Propagación del CATÁLOGO → TAREAS DE SISTEMA (no a la agenda)
--     Al editar el catálogo, se actualizan las tareas de sistema que
--     derivan de esa fila. La agenda ya programada NO se toca (lo hecho
--     y lo planificado por el consultor es suyo).
create or replace function public.propagar_catalogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update tareas_sistema ts
     set titulo      = new.titulo,
         proceso     = new.proceso,
         subproceso  = new.subproceso,
         descripcion = coalesce(ts.descripcion, new.descripcion),
         horas_base  = new.horas_base
   where ts.catalogo_id = new.id;
  return new;
end; $$;

drop trigger if exists trg_propagar_catalogo on tareas_catalogo;
create trigger trg_propagar_catalogo
  after update on tareas_catalogo
  for each row execute function public.propagar_catalogo();
