import * as THREE from 'three';
import { crack } from '../damage/cracks.js';

// What happens when something lands.
//
// Every frame, each falling piece's speed is compared with the last frame's; a
// sudden stop is an impact, and its energy — half the mass times the speed
// squared — is turned into **blows**, one blow being what a sledge swing puts
// in (about 560 J). Those blows are dealt to whatever it landed on: they crack
// it, use up its durability, and if it runs out, break it. A head-sized lump
// dropped a storey cracks the floor; a slab bay dropped a storey goes straight
// through the next one, and that is a chain reaction.
//
// What landed may smash too, if it came down fast enough. Heavy landings throw
// up dust. And **small bits do not stay**: a fragment too light to matter
// lies where it fell for a few seconds and then is gone.
//
// Rubble that is big enough to keep and has come to rest is frozen: it keeps
// its shape and collider but leaves the physics simulation.

const BLOW = 560;              // J: one sledge swing
const MIN_MASS = 12;           // kg: lighter things just land
const SMALL = 25;              // kg: bits lighter than this fade away
const FADE_AFTER = 3.5;        // s after they break off, plus a little
const _v = new THREE.Vector3();

export class Impacts {
  constructor(pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;              // { damage, cloud, audio, shake, player, structure }
    this.speed = new Map();
    this.rest = new Map();
    this.fading = new Map();
    this.queue = [];
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const p of this.physics.dynamic) {
      const b = p.body;
      if (!b) continue;
      const m = b.mass();
      const small = m < SMALL && (p.role === 'fragment' || p.role === 'shard');
      const lv = b.linvel();
      const s = Math.hypot(lv.x, lv.y, lv.z);
      // Small bits go a few seconds after they break off — by age, not by
      // resting: a heap of them jostles for ever and never quite comes to rest.
      if (small && !this.fading.has(p)) {
        p.born ??= this.time;                  // simulation time, not the wall clock
        if (this.time - p.born > FADE_AFTER + (p.id % 7) * 0.25) this.fading.set(p, 0);
      }
      // Big ones that have stopped are frozen.
      if (b.isSleeping() || s < 0.15) {
        const t = (this.rest.get(p) ?? 0) + dt;
        this.rest.set(p, t);
        if (!small && t > 2.5 && b.isSleeping()) this._freeze(p);
      } else this.rest.set(p, 0);
      const before = this.speed.get(p) ?? s;
      this.speed.set(p, s);
      if (m >= MIN_MASS && before - s > 3 && before > 3.5) this.queue.push({ p, v: before, m });
    }
    for (let n = 0; n < 4 && this.queue.length; n++) {
      const { p, v, m } = this.queue.shift();
      if (p.state === 'dynamic') this._impact(p, v, m);
    }
    // Shrink the fading bits away.
    for (const [p, t] of this.fading) {
      if (p.state === 'dead') { this.fading.delete(p); continue; }
      const k = t + dt;
      this.fading.set(p, k);
      if (p.object) p.object.scale.setScalar(Math.max(0.01, 1 - k / 0.6));
      if (k >= 0.6) { this.fading.delete(p); this.speed.delete(p); this.rest.delete(p); this.pieces.destroy(p); }
    }
  }

  _impact(p, v, m) {
    const { damage, cloud, audio, shake, player } = this.fx;
    const at = p.box.getCenter(new THREE.Vector3());
    const energy = 0.5 * m * v * v;
    const blows = energy / BLOW;
    audio?.impact(at.x, at.y, at.z, Math.min(1, blows / 40));
    if (m > 120) cloud?.(new THREE.Vector3(at.x, p.box.min.y + 0.3, at.z), Math.min(3, Math.sqrt(m) / 40));
    if (player && m > 200) {
      const d = player.pos.distanceTo(at);
      shake?.add(Math.max(0, Math.min(0.6, energy / 3e6) - d / 60));
    }
    // What it landed on takes the blows.
    const hit = new Set();
    for (let n = 0; n < p.body.numColliders(); n++) {
      this.physics.world.contactPairsWith(p.body.collider(n), (other) => {
        const o = this.physics.owner.get(other.handle);
        if (o && o.parts && o !== p && o.state !== 'dead') hit.add(o);
      });
    }
    for (const q of hit) this._take(q, blows / hit.size, at, p);
    // And it smashes itself, if it came down hard enough.
    if (v > 6 && p.state === 'dynamic') {
      p.hp -= blows * 0.35;
      if (p.hp <= 0 && p.volume > 0.004) damage.fracture(p, at, new THREE.Vector3(Math.random() - 0.5, -1, Math.random() - 0.5).normalize(), Math.min(4, v / 4), v > 12 ? 3 : 1);
    }
  }

  // A piece struck by something falling: cracks, loses durability, and breaks
  // if it runs out.
  _take(q, blows, from, by) {
    const { damage, structure } = this.fx;
    if (q.kind.name === 'glass' && q.role === 'glass') { damage.hit(q, q.box.clampPoint(from, _v).clone(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), 2); return; }
    q.hp -= blows;
    const point = q.box.clampPoint(from, new THREE.Vector3());
    point.y = Math.min(q.box.max.y, by.box.min.y + 0.01);
    if (blows > 0.5 && q.parts.some((r) => r.mesh || q.state === 'static')) {
      crack(this.pieces, q, point, new THREE.Vector3(0, 1, 0), Math.min(3, 0.8 + Math.sqrt(blows) * 0.4));
    }
    if (q.structural || q.role === 'slab') structure?.mark();
    if (q.hp > 0) return;
    const load = q.role === 'column' || q.role === 'core';
    if (load) damage.fail(q, point, new THREE.Vector3(0, -1, 0));
    else damage.fracture(q, point, new THREE.Vector3(0, -1, 0), Math.min(4, 1 + blows / 50), blows > 100 ? 2 : 1);
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
    this.fading.clear();
    this.queue.length = 0;
  }
}
