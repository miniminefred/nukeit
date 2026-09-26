import * as THREE from 'three';
import { sledgeModel, sprayModel, extinguisherModel, chargeModel, detonatorModel } from './viewmodels.js';
import { spray, COLOURS } from '../damage/paint.js';

// The things you can carry onto a job.
//
// A tool has a model in the viewmodel scene, and `update(dt, ctx)` which reads
// the mouse and acts on the world. `ctx` is everything a tool might touch:
// { input, camera, physics, pieces, damage, particles, chips, fire, blast,
//   audio, shake, player, scene }.
//
// Held-down tools act continuously (spray, foam, swinging over and over); the
// sledge's blow lands at one moment in its swing rather than on the click.

const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);

function aim(ctx, range) {
  ctx.camera.getWorldDirection(_dir);
  _org.copy(ctx.camera.position);
  const hit = ctx.physics.raycast(_org, _dir, range);
  return { hit, dir: _dir.clone(), origin: _org.clone() };
}

// ---------------------------------------------------------------- sledge

export class Sledge {
  constructor() {
    this.id = 'sledge';
    this.name = 'Sledgehammer';
    this.model = sledgeModel();
    this.t = -1;             // time into the current swing, or -1
    this.landed = false;
    this.lastHit = null;
  }

  update(dt, ctx) {
    const m = this.model;
    const down = ctx.input.mouse.left && ctx.input.mouse.locked;
    if (this.t < 0 && down) { this.t = 0; this.landed = false; ctx.audio?.swing(); }
    // Rest pose: over the right shoulder, head up.
    let rx = -0.35, rz = 0.3, px = 0.34, py = -0.42, pz = -0.62;
    if (this.t >= 0) {
      this.t += dt;
      const t = this.t;
      if (t < 0.24) {                 // wind up: head goes back over the shoulder
        const k = ease(t / 0.24);
        rx += 1.0 * k; py += 0.12 * k; pz += 0.08 * k; rz += 0.15 * k;
      } else if (t < 0.36) {          // the blow
        const k = ease((t - 0.24) / 0.12);
        rx += 1.0 - 2.5 * k; py += 0.12 - 0.12 * k; pz += 0.08 - 0.28 * k; rz += 0.15 - 0.35 * k; px -= 0.14 * k;
        if (!this.landed && t > 0.32) { this.landed = true; this._strike(ctx); }
      } else if (t < 0.85) {          // recover
        const k = ease((t - 0.36) / 0.49);
        rx += -1.5 * (1 - k); pz += -0.2 * (1 - k); rz += -0.2 * (1 - k); px -= 0.14 * (1 - k);
      } else this.t = -1;
    } else {
      // A little sway while you walk.
      const b = ctx.player.bob;
      px += Math.sin(b * Math.PI) * 0.01; py += Math.abs(Math.cos(b * Math.PI)) * 0.012;
    }
    m.position.set(px, py, pz);
    m.rotation.set(rx, 0, rz);
  }

  _strike(ctx) {
    const { hit, dir } = aim(ctx, 2.4);
    if (!hit || !hit.owner || !hit.owner.parts) {
      if (hit) ctx.audio?.hit('concrete', hit.point.x, hit.point.y, hit.point.z, 0.6);
      return;
    }
    const kind = ctx.damage.hit(hit.owner, hit.point, hit.normal, dir, 1);
    this.lastHit = kind?.name ?? null;
    ctx.shake?.add(0.12);
  }
}

// ---------------------------------------------------------------- spray can

export class SprayCan {
  constructor() {
    this.id = 'spray';
    this.name = 'Spray can';
    this.model = sprayModel();
    this.colour = 0;
    this._acc = 0;
    this.spraying = false;
  }

  get colourName() { return COLOURS[this.colour].name; }

  update(dt, ctx) {
    const { input } = ctx;
    if (input.pressed('Mouse2')) {
      this.colour = (this.colour + 1) % COLOURS.length;
      this.model.userData.band.material.color.set(COLOURS[this.colour].hex);
      ctx.audio?.click();
    }
    const on = input.mouse.left && input.mouse.locked;
    if (on !== this.spraying) { this.spraying = on; ctx.audio?.spray(on); }
    this.model.position.set(0.26, -0.26 + (on ? 0.02 : 0), -0.45);
    this.model.rotation.set(on ? 0.1 : 0.25, 0, 0.1);
    if (!on) return;
    const hex = COLOURS[this.colour].hex;
    const { hit, dir, origin } = aim(ctx, 3.2);
    // Mist from the nozzle.
    const nozzle = origin.clone().addScaledVector(dir, 0.5).add(new THREE.Vector3(0.12, -0.12, 0).applyQuaternion(ctx.camera.quaternion));
    for (let i = 0; i < 3; i++) {
      ctx.particles.spawn('paint', nozzle.x, nozzle.y, nozzle.z,
        dir.x * 5 + (Math.random() - 0.5), dir.y * 5 + (Math.random() - 0.5), dir.z * 5 + (Math.random() - 0.5), hex);
    }
    this._acc += dt;
    if (!hit || !hit.owner || !hit.owner.parts || this._acc < 0.045) return;
    this._acc = 0;
    // Nearer is a tighter, heavier spot.
    const size = 0.1 + hit.distance * 0.09;
    spray(ctx.pieces, hit.owner, hit.point, hit.normal, hex, size);
  }

