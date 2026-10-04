// SEWER DIVER — THE FLOODED THEATRE
//
// Registers window.SD_THEATRE before the legacy game boots. The game keeps simulating and
// drawing exactly as before; its draw calls land on hovering plastic plates (sheets.js),
// and this module presents them as a tiny flooded diorama behind a curved CRT faceplate.
//
// URL switches:  ?flat      the original 2D game, no theatre
//                ?webgl     force the WebGL2 backend      ?quality=ultra|high|mobile|low
//                ?offscreen render to a target (headless test snapshots)   ?debug  stats overlay
import { PlateAtlas, MARGIN, PLATES, NPLATES, P_CARD, P_ACT, P_BACK } from './sheets.js';
import { TheatreScene } from './scene.js';
import { Quality } from './quality.js';
import { WaterDirector } from './water.js';
import { drawForeground } from './foreground.js';
import { OPT, glassRay, eyePos } from './optics.js';

const params = new URLSearchParams(location.search);

const TH = {
  enabled: !params.has('flat'),
  ready: false,
  atlas: new PlateAtlas(),
  margin: MARGIN,
  frameKind: 'flat',
  lantern: null,
  bridge: null,
  stats: { backend: 'none', fps: 0, tier: '', scale: 1 },

  bind(b) { this.bridge = b; },
  worldFrame() { this._gameStamp = performance.now(); this._lastKind = 'world'; },
  subFrame() { this._gameStamp = performance.now(); this._lastKind = 'sub'; this.lantern = null; },
  drawForeground(ctx) { drawForeground(ctx, this.bridge, MARGIN); },

  // pointer (client px) -> game-view px on the card flat, back through the glass + water
  clientToCard(cx, cy) { return mapClientToPlate(cx, cy, P_CARD); },
  // plate k view px -> #stage-relative css px (for DOM prompts that float over the theatre)
  viewToStage(k, vx, vy) { return mapPlateToStage(k, vx, vy); },
};
window.SD_THEATRE = TH;

let renderer = null, scene = null, quality = null, water = null;
let stage = null, canvas3d = null, flatCanvas = null;
const cssView = { x: 0, y: 0, w: 1, h: 1 }, cssStage = { w: 1, h: 1 };

if (TH.enabled) boot();

function boot() {
  document.body.classList.add('theatre');
  const style = document.createElement('style');
  style.textContent = `
    body.theatre #crt{display:none!important}
    body.theatre #stage::after{display:none!important}
    body.theatre #stage{background:#020406!important}
    body.theatre #c{opacity:0;position:relative;z-index:2}
    body.theatre.theatre-cpu #c{opacity:1}
    #theatre3d{position:absolute;left:0;top:0;z-index:1;pointer-events:none;display:block;border-radius:inherit}
    #theatre-dbg{position:absolute;left:6px;bottom:6px;z-index:30;font:9px/1.3 'Courier New',monospace;color:#7fd0ee;background:rgba(0,0,0,.55);padding:3px 5px;border-radius:3px;pointer-events:none;white-space:pre}
  `;
  document.head.appendChild(style);
  stage = document.getElementById('stage');
  flatCanvas = document.getElementById('c');
  canvas3d = document.createElement('canvas');
  canvas3d.id = 'theatre3d';
  stage.insertBefore(canvas3d, stage.firstChild);
  scene = new TheatreScene();
  quality = new Quality(params.get('quality'));
  water = new WaterDirector(scene);
  setupHead();
  startGPU();
  requestAnimationFrame(loop);
}

async function startGPU() {
  try {
    const { TheatreRenderer } = await import('./renderer.js');
    renderer = new TheatreRenderer(canvas3d, TH.atlas, scene, quality, { offscreen: params.has('offscreen'), forceWebGL: params.has('webgl') });
    await renderer.init();
    TH.stats.backend = renderer.backend;
    TH.stats.tier = quality.current.name;
    TH.ready = true;
  } catch (e) {
    console.error('SEWER DIVER theatre: GPU path unavailable, falling back to flat plates', e);
    document.body.classList.add('theatre-cpu');
    renderer = null;
  }
}

// ------------------------------------------------------------------ head-coupled parallax
let gyroBase = null, motion = [0, 0, 0];
function setupHead() {
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = stage.getBoundingClientRect();
    scene.head.tx = ((e.clientX - r.left) / r.width - 0.5) * 2 * 5.5;
    scene.head.ty = -((e.clientY - r.top) / r.height - 0.5) * 2 * 4.0;
  });
  stage.addEventListener('pointerleave', () => { scene.head.tx = 0; scene.head.ty = 0; });
  const onOri = (e) => {
    if (e.beta == null || e.gamma == null) return;
    if (!gyroBase) gyroBase = { b: e.beta, g: e.gamma };
    // the baseline follows slowly, so holding the phone still re-centres the view
    gyroBase.b += (e.beta - gyroBase.b) * 0.01; gyroBase.g += (e.gamma - gyroBase.g) * 0.01;
    scene.head.tx = Math.max(-7, Math.min(7, (e.gamma - gyroBase.g) * 0.28));
    scene.head.ty = Math.max(-6, Math.min(6, -(e.beta - gyroBase.b) * 0.22));
  };
  const onMot = (e) => { const a = e.acceleration; if (a && a.x != null) { motion[0] = a.x; motion[1] = a.y; motion[2] = a.z || 0; } };
  const arm = () => {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then((s) => { if (s === 'granted') { window.addEventListener('deviceorientation', onOri); window.addEventListener('devicemotion', onMot); } }).catch(() => {});
    } else { window.addEventListener('deviceorientation', onOri); window.addEventListener('devicemotion', onMot); }
    window.removeEventListener('pointerdown', arm, true);
  };
  window.addEventListener('pointerdown', arm, true);
}

