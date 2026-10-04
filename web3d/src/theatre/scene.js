// CPU side of the theatre: where the plates float, how they hover, which lights burn and
// what the water looks like this frame. Everything here ends up in GPUState uniforms.
import * as THREE from 'three/webgpu';
import { OPT, calibratePlate } from './optics.js';
import { PLATES, NPLATES, MARGIN, P_CARD, P_ACT, P_ROCK, P_BACK } from './sheets.js';
import { MAX_LIGHTS } from './gpu.js';

const hex = (h) => { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; };
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// critically-ish damped spring, integrated per frame
class Spring {
  constructor(k = 38, c = 7.5) { this.x = 0; this.v = 0; this.k = k; this.c = c; this.target = 0; }
  step(dt) { const a = -this.k * (this.x - this.target) - this.c * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; }
  kick(dv) { this.v += dv; }
}

export class TheatreScene {
  constructor() {
    this.vw = 220; this.vh = 352;
    this.halfW = 30; this.halfH = OPT.HH;
    this.head = { x: 0, y: 0, tx: 0, ty: 0 };
    this.plates = PLATES.map((p, i) => ({
      ...p, i,
      s: 0.3, cx: 0, cy: 0,
      // magnetic hover: drift (mm) and tilt (rad) springs, independent phases per plate
      hx: new Spring(30, 6), hy: new Spring(30, 6), hz: new Spring(26, 5.5),
      rx: new Spring(40, 7), ry: new Spring(40, 7), rz: new Spring(48, 8),
      ph: [Math.random() * 100, Math.random() * 100, Math.random() * 100],
      enabled: i !== P_CARD,
    }));
    this.card = { x: new Spring(26, 7.2), shown: false, glow: 0 };
    this.card.x.x = this.card.x.target = 1.6;   // parked off to the right
    this.lights = [];
    this.water = {
      base: [0.07, 0.19, 0.25], target: [0.07, 0.19, 0.25],
      pollution: 0, pollTarget: 0, murk: 0,
      dye: [0.45, 0.62, 0.16],
    };
    this.grime = 0.12;
    this.t = 0;
  }

  // ---- layout: called when the view rect / game view size changes
  layout(vw, vh, halfW, halfH) {
    this.vw = vw; this.vh = vh; this.halfW = halfW; this.halfH = halfH;
    for (const p of this.plates) {
      const c = calibratePlate(p.z, halfW, halfH, vw, vh);
      p.s = c.s; p.cx = c.cx; p.cy = c.cy;
      // the card flat is a little smaller than the stage opening, so its hovering edge and the
      // shadow it throws on the theatre behind always show
      if (p.i === P_CARD) p.s *= 0.93;
    }
    // fit view-px <-> box mapping as a function of depth (particles, splats, prompts)
    this.depthFit = [0, 10, 20, 30, 40, 50, 57].map((z) => ({ z, ...calibratePlate(z, halfW, halfH, vw, vh) }));
  }
  // mm per view px and centre at depth z (piecewise linear over the calibration table)
  atDepth(z) {
    const T = this.depthFit; if (!T) return { s: 0.3, cx: 0, cy: 0 };
    if (z <= T[0].z) return T[0];
    for (let i = 1; i < T.length; i++) if (z <= T[i].z) {
      const a = T[i - 1], b = T[i], f = (z - a.z) / (b.z - a.z);
      return { s: a.s + (b.s - a.s) * f, cx: a.cx + (b.cx - a.cx) * f, cy: a.cy + (b.cy - a.cy) * f };
    }
    return T[T.length - 1];
  }
  // world view px (on plate k) -> box mm
  viewToBox(k, vx, vy, dz = 0) {
    const p = this.plates[k];
    return [p.cx + (vx - this.vw / 2) * p.s + p.hx.x, p.cy - (vy - this.vh / 2) * p.s + p.hy.x, p.z + p.hz.x + dz];
  }

