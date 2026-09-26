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
  marble:      { surf: 'marble', repeat: 3, density: 2700, toughness: 18, structural: true, inside: 'broken', sound: 'marble', metal: 0, rough: 1 },
  glass:       { density: 2500, toughness: 0.4, sound: 'glass' },
  bronze:      { surf: 'bronze', repeat: 1, density: 2700, toughness: 40, metal: 0.6, sound: 'mullion' },
  steel:       { surf: 'metal', repeat: 1, density: 7800, toughness: 60, structural: true, metal: 0.8, sound: 'steel' },
  metal:       { surf: 'metal', repeat: 1, density: 1200, toughness: 6, metal: 0.7, sound: 'steel' },
  brass:       { surf: 'brass', repeat: 1, density: 8500, toughness: 40, metal: 1, sound: 'brass' },
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
};

export const KIND = {};
const _mats = new Map();

function build(name, def, surf) {
  if (name === 'glass') {
    return new THREE.MeshStandardMaterial({
      color: 0x6b5238, metalness: 0.9, roughness: 0.04,
      transparent: true, opacity: 0.5, envMapIntensity: 1.4, depthWrite: false,
      side: THREE.DoubleSide,
    });
  }
  if (name === 'lamp') {
    return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 });
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
  if (def.emissive) { m.emissive = new THREE.Color(def.emissive); m.emissiveIntensity = 1; }
  return m;
}

for (const [name, def] of Object.entries(KINDS)) {
  KIND[name] = {
    name,
    density: def.density,
    toughness: def.toughness,
    structural: !!def.structural,
    burns: def.burns ?? 0,
    explodes: def.explodes ?? 0,
    splinters: !!def.splinters,
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
