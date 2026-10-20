import * as THREE from 'three';
import { FLOOR_H, PODIUM_FLOORS, TOP_FLOOR, LOWER, T, U, ATRIUM, OUTLINE, inPoly, inCore, podiumFront, PODIUM, BASEMENT } from '../building/plan.js';
import { interiorEnvironment } from '../render/materials.js';

// Sprinklers, the pipes that feed them, the water they let go, and the alarm.
//
// Every floor of the tower has sprinkler heads on its ceiling, three and a
// half metres apart, fed by red mains hung under the slab. A head opens when a
// fire has been burning under it for a moment — its glass bulb bursts — and
// sprays the floor round it, and most fires it reaches go out. Where water
// falls the floor gets wet: dark, slippery, and a mirror. Break a main and the
// water comes out of it on the spot, and that floor's heads go dry.
//
// The heads are not pieces: there are hundreds and you cannot hit one. Each
// remembers the floor it hangs under, and goes when that does.

const HEAD_GAP = 3.5;          // m between heads
const REACH = 2.4;             // m: a head opens over a fire this close (across), and douses within it
const OPEN_AFTER = 1.1;        // s of fire under it before its bulb goes
const SPRAY_ON = 14;           // s it runs on after the last fire under it is out
const POUR = 90;               // s a broken main pours
const MAX_PUDDLES = 260;
const MAX_HEADS = 1400;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Is (x, z) floor space on storey f, away from the core and, on the shop
// floors, the atrium's void?
function onFloor(f, x, z) {
  if (inCore(x, z, 0.6)) return false;
  if (f < PODIUM_FLOORS) {
    if (x < PODIUM.x0 + 0.5 || x > PODIUM.x1 - 0.5 || z < PODIUM.z0 + 0.5 || z > podiumFront(f) - 0.5) return false;
    if (f >= 1 && f <= ATRIUM.top && x > ATRIUM.x0 - 0.3 && x < ATRIUM.x1 + 0.3 && z > ATRIUM.z0 - 0.3 && z < ATRIUM.z1 + 0.3) return false;
    return true;
  }
  return inPoly(OUTLINE, x, z) && inPoly(OUTLINE, x + 0.6, z) && inPoly(OUTLINE, x - 0.6, z) && inPoly(OUTLINE, x, z + 0.6) && inPoly(OUTLINE, x, z - 0.6);
}

