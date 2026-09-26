import * as THREE from 'three';
import { KIND } from '../render/materials.js';
import { blob, projectUVs } from '../damage/cutter.js';

// The rubble heap a collapse leaves behind.
//
// Thousands of broken lumps of concrete are far too many to simulate, so the
// heap is a heightmap: every piece a collapse grinds up adds its volume to the
// columns of ground under it, the heap slumps to a natural angle, and lumps are
// scattered over its surface to show it. It is walkable: the heightmap is also
// a Rapier heightfield collider.

const CELL = 0.5;
const N = 128;                    // 64 m square, centred on the tower
const MAX_LUMPS = 14000;

export class Heap {
  constructor(scene, physics) {
    this.physics = physics;
    this.h = new Float32Array((N + 1) * (N + 1));
    const geos = [0, 1, 2].map((s) => { const g = blob(s * 17.3, 0.45, 0); projectUVs(g, 1); return g; });
    this.meshes = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, KIND.concrete.material, MAX_LUMPS / 3);
      m.count = 0;
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    });
    this.collider = null;
    this.dirty = false;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  _cell(x, z) {
    const i = Math.floor(x / CELL + N / 2), k = Math.floor(z / CELL + N / 2);
    if (i < 0 || k < 0 || i > N || k > N) return -1;
    return k * (N + 1) + i;
  }

  heightAt(x, z) {
    const c = this._cell(x, z);
    return c < 0 ? 0 : this.h[c];
  }

  // Add `volume` cubic metres of rubble spread over a box's footprint.
  add(box, volume) {
    const x0 = box.min.x, x1 = box.max.x, z0 = box.min.z, z1 = box.max.z;
    const area = Math.max(0.25, (x1 - x0) * (z1 - z0));
    const cells = Math.max(1, Math.round(area / (CELL * CELL)));
    const per = volume / cells / (CELL * CELL);
    for (let n = 0; n < cells; n++) {
      const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
      const c = this._cell(x, z);
      if (c >= 0) this.h[c] += per;
    }
    // Lumps on top.
    const lumps = Math.min(10, Math.round(volume * 3));
    for (let n = 0; n < lumps; n++) {
      const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
      this._lump(x, z, 0.25 + Math.random() * 0.55);
    }
    this.dirty = true;
  }

  _lump(x, z, s) {
    const m = this.meshes[(Math.random() * 3) | 0];
    if (m.count >= m.instanceMatrix.count) return;
    const y = this.heightAt(x, z);
    this._q.setFromEuler(this._e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    this._m.compose(new THREE.Vector3(x, y + s * 0.2, z), this._q, new THREE.Vector3(s, s * 0.7, s * 0.9));
    m.setMatrixAt(m.count++, this._m);
    m.instanceMatrix.needsUpdate = true;
  }

  // Let the heap slump to about 38 degrees, then rebuild the collider.
  settle() {
    if (!this.dirty) return;
    this.dirty = false;
    const h = this.h, W = N + 1, limit = CELL * 0.78;
    for (let pass = 0; pass < 30; pass++) {
      for (let k = 1; k < N; k++)
        for (let i = 1; i < N; i++) {
          const c = k * W + i;
          for (const o of [1, -1, W, -W]) {
            const d = h[c] - h[c + o];
            if (d > limit) { const t = (d - limit) * 0.25; h[c] -= t; h[c + o] += t; }
          }
        }
    }
    const R = this.physics.R;
    if (this.collider) this.physics.removeCollider(this.collider);
    // Rapier's heightfield is column-major, rows along z.
    const heights = new Float32Array(W * W);
    for (let i = 0; i < W; i++) for (let k = 0; k < W; k++) heights[i * W + k] = h[k * W + i];
    const d = R.ColliderDesc.heightfield(N, N, heights, { x: N * CELL, y: 1, z: N * CELL }).setTranslation(0, 0, 0);
    this.collider = this.physics.world.createCollider(d, this.physics.fixed);
    // Lift the lumps to where the surface has slumped to.
    for (const m of this.meshes) {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let n = 0; n < m.count; n++) {
        m.getMatrixAt(n, this._m);
        this._m.decompose(p, q, s);
        p.y = this.heightAt(p.x, p.z) + s.y * 0.2;
        this._m.compose(p, q, s);
        m.setMatrixAt(n, this._m);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  }

  // The heap as a visible surface: lumps alone leave gaps between them.
  clear() {
    this.h.fill(0);
    for (const m of this.meshes) m.count = 0;
    if (this.collider) { this.physics.removeCollider(this.collider); this.collider = null; }
    this.dirty = false;
  }
}
