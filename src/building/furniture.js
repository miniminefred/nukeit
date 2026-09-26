import { assembly } from './kit.js';

// Furniture. Each function stands one thing on the floor at (x, y, z), turned
// `yaw` radians, and returns the piece.
//
// Things are built from boxes in the materials they are really made of, so a
// desk splinters where its top is wood and rings where its legs are steel, and
// an office chair's seat burns while its base does not.

const r = (a, b) => a + Math.random() * (b - a);

export function desk(P, x, y, z, yaw) {
  const w = 1.4, d = 0.7, h = 0.74;
  const legs = [];
  for (const sx of [-w / 2 + 0.04, w / 2 - 0.08]) for (const sz of [-d / 2 + 0.04, d / 2 - 0.08]) legs.push([sx, 0, sz, sx + 0.04, h - 0.03, sz + 0.04]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-w / 2, h - 0.03, -d / 2, w / 2, h, d / 2], [-w / 2 + 0.05, h - 0.33, d / 2 - 0.03, w / 2 - 0.05, h - 0.03, d / 2 - 0.01]] },
    { kind: 'metal', boxes: legs, tint: 0x3a3c40 },
  ], 'furniture', { colliders: [[-w / 2, 0, -d / 2, w / 2, h, d / 2]] });
}

export function monitor(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', boxes: [[-0.12, 0, -0.1, 0.12, 0.02, 0.1], [-0.02, 0.02, -0.03, 0.02, 0.18, 0.0], [-0.3, 0.14, -0.02, 0.3, 0.5, 0.01]] },
    { kind: 'screen', boxes: [[-0.28, 0.16, 0.01, 0.28, 0.48, 0.015]] },
  ], 'furniture');
}

export function keyboard(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [{ kind: 'plastic', boxes: [[-0.22, 0, -0.07, 0.22, 0.025, 0.07]], tint: 0x2a2a2e }], 'furniture');
}

export function officeChair(P, x, y, z, yaw, tint = 0x2d3a55) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'fabric', boxes: [[-0.25, 0.44, -0.25, 0.25, 0.52, 0.25], [-0.23, 0.56, 0.2, 0.23, 1.05, 0.27]], tint },
    { kind: 'plastic', boxes: [[-0.03, 0.08, -0.03, 0.03, 0.44, 0.03], [-0.3, 0.04, -0.03, 0.3, 0.08, 0.03], [-0.03, 0.04, -0.3, 0.03, 0.08, 0.3], [-0.02, 0.52, 0.2, 0.02, 0.58, 0.24]] },
  ], 'furniture', { colliders: [[-0.3, 0, -0.3, 0.3, 0.52, 0.3], [-0.23, 0.52, 0.2, 0.23, 1.05, 0.27]] });
}

export function filingCabinet(P, x, y, z, yaw) {
  const b = [[-0.23, 0, -0.3, 0.23, 1.32, 0.3]];
  const handles = [];
  for (let n = 0; n < 4; n++) handles.push([-0.08, 0.2 + n * 0.32, 0.3, 0.08, 0.23 + n * 0.32, 0.33]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: b, tint: 0x9aa0a6 },
    { kind: 'metal', boxes: handles, tint: 0x505458 },
  ], 'furniture', { colliders: b });
}

