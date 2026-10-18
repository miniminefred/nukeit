import { assembly } from './kit.js';

// What a café-bakery is fitted with, after the owner's photograph: a glass
// display counter of cakes and pastries, the till, an espresso machine on the
// back counter with cups stacked by it, shelves of loaves and jars on the back
// wall, chalkboard menus over it, an open frame of black steel shelving with
// pendant bulbs hanging over the counter, wooden tables and chairs.
//
// Every one faces +z at yaw 0: that is where the customers stand.
//
// Each shop has its own look: `style` holds the colours of the one being
// fitted (shops.js sets it per unit) — its wood, its counters and desks, its
// shelving, its upholstery — so no two shops are the same.
export const style = { wood: null, body: null, board: null, seat: null };
const T = (k, d) => style[k] ?? d;


// The display counter: a wooden base, a glass case on it with two shelves of
// cakes and pastries, the top a slab of stone for the till and the tongs.
export function displayCounter(P, x, y, z, yaw, len = 2.4) {
  const cakes = [];
  let n = 0;
  for (const [sy, sz] of [[0.92, 0.12], [1.12, -0.05]]) for (let cx = -len / 2 + 0.2; cx < len / 2 - 0.15; cx += 0.26) {
    const round = n % 3 !== 0;
    cakes.push(round ? { cyl: [cx, sy + 0.04, sz], r: 0.09, h: 0.08, seg: 12 } : { ball: [cx, sy + 0.03, sz], s: [0.08, 0.04, 0.05], rough: 0.3 });
    n++;
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-len / 2, 0, -0.3, len / 2, 0.86, 0.32]], tint: T('wood', 0x6a4a30) },
    { kind: 'marble', round: 0.01, boxes: [[-len / 2 - 0.02, 0.86, -0.32, len / 2 + 0.02, 0.9, 0.34]], tint: 0xeee8de },
    { kind: 'clearglass', boxes: [[-len / 2, 0.9, 0.3, len / 2, 1.32, 0.33], [-len / 2, 1.3, -0.3, len / 2, 1.32, 0.33], [-len / 2, 0.9, -0.3, -len / 2 + 0.02, 1.32, 0.33], [len / 2 - 0.02, 0.9, -0.3, len / 2, 1.32, 0.33]], tint: 0xe6f0ee },
    { kind: 'metal', boxes: [[-len / 2 + 0.05, 1.08, -0.28, len / 2 - 0.05, 1.095, 0.28]], tint: 0xc0c4c8 },
    // Pastries golden and glazed; the cream cakes white.
    { kind: 'leather', boxes: cakes.filter((_, i) => i % 3 !== 2), tint: 0xd09048 },
    { kind: 'plaster', boxes: cakes.filter((_, i) => i % 3 === 2), tint: 0xfaf2e4 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.32, len / 2, 1.32, 0.34]] });
}

// The till, and a card reader by it.
export function till(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', round: 0.01, boxes: [[-0.17, 0, -0.14, 0.17, 0.08, 0.14], [-0.15, 0.08, -0.12, 0.15, 0.3, -0.1]], tint: 0x1a1a1a },
    { kind: 'screen', boxes: [[-0.13, 0.11, -0.1, 0.13, 0.28, -0.095]] },
    { kind: 'plastic', round: 0.005, boxes: [[0.22, 0, 0.0, 0.3, 0.03, 0.14]], tint: 0x2a2a2a },
  ], 'furniture', { colliders: [[-0.17, 0, -0.14, 0.3, 0.3, 0.14]] });
}

