import { CHUNK, CHUNK_SHIFT, CHUNK_MASK } from './constants.js';
import { AIR } from './materials.js';

const CHUNK_VOL = CHUNK * CHUNK * CHUNK;

// A sparse block of voxels, stored as 32^3 chunks that exist only once
// something solid is written into them.
//
// The world is one of these, and so is every piece of building that falls off
// it: a falling body is a small Field of its own, moved about as one object.
// Keeping both the same class is what lets a chunk of the tower be handed from
// the world to a falling body without being copied or re-meshed.
export class Field {
  // Size in chunks.
  constructor(cx, cy, cz) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.nx = cx * CHUNK; this.ny = cy * CHUNK; this.nz = cz * CHUNK;
    this.chunks = new Array(cx * cy * cz).fill(null);
    // Chunk slots whose mesh no longer matches their voxels.
    this.dirty = new Set();
  }

  slot(ci, cj, ck) { return ci + this.cx * (ck + this.cz * cj); }

  inside(i, j, k) {
    return i >= 0 && j >= 0 && k >= 0 && i < this.nx && j < this.ny && k < this.nz;
  }

  get(i, j, k) {
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return AIR;
    const c = this.chunks[this.slot(i >> CHUNK_SHIFT, j >> CHUNK_SHIFT, k >> CHUNK_SHIFT)];
    if (c === null) return AIR;
    return c.mat[(i & CHUNK_MASK) | ((k & CHUNK_MASK) << CHUNK_SHIFT) | ((j & CHUNK_MASK) << (2 * CHUNK_SHIFT))];
  }

  getPaint(i, j, k) {
    if (!this.inside(i, j, k)) return 0;
    const c = this.chunks[this.slot(i >> CHUNK_SHIFT, j >> CHUNK_SHIFT, k >> CHUNK_SHIFT)];
    if (c === null || c.paint === null) return 0;
    return c.paint[(i & CHUNK_MASK) | ((k & CHUNK_MASK) << CHUNK_SHIFT) | ((j & CHUNK_MASK) << (2 * CHUNK_SHIFT))];
  }

  _chunk(i, j, k, create) {
    const s = this.slot(i >> CHUNK_SHIFT, j >> CHUNK_SHIFT, k >> CHUNK_SHIFT);
    let c = this.chunks[s];
    if (c === null && create) {
      c = { mat: new Uint8Array(CHUNK_VOL), paint: null, solid: 0, mesh: null, slot: s };
      this.chunks[s] = c;
    }
    return c;
  }

  // Write one voxel. Returns the material that was there.
  set(i, j, k, m) {
    if (!this.inside(i, j, k)) return AIR;
    const c = this._chunk(i, j, k, m !== AIR);
    if (c === null) return AIR;
    const li = i & CHUNK_MASK, lj = j & CHUNK_MASK, lk = k & CHUNK_MASK;
    const o = li | (lk << CHUNK_SHIFT) | (lj << (2 * CHUNK_SHIFT));
    const old = c.mat[o];
    if (old === m) return old;
    c.mat[o] = m;
    if (old === AIR) c.solid++;
    else if (m === AIR) {
      c.solid--;
      if (c.paint !== null) c.paint[o] = 0;
    }
    this._touch(c.slot, i, j, k, li, lj, lk);
    return old;
  }

  setPaint(i, j, k, p) {
    const c = this._chunk(i, j, k, false);
    if (c === null) return;
    const li = i & CHUNK_MASK, lj = j & CHUNK_MASK, lk = k & CHUNK_MASK;
    const o = li | (lk << CHUNK_SHIFT) | (lj << (2 * CHUNK_SHIFT));
    if (c.mat[o] === AIR) return;
    if (c.paint === null) c.paint = new Uint8Array(CHUNK_VOL);
    if (c.paint[o] === p) return;
    c.paint[o] = p;
    this.dirty.add(c.slot);
  }

  // Mark a chunk dirty, and its neighbour too when the voxel sits on a seam —
  // the neighbour's faces and ambient occlusion depend on this voxel.
  _touch(s, i, j, k, li, lj, lk) {
    this.dirty.add(s);
    if (li === 0 && i > 0) this._dirtyAt(i - 1, j, k);
    if (li === CHUNK_MASK && i < this.nx - 1) this._dirtyAt(i + 1, j, k);
    if (lj === 0 && j > 0) this._dirtyAt(i, j - 1, k);
    if (lj === CHUNK_MASK && j < this.ny - 1) this._dirtyAt(i, j + 1, k);
    if (lk === 0 && k > 0) this._dirtyAt(i, j, k - 1);
    if (lk === CHUNK_MASK && k < this.nz - 1) this._dirtyAt(i, j, k + 1);
  }

  _dirtyAt(i, j, k) {
    const s = this.slot(i >> CHUNK_SHIFT, j >> CHUNK_SHIFT, k >> CHUNK_SHIFT);
    if (this.chunks[s] !== null) this.dirty.add(s);
  }

  // Fill an inclusive box of voxel indices, clipped to the field.
  fill(i0, j0, k0, i1, j1, k1, m) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); k0 = Math.max(0, k0);
    i1 = Math.min(this.nx - 1, i1); j1 = Math.min(this.ny - 1, j1); k1 = Math.min(this.nz - 1, k1);
    for (let j = j0; j <= j1; j++)
      for (let k = k0; k <= k1; k++)
        for (let i = i0; i <= i1; i++) this.set(i, j, k, m);
  }

  // Hand a whole chunk to another field, voxels and mesh together. Used when a
  // falling piece of building takes every voxel a chunk holds, which is most of
  // them: the mesh moves with it and nothing has to be rebuilt.
  takeChunk(s) {
    const c = this.chunks[s];
    this.chunks[s] = null;
    this.dirty.delete(s);
    return c;
  }

  putChunk(s, c) {
    c.slot = s;
    this.chunks[s] = c;
  }

  clear() {
    this.chunks.fill(null);
    this.dirty.clear();
  }
}