export class Water {
  constructor(scene, pieces, physics, fx) {
    this.pieces = pieces;
    this.physics = physics;
    this.fx = fx;                // { particles, chips, audio, fire, people, smoke }
    this.heads = [];             // { x, y, z, f, under, t, open, on, gone }
    this.pours = [];             // { at, t, floorY, puddle }
    this.puddles = [];           // { x, y, z, r, max, under, i }
    this.dry = new Set();        // floors whose mains are broken
    this.alarm = 0;              // s the alarm has left to sound
    this._tick = 0;

    // The heads: a chrome rose and a red glass bulb, one instanced mesh each.
    const rose = new THREE.CylinderGeometry(0.035, 0.05, 0.018, 12);
    const bulb = new THREE.CapsuleGeometry(0.008, 0.03, 3, 6).translate(0, -0.03, 0);
    this.roses = new THREE.InstancedMesh(rose, new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 }), MAX_HEADS);
    this.bulbs = new THREE.InstancedMesh(bulb, new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0x400800, roughness: 0.1, transparent: true, opacity: 0.85 }), MAX_HEADS);
    for (const m of [this.roses, this.bulbs]) { m.count = 0; m.frustumCulled = false; scene.add(m); }

    // Wet floor: discs of water lying on it, dark and mirror-smooth.
    const wet = new THREE.MeshStandardMaterial({
      color: 0x0a0d10, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 0.35,
    });
    const env = interiorEnvironment();
    if (env) wet.envMap = env;
    this.wetMat = wet;
    this.wet = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), wet, MAX_PUDDLES);
    this.wet.count = 0;
    this.wet.frustumCulled = false;
    this.wet.renderOrder = 1;
    scene.add(this.wet);
  }

  // After a job loads: a head every few metres under every ceiling of the
  // tower, each knowing the slab it hangs from; the mains are pieces (the
  // building made them), found by their role.
  attach() {
    this.clear();
    if (!this.wetMat.envMap) { const env = interiorEnvironment(); if (env) { this.wetMat.envMap = env; this.wetMat.needsUpdate = true; } }
    const slabs = this.pieces.list.filter((p) => p.role === 'slab' && p.building === 'tower' && p.state === 'static');
    const slabOver = (x, y, z) => slabs.find((s) => Math.abs(s.box.min.y - y) < 0.12 && x > s.box.min.x && x < s.box.max.x && z > s.box.min.z && z < s.box.max.z);
    for (let f = LOWER; f <= TOP_FLOOR && this.heads.length < MAX_HEADS; f++) {
      const top = U(f);
      for (let x = PODIUM.x0 + 1; x <= PODIUM.x1 - 1; x += HEAD_GAP) for (let z = PODIUM.z0 + 1; z <= BASEMENT.z1 - 1 + Math.max(0, podiumFront(0) - BASEMENT.z1); z += HEAD_GAP) {
        const hx = x + ((f & 1) ? HEAD_GAP / 2 : 0);
        if (!onFloor(f, hx, z)) continue;
        const under = slabOver(hx, top, z);
        if (!under) continue;
        this.heads.push({ x: hx, y: top - 0.05, z, f, under, t: 0, open: false, on: 0, gone: false, fed: 0 });
      }
    }
    this.mainsOf = new Map();
    for (const p of this.pieces.list) if (p.role === 'pipe') (this.mainsOf.get(p.floor) ?? this.mainsOf.set(p.floor, []).get(p.floor)).push(p);
    this._drawHeads();
  }

  _drawHeads() {
    let n = 0;
    for (const h of this.heads) {
      if (h.gone) continue;
      _m.makeTranslation(h.x, h.y, h.z);
      this.roses.setMatrixAt(n, _m);
      if (h.open) _m.makeScale(0, 0, 0);          // the bulb has burst
      this.bulbs.setMatrixAt(n, _m);
      n++;
    }
    this.roses.count = this.bulbs.count = n;
    this.roses.instanceMatrix.needsUpdate = this.bulbs.instanceMatrix.needsUpdate = true;
  }

  // A main has broken: water out of both ends of it, and its floor is dry.
  burst(p) {
    if (p.role !== 'pipe' || p.burst) return;
    p.burst = true;
    this.fx.onMain?.();
    this.dry.add(p.floor);
    const b = p.box;
    const along = b.max.x - b.min.x > b.max.z - b.min.z;
    for (const s of [-1, 1]) {
      const at = new THREE.Vector3(along ? (s < 0 ? b.min.x : b.max.x) : (b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, along ? (b.min.z + b.max.z) / 2 : (s < 0 ? b.min.z : b.max.z));
      this.pours.push({ at, t: POUR, floorY: null, puddle: null, look: 0 });
    }
    this.fx.audio?.snap?.(b.max.x, b.max.y, b.max.z, 0.7);
    this.fx.audio?.hiss?.(b.max.x, b.max.y, b.max.z);
  }

  // Is there water underfoot at `pos`? 0 dry .. 1 standing in it.
  wetAt(pos) {
    let w = 0;
    for (const d of this.puddles) {
      if (Math.abs(pos.y - d.y) > 0.6) continue;
      const k = 1 - Math.hypot(pos.x - d.x, pos.z - d.z) / d.r;
      if (k > w) w = k;
    }
    return Math.min(1, w * 3);
  }

  update(dt) {
    const fire = this.fx.fire, particles = this.fx.particles;
    this._tick -= dt;
    let changed = false;
    if (this._tick <= 0) {
      this._tick = 0.2;
      changed = this._think(0.2) || changed;
    }
    // Open heads spray, while they have water.
    let spraying = 0;
    for (const h of this.heads) {
      if (!h.open || h.gone || h.on <= 0) continue;
      h.on -= dt;
      if (this.dry.has(h.f)) { if (Math.random() < dt * 3) particles.spawn('spray', h.x, h.y - 0.05, h.z, 0, -1, 0); continue; }
      spraying++;
      const n = 4 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 1.2 + Math.random() * 2.2;
        particles.spawn('spray', h.x, h.y - 0.06, h.z, Math.cos(a) * s, -0.5 - Math.random(), Math.sin(a) * s);
      }
      fire?.douse(_v.set(h.x, h.y, h.z), REACH, dt * 1.6, true);
      if (h.puddle) h.puddle.max = Math.min(2.6, h.puddle.max + dt * 0.4);
    }
    // Broken mains pour.
    for (const w of this.pours) {
      if (w.t <= 0) continue;
      w.t -= dt;
      for (let i = 0; i < 6; i++) particles.spawn('spray', w.at.x + (Math.random() - 0.5) * 0.1, w.at.y, w.at.z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.4, -1, (Math.random() - 0.5) * 0.4);
      if ((w.look -= dt) <= 0) {
        w.look = 1;
        const hit = this.physics.raycast(w.at.clone().add(new THREE.Vector3(0, -0.2, 0)), { x: 0, y: -1, z: 0 }, 60);
        if (hit && hit.owner?.parts) {
          if (!w.puddle || Math.abs(w.puddle.y - hit.point.y) > 0.3) w.puddle = this._puddle(hit.point, hit.owner, 0.4);
          if (w.puddle) w.puddle.max = Math.min(4, w.puddle.max + 0.25);
          fire?.douse(hit.point, 1.5, 0.8, true);
        }
      }
    }
    // Puddles spread, and go when the floor under them does.
    for (const d of this.puddles) {
      if (d.under && d.under.state !== 'static' && d.under.state !== 'rubble') { d.gone = true; changed = true; continue; }
      if (d.r < d.max) { d.r = Math.min(d.max, d.r + dt * 0.35); changed = true; }
    }
    if (changed) {
      this.puddles = this.puddles.filter((d) => !d.gone);
      this._drawPuddles();
    }
    // The alarm.
    if (this.alarm > 0) this.alarm -= dt;
    this.fx.audio?.alarm?.(this.alarm > 0);
    this.fx.audio?.sprinklers?.(Math.min(1, spraying / 4));
    return spraying;
  }

  // Five times a second: which heads have a fire under them; which have lost
  // their slab; which floors have lost a main.
  _think(dt) {
    const fire = this.fx.fire;
    let changed = false;
    for (const [f, list] of this.mainsOf ?? []) for (const p of list) if (!p.burst && p.state !== 'static') this.burst(p);
    const spots = fire ? fire.spots : [];
    for (const h of this.heads) {
      if (h.gone) continue;
      if (h.under.state !== 'static') { h.gone = true; changed = true; continue; }
      let heat = 0;
      for (const s of spots) {
        if (s.heat <= 0 || s.p.y > h.y || s.p.y < h.y - FLOOR_H) continue;
        const d = Math.hypot(s.p.x - h.x, s.p.z - h.z);
        if (d < REACH) heat += s.heat * (0.5 + s.r);
      }
      if (heat > 0) {
        h.t += dt * Math.min(2, heat);
        if (!h.open && h.t > OPEN_AFTER) this._open(h);
        if (h.open) h.on = SPRAY_ON;
        this.alarm = Math.max(this.alarm, 30);
      }
      if (h.open && h.on > 0 && !this.dry.has(h.f) && !h.puddle) {
        const hit = this.physics.raycast(new THREE.Vector3(h.x, h.y - 0.1, h.z), { x: 0, y: -1, z: 0 }, FLOOR_H);
        if (hit && hit.owner?.parts) h.puddle = this._puddle(hit.point, hit.owner, 0.3);
      }
    }
    // Smoke on a floor sets it off too.
    if (this.fx.smoke?.worst?.() > 0.15) this.alarm = Math.max(this.alarm, 30);
    if (changed) this._drawHeads();
    return changed;
  }

  _open(h) {
    h.open = true;
    h.on = SPRAY_ON;
    this.fx.chips?.burst('glass', new THREE.Vector3(h.x, h.y - 0.03, h.z), new THREE.Vector3(0, -1, 0), 3, 1.5, 0.01);
    this.fx.audio?.snap?.(h.x, h.y, h.z, 0.3);
    if (this.alarm <= 0) this.fx.people?.alarm(new THREE.Vector3(h.x, h.y, h.z), 60);
    this.alarm = Math.max(this.alarm, 30);
    this._drawHeads();
  }

  _puddle(point, under, r) {
    for (const d of this.puddles) if (Math.abs(d.y - point.y) < 0.2 && Math.hypot(d.x - point.x, d.z - point.z) < d.r * 0.6) return d;
    if (this.puddles.length >= MAX_PUDDLES) this.puddles.shift();
    const d = { x: point.x, y: point.y + 0.012, z: point.z, r: 0.1, max: r, under };
    this.puddles.push(d);
    return d;
  }

  _drawPuddles() {
    let n = 0;
    for (const d of this.puddles) {
      _m.compose(_v.set(d.x, d.y, d.z), _q.identity(), _s.set(d.r, 1, d.r));
      this.wet.setMatrixAt(n++, _m);
    }
    this.wet.count = n;
    this.wet.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.heads.length = 0;
    this.pours.length = 0;
    this.puddles.length = 0;
    this.dry.clear();
    this.alarm = 0;
    this.roses.count = this.bulbs.count = this.wet.count = 0;
    this.fx.audio?.alarm?.(false);
    this.fx.audio?.sprinklers?.(0);
  }
}
