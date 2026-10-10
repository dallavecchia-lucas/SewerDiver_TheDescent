// Legibility audit against the text-size floor in ../../ui-legibility-floor.md.
//
//   node scripts/legibility.mjs [../sewerdiverdescentcity12.html]
//
// The floor: every piece of text the player needs to read has a CAP HEIGHT of at least
// 8 CSS px on the smallest supported phone viewport. This script reports, per phone
// viewport, how big one world pixel lands on screen and therefore how tall the 3x5 FONT3
// HUD font really is, then lists every CSS font size in the build that can't reach the
// floor. Exit code 1 if anything fails (so it can gate a build later).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const FLOOR_CAP_CSS = 8;          // px, cap height, non-negotiable
const COURIER_CAP = 1170 / 2048;  // Courier New cap height / em (0.571)
const FONT3_ROWS = 5;             // FONT3 glyphs are 5 font pixels tall
const MIN_CSS_FONT = Math.ceil(FLOOR_CAP_CSS / COURIER_CAP - 0.05);   // 14px for Courier New (7.998 rounds up)
// The base terminal (.cy, the CRAFT/SHOP "cyber deck") is set in a system monospace stack whose
// fonts all have caps of 0.70 em or more on phones (SF Mono, Menlo, Roboto Mono, Droid Sans
// Mono, DejaVu Sans Mono), so its floor is 12px.
const CY_CAP = 0.70;
const MIN_CY_FONT = Math.ceil(FLOOR_CAP_CSS / CY_CAP - 0.05);         // 12px
const isCy = (sel) => /^\.cy(?:$|[-\s.:>\[])/.test(sel);

// In-browser viewports (CSS px) with the browser's own bars showing: the space we really get.
const VIEWPORTS = [
  ['iPhone SE, Safari', 375, 548, 2],
  ['small Android, Chrome', 360, 640, 3],
  ['iPhone 13/14, Safari', 390, 664, 3],
  ['iPhone Pro Max, Safari', 430, 740, 3],
  ['Pixel 7, Chrome', 412, 839, 2.625],
  ['iPhone 13 landscape', 844, 340, 3],
];

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const src = process.argv[2] ? process.argv[2] : here('../../sewerdiverdescentcity12.html');
let failed = 0;

// ---- 1. on-device scale of the world canvas (and so of FONT3) ----------------------------
console.log(`Floor: cap height >= ${FLOOR_CAP_CSS} CSS px  (FONT3 needs >= ${(FLOOR_CAP_CSS / FONT3_ROWS).toFixed(1)} CSS px per font pixel; Courier New needs >= ${MIN_CSS_FONT}px; the .cy deck's monospace stack >= ${MIN_CY_FONT}px)\n`);
console.log('viewport                    canvas css   view wpx   css/wpx   FONT3 cap @1x   FONT3 scale needed');
const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? { executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH + '/chromium' } : {});
for (const [name, w, h, dpr] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await page.goto(pathToFileURL(src).href);
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => { const c = document.getElementById('c'), b = c.getBoundingClientRect(); return { cw: b.width, ch: b.height, vw: c.width, vh: c.height }; });
  await page.close();
  const s = r.ch / r.vh, cap = FONT3_ROWS * s, need = Math.ceil(FLOOR_CAP_CSS / cap - 1e-9), ok = cap >= FLOOR_CAP_CSS;
  if (!ok) failed++;
  console.log(`${(ok ? '  ' : 'x ') + name.padEnd(26)}${(r.cw.toFixed(0) + 'x' + r.ch.toFixed(0)).padEnd(13)}${(r.vw + 'x' + r.vh).padEnd(11)}${s.toFixed(2).padEnd(10)}${(cap.toFixed(2) + ' px').padEnd(16)}${need}x`);
}
await browser.close();

