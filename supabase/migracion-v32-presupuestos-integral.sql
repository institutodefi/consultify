-- ============================================================
-- migracion-v32-presupuestos-integral.sql
-- Deja la tabla 'presupuestos' lista para TODOS los flujos del
-- generador de ofertas y del formulario de solicitud de info.
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
--
-- Resuelve el fallo silencioso de alta en base de datos:
--   · columnas que faltaban (cif, cargo, numero_oferta, comercial,
--     requerimiento, url_pdf, url_pptx)
--   · NOT NULL en modelo/precio/email que bloqueaban las consultas
--   · CHECK de 'tipo' ampliado a mes/bolsa/fraccionado/consulta
-- ============================================================

-- 1) Columnas nuevas (si no existen)
alter table presupuestos add column if not exists cif           text;
alter table presupuestos add column if not exists cargo         text;
alter table presupuestos add column if not exists numero_oferta text;
alter table presupuestos add column if not exists comercial     text default 'Alejandro';
alter table presupuestos add column if not exists requerimiento text;
alter table presupuestos add column if not exists url_pdf       text;
alter table presupuestos add column if not exists url_pptx      text;

-- 2) Quitar NOT NULL de campos que no siempre vienen (solicitudes de info)
alter table presupuestos alter column email  drop not null;
alter table presupuestos alter column modelo drop not null;
alter table presupuestos alter column precio drop not null;

-- 3) CHECK de 'tipo' ampliado (mes, bolsa, fraccionado, consulta)
alter table presupuestos drop constraint if exists presupuestos_tipo_check;
alter table presupuestos
  add constraint presupuestos_tipo_check
  check (tipo in ('mes','bolsa','fraccionado','consulta'));

-- 4) Índice por número de oferta (búsquedas en el CRM)
create index if not exists idx_presupuestos_numero on presupuestos(numero_oferta);

-- 5) Asegurar que la política de insert existe (anónimo + interno)
drop policy if exists presupuestos_anon_insert on presupuestos;
create policy presupuestos_anon_insert on presupuestos for insert with check (true);
