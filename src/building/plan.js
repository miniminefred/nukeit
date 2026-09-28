import * as THREE from 'three';

// The tower's floor plan, as numbers every builder shares: how tall a storey
// is, where the core, the atrium and the lift are, what each floor is for.
//
//                 x: -20            0              20
//     z -12   +---------------------------------------+   podium, floors 0-5
//             | plant  |    +--core--+    | atrium |   |   (steps back on 4, 5)
//             | room   |    |stair|lift   |  void  |   |
//             |        |    +--------+    |        |   |
//     z  12   +--------------[ door ]-----------------+
//                         TRUMP TOWER
//
//     tower, floors 6-11: x -14..10, z -9..7, with a sawtooth of 45-degree
//     teeth out to x = 12 and z = 9.

export const FLOOR_H = 4;
export const SLAB = 0.3;
export const PODIUM_FLOORS = 6;
export const TOP_FLOOR = 11;         // 12 storeys: the roof at 48 m, the plant room to 52
export const ROOF = TOP_FLOOR + 1;

// What each floor is. The podium is the public part of the building; the
// penthouse is the top three storeys of the tower.
export const PENTHOUSE = TOP_FLOOR - 2;   // the top three storeys
export const PROGRAMME = {
  0: 'lobby',
  1: 'boutiques',
  2: 'jewellers',
  3: 'food court',
  4: 'restaurant',
  5: 'café and books',
  [PENTHOUSE]: 'penthouse: living',
  [PENTHOUSE + 1]: 'penthouse: bedrooms',
  [PENTHOUSE + 2]: 'penthouse: master suite',
};
export const floorUse = (f) => PROGRAMME[f] ?? (f >= PODIUM_FLOORS && f < PENTHOUSE ? 'offices' : '');

export const T = (f) => f * FLOOR_H + SLAB;        // top of floor f's slab
export const U = (f) => (f + 1) * FLOOR_H;         // underside of the slab above it

export const CORE = { x0: -5, x1: 5, z0: -3.5, z1: 3.5, t: 0.4 };
export const LIFT = { x0: 0.2, x1: 4.6, z0: -3.1, z1: 3.1, door0: 0.9, door1: 3.4 };
export const ATRIUM = { x0: 10, x1: 15, z0: -7, z1: 7 };
export const podiumFront = (f) => (f <= 3 ? 12 : f === 4 ? 10.5 : 9);

// The tower's outline, anticlockwise from above (+x right, +z towards you).
export const OUTLINE = (() => {
  const pts = [[-14, -9], [10, -9]];
  for (const b of [-9, -5, -1, 3]) pts.push([12, b + 2], [10, b + 4]);
  for (const a of [6, 2, -2, -6, -10, -14]) pts.push([a + 2, 9], [a, 7]);
  return pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
})();

export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export const inCore = (x, z, m = 0) => x > CORE.x0 - m && x < CORE.x1 + m && z > CORE.z0 - m && z < CORE.z1 + m;
export const inAtrium = (x, z, m = 0) => x > ATRIUM.x0 - m && x < ATRIUM.x1 + m && z > ATRIUM.z0 - m && z < ATRIUM.z1 + m;
export const rectPoly = (x0, z0, x1, z1) => [new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x0, 0, z1)];

// Column positions, so furniture can keep clear of them.
export const TOWER_COLUMNS = [];
for (const x of [-13.6, -9.5, -5, 0, 5, 9.6]) for (const z of [-8.6, -3.5, 3.5, 6.6]) if (!inCore(x, z, 0.5)) TOWER_COLUMNS.push([x, z]);
export const PODIUM_COLUMNS = (f) => {
  const out = [];
  const front = podiumFront(f) - 0.4;
  for (const x of [-19.6, -14, -9.5, -5, 0, 5, 10, 15, 19.6])
    for (const z of [-11.6, -7, -3.5, 3.5, 7, front]) {
      if (z > front) continue;
      if (inCore(x, z, 0.5) || (x > ATRIUM.x0 && x < ATRIUM.x1 && z > ATRIUM.z0 && z < ATRIUM.z1)) continue;
      if (f === 0 && Math.abs(x) < 3.2 && z > 11) continue;
      out.push([x, z]);
    }
  return out;
};
export const clearOf = (cols, x, z, d) => !cols.some(([a, b]) => Math.abs(a - x) < d && Math.abs(b - z) < d);
