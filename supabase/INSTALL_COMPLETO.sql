-- =============================================================
-- CONSULTIFY · INSTALACIÓN COMPLETA DESDE CERO
-- Ejecutar TODO de una vez en el SQL Editor de Supabase.
-- Orden: schema → agenda → migraciones → seed de tareas.
-- Idempotente donde es posible (create if not exists / add if not exists).
-- =============================================================


-- ═══════════════════════════════════════════════════════════
-- schema.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- CONSULTIFY · ESQUEMA SUPABASE v2.0 (jun 2026)
-- Proyecto: consultify
-- Ejecutar en SQL Editor de Supabase (una sola vez).
-- ============================================================

-- ---------- 1 · PERFILES Y ROLES ----------
create table if not exists perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  rol       text not null default 'cliente' check (rol in ('cliente','consultor','admin')),
  nombre    text,
  empresa   text,
  creado    timestamptz default now()
);

-- Cada registro nuevo en auth.users crea su perfil (rol cliente por defecto).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, rol, nombre, empresa)
  values (new.id, 'cliente', new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'empresa')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper para las políticas RLS.
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid();
$$;

-- ---------- 2 · CATÁLOGO DE NORMAS ----------
create table if not exists normas_catalogo (
  id           text primary key,
  nombre       text not null,
  descripcion  text,
  nivel        text not null check (nivel in ('J1','J2','J3','Senior')),
  h_apoyo      int  not null,
  activa       boolean default true
);

insert into normas_catalogo (id, nombre, descripcion, nivel, h_apoyo) values
  ('9001',     'ISO 9001',  'Gestión de la calidad',         'J3', 34),
  ('14001',    'ISO 14001', 'Gestión ambiental',             'J3', 46),
  ('45001',    'ISO 45001', 'Seguridad y salud laboral',     'J2', 63),
  ('27001',    'ISO 27001', 'Seguridad de la información',   'J2', 81),
  ('42001',    'ISO 42001', 'Inteligencia artificial',       'J3', 42),
  ('56001',    'ISO 56001', 'Gestión de la innovación',      'J3', 75),
  ('21001',    'ISO 21001', 'Organizaciones educativas',     'J3', 38),
  ('9004',     'ISO 9004',  'Calidad sostenible',            'J3', 22),
  ('une93200', 'UNE 93200', 'Cartas de Servicios',           'J3', 25)
on conflict (id) do update set nivel = excluded.nivel, h_apoyo = excluded.h_apoyo;

