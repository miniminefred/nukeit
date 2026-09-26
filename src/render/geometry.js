import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Geometry with UVs in world metres.
//
// Every face's UVs are the world coordinates of its vertices along the two
// axes that lie in that face, so a texture tiles at the same scale on a desk as
// on a slab, and runs on unbroken from one slab bay into the next. Materials
// set how many metres a tile covers.

// A box of size (w, h, d) centred on the origin, textured as if it stood at
// world position `at`.
export function box(w, h, d, at = ORIGIN) {
  const g = new THREE.BoxGeometry(w, h, d);
  worldUVs(g, at);
  return g;
}

// A box whose corner rather than centre is given, in world space — the shape
// a builder usually has in hand. Returns the geometry centred on its own
// middle, and the middle.
export function boxBetween(x0, y0, z0, x1, y1, z1) {
  const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return { geometry: box(x1 - x0, y1 - y0, z1 - z0, c), centre: c };
}

// Rewrite a geometry's UVs as world metres, the geometry being placed at `at`.
export function worldUVs(g, at = ORIGIN) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + at.x, y = p.getY(i) + at.y, z = p.getZ(i) + at.z;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else if (ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Several boxes, given as [x0, y0, z0, x1, y1, z1] relative to `centre`,
// merged into one geometry — a desk's top and legs, a chair's parts.
export function boxes(list, centre = ORIGIN) {
  const parts = list.map(([x0, y0, z0, x1, y1, z1]) => {
    const g = box(x1 - x0, y1 - y0, z1 - z0, new THREE.Vector3(centre.x + (x0 + x1) / 2, centre.y + (y0 + y1) / 2, centre.z + (z0 + z1) / 2));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  });
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

// An upright cylinder, textured around.
export function cylinder(r, h, seg = 16, at = ORIGIN) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * h + at.y);
  return g;
}

const ORIGIN = new THREE.Vector3();
