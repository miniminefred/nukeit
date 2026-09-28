import * as THREE from 'three';
import { G_LAND } from '../physics.js';
import { fractureAsync } from '../damage/csg.js';
import { insideMaterial } from '../render/materials.js';

// What a collapse leaves behind is the building itself.
//
// Every slab, column, wall, desk and piano that comes down in a collapse is
// handed to this, and keeps its own shape. It flies on from however it was
// moving, tumbling, and lands on whatever is under it — the street, what is
// still standing, or pieces that landed before it — and settles there lying on
// its broadest side. Then it is back where it started: a still piece, drawn in
// its material's batch, with a fixed collider you can walk on and a sledge can
// break again.
//
// Four thousand pieces cannot be four thousand rigid bodies stacking on each
// other, and they do not need to be: nothing collides in the air. What matters
// is where they end up. So a piece in the air is a point with a velocity and a
// spin, and what it lands on is found by casting rays down at its footprint.
// What comes down hard and big — a slab bay, a length of core wall, a column
// — breaks where it lands, into a few chunks with real broken faces (cut in
// the CSG workers), which tumble off and land again on their own. That is
// what makes a pile and not a floor: chunks lie at angles, propped on each
// other, with space between them. Laid flat and whole, twelve storeys of
// slabs made a crust four metres thick.
//
// Each landed piece remembers what it came to rest on. When that goes — is
// crushed, knocked loose, falls again — what lay on it is picked up and falls
// too, so nothing is ever left hanging.

const G = 9.81;
const DOWN = { x: 0, y: -1, z: 0 };
const REFRESH = 0.15;            // s between looks at what is under a piece
const SLIDE = 0.08;              // s of its horizontal speed it slides on landing
const LANDINGS_PER_FRAME = 60;   // more than this wait for the next frame, still in the air
const SETTLE = 3;                // columns that must touch: a piece beds into loose rubble until three do
const SWEEP = 0.5;               // s between checks that what rubble lies on is still there
const CHUNK = 1.2;               // m^3 of box: a piece this big breaks up where it lands...
const CHUNK_SPEED = 3;           // ...if it lands at least this fast
const CHUNK_MS = 3;              // ms a frame for putting the chunks in its place
const BREAKS = new Set(['slab', 'core', 'column', 'wall', 'stair', 'spandrel']);

const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _o = { x: 0, y: 0, z: 0 };
const UP = new THREE.Vector3(0, 1, 0);
const GRID = [0.08, 0.5, 0.92];
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

export class Rubble {
  constructor(pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;              // { chips, particles, cloud, audio }
    this.flying = [];
    this._ray = new physics.R.Ray({ x: 0, y: 0, z: 0 }, DOWN);
    this._support = null;
    this._self = null;
    this._out = 0;               // pieces out at the workers
    // Pieces landed since the physics last stepped. A new collider is not in
    // Rapier's query tree until the next step, so rays cannot see these yet:
    // every piece landing in one frame came to rest at the same height, and
    // twelve storeys made a pile six metres high.
    this.recent = [];
    this._steps = -1;
    this._restable = (c) => {
      const o = physics.owner.get(c.handle);
      if (o) return o !== this._self && (o.parts !== undefined || o.role === 'city');
      return physics.ground.has(c.handle);
    };
    this.resting = new Set();    // pieces lying on another piece
    this.broken = [];            // chunks back from the workers, waiting to take their piece's place
    this._sweep = SWEEP;
    // Whatever leaves where it was — crushed, knocked loose, sent flying —
    // takes with it what was lying on it.
    pieces.onLeave = (p) => this.wake(p);
    // And when there are more loose pieces than rigid bodies can afford, the
    // rest come down this way.
    pieces.overflow = (p, vel, spin) => this.add(p, vel, spin);
    // Wreckage left standing — a column's stub and bars, the edge of a pane
    // still in its frame — is not in the building's load paths, so it too
    // remembers what it sits on, and comes down when that does.
    pieces.onAnchor = (p) => this.anchor(p);
  }

  get active() { return this.flying.length > 0 || this.broken.length > 0 || this._out > 0; }