// The back counter: cupboards under a steel top, the espresso machine on it,
// a grinder, cups stacked, a jug.
export function espressoBar(P, x, y, z, yaw, len = 2.4) {
  const cups = [];
  for (let k = 0; k < 4; k++) cups.push({ cyl: [len / 2 - 0.3, 0.97 + k * 0.07, 0], r: 0.045, r2: 0.035, h: 0.065, seg: 10 }, { cyl: [len / 2 - 0.42, 0.97 + k * 0.07, 0.05], r: 0.045, r2: 0.035, h: 0.065, seg: 10 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-len / 2, 0, -0.3, len / 2, 0.9, 0.3]], tint: T('body', 0x3a3e44) },
    { kind: 'steel', boxes: [[-len / 2 - 0.02, 0.9, -0.31, len / 2 + 0.02, 0.94, 0.32]], tint: 0xc8ccd0 },
    // The machine: a steel body, its group heads and the drip tray.
    { kind: 'steel', round: 0.03, boxes: [[-0.45, 0.94, -0.28, 0.35, 1.42, 0.12], [-0.4, 0.94, 0.12, 0.3, 0.98, 0.28]], tint: 0xd8dade },
    { kind: 'plastic', boxes: [{ cyl: [-0.25, 1.12, 0.17], r: 0.035, h: 0.08, seg: 10 }, { cyl: [0.1, 1.12, 0.17], r: 0.035, h: 0.08, seg: 10 }, { cyl: [0.5, 1.1, 0], r: 0.07, h: 0.32, seg: 12 }, { cone: [0.5, 1.33, 0], r: 0.09, h: 0.14, seg: 12 }], tint: 0x1a1a1a },
    { kind: 'ceramic', boxes: cups, tint: 0xf4f2ee },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.32, len / 2, 1.42, 0.32]] });
}

// A wall of shelves: loaves on the lower boards, jars and tins higher up.
export function breadShelves(P, x, y, z, yaw, len = 2.2) {
  const boards = [], loaves = [], jars = [];
  for (const sy of [0.45, 0.9, 1.35, 1.8]) boards.push([-len / 2, sy, -0.35, len / 2, sy + 0.03, 0]);
  let i = 0;
  for (const sy of [0.48, 0.93]) for (let bx = -len / 2 + 0.2; bx < len / 2 - 0.1; bx += 0.32) { loaves.push({ ball: [bx, sy + 0.07, -0.17], s: [0.15, 0.07, 0.1], rough: 0.15 }); i++; }
  for (const sy of [1.38, 1.83]) for (let bx = -len / 2 + 0.15; bx < len / 2 - 0.1; bx += 0.18) jars.push({ cyl: [bx, sy + 0.08, -0.15], r: 0.055, h: 0.16, seg: 10 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-len / 2, 0, -0.38, -len / 2 + 0.04, 2.2, 0], [len / 2 - 0.04, 0, -0.38, len / 2, 2.2, 0], [-len / 2, 0, -0.38, len / 2, 2.2, -0.35], ...boards], tint: T('wood', 0x8a6a48) },
    { kind: 'leather', boxes: loaves, tint: 0xb87a3a },
    { kind: 'clearglass', boxes: jars, tint: 0xd8c08a },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.38, len / 2, 2.2, 0]] });
}

// A chalkboard menu, hung on the wall (its writing is drawn over it: shops.js).
export function chalkboard(P, x, y, z, yaw, w = 0.7, h = 0.9) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-w / 2 - 0.03, -0.03, -0.03, w / 2 + 0.03, h + 0.03, 0]], tint: 0x5a3a22 },
    { kind: 'lacquer', boxes: [[-w / 2, 0, 0, w / 2, h, 0.01]], tint: 0x1c201e },
  ], 'cladding', { structural: false });
}

