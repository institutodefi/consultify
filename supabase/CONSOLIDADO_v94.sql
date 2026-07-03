-- =============================================================================
-- CONSULTIFY · SQL CONSOLIDADO (ejecutar de una vez en Supabase → SQL Editor)
-- Pone la base de datos al día con todo lo necesario para la app v94:
--   1) Roles ampliados (superadmin, gestion) + tu alta como superadmin
--   2) Columnas de cliente_tareas (bloques_ejecucion, colaboradores, etc.)
--   3) Catálogo de procesos internos
--   4) Función marcar_acceso + campos de accesos
-- Es IDEMPOTENTE: puedes ejecutarlo varias veces sin romper nada.
-- =============================================================================

begin;

-- ── 1 · ROLES ────────────────────────────────────────────────────────────────
-- Permitir los 5 roles (el esquema base solo tenía cliente/consultor/admin).
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('cliente','consultor','gestion','admin','superadmin'));

-- Campos de accesos / login duro.
alter table public.perfiles add column if not exists activo boolean not null default true;
alter table public.perfiles add column if not exists email text;
alter table public.perfiles add column if not exists nivel text
  check (nivel is null or nivel in ('J1','J2','J3','Senior'));
alter table public.perfiles add column if not exists invitado_en timestamptz;
alter table public.perfiles add column if not exists ultimo_acceso timestamptz;

-- ── 2 · COLUMNAS DE cliente_tareas ──────────────────────────────────────────
alter table public.cliente_tareas add column if not exists bloques_ejecucion jsonb not null default '[]'::jsonb;
alter table public.cliente_tareas add column if not exists seguimientos jsonb not null default '[]'::jsonb;
alter table public.cliente_tareas add column if not exists normas_integradas jsonb not null default '[]'::jsonb;
alter table public.cliente_tareas add column if not exists editada_manual boolean not null default false;
alter table public.cliente_tareas add column if not exists colaboradores jsonb not null default '[]'::jsonb;
alter table public.cliente_tareas add column if not exists fecha_estimada date;
alter table public.cliente_tareas add column if not exists fecha_real date;
alter table public.cliente_tareas add column if not exists hecha boolean not null default false;

-- ── 3 · CATÁLOGO DE PROCESOS INTERNOS ───────────────────────────────────────
create table if not exists public.procesos_internos (
  id          uuid primary key default gen_random_uuid(),
  creado_en   timestamptz not null default now(),
  codigo      text unique,
  nombre      text not null,
  descripcion text,
  color       text default '#0A2A6C',
  activo      boolean not null default true,
  orden       int default 100,
  creado_por  uuid references auth.users(id) on delete set null
);
create index if not exists idx_procesos_internos_activo on public.procesos_internos (activo, orden);

insert into public.procesos_internos (nombre, codigo, descripcion, orden) values
  ('Reunión de equipo',        'PI-REU',  'Reuniones internas del equipo de consultoría', 10),
  ('Formación interna',        'PI-FORM', 'Formación y desarrollo del equipo', 20),
  ('Mejora de metodología',    'PI-MET',  'Mejora de plantillas, procesos y herramientas internas', 30),
  ('Comercial / propuestas',   'PI-COM',  'Preparación de ofertas y actividad comercial no facturable', 40),
  ('Administración interna',   'PI-ADM',  'Tareas administrativas y de gestión propias', 50)
on conflict (codigo) do nothing;

-- Vínculo tarea → proceso interno (cuando tipo = 'proceso_interno')
alter table public.cliente_tareas
  add column if not exists proceso_interno_id uuid references public.procesos_internos(id) on delete set null;

-- Las tareas MANUALES viven en agenda_tareas: necesitan las mismas columnas.
alter table public.agenda_tareas
  add column if not exists proceso_interno_id uuid references public.procesos_internos(id) on delete set null;
alter table public.agenda_tareas
  add column if not exists colaboradores jsonb not null default '[]'::jsonb;

-- ── 4 · FUNCIONES DE APOYO ──────────────────────────────────────────────────
create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid();
$$;

create or replace function public.soy_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'superadmin' and activo from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.marcar_acceso()
returns void language sql security definer set search_path = public as $$
  update public.perfiles set ultimo_acceso = now() where id = auth.uid();
$$;

commit;

-- ── 5 · RLS ──────────────────────────────────────────────────────────────────
alter table public.procesos_internos enable row level security;

drop policy if exists procesos_internos_select on public.procesos_internos;
create policy procesos_internos_select on public.procesos_internos
  for select to authenticated
  using (public.mi_rol() in ('superadmin','admin','consultor','gestion'));

drop policy if exists procesos_internos_write on public.procesos_internos;
create policy procesos_internos_write on public.procesos_internos
  for all to authenticated
  using (public.mi_rol() in ('superadmin','admin'))
  with check (public.mi_rol() in ('superadmin','admin'));

grant select, insert, update, delete on public.procesos_internos to authenticated;

drop policy if exists perfiles_superadmin_all on public.perfiles;
create policy perfiles_superadmin_all on public.perfiles
  for all
  using (public.soy_superadmin())
  with check (public.soy_superadmin());

-- ── 6 · TU ALTA COMO SUPERADMIN (ajusta el email si procede) ────────────────
-- Actualiza si ya tienes perfil…
update public.perfiles p
set rol = 'superadmin', activo = true
from auth.users u
where p.id = u.id and u.email = 'alejandro@tuconsultor.com';

-- …y crea el perfil si por lo que sea no existía.
insert into public.perfiles (id, rol, activo, nombre, email)
select u.id, 'superadmin', true, 'Alejandro', u.email
from auth.users u
where u.email = 'alejandro@tuconsultor.com'
on conflict (id) do update set rol = 'superadmin', activo = true;

-- ── 7 · RECARGA DEL SCHEMA CACHE (evita "column ... in schema cache") ───────
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- ── 8 · COMPROBACIÓN FINAL ──────────────────────────────────────────────────
-- Debe devolver tu email con rol=superadmin y activo=true.
select u.email, p.rol, p.activo
from auth.users u
left join public.perfiles p on p.id = u.id
where u.email = 'alejandro@tuconsultor.com';
