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
  { id: 'une158101', nombre: 'UNE 158101', desc: 'Centros residenciales', nivel: 'J3', hApoyo: 40 },
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

function calcular(normaIds, modeloId) {
  const m = MODELOS[modeloId];
  if (!m || !normaIds?.length) return null;
  const normas = normaIds.map((id) => NORMA_BY_ID[id]).filter(Boolean);
  if (!normas.length) return null;
  const raw = { J2: 0, J3: 0, Senior: 0 };
  if (m.tipo === 'bolsa') { for (const n of normas) raw[n.nivel] += n.hApoyo; }
  else {
    for (const n of normas) raw[n.nivel] += m.hSist * (n.solape9001 ?? 1);
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
    const totalSinIva = precioCatalogo * MESES_IMPL;
    const totalConIvaFrac = Math.round(totalSinIva * (1 + IVA) * 100) / 100;
    const mitad = Math.round((totalConIvaFrac / 2) * 100) / 100;
    fraccionado = { meses: MESES_IMPL, totalSinIva, totalConIva: totalConIvaFrac, cuota1: mitad, cuota2: Math.round((totalConIvaFrac - mitad) * 100) / 100 };
  }
  return { modelo: modeloId, tipo: m.tipo, normas: normas.map((n) => n.id), nSistemas: normas.length, horas: h, hTotal, coste, precioExacto, precioCatalogo, iva, totalConIva, fraccionado, leyenda: m.leyenda };
}

// ======================= GENERADORES =======================
const NAVY = rgb(0.024, 0.106, 0.271);  // #061B45
const ORANGE = rgb(0.961, 0.651, 0.137); // #F5A623
const MUTED = rgb(0.357, 0.42, 0.525);
const HOY = () => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

async function generarPDF(r, cli) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const W = 595;
  let y = 800;
  const text = (t, x, size, font, color) => page.drawText(String(t), { x, y, size, font, color });

  // Cabecera
  text('CONSULTIFY', 50, 22, bold, NAVY);
  text('· Oferta de servicios', 200, 12, reg, MUTED);
  page.drawRectangle({ x: 50, y: y - 10, width: W - 100, height: 3, color: ORANGE });
  y -= 50;

  const normNames = r.normas.map((id) => NORMA_BY_ID[id].nombre).join(' + ');
  const esImpl = r.modelo === 'Implantación', esMes = r.tipo === 'mes' && !esImpl;

  text(`Referencia: ${cli.ref || '—'}        Fecha: ${HOY()}`, 50, 10, reg, MUTED); y -= 24;
  text('Cliente:', 50, 12, bold, NAVY); text(cli.empresa || '—', 110, 12, reg, NAVY); y -= 18;
  text('CIF:', 50, 11, bold, NAVY); text(cli.cif || '—', 110, 11, reg, NAVY);
  text('Contacto:', 260, 11, bold, NAVY); text(cli.contacto || '—', 330, 11, reg, NAVY); y -= 36;

  text('Alcance de la propuesta', 50, 15, bold, NAVY); y -= 22;
  text('Normas a implantar:', 50, 11, bold, NAVY); text(normNames, 180, 11, reg, NAVY); y -= 18;
  text('Modelo de servicio:', 50, 11, bold, NAVY); text(r.modelo, 180, 11, reg, NAVY); y -= 18;
  text(`Dedicación: ${r.hTotal} h/mes · ${r.nSistemas} sistema(s)`, 50, 10, reg, MUTED); y -= 34;

  text('Condiciones económicas', 50, 15, bold, NAVY); y -= 24;
  const linea = (lbl, val, b) => {
    page.drawText(lbl, { x: 50, y, size: 11, font: b ? bold : reg, color: b ? NAVY : MUTED });
    const vw = (b ? bold : reg).widthOfTextAtSize(val, 11);
    page.drawText(val, { x: W - 50 - vw, y, size: 11, font: b ? bold : reg, color: NAVY });
    page.drawLine({ start: { x: 50, y: y - 6 }, end: { x: W - 50, y: y - 6 }, thickness: 0.5, color: rgb(0.89, 0.91, 0.95) });
    y -= 22;
  };
  if (esImpl) {
    linea('Cuota mensual (fase implantación)', eur(r.precioCatalogo) + '/mes');
    linea('Duración estimada', `${r.fraccionado.meses} meses`);
    linea('Total proyecto (sin IVA)', eur(r.fraccionado.totalSinIva));
    linea('IVA (21%)', eur(r.fraccionado.totalConIva - r.fraccionado.totalSinIva));
    linea('Total con IVA', eur(r.fraccionado.totalConIva), true);
    linea('1er pago (50% por adelantado)', eur(r.fraccionado.cuota1));
    linea('2º pago (50% antes de auditoría)', eur(r.fraccionado.cuota2));
  } else {
    linea(esMes ? 'Cuota mensual (base)' : 'Bolsa de horas (base)', eur(r.precioCatalogo) + (esMes ? '/mes' : ''));
    linea('IVA (21%)', eur(r.iva));
    linea(esMes ? 'Total mensual con IVA' : 'Total con IVA', eur(r.totalConIva) + (esMes ? '/mes' : ''), true);
  }
  y -= 16;
  text('Condiciones', 50, 12, bold, NAVY); y -= 18;
  // leyenda con wrap simple
  const words = r.leyenda.split(' '); let line = '';
  for (const w of words) {
    if (reg.widthOfTextAtSize(line + w, 9) > W - 100) { text(line, 50, 9, reg, MUTED); y -= 13; line = ''; }
    line += w + ' ';
  }
  if (line) { text(line, 50, 9, reg, MUTED); y -= 13; }

  // Pie
  page.drawLine({ start: { x: 50, y: 70 }, end: { x: W - 50, y: 70 }, thickness: 0.5, color: rgb(0.89, 0.91, 0.95) });
  page.drawText('Instituto de Excelencia Europea S.L. · CIF B87093076 · Madrid', { x: 50, y: 56, size: 8, font: reg, color: MUTED });
  page.drawText('Hecho con amor en Madrid por TuConsultor · Desde 2006 gestionando con el corazón.', { x: 50, y: 44, size: 8, font: reg, color: rgb(0.53, 0.59, 0.68) });

  return Buffer.from(await pdf.save());
}

