import * as THREE from 'three';
import { unsupported } from '../building/support.js';
import { crack } from '../damage/cracks.js';
import { G_LAND } from '../physics.js';

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
//    wherever its lowest floor meets the one below, both break up: their real
//    slabs, columns and furniture spill out and down and land as rubble
//    (sim/rubble.js), and dust rolls out of the crush line. Then it drops onto
//    the next floor. A hundred metres of tower cannot
//    be thousands of rigid bodies stacking on each other, and this is also
//    simply how a tower comes down.

// Weight. A column carries every storey above it, so the lower it stands the
// less of it has to go before it gives way. When one goes, its load moves onto
// its neighbours, and a neighbour that was coping may not cope any more — which
// is how taking out three or four columns low down can bring a whole floor
// down on its own, and a floor coming down brings the rest with it.
const SPREAD = 7.5;          // metres: how far a lost column's load moves
// An undamaged support gives way when the load it has picked up from lost
// neighbours is more than it was built to take. Each adjacent support lost
// puts about half its share on each of those beside it, and a column is built
// for about twice its share: so it takes three lost beside it — at any
// height — and a length of core wall five. That is redundancy: a frame loses a
// column and stands. (Counting every loss within seven and a half metres, and
// fewer the more storeys above, one gas bottle in the plant room took the
// whole lower level and the tower with it.)
const ADJACENT = 6.2;        // m: a support beside this one — a bay away, not two
// Built for twice its share, each lost neighbour adding half a share: past two
// is three lost beside a column; a core wall, stiffer and tied in, five.
const chainAt = (role) => (role === 'core' ? 5 : 3);

const PANCAKE = 24;          // slabs and supports: more than this falls together, cheaply
// Counted in structure only. Counted in pieces, a single bay of a fitted shop
// floor — its walls, shelves, stock and tables — passed the mark, and one
// failed bay dropped as a pancake through every floor under it.
const heavy = (list) => { let n = 0; for (const p of list) if (p.structural || p.role === 'slab') n++; return n; };
const G = 9.81 * 0.72;       // progressive collapse runs at about 0.7 g
const _c = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

export class Structure {
  constructor(pieces, fx) {
    this.pieces = pieces;
    this.fx = fx;            // { particles, chips, rubble, audio, shake, player }
    this.dirty = false;
    this._wait = 0;
    this.falls = [];
    this.onCrushPlayer = null;
    this.lost = [];          // where supports have given way: { floor, x, z }
    this.checks = [];        // neighbours to re-examine: { p, t }
    this.warnings = [];      // supports about to go: { p, t }
    this.sagging = [];       // slabs about to drop: { p, t }
    // Which buildings have changed since the last support pass: only those are
    // looked at again. A city with a dozen buildings woken would otherwise pay
    // for all of them every tenth of a second.
    this.which = new Set();
    this.all = false;
    pieces.onChange = (p) => this.mark(p?.building);
  }

  _lostNear(p, within = SPREAD) {
    const c = p.box.getCenter(_c);
    let n = 0;
    for (const l of this.lost) if (l.floor === p.floor && l.building === p.building && Math.hypot(l.x - c.x, l.z - c.z) < within) n++;
    return n;
  }

