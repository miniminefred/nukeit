import { Timer } from 'three';
import { createRenderer, createScene, createCamera, createLights, handleResize } from './scene.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { Player } from './player.js';
import { buildTower, ENTRY } from './build/tower.js';

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
const lights = createLights(scene);
handleResize(renderer, camera);

const world = createWorld(scene);
const input = createInput(renderer.domElement, document.getElementById('overlay'));
const player = new Player(camera, input, world);

const t0 = performance.now();
await world.load(buildTower);
const loadMs = performance.now() - t0;
player.teleport(ENTRY.x, 0, ENTRY.z, ENTRY.yaw);

if (import.meta.env.DEV) {
  window.dev = { renderer, scene, camera, lights, world, input, player, loadMs };
}

const timer = new Timer();

function frame(dt) {
  player.update(dt);
  world.update(camera.position);
  renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  frame(Math.min(timer.getDelta(), 0.05));
}
animate();
