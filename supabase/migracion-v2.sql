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
