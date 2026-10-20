import * as THREE from 'three';
import { SITE } from '../site.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BATCH_DEPTH } from '../render/materials.js';

// Traffic on Fifth Avenue. It is one way, as the real one is: four lanes, all
// heading the same way (−x here), yellow cabs, cars, buses and vans. They keep
// their distance, stop at the crossing in front of the tower when its light is
// red, stop for you if you walk out in front of them, and honk. Anything in
// the road — rubble, a fallen tower — stops them; something heavy landing on
// one crushes it, and its alarm goes off.
//
// Every vehicle is drawn by three batched meshes — bodies, glass, wheels — so
// the whole avenue is three draw calls. The signals' lamps are drawn here, over
// the signal heads that building/street.js put on the kerbs.

// The lanes and the stop line are the site's (site.js); LANES is read when cars are made.
let LANES = [];
const X0 = 160, X1 = -160;                 // they come in at X0 and leave at X1
let STOP = 8;                              // x of the stop line before the crossing (traffic goes −x)
const CYCLE = [22, 4, 14];                 // s green, amber, red — for the cars
const GAP = 2.5;                           // m kept to the one ahead, stopped
const COUNT = 26;

const KINDS = {
  cab: { len: 4.8, w: 1.9, h: 1.45, speed: 12, colours: [0xf2c21a], weight: 5 },
  car: { len: 4.6, w: 1.85, h: 1.45, speed: 12, colours: [0x1a1a1a, 0xe8e8e8, 0x6a7078, 0x23344f, 0x7a1a1a, 0x3a4a3a], weight: 5 },
  suv: { len: 5.0, w: 2.0, h: 1.8, speed: 11, colours: [0x111111, 0x2a2a2a, 0xf0f0f0], weight: 3 },
  van: { len: 5.8, w: 2.1, h: 2.5, speed: 10, colours: [0xf4f4f4, 0xd8d8d8], weight: 2 },
  bus: { len: 12, w: 2.55, h: 3.1, speed: 9, colours: [0x2a5aa8], weight: 1 },
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const YAW = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);   // nose to −x

// A car is its side profile — bumpers, bonnet, a sloping windscreen, the
// roof, the rear window, the boot — pushed out to its width with rounded
// edges; its glass is the cabin's band of the same profile, a hair wider. Vans
// and buses are rounded boxes with a band of windows. Never a block.
function indexed(g) {
  const n = g.attributes.position.count, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

function profile(points, w, bevel) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y))), { depth: w - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(w - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);                // profile's x (along the car) to z
  return g;
}

function shapes(k) {
  const { len: L, w, h } = k;
  const tall = h > 2.2;
  let body, glass;
  if (tall) {
    body = new RoundedBoxGeometry(w, h - 0.35, L, 3, 0.18).translate(0, (h - 0.35) / 2 + 0.35, 0);
    glass = new RoundedBoxGeometry(w + 0.03, 0.85, L * 0.9, 2, 0.1).translate(0, h - 0.85, L * 0.02);
  } else {
    const r = h - 1.45;              // an SUV's extra height goes into the cabin
    body = profile([[-L / 2, 0.32], [L / 2, 0.32], [L / 2, 0.78], [L / 2 - 0.25, 0.98], [L * 0.27, 1.04], [L * 0.1, 1.42 + r], [-L * 0.16, 1.42 + r], [-L * 0.3, 1.05], [-L / 2 + 0.15, 1.0], [-L / 2, 0.85]], w, 0.08);
    glass = profile([[L * 0.255, 1.06], [L * 0.095, 1.4 + r], [-L * 0.15, 1.4 + r], [-L * 0.285, 1.07]], w + 0.04, 0.02);
  }
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of tall && L > 8 ? [-0.36, 0.3] : [-0.33, 0.33]) wheels.push(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14).rotateZ(Math.PI / 2).translate(sx * (w / 2 - 0.12), 0.36, sz * L));
  return { body, glass, wheels: mergeGeometries(wheels) };
}

