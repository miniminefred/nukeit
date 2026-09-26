import { assembly } from './kit.js';

// The furniture of a home: the penthouse at the top of the tower.
// Same conventions as furniture.js — stand it at (x, y, z), turn it `yaw`.

const TAU = Math.PI * 2;

// A bed, head against -z. `w` 1.6 for a double, 2.0 for the master.
export function bed(P, x, y, z, yaw, w = 1.6, cover = 0x7a2a32) {
  const L = 2.1;
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-w / 2 - 0.05, 0.08, -L / 2, w / 2 + 0.05, 0.36, L / 2], [-w / 2 - 0.08, 0, -L / 2 - 0.08, w / 2 + 0.08, 1.25, -L / 2]] },
    { kind: 'fabric', round: 0.04, boxes: [[-w / 2 - 0.02, 0.5, -L / 2 - 0.04, w / 2 + 0.02, 1.2, -L / 2 + 0.03]], tint: 0xcdbb9a },
    { kind: 'linen', round: 0.08, boxes: [[-w / 2, 0.36, -L / 2 + 0.02, w / 2, 0.6, L / 2 - 0.02]] },
    { kind: 'fabric', round: 0.05, boxes: [[-w / 2 - 0.03, 0.55, -L / 2 + 0.7, w / 2 + 0.03, 0.66, L / 2 + 0.02]], tint: cover },
    { kind: 'linen', boxes: [{ ball: [-w / 4, 0.7, -L / 2 + 0.3], s: [w / 4.4, 0.08, 0.2], rough: 0.05 }, { ball: [w / 4, 0.7, -L / 2 + 0.3], s: [w / 4.4, 0.08, 0.2], rough: 0.05 }] },
  ], 'furniture', { colliders: [[-w / 2 - 0.08, 0, -L / 2 - 0.08, w / 2 + 0.08, 0.66, L / 2]] });
}

export function nightstand(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.015, boxes: [[-0.25, 0, -0.2, 0.25, 0.55, 0.2]] },
    { kind: 'gold', boxes: [{ cylX: [0, 0.4, 0.21], r: 0.008, h: 0.12, seg: 8 }] },
    { kind: 'gold', boxes: [{ cyl: [0.1, 0.57, 0], r: 0.06, h: 0.03 }, { cyl: [0.1, 0.72, 0], r: 0.01, h: 0.3, seg: 8 }] },
    { kind: 'linen', boxes: [{ cyl: [0.1, 0.92, 0], r: 0.1, r2: 0.15, h: 0.18, seg: 16 }] },
  ], 'furniture', { colliders: [[-0.25, 0, -0.2, 0.25, 0.55, 0.2]] });
}

export function wardrobe(P, x, y, z, yaw, w = 1.8) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-w / 2, 0, -0.3, w / 2, 2.3, 0.3]], tint: 0xe8e0d0 },
    { kind: 'gold', boxes: [{ cyl: [-0.05, 1.1, 0.31], r: 0.01, h: 0.4, seg: 8 }, { cyl: [0.05, 1.1, 0.31], r: 0.01, h: 0.4, seg: 8 }] },
    { kind: 'wood', boxes: [[-0.005, 0.02, 0.3, 0.005, 2.28, 0.305]], tint: 0x9a9080 },
  ], 'furniture', { colliders: [[-w / 2, 0, -0.3, w / 2, 2.3, 0.3]] });
}

export function rug(P, x, y, z, w, d, tint = 0x6a2230) {
  return assembly(P, x, y, z, 0, [
    { kind: 'fabric', round: 0.005, boxes: [[-w / 2, 0, -d / 2, w / 2, 0.015, d / 2]], tint },
    { kind: 'fabric', boxes: [[-w / 2 + 0.15, 0.015, -d / 2 + 0.15, w / 2 - 0.15, 0.018, d / 2 - 0.15]], tint: 0xc9a043 },
  ], 'carpet');
}

