import * as THREE from 'three';
import { block, panel, plate, assembly } from './kit.js';
import * as F from './furniture.js';

// Trump Tower, at 100 m.
//
// The real one is 58 storeys on Fifth Avenue: a dark bronze glass shaft with a
// sawtooth of notched corners up two faces, on a stepped podium whose terraces
// are planted with trees, with the name in brass over the door and a pink
// marble atrium inside. Here it is 25 storeys of 4 m — a six-storey podium of
// shops round an atrium, nineteen storeys of offices over it, and a plant room
// on the roof. The avenue is on the +z side.
//
// **How it stands is the point.** Concrete columns and a concrete core carry
// every slab. Glass, partitions and furniture carry nothing (building/support.js).
// Break the columns and the core on one storey and everything above comes down.
//
//                 x: -20            0              20
//     z -12   +---------------------------------------+   podium, floors 0-5
//             | plant  |    +--core--+    | atrium |   |   (steps back on 4, 5)
//             | room   |    |stair|lift   |  void  |   |
//             |        |    +--------+    |        |   |
//     z  12   +--------------[ door ]-----------------+
//                         TRUMP TOWER
//
//     tower, floors 6-24: x -14..10, z -9..7, with a sawtooth of 45-degree
//     teeth out to x = 12 and z = 9.

export const FLOOR_H = 4;
const SLAB = 0.3;
export const PODIUM_FLOORS = 6;
export const TOP_FLOOR = 24;
const ROOF = TOP_FLOOR + 1;

const T = (f) => f * FLOOR_H + SLAB;        // top of floor f's slab
const U = (f) => (f + 1) * FLOOR_H;         // underside of the slab above it

const CORE = { x0: -5, x1: 5, z0: -3.5, z1: 3.5, t: 0.4 };
const ATRIUM = { x0: 10, x1: 15, z0: -7, z1: 7 };
const podiumFront = (f) => (f <= 3 ? 12 : f === 4 ? 10.5 : 9);

// The tower's outline, anticlockwise from above (+x right, +z towards you).
const OUTLINE = (() => {
  const pts = [[-14, -9], [10, -9]];
  for (const b of [-9, -5, -1, 3]) pts.push([12, b + 2], [10, b + 4]);
  for (const a of [6, 2, -2, -6, -10, -14]) pts.push([a + 2, 9], [a, 7]);
  return pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
})();

export const SITE = { x0: -21, x1: 21, z0: -13, z1: 14 };      // what the job measures
export const ENTRY = { x: 0, z: 20, yaw: 0 };                   // where you arrive, facing the door

function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const inCore = (x, z, m = 0) => x > CORE.x0 - m && x < CORE.x1 + m && z > CORE.z0 - m && z < CORE.z1 + m;
const rectPoly = (x0, z0, x1, z1) => [new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x0, 0, z1)];

export function buildTower(P) {
  for (let f = 0; f <= ROOF; f++) {
    slabs(P, f);
    if (f <= TOP_FLOOR) {
      columns(P, f);
      core(P, f);
      stair(P, f);
      facade(P, f);
      fitOut(P, f);
    }
  }
  terraces(P);
  roof(P);
  sign(P);
}

// ---------------------------------------------------------------- slabs

const cutsBetween = (list, a, b) => [...new Set([a, ...list.filter((v) => v > a && v < b), b])].sort((m, n) => m - n);

