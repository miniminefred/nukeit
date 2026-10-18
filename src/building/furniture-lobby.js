import * as THREE from 'three';
import { assembly } from './kit.js';

// The lobby as it is in the photographs: a brass desk with the monogram on it,
// brass posts and red rope, black steel benches, the great flags hanging inside
// the glass front, and revolving doors under brass canopies.

const TAU = Math.PI * 2;

// The concierge's lectern: a brass box with the two Ts on its front in black.
export function monogramDesk(P, x, y, z, yaw) {
  const px = 0.035, letters = [];
  // Two Ts, the second a hair lower, as on the real one.
  for (const [ox, oy] of [[-0.16, 0], [0.04, -0.03]]) {
    letters.push([ox - 3 * px, 0.78 + oy, 0.33, ox + 3 * px, 0.78 + oy + px, 0.345]);
    letters.push([ox - px / 2, 0.52 + oy, 0.33, ox + px / 2, 0.78 + oy, 0.345]);
  }
  return assembly(P, x, y, z, yaw, [
    { kind: 'brass', round: 0.02, boxes: [[-0.55, 0, -0.33, 0.55, 1.08, 0.33], [-0.58, 1.08, -0.36, 0.58, 1.12, 0.36]] },
    { kind: 'lacquer', boxes: letters },
  ], 'furniture', { colliders: [[-0.58, 0, -0.36, 0.58, 1.12, 0.36]] });
}

// A line of brass posts with red rope swagged between them, along x.
export function stanchions(P, x, y, z, yaw, n = 3, gap = 1.3) {
  const posts = [], rope = [];
  for (let i = 0; i < n; i++) {
    const px = (i - (n - 1) / 2) * gap;
    posts.push({ cyl: [px, 0.5, 0], r: 0.025, h: 0.95, seg: 10 }, { cyl: [px, 0.02, 0], r: 0.16, r2: 0.18, h: 0.04, seg: 18 }, { ball: [px, 0.99, 0], s: [0.04, 0.04, 0.04], rough: 0, detail: 1 });
    if (i < n - 1) {
      // The swag: three short lengths, the middle one lower.
      const a = px, b = px + gap;
      rope.push({ cylX: [a + gap * 0.17, 0.86, 0], r: 0.02, h: gap * 0.34, seg: 8 }, { cylX: [(a + b) / 2, 0.8, 0], r: 0.02, h: gap * 0.34, seg: 8 }, { cylX: [b - gap * 0.17, 0.86, 0], r: 0.02, h: gap * 0.34, seg: 8 });
    }
  }
  const w = ((n - 1) * gap) / 2 + 0.18;
  return assembly(P, x, y, z, yaw, [
    { kind: 'brass', boxes: posts },
    { kind: 'fabric', boxes: rope, tint: 0xb01822 },
  ], 'furniture', { colliders: [[-w, 0, -0.18, w, 1.0, 0.18]] });
}

// A public bench of black steel slats on two steel frames.
export function steelBench(P, x, y, z, yaw, len = 1.8) {
  const slats = [];
  for (let k = 0; k < 6; k++) slats.push([-len / 2, 0.42, -0.24 + k * 0.08, len / 2, 0.45, -0.24 + k * 0.08 + 0.05]);
  const frames = [];
  for (const fx of [-len / 2 + 0.2, len / 2 - 0.2]) frames.push([fx - 0.03, 0, -0.26, fx + 0.03, 0.42, -0.2], [fx - 0.03, 0, 0.2, fx + 0.03, 0.42, 0.26], [fx - 0.03, 0.36, -0.26, fx + 0.03, 0.42, 0.26]);
  return assembly(P, x, y, z, yaw, [
    { kind: 'metal', round: 0.012, boxes: slats, tint: 0x1c1c1e },
    { kind: 'metal', boxes: frames, tint: 0x141416 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.26, len / 2, 0.45, 0.26]] });
}

