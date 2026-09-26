import * as THREE from 'three';

// Fire, as spots.
//
// A fire is not a piece going up all at once. It is a **spot**: a small circle
// on a surface — a patch of carpet, a corner of a desk, the foot of a curtain —
// with flames standing in it, orange and yellow and moving. The circle grows,
// and it leaves a black scorch behind it as it goes. Once it is big enough it
// sends out new spots from its edge: across the floor, up onto whatever stands
// in it, up the wall. So a fire starts as one flame and spreads out.
//
// Each spot eats its piece's fuel, faster the bigger and hotter it is; a piece
// whose fuel is gone burns away, and whatever it held comes down.
//
// Gas does not burn, it cooks: a tank a fire reaches goes off a few seconds
// later. Standing in the flames hurts. The extinguisher knocks a spot's heat
// down, and a spot with no heat left is out — the scorch stays.

const MAX_SPOTS = 700;
const LIGHTS = 6;
const GROW = 0.07;             // m/s the circle widens at full heat
const MIN_GAP = 0.3;           // m: a new spot this close to another is not a new spot
const SPREAD_EVERY = 0.35;     // s

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Ragged edge: a burn is never a clean circle.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2, r = 44 + Math.random() * 22;
    g.beginPath();
    g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 3 + Math.random() * 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Fire {
  constructor(scene, pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;                 // { particles, chips, audio, explode(piece) }
    this.spots = [];              // burning
    this.scars = [];              // out, but their scorch is still there
    this.fuel = new Map();        // piece -> { left, full }
    this.cooking = new Map();     // tank piece -> seconds left
    this._tick = 0;
    this.lights = [];
    for (let n = 0; n < LIGHTS; n++) {
      // Always in the scene, switched by intensity: changing the number of
      // visible lights makes every material recompile.
      const l = new THREE.PointLight(0xff8a3a, 0, 12, 1.8);
      scene.add(l);
      this.lights.push(l);
    }
    // Scorch marks: one instanced mesh of soft black discs.
    this.scorch = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshStandardMaterial({
        color: 0x0c0a09, roughness: 1, alphaMap: scorchTexture(), transparent: true,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
      }),
      MAX_SPOTS * 2,
    );
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    this.scorch.renderOrder = 2;
    scene.add(this.scorch);
    this._scorchFree = 0;
  }

  get count() { return this.spots.length; }

  // ---------------------------------------------------------------- lighting

  // Start a fire on a piece — at `point` on its surface if given, otherwise
  // somewhere on its top.
  ignite(p, heat = 0.3, point = null, normal = null) {
    if (!p || p.state === 'dead') return false;
    if (p.kind.explodes > 0) { if (!this.cooking.has(p)) this.cooking.set(p, 2.5 + Math.random() * 2.5); return true; }
    const burns = Math.max(...p.parts.map((q) => q.kind.burns));
    if (burns <= 0) return false;
    if (!point) {
      const hit = this._topOf(p);
      if (!hit) return false;
      point = hit.point; normal = hit.normal;
    }
    return this._spot(p, point, normal ?? UP, heat, 0.07) !== null;
  }

  // A point on the upper surface of a piece, found by dropping a ray on it.
  _topOf(p) {
    const b = p.box;
    for (let n = 0; n < 5; n++) {
      _v.set(b.min.x + Math.random() * (b.max.x - b.min.x), b.max.y + 0.3, b.min.z + Math.random() * (b.max.z - b.min.z));
      const hit = this.physics.raycast(_v, { x: 0, y: -1, z: 0 }, b.max.y - b.min.y + 0.6);
      if (hit && hit.owner === p) return hit;
    }
    return { point: b.getCenter(new THREE.Vector3()).setY(b.max.y), normal: UP.clone() };
  }

  // Set light to anything burnable near a point, where the blast reaches it.
  igniteAround(point, radius, chance = 0.6) {
    const seen = new Set();
    this.physics.overlapSphere(point, radius, (o) => {
      if (!o || !o.parts || seen.has(o) || Math.random() > chance) return;
      seen.add(o);
      o.box.clampPoint(point, _w);
      const d = _v.copy(_w).sub(point);
      const len = d.length();
      if (len < 0.05) { this.ignite(o, 0.6); return; }
      const hit = this.physics.raycast(point, d.divideScalar(len), len + 0.3);
      if (hit && hit.owner === o) this.ignite(o, 0.6, hit.point, hit.normal);
      else this.ignite(o, 0.6);
    });
  }

  _spot(p, point, normal, heat, r) {
    if (this.spots.length >= MAX_SPOTS) return null;
    for (const s of this.spots) if (s.p.distanceToSquared(point) < MIN_GAP * MIN_GAP) return null;
    const burns = Math.max(...p.parts.map((q) => q.kind.burns));
    if (!this.fuel.has(p)) {
      const full = burns * THREE.MathUtils.clamp(Math.cbrt(p.volume) * 1.6, 0.4, 4);
      this.fuel.set(p, { left: full, full });
    }
    const n = normal.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);
    const s = {
      piece: p, p: point.clone().addScaledVector(n, 0.01), n, t1, t2,
      r, rMax: 0.35 + Math.random() * 0.35, heat,
      scorch: this._scorchFree++ % (MAX_SPOTS * 2),
    };
    this.spots.push(s);
    this.scorch.count = Math.min(MAX_SPOTS * 2, Math.max(this.scorch.count, s.scorch + 1));
    this._drawScorch(s, 0.1);
    return s;
  }

  _drawScorch(s, k) {
    _q.setFromUnitVectors(Z, s.n);
    const r = s.r * 1.35 * k + 0.02;
    _m.compose(_v.copy(s.p).addScaledVector(s.n, 0.004), _q, _s.set(r, r, 1));
    this.scorch.setMatrixAt(s.scorch, _m);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- putting out

  // Spray from `origin` along `dir`: every spot within the widening cone of the
  // spray loses heat.
  extinguish(origin, dir, range, spread, dt) {
    let hit = 0;
    for (const s of this.spots) {
      if (s.heat <= 0) continue;
      const d = _v.copy(s.p).sub(origin);
      const along = d.dot(dir);
      if (along < 0 || along > range) continue;
      const off = d.addScaledVector(dir, -along).length();
      if (off > 0.25 + along * spread + s.r) continue;
      s.heat -= dt * 2.4;
      s.r = Math.max(0.05, s.r - dt * 0.15);
      hit++;
      if (s.heat <= 0) {
        s.heat = 0;
        this.fx.particles.burst('smoke', s.p.x, s.p.y, s.p.z, 3, 0.6, 0xbdbdbd, 0.8);
      }
    }
    for (const [p] of this.cooking) if (p.box.distanceToPoint(origin) < range) this.cooking.delete(p);
    return hit;
  }

  // ---------------------------------------------------------------- burning

  // Returns the damage per second the player should take at `pos`.
  update(dt, pos) {
    const { particles } = this.fx;
    this._tick += dt;
    const spread = this._tick > SPREAD_EVERY;
    if (spread) this._tick = 0;
    const live = this.spots;
    // Flames per second: a few for a small spot, more as it widens. Flames are
    // added light, so too many in one place sum to a white blob — this is a
    // rate by area, not a fill. Capped overall for a big fire.
    const rate = (s) => (10 + 140 * s.r * s.r) * s.heat;
    const total = live.reduce((a, s) => a + rate(s), 0);
    const scale = Math.min(1, 900 / Math.max(1, total));
    let dps = 0;
    const burnt = new Set();

    for (const s of live) {
      const p = s.piece;
      if (p.state !== 'static' && p.state !== 'rubble') { s.heat = 0; this._hideScorch(s); continue; }
      s.heat = Math.min(1, s.heat + dt * 0.2);
      if (s.r < s.rMax) { s.r = Math.min(s.rMax, s.r + dt * GROW * s.heat); this._drawScorch(s, 1); }
      const f = this.fuel.get(p);
      f.left -= dt * s.heat * (0.25 + (s.r / 0.5) ** 2);
      this.pieces.char(p, (1 - f.left / f.full) * 0.6);
      if (f.left <= 0) burnt.add(p);

      // Flames standing in the circle, rising whatever way the surface faces.
      const share = rate(s) * scale * dt;
      let n = Math.floor(share) + (Math.random() < share % 1 ? 1 : 0);
      while (n-- > 0) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * s.r;
        _v.copy(s.p).addScaledVector(s.t1, Math.cos(a) * rr).addScaledVector(s.t2, Math.sin(a) * rr).addScaledVector(s.n, 0.03);
        // Taller in the middle of the patch, low licks round the edge.
        const edge = rr / Math.max(0.01, s.r);
        particles.spawn(edge > 0.7 ? 'flamelet' : 'flame', _v.x, _v.y, _v.z,
          (Math.random() - 0.5) * 0.25, (0.7 + Math.random() * 0.9) * s.heat, (Math.random() - 0.5) * 0.25);
        if (Math.random() < 0.05) particles.spawn('smoke', _v.x, _v.y + 0.5, _v.z, 0, 0.8, 0);
        if (Math.random() < 0.01) particles.spawn('spark', _v.x, _v.y + 0.2, _v.z, (Math.random() - 0.5), 1.5 + Math.random(), (Math.random() - 0.5));
      }

      const d = _w.set(pos.x, pos.y + 0.9, pos.z).distanceTo(s.p);
      if (d < s.r + 0.8) dps = Math.max(dps, 30 * s.heat * (1 - (d - s.r) / 0.8));

      if (spread && s.r > 0.18 && Math.random() < s.heat * 0.55) this._spread(s);
    }
    for (const p of burnt) this._burnOut(p);
    // Spots that have gone out become scars: no flame, just the scorch.
    for (const s of this.spots) if (s.heat <= 0) this.scars.push(s);
    this.spots = this.spots.filter((s) => s.heat > 0);
    if (this.scars.length > MAX_SPOTS) this.scars.splice(0, this.scars.length - MAX_SPOTS);

    for (const [p, t] of this.cooking) {
      if (p.state === 'dead') { this.cooking.delete(p); continue; }
      const left = t - dt;
      if (left > 0) { this.cooking.set(p, left); continue; }
      this.cooking.delete(p);
      this.fx.explode(p);
    }
    this._placeLights(live);
    this.fx.audio?.fire(live.length, dps > 0 ? 0 : 10);
    return dps;
  }

  // A new spot from the edge of an old one: across the surface it is on, or
  // up onto something standing in it.
  _spread(s) {
    let from, dir;
    if (Math.random() < 0.25) {
      // Climb: look for something burnable above the flames.
      from = _v.copy(s.p).addScaledVector(UP, 0.5 + Math.random() * 0.6);
      from.x += (Math.random() - 0.5) * s.r * 2; from.z += (Math.random() - 0.5) * s.r * 2;
      dir = new THREE.Vector3(0, -1, 0);
      if (Math.abs(s.n.y) < 0.5) dir.copy(s.n).negate();       // up a wall, stay on the wall
    } else {
      // Creep outward across the surface.
      const a = Math.random() * Math.PI * 2;
      const reach = s.r * (1.1 + Math.random() * 0.7) + 0.1;
      from = _v.copy(s.p).addScaledVector(s.t1, Math.cos(a) * reach).addScaledVector(s.t2, Math.sin(a) * reach).addScaledVector(s.n, 0.3);
      dir = s.n.clone().negate();
    }
    const hit = this.physics.raycast(from, dir, 0.9);
    if (!hit || !hit.owner || !hit.owner.parts) return;
    const o = hit.owner;
    if (o.kind.explodes > 0) { this.ignite(o); return; }
    if (Math.max(...o.parts.map((q) => q.kind.burns)) <= 0) return;
    this._spot(o, hit.point, hit.normal, 0.25, 0.06);
  }

  _burnOut(p) {
    const c = p.box.getCenter(new THREE.Vector3());
    this.fx.particles.burst('smoke', c.x, c.y, c.z, 8, 1, 0x222222, 1);
    this.fx.chips?.burst('carpet', c, UP, 6, 1, 0.04);
    for (const s of this.spots) if (s.piece === p) { s.heat = 0; this._hideScorch(s); }
    for (const s of this.scars) if (s.piece === p) this._hideScorch(s);
    this.fuel.delete(p);
    this.pieces.destroy(p);
  }

  _hideScorch(s) {
    _m.makeScale(0, 0, 0);
    this.scorch.setMatrixAt(s.scorch, _m);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  // Hang the few lights there are over the biggest patches of flame.
  _placeLights(live) {
    const cells = new Map();
    for (const s of live) {
      const k = `${Math.floor(s.p.x / 3)}|${Math.floor(s.p.y / 3)}|${Math.floor(s.p.z / 3)}`;
      const w = s.r * s.r * s.heat;
      const c = cells.get(k);
      if (c) { c.w += w; c.x += s.p.x * w; c.y += s.p.y * w; c.z += s.p.z * w; }
      else cells.set(k, { w, x: s.p.x * w, y: s.p.y * w, z: s.p.z * w });
    }
    const top = [...cells.values()].sort((a, b) => b.w - a.w);
    for (let i = 0; i < LIGHTS; i++) {
      const l = this.lights[i], c = top[i];
      if (!c || c.w <= 0) { l.intensity = 0; continue; }
      l.position.set(c.x / c.w, c.y / c.w + 0.6, c.z / c.w);
      l.intensity = (1.5 + Math.min(12, c.w * 25)) * (0.75 + Math.random() * 0.5);
    }
  }

  clear() {
    this.spots.length = 0;
    this.scars.length = 0;
    this.fuel.clear();
    this.cooking.clear();
    this.scorch.count = 0;
    this._scorchFree = 0;
    for (const l of this.lights) l.intensity = 0;
  }
}