function slabs(P, f) {
  const y0 = f * FLOOR_H, y1 = T(f);
  // Every slab bay gets a suspended ceiling under it (the ceiling of the floor
  // below), and on the office floors carpet over it.
  const offices = f >= PODIUM_FLOORS && f !== ROOF;
  const add = (x0, z0, x1, z1, kind) => {
    const s = block(P, kind, x0, y0, z0, x1, y1, z1, 'slab', { floor: f, lateral: true });
    if (f >= 1) block(P, 'plaster', x0, y0 - 0.03, z0, x1, y0, z1, 'ceiling', { floor: f - 1, hang: true, tint: 0xf2efe8 });
    if (offices) block(P, 'carpet', x0, y1, z0, x1, y1 + 0.02, z1, 'carpet', { floor: f });
    return s;
  };
  const addPlate = (poly, kind) => {
    plate(P, kind, poly, y0, y1, 'slab', { floor: f, lateral: true });
    plate(P, 'plaster', poly, y0 - 0.03, y0, 'ceiling', { floor: f - 1, hang: true, tint: 0xf2efe8 });
    if (offices) plate(P, 'carpet', poly, y1, y1 + 0.02, 'carpet', { floor: f });
  };

  if (f < PODIUM_FLOORS || f === PODIUM_FLOORS) {
    // The podium plate. Above floor 0 it covers what the floor below covered,
    // and whatever the floor itself does not reach is terrace roof.
    const below = f === 0 ? 12 : podiumFront(f - 1);
    const here = f < PODIUM_FLOORS ? podiumFront(f) : -99;
    const xs = [-20, -14, -9.5, -5, 0, 5, 10, 15, 20];
    const zs = cutsBetween([-7, -3.5, 3.5, 7, here], -12, below);
    for (let i = 0; i < xs.length - 1; i++)
      for (let k = 0; k < zs.length - 1; k++) {
        const x0 = xs[i], x1 = xs[i + 1], z0 = zs[k], z1 = zs[k + 1];
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (f >= 1 && inCore(cx, cz)) continue;
        if (f >= 1 && f < PODIUM_FLOORS && cx > ATRIUM.x0 && cx < ATRIUM.x1 && cz > ATRIUM.z0 && cz < ATRIUM.z1) continue;
        const roofHere = f === PODIUM_FLOORS || cz > here;
        if (f === PODIUM_FLOORS) {
          // Round the foot of the tower: only what lies outside its outline.
          for (const [a0, b0, a1, b1] of subtract([x0, z0, x1, z1], [-14, -9, 12, 9])) add(a0, b0, a1, b1, 'roofing');
          continue;
        }
        add(x0, z0, x1, z1, f === 0 ? 'marble' : roofHere ? 'roofing' : 'concrete');
      }
    if (f === PODIUM_FLOORS) notchRoofs(P, y0, y1);
  }
  if (f >= PODIUM_FLOORS) {
    const kind = f === ROOF ? 'roofing' : 'concrete';
    const xs = [-14, -9.5, -5, 0, 5, 10], zs = [-9, -3.5, 3.5, 7];
    for (let i = 0; i < xs.length - 1; i++)
      for (let k = 0; k < zs.length - 1; k++) {
        const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[k] + zs[k + 1]) / 2;
        // The roof is closed over the lift and open over the stair.
        if (inCore(cx, cz) && (f !== ROOF || cx < 0)) continue;
        add(xs[i], zs[k], xs[i + 1], zs[k + 1], kind);
      }
    // The teeth.
    for (const b of [-9, -5, -1, 3]) addPlate([new THREE.Vector3(10, 0, b), new THREE.Vector3(12, 0, b + 2), new THREE.Vector3(10, 0, b + 4)], kind);
    for (const a of [-14, -10, -6, -2, 2, 6]) addPlate([new THREE.Vector3(a, 0, 7), new THREE.Vector3(a + 4, 0, 7), new THREE.Vector3(a + 2, 0, 9)], kind);
  }
  // Inside the core: the stair landing. The lift shaft stays open.
  // It runs over the tops of the core walls, which is what it rests on.
  if (f >= 1) block(P, f === ROOF ? 'roofing' : 'concrete', CORE.x0, y0, 1.5, 0.2, y1, CORE.z1, 'slab', { floor: f, lateral: true });
}

// The triangles of podium roof left between the tower's teeth.
function notchRoofs(P, y0, y1) {
  const v = (x, z) => new THREE.Vector3(x, 0, z);
  const tri = (a, b, c) => plate(P, 'roofing', [a, b, c], y0, y1, 'slab', { floor: PODIUM_FLOORS, lateral: true });
  for (const b of [-9, -5, -1, 3]) { tri(v(10, b), v(12, b), v(12, b + 2)); tri(v(12, b + 2), v(12, b + 4), v(10, b + 4)); }
  for (const a of [-14, -10, -6, -2, 2, 6]) { tri(v(a, 9), v(a, 7), v(a + 2, 9)); tri(v(a + 2, 9), v(a + 4, 7), v(a + 4, 9)); }
  // And the square in the re-entrant corner where the two sawtooth faces meet.
  block(P, 'roofing', 10, y0, 7, 12, y1, 9, 'slab', { floor: PODIUM_FLOORS, lateral: true });
}

