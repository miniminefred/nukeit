import * as THREE from 'three';
import { block, panel } from './kit.js';
import * as F from './furniture.js';

// A city block, built to be broken: a concrete frame on a grid of about six
// metres, a concrete core round the middle bay, a slab bay per grid square on
// every floor, and a curtain wall. The office block next door is one, with
// glass pane by pane and offices inside; every other block in the city is one
// too, when something reaches it (scenery/city.js), with its curtain wall in
// storey-high bands — two pieces a face a storey — so that forty storeys of it
// is a couple of thousand pieces and not twenty thousand.
//
// spec: { x0, x1, z0, z1, storeys, h, building, tint, glass, detail, offices }

export function buildBlock(P, spec) {
  const { x0, x1, z0, z1, storeys, h = 3.6 } = spec;
  const slab = 0.25;
  const nx = Math.max(2, Math.round((x1 - x0) / 6)), nz = Math.max(2, Math.round((z1 - z0) / 6));
  const XS = Array.from({ length: nx + 1 }, (_, i) => x0 + (x1 - x0) * i / nx);
  const ZS = Array.from({ length: nz + 1 }, (_, k) => z0 + (z1 - z0) * k / nz);
  // The core is the middle bay (or the one nearest it).
  const ci = Math.floor((nx - 1) / 2), ck = Math.floor((nz - 1) / 2);
  const core = { x0: XS[ci], x1: XS[ci + 1], z0: ZS[ck], z1: ZS[ck + 1], t: 0.35 };
  const onCore = (x, z) => x >= core.x0 - 0.01 && x <= core.x1 + 0.01 && z >= core.z0 - 0.01 && z <= core.z1 + 0.01;
  const g = { spec, XS, ZS, core, onCore, slab };
  for (let f = 0; f <= storeys; f++) {
    const y0 = f * h, y1 = y0 + slab;
    slabs(P, g, f, y0, y1);
    if (f === storeys) break;
    const top = (f + 1) * h;
    columns(P, g, f, y1, top);
    walls(P, g, f, f === 0 ? y1 : y0, top);
    if (spec.detail) curtain(P, g, f, y1, top);
    else bands(P, g, f, y1, top);
    if (spec.offices) spec.offices(P, f, y1);
  }
}

function opts(g, o) { return { building: g.spec.building, ...o }; }

function slabs(P, g, f, y0, y1) {
  const { XS, ZS, core, spec } = g;
  const roof = f === spec.storeys;
  for (let i = 0; i < XS.length - 1; i++)
    for (let k = 0; k < ZS.length - 1; k++) {
      const a0 = XS[i], a1 = XS[i + 1], b0 = ZS[k], b1 = ZS[k + 1];
      // The core is open inside, but for its roof.
      const inCore = Math.abs((a0 + a1) / 2 - (core.x0 + core.x1) / 2) < 0.01 && Math.abs((b0 + b1) / 2 - (core.z0 + core.z1) / 2) < 0.01;
      if (f > 0 && !roof && inCore) continue;
      block(P, roof ? 'roofing' : 'concrete', a0, y0, b0, a1, y1, b1, 'slab', opts(g, { floor: f, lateral: true }));
      if (spec.detail && f > 0 && !roof) block(P, 'carpet', a0, y1, b0, a1, y1 + 0.02, b1, 'carpet', opts(g, { floor: f, structural: false, tint: 0x5d646e }));
    }
}

function columns(P, g, f, y0, y1) {
  const { XS, ZS, onCore, spec } = g;
  const s = 0.35;
  for (const x of XS) for (const z of ZS) {
    if (onCore(x, z)) continue;
    const cx = Math.min(spec.x1 - s - 0.1, Math.max(spec.x0 + s + 0.1, x));
    const cz = Math.min(spec.z1 - s - 0.1, Math.max(spec.z0 + s + 0.1, z));
    block(P, 'concrete', cx - s, y0, cz - s, cx + s, y1, cz + s, 'column', opts(g, { floor: f, load: spec.storeys - f }));
  }
}

