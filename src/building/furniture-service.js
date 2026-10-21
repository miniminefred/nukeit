import { assembly } from './kit.js';

// The back of house, and the small things of a working floor: storage racks
// and archive boxes, furniture put away under dust sheets, the staff's lockers,
// a canteen's coffee machine and vending machine, the laundry, the plant's
// tanks and pumps, a workshop bench, the cleaners' carts, cars in the garage;
// upstairs printers, whiteboards, bins, kettles and fruit bowls.
//
// The ones people use are named (`tag`): sim/routines.js sends workers to
// them, and some you can use yourself (main.js): coffee, the vending machine,
// the water cooler.

const pick = (a, i) => a[Math.abs(Math.round(i)) % a.length];
const BOXES = [0xa8834e, 0x9a7a52, 0xb89a6a, 0x8a6a48];

// Steel shelving, four shelves of cardboard boxes (or grey archive boxes).
export function rack(P, x, y, z, yaw, len = 2.4, archive = false) {
  const posts = [], shelves = [], boxes = [];
  for (const sx of [-len / 2, len / 2]) for (const sz of [-0.28, 0.28]) posts.push([sx - 0.025, 0, sz - 0.025, sx + 0.025, 2.2, sz + 0.025]);
  for (let s = 0; s < 4; s++) {
    const h = 0.12 + s * 0.6;
    shelves.push([-len / 2, h, -0.3, len / 2, h + 0.03, 0.3]);
    let bx = -len / 2 + 0.05;
    for (let n = 0; bx < len / 2 - 0.35; n++) {
      const w = archive ? 0.32 : 0.35 + ((n * 7 + s * 3) % 4) * 0.08;
      const hh = archive ? 0.28 : 0.25 + ((n * 5 + s) % 3) * 0.08;
      if ((n * 11 + s * 5 + Math.round(x * 3)) % 7 !== 0) boxes.push([bx, h + 0.03, -0.25, bx + w, h + 0.03 + hh, 0.25]);
      bx += w + 0.04;
    }
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: posts, tint: 0x3a5a8a },
    { kind: 'metal', boxes: shelves, tint: 0x9aa0a6 },
    { kind: 'paper', round: 0.01, boxes, tint: archive ? 0x8e9296 : pick(BOXES, x * 3 + z) },
  ], 'furniture', { tag: 'rack', colliders: [[-len / 2, 0, -0.3, len / 2, 2.2, 0.3]] });
}

// Furniture put away under a dust sheet: a lumpy white shape.
export function sheeted(P, x, y, z, yaw, w = 1.6, d = 0.9, h = 1.0) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'fabric', round: 0.12, boxes: [[-w / 2, 0, -d / 2, w / 2, h * 0.6, d / 2], [-w / 2 + 0.05, h * 0.5, -d / 2 + 0.25, w / 2 - 0.05, h, d / 2 - 0.02]], tint: 0xe8e4d8 },
  ], 'furniture', { colliders: [[-w / 2, 0, -d / 2, w / 2, h, d / 2]] });
}

// A cage of lost property: steel mesh round shelves of bags, umbrellas, coats.
export function lostProperty(P, x, y, z, yaw) {
  const mesh = [];
  for (let i = 0; i <= 8; i++) mesh.push([-1 + i * 0.25 - 0.008, 0, 0.6, -1 + i * 0.25 + 0.008, 2.1, 0.616]);
  for (const h of [0.05, 1.05, 2.05]) mesh.push([-1, h, 0.6, 1, h + 0.02, 0.616]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: [...mesh, [-1, 0, -0.6, -0.97, 2.1, 0.6], [0.97, 0, -0.6, 1, 2.1, 0.6], [-1, 0.8, -0.55, 1, 0.83, 0.1]], tint: 0x6a6e72 },
    { kind: 'fabric', round: 0.04, boxes: [[-0.8, 0.83, -0.4, -0.45, 1.1, -0.1], [-0.3, 0.83, -0.45, 0.1, 1.2, -0.05], [0.3, 0.83, -0.4, 0.75, 1.0, 0.0], [-0.7, 0, -0.5, -0.2, 0.35, -0.1]], tint: 0x2a3a5a },
    { kind: 'plastic', boxes: [{ cyl: [0.6, 0.45, -0.3], r: 0.03, h: 0.9 }, { cyl: [0.7, 0.42, -0.25], r: 0.03, h: 0.84 }], tint: 0x1a1a1a },
  ], 'furniture', { colliders: [[-1, 0, -0.6, 1, 2.1, 0.62]] });
}

