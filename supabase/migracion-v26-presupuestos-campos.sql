-- ============================================================
-- migracion-v26-presupuestos-campos.sql
-- Campos adicionales del lead para la oferta:
--   cif, cargo, numero_oferta, comercial
-- ============================================================

alter table presupuestos add column if not exists cif            text;
alter table presupuestos add column if not exists cargo          text;
alter table presupuestos add column if not exists numero_oferta  text;
alter table presupuestos add column if not exists comercial      text default 'Alejandro';

-- Índice para localizar rápido por número de oferta
create index if not exists idx_presupuestos_numero_oferta on presupuestos(numero_oferta);
