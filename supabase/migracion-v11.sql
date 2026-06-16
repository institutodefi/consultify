-- =============================================================================
-- CONSULTIFY · Migración v11
-- Fusión Proyectos → Clientes. El cliente pasa a ser el ente único de proyecto.
-- Traspasa de la tabla proyectos a clientes: consultor, modelo, fecha inicio y
-- fecha de auditoría (esta última también a empresa_normas si procede).
-- NO borra la tabla proyectos (se conserva como histórico).
-- Idempotente y conservador: solo rellena campos vacíos en clientes.
-- =============================================================================

begin;

-- Centros: nº de trabajadores (estilo Magic, para total de plantilla del grupo)
alter table public.empresa_centros add column if not exists trabajadores integer default 0;

-- Campos de proyecto a nivel cliente (por si v10 no se aplicó del todo)
alter table public.clientes add column if not exists modelo text;
alter table public.clientes add column if not exists fecha_auditoria date;
alter table public.clientes add column if not exists estado text;
alter table public.clientes add column if not exists notas text;

-- Traspaso: para cada proyecto, vuelca a su cliente los campos que estén vacíos.
-- Si un cliente tuviera varios proyectos, se toma el más reciente por fecha_inicio.
with ult as (
  select distinct on (cliente_id)
    cliente_id, consultor_id, modelo, estado, fecha_inicio, fecha_auditoria, notas
  from public.proyectos
  where cliente_id is not null
  order by cliente_id, fecha_inicio desc nulls last
)
update public.clientes c
set
  consultor_1_id  = coalesce(c.consultor_1_id, u.consultor_id),
  modelo          = coalesce(c.modelo, u.modelo),
  estado          = coalesce(c.estado, u.estado),
  fecha_inicio    = coalesce(c.fecha_inicio, u.fecha_inicio),
  fecha_auditoria = coalesce(c.fecha_auditoria, u.fecha_auditoria),
  notas           = coalesce(c.notas, u.notas)
from ult u
where u.cliente_id = c.id;

commit;

-- VERIFICACIÓN (aparte):
-- select empresa, modelo, estado, consultor_1_id, fecha_inicio, fecha_auditoria
--   from public.clientes order by empresa;
