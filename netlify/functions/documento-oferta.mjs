// documento-oferta.mjs · Genera el PDF de oferta con la estructura "Knowledgefy":
// portada con tabla de datos, objeto, plan por meses, dedicación por bloque,
// presupuesto con cuotas, condiciones, firma y Anexo I (tareas por bloque, sin horas).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const NAVY = rgb(0.024, 0.106, 0.271);
const NAVY2 = rgb(0.039, 0.165, 0.424);
const ORANGE = rgb(0.961, 0.651, 0.137);
const ORANGE_D = rgb(0.847, 0.569, 0.055);
const INK = rgb(0.047, 0.078, 0.141);
const MUTED = rgb(0.357, 0.42, 0.525);
const LINE = rgb(0.89, 0.91, 0.95);
const SOFT = rgb(0.953, 0.965, 0.984);
const WHITE = rgb(1, 1, 1);

const eur = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
const HOY = () => new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Datos de la sociedad emisora según el modelo (corresponsables): por defecto Trescore.
function emisor() {
  return { nombre: 'Consultify, una empresa de TuConsultor', cif: 'B84867670', email: 'hola@tuconsultor.com' };
}

export async function generarPDFOferta(r, cli, anexo) {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const W = 595, H = 842, M = 50;
  const em = emisor();
  const esImpl = r.modelo === 'Implantación';
  const esMes = r.tipo === 'mes' && !esImpl;
  const normNames = r.normaNombres.join(' + ');

  let page = pdf.addPage([W, H]);
  let y = 0;

  // ---- helpers de dibujo ----
  const wrap = (txt, font, size, maxW) => {
    const words = String(txt).split(' '); const lines = []; let line = '';
    for (const w of words) {
      if (font.widthOfTextAtSize((line + w).trim(), size) > maxW && line) { lines.push(line.trim()); line = ''; }
      line += w + ' ';
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  };
  const cabecera = () => {
    page.drawText('Consultify', { x: M, y: H - 48, size: 18, font: bold, color: NAVY });
    // Nombre de empresa alineado a la derecha, SIN invadir el logo: se reduce el
    // tamaño y, si aún no cabe, se trunca con elipsis. Antes se salía de la página.
    const xLogoFin = M + bold.widthOfTextAtSize('Consultify', 18) + 16;
    const anchoMax = (W - M) - xLogoFin;
    let txt = String(cli.empresa || '—'), size = 11;
    while (size > 6.5 && bold.widthOfTextAtSize(txt, size) > anchoMax) size -= 0.5;
    if (bold.widthOfTextAtSize(txt, size) > anchoMax) {
      while (txt.length > 1 && bold.widthOfTextAtSize(txt + '…', size) > anchoMax) txt = txt.slice(0, -1);
      txt += '…';
    }
    page.drawText(txt, { x: W - M - bold.widthOfTextAtSize(txt, size), y: H - 46, size, font: bold, color: NAVY });
    page.drawRectangle({ x: M, y: H - 62, width: W - 2 * M, height: 2.5, color: ORANGE });
  };
  const pie = (num) => {
    page.drawText(`${em.nombre} · CIF ${em.cif} · ${em.email}`, { x: M, y: 36, size: 7.5, font: reg, color: MUTED });
    page.drawText(`Página ${num}`, { x: W - M - reg.widthOfTextAtSize(`Página ${num}`, 7.5), y: 36, size: 7.5, font: reg, color: MUTED });
    page.drawText('Hecho con amor en Madrid por TuConsultor · Desde 2006 gestionando con el corazón.', { x: M, y: 24, size: 7.5, font: reg, color: ORANGE_D });
  };
  let pageNum = 1;
  const nuevaPagina = () => { pie(pageNum); page = pdf.addPage([W, H]); pageNum++; cabecera(); y = H - 90; };
  const espacio = (req) => { if (y - req < 70) nuevaPagina(); };

  const h2 = (txt) => { espacio(40); page.drawText(txt, { x: M, y, size: 15, font: bold, color: NAVY }); y -= 22; };
  const parrafo = (txt, size = 10) => {
    for (const ln of wrap(txt, reg, size, W - 2 * M)) { espacio(16); page.drawText(ln, { x: M, y, size, font: reg, color: INK }); y -= 14; }
  };

  // ============ PÁGINA 1 ============
  cabecera();
  y = H - 100;

  page.drawText('OFERTA DE SERVICIO', { x: M, y, size: 26, font: bold, color: NAVY }); y -= 24;
  const sub = `${normNames} · Modelo ${r.modelo}${esImpl ? ` · Cronograma ${r.meses} meses` : ''}`;
  page.drawText(sub, { x: M, y, size: 11, font: bold, color: ORANGE_D }); y -= 30;

  // Tabla de datos (2 columnas de pares etiqueta/valor)
  // Dibuja texto en una celda ajustando el tamaño de fuente para que quepa en anchoMax
  // (en vez de cortarlo). Baja hasta 6pt; si aún no cabe, hace elipsis como último recurso.
  const textoAjustado = (txt, x, yy, anchoMax, fnt, sizeIni, color) => {
    let s = String(txt || '—'), size = sizeIni;
    while (size > 6 && fnt.widthOfTextAtSize(s, size) > anchoMax) size -= 0.5;
    if (fnt.widthOfTextAtSize(s, size) > anchoMax) {
      while (s.length > 1 && fnt.widthOfTextAtSize(s + '…', size) > anchoMax) s = s.slice(0, -1);
      s += '…';
    }
    page.drawText(s, { x, y: yy, size, font: fnt, color });
  };

  // La fila 'Cliente' ocupa TODO el ancho (los nombres de empresa suelen ser largos);
  // el resto van en dos columnas. Marcamos con `ancha: true` la que se extiende.
  const filasDatos = [
    { l1: 'Cliente', v1: cli.empresa || '—', ancha: true },
    { l1: 'CIF', v1: cli.cif || '—', l2: 'Nº oferta', v2: cli.ref || '—' },
    { l1: 'Dirección', v1: cli.direccion || '—', l2: 'Fecha', v2: HOY() },
    { l1: 'Normas', v1: normNames, l2: 'Validez', v2: '30 días naturales' },
    { l1: 'Modelo', v1: r.modelo + (esImpl ? ' · Programa completo' : ''), l2: 'Contacto', v2: cli.contacto || cli.email || '—' },
    { l1: 'Comercial', v1: cli.comercial || 'Alejandro', l2: '', v2: '' },
  ];
  const rowH = 26, tableX = M, tableW = W - 2 * M;
  const c1 = tableX, c2 = tableX + 80, c3 = tableX + tableW / 2, c4 = c3 + 80;
  for (let i = 0; i < filasDatos.length; i++) {
    const ry = y - i * rowH;
    if (i % 2 === 0) page.drawRectangle({ x: tableX, y: ry - rowH + 8, width: tableW, height: rowH, color: SOFT });
    const f = filasDatos[i];
    page.drawText(f.l1, { x: c1 + 6, y: ry - 9, size: 9, font: bold, color: NAVY });
    if (f.ancha) {
      // Fila a todo el ancho: el valor dispone de toda la tabla (nombres largos).
      textoAjustado(f.v1, c2, ry - 9, tableX + tableW - c2 - 6, reg, 9, INK);
    } else {
      textoAjustado(f.v1, c2, ry - 9, c3 - c2 - 10, reg, 9, INK);
      if (f.l2) {
        page.drawText(f.l2, { x: c3 + 6, y: ry - 9, size: 9, font: bold, color: NAVY });
        textoAjustado(f.v2, c4, ry - 9, tableX + tableW - c4 - 6, reg, 9, INK);
      }
    }
  }
  y -= filasDatos.length * rowH + 20;

  // 1. Objeto
  h2('1. Objeto');
  const objeto = `Servicio de consultoría para la implantación de un sistema de gestión conforme a ${normNames}. ` +
    (esImpl
      ? `En modelo Implantación se ejecuta el programa completo, con el equipo consultor llevando el peso del trabajo documental y técnico. El cronograma se adapta a ${r.meses} meses de ejecución hasta dejar la organización lista para la auditoría externa de certificación.`
      : `En modelo ${r.modelo} el equipo consultor acompaña a la organización en el desarrollo y mantenimiento del sistema de gestión.`);
  parrafo(objeto); y -= 10;

  // 2. Plan de trabajo (por meses, solo Implantación; si no, fases genéricas)
  h2('2. Plan de trabajo');
  parrafo(`El programa se estructura por procesos del sistema. ${esImpl ? `El cronograma distribuye las tareas a lo largo de los ${r.meses} meses de implantación.` : 'Las tareas se ejecutan de forma recurrente según el modelo contratado.'}`);
  y -= 6;
  if (esImpl && anexo.length) {
    // Repartir bloques en los meses
    const meses = Math.max(r.meses, 1);
    const porMes = Math.ceil(anexo.length / meses);
    const planRows = [];
    for (let mz = 0; mz < meses; mz++) {
      const bloques = anexo.slice(mz * porMes, (mz + 1) * porMes).map(b => b.bloque);
      if (bloques.length) planRows.push([`Mes ${mz + 1}`, bloques.join(' · '), `Semanas ${mz * 4 + 1}–${(mz + 1) * 4}`]);
    }
    tablaPlan(page, planRows, M, y, W, bold, reg);
    y -= planRows.length * 28 + 30;
  }

  // 3. Dedicación del equipo (por bloque, sin horas individuales: solo lista de bloques)
  espacio(60);
  h2('3. Dedicación del equipo');
  parrafo('El equipo consultor cubre los siguientes bloques de proceso del sistema de gestión:');
  y -= 4;
  for (const b of anexo) {
    espacio(16);
    page.drawText('•', { x: M + 4, y, size: 10, font: bold, color: ORANGE_D });
    page.drawText(b.bloque, { x: M + 16, y, size: 10, font: bold, color: NAVY });
    y -= 15;
  }
  y -= 14;

  // 4. Presupuesto
  espacio(160);
  h2('4. Presupuesto');
  presupuesto(page, r, esImpl, esMes, M, y, W, bold, reg);
  y -= (esImpl ? 7 : 4) * 24 + 24;

  // 5. Condiciones
  espacio(160);
  h2('5. Condiciones');
  const condiciones = [
    esImpl
      ? 'Forma de pago: 50% por adelantado al inicio + 25% a mitad de proyecto + 25% antes de la auditoría externa.'
      : (esMes ? 'Forma de pago: cuota mensual recurrente. Permanencia mínima 12 meses.' : 'Forma de pago: bolsa de horas prepagada al 100%.'),
    'Inicio del proyecto: el proyecto se iniciará al recibir el importe de la primera factura o cuota.',
    'Datos para el pago (transferencia): IBAN ES68 0049 5191 36 2216400367 · IBAN ES52 2100 2996 57 0200079589.',
    'Importe cerrado: precio fijo por el alcance descrito, con independencia del nº de sesiones.',
    'Incluye: documentación del sistema, formación al equipo, auditoría interna y acompañamiento a la certificación.',
    'No incluye: tasas de la entidad certificadora ni acompañamiento presencial a la auditoría externa (600 €/jornada).',
    'Confidencialidad: toda la información facilitada se trata conforme al RGPD y se destina exclusivamente al proyecto.',
  ];
  for (const c of condiciones) {
    espacio(28);
    page.drawText('•', { x: M + 2, y, size: 10, font: bold, color: ORANGE_D });
    const lns = wrap(c, reg, 9.5, W - 2 * M - 16);
    for (let i = 0; i < lns.length; i++) { page.drawText(lns[i], { x: M + 14, y, size: 9.5, font: i === 0 ? reg : reg, color: INK }); y -= 13; }
    y -= 3;
  }
  y -= 20;

  // Firma
  espacio(70);
  page.drawText('Por Consultify (una empresa de TuConsultor)', { x: M, y, size: 9, font: bold, color: NAVY });
  // "Por [empresa]" ajustado al ancho de su columna (antes se desbordaba).
  {
    const anchoCol = (W - M) - c3;
    let t = `Por ${cli.empresa || '—'}`, sz = 9;
    while (sz > 6 && bold.widthOfTextAtSize(t, sz) > anchoCol) sz -= 0.5;
    if (bold.widthOfTextAtSize(t, sz) > anchoCol) {
      while (t.length > 1 && bold.widthOfTextAtSize(t + '…', sz) > anchoCol) t = t.slice(0, -1);
      t += '…';
    }
    page.drawText(t, { x: c3, y, size: sz, font: bold, color: NAVY });
  }
  y -= 40;
  page.drawLine({ start: { x: M, y }, end: { x: M + 180, y }, thickness: 0.7, color: MUTED });
  page.drawLine({ start: { x: c3, y }, end: { x: c3 + 180, y }, thickness: 0.7, color: MUTED }); y -= 12;
  page.drawText('Firma y fecha', { x: M, y, size: 8, font: reg, color: MUTED });
  page.drawText('Firma y fecha', { x: c3, y, size: 8, font: reg, color: MUTED });

  // ============ ANEXO I ============
  nuevaPagina();
  page.drawText('Anexo I · Tareas detalladas del plan de trabajo', { x: M, y, size: 18, font: bold, color: NAVY }); y -= 22;
  page.drawText(`${normNames} · Modelo ${r.modelo}`, { x: M, y, size: 10, font: bold, color: ORANGE_D }); y -= 26;
  parrafo('Relación de tareas por bloque de proceso incluidas en el alcance del proyecto.'); y -= 8;

  for (const b of anexo) {
    espacio(40);
    // Cabecera del bloque
    page.drawText(b.bloque, { x: M, y, size: 12, font: bold, color: NAVY }); y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: ORANGE }); y -= 16;
    for (const sub of b.subs) {
      espacio(16);
      page.drawText('–', { x: M + 4, y, size: 9.5, font: reg, color: ORANGE_D });
      const lns = wrap(sub, reg, 9.5, W - 2 * M - 18);
      for (let i = 0; i < lns.length; i++) { page.drawText(lns[i], { x: M + 16, y, size: 9.5, font: reg, color: INK }); y -= 13; }
    }
    y -= 12;
  }

  pie(pageNum);
  return await pdf.save();
}

