import * as THREE from 'three';
import { block, panel, assembly } from './kit.js';
import * as F from './furniture.js';
import * as H from './furniture-home.js';
import * as E from './furniture-food.js';
import {
  PODIUM_FLOORS, PENTHOUSE, T, U, ATRIUM, podiumFront, inCore, inAtrium,
  TOWER_COLUMNS, PODIUM_COLUMNS, clearOf, floorUse,
} from './plan.js';

// What is on each floor. The tower is a place, not a stack of offices:
//
//   0      the lobby: reception, the waterfall, the escalator, a café, the plant room
//   1      fashion boutiques
//   2      jewellers — glass cases of gold and stones
//   3      the food court: three counters with their kitchens and gas, and seating
//   4      the Grill: white tablecloths, a bar, a kitchen at the back
//   5      a café and a bookshop
//   6-21   offices
//   22-24  the penthouse — living and dining; three bedrooms with bathrooms; the
//          master suite, its dressing room and a study
//
// Everything is placed against the plan in plan.js and kept clear of columns,
// the core and the atrium, so nothing stands inside anything else.

const HALF = Math.PI / 2;

export function fitOut(P, f) {
  const y = T(f);
  const use = floorUse(f);
  if (use === 'lobby') lobby(P, y);
  else if (use === 'boutiques') boutiques(P, f, y);
  else if (use === 'jewellers') jewellers(P, f, y);
  else if (use === 'food court') foodCourt(P, f, y);
  else if (use === 'restaurant') restaurant(P, f, y);
  else if (use === 'café and books') cafeBooks(P, f, y);
  else if (use === 'offices') offices(P, f, y);
  else if (use === 'penthouse: living') living(P, f, y);
  else if (use === 'penthouse: bedrooms') bedrooms(P, f, y);
  else if (use === 'penthouse: master suite') master(P, f, y);
  if (f >= 1 && f < PODIUM_FLOORS) atriumRail(P, f, y);
  lights(P, f);
}

// ---------------------------------------------------------------- placement

// Is (x, z) a free spot on podium floor f for something `r` metres across?
function freePodium(f, x, z, r) {
  const front = podiumFront(f);
  if (x < -19.4 + r || x > 19.4 - r || z < -11.4 + r || z > front - 0.6 - r) return false;
  if (inCore(x, z, r + 1.3)) return false;             // and a corridor round it
  if (f >= 1 && inAtrium(x, z, r + 0.4)) return false;
  if (f === 1 && x > 8.5 && x < 11.5 && z > -2 && z < 1) return false;   // top of the escalator
  return clearOf(PODIUM_COLUMNS(f), x, z, r + 0.45);
}

const wall = (P, f, x0, z0, x1, z1) => block(P, 'plaster', x0, T(f), z0, x1, U(f), z1, 'wall', { floor: f, tint: 0xf4efe6 });

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

// ---------------------------------------------------------------- the podium

