import * as THREE from 'three';
import { block, panel, assembly } from './kit.js';
import * as F from './furniture.js';
import * as H from './furniture-home.js';
import * as E from './furniture-food.js';
import * as W from './furniture-work.js';
import * as L from './furniture-lobby.js';
import {
  PODIUM_FLOORS, PENTHOUSE, RESIDENCES, HQ, LOWER, T, U, ATRIUM, podiumFront, inCore, inAtrium,
  TOWER_COLUMNS, PODIUM_COLUMNS, clearOf, floorUse,
} from './plan.js';

// What is on each floor — the real tower's programme on twelve storeys:
//
//   LL     the lower level: the vault, goods receiving, the plant, the kitchens
//   0      the lobby: reception, the 18 m waterfall, gold escalators, a café
//   1      fashion boutiques, and the flagship store with its gold portal
//   2      jewellers — glass cases of gold and stones
//   3      the food court: three counters with their griddles and gas, and seating
//   4      the Grill: white tablecloths, a bar, a piano (its kitchen is downstairs)
//   5-7    offices: glass-walled rooms either side of long corridors
//   8      the Trump Organization: the corner office, the boardroom, reception
//   9      condominiums: two apartments
//   10-11  the penthouse — living and dining; the master suite, its dressing
//          room and a study
//
// Everything is placed against the plan in plan.js and kept clear of columns,
// the core and the atrium, so nothing stands inside anything else.

const HALF = Math.PI / 2;

export function fitOut(P, f) {
  const y = T(f);
  const use = floorUse(f);
  if (use === 'lower level') lowerLevel(P, y);
  else if (use === 'lobby') lobby(P, y);
  else if (use === 'boutiques') boutiques(P, f, y);
  else if (use === 'jewellers') jewellers(P, f, y);
  else if (use === 'food court') foodCourt(P, f, y);
  else if (use === 'restaurant') restaurant(P, f, y);
  else if (use === 'offices') offices(P, f, y);
  else if (use === 'headquarters') headquarters(P, f, y);
  else if (use === 'condominiums') condominiums(P, f, y);
  else if (use === 'penthouse: living') living(P, f, y);
  else if (use === 'penthouse: master suite') master(P, f, y);
  if (f >= 1 && f < PODIUM_FLOORS) atriumRail(P, f, y);
  for (const e of ESCALATORS) if (e.f === f) escalator(P, e, y);
  lights(P, f);
}

// ---------------------------------------------------------------- placement

// Is (x, z) a free spot on podium floor f for something `r` metres across?
function freePodium(f, x, z, r) {
  const front = podiumFront(f);
  if (x < -19.4 + r || x > 19.4 - r || z < -11.4 + r || z > front - 0.6 - r) return false;
  if (inCore(x, z, r + 1.3)) return false;             // and a corridor round it
  if (f >= 1 && inAtrium(x, z, r + 0.4)) return false;
  for (const e of ESCALATORS) {
    const inBand = z > e.z0 - 0.9 - r && z < e.z1 + 0.9 + r;
    if (e.f === f && inBand && x > 14.4 - r && x < 17.2 + r) return false;         // its foot
    if (e.f === f - 1 && inBand && x > 7.8 - r && x < 11 + r) return false;        // its head
  }
  return clearOf(PODIUM_COLUMNS(f), x, z, r + 0.45);
}

const wall = (P, f, x0, z0, x1, z1) => block(P, 'plaster', x0, T(f), z0, x1, U(f), z1, 'wall', { floor: f, tint: 0xf4efe6 });

// The gold escalators, criss-crossing the atrium: from each public floor at the
// atrium's east side up to the next at its west, each in a band of its own.
const ESCALATORS = [{ f: 0, z0: -1.2, z1: 0 }, { f: 1, z0: 1.0, z1: 2.2 }, { f: 2, z0: -3.4, z1: -2.2 }, { f: 3, z0: 3.2, z1: 4.4 }];

