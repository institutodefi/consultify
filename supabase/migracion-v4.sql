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
