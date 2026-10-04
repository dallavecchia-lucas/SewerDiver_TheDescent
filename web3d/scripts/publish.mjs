// Copies the single-file build to the repo root next to the legacy builds.
import { copyFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const src = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const dst = fileURLToPath(new URL('../../sewerdiverdescent3d.html', import.meta.url));
copyFileSync(src, dst);
console.log('published', dst, (statSync(dst).size / 1024).toFixed(0) + ' KB');