// ---- tabla del plan de trabajo (Mes / Bloques / Periodo) ----
function tablaPlan(page, rows, M, y, W, bold, reg) {
  const tableW = W - 2 * M, cMes = M, cBloq = M + 60, cPer = W - M - 90;
  // cabecera
  page.drawRectangle({ x: M, y: y - 4, width: tableW, height: 22, color: NAVY });
  page.drawText('Fase', { x: cMes + 6, y: y + 3, size: 9, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Bloques de trabajo', { x: cBloq, y: y + 3, size: 9, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Periodo', { x: cPer, y: y + 3, size: 9, font: bold, color: rgb(1, 1, 1) });
  let ry = y - 24;
  for (let i = 0; i < rows.length; i++) {
    const [mes, bloques, per] = rows[i];
    if (i % 2 === 1) page.drawRectangle({ x: M, y: ry - 6, width: tableW, height: 24, color: rgb(0.953, 0.965, 0.984) });
    page.drawText(mes, { x: cMes + 6, y: ry + 2, size: 9, font: bold, color: NAVY });
    // Ajustar el tamaño de fuente para que los bloques quepan sin cortarse.
    const anchoBloq = cPer - cBloq - 8;
    let sBloq = String(bloques), szBloq = 8.5;
    while (szBloq > 6 && reg.widthOfTextAtSize(sBloq, szBloq) > anchoBloq) szBloq -= 0.5;
    if (reg.widthOfTextAtSize(sBloq, szBloq) > anchoBloq) {
      while (sBloq.length > 1 && reg.widthOfTextAtSize(sBloq + '…', szBloq) > anchoBloq) sBloq = sBloq.slice(0, -1);
      sBloq += '…';
    }
    page.drawText(sBloq, { x: cBloq, y: ry + 2, size: szBloq, font: reg, color: rgb(0.047, 0.078, 0.141) });
    page.drawText(per, { x: cPer, y: ry + 2, size: 8.5, font: reg, color: rgb(0.357, 0.42, 0.525) });
    ry -= 26;
  }
}

// ---- tabla de presupuesto ----
function presupuesto(page, r, esImpl, esMes, M, y, W, bold, reg) {
  const tableW = W - 2 * M, cCon = M, cImp = W - M - 110;
  const eur = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
  const rows = [];
  if (esImpl && r.fraccionado) {
    rows.push(['Programa completo de implantación', eur(r.fraccionado.totalSinIva), false]);
    rows.push(['IVA (21%)', eur(r.fraccionado.totalConIva - r.fraccionado.totalSinIva), false]);
    rows.push(['TOTAL DEL PROGRAMA (IVA incl.)', eur(r.fraccionado.totalConIva), true]);
    rows.push(['1.ª cuota — 50% al inicio', eur(r.fraccionado.cuota1), false]);
    rows.push(['2.ª cuota — 25% a mitad', eur(r.fraccionado.cuota2), false]);
    rows.push(['3.ª cuota — 25% final', eur(r.fraccionado.cuota3), false]);
  } else {
    rows.push([esMes ? 'Cuota mensual (base)' : 'Bolsa de horas (base)', eur(r.precioCatalogo) + (esMes ? '/mes' : ''), false]);
    rows.push(['IVA (21%)', eur(r.iva), false]);
    rows.push([esMes ? 'TOTAL MENSUAL (IVA incl.)' : 'TOTAL (IVA incl.)', eur(r.totalConIva) + (esMes ? '/mes' : ''), true]);
  }
  // cabecera
  page.drawRectangle({ x: M, y: y - 4, width: tableW, height: 22, color: NAVY });
  page.drawText('Concepto', { x: cCon + 6, y: y + 3, size: 9, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Importe', { x: cImp, y: y + 3, size: 9, font: bold, color: rgb(1, 1, 1) });
  let ry = y - 24;
  for (const [con, imp, destacado] of rows) {
    if (destacado) page.drawRectangle({ x: M, y: ry - 6, width: tableW, height: 24, color: rgb(0.961, 0.651, 0.137) });
    else page.drawRectangle({ x: M, y: ry - 6, width: tableW, height: 24, color: rgb(0.953, 0.965, 0.984) });
    page.drawText(con, { x: cCon + 6, y: ry + 2, size: 9, font: destacado ? bold : reg, color: destacado ? rgb(1, 1, 1) : rgb(0.047, 0.078, 0.141) });
    const impFont = bold, impColor = destacado ? rgb(1, 1, 1) : NAVY;
    page.drawText(imp, { x: W - M - 6 - impFont.widthOfTextAtSize(imp, 9), y: ry + 2, size: 9, font: impFont, color: impColor });
    ry -= 26;
  }
}
