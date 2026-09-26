import * as THREE from 'three';
import { Timer } from 'three';
import { createRenderer, createScene, createCamera, createLights, createPost, handleResize, followShadow } from './scene.js';
import { Physics } from './physics.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { Player } from './player.js';
import { Audio } from './audio.js';
import { Particles } from './fx/particles.js';
import { Chips } from './fx/chips.js';
import { Heap } from './fx/heap.js';
import { Shake } from './fx/shake.js';
import { Damage } from './damage/damage.js';
import { Structure } from './sim/structure.js';
import { Fire } from './sim/fire.js';
import { Blast } from './sim/blast.js';
import { Impacts } from './sim/impacts.js';
import { Lift } from './sim/lift.js';
import { TOOL_CLASSES } from './tools/tools.js';
import { Menu } from './ui/menu.js';
import { Hud, screens } from './ui/hud.js';
import { Quality } from './render/quality.js';
import { job as jobById, tool as toolById } from './data/catalog.js';
import { progress } from './data/progress.js';

// The game: a menu, then a job.
//
//   menu    -> pick a job, pick tools
//   loading -> the building goes up
//   begin   -> click to take the mouse (the browser needs a click for it)
//   play    -> knock it down
//   paused  -> Esc
//   done    -> the results, then back to the menu

const renderer = createRenderer();
const scene = createScene(renderer);
const camera = createCamera();
const lights = createLights(scene);
const post = createPost(renderer, scene, camera);
handleResize(renderer, camera, post);
const quality = new Quality(renderer, post, lights);

// What is in your hands is drawn after everything else, in a scene of its own,
// so the sledge never pokes through a wall you are standing against.
const vmScene = new THREE.Scene();
vmScene.environment = scene.environment;
vmScene.environmentIntensity = 0.5;
const vmSun = new THREE.DirectionalLight(0xfff0dd, 1.6);
vmSun.position.set(1, 2, 1);
vmScene.add(vmSun, new THREE.HemisphereLight(0xc8d8ea, 0x5a5048, 0.6));
const vmCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
addEventListener('resize', () => { vmCamera.aspect = innerWidth / innerHeight; vmCamera.updateProjectionMatrix(); });

const physics = await Physics.create();
const world = createWorld(scene, physics);
const pieces = world.pieces;
const input = createInput(renderer.domElement);
const audio = new Audio();
const particles = new Particles(scene);
const chips = new Chips(scene, physics);
const heap = new Heap(scene, physics);
const shake = new Shake();
const player = new Player(camera, input, physics);
const hud = new Hud();

const damage = new Damage(pieces, { chips, particles, audio, shake });
const structure = new Structure(pieces, { particles, chips, heap, audio, shake, player });
const blast = new Blast({ pieces, damage, physics, particles, chips, audio, shake, player, structure });
const fire = new Fire(scene, pieces, physics, { particles, chips, audio, explode: (p) => blast.tank(p) });
blast.ctx.fire = fire;
damage.onStructure = () => structure.mark();

// A cloud of dust rolling out from where something heavy came down. Thick
// enough to lose sight of things in — and of you.
function cloud(at, scale = 1) {
  const n = Math.round(10 + 22 * scale);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2 * scale;
    const s = (2 + Math.random() * 4) * scale;
    particles.spawn('bigdust', at.x + Math.cos(a) * r, at.y + Math.random() * 0.8, at.z + Math.sin(a) * r,
      Math.cos(a) * s, 0.4 + Math.random() * 1.2, Math.sin(a) * s);
  }
  for (let i = 0; i < n; i++) particles.spawn('dust', at.x, at.y + 0.3, at.z, (Math.random() - 0.5) * 6 * scale, Math.random() * 2, (Math.random() - 0.5) * 6 * scale, 0x7a756e);
}
damage.fx.cloud = cloud;
const impacts = new Impacts(pieces, physics, { damage, cloud, audio, shake, player, structure });
damage.fx.mustFail = (p) => structure.mustFail(p);
damage.fx.onFailed = (p) => structure.failed(p);
structure.fx.damage = damage;
damage.fx.onPuncture = (p, point, normal) => {
  if (p.punctured) return;
  p.punctured = true;
  audio.hiss?.(point.x, point.y, point.z);
  const jet = () => { if (p.state !== 'dead') particles.spawn('smoke', point.x, point.y, point.z, normal.x * 5, normal.y * 5 + 0.5, normal.z * 5, 0xdadada); };
  for (let i = 0; i < 40; i++) blast.later(jet, i * 0.03);
  blast.later(() => blast.tank(p), 1.3 + Math.random() * 0.6);
};
// A big fragment thrown clear of a collapse.
structure.fx.throwChunk = (p, at, vel) => {
  const q = p.parts[0];
  const s = p.localBox.getSize(new THREE.Vector3());
  if (s.x * s.y * s.z > 6) return;
  const g = q.geometry.clone();
  const f = pieces.spawn({ parts: [{ kind: q.kind.name, geometry: g }], pos: at, quat: p.quat, role: 'fragment', structural: false }, { dynamic: true, vel });
  damage.fracture(f, at, vel.clone().normalize(), 2);
};
structure.onCrushPlayer = () => player.damage(500, 'crushed');

