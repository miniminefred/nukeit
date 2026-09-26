import * as THREE from 'three';
import { NX, NY, NZ, LAYER, VOXEL, MIN_X, MIN_Y, MIN_Z } from '../voxel/constants.js';
import { AIR, BURNS, EXPLODES } from '../voxel/materials.js';

// Fire, voxel by voxel.
//
// A burning voxel has a clock — how long its material takes to burn through —
// and while it runs it tries to light its neighbours. Carpet catches quickly and
// goes quickly, a desk smoulders for a quarter of a minute, concrete never
// catches at all. When the clock runs out the voxel is gone, which the support
// pass then sees like any other hole: burn out the carpet under a desk and the
// desk drops onto the slab.
//
// Fire reaching something explosive does not burn it: it heats it, and a
// couple of seconds later it goes off.
//
// Standing in it hurts. The extinguisher puts it out.

const MAX_BURNING = 2600;
const SPREAD_TICK = 0.4;         // seconds between spread attempts
const SPREAD_CHANCE = 0.22;      // per burning voxel per tick
const LIGHTS = 6;

export class Fire {
  constructor(scene, world, fx) {
    this.world = world;
    this.fx = fx;                     // { particles, destruction, audio }
    this.cells = new Map();           // flat index -> seconds left
    this.heating = new Map();         // flat index of an explosive -> seconds until it goes
    this._tick = 0;
    this.lights = [];
    for (let n = 0; n < LIGHTS; n++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 14, 1.6);
      // Always in the scene, and off by intensity: changing how many lights are
      // visible makes every material recompile, which is a visible hitch.
      scene.add(l);
      this.lights.push(l);
    }
  }

  get count() { return this.cells.size; }

  ignite(i, j, k) {
    if (this.cells.size >= MAX_BURNING) return false;
    const f = this.world.field;
    const m = f.get(i, j, k);
    const p = i + NX * (k + NZ * j);
    if (EXPLODES[m] > 0) { this._heat(p); return true; }
    if (BURNS[m] <= 0 || this.cells.has(p)) return false;
    this.cells.set(p, BURNS[m] * (0.7 + Math.random() * 0.6));
    return true;
  }

  // Light everything that will burn inside a sphere, with probability `chance`.
  igniteSphere(x, y, z, r, chance = 0.5) {
    const f = this.world.field;
    const i0 = Math.floor((x - r - MIN_X) / VOXEL), i1 = Math.floor((x + r - MIN_X) / VOXEL);
    const j0 = Math.max(0, Math.floor((y - r - MIN_Y) / VOXEL)), j1 = Math.floor((y + r - MIN_Y) / VOXEL);
    const k0 = Math.floor((z - r - MIN_Z) / VOXEL), k1 = Math.floor((z + r - MIN_Z) / VOXEL);
    const r2 = (r / VOXEL) ** 2;
    const ci = (x - MIN_X) / VOXEL, cj = (y - MIN_Y) / VOXEL, ck = (z - MIN_Z) / VOXEL;
    for (let j = j0; j <= j1; j++)
      for (let k = k0; k <= k1; k++)
        for (let i = i0; i <= i1; i++) {
          const d = (i + 0.5 - ci) ** 2 + (j + 0.5 - cj) ** 2 + (k + 0.5 - ck) ** 2;
          if (d > r2 || Math.random() > chance) continue;
          const m = f.get(i, j, k);
          if (BURNS[m] > 0 || EXPLODES[m] > 0) this.ignite(i, j, k);
        }
  }

  // Put out everything inside a cone. Returns how many cells went out.
  extinguish(origin, dir, range, cosHalfAngle) {
    let n = 0;
    const d = new THREE.Vector3();
    for (const p of [...this.cells.keys(), ...this.heating.keys()]) {
      this._world(p, d).sub(origin);
      const len = d.length();
      if (len > range) continue;
      if (len > 0.5 && d.dot(dir) / len < cosHalfAngle) continue;
      if (this.cells.delete(p) || this.heating.delete(p)) n++;
    }
    return n;
  }

  _heat(p) {
    if (!this.heating.has(p)) this.heating.set(p, 1.5 + Math.random() * 1.5);
  }

  _world(p, out) {
    const j = (p / LAYER) | 0, r = p - j * LAYER, k = (r / NX) | 0, i = r - k * NX;
    return out.set(MIN_X + (i + 0.5) * VOXEL, MIN_Y + (j + 0.5) * VOXEL, MIN_Z + (k + 0.5) * VOXEL);
  }

  // Returns how close the nearest flame is to `pos` (metres), for damage.
  update(dt, pos) {
    const f = this.world.field;
    const { particles, destruction } = this.fx;
    this._tick += dt;
    const spread = this._tick >= SPREAD_TICK;
    if (spread) this._tick = 0;

    let nearest = Infinity;
    const burnt = [];
    const toLight = [];
    const flameChance = Math.min(1, 160 / Math.max(1, this.cells.size)) * dt * 12;
    const v = new THREE.Vector3();
    for (const [p, left] of this.cells) {
      const j = (p / LAYER) | 0, r = p - j * LAYER, k = (r / NX) | 0, i = r - k * NX;
      if (f.get(i, j, k) === AIR) { this.cells.delete(p); continue; }
      const t = left - dt;
      if (t <= 0) { burnt.push(i, j, k); this.cells.delete(p); continue; }
      this.cells.set(p, t);
      const x = MIN_X + (i + 0.5) * VOXEL, y = MIN_Y + (j + 0.5) * VOXEL, z = MIN_Z + (k + 0.5) * VOXEL;
      const dd = Math.hypot(x - pos.x, y - (pos.y + 0.9), z - pos.z);
      if (dd < nearest) nearest = dd;
      if (Math.random() < flameChance) {
        particles.spawn('flame', x + (Math.random() - 0.5) * 0.3, y + 0.15, z + (Math.random() - 0.5) * 0.3, 0, 1 + Math.random(), 0);
        if (Math.random() < 0.2) particles.spawn('smoke', x, y + 0.6, z, (Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4);
      }
      if (spread && Math.random() < SPREAD_CHANCE) {
        // Fire climbs: pick upward neighbours more often than downward ones.
        const di = ((Math.random() * 3) | 0) - 1;
        const dk = ((Math.random() * 3) | 0) - 1;
        const dj = Math.random() < 0.5 ? 1 : ((Math.random() * 3) | 0) - 1;
        if (i + di >= 0 && i + di < NX && k + dk >= 0 && k + dk < NZ && j + dj >= 0 && j + dj < NY) toLight.push(i + di, j + dj, k + dk);
      }
    }
    for (let n = 0; n < toLight.length; n += 3) this.ignite(toLight[n], toLight[n + 1], toLight[n + 2]);
    for (let n = 0; n < burnt.length; n += 3) {
      const [i, j, k] = [burnt[n], burnt[n + 1], burnt[n + 2]];
      destruction.remove(i, j, k);
      destruction.stats.burnt++;
      if (Math.random() < 0.3) {
        this._world(i + NX * (k + NZ * j), v);
        particles.spawn('smoke', v.x, v.y, v.z, 0, 1, 0);
      }
    }

    // Gas that has been sitting in a fire long enough.
    for (const [p, left] of this.heating) {
      const t = left - dt;
      if (t > 0) { this.heating.set(p, t); continue; }
      this.heating.delete(p);
      const j = (p / LAYER) | 0, r = p - j * LAYER, k = (r / NX) | 0, i = r - k * NX;
      destruction.detonate(i, j, k);
    }

    this._placeLights();
    this.fx.audio?.fire(this.cells.size, nearest);
    return nearest;
  }

  // Hang the few lights there are over the biggest clusters of flame.
  _placeLights() {
    const buckets = new Map();
    let n = 0;
    for (const p of this.cells.keys()) {
      if ((n++ & 7) !== 0) continue;          // a sample is plenty
      const j = (p / LAYER) | 0, r = p - j * LAYER, k = (r / NX) | 0, i = r - k * NX;
      const key = (i >> 4) + 64 * ((k >> 4) + 64 * (j >> 4));
      const b = buckets.get(key);
      if (b) { b.n++; b.i += i; b.j += j; b.k += k; } else buckets.set(key, { n: 1, i, j, k });
    }
    const top = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, LIGHTS);
    for (let l = 0; l < LIGHTS; l++) {
      const light = this.lights[l], b = top[l];
      if (!b) { light.intensity = 0; continue; }
      light.position.set(
        MIN_X + (b.i / b.n + 0.5) * VOXEL,
        MIN_Y + (b.j / b.n + 1.5) * VOXEL,
        MIN_Z + (b.k / b.n + 0.5) * VOXEL,
      );
      light.intensity = (6 + Math.min(20, b.n * 2)) * (0.8 + Math.random() * 0.4);
    }
  }

  clear() {
    this.cells.clear();
    this.heating.clear();
    for (const l of this.lights) l.intensity = 0;
  }
}