function escalator(P, e, y) {
  // Dark aluminium treads, twenty risers of 20 cm from x = 16 up to x = 10.
  const steps = [];
  for (let n = 1; n <= 20; n++) {
    const x1 = 16 - (n - 1) * 0.3, x0 = x1 - 0.3, top = n * 0.2;
    steps.push([x0, top - 0.3, e.z0, x1, top, e.z1]);
  }
  // Everything else runs on the pitch: through (13, 2), climbing 2/3 m per m
  // towards -x. Brass trusses either side, glass on them, a black handrail on
  // the glass, and the underside clad in mirror, as in the atrium photographs.
  // The truss stops short of each end, so it never reaches down through the
  // floor it stands on.
  const k = -2 / 3, run = (y0, y1, z0, z1, xa = 10, xb = 16) => ({ shear: [xa, 2 + y0, z0, xb, 2 + y1, z1], k });
  const za = e.z0 - 0.12, zb = e.z1 + 0.12;
  assembly(P, 0, y, 0, 0, [
    { kind: 'metal', boxes: steps, tint: 0x3a3b3d },
    { kind: 'brass', boxes: [run(-0.45, 0.05, za, e.z0 - 0.02, 10.4, 15.6), run(-0.45, 0.05, e.z1 + 0.02, zb, 10.4, 15.6),
      [16, 0, za, 16.7, 0.03, zb], [9.3, 4, za, 10, 4.03, zb]] },
    { kind: 'clearglass', boxes: [run(0.05, 0.98, e.z0 - 0.085, e.z0 - 0.065), run(0.05, 0.98, e.z1 + 0.065, e.z1 + 0.085),
      [16, 0.05, e.z0 - 0.085, 16.6, 0.98, e.z0 - 0.065], [16, 0.05, e.z1 + 0.065, 16.6, 0.98, e.z1 + 0.085]], tint: 0xdfe9ee },
    { kind: 'plastic', round: 0.02, boxes: [run(0.98, 1.06, e.z0 - 0.12, e.z0 - 0.03), run(0.98, 1.06, e.z1 + 0.03, e.z1 + 0.12),
      [16, 0.98, e.z0 - 0.12, 16.6, 1.06, e.z0 - 0.03], [16, 0.98, e.z1 + 0.03, 16.6, 1.06, e.z1 + 0.12]], tint: 0x0d0d0e },
    { kind: 'mirror', boxes: [run(-0.49, -0.45, za, zb, 10.4, 15.6)] },
  ], 'stair', { floor: e.f, colliders: steps, structural: false });
}

// A glass partition along x or z, framed in steel, with door gaps.
function glassWall(P, f, axis, at, from, to, gaps = []) {
  const y0 = T(f) + 0.02, y1 = U(f) - 0.04;
  const cuts = [...gaps].sort((a, b) => a[0] - b[0]);
  let a = from;
  const seg = (s0, s1) => {
    if (s1 - s0 < 0.1) return;
    const A = axis === 'x' ? new THREE.Vector3(s0, 0, at) : new THREE.Vector3(at, 0, s0);
    const B = axis === 'x' ? new THREE.Vector3(s1, 0, at) : new THREE.Vector3(at, 0, s1);
    panel(P, 'clearglass', A, B, y0, y1, 0.02, 0, 'glass', { floor: f, tint: 0xdfe9ee });
    for (const c of [A, B]) block(P, 'metal', c.x - 0.03, y0, c.z - 0.03, c.x + 0.03, y1, c.z + 0.03, 'furniture', { floor: f, tint: 0x9aa0a6 });
  };
  for (const [g0, g1] of cuts) { seg(a, g0); a = g1; }
  seg(a, to);
}

// A partition along x or z with a doorway cut in it at `d0..d1`.
function partition(P, f, axis, at, from, to, d0, d1) {
  const t = 0.1;
  const seg = (a, b) => {
    if (b - a < 0.05) return;
    if (axis === 'x') wall(P, f, a, at - t / 2, b, at + t / 2);
    else wall(P, f, at - t / 2, a, at + t / 2, b);
  };
  if (d0 === undefined) { seg(from, to); return; }
  seg(from, d0);
  seg(d1, to);
  // A timber door standing open against the wall.
  if (axis === 'x') block(P, 'wood', d0, T(f), at + t / 2, d0 + 0.05, T(f) + 2.1, at + t / 2 + 0.85, 'furniture', { floor: f, tint: 0xe8e0d0 });
  else block(P, 'wood', at + t / 2, T(f), d0, at + t / 2 + 0.85, T(f) + 2.1, d0 + 0.05, 'furniture', { floor: f, tint: 0xe8e0d0 });
}

// ---------------------------------------------------------------- the lower level

