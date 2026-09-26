import * as THREE from 'three';
import { shatter } from '../damage/glass.js';

// Explosions: a gas tank going off, a transformer, a charge.
//
// Within the radius, a blast breaks what it can break and throws what it
// cannot: glass is blown out to twice the radius, furniture and partitions are
// smashed and thrown, a column close enough gives way, and a slab takes a hole.
// Fire is left behind in anything that burns, tanks nearby are set off in turn
// a moment later, and the pressure wave hurts anyone standing too close.

const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Blast {
  constructor(ctx) {
    this.ctx = ctx;    // { pieces, damage, physics, particles, chips, fire, audio, shake, player, structure }
    this.queue = [];
    this.count = 0;
  }

  // A tank piece goes off where it stands.
  tank(p) {
    if (p.state === 'dead') return;
    p.box.getCenter(_c);
    const r = Math.max(...p.parts.map((q) => q.kind.explodes)) || 3;
    const at = _c.clone();
    this.ctx.pieces.destroy(p);
    this.explode(at, r);
  }

  later(fn, delay) { this.queue.push({ fn, t: delay }); }

  explode(at, r) {
    const { pieces, damage, physics, particles, chips, fire, audio, shake, player, structure } = this.ctx;
    this.count++;
    // Fireball, sparks, smoke.
    particles.spawn('flash', at.x, at.y, at.z);
    particles.burst('flame', at.x, at.y, at.z, 90, r * 3, undefined, 2);
    particles.burst('spark', at.x, at.y, at.z, 120, r * 6, undefined, 3);
    particles.burst('smoke', at.x, at.y, at.z, 50, r * 1.2, undefined, 1.5);
    particles.burst('bigdust', at.x, at.y, at.z, 16, r * 1.5);
    audio?.explosion(at.x, at.y, at.z, r);

    const seen = new Set();
    const hits = [];
    physics.overlapSphere(at, r * 2, (o) => {
      if (!o || !o.parts || seen.has(o) || o.state === 'dead') return;
      seen.add(o);
      hits.push(o);
    });
    for (const p of hits) {
      if (p.state === 'dead') continue;
      const d = Math.max(0.05, p.box.distanceToPoint(at));
      p.box.getCenter(_c);
      const out = _d.copy(_c).sub(at);
      if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
      out.normalize();
      const k = 1 - d / (r * 2);
      if (p.kind.explodes > 0 && d < r) { this.later(() => this.tank(p), 0.08 + Math.random() * 0.25); continue; }
      if (p.role === 'glass') {
        const local = damage.toLocal(p, p.box.clampPoint(at, new THREE.Vector3()));
        shatter(pieces, p, local, out.clone().multiplyScalar(1 + k * 3), { coarse: true, keepEdges: k < 0.5, chip: (w, push) => chips.burst('glass', w, push, 2, 4, 0.02) });
        continue;
      }
      if (d > r) {
        if (p.body) p.body.applyImpulse({ x: out.x * k * 400, y: out.y * k * 400 + 80 * k, z: out.z * k * 400 }, true);
        continue;
      }
      const near = 1 - d / r;
      if (p.role === 'column' || p.role === 'core') {
        p.hp -= near * 30;
        if (p.hp <= 0) damage.fail(p, _c.clone(), out.clone());
        continue;
      }
      if (p.role === 'slab') {
        // A hole in the floor.
        if (near > 0.3) {
          const hit = p.box.clampPoint(at, new THREE.Vector3());
          damage._bite(p, hit, out.clone().negate(), out.clone(), r * 0.45 * near, r * 0.5, p.kind);
          if (near > 0.85) damage.fracture(p, hit, out.clone(), 3);
        }
        continue;
      }
      if (p.role === 'stair' || p.role === 'ceiling' || p.role === 'carpet' || p.role === 'mullion' || p.role === 'spandrel' || p.role === 'wall' || p.role === 'furniture' || p.role === 'lamp' || p.role === 'fragment' || p.role === 'tank') {
        if (near > 0.35 && p.role !== 'stair' && p.volume < 6) damage.fracture(p, p.box.clampPoint(at, new THREE.Vector3()), out.clone(), 4 * near);
        else {
          if (p.state === 'static' && p.role !== 'stair' && p.role !== 'carpet') pieces.makeDynamic(p);
          if (p.body) p.body.applyImpulse({ x: out.x * near * 600, y: out.y * near * 600 + 150 * near, z: out.z * near * 600 }, true);
        }
      }
    }
    fire.igniteAround(at, r * 1.3, 0.55);
    structure.mark();
    if (player && !player.dead) {
      const d = Math.hypot(player.pos.x - at.x, player.pos.y + 0.9 - at.y, player.pos.z - at.z);
      if (d < r * 2.5) player.damage(140 * (1 - d / (r * 2.5)) ** 1.5, 'explosion');
      shake?.add(Math.max(0, 1.3 - d / (r * 7)));
    }
  }

  update(dt) {
    if (!this.queue.length) return;
    const due = [];
    this.queue = this.queue.filter((e) => ((e.t -= dt) > 0 ? true : (due.push(e), false)));
    for (const e of due) e.fn();
  }

  clear() { this.queue.length = 0; }
}
