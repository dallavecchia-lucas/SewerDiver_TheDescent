// Orchestrates one theatre frame: plates -> light -> water -> lens -> glass.
import * as THREE from 'three/webgpu';
import { texture, uniform, uniformArray } from 'three/tsl';
import { GPUState } from './gpu.js';
import { makeIrradiance, makeVolume, makeCompose, makeCocTile, makeDof, makeFinal, passUniforms } from './passes.js';
import { Fluid } from './fluid.js';
import { Particles } from './particles.js';
import { NPLATES, MARGIN } from './sheets.js';
import { OPT, calibratePlate, eyePos } from './optics.js';

const HF = THREE.HalfFloatType;

export class TheatreRenderer {
  constructor(canvas, atlas, scene, quality, opts = {}) {
    this.canvas = canvas; this.atlas = atlas; this.scene = scene; this.q = quality;
    this.offscreen = !!opts.offscreen;
    this.noParticles = /noparticles/.test(location.search);
    this.forceWebGL = !!opts.forceWebGL;
    this.ready = false;
    this.frame = 0;
    this.size = { w: 0, h: 0 };
    this.view = { x: 0, y: 0, w: 1, h: 1 };     // device px rect of the game view inside the canvas
    this.atlasVersion = -1;
    this.reset = true;
  }

