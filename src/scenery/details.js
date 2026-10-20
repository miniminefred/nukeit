import * as THREE from 'three';

// What makes a New York block look like one rather than a box: on the roofs,
// wooden water tanks on steel legs with conical caps, air-handling units,
// aerials on the tall ones; down the fronts of the brick blocks, black steel
// fire escapes — a landing at every floor, a railing, a stair zig-zagging
// down. All instanced, a few draw calls for the whole city, and hidden with
// their block when it wakes into a building of pieces (scenery/city.js).

const FLOOR = 3.6;

export function details(group, rand) {
  const set = (geometry, material, max, shadow = true) => {
    const mesh = new THREE.InstancedMesh(geometry, material, max);
    mesh.count = 0;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    const mats = [];
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
    return {
      add(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
        if (mesh.count >= max) return -1;
        const i = mesh.count++;
        _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
        mats[i] = _m.clone();
        mesh.setMatrixAt(i, _m);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        return i;
      },
      show(i, on) {
        if (i < 0) return;
        mesh.setMatrixAt(i, on ? mats[i] : _m.makeScale(0, 0, 0));
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  };
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.7, metalness: 0.5 });
  const sets = {
    // A tank: staves of weathered cedar, iron hoops (darker bands in the wood),
    // a cone of a roof.
    tank: set(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), new THREE.MeshStandardMaterial({ map: staves(), roughness: 0.95 }), 160),
    cap: set(new THREE.ConeGeometry(0.55, 1, 20), new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.9 }), 160),
    leg: set(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), steel, 640),
    plant: set(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x9a9c9a, roughness: 0.6, metalness: 0.3 }), 400),
    mast: set(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), steel, 120),
    // Fire escapes.
    deck: set(new THREE.BoxGeometry(1, 1, 1), steel, 3000),
    rail: set(new THREE.BoxGeometry(1, 1, 1), steel, 3000),
    stair: set(new THREE.BoxGeometry(1, 1, 1), steel, 3000),
  };

  // Everything for one block; returns [set, instance] pairs to show and hide.
  return (b, style, facing) => {
    const out = [];
    const put = (k, ...a) => out.push([sets[k], sets[k].add(...a)]);
    const top = b.h;
    // A water tank on most masonry roofs.
    if (!style.glass && rand() < 0.7) {
      const r = 1.6 + rand() * 1.2, th = 3 + rand() * 1.6, legH = 2.2 + rand() * 1.2;
      const tx = b.x + (rand() - 0.5) * (b.w - 2 * r - 2), tz = b.z + (rand() - 0.5) * (b.d - 2 * r - 2);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put('leg', tx + dx * r * 0.6, top + legH / 2, tz + dz * r * 0.6, 0.18, legH, 0.18);
      put('tank', tx, top + legH + th / 2, tz, r * 2, th, r * 2);
      put('cap', tx, top + legH + th + 0.5, tz, r * 2, 1.0, r * 2);
    }
    // Air-handling units.
    const n = 1 + ((rand() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const sx = 2 + rand() * 3, sz = 1.5 + rand() * 2.5, sy = 1.2 + rand() * 1.4;
      put('plant', b.x + (rand() - 0.5) * (b.w - sx - 1), top + sy / 2, b.z + (rand() - 0.5) * (b.d - sz - 1), sx, sy, sz);
    }
    // An aerial on the tall ones.
    if (b.h > 90 && rand() < 0.6) { const mh = 6 + rand() * 10; put('mast', b.x + (rand() - 0.5) * b.w * 0.4, top + mh / 2, b.z, 0.3, mh, 0.3); }
    // Fire escapes down the front of a brick block that is not too tall.
    if (style.brick && b.h < 75) {
      const face = b.z + (facing || 1) * (b.d / 2 + 0.6);
      const cols = Math.max(1, Math.min(3, Math.floor(b.w / 9)));
      for (let c = 0; c < cols; c++) {
        const cx = b.x - b.w / 2 + (b.w / cols) * (c + 0.5);
        for (let f = 1; f * FLOOR < b.h - 2; f++) {
          const y = f * FLOOR + 0.9;
          put('deck', cx, y, face, 3, 0.06, 1.1);
          put('rail', cx, y + 0.5, face + (facing || 1) * 0.55, 3, 0.9, 0.04);
          // The stair down to the landing below, leaning one way then the other.
          if (f > 1) put('stair', cx, y - FLOOR / 2, face, 0.1, Math.hypot(FLOOR, 2.2), 0.7, 0, 0, (f % 2 ? 1 : -1) * Math.atan2(2.2, FLOOR));
        }
      }
    }
    return out;
  };
}

// Cedar staves, grey with weather, banded by iron hoops.
function staves() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (let x = 0; x < 256; x += 8) {
    const v = 95 + Math.random() * 35;
    g.fillStyle = `rgb(${v | 0},${(v * 0.86) | 0},${(v * 0.72) | 0})`;
    g.fillRect(x, 0, 8, 128);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x, 0, 1, 128);
  }
  g.fillStyle = 'rgba(30,26,24,0.85)';
  for (const y of [14, 46, 80, 112]) g.fillRect(0, y, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
