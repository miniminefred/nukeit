import * as THREE from 'three';
import { T, FLOOR_H, CORE, PODIUM_FLOORS, TOP_FLOOR, LOWER, HQ } from '../building/plan.js';

// Guards, and the police.
//
// The tower has its own security, more of them the harder the job: guards on
// the public floors, the lower level and the Trump Organization's floor. Each
// is a little different (the job's difficulty says what they may carry, and
// each takes one): one only shouts and radios for the police; one chases you
// and tackles you, and you are marched out of the door; one fires a net that
// tangles you; one has a taser that drops you for a moment; on Insane, some
// are armed — a hit costs health, nothing more is shown. They have to see you
// to come for you, and dust, smoke and a workman's vest all help.
//
// Break enough and someone calls the police. After a while — sooner the
// harder the job, sooner if a guard radios in — there are sirens on the
// avenue, and officers come in and search the building floor by floor,
// taking the stairs. If one of them catches you, that is the job over.
//
// It is a children's game: the figures are the same stylised people as the
// shoppers, a tackle is a comic heap, and nobody bleeds.

const SEE = 17;                // m a guard sees you, in clear air, on the same floor
const SEE_DISGUISED = 6;       // m — in a hi-vis vest and a hard hat you look like you belong
const HEAR = 15;               // m a blow is heard
const CATCH = 1.1;             // m
const GUARD_RUN = 4.2, COP_RUN = 4.6, WALK = 1.4;
const HEAVY = 45;              // destruction before someone calls the police
const STAIRS = 3.5;            // s a floor, by the stairs

const GUARD = { leg: 0x1a1f2b, hips: 0x1a1f2b, body: 0x1d2a44, arm: 0x1d2a44, head: 0xe2b594, hair: 0x0f1420, skirt: 0x1a1f2b };
const COP = { leg: 0x101624, hips: 0x101624, body: 0x16213a, arm: 0x16213a, head: 0xc98f6a, hair: 0x0b1020, skirt: 0x101624 };
const SKIN = [0xf1d3bd, 0xe2b594, 0xc98f6a, 0x9c6a4a, 0x6e4a33];