// The open frame of black steel at the front of the counter: posts, boards of
// goods, and the bar the pendant lamps hang from.
export function steelFrame(P, x, y, z, yaw, len = 1.8, h = 3.2) {
  const goods = [];
  for (const sy of [0.75, 1.25]) for (let gx = -len / 2 + 0.15; gx < len / 2 - 0.1; gx += 0.22) goods.push({ cyl: [gx, sy + 0.08, 0], r: 0.06, h: 0.16, seg: 10 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', boxes: [[-len / 2, 0, -0.2, -len / 2 + 0.04, h, -0.16], [len / 2 - 0.04, 0, -0.2, len / 2, h, -0.16], [-len / 2, 0, 0.16, -len / 2 + 0.04, h, 0.2], [len / 2 - 0.04, 0, 0.16, len / 2, h, 0.2],
      [-len / 2, h - 0.04, -0.2, len / 2, h, 0.2], [-len / 2, 0.72, -0.2, len / 2, 0.75, 0.2], [-len / 2, 1.22, -0.2, len / 2, 1.25, 0.2]], tint: 0x161616 },
    { kind: 'plastic', boxes: goods.filter((_, i) => i % 2), tint: 0xc8a050 },
    { kind: 'ceramic', boxes: goods.filter((_, i) => !(i % 2)), tint: 0xeae4d8 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.2, len / 2, h, 0.2]] });
}

// A pendant: a cable from the ceiling and a bare warm bulb.
export function pendant(P, x, yTop, z, drop = 1.1) {
  return assembly(P, x, yTop, z, 0, [
    { kind: 'plastic', boxes: [{ cyl: [0, -drop / 2, 0], r: 0.006, h: drop, seg: 5 }, { cyl: [0, -drop - 0.03, 0], r: 0.025, h: 0.06, seg: 8 }], tint: 0x111111 },
    { kind: 'lamp', boxes: [{ ball: [0, -drop - 0.1, 0], s: [0.06, 0.08, 0.06], rough: 0, detail: 1 }] },
  ], 'lamp', { hang: true });
}

// A square café table of oak on a black steel foot, and its chairs.
export function woodTable(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'wood', round: 0.01, boxes: [[-0.36, 0.72, -0.36, 0.36, 0.76, 0.36]], tint: T('wood', 0xb08a5a) },
    { kind: 'metal', boxes: [{ cyl: [0, 0.36, 0], r: 0.03, h: 0.72, seg: 8 }, [-0.25, 0, -0.04, 0.25, 0.03, 0.04], [-0.04, 0, -0.25, 0.04, 0.03, 0.25]], tint: 0x161616 },
  ], 'furniture', { colliders: [[-0.36, 0, -0.36, 0.36, 0.76, 0.36]] });
}

export function woodChair(P, x, y, z, yaw) {
  const legs = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.17], [0.18, 0.17]].map(([a, c]) => ({ cyl: [a, 0.22, c], r: 0.017, h: 0.44, seg: 6 }));
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-0.21, 0.44, -0.21, 0.21, 0.48, 0.2], [-0.2, 0.5, -0.24, 0.2, 0.86, -0.2], ...legs], tint: T('wood', 0xc8a272) },
  ], 'furniture', { colliders: [[-0.22, 0, -0.24, 0.22, 0.86, 0.21]] });
}

// A cushioned bench along a wall, for the tables in a row in front of it.
export function banquette(P, x, y, z, yaw, len = 3) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-len / 2, 0, -0.25, len / 2, 0.42, 0.25]], tint: 0x5a3a22 },
    { kind: 'leather', round: 0.05, boxes: [[-len / 2 + 0.03, 0.42, -0.22, len / 2 - 0.03, 0.5, 0.22], [-len / 2 + 0.03, 0.5, -0.25, len / 2 - 0.03, 1.0, -0.13]], tint: T('seat', 0x6a5040) },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.25, len / 2, 1.0, 0.25]] });
}

// ---------------------------------------------------------------- clothes, shoes, jewels, souvenirs

const CLOTH = [0x1a1a1a, 0xe8e4dc, 0x2a3a5a, 0x7a1e22, 0xc8b49a, 0x3a4a3a, 0x8a8a8a, 0xd8c0a0];
const group = (map, key, item) => (map.get(key) ?? map.set(key, []).get(key)).push(item);