-- ---------- 3 · EQUIPO ----------
create table if not exists consultores (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null,
  nivel               text not null check (nivel in ('J1','J2','J3','Senior')),
  normas              text[] not null default '{}',
  capacidad_clientes  int not null default 12,
  activo              boolean default true,
  user_id             uuid references auth.users(id),
  creado              timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ---------- 4 · CLIENTES ----------
create table if not exists clientes (
  id        uuid primary key default gen_random_uuid(),
  empresa   text not null,
  cif       text,
  contacto  text,
  email     text,
  telefono  text,
  user_id   uuid references auth.users(id),   -- vincula la cuenta del cliente a su empresa
  creado    timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- 5 · PROYECTOS ----------
create table if not exists proyectos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references clientes(id) on delete set null,
  normas          text[] not null default '{}',
  modelo          text not null check (modelo in ('Apoyo','Relación','Implicación','Compromiso','Implantación')),
  consultor_id    uuid references consultores(id) on delete set null,
  estado          text not null default 'implantación' check (estado in ('implantación','activo','pausado','cerrado')),
  fecha_inicio    date,
  fecha_auditoria date,
  h_total_mes     int,
  precio_mes      int,
  precio_total    int,
  notas           text,
  plan            jsonb,
  creado          timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ---------- 6 · PRESUPUESTOS (calculadora pública) ----------
create table if not exists presupuestos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users(id),
  email     text not null,
  nombre    text,
  empresa   text,
  telefono  text,
  normas    text[] not null default '{}',
  modelo    text not null,
  precio    int not null,
  tipo      text not null default 'mes' check (tipo in ('mes','bolsa')),
  creado    timestamptz default now()
);

-- ---------- 7 · TRIGGERS updated_at ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_consultores_updated on consultores;
create trigger trg_consultores_updated before update on consultores for each row execute function set_updated_at();
drop trigger if exists trg_clientes_updated on clientes;
create trigger trg_clientes_updated before update on clientes for each row execute function set_updated_at();
drop trigger if exists trg_proyectos_updated on proyectos;
create trigger trg_proyectos_updated before update on proyectos for each row execute function set_updated_at();

-- ---------- 8 · ÍNDICES ----------
create index if not exists idx_proyectos_estado    on proyectos(estado);
create index if not exists idx_proyectos_consultor on proyectos(consultor_id);
create index if not exists idx_proyectos_cliente   on proyectos(cliente_id);
create index if not exists idx_proyectos_normas    on proyectos using gin(normas);
create index if not exists idx_clientes_user       on clientes(user_id);
create index if not exists idx_presupuestos_email  on presupuestos(email);

-- ---------- 9 · ROW LEVEL SECURITY ----------
alter table perfiles        enable row level security;
alter table normas_catalogo enable row level security;
alter table consultores     enable row level security;
alter table clientes        enable row level security;
alter table proyectos       enable row level security;
alter table presupuestos    enable row level security;

-- Perfiles: cada uno ve el suyo; el equipo ve todos.
create policy perfiles_self_select on perfiles for select using (id = auth.uid() or mi_rol() in ('consultor','admin'));
create policy perfiles_self_update on perfiles for update using (id = auth.uid());

-- Catálogo de normas: lectura pública (lo usa la calculadora).
create policy normas_public_read on normas_catalogo for select using (true);

-- Consultores / clientes / proyectos: solo el equipo gestiona.
create policy consultores_team_all on consultores for all
  using (mi_rol() in ('consultor','admin')) with check (mi_rol() in ('consultor','admin'));

create policy clientes_team_all on clientes for all
  using (mi_rol() in ('consultor','admin')) with check (mi_rol() in ('consultor','admin'));
-- …y cada cliente ve su propia ficha:
create policy clientes_self_read on clientes for select using (user_id = auth.uid());

create policy proyectos_team_all on proyectos for all
  using (mi_rol() in ('consultor','admin')) with check (mi_rol() in ('consultor','admin'));
-- …y cada cliente ve sus proyectos:
create policy proyectos_cliente_read on proyectos for select
  using (cliente_id in (select id from clientes where user_id = auth.uid()));

-- Presupuestos: cualquiera puede crear (calculadora pública, incluso anónimos);
-- cada cliente ve los suyos; el equipo lo ve todo.
create policy presupuestos_anon_insert on presupuestos for insert with check (true);
create policy presupuestos_owner_read on presupuestos for select
  using (user_id = auth.uid()
         or email = (select email from auth.users where id = auth.uid())
         or mi_rol() in ('consultor','admin'));

-- ---------- 10 · DATOS INICIALES DEL EQUIPO ----------
insert into consultores (nombre, nivel, normas, capacidad_clientes, activo) values
  ('Carlota', 'J3', '{9001,14001,27001,45001}', 12, true),
  ('Irene',   'J2', '{9001,14001}',             17, true)
on conflict do nothing;

-- ============================================================
-- DESPUÉS DE EJECUTAR ESTE SCRIPT:
-- 1) Crea los usuarios del equipo en Authentication → Users.
-- 2) Asciende su rol:
--    update perfiles set rol = 'consultor' where id = '<uuid-del-usuario>';
--    (o 'admin' para ti)
-- 3) Para dar acceso a un cliente: crea su cuenta y vincula
--    update clientes set user_id = '<uuid>' where id = '<id-cliente>';
-- ============================================================


-- ═══════════════════════════════════════════════════════════
-- agenda.sql
-- ═══════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════
-- migracion-v2.sql
-- ═══════════════════════════════════════════════════════════
-- ============================================================
-- MIGRACIÓN v2 · Consultify (ejecutar en SQL Editor)
-- 1) Planificación de proyectos (plan de tareas con 3 perfiles)
-- 2) Perfil de cliente jerárquico: cliente → CIF → centros,
--    con normas y alcances por empresa (CIF)
-- Idempotente: se puede re-ejecutar.
-- ============================================================

-- ---------- 1 · PLAN DE PROYECTO ----------
alter table public.proyectos add column if not exists plan jsonb;

-- ---------- 2 · ID DE CLIENTE ----------
alter table public.clientes add column if not exists codigo text;
create unique index if not exists clientes_codigo_unico on public.clientes (codigo) where codigo is not null;

-- ---------- 3 · EMPRESAS (CIF) DEL CLIENTE ----------
create table if not exists public.cliente_empresas (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references public.clientes(id) on delete cascade,
  cif          text not null,
  razon_social text,
  creado       timestamptz default now()
);

