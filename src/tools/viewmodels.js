import * as THREE from 'three';
import { KIND } from '../render/materials.js';
import { box, cylinder } from '../render/geometry.js';

// What you are holding, as meshes in the viewmodel scene. Built from the same
// materials as the building, so the sledge's handle has the same grain as a desk.

const mat = (kind, tint) => {
  const m = KIND[kind].material.clone();
  if (tint !== undefined) m.color = new THREE.Color(tint);
  return m;
};

export function sledgeModel() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(cylinder(0.022, 0.9, 12), mat('wood', 0xd8b890));
  handle.position.y = -0.45;
  const grip = new THREE.Mesh(cylinder(0.026, 0.22, 12), mat('leather', 0x303030));
  grip.position.y = -0.8;
  const head = new THREE.Mesh(box(0.26, 0.1, 0.1), mat('metal', 0x5a5d62));
  head.material.metalness = 0.85;
  head.material.roughness = 0.5;
  const faceL = new THREE.Mesh(box(0.02, 0.11, 0.11), mat('metal', 0x9a9da2));
  faceL.position.x = -0.135;
  const faceR = faceL.clone();
  faceR.position.x = 0.135;
  g.add(handle, grip, head, faceL, faceR);
  // The pivot is the grip: that is where your hands are.
  g.children.forEach((c) => { c.position.y += 0.8; });
  const pivot = new THREE.Group();
  pivot.add(g);
  return pivot;
}

export function sprayModel() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(cylinder(0.033, 0.2, 16), mat('metal', 0xe8e8e8));
  can.material.metalness = 0.7; can.material.roughness = 0.3;
  const band = new THREE.Mesh(cylinder(0.034, 0.07, 16), new THREE.MeshStandardMaterial({ color: 0xd8262b, roughness: 0.4 }));
  band.position.y = 0.02;
  const cap = new THREE.Mesh(cylinder(0.012, 0.02, 10), mat('plastic', 0x222222));
  cap.position.y = 0.11;
  g.add(can, band, cap);
  g.userData.band = band;
  return g;
}

export function extinguisherModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(cylinder(0.075, 0.42, 20), new THREE.MeshStandardMaterial({ color: 0xc41e1e, roughness: 0.35, metalness: 0.3 }));
  const top = new THREE.Mesh(cylinder(0.03, 0.06, 12), mat('metal', 0x333333));
  top.position.y = 0.24;
  const lever = new THREE.Mesh(box(0.12, 0.015, 0.03), mat('metal', 0x222222));
  lever.position.set(0.04, 0.28, 0);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16, Math.PI), mat('plastic', 0x111111));
  hose.position.set(0.1, 0.18, 0.02);
  hose.rotation.z = -Math.PI / 2;
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 10), mat('plastic', 0x111111));
  nozzle.position.set(0.12, 0.09, 0.12);
  nozzle.rotation.x = Math.PI / 2;
  g.add(body, top, lever, hose, nozzle);
  return g;
}

export function chargeModel() {
  const g = new THREE.Group();
  const brick = new THREE.Mesh(box(0.16, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.9 }));
  const tape = new THREE.Mesh(box(0.165, 0.052, 0.02), mat('plastic', 0x1b1b1b));
  const led = new THREE.Mesh(box(0.012, 0.012, 0.012), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 3 }));
  led.position.set(0.05, 0.032, 0.02);
  const wire = new THREE.Mesh(cylinder(0.003, 0.08, 4), mat('plastic', 0xd02020));
  wire.rotation.z = Math.PI / 2;
  wire.position.set(0, 0.03, -0.02);
  g.add(brick, tape, led, wire);
  g.userData.led = led;
  return g;
}

export function detonatorModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box(0.06, 0.12, 0.03), mat('plastic', 0x2a2d2a));
  const btn = new THREE.Mesh(cylinder(0.012, 0.01, 12), new THREE.MeshStandardMaterial({ color: 0xd01010, roughness: 0.4 }));
  btn.position.set(0, 0.03, 0.016);
  btn.rotation.x = Math.PI / 2;
  const ant = new THREE.Mesh(cylinder(0.003, 0.1, 4), mat('metal', 0x222222));
  ant.position.set(0.02, 0.11, 0);
  const charge = chargeModel();
  charge.scale.setScalar(0.9);
  charge.position.set(-0.12, -0.02, 0.02);
  g.add(body, btn, ant, charge);
  return g;
}
