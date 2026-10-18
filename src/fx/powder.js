import * as THREE from 'three';

// What an extinguisher leaves: a white bloom of powder on whatever the jet hit
// — the wall behind a fire, the desk, the floor round it — thicker where it
// was held longest. Soft white discs, laid on the surface, growing as more
// lands; never wiped away.

const MAX = 600;
const Z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

function bloom() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // Speckled, as powder lies.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
  return new THREE.CanvasTexture(c);
}

export class Powder {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16), new THREE.MeshStandardMaterial({
      color: 0xf4f2ec, roughness: 1, alphaMap: bloom(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    }), MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.list = [];
  }

  // Powder landing at `point` on a surface facing `normal`.
  add(point, normal, amount, owner) {
    let d = this.list.find((e) => e.owner === owner && e.p.distanceToSquared(point) < e.r * e.r * 0.12);
    if (!d) {
      if (this.list.length >= MAX) this.list.shift();
      d = { p: point.clone().addScaledVector(normal, 0.006), n: normal.clone(), r: 0.06 + Math.random() * 0.05, owner };
      this.list.push(d);
    }
    d.r = Math.min(0.45, d.r + amount * 0.15);
    this._draw();
  }

  update() {
    // Powder on something that has gone goes with it.
    const before = this.list.length;
    this.list = this.list.filter((d) => !d.owner || d.owner.state === 'static' || d.owner.state === 'rubble');
    if (this.list.length !== before) this._draw();
  }

  _draw() {
    let n = 0;
    for (const d of this.list) {
      _q.setFromUnitVectors(Z, d.n);
      _m.compose(d.p, _q, _s.set(d.r, d.r, 1));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.list.length = 0; this.mesh.count = 0; }
}
