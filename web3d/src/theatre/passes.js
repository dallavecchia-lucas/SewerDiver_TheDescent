// The theatre's render passes, as TSL node materials for full-screen quads.
//
//  irradiance  texture space, per plate texel: area lights + ray-traced plate shadows,
//              temporally accumulated with exact in-plane reprojection (plates only slide)
//  volume      low-res screen space: single scattering in the murky water (god rays),
//              shadow-tested against the plates, density from the live fluid sim
//  compose     full-res: eye ray through the curved faceplate, first plate hit (with real
//              thickness: cut edges show side walls), plastic shading, water transmittance
//  cocTile     1/8-res max near-field circle of confusion (lets blurred foreground spill)
//  dof         tilt-shift gather: Scheimpflug focal plane, depth-correct per pixel
//  final       faceplate: stuck bubbles, grime film, Fresnel room reflection, rim, HUD
//              decal, tone map + miniature grade, CRT bezel outside the tube face
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uniformArray, texture, vec2, vec3, vec4, float, int,
  dot, cross, normalize, length, sqrt, max, min, clamp, mix, smoothstep, abs, floor, fract, sign,
  sin, cos, exp, pow, select, If, Loop, screenUV, screenCoordinate, reflect, saturate, luminance,
} from 'three/tsl';
import { NPLATES, P_CARD } from './sheets.js';
import { translucency, hash2, ign, loop } from './gpu.js';

const PI = Math.PI;

function mat(node) { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.depthTest = false; m.depthWrite = false; return m; }
const maxc = (v) => max(v.x, max(v.y, v.z));
const sq = (x) => x.mul(x);

// ------------------------------------------------------------------ irradiance
export function makeIrradiance(G, T, uScroll, uIrrAlpha, uIrrReset, uKeySamples) {
  return mat(Fn(() => {
    const A = G.uAtlas, NP = A.w;
    const pw = A.x.add(A.z.mul(2)), ph = A.y.add(A.z.mul(2));
    const uv = screenUV;
    const kf = floor(uv.y.mul(NP)).toVar();
    const k = int(kf).toVar();
    const lv = uv.y.mul(NP).sub(kf);
    const vx = uv.x.mul(pw).sub(A.z).toVar(), vy = lv.mul(ph).sub(A.z).toVar();
    const out = vec4(0).toVar();

    // only texels with plastic nearby (3x3 world px) are lit — the rest of the atlas is open water
    const du = float(1.5).div(pw), dvv = float(1.5).div(ph.mul(NP));
    const auv = G.atlasUV(k, vx, vy);
    const aMax = max(max(texture(T.albedo, auv).level(0).a, texture(T.albedo, auv.add(vec2(du, dvv))).level(0).a),
      max(texture(T.albedo, auv.add(vec2(du.negate(), dvv.negate()))).level(0).a,
        max(texture(T.albedo, auv.add(vec2(du, dvv.negate()))).level(0).a, texture(T.albedo, auv.add(vec2(du.negate(), dvv))).level(0).a)));

    If(aMax.greaterThan(0.01), () => {
      const alb = texture(T.albedo, auv).level(0);
      const tr = translucency(alb.rgb);
      const P = G.platePoint(k, vx, vy).toVar();
      const N = G.uPN.element(k).xyz.toVar();
      const Ef = vec3(0).toVar(), Eb = vec3(0).toVar();
      const sv = float(0).toVar(), sd = float(0).toVar();
      const sigE = G.uSigA.add(G.uSigS);
      loop(G.uNL, 'irl', (i) => {
        const LP = G.uLP.element(i), LC = G.uLC.element(i), LD = G.uLD.element(i);
        // key + lantern get several stratified samples per frame, glows one
        const ns = select(i.lessThan(2), uKeySamples, int(1));
        const nsF = select(i.lessThan(2), float(uKeySamples), float(1)).toVar();
        const wS = float(1).div(nsF);
        const rot = vec2(ign(screenCoordinate.xy.add(vec2(float(i).mul(17.0), 3.0)), G.uFrameIdx),
          ign(screenCoordinate.xy.add(vec2(5.0, float(i).mul(29.0))), G.uFrameIdx.add(1013.0)));
        loop(ns, 'irs', (si) => {
          // stratified point on the light's disc (golden-angle spiral, rotated per texel/frame):
          // soft, distance-true penumbrae
          const toL = LP.xyz.sub(P);
          const l0 = normalize(toL);
          const t1 = normalize(cross(l0, select(abs(l0.y).lessThan(0.9), vec3(0, 1, 0), vec3(1, 0, 0))));
          const t2 = cross(l0, t1);
          const fsi = float(si);
          const ang = fsi.mul(2.39996323).add(rot.x.mul(2 * PI));
          const rad = sqrt(fsi.add(rot.y).div(nsF)).mul(LP.w);
          const S = LP.xyz.add(t1.mul(cos(ang).mul(rad))).add(t2.mul(sin(ang).mul(rad))).toVar();
          const dv = S.sub(P);
          const dist = length(dv);
          const l = dv.div(dist);
          const rng = LC.w;
          const fo = saturate(float(1).sub(sq(dist.div(max(rng, 1e-3)))));
          const att = select(rng.lessThan(0.0), float(1), fo.mul(fo));
          const spot = select(LD.w.lessThan(-1.5), float(1), smoothstep(LD.w, LD.w.add(0.07), dot(l.negate(), LD.xyz)));
          // light outside the bulb only travels through water from the glass inwards
          const dWater = select(rng.lessThan(0.0), float(58).sub(P.z).div(max(l.z, 0.12)), dist);
          const wa = exp(sigE.mul(dWater).negate());
          const ndl = dot(N, l);
          const base = LC.rgb.mul(att.mul(spot).mul(wS)).mul(wa).toVar();
          If(maxc(base).mul(abs(ndl)).greaterThan(1e-5), () => {
            const vis = G.shadow(P.add(N.mul(sign(ndl).mul(0.06))), S, k, T.albedo);
            If(ndl.greaterThan(0.0), () => { Ef.addAssign(base.mul(ndl).mul(vis)); })
              .Else(() => { Eb.addAssign(base.mul(ndl.negate()).mul(vis)); });
            If(i.lessThan(2), () => {           // key + lantern drive the plastic's specular glints
              const w = luminance(base).mul(abs(ndl));
              sv.addAssign(w.mul(luminance(vis))); sd.addAssign(w);
            });
          });
        });
      });
      const E = Ef.add(Eb.mul(tr).mul(alb.rgb.mul(0.8).add(0.2))).add(G.uAmbient);
      const cur = vec4(E, sv.div(max(sd, 1e-4)).mul(0.5).add(0.5));   // a > 0 marks a computed texel
      // exact reprojection: plate k's content slid by (dx,dy) world px since last frame
      const sc = uScroll.element(k);
      const pvx = vx.add(sc.x), pvy = vy.add(sc.y);
      const valid = pvx.greaterThan(A.z.negate()).and(pvx.lessThan(A.x.add(A.z)))
        .and(pvy.greaterThan(A.z.negate())).and(pvy.lessThan(A.y.add(A.z))).and(uIrrReset.lessThan(0.5)).and(sc.w.greaterThan(0.5));
      const hist = texture(T.irrHist, G.atlasUV(k, pvx, pvy)).level(0);
      out.assign(select(valid, mix(hist, cur, sc.z), cur));
    });
    return out;
  })());
}

