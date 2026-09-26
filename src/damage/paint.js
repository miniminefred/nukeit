import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Spray paint, as decals projected onto the real surface.
//
// Each puff is a soft, speckled splat pressed onto whatever the can is pointed
// at, following the surface round corners and into holes. Puffs on the same
// piece in the same colour are merged into one mesh, which belongs to the
// piece: it falls with it and goes when it goes.

export const COLOURS = [
  { name: 'Red', hex: 0xc8161d },
  { name: 'Yellow', hex: 0xf0c020 },
  { name: 'Blue', hex: 0x1f5fd0 },
  { name: 'Green', hex: 0x2ea043 },
  { name: 'White', hex: 0xf2f2f2 },
  { name: 'Black', hex: 0x121212 },
  { name: 'Pink', hex: 0xe0529c },
];

let splat = null;
function splatTexture() {
  if (splat) return splat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Overspray: fine dots round the edge.
  for (let i = 0; i < 400; i++) {
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 34;
    g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`;
    g.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1.5, 1.5);
  }
  splat = new THREE.CanvasTexture(c);
  return splat;
}

const mats = new Map();
function paintMaterial(hex) {
  if (!mats.has(hex)) {
    mats.set(hex, new THREE.MeshStandardMaterial({
      color: hex, map: splatTexture(), transparent: true, depthWrite: false,
      roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4,
    }));
  }
  return mats.get(hex);
}

const _o = new THREE.Euler();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

// Spray one puff onto piece `p` at world `point`, surface `normal`.
export function spray(pieces, p, point, normal, hex, size = 0.22) {
  const obj = pieces.promote(p);
  obj.updateMatrixWorld(true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  _o.setFromQuaternion(q);
  _o.z = Math.random() * Math.PI * 2;
  const s = size * (0.8 + Math.random() * 0.4);
  const puffs = [];
  for (const part of p.parts) {
    if (!part.mesh) continue;
    const g = new DecalGeometry(part.mesh, point, _o, new THREE.Vector3(s, s, s));
    if (g.attributes.position.count) puffs.push(g);
    else g.dispose();
  }
  if (!puffs.length) return false;
  // Decal geometry is in world space; the piece may move, so keep it in the
  // piece's own frame.
  _inv.copy(pieces.worldMatrix(p, _m)).invert();
  for (const g of puffs) g.applyMatrix4(_inv);
  p.paint ??= new Map();
  let mesh = p.paint.get(hex);
  const fresh = puffs.length > 1 ? mergeGeometries(puffs) : puffs[0];
  if (!mesh) {
    mesh = new THREE.Mesh(fresh, paintMaterial(hex));
    mesh.renderOrder = 3;
    obj.add(mesh);
    p.paint.set(hex, mesh);
  } else {
    const merged = mergeGeometries([mesh.geometry, fresh]);
    mesh.geometry.dispose();
    mesh.geometry = merged;
  }
  return true;
}
