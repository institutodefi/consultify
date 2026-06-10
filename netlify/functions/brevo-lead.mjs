// netlify/functions/brevo-lead.mjs
// Crea/actualiza el contacto en Brevo con los atributos de la simulación.
// Requiere variables de entorno en Netlify:
//   BREVO_API_KEY   → API key v3 de Brevo
//   BREVO_LIST_ID   → (opcional) ID numérico de la lista de leads de la calculadora

const NORMA_ATTR = {
  '9001': 'ISO_9001', '14001': 'ISO_14001', '45001': 'ISO_45001', '27001': 'ISO_27001',
  '42001': 'ISO_42001', '56001': 'ISO_56001', '21001': 'ISO_21001', '9004': 'ISO_9004',
  'une93200': 'UNE_93200',
};

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: 'BREVO_API_KEY no configurada' }, { status: 500 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const { email, nombre = '', empresa = '', telefono = '', normas = [], modelo = '', precio = 0, tipo = 'mes', consent } = body;
  if (!email || !consent) return Response.json({ ok: false, error: 'Email y consentimiento RGPD obligatorios' }, { status: 400 });

  const attributes = {
    NOMBRE: nombre,
    EMPRESA: empresa,
    SMS: telefono || undefined,
    MODELO: modelo,
    PRECIO_CALCULADO: precio,
    TIPO_PRECIO: tipo === 'mes' ? 'MENSUAL' : 'UNICO',
    FECHA_SIMULACION: new Date().toISOString().slice(0, 10),
  };
  for (const [id, attr] of Object.entries(NORMA_ATTR)) attributes[attr] = normas.includes(id);

  const payload = {
    email,
    attributes,
    updateEnabled: true,
    ...(process.env.BREVO_LIST_ID ? { listIds: [Number(process.env.BREVO_LIST_ID)] } : {}),
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
