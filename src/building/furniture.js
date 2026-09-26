import { assembly } from './kit.js';

// Furniture. Each function stands one thing on the floor at (x, y, z), turned
// `yaw` radians, and returns the piece.
//
// Nothing here is a block. Tops have rounded edges, legs are tubes, cushions
// are soft, pots taper, leaves are clumps — and each part is the material it
// is really made of, so a desk splinters where its top is timber and rings
// where its legs are steel, and a chair's seat burns while its base does not.

const r = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

export function desk(P, x, y, z, yaw) {
  const w = 1.4, d = 0.7, h = 0.74;
  const legs = [];
  for (const sx of [-w / 2 + 0.06, w / 2 - 0.06]) for (const sz of [-d / 2 + 0.06, d / 2 - 0.06]) legs.push({ cyl: [sx, (h - 0.03) / 2, sz], r: 0.022, h: h - 0.03, seg: 10 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.012, boxes: [[-w / 2, h - 0.03, -d / 2, w / 2, h, d / 2]] },
    { kind: 'wood', round: 0.006, boxes: [[-w / 2 + 0.08, h - 0.36, d / 2 - 0.035, w / 2 - 0.08, h - 0.03, d / 2 - 0.015]], tint: 0xd8cfc2 },
    { kind: 'metal', boxes: legs, tint: 0x3a3c40 },
  ], 'furniture', { colliders: [[-w / 2, 0, -d / 2, w / 2, h, d / 2]] });
}

export function monitor(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', round: 0.01, boxes: [{ cyl: [0, 0.008, -0.04], r: 0.11, h: 0.016, seg: 20 }, [-0.018, 0.016, -0.06, 0.018, 0.2, -0.035], [-0.3, 0.15, -0.035, 0.3, 0.5, -0.005]] },
    { kind: 'screen', round: 0.004, boxes: [[-0.285, 0.162, -0.006, 0.285, 0.488, -0.002]] },
  ], 'furniture');
}

export function keyboard(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', round: 0.006, boxes: [[-0.22, 0, -0.07, 0.22, 0.022, 0.07]], tint: 0x2a2a2e },
    { kind: 'plastic', round: 0.01, boxes: [[0.27, 0, -0.03, 0.33, 0.03, 0.04]], tint: 0x2a2a2e },
  ], 'furniture');
}

export function officeChair(P, x, y, z, yaw, tint = 0x2d3a55) {
  const base = [{ cyl: [0, 0.27, 0], r: 0.025, h: 0.36, seg: 10 }];
  const wheels = [];
  for (let n = 0; n < 5; n++) {
    const a = (n / 5) * TAU;
    const ex = Math.cos(a) * 0.28, ez = Math.sin(a) * 0.28;
    base.push({ cylX: [ex / 2, 0.075, ez / 2], r: 0.016, r2: 0.022, h: 0.28, rotY: -a });
    wheels.push({ ball: [ex, 0.03, ez], s: [0.03, 0.03, 0.03], rough: 0, detail: 1 });
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'fabric', round: 0.05, boxes: [[-0.25, 0.44, -0.24, 0.25, 0.54, 0.25], [-0.23, 0.6, 0.2, 0.23, 1.06, 0.28]], tint },
    { kind: 'plastic', round: 0.01, boxes: [...base, { cyl: [0, 0.08, 0], r: 0.05, h: 0.04 }, [-0.02, 0.5, 0.21, 0.02, 0.64, 0.25]] },
    { kind: 'plastic', boxes: wheels, tint: 0x111111 },
  ], 'furniture', { colliders: [[-0.3, 0, -0.3, 0.3, 0.54, 0.3], [-0.23, 0.54, 0.2, 0.23, 1.06, 0.28]] });
}