-- ---------- 4 · CENTROS DE TRABAJO POR EMPRESA ----------
create table if not exists public.empresa_centros (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.cliente_empresas(id) on delete cascade,
  nombre     text not null,
  direccion  text,
  creado     timestamptz default now()
);

-- ---------- 5 · NORMAS Y ALCANCES POR EMPRESA ----------
create table if not exists public.empresa_normas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.cliente_empresas(id) on delete cascade,
  norma_id   text not null,
  alcance    text,
  creado     timestamptz default now(),
  unique (empresa_id, norma_id)
);

-- ---------- 6 · RLS ----------
alter table public.cliente_empresas enable row level security;
alter table public.empresa_centros  enable row level security;
alter table public.empresa_normas   enable row level security;

-- Equipo (consultor/admin) gestiona todo
drop policy if exists equipo_todo_cliente_empresas on public.cliente_empresas;
create policy equipo_todo_cliente_empresas on public.cliente_empresas
  for all using (public.mi_rol() in ('consultor','admin')) with check (public.mi_rol() in ('consultor','admin'));
drop policy if exists equipo_todo_empresa_centros on public.empresa_centros;
create policy equipo_todo_empresa_centros on public.empresa_centros
  for all using (public.mi_rol() in ('consultor','admin')) with check (public.mi_rol() in ('consultor','admin'));
drop policy if exists equipo_todo_empresa_normas on public.empresa_normas;
create policy equipo_todo_empresa_normas on public.empresa_normas
  for all using (public.mi_rol() in ('consultor','admin')) with check (public.mi_rol() in ('consultor','admin'));

-- El cliente ve (solo lectura) lo suyo
drop policy if exists cliente_lee_sus_empresas on public.cliente_empresas;
create policy cliente_lee_sus_empresas on public.cliente_empresas
  for select using (exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid()));
drop policy if exists cliente_lee_sus_centros on public.empresa_centros;
create policy cliente_lee_sus_centros on public.empresa_centros
  for select using (exists (select 1 from public.cliente_empresas e join public.clientes c on c.id = e.cliente_id
                            where e.id = empresa_id and c.user_id = auth.uid()));
drop policy if exists cliente_lee_sus_normas on public.empresa_normas;
create policy cliente_lee_sus_normas on public.empresa_normas
  for select using (exists (select 1 from public.cliente_empresas e join public.clientes c on c.id = e.cliente_id
                            where e.id = empresa_id and c.user_id = auth.uid()));

-- ---------- 7 · CÓDIGOS DE CLIENTE EXISTENTES ----------
-- Asigna CL-0001, CL-0002… a los clientes que aún no tengan código
with numerados as (
  select id, 'CL-' || lpad((row_number() over (order by creado))::text, 4, '0') as cod
  from public.clientes where codigo is null
)
update public.clientes c set codigo = n.cod from numerados n where c.id = n.id;


-- ═══════════════════════════════════════════════════════════
-- migracion-v3.sql
-- ═══════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════
-- migracion-v4.sql
-- ═══════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · MIGRACIÓN v4 — Roles, equipo de gestión y clientes
-- Dominio: consultify.pro · Ejecutar en proyecto "consultify" (idempotente)
--
-- Roles: superadmin · admin · consultor · gestion · cliente
--   superadmin → ve TODO, incluido lo económico (Alejandro)
--   admin      → todo MENOS lo económico
--   consultor  → proyectos, planificación, agenda
--   gestion    → equipo de gestión (subtipo: comercial | marketing | administrativo)
--   cliente    → su zona
--
-- Equipo: consultores y equipo de gestión en una sola tabla `consultores`
--   con columna `tipo_equipo` ('consultor' | 'gestion') y `subtipo`.
-- Clientes: + director_proyecto_id (consultor) + jefe_cuenta_id (comercial)
-- ════════════════════════════════════════════════════════════════

-- ── 1 · PERFILES: ampliar roles + subtipo ──
alter table perfiles drop constraint if exists perfiles_rol_check;
alter table perfiles add constraint perfiles_rol_check
  check (rol in ('cliente','consultor','gestion','admin','superadmin'));
alter table perfiles add column if not exists subtipo text
  check (subtipo is null or subtipo in ('comercial','marketing','administrativo'));

-- Helper: ¿es equipo interno? (cualquier rol que no sea cliente)
create or replace function public.es_equipo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol() in ('consultor','gestion','admin','superadmin'), false);
$$;

