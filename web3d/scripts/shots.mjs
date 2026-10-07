// Lighting look-dev screenshots: boots the published build, skips the intro, teleports down to
// each requested layer, swims a little and captures the stage.
//   npm run shots -- <outdir> <tag> [query=?webgl] [layers=0,2,4]   (EVAL=<js> logs a page expression)
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = (process.argv[2] || 'test-output') + '/';
const tag = process.argv[3] || 'shot';
const query = process.argv[4] || '?webgl';
const layers = (process.argv[5] || '0,2,4').split(',').map(Number);
mkdirSync(out, { recursive: true });
const file = 'sewerdiverdescent3d.html';
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  try { const b = readFileSync(root + (p || file)); res.writeHead(200, { 'content-type': 'text/html' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${port}/${file}${query}`);
await page.waitForTimeout(2500);
for (let i = 0; i < 40; i++) {
  const vis = await page.evaluate(() => { const b = document.getElementById('intro-ft-btns'); return !!(b && b.style.display === 'flex'); });
  if (vis) { await page.evaluate(() => document.getElementById('intro-no').click()); break; }
  await page.mouse.click(210, 300); await page.waitForTimeout(450);
}
await page.waitForTimeout(3000);
const shot = async (name) => {
  const box = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  await page.screenshot({ path: `${out}${tag}-${name}.png`, clip: box });
};
let cur = 0;
for (const L of layers) {
  while (cur < L) { await page.evaluate(() => { const b = document.querySelector('[data-a=down]'); if (b) b.click(); }); cur++; await page.waitForTimeout(1500); }
  for (const [k, ms] of [['KeyS', 900], ['KeyD', 500]]) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); }
  await page.waitForTimeout(2500);
  await shot('L' + L);
  if (process.env.EVAL) console.log(await page.evaluate(process.env.EVAL));
  console.log('L' + L, await page.evaluate(() => JSON.stringify(window.__theatre.scene.lights.map((l) => [l.tag, l.c.map((v) => +v.toFixed(2)), l.range && +l.range.toFixed(1), l.seg && l.seg.map((v) => +v.toFixed(1))]))));
}
await browser.close();
server.close();
