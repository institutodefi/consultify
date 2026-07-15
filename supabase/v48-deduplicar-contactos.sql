-- =============================================================================
-- CONSULTIFY · v48 · Verificación y deduplicación OPCIONAL de contactos
-- -----------------------------------------------------------------------------
-- Ejecuta ESTO DESPUÉS de la migración v48, y solo si quieres.
-- La migración crea un contacto por cliente. Si el mismo gestor aparecía en
-- varios clientes (mismo email), tendrás contactos repetidos. Este script:
--   1) Te MUESTRA los duplicados (consulta de solo lectura).
--   2) (Comentado) Los fusiona dejando uno y re-vinculando sus empresas.
-- Revisa el listado del paso 1 ANTES de descomentar el paso 2.
-- =============================================================================

-- ---------- PASO 1 · Ver duplicados por email (solo lectura) ----------
select
  email,
  count(*)                    as veces,
  string_agg(nombre, ' | ')   as nombres,
  string_agg(id::text, ', ')  as ids_contacto
from public.contactos
where email is not null and email <> ''
group by email
having count(*) > 1
order by veces desc;

-- ---------- PASO 2 · Fusionar duplicados (DESCOMENTAR con cuidado) ----------
-- Deja el contacto más antiguo por email, mueve los vínculos de los demás a él,
-- y borra los contactos sobrantes.
--
-- with dups as (
--   select id, email,
--          row_number() over (partition by email order by creado, id) as rn,
--          first_value(id) over (partition by email order by creado, id) as keep_id
--   from public.contactos
--   where email is not null and email <> ''
-- )
-- -- Re-vincular empresas de los duplicados al contacto que se conserva
-- , mover as (
--   update public.empresa_contactos ec
--   set contacto_id = d.keep_id
--   from dups d
--   where ec.contacto_id = d.id and d.rn > 1
--     and not exists (
--       select 1 from public.empresa_contactos ec2
--       where ec2.empresa_id = ec.empresa_id and ec2.contacto_id = d.keep_id
--     )
--   returning ec.id
-- )
-- -- Borrar los contactos duplicados sobrantes
-- delete from public.contactos c
-- using dups d
-- where c.id = d.id and d.rn > 1;
