import * as THREE from 'three';
import { surface } from '../render/textures.js';
import { G_CITY } from '../physics.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The city round the job: a street, pavements and the blocks on either side.
//
// Every block can be broken. Until something reaches one it is a single box —
// one mesh, one collider — and the moment something could (a blast near it, a
// tower falling its way, a sledge on its wall) it is swapped for a real
// building of the same size made of pieces (building/block.js, world.js
// `wakeBlock`). That is how a whole city can be breakable and still cost next
// to nothing while it stands. `blocks` lists them.

// A block's collider is owned by the block's record (role 'city'), not a
// piece: until it is woken, rubble lies on it as on the street.
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
  // stands in anything you can break. Each in one of three dresses — stone with
  // punched windows, a glass curtain wall, brick — some windows lit and some
  // with their blinds down, a cornice on top, and along the avenue shops at
  // street level under awnings.
  const styles = facadeStyles();
  const rand = mulberry(7);
  const blocks = [];
  const cornices = boxes(group, new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.85 }), 200, true);
  const awnings = boxes(group, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 120, true);
  const fronts = [0, 1, 2, 3].map((k) => boxes(group, new THREE.MeshStandardMaterial({ map: shopfronts(mulberry(11 + k)), roughness: 0.5 }), 60, false));
  const tower = (x, z, w, d, h, tint, facing = 0) => {
    const st = styles[(rand() * styles.length) | 0];
    const tex = st.map.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 3)) / 4, Math.max(1, Math.round(h / 3.6)) / 4);
    tex.offset.set(rand(), rand());
    const mat = new THREE.MeshStandardMaterial({ color: st.glass ? 0xffffff : tint, map: tex, roughness: st.rough, metalness: st.metal });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    // Its cornice, awning and shopfront are instances in the city's shared
    // meshes (one draw call each for the whole city), hidden when it wakes.
    const extras = [];
    extras.push([cornices, cornices.add(x, h - 0.55, z, w + 0.8, 1.1, d + 0.8)]);
    if (facing) {
      extras.push([fronts[(rand() * fronts.length) | 0], null]);
      const f = extras[1][0];
      extras[1][1] = f.add(x, 2.1, z + facing * (d / 2 + 0.15), w - 0.4, 4.2, 0.3);
      extras.push([awnings, awnings.add(x, 3.6, z + facing * (d / 2 + 0.9), w - 1, 0.08, 1.6, facing * 0.25, AWNINGS[(rand() * AWNINGS.length) | 0])]);
    }
    const block = { role: 'city', id: blocks.length, x, z, w, d, h, tint, mesh: m, collider: null, built: false };
    // Shown as a box, or not (woken into a building of pieces: world.js).
    block.show = (on) => { m.visible = on; for (const [set, i] of extras) set.show(i, on); };
    block.solid = () => {
      if (!physics || block.collider) return;
      const c = physics.world.createCollider(
        physics.R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, h / 2, z).setFriction(0.35).setCollisionGroups(G_CITY),
        physics.fixed);
      physics.owner.set(c.handle, block);
      block.collider = c;
    };
    block.solid();
    blocks.push(block);
  };

  const tints = [0xb9b2a6, 0x9ea3a8, 0xc7b89c, 0x8f9499, 0xa89586];
  // Along our side of the avenue, left and right of the plot.
  for (const side of [-1, 1]) {
    let x = side * 36;
    while (Math.abs(x) < 300) {
      const w = 14 + rand() * 18;
      const h = 30 + rand() * 120;
      tower(x + side * w / 2, -4, w, 36, h, tints[(rand() * tints.length) | 0], 1);
      x += side * (w + 2);
    }
  }
  // Behind the plot. Straight behind it, first, is the office block next door,
  // which is part of the job (building/neighbour.js); the row stands back to
  // leave its plot.
  for (let x = -280; x < 280;) {
    const w = 16 + rand() * 20;
    const z = x + w > -17 && x < 17 ? -66 : -48;
    tower(x + w / 2, z, w, 40, 40 + rand() * 140, tints[(rand() * tints.length) | 0]);
    x += w + 3;
  }
  // Across the avenue.
  for (let x = -280; x < 280;) {
    const w = 14 + rand() * 20;
    tower(x + w / 2, 70, w, 40, 25 + rand() * 110, tints[(rand() * tints.length) | 0], -1);
    x += w + 2;
  }

  scene.add(group);
  return { group, blocks };
}

const AWNINGS = [0x1f4d3a, 0x7a1e22, 0x22344f, 0x3a3a3a, 0x6b4a1e];