-- Helper: ¿ve lo económico? (solo superadmin)
create or replace function public.ve_economico()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol() = 'superadmin', false);
$$;

-- ── 2 · EQUIPO (consultores + gestión) ──
-- Reutiliza la tabla `consultores` para todo el equipo interno.
alter table consultores add column if not exists apellidos   text;
alter table consultores add column if not exists email       text;
alter table consultores add column if not exists pct_jornada numeric(5,2) not null default 100;
alter table consultores add column if not exists tipo_equipo text not null default 'consultor'
  check (tipo_equipo in ('consultor','gestion'));
alter table consultores add column if not exists subtipo     text
  check (subtipo is null or subtipo in ('comercial','marketing','administrativo'));
-- Para gestión, el nivel J1..Senior no aplica: se admite NULL
alter table consultores alter column nivel drop not null;

comment on column consultores.tipo_equipo is 'consultor = entrega; gestion = comercial/marketing/administrativo';
comment on column consultores.subtipo is 'Solo para tipo_equipo=gestion: comercial | marketing | administrativo';

-- ── 3 · CLIENTES: Director de Proyecto + Jefe de Cuenta ──
alter table clientes add column if not exists director_proyecto_id uuid references consultores(id) on delete set null;
alter table clientes add column if not exists jefe_cuenta_id        uuid references consultores(id) on delete set null;
comment on column clientes.director_proyecto_id is 'Consultor responsable del proyecto (tipo_equipo=consultor)';
comment on column clientes.jefe_cuenta_id is 'Comercial responsable de la cuenta (tipo_equipo=gestion, subtipo=comercial)';

-- ── 4 · AGENDA / TAREAS (asegurar columnas v3) ──
alter table agenda_tareas add column if not exists tipo        text not null default 'produccion';
alter table agenda_tareas add column if not exists hora_inicio text default '09:00';
alter table agenda_tareas add column if not exists horas_base  numeric(4,1);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_tareas_tipo_check') then
    alter table agenda_tareas add constraint agenda_tareas_tipo_check
      check (tipo in ('produccion','gestion','coordinacion'));
  end if;
end $$;

-- ── 5 · CATÁLOGO DE TAREAS POR NORMA Y MODELO ──
-- Plantilla de tareas "tipo" por sistema (norma) y modelo de relación.
-- Se vuelca aquí el desglose del Excel de la calculadora.
create table if not exists tareas_catalogo (
  id          uuid primary key default gen_random_uuid(),
  norma_id    text not null references normas_catalogo(id) on delete cascade,
  modelo      text not null check (modelo in ('Apoyo','Relación','Implicación','Compromiso','Implantación')),
  titulo      text not null,
  tipo        text not null default 'produccion' check (tipo in ('produccion','gestion','coordinacion')),
  horas_base  numeric(4,1) not null default 1,
  orden       int not null default 0,
  creado      timestamptz default now()
);
create index if not exists idx_tareas_catalogo_norma on tareas_catalogo (norma_id, modelo, orden);

-- ── 6 · RLS ──
-- Económico (precios/márgenes) vive en proyectos: lo filtra la UI por rol,
-- pero reforzamos lectura de equipo en las tablas.
alter table consultores    enable row level security;
alter table tareas_catalogo enable row level security;

drop policy if exists consultores_team_all on consultores;
create policy consultores_team_all on consultores for all
  using (es_equipo()) with check (es_equipo());

drop policy if exists tareas_catalogo_team_all on tareas_catalogo;
create policy tareas_catalogo_team_all on tareas_catalogo for all
  using (es_equipo()) with check (es_equipo());

-- Perfiles: el equipo puede leer perfiles (para asignaciones); cada uno el suyo
drop policy if exists perfiles_self_select on perfiles;
create policy perfiles_self_select on perfiles for select
  using (id = auth.uid() or es_equipo());

-- Clientes / proyectos / agenda: acceso del equipo interno
do $$
declare t text;
begin
  foreach t in array array['clientes','proyectos','agenda_tareas','vacaciones','festivos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_team_all on %I', t, t);
    execute format('create policy %I_team_all on %I for all using (es_equipo()) with check (es_equipo())', t, t);
  end loop;
end $$;

-- Los clientes ven sus propios proyectos (lectura)
drop policy if exists proyectos_cliente_read on proyectos;
create policy proyectos_cliente_read on proyectos for select
  using (cliente_id in (select id from clientes where user_id = auth.uid()));

