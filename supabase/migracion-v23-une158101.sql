-- ============================================================
-- migracion-v23-une158101.sql
-- Alta UNE 158101 en normas_catalogo (esquema real confirmado)
-- ============================================================
INSERT INTO normas_catalogo (id, nombre, descripcion, nivel, h_apoyo, activa)
VALUES (
  'une158101',
  'UNE 158101 — Gestión de centros residenciales',
  'Servicios para la promoción de la autonomía personal. Centros residenciales y con centro de día/noche integrado.',
  'J3',
  40,
  true
)
ON CONFLICT (id) DO UPDATE
  SET nombre = EXCLUDED.nombre,
      descripcion = EXCLUDED.descripcion,
      nivel = EXCLUDED.nivel,
      h_apoyo = EXCLUDED.h_apoyo,
      activa = true;
