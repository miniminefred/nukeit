import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

// Cutting real holes in real geometry.
//
// A blow takes a jagged blob out of whatever it lands on, by constructive solid
// geometry: the piece minus the blob. The faces the cut exposes take the
// material's *inside* surface — split timber in a desk, aggregate in concrete,
// white gypsum in a partition — which is most of why a hole reads as broken
// rather than as drawn on.

const evaluator = new Evaluator();
evaluator.attributes = ['position', 'normal', 'uv'];
evaluator.useGroups = true;
evaluator.consolidateGroups = true;

// A lumpy closed blob, unit size. Noise is a function of the vertex's position,
// so the vertices an icosahedron duplicates along its seams move together and
// the blob stays watertight.
export function blob(seed = Math.random() * 1000, rough = 0.35, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 4.1 + seed) * Math.cos(y * 3.7 + seed * 1.3) * Math.sin(z * 5.3 + seed * 0.7)
            + Math.sin(x * 9.7 + y * 8.1 + seed * 2.1) * 0.35;
    const k = 1 + n * rough;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// UVs for an arbitrary shape: project each face onto the plane it most nearly
// faces, in metres, like render/geometry.js does for boxes.
export function projectUVs(g, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) * scale, y = p.getY(i) * scale, z = p.getZ(i) * scale;
    if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else if (ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const _q = new THREE.Quaternion();
const _z = new THREE.Vector3(0, 0, 1);

// Take a blob out of `geometry` (in its own frame). The blob is centred at
// `centre`, `radius` across and stretched to `depth` along `axis`.
// `materials` are the part's current materials; `inside` covers the cut.
// Returns { geometry, materials }.
export function subtract(geometry, materials, inside, centre, axis, radius, depth) {
  const a = new Brush(geometry, materials);
  a.updateMatrixWorld();
  const cut = blob();
  projectUVs(cut, 1);
  const b = new Brush(cut, inside);
  b.position.copy(centre);
  b.quaternion.copy(_q.setFromUnitVectors(_z, axis));
  b.scale.set(radius, radius, depth);
  b.updateMatrixWorld();
  const out = evaluator.evaluate(a, b, SUBTRACTION);
  cut.dispose();
  return { geometry: out.geometry, materials: Array.isArray(out.material) ? out.material : [out.material] };
}

// Break a lump off: returns both the piece that comes away (the part of
// `geometry` inside a jagged blob at `centre`) and what is left behind.
// { chunk: { geometry, materials }, rest: { geometry, materials } }
export function chunkOff(geometry, materials, inside, centre, axis, radius, depth) {
  const a = new Brush(geometry, materials);
  a.updateMatrixWorld();
  const cut = blob(Math.random() * 1000, 0.28, 2);
  projectUVs(cut, 1);
  const b = new Brush(cut, inside);
  b.position.copy(centre);
  b.quaternion.copy(_q.setFromUnitVectors(_z, axis));
  b.scale.set(radius, radius * (0.8 + Math.random() * 0.5), depth);
  b.updateMatrixWorld();
  const piece = evaluator.evaluate(a, b, INTERSECTION);
  const rest = evaluator.evaluate(a, b, SUBTRACTION);
  cut.dispose();
  const pack = (r) => ({ geometry: r.geometry, materials: Array.isArray(r.material) ? r.material : [r.material] });
  return { chunk: pack(piece), rest: pack(rest) };
}

// Split `geometry` in two along a rough plane through `point` with normal
// `normal`. Returns [{ geometry, materials }, { geometry, materials }], either
// of which may be empty.
export function split(geometry, materials, inside, point, normal, size) {
  const a = new Brush(geometry, materials);
  a.updateMatrixWorld();
  // Half of space, as a big lumpy slab whose face runs through `point`.
  const g = new THREE.BoxGeometry(1, 1, 1, 12, 12, 1);
  const p = g.attributes.position;
  const seed = Math.random() * 100;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < 0) continue;       // only the cutting face is rough
    const x = p.getX(i), y = p.getY(i);
    // A function of position alone, so duplicated seam vertices move together.
    // Three scales of roughness: a broken face undulates, then is jagged, then gritty.
    const h = Math.sin(x * 9 + y * 5 + seed) * 0.55 + Math.sin(x * 31.7 - y * 23.3 + seed * 2) * 0.3 + Math.sin(x * 83 + y * 71 + seed * 3) * 0.15;
    p.setZ(i, 0.5 + h * 0.1);
  }
  g.computeVertexNormals();
  projectUVs(g, size * 3);
  const b = new Brush(g, inside);
  const s = size * 3;
  b.scale.set(s, s, s);
  b.quaternion.copy(_q.setFromUnitVectors(_z, normal));
  b.position.copy(point).addScaledVector(normal, -s / 2);
  b.updateMatrixWorld();
  const one = evaluator.evaluate(a, b, INTERSECTION);
  const two = evaluator.evaluate(a, b, SUBTRACTION);
  g.dispose();
  const pack = (r) => ({ geometry: r.geometry, materials: Array.isArray(r.material) ? r.material : [r.material] });
  return [pack(one), pack(two)];
}