-- ── 7 · ASIGNAR SUPERADMIN A ALEJANDRO (ajusta el email) ──
-- update perfiles set rol = 'superadmin'
--   where id = (select id from auth.users where email = 'alejandro@consultify.pro');

-- ── 8 · VISTA control por sistema (norma × modelo × tareas reales) ──
create or replace view v_tareas_sistema as
select
  t.id, t.consultor_id, t.proyecto_id, t.titulo, t.tipo, t.estado,
  t.fecha_prevista, t.horas_previstas, t.fecha_efectiva, t.horas_reales,
  t.horas_base, t.hora_inicio,
  c.nombre as consultor_nombre, c.apellidos as consultor_apellidos, c.nivel as consultor_nivel,
  p.modelo as proyecto_modelo, p.normas as proyecto_normas,
  cl.empresa as cliente
from agenda_tareas t
left join consultores c on c.id = t.consultor_id
left join proyectos   p on p.id = t.proyecto_id
left join clientes    cl on cl.id = p.cliente_id;


-- ═══════════════════════════════════════════════════════════
-- migracion-v8.sql
-- ═══════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════
-- migracion-v9.sql
-- ═══════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════
-- migracion-v10.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v10
-- 1) Cliente: hasta 2 consultores responsables + meses estimados + fecha inicio
-- 2) Tabla cliente_tareas: tareas instanciadas por cliente (detectadas de sus
--    normas, añadidas a demanda) con horas, fecha estimada/real y consultor.
-- Idempotente.
-- =============================================================================

begin;

-- 1) Consultores responsables y planificación a nivel de cliente
alter table public.clientes add column if not exists consultor_1_id uuid references public.consultores(id);
alter table public.clientes add column if not exists consultor_2_id uuid references public.consultores(id);
alter table public.clientes add column if not exists meses_estimados integer not null default 3;
alter table public.clientes add column if not exists fecha_inicio date;

comment on column public.clientes.consultor_1_id is 'Consultor responsable principal del cliente.';
comment on column public.clientes.consultor_2_id is 'Segundo consultor responsable (opcional).';
comment on column public.clientes.meses_estimados is 'Duración estimada del proyecto del cliente, en meses (base del Gantt).';

-- 2) Tareas instanciadas por cliente
create table if not exists public.cliente_tareas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  norma_id       text not null,
  modelo         text not null,
  proceso        text,
  subproceso     text,
  titulo         text not null,
  horas          numeric(6,2) not null default 0,   -- horas totales del acto (tras reducción)
  bloque         text,                                -- prefijo de proceso para el Gantt (PE1, PA1…)
  consultor_id   uuid references public.consultores(id),
  fecha_estimada date,
  fecha_real     date,
  hecha          boolean not null default false,
  orden          integer not null default 0,
  creado         timestamptz default now()
);

create index if not exists idx_cliente_tareas_cliente on public.cliente_tareas (cliente_id);
create index if not exists idx_cliente_tareas_consultor on public.cliente_tareas (consultor_id);

comment on table public.cliente_tareas is 'Tareas del proyecto de un cliente, instanciadas desde el catálogo según sus normas. Fechas estimada (Gantt) y real.';

-- 3) Por cada norma de cada empresa (CIF×norma): responsable + auditoría + caducidad
alter table public.empresa_normas add column if not exists responsable_id    uuid references public.consultores(id);
alter table public.empresa_normas add column if not exists fecha_auditoria    date;
alter table public.empresa_normas add column if not exists fecha_caducidad    date;

comment on column public.empresa_normas.responsable_id is 'Consultor responsable de esta norma (cualquiera del equipo).';
comment on column public.empresa_normas.fecha_auditoria is 'Fecha de la auditoría externa de certificación/seguimiento.';
comment on column public.empresa_normas.fecha_caducidad is 'Fecha de caducidad del certificado de esta norma.';

commit;

-- VERIFICACIÓN (aparte):
-- select column_name from information_schema.columns where table_name='clientes' and column_name like 'consultor_%';
-- select count(*) from public.cliente_tareas;


-- ═══════════════════════════════════════════════════════════
-- migracion-v11.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v11
-- Fusión Proyectos → Clientes. El cliente pasa a ser el ente único de proyecto.
-- Traspasa de la tabla proyectos a clientes: consultor, modelo, fecha inicio y
-- fecha de auditoría (esta última también a empresa_normas si procede).
-- NO borra la tabla proyectos (se conserva como histórico).
-- Idempotente y conservador: solo rellena campos vacíos en clientes.
-- =============================================================================

