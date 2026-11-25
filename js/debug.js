// Developer checks. Loaded only when the address has ?devtest; players never see any of this.
import * as THREE from 'three';
import { gfx } from './gfx/renderer.js';

const S = () => window.__steelTide;
const _look = new THREE.Vector3();

export const dev = {
  // Render several camera views of the live scene into one picture (a grid), so they can be judged side by side.
  // views: [{ p: [x, y, z], l: [x, y, z], fov }] -> shown in a canvas laid over the page
  mosaic(views, cols = 2) {
    const src = gfx.renderer.domElement, cam = gfx.camera, rows = Math.ceil(views.length / cols);
    let c = document.getElementById('dev-mosaic');
    if (!c) { c = document.createElement('canvas'); c.id = 'dev-mosaic'; c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:#000'; document.body.appendChild(c); }
    c.width = innerWidth; c.height = innerHeight;
    const ctx = c.getContext('2d'), w = c.width / cols, h = c.height / rows;
    const keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    views.forEach((v, i) => {
      cam.position.set(...v.p); cam.lookAt(_look.set(...v.l)); cam.fov = v.fov || 70; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      S().app.present(0, false, true);
      ctx.drawImage(src, (i % cols) * w, Math.floor(i / cols) * h, w, h);
      if (v.t) { ctx.font = '13px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(v.t, (i % cols) * w + 7, Math.floor(i / cols) * h + 17); ctx.fillStyle = '#fff'; ctx.fillText(v.t, (i % cols) * w + 6, Math.floor(i / cols) * h + 16); }
    });
    cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.updateProjectionMatrix();
    return views.length;
  },
  clear() { document.getElementById('dev-mosaic')?.remove(); },
  // the four ocean views: deck height, low flight, straight down from high up, and a long look toward the sun
  sea(x = 0, z = 0) {
    const s = gfx.sunDir;
    return this.mosaic([
      { t: 'deck height, sun behind', p: [x, 9, z], l: [x - s.x * 200, 0, z - s.z * 200] },
      { t: 'deck height, into the sun', p: [x, 9, z], l: [x + s.x * 200, 2, z + s.z * 200] },
      { t: 'low flight 120 m', p: [x, 120, z], l: [x + 500, 0, z - 600] },
      { t: 'low flight into the sun', p: [x, 120, z], l: [x + s.x * 700, 0, z + s.z * 700] },
      { t: 'straight down from 2500 m', p: [x, 2500, z], l: [x + 1, 0, z + 1], fov: 60 },
      { t: 'distance, 400 m up', p: [x, 400, z], l: [x - 4000, 0, z + 3000], fov: 50 },
    ], 3);
  },
};
