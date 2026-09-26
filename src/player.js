import * as THREE from 'three';
import { VOXEL, MIN_X, MIN_Y, MIN_Z } from './voxel/constants.js';
import { AIR } from './voxel/materials.js';

// First-person body: look, walk, run, jump, climb stairs, get hurt.
//
// Collision is an axis-aligned box against the voxel field, resolved one axis
// at a time. Stairs work by stepping up: when a horizontal move is blocked by
// something no taller than STEP, the body is lifted onto it instead.

const EYE = 1.6;
const HEIGHT = 1.75;
const RADIUS = 0.3;
const STEP = 0.3;
const WALK = 5;
const RUN = 8.5;
const JUMP = 6;
const GRAVITY = 20;
const SENSITIVITY = 0.0022;
const SAFE_FALL = 11;          // landing faster than this (m/s) hurts

export const MAX_HEALTH = 100;

export class Player {
  constructor(camera, input, world) {
    this.camera = camera;
    this.input = input;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.health = MAX_HEALTH;
    this.dead = false;
    this.bounds = 120;           // how far from the site you may wander
    this.onDamage = null;        // (amount, cause)
    this.onDeath = null;         // (cause)
    this._move = new THREE.Vector3();
    this._hurtClock = 0;
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this._syncCamera();
  }

  revive() {
    this.health = MAX_HEALTH;
    this.dead = false;
  }

  damage(amount, cause) {
    if (this.dead || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this._hurtClock = 0;
    this.onDamage?.(amount, cause);
    if (this.health === 0) {
      this.dead = true;
      this.onDeath?.(cause);
    }
  }

  // Unit vector the camera looks along.
  forward(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }

  get eye() { return this.camera.position; }

  update(dt) {
    const { input } = this;
    if (input.mouse.locked && !this.dead) {
      const { dx, dy } = input.takeMouse();
      this.yaw -= dx * SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * SENSITIVITY, -1.55, 1.55);

      const f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      const r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      const speed = input.down('ShiftLeft') || input.down('ShiftRight') ? RUN : WALK;
      const m = this._move.set(r, 0, -f);
      if (m.lengthSq() > 0) m.normalize().multiplyScalar(speed).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
      // Full control on the ground, some in the air.
      const k = this.grounded ? 1 : Math.min(1, dt * 3);
      this.vel.x += (m.x - this.vel.x) * k;
      this.vel.z += (m.z - this.vel.z) * k;

      if (this.grounded && input.down('Space')) {
        this.vel.y = JUMP;
        this.grounded = false;
      }
    } else if (this.grounded) {
      this.vel.x = this.vel.z = 0;
    }

    this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -50);

    // Sub-step so a fast fall cannot pass through a one-voxel slab.
    const steps = Math.max(1, Math.ceil((this.vel.length() * dt) / (VOXEL * 0.8)));
    const h = dt / steps;
    const wasGrounded = this.grounded;
    this.grounded = false;
    let impact = 0;
    for (let s = 0; s < steps; s++) {
      this._moveX(this.vel.x * h, wasGrounded);
      this._moveZ(this.vel.z * h, wasGrounded);
      const vy = this.vel.y;
      if (this._moveY(vy * h)) {
        if (vy < 0) { this.grounded = true; impact = Math.max(impact, -vy); }
        this.vel.y = 0;
      }
    }
    if (impact > SAFE_FALL) this.damage((impact - SAFE_FALL) * 9, 'fall');

    // Slow recovery after a few seconds without getting hurt.
    this._hurtClock += dt;
    if (!this.dead && this._hurtClock > 4 && this.health < MAX_HEALTH) {
      this.health = Math.min(MAX_HEALTH, this.health + dt * 6);
    }

    const b = this.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -b, b);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -b, b);
    this._syncCamera();
  }

  _syncCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.updateMatrixWorld();
  }

  // Does the body's box, with its feet at (x, y, z), overlap anything solid?
  collides(x, y, z) {
    if (y < 0) return true;
    const f = this.world.field;
    const i0 = Math.floor((x - RADIUS - MIN_X) / VOXEL), i1 = Math.floor((x + RADIUS - MIN_X) / VOXEL);
    const k0 = Math.floor((z - RADIUS - MIN_Z) / VOXEL), k1 = Math.floor((z + RADIUS - MIN_Z) / VOXEL);
    const j0 = Math.floor((y + 0.001 - MIN_Y) / VOXEL), j1 = Math.floor((y + HEIGHT - MIN_Y) / VOXEL);
    for (let j = j0; j <= j1; j++)
      for (let k = k0; k <= k1; k++)
        for (let i = i0; i <= i1; i++)
          if (f.get(i, j, k) !== AIR) return true;
    return false;
  }

  _moveX(d, canStep) {
    if (d === 0) return;
    const p = this.pos;
    if (!this.collides(p.x + d, p.y, p.z)) { p.x += d; return; }
    if (canStep && this._stepUp(p.x + d, p.z)) { p.x += d; return; }
    this.vel.x = 0;
  }

  _moveZ(d, canStep) {
    if (d === 0) return;
    const p = this.pos;
    if (!this.collides(p.x, p.y, p.z + d)) { p.z += d; return; }
    if (canStep && this._stepUp(p.x, p.z + d)) { p.z += d; return; }
    this.vel.z = 0;
  }

  // Try standing on whatever blocked us, if it is low enough.
  _stepUp(x, z) {
    const p = this.pos;
    for (let lift = VOXEL; lift <= STEP + 1e-6; lift += VOXEL) {
      // Snap to the top of the voxel layer we would stand on.
      const y = (Math.floor((p.y + lift - MIN_Y) / VOXEL)) * VOXEL + MIN_Y;
      if (y <= p.y) continue;
      if (!this.collides(x, y, z) && !this.collides(p.x, y, p.z)) {
        p.y = y;
        return true;
      }
    }
    return false;
  }

  // Returns true if the move was stopped.
  _moveY(d) {
    const p = this.pos;
    if (d === 0) return false;
    if (!this.collides(p.x, p.y + d, p.z)) { p.y += d; return false; }
    if (d < 0) {
      // Land exactly on top of the layer below.
      const top = Math.floor((p.y + d - MIN_Y) / VOXEL + 1) * VOXEL + MIN_Y;
      if (top <= p.y + 1e-6 && !this.collides(p.x, top, p.z)) p.y = top;
      if (p.y < 0) p.y = 0;
    }
    return true;
  }
}
