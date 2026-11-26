// Developer checks. Loaded only when the address has ?devtest; players never see any of this.
import * as THREE from 'three';
import { gfx } from './gfx/renderer.js';
import { ocean, waveHeight } from './gfx/ocean.js';
import { econ, fmtCredits } from './core/economy.js';
import { store } from './core/store.js';
import { save } from './core/save.js';
import { menus } from './ui/menus.js';

const S = () => window.__steelTide;
const _look = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3(), _m3 = new THREE.Matrix3();
const BOTH = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const DIRS = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) { const n = Math.abs(x) + Math.abs(y) + Math.abs(z); if (n === 1 || n === 3) DIRS.push(new THREE.Vector3(x, y, z).normalize()); }

function canvas(cols, rows) {
  let c = document.getElementById('dev-mosaic');
  if (!c) { c = document.createElement('canvas'); c.id = 'dev-mosaic'; c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:#000'; document.body.appendChild(c); }
  c.width = innerWidth; c.height = innerHeight;
  return { ctx: c.getContext('2d'), w: c.width / cols, h: c.height / rows };
}
function label(ctx, x, y, text, bad) { ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x, y, ctx.measureText(text).width + 10, 17); ctx.fillStyle = bad ? '#ff6b5e' : '#fff'; ctx.fillText(text, x + 5, y + 13); }

export const dev = {
  // Render several camera views of the live scene into one picture (a grid), so they can be judged side by side.
  // views: [{ p: [x, y, z], l: [x, y, z], fov, t }]
  mosaic(views, cols = 2) {
    const src = gfx.renderer.domElement, cam = gfx.camera, { ctx, w, h } = canvas(cols, Math.ceil(views.length / cols));
    const keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    views.forEach((v, i) => {
      cam.position.set(...v.p); cam.lookAt(_look.set(...v.l)); cam.fov = v.fov || 70; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      S().app.present(0, false, true);
      ctx.drawImage(src, (i % cols) * w, Math.floor(i / cols) * h, w, h);
      if (v.t) label(ctx, (i % cols) * w + 4, Math.floor(i / cols) * h + 4, v.t);
    });
    cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.updateProjectionMatrix();
    return views.length;
  },
  clear() { document.getElementById('dev-mosaic')?.remove(); },
  // the ocean views: deck height, low flight, straight down from high up, and a long look
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

  // ---- cameras ---------------------------------------------------------------------------------------------------------------
  // Is the camera inside a model, or is anything closer than it can draw? Rays go out in 14 directions against the real
  // meshes (both faces): `back` counts directions whose first hit is the INSIDE of a surface (most of them = the camera is
  // inside something), `near` is the distance to the closest surface and `what` names its material.
  inside() {
    const cam = gfx.camera, o = cam.getWorldPosition(new THREE.Vector3()), rc = new THREE.Raycaster(), list = [];
    const walk = (n) => {
      if (!n.visible) return;
      if (n.isMesh && !n.isInstancedMesh && n !== ocean.mesh && n.geometry && n.material && !n.material.isShaderMaterial && n.material.blending !== THREE.AdditiveBlending) {
        if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere();
        const bs = n.geometry.boundingSphere; _c.copy(bs.center).applyMatrix4(n.matrixWorld);
        if (_c.distanceTo(o) < bs.radius * n.matrixWorld.getMaxScaleOnAxis() + 40) list.push(n);
      }
      for (const k of n.children) walk(k);
    };
    gfx.scene.updateMatrixWorld(); walk(gfx.scene);
    let back = 0, near = 1e9, what = '', under = o.y < waveHeight(o.x, o.z) ? 1 : 0;
    for (const d of DIRS) {
      rc.set(o, d); rc.far = 40; let best = null;
      for (const m of list) { const keep = m.material; m.material = BOTH; const hits = rc.intersectObject(m, false); m.material = keep; if (hits.length && (!best || hits[0].distance < best.distance)) { best = hits[0]; best.mat = keep; } }
      if (!best) continue;
      if (best.distance < near) { near = best.distance; what = best.mat.name || best.object.name || best.mat.type; }
      if (best.face) { _n.copy(best.face.normal).applyMatrix3(_m3.getNormalMatrix(best.object.matrixWorld)); if (_n.dot(d) > 0) back++; }
    }
    return { back, near: near > 1e8 ? null : +near.toFixed(2), what, camNear: cam.near, fov: +cam.fov.toFixed(0), y: +o.y.toFixed(1), under };
  },
  // Developer Credits. LOCAL SAVE ONLY: with an account the server holds the Credits and nothing in the game can add to
  // them. A save that has used this is marked (econ.dev) and is not moved into an account at sign-in.
  grant(n = 500000) {
    n = Math.floor(Number(n)); if (store.signedIn || !(n > 0)) return false;
    econ.add(n); save.data.econ.dev = true; save.write();
    if (document.querySelector('.screen')) menus.refresh();
    return true;
  },
  tapKey(code, hold = 0.12) { const s = S(); s.input._press(code); s.app.advance(hold); s.input._release(code); },
  spawn(type, nation = 'aethia', opts = {}) { const s = S(); s.app.play(nation, type, opts); s.app.advance(0.5); return s.player.unit; },
  // put a freshly spawned jet in the air: taxi, launch, climb away for `secs`
  fly(secs = 8) { const s = S(), u = s.player.unit; if (u.kind === 'jet') { if (u.state === 'deck') { this.tapKey('KeyE'); s.input._press('ShiftLeft'); s.app.advance(4); } s.app.advance(secs); s.input._release('ShiftLeft'); } else if (u.kind === 'heli') { s.input._press('KeyW'); s.app.advance(secs + 6); s.input._release('KeyW'); } return u.state; },
  // Run camera scenarios and tile the results. Each scenario: { t: label, run(dev, S): set the game up; may return false to skip }
  shots(list, cols = 3) {
    const s = S(), src = gfx.renderer.domElement, { ctx, w, h } = canvas(cols, Math.ceil(list.length / cols)), out = [];
    list.forEach((sc, i) => {
      let err = '';
      try { sc.run(this, s); } catch (e) { err = String(e.message || e); }
      for (let k = 0; k < 20; k++) s.player.camera(1 / 60);
      s.app.present(0, false, true);
      const r = err ? { err } : this.inside(), x = (i % cols) * w, y = Math.floor(i / cols) * h;
      ctx.drawImage(src, x, y, w, h);
      const bad = err || r.back >= (sc.inside ? 99 : 8) || (r.near !== null && r.near < r.camNear * 1.3) || (r.under && !sc.wet);
      label(ctx, x + 4, y + 4, `${sc.t}  ${err || `in ${r.back}/14  near ${r.near} ${r.what}`}`, bad);
      out.push({ t: sc.t, bad: !!bad, ...r });
    });
    return out;
  },
};