export function filingCabinet(P, x, y, z, yaw) {
  const b = [[-0.23, 0, -0.3, 0.23, 1.32, 0.3]];
  const drawers = [], handles = [];
  for (let n = 0; n < 4; n++) {
    drawers.push([-0.215, 0.03 + n * 0.325, 0.29, 0.215, 0.33 + n * 0.325, 0.305]);
    handles.push({ cylX: [0, 0.26 + n * 0.325, 0.315], r: 0.008, h: 0.14, seg: 8 });
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.012, boxes: b, tint: 0x9aa0a6 },
    { kind: 'metal', round: 0.006, boxes: drawers, tint: 0xa8aeb4 },
    { kind: 'metal', boxes: handles, tint: 0x505458 },
  ], 'furniture', { colliders: b });
}

export function bookshelf(P, x, y, z, yaw) {
  const w = 1.0, d = 0.35, h = 2.0;
  const frame = [[-w / 2, 0, -d / 2, -w / 2 + 0.022, h, d / 2], [w / 2 - 0.022, 0, -d / 2, w / 2, h, d / 2], [-w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.01]];
  const books = [];
  for (let s = 0; s < 5; s++) {
    const sy = s * 0.4;
    frame.push([-w / 2, sy, -d / 2, w / 2, sy + 0.022, d / 2]);
    let bx = -w / 2 + 0.03;
    while (bx < w / 2 - 0.08) {
      const bw = r(0.025, 0.06), bh = r(0.2, 0.33);
      // Now and then one leans.
      books.push([bx, sy + 0.022, -d / 2 + 0.03, bx + bw, sy + 0.022 + bh, d / 2 - 0.04 - Math.random() * 0.05]);
      bx += bw + 0.003;
    }
  }
  frame.push([-w / 2, h - 0.022, -d / 2, w / 2, h, d / 2]);
  const cols = [0x6a2020, 0x1f3c64, 0x2e4d2a, 0x7a6a3a, 0x3a2a4a, 0xd8d0c0];
  // Books have square edges; rounding a hundred of them per shelf costs a lot for nothing.
  const byCol = cols.map((tint) => ({ kind: 'paper', boxes: [], tint }));
  books.forEach((b, i) => byCol[(i * 7 + (i >> 2)) % cols.length].boxes.push(b));
  return assembly(P, x, y, z, yaw, [{ kind: 'wood', round: 0.005, boxes: frame }, ...byCol.filter((b) => b.boxes.length)], 'furniture',
    { colliders: [[-w / 2, 0, -d / 2, w / 2, h, d / 2]] });
}

export function sofa(P, x, y, z, yaw, tint = 0x4a3a30) {
  const cushions = [];
  for (const cx of [-0.62, 0, 0.62]) {
    cushions.push([cx - 0.3, 0.3, -0.42, cx + 0.3, 0.48, 0.22]);
    cushions.push([cx - 0.3, 0.46, 0.14, cx + 0.3, 0.88, 0.34]);
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'leather', round: 0.06, boxes: [[-1.02, 0.1, -0.46, 1.02, 0.32, 0.46], [-1.02, 0.3, 0.26, 1.02, 0.9, 0.46], [-1.02, 0.3, -0.46, -0.84, 0.66, 0.3], [0.84, 0.3, -0.46, 1.02, 0.66, 0.3]], tint },
    { kind: 'leather', round: 0.07, boxes: cushions, tint },
    { kind: 'metal', boxes: [[-0.95, 0, -0.4], [0.95, 0, -0.4], [-0.95, 0, 0.4], [0.95, 0, 0.4]].map(([a, b, c]) => ({ cyl: [a, 0.05, c], r: 0.02, h: 0.1, seg: 8 })), tint: 0x202020 },
  ], 'furniture', { colliders: [[-1.02, 0, -0.46, 1.02, 0.45, 0.46], [-1.02, 0.45, 0.26, 1.02, 0.9, 0.46]] });
}

export function meetingTable(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-1.6, 0.72, -0.6, 1.6, 0.76, 0.6]] },
    { kind: 'metal', boxes: [{ cyl: [-1.0, 0.36, 0], r: 0.05, h: 0.72 }, { cyl: [1.0, 0.36, 0], r: 0.05, h: 0.72 }, { cyl: [-1.0, 0.01, 0], r: 0.28, h: 0.02, seg: 20 }, { cyl: [1.0, 0.01, 0], r: 0.28, h: 0.02, seg: 20 }], tint: 0x2a2a2a },
  ], 'furniture', { colliders: [[-1.6, 0, -0.6, 1.6, 0.76, 0.6]] });
}

