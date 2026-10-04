// Suspended silt + motes + rising bubbles: what makes the bulb read as water.
//
// Silt lives entirely on the GPU: positions in a float texture, advected every frame by the
// fluid's velocity field (plus settling and Brownian jitter), drawn as instanced sprites.
// Each sprite is lit by the key light + lantern, fogged by the water, occluded by the
// plates (compared against the compose pass' focus distance) and blurred by its own
// circle of confusion, so motes near the glass bloom into soft bokeh discs.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, texture, vec2, vec3, vec4, float, int,
  dot, length, max, min, clamp, mix, exp, floor, fract, mod, select, sin, cos, abs, smoothstep, saturate,
  screenUV, instanceIndex, uv, varying, normalize,
} from 'three/tsl';

export const MAX_BUBBLES = 96;

export class Particles {
  constructor(renderer, G, quad, U, count) {
    this.r = renderer; this.G = G; this.quad = quad; this.U = U;
    this.px = 128; this.py = Math.max(1, Math.ceil(count / 128));
    this.count = this.px * this.py;
    const ft = { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.rt = [new THREE.RenderTarget(this.px, this.py, ft), new THREE.RenderTarget(this.px, this.py, ft)];
    // seed: random positions throughout the box
    const B = G.uFluidBox.value;
    const data = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      data[i * 4] = (Math.random() * 2 - 1) * B.x; data[i * 4 + 1] = (Math.random() * 2 - 1) * B.y;
      data[i * 4 + 2] = 0.8 + Math.random() * (B.w - 4); data[i * 4 + 3] = Math.random();
    }
    this.seed = new THREE.DataTexture(data, this.px, this.py, THREE.RGBAFormat, THREE.FloatType);
    this.seed.needsUpdate = true;
    this.tState = texture(this.seed);
    this.uDt = uniform(1 / 60);
    this.uVel = null;          // set by the renderer: texture node of the fluid velocity
    this.uViewRect = uniform(new THREE.Vector4(0, 0, 1, 1));   // device px: x, y, w, h of the game view
    this.uProjS = uniform(new THREE.Vector3(0.3, 0, 0));       // mm/view px at depth z: a + b z + c z^2
    this.uProjX = uniform(new THREE.Vector3(0, 0, 0));
    this.uProjY = uniform(new THREE.Vector3(0, 0, 0));
    this.uSilt = uniform(new THREE.Vector4(1, 1, 0, 0));       // brightness · density/visibility · spare
    this.started = false;
    this.bubData = new Float32Array(MAX_BUBBLES * 4);
    this.bubTex = new THREE.DataTexture(this.bubData, MAX_BUBBLES, 1, THREE.RGBAFormat, THREE.FloatType);
    this.bubTex.needsUpdate = true;
    this.tBub = texture(this.bubTex);
    this.uNBub = uniform(0);
  }

