// What holds what up.
//
// Built once from the pieces as they stand: A **rests on** B when A's underside
// sits on B's top (or a lamp **hangs from** the slab above it), and two slab
// bays are **tied** when they share an edge — a floor is one continuous plate
// of concrete, not a row of loose tiles.
//
// A piece stands when it touches the ground, or rests on something standing.
// Two rules make that behave like a building rather than a pile of boxes:
//
//  * **Only structure carries structure.** A slab may rest on a column or a
//    core wall, never on a partition, a pane of glass or a filing cabinet.
//    Anything may rest on structure.
//  * **Cracked things carry less.** A column or slab worn below a quarter of
//    its durability no longer holds structure up.
//  * **Nothing hangs off a chain of non-structure.** A monitor on a desk on a
//    floor is fine; a stack of glass on spandrel on mullion on glass, twenty
//    storeys of it, is not a building. Non-structural things may be at most
//    three steps from real structure. Without this rule the curtain wall held
//    itself up from the first floor after everything behind it had gone.
//  * **Slabs span, but only a little.** A bay keeps standing while anything is
//    still under it, so one lost column leaves it resting on the others. Take
//    away everything under it and it comes down — unless it is small (a
//    sawtooth tooth, a landing) and tied to a neighbour that is still firmly
//    held, by two or more supports of its own.
//
// This is connectivity, not stress: nothing here knows how heavy anything is.

import { groundAt } from './plan.js';

const TOL = 0.06;
const MIN_OVERLAP = 0.005;   // a 2 cm glass rail on a slab edge still counts
const CELL = 2;
const CELL_Y = 2;
const MAX_DEPTH = 3;
const WRECKAGE = new Set(['stub', 'rebar', 'shard', 'fragment']);
const SMALL_BAY = 12;
const GROUND = 0.45;        // m: anything whose foot is this near the ground stands on it — a
                            // column's base is on its foundation, broken floor slab or not
const WEAK = 0.25;          // below this fraction of its durability a support carries nothing       // m^2: a bay this small can cantilever

export function link(pieces) {
  // Cells in three dimensions: in two, every cell of a forty-storey block held
  // all forty storeys, and comparing each piece with all the others in its
  // cell took a quarter of a second. A piece is filed a touching distance
  // beyond its box, so neighbours across a cell boundary still meet.
  const grid = new Map();
  const key = (i, j, k) => (i * 73856093) ^ (j * 83492791) ^ (k * 19349663);
  for (const p of pieces) {
    p.rests = []; p.carries = []; p.sides = [];
    const b = p.box;
    for (let i = Math.floor((b.min.x - TOL) / CELL); i <= Math.floor((b.max.x + TOL) / CELL); i++)
      for (let j = Math.floor((b.min.y - TOL) / CELL_Y); j <= Math.floor((b.max.y + TOL) / CELL_Y); j++)
        for (let k = Math.floor((b.min.z - TOL) / CELL); k <= Math.floor((b.max.z + TOL) / CELL); k++) {
          const kk = key(i, j, k);
          let cell = grid.get(kk);
          if (!cell) grid.set(kk, (cell = []));
          cell.push(p);
        }
  }
  const seen = new Set();
  for (const cell of grid.values()) {
    for (let a = 0; a < cell.length; a++)
      for (let b = a + 1; b < cell.length; b++) {
        const A = cell[a], B = cell[b];
        const pk = A.id < B.id ? A.id * 1e6 + B.id : B.id * 1e6 + A.id;
        if (seen.has(pk)) continue;
        seen.add(pk);
        relate(A, B);
        relate(B, A);
      }
  }
}

function overlapXZ(A, B, m) {
  return A.box.max.x - B.box.min.x > m && B.box.max.x - A.box.min.x > m &&
         A.box.max.z - B.box.min.z > m && B.box.max.z - A.box.min.z > m;
}