// Under the whole podium: the vault in the north-west corner behind a round
// steel door; the plant — transformers, the gas, the boiler, the switchgear —
// to the north-east; goods receiving to the south-west, pallets and a forklift
// by the roller door; the restaurants' kitchens to the south-east.
function lowerLevel(P, y) {
  const f = LOWER;
  // The vault: walls of concrete half a metre thick.
  const thick = (x0, z0, x1, z1) => block(P, 'concrete', x0, y, z0, x1, U(f), z1, 'wall', { floor: f, structural: false, tint: 0x9a968e });
  thick(-12.5, -11.6, -12, -7.6);
  thick(-12.5, -5.6, -12, -4.6);
  thick(-19.6, -5.1, -12, -4.6);
  W.vaultDoor(P, -11.6, y, -6.6, HALF);
  W.depositBoxes(P, -16, y, -11.55, 0, 6);
  W.goldStack(P, -16.5, y, -8.2, 0);
  W.goldStack(P, -14.3, y, -8.2, 0);
  // The plant.
  partition(P, f, 'z', 5.6, -11.6, -4.8, -8.4, -7.2);
  partition(P, f, 'x', -4.8, 5.6, 19.6);
  F.transformer(P, 17.8, y, -10.3, 0);
  F.transformer(P, 15, y, -10.3, 0);
  for (const x of [18.8, 18.3, 17.8]) F.gasTank(P, x, y, -6);
  W.boiler(P, 10.5, y, -9.6, 0);
  F.electricalCabinet(P, 7, y, -11, 0);
  F.electricalCabinet(P, 8, y, -11, 0);
  // Goods receiving.
  for (const [x, z] of [[-18, 5.5], [-16.6, 5.5], [-18, 7.2], [-15.2, 5.5], [-16.6, 7.2], [-13.4, 9.8]]) W.palletCrates(P, x, y, z, 0, (x * 7 + z) % 3 < 1.5 ? 2 : 1);
  W.forklift(P, -12.5, y, 6.6, HALF);
  block(P, 'steel', -19.55, y, 8.6, -19.45, y + 3.2, 11.2, 'furniture', { floor: f, tint: 0x7a7e82 });     // the roller door
  // The kitchens, for the Grill and the cafés upstairs.
  partition(P, f, 'x', 3.6, 5.6, 19.6, 7.4, 8.6);
  for (const x of [7.4, 8.3, 9.2]) F.cooker(P, x, y, 11.1, Math.PI);
  F.gasTank(P, 10.2, y, 11.2);
  F.gasTank(P, 10.6, y, 11.2);
  F.counter(P, 13.2, y, 11, Math.PI, 3.2);
  F.counter(P, 12.4, y, 7.6, 0, 3.2);
  for (const x of [16.2, 17, 17.8]) F.fridge(P, x, y, 11.1, Math.PI);
  F.counter(P, 18.9, y, 6.5, -HALF, 2.4);
}

// ---------------------------------------------------------------- the podium