// A wall rail of clothes on hangers: a chrome bar on brackets, garments hanging
// from it, each a soft slab of its colour, shoulders to hem.
export function wallRail(P, x, y, z, yaw, len = 2.4, high = 1.75) {
  // Brackets from the wall (local z = −0.42) out to the bar; the clothes hang in front.
  const bar = [[-len / 2, high, -0.25, len / 2, high + 0.03, -0.22], [-len / 2, high - 0.2, -0.42, -len / 2 + 0.03, high + 0.03, -0.22], [len / 2 - 0.03, high - 0.2, -0.42, len / 2, high + 0.03, -0.22]];
  const byColour = new Map();
  let i = 0;
  for (let gx = -len / 2 + 0.12; gx < len / 2 - 0.08; gx += 0.07) {
    const long = (i % 7) < 2;
    group(byColour, CLOTH[(i * 5 + Math.floor(i / 4)) % CLOTH.length], [gx - 0.015, high - (long ? 1.15 : 0.75), -0.38, gx + 0.015, high - 0.04, -0.09]);
    i++;
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', boxes: bar, tint: 0xd0d4d8 },
    ...[...byColour].map(([tint, boxes]) => ({ kind: 'fabric', round: 0.01, boxes, tint })),
  ], 'cladding', { structural: false, colliders: [[-len / 2, high - 1.15, -0.42, len / 2, high + 0.03, -0.09]] });   // fixed to the wall behind it
}

// Shelves on the wall with folded clothes stacked on them.
export function foldShelves(P, x, y, z, yaw, len = 1.8) {
  const boards = [], stacks = new Map();
  let i = 0;
  for (const sy of [0.3, 0.75, 1.2, 1.65]) {
    boards.push([-len / 2, sy, -0.4, len / 2, sy + 0.025, 0]);
    for (let sx = -len / 2 + 0.2; sx < len / 2 - 0.1; sx += 0.36) {
      group(stacks, CLOTH[(i * 3 + 1) % CLOTH.length], [sx - 0.14, sy + 0.025, -0.33, sx + 0.14, sy + 0.025 + 0.1 + (i % 3) * 0.04, -0.06]);
      i++;
    }
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-len / 2, 0, -0.42, len / 2, 2.0, -0.4], ...boards], tint: T('board', 0xe8e0d0) },
    ...[...stacks].map(([tint, boxes]) => ({ kind: 'fabric', round: 0.01, boxes, tint })),
  ], 'furniture', { colliders: [[-len / 2, 0, -0.42, len / 2, 2.0, 0]] });
}

// A low table in the middle of the floor with folded jumpers on it.
export function foldTable(P, x, y, z, yaw) {
  const piles = [];
  for (const [px, pz] of [[-0.35, -0.2], [0.05, -0.2], [0.45, -0.2], [-0.35, 0.2], [0.05, 0.2], [0.45, 0.2]]) piles.push([px - 0.14, 0.74, pz - 0.12, px + 0.14, 0.86, pz + 0.12]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-0.7, 0.7, -0.4, 0.7, 0.74, 0.4], [-0.66, 0, -0.36, 0.66, 0.7, 0.36]], tint: 0xb8946a },
    { kind: 'fabric', round: 0.01, boxes: piles.slice(0, 3), tint: 0xc8b49a },
    { kind: 'fabric', round: 0.01, boxes: piles.slice(3), tint: 0x2a3a5a },
  ], 'furniture', { colliders: [[-0.7, 0, -0.4, 0.7, 0.86, 0.4]] });
}

// A mannequin in a coat or a dress.
export function dressed(P, x, y, z, yaw, coat = 0x2a3a5a) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', round: 0.02, boxes: [{ ball: [0, 1.62, 0], s: [0.1, 0.12, 0.1], rough: 0 }, { cyl: [0, 0.05, 0], r: 0.18, h: 0.03, seg: 14 }, { cyl: [0, 0.45, 0], r: 0.015, h: 0.85, seg: 6 }], tint: 0xf0ece4 },
    { kind: 'fabric', round: 0.04, boxes: [{ cyl: [0, 1.18, 0], r: 0.2, r2: 0.17, h: 0.62, seg: 12 }, { cyl: [0, 0.75, 0], r: 0.24, r2: 0.2, h: 0.3, seg: 12 }, { cyl: [-0.23, 1.2, 0], r: 0.05, h: 0.55, seg: 6 }, { cyl: [0.23, 1.2, 0], r: 0.05, h: 0.55, seg: 6 }], tint: coat },
  ], 'furniture', { colliders: [[-0.25, 0, -0.2, 0.25, 1.75, 0.2]] });
}

