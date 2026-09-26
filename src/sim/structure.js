import * as THREE from 'three';
import { unsupported } from '../building/support.js';

// Keeping track of what is still standing, and bringing down what is not.
//
// Whenever anything load-bearing changes, the support pass runs (at most ten
// times a second). What it finds with nothing under it falls one of two ways:
//
//  * **A few pieces** — a slab bay whose columns went, a partition, a desk on a
//    floor that burnt through — become rigid bodies and fall for real.
//  * **A building's worth** — everything above a storey whose columns and core
//    are gone — comes down as a *pancake*. The whole mass drops together, and
//    wherever its lowest floor meets the one below, both are ground up: turned
//    into rubble on the heap, dust in the air and a few big fragments thrown
//    clear. Then it drops onto the next floor. A hundred metres of tower cannot
//    be thousands of rigid bodies stacking on each other, and this is also
//    simply how a tower comes down.

const PANCAKE = 150;         // pieces: more than this falls together
const G = 9.81 * 0.72;       // progressive collapse runs at about 0.7 g

export class Structure {
  constructor(pieces, fx) {
    this.pieces = pieces;
    this.fx = fx;            // { particles, chips, heap, audio, shake, player }
    this.dirty = false;
    this._wait = 0;
    this.falls = [];
    this.onCrushPlayer = null;
    pieces.onChange = () => { this.dirty = true; };
  }

  mark() { this.dirty = true; }

  update(dt) {
    this._wait -= dt;
    if (this.dirty && this._wait <= 0 && this.falls.length === 0) {
      this.dirty = false;
      this._wait = 0.1;
      const loose = unsupported(this.pieces.list);
      if (loose.length > PANCAKE) this._pancake(loose);
      else for (const p of loose) this.pieces.makeDynamic(p, undefined, undefined, { quiet: true });
      if (loose.length) this.fx.chips.unsettle();
      if (loose.length && loose.length <= PANCAKE) this.dirty = true;   // what they carried may go next
    }
    for (const f of this.falls) this._fall(f, dt);
    const before = this.falls.length;
    this.falls = this.falls.filter((f) => f.alive);
    if (before && this.falls.length === 0) {
      this.fx.heap.settle();
      this.dirty = true;
    }
  }

  get collapsing() { return this.falls.length > 0; }

  _pancake(list) {
    const P = this.pieces;
    const foot = new THREE.Box3();
    for (const p of list) {
      p.state = 'falling';
      P._removeFixedColliders(p);
      foot.union(p.box);
    }
    list.sort((a, b) => a.box.min.y - b.box.min.y);
    // What it will land on: whatever is still standing under its footprint.
    const inner = foot.clone().expandByVector(new THREE.Vector3(-0.3, 0, -0.3));
    const stump = P.list.filter((p) => p.state === 'static' && p.box.max.y <= list[0].box.min.y + 0.15 &&
      p.box.max.x > inner.min.x && p.box.min.x < inner.max.x && p.box.max.z > inner.min.z && p.box.min.z < inner.max.z);
    stump.sort((a, b) => b.box.max.y - a.box.max.y);
    this.falls.push({ list, stump, foot, offset: 0, v: 0, low: 0, s: 0, alive: true, t: 0 });
    this.fx.audio?.rumble(1);
  }

