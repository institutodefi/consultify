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
