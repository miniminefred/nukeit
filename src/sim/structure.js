import * as THREE from 'three';
import { unsupported } from '../building/support.js';
import { crack } from '../damage/cracks.js';

// The rhythm of a chain reaction. Nothing that gives way under a load does it
// silently or all at once: it cracks, grit trickles out of it, it groans — and
// then it goes. That half second is what lets you watch a collapse travel.
const WARN = 0.8;            // s from the first crack to a column giving way
const SAG = [0.35, 0.9];     // s a slab with nothing under it hangs before it drops

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

// Weight. A column carries every storey above it, so the lower it stands the
// less of it has to go before it gives way. When one goes, its load moves onto
// its neighbours, and a neighbour that was coping may not cope any more — which
// is how taking out three or four columns low down can bring a whole floor
// down on its own, and a floor coming down brings the rest with it.
const SPREAD = 7.5;          // metres: how far a lost column's load moves
const CHAIN_COLUMN = 3;      // lost neighbours that break an undamaged column...
const CHAIN_CORE = 6;        // ...or an undamaged length of core wall
const CHAIN_LOAD = 8;        // ...if it is carrying at least this many storeys

const PANCAKE = 80;          // pieces: more than this falls together, cheaply
const G = 9.81 * 0.72;       // progressive collapse runs at about 0.7 g
const _c = new THREE.Vector3();

export class Structure {
  constructor(pieces, fx) {
    this.pieces = pieces;
    this.fx = fx;            // { particles, chips, heap, audio, shake, player }
    this.dirty = false;
    this._wait = 0;
    this.falls = [];
    this.onCrushPlayer = null;
    this.lost = [];          // where supports have given way: { floor, x, z }
    this.checks = [];        // neighbours to re-examine: { p, t }
    this.warnings = [];      // supports about to go: { p, t }
    this.sagging = [];       // slabs about to drop: { p, t }
    pieces.onChange = () => { this.dirty = true; };
  }

  _lostNear(p) {
    const c = p.box.getCenter(_c);
    let n = 0;
    for (const l of this.lost) if (l.floor === p.floor && Math.hypot(l.x - c.x, l.z - c.z) < SPREAD) n++;
    return n;
  }

  // Has a damaged support taken more than it can carry?
  mustFail(p) {
    if (!p.load || p.hpMax === null) return false;
    const share = p.load * (1 + this._lostNear(p) * 0.5);
    return p.hp <= p.hpMax * share / (share + 14);
  }

  // A support has given way: the ones round it now carry its share.
  failed(p) {
    const c = p.box.getCenter(new THREE.Vector3());
    this.lost.push({ floor: p.floor, x: c.x, z: c.z });
    for (const q of this.pieces.list) {
      if (q.state !== 'static' || q.floor !== p.floor || (q.role !== 'column' && q.role !== 'core')) continue;
      const d = q.box.getCenter(_c).distanceTo(c);
      if (d < SPREAD + 1.5) this.checks.push({ p: q, t: 0.4 + Math.random() * 1.4 + d * 0.08 });
    }
  }

