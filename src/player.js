import * as THREE from 'three';

// First-person movement on flat ground: look, walk, run, jump.

const EYE = 1.7;
const WALK = 5;
const RUN = 9;
const JUMP = 5.5;
const GRAVITY = 20;
const SENSITIVITY = 0.0022;

export class Player {
  constructor(camera, input, world) {
    this.camera = camera;
    this.input = input;
    this.world = world;
    this.pos = new THREE.Vector3(0, 0, 10);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;
    this._move = new THREE.Vector3();
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
  }

  update(dt) {
    const { input } = this;
    if (input.mouse.locked) {
      const { dx, dy } = input.takeMouse();
      this.yaw -= dx * SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * SENSITIVITY, -1.55, 1.55);

      const f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      const r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      const speed = input.down('ShiftLeft') || input.down('ShiftRight') ? RUN : WALK;
      const m = this._move.set(r, 0, -f);
      if (m.lengthSq() > 0) m.normalize().multiplyScalar(speed).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
      this.vel.x = m.x;
      this.vel.z = m.z;

      if (this.grounded && input.down('Space')) {
        this.vel.y = JUMP;
        this.grounded = false;
      }
    } else {
      this.vel.x = this.vel.z = 0;
    }

    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    }

    const { min, max } = this.world.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, min, max);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, min, max);

    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
