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
export function repartirFechas(tareas, fechaInicioISO, meses = 3) {
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
