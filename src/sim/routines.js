import * as THREE from 'three';
import { T, LOWER, TOP_FLOOR, CORE, STAIR_DOOR, floorUse } from '../building/plan.js';
import { SITE } from '../site.js';
import { places } from '../building/shops.js';

// The working day (sim/clock.js keeps the time): the people of the building
// with jobs to do, coming in to do them, and going home.
//
//   Workers  each has a post, found from what the building was built with —
//            a desk and its chair (office workers and traders, typing), a
//            shop's counter (staff serving whoever queues), a cooker or a food
//            counter (cooks), the bar and the tables (waiters carrying plates
//            between them), the crates downstairs (porters), a floor to clean
//            (cleaners, day and night), a teller's window at the bank. They
//            come in from the street at the start of their shift, through the
//            front doors, up by the lift (a wait at its doors, out of sight in
//            the car) or the stairs, work, and at the end of it go home the
//            same way; a new one comes in for the next shift.
//   Visitors come in from the street to the shops, the cafés, the food court,
//            the Grill, the bank's tellers: queue and are served, browse, sit
//            and eat, then leave — with a bag or a coffee in hand.
//   The day  a morning rush to the desks, a lunch rush in the food court and
//            the cafés, everyone going home in the evening; at night the
//            building is empty but for cleaners, a few late workers and the
//            night guards; then morning again.
//   The bank tellers serve the queue at the rope line — money in, money out;
//            a teller with no cash left goes down and opens the vault for
//            more (the round door stands open while he is in there — slip in
//            behind him); and a cash delivery comes in the morning: boxes
//            carried down and stacked in a corner of the lower level.
//
// Trouble stops them: frightened, they stand, stare, film; calm again, they
// go back to work. In a panic they are the crowd's (sim/people.js) and leave.

const CAP = { day: 150, night: 60 };
const WORKERS = 110;                 // of the day's people, at most this many at work: room for visitors
const UNIFORM = {
  server: { body: 0x1a1a1a, arm: 0x1a1a1a, hips: 0x2a2a2a, leg: 0x2a2a2a, skirt: 0x2a2a2a },
  cook: { body: 0xf2f0ea, arm: 0xf2f0ea, hips: 0x3a3a3a, leg: 0x3a3a3a, skirt: 0x3a3a3a, hair: 0xf2f0ea },
  waiter: { body: 0x111111, arm: 0xf2f0ea, hips: 0x111111, leg: 0x111111, skirt: 0x111111 },
  cleaner: { body: 0x3a6a9a, arm: 0x3a6a9a, hips: 0x2a4a6a, leg: 0x2a4a6a, skirt: 0x2a4a6a },
  porter: { body: 0xe8d020, arm: 0x3a3a3a, hips: 0x2a2a2a, leg: 0x2a2a2a, skirt: 0x2a2a2a },
  courier: { body: 0x1d2a44, arm: 0x1d2a44, hips: 0x1a1f2b, leg: 0x1a1f2b, skirt: 0x1a1f2b },
};
// When each kind works: [from, to) hours, and the hour shifts change.
const HOURS = {
  desk: [8, 17.5], server: [9, 20, 14.5], teller: [9, 17], cook: [10, 21, 15.5], waiter: [11, 22, 16.5],
  porter: [7, 16], cleaner: [0, 24, 14], late: [19, 23],
};
const BAG_COLOURS = [0xf2f0ea, 0x1a1a1a, 0xc8261d, 0x2a4a6a, 0xd8b25a];

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();

