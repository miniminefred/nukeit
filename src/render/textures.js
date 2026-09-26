import * as THREE from 'three';

// Procedural surface textures, painted into canvases at startup.
//
// Each surface gets a colour map and a height field, and the height field is
// turned into a normal map, so light rakes across the grain of a desk or the
// pits in a concrete column instead of lying flat on it. Everything is tileable
// and meant to be mapped at a fixed number of metres per repeat (see
// render/geometry.js, which writes UVs in metres).

const SIZE = 512;

// ---------------------------------------------------------------- noise

function makeNoise(seed) {
  const p = new Uint8Array(512);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  // Tileable value in [-1, 1] with period `per` cells.
  return (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X0 = ((xi % per) + per) % per, Y0 = ((yi % per) + per) % per;
    const X1 = (X0 + 1) % per, Y1 = (Y0 + 1) % per;
    const u = fade(xf), v = fade(yf);
    const a = grad(p[p[X0] + Y0], xf, yf), b = grad(p[p[X1] + Y0], xf - 1, yf);
    const c = grad(p[p[X0] + Y1], xf, yf - 1), d = grad(p[p[X1] + Y1], xf - 1, yf - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.4;
  };
}

// Fractal noise in [-1, 1] over the unit square, tileable.
function fbm(noise, u, v, base, octaves) {
  let sum = 0, amp = 1, norm = 0, f = base;
  for (let o = 0; o < octaves; o++) {
    sum += noise(u * f, v * f, f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- painting

function paint(fn, seed) {
  const noise = makeNoise(seed);
  const colour = new Uint8ClampedArray(SIZE * SIZE * 4);
  const height = new Float32Array(SIZE * SIZE);
  const rough = new Uint8ClampedArray(SIZE * SIZE * 4);
  const out = { r: 0, g: 0, b: 0, h: 0, rough: 0.8 };
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      fn(x / SIZE, y / SIZE, noise, out);
      const n = y * SIZE + x;
      colour[n * 4] = out.r; colour[n * 4 + 1] = out.g; colour[n * 4 + 2] = out.b; colour[n * 4 + 3] = 255;
      height[n] = out.h;
      const r = out.rough * 255;
      rough[n * 4] = r; rough[n * 4 + 1] = r; rough[n * 4 + 2] = r; rough[n * 4 + 3] = 255;
    }
  return { colour, height, rough };
}

function toTexture(data, srgb) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  c.getContext('2d').putImageData(new ImageData(data, SIZE, SIZE), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function normalFrom(height, strength) {
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const at = (x, y) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const n = (y * SIZE + x) * 4;
      out[n] = (-dx / l * 0.5 + 0.5) * 255;
      out[n + 1] = (dy / l * 0.5 + 0.5) * 255;
      out[n + 2] = (1 / l * 0.5 + 0.5) * 255;
      out[n + 3] = 255;
    }
  return out;
}

function set(out, r, g, b, h, rough) {
  out.r = r; out.g = g; out.b = b; out.h = h; out.rough = rough;
}

// ---------------------------------------------------------------- surfaces

const SURFACES = {
  concrete: (u, v, n, o) => {
    const big = fbm(n, u, v, 4, 4), fine = fbm(n, u, v, 32, 3);
    const pit = fbm(n, u + 7.3, v, 48, 2) > 0.62 ? -0.25 : 0;
    const t = 165 + big * 14 + fine * 7 + pit * 20;
    set(o, t, t - 2, t - 6, big * 0.2 + fine * 0.15 + pit, 0.9 - fine * 0.05);
  },
  broken: (u, v, n, o) => {        // the inside of concrete: aggregate
    const f = fbm(n, u, v, 16, 4), s = fbm(n, u + 3, v, 64, 2);
    const stone = f > 0.2 ? 30 : 0;
    const t = 150 + f * 30 + s * 25 - stone;
    set(o, t + stone * 0.4, t, t - 10, f * 1.6 + s, 0.95);
  },
  marble: (u, v, n, o) => {        // Breccia Pernice: cloudy peach-pink, a few fine veins
    const w = fbm(n, u, v, 2, 5);
    const vein = Math.abs(Math.sin((u * 2 + v * 1.3 + w * 1.6) * Math.PI * 2));
    const fine = Math.pow(1 - vein, 60);                      // thin, rare
    const cloud = fbm(n, u, v, 5, 4), mottle = fbm(n, u + 3, v, 18, 2);
    const t = cloud * 0.6 + mottle * 0.25;
    set(o, 222 + t * 18 - fine * 55, 182 + t * 16 - fine * 55, 164 + t * 14 - fine * 50, -fine * 0.1, 0.16 + fine * 0.15);
  },
  wood: (u, v, n, o) => {          // veneer, grain along u
    const w = fbm(n, u, v, 2, 4);
    const ring = Math.sin((v * 24 + w * 5 + fbm(n, u, v, 8, 2) * 0.8) * Math.PI);
    const fibre = fbm(n, u * 0.25, v * 8, 16, 2);
    const t = 0.55 + ring * 0.12 + fibre * 0.12;
    set(o, 150 * t + 45, 96 * t + 25, 55 * t + 12, ring * 0.3 + fibre * 0.5, 0.55);
  },
  rawwood: (u, v, n, o) => {       // split timber, fibrous and pale
    const fibre = fbm(n, u * 0.15, v * 12, 16, 3);
    const t = 0.8 + fibre * 0.25;
    set(o, 205 * t, 165 * t, 115 * t, fibre * 2, 0.9);
  },
  plaster: (u, v, n, o) => {
    const f = fbm(n, u, v, 16, 3), g = fbm(n, u, v, 4, 2);
    const t = 228 + f * 6 + g * 5;
    set(o, t, t - 3, t - 9, f * 0.25, 0.92);
  },
  gypsum: (u, v, n, o) => {
    const f = fbm(n, u, v, 32, 3);
    const t = 238 + f * 12;
    set(o, t, t, t - 4, f * 1.2, 1);
  },
  carpet: (u, v, n, o) => {
    const f = fbm(n, u, v, 64, 2), g = fbm(n, u, v, 6, 3);
    const loop = (Math.sin(u * SIZE * 0.9) * Math.sin(v * SIZE * 0.9)) * 0.5;
    set(o, 72 + f * 18 + g * 8, 70 + f * 18 + g * 8, 84 + f * 20 + g * 8, f * 0.6 + loop * 0.4, 1);
  },
  fabric: (u, v, n, o) => {
    const weave = (Math.sin(u * SIZE * 1.6) + Math.sin(v * SIZE * 1.6)) * 0.25;
    const f = fbm(n, u, v, 16, 2);
    set(o, 60 + f * 10 + weave * 12, 62 + f * 10 + weave * 12, 78 + f * 12 + weave * 12, weave, 1);
  },
  leather: (u, v, n, o) => {       // mid-tone, so a tint can make it cream or oxblood
    const f = fbm(n, u, v, 24, 4);
    set(o, 196 + f * 14, 188 + f * 13, 180 + f * 12, f * 1.2, 0.5);
  },
  metal: (u, v, n, o) => {         // brushed
    const b = fbm(n, u * 0.05, v * 6, 64, 2);
    const t = 150 + b * 20;
    set(o, t, t, t + 4, b * 0.2, 0.35 + b * 0.1);
  },
  brass: (u, v, n, o) => {
    const b = fbm(n, u * 0.05, v * 6, 64, 2);
    set(o, 212 + b * 20, 168 + b * 16, 84 + b * 10, b * 0.1, 0.28 + b * 0.06);
  },
  bronze: (u, v, n, o) => {
    const b = fbm(n, u * 0.05, v * 6, 32, 2);
    set(o, 92 + b * 10, 72 + b * 8, 50 + b * 6, 0, 0.4);
  },
  plastic: (u, v, n, o) => {
    const f = fbm(n, u, v, 32, 2);
    set(o, 40 + f * 4, 40 + f * 4, 44 + f * 4, f * 0.1, 0.45);
  },
  soil: (u, v, n, o) => {
    const f = fbm(n, u, v, 12, 4);
    set(o, 78 + f * 20, 58 + f * 15, 40 + f * 10, f, 1);
  },
  leaves: (u, v, n, o) => {
    const f = fbm(n, u, v, 20, 3), g = fbm(n, u, v, 6, 2);
    set(o, 52 + f * 20, 92 + f * 30 + g * 20, 38 + f * 12, f, 0.8);
  },
  asphalt: (u, v, n, o) => {
    const f = fbm(n, u, v, 48, 2), g = fbm(n, u, v, 4, 3);
    const t = 52 + f * 12 + g * 8;
    set(o, t, t, t + 2, f * 0.6, 0.95);
  },
  paving: (u, v, n, o) => {
    const f = fbm(n, u, v, 16, 3);
    const joint = (u * 4) % 1 < 0.015 || (v * 4) % 1 < 0.015 ? -1 : 0;
    const t = 160 + f * 14 + joint * 50;
    set(o, t, t - 3, t - 8, joint * 0.8 + f * 0.2, 0.9);
  },
  roofing: (u, v, n, o) => {
    const f = fbm(n, u, v, 24, 3);
    const t = 70 + f * 14;
    set(o, t, t, t, f * 0.4, 0.95);
  },
};

// Normal-map strength per surface: how much its height field stands out.
const RELIEF = { concrete: 1.2, broken: 5, wood: 1.5, rawwood: 6, carpet: 4, fabric: 3, soil: 4, leaves: 4, gypsum: 5, asphalt: 3, paving: 4, roofing: 3, leather: 3 };

const cache = new Map();

// { map, normalMap, roughnessMap } for a surface name.
export function surface(name) {
  if (cache.has(name)) return cache.get(name);
  const fn = SURFACES[name];
  if (!fn) throw new Error(`no surface called ${name}`);
  let seed = 7;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const { colour, height, rough } = paint(fn, seed + 1);
  const maps = {
    map: toTexture(colour, true),
    normalMap: toTexture(normalFrom(height, RELIEF[name] ?? 1), false),
    roughnessMap: toTexture(rough, false),
  };
  cache.set(name, maps);
  return maps;
}
