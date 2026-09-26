import * as THREE from 'three';
import { Field } from '../voxel/field.js';
import { MeshManager } from '../voxel/mesh-manager.js';
import {
  CHUNK, CHUNK_SHIFT, CHUNK_MASK, VOXEL, NX, NZ, LAYER,
  MIN_X, MIN_Y, MIN_Z, wx, wy, wz,
} from '../voxel/constants.js';
import { AIR, M } from '../voxel/materials.js';

// Buildings coming down.
//
// When the support search finds a piece of structure with nothing under it,
// that piece becomes a **falling body**: a Field of its own, lifted out of the
// world and dropped. It only ever moves straight down, because that is how a
// tower collapses once its lower storeys go — floor onto floor, not toppling
// like a tree.
//
// What it lands on decides what happens next:
//
//  * **A heavy body crushes.** Each layer that meets something solid is
//    destroyed on both sides — the falling floor and the floor it hit — turned
//    into dust and counted towards the rubble heap. So a tower dropped from its
//    fifth storey grinds through the four below it and ends as a heap on the
//    ground, which is what a pancake collapse is.
//  * **A light body lands.** A section of wall is not going to punch through a
//    concrete slab. It stops on whatever it meets and becomes part of the world
//    again where it came to rest.
//
// Handing voxels over is cheap for the part that matters: a chunk whose every
// voxel is falling is moved to the body whole — voxel array, mesh and all — so
// the 400,000-voxel shaft of a tower does not have to be copied or re-meshed at
// the moment it breaks. Only the chunks along the break are split voxel by voxel.

const HEAVY = 25_000;          // voxels: heavier than this crushes what it hits
const G = 13;                  // a collapsing building falls at about 2/3 g
const MAX_V = 38;

