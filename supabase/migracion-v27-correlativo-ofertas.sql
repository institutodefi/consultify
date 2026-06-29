-- ============================================================
-- migracion-v27-correlativo-ofertas.sql
-- Correlativo limpio de ofertas: OFE-AAAA-NNN reiniciable por año.
-- Usa una tabla contador con bloqueo atómico (sin condiciones de carrera).
-- ============================================================

-- Tabla de contadores por año
create table if not exists oferta_contador (
  anio  int  primary key,
  ultimo int not null default 0
);

-- Función atómica: devuelve el siguiente número del año dado y avanza el contador.
-- UPSERT con bloqueo de fila → seguro ante llamadas concurrentes.
create or replace function siguiente_numero_oferta(p_anio int default extract(year from now())::int)
returns text
language plpgsql
as $$
declare
  v_num int;
begin
  insert into oferta_contador (anio, ultimo)
  values (p_anio, 1)
  on conflict (anio) do update set ultimo = oferta_contador.ultimo + 1
  returning ultimo into v_num;

  return 'OFE-' || p_anio || '-' || lpad(v_num::text, 3, '0');
end;
$$;

-- Permitir que el rol anónimo (formulario público) la invoque vía RPC.
grant execute on function siguiente_numero_oferta(int) to anon, authenticated, service_role;
