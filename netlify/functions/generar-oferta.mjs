// netlify/functions/generar-oferta.mjs
// Genera la oferta (PDF + PPTX) a partir de normas + modelo + datos de cliente,
// la sube a Supabase Storage (bucket 'ofertas') y devuelve las URLs públicas.
//
// Variables de entorno requeridas en Netlify:
//   VITE_SUPABASE_URL      → URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE  → service role key (solo backend, NUNCA en el front)
//
// Requiere el bucket 'ofertas' (público) creado en Supabase Storage
// (ver migracion-v25-storage-ofertas.sql).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';
import { CATALOGO_ANEXO } from './catalogo-anexo.mjs';
import { generarPDFOferta } from './documento-oferta.mjs';
import { LOGO_CONSULTIFY, LOGO_TUCONSULTOR } from './logos-oferta.mjs';

// Mapa de prefijo de proceso → nombre de bloque legible (para agrupar el Anexo I).
const BLOQUES = {
  PE1: 'Planificación estratégica', PE2: 'Evaluación del desempeño', PE3: 'Mejora continua',
  PE4: 'Gestión de la cartera de innovación', PE5: 'Gobernanza de IA',
  PA1: 'Gestión de personas', PA2: 'Gestión medioambiental', PA3: 'Gestión del conocimiento e información',
  PA4: 'Gestión de infraestructuras y activos', PA5: 'Gestión de seguridad de la información',
  PA6: 'Gestión de partes subcontratadas', PA7: 'Gestión económica y administrativa',
  PA8: 'Gestión de PI y vigilancia', PA9: 'Gestión de alianzas', PA10: 'Gestión de datos para IA',
  PA11: 'Información a partes interesadas', PA12: 'Uso responsable de IA', PA13: 'Relaciones con terceros',
  PI1: 'Proceso de innovación', PI2: 'Gestión de iniciativas de innovación', PI3: 'Ciclo de vida del sistema de IA',
  PR1: 'Incorporación de usuarios', PR2: 'Atención al usuario', PR3: 'Baja y servicios generales',
};
// Agrupa los subprocesos del modelo (solo los que aplican a las normas elegidas) por bloque legible.
function tareasPorBloque(normaIds, modeloId) {
  const filas = CATALOGO_ANEXO[modeloId] || CATALOGO_ANEXO['Implantación'] || [];
  const grupos = new Map();
  for (const f of filas) {
    const aplica = f.normas.some((id) => normaIds.includes(id));
    if (!aplica) continue;
    const pref = (f.proc.split(' ')[0] || '').toUpperCase();
    const bloque = BLOQUES[pref] || f.proc;
    if (!grupos.has(bloque)) grupos.set(bloque, []);
    // Limpiar el nombre del subproceso (quitar prefijo Sx y código) para legibilidad
    const limpio = f.sub.replace(/^S\d+\s+/, '').replace(/\s*\(.*?\)\s*$/, '').trim();
    grupos.get(bloque).push(limpio);
  }
  return [...grupos.entries()].map(([bloque, subs]) => ({ bloque, subs }));
}