async function generarPPTX(r, cli) {
  const NAVY = '061B45', ORANGE = 'F5A623', MUTED = '5B6B86', INK = '0C1424';
  const normNames = r.normas.map((id) => NORMA_BY_ID[id].nombre).join(' + ');
  const esImpl = r.modelo === 'Implantación', esMes = r.tipo === 'mes' && !esImpl;
  const p = new PptxGenJS(); p.defineLayout({ name: 'W', width: 10, height: 5.63 }); p.layout = 'W';

  let s = p.addSlide(); s.background = { color: 'FFFFFF' };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.12, fill: { color: ORANGE } });
  s.addText('CONSULTIFY', { x: 0.6, y: 0.7, w: 9, h: 0.6, fontFace: 'Arial', fontSize: 34, bold: true, color: NAVY });
  s.addText('Oferta de servicios de consultoría', { x: 0.6, y: 1.35, w: 9, h: 0.4, fontFace: 'Arial', fontSize: 16, color: MUTED });
  s.addText([{ text: cli.empresa || '—', options: { fontSize: 26, bold: true, color: INK, breakLine: true } },
    { text: `${normNames}  ·  Modelo ${r.modelo}`, options: { fontSize: 15, color: NAVY } }], { x: 0.6, y: 2.5, w: 9, h: 1.2, fontFace: 'Arial' });
  s.addText(`Referencia ${cli.ref || '—'}   ·   ${HOY()}`, { x: 0.6, y: 4.8, w: 9, h: 0.4, fontFace: 'Arial', fontSize: 12, color: MUTED });

  s = p.addSlide(); s.background = { color: 'FFFFFF' };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 5.63, fill: { color: NAVY } });
  s.addText('Alcance y condiciones económicas', { x: 0.6, y: 0.5, w: 9, h: 0.5, fontFace: 'Arial', fontSize: 22, bold: true, color: NAVY });
  const precioTxt = esMes ? `${eur(r.precioCatalogo)}/mes` : esImpl ? `${eur(r.precioCatalogo)}/mes` : `${eur(r.precioCatalogo)}`;
  s.addShape(p.ShapeType.roundRect, { x: 0.6, y: 1.3, w: 4.1, h: 1.5, fill: { color: 'F5F8FF' }, line: { color: 'E3E9F2', width: 1 }, rectRadius: 0.1 });
  s.addText([{ text: precioTxt, options: { fontSize: 28, bold: true, color: NAVY, breakLine: true } },
    { text: esImpl ? `Total proyecto c/IVA: ${eur(r.fraccionado.totalConIva)}` : esMes ? `IVA incl.: ${eur(r.totalConIva)}/mes` : `Total c/IVA: ${eur(r.totalConIva)}`, options: { fontSize: 13, color: MUTED } }], { x: 0.8, y: 1.55, w: 3.8, h: 1, fontFace: 'Arial' });

  const rows = [[{ text: 'Concepto', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } }, { text: 'Detalle', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } }]];
  const rr = (a, b) => rows.push([{ text: a, options: { color: INK } }, { text: b, options: { color: INK, align: 'right' } }]);
  rr('Normas', normNames); rr('Modelo', r.modelo); rr('Sistemas', String(r.nSistemas)); rr('Dedicación', `${r.hTotal} h/mes`);
  if (esImpl) { rr('Duración', `${r.fraccionado.meses} meses`); rr('Pago', '50% + 50% pre-auditoría'); }
  else rr('Cobro', esMes ? 'Mensual · permanencia 12 m' : 'Pago único 100% prepago');
  s.addTable(rows, { x: 5, y: 1.3, w: 4.4, colW: [2.0, 2.4], fontFace: 'Arial', fontSize: 11, border: { type: 'solid', color: 'EEF2F8', pt: 1 }, rowH: 0.32, valign: 'middle' });
  s.addText(r.leyenda, { x: 0.6, y: 3.2, w: 4.1, h: 1.6, fontFace: 'Arial', fontSize: 11, color: MUTED, valign: 'top' });
  s.addText('Instituto de Excelencia Europea S.L. · CIF B87093076 · Madrid\nHecho con amor en Madrid por TuConsultor · Desde 2006 gestionando con el corazón.', { x: 0.6, y: 5.0, w: 9, h: 0.5, fontFace: 'Arial', fontSize: 9, color: '8896AD' });

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

