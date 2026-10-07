// CPU side of the theatre: where the plates float, how they hover, which lights burn and
// what the water looks like this frame. Everything here ends up in GPUState uniforms.
import * as THREE from 'three/webgpu';
import { OPT, calibratePlate, fitTube } from './optics.js';
import { PLATES, NPLATES, MARGIN, P_CARD, P_ACT, P_ROCK, P_BACK } from './sheets.js';
import { MAX_LIGHTS } from './gpu.js';

const hex = (h) => { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; };
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// light rig (sewer-dark): the faint room fill, and the wall lamps read from the back cloth
const KEY_I = 1.5, KEY_P = [-30, 34, 235];
const WALL_LIFT = 3.5;      // mm the lamp's light hangs in front of the back cloth
const WALL_GAIN = 3.4, WALL_CAP = 9, WALL_RANGE = 17, WALL_MAX = 8;
const WALL_VOL = 0.35;      // wall lamps scatter in the water at this fraction (a haze, not a fog bank)

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
    this.tube = fitTube(halfW, halfH);        // first: every calibration below sees the fitted glass
    for (const p of this.plates) {
      const c = calibratePlate(p.z, halfW, halfH, vw, vh);
      p.s = c.s; p.cx = c.cx; p.cy = c.cy;
      // the card flat is a little smaller than the stage opening, so its hovering edge and the
      // shadow it throws on the theatre behind always show
      if (p.i === P_CARD) p.s *= this.tube.card;
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

  // ---- wall lights: the strip lamps, neon and glowing grilles painted into the back cloth's
  // emissive layer are real light sources. The emissive plate is read back at 1/4 res, bright
  // cells are joined into blobs, and each blob becomes a capsule light lying along it (a long
  // strip is cut into a few segments). Returns emitters in view px of plate k.
  scanWall(atlas, k = P_BACK) {
    const C = 4, pw = atlas.pw, ph = atlas.ph;
    if (!pw || !ph) return [];
    const gw = Math.floor(pw / C), gh = Math.floor(ph / C);
    let d;
    try { d = atlas.ectx.getImageData(0, k * ph, gw * C, gh * C).data; } catch { return []; }
    const W = gw * C, n = gw * gh;
    if (!this._wl || this._wl.length !== n) { this._wl = new Float32Array(n); this._wr = new Float32Array(n * 3); this._wq = new Int32Array(n); this._wm = new Uint8Array(n); }
    const lum = this._wl, rgb = this._wr, seen = this._wm, Q = this._wq;
    lum.fill(0); rgb.fill(0); seen.fill(0);
    const lut = this._lut || (this._lut = Float32Array.from({ length: 256 }, (_, i) => srgb2lin(i / 255)));
    for (let y = 0; y < gh * C; y++) {
      const row = (y / C | 0) * gw, o = y * W * 4;
      for (let x = 0; x < W; x++) {
        const i = o + x * 4, a = d[i + 3];
        if (a < 8) continue;
        // the compose pass shows emissive paint at its full (unpremultiplied) colour wherever it
        // covers, so that is what the lamp's light carries too; faint halos count a little less
        const cov = Math.min(1, a / 48), r = lut[d[i]] * cov, g = lut[d[i + 1]] * cov, b = lut[d[i + 2]] * cov;
        const c = row + (x / C | 0);
        rgb[c * 3] += r; rgb[c * 3 + 1] += g; rgb[c * 3 + 2] += b;
        lum[c] += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
    }
    const thr = 0.06 * C * C;                    // a cell that is at least ~6% lit lamp
    const out = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0] || lum[s0] < thr) continue;
      // flood fill one blob (8-connected), accumulating power-weighted moments
      let qh = 0, qt = 0; Q[qt++] = s0; seen[s0] = 1;
      let w = 0, mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0, cr = 0, cg = 0, cb = 0;
      const cells = [];
      while (qh < qt) {
        const c = Q[qh++], cx = c % gw, cy = (c / gw) | 0, l = lum[c];
        const X = (cx + 0.5) * C - MARGIN, Y = (cy + 0.5) * C - MARGIN;
        w += l; mx += X * l; my += Y * l; mxx += X * X * l; myy += Y * Y * l; mxy += X * Y * l;
        cr += rgb[c * 3]; cg += rgb[c * 3 + 1]; cb += rgb[c * 3 + 2];
        cells.push(X, Y, l);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const nc = ny * gw + nx;
          if (!seen[nc] && lum[nc] >= thr) { seen[nc] = 1; Q[qt++] = nc; }
        }
      }
      mx /= w; my /= w;
      const sxx = mxx / w - mx * mx, syy = myy / w - my * my, sxy = mxy / w - mx * my;
      // principal axis of the blob
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
      let ax = sxy, ay = l1 - sxx;
      if (Math.abs(ax) + Math.abs(ay) < 1e-6) { ax = sxx >= syy ? 1 : 0; ay = sxx >= syy ? 0 : 1; }
      const al = Math.hypot(ax, ay); ax /= al; ay /= al;
      let t0 = 1e9, t1 = -1e9;
      for (let i = 0; i < cells.length; i += 3) { const t = (cells[i] - mx) * ax + (cells[i + 1] - my) * ay; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
      t0 -= C / 2; t1 += C / 2;
      const len = t1 - t0, segs = Math.max(1, Math.ceil(len / 90));
      const cs = cr + cg + cb || 1, col = [cr / cs * 3, cg / cs * 3, cb / cs * 3];
      for (let j = 0; j < segs; j++) {
        const a0 = t0 + (len * j) / segs, a1 = t0 + (len * (j + 1)) / segs, am = (a0 + a1) / 2;
        // power of the cells that fall in this segment
        let pw2 = 0;
        for (let i = 0; i < cells.length; i += 3) { const t = (cells[i] - mx) * ax + (cells[i + 1] - my) * ay; if (t >= a0 - C / 2 && t < a1 + C / 2) pw2 += cells[i + 2]; }
        out.push({ k, x: mx + ax * am, y: my + ay * am, hx: ax * (a1 - a0) / 2, hy: ay * (a1 - a0) / 2, p: pw2 / (C * C), col });
      }
    }
    return chainLamps(out);
  }

  // A wall with more lamps than light slots (a row of vent grilles) must not pick a different
  // handful every frame: lamps are tracked from scan to scan (they slide with the back cloth's
  // scroll), lamps already burning win ties, and a lamp entering or leaving the set fades over
  // ~0.2 s instead of popping. Lamps out in the bleed count for less than lamps on view.
  trackWall(cands, sc, dt) {
    const T = this.wallT || (this.wallT = []);
    if (!cands) { T.length = 0; return T; }
    for (const t of T) { if (sc) { t.x -= sc[0]; t.y -= sc[1]; } t.hit = false; }
    for (const c of cands) {
      if (!(c.p > 0.5)) continue;
      let best = null, bd = 16;
      for (const t of T) { if (t.hit) continue; const d = Math.hypot(t.x - c.x, t.y - c.y); if (d < bd) { bd = d; best = t; } }
      if (best) { Object.assign(best, c); best.hit = true; } else T.push({ ...c, w: 0, hit: true });
    }
    const onView = (t) => (t.x < 0 || t.y < 0 || t.x > this.vw || t.y > this.vh ? 0.5 : 1);
    const score = (t) => (t.hit ? t.p * onView(t) * (1 + t.w) : 0);
    T.sort((a, b) => score(b) - score(a));
    const k = Math.min(1, dt * 7);
    for (let i = 0; i < T.length; i++) { const t = T[i], on = t.hit && i < WALL_MAX; t.w += ((on ? 1 : 0) - t.w) * k; t.on = on; }
    for (let i = T.length - 1; i >= 0; i--) if (!T[i].on && T[i].w < 0.02) T.splice(i, 1);
    // the set that burns, plus a couple of slots for lamps still fading out
    return T.filter((t) => t.w > 0.02).sort((a, b) => b.w * b.p - a.w * a.p).slice(0, WALL_MAX + 2);
  }

  // ---- lights. Order matters: [0] key (room light through the glass), [1] lantern,
  // [2] lantern self-pool, then glows by strength. The first uNVL also scatter in the water.
  buildLights(info) {
    const L = [];
    // room fill: a faint, cold light from just off the viewer's shoulder, nearly head-on through
    // the faceplate. It is not what lights the sewer (the wall lamps, glows and your lantern
    // do); it only keeps the stage readable in the dark gaps and gives every prop a short,
    // soft, distance-true shadow on the plates behind it. It dims with every environment you
    // descend (darkness is a mechanic in this game); the Floodlight Rig upgrade lifts it again
    const kI = KEY_I * (info.keyScale == null ? 1 : info.keyScale);
    L.push({ p: KEY_P, r: 22, c: [0.78 * kI, 0.9 * kI, 1.0 * kI], range: -1, dir: null, k: -1, tag: 'key' });
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
    // wall lamps: capsule lights hanging just off the back cloth, along the painted strip. They
    // light the walls in long pools and scatter in the water, so everything floating in front
    // of them stands out as a silhouette in the glow
    const wall = this.trackWall(info.wall, info.wallScroll, info.dt || 1 / 60);
    for (const e of wall) {
      const s = this.plates[e.k].s, P = this.viewToBox(e.k, e.x, e.y, WALL_LIFT);
      const I = Math.min(WALL_CAP, WALL_GAIN * Math.sqrt(e.p)) * e.w;
      const half = Math.hypot(e.hx, e.hy) * s;
      L.push({ p: P, r: 1.2, c: [e.col[0] * I, e.col[1] * I, e.col[2] * I], range: WALL_RANGE + half * 0.5, dir: null, k: e.k, seg: [e.hx * s, -e.hy * s, 0], vol: WALL_VOL, tag: 'wall' });
    }
    // glows -> small area lights hovering just in front of their plate. Neighbouring glows
    // (a row of sludge tiles, a lamp column) merge into one light per 40 px cell with a
    // sub-linear intensity, so dense glow fields light the stage instead of flooding it.
    const cells = new Map();
    for (const g of info.glows || []) {
      if (!(g.a > 0.02) || !(g.r > 1)) continue;
      if (g.x < -60 || g.y < -60 || g.x > this.vw + 60 || g.y > this.vh + 60) continue;
      const k = g.k == null ? P_ACT : g.k;
      if (k === P_BACK && info.wall) continue;      // already lit by the wall-lamp scan
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
      if (!l) { G.uLS.array[i].set(0, 0, 0, 0); G.uLP.array[i].set(0, 0, -999, 0); G.uLC.array[i].set(0, 0, 0, 0); G.uLD.array[i].set(0, 0, 0, -2); G.uLX.array[i].set(-1, 0, 0, 0); continue; }
      const vol = l.vol == null ? 1 : l.vol;
      if (l.x) G.uLX.array[i].set(l.x[0], l.x[1], l.x[2], vol); else G.uLX.array[i].set(-1, 0, 0, vol);
      if (l.seg) G.uLS.array[i].set(l.seg[0], l.seg[1], l.seg[2], 1); else G.uLS.array[i].set(0, 0, 0, 0);
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

// Strip lamps paint as a row of separate bulbs. Bulbs that line up (each within GAP px of the
// row, and within 6 px of its axis) are chained into one capsule light up to MAXLEN px long, so
// the whole strip throws one continuous band of light and costs one light, not five.
function chainLamps(segs, GAP = 76, MAXLEN = 170) {
  segs.sort((a, b) => b.p - a.p);
  const used = new Uint8Array(segs.length), out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const A = segs[i], mem = [A];
    let ax = 0, ay = 0;
    const hl = Math.hypot(A.hx, A.hy);
    if (hl > 6) { ax = A.hx / hl; ay = A.hy / hl; }
    const span = (list) => {
      let t0 = 1e9, t1 = -1e9;
      for (const m of list) {
        const t = (m.x - A.x) * ax + (m.y - A.y) * ay, h = Math.abs(m.hx * ax + m.hy * ay);
        t0 = Math.min(t0, t - h); t1 = Math.max(t1, t + h);
      }
      return [t0, t1];
    };
    for (;;) {
      let best = -1, bd = GAP;
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const B = segs[j];
        let dn = 1e9;
        for (const m of mem) dn = Math.min(dn, Math.hypot(B.x - m.x, B.y - m.y));
        if (dn >= bd) continue;
        if (ax || ay) {
          const perp = Math.abs((B.x - A.x) * ay - (B.y - A.y) * ax);
          if (perp > 6) continue;
          const [t0, t1] = span([...mem, B]);
          if (t1 - t0 > MAXLEN) continue;
        }
        best = j; bd = dn;
      }
      if (best < 0) break;
      const B = segs[best];
      if (!ax && !ay) { const l = Math.hypot(B.x - A.x, B.y - A.y) || 1; ax = (B.x - A.x) / l; ay = (B.y - A.y) / l; }
      used[best] = 1; mem.push(B);
    }
    if (mem.length === 1) { out.push(A); continue; }
    const [t0, t1] = span(mem), tm = (t0 + t1) / 2;
    let p = 0; const col = [0, 0, 0];
    for (const m of mem) { p += m.p; for (let c = 0; c < 3; c++) col[c] += m.col[c] * m.p; }
    out.push({ k: A.k, x: A.x + ax * tm, y: A.y + ay * tm, hx: ax * (t1 - t0) / 2, hy: ay * (t1 - t0) / 2, p, col: col.map((c) => c / p) });
  }
  return out;
}

export { hex, srgb2lin };
