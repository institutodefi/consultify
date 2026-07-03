// ════════════════════════════════════════════════════════════════
// AGENDA DEL CONSULTOR · XIX Convenio Consultorías 2025-2027
//   · 1.800 h de trabajo efectivo en cómputo anual (tope legal)
//   · 40 h/semana (8 h/día) · máx. 9 h ordinarias/día
//   · Verano (1 jul–15 sep): jornada intensiva 7 h/día (35 h/sem)
//   · Tope 1.800 h = MÁXIMO legal: la jornada real no se infla a 1.800
//   · Vacaciones: 23 días laborables (22 si ≥2 meses de intensiva)
// Tareas: fecha/horas PREVISTAS (plan) y EFECTIVAS/REALES (ejecución)
// Capa de datos con el mismo patrón DEMO que lib/data.js.
// ════════════════════════════════════════════════════════════════
import { supabase, DEMO } from './supabase';

export const TOPE_ANUAL = 1800;
export const MAX_HORAS_DIA = 9;
export const HORAS_DIA_ESTANDAR = 8;
export const HORAS_DIA_VERANO = 7;          // jornada intensiva de verano
// Jornada intensiva Consultify: 1 julio – 15 septiembre a 7 h/día (35 h/sem,
// dentro del tope de 36 h/sem del art. 20.2). 2+ meses ⇒ 22 días vacaciones.
export const VERANO_INI = '07-01';
export const VERANO_FIN = '09-15';
export const esVerano = (date) => {
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return md >= VERANO_INI && md <= VERANO_FIN;
};
export const DIAS_VACACIONES = 22;  // 2+ meses de intensiva ⇒ 22 días (art. 21 convenio)
export const YEAR_AGENDA = 2026; // año de ajuste

// Reparto de la jornada (sobre el objetivo de convenio ya ajustado al tope):
export const PCT_PRODUCTIVO   = 0.70; // horas facturables a cliente (tareas)
export const PCT_GESTION      = 0.10; // gestión interna
export const PCT_COORDINACION = 0.10; // coordinación
export const PCT_PROC_INTERNO = 0.10; // procesos internos (sin proyecto de cliente)

// Tipos de tarea: cada una consume su bolsa de jornada
export const TIPOS_TAREA = [
  { id: 'produccion',      nombre: 'Producción / Proyecto', pct: PCT_PRODUCTIVO },
  { id: 'gestion',         nombre: 'Gestión',               pct: PCT_GESTION },
  { id: 'coordinacion',    nombre: 'Coordinación',          pct: PCT_COORDINACION },
  { id: 'proceso_interno', nombre: 'Procesos internos',     pct: PCT_PROC_INTERNO },
];
export const TIPO_BY_ID = Object.fromEntries(TIPOS_TAREA.map(t => [t.id, t]));

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

export const horasDia = (date) => (esVerano(date) ? HORAS_DIA_VERANO : HORAS_DIA_ESTANDAR);

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
  const prev = { produccion: 0, gestion: 0, coordinacion: 0, proceso_interno: 0 };
  const real = { produccion: 0, gestion: 0, coordinacion: 0, proceso_interno: 0 };
  // Para la CAPACIDAD del consultor cuentan las horas que la tarea le
  // consume (horas_consultor, ya con eficiencia). Si no está, cae a
  // horas_previstas (compatibilidad con tareas antiguas).
  for (const t of tareas) {
    const tipo = t.tipo || 'produccion';
    const hPrev = Number(t.horas_consultor ?? t.horas_previstas);
    const hReal = Number(t.horas_reales);
    if (enMes(t.fecha_prevista, year, month)) { previstas += hPrev; prev[tipo] += hPrev; }
    if (t.horas_reales && enMes(t.fecha_efectiva, year, month)) { reales += hReal; real[tipo] += hReal; }
  }
  const objetivoBruto = horasConvenio - horasVacaciones;
  return {
    laborables, horasConvenio, horasVacaciones, diasVacaciones: diasVacacionesN,
    objetivoBruto, previstas, reales,
    prevTipo: prev, realTipo: real,
    desviacion: reales - previstas,
  };
}

