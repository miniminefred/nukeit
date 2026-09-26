import { NX, NZ, LAYER, VOXEL, MIN_X, MIN_Y, MIN_Z } from '../voxel/constants.js';
import { AIR, HARDNESS, EXPLODES } from '../voxel/materials.js';
import { findLoose } from '../voxel/support.js';
import { Collapse } from './collapse.js';
import { Fire } from './fire.js';

// The one place matter stops existing.
//
// Every tool, every fire and every explosion removes voxels through here, which
// is what lets one support pass a frame see every hole made that frame, however
// it was made. Whatever the pass finds with nothing under it goes one of two
// ways: small pieces become debris, anything bigger becomes a falling body.

const SMALL = 1500;          // voxels: below this a loose piece breaks up in the air

export class Destruction {
  constructor(scene, world, { particles, debris, audio, shake }) {
    this.world = world;
    this.particles = particles;
    this.debris = debris;
    this.audio = audio;
    this.shake = shake;
    this.player = null;
    this.removed = [];
    this.queue = [];                 // explosions waiting to go off
    this.stats = { removed: 0, explosions: 0, burnt: 0 };
    this.collapse = new Collapse(scene, world, {
      particles, audio,
      shake: (a) => shake?.add(a * 0.6),
      onCrush: (i, j, k, m) => {
        this.removed.push(i + NX * (k + NZ * j));
        if (EXPLODES[m] > 0) this._queue(MIN_X + (i + 0.5) * VOXEL, MIN_Y + (j + 0.5) * VOXEL, MIN_Z + (k + 0.5) * VOXEL, EXPLODES[m], 0.1);
      },
    });
    this.fire = new Fire(scene, world, { particles, destruction: this, audio });
  }

  // Take one voxel out. Returns what was there.
  remove(i, j, k) {
    const f = this.world.field;
    const m = f.set(i, j, k, AIR);
    if (m !== AIR) {
      this.removed.push(i + NX * (k + NZ * j));
      this.stats.removed++;
    }
    return m;
  }

