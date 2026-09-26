import * as THREE from 'three';
import { subtract, split, chunkOff } from './cutter.js';
import { addSplinters } from './splinters.js';
import { crack, shatter } from './glass.js';
import { insideMaterial } from '../render/materials.js';
import { box } from '../render/geometry.js';

// What a blow does to the thing it lands on.
//
// Every tool and every blast comes through `hit` with a point, the direction
// it was travelling, and how much energy it carried (a sledge swing is about 1).
// What happens next depends on what the piece is made of:
//
//   wood, plaster, fabric   a jagged hole, deeper than it is wide, straight
//                           through anything thin; splinters round the rim of
//                           wood; chips and dust everywhere
//   concrete, marble        a small bite, a lot of grit. Columns and core walls
//                           keep count, and when one has taken enough it gives
//                           way: the middle crumbles, a stub stays standing, the
//                           reinforcing bars stick out of it
//   metal, brass            a ring and some sparks. Nothing comes away
//   glass                   cracks, then shatters
//   loose furniture         it moves — knocked across the room if it is light
//
// Pieces that have had too much taken out of them come apart into fragments.

const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class Damage {
  constructor(pieces, fx) {
    this.pieces = pieces;
    this.fx = fx;            // { chips, particles, audio, shake }
    this.onStructure = null; // called when something load-bearing changed
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

    const tough = kind.toughness;
    if (tough >= 30) {
      // Steel, bronze, brass: rings and sparks.
      particles.burst('spark', point.x, point.y, point.z, 14, 4);
      return kind;
    }
    // Concrete and stone: a lump comes away and falls. Columns and core walls
    // keep count, and the structure decides when one has had enough — sooner
    // the more storeys it is carrying.
    if (tough >= 8) {
      // Fist- to brick-sized.
      const r = THREE.MathUtils.clamp(0.07 + Math.random() * 0.06, 0.06, 0.2) * Math.sqrt(energy);
      this._chunk(p, point, normal, dir, r, kind);
      if (p.hp !== null && (p.role === 'column' || p.role === 'core')) {
        p.hp -= energy;
        if (p.hp <= 0 || this.fx.mustFail?.(p)) this.fail(p, point, dir);
      } else if (p.bites > 40) this.fracture(p, point, dir, energy);
      return kind;
    }
    // How big a bite: soft things give a lot, hard things a little.
    const radius = THREE.MathUtils.clamp(0.24 * Math.sqrt(energy / tough), 0.035, 0.55);
    const depth = radius * (kind.splinters ? 2.4 : 1.7);
    this._bite(p, point, normal, dir, radius, depth, kind);

    if (p.damage > p.volume * 0.35 || p.bites > 36) {
      this.fracture(p, point, dir, energy);
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
      const pos = c.clone().applyQuaternion(p.quat).add(p.pos).addScaledVector(normal, 0.04);
      const vel = normal.clone().multiplyScalar(2.2 + Math.random() * 1.5).add(new THREE.Vector3(0, 0.3, 0));
      this.pieces.spawn({ parts: [{ kind: q.kind.name, geometry: g, materials: out.chunk.materials }], pos, quat: p.quat, role: 'fragment', floor: p.floor, structural: false, hull: true },
        { dynamic: true, vel, spin: { x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }, debris: true });
    }
    chips.burst(chipKind(kind), point, normal, 14, 2.5, 0.035);
    this._dust(kind, point, normal, 10);
  }

  // Take a bite out of a piece where it was hit.
  _bite(p, point, normal, dir, radius, depth, kind) {
    const { chips, particles } = this.fx;
    const local = this.toLocal(p, point);
    const ldir = this.dirToLocal(p, dir);
    const part = this.partAt(p, local);
    const q = p.parts[part];
    const size = q.geometry.boundingBox.getSize(_v);
    const thin = Math.min(size.x, size.y, size.z);
    const centre = local.clone().addScaledVector(ldir, depth * 0.35);
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
    chips.burst(chipKind(kind), point, back, Math.round(6 + radius * 40), 2.5, Math.min(0.06, radius * 0.25));
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
      crack(this.pieces, p, local, 0.8 + energy * 0.4);
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
  fail(p, point, dir) {
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
    this.fracture(middle, point, dir, 2, 3);
    for (let i = 0; i < 40; i++) particles.spawn('dust', sc.x, top + Math.random() * size.y, sc.z, (Math.random() - 0.5) * 3, Math.random(), (Math.random() - 0.5) * 3, 0xb8b2a8);
    this.fx.chips.burst('concrete', new THREE.Vector3(sc.x, top + 0.5, sc.z), dir, 60, 3, 0.05);
    this.fx.cloud?.(mc, 1.2);
    this.fx.onFailed?.(p);
    this.onStructure?.();
  }

  // Break a piece into fragments that fall. Furniture comes apart into the
  // things it was made of; a single slab of material is split along rough
  // planes, so the pieces have real broken faces.
  fracture(p, point, dir, energy = 1, minPasses = 1) {
    const P = this.pieces;
    if (p.state === 'dead') return;
    const vel = dir.clone().multiplyScalar(1 + energy * 1.5);
    const out = [];
    if (p.parts.length > 1) {
      for (const q of p.parts) {
        const g = q.geometry.clone();
        g.computeBoundingBox();
        const c = g.boundingBox.getCenter(new THREE.Vector3());
        g.translate(-c.x, -c.y, -c.z);
        const pos = c.clone().applyQuaternion(p.quat).add(p.pos);
        out.push(P.spawn({ parts: [{ kind: q.kind.name, geometry: g, materials: q.materials, tint: q.tint }], pos, quat: p.quat, role: 'fragment', floor: p.floor, structural: false },
          { dynamic: true, vel: vel.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5)), debris: true }));
      }
    } else {
      const q = p.parts[0];
      const inside = insideMaterial(q.kind.name);
      let bits = [{ geometry: q.geometry, materials: q.materials ?? [P._material(q)] }];
      const size = p.localBox.getSize(new THREE.Vector3());
      const passes = Math.min(3, Math.max(minPasses, Math.round(Math.log2(Math.max(size.x, size.y, size.z) / 0.35))));
      for (let pass = 0; pass < passes; pass++) {
        const next = [];
        for (const bit of bits) {
          bit.geometry.computeBoundingBox();
          const bb = bit.geometry.boundingBox, s = bb.getSize(new THREE.Vector3());
          const axis = s.x >= s.y && s.x >= s.z ? new THREE.Vector3(1, 0, 0) : s.y >= s.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
          axis.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5)).normalize();
          const at = bb.getCenter(new THREE.Vector3()).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiply(s).multiplyScalar(0.3));
          try {
            for (const half of split(bit.geometry, bit.materials, inside, at, axis, Math.max(s.x, s.y, s.z))) {
              if (half.geometry.attributes.position.count > 0) next.push(half);
            }
          } catch { next.push(bit); }
        }
        bits = next;
      }
      for (const bit of bits) {
        const g = bit.geometry;
        g.computeBoundingBox();
        const c = g.boundingBox.getCenter(new THREE.Vector3());
        g.translate(-c.x, -c.y, -c.z);
        const pos = c.clone().applyQuaternion(p.quat).add(p.pos);
        const f = P.spawn({ parts: [{ kind: q.kind.name, geometry: g, materials: bit.materials }], pos, quat: p.quat, role: 'fragment', floor: p.floor, structural: false, hull: true },
          { dynamic: true, vel: vel.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).multiplyScalar(2)), debris: g.boundingBox.getSize(_v).length() < 0.6 });
        out.push(f);
      }
    }
    this.fx.chips.burst(chipKind(p.kind), point, dir, 25, 3, 0.04);
    this._dust(p.kind, point, dir.clone().negate(), 20);
    P.destroy(p);
    if (p.structural || p.role === 'slab') this.onStructure?.();
    return out;
  }
}

const LOOSE = new Set(['furniture', 'tank', 'fragment', 'shard', 'rebar', 'stub']);

function chipKind(kind) {
  const n = kind.name;
  if (n === 'rawwood' || n === 'wood') return 'wood';
  if (n === 'marble') return 'marble';
  if (n === 'concrete' || n === 'roofing' || n === 'stub') return 'concrete';
  if (n === 'plaster' || n === 'paper') return 'plaster';
  return n;
}
