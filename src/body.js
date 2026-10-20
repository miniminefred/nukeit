import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Your own body, in the world: look down and there are your legs and work
// boots, walking when you walk, bending when you crouch; and in the sun your
// whole figure — head, shoulders, arms — throws its shadow beside you. The
// upper body is there for the shadow only: drawn into the shadow map, never
// on screen, so it never gets in front of the camera.
//
// It stands a little behind the eye, so looking straight down you see your
// boots ahead of you, not the inside of your hips.

const TROUSERS = 0x2c3036, BOOTS = 0x2a1f16, JACKET = 0x1e2228;
const BACK = 0.16;          // m behind the eye

export class Body {
  constructor(scene) {
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
    // Drawn into the shadow map only.
    const ghost = new THREE.MeshStandardMaterial({ colorWrite: false, depthWrite: false });
    this.root = new THREE.Group();
    this.hips = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.2, 0.22, 2, 0.06), mat(TROUSERS));
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.3, 4, 10), mat(TROUSERS));
      thigh.position.y = -0.22;
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.3, 4, 10), mat(TROUSERS));
      shin.position.y = -0.21;
      const boot = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.11, 0.27, 2, 0.04), mat(BOOTS));
      boot.position.set(0, -0.43, -0.05);
      knee.add(shin, boot);
      hip.add(thigh, knee);
      return { hip, knee, side: s };
    });
    this.hips.add(...this.legs.map((l) => l.hip));
    // The rest of you, for the shadow.
    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.58, 0.24, 2, 0.08), ghost);
    torso.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), ghost);
    head.position.y = 0.86;
    const arms = [-1, 1].map((s) => { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), ghost); a.position.set(s * 0.27, 0.36, -0.1); a.rotation.x = 0.5; return a; });
    this.hips.add(torso, head, ...arms);
    this.root.add(this.hips);
    this.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = m.material.colorWrite !== false; } });
    scene.add(this.root);
  }

  // After the player has moved: stand where they stand, walk as they walk.
  update(player, visible) {
    this.root.visible = (visible || this.show) && !player.dead;     // `show`: dev, to see it from outside
    if (!this.root.visible) return;
    const yaw = player.yaw;
    this.root.position.set(player.pos.x + Math.sin(yaw) * BACK, player.pos.y, player.pos.z + Math.cos(yaw) * BACK);
    this.root.rotation.y = yaw;
    const speed = player.grounded ? Math.hypot(player.vel.x, player.vel.z) : 0;
    const stride = Math.min(1, speed / 5) * (speed > 6 ? 0.75 : 0.5);
    const c = player.crouch;
    // Crouched: hips down, knees forward.
    this.hips.position.y = 0.95 - 0.42 * c;
    for (const l of this.legs) {
      const ph = Math.sin(player.bob * Math.PI + (l.side > 0 ? 0 : Math.PI));
      // In the air, legs a little tucked. (+x swings a leg forward; a knee bends back.)
      const air = player.grounded ? 0 : 0.35;
      l.hip.rotation.x = ph * stride + 0.9 * c + air;
      l.knee.rotation.x = -(Math.max(0, ph) * stride * 1.4 + 1.6 * c + air * 1.6);
    }
  }
}
