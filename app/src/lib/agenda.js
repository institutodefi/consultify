// ════════════════════════════════════════════════════════════════
// AGENDA DEL CONSULTOR · XIX Convenio Consultorías 2025-2027
//   · 1.800 h de trabajo efectivo en cómputo anual (tope legal)
//   · 40 h/semana (8 h/día) · máx. 9 h ordinarias/día
//   · Agosto: jornada intensiva 36 h/semana (7,2 h/día)
//   · Vacaciones: 23 días laborables (22 si ≥2 meses de intensiva)
// Tareas: fecha/horas PREVISTAS (plan) y EFECTIVAS/REALES (ejecución)
// Capa de datos con el mismo patrón DEMO que lib/data.js.
// ════════════════════════════════════════════════════════════════
import { supabase, DEMO } from './supabase';

export const TOPE_ANUAL = 1800;
export const MAX_HORAS_DIA = 9;
export const HORAS_DIA_ESTANDAR = 8;
export const HORAS_DIA_AGOSTO = 7.2;
export const DIAS_VACACIONES = 23;
export const YEAR_AGENDA = 2026; // año de ajuste

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Festivos 2026 Madrid capital — fallback si la tabla `festivos` está
// vacía o en modo DEMO. 2026 es año de ajuste: la tabla manda.
export const FESTIVOS_2026 = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-01-06', nombre: 'Epifanía del Señor' },
  { fecha: '2026-04-02', nombre: 'Jueves Santo' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-05-01', nombre: 'Fiesta del Trabajo' },
  { fecha: '2026-05-02', nombre: 'Fiesta C. de Madrid' },
  { fecha: '2026-05-15', nombre: 'San Isidro' },
  { fecha: '2026-08-15', nombre: 'Asunción de la Virgen' },
  { fecha: '2026-10-12', nombre: 'Fiesta Nacional' },
  { fecha: '2026-11-02', nombre: 'Todos los Santos (tras.)' },
  { fecha: '2026-11-09', nombre: 'Virgen de la Almudena' },
  { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2026-12-25', nombre: 'Navidad' },
];

// ── Calendario ────────────────────────────────────────────────────
export const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hoyISO = () => toISO(new Date());

export function esLaborable(date, festivosSet) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !festivosSet.has(toISO(date));
}

export const horasDia = (date) => (date.getMonth() === 7 ? HORAS_DIA_AGOSTO : HORAS_DIA_ESTANDAR);

export function diasDelMes(year, month) {
  const out = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return out;
}

