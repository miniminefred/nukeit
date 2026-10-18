import * as THREE from 'three';
import { chargeModel } from '../tools/viewmodels.js';
import { unsupported } from '../building/support.js';
import { job as jobById } from '../data/catalog.js';
import { groundAt } from '../building/plan.js';

// The collapse bench: an automated, repeatable test of the thing the game is
// for. It loads Trump Tower, puts remote charges on a set of ground-floor
// supports, stands you across the avenue looking at the tower, fires them, and
// watches the real frame loop until everything has come down and stopped.
//
// It measures frames as they are really drawn — the time between one
// requestAnimationFrame and the next, in a tab that is on screen — and reports
// the frame rate over each half second, the way the counter in the corner does,
// and the single worst frame. Then it checks the building: nothing standing may
// be left without support, nothing may still be in the air, and the tower must
// be below the job's target height.
//
//   await dev.bench()                          // the reference demolition
//   await dev.bench({ charges: [...], secs })  // charges: [[x, z], ...] on the ground floor
//
// A hidden tab never runs requestAnimationFrame. There the bench drives the
// frames itself and times each one as the larger of its CPU time and its GPU
// time (WebGL2 timer queries), and never less than a 60 Hz vsync: the time
// the frame would have taken on screen, with the CPU and GPU working in
// parallel as they do. `mode` says which way a run was measured. Chrome runs
// a hidden tab's page at low priority — physics measured 20 ms there against
// 5 on screen, drawing 41 against 4 — so a hidden run is only a sketch, and
// never counts as a pass.

// The reference demolition: twelve charges, the detonator's dozen, on storey
// 6, the tower's first storey above the podium — the whole north column line,
// the ends of the next, and the core's north and side walls. That is the
// fewest that fell it: with ten, the weight is still over what is left. It
// tips north, crushes the storey it stood on, and goes over the podium's edge
// into the office block behind, which comes down too. The podium stands.
export const REFERENCE = [[-13.6, -8.6, 6], [-9.5, -8.6, 6], [-5, -8.6, 6], [0, -8.6, 6], [5, -8.6, 6], [9.6, -8.6, 6],
  [-13.6, -3.5, 6], [-9.5, -3.5, 6], [9.6, -3.5, 6], [0, -3.6, 6], [-5.2, -1, 6], [5.2, -1, 6]];

// Held over the avenue to the south-east, 42 m up — the avenue is the one
// clear line of sight in the city — framing the whole tower, top to street,
// and the office block behind it that it falls into.
const VIEW = { at: [34, 42, 36], look: [-2, 20, -16] };

// Every system's share of a frame, in milliseconds of CPU, when `profile` is on.
const SYSTEMS = [['physics', 'step'], ['pieces', 'sync'], ['topple', 'update'], ['rubble', 'update'], ['structure', 'update'],
  ['impacts', 'update'], ['damage', 'update'], ['fire', 'update'], ['blast', 'update'], ['chips', 'update'], ['particles', 'update'],
  ['player', 'update'], ['audio', 'update']];

function instrument(dev) {
  const cost = {};
  const undo = [];
  for (const [name, fn] of [...SYSTEMS, ['post.composer', 'render']]) {
    const o = name.split('.').reduce((a, k) => a[k], dev);
    const f = o[fn];
    const key = name === 'post.composer' ? 'render' : name;
    o[fn] = function (...a) { const t = performance.now(); const r = f.apply(this, a); cost[key] = (cost[key] ?? 0) + performance.now() - t; return r; };
    undo.push(() => { o[fn] = f; });
  }
  return { cost, undo: () => undo.forEach((u) => u()) };
}

// A seeded Math.random, so that two runs of a collapse are nearly the same
// collapse and their timings can be compared. (Nearly: work paced by the clock
// still falls on different frames.)
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function bench(dev, { seed = null, ...opts } = {}) {
  if (seed === null) return run(dev, opts);
  const random = Math.random;
  Math.random = seeded(seed);
  try { return await run(dev, opts); } finally { Math.random = random; }
}

