import * as THREE from 'three';
import { subtract, chunkOff } from './cutter.js';
import { fractureAsync, subtractAsync, forgetJobs } from './csg.js';
import { addSplinters } from './splinters.js';
import { crack as crackGlass, shatter } from './glass.js';
import { crack } from './cracks.js';
import { insideMaterial } from '../render/materials.js';
import { box } from '../render/geometry.js';

// What a blow does to the thing it lands on.
//
// Every tool and every blast comes through `hit` with a point, the direction
// it was travelling, and how much energy it carried (a sledge swing is about 1).
// What happens next depends on what the piece is made of:
//
// Everything has **durability** — so many blows, by material and size (see
// HITS in render/materials.js) — and every blow uses some up. The less is left,
// the bigger the next bite and the more cracked it looks (damage/cracks.js),
// the less it can carry (building/support.js) and the more easily something
// falling on it breaks it (sim/impacts.js). At none it gives way.
//
//   wood, plaster, fabric   most of what you hit is gone: a big jagged hole,
//                           splinters round the rim of wood
//   concrete, marble        a head-sized lump comes away and falls. Columns and
//                           core walls give way sooner the more they carry,
//                           leaving a stub with its bars sticking out
//   metal, brass            dents and sparks; after many blows it snaps
//   glass                   cracks, then shatters
//   loose furniture         it moves as well — knocked across the room if light

// Keeping a collapse from swamping the frame — without taking the collapse
// away, which is the whole point of the game. Left alone it ran away: a
// falling slab smashed into eight pieces, each of those landed and smashed
// into eight more, and one floor coming down put three thousand bodies into
// the simulation. So the *small* stuff is what gives:
//  * big pieces always break into a few big chunks, and keep falling;
//  * when too much is loose, the smallest bits are faded out to make room
//    (sim/impacts.js), never the big ones;
//  * small fragments of fragments crumble to chips and dust;
//  * breakage from falls and chain reactions waits its turn in a queue with a
//    few milliseconds a frame, so it lands over a second, not in one frame.
const MAX_LOOSE = 180;
const MAX_GEN = 2;
const BIG = 150;             // kg: a piece this heavy always breaks into real chunks
const BUDGET_MS = 4;

