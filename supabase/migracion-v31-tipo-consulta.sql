-- ============================================================
-- migracion-v31-tipo-consulta.sql
-- Amplía el CHECK de 'tipo' en presupuestos para admitir 'consulta'
-- (solicitudes de información desde "¿Quieres otra norma?").
-- ============================================================

ALTER TABLE presupuestos DROP CONSTRAINT IF EXISTS presupuestos_tipo_check;
ALTER TABLE presupuestos
  ADD CONSTRAINT presupuestos_tipo_check
  CHECK (tipo IN ('mes', 'bolsa', 'fraccionado', 'consulta'));
