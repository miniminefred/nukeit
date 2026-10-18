import { assembly } from './kit.js';

// What a café-bakery is fitted with, after the owner's photograph: a glass
// display counter of cakes and pastries, the till, an espresso machine on the
// back counter with cups stacked by it, shelves of loaves and jars on the back
// wall, chalkboard menus over it, an open frame of black steel shelving with
// pendant bulbs hanging over the counter, wooden tables and chairs.
//
// Every one faces +z at yaw 0: that is where the customers stand.


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
    { kind: 'wood', round: 0.02, boxes: [[-len / 2, 0, -0.3, len / 2, 0.86, 0.32]], tint: 0x6a4a30 },
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
    { kind: 'wood', round: 0.01, boxes: [[-len / 2, 0, -0.3, len / 2, 0.9, 0.3]], tint: 0x3a3e44 },
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
    { kind: 'wood', boxes: [[-len / 2, 0, -0.38, -len / 2 + 0.04, 2.2, 0], [len / 2 - 0.04, 0, -0.38, len / 2, 2.2, 0], [-len / 2, 0, -0.38, len / 2, 2.2, -0.35], ...boards], tint: 0x8a6a48 },
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
    { kind: 'wood', round: 0.01, boxes: [[-0.36, 0.72, -0.36, 0.36, 0.76, 0.36]], tint: 0xb08a5a },
    { kind: 'metal', boxes: [{ cyl: [0, 0.36, 0], r: 0.03, h: 0.72, seg: 8 }, [-0.25, 0, -0.04, 0.25, 0.03, 0.04], [-0.04, 0, -0.25, 0.04, 0.03, 0.25]], tint: 0x161616 },
  ], 'furniture', { colliders: [[-0.36, 0, -0.36, 0.36, 0.76, 0.36]] });
}

export function woodChair(P, x, y, z, yaw) {
  const legs = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.17], [0.18, 0.17]].map(([a, c]) => ({ cyl: [a, 0.22, c], r: 0.017, h: 0.44, seg: 6 }));
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-0.21, 0.44, -0.21, 0.21, 0.48, 0.2], [-0.2, 0.5, -0.24, 0.2, 0.86, -0.2], ...legs], tint: 0xc8a272 },
  ], 'furniture', { colliders: [[-0.22, 0, -0.24, 0.22, 0.86, 0.21]] });
}

// A cushioned bench along a wall, for the tables in a row in front of it.
export function banquette(P, x, y, z, yaw, len = 3) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-len / 2, 0, -0.25, len / 2, 0.42, 0.25]], tint: 0x5a3a22 },
    { kind: 'leather', round: 0.05, boxes: [[-len / 2 + 0.03, 0.42, -0.22, len / 2 - 0.03, 0.5, 0.22], [-len / 2 + 0.03, 0.5, -0.25, len / 2 - 0.03, 1.0, -0.13]], tint: 0x6a5040 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.25, len / 2, 1.0, 0.25]] });
}
