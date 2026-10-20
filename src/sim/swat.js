import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { T, ROOF, TOP_FLOOR, FLOOR_H } from '../building/plan.js';
import { SITE } from '../site.js';

// SWAT, called for a threat to New York City (sim/wanted.js, law 8).
//
// A black van comes down Fifth Avenue far faster than the traffic, jumps the
// kerb and stops on the pavement at the front doors — SWAT do not look for
// parking. The back doors swing open and the team runs in, a man with a riot
// shield in front (nothing gets through a shield). A helicopter comes in along
// the avenue, hovers over the roof while a second team ropes down onto it,
// then patrols up and down Fifth Avenue — the only open sky near the tower:
// the blocks round it stand up to 160 m — with a spotlight through the windows; if the beam
// finds you, SWAT are told your floor. SWAT search quicker than the police
// and leave one of theirs at the stair door of each floor they have cleared.
//
// They are officers to security.js (kind 'cop', `swat` set): they catch you
// the same way, and what else they carry follows the job's difficulty —
// nets and tasers, and only on Insane anything more.

const SWAT = { leg: 0x15171c, hips: 0x15171c, body: 0x262a31, arm: 0x1c1f25, head: 0xc98f6a, hair: 0x0c0d10, skirt: 0x15171c };
const SKIN = [0xf1d3bd, 0xe2b594, 0xc98f6a, 0x9c6a4a, 0x6e4a33];
// On the pavement at the doors; over the roof; the street to patrol (the site's).
const vanStop = () => new THREE.Vector3(SITE.swat.stop[0], 0, SITE.swat.stop[1]);
const hover = () => new THREE.Vector3(0, T(ROOF) + 13, 0);
const SEE_BEAM = 0.075;   // rad: the beam's half-width, as you see it from the helicopter

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Swat {
  constructor(security) {
    this.sec = security;
    this.van = null;
    this.heli = null;
    this.shields = [];
    this.sliders = [];
  }

  get fx() { return this.sec.fx; }

  // Called: the van and the helicopter set off.
  start() {
    const { level } = this.sec;
    this.team = { supereasy: 0, easy: 4, normal: 6, hard: 8, insane: 10 }[level.id] ?? 6;
    this.ropers = { easy: 2, normal: 2, hard: 3, insane: 4 }[level.id] ?? 2;
    this._van();
    this._heli();
    this.fx.audio?.rotor?.(true);
  }

  // ---------------------------------------------------------------- the van

  _van() {
    const g = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.45, metalness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.05, metalness: 0.7 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.3, 2.3, 5.8, 3, 0.18), black);
    body.position.y = 1.45;
    const screen = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.7, 0.1, 2, 0.04), glass);
    screen.position.set(0, 2.0, -2.9);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.34, 3.6), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5 }));
    band.position.set(0, 1.45, 0.6);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 0 }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: 0x000030, emissive: 0x2050ff, emissiveIntensity: 0 }));
    red.position.set(-0.4, 2.67, -2.2); blue.position.set(0.4, 2.67, -2.2);
    // The back doors, hinged at the sides.
    const doors = [-1, 1].map((s) => {
      const hinge = new THREE.Group();
      hinge.position.set(s * 1.12, 1.45, 2.92);
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.08), black);
      d.position.x = -s * 0.55;
      hinge.add(d);
      hinge.userData.side = s;
      return hinge;
    });
    const wheels = [];
    for (const [x, z] of [[-1.05, -1.9], [1.05, -1.9], [-1.05, 1.9], [1.05, 1.9]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z);
      wheels.push(w);
    }
    g.add(body, screen, band, red, blue, ...doors, ...wheels);
    for (const m of g.children) m.castShadow = true;
    // Down the avenue the way the traffic goes (−x), nose first.
    g.position.set(SITE.swat.from, 0, SITE.swat.lane);
    g.rotation.y = -Math.PI / 2;
    this.fx.scene.add(g);
    this.van = { g, red, blue, doors, x: SITE.swat.from, phase: 'drive', t: 0, out: 0 };
  }

  _driveVan(dt) {
    const v = this.van;
    if (!v) return;
    const on = Math.floor(this.sec.time * 5) % 2;
    v.red.material.emissiveIntensity = on ? 4 : 0; v.blue.material.emissiveIntensity = on ? 0 : 4;
    const g = v.g;
    if (v.phase === 'drive') {
      // Flat out down the avenue, then a hard swing in towards the doors.
      v.x -= dt * 26;
      g.position.x = v.x;
      if (v.x <= SITE.swat.turn) { v.phase = 'turn'; v.t = 0; v.from = g.position.clone(); this.fx.audio?.horn?.(g.position.x, 1, g.position.z); }
    } else if (v.phase === 'turn') {
      v.t = Math.min(1, v.t + dt / 1.6);
      const k = v.t, e = 1 - (1 - k) * (1 - k);
      // A curve from the lane, over the kerb, to the pavement by the doors.
      const p2 = vanStop(), p0 = v.from, p1 = new THREE.Vector3(p2.x + 4, 0, SITE.swat.lane);
      const a = _v.copy(p0).lerp(p1, e), b = _w.copy(p1).lerp(p2, e);
      g.position.copy(a.lerp(b, e));
      // Facing along the way it is going: from the avenue round to the doors.
      g.rotation.y = -Math.PI / 2 + (Math.PI / 2) * e;
      // Over the kerb: a jolt as it crosses.
      const z = g.position.z;
      const [k0, k1] = SITE.swat.kerb, over = z < k1 && z > k0 ? (k1 - z) / (k1 - k0) : -1;
      g.position.y = over >= 0 ? Math.sin(over * Math.PI) * 0.22 : 0;
      g.rotation.x = over >= 0 ? Math.cos(over * Math.PI) * 0.06 : 0;
      if (k >= 1) { v.phase = 'stop'; v.t = 0; this.fx.audio?.thud?.(g.position.x, 0.5, g.position.z); this.fx.shake?.add(0.05); }
    } else if (v.phase === 'stop') {
      v.t += dt;
      // The back doors swing open; the team runs out, a few at a time.
      for (const d of v.doors) d.rotation.y = d.userData.side * Math.min(1, v.t * 1.5) * 1.9;
      if (v.t > 0.6 && v.out < this.team && (v.t - 0.6) * 4 > v.out) this._out(v.out++);
    }
  }

  // One of the team out of the back of the van.
  _out(n) {
    const S = this.sec;
    const g = this.van.g;
    // Behind the van (it faces −z, the doors, so its back is +z).
    const at = new THREE.Vector3(g.position.x + (n % 2 ? 0.5 : -0.5), 0.02, g.position.z + 3.4);
    const a = this._agent(0, at);
    a.mode = 'enter';
    // The first out carries the shield, and goes in front.
    if (n === 0) this._shield(a);
    S.agents.push(a);
  }

  _agent(f, at) {
    const S = this.sec;
    const a = this.fx.people.agent(f, at, { ...SWAT, head: SKIN[(Math.random() * SKIN.length) | 0] }, 1.02 + Math.random() * 0.05);
    const ranged = S.level.arms.filter((x) => x === 'net' || x === 'taser' || x === 'gun');
    const arm = ranged.length && Math.random() < 0.6 ? ranged[(Math.random() * ranged.length) | 0] : 'catch';
    const id = S.agents.filter((b) => b.kind === 'cop').length;
    Object.assign(a, { kind: 'cop', swat: true, arm, cool: 0, seen: -99, last: null, daze: 0, angry: 0, id, yaw: Math.PI, capped: true });
    return a;
  }

  // ---------------------------------------------------------------- shields

  _shield(a) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1.0, 0.05, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0x9fb3c8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55 }));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }));
    strip.position.y = 0.3;
    m.add(strip);
    this.fx.scene.add(m);
    a.shield = m;
    this.shields.push(a);
  }

  // A blow from `dir` at shield-bearer a: does the shield take it?
  blocks(a, dir) {
    if (!a.shield) return false;
    // Facing the swing: the shield is between.
    return Math.sin(a.yaw) * dir.x + Math.cos(a.yaw) * dir.z < -0.2;
  }

  _shields() {
    for (const a of this.shields) {
      const m = a.shield;
      m.visible = !a.hidden && a.state !== 'gone';
      if (!m.visible) continue;
      const down = a.state === 'down';
      m.position.set(a.pos.x + Math.sin(a.yaw) * 0.42, a.pos.y + (down ? 0.15 : 1.0) * a.height, a.pos.z + Math.cos(a.yaw) * 0.42);
      m.rotation.set(down ? -Math.PI / 2 : 0, a.yaw, 0);
    }
  }

  // ---------------------------------------------------------------- the helicopter

  _heli() {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: 0x1a2436, roughness: 0.4, metalness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 14), paint);
    body.scale.set(1, 0.85, 1.7);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.0, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.6 }));
    glass.rotation.x = -Math.PI / 2.4; glass.position.set(0, 0.15, -1.4);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, 5, 10), paint);
    boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.25, 3.6);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.7), paint);
    fin.position.set(0, 0.8, 5.9);
    const tail = new THREE.Group();
    tail.position.set(0.15, 0.8, 5.9);
    for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.1), dark); b.rotation.x = r; tail.add(b); }
    const rotor = new THREE.Group();
    rotor.position.y = 1.45;
    for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 10), dark); b.rotation.y = r + Math.PI / 4; rotor.add(b); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), dark);
    mast.position.y = 1.25;
    const skids = [-0.85, 0.85].map((x) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), dark); s.rotation.x = Math.PI / 2; s.position.set(x, -1.35, 0); return s; });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    lamp.position.set(0, -1.1, -1.4);
    g.add(body, glass, boom, fin, tail, rotor, mast, ...skids, lamp);
    for (const m of g.children) m.castShadow = true;
    // The spotlight's beam: a cone of light in the air, and a pool where it lands.
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.geometry.translate(0, -0.5, 0);
    beam.frustumCulled = false;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fx.scene.add(g, beam, pool);
    // In from the west along the avenue, then over the roof.
    const A = SITE.swat.heli;
    g.position.set(-320, A.y + 15, A.z);
    const path = [new THREE.Vector3(0, A.y + 15, A.z), hover()];
    this.heli = { g, rotor, tail, beam, pool, phase: 'in', path, t: 0, ang: 0, sweep: 0, lit: 0, lock: 0, roped: 0, ropes: [] };
  }

  _fly(dt) {
    const h = this.heli;
    if (!h) return;
    const g = h.g;
    h.rotor.rotation.y += dt * 28;
    h.tail.rotation.x += dt * 40;
    h.t += dt;
    let goal;
    if (h.phase === 'in') {
      goal = h.path[0];
      if (g.position.distanceTo(goal) < 1.5) { h.path.shift(); if (!h.path.length) { h.phase = 'rope'; h.t = 0; } }
    } else if (h.phase === 'rope') {
      goal = hover();
      this._rope(dt);
      if (h.t > 12) { h.phase = 'patrol'; h.t = 0; for (const r of h.ropes) r.removeFromParent(); h.ropes.length = 0; }
    } else {
      // Up and down the avenue, slowly, nose to the tower.
      h.ang += dt * 0.12;
      const A = SITE.swat.heli;
      goal = _w.set(Math.sin(h.ang) * A.reach, A.y + Math.sin(h.t * 0.3) * 4, A.z);
    }
    const to = _v.copy(goal).sub(g.position);
    const d = to.length();
    const speed = h.phase === 'in' ? 34 : 14;
    if (d > 0.05) g.position.addScaledVector(to.divideScalar(d), Math.min(d, speed * dt));
    // Nose along the way it flies, tilted into it; over the roof, nose to the tower.
    const face = h.phase === 'in' ? Math.atan2(-to.x, -to.z) : 0;
    g.rotation.set(Math.min(0.25, d * 0.01) * (h.phase === 'in' ? 1 : 0.4), face, 0, 'YXZ');
    this._beam(dt);
  }

  // Ropes down to the roof, and a team sliding down them; each lands, goes in
  // at the roof's stair door and searches from the top floor down.
  _rope(dt) {
    const h = this.heli;
    const roof = T(ROOF);
    if (!h.ropes.length) {
      for (const s of [-1, 1]) {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(s * 1.0, -1.3, 0), new THREE.Vector3(s * 1.0, roof - hover().y, 0)]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x2a2a2a }));
        h.g.add(line);
        h.ropes.push(line);
      }
    }
    if (h.roped < this.ropers && h.t > 1 + h.roped * 2.2) {
      const side = h.roped % 2 ? 1 : -1;
      const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1c1f25, roughness: 0.7 }));
      fig.position.set(h.g.position.x + side, hover().y - 2.2, h.g.position.z);
      this.fx.scene.add(fig);
      this.sliders.push({ fig, y: hover().y - 2.2, x: fig.position.x, z: fig.position.z });
      h.roped++;
    }
    for (const s of this.sliders) {
      s.y -= dt * 4.5;
      s.fig.position.y = Math.max(roof + 0.85, s.y);
      if (s.y <= roof + 0.85 && !s.done) {
        s.done = true;
        s.fig.removeFromParent();
        // In at the top and down the stairs, out of sight, to the top floor.
        const a = this._agent(TOP_FLOOR, new THREE.Vector3(s.x, T(TOP_FLOOR), s.z));
        a.hidden = true; a.goal = TOP_FLOOR; a.stairT = 2.5; a.mode = 'search'; a.down = true;
        this.sec.agents.push(a);
      }
    }
  }

  // The spotlight: sweeping the tower floor by floor; finding you, it holds you.
  _beam(dt) {
    const h = this.heli;
    const { physics, player, camera, hud } = this.fx;
    const from = h.g.position.clone();
    from.y -= 1.1;
    let target;
    if (h.lock > 0) { h.lock -= dt; target = camera.position.clone(); }
    else {
      h.sweep += dt * 0.6;
      const f = TOP_FLOOR - (Math.floor(h.sweep / 6.3) % (TOP_FLOOR + 1));
      const side = Math.sin(h.sweep) * 9;
      // Across the face of the tower that looks at the helicopter.
      const out = _w.set(from.x, 0, from.z).normalize();
      target = new THREE.Vector3(out.z * side, T(f) + 1.6, -out.x * side);
    }
    const dir = target.clone().sub(from);
    let len = dir.length();
    dir.divideScalar(len);
    // The beam stops at the first thing that is not glass.
    const hit = physics.raycast(from, dir, len + 30);
    if (hit && !hit.owner?.kind?.glass) len = hit.distance;
    else len = Math.min(len + 30, hit ? hit.distance + 12 : len + 30);
    h.beam.position.copy(from);
    h.beam.quaternion.setFromUnitVectors(UP, _w.copy(dir).negate());
    const r = Math.max(1, len * SEE_BEAM);
    h.beam.scale.set(r, len, r);
    h.pool.position.copy(from).addScaledVector(dir, len - 0.05);
    h.pool.quaternion.setFromUnitVectors(_w.set(0, 0, 1), _v.copy(dir).negate());
    h.pool.scale.setScalar(r);
    // Are you in it? Inside the cone, and nothing solid between.
    if (player.dead || h.phase === 'in') return;
    const eye = camera.position;
    const toEye = _w.copy(eye).sub(from);
    const de = toEye.length();
    toEye.divideScalar(de);
    let inBeam = toEye.dot(dir) > Math.cos(SEE_BEAM * 1.2) && de < len + 1;
    if (inBeam) { const block = physics.raycast(from, toEye, de - 0.4); inBeam = !block || !!block.owner?.kind?.glass; }
    h.lit = inBeam ? h.lit + dt : Math.max(0, h.lit - dt * 2);
    if (h.lit > 0.7 && h.lock <= 0) {
      h.lock = 6;
      hud?.flash('The helicopter has you in its spotlight!', 2.5);
      this.sec.spotted = this.sec.time;
      // SWAT are told the floor.
      const f = Math.round((player.pos.y - T(0)) / FLOOR_H);
      for (const a of this.sec.agents) if (a.swat && !a.hidden && a.mode !== 'chase' && a.mode !== 'enter' && a.mode !== 'stair') this.sec._toFloor(a, f);
    }
  }

  update(dt) {
    this._driveVan(dt);
    this._fly(dt);
    this._shields();
  }

  clear() {
    if (this.van) this.van.g.removeFromParent();
    if (this.heli) { this.heli.g.removeFromParent(); this.heli.beam.removeFromParent(); this.heli.pool.removeFromParent(); }
    for (const a of this.shields) a.shield.removeFromParent();
    for (const s of this.sliders) s.fig.removeFromParent();
    this.van = this.heli = null;
    this.shields.length = 0;
    this.sliders.length = 0;
    this.fx.audio?.rotor?.(false);
  }
}
