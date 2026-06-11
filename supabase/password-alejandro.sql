-- ============================================================
-- ALTA COMPLETA · alejandro@tuconsultor.com (admin + contraseña)
-- Ejecutar en: Supabase (proyecto consultify) → SQL Editor
--
-- Crea el usuario si no existe (con email ya confirmado) o,
-- si ya existe, simplemente le cambia la contraseña.
-- Después lo asciende a admin. Idempotente: se puede re-ejecutar.
-- ============================================================

do $$
declare
  v_email    text := 'alejandro@tuconsultor.com';
  v_password text := '*Slt2023#';
  v_uid      uuid;
begin
  select id into v_uid from auth.users where email = v_email;

  if v_uid is null then
    -- 1a) Crear el usuario con email confirmado
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid,
      'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre','Alejandro','empresa','TuConsultor'),
      now(), now()
    );

    -- 1b) Identidad email (imprescindible para que el login funcione)
    insert into auth.identities (
      id, user_id, provider_id, identity_data,
      provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  else
    -- 2) Ya existe: cambiar contraseña y asegurar email confirmado
    update auth.users
    set encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_uid;
  end if;

  -- 3) Perfil admin (el trigger lo crea como cliente; aquí se asciende)
  insert into public.perfiles (id, rol, nombre, empresa)
  values (v_uid, 'admin', 'Alejandro', 'TuConsultor')
  on conflict (id) do update
    set rol = 'admin',
        nombre = coalesce(nullif(public.perfiles.nombre, ''), 'Alejandro'),
        empresa = coalesce(nullif(public.perfiles.empresa, ''), 'TuConsultor');
end $$;

-- 4) Comprobación: una fila con rol = admin y confirmado = true
select u.email, p.rol, (u.email_confirmed_at is not null) as confirmado
from auth.users u
join public.perfiles p on p.id = u.id
where u.email = 'alejandro@tuconsultor.com';
