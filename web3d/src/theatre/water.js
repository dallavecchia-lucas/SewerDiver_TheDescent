// Game -> water. Reads the live game state through the bridge and turns it into fluid
// splats (wakes, dashes, blasts, vents, sludge, floods, the sub's stream), 3D bubbles
// (every breath the diver takes rises through the real water and may end up stuck to the
// glass) and the water's optical state (tier palette, pollution).
import { P_ACT, P_ROCK, PLATES } from './sheets.js';
import { OPT } from './optics.js';

export class WaterDirector {
  constructor(scene) {
    this.S = scene;
    this.seen = new WeakSet();
    this.prevPos = new WeakMap();
    this.bubbles = [];            // rising: box mm {x,y,z,r,vy,ph,age}
    this.glass = [];              // stuck on the inner glass: window mm {x,y,r,a,age,life}
    this.prevSpeed = 0;
    this.prevPlayer = null;
    this.ventScanT = 0; this.vents = [];
    this.splats = [];
  }

  frame(B, kind, dt, out) {
    const S = this.S;
    const sp = [];
    out.current = [0, 0, 0, 0];
    out.ambientSilt = 0.04; out.ambientDye = 0;
    if (!B || !B.player) { out.splats = sp; this._bubbles(dt, B, kind); return; }
    const VW = B.VW, VH = B.VH, s3 = S.plates[P_ACT].s;
    const P = B.player;

    if (kind === 'world') {
      const tier = B.tAt(P.y);
      const T = B.TIERS[tier];
      const amb = B.ambientAt(tier) || 0;
      const pol = Math.min(1.5, amb / 7);
      S.setWater(T && T.water, pol + (B.tierDry && B.tierDry[tier] ? 0.25 : 0), dt);
      out.ambientSilt = 0.05 + pol * 0.45;
      out.ambientDye = pol * 0.7;
      // the diver's wake (legacy velocities are px per 1/60 s)
      const px = P.x + 4 - B.RCX, py = P.y + 4 - B.RCY;
      const bp = S.viewToBox(P_ACT, px, py, 0.5);
      const vx = (P.vx || 0) * 60 * s3, vy = -(P.vy || 0) * 60 * s3;
      const spd = Math.hypot(vx, vy);
      sp.push({ p: bp, r: 3.2, f: [vx * 3.2, vy * 3.2, 0], d: [spd > 12 ? 1.2 : 0.05, 0, 0] });
      // dash: a sudden burst of speed shoves the water and knocks the nearby plates
      if (spd > this.prevSpeed + 18 && spd > 30) {
        sp.push({ p: bp, r: 6, f: [vx * 9, vy * 9, 0], d: [9, 0, 0] });
        S.nudge(P_ACT, vx * 0.012, vy * 0.012, 0.6);
      }
      this.prevSpeed = spd;
      // creatures: their wakes (largest movers first)
      const cr = [];
      for (const c of B.creatures || []) {
        if (c.dead) continue;
        const cx = c.x - B.RCX, cy = c.y - B.RCY;
        if (cx < -40 || cy < -40 || cx > VW + 40 || cy > VH + 40) continue;
        const pp = this.prevPos.get(c); this.prevPos.set(c, [c.x, c.y]);
        if (!pp) continue;
        const dx = (c.x - pp[0]) * 60 * s3, dy = -(c.y - pp[1]) * 60 * s3;
        cr.push({ c, cx, cy, dx, dy, m: Math.hypot(dx, dy) });
      }
      cr.sort((a, b) => b.m - a.m);
      for (const q of cr.slice(0, 4)) if (q.m > 2) sp.push({ p: S.viewToBox(P_ACT, q.cx, q.cy, 0), r: 3.5, f: [q.dx * 2.6, q.dy * 2.6, 0], d: [q.m > 30 ? 2.5 : 0.2, 0, 0] });
      // sparks = mining chips / blasts: a silt puff where they burst
      let puffs = 0;
      for (const q of B.particles) {
        if (this.seen.has(q)) continue;
        this.seen.add(q);
        if (q.type === 'spark' && puffs < 3) {
          puffs++;
          sp.push({ p: S.viewToBox(P_ACT, q.x - B.RCX, q.y - B.RCY, 0), r: 4.5, f: [(Math.random() - 0.5) * 60, 25, (Math.random() - 0.5) * 30], d: [14, 0, 0.2] });
        } else if (q.type === 'bubble') this._spawnBubble(S.viewToBox(P_ACT, q.x - B.RCX, q.y - B.RCY, -2 + Math.random() * 9), q.size || 1.5, q.vy);
      }
      // vents + sludge in view (rescanned a few times a second)
      this.ventScanT -= dt;
      if (this.ventScanT <= 0) { this.ventScanT = 0.25; this._scanVents(B); }
      for (const v of this.vents.slice(0, 5)) {
        const bpv = S.viewToBox(P_ROCK, v.x - B.RCX, v.y - B.RCY, 1.5);
        if (v.k === 'thermal') {
          sp.push({ p: bpv, r: 4, f: [0, 30, 0], d: [1.5, 0, 1.6] });
          if (Math.random() < dt * 2.5) this._spawnBubble([bpv[0] + (Math.random() - 0.5) * 3, bpv[1], bpv[2] + Math.random() * 6], 1.2, -40);
        } else sp.push({ p: bpv, r: 5, f: [0, 4, 0], d: [0.6, 3.5, 0] });
      }
      // a rising flood: the water comes in from the deck below
      if (B.floodFx) {
        const ff = B.floodFx;
        for (let i = 0; i < 3; i++) sp.push({ p: S.viewToBox(P_ACT, VW * (0.2 + 0.3 * i), VH + 10, Math.random() * 20 - 10), r: 10, f: [0, 120, 0], d: [12, 0.5, 0] });
        S.nudge(P_ACT, 0, 0.5, 0);
      }
    } else if (kind === 'sub') {
      const sub = B.subS;
      S.setWater(['#0b2028'], 0.25, dt);
      out.ambientSilt = 0.18; out.ambientDye = 0.1;
      // the stream: everything is carried right-to-left past the boat
      const spd = 64 * (sub.boosting ? 2.25 : 1) * s3 * 0.55;
      out.current = [-spd, 0, 0, 1.6];
      const bp = S.viewToBox(P_ACT, sub.sx, sub.y, 0);
      sp.push({ p: [bp[0] - 4, bp[1], bp[2]], r: 4, f: [-spd * 4, 0, 0], d: [sub.boosting ? 4 : 0.6, 0, 0] });
      for (const q of sub.bub || []) {
        if (this.seen.has(q)) continue; this.seen.add(q);
        if (Math.random() < 0.6) this._spawnBubble(S.viewToBox(P_ACT, q.x, q.y, -2 + Math.random() * 8), q.r || 1, q.vy || -6);
      }
      for (const q of sub.fx || []) {
        if (!q.blast || this.seen.has(q)) continue; this.seen.add(q);
        sp.push({ p: S.viewToBox(P_ACT, q.x, q.y, 0), r: 8, f: [0, 60, 40], d: [16, 0, 0.5] });
        S.nudge(P_ACT, 0, 0, 1.2);
      }
    }
    out.splats = sp;
    this._bubbles(dt, B, kind);
  }

