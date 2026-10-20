import * as THREE from 'three';
import { sledgeModel, sprayModel, extinguisherModel, chargeModel, detonatorModel, jackhammerModel } from './viewmodels.js';
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
  let hit = ctx.physics.raycast(_org, _dir, range);
  // A city block, still a box: the blow wakes it into a building, and lands
  // on that.
  if (hit?.owner?.role === 'city' && hit.owner.mesh && ctx.world) {
    ctx.world.wakeBlock(hit.owner);
    hit = ctx.physics.raycast(_org, _dir, range);
  }
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
    this.feel = null;        // what the blow met: 'hard' stops it dead, 'ring' throws it back, 'soft' it goes through
  }

  // A swing is heavy: you heave it up and back over your shoulder, your view
  // tipping up with it, then bring it down. On concrete or stone it stops dead
  // and the jolt goes through you; on steel it rings and jumps back; through
  // wood, plaster or glass it carries on; into air it overshoots and drags you
  // round. You walk slowly while you swing, and it takes a moment to get it
  // back up.
  update(dt, ctx) {
    const m = this.model;
    const { player } = ctx;
    const down = ctx.input.mouse.left && ctx.input.mouse.locked;
    if (this.t < 0 && down) { this.t = 0; this.landed = false; this.feel = null; }
    // Rest pose: over the right shoulder, head up.
    let rx = -0.35, rz = 0.3, px = 0.42, py = -0.5, pz = -0.75;
    if (this.t >= 0) {
      this.t += dt;
      const t = this.t;
      player.burden = 0.55;
      if (t < 0.42) {                 // the heave: head right back over the shoulder
        const k = ease(t / 0.42);
        rx += 2.0 * k; py += 0.24 * k; pz += 0.2 * k; rz += 0.35 * k; px += 0.06 * k;
        player.sway = 0.07 * k;
        if (t + dt >= 0.3 && t < 0.3) ctx.audio?.swing();
      } else if (t < 0.56) {          // the blow
        const k = ease((t - 0.42) / 0.14);
        rx += 2.0 - 3.55 * k; py += 0.24 - 0.24 * k; pz += 0.2 - 0.42 * k; rz += 0.35 - 0.57 * k; px += 0.06 - 0.22 * k;
        player.sway = 0.07 - 0.15 * k;
        if (!this.landed && t > 0.52) { this.landed = true; this._strike(ctx); }
      } else if (t < 1.25) {          // what it met, then getting it back up
        const u = (t - 0.56) / 0.69;
        let hold = 0, over = 0, jump = 0;
        if (this.feel === 'hard') hold = Math.max(0, 1 - u * 4);                    // stopped dead, a moment
        else if (this.feel === 'ring') jump = Math.sin(Math.min(1, u * 3) * Math.PI) * 0.6;   // thrown back up
        else over = Math.sin(Math.min(1, u * 2.2) * Math.PI) * (this.feel === 'soft' ? 0.35 : 0.6); // through, or into air
        const k = ease(Math.max(0, (u - 0.15) / 0.85));
        player.sway = -0.08 * (1 - k) - over * 0.06 * (1 - k);
        rx += (-1.55 - over + jump) * (1 - k); pz += -0.22 * (1 - k); rz += -0.22 * (1 - k); px += -0.16 * (1 - k);
        if (hold > 0) rx += 0.02 * Math.sin(t * 90) * hold;       // the shudder up the handle
      } else { this.t = -1; player.burden = 0; player.sway = 0; }
    } else {
      // A little sway while you walk, heavier the faster.
      const b = player.bob;
      px += Math.sin(b * Math.PI) * 0.014; py += Math.abs(Math.cos(b * Math.PI)) * 0.018;
      rz += Math.sin(b * Math.PI) * 0.03;
    }
    m.position.set(px, py, pz);
    m.rotation.set(rx, 0, rz);
  }

  // Put down mid-swing: nothing weighs on you any more.
  unequip(ctx) { this.t = -1; ctx.player.burden = 0; ctx.player.sway = 0; }

  _strike(ctx) {
    const { hit, dir, origin } = aim(ctx, 2.4);
    const { player } = ctx;
    // A guard or an officer in the way takes it: down, dazed, up again.
    if (ctx.security?.strike(origin, dir, hit ? Math.min(2.4, hit.distance) : 2.4)) { this.feel = 'soft'; ctx.shake?.add(0.1); player.punch?.(-0.03, 0); return; }
    if (!hit || !hit.owner || !hit.owner.parts) {
      if (hit) { ctx.audio?.hit('concrete', hit.point.x, hit.point.y, hit.point.z, 0.6); this.feel = 'hard'; player.punch?.(0.06, 0.02); ctx.shake?.add(0.18); }
      else { this.feel = null; player.punch?.(-0.06, 0.03); }       // nothing there: it drags you round
      return;
    }
    // What it is made of, before the blow changes it.
    const p = hit.owner;
    const sound = p.parts[ctx.damage.partAt(p, ctx.damage.toLocal(p, hit.point))]?.kind?.sound;
    this.feel = sound === 'concrete' || sound === 'marble' ? 'hard' : sound === 'steel' || sound === 'brass' || sound === 'mullion' ? 'ring' : 'soft';
    const kind = ctx.damage.hit(p, hit.point, hit.normal, dir, ctx.upgrades?.heavySledge ? 1.4 : 1);
    this.lastHit = kind?.name ?? null;
    ctx.security?.noise(hit.point, 1, true);
    ctx.wanted?.struck(p, hit.point);
    // The jolt: a hard stop goes up your arms into your head.
    if (this.feel === 'hard') { ctx.shake?.add(0.22); player.punch?.(0.08, (Math.random() - 0.5) * 0.04); player.slow?.(0.35); }
    else if (this.feel === 'ring') { ctx.shake?.add(0.28); player.punch?.(0.1, (Math.random() - 0.5) * 0.06); player.slow?.(0.25); }
    else { ctx.shake?.add(0.08); player.punch?.(-0.02, 0); }
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

  // The colours it has: the usual, and more if you bought them (main.js).
  get palette() { return this.colours ?? COLOURS; }
  get colourName() { return this.palette[this.colour].name; }

  update(dt, ctx) {
    const { input } = ctx;
    if (input.pressed('Mouse2')) {
      this.colour = (this.colour + 1) % this.palette.length;
      this.model.userData.band.material.color.set(this.palette[this.colour].hex);
      ctx.audio?.click();
    }
    const on = input.mouse.left && input.mouse.locked;
    if (on !== this.spraying) { this.spraying = on; ctx.audio?.spray(on); }
    this.model.position.set(0.26, -0.26 + (on ? 0.02 : 0), -0.45);
    this.model.rotation.set(on ? 0.1 : 0.25, 0, 0.1);
    if (!on) return;
    const hex = this.palette[this.colour].hex;
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
    ctx.wanted?.tagged(hit.owner, hit.point, 0.045);
    ctx.bankSecurity?.sprayed(hit.owner);
  }

  unequip(ctx) { if (this.spraying) { this.spraying = false; ctx.audio?.spray(false); } }
}

