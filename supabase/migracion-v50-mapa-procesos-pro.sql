-- =============================================================================
-- CONSULTIFY · Migración v50 · Mapa de procesos PRO
--   · Bandas flexibles (tabla propia, se pueden añadir/quitar, cada una con prefijo)
--   · Procesos con código automático (prefijo de banda + número)
--   · Subprocesos con código automático (S01, S02… + código del proceso)
--   · Riesgos por subproceso (probabilidad × impacto = nivel + control)
--
-- Es idempotente y compatible tanto si se ejecutó la v49 como si no.
-- =============================================================================

begin;

-- ---------- 1 · BANDAS (tipos de proceso, flexibles) ----------
create table if not exists public.procesos_bandas (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  prefijo     text not null,                 -- p.ej. 'ESTR', 'CLAVE', 'APOYO'
  color       text not null default '#0A2A6C',
  orden       int not null default 100,
  creado_en   timestamptz default now()
);

-- Sembrar las tres bandas base (solo si la tabla está vacía)
insert into public.procesos_bandas (titulo, prefijo, color, orden)
select * from (values
  ('Procesos estratégicos',        'ESTR',  '#061B45', 10),
  ('Procesos clave',               'CLAVE', '#0A2A6C', 20),
  ('Procesos de apoyo y soporte',  'APOYO', '#F5A623', 30)
) as v(titulo, prefijo, color, orden)
where not exists (select 1 from public.procesos_bandas);

-- ---------- 2 · PROCESOS: vincular a banda_id + código auto ----------
alter table public.procesos_internos
  add column if not exists banda_id uuid references public.procesos_bandas(id) on delete set null;
alter table public.procesos_internos
  add column if not exists responsable text;

-- Si viene de la v49 (columna 'banda' de texto), mapear al nuevo banda_id.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='procesos_internos' and column_name='banda') then
    update public.procesos_internos p set banda_id = b.id
    from public.procesos_bandas b
    where p.banda_id is null and (
      (p.banda = 'estrategico' and b.prefijo = 'ESTR') or
      (p.banda = 'clave'       and b.prefijo = 'CLAVE') or
      (p.banda = 'soporte'     and b.prefijo = 'APOYO')
    );
  end if;
end $$;

-- Los procesos sin banda → a la primera banda (clave/estratégica) por defecto
update public.procesos_internos p
set banda_id = (select id from public.procesos_bandas order by orden limit 1)
where p.banda_id is null;

-- ---------- 3 · SUBPROCESOS (crea si no existe; de la v49) ----------
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

-- ---------- 4 · RIESGOS por subproceso ----------
-- nivel = probabilidad (1-5) × impacto (1-5) = 1..25, clasificado en bajo/medio/alto.
create table if not exists public.procesos_riesgos (
  id            uuid primary key default gen_random_uuid(),
  subproceso_id uuid not null references public.procesos_subprocesos(id) on delete cascade,
  descripcion   text not null default '',
  probabilidad  int  not null default 1 check (probabilidad between 1 and 5),
  impacto       int  not null default 1 check (impacto between 1 and 5),
  control       text,                          -- medida de control / acción
  creado_en     timestamptz default now()
);
create index if not exists procesos_riesgos_sub_idx on public.procesos_riesgos (subproceso_id);

-- ---------- 5 · RLS ----------
do $$
declare t text;
begin
  foreach t in array array['procesos_bandas','procesos_subprocesos','procesos_riesgos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$
      create policy %I_write on public.%I for all to authenticated
      using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo
                     and p.rol in ('superadmin','admin','consultor','gestion')))
      with check (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo
                     and p.rol in ('superadmin','admin','consultor','gestion')))
    $f$, t, t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- Verificación:
-- select titulo, prefijo from public.procesos_bandas order by orden;
-- select count(*) from public.procesos_internos where banda_id is not null;
