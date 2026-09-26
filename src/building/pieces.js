import * as THREE from 'three';
import { KIND } from '../render/materials.js';

// Every wall, slab, column, pane of glass and chair in the building is a piece.
//
// **Untouched pieces are drawn in batches**: one BatchedMesh per material, so
// ten thousand pieces cost a couple of dozen draw calls. The moment something
// happens to a piece — it is cut, it falls, it catches fire — it is *promoted*
// out of its batch into meshes of its own, and from then on it can change
// shape and move freely. Most of the building is never promoted at all.
//
// A piece is:
//   parts        [{ kind, geometry, tint }] — geometry in the piece's own frame
//   pos, quat    where that frame is in the world
//   role         what it is in the building: slab, column, wall, core, glass,
//                mullion, spandrel, carpet, stair, furniture, lamp, tank …
//   structural   whether it carries load (from its first part's kind by default)
//   state        'static' | 'dynamic' | 'falling' | 'dead'

let nextId = 1;
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _pf = new THREE.Vector3();

export class Pieces {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.list = [];
    this.batches = new Map();       // kind name -> BatchedMesh
    this.root = new THREE.Group();
    this.root.name = 'building';
    scene.add(this.root);
    this.onChange = null;           // called when the set of standing pieces changes
    this._tintMats = new Map();
  }

  add(spec) {
    const p = {
      id: nextId++,
      parts: spec.parts.map((q) => ({ kind: KIND[q.kind], geometry: q.geometry, materials: q.materials ?? null, tint: q.tint ?? null, batch: null, instance: -1, mesh: null })),
      pos: spec.pos.clone(),
      quat: spec.quat ? spec.quat.clone() : new THREE.Quaternion(),
      role: spec.role,
      floor: spec.floor ?? 0,
      structural: spec.structural ?? KIND[spec.parts[0].kind].structural,
      hang: !!spec.hang,
      lateral: !!spec.lateral,
      colliderBoxes: spec.colliders ?? null,  // [[x0,y0,z0,x1,y1,z1]] in piece frame
      tag: spec.tag ?? null,
      state: 'static',
      object: null,
      collider: null,
      colliders: [],
      body: null,
      box: new THREE.Box3(),
      localBox: new THREE.Box3(),
      volume: 0,
      damage: 0,          // volume taken out, m^3
      bites: 0,
      hp: spec.hp ?? null,
      burning: 0,
      charred: 0,
      crack: null,
      splinters: null,
      paint: null,
      rests: [], carries: [], sides: [],
    };
    p.kind = p.parts[0].kind;
    for (const q of p.parts) {
      q.geometry.computeBoundingBox();
      p.localBox.union(q.geometry.boundingBox);
    }
    const s = p.localBox.getSize(new THREE.Vector3());
    p.volume = s.x * s.y * s.z;
    this._updateBox(p);
    this.list.push(p);
    return p;
  }

  // A piece made after the building was finalized — a shard, a fragment. It
  // never goes into a batch; it has its own meshes from the start.
  spawn(spec, { dynamic = false, vel, spin, debris = false } = {}) {
    const p = this.add(spec);
    this.promote(p);
    if (dynamic) {
      p.state = 'static';
      this.makeDynamic(p, vel, spin, { debris, quiet: true });
    } else {
      this._addFixedCollider(p);
    }
    return p;
  }

  _updateBox(p) {
    p.box.copy(p.localBox).applyMatrix4(_m.compose(p.pos, p.quat, _one));
  }

  // After the builders have run: pack every piece into its batch and give it a
  // collider.
  finalize() {
    const need = new Map();
    for (const p of this.list) {
      for (const q of p.parts) {
        const k = q.kind.name;
        const n = need.get(k) ?? { inst: 0, vert: 0, idx: 0 };
        n.inst++;
        n.vert += q.geometry.attributes.position.count;
        n.idx += q.geometry.index ? q.geometry.index.count : q.geometry.attributes.position.count;
        need.set(k, n);
      }
    }
    for (const [k, n] of need) {
      const b = new THREE.BatchedMesh(n.inst, n.vert, n.idx, KIND[k].material);
      b.castShadow = KIND[k].name !== 'glass';
      b.receiveShadow = true;
      b.name = `batch:${k}`;
      this.batches.set(k, b);
      this.root.add(b);
    }
    for (const p of this.list) {
      _m.compose(p.pos, p.quat, _one);
      for (const q of p.parts) {
        const b = this.batches.get(q.kind.name);
        const g = b.addGeometry(q.geometry);
        q.batch = b;
        q.instance = b.addInstance(g);
        b.setMatrixAt(q.instance, _m);
        if (q.tint !== null) b.setColorAt(q.instance, _c.set(q.tint));
      }
      this._addFixedCollider(p);
    }
  }

  _addFixedCollider(p) {
    const ph = this.physics;
    const boxes = p.colliderBoxes ?? [[p.localBox.min.x, p.localBox.min.y, p.localBox.min.z, p.localBox.max.x, p.localBox.max.y, p.localBox.max.z]];
    p.colliders = boxes.map(([x0, y0, z0, x1, y1, z1]) => {
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).applyQuaternion(p.quat).add(p.pos);
      return ph.addFixedBox(p, c, p.quat, Math.max(0.005, (x1 - x0) / 2), Math.max(0.005, (y1 - y0) / 2), Math.max(0.005, (z1 - z0) / 2));
    });
  }

  _removeFixedColliders(p) {
    for (const c of p.colliders) this.physics.removeCollider(c);
    p.colliders = [];
  }

  // Take a piece out of its batches and give it meshes of its own.
  promote(p) {
    if (p.object) return p.object;
    const g = new THREE.Group();
    g.position.copy(p.pos);
    g.quaternion.copy(p.quat);
    for (const q of p.parts) {
      if (q.batch) { q.batch.setVisibleAt(q.instance, false); }
      q.mesh = new THREE.Mesh(q.geometry, q.materials ?? this._material(q));
      q.mesh.castShadow = q.kind.name !== 'glass';
      q.mesh.receiveShadow = true;
      q.mesh.userData.piece = p;
      g.add(q.mesh);
    }
    this.root.add(g);
    p.object = g;
    return g;
  }

  _material(q) {
    const base = q.kind.material;
    const tint = q.tint;
    if (tint === null && !q.charred) return base;
    const key = `${q.kind.name}|${tint}|${q.charred ?? 0}`;
    if (!this._tintMats.has(key)) {
      const m = base.clone();
      if (tint !== null) m.color = new THREE.Color(tint);
      if (q.charred) m.color.lerp(new THREE.Color(0x121010), q.charred);
      this._tintMats.set(key, m);
    }
    return this._tintMats.get(key);
  }

  // Darken a piece as it burns (0..1). Batched pieces are darkened through
  // their instance colour, so a burning floor does not have to be promoted.
  char(p, amount) {
    const a = Math.round(Math.min(1, amount) * 5) / 5;
    for (const q of p.parts) {
      if (q.charred === a) continue;
      q.charred = a;
      const base = _c.set(q.tint ?? 0xffffff).lerp(new THREE.Color(0x121010), a);
      if (q.mesh) q.mesh.material = this._material(q);
      else if (q.batch) q.batch.setColorAt(q.instance, base);
    }
  }

  // Swap one part's geometry for a new one (after a cut). The collider becomes
  // the exact shape, so you can climb through the hole you made.
  reshape(p, part, geometry, materials) {
    this.promote(p);
    const q = p.parts[part];
    if (q.geometry !== geometry) q.geometry.dispose();
    q.geometry = geometry;
    q.mesh.geometry = geometry;
    if (materials) { q.materials = materials; q.mesh.material = materials; }
    if (p.state === 'static') {
      this._removeFixedColliders(p);
      // One trimesh per part, in world space.
      for (const r of p.parts) {
        const w = r.geometry.clone().applyMatrix4(_m.compose(p.pos, p.quat, _one));
        p.colliders.push(this.physics.addFixedMesh(p, w));
        w.dispose();
      }
    }
  }

  // Knock a piece loose: it gets a body of its own and falls.
  makeDynamic(p, vel, spin, { debris = false, quiet = false } = {}) {
    if (p.state === 'dead' || p.state === 'dynamic') return;
    this.promote(p);
    this._removeFixedColliders(p);
    const s = p.localBox.getSize(new THREE.Vector3());
    const c = p.localBox.getCenter(new THREE.Vector3());
    let shapes;
    if (p.bites > 0 || p.parts.length > 1 && !p.colliderBoxes) {
      shapes = [{ type: 'hull', points: hullPoints(p) }];
    } else if (p.colliderBoxes) {
      shapes = p.colliderBoxes.map(([x0, y0, z0, x1, y1, z1]) => ({ type: 'box', hx: (x1 - x0) / 2, hy: (y1 - y0) / 2, hz: (z1 - z0) / 2, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }));
    } else {
      shapes = [{ type: 'box', hx: s.x / 2, hy: s.y / 2, hz: s.z / 2, x: c.x, y: c.y, z: c.z }];
    }
    const mass = p.volume * p.kind.density;
    const { body } = this.physics.addBody(p, p.pos, p.quat, shapes, {
      density: p.kind.density, vel, spin, debris: debris || mass < 40,
      forces: mass > 200 ? mass * 30 : 0,
    });
    p.body = body;
    p.state = 'dynamic';
    this.physics.dynamic.add(p);
    if (!quiet) this.onChange?.();
  }

  // Gone: no mesh, no collider, nothing left to hold anything up.
  destroy(p) {
    if (p.state === 'dead') return;
    const wasStanding = p.state === 'static';
    this._removeFixedColliders(p);
    if (p.body) { this.physics.removeBody(p.body); p.body = null; this.physics.dynamic.delete(p); }
    for (const q of p.parts) {
      if (q.batch && !q.mesh) q.batch.setVisibleAt(q.instance, false);
      if (q.mesh) q.mesh.geometry.dispose();
    }
    if (p.object) p.object.removeFromParent();
    p.state = 'dead';
    if (wasStanding) this.onChange?.();
  }

  // Move a piece that is coming down with a collapse. It stays in its batch —
  // thousands of pieces fall at once, and promoting them all would cost
  // thousands of draw calls — so its instance matrix is moved instead.
  moveFalling(p, dy) {
    const at = _pf.copy(p.pos);
    at.y += dy;
    if (p.object) { p.object.position.copy(at); return; }
    _m.compose(at, p.quat, _one);
    for (const q of p.parts) q.batch.setMatrixAt(q.instance, _m);
  }

  // Move promoted dynamic pieces to where their bodies are.
  sync() {
    for (const p of this.physics.dynamic) {
      const b = p.body;
      if (!b || b.isSleeping()) continue;
      const t = b.translation(), r = b.rotation();
      p.pos.set(t.x, t.y, t.z);
      p.quat.set(r.x, r.y, r.z, r.w);
      p.object.position.copy(p.pos);
      p.object.quaternion.copy(p.quat);
      this._updateBox(p);
      // Fell out of the world somehow.
      if (t.y < -20) this.destroy(p);
    }
  }

  // The piece a collider belongs to, if it is one of ours.
  static isPiece(o) { return o && o.parts !== undefined; }

  worldMatrix(p, out = new THREE.Matrix4()) {
    return out.compose(p.pos, p.quat, _one);
  }

  clear() {
    for (const p of this.list) {
      this._removeFixedColliders(p);
      if (p.body) this.physics.removeBody(p.body);
      if (p.object) p.object.removeFromParent();
      for (const q of p.parts) q.geometry.dispose();
    }
    this.physics.dynamic.clear();
    for (const b of this.batches.values()) { b.removeFromParent(); b.dispose(); }
    this.batches.clear();
    this.list.length = 0;
  }
}

// Vertices of every part, in the piece frame, for a convex-hull collider.
function hullPoints(p) {
  const pts = [];
  for (const q of p.parts) {
    const a = q.geometry.attributes.position;
    const step = Math.max(1, Math.floor(a.count / 300));
    for (let i = 0; i < a.count; i += step) pts.push(a.getX(i), a.getY(i), a.getZ(i));
  }
  return new Float32Array(pts);
}