  _fall(f, dt) {
    const P = this.pieces, fx = this.fx;
    f.t += dt;
    f.v = Math.min(30, f.v + G * dt);
    f.offset -= f.v * dt;
    // Skip what has already been crushed.
    while (f.low < f.list.length && f.list[f.low].state === 'dead') f.low++;
    while (f.s < f.stump.length && f.stump[f.s].state === 'dead') f.s++;
    if (f.low >= f.list.length) { f.alive = false; return; }

    let crushed = 0;
    for (let guard = 0; guard < 6; guard++) {
      const bottom = f.list[f.low].box.min.y + f.offset;
      const top = f.s < f.stump.length ? f.stump[f.s].box.max.y : 0;
      if (bottom > top + 0.02) break;
      // Grind the layer where they meet: the falling floor and the floor it hit.
      const reach = 0.45;
      for (let n = f.low; n < f.list.length; n++) {
        const p = f.list[n];
        if (p.state === 'dead') continue;
        if (p.box.min.y + f.offset > top + reach) break;
        this._crush(p, f.offset, f);
        crushed++;
      }
      for (let n = f.s; n < f.stump.length; n++) {
        const p = f.stump[n];
        if (p.state === 'dead') continue;
        if (p.box.max.y < bottom - reach) break;
        this._crush(p, 0, f);
        crushed++;
      }
      while (f.low < f.list.length && f.list[f.low].state === 'dead') f.low++;
      while (f.s < f.stump.length && f.stump[f.s].state === 'dead') f.s++;
      if (f.low >= f.list.length) break;
    }
    if (crushed) {
      f.v *= Math.max(0.8, 1 - crushed / 600);
      fx.shake?.add(Math.min(0.5, crushed / 200));
      fx.audio?.rumble(Math.min(1, 0.4 + crushed / 150));
      // The dust front at the crush line.
      const y = f.s < f.stump.length ? f.stump[f.s].box.max.y : 0.5;
      for (let i = 0; i < 18; i++) {
        const side = Math.random() * 4 | 0;
        const x = side < 2 ? f.foot.min.x + Math.random() * (f.foot.max.x - f.foot.min.x) : side === 2 ? f.foot.min.x : f.foot.max.x;
        const z = side >= 2 ? f.foot.min.z + Math.random() * (f.foot.max.z - f.foot.min.z) : side === 0 ? f.foot.min.z : f.foot.max.z;
        const ox = x - (f.foot.min.x + f.foot.max.x) / 2, oz = z - (f.foot.min.z + f.foot.max.z) / 2;
        const l = Math.hypot(ox, oz) || 1;
        fx.particles.spawn('bigdust', x, y + Math.random() * 3, z, ox / l * (6 + Math.random() * 10), Math.random() * 2, oz / l * (6 + Math.random() * 10));
      }
    }
    // Move what is still falling.
    for (let n = f.low; n < f.list.length; n++) {
      const p = f.list[n];
      if (p.state === 'dead') continue;
      P.moveFalling(p, f.offset);
    }
    // Anyone underneath it.
    const pl = fx.player;
    if (pl && !pl.dead) {
      const b = f.foot;
      const x = pl.pos.x, z = pl.pos.z;
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z) {
        const bottom = f.list[f.low].box.min.y + f.offset;
        if (bottom < pl.pos.y + 1.8 && bottom > pl.pos.y - 3) this.onCrushPlayer?.();
      }
    }
  }

  // A piece ground up in the collapse: most of it goes to the heap, some to
  // dust, and now and then a big fragment is thrown clear.
  _crush(p, offset, f) {
    const b = p.box.clone();
    b.min.y += offset; b.max.y += offset;
    const vol = p.volume * (p.kind.density > 1500 ? 0.35 : 0.08);
    if (p.role === 'slab' || p.role === 'column' || p.role === 'core' || p.role === 'stair') this.fx.heap.add(b, vol);
    if (p.kind.name === 'glass' && Math.random() < 0.08) this.fx.chips.burst('glass', b.getCenter(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), 4, 4, 0.03);
    if ((p.role === 'slab' || p.role === 'column') && Math.random() < 0.08 && this.pieces.physics.dynamic.size < 350) {
      const c = b.getCenter(new THREE.Vector3());
      const out = c.clone().sub(f.foot.getCenter(new THREE.Vector3())).setY(0).normalize();
      this.fx.throwChunk?.(p, c, out.multiplyScalar(4 + Math.random() * 6).setY(2 + Math.random() * 3));
    }
    this.pieces.destroy(p);
  }

  clear() {
    this.falls.length = 0;
    this.dirty = false;
  }
}
