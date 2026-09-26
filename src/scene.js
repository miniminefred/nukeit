import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// How the world is lit and photographed.
//
// A physical sky, and the same sky baked into an environment map, so the
// bronze glass reflects the actual sky and interiors are lit by daylight
// coming in rather than by a flat ambient. One sun with soft shadows. Then
// ambient occlusion, which is what puts contact shadow under a desk and into
// the corners of a room, bloom for fire and lamps, and filmic tone mapping.

export const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(35));

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  // Pixel ratio is set by render/quality.js.
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // Plain PCF: the soft variant costs several times as many shadow samples.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // The sky shader works in physical radiance, which is far brighter than
  // anything else in the scene; half exposure is what puts the two together.
  renderer.toneMappingExposure = 0.5;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

export function createScene(renderer) {
  const scene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.5;
  u.rayleigh.value = 2;
  u.mieCoefficient.value = 0.0025;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(SUN_DIR);
  scene.add(sky);

  // Bake the sky into an environment map once.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  const env = pmrem.fromScene(envScene, 0.02).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.14;
  scene.fog = new THREE.Fog(0x9fb3c8, 260, 1600);
  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 2500);
  camera.rotation.order = 'YXZ';
  return camera;
}

export function createLights(scene) {
  const sun = new THREE.DirectionalLight(0xfff0dd, 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);      // quality.js changes this
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.03;
  const s = sun.shadow.camera;
  s.near = 20; s.far = 500;
  s.left = s.bottom = -40; s.right = s.top = 40;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xc8d8ea, 0x5a5048, 0.35);
  scene.add(hemi);
  return { sun, hemi };
}

// Keep the sun's shadow box centred on where you are looking from, snapped to
// shadow-map texels so its edges do not crawl as you walk.
export function followShadow(lights, camera) {
  const { sun } = lights;
  const size = 80, texel = size / sun.shadow.mapSize.x;
  const c = camera.position;
  const snap = (v) => Math.round(v / texel) * texel;
  sun.target.position.set(snap(c.x), snap(Math.max(0, c.y - 6)), snap(c.z));
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
  sun.target.updateMatrixWorld();
}

export function createPost(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ao.output = GTAOPass.OUTPUT.Default;
  ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1 });
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, ao, bloom };
}

export function handleResize(renderer, camera, post) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.composer.setSize(window.innerWidth, window.innerHeight);
  });
}