function lobby(P, y) {
  // As in the photographs: a cream marble floor polished to a mirror, the core
  // and columns in dark veined stone (tower.js), brass round the lift doors, the
  // monogrammed brass desk and a line of red rope before them, black steel
  // benches along the glass, the great flags hung inside the front, and
  // revolving doors under brass canopies.
  const brass = (x0, y0, z0, x1, y1, z1) => block(P, 'brass', x0, y0, z0, x1, y1, z1, 'furniture', { floor: 0, structural: false });
  brass(0.72, y, 3.54, 0.9, y + 2.4, 3.62);
  brass(3.4, y, 3.54, 3.58, y + 2.4, 3.62);
  brass(0.72, y + 2.4, 3.54, 3.58, y + 2.62, 3.62);
  L.monogramDesk(P, -1.4, y, 5.0, 0);
  L.stanchions(P, 2.15, y, 5.6, 0, 3, 1.25);
  for (const x of [-16.5, -13.5, -10.5]) L.steelBench(P, x, y, 9.6, 0);
  for (const x of [7.5, 10.5]) L.steelBench(P, x, y, 9.6, 0);
  for (const x of [-6.2, 6.2]) L.flag(P, x, U(0), 11.7, 3.6, 2.0);
  for (const x of [-17.5, 13]) F.plant(P, x, y, 10.8, true);
  F.plant(P, -5.8, y, 4.3, true);
  F.plant(P, 5.8, y, 4.3, true);
  // Two revolving doors in the opening, glass either side of them.
  for (const x of [-1.4, 1.4]) L.revolvingDoor(P, x, y, 11.0);
  for (const [x0, x1] of [[-0.52, 0.52], [2.28, 2.95], [-2.95, -2.28]])
    block(P, 'clearglass', x0, y, 11.97, x1, U(0) - 0.05, 12.0, 'glass', { floor: 0, tint: 0xdfe6ea });
  F.receptionDesk(P, -10, y, 5.4, 0);

  // The atrium's back wall: rough blocks of pink marble at every depth, the
  // whole height of the public floors, lit from their ledges, and water
  // running down the face of them into a pool. Cladding fixed to a backing
  // wall, not structure: a decorative wall four storeys tall once held the
  // whole podium up.
  block(P, 'marble', 10.3, y, -6.95, 14.7, 18, -6.8, 'wall', { floor: 0, structural: false, tint: 0xe2b09e });
  steppedStone(P, 10.3, 14.7, y + 0.6, 18, -6.8);
  block(P, 'clearglass', 10.35, y, -6.8, 14.65, y + 0.45, -5.3, 'furniture', { floor: 0, structural: false, tint: 0x9ec9d8 });
  assembly(P, 12.5, y, -6.05, 0, [
    { kind: 'brass', boxes: [[-2.25, 0, 0.65, 2.25, 0.55, 0.75], [-2.25, 0, -0.75, -2.15, 0.55, 0.75], [2.15, 0, -0.75, 2.25, 0.55, 0.75]] },
  ], 'furniture', { floor: 0 });
  block(P, 'clearglass', 10.6, y + 0.45, -6.33, 14.4, 17.9, -6.3, 'furniture', { floor: 0, structural: false, tint: 0xe4f2f8, tag: 'waterfall' });

  // The café down in the atrium: white marble tables, black and white chairs.
  for (const [x, z] of [[11.2, 2.3], [13.3, 2.5], [11.2, 4.7], [13.3, 4.9], [11.4, -3.6], [13.4, -3.8]]) {
    L.marbleTable(P, x, y, z);
    E.bistroChair(P, x - 0.62, y, z, HALF, 0x1a1a1a);
    E.bistroChair(P, x + 0.62, y, z, -HALF, 0xe8e4dc);
  }
  E.bar(P, 17.5, y, 4.5, -HALF, 3.2);
  for (const [x, z] of [[16.5, 9.5], [18.4, 7.5], [8.5, -9.5], [6.5, -9.8]]) {
    L.marbleTable(P, x, y, z);
    E.bistroChair(P, x - 0.6, y, z, HALF, 0x1a1a1a);
    E.bistroChair(P, x + 0.6, y, z, -HALF, 0x1a1a1a);
  }
}

// Rough stone blocks over a wall face at z = `face`, standing out of it towards
// +z by 5 to 40 cm, in courses of uneven height. The same every time: seeded.
function steppedStone(P, x0, x1, y0, y1, face) {
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let lamps = 0;
  for (let y = y0; y < y1 - 0.2;) {
    const h = Math.min(y1 - y, 0.5 + rnd() * 0.7);
    for (let x = x0; x < x1 - 0.05;) {
      const w = Math.min(x1 - x, 0.6 + rnd() * 1.1);
      const d = 0.05 + rnd() ** 1.6 * 0.37;
      const t = 0.9 + rnd() * 0.16;
      const tint = new THREE.Color(0xe9b4a0).multiplyScalar(t).getHex();
      block(P, 'marble', x + 0.01, y + 0.01, face, x + w - 0.01, y + h - 0.01, face + d, 'cladding', { floor: Math.max(0, Math.floor(y / 4)), structural: false, tint });
      // A light along the top of the deeper ledges, washing the stone above.
      if (d > 0.27 && lamps < 18 && w > 0.5) {
        block(P, 'lamp', x + 0.15, y + h - 0.01, face + d - 0.1, x + w - 0.15, y + h + 0.02, face + d - 0.04, 'lamp', { floor: Math.max(0, Math.floor(y / 4)), structural: false });
        lamps++;
      }
      x += w;
    }
    y += h;
  }
}

