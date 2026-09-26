import { assembly } from './kit.js';

// Restaurants, the food court and the shop counters.

const r = (a, b) => a + Math.random() * (b - a);

// A round table with a white cloth to the floor, set for dinner.
export function clothTable(P, x, y, z, radius = 0.6) {
  const set = [];
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * Math.PI * 2;
    set.push({ cyl: [Math.cos(a) * radius * 0.65, 0.78, Math.sin(a) * radius * 0.65], r: 0.12, h: 0.015, seg: 16 });
  }
  return assembly(P, x, y, z, 0, [
    { kind: 'linen', boxes: [{ cyl: [0, 0.39, 0], r: radius + 0.05, r2: radius + 0.15, h: 0.76, seg: 24 }, { cyl: [0, 0.765, 0], r: radius + 0.05, h: 0.01, seg: 24 }] },
    { kind: 'ceramic', boxes: set },
    { kind: 'glass', boxes: [{ cyl: [0, 0.86, 0], r: 0.04, r2: 0.03, h: 0.16, seg: 12 }] },
  ], 'furniture', { colliders: [[-radius - 0.15, 0, -radius - 0.15, radius + 0.15, 0.78, radius + 0.15]] });
}

// A plain café table: a round top on one leg.
export function cafeTable(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'wood', round: 0.01, boxes: [{ cyl: [0, 0.73, 0], r: 0.38, h: 0.04, seg: 20 }], tint: 0xc9a47a },
    { kind: 'metal', boxes: [{ cyl: [0, 0.36, 0], r: 0.03, h: 0.7, seg: 10 }, { cyl: [0, 0.015, 0], r: 0.25, h: 0.03, seg: 18 }], tint: 0x222222 },
  ], 'furniture', { colliders: [[-0.38, 0, -0.38, 0.38, 0.75, 0.38]] });
}

// A stackable chair of the kind a food court has hundreds of.
export function bistroChair(P, x, y, z, yaw, tint = 0x333333) {
  const legs = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([a, c]) => ({ cyl: [a, 0.22, c], r: 0.015, h: 0.44, seg: 8 }));
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', round: 0.03, boxes: [[-0.21, 0.44, -0.21, 0.21, 0.48, 0.21], [-0.2, 0.5, 0.17, 0.2, 0.85, 0.21]], tint },
    { kind: 'metal', boxes: legs, tint: 0x999999 },
  ], 'furniture', { colliders: [[-0.22, 0, -0.22, 0.22, 0.85, 0.22]] });
}

export function barStool(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'leather', round: 0.03, boxes: [{ cyl: [0, 0.76, 0], r: 0.19, h: 0.07, seg: 18 }], tint: 0x5a2020 },
    { kind: 'brass', boxes: [{ cyl: [0, 0.37, 0], r: 0.025, h: 0.72, seg: 10 }, { cyl: [0, 0.015, 0], r: 0.2, h: 0.03, seg: 18 }, { cyl: [0, 0.3, 0], r: 0.14, h: 0.02, seg: 16 }] },
  ], 'furniture', { colliders: [[-0.2, 0, -0.2, 0.2, 0.8, 0.2]] });
}

// A bar: a panelled front, a marble top, and bottles on a shelf behind.
export function bar(P, x, y, z, yaw, len = 4) {
  const bottles = [];
  const cols = [0x2a5a2a, 0x6a3a10, 0x1a1a3a, 0x8a8a8a, 0x5a1a1a];
  const glass = cols.map((tint) => ({ kind: 'glass', boxes: [], tint }));
  for (let bx = -len / 2 + 0.15; bx < len / 2 - 0.1; bx += 0.12) {
    const h = r(0.24, 0.34);
    glass[(Math.random() * cols.length) | 0].boxes.push({ cyl: [bx, 1.35 + h / 2, -0.95], r: 0.035, h, seg: 10 });
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-len / 2, 0, -0.35, len / 2, 1.05, 0.3]], tint: 0x4a2a18 },
    { kind: 'marble', round: 0.02, boxes: [[-len / 2 - 0.05, 1.05, -0.38, len / 2 + 0.05, 1.1, 0.36]] },
    { kind: 'brass', boxes: [{ cylX: [0, 0.2, 0.36], r: 0.025, h: len, seg: 10 }] },
    { kind: 'wood', boxes: [[-len / 2, 0, -1.1, len / 2, 2.2, -0.8], [-len / 2, 1.33, -1.1, len / 2, 1.35, -0.8], [-len / 2, 1.83, -1.1, len / 2, 1.85, -0.8]], tint: 0x3a2014 },
    ...glass.filter((g) => g.boxes.length),
  ], 'furniture', { colliders: [[-len / 2, 0, -0.38, len / 2, 1.1, 0.36], [-len / 2, 0, -1.1, len / 2, 2.2, -0.8]] });
}

