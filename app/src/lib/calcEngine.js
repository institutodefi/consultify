// ============================================================
// MOTOR DE CÁLCULO CONSULTIFY · v2026-06
// Criterios confirmados en el chat "Modelos de apoyo" (jun 2026)
// Verificado: 9001 Relación=264→350cat · 9+14 Impl.=968→975 ·
// 9+14+45 Impl.=1.312→1.325 · 9+14+27+45 Rel.=696→700
// ============================================================

export const NORMAS = [
  { id: '9001',     nombre: 'ISO 9001',  desc: 'Gestión de la calidad',          nivel: 'J3', hApoyo: 34 },
  { id: '14001',    nombre: 'ISO 14001', desc: 'Gestión ambiental',              nivel: 'J3', hApoyo: 46 },
  { id: '45001',    nombre: 'ISO 45001', desc: 'Seguridad y salud laboral',      nivel: 'J2', hApoyo: 63 },
  { id: '27001',    nombre: 'ISO 27001', desc: 'Seguridad de la información',    nivel: 'J2', hApoyo: 81 },
  { id: '42001',    nombre: 'ISO 42001', desc: 'Inteligencia artificial',        nivel: 'J3', hApoyo: 42 },
  { id: '56001',    nombre: 'ISO 56001', desc: 'Gestión de la innovación',       nivel: 'J3', hApoyo: 75 },
  { id: '21001',    nombre: 'ISO 21001', desc: 'Organizaciones educativas · complementaria a ISO 9001', nivel: 'J3', hApoyo: 19, solape9001: 0.5 },
  { id: '9004',     nombre: 'ISO 9004',  desc: 'Calidad sostenible · complementaria a ISO 9001', nivel: 'J3', hApoyo: 11, solape9001: 0.5 },
  { id: 'une93200', nombre: 'UNE 93200', desc: 'Cartas de Servicios',            nivel: 'J3', hApoyo: 25 },
  { id: 'une158101', nombre: 'UNE 158101', desc: 'Gestión de centros residenciales', nivel: 'J3', hApoyo: 91 },
  { id: 'une66181', nombre: 'UNE 66181', desc: 'Calidad de la formación virtual', nivel: 'J3', hApoyo: 30 },
  { id: 'igualdad', nombre: 'Plan de Igualdad', desc: 'Plan de igualdad de empresa', nivel: 'J3', hApoyo: 30 },
  { id: 'madridexcelente', nombre: 'Madrid Excelente', desc: 'Marca de garantía de la Comunidad de Madrid', nivel: 'J3', hApoyo: 30 },
];

export const NORMA_BY_ID = Object.fromEntries(NORMAS.map(n => [n.id, n]));

export const TARIFA = { J1: 30, J2: 40, J3: 55, Senior: 75 };
export const MARGEN = 0.60;
export const IVA = 0.21;
export const ACOMPANAMIENTO_AUDITORIA_DIA = 600; // €/jornada, siempre aparte

// ── Eficiencia por categoría (coeficiente de tiempo sobre tarea base) ──
// Una tarea "tipo" de N horas le cuesta a cada nivel: N × COEF.
// J1 emplea el 100%, J2 el 75%, J3 el 50%, Senior el 40%.
export const EFICIENCIA = { J1: 1.00, J2: 0.75, J3: 0.50, Senior: 0.40 };
// Rendimiento = horas productivas equivalentes por hora real (1/coef).
export const RENDIMIENTO = {
  J1: 1 / EFICIENCIA.J1, J2: 1 / EFICIENCIA.J2, J3: 1 / EFICIENCIA.J3, Senior: 1 / EFICIENCIA.Senior,
};

// Reparto de jornada (coherente con la Agenda)
export const PCT_PRODUCTIVO = 0.70;

// Horas que le cuesta a un nivel una tarea cuya base son `horasBase`
export const horasPorNivel = (horasBase, nivel) => horasBase * (EFICIENCIA[nivel] ?? 1);

export const MODELOS = {
  Apoyo: {
    id: 'Apoyo', tipo: 'bolsa', hSist: null, hPres: 0, paso: 100, suelo: 0,
    titulo: 'Apoyo',
    claim: 'Bolsa de horas prepagada',
    leyenda: 'Pago único prepagado al 100 %. No contratable a menos de 60 días de una auditoría externa. Acompañamiento a auditoría aparte (600 €/jornada).',
  },
  Relación: {
    id: 'Relación', tipo: 'mes', hSist: 2, hPres: 0, paso: 25, suelo: 350,
    titulo: 'Relación',
    claim: '2 h online / sistema / mes',
    leyenda: 'Cuota mensual recurrente. Permanencia mínima 12 meses.',
  },
  Implicación: {
    id: 'Implicación', tipo: 'mes', hSist: 4, hPres: 2, paso: 25, suelo: 350,
    titulo: 'Implicación',
    claim: '4 h online / sistema + 2 h presenciales / mes',
    leyenda: 'Cuota mensual recurrente. Permanencia mínima 12 meses.',
    destacado: true,
  },
  Compromiso: {
    id: 'Compromiso', tipo: 'mes', hSist: 6, hPres: 2, paso: 25, suelo: 350,
    titulo: 'Compromiso',
    claim: '6 h online / sistema + 2 h presenciales / mes',
    leyenda: 'Cuota mensual recurrente. Permanencia mínima 12 meses.',
  },
  Implantación: {
    id: 'Implantación', tipo: 'mes', hSist: 2.4, hPres: 1.2, paso: 25, suelo: 350,
    titulo: 'Implantación',
    claim: 'Implicación × 0,6 durante la implantación',
    leyenda: 'Cuota durante la fase de implantación (3–6 meses). Al finalizar, se pasa a un modelo de mantenimiento.',
  },
};