export function resumenAnual(year, festivosSet, vacacionesSet, tareas, pctJornada = 100) {
  const meses = [];
  for (let m = 0; m < 12; m++) {
    meses.push({ mes: m, nombre: MESES[m], ...resumenMes(year, m, festivosSet, vacacionesSet, tareas) });
  }

  // ── Tope de 1.800 h = MÁXIMO legal (art. 20.1), no objetivo a clavar ──
  // La jornada real = horas de convenio − vacaciones. Solo se recorta
  // (prorrateando) en el caso de que el calendario supere el tope.
  const brutoTotal = meses.reduce((a, m) => a + m.objetivoBruto, 0);
  const factor = brutoTotal > TOPE_ANUAL ? TOPE_ANUAL / brutoTotal : 1; // solo si excede
  const jor = (pctJornada ?? 100) / 100;          // fracción de jornada del consultor
  for (const m of meses) {
    m.objetivo     = m.objetivoBruto * factor * jor; // jornada real del mes según % dedicación
    m.productivas  = m.objetivo * PCT_PRODUCTIVO;    // facturable a cliente
    m.gestion      = m.objetivo * PCT_GESTION;
    m.coordinacion = m.objetivo * PCT_COORDINACION;
    m.procesoInterno = m.objetivo * PCT_PROC_INTERNO;
    m.disponibles  = Math.max(0, m.productivas - m.prevTipo.produccion); // hueco facturable
  }
  const ajusteTope = Math.max(0, brutoTotal - TOPE_ANUAL); // h recortadas si excede el tope
  const margenTope = Math.max(0, TOPE_ANUAL - brutoTotal); // h libres hasta el tope legal

  const total = meses.reduce((a, m) => ({
    horasConvenio: a.horasConvenio + m.horasConvenio,
    horasVacaciones: a.horasVacaciones + m.horasVacaciones,
    diasVacaciones: a.diasVacaciones + m.diasVacaciones,
    objetivo: a.objetivo + m.objetivo,
    productivas: a.productivas + m.productivas,
    gestion: a.gestion + m.gestion,
    coordinacion: a.coordinacion + m.coordinacion,
    previstas: a.previstas + m.previstas,
    reales: a.reales + m.reales,
    prevTipo: {
      produccion: a.prevTipo.produccion + m.prevTipo.produccion,
      gestion: a.prevTipo.gestion + m.prevTipo.gestion,
      coordinacion: a.prevTipo.coordinacion + m.prevTipo.coordinacion,
    },
    realTipo: {
      produccion: a.realTipo.produccion + m.realTipo.produccion,
      gestion: a.realTipo.gestion + m.realTipo.gestion,
      coordinacion: a.realTipo.coordinacion + m.realTipo.coordinacion,
    },
  }), { horasConvenio: 0, horasVacaciones: 0, diasVacaciones: 0, objetivo: 0, productivas: 0, gestion: 0, coordinacion: 0, previstas: 0, reales: 0,
        prevTipo: { produccion: 0, gestion: 0, coordinacion: 0 }, realTipo: { produccion: 0, gestion: 0, coordinacion: 0 } });

  // Proyección de PRODUCCIÓN = reales prod. + previsto prod. sin cerrar
  //   + ritmo real de producción × laborables futuros sin tarea de producción
  const hoy = hoyISO();
  const tareasProd = tareas.filter((t) => (t.tipo || 'produccion') === 'produccion');
  const diasOcupados = new Set();
  for (const t of tareasProd) {
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
  let realesProd = 0, previstoSinCerrar = 0;
  for (const t of tareasProd) {
    if (t.horas_reales) realesProd += Number(t.horas_reales);
    else previstoSinCerrar += Number(t.horas_consultor ?? t.horas_previstas);
  }
  const ritmo = labPasados > 0 ? realesProd / labPasados : 0;
  const proyeccion = realesProd + previstoSinCerrar + ritmo * labFuturosLibres;

  return {
    meses, total, tope: TOPE_ANUAL,
    ajusteTope,                                   // h recortadas si se supera el tope
    margenTope,                                   // h libres hasta 1.800
    capProductiva: total.productivas,             // referencia para tareas y reloj
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

// Quita del objeto la columna que PostgREST dice no encontrar, para poder
// reintentar el guardado aunque la BD vaya un paso por detrás de la app.
function _sinColumnaFaltante(obj, error) {
  const m = (error?.message || '').match(/could not find the '([^']+)' column/i)
        || (error?.message || '').match(/'([^']+)' column of '[^']+' in the schema cache/i);
  if (!m) return null;
  const col = m[1];
  if (!(col in obj)) return null;
  const { [col]: _omit, ...resto } = obj;
  return resto;
}

export async function crearTareaAgenda(t) {
  if (DEMO) { const r = { id: uid(), creado: new Date().toISOString(), ...t }; demoState().agenda_tareas.push(r); return r; }
  let payload = t;
  for (let intento = 0; intento < 4; intento++) {
    const { data, error } = await supabase.from('agenda_tareas').insert(payload).select().single();
    if (!error) return data;
    const reducido = _sinColumnaFaltante(payload, error);
    if (!reducido) throw error;   // error distinto a "columna ausente": propágalo
    payload = reducido;           // reintenta sin la columna que falta
  }
  throw new Error('No se pudo guardar tras varios reintentos.');
}

export async function actualizarTareaAgenda(id, patch) {
  if (DEMO) {
    const arr = demoState().agenda_tareas;
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) arr[i] = { ...arr[i], ...patch };
    return arr[i];
  }
  let payload = patch;
  for (let intento = 0; intento < 4; intento++) {
    const { data, error } = await supabase.from('agenda_tareas').update(payload).eq('id', id).select().single();
    if (!error) return data;
    const reducido = _sinColumnaFaltante(payload, error);
    if (!reducido) throw error;
    payload = reducido;
  }
  throw new Error('No se pudo actualizar tras varios reintentos.');
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
