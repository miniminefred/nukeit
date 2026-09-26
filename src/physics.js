import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// Rigid-body physics, through Rapier.
//
// Everything standing is a fixed collider on one static body. A piece only
// gets a dynamic body of its own once something knocks it loose — which keeps
// the ten thousand pieces of an intact tower nearly free to simulate.
//
// Collision groups: the building and its debris collide with everything; the
// player's capsule collides with the building but not with small debris, so a
// shard of glass never trips you up.

export const GROUP_WORLD = 0x0001;
export const GROUP_DEBRIS = 0x0002;
export const GROUP_PLAYER = 0x0004;
const groups = (member, filter) => (member << 16) | filter;
export const G_WORLD = groups(GROUP_WORLD, GROUP_WORLD | GROUP_DEBRIS | GROUP_PLAYER);
export const G_DEBRIS = groups(GROUP_DEBRIS, GROUP_WORLD | GROUP_DEBRIS);
export const G_PLAYER = groups(GROUP_PLAYER, GROUP_WORLD);
// What a tool's ray can hit: the building and debris, never the player.
export const G_RAY = groups(GROUP_WORLD, GROUP_WORLD | GROUP_DEBRIS);

const STEP = 1 / 60;

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.events = new RAPIER.EventQueue(true);
    this.fixed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.owner = new Map();         // collider handle -> piece (or anything)
    this.dynamic = new Set();       // pieces with a dynamic body
    this.onForce = null;            // (ownerA, ownerB, magnitude)
    this._acc = 0;
    // The ground: a grid of 40 m tiles with their tops at y = 0. It was one
    // 2 km box first, and a shape that big loses enough precision in contact
    // tests that the player's capsule sank a few centimetres into it and stuck.
    for (let x = -200; x < 200; x += 40)
      for (let z = -200; z < 200; z += 40)
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(20, 1, 20).setTranslation(x + 20, -1, z + 20).setCollisionGroups(G_WORLD).setFriction(0.9),
          this.fixed,
        );
  }

  // --------------------------------------------------------- colliders

  // A fixed box, centred at `pos` with rotation `quat`.
  addFixedBox(owner, pos, quat, hx, hy, hz) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(quat)
      .setCollisionGroups(G_WORLD)
      .setFriction(0.8);
    const c = this.world.createCollider(d, this.fixed);
    this.owner.set(c.handle, owner);
    return c;
  }

  // A fixed triangle mesh, from a geometry already in world space.
  addFixedMesh(owner, geometry) {
    const { vertices, indices } = meshArrays(geometry);
    const d = RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(G_WORLD).setFriction(0.8);
    const c = this.world.createCollider(d, this.fixed);
    this.owner.set(c.handle, owner);
    return c;
  }

  removeCollider(c) {
    if (!c) return;
    this.owner.delete(c.handle);
    this.world.removeCollider(c, false);
  }

  // A dynamic body at `pos`/`quat`, with colliders built from `shapes`:
  // [{ type: 'box', hx, hy, hz, x, y, z } | { type: 'hull', points }].
  addBody(owner, pos, quat, shapes, { density = 1000, debris = false, vel, spin, forces = 0 } = {}) {
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(quat)
      .setCanSleep(true)
      .setLinearDamping(0.05)
      .setAngularDamping(0.25)
      .setCcdEnabled(debris);
    if (vel) bd.setLinvel(vel.x, vel.y, vel.z);
    if (spin) bd.setAngvel(spin);
    const body = this.world.createRigidBody(bd);
    const colliders = [];
    for (const s of shapes) {
      let d = s.type === 'hull' ? RAPIER.ColliderDesc.convexHull(s.points) : null;
      if (d === null) d = RAPIER.ColliderDesc.cuboid(Math.max(0.01, s.hx), Math.max(0.01, s.hy), Math.max(0.01, s.hz));
      if (s.type === 'box') d.setTranslation(s.x ?? 0, s.y ?? 0, s.z ?? 0);
      d.setDensity(density / 1000).setFriction(0.7).setRestitution(0.05)
        .setCollisionGroups(debris ? G_DEBRIS : G_WORLD);
      if (forces > 0) {
        d.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(forces);
      }
      const c = this.world.createCollider(d, body);
      this.owner.set(c.handle, owner);
      colliders.push(c);
    }
    return { body, colliders };
  }

  removeBody(body) {
    if (!body) return;
    for (let n = 0; n < body.numColliders(); n++) this.owner.delete(body.collider(n).handle);
    this.world.removeRigidBody(body);
  }

  // --------------------------------------------------------- queries

  // First thing along a ray. Returns { owner, collider, point, normal, distance }.
  raycast(origin, dir, maxDist, { skip = null, groups = G_RAY } = {}) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, groups, undefined, undefined,
      skip ? (c) => skip(this.owner.get(c.handle)) === false : undefined);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      owner: this.owner.get(hit.collider.handle) ?? null,
      collider: hit.collider,
      distance: t,
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  // Everything whose collider overlaps a sphere.
  overlapSphere(centre, radius, fn) {
    const shape = new RAPIER.Ball(radius);
    this.world.intersectionsWithShape(centre, { x: 0, y: 0, z: 0, w: 1 }, shape, (c) => {
      const o = this.owner.get(c.handle);
      if (o) fn(o, c);
      return true;
    });
  }

  // --------------------------------------------------------- stepping

  step(dt) {
    this._acc = Math.min(this._acc + dt, STEP * 3);
    let steps = 0;
    while (this._acc >= STEP) {
      this.world.timestep = STEP;
      this.world.step(this.events);
      this._acc -= STEP;
      steps++;
      if (this.onForce) {
        this.events.drainContactForceEvents((e) => {
          const a = this.owner.get(e.collider1()), b = this.owner.get(e.collider2());
          this.onForce(a, b, e.totalForceMagnitude());
        });
      }
    }
    return steps;
  }
}

// Positions and a Uint32 index for a geometry, indexed or not.
export function meshArrays(geometry) {
  const pos = geometry.attributes.position;
  const vertices = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    vertices[i * 3] = pos.getX(i); vertices[i * 3 + 1] = pos.getY(i); vertices[i * 3 + 2] = pos.getZ(i);
  }
  let indices;
  if (geometry.index) indices = new Uint32Array(geometry.index.array);
  else { indices = new Uint32Array(pos.count); for (let i = 0; i < pos.count; i++) indices[i] = i; }
  return { vertices, indices };
}
