import { CHUNK, CHUNK_SHIFT, VOXEL } from './constants.js';
import { AIR, PALETTE } from './materials.js';

// Chunk mesher: greedy face merging with per-corner ambient occlusion.
//
// Greedy, because a 100 m tower is mostly large flat surfaces — floor slabs,
// glass, walls — and face culling alone would put several million triangles on
// screen. Two faces merge only when they have the same colour *and* the same
// occlusion at all four corners, so the darkening into every corner and crater
// survives the merge; it is only the flat middle of a surface that collapses
// into a few big quads.
//
// Pure function over a Field: no Three.js in here beyond the palette.

const P = CHUNK + 2;                 // padded edge: one voxel of neighbour each side
const PP = P * P;
const pad = new Uint8Array(P * P * P);    // colour id (material | paint << 5), 0 = air
const mask = new Int32Array(CHUNK * CHUNK);
const AO_CURVE = [0.42, 0.62, 0.8, 1.0];

const pidx = (x, y, z) => (x + 1) + (z + 1) * P + (y + 1) * PP;

function fillPad(field, ci, cj, ck) {
  const bx = ci << CHUNK_SHIFT, by = cj << CHUNK_SHIFT, bz = ck << CHUNK_SHIFT;
  const c = field.chunks[field.slot(ci, cj, ck)];
  // The chunk itself, read straight out of its arrays.
  for (let y = 0; y < CHUNK; y++)
    for (let z = 0; z < CHUNK; z++) {
      const row = (z << CHUNK_SHIFT) | (y << (2 * CHUNK_SHIFT));
      let p = pidx(0, y, z);
      for (let x = 0; x < CHUNK; x++, p++) {
        const m = c.mat[row | x];
        pad[p] = m === AIR ? 0 : (m | ((c.paint ? c.paint[row | x] : 0) << 5));
      }
    }
  // The one-voxel shell around it, through the field.
  for (let y = -1; y <= CHUNK; y++)
    for (let z = -1; z <= CHUNK; z++)
      for (let x = -1; x <= CHUNK; x++) {
        if (x >= 0 && x < CHUNK && y >= 0 && y < CHUNK && z >= 0 && z < CHUNK) continue;
        const m = field.get(bx + x, by + y, bz + z);
        pad[pidx(x, y, z)] = m === AIR ? 0 : m;
      }
}

// Returns { position, normal, color, index } typed arrays, or null if empty.
// Positions are in metres relative to the chunk's corner.
export function meshChunk(field, ci, cj, ck) {
  const c = field.chunks[field.slot(ci, cj, ck)];
  if (c === null || c.solid === 0) return null;
  fillPad(field, ci, cj, ck);

  const pos = [], nor = [], col = [], ind = [];
  const q = [0, 0, 0];
  const du = [0, 0, 0], dv = [0, 0, 0];
  // Stride in the padded array along each axis.
  const stride = [1, PP, P];   // x, y, z

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const sd = stride[d], su = stride[u], sv = stride[v];
    for (let side = 0; side < 2; side++) {
      const dir = side === 0 ? 1 : -1;
      for (let s = 0; s < CHUNK; s++) {
        // Build the mask for this slice.
        let n = 0;
        for (let b = 0; b < CHUNK; b++) {
          for (let a = 0; a < CHUNK; a++, n++) {
            q[d] = s; q[u] = a; q[v] = b;
            const p = pidx(q[0], q[1], q[2]);
            const here = pad[p];
            if (here === 0 || pad[p + dir * sd] !== 0) { mask[n] = 0; continue; }
            // Occlusion, sampled in the air cell the face looks into.
            const o = p + dir * sd;
            const s1 = pad[o - su] !== 0, s2 = pad[o + su] !== 0;
            const t1 = pad[o - sv] !== 0, t2 = pad[o + sv] !== 0;
            const a00 = ao(s1, t1, pad[o - su - sv] !== 0);
            const a10 = ao(s2, t1, pad[o + su - sv] !== 0);
            const a11 = ao(s2, t2, pad[o + su + sv] !== 0);
            const a01 = ao(s1, t2, pad[o - su + sv] !== 0);
            mask[n] = ((here << 8) | (a00 | (a10 << 2) | (a11 << 4) | (a01 << 6))) + 1;
          }
        }
        // Merge rectangles of equal key.
        n = 0;
        for (let b = 0; b < CHUNK; b++) {
          for (let a = 0; a < CHUNK;) {
            const key = mask[n];
            if (key === 0) { a++; n++; continue; }
            let w = 1;
            while (a + w < CHUNK && mask[n + w] === key) w++;
            let h = 1;
            outer: while (b + h < CHUNK) {
              const row = n + h * CHUNK;
              for (let k = 0; k < w; k++) if (mask[row + k] !== key) break outer;
              h++;
            }
            emit(pos, nor, col, ind, key - 1, d, u, v, dir, s, a, b, w, h, du, dv);
            for (let y = 0; y < h; y++) {
              const row = n + y * CHUNK;
              for (let k = 0; k < w; k++) mask[row + k] = 0;
            }
            a += w; n += w;
          }
        }
      }
    }
  }

  if (ind.length === 0) return null;
  const vertCount = pos.length / 3;
  return {
    position: new Float32Array(pos),
    normal: new Int8Array(nor),
    color: new Float32Array(col),
    index: vertCount > 65535 ? new Uint32Array(ind) : new Uint16Array(ind),
  };
}

function ao(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}

function emit(pos, nor, col, ind, key, d, u, v, dir, s, a, b, w, h, du, dv) {
  const colour = key >> 8;
  const aoBits = key & 255;
  const ao0 = AO_CURVE[aoBits & 3], ao1 = AO_CURVE[(aoBits >> 2) & 3];
  const ao2 = AO_CURVE[(aoBits >> 4) & 3], ao3 = AO_CURVE[(aoBits >> 6) & 3];
  const base = pos.length / 3;
  const plane = (dir > 0 ? s + 1 : s) * VOXEL;
  du[0] = du[1] = du[2] = 0; dv[0] = dv[1] = dv[2] = 0;
  du[u] = w * VOXEL; dv[v] = h * VOXEL;
  const x = [0, 0, 0];
  x[d] = plane; x[u] = a * VOXEL; x[v] = b * VOXEL;

  // Corners in order (a,b) (a+w,b) (a+w,b+h) (a,b+h), which is counter-
  // clockwise seen from +d because u x v = d.
  pos.push(
    x[0], x[1], x[2],
    x[0] + du[0], x[1] + du[1], x[2] + du[2],
    x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2],
    x[0] + dv[0], x[1] + dv[1], x[2] + dv[2],
  );
  const nx = d === 0 ? dir : 0, ny = d === 1 ? dir : 0, nz = d === 2 ? dir : 0;
  for (let i = 0; i < 4; i++) nor.push(nx, ny, nz);
  const r = PALETTE[colour * 3], g = PALETTE[colour * 3 + 1], bl = PALETTE[colour * 3 + 2];
  for (const f of [ao0, ao1, ao2, ao3]) col.push(r * f, g * f, bl * f);

  // Split along the diagonal that keeps the occlusion gradient smooth.
  const flip = ao0 + ao2 < ao1 + ao3;
  if (dir > 0) {
    if (flip) ind.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    if (flip) ind.push(base + 1, base + 3, base + 2, base + 1, base, base + 3);
    else ind.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}
