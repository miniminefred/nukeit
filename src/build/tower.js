import { VOXEL, vx, vz, wx, wz } from '../voxel/constants.js';
import { AIR, M } from '../voxel/materials.js';
import { box, cylinder, ball, signZ } from './shapes.js';

// Trump Tower, scaled to 100 m.
//
// The real one is 58 floors and 202 m on Fifth Avenue: a dark bronze glass
// shaft with a sawtooth of notched corners up two faces, standing on a stepped
// podium whose terraces are planted with trees, with the name in gold letters
// over the door. Here it is 25 floors of 4 m — a six-storey podium with an
// atrium through it, and nineteen storeys of offices above — plus a plant room
// on the roof. The street is on the +z side.
//
// **How it is held up is the point.** Concrete columns on a 6 m grid and a
// concrete core carry every floor; glass, partitions and furniture carry
// nothing (see voxel/support.js). Take the columns and the core out on one
// storey and everything above it comes down.
//
// Floor plan, in metres, looking down (+x right, +z towards the street):
//
//        x: -20                 0                  20
//   z -12  +-------------------------------------+      podium, floors 0-5
//          | plant |        +--core--+  atrium   |      (front steps back on
//          | room  |        | st | el |  void    |       floors 4 and 5)
//          |       |        +--------+           |
//   z  12  +--------------[ door ]---------------+
//                        TRUMP TOWER
//
//   tower floors 6-24: x -14..14, z -9..9, sawtooth on the +x and +z faces.

export const FLOOR_H = 4;                    // metres per storey
const FV = Math.round(FLOOR_H / VOXEL);      // voxels per storey
export const PODIUM_FLOORS = 6;
export const TOP_FLOOR = 24;                 // last occupied storey
const ROOF_F = TOP_FLOOR + 1;                // the roof slab sits where floor 25 would

const PODIUM = { x0: -20, x1: 20, z0: -12, z1: 12 };
const TOWER = { x0: -14, x1: 14, z0: -9, z1: 9 };
const CORE = { x0: -5, x1: 5, z0: -3.5, z1: 3.5, wall: 0.5 };
const STAIR = { x0: -4.5, x1: -0.25, z0: -3, z1: 3 };
const LIFT = { x0: 0.25, x1: 4.5, z0: -3, z1: 3 };
const ATRIUM = { x0: 7, x1: 17, z0: -8, z1: 8 };
const PLANT = { x0: -19.75, x1: -11, z0: -11.75, z1: -5.5 };
const ENTRANCE = { x0: -3, x1: 3, h: 3.5 };

// What the job measures: everything standing inside this box that is not rubble.
export const SITE = { x0: -21, x1: 21, z0: -13, z1: 13.5 };
export const ENTRY = { x: 0, z: 19, yaw: 0 };   // where you are put down, facing the door

// Sawtooth: 0 at the tooth tip, 2 m deep at the notch, one tooth every 4 m.
function saw(t) {
  const f = ((t + 1000) / 4) % 1;
  return 2 * Math.abs(f * 2 - 1);
}

function inPodium(f, x, z) {
  const zmax = f <= 3 ? PODIUM.z1 : f === 4 ? 10 : 8;
  return x >= PODIUM.x0 && x < PODIUM.x1 && z >= PODIUM.z0 && z < zmax;
}

function inTower(x, z) {
  return x >= TOWER.x0 && x < TOWER.x1 - saw(z) && z >= TOWER.z0 && z < TOWER.z1 - saw(x);
}

// Is (x, z) inside storey f's floor plate?
function inside(f, x, z) {
  if (f < 0 || f > TOP_FLOOR) return false;
  return f < PODIUM_FLOORS ? inPodium(f, x, z) : inTower(x, z);
}

const within = (r, x, z) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
const inCore = (x, z) => within(CORE, x, z);

// Voxel-centre coordinates.
const cxOf = (i) => wx(i) + VOXEL / 2;
const czOf = (k) => wz(k) + VOXEL / 2;

export function buildTower(field) {
  const i0 = vx(PODIUM.x0 - 1), i1 = vx(PODIUM.x1 + 1);
  const k0 = vz(PODIUM.z0 - 1), k1 = vz(PODIUM.z1 + 1);

  for (let f = 0; f <= ROOF_F; f++) {
    const j0 = f * FV;
    slab(field, f, j0, i0, i1, k0, k1);
    if (f <= TOP_FLOOR) {
      if (f >= PODIUM_FLOORS) carpet(field, f, j0, i0, i1, k0, k1);
      columns(field, f, j0);
      facade(field, f, j0, i0, i1, k0, k1);
      terraceRails(field, f, j0, i0, i1, k0, k1);
      stairs(field, j0);
      fitOut(field, f, j0);
    }
  }
  core(field);
  roof(field);
  lobby(field);
  terraces(field);
  // The name over the door, in brass, one voxel proud of the glass.
  signZ(field, 'TRUMP TOWER', 0, 4.4, PODIUM.z1, 0.5, M.BRASS);
}

