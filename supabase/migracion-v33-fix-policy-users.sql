-- ============================================================
-- migracion-v33-fix-policy-users.sql  (REFORZADA)
-- Arregla los dos errores encadenados al crear ofertas:
--   1) "permission denied for table users"  -> política de SELECT que leía auth.users
--   2) "new row violates row-level security policy" -> insert no permitido / select de vuelta bloqueado
--
-- Estrategia: políticas explícitas por rol (anon, authenticated) y separar el
-- SELECT de vuelta del INSERT para que el alta pública nunca se bloquee.
-- Idempotente: re-ejecutable sin problemas.
-- ============================================================

-- Aseguramos que RLS está activado (pero con políticas correctas).
alter table presupuestos enable row level security;

-- ---------- Limpiamos políticas previas de presupuestos ----------
drop policy if exists presupuestos_anon_insert on presupuestos;
drop policy if exists presupuestos_owner_read on presupuestos;
drop policy if exists presupuestos_insert_all on presupuestos;
drop policy if exists presupuestos_select_own on presupuestos;
drop policy if exists presupuestos_update_team on presupuestos;

-- ---------- INSERT: cualquiera (anónimo o autenticado) puede crear ----------
-- Generador público y portal interno dan de alta ofertas/consultas.
create policy presupuestos_insert_all on presupuestos
  for insert
  to anon, authenticated
  with check (true);

-- ---------- SELECT: dueño por email del JWT, dueño por user_id, o equipo ----------
-- NO consultamos auth.users (eso causaba "permission denied for table users").
-- Importante: que el alta NO dependa de poder leer la fila de vuelta.
create policy presupuestos_select_own on presupuestos
  for select
  to anon, authenticated
  using (
    user_id = auth.uid()
    or email = (auth.jwt() ->> 'email')
    or coalesce(mi_rol(), '') in ('consultor', 'admin', 'superadmin', 'gestion')
  );

-- ---------- UPDATE: solo equipo interno ----------
create policy presupuestos_update_team on presupuestos
  for update
  to authenticated
  using (coalesce(mi_rol(), '') in ('consultor', 'admin', 'superadmin', 'gestion'))
  with check (coalesce(mi_rol(), '') in ('consultor', 'admin', 'superadmin', 'gestion'));

-- ---------- Permisos de tabla (grant) para los roles de la API ----------
-- RLS filtra filas, pero el rol necesita el privilegio base sobre la tabla.
grant insert, select on presupuestos to anon, authenticated;
grant update on presupuestos to authenticated;
