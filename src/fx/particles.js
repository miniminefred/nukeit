import * as THREE from 'three';

// Every soft, short-lived thing in the game — dust, smoke, flame, sparks, paint
// mist, extinguisher foam — is a particle in one of two pools: one blended
// normally, one added (for anything that glows). Each pool is one draw call.

const VERT = /* glsl */ `
  attribute vec4 tint;
  attribute float size;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (600.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec4 vTint;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = dot(p, p) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vTint.rgb, vTint.a * (1.0 - d));
  }
`;

// Presets: life (s), size (m), growth (m/s), drag, gravity (+ is down), colour.
const KINDS = {
  dust:  { life: [2.5, 5], size: [0.5, 1.2], grow: 0.8, drag: 1.6, grav: -0.1, colour: 0x9a948a, alpha: 0.55, add: false },
  chip:  { life: [0.4, 0.9], size: [0.12, 0.22], grow: 0, drag: 0.4, grav: 9.8, colour: 0x888888, alpha: 1, add: false },
  smoke: { life: [2.5, 4.5], size: [0.6, 1.0], grow: 0.9, drag: 1.0, grav: -1.4, colour: 0x2a2826, alpha: 0.5, add: false },
  flame: { life: [0.35, 0.7], size: [0.35, 0.6], grow: -0.3, drag: 1.5, grav: -3.5, colour: 0xff7a1a, alpha: 0.9, add: true },
  spark: { life: [0.3, 0.8], size: [0.06, 0.12], grow: 0, drag: 0.5, grav: 9.8, colour: 0xffc060, alpha: 1, add: true },
  flash: { life: [0.12, 0.2], size: [6, 9], grow: 20, drag: 0, grav: 0, colour: 0xffd9a0, alpha: 1, add: true },
  paint: { life: [0.25, 0.45], size: [0.08, 0.16], grow: 0.3, drag: 2.5, grav: 1, colour: 0xffffff, alpha: 0.8, add: false },
  foam:  { life: [0.5, 1.0], size: [0.25, 0.45], grow: 1.2, drag: 2.2, grav: 1.5, colour: 0xf2f4f5, alpha: 0.75, add: false },
};

class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.tint = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.BufferAttribute(this.tint, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('tint', this.aTint);
    g.setAttribute('size', this.aSize);
    this.geometry = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  add(x, y, z, vx, vy, vz, k, colour) {
    let p = this.n;
    if (p >= this.max) {
      // Full: recycle the oldest-looking slot rather than dropping the new one.
      p = (Math.random() * this.max) | 0;
    } else this.n++;
    const r = (a) => a[0] + Math.random() * (a[1] - a[0]);
    this.pos[p * 3] = x; this.pos[p * 3 + 1] = y; this.pos[p * 3 + 2] = z;
    this.vel[p * 3] = vx; this.vel[p * 3 + 1] = vy; this.vel[p * 3 + 2] = vz;
    this.tint[p * 4] = colour.r; this.tint[p * 4 + 1] = colour.g; this.tint[p * 4 + 2] = colour.b;
    this.tint[p * 4 + 3] = k.alpha;
    this.alpha0[p] = k.alpha;
    this.size[p] = r(k.size);
    this.age[p] = 0;
    this.life[p] = r(k.life);
    this.grow[p] = k.grow;
    this.drag[p] = k.drag;
    this.grav[p] = k.grav;
  }

  update(dt) {
    let n = this.n;
    for (let p = 0; p < n; p++) {
      this.age[p] += dt;
      if (this.age[p] >= this.life[p]) {
        // Swap the last live particle into this slot.
        n--;
        if (p !== n) this._move(n, p);
        p--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[p] * dt);
      const i = p * 3;
      this.vel[i] *= d; this.vel[i + 2] *= d;
      this.vel[i + 1] = this.vel[i + 1] * d - this.grav[p] * dt;
      this.pos[i] += this.vel[i] * dt;
      this.pos[i + 1] += this.vel[i + 1] * dt;
      this.pos[i + 2] += this.vel[i + 2] * dt;
      if (this.pos[i + 1] < 0.05) { this.pos[i + 1] = 0.05; this.vel[i + 1] *= -0.2; }
      this.size[p] = Math.max(0.01, this.size[p] + this.grow[p] * dt);
      const t = this.age[p] / this.life[p];
      this.tint[p * 4 + 3] = this.alpha0[p] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    this.n = n;
    this.geometry.setDrawRange(0, n);
    this.aPos.needsUpdate = this.aTint.needsUpdate = this.aSize.needsUpdate = true;
  }

  _move(from, to) {
    for (let c = 0; c < 3; c++) {
      this.pos[to * 3 + c] = this.pos[from * 3 + c];
      this.vel[to * 3 + c] = this.vel[from * 3 + c];
    }
    for (let c = 0; c < 4; c++) this.tint[to * 4 + c] = this.tint[from * 4 + c];
    this.size[to] = this.size[from];
    this.age[to] = this.age[from];
    this.life[to] = this.life[from];
    this.grow[to] = this.grow[from];
    this.drag[to] = this.drag[from];
    this.grav[to] = this.grav[from];
    this.alpha0[to] = this.alpha0[from];
  }

  clear() { this.n = 0; this.geometry.setDrawRange(0, 0); }
}

export class Particles {
  constructor(scene) {
    this.normal = new Pool(scene, 9000, false);
    this.glow = new Pool(scene, 4000, true);
    this._c = new THREE.Color();
  }

  // spawn('dust', x, y, z, vx, vy, vz[, colour])
  spawn(kind, x, y, z, vx = 0, vy = 0, vz = 0, colour) {
    const k = KINDS[kind];
    const c = this._c.set(colour ?? k.colour);
    (k.add ? this.glow : this.normal).add(x, y, z, vx, vy, vz, k, c);
  }

  // A burst of `n` particles in a random spread of speed `speed`.
  burst(kind, x, y, z, n, speed, colour, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 1;
      const s = speed * (0.3 + Math.random() * 0.7);
      const h = Math.sqrt(1 - e * e);
      this.spawn(kind, x, y, z, Math.cos(a) * h * s, e * s + up, Math.sin(a) * h * s, colour);
    }
  }

  update(dt) {
    this.normal.update(dt);
    this.glow.update(dt);
  }

  clear() {
    this.normal.clear();
    this.glow.clear();
  }
}