  async init() {
    const r = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: false, alpha: true, forceWebGL: this.forceWebGL, powerPreference: 'high-performance' });
    await r.init();
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r;
    this.backend = r.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    this.G = new GPUState();
    this.U = passUniforms();
    this.quad = new THREE.QuadMesh();
    this.uScroll = uniformArray(Array.from({ length: NPLATES }, () => new THREE.Vector4()), 'vec4');
    this.uIrrAlpha = uniform(0.3); this.uIrrReset = uniform(1); this.uVolAlpha = uniform(0.35);

    // ---- textures fed by the 2D plate atlas
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;
    this.T = {
      albedo: texture(blank), emissive: texture(blank), hud: texture(blank),
      irr: texture(blank), irrHist: texture(blank), vol: texture(blank), volHist: texture(blank),
      compose: texture(blank), tile: texture(blank), dof: texture(blank), density: texture(blank), vel: texture(blank),
    };
    this._makeAtlasTextures();

    // ---- simulation
    const Q = this.q.current;
    this.fluid = new Fluid(r, this.G, this.quad, Q.fluid);
    this.T.density.value = this.fluid.denTex;
    this.velNode = texture(this.fluid.velTex);

    // ---- passes
    this.uKeySamples = uniform(Q.keySamples || 3, 'int');
    this.mIrr = makeIrradiance(this.G, this.T, this.uScroll, this.uIrrAlpha, this.uIrrReset, this.uKeySamples);
    this.mVol = makeVolume(this.G, this.T, this.uVolAlpha, Q.volSteps);
    this.mCompose = makeCompose(this.G, this.T, this.U);
    this.mTile = makeCocTile(this.G, this.T, this.U);
    this.mDof = makeDof(this.G, this.T, this.U, Q.dofTaps);
    this.mFinal = makeFinal(this.G, this.T, this.U);

    this.particles = new Particles(r, this.G, this.quad, this.U, Q.particles);
    this.particles.build(this.velNode, this.T.compose);

    this.ready = true;
  }

  _makeAtlasTextures() {
    const a = this.atlas;
    for (const k of ['albTex', 'emiTex', 'hudTex']) if (this[k]) this[k].dispose();
    const mk = (cv, nearest) => {
      const t = new THREE.CanvasTexture(cv);
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
      t.minFilter = t.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
      return t;
    };
    this.albTex = mk(a.alb, true); this.emiTex = mk(a.emi, false); this.hudTex = mk(a.hud, true);
    if (this.T) { this.T.albedo.value = this.albTex; this.T.emissive.value = this.emiTex; this.T.hud.value = this.hudTex; }
    // irradiance targets share the atlas layout at 1/IR resolution
    const IR = this.q.current.irrDiv;
    const iw = Math.ceil(a.pw / IR), ih = Math.ceil((a.ph * NPLATES) / IR);
    for (const rt of this.irrRT || []) rt.dispose();
    this.irrRT = [0, 1].map(() => { const t = new THREE.RenderTarget(iw, ih, { type: HF, depthBuffer: false }); t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; return t; });
    this.atlasVersion = a.version;
    this.reset = true;
  }

  // canvas css size + dpr, and where the game view sits inside it (css px)
  resize(cssW, cssH, dpr, viewCss) {
    const scale = dpr * this.q.renderScale;
    const w = Math.max(16, Math.round(cssW * scale)), h = Math.max(16, Math.round(cssH * scale));
    const view = { x: viewCss.x * scale, y: viewCss.y * scale, w: viewCss.w * scale, h: viewCss.h * scale };
    const changed = w !== this.size.w || h !== this.size.h || Math.abs(view.w - this.view.w) > 0.5 || Math.abs(view.x - this.view.x) > 0.5 || Math.abs(view.y - this.view.y) > 0.5;
    if (!changed) return false;
    this.size = { w, h }; this.view = view;
    this.r.setPixelRatio(1);
    this.r.setSize(w, h, false);
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
    const mk = (W, H, filter = THREE.LinearFilter) => { const t = new THREE.RenderTarget(Math.max(1, W), Math.max(1, H), { type: HF, depthBuffer: false }); t.texture.minFilter = t.texture.magFilter = filter; return t; };
    for (const k of ['composeRT', 'dofRT', 'tileRT', 'finalRT']) if (this[k]) this[k].dispose();
    for (const rt of this.volRT || []) rt.dispose();
    this.composeRT = mk(w, h);
    this.dofRT = mk(w, h);
    this.tileRT = mk(Math.ceil(w / 8), Math.ceil(h / 8), THREE.NearestFilter);
    const vd = this.q.current.volDiv;
    this.volRT = [mk(Math.ceil(w / vd), Math.ceil(h / vd)), mk(Math.ceil(w / vd), Math.ceil(h / vd))];
    if (this.offscreen) this.finalRT = new THREE.RenderTarget(w, h, { depthBuffer: false });
    this.particles.setCanvas(w, h);
    this.reset = true;
    return true;
  }

  // ---------------------------------------------------------------- per frame
  render(f) {
    const r = this.r, G = this.G, U = this.U, S = this.scene, a = this.atlas;
    if (a.version !== this.atlasVersion) this._makeAtlasTextures();
    this.frame++;
    G.uFrameIdx.value = this.frame % 4096;
    G.uTime.value = f.time;

    // ---- view + optics uniforms
    const mmPerPx = (2 * OPT.HH) / this.view.h;
    const halfW = (this.view.w / 2) * mmPerPx;
    if (S.vw !== a.vw || S.vh !== a.vh || Math.abs(S.halfW - halfW) > 1e-3 || f.relayout) {
      S.layout(a.vw, a.vh, halfW, OPT.HH);
      const fr = calibratePlate(48, halfW, OPT.HH, a.vw, a.vh);
      G.uFrame.value.set(fr.s * a.vw * 0.5 * 1.035, fr.s * a.vh * 0.5 * 1.022, 48, 5.5);
      this.reset = true;
    }
    G.uCanvas.value.set(this.size.w, this.size.h);
    G.uWin.value.set(this.view.x + this.view.w / 2, this.view.y + this.view.h / 2, mmPerPx, 0);
    G.uBulb.value.set(halfW * OPT.BULB_PAD, OPT.HH * OPT.BULB_PAD, OPT.BULB_POW, 0.6);
    const eye = eyePos(S.head);
    G.uEye.value.set(eye[0], eye[1], eye[2]);
    G.uAtlas.value.set(a.vw, a.vh, MARGIN, NPLATES);
    S.uploadPlates(G);
    S.uploadLights(G, this.q.current.volLights);
    S.uploadWater(G);
    for (let k = 0; k < NPLATES; k++) {
      const sc = f.scroll ? f.scroll[k] : null;
      const moving = sc && (Math.abs(sc[0]) + Math.abs(sc[1]) > 0.01);
      this.uScroll.array[k].set(sc ? sc[0] : 0, sc ? sc[1] : 0, moving ? 0.3 : 0.16, sc ? 1 : 0);
    }
    this.uIrrReset.value = this.reset ? 1 : 0;

    // ---- particle projection fit (depth -> mm per view px & centre), current eye
    this._fitProjection(halfW, a.vw, a.vh, S.head);
    this.particles.uViewRect.value.set(this.view.x, this.view.y, this.view.w, this.view.h);

    // ---- tilt-shift focus follows the diver (critically damped autofocus)
    U.uFocus.value.set(f.focus[0], f.focus[1], f.focus[2], f.tilt);
    const kDof = this.size.h / 1000;
    U.uDof.value.set(0.2 * kDof * f.dofScale, 11 * kDof, 0, 0);
    U.uGrime.value = S.grime;
    U.uCardGlow.value = S.card.glow * 0.95;
    U.uExposure.value = f.exposure || 1.15;
    U.uManualSRGB.value = this.offscreen ? 1 : 0;
    const ins = { x: 0.045, y: 0.03 };
    U.uHudRect.value.set(this.view.x + this.view.w * ins.x, this.view.y + this.view.h * ins.y, this.view.w * (1 - 2 * ins.x), this.view.h * (1 - 2 * ins.y));
    U.uHudOn.value = f.hud ? 1 : 0;
    const nb = Math.min(24, f.glassBubbles.length);
    for (let i = 0; i < 24; i++) { const b = f.glassBubbles[i]; if (b) U.uBub.array[i].set(b.x, b.y, b.r, b.a); else U.uBub.array[i].set(0, 0, 0, 0); }
    U.uNB.value = nb;

    // ---- textures from the 2D atlas
    this.albTex.needsUpdate = true; this.emiTex.needsUpdate = true;
    if (f.hud) this.hudTex.needsUpdate = true;

    const pass = (m, rt) => { this.quad.material = m; r.setRenderTarget(rt); this.quad.render(r); };

    // ---- water: fluid + silt
    this.fluid.splats = f.splats;
    this.fluid.uPlateVel.array.forEach((v, k) => { const pv = f.plateVel ? f.plateVel[k] : null; v.set(pv ? pv[0] : 0, pv ? pv[1] : 0, 0, pv ? 1 : 0); });
    this.fluid.uCurrent.value.set(f.current[0], f.current[1], f.current[2], f.current[3]);
    this.fluid.uBody.value.set(f.body[0], f.body[1], f.body[2]);
    this.fluid.uAmbient.value.set(f.ambientSilt, f.ambientDye, 0, 0);
    this.fluid.step(f.dt);
    this.T.density.value = this.fluid.denTex;
    this.velNode.value = this.fluid.velTex;
    this.T.vel.value = this.fluid.velTex;
    this.particles.uSilt.value.set(f.siltBright, 1, 0, 0);
    this.particles.update(f.dt);
    this.particles.setBubbles(f.bubbles);

    // ---- light: texture-space irradiance (ping-pong)
    this.T.irrHist.value = this.irrRT[0].texture;
    pass(this.mIrr, this.irrRT[1]);
    this.irrRT.reverse();
    this.T.irr.value = this.irrRT[0].texture;

    // ---- water volume (low res, ping-pong)
    this.T.volHist.value = this.volRT[0].texture;
    this.uVolAlpha.value = this.reset ? 1 : 0.35;
    pass(this.mVol, this.volRT[1]);
    this.volRT.reverse();
    this.T.vol.value = this.volRT[0].texture;

    // ---- compose -> tilt-shift -> silt -> glass
    pass(this.mCompose, this.composeRT);
    this.T.compose.value = this.composeRT.texture;
    pass(this.mTile, this.tileRT);
    this.T.tile.value = this.tileRT.texture;
    pass(this.mDof, this.dofRT);
    if (!this.noParticles) this.particles.draw(this.dofRT);
    this.T.dof.value = this.dofRT.texture;
    pass(this.mFinal, this.offscreen ? this.finalRT : null);
    r.setRenderTarget(null);
    this.reset = false;
  }

  _fitProjection(halfW, vw, vh, head) {
    // sample the optics at a few depths and least-squares a quadratic in z
    const zs = [1, 12, 24, 36, 48, 57];
    const eye = eyePos(head);
    const rows = zs.map((z) => ({ z, ...calibrateAt(eye, z, halfW, vw, vh) }));
    const fit = (key) => quadFit(rows.map((r) => r.z), rows.map((r) => r[key]));
    this.particles.uProjS.value.set(...fit('s'));
    this.particles.uProjX.value.set(...fit('cx'));
    this.particles.uProjY.value.set(...fit('cy'));
  }

  async snapshot() {
    if (!this.offscreen || !this.finalRT) return null;
    const { w, h } = this.size;
    const px = await this.r.readRenderTargetPixelsAsync(this.finalRT, 0, 0, w, h);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); const img = c.createImageData(w, h);
    const flip = this.backend === 'webgl2';
    const stride = px.length >= h * Math.ceil((w * 4) / 256) * 256 && this.backend === 'webgpu' ? Math.ceil((w * 4) / 256) * 256 : w * 4;   // WebGPU pads rows to 256 B
    for (let y = 0; y < h; y++) {
      const sy = flip ? h - 1 - y : y;
      img.data.set(px.subarray(sy * stride, sy * stride + w * 4), y * w * 4);
    }
    c.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
}

import { landAtZ } from './optics.js';
function calibrateAt(eye, z, hw, vw, vh) {
  const L = landAtZ(eye, -hw, 0, z), R = landAtZ(eye, hw, 0, z);
  const T = landAtZ(eye, 0, OPT.HH, z), B = landAtZ(eye, 0, -OPT.HH, z);
  const sx = (R[0] - L[0]) / vw, sy = (T[1] - B[1]) / vh;
  return { s: (sx + sy) * 0.5, cx: (L[0] + R[0]) * 0.5, cy: (T[1] + B[1]) * 0.5 };
}
function quadFit(x, y) {
  // normal equations for y = a + b x + c x^2
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < x.length; i++) { const xi = x[i], x2 = xi * xi; s0++; s1 += xi; s2 += x2; s3 += x2 * xi; s4 += x2 * x2; t0 += y[i]; t1 += y[i] * xi; t2 += y[i] * x2; }
  const M = [[s0, s1, s2], [s1, s2, s3], [s2, s3, s4]], b = [t0, t1, t2];
  // Cramer's rule
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M) || 1;
  const col = (j) => M.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}