// ------------------------------------------------------------------ volume
export function makeVolume(G, T, uVolAlpha, steps) {
  return mat(Fn(() => {
    const px = screenUV.mul(G.uCanvas).toVar();
    const w = G.windowCoord(px).toVar();
    const out = vec4(0).toVar();
    If(G.bulbRadius(w).lessThan(1.02), () => {
      const R = G.glassRay(w);
      const o = R.o.toVar(), d = R.d.toVar();
      // first opaque plate along the ray (thin-plate test is plenty for the fog depth)
      const tHit = float(-2).sub(o.z).div(d.z).toVar();
      const found = float(0).toVar();
      loop(int(NPLATES), 'vpl', (i) => {
        const k = int(NPLATES - 1).sub(i);
        If(found.lessThan(0.5), () => {
          const h = G.plateHit(k, o, d, 0);
          If(h.t.greaterThan(0.0).and(G.plateInside(k, h.vx, h.vy)), () => {
            const a = texture(T.albedo, G.atlasUV(k, h.vx, h.vy)).level(0).a;
            If(a.greaterThan(0.5), () => { tHit.assign(h.t); found.assign(1); });
          });
        });
      });
      const j = ign(screenCoordinate.xy, G.uFrameIdx);
      const S = vec3(0).toVar(), Tr = float(1).toVar(), silt = float(0).toVar();
      const ds = tHit.div(steps);
      const sigA = G.uSigA;
      loop(int(steps), 'vst', (i) => {
        const tt = float(i).add(j).mul(ds);
        const X = o.add(d.mul(tt)).toVar();
        const f = G.sampleField(T.density, X);
        const sl = max(f.x, 0.0), dye = max(f.y, 0.0);
        silt.addAssign(sl);
        const sigS = G.uSigS.mul(float(1).add(sl.mul(3.5)));
        const sigT = sigA.add(sigS).add(vec3(1).sub(G.uDye.rgb).mul(dye.mul(0.012)));
        const Lin = vec3(0).toVar();
        loop(G.uNVL, 'vli', (li) => {
          const LP = G.uLP.element(li), LC = G.uLC.element(li), LD = G.uLD.element(li);
          const toL = LP.xyz.sub(X);
          const dist = length(toL);
          const l = toL.div(dist);
          const rng = LC.w;
          const fo = saturate(float(1).sub(sq(dist.div(max(rng, 1e-3)))));
          const att = select(rng.lessThan(0.0), float(1), fo.mul(fo));
          const spot = select(LD.w.lessThan(-1.5), float(1), smoothstep(LD.w, LD.w.add(0.07), dot(l.negate(), LD.xyz)));
          const dWater = select(rng.lessThan(0.0), float(58).sub(X.z).div(max(l.z, 0.12)), dist);
          const wa = exp(sigA.add(sigS).mul(dWater).negate());
          const base = LC.rgb.mul(att.mul(spot)).mul(wa).toVar();
          If(maxc(base).greaterThan(1e-4), () => {
            // Henyey-Greenstein, forward-scattering silt (g ~ 0.62)
            const g = float(0.62);
            const ct = dot(l, d.negate()).negate();
            const ph = float(1).sub(g.mul(g)).div(pow(float(1).add(g.mul(g)).sub(g.mul(2).mul(ct)), 1.5)).mul(1 / (4 * PI));
            const vis = G.shadow(X, LP.xyz, -1, T.albedo);
            Lin.addAssign(base.mul(vis).mul(ph));
          });
        });
        S.addAssign(Lin.mul(sigS).mul(Tr).mul(ds));
        Tr.mulAssign(exp(maxc(sigT).mul(ds).negate()));
      });
      const cur = vec4(S, silt.div(steps));
      const hist = texture(T.volHist, screenUV).level(0);
      out.assign(mix(hist, cur, uVolAlpha));
    });
    return out;
  })());
}

