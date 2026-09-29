import * as THREE from 'three';
import { G_LAND } from '../physics.js';
import { T, PODIUM_FLOORS, podiumFront, OUTLINE, inPoly, inCore, inAtrium, TOWER_COLUMNS, PODIUM_COLUMNS, clearOf } from '../building/plan.js';

// The people in the building: shoppers in the boutiques and among the
// jewellers' cases, diners at the Grill, a few in the offices, the family in
// the penthouse. They walk from one spot on their floor to another, stop,
// look about, walk on. They stand on whatever floor is really under them, and
// when that goes, they go with it.
//
// They hear things. A blast, a collapse, a column giving way nearby: they run
// — away from it, fast. Caught in the dust they slow and stumble. Knocked off
// their feet by a fall they lie still, and a while later they are gone
// (nothing here is shown that would not be shown on the evening news).
//
// Each figure is a few rounded parts — legs, hips, body, arms, head, hair —
// drawn as one InstancedMesh per part, so a hundred people are a dozen draw
// calls. Walking is the parts swung about hip and shoulder every frame.

const WALK = 1.25, RUN = 3.8;
const LOOK = 0.25;                // s between looks at what is under someone
const G = 9.81;
const HEAR = 26;                  // m: a blast this close sends people running
const STEPS = 4;                  // m: how far ahead they check the way is clear

const SKIN = [0xf1d3bd, 0xe2b594, 0xc98f6a, 0x9c6a4a, 0x6e4a33];
const HAIR = [0x1d1612, 0x3b2a1e, 0x6e4b2e, 0xb08a52, 0xd9c7a2, 0x8a8a8a];
const SUIT = [0x1a1c22, 0x23262e, 0x2b2f3a, 0x3a3226, 0x111111, 0x4a4f5a];
const DRESS = [0x7a1420, 0xe8e2d8, 0x101014, 0x2b3f6a, 0xb8962e, 0x5a2a4a];
const SHIRT = [0xf2f0ea, 0xdfe6ee, 0xe8dcc8];

// Where people are, by floor: how many, and whether they dress for it.
const CROWD = { [-1]: 4, 0: 16, 1: 12, 2: 10, 3: 14, 4: 12, 5: 6, 6: 5, 7: 5, 8: 6, 9: 4, 10: 2, 11: 2 };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

// A part, in the figure's frame: which bone it hangs from, where, and its shape.
function parts() {
  const rb = (w, h, d, r) => new THREE.CapsuleGeometry(Math.min(w, d) / 2, Math.max(0.01, h - Math.min(w, d)), 4, 8).scale(w / Math.min(w, d), 1, d / Math.min(w, d));
  return {
    leg: rb(0.16, 0.88, 0.17).translate(0, -0.44, 0),          // hangs from the hip
    hips: rb(0.38, 0.26, 0.24).translate(0, 0, 0),
    body: rb(0.46, 0.62, 0.27).translate(0, 0.31, 0),          // from the waist up
    arm: rb(0.115, 0.66, 0.12).translate(0, -0.33, 0),         // hangs from the shoulder
    head: new THREE.SphereGeometry(0.12, 12, 10).scale(1, 1.15, 1.05),
    hair: new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.1, 1.08),
    // A dress's skirt, waist to knee.
    skirt: new THREE.CylinderGeometry(0.2, 0.33, 0.62, 14, 1, true).translate(0, -0.31, 0),
  };
}