export function armchair(P, x, y, z, yaw, tint = 0xe6dcc4) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'fabric', round: 0.07, boxes: [[-0.45, 0.12, -0.42, 0.45, 0.45, 0.42], [-0.45, 0.45, 0.22, 0.45, 1.0, 0.42], [-0.45, 0.45, -0.42, -0.3, 0.7, 0.3], [0.3, 0.45, -0.42, 0.45, 0.7, 0.3]], tint },
    { kind: 'gold', boxes: [[-0.4, 0, -0.37], [0.4, 0, -0.37], [-0.4, 0, 0.37], [0.4, 0, 0.37]].map(([a, , c]) => ({ cyl: [a, 0.06, c], r: 0.025, r2: 0.015, h: 0.12, seg: 8 })) },
  ], 'furniture', { colliders: [[-0.45, 0, -0.42, 0.45, 1.0, 0.42]] });
}

export function coffeeTable(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'marble', round: 0.02, boxes: [[-0.7, 0.38, -0.4, 0.7, 0.44, 0.4]] },
    { kind: 'gold', boxes: [[-0.6, 0, -0.3, -0.56, 0.38, 0.3], [0.56, 0, -0.3, 0.6, 0.38, 0.3]] },
    { kind: 'glass', boxes: [{ cyl: [0.3, 0.52, 0.05], r: 0.08, r2: 0.05, h: 0.16, seg: 14 }] },
  ], 'furniture', { colliders: [[-0.7, 0, -0.4, 0.7, 0.44, 0.4]] });
}

export function piano(P, x, y, z, yaw) {
  const legs = [[-0.6, -0.5], [0.6, -0.5], [0, 0.9]].map(([a, c]) => ({ cyl: [a, 0.33, c], r: 0.05, r2: 0.04, h: 0.66, seg: 10 }));
  const keys = [];
  for (let n = 0; n < 26; n++) keys.push([-0.65 + n * 0.05, 0.7, -0.78, -0.65 + n * 0.05 + 0.045, 0.72, -0.62]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'lacquer', round: 0.05, boxes: [[-0.75, 0.66, -0.6, 0.75, 0.98, 0.6], [-0.55, 0.66, 0.6, 0.55, 0.98, 1.1], [-0.75, 0.66, -0.8, 0.75, 0.7, -0.6], ...legs] },
    { kind: 'ceramic', boxes: keys },
    { kind: 'lacquer', boxes: [[-0.7, 0.98, -0.55, 0.7, 1.0, 0.95]] },
  ], 'furniture', { colliders: [[-0.75, 0, -0.8, 0.75, 1.0, 1.1]] });
}

// A marble fireplace against a wall (back at -z), with a fire laid in it.
export function fireplace(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'marble', round: 0.02, boxes: [[-1, 0, -0.3, -0.6, 1.2, 0.1], [0.6, 0, -0.3, 1, 1.2, 0.1], [-1.1, 1.2, -0.3, 1.1, 1.35, 0.18], [-1, 0, -0.3, 1, 0.08, 0.35]] },
    { kind: 'concrete', boxes: [[-0.6, 0.08, -0.3, 0.6, 1.2, -0.25]], tint: 0x333030 },
    { kind: 'wood', boxes: [{ cylX: [0, 0.18, -0.08], r: 0.06, h: 0.7, seg: 8 }, { cylX: [0, 0.28, -0.05], r: 0.05, h: 0.6, seg: 8 }], tint: 0x6a4a30 },
    { kind: 'gold', boxes: [{ ball: [-0.7, 1.45, 0.02], s: [0.08, 0.1, 0.08], rough: 0 }, { ball: [0.7, 1.45, 0.02], s: [0.08, 0.1, 0.08], rough: 0 }] },
  ], 'furniture', { colliders: [[-1.1, 0, -0.3, 1.1, 1.35, 0.35]] });
}

export function bathtub(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'ceramic', round: 0.1, boxes: [[-0.85, 0, -0.4, 0.85, 0.58, 0.4]] },
    { kind: 'marble', boxes: [[-0.75, 0.08, -0.3, 0.75, 0.1, 0.3]], tint: 0xd8e4ea },
    { kind: 'gold', boxes: [{ cyl: [0.72, 0.7, 0], r: 0.02, h: 0.24, seg: 10 }, { cylX: [0.64, 0.8, 0], r: 0.015, h: 0.16, seg: 8 }] },
  ], 'furniture', { colliders: [[-0.85, 0, -0.4, 0.85, 0.58, 0.4]] });
}

