// Keyboard + mouse with pointer lock. Actions are looked up through the (remappable) key bindings in the save.
import { save } from './save.js';

const down = new Set(), hit = new Set();
export const input = {
  mx: 0, my: 0, wheel: 0, lmb: false, rmb: false, lmbHit: false, rmbHit: false, locked: false, canvas: null,
  noLock: new URLSearchParams(location.search).has('nolock'), // automated tests: play without pointer lock
  onLockChange: null, capture: null, // capture(code): used by the key-remap UI
  init(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code); return; }
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (this.locked && (e.ctrlKey || e.code === 'F1'))) e.preventDefault();
      if (!e.repeat) { down.add(e.code); hit.add(e.code); }
    });
    addEventListener('keyup', (e) => down.delete(e.code));
    addEventListener('blur', () => { down.clear(); this.lmb = this.rmb = false; });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mx += e.movementX || 0; this.my += e.movementY || 0; } });
    addEventListener('mousedown', (e) => { if (!this.locked) return; if (e.button === 0) { this.lmb = true; this.lmbHit = true; } if (e.button === 2) { this.rmb = true; this.rmbHit = true; } });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const l = document.pointerLockElement === canvas;
      if (this.noLock) return;
      this.locked = l; if (!l) { down.clear(); this.lmb = this.rmb = false; }
      this.onLockChange && this.onLockChange(l);
    });
  },
  lock() {
    if (this.noLock) { this.locked = true; this.onLockChange && this.onLockChange(true); return; }
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
  },
  unlock() { if (this.noLock) { this.locked = false; return; } if (document.pointerLockElement) document.exitPointerLock(); },
  key(code) { return down.has(code); },
  keyHit(code) { return hit.has(code); },
  on(action) { for (const c of save.keysFor(action)) if (down.has(c)) return true; return false; },
  tap(action) { for (const c of save.keysFor(action)) if (hit.has(c)) return true; return false; },
  axis(neg, pos) { return (this.on(pos) ? 1 : 0) - (this.on(neg) ? 1 : 0); },
  endFrame() { hit.clear(); this.mx = 0; this.my = 0; this.wheel = 0; this.lmbHit = false; this.rmbHit = false; },
  // test helpers
  _press(code) { down.add(code); hit.add(code); }, _release(code) { down.delete(code); },
};
