// Shared GPU state for every theatre pass: uniforms + TSL building blocks.
//
// The helpers below are plain JS functions that *emit* TSL nodes inline (macros), so a
// pass can call them inside Loop()/If() bodies without worrying about Fn() signatures.
// They are written once and compile to both WGSL (WebGPU) and GLSL (WebGL2 fallback).
import * as THREE from 'three/webgpu';
import {
  uniform, uniformArray, texture, vec2, vec3, vec4, float, int,
  dot, cross, normalize, length, sqrt, max, min, clamp, mix, smoothstep, abs, floor, fract,
  sin, cos, exp, pow, select, If, Loop, screenCoordinate, mod,
} from 'three/tsl';
import { OPT } from './optics.js';
import { NPLATES, MARGIN } from './sheets.js';

export const MAX_LIGHTS = 24;

const v4 = () => new THREE.Vector4();
const arr4 = (n) => Array.from({ length: n }, v4);

export class GPUState {
  constructor() {
    // ---- view / window mapping (device px -> faceplate mm)
    this.uCanvas = uniform(new THREE.Vector2(1, 1));        // render target size in px
    this.uWin = uniform(new THREE.Vector4(0, 0, 0.1, 0));   // view-rect centre (px) · mm per px · unused
    this.uBulb = uniform(new THREE.Vector4(30, 48, 8, 1));  // bulb half-size mm (x,y) · superellipse pow · edge softness mm
    this.uEye = uniform(new THREE.Vector3(0, OPT.EYE_Y, OPT.Z_WIN + OPT.L));
    this.uGlass = uniform(new THREE.Vector4(OPT.Z_WIN, OPT.R_OUT, OPT.T_GLASS, OPT.N_GLASS));
    this.uNWater = uniform(OPT.N_WATER);
    // ---- plates: centre xyz + mm per world px · U axis + thickness · V axis + enabled · N + spare
    this.uPC = uniformArray(arr4(NPLATES), 'vec4');
    this.uPU = uniformArray(arr4(NPLATES), 'vec4');
    this.uPV = uniformArray(arr4(NPLATES), 'vec4');
    this.uPN = uniformArray(arr4(NPLATES), 'vec4');
    this.uAtlas = uniform(new THREE.Vector4(220, 352, MARGIN, NPLATES));   // VW, VH, margin, plates
    this.uFrame = uniform(new THREE.Vector4(0, 0, 48, 0));  // proscenium: half-size x,y (mm), z, corner radius
    this.uFrameInfo = uniform(new THREE.Vector4(0, 0, 0, 0));
    // ---- lights: pos xyz + area radius · colour*intensity + range (<0: no falloff) · dir xyz + cos cutoff (<-1: omni)
    this.uLP = uniformArray(arr4(MAX_LIGHTS), 'vec4');
    this.uLC = uniformArray(arr4(MAX_LIGHTS), 'vec4');
    this.uLD = uniformArray(arr4(MAX_LIGHTS), 'vec4');
    // per-light extras: plate it is carried on · carrier exclusion radius mm · volumetric near-field fade mm
    this.uLX = uniformArray(arr4(MAX_LIGHTS), 'vec4');
    this.uNL = uniform(0, 'int');
    this.uNVL = uniform(0, 'int');           // the first N lights also scatter in the water volume
    // ---- water optics (per mm)
    this.uSigA = uniform(new THREE.Vector3(0.004, 0.003, 0.002));   // absorption
    this.uSigS = uniform(new THREE.Vector3(0.006, 0.007, 0.007));   // scattering (base turbidity)
    this.uWaterCol = uniform(new THREE.Vector3(0.05, 0.12, 0.15));  // ambient water glow colour
    this.uAmbient = uniform(new THREE.Vector3(0.02, 0.03, 0.035));
    this.uDye = uniform(new THREE.Vector4(0.4, 0.6, 0.15, 0));       // pollution dye tint rgb · strength
    // ---- fluid grid (box space)
    this.uFluidBox = uniform(new THREE.Vector4(40, 60, 0, 60));     // half x, half y, z0, z1
    this.uFluidGrid = uniform(new THREE.Vector4(32, 48, 16, 4));     // GX GY GZ tilesPerRow
    this.uFluidAtlas = uniform(new THREE.Vector2(128, 192));
    // ---- frame
    this.uTime = uniform(0);
    this.uFrameIdx = uniform(0);
    this.uKeyIdx = uniform(0, 'int');
    this.uLanIdx = uniform(1, 'int');
  }

  // ===================================================================== optics
  // Faceplate mm coordinates of the current fragment (window plane, +y up).
  windowCoord(pxNode) {
    const p = pxNode || screenCoordinate.xy;
    return vec2(p.x.sub(this.uWin.x), this.uWin.y.sub(p.y)).mul(this.uWin.z);
  }

