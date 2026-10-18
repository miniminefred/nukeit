import * as THREE from 'three';
import { surface } from './textures.js';

// What things are made of.
//
// Each kind has a look (a PBR material over a procedural surface), and the
// numbers the game runs on:
//
//   density     kg per cubic metre, for how bodies fall and how hard they hit
//   toughness   how much a blow has to put into a cubic metre of it before a
//               chunk comes away. Glass and plaster give easily; concrete
//               barely notices a sledge; steel does not notice it at all.
//   structural  whether it carries load: concrete, steel and marble hold the
//               building up, everything else is held up by them
//   burns       seconds a burning piece of it lasts, or 0 if it does not burn
//   explodes    blast radius in metres, or 0
//   inside      the surface a cut exposes: split timber, aggregate, gypsum
//   splinters   whether a blow leaves splinters standing out of the break
//   sound       which impact sound it makes
//
// `repeat` is metres per texture tile.

const KINDS = {
  concrete:    { surf: 'concrete', repeat: 2.5, density: 2400, toughness: 22, structural: true, inside: 'broken', sound: 'concrete' },
  marble:      { indoor: 0.45, surf: 'marble', repeat: 3, density: 2700, toughness: 18, structural: true, inside: 'broken', sound: 'marble', metal: 0, rough: 1 },
  darkmarble:  { indoor: 0.45, surf: 'darkmarble', repeat: 2.2, density: 2700, toughness: 18, structural: true, inside: 'broken', sound: 'marble', metal: 0, rough: 1 },
  creammarble: { indoor: 0.45, surf: 'creammarble', repeat: 3.5, density: 2700, toughness: 18, structural: true, inside: 'broken', sound: 'marble', metal: 0, rough: 1 },
  mirror:      { indoor: 0.6, surf: 'mirror', repeat: 1, density: 2500, toughness: 0.4, metal: 1, rough: 1, tint: 0xf0dcc0, sound: 'glass' },
  tiles:       { indoor: 0.3, surf: 'tiles', repeat: 0.8, density: 2200, toughness: 1.6, inside: 'gypsum', metal: 0, rough: 1, sound: 'glass' },
  flag:        { surf: 'flag', repeat: 1, density: 300, toughness: 0.4, burns: 6, inside: 'fabric', sound: 'drywall' },
  glass:       { glass: true, density: 2500, toughness: 0.4, sound: 'glass' },
  clearglass:  { glass: true, density: 2500, toughness: 0.4, sound: 'glass' },
  bronze:      { surf: 'bronze', repeat: 1, density: 2700, toughness: 40, metal: 0.6, sound: 'mullion' },
  steel:       { surf: 'metal', repeat: 1, density: 7800, toughness: 60, structural: true, metal: 0.8, sound: 'steel' },
  metal:       { surf: 'metal', repeat: 1, density: 1200, toughness: 6, metal: 0.7, sound: 'steel' },
  brass:       { indoor: 0.5, surf: 'brass', repeat: 1, density: 8500, toughness: 40, metal: 1, sound: 'brass' },
  wood:        { surf: 'wood', repeat: 1.2, density: 700, toughness: 2.2, burns: 30, inside: 'rawwood', splinters: true, sound: 'wood' },
  plaster:     { surf: 'plaster', repeat: 2, density: 900, toughness: 0.9, burns: 60, inside: 'gypsum', sound: 'drywall' },
  carpet:      { surf: 'carpet', repeat: 1.5, density: 400, toughness: 0.6, burns: 12, inside: 'carpet', sound: 'drywall' },
  fabric:      { surf: 'fabric', repeat: 0.6, density: 300, toughness: 0.5, burns: 10, inside: 'fabric', sound: 'drywall' },
  leather:     { surf: 'leather', repeat: 0.8, density: 500, toughness: 0.7, burns: 14, inside: 'fabric', sound: 'drywall' },
  plastic:     { surf: 'plastic', repeat: 0.5, density: 950, toughness: 1.2, burns: 16, inside: 'plastic', sound: 'drywall' },
  paper:       { surf: 'plaster', repeat: 0.3, density: 700, toughness: 0.8, burns: 8, inside: 'gypsum', sound: 'drywall' },
  soil:        { surf: 'soil', repeat: 1, density: 1500, toughness: 0.8, inside: 'soil', sound: 'drywall' },
  leaves:      { surf: 'leaves', repeat: 0.7, density: 200, toughness: 0.3, burns: 9, inside: 'leaves', sound: 'drywall' },
  roofing:     { surf: 'roofing', repeat: 2, density: 1800, toughness: 10, structural: true, inside: 'broken', sound: 'concrete' },
  gastank:     { surf: 'metal', repeat: 0.6, density: 600, toughness: 4, explodes: 4, metal: 0.4, tint: 0xc0302a, sound: 'steel' },
  transformer: { surf: 'metal', repeat: 1, density: 3000, toughness: 12, explodes: 6, metal: 0.5, tint: 0x6f7a6c, sound: 'steel' },
  screen:      { surf: 'plastic', repeat: 0.5, density: 900, toughness: 0.8, burns: 12, inside: 'plastic', sound: 'glass', emissive: 0x1c2a3a },
  lamp:        { density: 300, toughness: 0.5, sound: 'glass', light: true },
  // A home and a restaurant need a few things an office does not.
  ceramic:     { indoor: 0.35, surf: 'plaster', repeat: 0.8, density: 2300, toughness: 1.6, inside: 'gypsum', metal: 0, rough: 0.25, sound: 'glass' },
  lacquer:     { indoor: 0.4, surf: 'plastic', repeat: 0.6, density: 700, toughness: 2, burns: 25, inside: 'rawwood', splinters: true, rough: 0.2, tint: 0x0b0b0c, sound: 'wood' },
  linen:       { surf: 'fabric', repeat: 0.5, density: 250, toughness: 0.4, burns: 7, inside: 'fabric', tint: 0xf1ede4, sound: 'drywall' },
  gold:        { indoor: 0.5, surf: 'brass', repeat: 1, density: 12000, toughness: 40, metal: 1, rough: 0.6, tint: 0xffe08a, sound: 'brass' },
};