// A bank of steel lockers, `n` wide.
export function lockers(P, x, y, z, yaw, n = 6) {
  const w = n * 0.4, doors = [], vents = [];
  for (let i = 0; i < n; i++) {
    const a = -w / 2 + i * 0.4;
    doors.push([a + 0.015, 0.1, 0.25, a + 0.385, 1.85, 0.265]);
    vents.push([a + 0.12, 1.6, 0.266, a + 0.28, 1.7, 0.27], [a + 0.32, 0.9, 0.266, a + 0.35, 1.05, 0.275]);
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.01, boxes: [[-w / 2, 0, -0.25, w / 2, 1.9, 0.25]], tint: 0x5a6a7a },
    { kind: 'metal', boxes: doors, tint: 0x6e8094 },
    { kind: 'metal', boxes: vents, tint: 0x2a2e32 },
  ], 'furniture', { tag: 'lockers', colliders: [[-w / 2, 0, -0.25, w / 2, 1.9, 0.27]] });
}

// A bench to sit on in the locker room.
export function lockerBench(P, x, y, z, yaw, len = 1.8) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-len / 2, 0.42, -0.16, len / 2, 0.46, 0.16]], tint: 0xc8a070 },
    { kind: 'metal', boxes: [[-len / 2 + 0.1, 0, -0.12, -len / 2 + 0.14, 0.42, 0.12], [len / 2 - 0.14, 0, -0.12, len / 2 - 0.1, 0.42, 0.12]], tint: 0x3a3e42 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.16, len / 2, 0.46, 0.16]] });
}

// A coffee machine on its own cabinet, cups stacked by it. E for a coffee.
export function coffeeMachine(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-0.45, 0, -0.3, 0.45, 0.9, 0.3]], tint: 0x3a3e44 },
    { kind: 'metal', round: 0.03, boxes: [[-0.25, 0.9, -0.25, 0.2, 1.5, 0.2]], tint: 0x1e1e20 },
    { kind: 'metal', boxes: [[-0.2, 1.3, 0.2, 0.15, 1.42, 0.24], [-0.1, 1.05, 0.05, 0.05, 1.1, 0.22], [-0.2, 0.9, 0.05, 0.15, 0.94, 0.22]], tint: 0xb0b4b8 },
    { kind: 'ceramic', boxes: [{ cyl: [0.32, 1.0, 0.05], r: 0.045, r2: 0.035, h: 0.2, seg: 10 }, { cyl: [0.32, 1.0, -0.12], r: 0.045, r2: 0.035, h: 0.2, seg: 10 }], tint: 0xf2ece0 },
  ], 'furniture', { tag: 'coffee', colliders: [[-0.45, 0, -0.3, 0.45, 1.5, 0.3]] });
}

// A vending machine: a lit front of snacks behind glass. E for something to eat.
export function vending(P, x, y, z, yaw) {
  const snacks = [];
  const C = [0xc8261d, 0xe8b020, 0x2a6a3a, 0x2a4a8a, 0xe86a1a];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) snacks.push({ part: C[(r + c) % C.length], b: [-0.38 + c * 0.17, 0.75 + r * 0.24, 0.2, -0.26 + c * 0.17, 0.9 + r * 0.24, 0.3] });
  const byColour = C.map((c) => ({ kind: 'vinyl', boxes: snacks.filter((s) => s.part === c).map((s) => s.b), tint: c }));
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.02, boxes: [[-0.45, 0, -0.4, 0.45, 1.9, 0.32]], tint: 0x2a2e3a },
    { kind: 'lamp', boxes: [[-0.42, 0.7, 0.18, 0.3, 1.88, 0.2]], tint: 0xf4f0e6 },
    ...byColour,
    { kind: 'clearglass', boxes: [[-0.42, 0.7, 0.32, 0.3, 1.88, 0.33]] },
    { kind: 'metal', boxes: [[0.32, 1.2, 0.32, 0.42, 1.6, 0.34], [-0.4, 0.2, 0.32, 0.3, 0.45, 0.34]], tint: 0x111111 },
  ], 'furniture', { tag: 'vending', colliders: [[-0.45, 0, -0.4, 0.45, 1.9, 0.34]] });
}

