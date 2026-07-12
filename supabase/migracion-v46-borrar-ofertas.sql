-- =============================================================================
-- CONSULTIFY · Migración v46 · Eliminar ofertas (solo administradores)
-- -----------------------------------------------------------------------------
-- Sin política de DELETE, la RLS bloquea cualquier borrado. Añadimos una que
-- permite eliminar ofertas ÚNICAMENTE a superadmin y admin.
--
-- Nota de seguridad: la protección real vive aquí (base de datos). Ocultar el
-- botón en la interfaz no basta; esta política impide el borrado por API a
-- cualquiera que no sea administrador.
-- =============================================================================

begin;

drop policy if exists presupuestos_delete_admin on public.presupuestos;

create policy presupuestos_delete_admin on public.presupuestos
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
        and p.activo
        and p.rol in ('superadmin', 'admin')
    )
  );

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
