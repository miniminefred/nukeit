import * as THREE from 'three';
import { FLOOR_H } from '../building/plan.js';

// A tower that has lost one side tips over.
//
// When a storey's supports are damaged unevenly — one side's columns and core
// gone, the other side's still standing — the weight above is no longer over
// what holds it up. Then everything above that storey tips as **one rigid
// mass**, swinging over towards the broken side on the columns that are left,
// which act as the hinge. It stays in one piece in the air. When it hits the
// ground, or anything, hard enough, it breaks: the big slabs and walls tumble on
// as real pieces, the rest becomes rubble and dust along the line where it
// landed. A gentle lean that comes to rest against a neighbour just stays there.
// If every support on a storey goes at once, evenly, it does not tip — it drops
// straight down (the pancake in sim/structure.js).
//
// The mass is one Rapier body whose colliders are a box per floor slab and one
// per storey of core; each piece of the building rides on it, its matrix
// being the body's transform times where it stood.

const MARGIN = 0.6;          // m: how far off its support the weight must be to tip
const LOW = 0.3;             // remaining strength below which an off-centre load tips
const BREAK_SPEED = 5;       // m/s at which hitting the street breaks it apart
const CRUSH_SPEED = 14;      // m/s at which landing on its own lower floors does
const CRUSH_PER_FRAME = 16;  // pieces under the leaning mass it grinds through a frame
const MAX_BIG = 90;          // pieces that carry on as rigid bodies once it breaks
const HINGE_SNAP = 0.45;     // rad of lean at which the columns it pivots on give way