// A great flag hung flat from the ceiling, in soft folds. Mapped once across
// its face, so its stripes and stars come out right whatever its size.
export function flag(P, x, yTop, z, w = 4.5, h = 2.4, yaw = 0) {
  const g = new THREE.BoxGeometry(w, h, 0.012, 28, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5;
    pos.setZ(i, pos.getZ(i) + Math.sin(u * TAU * 3.2) * 0.05 + Math.sin(u * TAU * 7.1 + 1) * 0.015);
  }
  g.computeVertexNormals();
  const c = new THREE.Vector3(x, yTop - h / 2 - 0.05, z);
  return P.add({ parts: [{ kind: 'flag', geometry: g }], pos: c, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), role: 'furniture', floor: 0, structural: false, hang: true });
}

// A revolving door: a drum of curved glass open to the street and the lobby, a
// brass canopy over it, and four glass wings turning slowly inside (tagged, so
// sim/doors.js can turn them). The drum's sides are solid; you walk through
// with the wings.
export function revolvingDoor(P, x, y, z, r = 1.2, h = 2.5) {
  const side = (a0) => {
    const g = new THREE.CylinderGeometry(r, r, h, 12, 1, true, a0, 1.5);
    return g;
  };
  const drum = [];
  for (const a0 of [TAU / 4 - 0.75, (3 * TAU) / 4 - 0.75]) drum.push(side(a0));
  for (const g of drum) {
    const c = new THREE.Vector3(x, y + h / 2, z);
    // Sides solid: a collider down each curve's middle.
    const sx = Math.sin(g.parameters.thetaStart + 0.75) * (r - 0.05);
    P.add({ parts: [{ kind: 'glass', geometry: g, tint: 0xdfe6ea }], pos: c, role: 'glass', floor: 0, structural: false,
      colliders: [[sx - 0.08, -h / 2, -0.7, sx + 0.08, h / 2, 0.7]] });
  }
  assembly(P, x, y + h, z, 0, [
    { kind: 'brass', boxes: [{ cyl: [0, 0.14, 0], r: r + 0.08, h: 0.28, seg: 28 }] },
  ], 'furniture', { floor: 0, structural: false });
  assembly(P, x, y, z, 0, [
    { kind: 'brass', boxes: [{ cyl: [0, h / 2, 0], r: 0.05, h: h - 0.04, seg: 10 }] },
    { kind: 'glass', boxes: [[-r + 0.06, 0.04, -0.015, r - 0.06, h - 0.04, 0.015], [-0.015, 0.04, -r + 0.06, 0.015, h - 0.04, r - 0.06]] },
  ], 'furniture', { floor: 0, structural: false, tag: 'revolving' });
}

// A café table with a round top of white marble on a black iron stand.
export function marbleTable(P, x, y, z) {
  return assembly(P, x, y, z, 0, [
    { kind: 'creammarble', boxes: [{ cyl: [0, 0.735, 0], r: 0.36, h: 0.03, seg: 24 }], tint: 0xfaf6ee },
    { kind: 'metal', boxes: [{ cyl: [0, 0.36, 0], r: 0.025, h: 0.7, seg: 10 }, { cyl: [0, 0.015, 0], r: 0.24, h: 0.03, seg: 18 }], tint: 0x1a1a1a },
  ], 'furniture', { colliders: [[-0.36, 0, -0.36, 0.36, 0.75, 0.36]] });
}

// A long trough of tropical plants — broad dark leaves in clumps — along x.
export function planter(P, x, y, z, len) {
  const leaves = [];
  const n = Math.max(2, Math.round(len / 0.55));
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (i + 0.5) * (len / n);
    for (let k = 0; k < 3; k++) {
      const a = i * 2.3 + k * 2.1;
      leaves.push({ ball: [lx + Math.cos(a) * 0.12, 0.62 + k * 0.12, Math.sin(a) * 0.08], s: [0.26, 0.12, 0.2], rough: 0.6 });
    }
  }
  return assembly(P, x, y, z, 0, [
    { kind: 'darkmarble', round: 0.01, boxes: [[-len / 2, 0, -0.2, len / 2, 0.5, 0.2]] },
    { kind: 'soil', boxes: [[-len / 2 + 0.04, 0.5, -0.16, len / 2 - 0.04, 0.51, 0.16]] },
    { kind: 'leaves', boxes: leaves, tint: 0x6f9a62 },
  ], 'furniture', { colliders: [[-len / 2, 0, -0.2, len / 2, 0.5, 0.2]] });
}