// Rectangle A minus rectangle B, as up to four rectangles.
function subtract([ax0, az0, ax1, az1], [bx0, bz0, bx1, bz1]) {
  if (bx0 >= ax1 || bx1 <= ax0 || bz0 >= az1 || bz1 <= az0) return [[ax0, az0, ax1, az1]];
  const out = [];
  if (az0 < bz0) out.push([ax0, az0, ax1, bz0]);
  if (bz1 < az1) out.push([ax0, bz1, ax1, az1]);
  const z0 = Math.max(az0, bz0), z1 = Math.min(az1, bz1);
  if (ax0 < bx0) out.push([ax0, z0, bx0, z1]);
  if (bx1 < ax1) out.push([bx1, z0, ax1, z1]);
  return out;
}

// ---------------------------------------------------------------- structure

function columns(P, f) {
  const tower = f >= PODIUM_FLOORS;
  const xs = tower ? [-13.6, -9.5, -5, 0, 5, 9.6] : [-19.6, -14, -9.5, -5, 0, 5, 10, 15, 19.6];
  const front = tower ? 6.6 : podiumFront(f) - 0.4;
  const zs = tower ? [-8.6, -3.5, 3.5, 6.6] : [-11.6, -7, -3.5, 3.5, 7, front].filter((z) => z <= front);
  const s = 0.4;
  for (const x of xs)
    for (const z of zs) {
      if (inCore(x, z, 0.5)) continue;
      if (f === 0 && Math.abs(x) < 3.2 && z > 11) continue;      // the doorway
      if (!tower && x > ATRIUM.x0 && x < ATRIUM.x1 && z > ATRIUM.z0 && z < ATRIUM.z1) continue;
      block(P, f === 0 ? 'marble' : 'concrete', x - s, T(f), z - s, x + s, U(f), z + s, 'column', { floor: f, hp: 10, load: ROOF - f });
    }
}

function core(P, f) {
  const { x0, x1, z0, z1, t } = CORE;
  // Full storey height, through the slab line: there is no slab inside the core
  // for a wall to stand on, so each storey's walls stand on the ones below.
  const y0 = f === 0 ? T(0) : f * FLOOR_H, y1 = U(f);
  const kind = f === 0 ? 'marble' : 'concrete';
  const wall = (a0, b0, a1, b1, ya = y0, yb = y1) => block(P, kind, a0, ya, b0, a1, yb, b1, 'core', { floor: f, hp: 14, load: ROOF - f });
  wall(x0, z0, x0 + t, z1);
  wall(x1 - t, z0, x1, z1);
  wall(x0 + t, z0, x1 - t, z0 + t);
  // The street side, with the stair door and the lift door in it: three piers
  // up to door height, and one band across the top that rests on them. (The
  // band was two lintels once, and a lintel touching its neighbours only at the
  // ends rests on nothing.)
  const head = T(f) + 2.4;
  wall(x0 + t, z1 - t, -4.1, z1, y0, head);
  wall(-2.6, z1 - t, 0.9, z1, y0, head);
  wall(3.4, z1 - t, x1 - t, z1, y0, head);
  wall(x0 + t, z1 - t, x1 - t, z1, head, y1);
  // Between stair and lift.
  block(P, 'concrete', -0.2, y0, z0 + t, 0.2, y1, z1 - t, 'core', { floor: f, hp: 14, load: ROOF - f });
  // Brass lift doors — the only thing between the lobby and the shaft.
  // They stand just outside the wall, on the corridor slab: there is no floor
  // inside the shaft for them to stand on.
  const yd = T(f);
  block(P, 'brass', 0.9, yd, z1, 2.15, yd + 2.4, z1 + 0.04, 'furniture', { floor: f });
  block(P, 'brass', 2.15, yd, z1, 3.4, yd + 2.4, z1 + 0.04, 'furniture', { floor: f });
}

// A switchback of twenty 20 cm risers per storey. One piece per storey, with
// a collider per step so the character can climb it.
function stair(P, f) {
  const y = T(f);
  const boxes = [];
  for (let n = 1; n <= 10; n++) {
    // The first step reaches back over the landing, which is what it stands on.
    const z1 = n === 1 ? 1.7 : 1.5 - (n - 1) * 0.3, z0 = 1.5 - n * 0.3, top = y + n * 0.2;
    boxes.push([-4.6, top - 0.35, z0, -2.5, top, z1]);
  }
  boxes.push([-4.6, y + 1.75, -3.1, -0.2, y + 2.0, -1.5]);
  for (let n = 1; n <= 10; n++) {
    const z0 = -1.5 + (n - 1) * 0.3, z1 = z0 + 0.3, top = y + 2 + n * 0.2;
    boxes.push([-2.3, top - 0.35, z0, -0.2, top, z1]);
  }
  const rel = boxes.map((b) => [b[0], b[1] - y, b[2], b[3], b[4] - y, b[5]]);
  assembly(P, 0, y, 0, 0, [{ kind: 'concrete', boxes: rel }], 'stair', { floor: f, colliders: rel, structural: false });
}