// ---------------------------------------------------------------- extinguisher

// A powder extinguisher of the size that hangs on an office wall: about
// fourteen seconds of discharge. The jet is strongest when it is full, and
// weakens as the pressure goes — shorter, softer — until it coughs and stops.
// Where the jet lands it puts out what is burning and leaves powder behind; it
// goes no further than the first thing in its way. Spares hang by the lifts on
// some floors, and more are about the building for those who look (E takes one).
const DISCHARGE = 14;          // s from full to empty
const JET = 7.5;               // m reach, full
const RAYS = 3;                // a frame: where the jet lands, looked for along it

export class Extinguisher {
  constructor() {
    this.id = 'extinguisher';
    this.name = 'Fire extinguisher';
    this.model = extinguisherModel();
    this.on = false;
    this.charge = 1;
  }

  get gauge() { return this.charge; }

  refill() { this.charge = 1; }

  update(dt, ctx) {
    const pressed = ctx.input.mouse.left && ctx.input.mouse.locked;
    const on = pressed && this.charge > 0;
    if (on !== this.on) { this.on = on; ctx.audio?.foam(on); }
    if (pressed && this.charge <= 0 && ctx.input.pressed('Mouse0')) ctx.audio?.click();
    const pressure = Math.sqrt(Math.max(0, this.charge));
    const kick = on ? Math.sin(performance.now() * 0.05) * 0.004 * pressure : 0;
    this.model.position.set(0.36, -0.5 + kick, -0.8);
    this.model.rotation.set(0.05, -0.4, 0.05);
    if (!on) return;
    this.charge = Math.max(0, this.charge - dt / (this.discharge ?? DISCHARGE));
    // Nearly empty, it coughs: the jet comes and goes.
    if (this.charge < 0.08 && Math.random() < 0.5) return;
    ctx.camera.getWorldDirection(_dir);
    const nozzle = ctx.camera.position.clone().addScaledVector(_dir, 0.6).add(new THREE.Vector3(0.18, -0.2, 0).applyQuaternion(ctx.camera.quaternion));
    const reach = 2 + (JET - 2) * pressure, speed = 4 + 7 * pressure;
    // Where does it land? Down the middle, and a few rays about it.
    const hit0 = ctx.physics.raycast(ctx.camera.position, _dir, reach);
    const stop = hit0 ? hit0.distance ?? hit0.point.distanceTo(ctx.camera.position) : reach;
    for (let i = 0; i < Math.round(1 + 6 * pressure); i++) {
      const s = speed * (0.8 + Math.random() * 0.4);
      ctx.particles.spawn('foam', nozzle.x, nozzle.y, nozzle.z,
        _dir.x * s + (Math.random() - 0.5) * 2, _dir.y * s + (Math.random() - 0.5) * 2, _dir.z * s + (Math.random() - 0.5) * 2);
    }
    for (let i = 0; i < RAYS; i++) {
      const d = _jet.copy(_dir).add(_jit.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.28 * i)).normalize();
      const hit = i === 0 ? hit0 : ctx.physics.raycast(ctx.camera.position, d, reach);
      if (!hit) continue;
      // It puts out what is burning where it lands, and a little round it.
      ctx.fire.douse(hit.point, 0.7 + 0.5 * pressure, dt * 3.2 * pressure);
      if (hit.owner?.parts && hit.normal) ctx.powder?.add(hit.point, hit.normal, dt * pressure, hit.owner);
      if (Math.random() < 0.3) ctx.particles.spawn('puff', hit.point.x, hit.point.y, hit.point.z, hit.normal?.x ?? 0, (hit.normal?.y ?? 0) + 0.3, hit.normal?.z ?? 0, 0xeeeeea);
    }
    // In a guard's face: blinded, they stumble and sit down.
    if (Math.random() < 0.2) ctx.security?.strike(ctx.camera.position, _dir, Math.min(4, stop), 'spray');
    // And it blows the dust away, as far as it reaches: a way to see through a collapse cloud.
    ctx.particles.blow(ctx.camera.position, _dir, Math.min(11, stop + 2), 0.32, dt);
  }

  unequip(ctx) { if (this.on) { this.on = false; ctx.audio?.foam(false); } }
}

