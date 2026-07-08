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
// Endpoint alternativo (API invoicing v1, muy usado). Si el v2 no devuelve
// contactos, probamos este. Su auth también admite Bearer y la cabecera key.
const HOLDED_BASE_INV = 'https://api.holded.com/api/invoicing/v1';
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

// Llama a la API v2 de Holded (auth Bearer, confirmada para esta cuenta).
async function holded(path, { method = 'GET', body, base = HOLDED_BASE } = {}) {
  let r;
  try {
    r = await fetch(`${base}${path}`, {
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
  if (Array.isArray(data?.items)) return data.items;   // formato v2 real: {items, cursor, has_more}
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.contacts)) return data.contacts;
  return [];
}

// El CIF va en `code` (confirmado en la respuesta real de la v2). Comprobamos
// también las variantes con guion bajo por robustez.
const cifDe = (x) => {
  const cands = [x?.code, x?.vat_number, x?.vatnumber, x?.vatNumber, x?.custom_id, x?.customId, x?.trade_name, x?.nif, x?.cif];
  for (const c of cands) { const n = norm(c); if (n) return n; }
  return '';
};

// Mapea un contacto de Holded a los campos de cliente de Consultify (para autocompletar).
function deContactoHolded(x) {
  return {
    empresa: x?.name || '',
    email: x?.email || '',
    telefono: x?.phone || x?.mobile || '',
    contacto: x?.contactPersons?.[0]?.name || x?.contact_persons?.[0]?.name || '',
    cif_matriz: norm(x?.code || x?.vat_number || ''),
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
  // La v2 pagina por cursor: respuesta {items, cursor, has_more}.
  let cursor = null;
  for (let i = 0; i < 100; i++) { // hasta 100 lotes (cubre miles de contactos)
    const q = cursor ? `/contacts?limit=100&cursor=${encodeURIComponent(cursor)}` : '/contacts?limit=100';
    const r = await holded(q);
    if (!r.ok) return { error: r };
    const lista = listaContactos(r.data);
    if (lista.length === 0) break;
    const match = lista.find((x) => cifDe(x) === objetivo);
    if (match) return { match, base: HOLDED_BASE };
    // ¿hay más páginas?
    const hayMas = r.data?.has_more === true && r.data?.cursor;
    if (!hayMas) break;
    cursor = r.data.cursor;
  }
  return { match: null, base: HOLDED_BASE };
}

// Calcula el semáforo de cobros de un contacto de Holded a partir de sus facturas.
// Devuelve { estado, vencidas, pendientes, importe_vencido }.
//   rojo = alguna factura vencida sin pagar
//   amarillo = facturas pendientes de pago pero no vencidas aún
//   verde = todo pagado / sin facturas
async function estadoCobrosDeContacto(holdedId, opts = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  let cursor = null, vencidas = 0, pendientes = 0, importeVencido = 0, huboError = false;
  let muestraFactura = null; // para diagnóstico
  for (let i = 0; i < 50; i++) {
    const q = `/invoices?contactId=${encodeURIComponent(holdedId)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r = await holded(q);
    if (!r.ok) { huboError = true; break; }
    const lista = listaContactos(r.data);
    if (lista.length === 0) break;
    if (!muestraFactura && lista[0]) muestraFactura = lista[0];
    for (const f of lista) {
      const pendiente = Number(f.pending ?? f.amountDue ?? f.pending_amount ?? f.pendingAmount ?? f.pendingamount ?? 0);
      const total = Number(f.total ?? f.amount ?? 0);

      // --- ¿Está PAGADA? Solo si lo dice explícitamente o no queda nada pendiente. ---
      const stRaw = f.status ?? f.statusText ?? f.state ?? '';
      const st = String(stRaw).toLowerCase();
      const pagadaExplicita = st.includes('pagad') || st.includes('cobrad') || st.includes('paid')
        || f.paid === true || f.isPaid === true || f.pagada === true;
      const sinPendiente = (pendiente === 0 && total > 0);
      if (pagadaExplicita || sinPendiente) continue;

      // --- ¿Está VENCIDA? Se comprueba PRIMERO (prioridad rojo). ---
      const vencidaTexto = st.includes('venc') || st.includes('overdue') || st.includes('expired') || st.includes('atrasad');
      const dueRaw = f.dueDate ?? f.due_date ?? f.expirationDate ?? f.duedate ?? f.dueDateFormatted ?? null;
      let dueSeg = 0;
      if (dueRaw != null && dueRaw !== '') {
        if (typeof dueRaw === 'number') dueSeg = dueRaw > 1e12 ? Math.floor(dueRaw / 1000) : dueRaw;
        else { const t = Date.parse(dueRaw); if (!isNaN(t)) dueSeg = Math.floor(t / 1000); }
      }
      const vencidaFecha = dueSeg > 0 && dueSeg < ahora;

      if (vencidaTexto || vencidaFecha) { vencidas++; importeVencido += (pendiente || total || 0); }
      else pendientes++;
    }
    const hayMas = r.data?.has_more === true && r.data?.cursor;
    if (!hayMas) break;
    cursor = r.data.cursor;
  }
  let estado = 'verde';
  if (vencidas > 0) estado = 'rojo';
  else if (pendientes > 0) estado = 'amarillo';
  const out = { estado, vencidas, pendientes, importe_vencido: Math.round(importeVencido * 100) / 100, error: huboError };
  if (opts.diagnostico && muestraFactura) {
    out.campos_factura = Object.keys(muestraFactura);
    try { out.muestra_factura = JSON.stringify(muestraFactura).slice(0, 1200); } catch { /* noop */ }
  }
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
    // Estado de cobros de UN cliente (por CIF): consulta Holded en vivo.
    if (action === 'estado_cobros') {
      const cif = norm(body.cif);
      if (!cif) return json({ ok: false, error: 'CIF vacío' }, 400);
      const res = await buscarContactoPorCif(cif);
      if (res.error) return json({ ok: false, error: `Error consultando Holded (HTTP ${res.error.status})`, detalle: res.error.data }, 502);
      if (!res.match) return json({ ok: true, estado: null, sin_contacto: true });
      const est = await estadoCobrosDeContacto(res.match.id, { diagnostico: !!body.diagnostico });
      return json({ ok: true, holded_id: res.match.id, ...est });
    }

    // Refresca el estado de cobros de TODOS los clientes con CIF y lo guarda en la BD.
    // Pensado para el scheduler diario (o botón manual). Usa service_role para escribir.
    if (action === 'refrescar_cobros') {
      const SUPA = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
      // Traer clientes con CIF (paginado alto).
      const rc = await fetch(`${SUPA}/rest/v1/clientes?select=id,cif_matriz,holded_id&or=(cif_matriz.not.is.null,holded_id.not.is.null)&limit=2000`, {
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      if (!rc.ok) return json({ ok: false, error: 'No se pudieron leer los clientes.' }, 502);
      const clientes = await rc.json();
      let actualizados = 0, errores = 0;
      const ahoraISO = new Date().toISOString();
      for (const c of clientes) {
        try {
          let holdedId = c.holded_id;
          if (!holdedId && c.cif_matriz) {
            const res = await buscarContactoPorCif(norm(c.cif_matriz));
            holdedId = res.match?.id || null;
          }
          if (!holdedId) continue;
          const est = await estadoCobrosDeContacto(holdedId);
          if (est.error) { errores++; continue; }
          await fetch(`${SUPA}/rest/v1/clientes?id=eq.${c.id}`, {
            method: 'PATCH',
            headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              estado_cobros: est.estado,
              cobros_actualizado_en: ahoraISO,
              cobros_detalle: { vencidas: est.vencidas, pendientes: est.pendientes, importe_vencido: est.importe_vencido },
              holded_id: holdedId,
            }),
          });
          actualizados++;
        } catch { errores++; }
      }
      return json({ ok: true, actualizados, errores, total: clientes.length });
    }

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
        // Diagnóstico: devolvemos la respuesta CRUDA de Holded para ver su estructura
        // real y saber de dónde extraer la lista de contactos.
        let diagnostico = null;
        if (body.diagnostico) {
          const pruebas = [];
          for (const [nombre, base] of [['v2', HOLDED_BASE], ['invoicing_v1', HOLDED_BASE_INV]]) {
            const r0 = await holded('/contacts?page=1&limit=100', { base });
            const raw = r0.data;
            let muestraRaw;
            try { muestraRaw = JSON.stringify(raw).slice(0, 300); } catch { muestraRaw = String(raw).slice(0, 300); }
            pruebas.push({
              endpoint: nombre,
              http_status: r0.status,
              ok: r0.ok,
              es_array: Array.isArray(raw),
              longitud: Array.isArray(raw) ? raw.length : (Array.isArray(raw?.data) ? raw.data.length : null),
              claves: (raw && typeof raw === 'object' && !Array.isArray(raw)) ? Object.keys(raw) : [],
              muestra: muestraRaw,
            });
          }
          diagnostico = pruebas;
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

      const base = res.base || HOLDED_BASE; // usar el endpoint que respondió con datos
      const payload = aContactoHolded(c);
      if (res.match) {
        const ru = await holded(`/contacts/${res.match.id}`, { method: 'PUT', body: payload, base });
        if (!ru.ok) return json({ ok: false, error: `No se pudo actualizar en Holded (HTTP ${ru.status})`, detalle: ru.data }, 502);
        return json({ ok: true, holded_id: res.match.id, accion: 'vinculado_actualizado' });
      } else {
        const rc = await holded('/contacts', { method: 'POST', body: payload, base });
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
