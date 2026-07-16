// netlify/functions/brevo-lead.mjs
// Crea/actualiza el contacto en Brevo con los atributos de la simulación.
// Requiere variables de entorno en Netlify:
//   BREVO_API_KEY       → API key v3 de Brevo
//   BREVO_LIST_ID       → (opcional) lista final de leads
//   BREVO_LIST_DOI_ID   → (opcional) lista TEMPORAL de doble opt-in (pendientes de confirmar).
//                         Si está definida, el contacto entra aquí en vez de en la lista final:
//                         una automatización de Brevo le envía el email de confirmación y, al
//                         confirmar, lo pasa a la lista final. Tiene prioridad sobre BREVO_LIST_ID.

const NORMA_ATTR = {
  '9001': 'ISO_9001', '14001': 'ISO_14001', '45001': 'ISO_45001', '27001': 'ISO_27001',
  '42001': 'ISO_42001', '56001': 'ISO_56001', '21001': 'ISO_21001', '9004': 'ISO_9004',
  'une93200': 'UNE_93200', 'une158101': 'UNE_158101',
};

// Nombres legibles para construir el resumen del requerimiento (lo que verá el comercial)
const NORMA_NOMBRE = {
  '9001': 'ISO 9001', '14001': 'ISO 14001', '45001': 'ISO 45001', '27001': 'ISO 27001',
  '42001': 'ISO 42001', '56001': 'ISO 56001', '21001': 'ISO 21001', '9004': 'ISO 9004',
  'une93200': 'UNE 93200', 'une158101': 'UNE 158101',
};

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: 'BREVO_API_KEY no configurada' }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const { email, nombre = '', apellidos = '', empresa = '', telefono = '', cif = '', cargo = '', numero_oferta = '', comercial = 'Alejandro', normas = [], modelo = '', precio = 0, tipo = 'mes', meses, tiene9001 = false, mensaje = '', origen = '', consent } = body;
  // Email siempre obligatorio. El consentimiento es obligatorio para MARKETING,
  // pero un contacto de WhatsApp puede registrarse sin consentimiento (solo como
  // contacto operativo, sin entrar en la lista de doble opt-in).
  if (!email) return Response.json({ ok: false, error: 'Email obligatorio' }, { status: 400 });
  if (!consent && origen !== 'whatsapp') return Response.json({ ok: false, error: 'Email y consentimiento RGPD obligatorios' }, { status: 400 });

  const attributes = {
    NOMBRE: nombre,
    APELLIDOS: apellidos || undefined,
    EMPRESA: empresa,
    SMS: telefono || undefined,
    CIF: cif || undefined,
    CARGO: cargo || undefined,
    NUMERO_OFERTA: numero_oferta || undefined,
    COMERCIAL: comercial || 'Alejandro',
    MODELO: modelo,
    PRECIO_CALCULADO: precio,
    TIPO_PRECIO: tipo === 'mes' ? 'MENSUAL' : (tipo === 'fraccionado' ? 'FRACCIONADO' : 'UNICO'),
    MESES: meses != null && meses !== '' ? Number(meses) : undefined,
    YA_TIENE_9001: !!tiene9001,
    CONSENT_RGPD: !!consent,
    FECHA_CONSENT: new Date().toISOString().slice(0, 10),
    FECHA_SIMULACION: new Date().toISOString().slice(0, 10),
  };
  for (const [id, attr] of Object.entries(NORMA_ATTR)) attributes[attr] = normas.includes(id);

  // Resumen legible del requerimiento exacto, para que el comercial prepare la oferta (PDF/PPT)
  const nombresNormas = normas.map((id) => NORMA_NOMBRE[id] || id).join(' + ');
  const sufijoPrecio = tipo === 'mes' ? ' €/mes' : (tipo === 'fraccionado' ? ' € (proyecto)' : ' € (único)');
  attributes.REQUERIMIENTO = `${nombresNormas || '—'} · Modelo ${modelo} · ${precio}${sufijoPrecio}`;
  // Datos del formulario del blog (si vienen)
  if (mensaje) attributes.MENSAJE = mensaje;
  if (origen) attributes.ORIGEN = origen;

  // Lista de destino: si hay lista de doble opt-in (temporal), el contacto entra ahí
  // y la automatización de Brevo lo moverá a la final tras confirmar. Si no, lista final directa.
  // IMPORTANTE: solo se añade a la lista de marketing si dio CONSENTIMIENTO.
  // Sin consentimiento (posible en WhatsApp) el contacto se registra pero NO entra en ninguna lista.
  const listaDestino = process.env.BREVO_LIST_DOI_ID || process.env.BREVO_LIST_ID;
  const usaDOI = !!process.env.BREVO_LIST_DOI_ID;
  const entraEnLista = !!consent && !!listaDestino;
  attributes.DOI_PENDIENTE = entraEnLista && usaDOI;
  if (origen) attributes.ORIGEN = origen;
  attributes.CONSENT_MARKETING = !!consent;

  const payload = {
    email,
    attributes,
    updateEnabled: true,
    ...(entraEnLista ? { listIds: [Number(listaDestino)] } : {}),
  };

  const r = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  if (r.ok || r.status === 204) return Response.json({ ok: true });

  const err = await r.text();
  // "duplicate_parameter" con updateEnabled no debería ocurrir, pero por si acaso:
  if (err.includes('duplicate')) return Response.json({ ok: true, updated: true });
  return Response.json({ ok: false, error: err }, { status: 502 });
};

export const config = { path: '/.netlify/functions/brevo-lead' };