begin;

-- Centros: nº de trabajadores (estilo Magic, para total de plantilla del grupo)
alter table public.empresa_centros add column if not exists trabajadores integer default 0;

-- Campos de proyecto a nivel cliente (por si v10 no se aplicó del todo)
alter table public.clientes add column if not exists modelo text;
alter table public.clientes add column if not exists fecha_auditoria date;
alter table public.clientes add column if not exists estado text;
alter table public.clientes add column if not exists notas text;

-- Traspaso: para cada proyecto, vuelca a su cliente los campos que estén vacíos.
-- Si un cliente tuviera varios proyectos, se toma el más reciente por fecha_inicio.
with ult as (
  select distinct on (cliente_id)
    cliente_id, consultor_id, modelo, estado, fecha_inicio, fecha_auditoria, notas
  from public.proyectos
  where cliente_id is not null
  order by cliente_id, fecha_inicio desc nulls last
)
update public.clientes c
set
  consultor_1_id  = coalesce(c.consultor_1_id, u.consultor_id),
  modelo          = coalesce(c.modelo, u.modelo),
  estado          = coalesce(c.estado, u.estado),
  fecha_inicio    = coalesce(c.fecha_inicio, u.fecha_inicio),
  fecha_auditoria = coalesce(c.fecha_auditoria, u.fecha_auditoria),
  notas           = coalesce(c.notas, u.notas)
from ult u
where u.cliente_id = c.id;

commit;

-- VERIFICACIÓN (aparte):
-- select empresa, modelo, estado, consultor_1_id, fecha_inicio, fecha_auditoria
--   from public.clientes order by empresa;


-- ═══════════════════════════════════════════════════════════
-- migracion-v12-rls.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · RLS para cliente_tareas (faltaba; causaba "row-level security policy")
-- Alinea con el patrón de cliente_empresas/empresa_normas pero incluye
-- superadmin y gestion (que también gestionan clientes).
-- =============================================================================

begin;

alter table public.cliente_tareas enable row level security;

-- Equipo gestiona todo
drop policy if exists equipo_todo_cliente_tareas on public.cliente_tareas;
create policy equipo_todo_cliente_tareas on public.cliente_tareas
  for all
  using      (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
  with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));