// ------------------------------------------------------------------ compose
export function makeCompose(G, T, U) {
  return mat(Fn(() => {
    const px = screenUV.mul(G.uCanvas).toVar();
    const w = G.windowCoord(px).toVar();
    const out = vec4(0, 0, 0, 1000).toVar();          // alpha = signed focus distance (1000: off-glass)
    If(G.bulbRadius(w).lessThan(1.02), () => {
      const R = G.glassRay(w);
      const o = R.o.toVar(), d = R.d.toVar();
      // refractive shimmer: warm vent water and currents bend the ray a hair (index of
      // refraction follows temperature), so the theatre wavers like it sits in real water
      const pm = o.add(d.mul(float(o.z).sub(24.0).div(d.z.negate())));
      const fc = G.sampleField(T.density, pm);
      const fx = G.sampleField(T.density, pm.add(vec3(1.6, 0, 0))).z.sub(fc.z);
      const fy = G.sampleField(T.density, pm.add(vec3(0, 1.6, 0))).z.sub(fc.z);
      const fv = G.sampleField(T.vel, pm).xyz;
      d.assign(normalize(d.add(vec3(fx.mul(0.006).add(fv.x.mul(0.00012)), fy.mul(0.006).add(fv.y.mul(0.00012)), 0))));
      const A = G.uAtlas;
      const hitK = int(-1).toVar(), side = float(0).toVar();
      const hitT = float(0).toVar(), hvx = float(0).toVar(), hvy = float(0).toVar();
      // the proscenium frame plate is nearest
      const tf = G.uFrame.z.sub(o.z).div(d.z);
      const pf = o.add(d.mul(tf));
      If(G.frameAlpha(pf).greaterThan(0.5), () => { hitK.assign(99); hitT.assign(tf); });
      loop(int(NPLATES), 'cpl', (i) => {
        const k = int(NPLATES - 1).sub(i);
        If(hitK.lessThan(0), () => {
          const h = G.plateHit(k, o, d, 0);
          If(h.t.greaterThan(0.0).and(G.plateInside(k, h.vx, h.vy)), () => {
            const a = texture(T.albedo, G.atlasUV(k, h.vx, h.vy)).level(0).a;
            If(a.greaterThan(0.5), () => {
              hitK.assign(k); hitT.assign(h.t); hvx.assign(h.vx); hvy.assign(h.vy);
            }).Else(() => {
              // inside the slab: the ray crosses a cut edge -> side wall of the plastic
              const hb = G.plateHit(k, o, d, G.uPU.element(k).w);
              If(G.plateInside(k, hb.vx, hb.vy), () => {
                const ab = texture(T.albedo, G.atlasUV(k, hb.vx, hb.vy)).level(0).a;
                If(ab.greaterThan(0.5), () => {
                  hitK.assign(k); hitT.assign(hb.t); hvx.assign(hb.vx); hvy.assign(hb.vy); side.assign(1);
                });
              });
            });
          });
        });
      });

      const col = vec3(0).toVar();
      const tHit = hitT.toVar();
      const kL = int(0), kN = int(1);
      const LP0 = G.uLP.element(kL).toVar(), LP1 = G.uLP.element(kN).toVar(), LC1 = G.uLC.element(kN).toVar(), LD1 = G.uLD.element(kN).toVar();
      const LC0 = G.uLC.element(kL).toVar();
      If(hitK.equal(99), () => {
        // molded proscenium: dark satin plastic, lit by the room key light and the water glow
        const P = o.add(d.mul(tHit));
        const lk = normalize(LP0.xyz.sub(P));
        const F = G.uFrame;
        const q = abs(P.xy).sub(F.xy.sub(F.w));
        const edge = smoothstep(float(2.5), float(0), length(max(q, 0.0)).add(min(max(q.x, q.y), 0.0)).sub(F.w));
        const base = vec3(0.035, 0.042, 0.05).add(G.uWaterCol.mul(0.15));
        col.assign(base.mul(LC0.rgb.mul(max(lk.z, 0.0)).mul(0.35).add(G.uAmbient.mul(3.0))).add(vec3(0.05).mul(edge).mul(max(lk.y, 0.0))));
      }).ElseIf(hitK.greaterThanEqual(0), () => {
        const k = hitK;
        const uv = G.atlasUV(k, hvx, hvy);
        const alb = texture(T.albedo, uv).level(0);
        // edge-aware 5-tap filter of the traced irradiance (only texels that were computed)
        const ip = vec2(A.x.add(A.z.mul(2)), A.y.add(A.z.mul(2)).mul(A.w)).div(U.uIrrDiv);
        const io = vec2(1).div(ip);
        const i0 = texture(T.irr, uv).level(0);
        const iS = i0.mul(2.0).toVar();
        const iW = float(2.0).toVar();
        const tap = (o) => { const t = texture(T.irr, uv.add(o)).level(0); const w = select(t.a.greaterThan(0.25), float(1), float(0)); iS.addAssign(t.mul(w)); iW.addAssign(w); };
        tap(vec2(io.x, 0)); tap(vec2(io.x.negate(), 0)); tap(vec2(0, io.y)); tap(vec2(0, io.y.negate()));
        const irrF = iS.div(iW);
        const irr = vec4(irrF.rgb, saturate(irrF.a.sub(0.5).mul(2.0)));
        const emi = texture(T.emissive, uv).level(0);
        const P = o.add(d.mul(tHit)).toVar();
        const Ua = G.uPU.element(k).xyz, Va = G.uPV.element(k).xyz, N0 = G.uPN.element(k).xyz;
        // bevelled cut edges: the alpha gradient bends the normal outwards near silhouettes
        const pw = A.x.add(A.z.mul(2)), ph = A.y.add(A.z.mul(2));
        const ex = float(1).div(pw), ey = float(1).div(ph.mul(A.w));
        const aL = texture(T.albedo, uv.sub(vec2(ex, 0))).level(0).a, aR = texture(T.albedo, uv.add(vec2(ex, 0))).level(0).a;
        const aU = texture(T.albedo, uv.sub(vec2(0, ey))).level(0).a, aD = texture(T.albedo, uv.add(vec2(0, ey))).level(0).a;
        const gx = aL.sub(aR), gy = aD.sub(aU);               // points out of the shape (view y is down)
        // faint injection-moulding ripple across the face
        const rip = sin(hvx.mul(0.21).add(hvy.mul(0.05)).add(float(k).mul(1.7))).mul(0.018);
        const Nface = normalize(N0.add(Ua.mul(gx.mul(0.55).add(rip))).add(Va.mul(gy.mul(-0.55)).negate()));
        const Nside = normalize(Ua.mul(gx).sub(Va.mul(gy)).add(N0.mul(0.08)));
        const N = select(side.greaterThan(0.5), Nside, Nface).toVar();
        const Vd = d.negate();
        const tr = translucency(alb.rgb);
        // diffuse from the traced irradiance (+ side walls catch the key light directly)
        const lk = normalize(LP0.xyz.sub(P));
        const keyC = LC0.rgb.mul(exp(G.uSigA.add(G.uSigS).mul(float(58).sub(P.z).div(max(lk.z, 0.12))).negate()));
        const sideLit = keyC.mul(max(dot(N, lk), 0.0)).mul(irr.a.mul(0.6).add(0.25));
        const lit = select(side.greaterThan(0.5), irr.rgb.mul(0.55).add(sideLit), irr.rgb);
        // neon-like paint is self-lit acrylic: it glows steadily instead of blowing out under the lamps
        const diff0 = alb.rgb.mul(mix(lit, min(lit, vec3(0.9)).mul(0.6).add(0.32), tr));
        // the card flat is a backlit display panel: mostly its own light, a little stage light
        const diff = select(k.equal(int(P_CARD)), alb.rgb.mul(lit.mul(0.18)), diff0);
        // satin clear-coat (normalised Blinn-Phong, n~48) for the key + lantern
        const specOf = (l, c) => {
          const H = normalize(l.add(Vd));
          const nh = max(dot(N, H), 0.0);
          const fr = float(0.045).add(float(0.955).mul(pow(float(1).sub(max(dot(H, Vd), 0.0)), 5.0)));
          return c.mul(pow(nh, 48.0).mul((48 + 8) / (8 * PI)).mul(fr)).mul(max(dot(N, l), 0.0));
        };
        const l1 = LP1.xyz.sub(P), d1 = length(l1), l1n = l1.div(d1);
        const rng1 = LC1.w;
        const fo1 = saturate(float(1).sub(sq(d1.div(max(rng1, 1e-3)))));
        const sp1 = select(LD1.w.lessThan(-1.5), float(1), smoothstep(LD1.w, LD1.w.add(0.07), dot(l1n.negate(), LD1.xyz)));
        const lanC = LC1.rgb.mul(select(rng1.lessThan(0.0), float(1), fo1.mul(fo1)).mul(sp1)).mul(exp(G.uSigA.add(G.uSigS).mul(d1).negate()));
        const spec = specOf(lk, keyC).add(specOf(l1n, lanC)).mul(irr.a).mul(float(1).sub(side.mul(0.5)));
        // light piping in acrylic: translucent props glow along their cut edges
        const edgeGlow = alb.rgb.mul(tr).mul(abs(gx).add(abs(gy)).mul(0.9).add(side.mul(0.6))).mul(irr.rgb.add(0.05));
        const paintGlow = alb.rgb.mul(tr).mul(0.08);
        const cardGlow = select(k.equal(int(P_CARD)), alb.rgb.mul(U.uCardGlow), vec3(0));
        col.assign(diff.add(spec).add(edgeGlow).add(paintGlow).add(emi.rgb.mul(0.5)).add(cardGlow));
      }).Else(() => {
        // the box's back wall, behind every plate (only visible past an unfilled bleed)
        tHit.assign(float(-2).sub(o.z).div(d.z));
        col.assign(G.uAmbient.mul(0.6));
      });

      // water between the glass and the hit: Beer-Lambert + the scattered light from the volume pass
      const vol = texture(T.vol, screenUV).level(0);
      const sigT = G.uSigA.add(G.uSigS.mul(float(1).add(vol.a.mul(3.5))));
      const Tr = exp(sigT.mul(tHit).negate());
      const c2 = col.mul(Tr).add(vol.rgb).add(G.uWaterCol.mul(0.004));
      // signed distance to the tilted (Scheimpflug) focal plane, for the tilt-shift pass
      const P = o.add(d.mul(tHit));
      const nF = vec3(0, sin(U.uFocus.w).negate(), cos(U.uFocus.w));
      const sd = dot(P.sub(U.uFocus.xyz), nF);
      out.assign(vec4(c2, sd));
    });
    return out;
  })());

}