export function plant(P, x, y, z, big = false) {
  const s = big ? 1.5 : 1;
  const leaves = [];
  for (let n = 0; n < 6; n++) {
    const a = n * 1.05, rr = r(0.03, 0.14) * s;
    leaves.push({ ball: [Math.cos(a) * rr, (0.55 + r(0, 0.45)) * s, Math.sin(a) * rr], s: [0.16 * s, 0.22 * s, 0.16 * s], rough: 0.45 });
  }
  return assembly(P, x, y, z, 0, [
    { kind: 'plastic', boxes: [{ cyl: [0, 0.2 * s, 0], r: 0.2 * s, r2: 0.15 * s, h: 0.4 * s, seg: 18 }], tint: 0xd8d2c8 },
    { kind: 'soil', boxes: [{ cyl: [0, 0.39 * s, 0], r: 0.185 * s, h: 0.02, seg: 18 }] },
    { kind: 'wood', boxes: [{ cyl: [0, 0.55 * s, 0], r: 0.015 * s, h: 0.4 * s, seg: 6 }], tint: 0x6a5040 },
    { kind: 'leaves', boxes: leaves },
  ], 'furniture', { colliders: [[-0.2 * s, 0, -0.2 * s, 0.2 * s, 1.2 * s, 0.2 * s]] });
}

export function waterCooler(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', round: 0.03, boxes: [[-0.17, 0, -0.17, 0.17, 1.0, 0.17]], tint: 0xe8e8ea },
    { kind: 'glass', boxes: [{ cyl: [0, 1.2, 0], r: 0.13, h: 0.38, seg: 18 }, { cyl: [0, 1.02, 0], r: 0.05, r2: 0.13, h: 0.05, seg: 18 }] },
  ], 'furniture', { colliders: [[-0.17, 0, -0.17, 0.17, 1.4, 0.17]] });
}

export function fridge(P, x, y, z, yaw) {
  const b = [[-0.35, 0, -0.33, 0.35, 1.8, 0.33]];
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.03, boxes: b, tint: 0xe6e6e6 },
    { kind: 'metal', boxes: [{ cyl: [0.26, 1.2, 0.36], r: 0.012, h: 0.5, seg: 8 }, { cyl: [0.26, 0.55, 0.36], r: 0.012, h: 0.3, seg: 8 }], tint: 0x888888 },
    { kind: 'metal', boxes: [[-0.34, 0.99, 0.325, 0.34, 1.0, 0.335]], tint: 0x999999 },
  ], 'furniture', { colliders: b });
}

export function counter(P, x, y, z, yaw, len = 2.4) {
  const b = [[-len / 2, 0, -0.3, len / 2, 0.9, 0.3]];
  const doors = [];
  for (let dx = -len / 2 + 0.02; dx < len / 2 - 0.3; dx += 0.6) doors.push([dx, 0.1, 0.28, dx + 0.57, 0.84, 0.3]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.004, boxes: [[-len / 2, 0.08, -0.3, len / 2, 0.86, 0.28]], tint: 0xd9d3c7 },
    { kind: 'wood', round: 0.006, boxes: doors, tint: 0xe6e0d4 },
    { kind: 'marble', round: 0.01, boxes: [[-len / 2 - 0.01, 0.86, -0.31, len / 2 + 0.01, 0.9, 0.32]] },
    { kind: 'plastic', boxes: [[-len / 2, 0, -0.26, len / 2, 0.08, 0.24]], tint: 0x222222 },
  ], 'furniture', { colliders: b });
}

export function cooker(P, x, y, z, yaw) {
  const b = [[-0.3, 0, -0.3, 0.3, 0.9, 0.3]];
  const rings = [];
  for (const [a, c] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) rings.push({ cyl: [a, 0.91, c], r: 0.07, h: 0.02, seg: 16 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.02, boxes: b, tint: 0xcfd2d4 },
    { kind: 'metal', boxes: rings, tint: 0x1a1a1a },
    { kind: 'glass', boxes: [[-0.24, 0.2, 0.3, 0.24, 0.6, 0.31]] },
  ], 'furniture', { colliders: b });
}