// ======================= HANDLER =======================
export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!base || !key) return Response.json({ ok: false, error: 'Backend sin configurar' }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const { normas = [], modelo = '', empresa = '', cif = '', contacto = '', ref = '', presupuesto_id } = body;
  const r = calcular(normas, modelo);
  if (!r) return Response.json({ ok: false, error: 'Normas o modelo no válidos' }, { status: 400 });

  const cli = { empresa, cif, contacto, ref };
  const slug = (ref || empresa || 'oferta').toString().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'oferta';
  const stamp = Date.now();
  const carpeta = `${new Date().toISOString().slice(0, 7)}`; // YYYY-MM

  try {
    const [pdfBuf, pptxBuf] = await Promise.all([generarPDF(r, cli), generarPPTX(r, cli)]);
    const [url_pdf, url_pptx] = await Promise.all([
      subir(base, key, `${carpeta}/${slug}_${stamp}.pdf`, pdfBuf, 'application/pdf'),
      subir(base, key, `${carpeta}/${slug}_${stamp}.pptx`, pptxBuf, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
    ]);

    // Si nos pasan el id del presupuesto, guardamos las URLs en su fila
    if (presupuesto_id) {
      await fetch(`${base}/rest/v1/presupuestos?id=eq.${presupuesto_id}`, {
        method: 'PATCH',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ url_pdf, url_pptx }),
      }).catch(() => {});
    }

    return Response.json({ ok: true, url_pdf, url_pptx, precio: r.precioCatalogo, tipo: r.tipo });
  } catch (e) {
    return Response.json({ ok: false, error: String(e.message || e) }, { status: 502 });
  }
};

export const config = { path: '/.netlify/functions/generar-oferta' };
