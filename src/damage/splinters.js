import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { insideMaterial } from '../render/materials.js';

// Splinters standing out of broken timber.
//
// Around the rim of a hole in wood, a ring of thin, tapering slivers of raw
// timber. On the side the blow came from they point back into the hole — the
// fibres are driven in. On the far side, if the blow went through, they burst
// outward in the direction it was travelling, longer and more of them, which is
// what the back of a smashed door actually looks like.
//
// They belong to the piece: a child mesh of it, so they fall with it.

// One sliver: a flattened four-sided spike along +z, base at the origin.
function sliver(len, wid, thick) {
  const g = new THREE.ConeGeometry(1, 1, 4, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.5);
  g.scale(wid, thick, len);
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const _z = new THREE.Vector3(0, 0, 1);

// `point` and `normal` are in the piece's frame. `through` is the thickness of
// the part, or 0 if the blow did not go through.
export function addSplinters(pieces, piece, point, normal, radius, through) {
  const obj = pieces.promote(piece);
  const out = [];
  // Two directions in the face plane.
  const t1 = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(normal, t1);
  const ring = (centre, count, dirIn, lenMin, lenMax) => {
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2 + Math.random() * 0.5;
      const rr = radius * (0.7 + Math.random() * 0.35);
      const radial = t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
      const base = centre.clone().addScaledVector(radial, rr);
      // Mostly along the face, bent in or out of it.
      const d = radial.clone().multiplyScalar(dirIn ? -0.55 : 0.5).addScaledVector(normal, dirIn ? -0.45 : -0.85)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.35)).normalize();
      const len = lenMin + Math.random() * (lenMax - lenMin);
      const g = sliver(len, 0.006 + Math.random() * 0.014, 0.002 + Math.random() * 0.004);
      g.applyMatrix4(_m.compose(base, _q.setFromUnitVectors(_z, d), _s));
      out.push(g);
    }
  };
  ring(point, 9 + ((Math.random() * 5) | 0), true, 0.03, 0.09);
  if (through > 0) {
    const back = point.clone().addScaledVector(normal, -through);
    ring(back, 14 + ((Math.random() * 8) | 0), false, 0.05, 0.2);
  }
  const fresh = mergeGeometries(out.map((g) => g.toNonIndexed()), false);
  for (const g of out) g.dispose();
  if (piece.splinters) {
    const merged = mergeGeometries([piece.splinters.geometry, fresh], false);
    piece.splinters.geometry.dispose();
    fresh.dispose();
    piece.splinters.geometry = merged;
  } else {
    piece.splinters = new THREE.Mesh(fresh, insideMaterial('wood'));
    piece.splinters.castShadow = true;
    obj.add(piece.splinters);
  }
}
