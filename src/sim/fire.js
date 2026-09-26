import * as THREE from 'three';

// Fire.
//
// A piece that burns has fuel — how long its material lasts, scaled by how much
// of it there is — and an intensity that builds up over a few seconds. While it
// burns it chars (the piece darkens towards black), throws flame and smoke, and
// every half second may light what it is touching. When the fuel is gone the
// piece is gone, and whatever it was holding up comes down: burn out the carpet
// and the desks sit on bare concrete, burn out a partition and the shelf on it
// falls.
//
// Gas does not burn, it cooks: a tank in a fire goes off a few seconds later.
//
// Standing in it hurts. The extinguisher knocks the intensity down, and a fire
// with no intensity left is out.

const MAX = 400;
const LIGHTS = 6;
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Fire {
  constructor(scene, pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;                 // { particles, audio, explode(piece) }
    this.burning = new Map();     // piece -> { fuel, fuel0, heat }
    this.cooking = new Map();     // tank piece -> seconds left
    this._tick = 0;
    this.lights = [];
    for (let n = 0; n < LIGHTS; n++) {
      // Always in the scene, switched by intensity: changing the number of
      // visible lights makes every material recompile.
      const l = new THREE.PointLight(0xff7a30, 0, 16, 1.7);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  get count() { return this.burning.size; }

  ignite(p, heat = 0.3) {
    if (!p || p.state === 'dead') return false;
    if (p.kind.explodes > 0) { if (!this.cooking.has(p)) this.cooking.set(p, 2.5 + Math.random() * 2.5); return true; }
    const burns = Math.max(...p.parts.map((q) => q.kind.burns));
    if (burns <= 0 || this.burning.has(p) || this.burning.size >= MAX) return false;
    const fuel = burns * THREE.MathUtils.clamp(Math.cbrt(p.volume) * 1.4, 0.4, 3);
    this.burning.set(p, { fuel, fuel0: fuel, heat });
    return true;
  }

  // Set light to anything burnable near a point.
  igniteAround(point, radius, chance = 0.6) {
    this.physics.overlapSphere(point, radius, (o) => {
      if (o && o.parts && Math.random() < chance) this.ignite(o, 0.6);
    });
  }

  // Spray from `origin` along `dir`: knock down every fire in the cone.
  extinguish(origin, dir, range, cosHalf, dt) {
    let hit = 0;
    for (const [p, b] of this.burning) {
      p.box.getCenter(_c);
      const d = _v.copy(_c).sub(origin);
      const len = d.length();
      const near = p.box.distanceToPoint(origin);
      if (near > range) continue;
      if (len > 0.6 && d.dot(dir) / len < cosHalf) continue;
      b.heat -= dt * 1.6 * (1 - near / range * 0.5);
      hit++;
      if (b.heat <= 0) {
        this.burning.delete(p);
        this.fx.particles.burst('smoke', _c.x, _c.y, _c.z, 6, 1, 0xbdbdbd, 1);
      }
    }
    for (const [p] of this.cooking) {
      if (p.box.distanceToPoint(origin) < range) this.cooking.delete(p);
    }
    return hit;
  }

  // Returns the damage per second the player should take at `pos`.
  update(dt, pos) {
    const { particles } = this.fx;
    this._tick += dt;
    const spread = this._tick > 0.5;
    if (spread) this._tick = 0;
    const flameBudget = Math.min(1, 260 / Math.max(1, this.burning.size));
    let dps = 0;
    const burnt = [];
    const light = [];
    for (const [p, b] of this.burning) {
      if (p.state === 'dead') { this.burning.delete(p); continue; }
      b.heat = Math.min(1, b.heat + dt * 0.25);
      b.fuel -= dt * b.heat;
      this.pieces.char(p, 1 - b.fuel / b.fuel0);
      const box = p.box;
      // Flame over the top of the piece, smoke above it.
      const n = Math.random() < b.heat * flameBudget * dt * 30 ? 1 + ((b.heat * 2) | 0) : 0;
      for (let i = 0; i < n; i++) {
        const x = box.min.x + Math.random() * (box.max.x - box.min.x);
        const z = box.min.z + Math.random() * (box.max.z - box.min.z);
        const y = box.max.y - Math.random() * (box.max.y - box.min.y) * 0.3;
        particles.spawn('flame', x, y, z, (Math.random() - 0.5) * 0.3, 0.8 + Math.random(), (Math.random() - 0.5) * 0.3);
        if (Math.random() < 0.25) particles.spawn('smoke', x, y + 0.5, z, 0, 1, 0);
      }
      const near = box.distanceToPoint(_v.set(pos.x, pos.y + 0.9, pos.z));
      if (near < 1.0) dps = Math.max(dps, 28 * b.heat * (1 - near));
      if (spread && Math.random() < b.heat * 0.4) {
        box.getCenter(_c);
        const size = box.getSize(_v);
        const r = Math.max(size.x, size.y, size.z) / 2 + 0.5;
        this.physics.overlapSphere(_c, r, (o) => {
          if (o && o.parts && o !== p && Math.random() < 0.5) this.ignite(o, 0.15);
        });
      }
      if (b.fuel <= 0) burnt.push(p);
      light.push([p, b.heat * Math.cbrt(p.volume)]);
    }
    for (const p of burnt) {
      this.burning.delete(p);
      p.box.getCenter(_c);
      particles.burst('smoke', _c.x, _c.y, _c.z, 8, 1, 0x222222, 1);
      this.fx.chips?.burst('carpet', _c, new THREE.Vector3(0, 1, 0), 6, 1, 0.04);
      this.pieces.destroy(p);
    }
    for (const [p, t] of this.cooking) {
      if (p.state === 'dead') { this.cooking.delete(p); continue; }
      const left = t - dt;
      if (left > 0) { this.cooking.set(p, left); continue; }
      this.cooking.delete(p);
      this.fx.explode(p);
    }
    this._placeLights(light);
    this.fx.audio?.fire(this.burning.size, dps > 0 ? 0 : 10);
    return dps;
  }

  _placeLights(list) {
    list.sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < LIGHTS; i++) {
      const l = this.lights[i], e = list[i];
      if (!e) { l.intensity = 0; continue; }
      e[0].box.getCenter(l.position);
      l.position.y = e[0].box.max.y + 0.4;
      l.intensity = (8 + e[1] * 30) * (0.75 + Math.random() * 0.5);
    }
  }

  clear() {
    this.burning.clear();
    this.cooking.clear();
    for (const l of this.lights) l.intensity = 0;
  }
}
