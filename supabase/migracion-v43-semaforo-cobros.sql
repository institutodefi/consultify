-- =============================================================================
-- CONSULTIFY · Migración v43 · Semáforo de cobros (facturas Holded)
-- Añade a 'clientes' el estado de cobros calculado desde Holded (1 vez/día).
--   estado_cobros: 'verde' | 'amarillo' | 'rojo' | null (sin datos)
--   cobros_actualizado_en: cuándo se consultó por última vez
--   cobros_detalle: resumen (nº vencidas, nº pendientes, importe)
-- =============================================================================

begin;

alter table public.clientes add column if not exists estado_cobros text
  check (estado_cobros is null or estado_cobros in ('verde','amarillo','rojo'));
alter table public.clientes add column if not exists cobros_actualizado_en timestamptz;
alter table public.clientes add column if not exists cobros_detalle jsonb;

comment on column public.clientes.estado_cobros is 'Semáforo de cobros desde Holded: verde=al día, amarillo=pendientes no vencidas, rojo=vencidas';

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
