import * as THREE from 'three';
import { assembly } from './kit.js';
import * as S from './furniture-shop.js';
import * as F from './furniture.js';
import * as E from './furniture-food.js';

// Shops: real ones, laid out the way a working shop is, after the owner's
// photograph of a café-bakery. A unit is three walls, a glazed front with its
// door and a sign over it, and inside, the shop: customers come in at the
// front, the counter faces them, staff work behind it, the stock is on the
// walls, the seats are together. Never furniture dropped in a room.
//
// A unit is built in its own frame: its front (the shop window, the door) at
// local z = +d/2 facing +z, its back wall at −d/2, x across. `yaw` turns that
// frame into the world. Everything in it is pieces, so it all breaks.
//
// Signs and chalkboard menus are text, drawn over their pieces as decals
// (`signs`), and go when the piece under them does.

const H = 3.6;                      // a shop's height, floor to ceiling

export const signs = {
  list: [],
  // After a job loads: a mesh for each sign.
  build(scene) {
    for (const s of this.list) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: text(s.text, s.style, s.w / s.h), transparent: true }));
      m.position.copy(s.at);
      m.rotation.y = s.yaw;
      scene.add(m);
      s.mesh = m;
    }
  },
  update() {
    for (const s of this.list) if (s.mesh && s.mesh.visible && s.piece.state !== 'static') s.mesh.visible = false;
  },
  clear() {
    for (const s of this.list) { if (s.mesh) { s.mesh.removeFromParent(); s.mesh.material.map.dispose(); s.mesh.material.dispose(); s.mesh.geometry.dispose(); } }
    this.list.length = 0;
  },
};