// Four bays by four storeys of facade, in each of three dresses, repeated up
// and across every block (offset per block, so no two line up). Some windows
// are lit, some have their blinds half down.
function facadeStyles() {
  const cell = 128, N = 4;
  const make = (paint) => {
    const c = document.createElement('canvas');
    c.width = c.height = cell * N;
    const g = c.getContext('2d');
    const r = mulberry(31);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) paint(g, i * cell, j * cell, cell, r);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };
  const pane = (g, x, y, w, h, r) => {
    const lit = r() < 0.18, blind = r() < 0.3;
    const grad = g.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, lit ? '#e8c98a' : '#4a5a6c');
    grad.addColorStop(1, lit ? '#b8925a' : '#252c36');
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
    if (blind) { g.fillStyle = 'rgba(225,220,205,0.9)'; g.fillRect(x, y, w, h * (0.3 + r() * 0.5)); }
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x, y, w * 0.45, h);
  };
  const stone = make((g, x, y, s, r) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(0,0,0,0.06)'; for (let k = 0; k < 6; k++) g.fillRect(x, y + k * s / 6, s, 1);
    pane(g, x + 30, y + 22, s - 60, s - 52, r);
    g.fillStyle = '#d9d2c4'; g.fillRect(x + 24, y + s - 30, s - 48, 6);          // the sill
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 30, y + 22, s - 60, 4);     // the reveal's shadow
  });
  const glass = make((g, x, y, s, r) => {
    pane(g, x, y, s, s * 0.74, r);
    g.fillStyle = '#2c3138'; g.fillRect(x, y + s * 0.74, s, s * 0.26);           // the spandrel
    g.fillStyle = '#8a9198'; g.fillRect(x, y, 3, s); g.fillRect(x + s / 2, y, 2, s * 0.74);
  });
  const brick = make((g, x, y, s, r) => {
    g.fillStyle = '#8c4b38'; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(230,215,200,0.35)';
    for (let k = 0; k < 16; k++) { g.fillRect(x, y + k * 8, s, 1); for (let m = 0; m < 6; m++) g.fillRect(x + ((m * 24 + (k % 2) * 12) % s), y + k * 8, 1, 8); }
    g.fillStyle = '#eeeae0'; g.fillRect(x + 26, y + 20, s - 52, s - 46);
    pane(g, x + 31, y + 25, s - 62, s - 56, r);
  });
  return [
    { map: stone, rough: 0.85, metal: 0 },
    { map: glass, rough: 0.15, metal: 0.4, glass: true },
    { map: brick, rough: 0.9, metal: 0 },
  ];
}

// Shopfronts: a sign band over big windows, four shops wide, in four variants.
// Made-up shops, no real names.
const SHOPS = ['DELI', 'BOOKS', 'CAFE', 'SHOES', 'FLOWERS', 'BANK', 'PHARMACY', 'BAKERY', 'TAILOR', 'GALLERY', 'NEWS', 'PIZZA'];
function shopfronts(rand) {
  const n = 4;
  const c = document.createElement('canvas');
  c.width = 128 * n; c.height = 80;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const x = i * 128;
    g.fillStyle = ['#1d2a22', '#2a1a1a', '#1a2230', '#2b2b2b', '#3a2a14'][(rand() * 5) | 0];
    g.fillRect(x, 0, 128, 80);
    g.fillStyle = '#f2ead6';
    g.font = 'bold 13px sans-serif';
    g.textAlign = 'center';
    g.fillText(SHOPS[(rand() * SHOPS.length) | 0], x + 64, 15);
    const grad = g.createLinearGradient(x, 22, x, 80);
    grad.addColorStop(0, '#d8c8a0'); grad.addColorStop(1, '#6a5a40');
    g.fillStyle = grad;
    g.fillRect(x + 8, 22, 112, 54);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + 62, 22, 4, 54);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Unit boxes as instances of one mesh: `add` places one (size, tilt about x,
// colour) and returns its index, `show` hides or shows it.
function boxes(group, material, max, shadow) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
  mesh.count = 0;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  const mats = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  return {
    add(x, y, z, w, h, d, tilt = 0, colour = null) {
      const i = mesh.count++;
      _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(tilt, 0, 0)), new THREE.Vector3(w, h, d));
      mats[i] = _m.clone();
      mesh.setMatrixAt(i, _m);
      if (colour !== null) mesh.setColorAt(i, new THREE.Color(colour));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      return i;
    },
    show(i, on) {
      mesh.setMatrixAt(i, on ? mats[i] : _m.makeScale(0, 0, 0));
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