// ======================= MOTOR (réplica de calcEngine.js) =======================
const NORMAS = [
  { id: '9001', nombre: 'ISO 9001', desc: 'Gestión de la calidad', nivel: 'J3', hApoyo: 34 },
  { id: '14001', nombre: 'ISO 14001', desc: 'Gestión ambiental', nivel: 'J3', hApoyo: 46 },
  { id: '45001', nombre: 'ISO 45001', desc: 'Seguridad y salud laboral', nivel: 'J2', hApoyo: 63 },
  { id: '27001', nombre: 'ISO 27001', desc: 'Seguridad de la información', nivel: 'J2', hApoyo: 81 },
  { id: '42001', nombre: 'ISO 42001', desc: 'Inteligencia artificial', nivel: 'J3', hApoyo: 42 },
  { id: '56001', nombre: 'ISO 56001', desc: 'Gestión de la innovación', nivel: 'J3', hApoyo: 75 },
  { id: '21001', nombre: 'ISO 21001', desc: 'Organizaciones educativas', nivel: 'J3', hApoyo: 19, solape9001: 0.5 },
  { id: '9004', nombre: 'ISO 9004', desc: 'Calidad sostenible', nivel: 'J3', hApoyo: 11, solape9001: 0.5 },
  { id: 'une93200', nombre: 'UNE 93200', desc: 'Cartas de Servicios', nivel: 'J3', hApoyo: 25 },
  { id: 'une158101', nombre: 'UNE 158101', desc: 'Centros residenciales', nivel: 'J3', hApoyo: 91 },
  { id: 'une66181', nombre: 'UNE 66181', desc: 'Calidad de la formación virtual', nivel: 'J3', hApoyo: 30 },
  { id: 'igualdad', nombre: 'Plan de Igualdad', desc: 'Plan de igualdad de empresa', nivel: 'J2', hApoyo: 30 },
  { id: 'madridexcelente', nombre: 'Madrid Excelente', desc: 'Marca de garantía de la Comunidad de Madrid', nivel: 'J3', hApoyo: 30 },
];
const NORMA_BY_ID = Object.fromEntries(NORMAS.map((n) => [n.id, n]));
const TARIFA = { J1: 30, J2: 40, J3: 55, Senior: 75 };
const MARGEN = 0.60, IVA = 0.21, MESES_IMPL = 12;
const MODELOS = {
  Apoyo: { tipo: 'bolsa', hSist: null, hPres: 0, paso: 100, suelo: 0, leyenda: 'Pago único prepagado al 100 %. No contratable a menos de 60 días de una auditoría externa. Acompañamiento a auditoría aparte (600 €/jornada).' },
  Relación: { tipo: 'mes', hSist: 2, hPres: 0, paso: 25, suelo: 350, leyenda: 'Cuota mensual recurrente. Permanencia mínima 12 meses.' },
  Implicación: { tipo: 'mes', hSist: 4, hPres: 2, paso: 25, suelo: 350, leyenda: 'Cuota mensual recurrente. Permanencia mínima 12 meses.' },
  Compromiso: { tipo: 'mes', hSist: 6, hPres: 2, paso: 25, suelo: 350, leyenda: 'Cuota mensual recurrente. Permanencia mínima 12 meses.' },
  Implantación: { tipo: 'mes', hSist: 2.4, hPres: 1.2, paso: 25, suelo: 350, leyenda: 'Cuota durante la fase de implantación. 50% por adelantado + 50% antes de la auditoría externa.' },
};
const eur = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v) + ' €';

function calcular(normaIds, modeloId, opts = {}) {
  const m = MODELOS[modeloId];
  if (!m || !normaIds?.length) return null;
  const normas = normaIds.map((id) => NORMA_BY_ID[id]).filter(Boolean);
  if (!normas.length) return null;
  const f9001 = opts.tiene9001 ? 0.5 : 1;
  const raw = { J2: 0, J3: 0, Senior: 0 };
  if (m.tipo === 'bolsa') { for (const n of normas) raw[n.nivel] += n.hApoyo * (n.id === '9001' ? f9001 : 1); }
  else {
    for (const n of normas) raw[n.nivel] += m.hSist * (n.solape9001 ?? 1) * (n.id === '9001' ? f9001 : 1);
    if (m.hPres > 0) { const lider = normas.some((n) => n.nivel === 'J3') ? 'J3' : 'J2'; raw[lider] += m.hPres; }
  }
  const coord = (raw.J2 + raw.J3) * 0.10;
  if (normas.length <= 4) raw.J3 += coord; else raw.Senior += coord;
  const h = { J2: Math.ceil(raw.J2), J3: Math.ceil(raw.J3), Senior: Math.ceil(raw.Senior) };
  const hTotal = h.J2 + h.J3 + h.Senior;
  const coste = h.J2 * TARIFA.J2 + h.J3 * TARIFA.J3 + h.Senior * TARIFA.Senior;
  const precioExacto = Math.round(coste * (1 + MARGEN));
  let precioCatalogo = Math.ceil(precioExacto / m.paso) * m.paso;
  if (m.suelo > 0) precioCatalogo = Math.max(m.suelo, precioCatalogo);
  const iva = Math.round(precioCatalogo * IVA * 100) / 100;
  const totalConIva = Math.round((precioCatalogo + iva) * 100) / 100;
  let fraccionado = null;
  if (modeloId === 'Implantación') {
    const meses = Math.max(parseInt(opts.meses, 10) || MESES_IMPL, 1);
    const totalSinIva = precioCatalogo * meses;
    const totalConIvaFrac = Math.round(totalSinIva * (1 + IVA) * 100) / 100;
    const r2 = (x) => Math.round(x * 100) / 100;
    const cuota1 = r2(totalConIvaFrac * 0.50), cuota2 = r2(totalConIvaFrac * 0.25);
    const cuota3 = r2(totalConIvaFrac - cuota1 - cuota2);
    fraccionado = { meses, totalSinIva, totalConIva: totalConIvaFrac, cuota1, cuota2, cuota3, plan: '50 % por adelantado · 25 % a mitad de proyecto · 25 % al finalizar' };
  }
  return { modelo: modeloId, tipo: m.tipo, normas: normas.map((n) => n.id), nSistemas: normas.length, tiene9001: !!opts.tiene9001, horas: h, hTotal, coste, precioExacto, precioCatalogo, iva, totalConIva, fraccionado, leyenda: m.leyenda };
}

