-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · MIGRACIÓN v3 — Capacidad por HORAS de dedicación
-- Dominio: consultify.pro
-- Ejecutar en: proyecto "consultify" → SQL Editor → Run (idempotente)
--
-- Cambios:
--  · consultores: + pct_jornada (100=jornada completa), + apellidos, + email
--    (capacidad_clientes se conserva pero deja de usarse)
--  · agenda_tareas: + tipo, + hora_inicio, + horas_base
--    (horas_base = duración "tipo" de la tarea; las horas del consultor
--     salen de horas_base × eficiencia de su categoría)
-- ════════════════════════════════════════════════════════════════

-- ── Consultores: jornada en % + datos personales ──
alter table consultores add column if not exists apellidos   text;
alter table consultores add column if not exists email       text;
alter table consultores add column if not exists pct_jornada numeric(5,2) not null default 100;  -- % de jornada completa
comment on column consultores.pct_jornada is '% de jornada completa (100 = 1.800 h/año). La capacidad en horas se deriva del calendario × este %.';

-- ── Agenda de tareas: tipo, hora y horas base ──
alter table agenda_tareas add column if not exists tipo        text not null default 'produccion';
alter table agenda_tareas add column if not exists hora_inicio text default '09:00';
alter table agenda_tareas add column if not exists horas_base  numeric(4,1);  -- duración "tipo" de la tarea (antes de eficiencia)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_tareas_tipo_check') then
    alter table agenda_tareas add constraint agenda_tareas_tipo_check
      check (tipo in ('produccion','gestion','coordinacion'));
  end if;
end $$;

-- ── Vista de control por sistema (norma × modelo × tareas) ──
-- Une cada tarea con el proyecto, su norma(s) y modelo, para la
-- pestaña "Control por sistema".
create or replace view v_tareas_sistema as
select
  t.id, t.consultor_id, t.proyecto_id,
  t.titulo, t.tipo, t.estado,
  t.fecha_prevista, t.horas_previstas, t.fecha_efectiva, t.horas_reales,
  t.horas_base, t.hora_inicio,
  c.nombre as consultor_nombre, c.apellidos as consultor_apellidos, c.nivel as consultor_nivel,
  p.modelo as proyecto_modelo, p.normas as proyecto_normas,
  cl.empresa as cliente
from agenda_tareas t
left join consultores c on c.id = t.consultor_id
left join proyectos   p on p.id = t.proyecto_id
left join clientes    cl on cl.id = p.cliente_id;
