import * as THREE from 'three';
import { block } from '../building/kit.js';
import { T, LOWER } from '../building/plan.js';
import { CAMERAS, VAULT } from '../building/bank-interiors.js';

// Big Boy Bank's own security, on top of its guards (sim/security.js):
//
//   Cameras   black domes in the ceilings, and box cameras on swivel arms
//             panning side to side. One that sees you lights red, and the
//             control room sends the guards to where you are — and you have
//             been seen, as far as the law is concerned. Spray paint over one
//             blinds it; smash it and it is gone.
//   Lasers    red beams across the vault, low and high: step over the low
//             ones, crouch under the high. Touch one and the alarm goes to the
//             police. A fuse box in the plant room turns them off, if you
//             find it and smash it.
//   Lockdown  blow the vault door and the bank locks down: steel shutters
//             drop over the front doors and the stair out of the lower level,
//             the alarm rings, the police are on their way. Blow through
//             them, or wait: they lift again after a minute and a half.
//
// With the vault's code (from the CEO's desk) the door opens quietly, and none
// of this happens.

const DOME = { range: 11 };
const SWIVEL = { range: 16, cone: 0.55, sweep: 0.9, speed: 0.5 };
const SEEN = 0.6;                    // s in view before the control room has you
const LOCKDOWN = 90;                 // s the shutters stay down
// The beams, across the vault from wall to wall: [z, height].
const BEAMS = [[-6.0, 0.4], [-6.7, 1.25], [-12.9, 0.8], [-8.5, 1.3]];

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class BankSecurity {
  constructor(fx) {
    this.fx = fx;                    // { scene, world, pieces, physics, player, camera, security, water, hud, audio, onSeen }
    this.on = false;
    this.cams = [];
    this.beams = [];
  }

  reset(job, level) {
    this.clear();
    this.on = job.id === 'bank' && !level.creative;
    if (!this.on) return;
    const { scene, pieces } = this.fx;
    // The cameras: the pieces the bank was built with, and a light (and a
    // head, on a swivel) on each.
    const led = new THREE.MeshBasicMaterial({ color: 0x401010 });
    for (const c of CAMERAS) {
      const g = new THREE.Group();
      g.position.set(c.x, c.y, c.z);
      if (c.kind === 'swivel') {
        const head = new THREE.Group();
        head.position.y = -0.5;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.32), new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.5 }));
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x101214 }));
        lens.position.z = 0.17;
        head.add(box, lens);
        g.add(head);
        c.head = head;
      }
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), led.clone());
      light.position.set(0, c.kind === 'swivel' ? -0.44 : -0.2, c.kind === 'swivel' ? 0.1 : 0);
      g.add(light);
      scene.add(g);
      this.cams.push({ ...c, group: g, light, t: Math.random() * 6, seen: 0, blind: false, alerted: -99 });
    }
    // The lasers.
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const y0 = T(LOWER);
    for (const [z, h] of BEAMS) {
      const len = VAULT.x1 - VAULT.x0 - 1.1;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 6).rotateZ(Math.PI / 2), mat);
      m.position.set((VAULT.x0 + VAULT.x1) / 2, y0 + h, z);
      scene.add(m);
      this.beams.push({ mesh: m, z, y: y0 + h, x0: VAULT.x0 + 0.55, x1: VAULT.x1 - 0.55 });
    }
    // The tickers on the trading floors: prices running along each, green —
    // red, and falling, when the building panics.
    this.tickers = [];
    this._tape = tape(false);
    for (const p of pieces.list.filter((q) => q.tag === 'ticker')) {
      const b = p.box, w = b.max.x - b.min.x, h = b.max.y - b.min.y;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, h - 0.06), new THREE.MeshBasicMaterial({ map: this._tape.texture, transparent: true }));
      m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z + 0.006);
      scene.add(m);
      this.tickers.push({ piece: p, mesh: m });
    }
    this.crashed = false;
    this.fuse = pieces.list.find((p) => p.tag === 'fusebox');
    this.door = pieces.list.find((p) => p.tag === 'vault');
    this.lasers = true;
    this.tripped = -99;
    this.locked = 0;
    this.shutters = [];
    this.time = 0;
    this.opened = false;            // the door opened with the code
    this.camsOff = false;           // hacked off in the control room (sim/control-room.js)
  }

  // Spray paint landed on piece p: a camera under it is blind.
  sprayed(p) {
    const c = this.cams.find((k) => k.piece === p);
    if (!c || c.blind) return;
    c.blind = true;
    c.light.material.color.set(0x101010);
    this.fx.hud?.flash('Camera blinded', 1.2);
  }

  // Does any camera see you right now? (For the law: being seen.)
  // Is anyone watching the screens? Not with the cameras hacked off, nor with
  // the operator knocked out (sim/control-room.js).
  get watched() { return this.on && !this.camsOff && (this.fx.room?.operatorUp ?? true); }
  get sees() { return this.watched && this.cams.some((c) => c.seen > SEEN) && !!this.fx.suspect?.(); }

  update(dt) {
    if (!this.on) return;
    this.time += dt;
    const { player, camera, physics, security, hud } = this.fx;
    this._trading(dt);
    const eye = camera.position;
    for (const c of this.cams) {
      const live = c.piece.state === 'static' && !c.blind && !this.camsOff;
      c.group.visible = c.piece.state === 'static';
      c.t += dt;
      // A swivel camera pans to and fro.
      const yaw = c.yaw + (c.kind === 'swivel' ? Math.sin(c.t * SWIVEL.speed) * SWIVEL.sweep : 0);
      if (c.head) c.head.rotation.y = yaw;
      let sees = false;
      if (live && !player.dead && Math.abs(eye.y - c.y) < 4.2 && eye.y < c.y) {
        _v.set(c.x, c.y - 0.25, c.z);
        const to = _w.copy(eye).sub(_v), d = to.length();
        const range = c.kind === 'swivel' ? SWIVEL.range : DOME.range;
        if (d < range * (player.disguised ? 0.4 : 1) * (player.crouch > 0.5 ? 0.8 : 1)) {
          to.divideScalar(d);
          const inCone = c.kind !== 'swivel' || Math.sin(yaw) * to.x + Math.cos(yaw) * to.z > Math.cos(SWIVEL.cone) * Math.hypot(to.x, to.z);
          if (inCone) {
            const hit = physics.raycast(_v, to, d - 0.3);
            sees = !hit || !!hit.owner?.kind?.glass || hit.owner === c.piece;
          }
        }
      }
      c.seen = sees ? c.seen + dt : Math.max(0, c.seen - dt * 2);
      // A camera watches everyone; the control room only acts on someone up
      // to something — breaking things, carrying the bank's money, or already
      // wanted. A customer walking in is just a customer.
      const bad = c.seen > SEEN && this.watched && !!this.fx.suspect?.();
      c.light.material.color.set(!live ? 0x101010 : bad ? (Math.floor(this.time * 6) % 2 ? 0xff2a1a : 0x601010) : 0x401010);
      // Seen at it: the control room sends the guards, every few seconds while it lasts.
      if (bad && this.time - c.alerted > 4) {
        c.alerted = this.time;
        security?.summon?.(player.pos, true);
        security.spotted = security.time;
        if (this.time - (this._said ?? -99) > 12) { this._said = this.time; hud?.flash('Control room: "Suspect on camera"', 1.8); }
        this.fx.onSeen?.();
      }
    }
    // The fuse box: smashed, and the vault is dark to the lasers.
    if (this.lasers && this.fuse && this.fuse.state !== 'static') {
      this.lasers = false;
      for (const b of this.beams) b.mesh.visible = false;
      hud?.flash('The vault lasers go dark', 2);
    }
    // A beam across you.
    if (this.lasers && !player.dead) {
      const foot = player.pos.y, head = player.pos.y + 1.75 - 0.62 * player.crouch;
      for (const b of this.beams) {
        b.mesh.material.opacity = 0.65 + 0.25 * Math.sin(this.time * 9 + b.z);
        if (b.y < foot || b.y > head || player.pos.x < b.x0 || player.pos.x > b.x1 || Math.abs(player.pos.z - b.z) > 0.32) continue;
        if (this.time - this.tripped > 20) { this.tripped = this.time; this._alarm('A laser! The vault alarm has gone to the police'); }
      }
    }
    // The vault door blown, not opened: lockdown.
    if (this.door && !this.opened && this.door.state !== 'static' && !this._blown) { this._blown = true; this._lockdown(); }
    if (this.locked > 0 && (this.locked -= dt) <= 0) this._lift();
  }

  // The trading floors: the tape runs; when the building panics it goes red
  // and the prices fall, and the traders are all on their phones.
  _trading(dt) {
    const { fear, people, structure, topple } = this.fx;
    const panic = (fear?.level ?? 0) > 50 || structure?.collapsing || topple?.active;
    if (panic && !this.crashed) { this.crashed = true; tape(true, this._tape); this.fx.hud?.flash('The market crashes: the tickers go red', 2); }
    this._tape.texture.offset.x = (this._tape.texture.offset.x + dt * (this.crashed ? 0.09 : 0.05)) % 1;
    for (const t of this.tickers) t.mesh.visible = t.piece.state === 'static';
    if ((fear?.level ?? 0) > 35 || this.crashed) {
      for (const p of people?.list ?? []) if (!p.agent && !p.street && p.f >= 3 && p.f <= 12 && p.state !== 'down') p.armUp = 1;
    }
  }

  _alarm(text) {
    const { security, water, hud, audio } = this.fx;
    hud?.flash(text, 2.5);
    if (water) water.alarm = Math.max(water.alarm, 45);
    security?.call?.(text);
    if (security && security.eta !== null) security.eta = Math.min(security.eta, (security.level?.police ?? 60) * 0.5);
    audio?.chime?.();
  }

  // Steel shutters over the front doors and the stair out of the lower level.
  _lockdown() {
    const { world, audio, player } = this.fx;
    this._alarm('LOCKDOWN — the vault alarm! Steel shutters drop over the doors');
    const added = world.addBuilding((P) => {
      const o = { structural: false, tint: 0x6a7076, tag: 'shutter' };
      block(P, 'steel', -2.3, T(0), 13.55, 2.3, T(0) + 3.9, 13.75, 'wall', { ...o, floor: 0 });
      block(P, 'steel', -4.3, T(LOWER), 3.55, -2.4, T(LOWER) + 2.5, 3.75, 'wall', { ...o, floor: LOWER });
    }, 'shutters:');
    this.shutters = added;
    this.locked = LOCKDOWN;
    audio?.thud?.(player.pos.x, player.pos.y, player.pos.z);
    this.fx.shake?.add(0.15);
  }

  _lift() {
    for (const p of this.shutters) if (p.state === 'static') this.fx.pieces.destroy(p);
    this.shutters = [];
    this.fx.hud?.flash('The lockdown lifts: the shutters go up', 2);
  }

  // The door opened with its code: quietly, no lockdown.
  openVault() {
    if (!this.door || this.door.state !== 'static') return false;
    this.opened = true;
    this.fx.pieces.destroy(this.door);
    this.fx.hud?.flash('The vault door swings open', 2);
    return true;
  }

  clear() {
    for (const t of this.tickers ?? []) t.mesh.removeFromParent();
    this.tickers = [];
    for (const c of this.cams) c.group.removeFromParent();
    for (const b of this.beams) b.mesh.removeFromParent();
    this.cams = [];
    this.beams = [];
    this._blown = false;
    this.on = false;
  }
}

