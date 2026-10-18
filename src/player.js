import * as THREE from 'three';
import { G_PLAYER } from './physics.js';

// First person: look, walk, run, jump, climb stairs, get hurt.
//
// The body is a capsule moved by Rapier's kinematic character controller,
// which does the hard parts — sliding along walls, stepping up stairs, staying
// on the ground going down them, and shoving loose furniture out of the way.

const EYE = 1.62;
const HALF = 0.55, RADIUS = 0.3;           // capsule: 1.7 m tall
const WALK = 4.2, RUN = 7.5, CROUCH = 2;
const JUMP = 5.2;
const GRAVITY = 18;
const SENSITIVITY = 0.0021;
const SAFE_FALL = 9;
export const MAX_HEALTH = 100;

export class Player {
  constructor(camera, input, physics) {
    this.camera = camera;
    this.input = input;
    this.physics = physics;
    const R = physics.R;
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, 20));
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(HALF, RADIUS).setTranslation(0, HALF + RADIUS, 0).setCollisionGroups(G_PLAYER),
      this.body,
    );
    physics.owner.set(this.collider.handle, this);
    const cc = physics.world.createCharacterController(0.02);
    cc.enableAutostep(0.32, 0.18, false);
    cc.enableSnapToGround(0.35);
    cc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50));
    cc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(60));
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setCharacterMass(80);
    this.cc = cc;

    this.pos = new THREE.Vector3(0, 0, 20);
    this.vel = new THREE.Vector3();
    this.crouch = 0;            // 0 standing .. 1 crouched: the eye comes down with it
    this.wet = 0;               // 0 dry .. 1 standing in water (sim/water.js sets it)
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.health = MAX_HEALTH;
    this.dead = false;
    this.onDamage = null;
    this.onDeath = null;
    this.bob = 0;
    this._hurt = 0;
    this._move = new THREE.Vector3();
  }

  isPlayer() { return true; }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.yaw = yaw;
    this.pitch = 0;
    this._syncCamera(0);
  }

  revive() { this.health = MAX_HEALTH; this.dead = false; this._stun = 0; this._tangle = 0; }

  // Knocked flat a moment — a taser, a tackle: no control, the view drops.
  stun(t) { this._stun = Math.max(this._stun ?? 0, t); }
  get stunned() { return (this._stun ?? 0) > 0; }
  // Tangled in a net: you can barely move.
  tangle(t) { this._tangle = Math.max(this._tangle ?? 0, t); }

  damage(amount, cause) {
    if (this.dead || amount <= 0.5 || this.immortal) return;
    this.health = Math.max(0, this.health - amount);
    this._hurt = 0;
    this.onDamage?.(amount, cause);
    if (this.health === 0) { this.dead = true; this.onDeath?.(cause); }
  }

  update(dt) {
    const { input } = this;
    if (this._stun > 0) this._stun -= dt;
    if (this._tangle > 0) this._tangle -= dt;
    if (input.mouse.locked && !this.dead && this.stunned) { input.takeMouse(); this.vel.x *= 0.8; this.vel.z *= 0.8; }
    else if (input.mouse.locked && !this.dead) {
      const { dx, dy } = input.takeMouse();
      this.yaw -= dx * SENSITIVITY;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * SENSITIVITY, -1.55, 1.55);
      const f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
      const r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
      const crouching = input.down('ControlLeft') || input.down('KeyC');
      this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
      const speed = crouching ? CROUCH
        : input.down('ShiftLeft') || input.down('ShiftRight') ? RUN : WALK;
      const m = this._move.set(r, 0, -f);
      if (m.lengthSq() > 0) m.normalize().multiplyScalar(this._tangle > 0 ? speed * 0.25 : speed).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
      // On a wet floor your feet hardly grip: you slide on into a turn, and
      // take a while to stop.
      const k = this.grounded ? Math.min(1, dt * 14 * (1 - 0.88 * this.wet)) : Math.min(1, dt * 2);
      this.vel.x += (m.x - this.vel.x) * k;
      this.vel.z += (m.z - this.vel.z) * k;
      if (this.grounded && input.pressed('Space')) { this.vel.y = JUMP; this.grounded = false; }
    } else {
      this.vel.x *= 0.8; this.vel.z *= 0.8;
    }
    this.vel.y = Math.max(-45, this.vel.y - GRAVITY * dt);

    const want = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    // The controller measures from where the collider is, and a kinematic body's
    // collider only moves when physics steps — which is not every frame. Put it
    // where we are first, or a frame with no step applies the same move twice
    // and the body sinks through the floor.
    this.collider.setTranslation({ x: this.pos.x, y: this.pos.y + HALF + RADIUS, z: this.pos.z });
    this.cc.computeColliderMovement(this.collider, want, undefined, G_PLAYER);
    const got = this.cc.computedMovement();
    const wasFalling = this.vel.y;
    this.grounded = this.cc.computedGrounded();
    // Blocked going up: bumped a ceiling.
    if (want.y > 0 && got.y < want.y * 0.5) this.vel.y = 0;
    if (this.grounded && this.vel.y < 0) {
      if (-wasFalling > SAFE_FALL) this.damage((-wasFalling - SAFE_FALL) * 11, 'fall');
      this.vel.y = 0;
    }
    this.pos.x += got.x; this.pos.y += got.y; this.pos.z += got.z;
    if (this.pos.y < -5) { this.pos.set(0, 1, 20); this.vel.set(0, 0, 0); }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });

    this._hurt += dt;
    if (!this.dead && this._hurt > 5 && this.health < MAX_HEALTH) this.health = Math.min(MAX_HEALTH, this.health + dt * 5);

    const moving = this.grounded ? Math.hypot(this.vel.x, this.vel.z) : 0;
    this.bob += moving * dt * 1.9;
    this._syncCamera(moving);
  }

  _syncCamera(moving) {
    const b = Math.sin(this.bob * Math.PI) * Math.min(1, moving / 5) * 0.035;
    // Stunned: down on the floor, the view tipped over.
    const down = Math.min(1, (this._stun ?? 0) * 2);
    this.camera.position.set(this.pos.x, this.pos.y + EYE - 0.62 * this.crouch - 1.1 * down + b, this.pos.z);
    this.camera.rotation.set(this.pitch * (1 - down), this.yaw, down * 0.9);
    this.camera.updateMatrixWorld();
  }

  // Unit vector the camera looks along.
  forward(out = new THREE.Vector3()) { return this.camera.getWorldDirection(out); }
  get eye() { return this.camera.position; }
}
