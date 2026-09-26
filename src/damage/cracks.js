import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Cracks on things that are breaking.
//
// Every blow draws a crack pattern onto the surface where it landed — dark,
// jagged lines running out from the point of impact and branching as they go.
// The weaker the piece already is, the larger and more branched the crack, so
// something close to giving way is covered in them and looks it.
//
// Four crack patterns are painted once into a 2x2 atlas; each decal takes one
// quarter. Decals on a piece are merged into one mesh that belongs to it, so
// they fall with it.

const ATLAS = 1024, CELL = ATLAS / 2;
let atlas = null;

function paintCrack(g, ox, oy, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cx = ox + CELL / 2, cy = oy + CELL / 2;
  const branch = (x, y, a, len, width, depth) => {
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, y);
    let d = 0;
    while (d < len) {
      const step = 5 + rnd() * 12;
      a += (rnd() - 0.5) * 0.9;
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      d += step;
      g.lineTo(x, y);
      if (depth < 3 && rnd() < 0.09) {
        g.stroke();
        branch(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.7), (len - d) * (0.4 + rnd() * 0.4), width * 0.65, depth + 1);
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
      }
    }
    g.stroke();
  };
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const rays = 5 + ((rnd() * 5) | 0);
  for (let r = 0; r < rays; r++) branch(cx, cy, (r / rays) * Math.PI * 2 + rnd() * 0.8, CELL * (0.25 + rnd() * 0.22), 3.2, 0);
  // The crushed centre.
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, 26);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.fill();
}

function crackAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) paintCrack(g, (i % 2) * CELL, (i >> 1) * CELL, 1234 + i * 977);
  atlas = new THREE.CanvasTexture(c);
  atlas.anisotropy = 4;
  return atlas;
}

let material = null;
function crackMaterial() {
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: 0x14110e, roughness: 1, alphaMap: crackAtlas(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
  }
  return material;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1);

// Keep only the triangles that face the way the blow came from. A decal box
// also catches the sides of a column, and a crack drawn there seen edge-on
// reads as black lines hanging in the air.
function facing(g, n) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  const keep = [];
  for (let t = 0; t < pos.count; t += 3) {
    const nx = nor.getX(t) + nor.getX(t + 1) + nor.getX(t + 2);
    const ny = nor.getY(t) + nor.getY(t + 1) + nor.getY(t + 2);
    const nz = nor.getZ(t) + nor.getZ(t + 1) + nor.getZ(t + 2);
    const l = Math.hypot(nx, ny, nz) || 1;
    if ((nx * n.x + ny * n.y + nz * n.z) / l > 0.55) keep.push(t);
  }
  if (!keep.length) { g.dispose(); return null; }
  if (keep.length * 3 === pos.count) return g;
  const P = new Float32Array(keep.length * 9), N = new Float32Array(keep.length * 9), U = new Float32Array(keep.length * 6);
  keep.forEach((t, k) => {
    for (let v = 0; v < 3; v++) {
      const i = t + v, o = k * 3 + v;
      P.set([pos.getX(i), pos.getY(i), pos.getZ(i)], o * 3);
      N.set([nor.getX(i), nor.getY(i), nor.getZ(i)], o * 3);
      U.set([uv.getX(i), uv.getY(i)], o * 2);
    }
  });
  g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  return out;
}

// Draw a crack on piece `p` at world `point`, surface `normal`, `size` metres across.
export function crack(pieces, p, point, normal, size) {
  const obj = pieces.promote(p);
  obj.updateMatrixWorld(true);
  _q.setFromUnitVectors(Z, normal);
  _e.setFromQuaternion(_q);
  _e.z = Math.random() * Math.PI * 2;
  const cell = (Math.random() * 4) | 0;
  const out = [];
  for (const part of p.parts) {
    if (!part.mesh) continue;
    let g;
    try { g = new DecalGeometry(part.mesh, point, _e, new THREE.Vector3(size, size, 0.35)); }
    catch { continue; }
    g = facing(g, normal);
    if (!g) continue;
    // Into this decal's quarter of the atlas.
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cell % 2) * 0.5 + uv.getX(i) * 0.5, (cell >> 1) * 0.5 + uv.getY(i) * 0.5);
    out.push(g);
  }
  if (!out.length) return;
  _inv.copy(pieces.worldMatrix(p, _m)).invert();
  for (const g of out) g.applyMatrix4(_inv);
  const fresh = out.length > 1 ? mergeGeometries(out) : out[0];
  if (p.cracks) {
    if (p.cracks.geometry.attributes.position.count > 40000) { fresh.dispose(); return; }
    const merged = mergeGeometries([p.cracks.geometry, fresh]);
    p.cracks.geometry.dispose();
    fresh.dispose();
    p.cracks.geometry = merged;
  } else {
    p.cracks = new THREE.Mesh(fresh, crackMaterial());
    p.cracks.renderOrder = 3;
    obj.add(p.cracks);
  }
}
