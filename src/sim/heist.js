import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SITE } from '../site.js';
import { T, LOWER, TOP_FLOOR } from '../building/plan.js';

// The money, for a job that is a heist as well as a demolition (Big Boy Bank):
// the client wants the vault emptied as well as the tower down, so that there
// is nothing to build it again with.
//
// The money is on pallets in the vault (pieces tagged 'money'), a bag's worth
// each. E by a pallet fills a bag; you carry one at half your speed, two at a
// fifth. G puts one down, E picks it up again; die and you drop what you carry.
// The getaway van waits in the street with its back doors open: walk up to it
// and what you carry goes in. With enough money in it — half the vault on
// Easy, more the harder the job — and the tower down, get in the van (E): the
// job is done. The van is the only way to finish.
//
// And on the way:
//   the vault's code, on a note on the CEO's desk at the top: with it, E at
//     the vault door opens it quietly — no alarm, no lockdown
//   the illegal trading books, on the same desk: hand them in at the van and
//     the bosses are arrested (a bonus, and a secret)
//   the gold statue of the CEO: heavy, carried like a bag, a bonus in the van
//   the CEO's safe: blow it open and a bag of cash falls out — yours
//   a money cart, hidden on the lower level: push it and carry six bags at a
//     time, at a steady walk (G lets go)
//   small stashes of cash in the old buildings along the street, behind locked
//     doors: E picks one up — yours

export const BAG = 250000;                       // dollars a pallet, a bag
const NEED = { supereasy: 0.4, easy: 0.5, normal: 0.65, hard: 0.8, insane: 1 };
const SPEED = [1, 0.5, 0.2];                     // carrying none, one, two
const CART = { load: 6, speed: 0.6 };
const REACH = 1.9;
const VALUE = { statue: 400000, books: 500000, safe: 150000 };
const _v = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

export class Heist {
  constructor(fx) {
    this.fx = fx;                                // { scene, vmScene, pieces, physics, player, input, hud, audio, bankSecurity, onEscape, onBooks }
    this.on = false;
    this.load = [];                              // what you carry: { kind: 'money' | 'statue' | 'books' | 'cash', value }
    this.delivered = 0;
    this.dropped = [];
    this.props = [];
    this.van = null;
    this._carry = this._carried();
  }

  // A new job: on for a heist, with the van parked, the vault counted and the
  // CEO's desk laid out.
  reset(job, level) {
    this.clear();
    this.on = !!job.heist && !level.creative;
    if (!this.on) return;
    const list = this.fx.pieces.list;
    this.pallets = list.filter((p) => p.tag === 'money');
    // Where each pallet stands: one crushed leaves its money on the floor there.
    for (const p of this.pallets) p.cashAt = p.box.getCenter(new THREE.Vector3());
    this.total = this.pallets.length * BAG;
    this.need = Math.round(this.pallets.length * (NEED[level.id] ?? 0.65)) * BAG;
    this.statue = list.find((p) => p.tag === 'statue');
    this.safe = list.find((p) => p.tag === 'safe');
    this.vault = list.find((p) => p.tag === 'vault');
    // The stashes: each a few tens of thousands.
    this.stashes = list.filter((p) => p.tag === 'stash').map((p) => ({ piece: p, value: 40000 + Math.round(Math.random() * 10) * 5000 }));
    this.code = false;
    this._buildVan();
    // On the CEO's desk: the code, and the books.
    const y = T(TOP_FLOOR) + 0.8;
    this._prop('note', paperMesh(), 0.5, y, 6.1);
    this._prop('books', booksMesh(), -0.7, y, 6.0);
    // The cart, round the back of the plant room on the lower level.
    const C = SITE.cart;
    if (C) {
      this.cart = { mesh: cartMesh(), held: false };
      this.cart.mesh.position.set(C.x, T(LOWER), C.z);
      this.fx.scene.add(this.cart.mesh);
    }
  }

  get bags() { return this.load.length; }

