// ═══════════════════════════════════════════════════════════════════
// CATÁLOGO DE NORMAS Y MODELOS — constantes del negocio (v3.1)
// ═══════════════════════════════════════════════════════════════════

export const NORMAS = [
  { id: '9001',     nombre: 'ISO 9001',  descripcion: 'Calidad',                   nivel: 'J3', h_apoyo: 34 },
  { id: '14001',    nombre: 'ISO 14001', descripcion: 'Medio ambiente',            nivel: 'J3', h_apoyo: 46 },
  { id: '9004',     nombre: 'ISO 9004',  descripcion: 'Calidad sostenible',        nivel: 'J3', h_apoyo: 22 },
  { id: '42001',    nombre: 'ISO 42001', descripcion: 'Inteligencia artificial',   nivel: 'J3', h_apoyo: 42 },
  { id: '56001',    nombre: 'ISO 56001', descripcion: 'Gestión de la innovación',  nivel: 'J3', h_apoyo: 75 },
  { id: '21001',    nombre: 'ISO 21001', descripcion: 'Organizaciones educativas', nivel: 'J3', h_apoyo: 38 },
  { id: 'une93200', nombre: 'UNE 93200', descripcion: 'Cartas de Servicios',       nivel: 'J3', h_apoyo: 25 },
  { id: '45001',    nombre: 'ISO 45001', descripcion: 'Seguridad y salud',         nivel: 'J2', h_apoyo: 63 },
  { id: '27001',    nombre: 'ISO 27001', descripcion: 'Seguridad de la información',nivel: 'J2', h_apoyo: 81 },
];

export const NORMA_BY_ID = Object.fromEntries(NORMAS.map((n) => [n.id, n]));

export const TARIFA = { J1: 30, J2: 40, J3: 55, Senior: 75 }; // €/h interno
export const MARGEN = 0.6;          // margen fijo sobre precio (precio = coste / (1 − margen))
export const SUELO_MENSUAL = 350;   // € mínimo cliente en modelos recurrentes
export const IVA = 0.21;
export const ACOMPAÑAMIENTO_AUDITORIA = 600; // €/día, se factura aparte

// h_sist = h online/sistema/mes · h_pres = h presenciales/CLIENTE/mes
// tipo: 'bolsa' (Apoyo, pago único 100% anticipado) | 'mes' (recurrente)
// pcat: redondeo de catálogo (múltiplo) · suelo: precio mínimo
export const MODELOS = {
  Apoyo:        { h_sist: null, h_pres: 0,   tipo: 'bolsa', pcat: 100, suelo: 0 },
  Relación:     { h_sist: 2,    h_pres: 0,   tipo: 'mes',   pcat: 25,  suelo: SUELO_MENSUAL },
  Implicación:  { h_sist: 4,    h_pres: 2,   tipo: 'mes',   pcat: 25,  suelo: SUELO_MENSUAL },
  Compromiso:   { h_sist: 6,    h_pres: 2,   tipo: 'mes',   pcat: 25,  suelo: SUELO_MENSUAL },
  Implantación: { h_sist: 2.4,  h_pres: 1.2, tipo: 'mes',   pcat: 25,  suelo: SUELO_MENSUAL },
};

export const NOMBRES_MODELOS = Object.keys(MODELOS);

export const COLORES_MODELO = {
  Apoyo: '#94A3B8', Relación: '#38BDF8', Implicación: '#F5A623',
  Compromiso: '#061B45', Implantación: '#10B981',
};
