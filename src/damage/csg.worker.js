import * as THREE from 'three';
import { fractureGeometry } from './cutter.js';
import { decode, encode } from './csg-wire.js';

// Breaking things, off the main thread. Materials cannot cross into a worker,
// so they travel as slot numbers: a stand-in material per slot here, and the
// result's groups say which slot each face is in.

const slots = [];
const slot = (i) => (slots[i] ??= Object.assign(new THREE.MeshBasicMaterial(), { slot: i }));

self.onmessage = ({ data }) => {
  const { id, geometry, count, inside, passes, detail } = data;
  try {
    const mats = Array.from({ length: count }, (_, i) => slot(i));
    const bits = fractureGeometry(decode(geometry), mats, slot(inside), passes, detail);
    const out = bits.map((b) => encode(b.geometry, b.materials.map((m) => m.slot)));
    const transfer = [];
    for (const o of out) for (const a of Object.values(o.attributes)) transfer.push(a.buffer);
    self.postMessage({ id, bits: out }, transfer);
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