export function bookshelf(P, x, y, z, yaw) {
  const w = 1.0, d = 0.35, h = 2.0;
  const frame = [[-w / 2, 0, -d / 2, -w / 2 + 0.02, h, d / 2], [w / 2 - 0.02, 0, -d / 2, w / 2, h, d / 2], [-w / 2, 0, -d / 2, w / 2, h, -d / 2 + 0.01]];
  const books = [];
  for (let s = 0; s < 5; s++) {
    const sy = s * 0.4;
    frame.push([-w / 2, sy, -d / 2, w / 2, sy + 0.02, d / 2]);
    let bx = -w / 2 + 0.03;
    while (bx < w / 2 - 0.08) {
      const bw = r(0.025, 0.06), bh = r(0.22, 0.34);
      books.push([bx, sy + 0.02, -d / 2 + 0.03, bx + bw, sy + 0.02 + bh, d / 2 - 0.04]);
      bx += bw + 0.004;
    }
  }
  frame.push([-w / 2, h - 0.02, -d / 2, w / 2, h, d / 2]);
  const cols = [0x6a2020, 0x1f3c64, 0x2e4d2a, 0x7a6a3a, 0x3a2a4a];
  // Books in a few colours, one part per colour.
  const byCol = cols.map((tint) => ({ kind: 'paper', boxes: [], tint }));
  books.forEach((b, i) => byCol[(i * 7 + (i >> 2)) % cols.length].boxes.push(b));
  return assembly(P, x, y, z, yaw, [{ kind: 'wood', boxes: frame }, ...byCol.filter((b) => b.boxes.length)], 'furniture',
    { colliders: [[-w / 2, 0, -d / 2, w / 2, h, d / 2]] });
}

export function sofa(P, x, y, z, yaw, tint = 0x4a3a30) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'leather', boxes: [[-1, 0.12, -0.45, 1, 0.45, 0.45], [-1, 0.45, 0.25, 1, 0.85, 0.45], [-1, 0.45, -0.45, -0.8, 0.65, 0.25], [0.8, 0.45, -0.45, 1, 0.65, 0.25]], tint },
    { kind: 'metal', boxes: [[-0.95, 0, -0.4, -0.9, 0.12, -0.35], [0.9, 0, -0.4, 0.95, 0.12, -0.35], [-0.95, 0, 0.35, -0.9, 0.12, 0.4], [0.9, 0, 0.35, 0.95, 0.12, 0.4]], tint: 0x202020 },
  ], 'furniture', { colliders: [[-1, 0, -0.45, 1, 0.45, 0.45], [-1, 0.45, 0.25, 1, 0.85, 0.45]] });
}

export function meetingTable(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-1.6, 0.72, -0.6, 1.6, 0.76, 0.6], [-1.2, 0, -0.08, -1.1, 0.72, 0.08], [1.1, 0, -0.08, 1.2, 0.72, 0.08], [-1.2, 0.05, -0.05, 1.2, 0.12, 0.05]] },
  ], 'furniture', { colliders: [[-1.6, 0, -0.6, 1.6, 0.76, 0.6]] });
}

export function plant(P, x, y, z, big = false) {
  const s = big ? 1.5 : 1;
  const leaves = [];
  for (let n = 0; n < 7; n++) {
    const a = n * 0.9, rr = r(0.05, 0.18) * s, hh = r(0.5, 1.0) * s;
    leaves.push([Math.cos(a) * rr - 0.09 * s, 0.4 * s + hh * 0.3, Math.sin(a) * rr - 0.09 * s, Math.cos(a) * rr + 0.09 * s, 0.4 * s + hh, Math.sin(a) * rr + 0.09 * s]);
  }
  return assembly(P, x, y, z, 0, [
    { kind: 'plastic', boxes: [[-0.2 * s, 0, -0.2 * s, 0.2 * s, 0.4 * s, 0.2 * s]], tint: 0xd8d2c8 },
    { kind: 'soil', boxes: [[-0.18 * s, 0.38 * s, -0.18 * s, 0.18 * s, 0.4 * s, 0.18 * s]] },
    { kind: 'leaves', boxes: leaves },
  ], 'furniture', { colliders: [[-0.2 * s, 0, -0.2 * s, 0.2 * s, 1.3 * s, 0.2 * s]] });
}

export function waterCooler(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', boxes: [[-0.17, 0, -0.17, 0.17, 1.0, 0.17]], tint: 0xe8e8ea },
    { kind: 'glass', boxes: [[-0.13, 1.0, -0.13, 0.13, 1.4, 0.13]] },
  ], 'furniture', { colliders: [[-0.17, 0, -0.17, 0.17, 1.4, 0.17]] });
}