-- El cliente ve (solo lectura) sus tareas
drop policy if exists cliente_lee_sus_tareas on public.cliente_tareas;
create policy cliente_lee_sus_tareas on public.cliente_tareas
  for select
  using (exists (
    select 1 from public.clientes c
    where c.id = cliente_id and c.user_id = auth.uid()
  ));

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- OPCIONAL (recomendado): las tablas de v2 tampoco incluían 'superadmin' ni
-- 'gestion' en su política de equipo. Si entras como superadmin o gestion y no
-- puedes editar empresas/centros/normas, ejecuta también esto para alinearlas.
-- ─────────────────────────────────────────────────────────────────────────────
-- begin;
-- drop policy if exists equipo_todo_cliente_empresas on public.cliente_empresas;
-- create policy equipo_todo_cliente_empresas on public.cliente_empresas
--   for all using (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
--   with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
-- drop policy if exists equipo_todo_empresa_centros on public.empresa_centros;
-- create policy equipo_todo_empresa_centros on public.empresa_centros
--   for all using (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
--   with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
-- drop policy if exists equipo_todo_empresa_normas on public.empresa_normas;
-- create policy equipo_todo_empresa_normas on public.empresa_normas
--   for all using (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
--   with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
-- commit;


-- ═══════════════════════════════════════════════════════════
-- migracion-v13.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v13
-- Puente Planificador (cliente_tareas) → Agenda (agenda_tareas).
-- Añade el vínculo para sincronizar sin duplicar.
-- =============================================================================

begin;

alter table public.agenda_tareas
  add column if not exists origen_cliente_tarea_id uuid references public.cliente_tareas(id) on delete cascade;

create unique index if not exists uq_agenda_origen_cliente_tarea
  on public.agenda_tareas (origen_cliente_tarea_id)
  where origen_cliente_tarea_id is not null;

comment on column public.agenda_tareas.origen_cliente_tarea_id is
  'Si la tarea de agenda proviene del planificador de un cliente, referencia a cliente_tareas. Permite sincronizar sin duplicar.';

commit;

-- VERIFICACIÓN (aparte):
-- select count(*) from public.agenda_tareas where origen_cliente_tarea_id is not null;


-- ═══════════════════════════════════════════════════════════
-- migracion-v14.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v14
-- Renombrado INSTANTÁNEO y GLOBAL del prefijo de cliente en las tareas.
-- Al cambiar clientes.empresa, se reescribe el título de todas sus cliente_tareas
-- como "EMPRESA - norma - proceso - subproceso", y ese cambio se propaga al
-- reflejo en agenda_tareas (vía origen_cliente_tarea_id) mediante un 2º trigger.
-- Idempotente.
-- =============================================================================

begin;

-- Helper: construye el título con prefijo de cliente, omitiendo partes vacías.
create or replace function public.cliente_tarea_titulo(
  p_empresa text, p_norma text, p_proceso text, p_subproceso text
) returns text language sql immutable as $$
  select concat_ws(' - ',
    nullif(btrim(p_empresa), ''),
    nullif(btrim(p_norma), ''),
    nullif(btrim(p_proceso), ''),
    nullif(btrim(p_subproceso), '')
  );
$$;

-- ── 1) Al cambiar el nombre del cliente: renombrar todas sus tareas ──
create or replace function public.trg_cliente_rename_tareas()
returns trigger language plpgsql as $$
begin
  if new.empresa is distinct from old.empresa then
    update public.cliente_tareas t
    set titulo = public.cliente_tarea_titulo(new.empresa, t.norma_id, t.proceso, t.subproceso)
    where t.cliente_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists cliente_rename_tareas on public.clientes;
create trigger cliente_rename_tareas
  after update of empresa on public.clientes
  for each row execute function public.trg_cliente_rename_tareas();

-- ── 2) Al cambiar el título de una cliente_tarea: propagar a su reflejo en agenda ──
create or replace function public.trg_cliente_tarea_sync_agenda_titulo()
returns trigger language plpgsql as $$
begin
  if new.titulo is distinct from old.titulo then
    update public.agenda_tareas a
    set titulo = new.titulo
    where a.origen_cliente_tarea_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists cliente_tarea_sync_agenda_titulo on public.cliente_tareas;
create trigger cliente_tarea_sync_agenda_titulo
  after update of titulo on public.cliente_tareas
  for each row execute function public.trg_cliente_tarea_sync_agenda_titulo();

-- ── 3) Normalizar de una vez los títulos ya existentes ──
update public.cliente_tareas t
set titulo = public.cliente_tarea_titulo(c.empresa, t.norma_id, t.proceso, t.subproceso)
from public.clientes c
where c.id = t.cliente_id
  and t.titulo is distinct from public.cliente_tarea_titulo(c.empresa, t.norma_id, t.proceso, t.subproceso);

commit;

-- VERIFICACIÓN (aparte):
-- update clientes set empresa = empresa where id = '<algún_id>';  -- dispara el rename
-- select titulo from cliente_tareas where cliente_id = '<algún_id>' limit 5;


-- ═══════════════════════════════════════════════════════════
-- migracion-v15.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v15
-- Seguimientos de una tarea: una tarea >6h se ejecuta en varios días.
-- Guardamos los tramos como JSONB: [{fecha, horas, hecho}].
-- =============================================================================

begin;

alter table public.cliente_tareas
  add column if not exists seguimientos jsonb not null default '[]'::jsonb;

comment on column public.cliente_tareas.seguimientos is
  'Tramos de ejecución de la tarea cuando supera el tope diario: [{"fecha":"YYYY-MM-DD","horas":n,"hecho":false}].';

commit;


-- ═══════════════════════════════════════════════════════════
-- migracion-v16.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v16
-- Separación Cliente / Proyecto. El cliente (matriz de facturación) tiene N
-- proyectos. Las tareas cuelgan del PROYECTO, no del cliente.
-- ⚠️ Borra las cliente_tareas actuales (se recrean desde los proyectos nuevos).
-- =============================================================================

begin;

-- 1) Tabla de proyectos del cliente
create table if not exists public.proyectos_cliente (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  nombre         text not null,
  normas         text[] not null default '{}',     -- normas elegidas para este proyecto
  modelo         text,                              -- modelo de relación
  estado         text not null default 'activo',    -- activo | pausado | cerrado
  meses_estimados integer not null default 3,
  fecha_inicio   date,
  consultor_1_id uuid references public.consultores(id),
  consultor_2_id uuid references public.consultores(id),
  creado         timestamptz default now()
);
create index if not exists idx_proyectos_cliente_cliente on public.proyectos_cliente (cliente_id);
create index if not exists idx_proyectos_cliente_estado on public.proyectos_cliente (estado);

