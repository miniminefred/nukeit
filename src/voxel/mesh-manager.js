import * as THREE from 'three';
import { CHUNK, VOXEL } from './constants.js';
import { meshChunk } from './mesher.js';

// One mesh per chunk of a Field, kept in step with its dirty set.
//
// The meshes hang off `group`, whose position is the field's corner in world
// space. For the world that never moves; for a falling body it is the body.

export const VOXEL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

const CHUNK_M = CHUNK * VOXEL;
const _v = new THREE.Vector3();

export class MeshManager {
  constructor(field, group) {
    this.field = field;
    this.group = group;
  }

  // Rebuild the mesh of one chunk slot now.
  rebuild(s) {
    const f = this.field;
    const c = f.chunks[s];
    f.dirty.delete(s);
    if (c === null) return;
    const ci = s % f.cx;
    const ck = Math.floor(s / f.cx) % f.cz;
    const cj = Math.floor(s / (f.cx * f.cz));
    const data = meshChunk(f, ci, cj, ck);
    if (data === null) {
      if (c.mesh) { this._dispose(c.mesh); c.mesh = null; }
      return;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.computeBoundingSphere();
    if (c.mesh) {
      c.mesh.geometry.dispose();
      c.mesh.geometry = g;
    } else {
      const mesh = new THREE.Mesh(g, VOXEL_MATERIAL);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      c.mesh = mesh;
      this.group.add(mesh);
    }
    c.mesh.position.set(ci * CHUNK_M, cj * CHUNK_M, ck * CHUNK_M);
    c.mesh.updateMatrix();
  }

  // Adopt a chunk that arrived with its mesh already built (see Field.takeChunk).
  adopt(s) {
    const f = this.field;
    const c = f.chunks[s];
    if (!c || !c.mesh) return;
    const ci = s % f.cx;
    const ck = Math.floor(s / f.cx) % f.cz;
    const cj = Math.floor(s / (f.cx * f.cz));
    this.group.add(c.mesh);
    c.mesh.position.set(ci * CHUNK_M, cj * CHUNK_M, ck * CHUNK_M);
    c.mesh.updateMatrix();
  }

  // Rebuild up to `budget` dirty chunks, nearest to `eye` first.
  update(eye, budget = 8) {
    const dirty = this.field.dirty;
    if (dirty.size === 0) return 0;
    let list = [...dirty];
    if (eye && list.length > budget) {
      const f = this.field;
      const gp = this.group.getWorldPosition(_v);
      const dist = (s) => {
        const ci = s % f.cx, ck = Math.floor(s / f.cx) % f.cz, cj = Math.floor(s / (f.cx * f.cz));
        const x = gp.x + (ci + 0.5) * CHUNK_M - eye.x;
        const y = gp.y + (cj + 0.5) * CHUNK_M - eye.y;
        const z = gp.z + (ck + 0.5) * CHUNK_M - eye.z;
        return x * x + y * y + z * z;
      };
      list.sort((a, b) => dist(a) - dist(b));
    }
    const n = Math.min(budget, list.length);
    for (let i = 0; i < n; i++) this.rebuild(list[i]);
    return n;
  }

  // Everything, now. For the first build behind the loading screen.
  rebuildAll() {
    for (const s of [...this.field.dirty]) this.rebuild(s);
  }

  _dispose(mesh) {
    mesh.geometry.dispose();
    mesh.removeFromParent();
  }

  dispose() {
    for (const c of this.field.chunks) {
      if (c && c.mesh) { this._dispose(c.mesh); c.mesh = null; }
    }
  }
}