// A big office printer, paper in its tray.
export function printer(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'vinyl', round: 0.03, boxes: [[-0.4, 0, -0.3, 0.4, 1.0, 0.3], [-0.38, 1.0, -0.28, 0.38, 1.12, 0.28]], tint: 0xdedcd6 },
    { kind: 'plastic', boxes: [[-0.38, 0.12, 0.3, 0.38, 0.14, 0.31], [-0.38, 0.4, 0.3, 0.38, 0.42, 0.31], [0.1, 1.12, 0.1, 0.35, 1.16, 0.26]], tint: 0x3a3a3a },
    { kind: 'paper', boxes: [[-0.3, 0.86, 0.15, 0.15, 0.9, 0.42]], tint: 0xf8f8f4 },
  ], 'furniture', { tag: 'printer', colliders: [[-0.4, 0, -0.3, 0.4, 1.16, 0.42]] });
}

// A whiteboard on a stand, a few marker lines on it.
export function whiteboard(P, x, y, z, yaw, w = 1.6) {
  const lines = [];
  for (let n = 0; n < 5; n++) lines.push([-w / 2 + 0.15, 1.75 - n * 0.16, 0.035, -w / 2 + 0.3 + ((n * 37) % 9) * 0.1, 1.765 - n * 0.16, 0.04]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: [[-w / 2 - 0.03, 0.85, 0, w / 2 + 0.03, 1.95, 0.03], [-w / 2 + 0.05, 0, -0.3, -w / 2 + 0.09, 0.9, 0.3], [w / 2 - 0.09, 0, -0.3, w / 2 - 0.05, 0.9, 0.3], [-w / 2 + 0.05, 0, -0.3, -w / 2 + 0.09, 0.04, 0.3]], tint: 0xa0a4a8 },
    { kind: 'vinyl', boxes: [[-w / 2, 0.88, 0.03, w / 2, 1.92, 0.035]], tint: 0xf8f8f6 },
    { kind: 'vinyl', boxes: lines, tint: 0x2a4a9a },
  ], 'furniture', { colliders: [[-w / 2, 0, -0.3, w / 2, 1.95, 0.3]] });
}

// A bin, or a pair (paper and the rest).
export function bin(P, x, y, z, tint = 0x3a3e42) {
  return assembly(P, x, y, z, 0, [
    { kind: 'metal', boxes: [{ cyl: [0, 0.3, 0], r: 0.17, r2: 0.15, h: 0.6, seg: 16 }], tint },
    { kind: 'metal', boxes: [{ cyl: [0, 0.61, 0], r: 0.18, h: 0.03, seg: 16 }], tint: 0x1a1a1a },
  ], 'furniture', { colliders: [[-0.18, 0, -0.18, 0.18, 0.63, 0.18]] });
}

// A big wheelie bin by the loading bay.
export function wheelieBin(P, x, y, z, yaw, tint = 0x2a5a3a) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'vinyl', round: 0.04, boxes: [[-0.6, 0.15, -0.5, 0.6, 1.25, 0.5]], tint },
    { kind: 'vinyl', round: 0.02, boxes: [[-0.62, 1.25, -0.55, 0.62, 1.32, 0.52]], tint: 0x1a2a1e },
    { kind: 'plastic', boxes: [{ cylZ: [-0.45, 0.1, 0.4], r: 0.1, h: 0.08 }, { cylZ: [0.45, 0.1, 0.4], r: 0.1, h: 0.08 }, { cylZ: [-0.45, 0.1, -0.4], r: 0.1, h: 0.08 }, { cylZ: [0.45, 0.1, -0.4], r: 0.1, h: 0.08 }], tint: 0x111111 },
  ], 'furniture', { colliders: [[-0.62, 0, -0.55, 0.62, 1.32, 0.55]] });
}

