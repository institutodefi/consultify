-- migracion-v35-accesos-consultores.sql
-- Refuerza el control de accesos: campo 'activo' en perfiles, metadatos para el panel
-- de administración, y una política que impide operar a usuarios desactivados.

-- 1) Campos nuevos en perfiles
alter table public.perfiles add column if not exists activo boolean not null default true;
alter table public.perfiles add column if not exists email text;          -- copia legible del email (auth.users)
alter table public.perfiles add column if not exists nivel text            -- J1/J2/J3/Senior (para consultores)
  check (nivel is null or nivel in ('J1','J2','J3','Senior'));
alter table public.perfiles add column if not exists invitado_en timestamptz;
alter table public.perfiles add column if not exists ultimo_acceso timestamptz;

-- 2) Sincronizar email desde auth.users al crear el perfil (trigger existente ampliado)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, rol, nombre, empresa, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'rol', 'cliente'),  -- permite fijar rol en la invitación
    new.raw_user_meta_data->>'nombre',
    new.raw_user_meta_data->>'empresa',
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

-- 3) Helper: ¿el usuario actual está activo?
create or replace function public.estoy_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select activo from public.perfiles where id = auth.uid()), false);
$$;

-- 4) Helper: ¿soy superadmin? (para políticas del panel)
create or replace function public.soy_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'superadmin' and activo from public.perfiles where id = auth.uid()), false);
$$;

-- 5) El superadmin puede leer y actualizar todos los perfiles (para el panel de accesos)
drop policy if exists perfiles_superadmin_all on public.perfiles;
create policy perfiles_superadmin_all on public.perfiles
  for all
  using (public.soy_superadmin())
  with check (public.soy_superadmin());

-- 6) Marcar el último acceso (llamable desde la app tras el login)
create or replace function public.marcar_acceso()
returns void language sql security definer set search_path = public as $$
  update public.perfiles set ultimo_acceso = now() where id = auth.uid();
$$;

-- ── NOTA OPERATIVA ────────────────────────────────────────────────────────────
-- El bloqueo efectivo de un usuario desactivado se hace en el backend (Netlify
-- Function admin-usuarios) usando la Admin API: al desactivar, se hace ban del
-- usuario en auth.users (ban_duration) para que no pueda iniciar sesión, y se
-- pone activo=false. Al reactivar, se quita el ban y activo=true.
-- Aquí dejamos además estos helpers por si se quieren usar en políticas RLS de
-- otras tablas (p.ej. exigir estoy_activo() en operaciones sensibles).

-- 7) Asegurar que Alejandro es superadmin activo (ajusta el email si procede)
update public.perfiles p
set rol = 'superadmin', activo = true
from auth.users u
where p.id = u.id and u.email = 'alejandro@tuconsultor.com';
