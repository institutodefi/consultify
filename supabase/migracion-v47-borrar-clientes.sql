-- =============================================================================
-- CONSULTIFY · Migración v47 · Eliminar clientes (solo administradores)
-- -----------------------------------------------------------------------------
-- Igual que con las ofertas: sin política de DELETE la RLS bloquea el borrado.
-- Permitimos eliminar clientes solo a superadmin y admin.
-- =============================================================================

begin;

drop policy if exists clientes_delete_admin on public.clientes;

create policy clientes_delete_admin on public.clientes
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
