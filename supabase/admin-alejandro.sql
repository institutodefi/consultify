-- ============================================================
-- ACCESO SUPERADMIN · alejandro@tuconsultor.com
-- Proyecto Supabase: consultify
--
-- REQUISITO PREVIO: el usuario debe existir en auth.users.
-- Dos formas de crearlo (elige una):
--   a) Regístrate tú mismo en https://consultify.pro/app/acceso
--   b) En el panel: Authentication → Users → Add user →
--      email alejandro@tuconsultor.com + contraseña
--      (marca "Auto Confirm User" para no esperar el email)
--
-- Después ejecuta este script en SQL Editor.
-- ============================================================

-- 1) Ascender a admin (idempotente: puedes ejecutarlo varias veces)
update public.perfiles
set    rol     = 'admin',
       nombre  = coalesce(nullif(nombre, ''), 'Alejandro'),
       empresa = coalesce(nullif(empresa, ''), 'TuConsultor')
where  id = (select id from auth.users where email = 'alejandro@tuconsultor.com');

-- 2) Red de seguridad: si el usuario existe en auth pero el trigger
--    aún no le creó perfil (caso raro), créalo ya como admin.
insert into public.perfiles (id, rol, nombre, empresa)
select id, 'admin', 'Alejandro', 'TuConsultor'
from   auth.users
where  email = 'alejandro@tuconsultor.com'
  and  not exists (select 1 from public.perfiles p where p.id = auth.users.id);

-- 3) Comprobación: debe devolver una fila con rol = admin
select u.email, p.rol, p.nombre, p.empresa
from   auth.users u
join   public.perfiles p on p.id = u.id
where  u.email = 'alejandro@tuconsultor.com';
