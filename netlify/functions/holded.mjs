// netlify/functions/holded.mjs
// Integración con Holded (facturación). SOLO backend: la API key nunca llega al
// navegador. Habla con la API v1 de Holded, cuya autenticación es la cabecera
// `key: <api-key>`. El vínculo Consultify↔Holded se hace por CIF (campo `code`
// del contacto en Holded).
//
// Seguridad: el front envía el access_token del usuario; verificamos contra
// Supabase que es del equipo (superadmin/admin/director) antes de operar.
//
// Acciones (body.action):
//   buscar_por_cif {cif}                 → encuentra el contacto en Holded por CIF
//   crear {cliente}                      → crea el contacto en Holded
//   actualizar {holded_id, cliente}      → actualiza el contacto en Holded
//   sincronizar {cliente}                → busca por CIF; si existe vincula/actualiza,
//                                          si no, lo crea. Devuelve holded_id.
//
// Variables de entorno (en Netlify, SIN prefijo VITE_):
//   HOLDED_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const HOLDED_BASE = 'https://api.holded.com/api/invoicing/v1';
const ROLES_OK = ['superadmin', 'admin', 'director'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// Verifica el token del llamante contra Supabase y comprueba que es de equipo.
async function autorizar(token) {
  if (!token) return null;
  const SUPA = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ru = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: SERVICE, Authorization: `Bearer ${token}` } });
  if (!ru.ok) return null;
  const u = await ru.json();
  if (!u?.id) return null;
  const rp = await fetch(`${SUPA}/rest/v1/perfiles?id=eq.${u.id}&select=rol,activo`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const perfil = (await rp.json())?.[0];
  if (!perfil || !perfil.activo || !ROLES_OK.includes(perfil.rol)) return null;
  return { id: u.id, ...perfil };
}

// Llama a la API de Holded con la cabecera de autenticación correcta.
async function holded(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(`${HOLDED_BASE}${path}`, {
      method,
      headers: {
        key: process.env.HOLDED_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, data: `No se pudo contactar con Holded: ${e.message}` };
  }
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt; }
  // Holded devuelve a veces {status:0/1, info:"..."} incluso con HTTP 200.
  const holdedError = data && typeof data === 'object' && (data.status === 0 || data.error);
  return { ok: r.ok && !holdedError, status: r.status, data };
}

const norm = (s) => String(s || '').toUpperCase().replace(/[\s\-.]/g, '');

// Mapea un cliente de Consultify al formato de contacto de Holded (API v1).
// En la v1 el CIF/NIF va en el campo `code`. `type` acepta 'client'|'supplier'|'lead';
// lo dejamos en 'client'. Solo enviamos campos con valor para no romper validaciones.
function aContactoHolded(c) {
  const out = { name: c.empresa || c.nombre || '', type: 'client' };
  const code = norm(c.cif || c.cif_matriz || '');
  if (code) out.code = code;
  if (c.email) out.email = c.email;
  if (c.telefono) out.phone = String(c.telefono);
  return out;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!process.env.HOLDED_API_KEY) {
    return json({ ok: false, error: 'Falta la variable HOLDED_API_KEY en Netlify.' }, 500);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Backend Supabase no configurado.' }, 500);
  }

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const caller = await autorizar(token);
  if (!caller) return json({ ok: false, error: 'No autorizado.' }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'JSON inválido' }, 400); }
  const { action } = body;

  try {
    // ── Buscar contacto por CIF ──
    if (action === 'buscar_por_cif') {
      const cif = norm(body.cif);
      if (!cif) return json({ ok: false, error: 'CIF vacío' }, 400);
      // Holded permite listar contactos; filtramos por 'code' (CIF).
      const r = await holded('/contacts');
      if (!r.ok) return json({ ok: false, error: `Error consultando Holded (HTTP ${r.status})`, detalle: r.data }, 502);
      const lista = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data) ? r.data.data : []);
      const match = lista.find((x) => norm(x.code) === cif);
      return json({ ok: true, encontrado: !!match, contacto: match || null });
    }

    // ── Crear contacto ──
    if (action === 'crear') {
      const payload = aContactoHolded(body.cliente || {});
      if (!payload.code) return json({ ok: false, error: 'El cliente no tiene CIF; no se puede crear en Holded.' }, 400);
      const r = await holded('/contacts', { method: 'POST', body: payload });
      if (!r.ok) return json({ ok: false, error: 'No se pudo crear en Holded', detalle: r.data }, 502);
      // Holded devuelve el id del nuevo contacto
      const id = r.data?.id || r.data?.contactId || null;
      return json({ ok: true, holded_id: id, respuesta: r.data });
    }

    // ── Actualizar contacto ──
    if (action === 'actualizar') {
      const { holded_id } = body;
      if (!holded_id) return json({ ok: false, error: 'Falta holded_id' }, 400);
      const payload = aContactoHolded(body.cliente || {});
      const r = await holded(`/contacts/${holded_id}`, { method: 'PUT', body: payload });
      if (!r.ok) return json({ ok: false, error: 'No se pudo actualizar en Holded', detalle: r.data }, 502);
      return json({ ok: true, respuesta: r.data });
    }

    // ── Sincronizar (buscar→vincular/actualizar o crear) ──
    if (action === 'sincronizar') {
      const c = body.cliente || {};
      const cif = norm(c.cif || c.cif_matriz);
      if (!cif) return json({ ok: false, error: 'El cliente no tiene CIF.' }, 400);

      // 1) buscar por CIF
      const rl = await holded('/contacts');
      if (!rl.ok) return json({ ok: false, error: `Error consultando Holded (HTTP ${rl.status})`, detalle: rl.data }, 502);
      const lista = Array.isArray(rl.data) ? rl.data : (Array.isArray(rl.data?.data) ? rl.data.data : []);
      const match = lista.find((x) => norm(x.code) === cif);

      if (match) {
        // 2a) existe → actualizar y vincular
        const payload = aContactoHolded(c);
        const ru = await holded(`/contacts/${match.id}`, { method: 'PUT', body: payload });
        if (!ru.ok) return json({ ok: false, error: `No se pudo actualizar en Holded (HTTP ${ru.status})`, detalle: ru.data }, 502);
        return json({ ok: true, holded_id: match.id, accion: 'vinculado_actualizado' });
      } else {
        // 2b) no existe → crear
        const payload = aContactoHolded(c);
        const rc = await holded('/contacts', { method: 'POST', body: payload });
        if (!rc.ok) return json({ ok: false, error: `No se pudo crear en Holded (HTTP ${rc.status})`, detalle: rc.data }, 502);
        const id = rc.data?.id || rc.data?.contactId || null;
        return json({ ok: true, holded_id: id, accion: 'creado' });
      }
    }

    return json({ ok: false, error: 'Acción desconocida' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};

export const config = { path: '/.netlify/functions/holded' };
