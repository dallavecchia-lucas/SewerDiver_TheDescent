// Plate atlas: the legacy 2D draw calls paint the theatre's plastic plates here.
//
// Every plate is one region of a tall atlas canvas (albedo + alpha) with a twin region in an
// emissive atlas (things the old renderer drew with globalCompositeOperation='lighter').
// The legacy game keeps calling its own drawX() functions against a global `ctx`; the
// theatre just swaps that ctx between plate regions (clip + translate), so not a single
// draw function had to be rewritten.

export const MARGIN = 40;            // world px of bleed around the view, revealed by head parallax / hover

// id order == atlas row order == shader plate index
export const PLATES = [
  { key: 'back',    z: 0.0,  par: 0.55, thick: 2.0, tilt: 0.0010, label: 'S0 back cloth' },
  { key: 'scenery', z: 11.0, par: 1.0,  thick: 1.6, tilt: 0.0030, label: 'S1 scenery' },
  { key: 'rock',    z: 20.0, par: 1.0,  thick: 1.8, tilt: 0.0018, label: 'S2 stage / rock' },
  { key: 'actors',  z: 27.5, par: 1.0,  thick: 1.5, tilt: 0.0040, label: 'S3 actors' },
  { key: 'fore',    z: 41.0, par: 1.0,  thick: 1.5, tilt: 0.0050, label: 'S4 foreground' },
  { key: 'card',    z: 44.5, par: 0.0,  thick: 1.5, tilt: 0.0030, label: 'S5 card flat' },
];
export const P_BACK = 0, P_SCEN = 1, P_ROCK = 2, P_ACT = 3, P_FORE = 4, P_CARD = 5;
export const NPLATES = PLATES.length;

export class PlateAtlas {
  constructor() {
    this.alb = document.createElement('canvas');
    this.emi = document.createElement('canvas');
    this.actx = this.alb.getContext('2d', { willReadFrequently: false });
    this.ectx = this.emi.getContext('2d');
    this.hud = document.createElement('canvas');
    this.hctx = this.hud.getContext('2d');
    this.vw = 0; this.vh = 0; this.pw = 0; this.ph = 0;
    this.cur = -1;
    this.version = 0;                 // bumps when the atlas is resized (GPU textures must be recreated)
    this.dirty = new Array(NPLATES).fill(false);
  }

  ensure(vw, vh) {
    if (vw === this.vw && vh === this.vh) return;
    this.vw = vw; this.vh = vh;
    this.pw = vw + MARGIN * 2; this.ph = vh + MARGIN * 2;
    for (const c of [this.alb, this.emi]) { c.width = this.pw; c.height = this.ph * NPLATES; }
    this.hud.width = vw; this.hud.height = vh;
    for (const c of [this.actx, this.ectx, this.hctx]) c.imageSmoothingEnabled = false;
    this.version++;
  }

  // Wipe the plates the world renderer owns (the card flat is managed separately).
  beginWorld() {
    this._close();
    const h = this.ph;
    for (let k = 0; k < NPLATES; k++) {
      if (k === P_CARD) continue;
      this.actx.clearRect(0, k * h, this.pw, h);
      this.ectx.clearRect(0, k * h, this.pw, h);
      this.dirty[k] = true;
    }
  }

  // Route drawing to plate k. Returns the albedo context, translated so (0,0) is the
  // top-left corner of the game view (the MARGIN bleed sits at negative coordinates).
  use(k) {
    this._close();
    this.cur = k;
    const y0 = k * this.ph;
    for (const c of [this.actx, this.ectx]) {
      c.save();
      c.beginPath(); c.rect(0, y0, this.pw, this.ph); c.clip();
      c.translate(MARGIN, y0 + MARGIN);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    }
    this.ectx.globalCompositeOperation = 'lighter';
    this.actx.__em = this.ectx;       // radial()/glow helpers divert additive light here
    return this.actx;
  }
  em() { return this.ectx; }

  _close() {
    if (this.cur < 0) return;
    this.actx.restore(); this.ectx.restore();
    this.cur = -1;
  }

  // Paint a source canvas (the legacy flat canvas: intro, minigames, menus) onto the card flat.
  paintCard(src) {
    this._close();
    const k = P_CARD, y0 = k * this.ph;
    this.actx.clearRect(0, y0, this.pw, this.ph);
    this.ectx.clearRect(0, y0, this.pw, this.ph);
    // the card is a full printed plate: the screen content plus a molded border in the bleed
    const a = this.actx;
    a.fillStyle = '#0b1218'; a.fillRect(MARGIN - 6, y0 + MARGIN - 6, this.vw + 12, this.vh + 12);
    a.fillStyle = '#1b2731'; a.fillRect(MARGIN - 3, y0 + MARGIN - 3, this.vw + 6, this.vh + 6);
    a.drawImage(src, 0, 0, src.width, src.height, MARGIN, y0 + MARGIN, this.vw, this.vh);
    this.dirty[k] = true;
  }

  beginHud() { this._close(); this.hctx.clearRect(0, 0, this.vw, this.vh); return this.hctx; }
  end() { this._close(); }
}