  // Superellipse tube-face mask: 1 inside the bulb glass, soft over ~edge px.
  bulbMask(w) {
    const b = this.uBulb;
    return smoothstep(float(1.0), float(1.0).sub(b.w.div(b.y)), this.bulbRadius(w));
  }
  // ~1 on the tube outline. A portrait face is the plain superellipse. A landscape face keeps
  // the superellipse of its height and runs straight across the extra width, so its rim,
  // vignette and corners are as many mm deep at the sides as at the top and bottom.
  bulbRadius(w) {
    const b = this.uBulb;
    const run = max(b.x.sub(b.y), 0.0);
    const q = vec2(max(abs(w.x).sub(run), 0.0).div(min(b.x, b.y)), abs(w.y).div(b.y));
    return pow(pow(q.x, b.z).add(pow(q.y, b.z)), float(1).div(b.z));
  }

  // Eye ray through the faceplate: air -> glass -> water. Returns vars {o, d, d0, n1, cosi}.
  glassRay(w) {
    const g = this.uGlass, eye = this.uEye;
    const C = vec3(0, 0, g.x.sub(g.y));
    const d0 = normalize(vec3(w, g.x).sub(eye)).toVar();
    const o1 = this._sphere(eye, d0, C, g.y);
    const p1 = eye.add(d0.mul(o1)).toVar();
    const n1 = normalize(p1.sub(C)).toVar();
    const d1 = normalize(refractV(d0, n1, float(1).div(g.w))).toVar();
    const o2 = this._sphere(p1, d1, C, g.y.sub(g.z));
    const p2 = p1.add(d1.mul(o2)).toVar();
    const n2 = normalize(p2.sub(C));
    const d2 = normalize(refractV(d1, n2, g.w.div(this.uNWater))).toVar();
    return { o: p2, d: d2, d0, n1, cosi: abs(dot(d0, n1)) };
  }
  _sphere(o, d, c, r) {
    const oc = o.sub(c);
    const b = dot(oc, d), cc = dot(oc, oc).sub(r.mul(r));
    const h = max(b.mul(b).sub(cc), 0.0);
    return b.negate().sub(sqrt(h)).toVar();
  }

  // ===================================================================== plates
  // Ray (o + t d) against plate k's (tilted) front plane; offset pushes the plane along -N
  // (thickness: the back face). Returns { t, vx, vy } — vx/vy in world px of the game view.
  plateHit(k, o, d, offset) {
    const C = this.uPC.element(k), U = this.uPU.element(k), V = this.uPV.element(k), N = this.uPN.element(k).xyz;
    const c0 = offset ? C.xyz.sub(N.mul(offset)) : C.xyz;
    const t = dot(c0.sub(o), N).div(dot(d, N)).toVar();
    const q = o.add(d.mul(t)).sub(c0);
    const vx = dot(q, U.xyz).div(C.w).add(this.uAtlas.x.mul(0.5));
    const vy = dot(q, V.xyz).div(C.w).negate().add(this.uAtlas.y.mul(0.5));
    return { t, vx: vx.toVar(), vy: vy.toVar() };
  }
  platePoint(k, vx, vy) {
    const C = this.uPC.element(k), U = this.uPU.element(k), V = this.uPV.element(k);
    return C.xyz.add(U.xyz.mul(vx.sub(this.uAtlas.x.mul(0.5)).mul(C.w)))
      .sub(V.xyz.mul(vy.sub(this.uAtlas.y.mul(0.5)).mul(C.w)));
  }
  // Atlas UV for plate k at view px (vx, vy). Rows of the atlas are stacked plates.
  atlasUV(k, vx, vy) {
    const A = this.uAtlas;
    const pw = A.x.add(A.z.mul(2)), ph = A.y.add(A.z.mul(2));
    return vec2(vx.add(A.z).div(pw), float(k).mul(ph).add(vy).add(A.z).div(ph.mul(A.w)));
  }
  // 1 if (vx,vy) lies on plate k's physical extent (and the plate is enabled)
  plateInside(k, vx, vy) {
    const A = this.uAtlas;
    const inX = vx.greaterThan(A.z.negate()).and(vx.lessThan(A.x.add(A.z)));
    const inY = vy.greaterThan(A.z.negate()).and(vy.lessThan(A.y.add(A.z)));
    return inX.and(inY).and(this.uPV.element(k).w.greaterThan(0.5));
  }

  // The proscenium frame: an analytic molded plate with a rounded-rect opening.
  frameAlpha(p) {
    const F = this.uFrame;
    const q = abs(p.xy).sub(F.xy.sub(F.w));
    const sd = length(max(q, 0.0)).add(min(max(q.x, q.y), 0.0)).sub(F.w);
    return smoothstep(float(-0.15), float(0.15), sd);
  }