function boutiques(P, f, y) {
  const front = podiumFront(f);
  // Racks and tables in aisles, mannequins in the windows, a till by the atrium.
  for (let x = -17; x <= 7; x += 3.2)
    for (const z of [-9.2, -5.6, 5.6, 8.6]) {
      if (!freePodium(f, x, z, 0.9)) continue;
      if ((x + z) % 2 < 1) F.clothesRack(P, x, y, z, 0);
      else F.displayTable(P, x, y, z, 0);
    }
  for (const x of [-15, -11, -7, 5]) if (freePodium(f, x, front - 1.3, 0.3)) F.mannequin(P, x, y, front - 1.3, Math.PI);
  F.counter(P, 17.2, y, front - 3.5, HALF, 2.4);
  F.plant(P, 18.6, y, -11, false);
  // The flagship store, the whole west end: a glass front with a gold portal.
  glassWall(P, f, 'z', -13.2, -11.6, front - 0.4, [[-1.2, 1.2]]);
  assembly(P, -13.2, y, 0, 0, [
    { kind: 'gold', round: 0.02, boxes: [[-0.15, 0, -1.4, 0.15, 3.4, -1.2], [-0.15, 0, 1.2, 0.15, 3.4, 1.4], [-0.15, 3.0, -1.4, 0.15, 3.4, 1.4], [-0.2, 3.45, -3, 0.2, 3.65, 3]] },
  ], 'furniture', { floor: f });
  for (const z of [-8, -4.5, 4.5, 8]) F.mannequin(P, -16.8, y, z, HALF);
  // Changing rooms along the back wall.
  for (let n = 0; n < 3; n++) {
    const x0 = 9.4 + n * 1.2;
    block(P, 'plaster', x0, y, -11.6, x0 + 0.08, y + 2.2, -10.2, 'wall', { floor: f, tint: 0xe8e0d6 });
  }
  block(P, 'fabric', 9.4, y, -10.25, 13, y + 2.1, -10.2, 'furniture', { floor: f, tint: 0x6a1a22 });
}

function jewellers(P, f, y) {
  for (let x = -16; x <= 7; x += 2.6)
    for (const z of [-9.5, -6.8, 6, 8.8]) {
      if (!freePodium(f, x, z, 0.8)) continue;
      E.jewelCase(P, x, y, z, 0);
    }
  for (const x of [-12, -6]) if (freePodium(f, x, 10.6, 0.3)) F.mannequin(P, x, y, 10.6, Math.PI);
  F.counter(P, 17.2, y, 8, HALF, 2.4);
  for (const z of [-10, 3]) F.plant(P, 18.4, y, z, true);
  F.chandelier(P, -10, U(f), 1);
  F.chandelier(P, 3, U(f), 7.5);
}

function foodCourt(P, f, y) {
  // Three counters along the back, each with its griddle, fridge and gas.
  const boards = [0xc8261d, 0xf0b020, 0x1f6fb0];
  [-16, -11.2, 6.2].forEach((x, i) => {
    E.foodCounter(P, x, y, -9.4, 0, boards[i]);
    F.gasTank(P, x + 1.7, y, -11.2);
    F.fridge(P, x - 1.9, y, -11.1, 0);
  });
  // Seating.
  for (let x = -17.5; x <= 8; x += 2.3)
    for (let z = -5.8; z <= 9.5; z += 2.3) {
      if (!freePodium(f, x, z, 0.8)) continue;
      E.cafeTable(P, x, y, z);
      const t = [0x7a2020, 0x2a5a3a, 0x333333][((x + z) * 7 & 3) % 3];
      E.bistroChair(P, x, y, z - 0.6, 0, t);
      E.bistroChair(P, x, y, z + 0.6, Math.PI, t);
    }
  for (const x of [-19, 18.8]) F.plant(P, x, y, 10.8, true);
}

function restaurant(P, f, y) {
  const front = podiumFront(f);
  // A service station at the back; the kitchen is on the lower level.
  F.counter(P, -14, y, -11, 0, 3.2);
  F.fridge(P, -11.8, y, -11.1, 0);
  // The bar down the west wall.
  E.bar(P, -18.4, y, 1, HALF, 6);
  for (let z = -1.6; z <= 3.8; z += 1.1) E.barStool(P, -17.4, y, z);
  // Tables.
  for (let x = -14; x <= 8; x += 2.9)
    for (let z = -5.6; z <= front - 1.6; z += 2.8) {
      if (!freePodium(f, x, z, 1.0)) continue;
      E.clothTable(P, x, y, z, 0.55);
      for (let n = 0; n < 4; n++) {
        const a = (n / 4) * Math.PI * 2 + Math.PI / 4;
        H.diningChair(P, x + Math.cos(a) * 0.9, y, z + Math.sin(a) * 0.9, -a - HALF, 0x5a1a1a);
      }
    }
  F.chandelier(P, -3, U(f), 6);
  F.chandelier(P, 5, U(f), -8);
  H.piano(P, 17, y, -9.5, 0);
}