// The window display: a low plinth, and two mannequins standing on it, dressed.
export function windowDisplay(P, x, y, z, yaw, len = 2.2) {
  assembly(P, x, y, z, yaw, [{ kind: 'plaster', round: 0.01, boxes: [[-len / 2, 0, -0.4, len / 2, 0.15, 0.4]], tint: 0xfaf8f2 }], 'furniture', { colliders: [[-len / 2, 0, -0.4, len / 2, 0.15, 0.4]] });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  [-len / 4, len / 4].forEach((lx, k) => dressed(P, x + lx * c, y + 0.15, z - lx * s, yaw, CLOTH[(k * 3 + 3) % CLOTH.length]));
}

// A cash desk: a counter with the till on it, tissue paper for wrapping.
export function cashDesk(P, x, y, z, yaw, len = 1.6) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-len / 2, 0, -0.3, len / 2, 0.95, 0.3]], tint: T('body', 0x2a2420) },
    { kind: 'marble', round: 0.01, boxes: [[-len / 2 - 0.02, 0.95, -0.32, len / 2 + 0.02, 0.99, 0.32]], tint: 0xeee8de },
    { kind: 'plastic', round: 0.01, boxes: [[0.2, 0.99, -0.15, 0.5, 1.07, 0.1], [0.22, 1.07, -0.12, 0.48, 1.3, -0.1]], tint: 0x1a1a1a },
    { kind: 'paper', boxes: [[-len / 2 + 0.1, 0.99, -0.2, -len / 2 + 0.5, 1.01, 0.2]], tint: 0xe8dcc8 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.32, len / 2, 1.3, 0.32]] });
}

// Fitting rooms: cubicles along the back, curtains half drawn, a long mirror in one.
export function fittingRooms(P, x, y, z, yaw, n = 2) {
  const walls = [], curtains = [];
  for (let k = 0; k <= n; k++) walls.push([-n * 0.55 + k * 1.1 - 0.04, 0, -0.6, -n * 0.55 + k * 1.1 + 0.04, 2.2, 0.6]);
  for (let k = 0; k < n; k++) curtains.push([-n * 0.55 + k * 1.1 + 0.05, 0.15, 0.55, -n * 0.55 + k * 1.1 + 0.6, 2.1, 0.6]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'plaster', boxes: walls, tint: 0xece4d6 },
    { kind: 'fabric', round: 0.02, boxes: curtains, tint: 0x6a1a22 },
    { kind: 'mirror', boxes: [[-n * 0.55 + 0.1, 0.3, -0.58, -n * 0.55 + 0.9, 2.0, -0.56]] },
  ], 'furniture', { colliders: [[-n * 0.55 - 0.05, 0, -0.6, n * 0.55 + 0.05, 2.2, 0.6]] });
}

// A wall of shoes: shelves, a pair on each, in leather and canvas.
export function shoeWall(P, x, y, z, yaw, len = 2.2) {
  const boards = [], shoes = new Map();
  let i = 0;
  for (const sy of [0.25, 0.6, 0.95, 1.3, 1.65]) {
    boards.push([-len / 2, sy, -0.32, len / 2, sy + 0.02, 0]);
    for (let sx = -len / 2 + 0.18; sx < len / 2 - 0.1; sx += 0.3) {
      const c = [0x2a1a10, 0x111111, 0xe8e4dc, 0x7a3a22, 0xb89a6a, 0x1a2a4a][(i * 5) % 6];
      for (const d of [-0.05, 0.05]) group(shoes, c, { ball: [sx + d, sy + 0.06, -0.15], s: [0.04, 0.045, 0.12], rough: 0.1 });
      i++;
    }
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-len / 2, 0, -0.34, len / 2, 2.0, -0.32], ...boards], tint: T('board', 0xd8cfc0) },
    ...[...shoes].map(([tint, boxes]) => ({ kind: 'leather', boxes, tint })),
  ], 'furniture', { colliders: [[-len / 2, 0, -0.34, len / 2, 2.0, 0]] });
}

