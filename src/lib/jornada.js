// ═══════════════════════════════════════════════════════════════════
// MOTOR DE JORNADA — XIX Convenio Consultorías 2025-2027
//   · 1.800 h de trabajo efectivo en cómputo anual (tope legal)
//   · Jornada estándar 40 h/semana (8 h/día), máx. 9 h ordinarias/día
//   · Agosto: jornada intensiva 36 h/semana (7,2 h/día)
//   · Vacaciones: 23 días laborables (22 si ≥2 meses de intensiva)
//
// Tareas (v2): fecha_prevista/horas_previstas (plan) y
//              fecha_efectiva/horas_reales (ejecución real)
// ═══════════════════════════════════════════════════════════════════

export const TOPE_ANUAL = 1800;
export const MAX_HORAS_DIA = 9;
export const HORAS_DIA_ESTANDAR = 8;    // 40 h/semana
export const HORAS_DIA_AGOSTO = 7.2;    // 36 h/semana
export const DIAS_VACACIONES = 23;      // 22 si ≥2 meses intensiva

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const hoyISO = () => toISO(new Date());

/** ¿Día laborable? (L-V y no festivo) */
export function esLaborable(date, festivosSet) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  return !festivosSet.has(toISO(date));
}

/** Horas de convenio de un día concreto (agosto = intensiva) */
export function horasDia(date) {
  return date.getMonth() === 7 ? HORAS_DIA_AGOSTO : HORAS_DIA_ESTANDAR;
}

/** Días del mes como objetos Date */
export function diasDelMes(year, month) {
  const out = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const enMes = (iso, year, month) =>
  iso && iso.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`);

/**
 * Resumen de un mes para un consultor.
 *  - previstas: Σ horas_previstas por fecha_prevista
 *  - reales:    Σ horas_reales   por fecha_efectiva
 */
export function resumenMes(year, month, festivosSet, vacacionesSet, tareas) {
  let laborables = 0;
  let horasConvenio = 0;
  let horasVacaciones = 0;
  let diasVacaciones = 0;

  for (const d of diasDelMes(year, month)) {
    if (!esLaborable(d, festivosSet)) continue;
    laborables += 1;
    const h = horasDia(d);
    horasConvenio += h;
    if (vacacionesSet.has(toISO(d))) {
      horasVacaciones += h;
      diasVacaciones += 1;
    }
  }

  let previstas = 0;
  let reales = 0;
  for (const t of tareas) {
    if (enMes(t.fecha_prevista, year, month)) previstas += Number(t.horas_previstas);
    if (t.horas_reales && enMes(t.fecha_efectiva, year, month)) reales += Number(t.horas_reales);
  }

  const objetivo = horasConvenio - horasVacaciones;        // lo que debe trabajar
  const disponibles = Math.max(0, objetivo - previstas);   // hueco libre de plan

  return {
    laborables, horasConvenio, horasVacaciones, diasVacaciones,
    objetivo, previstas, reales, disponibles,
    desviacion: reales - previstas,
  };
}

/** Resumen anual: 12 meses + totales + proyección predictiva. */
export function resumenAnual(year, festivosSet, vacacionesSet, tareas) {
  const meses = [];
  for (let m = 0; m < 12; m++) {
    meses.push({ mes: m, nombre: MESES[m], ...resumenMes(year, m, festivosSet, vacacionesSet, tareas) });
  }

  const total = meses.reduce(
    (acc, m) => ({
      horasConvenio: acc.horasConvenio + m.horasConvenio,
      horasVacaciones: acc.horasVacaciones + m.horasVacaciones,
      diasVacaciones: acc.diasVacaciones + m.diasVacaciones,
      objetivo: acc.objetivo + m.objetivo,
      previstas: acc.previstas + m.previstas,
      reales: acc.reales + m.reales,
    }),
    { horasConvenio: 0, horasVacaciones: 0, diasVacaciones: 0, objetivo: 0, previstas: 0, reales: 0 },
  );

  // ── Reloj predictivo ──────────────────────────────────────────────
  // Proyección fin de año =
  //   horas REALES imputadas
  //   + horas PREVISTAS de tareas aún sin horas reales
  //   + ritmo real (h reales / día laborable transcurrido) × laborables
  //     futuros sin ninguna tarea (huecos sin planificar)
  const hoy = hoyISO();
  const diasOcupados = new Set();
  for (const t of tareas) {
    if (t.fecha_prevista) diasOcupados.add(t.fecha_prevista);
    if (t.fecha_efectiva) diasOcupados.add(t.fecha_efectiva);
  }

  let labPasados = 0, labFuturosSinTarea = 0;
  for (let m = 0; m < 12; m++) {
    for (const d of diasDelMes(year, m)) {
      if (!esLaborable(d, festivosSet) || vacacionesSet.has(toISO(d))) continue;
      const iso = toISO(d);
      if (iso <= hoy) labPasados += 1;
      else if (!diasOcupados.has(iso)) labFuturosSinTarea += 1;
    }
  }

  let realesTotal = 0, previstoSinCerrar = 0;
  for (const t of tareas) {
    if (t.horas_reales) realesTotal += Number(t.horas_reales);
    else previstoSinCerrar += Number(t.horas_previstas);
  }

  const ritmo = labPasados > 0 ? realesTotal / labPasados : 0; // h reales/día laborable
  const proyeccion = realesTotal + previstoSinCerrar + ritmo * labFuturosSinTarea;

  return {
    meses,
    total,
    tope: TOPE_ANUAL,
    excesoSobreTope: Math.max(0, total.objetivo - TOPE_ANUAL),
    pctPrevisto: (total.previstas / TOPE_ANUAL) * 100,
    pctReal: (total.reales / TOPE_ANUAL) * 100,
    ritmo,
    proyeccion,
    pctProyeccion: (proyeccion / TOPE_ANUAL) * 100,
  };
}
