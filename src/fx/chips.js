import * as THREE from 'three';
import { KIND } from '../render/materials.js';
import { blob } from '../damage/cutter.js';

// Small bits: the chips of timber, grit of concrete, crumbs of plaster and
// slivers of glass that a blow throws off.
//
// They are not rigid bodies — there are far too many — but they do fall, bounce
// off the real geometry (one physics ray per moving chip per frame), and come to
// rest on whatever they land on. A few seconds later they shrink away: small
// broken bits do not pile up, only the big chunks (which are pieces) stay.

const MAX = 1800;
const COLOURS = {
  wood: 0xc79a62, concrete: 0x9b958c, marble: 0xcf9f92, plaster: 0xeeeae2, carpet: 0x55505a,
  fabric: 0x3a4250, plastic: 0x2a2a2c, metal: 0x8a8d90, bronze: 0x5a4a38, roofing: 0x555555,
  soil: 0x5a4430, leaves: 0x3f6a2f, brass: 0xc9a043, paper: 0xe8e0d0, leather: 0x3a2a20,
};
// How each kind's chips are proportioned: wood comes off in slivers, glass in flakes.
const LINGER = 4;          // s a chip lies still before it goes
const SHRINK = 0.7;        // s it takes to go
const SHAPES = { wood: [3.2, 0.35, 0.5], plaster: [1, 0.55, 0.9], glass: [1, 0.1, 0.8], concrete: [1, 0.75, 0.85] };

export class Chips {
  constructor(scene, physics) {
    this.physics = physics;
    // Irregular lumps, not cubes: a coarse blob, squashed per chip below.
    const g = blob(3.1, 0.45, 0).scale(0.5, 0.5, 0.5);
    this.solid = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.9 }), MAX);
    this.glass = new THREE.InstancedMesh(g, KIND.glass.material, 1500);
    for (const m of [this.solid, this.glass]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.castShadow = m === this.solid;
      m.receiveShadow = true;
      scene.add(m);
    }
    this.solid.setColorAt(0, new THREE.Color());
    this.items = { solid: [], glass: [] };
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._dir = { x: 0, y: 0, z: 0 };
    this._org = { x: 0, y: 0, z: 0 };
    this.dirty = { solid: true, glass: true };
  }

  // A burst of `n` chips of `kind` at `at`, thrown about `dir` at `speed`.
  burst(kind, at, dir, n, speed = 3, size = 0.03) {
    const list = kind === 'glass' ? this.items.glass : this.items.solid;
    const max = kind === 'glass' ? 1500 : MAX;
    const shape = SHAPES[kind] ?? [1, 0.8, 0.9];
    const colour = COLOURS[kind] ?? 0x888888;
    for (let i = 0; i < n; i++) {
      if (list.length >= max) list.splice(0, 1);
      const s = size * (0.4 + Math.random() * 1.2);
      list.push({
        x: at.x, y: at.y, z: at.z,
        vx: dir.x * speed * (0.4 + Math.random()) + (Math.random() - 0.5) * speed,
        vy: dir.y * speed * (0.4 + Math.random()) + Math.random() * speed * 0.8,
        vz: dir.z * speed * (0.4 + Math.random()) + (Math.random() - 0.5) * speed,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        sx: (Math.random() - 0.5) * 20, sy: (Math.random() - 0.5) * 20,
        w: s * shape[0], h: s * shape[1], d: s * shape[2],
        colour, rest: false,
      });
    }
    this.dirty[kind === 'glass' ? 'glass' : 'solid'] = true;
  }

  update(dt) {
    // Chips that have lain still long enough shrink and go.
    for (const key of ['solid', 'glass']) {
      const list = this.items[key];
      let changed = false;
      for (const c of list) if (c.rest) { c.t = (c.t ?? 0) + dt; if (c.t > LINGER) changed = true; }
      if (changed) {
        this.items[key] = list.filter((c) => !(c.rest && c.t > LINGER + SHRINK));
        this.dirty[key] = true;
      }
    }
    // Ray tests are the whole cost, so only so many chips get one each frame;
    // the rest coast for a frame and take their turn next time.
    let rays = 160;
    for (const key of ['solid', 'glass']) {
      const list = this.items[key];
      let moving = false;
      for (const c of list) {
        if (c.rest) continue;
        moving = true;
        c.vy -= 16 * dt;
        const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt, nz = c.z + c.vz * dt;
        const dx = nx - c.x, dy = ny - c.y, dz = nz - c.z;
        const len = Math.hypot(dx, dy, dz);
        const test = rays > 0 || c.skipped > 2;
        c.skipped = test ? 0 : (c.skipped ?? 0) + 1;
        if (test) rays--;
        if (len > 1e-5 && test) {
          this._org.x = c.x; this._org.y = c.y; this._org.z = c.z;
          this._dir.x = dx / len; this._dir.y = dy / len; this._dir.z = dz / len;
          const hit = this.physics.raycast(this._org, this._dir, len + 0.01);
          if (hit) {
            const n = hit.normal;
            const vn = c.vx * n.x + c.vy * n.y + c.vz * n.z;
            c.vx = (c.vx - 1.5 * vn * n.x) * 0.45;
            c.vy = (c.vy - 1.5 * vn * n.y) * 0.45;
            c.vz = (c.vz - 1.5 * vn * n.z) * 0.45;
            c.x = hit.point.x + n.x * 0.01; c.y = hit.point.y + n.y * 0.01; c.z = hit.point.z + n.z * 0.01;
            c.sx *= 0.5; c.sy *= 0.5;
            if (n.y > 0.6 && Math.hypot(c.vx, c.vy, c.vz) < 0.6) {
              c.rest = true;
              c.y = hit.point.y + c.h * 0.4;
              c.rx = 0; c.rz = Math.random() * 0.3;
            }
            continue;
          }
        }
        c.x = nx; c.y = ny; c.z = nz;
        c.rx += c.sx * dt; c.ry += c.sy * dt;
        if (c.y < -2) c.rest = true;
      }
      if (moving || this.dirty[key]) this._write(key);
      this.dirty[key] = moving || list.some((c) => c.rest && c.t > LINGER);
    }
  }

  _write(key) {
    const mesh = this[key], list = this.items[key];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      this._q.setFromEuler(this._e.set(c.rx, c.ry, c.rz));
      const k = c.rest && c.t > LINGER ? Math.max(0.01, 1 - (c.t - LINGER) / SHRINK) : 1;
      this._s.set(c.w * k, c.h * k, c.d * k);
      this._m.compose(this._s.clone().set(c.x, c.y, c.z), this._q, this._s);
      mesh.setMatrixAt(i, this._m);
      if (key === 'solid') mesh.setColorAt(i, this._c.set(c.colour));
    }
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // Wake everything: the floor under the chips may have gone.
  unsettle() {
    for (const list of Object.values(this.items)) for (const c of list) { if (c.rest) { c.rest = false; c.vx = c.vz = 0; c.vy = 0; } }
  }

  clear() {
    this.items.solid.length = 0;
    this.items.glass.length = 0;
    this.dirty.solid = this.dirty.glass = true;
  }
}
