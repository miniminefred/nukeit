import * as THREE from 'three';
import { block, panel, plate, assembly } from './kit.js';
import { FLOOR_H, SLAB, PODIUM_FLOORS, TOP_FLOOR, ROOF, LOWER, BASEMENT, ATRIUM, T, U, OUTLINE, inPoly, inCore } from './plan.js';
import { HALL_XS, HALL_ZS, TOWER_XS, TOWER_ZS } from './bank-plan.js';
import { core, stair } from './tower.js';
import { signs } from './shops.js';
import { furnishBank } from './bank-interiors.js';

// Big Boy Bank: a stone banking hall of 1924 with a glass tower of 2008 rising
// out of the middle of it (the plan is building/bank-plan.js).
//
// The hall is Indiana limestone over a concrete frame: seven storeys, punched
// windows, a temple front of six columns on Wall Street with the bank's name
// on the frieze, the banking hall behind it three storeys high under a gilded
// ceiling. The tower is a concrete frame and core in a blue-green curtain wall,
// twenty-three storeys to a helipad at 120 m. Its columns come down through
// the hall on the hall's own grid, so the tower stands on the hall's frame.

export const ENTRY = { x: 0, z: 21, yaw: 0 };
// Limestone: concrete, pale and warm (the marble's texture is Trump Tower's pink).
const STONE = 0xf0e6d2, STONE_DARK = 0xdcd0b8;
const GLASS = 0x86aec4;

export function buildBank(P) {
  for (let f = LOWER; f <= ROOF; f++) {
    slabs(P, f);
    if (f > TOP_FLOOR) continue;
    columns(P, f);
    core(P, f);
    stair(P, f);
    if (f === LOWER) retaining(P);
    else if (f < PODIUM_FLOORS) stoneFacade(P, f);
    else glassFacade(P, f);
    furnishBank(P, f);
  }
  portico(P);
  parapets(P);
  helipad(P);
}

// ---------------------------------------------------------------- the frame

function retaining(P) {
  const { x0, x1, z0, z1 } = BASEMENT, y0 = T(LOWER), y1 = U(LOWER), t = 0.5;
  const w = (a0, b0, a1, b1) => block(P, 'concrete', a0, y0, b0, a1, y1, b1, 'wall', { floor: LOWER, load: ROOF });
  w(x0, z0, x0 + t, z1);
  w(x1 - t, z0, x1, z1);
  w(x0 + t, z0, x1 - t, z0 + t);
  w(x0 + t, z1 - t, x1 - t, z1);
}

// What you walk on, floor by floor: marble in the banking hall, oak on its
// galleries and at the top, carpet in the offices; the trading floors grey.
function finishOf(f) {
  if (f === LOWER || f === ROOF) return null;
  if (f === 0) return null;                       // the hall's floor is marble right through
  if (f <= 2 || f >= 27) return 'wood';
  return 'carpet';
}

