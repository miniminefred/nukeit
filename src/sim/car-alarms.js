import * as THREE from 'three';

// The cars parked in the garage under the building (building/furniture-service.js)
// have alarms. Knock one — a sledge, a blast, rubble landing on it, anything
// that moves it from where it was parked — and it whoops and flashes its
// indicators for forty seconds: the people near it stop and stare, and the
// guards in earshot come down to see what set it off.

const RING = 40;                                      // s an alarm goes on for
const LAMPS = [[-0.62, 2.19], [0.62, 2.19], [-0.62, -2.19], [0.62, -2.19]];
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);

export class CarAlarms {
  constructor(fx) {
    this.fx = fx;                                     // { pieces, audio, people, security, scene }
    this.cars = [];
    this.lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffa020 }), 64);
    this.lamps.count = 0;
    this.lamps.frustumCulled = false;
    fx.scene.add(this.lamps);
  }

  attach() {
    this.cars = this.fx.pieces.list.filter((p) => p.tag === 'car').map((p) => ({ p, t: 0, whoop: 0, at: p.pos.clone() }));
  }

  // Set one off.
  trip(car) {
    const fresh = car.t <= 0;
    car.t = RING;
    if (!fresh) return;
    car.whoop = 0;
    const at = car.p.box.getCenter(new THREE.Vector3());
    this.fx.people.witness(at);
    this.fx.security.noise(at, 4, false);
  }

  update(dt) {
    let n = 0;
    for (const car of this.cars) {
      const p = car.p;
      if (p.state === 'dead') { car.t = 0; continue; }
      // Moved from where it was parked: knocked, blown, landed on.
      if (car.t <= 0 && (p.state !== 'static' || p.pos.distanceToSquared(car.at) > 0.0025)) this.trip(car);
      if (car.t <= 0) continue;
      car.t -= dt;
      if ((car.whoop -= dt) <= 0) {
        car.whoop = 0.5;
        const c = p.box.getCenter(_v);
        this.fx.audio.carAlarm?.(c.x, c.y, c.z);
      }
      if (Math.floor(car.t * 2.5) % 2 && n < 60) for (const [x, z] of LAMPS) {
        _m.compose(_v.set(x, -0.05, z).applyQuaternion(p.quat).add(p.pos), _q.copy(p.quat), _s);
        this.lamps.setMatrixAt(n++, _m);
      }
    }
    this.lamps.count = n;
    this.lamps.instanceMatrix.needsUpdate = true;
  }

  clear() { this.cars = []; this.lamps.count = 0; }
}
