import { NX, NY, NZ, LAYER } from './constants.js';
import { AIR, STRUCTURAL } from './materials.js';

// What is still held up.
//
// Support is connectivity: a voxel stands if a path of solid voxels runs from
// it down to the ground. Two refinements make it behave like a building:
//
//  * **Only structure carries load.** A path to the ground may only pass
//    through structural materials — concrete, steel, marble. Glass, drywall,
//    furniture and rubble are *held up by* structure but never hold anything up
//    themselves, so a curtain wall cannot keep a tower standing after its
//    columns are gone.
//  * **Search lowest-first.** The search always expands the lowest voxel it has
//    found, so from anywhere in a standing building it runs down the nearest
//    column in a few dozen steps. The expensive case — nothing below reaches
//    the ground — happens exactly once per collapse, and then the whole piece
//    has to be visited anyway to be taken out.
//
// Everything the search marks is cleared again before it returns, so no state
// survives between calls.

const VISIT = new Uint8Array(NX * NY * NZ);
const SEEN = 1, GROUNDED = 2, FALLING = 3;

let touched = new Int32Array(1 << 16);
let touchedN = 0;
function touch(p) {
  if (touchedN === touched.length) {
    const t = new Int32Array(touched.length * 2);
    t.set(touched);
    touched = t;
  }
  touched[touchedN++] = p;
}

// Lowest-first queue: one stack per layer.
const buckets = Array.from({ length: NY }, () => []);

const STRUCT_CAP = 3_000_000;   // a search this big is assumed to be grounded
const LOOSE_CAP = 6_000;         // a non-structural piece this big is assumed held

const decode = (p, out) => {
  out[1] = (p / LAYER) | 0;
  const r = p - out[1] * LAYER;
  out[2] = (r / NX) | 0;
  out[0] = r - out[2] * NX;
};
const ijk = [0, 0, 0];

function neighbours(p, fn) {
  decode(p, ijk);
  const [i, j, k] = ijk;
  if (i > 0) fn(p - 1, i - 1, j, k);
  if (i < NX - 1) fn(p + 1, i + 1, j, k);
  if (k > 0) fn(p - NX, i, j, k - 1);
  if (k < NZ - 1) fn(p + NX, i, j, k + 1);
  if (j > 0) fn(p - LAYER, i, j - 1, k);
  if (j < NY - 1) fn(p + LAYER, i, j + 1, k);
}

// Given voxels that just stopped existing (flat indices), return every piece
// that is no longer held up, as arrays of flat indices.
export function findLoose(field, removed) {
  const pieces = [];
  touchedN = 0;

  // Seeds: solid neighbours of what was removed.
  const structSeeds = [], looseSeeds = [];
  for (const p of removed) {
    neighbours(p, (q, i, j, k) => {
      const m = field.get(i, j, k);
      if (m === AIR) return;
      (STRUCTURAL[m] ? structSeeds : looseSeeds).push(q);
    });
  }

  // 1. Structure: does it still reach the ground?
  for (const seed of structSeeds) {
    if (VISIT[seed] !== 0) continue;
    const found = searchStructure(field, seed);
    if (found !== null) {
      attachLoose(field, found);
      pieces.push(found);
    }
  }

  // 2. Things that are not structure: are they still touching some?
  for (const seed of looseSeeds) {
    if (VISIT[seed] !== 0) continue;
    const found = searchLoose(field, seed);
    if (found !== null) pieces.push(found);
  }

  for (let n = 0; n < touchedN; n++) VISIT[touched[n]] = 0;
  touchedN = 0;
  return pieces;
}

function searchStructure(field, seed) {
  const list = [];
  let low = NY, grounded = false;
  const push = (q, j) => {
    VISIT[q] = SEEN; touch(q); list.push(q);
    buckets[j].push(q);
    if (j < low) low = j;
  };
  decode(seed, ijk);
  push(seed, ijk[1]);

  search: while (low < NY) {
    const b = buckets[low];
    if (b.length === 0) { low++; continue; }
    const p = b.pop();
    decode(p, ijk);
    if (ijk[1] === 0) { grounded = true; break; }
    let hit = false;
    neighbours(p, (q, i, j, k) => {
      if (hit) return;
      const v = VISIT[q];
      if (v === GROUNDED) { hit = true; return; }
      if (v !== 0) return;
      const m = field.get(i, j, k);
      if (m === AIR || !STRUCTURAL[m]) return;
      push(q, j);
    });
    if (hit) { grounded = true; break search; }
    if (list.length > STRUCT_CAP) { grounded = true; break; }
  }
  for (let j = 0; j < NY; j++) buckets[j].length = 0;

  const mark = grounded ? GROUNDED : FALLING;
  for (const q of list) VISIT[q] = mark;
  return grounded ? null : list;
}

// A falling piece of structure takes with it the glass, walls and furniture it
// was carrying — but only down to its own lowest floor. Glass below the break is
// hanging from the storey underneath and stays.
function attachLoose(field, list) {
  let minJ = NY;
  for (const p of list) { const j = (p / LAYER) | 0; if (j < minJ) minJ = j; }
  const stack = [];
  const n0 = list.length;
  for (let n = 0; n < n0; n++) {
    neighbours(list[n], (q, i, j, k) => {
      if (VISIT[q] !== 0 || j < minJ) return;
      const m = field.get(i, j, k);
      if (m === AIR || STRUCTURAL[m]) return;
      VISIT[q] = FALLING; touch(q); list.push(q); stack.push(q);
    });
  }
  while (stack.length) {
    const p = stack.pop();
    neighbours(p, (q, i, j, k) => {
      if (VISIT[q] !== 0 || j < minJ) return;
      const m = field.get(i, j, k);
      if (m === AIR || STRUCTURAL[m]) return;
      VISIT[q] = FALLING; touch(q); list.push(q); stack.push(q);
    });
  }
}

function searchLoose(field, seed) {
  const list = [seed];
  VISIT[seed] = SEEN; touch(seed);
  let held = false;
  for (let n = 0; n < list.length && !held; n++) {
    const p = list[n];
    decode(p, ijk);
    if (ijk[1] === 0) { held = true; break; }
    neighbours(p, (q, i, j, k) => {
      if (held) return;
      const v = VISIT[q];
      if (v === GROUNDED) { held = true; return; }
      if (v === FALLING) return;
      if (v !== 0) return;
      const m = field.get(i, j, k);
      if (m === AIR) return;
      if (STRUCTURAL[m]) { held = true; return; }
      VISIT[q] = SEEN; touch(q); list.push(q);
    });
    if (list.length > LOOSE_CAP) held = true;
  }
  const mark = held ? GROUNDED : FALLING;
  for (const q of list) VISIT[q] = mark;
  return held ? null : list;
}
