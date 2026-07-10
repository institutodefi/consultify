// netlify/functions/brevo-clientes.mjs
// Sincroniza clientes de Consultify → Brevo como contactos (crear/actualizar).
// El nombre y apellidos del contacto van a los atributos NOMBRE/APELLIDOS
// (y también FIRSTNAME/LASTNAME por compatibilidad con cuentas en inglés).
//
// Seguridad: verifica que el llamante es de equipo (superadmin/admin/director).
//
// Acciones (body.action):
//   sincronizar_cliente { cliente }      → sube un cliente concreto
//   sincronizar_todos                    → sube todos los clientes con email
//
// Variables (Netlify, SIN VITE_): BREVO_API_KEY, SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY, BREVO_LIST_CLIENTES_ID (opcional).

const ROLES_OK = ['superadmin', 'admin', 'director'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

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

// Sube un cliente a Brevo. Devuelve {ok, error?}.
// Para el flujo RGPD (doble opt-in), el cliente entra en la lista TEMPORAL de
// pendientes de confirmar (BREVO_LIST_DOI_ID / BREVO_LIST_CLIENTES_ID) y se marca
// con DOI_PENDIENTE=true, hasta que confirme su consentimiento.
async function subirContacto(c, apiKey, listaId) {
  const email = (c.email || '').trim();
  if (!email) return { ok: false, sin_email: true };

  const nombre = (c.contacto || '').trim();
  const apellidos = (c.contacto_apellidos || '').trim();
  const usaDOI = !!listaId;
  const attributes = {
    NOMBRE: nombre, APELLIDOS: apellidos,
    FIRSTNAME: nombre, LASTNAME: apellidos,
    EMPRESA: c.empresa || '',
    CIF: c.cif_matriz || c.cif || '',
    TELEFONO: c.telefono || '',
    TIPO: 'Cliente',
    DOI_PENDIENTE: usaDOI, // marca de pendiente de confirmar (RGPD)
  };
  const payload = {
    email, attributes, updateEnabled: true,
    ...(listaId ? { listIds: [Number(listaId)] } : {}),
  };
  const r = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (r.ok || r.status === 204) return { ok: true };
  const err = await r.text();
  if (err.includes('duplicate')) return { ok: true, updated: true };
  return { ok: false, error: err };
}

// Resuelve el ID de una lista de Brevo por su NOMBRE (p. ej. TEMP_PENDIENTE_CONFIRMAR).
// Brevo pagina las listas; recorremos hasta encontrarla. Devuelve id numérico o null.
async function idListaPorNombre(nombre, apiKey) {
  if (!nombre) return null;
  let offset = 0;
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://api.brevo.com/v3/contacts/lists?limit=50&offset=${offset}`, {
      headers: { 'api-key': apiKey, Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const listas = d.lists || [];
    const match = listas.find(l => (l.name || '').trim().toLowerCase() === nombre.trim().toLowerCase());
    if (match) return match.id;
    if (listas.length < 50) break;
    offset += 50;
  }
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'Falta BREVO_API_KEY en Netlify.' }, 500);
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
  // Lista destino para el flujo RGPD (doble opt-in): pendientes de confirmar.
  // Prioridad: nombre configurable → por defecto "TEMP_PENDIENTE_CONFIRMAR" → ID directo.
  const nombreLista = process.env.BREVO_LIST_CLIENTES_NOMBRE || 'TEMP_PENDIENTE_CONFIRMAR';
  let listaId = process.env.BREVO_LIST_CLIENTES_ID || process.env.BREVO_LIST_DOI_ID || null;
  if (!listaId) {
    listaId = await idListaPorNombre(nombreLista, apiKey);
  }

  try {
    if (action === 'sincronizar_cliente') {
      const c = body.cliente || {};
      const res = await subirContacto(c, apiKey, listaId);
      if (res.sin_email) return json({ ok: false, error: 'El cliente no tiene email; Brevo requiere email.' }, 400);
      if (!res.ok) return json({ ok: false, error: 'Brevo: ' + res.error }, 502);
      return json({ ok: true, actualizado: !!res.updated });
    }

    if (action === 'sincronizar_todos') {
      const SUPA = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const rc = await fetch(`${SUPA}/rest/v1/clientes?select=id,empresa,contacto,contacto_apellidos,email,telefono,cif_matriz,cif&limit=5000`, {
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      if (!rc.ok) return json({ ok: false, error: 'No se pudieron leer los clientes.' }, 502);
      const clientes = await rc.json();
      let subidos = 0, sinEmail = 0, errores = 0;
      for (const c of clientes) {
        const res = await subirContacto(c, apiKey, listaId);
        if (res.sin_email) { sinEmail++; continue; }
        if (res.ok) subidos++; else errores++;
      }
      return json({ ok: true, subidos, sin_email: sinEmail, errores, total: clientes.length, lista_id: listaId, lista_nombre: nombreLista, lista_encontrada: !!listaId });
    }

    return json({ ok: false, error: 'Acción desconocida' }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
};

export const config = { path: '/.netlify/functions/brevo-clientes' };