// Handbags on display cubes of different heights.
export function bagCubes(P, x, y, z, yaw) {
  const cubes = [], bags = [];
  for (const [cx, h] of [[-0.6, 0.9], [0, 1.2], [0.6, 0.7]]) {
    cubes.push([cx - 0.25, 0, -0.25, cx + 0.25, h, 0.25]);
    bags.push([cx - 0.16, h, -0.07, cx + 0.16, h + 0.22, 0.07], { cylX: [cx, h + 0.3, 0], r: 0.09, h: 0.02, seg: 10 });
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'plaster', round: 0.01, boxes: cubes, tint: 0xfaf8f2 },
    { kind: 'leather', round: 0.03, boxes: bags, tint: 0x8a2a1a },
  ], 'furniture', { colliders: [[-0.85, 0, -0.25, 0.85, 1.5, 0.25]] });
}

// A low leather bench to try shoes on, and its floor mirror.
export function tryOnBench(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'leather', round: 0.05, boxes: [[-0.7, 0.2, -0.25, 0.7, 0.45, 0.25]], tint: T('seat', 0x6a5040) },
    { kind: 'metal', boxes: [[-0.65, 0, -0.2, -0.6, 0.2, 0.2], [0.6, 0, -0.2, 0.65, 0.2, 0.2]], tint: 0x1a1a1a },
    { kind: 'mirror', boxes: [[1.0, 0.05, -0.02, 1.4, 0.65, 0.0]] },
  ], 'furniture', { colliders: [[-0.7, 0, -0.25, 1.4, 0.65, 0.25]] });
}

// A jeweller's wall vitrine: a lit glass cabinet, trays of gold and stones.
export function vitrine(P, x, y, z, yaw, len = 1.6) {
  const trays = [], gold = [], stones = [];
  for (const sy of [1.0, 1.35, 1.7]) {
    trays.push([-len / 2 + 0.05, sy, -0.3, len / 2 - 0.05, sy + 0.03, 0]);
    for (let gx = -len / 2 + 0.2; gx < len / 2 - 0.1; gx += 0.22) {
      gold.push({ cyl: [gx, sy + 0.06, -0.15], r: 0.035, h: 0.012, seg: 12 });
      stones.push({ ball: [gx + 0.08, sy + 0.05, -0.1], s: [0.012, 0.012, 0.012], rough: 0, detail: 1 });
    }
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-len / 2, 0, -0.35, len / 2, 0.9, 0], [-len / 2, 2.1, -0.35, len / 2, 2.25, 0]], tint: T('wood', 0x2a1a12) },
    { kind: 'leather', boxes: trays, tint: 0x1a2a3a },
    { kind: 'clearglass', boxes: [[-len / 2, 0.9, -0.01, len / 2, 2.1, 0]] },
    { kind: 'gold', boxes: gold },
    { kind: 'clearglass', boxes: stones, tint: 0xd8ecff },
    { kind: 'lamp', boxes: [[-len / 2 + 0.05, 2.06, -0.3, len / 2 - 0.05, 2.08, -0.05]] },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.35, len / 2, 2.25, 0]] });
}

