import * as THREE from 'three';
import { FLOOR_H } from '../building/plan.js';
import { G_MASS_HINGED, G_LAND, massGroups } from '../physics.js';

// A tower that has lost one side tips over.
//
// When a storey's supports are damaged unevenly — one side's columns and core
// gone, the other side's still standing — the weight above is no longer over
// what holds it up. Then everything above that storey tips as **one rigid
// mass**, swinging over towards the broken side on the columns that are left,
// which act as the hinge. It stays in one piece in the air. When it hits the
// ground, or anything, hard enough, it breaks: every slab, wall, column and
// desk in it flies on from where the swing was carrying it and comes down as
// rubble (sim/rubble.js) — the tower lying in pieces along the street. Even
// a gentle lean that comes to rest against a neighbour comes apart.
// If every support on a storey goes at once, evenly, it does not tip — it drops
// straight down (the pancake in sim/structure.js).
//
// A tower on a wide podium meets the street on its low side after a few
// degrees. Real buildings do not stop there, and nor do they balance on that
// edge: the storeys on the low side are crushed between the weight above and
// the ground, the lean keeps growing, and the tower above goes over toward the
// cut. So while it swings on its hinge the mass passes through the street,
// and whatever of it goes below the street is ground off as rubble where it
// is. When the hinge gives way, what is left is one mass again, and that
// comes down on the street.
//
// The mass is one Rapier body whose colliders are a box per floor slab and one
// per storey of core; each piece of the building rides on it, its matrix
// being the body's transform times where it stood.

