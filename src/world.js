import { buildCity } from './scenery/city.js';
import { Pieces } from './building/pieces.js';
import { link } from './building/support.js';
import { buildBlock } from './building/block.js';

// The world: a city that is scenery, and one job site in the middle of it made
// of pieces you can break.
//
// The city is built once. The building is built when a job starts and thrown
// away when you leave, so taking the job again gives it back to you standing.

export function createWorld(scene, physics) {
  const city = buildCity(scene, physics);
  const pieces = new Pieces(scene, physics);
  const woken = [];

  return {
    pieces,
    physics,
    blocks: city.blocks,

    // A city block becomes a building of pieces: the box goes, and in its
    // place a frame, a core, floors and a curtain wall of its size.
    wakeBlock(b) {
      if (b.built) return null;
      b.built = true;
      b.mesh.visible = false;
      if (b.collider) { physics.removeCollider(b.collider); b.collider = null; }
      const storeys = Math.max(2, Math.round(b.h / 3.6));
      const added = this.addBuilding((P) => buildBlock(P, {
        x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2,
        storeys, h: b.h / storeys, building: `block${b.id}`, tint: b.tint,
      }), `block${b.id}:`);
      woken.push(b);
      // Rapier's queries see new colliders only once it has stepped.
      physics.world.step(physics.events);
      this.onWake?.(b, added);
      return added;
    },

    // Wake every block within `r` of a point, or overlapping a box.
    wakeNear(at, r) {
      let n = 0;
      for (const b of city.blocks) {
        if (b.built) continue;
        const dx = Math.max(0, Math.abs(at.x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(at.z - b.z) - b.d / 2);
        const dy = Math.max(0, at.y - b.h);
        if (Math.hypot(dx, dy, dz) < r) { this.wakeBlock(b); n++; }
      }
      return n;
    },
    wakeIn(box) {
      for (const b of city.blocks) {
        if (b.built) continue;
        if (b.x + b.w / 2 < box.min.x || b.x - b.w / 2 > box.max.x || b.z + b.d / 2 < box.min.z || b.z - b.d / 2 > box.max.z || box.min.y > b.h) continue;
        this.wakeBlock(b);
      }
    },

    load(build) {
      pieces.clear();
      const t0 = performance.now();
      build(pieces);
      pieces.finalize();
      link(pieces.list);
      this.buildMs = performance.now() - t0;
      this.count = pieces.list.length;
    },

    // A building added to the job while it runs: built, batched and linked on
    // its own. Returns its pieces.
    addBuilding(build, tag) {
      const n = pieces.list.length;
      build(pieces);
      const added = pieces.list.slice(n);
      pieces.finalize(added, tag);
      link(added);
      return added;
    },

    unload() {
      pieces.clear();
      // The city stands again, as boxes.
      for (const b of woken) { b.built = false; b.mesh.visible = true; b.solid(); }
      woken.length = 0;
    },
  };
}
