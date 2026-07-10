// netlify/functions/agenda-feed.mjs
// Feed iCalendar (.ics) SUSCRIBIBLE de la agenda de un consultor.
// El consultor añade esta URL una vez en Google/Outlook/Apple y su
// calendario se actualiza solo (sin re-descargar).
//
// URL: /api/agenda-feed?c=<consultor_id>&t=<token>
//   c → id del consultor
//   t → token simple anti-acceso público (debe coincidir con AGENDA_FEED_TOKEN)
//
// Variables de entorno en Netlify:
//   VITE_SUPABASE_URL        → URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE    → service role key (solo backend, NUNCA en el front)
//   AGENDA_FEED_TOKEN        → cadena secreta compartida en la URL del feed
//
// Nota de seguridad: el token va en la URL del feed (así funcionan los
// calendarios suscribibles). Usa un token largo y trata la URL como secreta.

const EFICIENCIA = { J1: 1.0, J2: 0.75, J3: 0.5, Senior: 0.4 };
const TIPOS = { produccion: 'Producción / Proyecto', gestion: 'Gestión', coordinacion: 'Coordinación' };

const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function dt(fechaISO, horaHHMM, addHoras = 0) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const [hh, mm] = (horaHHMM || '09:00').split(':').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d, hh, mm));
  x.setUTCMinutes(x.getUTCMinutes() + Math.round(addHoras * 60));
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
}

export default async (req) => {
  const url = new URL(req.url);
  const consultorId = url.searchParams.get('c');
  const token = url.searchParams.get('t');

  const FEED_TOKEN = process.env.AGENDA_FEED_TOKEN;
  if (!FEED_TOKEN || token !== FEED_TOKEN) return new Response('No autorizado', { status: 401 });
  if (!consultorId) return new Response('Falta el parámetro c', { status: 400 });

  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!base || !key) return new Response('Backend sin configurar', { status: 500 });

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  // Consultor (para nombre y nivel)
  const cRes = await fetch(`${base}/rest/v1/consultores?id=eq.${consultorId}&select=nombre,apellidos,nivel`, { headers });
  const cArr = await cRes.json();
  const c = Array.isArray(cArr) && cArr[0] ? cArr[0] : null;
  const nivel = c?.nivel || 'J2';
  const nombre = c ? `${c.nombre || ''} ${c.apellidos || ''}`.trim() : 'Consultor';

  // Tareas del consultor
  const tRes = await fetch(`${base}/rest/v1/agenda_tareas?consultor_id=eq.${consultorId}&select=*&order=fecha_prevista`, { headers });
  const tareas = await tRes.json();

  const eventos = (Array.isArray(tareas) ? tareas : []).map((t) => {
    const fecha = t.fecha_efectiva && t.horas_reales ? t.fecha_efectiva : t.fecha_prevista;
    const horas = t.horas_reales || t.horas_previstas
      || (t.horas_base ? t.horas_base * (EFICIENCIA[nivel] ?? 1) : 1);
    const tipo = TIPOS[t.tipo || 'produccion'];
    const desc = [tipo, t.descripcion, `Responsable: ${nombre}`, `Horas: ${horas}`].filter(Boolean).join(' · ');
    return [
      'BEGIN:VEVENT',
      `UID:${t.id}@consultify.pro`,
      `DTSTAMP:${dt(new Date().toISOString().slice(0, 10), '00:00')}`,
      `DTSTART:${dt(fecha, t.hora_inicio, 0)}`,
      `DTEND:${dt(fecha, t.hora_inicio, horas)}`,
      `SUMMARY:${esc(t.titulo)} [${tipo}]`,
      `DESCRIPTION:${esc(desc)}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Consultify//Agenda//ES',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:Consultify · ${esc(nombre)}`,
    ...eventos, 'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=900', // refresco cada 15 min
    },
  });
};
