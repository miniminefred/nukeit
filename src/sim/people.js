import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G_LAND } from '../physics.js';
import { INSTANCE_DEPTH } from '../render/materials.js';
import { places } from '../building/shops.js';
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
const PER = { leg: 2, arm: 2, hand: 2, shoe: 2, shin: 2 };    // of each part a figure has; one of the rest
const STREET = 26;
const MAX_PEOPLE = 420;           // the instanced meshes are made for this many
const CIVILIANS = 330;            // at most this many in the building and on the street;
                                  // the rest of the room is for guards and police. Past what
                                  // the meshes hold, the overflowing parts are not drawn at
                                  // all — the figures came apart into floating eyes.
const MARKS = 120;

// A cartoon "!" in a white bubble.
function bang() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(32, 30, 24, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#d8402a'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 32, 32);
  return new THREE.CanvasTexture(c);
}           // the instanced meshes are made for this many                // people on the avenue's pavements
const PAVEMENTS = [21.5, 46.5];   // z down the middle of our pavement and the far one

const SKIN = [0xf1d3bd, 0xe2b594, 0xc98f6a, 0x9c6a4a, 0x6e4a33];
const HAIR = [0x1d1612, 0x3b2a1e, 0x6e4b2e, 0xb08a52, 0xd9c7a2, 0x8a8a8a];
const SUIT = [0x1a1c22, 0x23262e, 0x2b2f3a, 0x3a3226, 0x111111, 0x4a4f5a];
const DRESS = [0x7a1420, 0xe8e2d8, 0x101014, 0x2b3f6a, 0xb8962e, 0x5a2a4a];
const SHIRT = [0xf2f0ea, 0xdfe6ee, 0xe8dcc8];
const SHOES = [0x111111, 0x2a1c12, 0x3a2a1e, 0x1a1a22, 0x6a2a20];

// Where people are, by floor: how many, and whether they dress for it.
const CROWD = { [-1]: 4, 0: 16, 1: 12, 2: 10, 3: 14, 4: 12, 5: 6, 6: 5, 7: 5, 8: 5, 9: 5, 10: 2, 11: 2, 12: 2, 13: 2, 14: 2, 15: 2, 16: 2 };

