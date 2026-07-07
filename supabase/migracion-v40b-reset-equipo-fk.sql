-- =============================================================================
-- CONSULTIFY · Reset del EQUIPO (consultores) — versión que resuelve las FK
-- -----------------------------------------------------------------------------
-- Error que corrige:
--   "update or delete on table consultores violates foreign key constraint
--    clientes_consultor_1_id_fkey on table clientes"
--
-- Causa: varias columnas (clientes.consultor_1_id, consultor_2_id, etc.) apuntan
-- a consultores SIN 'on delete set null', así que Postgres bloquea el borrado.
--
-- Solución: antes de borrar, ponemos a NULL automáticamente TODAS las columnas
-- de CUALQUIER tabla que referencien a los consultores que vamos a eliminar.
-- Luego borramos el equipo y dejamos solo la ficha de Alejandro.
--
-- Ejecuta este bloque tal cual. Es idempotente.
-- =============================================================================

do $$
declare
  fk record;
  ale_id uuid;
begin
  -- id de la ficha de consultor de Alejandro, si existe, para conservarla.
  select c.id into ale_id
  from public.consultores c
  join auth.users u on u.id = c.user_id
  where u.email = 'alejandro@tuconsultor.com'
  limit 1;

  -- Recorre TODAS las claves foráneas que apuntan a public.consultores y pone a
  -- NULL esas columnas en las filas que referencian a un consultor que NO es el
  -- de Alejandro (o todas, si Alejandro aún no tiene ficha).
  for fk in
    select
      con.conrelid::regclass  as tabla_origen,
      att.attname             as columna
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.confrelid = 'public.consultores'::regclass
      and con.contype = 'f'
  loop
    begin
      if ale_id is null then
        execute format('update %s set %I = null where %I is not null',
                       fk.tabla_origen, fk.columna, fk.columna);
      else
        execute format('update %s set %I = null where %I is not null and %I <> %L',
                       fk.tabla_origen, fk.columna, fk.columna, fk.columna, ale_id);
      end if;
      raise notice 'Desvinculado: %.% ', fk.tabla_origen, fk.columna;
    exception when others then
      raise notice 'No se pudo desvincular %.% (%);', fk.tabla_origen, fk.columna, sqlerrm;
    end;
  end loop;

  -- Ahora sí: borrar todos los consultores menos el de Alejandro.
  if ale_id is null then
    delete from public.consultores;
  else
    delete from public.consultores where id <> ale_id;
  end if;
end $$;

-- Si Alejandro NO tenía ficha de consultor, crearla ahora vinculada a su login.
insert into public.consultores (nombre, nivel, normas, capacidad_clientes, activo, user_id)
select 'Alejandro', 'Senior', '{}', 12, true, u.id
from auth.users u
where u.email = 'alejandro@tuconsultor.com'
  and not exists (
    select 1 from public.consultores c where c.user_id = u.id
  );

-- Comprobación: debe quedar SOLO Alejandro en el equipo.
select nombre, nivel, activo from public.consultores order by nombre;