const enMes = (iso, year, month) =>
  iso && iso.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`);

// ── Resúmenes ─────────────────────────────────────────────────────
export function resumenMes(year, month, festivosSet, vacacionesSet, tareas) {
  let laborables = 0, horasConvenio = 0, horasVacaciones = 0, diasVacacionesN = 0;
  for (const d of diasDelMes(year, month)) {
    if (!esLaborable(d, festivosSet)) continue;
    laborables += 1;
    const h = horasDia(d);
    horasConvenio += h;
    if (vacacionesSet.has(toISO(d))) { horasVacaciones += h; diasVacacionesN += 1; }
  }
  let previstas = 0, reales = 0;
  for (const t of tareas) {
    if (enMes(t.fecha_prevista, year, month)) previstas += Number(t.horas_previstas);
    if (t.horas_reales && enMes(t.fecha_efectiva, year, month)) reales += Number(t.horas_reales);
  }
  const objetivo = horasConvenio - horasVacaciones;
  return {
    laborables, horasConvenio, horasVacaciones, diasVacaciones: diasVacacionesN,
    objetivo, previstas, reales,
    disponibles: Math.max(0, objetivo - previstas),
    desviacion: reales - previstas,
  };
}

export function resumenAnual(year, festivosSet, vacacionesSet, tareas) {
  const meses = [];
  for (let m = 0; m < 12; m++) {
    meses.push({ mes: m, nombre: MESES[m], ...resumenMes(year, m, festivosSet, vacacionesSet, tareas) });
  }
  const total = meses.reduce((a, m) => ({
    horasConvenio: a.horasConvenio + m.horasConvenio,
    horasVacaciones: a.horasVacaciones + m.horasVacaciones,
    diasVacaciones: a.diasVacaciones + m.diasVacaciones,
    objetivo: a.objetivo + m.objetivo,
    previstas: a.previstas + m.previstas,
    reales: a.reales + m.reales,
  }), { horasConvenio: 0, horasVacaciones: 0, diasVacaciones: 0, objetivo: 0, previstas: 0, reales: 0 });

  // Proyección = reales + previsto sin cerrar + ritmo real × laborables futuros sin tarea
  const hoy = hoyISO();
  const diasOcupados = new Set();
  for (const t of tareas) {
    if (t.fecha_prevista) diasOcupados.add(t.fecha_prevista);
    if (t.fecha_efectiva) diasOcupados.add(t.fecha_efectiva);
  }
  let labPasados = 0, labFuturosLibres = 0;
  for (let m = 0; m < 12; m++) {
    for (const d of diasDelMes(year, m)) {
      if (!esLaborable(d, festivosSet) || vacacionesSet.has(toISO(d))) continue;
      const iso = toISO(d);
      if (iso <= hoy) labPasados += 1;
      else if (!diasOcupados.has(iso)) labFuturosLibres += 1;
    }
  }
  let realesTotal = 0, previstoSinCerrar = 0;
  for (const t of tareas) {
    if (t.horas_reales) realesTotal += Number(t.horas_reales);
    else previstoSinCerrar += Number(t.horas_previstas);
  }
  const ritmo = labPasados > 0 ? realesTotal / labPasados : 0;
  const proyeccion = realesTotal + previstoSinCerrar + ritmo * labFuturosLibres;

  return {
    meses, total, tope: TOPE_ANUAL,
    excesoSobreTope: Math.max(0, total.objetivo - TOPE_ANUAL),
    ritmo, proyeccion,
  };
}

// ── Capa de datos (Supabase real o DEMO en memoria) ──────────────
let demoAgenda = null;
function demoState() {
  if (!demoAgenda) demoAgenda = { vacaciones: [], agenda_tareas: [] };
  return demoAgenda;
}
const uid = () => Math.random().toString(36).slice(2, 10);

export async function getFestivos(year) {
  if (DEMO) return FESTIVOS_2026;
  const { data, error } = await supabase.from('festivos').select('*')
    .gte('fecha', `${year}-01-01`).lte('fecha', `${year}-12-31`).order('fecha');
  if (error) throw error;
  return data?.length ? data : FESTIVOS_2026; // fallback si la tabla está vacía
}

export async function getVacaciones(consultorId, year) {
  if (DEMO) return demoState().vacaciones.filter(v => v.consultor_id === consultorId);
  const { data, error } = await supabase.from('vacaciones').select('*')
    .eq('consultor_id', consultorId)
    .gte('fecha', `${year}-01-01`).lte('fecha', `${year}-12-31`);
  if (error) throw error;
  return data ?? [];
}

export async function toggleVacacion(consultorId, fecha) {
  if (DEMO) {
    const v = demoState().vacaciones;
    const i = v.findIndex(x => x.consultor_id === consultorId && x.fecha === fecha);
    if (i >= 0) { v.splice(i, 1); return false; }
    v.push({ id: uid(), consultor_id: consultorId, fecha });
    return true;
  }
  const { data, error } = await supabase.from('vacaciones').select('id')
    .eq('consultor_id', consultorId).eq('fecha', fecha).maybeSingle();
  if (error) throw error;
  if (data) {
    const { error: e2 } = await supabase.from('vacaciones').delete().eq('id', data.id);
    if (e2) throw e2;
    return false;
  }
  const { error: e3 } = await supabase.from('vacaciones').insert({ consultor_id: consultorId, fecha });
  if (e3) throw e3;
  return true;
}

export async function getTareasAgenda(consultorId, year) {
  if (DEMO) return demoState().agenda_tareas.filter(t => t.consultor_id === consultorId);
  const ini = `${year}-01-01`, fin = `${year}-12-31`;
  const { data, error } = await supabase.from('agenda_tareas').select('*')
    .eq('consultor_id', consultorId)
    .or(`and(fecha_prevista.gte.${ini},fecha_prevista.lte.${fin}),and(fecha_efectiva.gte.${ini},fecha_efectiva.lte.${fin})`)
    .order('fecha_prevista');
  if (error) throw error;
  return data ?? [];
}

export async function crearTareaAgenda(t) {
  if (DEMO) { const r = { id: uid(), creado: new Date().toISOString(), ...t }; demoState().agenda_tareas.push(r); return r; }
  const { data, error } = await supabase.from('agenda_tareas').insert(t).select().single();
  if (error) throw error;
  return data;
}

export async function actualizarTareaAgenda(id, patch) {
  if (DEMO) {
    const arr = demoState().agenda_tareas;
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) arr[i] = { ...arr[i], ...patch };
    return arr[i];
  }
  const { data, error } = await supabase.from('agenda_tareas').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function borrarTareaAgenda(id) {
  if (DEMO) {
    const arr = demoState().agenda_tareas;
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) arr.splice(i, 1);
    return;
  }
  const { error } = await supabase.from('agenda_tareas').delete().eq('id', id);
  if (error) throw error;
}