// Souvenirs: a wall of caps and T-shirts, shelves of mugs and snow globes.
export function souvenirWall(P, x, y, z, yaw, len = 2.4) {
  const caps = [], shirts = [], mugs = [], globes = [], boards = [];
  for (let gx = -len / 2 + 0.2; gx < len / 2 - 0.1; gx += 0.3) {
    caps.push({ ball: [gx, 1.9, -0.06], s: [0.1, 0.06, 0.1], rough: 0 }, [gx - 0.08, 1.86, -0.02, gx + 0.08, 1.87, 0.06]);
    shirts.push([gx - 0.13, 1.25, -0.04, gx + 0.13, 1.6, -0.02]);
  }
  for (const sy of [0.45, 0.85]) {
    boards.push([-len / 2, sy, -0.3, len / 2, sy + 0.02, 0]);
    for (let gx = -len / 2 + 0.15; gx < len / 2 - 0.1; gx += 0.16) {
      if (sy < 0.6) mugs.push({ cyl: [gx, sy + 0.07, -0.15], r: 0.045, h: 0.1, seg: 10 });
      else globes.push({ ball: [gx, sy + 0.08, -0.15], s: [0.05, 0.05, 0.05], rough: 0, detail: 1 });
    }
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-len / 2, 0, -0.32, len / 2, 2.1, -0.3], ...boards], tint: T('board', 0x1a2236) },
    { kind: 'fabric', round: 0.02, boxes: caps, tint: 0xb01c22 },
    { kind: 'fabric', boxes: shirts, tint: 0xf2f0ea },
    { kind: 'ceramic', boxes: mugs, tint: 0xf4f2ee },
    { kind: 'clearglass', boxes: globes, tint: 0xe8f4ff },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.32, len / 2, 2.1, 0]] });
}

// A spinning rack of postcards.
export function postcardSpinner(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'steel', boxes: [{ cyl: [0, 0.8, 0], r: 0.02, h: 1.6, seg: 8 }, { cyl: [0, 0.02, 0], r: 0.25, h: 0.04, seg: 12 }], tint: 0x8a8e92 },
    { kind: 'paper', boxes: [[-0.25, 0.6, -0.25, 0.25, 1.5, -0.24], [-0.25, 0.6, 0.24, 0.25, 1.5, 0.25], [-0.25, 0.6, -0.25, -0.24, 1.5, 0.25], [0.24, 0.6, -0.25, 0.25, 1.5, 0.25]], tint: 0xe8d8c0 },
  ], 'furniture', { colliders: [[-0.25, 0, -0.25, 0.25, 1.6, 0.25]] });
}


// ---------------------------------------------------------------- the things that make each shop its own

// A framed picture on a wall: a frame, and a canvas of a few colours.
export function picture(P, x, y, z, yaw, w = 0.8, h = 0.6, colours = [0xc8a070, 0x2a4a6a, 0xe8e0d0]) {
  const bands = colours.map((c, i) => ({ kind: 'plaster', boxes: [[-w / 2 + 0.04, 0.04 + i * (h - 0.08) / colours.length, 0.01, w / 2 - 0.04, 0.04 + (i + 1) * (h - 0.08) / colours.length, 0.02]], tint: c }));
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-w / 2, 0, 0, w / 2, h, 0.015]], tint: T('wood', 0x3a2a1a) },
    ...bands,
  ], 'cladding', { structural: false });
}

// A round mirror on a wall, in a thin brass ring.
export function roundMirror(P, x, y, z, yaw, r = 0.4) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'brass', boxes: [{ cylZ: [0, r, 0.008], r, h: 0.016, seg: 24 }] },
    { kind: 'mirror', boxes: [{ cylZ: [0, r, 0.018], r: r - 0.03, h: 0.006, seg: 24 }] },
  ], 'cladding', { structural: false });
}

// A counter along the shop window, stools facing the street.
export function windowBar(P, x, y, z, yaw, len = 2.4) {
  const stools = [];
  for (let sx = -len / 2 + 0.35; sx < len / 2 - 0.2; sx += 0.6) stools.push({ cyl: [sx, 0.38, -0.45], r: 0.025, h: 0.76, seg: 8 }, { cyl: [sx, 0.77, -0.45], r: 0.17, h: 0.05, seg: 14 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-len / 2, 1.02, -0.2, len / 2, 1.06, 0.15]], tint: T('wood', 0xb08a5a) },
    { kind: 'metal', boxes: [[-len / 2 + 0.05, 0, 0.05, -len / 2 + 0.09, 1.02, 0.1], [len / 2 - 0.09, 0, 0.05, len / 2 - 0.05, 1.02, 0.1], ...stools], tint: 0x161616 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.6, len / 2, 1.06, 0.15]] });
}