// A food-court counter: a service counter, a griddle and a menu board.
export function foodCounter(P, x, y, z, yaw, board = 0xc8261d) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.02, boxes: [[-1.5, 0, -0.35, 1.5, 1.0, 0.35]], tint: 0xcfd2d4 },
    { kind: 'plastic', round: 0.01, boxes: [[-1.55, 1.0, -0.4, 1.55, 1.05, 0.4]], tint: 0x1a1a1a },
    { kind: 'metal', boxes: [[-1.4, 0, -1.6, 1.4, 0.92, -1.0]], tint: 0x9aa0a6 },
    { kind: 'metal', boxes: [[-0.6, 0.92, -1.55, 0.6, 0.95, -1.05]], tint: 0x202020 },
    { kind: 'plastic', round: 0.02, boxes: [[-1.4, 2.2, -1.75, 1.4, 2.9, -1.7]], tint: board },
    { kind: 'lamp', boxes: [[-1.3, 2.3, -1.705, 1.3, 2.8, -1.695]] },
  ], 'furniture', { colliders: [[-1.5, 0, -0.4, 1.5, 1.05, 0.4], [-1.4, 0, -1.6, 1.4, 0.95, -1.0]] });
}

// A jeweller's case: a wooden base, a glass box, and what is on show in it.
export function jewelCase(P, x, y, z, yaw) {
  const items = [];
  for (let n = 0; n < 6; n++) items.push({ ball: [-0.55 + n * 0.22, 1.0, r(-0.12, 0.12)], s: [0.04, 0.02, 0.04], rough: 0, detail: 1 });
  const gems = [];
  for (let n = 0; n < 5; n++) gems.push({ ball: [-0.45 + n * 0.22, 1.03, r(-0.1, 0.1)], s: [0.018, 0.018, 0.018], rough: 0, detail: 1 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-0.75, 0, -0.35, 0.75, 0.95, 0.35]], tint: 0x2a1a12 },
    { kind: 'fabric', boxes: [[-0.72, 0.95, -0.32, 0.72, 0.97, 0.32]], tint: 0x1a1a2a },
    { kind: 'gold', boxes: items },
    { kind: 'glass', boxes: gems, tint: 0x9ad0ff },
    { kind: 'glass', boxes: [[-0.75, 0.97, -0.35, 0.75, 1.3, 0.35]] },
  ], 'furniture', { colliders: [[-0.75, 0, -0.35, 0.75, 1.3, 0.35]] });
}

export function bookRack(P, x, y, z, yaw) {
  const books = [];
  const cols = [0x8a2a2a, 0x2a4a7a, 0xd8c8a0, 0x2a5a3a, 0x1a1a1a, 0x9a6a2a];
  const parts = cols.map((tint) => ({ kind: 'paper', boxes: [], tint }));
  for (let s = 0; s < 3; s++)
    for (let bx = -0.9; bx < 0.88; bx += 0.05) parts[(Math.random() * cols.length) | 0].boxes.push([bx, 0.1 + s * 0.45 + 0.02, -0.14, bx + 0.04, 0.1 + s * 0.45 + 0.02 + r(0.22, 0.3), 0.14]);
  books.length = 0;
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-1, 0, -0.18, 1, 0.1, 0.18], [-1, 0.55, -0.18, 1, 0.57, 0.18], [-1, 1.0, -0.18, 1, 1.02, 0.18], [-1, 1.45, -0.18, 1, 1.47, 0.18], [-1, 0, -0.18, -0.97, 1.47, 0.18], [0.97, 0, -0.18, 1, 1.47, 0.18]], tint: 0x8a6a4a },
    ...parts.filter((p) => p.boxes.length),
  ], 'furniture', { colliders: [[-1, 0, -0.18, 1, 1.47, 0.18]] });
}
