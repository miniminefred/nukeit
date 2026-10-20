import { FLOOR_H, LOWER } from './plan.js';

// Big Boy Bank's floor plan (building/plan.js puts it in force for the job).
//
// A 1920s stone banking hall, seven storeys and a columned front on Wall
// Street, with a glass tower of twenty-three storeys rising out of it to 120 m.
// The client liked it as it was: the glass comes down, the stone stays.
//
//                 x: -24        -12   -5  0  5   12        24
//     z -16   +---------------------------------------------+   the stone hall, floors 0-6
//             |  vault (below) |    +--core--+    |          |
//     z -10   |       +--------+----+--------+----+-------+  |   the glass tower, floors 7-29,
//             |       |             |stair|lift|          |  |   x -12..12, z -10..8
//     z   8   |       +----------- banking hall void -----+  |   (floors 0-2 over the front)
//     z  14   +---------------------[ doors ]---------------+
//                         Wall Street (+z)
//
// The core is Trump Tower's, in the same place: the stair, the lift and its
// doors are built by the same code.

const TOP = 29;
const CORE = { x0: -5, x1: 5, z0: -3.5, z1: 3.5, t: 0.4 };
const HALL = { x0: -12, x1: 12, z0: 8, z1: 14, top: 2 };
const inR = (r, x, z, m) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

export const HALL_XS = [-24, -18, -12, -5, 0, 5, 12, 18, 24];
export const HALL_ZS = [-16, -10, -3.5, 3.5, 8, 14];
export const TOWER_XS = [-12, -5, 0, 5, 12];
export const TOWER_ZS = [-10, -3.5, 3.5, 8];

export const BANK = {
  podiumFloors: 7,
  topFloor: TOP,
  basement: { x0: -24, x1: 24, z0: -16, z1: 14, depth: FLOOR_H },
  podium: { x0: -24, x1: 24, z0: -16 },
  shaft: { x0: -12, x1: 12, z0: -10, z1: 8 },
  podiumFront: () => 14,
  core: CORE,
  lift: { x0: 0.2, x1: 4.6, z0: -3.1, z1: 3.1, door0: 0.9, door1: 3.4 },
  atrium: HALL,
  stairDoor: { x: -3.3, z: CORE.z1 + 0.8 },
  outline: [[-12, -10], [12, -10], [12, 8], [-12, 8]],
  towerColumns: () => {
    const out = [];
    for (const x of TOWER_XS) for (const z of TOWER_ZS) if (!inR(CORE, x, z, 0.5)) out.push([x, z]);
    return out;
  },
  podiumColumns: (f) => {
    const out = [];
    for (const x of HALL_XS) for (const z of HALL_ZS) {
      if (inR(CORE, x, z, 0.5)) continue;
      if (f <= HALL.top && Math.abs(x) < 3 && z > 13) continue;        // the doorway, under the void
      out.push([x, z]);
    }
    return out;
  },
  crowd: { [LOWER]: 3, 0: 22, 1: 6, 2: 6, 3: 5, 4: 5, 5: 5, 6: 5, ...Object.fromEntries(Array.from({ length: TOP - 6 }, (_, i) => [7 + i, i + 7 <= 14 ? 6 : 2])) },
  hq: 27,
  residences: 99,
  penthouse: TOP,
  programme: {
    [LOWER]: 'vault',
    0: 'banking hall',
    1: 'mezzanine', 2: 'mezzanine',
    27: 'executive', 28: 'boardroom', [TOP]: 'ceo',
  },
  floorUse: (f) => BANK.programme[f] ?? (f >= 3 && f < 7 ? 'private banking' : f >= 7 && f <= 14 ? 'trading' : f > 14 && f < 27 ? 'offices' : ''),
  zones: [
    { name: 'the vault', floors: (f) => f < 0 },
    { name: 'the banking hall', floors: (f) => f >= 0 && f <= 2 },
    { name: 'private banking', floors: (f) => f >= 3 && f <= 6 },
    { name: 'the trading floors', floors: (f) => f >= 7 && f <= 14 },
    { name: 'the offices', floors: (f) => f >= 15 && f < 27 },
    { name: 'the executive floors', floors: (f) => f >= 27 },
  ],
  lounge: (f) => (f >= 0 && f <= 2) || f >= 27,
};
