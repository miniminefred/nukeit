import * as THREE from 'three';
import { surface } from '../render/textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The city round the job: a street, pavements and the blocks on either side.
//
// None of it can be broken. The job site is the only part of the world made of
// pieces; this is stage scenery, and nothing you do reaches it.

// Neighbours are solid but not breakable: a tower toppling into one slides off
// it. The collider owner is a marker, not a piece, so tools ignore it.
export const CITY = { role: 'city' };

export function buildCity(scene, physics) {
  const group = new THREE.Group();
  group.name = 'city';

  // Ground surfaces are PBR like the building, so they take the sky's light in
  // shade instead of going black. `surf` tiles every `tile` metres.
  const flat = (w, d, colour, x, z, y = 0, surf = null, tile = 2) => {
    let mat;
    if (surf) {
      const s = surface(surf);
      const rep = (t) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(w / tile, d / tile); return c; };
      mat = new THREE.MeshStandardMaterial({ map: rep(s.map), normalMap: rep(s.normalMap), roughnessMap: rep(s.roughnessMap), color: colour });
    } else mat = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Ground, the plot itself, the avenue in front and pavement between.
  flat(1200, 1200, 0x77736c, 0, 0, -0.02, 'paving', 8);
  flat(60, 44, 0xffffff, 0, 0, 0.001, 'paving', 4);        // the plot
  flat(600, 16, 0xffffff, 0, 34, 0.002, 'asphalt', 6);     // Fifth Avenue
  flat(600, 8, 0xe8e2d8, 0, 22, 0.003, 'paving', 2);       // pavement, our side
  flat(600, 8, 0xe8e2d8, 0, 46, 0.003, 'paving', 2);       // pavement, far side
  // The centre line: one mesh of dashes, not a hundred.
  const dashes = [];
  for (let x = -300; x < 300; x += 6) dashes.push(new THREE.PlaneGeometry(3, 0.18).rotateX(-Math.PI / 2).translate(x, 0.004, 34));
  group.add(new THREE.Mesh(mergeGeometries(dashes), new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.7 })));

  // City blocks, kept clear of the job site (x +/-32, z +/-24) so nothing here
  // stands in anything you can break.
  const windows = windowTexture();
  const rand = mulberry(7);
  const tower = (x, z, w, d, h, tint) => {
    const tex = windows.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3.6)));
    const mat = new THREE.MeshStandardMaterial({ color: tint, map: tex, roughness: 0.85 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (physics) {
      const c = physics.world.createCollider(
        physics.R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, h / 2, z).setFriction(0.35),
        physics.fixed);
      physics.owner.set(c.handle, CITY);
    }
  };

  const tints = [0xb9b2a6, 0x9ea3a8, 0xc7b89c, 0x8f9499, 0xa89586];
  // Along our side of the avenue, left and right of the plot.
  for (const side of [-1, 1]) {
    let x = side * 36;
    while (Math.abs(x) < 300) {
      const w = 14 + rand() * 18;
      const h = 30 + rand() * 120;
      tower(x + side * w / 2, -4, w, 36, h, tints[(rand() * tints.length) | 0]);
      x += side * (w + 2);
    }
  }
  // Behind the plot.
  for (let x = -280; x < 280;) {
    const w = 16 + rand() * 20;
    tower(x + w / 2, -48, w, 40, 40 + rand() * 140, tints[(rand() * tints.length) | 0]);
    x += w + 3;
  }
  // Across the avenue.
  for (let x = -280; x < 280;) {
    const w = 14 + rand() * 20;
    tower(x + w / 2, 70, w, 40, 25 + rand() * 110, tints[(rand() * tints.length) | 0]);
    x += w + 2;
  }

  scene.add(group);
  return group;
}

// One storey-and-bay of facade, repeated across every block.
function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#39414d';
  g.fillRect(8, 10, 48, 38);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(8, 10, 24, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