function atriumRail(P, f, y) {
  // A glass balustrade with a brass rail round the atrium — open where an
  // escalator comes up onto this floor.
  const { x0, x1, z0, z1 } = ATRIUM;
  const rail = (a, b) => {
    const A = new THREE.Vector3(a[0], 0, a[1]), B = new THREE.Vector3(b[0], 0, b[1]);
    if (A.distanceTo(B) < 0.2) return;
    panel(P, 'clearglass', A, B, y, y + 1.0, 0.02, -0.03, 'glass', { floor: f });
    panel(P, 'brass', A, B, y + 1.0, y + 1.06, 0.06, -0.03, 'furniture', { floor: f });
  };
  rail([x0, z0], [x1, z0]);
  rail([x1, z1], [x0, z1]);
  const up = ESCALATORS.find((e) => e.f === f - 1);
  if (up) { rail([x0, z1], [x0, up.z1 + 0.1]); rail([x0, up.z0 - 0.1], [x0, z0]); } else rail([x0, z1], [x0, z0]);
  // The slab edges round the void are faced in mirror, as in the photographs.
  const fy0 = f * 4 - 0.4, fy1 = y - 0.02;
  block(P, 'mirror', x0, fy0, z1 - 0.02, x1, fy1, z1, 'cladding', { floor: f, structural: false });
  block(P, 'mirror', x0, fy0, z0 + 0.38, x0 + 0.02, fy1, z1 - 0.02, 'cladding', { floor: f, structural: false });
  block(P, 'mirror', x1 - 0.02, fy0, z0 + 0.38, x1, fy1, z1 - 0.02, 'cladding', { floor: f, structural: false });
  // And a trough of tropical plants behind the glass on the south side.
  if (f <= 3) L.planter(P, (x0 + x1) / 2, y, z1 + 0.32, x1 - x0 - 0.6);
}

// ---------------------------------------------------------------- offices

function offices(P, f, y) {
  // Rooms along both long faces, walled in glass, each with a door onto a
  // corridor that runs the length of the floor either side of the core.
  const podium = f < PODIUM_FLOORS;
  const x0 = podium ? -19.6 : -13.6, x1 = 9.6;
  const zN = podium ? -7.6 : -5.4, zS = podium ? 5.2 : 4.4;
  const zMin = podium ? -11.6 : -8.6, zMax = podium ? podiumFront(f) - 0.4 : 6.6;
  const cols = podium ? PODIUM_COLUMNS(f) : TOWER_COLUMNS;
  const step = 4.2, rooms = [];
  for (let a = x0; a + step <= x1 + 0.01; a += step) rooms.push([a, a + step]);
  // The corridor walls, a door into every room.
  glassWall(P, f, 'x', zN, x0, x1, rooms.map(([a]) => [a + 0.6, a + 1.6]));
  glassWall(P, f, 'x', zS, x0, x1, rooms.map(([a]) => [a + 0.6, a + 1.6]));
  for (const [, b] of rooms.slice(0, -1)) {
    glassWall(P, f, 'z', b, zMin, zN);
    glassWall(P, f, 'z', b, zS, zMax);
  }
  // In each room: a desk to the window, its chair, a screen, a plant.
  for (const [a, b] of rooms) {
    const x = (a + b) / 2;
    for (const [z, face] of [[zMin + 1.4, Math.PI], [zMax - 1.4, 0]]) {
      if (!clearOf(cols, x, z, 1.0)) continue;
      F.desk(P, x, y, z, face);
      const s = face === 0 ? -1 : 1;
      F.monitor(P, x, y + 0.74, z - 0.18 * s, face);
      F.officeChair(P, x, y, z + 0.8 * s, face + Math.PI, f % 2 ? 0x2d3a55 : 0x333333);
      if (clearOf(cols, b - 0.5, z, 0.6)) F.plant(P, b - 0.5, y, z - 0.6 * s * -1, false);
    }
  }
  // At the ends: a meeting room to the west, a pantry to the east.
  F.meetingTable(P, podium ? -16 : -10.5, y, -0.5, HALF);
  F.counter(P, 8.2, y, -1.5, HALF, 2.4);
  F.fridge(P, 8.4, y, 1.2, -HALF);
  F.waterCooler(P, 8.5, y, 2.4, -HALF);
  if (f % 2) F.gasTank(P, 8.6, y, -3.2);
}

// ---------------------------------------------------------------- the Trump Organization