// ---------------------------------------------------------------- floors

function slab(field, f, j0, i0, i1, k0, k1) {
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const x = cxOf(i), z = czOf(k);
      const here = f <= TOP_FLOOR && inside(f, x, z);
      const below = inside(f - 1, x, z);
      if (!here && !below && f !== ROOF_F) continue;
      if (f === ROOF_F && !inTower(x, z)) continue;
      if (f >= 1 && f <= TOP_FLOOR) {
        if (within(LIFT, x, z)) continue;
        if (within(STAIR, x, z) && !(z >= 1.5)) continue;   // only the landing
        if (f < PODIUM_FLOORS && within(ATRIUM, x, z)) continue;
      }
      if (f === ROOF_F && within(STAIR, x, z) && z < 1.5) continue;
      const m = f === 0 ? M.MARBLE : here ? M.CONCRETE : M.ROOFING;
      field.set(i, j0, k, m);
    }
}

function carpet(field, f, j0, i0, i1, k0, k1) {
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const x = cxOf(i), z = czOf(k);
      if (!inside(f, x, z) || inCore(x, z)) continue;
      field.set(i, j0 + 1, k, M.CARPET);
    }
}

function columns(field, f, j0) {
  const tower = f >= PODIUM_FLOORS;
  const xs = tower ? [-12, -6, 0, 6, 12] : [-18, -12, -6, 0, 6, 12, 18];
  const zs = tower ? [-6, 0, 6] : [-9, -3, 3, 9];
  const y0 = (j0 + 1) * VOXEL, y1 = (j0 + FV) * VOXEL;
  for (const x of xs)
    for (const z of zs) {
      if (!inside(f, x, z) || !inside(f, x + 0.75, z + 0.75)) continue;
      if (inCore(x, z) || inCore(x + 0.75, z + 0.75)) continue;
      if (!tower && within(ATRIUM, x + 0.4, z + 0.4)) continue;
      box(field, x - 0.375, y0, z - 0.375, x + 0.375, y1, z + 0.375, M.CONCRETE);
    }
}

function isEdge(f, x, z) {
  const d = VOXEL;
  return !inside(f, x + d, z) || !inside(f, x - d, z) || !inside(f, x, z + d) || !inside(f, x, z - d);
}

// The curtain wall: bronze glass, a mullion every 1.5 m, and a dark spandrel
// band across the slab edge.
function facade(field, f, j0, i0, i1, k0, k1) {
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const x = cxOf(i), z = czOf(k);
      if (!inside(f, x, z) || !isEdge(f, x, z)) continue;
      const mullion = (i + k) % 6 === 0;
      for (let dj = 1; dj < FV; dj++) {
        let m = dj >= FV - 3 ? M.SPANDREL : mullion ? M.MULLION : M.GLASS;
        if (f === 0 && z > PODIUM.z1 - 0.3 && x >= ENTRANCE.x0 && x < ENTRANCE.x1 && dj * VOXEL <= ENTRANCE.h) m = AIR;
        if (m !== AIR) field.set(i, j0 + dj, k, m);
      }
    }
}

// Where a floor steps back, the roof left in front of it gets a glass rail.
function terraceRails(field, f, j0, i0, i1, k0, k1) {
  if (f === 0) return;
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const x = cxOf(i), z = czOf(k);
      if (inside(f, x, z) || !inside(f - 1, x, z) || !isEdge(f - 1, x, z)) continue;
      for (let dj = 1; dj <= 4; dj++) field.set(i, j0 + dj, k, M.GLASS);
    }
}

// ---------------------------------------------------------------- core

