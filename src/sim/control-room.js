import * as THREE from 'three';
import { T, LOWER } from '../building/plan.js';
import { CONTROL } from '../building/bank-interiors.js';

// Big Boy Bank's control room, on the lower level by the vault
// (building/bank-interiors.js builds it):
//
//   The door    steel, locked, and there is no key: break it — a sledge takes
//               a while, a jackhammer less, a charge at once. The operator
//               hears it going and calls everyone.
//   The operator  at his desk watching the screens: while he is there the
//               cameras send the guards. Seeing you in his room he radios every
//               guard and the police. One blow knocks him out for good, and
//               then nobody is watching — the cameras see, but nobody acts.
//   The desk    E to sit and watch through the cameras: a grainy picture, left
//               and right click flick from one to the next, E to stand up.
//               Hold F for eight seconds to break into the system, then match
//               the codes: four columns, click as each glowing code crosses
//               the bar, three misses and you start again. Done, and every
//               camera in the bank is off. The vault's lasers are on their own
//               fuse box, and stay on.
//   While you sit there, guards on their rounds may walk in: a beep, and
//   "footsteps", when one comes near.

const DOOR_HITS = 7;                 // sledge blows to break the door (a jackhammer bite is a quarter)
const HACK = 8;                      // s holding F
const REACH = 1.8;
const COL_H = 260, BAR = 120, CODE_H = 28;

const _v = new THREE.Vector3();

export class ControlRoom {
  constructor(fx) {
    this.fx = fx;                    // { bank, security, player, input, hud, audio, camera, renderer, pieces }
    this.on = false;
    this._dom();
  }