  // How many storeys a support carries now: not what stood over it when the
  // building went up, but what still stands over it — a ray down its line
  // from the sky to the top of its own building there. A podium column
  // carries the tower until the tower has gone, and then only the podium.
  loadOf(p) {
    if (!p.load) return 0;
    const now = this.time ?? 0;
    if (p._loadAt !== undefined && now - p._loadAt < 1) return p._load;
    const c = p.box.getCenter(_c), physics = this.pieces.physics;
    const ray = (this._ray ??= new physics.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }));
    ray.origin.x = c.x; ray.origin.y = 300; ray.origin.z = c.z;
    const mine = (k) => { const o = physics.owner.get(k.handle); return !!o && o.building === p.building && o.state === 'static' && (o.structural || o.role === 'slab'); };
    const hit = physics.world.castRay(ray, 300, true, undefined, G_LAND, undefined, undefined, mine);
    const top = hit ? 300 - hit.timeOfImpact : p.box.max.y;
    const storey = Math.max(3, p.box.max.y - p.box.min.y + 0.3);
    p._load = Math.min(p.load, Math.max(0, Math.round((top - p.box.max.y) / storey)));
    p._loadAt = now;
    return p._load;
  }

  // Has a damaged support taken more than it can carry?
  mustFail(p) {
    const load = this.loadOf(p);
    if (!load || p.hpMax === null) return false;
    const share = load * (1 + this._lostNear(p) * 0.5);
    return p.hp <= p.hpMax * share / (share + 14);
  }

  // A support has given way: the ones round it now carry its share.
  failed(p) {
    const c = p.box.getCenter(new THREE.Vector3());
    this.lost.push({ floor: p.floor, building: p.building, x: c.x, z: c.z });
    // Is the weight above still over what is left? If not, it tips.
    if (this.fx.topple?.check(p.floor, p.building)) return;
    for (const q of this.pieces.inBuilding(p.building)) {
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
      const lost = this._lostNear(p, ADJACENT);
      const load = this.loadOf(p);
      // (A support that falling debris cannot break — the bank's old hall — does
      // not give way in a chain either: only to what you do to it.)
      const chain = load > 0 && lost >= chainAt(p.role) && p.tough !== Infinity;
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
      // The crack it will go along: up a face at a slant, from about a third of
      // the way up, drawn a step at a time while it holds.
      const face = new THREE.Vector3(...[[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][(Math.random() * 4) | 0]);
      const path = { face, at: p.box.clampPoint(c.clone().addScaledVector(face, 2).setY(p.box.min.y + (p.box.max.y - p.box.min.y) * (0.25 + Math.random() * 0.2)), new THREE.Vector3()),
        step: new THREE.Vector3(face.z, 0, -face.x).multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 0.18).setY(0.32), n: 0 };
      this.warnings.push({ p, t: WARN + Math.random() * 0.4, path, next: 0.12 });
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
      // The crack runs on up the face, with a crack you can hear, and grit
      // spits out of it.
      if (w.path && (w.next -= dt) <= 0 && w.path.n < 5) {
        w.next = 0.12 + Math.random() * 0.1;
        const k = w.path;
        k.at.add(k.step);
        k.at.copy(p.box.clampPoint(k.at, new THREE.Vector3()));
        crack(this.pieces, p, k.at.clone(), k.face, 0.9 + k.n * 0.25);
        this.fx.chips?.burst('concrete', k.at.clone().addScaledVector(k.face, 0.05), k.face, 4, 2, 0.025);
        if (Math.random() < 0.6) this.fx.audio?.snap?.(k.at.x, k.at.y, k.at.z, 0.4 + k.n * 0.1);
        k.n++;
      }
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
      // It hangs on its bars along the edge still tied to the floor beside it,
      // tilting down from there, a few degrees, before they let go.
      if (s.hinge) {
        s.a = Math.min(s.max, (s.a ?? 0) + dt * s.max / s.total * 1.6);
        _q2.setFromAxisAngle(s.hinge.axis, s.a);
        P.turn(p, _q3.copy(_q2).multiply(s.q0));
        P.move(p, _v2.copy(s.pos0).sub(s.hinge.at).applyQuaternion(_q2).add(s.hinge.at));
        if (Math.random() < 0.15) this.fx.audio?.snap?.(s.hinge.at.x, s.hinge.at.y, s.hinge.at.z, 0.35);
      }
      if (s.t <= 0) {
        p.sagging = false;
        // Swinging down off the bars as it goes.
        const spin = s.hinge ? s.hinge.axis.clone().multiplyScalar(1.2) : undefined;
        P.makeDynamic(p, undefined, spin && { x: spin.x, y: spin.y, z: spin.z }, { quiet: true });
        this.mark(p.building);
      }
    }
    this.sagging = this.sagging.filter((s) => s.t > 0);
  }

  // The edge a slab still hangs on by: the one it shares with a neighbouring
  // bay that is standing. Its line along the slab's top, and the axis to tip
  // about so that the free side goes down.
  _hinge(p) {
    const n = (p.sides ?? []).find((q) => q.state === 'static');
    if (!n) return null;
    const a = p.box, b = n.box, c = a.getCenter(new THREE.Vector3());
    const at = new THREE.Vector3(c.x, a.max.y, c.z), axis = new THREE.Vector3();
    if (Math.abs(a.max.x - b.min.x) < 0.1) { at.x = a.max.x; axis.set(0, 0, 1); }
    else if (Math.abs(b.max.x - a.min.x) < 0.1) { at.x = a.min.x; axis.set(0, 0, -1); }
    else if (Math.abs(a.max.z - b.min.z) < 0.1) { at.z = a.max.z; axis.set(-1, 0, 0); }
    else if (Math.abs(b.max.z - a.min.z) < 0.1) { at.z = a.min.z; axis.set(1, 0, 0); }
    else return null;
    return { at, axis };
  }

  // Something changed in `building` (or anywhere, if none is named).
  mark(building) {
    this.dirty = true;
    if (building) this.which.add(building); else this.all = true;
  }

  update(dt) {
    this.time = (this.time ?? 0) + dt;
    this._wait -= dt;
    this._check(dt);
    this._stage(dt);
    if (this.dirty && this._wait <= 0 && this.falls.length === 0) {
      this.dirty = false;
      this._wait = 0.1;
      let loose;
      if (this.all) loose = unsupported(this.pieces.list);
      else { loose = []; for (const b of this.which) for (const p of unsupported(this.pieces.inBuilding(b))) loose.push(p); }
      const was = this.all ? null : [...this.which];
      this.all = false;
      this.which.clear();
      const big = heavy(loose) > PANCAKE;
      if (big) this._pancake(loose);
      else for (const p of loose) {
        // A slab hangs a moment, groaning and shedding dust, before it goes;
        // everything else just falls.
        if (p.role === 'slab') {
          if (p.sagging) continue;
          p.sagging = true;
          const c = p.box.getCenter(new THREE.Vector3());
          this.fx.audio?.creak?.(c.x, c.y, c.z);
          const t = SAG[0] + Math.random() * (SAG[1] - SAG[0]);
          this.sagging.push({ p, t, total: t, hinge: this._hinge(p), q0: p.quat.clone(), pos0: p.pos.clone(), max: 0.06 + Math.random() * 0.06 });
        } else this.pieces.makeDynamic(p, undefined, undefined, { quiet: true });
      }
      if (loose.length) this._wakeRubble(loose);
      if (loose.length && !big) {                     // what they carried may go next
        if (was) for (const b of was) this.mark(b); else this.mark();
      }
    }
    for (const f of this.falls) this._fall(f, dt);
    const before = this.falls.length;
    this.falls = this.falls.filter((f) => f.alive);
    if (before && this.falls.length === 0) this.mark();
  }

  get collapsing() { return this.falls.length > 0; }

  // Frozen rubble lying on something that has just started to fall falls with it.
  _wakeRubble(loose) {
    const zone = new THREE.Box3();
    for (const p of loose) zone.union(p.box);
    zone.expandByScalar(0.3);
    this.fx.chips.unsettle(zone);
    for (const r of this.pieces.list) {
      if (r.state === 'rubble' && r.box.intersectsBox(zone)) this.pieces.makeDynamic(r, undefined, undefined, { quiet: true, debris: true });
    }
  }

  _pancake(list) {
    const P = this.pieces;
    const foot = new THREE.Box3();
    for (const p of list) p.state = 'falling';
    for (const p of list) {
      P.lift(p);
      foot.union(p.box);
    }
    list.sort((a, b) => a.box.min.y - b.box.min.y);
    // What it will land on: whatever is still standing under its footprint.
    const inner = foot.clone().expandByVector(new THREE.Vector3(-0.3, 0, -0.3));
    const stump = P.list.filter((p) => p.state === 'static' && p.box.max.y <= list[0].box.min.y + 0.15 &&
      p.box.max.x > inner.min.x && p.box.min.x < inner.max.x && p.box.max.z > inner.min.z && p.box.min.z < inner.max.z);
    stump.sort((a, b) => b.box.max.y - a.box.max.y);
    // How much it weighs: what it has to break through the floors below with.
    let mass = 0;
    for (const p of list) mass += p.volume * p.kind.density;
    this.falls.push({ list, stump, foot, offset: 0, v: 0, low: 0, s: 0, alive: true, t: 0, mass, energy: 0 });
    this.fx.audio?.rumble(1);
  }

  // It goes on down for as long as it has the energy to. Falling, it gains
  // its weight times the drop; every floor it meets takes that floor's own
  // weight falling three metres to break. A tower's worth goes all the way to
  // the ground; three storeys of slab dropping onto a podium roof break the
  // roof and perhaps the floor under it, and stop there — what is still
  // falling comes down on the floor that held, as rubble.
  _fall(f, dt) {
    const P = this.pieces, fx = this.fx;
    f.t += dt;
    f.v = Math.min(30, f.v + G * dt);
    f.offset -= f.v * dt;
    f.energy += f.mass * G * f.v * dt;
    // Skip what has already been crushed.
    while (f.low < f.list.length && f.list[f.low].state !== 'falling') f.low++;
    while (f.s < f.stump.length && f.stump[f.s].state !== 'static') f.s++;
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
        if (p.state !== 'falling') continue;
        if (p.box.min.y + f.offset > top + reach) break;
        f.mass -= p.volume * p.kind.density;
        this._crush(p, f.offset, f);
        crushed++;
      }
      for (let n = f.s; n < f.stump.length; n++) {
        const p = f.stump[n];
        if (p.state !== 'static') continue;
        if (p.box.max.y < bottom - reach) break;
        const cost = p.volume * p.kind.density * 9.81 * 3 * (p.structural || p.role === 'slab' ? 1 : 0.1) * (p.tough ?? 1);
        if (cost > f.energy) return this._stop(f);
        f.energy -= cost;
        this._crush(p, 0, f);
        crushed++;
      }
      while (f.low < f.list.length && f.list[f.low].state !== 'falling') f.low++;
      while (f.s < f.stump.length && f.stump[f.s].state !== 'static') f.s++;
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
      if (p.state !== 'falling') continue;
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

  // Out of energy: what is still falling lands on what held it.
  _stop(f) {
    for (let n = f.low; n < f.list.length; n++) {
      const p = f.list[n];
      if (p.state !== 'falling') continue;
      p.pos.y += f.offset;
      this.pieces._updateBox(p);
      p.state = 'static';
      this.fx.rubble.add(p, new THREE.Vector3((Math.random() - 0.5) * 1.5, -f.v * 0.5, (Math.random() - 0.5) * 1.5));
    }
    f.alive = false;
    this.mark();
  }

  // A piece broken up in the collapse: it spills out of the crush line, down
  // and outwards, and lands as rubble.
  _crush(p, offset, f) {
    p.pos.y += offset;
    this.pieces._updateBox(p);
    const c = p.box.getCenter(_c);
    const out = new THREE.Vector3(c.x - (f.foot.min.x + f.foot.max.x) / 2, 0, c.z - (f.foot.min.z + f.foot.max.z) / 2);
    const l = out.length() || 1;
    out.multiplyScalar((1 + Math.random() * 5) / l).setY(-f.v * (0.5 + Math.random() * 0.5));
    this.fx.rubble.add(p, out);
  }

  clear() {
    this.falls.length = 0;
    this.warnings.length = 0;
    this.sagging.length = 0;
    this.lost.length = 0;
    this.checks.length = 0;
    this.dirty = false;
    this.which.clear();
    this.all = false;
  }
}