export class Traffic {
  constructor(scene, fx) {
    this.fx = fx;                // { physics, player, audio, particles, pieces }
    this.cars = [];
    this.meshes = {};
    this.t = 0;
    const mats = {
      body: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.05, metalness: 0.6 }),
      wheels: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    };
    const geos = Object.fromEntries(Object.entries(KINDS).map(([name, k]) => [name, shapes(k)]));
    this.geo = {};
    for (const part of ['body', 'glass', 'wheels']) {
      let v = 0, i = 0;
      for (const g of Object.values(geos)) { v += g[part].attributes.position.count; i += g[part].index ? g[part].index.count : g[part].attributes.position.count; }
      const b = new THREE.BatchedMesh(COUNT, v, i, mats[part]);
      b._initColorsTexture();
      b.customDepthMaterial = BATCH_DEPTH;
      b.perObjectFrustumCulled = false;
      b.sortObjects = false;
      b.castShadow = true;
      b.frustumCulled = false;
      scene.add(b);
      this.meshes[part] = b;
      for (const [name, g] of Object.entries(geos)) {
        const geo = g[part].index ? g[part] : indexed(g[part]);
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        (this.geo[name] ??= {})[part] = b.addGeometry(geo);
      }
    }
    // The signals' lamps: red, amber, green, for the cars; and a walking figure light.
    this.lamp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 24);
    this.lamp.count = 0;
    this.lamp.frustumCulled = false;
    scene.add(this.lamp);
  }

  // After a job loads: the signal heads, and the avenue filled.
  attach(pieces) {
    this.clear();
    LANES = SITE.street.lanes;
    STOP = SITE.street.stop;
    this.signals = pieces.list.filter((p) => p.tag === 'signal');
    const kinds = Object.entries(KINDS).flatMap(([n, k]) => Array(k.weight).fill(n));
    for (let i = 0; i < COUNT; i++) {
      const kind = kinds[(Math.random() * kinds.length) | 0], k = KINDS[kind];
      const lane = (Math.random() * LANES.length) | 0;
      if (kind === 'bus' && lane === 0) continue;
      const c = { kind, k, lane, x: X1 + Math.random() * (X0 - X1), v: k.speed * 0.8, colour: k.colours[(Math.random() * k.colours.length) | 0], crushed: 0, honk: 0, look: Math.random(), ids: {} };
      for (const part of ['body', 'glass', 'wheels']) c.ids[part] = this.meshes[part].addInstance(this.geo[kind][part]);
      this.meshes.body.setColorAt(c.ids.body, _c.set(c.colour));
      this.cars.push(c);
    }
    this.cars.sort((a, b) => a.x - b.x);
  }

  get light() {
    const t = this.t % (CYCLE[0] + CYCLE[1] + CYCLE[2]);
    return t < CYCLE[0] ? 'green' : t < CYCLE[0] + CYCLE[1] ? 'amber' : 'red';
  }

  // Something heavy came down at `at`: a car under it is crushed.
  landed(at, mass) {
    if (mass < 250) return;
    for (const c of this.cars) {
      if (c.crushed || Math.abs(at.z - LANES[c.lane]) > c.k.w / 2 + 0.3 || Math.abs(at.x - c.x) > c.k.len / 2 + 0.3) continue;
      c.crushed = 1; c.v = 0;
      this.fx.onCrush?.();
      this.fx.audio?.thud?.(c.x, 1, LANES[c.lane]);
      c.alarm = 25;
    }
  }

  // A blast nearby: everything stops, alarms go off.
  alarm(at, r) {
    for (const c of this.cars) if (Math.hypot(c.x - at.x, LANES[c.lane] - at.z) < r) { c.panic = 12; if (Math.random() < 0.5) c.alarm = 15; }
  }

  update(dt) {
    if (!this.cars.length) return;
    this.t += dt;
    const light = this.light, { physics, player, audio } = this.fx;
    const byLane = LANES.map(() => []);
    for (const c of this.cars) byLane[c.lane].push(c);
    for (const lane of byLane) lane.sort((a, b) => a.x - b.x);          // ahead = smaller x
    for (const lane of byLane) for (let i = 0; i < lane.length; i++) {
      const c = lane[i], ahead = lane[i - 1];
      if (c.crushed) { if (c.alarm > 0) this._alarm(c, dt); continue; }
      const z = LANES[c.lane];
      let want = c.k.speed;
      // The one ahead.
      if (ahead) {
        const gap = c.x - ahead.x - (c.k.len + ahead.k.len) / 2;
        want = Math.min(want, Math.max(0, (gap - GAP) * 1.2));
      }
      // The light, at the stop line.
      const front = c.x - c.k.len / 2;
      if (light !== 'green' && front > STOP && front - STOP < 30) want = Math.min(want, Math.max(0, (front - STOP - 0.5) * 0.9));
      // You, in the road ahead.
      if (player && Math.abs(player.pos.z - z) < 1.6 && player.pos.x < front + 1 && front - player.pos.x < 12 && player.pos.y < 2) {
        want = 0;
        if (c.honk <= 0) { c.honk = 2.5; audio?.horn?.(c.x, 1, z); }
      }
      // Something in the road — rubble, a fallen tower — looked for now and then.
      if ((c.look -= dt) <= 0) {
        c.look = 0.4;
        const hit = physics.raycast(_v.set(front - 0.2, 0.6, z), { x: -1, y: 0, z: 0 }, 9);
        c.blocked = hit && hit.owner?.parts && hit.owner.building !== 'street' ? hit.distance : null;
      }
      if (c.blocked !== null && c.blocked !== undefined) { want = Math.min(want, Math.max(0, (c.blocked - 1.5) * 0.8)); if (c.honk <= 0 && c.v < 1) { c.honk = 3 + Math.random() * 4; audio?.horn?.(c.x, 1, z); } }
      if (c.panic > 0) { c.panic -= dt; want = 0; }
      if (c.alarm > 0) this._alarm(c, dt);
      c.honk -= dt;
      // Accelerate gently, brake hard.
      c.v += Math.max(-9 * dt, Math.min(2.5 * dt, want - c.v));
      c.x -= c.v * dt;
      if (c.x < X1) { c.x = X0 + Math.random() * 20; c.v = c.k.speed * 0.8; c.blocked = null; }
    }
    this._draw();
  }

  _alarm(c, dt) {
    c.alarm -= dt;
    c.alarmT = (c.alarmT ?? 0) - dt;
    if (c.alarmT <= 0) { c.alarmT = 0.5; this.fx.audio?.carAlarm?.(c.x, 1, LANES[c.lane]); }
  }

  _draw() {
    for (const c of this.cars) {
      const squash = c.crushed ? 0.45 : 1;
      _m.compose(_v.set(c.x, 0, LANES[c.lane]), YAW, _s.set(1, squash, 1));
      for (const part of ['body', 'glass', 'wheels']) this.meshes[part].setMatrixAt(c.ids[part], _m);
      if (c.crushed === 1) { c.crushed = 2; this.meshes.body.setColorAt(c.ids.body, _c.set(0x3a3530)); }
    }
    // The lamps of the signals still standing.
    const light = this.light;
    let j = 0;
    for (const s of this.signals ?? []) {
      if (s.state !== 'static') continue;
      const f = s.foot;
      if (!f) continue;
      const at = (y, z) => _v.set(0, y, z).applyAxisAngle(UP, f.yaw).add(_w.set(f.x, 0, f.z));
      // Car heads: three lamps one above another on the head facing the traffic.
      const lamps = [[3.45, 'red', 0xff2020], [3.2, 'amber', 0xffaa10], [2.95, 'green', 0x20ff60]];
      for (const [y, on, col] of lamps) {
        at(y, 0.39);
        _m.compose(_v, _q.identity(), _s.set(1, 1, 1));
        this.lamp.setMatrixAt(j, _m);
        this.lamp.setColorAt(j++, _c.set(light === on ? col : 0x202020));
      }
      // The walking figure for the crossing: white when the cars have red.
      at(2.22, -0.34);
      _m.compose(_v, _q.identity(), _s.set(1.3, 1.3, 1.3));
      this.lamp.setMatrixAt(j, _m);
      this.lamp.setColorAt(j++, _c.set(light === 'red' ? 0xf0f0f0 : 0xff5a10));
    }
    this.lamp.count = j;
    this.lamp.instanceMatrix.needsUpdate = true;
    if (this.lamp.instanceColor) this.lamp.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const c of this.cars) for (const part of ['body', 'glass', 'wheels']) this.meshes[part].deleteInstance(c.ids[part]);
    this.cars.length = 0;
    this.lamp.count = 0;
  }
}
