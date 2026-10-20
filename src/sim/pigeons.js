import * as THREE from 'three';
import { SITE } from '../site.js';

// Pigeons: flocks on the pavements and the plaza in front of the tower,
// walking about and pecking. Come within a few metres — or run at them — and
// the whole flock goes up in a clatter of wings, circles over the street and
// comes down somewhere else; a bang anywhere near puts every flock in the air.
// Two instanced meshes, bodies and wings, for all of them.

// Where flocks gather: the site's (site.js).
const spots = () => SITE.pigeons;
const FLOCK = [6, 12];
const SCARE = 3.5, SCARE_RUN = 7;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Pigeons {
  constructor(scene, audio) {
    this.audio = audio;
    // A body: breast, head and tail in one shape, grey with a darker head.
    const body = new THREE.SphereGeometry(0.11, 10, 8).scale(0.9, 0.85, 1.35);
    const head = new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.1, -0.13);
    const tail = new THREE.BoxGeometry(0.09, 0.02, 0.14).translate(0, 0.0, 0.17);
    const geo = mergeAll([body, head, tail]);
    this.bodies = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x4e5664, roughness: 0.9 }), 160);
    this.wings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.012, 0.14).translate(0.13, 0, 0), new THREE.MeshStandardMaterial({ color: 0x464d59, roughness: 0.9 }), 320);
    for (const m of [this.bodies, this.wings]) { m.castShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); }
    this.birds = [];
    this.flocks = [];
  }

  // Flocks out on the pavements, a fresh lot for each job.
  populate() {
    this.birds.length = 0;
    this.flocks.length = 0;
    for (const [x, z] of spots()) {
      if (Math.random() < 0.3) continue;
      const flock = { home: new THREE.Vector3(x, 0, z), up: false, t: 0, birds: [] };
      const n = FLOCK[0] + ((Math.random() * (FLOCK[1] - FLOCK[0])) | 0);
      for (let i = 0; i < n; i++) {
        const b = { flock, pos: new THREE.Vector3(x + (Math.random() - 0.5) * 4, 0, z + (Math.random() - 0.5) * 3), yaw: Math.random() * 6.3, vel: new THREE.Vector3(), peck: Math.random() * 3, flap: 0, walk: 0, air: false };
        flock.birds.push(b);
        this.birds.push(b);
      }
      this.flocks.push(flock);
    }
  }

  // Something loud at `at`: every flock within r goes up.
  scare(at, r = 40) {
    for (const f of this.flocks) if (!f.up && f.home.distanceTo(at) < r) this._lift(f, at);
  }

  _lift(f, from) {
    f.up = true;
    f.t = 6 + Math.random() * 6;
    // Somewhere else to come down.
    const S = spots(), [x, z] = S[(Math.random() * S.length) | 0];
    f.next = new THREE.Vector3(x, 0, z);
    f.centre = f.home.clone().lerp(f.next, 0.5).setY(14 + Math.random() * 10);
    for (const b of f.birds) {
      b.air = true;
      const away = _v.copy(b.pos).sub(from).setY(0).normalize();
      b.vel.set(away.x * 3 + (Math.random() - 0.5) * 2, 4.5 + Math.random() * 2, away.z * 3 + (Math.random() - 0.5) * 2);
    }
    this.audio?.flutter?.(f.home.x, 1, f.home.z, f.birds.length);
  }

  update(dt, player) {
    if (!this.birds.length) return;
    const running = Math.hypot(player.vel.x, player.vel.z) > 5;
    for (const f of this.flocks) {
      if (!f.up) {
        // You, too close.
        for (const b of f.birds) {
          const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
          if (Math.abs(player.pos.y - b.pos.y) < 3 && d < (running ? SCARE_RUN : SCARE)) { this._lift(f, player.pos); break; }
        }
        continue;
      }
      f.t -= dt;
      if (f.t <= 0 && f.birds.every((b) => !b.air)) { f.up = false; f.home.copy(f.next); }
    }
    for (const b of this.birds) {
      const f = b.flock;
      if (b.air) {
        // Round the flock's centre, then down to its new home.
        const goal = f.t > 0 ? _v.set(f.centre.x + Math.sin(f.t * 0.9 + b.yaw) * 8, f.centre.y + Math.sin(f.t * 1.7 + b.yaw) * 2, f.centre.z + Math.cos(f.t * 0.9 + b.yaw) * 8)
          : _v.set(f.next.x + Math.sin(b.yaw * 7) * 2, 0, f.next.z + Math.cos(b.yaw * 5) * 1.5);
        const to = goal.sub(b.pos);
        b.vel.addScaledVector(to, dt * 1.6).multiplyScalar(1 - dt * 0.9);
        const sp = b.vel.length();
        if (sp > 9) b.vel.multiplyScalar(9 / sp);
        b.pos.addScaledVector(b.vel, dt);
        b.yaw = Math.atan2(-b.vel.x, -b.vel.z);
        b.flap += dt * (f.t > 0 || to.y < -1 ? 22 : 30);
        if (f.t <= 0 && b.pos.y < 0.05 && to.length() < 2.5) { b.air = false; b.pos.y = 0; b.vel.set(0, 0, 0); }
        if (b.pos.y < 0) b.pos.y = 0;
      } else {
        // On the ground: a few steps, a peck, a look round.
        b.peck -= dt;
        if (b.peck < 0) { b.peck = 1 + Math.random() * 3; b.walk = Math.random() < 0.5 ? 0.6 + Math.random() : 0; b.yaw += (Math.random() - 0.5) * 2; }
        if (b.walk > 0) {
          b.walk -= dt;
          b.pos.x -= Math.sin(b.yaw) * dt * 0.35; b.pos.z -= Math.cos(b.yaw) * dt * 0.35;
          // Do not wander off from the flock.
          if (b.pos.distanceTo(f.home) > 3.5) b.yaw = Math.atan2(b.pos.x - f.home.x, b.pos.z - f.home.z);
        }
      }
    }
    this._draw();
  }

  _draw() {
    let n = 0;
    for (const b of this.birds) {
      // Walking, the head nods; pecking, the body tips forward.
      const pitch = b.air ? -0.15 : b.walk > 0 ? Math.sin(performance.now() / 70 + b.yaw) * 0.08 : b.peck < 0.3 ? 0.5 : 0;
      _m.compose(_v.set(b.pos.x, b.pos.y + 0.1, b.pos.z), _q.setFromEuler(_e.set(-pitch, b.yaw, 0, 'YXZ')), _s.set(1, 1, 1));
      this.bodies.setMatrixAt(n, _m);
      // Wings folded on the ground; beating in the air.
      const beat = b.air ? Math.sin(b.flap) * 0.9 : 0;
      for (const side of [-1, 1]) {
        const fold = b.air ? 0 : 1;
        _q.setFromEuler(_e.set(-pitch, b.yaw + (side < 0 ? Math.PI : 0), side * (beat - fold * 0.1), 'YXZ'));
        const scale = b.air ? 1 : 0.55;
        _m.compose(_v.set(b.pos.x, b.pos.y + 0.13, b.pos.z), _q, _s.set(scale, 1, 1));
        this.wings.setMatrixAt(n * 2 + (side > 0 ? 1 : 0), _m);
      }
      n++;
    }
    this.bodies.count = n;
    this.wings.count = n * 2;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }

  clear() { this.birds.length = 0; this.flocks.length = 0; this.bodies.count = this.wings.count = 0; }
}

function mergeAll(geos) {
  const g = new THREE.BufferGeometry();
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const s of geos) {
    const p = s.attributes.position, nm = s.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nm.getX(i), nm.getY(i), nm.getZ(i)); }
    const ix = s.index ? s.index.array : [...Array(p.count).keys()];
    for (const i of ix) idx.push(i + base);
    base += p.count;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