function core(field) {
  const top = ROOF_F * FV + FV;    // up through the roof into the plant room
  const { x0, x1, z0, z1, wall } = CORE;
  const y1 = top * VOXEL;
  box(field, x0, 0, z0, x1, y1, z0 + wall, M.CONCRETE);
  box(field, x0, 0, z1 - wall, x1, y1, z1, M.CONCRETE);
  box(field, x0, 0, z0, x0 + wall, y1, z1, M.CONCRETE);
  box(field, x1 - wall, 0, z0, x1, y1, z1, M.CONCRETE);
  box(field, STAIR.x1, 0, z0, LIFT.x0, ROOF_F * FLOOR_H, z1, M.CONCRETE);   // stair / lift partition
  for (let f = 0; f <= ROOF_F; f++) {
    const y = f * FLOOR_H + VOXEL;
    // Stair door, on every floor and onto the roof.
    box(field, -4, y, z1 - wall, -2.5, y + 2.5, z1, AIR);
    if (f <= TOP_FLOOR) {
      // Lift doors: a drywall panel, which is the only thing between the
      // corridor and a 100 m shaft.
      box(field, 1, y, z1 - wall, 3.5, y + 2.5, z1 - wall + VOXEL, AIR);
      box(field, 1, y, z1 - wall + VOXEL, 3.5, y + 2.5, z1, M.DRYWALL);
    }
  }
}

// A switchback in the stair half of the core: eight risers to a half landing,
// eight more to the next floor. Each flight is a two-voxel sloping slab rather
// than a solid block, which keeps the headroom under the flight above.
function stairs(field, j0) {
  const y = (dj) => (j0 + dj) * VOXEL;
  for (let n = 1; n <= 8; n++) {
    const z = 1.5 - n * VOXEL;
    box(field, STAIR.x0, y(n - 1), z, -2.5, y(n + 1), z + VOXEL, M.CONCRETE);
  }
  box(field, STAIR.x0, y(8), STAIR.z0, STAIR.x1, y(9), -0.5, M.CONCRETE);
  for (let n = 1; n <= 8; n++) {
    const z = -0.5 + (n - 1) * VOXEL;
    box(field, -2.25, y(8 + n - 1), z, STAIR.x1, y(8 + n + 1), z + VOXEL, M.CONCRETE);
  }
}

// ---------------------------------------------------------------- contents

function fitOut(field, f, j0) {
  const y = (j0 + 1) * VOXEL;
  if (f >= PODIUM_FLOORS) {
    offices(field, f, j0);
    if (f % 4 === 0) gasTank(field, 9, y + 0.25, -7);          // tea kitchen
  } else if (f >= 1) {
    shops(field, f, j0);
    if (f % 2 === 0) gasTank(field, -15, y, -10);
  }
  if (f >= 1 && f < PODIUM_FLOORS) atriumRail(field, j0);
}

function offices(field, f, j0) {
  const y = (j0 + 2) * VOXEL;     // on top of the carpet
  for (let x = -10.5; x <= 10.5; x += 3)
    for (const z of [-7.5, -4.8, 4.8, 7.5]) {
      if (!inside(f, x - 1.2, z - 1) || !inside(f, x + 1.2, z + 1)) continue;
      if (Math.abs(x) < 6.5 && Math.abs(z) < 5) continue;
      desk(field, x, y, z);
    }
  // Two corner offices on each side.
  const top = (j0 + FV) * VOXEL;
  for (const sx of [-9, 9])
    for (const [za, zb] of [[-9, -4], [4, 9]]) {
      if (!inside(f, sx, za + 0.1) && !inside(f, sx, zb - 0.1)) continue;
      box(field, sx, y, za, sx + VOXEL, top, zb, M.DRYWALL);
      box(field, sx, y, (za + zb) / 2 - 0.5, sx + VOXEL, y + 2.2, (za + zb) / 2 + 0.5, AIR);
    }
}

function desk(field, x, y, z) {
  box(field, x - 0.75, y + 0.5, z - 0.4, x + 0.75, y + 0.75, z + 0.4, M.WOOD);
  for (const [dx, dz] of [[-0.75, -0.4], [0.5, -0.4], [-0.75, 0.15], [0.5, 0.15]])
    box(field, x + dx, y, z + dz, x + dx + VOXEL, y + 0.5, z + dz + VOXEL, M.WOOD);
  box(field, x - 0.25, y, z + 0.6, x + 0.25, y + 0.5, z + 1.1, M.FABRIC);
}

function shops(field, f, j0) {
  const y = (j0 + 1) * VOXEL;
  for (let x = -16; x <= 4; x += 4)
    for (const z of [-8, 6]) {
      if (!inside(f, x - 1, z - 1) || !inside(f, x + 1, z + 1)) continue;
      if (inCore(x, z) || inCore(x + 1, z + 1) || inCore(x - 1, z - 1)) continue;
      if (within(PLANT, x, z)) continue;
      box(field, x - 1, y, z - 0.5, x + 1, y + 0.75, z + 0.5, M.WOOD);
      box(field, x - 0.8, y + 0.75, z - 0.3, x + 0.8, y + 1.25, z + 0.3, M.FABRIC);
    }
}

