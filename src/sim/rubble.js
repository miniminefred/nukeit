import * as THREE from 'three';
import { G_LAND } from '../physics.js';

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
// Each landed piece remembers what it came to rest on. When that goes — is
// crushed, knocked loose, falls again — what lay on it is picked up and falls
// too, so nothing is ever left hanging.

const G = 9.81;
const DOWN = { x: 0, y: -1, z: 0 };
const REFRESH = 0.15;            // s between looks at what is under a piece
const SLIDE = 0.08;              // s of its horizontal speed it slides on landing
const LANDINGS_PER_FRAME = 120;  // more than this wait for the next frame, still in the air
const SWEEP = 0.5;               // s between checks that what rubble lies on is still there

const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _o = { x: 0, y: 0, z: 0 };
const UP = new THREE.Vector3(0, 1, 0);
const FOOT = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

export class Rubble {
  constructor(pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;              // { chips, particles, cloud, audio }
    this.flying = [];
    this._ray = new physics.R.Ray({ x: 0, y: 0, z: 0 }, DOWN);
    this._support = null;
    this.resting = new Set();    // pieces lying on another piece
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

  get active() { return this.flying.length > 0; }

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
    this._under(c.x, c.z, p.box.min.y + 0.05, p);
    const on = this._support;
    if (on && on.parts && on !== p) this._rest(p, on);
  }

  _unrest(p) {
    if (p.restOn) p.restOn.carried?.delete(p);
    p.restOn = null;
    this.resting.delete(p);
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
      const on = r.restOn;
      if (!on) { this.resting.delete(r); continue; }
      if (r.state !== 'rubble' && r.state !== 'static') { this._unrest(r); continue; }
      if ((on.state === 'static' || on.state === 'rubble') && (on.placed ?? 0) === r.restAt) continue;
      this.add(r, new THREE.Vector3(), new THREE.Vector3());
    }
  }

  update(dt) {
    this._sweep -= dt;
    if (this._sweep <= 0) { this._sweep = SWEEP; this._check(); }
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
  // in _support. Moving bodies are not something to rest on.
  _under(x, z, y, self = null) {
    const r = this._ray;
    r.origin.x = x; r.origin.y = y; r.origin.z = z;
    const own = self ? (c) => this.physics.owner.get(c.handle) !== self : undefined;
    const hit = this.physics.world.castRay(r, y + 5, true, this.physics.R.QueryFilterFlags.EXCLUDE_DYNAMIC, G_LAND, undefined, undefined, own);
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
    const tilt = 0.04 + Math.random() * 0.14;
    const axis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    p.quat.premultiply(_q.setFromAxisAngle(axis, tilt));
    P._updateBox(p);
    p.pos.add(c.sub(p.box.getCenter(_v)));
    P._updateBox(p);
    // What it lies on: the highest of five points under its footprint.
    const b = p.box, top = b.max.y + 0.5;
    const ix = (b.max.x - b.min.x) * 0.38, iz = (b.max.z - b.min.z) * 0.38;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    let h = -Infinity, on = null;
    for (const [dx, dz] of FOOT) {
      const y = this._under(cx + dx * ix, cz + dz * iz, top);
      if (y > h) { h = y; on = this._support; }
    }
    // Resting pieces bed into each other a little: rubble is not a stack of plates.
    const thick = b.max.y - b.min.y;
    const bed = h > 0.05 ? Math.min(0.12, thick * 0.2) : 0;
    p.pos.y += h - bed - b.min.y;
    P._updateBox(p);
    p.state = 'rubble';
    P.rejoin(p);
    P._addFixedCollider(p);
    // What it lies on: if that goes, so does this. The street and the city
    // are not pieces and never go.
    p.placed = (p.placed ?? 0) + 1;
    if (on && on.parts) this._rest(p, on);
    // Heavy things land with a thump and a cloud.
    const m = p.volume * p.kind.density;
    const v = Math.hypot(f.v.x, f.v.y, f.v.z);
    if (m > 3000 && v > 4 && Math.random() < 0.08) this.fx.cloud?.(new THREE.Vector3(cx, b.min.y + 0.3, cz), Math.min(2.5, Math.sqrt(m) / 60));
    return true;
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
  }
}
