import * as THREE from 'three';

// The material table. Every voxel is one byte, and that byte is an index here.
//
//   hardness     how much a blow takes out of it: the sledge's bite radius is
//                divided by this, so glass shatters wide and steel barely dents
//   structural   whether it carries load. Concrete and steel hold a building
//                up; glass, drywall, furniture and rubble are held up by it.
//                See voxel/support.js.
//   burns        seconds it takes to burn away once alight, or 0 if it cannot
//   explodes     blast radius in metres if it goes off, or 0

export const AIR = 0;

const TABLE = [
  // name          colour     hardness structural burns explodes
  ['air',          '#000000', 0,   false, 0,  0],
  ['concrete',     '#a9a49b', 2.2, true,  0,  0],
  ['steel',        '#4b4239', 4.0, true,  0,  0],
  ['glass',        '#2c2a26', 0.5, false, 0,  0],
  ['drywall',      '#d9d4c8', 0.7, false, 9,  0],
  ['wood',         '#7a5230', 1.0, false, 14, 0],
  ['carpet',       '#5b4a44', 0.8, false, 8,  0],
  ['marble',       '#caa194', 2.0, true,  0,  0],
  ['brass',        '#c9a043', 3.0, false, 0,  0],
  ['rubble',       '#8d877d', 1.0, false, 0,  0],
  ['foliage',      '#3f6b2f', 0.5, false, 6,  0],
  ['soil',         '#5a4431', 1.0, false, 0,  0],
  ['gastank',      '#b8322a', 1.5, false, 0,  3.5],
  ['transformer',  '#6d7468', 2.5, false, 0,  5.0],
  ['spandrel',     '#1d1b18', 1.5, true,  0,  0],
  ['fabric',       '#394a66', 0.6, false, 5,  0],
  ['roofing',      '#3b3a38', 1.5, true,  0,  0],
];

export const MATERIALS = TABLE.map(([name, colour, hardness, structural, burns, explodes], id) => ({
  id, name, colour, hardness, structural, burns, explodes,
}));

export const M = Object.fromEntries(MATERIALS.map((m) => [m.name.toUpperCase(), m.id]));

const N = MATERIALS.length;
export const HARDNESS = new Float32Array(N);
export const STRUCTURAL = new Uint8Array(N);
export const BURNS = new Float32Array(N);
export const EXPLODES = new Float32Array(N);
for (const m of MATERIALS) {
  HARDNESS[m.id] = m.hardness;
  STRUCTURAL[m.id] = m.structural ? 1 : 0;
  BURNS[m.id] = m.burns;
  EXPLODES[m.id] = m.explodes;
}

// Spray paint colours. Index 0 means unpainted.
export const PAINTS = ['', '#d8262b', '#f2c12e', '#2f7fe0', '#39b54a', '#f0f0f0', '#e0529c', '#111111'];

// Vertex colours are linear, so the sRGB colours above are converted once here.
// Row c of the palette is material (c & 31) under paint (c >> 5).
export const PALETTE = new Float32Array(256 * 3);
{
  const col = new THREE.Color();
  for (let c = 0; c < 256; c++) {
    const mat = c & 31, paint = c >> 5;
    if (mat >= N) continue;
    col.set(paint ? PAINTS[paint] : MATERIALS[mat].colour);
    // A painted surface keeps a little of what is underneath, so a spray over
    // glass still reads as glass.
    if (paint) col.lerp(new THREE.Color(MATERIALS[mat].colour), 0.15);
    col.convertSRGBToLinear();
    PALETTE[c * 3] = col.r;
    PALETTE[c * 3 + 1] = col.g;
    PALETTE[c * 3 + 2] = col.b;
  }
}
