import { buildCity } from './scenery/city.js';
import { Pieces } from './building/pieces.js';
import { link } from './building/support.js';

// The world: a city that is scenery, and one job site in the middle of it made
// of pieces you can break.
//
// The city is built once. The building is built when a job starts and thrown
// away when you leave, so taking the job again gives it back to you standing.

export function createWorld(scene, physics) {
  buildCity(scene, physics);
  const pieces = new Pieces(scene, physics);

  return {
    pieces,
    physics,

    load(build) {
      pieces.clear();
      const t0 = performance.now();
      build(pieces);
      pieces.finalize();
      link(pieces.list);
      this.buildMs = performance.now() - t0;
      this.count = pieces.list.length;
    },

    unload() { pieces.clear(); },
  };
}
