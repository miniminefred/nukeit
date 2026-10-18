import { assembly } from './kit.js';

// Fifth Avenue's furniture, along both kerbs in front of the job: street
// lamps, a crossing with its traffic lights in front of the tower, fire
// hydrants, litter bins, trees in their pits, a bus shelter. All of it pieces,
// so a sledge, a blast or a falling tower breaks it like anything else
// (building 'street'). The avenue itself is scenery/city.js; the traffic and
// the signals' lamps are sim/traffic.js.
//
// The kerbs run along z = 25.6 (our side) and z = 42.4 (across the avenue).

const OUR = 25.2, FAR = 42.8;
const opts = (o = {}) => ({ building: 'street', structural: false, ...o });

export function buildStreet(P) {
  const S = { add: (spec) => P.add({ ...spec, building: 'street' }) };
  for (let x = -60; x <= 60; x += 18) {
    lamp(S, x + 3, OUR, 0);
    lamp(S, x - 6, FAR, Math.PI);
  }
  // The signal heads face the oncoming traffic, which comes from +x.
  for (const [x, z] of [[-5.5, OUR], [5.5, OUR], [-5.5, FAR], [5.5, FAR]]) signal(S, x, z, Math.PI / 2);
  for (const [x, z] of [[-14, OUR], [21, OUR], [-24, FAR], [12, FAR]]) hydrant(S, x, z);
  for (const [x, z] of [[-9, OUR - 0.4], [9, OUR - 0.4], [-30, OUR - 0.4], [26, FAR + 0.4], [-16, FAR + 0.4]]) bin(S, x, z);
  for (const x of [-46, -38, 38, 46, 56]) tree(S, x, OUR - 1);
  for (const x of [-50, -34, 30, 44]) tree(S, x, FAR + 1);
  shelter(S, -22, OUR - 1.2);
}

function lamp(P, x, z, yaw) {
  return assembly(P, x, 0, z, yaw, [
    { kind: 'steel', boxes: [{ cyl: [0, 3.2, 0], r: 0.07, r2: 0.1, h: 6.4, seg: 10 }, { cylZ: [0, 6.3, 0.7], r: 0.045, h: 1.4, seg: 8 }, { cyl: [0, 0.15, 0], r: 0.18, h: 0.3, seg: 12 }], tint: 0x2a2d30 },
    { kind: 'lamp', boxes: [[-0.18, 6.15, 1.2, 0.18, 6.25, 1.6]] },
  ], 'furniture', opts({ tag: 'streetlamp', colliders: [[-0.15, 0, -0.15, 0.15, 6.4, 0.15]] }));
}

// A pole with a signal head facing the traffic, and one facing the crossing.
function signal(P, x, z, yaw) {
  const p = assembly(P, x, 0, z, yaw, [
    { kind: 'steel', boxes: [{ cyl: [0, 1.9, 0], r: 0.07, h: 3.8, seg: 10 }], tint: 0x2a2d30 },
    { kind: 'metal', round: 0.03, boxes: [[-0.17, 2.7, 0.07, 0.17, 3.7, 0.37], [-0.14, 2.0, -0.32, 0.14, 2.45, -0.07]], tint: 0x1e2a1e },
  ], 'furniture', opts({ tag: 'signal', colliders: [[-0.17, 0, -0.32, 0.17, 3.7, 0.37]] }));
  p.foot = { x, z, yaw };          // where its lamps are drawn from (sim/traffic.js)
  return p;
}

function hydrant(P, x, z) {
  return assembly(P, x, 0, z, 0, [
    { kind: 'metal', round: 0.02, boxes: [{ cyl: [0, 0.32, 0], r: 0.11, h: 0.64, seg: 12 }, { ball: [0, 0.66, 0], s: [0.11, 0.07, 0.11], rough: 0 }, { cylX: [0, 0.45, 0], r: 0.05, h: 0.34, seg: 8 }], tint: 0xc0221c },
  ], 'furniture', opts({ tag: 'hydrant', colliders: [[-0.17, 0, -0.12, 0.17, 0.72, 0.12]] }));
}

function bin(P, x, z) {
  return assembly(P, x, 0, z, 0, [
    { kind: 'metal', round: 0.02, boxes: [{ cyl: [0, 0.45, 0], r: 0.27, r2: 0.24, h: 0.9, seg: 14 }], tint: 0x1f3a2a },
    { kind: 'plastic', boxes: [{ cyl: [0, 0.92, 0], r: 0.28, h: 0.04, seg: 14 }], tint: 0x111111 },
  ], 'furniture', opts({ colliders: [[-0.28, 0, -0.28, 0.28, 0.95, 0.28]] }));
}

function tree(P, x, z) {
  const leaves = [];
  for (let n = 0; n < 5; n++) { const a = n * 1.3; leaves.push({ ball: [Math.cos(a) * 0.6, 3.6 + (n % 2) * 0.5, Math.sin(a) * 0.6], s: [1.1, 0.9, 1.1], rough: 0.35 }); }
  return assembly(P, x, 0, z, 0, [
    { kind: 'metal', boxes: [[-0.7, 0, -0.7, 0.7, 0.06, 0.7]], tint: 0x2a2a2a },
    { kind: 'soil', boxes: [[-0.62, 0.01, -0.62, 0.62, 0.05, 0.62]] },
    { kind: 'wood', boxes: [{ cyl: [0, 1.6, 0], r: 0.11, r2: 0.15, h: 3.2, seg: 8 }], tint: 0x5a4434 },
    { kind: 'leaves', boxes: leaves, tint: 0x8fb070 },
  ], 'furniture', opts({ colliders: [[-0.2, 0, -0.2, 0.2, 3, 0.2]] }));
}

function shelter(P, x, z) {
  return assembly(P, x, 0, z, 0, [
    { kind: 'steel', boxes: [[-2, 0, -0.75, -1.94, 2.5, -0.69], [1.94, 0, -0.75, 2, 2.5, -0.69], [-2, 0, 0.69, -1.94, 2.5, 0.75], [1.94, 0, 0.69, 2, 2.5, 0.75], [-2.1, 2.5, -0.85, 2.1, 2.58, 0.85]], tint: 0x3a4048 },
    { kind: 'clearglass', boxes: [[-1.94, 0.2, -0.74, 1.94, 2.45, -0.7], [-1.99, 0.2, -0.69, -1.95, 2.45, 0.69]], tint: 0xdfe6ea },
    { kind: 'metal', boxes: [[-1.4, 0.45, -0.6, 1.4, 0.5, -0.3]], tint: 0x6a7078 },
  ], 'furniture', opts({ colliders: [[-2.1, 0, -0.85, 2.1, 2.58, 0.85]] }));
}