export function fridge(P, x, y, z, yaw) {
  const b = [[-0.35, 0, -0.33, 0.35, 1.8, 0.33]];
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: b, tint: 0xe6e6e6 },
    { kind: 'metal', boxes: [[0.25, 0.9, 0.33, 0.28, 1.5, 0.36]], tint: 0x888888 },
  ], 'furniture', { colliders: b });
}

export function counter(P, x, y, z, yaw, len = 2.4) {
  const b = [[-len / 2, 0, -0.3, len / 2, 0.88, 0.3]];
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-len / 2, 0.08, -0.3, len / 2, 0.86, 0.28]], tint: 0xd9d3c7 },
    { kind: 'marble', boxes: [[-len / 2, 0.86, -0.31, len / 2, 0.9, 0.31]] },
    { kind: 'plastic', boxes: [[-len / 2, 0, -0.26, len / 2, 0.08, 0.24]], tint: 0x222222 },
  ], 'furniture', { colliders: b });
}

export function cooker(P, x, y, z, yaw) {
  const b = [[-0.3, 0, -0.3, 0.3, 0.9, 0.3]];
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', boxes: b, tint: 0xcfd2d4 },
    { kind: 'metal', boxes: [[-0.2, 0.9, -0.2, -0.05, 0.92, -0.05], [0.05, 0.9, -0.2, 0.2, 0.92, -0.05], [-0.2, 0.9, 0.05, -0.05, 0.92, 0.2], [0.05, 0.9, 0.05, 0.2, 0.92, 0.2]], tint: 0x1a1a1a },
  ], 'furniture', { colliders: b });
}

// A propane cylinder. It is the thing in the building that explodes.
export function gasTank(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'gastank', boxes: [[-0.15, 0.02, -0.15, 0.15, 1.1, 0.15], [-0.12, 0, -0.12, 0.12, 0.02, 0.12]] },
    { kind: 'metal', boxes: [[-0.04, 1.1, -0.04, 0.04, 1.22, 0.04]], tint: 0x999999 },
  ], 'tank', { colliders: [[-0.15, 0, -0.15, 0.15, 1.22, 0.15]] });
}

export function transformer(P, x, y, z, yaw) {
  const fins = [];
  for (let n = 0; n < 6; n++) fins.push([-0.9, 0.2, -0.6 + n * 0.24, -0.8, 1.6, -0.56 + n * 0.24]);
  const b = [[-0.8, 0, -0.6, 0.8, 1.9, 0.6]];
  return assembly(P, x, y, z, yaw, [
    { kind: 'transformer', boxes: [...b, ...fins] },
    { kind: 'plastic', boxes: [[-0.5, 1.9, -0.1, -0.35, 2.2, 0.05], [0.35, 1.9, -0.1, 0.5, 2.2, 0.05]], tint: 0x8c6a3a },
  ], 'tank', { colliders: b });
}

export function electricalCabinet(P, x, y, z, yaw) {
  const b = [[-0.4, 0, -0.25, 0.4, 2, 0.25]];
  return assembly(P, x, y, z, yaw, [{ kind: 'metal', boxes: b, tint: 0x8d9296 }], 'furniture', { colliders: b });
}

export function clothesRack(P, x, y, z, yaw) {
  const frame = [[-0.8, 0, -0.03, -0.77, 1.5, 0.03], [0.77, 0, -0.03, 0.8, 1.5, 0.03], [-0.8, 1.47, -0.02, 0.8, 1.5, 0.02], [-0.85, 0, -0.25, -0.72, 0.03, 0.25], [0.72, 0, -0.25, 0.85, 0.03, 0.25]];
  const cols = [0x1b1b1f, 0x7a1f2a, 0xe9e4d8, 0x2a4a7a, 0x6b6b5a, 0xa87b4a];
  const parts = [{ kind: 'metal', boxes: frame, tint: 0xb8b8b8 }];
  for (let n = 0; n < 9; n++) {
    const gx = -0.7 + n * 0.17;
    parts.push({ kind: 'fabric', boxes: [[gx, 0.55 + Math.random() * 0.2, -0.22, gx + 0.12, 1.45, 0.22]], tint: cols[(Math.random() * cols.length) | 0] });
  }
  return assembly(P, x, y, z, yaw, parts, 'furniture', { colliders: [[-0.85, 0, -0.25, 0.85, 1.5, 0.25]] });
}

