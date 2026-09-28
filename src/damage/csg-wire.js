import * as THREE from 'three';

// A geometry as plain arrays, to post to and from the CSG worker.
// `slots`: for a result, the material slot of each of its groups.

const NAMES = ['position', 'normal', 'uv'];

export function encode(g, slots = null) {
  const attributes = {};
  for (const n of NAMES) if (g.attributes[n]) attributes[n] = g.attributes[n].array.slice();
  if (g.index) attributes.index = g.index.array.slice();
  return { attributes, groups: g.groups.map((r) => ({ start: r.start, count: r.count, materialIndex: r.materialIndex })), slots };
}

export function decode(o) {
  const g = new THREE.BufferGeometry();
  const a = o.attributes;
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  if (a.normal) g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
  if (a.uv) g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  if (a.index) g.setIndex(new THREE.BufferAttribute(a.index, 1));
  for (const r of o.groups) g.addGroup(r.start, r.count, r.materialIndex);
  return g;
}
