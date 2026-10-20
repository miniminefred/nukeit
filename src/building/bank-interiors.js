import { assembly, block } from './kit.js';
import * as F from './furniture.js';
import * as W from './furniture-work.js';
import * as H from './furniture-home.js';
import * as L from './furniture-lobby.js';
import { T, U, LOWER, ATRIUM, floorUse } from './plan.js';

// What is on each of Big Boy Bank's floors (the plan is building/bank-plan.js):
//
//   lower level     the vault behind its round door: deposit boxes, gold, the
//                   money on its pallets; the bank's plant beside it
//   0               the banking hall: tellers behind glass, the customers'
//                   side under the gilded ceiling three storeys up, chandeliers
//   1-2             the galleries round the hall: desks, a rail over the void
//   3-6             private banking: offices for the bank's richest customers
//   7-14            the trading floors: rows of desks of screens, a ticker
//   15-26           offices
//   27              the executive floor; 28 the boardroom; 29 the CEO's office

const HALF = Math.PI / 2;

// The bank's cameras, as they are built (sim/bank-security.js watches through
// them): { piece, kind 'dome' | 'swivel', x, y (the ceiling), z, yaw, f }.
export const CAMERAS = [];

// A camera under the ceiling over (x, z) on floor f, the ceiling at yTop: a
// black dome, or the bracket of a swivel camera (its head is drawn by
// sim/bank-security.js). `yaw`: which way a swivel camera looks at rest.
function cam(P, kind, f, x, yTop, z, yaw = 0) {
  const y = yTop - 0.03;
  const boxes = kind === 'dome'
    ? [{ cyl: [0, -0.015, 0], r: 0.19, h: 0.03, seg: 16 }, { ball: [0, -0.06, 0], s: [0.15, 0.12, 0.15] }]
    : [{ cyl: [0, -0.015, 0], r: 0.08, h: 0.03, seg: 10 }, { cyl: [0, -0.22, 0], r: 0.025, h: 0.42, seg: 8 }];
  const piece = assembly(P, x, y, z, 0, [{ kind: 'plastic', boxes, tint: 0x16181a }], 'lamp', { floor: f, hang: true, structural: false, tag: 'camera' });
  if (piece) CAMERAS.push({ piece, kind, x, y, z, yaw, f });
}

export function furnishBank(P, f) {
  const y = T(f);
  const use = floorUse(f);
  if (f === LOWER) CAMERAS.length = 0;
  cameras(P, f, use);
  if (f === LOWER) vault(P, y);
  else if (use === 'banking hall') hall(P, y);
  else if (use === 'mezzanine') gallery(P, f, y);
  else if (use === 'private banking') privateBanking(P, f, y);
  else if (use === 'trading') trading(P, f, y);
  else if (use === 'offices') offices(P, f, y);
  else if (use === 'executive') executive(P, y);
  else if (use === 'boardroom') boardroom(P, y);
  else if (use === 'ceo') ceo(P, y);
  // A spare extinguisher on the core's east wall, every third floor.
  if (f >= 0 && f % 3 === 0) W.extinguisher(P, 5.12, y, 1.6, HALF, true);
}

// Where the cameras are, floor by floor.
function cameras(P, f, use) {
  const top = U(f);
  if (f === LOWER) {
    cam(P, 'dome', f, -14, top, -2.5);
    cam(P, 'dome', f, -14, top, -11.5);
    cam(P, 'swivel', f, -2.5, top, -5, -HALF);
  } else if (use === 'banking hall') {
    for (const x of [-8, 8]) cam(P, 'dome', f, x, U(ATRIUM.top), 11);
    for (const x of [-19, 19]) cam(P, 'dome', f, x, top, 9);
    cam(P, 'dome', f, 0, top, -10);
    cam(P, 'swivel', f, -11, top, 4.4, 0);
    cam(P, 'swivel', f, 11, top, 4.4, 0);
  } else if (use === 'mezzanine') {
    cam(P, 'dome', f, -18, top, -6);
    cam(P, 'dome', f, 18, top, -6);
  } else if (use === 'private banking' || use === 'trading') {
    cam(P, 'swivel', f, 0, top, -6, Math.PI);
  } else if (use === 'executive' || use === 'boardroom' || use === 'ceo') {
    cam(P, 'dome', f, -8, top, 6);
    cam(P, 'dome', f, 8, top, -6);
  }
}

