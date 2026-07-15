-- =============================================================================
-- CONSULTIFY · Migración v48 · Modelo CRM: Empresas + Contactos (FASE 1)
-- -----------------------------------------------------------------------------
-- Crea el nuevo modelo de datos SIN tocar la tabla 'clientes' existente.
-- Todo lo viejo sigue funcionando; estas tablas conviven hasta que la Fase 3
-- redirija proyectos/ofertas/cobros al nuevo modelo.
--
--   empresas            → organizaciones (cliente / proveedor / ambos)
--   contactos           → personas (lista propia; se sincronizan a Brevo)
--   empresa_contactos   → puente N:M (un contacto puede estar en varias empresas)
--
-- Después copia (NO mueve) los datos actuales de 'clientes':
--   cada cliente  → una empresa tipo 'cliente'
--   su contacto/email/teléfono → primer contacto vinculado a esa empresa
-- =============================================================================

begin;

-- ---------- 1 · EMPRESAS ----------
create table if not exists public.empresas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  cif           text,
  es_cliente    boolean not null default false,
  es_proveedor  boolean not null default false,
  direccion     text,
  codigo        text,                         -- código interno tipo CL-0001 (si aplica)
  holded_id     text,                         -- vínculo con Holded (si viene de ahí)
  cliente_id_old uuid,                        -- traza al registro original en 'clientes'
  notas         text,
  creado        timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists empresas_cif_idx on public.empresas (cif);
create index if not exists empresas_tipo_idx on public.empresas (es_cliente, es_proveedor);

-- ---------- 2 · CONTACTOS ----------
create table if not exists public.contactos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null default '',
  apellidos        text,
  cargo            text,
  email            text,
  telefono         text,
  -- Consentimiento RGPD para comunicaciones comerciales (marketing / blog):
  consentimiento_marketing boolean not null default false,
  consentimiento_fecha     timestamptz,
  -- Sincronización con Brevo:
  brevo_id                 text,
  brevo_sincronizado_en    timestamptz,
  notas            text,
  creado           timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists contactos_email_idx on public.contactos (email);

-- ---------- 3 · PUENTE empresa ↔ contacto (N:M) ----------
create table if not exists public.empresa_contactos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references public.empresas(id) on delete cascade,
  contacto_id  uuid not null references public.contactos(id) on delete cascade,
  cargo        text,                          -- cargo del contacto EN esa empresa concreta
  principal    boolean not null default false,-- contacto principal de la empresa
  creado       timestamptz default now(),
  unique (empresa_id, contacto_id)
);
create index if not exists empresa_contactos_empresa_idx on public.empresa_contactos (empresa_id);
create index if not exists empresa_contactos_contacto_idx on public.empresa_contactos (contacto_id);

-- =============================================================================
-- 4 · COPIA de datos desde 'clientes' (idempotente y SIN ambigüedad)
--     Estrategia segura: cada cliente genera EXACTAMENTE una empresa, un contacto
--     y un vínculo. La traza cliente_id_old garantiza que no se duplica al
--     re-ejecutar. La deduplicación de contactos que comparten email se deja
--     como paso posterior opcional (script aparte), para no arriesgar aquí.
-- =============================================================================

-- 4.1 · Cada cliente → una empresa tipo 'cliente'
--        (la tabla 'clientes' no tiene columna 'direccion', así que la empresa
--         se crea sin dirección; se podrá rellenar luego desde la ficha.)
insert into public.empresas (nombre, cif, es_cliente, es_proveedor, codigo, holded_id, cliente_id_old, creado)
select
  c.empresa,
  coalesce(c.cif_matriz, c.cif),
  true, false,
  c.codigo, c.holded_id,
  c.id, c.creado
from public.clientes c
where not exists (select 1 from public.empresas e where e.cliente_id_old = c.id);

-- 4.2 · Un contacto por cliente, con traza al vínculo mediante la empresa.
--        Usamos un identificador estable: el email o, si falta, el propio cif.
--        Guardamos la traza en empresa_contactos.cargo temporalmente NO; en su
--        lugar detectamos duplicados por la relación empresa↔contacto ya creada.
with clientes_sin_migrar as (
  select c.*
  from public.clientes c
  join public.empresas e on e.cliente_id_old = c.id
  where not exists (
    select 1 from public.empresa_contactos ec where ec.empresa_id = e.id
  )
)
insert into public.contactos (nombre, apellidos, email, telefono, brevo_id, brevo_sincronizado_en, creado)
select
  coalesce(nullif(trim(csm.contacto), ''), csm.empresa),
  csm.contacto_apellidos,
  csm.email,
  csm.telefono,
  csm.brevo_id,
  csm.brevo_sincronizado_en,
  csm.creado
from clientes_sin_migrar csm;

-- 4.3 · Vincular: emparejamos por orden de creación empresa↔contacto recién hechos.
--        Como cada cliente sin migrar generó justo un contacto en 4.2, los unimos
--        por la clave natural (empresa del cliente + datos del contacto).
insert into public.empresa_contactos (empresa_id, contacto_id, principal)
select distinct on (e.id) e.id, ct.id, true
from public.clientes c
join public.empresas e on e.cliente_id_old = c.id
join public.contactos ct
  on ct.email is not distinct from c.email
 and ct.nombre = coalesce(nullif(trim(c.contacto), ''), c.empresa)
 and ct.telefono is not distinct from c.telefono
where not exists (
  select 1 from public.empresa_contactos ec where ec.empresa_id = e.id
)
order by e.id, ct.creado;

commit;

-- =============================================================================
-- 5 · RLS · lectura/escritura para el equipo (no clientes)
-- =============================================================================
alter table public.empresas          enable row level security;
alter table public.contactos         enable row level security;
alter table public.empresa_contactos enable row level security;

-- Lectura para cualquier usuario autenticado del equipo
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated using (true);
drop policy if exists contactos_select on public.contactos;
create policy contactos_select on public.contactos for select to authenticated using (true);
drop policy if exists empresa_contactos_select on public.empresa_contactos;
create policy empresa_contactos_select on public.empresa_contactos for select to authenticated using (true);

-- Escritura (insert/update/delete) para roles del equipo
do $$
declare t text;
begin
  foreach t in array array['empresas','contactos','empresa_contactos'] loop
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$
      create policy %I_write on public.%I for all to authenticated
      using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo
                     and p.rol in ('superadmin','admin','consultor','gestion')))
      with check (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.activo
                     and p.rol in ('superadmin','admin','consultor','gestion')))
    $f$, t, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- =============================================================================
-- 6 · VERIFICACIÓN (ejecuta estas consultas tras la migración)
-- =============================================================================
-- select count(*) as empresas from public.empresas;
-- select count(*) as contactos from public.contactos;
-- select count(*) as vinculos from public.empresa_contactos;
-- -- Deben coincidir aprox. con el nº de clientes que tenías.
