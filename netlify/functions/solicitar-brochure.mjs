// netlify/functions/solicitar-brochure.mjs
// Recibe la solicitud de brochure desde el formulario del blog:
//   1. Valida datos + consentimiento RGPD
//   2. Guarda el lead en Supabase (tabla solicitudes_brochure) con service_role
//   3. Da de alta/actualiza el contacto en Brevo (lista de leads)
//   4. Envía un email transaccional con el enlace de descarga del brochure
//
// Variables de entorno necesarias en Netlify:
//   SUPABASE_URL                → https://ttcnbuxfewmuwbgapmws.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   → service_role key (NUNCA exponer en cliente)
//   BREVO_API_KEY               → API key v3 de Brevo
//   BREVO_LIST_ID               → (opcional) lista de leads de brochure
//   BREVO_SENDER_EMAIL          → (opcional) remitente, por defecto hola@consultify.pro
//   SITE_URL                    → (opcional) por defecto https://consultify.pro

const NORMAS = {
  'iso-9001':   { code: 'ISO 9001',   name: 'Sistema de Gestión de la Calidad' },
  'iso-14001':  { code: 'ISO 14001',  name: 'Sistema de Gestión Ambiental' },
  'iso-27001':  { code: 'ISO 27001',  name: 'Seguridad de la Información' },
  'iso-45001':  { code: 'ISO 45001',  name: 'Seguridad y Salud en el Trabajo' },
  'iso-42001':  { code: 'ISO 42001',  name: 'Gestión de la Inteligencia Artificial' },
  'iso-56001':  { code: 'ISO 56001',  name: 'Gestión de la Innovación' },
  'iso-21001':  { code: 'ISO 21001',  name: 'Organizaciones Educativas' },
  'iso-9004':   { code: 'ISO 9004',   name: 'Calidad Sostenible' },
  'une-93200':  { code: 'UNE 93200',  name: 'Cartas de Servicios' },
  'une-158101': { code: 'UNE 158101', name: 'Centros Residenciales y de Día' },
};

// Textos del email según idioma
const EMAIL_I18N = {
  es: {
    subject: (c) => `Tu brochure de ${c} · Consultify`,
    hi: (n) => `Hola ${n || ''},`.trim(),
    intro: (code, name) => `Gracias por tu interés. Aquí tienes el brochure de <strong>${code} · ${name}</strong> que solicitaste:`,
    button: 'Descargar brochure (PDF)',
    ps: 'Si tienes cualquier duda, respóndenos a este correo o escríbenos por WhatsApp al +34 615 478 641.',
    calc: 'Calcula tu precio en consultify.pro',
    footer: 'El Spotify de la consultoría · Impulsada por IA · Una línea de TuConsultor',
  },
  en: {
    subject: (c) => `Your ${c} brochure · Consultify`,
    hi: (n) => `Hi ${n || ''},`.trim(),
    intro: (code, name) => `Thanks for your interest. Here is the <strong>${code} · ${name}</strong> brochure you requested:`,
    button: 'Download brochure (PDF)',
    ps: 'Any questions? Just reply to this email or message us on WhatsApp at +34 615 478 641.',
    calc: 'Calculate your price at consultify.pro',
    footer: 'The Spotify of consulting · AI-powered · A line of TuConsultor',
  },
  ar: {
    subject: (c) => `كتيّب ${c} الخاص بك · Consultify`,
    hi: (n) => `مرحباً ${n || ''}،`.trim(),
    intro: (code, name) => `شكراً لاهتمامك. إليك كتيّب <strong>${code} · ${name}</strong> الذي طلبته:`,
    button: 'تحميل الكتيّب (PDF)',
    ps: 'لأي استفسار، يمكنك الرد على هذا البريد أو مراسلتنا عبر واتساب على 34615478641+.',
    calc: 'احسب سعرك على consultify.pro',
    footer: 'سبوتيفاي الاستشارات · مدعومة بالذكاء الاصطناعي · خط من TuConsultor',
  },
};

