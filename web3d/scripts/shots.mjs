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
const [VWp, VHp] = (process.env.VIEW || '420x860').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: VWp, height: VHp } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${port}/${file}${query}`);
await page.waitForTimeout(2500);
for (let i = 0; i < 40; i++) {
  const vis = await page.evaluate(() => { const b = document.getElementById('intro-ft-btns'); return !!(b && b.style.display === 'flex'); });
  if (vis) { await page.evaluate(() => document.getElementById('intro-no').click()); break; }
  await page.mouse.click(VWp / 2, VHp * 0.4); await page.waitForTimeout(450);
}
await page.waitForTimeout(3000);
const shot = async (name) => {
  const box = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  await page.screenshot({ path: `${out}${tag}-${name}.png`, clip: box });
};
// keep the diver alive and breathing while it tours the layers
await page.evaluate(() => { for (const t of ['invuln', 'oxy']) { const b = document.querySelector(`#devpanel [data-t=${t}]`); if (b && !b.classList.contains('on')) b.click(); } });
let cur = 0;
for (const L of layers) {
  while (cur < L) { await page.evaluate(() => { const b = document.querySelector('[data-a=down]'); if (b) b.click(); }); cur++; await page.waitForTimeout(1500); }
  for (const [k, ms] of [['KeyS', 900], ['KeyD', 500]]) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); }
  await page.waitForTimeout(2500);
  await shot('L' + L);
  if (process.env.MOVE) {   // frames while swimming sideways (movement artifacts)
    await page.keyboard.down('KeyD');
    for (let i = 0; i < 3; i++) { await page.waitForTimeout(350); await shot('L' + L + 'm' + i); }
    await page.keyboard.up('KeyD');
  }
  if (process.env.EVAL) console.log(await page.evaluate(process.env.EVAL));
  console.log('L' + L, await page.evaluate(() => JSON.stringify(window.__theatre.scene.lights.map((l) => [l.tag, l.c.map((v) => +v.toFixed(2)), l.range && +l.range.toFixed(1), l.seg && l.seg.map((v) => +v.toFixed(1))]))));
}
await browser.close();
server.close();
