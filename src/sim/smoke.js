import * as THREE from 'three';
import { FLOOR_H, PODIUM_FLOORS, TOP_FLOOR, LOWER, U, ATRIUM, CORE, OUTLINE, inPoly, podiumFront } from '../building/plan.js';

// Smoke that fills a building.
//
// Hot smoke rises to the ceiling and spreads along it, a layer that gets
// deeper as the fire goes on, until it banks down to head height and the room
// is dark under it. It goes out through windows that are broken, and up the
// stairs and the atrium to the floors above.
//
// Each storey is a grid of two-metre cells, each holding how deep its smoke
// layer is (0 none .. 1 floor to ceiling). Fires feed the cell they burn in;
// five times a second the smoke evens out between neighbours, leaks out of
// broken windows, rises up the shafts, and slowly thins. Each smoky cell is
// drawn as a dark box hanging from the ceiling, as deep as its layer. With
// your head in it you can barely see; crouch, and you are under it.

const C = 2;                                 // m, a cell
const X0 = -20, Z0 = -12, NX = 20, NZ = 12;  // the podium's plan; the tower's is inside it
const FLOORS = TOP_FLOOR - LOWER + 1;
const SPREAD = 0.55;                         // of the difference with its neighbours evened out per second
const VENT = 0.6;                            // per second, out of a cell open to the air
const RISE = 0.5;                            // per second, up a shaft to the floor above
const THIN = 0.004;                          // per second, everywhere
const MAX_BOXES = 2600;

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Smoke {
  constructor(scene, pieces, fx) {
    this.pieces = pieces;
    this.fx = fx;                            // { particles }
    this.d = new Float32Array(FLOORS * NX * NZ);
    this.inside = new Uint8Array(FLOORS * NX * NZ);   // 0 outside, 1 floor, 2 shaft (stair, atrium)
    this.active = new Set();                 // storeys with any smoke
    this._tick = 0;
    for (let f = LOWER; f <= TOP_FLOOR; f++) for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) {
      const x = X0 + (i + 0.5) * C, z = Z0 + (k + 0.5) * C;
      const n = this._n(f, i, k);
      let inside;
      if (f === LOWER || f < PODIUM_FLOORS) inside = z < (f === LOWER ? 12 : podiumFront(f));
      else inside = inPoly(OUTLINE, x, z);
      if (!inside) continue;
      const stair = x > CORE.x0 && x < 0 && z > CORE.z0 && z < CORE.z1;
      const atrium = f >= 0 && f < PODIUM_FLOORS - 1 && x > ATRIUM.x0 && x < ATRIUM.x1 && z > ATRIUM.z0 && z < ATRIUM.z1;
      this.inside[n] = stair || atrium ? 2 : 1;
    }
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({
      color: 0x26231f, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide, fog: true,
    }), MAX_BOXES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  // After a job loads: which window panes open each cell to the air when they
  // break. A pane belongs to the cell just inside it.
  attach() {
    this.clear();
    this.panes = new Map();
    for (const p of this.pieces.list) {
      if (p.role !== 'glass' || p.building !== 'tower' || p.kind.name !== 'glass') continue;
      const c = p.box.getCenter(new THREE.Vector3());
      const inward = new THREE.Vector3(-c.x, 0, -c.z).normalize();
      for (const step of [0, 0.8, 1.6]) {
        const n = this._cell(c.clone().addScaledVector(inward, step));
        if (n < 0) continue;
        (this.panes.get(n) ?? this.panes.set(n, []).get(n)).push(p);
        break;
      }
    }
  }

  // Is this cell open to the air — a pane of its window broken?
  _open(n) {
    const list = this.panes?.get(n);
    return !!list && list.some((p) => p.state !== 'static');
  }

  _n(f, i, k) { return ((f - LOWER) * NX + i) * NZ + k; }

  _cell(p) {
    const f = Math.floor((p.y - 0.3) / FLOOR_H);
    const i = Math.floor((p.x - X0) / C), k = Math.floor((p.z - Z0) / C);
    if (f < LOWER || f > TOP_FLOOR || i < 0 || i >= NX || k < 0 || k >= NZ) return -1;
    const n = this._n(f, i, k);
    return this.inside[n] ? n : -1;
  }

  // A fire at `p` puts out `amount` of smoke (in cells' worth) this frame.
  add(p, amount) {
    const n = this._cell(p);
    if (n < 0) return;
    this.d[n] = Math.min(1, this.d[n] + amount);
    this.active.add(Math.floor(n / (NX * NZ)) + LOWER);
  }

  // How far into the smoke a point is: 0 under the layer or out of it, up to 1.
  at(p) {
    const n = this._cell(p);
    if (n < 0 || this.d[n] <= 0) return 0;
    const f = Math.floor(n / (NX * NZ)) + LOWER;
    const bottom = U(f) - this.d[n] * (FLOOR_H - 0.3);
    return p.y > bottom ? Math.min(1, 0.3 + (p.y - bottom) / 1.2) * Math.min(1, this.d[n] * 2) : 0;
  }

  // The deepest smoke anywhere — for the alarm.
  worst() {
    let w = 0;
    for (const f of this.active) {
      const base = (f - LOWER) * NX * NZ;
      for (let j = 0; j < NX * NZ; j++) if (this.d[base + j] > w) w = this.d[base + j];
    }
    return w;
  }

  update(dt) {
    if (!this.active.size) { if (this.mesh.count) { this.mesh.count = 0; } return; }
    this._tick -= dt;
    if (this._tick > 0) return;
    const step = 0.2 - this._tick;
    this._tick = 0.2;
    const d = this.d, next = new Float32Array(NX * NZ);
    for (const f of [...this.active]) {
      const base = (f - LOWER) * NX * NZ;
      let any = false;
      for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) {
        const n = base + i * NZ + k;
        if (!this.inside[n]) continue;
        let v = d[n], sum = 0, cnt = 0;
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, kk = k + dk;
          if (ii < 0 || ii >= NX || kk < 0 || kk >= NZ) continue;
          const m = base + ii * NZ + kk;
          if (!this.inside[m]) continue;
          sum += d[m]; cnt++;
        }
        if (cnt) v += (sum / cnt - v) * Math.min(1, SPREAD * step * 2);
        // Out of a broken window, in a puff you can see from the street.
        if (v > 0.02 && this._open(n)) {
          const out = v * Math.min(1, VENT * step);
          v -= out;
          if (Math.random() < out * 8) {
            const x = X0 + (i + 0.5) * C, z = Z0 + (k + 0.5) * C;
            this.fx.particles.spawn('smoke', x, U(f) - 0.5, z, (x > 0 ? 1 : -1) * 0.6, 0.6, (z > 0 ? 1 : -1) * 0.6, 0x2a2826);
          }
        }
        // Up a shaft.
        if (this.inside[n] === 2 && f < TOP_FLOOR && v > 0.01) {
          const up = n + NX * NZ;
          if (this.inside[up]) { const m = v * Math.min(1, RISE * step); v -= m; d[up] = Math.min(1, d[up] + m); this.active.add(f + 1); }
        }
        v = Math.max(0, v - THIN * step);
        next[i * NZ + k] = v;
        if (v > 0.005) any = true;
      }
      d.set(next, base);
      next.fill(0);
      if (!any) { this.active.delete(f); d.fill(0, base, base + NX * NZ); }
    }
    this._draw();
  }

  _draw() {
    let n = 0;
    for (const f of this.active) {
      const base = (f - LOWER) * NX * NZ, top = U(f) - 0.03;
      for (let i = 0; i < NX && n < MAX_BOXES; i++) for (let k = 0; k < NZ; k++) {
        const v = this.d[base + i * NZ + k];
        if (v < 0.03) continue;
        const h = v * (FLOOR_H - 0.3);
        _m.compose(_v.set(X0 + (i + 0.5) * C, top - h / 2, Z0 + (k + 0.5) * C), _q, _s.set(C + 0.02, h, C + 0.02));
        this.mesh.setMatrixAt(n++, _m);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.d.fill(0);
    this.active.clear();
    this.mesh.count = 0;
  }
}
