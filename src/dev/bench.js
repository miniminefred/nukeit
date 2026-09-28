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
// A hidden tab never runs requestAnimationFrame, and the bench says so rather
// than measuring nothing.

// Where the charges go on the reference demolition: the west wall of the core
// and the column line beside it. What they break, the chain reaction spreads.
export const REFERENCE = [[-5, 0], [-4.4, 3.3], [-5, 7], [-5, -7], [-5, 11.6], [-5, -11.6], [-9.5, 3.5], [-9.5, -3.5]];

// On the far pavement of the avenue, looking up at the tower's front and its
// west side, where it falls.
const VIEW = { at: [8, 1.2, 46], look: [-22, 16, 0] };

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
  if (document.hidden) return { error: 'the tab is hidden: requestAnimationFrame does not run, so nothing can be measured' };
  if (quality !== null) dev.quality.set(quality);
  await dev.start('trump', ['bomb', 'sledge']);
  const { pieces, player, input } = dev;
  dev.state = 'play';
  input.mouse.locked = true;
  // Stand across the avenue, looking at the tower.
  const [x, y, z] = view.at, [lx, ly, lz] = view.look;
  player.teleport(x, y, z);
  player.yaw = Math.atan2(-(lx - x), -(lz - z));
  player.pitch = Math.atan2(ly - (y + 1.62), Math.hypot(lx - x, lz - z));
  dev.select(0);
  document.getElementById('begin')?.classList.remove('open');

  // Place the charges on the supports nearest each point, on the face toward it.
  const bomb = dev.tools.find((t) => t.id === 'bomb');
  const supports = pieces.list.filter((p) => p.floor === 0 && (p.role === 'column' || p.role === 'core') && p.state === 'static');
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
  const tower = pieces.list.filter((p) => p.state === 'static' && p.box.min.y > 4.2);
  const before = tower.length;

  // Let it settle for a second, then detonate as the right mouse button does.
  const frames = [];
  const prof = profile ? instrument(dev) : null;
  let last = performance.now(), t = 0, fired = false, quietFor = 0, tipAt = -1, breakAt = -1;
  const busy = () => dev.topple.active || dev.structure.collapsing || dev.rubble.active || dev.physics.dynamic.size > 0 ||
    dev.structure.warnings.length || dev.structure.checks.length || dev.structure.sagging.length || bomb._chain.length;
  await new Promise((done) => {
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
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
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  prof?.undo();
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
  for (const p of tower) { const k = p.state === 'dead' ? `dead ${p.role}` : p.state; fate[k] = (fate[k] ?? 0) + 1; }
  const minFps = Math.min(...windows.map((w) => w.fps));
  const height = dev.measure();
  return {
    pass: minFps >= 30 && hanging === 0 && inAir === 0 && height < 10,
    minFps,
    worstFrameMs: +(worst.dt * 1000).toFixed(1),
    worstAt: +worst.t.toFixed(2),
    avgFps: +(frames.length / frames.reduce((a, f) => a + f.dt, 0)).toFixed(1),
    seconds: +t.toFixed(1),
    tippedAt: +tipAt.toFixed(2),
    brokeAt: +breakAt.toFixed(2),
    height: +height.toFixed(1),
    hanging, inAir, standingAboveBefore: before, fate, standingAbove, rubble,
    quality: dev.quality.label,
    canvas: `${dev.renderer.domElement.width}x${dev.renderer.domElement.height}`,
    slow: windows.filter((w) => w.fps < 30),
    frames,
    windows,
  };
}