function emailHTML(lang, data) {
  const t = EMAIL_I18N[lang] || EMAIL_I18N.es;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const align = lang === 'ar' ? 'right' : 'left';
  return `<!DOCTYPE html><html dir="${dir}"><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#061B45">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(6,27,69,.08)">
        <tr><td style="background:#061B45;padding:22px 28px">
          <span style="color:#fff;font-size:20px;font-weight:800">Consultify</span>
        </td></tr>
        <tr><td style="padding:28px;text-align:${align}">
          <p style="font-size:15px;margin:0 0 14px">${t.hi(data.nombre)}</p>
          <p style="font-size:15px;line-height:1.5;margin:0 0 22px">${t.intro(data.code, data.name)}</p>
          <p style="text-align:center;margin:0 0 24px">
            <a href="${data.url}" style="display:inline-block;background:#F5A623;color:#061B45;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:24px">${t.button}</a>
          </p>
          <p style="font-size:13px;line-height:1.5;color:#5a6473;margin:0 0 8px">${t.ps}</p>
          <p style="font-size:13px;margin:0"><a href="https://consultify.pro/app/calculadora" style="color:#0A2A6C">${t.calc}</a></p>
        </td></tr>
        <tr><td style="background:#061B45;padding:16px 28px;text-align:center">
          <span style="color:#9db4e0;font-size:12px">${t.footer}</span>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }

  const {
    nombre = '', email = '', empresa = '', telefono = '',
    norma_slug = '', idioma = 'es', consent = false,
    origen = 'blog', utm_source = '', utm_medium = '', utm_campaign = '',
  } = body;

  const lang = ['es', 'en', 'ar'].includes(idioma) ? idioma : 'es';
  const norma = NORMAS[norma_slug];

  if (!email || !nombre) return Response.json({ ok: false, error: 'Nombre y email obligatorios' }, { status: 400 });
  if (!norma) return Response.json({ ok: false, error: 'Norma no válida' }, { status: 400 });
  if (!consent) return Response.json({ ok: false, error: 'Consentimiento RGPD obligatorio' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ ok: false, error: 'Email no válido' }, { status: 400 });

  const SITE = process.env.SITE_URL || 'https://consultify.pro';
  // Se entrega el DOSSIER fusionado (brochure + monográfico ejecutivo) en el idioma del usuario.
  const dossierUrl = `${SITE}/dossiers/consultify-${norma_slug}-dossier-${lang}.pdf`;

  let supabaseOk = false, brevoOk = false, emailOk = false;

  // ---- 1. Guardar en Supabase (service_role, salta RLS) ----
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (SUPA_URL && SUPA_KEY) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/solicitudes_brochure`, {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          nombre, email, empresa, telefono,
          norma_slug, norma_code: norma.code, idioma: lang,
          consent_rgpd: !!consent, origen, utm_source, utm_medium, utm_campaign,
        }),
      });
      supabaseOk = r.ok;
    } catch (e) { supabaseOk = false; }
  }

  // ---- 2. Alta/actualización de contacto en Brevo ----
  const BREVO = process.env.BREVO_API_KEY;
  if (BREVO) {
    try {
      const listId = process.env.BREVO_LIST_ID;
      const r = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': BREVO, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email,
          attributes: {
            NOMBRE: nombre, EMPRESA: empresa, SMS: telefono || undefined,
            BROCHURE_SOLICITADO: norma.code,
            IDIOMA: lang.toUpperCase(),
            CONSENT_RGPD: !!consent,
            FECHA_BROCHURE: new Date().toISOString().slice(0, 10),
          },
          updateEnabled: true,
          ...(listId ? { listIds: [Number(listId)] } : {}),
        }),
      });
      brevoOk = r.ok || r.status === 204;
    } catch (e) { brevoOk = false; }
  }

  // ---- 3. Email transaccional con el brochure ----
  if (BREVO) {
    try {
      const sender = process.env.BREVO_SENDER_EMAIL || 'hola@consultify.pro';
      const t = EMAIL_I18N[lang] || EMAIL_I18N.es;
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Consultify', email: sender },
          to: [{ email, name: nombre }],
          subject: t.subject(norma.code),
          htmlContent: emailHTML(lang, { nombre, code: norma.code, name: norma.name, url: dossierUrl }),
          tags: ['brochure', norma_slug],
        }),
      });
      emailOk = r.ok;
    } catch (e) { emailOk = false; }
  }

  // Respuesta al front: ok si al menos se pudo entregar el brochure (email) o guardar el lead
  const ok = emailOk || supabaseOk;
  return Response.json({
    ok,
    email_enviado: emailOk,
    guardado: supabaseOk,
    brevo: brevoOk,
    // Fallback: si el email falló pero todo lo demás fue bien, el front puede ofrecer descarga directa
    download_url: dossierUrl,
  }, { status: ok ? 200 : 502 });
};

export const config = { path: '/.netlify/functions/solicitar-brochure' };
