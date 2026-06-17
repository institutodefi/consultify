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