  // ---- per-frame: hover springs, card glide, head parallax
  step(dt, info) {
    this.t += dt;
    const t = this.t;
    // head-coupled eye eases toward the gyro / mouse target
    this.head.x += (this.head.tx - this.head.x) * Math.min(1, dt * 6);
    this.head.y += (this.head.ty - this.head.y) * Math.min(1, dt * 6);
    for (const p of this.plates) {
      // slow magnetic drift: each plate breathes on its own clock, fractions of a mm / degree
      const a = 0.22 + (p.i === P_BACK ? -0.1 : 0);
      p.hx.target = Math.sin(t * 0.31 + p.ph[0]) * a * 0.6;
      p.hy.target = Math.sin(t * 0.43 + p.ph[1]) * a;
      p.hz.target = Math.sin(t * 0.27 + p.ph[2]) * a * 0.8;
      p.rx.target = Math.sin(t * 0.37 + p.ph[1] * 1.3) * p.tilt;
      p.ry.target = Math.sin(t * 0.29 + p.ph[2] * 1.7) * p.tilt;
      p.rz.target = Math.sin(t * 0.23 + p.ph[0] * 0.7) * p.tilt * 0.35;
      for (const s of [p.hx, p.hy, p.hz, p.rx, p.ry, p.rz]) s.step(dt);
    }
    // the card flat glides in from the side, overshoots a touch and settles on its spring
    this.card.x.target = this.card.shown ? 0 : 1.6;
    this.card.x.step(dt);
    const cardP = this.plates[P_CARD];
    cardP.enabled = this.card.x.x < 1.25;
    this.card.glow += ((this.card.shown ? 1 : 0) - this.card.glow) * Math.min(1, dt * 5);
  }
  // water-borne knocks: dash / blast / big wake nudge the plates near the event
  nudge(k, fx, fy, fz) {
    for (const p of this.plates) {
      const d = Math.abs(p.i - k), f = d === 0 ? 1 : d === 1 ? 0.45 : 0.15;
      p.hx.kick(fx * f); p.hy.kick(fy * f); p.hz.kick(fz * f);
      p.rx.kick(-fy * f * 0.004); p.ry.kick(fx * f * 0.004);
    }
  }

  // ---- write plates to the GPU
  uploadPlates(G) {
    for (const p of this.plates) {
      let cx = p.cx + p.hx.x, cy = p.cy + p.hy.x, cz = p.z + p.hz.x;
      if (p.i === P_CARD) cx += this.card.x.x * this.halfW * 2.4;
      // basis from small tilt angles (rx about x, ry about y, rz about z)
      const e = new THREE.Euler(p.rx.x, p.ry.x, p.rz.x, 'XYZ');
      const U = new THREE.Vector3(1, 0, 0).applyEuler(e), V = new THREE.Vector3(0, 1, 0).applyEuler(e), N = new THREE.Vector3(0, 0, 1).applyEuler(e);
      p._C = [cx, cy, cz]; p._U = U; p._V = V; p._N = N;
      G.uPC.array[p.i].set(cx, cy, cz, p.s);
      G.uPU.array[p.i].set(U.x, U.y, U.z, p.thick);
      G.uPV.array[p.i].set(V.x, V.y, V.z, p.enabled ? 1 : 0);
      G.uPN.array[p.i].set(N.x, N.y, N.z, p.par);
    }
  }

