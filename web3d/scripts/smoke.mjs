// End-to-end smoke test for the published single-file build (../sewerdiverdescent3d.html).
//
//   npm run smoke            (after npm run build)
//
// Boots the game in headless Chromium on both backends, skips the boot intro, swims the
// diver around, opens the pack, launches the city transversal (sub) from the dev panel and
// fails on any console error. WebGL2 frames are screenshotted to test-output/. Headless
// WebGPU (SwiftShader) cannot present to a canvas, so that run renders offscreen and the
// check is: it compiles every pass, keeps producing frames and logs no errors.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = fileURLToPath(new URL('../test-output/', import.meta.url));
if (!existsSync(out)) mkdirSync(out, { recursive: true });
const file = 'sewerdiverdescent3d.html';
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  if (p === 'favicon.ico') { res.writeHead(204); res.end(); return; }
  try { const b = readFileSync(root + (p || file)); res.writeHead(200, { 'content-type': p.endsWith('.html') || !p ? 'text/html' : 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;
const IGNORE = /GroupMarker|GPU stall|swiftshader|dev test panel|WebGPU is experimental|favicon|Device Lost|Instance reference|Automatic fallback/i;

async function run(name, query, { shots }) {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`http://localhost:${port}/${file}${query}`);
  await page.waitForTimeout(1500);
  const shot = async (tag) => { if (!shots) return; const box = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }); await page.screenshot({ path: `${out}${name}-${tag}.png`, clip: box }); };
  const frames = () => page.evaluate(() => (window.__theatre && window.__theatre.renderer ? window.__theatre.renderer.frame : 0));
  const step = async (label, fn) => { const f0 = await frames(); await fn(); const f1 = await frames(); console.log(`  ${label.padEnd(22)} frames +${f1 - f0}`); if (f1 <= f0) errors.push(`no frames rendered during "${label}"`); };

  await step('boot intro', async () => { await page.waitForTimeout(2000); await shot('intro'); });
  await step('skip intro', async () => {
    for (let i = 0; i < 40; i++) {
      const vis = await page.evaluate(() => { const b = document.getElementById('intro-ft-btns'); return !!(b && b.style.display === 'flex'); });
      if (vis) { await page.evaluate(() => document.getElementById('intro-no').click()); break; }
      await page.mouse.click(210, 300); await page.waitForTimeout(450);
    }
    await page.waitForTimeout(3000);
  });
  const mode = await page.evaluate(() => window.__theatre.TH.bridge.state.mode);
  if (mode !== 'play') errors.push('expected play mode after the intro, got ' + mode);
  await step('swim', async () => {
    for (const [k, ms] of [['KeyS', 1200], ['KeyD', 700], ['KeyA', 700], ['KeyW', 500]]) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); }
    await page.waitForTimeout(1200); await shot('play');
  });
  await step('pack (menu over theatre)', async () => { await page.keyboard.press('KeyI'); await page.waitForTimeout(1500); await shot('pack'); await page.keyboard.press('KeyI'); await page.waitForTimeout(800); });
  await step('sub transversal', async () => {
    await page.evaluate(() => { const b = document.querySelector('[data-a=sub]'); if (b) b.click(); });
    await page.waitForTimeout(3500); await shot('sub');
  });
  const info = await page.evaluate(() => ({ mode: window.__theatre.TH.bridge.state.mode, backend: window.__theatre.TH.stats.backend, kind: window.__theatre.TH.frameKind }));
  console.log(`  ${JSON.stringify(info)}`);
  if (info.mode !== 'sub') errors.push('expected sub mode after launching the transversal, got ' + info.mode);
  await browser.close();
  return errors;
}

let failed = false;
for (const [name, q, opt] of [['webgl2', '?webgl', { shots: true }], ['webgpu', '?offscreen', { shots: false }]]) {
  console.log(`[${name}]`);
  const errs = await run(name, q, opt);
  if (errs.length) { failed = true; console.log('  FAIL\n   - ' + errs.join('\n   - ')); } else console.log('  ok');
}
server.close();
process.exit(failed ? 1 : 0);