  // Each frame in play. `towerDown`: the job's height is met. Returns a tip
  // for the HUD, or null.
  update(dt, towerDown) {
    const { player, input, hud, audio } = this.fx;
    const pushing = this.cart?.held;
    this._carry.visible = this.bags > 0 && !pushing;
    this._carry.children[1].visible = this.bags > 1;
    if (!this.on) { player.cargo = 1; return null; }
    player.cargo = pushing ? CART.speed : (this.speeds ?? SPEED)[Math.min(2, this.bags)];
    if (player.dead) { this._drop(this.bags); if (pushing) this.cart.held = false; return null; }
    this._settle(dt);
    if (pushing) {
      // The cart in front of you, where you look.
      const f = _v.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
      this.cart.mesh.position.set(player.pos.x + f.x * 1.1, player.pos.y, player.pos.z + f.z * 1.1);
      this.cart.mesh.rotation.y = player.yaw;
      this.cart.mesh.userData.load.forEach((m, i) => { m.visible = i < this.bags; });
    }
    const cap = pushing ? CART.load : 2;
    const near = (pos) => pos.distanceTo(player.pos) < REACH;
    const close = (p) => p && p.state === 'static' && p.box.distanceToPoint(_v.copy(player.pos).setY(player.pos.y + 0.5)) < REACH;
    let tip = null;
    const take = (item, text) => { this.load.push(item); hud?.flash(text, 1.6); };
    // What is in reach.
    const prop = this.props.find((q) => q.mesh.visible && near(q.mesh.position));
    const bag = this.dropped.find((b) => near(b.mesh.position));
    const stash = this.stashes.find((s) => close(s.piece));
    // A pallet shaken loose by a collapse is still a pallet of money.
    const pallet = this.pallets.find((p) => p.state !== 'dead' && p.box.distanceToPoint(_v.copy(player.pos).setY(player.pos.y + 0.5)) < REACH);
    if (this.cart && !pushing && near(this.cart.mesh.position) && !this.cart.found) { this.cart.found = true; hud?.flash('A money cart! E to push it', 2); }
    if (this.cart && !pushing && near(this.cart.mesh.position) && this.bags <= CART.load) {
      tip = 'E — push the money cart';
      if (input.pressed('KeyE')) { this.cart.held = true; hud?.flash('Pushing the cart: six bags, a steady walk. G lets go', 2); }
    } else if (prop?.kind === 'note') {
      tip = 'E — read the note';
      if (input.pressed('KeyE')) { this.code = true; prop.mesh.visible = false; hud?.flash('A note: "Vault — 4 7 1 9". The vault code', 3); }
    } else if (prop && this.bags < cap) {
      tip = 'E — take the trading books';
      if (input.pressed('KeyE')) { prop.mesh.visible = false; take({ kind: 'books', value: VALUE.books }, 'The illegal trading books: get them to the van'); }
    } else if (bag && this.bags < cap) {
      tip = 'E — pick it up';
      if (input.pressed('KeyE')) { bag.mesh.removeFromParent(); this.dropped.splice(this.dropped.indexOf(bag), 1); this.load.push(bag.item); }
    } else if (stash) {
      tip = `E — take the cash ($${this.money(stash.value)})`;
      if (input.pressed('KeyE')) { this.fx.pieces.destroy(stash.piece); this.found += stash.value; this.stashes.splice(this.stashes.indexOf(stash), 1); hud?.flash(`Cash: $${this.money(stash.value)} — yours`, 2); audio?.flutter?.(player.pos.x, player.pos.y, player.pos.z, 3); }
    } else if (close(this.statue) && this.bags < cap) {
      tip = 'E — take the gold statue';
      if (input.pressed('KeyE')) { this.fx.pieces.destroy(this.statue); this.statue = null; take({ kind: 'statue', value: VALUE.statue }, 'The gold statue: heavy as a bag of money'); }
    } else if (pallet && this.bags < cap) {
      tip = `E — fill a bag ($${this.money(BAG)})`;
      if (input.pressed('KeyE')) { pallet.taken = true; this.fx.pieces.destroy(pallet); audio?.flutter?.(player.pos.x, player.pos.y, player.pos.z, 3); take({ kind: 'money', value: BAG }, this.bags > 1 && !pushing ? 'Two bags: you can barely move' : 'A bag of money'); }
    } else if (close(this.vault) && this.code) {
      tip = 'E — key in the code: 4 7 1 9';
      if (input.pressed('KeyE')) this.fx.bankSecurity?.openVault();
    }
    if (input.pressed('KeyG')) {
      if (pushing) { this.cart.held = false; hud?.flash('You let go of the cart', 1.2); }
      else if (this.bags) this._drop(1);
    }
    // A pallet crushed: the money is not lost — a bag of it lies where it stood.
    for (const p of this.pallets) if (p.state === 'dead' && !p.taken) { p.taken = true; this._dropAt({ kind: 'money', value: BAG }, p.cashAt.x, p.cashAt.y - 0.2, p.cashAt.z); }
    // The CEO's safe, blown: a bag of cash on the floor where it stood.
    if (this.safe && this.safe.state !== 'static') {
      const c = this.safe.box.getCenter(new THREE.Vector3());
      this._dropAt({ kind: 'cash', value: VALUE.safe }, c.x, c.y - 0.2, c.z);
      hud?.flash('The safe is open: a bag of cash', 2);
      this.safe = null;
    }
    // The van: what you carry goes in the back; with enough in it and the
    // tower down, get in.
    const back = this._back();
    const d = back.distanceTo(_v.set(player.pos.x, 0, player.pos.z)) - (pushing ? 1.2 : 0);
    if (d < 3.2) {
      if (this.bags) {
        for (const it of this.load) {
          if (it.kind === 'money') this.delivered += it.value;
          else if (it.kind === 'cash') this.found += it.value;
          else if (it.kind === 'statue') this.bonuses.push(['The gold statue', it.value]);
          else if (it.kind === 'books') { this.bonuses.push(['The trading books: the bosses arrested', it.value]); this.books = true; this.fx.onBooks?.(); }
        }
        hud?.flash(`In the van: $${this.money(this.delivered)} of $${this.money(this.need)}`, 2);
        audio?.thud?.(back.x, 1, back.z);
        this.load = [];
      }
      if (this.delivered < this.need) tip = `The client wants $${this.money(this.need - this.delivered)} more in the van`;
      else if (!towerDown) tip = 'The money is in. Now bring the glass tower down';
      else {
        tip = 'E — get in the van';
        if (input.pressed('KeyE')) this.fx.onEscape?.();
      }
    }
    return tip;
  }

