-- =============================================================================
-- CONSULTIFY · Migración v42 · Unificar EQUIPO y ACCESOS
-- -----------------------------------------------------------------------------
-- Decisión: "usar solo acceso". El equipo de la agenda pasa a derivarse de los
-- PERFILES con acceso. La tabla 'consultores' se sustituye por una VISTA sobre
-- 'perfiles', de modo que el código de la app (listTable('consultores')) sigue
-- funcionando sin cambios, pero la fuente única de verdad es 'perfiles'.
--
-- ⚠️ Requiere haber hecho el reset (solo Alejandro). Si tienes consultores con
--    datos que conservar, migra primero sus datos a perfiles.
-- =============================================================================

begin;

-- ── 1 · Campos de agenda en perfiles ────────────────────────────────────────
alter table public.perfiles add column if not exists nivel text
  check (nivel is null or nivel in ('J1','J2','J3','Senior'));
alter table public.perfiles add column if not exists normas text[] not null default '{}';
alter table public.perfiles add column if not exists capacidad_clientes int not null default 12;
alter table public.perfiles add column if not exists apellidos text;

-- ── 2 · Migrar referencias de clientes: consultores.id → perfiles.id ────────
-- Las columnas de clientes que apuntan a consultores deben pasar a apuntar a
-- perfiles. Como el equipo está vacío salvo Alejandro, ponemos a NULL las
-- referencias colgantes (se reasignarán al recrear el equipo) y quitamos las FK
-- antiguas hacia consultores para poder sustituir la tabla por una vista.
do $$
declare fk record;
begin
  for fk in
    select con.conname, con.conrelid::regclass as tabla
    from pg_constraint con
    where con.confrelid = 'public.consultores'::regclass and con.contype = 'f'
  loop
    execute format('alter table %s drop constraint if exists %I', fk.tabla, fk.conname);
    raise notice 'FK eliminada: % en %', fk.conname, fk.tabla;
  end loop;
end $$;

-- ── 3 · Sustituir la tabla consultores por una VISTA sobre perfiles ─────────
-- Guardamos el nombre viejo por si hay que revertir.
alter table if exists public.consultores rename to consultores_old_backup;

-- Vista: equipo = perfiles con rol de equipo y activos. El id de la vista es el
-- id del perfil (= id de auth.users), así todo lo que enlace por id sigue igual.
create or replace view public.consultores as
select
  p.id,
  coalesce(p.nombre, split_part(p.email, '@', 1)) as nombre,
  p.apellidos,
  coalesce(p.nivel, 'Senior') as nivel,
  p.normas,
  p.capacidad_clientes,
  p.activo,
  p.id as user_id,
  p.rol,
  p.email
from public.perfiles p
where p.rol in ('director','consultor','admin','superadmin')
  and p.activo = true;

-- Permisos de lectura de la vista.
grant select on public.consultores to authenticated, anon;

commit;

-- ── 4 · Recargar cache ──────────────────────────────────────────────────────
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- ── 5 · COMPROBACIÓN ────────────────────────────────────────────────────────
-- El equipo (vista) debe mostrar exactamente los perfiles con acceso de equipo.
select id, nombre, nivel, rol, activo from public.consultores order by nombre;