// Cups and saucers and a plate with a pastry, on a table top at height `top`.
export function tableware(P, x, y, z, yaw, top = 0.76) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'ceramic', boxes: [{ cyl: [-0.12, top + 0.005, 0.06], r: 0.07, h: 0.01, seg: 14 }, { cyl: [-0.12, top + 0.045, 0.06], r: 0.04, r2: 0.032, h: 0.07, seg: 12 }, { cyl: [0.12, top + 0.006, -0.06], r: 0.1, h: 0.012, seg: 16 }], tint: 0xf6f4ee },
    { kind: 'leather', boxes: [{ ball: [0.12, top + 0.035, -0.06], s: [0.06, 0.025, 0.04], rough: 0.2 }], tint: 0xd09048 },
  ], 'furniture', {});
}

// A model of the tower on a plinth, for the gift shop window.
export function towerModel(P, x, y, z, yaw) {
  const steps = [];
  for (let k = 0; k < 6; k++) steps.push([-0.18 + k * 0.012, 0.75 + k * 0.12, -0.12 + k * 0.01, 0.18 - k * 0.02, 0.87 + k * 0.12, 0.12 - k * 0.01]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'plaster', round: 0.01, boxes: [[-0.3, 0, -0.3, 0.3, 0.75, 0.3]], tint: 0xf4f0e8 },
    { kind: 'bronze', boxes: [[-0.25, 0.75, -0.2, 0.25, 0.85, 0.2], ...steps] },
    { kind: 'gold', boxes: [[-0.2, 0.75, 0.2, 0.2, 0.8, 0.22]] },
  ], 'furniture', { colliders: [[-0.3, 0, -0.3, 0.3, 1.5, 0.3]] });
}

// A rack of tote bags and scarves.
export function toteRack(P, x, y, z, yaw) {
  const bags = [];
  [0xb01c22, 0xf2f0ea, 0x1a2236, 0xc9a043].forEach((c, i) => bags.push({ kind: 'fabric', boxes: [[-0.45 + i * 0.3, 0.9, 0.02, -0.25 + i * 0.3, 1.35, 0.05]], tint: c }));
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', boxes: [{ cyl: [-0.55, 0.75, 0], r: 0.02, h: 1.5, seg: 6 }, { cyl: [0.55, 0.75, 0], r: 0.02, h: 1.5, seg: 6 }, { cylX: [0, 1.42, 0], r: 0.015, h: 1.1, seg: 6 }, [-0.6, 0, -0.15, 0.6, 0.03, 0.15]], tint: 0x2a2a2a },
    ...bags,
  ], 'furniture', { colliders: [[-0.6, 0, -0.15, 0.6, 1.5, 0.15]] });
}

// A stand of watches: a tall glass tower, lit, a watch on each shelf.
export function watchTower(P, x, y, z, yaw) {
  const watches = [];
  for (let k = 0; k < 4; k++) watches.push({ cyl: [0, 0.8 + k * 0.28, 0], r: 0.05, h: 0.015, seg: 14 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-0.25, 0, -0.25, 0.25, 0.7, 0.25]], tint: T('wood', 0x2a1a12) },
    { kind: 'clearglass', boxes: [[-0.22, 0.7, -0.22, 0.22, 1.9, 0.22]] },
    { kind: 'steel', boxes: watches, tint: 0xd8dade },
    { kind: 'lamp', boxes: [[-0.18, 1.88, -0.18, 0.18, 1.9, 0.18]] },
  ], 'furniture', { colliders: [[-0.25, 0, -0.25, 0.25, 1.9, 0.25]] });
}
