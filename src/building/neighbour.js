import * as THREE from 'three';
import { block, panel } from './kit.js';
import * as F from './furniture.js';

// The office block next door, behind Trump Tower across a four-metre service
// yard: twelve storeys of 3.6 m on a 26 by 24 metre plan, concrete frame and
// core, blue-grey glass curtain wall, open-plan offices. It is built of pieces
// like the tower, so it breaks like the tower — and it is what the tower
// falls into when its north side goes.
//
//          x -13                   13
//   z -40   +-----------------------+
//           |   .   .   .   .   .   |   columns on a 6.5 by 6 m grid
//           |   .  +--core--+   .   |
//           |   .  |        |   .   |
//           |   .  +--------+   .   |
//   z -16   +-----------------------+
//                  service yard
//   z -12   ===== Trump Tower's podium; its tower's north face at z = -9 =====

export const NEIGHBOUR = { x0: -13, x1: 13, z0: -40, z1: -16, storeys: 12, h: 3.6, slab: 0.25 };
const CORE = { x0: -3, x1: 3, z0: -31, z1: -25, t: 0.35 };
const XS = [-13, -6.5, 0, 6.5, 13];
const ZS = [-40, -34, -28, -22, -16];

const inCore = (x, z, m = 0) => x > CORE.x0 - m && x < CORE.x1 + m && z > CORE.z0 - m && z < CORE.z1 + m;

export function buildNeighbour(P) {
  const { storeys, h, slab } = NEIGHBOUR;
  for (let f = 0; f <= storeys; f++) {
    const y0 = f * h, y1 = y0 + slab;
    slabs(P, f, y0, y1);
    if (f === storeys) break;
    const top = (f + 1) * h;
    columns(P, f, y1, top);
    core(P, f, f === 0 ? y1 : y0, top);
    facade(P, f, y1, top);
    offices(P, f, y1);
  }
}

function slabs(P, f, y0, y1) {
  for (let i = 0; i < XS.length - 1; i++)
    for (let k = 0; k < ZS.length - 1; k++) {
      const x0 = XS[i], x1 = XS[i + 1], z0 = ZS[k], z1 = ZS[k + 1];
      // The core is open inside, but for its roof.
      if (f > 0 && f < NEIGHBOUR.storeys && inCore((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      block(P, f === NEIGHBOUR.storeys ? 'roofing' : 'concrete', x0, y0, z0, x1, y1, z1, 'slab', { floor: f, lateral: true });
      if (f > 0 && f < NEIGHBOUR.storeys) block(P, 'carpet', x0, y1, z0, x1, y1 + 0.02, z1, 'carpet', { floor: f, structural: false, tint: 0x5d646e });
    }
}

function columns(P, f, y0, y1) {
  const s = 0.35;
  for (const x of XS) for (const z of ZS) {
    if (inCore(x, z, 0.4)) continue;
    const cx = Math.min(NEIGHBOUR.x1 - s - 0.1, Math.max(NEIGHBOUR.x0 + s + 0.1, x));
    const cz = Math.min(NEIGHBOUR.z1 - s - 0.1, Math.max(NEIGHBOUR.z0 + s + 0.1, z));
    block(P, 'concrete', cx - s, y0, cz - s, cx + s, y1, cz + s, 'column', { floor: f, load: NEIGHBOUR.storeys - f });
  }
}

function core(P, f, y0, y1) {
  const { x0, x1, z0, z1, t } = CORE;
  const load = NEIGHBOUR.storeys - f;
  const wall = (a0, b0, a1, b1) => block(P, 'concrete', a0, y0, b0, a1, y1, b1, 'core', { floor: f, load });
  wall(x0, z0, x0 + t, z1);
  wall(x1 - t, z0, x1, z1);
  wall(x0 + t, z0, x1 - t, z0 + t);
  wall(x0 + t, z1 - t, x1 - t, z1);
}

function facade(P, f, y0, y1) {
  const { x0, x1, z0, z1 } = NEIGHBOUR;
  const v = (x, z) => new THREE.Vector3(x, 0, z);
  const corners = [v(x0, z0), v(x1, z0), v(x1, z1), v(x0, z1)];
  const yTop = y1 - 0.45;
  // Set just inside the slab edge, which is what it stands on (the corners go
  // round anticlockwise, so inside is to the left).
  for (let e = 0; e < 4; e++) {
    const A = corners[e], B = corners[(e + 1) % 4];
    const len = A.distanceTo(B), n = Math.round(len / 2.5);
    const d = B.clone().sub(A).normalize();
    for (let i = 0; i <= n; i++) {
      const c = A.clone().lerp(B, i / n);
      panel(P, 'metal', c.clone().addScaledVector(d, -0.04), c.clone().addScaledVector(d, 0.04), y0, yTop, 0.12, 0.12, 'mullion', { floor: f, tint: 0x8c939a });
      if (i === n) continue;
      const p0 = c.clone().addScaledVector(d, 0.04), p1 = A.clone().lerp(B, (i + 1) / n).addScaledVector(d, -0.04);
      panel(P, 'glass', p0, p1, y0 + 0.02, yTop - 0.02, 0.03, 0.12, 'glass', { floor: f, tint: 0x9fb2c4 });
    }
    // The band at each slab edge.
    panel(P, 'metal', A, B, yTop, y1 + NEIGHBOUR.slab, 0.16, 0.1, 'spandrel', { floor: f, tint: 0x4d545c });
  }
}

// Open-plan offices: rows of desks round the core, a meeting table.
function offices(P, f, y) {
  if (f === 0) {
    F.sofa(P, -8, y, -17.4, Math.PI, 0x3a4450);
    F.plant(P, 8, y, -17.4, true);
    F.plant(P, -11.4, y, -17.4, true);
    return;
  }
  for (const z of [-38, -18]) for (const x of [-10, -5, 5, 10]) {
    F.desk(P, x, y, z, z < -28 ? 0 : Math.PI);
    F.officeChair(P, x, y, z + (z < -28 ? 0.9 : -0.9), z < -28 ? Math.PI : 0);
  }
  if (f % 3 === 1) F.meetingTable(P, 8.5, y, -28, Math.PI / 2);
  if (f % 2 === 0) F.filingCabinet(P, -11.8, y, -34.5, Math.PI / 2);
  F.plant(P, 11.6, y, -34.5);
}
