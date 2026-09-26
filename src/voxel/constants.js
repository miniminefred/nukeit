// The voxel grid: how big a voxel is, how big a chunk is, and how much of the
// world is made of matter.
//
// Only the job site is voxels. The street, the city around it and the ground
// plane are ordinary meshes, and the ground plane at y = 0 counts as solid
// bedrock for anything standing on it.

export const VOXEL = 0.25;          // metres per voxel edge
export const CHUNK_SHIFT = 5;
export const CHUNK = 1 << CHUNK_SHIFT;   // 32 voxels per chunk edge
export const CHUNK_MASK = CHUNK - 1;

// The matter region, in metres. x and z are centred on the tower, y starts at
// the ground.
export const MIN_X = -32, MAX_X = 32;
export const MIN_Z = -24, MAX_Z = 24;
export const MIN_Y = 0, MAX_Y = 112;

export const NX = Math.round((MAX_X - MIN_X) / VOXEL);   // 256
export const NY = Math.round((MAX_Y - MIN_Y) / VOXEL);   // 448
export const NZ = Math.round((MAX_Z - MIN_Z) / VOXEL);   // 192

export const CX = NX >> CHUNK_SHIFT;
export const CY = NY >> CHUNK_SHIFT;
export const CZ = NZ >> CHUNK_SHIFT;

if (CX * CHUNK !== NX || CY * CHUNK !== NY || CZ * CHUNK !== NZ) {
  throw new Error('voxel region must be a whole number of chunks');
}

// World metres <-> voxel index. Index i covers [wx(i), wx(i) + VOXEL).
export const vx = (x) => Math.floor((x - MIN_X) / VOXEL);
export const vy = (y) => Math.floor((y - MIN_Y) / VOXEL);
export const vz = (z) => Math.floor((z - MIN_Z) / VOXEL);
export const wx = (i) => MIN_X + i * VOXEL;
export const wy = (j) => MIN_Y + j * VOXEL;
export const wz = (k) => MIN_Z + k * VOXEL;

// One flat index for a voxel in the whole region. NX*NY*NZ is 21M, well inside
// what an integer can hold exactly.
export const idx = (i, j, k) => i + NX * (k + NZ * j);
export const LAYER = NX * NZ;