const MARGIN = 0.6;          // m: how far off its support the weight must be to tip
const LOW = 0.67;            // a third of the strength gone, all on one side, and it tips
const OFF = 3;               // m: how far off the strength that is left it must be
const HINGE_SHARE = 0.15;    // of what is left: stragglers past this on the fall side are no hinge
const BREAK_SPEED = 5;       // m/s at which hitting the street breaks it apart
const CRUSH_PER_FRAME = 150; // pieces a frame the low side grinds off into the street
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
    this.fx = fx;              // { rubble, particles, chips, cloud, audio, shake, structure, player }
    this.mass = null;
    this.blows = new Map();    // building -> { dir, t }: the last heavy blow it took
    this.time = 0;
  }

  get active() { return this.mass !== null; }

  // After a support on storey f gives way: is the weight above still over
  // what is left? Returns true if it tipped.
  check(f, building = 'tower') {
    if (this.mass) return false;
    const P = this.pieces;
    const supports = P.list.filter((p) => p.floor === f && p.building === building && (p.role === 'column' || p.role === 'core'));
    if (!supports.length) return false;
    // The underside of the slab above storey f: the tops of its supports.
    const base = supports.reduce((y, p) => Math.max(y, p.box.max.y), 0) - 0.1;
    const above = P.list.filter((p) => p.state === 'static' && p.building === building && p.box.min.y >= base);
    if (above.length < 40) return false;
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
    // how much of the original strength is in it, and where that strength is.
    // A lone column left in a far corner widens the rectangle but carries
    // nothing of a tower, so it is the centre of strength that counts.
    const area = new THREE.Box3();
    const centre = new THREE.Vector3();
    let left = 0, all = 0;
    for (const p of supports) all += p.hpMax;
    for (const p of standing) { area.union(p.box); left += p.hp; centre.addScaledVector(p.box.getCenter(_v), p.hp); }
    centre.divideScalar(left);
    const outside = com.x < area.min.x + MARGIN || com.x > area.max.x - MARGIN || com.z < area.min.z + MARGIN || com.z > area.max.z - MARGIN;
    const off = Math.hypot(com.x - centre.x, com.z - centre.z);
    if (!outside && !(left / all < LOW && off > OFF)) return false;
    const dir = new THREE.Vector3(com.x - centre.x, 0, com.z - centre.z);
    if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    // Only something tall for its base goes over. A low, wide block — the
    // podium with a corner crushed — does not tip as one: the part that has
    // lost its supports comes down on its own, and the rest stands.
    let top = 0;
    for (const p of above) if (p.box.max.y > top) top = p.box.max.y;
    const size = area.getSize(_v);
    const wide = Math.abs(dir.x) * size.x + Math.abs(dir.z) * size.z;
    if (top - base < wide * 0.8) return false;
    // Struck hard a moment ago — a tower falling into it — it is still moving
    // the way the blow drove it, and goes over that way, away from what hit it,
    // not back onto it.
    const blow = this.blows.get(building);
    if (blow && this.time - blow.t < 12) dir.addScaledVector(blow.dir, 2.5).setY(0).normalize();
    // The hinge: the fall-side edge of what is left, less any stragglers out
    // beyond it on the fall side. Those are under the weight, and go with it.
    const along = standing.map((p) => [p, p.box.getCenter(new THREE.Vector3()).dot(dir)]).sort((a, b) => b[1] - a[1]);
    let acc = 0, edge = along[0][1];
    for (const [p, d] of along) { acc += p.hp; edge = d; if (acc >= left * HINGE_SHARE) break; }
    // And never in front of the weight. Where the weight is still behind the
    // supports on the fall side, those supports are what it now bears down on
    // off-centre, and they crush: the pivot moves back until the weight is
    // over it, and past it. A hinge in front of the weight would stand the
    // tower up again.
    edge = Math.min(edge, com.dot(dir) - 0.6);
    const hinge = along.filter(([, d]) => d <= edge + 0.01).map(([p]) => p);
    const anchor = centre.clone().addScaledVector(dir, edge - centre.dot(dir) + 0.4);
    this.lastTip = { floor: f, dir: [+dir.x.toFixed(2), +dir.z.toFixed(2)], left: +(left / all).toFixed(2) };
    this._crush(f, hinge, base, building);
    this._start(above, dir, m, f, hinge, anchor);
    return true;
  }

  // Everything else in the broken storey — stairs, facade panels, partitions,
  // furniture — is under four thousand tonnes that has stopped being carried.
  // None of it props the mass up: it is ground to rubble on the spot. Left
  // standing, the stairs and spandrels held the tower up at a 2.5 degree lean
  // and it never went over.
  _crush(f, standing, base, building) {
    const P = this.pieces, fx = this.fx, keep = new Set(standing);
    const lo = standing.reduce((y, p) => Math.min(y, p.box.min.y), Infinity) - 0.35;
    for (const p of [...P.list]) {
      if (p.state !== 'static' || keep.has(p) || p.building !== building) continue;
      // Everything that starts in the storey, including what reaches up into
      // the one above — a stair, a wall, a spandrel. Left, those stood inside
      // the tipping mass's first box and the solver threw four thousand tonnes
      // off them at forty metres a second.
      if (p.box.min.y >= base - 0.05 || p.box.min.y < lo) continue;
      fx.rubble.add(p, new THREE.Vector3((Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2));
    }
    const c = new THREE.Vector3();
    for (let i = 0; i < 6 && standing.length; i++) fx.cloud?.(standing[(Math.random() * standing.length) | 0].box.getCenter(c).clone(), 2);
  }

  _start(list, dir, mass, f, hinge, anchor) {
    const P = this.pieces, R = this.physics.R, world = this.physics.world;
    // Anything already loose inside it — the core, fallen down its own shaft —
    // rides with it. As rigid bodies inside the mass's boxes, they were what
    // it was pushed off.
    const zone = new THREE.Box3();
    for (const p of list) if (p.role === 'slab') zone.union(p.box);
    const standing = list.slice();
    for (const p of [...this.physics.dynamic]) {
      if (!p.body || !zone.containsPoint(p.box.getCenter(_v))) continue;
      this.physics.removeBody(p.body);
      this.physics.dynamic.delete(p);
      p.body = null;
      list.push(p);
    }
    // One box per floor slab and one per storey of core, in world coordinates.
    const byFloor = new Map();
    for (const p of standing) {
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
    this._boxes(body, boxes, density, G_MASS_HINGED);
    // Everything riding on it keeps where it stood relative to the body.
    // Everything riding is marked first, so that lifting one piece does not
    // send flying another that rides on it.
    for (const p of list) p.state = 'tipping';
    // The body starts at the origin, unturned, so where a piece is now is
    // where it is in the body's own frame: its box then, its centre and its
    // reach from that centre for telling when it has gone below the street.
    const riders = list.map((p) => {
      P.lift(p);
      const c0 = p.box.getCenter(new THREE.Vector3());
      return { p, m0: P.worldMatrix(p, new THREE.Matrix4()), m: new THREE.Matrix4(), box: p.box.clone(), c0, r: p.box.getSize(_v).length() / 2, frame: p.role === 'slab' || p.role === 'core' || p.role === 'column' };
    });
    // A nudge over the edge: it is already off balance, this only saves it
    // from teetering for ever on a perfectly placed hinge.
    const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
    body.setAngvel({ x: axis.x * 0.12, y: 0, z: axis.z * 0.12 }, true);
    // The hinge itself is a joint, not the columns: they are what the
    // structure pass fails next, and when they went the block rocked back
    // and sank flat into its own footprint. It is pinned along the fall-side
    // edge of what is left standing, at the underside of the mass, and swings
    // about that until it is far enough over or meets the street.
    const base = list.reduce((y, p) => Math.min(y, p.box.min.y), Infinity);
    const a = { x: anchor.x, y: base, z: anchor.z };
    const joint = world.createImpulseJoint(R.JointData.revolute(a, a, { x: axis.x, y: 0, z: axis.z }), this.physics.fixed, body, true);
    this.mass = { body, riders, dir, t: 0, still: 0, floor: f, hit: false, hinge, joint, density, mass, building: list[0]?.building,
      under: this._heights(list, dir) };
    this.fx.audio?.creak?.(0, (f + 1) * FLOOR_H, 0);
    this.fx.audio?.rumble(1);
  }

  // The mass's colliders: a box per floor of slabs and per storey of core.
  _boxes(body, boxes, density, group) {
    const R = this.physics.R, world = this.physics.world;
    for (const b of boxes) {
      const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      world.createCollider(R.ColliderDesc.cuboid(s.x / 2, Math.max(0.1, s.y / 2), s.z / 2).setTranslation(c.x, c.y, c.z)
        .setDensity(density).setFriction(0.6).setRestitution(0.02).setCollisionGroups(group), body);
    }
  }

  // The hinge has given way: the mass is what is left of it, meeting the
  // street now. Its boxes are rebuilt from the pieces not ground off.
  _unhinge() {
    const M = this.mass, body = M.body, world = this.physics.world;
    const byFloor = new Map();
    for (const rd of M.riders) {
      if (!rd.frame || rd.p.state !== 'tipping') continue;
      const k = `${rd.p.floor}|${rd.p.role === 'slab' ? 's' : 'c'}`;
      (byFloor.get(k) ?? byFloor.set(k, new THREE.Box3()).get(k)).union(rd.box);
    }
    for (let n = body.numColliders() - 1; n >= 0; n--) world.removeCollider(body.collider(n), false);
    // Its own building it lands on and slides off; another it ploughs into
    // (`_smash`). Colliding with the office block, it bounced off it upright.
    if (byFloor.size) this._boxes(body, [...byFloor.values()], M.density, massGroups(M.building));
  }

  // What is under the ground it may swing over: a height map, 2 m squares, of
  // the tops of everything standing that is not the mass itself — the podium
  // roof under the tower, the yard, the office block next door. Taken once, as
  // it starts to tip.
  _heights(list, dir) {
    const zone = new THREE.Box3();
    for (const p of list) zone.union(p.box);
    const reach = zone.max.y - zone.min.y;
    zone.expandByVector(new THREE.Vector3(Math.abs(dir.x) * reach + 4, 0, Math.abs(dir.z) * reach + 4));
    // Any city block it could come down on is a building from now on.
    this.fx.wake?.(new THREE.Box3(zone.min.clone().setY(0), zone.max.clone()));
    const C = 2, x0 = zone.min.x, z0 = zone.min.z;
    const nx = Math.ceil((zone.max.x - x0) / C), nz = Math.ceil((zone.max.z - z0) / C);
    const h = new Float32Array(nx * nz);
    const riding = new Set(list);
    const { world, R, owner, ground } = this.physics;
    const ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const keep = (c) => { const o = owner.get(c.handle); return o ? !riding.has(o) && (o.parts !== undefined || o.role === 'city') : ground.has(c.handle); };
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      ray.origin = { x: x0 + (i + 0.5) * C, y: 200, z: z0 + (k + 0.5) * C };
      const hit = world.castRay(ray, 250, true, undefined, G_LAND, undefined, undefined, keep);
      h[k * nx + i] = hit ? 200 - hit.timeOfImpact : 0;
    }
    return { h, x0, z0, nx, nz, C, at: (x, z) => {
      const i = Math.floor((x - x0) / C), k = Math.floor((z - z0) / C);
      return i < 0 || k < 0 || i >= nx || k >= nz ? 0 : h[k * nx + i];
    } };
  }

  // What the mass sweeps through of another building — the office block next
  // door — is smashed out of the way: its pieces go flying on with the part of
  // the mass that hit them, and the mass loses a little of its swing for each.
  // What is left of that building then has to stand on what is left of it.
  _smash() {
    const M = this.mass, b = M.body, fx = this.fx, { world, owner } = this.physics;
    const lv = b.linvel(), av = b.angvel(), com = b.translation();
    const hit = new Set();
    const other = (o) => o?.parts && o.state === 'static' && o.building !== M.building;
    for (let n = 0; n < b.numColliders(); n++) {
      const c = b.collider(n);
      // What it overlaps, and — once it is off its hinge and colliding — what
      // it is pressing against.
      world.intersectionsWithShape(c.translation(), c.rotation(), c.shape, (k) => {
        const o = owner.get(k.handle);
        if (other(o)) hit.add(o);
        return hit.size < 60;
      }, undefined, G_LAND);
      // Off its hinge, it crushes the storey it stood on where it lies on it —
      // a roof built for people and furniture, not for a tower lying across
      // it. Below that its own building is whole and carries it, and it slides
      // off. (Crushing all the way down, it sank through the podium to the
      // street.)
      const own = (o) => o?.parts && o.state === 'static' && o.building === M.building && o.floor >= M.floor - 1;
      if (!M.joint) world.contactPairsWith(c, (k) => { const o = owner.get(k.handle); if ((other(o) || own(o)) && hit.size < 60) hit.add(o); });
      if (hit.size >= 60) break;
    }
    if (!hit.size) return 0;
    let tonnes = 0;
    for (const p of hit) {
      const c = p.box.getCenter(new THREE.Vector3());
      const r = _t.set(c.x - com.x, c.y - com.y, c.z - com.z);
      const v = new THREE.Vector3(lv.x + av.y * r.z - av.z * r.y, lv.y + av.z * r.x - av.x * r.z, lv.z + av.x * r.y - av.y * r.x)
        .multiplyScalar(0.6).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5));
      tonnes += p.volume * p.kind.density / 1000;
      if (Math.random() < 0.08) fx.cloud?.(c.clone(), 1.4);
      const support = p.role === 'column' || p.role === 'core';
      fx.rubble.add(p, v, new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2));
      // A column or wall smashed away is a support lost, and what is left of
      // that building has to carry its share — or go too.
      if (support) fx.structure?.failed(p);
    }
    // Momentum into what it hit, and a note of which way.
    const hitBuilding = [...hit].find((p) => p.building !== M.building)?.building;
    if (hitBuilding) this.blows.set(hitBuilding, { dir: M.dir.clone(), t: this.time });
    const k = Math.max(0.85, 1 - (tonnes * 1000) / M.mass * 2);
    b.setLinvel({ x: lv.x * k, y: lv.y * k, z: lv.z * k }, true);
    b.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true);
    fx.structure?.mark();
    fx.audio?.rumble(1);
    fx.shake?.add(0.3);
    return hit.size;
  }

  // It has come to rest leaning on another building. Its weight is on that
  // building's side now, and the columns and walls under where it leans —
  // every storey of them, down to the street — were never built to carry a
  // tower. They give way, and that building's own collapse takes it from
  // there, away from the push (see `blows`).
  _overload() {
    const M = this.mass, b = M.body, { world, owner } = this.physics;
    const zone = new THREE.Box3();
    let building = null;
    for (let n = 0; n < b.numColliders(); n++) {
      world.contactPairsWith(b.collider(n), (k) => {
        const o = owner.get(k.handle);
        if (o?.parts && o.state === 'static' && o.building !== M.building) { zone.union(o.box); building = o.building; }
      });
    }
    if (!building) return;
    zone.expandByVector(new THREE.Vector3(3, 0, 3));
    zone.min.y = -1;
    const damage = this.fx.structure?.fx.damage;
    const c = new THREE.Vector3();
    for (const p of this.pieces.list) {
      if (p.state !== 'static' || p.building !== building || (p.role !== 'column' && p.role !== 'core')) continue;
      p.box.getCenter(c);
      if (!zone.containsPoint(c)) continue;
      damage?.failSoon(p, c.clone(), M.dir.clone());
    }
    this.blows.set(building, { dir: M.dir.clone(), t: this.time });
  }

  // Everything of the mass that has swung below the street is ground off:
  // rubble where it is, going the way that part of the mass was going.
  _grind(mat) {
    const M = this.mass, b = M.body, fx = this.fx;
    const lv = b.linvel(), av = b.angvel(), com = b.translation();
    let n = 0;
    for (const rd of M.riders) {
      const p = rd.p;
      if (p.state !== 'tipping') continue;
      const c = _v.copy(rd.c0).applyMatrix4(mat);
      if (c.y - rd.r * 0.5 > M.under.at(c.x, c.z) + 0.3) continue;
      rd.m.multiplyMatrices(mat, rd.m0).decompose(p.pos, p.quat, _s);
      _s.set(1, 1, 1);
      if (p.object) { p.object.matrixAutoUpdate = true; p.object.position.copy(p.pos); p.object.quaternion.copy(p.quat); }
      this.pieces._updateBox(p);
      const r = _t.set(c.x - com.x, c.y - com.y, c.z - com.z);
      const v = new THREE.Vector3(lv.x + av.y * r.z - av.z * r.y, 0, lv.z + av.x * r.y - av.y * r.x).multiplyScalar(0.4).setY(0.5);
      p.state = 'static';
      fx.rubble.add(p, v, new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)));
      if (Math.random() < 0.04) fx.cloud?.(new THREE.Vector3(c.x, 0.5, c.z), 1.6);
      if (++n >= CRUSH_PER_FRAME) break;
    }
    if (n) { fx.audio?.rumble(Math.min(1, 0.4 + n / 100)); fx.shake?.add(Math.min(0.3, n / 300)); }
  }

  _release() {
    const M = this.mass;
    if (M?.joint) { this.physics.world.removeImpulseJoint(M.joint, true); M.joint = null; }
  }

  update(dt) {
    this.time += dt;
    const M = this.mass;
    if (!M) return;
    M.t += dt;
    const b = M.body;
    const t = b.translation(), r = b.rotation();
    _m.compose(_t.set(t.x, t.y, t.z), _q.set(r.x, r.y, r.z, r.w), _s);
    if (M.joint) this._grind(_m);
    this._smash();
    for (const rd of M.riders) {
      const p = rd.p;
      if (p.state !== 'tipping') continue;
      const mat = rd.m.multiplyMatrices(_m, rd.m0);
      if (p.object) {
        p.object.matrixAutoUpdate = false;
        p.object.matrix.copy(mat);
        p.object.matrixWorldNeedsUpdate = true;
      } else {
        this.pieces.drawAt(p, mat);
      }
    }
    // The columns it pivots on take the whole weight on one edge, and once the
    // lean is real they snap and it goes.
    if (M.hinge && 2 * Math.acos(Math.min(1, Math.abs(r.w))) > HINGE_SNAP) {
      this._release();
      this._unhinge();
      for (const p of M.hinge) if (p.state === 'static') { this.fx.cloud?.(p.box.getCenter(_v).clone(), 1.5); this.fx.rubble.add(p, M.dir.clone().multiplyScalar(2)); }
      M.hinge = null;
      this.fx.audio?.rumble(1);
      this.fx.shake?.add(0.4);
    }
    // What is it touching, and how hard?
    const lv = b.linvel(), av = b.angvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z) + Math.hypot(av.x, av.y, av.z) * 12;
    let ground = false;
    for (let n = 0; n < b.numColliders(); n++) {
      this.physics.world.contactPairsWith(b.collider(n), (other) => {
        const o = this.physics.owner.get(other.handle);
        if (this.physics.ground.has(other.handle) || o?.role === 'city') ground = true;
      });
    }
    this.fx.shake?.add(Math.min(0.05, speed * 0.004));
    if (M.t > 0.4 && ground && speed > BREAK_SPEED) return this._break(speed);
    // Came to rest without breaking — leaning on a neighbour, say — it still
    // comes apart. A dozen storeys of rubble that has lost its footing is not
    // a building that can lean; left standing there it was four thousand
    // pieces supported by links to where they used to be.
    if (b.isSleeping() || speed < 0.2) M.still += dt; else M.still = 0;
    if (M.still > 1.2 || M.t > 25) {
      this._overload();
      return this._break(speed, 'rest');
    }
  }

  // Put every rider where the body has carried it.
  _place() {
    const P = this.pieces;
    for (const rd of this.mass.riders) {
      const p = rd.p;
      if (p.state !== 'tipping') continue;         // gone, or ground off already
      rd.m.decompose(p.pos, p.quat, _s);
      p.placed = (p.placed ?? 0) + 1;
      _s.set(1, 1, 1);
      if (p.object) {
        p.object.matrixAutoUpdate = true;
        p.object.position.copy(p.pos);
        p.object.quaternion.copy(p.quat);
      }
      P._updateBox(p);
    }
  }

  // It hit hard (or came to rest with nothing that could hold it): it comes
  // apart where it is. Nothing is added — no scatter, no burst. Each piece
  // carries on exactly as the mass was carrying it at that point, turning as
  // it turned, so the end that hit stops on the street and the rest comes
  // down along it as it swings. Pushed apart at random, with an explosion's
  // sound, the tower looked as if it had blown up in mid-air.
  _break(speed, why = 'impact') {
    const P = this.pieces, fx = this.fx;
    const M = this.mass;
    this._place();
    const b = M.body;
    this._release();
    const lv = b.linvel(), av = b.angvel(), com = b.translation();
    const vAt = (p) => {
      const r = _v.set(p.pos.x - com.x, p.pos.y - com.y, p.pos.z - com.z);
      return new THREE.Vector3(lv.x + av.y * r.z - av.z * r.y, lv.y + av.z * r.x - av.x * r.z, lv.z + av.x * r.y - av.y * r.x);
    };
    this.physics.world.removeRigidBody(b);
    this.mass = null;
    const riders = M.riders.map((r) => r.p).filter((p) => p.state === 'tipping');
    this.lastBreak = { why, speed: +speed.toFixed(1), t: +M.t.toFixed(2) };
    const spin = new THREE.Vector3(av.x, av.y, av.z);
    for (const p of riders) fx.rubble.add(p, vAt(p), spin.clone());
    // Dust along where it came down.
    const low = riders.filter((p) => p.box.min.y < 3).slice(0, 400);
    for (let i = 0; i < 14 && low.length; i++) {
      const p = low[(Math.random() * low.length) | 0];
      fx.cloud?.(p.box.getCenter(new THREE.Vector3()).setY(0.5), 2.5);
    }
    fx.audio?.impact(com.x, 1, com.z, 1);
    fx.quake?.(new THREE.Vector3(com.x, com.y, com.z), M.mass);
    fx.audio?.rumble(1);
    fx.shake?.add(1);
    fx.structure?.mark();
  }

  clear() {
    this.blows.clear();
    this._release();
    if (this.mass) this.physics.world.removeRigidBody(this.mass.body);
    this.mass = null;
  }
}
