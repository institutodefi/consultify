// ═══════════════════════════════════════════════════════════════════
// MOTOR DE CÁLCULO DE LA CALCULADORA
//   · Horas por nivel (J2/J3) según normas y modelo
//   · Presenciales: por CLIENTE (una vez), al nivel más alto presente
//   · Coordinación: +10% de horas → J3 si ≤4 sistemas, Senior si ≥5
//   · Horas redondeadas al entero superior por nivel
//   · Precio = coste / (1 − 60%) · Catálogo: múltiplo 25 € (100 € Apoyo)
//     con suelo de 350 €/mes en recurrentes
// ═══════════════════════════════════════════════════════════════════
import { NORMA_BY_ID, MODELOS, TARIFA, MARGEN, IVA } from './catalogo';

export function calcular(normasIds, modelo) {
  if (!normasIds.length) return null;
  const p = MODELOS[modelo];
  const n = normasIds.length;
  const niveles = normasIds.map((id) => NORMA_BY_ID[id].nivel);

  let hJ2 = 0, hJ3 = 0;

  if (modelo === 'Apoyo') {
    for (const id of normasIds) {
      const norma = NORMA_BY_ID[id];
      if (norma.nivel === 'J2') hJ2 += norma.h_apoyo;
      else hJ3 += norma.h_apoyo;
    }
  } else {
    hJ2 = p.h_sist * niveles.filter((x) => x === 'J2').length;
    hJ3 = p.h_sist * niveles.filter((x) => x === 'J3').length;
    if (p.h_pres > 0) {
      if (niveles.includes('J3')) hJ3 += p.h_pres; // presencial por cliente, nivel más alto
      else hJ2 += p.h_pres;
    }
  }

  // Coordinación: 10% del total de horas
  const nivelCoord = n >= 5 ? 'Senior' : 'J3';
  let hCoord = 0.1 * (hJ2 + hJ3);

  // Redondeo al entero superior por nivel
  hJ2 = Math.ceil(hJ2);
  hJ3 = Math.ceil(hJ3);
  hCoord = Math.ceil(hCoord);

  const hTotal = hJ2 + hJ3 + hCoord;
  const coste = hJ2 * TARIFA.J2 + hJ3 * TARIFA.J3 + hCoord * TARIFA[nivelCoord];
  const precioExacto = coste / (1 - MARGEN);

  const bruto = Math.ceil(precioExacto / p.pcat) * p.pcat;
  const precioCatalogo = Math.max(bruto, p.suelo);

  return {
    modelo,
    tipo: p.tipo,                  // 'bolsa' (pago único) | 'mes'
    hJ2, hJ3, hCoord, nivelCoord, hTotal,
    coste,
    precioExacto,
    precioCatalogo,
    precioConIva: precioCatalogo * (1 + IVA),
    margenEur: precioCatalogo - coste,
    margenPct: precioCatalogo > 0 ? (precioCatalogo - coste) / precioCatalogo : 0,
  };
}

export const eur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export const eur2 = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