function lobby(P, y) {
  F.receptionDesk(P, -9, y, 5.4, 0);
  F.bench(P, 6, y, 9.5, 0);
  F.bench(P, -14, y, 9.5, 0);
  for (const x of [-17, 7.5]) F.plant(P, x, y, 10.8, true);
  F.plant(P, -5.8, y, 4.3, true);
  F.plant(P, 5.8, y, 4.3, true);
  // The waterfall wall at the back of the atrium: pink marble, two storeys.
  // Cladding, not structure: marble counts as load-bearing, and a decorative
  // wall four storeys tall was quietly holding the whole podium up.
  block(P, 'marble', 10.3, y, -6.95, 14.7, 8, -6.6, 'wall', { floor: 0, structural: false });
  F.chandelier(P, -3, U(0), 8);
  F.chandelier(P, 3, U(0), 8);
  // Escalator up to the first floor, stepping down into the atrium.
  const steps = [];
  for (let n = 1; n <= 20; n++) {
    const x1 = 16 - (n - 1) * 0.3, x0 = x1 - 0.3, top = n * 0.2;
    steps.push([x0, top - 0.3, -1.2, x1, top, 0]);
  }
  assembly(P, 0, y, 0, 0, [
    { kind: 'metal', boxes: steps, tint: 0x6b6f73 },
    { kind: 'brass', boxes: [[10, 0.9, -1.3, 16, 1.0, -1.2], [10, 0.9, 0, 16, 1.0, 0.1]] },
  ], 'stair', { floor: 0, colliders: steps, structural: false });
  // The café by the atrium.
  E.bar(P, 17.5, y, 4.5, -HALF, 3.2);
  for (const [x, z] of [[16.5, 9.5], [18.4, 7.5], [8.5, -9.5], [6.5, -9.8]]) {
    E.cafeTable(P, x, y, z);
    E.bistroChair(P, x - 0.6, y, z, HALF, 0x6a2a2a);
    E.bistroChair(P, x + 0.6, y, z, -HALF, 0x6a2a2a);
  }
  // The plant room: two transformers, the gas, the switchgear.
  block(P, 'plaster', -14.2, y, -11.6, -14, U(0), -6.8, 'wall', { floor: 0 });
  block(P, 'plaster', -19.6, y, -7, -17, U(0), -6.8, 'wall', { floor: 0 });
  block(P, 'plaster', -15.6, y, -7, -14.2, U(0), -6.8, 'wall', { floor: 0 });
  block(P, 'wood', -17, y, -6.95, -15.6, y + 2.2, -6.85, 'furniture', { floor: 0, tint: 0x5a6a5a });
  F.transformer(P, -18.4, y, -10.4, 0);
  F.transformer(P, -15.8, y, -10.4, 0);
  for (const x of [-19.2, -18.8, -18.4]) F.gasTank(P, x, y, -7.6);
  F.electricalCabinet(P, -14.7, y, -9, HALF);
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
  // The kitchen, walled off at the back left.
  partition(P, f, 'x', -8.2, -19.6, -8.5, -12, -10.8);
  partition(P, f, 'z', -8.5, -11.6, -8.2);
  F.cooker(P, -18.8, y, -10.9, 0);
  F.cooker(P, -17.9, y, -10.9, 0);
  F.gasTank(P, -17.1, y, -11.1);
  F.gasTank(P, -16.7, y, -11.1);
  F.counter(P, -14, y, -11, 0, 2.4);
  F.fridge(P, -11.8, y, -11.1, 0);
  F.fridge(P, -11, y, -11.1, 0);
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

function cafeBooks(P, f, y) {
  // Books to the west, coffee to the east.
  for (let x = -17; x <= -7; x += 2.4)
    for (const z of [-9.5, -7, 5]) if (freePodium(f, x, z, 1.05)) E.bookRack(P, x, y, z, 0);
  H.armchair(P, -8, y, 7.2, Math.PI, 0x6a3a2a);
  H.armchair(P, -6.6, y, 7.2, Math.PI, 0x6a3a2a);
  E.bar(P, 17.3, y, 4, -HALF, 3);
  for (let x = 4; x <= 9; x += 2.4)
    for (const z of [-9.6, -7.2]) {
      if (!freePodium(f, x, z, 0.8)) continue;
      E.cafeTable(P, x, y, z);
      E.bistroChair(P, x - 0.6, y, z, HALF, 0x2a2a2a);
      E.bistroChair(P, x + 0.6, y, z, -HALF, 0x2a2a2a);
    }
  F.plant(P, 18.4, y, -10, true);
}

function atriumRail(P, f, y) {
  // A glass balustrade with a brass rail round the atrium.
  const { x0, x1, z0, z1 } = ATRIUM;
  for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]]) {
    const A = new THREE.Vector3(a[0], 0, a[1]), B = new THREE.Vector3(b[0], 0, b[1]);
    panel(P, 'glass', A, B, y, y + 1.0, 0.02, -0.03, 'glass', { floor: f });
    panel(P, 'brass', A, B, y + 1.0, y + 1.06, 0.06, -0.03, 'furniture', { floor: f });
  }
}

// ---------------------------------------------------------------- offices