// The corner office to the west, walled in glass: the desk, the chairs in
// front of it, a sofa by the window, books, gold. The boardroom to the east:
// a table for fourteen. Reception facing the lifts; the assistants between.
function headquarters(P, f, y) {
  glassWall(P, f, 'z', -6.2, -8.6, 6.6, [[-1, 0.2]]);
  glassWall(P, f, 'z', 5.6, -8.6, 6.6, [[-1, 0.2]]);
  // The office.
  H.rug(P, -10.2, y, 0, 5, 5.4, 0x3a1a1a);
  W.executiveDesk(P, -11.4, y, -1, HALF);
  H.armchair(P, -12.7, y, -1, HALF, 0x2a1a12);
  H.armchair(P, -9.6, y, -1.9, -HALF, 0xc9a043);
  H.armchair(P, -9.6, y, -0.1, -HALF, 0xc9a043);
  F.sofa(P, -10.2, y, 5.4, 0, 0x3a1a1a);
  H.coffeeTable(P, -10.2, y, 3.9, 0);
  for (const z of [-7.6, -6.5]) F.bookshelf(P, -13.2, y, z, HALF);
  F.plant(P, -7, y, -7.6, true);
  F.chandelier(P, -10.2, U(f), 0);
  // The boardroom.
  W.boardTable(P, 7.7, y, -1, HALF, 6);
  for (let n = 0; n < 6; n++) {
    const z = -3.6 + n * 1.05;
    H.diningChair(P, 6.8, y, z, -HALF, 0x1a1a1a);
    H.diningChair(P, 8.6, y, z, HALF, 0x1a1a1a);
  }
  H.diningChair(P, 7.7, y, 2.4, 0, 0x1a1a1a);
  H.diningChair(P, 7.7, y, -4.4, Math.PI, 0x1a1a1a);
  F.chandelier(P, 7.7, U(f), -1);
  // Reception, and the assistants.
  F.receptionDesk(P, 0, y, 5.6, 0);
  for (const x of [-4, -1.5, 1.5, 4]) {
    F.desk(P, x, y, -7.6, 0);
    F.monitor(P, x, y + 0.74, -7.78, 0);
    F.officeChair(P, x, y, -6.85, Math.PI, 0x1a1a1a);
  }
  F.plant(P, -4.8, y, 5.8, true);
  F.plant(P, 4.8, y, 5.8, true);
}

// ---------------------------------------------------------------- the residences

// Two apartments either side of the core, each with its living room, kitchen,
// bedroom and bathroom.
function condominiums(P, f, y) {
  partition(P, f, 'z', -1.2, -9, -3.5);
  partition(P, f, 'z', -1.2, 3.5, 7);
  for (const side of [-1, 1]) {
    const cx = side < 0 ? -9 : 5.5;
    // Living.
    H.rug(P, cx, y, 3.5, 3.4, 2.6);
    F.sofa(P, cx, y, 5.4, 0, side < 0 ? 0xe6dcc4 : 0x2a3a4a);
    H.coffeeTable(P, cx, y, 3.8, 0);
    H.tv(P, cx, y, 1.2, 0);
    // Kitchen and dining.
    F.counter(P, cx + (side < 0 ? 2.2 : -2.2), y, -8, 0, 2.4);
    F.fridge(P, cx + (side < 0 ? 3.8 : -3.6), y, -8.1, 0);
    H.diningTable(P, cx, y, -5.6, 0, 1.8);
    for (const dx of [-0.6, 0.6]) { H.diningChair(P, cx + dx, y, -6.3, Math.PI); H.diningChair(P, cx + dx, y, -4.9, 0); }
  }
  // A bedroom and bathroom in each, at the ends.
  partition(P, f, 'z', -10.4, -3.2, 7, 0.4, 1.2);
  H.bed(P, -12.3, y, 4, -HALF, 1.6, 0x7a2a32);
  H.nightstand(P, -13.3, y, 2.8, -HALF);
  H.bathtub(P, -12.4, y, -1.8, HALF);
  partition(P, f, 'z', 7.4, -3.2, 7, 0.4, 1.2);
  H.bed(P, 8.8, y, 4, HALF, 1.6, 0x2a3a6a);
  H.nightstand(P, 9.4, y, 2.8, HALF);
  H.toilet(P, 8.8, y, -1.8, -HALF);
}

// ---------------------------------------------------------------- the penthouse