function slabs(P, f) {
  const y0 = f * FLOOR_H, y1 = T(f);
  const finish = finishOf(f);
  const add = (x0, z0, x1, z1, kind, { outdoors = false, gilded = false } = {}) => {
    block(P, kind, x0, y0, z0, x1, y1, z1, 'slab', { floor: f, lateral: true });
    if (f > LOWER) block(P, 'plaster', x0, y0 - 0.03, z0, x1, y0, z1, 'ceiling', { floor: f - 1, hang: true, tint: gilded ? 0xd8b46a : f <= PODIUM_FLOORS ? 0xf2e8d6 : 0xeeeeea });
    if (finish && !outdoors) block(P, finish, x0, y1, z0, x1, y1 + 0.02, z1, 'carpet', { floor: f, structural: false, tint: finish === 'wood' ? 0xe8cfa6 : f >= 7 && f <= 14 ? 0x4e545c : 0x6a5a52 });
  };
  const inShaft = (x, z) => x > TOWER_XS[0] && x < TOWER_XS[TOWER_XS.length - 1] && z > TOWER_ZS[0] && z < TOWER_ZS[TOWER_ZS.length - 1];
  const inHall = (x, z) => x > ATRIUM.x0 && x < ATRIUM.x1 && z > ATRIUM.z0 && z < ATRIUM.z1;
  if (f <= PODIUM_FLOORS) {
    for (let i = 0; i < HALL_XS.length - 1; i++)
      for (let k = 0; k < HALL_ZS.length - 1; k++) {
        const x0 = HALL_XS[i], x1 = HALL_XS[i + 1], z0 = HALL_ZS[k], z1 = HALL_ZS[k + 1];
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (f >= 0 && inCore(cx, cz)) continue;
        // The banking hall is open three storeys, under a gilded ceiling.
        if (f >= 1 && f <= ATRIUM.top && inHall(cx, cz)) continue;
        const gilded = f === ATRIUM.top + 1 && inHall(cx, cz);
        if (f === PODIUM_FLOORS && !inShaft(cx, cz)) add(x0, z0, x1, z1, 'roofing', { outdoors: true });
        else add(x0, z0, x1, z1, f === 0 ? 'creammarble' : 'concrete', { gilded });
      }
  } else {
    for (let i = 0; i < TOWER_XS.length - 1; i++)
      for (let k = 0; k < TOWER_ZS.length - 1; k++) {
        const x0 = TOWER_XS[i], x1 = TOWER_XS[i + 1], z0 = TOWER_ZS[k], z1 = TOWER_ZS[k + 1];
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        // The roof is closed over the lift and open over the stair.
        if (inCore(cx, cz) && (f !== ROOF || cx < 0)) continue;
        add(x0, z0, x1, z1, f === ROOF ? 'roofing' : 'concrete', { outdoors: f === ROOF });
      }
  }
  // The stair's landing inside the core, over the core's walls.
  if (f >= 0) block(P, f === ROOF ? 'roofing' : 'concrete', -5, y0, 1.5, 0.2, y1, 3.5, 'slab', { floor: f, lateral: true });
}

function columns(P, f) {
  const tower = f >= PODIUM_FLOORS;
  const xs = tower ? TOWER_XS : HALL_XS, zs = tower ? TOWER_ZS : HALL_ZS;
  const s = tower ? 0.45 : 0.5;
  const lo = (v, a) => Math.min(a[a.length - 1] - s - 0.05, Math.max(a[0] + s + 0.05, v));
  for (const x0 of xs)
    for (const z0 of zs) {
      if (inCore(x0, z0, 0.5)) continue;
      if (!tower && f <= ATRIUM.top && Math.abs(x0) < 3 && z0 > 13) continue;      // the doorway
      // Along the front of the banking hall there is no floor on its upper
      // storeys: one column the hall's full height instead, on the ground floor.
      const tall = !tower && z0 > 13 && Math.abs(x0) < ATRIUM.x1 - 0.1;
      if (tall && f >= 1 && f <= ATRIUM.top) continue;
      const x = lo(x0, xs), z = lo(z0, zs);
      // In the banking hall, columns of marble; elsewhere bare concrete.
      const hall = f >= 0 && f <= ATRIUM.top && z0 >= ATRIUM.z0;
      const y1 = tall && f === 0 ? U(ATRIUM.top) : U(f);
      block(P, hall ? 'creammarble' : 'concrete', x - s, T(f), z - s, x + s, y1, z + s, 'column', { floor: f, load: ROOF - f, tint: undefined });
    }
}

// ---------------------------------------------------------------- the stone hall