export class Collapse {
  constructor(scene, world, fx) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;                // { particles, audio, shake, onCrush(i, j, k, m) }
    this.bodies = [];
    this.heap = new Float32Array(NX * NZ);   // rubble owed to each ground column
    this.heapDirty = false;
  }

  // `list` is flat world indices, all solid, all falling together.
  drop(list) {
    const wf = this.world.field;
    // Bounds, in chunks.
    let ci0 = 1e9, cj0 = 1e9, ck0 = 1e9, ci1 = -1, cj1 = -1, ck1 = -1;
    const perChunk = new Map();
    for (const p of list) {
      const j = (p / LAYER) | 0, r = p - j * LAYER, k = (r / NX) | 0, i = r - k * NX;
      const ci = i >> CHUNK_SHIFT, cj = j >> CHUNK_SHIFT, ck = k >> CHUNK_SHIFT;
      if (ci < ci0) ci0 = ci; if (ci > ci1) ci1 = ci;
      if (cj < cj0) cj0 = cj; if (cj > cj1) cj1 = cj;
      if (ck < ck0) ck0 = ck; if (ck > ck1) ck1 = ck;
      const s = wf.slot(ci, cj, ck);
      perChunk.set(s, (perChunk.get(s) ?? 0) + 1);
    }
    const field = new Field(ci1 - ci0 + 1, cj1 - cj0 + 1, ck1 - ck0 + 1);
    const group = new THREE.Group();
    const origin = new THREE.Vector3(wx(ci0 * CHUNK), wy(cj0 * CHUNK), wz(ck0 * CHUNK));
    group.position.copy(origin);
    this.scene.add(group);
    const meshes = new MeshManager(field, group);
    const body = {
      field, meshes, group, origin,
      oi: ci0 * CHUNK, oj: cj0 * CHUNK, ok: ck0 * CHUNK,
      y: 0, v: 0, shift: 0,
      mass: list.length, heavy: list.length > HEAVY,
      bottoms: [], alive: true,
    };

    // Whole chunks first.
    const whole = new Set();
    for (const [s, n] of perChunk) {
      const c = wf.chunks[s];
      if (c && c.solid === n) whole.add(s);
    }
    for (const s of whole) {
      const ci = s % wf.cx, ck = Math.floor(s / wf.cx) % wf.cz, cj = Math.floor(s / (wf.cx * wf.cz));
      const c = wf.takeChunk(s);
      const ls = field.slot(ci - ci0, cj - cj0, ck - ck0);
      field.putChunk(ls, c);
      meshes.adopt(ls);
      // The world chunks next door lose a neighbour and must redraw the face
      // they were hiding behind.
      for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const ni = ci + di, nj = cj + dj, nk = ck + dk;
        if (ni < 0 || nj < 0 || nk < 0 || ni >= wf.cx || nj >= wf.cy || nk >= wf.cz) continue;
        const ns = wf.slot(ni, nj, nk);
        if (wf.chunks[ns]) wf.dirty.add(ns);
        // And the body's own chunk faces toward a split chunk need rebuilding.
        if (!whole.has(ns) && perChunk.has(ns)) field.dirty.add(ls);
      }
    }
    // Then the split ones, voxel by voxel.
    for (const p of list) {
      const j = (p / LAYER) | 0, r = p - j * LAYER, k = (r / NX) | 0, i = r - k * NX;
      const s = wf.slot(i >> CHUNK_SHIFT, j >> CHUNK_SHIFT, k >> CHUNK_SHIFT);
      if (whole.has(s)) continue;
      const m = wf.get(i, j, k);
      const paint = wf.getPaint(i, j, k);
      wf.set(i, j, k, AIR);
      field.set(i - body.oi, j - body.oj, k - body.ok, m);
      if (paint) field.setPaint(i - body.oi, j - body.oj, k - body.ok, paint);
    }

    // Bottom faces: every voxel with nothing of the body under it.
    for (let s = 0; s < field.chunks.length; s++) {
      const c = field.chunks[s];
      if (!c) continue;
      const ci = s % field.cx, ck = Math.floor(s / field.cx) % field.cz, cj = Math.floor(s / (field.cx * field.cz));
      const bi = ci * CHUNK, bj = cj * CHUNK, bk = ck * CHUNK;
      for (let o = 0; o < c.mat.length; o++) {
        if (c.mat[o] === AIR) continue;
        const i = bi + (o & CHUNK_MASK), k = bk + ((o >> CHUNK_SHIFT) & CHUNK_MASK), j = bj + (o >> (2 * CHUNK_SHIFT));
        if (field.get(i, j - 1, k) === AIR) body.bottoms.push(i, j, k);
      }
    }
    this.bodies.push(body);
    this.fx.audio?.rumble(Math.min(1, body.mass / 200_000));
    return body;
  }

  update(dt, eye) {
    for (const b of this.bodies) {
      if (!b.alive) continue;
      b.v = Math.min(MAX_V, b.v + G * dt);
      b.y -= b.v * dt;
      const want = Math.floor(-b.y / VOXEL);
      while (b.alive && b.shift < want) this._step(b);
      b.group.position.set(b.origin.x, b.origin.y + b.y, b.origin.z);
      b.meshes.update(eye, 6);
    }
    const before = this.bodies.length;
    this.bodies = this.bodies.filter((b) => b.alive);
    if (this.bodies.length < before && this.heapDirty) this._settleHeap();
  }

  // Move one layer down. Returns after resolving every contact at the new level.
  _step(b) {
    b.shift++;
    const wf = this.world.field, f = b.field, B = b.bottoms;
    const next = [];
    let crushed = 0, contacts = 0;
    const dj = b.oj - b.shift;
    const p = this.fx.particles;
    for (let n = 0; n < B.length; n += 3) {
      const i = B[n], j = B[n + 1], k = B[n + 2];
      const m = f.get(i, j, k);
      if (m === AIR) continue;                   // taken already
      const I = i + b.oi, J = j + dj, K = k + b.ok;
      const ground = J < 0;
      const hit = ground || wf.get(I, J, K) !== AIR;
      if (!hit) { next.push(i, j, k); continue; }
      contacts++;
      if (!b.heavy) continue;
      // Crush: this voxel, and whatever it landed on.
      f.set(i, j, k, AIR);
      crushed++;
      if (!ground) {
        const wm = wf.get(I, J, K);
        wf.set(I, J, K, AIR);
        this.fx.onCrush?.(I, J, K, wm);
        crushed++;
      }
      this.heap[I + NX * K] += 1;
      if (Math.random() < 0.004) {
        const x = MIN_X + (I + 0.5) * VOXEL, y = MIN_Y + Math.max(0, J) * VOXEL, z = MIN_Z + (K + 0.5) * VOXEL;
        p.spawn('dust', x, y + 0.5, z, (Math.random() - 0.5) * 9, Math.random() * 3, (Math.random() - 0.5) * 9);
      }
      if (f.get(i, j + 1, k) !== AIR) next.push(i, j + 1, k);
    }
    b.bottoms = next;

    if (!b.heavy && contacts > 0) {
      // Landed. Back into the world, one layer up from where it touched.
      b.shift--;
      this._restamp(b);
      return;
    }
    if (crushed > 0) {
      this.heapDirty = true;
      b.mass -= crushed;
      b.v *= Math.max(0.6, 1 - crushed / Math.max(1, b.mass) * 6);
      this.fx.shake?.(Math.min(1, crushed / 3000));
      this.fx.audio?.rumble(Math.min(1, crushed / 2500));
    }
    if (b.bottoms.length === 0) this._retire(b);
  }

  _restamp(b) {
    const wf = this.world.field, f = b.field;
    const dj = b.oj - b.shift;
    for (let s = 0; s < f.chunks.length; s++) {
      const c = f.chunks[s];
      if (!c) continue;
      const ci = s % f.cx, ck = Math.floor(s / f.cx) % f.cz, cj = Math.floor(s / (f.cx * f.cz));
      for (let o = 0; o < c.mat.length; o++) {
        const m = c.mat[o];
        if (m === AIR) continue;
        const i = ci * CHUNK + (o & CHUNK_MASK), k = ck * CHUNK + ((o >> CHUNK_SHIFT) & CHUNK_MASK), j = cj * CHUNK + (o >> (2 * CHUNK_SHIFT));
        const I = i + b.oi, J = j + dj, K = k + b.ok;
        if (J >= 0 && wf.get(I, J, K) === AIR) {
          wf.set(I, J, K, m);
          if (c.paint && c.paint[o]) wf.setPaint(I, J, K, c.paint[o]);
        }
      }
    }
    this.fx.audio?.impact(b.origin.x, b.origin.y + b.y, b.origin.z, Math.min(1, b.mass / 5000));
    this._retire(b);
  }

  _retire(b) {
    b.alive = false;
    b.meshes.dispose();
    b.group.removeFromParent();
  }

  // What was ground to nothing becomes a heap: a fraction of the crushed volume,
  // spread and slumped, stamped as rubble on top of whatever is standing.
  _settleHeap() {
    this.heapDirty = false;
    const H = this.heap, w = NX, d = NZ;
    // Buildings are mostly air; a quarter of the solid volume survives as rubble.
    const h = new Float32Array(w * d);
    for (let n = 0; n < H.length; n++) h[n] = H[n] * 0.22;
    H.fill(0);
    // Slump: three passes of spreading anything steeper than about 40 degrees.
    for (let pass = 0; pass < 40; pass++) {
      for (let k = 1; k < d - 1; k++)
        for (let i = 1; i < w - 1; i++) {
          const n = i + w * k;
          for (const o of [1, -1, w, -w]) {
            const diff = h[n] - h[n + o];
            if (diff > 1.2) { const t = (diff - 1.2) * 0.25; h[n] -= t; h[n + o] += t; }
          }
        }
    }
    const wf = this.world.field;
    const cap = Math.round(7 / VOXEL);
    for (let k = 0; k < d; k++)
      for (let i = 0; i < w; i++) {
        let n = Math.min(cap, Math.round(h[i + w * k]));
        if (n <= 0) continue;
        let j = 0;
        while (wf.get(i, j, k) !== AIR && j < wf.ny - 1) j++;
        for (; n > 0 && j < wf.ny; n--, j++) {
          if (wf.get(i, j, k) === AIR) wf.set(i, j, k, M.RUBBLE);
        }
      }
  }

  // Is there falling building at this world point?
  solidAt(x, y, z) {
    for (const b of this.bodies) {
      const i = Math.floor((x - b.origin.x) / VOXEL);
      const j = Math.floor((y - b.origin.y - b.y) / VOXEL);
      const k = Math.floor((z - b.origin.z) / VOXEL);
      if (b.field.get(i, j, k) !== AIR) return true;
    }
    return false;
  }

  get active() { return this.bodies.length > 0; }

  clear() {
    for (const b of this.bodies) this._retire(b);
    this.bodies.length = 0;
    this.heap.fill(0);
    this.heapDirty = false;
  }
}