// A propane cylinder. It is the thing in the building that explodes.
export function gasTank(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'gastank', boxes: [{ cyl: [0, 0.52, 0], r: 0.15, h: 0.92, seg: 20 }, { ball: [0, 0.98, 0], s: [0.15, 0.08, 0.15], rough: 0, detail: 2 }, { cyl: [0, 0.03, 0], r: 0.13, h: 0.06, seg: 20 }] },
    { kind: 'metal', boxes: [{ cyl: [0, 1.1, 0], r: 0.03, h: 0.12, seg: 10 }, { cylX: [0, 1.12, 0], r: 0.012, h: 0.12, seg: 8 }], tint: 0x999999 },
  ], 'tank', { colliders: [[-0.15, 0, -0.15, 0.15, 1.18, 0.15]] });
}

export function transformer(P, x, y, z, yaw) {
  const fins = [];
  for (let n = 0; n < 7; n++) fins.push([-0.95, 0.25, -0.55 + n * 0.18, -0.8, 1.6, -0.52 + n * 0.18]);
  const b = [[-0.8, 0, -0.6, 0.8, 1.9, 0.6]];
  return assembly(P, x, y, z, yaw, [
    { kind: 'transformer', round: 0.03, boxes: [...b, ...fins] },
    { kind: 'plastic', boxes: [{ cyl: [-0.4, 2.05, 0], r: 0.07, r2: 0.1, h: 0.3, seg: 12 }, { cyl: [0, 2.05, 0], r: 0.07, r2: 0.1, h: 0.3, seg: 12 }, { cyl: [0.4, 2.05, 0], r: 0.07, r2: 0.1, h: 0.3, seg: 12 }], tint: 0x8c6a3a },
  ], 'tank', { colliders: b });
}

export function electricalCabinet(P, x, y, z, yaw) {
  const b = [[-0.4, 0, -0.25, 0.4, 2, 0.25]];
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.015, boxes: b, tint: 0x8d9296 },
    { kind: 'metal', boxes: [{ cyl: [0.3, 1.0, 0.26], r: 0.015, h: 0.2, seg: 8 }], tint: 0x333333 },
  ], 'furniture', { colliders: b });
}

export function clothesRack(P, x, y, z, yaw) {
  const frame = [
    { cyl: [-0.78, 0.75, 0], r: 0.014, h: 1.5, seg: 8 }, { cyl: [0.78, 0.75, 0], r: 0.014, h: 1.5, seg: 8 },
    { cylX: [0, 1.49, 0], r: 0.012, h: 1.56, seg: 8 },
    { cylZ: [-0.78, 0.02, 0], r: 0.015, h: 0.5, seg: 8 }, { cylZ: [0.78, 0.02, 0], r: 0.015, h: 0.5, seg: 8 },
  ];
  const cols = [0x1b1b1f, 0x7a1f2a, 0xe9e4d8, 0x2a4a7a, 0x6b6b5a, 0xa87b4a];
  const parts = [{ kind: 'metal', boxes: frame, tint: 0xb8b8b8 }];
  for (let n = 0; n < 9; n++) {
    const gx = -0.65 + n * 0.16;
    // A garment hanging: soft, tapering, a little lumpy.
    parts.push({ kind: 'fabric', boxes: [{ ball: [gx, 1.1 - Math.random() * 0.1, 0], s: [0.05, 0.36 + Math.random() * 0.08, 0.2], rough: 0.12 }], tint: cols[(Math.random() * cols.length) | 0] });
  }
  return assembly(P, x, y, z, yaw, parts, 'furniture', { colliders: [[-0.8, 0, -0.25, 0.8, 1.5, 0.25]] });
}