export function toilet(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'ceramic', round: 0.05, boxes: [{ cyl: [0, 0.2, 0.1], r: 0.18, r2: 0.13, h: 0.4, seg: 18 }, [-0.2, 0.3, -0.28, 0.2, 0.75, -0.1]] },
    { kind: 'ceramic', boxes: [{ cyl: [0, 0.41, 0.1], r: 0.2, h: 0.03, seg: 18 }] },
    { kind: 'gold', boxes: [{ cylX: [0.12, 0.7, -0.09], r: 0.012, h: 0.06, seg: 8 }] },
  ], 'furniture', { colliders: [[-0.2, 0, -0.28, 0.2, 0.75, 0.3]] });
}

export function vanity(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.01, boxes: [[-0.6, 0, -0.25, 0.6, 0.8, 0.25]], tint: 0xe8e0d0 },
    { kind: 'marble', round: 0.01, boxes: [[-0.62, 0.8, -0.27, 0.62, 0.85, 0.27]] },
    { kind: 'ceramic', boxes: [{ cyl: [0, 0.87, 0.02], r: 0.18, r2: 0.12, h: 0.06, seg: 18 }] },
    { kind: 'gold', boxes: [{ cyl: [0, 0.95, -0.18], r: 0.015, h: 0.2, seg: 8 }] },
    { kind: 'glass', boxes: [[-0.5, 1.05, -0.26, 0.5, 1.9, -0.25]] },
  ], 'furniture', { colliders: [[-0.62, 0, -0.27, 0.62, 0.85, 0.27]] });
}

export function tv(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-1, 0, -0.22, 1, 0.5, 0.22]], tint: 0x2a2420 },
    { kind: 'plastic', round: 0.01, boxes: [[-0.8, 0.55, -0.04, 0.8, 1.45, 0.0], [-0.1, 0.5, -0.06, 0.1, 0.55, 0.06]], tint: 0x111111 },
    { kind: 'screen', boxes: [[-0.78, 0.57, 0.0, 0.78, 1.43, 0.004]] },
  ], 'furniture', { colliders: [[-1, 0, -0.22, 1, 1.45, 0.22]] });
}

export function diningTable(P, x, y, z, yaw, len = 3.6) {
  const legs = [];
  for (const sx of [-len / 2 + 0.2, len / 2 - 0.2]) for (const sz of [-0.4, 0.4]) legs.push({ cyl: [sx, 0.37, sz], r: 0.045, r2: 0.03, h: 0.74, seg: 10 });
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-len / 2, 0.72, -0.55, len / 2, 0.77, 0.55]], tint: 0x6a3a22 },
    { kind: 'wood', boxes: legs, tint: 0x6a3a22 },
    { kind: 'gold', boxes: [{ cyl: [-0.6, 0.9, 0], r: 0.04, r2: 0.06, h: 0.26, seg: 12 }, { cyl: [0.6, 0.9, 0], r: 0.04, r2: 0.06, h: 0.26, seg: 12 }] },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.55, len / 2, 0.77, 0.55]] });
}

// A dining chair, back at +z.
export function diningChair(P, x, y, z, yaw, tint = 0xd8c8a0) {
  const legs = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([a, c]) => ({ cyl: [a, 0.22, c], r: 0.02, h: 0.44, seg: 8 }));
  return assembly(P, x, y, z, yaw, [
    { kind: 'fabric', round: 0.03, boxes: [[-0.23, 0.44, -0.23, 0.23, 0.52, 0.23], [-0.22, 0.56, 0.19, 0.22, 1.0, 0.24]], tint },
    { kind: 'gold', boxes: [...legs, { cyl: [-0.21, 0.76, 0.22], r: 0.015, h: 0.5, seg: 8 }, { cyl: [0.21, 0.76, 0.22], r: 0.015, h: 0.5, seg: 8 }] },
  ], 'furniture', { colliders: [[-0.24, 0, -0.24, 0.24, 1.0, 0.25]] });
}

export { TAU };
