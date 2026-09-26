import { Timer } from 'three';
import { createRenderer, createScene, createCamera, createLights, handleResize } from './scene.js';
import { buildWorld } from './world.js';
import { createInput } from './input.js';
import { Player } from './player.js';

const renderer = createRenderer();
const scene = createScene();
const camera = createCamera();
const lights = createLights(scene);
handleResize(renderer, camera);

const world = buildWorld(scene);
const input = createInput(renderer.domElement, document.getElementById('overlay'));
const player = new Player(camera, input, world);

// Dev-only console handle; stripped from the production build.
if (import.meta.env.DEV) {
  window.dev = { renderer, scene, camera, lights, world, input, player };
}

const timer = new Timer();

function frame(dt) {
  player.update(dt);
  renderer.render(scene, camera);
}

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  // Clamp so a stalled tab does not produce one enormous step.
  frame(Math.min(timer.getDelta(), 0.05));
}
animate();