export const MODELO_IDS = Object.keys(MODELOS);

// Duración por defecto (meses) de cada modelo de relación ("acuerdo").
export const MESES_MODELO = {
  Apoyo: 3,
  Implantación: 12,
  Relación: 12,
  Implicación: 12,
  Compromiso: 12,
};

// Duración mínima según modelo y nº de sistemas.
// Apoyo: 2 sistemas → 3 meses; más de 2 → mínimo 4 meses.
export function mesesPorModelo(modelo, nSistemas = 1) {
  if (modelo === 'Apoyo') return nSistemas > 2 ? 4 : 3;
  return MESES_MODELO[modelo] || 3;
}

/**
 * Calcula horas y precio para una combinación de normas y un modelo.
 * Reglas:
 *  - Horas online por sistema según nivel de la norma (J2/J3).
 *  - Horas presenciales por CLIENTE (no por sistema), asignadas al nivel
 *    líder (J3 si hay alguna norma J3; si no, J2).
 *  - Coordinación = 10 % de las horas de entrega → J3 si ≤4 sistemas,
 *    Senior si ≥5.
 *  - Redondeo de horas hacia arriba (entero) por nivel.
 *  - Precio exacto = coste × (1 + 60 %).
 *  - Precio catálogo = redondeo hacia arriba al paso (25 € recurrentes,
 *    100 € Apoyo) con suelo de 350 €/mes en recurrentes.
 */
export function calcular(normaIds, modeloId, opts = {}) {
  const m = MODELOS[modeloId];
  if (!m || !normaIds?.length) return null;
  const normas = normaIds.map(id => NORMA_BY_ID[id]).filter(Boolean);
  if (!normas.length) return null;

  // Factor de descuento sobre la 9001 si el cliente ya la tiene certificada (−50% en horas).
  const tiene9001 = !!opts.tiene9001;
  const f9001 = tiene9001 ? 0.5 : 1;

  // Meses del proyecto: los indicados o el mínimo del modelo.
  const minMeses = mesesPorModelo(modeloId, normas.length);
  const mesesProyecto = Math.max(parseInt(opts.meses, 10) || minMeses, 1);
  // Validación de plazo mínimo (no bloquea el cálculo; el front decide si genera).
  const plazoOk = mesesProyecto >= minMeses;

  const raw = { J2: 0, J3: 0, Senior: 0 };

  if (m.tipo === 'bolsa') {
    for (const n of normas) raw[n.nivel] += n.hApoyo * (n.id === '9001' ? f9001 : 1);
  } else {
    for (const n of normas) raw[n.nivel] += m.hSist * (n.solape9001 ?? 1) * (n.id === '9001' ? f9001 : 1);
    if (m.hPres > 0) {
      const lider = normas.some(n => n.nivel === 'J3') ? 'J3' : 'J2';
      raw[lider] += m.hPres; // por cliente, no por sistema
    }
  }

  const coord = (raw.J2 + raw.J3) * 0.10;
  if (normas.length <= 4) raw.J3 += coord;
  else raw.Senior += coord;

  const h = {
    J2: Math.ceil(raw.J2),
    J3: Math.ceil(raw.J3),
    Senior: Math.ceil(raw.Senior),
  };
  const hTotal = h.J2 + h.J3 + h.Senior;
  const coste = h.J2 * TARIFA.J2 + h.J3 * TARIFA.J3 + h.Senior * TARIFA.Senior;
  const precioExacto = Math.round(coste * (1 + MARGEN));

  let precioCatalogo = Math.ceil(precioExacto / m.paso) * m.paso;
  if (m.suelo > 0) precioCatalogo = Math.max(m.suelo, precioCatalogo);

  const iva = Math.round(precioCatalogo * IVA * 100) / 100;
  const totalConIva = Math.round((precioCatalogo + iva) * 100) / 100;

  // Implantación: pago único fraccionado en 3 tramos:
  // 50% por adelantado, 25% a mitad del proyecto, 25% al final.
  // El importe total es la cuota mensual × meses de implantación.
  let fraccionado = null;
  if (modeloId === 'Implantación') {
    const totalSinIva = precioCatalogo * mesesProyecto;
    const totalConIvaFrac = Math.round(totalSinIva * (1 + IVA) * 100) / 100;
    const r2 = (x) => Math.round(x * 100) / 100;
    const cuota1 = r2(totalConIvaFrac * 0.50);   // 50% por adelantado
    const cuota2 = r2(totalConIvaFrac * 0.25);   // 25% a mitad de proyecto
    const cuota3 = r2(totalConIvaFrac - cuota1 - cuota2); // 25% al final (ajuste de redondeo)
    fraccionado = {
      meses: mesesProyecto,
      totalSinIva,
      totalConIva: totalConIvaFrac,
      cuota1, cuota2, cuota3,
      plan: '50 % por adelantado · 25 % a mitad de proyecto · 25 % al finalizar',
    };
  }

  return {
    modelo: modeloId,
    tipo: m.tipo,                 // 'bolsa' → pago único · 'mes' → cuota mensual
    cobro: modeloId === 'Implantación' ? 'fraccionado' : m.tipo,
    normas: normas.map(n => n.id),
    nSistemas: normas.length,
    meses: mesesProyecto,
    minMeses,
    plazoOk,
    tiene9001,
    horas: h,
    hTotal,
    coste,
    precioExacto,
    precioCatalogo,
    iva,
    totalConIva,
    fraccionado,
    leyenda: m.leyenda,
  };
}

/** Compara los 5 modelos para una misma combinación de normas. */
export function compararModelos(normaIds) {
  return MODELO_IDS.map(mid => calcular(normaIds, mid)).filter(Boolean);
}

export const fmtEUR = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