// Two washing machines and a dryer stacked, in a row.
export function laundry(P, x, y, z, yaw) {
  const drums = [];
  for (const dx of [-0.65, 0, 0.65]) drums.push({ cylZ: [dx, 0.5, 0.32], r: 0.2, h: 0.03, seg: 20 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.02, boxes: [[-0.95, 0, -0.3, 0.95, 0.85, 0.3]], tint: 0xeeeeec },
    { kind: 'clearglass', boxes: drums },
    { kind: 'metal', boxes: [[-0.9, 0.75, 0.3, 0.9, 0.8, 0.31]], tint: 0x5a5e62 },
  ], 'furniture', { colliders: [[-0.95, 0, -0.3, 0.95, 0.85, 0.34]] });
}

// A laundry cart of towels and linen.
export function linenCart(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: [[-0.5, 0.15, -0.3, 0.5, 0.2, 0.3], [-0.5, 0.15, -0.3, -0.47, 0.9, 0.3], [0.47, 0.15, -0.3, 0.5, 0.9, 0.3]], tint: 0x9aa0a6 },
    { kind: 'fabric', round: 0.08, boxes: [[-0.45, 0.2, -0.27, 0.45, 0.85, 0.27]], tint: 0xf2f0ea },
    { kind: 'plastic', boxes: [{ ball: [-0.4, 0.06, -0.25], s: [0.06, 0.06, 0.06] }, { ball: [0.4, 0.06, -0.25], s: [0.06, 0.06, 0.06] }, { ball: [-0.4, 0.06, 0.25], s: [0.06, 0.06, 0.06] }, { ball: [0.4, 0.06, 0.25], s: [0.06, 0.06, 0.06] }], tint: 0x111111 },
  ], 'furniture', { colliders: [[-0.5, 0, -0.3, 0.5, 0.9, 0.3]] });
}

// A water tank on a steel frame, its pipe down to the floor.
export function waterTank(P, x, y, z, r = 0.9, h = 2.2) {
  return assembly(P, x, y, z, 0, [
    { kind: 'metal', boxes: [{ cyl: [0, 0.3 + h / 2, 0], r, h, seg: 28 }, { cyl: [0, 0.3 + h + 0.05, 0], r: r * 0.96, h: 0.1, seg: 28 }], tint: 0x3a6a5a },
    { kind: 'concrete', boxes: [[-r * 0.9, 0, -r * 0.9, r * 0.9, 0.3, r * 0.9]], tint: 0x8a8680 },
    { kind: 'steel', boxes: [{ cyl: [r + 0.1, 0.65, 0], r: 0.06, h: 0.7 }, { cylX: [r * 0.55 + 0.05, 1.0, 0], r: 0.06, h: r * 0.9 }], tint: 0x6a6e72 },
  ], 'furniture', { colliders: [[-r, 0, -r, r + 0.16, 0.4 + h, r]] });
}

// A pump on its plinth, the red casing and the pipes in and out.
export function pump(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'concrete', boxes: [[-0.5, 0, -0.35, 0.5, 0.15, 0.35]], tint: 0x8a8680 },
    { kind: 'metal', boxes: [{ cylX: [-0.1, 0.4, 0], r: 0.2, h: 0.5 }, { cyl: [0.3, 0.42, 0], r: 0.16, h: 0.3 }], tint: 0xb02a22 },
    { kind: 'metal', boxes: [{ cyl: [0.3, 1.0, 0], r: 0.07, h: 0.9 }, { cylZ: [0.3, 0.42, -0.3], r: 0.07, h: 0.3 }], tint: 0x6a6e72 },
  ], 'furniture', { colliders: [[-0.5, 0, -0.35, 0.5, 1.45, 0.45]] });
}