  _check(dt) {
    if (!this.checks.length) return;
    const due = [];
    this.checks = this.checks.filter((e) => ((e.t -= dt) > 0 ? true : (due.push(e), false)));
    for (const { p } of due) {
      if (p.state !== 'static') continue;
      const lost = this._lostNear(p);
      const chain = p.load >= CHAIN_LOAD && lost >= (p.role === 'core' ? CHAIN_CORE : CHAIN_COLUMN);
      if (!chain && !this.mustFail(p)) continue;
      if (p.warned) continue;
      p.warned = true;
      // First the warning: cracks up its faces, a groan, grit from the top.
      const c = p.box.getCenter(new THREE.Vector3());
      for (let n = 0; n < 2; n++) {
        const side = new THREE.Vector3(...[[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][(Math.random() * 4) | 0]);
        const at = p.box.clampPoint(c.clone().addScaledVector(side, 2).setY(c.y + (Math.random() - 0.5) * 2), new THREE.Vector3());
        crack(this.pieces, p, at, side, 1.2 + Math.random());
      }
      this.fx.audio?.creak?.(c.x, c.y, c.z);
      this.warnings.push({ p, t: WARN + Math.random() * 0.4 });
    }
  }

  // Supports that have been warned about go; slabs that have been sagging drop.
  _stage(dt) {
    const P = this.pieces;
    for (const w of this.warnings) {
      w.t -= dt;
      const p = w.p;
      if (p.state !== 'static') { w.t = -1; continue; }
      const c = p.box.getCenter(_c);
      if (Math.random() < 0.5) this.fx.particles.spawn('dust', c.x + (Math.random() - 0.5) * 0.6, p.box.max.y - 0.1, c.z + (Math.random() - 0.5) * 0.6, 0, -1.5, 0, 0x9a948a);
      if (w.t <= 0) this.fx.damage.failSoon(p, c.clone(), new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize());
    }
    this.warnings = this.warnings.filter((w) => w.t > 0);
    for (const s of this.sagging) {
      s.t -= dt;
      const p = s.p;
      if (p.state !== 'static') { s.t = -1; continue; }
      // Dust sifting out of the joints along its edge.
      if (Math.random() < 0.6) {
        const b = p.box;
        this.fx.particles.spawn('dust', b.min.x + Math.random() * (b.max.x - b.min.x), b.min.y - 0.05, b.min.z + Math.random() * (b.max.z - b.min.z), 0, -1.2, 0, 0x9a948a);
      }
      if (s.t <= 0) { p.sagging = false; P.makeDynamic(p, undefined, undefined, { quiet: true }); this.dirty = true; }
    }
    this.sagging = this.sagging.filter((s) => s.t > 0);
  }

  mark() { this.dirty = true; }

  update(dt) {
    this._wait -= dt;
    this._check(dt);
    this._stage(dt);
    if (this.dirty && this._wait <= 0 && this.falls.length === 0) {
      this.dirty = false;
      this._wait = 0.1;
      const loose = unsupported(this.pieces.list);
      if (loose.length > PANCAKE) this._pancake(loose);
      else for (const p of loose) {
        // A slab hangs a moment, groaning and shedding dust, before it goes;
        // everything else just falls.
        if (p.role === 'slab') {
          if (p.sagging) continue;
          p.sagging = true;
          const c = p.box.getCenter(new THREE.Vector3());
          this.fx.audio?.creak?.(c.x, c.y, c.z);
          this.sagging.push({ p, t: SAG[0] + Math.random() * (SAG[1] - SAG[0]) });
        } else this.pieces.makeDynamic(p, undefined, undefined, { quiet: true });
      }
      if (loose.length) { this.fx.chips.unsettle(); this._wakeRubble(loose); }
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

  // Frozen rubble lying on something that has just started to fall falls with it.
  _wakeRubble(loose) {
    const zone = new THREE.Box3();
    for (const p of loose) zone.union(p.box);
    zone.expandByScalar(0.3);
    for (const r of this.pieces.list) {
      if (r.state === 'rubble' && r.box.intersectsBox(zone)) this.pieces.makeDynamic(r, undefined, undefined, { quiet: true, debris: true });
    }
  }

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
    // Big broken slabs thrown clear of the crush line: the part of a pancake
    // you can actually see.
    if ((p.role === 'slab' || p.role === 'column') && Math.random() < 0.22 && this.pieces.physics.dynamic.size < 260) {
      const c = b.getCenter(new THREE.Vector3());
      const out = c.clone().sub(f.foot.getCenter(new THREE.Vector3())).setY(0).normalize();
      this.fx.throwChunk?.(p, c, out.multiplyScalar(4 + Math.random() * 6).setY(2 + Math.random() * 3));
    }
    this.pieces.destroy(p);
  }

  clear() {
    this.falls.length = 0;
    this.warnings.length = 0;
    this.sagging.length = 0;
    this.lost.length = 0;
    this.checks.length = 0;
    this.dirty = false;
  }
}