// ---------------------------------------------------------------- facade

function facade(P, f) {
  const tower = f >= PODIUM_FLOORS;
  const poly = tower ? OUTLINE : rectPoly(-20, -12, 20, podiumFront(f));
  const bay = tower ? 1.45 : 2.0;
  const y0 = T(f), yTop = f * FLOOR_H + 3.5, ySp1 = U(f) + SLAB;
  for (let e = 0; e < poly.length; e++) {
    const A = poly[e], B = poly[(e + 1) % poly.length];
    const len = A.distanceTo(B);
    // Which side is out: step off the middle of the edge and ask.
    const dx = (B.x - A.x) / len, dz = (B.z - A.z) / len;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const leftIn = tower ? inPoly(poly, mx - dz * 0.2, mz + dx * 0.2) : (mx - dz * 0.2 > -20 && mx - dz * 0.2 < 20 && mz + dx * 0.2 > -12 && mz + dx * 0.2 < podiumFront(f));
    const out = leftIn ? -1 : 1;     // offset sign that points outward
    const n = Math.max(1, Math.round(len / bay));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const c = new THREE.Vector3(A.x + (B.x - A.x) * t, 0, A.z + (B.z - A.z) * t);
      const a = c.clone().addScaledVector(new THREE.Vector3(dx, 0, dz), -0.04), b = c.clone().addScaledVector(new THREE.Vector3(dx, 0, dz), 0.04);
      // The entrance is an opening: no glass across it and no mullions in it.
      const door = f === 0 && Math.abs(A.z - 12) < 0.01 && Math.abs(B.z - 12) < 0.01;
      if (!(door && Math.abs(c.x) < 2.9)) panel(P, 'bronze', a, b, y0, yTop, 0.14, -out * 0.07, 'mullion', { floor: f });
      if (i === n) continue;
      const p0 = new THREE.Vector3(A.x + (B.x - A.x) * t, 0, A.z + (B.z - A.z) * t).addScaledVector(new THREE.Vector3(dx, 0, dz), 0.04);
      const p1 = new THREE.Vector3(A.x + (B.x - A.x) * ((i + 1) / n), 0, A.z + (B.z - A.z) * ((i + 1) / n)).addScaledVector(new THREE.Vector3(dx, 0, dz), -0.04);
      // The entrance: no glass across the door.
      const cx = (p0.x + p1.x) / 2;
      if (f === 0 && Math.abs(A.z - 12) < 0.01 && Math.abs(B.z - 12) < 0.01 && Math.abs(cx) < 3.2) continue;
      panel(P, 'glass', p0, p1, y0 + 0.02, yTop - 0.02, 0.03, -out * 0.07, 'glass', { floor: f });
    }
    // Spandrel: the dark band that hides the next slab's edge.
    if (f < (tower ? TOP_FLOOR + 1 : PODIUM_FLOORS)) panel(P, 'bronze', A, B, yTop, ySp1, 0.19, -out * 0.025, 'spandrel', { floor: f, tint: 0x6a5a48 });
  }
}

// ---------------------------------------------------------------- fit-out

const COLS_T = [];
for (const x of [-13.6, -9.5, -5, 0, 5, 9.6]) for (const z of [-8.6, -3.5, 3.5, 6.6]) if (!inCore(x, z, 0.5)) COLS_T.push([x, z]);
const nearColumn = (x, z, d) => COLS_T.some(([a, b]) => Math.abs(a - x) < d && Math.abs(b - z) < d);

