import * as THREE from 'three';
import { box, boxes, worldUVs } from '../render/geometry.js';

// Builders for pieces, in metres and world coordinates.
//
// Each returns the piece it added. The piece's frame is centred on the shape,
// so a falling slab turns about its own middle.

const UP = new THREE.Vector3(0, 1, 0);

// An axis-aligned box of one material.
export function block(pieces, kind, x0, y0, z0, x1, y1, z1, role, opts = {}) {
  const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return pieces.add({
    parts: [{ kind, geometry: box(x1 - x0, y1 - y0, z1 - z0, c), tint: opts.tint }],
    pos: c, role, ...opts,
  });
}

// A thin panel standing on the line P -> Q (in the xz plane), from y0 to y1,
// `thick` deep, pushed `offset` metres to the left of the line (seen from P
// looking at Q). Used for glass, mullions and spandrels on any facade angle.
export function panel(pieces, kind, P, Q, y0, y1, thick, offset, role, opts = {}) {
  const dx = Q.x - P.x, dz = Q.z - P.z;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(-dz, dx);
  const nx = -dz / len, nz = dx / len;          // left of the line
  const c = new THREE.Vector3((P.x + Q.x) / 2 + nx * offset, (y0 + y1) / 2, (P.z + Q.z) / 2 + nz * offset);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, ang);
  const g = box(len, y1 - y0, thick, new THREE.Vector3(c.x, c.y, 0));
  return pieces.add({ parts: [{ kind, geometry: g, tint: opts.tint }], pos: c, quat: q, role, ...opts });
}

// A flat plate over a polygon in the xz plane (anticlockwise seen from above),
// from y0 to y1. For the slab teeth along the sawtooth faces.
export function plate(pieces, kind, poly, y0, y1, role, opts = {}) {
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p.x; cz += p.z; }
  cx /= poly.length; cz /= poly.length;
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x - cx, -(p.z - cz))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  // Extrude runs along +z; stand it up so the plate's thickness is along y.
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(y1 - y0) / 2, 0);
  g.computeVertexNormals();
  indexed(g);
  const c = new THREE.Vector3(cx, (y0 + y1) / 2, cz);
  worldUVs(g, c);
  return pieces.add({ parts: [{ kind, geometry: g, tint: opts.tint }], pos: c, role, ...opts });
}

// Something made of several boxes and several materials — furniture.
// `parts` is [{ kind, boxes: [[x0, y0, z0, x1, y1, z1], …], tint }] relative to
// the piece's origin at (x, y, z), rotated `yaw` about the vertical.
export function assembly(pieces, x, y, z, yaw, parts, role, opts = {}) {
  const c = new THREE.Vector3(x, y, z);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  // Recentre on the assembly's bounding box so it tumbles about its middle.
  const all = parts.flatMap((p) => p.boxes);
  const mid = new THREE.Vector3(
    (Math.min(...all.map((b) => b[0])) + Math.max(...all.map((b) => b[3]))) / 2,
    (Math.min(...all.map((b) => b[1])) + Math.max(...all.map((b) => b[4]))) / 2,
    (Math.min(...all.map((b) => b[2])) + Math.max(...all.map((b) => b[5]))) / 2,
  );
  const shift = (b) => [b[0] - mid.x, b[1] - mid.y, b[2] - mid.z, b[3] - mid.x, b[4] - mid.y, b[5] - mid.z];
  const pos = mid.clone().applyQuaternion(q).add(c);
  return pieces.add({
    parts: parts.map((p) => ({ kind: p.kind, geometry: boxes(p.boxes.map(shift), pos), tint: p.tint })),
    pos, quat: q, role,
    colliders: opts.colliders ? opts.colliders.map(shift) : null,
    ...opts,
  });
}

// BatchedMesh wants every geometry in a batch indexed alike.
export function indexed(g) {
  if (g.index) return g;
  const n = g.attributes.position.count;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