const _jet = new THREE.Vector3(), _jit = new THREE.Vector3();

// ---------------------------------------------------------------- charges

// A dozen: enough to take out every support on one side of a storey and the
// core wall beside them, which is what it takes to fell a tower that way.
const CHARGES = 12;

export class Charges {
  constructor() {
    this.id = 'bomb';
    this.name = 'Remote charges';
    this.model = detonatorModel();
    this.left = CHARGES;
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
        ctx.wanted?.placed(hit.point);
      }
    }
    if (input.pressed('Mouse2') && this.placed.length && !this._chain.length) {
      ctx.audio?.click();
      ctx.achieve?.event('detonate');
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
        ctx.blast.explode(c.at, 2.8 * (ctx.upgrades?.bigCharges ? 1.25 : 1), ctx.upgrades?.bigCharges ? 1.3 : 1);
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
      ctx.blast.explode(c.at, 2.8 * (ctx.upgrades?.bigCharges ? 1.25 : 1), ctx.upgrades?.bigCharges ? 1.3 : 1);
      this._t = 0.12;
    }
  }

  clear() {
    for (const c of this.placed) c.mesh.removeFromParent();
    this.placed.length = 0;
    this._chain.length = 0;
    this.left = CHARGES;
  }
}

// ---------------------------------------------------------------- jackhammer

// Hold it down on what is in front of you, low: it hammers away, shaking you
// and the view, throwing grit and dust; every third of a second the bit bites
// — concrete and stone it breaks far faster than a sledge, anything else it
// only chips. You walk at a crawl while it runs, and it is loud.
const BITE = 0.32;                   // s between bites
export class Jackhammer {
  constructor() {
    this.id = 'jackhammer';
    this.name = 'Jackhammer';
    this.model = jackhammerModel();
    this._t = 0;
    this.running = false;
  }

  update(dt, ctx) {
    const { input, player, particles } = ctx;
    const on = input.mouse.left && input.mouse.locked;
    const m = this.model;
    m.position.set(0.05, -0.62 + (on ? 0.0 : 0.04), -0.9);
    m.rotation.set(on ? 0.65 : 0.45, 0, 0);
    if (on !== this.running) { this.running = on; player.burden = on ? 0.8 : 0; }
    if (!on) return;
    // The shudder.
    m.position.x += (Math.random() - 0.5) * 0.02; m.position.y += (Math.random() - 0.5) * 0.02;
    ctx.shake?.add(dt * 0.6);
    const { hit, dir } = aim(ctx, 2.0);
    if (hit && Math.random() < dt * 30) {
      particles.spawn('dust', hit.point.x, hit.point.y, hit.point.z, (Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5, 0xb8b2a8);
      if (Math.random() < 0.5) particles.spawn('spark', hit.point.x, hit.point.y, hit.point.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0xffd8a0);
    }
    if ((this._t -= dt) > 0) return;
    this._t = BITE;
    ctx.audio?.hit(hit?.owner?.parts ? hit.owner.parts[0].kind.sound : 'concrete', ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z, 0.7);
    if (!hit || !hit.owner || !hit.owner.parts) return;
    const p = hit.owner;
    const sound = p.parts[ctx.damage.partAt(p, ctx.damage.toLocal(p, hit.point))]?.kind?.sound;
    const hard = sound === 'concrete' || sound === 'marble';
    ctx.damage.hit(p, hit.point, hit.normal, dir, hard ? 1.2 : 0.3);
    ctx.security?.noise(hit.point, 1.5, true);
    ctx.wanted?.struck(p, hit.point);
  }

  unequip(ctx) { this.running = false; ctx.player.burden = 0; }
}

export const TOOL_CLASSES = { sledge: Sledge, spray: SprayCan, extinguisher: Extinguisher, bomb: Charges, jackhammer: Jackhammer };
