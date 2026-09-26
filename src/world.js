import * as THREE from 'three';

// What stands in the world. For now: flat ground and a few blocks to walk
// between, so there is something to measure movement against.

export const GROUND_SIZE = 400;

export function buildWorld(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x6b8a4e, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE / 2, 0x000000, 0x000000);
  grid.material.opacity = 0.08;
  grid.material.transparent = true;
  grid.position.y = 0.01;
  scene.add(grid);

  const mat = new THREE.MeshStandardMaterial({ color: 0xb0a89a, roughness: 0.9 });
  const blocks = [
    [10, -15, 4, 3, 4],
    [-12, -20, 6, 5, 3],
    [0, -35, 10, 8, 6],
  ];
  for (const [x, z, w, h, d] of blocks) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.position.set(x, h / 2, z);
    box.castShadow = box.receiveShadow = true;
    scene.add(box);
  }

  return {
    bounds: { min: -GROUND_SIZE / 2 + 1, max: GROUND_SIZE / 2 - 1 },
  };
}
