-- =============================================================================
-- CONSULTIFY · Migración v14
-- Renombrado INSTANTÁNEO y GLOBAL del prefijo de cliente en las tareas.
-- Al cambiar clientes.empresa, se reescribe el título de todas sus cliente_tareas
-- como "EMPRESA - norma - proceso - subproceso", y ese cambio se propaga al
-- reflejo en agenda_tareas (vía origen_cliente_tarea_id) mediante un 2º trigger.
-- Idempotente.
-- =============================================================================

begin;

-- Helper: construye el título con prefijo de cliente, omitiendo partes vacías.
create or replace function public.cliente_tarea_titulo(
  p_empresa text, p_norma text, p_proceso text, p_subproceso text
) returns text language sql immutable as $$
  select concat_ws(' - ',
    nullif(btrim(p_empresa), ''),
    nullif(btrim(p_norma), ''),
    nullif(btrim(p_proceso), ''),
    nullif(btrim(p_subproceso), '')
  );
$$;

-- ── 1) Al cambiar el nombre del cliente: renombrar todas sus tareas ──
create or replace function public.trg_cliente_rename_tareas()
returns trigger language plpgsql as $$
begin
  if new.empresa is distinct from old.empresa then
    update public.cliente_tareas t
    set titulo = public.cliente_tarea_titulo(new.empresa, t.norma_id, t.proceso, t.subproceso)
    where t.cliente_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists cliente_rename_tareas on public.clientes;
create trigger cliente_rename_tareas
  after update of empresa on public.clientes
  for each row execute function public.trg_cliente_rename_tareas();

-- ── 2) Al cambiar el título de una cliente_tarea: propagar a su reflejo en agenda ──
create or replace function public.trg_cliente_tarea_sync_agenda_titulo()
returns trigger language plpgsql as $$
begin
  if new.titulo is distinct from old.titulo then
    update public.agenda_tareas a
    set titulo = new.titulo
    where a.origen_cliente_tarea_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists cliente_tarea_sync_agenda_titulo on public.cliente_tareas;
create trigger cliente_tarea_sync_agenda_titulo
  after update of titulo on public.cliente_tareas
  for each row execute function public.trg_cliente_tarea_sync_agenda_titulo();

-- ── 3) Normalizar de una vez los títulos ya existentes ──
update public.cliente_tareas t
set titulo = public.cliente_tarea_titulo(c.empresa, t.norma_id, t.proceso, t.subproceso)
from public.clientes c
where c.id = t.cliente_id
  and t.titulo is distinct from public.cliente_tarea_titulo(c.empresa, t.norma_id, t.proceso, t.subproceso);

commit;

-- VERIFICACIÓN (aparte):
-- update clientes set empresa = empresa where id = '<algún_id>';  -- dispara el rename
-- select titulo from cliente_tareas where cliente_id = '<algún_id>' limit 5;
