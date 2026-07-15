-- =============================================================================
-- CONSULTIFY · Migración v49 · Mapa de procesos (bandas + subprocesos)
-- -----------------------------------------------------------------------------
-- Amplía procesos_internos para poder pintar un mapa por bandas:
--   banda: 'estrategico' | 'clave' | 'soporte'
--   orden: ya existía (posición dentro de la banda)
-- Crea procesos_subprocesos (subprocesos dentro de cada proceso).
-- Siembra procesos de ejemplo típicos de una consultora (idempotente por código).
-- =============================================================================

begin;

-- 1 · Campo banda en procesos_internos
alter table public.procesos_internos
  add column if not exists banda text not null default 'clave'
  check (banda in ('estrategico', 'clave', 'soporte'));

alter table public.procesos_internos
  add column if not exists responsable text;

-- 2 · Subprocesos
create table if not exists public.procesos_subprocesos (
  id          uuid primary key default gen_random_uuid(),
  proceso_id  uuid not null references public.procesos_internos(id) on delete cascade,
  codigo      text,
  nombre      text not null default '',
  responsable text,
  orden       int default 100,
  creado_en   timestamptz default now()
);
create index if not exists procesos_subprocesos_proc_idx on public.procesos_subprocesos (proceso_id);

alter table public.procesos_subprocesos enable row level security;
drop policy if exists procesos_subprocesos_select on public.procesos_subprocesos;
create policy procesos_subprocesos_select on public.procesos_subprocesos
  for select to authenticated using (true);
drop policy if exists procesos_subprocesos_write on public.procesos_subprocesos;
create policy procesos_subprocesos_write on public.procesos_subprocesos
  for all to authenticated
  using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo
                 and p.rol in ('superadmin','admin','consultor','gestion')))
  with check (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo
                 and p.rol in ('superadmin','admin','consultor','gestion')));

-- 3 · Procesos de ejemplo (solo se insertan si no existe ese código)
insert into public.procesos_internos (codigo, nombre, banda, responsable, orden, color)
values
  -- Estratégicos
  ('PE-DIR', 'Dirección y estrategia',        'estrategico', 'Dirección',        10, '#061B45'),
  ('PE-COM', 'Comercial y captación',         'estrategico', 'Jefe de cuenta',   20, '#061B45'),
  ('PE-MEJ', 'Mejora e innovación',           'estrategico', 'Calidad',          30, '#061B45'),
  -- Clave
  ('PC-OFE', 'Elaboración de ofertas',        'clave',       'Comercial',        10, '#0A2A6C'),
  ('PC-PROY','Ejecución de proyectos',        'clave',       'Director de proyecto', 20, '#0A2A6C'),
  ('PC-AUD', 'Auditoría y certificación',     'clave',       'Consultor',        30, '#0A2A6C'),
  ('PC-SEG', 'Seguimiento al cliente',        'clave',       'Director de proyecto', 40, '#0A2A6C'),
  -- Soporte
  ('PS-RRHH','Personas y formación',          'soporte',     'Administración',   10, '#F5A623'),
  ('PS-IT',  'Sistemas y tecnología',         'soporte',     'IT',               20, '#F5A623'),
  ('PS-ADM', 'Administración y finanzas',     'soporte',     'Administración',   30, '#F5A623'),
  ('PS-RGPD','Cumplimiento y protección de datos', 'soporte', 'DPD',             40, '#F5A623')
on conflict (codigo) do nothing;

-- 4 · Algunos subprocesos de ejemplo (idempotente aproximado por proceso+nombre)
insert into public.procesos_subprocesos (proceso_id, codigo, nombre, responsable, orden)
select p.id, v.codigo, v.nombre, v.responsable, v.orden
from (values
  ('PC-PROY', 'PC-PROY.1', 'Planificación del proyecto', 'Director de proyecto', 10),
  ('PC-PROY', 'PC-PROY.2', 'Documentación del sistema',  'Consultor',            20),
  ('PC-PROY', 'PC-PROY.3', 'Formación al cliente',        'Consultor',            30),
  ('PC-AUD',  'PC-AUD.1',  'Auditoría interna',           'Consultor',            10),
  ('PC-AUD',  'PC-AUD.2',  'Acompañamiento a certificación','Director de proyecto',20)
) as v(pcod, codigo, nombre, responsable, orden)
join public.procesos_internos p on p.codigo = v.pcod
where not exists (
  select 1 from public.procesos_subprocesos s
  where s.proceso_id = p.id and s.nombre = v.nombre
);

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