// ------------------------------------------------------------------ CoC tiles (near-field max)
export function makeCocTile(G, T, U) {
  return mat(Fn(() => {
    const m = float(0).toVar();
    const tile = vec2(8).div(G.uCanvas);
    loop(int(4), 'tx', (i) => {
      loop(int(4), 'ty', (jj) => {
        const uv = screenUV.add(vec2(float(i).sub(1.5), float(jj).sub(1.5)).mul(tile).mul(0.25));
        const sd = texture(T.compose, uv).level(0).a;
        If(sd.lessThan(900.0), () => { m.assign(max(m, sd.mul(U.uDof.x))); });
      });
    });
    return vec4(min(m, U.uDof.y), 0, 0, 1);
  })());
}

// ------------------------------------------------------------------ tilt-shift gather
export function makeDof(G, T, U, taps) {
  return mat(Fn(() => {
    const uv = screenUV;
    const c = texture(T.compose, uv).level(0);
    const out = vec4(c.rgb, 1).toVar();
    If(c.a.lessThan(900.0), () => {
      const K = U.uDof.x, cmax = U.uDof.y;
      const cocC = clamp(c.a.mul(K), cmax.negate(), cmax);
      const tt = vec2(8).div(G.uCanvas);
      const near = max(max(texture(T.tile, uv).level(0).x, texture(T.tile, uv.add(vec2(tt.x, 0))).level(0).x),
        max(texture(T.tile, uv.sub(vec2(tt.x, 0))).level(0).x, max(texture(T.tile, uv.add(vec2(0, tt.y))).level(0).x, texture(T.tile, uv.sub(vec2(0, tt.y))).level(0).x)));
      const Rr = max(abs(cocC), near).toVar();
      If(Rr.greaterThan(0.6), () => {
        const sum = c.rgb.toVar(), ws = float(1).toVar();
        const rot = ign(screenCoordinate.xy, G.uFrameIdx).mul(2 * PI);
        loop(int(taps), 'dft', (i) => {
          const fi = float(i);
          const r = sqrt(fi.add(0.5).div(taps)).mul(Rr);
          const a = fi.mul(2.39996323).add(rot);
          const uvT = uv.add(vec2(cos(a), sin(a)).mul(r).div(G.uCanvas));
          const t = texture(T.compose, uvT).level(0);
          If(t.a.lessThan(900.0), () => {
            const cocT = min(abs(t.a.mul(K)), cmax);
            const eff = select(t.a.greaterThan(c.a), cocT, min(cocT, abs(cocC)));
            const wgt = saturate(eff.sub(r).add(1.0));
            sum.addAssign(t.rgb.mul(wgt)); ws.addAssign(wgt);
          });
        });
        out.assign(vec4(sum.div(ws), 1));
      });
    });
    return out;
  })());
}

