// The water in the bulb: a 3D stable-fluids solver (Stam) on the GPU.
//
// The grid spans the whole box (glass to back cloth) and is stored as GZ slices tiled
// into one 2D render target, so it runs identically on WebGPU and WebGL2 (fragment
// ping-pong, no compute required). Fields:
//   vel   xyz = velocity (mm/s)
//   den   x = silt (turbidity), y = pollution dye, z = heat, w = unused
// The game stirs it: the diver's wake, dashes, blasts, mining puffs, thermal vents
// (buoyant plumes), sludge (dye), floods (inflow), the sub's stream, the sliding plates
// (viscous drag) and the player's own hands (device tilt / shake).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, texture, vec2, vec3, vec4, float, int,
  dot, length, max, min, clamp, mix, exp, floor, mod, select, If, Loop, screenUV, sin, cos,
} from 'three/tsl';
import { PLATES, NPLATES } from './sheets.js';
import { loop } from './gpu.js';

export const MAX_SPLATS = 16;

export class Fluid {
  constructor(renderer, G, quad, q) {
    this.r = renderer; this.G = G; this.quad = quad;
    this.gx = q.gx; this.gy = q.gy; this.gz = q.gz; this.tpr = q.tpr;
    this.iters = q.iters;
    this.aw = this.gx * this.tpr; this.ah = this.gy * Math.ceil(this.gz / this.tpr);
    G.uFluidGrid.value.set(this.gx, this.gy, this.gz, this.tpr);
    G.uFluidAtlas.value.set(this.aw, this.ah);
    const mk = () => {
      const rt = new THREE.RenderTarget(this.aw, this.ah, { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.vel = [mk(), mk()]; this.den = [mk(), mk()]; this.prs = [mk(), mk()]; this.div = mk();
    this.uDt = uniform(1 / 60);
    this.uSP = uniformArray(Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4(0, 0, -999, 1)), 'vec4');
    this.uSF = uniformArray(Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4()), 'vec4');
    this.uSD = uniformArray(Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4()), 'vec4');
    this.uNS = uniform(0, 'int');
    this.uPlateVel = uniformArray(Array.from({ length: NPLATES }, () => new THREE.Vector4()), 'vec4');
    this.uCurrent = uniform(new THREE.Vector4(0, 0, 0, 0));        // target stream velocity xyz + strength
    this.uBody = uniform(new THREE.Vector3(0, 0, 0));              // hand-held slosh (device acceleration)
    this.uAmbient = uniform(new THREE.Vector4(0.0, 0.0, 0.0, 0));  // silt/dye floor the water relaxes to
    this.uTime = G.uTime;
    this.tVel = texture(this.vel[0].texture); this.tDen = texture(this.den[0].texture);
    this.tPrs = texture(this.prs[0].texture); this.tDiv = texture(this.div.texture);
    this._build();
    this.splats = [];
  }

  // cell (i,j,k) of the current fragment + its box-space centre
  _cell() {
    const G = this.G.uFluidGrid, A = this.G.uFluidAtlas, B = this.G.uFluidBox;
    const pix = floor(screenUV.mul(A));
    const i = mod(pix.x, G.x), j = mod(pix.y, G.y);
    const k = floor(pix.x.div(G.x)).add(floor(pix.y.div(G.y)).mul(G.w));
    const P = vec3(
      i.add(0.5).div(G.x).mul(B.x.mul(2)).sub(B.x),
      B.y.sub(j.add(0.5).div(G.y).mul(B.y.mul(2))),
      B.z.add(k.add(0.5).div(G.z).mul(B.w.sub(B.z))));
    return { i, j, k, P, valid: k.lessThan(G.z) };
  }
  _uv(i, j, k) {
    const G = this.G.uFluidGrid, A = this.G.uFluidAtlas;
    const ii = clamp(i, 0.0, G.x.sub(1)), jj = clamp(j, 0.0, G.y.sub(1)), kk = clamp(k, 0.0, G.z.sub(1));
    return vec2(ii.add(0.5).add(mod(kk, G.w).mul(G.x)).div(A.x), jj.add(0.5).add(floor(kk.div(G.w)).mul(G.y)).div(A.y));
  }
  _h() {
    const G = this.G.uFluidGrid, B = this.G.uFluidBox;
    return vec3(B.x.mul(2).div(G.x), B.y.mul(2).div(G.y), B.w.sub(B.z).div(G.z));
  }

