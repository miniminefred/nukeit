import * as THREE from 'three';
import { KIND, insideMaterial, BATCH_DEPTH } from './materials.js';

// Every shader a collapse will need, compiled while the loading screen is up.
//
// A material is a different shader program for each way it is drawn: in a
// batch, in a batch with instance colours, as a mesh of its own, into the
// shadow map. The building starts out drawn only one of those ways, so the
// first blast — the first loose piece, the first broken face, the first chip —
// compiled a dozen programs in one frame, and that frame took 125 ms. Drawing
// one tiny thing of each kind, each way, once, before the job starts moves all
// of that onto the loading screen.

export async function warmUp(renderer, scene, camera, post, extra = []) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.001, 0.001, 0.001);
  const flat = geo.toNonIndexed();
  const mats = new Set();
  for (const k of Object.values(KIND)) { mats.add(k.material); mats.add(insideMaterial(k.name)); }
  const batches = [];
  for (const m of mats) {
    const mesh = new THREE.Mesh(geo, m);
    const cut = new THREE.Mesh(geo, [m, m]);    // a mesh with groups: what a cut leaves
    for (const x of [mesh, cut]) { x.castShadow = x.receiveShadow = true; x.frustumCulled = false; group.add(x); }
    for (const [g, n] of [[geo, 36], [flat, 0]]) {
      const b = new THREE.BatchedMesh(1, 36, n, m);
      b._initColorsTexture();                 // as every batch in the game has (pieces.js)
      b.customDepthMaterial = BATCH_DEPTH;
      const i = b.addInstance(b.addGeometry(g));
      b.setColorAt(i, new THREE.Color(0xffffff));
      b.castShadow = b.receiveShadow = true;
      b.frustumCulled = false;
      b.perObjectFrustumCulled = false;
      group.add(b);
      batches.push(b);
    }
  }
  for (const o of extra) group.add(o);
  // In front of the camera, and inside the sun's shadow box.
  camera.updateMatrixWorld();
  group.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(2));
  scene.add(group);
  try { await renderer.compileAsync(scene, camera); } catch { /* compile on draw instead */ }
  renderer.shadowMap.needsUpdate = true;      // the shadow pass's programs too
  post.composer.render(0);
  scene.remove(group);
  for (const b of batches) b.dispose();
  geo.dispose();
  flat.dispose();
}