function fitOut(P, f) {
  const y = T(f);
  if (f === 0) lobby(P, y);
  else if (f < PODIUM_FLOORS) shops(P, f, y);
  else offices(P, f, y);
  // Ceiling lights on every floor.
  const top = U(f);
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
  // The plant room: two transformers, the gas, the switchgear.
  block(P, 'plaster', -14.2, y, -11.6, -14, U(0), -6.8, 'wall', { floor: 0 });
  block(P, 'plaster', -19.6, y, -7, -17, U(0), -6.8, 'wall', { floor: 0 });
  block(P, 'plaster', -15.6, y, -7, -14.2, U(0), -6.8, 'wall', { floor: 0 });
  block(P, 'wood', -17, y, -6.95, -15.6, y + 2.2, -6.85, 'furniture', { floor: 0, tint: 0x5a6a5a });
  F.transformer(P, -18.4, y, -10.4, 0);
  F.transformer(P, -15.8, y, -10.4, 0);
  for (const x of [-19.2, -18.8, -18.4]) F.gasTank(P, x, y, -7.6);
  F.electricalCabinet(P, -14.7, y, -9, Math.PI / 2);
}

function shops(P, f, y) {
  const front = podiumFront(f);
  for (let x = -17; x <= 6; x += 3.2)
    for (const z of [-9.2, 5.6]) {
      if (z > front - 1.5 || inCore(x, z, 1.2) || (x < -13.5 && z < -6.5)) continue;
      if (Math.abs(x - -14) < 1 || Math.abs(x - -9.5) < 1 || Math.abs(x - -5) < 1 || Math.abs(x - 0) < 1 || Math.abs(x - 5) < 1) {
        F.displayTable(P, x + 1.5, y, z + (z < 0 ? 1.2 : -1.2), 0);
      } else F.clothesRack(P, x, y, z, 0);
    }
  for (const x of [-12, -7.5, 7.5]) F.mannequin(P, x, y, front - 1.2, Math.PI);
  F.counter(P, 16.5, y, front - 3, Math.PI / 2, 2.4);
  F.plant(P, 18.6, y, -11, false);
  // A kitchen at the back on the even floors, with its gas.
  if (f % 2 === 0) {
    F.counter(P, -17, y, -9, 0, 2.4);
    F.cooker(P, -18.6, y, -11.2, 0);
    F.gasTank(P, -17.6, y, -11.4);
    F.fridge(P, -15.4, y, -11.2, 0);
  }
  // A glass balustrade with a brass rail round the atrium.
  const { x0, x1, z0, z1 } = ATRIUM;
  for (const [a, b] of [[[x0, z0], [x1, z0]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]]) {
    const A = new THREE.Vector3(a[0], 0, a[1]), B = new THREE.Vector3(b[0], 0, b[1]);
    panel(P, 'glass', A, B, y, y + 1.0, 0.02, -0.03, 'glass', { floor: f });
    panel(P, 'brass', A, B, y + 1.0, y + 1.06, 0.06, -0.03, 'furniture', { floor: f });
  }
}