const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Topple {
  constructor(pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;              // { heap, particles, chips, cloud, audio, shake, structure, player }
    this.mass = null;
  }

  get active() { return this.mass !== null; }

  // After a support on storey f gives way: is the weight above still over
  // what is left? Returns true if it tipped.
  check(f) {
    if (this.mass) return false;
    const P = this.pieces;
    const base = (f + 1) * FLOOR_H - 0.1;     // the underside of the slab above storey f
    const above = P.list.filter((p) => p.state === 'static' && p.box.min.y >= base);
    if (above.length < 40) return false;
    const supports = P.list.filter((p) => p.floor === f && (p.role === 'column' || p.role === 'core'));
    const standing = supports.filter((p) => p.state === 'static' && p.hp > p.hpMax * 0.25);
    if (standing.length === 0) return false;      // nothing left at all: it drops straight down
    // Where the weight is.
    const com = new THREE.Vector3();
    let m = 0;
    for (const p of above) {
      const w = p.volume * p.kind.density;
      com.addScaledVector(p.box.getCenter(_v), w);
      m += w;
    }
    com.divideScalar(m);
    // What is left to stand on: the rectangle round the remaining supports,
    // and how much of the original strength is in it.
    const area = new THREE.Box3();
    let left = 0, all = 0;
    for (const p of supports) all += p.hpMax;
    for (const p of standing) { area.union(p.box); left += p.hp; }
    const centre = area.getCenter(new THREE.Vector3());
    const outside = com.x < area.min.x + MARGIN || com.x > area.max.x - MARGIN || com.z < area.min.z + MARGIN || com.z > area.max.z - MARGIN;
    const off = Math.hypot(com.x - centre.x, com.z - centre.z);
    if (!outside && !(left / all < LOW && off > 3)) return false;
    const dir = new THREE.Vector3(com.x - centre.x, 0, com.z - centre.z);
    if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    this._crush(f, standing, base);
    this._start(above, dir, m, f, standing);
    return true;
  }

  // Everything else in the broken storey — stairs, facade panels, partitions,
  // furniture — is under four thousand tonnes that has stopped being carried.
  // None of it props the mass up: it is ground to rubble on the spot. Left
  // standing, the stairs and spandrels held the tower up at a 2.5 degree lean
  // and it never went over.
  _crush(f, standing, base) {
    const P = this.pieces, fx = this.fx, keep = new Set(standing);
    const lo = f * FLOOR_H - 0.05;
    for (const p of [...P.list]) {
      if (p.state !== 'static' || keep.has(p)) continue;
      if (p.box.max.y > base + 0.05 || p.box.min.y < lo) continue;
      if (p.structural || p.role === 'slab' || p.role === 'stair') this._pile(p);
      P.destroy(p);
    }
    const c = new THREE.Vector3();
    for (let i = 0; i < 6 && standing.length; i++) fx.cloud?.(standing[(Math.random() * standing.length) | 0].box.getCenter(c).clone(), 2);
  }

  _start(list, dir, mass, f, hinge) {
    const P = this.pieces, R = this.physics.R, world = this.physics.world;
    // One box per floor slab and one per storey of core, in world coordinates.
    const byFloor = new Map();
    for (const p of list) {
      if (p.role !== 'slab' && p.role !== 'core' && p.role !== 'column') continue;
      const k = `${p.floor}|${p.role === 'slab' ? 's' : 'c'}`;
      const b = byFloor.get(k) ?? new THREE.Box3();
      b.union(p.box);
      byFloor.set(k, b);
    }
    const boxes = [...byFloor.values()];
    let vol = 0;
    for (const b of boxes) { const s = b.getSize(_v); vol += s.x * s.y * s.z; }
    const density = (mass * 0.35) / Math.max(1, vol);
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(true).setAngularDamping(0.05).setLinearDamping(0.02));
    for (const b of boxes) {
      const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      world.createCollider(R.ColliderDesc.cuboid(s.x / 2, Math.max(0.1, s.y / 2), s.z / 2).setTranslation(c.x, c.y, c.z)
        .setDensity(density).setFriction(0.6).setRestitution(0.02), body);
    }
    // Everything riding on it keeps where it stood relative to the body.
    const riders = list.map((p) => {
      P._removeFixedColliders(p);
      p.state = 'tipping';
      return { p, m0: P.worldMatrix(p, new THREE.Matrix4()), m: new THREE.Matrix4() };
    });
    // A nudge over the edge: it is already off balance, this only saves it
    // from teetering for ever on a perfectly placed hinge.
    const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
    body.setAngvel({ x: axis.x * 0.12, y: 0, z: axis.z * 0.12 }, true);
    // Where it pivots, measured along the way it falls: only what lies past
    // this on the fall side gives way under it. Crushing both sides let the
    // whole block sink into its own footprint instead of swinging over.
    const hc = new THREE.Box3();
    for (const p of hinge) hc.union(p.box);
    const pivot = hc.isEmpty() ? 0 : hc.getCenter(new THREE.Vector3()).dot(dir);
    // The hinge itself is a joint, not the columns: they are what the
    // structure pass fails next, and when they went the block rocked back
    // and sank flat into its own footprint. It is pinned along the fall-side
    // edge of what is left standing, at the underside of the mass, and swings
    // about that until it is far enough over or meets the street.
    const edge = hc.isEmpty() ? new THREE.Vector3() : this._edge(hc, dir);
    const base = list.reduce((y, p) => Math.min(y, p.box.min.y), Infinity);
    const anchor = { x: edge.x, y: base, z: edge.z };
    const joint = world.createImpulseJoint(R.JointData.revolute(anchor, anchor, { x: axis.x, y: 0, z: axis.z }), this.physics.fixed, body, true);
    this.mass = { body, riders, dir, t: 0, still: 0, floor: f, hit: false, hinge, pivot, joint };
    this.fx.audio?.creak?.(0, (f + 1) * FLOOR_H, 0);
    this.fx.audio?.rumble(1);
  }

  // The point of a box furthest along a horizontal direction, at its centre.
  _edge(box, dir) {
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    return c.add(new THREE.Vector3(Math.sign(dir.x) * s.x / 2 * Math.abs(dir.x), 0, Math.sign(dir.z) * s.z / 2 * Math.abs(dir.z)));
  }

  // What it grinds up on the way over is piled only once it has landed. Piled
  // at once, the rubble rose under the fall side and the tower bounced back
  // off its own debris at thirteen degrees.
  _pile(p) { (this._rubble ??= []).push([p.box.clone(), p.volume * 0.3]); }

  _flush() {
    for (const [box, v] of this._rubble ?? []) this.fx.heap?.add(box, v);
    this._rubble = [];
  }

  // Where a piece is now: a loose one's box is where it was knocked loose.
  _centre(p) {
    if (p.body) { const t = p.body.translation(); return _v.set(t.x, t.y, t.z); }
    return p.box.getCenter(_v);
  }

  _release() {
    const M = this.mass;
    if (M?.joint) { this.physics.world.removeImpulseJoint(M.joint, true); M.joint = null; }
  }

  update(dt) {
    const M = this.mass;
    if (!M) return;
    M.t += dt;
    const b = M.body;
    const t = b.translation(), r = b.rotation();
    _m.compose(_t.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s);
    for (const rd of M.riders) {
      const p = rd.p;
      if (p.state === 'dead') continue;
      const mat = rd.m.multiplyMatrices(_m, rd.m0);
      if (p.object) {
        p.object.matrixAutoUpdate = false;
        p.object.matrix.copy(mat);
        p.object.matrixWorldNeedsUpdate = true;
      } else {
        for (const q of p.parts) q.batch.setMatrixAt(q.instance, mat);
      }
    }
    // The columns it pivots on take the whole weight on one edge, and once the
    // lean is real they snap and it goes.
    if (M.hinge && 2 * Math.acos(Math.min(1, Math.abs(r.w))) > HINGE_SNAP) {
      this._release();
      for (const p of M.hinge) if (p.state === 'static') { this._pile(p); this.fx.cloud?.(p.box.getCenter(_v).clone(), 1.5); this.pieces.destroy(p); }
      M.hinge = null;
      this.fx.audio?.rumble(1);
      this.fx.shake?.add(0.4);
    }
    // What is it touching, and how hard?
    const lv = b.linvel(), av = b.angvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z) + Math.hypot(av.x, av.y, av.z) * 12;
    let ground = false, building = false;
    const under = [];
    for (let n = 0; n < b.numColliders(); n++) {
      this.physics.world.contactPairsWith(b.collider(n), (other) => {
        const o = this.physics.owner.get(other.handle);
        // The street and the neighbours break it; its own lower storeys are
        // what it pivots and slides off, and only a far harder landing on
        // them does. Counting them as ground broke it at a four degree lean,
        // which reads as a drop, not a topple.
        // The rubble heap it has just made is neither: it rides over that.
        // Counting it as the street broke the tower apart in mid-air.
        if (this.physics.ground.has(other.handle) || o?.role === 'city') ground = true;
        else if (!o) return;
        if (o?.parts) { building = true; if ((o.state === 'static' || o.state === 'dynamic') && !M.hinge?.includes(o) && this._centre(o).dot(M.dir) > M.pivot - 2) under.push(o); }
      });
    }
    this.fx.shake?.add(Math.min(0.05, speed * 0.004));
    // What it is leaning on is carrying four thousand tonnes on an edge, and
    // gives way: the mass grinds down through the storeys on its low side
    // until it reaches the street. Stopped by them, it came to rest at an
    // eleven degree lean on the floor below and never went over.
    let n = 0;
    for (const p of new Set(under)) {
      if (n++ >= CRUSH_PER_FRAME) break;
      if (p.state !== 'static' && p.state !== 'dynamic') continue;
      if (p.structural || p.role === 'slab') this._pile(p);
      if (Math.random() < 0.25) this.fx.cloud?.(this._centre(p).clone(), 1.5);
      this.pieces.destroy(p);
    }
    if (n) { this.fx.structure?.mark(); this.fx.audio?.rumble(0.5); }
    if (ground) this._release();
    if (M.t > 0.4 && ((ground && speed > BREAK_SPEED) || (building && speed > CRUSH_SPEED))) return this._break(speed);
    // Came to rest without breaking: it stays where it ended up, leaning.
    if (b.isSleeping() || speed < 0.2) M.still += dt; else M.still = 0;
    if (M.still > 1.2 || M.t > 25) this._settle();
  }

  // Put every rider where the body has carried it.
  _place() {
    const P = this.pieces;
    for (const rd of this.mass.riders) {
      const p = rd.p;
      if (p.state === 'dead') continue;
      rd.m.decompose(p.pos, p.quat, _s);
      _s.set(1, 1, 1);
      if (p.object) {
        p.object.matrixAutoUpdate = true;
        p.object.position.copy(p.pos);
        p.object.quaternion.copy(p.quat);
      }
      P._updateBox(p);
    }
  }

  _settle() {
    const P = this.pieces;
    this._release();
    this._place();
    for (const { p } of this.mass.riders) {
      if (p.state === 'dead') continue;
      p.state = 'static';
      P._addFixedCollider(p);
    }
    this.physics.world.removeRigidBody(this.mass.body);
    this.mass = null;
    this._flush();
    this.fx.heap?.settle();
    this.fx.structure?.mark();
  }

  // It hit hard: it comes apart where it lies.
  _break(speed) {
    const P = this.pieces, fx = this.fx;
    const M = this.mass;
    this._place();
    const b = M.body;
    this._release();
    const lv = b.linvel(), av = b.angvel(), com = b.translation();
    const vAt = (p) => {
      const r = _v.set(p.pos.x - com.x, p.pos.y - com.y, p.pos.z - com.z);
      return new THREE.Vector3(lv.x + av.y * r.z - av.z * r.y, lv.y + av.z * r.x - av.x * r.z, lv.z + av.x * r.y - av.y * r.x).multiplyScalar(0.8);
    };
    this.physics.world.removeRigidBody(b);
    this.mass = null;
    const riders = M.riders.map((r) => r.p).filter((p) => p.state !== 'dead');
    // The biggest pieces go on as bodies; everything else is ground up.
    const big = riders.filter((p) => p.structural || p.role === 'slab' || p.role === 'stair')
      .sort((a, c) => c.volume * c.kind.density - a.volume * a.kind.density).slice(0, MAX_BIG);
    const keep = new Set(big);
    for (const p of riders) {
      if (keep.has(p)) continue;
      if (Math.random() < 0.02 && p.role !== 'glass') { keep.add(p); continue; }   // some furniture flies
      if (p.structural || p.role === 'slab') fx.heap?.add(p.box, p.volume * 0.3);
      if (p.role === 'glass' && Math.random() < 0.15) fx.chips?.burst('glass', p.box.getCenter(new THREE.Vector3()), UP, 4, 5, 0.03);
      P.destroy(p);
    }
    for (const p of keep) {
      p.state = 'static';
      P.makeDynamic(p, vAt(p), { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 }, { quiet: true });
    }
    // Dust along where it came down.
    const low = riders.filter((p) => p.box.min.y < 3).slice(0, 400);
    for (let i = 0; i < 14 && low.length; i++) {
      const p = low[(Math.random() * low.length) | 0];
      fx.cloud?.(p.box.getCenter(new THREE.Vector3()).setY(0.5), 2.5);
    }
    fx.audio?.explosion(com.x, 1, com.z, 6);
    fx.audio?.rumble(1);
    fx.shake?.add(1);
    this._flush();
    fx.heap?.settle();
    fx.structure?.mark();
  }

  clear() {
    this._release();
    this._rubble = [];
    if (this.mass) this.physics.world.removeRigidBody(this.mass.body);
    this.mass = null;
  }
}
