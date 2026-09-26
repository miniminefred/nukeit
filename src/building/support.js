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
//  * **Nothing hangs off a chain of non-structure.** A monitor on a desk on a
//    floor is fine; a stack of glass on spandrel on mullion on glass, twenty
//    storeys of it, is not a building. Non-structural things may be at most
//    three steps from real structure. Without this rule the curtain wall held
//    itself up from the first floor after everything behind it had gone.
//  * **Slabs span, a little.** A bay with nothing under it still stands if it
//    is tied to a bay that is itself resting on something — up to two bays
//    out. So knocking out one column leaves the floor sagging on its
//    neighbours, and it is losing a whole line of them that brings it down.
//
// This is connectivity, not stress: nothing here knows how heavy anything is.

const TOL = 0.06;
const MIN_OVERLAP = 0.005;   // a 2 cm glass rail on a slab edge still counts
const CELL = 2;
const MAX_DEPTH = 3;

export function link(pieces) {
  const grid = new Map();
  const key = (i, k) => i * 73856093 ^ k * 19349663;
  for (const p of pieces) {
    p.rests = []; p.carries = []; p.sides = [];
    const b = p.box;
    for (let i = Math.floor(b.min.x / CELL); i <= Math.floor(b.max.x / CELL); i++)
      for (let k = Math.floor(b.min.z / CELL); k <= Math.floor(b.max.z / CELL); k++) {
        const kk = key(i, k);
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

// Which standing pieces have lost their support. `pieces` must be the full
// list; dead and moving ones are ignored.
export function unsupported(pieces) {
  const standing = pieces.filter((p) => p.state === 'static');
  standing.sort((a, b) => a.box.min.y - b.box.min.y);
  for (const p of standing) { p.sup = false; p.direct = false; p.depth = 99; }

  const holds = (p, q) => q.state === 'static' && q.sup && (p.structural ? q.structural : q.depth < MAX_DEPTH);
  // How many non-structural steps a piece is from structure, once it stands.
  const depthOf = (p) => {
    if (p.structural) return 0;
    let d = 99;
    for (const q of p.rests) if (holds(p, q) && q.depth + 1 < d) d = q.depth + 1;
    return p.box.min.y < 0.05 ? 1 : d;
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
      if (p.box.min.y < 0.05 || p.rests.some((q) => holds(p, q))) { p.sup = true; p.direct = true; p.depth = depthOf(p); }
    }
    // Spans: two bays out from anything resting directly on support.
    for (let hop = 0; hop < 2; hop++) {
      for (let i = n; i < m; i++) {
        const p = standing[i];
        if (p.sup || !p.lateral) continue;
        if (p.sides.some((q) => q.state === 'static' && q.sup && (hop === 0 ? q.direct : true))) { p.sup = true; p.depth = 0; }
      }
    }
    n = m;
  }
  // Lamps last: what they hang from is above them.
  for (const p of standing) {
    if (p.hang) { p.sup = p.rests.some((q) => q.state === 'static' && q.sup); p.depth = 1; }
  }
  return standing.filter((p) => !p.sup);
}