  // Send a piece flying: whatever it is, however it stood or moved. `vel` in
  // m/s, `spin` in rad/s.
  add(p, vel, spin) {
    if (!p || p.state === 'dead' || p.state === 'flying') return;
    const P = this.pieces;
    // Glass does not survive a fall: it bursts into splinters where it is.
    if (p.kind.name === 'glass') {
      if (Math.random() < 0.12) this.fx.chips?.burst('glass', p.box.getCenter(_v).clone(), UP, 3, 4, 0.03);
      P.destroy(p);
      return;
    }
    if (p.body) {
      const lv = p.body.linvel(), av = p.body.angvel();
      vel ??= new THREE.Vector3(lv.x, lv.y, lv.z);
      spin ??= new THREE.Vector3(av.x, av.y, av.z);
      this.physics.removeBody(p.body);
      this.physics.dynamic.delete(p);
      p.body = null;
    }
    this._unrest(p);
    const had = p.colliders.length > 0;
    P._removeFixedColliders(p);
    p.state = 'flying';
    p.sagging = false;
    P._updateBox(p);
    if (had) this.wake(p);
    this.flying.push({
      p,
      v: vel ? vel.clone() : new THREE.Vector3(),
      w: spin ? spin.clone() : new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)),
      floor: -Infinity,
      look: 0,
    });
  }

  // A piece has gone from where it was: whatever lay on it falls again.
  wake(p) {
    const on = p.carried;
    if (!on) return;
    p.carried = null;
    for (const r of on) if ((r.state === 'rubble' || r.state === 'static') && r.restOn === p) this.add(r, new THREE.Vector3(), new THREE.Vector3());
  }

  anchor(p) {
    const c = p.box.getCenter(_v);
    const y = this._under(c.x, c.z, p.box.min.y + 0.05, p);
    const on = this._support;
    if (import.meta.env.DEV) p.anchored = { on: on?.role ?? (on ? 'city' : 'ground'), state: on?.state, gap: +(p.box.min.y - y).toFixed(2) };
    if (on && on.parts && on !== p) this._rest(p, on);
  }

  _unrest(p) {
    if (p.restOn) p.restOn.carried?.delete(p);
    p.restOn = null;
    this.resting.delete(p);
  }

  // How far the lowest of five points under a piece's footprint is above
  // whatever is under it.
  _gap(p) { return this._clearance(p, false).gap; }

  // How far a piece's underside is above what is under it, at the closest of
  // nine columns across its footprint, and what that is. `landing`: looking
  // from above it, for a piece coming down (and at this frame's landings,
  // which Rapier cannot see yet); otherwise from just inside its underside,
  // for one that is lying somewhere.
  _clearance(p, landing, settle = 1) {
    const b = p.box, top = b.max.y + 0.5;
    let gap = Infinity, on = null, hard = Infinity;
    const gaps = [];
    for (const fx of GRID) for (const fz of GRID) {
      const x = b.min.x + (b.max.x - b.min.x) * fx, z = b.min.z + (b.max.z - b.min.z) * fz;
      const t = rayThrough(p, x, top, z);
      if (!t) continue;
      const bottom = top - t[1];
      let y = this._under(x, z, landing ? top : bottom + 0.1, p), sup = this._support;
      if (landing) for (const r of this.recent) {
        const rb = r.box;
        if (rb.max.y <= y || x < rb.min.x || x > rb.max.x || z < rb.min.z || z > rb.max.z || r.state !== 'rubble') continue;
        const u = rayThrough(r, x, top, z);
        if (u && top - u[0] > y) { y = top - u[0]; sup = r; }
      }
      const g = bottom - y;
      gaps.push([g, sup]);
      if (!sup?.parts && g < hard) hard = g;
      if (g < gap) { gap = g; on = sup; }
    }
    if (settle > 1 && gaps.length >= settle) {
      gaps.sort((a, c) => a[0] - c[0]);
      const [g, sup] = gaps[settle - 1];
      if (g < hard) return { gap: g, on: sup };
      return { gap: hard, on: null };
    }
    if (gap === Infinity) {
      // Too thin to hit from nine columns: its bounding box, then.
      const y = this._under((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, landing ? top : b.min.y + 0.1, p);
      return { gap: b.min.y - y, on: this._support };
    }
    return { gap, on };
  }

  _rest(p, on) {
    p.restOn = on;
    p.restAt = on.placed ?? 0;
    (on.carried ??= new Set()).add(p);
    this.resting.add(p);
  }

  // Now and then, everything lying on something is checked against it: if
  // what it lies on has moved, or is moving, it falls. Most of the time the
  // piece underneath going wakes what is on it at once; this catches the rest —
  // a slab and the bar lying on it tipping over together, say, and only the
  // slab being picked up where it landed.
  _check() {
    for (const r of this.resting) {
      if (r.state !== 'rubble' && r.state !== 'static') { this._unrest(r); continue; }
      const on = r.restOn;
      if (!on) { this.resting.delete(r); continue; }
      if ((on.state === 'static' || on.state === 'rubble') && (on.placed ?? 0) === r.restAt) continue;
      this.add(r, new THREE.Vector3(), new THREE.Vector3());
    }
  }

  update(dt) {
    if (this.physics.steps !== this._steps) { this._steps = this.physics.steps; this.recent.length = 0; }
    this._sweep -= dt;
    if (this._sweep <= 0) { this._sweep = SWEEP; this._check(); }
    const t0 = performance.now();
    while (this.broken.length && performance.now() - t0 < CHUNK_MS) this._chunks(this.broken.shift());
    if (!this.flying.length) return;
    const P = this.pieces;
    let landings = LANDINGS_PER_FRAME;
    const keep = [];
    for (const f of this.flying) {
      const p = f.p;
      if (p.state !== 'flying') continue;
      f.v.y -= G * dt;
      p.pos.addScaledVector(f.v, dt);
      const w = f.w.length();
      if (w > 1e-4) {
        _q.setFromAxisAngle(_v.copy(f.w).divideScalar(w), w * dt);
        p.quat.premultiply(_q);
      }
      P._updateBox(p);
      // What is under it, now and then — and every frame once it is close.
      f.look -= dt;
      const near = p.box.min.y - f.floor < Math.max(0.6, -f.v.y * dt * 3);
      if (f.look <= 0 || near) {
        f.look = REFRESH * (0.7 + Math.random() * 0.6);
        const c = p.box.getCenter(_v);
        f.floor = this._under(c.x, c.z, p.box.max.y);
      }
      if (p.box.min.y <= f.floor + 0.02 && landings > 0 && this._land(f)) { landings--; continue; }
      if (p.pos.y < -30) { P.destroy(p); continue; }
      this._draw(p);
      keep.push(f);
    }
    this.flying = keep;
  }

  // The top of whatever is under (x, z), looking down from y; what it is goes
  // in _support. Only three things are something to rest on: a piece, the
  // street and the city. Not a moving body, not the lift car (whose colliders
  // are moved by hand — a raft of rubble came to rest on its roof and hung
  // there when it went), and not a collider already removed this frame, which
  // queries still find until the physics next steps.
  _under(x, z, y, self = null) {
    const r = this._ray;
    r.origin.x = x; r.origin.y = y; r.origin.z = z;
    this._self = self;
    const hit = this.physics.world.castRay(r, y + 5, true, this.physics.R.QueryFilterFlags.EXCLUDE_DYNAMIC, G_LAND, undefined, undefined, this._restable);
    this._support = hit ? this.physics.owner.get(hit.collider.handle) ?? null : null;
    return hit ? y - hit.timeOfImpact : -5;
  }

  // It has come down: lay it on its broadest side where it fell.
  _land(f) {
    const p = f.p, P = this.pieces;
    // A little further along the ground the way it was going.
    p.pos.x += f.v.x * SLIDE;
    p.pos.z += f.v.z * SLIDE;
    // The axis it is thinnest along turns to face up (or down), by the least
    // rotation: a slab lands flat, a column on its side, and both keep the
    // heading they fell with. Then a tilt, for a pile rather than a stack.
    const size = p.localBox.getSize(_s);
    const a = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
    const d = AXES[a].clone().applyQuaternion(p.quat);
    _q.setFromUnitVectors(d, d.y >= 0 ? UP : _v.set(0, -1, 0));
    // Rotate about its centre, not about its frame's origin.
    const c = p.box.getCenter(new THREE.Vector3());
    p.quat.premultiply(_q);
    // On the street a piece lies nearly flat; on the pile it lands however it
    // lands; a broken chunk comes to rest propped at any angle up to steep.
    const tilt = f.chunk ? 0.15 + Math.random() * 0.6 : f.floor > 0.3 ? 0.1 + Math.random() * 0.4 : 0.04 + Math.random() * 0.14;
    const axis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    p.quat.premultiply(_q.setFromAxisAngle(axis, tilt));
    P._updateBox(p);
    p.pos.add(c.sub(p.box.getCenter(_v)));
    P._updateBox(p);
    // Down until it touches: at nine columns across its footprint, how far
    // its own underside is above whatever is under it. (Putting the bottom of
    // its bounding box on the highest thing under it held a tilted slab up by
    // its high side, its low corner in the air.) On loose rubble it settles
    // until three columns touch, bedding in among the pieces under it —
    // stopped at the first, a piece balanced on a corner, and the pile was
    // three parts air. The street and the city it never sinks into.
    const { gap, on } = this._clearance(p, true, SETTLE);
    const b = p.box;
    const h = b.min.y - gap;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    // Resting pieces bed into each other a little.
    const bed = h > 0.05 ? 0.03 : 0;
    p.pos.y -= gap + bed;
    P._updateBox(p);
    p.state = 'rubble';
    P.rejoin(p);
    P._addFixedCollider(p);
    this.recent.push(p);
    // What it lies on: if that goes, so does this. The street and the city
    // are not pieces and never go.
    p.placed = (p.placed ?? 0) + 1;
    if (on && on.parts) this._rest(p, on);
    // Heavy things land with a thump and a cloud.
    const m = p.volume * p.kind.density;
    const v = Math.hypot(f.v.x, f.v.y, f.v.z);
    if (m > 3000 && v > 4 && Math.random() < 0.08) this.fx.cloud?.(new THREE.Vector3(cx, b.min.y + 0.3, cz), Math.min(2.5, Math.sqrt(m) / 60));
    if (!f.chunk && !p.gen && v > CHUNK_SPEED && p.volume > CHUNK && p.parts.length === 1 && BREAKS.has(p.role)) this._breakUp(p, f.v);
    return true;
  }

  // Split a piece that has landed hard, in a worker. It lies where it landed
  // until its chunks are ready.
  _breakUp(p, v) {
    const q = p.parts[0];
    p.gen = 1;
    const at = p.placed;
    this._out++;
    const passes = p.volume > 6 ? 3 : 2;
    fractureAsync(q.geometry, q.materials ?? [this.pieces._material(q)], insideMaterial(q.kind.name), passes, 8)
      .then((bits) => this.broken.push({ p, q, bits, at, v: v.clone() }))
      .catch(() => {})
      .finally(() => { this._out--; });
  }

  // The chunks take their piece's place, and tumble off it.
  _chunks({ p, q, bits, at, v }) {
    if (p.state !== 'rubble') return;          // gone, or in the air again: it stays whole
    const P = this.pieces;
    const c0 = p.box.getCenter(new THREE.Vector3());
    const out = [];
    for (const bit of bits) {
      const g = bit.geometry;
      g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      const pos = c.applyQuaternion(p.quat).add(p.pos);
      out.push(P.spawn({ parts: [{ kind: q.kind.name, geometry: g, materials: bit.materials, tint: q.tint }], pos, quat: p.quat, role: 'fragment', floor: p.floor, structural: false, hull: true }, { free: true }));
    }
    p.brokeUp = true;
    P.destroy(p);
    for (const f of out) {
      f.gen = 1;
      const away = f.box.getCenter(new THREE.Vector3()).sub(c0).setY(0);
      const l = away.length() || 1;
      const vel = away.multiplyScalar((0.6 + Math.random() * 1.6) / l).add(new THREE.Vector3(v.x * 0.15, 0.8 + Math.random() * 1.8, v.z * 0.15));
      this.add(f, vel, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3));
      const fl = this.flying[this.flying.length - 1];
      if (fl?.p === f) fl.chunk = true;
    }
  }

  _draw(p) {
    if (p.object) {
      p.object.position.copy(p.pos);
      p.object.quaternion.copy(p.quat);
      return;
    }
    this.pieces.drawAt(p, _m.compose(p.pos, p.quat, _one));
  }

  clear() {
    this.flying.length = 0;
    this.resting.clear();
    this.broken.length = 0;
  }
}

