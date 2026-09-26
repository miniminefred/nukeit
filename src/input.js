// Keyboard and mouse state, and pointer lock. Everything else reads from here;
// nothing else listens to the DOM for game input.
//
// `down` is what is held now. `pressed` is what went down since the last
// endFrame(), so a tap is never missed and never counted twice.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { dx: 0, dy: 0, wheel: 0, locked: false, left: false, right: false };
  const listeners = [];

  window.addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (mouse.locked && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });

  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
    if (!mouse.locked) { keys.clear(); mouse.left = mouse.right = false; }
    for (const fn of listeners) fn(mouse.locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!mouse.locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (!mouse.locked) return;
    if (e.button === 0) { if (!mouse.left) pressed.add('Mouse0'); mouse.left = true; }
    if (e.button === 2) { if (!mouse.right) pressed.add('Mouse2'); mouse.right = true; }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  document.addEventListener('contextmenu', (e) => { if (mouse.locked) e.preventDefault(); });
  document.addEventListener('wheel', (e) => { if (mouse.locked) mouse.wheel += Math.sign(e.deltaY); }, { passive: true });

  return {
    keys,
    mouse,
    down: (code) => keys.has(code),
    pressed: (code) => pressed.has(code),
    lock() {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    onLockChange(fn) { listeners.push(fn); },
    // Mouse movement since the last call, then reset.
    takeMouse() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = mouse.dy = 0;
      return d;
    },
    takeWheel() {
      const w = mouse.wheel;
      mouse.wheel = 0;
      return w;
    },
    endFrame() { pressed.clear(); },
  };
}
