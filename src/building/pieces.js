import * as THREE from 'three';
import { KIND, BATCH_DEPTH } from '../render/materials.js';
import { G_WORLD, G_RUBBLE, inBuilding } from '../physics.js';

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
//   state        'static' | 'dynamic' | 'falling' | 'tipping' | 'flying' | 'rubble' | 'dead'
//                (rubble: come to rest after a collapse, still and solid, not structure)

let nextId = 1;
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _pf = new THREE.Vector3();
const _dark = new THREE.Color(0x121010);

export class Pieces {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.list = [];
    this.batches = new Map();       // kind name -> BatchedMesh
    this.root = new THREE.Group();
    this.root.name = 'building';
    scene.add(this.root);
    this.onChange = null;           // (piece): the set of standing pieces has changed
    this.byBuilding = new Map();    // building -> its pieces
    this.onLeave = null;            // (piece): a piece that was solid has left where it was
    this.overflow = null;           // (piece, vel, spin): loose, but no room for another body
    this.onAnchor = null;           // (piece): wreckage made standing, to find what it sits on
    this.maxBodies = 50;            // rigid bodies the simulation can afford at once
    this.spares = new Map();        // material -> [BatchedMesh] for pieces made or cut after loading
    this._tintMats = new Map();
  }

  add(spec) {
    const p = {
      id: nextId++,
      // draws: where the part is drawn in batches, [{ b, i, g, spare }], made
      // from geometry `drawn`; mesh: its own mesh, once promoted.
      parts: spec.parts.map((q) => ({ kind: KIND[q.kind], geometry: q.geometry, materials: q.materials ?? null, tint: q.tint ?? null, draws: [], drawn: null, mesh: null })),
      pos: spec.pos.clone(),
      quat: spec.quat ? spec.quat.clone() : new THREE.Quaternion(),
      role: spec.role,
      floor: spec.floor ?? 0,
      building: spec.building ?? 'tower',   // which building it belongs to: storeys are counted per building
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
      hp: null,
      hpMax: null,
      load: spec.load ?? 0,        // storeys this piece carries, for columns and core
      burning: 0,
      charred: 0,
      crack: null,
      splinters: null,
      paint: null,
      rests: [], carries: [], sides: [],
    };
    p.kind = p.parts[0].kind;
    for (const q of p.parts) {
      // Box, cylinder and extrude geometries come with one group per face,
      // each naming a material slot. A part has one material, so the groups
      // mean nothing — until a cut keeps them and hands CSG a one-material
      // list, and five faces of every cut box render with no material at
      // all: the thing you hit went invisible. Only a cut adds groups back,
      // and then it supplies a material for every one.
      if (!q.materials) q.geometry.clearGroups();
      q.geometry.computeBoundingBox();
      p.localBox.union(q.geometry.boundingBox);
    }
    const s = p.localBox.getSize(new THREE.Vector3());
    p.volume = s.x * s.y * s.z;
    // Durability: the weakest-part-weighted blows it can take. A cracked piece
    // is one with less of this left; see damage/damage.js.
    const hits = Math.max(...p.parts.map((q) => q.kind.hits));
    p.hpMax = p.hp = spec.hp ?? +(hits * THREE.MathUtils.clamp(Math.cbrt(p.volume / 0.5), 0.5, 3)).toFixed(2);
    this._updateBox(p);
    this.list.push(p);
    const mine = this.byBuilding.get(p.building);
    if (mine) mine.push(p); else this.byBuilding.set(p.building, [p]);
    return p;
  }

  inBuilding(b) { return this.byBuilding.get(b) ?? []; }

  // A piece made after the building was finalized — a shard, a fragment. It
  // never goes into a batch; it has its own meshes from the start.
  // `free`: neither standing nor a body yet — it is about to be sent flying.
  // It goes straight into the spare batches, so that it flies drawn in a
  // batch with the others rather than as meshes of its own.
  spawn(spec, { dynamic = false, vel, spin, debris = false, free = false } = {}) {
    const p = this.add(spec);
    if (free && this._batchNew(p)) return p;
    this.promote(p);
    // An irregular shape — a broken lump — collides as its convex hull, not its box.
    if (spec.hull) p.bites = Math.max(p.bites, 1);
    if (dynamic) {
      p.state = 'static';
      this.makeDynamic(p, vel, spin, { debris, quiet: true });
    } else if (!free) {
      this._addFixedCollider(p);
      this.onAnchor?.(p);
    }
    return p;
  }

  _updateBox(p) {
    p.box.copy(p.localBox).applyMatrix4(_m.compose(p.pos, p.quat, _one));
  }

  // After the builders have run: pack every piece into its batch and give it a
  // collider. `list` and `tag`: a building added later — a city block that
  // something has reached — gets batches of its own.
  finalize(list = this.list, tag = '') {
    const need = new Map();
    for (const p of list) {
      for (const q of p.parts) {
        const k = q.kind.name;
        const n = need.get(k) ?? { inst: 0, vert: 0, idx: 0 };
        n.inst++;
        n.vert += q.geometry.attributes.position.count;
        n.idx += q.geometry.index ? q.geometry.index.count : q.geometry.attributes.position.count;
        need.set(k, n);
      }
    }
    const made = new Map();
    for (const [k, n] of need) {
      const b = new THREE.BatchedMesh(n.inst, n.vert, n.idx, KIND[k].material);
      // Every batch has instance colours, tinted or not: a material drawn by
      // batches with and without them switched shader programs between them.
      b._initColorsTexture();
      b.customDepthMaterial = BATCH_DEPTH;
      b.castShadow = !KIND[k].glass;
      b.receiveShadow = true;
      // No per-piece culling or sorting. Both run on the CPU over every
      // instance on every render pass, shadows included, and measured 9 ms of a
      // 10.8 ms frame; the GPU draws the few hidden pieces for far less. Glass
      // is left unsorted too — sorting two thousand panes a frame is what cost.
      b.perObjectFrustumCulled = false;
      b.sortObjects = false;
      b.name = `batch:${tag}${k}`;
      this.batches.set(tag + k, b);
      made.set(k, b);
      this.root.add(b);
    }
    for (const p of list) {
      _m.compose(p.pos, p.quat, _one);
      for (const q of p.parts) {
        const b = made.get(q.kind.name);
        const g = b.addGeometry(q.geometry);
        const i = b.addInstance(g);
        q.draws = [{ b, i, g, spare: false }];
        q.drawn = q.geometry;
        b.setMatrixAt(i, _m);
        if (q.tint !== null) b.setColorAt(i, _c.set(q.tint));
      }
      this._addFixedCollider(p);
    }
  }

  _addFixedCollider(p) {
    const ph = this.physics;
    const boxes = p.colliderBoxes ?? [[p.localBox.min.x, p.localBox.min.y, p.localBox.min.z, p.localBox.max.x, p.localBox.max.y, p.localBox.max.z]];
    const group = p.state === 'rubble' ? G_RUBBLE : inBuilding(G_WORLD, p.building);
    p.colliders = boxes.map(([x0, y0, z0, x1, y1, z1]) => {
      const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).applyQuaternion(p.quat).add(p.pos);
      return ph.addFixedBox(p, c, p.quat, Math.max(0.005, (x1 - x0) / 2), Math.max(0.005, (y1 - y0) / 2), Math.max(0.005, (z1 - z0) / 2), group);
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
    // Small things cast no shadow: a fist-sized lump's shadow is a few pixels,
    // and drawing it again into the shadow map doubled the cost of debris.
    const small = p.volume < 0.15;
    for (const q of p.parts) {
      this._showDraws(q, false);
      q.mesh = new THREE.Mesh(q.geometry, q.materials ? q.materials.map((m) => this._solo(m)) : this._solo(this._material(q)));
      q.mesh.castShadow = !q.kind.glass && !small;
      q.mesh.receiveShadow = true;
      q.mesh.userData.piece = p;
      g.add(q.mesh);
    }
    this.root.add(g);
    p.object = g;
    return g;
  }

  // A material for a piece's own mesh: never the very object a batch draws
  // with. Three compiles a batched and a plain variant of a shader, and a
  // material shared between a BatchedMesh and a Mesh switched between them for
  // every piece, every frame: the renderer looking up programs was 6% of a
  // collapse. Each gets a twin, textures shared.
  _solo(m) {
    this._solos ??= new Map();
    let s = this._solos.get(m);
    if (!s) { s = m.clone(); this._solos.set(m, s); }
    return s;
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
      if (q.mesh) q.mesh.material = this._solo(this._material(q));
      for (const d of q.draws) d.b.setColorAt(d.i, base);
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
    if (materials) { q.materials = materials; q.mesh.material = materials.map((m) => this._solo(m)); }
    if (p.state === 'static' || p.state === 'rubble') {
      this._removeFixedColliders(p);
      // One trimesh per part, in world space.
      for (const r of p.parts) {
        const w = r.geometry.clone().applyMatrix4(_m.compose(p.pos, p.quat, _one));
        p.colliders.push(this.physics.addFixedMesh(p, w, p.state === 'rubble' ? G_RUBBLE : inBuilding(G_WORLD, p.building)));
        w.dispose();
      }
    }
  }

  // Knock a piece loose: it gets a body of its own and falls.
  //
  // Rigid bodies are the expensive part of a collapse: six hundred of them at
  // once took 150 ms a frame, and slow frames make the physics take more
  // steps, which is slower again. So past `maxBodies`, a piece knocked loose
  // falls the cheap way instead (sim/rubble.js) and lands as rubble.
  makeDynamic(p, vel, spin, { debris = false, quiet = false } = {}) {
    if (p.state === 'dead' || p.state === 'dynamic' || p.state === 'flying') return;
    if (this.overflow && this.physics.dynamic.size >= this.maxBodies) {
      const was = p.state;
      this.overflow(p, vel, spin);
      if (was === 'static' && !quiet) this.onChange?.(p);
      return;
    }
    this.promote(p);
    this._updateBox(p);
    const had = p.colliders.length > 0;
    this._removeFixedColliders(p);
    if (had) this.onLeave?.(p);
    if (p.restOn) { p.restOn.carried?.delete(p); p.restOn = null; }
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
    if (!quiet) this.onChange?.(p);
  }

  // Take a standing piece's colliders away as it starts to move with a
  // collapse, and with them whatever was lying on it.
  lift(p) {
    const had = p.colliders.length > 0;
    this._removeFixedColliders(p);
    if (had) this.onLeave?.(p);
  }

  // Slide a standing piece to a new position — a lift door opening. Its
  // colliders go with it.
  move(p, pos) {
    if (p.state !== 'static') return;
    p.placed = (p.placed ?? 0) + 1;      // what lies on it is no longer where it was
    p.pos.copy(pos);
    this._updateBox(p);
    if (p.object) p.object.position.copy(pos);
    else this.drawAt(p, _m.compose(p.pos, p.quat, _one));
    this._removeFixedColliders(p);
    this._addFixedCollider(p);
  }

  // Turn a standing piece about its own centre — a revolving door's wings.
  // Its colliders stay as they are; give such a piece only colliders that do
  // not care which way it faces.
  turn(p, quat) {
    if (p.state !== 'static') return;
    p.quat.copy(quat);
    this._updateBox(p);
    if (p.object) p.object.quaternion.copy(quat);
    else this.drawAt(p, _m.compose(p.pos, p.quat, _one));
  }

  // A piece of debris that has stopped moving: out of the simulation, but
  // still there, still solid, still something you can hit.
  freeze(p) {
    if (p.state !== 'dynamic' || !p.body) return;
    this.physics.removeBody(p.body);
    this.physics.dynamic.delete(p);
    p.body = null;
    p.state = 'rubble';
    this._updateBox(p);
    this._addFixedCollider(p);
    this.onAnchor?.(p);
  }

  // Gone: no mesh, no collider, nothing left to hold anything up.
  destroy(p) {
    if (p.state === 'dead') return;
    const wasStanding = p.state === 'static';
    const had = p.colliders.length > 0;
    this._removeFixedColliders(p);
    if (had) this.onLeave?.(p);
    if (p.restOn) { p.restOn.carried?.delete(p); p.restOn = null; }
    if (p.body) { this.physics.removeBody(p.body); p.body = null; this.physics.dynamic.delete(p); }
    for (const q of p.parts) {
      this._dropDraws(q);
      if (q.mesh) q.mesh.geometry.dispose();
    }
    if (p.object) p.object.removeFromParent();
    p.state = 'dead';
    if (wasStanding) this.onChange?.(p);
  }

  // Where a batched piece is drawn.
  drawAt(p, m) {
    for (const q of p.parts) for (const d of q.draws) d.b.setMatrixAt(d.i, m);
  }

  _showDraws(q, on) {
    for (const d of q.draws) d.b.setVisibleAt(d.i, on);
  }

  // A part's batch draws are no good any more (it was cut, or it is gone):
  // what it had in a spare batch is freed, its place in its original batch is
  // hidden for good.
  _dropDraws(q) {
    for (const d of q.draws) {
      if (d.spare) d.b.deleteGeometry(d.g);
      else d.b.setVisibleAt(d.i, false);
    }
    q.draws = [];
    q.drawn = null;
  }

  // A piece come to rest after a collapse goes back into batches: a whole
  // fallen tower is drawn in a few dozen calls again, not six thousand. One
  // with the shape it was built with goes back to its own instance. One made
  // or cut since goes into the spare batches, a batch per material: a lump
  // broken off a column is two, its weathered outside and its broken inside.
  // Hitting it again promotes it out, as it did the first time.
  rejoin(p) {
    _m.compose(p.pos, p.quat, _one);
    if (!p.object) { this.drawAt(p, _m); return true; }
    for (const q of p.parts) {
      if (q.draws.length && q.drawn === q.geometry) continue;
      if (!this._batchPart(q)) return false;
    }
    for (const q of p.parts) {
      for (const d of q.draws) { d.b.setMatrixAt(d.i, _m); d.b.setVisibleAt(d.i, true); }
      q.mesh = null;
    }
    p.object.removeFromParent();
    p.object = null;
    return true;
  }

  // A new piece drawn in the spare batches from the start. False if it will
  // not go, and then it is left for promote().
  _batchNew(p) {
    for (const q of p.parts) if (!this._batchPart(q)) { for (const r of p.parts) this._dropDraws(r); return false; }
    _m.compose(p.pos, p.quat, _one);
    for (const q of p.parts) for (const d of q.draws) { d.b.setMatrixAt(d.i, _m); d.b.setVisibleAt(d.i, true); }
    return true;
  }

  _batchPart(q) {
    this._dropDraws(q);
    const colour = new THREE.Color(q.tint ?? 0xffffff).lerp(_dark, q.charred ?? 0);
    const bits = q.materials ? byMaterial(q.geometry, q.materials) : [[plain(q.geometry, 0, Infinity), q.kind.material]];
    for (const [g, material] of bits) {
      const d = this._spare(g, material);
      g.dispose();
      if (!d) { this._dropDraws(q); return false; }
      d.b.setVisibleAt(d.i, false);
      d.b.setColorAt(d.i, q.materials ? _c.set(0xffffff).lerp(_dark, q.charred ?? 0) : colour);
      q.draws.push(d);
    }
    q.drawn = q.geometry;
    return true;
  }

  // Room for a geometry in a spare batch of this material, starting a new
  // batch when the last one is full.
  _spare(g, material) {
    let list = this.spares.get(material);
    if (!list) this.spares.set(material, (list = []));
    for (let attempt = 0; attempt < 2; attempt++) {
      let b = list[list.length - 1];
      if (!b || attempt === 1) {
        b = new THREE.BatchedMesh(2048, Math.max(262144, g.attributes.position.count), 0, material);
        b._initColorsTexture();
        b.customDepthMaterial = BATCH_DEPTH;
        b.castShadow = material !== KIND.glass?.material;
        b.receiveShadow = true;
        b.perObjectFrustumCulled = false;
        b.sortObjects = false;
        b.name = `spare:${material.name || material.uuid.slice(0, 6)}`;
        list.push(b);
        this.root.add(b);
      }
      try {
        const id = b.addGeometry(g);
        try { return { b, i: b.addInstance(id), g: id, spare: true }; } catch { b.deleteGeometry(id); }
      } catch { /* full: next batch */ }
    }
    return null;
  }

  // Move a piece that is coming down with a collapse. It stays in its batch —
  // thousands of pieces fall at once, and promoting them all would cost
  // thousands of draw calls — so its instance matrix is moved instead.
  moveFalling(p, dy) {
    const at = _pf.copy(p.pos);
    at.y += dy;
    if (p.object) { p.object.position.copy(at); return; }
    this.drawAt(p, _m.compose(at, p.quat, _one));
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
    for (const b of [...this.batches.values(), ...[...this.spares.values()].flat()]) { b.removeFromParent(); b.dispose(); }
    this.batches.clear();
    this.spares.clear();
    this.list.length = 0;
    this.byBuilding.clear();
  }
}