const _n = new THREE.Matrix4(), _o = new THREE.Matrix4();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

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
    // Hands at the ends of the arms, shoes at the ends of the legs, eyes, long
    // hair down the back for some, and a peaked cap for guards and officers.
    hand: new THREE.SphereGeometry(0.052, 8, 6).scale(0.9, 1.15, 0.7),
    // Sitting, the leg is a thigh and a shin: the leg's shape at half length, twice.
    shin: rb(0.16, 0.88, 0.17).translate(0, -0.44, 0),
    shoe: rb(0.11, 0.26, 0.09).rotateX(Math.PI / 2).translate(0, 0.02, 0.05),
    eyes: mergeGeometries([new THREE.SphereGeometry(0.017, 6, 4).translate(-0.042, 0, 0), new THREE.SphereGeometry(0.017, 6, 4).translate(0.042, 0, 0)]),
    long: rb(0.24, 0.34, 0.1).translate(0, -0.12, 0),
    cap: mergeGeometries([new THREE.CylinderGeometry(0.125, 0.13, 0.09, 14).translate(0, 0.03, 0), new THREE.CylinderGeometry(0.1, 0.1, 0.012, 12, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.9).translate(0, -0.01, 0.1)]),
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
      const m = new THREE.InstancedMesh(geo, material, MAX_PEOPLE * per);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      m.customDepthMaterial = INSTANCE_DEPTH;     // see render/materials.js
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    this.mesh = {
      leg: make(g.leg, mat(0.8), 2), hips: make(g.hips, mat(0.8), 1), body: make(g.body, mat(0.7), 1),
      arm: make(g.arm, mat(0.7), 2), head: make(g.head, mat(0.6), 1), hair: make(g.hair, mat(0.9), 1),
      skirt: make(g.skirt, new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide }), 1),
      hand: make(g.hand, mat(0.6), 2), shin: make(g.shin, mat(0.8), 2), shoe: make(g.shoe, mat(0.4), 2), eyes: make(g.eyes, mat(0.3), 1),
      long: make(g.long, mat(0.9), 1), cap: make(g.cap, mat(0.6), 1),
    };
    this._ray = new physics.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    // The "!" marks, one quad each, turned to face you.
    this.marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bang(), transparent: true, depthWrite: false }), MARKS);
    this.marks.count = 0;
    this.marks.frustumCulled = false;
    scene.add(this.marks);
    this.fear = 0;
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
    // And people on the pavements of the avenue, both sides, walking by.
    for (let i = 0; i < STREET; i++) this._spawn(0, true);
    // And in the shops: staff at their posts, customers queuing, looking at
    // the shelves, sitting at the café tables.
    const want = { staff: 1, queue: 0.6, browse: 0.5, seat: 0.45 };
    for (const pl of places.list) {
      if (Math.random() > want[pl.kind] || this.list.length >= CIVILIANS) continue;
      const p = this._spawn(0, false, new THREE.Vector3(pl.x, pl.y, pl.z));
      if (!p) continue;
      p.agent = true; p.yaw = pl.yaw; p.sitting = pl.kind === 'seat'; p.post = pl.kind;
      p.seatY = pl.y + 0.47;
      if (pl.kind === 'staff') Object.assign(p.colours, { body: 0x1a1a1a, arm: 0x1a1a1a, hips: 0x2a2a2a, leg: 0x2a2a2a, skirt: 0x2a2a2a });
      this._paint(this.list.length - 1);
    }
    const n = this.list.length;
    for (const k in this.mesh) this.mesh[k].count = n * (PER[k] ?? 1);
    this._draw(0);
  }

  _spawn(f, street = false, fixed = null) {
    const side = Math.random() < 0.5 ? 0 : 1;
    const at = fixed ?? (street ? new THREE.Vector3(-110 + Math.random() * 220, 0.003, PAVEMENTS[side] + (Math.random() - 0.5) * 4) : this._spot(f));
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
        hand: skin, shoe: pick(SHOES), eyes: 0x1c1a18, cap: 0x111111,
      },
      shirt: pick(SHIRT), woman,
      street, dir: Math.random() < 0.5 ? 1 : -1, side,
      long: woman && Math.random() < 0.6,
    };
    p.colours.long = p.colours.hair;
    p.colours.shin = p.colours.leg;
    if (!woman) p.colours.hips = p.colours.leg;          // one pair of trousers
    // Suits have a white shirt at the collar: the body's colour is the jacket.
    this.list.push(p);
    this._paint(this.list.length - 1);
    return p;
  }

  _paint(i) {
    const p = this.list[i];
    for (const k in this.mesh) {
      const per = PER[k] ?? 1;
      for (let j = 0; j < per; j++) this.mesh[k].setColorAt(i * per + j, _c.set(p.colours[k] ?? 0x222222));
    }
  }

  // A figure steered from outside — a guard, a police officer (sim/security.js).
  // Drawn like everyone else; it falls when its floor goes, and otherwise goes
  // where it is told: `target`, `speed`, `state` ('calm' | 'running' | 'down').
  agent(f, at, colours, height = 1) {
    // A figure that has gone frees its slot for a new one.
    let i = this.list.findIndex((q) => q.state === 'gone');
    if (i < 0 && this.list.length >= MAX_PEOPLE) i = this.list.findIndex((q) => !q.agent);
    const p = {
      f, pos: at.clone(), yaw: 0, target: null, wait: 0, phase: 0, speed: WALK, vy: 0, floorY: at.y,
      look: 0, state: 'calm', t: 0, height, shirt: 0xf2f0ea, woman: false, agent: true, armUp: 0, capped: true,
      colours: { ...colours, hand: colours.head, shoe: 0x0c0c0c, eyes: 0x1c1a18, cap: colours.hair, long: colours.hair, shin: colours.leg },
    };
    colours = p.colours;
    if (i < 0) { i = this.list.length; this.list.push(p); } else this.list[i] = p;
    for (const k in this.mesh) {
      const per = PER[k] ?? 1;
      for (let j = 0; j < per; j++) this.mesh[k].setColorAt(i * per + j, _c.set(colours[k] ?? 0x222222));
      this.mesh[k].count = this.list.length * per;
    }
    return p;
  }

  // Someone doing damage at `at`: those near enough stop and stare, some get
  // their phones out to film it, and the close ones back away.
  witness(at) { this._focus = { at: at.clone(), t: 4 }; }

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

  // A sledgehammer swung along `dir` from `origin`: the first person in its
  // way is knocked over — a cartoon fall, stars, then up and running.
  strike(origin, dir, range) {
    for (const p of this.list) {
      if (p.agent || p.hidden || p.state === 'gone' || p.state === 'down' || p.state === 'knocked') continue;
      const c = _v.copy(p.pos).setY(p.pos.y + 1.0 * p.height);
      const along = _w.copy(c).sub(origin).dot(dir);
      if (along < 0 || along > range + 0.4) continue;
      if (_w.copy(c).sub(origin).addScaledVector(dir, -along).length() > 0.55) continue;
      p.state = 'knocked'; p.t = 0; p.target = null; p.sitting = false; p.handsUp = false; p.armUp = 0;
      p.from = origin.clone(); p.yaw = Math.atan2(-dir.x, -dir.z);
      p.pos.addScaledVector(_w.set(dir.x, 0, dir.z).normalize(), 0.6);
      return p;
    }
    return null;
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
      if (p.stairT > 0) {
        p.stairT -= dt;
        if (p.stairT <= 0) { p.hidden = false; p.f = 0; p.pos.set(-3.3 + Math.random() * 0.6, 0.3, 4.6); p.floorY = 0.3; p.wait = 0; }
        continue;
      }
      for (const a of alarms) {
        const d = p.pos.distanceTo(a.at);
        if (d < a.r && p.state !== 'down' && p.state !== 'knocked') {
          p.state = 'running';
          p.t = 0;
          p.from = a.at;
          p.target = null;
          p.wait = Math.random() * 0.4;      // a moment's freeze, then run
        }
      }
      if (p.state === 'knocked') {
        if (Math.random() < dt * 6) this.particles?.spawn('spark', p.pos.x + (Math.random() - 0.5) * 0.4, p.pos.y + 0.4, p.pos.z + (Math.random() - 0.5) * 0.4, 0, 0.6, 0, 0xfff27a);
        if (p.t > 2.5) { p.state = 'running'; p.t = 0; p.wait = 0; }
        continue;
      }
      // Someone with a sledgehammer on their floor: they keep six metres off.
      const w = this.wary;
      if (w && p.state === 'calm' && !p.street && !p.agent && Math.abs(p.pos.y - w.y) < 2.5 && (p.shyT = (p.shyT ?? 0) - dt) <= 0) {
        const d = Math.hypot(p.pos.x - w.x, p.pos.z - w.z);
        if (d < 6) {
          p.shyT = 0.6;
          const away = _w.copy(p.pos).sub(w).setY(0).normalize().multiplyScalar(7 - d).add(p.pos);
          const t = this._spot(p.f, away, 1.5);
          if (t) { p.target = t; p.wait = 0; p.sitting = false; p.yaw = Math.atan2(w.x - p.pos.x, w.z - p.pos.z); }
        }
      }
      if (p.agent && p.post && this.fear > 82 && Math.random() < dt * 0.5) { p.agent = false; p.sitting = false; p.state = 'calm'; p.f = Math.round((p.pos.y - 0.3) / 4); }
      if (p.agent) { this._fall(p, dt); continue; }
      if (p.street) { this._pavement(p, dt); continue; }
      if (p.state === 'down') { if (p.t > 6) p.state = 'gone'; continue; }
      // A building in a panic: everyone picks what they do — most make for the
      // exits, some hide, some crowd round the lifts, a few film it.
      if (this.fear > 75 && p.state !== 'down') {
        if (!p.panic) { const r = Math.random(); p.panic = r < 0.55 ? 'exit' : r < 0.7 ? 'hide' : r < 0.85 ? 'lifts' : 'film'; p.target = null; p.wait = Math.random() * 6; }
        if (this._panic(p, dt)) continue;
      } else if (p.panic && this.fear < 50) { p.panic = null; p.hide = false; p.handsUp = false; }
      // Watching you break things: face it, maybe film it, step back if close.
      const fo = this._focus;
      if (fo && p.state === 'calm' && Math.abs(p.pos.y - fo.at.y) < 2.5) {
        const d = Math.hypot(p.pos.x - fo.at.x, p.pos.z - fo.at.z);
        if (d < 12) {
          p.yaw += Math.atan2(Math.sin(Math.atan2(fo.at.x - p.pos.x, fo.at.z - p.pos.z) - p.yaw), Math.cos(Math.atan2(fo.at.x - p.pos.x, fo.at.z - p.pos.z) - p.yaw)) * Math.min(1, dt * 4);
          p.watching = 2;
          p.filming ??= Math.random() < 0.35;
          if (d < 3.5 && !p.target) { p.target = this._spot(p.f, p.pos.clone().sub(fo.at).setY(0).normalize().multiplyScalar(4).add(p.pos), 1); p.wait = 0; }
          else if (!p.target) { p.wait = Math.max(p.wait, 0.5); }
        }
      }
      if (p.watching > 0) { p.watching -= dt; p.armUp = p.filming ? Math.min(1, (p.armUp ?? 0) + dt * 3) : 0; if (p.watching <= 0) p.filming = undefined; }
      else p.armUp = Math.max(0, (p.armUp ?? 0) - dt * 2);
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
      p.handsUp = p.state === 'running' && this.fear > 45;
      const running = p.state === 'running';
      if (p.wait > 0) { p.wait -= dt; continue; }
      if (p.watching > 0 && !p.target) continue;
      if (!p.target) {
        const away = running && p.from ? p.pos.clone().sub(p.from).setY(0).normalize().multiplyScalar(8).add(p.pos) : null;
        const t = this._spot(p.f, away ?? p.pos, running ? 3 : 0);
        if (!t || !this._clear(p.pos, t)) { p.wait = 0.3 + Math.random(); continue; }
        p.target = t;
      }
      const to = _v.copy(p.target).sub(p.pos).setY(0);
      const d = to.length();
      const speed = running ? RUN : p.speed * (this.fear > 30 ? 1.35 : 1);
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
    if (this._focus && (this._focus.t -= dt) <= 0) this._focus = null;
    this._draw(dt);
  }

  // What someone in a panic does. Returns true when it has moved them this frame.
  _panic(p, dt) {
    if (p.wait > 0) { p.wait -= dt; return true; }
    const y = p.pos.y;
    if (p.panic === 'hide') { p.hide = true; p.target = null; return true; }
    if (p.panic === 'film') { p.armUp = 1; p.target = null; if (this._focus) p.yaw = Math.atan2(this._focus.at.x - p.pos.x, this._focus.at.z - p.pos.z); return true; }
    let goal;
    if (p.panic === 'lifts') goal = _w.set(1.2 + (p.phase % 2), y, 4.8 + (p.phase % 1.5));
    else goal = p.f === 0 ? _w.set((p.phase % 3) - 1.5, y, 13.5) : _w.set(-3.3, y, 4.4);   // the front doors; the stair door
    const to = _v.copy(goal).sub(p.pos).setY(0), d = to.length();
    if (d < 0.5) {
      if (p.panic === 'exit') {
        if (p.f !== 0) { p.hidden = true; p.stairT = 2.5 * Math.abs(p.f) + Math.random() * 2; }     // into the stairwell, and down
        else {
          // Out of the front doors: across the avenue to watch from the far pavement.
          p.street = true; p.side = 1; p.watchTower = true; p.panic = null; p.handsUp = false;
          p.pos.set(p.pos.x, 0.003, 14); p.floorY = 0;
          this.evacuated = (this.evacuated ?? 0) + 1;
        }
      }
      else { p.armUp = Math.sin(p.t * 8) > 0 ? 1 : 0.3; p.target = null; }       // pressing the lift button, again and again
      return true;
    }
    p.handsUp = p.panic === 'exit';
    p.state = 'running';
    to.divideScalar(d);
    p.yaw += Math.atan2(Math.sin(Math.atan2(to.x, to.z) - p.yaw), Math.cos(Math.atan2(to.x, to.z) - p.yaw)) * Math.min(1, dt * 8);
    p.pos.addScaledVector(to, Math.min(d, RUN * dt));
    p.phase += dt * RUN * 3.1;
    p.target = p.target ?? new THREE.Vector3();
    p.target.copy(goal);
    return true;
  }

  // Walking along the pavement and back; running from a bang; stopping to stare
  // up, and film, when a building is coming down.
  _pavement(p, dt) {
    if (p.state === 'down') { if (p.t > 6) p.state = 'gone'; return; }
    if (p.watchTower) {
      // Got out: across the avenue to a spot on the far pavement, then turn and
      // watch the tower — some of them filming it.
      p.spot ??= new THREE.Vector3(-14 + Math.random() * 28, 0.003, 44.5 + Math.random() * 3);
      const to = _v.copy(p.spot).sub(p.pos).setY(0), d = to.length();
      if (d > 0.4) {
        to.divideScalar(d);
        p.yaw = Math.atan2(to.x, to.z);
        p.pos.addScaledVector(to, Math.min(d, (d > 6 ? RUN : WALK) * dt));
        p.phase += dt * 6;
        p.target = p.spot;
      } else {
        p.target = null;
        p.yaw = Math.atan2(0 - p.pos.x, 0 - p.pos.z);
        p.filming ??= Math.random() < 0.45;
        p.armUp = p.filming ? 1 : 0;
      }
      return;
    }
    const running = p.state === 'running';
    if (running && p.t > 12) p.state = 'calm';
    if (running && p.from) p.dir = p.pos.x > p.from.x ? 1 : -1;
    // Something big happening up there: stop, look, hold the phone up.
    if (!running && this.spectacle && p.pos.distanceTo(this.spectacle) < 140) {
      p.yaw = Math.atan2(this.spectacle.x - p.pos.x, this.spectacle.z - p.pos.z);
      p.target = null;
      p.filming ??= Math.random() < 0.5;
      p.armUp = p.filming ? Math.min(1, (p.armUp ?? 0) + dt * 2) : 0;
      return;
    }
    p.armUp = Math.max(0, (p.armUp ?? 0) - dt * 2);
    const speed = running ? RUN : p.speed;
    const z = PAVEMENTS[p.side] + Math.sin(p.phase * 0.05 + p.side) * 1.2;
    p.target = _w.set(p.pos.x + p.dir * 10, p.pos.y, z);
    const to = _v.copy(p.target).sub(p.pos).setY(0), d = to.length();
    to.divideScalar(d);
    p.yaw += Math.atan2(Math.sin(Math.atan2(to.x, to.z) - p.yaw), Math.cos(Math.atan2(to.x, to.z) - p.yaw)) * Math.min(1, dt * 6);
    p.pos.addScaledVector(to, speed * dt);
    p.phase += dt * speed * 3.1;
    if (Math.abs(p.pos.x) > 115) { p.pos.x = -Math.sign(p.pos.x) * 112; p.state = 'calm'; }
  }

  // An agent stands on what is under it and falls when that goes; it walks
  // where security sends it.
  _fall(p, dt) {
    if (p.state === 'gone' || p.hidden) return;
    p.look -= dt;
    if (p.look <= 0) { p.look = LOOK; p.floorY = this._under(p.pos.x, p.pos.z, p.pos.y + 1.2); }
    // Sitting: on the seat (a ray finds the chair's back, not its seat) until
    // the floor under the chair goes.
    if (p.sitting && p.floorY > p.seatY - 0.7 && p.state !== 'down') { p.pos.y = p.seatY; p.vy = 0; return; }
    if (p.sitting) p.sitting = false;
    if (p.pos.y > p.floorY + 0.05) {
      p.vy -= G * dt;
      p.pos.y += p.vy * dt;
      if (p.pos.y <= p.floorY) { p.pos.y = p.floorY; p.vy = 0; }
      return;
    }
    p.pos.y = p.floorY;
    if (p.target && p.state !== 'down') {
      const to = _v.copy(p.target).sub(p.pos).setY(0), d = to.length();
      if (d < 0.25) { p.target = null; return; }
      to.divideScalar(d);
      const want = Math.atan2(to.x, to.z);
      let dy = want - p.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.yaw += dy * Math.min(1, dt * 8);
      p.pos.addScaledVector(to, Math.min(d, p.speed * dt));
      p.phase += dt * p.speed * 3.1;
    }
  }

  _draw() {
    const M = this.mesh;
    let marks = 0;
    const set = (mesh, i, m) => mesh.setMatrixAt(i, m);
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      if (p.state === 'gone' || p.hidden) {
        for (const k in M) { const per = PER[k] ?? 1; for (let j = 0; j < per; j++) set(M[k], i * per + j, hide); }
        continue;
      }
      const s = p.height;
      const moving = !!p.target && p.wait <= 0 && p.state !== 'down' && p.state !== 'knocked';
      const swing = moving ? Math.sin(p.phase) * (p.state === 'running' ? 0.75 : 0.4) : 0;
      // Lying: the whole figure turned onto its back.
      const lying = p.state === 'down' || p.state === 'knocked';
      // Hiding: crouched down small behind whatever is nearest.
      const root = new THREE.Matrix4().compose(p.pos, _q.setFromEuler(_e.set(lying ? -Math.PI / 2 : 0, p.yaw, 0, 'YXZ')), _s.set(s, p.hide ? s * 0.6 : s, s));
      // A "!" over the head of anyone frightened: cartoon fright, not real.
      if (marks < MARKS && (p.handsUp || (p.panic && p.panic !== 'film')) && this.camera) {
        _m.compose(_v.set(p.pos.x, p.pos.y + (p.hide ? 1.3 : 2.05), p.pos.z), this.camera.quaternion, _s.set(0.28, 0.28, 0.28));
        this.marks.setMatrixAt(marks++, _m);
      }
      const sit = p.sitting && p.state !== 'down' && p.state !== 'running';
      const lean = p.state === 'running' ? 0.18 : sit ? -0.05 : 0;
      // Sitting: the root is the seat (the floor under them is the chair), the
      // hips just on it, the legs down to the floor in front, hands on the table.
      const hip = sit ? 0.08 : 0.9;
      const part = (mesh, i, x, y, z, rx, rz = 0, sy = 1) => {
        _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, 0, rz)), _s.set(1, sy, 1));
        set(mesh, i, _m.premultiply(root));
        return _m;
      };
      // Something at the end of a limb: in the limb's frame.
      const end = (mesh, i, limb, y, z = 0) => set(mesh, i, _n.copy(limb).multiply(_o.makeTranslation(0, y, z)));
      if (sit) {
        // Thighs forward along the seat, shins down to the floor, feet on it.
        for (const [k, x] of [[0, -0.1], [1, 0.1]]) {
          part(M.leg, i * 2 + k, x, hip, 0, -Math.PI / 2, 0, 0.5);
          end(M.shoe, i * 2 + k, part(M.shin, i * 2 + k, x, hip, 0.44, 0, 0, 0.55), -0.88);
        }
      } else {
        end(M.shoe, i * 2, part(M.leg, i * 2, -0.1, hip, 0, swing), -0.88);
        end(M.shoe, i * 2 + 1, part(M.leg, i * 2 + 1, 0.1, hip, 0, -swing), -0.88);
        set(M.shin, i * 2, hide); set(M.shin, i * 2 + 1, hide);
      }
      part(M.hips, i, 0, hip, 0, 0);
      part(M.body, i, 0, hip + 0.06, 0, lean);
      const rest = sit ? -0.9 : 0;
      const both = p.handsUp ? -2.7 : 0;
      end(M.hand, i * 2, part(M.arm, i * 2, -0.25, hip + 0.6, lean * 0.5, p.handsUp ? both + swing * 0.2 : -swing * 0.8 + rest, 0.06), -0.68);
      // The right arm raised — pointing, shouting into a radio, filming on a phone.
      const up = p.armUp ?? 0;
      end(M.hand, i * 2 + 1, part(M.arm, i * 2 + 1, 0.25, hip + 0.6, lean * 0.5, p.handsUp ? both - swing * 0.2 : (swing * 0.8 + rest) * (1 - up) - 1.9 * up, -0.06), -0.68);
      part(M.head, i, 0, hip + 0.83, lean * 0.4, 0);
      part(M.eyes, i, 0, hip + 0.85, lean * 0.4 + 0.112, 0);
      if (p.capped) { part(M.cap, i, 0, hip + 0.93, lean * 0.4, -0.05); set(M.hair, i, hide); }
      else { part(M.hair, i, 0, hip + 0.86, lean * 0.4 - 0.01, -0.15); set(M.cap, i, hide); }
      if (p.long) part(M.long, i, 0, hip + 0.8, lean * 0.4 - 0.09, 0.05); else set(M.long, i, hide);
      if (p.woman) part(M.skirt, i, 0, hip + 0.12, 0, swing * 0.15);
      else set(M.skirt, i, hide);
    }
    for (const k in M) { M[k].instanceMatrix.needsUpdate = true; if (M[k].instanceColor) M[k].instanceColor.needsUpdate = true; }
    this.marks.count = marks;
    this.marks.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.list.length = 0;
    this._alarm.length = 0;
    for (const k in this.mesh) this.mesh[k].count = 0;
  }
}