export function displayTable(P, x, y, z, yaw) {
  const cols = [0xd8cfc0, 0x4a5a70, 0x8a3a3a, 0x2a2a2a];
  const parts = [{ kind: 'wood', round: 0.02, boxes: [[-0.9, 0, -0.5, 0.9, 0.8, 0.5]] }];
  for (let n = 0; n < 6; n++) {
    const fx = -0.55 + (n % 3) * 0.55, fz = -0.2 + Math.floor(n / 3) * 0.4;
    parts.push({ kind: 'fabric', round: 0.02, boxes: [[fx - 0.2, 0.8, fz - 0.15, fx + 0.2, 0.84 + Math.random() * 0.08, fz + 0.15]], tint: cols[n % cols.length] });
  }
  return assembly(P, x, y, z, yaw, parts, 'furniture', { colliders: [[-0.9, 0, -0.5, 0.9, 0.95, 0.5]] });
}

export function mannequin(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', boxes: [{ ball: [0, 1.68, 0], s: [0.1, 0.13, 0.11], rough: 0 }, { cyl: [0, 1.55, 0], r: 0.045, h: 0.08 }, { ball: [0, 1.28, 0], s: [0.2, 0.28, 0.12], rough: 0.05 }, { cyl: [-0.09, 0.55, 0], r: 0.055, r2: 0.04, h: 0.9 }, { cyl: [0.09, 0.55, 0], r: 0.055, r2: 0.04, h: 0.9 }], tint: 0xe8e0d8 },
    { kind: 'fabric', boxes: [{ ball: [0, 1.22, 0], s: [0.22, 0.3, 0.14], rough: 0.08 }], tint: 0x1a1a1a },
    { kind: 'metal', boxes: [{ cyl: [0, 0.04, 0], r: 0.2, h: 0.03, seg: 20 }, { cyl: [0, 0.1, 0], r: 0.012, h: 0.1 }], tint: 0x333333 },
  ], 'furniture', { colliders: [[-0.22, 0, -0.2, 0.22, 1.82, 0.2]] });
}

export function receptionDesk(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'marble', round: 0.03, boxes: [[-2.5, 0, -0.4, 2.5, 1.1, 0.4], [-2.6, 1.1, -0.5, 2.6, 1.15, 0.5]] },
    { kind: 'brass', boxes: [{ cylX: [0, 0.97, 0.42], r: 0.02, h: 5.1 }, { cylX: [0, 0.12, 0.42], r: 0.02, h: 5.1 }] },
  ], 'furniture', { colliders: [[-2.6, 0, -0.5, 2.6, 1.15, 0.5]] });
}

export function bench(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'marble', round: 0.03, boxes: [[-1.2, 0.4, -0.3, 1.2, 0.48, 0.3], [-1.1, 0, -0.25, -0.9, 0.4, 0.25], [0.9, 0, -0.25, 1.1, 0.4, 0.25]] },
  ], 'furniture', { colliders: [[-1.2, 0, -0.3, 1.2, 0.48, 0.3]] });
}

export function ceilingLight(P, x, yTop, z) {
  return assembly(P, x, yTop, z, 0, [
    { kind: 'metal', round: 0.015, boxes: [[-0.62, -0.06, -0.32, 0.62, 0, 0.32]], tint: 0xdddddd },
    { kind: 'lamp', round: 0.01, boxes: [[-0.58, -0.07, -0.28, 0.58, -0.05, 0.28]] },
  ], 'lamp', { hang: true });
}

export function chandelier(P, x, yTop, z) {
  const arms = [], bulbs = [];
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * TAU;
    const ax = Math.cos(a) * 0.6, az = Math.sin(a) * 0.6;
    arms.push({ cyl: [ax, -1.2, az], r: 0.03, r2: 0.05, h: 0.1, seg: 10 });
    bulbs.push({ ball: [ax, -1.08, az], s: [0.05, 0.08, 0.05], rough: 0, detail: 1 });
  }
  return assembly(P, x, yTop, z, 0, [
    { kind: 'brass', boxes: [{ cyl: [0, -0.6, 0], r: 0.015, h: 1.2, seg: 8 }, { ball: [0, -1.25, 0], s: [0.7, 0.05, 0.7], rough: 0, detail: 2 }, ...arms] },
    { kind: 'lamp', boxes: bulbs },
  ], 'lamp', { hang: true });
}