  build(velNode, composeNode) {
    const G = this.G, self = this;
    this.uVel = velNode;
    // ---- update pass
    this.mUpdate = new THREE.NodeMaterial();
    this.mUpdate.fragmentNode = Fn(() => {
      const s = texture(self.tState, screenUV).level(0).toVar();
      const P = s.xyz.toVar();
      const B = G.uFluidBox;
      const v = G.sampleField(self.uVel, P).xyz;
      const h = fract(sin(vec3(s.w.mul(91.7), s.w.mul(47.3), s.w.mul(13.1)).add(G.uTime.mul(vec3(1.3, 1.7, 2.1)))).mul(4375.85)).sub(0.5);
      const settle = vec3(0, s.w.mul(-0.45).sub(0.15), 0);
      P.addAssign(v.mul(0.92).add(settle).add(h.mul(1.6)).mul(self.uDt));
      // wrap around the box; z bounces between back cloth and glass
      P.x.assign(select(P.x.lessThan(B.x.negate()), P.x.add(B.x.mul(2)), select(P.x.greaterThan(B.x), P.x.sub(B.x.mul(2)), P.x)));
      P.y.assign(select(P.y.lessThan(B.y.negate()), P.y.add(B.y.mul(2)), select(P.y.greaterThan(B.y), P.y.sub(B.y.mul(2)), P.y)));
      P.z.assign(clamp(P.z, B.z.add(0.4), B.w.sub(2.6)));
      return vec4(P, s.w);
    })();
    this.mUpdate.depthTest = false; this.mUpdate.depthWrite = false;

    // ---- shared projection: box mm -> device px (piecewise quadratic fit of the optics)
    const proj = (P) => {
      const z = P.z;
      const s = self.uProjS.x.add(self.uProjS.y.mul(z)).add(self.uProjS.z.mul(z).mul(z));
      const cx = self.uProjX.x.add(self.uProjX.y.mul(z)).add(self.uProjX.z.mul(z).mul(z));
      const cy = self.uProjY.x.add(self.uProjY.y.mul(z)).add(self.uProjY.z.mul(z).mul(z));
      const VW = G.uAtlas.x, VH = G.uAtlas.y, R = self.uViewRect;
      const vx = P.x.sub(cx).div(s).add(VW.mul(0.5));
      const vy = cy.sub(P.y).div(s).add(VH.mul(0.5));
      const pxPerView = R.z.div(VW);
      return { px: vec2(R.x.add(vx.mul(pxPerView)), R.y.add(vy.mul(pxPerView))), mmPerPx: s.div(pxPerView) };
    };
    const focusSd = (P) => {
      const F = self.U.uFocus;
      return dot(P.sub(F.xyz), vec3(0, sin(F.w).negate(), cos(F.w)));
    };
    const lightAt = (P) => {
      // key light through the glass + lantern (no shadows: specks are tiny), fogged by water
      const sig = G.uSigA.add(G.uSigS);
      const LP0 = G.uLP.element(0), LC0 = G.uLC.element(0);
      const l0 = normalize(LP0.xyz.sub(P));
      const k = LC0.rgb.mul(exp(sig.mul(float(58).sub(P.z).div(max(l0.z, 0.12))).negate()));
      const LP1 = G.uLP.element(1), LC1 = G.uLC.element(1), LD1 = G.uLD.element(1);
      const d1 = LP1.xyz.sub(P), dl = length(d1), l1 = d1.div(dl);
      const fo = saturate(float(1).sub(dl.div(max(LC1.w, 1e-3)).mul(dl.div(max(LC1.w, 1e-3)))));
      const sp = select(LD1.w.lessThan(-1.5), float(1), smoothstep(LD1.w, LD1.w.add(0.1), dot(l1.negate(), LD1.xyz)));
      const lan = LC1.rgb.mul(select(LC1.w.lessThan(0.0), float(1), fo.mul(fo)).mul(sp)).mul(exp(sig.mul(dl).negate()));
      return k.mul(0.35).add(lan.mul(1.6)).add(G.uWaterCol.mul(0.4));
    };

    // ---- silt sprites
    const sm = new THREE.SpriteNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const idx = float(instanceIndex);
    const suv = vec2(mod(idx, self.px).add(0.5).div(self.px), floor(idx.div(self.px)).add(0.5).div(self.py));
    const st = texture(self.tState, suv).level(0);
    const P = st.xyz;
    const pj = proj(P);
    const sd = focusSd(P);
    const coc = min(abs(sd.mul(self.U.uDof.x)), self.U.uDof.y.mul(2.2));
    const baseMm = mix(float(0.06), float(0.22), st.w.mul(st.w));            // most specks are tiny, a few are flakes
    const basePx = max(baseMm.div(pj.mmPerPx), 0.9);
    const size = max(basePx, coc.mul(2.0));
    // occluded when a plate surface sits in front of the speck at this pixel
    const sceneSd = texture(composeNode, pj.px.div(G.uCanvas)).level(0).a;
    const vis = select(sceneSd.greaterThan(900.0), float(0), smoothstep(float(-0.4), float(0.4), sd.sub(sceneSd)));
    const energy = basePx.div(size).mul(basePx.div(size));
    const tint = mix(vec3(0.55, 0.52, 0.45), vec3(0.75, 0.85, 0.9), fract(st.w.mul(7.0)));
    const col = lightAt(P).mul(tint).mul(self.uSilt.x).mul(clamp(energy, 0.015, 1.0)).mul(vis).mul(0.55);
    const vCol = varying(col, 'vSiltCol');
    const vBig = varying(smoothstep(float(3.0), float(9.0), size), 'vSiltBig');
    sm.positionNode = vec3(pj.px.x, pj.px.y.negate(), 0);
    sm.scaleNode = vec2(size, size);
    sm.colorNode = Fn(() => {
      const r = length(uv().sub(0.5)).mul(2.0);
      const disc = smoothstep(float(1.0), float(0.8), r);
      const ring = mix(float(1), float(0.55).add(smoothstep(float(0.55), float(0.95), r).mul(0.9)), vBig);   // bokeh: brighter rim
      return vec4(vCol.mul(disc).mul(ring), 1);
    })();
    this.siltMat = sm;
    this.silt = new THREE.Sprite(sm);
    this.silt.count = this.count;
    this.silt.frustumCulled = false;

    // ---- bubbles (CPU-driven positions, rising with the breath of the diver / vents)
    const bm = new THREE.SpriteNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const bi = float(instanceIndex);
    const bd = texture(self.tBub, vec2(bi.add(0.5).div(MAX_BUBBLES), 0.5)).level(0);
    const bp = proj(bd.xyz);
    const bsd = focusSd(bd.xyz);
    const bcoc = min(abs(bsd.mul(self.U.uDof.x)), self.U.uDof.y.mul(2.0));
    const brad = bd.w.div(bp.mmPerPx);
    const bsize = select(bd.w.greaterThan(0.0), max(brad.mul(2.0), 1.5).add(bcoc), float(0));
    const bScene = texture(composeNode, bp.px.div(G.uCanvas)).level(0).a;
    const bvis = select(bScene.greaterThan(900.0), float(0), smoothstep(float(-0.4), float(0.4), bsd.sub(bScene)));
    const bcol = lightAt(bd.xyz).mul(bvis).mul(clamp(brad.mul(2).div(max(bsize, 1.0)), 0.2, 1.0));
    const vB = varying(bcol, 'vBubCol');
    bm.positionNode = vec3(bp.px.x, bp.px.y.negate(), 0);
    bm.scaleNode = vec2(bsize, bsize);
    bm.colorNode = Fn(() => {
      const q = uv().sub(0.5).mul(2.0);
      const r = length(q);
      const rim = smoothstep(float(0.62), float(0.9), r).mul(smoothstep(float(1.0), float(0.9), r));
      const hi = smoothstep(float(0.32), float(0.0), length(q.sub(vec2(-0.32, 0.35))));
      return vec4(vB.mul(rim.mul(0.9).add(hi.mul(1.6)).add(0.04)), 1);
    })();
    this.bubbles = new THREE.Sprite(bm);
    this.bubbles.count = MAX_BUBBLES;
    this.bubbles.frustumCulled = false;

    this.scene = new THREE.Scene();
    this.scene.add(this.silt); this.scene.add(this.bubbles);
    this.cam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  }

  setCanvas(w, h) {
    this.cam.left = 0; this.cam.right = w; this.cam.top = 0; this.cam.bottom = -h; this.cam.updateProjectionMatrix();
  }

  update(dt) {
    this.uDt.value = Math.min(dt, 1 / 30);
    if (!this.started) { this.tState.value = this.seed; this.started = true; }
    this.quad.material = this.mUpdate;
    this.r.setRenderTarget(this.rt[1]);
    this.quad.render(this.r);
    this.rt.reverse();
    this.tState.value = this.rt[0].texture;
  }

  setBubbles(list) {
    const d = this.bubData;
    d.fill(0);
    const n = Math.min(MAX_BUBBLES, list.length);
    for (let i = 0; i < n; i++) { const b = list[i]; d[i * 4] = b.x; d[i * 4 + 1] = b.y; d[i * 4 + 2] = b.z; d[i * 4 + 3] = b.r; }
    this.bubTex.needsUpdate = true;
  }

  draw(target) {
    const r = this.r;
    const ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam);
    r.autoClear = ac;
  }
}