// ---------------------------------------------------------------- the vault

// A room of steel in the back west corner of the lower level, its one way in
// the round door; inside, deposit boxes round the walls, gold on its tables,
// and the money on pallets in rows.
export const VAULT = { x0: -22, x1: -6, z0: -14.5, z1: -5, door: -14 };
function vault(P, y) {
  const { x0, x1, z0, z1, door } = VAULT, top = U(LOWER), t = 0.5;
  const wall = (a0, b0, a1, b1) => block(P, 'steel', a0, y, b0, a1, top, b1, 'wall', { floor: LOWER, structural: false, tint: 0x5a6066 });
  wall(x0, z0, x1, z0 + t);
  wall(x0, z0 + t, x0 + t, z1);
  wall(x1 - t, z0 + t, x1, z1);
  // The front, with the doorway the round door covers: piers to the door's
  // height, and one band across the whole front on them (a lintel touching
  // its neighbours only at its ends would rest on nothing).
  const steel = (a0, ya, a1, yb) => block(P, 'steel', a0, ya, z1 - t, a1, yb, z1, 'wall', { floor: LOWER, structural: false, tint: 0x5a6066 });
  steel(x0 + t, y, door - 1.05, y + 2.2);
  steel(door + 1.05, y, x1 - t, y + 2.2);
  steel(x0 + t, y + 2.2, x1 - t, top);
  const d = W.vaultDoor(P, door, y, z1, 0);
  if (d) d.tag = 'vault';
  // Deposit boxes round the back and the sides.
  for (const x of [-19.5, -16, -12.5, -9]) W.depositBoxes(P, x, y, z0 + t, 0, 3);
  W.depositBoxes(P, x0 + t, y, -10.5, HALF, 3);
  // Gold, and the money.
  for (const x of [-18, -14]) W.goldStack(P, x, y, -11.6, 0);
  for (const x of [-20, -18.6, -12.2, -10.8, -9.4]) for (const z of [-9.4, -7.6]) W.moneyStack(P, x, y, z, 0);
  F.ceilingLight(P, -14, top, -10);
  F.ceilingLight(P, -9, top, -8);
  // The plant, east of the vault.
  F.transformer(P, 18, y, -13, 0);
  F.transformer(P, 15.2, y, -13, 0);
  W.boiler(P, 10.5, y, -12.6, 0);
  F.electricalCabinet(P, 7, y, -13.8, 0);
  // The fuse box the vault's lasers run on (sim/bank-security.js), beside the others.
  const fuse = F.electricalCabinet(P, 8, y, -13.8, 0);
  if (fuse) fuse.tag = 'fusebox';
  W.palletCrates(P, 18, y, 6, 0, 2);
  W.palletCrates(P, 15.5, y, 6, 0, 1);
  W.extinguisher(P, 12, y, -6, 0);
  F.ceilingLight(P, 14, top, -8);
}

// ---------------------------------------------------------------- the banking hall