async function run(dev, { charges = REFERENCE, secs = 40, view = VIEW, quality = null, profile = false } = {}) {
  if (quality !== null) dev.quality.set(quality);
  await dev.start('trump', ['bomb', 'sledge']);
  const { pieces, player, input } = dev;
  dev.state = 'play';
  input.mouse.locked = true;
  // You stand safely across the avenue; the camera is held where it sees it all.
  player.teleport(10, 0.05, 44);
  dev.rig = { at: new THREE.Vector3(...view.at), look: new THREE.Vector3(...view.look) };
  dev.select(0);
  document.getElementById('begin')?.classList.remove('open');

  const bomb = place(dev, charges);
  const tower = pieces.list.filter((p) => p.state === 'static' && p.box.min.y > 4.2);
  const before = tower.length;

  // Let it settle for a second, then detonate as the right mouse button does.
  const frames = [];
  const prof = profile ? instrument(dev) : null;
  let last = performance.now(), t = 0, fired = false, quietFor = 0, tipAt = -1, breakAt = -1;
  const busy = () => dev.topple.active || dev.structure.collapsing || dev.rubble.active || dev.physics.dynamic.size > 0 ||
    dev.structure.warnings.length || dev.structure.checks.length || dev.structure.sagging.length || bomb._chain.length;
  const hidden = document.hidden;
  const gpu = hidden ? gpuTimer(dev.renderer) : null;
  if (hidden) dev.manual = true;
  await new Promise((done) => {
    const ch = new MessageChannel();
    const next = hidden ? () => ch.port2.postMessage(0) : () => requestAnimationFrame(tick);
    let dtNext = 1 / 60;
    const tick = () => {
      let dt;
      if (hidden) {
        // One frame, by hand, timed.
        const c0 = performance.now();
        gpu?.begin();
        dev.step(dtNext, 1);
        gpu?.end();
        const cpu = performance.now() - c0;
        dt = Math.max(cpu, gpu?.last ?? 0, 1000 / 60) / 1000;
        dtNext = Math.min(dt, 0.1);
      } else {
        const now = performance.now();
        dt = (now - last) / 1000;
        last = now;
      }
      t += dt;
      if (fired) {
        const cpu = prof ? Object.fromEntries(Object.entries(prof.cost).map(([k, v]) => [k, +v.toFixed(2)])) : undefined;
        if (prof) for (const k in prof.cost) prof.cost[k] = 0;
        frames.push({ t, dt, fps: 1 / dt, cpu, flying: dev.rubble.flying.length, bodies: dev.physics.dynamic.size, calls: dev.renderer.info.render.calls, tris: dev.renderer.info.render.triangles });
        if (dev.topple.active && tipAt < 0) tipAt = t;
        if (tipAt >= 0 && !dev.topple.active && breakAt < 0) breakAt = t;
        quietFor = busy() ? 0 : quietFor + dt;
      } else if (t > 1) {
        if (prof) for (const k in prof.cost) prof.cost[k] = 0;
        fired = true;
        t = 0;
        bomb._chain = bomb.placed.splice(0);
        bomb._t = 0.25;
      }
      if (fired && ((t > 6 && quietFor > 2) || t > secs)) return done();
      next();
    };
    ch.port1.onmessage = tick;
    next();
  });
  dev.manual = false;

  prof?.undo();
  dev.rig = null;
  // Half-second windows, as the counter reads.
  const windows = [];
  let acc = 0, n = 0, w0 = 0;
  for (const f of frames) {
    acc += f.dt; n++;
    if (acc >= 0.5) { windows.push({ t: +w0.toFixed(1), fps: +(n / acc).toFixed(1) }); w0 = f.t; acc = 0; n = 0; }
  }
  const worst = frames.reduce((a, b) => (b.dt > a.dt ? b : a), frames[0]);
  const L = pieces.list;
  const hanging = unsupported(L).length;
  const inAir = L.filter((p) => p.state === 'flying' || p.state === 'tipping' || p.state === 'falling').length;
  const standingAbove = L.filter((p) => p.state === 'static' && p.box.min.y > 4.2).length;
  const rubble = L.filter((p) => p.state === 'rubble').length;
  // What became of the tower: every piece of it should be lying somewhere as
  // rubble, apart from glass (which bursts) and small bits (which fade).
  const fate = {};
  for (const p of tower) { const k = p.state === 'dead' ? (p.brokeUp ? 'broken into chunks' : `dead ${p.role}`) : p.state; fate[k] = (fate[k] ?? 0) + 1; }
  const floating = floaters(dev);
  const heap = pile(dev);
  const minFps = Math.min(...windows.map((w) => w.fps));
  const height = dev.measure();
  return {
    pass: !hidden && minFps >= 30 && hanging === 0 && inAir === 0 && floating.length === 0 && height < jobById('trump').target,
    minFps,
    worstFrameMs: +(worst.dt * 1000).toFixed(1),
    worstAt: +worst.t.toFixed(2),
    avgFps: +(frames.length / frames.reduce((a, f) => a + f.dt, 0)).toFixed(1),
    seconds: +t.toFixed(1),
    tippedAt: +tipAt.toFixed(2),
    brokeAt: +breakAt.toFixed(2),
    broke: dev.topple.lastBreak ?? null,
    height: +height.toFixed(1),
    pile: heap,
    hanging, inAir, floating: floating.length, floatingList: floating.slice(0, 30), standingAboveBefore: before, fate, standingAbove, rubble,
    quality: dev.quality.label,
    mode: hidden ? `hidden tab: max(CPU, GPU${gpu ? '' : ' unavailable'}) per frame` : 'on screen: requestAnimationFrame',
    canvas: `${dev.renderer.domElement.width}x${dev.renderer.domElement.height}`,
    slow: windows.filter((w) => w.fps < 30),
    frames,
    windows,
  };
}

// The physical test for hanging, for everything that has to lie on something:
// rubble, and the wreckage a break leaves standing (stubs, bars, the edges of
// panes). Is there something within a hand's breadth under it? The building's
// own pieces span between supports, and unsupported() is their test.
const WRECKAGE = new Set(['stub', 'rebar', 'shard', 'fragment']);

