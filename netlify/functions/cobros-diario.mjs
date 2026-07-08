// netlify/functions/cobros-diario.mjs
// Función PROGRAMADA (scheduler de Netlify): se ejecuta 1 vez al día y refresca
// el semáforo de cobros de todos los clientes consultando Holded.
//
// La lógica real vive en holded.mjs (acción refrescar_cobros). Aquí solo la
// invocamos internamente con las credenciales del backend. No expone nada al
// exterior: es disparada por el cron de Netlify.
//
// Configura el horario en netlify.toml:
//   [functions."cobros-diario"]
//     schedule = "0 6 * * *"   # cada día a las 06:00 UTC

const HOLDED_BASE = 'https://api.holded.com/api/v2';

function listaContactos(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}
const norm = (s) => String(s || '').toUpperCase().replace(/[\s\-.]/g, '');
const cifDe = (x) => {
  const cands = [x?.code, x?.vat_number, x?.vatnumber, x?.custom_id, x?.trade_name];
  for (const c of cands) { const n = norm(c); if (n) return n; }
  return '';
};

async function holded(path, { method = 'GET', body } = {}) {
  try {
    const r = await fetch(`${HOLDED_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.HOLDED_API_KEY}`,
        'Content-Type': 'application/json', Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    const err = data && typeof data === 'object' && (data.status === 0 || data.error);
    return { ok: r.ok && !err, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, data: String(e) }; }
}

async function buscarPorCif(cif) {
  const objetivo = norm(cif);
  let cursor = null;
  for (let i = 0; i < 100; i++) {
    const q = cursor ? `/contacts?limit=100&cursor=${encodeURIComponent(cursor)}` : '/contacts?limit=100';
    const r = await holded(q);
    if (!r.ok) return null;
    const lista = listaContactos(r.data);
    if (lista.length === 0) break;
    const m = lista.find(x => cifDe(x) === objetivo);
    if (m) return m.id;
    if (!(r.data?.has_more && r.data?.cursor)) break;
    cursor = r.data.cursor;
  }
  return null;
}

async function estadoCobros(holdedId) {
  const ahora = Math.floor(Date.now() / 1000);
  let cursor = null, vencidas = 0, pendientes = 0, importeVencido = 0;
  for (let i = 0; i < 50; i++) {
    const q = `/invoices?contactId=${encodeURIComponent(holdedId)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r = await holded(q);
    if (!r.ok) break;
    const lista = listaContactos(r.data);
    if (lista.length === 0) break;
    for (const f of lista) {
      const pendiente = Number(f.pending ?? f.amountDue ?? f.pending_amount ?? f.pendingAmount ?? f.pendingamount ?? 0);
      const total = Number(f.total ?? f.amount ?? 0);
      const st = String(f.status ?? f.statusText ?? f.state ?? '').toLowerCase();
      const pagadaExplicita = st.includes('pagad') || st.includes('cobrad') || st.includes('paid') || f.paid === true || f.isPaid === true || f.pagada === true;
      const sinPendiente = (pendiente === 0 && total > 0);
      if (pagadaExplicita || sinPendiente) continue;
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
    if (!(r.data?.has_more && r.data?.cursor)) break;
    cursor = r.data.cursor;
  }
  let estado = 'verde';
  if (vencidas > 0) estado = 'rojo';
  else if (pendientes > 0) estado = 'amarillo';
  return { estado, vencidas, pendientes, importe_vencido: Math.round(importeVencido * 100) / 100 };
}

export default async () => {
  const SUPA = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.HOLDED_API_KEY || !SUPA || !SERVICE) {
    return new Response('Faltan variables de entorno', { status: 500 });
  }
  const rc = await fetch(`${SUPA}/rest/v1/clientes?select=id,cif_matriz,holded_id&or=(cif_matriz.not.is.null,holded_id.not.is.null)&limit=2000`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!rc.ok) return new Response('No se pudieron leer clientes', { status: 502 });
  const clientes = await rc.json();
  let actualizados = 0;
  const ahoraISO = new Date().toISOString();
  for (const c of clientes) {
    try {
      let holdedId = c.holded_id || (c.cif_matriz ? await buscarPorCif(c.cif_matriz) : null);
      if (!holdedId) continue;
      const est = await estadoCobros(holdedId);
      await fetch(`${SUPA}/rest/v1/clientes?id=eq.${c.id}`, {
        method: 'PATCH',
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          estado_cobros: est.estado, cobros_actualizado_en: ahoraISO,
          cobros_detalle: { vencidas: est.vencidas, pendientes: est.pendientes, importe_vencido: est.importe_vencido },
          holded_id: holdedId,
        }),
      });
      actualizados++;
    } catch { /* seguir con el siguiente */ }
  }
  return new Response(JSON.stringify({ ok: true, actualizados, total: clientes.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

// Horario: cada día a las 06:00 UTC.
export const config = { schedule: '0 6 * * *' };