const lift = new Lift(scene, physics);
let liftTip = null;

const ctx = { input, camera, physics, pieces, damage, particles, chips, fire, blast, audio, shake, player, scene };

// ---------------------------------------------------------------- state

let state = 'menu';
let job = null;
let tools = [];
let current = 0;
let height = null, heightT = 0, doneT = -1, started = 0, downT = 0;

const menu = new Menu(document.getElementById('menu'), {
  onClick: () => audio.click(),
  quality,
  onStart: (jobId, toolIds) => start(jobId, toolIds),
});

function openMenu() {
  state = 'menu';
  input.unlock();
  hud.show(false);
  screens.hidePause();
  audio.silence();
  menu.show('jobs');
  // Behind the menu: the city, from the avenue.
  camera.position.set(19, 2.2, 31);
  camera.lookAt(0, 42, 0);
}

async function start(jobId, toolIds) {
  audio.start();
  menu.hide();
  state = 'loading';
  job = jobById(jobId);
  screens.loading('Clearing the site', 0.05);
  await frames(2);
  unloadJob();
  screens.loading(`Building ${job.title}`, 0.3);
  await frames(2);
  world.load(job.build);
  lift.attach(pieces);
  screens.loading('Wiring the gas and the lights', 0.85);
  await frames(2);
  tools = toolIds.filter((id) => TOOL_CLASSES[id]).map((id) => new TOOL_CLASSES[id]());
  current = 0;
  for (const t of tools) { t.model.visible = false; vmScene.add(t.model); }
  hud.setJob(job);
  player.revive();
  player.teleport(job.entry.x, 0.05, job.entry.z, job.entry.yaw);
  height = measure();
  doneT = -1;
  started = performance.now();
  screens.loaded();
  state = 'begin';
  screens.begin(job.title, () => { input.lock(); });
}

function unloadJob() {
  for (const t of tools) { t.unequip?.(ctx); t.clear?.(); t.model.removeFromParent(); }
  tools = [];
  structure.clear();
  impacts.clear();
  fire.clear();
  blast.clear();
  chips.clear();
  heap.clear();
  particles.clear();
  world.unload();
}

input.onLockChange((locked) => {
  if (locked && (state === 'begin' || state === 'paused')) {
    state = 'play';
    screens.hideBegin();
    screens.hidePause();
    hud.show(true);
  } else if (!locked && state === 'play') {
    state = 'paused';
    audio.spray(false); audio.foam(false);
    screens.pause({
      onResume: () => input.lock(),
      onRestart: () => { const ids = tools.map((t) => t.id); start(job.id, ids); },
      onQuit: () => { unloadJob(); openMenu(); },
    });
  }
});

player.onDamage = (amount) => { hud.hurt(amount); audio.hurt(); };
player.onDeath = (cause) => {
  screens.down(cause);
  downT = 3;
};

// The job's measure: the highest point of anything still standing.
function measure() {
  let top = 0;
  for (const p of pieces.list) {
    if (p.state !== 'static') continue;
    if (p.role === 'shard' || p.role === 'fragment' || p.role === 'rebar' || p.role === 'stub') continue;
    if (p.box.max.y > top) top = p.box.max.y;
  }
  return top;
}

