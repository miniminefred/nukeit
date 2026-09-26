import * as THREE from 'three';
import { block, panel, plate, assembly } from './kit.js';
import * as F from './furniture.js';
import { fitOut as furnish } from './interiors.js';
import { FLOOR_H, SLAB, PODIUM_FLOORS, TOP_FLOOR, ROOF, PENTHOUSE, T, U, CORE, ATRIUM, podiumFront, OUTLINE, inPoly, inCore, rectPoly } from './plan.js';

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
// The floor plan is in plan.js; what is on each floor is in interiors.js.

export { FLOOR_H, PODIUM_FLOORS, TOP_FLOOR } from './plan.js';

export const SITE = { x0: -21, x1: 21, z0: -13, z1: 14 };      // what the job measures
export const ENTRY = { x: 0, z: 20, yaw: 0 };                   // where you arrive, facing the door

export function buildTower(P) {
  for (let f = 0; f <= ROOF; f++) {
    slabs(P, f);
    if (f <= TOP_FLOOR) {
      columns(P, f);
      core(P, f);
      stair(P, f);
      facade(P, f);
      furnish(P, f);
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
  // Carpet on the office floors, marble in the penthouse.
  const finish = f >= PODIUM_FLOORS && f !== ROOF ? (f >= PENTHOUSE ? 'marble' : 'carpet') : null;
  const add = (x0, z0, x1, z1, kind) => {
    const s = block(P, kind, x0, y0, z0, x1, y1, z1, 'slab', { floor: f, lateral: true });
    if (f >= 1) block(P, 'plaster', x0, y0 - 0.03, z0, x1, y0, z1, 'ceiling', { floor: f - 1, hang: true, tint: 0xf2efe8 });
    if (finish) block(P, finish, x0, y1, z0, x1, y1 + 0.02, z1, 'carpet', { floor: f, structural: false });
    return s;
  };
  const addPlate = (poly, kind) => {
    plate(P, kind, poly, y0, y1, 'slab', { floor: f, lateral: true });
    plate(P, 'plaster', poly, y0 - 0.03, y0, 'ceiling', { floor: f - 1, hang: true, tint: 0xf2efe8 });
    if (finish) plate(P, finish, poly, y1, y1 + 0.02, 'carpet', { floor: f, structural: false });
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
      // Marble in the lobby and the penthouse, bare concrete everywhere else.
      block(P, f === 0 || f >= PENTHOUSE ? 'marble' : 'concrete', x - s, T(f), z - s, x + s, U(f), z + s, 'column', { floor: f, hp: 10, load: ROOF - f });
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
  // A brass sill across the lift doorway, so there is floor between the car
  // and the landing. It rests on the core wall below.
  if (f >= 1) block(P, 'brass', 0.9, f * FLOOR_H, 3.05, 3.4, T(f), z1, 'furniture', { floor: f, structural: false });
  // Tagged so the lift can find them and slide them open.
  block(P, 'brass', 0.9, yd, z1, 2.15, yd + 2.4, z1 + 0.04, 'liftdoor', { floor: f, tag: 'left', structural: false });
  block(P, 'brass', 2.15, yd, z1, 3.4, yd + 2.4, z1 + 0.04, 'liftdoor', { floor: f, tag: 'right', structural: false });
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

