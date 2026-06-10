// Copia la web pública estática (landing trilingüe SEO) a la raíz de dist
// tras el build de Vite (que vive bajo /app/).
import { cpSync, mkdirSync, renameSync, existsSync, rmSync } from 'node:fs';
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

console.log('✓ dist/ listo: landing en raíz + app en /app/');