// ------------------------------------------------------------------ presentation loop
let last = performance.now(), prevScroll = null, prevKind = '', fpsAcc = 0, fpsN = 0, dbg = null;
const focus = { y: 0, v: 0, z: PLATES[P_ACT].z };

function measure() {
  const sr = stage.getBoundingClientRect(), cr = flatCanvas.getBoundingClientRect();
  cssStage.w = sr.width; cssStage.h = sr.height;
  cssView.x = cr.left - sr.left; cssView.y = cr.top - sr.top; cssView.w = cr.width; cssView.h = cr.height;
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000)); last = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { TH.stats.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const B = TH.bridge;
  measure();
  // the boot intro draws with its own loop and never calls render(): no stamp yet = flat
  const gameLive = TH._gameStamp && now - TH._gameStamp < 2000;
  const kind = gameLive && TH.frameKind !== 'flat' ? TH._lastKind : 'flat';

  // flat frames (boot intro, menus, minigames): the legacy canvas becomes the card flat
  const vw = (B && B.VW) || flatCanvas.width, vh = (B && B.VH) || flatCanvas.height;
  TH.atlas.ensure(vw, vh);
  if (kind === 'flat') TH.atlas.paintCard(flatCanvas);
  scene.card.shown = kind === 'flat';

  if (TH.paused) return;
  if (!renderer || !TH.ready) { if (document.body.classList.contains('theatre-cpu')) cpuComposite(kind); return; }
  if (quality.observe(dt * 1000)) renderer.size.w = 0;   // force a resize at the new render scale
  renderer.resize(cssStage.w, cssStage.h, Math.min(window.devicePixelRatio || 1, quality.current.dpr), cssView);

  // per-plate content scroll since the last upload (exact reprojection of the light)
  const scroll = [];
  let cam = null;
  if (B && kind === 'world') cam = [B.RCX, B.RCY];
  else if (B && kind === 'sub' && B.subS) cam = [B.subS.dist - B.subS.sx, 0];
  for (let k = 0; k < NPLATES; k++) {
    if (k === P_CARD) { scroll.push([0, 0]); continue; }
    if (!cam || !prevScroll || prevKind !== kind) { scroll.push(null); continue; }
    const par = kind === 'sub' ? (k === P_BACK ? 0 : 1) : PLATES[k].par;
    // the legacy rounds parallax layers to whole pixels: reproject by exactly what it drew
    scroll.push([Math.round(cam[0] * par) - Math.round(prevScroll[0] * par), Math.round(cam[1] * par) - Math.round(prevScroll[1] * par)]);
  }
  const plateVel = scroll.map((s, k) => (s && k !== P_CARD ? [-s[0] * scene.plates[k].s / dt, s[1] * scene.plates[k].s / dt] : null));
  if (cam) prevScroll = cam;
  prevKind = kind;

  scene.step(dt);
  let keyScale = 1;
  if (B && B.player && kind === 'world') {
    const env = B.envOfTier(B.tAt(B.player.y)) || 0;
    keyScale = Math.max(0.3, Math.pow(0.78, env)) * (B.player.builtFloodlight ? 1.3 : 1);
  }
  const lights = { glows: B && kind !== 'flat' ? B.glows : [], lantern: kind === 'world' ? TH.lantern : null, boat: kind === 'sub' && B ? { x: B.subS.sx, y: B.subS.y } : null, keyScale };
  scene.buildLights(lights);
  const only = window.__theatreLights || params.get('lights');   // debug: isolate light groups
  if (only) scene.lights = scene.lights.filter((l, i) => (only.includes('key') && i === 0) || (only.includes('lantern') && (i === 1 || i === 2)) || (only.includes('glows') && i > 2));

  const f = { dt, time: now / 1000, scroll, plateVel, splats: [], current: [0, 0, 0, 0], body: [-motion[0] * 9, -motion[1] * 9, motion[2] * 4], ambientSilt: 0.05, ambientDye: 0 };
  water.frame(B, kind, dt, f);
  f.bubbles = water.bubbles;
  f.glassBubbles = water.glass;
  f.siltBright = 1;
  f.hud = kind !== 'flat';
  f.exposure = 1.08;

  // autofocus: the focal band follows the diver's row with a soft, slightly lazy pull
  let fy = 0;
  if (kind === 'world' && TH.lantern) fy = scene.viewToBox(P_ACT, TH.lantern.x, TH.lantern.y)[1];
  else if (kind === 'sub' && B) fy = scene.viewToBox(P_ACT, B.subS.sx, B.subS.y)[1];
  else fy = scene.plates[P_CARD].cy;
  const k = 30, c = 2 * Math.sqrt(k) * 0.9;           // ~0.7 s rack focus with a hint of overshoot
  focus.v += (k * (fy - focus.y) - c * focus.v) * dt; focus.y += focus.v * dt;
  focus.z = kind === 'flat' ? scene.plates[P_CARD].z : PLATES[P_ACT].z;
  f.focus = [0, focus.y, focus.z];
  f.tilt = kind === 'flat' ? 0.0 : 1.02;          // flat: focus lies on the card, the box behind melts
  f.dofScale = kind === 'flat' ? 0.35 : 0.62;

  const views = { compose: 1, vol: 2, irr: 3, albedo: 4, coc: 5, fluid: 6, spec: 7, hud: 8, hv: 9, velocity: 10 };
  renderer.U.uDebugView.value = views[window.__theatreView || params.get('view')] || 0;
  renderer.render(f);
  if (params.has('debug')) debugOverlay();
}

