// Being there: what a demolition does to the person standing in it.
//
//   Dust     standing in a cloud, it gets in your eyes: the edges of your view
//            go brown and gritty, and clear only slowly, blinking, after you
//            are out of it.
//   Ears     a blast close by leaves them ringing — a high whine over
//            everything, and the world muffled under it for a few seconds.
//   Heat     near a fire the edges of your view glow and waver.
//   Tremor   before something gives way — a column cracking, a slab hanging —
//            the floor shakes under you, more the nearer you are; while a
//            building is coming down, the ground rumbles for streets around.

export class Senses {
  constructor(fx) {
    this.fx = fx;                // { camera, player, particles, fire, structure, topple, audio, shake }
    this.dirt = 0;               // 0..1 dust in the eyes
    this.heat = 0;               // 0..1
    this._dom();
  }

  _dom() {
    const hud = document.getElementById('hud');
    const mk = (css) => { const d = document.createElement('div'); d.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;${css}`; hud?.appendChild(d); return d; };
    // Grit: a brown haze strongest at the edges, with specks in it.
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    // One brown for all of it, lighter or darker grain by grain; soft, small,
    // and crowding to the edges, as grit in the eyes does.
    g.filter = 'blur(0.8px)';
    for (let i = 0; i < 1800; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const edge = Math.hypot(x - 256, y - 256) / 362;
      if (Math.random() > edge ** 3 * 1.4) continue;
      const k = 0.6 + Math.random() * 0.6;
      g.fillStyle = `rgba(${(105 * k) | 0},${(86 * k) | 0},${(62 * k) | 0},${0.2 + Math.random() * 0.45})`;
      g.beginPath(); g.arc(x, y, 0.4 + Math.random() * 1.3, 0, Math.PI * 2); g.fill();
    }
    this.el = {
      dust: mk(`background:url(${c.toDataURL()}) center/cover,radial-gradient(ellipse at center,transparent 35%,rgba(120,98,70,.55) 75%,rgba(80,62,42,.85) 100%)`),
      heat: mk('background:radial-gradient(ellipse at center,transparent 45%,rgba(255,120,30,.35) 80%,rgba(255,80,10,.6) 100%);mix-blend-mode:screen'),
    };
  }

  // A blast at `at` with radius r: ears ring the closer it was; dust flies.
  blast(at, r) {
    const d = at.distanceTo(this.fx.camera.position);
    const k = Math.max(0, Math.min(1, (r * 6) / (d + 2) - 0.15));
    if (k > 0.05) this.fx.audio?.ears?.(k);
    this.dirt = Math.min(1, this.dirt + k * 0.5);
  }

  update(dt, live) {
    const { camera, player, particles, fire, structure, topple, shake } = this.fx;
    const eye = camera.position;
    // Dust in the eyes: the thicker the air you are in, the faster.
    const dens = live ? particles.veil.at(eye.x, eye.y, eye.z) : 0;
    this.dirt = Math.min(1, Math.max(0, this.dirt + dens * dt * 6 - dt * (dens > 0.02 ? 0 : 0.12)));
    // Heat: the nearest fires, by how hot and how near.
    let heat = 0;
    if (live && fire?.count) {
      for (const s of fire.spots) {
        const d2 = s.p.distanceToSquared(eye);
        if (d2 < 100) heat = Math.max(heat, Math.min(1, (s.heat * 4) / (d2 + 1)));
      }
    }
    this.heat += (heat - this.heat) * Math.min(1, dt * 3);
    // The floor trembling under what is about to go.
    if (live && !player.dead) {
      let tremor = 0;
      for (const w of structure.warnings) tremor = Math.max(tremor, 1 / (1 + w.p.box.distanceToPoint(player.pos) / 4));
      for (const s of structure.sagging) tremor = Math.max(tremor, 0.6 / (1 + s.p.box.distanceToPoint(player.pos) / 4));
      // A building coming down: the ground rumbles, less with distance.
      if (topple.active || structure.collapsing) tremor = Math.max(tremor, 1 / (1 + Math.hypot(eye.x, eye.z) / 60));
      if (tremor > 0.05) shake.add(tremor * dt * 0.9);
    }
    this.el.dust.style.opacity = (this.dirt * 0.9).toFixed(3);
    const flick = 0.85 + 0.15 * Math.sin(performance.now() / 90);
    this.el.heat.style.opacity = (this.heat * flick).toFixed(3);
  }

  clear() { this.dirt = 0; this.heat = 0; this.fx.audio?.ears?.(0); }
}
