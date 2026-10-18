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
import { Shake } from './fx/shake.js';
import { Damage } from './damage/damage.js';
import { Structure } from './sim/structure.js';
import { Fire } from './sim/fire.js';
import { Blast } from './sim/blast.js';
import { Impacts } from './sim/impacts.js';
import { Lift } from './sim/lift.js';
import { Doors } from './sim/doors.js';
import { Water } from './sim/water.js';
import { Smoke } from './sim/smoke.js';
import { Powder } from './fx/powder.js';
import { Security } from './sim/security.js';
import { Traffic } from './sim/traffic.js';
import { Topple } from './sim/topple.js';
import { Rubble } from './sim/rubble.js';
import { People } from './sim/people.js';
import { TOOL_CLASSES } from './tools/tools.js';
import { Menu } from './ui/menu.js';
import { Hud, screens } from './ui/hud.js';
import { Quality } from './render/quality.js';
import { warmUp } from './render/warmup.js';
import { job as jobById, tool as toolById } from './data/catalog.js';
import { progress } from './data/progress.js';
import { level as levelById } from './data/difficulty.js';

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
const shake = new Shake();
const player = new Player(camera, input, physics);
const hud = new Hud();

const damage = new Damage(pieces, { chips, particles, audio, shake });
const rubble = new Rubble(pieces, physics, { chips, particles, audio, camera });
const structure = new Structure(pieces, { particles, chips, rubble, audio, shake, player });
const blast = new Blast({ pieces, damage, physics, particles, chips, audio, shake, player, structure, rubble });
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
rubble.fx.cloud = cloud;
rubble.fx.onLand = (q, blows, at, by) => impacts.absorb(q, blows, at, by);
// What hangs on under a slab — the top of a broken column, its bars — falls with it.
damage.fx.hang = (p, from) => rubble._rest(p, from);
// A floor with more rubble on it than it can carry gives way.
rubble.fx.onOverload = (q) => {
  if (q.state !== 'static' || q.queued) return;
  const c = q.box.getCenter(new THREE.Vector3());
  audio.creak?.(c.x, c.y, c.z);
  damage.fractureSoon(q, c, new THREE.Vector3(0, -1, 0), 2, 2);
  structure.mark();
};
const impacts = new Impacts(pieces, physics, { damage, cloud, audio, shake, player, structure });
damage.fx.makeRoom = (n) => impacts.makeRoom(n);
const topple = new Topple(pieces, physics, { rubble, particles, chips, cloud, audio, shake, structure, player, wake: (box) => world.wakeIn(box) });
structure.fx.topple = topple;
// Thousands of tonnes coming down next to a building shake it: in what is
// still standing, furniture goes over — more of it the nearer the blow —
// hanging lamps come down, and windows burst. The structure stands; its
// contents do not.
topple.fx.quake = (at, mass) => {
  const reach = 12 + Math.sqrt(mass / 1000) * 1.2;
  const near = pieces.list.filter((p) => p.state === 'static' && (p.role === 'furniture' || p.role === 'lamp' || p.role === 'glass'))
    .map((p) => [p, p.box.distanceToPoint(at)]).filter(([, d]) => d < reach).sort((a, b) => a[1] - b[1]).slice(0, 400);
  for (const [p, d] of near) {
    const k = 1 - d / reach;
    if (Math.random() > k * 1.3) continue;
    if (p.role === 'glass') { if (Math.random() < 0.5) { chips.burst('glass', p.box.getCenter(new THREE.Vector3()), new THREE.Vector3(0, 1, 0), 4, 3, 0.03); pieces.destroy(p); } continue; }
    const a = Math.random() * Math.PI * 2, s = 0.6 + k * 2.2;
    rubble.add(p, new THREE.Vector3(Math.cos(a) * s, 0.6 + k * 1.5, Math.sin(a) * s), new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4 * k));
  }
  structure.mark();
};
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
structure.onCrushPlayer = () => player.damage(500, 'crushed');

