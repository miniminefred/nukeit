import * as THREE from 'three';
import { VOXEL, vx, vy, vz } from '../voxel/constants.js';
import { AIR, M, PALETTE } from '../voxel/materials.js';

// Chunks of building in the air: instanced cubes that fall, bounce and roll.
//
// When a piece comes to rest it can become matter again — a rubble voxel where
// it lies — which is how a heap builds up at the foot of a wall you are taking
// apart. Chips knocked off by a blow just fade; there are far too many of them
// to be worth keeping.

const MAX = 4000;
const GRAVITY = 20;

export class Debris {
  constructor(scene, world) {
    this.world = world;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // colourId is a palette row (material | paint << 5).
  spawn(x, y, z, vx0, vy0, vz0, colourId, size = VOXEL, stamp = false) {
    if (this.items.length >= MAX) this.items.shift();
    this.items.push({
      x, y, z, vx: vx0, vy: vy0, vz: vz0,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: 0,
      sx: (Math.random() - 0.5) * 12, sy: (Math.random() - 0.5) * 12,
      size, colourId, stamp, rest: 0, age: 0,
      life: stamp ? 30 : 2 + Math.random() * 2,
    });
  }

  update(dt) {
    const w = this.world;
    const out = [];
    for (const d of this.items) {
      d.age += dt;
      if (d.rest > 0.4 || d.age > d.life) {
        if (d.stamp) this._settle(d);
        continue;
      }
      d.vy -= GRAVITY * dt;
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt, nz = d.z + d.vz * dt;
      const h = d.size / 2;
      if (w.solidAt(nx, ny - h, nz)) {
        // Hit something below: bounce a little, lose most of the sideways speed.
        d.vy = Math.abs(d.vy) > 2 ? -d.vy * 0.25 : 0;
        d.vx *= 0.6; d.vz *= 0.6;
        d.sx *= 0.5; d.sy *= 0.5;
        if (Math.abs(d.vy) < 0.5 && Math.hypot(d.vx, d.vz) < 0.6) d.rest += dt;
      } else {
        d.y = ny;
        d.rest = 0;
      }
      if (w.solidAt(nx, d.y, d.z)) d.vx *= -0.3; else d.x = nx;
      if (w.solidAt(d.x, d.y, nz)) d.vz *= -0.3; else d.z = nz;
      d.rx += d.sx * dt; d.ry += d.sy * dt;
      out.push(d);
    }
    this.items = out;

    const mesh = this.mesh;
    for (let n = 0; n < out.length; n++) {
      const d = out[n];
      const fade = d.stamp ? 1 : Math.min(1, (d.life - d.age) * 2);
      this._q.setFromEuler(this._e.set(d.rx, d.ry, d.rz));
      this._s.setScalar(d.size * fade);
      this._m.compose(this._p.set(d.x, d.y, d.z), this._q, this._s);
      mesh.setMatrixAt(n, this._m);
      const c = d.colourId * 3;
      mesh.setColorAt(n, this._c.setRGB(PALETTE[c], PALETTE[c + 1], PALETTE[c + 2]));
    }
    mesh.count = out.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // Become a rubble voxel where it came to rest, if there is room.
  _settle(d) {
    const f = this.world.field;
    const i = vx(d.x), k = vz(d.z);
    let j = vy(d.y);
    if (f.get(i, j, k) !== AIR) j++;
    if (!f.inside(i, j, k) || f.get(i, j, k) !== AIR) return;
    f.set(i, j, k, M.RUBBLE);
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}