alter table public.proyectos_cliente enable row level security;
drop policy if exists equipo_todo_proyectos_cliente on public.proyectos_cliente;
create policy equipo_todo_proyectos_cliente on public.proyectos_cliente
  for all
  using      (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
  with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
drop policy if exists cliente_lee_sus_proyectos on public.proyectos_cliente;
create policy cliente_lee_sus_proyectos on public.proyectos_cliente
  for select using (exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid()));

-- 2) cliente_tareas pasa a colgar del proyecto
--    Borramos las tareas actuales (decisión: recrear desde proyectos nuevos).
delete from public.cliente_tareas;

alter table public.cliente_tareas
  add column if not exists proyecto_id uuid references public.proyectos_cliente(id) on delete cascade;

-- Campos para la integración/anidado de tareas comunes
alter table public.cliente_tareas
  add column if not exists integrada boolean not null default false;
alter table public.cliente_tareas
  add column if not exists normas_integradas text[] not null default '{}';

comment on column public.cliente_tareas.proyecto_id is 'Proyecto al que pertenece la tarea (capa intermedia bajo el cliente).';
comment on column public.cliente_tareas.integrada is 'true si es una tarea anidada que integra varias normas.';
comment on column public.cliente_tareas.normas_integradas is 'Normas integradas en esta tarea (base primero), p.ej. {9001,14001}.';

commit;

-- VERIFICACIÓN (aparte):
-- select count(*) from public.proyectos_cliente;
-- select column_name from information_schema.columns where table_name='cliente_tareas' and column_name in ('proyecto_id','integrada','normas_integradas');


-- ═══════════════════════════════════════════════════════════
-- migracion-v17.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v17 · Contactos múltiples por cliente
-- =============================================================================

begin;

create table if not exists public.cliente_contactos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  nombre      text not null default '',
  cargo       text,
  email       text,
  telefono    text,
  principal   boolean not null default false,
  creado      timestamptz default now()
);
create index if not exists idx_cliente_contactos_cliente on public.cliente_contactos (cliente_id);

alter table public.cliente_contactos enable row level security;
drop policy if exists equipo_todo_cliente_contactos on public.cliente_contactos;
create policy equipo_todo_cliente_contactos on public.cliente_contactos
  for all
  using      (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
  with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
drop policy if exists cliente_lee_sus_contactos on public.cliente_contactos;
create policy cliente_lee_sus_contactos on public.cliente_contactos
  for select using (exists (select 1 from public.clientes c where c.id = cliente_id and c.user_id = auth.uid()));

commit;


-- ═══════════════════════════════════════════════════════════
-- migracion-v18.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v18
-- Flag para saber si una tarea de proyecto fue editada a mano. La sincronización
-- desde el catálogo (tareas_catalogo) solo pisará las que NO estén editadas.
-- =============================================================================

begin;

alter table public.cliente_tareas
  add column if not exists editada_manual boolean not null default false;

comment on column public.cliente_tareas.editada_manual is
  'true si el usuario editó horas/título a mano. La sincronización desde el catálogo no la sobrescribe.';

commit;


-- ═══════════════════════════════════════════════════════════
-- migracion-v19.sql
-- ═══════════════════════════════════════════════════════════
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


-- ═══════════════════════════════════════════════════════════
-- migracion-v20.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v20
-- Horas reales en las tareas de proyecto (registro de ejecución).
-- =============================================================================

begin;

alter table public.cliente_tareas add column if not exists horas_reales numeric(6,2);

comment on column public.cliente_tareas.horas_reales is 'Horas reales dedicadas a la tarea (ajuste manual durante la ejecución).';

commit;

notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════
-- migracion-v21.sql
-- ═══════════════════════════════════════════════════════════
-- =============================================================================
-- CONSULTIFY · Migración v21
-- Bloques de ejecución de una tarea: [{fecha, horas}] (4h por defecto, editables).
-- Cada bloque se vuelca como un evento independiente en la agenda.
-- =============================================================================

begin;

alter table public.cliente_tareas
  add column if not exists bloques_ejecucion jsonb not null default '[]'::jsonb;

comment on column public.cliente_tareas.bloques_ejecucion is
  'Bloques de ejecución [{"fecha":"YYYY-MM-DD","horas":4}]. Una tarea de 20h = 5 bloques.';

commit;

notify pgrst, 'reload schema';


-- Refrescar caché de esquema
notify pgrst, 'reload schema';
