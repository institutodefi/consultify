// documento-oferta.mjs · Genera el PDF de oferta con la estructura "Knowledgefy":
// portada con tabla de datos, objeto, plan por meses, dedicación por bloque,
// presupuesto con cuotas, condiciones, firma y Anexo I (tareas por bloque, sin horas).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { LOGO_CONSULTIFY, LOGO_CONSULTIFY_BLANCO, LOGO_TUCONSULTOR, LOGO_TUCONSULTOR_BLANCO } from './logos-oferta.mjs';

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
  // Logos reales (PNG incrustados) para dar acabado de dossier.
  let imgConsultify = null, imgTuConsultor = null, imgConsultifyBlanco = null, imgTuConsultorBlanco = null;
  try { imgConsultify = await pdf.embedPng(Buffer.from(LOGO_CONSULTIFY, 'base64')); } catch { /* sigue sin logo */ }
  try { imgConsultifyBlanco = await pdf.embedPng(Buffer.from(LOGO_CONSULTIFY_BLANCO, 'base64')); } catch { /* noop */ }
  try { imgTuConsultor = await pdf.embedPng(Buffer.from(LOGO_TUCONSULTOR, 'base64')); } catch { /* noop */ }
  try { imgTuConsultorBlanco = await pdf.embedPng(Buffer.from(LOGO_TUCONSULTOR_BLANCO, 'base64')); } catch { /* noop */ }
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
    // Logo Consultify (imagen real). Si no cargara, se usa el texto como respaldo.
    if (imgConsultify) {
      const lw = 108, lh = lw * (imgConsultify.height / imgConsultify.width);
      page.drawImage(imgConsultify, { x: M, y: H - 40 - lh / 2, width: lw, height: lh });
    } else {
      page.drawText('Consultify', { x: M, y: H - 48, size: 18, font: bold, color: NAVY });
    }
    const xLogoFin = M + 108 + 16;
    const anchoMax = (W - M) - xLogoFin;
    let txt = String(cli.empresa || '—'), size = 10;
    while (size > 6.5 && bold.widthOfTextAtSize(txt, size) > anchoMax) size -= 0.5;
    if (bold.widthOfTextAtSize(txt, size) > anchoMax) {
      while (txt.length > 1 && bold.widthOfTextAtSize(txt + '…', size) > anchoMax) txt = txt.slice(0, -1);
      txt += '…';
    }
    page.drawText(txt, { x: W - M - bold.widthOfTextAtSize(txt, size), y: H - 44, size, font: bold, color: MUTED });
    page.drawRectangle({ x: M, y: H - 62, width: W - 2 * M, height: 2.5, color: ORANGE });
  };
  const pie = (num) => {
    page.drawRectangle({ x: M, y: 52, width: W - 2 * M, height: 0.6, color: rgb(0.88, 0.90, 0.94) });
    if (imgTuConsultor) {
      const lw = 74, lh = lw * (imgTuConsultor.height / imgTuConsultor.width);
      page.drawImage(imgTuConsultor, { x: M, y: 30, width: lw, height: lh });
      page.drawText(`${em.nombre} · CIF ${em.cif} · ${em.email}`, { x: M + lw + 10, y: 36, size: 7, font: reg, color: MUTED });
    } else {
      page.drawText(`${em.nombre} · CIF ${em.cif} · ${em.email}`, { x: M, y: 36, size: 7.5, font: reg, color: MUTED });
    }
    page.drawText(`Página ${num}`, { x: W - M - reg.widthOfTextAtSize(`Página ${num}`, 7.5), y: 36, size: 7.5, font: reg, color: MUTED });
    page.drawText('Desde 2006 gestionando con el corazón.', { x: M, y: 22, size: 6.5, font: reg, color: ORANGE_D });
  };
  let pageNum = 1;
  const nuevaPagina = () => { pie(pageNum); page = pdf.addPage([W, H]); pageNum++; cabecera(); y = H - 90; };
  const espacio = (req) => { if (y - req < 70) nuevaPagina(); };

  const h2 = (txt) => { espacio(40); page.drawText(txt, { x: M, y, size: 15, font: bold, color: NAVY }); y -= 22; };
  const parrafo = (txt, size = 10) => {
    for (const ln of wrap(txt, reg, size, W - 2 * M)) { espacio(16); page.drawText(ln, { x: M, y, size, font: reg, color: INK }); y -= 14; }
  };

  // ============ PORTADA (página completa) ============
  // Fondo navy con degradado sutil, logo blanco, cliente y servicio destacados.
  {
    // Fondo base
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });
    // Degradado simulado: franjas de navy que aclaran hacia abajo
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      page.drawRectangle({
        x: 0, y: H - (i + 1) * (H / 40), width: W, height: H / 40 + 1,
        color: rgb(0.024 + t * 0.02, 0.106 + t * 0.055, 0.271 + t * 0.15),
      });
    }
    // Acento naranja diagonal (bloques decorativos)
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ORANGE });
    page.drawRectangle({ x: W - 130, y: 0, width: 130, height: 4, color: ORANGE });

    // Logo Consultify en blanco, grande
    if (imgConsultifyBlanco) {
      const lw = 190, lh = lw * (imgConsultifyBlanco.height / imgConsultifyBlanco.width);
      page.drawImage(imgConsultifyBlanco, { x: M, y: H - 120, width: lw, height: lh });
    } else {
      page.drawText('Consultify', { x: M, y: H - 100, size: 26, font: bold, color: rgb(1, 1, 1) });
    }

    // Etiqueta superior
    page.drawText('PROPUESTA DE SERVICIOS', { x: M, y: H - 210, size: 9, font: bold, color: ORANGE });
    page.drawRectangle({ x: M, y: H - 220, width: 46, height: 2, color: ORANGE });

    // Título grande
    page.drawText('OFERTA DE', { x: M, y: H - 262, size: 38, font: bold, color: rgb(1, 1, 1) });
    page.drawText('SERVICIO', { x: M, y: H - 304, size: 38, font: bold, color: ORANGE });

    // Servicio (normas + modelo) muy visible
    let yy = H - 360;
    for (const ln of wrap(normNames, bold, 17, W - 2 * M)) {
      page.drawText(ln, { x: M, y: yy, size: 17, font: bold, color: rgb(1, 1, 1) });
      yy -= 22;
    }
    page.drawText(`Modelo ${r.modelo}${esImpl ? ` · ${r.meses} meses` : ''}`, { x: M, y: yy - 4, size: 12, font: reg, color: rgb(0.62, 0.71, 0.88) });

    // Bloque del cliente — destacado sobre panel
    const panelY = 200, panelH = 128;
    page.drawRectangle({ x: M, y: panelY, width: W - 2 * M, height: panelH, color: rgb(1, 1, 1), opacity: 0.07 });
    page.drawRectangle({ x: M, y: panelY, width: 3.5, height: panelH, color: ORANGE });

    page.drawText('PREPARADA PARA', { x: M + 18, y: panelY + panelH - 26, size: 8, font: bold, color: ORANGE });
    // Nombre del cliente: grande, con salto de línea si hace falta (nunca cortado)
    let cy = panelY + panelH - 50;
    const lineasCli = wrap(String(cli.empresa || '—'), bold, 15, W - 2 * M - 36);
    for (const ln of lineasCli.slice(0, 3)) {
      page.drawText(ln, { x: M + 18, y: cy, size: 15, font: bold, color: rgb(1, 1, 1) });
      cy -= 19;
    }
    // Datos secundarios del cliente
    const meta = [cli.cif ? `CIF ${cli.cif}` : null, cli.contacto || null].filter(Boolean).join('   ·   ');
    if (meta) page.drawText(meta, { x: M + 18, y: cy - 2, size: 9.5, font: reg, color: rgb(0.62, 0.71, 0.88) });

    // Pie de portada: nº de oferta, fecha, comercial
    page.drawRectangle({ x: M, y: 118, width: W - 2 * M, height: 0.8, color: rgb(1, 1, 1), opacity: 0.18 });
    const pieItems = [
      ['Nº DE OFERTA', cli.ref || '—'],
      ['FECHA', HOY()],
      ['CONSULTOR', cli.comercial || 'Alejandro'],
    ];
    pieItems.forEach(([et, va], i) => {
      const px = M + i * ((W - 2 * M) / 3);
      page.drawText(et, { x: px, y: 96, size: 7, font: bold, color: ORANGE });
      page.drawText(String(va), { x: px, y: 80, size: 10, font: bold, color: rgb(1, 1, 1) });
    });

    // Logo TuConsultor (blanco) abajo
    if (imgTuConsultorBlanco) {
      const lw = 92, lh = lw * (imgTuConsultorBlanco.height / imgTuConsultorBlanco.width);
      page.drawImage(imgTuConsultorBlanco, { x: M, y: 34, width: lw, height: lh });
      page.drawText('Desde 2006 gestionando con el corazón.', { x: M + lw + 12, y: 40, size: 7.5, font: reg, color: rgb(0.62, 0.71, 0.88) });
    }
  }

  // ============ PÁGINA 1 (contenido) ============
  page = pdf.addPage([W, H]); pageNum = 2;
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

  // 4. Inversión — en su propia página, con protagonismo.
  nuevaPagina();
  page.drawText('4. Inversión', { x: M, y, size: 18, font: bold, color: NAVY }); y -= 20;
  page.drawText(`${normNames} · Modelo ${r.modelo}`, { x: M, y, size: 9.5, font: bold, color: ORANGE_D }); y -= 26;
  y = presupuesto(page, r, esImpl, esMes, M, y, W, bold, reg, wrap);

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
    'Validez de la oferta: 30 días naturales desde su fecha de emisión.',
  ];
  for (const c of condiciones) {
    espacio(28);
    page.drawText('•', { x: M + 2, y, size: 10, font: bold, color: ORANGE_D });
    const lns = wrap(c, reg, 9.5, W - 2 * M - 16);
    for (let i = 0; i < lns.length; i++) { page.drawText(lns[i], { x: M + 14, y, size: 9.5, font: i === 0 ? reg : reg, color: INK }); y -= 13; }
    y -= 3;
  }
  y -= 20;

  // 6. Confidencialidad y protección de datos (cláusulas completas)
  espacio(200);
  h2('6. Confidencialidad y protección de datos');
  const clausulas = [
    ['Deber de secreto', 'Ambas partes se obligan a mantener la más estricta confidencialidad sobre cuanta información, documentación y datos conozcan como consecuencia de la presente relación, sin límite temporal, subsistiendo esta obligación tras la finalización del contrato.'],
    ['Uso limitado', 'La información facilitada por el cliente se destina exclusivamente a la ejecución del proyecto descrito y no será cedida, comunicada ni utilizada para ninguna otra finalidad sin su consentimiento expreso y por escrito.'],
    ['Tratamiento de datos personales', `${em.nombre} actuará como encargado del tratamiento respecto de los datos personales a los que acceda por cuenta del cliente (responsable), conforme al art. 28 del Reglamento (UE) 2016/679 (RGPD) y a la LO 3/2018 (LOPDGDD), formalizándose el correspondiente contrato de encargo.`],
    ['Medidas de seguridad', 'Se aplican medidas técnicas y organizativas apropiadas para garantizar la confidencialidad, integridad y disponibilidad de la información, incluyendo control de accesos, cifrado de la información sensible y trazabilidad de las actuaciones.'],
    ['Personal', 'El personal asignado al proyecto está sujeto a compromiso de confidencialidad por escrito, con idéntico alcance al aquí descrito.'],
    ['Devolución o supresión', 'Finalizado el proyecto, y a elección del cliente, la información y los datos serán devueltos o suprimidos de forma segura, salvo obligación legal de conservación.'],
    ['Propiedad intelectual', 'La documentación del sistema de gestión elaborada durante el proyecto es propiedad del cliente. Las metodologías, plantillas y herramientas propias de Consultify permanecen bajo su titularidad y se ceden en uso para el proyecto.'],
  ];
  for (const [titulo, texto] of clausulas) {
    espacio(46);
    page.drawText(titulo, { x: M, y, size: 9.5, font: bold, color: NAVY }); y -= 13;
    for (const ln of wrap(texto, reg, 8.8, W - 2 * M)) { espacio(14); page.drawText(ln, { x: M, y, size: 8.8, font: reg, color: INK }); y -= 11.5; }
    y -= 7;
  }
  y -= 10;

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

  // ============ ANEXO II · Otros sistemas de gestión (comercial) ============
  // Muestra las normas que el cliente NO ha contratado, como oportunidad de ampliación.
  const CATALOGO_NORMAS = [
    ['9001', 'ISO 9001 · Calidad', 'La base de todo sistema de gestión: procesos bajo control, clientes satisfechos y mejora continua. Es el estándar más reconocido del mundo y suele ser requisito en licitaciones y grandes clientes.'],
    ['14001', 'ISO 14001 · Medio ambiente', 'Demuestra el compromiso ambiental de la organización: consumo, residuos y huella bajo control. Cada vez más exigida en contratación pública y por clientes con criterios ESG.'],
    ['45001', 'ISO 45001 · Seguridad y salud laboral', 'Reduce la siniestralidad y refuerza la cultura preventiva. Aporta seguridad jurídica frente a la normativa de prevención y mejora el clima laboral.'],
    ['27001', 'ISO 27001 · Seguridad de la información', 'Protege la información frente a ciberataques y fugas de datos. Imprescindible para trabajar con administraciones públicas y sectores regulados.'],
    ['42001', 'ISO 42001 · Inteligencia artificial', 'El primer estándar internacional de gestión de la IA. Permite adoptar IA de forma responsable y demostrarlo ante clientes y reguladores, en línea con el Reglamento Europeo de IA.'],
    ['56001', 'ISO 56001 · Gestión de la innovación', 'Sistematiza la innovación: de las ideas sueltas a una cartera gestionada con resultados medibles. Facilita el acceso a ayudas y deducciones fiscales por I+D+i.'],
    ['21001', 'ISO 21001 · Organizaciones educativas', 'Específica para centros formativos: pone al estudiante en el centro y ordena la gestión académica. Diferencia frente a otros centros.'],
    ['9004', 'ISO 9004 · Éxito sostenido', 'El siguiente nivel tras la 9001: orientada a la sostenibilidad del negocio a largo plazo y a la excelencia en la gestión.'],
  ];
  const contratadas = r.normas || [];
  const otras = CATALOGO_NORMAS.filter(([id]) => !contratadas.includes(id));
  if (otras.length) {
    nuevaPagina();
    page.drawText('Anexo II · Otros sistemas que podemos implantar', { x: M, y, size: 18, font: bold, color: NAVY }); y -= 22;
    page.drawText('Crece con un único socio y un único sistema integrado', { x: M, y, size: 10, font: bold, color: ORANGE_D }); y -= 26;
    parrafo('Los sistemas de gestión comparten una estructura común. Integrarlos con nosotros significa un solo equipo, una sola documentación y un ahorro real frente a implantarlos por separado. Estos son los que podemos sumar a tu proyecto:');
    y -= 10;
    for (const [, titulo, desc] of otras) {
      espacio(52);
      page.drawRectangle({ x: M, y: y - 2, width: 3, height: 14, color: ORANGE });
      page.drawText(titulo, { x: M + 10, y, size: 10.5, font: bold, color: NAVY }); y -= 14;
      for (const ln of wrap(desc, reg, 8.8, W - 2 * M - 10)) { espacio(13); page.drawText(ln, { x: M + 10, y, size: 8.8, font: reg, color: INK }); y -= 11.5; }
      y -= 9;
    }
    // Bloque de contacto comercial
    espacio(70);
    y -= 6;
    page.drawRectangle({ x: M, y: y - 44, width: W - 2 * M, height: 52, color: SOFT });
    page.drawText('¿Quieres ampliar tu sistema de gestión?', { x: M + 14, y: y - 8, size: 11, font: bold, color: NAVY });
    page.drawText(`Escríbenos a ${em.email} y estudiamos contigo la mejor combinación.`, { x: M + 14, y: y - 24, size: 9, font: reg, color: INK });
    page.drawText('Integrar varias normas a la vez reduce el coste y el esfuerzo frente a hacerlo por separado.', { x: M + 14, y: y - 37, size: 8.5, font: reg, color: ORANGE_D });
    y -= 56;
  }

  pie(pageNum);

  // ============ CONTRAPORTADA (página completa) ============
  {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      page.drawRectangle({
        x: 0, y: H - (i + 1) * (H / 40), width: W, height: H / 40 + 1,
        color: rgb(0.024 + t * 0.02, 0.106 + t * 0.055, 0.271 + t * 0.15),
      });
    }
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ORANGE });

    // Logo grande centrado
    if (imgConsultifyBlanco) {
      const lw = 210, lh = lw * (imgConsultifyBlanco.height / imgConsultifyBlanco.width);
      page.drawImage(imgConsultifyBlanco, { x: (W - lw) / 2, y: H - 200, width: lw, height: lh });
    }

    // Mensaje central
    const centrado = (txt, yy, size, font, color) => {
      const wtxt = font.widthOfTextAtSize(txt, size);
      page.drawText(txt, { x: (W - wtxt) / 2, y: yy, size, font, color });
    };
    centrado('Gracias por confiar en nosotros', H - 280, 22, bold, rgb(1, 1, 1));
    page.drawRectangle({ x: (W - 60) / 2, y: H - 296, width: 60, height: 2, color: ORANGE });

    const mensaje = 'Llevamos desde 2006 acompañando a organizaciones como la tuya en su camino hacia la excelencia. No implantamos sistemas: construimos formas de trabajar que perduran.';
    let my = H - 330;
    for (const ln of wrap(mensaje, reg, 11, W - 2 * M - 60)) {
      const wl = reg.widthOfTextAtSize(ln, 11);
      page.drawText(ln, { x: (W - wl) / 2, y: my, size: 11, font: reg, color: rgb(0.72, 0.79, 0.92) });
      my -= 17;
    }

    // Tres pilares (valores)
    const pilares = [
      ['Cercanía', 'Un equipo que conoce\ntu organización'],
      ['Rigor', 'Metodología probada\nen cientos de proyectos'],
      ['Resultados', 'Certificación a la primera\ny sistemas que se usan'],
    ];
    const colW = (W - 2 * M) / 3;
    pilares.forEach(([tit, desc], i) => {
      const cx = M + i * colW + colW / 2;
      const wt = bold.widthOfTextAtSize(tit, 12);
      page.drawRectangle({ x: cx - 12, y: 400, width: 24, height: 2.5, color: ORANGE });
      page.drawText(tit, { x: cx - wt / 2, y: 372, size: 12, font: bold, color: rgb(1, 1, 1) });
      desc.split('\n').forEach((ln, j) => {
        const wl = reg.widthOfTextAtSize(ln, 8.5);
        page.drawText(ln, { x: cx - wl / 2, y: 354 - j * 12, size: 8.5, font: reg, color: rgb(0.62, 0.71, 0.88) });
      });
    });

    // Panel de contacto
    const pY = 190, pH = 118;
    page.drawRectangle({ x: M, y: pY, width: W - 2 * M, height: pH, color: rgb(1, 1, 1), opacity: 0.07 });
    page.drawRectangle({ x: M, y: pY + pH - 3, width: W - 2 * M, height: 3, color: ORANGE });
    centrado('¿Hablamos?', pY + pH - 34, 15, bold, rgb(1, 1, 1));
    centrado(em.email, pY + pH - 60, 13, bold, ORANGE);
    centrado('Paseo de la Castellana 18, Planta 7 · 28046 Madrid', pY + pH - 80, 9, reg, rgb(0.62, 0.71, 0.88));
    centrado('consultify.pro', pY + pH - 97, 9.5, bold, rgb(0.72, 0.79, 0.92));

    // Pie de contraportada
    if (imgTuConsultorBlanco) {
      const lw = 100, lh = lw * (imgTuConsultorBlanco.height / imgTuConsultorBlanco.width);
      page.drawImage(imgTuConsultorBlanco, { x: (W - lw) / 2, y: 96, width: lw, height: lh });
    }
    centrado(`${em.nombre} · CIF ${em.cif}`, 74, 7.5, reg, rgb(0.55, 0.63, 0.80));
    centrado('Desde 2006 gestionando con el corazón.', 58, 7.5, reg, ORANGE);
  }

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
// Página de inversión (precios) con diseño destacado: cifra protagonista,
// desglose limpio y plan de pago visual.
function presupuesto(page, r, esImpl, esMes, M, y, W, bold, reg, wrap) {
  const tableW = W - 2 * M;
  const eur = (v) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
  const BLANCO = rgb(1, 1, 1);
  const AZUL_CLARO = rgb(0.62, 0.71, 0.88);

  // ---------- PANEL PROTAGONISTA: la cifra grande ----------
  const panelH = 108;
  const panelY = y - panelH + 14;
  page.drawRectangle({ x: M, y: panelY, width: tableW, height: panelH, color: NAVY });
  page.drawRectangle({ x: M, y: panelY + panelH - 4, width: tableW, height: 4, color: ORANGE });

  // Cifra principal según el modelo
  const cifra = esImpl && r.fraccionado ? eur(r.fraccionado.totalConIva) : eur(r.totalConIva);
  const etiquetaCifra = esImpl ? 'INVERSIÓN TOTAL DEL PROGRAMA'
    : (esMes ? 'CUOTA MENSUAL' : 'INVERSIÓN TOTAL');
  const sufijo = esMes && !esImpl ? '/mes' : '';

  page.drawText(etiquetaCifra, { x: M + 22, y: panelY + panelH - 32, size: 8, font: bold, color: ORANGE });

  const tamCifra = 34;
  page.drawText(cifra, { x: M + 22, y: panelY + panelH - 72, size: tamCifra, font: bold, color: BLANCO });
  if (sufijo) {
    const wc = bold.widthOfTextAtSize(cifra, tamCifra);
    page.drawText(sufijo, { x: M + 22 + wc + 6, y: panelY + panelH - 66, size: 13, font: reg, color: AZUL_CLARO });
  }
  page.drawText('IVA incluido', { x: M + 22, y: panelY + panelH - 88, size: 8.5, font: reg, color: AZUL_CLARO });

  // Dato secundario a la derecha del panel
  const derX = M + tableW - 165;
  if (esImpl && r.fraccionado) {
    page.drawText('DURACIÓN', { x: derX, y: panelY + panelH - 32, size: 7.5, font: bold, color: ORANGE });
    page.drawText(`${r.fraccionado.meses} meses`, { x: derX, y: panelY + panelH - 52, size: 15, font: bold, color: BLANCO });
    page.drawText('EQUIVALE A', { x: derX, y: panelY + panelH - 72, size: 7.5, font: bold, color: ORANGE });
    const mensual = r.fraccionado.totalConIva / r.fraccionado.meses;
    page.drawText(`${eur(mensual)}/mes`, { x: derX, y: panelY + panelH - 88, size: 10.5, font: bold, color: AZUL_CLARO });
  } else if (esMes) {
    page.drawText('COMPROMISO', { x: derX, y: panelY + panelH - 32, size: 7.5, font: bold, color: ORANGE });
    page.drawText('12 meses', { x: derX, y: panelY + panelH - 52, size: 15, font: bold, color: BLANCO });
    page.drawText('ANUAL EQUIVALENTE', { x: derX, y: panelY + panelH - 72, size: 7.5, font: bold, color: ORANGE });
    page.drawText(eur(r.totalConIva * 12), { x: derX, y: panelY + panelH - 88, size: 10.5, font: bold, color: AZUL_CLARO });
  } else {
    page.drawText('MODALIDAD', { x: derX, y: panelY + panelH - 32, size: 7.5, font: bold, color: ORANGE });
    page.drawText('Pago único', { x: derX, y: panelY + panelH - 52, size: 15, font: bold, color: BLANCO });
    page.drawText('BOLSA DE HORAS', { x: derX, y: panelY + panelH - 72, size: 7.5, font: bold, color: ORANGE });
    page.drawText(`${r.hTotal} horas`, { x: derX, y: panelY + panelH - 88, size: 10.5, font: bold, color: AZUL_CLARO });
  }

  // ---------- DESGLOSE ----------
  let ry = panelY - 26;
  page.drawText('DESGLOSE', { x: M, y: ry, size: 8, font: bold, color: MUTED });
  page.drawRectangle({ x: M + 62, y: ry + 3, width: tableW - 62, height: 0.6, color: rgb(0.88, 0.90, 0.94) });
  ry -= 20;

  const base = esImpl && r.fraccionado ? r.fraccionado.totalSinIva : r.precioCatalogo;
  const ivaImp = esImpl && r.fraccionado ? (r.fraccionado.totalConIva - r.fraccionado.totalSinIva) : r.iva;
  const totalImp = esImpl && r.fraccionado ? r.fraccionado.totalConIva : r.totalConIva;
  const sufBase = esMes && !esImpl ? '/mes' : '';

  const filas = [
    [esImpl ? 'Programa completo de implantación' : (esMes ? 'Cuota mensual (base imponible)' : 'Bolsa de horas (base imponible)'), eur(base) + sufBase, false],
    ['IVA (21%)', eur(ivaImp), false],
    [esImpl ? 'TOTAL DEL PROGRAMA' : (esMes ? 'TOTAL MENSUAL' : 'TOTAL'), eur(totalImp) + sufBase, true],
  ];
  for (const [con, imp, destacado] of filas) {
    if (destacado) {
      page.drawRectangle({ x: M, y: ry - 7, width: tableW, height: 26, color: SOFT });
      page.drawRectangle({ x: M, y: ry - 7, width: 3, height: 26, color: ORANGE });
    }
    page.drawText(con, { x: M + (destacado ? 12 : 2), y: ry, size: destacado ? 10 : 9.5, font: destacado ? bold : reg, color: destacado ? NAVY : INK });
    const f = bold, sz = destacado ? 11 : 9.5;
    page.drawText(imp, { x: W - M - 4 - f.widthOfTextAtSize(imp, sz), y: ry, size: sz, font: f, color: destacado ? NAVY : INK });
    if (!destacado) page.drawRectangle({ x: M, y: ry - 8, width: tableW, height: 0.5, color: rgb(0.91, 0.93, 0.96) });
    ry -= destacado ? 34 : 24;
  }

  // ---------- PLAN DE PAGO (visual) ----------
  ry -= 8;
  page.drawText('PLAN DE PAGO', { x: M, y: ry, size: 8, font: bold, color: MUTED });
  page.drawRectangle({ x: M + 76, y: ry + 3, width: tableW - 76, height: 0.6, color: rgb(0.88, 0.90, 0.94) });
  ry -= 24;

  if (esImpl && r.fraccionado) {
    // Tres hitos en columnas
    const hitos = [
      ['50%', 'Al inicio', eur(r.fraccionado.cuota1)],
      ['25%', 'A mitad del proyecto', eur(r.fraccionado.cuota2)],
      ['25%', 'Al finalizar', eur(r.fraccionado.cuota3)],
    ];
    const colW = tableW / 3;
    hitos.forEach(([pct, cuando, imp], i) => {
      const cx = M + i * colW;
      page.drawRectangle({ x: cx + 2, y: ry - 44, width: colW - 8, height: 56, color: SOFT });
      page.drawRectangle({ x: cx + 2, y: ry + 10, width: colW - 8, height: 2.5, color: ORANGE });
      page.drawText(pct, { x: cx + 12, y: ry - 8, size: 17, font: bold, color: NAVY });
      page.drawText(cuando, { x: cx + 12, y: ry - 24, size: 7.5, font: reg, color: MUTED });
      page.drawText(imp, { x: cx + 12, y: ry - 39, size: 10, font: bold, color: ORANGE_D });
    });
    ry -= 56;
  } else {
    const texto = esMes
      ? 'Cuota mensual recurrente, domiciliada o por transferencia. Permanencia mínima de 12 meses.'
      : 'Pago único del 100% al inicio del proyecto (bolsa de horas prepagada).';
    page.drawRectangle({ x: M, y: ry - 22, width: tableW, height: 34, color: SOFT });
    page.drawRectangle({ x: M, y: ry - 22, width: 3, height: 34, color: ORANGE });
    for (const ln of wrap(texto, reg, 9, tableW - 24)) {
      page.drawText(ln, { x: M + 14, y: ry - 2, size: 9, font: reg, color: INK });
      ry -= 12;
    }
    ry -= 20;
  }

  // ---------- QUÉ INCLUYE ----------
  ry -= 14;
  page.drawText('INCLUIDO EN EL PRECIO', { x: M, y: ry, size: 8, font: bold, color: MUTED });
  page.drawRectangle({ x: M + 118, y: ry + 3, width: tableW - 118, height: 0.6, color: rgb(0.88, 0.90, 0.94) });
  ry -= 20;

  const incluye = [
    'Documentación completa del sistema',
    'Formación al equipo',
    'Auditoría interna',
    'Acompañamiento a la certificación',
  ];
  const colW2 = tableW / 2;
  incluye.forEach((it, i) => {
    const cx = M + (i % 2) * colW2;
    const cy = ry - Math.floor(i / 2) * 18;
    // Marca de verificación dibujada (la fuente estándar no admite el carácter ✓).
    page.drawCircle({ x: cx + 4, y: cy + 3, size: 4.5, color: ORANGE });
    page.drawLine({ start: { x: cx + 2, y: cy + 3 }, end: { x: cx + 3.5, y: cy + 1.4 }, thickness: 1.1, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: cx + 3.5, y: cy + 1.4 }, end: { x: cx + 6.3, y: cy + 5.4 }, thickness: 1.1, color: rgb(1, 1, 1) });
    page.drawText(it, { x: cx + 15, y: cy, size: 9, font: reg, color: INK });
  });
  ry -= 40;

  // Nota final
  page.drawText('No incluye tasas de la entidad certificadora ni acompañamiento presencial a la auditoría externa (600 €/jornada).',
    { x: M, y: ry, size: 7.5, font: reg, color: MUTED });

  return ry - 10; // devuelve la Y final para que el llamador continúe
}
