import { assembly } from './kit.js';

// The working parts of the building and the boss's floor: the lower level's
// vault, loading dock and plant, and the Trump Organization's office and
// boardroom. Like all the furniture: real materials, rounded, never a block.

const TAU = Math.PI * 2;

// The vault door: a round steel door a hand thick in a steel frame, standing
// open on its hinge, its bolts showing.
export function vaultDoor(P, x, y, z, yaw) {
  const bolts = [];
  for (let n = 0; n < 8; n++) {
    const a = (n / 8) * TAU;
    bolts.push({ cylZ: [Math.cos(a) * 0.82, 1.1 + Math.sin(a) * 0.82, 0.34], r: 0.05, h: 0.28, seg: 10 });
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', boxes: [{ cylZ: [0, 1.1, 0.18], r: 1.0, h: 0.36, seg: 36 }, ...bolts], tint: 0x9aa0a6 },
    { kind: 'brass', boxes: [{ cylZ: [0, 1.1, 0.4], r: 0.28, h: 0.08, seg: 20 }, { cylZ: [0, 1.1, 0.46], r: 0.05, h: 0.12, seg: 10 }] },
  ], 'furniture', { colliders: [[-1, 0.1, 0, 1, 2.1, 0.4]] });
}

// A wall of safe-deposit boxes.
export function depositBoxes(P, x, y, z, yaw, w = 3) {
  const doors = [];
  for (let i = 0; i < Math.round(w / 0.3); i++) for (let j = 0; j < 7; j++) doors.push([-w / 2 + i * 0.3 + 0.02, 0.2 + j * 0.3 + 0.02, 0.4, -w / 2 + i * 0.3 + 0.28, 0.2 + j * 0.3 + 0.28, 0.43]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', round: 0.01, boxes: [[-w / 2, 0, 0, w / 2, 2.3, 0.4]], tint: 0x6e7479 },
    { kind: 'brass', boxes: doors },
  ], 'furniture', { colliders: [[-w / 2, 0, 0, w / 2, 2.3, 0.43]] });
}

// Gold: a table of bars, stacked.
export function goldStack(P, x, y, z, yaw) {
  const bars = [];
  for (let l = 0; l < 3; l++) for (let i = 0; i < 5 - l; i++) for (let k = 0; k < 2; k++)
    bars.push([-0.6 + l * 0.12 + i * 0.25, 0.78 + l * 0.07, -0.18 + k * 0.2, -0.6 + l * 0.12 + i * 0.25 + 0.22, 0.85 + l * 0.07, -0.18 + k * 0.2 + 0.1]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', round: 0.01, boxes: [[-0.8, 0.74, -0.35, 0.8, 0.78, 0.35], [-0.76, 0, -0.31, -0.7, 0.74, -0.25], [0.7, 0, -0.31, 0.76, 0.74, -0.25], [-0.76, 0, 0.25, -0.7, 0.74, 0.31], [0.7, 0, 0.25, 0.76, 0.74, 0.31]], tint: 0x444a50 },
    { kind: 'gold', round: 0.01, boxes: bars },
  ], 'furniture', { colliders: [[-0.8, 0, -0.35, 0.8, 1.0, 0.35]] });
}

// A pallet with crates on it.
export function palletCrates(P, x, y, z, yaw, high = 2) {
  const crates = [];
  for (let l = 0; l < high; l++) for (const [cx, cz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) {
    if (l === high - 1 && Math.random() < 0.3) continue;
    crates.push([cx - 0.28, 0.14 + l * 0.5, cz - 0.23, cx + 0.28, 0.62 + l * 0.5, cz + 0.23]);
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-0.6, 0, -0.5, 0.6, 0.03, 0.5], [-0.6, 0.1, -0.5, 0.6, 0.14, 0.5], [-0.6, 0.03, -0.5, -0.5, 0.1, 0.5], [0.5, 0.03, -0.5, 0.6, 0.1, 0.5]], tint: 0xb89a6a },
    { kind: 'wood', round: 0.01, boxes: crates, tint: 0xa8834e },
  ], 'furniture', { colliders: [[-0.6, 0, -0.5, 0.6, 0.14 + high * 0.5, 0.5]] });
}