  // ===================================================================== shadows
  // Transmittance from P to S through every plate + the frame. Translucent (bright, saturated)
  // plastic passes coloured light; opaque plastic blocks it. Each test is an exact
  // ray/plane intersection + one alpha fetch, so penumbrae come out distance-true.
  shadow(P, S, skipK, albedoTex) {
    const T = vec3(1).toVar();
    const dv = S.sub(P).toVar();
    loop(int(NPLATES), 'shp', (i) => {
      If(i.notEqual(skipK), () => {
        const C = this.uPC.element(i), U = this.uPU.element(i), V = this.uPV.element(i), N = this.uPN.element(i).xyz;
        const den = dot(dv, N);
        const t = dot(C.xyz.sub(P), N).div(den);
        If(t.greaterThan(0.002).and(t.lessThan(0.998)).and(abs(den).greaterThan(1e-5)), () => {
          const q = P.add(dv.mul(t)).sub(C.xyz);
          const vx = dot(q, U.xyz).div(C.w).add(this.uAtlas.x.mul(0.5));
          const vy = dot(q, V.xyz).div(C.w).negate().add(this.uAtlas.y.mul(0.5));
          If(this.plateInside(i, vx, vy), () => {
            const a = texture(albedoTex, this.atlasUV(i, vx, vy)).level(0);
            const tr = translucency(a.rgb);
            T.mulAssign(vec3(1).sub(a.a).add(a.rgb.mul(a.a).mul(tr)));
          });
        });
      });
    });
    // frame plate (analytic, opaque)
    const fz = this.uFrame.z;
    const tf = fz.sub(P.z).div(dv.z);
    If(tf.greaterThan(0.0).and(tf.lessThan(1.0)), () => {
      T.mulAssign(float(1).sub(this.frameAlpha(P.add(dv.mul(tf)))));
    });
    return T;
  }

  // ===================================================================== fluid field
  // Trilinear sample of a 3D field stored as tiled 2D slices.
  sampleField(tex, P) {
    const B = this.uFluidBox, G = this.uFluidGrid, AW = this.uFluidAtlas;
    const gx = clamp(P.x.add(B.x).div(B.x.mul(2)).mul(G.x).sub(0.5), 0.0, G.x.sub(1.0));
    const gy = clamp(B.y.sub(P.y).div(B.y.mul(2)).mul(G.y).sub(0.5), 0.0, G.y.sub(1.0));
    const gz = clamp(P.z.sub(B.z).div(B.w.sub(B.z)).mul(G.z).sub(0.5), 0.0, G.z.sub(1.0));
    const k0 = floor(gz), k1 = min(k0.add(1.0), G.z.sub(1.0)), fz = gz.sub(k0);
    const uvK = (k) => vec2(
      gx.add(0.5).add(mod(k, G.w).mul(G.x)).div(AW.x),
      gy.add(0.5).add(floor(k.div(G.w)).mul(G.y)).div(AW.y));
    return mix(texture(tex, uvK(k0)).level(0), texture(tex, uvK(k1)).level(0), fz);
  }
}

// Named loop. TSL calls every Loop() variable "i", so nested loops would shadow each other
// (an inner "i" silently replaces the outer index). Every loop in the theatre gets its own name.
export function loop(n, name, fn) {
  return Loop({ start: int(0), end: n, type: 'int', condition: '<', name }, (o) => fn(o[name]));
}

// GLSL-style refract (eta = n1/n2), total internal reflection falls back to the incident ray.
export function refractV(I, N, eta) {
  const d = dot(N, I);
  const k = float(1).sub(eta.mul(eta).mul(float(1).sub(d.mul(d))));
  return select(k.lessThan(0.0), I, I.mul(eta).sub(N.mul(eta.mul(d).add(sqrt(max(k, 0.0))))));
}

// Bright, saturated paint reads as tinted translucent acrylic (neon, vats, crystals, lamps).
export function translucency(rgb) {
  const mx = max(rgb.r, max(rgb.g, rgb.b)), mn = min(rgb.r, min(rgb.g, rgb.b));
  const sat = mx.sub(mn).div(max(mx, 1e-3));
  return smoothstep(float(0.35), float(0.85), mx).mul(smoothstep(float(0.25), float(0.7), sat));
}

// Cheap hashes (frame-varying blue-ish noise for stochastic area-light sampling).
export function hash2(p) {
  const q = fract(p.mul(vec2(0.1031, 0.1030)));
  const r = q.add(dot(q, q.yx.add(33.33)));
  return fract(vec2(r.x.add(r.y).mul(r.x), r.x.add(r.y).mul(r.y)));
}
export function ign(p, frame) {
  const q = p.add(float(frame).mul(5.588238));
  return fract(float(52.9829189).mul(fract(dot(q, vec2(0.06711056, 0.00583715)))));
}