export class People {
  constructor(scene, physics) {
    this.physics = physics;
    this.list = [];
    const g = parts();
    const mat = (rough) => new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0 });
    // leg x2, arm x2 per person: sized for 2 per person.
    const make = (geo, material, per) => {
      const m = new THREE.InstancedMesh(geo, material, 160 * per);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    this.mesh = {
      leg: make(g.leg, mat(0.8), 2), hips: make(g.hips, mat(0.8), 1), body: make(g.body, mat(0.7), 1),
      arm: make(g.arm, mat(0.7), 2), head: make(g.head, mat(0.6), 1), hair: make(g.hair, mat(0.9), 1),
      skirt: make(g.skirt, new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide }), 1),
    };
    this._ray = new physics.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this._alarm = [];            // { at, r, t }: things that went bang
  }

  // Fill the building. Called once the pieces are standing.
  populate(pieces) {
    this.clear();
    this.pieces = pieces;
    // New colliders are not in Rapier's query tree until it steps, and people
    // are placed by looking at the floors.
    this.physics.world.step(this.physics.events);
    for (const [f, n] of Object.entries(CROWD)) for (let i = 0; i < n; i++) this._spawn(+f);
    const n = this.list.length;
    for (const k in this.mesh) this.mesh[k].count = n * (k === 'leg' || k === 'arm' ? 2 : 1);
    this._draw(0);
  }

  _spawn(f) {
    const at = this._spot(f);
    if (!at) return;
    const woman = Math.random() < 0.5;
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const skin = pick(SKIN);
    const dress = pick(DRESS);
    const p = {
      f, pos: at.clone(), yaw: Math.random() * Math.PI * 2, target: null, wait: Math.random() * 3,
      phase: Math.random() * 10, speed: WALK * (0.85 + Math.random() * 0.3), vy: 0, floorY: at.y,
      look: Math.random() * LOOK, state: 'calm', t: 0, height: (woman ? 0.94 : 1) * (0.95 + Math.random() * 0.1),
      colours: {
        leg: woman ? skin : pick(SUIT), hips: woman ? dress : pick(SUIT), body: woman ? dress : pick(SUIT), skirt: dress,
        arm: woman ? skin : pick(SUIT), head: skin, hair: pick(HAIR),
      },
      shirt: pick(SHIRT), woman,
    };
    // Suits have a white shirt at the collar: the body's colour is the jacket.
    const i = this.list.length;
    this.list.push(p);
    for (const k in this.mesh) {
      const per = k === 'leg' || k === 'arm' ? 2 : 1;
      for (let j = 0; j < per; j++) this.mesh[k].setColorAt(i * per + j, _c.set(p.colours[k]));
    }
  }

  // A free spot on floor f: inside the building, clear of columns, the core,
  // the atrium, and anything standing there.
  _spot(f, near = null, far = 0) {
    const y = T(f);
    for (let tries = 0; tries < 30; tries++) {
      let x, z;
      if (near) {
        const a = Math.random() * Math.PI * 2, d = far > 0 ? far + Math.random() * far : 2 + Math.random() * 7;
        x = near.x + Math.cos(a) * d; z = near.z + Math.sin(a) * d;
      } else if (f < PODIUM_FLOORS) { x = -19 + Math.random() * 38; z = -11 + Math.random() * (podiumFront(f) - 11.5 + 11); }
      else { x = -13 + Math.random() * 22; z = -8.5 + Math.random() * 15; }
      if (!this._inside(f, x, z)) continue;
      // Clear of whatever stands there: nothing between the floor and head height.
      const top = this._under(x, z, y + 1.8);
      if (Math.abs(top - y) > 0.25) continue;
      return new THREE.Vector3(x, top, z);
    }
    return null;
  }

  _inside(f, x, z) {
    if (inCore(x, z, 0.6)) return false;
    if (f < PODIUM_FLOORS) {
      if (x < -19.3 || x > 19.3 || z < -11.3 || z > podiumFront(f) - 0.7) return false;
      if (f > 0 && inAtrium(x, z, 0.5)) return false;
      return clearOf(PODIUM_COLUMNS(f), x, z, 0.8);
    }
    return inPoly(OUTLINE, x, z) && clearOf(TOWER_COLUMNS, x, z, 0.8);
  }

  // The top of what is under (x, z), looking down from y.
  _under(x, z, y) {
    const r = this._ray;
    r.origin.x = x; r.origin.y = y; r.origin.z = z;
    const hit = this.physics.world.castRay(r, y + 5, true, this.physics.R.QueryFilterFlags.EXCLUDE_DYNAMIC, G_LAND);
    return hit ? y - hit.timeOfImpact : -5;
  }

  // Is the way from a to b clear at knee and chest height?
  _clear(a, b) {
    const d = _v.copy(b).sub(a).setY(0);
    const len = d.length();
    if (len < 0.01) return true;
    d.divideScalar(len);
    for (const h of [0.45, 1.3]) {
      const hit = this.physics.raycast(new THREE.Vector3(a.x, a.y + h, a.z), d, len + 0.3);
      if (hit) return false;
    }
    return true;
  }

  // How many are about `at`, and at ease: 0..1, for the murmur of a crowd.
  crowdAt(at, r = 14) {
    let n = 0;
    for (const p of this.list) if (p.state === 'calm' && Math.abs(p.pos.y - at.y) < 3 && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < r) n++;
    return Math.min(1, n / 8);
  }

  // Something went bang at `at`: everyone within earshot runs.
  alarm(at, r = HEAR) { this._alarm.push({ at: at.clone(), r }); }

  update(dt) {
    if (!this.list.length) return;
    const alarms = this._alarm;
    this._alarm = [];
    for (const p of this.list) {
      if (p.state === 'gone') continue;
      p.t += dt;
      for (const a of alarms) {
        const d = p.pos.distanceTo(a.at);
        if (d < a.r && p.state !== 'down') {
          p.state = 'running';
          p.t = 0;
          p.from = a.at;
          p.target = null;
          p.wait = Math.random() * 0.4;      // a moment's freeze, then run
        }
      }
      if (p.state === 'down') { if (p.t > 6) p.state = 'gone'; continue; }
      // What is under them, now and then.
      p.look -= dt;
      if (p.look <= 0) {
        p.look = LOOK;
        p.floorY = this._under(p.pos.x, p.pos.z, p.pos.y + 1.2);
      }
      // Falling: the floor has gone.
      if (p.pos.y > p.floorY + 0.05) {
        p.vy -= G * dt;
        p.pos.y += p.vy * dt;
        if (p.pos.y <= p.floorY) {
          const hard = p.vy < -7;
          p.pos.y = p.floorY; p.vy = 0;
          if (hard) { p.state = 'down'; p.t = 0; }
        }
        continue;
      }
      p.pos.y = p.floorY;
      if (p.state === 'running' && p.t > 14) { p.state = 'calm'; p.speed = WALK; }
      const running = p.state === 'running';
      if (p.wait > 0) { p.wait -= dt; continue; }
      if (!p.target) {
        const away = running && p.from ? p.pos.clone().sub(p.from).setY(0).normalize().multiplyScalar(8).add(p.pos) : null;
        const t = this._spot(p.f, away ?? p.pos, running ? 3 : 0);
        if (!t || !this._clear(p.pos, t)) { p.wait = 0.3 + Math.random(); continue; }
        p.target = t;
      }
      const to = _v.copy(p.target).sub(p.pos).setY(0);
      const d = to.length();
      const speed = running ? RUN : p.speed;
      if (d < 0.2) { p.target = null; p.wait = running ? 0 : 1.5 + Math.random() * 5; continue; }
      to.divideScalar(d);
      // Turn toward where they are going, then walk.
      const want = Math.atan2(to.x, to.z);
      let dy = want - p.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.yaw += dy * Math.min(1, dt * 6);
      p.pos.addScaledVector(to, Math.min(d, speed * dt));
      p.phase += dt * speed * 3.1;
    }
    this._draw(dt);
  }

  _draw() {
    const M = this.mesh;
    const set = (mesh, i, m) => mesh.setMatrixAt(i, m);
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      if (p.state === 'gone') {
        for (const k in M) { const per = k === 'leg' || k === 'arm' ? 2 : 1; for (let j = 0; j < per; j++) set(M[k], i * per + j, hide); }
        continue;
      }
      const s = p.height;
      const moving = !!p.target && p.wait <= 0;
      const swing = moving ? Math.sin(p.phase) * (p.state === 'running' ? 0.75 : 0.4) : 0;
      // Lying: the whole figure turned onto its back.
      const lying = p.state === 'down';
      const root = new THREE.Matrix4().compose(p.pos, _q.setFromEuler(_e.set(lying ? -Math.PI / 2 : 0, p.yaw, 0, 'YXZ')), _s.set(s, s, s));
      const lean = p.state === 'running' ? 0.18 : 0;
      const hip = 0.9;
      const part = (mesh, i, x, y, z, rx, rz = 0) => {
        _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, 0, rz)), _s.set(1, 1, 1));
        set(mesh, i, _m.premultiply(root));
      };
      part(M.leg, i * 2, -0.1, hip, 0, swing);
      part(M.leg, i * 2 + 1, 0.1, hip, 0, -swing);
      part(M.hips, i, 0, hip, 0, 0);
      part(M.body, i, 0, hip + 0.06, 0, lean);
      part(M.arm, i * 2, -0.25, hip + 0.6, lean * 0.5, -swing * 0.8, 0.06);
      part(M.arm, i * 2 + 1, 0.25, hip + 0.6, lean * 0.5, swing * 0.8, -0.06);
      part(M.head, i, 0, hip + 0.83, lean * 0.4, 0);
      part(M.hair, i, 0, hip + 0.86, lean * 0.4 - 0.01, -0.15);
      if (p.woman) part(M.skirt, i, 0, hip + 0.12, 0, swing * 0.15);
      else set(M.skirt, i, hide);
    }
    for (const k in M) { M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; }
  }

  clear() {
    this.list.length = 0;
    this._alarm.length = 0;
    for (const k in this.mesh) this.mesh[k].count = 0;
  }
}
