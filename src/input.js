// Teclado, mouse e pointer lock. "pressed" guarda eventos de borda até serem consumidos.
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = [false, false, false];
    this.locked = false;
    this.sensitivity = 1.2;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.fallback && this.locked) { this.setLocked(false); return; }
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ShiftLeft', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = [false, false, false]; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseDown[e.button] = true;
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => { this.mouseDown[e.button] = false; });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (this.fallback) return;
      this.setLocked(document.pointerLockElement === this.dom);
    });
    // Sem pointer lock (ex.: iframe restrito): usa o movimento do mouse livre.
    document.addEventListener('pointerlockerror', () => this.useFallback());
  }

  setLocked(v) {
    if (this.locked === v) return;
    this.locked = v;
    if (this.onLockChange) this.onLockChange(v);
  }

  useFallback() {
    this.fallback = true;
    this.setLocked(true);
  }

  lock() {
    if (this.fallback || !this.dom.requestPointerLock) { this.useFallback(); return; }
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => this.useFallback());
    } catch { this.useFallback(); }
  }
  unlock() {
    if (this.fallback) { this.locked = false; return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }
  takeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return [dx, dy];
  }
  endFrame() { this.pressed.clear(); }
}