function debugOverlay() {
  if (!dbg) { dbg = document.createElement('div'); dbg.id = 'theatre-dbg'; stage.appendChild(dbg); }
  dbg.textContent = `${TH.stats.backend} · ${quality.current.name} · x${quality.renderScale.toFixed(2)} · ${TH.stats.fps} fps\nlights ${scene.lights.length} · bubbles ${water.bubbles.length}/${water.glass.length}`;
}

// No GPU at all: still play, with the plates flattened back onto the 2D canvas.
function cpuComposite(kind) {
  if (kind === 'flat') return;
  const c = flatCanvas.getContext('2d'), a = TH.atlas;
  c.clearRect(0, 0, flatCanvas.width, flatCanvas.height);
  for (let k = 0; k < NPLATES; k++) { if (k === P_CARD) continue; c.drawImage(a.alb, MARGIN, k * a.ph + MARGIN, a.vw, a.vh, 0, 0, a.vw, a.vh); }
  c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < NPLATES; k++) { if (k === P_CARD) continue; c.drawImage(a.emi, MARGIN, k * a.ph + MARGIN, a.vw, a.vh, 0, 0, a.vw, a.vh); }
  c.globalCompositeOperation = 'source-over';
  c.drawImage(a.hud, 0, 0);
}

// ------------------------------------------------------------------ input / prompt mapping
function windowFromStage(sx, sy) {
  const mm = (2 * OPT.HH) / cssView.h;
  return [(sx - (cssView.x + cssView.w / 2)) * mm, ((cssView.y + cssView.h / 2) - sy) * mm];
}
function hitPlate(k, w) {
  const p = scene.plates[k];
  if (!p._C) return null;
  const r = glassRay(eyePos(scene.head), w[0], w[1]);
  const N = p._N, C = p._C, U = p._U, V = p._V;
  const den = r.d[0] * N.x + r.d[1] * N.y + r.d[2] * N.z;
  const t = ((C[0] - r.o[0]) * N.x + (C[1] - r.o[1]) * N.y + (C[2] - r.o[2]) * N.z) / den;
  const q = [r.o[0] + r.d[0] * t - C[0], r.o[1] + r.d[1] * t - C[1], r.o[2] + r.d[2] * t - C[2]];
  return [(q[0] * U.x + q[1] * U.y + q[2] * U.z) / p.s + scene.vw / 2, -(q[0] * V.x + q[1] * V.y + q[2] * V.z) / p.s + scene.vh / 2];
}
function mapClientToPlate(cx, cy, k) {
  const sr = stage.getBoundingClientRect();
  const v = TH.ready ? hitPlate(k, windowFromStage(cx - sr.left, cy - sr.top)) : null;
  if (v) return v;
  const r = flatCanvas.getBoundingClientRect();
  return [(cx - r.left) / r.width * flatCanvas.width, (cy - r.top) / r.height * flatCanvas.height];
}
function mapPlateToStage(k, vx, vy) {
  // invert the optics by fixed-point iteration from the paraxial guess (converges in ~4 steps)
  let sx = cssView.x + (vx / scene.vw) * cssView.w, sy = cssView.y + (vy / scene.vh) * cssView.h;
  for (let i = 0; i < 5; i++) {
    const h = hitPlate(k, windowFromStage(sx, sy));
    if (!h) break;
    sx += (vx - h[0]) / scene.vw * cssView.w * 0.95;
    sy += (vy - h[1]) / scene.vh * cssView.h * 0.95;
  }
  return [sx, sy];
}

// debug hooks for automated checks
window.__theatre = {
  TH, focus, get scene() { return scene; }, get renderer() { return renderer; }, get quality() { return quality; }, get water() { return water; },
  async snapshot() {
    if (!renderer) return null;
    TH.paused = true;
    await new Promise((r) => setTimeout(r, 120));
    try { return await renderer.snapshot(); } finally { TH.paused = false; }
  },
};