function offices(P, f, y) {
  // Two rows of desks along the long faces, each with a chair, a monitor and a
  // keyboard, turned to face into the room.
  for (let x = -12.4; x <= 8.6; x += 2.1) {
    for (const [z, face] of [[-7.4, 0], [5.3, Math.PI]]) {
      if (nearColumn(x, z, 1.1) || inCore(x, z, 1.4)) continue;
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
  F.counter(P, 8, y, -2.3, Math.PI / 2, 2.4);
  F.fridge(P, 8.2, y, 0.4, -Math.PI / 2);
  F.waterCooler(P, 8.4, y, 1.6, -Math.PI / 2);
  F.sofa(P, 6.2, y, 2.6, Math.PI);
  if (f % 3 === 0) F.gasTank(P, 8.5, y, -4.0);
  // Filing and books along the core.
  for (const x of [-4.2, -3.6, -3.0]) F.filingCabinet(P, x, y, -3.85, Math.PI);
  F.bookshelf(P, 3.4, y, -3.8, Math.PI);
  F.bookshelf(P, 2.3, y, -3.8, Math.PI);
  F.plant(P, -13.3, y, -5.5, true);
  F.plant(P, 8.2, y, -5.6, true);
}

// ---------------------------------------------------------------- outside

function terraces(P) {
  // Rails round the edge of each setback, and planters with trees on them.
  for (const f of [4, 5, 6]) {
    const y = T(f);
    const zOut = podiumFront(f - 1);
    // On the podium roof the rail stops where the tower's teeth reach the edge.
    const spans = f === PODIUM_FLOORS ? [[-20, -14.2], [12.2, 20]] : [[-20, 20]];
    for (const [xa, xb] of spans) {
      const A = new THREE.Vector3(xa, 0, zOut), B = new THREE.Vector3(xb, 0, zOut);
      panel(P, 'glass', B, A, y, y + 1.1, 0.03, 0.07, 'glass', { floor: f });
      panel(P, 'brass', B, A, y + 1.1, y + 1.16, 0.08, 0.07, 'furniture', { floor: f });
    }
    if (f === PODIUM_FLOORS) continue;
    const zIn = f < PODIUM_FLOORS ? podiumFront(f) : 9;
    const zp = (zOut + zIn) / 2 + 0.05;
    for (let x = -18; x <= 18; x += 4) tree(P, x, y, zp);
  }
  for (const [x, z] of [[-17.5, -10], [16.5, -10], [16.5, -4], [-17.5, -4]]) tree(P, x, T(PODIUM_FLOORS), z);
}

function tree(P, x, y, z) {
  block(P, 'soil', x - 0.6, y, z - 0.6, x + 0.6, y + 0.6, z + 0.6, 'furniture', { floor: 0, tint: 0xa0a0a0 });
  block(P, 'wood', x - 0.07, y + 0.6, z - 0.07, x + 0.07, y + 2.3, z + 0.07, 'furniture', { floor: 0, tint: 0x6a5040 });
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + Math.sin(pos.getX(i) * 5.1 + pos.getY(i) * 3.3) * 0.12 + Math.cos(pos.getZ(i) * 4.7) * 0.1;
    pos.setXYZ(i, pos.getX(i) * k * 1.1, pos.getY(i) * k * 0.9, pos.getZ(i) * k * 1.1);
  }
  const merged = mergeVerticesIndexed(g);
  P.add({ parts: [{ kind: 'leaves', geometry: merged }], pos: new THREE.Vector3(x, y + 2.9, z), role: 'furniture' });
}

// Icosahedron geometry comes non-indexed; batches want it indexed.
function mergeVerticesIndexed(g) {
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const idx = new Uint16Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = g.attributes.position.getX(i); uv[i * 2 + 1] = g.attributes.position.getY(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function roof(P) {
  const y = T(ROOF);
  // Parapet round the roof edge.
  for (let e = 0; e < OUTLINE.length; e++) {
    const A = OUTLINE[e], B = OUTLINE[(e + 1) % OUTLINE.length];
    panel(P, 'glass', A, B, y, y + 1.1, 0.03, 0, 'glass', { floor: ROOF });
  }
  // The plant room over the core, the lift motor room, and a generator.
  const h = y + 3.6;
  block(P, 'concrete', -6, y, -4.5, 6, h, -4.1, 'core', { floor: ROOF });
  block(P, 'concrete', -6, y, 4.1, -4.1, y + 2.4, 4.5, 'core', { floor: ROOF });
  block(P, 'concrete', -2.6, y, 4.1, 6, y + 2.4, 4.5, 'core', { floor: ROOF });
  block(P, 'concrete', -6, y + 2.4, 4.1, 6, h, 4.5, 'core', { floor: ROOF });
  block(P, 'concrete', -6, y, -4.1, -5.6, h, 4.1, 'core', { floor: ROOF });
  block(P, 'concrete', 5.6, y, -4.1, 6, h, 4.1, 'core', { floor: ROOF });
  block(P, 'roofing', -6.2, h, -4.7, 6.2, h + 0.3, 4.7, 'slab', { floor: ROOF, lateral: true });
  F.transformer(P, 8, y, 3.5, Math.PI / 2);
  // A mast.
  block(P, 'steel', -0.15, h + 0.3, -0.15, 0.15, h + 6, 0.15, 'column', { floor: ROOF, tint: 0xcccccc });
}

// TRUMP TOWER in brass over the entrance, on a brass canopy.
const FONT = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
};

function sign(P) {
  const yC = U(0) + 0.25;
  block(P, 'brass', -7, yC, 11.9, 7, yC + 0.2, 13.6, 'furniture', { floor: 0 });
  const text = 'TRUMP TOWER', px = 0.2, y0 = yC + 0.2, z0 = 12.02, z1 = 12.14;
  const cols = text.length * 6 - 1;
  const x0 = -(cols * px) / 2;
  for (let n = 0; n < text.length; n++) {
    const g = FONT[text[n]];
    if (!g) continue;
    const boxes = [];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++)
        if (g[row][col] === '#') boxes.push([x0 + (n * 6 + col) * px, y0 + (6 - row) * px, z0, x0 + (n * 6 + col + 1) * px, y0 + (7 - row) * px, z1]);
    assembly(P, 0, 0, 0, 0, [{ kind: 'brass', boxes }], 'furniture', { floor: 0 });
  }
}

