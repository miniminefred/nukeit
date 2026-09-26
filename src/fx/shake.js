// Camera shake, as trauma that decays: add() on a blast, apply() once a frame
// after the player has placed the camera. The shake is squared on the way out,
// so a small knock is barely felt and a big one is violent.

export class Shake {
  constructor() {
    this.trauma = 0;
    this.t = 0;
  }

  add(amount) { this.trauma = Math.min(1, this.trauma + amount); }

  apply(camera, dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const s = this.trauma * this.trauma;
    if (s <= 0) return;
    const n = (f, o) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.4;
    camera.rotation.x += n(37, 1) * s * 0.05;
    camera.rotation.y += n(41, 5) * s * 0.05;
    camera.rotation.z += n(29, 9) * s * 0.04;
    camera.position.y += n(33, 3) * s * 0.08;
    camera.updateMatrixWorld();
  }

  clear() { this.trauma = 0; }
}
