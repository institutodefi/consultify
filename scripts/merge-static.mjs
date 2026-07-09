// Copia la web pública estática (landing trilingüe SEO) a la raíz de dist
// tras el build de Vite (que vive bajo /app/).
import { cpSync, mkdirSync, renameSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDist = join(root, 'app', 'dist');
const finalDist = join(root, 'dist');

if (existsSync(finalDist)) rmSync(finalDist, { recursive: true });
mkdirSync(join(finalDist, 'app'), { recursive: true });

// 1) App React → /app/
cpSync(appDist, join(finalDist, 'app'), { recursive: true });
// 2) Landing estática → raíz
cpSync(join(root, 'public-site'), finalDist, { recursive: true });

// 2b) Inyectar credenciales públicas de Supabase en las páginas del blog
// (anon key: pública por diseño; la RLS restringe la lectura a posts publicados).
function leerEnv(clave) {
  if (process.env[clave]) return process.env[clave];
  // Respaldo: leer de app/.env (build local). En Netlify vienen por process.env.
  try {
    const envPath = join(root, 'app', '.env');
    if (existsSync(envPath)) {
      const linea = readFileSync(envPath, 'utf8').split('\n').find(l => l.startsWith(clave + '='));
      if (linea) return linea.slice(clave.length + 1).trim();
    }
  } catch { /* noop */ }
  return '';
}
const SB_URL = leerEnv('VITE_SUPABASE_URL') || leerEnv('SUPABASE_URL');
const SB_ANON = leerEnv('VITE_SUPABASE_ANON_KEY') || leerEnv('SUPABASE_ANON_KEY');
for (const rel of ['blog/index.html', 'blog/post.html']) {
  const f = join(finalDist, rel);
  if (existsSync(f)) {
    let html = readFileSync(f, 'utf8');
    html = html.replaceAll('__SUPABASE_URL__', SB_URL).replaceAll('__SUPABASE_ANON_KEY__', SB_ANON);
    writeFileSync(f, html);
  }
}
if (!SB_URL || !SB_ANON) console.warn('⚠ merge-static: faltan VITE_SUPABASE_URL / ANON_KEY; el blog no cargará posts.');

console.log('✓ dist/ listo: landing en raíz + app en /app/');
