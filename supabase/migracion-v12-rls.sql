-- =============================================================================
-- CONSULTIFY · RLS para cliente_tareas (faltaba; causaba "row-level security policy")
-- Alinea con el patrón de cliente_empresas/empresa_normas pero incluye
-- superadmin y gestion (que también gestionan clientes).
-- =============================================================================

begin;

alter table public.cliente_tareas enable row level security;

-- Equipo gestiona todo
drop policy if exists equipo_todo_cliente_tareas on public.cliente_tareas;
create policy equipo_todo_cliente_tareas on public.cliente_tareas
  for all
  using      (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
  with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));

-- El cliente ve (solo lectura) sus tareas
drop policy if exists cliente_lee_sus_tareas on public.cliente_tareas;
create policy cliente_lee_sus_tareas on public.cliente_tareas
  for select
  using (exists (
    select 1 from public.clientes c
    where c.id = cliente_id and c.user_id = auth.uid()
  ));

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- OPCIONAL (recomendado): las tablas de v2 tampoco incluían 'superadmin' ni
-- 'gestion' en su política de equipo. Si entras como superadmin o gestion y no
-- puedes editar empresas/centros/normas, ejecuta también esto para alinearlas.
-- ─────────────────────────────────────────────────────────────────────────────
-- begin;
-- drop policy if exists equipo_todo_cliente_empresas on public.cliente_empresas;
-- create policy equipo_todo_cliente_empresas on public.cliente_empresas
--   for all using (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
--   with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
-- drop policy if exists equipo_todo_empresa_centros on public.empresa_centros;
-- create policy equipo_todo_empresa_centros on public.empresa_centros
--   for all using (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
--   with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
-- drop policy if exists equipo_todo_empresa_normas on public.empresa_normas;
-- create policy equipo_todo_empresa_normas on public.empresa_normas
--   for all using (public.mi_rol() in ('consultor','gestion','admin','superadmin'))
--   with check (public.mi_rol() in ('consultor','gestion','admin','superadmin'));
-- commit;