// A workbench: a timber top, a vice, tools on a pegboard, a toolbox.
export function workbench(P, x, y, z, yaw, len = 2) {
  const tools = [];
  for (let n = 0; n < 6; n++) tools.push([-len / 2 + 0.25 + n * 0.3, 1.25, 0.24, -len / 2 + 0.29 + n * 0.3, 1.55 - (n % 3) * 0.06, 0.26]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-len / 2, 0.85, -0.35, len / 2, 0.9, 0.35]], tint: 0xb08a5a },
    { kind: 'metal', boxes: [[-len / 2 + 0.05, 0, -0.3, -len / 2 + 0.1, 0.85, 0.3], [len / 2 - 0.1, 0, -0.3, len / 2 - 0.05, 0.85, 0.3], [-len / 2, 0.15, -0.3, len / 2, 0.18, 0.3]], tint: 0x2a3a5a },
    { kind: 'wood', boxes: [[-len / 2, 0.9, 0.3, len / 2, 1.8, 0.33]], tint: 0xc8b490 },
    { kind: 'metal', boxes: [...tools, [len / 2 - 0.4, 0.9, -0.2, len / 2 - 0.2, 1.05, 0.05], [-len / 2 + 0.2, 0.9, -0.25, -len / 2 + 0.7, 1.12, 0.0]], tint: 0x8a1a1a },
  ], 'furniture', { tag: 'workbench', colliders: [[-len / 2, 0, -0.35, len / 2, 1.8, 0.35]] });
}

// A cleaner's cart: a yellow trolley, a bucket, a mop, a bin bag.
export function cleaningCart(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'vinyl', round: 0.02, boxes: [[-0.45, 0.1, -0.25, 0.45, 0.16, 0.25], [-0.45, 0.16, -0.25, -0.4, 1.0, 0.25], [-0.45, 0.6, -0.25, 0.1, 0.65, 0.25]], tint: 0xe8c020 },
    { kind: 'vinyl', boxes: [{ cyl: [0.2, 0.32, 0], r: 0.18, r2: 0.15, h: 0.32, seg: 16 }], tint: 0x2a5aa0 },
    { kind: 'wood', boxes: [{ cyl: [0.25, 0.85, 0.05], r: 0.015, h: 1.3, seg: 6 }], tint: 0xc8b490 },
    { kind: 'plastic', boxes: [{ ball: [-0.2, 0.85, 0], s: [0.18, 0.2, 0.18] }], tint: 0x111111 },
  ], 'furniture', { tag: 'cleancart', colliders: [[-0.45, 0, -0.25, 0.45, 1.0, 0.25]] });
}

// A car, parked: a rounded body, glass all round, four wheels. Hit it and its
// alarm goes off (main.js).
export function car(P, x, y, z, yaw, tint = 0x2a3a5a) {
  const tyres = [], hubs = [];
  for (const sx of [-0.8, 0.8]) for (const sz of [-1.35, 1.35]) {
    tyres.push({ cylX: [sx, 0.32, sz], r: 0.32, h: 0.22, seg: 18 });
    hubs.push({ cylX: [sx * 1.14, 0.32, sz], r: 0.17, h: 0.02, seg: 14 });
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.24, boxes: [[-0.88, 0.28, -2.2, 0.88, 0.88, 2.2]], tint },
    { kind: 'glass', round: 0.2, boxes: [[-0.78, 0.8, -1.05, 0.78, 1.3, 0.9]] },
    { kind: 'metal', round: 0.14, boxes: [[-0.74, 1.24, -0.8, 0.74, 1.42, 0.62]], tint },
    { kind: 'plastic', boxes: tyres, tint: 0x141414 },
    { kind: 'metal', boxes: hubs, tint: 0xb8bcc0 },
    { kind: 'lamp', boxes: [[-0.72, 0.6, 2.16, -0.42, 0.72, 2.21], [0.42, 0.6, 2.16, 0.72, 0.72, 2.21]], tint: 0xf4f0e0 },
    { kind: 'plastic', boxes: [[-0.72, 0.62, -2.21, -0.42, 0.74, -2.16], [0.42, 0.62, -2.21, 0.72, 0.74, -2.16], [-0.86, 0.3, 2.1, 0.86, 0.42, 2.22]], tint: 0x701410 },
  ], 'furniture', { tag: 'car', colliders: [[-0.9, 0, -2.22, 0.9, 1.42, 2.22]] });
}

