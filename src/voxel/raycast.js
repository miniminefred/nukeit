import { VOXEL, MIN_X, MIN_Y, MIN_Z } from './constants.js';
import { AIR } from './materials.js';

// Grid traversal (Amanatides & Woo) through the world field: the first solid
// voxel along a ray, and which face of it the ray came in through.
//
// Returns { i, j, k, m, t, nx, ny, nz, x, y, z } or null. (x, y, z) is the
// world point where the ray enters the voxel, t its distance.
export function raycast(field, origin, dir, maxDist) {
  let x = (origin.x - MIN_X) / VOXEL, y = (origin.y - MIN_Y) / VOXEL, z = (origin.z - MIN_Z) / VOXEL;
  let i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = sx !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tdy = sy !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tdz = sz !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tmx = sx > 0 ? (i + 1 - x) * tdx : sx < 0 ? (x - i) * tdx : Infinity;
  let tmy = sy > 0 ? (j + 1 - y) * tdy : sy < 0 ? (y - j) * tdy : Infinity;
  let tmz = sz > 0 ? (k + 1 - z) * tdz : sz < 0 ? (z - k) * tdz : Infinity;
  const max = maxDist / VOXEL;
  let t = 0, nx = 0, ny = 0, nz = 0;

  while (t <= max) {
    const m = field.get(i, j, k);
    if (m !== AIR) {
      const tm = t * VOXEL;
      return {
        i, j, k, m, t: tm, nx, ny, nz,
        x: origin.x + dir.x * tm, y: origin.y + dir.y * tm, z: origin.z + dir.z * tm,
      };
    }
    if (tmx < tmy && tmx < tmz) { i += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { j += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { k += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}