  // For the HUD's objective line.
  get status() {
    if (!this.on) return '';
    return `$${this.money(this.delivered)} of $${this.money(this.need)} in the van${this.bags ? ` · carrying ${this.bags}` : ''}${this.cart?.held ? ' (the cart)' : ''}`;
  }

  money(n) { return n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 2 : 0)}M` : `${(n / 1000) | 0}k`; }

  // A thing laid somewhere (the note, the books): it falls with what it lies
  // on — and a book that falls down a collapsing tower is lost.
  _prop(kind, mesh, x, y, z) {
    mesh.position.set(x, y, z);
    this.fx.scene.add(mesh);
    this.props.push({ kind, mesh, t: Math.random() * 0.5 });
  }

  _settle(dt) {
    const { physics } = this.fx;
    for (const q of this.props) {
      if (!q.mesh.visible || (q.t -= dt) > 0) continue;
      q.t = 0.5;
      const hit = physics.raycast(q.mesh.position, _down, 0.4);
      if (!hit) q.mesh.visible = false;          // gone with the desk it lay on
    }
  }

  // Put things down where you stand.
  _drop(n) {
    const { player } = this.fx;
    for (let i = 0; i < n && this.load.length; i++) this._dropAt(this.load.pop(), player.pos.x + (Math.random() - 0.5) * 0.6, player.pos.y + 0.25, player.pos.z + (Math.random() - 0.5) * 0.6);
  }

  _dropAt(item, x, y, z) {
    const m = item.kind === 'books' ? booksMesh() : bagMesh();
    // On whatever is under it — the floor, or the rubble of the floor that went.
    const hit = this.fx.physics.raycast(_v.set(x, y + 0.3, z), _down, 300);
    m.position.set(x, hit ? y + 0.3 - hit.distance + 0.25 : 0.25, z);
    m.rotation.y = Math.random() * Math.PI;
    this.fx.scene.add(m);
    this.dropped.push({ mesh: m, item });
  }

  // The van: plain, white, its back doors open towards the street's −x.
  _buildVan() {
    const V = SITE.van;
    if (!V) return;
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.45, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.1, 2.2, 5.4, 3, 0.15), white);
    body.position.y = 1.35;
    const screen = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.65, 0.08, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.05, metalness: 0.6 }));
    screen.position.set(0, 1.85, -2.7);
    const inside = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 0.05), dark);
    inside.position.set(0, 1.35, 2.68);
    const doors = [-1, 1].map((s) => {
      const hinge = new THREE.Group();
      hinge.position.set(s * 1.03, 1.35, 2.7);
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.95, 0.06), white);
      d.position.x = -s * 0.5;
      hinge.add(d);
      hinge.rotation.y = s * 1.9;
      return hinge;
    });
    const wheels = [];
    for (const [x, z] of [[-1.0, -1.8], [1.0, -1.8], [-1.0, 1.8], [1.0, 1.8]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 16), dark);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.4, z);
      wheels.push(w);
    }
    g.add(body, screen, inside, ...doors, ...wheels);
    for (const m of g.children) m.castShadow = true;
    g.position.set(V.x, 0, V.z);
    g.rotation.y = V.yaw;
    this.fx.scene.add(g);
    this.van = g;
  }

  // The ground under the van's open back.
  _back() {
    const V = SITE.van;
    return new THREE.Vector3(V.x, 0, V.z).add(new THREE.Vector3(0, 0, 3.4).applyAxisAngle(THREE.Object3D.DEFAULT_UP, V.yaw));
  }

  // What you see in your hands: a bag, or two, low on the left.
  _carried() {
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const m = bagMesh();
      m.scale.setScalar(0.55);
      m.position.set(-0.42 - i * 0.12, -0.5 + i * 0.05, -0.62 - i * 0.1);
      m.rotation.set(0.2, 0.6 + i * 0.4, 0.1);
      g.add(m);
    }
    g.visible = false;
    this.fx.vmScene?.add(g);
    return g;
  }

  clear() {
    for (const b of this.dropped) b.mesh.removeFromParent();
    this.dropped.length = 0;
    for (const q of this.props) q.mesh.removeFromParent();
    this.props.length = 0;
    if (this.cart) { this.cart.mesh.removeFromParent(); this.cart = null; }
    this.load = [];
    this.books = false;
    if (this.van) { this.van.removeFromParent(); this.van = null; }
    this.delivered = 0;
    this.found = 0;              // money picked up on the way: stashes, the safe (yours, not the client's)
    this.bonuses = [];           // [what, dollars]: the books handed in, the statue
    this.down = false;
    this.on = false;
    if (this.fx.player) this.fx.player.cargo = 1;
  }
}

// A canvas bag, tied at the neck, a dollar sign on it.
function bagMesh() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.95, map: dollar() });
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), cloth);
  sack.scale.set(1, 0.85, 0.8);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.16, 10), cloth);
  neck.position.y = 0.3;
  g.add(sack, neck);
  for (const m of g.children) m.castShadow = true;
  return g;
}

let _dollar = null;
function dollar() {
  if (_dollar) return _dollar;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#c8b890'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#2a4a2a'; g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('$', 32, 34);
  _dollar = new THREE.CanvasTexture(c);
  _dollar.colorSpace = THREE.SRGBColorSpace;
  return _dollar;
}

// The note with the vault's code, on the desk.
function paperMesh() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.004, 0.15), new THREE.MeshStandardMaterial({ color: 0xf4f0e2, roughness: 0.9 }));
  m.castShadow = true;
  return m;
}

// The trading books: three ledgers, stacked.
function booksMesh() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: i === 1 ? 0x5a1a14 : 0x16181a, roughness: 0.7 }));
    b.position.set((i - 1) * 0.01, 0.025 + i * 0.05, 0);
    b.rotation.y = (i - 1) * 0.08;
    g.add(b);
  }
  return g;
}

// A money cart: a steel trolley, a handle, room for six bags (shown as you load it).
function cartMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.4, metalness: 0.7 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 1.2), steel);
  bed.position.y = 0.35;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.04), steel);
  handle.position.set(0, 1.0, 0.6);
  const posts = [-0.38, 0.38].map((x) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.65, 0.04), steel); p.position.set(x, 0.68, 0.6); return p; });
  const wheels = [];
  for (const [x, z] of [[-0.35, -0.5], [0.35, -0.5], [-0.35, 0.5], [0.35, 0.5]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.09, z);
    wheels.push(w);
  }
  g.add(bed, handle, ...posts, ...wheels);
  const load = [];
  for (let i = 0; i < 6; i++) {
    const b = bagMesh();
    b.scale.setScalar(0.65);
    b.position.set(i % 2 ? 0.2 : -0.2, 0.55 + Math.floor(i / 4) * 0.35, -0.35 + (Math.floor(i / 2) % 2) * 0.4);
    b.visible = false;
    g.add(b);
    load.push(b);
  }
  g.userData.load = load;
  for (const m of g.children) m.castShadow = true;
  return g;
}