  _scanVents(B) {
    const TS = B.TS, map = B.map; this.vents.length = 0;
    if (!map) return;
    const x0 = Math.floor(B.RCX / TS) - 1, x1 = Math.floor((B.RCX + B.VW) / TS) + 1;
    const y0 = Math.floor(B.RCY / TS) - 1, y1 = Math.floor((B.RCY + B.VH) / TS) + 1;
    const cx = B.RCX + B.VW / 2, cy = B.RCY + B.VH / 2;
    for (let ty = Math.max(1, y0); ty <= y1 && ty < B.MH; ty++) for (let tx = Math.max(0, x0); tx <= x1 && tx < B.MW; tx++) {
      const t = map[ty] && map[ty][tx];
      if (t !== B.THERMAL && t !== B.SLUDGE) continue;
      if (map[ty - 1][tx] === t) continue;         // surface tiles only
      const x = tx * TS + 8, y = ty * TS + 2;
      this.vents.push({ k: t === B.THERMAL ? 'thermal' : 'sludge', x, y, d: Math.hypot(x - cx, y - cy) });
    }
    this.vents.sort((a, b) => a.d - b.d);
  }

  _spawnBubble(p, size, vy) {
    if (this.bubbles.length >= 90) this.bubbles.shift();
    this.bubbles.push({ x: p[0], y: p[1], z: Math.min(56, Math.max(1, p[2])), r: 0.1 + Math.min(3, size) * 0.11, vy: 7 + Math.random() * 6 + Math.min(20, Math.abs(vy || 0) * 0.05), ph: Math.random() * 7, age: 0 });
  }

  _bubbles(dt, B, kind) {
    const S = this.S;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const fz = S.atDepth(b.z), topY = fz.cy + fz.s * S.vh * 0.5 + 2;
      b.age += dt;
      b.y += b.vy * dt;
      b.x += Math.sin(b.age * 7 + b.ph) * 2.2 * dt;
      b.z += Math.sin(b.age * 2.3 + b.ph * 2) * 0.9 * dt + 0.25 * dt;
      b.r = Math.min(0.55, b.r + dt * 0.004);      // expands as it rises
      const atTop = b.y > topY, atGlass = b.z > 55.5;
      if (atTop || atGlass) {
        this.bubbles.splice(i, 1);
        if (this.glass.length < 24 && Math.random() < (atGlass ? 0.9 : 0.35)) {
          const w = this._toWindow(b.x, Math.min(b.y, topY - 0.5), atGlass ? 56 : 54);
          this.glass.push({ x: w[0], y: w[1], r: b.r * 1.15 + 0.15, a: 0, age: 0, life: 12 + Math.random() * 40 });
        }
      }
    }
    for (let i = this.glass.length - 1; i >= 0; i--) {
      const g = this.glass[i];
      g.age += dt;
      const fadeIn = Math.min(1, g.age * 3), fadeOut = Math.min(1, Math.max(0, (g.life - g.age) / 2));
      g.a = fadeIn * fadeOut * 0.9;
      g.r = Math.min(1.6, g.r + dt * 0.006);       // slowly grows while it clings
      if (g.age > g.life - 2) g.y += dt * 1.5;      // lets go and slides up the glass
      if (g.age > g.life) this.glass.splice(i, 1);
    }
  }

  _toWindow(x, y, z) {
    const S = this.S, f = S.atDepth(z);
    const vx = (x - f.cx) / f.s, vy = (f.cy - y) / f.s;        // view px from centre
    const mm = (2 * OPT.HH) / S.vh;
    return [vx * mm, vy * mm];
  }
}
