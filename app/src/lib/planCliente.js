// ════════════════════════════════════════════════════════════════
// PLANIFICACIÓN DE TAREAS POR CLIENTE
// Detecta las tareas aplicables a las normas del cliente (desde el
// catálogo tareas_catalogo) y reparte la fecha estimada por BLOQUES
// de proceso (PE1, PA1…) escalonados a lo largo de los meses.
// Las horas son TOTALES del acto (no se prorratean).
// ════════════════════════════════════════════════════════════════

// Extrae el bloque de proceso ("PE1", "PA10", "PI3"…) del nombre de proceso.
export function bloqueDeProceso(proceso = '') {
  const m = String(proceso).match(/^([A-Z]{2}\d+)/);
  return m ? m[1] : (String(proceso).split(' ')[0] || '—');
}

const horasNetas = (t) => {
  const base = Number(t.horas_base) || 0;
  const red = Number(t.reduccion_pct) || 0;
  return Math.round(base * (1 - red / 100) * 100) / 100;
};

// Orden natural de bloques: estratégicos (PE) → de innovación (PI) → de apoyo (PA).
function rankBloque(b) {
  const fam = b[0] === 'P' ? b.slice(0, 2) : b;
  const num = parseInt(b.replace(/\D/g, ''), 10) || 0;
  const peso = { PE: 0, PI: 100, PA: 200 }[fam] ?? 300;
  return peso + num;
}

/**
 * Genera las tareas instanciadas de un cliente.
 * @param catalogo  filas de tareas_catalogo [{norma_id, modelo, proceso, subproceso, horas_base, reduccion_pct, orden}]
 * @param normaIds  normas del cliente (de todas sus empresas)
 * @param modelo    modelo de relación
 * @returns [{norma_id, modelo, proceso, subproceso, titulo, horas, bloque, orden}]
 */
export function tareasDeCliente(catalogo, normaIds, modelo) {
  if (!catalogo?.length || !normaIds?.length) return [];
  const set = new Set(normaIds);
  return catalogo
    .filter(t => set.has(t.norma_id) && t.modelo === modelo && (Number(t.horas_base) || 0) > 0)
    .map(t => ({
      norma_id: t.norma_id,
      modelo,
      proceso: t.proceso,
      subproceso: t.subproceso,
      titulo: `${t.norma_id} - ${t.proceso} - ${t.subproceso}`,
      horas: horasNetas(t),
      bloque: bloqueDeProceso(t.proceso),
      orden: t.orden ?? 0,
    }))
    .sort((a, b) =>
      rankBloque(a.bloque) - rankBloque(b.bloque) ||
      a.norma_id.localeCompare(b.norma_id) ||
      (a.orden - b.orden));
}

/**
 * Reparte fechas estimadas por bloque de proceso, escalonadas en el periodo.
 * Cada bloque distinto recibe una "ventana" temporal consecutiva; todas las
 * tareas de ese bloque comparten la fecha de inicio de su ventana.
 * @returns el mismo array con `fecha_estimada` (YYYY-MM-DD) añadido.
 */
import { esLaborable, FESTIVOS_2026, toISO } from './agenda.js';

// Máximo de horas de PROYECTO que se programan por día.
export const MAX_HORAS_PROYECTO_DIA = 6;

// Devuelve el primer día laborable (no finde, no festivo, no vacaciones) en/desde una fecha.
function primerLaborable(date, festivosSet, vacacionesSet) {
  const d = new Date(date);
  for (let i = 0; i < 400; i++) {
    if (esLaborable(d, festivosSet) && !vacacionesSet.has(toISO(d))) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function avanzarUnDiaLaborable(date, festivosSet, vacacionesSet) {
  const d = new Date(date);
  do { d.setDate(d.getDate() + 1); }
  while (!esLaborable(d, festivosSet) || vacacionesSet.has(toISO(d)));
  return d;
}

/**
 * Reparte fechas estimadas respetando: solo días laborables (sin sábados,
 * domingos ni festivos), máximo MAX_HORAS_PROYECTO_DIA horas de proyecto por
 * día, y partiendo en varios días las tareas que superen ese tope.
 * El parámetro `meses` ya no fuerza el escalonado: la duración real depende
 * de la carga de horas; se conserva la firma por compatibilidad.
 * @param tareas array con {horas, bloque, ...} ya ordenadas
 * @param fechaInicioISO inicio del proyecto
 * @param _meses (no se usa para el límite; se mantiene por compatibilidad)
 * @param opts {festivos:[], vacaciones:Set}
 */
export function repartirFechas(tareas, fechaInicioISO, _meses = 3, opts = {}) {
  if (!tareas.length) return tareas;
  const festivosSet = new Set((opts.festivos && opts.festivos.length ? opts.festivos : FESTIVOS_2026).map(f => f.fecha || f));
  const vacacionesSet = opts.vacaciones instanceof Set ? opts.vacaciones : new Set(opts.vacaciones || []);

  let dia = primerLaborable(fechaInicioISO ? new Date(fechaInicioISO) : new Date(), festivosSet, vacacionesSet);
  let usadasHoy = 0;

  return tareas.map((t, i) => {
    let horas = Number(t.horas) || 0;
    // Si el día ya está lleno, saltar al siguiente laborable.
    if (usadasHoy >= MAX_HORAS_PROYECTO_DIA) {
      dia = avanzarUnDiaLaborable(dia, festivosSet, vacacionesSet);
      usadasHoy = 0;
    }
    const fechaInicioTarea = toISO(dia);
    // Consumir capacidad; si la tarea es más larga que lo que queda + días enteros,
    // avanzar tantos días laborables como haga falta (parte la tarea en varios días).
    let restante = horas;
    let libreHoy = MAX_HORAS_PROYECTO_DIA - usadasHoy;
    while (restante > libreHoy && libreHoy >= 0) {
      restante -= libreHoy;
      dia = avanzarUnDiaLaborable(dia, festivosSet, vacacionesSet);
      libreHoy = MAX_HORAS_PROYECTO_DIA;
    }
    usadasHoy = (libreHoy === MAX_HORAS_PROYECTO_DIA ? 0 : MAX_HORAS_PROYECTO_DIA - libreHoy) + restante;
    return { ...t, fecha_estimada: fechaInicioTarea, orden: i };
  });
}

function repartirFechas_legacy(tareas, fechaInicioISO, meses = 3) {
  if (!tareas.length) return tareas;
  const bloques = [...new Set(tareas.map(t => t.bloque))];
  const inicio = fechaInicioISO ? new Date(fechaInicioISO) : new Date();
  const totalDias = Math.max(1, Math.round((Number(meses) || 1) * 30));
  const paso = totalDias / bloques.length;
  const fechaDe = (i) => {
    const d = new Date(inicio);
    d.setDate(d.getDate() + Math.round(i * paso));
    return d.toISOString().slice(0, 10);
  };
  const fechaPorBloque = Object.fromEntries(bloques.map((b, i) => [b, fechaDe(i)]));
  return tareas.map((t, i) => ({ ...t, fecha_estimada: fechaPorBloque[t.bloque], orden: i }));
}

// Coordinación del proyecto: 0,5 h × nº sistemas × meses (todos los modelos).
export function horasCoordinacion(nSistemas, meses) {
  return Math.round(0.5 * nSistemas * Math.max(Number(meses) || 1, 1) * 100) / 100;
}
