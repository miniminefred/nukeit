import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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

// One shape of an assembly, positioned relative to its origin, UVs as if it
// stood at `at` in the world. A shape is one of:
//   [x0, y0, z0, x1, y1, z1]            a box, edges rounded by `round` metres
//   { cyl: [x, y, z], r, h, seg }       an upright cylinder centred on (x, y, z)
//   { cylX / cylZ: [x, y, z], r, h }    the same, lying along x or z
//   { ball: [x, y, z], s: [sx, sy, sz] } a lumpy blob — foliage, cushions
//   { cone: [x, y, z], r, h }           a cone, point up
// Any non-box shape may carry `rotY`, a turn about the vertical.
export function shape(item, at = ORIGIN, round = 0) {
  let g, cx, cy, cz;
  if (Array.isArray(item)) {
    const [x0, y0, z0, x1, y1, z1] = item;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const r = Math.min(round, w / 2.2, h / 2.2, d / 2.2);
    g = r > 0.002 ? roundedBox(w, h, d, r) : new THREE.BoxGeometry(w, h, d);
    cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; cz = (z0 + z1) / 2;
  } else if (item.cyl || item.cylX || item.cylZ) {
    const c = item.cyl ?? item.cylX ?? item.cylZ;
    g = new THREE.CylinderGeometry(item.r, item.r2 ?? item.r, item.h, item.seg ?? 14);
    if (item.cylX) g.rotateZ(Math.PI / 2);
    if (item.cylZ) g.rotateX(Math.PI / 2);
    [cx, cy, cz] = c;
  } else if (item.cone) {
    g = new THREE.ConeGeometry(item.r, item.h, item.seg ?? 10);
    [cx, cy, cz] = item.cone;
  } else if (item.ball) {
    // An indexed sphere, so no vertex merge is needed. Its seam duplicates
    // vertices, but the lumps are a function of position, so they stay joined.
    const seg = (item.detail ?? 2) >= 2 ? [14, 10] : [8, 6];
    g = new THREE.SphereGeometry(1, seg[0], seg[1]);
    const p = g.attributes.position, seed = (item.ball[0] * 7.1 + item.ball[2] * 3.3) % 10;
    const rough = item.rough ?? 0.25;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + (Math.sin(x * 5.3 + seed) * Math.cos(y * 4.1 + seed) * Math.sin(z * 6.7) + Math.sin(x * 11 + z * 9) * 0.3) * rough;
      p.setXYZ(i, x * k * item.s[0], y * k * item.s[1], z * k * item.s[2]);
    }
    g.computeVertexNormals();
    [cx, cy, cz] = item.ball;
  }
  if (!Array.isArray(item) && item.rotY) g.rotateY(item.rotY);
  g = g.index ? g : mergeVertices(g);
  if (!g.attributes.normal) g.computeVertexNormals();
  worldUVs(g, new THREE.Vector3(at.x + cx, at.y + cy, at.z + cz));
  g.translate(cx, cy, cz);
  return g;
}

// RoundedBoxGeometry takes a couple of milliseconds to build, and a floor of
// offices asks for hundreds of them in a handful of sizes — so each size is
// built once and cloned.
const _rounded = new Map();
function roundedBox(w, h, d, r) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  let g = _rounded.get(key);
  if (!g) { g = mergeVertices(new RoundedBoxGeometry(w, h, d, 2, r)); _rounded.set(key, g); }
  return g.clone();
}

// Several shapes merged into one geometry.
export function shapes(list, at = ORIGIN, round = 0) {
  const parts = list.map((s) => shape(s, at, round));
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
