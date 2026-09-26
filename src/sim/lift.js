import * as THREE from 'three';
import { KIND } from '../render/materials.js';
import { box } from '../render/geometry.js';
import { G_WORLD } from '../physics.js';
import { LIFT, T, TOP_FLOOR, CORE } from '../building/plan.js';

// The lift: a car in the core's lift shaft, from the lobby to the penthouse.
//
// Inside it, E takes you up a floor and Q down one; hold either and it keeps
// going. Outside, stand at the brass doors and press E to call it. The landing
// doors are pieces of the building like anything else — they slide open when
// the car arrives and shut before it leaves, and if you have smashed them the
// shaft is open and it is a long way down.
//
// The car itself is a kinematic body, not a piece: you cannot break a lift car
// with a hammer, and it would take a great deal of machinery to let you. If the
// tower comes down around it, it stops working.

const SPEED = 4.5;            // m/s
const ACCEL = 3;
const DOOR_TIME = 0.9;        // s to open or close
const WAIT = 3;               // s the doors stay open with nobody in the car
const CAR = { x0: 0.45, x1: 4.35, z0: -2.9, z1: 3.0, h: 2.6 };
const SLIDE = 1.15;           // how far each door leaf slides into the wall

export class Lift {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.group = new THREE.Group();
    this.group.name = 'lift';
    this._buildCar();
    scene.add(this.group);
    // Fixed colliders moved by hand, not a kinematic body. The character
    // controller would not walk off the floor of a kinematic car: resting on it
    // at its usual skin distance it reported a contact at zero and refused to
    // move sideways at all. The ground's fixed colliders never do that.
    const R = physics.R;
    const c = (x0, y0, z0, x1, y1, z1) => {
      const col = physics.world.createCollider(
        R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setCollisionGroups(G_WORLD),
        physics.fixed);
      col.userData = { y: (y0 + y1) / 2, x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
      return col;
    };
    const { x0, x1, z0, z1, h } = CAR;
    this.colliders = [
      c(x0, -0.12, z0, x1, 0, z1), c(x0, 0, z0, x1, h, z0 + 0.08),
      c(x0, 0, z0, x0 + 0.08, h, z1), c(x1 - 0.08, 0, z0, x1, h, z1), c(x0, h, z0, x1, h + 0.1, z1),
    ];
    this.reset();
  }

