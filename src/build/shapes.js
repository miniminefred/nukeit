import { VOXEL, MIN_X, MIN_Y, MIN_Z } from '../voxel/constants.js';

// Stamping shapes into the world field, in metres.
//
// A box [x0, x1) covers every voxel whose centre lies inside it, so two boxes
// that share an edge never overlap and never leave a gap.

const lo = (a, min) => Math.round((a - min) / VOXEL);

export function box(field, x0, y0, z0, x1, y1, z1, m) {
  field.fill(
    lo(x0, MIN_X), lo(y0, MIN_Y), lo(z0, MIN_Z),
    lo(x1, MIN_X) - 1, lo(y1, MIN_Y) - 1, lo(z1, MIN_Z) - 1,
    m,
  );
}

// Upright cylinder: centre (cx, cz), radius r, from y0 to y1.
export function cylinder(field, cx, y0, cz, r, y1, m) {
  const i0 = lo(cx - r, MIN_X), i1 = lo(cx + r, MIN_X);
  const k0 = lo(cz - r, MIN_Z), k1 = lo(cz + r, MIN_Z);
  const j0 = lo(y0, MIN_Y), j1 = lo(y1, MIN_Y) - 1;
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const x = MIN_X + (i + 0.5) * VOXEL - cx, z = MIN_Z + (k + 0.5) * VOXEL - cz;
      if (x * x + z * z > r * r) continue;
      for (let j = j0; j <= j1; j++) field.set(i, j, k, m);
    }
}

// Ball, optionally lumpy — `rough` in [0, 1) takes bites out of the edge, which
// is what turns a sphere of leaves into a tree crown.
export function ball(field, cx, cy, cz, r, m, rough = 0) {
  const i0 = lo(cx - r, MIN_X), i1 = lo(cx + r, MIN_X);
  const j0 = lo(cy - r, MIN_Y), j1 = lo(cy + r, MIN_Y);
  const k0 = lo(cz - r, MIN_Z), k1 = lo(cz + r, MIN_Z);
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++)
      for (let k = k0; k <= k1; k++) {
        const x = MIN_X + (i + 0.5) * VOXEL - cx;
        const y = MIN_Y + (j + 0.5) * VOXEL - cy;
        const z = MIN_Z + (k + 0.5) * VOXEL - cz;
        const d = Math.sqrt(x * x + y * y + z * z) / r;
        if (d > 1 - rough * hash(i, j, k)) continue;
        field.set(i, j, k, m);
      }
}

// Stable per-voxel noise in [0, 1).
export function hash(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A 5x7 pixel font, just the letters a sign needs.
const FONT = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

// Letters on a wall facing +z: centred on x = cx, bottom at y, standing in the
// voxel layer at z. `px` is the size of one font pixel in metres.
export function signZ(field, text, cx, y, z, px, m) {
  const cols = text.length * 6 - 1;
  const x0 = cx - (cols * px) / 2;
  for (let n = 0; n < text.length; n++) {
    const g = FONT[text[n]] ?? FONT[' '];
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 5; col++) {
        if (g[row][col] !== '#') continue;
        const x = x0 + (n * 6 + col) * px;
        const yy = y + (6 - row) * px;
        box(field, x, yy, z, x + px, yy + px, z + VOXEL, m);
      }
  }
}