  // ---- lights. Order matters: [0] key (room light through the glass), [1] lantern,
  // [2] lantern self-pool, then glows by strength. The first uNVL also scatter in the water.
  buildLights(info) {
    const L = [];
    // room key light: far above the viewer's shoulder, shining down through the faceplate.
    // Big angular size -> soft, distance-true penumbrae. Warm-white, attenuated by the water.
    // the stage's key light dims with every environment you descend (darkness is a mechanic
    // in this game); the Floodlight Rig upgrade lifts it again
    const kI = 4.4 * (info.keyScale == null ? 1 : info.keyScale);
    L.push({ p: [-46, 82, 235], r: 26, c: [1.0 * kI, 0.95 * kI, 0.86 * kI], range: -1, dir: null, k: -1, tag: 'key' });
    const lan = info.lantern;
    let selfPool = null;
    if (lan) {
      // the helmet lamp hangs just in front of the actors plate and throws its cone back into
      // the box: the beam lands on the rock right behind the diver and spreads wider on the
      // back cloth, so every creature in it casts a big, soft shadow-play silhouette
      const P = this.viewToBox(P_ACT, lan.x, lan.y, 4.5);
      const ang = Math.atan2(-lan.ly, lan.lx);           // view +y is down; box +y is up
      const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), -1.15).normalize();
      const reach = lan.R * this.plates[P_ACT].s * 1.3 + 30;
      const mech = lan.mech ? 1.3 : 1;
      // carrier radius: the lamp never lights the diver (or the MULE) wearing it, and its
      // scattering in the water fades in over the first few mm instead of a hot halo
      const carrier = (lan.mech ? 16 : 10) * this.plates[P_ACT].s;
      L.push({ p: P, r: 1.3, c: [0.8 * 9 * mech, 0.9 * 9 * mech, 1.0 * 9 * mech], range: reach, dir: [dir.x, dir.y, dir.z, Math.cos(lan.half * 1.18)], k: P_ACT, x: [P_ACT, carrier, 9], tag: 'lantern' });
      // the soft pool around you lights your surroundings, not you; it is not volumetric
      // (it goes last, after the glows, so it never counts toward the scattering lights)
      selfPool = { p: [P[0], P[1], P[2] + 1.5], r: 1.0, c: [0.5 * 1.6, 0.66 * 1.6, 0.85 * 1.6], range: lan.self * this.plates[P_ACT].s * 1.6 + 16, dir: null, k: P_ACT, x: [P_ACT, carrier, 0], tag: 'lantern' };
    } else if (info.boat) {
      const b = info.boat;
      const P = this.viewToBox(P_ACT, b.x + 18, b.y, 5);
      L.push({ p: P, r: 1.4, c: [0.85 * 3.6, 0.9 * 3.6, 1.0 * 3.6], range: 140 * this.plates[P_ACT].s, dir: [0.96, 0, -0.28, Math.cos(0.55)], k: P_ACT, x: [P_ACT, 6 * this.plates[P_ACT].s, 9], tag: 'lantern' });
      selfPool = { p: [P[0] - 6, P[1], P[2] + 1], r: 1, c: [0.4, 0.5, 0.6], range: 30 * this.plates[P_ACT].s, dir: null, k: P_ACT, x: [P_ACT, 14 * this.plates[P_ACT].s, 0], tag: 'lantern' };
    }
    // glows -> small area lights hovering just in front of their plate. Neighbouring glows
    // (a row of sludge tiles, a lamp column) merge into one light per 40 px cell with a
    // sub-linear intensity, so dense glow fields light the stage instead of flooding it.
    const cells = new Map();
    for (const g of info.glows || []) {
      if (!(g.a > 0.02) || !(g.r > 1)) continue;
      if (g.x < -60 || g.y < -60 || g.x > this.vw + 60 || g.y > this.vh + 60) continue;
      const k = g.k == null ? P_ACT : g.k;
      const key = k + ':' + Math.floor(g.x / 40) + ':' + Math.floor(g.y / 40);
      const rgb = String(g.col || '255,255,255').split(',').map((n) => (+n || 0) / 255);
      let c = cells.get(key);
      if (!c) { c = { k, x: 0, y: 0, w: 0, a2: 0, r: 0, c: [0, 0, 0] }; cells.set(key, c); }
      const wgt = g.a * g.r;
      c.x += g.x * wgt; c.y += g.y * wgt; c.w += wgt; c.a2 += g.a * g.a; c.r = Math.max(c.r, g.r);
      for (let i = 0; i < 3; i++) c.c[i] += srgb2lin(rgb[i]) * wgt;
    }
    const merged = [...cells.values()].map((c) => ({ ...c, x: c.x / c.w, y: c.y / c.w, a: Math.sqrt(c.a2), cc: c.c.map((v) => v / c.w) }));
    merged.sort((p, q) => q.a * q.r - p.a * p.r);
    const cap = MAX_LIGHTS - (selfPool ? 1 : 0);
    for (const g of merged) {
      if (L.length >= cap) break;
      const P = this.viewToBox(g.k, g.x, g.y, 2.6);
      const s = this.plates[g.k].s, I = Math.min(1.6, g.a) * 1.7;
      L.push({ p: P, r: Math.min(2.5, 0.6 + g.r * s * 0.08), c: [g.cc[0] * I, g.cc[1] * I, g.cc[2] * I], range: g.r * s * 2.2 + 6, dir: null, k: g.k, tag: 'glow' });
    }
    if (selfPool) L.push(selfPool);
    this.lights = L;
    return L;
  }
  uploadLights(G, nvl = 4) {
    const L = this.lights;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const l = L[i];
      if (!l) { G.uLP.array[i].set(0, 0, -999, 0); G.uLC.array[i].set(0, 0, 0, 0); G.uLD.array[i].set(0, 0, 0, -2); G.uLX.array[i].set(-1, 0, 0, 0); continue; }
      if (l.x) G.uLX.array[i].set(l.x[0], l.x[1], l.x[2], 0); else G.uLX.array[i].set(-1, 0, 0, 0);
      G.uLP.array[i].set(l.p[0], l.p[1], l.p[2], l.r);
      G.uLC.array[i].set(l.c[0], l.c[1], l.c[2], l.range);
      if (l.dir) G.uLD.array[i].set(l.dir[0], l.dir[1], l.dir[2], l.dir[3]); else G.uLD.array[i].set(0, 0, -1, -2);
    }
    G.uNL.value = L.length;
    G.uNVL.value = Math.min(L.length, nvl);
  }

  // ---- water optics follow the game's water: the tier palette, pollution, dry decks
  setWater(palette, pollution, dt) {
    if (palette) { const c = hex(palette[0]); this.water.target = c; }
    this.water.pollTarget = pollution;
    const k = Math.min(1, dt / 1.5);         // ~1.5 s crossfade between layers
    for (let i = 0; i < 3; i++) this.water.base[i] += (this.water.target[i] - this.water.base[i]) * k;
    this.water.pollution += (this.water.pollTarget - this.water.pollution) * Math.min(1, dt / 2.5);
    // the inside of the glass slowly films over in dirty water, and clears a little in clean water
    const gt = 0.12 + Math.min(1, this.water.pollution) * 0.5;
    this.grime += (gt - this.grime) * Math.min(1, dt / 40);
  }
  uploadWater(G) {
    const b = this.water.base, mx = Math.max(b[0], b[1], b[2], 1e-3);
    const hue = b.map((c) => c / mx);
    const pol = Math.min(1.5, this.water.pollution);
    // colour-selective absorption: through ~45 mm of water the back cloth keeps T = 0.42..0.9
    const T = hue.map((h) => 0.42 + 0.48 * h);
    G.uSigA.value.set(...T.map((x) => (-Math.log(x) / 45) * (1 + pol * 0.6)));
    const s0 = 0.0035 + pol * 0.0065;
    G.uSigS.value.set(s0 * (0.75 + 0.25 * hue[0]), s0 * (0.8 + 0.2 * hue[1]), s0 * (0.85 + 0.15 * hue[2]));
    const lin = b.map(srgb2lin);
    G.uWaterCol.value.set(lin[0] * 2.2 + 0.004, lin[1] * 2.2 + 0.006, lin[2] * 2.2 + 0.008);
    G.uAmbient.value.set(lin[0] * 0.55 + 0.006, lin[1] * 0.55 + 0.008, lin[2] * 0.55 + 0.01);
    G.uDye.value.set(this.water.dye[0], this.water.dye[1], this.water.dye[2], pol);
  }
}

export { hex, srgb2lin };
