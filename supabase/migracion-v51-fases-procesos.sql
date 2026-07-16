-- =============================================================================
-- CONSULTIFY · Migración v51 · Fases del proceso (Pre · Ongoing · Post)
-- -----------------------------------------------------------------------------
-- Cada proceso puede estar en una o varias fases del ciclo:
--   pre     = antes / preparación
--   ongoing = durante / ejecución
--   post    = después / cierre y seguimiento
-- Se guarda como array de texto. Por defecto 'ongoing'.
-- =============================================================================

begin;

alter table public.procesos_internos
  add column if not exists fases text[] not null default array['ongoing']::text[];

-- Los procesos existentes sin fase se dejan en 'ongoing' (ya es el default).
update public.procesos_internos
set fases = array['ongoing']::text[]
where fases is null or array_length(fases, 1) is null;

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
