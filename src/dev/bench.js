import * as THREE from 'three';
import { chargeModel } from '../tools/viewmodels.js';
import { unsupported } from '../building/support.js';

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

// Where the charges go on the reference demolition: the west wall of the core
// and the column line beside it. What they break, the chain reaction spreads.
export const REFERENCE = [[-5, 0], [-4.4, 3.3], [-5, 7], [-5, -7], [-5, 11.6], [-5, -11.6], [-9.5, 3.5], [-9.5, -3.5]];

// Held over the far pavement of the avenue, 40 m up — the avenue is the one
// clear line of sight in the city — framing the whole tower, top to street,
// and the ground to the west of it, where it falls.
const VIEW = { at: [-4, 40, 49], look: [-12, 27, 0] };

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

export async function bench(dev, { charges = REFERENCE, secs = 40, view = VIEW, quality = null, profile = false } = {}) {
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
    pass: !hidden && minFps >= 30 && hanging === 0 && inAir === 0 && floating.length === 0 && height < 10,
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
    if (!(p.state === 'rubble' || (p.state === 'static' && WRECKAGE.has(p.role))) || p.box.min.y < 0.3) continue;
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

// Put charges on the ground-floor supports nearest each [x, z], on the face
// toward it, as you would with the detonator in your hand.
function place(dev, charges) {
  const bomb = dev.tools.find((t) => t.id === 'bomb');
  const supports = dev.pieces.list.filter((p) => p.floor === 0 && (p.role === 'column' || p.role === 'core') && p.state === 'static');
  const V = new THREE.Vector3();
  for (const [cx, cz] of charges) {
    const want = new THREE.Vector3(cx, 1.2, cz);
    const p = supports.reduce((a, b) => (b.box.distanceToPoint(want) < a.box.distanceToPoint(want) ? b : a));
    const at = p.box.clampPoint(want, new THREE.Vector3());
    at.y = 1.2;
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
      if (down < 0 && dev.measure() < 10) down = t;
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
