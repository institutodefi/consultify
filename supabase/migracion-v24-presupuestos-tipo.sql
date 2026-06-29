-- ============================================================
-- migracion-v24-presupuestos-tipo.sql
-- Amplía el CHECK de 'tipo' en presupuestos para admitir 'fraccionado'
-- (modelo Implantación) y mantiene 'mes' y 'bolsa'.
-- También añade una columna opcional 'requerimiento' (texto legible
-- de lo que pidió el lead) para que el comercial prepare la oferta.
-- ============================================================

BEGIN;

-- 1) Reemplazar la restricción de 'tipo'
ALTER TABLE presupuestos DROP CONSTRAINT IF EXISTS presupuestos_tipo_check;
ALTER TABLE presupuestos
  ADD CONSTRAINT presupuestos_tipo_check
  CHECK (tipo IN ('mes', 'bolsa', 'fraccionado'));

-- 2) Columna legible del requerimiento (no rompe inserts existentes)
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS requerimiento text;

COMMIT;