function finish() {
  state = 'done';
  input.unlock();
  hud.show(false);
  const first = !progress.done(job.id);
  progress.finish(job.id);
  const secs = Math.round((performance.now() - started) / 1000);
  const unlockedTool = first && job.unlocks ? toolById(job.unlocks)?.name : null;
  screens.results({
    title: job.title,
    rows: [
      ['Standing', `${height.toFixed(1)} m (target ${job.target} m)`],
      ['Time on site', `${Math.floor(secs / 60)} min ${secs % 60} s`],
      ['Explosions', `${blast.count}`],
      ['Still burning', `${fire.count}`],
    ],
    unlocked: unlockedTool,
    onBack: () => { unloadJob(); openMenu(); },
  });
}

// ---------------------------------------------------------------- loop

function frame(dt) {
  const playing = state === 'play';
  if (playing && !player.dead) {
    // Tools: 1-5, or the wheel.
    for (let i = 0; i < tools.length; i++) if (input.pressed(`Digit${i + 1}`)) select(i);
    const w = input.takeWheel();
    if (w && tools.length) select((current + (w > 0 ? 1 : -1) + tools.length) % tools.length);
  }
  if (state === 'play' || state === 'paused' || state === 'done') {
    if (playing) {
      liftTip = player.dead ? null : lift.control(input, player);
      lift.update(dt, player, structure);
      player.update(dt);
    } else lift.update(dt, null, structure);
    const t = tools[current];
    for (const tool of tools) {
      tool.model.visible = tool === t && playing && !player.dead;
      if (tool === t && playing && !player.dead) tool.update(dt, ctx);
      else tool.background?.(dt, ctx);
    }
    physics.step(dt);
    pieces.sync();
    structure.update(dt);
    impacts.update(dt);
    const dps = fire.update(dt, player.pos);
    if (dps > 0 && playing) player.damage(dps * dt, 'fire');
    blast.update(dt);
    heightT -= dt;
    if (heightT <= 0 && state === 'play') {
      heightT = 0.25;
      height = measure();
      if (height < job.target && !structure.collapsing && doneT < 0) { doneT = 3.5; hud.flash('Target reached'); }
    }
    if (doneT > 0 && state === 'play') { doneT -= dt; if (doneT <= 0) finish(); }
    if (downT > 0) {
      downT -= dt;
      if (downT <= 0) {
        screens.hideDown();
        player.revive();
        player.teleport(job.entry.x, 0.05, job.entry.z, job.entry.yaw);
      }
    }
  }
  chips.update(dt);
  particles.update(dt);
  audio.setListener(camera);
  audio.update(dt);
  followShadow(lights, camera);
  shake.apply(camera, dt);
  post.composer.render(dt);
  if (state === 'play') {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
    renderer.autoClear = true;
    const t = tools[current];
    hud.setSlots(tools, current);
    hud.update(dt, {
      health: player.health, height, fires: fire.count, done: doneT >= 0,
      tip: liftTip ?? tipFor(t),
    });
  }
  input.endFrame();
}

function select(i) {
  if (i === current || !tools[i]) return;
  tools[current]?.unequip?.(ctx);
  current = i;
  audio.click();
}

function tipFor(t) {
  if (!t) return '';
  if (t.id === 'spray') return `Colour: ${t.colourName} — right click to change`;
  if (t.id === 'bomb') return `${t.left} charges · ${t.placed.length} placed — left click to place, right click to detonate`;
  if (t.id === 'extinguisher') return fire.count ? 'Hold left click on the fire' : '';
  return '';
}

// Let the loading screen paint. A hidden tab never runs requestAnimationFrame,
// so there it falls back to a message, or loading would wait forever.
const frames = (n) => new Promise((r) => {
  if (document.hidden) { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); return; }
  let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f);
});

if (import.meta.env.DEV) {
  window.dev = { renderer, scene, camera, lights, world, pieces, physics, input, post, player, damage, structure, fire, blast, chips, heap, particles, audio, ctx, get tools() { return tools; }, start, measure, impacts, lift, quality,
    get state() { return state; }, set state(s) { state = s; },
    // Run whole frames by hand, for a tab that is not on screen.
    step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); }, select };
}

const timer = new Timer();
function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const dt = timer.getDelta();
  // Only a frame that was really drawn on screen says anything about speed.
  if (state === 'play') quality.sample(dt);
  frame(Math.min(dt, 0.05));
}
openMenu();
animate();
