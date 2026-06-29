-- ============================================================
-- migracion-v30-normas-nuevas.sql
-- Añade 3 normas a normas_catalogo (sin tareas todavía; se cargarán
-- desde la pantalla de Sistemas o con un seed posterior):
--   · UNE 66181 (formación virtual)
--   · Plan de Igualdad
--   · Madrid Excelente
-- ============================================================

insert into normas_catalogo (id, nombre, descripcion, nivel, h_apoyo, activa) values
  ('une66181',        'UNE 66181',        'Calidad de la formación virtual',                'J3', 30, true),
  ('igualdad',        'Plan de Igualdad',  'Plan de igualdad de empresa',                    'J3', 30, true),
  ('madridexcelente', 'Madrid Excelente',  'Marca de garantía de la Comunidad de Madrid',    'J3', 30, true)
on conflict (id) do update
  set nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      nivel = excluded.nivel,
      h_apoyo = excluded.h_apoyo,
      activa = excluded.activa;