// The white lines of a parking bay, and its number on the wall.
export function bayLines(P, x, y, z, yaw, w = 2.6, len = 5) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plaster', boxes: [[-w / 2, 0, -len / 2, -w / 2 + 0.1, 0.006, len / 2], [w / 2 - 0.1, 0, -len / 2, w / 2, 0.006, len / 2], [-w / 2, 0, -len / 2, w / 2, 0.006, -len / 2 + 0.1]], tint: 0xf0eee8 },
  ], 'furniture', { colliders: [[-w / 2, 0, -len / 2, w / 2, 0.01, len / 2]] });
}

// A kettle, mugs and a fruit bowl on a counter top at `top`.
export function kitchenThings(P, x, y, z, yaw, top = 0.9) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: [{ cyl: [-0.35, top + 0.11, 0], r: 0.09, r2: 0.08, h: 0.22, seg: 14 }, [-0.27, top + 0.08, -0.015, -0.22, top + 0.2, 0.015]], tint: 0xc8ccd0 },
    { kind: 'ceramic', boxes: [{ cyl: [-0.1, top + 0.05, 0.05], r: 0.04, h: 0.1, seg: 10 }, { cyl: [0.0, top + 0.05, -0.05], r: 0.04, h: 0.1, seg: 10 }, { cyl: [0.3, top + 0.04, 0], r: 0.15, r2: 0.08, h: 0.08, seg: 16 }], tint: 0xf2ece0 },
    { kind: 'plastic', boxes: [{ ball: [0.26, top + 0.11, 0.03], s: [0.05, 0.05, 0.05] }, { ball: [0.35, top + 0.11, -0.02], s: [0.05, 0.05, 0.05] }, { ball: [0.3, top + 0.16, 0], s: [0.045, 0.045, 0.045] }], tint: 0xd84a1a },
  ], 'furniture');
}

// A pile of paper and folders on a desk top.
export function paperwork(P, x, y, z, yaw, top = 0.74) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'paper', boxes: [[-0.15, top, -0.11, 0.15, top + 0.05, 0.11], [0.2, top, -0.12, 0.42, top + 0.12, 0.12]], tint: 0xf4f2ea },
    { kind: 'plastic', boxes: [[0.19, top + 0.12, -0.13, 0.43, top + 0.13, 0.13]], tint: 0x2a4a8a },
  ], 'furniture');
}

// A standing lamp.
export function floorLamp(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'metal', boxes: [{ cyl: [0, 0.01, 0], r: 0.15, h: 0.02, seg: 16 }, { cyl: [0, 0.75, 0], r: 0.012, h: 1.5, seg: 8 }], tint: 0x2a2a2a },
    { kind: 'fabric', boxes: [{ cyl: [0, 1.55, 0], r: 0.15, r2: 0.22, h: 0.25, seg: 18 }], tint: 0xf2e8d0 },
  ], 'furniture', { colliders: [[-0.2, 0, -0.2, 0.2, 1.68, 0.2]] });
}

// A noticeboard on a wall: cork, pinned sheets.
export function noticeboard(P, x, y, z, yaw, w = 1.2) {
  const sheets = [];
  for (let n = 0; n < 6; n++) sheets.push([-w / 2 + 0.08 + (n % 3) * (w / 3), 1.25 + Math.floor(n / 3) * 0.35, 0.025, -w / 2 + 0.3 + (n % 3) * (w / 3), 1.53 + Math.floor(n / 3) * 0.35, 0.03]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-w / 2, 1.2, 0, w / 2, 2.0, 0.025]], tint: 0xb08a5a },
    { kind: 'paper', boxes: sheets, tint: 0xf4f2ea },
  ], 'cladding', { structural: false });
}
