// Synthetic plates to verify distance-true shadows: the same dark bar sits on the scenery
// (S1), actors (S3) and foreground (S4) plates in three columns over a flat light back cloth.
// With the key light alone, the shadow on the back cloth must get softer and longer the
// further its caster floats from it.
import { PlateAtlas, P_BACK, P_SCEN, P_ACT, P_FORE } from '../src/theatre/sheets.js';
import { TheatreScene } from '../src/theatre/scene.js';
import { Quality } from '../src/theatre/quality.js';
import { TheatreRenderer } from '../src/theatre/renderer.js';

const atlas = new PlateAtlas(); atlas.ensure(220, 352);
const scene = new TheatreScene();
const q = new Quality('high');
const r = new TheatreRenderer(document.getElementById('t3d'), atlas, scene, q, { forceWebGL: location.search.includes('webgl') });
await r.init();
r.resize(400, 620, 1, { x: 8, y: 8, w: 384, h: 604 });
if (location.search.includes('ks=')) r.uKeySamples.value = +new URLSearchParams(location.search).get('ks');
window.__r = r;
function paint() {
  atlas.beginWorld();
  let c = atlas.use(P_BACK); c.fillStyle = '#9aa4ac'; c.fillRect(-40, -40, 300, 432);
  c.fillStyle = '#7e8a94'; for (let y = 0; y < 352; y += 32) c.fillRect(-40, y, 300, 1);
  for (const [k, x] of [[P_SCEN, 20], [P_ACT, 90], [P_FORE, 160]]) {
    c = atlas.use(k); c.fillStyle = '#2a3038';
    c.fillRect(x, 120, 40, 14); c.fillRect(x + 14, 160, 12, 60);
  }
  atlas.end();
}
for (const p of scene.plates) p.tilt = 0;
let t = 0;
function frame() {
  paint(); t += 1 / 60;
  { const hx = +(new URLSearchParams(location.search).get('head') || 0); scene.head.tx = hx; scene.head.ty = 0; }
  scene.step(1 / 60);
  for (const p of scene.plates) { for (const s of [p.hx, p.hy, p.hz, p.rx, p.ry, p.rz]) { s.x = 0; s.v = 0; } }
  scene.buildLights({ glows: [], lantern: null });
  r.render({ dt: 1 / 60, time: t, scroll: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], plateVel: null, splats: [], current: [0, 0, 0, 0], body: [0, 0, 0], ambientSilt: 0, ambientDye: 0, bubbles: [], glassBubbles: [], siltBright: 0, hud: false, exposure: 1.0, focus: [0, 0, 27.5], tilt: 0, dofScale: 0 });
  window.__frames = (window.__frames || 0) + 1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