// Limestone round a punched window in every bay: a pier each side, a sill
// under the glass, and a head across the whole bay that the piers carry —
// and which the next storey's piers stand on. All of it stone (concrete,
// tinted), so it carries.
function stoneFacade(P, f) {
  const x0 = HALL_XS[0], x1 = HALL_XS[HALL_XS.length - 1], z0 = HALL_ZS[0], z1 = HALL_ZS[HALL_ZS.length - 1];
  const y0 = T(f), yHead = U(f) - 0.5, yTop = U(f) + SLAB, ySill = y0 + 0.9;
  const tint = f === 0 ? STONE_DARK : STONE;
  const edges = [
    [HALL_XS, (a) => [a, z1], 1],      // the front, on Wall Street
    [HALL_XS, (a) => [a, z0], -1],     // the back
    [HALL_ZS, (a) => [x0, a], -1],     // west
    [HALL_ZS, (a) => [x1, a], 1],      // east
  ];
  for (const [nodes, at, out] of edges) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const [ax, az] = at(nodes[i]), [bx, bz] = at(nodes[i + 1]);
      const A = new THREE.Vector3(ax, 0, az), B = new THREE.Vector3(bx, 0, bz);
      const len = A.distanceTo(B), d = B.clone().sub(A).divideScalar(len);
      const pt = (s) => A.clone().addScaledVector(d, s);
      const off = out * 0.2;
      const front = az === z1 && bz === z1;
      // The doorway, on the ground floor of the front: piers either side of a
      // bronze-framed opening, the head across it.
      const door = front && f === 0 && Math.min(ax, bx) < 2.2 && Math.max(ax, bx) > -2.2;
      const pier = 0.6;
      // Next to the door, the pier on the door's side is left out: the opening is there.
      if (!(door && ax >= 0)) panel(P, 'concrete', pt(0), pt(pier), y0, yHead, 0.45, off, 'wall', { floor: f, tint });
      if (!(door && ax < 0)) panel(P, 'concrete', pt(len - pier), pt(len), y0, yHead, 0.45, off, 'wall', { floor: f, tint });
      if (door) {
        // Stone to the door's edge (x = ±2.2), a bronze frame, then the opening.
        const edge = ax < 0 ? len - 2.2 : 2.2;
        const [s0, s1] = ax < 0 ? [pier, edge] : [edge, len - pier];
        panel(P, 'concrete', pt(s0), pt(s1), y0, yHead, 0.45, off, 'wall', { floor: f, tint });
        panel(P, 'bronze', pt(edge - 0.12), pt(edge + 0.12), y0, yHead, 0.5, off, 'mullion', { floor: f, tint: 0x6a5232 });
      } else {
        panel(P, 'concrete', pt(pier), pt(len - pier), y0, ySill, 0.4, off, 'wall', { floor: f, tint });
        panel(P, 'glass', pt(pier + 0.05), pt(len - pier - 0.05), ySill, yHead, 0.04, off, 'glass', { floor: f, tint: 0x9aaab0 });
        // Bronze mullions down the window, three lights to a bay.
        for (const k of [1 / 3, 2 / 3]) {
          const m = pier + (len - 2 * pier) * k;
          panel(P, 'bronze', pt(m - 0.04), pt(m + 0.04), ySill, yHead, 0.1, off, 'mullion', { floor: f, tint: 0x5a4a32 });
        }
      }
      panel(P, 'concrete', pt(0), pt(len), yHead, yTop, 0.5, off, 'wall', { floor: f, tint });
    }
  }
}

// The temple front: a stylobate of steps the width of it, six columns, the
// entablature with the name on its frieze, and the pediment.
function portico(P) {
  const z0 = 14.2, z1 = 18.6, w = 18;
  block(P, 'concrete', -w, 0, z0, w, 1.2, z1, 'slab', { floor: 0, tint: STONE_DARK });
  block(P, 'concrete', -w + 0.5, 0, z1, w - 0.5, 0.6, z1 + 0.8, 'slab', { floor: 0, tint: STONE_DARK });
  const top = 20;
  for (const x of [-16.25, -9.75, -3.25, 3.25, 9.75, 16.25]) {
    assembly(P, x, 1.2, 16.6, 0, [
      { kind: 'concrete', boxes: [{ cyl: [0, (top - 1.2) / 2, 0], r: 0.95, r2: 0.82, h: top - 1.2 - 0.6, seg: 20 }, [-1.1, top - 1.2 - 0.6, -1.1, 1.1, top - 1.2, 1.1], [-1.1, 0, -1.1, 1.1, 0.4, 1.1]], tint: STONE },
    ], 'column', { floor: 0, load: 1, colliders: [[-1.0, 0, -1.0, 1.0, top - 1.2, 1.0]] });
  }
  const frieze = block(P, 'concrete', -w, top, z0, w, top + 2.4, z1, 'slab', { floor: 0, tint: STONE });
  // The pediment: a low gable over the entablature, in steps of stone.
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const a = w * (1 - i / steps), y = top + 2.4 + i * 0.6;
    block(P, 'concrete', -a, y, z0 + 0.2, a, y + 0.6, z1 - 0.2, 'cladding', { floor: 0, structural: false, tint: STONE });
  }
  signs.list.push({ piece: frieze, text: 'BIG BOY BANK', style: 'bronze', w: 16, h: 1.5, at: new THREE.Vector3(0, top + 1.2, z1 + 0.02), yaw: 0 });
  signs.list.push({ piece: frieze, text: 'MCMXXIV', style: 'bronze', w: 4, h: 0.6, at: new THREE.Vector3(0, top + 0.35, z1 + 0.02), yaw: 0 });
}

