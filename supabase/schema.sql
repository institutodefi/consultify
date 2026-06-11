-- ═══════════════════════════════════════════════════════════════════
-- CONSULTIFY · ESQUEMA COMPLETO v2 (PostgreSQL / Supabase)
-- Ejecutar en: proyecto "consultify" → SQL Editor → New query → Run
--
-- Si ya tienes consultores/proyectos creados de la versión anterior,
-- los CREATE IF NOT EXISTS no los tocan. Si ya ejecutaste la agenda
-- v1 (tabla tareas con columnas fecha/horas), ejecuta antes el bloque
-- "UPGRADE v1→v2" del final.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1 · NORMAS (catálogo) ──────────────────────────────────────────
create table if not exists normas_catalogo (
  id          text primary key,
  nombre      text not null,
  descripcion text,
  nivel       text not null check (nivel in ('J1','J2','J3','Senior')),
  h_apoyo     int not null,
  activa      boolean default true,
  created_at  timestamptz default now()
);

insert into normas_catalogo (id, nombre, descripcion, nivel, h_apoyo) values
  ('9001',     'ISO 9001',  'Calidad',                        'J3', 34),
  ('14001',    'ISO 14001', 'Medio ambiente',                 'J3', 46),
  ('9004',     'ISO 9004',  'Calidad sostenible',             'J3', 22),
  ('42001',    'ISO 42001', 'Inteligencia artificial',        'J3', 42),
  ('56001',    'ISO 56001', 'Gestión de la innovación',       'J3', 75),
  ('21001',    'ISO 21001', 'Organizaciones educativas',      'J3', 38),
  ('une93200', 'UNE 93200', 'Cartas de Servicios',            'J3', 25),
  ('45001',    'ISO 45001', 'Seguridad y salud',              'J2', 63),
  ('27001',    'ISO 27001', 'Seguridad de la información',    'J2', 81)
on conflict (id) do nothing;

-- ─── 2 · CONSULTORES ────────────────────────────────────────────────
create table if not exists consultores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  nivel      text not null default 'J2' check (nivel in ('J1','J2','J3','Senior')),
  horas_sem  numeric(4,1) not null default 35,
  normas     text[] not null default '{}',
  activo     boolean not null default true,   -- soft delete (conserva histórico)
  created_at timestamptz not null default now()
);

insert into consultores (nombre, nivel, horas_sem, normas)
select * from (values
  ('Carlota', 'J3', 35::numeric, array['9001','14001','27001','45001']),
  ('Irene',   'J2', 35::numeric, array['9001','14001'])
) as seed(nombre, nivel, horas_sem, normas)
where not exists (select 1 from consultores);

-- ─── 3 · PROYECTOS ──────────────────────────────────────────────────
create table if not exists proyectos (
  id           uuid primary key default gen_random_uuid(),
  cliente      text not null,
  normas       text[] not null default '{}',
  modelo       text not null check (modelo in ('Apoyo','Relación','Implicación','Compromiso','Implantación')),
  consultor_id uuid references consultores(id) on delete set null,
  estado       text not null default 'activo' check (estado in ('activo','pausado','finalizado')),
  -- cache de cálculos (dashboard rápido)
  h_total_mes  numeric(6,1) default 0,
  precio_mes   numeric(10,2),
  precio_total numeric(10,2),
  created_at   timestamptz not null default now()
);

-- ─── 4 · AGENDA: FESTIVOS ───────────────────────────────────────────
create table if not exists festivos (
  id     uuid primary key default gen_random_uuid(),
  fecha  date not null unique,
  nombre text not null,
  ambito text not null default 'nacional'   -- nacional | autonomico | local
);

-- SEED festivos 2026 Madrid capital — REVISAR cuando salga el calendario
-- oficial (BOE/BOCM/Ayto.). 2026 es año de ajuste: tabla editable.
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

-- ─── 5 · AGENDA: VACACIONES (1 fila = 1 día laborable) ──────────────
create table if not exists vacaciones (
  id           uuid primary key default gen_random_uuid(),
  consultor_id uuid not null references consultores(id) on delete cascade,
  fecha        date not null,
  unique (consultor_id, fecha)
);

-- ─── 6 · AGENDA: TAREAS v2 ──────────────────────────────────────────
--    consultor_id   = RESPONSABLE (reasignable)
--    fecha_prevista / horas_previstas = planificación
--    fecha_efectiva / horas_reales    = ejecución real
create table if not exists tareas (
  id              uuid primary key default gen_random_uuid(),
  consultor_id    uuid not null references consultores(id) on delete cascade,
  proyecto_id     uuid references proyectos(id) on delete set null,
  fecha_prevista  date not null,
  horas_previstas numeric(4,1) not null check (horas_previstas > 0 and horas_previstas <= 9),
  fecha_efectiva  date,
  horas_reales    numeric(4,1) check (horas_reales > 0 and horas_reales <= 9),
  titulo          text not null,
  descripcion     text,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','en_curso','completada')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_proyectos_consultor   on proyectos (consultor_id);
create index if not exists idx_tareas_consultor_prev on tareas (consultor_id, fecha_prevista);
create index if not exists idx_tareas_consultor_efec on tareas (consultor_id, fecha_efectiva);
create index if not exists idx_vacaciones_consultor  on vacaciones (consultor_id, fecha);

-- ─── 7 · RLS ────────────────────────────────────────────────────────
-- ⚠ Políticas PERMISIVAS para anon (práctico para empezar; no compartas
-- la URL pública). Para producción multi-usuario: activar Supabase Auth
-- y cambiar "using (true)" por reglas sobre auth.uid().
do $$
declare t text;
begin
  foreach t in array array['normas_catalogo','consultores','proyectos','festivos','vacaciones','tareas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s_all" on %I', t, t);
    execute format('create policy "%s_all" on %I for all using (true) with check (true)', t, t);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════
-- UPGRADE v1 → v2 (solo si ya tenías la tabla tareas de la agenda v1)
-- Descomenta y ejecuta ANTES del script de arriba:
--
-- alter table tareas rename column fecha to fecha_prevista;
-- alter table tareas rename column horas to horas_previstas;
-- alter table tareas add column if not exists fecha_efectiva date;
-- alter table tareas add column if not exists horas_reales numeric(4,1)
--   check (horas_reales > 0 and horas_reales <= 9);
-- ═══════════════════════════════════════════════════════════════════