  unequip(ctx) { if (this.spraying) { this.spraying = false; ctx.audio?.spray(false); } }
}

// ---------------------------------------------------------------- extinguisher

export class Extinguisher {
  constructor() {
    this.id = 'extinguisher';
    this.name = 'Fire extinguisher';
    this.model = extinguisherModel();
    this.on = false;
  }

  update(dt, ctx) {
    const on = ctx.input.mouse.left && ctx.input.mouse.locked;
    if (on !== this.on) { this.on = on; ctx.audio?.foam(on); }
    const kick = on ? Math.sin(performance.now() * 0.05) * 0.004 : 0;
    this.model.position.set(0.3, -0.42 + kick, -0.55);
    this.model.rotation.set(0.05, -0.4, 0.05);
    if (!on) return;
    ctx.camera.getWorldDirection(_dir);
    const nozzle = ctx.camera.position.clone().addScaledVector(_dir, 0.6).add(new THREE.Vector3(0.18, -0.2, 0).applyQuaternion(ctx.camera.quaternion));
    for (let i = 0; i < 6; i++) {
      const s = 7 + Math.random() * 4;
      ctx.particles.spawn('foam', nozzle.x, nozzle.y, nozzle.z,
        _dir.x * s + (Math.random() - 0.5) * 2, _dir.y * s + (Math.random() - 0.5) * 2, _dir.z * s + (Math.random() - 0.5) * 2);
    }
    ctx.fire.extinguish(ctx.camera.position, _dir, 7.5, 0.86, dt);
  }

  unequip(ctx) { if (this.on) { this.on = false; ctx.audio?.foam(false); } }
}

// ---------------------------------------------------------------- charges

export class Charges {
  constructor() {
    this.id = 'bomb';
    this.name = 'Remote charges';
    this.model = detonatorModel();
    this.left = 8;
    this.placed = [];
    this._chain = [];
    this._t = 0;
  }

  update(dt, ctx) {
    const { input } = ctx;
    this.model.position.set(0.24, -0.28, -0.45);
    this.model.rotation.set(0.3, -0.3, 0);
    if (input.pressed('Mouse0') && this.left > 0) {
      const { hit } = aim(ctx, 3.5);
      if (hit && hit.owner && hit.owner.parts) {
        const c = chargeModel();
        c.position.copy(hit.point).addScaledVector(hit.normal, 0.025);
        c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal);
        ctx.scene.add(c);
        this.placed.push({ mesh: c, at: hit.point.clone() });
        this.left--;
        ctx.audio?.click();
      }
    }
    if (input.pressed('Mouse2') && this.placed.length && !this._chain.length) {
      ctx.audio?.click();
      this._chain = this.placed.splice(0);
      this._t = 0.25;
    }
    // Blink.
    const on = (performance.now() % 800) < 120;
    for (const c of this.placed) c.mesh.userData.led.visible = on;
    if (this._chain.length) {
      this._t -= dt;
      if (this._t <= 0) {
        const c = this._chain.shift();
        c.mesh.removeFromParent();
        ctx.blast.explode(c.at, 2.8);
        this._t = 0.12;
      }
    }
  }

  // Charges stay armed after you put the detonator away, so this keeps
  // running the chain even when not held.
  background(dt, ctx) {
    if (!this._chain.length) return;
    this._t -= dt;
    if (this._t <= 0) {
      const c = this._chain.shift();
      c.mesh.removeFromParent();
      ctx.blast.explode(c.at, 2.8);
      this._t = 0.12;
    }
  }

  clear() {
    for (const c of this.placed) c.mesh.removeFromParent();
    this.placed.length = 0;
    this._chain.length = 0;
    this.left = 8;
  }
}

export const TOOL_CLASSES = { sledge: Sledge, spray: SprayCan, extinguisher: Extinguisher, bomb: Charges };