const lift = new Lift(scene, physics);
const doors = new Doors();
const people = new People(scene, physics);
// Smoke filling the rooms, and the sprinklers, mains, wet floors and alarm.
const smoke = new Smoke(scene, pieces, { particles });
const powder = new Powder(scene);
const water = new Water(scene, pieces, physics, { particles, chips, audio, fire, people, smoke });
fire.fx.smoke = smoke;
// Furniture burnt half through gives way; glass by a fire cracks, then breaks.
fire.fx.collapse = (p, at) => damage.fracture(p, at.clone(), new THREE.Vector3(0, -1, 0), 0.6, 1);
fire.fx.heatGlass = (p, at, dir) => damage.hit(p, at, dir.clone().negate(), dir, p.crack ? 2 : 1);
// People hear things: a blast, a support giving way, a building going over.
const bang = blast.explode.bind(blast);
blast.explode = (at, r, power) => {
  people.alarm(at, Math.max(26, r * 9));
  world.wakeNear(at, Math.max(6, r * 3));     // a city block near a blast is a building now
  return bang(at, r, power);
};
const gave = damage.fx.onFailed;
damage.fx.onFailed = (p) => { people.alarm(p.box.getCenter(new THREE.Vector3()), 18); security.noise(p.box.getCenter(new THREE.Vector3()), 3, false); return gave(p); };
// Guards and the police (sim/security.js). Caught by an officer, the job is
// over; tackled by a guard, you are put out of the front door and carry on.
const security = new Security({
  people, physics, player, audio, hud, particles, smoke, veil: particles.veil, camera, shake, scene,
  onBusted: () => failed('Arrested'),
  onThrownOut: () => { if (thrownT <= 0) thrownT = 1.4; },
});
let thrownT = -1;
// The avenue's traffic (sim/traffic.js): it stops for the light, for you and
// for rubble; heavy things landing on cars crush them.
const traffic = new Traffic(scene, { physics, player, audio });
const landed = rubble.fx.onLand;
rubble.fx.onLand = (q, blows, at, by) => { if (by) traffic.landed(at, by.volume * by.kind.density * 0.6); return landed(q, blows, at, by); };
const bang2 = blast.explode;
blast.explode = (at, r, power) => { security.noise(at, 12 * (power ?? 1), false); traffic.alarm(at, Math.max(30, r * 6)); return bang2(at, r, power); };
let liftTip = null;
let rig = null;           // dev: { at, look } to hold the camera there
let toppling = false;
let waterfall = null;     // the sheet of water down the atrium wall, while it stands

const ctx = { input, camera, physics, pieces, damage, particles, chips, fire, blast, audio, shake, player, scene, world, powder, security };

// ---------------------------------------------------------------- state

let state = 'menu';
let job = null;
let difficulty = levelById('normal');
let tools = [];
let current = 0;
let height = null, heightT = 0, doneT = -1, started = 0, downT = 0;

const menu = new Menu(document.getElementById('menu'), {
  onClick: () => audio.click(),
  quality,
  onStart: (jobId, toolIds, levelId) => start(jobId, toolIds, levelId),
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

async function start(jobId, toolIds, levelId = 'normal') {
  audio.start();
  menu.hide();
  state = 'loading';
  difficulty = levelById(levelId);
  // The job as this difficulty has it: its own target height.
  job = { ...jobById(jobId), target: difficulty.target };
  pieces.strength = difficulty.strength;
  screens.loading('Clearing the site', 0.05);
  await frames(2);
  unloadJob();
  screens.loading(`Building ${job.title}`, 0.3);
  await frames(2);
  world.load(job.build);
  lift.attach(pieces);
  doors.attach(pieces);
  water.attach();
  smoke.attach();
  people.populate(pieces);
  security.start(difficulty);
  traffic.attach(pieces);
  waterfall = pieces.list.find((p) => p.tag === 'waterfall') ?? null;
  screens.loading('Wiring the gas and the lights', 0.85);
  await frames(2);
  tools = toolIds.filter((id) => TOOL_CLASSES[id]).map((id) => new TOOL_CLASSES[id]());
  for (const t of tools) {
    if (t.id === 'bomb') t.left = difficulty.charges;
    if (t.id === 'extinguisher') t.discharge = difficulty.discharge;
  }
  current = 0;
  for (const t of tools) { t.model.visible = false; vmScene.add(t.model); }
  hud.setJob(job);
  player.revive();
  player.disguised = false;
  thrownT = -1;
  player.teleport(job.entry.x, 0.05, job.entry.z, job.entry.yaw);
  // Every shader the first blast needs, compiled now rather than in its frame.
  const chipCounts = [chips.solid.count, chips.glass.count];
  chips.solid.count = chips.glass.count = 1;
  await warmUp(renderer, scene, camera, post);
  [chips.solid.count, chips.glass.count] = chipCounts;
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
  topple.clear();
  impacts.clear();
  fire.clear();
  water.clear();
  smoke.clear();
  powder.clear();
  blast.clear();
  damage.clear();
  chips.clear();
  rubble.clear();
  security.clear();
  traffic.clear();
  people.clear();
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
      onRestart: () => { const ids = tools.map((t) => t.id); start(job.id, ids, difficulty.id); },
      onQuit: () => { unloadJob(); openMenu(); },
    });
  }
});