// The tellers along the back of the hall, behind a marble counter with glass
// over it — a gap in the middle for the lifts and the stair; the customers'
// side in front of them under the hall's ceiling; a rope line, benches, plants,
// two chandeliers in the void; the managers' desks down the sides.
function hall(P, y) {
  for (const [a, b] of [[-11.5, -5.5], [5.5, 11.5]]) {
    const w = b - a, x = (a + b) / 2;
    assembly(P, x, y, 6.3, 0, [
      { kind: 'wood', round: 0.02, boxes: [[-w / 2, 0, -0.35, w / 2, 1.05, 0.35]], tint: 0x4a3020 },
      { kind: 'marble', boxes: [[-w / 2 - 0.03, 1.05, -0.38, w / 2 + 0.03, 1.1, 0.4]], tint: 0xe8e0d0 },
      { kind: 'clearglass', boxes: [[-w / 2, 1.1, 0.0, w / 2, 2.1, 0.02]], tint: 0xe6f0ee },
      { kind: 'brass', boxes: [[-w / 2, 2.1, -0.03, w / 2, 2.16, 0.05]] },
    ], 'furniture', { colliders: [[-w / 2, 0, -0.38, w / 2, 2.16, 0.4]] });
    for (let k = 0; k < 3; k++) F.officeChair(P, a + 1.2 + k * 2, y, 5.3, Math.PI);
  }
  L.stanchions(P, -7, y, 8.6, 0, 4, 1.2);
  L.stanchions(P, 7, y, 8.6, 0, 4, 1.2);
  for (const x of [-9, 9]) L.steelBench(P, x, y, 11.8, Math.PI, 2.2);
  for (const x of [-11, 11]) F.plant(P, x, y, 13.2, true);
  F.chandelier(P, -6, U(ATRIUM.top), 11);
  F.chandelier(P, 6, U(ATRIUM.top), 11);
  // Down the sides: the managers' desks.
  for (const x of [-20, -16, 16, 20]) for (const z of [7, 11]) {
    F.desk(P, x, y, z, x < 0 ? HALF : -HALF);
    F.officeChair(P, x + (x < 0 ? -0.8 : 0.8), y, z, x < 0 ? HALF : -HALF);
    F.officeChair(P, x + (x < 0 ? 0.9 : -0.9), y, z, x < 0 ? -HALF : HALF);
  }
  // The back of house behind the core: filing, a meeting table.
  for (const x of [-20, -17.5, 17.5, 20]) F.filingCabinet(P, x, y, -15.2, 0);
  F.meetingTable(P, 14, y, -9, 0);
  F.receptionDesk(P, -14, y, 2, 0);
}

// The galleries round the hall: desks in rows, a brass rail at the edge of the void.
function gallery(P, f, y) {
  block(P, 'brass', ATRIUM.x0, y, ATRIUM.z0 - 0.1, ATRIUM.x1, y + 1.05, ATRIUM.z0, 'furniture', { floor: f, structural: false });
  for (const x of [-20, -16, 16, 20]) for (const z of [-12, -7, 2, 7]) {
    F.desk(P, x, y, z, 0);
    F.officeChair(P, x, y, z + 0.9, Math.PI);
  }
  for (const x of [-10, 10]) F.bookshelf(P, x, y, -15.4, 0);
}

function privateBanking(P, f, y) {
  for (const x of [-20, -10, 10, 20]) for (const z of [-11, 9]) {
    W.executiveDesk(P, x, y, z, z < 0 ? 0 : Math.PI);
    H.armchair(P, x - 0.7, y, z + (z < 0 ? 1.4 : -1.4), z < 0 ? Math.PI : 0);
    H.armchair(P, x + 0.7, y, z + (z < 0 ? 1.4 : -1.4), z < 0 ? Math.PI : 0);
  }
  if (f % 2) F.meetingTable(P, -17, y, 0, HALF);
  F.plant(P, 22.5, y, 12.5, true);
  F.plant(P, -22.5, y, 12.5, true);
}

// ---------------------------------------------------------------- the tower

// Rows of desks, a screen on each, between the facade and the core; the
// ticker hung under the ceiling along the back, prices running.
function trading(P, f, y) {
  for (const z of [-8, 6]) for (let x = -10.5; x <= 10.6; x += 2.1) {
    if (Math.abs(Math.abs(x) - 8.5) < 0.8) continue;          // the column lines at x = ±8.5
    const s = z < 0 ? 1 : -1;
    F.desk(P, x, y, z, s > 0 ? 0 : Math.PI);
    F.monitor(P, x, y + 0.74, z - 0.18 * s, s > 0 ? 0 : Math.PI);
    if ((x * 10 + f) % 3 < 2) F.officeChair(P, x, y, z + 0.85 * s, s > 0 ? Math.PI : 0);
  }
  block(P, 'screen', -11, U(f) - 0.4, -9.6, 11, U(f) - 0.03, -9.5, 'lamp', { floor: f, hang: true, structural: false, tag: 'ticker' });
  F.waterCooler(P, 8.5, y, -1.5, -HALF);
}

