// ════════════════════════════════════════════════════════════════
// EXPORTACIÓN A CALENDARIO (.ics / iCalendar RFC 5545)
// Vuelca tareas de la agenda como eventos con fecha, hora y duración.
// Compatible con Google Calendar, Outlook, Apple Calendar (importar .ics).
// ════════════════════════════════════════════════════════════════
import { TIPO_BY_ID } from './agenda.js';

const pad = (n) => String(n).padStart(2, '0');

// Fecha + hora local → formato iCal flotante (sin Z, hora local del dispositivo)
function dtLocal(fechaISO, horaHHMM, addHoras = 0) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const [hh, mm] = (horaHHMM || '09:00').split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  dt.setMinutes(dt.getMinutes() + Math.round(addHoras * 60));
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

// Escapado de texto iCal
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function eventoVEVENT(t, consultorNombre) {
  const fecha = t.fecha_efectiva && t.horas_reales ? t.fecha_efectiva : t.fecha_prevista;
  const horas = t.horas_reales || t.horas_previstas;
  const tipo = TIPO_BY_ID[t.tipo || 'produccion']?.nombre || 'Producción';
  const ini = dtLocal(fecha, t.hora_inicio, 0);
  const fin = dtLocal(fecha, t.hora_inicio, horas);
  const desc = [tipo, t.descripcion, consultorNombre ? `Responsable: ${consultorNombre}` : '', `Horas: ${horas}`]
    .filter(Boolean).join(' · ');
  const uid = `${t.id || Math.random().toString(36).slice(2)}@consultify`;
  const stamp = dtLocal(new Date().toISOString().slice(0, 10), `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`);
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ini}`,
    `DTEND:${fin}`,
    `SUMMARY:${esc(t.titulo)} [${tipo}]`,
    `DESCRIPTION:${esc(desc)}`,
    'END:VEVENT',
  ].join('\r\n');
}

function envolver(eventos) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Consultify//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...eventos,
    'END:VCALENDAR',
  ].join('\r\n');
}

function descargar(nombre, contenido) {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga una sola tarea como .ics */
export function descargarTareaICS(tarea, consultorNombre) {
  descargar(`tarea-${(tarea.titulo || 'tarea').toLowerCase().replace(/\s+/g, '-').slice(0, 30)}.ics`,
    envolver([eventoVEVENT(tarea, consultorNombre)]));
}

/** Descarga todas las tareas (de un consultor/año) como un único .ics */
export function descargarAgendaICS(tareas, consultorNombre, etiqueta = 'agenda') {
  const eventos = tareas.map((t) => eventoVEVENT(t, consultorNombre));
  descargar(`consultify-${etiqueta}.ics`, envolver(eventos));
}
