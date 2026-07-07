-- =============================================================================
-- CONSULTIFY · Migración v41 · Vinculación con Holded
-- Añade a 'clientes' los campos para enlazar cada cliente con su contacto de
-- Holded. El vínculo se hace por CIF (columna 'code' del contacto en Holded).
-- =============================================================================

begin;

alter table public.clientes
  add column if not exists holded_id text;             -- id interno del contacto en Holded
alter table public.clientes
  add column if not exists holded_sincronizado_en timestamptz; -- última sincronización
alter table public.clientes
  add column if not exists cif_matriz text;            -- CIF de la empresa matriz (identificador visible)

comment on column public.clientes.holded_id is 'ID del contacto correspondiente en Holded (para sincronización)';
comment on column public.clientes.cif_matriz is 'CIF de la empresa matriz; identificador de negocio del cliente';

-- Índice para buscar rápido por CIF (evita duplicados al sincronizar).
create index if not exists idx_clientes_cif on public.clientes (cif);
create index if not exists idx_clientes_holded on public.clientes (holded_id);

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