function offices(P, f, y) {
  // Two rows of desks along the long faces, each with a chair, a monitor and a
  // keyboard, turned to face into the room.
  for (let x = -12.4; x <= 8.6; x += 2.1) {
    for (const [z, face] of [[-7.4, 0], [5.3, Math.PI]]) {
      if (!clearOf(TOWER_COLUMNS, x, z, 1.1) || inCore(x, z, 1.4)) continue;
      F.desk(P, x, y, z, face);
      const s = face === 0 ? 1 : -1;
      F.monitor(P, x, y + 0.74, z - 0.18 * s, face);
      F.keyboard(P, x, y + 0.74, z + 0.12 * s, face);
      F.officeChair(P, x, y, z + 0.75 * s, face + Math.PI, f % 3 === 0 ? 0x5a2a2a : 0x2d3a55);
    }
  }
  // A meeting room in the west end, walled off in plaster.
  block(P, 'plaster', -6.4, y, -2.9, -6.3, U(f), -0.6, 'wall', { floor: f });
  block(P, 'plaster', -6.4, y, 0.6, -6.3, U(f), 2.9, 'wall', { floor: f });
  block(P, 'plaster', -13.9, y, -2.95, -6.3, U(f), -2.85, 'wall', { floor: f });
  block(P, 'plaster', -13.9, y, 2.85, -6.3, U(f), 2.95, 'wall', { floor: f });
  block(P, 'wood', -6.42, y, -0.6, -6.28, y + 2.2, 0.3, 'furniture', { floor: f });
  F.meetingTable(P, -10, y, 0, 0);
  for (const dx of [-1, 0, 1]) {
    F.officeChair(P, -10 + dx * 1, y, -0.95, 0, 0x333333);
    F.officeChair(P, -10 + dx * 1, y, 0.95, Math.PI, 0x333333);
  }
  // A pantry in the east end.
  F.counter(P, 8, y, -2.3, HALF, 2.4);
  F.fridge(P, 8.2, y, 0.4, -HALF);
  F.waterCooler(P, 8.4, y, 1.6, -HALF);
  F.sofa(P, 6.2, y, 2.6, Math.PI);
  if (f % 3 === 0) F.gasTank(P, 8.5, y, -4.0);
  // Filing and books along the core.
  for (const x of [-4.2, -3.6, -3.0]) F.filingCabinet(P, x, y, -3.85, Math.PI);
  F.bookshelf(P, 3.4, y, -3.8, Math.PI);
  F.bookshelf(P, 2.3, y, -3.8, Math.PI);
  F.plant(P, -13.3, y, -5.5, true);
  F.plant(P, 8.2, y, -5.6, true);
}

// ---------------------------------------------------------------- the penthouse

// Floor 22: a grand living room round a fireplace, a dining room for twelve,
// and the kitchen.
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

// Floor 23: three bedrooms, each with its own bathroom.
function bedrooms(P, f, y) {
  // Walls. West: two rooms either side of a corridor to the window.
  partition(P, f, 'x', -1, -14, -6.2);
  partition(P, f, 'x', 1, -14, -6.2);
  partition(P, f, 'z', -6.2, -9, -1, -3.2, -2.3);
  partition(P, f, 'z', -6.2, 1, 7, 2.3, 3.2);
  // Their bathrooms in the corners by the glass.
  partition(P, f, 'x', -6, -14, -10.5, -11.7, -10.9);
  partition(P, f, 'z', -10.5, -9, -6);
  partition(P, f, 'x', 4, -14, -10.5, -11.7, -10.9);
  partition(P, f, 'z', -10.5, 4, 7);
  // East: the third room and its bathroom.
  partition(P, f, 'z', 5.8, -9, -1, -3.2, -2.3);
  partition(P, f, 'x', -1, 5.8, 10);
  partition(P, f, 'x', -6.5, 5.8, 10, 7, 7.8);

  const room = (bx, bz, yaw, cover, nightX) => {
    H.rug(P, bx, y, bz + (yaw === 0 ? 0.6 : -0.6), 2.6, 3);
    H.bed(P, bx, y, bz, yaw, 1.6, cover);
    const s = yaw === 0 ? -1 : 1;
    for (const dx of nightX) H.nightstand(P, bx + dx, y, bz + s * 0.8, yaw);
  };
  // Bed heads against the corridor walls.
  room(-11, -2.15, Math.PI, 0x7a2a32, [-1.2, 1.2]);
  room(-11, 2.15, 0, 0x2a3a6a, [-1.2, 1.2]);
  room(7.9, -2.15, Math.PI, 0x2a5a3a, [-1.2]);
  H.wardrobe(P, -6.55, y, -6.2, -HALF);
  H.wardrobe(P, -6.55, y, 5.4, -HALF);
  H.wardrobe(P, 6.15, y, -4.6, HALF, 1.6);
  H.armchair(P, -8, y, -7.9, Math.PI);
  H.armchair(P, -8, y, 6.2, 0);
  // Bathrooms.
  H.bathtub(P, -12.2, y, -8.45, 0);
  H.toilet(P, -11, y, -6.6, Math.PI);
  H.vanity(P, -13.7, y, -7.2, HALF);
  H.bathtub(P, -12.2, y, 6.45, 0);
  H.toilet(P, -11, y, 4.6, 0);
  H.vanity(P, -13.7, y, 5.2, HALF);
  H.bathtub(P, 8, y, -8.45, 0);
  H.toilet(P, 6.4, y, -7.2, HALF);
}

// Floor 24: the master bedroom, a dressing room, a bathroom and a study.
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
  if (f >= PENTHOUSE) {
    // Chandeliers in the big rooms, plain lights elsewhere.
    for (const [x, z] of [[-9.5, 0], [7.4, 2.2]]) if (f === PENTHOUSE) F.chandelier(P, x, top, z);
    if (f === PENTHOUSE + 2) F.chandelier(P, -10, top, 1.5);
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

