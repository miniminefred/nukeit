import * as THREE from 'three';
import { Field } from './voxel/field.js';
import { MeshManager } from './voxel/mesh-manager.js';
import { CX, CY, CZ, MIN_X, MIN_Y, MIN_Z, VOXEL } from './voxel/constants.js';
import { AIR } from './voxel/materials.js';
import { buildCity } from './scenery/city.js';

// The world: a city that is scenery, and one job site in the middle of it that
// is made of voxels.
//
// The city is built once. The job site is built when a job starts and thrown
// away when you leave it, so going back to the menu and taking the job again
// gives you the building back standing.

// Give the page a moment to paint. A MessageChannel rather than setTimeout,
// which a background tab clamps to one call a second.
function yieldFrame() {
  return new Promise((r) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => r();
    ch.port2.postMessage(0);
  });
}

export function createWorld(scene) {
  buildCity(scene);

  const field = new Field(CX, CY, CZ);
  const group = new THREE.Group();
  group.name = 'site';
  group.position.set(MIN_X, MIN_Y, MIN_Z);
  scene.add(group);
  const meshes = new MeshManager(field, group);

  return {
    field,
    meshes,
    group,

    // Stamp a job into the field and mesh all of it, yielding between chunks so
    // the loading screen can show progress.
    async load(build, onProgress) {
      meshes.dispose();
      field.clear();
      const t0 = performance.now();
      build(field);
      this.buildMs = performance.now() - t0;
      const all = [...field.dirty];
      for (let n = 0; n < all.length; n++) {
        meshes.rebuild(all[n]);
        if (n % 12 === 0) {
          onProgress?.(n / all.length);
          await yieldFrame();
        }
      }
      onProgress?.(1);
    },

    unload() {
      meshes.dispose();
      field.clear();
    },

    // Solid at a world point? The ground plane counts as solid.
    solidAt(x, y, z) {
      if (y < 0) return true;
      return field.get(
        Math.floor((x - MIN_X) / VOXEL),
        Math.floor((y - MIN_Y) / VOXEL),
        Math.floor((z - MIN_Z) / VOXEL),
      ) !== AIR;
    },

    update(eye) { meshes.update(eye, 10); },
  };
}
