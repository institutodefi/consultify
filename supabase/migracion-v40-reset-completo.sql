-- =============================================================================
-- CONSULTIFY · Migración v40 · RESET COMPLETO A CERO + gate de políticas
-- -----------------------------------------------------------------------------
-- Deja SOLO a Alejandro, tanto en accesos (perfiles/auth) como en el equipo
-- de la agenda (tabla consultores). Añade el campo para exigir aceptar las
-- políticas de seguridad y confidencialidad en el primer login.
--
-- ⚠️ IRREVERSIBLE. Haz copia de seguridad si tienes dudas.
--    Cambia el email si el tuyo no es alejandro@tuconsultor.com.
-- =============================================================================

-- ── 0 · Parámetro: tu email de superadmin ───────────────────────────────────
-- (se usa en todos los pasos; edítalo aquí una sola vez si hace falta)

begin;

-- ── 1 · Rol 'director' permitido + campo de políticas en perfiles ───────────
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('cliente','consultor','director','gestion','admin','superadmin'));

alter table public.perfiles
  add column if not exists politicas_aceptadas_en timestamptz;

commit;

-- ── 2 · RESET DE ACCESOS: borrar todos los usuarios menos Alejandro ─────────
-- Borrar auth.users cae en cascada sobre perfiles (FK on delete cascade).
delete from auth.users
where email <> 'alejandro@tuconsultor.com';

-- Limpieza de perfiles huérfanos por si alguna FK no fuese en cascada.
delete from public.perfiles
where id not in (select id from auth.users);

-- Alejandro = superadmin activo.
update public.perfiles p
set rol = 'superadmin', activo = true
from auth.users u
where p.id = u.id and u.email = 'alejandro@tuconsultor.com';

-- ── 3 · RESET DEL EQUIPO DE AGENDA (tabla consultores) ──────────────────────
-- Varias columnas (clientes.consultor_1_id, consultor_2_id, etc.) apuntan a
-- consultores SIN 'on delete set null', lo que bloquearía el borrado. Antes de
-- borrar, ponemos a NULL automáticamente TODA columna que referencie a los
-- consultores que se van a eliminar. Luego borramos y dejamos solo a Alejandro.
do $$
declare fk record; ale_id uuid;
begin
  select c.id into ale_id
  from public.consultores c
  join auth.users u on u.id = c.user_id
  where u.email = 'alejandro@tuconsultor.com' limit 1;

  for fk in
    select con.conrelid::regclass as tabla_origen, att.attname as columna
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.confrelid = 'public.consultores'::regclass and con.contype = 'f'
  loop
    begin
      if ale_id is null then
        execute format('update %s set %I = null where %I is not null', fk.tabla_origen, fk.columna, fk.columna);
      else
        execute format('update %s set %I = null where %I is not null and %I <> %L', fk.tabla_origen, fk.columna, fk.columna, fk.columna, ale_id);
      end if;
    exception when others then
      raise notice 'No se pudo desvincular %.% (%);', fk.tabla_origen, fk.columna, sqlerrm;
    end;
  end loop;

  if ale_id is null then
    delete from public.consultores;
  else
    delete from public.consultores where id <> ale_id;
  end if;
end $$;

-- Crear la ficha de Alejandro si no existía (vinculada a su usuario).
insert into public.consultores (nombre, nivel, normas, capacidad_clientes, activo, user_id)
select 'Alejandro', 'Senior', '{}', 12, true, u.id
from auth.users u
where u.email = 'alejandro@tuconsultor.com'
  and not exists (select 1 from public.consultores c where c.user_id = u.id);

-- ── 4 · Políticas RLS: 'director' hereda el acceso de 'consultor' ───────────
do $$
declare pol record; nueva_using text; nueva_check text;
begin
  for pol in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') like '%''consultor''%' or coalesce(with_check,'') like '%''consultor''%')
      and coalesce(qual,'') not like '%''director''%'
      and coalesce(with_check,'') not like '%''director''%'
  loop
    nueva_using := replace(coalesce(pol.qual,''), '''consultor''', '''consultor'',''director''');
    nueva_check := replace(coalesce(pol.with_check,''), '''consultor''', '''consultor'',''director''');
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
    if pol.cmd = 'SELECT' then
      execute format('create policy %I on public.%I for select using (%s)', pol.policyname, pol.tablename, nueva_using);
    elsif pol.cmd = 'INSERT' then
      execute format('create policy %I on public.%I for insert with check (%s)', pol.policyname, pol.tablename, coalesce(nullif(nueva_check,''), nueva_using));
    elsif pol.cmd = 'UPDATE' then
      execute format('create policy %I on public.%I for update using (%s) with check (%s)', pol.policyname, pol.tablename, nueva_using, coalesce(nullif(nueva_check,''), nueva_using));
    elsif pol.cmd = 'DELETE' then
      execute format('create policy %I on public.%I for delete using (%s)', pol.policyname, pol.tablename, nueva_using);
    else
      execute format('create policy %I on public.%I for all using (%s) with check (%s)', pol.policyname, pol.tablename, nueva_using, coalesce(nullif(nueva_check,''), nueva_using));
    end if;
  end loop;
end $$;

-- ── 5 · RPC para que el usuario marque que aceptó las políticas ─────────────
create or replace function public.aceptar_politicas()
returns void language sql security definer set search_path = public as $$
  update public.perfiles set politicas_aceptadas_en = now() where id = auth.uid();
$$;
grant execute on function public.aceptar_politicas() to authenticated;

-- ── 6 · Recargar cache ──────────────────────────────────────────────────────
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- ── 7 · COMPROBACIÓN: en ambas tablas debe quedar SOLO Alejandro ────────────
select 'ACCESOS (perfiles)' as tabla, u.email as nombre, p.rol as detalle,
       p.activo::text as activo, p.politicas_aceptadas_en::text as extra
from auth.users u left join public.perfiles p on p.id = u.id
union all
select 'EQUIPO (consultores)' as tabla, c.nombre, c.nivel,
       c.activo::text, null::text
from public.consultores c
order by tabla, nombre;