// ---- 2. CSS / inline font sizes that can't reach the floor -------------------------------
// Bezel prints (brand plate, screen label) are hardware decoration, not information; the
// #dev* panel is developer tooling, not player UI; the control captions (.lbl, .jhint,
// .kbdhint) are hidden on every layout by the "strip control descriptions" block. All exempt.
const EXEMPT = new Set(['.bm-name', '.bm-mk', '.scr-label', '.jhint', '.kbdhint']);
const exempt = (sel) => EXEMPT.has(sel) || /^#dev/.test(sel) || /(^|\s)\.lbl$/.test(sel);
const html = readFileSync(src, 'utf8');
const rules = [];
for (const m of html.matchAll(/([.#][\w\s.#>:,-]*?)\{([^{}]*?font(?:-size)?:[^;{}]*)/g)) {
  const sel = m[1].trim().split(/\s*,\s*/).pop();
  const decl = m[2].match(/font(?:-size)?:([^;}]*)/)[1];
  const sizes = [...decl.matchAll(/([\d.]+)px/g)].map((x) => +x[1]);
  if (!sizes.length) continue;
  const min = Math.min(...sizes);                    // clamp(): the low end is what small phones get
  if (min >= 6 && min < (isCy(sel) ? MIN_CY_FONT : MIN_CSS_FONT) && !exempt(sel)) rules.push([min, sel]);
}
const inline = [...html.matchAll(/style="[^"]*font(?:-size)?:[^";]*?([\d.]+)px/g)].map((m) => +m[1]).filter((n) => n >= 6 && n < MIN_CSS_FONT);
const canvasFonts = [...html.matchAll(/\.font='[^']*?([\d.]+)px/g)].map((m) => +m[1]);

rules.sort((a, b) => a[0] - b[0]);
console.log(`\nCSS rules below ${MIN_CSS_FONT}px (cap ${FLOOR_CAP_CSS}px in Courier New): ${rules.length}`);
const bySize = {};
for (const [n, sel] of rules) (bySize[n] ??= []).push(sel);
for (const n of Object.keys(bySize).sort((a, b) => a - b)) console.log(`  ${(n + 'px').padEnd(7)} cap ${(n * COURIER_CAP).toFixed(1)}  ${bySize[n].join(' ')}`);
console.log(`Inline style="" font sizes below ${MIN_CSS_FONT}px: ${inline.length}`);
console.log(`ctx.font in world px (shrinks with the canvas): ${canvasFonts.map((n) => n + 'px').join(', ') || 'none'}`);
failed += rules.length + inline.length + canvasFonts.length;

// ---- 3. toasts: one line, <= 26 characters at the 14px floor (see ui-toast-rewrite.md) ---
// The literal text is counted as written; each spliced-in value counts as 3 characters (a
// count or a price), except CITY_NAME, which is up to 23 (GREATER MERIDIAN SPRAWL).
const TOAST_MAX = 26;
const toasts = [];
for (const m of html.matchAll(/showMsg\(((?:'[^']*'|[^;'])*?)\)\s*[;}]/g)) {
  const arg = m[1];
  if (!arg.includes("'")) continue;                  // showMsg(t) / showMsg(m): the definition and the dev relay
  const lit = [...arg.matchAll(/'([^']*)'/g)].map((x) => x[1].replace(/\\u[0-9a-f]{4}/gi, 'x')).join('');
  const vals = arg.replace(/'[^']*'/g, '').split('+').map((x) => x.trim()).filter(Boolean);
  const len = lit.length + vals.reduce((n, v) => n + (v === 'CITY_NAME' ? 23 : 3), 0);
  toasts.push([len, arg]);
}
const longToasts = toasts.filter(([n]) => n > TOAST_MAX);
console.log(`\nToasts: ${toasts.length}, over ${TOAST_MAX} characters: ${longToasts.length}`);
for (const [n, arg] of longToasts) console.log(`  ${n}  showMsg(${arg})`);
failed += longToasts.length;

console.log(failed ? `\nFAIL: ${failed} violation(s)` : '\nPASS');
process.exit(failed ? 1 : 0);
