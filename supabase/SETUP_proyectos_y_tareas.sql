-- =============================================================================
-- CONSULTIFY · SETUP CONSOLIDADO de proyectos_cliente + cliente_tareas
-- Úsalo si ves: relation "public.cliente_tareas" does not exist.
-- Crea ambas tablas con TODAS las columnas que la app necesita, idempotente.
-- Requiere que ya existan: clientes, consultores. (Se crean en migraciones previas.)
-- =============================================================================

begin;

-- ─── 1 · PROYECTOS DEL CLIENTE ───────────────────────────────────
create table if not exists public.proyectos_cliente (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  nombre          text not null,
  normas          text[] not null default '{}',
  modelo          text,
  estado          text not null default 'activo',
  meses_estimados integer not null default 3,
  fecha_inicio    date,
  consultor_1_id  uuid references public.consultores(id),
  consultor_2_id  uuid references public.consultores(id),
  creado          timestamptz default now()
);
create index if not exists idx_proyectos_cliente_cliente on public.proyectos_cliente (cliente_id);
create index if not exists idx_proyectos_cliente_estado  on public.proyectos_cliente (estado);

-- ─── 2 · TAREAS (cuelgan del proyecto) ───────────────────────────
create table if not exists public.cliente_tareas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  proyecto_id    uuid references public.proyectos_cliente(id) on delete cascade,
  norma_id       text not null,
  modelo         text not null,
  proceso        text,
  subproceso     text,
  titulo         text not null,
  horas          numeric(6,2) not null default 0,
  bloque         text,
  tipo           text default 'produccion',
  consultor_id   uuid references public.consultores(id),
  fecha_estimada date,
  fecha_real     date,
  horas_reales   numeric(6,2),
  hecha          boolean not null default false,
  integrada      boolean not null default false,
  normas_integradas text[] not null default '{}',
  editada_manual boolean not null default false,
  reduccion_pct  numeric(5,2) not null default 0,
  seguimientos   jsonb not null default '[]'::jsonb,
  bloques_ejecucion jsonb not null default '[]'::jsonb,
  orden          integer not null default 0,
  creado         timestamptz default now()
);
create index if not exists idx_cliente_tareas_cliente  on public.cliente_tareas (cliente_id);
create index if not exists idx_cliente_tareas_proyecto on public.cliente_tareas (proyecto_id);

-- Por si la tabla ya existía a medias: asegurar columnas que pudieran faltar.
alter table public.cliente_tareas add column if not exists proyecto_id       uuid references public.proyectos_cliente(id) on delete cascade;
alter table public.cliente_tareas add column if not exists tipo              text default 'produccion';
alter table public.cliente_tareas add column if not exists horas_reales      numeric(6,2);
alter table public.cliente_tareas add column if not exists integrada         boolean not null default false;
alter table public.cliente_tareas add column if not exists normas_integradas text[] not null default '{}';
alter table public.cliente_tareas add column if not exists editada_manual    boolean not null default false;
alter table public.cliente_tareas add column if not exists reduccion_pct     numeric(5,2) not null default 0;
alter table public.cliente_tareas add column if not exists seguimientos      jsonb not null default '[]'::jsonb;
alter table public.cliente_tareas add column if not exists bloques_ejecucion jsonb not null default '[]'::jsonb;

-- ─── 3 · RLS (permisivo para el equipo; cliente lee lo suyo) ──────
alter table public.proyectos_cliente enable row level security;
alter table public.cliente_tareas    enable row level security;

-- Política sencilla: usuarios autenticados pueden todo (ajústala si usas mi_rol()).
drop policy if exists equipo_todo_proyectos_cliente on public.proyectos_cliente;
create policy equipo_todo_proyectos_cliente on public.proyectos_cliente
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists equipo_todo_cliente_tareas on public.cliente_tareas;
create policy equipo_todo_cliente_tareas on public.cliente_tareas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

commit;

notify pgrst, 'reload schema';

-- VERIFICACIÓN (ejecútalo aparte):
-- select count(*) from public.cliente_tareas;
-- select column_name from information_schema.columns
--   where table_name='cliente_tareas' order by column_name;
