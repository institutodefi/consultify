-- ============================================================
-- migracion-v33-fix-policy-users.sql
-- Arregla el error "permission denied for table users" al crear ofertas.
--
-- Causa: la política de SELECT de 'presupuestos' consultaba auth.users
-- (select email from auth.users ...), tabla a la que los roles anon /
-- authenticated no tienen permiso. Como el alta hace INSERT ... SELECT
-- (devuelve la fila creada), esa lectura disparaba la política y fallaba.
--
-- Solución: comparar contra el email del JWT con auth.jwt(), que no
-- requiere acceso a auth.users.
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

drop policy if exists presupuestos_owner_read on presupuestos;

create policy presupuestos_owner_read on presupuestos for select
  using (
    user_id = auth.uid()
    or email = (auth.jwt() ->> 'email')
    or mi_rol() in ('consultor', 'admin')
  );

-- Aseguramos que la política de inserción sigue permitiendo el alta (anónimo + interno).
drop policy if exists presupuestos_anon_insert on presupuestos;
create policy presupuestos_anon_insert on presupuestos for insert with check (true);