function relate(A, B) {
  const a = A.box, b = B.box;
  if (overlapXZ(A, B, MIN_OVERLAP)) {
    // A's bottom at B's top, or just inside it.
    if (a.min.y > b.min.y + TOL && a.min.y <= b.max.y + TOL && a.max.y > b.max.y) {
      A.rests.push(B);
      B.carries.push(A);
    }
    if (A.hang && Math.abs(a.max.y - b.min.y) < TOL) {
      A.rests.push(B);
      B.carries.push(A);
    }
  }
  // Cladding is fixed to whatever it is pressed against — stone blocks to the
  // wall behind them, a mirror fascia to a slab edge — and not to other cladding.
  if (A.role === 'cladding' && B.role !== 'cladding' && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > 0.05) {
    const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x), oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    const faceZ = ox > 0.05 && (Math.abs(a.min.z - b.max.z) < TOL || Math.abs(a.max.z - b.min.z) < TOL);
    const faceX = oz > 0.05 && (Math.abs(a.min.x - b.max.x) < TOL || Math.abs(a.max.x - b.min.x) < TOL);
    if ((faceZ || faceX) && !A.rests.includes(B)) { A.rests.push(B); B.carries.push(A); }
  }
  // Slab bays tied edge to edge.
  if (A.lateral && B.lateral && A.id < B.id && Math.abs(a.min.y - b.min.y) < TOL) {
    const touchX = (Math.abs(a.max.x - b.min.x) < TOL || Math.abs(b.max.x - a.min.x) < TOL) &&
      Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 0.3;
    const touchZ = (Math.abs(a.max.z - b.min.z) < TOL || Math.abs(b.max.z - a.min.z) < TOL) &&
      Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 0.3;
    const overlap = overlapXZ(A, B, 0.02) && Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 0.2;
    if (touchX || touchZ || overlap) {
      A.sides.push(B);
      B.sides.push(A);
    }
  }
}

// Its foot is on the ground there: the street, or the floor of the pit under
// the podium.
export const onGround = (p) => p.box.min.y < groundAt((p.box.min.x + p.box.max.x) / 2, (p.box.min.z + p.box.max.z) / 2) + GROUND;

// Which standing pieces have lost their support. `pieces` must be the full
// list; dead and moving ones are ignored.
export function unsupported(pieces) {
  // Wreckage made after the building was linked — stubs, rebar, shards left in
  // a frame, rubble — lies where it is and is not part of the load path. Left
  // in, the stubs of a row of broken columns counted as a hundred floating
  // pieces and set off a collapse of their own.
  const standing = pieces.filter((p) => p.state === 'static' && !WRECKAGE.has(p.role));
  standing.sort((a, b) => a.box.min.y - b.box.min.y);
  for (const p of standing) { p.sup = false; p.direct = false; p.depth = 99; }

  // A support worn down to a quarter of its durability is too cracked to carry
  // structure: it may still stand, but the slab on it no longer counts it.
  const sound = (q) => q.hpMax === null || q.hp > q.hpMax * WEAK;
  const holds = (p, q) => q.state === 'static' && q.sup && (p.structural ? q.structural && sound(q) : q.depth < MAX_DEPTH);
  // How many non-structural steps a piece is from structure, once it stands.
  const depthOf = (p) => {
    if (p.structural) return 0;
    let d = 99;
    for (const q of p.rests) if (holds(p, q) && q.depth + 1 < d) d = q.depth + 1;
    return onGround(p) ? 1 : d;
  };

  let n = 0;
  while (n < standing.length) {
    // One layer at a time: everything whose underside is at about this height.
    const y = standing[n].box.min.y;
    let m = n;
    while (m < standing.length && standing[m].box.min.y < y + 0.05) m++;
    for (let i = n; i < m; i++) {
      const p = standing[i];
      if (p.hang) continue;
      let n = 0;
      for (const q of p.rests) if (holds(p, q)) n++;
      p.held = n;
      if (onGround(p) || n > 0) { p.sup = true; p.direct = true; p.depth = depthOf(p); }
    }
    // Small bays cantilever off a firmly held neighbour.
    for (let i = n; i < m; i++) {
      const p = standing[i];
      if (p.sup || !p.lateral) continue;
      const s = p.box;
      if ((s.max.x - s.min.x) * (s.max.z - s.min.z) > SMALL_BAY) continue;
      if (p.sides.some((q) => q.state === 'static' && q.direct && q.held >= 2)) { p.sup = true; p.depth = 0; }
    }
    n = m;
  }
  // Lamps last: what they hang from is above them.
  for (const p of standing) {
    if (p.hang) { p.sup = p.rests.some((q) => q.state === 'static' && q.sup); p.depth = 1; }
  }
  return standing.filter((p) => !p.sup);
}