// A range of a geometry's triangles as a plain geometry of its own — no
// index, and exactly position, normal and uv — which is what every geometry in
// a spare batch has to be.
function plain(g, start, count) {
  const idx = g.index, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const total = idx ? idx.count : pos.count;
  const end = Math.min(total, start + count);
  const n = Math.max(0, end - start);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    const v = idx ? idx.getX(start + k) : start + k;
    P[k * 3] = pos.getX(v); P[k * 3 + 1] = pos.getY(v); P[k * 3 + 2] = pos.getZ(v);
    if (nor) { N[k * 3] = nor.getX(v); N[k * 3 + 1] = nor.getY(v); N[k * 3 + 2] = nor.getZ(v); }
    if (uv) { U[k * 2] = uv.getX(v); U[k * 2 + 1] = uv.getY(v); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  if (!nor) out.computeVertexNormals();
  return out;
}

// A cut geometry split by material: [[geometry, material]], one per material.
function byMaterial(g, materials) {
  if (!g.groups.length) return [[plain(g, 0, Infinity), materials[0]]];
  const out = new Map();
  for (const r of g.groups) {
    const m = materials[r.materialIndex ?? 0];
    if (!m) continue;
    (out.get(m) ?? out.set(m, []).get(m)).push(plain(g, r.start, r.count));
  }
  return [...out].map(([m, gs]) => [gs.length === 1 ? gs[0] : merge(gs), m]);
}

function merge(gs) {
  const n = gs.reduce((a, g) => a + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of gs) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of gs) g.dispose();
  return out;
}

// Vertices of every part, in the piece frame, for a convex-hull collider.
function hullPoints(p) {
  const pts = [];
  for (const q of p.parts) {
    const a = q.geometry.attributes.position;
    // A hull of a few dozen points is as good as one of hundreds for a lump of
    // rubble, and far cheaper to collide.
    const step = Math.max(1, Math.floor(a.count / 48));
    for (let i = 0; i < a.count; i += step) pts.push(a.getX(i), a.getY(i), a.getZ(i));
  }
  return new Float32Array(pts);
}