// A forklift, parked, forks down.
export function forklift(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.05, boxes: [[-0.55, 0.3, -0.9, 0.55, 1.1, 0.7], [-0.5, 1.1, 0.1, 0.5, 1.25, 0.7]], tint: 0xe0a81a },
    { kind: 'metal', boxes: [[-0.5, 1.25, 0.1, -0.45, 2.2, 0.15], [0.45, 1.25, 0.1, 0.5, 2.2, 0.15], [-0.5, 1.25, 0.65, -0.45, 2.2, 0.7], [0.45, 1.25, 0.65, 0.5, 2.2, 0.7], [-0.5, 2.2, 0.1, 0.5, 2.25, 0.7],
      [-0.5, 0.1, -1.05, -0.4, 2.3, -0.95], [0.4, 0.1, -1.05, 0.5, 2.3, -0.95], [-0.4, 0.05, -2.1, -0.25, 0.1, -0.95], [0.25, 0.05, -2.1, 0.4, 0.1, -0.95]], tint: 0x2a2a2a },
    { kind: 'plastic', boxes: [{ cylX: [-0.55, 0.28, -0.55], r: 0.28, h: 0.2 }, { cylX: [0.55, 0.28, -0.55], r: 0.28, h: 0.2 }, { cylX: [-0.55, 0.22, 0.45], r: 0.22, h: 0.2 }, { cylX: [0.55, 0.22, 0.45], r: 0.22, h: 0.2 }], tint: 0x151515 },
  ], 'furniture', { colliders: [[-0.6, 0, -2.1, 0.6, 2.3, 0.75]] });
}

// A boiler and its pipes.
export function boiler(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'steel', boxes: [{ cyl: [0, 1.2, 0], r: 0.7, h: 2.2, seg: 24 }, { ball: [0, 2.3, 0], s: [0.7, 0.25, 0.7], rough: 0 }], tint: 0xa05a3a },
    { kind: 'steel', boxes: [{ cyl: [0.5, 2.9, 0], r: 0.12, h: 1.2 }, { cylX: [1.2, 3.45, 0], r: 0.12, h: 1.5 }, { cylZ: [-0.8, 0.5, 0], r: 0.08, h: 1.6 }], tint: 0x8a8d90 },
  ], 'furniture', { colliders: [[-0.75, 0, -0.75, 0.75, 2.5, 0.75]] });
}

// The desk in the corner office: dark wood, a leather top, brass.
export function executiveDesk(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.02, boxes: [[-1.3, 0.72, -0.55, 1.3, 0.78, 0.55], [-1.3, 0, -0.55, -0.6, 0.72, 0.55], [0.6, 0, -0.55, 1.3, 0.72, 0.55], [-0.6, 0.1, 0.4, 0.6, 0.72, 0.5]], tint: 0x4a2a18 },
    { kind: 'leather', round: 0.005, boxes: [[-0.9, 0.78, -0.35, 0.9, 0.79, 0.35]], tint: 0x1a2a20 },
    { kind: 'brass', boxes: [{ cylX: [0, 0.76, -0.56], r: 0.012, h: 2.6 }, { cyl: [0.95, 0.95, -0.2], r: 0.08, r2: 0.12, h: 0.32 }] },
  ], 'furniture', { colliders: [[-1.3, 0, -0.55, 1.3, 0.8, 0.55]] });
}

// The boardroom table: long, glossy, twelve places.
export function boardTable(P, x, y, z, yaw, len = 6) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', round: 0.03, boxes: [[-len / 2, 0.7, -0.75, len / 2, 0.76, 0.75]], tint: 0x3a2014 },
    { kind: 'wood', round: 0.02, boxes: [[-len / 2 + 0.6, 0, -0.3, -len / 2 + 1.0, 0.7, 0.3], [len / 2 - 1.0, 0, -0.3, len / 2 - 0.6, 0.7, 0.3], [-0.2, 0, -0.3, 0.2, 0.7, 0.3]], tint: 0x2a160e },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.75, len / 2, 0.76, 0.75]] });
}