// Where guards stand their shift.
const POSTS = [[0, -8, 8], [0, 8, -4], [LOWER, -14, 4], [1, -10, 0], [2, -6, -9], [HQ, -2, 6], [3, 6, -8], [4, -12, -6], [0, 16, 6]];

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Security {
  constructor(fx) {
    this.fx = fx;                // { people, physics, player, audio, hud, particles, smoke, veil, scene, onBusted, onThrownOut }
    this.agents = [];
    this.level = null;
    this.heat = 0;               // how much has been broken: past HEAVY, the police are called
    this.eta = null;             // s until they come, once called
    this.police = false;         // here
    this.lastBlow = -99;
    this.time = 0;
    this.grace = 0;              // until then, guards leave you be (just thrown out)
    this.cars = [];
  }

  start(level) {
    this.clear();
    this.level = level;
    const { people } = this.fx;
    for (let n = 0; n < level.guards && n < POSTS.length; n++) {
      const [f, x, z] = POSTS[n];
      const at = people._spot(f, new THREE.Vector3(x, T(f), z), 1) ?? people._spot(f);
      if (!at) continue;
      const arm = level.arms[(Math.random() * level.arms.length) | 0];
      const a = people.agent(f, at, { ...GUARD, head: SKIN[(Math.random() * SKIN.length) | 0] }, 0.98 + Math.random() * 0.08);
      Object.assign(a, { kind: 'guard', arm, post: at.clone(), mode: 'patrol', cool: 0, seen: -99, last: null, shout: 0, daze: 0, angry: 0, radioed: false });
      this.agents.push(a);
    }
  }

  // Something broke at `at`. `loud`: how much; `byPlayer`: you did it, where you are.
  noise(at, loud, byPlayer) {
    if (!this.level) return;
    this.heat += loud;
    if (byPlayer) {
      this.lastBlow = this.time;
      this.fx.people.witness(at);
    }
    if (this.level.police !== null && this.eta === null && !this.police && this.heat > HEAVY) {
      this.eta = this.level.police;
      this.fx.hud?.flash('Someone has called the police');
    }
    // Guards who hear it come and look.
    for (const a of this.agents) {
      if (a.state === 'down' || a.hidden || a.mode === 'chase') continue;
      if (Math.abs(a.pos.y - at.y) < 2.5 && a.pos.distanceTo(at) < HEAR * (loud > 5 ? 2 : 1)) { a.mode = 'look'; a.last = at.clone(); }
    }
  }

  // A swing or a jet that might land on a guard or an officer: knocked down,
  // dazed, up again angrier — and more are on their way.
  strike(origin, dir, range, kind = 'sledge') {
    for (const a of this.agents) {
      if (a.state === 'down' || a.hidden) continue;
      const c = _v.copy(a.pos).setY(a.pos.y + 1.1);
      const along = _w.copy(c).sub(origin).dot(dir);
      if (along < 0 || along > range + 0.4) continue;
      const off = _w.copy(c).sub(origin).addScaledVector(dir, -along).length();
      if (off > (kind === 'spray' ? 0.9 : 0.55)) continue;
      a.state = 'down'; a.daze = kind === 'spray' ? 2.5 : 4.5; a.target = null; a.armUp = 0;
      a.angry++;
      this.fx.audio?.boing?.(a.pos.x, a.pos.y, a.pos.z);
      if (this.eta !== null) this.eta *= 0.8;
      else if (this.level?.police !== null) { this.heat += 20; this.noise(a.pos, 0, false); }
      return true;
    }
    return false;
  }

  update(dt) {
    if (!this.level) return;
    this.time += dt;
    const { player, physics, people, particles, audio, hud } = this.fx;
    // The police on their way, then here.
    if (this.eta !== null && !this.police) {
      this.eta -= dt;
      if (this.eta <= 0) this._arrive();
    }
    if (this.police) this._lights(dt);
    const eye = this.fx.camera.position;
    for (const a of this.agents) {
      if (a.hidden) { this._stairs(a, dt); continue; }
      a.cool -= dt;
      // Knocked down: stars, then up, and angrier.
      if (a.state === 'down') {
        a.daze -= dt;
        if (Math.random() < dt * 6) particles.spawn('spark', a.pos.x + (Math.random() - 0.5) * 0.4, a.pos.y + 0.45, a.pos.z + (Math.random() - 0.5) * 0.4, 0, 0.6, 0, 0xfff27a);
        if (a.daze <= 0) { a.state = 'calm'; a.mode = 'chase'; a.last = player.pos.clone(); }
        continue;
      }
      // Just thrown out: they let you go for a few seconds.
      const sees = this.time > this.grace && this._sees(a, eye);
      if (sees) { a.seen = this.time; a.last = player.pos.clone(); }
      const dist = a.pos.distanceTo(player.pos);
      // Seen breaking things, or come looking and found you: after you.
      if (sees && (a.kind === 'cop' || this.time - this.lastBlow < 4 || a.mode !== 'patrol')) {
        if (a.mode !== 'chase') { a.mode = 'chase'; this._call(a); }
      }
      if (a.mode === 'chase' && this.time - a.seen > (a.kind === 'cop' ? 10 : 7)) a.mode = 'look';
      if (a.mode === 'look' && a.last && a.pos.distanceTo(a.last) < 1) { a.mode = a.kind === 'cop' ? 'search' : 'patrol'; a.last = null; }
      // Off on another floor: the police follow by the stairs; a guard stays and radios.
      if (a.mode === 'chase' && Math.abs(player.pos.y - a.pos.y) > 2.5) {
        if (a.kind === 'cop') this._toFloor(a, Math.round((player.pos.y - T(0)) / FLOOR_H));
        else { a.mode = 'patrol'; this._radio(a); }
        continue;
      }
      a.armUp = 0;
      switch (a.mode) {
        case 'patrol': this._wander(a, a.post, WALK, dt); break;
        case 'search': this._wander(a, null, WALK * 1.3, dt); break;
        case 'look': if (a.last) this._go(a, a.last, GUARD_RUN * 0.7); break;
        case 'chase': this._chase(a, dist, sees, dt); break;
      }
    }
    // A heap of officers on you: hold it a moment, then the job is over.
    if (this.busted !== undefined) {
      this.busted -= dt;
      if (this.busted <= 0) { this.busted = undefined; this.fx.onBusted?.(); }
    }
  }

  // Can it see you? Same floor, in range, a clear line, and not lost in dust or smoke.
  _sees(a, eye) {
    const { player, physics } = this.fx;
    if (player.dead) return false;
    if (Math.abs(player.pos.y - a.pos.y) > 2.2) return false;
    let range = player.disguised ? SEE_DISGUISED : SEE;
    const murk = Math.max(this.fx.smoke?.at(eye) ?? 0, Math.min(1, (this.fx.veil?.thick ?? 0) / 2500));
    range *= 1 - 0.75 * murk;
    if (player.crouch > 0.5) range *= 0.8;
    const head = _v.copy(a.pos).setY(a.pos.y + 1.55 * a.height);
    const d = head.distanceTo(eye);
    if (d > range) return false;
    // Facing roughly your way (or chasing already).
    if (a.mode === 'patrol') {
      const ang = Math.atan2(eye.x - a.pos.x, eye.z - a.pos.z) - a.yaw;
      if (Math.cos(ang) < -0.2) return false;
    }
    const dir = _w.copy(eye).sub(head).divideScalar(d);
    const hit = physics.raycast(head, dir, d - 0.3);
    return !hit || (hit.owner?.kind?.glass ?? false);
  }

  _chase(a, dist, sees, dt) {
    const { player, particles, audio, hud } = this.fx;
    const run = a.kind === 'cop' ? COP_RUN : GUARD_RUN * (1 + 0.15 * Math.min(2, a.angry));
    a.state = 'running';
    if (a.kind === 'cop') {
      if (dist < CATCH && this.busted === undefined) this._bust(a);
      else this._go(a, player.pos, run);
      return;
    }
    switch (a.arm) {
      case 'shout':
        // Keeps its distance, points, shouts, and radios it in.
        if (dist > 6) this._go(a, player.pos, run * 0.8); else { a.target = null; this._face(a, player.pos); }
        a.armUp = 1;
        if ((a.shout -= dt) <= 0) { a.shout = 3; hud?.flash('Security: "Stop right there!"', 1.5); audio?.shout?.(a.pos.x, a.pos.y, a.pos.z); this._radio(a); }
        break;
      case 'net':
        if (sees && dist > 2.5 && dist < 9 && a.cool <= 0) {
          a.cool = 6; this._face(a, player.pos); a.target = null;
          audio?.thwip?.(a.pos.x, a.pos.y, a.pos.z);
          this._trail(a, 0xd8d8c8, 14);
          if (Math.random() < 0.7) { player.tangle?.(3.5); hud?.flash('Caught in a net!', 1.5); }
          break;
        }
        this._tackleOr(a, dist, run);
        break;
      case 'taser':
        if (sees && dist > 1.5 && dist < 7 && a.cool <= 0) {
          a.cool = 5; this._face(a, player.pos); a.target = null; a.armUp = 1;
          audio?.buzz?.(a.pos.x, a.pos.y, a.pos.z);
          this._trail(a, 0x9fd8ff, 18);
          if (Math.random() < 0.75) { player.stun?.(2.2); this.fx.shake?.add(0.35); hud?.flash('Tasered!', 1.5); }
          break;
        }
        this._tackleOr(a, dist, run);
        break;
      case 'gun':
        if (sees && dist < 24 && a.cool <= 0) {
          a.cool = 0.9 + Math.random() * 0.6; this._face(a, player.pos); a.target = null; a.armUp = 1;
          audio?.shot?.(a.pos.x, a.pos.y, a.pos.z);
          particles.spawn('flash', a.pos.x + Math.sin(a.yaw) * 0.5, a.pos.y + 1.4, a.pos.z + Math.cos(a.yaw) * 0.5, 0, 0, 0, 0xffd27a);
          if (Math.random() < 0.3) player.damage(18, 'shot');
          if (dist > 8) this._go(a, player.pos, run * 0.6);
          break;
        }
        if (dist > 10) this._go(a, player.pos, run);
        break;
      default:
        this._tackleOr(a, dist, run);
    }
  }

  _tackleOr(a, dist, run) {
    const { player, hud } = this.fx;
    if (dist < CATCH) {
      // Tackled: down you go, and you are walked out of the front door.
      player.stun?.(1.4);
      hud?.flash('Security threw you out!', 2.5);
      this.fx.audio?.thud?.(player.pos.x, player.pos.y, player.pos.z);
      this.fx.onThrownOut?.();
      this.grace = this.time + 6;
      for (const b of this.agents) if (b.kind === 'guard' && b.mode === 'chase') { b.mode = 'patrol'; b.target = null; }
      a.cool = 4;
      return;
    }
    this._go(a, this.fx.player.pos, player.stunned ? run * 1.2 : run);
  }

  // Seen: the guard calls it in (once), and the police are called if they
  // were not already.
  _call(a) {
    this.fx.audio?.shout?.(a.pos.x, a.pos.y, a.pos.z);
    if (a.kind === 'guard') this._radio(a);
  }

  _radio(a) {
    if (a.radioed || this.level.police === null) return;
    a.radioed = true;
    if (this.eta === null && !this.police) { this.eta = this.level.police * 0.8; this.fx.hud?.flash('A guard is calling the police'); }
    else if (this.eta !== null) this.eta *= 0.7;
  }

  _go(a, to, speed) {
    a.speed = speed;
    if (!a.target) a.target = new THREE.Vector3();
    a.target.copy(to);
    // Blocked straight ahead (knee height)? Step round it.
    const d = _v.copy(to).sub(a.pos).setY(0);
    const len = d.length();
    if (len < 0.3) return;
    d.divideScalar(len);
    const hit = this.fx.physics.raycast(_w.copy(a.pos).setY(a.pos.y + 0.5), d, Math.min(len, 1.2));
    if (hit && hit.owner?.kind && !hit.owner.kind.glass) {
      const side = (a.id ?? 0) % 2 ? 1 : -1;
      d.applyAxisAngle(THREE.Object3D.DEFAULT_UP, side * 1.1);
      a.target.copy(a.pos).addScaledVector(d, 1.5);
    }
  }

  _face(a, at) { a.yaw = Math.atan2(at.x - a.pos.x, at.z - a.pos.z); }

  _wander(a, around, speed, dt) {
    a.state = 'calm';
    a.speed = speed;
    if (a.target) return;
    if ((a.wait = (a.wait ?? 0) - dt) > 0) return;
    const t = this.fx.people._spot(a.f, around ?? a.pos, around ? 3 : 6);
    if (t) a.target = t;
    a.wait = 2 + Math.random() * 4;
  }

  // A line of sparks or netting from a guard to you.
  _trail(a, colour, n) {
    const { particles, camera } = this.fx;
    const from = _v.copy(a.pos).setY(a.pos.y + 1.3), to = camera.position;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      particles.spawn('spark', from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k, 0, 0.2, 0, colour);
    }
  }

  // An officer heading for another floor: to the stair door, out of sight for
  // a few seconds a floor, then out of the stair door there.
  _toFloor(a, f) {
    f = Math.max(LOWER, Math.min(TOP_FLOOR, f));
    if (a.goal === f) { if (!a.hidden && a.pos.distanceTo(this._door(a.f)) > 0.8) this._go(a, this._door(a.f), COP_RUN); else if (!a.hidden) { a.hidden = true; a.stairT = STAIRS * Math.abs(f - a.f); } return; }
    a.goal = f;
    this._go(a, this._door(a.f), COP_RUN);
  }

  _stairs(a, dt) {
    a.stairT -= dt;
    if (a.stairT > 0) return;
    a.hidden = false;
    a.f = a.goal; a.goal = undefined;
    const d = this._door(a.f);
    a.pos.copy(d); a.floorY = d.y; a.target = null;
    a.mode = 'search';
    a.last = this.fx.player.pos.clone();
  }

  _door(f) { return new THREE.Vector3(-3.3, T(f), CORE.z1 + 0.8); }

  // Sirens on the avenue, and officers through the front door.
  _arrive() {
    this.police = true;
    this.eta = null;
    const { people, scene, audio, hud } = this.fx;
    hud?.flash('Police! They are coming in', 3);
    audio?.siren?.(true);
    const n = { supereasy: 0, easy: 3, normal: 4, hard: 6, insane: 10 }[this.level.id] ?? 4;
    for (let i = 0; i < n; i++) {
      const at = people._spot(0, new THREE.Vector3((i - n / 2) * 1.2, T(0), 10.5), 1) ?? people._spot(0);
      if (!at) continue;
      const a = people.agent(0, at, { ...COP, head: SKIN[(Math.random() * SKIN.length) | 0] }, 1 + Math.random() * 0.06);
      Object.assign(a, { kind: 'cop', arm: 'catch', mode: 'search', cool: 0, seen: -99, last: null, daze: 0, angry: 0, id: i });
      // Some go up straight away, a floor each.
      if (i > 1) this._toFloor(a, Math.min(TOP_FLOOR, i - 1));
      this.agents.push(a);
    }
    // Two cars across the avenue, lights going.
    for (const x of [-7, 7]) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.6), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, metalness: 0.5 }));
      body.position.y = 0.6;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.3), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.3 }));
      top.position.set(0, 1.25, -0.2);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0 }));
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: 0x000030, emissive: 0x2050ff, emissiveIntensity: 0 }));
      red.position.set(-0.3, 1.6, -0.2); blue.position.set(0.3, 1.6, -0.2);
      car.add(body, top, red, blue);
      car.position.set(x, 0, 22);
      car.rotation.y = x < 0 ? 0.3 : -0.3;
      scene.add(car);
      this.cars.push({ car, red, blue });
    }
  }

  _lights(dt) {
    const on = Math.floor(this.time * 4) % 2;
    for (const c of this.cars) { c.red.material.emissiveIntensity = on ? 4 : 0; c.blue.material.emissiveIntensity = on ? 0 : 4; }
  }

  // Caught: the officers pile on, comic, and in a moment the job is over.
  _bust(a) {
    const { player, people, hud } = this.fx;
    this.busted = 2.6;
    player.stun?.(5);
    hud?.flash('BUSTED!', 3);
    this.fx.audio?.thud?.(player.pos.x, player.pos.y, player.pos.z);
    for (const b of this.agents) {
      if (b.kind !== 'cop' || b.hidden || b.pos.distanceTo(player.pos) > 12) continue;
      b.target = player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
      b.speed = COP_RUN;
    }
    a.state = 'down';
    a.daze = 99;
  }

  // For the HUD: what security is doing.
  get status() {
    if (!this.level || this.level.police === null) return '';
    if (this.police) return 'Police in the building';
    if (this.eta !== null) return `Police on the way · ${Math.max(0, Math.ceil(this.eta))} s`;
    return '';
  }

  clear() {
    for (const c of this.cars) c.car.removeFromParent();
    this.cars.length = 0;
    this.agents.length = 0;
    this.heat = 0;
    this.eta = null;
    this.police = false;
    this.busted = undefined;
    this.level = null;
    this.fx.audio?.siren?.(false);
  }
}
