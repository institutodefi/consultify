// =============================================================================
// Feed RSS del blog · /blog/rss.xml
// Lee los posts publicados de Supabase y genera un RSS 2.0 estándar.
// Brevo (u otro) puede consumirlo para enviar automáticamente los artículos.
//
// Publica solo posts con fecha_publicacion <= hoy y estado <> 'borrador'
// (la RLS de Supabase ya lo restringe, pero lo reforzamos en la query).
// =============================================================================

const SITE = 'https://consultify.pro';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export default async (req) => {
  const SUPA = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let posts = [];
  if (SUPA && ANON) {
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const url = `${SUPA}/rest/v1/blog_posts` +
        `?select=slug,titulo,extracto,autor,fecha_publicacion,pilar` +
        `&estado=neq.borrador&fecha_publicacion=lte.${hoy}` +
        `&order=fecha_publicacion.desc&limit=40`;
      const r = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
      if (r.ok) posts = await r.json();
    } catch { /* devolvemos feed vacío si falla */ }
  }

  const items = posts.map((p) => {
    const link = `${SITE}/blog/post.html?slug=${encodeURIComponent(p.slug)}`;
    const pub = p.fecha_publicacion ? new Date(p.fecha_publicacion + 'T08:00:00Z').toUTCString() : new Date().toUTCString();
    return `    <item>
      <title>${esc(p.titulo)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <description>${esc(p.extracto || '')}</description>
      ${p.autor ? `<author>${esc(p.autor)}</author>` : ''}
      <pubDate>${pub}</pubDate>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog de Consultify · TuConsultor</title>
    <link>${SITE}/blog/</link>
    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Gestión, normas ISO y casos reales. Consultoría de gestión desde 2006.</description>
    <language>es-ES</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      // Cache 1h para no golpear Supabase en cada lectura
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