// ======================= GENERADORES =======================
const NAVY = rgb(0.024, 0.106, 0.271);  // #061B45
const ORANGE = rgb(0.961, 0.651, 0.137); // #F5A623
const MUTED = rgb(0.357, 0.42, 0.525);
const HOY = () => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

async function generarPDF(r, cli, anexo) {
  // Estructura "Knowledgefy": delega en el módulo documento-oferta.mjs.
  const buf = await generarPDFOferta(r, cli, anexo);
  return Buffer.from(buf);
}

async function generarPPTX(r, cli, anexo) {
  const NAVY = '061B45', ORANGE = 'F5A623', MUTED = '5B6B86', INK = '0C1424', SOFT = 'F3F6FB';
  const normNames = r.normaNombres.join(' + ');
  const esImpl = r.modelo === 'Implantación', esMes = r.tipo === 'mes' && !esImpl;
  const eur = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
  const p = new PptxGenJS(); p.defineLayout({ name: 'W', width: 10, height: 5.63 }); p.layout = 'W';

  // --- Slide 1: portada ---
  let s = p.addSlide(); s.background = { color: 'FFFFFF' };
  // Logo Consultify (imagen real) en lugar del texto.
  s.addImage({ data: 'image/png;base64,' + LOGO_CONSULTIFY, x: 0.6, y: 0.45, w: 1.9, h: 1.9 * 135 / 400 });
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.12, fill: { color: ORANGE } });
  s.addText('OFERTA DE SERVICIO', { x: 0.6, y: 1.7, w: 9, h: 0.7, fontFace: 'Arial', fontSize: 32, bold: true, color: NAVY });
  s.addText(`${normNames}  ·  Modelo ${r.modelo}${esImpl ? `  ·  Cronograma ${r.meses} meses` : ''}`, { x: 0.6, y: 2.5, w: 9, h: 0.4, fontFace: 'Arial', fontSize: 15, bold: true, color: 'D8910E' });
  s.addText([{ text: cli.empresa || '—', options: { fontSize: 22, bold: true, color: INK, breakLine: true } },
    { text: `Nº oferta ${cli.ref || '—'}  ·  ${HOY()}  ·  Comercial: ${cli.comercial || 'Alejandro'}`, options: { fontSize: 12, color: MUTED } }], { x: 0.6, y: 3.4, w: 9, h: 1.0, fontFace: 'Arial' });
  s.addText('Consultify, una empresa de TuConsultor · CIF B84867670 · hola@tuconsultor.com', { x: 0.6, y: 5.15, w: 9, h: 0.3, fontFace: 'Arial', fontSize: 9, color: '8896AD' });

  // --- Slide 2: objeto + presupuesto ---
  s = p.addSlide(); s.background = { color: 'FFFFFF' };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.63, fill: { color: NAVY } });
  s.addText('Objeto y condiciones económicas', { x: 0.6, y: 0.4, w: 9, h: 0.5, fontFace: 'Arial', fontSize: 22, bold: true, color: NAVY });
  const objeto = esImpl
    ? `Implantación del sistema de gestión ${normNames}. Programa completo ejecutado por el equipo consultor en ${r.meses} meses, hasta dejar la organización lista para la auditoría externa.`
    : `Consultoría para el sistema de gestión ${normNames}, en modelo ${r.modelo}.`;
  s.addText(objeto, { x: 0.6, y: 1.0, w: 9, h: 0.9, fontFace: 'Arial', fontSize: 12, color: INK, valign: 'top' });

  const precioTxt = esImpl ? eur(r.fraccionado.totalConIva) : (esMes ? `${eur(r.totalConIva)}/mes` : eur(r.totalConIva));
  s.addShape(p.ShapeType.roundRect, { x: 0.6, y: 2.0, w: 4.0, h: 1.4, fill: { color: SOFT }, line: { color: 'E3E9F2', width: 1 }, rectRadius: 0.08 });
  s.addText([{ text: precioTxt, options: { fontSize: 26, bold: true, color: NAVY, breakLine: true } },
    { text: esImpl ? 'Total programa (IVA incl.)' : (esMes ? 'Cuota mensual IVA incl.' : 'Total IVA incl.'), options: { fontSize: 12, color: MUTED } }], { x: 0.8, y: 2.25, w: 3.6, h: 1, fontFace: 'Arial' });

  const rows = [[{ text: 'Concepto', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } }, { text: 'Importe', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } }]];
  const rr = (a, b, hl) => rows.push([{ text: a, options: { color: hl ? 'FFFFFF' : INK, bold: !!hl, fill: hl ? { color: ORANGE } : undefined } }, { text: b, options: { color: hl ? 'FFFFFF' : INK, bold: true, align: 'right', fill: hl ? { color: ORANGE } : undefined } }]);
  if (esImpl) {
    rr('Programa completo (sin IVA)', eur(r.fraccionado.totalSinIva));
    rr('IVA (21%)', eur(r.fraccionado.totalConIva - r.fraccionado.totalSinIva));
    rr('TOTAL (IVA incl.)', eur(r.fraccionado.totalConIva), true);
    rr('1.ª cuota — 50% inicio', eur(r.fraccionado.cuota1));
    rr('2.ª cuota — 25% mitad', eur(r.fraccionado.cuota2));
    rr('3.ª cuota — 25% final', eur(r.fraccionado.cuota3));
  } else {
    rr(esMes ? 'Cuota mensual (base)' : 'Bolsa de horas (base)', eur(r.precioCatalogo) + (esMes ? '/mes' : ''));
    rr('IVA (21%)', eur(r.iva));
    rr(esMes ? 'TOTAL MENSUAL' : 'TOTAL', eur(r.totalConIva) + (esMes ? '/mes' : ''), true);
  }
  s.addTable(rows, { x: 4.9, y: 2.0, w: 4.5, colW: [2.7, 1.8], fontFace: 'Arial', fontSize: 11, border: { type: 'solid', color: 'EEF2F8', pt: 1 }, rowH: 0.3, valign: 'middle' });
  s.addText('Pago: ' + (esImpl ? '50% inicio · 25% mitad · 25% antes de auditoría' : (esMes ? 'mensual · permanencia 12 meses' : '100% prepago')), { x: 0.6, y: 3.6, w: 4.0, h: 0.5, fontFace: 'Arial', fontSize: 11, color: MUTED });
  s.addText('Consultify, una empresa de TuConsultor · CIF B84867670 · hola@tuconsultor.com', { x: 0.6, y: 5.2, w: 9, h: 0.3, fontFace: 'Arial', fontSize: 9, color: '8896AD' });

  // --- Slide 3: bloques de proceso (Anexo resumido) ---
  if (anexo && anexo.length) {
    s = p.addSlide(); s.background = { color: 'FFFFFF' };
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.63, fill: { color: NAVY } });
    s.addText('Plan de trabajo · bloques de proceso', { x: 0.6, y: 0.4, w: 9, h: 0.5, fontFace: 'Arial', fontSize: 22, bold: true, color: NAVY });
    const items = anexo.map(b => ({ text: b.bloque, options: { fontSize: 13, bold: true, color: NAVY, bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 6 } }));
    s.addText(items, { x: 0.7, y: 1.1, w: 8.6, h: 4.0, fontFace: 'Arial', valign: 'top' });
    s.addText('Detalle de subprocesos en el Anexo I del PDF.', { x: 0.7, y: 5.2, w: 9, h: 0.3, fontFace: 'Arial', fontSize: 9, color: '8896AD' });
  }

  // --- Slide 4: confidencialidad y protección de datos ---
  s = p.addSlide(); s.background = { color: 'FFFFFF' };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.63, fill: { color: NAVY } });
  s.addText('Confidencialidad y protección de datos', { x: 0.6, y: 0.4, w: 9, h: 0.5, fontFace: 'Arial', fontSize: 22, bold: true, color: NAVY });
  const clausulasPpt = [
    'Deber de secreto sin límite temporal, que subsiste tras finalizar el contrato.',
    'La información se usa exclusivamente para este proyecto; no se cede a terceros.',
    'Encargo de tratamiento conforme al art. 28 del RGPD y a la LOPDGDD.',
    'Medidas de seguridad: control de accesos, cifrado y trazabilidad.',
    'Personal sujeto a compromiso de confidencialidad por escrito.',
    'Al finalizar: devolución o supresión segura de la información, a tu elección.',
    'La documentación del sistema es propiedad del cliente.',
  ].map(t => ({ text: t, options: { fontSize: 12, color: INK, bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 8 } }));
  s.addText(clausulasPpt, { x: 0.7, y: 1.1, w: 8.6, h: 3.9, fontFace: 'Arial', valign: 'top' });
  s.addImage({ data: 'image/png;base64,' + LOGO_TUCONSULTOR, x: 0.6, y: 5.05, w: 1.1, h: 1.1 * 54 / 300 });
  s.addText('CIF B84867670 · hola@tuconsultor.com', { x: 1.85, y: 5.13, w: 7, h: 0.3, fontFace: 'Arial', fontSize: 9, color: '8896AD' });

  // --- Slide 5: otros sistemas que podemos implantar (comercial) ---
  const CAT_PPT = [
    ['9001', 'ISO 9001 · Calidad', 'Procesos bajo control y mejora continua. Requisito habitual en licitaciones.'],
    ['14001', 'ISO 14001 · Medio ambiente', 'Compromiso ambiental demostrable. Cada vez más exigida en contratación pública.'],
    ['45001', 'ISO 45001 · Seguridad y salud', 'Menos siniestralidad y seguridad jurídica en prevención.'],
    ['27001', 'ISO 27001 · Seguridad de la información', 'Protección frente a ciberataques. Clave con administraciones públicas.'],
    ['42001', 'ISO 42001 · Inteligencia artificial', 'IA responsable, alineada con el Reglamento Europeo de IA.'],
    ['56001', 'ISO 56001 · Innovación', 'De las ideas sueltas a una cartera gestionada. Facilita ayudas a la I+D+i.'],
    ['21001', 'ISO 21001 · Organizaciones educativas', 'El estudiante en el centro. Diferenciación para centros formativos.'],
    ['9004', 'ISO 9004 · Éxito sostenido', 'El siguiente nivel tras la 9001: excelencia y sostenibilidad del negocio.'],
  ];
  const otrasPpt = CAT_PPT.filter(([id]) => !(r.normas || []).includes(id));
  if (otrasPpt.length) {
    s = p.addSlide(); s.background = { color: 'FFFFFF' };
    s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.12, fill: { color: ORANGE } });
    s.addText('Otros sistemas que podemos implantar', { x: 0.6, y: 0.35, w: 9, h: 0.5, fontFace: 'Arial', fontSize: 22, bold: true, color: NAVY });
    s.addText('Integrarlos con un único socio ahorra tiempo y coste frente a hacerlo por separado.', { x: 0.6, y: 0.85, w: 9, h: 0.3, fontFace: 'Arial', fontSize: 11, color: 'D8910E' });
    const its = [];
    for (const [, titulo, desc] of otrasPpt.slice(0, 7)) {
      its.push({ text: titulo, options: { fontSize: 12, bold: true, color: NAVY, bullet: { code: '2022' }, breakLine: true } });
      its.push({ text: desc, options: { fontSize: 9.5, color: MUTED, breakLine: true, paraSpaceAfter: 7, indentLevel: 1 } });
    }
    s.addText(its, { x: 0.7, y: 1.3, w: 8.6, h: 3.7, fontFace: 'Arial', valign: 'top' });
    s.addImage({ data: 'image/png;base64,' + LOGO_TUCONSULTOR, x: 0.6, y: 5.05, w: 1.1, h: 1.1 * 54 / 300 });
    s.addText(`Escríbenos a hola@tuconsultor.com y lo estudiamos contigo.`, { x: 1.85, y: 5.13, w: 7, h: 0.3, fontFace: 'Arial', fontSize: 9, color: '8896AD' });
  }

  return await p.write({ outputType: 'nodebuffer' });
}

