import * as THREE from 'three';
import { crack } from '../damage/cracks.js';
import { groundAt } from '../building/plan.js';

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
    this._cracks = 3;
    // When a lot is loose, small bits go sooner.
    const crowded = this.physics.dynamic.size > 150;
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
        if (this.time - p.born > (crowded ? 1.2 : FADE_AFTER) + (p.id % 7) * 0.25) this.fading.set(p, 0);
      }
      // Big ones that have stopped are frozen — asleep, or barely creeping for
      // four seconds: a heavy lump wedged in a heap can rock at a few
      // centimetres a second for ever, never sleep, and keep the whole
      // simulation stepping for nothing.
      if (b.isSleeping() || s < 0.5) {
        const t = (this.rest.get(p) ?? 0) + dt;
        this.rest.set(p, t);
        if (!small && ((t > 2.5 && (b.isSleeping() || s < 0.15)) || t > 4)) this._freeze(p);
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
    // Structure judges it as it judges rubble landing — against its own weight
    // falling three metres — not by sledge blows, of which a tonne of debris
    // is hundreds: judged by those, every lump that bounced off the podium
    // roof broke a bay of it, and the podium went floor by floor.
    for (const q of hit) this.absorb(q, blows / hit.size, at, p);
    // And it smashes itself, if it came down hard enough.
    if (v > 6 && p.state === 'dynamic') {
      p.hp -= blows * 0.35;
      if (p.hp <= 0 && p.volume > 0.004) damage.fractureSoon(p, at, new THREE.Vector3(Math.random() - 0.5, -1, Math.random() - 0.5).normalize(), Math.min(4, v / 4), v > 12 ? 3 : 1);
    }
  }

  // A piece struck by something falling: cracks, loses durability, and breaks
  // if it runs out.
  _take(q, blows, from, by) {
    const { damage, structure } = this.fx;
    if (q.kind.glass && q.role === 'glass') { damage.hit(q, q.box.clampPoint(from, _v).clone(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), 2); return; }
    q.hp -= blows;
    const point = q.box.clampPoint(from, new THREE.Vector3());
    point.y = Math.min(q.box.max.y, by.box.min.y + 0.01);
    // Cracks cost a decal cut each, so only a few per frame.
    if (blows > 0.5 && this._cracks-- > 0) {
      crack(this.pieces, q, point, new THREE.Vector3(0, 1, 0), Math.min(3, 0.8 + Math.sqrt(blows) * 0.4));
    }
    if (q.structural || q.role === 'slab') structure?.mark();
    if (q.hp > 0) return;
    // A floor laid on the ground cracks, but there is nowhere for it to fall.
    if (q.role === 'slab' && q.box.min.y < groundAt((q.box.min.x + q.box.max.x) / 2, (q.box.min.z + q.box.max.z) / 2) + 0.05) { q.hp = Math.max(q.hp, 0.01); return; }
    const load = q.role === 'column' || q.role === 'core';
    if (load) damage.failSoon(q, point, new THREE.Vector3(0, -1, 0));
    else damage.fractureSoon(q, point, new THREE.Vector3(0, -1, 0), Math.min(4, 1 + blows / 50), blows > 100 ? 2 : 1);
  }

  // Rubble landing on something still standing. A floor is built to carry its
  // load and then some: it breaks when what lands on it puts more into it than
  // its own weight falling three metres — at once, or in quick succession.
  // What it has taken fades, half of it in a second and a half: a floor
  // rings and settles between blows. Summed over a whole collapse instead,
  // twenty seconds of grit drizzling onto the podium roof added up to a
  // tonne dropped three metres, and the podium went storey by storey.
  // Until it goes it cracks, the more the nearer it is. A column or wall the same.
  absorb(q, blows, from, by) {
    if (!(q.structural || q.role === 'slab')) return this._take(q, blows, from, by);
    const J = blows * BLOW;
    const cap = q.volume * q.kind.density * 9.81 * 3 * (q.tough ?? 1);
    if (q.shockT !== undefined) q.shock *= Math.exp(-(this.time - q.shockT) / 2);
    q.shockT = this.time;
    q.shock = (q.shock ?? 0) + J;
    const point = q.box.clampPoint(from, new THREE.Vector3());
    point.y = Math.min(q.box.max.y, by.box.min.y + 0.01);
    if (J > cap * 0.05 && this._cracks-- > 0) crack(this.pieces, q, point, new THREE.Vector3(0, 1, 0), Math.min(3, 0.8 + 2.2 * Math.min(1, q.shock / cap)));
    if (q.shock < cap) return;
    q.hp = 0;
    this._take(q, 1, from, by);
  }

  // Fade out the n smallest loose bits, to make room for something bigger.
  makeRoom(n) {
    const small = [...this.physics.dynamic].filter((p) => !this.fading.has(p) && p.body && (p.role === 'fragment' || p.role === 'shard'))
      .sort((a, b) => a.volume - b.volume).slice(0, n);
    for (const p of small) this.fading.set(p, 0);
  }

  // Anything loose that has come to rest — a fragment, or a whole column or
  // mullion knocked down in one piece — leaves the simulation. (Only fragments
  // did once: a column lying in the rubble rocked at a centimetre a second for
  // ever and kept every step of the world being paid for.)
  _freeze(p) {
    // Glass that has come down does not lie there in panes: it breaks up, and
    // goes like the other small bits.
    if (p.kind.glass) { this.fading.set(p, 0); return; }
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
