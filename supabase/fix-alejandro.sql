-- ============================================================
-- REPARACIÓN · "Database error querying schema" al hacer login
-- Causa: campos de token en NULL en auth.users (GoTrue exige '').
-- Ejecutar en SQL Editor y volver a probar el acceso.
-- ============================================================

update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email = 'alejandro@tuconsultor.com';

-- Comprobación: todos los campos deben salir como cadena vacía, no NULL
select email,
       confirmation_token = ''         as conf_ok,
       recovery_token = ''             as recov_ok,
       email_change = ''               as change_ok,
       email_change_token_new = ''     as change_new_ok,
       email_change_token_current = '' as change_cur_ok,
       (email_confirmed_at is not null) as confirmado
from auth.users
where email = 'alejandro@tuconsultor.com';