  reset(on) {
    this.clear();
    this.on = on;
    if (!on) return;
    const { pieces, security, scene } = this.fx;
    this.door = pieces.list.find((p) => p.tag === 'controldoor');
    this.desk = pieces.list.find((p) => p.tag === 'controldesk');
    this.screens = pieces.list.find((p) => p.tag === 'screens');
    this.hits = 0;
    const [sx, sz, yaw] = CONTROL.seat;
    this.operator = security.addOperator(new THREE.Vector3(sx, T(LOWER), sz), yaw);
    // The wall of screens: the camera pictures, grey and grainy, moving.
    const S = CONTROL.screens;
    this._feed = document.createElement('canvas');
    this._feed.width = 512; this._feed.height = 160;
    this._feedTex = new THREE.CanvasTexture(this._feed);
    this._feedTex.colorSpace = THREE.SRGBColorSpace;
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(S.z1 - S.z0 - 0.1, S.y1 - S.y0 - 0.08), new THREE.MeshBasicMaterial({ map: this._feedTex }));
    this.wall.position.set(S.x + 0.006, T(LOWER) + (S.y0 + S.y1) / 2, (S.z0 + S.z1) / 2);
    this.wall.rotation.y = Math.PI / 2;
    scene.add(this.wall);
    this._feedT = 0;
  }

  get operatorUp() { return this.on && this.operator && !this.operator.ko && this.operator.state !== 'gone'; }
  get busy() { return !!(this.viewing || this.game); }

  // A blow on piece p (power: 1 a sledge blow, a quarter a jackhammer bite).
  struck(p, power = 1) {
    if (!this.on || p !== this.door || p.state !== 'static') return;
    const { audio, hud, pieces, security } = this.fx;
    const c = p.box.getCenter(_v);
    audio?.hit?.('steel', c.x, c.y, c.z, 1);
    if (this.hits === 0) security.raise(this.operator, 'Control room: "Someone is breaking the door in!"');
    this.hits += power;
    if (this.hits >= DOOR_HITS) { pieces.destroy(p); hud?.flash('The control room door gives way', 2); this.fx.shake?.add(0.12); }
  }

  operatorOut() { this.fx.hud?.flash('The operator is out: nobody is watching the screens', 2.5); }

  // Each frame in play. Returns a tip for the HUD, or null.
  update(dt) {
    if (!this.on) return null;
    const { player, input, hud, bank } = this.fx;
    this._screens(dt);
    if (this.game) { this._play(dt); this._footsteps(dt); return 'Click as each glowing code crosses the bar · E to give up'; }
    if (this.viewing) {
      if (input.pressed('Mouse0')) this._flick(1);
      if (input.pressed('Mouse2')) this._flick(-1);
      if (input.pressed('KeyE')) this.leave();
      this._footsteps(dt);
      this._label();
      return null;
    }
    // At the desk?
    const d = this.desk;
    const at = d && d.state === 'static' && Math.abs(player.pos.y - T(LOWER)) < 1 && d.box.distanceToPoint(_v.copy(player.pos).setY(T(LOWER) + 0.5)) < REACH;
    if (!at || player.dead) { this.hackT = 0; return null; }
    const off = bank.camsOff;
    if (input.pressed('KeyE') && !off) this._sit();
    if (!off && input.down('KeyF')) {
      this.hackT = (this.hackT ?? 0) + dt;
      if (this.hackT >= HACK) { this.hackT = 0; this._start(); }
      return `Breaking into the system… ${Math.round((this.hackT / HACK) * 100)}%`;
    }
    this.hackT = 0;
    return off ? 'The cameras are off' : 'E — watch the cameras · hold F — hack them';
  }

  // ---------------------------------------------------------------- watching

  _live() { return this.fx.bank.cams.filter((c) => c.piece.state === 'static' && !c.blind); }

  _sit() {
    const cams = this._live();
    if (!cams.length) { this.fx.hud?.flash('Every camera is dead', 1.5); return; }
    this.viewing = { i: 0 };
    this.el.view.style.display = 'block';
    this.fx.renderer.domElement.style.filter = 'grayscale(0.85) contrast(1.25) brightness(0.92)';
    this.fx.audio?.click?.();
  }

  _flick(step) {
    const n = this._live().length;
    if (!n) { this.leave(); return; }
    this.viewing.i = (this.viewing.i + step + n) % n;
    this.fx.audio?.click?.();
  }

  // Stand up from the desk (or close the hack), as you were.
  leave() {
    this.viewing = null;
    this.game = null;
    this.el.view.style.display = 'none';
    this.el.game.style.display = 'none';
    this.fx.renderer.domElement.style.filter = '';
  }

  // The camera you are looking through: where it hangs, looking where it looks.
  look(camera) {
    if (!this.viewing) return;
    const cams = this._live();
    if (!cams.length) { this.leave(); return; }
    const c = cams[this.viewing.i % cams.length];
    const yaw = c.kind === 'swivel' ? c.yaw + Math.sin(c.t * 0.5) * 0.9 : Math.atan2(-c.x, -c.z) + Math.sin(this.fx.bank.time * 0.2) * 0.4;
    camera.position.set(c.x, c.y - 0.35, c.z);
    camera.rotation.set(-0.42, yaw + Math.PI, 0);
    camera.updateMatrixWorld();
    this._cam = c;
  }

  _label() {
    const c = this._cam;
    if (!c) return;
    const n = this._live().indexOf(c) + 1;
    const t = new Date();
    this.el.label.textContent = `CAM ${String(n).padStart(2, '0')} · FLOOR ${c.f < 0 ? 'LL' : c.f} · ● REC ${t.toTimeString().slice(0, 8)}`;
  }

  // A guard coming near while you are busy at the desk.
  _footsteps(dt) {
    const { security, player, audio, hud } = this.fx;
    if ((this._stepT = (this._stepT ?? 0) - dt) > 0) return;
    this._stepT = 1;
    const near = security.agents.some((a) => a.kind !== 'cop' && a.mode !== 'operator' && a.state !== 'down' && !a.hidden && Math.abs(a.pos.y - player.pos.y) < 2 && a.pos.distanceTo(player.pos) < 10);
    if (near) { audio?.chime?.(); hud?.flash('Footsteps outside…', 0.9); }
  }

  // ---------------------------------------------------------------- the hack

  _start() {
    this.game = { col: 0, misses: 0, cols: [0, 1, 2, 3].map((i) => ({ y: Math.random() * COL_H, v: 110 + i * 30, done: false, code: hex(2) })), flash: 0 };
    this.el.game.style.display = 'flex';
    this._draw();
    this.fx.audio?.click?.();
  }

  _play(dt) {
    const g = this.game, { input, hud } = this.fx;
    if (input.pressed('KeyE')) { this.leave(); return; }
    const c = g.cols[g.col];
    c.y = (c.y + c.v * dt) % (COL_H + CODE_H);
    g.flash = Math.max(0, g.flash - dt);
    if (input.pressed('Mouse0')) {
      const mid = c.y + CODE_H / 2 - CODE_H;
      if (Math.abs(mid - BAR) < 18) {
        c.done = true;
        this.fx.audio?.click?.();
        g.col++;
        if (g.col >= g.cols.length) { this._win(); return; }
      } else {
        g.misses++;
        g.flash = 0.25;
        this.fx.audio?.hit?.('steel', this.fx.player.pos.x, this.fx.player.pos.y, this.fx.player.pos.z, 0.3);
        if (g.misses >= 3) { hud?.flash('Access denied — start again', 1.5); this.game = null; this._start(); return; }
      }
    }
    this._draw();
  }

  _win() {
    const { bank, hud, audio } = this.fx;
    bank.camsOff = true;
    for (const c of bank.cams) c.light.material.color.set(0x101010);
    this.leave();
    hud?.flash('Access granted: every camera in the bank is off', 3);
    audio?.chime?.();
  }

  _draw() {
    const g = this.game;
    this.el.cols.forEach((el, i) => {
      const c = g.cols[i];
      el.style.borderColor = c.done ? '#4af07a' : i === g.col ? (g.flash ? '#ff4a3a' : '#7fd8ff') : '#2a3a44';
      el.code.textContent = c.code;
      el.code.style.top = `${c.done ? BAR - CODE_H / 2 : c.y - CODE_H}px`;
      el.code.style.color = c.done ? '#4af07a' : '#7fffd4';
      if (Math.random() < 0.15) el.junk.textContent = Array.from({ length: 9 }, () => hex(4)).join('\n');
    });
    this.el.misses.textContent = `${'●'.repeat(3 - g.misses)}${'○'.repeat(g.misses)}`;
  }

  // ---------------------------------------------------------------- the screens and the overlays

  _screens(dt) {
    if (!this.wall) return;
    this.wall.visible = this.screens?.state === 'static';
    if ((this._feedT -= dt) > 0 || !this.wall.visible) return;
    this._feedT = 0.15;
    const g = this._feed.getContext('2d'), off = this.fx.bank.camsOff;
    g.fillStyle = '#050607'; g.fillRect(0, 0, 512, 160);
    for (let k = 0; k < 8; k++) {
      const x = (k % 4) * 128 + 3, y = Math.floor(k / 4) * 80 + 3;
      if (off) { g.fillStyle = '#0b1a2a'; g.fillRect(x, y, 122, 74); g.fillStyle = '#3a6a9a'; g.font = '10px monospace'; g.fillText('NO SIGNAL', x + 34, y + 40); continue; }
      const v = 60 + Math.random() * 30;
      g.fillStyle = `rgb(${v},${v + 4},${v})`; g.fillRect(x, y, 122, 74);
      for (let i = 0; i < 60; i++) { const n = Math.random() * 90; g.fillStyle = `rgba(${n},${n},${n},0.5)`; g.fillRect(x + Math.random() * 122, y + Math.random() * 74, 2, 1); }
      g.fillStyle = '#d8d8d0'; g.font = '9px monospace'; g.fillText(`CAM ${String(k + 1).padStart(2, '0')}`, x + 4, y + 11);
    }
    this._feedTex.needsUpdate = true;
  }

  _dom() {
    const hud = document.getElementById('hud');
    const view = document.createElement('div');
    view.style.cssText = 'position:absolute;inset:0;display:none;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,transparent 2px 4px),radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)';
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;left:24px;top:22px;font:600 15px monospace;color:#e8e8e0;text-shadow:0 0 4px #000';
    const help = document.createElement('div');
    help.style.cssText = 'position:absolute;left:24px;bottom:24px;font:13px monospace;color:#cfd8d0;opacity:.85';
    help.textContent = 'Left / right click: next camera · E: stand up';
    view.append(label, help);
    const game = document.createElement('div');
    game.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:10px;padding:18px 22px;background:#05080bf0;border:1px solid #2a4a5a;border-radius:8px;font:600 14px monospace;color:#7fd8ff';
    game.innerHTML = '<div>BREAKING IN — MATCH THE CODES</div>';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;position:relative';
    const cols = [0, 1, 2, 3].map(() => {
      const el = document.createElement('div');
      el.style.cssText = `position:relative;width:70px;height:${COL_H}px;overflow:hidden;border:2px solid #2a3a44;border-radius:4px;background:#020405`;
      const junk = document.createElement('pre');
      junk.style.cssText = 'margin:0;padding:4px;font:11px/26px monospace;color:#1f4a3a;white-space:pre';
      const bar = document.createElement('div');
      bar.style.cssText = `position:absolute;left:0;right:0;top:${BAR - 18}px;height:36px;border-top:1px solid #7fd8ff88;border-bottom:1px solid #7fd8ff88;background:#7fd8ff14`;
      const code = document.createElement('div');
      code.style.cssText = `position:absolute;left:0;right:0;height:${CODE_H}px;text-align:center;font:700 20px/${CODE_H}px monospace;text-shadow:0 0 8px #7fffd4`;
      el.append(junk, bar, code);
      row.append(el);
      el.code = code; el.junk = junk;
      return el;
    });
    const misses = document.createElement('div');
    misses.style.color = '#ff8a7a';
    game.append(row, misses);
    hud?.append(view, game);
    this.el = { view, label, game, cols, misses };
  }

  clear() {
    this.leave?.();
    if (this.wall) { this.wall.removeFromParent(); this.wall = null; }
    this.operator = null;
    this.on = false;
  }
}

const hex = (n) => Array.from({ length: n }, () => '0123456789ABCDEF'[(Math.random() * 16) | 0]).join('');