// A spare fire extinguisher: a red canister with its black hose and handle.
// On the wall in a red bracket with a sign over it by the lifts, or standing
// on the floor somewhere less obvious. Tagged, so you can take it (E).
export function extinguisher(P, x, y, z, yaw, onWall = false) {
  const h = onWall ? 1.0 : 0;
  const parts = [
    { kind: 'metal', round: 0.02, boxes: [{ cyl: [0, h + 0.3, 0], r: 0.085, h: 0.52, seg: 16 }, { ball: [0, h + 0.56, 0], s: [0.085, 0.05, 0.085], rough: 0 }], tint: 0xc4161c },
    { kind: 'plastic', boxes: [{ cyl: [0.02, h + 0.64, 0], r: 0.025, h: 0.08, seg: 8 }, [-0.02, h + 0.67, -0.015, 0.12, h + 0.69, 0.015], { cylX: [0.11, h + 0.45, 0.04], r: 0.012, h: 0.22, seg: 6 }], tint: 0x111111 },
  ];
  if (onWall) parts.push(
    { kind: 'metal', boxes: [[-0.1, h + 0.12, -0.11, 0.1, h + 0.16, -0.08], [-0.03, h + 0.12, -0.12, 0.03, h + 0.62, -0.1]], tint: 0x8a1010 },
    { kind: 'plastic', boxes: [[-0.14, h + 0.8, -0.12, 0.14, h + 1.08, -0.11]], tint: 0xd8201f },
  );
  // On the wall it is fixed to the wall (support.js: cladding), its bracket against it.
  return assembly(P, x, y, z, yaw, parts, onWall ? 'cladding' : 'furniture', { tag: 'extinguisher', structural: false, colliders: [[-0.1, h, -0.12, 0.13, h + 0.7, 0.1]] });
}

// A hi-vis vest and a white hard hat on a low cabinet in goods receiving. Put
// them on (E) and security takes you for one of the contractors — until they
// see you break something close up.
export function hiVis(P, x, y, z, yaw) {
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.01, boxes: [[-0.4, 0, -0.25, 0.4, 0.8, 0.25]], tint: 0x5a6068 },
    { kind: 'fabric', round: 0.02, boxes: [[-0.25, 0.8, -0.18, 0.25, 0.86, 0.18], [-0.22, 0.86, -0.15, -0.08, 0.9, 0.12], [0.08, 0.86, -0.15, 0.22, 0.9, 0.12]], tint: 0xd8ff1a },
    { kind: 'plastic', boxes: [{ ball: [0.12, 0.98, 0.05], s: [0.15, 0.09, 0.17], rough: 0 }, [-0.02, 0.92, -0.12, 0.26, 0.935, 0.22]], tint: 0xf4f4f0 },
  ], 'furniture', { tag: 'disguise', structural: false, colliders: [[-0.4, 0, -0.25, 0.4, 1.05, 0.25]] });
}

// Money: a pallet of banded notes, shrink-wrapped, a bag's worth (tag 'money':
// sim/heist.js fills a bag from it, and it goes).
export function moneyStack(P, x, y, z, yaw) {
  const bricks = [], bands = [];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) {
    const bx = -0.45 + i * 0.24, bz = -0.3 + k * 0.21, by = 0.14 + j * 0.13;
    bricks.push([bx, by, bz, bx + 0.22, by + 0.12, bz + 0.19]);
    bands.push([bx + 0.09, by - 0.002, bz - 0.002, bx + 0.13, by + 0.122, bz + 0.192]);
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'wood', boxes: [[-0.5, 0, -0.35, 0.5, 0.14, 0.35]], tint: 0x9a7a52 },
    { kind: 'paper', boxes: bricks, tint: 0x7a9a6a },
    { kind: 'paper', boxes: bands, tint: 0xe8e0c8 },
  ], 'furniture', { tag: 'money', colliders: [[-0.5, 0, -0.35, 0.5, 0.68, 0.35]] });
}
