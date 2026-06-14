-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · AGENDA DE CONSULTORES (festivos, vacaciones, tareas)
-- Ejecutar en: proyecto "consultify" → SQL Editor → Run
-- Complementa supabase/schema.sql (requiere mi_rol() y consultores).
-- Idempotente: se puede ejecutar varias veces sin pisar datos.
-- ════════════════════════════════════════════════════════════════

-- ─── 1 · FESTIVOS (editable: 2026 es año de ajuste) ──────────────
create table if not exists festivos (
  id     uuid primary key default gen_random_uuid(),
  fecha  date not null unique,
  nombre text not null,
  ambito text not null default 'nacional'   -- nacional | autonomico | local
);

-- Festivos 2026 Madrid capital — REVISAR contra el calendario oficial
insert into festivos (fecha, nombre, ambito) values
  ('2026-01-01', 'Año Nuevo',                   'nacional'),
  ('2026-01-06', 'Epifanía del Señor',          'nacional'),
  ('2026-04-02', 'Jueves Santo',                'autonomico'),
  ('2026-04-03', 'Viernes Santo',               'nacional'),
  ('2026-05-01', 'Fiesta del Trabajo',          'nacional'),
  ('2026-05-02', 'Fiesta Comunidad de Madrid',  'autonomico'),
  ('2026-05-15', 'San Isidro',                  'local'),
  ('2026-08-15', 'Asunción de la Virgen',       'nacional'),
  ('2026-10-12', 'Fiesta Nacional de España',   'nacional'),
  ('2026-11-02', 'Todos los Santos (traslado)', 'nacional'),
  ('2026-11-09', 'Virgen de la Almudena',       'local'),
  ('2026-12-08', 'Inmaculada Concepción',       'nacional'),
  ('2026-12-25', 'Natividad del Señor',         'nacional')
on conflict (fecha) do nothing;

-- ─── 2 · VACACIONES (1 fila = 1 día laborable de vacaciones) ─────
create table if not exists vacaciones (
  id           uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references consultores(id) on delete cascade,
  fecha        date not null,
  unique (consultor_id, fecha)
);

-- ─── 3 · TAREAS DE AGENDA (previsto vs real) ─────────────────────
--   consultor_id   = RESPONSABLE de la tarea (reasignable)
--   fecha_prevista / horas_previstas = planificación
--   fecha_efectiva / horas_reales    = ejecución real
--   Límite del convenio: máx. 9 h ordinarias/día (también en la UI)
create table if not exists agenda_tareas (
  id              uuid primary key default gen_random_uuid(),
  consultor_id    uuid not null references consultores(id) on delete cascade,
  proyecto_id     uuid references proyectos(id) on delete set null,
  fecha_prevista  date not null,
  horas_previstas numeric(4,1) not null check (horas_previstas > 0 and horas_previstas <= 9),
  fecha_efectiva  date,
  horas_reales    numeric(4,1) check (horas_reales > 0 and horas_reales <= 9),
  titulo          text not null,
  descripcion     text,
  tipo            text not null default 'produccion'
                  check (tipo in ('produccion','gestion','coordinacion')),
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','en_curso','completada')),
  creado          timestamptz not null default now()
);

-- ─── 4 · ÍNDICES ─────────────────────────────────────────────────
create index if not exists idx_agenda_consultor_prev on agenda_tareas (consultor_id, fecha_prevista);
create index if not exists idx_agenda_consultor_efec on agenda_tareas (consultor_id, fecha_efectiva);
create index if not exists idx_vacaciones_consultor  on vacaciones (consultor_id, fecha);

-- ─── 5 · RLS (mismo patrón que el resto: solo el equipo) ─────────
alter table festivos      enable row level security;
alter table vacaciones    enable row level security;
alter table agenda_tareas enable row level security;

drop policy if exists festivos_team_all on festivos;
create policy festivos_team_all on festivos for all
  using (mi_rol() in ('consultor','admin')) with check (mi_rol() in ('consultor','admin'));

drop policy if exists vacaciones_team_all on vacaciones;
create policy vacaciones_team_all on vacaciones for all
  using (mi_rol() in ('consultor','admin')) with check (mi_rol() in ('consultor','admin'));

drop policy if exists agenda_tareas_team_all on agenda_tareas;
create policy agenda_tareas_team_all on agenda_tareas for all
  using (mi_rol() in ('consultor','admin')) with check (mi_rol() in ('consultor','admin'));

-- ─── 6 · UPGRADE: columna tipo (si la tabla ya existía sin ella) ──
alter table agenda_tareas add column if not exists tipo text not null default 'produccion';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_tareas_tipo_check') then
    alter table agenda_tareas add constraint agenda_tareas_tipo_check
      check (tipo in ('produccion','gestion','coordinacion'));
  end if;
end $$;

-- ─── 7 · CAMPOS DE CONSULTOR (apellidos, email) y tipo de tarea ──
-- Idempotente: añade columnas que falten sin tocar datos.
alter table consultores add column if not exists apellidos text;
alter table consultores add column if not exists email text;
alter table agenda_tareas add column if not exists tipo text not null default 'produccion';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_tareas_tipo_check') then
    alter table agenda_tareas add constraint agenda_tareas_tipo_check
      check (tipo in ('produccion','gestion','coordinacion'));
  end if;
end $$;
-- Hora de inicio prevista para volcar al calendario (HH:MM); por defecto 09:00
alter table agenda_tareas add column if not exists hora_inicio text default '09:00';
