// netlify/functions/holded.mjs
// Integración con Holded (facturación) — API v2. SOLO backend: la API key nunca
// llega al navegador. La v2 usa autenticación Bearer y base https://api.holded.com.
//
// El vínculo Consultify↔Holded se hace por CIF/NIF. En Holded el CIF se guarda en
// el campo `code` del contacto. Buscamos listando contactos y comparando `code`.
//
// Seguridad: el front envía el access_token del usuario; verificamos contra
// Supabase que es del equipo (superadmin/admin/director) antes de operar.
//
// Acciones (body.action):
//   buscar_por_cif {cif}
//   crear {cliente}
//   actualizar {holded_id, cliente}
//   sincronizar {cliente}   → busca por CIF; vincula/actualiza o crea
//
// Variables de entorno (Netlify, SIN prefijo VITE_):
//   HOLDED_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const HOLDED_BASE = 'https://api.holded.com/api/v2';
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

// Llama a la API v2 de Holded (auth Bearer).
async function holded(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(`${HOLDED_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.HOLDED_API_KEY}`,
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
  const holdedError = data && typeof data === 'object' && (data.status === 0 || data.error);
  return { ok: r.ok && !holdedError, status: r.status, data };
}

const norm = (s) => String(s || '').toUpperCase().replace(/[\s\-.]/g, '');

// Extrae el array de contactos de la respuesta (v2 pagina con {data:[...]}).
function listaContactos(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.contacts)) return data.contacts;
  return [];
}

// El CIF puede venir en distintos campos según la versión de la API / cómo se creó.
// Comprobamos todos los candidatos conocidos de la v1 y v2 de Holded.
const cifDe = (x) => {
  const cands = [x?.code, x?.vatnumber, x?.vatNumber, x?.taxId, x?.nif, x?.cif, x?.customId, x?.tradeName];
  for (const c of cands) { const n = norm(c); if (n) return n; }
  return '';
};

// Mapea un contacto de Holded a los campos de cliente de Consultify (para autocompletar).
function deContactoHolded(x) {
  return {
    empresa: x?.name || '',
    email: x?.email || '',
    telefono: x?.phone || x?.mobile || '',
    contacto: x?.contactPersons?.[0]?.name || '',
    cif_matriz: norm(x?.code || x?.vatnumber || ''),
  };
}

// Mapea un cliente de Consultify al formato de contacto de Holded v2.
// El CIF va en `code`. Solo enviamos campos con valor.
function aContactoHolded(c) {
  const out = { name: c.empresa || c.nombre || '', type: 'client' };
  const code = norm(c.cif || c.cif_matriz || '');
  if (code) out.code = code;
  if (c.email) out.email = c.email;
  if (c.telefono) out.phone = String(c.telefono);
  return out;
}

// Recorre todas las páginas de contactos buscando uno cuyo CIF coincida.
async function buscarContactoPorCif(cif) {
  const objetivo = norm(cif);
  let page = 1;
  // v2 permite hasta 100 por página. Con 50 páginas cubrimos 5000 contactos.
  for (let i = 0; i < 50; i++) {
    const r = await holded(`/contacts?page=${page}&limit=100`);
    if (!r.ok) return { error: r };
    const lista = listaContactos(r.data);
    if (lista.length === 0) break; // no hay más resultados
    const match = lista.find((x) => cifDe(x) === objetivo);
    if (match) return { match };
    if (lista.length < 100) break; // última página (menos de un lote completo)
    page += 1;
  }
  return { match: null };
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
    if (action === 'buscar_por_cif') {
      const cif = norm(body.cif);
      if (!cif) return json({ ok: false, error: 'CIF vacío' }, 400);
      const res = await buscarContactoPorCif(cif);
      if (res.error) return json({ ok: false, error: `Error consultando Holded (HTTP ${res.error.status})`, detalle: res.error.data }, 502);
      return json({ ok: true, encontrado: !!res.match, contacto: res.match || null });
    }

    // Busca por CIF y, si existe, devuelve los datos listos para autocompletar el cliente.
    if (action === 'buscar_datos') {
      const cif = norm(body.cif);
      if (!cif) return json({ ok: false, error: 'CIF vacío' }, 400);
      const res = await buscarContactoPorCif(cif);
      if (res.error) return json({ ok: false, error: `Error consultando Holded (HTTP ${res.error.status})`, detalle: res.error.data }, 502);
      if (!res.match) {
        // Diagnóstico: devolvemos las claves del primer contacto y cuántos hay,
        // para ver en qué campo está realmente el CIF si no lo encontramos.
        let diagnostico = null;
        if (body.diagnostico) {
          const r0 = await holded('/contacts?page=1');
          const lista = listaContactos(r0.data);
          diagnostico = {
            total_en_pagina: lista.length,
            campos_primer_contacto: lista[0] ? Object.keys(lista[0]) : [],
            muestra: lista.slice(0, 2).map(x => ({ id: x.id, name: x.name, code: x.code, vatnumber: x.vatnumber, customId: x.customId })),
          };
        }
        return json({ ok: true, encontrado: false, diagnostico });
      }
      return json({ ok: true, encontrado: true, holded_id: res.match.id, datos: deContactoHolded(res.match) });
    }

    if (action === 'crear') {
      const payload = aContactoHolded(body.cliente || {});
      if (!payload.code) return json({ ok: false, error: 'El cliente no tiene CIF; no se puede crear en Holded.' }, 400);
      const r = await holded('/contacts', { method: 'POST', body: payload });
      if (!r.ok) return json({ ok: false, error: `No se pudo crear en Holded (HTTP ${r.status})`, detalle: r.data }, 502);
      const id = r.data?.id || r.data?.contactId || null;
      return json({ ok: true, holded_id: id, respuesta: r.data });
    }

    if (action === 'actualizar') {
      const { holded_id } = body;
      if (!holded_id) return json({ ok: false, error: 'Falta holded_id' }, 400);
      const payload = aContactoHolded(body.cliente || {});
      const r = await holded(`/contacts/${holded_id}`, { method: 'PUT', body: payload });
      if (!r.ok) return json({ ok: false, error: `No se pudo actualizar en Holded (HTTP ${r.status})`, detalle: r.data }, 502);
      return json({ ok: true, respuesta: r.data });
    }

    if (action === 'sincronizar') {
      const c = body.cliente || {};
      const cif = norm(c.cif || c.cif_matriz);
      if (!cif) return json({ ok: false, error: 'El cliente no tiene CIF.' }, 400);

      const res = await buscarContactoPorCif(cif);
      if (res.error) return json({ ok: false, error: `Error consultando Holded (HTTP ${res.error.status})`, detalle: res.error.data }, 502);

      const payload = aContactoHolded(c);
      if (res.match) {
        const ru = await holded(`/contacts/${res.match.id}`, { method: 'PUT', body: payload });
        if (!ru.ok) return json({ ok: false, error: `No se pudo actualizar en Holded (HTTP ${ru.status})`, detalle: ru.data }, 502);
        return json({ ok: true, holded_id: res.match.id, accion: 'vinculado_actualizado' });
      } else {
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