// ---- the debug panel: only when the address has ?debugtest. Developer helpers that want a button. ---------------------------------
function buildPanel() {
  const box = document.createElement('div'); box.id = 'dev-panel';
  box.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:100000;background:rgba(8,14,20,.94);border:1px solid #ffcf4a;border-radius:6px;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;color:#e8eef2;max-width:270px';
  box.innerHTML = '<b style="color:#ffcf4a;letter-spacing:.08em">DEBUG</b> <span id="dev-credits"></span><div style="margin-top:6px;display:flex;gap:6px"><button data-grant="50000">Grant 50,000</button><button data-grant="500000">Grant 500,000</button></div><div id="dev-note" style="margin-top:6px;color:#9fb0bb"></div>';
  for (const b of box.querySelectorAll('button')) b.style.cssText = 'font:inherit;padding:4px 8px;background:#1d2a35;color:#fff;border:1px solid #47607a;border-radius:4px;cursor:pointer';
  const sync = () => {
    const local = !store.signedIn;
    box.querySelector('#dev-credits').textContent = 'Credits: ' + fmtCredits(econ.credits);
    box.querySelector('#dev-note').textContent = local ? 'Grant Credits: local save only. Nothing from a local save is ever moved into an account.' : 'Signed in: Credits are held by the server and cannot be granted here.';
    for (const b of box.querySelectorAll('button')) { b.disabled = !local; b.style.opacity = local ? '1' : '.4'; b.style.cursor = local ? 'pointer' : 'not-allowed'; }
  };
  box.addEventListener('click', (e) => { const n = Number(e.target.dataset && e.target.dataset.grant); if (!n) return; e.stopPropagation(); dev.grant(n); sync(); });
  document.body.appendChild(box); sync(); setInterval(sync, 1000);
}
if (/[?&]debugtest/.test(location.search)) buildPanel();
