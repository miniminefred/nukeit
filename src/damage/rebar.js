import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The steel inside reinforced concrete, for when the concrete has gone.
//
// A column is a cage: eight bars, one in each corner and one in the middle of
// each face, five centimetres in from the surface, held by square ties every
// so often. When the column bursts, the concrete falls out of the cage and the
// bars bow outward — a birdcage. When it shears or snaps, short lengths of bar
// stick out of the stubs top and bottom, bent where they buckled.
//
// Everything is built in the piece's own frame, centred on (0, 0, 0), as one
// geometry: a cage is one piece, not thirty.

const R = 0.014;          // a 28 mm bar
const COVER = 0.05;

// The eight bars of a column `sx` by `sz`, and which way is out from each.
function bars(sx, sz) {
  const hx = sx / 2 - COVER, hz = sz / 2 - COVER;
  const at = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [0, -hz], [hx, 0], [0, hz], [-hx, 0]];
  return at.map(([x, z]) => ({ x, z, out: new THREE.Vector3(x, 0, z).normalize() }));
}

function tube(points, r = R) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, Math.max(4, points.length * 2), r, 5, false);
}

// A square tie round the bars at height y.
function tie(sx, sz, y) {
  const hx = sx / 2 - COVER + R, hz = sz / 2 - COVER + R, t = 0.008;
  const side = (w, d, x, z) => new THREE.BoxGeometry(w, t * 1.5, d).translate(x, y, z);
  return [side(hx * 2, t, 0, -hz), side(hx * 2, t, 0, hz), side(t, hz * 2, -hx, 0), side(t, hz * 2, hx, 0)];
}

const clean = (gs) => mergeGeometries(gs.map((g) => {
  const n = g.index ? g : g.toNonIndexed();
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n.index ? n : indexed(n);
}), false);

function indexed(g) {
  const n = g.attributes.position.count, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// The cage of a burst column, from y0 up to y1: the bars bowed out where the
// concrete burst from between them, the ties near the ends still on.
export function birdcage(sx, sz, y0, y1) {
  const h = y1 - y0, out = [];
  for (const b of bars(sx, sz)) {
    const bow = 0.1 + Math.random() * 0.22, lean = (Math.random() - 0.5) * 0.08;
    const pts = [0, 0.2, 0.5, 0.8, 1].map((f) => {
      const k = Math.sin(f * Math.PI) * bow * (0.8 + Math.random() * 0.4);
      return new THREE.Vector3(b.x + b.out.x * k + lean * f, y0 + f * h, b.z + b.out.z * k);
    });
    out.push(tube(pts));
  }
  out.push(...tie(sx, sz, y0 + 0.12), ...tie(sx, sz, y1 - 0.12));
  return clean(out);
}

// Short bars sticking out of a stub's broken face at height y, `dir` +1 for
// up out of a stub below, -1 for down out of one still hanging from the slab
// above: straight for a bit, then bent over where they buckled.
export function bentBars(sx, sz, y, dir) {
  const out = [];
  for (const b of bars(sx, sz)) {
    if (Math.random() < 0.15) continue;                  // snapped off at the face
    const len = 0.35 + Math.random() * 0.9, straight = len * (0.25 + Math.random() * 0.35);
    const bend = (0.3 + Math.random() * 0.9) * (Math.random() < 0.8 ? 1 : -1);
    const side = b.out.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.2);
    const p0 = new THREE.Vector3(b.x, y - dir * 0.15, b.z);
    const p1 = new THREE.Vector3(b.x, y + dir * straight, b.z);
    const rest = len - straight;
    const p2 = p1.clone().addScaledVector(side, Math.sin(bend) * rest * 0.5).add(new THREE.Vector3(0, dir * Math.cos(bend) * rest * 0.5, 0));
    const p3 = p1.clone().addScaledVector(side, Math.sin(bend) * rest).add(new THREE.Vector3(0, dir * Math.cos(bend * 1.2) * rest * 0.8, 0));
    out.push(tube([p0, p1, p2, p3]));
  }
  out.push(...tie(sx, sz, y - dir * 0.08));
  return out.length ? clean(out) : null;
}

// The bars of a length of wall `len` long (along x) and `t` thick: two
// layers, every quarter metre, sticking out of its broken edge and bent.
export function wallBars(len, t, y, dir) {
  const out = [];
  const n = Math.max(2, Math.round(len / 0.25));
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
    if (Math.random() < 0.3) continue;
    const x = -len / 2 + (i + 0.5) * (len / n), z = s * (t / 2 - COVER);
    const l = 0.2 + Math.random() * 0.6, bend = (Math.random() - 0.3) * 1.4;
    const p0 = new THREE.Vector3(x, y - dir * 0.1, z), p1 = new THREE.Vector3(x, y + dir * l * 0.4, z);
    const p2 = p1.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, dir * Math.cos(bend) * l * 0.6, s * Math.sin(bend) * l * 0.6));
    out.push(tube([p0, p1, p2], 0.008));
  }
  return out.length ? clean(out) : null;
}
