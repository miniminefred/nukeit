import * as THREE from 'three';
import { makeCity } from './city.js';

// Wall Street, round Big Boy Bank: a narrow one-way street between old stone
// and brick buildings, most of them with a new glass top put on them since —
// as the bank has — and across from the bank the stock exchange behind its
// temple front of columns, flags over it. Nothing near the bank is as tall as
// its tower; the big towers stand further off.
//
//     z  -62 .. -22   the row behind the bank
//     z  -19 ..  17   the bank's plot (x ±26), blocks either side of it
//     z   19 ..  23   our pavement      (the bank's steps run out to 19.4)
//     z   23 ..  33   Wall Street: a parking lane at 24.5, traffic at 27.5 and 30.5
//     z   33 ..  37   the far pavement
//     z   39 ..  77   across the street: the exchange in front of the bank, the row

const TINTS = [0xc9bfae, 0xb8ad9a, 0xa89a88, 0x9a8e80, 0xc2b8a8];
const EXCHANGE = { x: 0, z: 56, w: 40, d: 34, h: 24 };

export const buildWallStreet = (scene, physics) => makeCity(scene, physics, wallStreet);
wallStreet.seed = 31;

function wallStreet({ flat, tower, rand, group, centreLine, solid }) {
  flat(52, 38, 0xffffff, 0, 0, 0.001, 'paving', 4);           // the bank's plot
  flat(600, 10, 0xffffff, 0, 28, 0.002, 'asphalt', 5);         // Wall Street
  flat(600, 4, 0xe2dcd0, 0, 21, 0.003, 'paving', 2);           // our pavement
  flat(600, 4, 0xe2dcd0, 0, 35, 0.003, 'paving', 2);           // the far pavement
  centreLine(29);
  // Below the bank's tower near it; the city climbs further off.
  const below = (x, z, h) => Math.min(h, Math.max(24, 48 + Math.max(0, Math.hypot(x, z) - 40) * 1.2));
  // An old building, often with a new top: the old part stone or brick, the
  // top glass, set back from its edges.
  // `office`: a real ground floor at the front, a locked office in it
  // (building/street.js puts a stash of cash in it).
  const old = (x, z, w, d, facing, office = false) => {
    const hOld = 22 + rand() * 30;
    const total = below(x, z, hOld + (rand() < 0.65 ? 18 + rand() * 70 : 0));
    const top = total - hOld > 8 ? { h: total - hOld, inset: 1.5 + rand() * 3 } : null;
    tower(x, z, w, d, top ? hOld : total, TINTS[(rand() * TINTS.length) | 0], facing, office, top);
  };
  // Our side, either side of the bank's plot, with narrow streets between.
  for (const side of [-1, 1]) {
    let x = side * 29;
    while (Math.abs(x) < 300) {
      const w = 12 + rand() * 16;
      old(x + side * w / 2, -1, w, 36, 1, Math.abs(x) < 30);
      x += side * (w + (rand() < 0.3 ? 8 : 1.5));
    }
  }
  // Behind.
  for (let x = -290; x < 290;) {
    const w = 14 + rand() * 18;
    old(x + w / 2, -42, w, 40, 0);
    x += w + (rand() < 0.3 ? 8 : 1.5);
  }
  // Across the street: the exchange in front of the bank, then the row.
  for (const side of [-1, 1]) {
    let x = side * (EXCHANGE.w / 2 + 6);
    while (Math.abs(x) < 300) {
      const w = 12 + rand() * 18;
      old(x + side * w / 2, 58, w, 38, -1, side < 0 && Math.abs(x) < EXCHANGE.w / 2 + 7);
      x += side * (w + (rand() < 0.3 ? 8 : 1.5));
    }
  }
  exchange(tower, group, solid);
}

// The stock exchange: a stone block, and in front of it a temple front —
// steps, six columns, the entablature, the pediment — and three flags.
function exchange(tower, group, solid) {
  const { x, z, w, d, h } = EXCHANGE;
  tower(x, z, w, d, h, 0xd6cdbc, 0, false, null);        // no shopfront: the temple front is its face
  const front = z - d / 2;
  const stone = new THREE.MeshStandardMaterial({ color: 0xded6c6, roughness: 0.8 });
  const add = (geo, px, py, pz) => { const m = new THREE.Mesh(geo, stone); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  // The steps, out to the far pavement's back edge.
  add(new THREE.BoxGeometry(w - 4, 1.2, 3.4), x, 0.6, front - 1.7);
  solid(x, 0.6, front - 1.7, (w - 4) / 2, 0.6, 1.7);
  const top = h - 4;
  for (let i = 0; i < 6; i++) {
    const cx = x - (w - 10) / 2 + i * ((w - 10) / 5);
    add(new THREE.CylinderGeometry(0.95, 1.1, top - 1.2, 20), cx, 1.2 + (top - 1.2) / 2, front - 1.7);
    solid(cx, 1.2 + (top - 1.2) / 2, front - 1.7, 1.0, (top - 1.2) / 2, 1.0);
  }
  add(new THREE.BoxGeometry(w - 4, 2.4, 3.6), x, top + 1.2, front - 1.7);
  // The pediment: a triangle, as a three-sided prism.
  const tri = new THREE.Shape([new THREE.Vector2(-(w - 4) / 2, 0), new THREE.Vector2((w - 4) / 2, 0), new THREE.Vector2(0, 4.2)]);
  const ped = new THREE.ExtrudeGeometry(tri, { depth: 3.2, bevelEnabled: false });
  add(ped, x, top + 2.4, front - 3.3);
  // Flags over the entablature.
  const flagMat = new THREE.MeshStandardMaterial({ color: 0x2a3a6a, roughness: 0.9, side: THREE.DoubleSide });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.9, side: THREE.DoubleSide });
  const pole = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.6, roughness: 0.3 });
  for (const fx of [-10, 0, 10]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 8), pole);
    p.position.set(x + fx, h + 3.5, front + 0.5);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), fx === 0 ? flagMat : stripe);
    f.position.set(x + fx + 1.65, h + 6, front + 0.5);
    group.add(p, f);
  }
}
