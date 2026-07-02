-- migracion-v34-solicitudes-brochure.sql
-- Tabla para almacenar las solicitudes de brochure descargable desde el blog público.
-- Cada fila es un lead que ha rellenado el formulario para recibir un brochure por email.

create table if not exists public.solicitudes_brochure (
  id           uuid primary key default gen_random_uuid(),
  creado_en    timestamptz not null default now(),
  nombre       text not null,
  email        text not null,
  empresa      text,
  telefono     text,
  norma_slug   text not null,          -- ej. 'iso-27001'
  norma_code   text,                   -- ej. 'ISO 27001'
  idioma       text default 'es',      -- es | en | ar
  consent_rgpd boolean not null default false,
  origen       text default 'blog',    -- de dónde vino (blog, home, etc.)
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  ip_hash      text,                   -- opcional, para control anti-spam (no PII en claro)
  enviado_email boolean default false, -- si el email con el brochure se envió con éxito
  brevo_ok     boolean default false   -- si el alta/actualización en Brevo fue correcta
);

create index if not exists idx_solicitudes_brochure_email on public.solicitudes_brochure (email);
create index if not exists idx_solicitudes_brochure_norma on public.solicitudes_brochure (norma_slug);
create index if not exists idx_solicitudes_brochure_fecha on public.solicitudes_brochure (creado_en desc);

-- RLS: nadie lee desde el cliente anónimo; la inserción la hace la Netlify Function
-- usando la service_role key (que salta RLS). Dejamos RLS activado y sin políticas
-- de SELECT para anon/authenticated, de modo que los leads no sean legibles públicamente.
alter table public.solicitudes_brochure enable row level security;

-- (Opcional) Permitir que un rol interno de la app lea las solicitudes.
-- Ajusta el email/claim según tu modelo de permisos.
drop policy if exists "solicitudes_brochure_select_interno" on public.solicitudes_brochure;
create policy "solicitudes_brochure_select_interno"
  on public.solicitudes_brochure
  for select
  to authenticated
  using (
    (auth.jwt() ->> 'email') in (
      'alejandro@tuconsultor.com',
      'fatima@tuconsultor.com',
      'hola@tuconsultor.com'
    )
  );

-- No creamos política de INSERT para anon/authenticated a propósito:
-- la escritura se hace exclusivamente desde el backend con service_role.
grant select on public.solicitudes_brochure to authenticated;