// How many sledge blows a half-cubic-metre lump of each material takes before
// it gives way. A piece's durability is this, scaled by the cube root of its
// size: a column takes about five, a plaster wall two, a desk one or two, a
// steel beam a dozen. See damage/damage.js.
const HITS = {
  concrete: 3, marble: 3, darkmarble: 3, creammarble: 3, mirror: 0.6, flag: 0.5, tiles: 1.2, roofing: 2.5, steel: 9, bronze: 6, brass: 6, gold: 6, metal: 3,
  wood: 1.5, plaster: 1.2, carpet: 1, fabric: 0.8, leather: 1, plastic: 1, paper: 0.8,
  soil: 1, leaves: 0.5, ceramic: 1.2, lacquer: 1.5, linen: 0.6, gastank: 2, transformer: 5,
  screen: 0.8, lamp: 0.3, glass: 1, clearglass: 1,
};

// What the sun's shadow pass draws batches and instanced meshes with. Three
// draws every caster with one depth material by default, so batched, instanced
// and plain meshes took turns switching its shader program, object by object,
// in every shadow pass. Each kind of mesh gets its own.
export const BATCH_DEPTH = new THREE.MeshDepthMaterial();
export const INSTANCE_DEPTH = new THREE.MeshDepthMaterial();

export const KIND = {};
const _mats = new Map();

// The environment polished indoor things reflect (scene.js makes it). Kinds
// with `indoor` use it, at that strength, instead of the sky.
let _interior = null;
export const interiorEnvironment = () => _interior;
export function setInteriorEnvironment(tex) {
  _interior = tex;
  for (const [name, m] of _mats) if (KINDS[name]?.indoor || name === 'clearglass') { m.envMap = tex; m.needsUpdate = true; }
}

function build(name, def, surf) {
  if (name === 'glass') {
    // The curtain wall: dark bronze mirror glass, as in the photograph.
    return new THREE.MeshStandardMaterial({
      color: 0x30251b, metalness: 0.95, roughness: 0.03,
      transparent: true, opacity: 0.8, envMapIntensity: 1.6, depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  if (name === 'clearglass') {
    // Glass indoors — partitions, balustrades, display cases, doors: clear,
    // a little green at the edges, catching the room.
    const m = new THREE.MeshStandardMaterial({
      color: 0xe6f0ee, metalness: 0.1, roughness: 0.02,
      transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide,
    });
    if (_interior) { m.envMap = _interior; m.envMapIntensity = 1.2; }
    return m;
  }
  if (name === 'lamp') {
    // Warm white: the light of a hotel lobby, not a strip light.
    return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b8, emissiveIntensity: 2.2 });
  }
  const s = surface(surf);
  const tile = (t) => {
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(1 / def.repeat, 1 / def.repeat);
    return c;
  };
  const m = new THREE.MeshStandardMaterial({
    map: tile(s.map),
    normalMap: tile(s.normalMap),
    roughnessMap: tile(s.roughnessMap),
    roughness: def.rough ?? 1,
    metalness: def.metal ?? 0,
    color: def.tint ?? 0xffffff,
  });
  if (def.indoor && _interior) { m.envMap = _interior; m.envMapIntensity = def.indoor; }
  if (def.emissive) { m.emissive = new THREE.Color(def.emissive); m.emissiveIntensity = 1; }
  return m;
}

for (const [name, def] of Object.entries(KINDS)) {
  KIND[name] = {
    name,
    density: def.density,
    toughness: def.toughness,
    structural: !!def.structural,
    glass: !!def.glass,
    burns: def.burns ?? 0,
    explodes: def.explodes ?? 0,
    splinters: !!def.splinters,
    hits: HITS[name] ?? 2,
    metal: (def.metal ?? 0) >= 0.5,
    inside: def.inside ?? null,
    sound: def.sound,
    light: !!def.light,
    get material() {
      if (!_mats.has(name)) _mats.set(name, build(name, def, def.surf));
      return _mats.get(name);
    },
  };
}

// The surface a cut exposes, as a material in its own right.
const _inside = new Map();
export function insideMaterial(kindName) {
  const k = KIND[kindName];
  const surf = k.inside;
  if (!surf) return k.material;
  if (!_inside.has(surf)) {
    const def = KINDS[kindName];
    _inside.set(surf, build(surf, { repeat: def.repeat * 0.6, rough: 1, metal: 0 }, SURFACE_OF[surf] ?? surf));
  }
  return _inside.get(surf);
}

// The inside of some kinds is just more of the same surface.
const SURFACE_OF = { carpet: 'carpet', fabric: 'fabric', plastic: 'plastic', soil: 'soil', leaves: 'leaves' };