  _build() {
    const G = this.G, self = this;
    const mat = (n) => { const m = new THREE.NodeMaterial(); m.fragmentNode = n; m.depthTest = false; m.depthWrite = false; return m; };

    // ---- 1) advect velocity + forces
    this.mAdvVel = mat(Fn(() => {
      const c = self._cell();
      const out = vec4(0).toVar();
      If(c.valid, () => {
        const v0 = texture(self.tVel, self._uv(c.i, c.j, c.k)).level(0).xyz;
        const back = c.P.sub(v0.mul(self.uDt));
        const v = G.sampleField(self.tVel, back).xyz.mul(0.992).toVar();
        // splat impulses (wakes, dashes, blasts, inflows)
        loop(self.uNS, 'fsp', (i) => {
          const S = self.uSP.element(i), F = self.uSF.element(i);
          const d = c.P.sub(S.xyz);
          const fall = exp(dot(d, d).div(S.w.mul(S.w)).negate());
          v.addAssign(F.xyz.mul(fall).mul(self.uDt));
        });
        // heat rises (thermal vents), the hand-held box sloshes
        const den = texture(self.tDen, self._uv(c.i, c.j, c.k)).level(0);
        v.y.addAssign(den.z.mul(38.0).mul(self.uDt));
        v.addAssign(self.uBody.mul(self.uDt));
        // slow ambient churn so the water never reads as a still image
        const t = self.uTime;
        const turb = vec3(
          sin(c.P.y.mul(0.11).add(t.mul(0.31)).add(sin(c.P.z.mul(0.13).add(t.mul(0.17))))),
          sin(c.P.z.mul(0.09).add(t.mul(0.23)).add(sin(c.P.x.mul(0.12).sub(t.mul(0.19))))),
          sin(c.P.x.mul(0.10).sub(t.mul(0.27)).add(sin(c.P.y.mul(0.08).add(t.mul(0.13))))));
        v.addAssign(turb.mul(2.2).mul(self.uDt));
        // the plates slide through the water and drag it along (viscous coupling)
        loop(int(NPLATES), 'fpl', (i) => {
          const pv = self.uPlateVel.element(i);
          const z = G.uPC.element(i).z;
          const wgt = exp(c.P.z.sub(z).div(2.2).mul(c.P.z.sub(z).div(2.2)).negate()).mul(pv.w);
          v.xy.assign(v.xy.add(pv.xy.sub(v.xy).mul(min(wgt.mul(self.uDt).mul(5.0), 1.0))));
        });
        // stream (the pipe run): relax toward the current
        v.assign(v.add(self.uCurrent.xyz.sub(v).mul(min(self.uCurrent.w.mul(self.uDt), 1.0))));
        // walls: no flow through the box sides, the back cloth or the glass
        const Gd = G.uFluidGrid;
        v.x.assign(select(c.i.lessThan(0.5).or(c.i.greaterThan(Gd.x.sub(1.5))), float(0), v.x));
        v.y.assign(select(c.j.lessThan(0.5).or(c.j.greaterThan(Gd.y.sub(1.5))), float(0), v.y));
        v.z.assign(select(c.k.lessThan(0.5).or(c.k.greaterThan(Gd.z.sub(1.5))), float(0), v.z));
        out.assign(vec4(clamp(v, vec3(-160), vec3(160)), 1));
      });
      return out;
    })());

    // ---- 2) divergence
    this.mDiv = mat(Fn(() => {
      const c = self._cell(); const h = self._h();
      const V = (di, dj, dk) => texture(self.tVel, self._uv(c.i.add(di), c.j.add(dj), c.k.add(dk))).level(0).xyz;
      const dvx = V(1, 0, 0).x.sub(V(-1, 0, 0).x).div(h.x.mul(2));
      const dvy = V(0, -1, 0).y.sub(V(0, 1, 0).y).div(h.y.mul(2));   // j grows downward, y up
      const dvz = V(0, 0, 1).z.sub(V(0, 0, -1).z).div(h.z.mul(2));
      return vec4(dvx.add(dvy).add(dvz), 0, 0, 1);
    })());

    // ---- 3) Jacobi pressure
    this.mJac = mat(Fn(() => {
      const c = self._cell(); const h = self._h();
      const p = (di, dj, dk) => texture(self.tPrs, self._uv(c.i.add(di), c.j.add(dj), c.k.add(dk))).level(0).x;
      const wx = float(1).div(h.x.mul(h.x)), wy = float(1).div(h.y.mul(h.y)), wz = float(1).div(h.z.mul(h.z));
      const dv = texture(self.tDiv, self._uv(c.i, c.j, c.k)).level(0).x;
      const s = p(1, 0, 0).add(p(-1, 0, 0)).mul(wx).add(p(0, 1, 0).add(p(0, -1, 0)).mul(wy)).add(p(0, 0, 1).add(p(0, 0, -1)).mul(wz));
      return vec4(s.sub(dv).div(wx.add(wy).add(wz).mul(2)), 0, 0, 1);
    })());

    // ---- 4) subtract pressure gradient
    this.mGrad = mat(Fn(() => {
      const c = self._cell(); const h = self._h();
      const p = (di, dj, dk) => texture(self.tPrs, self._uv(c.i.add(di), c.j.add(dj), c.k.add(dk))).level(0).x;
      const v = texture(self.tVel, self._uv(c.i, c.j, c.k)).level(0).xyz;
      const g = vec3(p(1, 0, 0).sub(p(-1, 0, 0)).div(h.x.mul(2)), p(0, -1, 0).sub(p(0, 1, 0)).div(h.y.mul(2)), p(0, 0, 1).sub(p(0, 0, -1)).div(h.z.mul(2)));
      return vec4(v.sub(g), 1);
    })());

    // ---- 5) advect silt / dye / heat + sources
    this.mAdvDen = mat(Fn(() => {
      const c = self._cell();
      const out = vec4(0).toVar();
      If(c.valid, () => {
        const v = texture(self.tVel, self._uv(c.i, c.j, c.k)).level(0).xyz;
        // silt settles a little; heat leaves fast; dye lingers
        const back = c.P.sub(v.add(vec3(0, -0.9, 0)).mul(self.uDt));
        const d = G.sampleField(self.tDen, back).toVar();
        d.assign(d.mul(vec4(0.9975, 0.9992, 0.985, 1)));
        loop(self.uNS, 'fsd', (i) => {
          const S = self.uSP.element(i), D = self.uSD.element(i);
          const dd = c.P.sub(S.xyz);
          const fall = exp(dot(dd, dd).div(S.w.mul(S.w)).negate());
          d.addAssign(D.mul(fall).mul(self.uDt));
        });
        // relax toward the ambient floor (pollution keeps the water dirty everywhere)
        d.assign(d.add(self.uAmbient.sub(d).mul(vec4(0.05, 0.12, 0, 0)).mul(self.uDt)));
        out.assign(clamp(d, vec4(0), vec4(6)));
      });
      return out;
    })());
  }