const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class Damage {
  constructor(pieces, fx) {
    this.pieces = pieces;
    this.fx = fx;            // { chips, particles, audio, shake }
    this.onStructure = null; // called when something load-bearing changed
    this.pending = [];
    this.broken = [];        // lumps back from the workers, waiting to take their piece's place
  }

  // Break it, but when there is time: from falls, collapses and blasts.
  fractureSoon(p, point, dir, energy = 1, minPasses = 1) {
    if (p.state === 'dead' || p.queued) return;
    p.queued = true;
    this.pending.push(['fracture', p, point.clone(), dir.clone(), energy, minPasses]);
  }

  failSoon(p, point, dir) {
    if (p.state === 'dead' || p.queued) return;
    p.queued = true;
    this.pending.push(['fail', p, point.clone(), dir.clone()]);
  }

  update() {
    const t0 = performance.now();
    // Lumps that have come back from the workers go in first.
    while (this.broken.length && performance.now() - t0 < BUDGET_MS) this._scatter(this.broken.shift());
    while (this.pending.length && performance.now() - t0 < BUDGET_MS) {
      const [what, p, ...args] = this.pending.shift();
      p.queued = false;
      if (p.state === 'dead') continue;
      // A support that has already been knocked loose does not give way
      // where it stood: that left stubs and bars hanging in the air.
      if (what === 'fail' && p.state !== 'static') continue;
      if (what === 'fail') this.fail(p, ...args, { soon: true });
      else this.fracture(p, args[0], args[1], args[2], args[3], 2);   // queued breaks: at most four pieces
    }
  }

  // A job being unloaded: what was queued belongs to pieces that are gone.
  clear() {
    for (const [, p] of this.pending) p.queued = false;
    this.pending.length = 0;
    this.broken.length = 0;
    forgetJobs();
  }

  // Too much is loose already, or this is a fragment of a fragment: instead of
  // more bodies, chips and dust.
  crumble(p, point, dir) {
    this.fx.chips.burst(chipKind(p.kind), point, dir, 8, 2.5, 0.05);
    this._dust(p.kind, point, dir.clone().negate(), 10);
    if (p.volume > 1) this.fx.cloud?.(point, 0.8);
    this.pieces.destroy(p);
    if (p.structural || p.role === 'slab') this.onStructure?.();
    return [];
  }

  // World point -> piece frame.
  toLocal(p, v, out = new THREE.Vector3()) {
    _inv.copy(p.quat).invert();
    return out.copy(v).sub(p.pos).applyQuaternion(_inv);
  }
  dirToLocal(p, d, out = new THREE.Vector3()) {
    _inv.copy(p.quat).invert();
    return out.copy(d).applyQuaternion(_inv).normalize();
  }

  // The part of a piece a point is on: the one whose box it is nearest.
  partAt(p, local) {
    let best = 0, bestD = Infinity;
    p.parts.forEach((q, i) => {
      q.geometry.computeBoundingBox();
      const d = q.geometry.boundingBox.distanceToPoint(local);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  hit(p, point, normal, dir, energy, { tool = 'sledge' } = {}) {
    if (!p || p.state === 'dead') return null;
    const kind = p.parts[this.partAt(p, this.toLocal(p, point))].kind;
    const { audio, particles, chips } = this.fx;
    audio?.hit(kind.sound, point.x, point.y, point.z, Math.min(1.2, energy));

    if (kind.name === 'glass') return this._glass(p, point, dir, energy);
    if (kind.explodes > 0) {
      // Punctured: a jet of gas out of the hole, and a second or so later it goes.
      this.fx.onPuncture?.(p, point, normal);
      return kind;
    }
    if (kind.name === 'lamp') {
      particles.burst('spark', point.x, point.y, point.z, 20, 3);
      chips.burst('glass', point, dir, 10, 2, 0.02);
      this.pieces.destroy(p);
      return kind;
    }

    // Loose things move when you hit them. Whether a thing is loose is what it
    // is, not how big its box is: a desk's bounding box says half a tonne.
    if ((p.state === 'static' || p.state === 'rubble') && LOOSE.has(p.role)) this.pieces.makeDynamic(p);
    if (p.body) {
      const m = Math.max(5, p.body.mass());
      // A sledge head is about 5 kg arriving at 15 m/s.
      const J = energy * 75;
      p.body.applyImpulseAtPoint({ x: dir.x * J, y: dir.y * J + J * 0.15, z: dir.z * J }, point, true);
      if (m < 30) {
        // Light things just get knocked about — until they have had enough.
        p.hp = (p.hp ?? Math.max(1.5, m / 8)) - energy;
        this._dust(kind, point, normal, 4);
        if (p.hp <= 0) this.fracture(p, point, dir, energy);
        return kind;
      }
    }

    // Durability. Every blow uses some up, and how much is left decides both
    // how big a bite the next one takes and how many cracks the piece shows —
    // a fresh wall gives up a hole, a cracked one gives up half of itself.
    p.hp -= energy;
    const weak = 1 - THREE.MathUtils.clamp(p.hp / p.hpMax, 0, 1);
    const tough = kind.toughness;
    if (kind.metal) {
      // Metal dents, cracks, and in the end snaps.
      particles.burst('spark', point.x, point.y, point.z, 14, 4);
      const r = 0.05 + weak * 0.07;
      this._bite(p, point, normal, dir, r, r * 0.8, kind, { chips: false });
    } else if (tough >= 8) {
      // Stone: a head-sized lump comes away, bigger as it weakens.
      this._chunk(p, point, normal, dir, (0.19 + weak * 0.14 + Math.random() * 0.04) * Math.sqrt(energy), kind);
    } else {
      // Soft things lose most of what you hit.
      const r = THREE.MathUtils.clamp((0.36 + weak * 0.3) * Math.sqrt(energy), 0.2, 0.8);
      this._bite(p, point, normal, dir, r, r * (kind.splinters ? 2.2 : 1.8), kind);
    }
    if (p.state === 'dead') return kind;
    crack(this.pieces, p, point, normal, 0.7 + weak * 1.6);
    if (p.structural || p.role === 'slab') this.onStructure?.();

    const load = p.role === 'column' || p.role === 'core';
    if (p.hp <= 0 || (load && this.fx.mustFail?.(p))) {
      if (load) this.fail(p, point, dir);
      else this.fracture(p, point, dir, energy + 1);
    }
    return kind;
  }

  // Knock a lump off a piece: the lump is a real piece of it — its outside is
  // the piece's own surface, its broken faces are the material's inside — and
  // it falls. What is left has the matching hole in it.
  _chunk(p, point, normal, dir, radius, kind) {
    const { chips } = this.fx;
    const local = this.toLocal(p, point);
    const ln = this.dirToLocal(p, normal);
    const part = this.partAt(p, local);
    const q = p.parts[part];
    // Centred just inside the surface, so the blob takes a lump that stands
    // proud of the face and leaves a dished scar.
    const centre = local.clone().addScaledVector(ln, -radius * 0.35);
    let out;
    try {
      const mats = q.materials ?? (Array.isArray(q.mesh?.material) ? q.mesh.material : [this.pieces._material(q)]);
      out = chunkOff(q.geometry, mats, insideMaterial(kind.name), centre, ln.clone().negate(), radius, radius * 1.2);
    } catch (e) { console.warn('chunk failed', e); return; }
    if (out.rest.geometry.attributes.position.count === 0) { this.pieces.destroy(p); return; }
    this.pieces.reshape(p, part, out.rest.geometry, out.rest.materials);
    p.bites++;
    const g = out.chunk.geometry;
    if (g.attributes.position.count > 0) {
      g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      // Start it a little proud of the face and moving away, or it sits in the
      // exact hole it came out of and friction holds it there.
      const pos = c.clone().applyQuaternion(p.quat).add(p.pos).addScaledVector(normal, radius * 0.7);
      const vel = normal.clone().multiplyScalar(3 + Math.random() * 1.5).add(new THREE.Vector3(0, 0.5, 0));
      this.pieces.spawn({ parts: [{ kind: q.kind.name, geometry: g, materials: out.chunk.materials }], pos, quat: p.quat, role: 'fragment', floor: p.floor, structural: false, hull: true },
        { dynamic: true, vel, spin: { x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }, debris: true });
    }
    chips.burst(chipKind(kind), point, normal, 14, 2.5, 0.035);
    this._dust(kind, point, normal, 10);
  }

  // Take a bite out of a piece where it was hit.
  // `soon`: cut in a worker and put the hole in when it is ready, a frame or
  // two later — for blasts, which make several holes at once; a blow you
  // strike yourself cuts at once.
  _bite(p, point, normal, dir, radius, depth, kind, { chips: throwChips = true, soon = false } = {}) {
    const { chips, particles } = this.fx;
    const local = this.toLocal(p, point);
    const ldir = this.dirToLocal(p, dir);
    const part = this.partAt(p, local);
    const q = p.parts[part];
    const size = q.geometry.boundingBox.getSize(_v);
    const thin = Math.min(size.x, size.y, size.z);
    const centre = local.clone().addScaledVector(ldir, depth * 0.35);
    if (soon) {
      const from = q.geometry;
      const mats = q.materials ?? (Array.isArray(q.mesh?.material) ? q.mesh.material : [this.pieces._material(q)]);
      subtractAsync(from, mats, insideMaterial(kind.name), centre, ldir, radius, depth).then((out) => {
        // Still there, still the shape it was cut from, still where it stood?
        if (p.state !== 'static' || q.geometry !== from) return;
        if (out.geometry.attributes.position.count === 0) { this.pieces.destroy(p); return; }
        this.pieces.reshape(p, part, out.geometry, out.materials);
        p.bites++;
        if (p.role === 'slab' || p.structural) this.onStructure?.();
      }).catch(() => {});
      p.damage += (4 / 3) * Math.PI * radius * radius * depth * 0.5;
      if (throwChips) chips.burst(chipKind(kind), point, normal.clone(), Math.round(6 + radius * 40), 2.5, Math.min(0.06, radius * 0.25));
      this._dust(kind, point, normal, Math.round(4 + radius * 30));
      return;
    }
    try {
      const mats = q.materials ?? (Array.isArray(q.mesh?.material) ? q.mesh.material : [this.pieces._material(q)]);
      const out = subtract(q.geometry, mats, insideMaterial(kind.name), centre, ldir, radius, depth);
      if (out.geometry.attributes.position.count === 0) { this.pieces.destroy(p); return; }
      this.pieces.reshape(p, part, out.geometry, out.materials);
    } catch (e) {
      // A cut that the CSG cannot resolve: treat it as too much damage.
      console.warn('cut failed', e);
      p.bites = 99;
    }
    p.bites++;
    p.damage += (4 / 3) * Math.PI * radius * radius * depth * 0.5;
    const through = depth > thin * 1.1 ? thin : 0;
    if (kind.splinters) addSplinters(this.pieces, p, local, this.dirToLocal(p, normal), radius, through);
    // What comes off: chips back towards you, and out of the far side if it
    // went through; dust hangs in the air.
    const back = normal.clone();
    if (throwChips) chips.burst(chipKind(kind), point, back, Math.round(6 + radius * 40), 2.5, Math.min(0.06, radius * 0.25));
    if (through) {
      const exit = point.clone().addScaledVector(dir, thin);
      chips.burst(chipKind(kind), exit, dir, Math.round(8 + radius * 50), 3.5, Math.min(0.07, radius * 0.3));
    }
    this._dust(kind, point, normal, Math.round(4 + radius * 30));
    if (p.role === 'slab' || p.structural) this.onStructure?.();
  }

  _dust(kind, point, normal, n) {
    const c = { wood: 0xc8b48c, plaster: 0xe8e4dc, concrete: 0xb8b2a8, marble: 0xd8c0b8 }[chipKind(kind)] ?? 0xaaa49a;
    for (let i = 0; i < n; i++) {
      this.fx.particles.spawn('puff', point.x + normal.x * 0.05, point.y + normal.y * 0.05, point.z + normal.z * 0.05,
        normal.x * 0.8 + (Math.random() - 0.5) * 1.2, normal.y * 0.8 + Math.random() * 0.6, normal.z * 0.8 + (Math.random() - 0.5) * 1.2, c);
    }
  }

  _glass(p, point, dir, energy) {
    const local = this.toLocal(p, point);
    const pane = p.role === 'glass';
    if (!pane) { this.fracture(p, point, dir, energy); return p.kind; }
    const chip = (at, push) => this.fx.chips.burst('glass', at, push ?? dir, 3, 2, 0.025);
    if (!p.crack && energy < 1.6) {
      crackGlass(this.pieces, p, local, 0.8 + energy * 0.4);
      return p.kind;
    }
    this.fx.audio?.hit('glass', point.x, point.y, point.z, 1.4);
    this.fx.chips.burst('glass', point, dir, 30, 3, 0.02);
    shatter(this.pieces, p, local, dir, { chip });
    return p.kind;
  }

  // A column or a length of core wall gives way. The middle goes to rubble, a
  // short stub stays standing with its bars sticking out of it, and the slab
  // above has lost one of the things holding it up.
  fail(p, point, dir, { soon = false } = {}) {
    const { particles, audio } = this.fx;
    const b = p.box.clone();
    const size = b.getSize(new THREE.Vector3());
    audio?.impact(point.x, point.y, point.z, 0.8);
    const stubH = Math.min(0.5, size.y * 0.15);
    const kindName = p.kind.name;
    const P = this.pieces;
    // The stub.
    const sc = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y + stubH / 2, (b.min.z + b.max.z) / 2);
    P.spawn({ parts: [{ kind: kindName, geometry: box(size.x, stubH, size.z, sc) }], pos: sc, role: 'stub', floor: p.floor, structural: false });
    // Rebar, bent.
    if (p.role === 'column') {
      for (const [ox, oz] of [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]]) {
        const len = 0.6 + Math.random() * 0.9;
        const g = new THREE.CylinderGeometry(0.012, 0.012, len, 5);
        g.translate(0, len / 2, 0);
        g.rotateX((Math.random() - 0.5) * 0.7);
        g.rotateZ((Math.random() - 0.5) * 0.7);
        const at = new THREE.Vector3(sc.x + ox * size.x / 0.8, b.min.y + stubH, sc.z + oz * size.z / 0.8);
        P.spawn({ parts: [{ kind: 'steel', geometry: g, tint: 0x5a3a2a }], pos: at, role: 'rebar', floor: p.floor, structural: false });
      }
    }
    // The rest breaks into irregular lumps along rough planes — never blocks.
    const top = b.min.y + stubH;
    const mc = new THREE.Vector3(sc.x, (top + b.max.y) / 2, sc.z);
    P.destroy(p);
    const middle = P.spawn({ parts: [{ kind: kindName, geometry: box(size.x * 0.97, b.max.y - top - 0.02, size.z * 0.97, mc) }], pos: mc, role: 'fragment', floor: p.floor, structural: false });
    if (soon) this.fractureSoon(middle, point, dir, 2, 3);
    else this.fracture(middle, point, dir, 2, 3);
    for (let i = 0; i < 40; i++) particles.spawn('dust', sc.x, top + Math.random() * size.y, sc.z, (Math.random() - 0.5) * 3, Math.random(), (Math.random() - 0.5) * 3, 0xb8b2a8);
    this.fx.chips.burst('concrete', new THREE.Vector3(sc.x, top + 0.5, sc.z), dir, 60, 3, 0.05);
    this.fx.cloud?.(mc, 1.2);
    this.fx.onFailed?.(p);
    this.onStructure?.();
  }

  // Break a piece into fragments that fall. Furniture comes apart into the
  // things it was made of; a single slab of material is split along rough
  // planes, so the pieces have real broken faces.
  fracture(p, point, dir, energy = 1, minPasses = 1, maxPasses = 3) {
    const P = this.pieces;
    if (p.state === 'dead') return;
    const gen = (p.gen ?? 0) + 1;
    const mass = p.volume * p.kind.density * 0.6;
    const big = mass > BIG;
    // Small stuff crumbles when the simulation is crowded or it is already a
    // fragment of a fragment. Big stuff always breaks into chunks, and the
    // small bits lying about are cleared to make room for them.
    let room = MAX_LOOSE - this.pieces.physics.dynamic.size;
    if (!big && (room < 2 || gen > MAX_GEN)) return this.crumble(p, point, dir);
    if (big && room < 4) { this.fx.makeRoom?.(8); room = 4; }
    const vel = dir.clone().multiplyScalar(1 + energy * 1.5);
    const out = [];
    if (p.parts.length > 1) {
      for (const q of p.parts.slice(0, Math.max(1, room))) {
        const g = q.geometry.clone();
        g.computeBoundingBox();
        const c = g.boundingBox.getCenter(new THREE.Vector3());
        g.translate(-c.x, -c.y, -c.z);
        const pos = c.clone().applyQuaternion(p.quat).add(p.pos);
        out.push(P.spawn({ parts: [{ kind: q.kind.name, geometry: g, materials: q.materials, tint: q.tint }], pos, quat: p.quat, role: 'fragment', floor: p.floor, structural: false },
          { dynamic: true, vel: vel.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5)), debris: true }));
      }
    } else {
      // One lump of material: split along rough planes, in a worker. The
      // piece stays as it is until its lumps come back.
      if (p.breaking) return out;
      p.breaking = true;
      const q = p.parts[0];
      const inside = insideMaterial(q.kind.name);
      const size = p.localBox.getSize(new THREE.Vector3());
      // At most as many pieces as there is room for.
      const passes = Math.min(maxPasses, Math.floor(Math.log2(room)), Math.max(minPasses, Math.round(Math.log2(Math.max(size.x, size.y, size.z) / 0.35))));
      const job = { p, q, vel, gen, point: point.clone(), dir: dir.clone() };
      fractureAsync(q.geometry, q.materials ?? [P._material(q)], inside, passes, gen > 1 ? 5 : 12)
        // Structure first: a slab or a column waiting behind four hundred
        // desks left a block standing under a tower's worth of rubble.
        .then((bits) => { job.bits = bits; if (p.structural || p.role === 'slab') this.broken.unshift(job); else this.broken.push(job); })
        .catch(() => { p.breaking = false; if (p.state !== 'dead') this.crumble(p, job.point, job.dir); });
      return out;
    }
    for (const f of out) f.gen = gen;
    this.fx.chips.burst(chipKind(p.kind), point, dir, 25, 3, 0.04);
    this._dust(p.kind, point, dir.clone().negate(), 20);
    P.destroy(p);
    if (p.structural || p.role === 'slab') this.onStructure?.();
    return out;
  }

  // The lumps of a piece broken in a worker take its place, wherever it has
  // got to meanwhile, going the way it was going.
  _scatter({ p, q, bits, vel, gen, point, dir }) {
    const P = this.pieces;
    p.breaking = false;
    if (p.state === 'dead') return;
    // Backed up: small things that are not structure just crumble.
    if (this.broken.length > 60 && !(p.structural || p.role === 'slab') && p.volume < 1.5) { this.crumble(p, point, dir); return; }
    const full = P.overflow && P.physics.dynamic.size >= P.maxBodies;
    if (p.body) { const v = p.body.linvel(); vel = vel.clone().add(new THREE.Vector3(v.x, v.y, v.z)); }
    for (const bit of bits) {
      const g = bit.geometry;
      g.computeBoundingBox();
      const c = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z);
      const pos = c.clone().applyQuaternion(p.quat).add(p.pos);
      const v = vel.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(2));
      const spec = { parts: [{ kind: q.kind.name, geometry: g, materials: bit.materials }], pos, quat: p.quat, role: 'fragment', floor: p.floor, building: p.building, structural: false, hull: true };
      // No room for more bodies: straight into the batches, and off as rubble.
      const f = full ? P.spawn(spec, { free: true }) : P.spawn(spec, { dynamic: true, vel: v, debris: g.boundingBox.getSize(_v).length() < 0.6 });
      f.gen = gen;
      if (full) P.overflow(f, v);
    }
    this.fx.chips.burst(chipKind(p.kind), point, dir, 25, 3, 0.04);
    this._dust(p.kind, point, dir.clone().negate(), 20);
    P.destroy(p);
    if (p.structural || p.role === 'slab') this.onStructure?.();
  }
}

const LOOSE = new Set(['furniture', 'tank', 'fragment', 'shard', 'rebar', 'stub']);

function chipKind(kind) {
  const n = kind.name;
  if (n === 'rawwood' || n === 'wood') return 'wood';
  if (n === 'marble' || n === 'darkmarble' || n === 'creammarble') return n;
  if (n === 'concrete' || n === 'roofing' || n === 'stub') return 'concrete';
  if (n === 'plaster' || n === 'paper') return 'plaster';
  return n;
}
