-- =============================================================================
-- CONSULTIFY · Migración v44 · Contacto separado (nombre/apellidos) + Brevo
--   - contacto_apellidos: apellidos del contacto (el campo 'contacto' pasa a ser
--     el nombre de pila; se conserva para compatibilidad).
--   - brevo_id / brevo_sincronizado_en: vínculo con el contacto en Brevo.
-- =============================================================================

begin;

alter table public.clientes add column if not exists contacto_apellidos text;
alter table public.clientes add column if not exists brevo_id text;
alter table public.clientes add column if not exists brevo_sincronizado_en timestamptz;

comment on column public.clientes.contacto is 'Nombre de pila del contacto principal';
comment on column public.clientes.contacto_apellidos is 'Apellidos del contacto principal';

commit;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