function offices(P, f, y) {
  for (const z of [-8, 6]) for (const x of [-10.4, -3.6, 3.6, 10.4]) {
    const s = z < 0 ? 1 : -1;
    F.desk(P, x, y, z, s > 0 ? 0 : Math.PI);
    F.officeChair(P, x, y, z + 0.9 * s, s > 0 ? Math.PI : 0);
  }
  if (f % 2) F.filingCabinet(P, -10.8, y, -1, HALF);
  F.plant(P, 10.8, y, 1.5);
}

function executive(P, y) {
  H.rug(P, -8, y, 5.8, 5, 3, 0x5a3a2a);
  F.sofa(P, -8, y, 4.6, Math.PI, 0x2a2a30);
  H.armchair(P, -10.2, y, 6.2, HALF, 0x6a4a30);
  H.coffeeTable(P, -8, y, 6, 0);
  for (const x of [5.5, 9.5]) { W.executiveDesk(P, x, y, -8, 0); F.officeChair(P, x, y, -7.1, Math.PI); }
  F.bookshelf(P, -11.3, y, -6, HALF);
  F.plant(P, 11, y, 7, true);
}

function boardroom(P, y) {
  const t = W.boardTable(P, 0, y, -6.6, 0, 7);
  if (t) t.tag = 'boardroom';
  for (let k = 0; k < 6; k++) {
    const x = -3 + k * 1.2;
    F.officeChair(P, x, y, -7.9, 0, 0x2a2420);
    F.officeChair(P, x, y, -5.3, Math.PI, 0x2a2420);
  }
  F.plant(P, -11, y, -9, true);
  F.plant(P, 11, y, -9, true);
}

// The CEO's office, the whole top floor: the desk looking down Wall Street, a
// sofa, books; a gold statue of the CEO on a plinth, and a safe in the
// corner. (The vault's code and the illegal trading books lie on the desk:
// sim/heist.js puts them there.)
function ceo(P, y) {
  assembly(P, -10.4, y, 4.5, HALF, [
    { kind: 'concrete', boxes: [[-0.45, 0, -0.45, 0.45, 0.9, 0.45]], tint: 0x2a2a2a },
    { kind: 'gold', boxes: [{ ball: [0, 1.35, 0], s: [0.26, 0.45, 0.2] }, { ball: [0, 1.95, 0], s: [0.13, 0.15, 0.13] }, { cyl: [0, 1.0, 0], r: 0.2, r2: 0.12, h: 0.2 }] },
  ], 'furniture', { tag: 'statue', colliders: [[-0.45, 0, -0.45, 0.45, 2.1, 0.45]] });

  assembly(P, 10.6, y, -7.6, -HALF, [
    { kind: 'steel', round: 0.02, boxes: [[-0.4, 0, -0.35, 0.4, 0.9, 0.35]], tint: 0x3a3e44 },
    { kind: 'brass', boxes: [{ cylZ: [0.05, 0.55, 0.36], r: 0.08, h: 0.04 }, [-0.25, 0.2, 0.35, -0.2, 0.75, 0.38]] },
  ], 'furniture', { tag: 'safe', colliders: [[-0.4, 0, -0.35, 0.4, 0.9, 0.38]] });
  W.executiveDesk(P, 0, y, 6, Math.PI);
  F.officeChair(P, 0, y, 5.1, 0);
  H.rug(P, -8, y, -6.5, 5, 3.4, 0x4a2a22);
  F.sofa(P, -8, y, -7.8, 0, 0x3a2a24);
  H.coffeeTable(P, -8, y, -6.4, 0);
  for (const x of [8, 10]) F.bookshelf(P, x, y, -9.5, 0);
  F.plant(P, 11, y, 7, true);
  F.plant(P, -11, y, 7, true);
}