// ------------------------------------------------------------------ faceplate + output
export function makeFinal(G, T, U) {
  return mat(Fn(() => {
    // pin shared values here: TSL emits a node where it is first used, and the first use
    // below is inside the bubble loop (which may run zero times)
    const px = screenUV.mul(G.uCanvas).toVar();
    const w = G.windowCoord(px).toVar();
    const rr = G.bulbRadius(w).toVar();
    const m = G.bulbMask(w).toVar();
    // lateral dispersion of the thick curved faceplate: red lands a touch wider than blue,
    // growing toward the rim (stable, so it never shimmers frame to frame)
    const cen = vec2(G.uWin.x, G.uWin.y).div(G.uCanvas);
    const disp = pow(saturate(rr), 3.0).mul(0.0035);
    const uvR = cen.add(screenUV.sub(cen).mul(float(1).sub(disp)));
    const uvB = cen.add(screenUV.sub(cen).mul(float(1).add(disp)));
    const col = vec3(texture(T.dof, uvR).level(0).r, texture(T.dof, screenUV).level(0).g, texture(T.dof, uvB).level(0).b).toVar();

    // --- bubbles stuck to the inside of the faceplate: tiny plano-convex lenses
    loop(U.uNB, 'gbb', (i) => {
      const B = U.uBub.element(i);
      const dd = w.sub(B.xy);
      const r = length(dd);
      If(r.lessThan(B.z), () => {
        const q = r.div(B.z);
        const lens = sqrt(saturate(float(1).sub(q.mul(q))));
        const off = dd.div(B.z).mul(float(1).sub(lens)).mul(B.z).div(G.uWin.z).mul(0.9);
        const refr = texture(T.dof, screenUV.sub(off.mul(vec2(1, -1)).div(G.uCanvas))).level(0).rgb;
        const rim = smoothstep(float(0.72), float(0.98), q).mul(B.w);
        const hi = smoothstep(float(0.35), float(0.0), length(dd.div(B.z).sub(vec2(-0.35, 0.4)))).mul(B.w);
        col.assign(mix(col, refr.mul(1.06), B.w).add(vec3(0.5, 0.58, 0.62).mul(rim.mul(0.18).add(hi.mul(0.55)))));
      });
    });

    // --- grime film on the inner glass: out of focus by nature (it sits in front of the focal plane)
    const gt = texture(T.grime, w.div(120.0).add(0.5)).level(0);     // baked once (makeGrimeBake)
    const g1 = gt.r, g2 = gt.g;
    const top = smoothstep(float(0.2), float(1.0), w.y.div(G.uBulb.y)).mul(0.6).add(0.4);
    const rimDirt = smoothstep(float(0.78), float(1.0), rr).mul(0.7);
    const film = saturate(g1.mul(0.75).add(g2.mul(0.35)).sub(0.42).mul(1.7).add(rimDirt)).mul(top).mul(U.uGrime).toVar();
    // tide lines: thin dried-silt contours where the film's edge once sat
    const tide = smoothstep(float(0.035), float(0.0), abs(fract(g1.mul(7.0).add(w.y.mul(0.01))).sub(0.5)).sub(0.46)).mul(U.uGrime).mul(0.35).mul(smoothstep(float(0.3), float(0.6), g2));
    film.addAssign(tide);
    const streak = smoothstep(float(0.6), float(0.95), gt.b).mul(top).mul(U.uGrime).mul(0.5);
    film.addAssign(streak);
    const vol = texture(T.vol, screenUV).level(0).rgb;
    const grimeTint = vec3(0.42, 0.38, 0.22).mul(G.uWaterCol.mul(0.6).add(vec3(0.4, 0.43, 0.3)));
    col.assign(col.mul(float(1).sub(film.mul(0.5))).add(grimeTint.mul(film).mul(vol.mul(5.0).add(G.uAmbient.mul(2.0)).add(0.012))));

    // --- outer glass: Fresnel reflection of the room + total internal reflection at the rim
    const R = G.glassRay(w);
    const F0 = float(0.04);
    const fres = F0.add(float(1).sub(F0).mul(pow(float(1).sub(R.cosi), 5.0)));
    const rd = reflect(R.d0, R.n1);
    col.addAssign(room(rd).mul(fres).mul(1.15));
    const rimBand = smoothstep(float(0.9), float(0.995), rr).mul(smoothstep(float(1.02), float(0.995), rr));
    col.assign(col.mul(float(1).sub(rimBand.mul(0.55))).add(vec3(0.16, 0.2, 0.22).mul(pow(rimBand, 3.0)).mul(0.35)));

    // --- HUD printed on the inside of the glass (sharp: it is not in the water)
    const hv = px.sub(U.uHudRect.xy).div(U.uHudRect.zw);
    const hud = texture(T.hud, hv).level(0);
    const inH = hv.x.greaterThan(0.0).and(hv.x.lessThan(1.0)).and(hv.y.greaterThan(0.0)).and(hv.y.lessThan(1.0));
    const hudA = select(inH, hud.a.mul(U.uHudOn), float(0));
    const dbgHud = vec4(fract(hv), select(inH, float(1), float(0)), 1);

    // --- tone map (filmic) + miniature grade: a touch of saturation and contrast, lens vignette
    const ex = col.mul(U.uExposure);
    const tm = ex.mul(ex.mul(2.51).add(0.03)).div(ex.mul(ex.mul(2.43).add(0.59)).add(0.14));
    const lum = luminance(tm);
    const sat = mix(vec3(lum), tm, float(1.12));
    const con = sat.sub(0.5).mul(1.05).add(0.5);
    const vig = float(1).sub(smoothstep(float(0.55), float(1.05), rr).mul(0.32));
    const graded0 = saturate(con.mul(vig));
    // the HUD is printed on the glass: blended after tone mapping, in display (sRGB) space,
    // exactly like the original canvas did it (a damage tint must not flood the scene)
    const gS = pow(graded0, vec3(1 / 2.2)), hS = pow(hud.rgb, vec3(1 / 2.2));
    const graded = pow(mix(gS, hS, hudA), vec3(2.2));

    // --- CRT bezel: a dark rubber gasket hugging the tube face, fading into the console shell
    const gas = smoothstep(float(1.0), float(1.09), rr);
    const gasket = vec3(0.012, 0.016, 0.02).add(vec3(0.05, 0.065, 0.075).mul(smoothstep(float(1.06), float(1.0), rr)).mul(saturate(w.y.div(G.uBulb.y).mul(0.5).add(0.5))));
    const alphaOut = float(1).sub(smoothstep(float(1.09), float(1.16), rr));
    const outC = mix(gasket, graded, m);
    const dith = fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(1.0 / 255);
    const res = vec4(select(U.uManualSRGB.greaterThan(0.5), pow(outC, vec3(1 / 2.2)), outC).add(dith), max(alphaOut, m)).toVar();
    // debug views (?view=...): inspect the intermediate buffers
    const dv = U.uDebugView;
    If(dv.equal(1), () => { res.assign(vec4(texture(T.compose, screenUV).level(0).rgb, 1)); });
    If(dv.equal(2), () => { res.assign(vec4(texture(T.vol, screenUV).level(0).rgb.mul(8.0), 1)); });
    If(dv.equal(3), () => { res.assign(vec4(texture(T.irr, screenUV).level(0).rgb.mul(0.5), 1)); });
    If(dv.equal(4), () => { const a = texture(T.albedo, screenUV).level(0); res.assign(vec4(a.rgb.mul(a.a), 1)); });
    If(dv.equal(5), () => { const sd = texture(T.compose, screenUV).level(0).a; res.assign(vec4(saturate(sd.mul(0.05)), saturate(sd.mul(-0.05)), select(sd.greaterThan(900.0), float(1), float(0)), 1)); });
    If(dv.equal(6), () => { res.assign(vec4(texture(T.density, screenUV).level(0).xyz.mul(vec3(0.5, 0.5, 0.5)), 1)); });
    If(dv.equal(8), () => { const hh = texture(T.hud, screenUV).level(0); res.assign(vec4(hh.rgb.mul(hh.a).add(vec3(0.1, 0, 0)), 1)); });
    If(dv.equal(9), () => { res.assign(dbgHud); });
    If(dv.equal(10), () => { res.assign(vec4(abs(texture(T.vel, screenUV).level(0).xyz).mul(0.05), 1)); });
    If(dv.equal(7), () => { res.assign(vec4(texture(T.irr, screenUV).level(0).a, 0, 0, 1)); });
    return res;
  })());
}

