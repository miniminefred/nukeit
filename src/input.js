// Keyboard state and pointer lock. Other modules read `keys` and
// `mouse`; nothing else listens to the DOM directly.

export function createInput(canvas, overlay) {
  const keys = new Set();
  const mouse = { dx: 0, dy: 0, locked: false };

  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  overlay.addEventListener('click', () => canvas.requestPointerLock());
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
    overlay.classList.toggle('hidden', mouse.locked);
    if (!mouse.locked) keys.clear();
  });
  document.addEventListener('mousemove', (e) => {
    if (!mouse.locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });

  return {
    keys,
    mouse,
    down: (code) => keys.has(code),
    // Mouse movement since the last call, then reset.
    takeMouse() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = mouse.dy = 0;
      return d;
    },
  };
}