  // Take a ball out of the world. A material's hardness shrinks the ball for
  // it: a blow that shatters a pane of glass only chips the concrete beside it.
  //
  // Returns { count, material } — how much went, and the hardest thing hit.
  carve(x, y, z, r, power, { chips = 0, fling = 0 } = {}) {
    const f = this.world.field;
    const ci = (x - MIN_X) / VOXEL, cj = (y - MIN_Y) / VOXEL, ck = (z - MIN_Z) / VOXEL;
    const R = r / VOXEL;
    const i0 = Math.floor(ci - R), i1 = Math.floor(ci + R);
    const j0 = Math.max(0, Math.floor(cj - R)), j1 = Math.floor(cj + R);
    const k0 = Math.floor(ck - R), k1 = Math.floor(ck + R);
    let count = 0, hardest = AIR, hardestH = -1;
    const flung = [];
    for (let j = j0; j <= j1; j++)
      for (let k = k0; k <= k1; k++)
        for (let i = i0; i <= i1; i++) {
          const m = f.get(i, j, k);
          if (m === AIR) continue;
          const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj, k + 0.5 - ck);
          const reach = R * Math.min(1, power / HARDNESS[m]);
          if (d > reach) continue;
          if (HARDNESS[m] > hardestH) { hardestH = HARDNESS[m]; hardest = m; }
          if (EXPLODES[m] > 0) { this.detonate(i, j, k); continue; }
          const paint = f.getPaint(i, j, k);
          this.remove(i, j, k);
          count++;
          if (fling > 0 && Math.random() < fling) flung.push(i, j, k, m | (paint << 5));
          else if (chips > 0 && Math.random() < chips) flung.push(i, j, k, -(m | (paint << 5)) - 1);
        }
    // What flies off: chips from a blow fade, chunks from a blast may settle.
    for (let n = 0; n < flung.length; n += 4) {
      const i = flung[n], j = flung[n + 1], k = flung[n + 2];
      let c = flung[n + 3];
      const chip = c < 0;
      if (chip) c = -c - 1;
      const px = MIN_X + (i + 0.5) * VOXEL, py = MIN_Y + (j + 0.5) * VOXEL, pz = MIN_Z + (k + 0.5) * VOXEL;
      let dx = px - x, dy = py - y, dz = pz - z;
      const l = Math.hypot(dx, dy, dz) || 1;
      const s = chip ? 2 + Math.random() * 3 : 6 + Math.random() * 14;
      dx = dx / l * s + (Math.random() - 0.5) * 2; dy = dy / l * s + Math.random() * 3; dz = dz / l * s + (Math.random() - 0.5) * 2;
      this.debris.spawn(px, py, pz, dx, dy, dz, c, chip ? VOXEL * 0.6 : VOXEL, !chip && Math.random() < 0.4);
    }
    return { count, material: hardest };
  }

  // Something explosive was hit, burnt or crushed: find the whole object it
  // belongs to, take it out, and set it off a moment later.
  detonate(i, j, k) {
    const f = this.world.field;
    const m0 = f.get(i, j, k);
    if (EXPLODES[m0] <= 0) return;
    const stack = [[i, j, k]];
    const seen = new Set([i + NX * (k + NZ * j)]);
    let sx = 0, sy = 0, sz = 0, n = 0, radius = 0;
    while (stack.length && n < 4000) {
      const [a, b, c] = stack.pop();
      const m = f.get(a, b, c);
      if (EXPLODES[m] <= 0) continue;
      radius = Math.max(radius, EXPLODES[m]);
      this.remove(a, b, c);
      this.fire.cells.delete(a + NX * (c + NZ * b));
      this.fire.heating.delete(a + NX * (c + NZ * b));
      sx += a; sy += b; sz += c; n++;
      for (const [da, db, dc] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const p = (a + da) + NX * ((c + dc) + NZ * (b + db));
        if (seen.has(p)) continue;
        seen.add(p);
        if (EXPLODES[f.get(a + da, b + db, c + dc)] > 0) stack.push([a + da, b + db, c + dc]);
      }
    }
    if (n === 0) return;
    const x = MIN_X + (sx / n + 0.5) * VOXEL, y = MIN_Y + (sy / n + 0.5) * VOXEL, z = MIN_Z + (sz / n + 0.5) * VOXEL;
    this._queue(x, y, z, radius, 0.05 + Math.random() * 0.2);
  }

  _queue(x, y, z, r, delay) {
    this.queue.push({ x, y, z, r, t: delay });
  }

  // A blast: a big carve that ignores hardness, a fireball, fire left behind,
  // and a pressure wave that hurts. Also what a bomb calls.
  explode(x, y, z, r) {
    this.stats.explosions++;
    const p = this.particles;
    this.carve(x, y, z, r, 8, { fling: 0.03, chips: 0.02 });
    p.spawn('flash', x, y, z);
    p.burst('flame', x, y, z, 70, r * 3, undefined, 2);
    p.burst('spark', x, y, z, 90, r * 6, undefined, 3);
    p.burst('smoke', x, y, z, 40, r * 1.2, undefined, 1.5);
    p.burst('dust', x, y, z, 50, r * 2);
    this.fire.igniteSphere(x, y, z, r * 1.5, 0.3);
    this.audio?.explosion(x, y, z, r);
    const pl = this.player;
    if (pl) {
      const d = Math.hypot(pl.pos.x - x, pl.pos.y + 0.9 - y, pl.pos.z - z);
      if (d < r * 2.5) pl.damage(130 * (1 - d / (r * 2.5)), 'explosion');
      this.shake?.add(Math.max(0, 1.2 - d / (r * 8)));
    }
  }

  update(dt, eye) {
    // Explosions whose fuse is up. Taken out of the queue first, because one
    // going off can add more.
    if (this.queue.length) {
      const due = [];
      this.queue = this.queue.filter((e) => ((e.t -= dt) > 0 ? true : (due.push(e), false)));
      for (const e of due) this.explode(e.x, e.y, e.z, e.r);
    }

    this.fire.update(dt, this.player ? this.player.pos : { x: 1e9, y: 0, z: 1e9 });
    this.collapse.update(dt, eye);

    if (this.removed.length) {
      const removed = this.removed;
      this.removed = [];
      const pieces = findLoose(this.world.field, removed);
      for (const piece of pieces) {
        if (piece.length < SMALL) this._breakUp(piece);
        else this.collapse.drop(piece);
      }
    }
  }

  // A loose piece too small to be worth simulating whole: it breaks up as it
  // falls, and some of it lands as rubble.
  _breakUp(piece) {
    const f = this.world.field;
    const keep = Math.min(1, 300 / piece.length);
    for (const p of piece) {
      const j = (p / LAYER) | 0, r = p - j * LAYER, k = (r / NX) | 0, i = r - k * NX;
      const m = f.get(i, j, k);
      const paint = f.getPaint(i, j, k);
      f.set(i, j, k, AIR);
      if (m === AIR || Math.random() > keep) continue;
      this.debris.spawn(
        MIN_X + (i + 0.5) * VOXEL, MIN_Y + (j + 0.5) * VOXEL, MIN_Z + (k + 0.5) * VOXEL,
        (Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5,
        m | (paint << 5), VOXEL, Math.random() < 0.6,
      );
    }
  }

  // Falling building at a world point, for the player's crush check.
  bodyAt(x, y, z) { return this.collapse.solidAt(x, y, z); }

  clear() {
    this.collapse.clear();
    this.fire.clear();
    this.removed.length = 0;
    this.queue.length = 0;
    this.stats = { removed: 0, explosions: 0, burnt: 0 };
  }
}
