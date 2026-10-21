import * as THREE from 'three';
import { T, FLOOR_H, PODIUM_FLOORS, TOP_FLOOR, LOWER, HQ, STAIR_DOOR } from '../building/plan.js';
import { SITE } from '../site.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Swat } from './swat.js';

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

// Where guards stand their shift: the site's posts, floors by number or by
// name ('lower', 'hq').
const posts = () => SITE.posts.map(([f, x, z]) => [f === 'lower' ? LOWER : f === 'hq' ? HQ : f, x, z]);

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
    this.spotted = -99;          // when someone last saw you at it
    this.time = 0;
    this.grace = 0;              // until then, guards leave you be (just thrown out)
    this.cars = [];
  }

  start(level, job = {}) {
    this.clear();
    this.level = level;
    // A job may have more guards than its difficulty gives (the bank does).
    const guards = level.guards ? level.guards + (job.guards ?? 0) : 0;
    const { people } = this.fx;
    const POSTS = posts();
    for (let n = 0; n < guards && n < POSTS.length; n++) {
      const [f, x, z] = POSTS[n];
      const at = people._spot(f, new THREE.Vector3(x, T(f), z), 1) ?? people._spot(f);
      if (!at) continue;
      const arm = level.arms[(Math.random() * level.arms.length) | 0];
      const a = people.agent(f, at, { ...GUARD, head: SKIN[(Math.random() * SKIN.length) | 0] }, 0.98 + Math.random() * 0.08);
      Object.assign(a, { kind: 'guard', arm, post: at.clone(), mode: 'patrol', cool: 0, seen: -99, last: null, shout: 0, daze: 0, angry: 0, radioed: false });
      this.agents.push(a);
    }
    // Off duty in the break room behind the lobby desk, sitting down — until
    // the building gets frightened.
    const off = { supereasy: 0, easy: 1, normal: 2, hard: 3, insane: 4 }[level.id] ?? 0;
    for (let n = 0; n < off; n++) {
      const [x, z, yaw] = SITE.breakRoom[n];
      const at = new THREE.Vector3(x, T(0), z);
      const arm = level.arms[(Math.random() * level.arms.length) | 0];
      const a = people.agent(0, at, { ...GUARD, head: SKIN[(Math.random() * SKIN.length) | 0] }, 1);
      Object.assign(a, { kind: 'guard', arm, post: at.clone(), mode: 'rest', cool: 0, seen: -99, last: null, shout: 0, daze: 0, angry: 0, radioed: false, yaw, sitting: true, seatY: T(0) + 0.47, capped: true });
      this.agents.push(a);
    }
    this.searched = new Set();
    this.calls = 0;
  }

  // Something broke at `at`. `loud`: how much; `byPlayer`: you did it, where you are.
  noise(at, loud, byPlayer) {
    if (!this.level) return;
    this.heat += loud;
    this.lastNoise = at.clone();
    if (byPlayer) {
      this.lastBlow = this.time;
      this.fx.people.witness(at);
      this.fx.fear?.scare(at, 3);
      this.fx.onOffence?.(4, at);
    }
    if (this.level.police !== null && this.eta === null && !this.police && this.heat > HEAVY) {
      this.eta = this.level.police * Math.pow(0.6, this.calls ?? 0);
      this.fx.hud?.flash('Someone has called the police');
    }
    // Guards who hear it come and look.
    for (const a of this.agents) {
      if (a.state === 'down' || a.hidden || a.mode === 'chase') continue;
      if (Math.abs(a.pos.y - at.y) < 2.5 && a.pos.distanceTo(at) < HEAR * (loud > 5 ? 2 : 1)) { a.mode = 'look'; a.last = at.clone(); }
    }
  }

  // The crime ladder (sim/wanted.js) says the guards come: those on the floor
  // within earshot, or — for something structural — every guard on it.
  summon(at, wide) {
    if (!this.level) return;
    for (const a of this.agents) {
      if (a.kind !== 'guard' || a.state === 'down' || a.hidden || a.mode === 'chase' || a.mode === 'rest' || a.mode === 'flee') continue;
      if (Math.abs(a.pos.y - at.y) > 2.5) continue;
      if (!wide && a.pos.distanceTo(at) > 30) continue;
      a.mode = 'look'; a.last = at.clone();
    }
  }

  // The operator in his chair at the bank's control room (sim/bank-security.js).
  addOperator(at, yaw) {
    const a = this.fx.people.agent(-1, at, { ...GUARD, head: SKIN[(Math.random() * SKIN.length) | 0] }, 1);
    Object.assign(a, { kind: 'guard', arm: 'shout', post: at.clone(), mode: 'operator', cool: 0, seen: -99, last: null, shout: 0, daze: 0, angry: 0, radioed: false, yaw, sitting: true, seatY: at.y + 0.47, capped: true });
    this.agents.push(a);
    return a;
  }

  // The operator raises the alarm, once: every guard to where you are, you
  // are known, and the police are called.
  raise(a, text) {
    if (!a || a.ko || a.radioed2) return;
    a.radioed2 = true;
    this.fx.hud?.flash(text, 2.5);
    this.spotted = this.time;
    for (const b of this.agents) if (b.kind === 'guard' && b !== a && b.state !== 'down' && b.mode !== 'rest') { b.mode = 'look'; b.last = this.fx.player.pos.clone(); }
    this.call('The control room has called the police');
  }

  // Someone calls the police (if they are not on their way already).
  call(why) {
    if (!this.level || this.level.police === null) return;
    if (this.eta === null && !this.police) { this.eta = this.level.police * Math.pow(0.6, this.calls ?? 0); this.fx.hud?.flash(why); }
    else if (this.eta !== null) this.eta = Math.min(this.eta, this.level.police * 0.5);
  }

  // A threat to the city: the guards drop everything and get out with the
  // crowd, and SWAT are called.
  swat() {
    if (!this.level || this.level.police === null || this.swatCalled) return;
    this.swatCalled = true;
    this.fx.hud?.flash('SWAT have been called! The guards are running', 3.5);
    for (const a of this.agents) {
      if (a.kind !== 'guard') continue;
      // Out of uniform, as it were: one of the crowd making for the doors.
      a.agent = false; a.sitting = false; a.panic = 'exit'; a.state = 'running'; a.target = null; a.wait = Math.random() * 0.6;
      a.f = Math.round((a.pos.y - T(0)) / FLOOR_H); a.post = null;
    }
    this.agents = this.agents.filter((a) => a.kind !== 'guard');
    // SWAT come at once: the van down the avenue, the helicopter over the roof.
    this.squad = new Swat(this);
    this.squad.start();
    this.police = true;
    this.eta = null;
    this.fx.audio?.siren?.(true);
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
      // A riot shield takes it: a clang, sparks, and nothing more.
      if (this.squad?.blocks(a, dir)) {
        this.fx.audio?.hit?.('steel', c.x, c.y, c.z, 1);
        for (let i = 0; i < 8; i++) this.fx.particles.spawn('spark', c.x - dir.x * 0.5, c.y, c.z - dir.z * 0.5, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0xffd27a);
        return true;
      }
      // The control room's operator, at his desk: one blow and he is out for
      // good — a heap in his chair, a few stars, and nobody watching the screens.
      if (a.mode === 'operator') {
        a.state = 'down'; a.daze = 1e9; a.ko = true; a.sitting = false; a.target = null;
        this.fx.audio?.boing?.(a.pos.x, a.pos.y, a.pos.z);
        this.fx.onOperatorOut?.(a);
        return true;
      }
      a.state = 'down'; a.daze = kind === 'spray' ? 2.5 : 4.5; a.target = null; a.armUp = 0;
      a.angry++;
      this.fx.fear?.scare(a.pos, 8);
      if (kind === 'sledge') this.fx.onKnock?.(a.pos);
      this.fx.audio?.boing?.(a.pos.x, a.pos.y, a.pos.z);
      if (this.eta !== null) this.eta *= 0.8;
      else if (this.level?.police !== null) { this.heat += 20; this.noise(a.pos, 0, false); }
      return true;
    }
    // Or one of the shoppers: over they go, comic, and then run.
    if (kind === 'sledge') {
      const p = this.fx.people.strike(origin, dir, range);
      if (p) {
        this.fx.audio?.boing?.(p.pos.x, p.pos.y, p.pos.z);
        this.fx.people.alarm(p.pos, 10);
        this.fx.fear?.scare(p.pos, 10);
        this.fx.onKnock?.(p.pos);
        return true;
      }
    }
    return false;
  }

  update(dt) {
    if (!this.level) return;
    this.time += dt;
    const { player, physics, people, particles, audio, hud } = this.fx;
    // A frightened building calls the police; a panicking one, again and again.
    const fear = this.fx.fear?.level ?? 0;
    if (fear > 60 && this.eta === null && !this.police && this.level.police !== null) { this.eta = this.level.police * Math.pow(0.6, this.calls ?? 0); this.fx.hud?.flash('Frightened people are calling the police'); }
    if (fear > 85 && this.eta !== null) this.eta = Math.min(this.eta, 15);
    // The police on their way, then here.
    if (this.eta !== null && !this.police) {
      this.eta -= dt;
      if (this.eta <= 0) this._arrive();
    }
    if (this.police) { this._lights(dt); this._drive(dt); this._search(dt); }
    this.squad?.update(dt);
    const eye = this.fx.camera.position;
    this.seesYou = false;
    for (const a of this.agents) {
      if (a.hidden) { this._stairs(a, dt); continue; }
      a.cool -= dt;
      // Knocked down: stars, then up, and angrier.
      if (a.state === 'down') {
        a.daze -= dt;
        if ((!a.ko || a.daze > 1e9 - 4) && Math.random() < dt * 6) particles.spawn('spark', a.pos.x + (Math.random() - 0.5) * 0.4, a.pos.y + 0.45, a.pos.z + (Math.random() - 0.5) * 0.4, 0, 0.6, 0, 0xfff27a);
        if (a.daze <= 0) { a.state = 'calm'; a.mode = 'chase'; a.last = player.pos.clone(); }
        continue;
      }
      // Just thrown out: they let you go for a few seconds.
      const sees = this.time > this.grace && this._sees(a, eye);
      if (sees && a.mode !== 'rest') this.seesYou = true;
      // Seen at it — by a guard or an officer — and everyone knows who to look for.
      if (sees && this.time - this.lastBlow < 1.5) this.spotted = this.time;
      // An officer seeing someone who looks like they belong has seen nobody.
      // High on the crime ladder, every officer knows your face.
      const known = (this.fx.wanted?.() ?? 0) >= 6;
      const noticed = sees && (a.kind !== 'cop' || known || this.time - this.spotted < 60 || this.fx.armed?.());
      if (noticed) { a.seen = this.time; a.last = player.pos.clone(); }
      // The operator stays at his desk; seeing you in his room, he radios
      // every guard there is and the police.
      if (a.mode === 'operator') {
        if (sees && !a.radioed2) this.raise(a, 'Control room: "Intruder in the control room!"');
        continue;
      }
      // Off duty: out of the break room when the building gets frightened.
      if (a.mode === 'rest') {
        if ((this.fx.fear?.level ?? 0) > 70) {
          a.mode = 'look'; a.sitting = false; a.last = this.lastNoise ?? player.pos.clone();
          if (!this.rushed) { this.rushed = true; this.fx.hud?.flash('Guards rush out of the break room!'); this.fx.fear?.calm(6); }
        } else continue;
      }
      const dist = a.pos.distanceTo(player.pos);
      // Seen breaking things, or come looking and found you: after you.
      // Nobody lays a hand on you unless someone has seen you break something.
      // Walking about with a sledgehammer gets you followed and watched, and
      // asked to put it down; otherwise you are just someone in a building.
      const witnessed = known || this.time - this.spotted < 60;
      if (noticed && witnessed) {
        if (a.mode !== 'chase') { a.mode = 'chase'; a.minD = 99; this._call(a); }
      } else if (noticed && this.fx.armed?.() && a.mode !== 'chase' && a.mode !== 'watch' && this.time > (a.easy ?? 0)) { a.mode = 'watch'; a.watched = this.time; }
      if (a.mode === 'chase' && !witnessed) { a.mode = a.kind === 'cop' ? 'search' : 'look'; this.fx.onLost?.(a); }
      // Watching is a warning, not a shadow: put the hammer away, or let a
      // quarter of a minute go by doing nothing, and they leave you to it —
      // and leave you be for a minute after.
      if (a.mode === 'watch' && (!this.fx.armed?.() || this.time - a.seen > 8 || this.time - a.watched > 15)) {
        if (this.fx.armed?.() && this.time - a.watched > 15) this.fx.hud?.flash(a.kind === 'cop' ? 'Police: "Keep it that way."' : 'Security: "Fine. I’ve got my eye on you."', 2);
        a.mode = a.kind === 'cop' ? 'search' : 'patrol';
        a.easy = this.time + 60;
      }
      if (a.mode === 'chase' && this.time - a.seen > (a.kind === 'cop' ? 10 : 7)) { a.mode = 'look'; this.fx.onLost?.(a); }
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
        case 'enter': {
          // From the car across the pavement and in at the front doors; then
          // the first two search the lobby and the rest go up, a floor each.
          // Straight to the front of a revolving door, then through it — no
          // stepping round the glass beside it, which left them stuck outside.
          const D = SITE.doors;
          const dx = D.x[a.id % D.x.length];
          a.state = 'running';
          a.speed = COP_RUN * 0.8;
          a.target ??= new THREE.Vector3();
          if (a.pos.z > D.approach) a.target.set(dx, a.pos.y, D.outside);
          else if (a.pos.z > D.through) a.target.set(dx, T(0), D.inside);
          else { a.mode = 'search'; a.target = null; if (a.id > 1) this._toFloor(a, Math.min(TOP_FLOOR, a.id - 1)); }
          break;
        }
        case 'look': if (a.last) this._go(a, a.last, GUARD_RUN * 0.7); break;
        case 'stair':
          // SWAT holding a cleared floor's stair door.
          a.state = 'calm';
          if (a.pos.distanceTo(a.post) > 0.4) this._go(a, a.post, WALK * 2); else { a.target = null; a.yaw = 0; }
          break;
        case 'chase': this._chase(a, dist, sees, dt); break;
        case 'watch':
          // Keeping an eye on you, a few metres off, and asking you nicely.
          a.state = 'calm';
          if (dist > 4) this._go(a, player.pos, WALK * 1.6); else { a.target = null; this._face(a, player.pos); }
          if ((a.shout -= dt) <= 0) { a.shout = 7; this.fx.hud?.flash(a.kind === 'cop' ? 'Police: "Sir, put the hammer down."' : 'Security: "Please put the hammer away."', 2); }
          break;
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
    a.minD = Math.min(a.minD ?? 99, dist);
    if (a.kind === 'cop') {
      if (a.swat && a.arm !== 'catch' && dist > CATCH * 1.5 && this._ranged(a, dist, sees)) return;
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
          if (Math.random() < 0.7) { player.tangle?.(3.5); hud?.flash('Caught in a net!', 1.5); this.fx.onZapped?.(); }
          break;
        }
        this._tackleOr(a, dist, run);
        break;
      case 'taser':
        if (sees && dist > 1.5 && dist < 7 && a.cool <= 0) {
          a.cool = 5; this._face(a, player.pos); a.target = null; a.armUp = 1;
          audio?.buzz?.(a.pos.x, a.pos.y, a.pos.z);
          this._trail(a, 0x9fd8ff, 18);
          if (Math.random() < 0.75) { player.stun?.(2.2); this.fx.shake?.add(0.35); hud?.flash('Tasered!', 1.5); this.fx.onZapped?.(); }
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

  // SWAT with a net, a taser or (Insane) a gun: fire when it can. True if fired.
  _ranged(a, dist, sees) {
    const { player, particles, audio, hud } = this.fx;
    if (!sees || a.cool > 0) return false;
    if (a.arm === 'net' && dist > 2.5 && dist < 9) {
      a.cool = 6; this._face(a, player.pos); a.target = null;
      audio?.thwip?.(a.pos.x, a.pos.y, a.pos.z);
      this._trail(a, 0xd8d8c8, 14);
      if (Math.random() < 0.7) { player.tangle?.(3.5); hud?.flash('Caught in a net!', 1.5); this.fx.onZapped?.(); }
      return true;
    }
    if (a.arm === 'taser' && dist > 1.5 && dist < 7) {
      a.cool = 5; this._face(a, player.pos); a.target = null; a.armUp = 1;
      audio?.buzz?.(a.pos.x, a.pos.y, a.pos.z);
      this._trail(a, 0x9fd8ff, 18);
      if (Math.random() < 0.75) { player.stun?.(2.2); this.fx.shake?.add(0.35); hud?.flash('Tasered!', 1.5); this.fx.onZapped?.(); }
      return true;
    }
    if (a.arm === 'gun' && dist < 24) {
      a.cool = 0.9 + Math.random() * 0.6; this._face(a, player.pos); a.target = null; a.armUp = 1;
      audio?.shot?.(a.pos.x, a.pos.y, a.pos.z);
      particles.spawn('flash', a.pos.x + Math.sin(a.yaw) * 0.5, a.pos.y + 1.4, a.pos.z + Math.cos(a.yaw) * 0.5, 0, 0, 0, 0xffd27a);
      if (Math.random() < 0.3) player.damage(18, 'shot');
      return true;
    }
    return false;
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

  _door(f) { return new THREE.Vector3(STAIR_DOOR.x, T(f), STAIR_DOOR.z); }

  // Sirens on the avenue: the cars come down Fifth Avenue with their lights
  // going, pull in at the kerb in front of the tower, and the officers get out,
  // two to a car, and walk in through the front doors.
  _arrive() {
    this.police = true;
    this.eta = null;
    const { scene, audio, hud } = this.fx;
    hud?.flash('Sirens! The police are here', 3);
    this.fx.fear?.calm(10);
    audio?.siren?.(true);
    const n = { supereasy: 0, easy: 3, normal: 4, hard: 6, insane: 10 }[this.level.id] ?? 4;
    const cars = Math.ceil(n / 2);
    let crew = n;
    for (let k = 0; k < cars; k++) {
      const car = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, metalness: 0.5 });
      const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.35 });
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.75, 4.8, 3, 0.15), paint);
      body.position.y = 0.62;
      const door = new THREE.Mesh(new RoundedBoxGeometry(1.92, 0.42, 1.9, 2, 0.08), white);
      door.position.set(0, 0.62, 0.1);
      const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.55, 2.4, 3, 0.15), new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.05, metalness: 0.6 }));
      cabin.position.set(0, 1.22, -0.2);
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0 }));
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: 0x000030, emissive: 0x2050ff, emissiveIntensity: 0 }));
      red.position.set(-0.3, 1.58, -0.2); blue.position.set(0.3, 1.58, -0.2);
      car.add(body, door, cabin, red, blue);
      for (const m of car.children) m.castShadow = true;
      // In from up the avenue, one behind the other, nose first (traffic goes −x).
      const c = { car, red, blue, x: SITE.police.from + k * 16, tx: SITE.police.park + k * 6.5, z: SITE.police.lane, v: 16, crew: Math.min(2, crew), parked: false };
      crew -= c.crew;
      car.position.set(c.x, 0, c.z);
      car.rotation.y = -Math.PI / 2;
      scene.add(car);
      this.cars.push(c);
    }
  }

  // The cars driving in and pulling up; the officers out, and in.
  _drive(dt) {
    for (const c of this.cars) {
      if (c.parked) continue;
      const left = c.x - c.tx;
      c.v = Math.min(16, Math.max(2, left * 0.9));
      c.x -= Math.min(left, c.v * dt);
      c.car.position.x = c.x;
      if (left < 0.05) {
        c.parked = true;
        this.fx.audio?.thud?.(c.x, 0.5, c.z);
        for (let i = 0; i < c.crew; i++) {
          const at = new THREE.Vector3(c.x + (i ? 1.0 : -1.0), 0.02, SITE.police.out);
          const a = this.fx.people.agent(0, at, { ...COP, head: SKIN[(Math.random() * SKIN.length) | 0] }, 1 + Math.random() * 0.06);
          const id = this.agents.filter((b) => b.kind === 'cop').length;
          Object.assign(a, { kind: 'cop', arm: 'catch', mode: 'enter', cool: 0, seen: -99, last: null, daze: 0, angry: 0, id, yaw: Math.PI });
          this.agents.push(a);
        }
      }
    }
  }

  // Officers search floor by floor. Each floor searched without a sight of
  // you is ticked off; when every floor is, and nobody has seen you for half a
  // minute, they leave: "He is not here." Called again, they come sooner.
  _search(dt) {
    const cops = this.agents.filter((a) => a.kind === 'cop' && a.state !== 'gone');
    if (!cops.length) return;
    const lastSeen = Math.max(...cops.map((a) => a.seen));
    if (this.time - lastSeen < 2) this.searched.clear();
    for (const a of cops) {
      if (a.hidden || a.mode !== 'search') { a.onFloor = 0; continue; }
      a.onFloor = (a.onFloor ?? 0) + dt;
      // SWAT search in half the time; a known face, quicker still.
      const per = (a.swat ? 10 : 20) * ((this.fx.wanted?.() ?? 0) >= 6 ? 0.75 : 1);
      if (a.onFloor > per) {
        this.searched.add(a.f);
        a.onFloor = 0;
        // SWAT leave one of theirs at the stair door of a floor they have cleared.
        const squad = cops.filter((b) => b.swat);
        if (a.swat && squad.filter((b) => b.mode === 'stair').length < squad.length - 2 && !squad.some((b) => b.mode === 'stair' && b.f === a.f)) {
          a.mode = 'stair'; a.post = this._door(a.f).add(new THREE.Vector3(0.9, 0, 0.6));
          continue;
        }
        const order = [];
        for (let f = LOWER; f <= TOP_FLOOR; f++) order.push(f);
        if (a.down) order.reverse();
        for (const f of order) if (!this.searched.has(f) && !cops.some((b) => b !== a && b.goal === f)) { this._toFloor(a, f); break; }
      }
    }
    if (this.searched.size >= TOP_FLOOR - LOWER + 1 && this.time - lastSeen > 30) this._leave();
  }

  _leave() {
    const { hud, audio } = this.fx;
    hud?.flash('Police: "He is not here." They are leaving.', 3.5);
    this.fx.onGaveUp?.();
    for (const a of this.agents) if (a.kind === 'cop') { a.state = 'gone'; a.hidden = true; }
    this.agents = this.agents.filter((a) => a.kind !== 'cop');
    for (const c of this.cars) c.car.removeFromParent();
    this.cars.length = 0;
    this.squad?.clear();
    this.squad = null;
    this.police = false;
    this.calls++;
    this.heat = HEAVY * 0.5;
    this.searched.clear();
    audio?.siren?.(false);
    this.fx.fear?.calm(20);
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
    this.swatCalled = false;
    this.level = null;
    this.squad?.clear();
    this.squad = null;
    this.fx.audio?.siren?.(false);
  }
}