export function displayTable(P, x, y, z, yaw) {
  const cols = [0xd8cfc0, 0x4a5a70, 0x8a3a3a, 0x2a2a2a];
  const parts = [{ kind: 'wood', boxes: [[-0.9, 0, -0.5, 0.9, 0.8, 0.5]] }];
  for (let n = 0; n < 6; n++) {
    const fx = -0.75 + (n % 3) * 0.55, fz = -0.35 + Math.floor(n / 3) * 0.4;
    parts.push({ kind: 'fabric', boxes: [[fx, 0.8, fz, fx + 0.4, 0.8 + 0.05 + Math.random() * 0.1, fz + 0.3]], tint: cols[n % cols.length] });
  }
  return assembly(P, x, y, z, yaw, parts, 'furniture', { colliders: [[-0.9, 0, -0.5, 0.9, 0.95, 0.5]] });
}

export function mannequin(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'plastic', boxes: [[-0.12, 1.55, -0.1, 0.12, 1.8, 0.12], [-0.2, 1.0, -0.12, 0.2, 1.52, 0.12], [-0.16, 0.08, -0.08, -0.03, 1.0, 0.08], [0.03, 0.08, -0.08, 0.16, 1.0, 0.08]], tint: 0xe8e0d8 },
    { kind: 'fabric', boxes: [[-0.22, 0.95, -0.14, 0.22, 1.5, 0.14]], tint: 0x1a1a1a },
    { kind: 'metal', boxes: [[-0.2, 0, -0.2, 0.2, 0.08, 0.2]], tint: 0x333333 },
  ], 'furniture', { colliders: [[-0.22, 0, -0.2, 0.22, 1.8, 0.2]] });
}

export function receptionDesk(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'marble', boxes: [[-2.5, 0, -0.4, 2.5, 1.1, 0.4], [-2.6, 1.1, -0.5, 2.6, 1.15, 0.5]] },
    { kind: 'brass', boxes: [[-2.55, 0.95, 0.4, 2.55, 1.0, 0.43], [-2.55, 0.1, 0.4, 2.55, 0.15, 0.43]] },
  ], 'furniture', { colliders: [[-2.6, 0, -0.5, 2.6, 1.15, 0.5]] });
}

export function bench(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'marble', boxes: [[-1.2, 0.4, -0.3, 1.2, 0.48, 0.3], [-1.1, 0, -0.25, -0.9, 0.4, 0.25], [0.9, 0, -0.25, 1.1, 0.4, 0.25]] },
  ], 'furniture', { colliders: [[-1.2, 0, -0.3, 1.2, 0.48, 0.3]] });
}

export function ceilingLight(P, x, yTop, z) {
  return assembly(P, x, yTop, z, 0, [
    { kind: 'metal', boxes: [[-0.62, -0.06, -0.32, 0.62, 0, 0.32]], tint: 0xdddddd },
    { kind: 'lamp', boxes: [[-0.58, -0.07, -0.28, 0.58, -0.06, 0.28]] },
  ], 'lamp', { hang: true });
}

export function chandelier(P, x, yTop, z) {
  const arms = [];
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * Math.PI * 2;
    arms.push([Math.cos(a) * 0.6 - 0.03, -1.3, Math.sin(a) * 0.6 - 0.03, Math.cos(a) * 0.6 + 0.03, -1.1, Math.sin(a) * 0.6 + 0.03]);
  }
  return assembly(P, x, yTop, z, 0, [
    { kind: 'brass', boxes: [[-0.03, -1.2, -0.03, 0.03, 0, 0.03], [-0.7, -1.25, -0.7, 0.7, -1.2, 0.7], ...arms] },
    { kind: 'lamp', boxes: arms.map((b) => [b[0], b[4], b[2], b[3], b[4] + 0.08, b[5]]) },
  ], 'lamp', { hang: true });
}