function atriumRail(field, j0) {
  const y0 = (j0 + 1) * VOXEL, y1 = y0 + 1;
  const { x0, x1, z0, z1 } = ATRIUM, t = VOXEL;
  box(field, x0 - t, y0, z0 - t, x1 + t, y1, z0, M.BRASS);
  box(field, x0 - t, y0, z1, x1 + t, y1, z1 + t, M.BRASS);
  box(field, x0 - t, y0, z0, x0, y1, z1, M.BRASS);
}

function gasTank(field, x, y, z) {
  cylinder(field, x, y, z, 0.35, y + 1.4, M.GASTANK);
}

// The ground floor: pink marble, a waterfall wall at the back of the atrium,
// and the plant room with the building's transformers and gas.
function lobby(field) {
  const y = VOXEL;
  box(field, 8, y, -11.75, 16, FLOOR_H, -11.25, M.MARBLE);
  for (const x of [-9, -3, 3, 9])
    box(field, x - 0.6, y, 8.5, x + 0.6, y + 0.75, 9.7, M.MARBLE);
  const { x0, x1, z0, z1 } = PLANT, t = VOXEL, h = FLOOR_H;
  box(field, x1 - t, y, z0, x1, h, z1, M.CONCRETE);
  box(field, x0, y, z1 - t, x1, h, z1, M.CONCRETE);
  box(field, -16, y, z1 - t, -14.5, y + 2.4, z1, AIR);
  for (const x of [-18.5, -16, -13.5])
    box(field, x - 0.75, y, -11.4, x + 0.75, y + 2, -10.2, M.TRANSFORMER);
  for (const x of [-19, -18.2, -12.4])
    gasTank(field, x, y, -7);
}

// ---------------------------------------------------------------- outside

function roof(field) {
  const y = ROOF_F * FLOOR_H + VOXEL;
  // Parapet round the roof edge.
  const i0 = vx(TOWER.x0 - 1), i1 = vx(TOWER.x1 + 1), k0 = vz(TOWER.z0 - 1), k1 = vz(TOWER.z1 + 1);
  const j = ROOF_F * FV;
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const x = cxOf(i), z = czOf(k);
      if (!inTower(x, z)) continue;
      const d = VOXEL;
      if (inTower(x + d, z) && inTower(x - d, z) && inTower(x, z + d) && inTower(x, z - d)) continue;
      for (let dj = 1; dj <= 4; dj++) field.set(i, j + dj, k, M.GLASS);
    }
  // Plant room over the core, and a generator beside it.
  const top = y + FLOOR_H - VOXEL;
  box(field, -6, y, -4.5, 6, top, -4.25, M.CONCRETE);
  box(field, -6, y, 4.25, 6, top, 4.5, M.CONCRETE);
  box(field, -6, y, -4.5, -5.75, top, 4.5, M.CONCRETE);
  box(field, 5.75, y, -4.5, 6, top, 4.5, M.CONCRETE);
  box(field, -6, top, -4.5, 6, top + VOXEL, 4.5, M.ROOFING);
  box(field, -4, y, 4.25, -2.5, y + 2.5, 4.5, AIR);
  box(field, 8, y, 3, 10, y + 1.5, 4.5, M.TRANSFORMER);
}

// Planters and trees along the stepped front of the podium.
function terraces(field) {
  const rows = [
    { f: 4, z: 11 },      // roof of floor 3, in front of floor 4
    { f: 5, z: 9 },       // roof of floor 4
  ];
  for (const { f, z } of rows) {
    const y = f * FLOOR_H + VOXEL;
    box(field, -18, y, z - 0.5, 18, y + 0.5, z + 0.5, M.SOIL);
    for (let x = -16; x <= 16; x += 4) tree(field, x, y + 0.5, z);
  }
  // The podium roof around the tower.
  const y = PODIUM_FLOORS * FLOOR_H + VOXEL;
  for (const x of [-18, 17]) for (const z of [-10, 5]) {
    box(field, x - 1, y, z - 1, x + 1, y + 0.5, z + 1, M.SOIL);
    tree(field, x, y + 0.5, z);
  }
}

function tree(field, x, y, z) {
  box(field, x - 0.125, y, z - 0.125, x + 0.125, y + 1.6, z + 0.125, M.WOOD);
  ball(field, x, y + 2.1, z, 1.1, M.FOLIAGE, 0.35);
}

