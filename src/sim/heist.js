import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SITE } from '../site.js';

// The money, for a job that is a heist as well as a demolition (Big Boy Bank):
// the client wants the vault emptied as well as the tower down, so that there
// is nothing to build it again with.
//
// The money is on pallets in the vault (pieces tagged 'money'), a bag's worth
// each. E by a pallet fills a bag; you carry one at half your speed, two at a
// fifth. G puts one down, E picks it up again; die and you drop them. The
// getaway van waits in the street with its back doors open: walk up to it and
// the bags go in. With enough money in it — half the vault on Easy, more the
// harder the job — and the tower down, get in the van (E): the job is done.
// The van is the only way to finish.

export const BAG = 250000;                       // dollars a pallet, a bag
const NEED = { supereasy: 0.4, easy: 0.5, normal: 0.65, hard: 0.8, insane: 1 };
const SPEED = [1, 0.5, 0.2];                     // carrying none, one bag, two
const REACH = 1.9;
const _v = new THREE.Vector3();

export class Heist {
  constructor(fx) {
    this.fx = fx;                                // { scene, vmScene, pieces, player, input, hud, audio }
    this.on = false;
    this.bags = 0;
    this.delivered = 0;
    this.dropped = [];
    this.van = null;
    this._carry = this._carried();
  }

  // A new job: on for a heist, with the van parked and the vault counted.
  reset(job, level) {
    this.clear();
    this.on = !!job.heist && !level.creative;
    if (!this.on) return;
    this.pallets = this.fx.pieces.list.filter((p) => p.tag === 'money');
    this.total = this.pallets.length * BAG;
    this.need = Math.round(this.pallets.length * (NEED[level.id] ?? 0.65)) * BAG;
    this._buildVan();
  }

  get carrying() { return this.bags; }

  // Each frame in play. `towerDown`: the job's height is met. Returns a tip
  // for the HUD, or null.
  update(dt, towerDown) {
    const { player, input, hud, audio } = this.fx;
    this._carry.visible = this.bags > 0;
    this._carry.children[1].visible = this.bags > 1;
    if (!this.on) { player.cargo = 1; return null; }
    player.cargo = SPEED[this.bags];
    if (player.dead) { if (this.bags) this._drop(this.bags); return null; }
    let tip = null;
    // A pallet, or a bag on the floor, in reach.
    if (this.bags < 2) {
      const bag = this.dropped.find((b) => b.mesh.position.distanceTo(player.pos) < REACH);
      const pallet = bag ? null : this.pallets.find((p) => p.state === 'static' && p.box.distanceToPoint(_v.copy(player.pos).setY(player.pos.y + 0.5)) < REACH);
      if (bag || pallet) {
        tip = bag ? 'E — pick up the bag' : `E — fill a bag ($${(BAG / 1000) | 0},000)`;
        if (input.pressed('KeyE')) {
          if (bag) { bag.mesh.removeFromParent(); this.dropped.splice(this.dropped.indexOf(bag), 1); }
          else { this.fx.pieces.destroy(pallet); audio?.flutter?.(player.pos.x, player.pos.y, player.pos.z, 3); }
          this.bags++;
          hud?.flash(this.bags > 1 ? 'Two bags: you can barely move' : 'A bag of money', 1.5);
        }
      }
    }
    if (this.bags && input.pressed('KeyG')) this._drop(1);
    // The van: the bags go in the back; with enough in it and the tower down, get in.
    const back = this._back();
    const d = back.distanceTo(_v.set(player.pos.x, 0, player.pos.z));
    if (d < 3.2) {
      if (this.bags) {
        this.delivered += this.bags * BAG;
        hud?.flash(`In the van: $${this.money(this.delivered)} of $${this.money(this.need)}`, 2);
        audio?.thud?.(back.x, 1, back.z);
        this.bags = 0;
      }
      if (this.delivered < this.need) tip = `The client wants $${this.money(this.need - this.delivered)} more in the van`;
      else if (!towerDown) tip = 'The money is in. Now bring the glass tower down';
      else {
        tip = 'E — get in the van';
        if (input.pressed('KeyE')) { this.fx.onEscape?.(); }
      }
    }
    return tip;
  }

  // For the HUD's objective line.
  get status() {
    if (!this.on) return '';
    return `$${this.money(this.delivered)} of $${this.money(this.need)} in the van${this.bags ? ` · carrying ${this.bags} bag${this.bags > 1 ? 's' : ''}` : ''}`;
  }

  money(n) { return n >= 1e6 ? `${(n / 1e6).toFixed(n % 1e6 ? 2 : 0)}M` : `${(n / 1000) | 0}k`; }

  // Put bags down where you stand.
  _drop(n) {
    const { player, scene } = this.fx;
    for (let i = 0; i < n && this.bags > 0; i++) {
      const m = bagMesh();
      m.position.set(player.pos.x + (Math.random() - 0.5) * 0.6, player.pos.y + 0.25, player.pos.z + (Math.random() - 0.5) * 0.6);
      m.rotation.y = Math.random() * Math.PI;
      scene.add(m);
      this.dropped.push({ mesh: m });
      this.bags--;
    }
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
    if (this.van) { this.van.removeFromParent(); this.van = null; }
    this.bags = 0;
    this.delivered = 0;
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
