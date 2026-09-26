import * as THREE from 'three';

// What happens when something heavy lands.
//
// Every frame, each heavy falling piece's speed is compared with the last
// frame's; a sudden stop is an impact, and its energy — half the mass times the
// speed it was doing — decides the rest:
//
//  * **It smashes** if it came down fast enough: a slab bay dropped a storey
//    breaks into pieces with rough broken faces.
//  * **What it hit may go too.** A slab that takes more than it can absorb
//    breaks under it and drops everything it was carrying onto the floor
//    below, which is a chain reaction for as long as each floor falls far
//    enough to break the next.
//  * **Dust.** Every heavy landing throws up a cloud, bigger the heavier it
//    was, thick enough to hide in.
//
// Rubble that has come to rest is frozen: it keeps its shape and collider but
// leaves the physics simulation, so a floor's worth of debris costs nothing.

const HEAVY = 150;           // kg: lighter things just land
const SMASH_SPEED = 6;       // m/s: about a two-metre drop
const _v = new THREE.Vector3();

export class Impacts {
  constructor(pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;              // { damage, cloud, audio, shake, player, structure }
    this.speed = new Map();
    this.rest = new Map();
    this.queue = [];           // smashes, a few per frame
  }

  update(dt) {
    for (const p of this.physics.dynamic) {
      const b = p.body;
      if (!b) continue;
      if (b.isSleeping()) {
        const t = (this.rest.get(p) ?? 0) + dt;
        this.rest.set(p, t);
        if (t > 2.5) this._freeze(p);
        continue;
      }
      this.rest.set(p, 0);
      const lv = b.linvel();
      const s = Math.hypot(lv.x, lv.y, lv.z);
      const before = this.speed.get(p) ?? s;
      this.speed.set(p, s);
      if (before - s > 4 && before > SMASH_SPEED * 0.7) {
        const m = b.mass();
        if (m >= HEAVY) this.queue.push({ p, v: before, m });
      }
    }
    // A handful per frame: each smash is a few CSG cuts.
    for (let n = 0; n < 3 && this.queue.length; n++) {
      const { p, v, m } = this.queue.shift();
      if (p.state !== 'dynamic') continue;
      this._impact(p, v, m);
    }
  }

  _impact(p, v, m) {
    const { damage, cloud, audio, shake, player } = this.fx;
    const at = p.box.getCenter(new THREE.Vector3());
    const energy = 0.5 * m * v * v;
    audio?.impact(at.x, at.y, at.z, Math.min(1, energy / 4e5));
    cloud?.(new THREE.Vector3(at.x, p.box.min.y + 0.3, at.z), Math.min(3, Math.sqrt(m) / 40));
    if (player) {
      const d = player.pos.distanceTo(at);
      shake?.add(Math.max(0, Math.min(0.6, energy / 3e6) - d / 60));
    }
    // What it landed on.
    const hit = new Set();
    const c = p.body.collider(0);
    if (c) {
      this.physics.world.contactPairsWith(c, (other) => {
        const o = this.physics.owner.get(other.handle);
        if (o && o.parts && o.state === 'static') hit.add(o);
      });
    }
    for (const q of hit) {
      if (q.role !== 'slab' && q.role !== 'stair' && q.role !== 'ceiling' && q.role !== 'carpet') continue;
      // What a floor can take before it goes: its own weight falling about
      // three metres onto it.
      const mass = q.volume * q.kind.density;
      q.absorbed = (q.absorbed ?? 0) + energy;
      if (q.absorbed > mass * 9.81 * 3) {
        damage.fracture(q, q.box.clampPoint(at, _v).clone(), new THREE.Vector3(0, -1, 0), 2);
        this.fx.structure?.mark();
      }
    }
    if (v >= SMASH_SPEED && p.volume > 0.02) {
      damage.fracture(p, at, new THREE.Vector3(0, -1, 0).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)), Math.min(4, v / 4), v > 12 ? 3 : 1);
    }
  }

  _freeze(p) {
    if (p.role !== 'fragment' && p.role !== 'shard') return;
    this.rest.delete(p);
    this.speed.delete(p);
    this.pieces.freeze(p);
  }

  clear() {
    this.speed.clear();
    this.rest.clear();
    this.queue.length = 0;
  }
}
