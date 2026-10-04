// S4 — the foreground plate: sparse plastic cut-outs hugging the edges of the stage
// (pipe stubs, girder corners, hanging chain, kelp fronds). They sit ~13 mm in front of the
// actors, so they cast the longest, softest shadows and frame the view like the wings of a
// stage. Anchored to world rows, glued to the view edges, never over the playfield centre.
const SLOT = 150;   // world px between foreground pieces

function h(n) { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
function shade(rgb, f) { return `rgb(${Math.min(255, rgb[0] * f) | 0},${Math.min(255, rgb[1] * f) | 0},${Math.min(255, rgb[2] * f) | 0})`; }
function hex(c) { c = (c || '#222').replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join(''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }

export function drawForeground(ctx, B, M) {
  if (!B || !B.player) return;
  const VW = B.VW, VH = B.VH, RCY = B.RCY, t = B.state.tick;
  const s0 = Math.floor((RCY - M - 80) / SLOT), s1 = Math.floor((RCY + VH + M + 80) / SLOT);
  for (let s = s0; s <= s1; s++) {
    const r = h(s * 7919 + 13);
    if (r < 0.32) continue;                          // sparse: about two thirds of the slots
    const wy = s * SLOT + h(s * 31 + 7) * SLOT * 0.6;
    const y = Math.round(wy - RCY);
    const tier = B.tAt(wy);
    const th = (B.THEME && B.THEME[tier]) || {};
    const pal = (th.pal) || {};
    const base = hex(pal.base || (B.TIERS[tier] && B.TIERS[tier].rock) || '#2a3540');
    const right = h(s * 17 + 3) < 0.5;
    const kind = Math.floor(h(s * 101 + 5) * 4);
    ctx.save();
    if (right) { ctx.translate(VW, 0); ctx.scale(-1, 1); }
    const dark = shade(base, 0.55), mid = shade(base, 0.85), hi = shade(base, 1.35);
    if (kind === 0) {            // pipe stub with a flange, entering from the edge
      const len = 18 + Math.round(h(s * 3 + 1) * 22), th2 = 9 + Math.round(h(s * 5) * 5);
      ctx.fillStyle = dark; ctx.fillRect(-M, y, M + len, th2);
      ctx.fillStyle = mid; ctx.fillRect(-M, y + 1, M + len, 2);
      ctx.fillStyle = hi; ctx.fillRect(-M, y + 1, M + len, 1);
      ctx.fillStyle = dark; ctx.fillRect(len - 3, y - 2, 4, th2 + 4);
      ctx.fillStyle = mid; ctx.fillRect(len - 3, y - 2, 4, 1);
      ctx.fillStyle = shade(base, 0.35); ctx.fillRect(len + 1, y + 2, 1, th2 - 4);   // dark bore
    } else if (kind === 1) {     // girder corner bracket
      const L = 26 + Math.round(h(s * 9) * 18);
      ctx.fillStyle = dark; ctx.fillRect(-M, y, M + L, 4); ctx.fillRect(-M, y, M + 4, 30);
      for (let i = 0; i < L; i += 7) { ctx.fillRect(i, y + 4, 2, Math.max(2, 22 - i * 0.7)); }
      ctx.fillStyle = hi; ctx.fillRect(-M, y, M + L, 1);
    } else if (kind === 2) {     // chain hanging from the fly, swaying a pixel or two
      const n = 8 + Math.round(h(s * 13) * 8), x0 = 8 + Math.round(h(s * 19) * 18);
      for (let i = 0; i < n; i++) {
        const sw = Math.round(Math.sin(t * 0.03 + s + i * 0.35) * (i / n) * 3);
        ctx.fillStyle = i % 2 ? mid : dark;
        if (i % 2) ctx.fillRect(x0 + sw - 1, y - 40 + i * 5, 3, 5); else { ctx.fillRect(x0 + sw - 2, y - 40 + i * 5, 1, 5); ctx.fillRect(x0 + sw + 2, y - 40 + i * 5, 1, 5); }
      }
      ctx.fillStyle = dark; ctx.fillRect(x0 - 4, y - 40 + n * 5, 9, 6);      // hook weight
    } else {                     // kelp fronds rising from the bottom edge of a slot
      const kc = hex((th.kelp && th.kelp[0]) || '#2e7d4f');
      for (let f = 0; f < 3; f++) {
        const x0 = 2 + f * 6 + Math.round(h(s * 23 + f) * 4), H = 22 + Math.round(h(s * 29 + f) * 24);
        for (let i = 0; i < H; i++) {
          const sw = Math.round(Math.sin(t * 0.035 + f + i * 0.2 + s) * (i / H) * 4);
          ctx.fillStyle = shade(kc, 0.45 + (i / H) * 0.3);
          ctx.fillRect(x0 + sw, y + 30 - i, 2, 1);
        }
      }
    }
    ctx.restore();
  }
}
