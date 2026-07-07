// netlify/functions/admin-usuarios.mjs
// Panel de administración de accesos (SOLO superadmin).
// Toda operación privilegiada se hace aquí con la service_role key, nunca en el navegador.
//
// Seguridad: el front envía el access_token del usuario logueado en Authorization.
// Verificamos ese token contra Supabase y comprobamos que su perfil es superadmin y activo.
//
// Acciones (body.action):
//   list                     → lista de perfiles de equipo (no clientes)
//   invite {email,nombre,rol,nivel} → invita por email (el consultor pone su contraseña)
//   set_role {id,rol}        → cambia el rol
//   set_active {id,activo}   → activa/desactiva (ban en auth + activo en perfil)
//   delete {id}             → elimina el usuario de auth (y su perfil por cascade)
//
// Variables de entorno:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   SITE_URL (para el redirect de la invitación, por defecto https://consultify.pro)

const ROLES_VALIDOS = ['superadmin', 'admin', 'director', 'consultor', 'gestion', 'cliente'];
const NIVELES = ['J1', 'J2', 'J3', 'Senior'];
// Roles de equipo que EXIGEN email con dominio corporativo.
const ROLES_DOMINIO = ['director', 'consultor'];
const DOMINIOS_PERMITIDOS = ['tuconsultor.com', 'consultify.pro'];
function dominioOk(email, rol) {
  if (!ROLES_DOMINIO.includes(rol)) return true; // otros roles no restringidos aquí
  const dom = String(email).split('@')[1]?.toLowerCase() || '';
  return DOMINIOS_PERMITIDOS.includes(dom);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

async function sb(path, { method = 'GET', key, token, body, prefer } = {}) {
  const SUPA_URL = process.env.SUPABASE_URL;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${token || process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPA_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return r;
}

// Verifica el token del llamante y devuelve su perfil, o null si no es superadmin activo.
async function autorizarSuperadmin(token) {
  if (!token) return null;
  const SUPA_URL = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // 1) resolver el usuario a partir del token
  const ru = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${token}` },
  });
  if (!ru.ok) return null;
  const u = await ru.json();
  if (!u?.id) return null;
  // 2) comprobar rol y activo en perfiles (con service_role, salta RLS)
  const rp = await fetch(`${SUPA_URL}/rest/v1/perfiles?id=eq.${u.id}&select=rol,activo,nombre,email`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const arr = await rp.json();
  const perfil = Array.isArray(arr) ? arr[0] : null;
  if (!perfil || perfil.rol !== 'superadmin' || perfil.activo !== true) return null;
  return { id: u.id, ...perfil };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const faltan = [
      !process.env.SUPABASE_URL && 'SUPABASE_URL',
      !process.env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean).join(' y ');
    return json({ ok: false, error: `Backend no configurado: falta la variable de entorno ${faltan} en Netlify. Añádela en Site configuration → Environment variables y vuelve a desplegar.` }, 500);
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const caller = await autorizarSuperadmin(token);
  if (!caller) return json({ ok: false, error: 'No autorizado' }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'JSON inválido' }, 400); }
  const { action } = body;
  const SITE = process.env.SITE_URL || 'https://consultify.pro';

  try {
    // ── LISTAR equipo interno ──
    if (action === 'list') {
      const r = await sb('/rest/v1/perfiles?rol=neq.cliente&select=id,rol,nombre,apellidos,email,nivel,normas,capacidad_clientes,subtipo,activo,invitado_en,ultimo_acceso,creado&order=creado.desc');
      const data = await r.json();
      return json({ ok: true, usuarios: data });
    }

    // ── INVITAR por email (el usuario define su contraseña) ──
    if (action === 'invite') {
      const { email, nombre = '', rol = 'consultor', nivel = null, normas = [], capacidad_clientes = 12 } = body;
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Email no válido' }, 400);
      if (!ROLES_VALIDOS.includes(rol)) return json({ ok: false, error: 'Rol no válido' }, 400);
      if (nivel && !NIVELES.includes(nivel)) return json({ ok: false, error: 'Nivel no válido' }, 400);
      if (!dominioOk(email, rol)) return json({ ok: false, error: `Para el perfil «${rol === 'director' ? 'Director de Proyecto' : 'Consultor'}» el email debe ser @tuconsultor.com o @consultify.pro.` }, 400);

      // Admin API: enviar invitación. El rol viaja en metadata → el trigger lo aplica al crear el perfil.
      const r = await sb('/auth/v1/invite', {
        method: 'POST',
        body: { email, data: { nombre, rol }, redirect_to: `${SITE}/app/establecer-password` },
      });
      if (!r.ok) {
        const err = await r.text();
        if (err.includes('already') || err.includes('registered')) return json({ ok: false, error: 'Ese email ya tiene cuenta.' }, 409);
        return json({ ok: false, error: 'No se pudo invitar: ' + err }, 502);
      }
      const inv = await r.json();
      // Fijar rol/nivel/invitado_en en el perfil (por si el trigger no aplicó el rol)
      if (inv?.id) {
        await sb(`/rest/v1/perfiles?id=eq.${inv.id}`, {
          method: 'PATCH', prefer: 'return=minimal',
          body: { rol, nivel, nombre, email, normas, capacidad_clientes, invitado_en: new Date().toISOString(), activo: true },
        });
      }
      return json({ ok: true, invited: email });
    }

    // ── CAMBIAR ROL ──
    // ── EDITAR PERFIL (nombre, apellidos, nivel, normas, capacidad) ──
    if (action === 'update_perfil') {
      const { id, nombre, apellidos, nivel, normas, capacidad_clientes } = body;
      if (!id) return json({ ok: false, error: 'Falta id' }, 400);
      if (nivel && !NIVELES.includes(nivel)) return json({ ok: false, error: 'Nivel no válido' }, 400);
      const campos = {};
      if (nombre !== undefined) campos.nombre = nombre;
      if (apellidos !== undefined) campos.apellidos = apellidos;
      if (nivel !== undefined) campos.nivel = nivel || null;
      if (normas !== undefined) campos.normas = normas;
      if (capacidad_clientes !== undefined) campos.capacidad_clientes = capacidad_clientes;
      const r = await sb(`/rest/v1/perfiles?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: campos });
      if (!r.ok) { const e = await r.text(); return json({ ok: false, error: 'No se pudo actualizar el perfil: ' + e }, 502); }
      return json({ ok: true });
    }

    if (action === 'set_role') {
      const { id, rol } = body;
      if (!id || !ROLES_VALIDOS.includes(rol)) return json({ ok: false, error: 'Datos no válidos' }, 400);
      if (id === caller.id && rol !== 'superadmin') return json({ ok: false, error: 'No puedes quitarte a ti mismo el superadmin.' }, 400);
      const r = await sb(`/rest/v1/perfiles?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { rol } });
      if (!r.ok) return json({ ok: false, error: 'No se pudo actualizar el rol' }, 502);
      return json({ ok: true });
    }

    // ── RESETEAR CONTRASEÑA (envía email de restablecimiento) ──
    if (action === 'reset_password') {
      const { email } = body;
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Email no válido' }, 400);
      // Endpoint público de recuperación: envía el correo con el enlace de reseteo.
      // Usa la plantilla "Reset password" configurada en Supabase → Auth → Emails.
      const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const e = await r.text();
        return json({ ok: false, error: 'No se pudo enviar el email de restablecimiento: ' + e }, 502);
      }
      return json({ ok: true, sent: email });
    }

    // ── ACTIVAR / DESACTIVAR ──
    if (action === 'set_active') {
      const { id, activo } = body;
      if (!id || typeof activo !== 'boolean') return json({ ok: false, error: 'Datos no válidos' }, 400);
      if (id === caller.id && !activo) return json({ ok: false, error: 'No puedes desactivarte a ti mismo.' }, 400);
      // 1) ban/unban en auth para impedir/permitir el login
      const rb = await sb(`/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        body: { ban_duration: activo ? 'none' : '87600h' }, // ~10 años = desactivado
      });
      if (!rb.ok) { const e = await rb.text(); return json({ ok: false, error: 'No se pudo cambiar el acceso: ' + e }, 502); }
      // 2) reflejar en el perfil
      await sb(`/rest/v1/perfiles?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { activo } });
      return json({ ok: true });
    }

    // ── ELIMINAR usuario ──
    if (action === 'delete') {
      const { id } = body;
      if (!id) return json({ ok: false, error: 'Falta id' }, 400);
      if (id === caller.id) return json({ ok: false, error: 'No puedes eliminarte a ti mismo.' }, 400);
      const r = await sb(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
      if (!r.ok) return json({ ok: false, error: 'No se pudo eliminar' }, 502);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Acción desconocida' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};

export const config = { path: '/.netlify/functions/admin-usuarios' };