player.onDamage = (amount) => { hud.hurt(amount); audio.hurt(); };
player.onDeath = (cause) => {
  screens.down(cause);
  downT = 3;
};

// The sun's shadow map is not drawn every frame: it was a third of the GPU's
// frame, four million triangles again. It is drawn when its box moves with
// you, every other frame while things are falling, and a few times a second
// otherwise — for the people walking, the doors turning, a wall knocked
// through. Static shadow, cached: what every game does.
let shadowClock = 0;
function shadowsDue(moved) {
  shadowClock++;
  const falling = rubble.flying.length > 0 || physics.dynamic.size > 0 || topple.active || structure.collapsing;
  return moved || (falling ? shadowClock % 2 === 0 : shadowClock % 6 === 0);
}

// The job's measure: the highest point of anything still standing in the two
// buildings of the job — not a city block it woke on the way down.
function measure() {
  let top = 0;
  for (const p of pieces.list) {
    if (p.state !== 'static' || (p.building !== 'tower' && p.building !== 'neighbour')) continue;
    if (p.role === 'shard' || p.role === 'fragment' || p.role === 'rebar' || p.role === 'stub') continue;
    if (p.box.max.y > top) top = p.box.max.y;
  }
  return top;
}

// The job ended badly: caught by the police.
function failed(why) {
  if (state !== 'play') return;
  state = 'done';
  input.unlock();
  hud.show(false);
  const secs = Math.round((performance.now() - started) / 1000);
  screens.results({
    heading: 'Job failed',
    title: `${why}`,
    rows: [
      ['Standing', `${height.toFixed(1)} m (target ${job.target} m)`],
      ['Time on site', `${Math.floor(secs / 60)} min ${secs % 60} s`],
      ['Difficulty', difficulty.name],
    ],
    onBack: () => { unloadJob(); openMenu(); },
  });
}