// The ticker tape: symbols and prices on black, green and rising, or red and
// falling. Drawn twice as wide as it shows, and scrolled.
const SYMBOLS = ['BBB', 'ACME', 'GLDN', 'NYCX', 'FIFT', 'HRLD', 'MRCH', 'WALL', 'BULL', 'TWRS', 'BRDS', 'CRNR'];
function tape(red, into = null) {
  const c = into?.canvas ?? document.createElement('canvas');
  c.width = 2048; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#05070a'; g.fillRect(0, 0, c.width, c.height);
  g.font = 'bold 34px monospace'; g.textBaseline = 'middle';
  let x = 10;
  for (let i = 0; x < c.width; i++) {
    const s = SYMBOLS[i % SYMBOLS.length], p = (20 + ((i * 37) % 180) + ((i * 13) % 100) / 100).toFixed(2);
    const ch = red ? -(2 + ((i * 7) % 14) + ((i * 3) % 10) / 10) : 0.2 + ((i * 5) % 9) / 10;
    g.fillStyle = '#e8e8e0'; g.fillText(s, x, 33); x += g.measureText(s).width + 14;
    g.fillStyle = red ? '#ff4a3a' : '#4af07a';
    const t = `${p} ${red ? '▼' : '▲'}${Math.abs(ch).toFixed(1)}%`;
    g.fillText(t, x, 33); x += g.measureText(t).width + 40;
  }
  const texture = into?.texture ?? new THREE.CanvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = 0.5;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { canvas: c, texture };
}
