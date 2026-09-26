import * as THREE from 'three';

// Every sound in the game is synthesised here with Web Audio: filtered noise
// and a few oscillators. There are no sound files.
//
// One-shots (a blow, a blast) are built fresh each time, which is cheap for
// noise. The continuous things — the rumble of a collapse, fire crackling, the
// spray can and the extinguisher — are four loops that run all the time and are
// faded up and down.

const MAT_SOUND = {
  glass: { f: 3800, q: 1.2, len: 0.35, gain: 0.8, ring: 5200 },
  concrete: { f: 900, q: 0.9, len: 0.22, gain: 1 },
  marble: { f: 1300, q: 1.2, len: 0.22, gain: 1, ring: 2400 },
  steel: { f: 1800, q: 4, len: 0.5, gain: 0.8, ring: 1250 },
  mullion: { f: 1500, q: 3, len: 0.35, gain: 0.7, ring: 900 },
  brass: { f: 1600, q: 5, len: 0.6, gain: 0.7, ring: 1480 },
  wood: { f: 450, q: 1.4, len: 0.18, gain: 1 },
  drywall: { f: 1100, q: 0.8, len: 0.16, gain: 0.8 },
  default: { f: 800, q: 1, len: 0.2, gain: 0.9 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.listener = new THREE.Vector3();
    this.right = new THREE.Vector3(1, 0, 0);
    this._rumble = 0;
  }

  // Must be called from a user gesture.
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loops = {
      rumble: this._loop('lowpass', 110, 0.7),
      fire: this._loop('bandpass', 2400, 0.6),
      spray: this._loop('highpass', 5000, 0.5),
      foam: this._loop('bandpass', 1400, 0.4),
    };
  }

  _loop(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(filt).connect(g).connect(this.master);
    src.start();
    return g;
  }

  setListener(camera) {
    this.listener.copy(camera.position);
    this.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  }

  // Gain and pan for a sound at a world point.
  _place(x, y, z, range = 30) {
    const dx = x - this.listener.x, dy = y - this.listener.y, dz = z - this.listener.z;
    const d = Math.hypot(dx, dy, dz);
    const gain = 1 / (1 + (d / range) ** 2);
    const pan = d > 0.01 ? THREE.MathUtils.clamp((dx * this.right.x + dy * this.right.y + dz * this.right.z) / d, -1, 1) * 0.8 : 0;
    return { gain, pan };
  }

  _out(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.master);
    return g;
  }

  _noise(dest, { type = 'bandpass', f = 1000, q = 1, len = 0.2, gain = 1, attack = 0.004, drop = 1 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filt = ctx.createBiquadFilter();
    filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f, t);
    if (drop !== 1) filt.frequency.exponentialRampToValueAtTime(Math.max(30, f * drop), t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filt).connect(g).connect(dest);
    // A random start so no two bursts are identical, but never so late that a
    // long one runs off the end of the two-second buffer.
    src.start(t, Math.random() * Math.max(0, 1.9 - len), len + 0.05);
  }

  _tone(dest, { f, len, gain, type = 'sine', drop = 1 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (drop !== 1) o.frequency.exponentialRampToValueAtTime(f * drop, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.05);
  }

  // A blow landing on a material.
  hit(material, x, y, z, strength = 1) {
    if (!this.ctx) return;
    const s = MAT_SOUND[material] ?? MAT_SOUND.default;
    const { gain, pan } = this._place(x, y, z, 12);
    const out = this._out(gain * strength, pan);
    this._noise(out, { f: s.f, q: s.q, len: s.len, gain: s.gain });
    this._noise(out, { type: 'lowpass', f: 220, q: 0.7, len: 0.12, gain: 0.7 });
    if (s.ring) this._tone(out, { f: s.ring * (0.95 + Math.random() * 0.1), len: s.len * 1.6, gain: 0.12, type: 'triangle' });
  }

  swing() {
    if (!this.ctx) return;
    const out = this._out(0.35, 0);
    this._noise(out, { f: 600, q: 2, len: 0.25, gain: 0.6, attack: 0.08, drop: 3 });
  }

  explosion(x, y, z, r) {
    if (!this.ctx) return;
    const { gain, pan } = this._place(x, y, z, 60);
    const out = this._out(Math.min(1.5, gain * (0.6 + r / 5)), pan);
    this._noise(out, { type: 'lowpass', f: 1800, q: 0.5, len: 2.8, gain: 1, attack: 0.005, drop: 0.08 });
    this._noise(out, { type: 'bandpass', f: 3000, q: 0.5, len: 0.4, gain: 0.6 });
    this._tone(out, { f: 70, len: 1.2, gain: 0.9, drop: 0.4 });
  }

  impact(x, y, z, a) {
    if (!this.ctx) return;
    const { gain, pan } = this._place(x, y, z, 40);
    const out = this._out(gain * (0.3 + a), pan);
    this._noise(out, { type: 'lowpass', f: 500, q: 0.6, len: 1.2, gain: 0.9, drop: 0.3 });
  }

  // Raise the collapse rumble; it falls away by itself.
  rumble(level) { this._rumble = Math.max(this._rumble, level); }

  fire(count, nearest) {
    if (!this.ctx) return;
    const near = count > 0 ? 1 / (1 + (nearest / 8) ** 2) : 0;
    const level = Math.min(0.6, Math.sqrt(count) / 40) * (0.3 + 0.7 * near);
    // A crackle is the level jumping about, not a steady hiss.
    const g = this.loops.fire.gain;
    g.setTargetAtTime(level * (0.4 + Math.random() * 1.2), this.ctx.currentTime, 0.02);
  }

  spray(on) { this.ctx && this.loops.spray.gain.setTargetAtTime(on ? 0.25 : 0, this.ctx.currentTime, 0.03); }
  foam(on) { this.ctx && this.loops.foam.gain.setTargetAtTime(on ? 0.45 : 0, this.ctx.currentTime, 0.05); }

  hurt() {
    if (!this.ctx) return;
    const out = this._out(0.5, 0);
    this._tone(out, { f: 180, len: 0.25, gain: 0.4, type: 'square', drop: 0.5 });
  }

  click() {
    if (!this.ctx) return;
    const out = this._out(0.3, 0);
    this._tone(out, { f: 900, len: 0.06, gain: 0.3, type: 'square' });
  }

  update(dt) {
    if (!this.ctx) return;
    this.loops.rumble.gain.setTargetAtTime(this._rumble * 1.4, this.ctx.currentTime, 0.2);
    this._rumble = Math.max(0, this._rumble - dt * 0.35);
  }

  silence() {
    if (!this.ctx) return;
    for (const g of Object.values(this.loops)) g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this._rumble = 0;
  }
}
