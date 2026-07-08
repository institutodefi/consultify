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

// Mínimo de duración de un proyecto, en meses.
export const MIN_MESES_PROYECTO = 3;

// Cuenta días laborables entre dos fechas (incl. inicio, excl. fin).
function laborablesEntre(desde, hasta, festivosSet, vacacionesSet) {
  const d = new Date(desde); let n = 0;
  while (d < hasta) {
    if (esLaborable(d, festivosSet) && !vacacionesSet.has(toISO(d))) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/**
 * Reparte fechas estimadas respetando: solo días laborables (sin sábados,
 * domingos ni festivos), máximo MAX_HORAS_PROYECTO_DIA horas de proyecto por día,
 * partiendo tareas largas, y un MÍNIMO de 3 meses de duración: si la carga
 * cabe en menos, las tareas se espacian para distribuirse a lo largo de los
 * 3 meses en vez de amontonarse al principio.
 * @param opts {festivos:[], vacaciones:Set, meses:number}
 */
export function repartirFechas(tareas, fechaInicioISO, mesesArg = 3, opts = {}) {
  if (!tareas.length) return tareas;
  const festivosSet = new Set((opts.festivos && opts.festivos.length ? opts.festivos : FESTIVOS_2026).map(f => f.fecha || f));
  const vacacionesSet = opts.vacaciones instanceof Set ? opts.vacaciones : new Set(opts.vacaciones || []);
  const meses = Math.max(MIN_MESES_PROYECTO, Number(opts.meses ?? mesesArg) || MIN_MESES_PROYECTO);
  // Carga previa por día (fecha ISO -> horas ya ocupadas por el consultor en otros clientes).
  const cargaPrevia = opts.cargaPrevia instanceof Map ? opts.cargaPrevia : new Map(Object.entries(opts.cargaPrevia || {}));

  const ocupadasEn = (iso) => Number(cargaPrevia.get(iso) || 0);
  const libreEn = (iso) => Math.max(0, MAX_HORAS_PROYECTO_DIA - ocupadasEn(iso));

  // Primer día laborable con AL MENOS algo de hueco libre.
  const primerConHueco = (date) => {
    let d = primerLaborable(date, festivosSet, vacacionesSet);
    for (let i = 0; i < 800; i++) {
      if (libreEn(toISO(d)) > 1e-6) return d;
      d = avanzarUnDiaLaborable(d, festivosSet, vacacionesSet);
    }
    return d;
  };

  const inicio = primerConHueco(fechaInicioISO ? new Date(fechaInicioISO) : new Date());
  const finVentana = new Date(inicio); finVentana.setDate(finVentana.getDate() + Math.round(meses * 30));
  const finVentanaISO = toISO(finVentana);
  // Tope duro: si opts.topeMeses es true, ninguna tarea se coloca más allá de finVentana.
  const topeDuro = opts.topeMeses === true;
  const labVentana = Math.max(1, laborablesEntre(inicio, finVentana, festivosSet, vacacionesSet));
  const totalHoras = tareas.reduce((s, t) => s + (Number(t.horas) || 0), 0);
  const labCarga = Math.max(1, Math.ceil(totalHoras / MAX_HORAS_PROYECTO_DIA));
  const diasObjetivo = Math.max(labVentana, labCarga);
  const espaciar = diasObjetivo > labCarga;
  const saltoDias = espaciar ? Math.max(1, Math.floor(diasObjetivo / tareas.length)) : 0;

  let dia = new Date(inicio);
  // horas ya colocadas hoy por ESTE reparto (se suman a la carga previa).
  let puestasHoy = 0;

  const avanzarHueco = () => {
    do { dia = avanzarUnDiaLaborable(dia, festivosSet, vacacionesSet); puestasHoy = 0; }
    while (libreEn(toISO(dia)) <= 1e-6);
  };

  return tareas.map((t, i) => {
    const horas = Number(t.horas) || 0;
    const isoHoy = toISO(dia);
    let libreHoy = libreEn(isoHoy) - puestasHoy;

    if (espaciar && i > 0) { for (let k = 0; k < saltoDias; k++) avanzarHueco(); libreHoy = libreEn(toISO(dia)) - puestasHoy; }
    else if (libreHoy <= 1e-6) { avanzarHueco(); libreHoy = libreEn(toISO(dia)) - puestasHoy; }

    const fechaInicioTarea = toISO(dia);
    // Tramos: si la tarea no cabe en el hueco del día (6h − carga previa − puestas),
    // se reparte en varios días → seguimientos.
    const tramos = [];
    let restante = horas;
    while (restante > libreHoy + 1e-6) {
      if (libreHoy > 1e-6) { tramos.push({ fecha: toISO(dia), horas: Math.round(libreHoy * 100) / 100 }); restante -= libreHoy; }
      avanzarHueco();
      libreHoy = libreEn(toISO(dia)) - puestasHoy;
    }
    tramos.push({ fecha: toISO(dia), horas: Math.round(restante * 100) / 100 });
    puestasHoy += restante;

    // Si hay tope duro y esta tarea cae más allá del fin de ventana, se marca.
    const fueraDePlazo = topeDuro && fechaInicioTarea > finVentanaISO;

    return { ...t, fecha_estimada: fechaInicioTarea, tramos, orden: i, fuera_de_plazo: fueraDePlazo };
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

// Código de tarea integrada: "Cliente - Modelo - Proceso - Subproceso - Integrada n1 n2…"
export function codigoTareaIntegrada(cliente, modelo, proceso, subproceso, normas) {
  const base = [cliente, modelo, proceso, subproceso].filter(Boolean).join(' - ');
  if (normas && normas.length > 1) return `${base} - Integrada ${normas.join(' ')}`;
  return base;
}

/**
 * Anida tareas comunes por (proceso+subproceso) entre las normas del proyecto.
 * Las que comparten proceso+subproceso en ≥2 normas se funden en una tarea
 * integrada (norma base = la primera del array `normas`), con horas = suma.
 * Las que solo existen en una norma quedan individuales.
 * @param tareas array de tareasDeCliente (una por norma+subproceso)
 * @param normasOrden orden de prioridad de normas (la 1ª es la base)
 * @param anidar Set de claves "proceso|subproceso" que el usuario decidió anidar
 */
export function anidarTareas(tareas, normasOrden = [], anidar = null) {
  const rank = (n) => { const i = normasOrden.indexOf(n); return i < 0 ? 999 : i; };
  const grupos = new Map();
  for (const t of tareas) {
    const k = `${t.proceso}|${t.subproceso}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(t);
  }
  const out = [];
  for (const [k, items] of grupos) {
    const seAnida = items.length > 1 && (!anidar || anidar.has(k));
    if (seAnida) {
      const ordenadas = [...items].sort((a, b) => rank(a.norma_id) - rank(b.norma_id));
      const normas = ordenadas.map(x => x.norma_id);
      const horas = Math.round(ordenadas.reduce((s, x) => s + (Number(x.horas) || 0), 0) * 100) / 100;
      const base = ordenadas[0];
      out.push({
        ...base, horas, integrada: true, normas_integradas: normas,
        norma_id: base.norma_id, _clave: k,
      });
    } else {
      for (const t of items) out.push({ ...t, integrada: false, normas_integradas: [t.norma_id], _clave: k });
    }
  }
  return out;
}

// Tamaño de bloque de ejecución por defecto (horas).
export const HORAS_BLOQUE = 4;

// Trocea una cantidad de horas en bloques de 4h (el último con el resto).
// 20→[4,4,4,4,4] · 3→[3] · 10→[4,4,2]
export function trocearEnBloques(horas, tam = HORAS_BLOQUE) {
  const h = Number(horas) || 0;
  if (h <= 0) return [];
  if (h <= tam) return [Math.round(h * 100) / 100];
  const bloques = [];
  let resto = h;
  while (resto > tam + 1e-6) { bloques.push(tam); resto -= tam; }
  bloques.push(Math.round(resto * 100) / 100);
  return bloques;
}

// Genera los bloques de ejecución de una tarea con fechas autopropuestas.
export function bloquesEjecucion(horas, fechaInicioISO, opts = {}) {
  const tam = opts.tam || HORAS_BLOQUE;
  const trozos = trocearEnBloques(horas, tam);
  if (!trozos.length) return [];
  const comoTareas = trozos.map((h, i) => ({ horas: h, bloque: 'BLK', orden: i }));
  const colocadas = repartirFechas(comoTareas, fechaInicioISO, opts.meses || 3, {
    festivos: opts.festivos, vacaciones: opts.vacaciones, cargaPrevia: opts.cargaPrevia, meses: opts.meses,
  });
  return colocadas.map(c => ({ horas: c.horas, fecha: c.fecha_estimada }));
}

// Código legible de tarea/bloque: "CLI001-T005-B2".
// codigoCliente: el código del cliente (o 'CLI' si no tiene).
// nTarea: posición de la tarea en el proyecto (1-based).
// nBloque: posición del bloque (1-based); si se omite, solo "CLI001-T005".
export function codigoTarea(codigoCliente, nTarea, nBloque) {
  const cli = (codigoCliente || 'CLI').toString().trim().toUpperCase().replace(/\s+/g, '');
  const t = `T${String(nTarea).padStart(3, '0')}`;
  return nBloque ? `${cli}-${t}-B${nBloque}` : `${cli}-${t}`;
}
