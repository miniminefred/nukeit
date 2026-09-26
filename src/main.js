import { Timer } from 'three';
import { createRenderer, createScene, createCamera, createLights, createPost, handleResize, followShadow } from './scene.js';
import { Physics } from './physics.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { buildTower } from './building/tower.js';

const renderer = createRenderer();
const scene = createScene(renderer);
const camera = createCamera();
const lights = createLights(scene);
const post = createPost(renderer, scene, camera);
handleResize(renderer, camera, post);

const physics = await Physics.create();
const world = createWorld(scene, physics);
const input = createInput(renderer.domElement);
world.load(buildTower);
camera.position.set(0, 1.7, 20);

if (import.meta.env.DEV) {
  window.dev = { renderer, scene, camera, lights, world, physics, input, post };
}

const timer = new Timer();
function frame(dt) {
  physics.step(dt);
  world.pieces.sync();
  followShadow(lights, camera);
  post.composer.render(dt);
  input.endFrame();
}
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  frame(Math.min(timer.getDelta(), 0.05));
}
animate();