// The penthouse's living floor: a grand living room round a fireplace, a
// dining room for twelve, and the kitchen.
function living(P, f, y) {
  H.rug(P, -9.3, y, 0, 6, 4.4);
  H.fireplace(P, -5.75, y, 0, -HALF);
  H.coffeeTable(P, -9, y, 0, HALF);
  F.sofa(P, -9, y, 1.7, 0, 0xe8dcc0);
  F.sofa(P, -9, y, -1.7, Math.PI, 0xe8dcc0);
  H.armchair(P, -12.3, y, 0, -HALF, 0xc9a043);
  H.piano(P, -11.2, y, -6.2, 0.4);
  H.tv(P, -11.5, y, 5.9, Math.PI);
  F.plant(P, -13.1, y, 3.6, true);
  // Dining.
  H.diningTable(P, 7.4, y, 2.2, HALF, 3.4);
  for (let n = 0; n < 4; n++) {
    const z = 0.9 + n * 0.85;
    H.diningChair(P, 6.55, y, z, -HALF);
    H.diningChair(P, 8.25, y, z, HALF);
  }
  H.diningChair(P, 7.4, y, 4.3, 0);
  H.diningChair(P, 7.4, y, 0.1, Math.PI);
  // Kitchen.
  F.counter(P, 7.4, y, -8.2, 0, 3.2);
  F.cooker(P, 5.4, y, -8.2, 0);
  F.gasTank(P, 5.4, y, -7.5);
  F.fridge(P, 9.2, y, -7.2, -HALF);
  F.counter(P, 7.4, y, -5.6, 0, 2.4);
  for (const x of [6.6, 7.4, 8.2]) E.barStool(P, x, y, -4.8);
}

// The top floor: the master bedroom, a dressing room, a bathroom and a study.
function master(P, f, y) {
  partition(P, f, 'x', -2, -14, -6.2, -8.2, -7.3);
  partition(P, f, 'z', -6.2, -2, 7, 0, 0.9);
  partition(P, f, 'z', -10, -9, -2, -3.4, -2.6);
  partition(P, f, 'z', 5.8, -9, 7, -1.2, -0.3);
  // Bedroom.
  H.rug(P, -10, y, 1.3, 3.4, 3.6);
  H.bed(P, -10, y, -0.85, 0, 2.0, 0xc9a043);
  H.nightstand(P, -11.45, y, -1.6, 0);
  H.nightstand(P, -8.55, y, -1.6, 0);
  H.tv(P, -11.6, y, 6.1, Math.PI);
  H.armchair(P, -13, y, 3.8, HALF, 0xe6dcc4);
  F.plant(P, -7, y, 6.1, true);
  // Dressing room: rails of clothes and a wardrobe wall.
  F.clothesRack(P, -12, y, -4.2, 0);
  F.clothesRack(P, -12, y, -6.6, 0);
  H.wardrobe(P, -13.6, y, -8.2, HALF, 1.4);
  F.mannequin(P, -10.7, y, -8.3, 0);
  // Bathroom.
  H.bathtub(P, -8.1, y, -8.4, 0);
  H.vanity(P, -8.1, y, -2.35, Math.PI);
  H.toilet(P, -6.7, y, -5.6, -HALF);
  // Study.
  F.desk(P, 7.9, y, -4.6, -HALF);
  F.monitor(P, 8.1, y + 0.74, -4.6, -HALF);
  H.armchair(P, 7.1, y, -4.6, HALF, 0x3a2418);
  for (const z of [1.2, 2.3, 3.4, 4.5]) F.bookshelf(P, 6.05, y, z, HALF);
  H.rug(P, 7.9, y, -4.6, 2.6, 2.4, 0x2a2030);
  F.plant(P, 9, y, -8, true);
  H.coffeeTable(P, 8.2, y, 2.6, 0);
}

// ---------------------------------------------------------------- lighting

function lights(P, f) {
  const top = U(f);
  if (f >= RESIDENCES) {
    // Chandeliers in the big rooms, plain lights elsewhere.
    for (const [x, z] of [[-9.5, 0], [7.4, 2.2]]) if (f === PENTHOUSE) F.chandelier(P, x, top, z);
    if (f === PENTHOUSE + 1) F.chandelier(P, -10, top, 1.5);
    for (const [x, z] of [[-11, -5], [-11, 4.5], [7.8, -5], [7.8, 5], [-2.5, -5.5], [2.5, 5]]) F.ceilingLight(P, x, top, z);
    return;
  }
  const tower = f >= PODIUM_FLOORS;
  const xs = tower ? [-11.5, -8, 7.5] : [-17, -12, -7, 7, 17.5];
  const zs = tower ? [-6.5, -0.5, 5] : [-9.5, -5, 0, 5, 9];
  for (const x of xs) for (const z of zs) {
    if (!tower && (z > podiumFront(f) - 1 || (x > ATRIUM.x0 && x < ATRIUM.x1 && z > ATRIUM.z0 && z < ATRIUM.z1))) continue;
    if (inCore(x, z, 1)) continue;
    F.ceilingLight(P, x, top, z);
  }
  for (const x of [-2.5, 2.5]) for (const z of [-5.5, 5]) if (tower || z < podiumFront(f) - 1) F.ceilingLight(P, x, top, z);
}

