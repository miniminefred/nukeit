// Graphics quality, and keeping the frame rate up.
//
// Measured on the tower, the cost is almost all per pixel: ambient occlusion
// was 10–20 ms of a frame on its own, the sun's shadows about 6, bloom a few.
// Draw calls are a hundred or so and are not the problem. So quality is a
// handful of switches over those, and in Auto the game watches its own frame
// time and moves between levels — down quickly when it is slow, up slowly
// when there is room.

export const LEVELS = [
  { name: 'Low',    ratio: 0.7,  ao: false, bloom: false, shadow: 1024, shadows: true },
  { name: 'Medium', ratio: 0.85, ao: false, bloom: true,  shadow: 2048, shadows: true },
  { name: 'High',   ratio: 1,    ao: false, bloom: true,  shadow: 2048, shadows: true },
  { name: 'Ultra',  ratio: 1.25, ao: true,  bloom: true,  shadow: 4096, shadows: true },
];

const KEY = 'nukeit.quality.v1';

export class Quality {
  constructor(renderer, post, lights) {
    this.renderer = renderer;
    this.post = post;
    this.lights = lights;
    let saved = 'auto';
    try { saved = localStorage.getItem(KEY) ?? 'auto'; } catch { /* no storage */ }
    this.mode = saved;                       // 'auto' or a level index as a string
    this.level = saved === 'auto' ? 1 : Math.min(LEVELS.length - 1, Math.max(0, +saved || 0));
    this._acc = 0; this._n = 0; this._good = 0; this._cool = 0;
    this.apply();
  }

  // 'auto', or 0..3.
  set(mode) {
    this.mode = String(mode);
    try { localStorage.setItem(KEY, this.mode); } catch { /* no storage */ }
    if (this.mode !== 'auto') this.level = +this.mode;
    this.apply();
  }

  apply() {
    const L = LEVELS[this.level];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr * L.ratio);
    this.post.composer.setPixelRatio(dpr * L.ratio);
    this.post.composer.setSize(window.innerWidth, window.innerHeight);
    this.post.ao.enabled = L.ao;
    this.post.bloom.enabled = L.bloom;
    const sun = this.lights.sun;
    sun.castShadow = L.shadows;
    if (sun.shadow.mapSize.x !== L.shadow) {
      sun.shadow.mapSize.set(L.shadow, L.shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }

  get label() { return (this.mode === 'auto' ? 'Auto · ' : '') + LEVELS[this.level].name; }

  // Called every real frame with its wall-clock length in seconds.
  sample(dt) {
    if (this.mode !== 'auto' || dt <= 0 || dt > 0.25) return;
    this._acc += dt; this._n++;
    this._cool -= dt;
    if (this._acc < 1) return;                // judge a second at a time
    const avg = this._acc / this._n;
    this._acc = 0; this._n = 0;
    if (this._cool > 0) return;
    if (avg > 1 / 45 && this.level > 0) {
      this.level--; this._good = 0; this._cool = 2; this.apply();
    } else if (avg < 1 / 75) {
      if (++this._good >= 4 && this.level < LEVELS.length - 1) { this.level++; this._good = 0; this._cool = 3; this.apply(); }
    } else this._good = 0;
  }
}
