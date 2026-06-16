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