  _pass(m, rt) { this.quad.material = m; this.r.setRenderTarget(rt); this.quad.render(this.r); }

  step(dt) {
    this.uDt.value = Math.min(dt, 1 / 30);
    const S = this.splats.slice(0, MAX_SPLATS);
    for (let i = 0; i < MAX_SPLATS; i++) {
      const s = S[i];
      if (!s) { this.uSP.array[i].set(0, 0, -999, 1); this.uSF.array[i].set(0, 0, 0, 0); this.uSD.array[i].set(0, 0, 0, 0); continue; }
      this.uSP.array[i].set(s.p[0], s.p[1], s.p[2], Math.max(0.5, s.r));
      this.uSF.array[i].set(s.f ? s.f[0] : 0, s.f ? s.f[1] : 0, s.f ? s.f[2] : 0, 0);
      this.uSD.array[i].set(s.d ? s.d[0] : 0, s.d ? s.d[1] : 0, s.d ? s.d[2] : 0, 0);
    }
    this.uNS.value = S.length;
    this.splats.length = 0;

    // velocity: advect + forces -> vel[1]
    this.tVel.value = this.vel[0].texture; this.tDen.value = this.den[0].texture;
    this._pass(this.mAdvVel, this.vel[1]);
    this.vel.reverse();
    // project
    this.tVel.value = this.vel[0].texture;
    this._pass(this.mDiv, this.div);
    this.tDiv.value = this.div.texture;
    for (let it = 0; it < this.iters; it++) {
      this.tPrs.value = this.prs[0].texture;
      this._pass(this.mJac, this.prs[1]);
      this.prs.reverse();
    }
    this.tPrs.value = this.prs[0].texture;
    this._pass(this.mGrad, this.vel[1]);
    this.vel.reverse();
    // density
    this.tVel.value = this.vel[0].texture; this.tDen.value = this.den[0].texture;
    this._pass(this.mAdvDen, this.den[1]);
    this.den.reverse();
    this.tVel.value = this.vel[0].texture; this.tDen.value = this.den[0].texture;
  }
  get velTex() { return this.vel[0].texture; }
  get denTex() { return this.den[0].texture; }
}
