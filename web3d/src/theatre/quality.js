// Quality tiers + a frame-time governor. All four tricks stay on at every tier: only their
// fidelity scales (shading resolution, samples, grid size, speck count).
export const TIERS = {
  ultra:  { name: 'ultra',  dpr: 2.0,  irrDiv: 1, volDiv: 3, volSteps: 8, volLights: 5, dofTaps: 40, particles: 24576, fluid: { gx: 40, gy: 64, gz: 16, tpr: 4, iters: 18 } },
  high:   { name: 'high',   dpr: 1.5,  irrDiv: 2, volDiv: 4, volSteps: 7, volLights: 4, dofTaps: 32, particles: 16384, fluid: { gx: 32, gy: 48, gz: 16, tpr: 4, iters: 14 } },
  mobile: { name: 'mobile', dpr: 1.25, irrDiv: 2, volDiv: 5, volSteps: 6, volLights: 3, dofTaps: 22, particles: 8192,  fluid: { gx: 24, gy: 40, gz: 12, tpr: 4, iters: 10 } },
  low:    { name: 'low',    dpr: 1.0,  irrDiv: 3, volDiv: 6, volSteps: 5, volLights: 3, dofTaps: 16, particles: 4096,  fluid: { gx: 20, gy: 32, gz: 10, tpr: 5, iters: 8 } },
};

export class Quality {
  constructor(forced) {
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    const cores = navigator.hardwareConcurrency || 4;
    let tier = mobile ? 'mobile' : cores >= 8 ? 'high' : 'mobile';
    if (forced && TIERS[forced]) tier = forced;
    this.current = TIERS[tier];
    this.renderScale = 1;          // dynamic resolution, governed per frame
    this.ema = 16.7;
    this.slow = 0; this.fast = 0;
    this.locked = !!forced;
  }
  // returns true when the render scale changed (caller resizes targets)
  observe(ms) {
    if (!(ms > 0 && ms < 250)) return false;
    this.ema += (ms - this.ema) * 0.05;
    if (this.locked) return false;
    if (this.ema > 21) { this.slow++; this.fast = 0; } else if (this.ema < 13.5) { this.fast++; this.slow = 0; } else { this.slow = 0; this.fast = 0; }
    if (this.slow > 90 && this.renderScale > 0.55) { this.renderScale = Math.max(0.55, this.renderScale - 0.1); this.slow = 0; return true; }
    if (this.fast > 240 && this.renderScale < 1) { this.renderScale = Math.min(1, this.renderScale + 0.05); this.fast = 0; return true; }
    return false;
  }
}
