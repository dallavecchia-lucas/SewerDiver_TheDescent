// Physical model of the flooded bulb, shared by the CPU (calibration, input mapping,
// prompt placement) and mirrored 1:1 in the GPU tracer (renderer.js, glassRay()).
//
// Units are millimetres. +z points at the viewer; the box back is z=0, the faceplate apex
// sits at Z_WIN. The eye looks through the faceplate window (an off-axis "window"
// projection, like a tilt-shift lens' shift), then refracts air -> glass -> water.

export const OPT = {
  Z_WIN: 62.0,        // outer faceplate apex
  L: 175.0,           // eye distance in front of the faceplate
  EYE_Y: 9.0,         // the toy is held slightly below eye level: we look a touch down into the box
  HH: 48.0,           // half-height of the view rect on the faceplate plane (mm)
  R_OUT: 210.0,       // faceplate sphere radius (CRT tube face curvature); fitTube() sets it per view shape
  R_PORTRAIT: 210.0,  // the reference tube: a portrait view always gets exactly this curvature
  T_GLASS: 2.6,       // glass thickness
  N_GLASS: 1.52,
  N_WATER: 1.333,
  BULB_PAD: 1.045,    // bulb glass extends a little past the game view rect
  BULB_POW: 8.0,      // superellipse exponent of the tube face outline (8 ~ late-60s rectangular CRT)
  CARD_FIT: 0.93,     // the card flat's size vs the stage opening (portrait)
};

// Fit the tube to the view's shape. Portrait (and square) views get the reference tube,
// untouched. A landscape view is the same set behind a wider, flatter, squarer faceplate:
// spreading the portrait curvature over a much longer face would bow the picture's sides and
// round its corners away, so the sphere radius grows with the aspect (the bulge stays, just
// subtle), the outline squares up so the corners keep the game, and the card flat (minigames,
// menus) takes more of the opening. Sets OPT.R_OUT; returns the outline / card parameters.
export function fitTube(halfW, halfH) {
  const a = halfW / halfH;
  const t = Math.min(1, Math.max(0, (a - 1) / 0.5));       // 0 portrait..square, 1 at 3:2 and wider
  OPT.R_OUT = OPT.R_PORTRAIT * Math.pow(Math.max(1, a), 0.8);
  return {
    pow: OPT.BULB_POW + 6 * t,
    card: OPT.CARD_FIT + 0.04 * t,
    // the glass runs past the view by BULB_PAD; a landscape face only by the height's pad, so
    // its sides don't get a thicker rim than its top and bottom
    bx: Math.min(halfW * OPT.BULB_PAD, halfW + halfH * (OPT.BULB_PAD - 1)), by: halfH * OPT.BULB_PAD,
  };
}

// ---- tiny vec3 helpers (allocation-light; this runs a few hundred times per frame at most)
const v = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// GLSL-style refract (eta = n1/n2). Returns null on total internal reflection.
export function refract(I, N, eta) {
  const d = dot(N, I), k = 1 - eta * eta * (1 - d * d);
  if (k < 0) return null;
  return sub(mul(I, eta), mul(N, eta * d + Math.sqrt(k)));
}

// nearest positive intersection of ray o+t*d with sphere (c, r); -1 if none
function hitSphere(o, d, c, r) {
  const oc = sub(o, c), b = dot(oc, d), cc = dot(oc, oc) - r * r, h = b * b - cc;
  if (h < 0) return -1;
  const s = Math.sqrt(h), t0 = -b - s, t1 = -b + s;
  return t0 > 1e-4 ? t0 : (t1 > 1e-4 ? t1 : -1);
}

export function eyePos(head) { return v(head.x, OPT.EYE_Y + head.y, OPT.Z_WIN + OPT.L); }

// Trace the eye ray through window point (wx, wy) [mm on the faceplate plane] into the water.
// Returns { o, d } of the in-water ray (o on the inner glass surface).
export function glassRay(eye, wx, wy) {
  const C = v(0, 0, OPT.Z_WIN - OPT.R_OUT);
  const d0 = norm(sub(v(wx, wy, OPT.Z_WIN), eye));
  const t1 = hitSphere(eye, d0, C, OPT.R_OUT);
  const p1 = add(eye, mul(d0, t1));
  const n1 = norm(sub(p1, C));
  const d1 = refract(d0, n1, 1 / OPT.N_GLASS);
  const t2 = hitSphere(p1, d1, C, OPT.R_OUT - OPT.T_GLASS);
  const p2 = add(p1, mul(d1, t2));
  const n2 = norm(sub(p2, C));
  const d2 = refract(d1, n2, OPT.N_GLASS / OPT.N_WATER) || d1;
  return { o: p2, d: d2 };
}

// Where does the window point (wx,wy) land on the plane z = zp (no tilt)?
export function landAtZ(eye, wx, wy, zp) {
  const r = glassRay(eye, wx, wy);
  const t = (zp - r.o[2]) / r.d[2];
  return [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t];
}

// Plate calibration: size and centre each plate so that, seen from the resting eye, its
// game view (VW x VH world px) exactly fills the view rect — the 3D theatre reproduces the
// flat game's framing pixel for pixel, and only head motion / hover reveal the depth.
export function calibratePlate(zp, hw, hh, vw, vh) {
  const eye = eyePos({ x: 0, y: 0 });
  const L = landAtZ(eye, -hw, 0, zp), R = landAtZ(eye, hw, 0, zp);
  const T = landAtZ(eye, 0, hh, zp), B = landAtZ(eye, 0, -hh, zp);
  const sx = (R[0] - L[0]) / vw, sy = (T[1] - B[1]) / vh;
  return { s: (sx + sy) * 0.5, cx: (L[0] + R[0]) * 0.5, cy: (T[1] + B[1]) * 0.5 };
}

// Centre magnification vs looking at the same plate with no glass and no water.
export function magnificationAt(zp, hh) {
  const eye = eyePos({ x: 0, y: 0 });
  const e = 0.5;     // small window offset around the centre
  const a = landAtZ(eye, 0, e, zp)[1] - landAtZ(eye, 0, -e, zp)[1];
  const D = eye[2] - zp, Dw = eye[2] - OPT.Z_WIN;
  const bare = 2 * e * D / Dw;   // straight line projection of the same window span
  return bare / a;
}