  _buildCar() {
    const { x0, x1, z0, z1, h } = CAR;
    const add = (kind, w, hh, d, x, y, z, tint) => {
      const m = KIND[kind].material.clone();
      if (tint !== undefined) m.color = new THREE.Color(tint);
      const mesh = new THREE.Mesh(box(w, hh, d, new THREE.Vector3(x, y, z)), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    add('marble', w, 0.12, d, cx, -0.06, cz);
    add('wood', w, h, 0.08, cx, h / 2, z0 + 0.04, 0x6a3a22);
    add('wood', 0.08, h, d, x0 + 0.04, h / 2, cz, 0x6a3a22);
    add('wood', 0.08, h, d, x1 - 0.04, h / 2, cz, 0x6a3a22);
    add('brass', w, 0.1, d, cx, h + 0.05, cz);
    add('glass', w - 0.6, 1.6, 0.01, cx, 1.4, z0 + 0.09, 0xc8d0d8);         // mirror
    add('brass', w - 0.2, 0.04, 0.04, cx, 0.95, z0 + 0.12);                  // hand rail
    add('brass', 0.04, 0.04, d - 0.2, x0 + 0.12, 0.95, cz);
    add('brass', 0.04, 0.04, d - 0.2, x1 - 0.12, 0.95, cz);
    add('brass', 0.03, 0.5, 0.2, x1 - 0.09, 1.2, z1 - 0.4);                  // button panel
    add('lamp', w - 0.8, 0.02, d - 0.8, cx, h - 0.01, cz);
  }

  reset() {
    this.floor = 0;
    this.target = 0;
    this.y = T(0);
    this.v = 0;
    this.door = 0;              // 0 shut .. 1 open
    this.phase = 'open';        // 'open' | 'closing' | 'moving' | 'opening'
    this.wait = WAIT;
    this.doors = [];
    this.broken = false;
    this._place();
  }

  // After a job loads: find the landing doors, floor by floor.
  attach(pieces) {
    this.reset();
    this.pieces = pieces;
    for (const p of pieces.list) {
      if (p.role !== 'liftdoor') continue;
      const d = (this.doors[p.floor] ??= {});
      d[p.tag] = { piece: p, shut: p.pos.clone() };
    }
    this.phase = 'opening';
  }

  // Is the player standing in the car?
  inside(pos) {
    return pos.x > CAR.x0 && pos.x < CAR.x1 && pos.z > CAR.z0 && pos.z < CAR.z1 + 0.2 && Math.abs(pos.y - this.y) < 0.5;
  }

  // Standing at the landing doors of a floor, and which floor.
  landingAt(pos) {
    if (pos.x < LIFT.door0 - 1 || pos.x > LIFT.door1 + 1 || pos.z < CORE.z1 - 0.2 || pos.z > CORE.z1 + 2.5) return -1;
    const f = Math.round((pos.y - T(0)) / 4);
    return f >= 0 && f <= TOP_FLOOR && Math.abs(pos.y - T(f)) < 0.6 ? f : -1;
  }

  // Handle the keys. Returns a line for the HUD, or null.
  control(input, player) {
    if (this.broken) return null;
    const pos = player.pos;
    if (this.inside(pos)) {
      const up = input.down('KeyE'), down = input.down('KeyQ');
      if (input.pressed('KeyE')) this.go(this._next(+1));
      if (input.pressed('KeyQ')) this.go(this._next(-1));
      // Held: keep going past each floor.
      if (this.phase === 'moving') {
        if (up && this.target <= this._passing() && this.target < TOP_FLOOR) this.target = Math.min(TOP_FLOOR, this._passing() + 1);
        if (down && this.target >= this._passing() && this.target > 0) this.target = Math.max(0, this._passing() - 1);
      }
      const at = this.phase === 'moving' ? this._passing() : this.floor;
      return `Lift · floor ${at}${this.phase === 'moving' ? ` → ${this.target}` : ''} — E up, Q down, hold to keep going`;
    }
    const f = this.landingAt(pos);
    if (f >= 0) {
      if (input.pressed('KeyE')) this.go(f);
      return this.floor === f && this.phase !== 'moving' ? 'Lift is here' : 'E — call the lift';
    }
    return null;
  }

  _passing() { return Math.max(0, Math.min(TOP_FLOOR, Math.round((this.y - T(0)) / 4))); }

  _next(dir) {
    const from = this.phase === 'moving' ? this.target : this.floor;
    return Math.max(0, Math.min(TOP_FLOOR, from + dir));
  }

  go(f) {
    if (this.broken) return;
    if (f === this.floor && this.phase !== 'moving') { this.phase = 'opening'; this.wait = WAIT; return; }
    this.target = f;
    if (this.phase === 'open' || this.phase === 'opening') this.phase = 'closing';
  }

  update(dt, player, structure) {
    if (structure?.collapsing) this.broken = true;
    const before = this.y;
    if (this.phase === 'closing') {
      this.door = Math.max(0, this.door - dt / DOOR_TIME);
      if (this.door === 0) this.phase = this.target !== this.floor ? 'moving' : 'open';
    } else if (this.phase === 'opening') {
      this.door = Math.min(1, this.door + dt / DOOR_TIME);
      if (this.door === 1) { this.phase = 'open'; this.wait = WAIT; }
    } else if (this.phase === 'moving' && !this.broken) {
      const goal = T(this.target);
      const dist = goal - this.y;
      const dir = Math.sign(dist);
      // Speed up, cruise, and slow down to arrive level with the floor.
      const vMax = Math.min(SPEED, Math.sqrt(2 * ACCEL * Math.abs(dist)) + 0.05);
      this.v = Math.min(vMax, this.v + ACCEL * dt);
      const step = Math.min(Math.abs(dist), this.v * dt);
      this.y += dir * step;
      if (Math.abs(goal - this.y) < 1e-3) {
        this.y = goal;
        this.v = 0;
        this.floor = this.target;
        this.phase = 'opening';
      }
    }
    this._doors();
    this._place();
    // The car holds up whoever stands in it, itself: it puts them on its
    // floor while it moves, and will not let them sink below that floor while
    // it stands. Leaving this to physics failed twice — a kinematic car floor
    // froze the controller, and a floor moved by hand was not always seen.
    if (player && player.pos.x > CAR.x0 && player.pos.x < CAR.x1 && player.pos.z > CAR.z0 && player.pos.z < CAR.z1 + 0.2) {
      const floor = this.y + 0.02;
      if (this.y !== before && Math.abs(player.pos.y - before) < 0.5) { player.pos.y = floor; player.vel.y = 0; }
      else if (player.pos.y < floor && player.pos.y > floor - 0.6) { player.pos.y = floor; player.vel.y = Math.max(0, player.vel.y); player.grounded = true; }
    }
  }

  _doors() {
    // Only the doors at the floor the car is standing at ever open.
    for (let f = 0; f < this.doors.length; f++) {
      const d = this.doors[f];
      if (!d) continue;
      const k = f === this.floor && this.phase !== 'moving' ? this.door : 0;
      for (const [tag, sign] of [['left', -1], ['right', 1]]) {
        const leaf = d[tag];
        if (!leaf || leaf.piece.state !== 'static') continue;
        const want = leaf.shut.x + sign * SLIDE * k;
        if (Math.abs(leaf.piece.pos.x - want) < 1e-4) continue;
        this.pieces.move(leaf.piece, new THREE.Vector3(want, leaf.shut.y, leaf.shut.z));
      }
    }
  }

  _place() {
    this.group.position.set(0, this.y, 0);
    for (const c of this.colliders) {
      const o = c.userData;
      c.setTranslation({ x: o.x, y: o.y + this.y, z: o.z });
    }
  }
}
