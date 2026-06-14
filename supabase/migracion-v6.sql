-- ════════════════════════════════════════════════════════════════
-- CONSULTIFY · MIGRACIÓN v6 — Catálogo editable + descripción
-- · descripcion en catálogo y en agenda_tareas
-- · al editar el catálogo (nombre/proceso/subproceso/descr/horas),
--   se propaga a la PROGRAMACIÓN FUTURA sin romper lo ya ejecutado
-- Ejecutar DESPUÉS de migracion-v5.sql
-- ════════════════════════════════════════════════════════════════

-- 1 · Descripción en ambas tablas
alter table tareas_catalogo add column if not exists descripcion text;
alter table agenda_tareas  add column if not exists descripcion text;

-- 2 · Para localizar las tareas instanciadas desde una fila del catálogo
--     guardamos su origen (catalogo_id). Así la propagación es precisa
--     aunque el usuario renombre el título.
alter table agenda_tareas add column if not exists catalogo_id uuid references tareas_catalogo(id) on delete set null;
create index if not exists idx_agenda_catalogo on agenda_tareas (catalogo_id);

-- 3 · Trigger de propagación AMPLIADO
--     Propaga título, proceso, subproceso, descripción y horas a las
--     tareas instanciadas desde esa fila del catálogo (catalogo_id) que:
--       · NO tengan horas reales (no ejecutadas)  → futuro/plan
--       · pertenezcan a un proyecto que integra esa norma y modelo
--     Las horas se recalculan con la eficiencia del consultor asignado.
create or replace function public.propagar_catalogo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update agenda_tareas t
     set titulo      = new.titulo,
         proceso     = new.proceso,
         subproceso  = new.subproceso,
         descripcion = coalesce(t.descripcion, new.descripcion), -- no pisa nota propia del consultor
         horas_base  = new.horas_base,
         horas_previstas = round(new.horas_base * coalesce(
               (select m from (values ('J1',1.0),('J2',0.75),('J3',0.5),('Senior',0.4)) as e(niv,m)
                where e.niv = coalesce(c.nivel,'J2')), 1), 2)
    from proyectos p
    left join consultores c on c.id = t.consultor_id
   where t.proyecto_id = p.id
     and t.catalogo_id = new.id           -- instancia directa de esta fila del catálogo
     and t.horas_reales is null           -- intocable lo ya ejecutado (no se rompe)
     and new.norma_id = any(p.normas)     -- la norma sigue integrada en el proyecto
     and p.modelo = new.modelo;
  return new;
end; $$;

drop trigger if exists trg_propagar_catalogo on tareas_catalogo;
create trigger trg_propagar_catalogo
  after update on tareas_catalogo
  for each row execute function public.propagar_catalogo();

-- 4 · RLS ya cubierto en v5 (tareas_catalogo / agenda_tareas para es_equipo())