function finish() {
  state = 'done';
  input.unlock();
  hud.show(false);
  const first = !progress.done(job.id);
  progress.finish(job.id, difficulty.id);
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

// A collapse fills the air with dust, and the dust closes in the distance: the
// fog thickens with how much of it there is, so the city beyond a collapse
// fades out behind it. The cloud itself hides what is inside it
// (fx/particles.js, the veil).
const CLEAR = { near: scene.fog.near, far: scene.fog.far, colour: scene.fog.color.clone() };
const DUSTY_AIR = { near: 25, far: 220, colour: new THREE.Color(0x8d8880) };
let dustiness = 0;
function haze(dt) {
  const want = Math.min(1, particles.veil.thick / 2500);
  dustiness += (want - dustiness) * Math.min(1, dt * (want > dustiness ? 1.5 : 0.25));
  const k = dustiness;
  scene.fog.near = CLEAR.near + (DUSTY_AIR.near - CLEAR.near) * k;
  scene.fog.far = CLEAR.far + (DUSTY_AIR.far - CLEAR.far) * k;
  scene.fog.color.copy(CLEAR.colour).lerp(DUSTY_AIR.colour, k);
  // Your head in a room's smoke: you can barely see across it. Crouch.
  const want2 = smoke.at(camera.position);
  smoky += (want2 - smoky) * Math.min(1, dt * 3);
  if (smoky > 0.01) {
    scene.fog.near *= 1 - smoky;
    scene.fog.far = scene.fog.far * (1 - smoky) + SMOKE_AIR.far * smoky;
    scene.fog.color.lerp(SMOKE_AIR.colour, smoky);
  }
}
let smoky = 0;
const SMOKE_AIR = { far: 4, colour: new THREE.Color(0x1d1b19) };

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
      // A spare extinguisher in reach comes first; then the lift.
      liftTip = player.dead ? null : spareTip() ?? lift.control(input, player);
      lift.update(dt, player, { collapsing: structure.collapsing || topple.active });
      player.update(dt);
      // A camera held somewhere else — the collapse bench's, over the avenue.
      if (rig) { camera.position.copy(rig.at); camera.lookAt(rig.look); }
    } else lift.update(dt, null, { collapsing: structure.collapsing || topple.active });
    const t = tools[current];
    for (const tool of tools) {
      tool.model.visible = tool === t && playing && !player.dead;
      if (tool === t && playing && !player.dead) tool.update(dt, ctx);
      else tool.background?.(dt, ctx);
    }
    doors.update(dt);
    physics.step(dt);
    pieces.sync();
    topple.update(dt);
    rubble.update(dt);
    if (topple.active && !toppling) people.alarm(camera.position.clone().set(0, 20, 0), 90);
    // A building coming down is something people stop to watch from the street.
    people.spectacle = topple.active || structure.collapsing ? _spectacle : null;
    toppling = topple.active;
    people.update(dt);
    structure.update(dt);
    impacts.update(dt);
    damage.update();
    const dps = fire.update(dt, player.pos);
    if (dps > 0 && playing) player.damage(dps * dt, 'fire');
    smoke.update(dt);
    water.update(dt);
    powder.update();
    if (state === 'play') security.update(dt);
    traffic.update(dt);
    if (thrownT > 0 && (thrownT -= dt) <= 0) { player.teleport(job.entry.x, 0.05, job.entry.z, job.entry.yaw); }
    player.wet = water.wetAt(player.pos);
    blast.update(dt);
    heightT -= dt;
    if (heightT <= 0 && state === 'play') {
      heightT = 0.25;
      height = measure();
      if (height < job.target && !structure.collapsing && !topple.active && !rubble.active && doneT < 0) { doneT = 3.5; hud.flash('Target reached'); }
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
  // Water down the atrium wall, as long as the wall and the sheet are there.
  if (waterfall && waterfall.state === 'static') {
    const b = waterfall.box;
    for (let i = 0; i < 6; i++) particles.spawn('water', b.min.x + Math.random() * (b.max.x - b.min.x), b.max.y - 0.2, b.max.z + 0.05, 0, -1, 0.15 + Math.random() * 0.2);
  }
  particles.update(dt);
  haze(dt);
  audio.setListener(camera);
  // Inside, on the floors where money is spent, there is music and talk.
  if (state === 'play' && job) {
    const at = player.pos, f = Math.floor((at.y + 0.5) / 4);
    const inside = Math.abs(at.x) < 20 && at.z > -12 && at.z < 12;
    const lounge = inside && ((f >= 0 && f <= 4 && f !== 3) || f >= 9) && !structure.collapsing && !topple.active;
    audio.ambience(inside ? people.crowdAt(at) : 0, lounge ? 1 : 0);
  } else audio.ambience(0, 0);
  audio.update(dt);
  renderer.shadowMap.needsUpdate = shadowsDue(followShadow(lights, camera));
  shake.apply(camera, dt);
  post.composer.render(dt);
  if (state === 'play' && !rig) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(vmScene, vmCamera);
    renderer.autoClear = true;
    const t = tools[current];
    hud.setSlots(tools, current);
    hud.update(dt, {
      health: player.health, height, fires: fire.count, done: doneT >= 0,
      tip: liftTip ?? tipFor(t), alert: security.status,
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

// Looking at a spare extinguisher, close: E takes it, a full one for yours.
function spareTip() {
  camera.getWorldDirection(_look);
  const hit = physics.raycast(camera.position, _look, 2.4);
  if (hit?.owner?.tag === 'disguise' && hit.owner.state === 'static') {
    if (player.disguised) return 'A hi-vis vest and a hard hat (you have one on)';
    if (input.pressed('KeyE')) {
      player.disguised = true;
      pieces.destroy(hit.owner);
      audio.click();
      hud.flash('Hi-vis and a hard hat: you look like you work here');
      return null;
    }
    return 'E — put on the hi-vis vest and hard hat';
  }
  if (hit?.owner?.tag !== 'extinguisher' || hit.owner.state !== 'static') return null;
  const ext = tools.find((t) => t.id === 'extinguisher');
  if (!ext) return null;
  if (input.pressed('KeyE')) {
    ext.refill();
    pieces.destroy(hit.owner);
    audio.click();
    hud.flash('A full extinguisher');
    return null;
  }
  return ext.charge < 0.98 ? 'E — take the extinguisher' : 'A spare extinguisher (yours is still full)';
}
const _look = new THREE.Vector3();
const _spectacle = new THREE.Vector3(0, 30, -4);

function tipFor(t) {
  if (!t) return '';
  if (t.id === 'spray') return `Colour: ${t.colourName} — right click to change`;
  if (t.id === 'bomb') return `${t.left} charges · ${t.placed.length} placed — left click to place, right click to detonate`;
  if (t.id === 'extinguisher') {
    const pct = Math.round(t.charge * 100);
    if (t.charge <= 0) return 'Empty — find another: red ones hang by the lifts on some floors';
    return `${pct}%${fire.count ? ' — hold left click on the fire' : ''}`;
  }
  return '';
}

// Let the loading screen paint. A hidden tab never runs requestAnimationFrame,
// so there it falls back to a message, or loading would wait forever.
const frames = (n) => new Promise((r) => {
  if (document.hidden) { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); return; }
  let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f);
});

if (import.meta.env.DEV) {
  window.dev = { renderer, scene, camera, lights, world, pieces, physics, input, post, player, damage, structure, fire, blast, chips, rubble, people, particles, audio, ctx, water, smoke, powder, security, traffic, get tools() { return tools; }, start, measure, impacts, lift, quality, topple,
    get state() { return state; }, set state(s) { state = s; },
    get rig() { return rig; }, set rig(r) { rig = r; },
    // Run whole frames by hand, for a tab that is not on screen.
    step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); }, select,
    // The collapse bench (dev/bench.js): charges, a collapse, frame times.
    bench: (o) => import('./dev/bench.js').then((m) => m.bench(window.dev, o)) };
}

