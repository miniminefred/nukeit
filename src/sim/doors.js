import * as THREE from 'three';

// The revolving doors at the entrance: their wings turn slowly all the time,
// as automatic ones do, about four turns a minute. Each door is a piece tagged
// 'revolving' (building/furniture-lobby.js); once it is knocked loose it is
// rubble like anything else and stops.

const SPEED = 0.42;           // rad/s
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

export class Doors {
  constructor() { this.list = []; this.angle = 0; }

  attach(pieces) {
    this.pieces = pieces;
    this.list = pieces.list.filter((p) => p.tag === 'revolving');
  }

  update(dt) {
    if (!this.list.length) return;
    this.angle += dt * SPEED;
    this.list.forEach((p, i) => this.pieces.turn(p, _q.setFromAxisAngle(UP, this.angle + i * 0.7)));
    this.list = this.list.filter((p) => p.state === 'static');
  }
}