// Where a ray straight down from (x, y, z) goes through a piece's collider —
// its box, or its boxes, in its own frame — as [in, out] distances, or null.
// The same shape Rapier would find, for a piece Rapier cannot see yet.
const _ro = new THREE.Vector3(), _rd = new THREE.Vector3(), _qi = new THREE.Quaternion();
export function rayThrough(p, x, y, z) {
  _qi.copy(p.quat).invert();
  _ro.set(x - p.pos.x, y - p.pos.y, z - p.pos.z).applyQuaternion(_qi);
  _rd.set(0, -1, 0).applyQuaternion(_qi);
  const boxes = p.colliderBoxes ?? [[p.localBox.min.x, p.localBox.min.y, p.localBox.min.z, p.localBox.max.x, p.localBox.max.y, p.localBox.max.z]];
  let best = null;
  for (const b of boxes) {
    let t0 = -Infinity, t1 = Infinity;
    for (let a = 0; a < 3; a++) {
      const o = a === 0 ? _ro.x : a === 1 ? _ro.y : _ro.z, d = a === 0 ? _rd.x : a === 1 ? _rd.y : _rd.z;
      const lo = b[a], hi = b[a + 3];
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
    }
    if (t0 <= t1 && t1 >= 0 && (!best || t0 < best[0])) best = [Math.max(0, t0), t1];
  }
  return best;
}
