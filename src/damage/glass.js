import * as THREE from 'three';

// Glass: it cracks, and then it goes.
//
// The first blow draws a spider-web into the pane where it landed — radial
// cracks running out from a crushed white spot, joined by rings — on a canvas
// laid over the glass. A second blow, or a hard one, shatters it: the pane is
// cut into shards along the same kind of web, the ones near the blow fly in
// the direction it was travelling, and some of the ones round the edge stay
// stuck in the frame, which is what a broken window actually looks like.

const _v = new THREE.Vector3();

function paneSize(piece) {
  const s = piece.localBox.getSize(new THREE.Vector3());
  return { w: s.x, h: s.y, t: s.z };
}

// Draw a crack centred at pane-local (u, v) metres.
function drawCrack(ctx, W, H, w, h, u, v, strength) {
  const px = (x) => ((x + w / 2) / w) * W;
  const py = (y) => (1 - (y + h / 2) / h) * H;
  const cx = px(u), cy = py(v);
  const scale = W / w;         // pixels per metre
  const rays = 9 + ((Math.random() * 7) | 0);
  const reach = (0.35 + Math.random() * 0.4) * strength * scale;
  const ends = [];
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineCap = 'round';
  for (let r = 0; r < rays; r++) {
    let a = (r / rays) * Math.PI * 2 + Math.random() * 0.4;
    let x = cx, y = cy;
    const len = reach * (0.5 + Math.random() * 0.8);
    const pts = [[x, y]];
    let d = 0;
    while (d < len) {
      const step = 6 + Math.random() * 14;
      a += (Math.random() - 0.5) * 0.35;
      x += Math.cos(a) * step; y += Math.sin(a) * step;
      d += step;
      pts.push([x, y]);
      // Now and then a branch.
      if (Math.random() < 0.12) {
        const b = a + (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.5);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, y);
        let bx = x, by = y;
        for (let k = 0; k < 4; k++) { bx += Math.cos(b + (Math.random() - 0.5) * 0.4) * 8; by += Math.sin(b + (Math.random() - 0.5) * 0.4) * 8; ctx.lineTo(bx, by); }
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [a1, b1] of pts) ctx.lineTo(a1, b1);
    ctx.stroke();
    ends.push(pts);
  }
  // Rings joining neighbouring rays.
  ctx.lineWidth = 0.9;
  for (const frac of [0.15, 0.35, 0.6]) {
    ctx.beginPath();
    for (let r = 0; r <= rays; r++) {
      const pts = ends[r % rays];
      const [x, y] = pts[Math.min(pts.length - 1, Math.floor(pts.length * frac))];
      if (r === 0) ctx.moveTo(x, y); else ctx.lineTo(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3);
    }
    ctx.stroke();
  }
  // The crushed spot where it hit.
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
}

// `local` is the hit point in the pane's frame.
export function crack(pieces, piece, local, strength = 1) {
  const { w, h, t } = paneSize(piece);
  if (!piece.crack) {
    const obj = pieces.promote(piece);
    const W = 512, H = Math.min(1024, Math.max(64, Math.round((512 * h) / w)));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xdde4e8, opacity: 0.9 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const c = piece.localBox.getCenter(new THREE.Vector3());
    mesh.position.set(c.x, c.y, c.z + t / 2 + 0.002);
    mesh.renderOrder = 4;
    obj.add(mesh);
    piece.crack = { canvas, ctx: canvas.getContext('2d'), tex, mesh, W, H, count: 0 };
  }
  const k = piece.crack;
  const c = piece.localBox.getCenter(_v);
  drawCrack(k.ctx, k.W, k.H, w, h, local.x - c.x, local.y - c.y, strength);
  k.tex.needsUpdate = true;
  k.count++;
}

// Sutherland–Hodgman against the pane rectangle.
function clipRect(poly, x0, y0, x1, y1) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const cut = [
    (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (y0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y0]; },
    (a, b) => { const t = (y1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y1]; },
  ];
  let out = poly;
  for (let e = 0; e < 4; e++) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length];
      const ai = edges[e](a), bi = edges[e](b);
      if (ai && bi) out.push(b);
      else if (ai && !bi) out.push(cut[e](a, b));
      else if (!ai && bi) { out.push(cut[e](a, b)); out.push(b); }
    }
    if (out.length === 0) return out;
  }
  return out;
}

function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

// Break the pane. `local` is the hit in the pane's frame, `push` the world
// direction the blow was travelling (or null for a blast from `from`).
// Returns the shards spawned, and calls `chip` for bits too small to be bodies.
export function shatter(pieces, piece, local, push, { coarse = false, chip = null, keepEdges = true } = {}) {
  const { w, h, t } = paneSize(piece);
  const c = piece.localBox.getCenter(new THREE.Vector3());
  const u0 = THREE.MathUtils.clamp(local.x - c.x, -w / 2, w / 2), v0 = THREE.MathUtils.clamp(local.y - c.y, -h / 2, h / 2);
  const rays = coarse ? 6 : 8 + ((Math.random() * 5) | 0);
  const radii = coarse ? [0.4, 1.3, 9] : [0.07, 0.18, 0.42, 0.95, 2.1, 9];
  // The web's nodes, jittered once so neighbouring shards share their edges.
  const angles = [];
  for (let r = 0; r < rays; r++) angles.push((r / rays) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI * 2 / rays) * 0.6);
  const node = radii.map((rad) => angles.map((a) => {
    const rr = rad * (0.8 + Math.random() * 0.4);
    return [u0 + Math.cos(a) * rr, v0 + Math.sin(a) * rr];
  }));
  const polys = [];
  for (let r = 0; r < rays; r++) {
    const r1 = (r + 1) % rays;
    polys.push({ poly: [[u0, v0], node[0][r], node[0][r1]], ring: 0 });
    for (let k = 0; k < radii.length - 1; k++) {
      polys.push({ poly: [node[k][r], node[k + 1][r], node[k + 1][r1], node[k][r1]], ring: k + 1 });
    }
  }
  const obj = pieces.worldMatrix(piece);
  const spawned = [];
  const baseQ = piece.quat.clone();
  for (const { poly, ring } of polys) {
    const clipped = clipRect(poly, -w / 2, -h / 2, w / 2, h / 2);
    if (clipped.length < 3) continue;
    const a = area(clipped);
    if (a < 1e-4) continue;
    // Centre of the shard, in pane coords.
    let sx = 0, sy = 0;
    for (const p of clipped) { sx += p[0]; sy += p[1]; }
    sx /= clipped.length; sy /= clipped.length;
    const world = new THREE.Vector3(c.x + sx, c.y + sy, c.z).applyMatrix4(obj);
    const edge = Math.abs(sx) > w / 2 - 0.25 || Math.abs(sy) > h / 2 - 0.25;
    if (a < 0.004) { chip?.(world, push); continue; }
    const shape = new THREE.Shape(clipped.map(([x, y]) => new THREE.Vector2(x - sx, y - sy)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    g.computeVertexNormals();
    const stays = keepEdges && edge && ring >= 2 && Math.random() < 0.55;
    const d = Math.hypot(sx - u0, sy - v0);
    let vel;
    if (push) vel = push.clone().multiplyScalar((stays ? 0 : 1) * (2.5 + Math.random() * 2) / (1 + d * 2)).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5)));
    const shard = pieces.spawn({ parts: [{ kind: 'glass', geometry: g }], pos: world, quat: baseQ, role: 'shard', floor: piece.floor },
      { dynamic: !stays, vel, spin: { x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }, debris: true });
    spawned.push(shard);
  }
  pieces.destroy(piece);
  return spawned;
}
