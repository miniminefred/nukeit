import * as THREE from 'three';

// Renderer, scene, camera and lights. Everything that decides how the world
// is drawn, and nothing about what is in it.

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb4d8);
  scene.fog = new THREE.Fog(0x8fb4d8, 60, 400);
  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
  camera.rotation.order = 'YXZ';
  return camera;
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4030, 1.2);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.5);
  sun.position.set(40, 80, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = s.bottom = -60;
  s.right = s.top = 60;
  s.far = 200;
  scene.add(sun);

  return { hemi, sun };
}

export function handleResize(renderer, camera) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
