import { encode, decode } from './csg-wire.js';
import { fractureGeometry } from './cutter.js';

// Breaking things in the background.
//
// Splitting a column into eight rough lumps is seven CSG evaluations, about
// 26 ms, and a chain reaction breaks dozens of columns and slabs in a few
// seconds. Done on the main thread, every one of those was a dropped frame. So
// the splitting happens in a few workers, and the lumps take the piece's place
// a frame or two later. A blow you strike yourself still cuts at once
// (damage.js `_bite`, `_chunk`); it is only breaking apart that waits.

const POOL = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 2));
let workers = null;
let next = 1;
const waiting = new Map();

function pool() {
  if (workers !== null) return workers;
  workers = [];
  try {
    for (let i = 0; i < POOL; i++) {
      const w = new Worker(new URL('./csg.worker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = ({ data }) => {
        w.busy--;
        const job = waiting.get(data.id);
        if (!job) return;
        waiting.delete(data.id);
        if (data.error) return job.reject(new Error(data.error));
        job.resolve(data.bits.map((b) => ({ geometry: decode(b), materials: b.slots.map((s) => job.all[s]) })));
      };
      w.onerror = (e) => { console.warn('csg worker failed', e.message); };
      workers.push(w);
    }
  } catch (e) {
    console.warn('no csg workers, breaking on the main thread', e);
    workers = [];
  }
  return workers;
}

// Split `geometry` into up to 2^passes lumps. Resolves to [{ geometry, materials }].
export function fractureAsync(geometry, materials, inside, passes, detail) {
  const ws = pool();
  if (!ws.length) return Promise.resolve(fractureGeometry(geometry, materials, inside, passes, detail));
  const all = [...materials];
  if (!all.includes(inside)) all.push(inside);
  const w = ws.reduce((a, b) => (b.busy < a.busy ? b : a));
  const id = next++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, all });
    w.busy++;
    const g = encode(geometry);
    w.postMessage({ id, geometry: g, count: all.length, inside: all.indexOf(inside), passes, detail },
      Object.values(g.attributes).map((a) => a.buffer));
  });
}

// Jobs still out, for a job being unloaded: their answers are thrown away.
export function forgetJobs() { waiting.clear(); }