function walls(P, g, f, y0, y1) {
  const { x0, x1, z0, z1, t } = g.core;
  const load = g.spec.storeys - f;
  const wall = (a0, b0, a1, b1) => block(P, 'concrete', a0, y0, b0, a1, y1, b1, 'core', opts(g, { floor: f, load }));
  wall(x0, z0, x0 + t, z1);
  wall(x1 - t, z0, x1, z1);
  wall(x0 + t, z0, x1 - t, z0 + t);
  wall(x0 + t, z1 - t, x1 - t, z1);
}

const corners = (s) => [new THREE.Vector3(s.x0, 0, s.z0), new THREE.Vector3(s.x1, 0, s.z0), new THREE.Vector3(s.x1, 0, s.z1), new THREE.Vector3(s.x0, 0, s.z1)];

// Glass pane by pane, a mullion between each, a spandrel band at each slab.
// Set just inside the slab edge, which is what it stands on (the corners go
// round anticlockwise, so inside is to the left).
function curtain(P, g, f, y0, y1) {
  const { spec, slab } = g;
  const cs = corners(spec), yTop = y1 - 0.45;
  for (let e = 0; e < 4; e++) {
    const A = cs[e], B = cs[(e + 1) % 4];
    const len = A.distanceTo(B), n = Math.round(len / 2.5);
    const d = B.clone().sub(A).normalize();
    for (let i = 0; i <= n; i++) {
      const c = A.clone().lerp(B, i / n);
      panel(P, 'metal', c.clone().addScaledVector(d, -0.04), c.clone().addScaledVector(d, 0.04), y0, yTop, 0.12, 0.12, 'mullion', opts(g, { floor: f, tint: 0x8c939a }));
      if (i === n) continue;
      const p0 = c.clone().addScaledVector(d, 0.04), p1 = A.clone().lerp(B, (i + 1) / n).addScaledVector(d, -0.04);
      panel(P, 'glass', p0, p1, y0 + 0.02, yTop - 0.02, 0.03, 0.12, 'glass', opts(g, { floor: f, tint: spec.glass ?? 0x9fb2c4 }));
    }
    panel(P, 'metal', A, B, yTop, y1 + slab, 0.16, 0.1, 'spandrel', opts(g, { floor: f, tint: spec.tint ?? 0x4d545c }));
  }
}

// A storey of glass as one band a face, and the wall over it in the block's
// own colour, in the proportions of the box it replaces — 2.1 m of window,
// 1.5 m of wall — so that waking it does not change how the street looks.
function bands(P, g, f, y0, y1) {
  const { spec, slab } = g;
  const cs = corners(spec), yTop = y0 + 2.1;
  for (let e = 0; e < 4; e++) {
    const A = cs[e], B = cs[(e + 1) % 4];
    const d = B.clone().sub(A).normalize();
    panel(P, 'glass', A.clone().addScaledVector(d, 0.2), B.clone().addScaledVector(d, -0.2), y0 + 0.02, yTop - 0.02, 0.04, 0.12, 'glass', opts(g, { floor: f, tint: spec.glass ?? 0x39414d }));
    panel(P, 'plaster', A, B, yTop, y1 + slab, 0.25, 0.14, 'spandrel', opts(g, { floor: f, tint: spec.tint ?? 0xb9b2a6, structural: false }));
  }
}

// Open-plan offices, for the office block next door.
export function offices(P, f, y, x0, x1, z0, z1, building) {
  if (f === 0) return;
  const P2 = { add: (spec) => P.add({ ...spec, building }) };
  for (const z of [z0 + 2, z1 - 2]) for (const x of [x0 + 3, x0 + 8, x1 - 8, x1 - 3]) {
    const s = z < (z0 + z1) / 2;
    F.desk(P2, x, y, z, s ? 0 : Math.PI);
    F.officeChair(P2, x, y, z + (s ? 0.9 : -0.9), s ? Math.PI : 0);
  }
  if (f % 3 === 1) F.meetingTable(P2, x1 - 4.5, y, (z0 + z1) / 2, Math.PI / 2);
  if (f % 2 === 0) F.filingCabinet(P2, x0 + 1.2, y, z0 + 5.5, Math.PI / 2);
  F.plant(P2, x1 - 1.4, y, z0 + 5.5);
}