export class Routines {
  constructor(fx) {
    this.fx = fx;                    // { people, pieces, clock, security, scene, bank, vaultDoor() }
    this.on = false;
    this.posts = [];
    this.managed = new Set();
    // What visitors carry out: bags and cups, drawn at their hands.
    this.bags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.3, 0.1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 160);
    this.cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.033, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.6 }), 80);
    this.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }), 40);
    for (const m of [this.bags, this.cups, this.boxes]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; fx.scene.add(m); }
    this.stack = [];
  }

  // ---------------------------------------------------------------- setting up

  // A new job: the posts the building offers, and the day as it stands at `hour`.
  attach(job) {
    this.clear();
    this.on = true;
    this.bank = job.id === 'bank';
    const { pieces } = this.fx;
    const list = pieces.list.filter((p) => p.state === 'static');
    // Desks: an office chair by a desk is somebody's place.
    const desks = list.filter((p) => p.tag === 'desk');
    for (const ch of list.filter((p) => p.tag === 'chair')) {
      const c = ch.box.getCenter(new THREE.Vector3());
      const d = desks.find((k) => Math.abs(k.box.min.y - ch.box.min.y) < 0.5 && k.box.getCenter(_v).setY(c.y).distanceTo(c) < 1.4);
      if (!d) continue;
      const dc = d.box.getCenter(new THREE.Vector3());
      const floorY = ch.box.min.y;
      this.posts.push({ kind: 'desk', f: ch.floor, x: c.x, z: c.z, y: floorY, yaw: Math.atan2(dc.x - c.x, dc.z - c.z), sit: true, active: Math.random() < 0.55, late: Math.random() < 0.07 });
    }
    // Shop counters and the bank's windows.
    for (const pl of places.list) {
      if (pl.kind !== 'staff' || !pieces.list.length) continue;
      const f = Math.round((pl.y - T(0)) / 4);
      this.posts.push({ kind: pl.teller ? 'teller' : 'server', f, x: pl.x, z: pl.z, y: pl.y, yaw: pl.yaw, sit: !!pl.sit, active: true, cash: 6 });
    }
    // Cooks at the cookers and food counters.
    for (const k of list.filter((p) => p.tag === 'cooker')) {
      const c = k.box.getCenter(new THREE.Vector3());
      const at = this.fx.people._spot(k.floor, c, 0.7);
      if (at) this.posts.push({ kind: 'cook', f: k.floor, x: at.x, z: at.z, y: at.y, yaw: Math.atan2(c.x - at.x, c.z - at.z), active: Math.random() < 0.8 });
    }
    // Waiters, where there is a bar and tables.
    const bars = list.filter((p) => p.tag === 'bar');
    this.tables = list.filter((p) => p.tag === 'table');
    for (const b of bars) for (let n = 0; n < 2; n++) this.posts.push({ kind: 'waiter', f: b.floor, bar: b.box.getCenter(new THREE.Vector3()), active: true });
    // Porters among the crates.
    this.crates = list.filter((p) => p.tag === 'crates');
    if (this.crates.length) for (let n = 0; n < 2; n++) this.posts.push({ kind: 'porter', f: this.crates[0].floor, active: true });
    // Cleaners: one for every few floors by day, more at night.
    for (let f = LOWER; f <= TOP_FLOOR; f += 2) this.posts.push({ kind: 'cleaner', f, active: true, night: true, day: (f - LOWER) % 6 === 0 });
    // Where visitors go: the shops' places, the tables, a walk round the public floors.
    this.visits = places.list.filter((pl) => pl.kind !== 'staff');
    this.publicFloors = [];
    for (let f = 0; f <= TOP_FLOOR; f++) if (/lobby|boutiques|jewellers|food court|restaurant|banking hall|mezzanine/.test(floorUse(f))) this.publicFloors.push(f);
    this._visitT = 0;
    this._tick = 0;
    this.delivered = this.fx.clock.hour > 9.5 && this.fx.clock.hour < 20;
    // Each their own hours: desks fill between a quarter to eight and half past
    // nine and empty between five and half past six — the rushes — and the
    // rest come and go a little either side of their opening times.
    for (const post of this.posts) {
      const h = HOURS[post.kind];
      post.shift = h?.[2];
      if (!h || post.kind === 'cleaner') continue;
      post.from = post.kind === 'desk' ? 7.75 + Math.random() * 1.75 : h[0] - 0.25 + Math.random() * 0.5;
      post.to = post.kind === 'desk' ? 17 + Math.random() * 1.5 : h[1] - 0.25 + Math.random() * 0.75;
    }
    // The day as it stands: everyone at work who would be, some visitors about.
    for (const post of this.posts) if (this._wants(post)) this._place(post);
    const visitors = Math.round(this._visitRate() * 70);
    for (let i = 0; i < visitors; i++) this._visitor(true);
  }

  // ---------------------------------------------------------------- the day

  _hoursOf(post) { return post.kind === 'desk' && !this.fx.clock.within(...HOURS.desk) ? HOURS.late : HOURS[post.kind]; }

  // Should this post have someone at it now?
  _wants(post) {
    const C = this.fx.clock;
    if (!post.active) return false;
    if (post.kind === 'cleaner') return C.within(20, 7) ? post.night : post.day;
    if (post.kind === 'desk') return C.within(post.from, post.to) || (post.late && C.within(...HOURS.late));
    return C.within(post.from, post.to);
  }

  // Visitors a second, by the hour: none at night, a lunch rush.
  _visitRate() {
    const C = this.fx.clock;
    if (!C.within(9, 19.5)) return 0;
    return (C.within(12, 13.75) ? 0.32 : 0.12) * (this.bank ? 0.7 : 1);
  }

  _workers() { let n = 0; for (const p of this.managed) if (p.job !== 'visitor') n++; return n; }

  get cap() { return this.fx.clock.within(20, 7) ? CAP.night : CAP.day; }

  update(dt) {
    if (!this.on) return;
    // The people we steer.
    for (const p of this.managed) {
      if (p.state === 'gone' || !p.agent) { this._release(p); continue; }
      this._step(p, dt);
    }
    // Every half second: shifts, arrivals, departures, visitors.
    if ((this._tick -= dt) <= 0) {
      this._tick = 0.5;
      const C = this.fx.clock;
      for (const post of this.posts) {
        const want = this._wants(post);
        const p = post.person;
        if (p && (!want || (post.shift && C.within(post.shift, post.shift + 0.25) && !post.changed))) {
          // The end of a shift (or the day): home — and at a change of shift, someone new.
          if (want) post.changed = true;
          this._leave(p);
          post.person = null;
        } else if (!p && want && this.managed.size < this.cap && this._workers() < WORKERS && Math.random() < 0.06) {
          this._arrive(post);
        }
        if (post.shift && !C.within(post.shift, post.shift + 0.5)) post.changed = false;
      }
      this._visitT += 0.5 * this._visitRate();
      while (this._visitT >= 1) { this._visitT -= 1; if (this.managed.size < this.cap) this._visitor(false); }
      if (this.bank && !this.delivered && C.within(8.4, 9.5)) { this.delivered = true; this._delivery(); }
    }
    this._props();
  }

  // ---------------------------------------------------------------- people

  _new(f, at, kind) {
    const p = this.fx.people.person(f, at, UNIFORM[kind] ?? null);
    if (!p) return null;
    p.post = kind;                                // a panic takes them (sim/people.js)
    p.plan = [];
    p.job = kind;
    this.managed.add(p);
    return p;
  }

  _release(p) {
    this.managed.delete(p);
    for (const post of this.posts) if (post.person === p) post.person = null;
    p.carry = null;
  }

  // Straight to work: someone already at their post as the job begins.
  _place(post) {
    const at = this._postAt(post);
    if (!at) return;
    const p = this._new(post.f, at, post.kind === 'teller' ? 'server' : post.kind === 'desk' ? null : post.kind);
    if (!p) return;
    post.person = p;
    p.plan = this._work(post);
  }

  // In from the street to start a shift.
  _arrive(post) {
    const at = this._postAt(post);
    if (!at) return;
    const p = this._new(0, this._pavement(), post.kind === 'teller' ? 'server' : post.kind === 'desk' ? null : post.kind);
    if (!p) return;
    post.person = p;
    p.plan = [...this._enter(), ...this._route(p, 0, post.f, at), ...this._work(post)];
  }

  // Off home, the way they came.
  _leave(p) {
    p.sitting = false;
    // Out of sight in the lift or the stairs: finish that, then go home from there.
    const riding = p.plan[0]?.ride !== undefined ? p.plan[0] : null;
    const from = riding ? riding.ride : p.f;
    p.plan = [...(riding ? [riding] : []), ...this._route(p, from, 0, this._doorIn()), ...this._exit()];
  }

  _visitor(direct) {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    let target = null, f = 0, what;
    const r = Math.random();
    const lunch = this.fx.clock.within(12, 13.75);
    if (this.visits.length && r < 0.55) {
      const pl = pick(this.visits);
      f = Math.round((pl.y - T(0)) / 4);
      target = new THREE.Vector3(pl.x, pl.y, pl.z);
      what = { kind: pl.kind, yaw: pl.yaw, teller: pl.teller };
    } else if (this.tables.length && (lunch ? r < 0.85 : r < 0.7)) {
      const t = pick(this.tables);
      const c = t.box.getCenter(new THREE.Vector3());
      const wide = t.box.max.x - t.box.min.x > 1;
      const a = wide ? Math.PI / 4 + ((Math.random() * 4) | 0) * Math.PI / 2 : (Math.random() < 0.5 ? 0 : Math.PI);
      const r0 = wide ? 0.9 : 0.62;
      target = new THREE.Vector3(c.x + (wide ? Math.cos(a) : 0) * r0, t.box.min.y, c.z + (wide ? Math.sin(a) : Math.cos(a)) * r0);
      f = t.floor;
      what = { kind: 'seat', yaw: Math.atan2(c.x - target.x, c.z - target.z) };
    } else if (this.publicFloors.length) {
      f = pick(this.publicFloors);
      target = this.fx.people._spot(f);
      what = { kind: 'wander' };
    }
    if (!target) return;
    const p = this._new(direct ? f : 0, direct ? target : this._pavement(), 'visitor');
    if (!p) return;
    p.job = 'visitor';
    p.plan = [...(direct ? [] : [...this._enter(), ...this._route(p, 0, f, target)]), ...this._visit(p, what, target, f)];
  }

  // ---------------------------------------------------------------- plans

  // A plan is a list of steps, done in turn:
  //   { go: Vector3 }  walk there        { wait: s }       stand
  //   { ride: f, by }  out of sight up or down, the lift or the stairs
  //   { sit, yaw, y }  sit down here      { work: post }    work at a post, till sent home
  //   { linger: s, kind } a visitor's business      { carry }   take a bag or a cup
  //   { gone: true }   out of the picture
  _route(p, from, to, at) {
    if (from === to) return [{ go: at }];
    const stairs = to === LOWER || from === LOWER || (Math.abs(to - from) <= 2 && Math.random() < 0.5);
    const door = (f) => stairs ? new THREE.Vector3(STAIR_DOOR.x + Math.random() * 0.4, T(f), STAIR_DOOR.z + 0.3) : new THREE.Vector3(1.0 + Math.random() * 2.2, T(f), CORE.z1 + 0.9 + Math.random() * 0.8);
    const steps = [{ go: door(from) }];
    if (!stairs) steps.push({ wait: 1.5 + Math.random() * 4 });
    steps.push({ ride: to, by: stairs ? 'stair' : 'lift', from }, { go: at });
    return steps;
  }

  _doorX() { const D = SITE.doors; return D.x[(Math.random() * D.x.length) | 0]; }
  _doorIn() { return new THREE.Vector3(this._doorX(), T(0), SITE.doors.inside - 0.5); }
  _pavement() { return new THREE.Vector3((Math.random() - 0.5) * 16, 0.003, SITE.street.pavements[0] + (Math.random() - 0.5) * 2); }

  _enter() {
    const x = this._doorX(), D = SITE.doors;
    return [{ go: new THREE.Vector3(x, 0, D.outside + 0.6) }, { go: new THREE.Vector3(x, T(0), D.inside - 0.4) }];
  }

  _exit() {
    const x = this._doorX(), D = SITE.doors, side = Math.random() < 0.5 ? -1 : 1;
    return [{ go: new THREE.Vector3(x, T(0), D.inside) }, { go: new THREE.Vector3(x, 0, D.outside + 0.8) }, { go: this._pavement() },
      { go: new THREE.Vector3(x + side * 25, 0.003, SITE.street.pavements[0] + (Math.random() - 0.5) * 2) }, { gone: true }];
  }

  _postAt(post) {
    if (post.kind === 'waiter') return this.fx.people._spot(post.f, post.bar, 1.0);
    if (post.kind === 'porter') return this.crates.length ? this.fx.people._spot(post.f, this.crates[0].box.getCenter(new THREE.Vector3()), 1.5) : null;
    if (post.kind === 'cleaner') return this.fx.people._spot(post.f);
    return new THREE.Vector3(post.x, post.y ?? T(post.f), post.z);
  }

  _work(post) {
    const steps = [];
    if (post.sit) steps.push({ sit: true, yaw: post.yaw, y: post.y ?? T(post.f) });
    steps.push({ work: post });
    return steps;
  }

  _visit(p, what, at, f) {
    const steps = [];
    if (what.kind === 'seat') steps.push({ sit: true, yaw: what.yaw, y: at.y }, { linger: (this.fx.clock.within(12, 13.75) ? 60 : 40) + Math.random() * 80, kind: 'eat' });
    else if (what.kind === 'queue') steps.push({ face: what.yaw }, { linger: 6 + Math.random() * 5, kind: what.teller ? 'bank' : 'queue', at }, { carry: what.teller ? null : Math.random() < 0.5 ? 'bag' : 'cup' });
    else if (what.kind === 'browse') steps.push({ face: what.yaw }, { linger: 10 + Math.random() * 25, kind: 'browse' }, { carry: Math.random() < 0.4 ? 'bag' : null });
    else for (let n = 0; n < 2; n++) { const s = this.fx.people._spot(f, at, 3); if (s) steps.push({ go: s }, { wait: 3 + Math.random() * 6 }); }
    steps.push({ stand: true }, ...this._route(p, f, 0, this._doorIn()), ...this._exit());
    return steps;
  }

  // ---------------------------------------------------------------- doing it

  _step(p, dt) {
    const s = p.plan[0];
    if (!s) return;
    const fear = this.fx.people.fear ?? 0;
    // Frightened: stop, stand, look; carry on once it is calm.
    if (fear > 55 && (s.work || s.linger)) { p.sitting = false; p.target = null; p.armUp = Math.random() < 0.01 ? 1 : p.armUp; s.scared = true; return; }
    if (s.scared && fear < 30) { s.scared = false; const post = s.work; if (post?.sit) p.plan.unshift({ sit: true, yaw: post.yaw, y: post.y ?? T(post.f) }); return; }
    const next = () => { p.plan.shift(); p.target = null; };
    if (s.go) {
      p.target ??= new THREE.Vector3();
      p.target.set(s.go.x, p.pos.y, s.go.z);
      p.speed = p.job === 'cleaner' ? 0.9 : 1.3 + (p.phase % 1) * 0.3;
      p.armUp = p.carry === 'box' ? 1 : p.carry ? 0.5 : 0;
      if (Math.hypot(p.pos.x - s.go.x, p.pos.z - s.go.z) < 0.35) next();
    } else if (s.wait !== undefined) {
      p.target = null;
      if ((s.wait -= dt) <= 0) next();
    } else if (s.ride !== undefined) {
      // Into the lift or the stairwell, and out at the other floor a while later.
      if (!s.t) { p.hidden = true; p.target = null; s.t = Math.abs(s.ride - s.from) * (s.by === 'lift' ? 1.1 : 3) + 2; }
      if ((s.t -= dt) <= 0) {
        const f = s.ride;
        p.pos.set(s.by === 'lift' ? 1.2 + Math.random() * 2 : STAIR_DOOR.x, T(f), s.by === 'lift' ? CORE.z1 + 0.7 : STAIR_DOOR.z + 0.2);
        p.f = f; p.floorY = T(f); p.vy = 0; p.hidden = false;
        next();
      }
    } else if (s.sit) {
      p.sitting = true; p.seatY = s.y + 0.47; p.yaw = s.yaw; p.target = null;
      next();
    } else if (s.stand) {
      p.sitting = false; next();
    } else if (s.face !== undefined) {
      p.yaw = s.face; next();
    } else if (s.carry !== undefined) {
      p.carry = s.carry; p.bagColour = BAG_COLOURS[(Math.random() * BAG_COLOURS.length) | 0]; next();
    } else if (s.fn) {
      s.fn(); next();
    } else if (s.gone) {
      p.state = 'gone'; p.hidden = true; this._release(p);
    } else if (s.linger !== undefined) {
      p.target = null;
      if (s.kind === 'eat') p.armUp = Math.sin(this.fx.clock.hour * 900 + p.phase) > 0.6 ? 0.6 : 0.2;
      if (s.kind === 'queue' || s.kind === 'bank') this._served(p, s);
      if ((s.linger -= dt) <= 0) next();
    } else if (s.work) {
      this._working(p, s.work, dt);
    }
  }

  // A visitor at a counter: the nearest server serves them (the teller counts
  // the money in or out).
  _served(p, s) {
    if (s.server) return;
    const post = this.posts.find((q) => (q.kind === 'server' || q.kind === 'teller') && q.person && Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < 4 && q.f === p.f);
    if (!post) return;
    s.server = post;
    post.serving = 4;
    if (post.kind === 'teller') post.cash += Math.random() < 0.35 ? 1 : -1;
  }

  _working(p, post, dt) {
    p.target = null;
    const t = this.fx.clock.hour * 3600 * 0.03 + p.phase;
    switch (post.kind) {
      case 'desk': p.armUp = 0.2 + 0.1 * Math.abs(Math.sin(t * 9)); break;
      case 'cook': p.armUp = 0.4 + 0.3 * Math.abs(Math.sin(t * 4)); break;
      case 'server': case 'teller':
        p.armUp = post.serving > 0 ? 0.5 + 0.4 * Math.abs(Math.sin(t * 5)) : 0;
        post.serving = Math.max(0, (post.serving ?? 0) - dt);
        if (post.kind === 'teller' && post.cash <= 0 && !post.run) this._vaultRun(p, post);
        break;
      case 'waiter': {
        // Plates from the bar to a table, and back for more.
        if (!this.tables.length) break;
        const t2 = this.tables.filter((k) => k.floor === post.f && k.state === 'static');
        const table = t2[(Math.random() * t2.length) | 0];
        if (!table) break;
        const c = table.box.getCenter(new THREE.Vector3());
        const bar = post.bar;
        p.plan.unshift({ carry: 'cup' }, { go: new THREE.Vector3(c.x + 0.8, T(post.f), c.z) }, { wait: 2 }, { carry: null }, { go: new THREE.Vector3(bar.x + 1.2, T(post.f), bar.z + (Math.random() - 0.5) * 3) }, { wait: 3 + Math.random() * 3 });
        break;
      }
      case 'cleaner': case 'porter': {
        const to = post.kind === 'porter' && this.crates.length ? this.fx.people._spot(post.f, this.crates[(Math.random() * this.crates.length) | 0].box.getCenter(new THREE.Vector3()), 1.2) : this.fx.people._spot(post.f, p.pos, 4);
        if (to) p.plan.unshift({ go: to }, { wait: 4 + Math.random() * 8 });
        p.armUp = post.kind === 'cleaner' ? 0.35 : 0.6;
        break;
      }
    }
  }

  // ---------------------------------------------------------------- the bank

  // A teller out of cash goes down, opens the vault, fills a tray, comes back.
  _vaultRun(p, post) {
    const door = this.fx.vaultDoor?.();
    if (!door || door.state !== 'static') { post.cash = 6; return; }
    post.run = true;
    const c = door.box.getCenter(new THREE.Vector3());
    const front = new THREE.Vector3(c.x, T(LOWER), c.z + 1.4), inside = new THREE.Vector3(c.x, T(LOWER), c.z - 2.2);
    const back = new THREE.Vector3(post.x, post.y, post.z);
    p.sitting = false;
    p.plan.unshift(
      { go: new THREE.Vector3(post.x, post.y, post.z + 1.5) },
      ...this._route(p, post.f, LOWER, front),
      { fn: () => this.fx.bank?.vaultOpen?.(true) }, { wait: 1.5 }, { go: inside }, { wait: 6 }, { carry: 'box' }, { go: front },
      { fn: () => this.fx.bank?.vaultOpen?.(false) }, { carry: null },
      ...this._route(p, LOWER, post.f, back),
      { sit: post.sit, yaw: post.yaw, y: post.y }, { fn: () => { post.cash = 6; post.run = false; } },
    );
  }

  // The morning's cash: two couriers carry boxes down and stack them in a corner.
  _delivery() {
    for (let n = 0; n < 2; n++) {
      const p = this._new(0, this._pavement(), 'courier');
      if (!p) continue;
      const corner = new THREE.Vector3(-21 + n * 0.8, T(LOWER), -3.5);
      p.carry = 'box';
      p.plan = [...this._enter(), ...this._route(p, 0, LOWER, corner), { wait: 1 }, { fn: () => this.stack.push(corner.clone().setY(T(LOWER) + 0.18 + 0.36 * (this.stack.length % 3)).add(new THREE.Vector3((this.stack.length % 2) * 0.5, 0, Math.floor(this.stack.length / 6) * 0.45))) }, { carry: null },
        ...this._route(p, LOWER, 0, this._doorIn()), ...this._exit()];
    }
    this.fx.hud?.flash('A cash delivery is coming in', 2);
  }

  // ---------------------------------------------------------------- props in hands

  _props() {
    let b = 0, c = 0;
    for (const p of this.managed) {
      if (!p.carry || p.hidden || p.state === 'gone') continue;
      const side = 0.3, sx = Math.cos(p.yaw), sz = -Math.sin(p.yaw);
      if (p.carry === 'cup' && c < 80) {
        _m.compose(_v.set(p.pos.x + sx * side + Math.sin(p.yaw) * 0.25, p.pos.y + 1.1, p.pos.z + sz * side + Math.cos(p.yaw) * 0.25), _q.identity(), _s.set(1, 1, 1));
        this.cups.setMatrixAt(c++, _m);
      } else if (p.carry === 'bag' || p.carry === 'box') {
        const box = p.carry === 'box';
        _m.compose(box ? _v.set(p.pos.x + Math.sin(p.yaw) * 0.35, p.pos.y + 1.0, p.pos.z + Math.cos(p.yaw) * 0.35) : _v.set(p.pos.x + sx * side, p.pos.y + 0.55, p.pos.z + sz * side),
          _q.setFromEuler(_e.set(0, p.yaw, 0)), box ? _s.set(1.6, 1, 1.6) : _s.set(1, 1, 1));
        this.bags.setMatrixAt(b, _m);
        this.bags.setColorAt(b, _c.set(box ? 0x8a6a48 : p.bagColour ?? 0xf2f0ea));
        b++;
      }
      if (b >= 160 || c >= 80) break;
    }
    this.bags.count = b; this.cups.count = c;
    this.bags.instanceMatrix.needsUpdate = true; this.cups.instanceMatrix.needsUpdate = true;
    if (this.bags.instanceColor) this.bags.instanceColor.needsUpdate = true;
    // The delivered boxes, stacked.
    this.stack.forEach((at, i) => { _m.compose(at, _q.identity(), _s.set(1, 1, 1)); this.boxes.setMatrixAt(i, _m); });
    this.boxes.count = this.stack.length;
    this.boxes.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const p of this.managed) p.job = null;
    this.managed.clear();
    this.posts = [];
    this.stack = [];
    this.on = false;
    this.bags.count = this.cups.count = this.boxes.count = 0;
  }
}