// The grime film's noise is static: bake it once into a texture (window mm -60..60).
export function makeGrimeBake() {
  return mat(Fn(() => {
    const w = screenUV.mul(2.0).sub(1.0).mul(60.0);
    return vec4(fbm(w.mul(0.06)), fbm(w.mul(0.17).add(13.1)), fbm(vec2(w.x.mul(0.5), w.y.mul(0.03)).add(4.2)), 1);
  })());
}

// value noise + fbm (2D) for the glass grime
function vnoise(p) {
  const i = floor(p), f = fract(p);
  const h = (q) => fract(sin(dot(q, vec2(127.1, 311.7))).mul(43758.5453));
  const a = h(i), b = h(i.add(vec2(1, 0))), c = h(i.add(vec2(0, 1))), d = h(i.add(vec2(1, 1)));
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
function fbm(p) {
  return vnoise(p).mul(0.5).add(vnoise(p.mul(2.03).add(1.7)).mul(0.25)).add(vnoise(p.mul(4.01).add(3.1)).mul(0.125)).add(vnoise(p.mul(8.1).add(7.7)).mul(0.0625));
}
// a dim room seen in the faceplate: dark walls, one soft window highlight, a warm lamp
function room(d) {
  const base = mix(vec3(0.006, 0.007, 0.009), vec3(0.03, 0.033, 0.04), saturate(d.y.mul(0.5).add(0.5)));
  const win = smoothstep(float(0.92), float(0.985), dot(d, normalize(vec3(-0.42, 0.5, 0.76))));
  const winBars = smoothstep(float(0.02), float(0.0), abs(fract(d.x.mul(6.0)).sub(0.5)).sub(0.47));
  const lamp = smoothstep(float(0.975), float(0.998), dot(d, normalize(vec3(0.55, 0.28, 0.79))));
  return base.add(vec3(0.75, 0.82, 0.9).mul(win.mul(float(1).sub(winBars.mul(0.7))))).add(vec3(1.0, 0.72, 0.42).mul(lamp).mul(0.6));
}

// uniforms owned by the passes (not by the scene)
export function passUniforms() {
  return {
    uFocus: uniform(new THREE.Vector4(0, 0, 27.5, 1.05)),     // focal point xyz + tilt angle (rad)
    uDof: uniform(new THREE.Vector4(0.22, 10, 0, 0)),          // px per mm of focus distance · max CoC px
    uBub: uniformArray(Array.from({ length: 24 }, () => new THREE.Vector4()), 'vec4'),
    uNB: uniform(0, 'int'),
    uGrime: uniform(0.1),
    uHudRect: uniform(new THREE.Vector4(0, 0, 1, 1)),
    uHudOn: uniform(1),
    uExposure: uniform(1.15),
    uManualSRGB: uniform(0),
    uCardGlow: uniform(0),
    uDebugView: uniform(0, 'int'),
    uIrrDiv: uniform(2),
  };
}