// A stone parapet round the hall's roof, and a steel rail round the tower's.
function parapets(P) {
  const y = T(PODIUM_FLOORS), x0 = HALL_XS[0], x1 = HALL_XS[HALL_XS.length - 1], z0 = HALL_ZS[0], z1 = HALL_ZS[HALL_ZS.length - 1];
  const o = { floor: PODIUM_FLOORS, structural: false, tint: STONE };
  block(P, 'concrete', x0, y, z0, x1, y + 1.1, z0 + 0.4, 'wall', o);
  block(P, 'concrete', x0, y, z1 - 0.4, x1, y + 1.1, z1, 'wall', o);
  block(P, 'concrete', x0, y, z0 + 0.4, x0 + 0.4, y + 1.1, z1 - 0.4, 'wall', o);
  block(P, 'concrete', x1 - 0.4, y, z0 + 0.4, x1, y + 1.1, z1 - 0.4, 'wall', o);
}

// ---------------------------------------------------------------- the glass tower

function glassFacade(P, f) {
  const bay = 1.5;
  const y0 = T(f), yTop = f * FLOOR_H + 3.5, ySp1 = U(f) + SLAB;
  for (let e = 0; e < OUTLINE.length; e++) {
    const A = OUTLINE[e], B = OUTLINE[(e + 1) % OUTLINE.length];
    const len = A.distanceTo(B);
    const dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const out = inPoly(OUTLINE, mx - dz * 0.2, mz + dx * 0.2) ? -1 : 1;
    const n = Math.max(1, Math.round(len / bay));
    const dir = new THREE.Vector3(dx, 0, dz);
    for (let i = 0; i <= n; i++) {
      const c = new THREE.Vector3(A.x + (B.x - A.x) * (i / n), 0, A.z + (B.z - A.z) * (i / n));
      panel(P, 'metal', c.clone().addScaledVector(dir, -0.04), c.clone().addScaledVector(dir, 0.04), y0, yTop, 0.14, -out * 0.07, 'mullion', { floor: f, tint: 0xa8b0b6 });
      if (i === n) continue;
      const p0 = c.clone().addScaledVector(dir, 0.04);
      const p1 = new THREE.Vector3(A.x + (B.x - A.x) * ((i + 1) / n), 0, A.z + (B.z - A.z) * ((i + 1) / n)).addScaledVector(dir, -0.04);
      panel(P, 'glass', p0, p1, y0 + 0.02, yTop - 0.02, 0.03, -out * 0.07, 'glass', { floor: f, tint: GLASS });
    }
    panel(P, 'metal', A, B, yTop, ySp1, 0.19, -out * 0.025, 'spandrel', { floor: f, tint: 0x3a4a54 });
  }
}

// On the roof: the helipad, a dark disc with a white H, a rail round the edge.
function helipad(P) {
  const y = T(ROOF), r = 6.5, pts = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, -1 + Math.sin(a) * r)); }
  plate(P, 'roofing', pts, y, y + 0.06, 'carpet', { floor: ROOF, structural: false, tint: 0x2a2c30 });
  for (const box of [[-2.2, -4, -1.7, 2], [1.7, -4, 2.2, 2], [-1.7, -1.25, 1.7, -0.75]])
    block(P, 'plaster', box[0], y + 0.06, box[1], box[2], y + 0.08, box[3], 'carpet', { floor: ROOF, structural: false, tint: 0xf2f0e8 });
  const o = { floor: ROOF, structural: false, tint: 0x8a9298 };
  const [x0, z0] = [OUTLINE[0].x, OUTLINE[0].z], [x1, z1] = [OUTLINE[2].x, OUTLINE[2].z];
  block(P, 'steel', x0, y, z0, x1, y + 1.1, z0 + 0.08, 'wall', o);
  block(P, 'steel', x0, y, z1 - 0.08, x1, y + 1.1, z1, 'wall', o);
  block(P, 'steel', x0, y, z0 + 0.08, x0 + 0.08, y + 1.1, z1 - 0.08, 'wall', o);
  block(P, 'steel', x1 - 0.08, y, z0 + 0.08, x1, y + 1.1, z1 - 0.08, 'wall', o);
}