// ======================= SUBIDA A STORAGE =======================
async function subir(base, key, ruta, buffer, contentType) {
  const r = await fetch(`${base}/storage/v1/object/ofertas/${ruta}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buffer,
  });
  if (!r.ok) throw new Error(`Storage ${ruta}: ${r.status} ${await r.text()}`);
  return `${base}/storage/v1/object/public/ofertas/${ruta}`;
}

// ======================= COPIA INTERNA POR EMAIL (Brevo) =======================
const COPIA_INTERNA = process.env.OFERTA_COPIA_EMAIL || 'hola@tuconsultor.com';
const REMITENTE = process.env.BREVO_SENDER_EMAIL || 'hola@consultify.pro';

// Envía la oferta AL CLIENTE (a su email), con el PDF adjunto y un mensaje de presentación.
async function enviarAlCliente({ numeroOferta, cli, r, pdfBuf, url_pdf, email }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !email) return { ok: false, motivo: !apiKey ? 'sin BREVO_API_KEY' : 'sin email' };

  const normNames = r.normas.map((id) => NORMA_BY_ID[id].nombre).join(' + ');
  const saludo = cli.contacto ? `Hola ${cli.contacto.split(' ')[0]},` : 'Hola,';
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0C1424;font-size:15px;line-height:1.7">
      <p>${saludo}</p>
      <p>Te enviamos la oferta que has solicitado para <strong>${normNames}</strong>. Encontrarás todos los detalles en el PDF adjunto.</p>
      <p>Si tienes cualquier duda o quieres que la comentemos, respóndenos a este correo o escríbenos a <a href="mailto:hola@tuconsultor.com" style="color:#F5A623;font-weight:bold">hola@tuconsultor.com</a>. Estaremos encantados de ayudarte.</p>
      <p style="margin-top:20px">Un saludo,<br><strong>${cli.comercial || 'El equipo de TuConsultor'}</strong><br>Consultify · TuConsultor</p>
      <p style="color:#8896AD;font-size:12px;margin-top:20px">Instituto de Excelencia Europea S.L. · CIF B87093076 · Madrid<br>Desde 2006 gestionando con el corazón.</p>
    </div>`;

  const payload = {
    sender: { name: 'TuConsultor · Consultify', email: REMITENTE },
    to: [{ email, name: cli.contacto || cli.empresa || 'Cliente' }],
    replyTo: { email: 'hola@tuconsultor.com', name: 'TuConsultor' },
    subject: `Tu oferta ${numeroOferta} · ${normNames}`,
    htmlContent: html,
    attachment: [{ name: `Oferta_${numeroOferta}.pdf`, content: Buffer.from(pdfBuf).toString('base64') }],
  };
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (resp.ok) return { ok: true };
  return { ok: false, motivo: `Brevo HTTP ${resp.status}` };
}

async function enviarCopiaInterna({ numeroOferta, cli, r, pdfBuf, url_pdf, url_pptx, email }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return; // sin clave, no se envía (no es bloqueante)

  const normNames = r.normas.map((id) => NORMA_BY_ID[id].nombre).join(' + ');
  const precioTxt = r.fraccionado
    ? `${eur(r.fraccionado.totalSinIva)} (proyecto, sin IVA) · ${eur(r.fraccionado.totalConIva)} con IVA`
    : `${eur(r.precioCatalogo)}${r.tipo === 'mes' ? '/mes' : ''} (sin IVA) · ${eur(r.totalConIva)} con IVA`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0C1424;font-size:14px;line-height:1.6">
      <h2 style="color:#061B45;margin:0 0 4px">Nueva oferta emitida · ${numeroOferta}</h2>
      <p style="color:#5B6B86;margin:0 0 16px">Comercial asignado: <strong>${cli.comercial || 'Alejandro'}</strong></p>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
        <tr><td style="color:#5B6B86">Cliente</td><td><strong>${cli.empresa || '—'}</strong></td></tr>
        <tr><td style="color:#5B6B86">CIF</td><td>${cli.cif || '—'}</td></tr>
        <tr><td style="color:#5B6B86">Contacto</td><td>${cli.contacto || '—'}${cli.cargo ? ' · ' + cli.cargo : ''}</td></tr>
        <tr><td style="color:#5B6B86">Email cliente</td><td>${email || '—'}</td></tr>
        <tr><td style="color:#5B6B86">Normas</td><td>${normNames}</td></tr>
        <tr><td style="color:#5B6B86">Modelo</td><td>${r.modelo}</td></tr>
        <tr><td style="color:#5B6B86">Importe</td><td><strong>${precioTxt}</strong></td></tr>
      </table>
      <p style="margin:16px 0 4px"><a href="${url_pdf}" style="color:#F5A623;font-weight:bold">Descargar PDF</a> &nbsp;·&nbsp; <a href="${url_pptx}" style="color:#F5A623;font-weight:bold">Descargar PPT</a></p>
      <p style="color:#8896AD;font-size:12px;margin-top:20px">Instituto de Excelencia Europea S.L. · CIF B87093076 · Madrid<br>Hecho con amor en Madrid por TuConsultor · Desde 2006 gestionando con el corazón.</p>
    </div>`;

  const payload = {
    sender: { name: 'Consultify · Ofertas', email: REMITENTE },
    to: [{ email: COPIA_INTERNA, name: 'TuConsultor' }],
    subject: `Oferta ${numeroOferta} · ${cli.empresa || 'Cliente'} · ${normNames}`,
    htmlContent: html,
    attachment: [{ name: `Oferta_${numeroOferta}.pdf`, content: Buffer.from(pdfBuf).toString('base64') }],
  };

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ======================= HANDLER =======================
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!base || !key) return Response.json({ ok: false, error: 'Backend sin configurar' }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  // ── ETAPA 2 · ENVIAR una oferta YA generada (sin regenerar) ──────────────
  // Descarga el PDF guardado (url_pdf) y lo envía al cliente por email.
  if (body.action === 'enviar_existente') {
    const { url_pdf, email, empresa = '', contacto = '', comercial = 'Alejandro', numero_oferta = '', normas = [] } = body;
    if (!email) return Response.json({ ok: false, error: 'La oferta no tiene email de cliente.' }, { status: 400 });
    if (!url_pdf) return Response.json({ ok: false, error: 'La oferta no tiene PDF generado. Genérala primero.' }, { status: 400 });
    try {
      const pr = await fetch(url_pdf);
      if (!pr.ok) return Response.json({ ok: false, error: 'No se pudo descargar el PDF guardado.' }, { status: 502 });
      const pdfBuf = new Uint8Array(await pr.arrayBuffer());
      const cli = { empresa, contacto, comercial, email };
      const rInfo = { normas };
      const env = await enviarAlCliente({ numeroOferta: numero_oferta, cli, r: rInfo, pdfBuf, url_pdf, email });
      if (env.ok) return Response.json({ ok: true, enviado: true, email });
      return Response.json({ ok: false, error: `No se pudo enviar: ${env.motivo || 'error'}` }, { status: 502 });
    } catch (e) {
      return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
  }

  const { normas = [], modelo = '', empresa = '', cif = '', contacto = '', cargo = '', ref = '', comercial = 'Alejandro', presupuesto_id, email = '', meses, tiene9001 = false, direccion = '', enviar_cliente = false } = body;
  const r = calcular(normas, modelo, { meses, tiene9001 });
  if (!r) return Response.json({ ok: false, error: 'Normas o modelo no válidos' }, { status: 400 });
  // Enriquecer el resultado con nombres de norma y meses para el documento.
  r.normaNombres = normas.map((id) => (NORMA_BY_ID[id]?.nombre || id));
  r.meses = Math.max(parseInt(meses, 10) || (r.fraccionado?.meses) || 3, 1);
  // Anexo I: tareas por bloque (solo las que aplican a las normas elegidas).
  const anexo = tareasPorBloque(normas, modelo);

  // Número de oferta correlativo (OFE-AAAA-NNN): si no viene dado, lo pedimos
  // a la secuencia atómica en Postgres vía RPC.
  let numeroOferta = ref;
  if (!numeroOferta) {
    try {
      const rpc = await fetch(`${base}/rest/v1/rpc/siguiente_numero_oferta`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (rpc.ok) numeroOferta = (await rpc.json()) || '';
    } catch { /* si falla, seguimos sin número correlativo */ }
  }
  if (!numeroOferta) numeroOferta = `OFE-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

  const cli = { empresa, cif, contacto, cargo, ref: numeroOferta, comercial, direccion, email };
  const slug = (ref || empresa || 'oferta').toString().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'oferta';
  const stamp = Date.now();
  const carpeta = `${new Date().toISOString().slice(0, 7)}`; // YYYY-MM

  try {
    const [pdfBuf, pptxBuf] = await Promise.all([generarPDF(r, cli, anexo), generarPPTX(r, cli, anexo)]);
    const [url_pdf, url_pptx] = await Promise.all([
      subir(base, key, `${carpeta}/${slug}_${stamp}.pdf`, pdfBuf, 'application/pdf'),
      subir(base, key, `${carpeta}/${slug}_${stamp}.pptx`, pptxBuf, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    ]);

    // Si nos pasan el id del presupuesto, guardamos las URLs y el número de oferta en su fila
    if (presupuesto_id) {
      await fetch(`${base}/rest/v1/presupuestos?id=eq.${presupuesto_id}`, {
        method: 'PATCH',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ url_pdf, url_pptx, numero_oferta: numeroOferta }),
      }).catch(() => {});
    }

    // Enviar copia de la oferta a la dirección interna (hola@tuconsultor.com) vía Brevo,
    // con el PDF adjunto. No bloquea la respuesta si falla.
    await enviarCopiaInterna({ numeroOferta, cli, r, pdfBuf, url_pdf, url_pptx, email }).catch(() => {});

    // Envío AL CLIENTE (solo si se solicita explícitamente y hay email).
    let envio_cliente = null;
    if (enviar_cliente) {
      envio_cliente = await enviarAlCliente({ numeroOferta, cli, r, pdfBuf, url_pdf, email }).catch((e) => ({ ok: false, motivo: String(e) }));
    }

    return Response.json({ ok: true, url_pdf, url_pptx, numero_oferta: numeroOferta, precio: r.precioCatalogo, tipo: r.tipo, envio_cliente });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 502 });
  }
};

export const config = { path: '/.netlify/functions/generar-oferta' };