const timer = new Timer();

// Frames per second, top right, so a slow machine can be told apart from a
// slow game.
const fpsEl = document.getElementById('fps');
let fpsAcc = 0, fpsN = 0;
function fpsMeter(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc < 0.5) return;
  if (fpsEl) fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps · ${quality.label}`;
  fpsAcc = 0; fpsN = 0;
}
function animate() {
  requestAnimationFrame(animate);
  if (import.meta.env.DEV && window.dev?.manual) return;     // the bench is driving the frames
  timer.update();
  const dt = timer.getDelta();
  // Only a frame that was really drawn on screen says anything about speed.
  if (state === 'play') quality.sample(dt);
  fpsMeter(dt);
  // Up to a tenth of a second per frame. It was a twentieth, so below 20 fps the
  // whole game ran in slow motion — falling, walking, collapsing all floated.
  frame(Math.min(dt, 0.1));
}
openMenu();
animate();

// ?bench: run the collapse bench straight away, and post what it found to the
// dev server, which writes it to bench/latest.json (vite.config.js).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('bench')) {
  const q = new URLSearchParams(location.search);
  const opts = { quality: +(q.get('quality') ?? 1), secs: +(q.get('secs') ?? 60), profile: q.has('profile') };
  // Only on screen: a hidden tab is throttled, and a bench started there ran
  // slowly on even after it was brought forward. So it waits to be seen.
  const note = document.createElement('div');
  note.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99;padding:8px 12px;background:#000c;color:#fff;font:13px system-ui;border-radius:6px';
  document.body.appendChild(note);
  const visible = () => new Promise((ok) => { if (!document.hidden) return ok(); note.textContent = 'Collapse bench: waiting for this tab to be on screen…'; const f = () => { if (!document.hidden) { removeEventListener('visibilitychange', f); ok(); } }; addEventListener('visibilitychange', f); });
  visible().then(() => { note.textContent = 'Collapse bench running — keep this tab in front (about a minute)…'; return window.dev.bench(opts); }).then((r) => {
    note.textContent = `Collapse bench done: ${r.pass ? 'PASS' : 'FAIL'} · lowest ${r.minFps} fps · average ${r.avgFps} fps — written to bench/latest.json`;
    const { frames, ...rest } = r;
    const slim = frames.map((f) => ({ t: +f.t.toFixed(3), ms: +(f.dt * 1000).toFixed(1), flying: f.flying, bodies: f.bodies, cpu: f.cpu }));
    return fetch('/__bench', { method: 'POST', body: JSON.stringify({ ...rest, frames: slim, when: new Date().toISOString() }) });
  }).catch((e) => fetch('/__bench', { method: 'POST', body: JSON.stringify({ error: String(e.stack || e) }) }));
}
