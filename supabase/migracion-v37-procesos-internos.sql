-- =============================================================================
-- CONSULTIFY · Migración v37
-- 1) Catálogo de procesos internos (editable desde el portal)
-- 2) Tipo 'proceso_interno' en cliente_tareas + vínculo al proceso interno
-- 3) Colaboradores invitados en tareas (gestión manual)
-- =============================================================================

begin;

-- ── 1 · Catálogo de procesos internos ────────────────────────────────────────
-- Procesos de trabajo internos de la consultora (no ligados a un cliente):
-- p.ej. "Reunión de equipo", "Formación interna", "Mejora de plantillas", etc.
create table if not exists public.procesos_internos (
  id          uuid primary key default gen_random_uuid(),
  creado_en   timestamptz not null default now(),
  codigo      text unique,                    -- opcional, p.ej. 'PI-FORM'
  nombre      text not null,
  descripcion text,
  color       text default '#0A2A6C',         -- para pintarlo en el calendario
  activo      boolean not null default true,
  orden       int default 100,
  creado_por  uuid references auth.users(id) on delete set null
);

create index if not exists idx_procesos_internos_activo on public.procesos_internos (activo, orden);

-- Semilla mínima (puedes editarla o borrarla desde el portal)
insert into public.procesos_internos (nombre, codigo, descripcion, orden) values
  ('Reunión de equipo',        'PI-REU',  'Reuniones internas del equipo de consultoría', 10),
  ('Formación interna',        'PI-FORM', 'Formación y desarrollo del equipo', 20),
  ('Mejora de metodología',    'PI-MET',  'Mejora de plantillas, procesos y herramientas internas', 30),
  ('Comercial / propuestas',   'PI-COM',  'Preparación de ofertas y actividad comercial no facturable', 40),
  ('Administración interna',   'PI-ADM',  'Tareas administrativas y de gestión propias', 50)
on conflict (codigo) do nothing;

-- ── 2 · cliente_tareas: soportar 'proceso_interno' ──────────────────────────
-- La columna 'tipo' ya existe; añadimos el vínculo opcional al proceso interno.
-- Cuando tipo='proceso_interno', proyecto_id/cliente_id pueden ir a NULL y en su
-- lugar se rellena proceso_interno_id.
alter table public.cliente_tareas
  add column if not exists proceso_interno_id uuid references public.procesos_internos(id) on delete set null;

-- ── 3 · Colaboradores invitados a una tarea (gestión manual) ────────────────
-- Lista de perfiles internos invitados a colaborar en una tarea concreta.
alter table public.cliente_tareas
  add column if not exists colaboradores jsonb not null default '[]'::jsonb;
comment on column public.cliente_tareas.colaboradores is
  'IDs/estructura de colaboradores invitados: [{"id":"<uuid>","nombre":"...","email":"..."}]';

commit;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.procesos_internos enable row level security;

-- Equipo interno (no cliente) puede leer el catálogo.
drop policy if exists procesos_internos_select on public.procesos_internos;
create policy procesos_internos_select on public.procesos_internos
  for select to authenticated
  using (public.mi_rol() in ('superadmin','admin','consultor','gestion'));

-- Solo superadmin/admin pueden crear/editar/borrar procesos internos.
drop policy if exists procesos_internos_write on public.procesos_internos;
create policy procesos_internos_write on public.procesos_internos
  for all to authenticated
  using (public.mi_rol() in ('superadmin','admin'))
  with check (public.mi_rol() in ('superadmin','admin'));

grant select, insert, update, delete on public.procesos_internos to authenticated;

-- Recargar el schema cache de PostgREST
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
