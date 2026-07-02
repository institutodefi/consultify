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
