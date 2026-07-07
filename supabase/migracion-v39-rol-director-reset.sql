-- =============================================================================
-- CONSULTIFY · Migración v39
--   1) Nuevo rol 'director' (Director de Proyecto), separado de 'consultor'
--   2) Reset de usuarios: elimina TODOS menos alejandro@tuconsultor.com
--   3) Políticas que daban acceso a 'consultor' ahora también a 'director'
--
-- ⚠️ EL PASO 2 ES IRREVERSIBLE. Borra usuarios de auth y sus perfiles.
--    Ejecuta con conocimiento de causa. Haz copia de seguridad si dudas.
-- =============================================================================

begin;

-- ── 1 · Ampliar el check de roles para incluir 'director' ───────────────────
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('cliente','consultor','director','gestion','admin','superadmin'));

commit;

-- ── 2 · RESET DE USUARIOS: eliminar todos menos Alejandro ───────────────────
-- Borrar de auth.users dispara el borrado en cascada de public.perfiles
-- (perfiles.id referencia auth.users con on delete cascade en el esquema).
-- Si tu FK no fuese en cascada, el segundo delete limpia los perfiles huérfanos.
delete from auth.users
where email <> 'alejandro@tuconsultor.com';

-- Por si quedara algún perfil sin usuario asociado:
delete from public.perfiles
where id not in (select id from auth.users);

-- Asegurar que Alejandro es superadmin activo tras el reset.
update public.perfiles p
set rol = 'superadmin', activo = true
from auth.users u
where p.id = u.id and u.email = 'alejandro@tuconsultor.com';

-- ── 3 · Políticas: 'director' obtiene el mismo acceso que 'consultor' ───────
-- Recreamos automáticamente toda política cuya expresión mencione el rol
-- 'consultor', añadiendo 'director' al mismo listado. Es seguro e idempotente:
-- reconstruye la política con la expresión equivalente + director.
do $$
declare
  pol record;
  nueva_using text;
  nueva_check text;
begin
  for pol in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') like '%''consultor''%' or coalesce(with_check,'') like '%''consultor''%')
      and coalesce(qual,'') not like '%''director''%'
      and coalesce(with_check,'') not like '%''director''%'
  loop
    -- Sustituye la lista in ('consultor'...) por la misma + 'director'
    nueva_using := replace(coalesce(pol.qual,''), '''consultor''', '''consultor'',''director''');
    nueva_check := replace(coalesce(pol.with_check,''), '''consultor''', '''consultor'',''director''');

    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);

    if pol.cmd = 'SELECT' then
      execute format('create policy %I on public.%I for select using (%s)',
        pol.policyname, pol.tablename, nueva_using);
    elsif pol.cmd = 'INSERT' then
      execute format('create policy %I on public.%I for insert with check (%s)',
        pol.policyname, pol.tablename, coalesce(nullif(nueva_check,''), nueva_using));
    elsif pol.cmd = 'UPDATE' then
      execute format('create policy %I on public.%I for update using (%s) with check (%s)',
        pol.policyname, pol.tablename, nueva_using, coalesce(nullif(nueva_check,''), nueva_using));
    elsif pol.cmd = 'DELETE' then
      execute format('create policy %I on public.%I for delete using (%s)',
        pol.policyname, pol.tablename, nueva_using);
    else -- ALL
      execute format('create policy %I on public.%I for all using (%s) with check (%s)',
        pol.policyname, pol.tablename, nueva_using, coalesce(nullif(nueva_check,''), nueva_using));
    end if;

    raise notice 'Política actualizada con director: %.%', pol.tablename, pol.policyname;
  end loop;
end $$;

-- ── 4 · Recargar el schema cache ────────────────────────────────────────────
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- ── 5 · COMPROBACIÓN ────────────────────────────────────────────────────────
-- Debe quedar SOLO Alejandro, con rol superadmin.
select u.email, p.rol, p.activo
from auth.users u
left join public.perfiles p on p.id = u.id
order by u.email;