// Text on a sign or a chalkboard, painted on a canvas.
function text(lines, style, aspect) {
  const c = document.createElement('canvas');
  c.height = 128; c.width = Math.min(1024, Math.round(128 * aspect));
  const g = c.getContext('2d');
  if (style === 'chalk') {
    g.fillStyle = 'rgba(0,0,0,0)';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ece8dc';
    g.textAlign = 'center';
    g.font = '600 15px Georgia, serif';
    const ls = lines.split('\n');
    ls.forEach((l, i) => g.fillText(l, c.width / 2, 20 + i * (100 / ls.length)));
  } else {
    g.fillStyle = 'rgba(0,0,0,0)';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = style === 'gold' ? '#d8b25a' : '#f2ece0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${Math.round(c.height * 0.55)}px Georgia, serif`;
    g.fillText(lines, c.width / 2, c.height / 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Where people go in the shops, recorded as the shops are built, for
// sim/people.js: staff behind the counter and at the till, customers queuing,
// browsing the walls, sitting at the tables. Each faces the way a person there
// would. { kind: 'staff' | 'queue' | 'browse' | 'seat', x, y, z, yaw }
export const places = { list: [], clear() { this.list.length = 0; } };
const place = (kind, fr, x, z, ly = 0) => { const [wx, wz] = fr.at(x, z); places.list.push({ kind, x: wx, y: fr.y, z: wz, yaw: fr.yaw(ly) }); };

// The unit's frame: local (x, z) to the world, and a local yaw to a world one.
function frame(cx, y, cz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    at: (x, z) => [cx + x * c + z * s, cz - x * s + z * c],
    yaw: (ly = 0) => yaw + ly,
    y,
  };
}

// Place a builder `fn(P, x, y, z, yaw, ...args)` at local (x, z), facing local yaw `ly`.
const put = (P, fr, fn, x, z, ly, ...args) => { const [wx, wz] = fr.at(x, z); return fn(P, wx, fr.y, wz, fr.yaw(ly), ...args); };

// Three walls, the glazed front with its door, and the sign band over it.
// `door`: local x of the doorway's middle. `open`: the front is all doorway
// (a kiosk on a concourse) instead.
function shell(P, fr, w, d, { name, door = w / 2 - 1.1, open = false, wallTint = 0xece4d6, style = 'light', walls = [true, true, true], h: H = 3.6 } = {}) {
  const t = 0.1, parts = [];
  if (walls[0]) parts.push([-w / 2, 0, -d / 2, w / 2, H, -d / 2 + t]);            // back
  if (walls[1]) parts.push([-w / 2, 0, -d / 2, -w / 2 + t, H, d / 2]);            // left side
  if (walls[2]) parts.push([w / 2 - t, 0, -d / 2, w / 2, H, d / 2]);              // right side
  // Each wall its own piece: what hangs on a wall is fixed to that wall's face
  // (support.js), and three walls as one piece have the whole unit for a box.
  for (const box of parts) put(P, fr, (P2, x, y, z, yaw) => assembly(P2, x, y, z, yaw, [{ kind: 'plaster', boxes: [box], tint: wallTint }], 'wall', { structural: false }), 0, 0, 0);
  // The front: glass between slim black frames, a gap for the door.
  const top = 2.6;
  if (!open) {
    const glass = [], frames = [];
    const edges = [-w / 2, door - 0.8, door + 0.8, w / 2];
    for (const [a, b] of [[edges[0], edges[1]], [edges[2], edges[3]]]) {
      if (b - a < 0.2) continue;
      glass.push([a + 0.03, 0.08, d / 2 - 0.04, b - 0.03, top - 0.03, d / 2 - 0.02]);
      frames.push([a, 0, d / 2 - 0.07, a + 0.05, top, d / 2], [b - 0.05, 0, d / 2 - 0.07, b, top, d / 2], [a, 0, d / 2 - 0.07, b, 0.08, d / 2]);
    }
    put(P, fr, (P2, x, y, z, yaw) => assembly(P2, x, y, z, yaw, [
      { kind: 'clearglass', boxes: glass, tint: 0xe6f0ee },
      { kind: 'metal', boxes: frames, tint: 0x1a1a1a },
    ], 'glass', { structural: false }), 0, 0, 0);
  }
  // The fascia over the front, and the shop's name on it.
  const fascia = put(P, fr, (P2, x, y, z, yaw) => assembly(P2, x, y, z, yaw, [
    { kind: 'lacquer', boxes: [[-w / 2, top, d / 2 - 0.12, w / 2, H, d / 2]], tint: style === 'dark' ? 0x141414 : 0x2a2622 },
  ], 'wall', { structural: false }), 0, 0, 0);
  if (name) {
    const [sx, sz] = fr.at(0, d / 2 + 0.01);
    signs.list.push({ piece: fascia, text: name, style: style === 'gold' ? 'gold' : 'light', w: Math.min(w - 0.6, name.length * 0.42 + 0.6), h: 0.62, at: new THREE.Vector3(sx, fr.y + top + (H - top) / 2, sz), yaw: fr.yaw() });
  }
  return { top };
}

// A chalkboard with writing on it, on the back wall at local (x, height).
function menu(P, fr, x, z, h, lines, ly = 0) {
  const [wx, wz] = fr.at(x, z);
  const b = S.chalkboard(P, wx, fr.y + h, wz, fr.yaw(ly), 0.75, 0.95);
  const [sx, sz] = fr.at(x, z + 0.025);
  signs.list.push({ piece: b, text: lines, style: 'chalk', w: 0.7, h: 0.9, at: new THREE.Vector3(sx, fr.y + h + 0.45, sz), yaw: fr.yaw(ly) });
  return b;
}

// ---------------------------------------------------------------- a café-bakery

// After the photograph. Behind the front, a display counter across the shop
// with the till at its end; behind that the staff's side: the espresso bar on
// the back wall under the chalkboards, shelves of bread beside it, the tiled
// wall; a steel frame of shelving at the counter's open end with the pendant
// lamps over the counter; the seats on the other side, tables in a row along
// a banquette. `seats`: room for them inside (a kiosk has its tables outside).
export function cafe(P, cx, y, cz, yaw, w, d, { name = 'BAKER & BEAN', seats = true, walls, h = H } = {}) {
  const fr = frame(cx, y, cz, yaw);
  shell(P, fr, w, d, { name, walls, h, door: seats ? -w / 2 + 1.2 : w / 2 - 1.0 });
  const back = -d / 2 + 0.1;
  // The counter runs across in front of the staff's side, on the right; the
  // seats take the left.
  const cw = seats ? Math.min(w * 0.55, 3.6) : w - 1.2;
  const cxL = w / 2 - cw / 2 - 0.15;
  const counterZ = back + Math.min(2.1, d * 0.45);
  put(P, fr, S.displayCounter, cxL + 0.3, counterZ, 0, cw - 0.6);
  put(P, fr, S.till, cxL - cw / 2 + 0.5, counterZ, 0);
  // The back wall: tiled behind the espresso bar, the bar, the shelves.
  put(P, fr, (P2, x, yy, z, yaw) => assembly(P2, x, yy, z, yaw, [{ kind: 'tiles', boxes: [[-cw / 2, 0.9, 0, cw / 2, 2.4, 0.02]] }], 'cladding', { structural: false }), cxL, back + 0.01, 0);
  put(P, fr, S.espressoBar, cxL + 0.3, back + 0.35, 0, Math.min(2.4, cw - 0.8));
  put(P, fr, S.breadShelves, cxL - cw / 2 + 0.5, back + 0.4, 0, 0.9);
  menu(P, fr, cxL - 0.6, back + 0.03, 1.75, 'COFFEE\nespresso  2.50\nlatte  3.80\ncappuccino  3.60');
  menu(P, fr, cxL + 0.3, back + 0.03, 1.75, 'BAKERY\ncroissant  2.90\ncinnamon bun  3.20\nsourdough  6.50');
  menu(P, fr, cxL + 1.2, back + 0.03, 1.75, 'TODAY\ncarrot cake\nlemon tart\nbanana bread');
  // The steel frame at the counter's open end, and the pendants over the counter.
  put(P, fr, S.steelFrame, cxL - cw / 2 - 0.3, counterZ + 0.2, Math.PI / 2, 1.4, 3.3);
  for (let k = 0; k < 4; k++) { const [px, pz] = fr.at(cxL - cw / 2 + 0.5 + k * (cw - 1) / 3, counterZ); S.pendant(P, px, y + h, pz, 1.2); }
  // The seats.
  if (seats) {
    const left = -w / 2 + 0.6, room = w / 2 - cw - 0.6 - left;
    put(P, fr, S.banquette, -w / 2 + 0.35, 0, Math.PI / 2, Math.min(d - 1.6, 5));
    for (let z = -d / 2 + 1.2; z < d / 2 - 1.2; z += 1.5) {
      put(P, fr, S.woodTable, left + 0.75, z, 0);
      put(P, fr, S.woodChair, left + 1.45, z, -Math.PI / 2);
      place('seat', fr, left + 1.45, z, -Math.PI / 2);
      place('seat', fr, -w / 2 + 0.38, z, Math.PI / 2);
    }
    if (room > 2.2) for (let z = -d / 2 + 1.6; z < d / 2 - 1.6; z += 1.9) {
      put(P, fr, S.woodTable, left + room - 0.5, z, 0);
      put(P, fr, S.woodChair, left + room - 0.5, z - 0.62, 0);
      put(P, fr, S.woodChair, left + room - 0.5, z + 0.62, Math.PI);
      place('seat', fr, left + room - 0.5, z - 0.62, 0);
      place('seat', fr, left + room - 0.5, z + 0.62, Math.PI);
    }
  }
  // The till staff and the barista stand here; customers queue here and sit there.
  // The one at the till faces the customers; the barista faces the machine.
  place('staff', fr, cxL - cw / 2 + 0.5, counterZ - 0.7, 0);
  place('staff', fr, cxL + 0.4, back + 0.95, Math.PI);
  place('queue', fr, cxL - cw / 2 + 0.5, counterZ + 0.9, Math.PI);
  place('queue', fr, cxL - cw / 2 + 0.35, counterZ + 1.65, Math.PI);
  return {
    staff: [fr.at(cxL - cw / 2 + 0.5, counterZ - 0.7), fr.at(cxL + 0.4, back + 0.95)],
    queue: [fr.at(cxL - cw / 2 + 0.5, counterZ + 0.9), fr.at(cxL - cw / 2 + 0.3, counterZ + 1.7)],
    yaw: fr.yaw(),
  };
}

// ---------------------------------------------------------------- clothes

// A clothes shop: the window display beside the door, rails of clothes down
// one wall and shelves of folded things down the other, a table of jumpers in
// the middle, the fitting rooms and the cash desk at the back.
export function boutique(P, cx, y, cz, yaw, w, d, { name = 'MAISON', h = H, style = 'dark' } = {}) {
  const fr = frame(cx, y, cz, yaw);
  shell(P, fr, w, d, { name, h, style, door: w / 2 - 1.0 });
  const len = d - 1.9;
  put(P, fr, S.windowDisplay, -w / 4, d / 2 - 0.65, 0, Math.min(2.4, w / 2 - 0.4));
  put(P, fr, S.wallRail, -w / 2 + 0.52, -0.25, Math.PI / 2, len);
  put(P, fr, S.foldShelves, w / 2 - 0.52, -0.35, -Math.PI / 2, Math.min(len, 2.4));
  if (w > 4.2) put(P, fr, S.foldTable, 0, 0.15, 0);
  put(P, fr, S.fittingRooms, -w / 4, -d / 2 + 0.7, 0, 2);
  put(P, fr, S.cashDesk, w / 4, -d / 2 + 0.75, 0, 1.4);
  place('staff', fr, w / 4, -d / 2 + 0.25, 0);
  place('browse', fr, -w / 2 + 1.25, -0.2, -Math.PI / 2);
  place('browse', fr, w / 2 - 1.2, -0.5, Math.PI / 2);
  place('browse', fr, 0.1, 0.85, Math.PI);
  return { yaw: fr.yaw() };
}

// ---------------------------------------------------------------- shoes and bags

export function shoes(P, cx, y, cz, yaw, w, d, { name = 'STRIDE', h = H } = {}) {
  const fr = frame(cx, y, cz, yaw);
  shell(P, fr, w, d, { name, h, door: w / 2 - 1.0 });
  const len = d - 1.6;
  put(P, fr, S.shoeWall, -w / 2 + 0.45, -0.1, Math.PI / 2, len);
  put(P, fr, S.shoeWall, w / 2 - 0.45, -0.3, -Math.PI / 2, Math.min(len, 2.4));
  put(P, fr, S.shoeWall, -w / 4, -d / 2 + 0.45, 0, Math.min(2.4, w / 2 - 0.4));
  put(P, fr, S.bagCubes, -w / 4, d / 2 - 0.6, 0);
  put(P, fr, S.tryOnBench, -0.3, 0.1, 0);
  put(P, fr, S.cashDesk, w / 4, -d / 2 + 0.75, 0, 1.2);
  place('staff', fr, w / 4, -d / 2 + 0.25, 0);
  place('browse', fr, -w / 2 + 1.0, 0.4, -Math.PI / 2);
  place('seat', fr, -0.6, 0.1, 0);
  return { yaw: fr.yaw() };
}

// ---------------------------------------------------------------- jewellers and watches

// Lit vitrines round the walls, a glass island in the middle, and the counter
// at the back where a customer sits on a stool to be shown a ring.
export function jeweller(P, cx, y, cz, yaw, w, d, { name = 'AURUM', h = H } = {}) {
  const fr = frame(cx, y, cz, yaw);
  shell(P, fr, w, d, { name, h, style: 'gold', door: 0, wallTint: 0xe8dcc6 });
  const len = d - 1.4;
  put(P, fr, S.vitrine, -w / 2 + 0.45, -0.15, Math.PI / 2, len);
  put(P, fr, S.vitrine, w / 2 - 0.45, -0.15, -Math.PI / 2, len);
  put(P, fr, S.vitrine, 0, -d / 2 + 0.45, 0, Math.min(2.4, w - 2));
  put(P, fr, S.cashDesk, 0, -d / 2 + 1.35, 0, Math.min(2, w - 2.4));
  for (const sx of [-0.45, 0.45]) put(P, fr, E.barStool, sx, -d / 2 + 2.0, 0);
  if (d > 4) put(P, fr, E.jewelCase, 0, d / 2 - 1.1, 0);
  place('staff', fr, 0, -d / 2 + 0.85, 0);
  place('seat', fr, -0.45, -d / 2 + 2.0, Math.PI);
  place('browse', fr, -w / 2 + 1.1, 0.4, -Math.PI / 2);
  return { yaw: fr.yaw() };
}

// ---------------------------------------------------------------- souvenirs

export function souvenirs(P, cx, y, cz, yaw, w, d, { name = 'TOWER GIFTS', h = H } = {}) {
  const fr = frame(cx, y, cz, yaw);
  shell(P, fr, w, d, { name, h, style: 'gold', door: w / 2 - 1.0 });
  const len = d - 1.5;
  put(P, fr, S.souvenirWall, -w / 2 + 0.42, -0.2, Math.PI / 2, len);
  put(P, fr, S.souvenirWall, w / 2 - 0.42, -0.4, -Math.PI / 2, Math.min(len, 2.4));
  put(P, fr, S.souvenirWall, -w / 4, -d / 2 + 0.42, 0, Math.min(2.4, w / 2 - 0.4));
  put(P, fr, S.postcardSpinner, -0.4, 0.4, 0);
  put(P, fr, S.cashDesk, w / 4, -d / 2 + 0.8, 0, 1.4);
  place('staff', fr, w / 4, -d / 2 + 0.3, 0);
  place('browse', fr, -w / 2 + 1.0, 0, -Math.PI / 2);
  place('browse', fr, -0.4, 1.0, Math.PI);
  return { yaw: fr.yaw() };
}

// ---------------------------------------------------------------- the mall floors

// The tower's shop floors as a mall: a row of units along each long side,
// fronts onto the walkway round the core and the atrium, a column line
// between each, the flagship across the west end. Each floor its own mix.
// Returns where staff stand and customers browse (sim/people.js).
const BAYS = [[-14, -9.5], [-9.5, -5], [-5, 0], [0, 5], [5, 10], [15, 19.6]];
const NAMES = {
  boutique: ['MAISON', 'LINEA', 'VELOUR', 'ATELIER', 'NORTH & CO'],
  shoes: ['STRIDE', 'SOLE', 'CARRY'],
  jeweller: ['AURUM', 'CARAT', 'LUMEN', 'TEMPO WATCHES'],
  souvenirs: ['TOWER GIFTS'],
  cafe: ['BAKER & BEAN', 'CRUMB'],
};
export function mall(P, f, y, h, plan) {
  const build = { boutique, shoes, jeweller, souvenirs, cafe };
  const out = [];
  const count = {};
  const unit = (type, cx, cz, yaw, w, d) => {
    const n = (count[type] = (count[type] ?? -1) + 1);
    const name = NAMES[type][(n + f) % NAMES[type].length];
    out.push(build[type](P, cx, y, cz, yaw, w, d, { name, h, seats: true }));
  };
  // North row: backs to the north facade, fronts facing +z.
  plan.north.forEach((type, i) => { if (!type) return; const [a, b] = BAYS[i]; unit(type, (a + b) / 2, -9.5, 0, b - a - 0.8, 4.2); });
  // South row: fronts facing −z.
  plan.south.forEach((type, i) => { if (!type) return; const [a, b] = BAYS[i]; unit(type, (a + b) / 2, 9.5, Math.PI, b - a - 0.8, 4.2); });
  // The flagship, the whole west end, front facing +x.
  if (plan.west) unit(plan.west, -16.9, 0, Math.PI / 2, 12.8, 5.0);
  return out;
}