export function floaters(dev) {
  const floating = [];
  for (const p of dev.pieces.list) {
    if (!(p.state === 'rubble' || (p.state === 'static' && WRECKAGE.has(p.role))) || p.box.min.y < groundAt((p.box.min.x + p.box.max.x) / 2, (p.box.min.z + p.box.max.z) / 2) + 0.3) continue;
    // How far its own underside is above what is under it, at the closest of
    // nine columns across it: the same measure rubble lands by.
    const gap = dev.rubble._gap(p);
    if (gap > 0.15) {
      const a = p.anchored ? ` anchored on ${p.anchored.on}/${p.anchored.state} gap ${p.anchored.gap}` : '';
      floating.push(`${p.role} f${p.floor} ${p.state} y${p.box.min.y.toFixed(1)} gap ${gap === Infinity ? 'inf' : gap.toFixed(2)} on ${p.restOn ? `${p.restOn.role}/${p.restOn.state}` : '-'}${a}`);
    }
  }
  return floating;
}

// The pile the tower left: how much of it there is, how far it spreads, how
// high it stands. Heights are the top of the rubble in each square metre.
export function pile(dev) {
  const cells = new Map();
  let n = 0, volume = 0, tons = 0;
  for (const p of dev.pieces.list) {
    if (p.state !== 'rubble') continue;
    n++;
    volume += p.volume;
    tons += p.volume * p.kind.density / 1000;
    const b = p.box;
    for (let x = Math.floor(b.min.x); x <= Math.floor(b.max.x); x++)
      for (let z = Math.floor(b.min.z); z <= Math.floor(b.max.z); z++) {
        const k = x * 10007 + z;
        cells.set(k, Math.max(cells.get(k) ?? 0, b.max.y));
      }
  }
  const h = [...cells.values()].sort((a, b) => a - b);
  const at = (q) => +(h[Math.floor(q * (h.length - 1))] ?? 0).toFixed(1);
  return { pieces: n, volume: Math.round(volume), tonnes: Math.round(tons), area: h.length, mean: +(h.reduce((a, b) => a + b, 0) / Math.max(1, h.length)).toFixed(2), p50: at(0.5), p90: at(0.9), max: at(1) };
}

// Put charges on the tower's supports nearest each [x, z, storey], on the
// face toward it, a metre up, as you would with the detonator in your hand.
function place(dev, charges) {
  const bomb = dev.tools.find((t) => t.id === 'bomb');
  const V = new THREE.Vector3();
  for (const [cx, cz, floor = 0] of charges) {
    const supports = dev.pieces.list.filter((p) => p.floor === floor && p.building === 'tower' && (p.role === 'column' || p.role === 'core') && p.state === 'static');
    const y = supports.reduce((a, p) => Math.min(a, p.box.min.y), Infinity) + 1.2;
    const want = new THREE.Vector3(cx, y, cz);
    const p = supports.reduce((a, b) => (b.box.distanceToPoint(want) < a.box.distanceToPoint(want) ? b : a));
    const at = p.box.clampPoint(want, new THREE.Vector3());
    at.y = y;
    const normal = want.clone().sub(p.box.getCenter(V)).setY(0).normalize();
    const mesh = chargeModel();
    mesh.position.copy(at).addScaledVector(normal, 0.025);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    dev.scene.add(mesh);
    bomb.placed.push({ mesh, at });
  }
  return bomb;
}

// Which way does a set of charges bring it down, if at all? Simulation only,
// nothing drawn, 30 frames a simulated second: for choosing a demolition.
export async function trial(dev, charges, secs = 30) {
  await dev.start('trump', ['bomb', 'sledge']);
  dev.state = 'play';
  dev.input.mouse.locked = true;
  dev.player.teleport(10, 0.05, 44);
  dev.topple.lastTip = null;
  dev.topple.lastBreak = null;
  const bomb = place(dev, charges);
  bomb._chain = bomb.placed.splice(0);
  bomb._t = 0.1;
  const render = dev.post.composer.render;
  dev.post.composer.render = () => {};
  let t = 0, down = -1;
  try {
    for (; t < secs; t += 1 / 30) {
      dev.step(1 / 30, 1);
      if (down < 0 && dev.measure() < jobById('trump').target) down = t;
      if (down >= 0 && t > down + 4 && !dev.rubble.active && !dev.topple.active && !dev.structure.collapsing) break;
    }
  } finally { dev.post.composer.render = render; }
  return { charges: charges.length, tip: dev.topple.lastTip, broke: dev.topple.lastBreak, downAt: +down.toFixed(1), height: +dev.measure().toFixed(1), pile: pile(dev) };
}

// GPU time per frame, from WebGL2 timer queries. Results come back a frame or
// two late; `last` is the most recent one.
function gpuTimer(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pending = [];
  const t = { last: 0 };
  t.begin = () => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); pending.push(q); };
  t.end = () => {
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) t.last = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
    }
  };
  return t;
}
