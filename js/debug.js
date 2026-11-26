// Developer checks. Loaded only when the address has ?devtest; players never see any of this.
import * as THREE from 'three';
import { gfx } from './gfx/renderer.js';
import { ocean, waveHeight } from './gfx/ocean.js';
import { econ, fmtCredits } from './core/economy.js';
import { store } from './core/store.js';
import { save } from './core/save.js';
import { fx } from './gfx/effects.js';
import { world } from './world/world.js';
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
  // Sound checks without speakers: renders what fn() plays through the game's whole output chain and measures it.
  // Returns peak (1 = full scale), the time the sound starts, loudness every 0.1 s (dB), and loudness per band:
  // sub 30-80 Hz, low 80-250, mid 250-2000, high above 2000. listen(fn, secs, true) also returns the samples.
  async listen(fn, secs = 6, raw = false) {
    const s = S(), buf = await s.audio.offline(secs, fn); if (!buf) return null;
    const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, m = new Float32Array(n);
    let peak = 0, over = 0, start = -1; for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; if (a >= 0.999) over++; if (start < 0 && a > 0.01) start = i / sr; m[i] = (L[i] + R[i]) * 0.5; }
    const db = (x) => Math.round(20 * Math.log10(x + 1e-6)), w = Math.floor(sr * 0.1), env = [];
    for (let i = 0; i < n; i += w) { let e = 0; const j1 = Math.min(n, i + w); for (let j = i; j < j1; j++) e += m[j] * m[j]; env.push(db(Math.sqrt(e / (j1 - i)))); }
    const band = async (lo, hi) => { const c = new OfflineAudioContext(1, n, sr), src = c.createBufferSource(), b = c.createBuffer(1, n, sr); b.copyToChannel(m, 0); src.buffer = b; let node = src; for (let k = 0; k < 2; k++) { if (lo) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = lo; node.connect(f); node = f; } if (hi) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hi; node.connect(f); node = f; } } node.connect(c.destination); src.start(); const d = (await c.startRendering()).getChannelData(0); let pk = 0, e = 0; const i0 = Math.max(0, Math.floor((start < 0 ? 0 : start) * sr)), i1 = Math.min(n, i0 + sr); for (let i = i0; i < i1; i++) { e += d[i] * d[i]; if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]); } return db(Math.sqrt(e / (i1 - i0))); };
    const out = { peak: +peak.toFixed(3), samplesAtFullScale: over, start: +start.toFixed(3), env: env.join(' '), firstSecond: { sub: await band(30, 80), low: await band(80, 250), mid: await band(250, 2000), high: await band(2000, 0) } };
    if (raw) out.buf = buf;
    return out;
  },
  // ---- before / after pictures --------------------------------------------------------------------------------------------
  // The same named views every time, each saved as a JPEG by the local test server (POST /__save), so a "before" set and
  // an "after" set can be laid side by side. Local test server only. dir: folder name; only: name prefixes to take.
  // Views: every ship, submarine and aircraft of both nations, the marine (face and full body), the open sea, an island,
  // a wake, an explosion, a burning ship, and the Super Destroyer's rooms.
  async gallery(dir = 'shots', only = null) {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return 'local test server only';
    const s = S(), cam = gfx.camera, src = gfx.renderer.domElement, tmp = document.createElement('canvas'), done = [], skipped = [], V = THREE.Vector3;
    let clk = performance.now();
    const step = (n, fn) => { for (let i = 0; i < n; i++) { clk += 1000 / 60; if (fn) fn(); s.app.frame(clk); } };
    const keepShot = async (name) => { tmp.width = src.width; tmp.height = src.height; tmp.getContext('2d').drawImage(src, 0, 0); const blob = await new Promise((r) => tmp.toBlob(r, 'image/jpeg', 0.9)); await fetch(`/__save?dir=${dir}&name=${name}.jpg`, { method: 'POST', body: blob }); done.push(name); };
    const view = async (name, p, l, fov = 50) => { cam.position.copy(p); cam.lookAt(l); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); s.app.present(0, false, true); await keepShot(name); };
    const want = (n) => !only || only.some((o) => n.startsWith(o));
    const fwdOf = (u) => { const f = new V(); if (u.fwd) u.fwd(f); else f.set(-Math.sin(u.yaw || 0), 0, -Math.cos(u.yaw || 0)); f.y = 0; return f.normalize(); };
    // a camera position round a unit: ang from the bow, on the sunlit side; distance and height as multiples of its size
    const orbit = (u, ang, distK, hK) => {
      const f = fwdOf(u), r = new V(-f.z, 0, f.x), size = Math.max(u.dims.length, u.dims.span || 0, u.dims.beam || 0), side = r.dot(gfx.sunDir) >= 0 ? 1 : -1;
      const p = new V().copy(u.pos).addScaledVector(f, Math.cos(ang) * size * distK).addScaledVector(r, side * Math.sin(ang) * size * distK); p.y = Math.max(u.pos.y, 0) + size * hK + 1.5;
      return [p, new V(u.pos.x, Math.max(u.pos.y, 0) + size * 0.03, u.pos.z)];
    };
    const AIRK = ['fighter', 'bomber', 'recon', 'transport', 'attackheli'];
    for (const nation of ['aethia', 'extro']) {
      for (const type of ['patrol', 'corvette', 'battlecruiser', 'carrier', 'superdestroyer', 'reconsub', 'attacksub', ...AIRK]) {
        const name = `${type}-${nation}`; if (!want(name)) continue;
        const u = this.spawn(type, nation), air = AIRK.includes(type); s.player.mode = 'chase'; step(40);
        await view(name, ...orbit(u, 0.65, air ? 1.5 : 0.8, air ? 0.3 : 0.2), 45);
        await view(name + '-close', ...orbit(u, 1.15, air ? 0.8 : 0.3, air ? 0.2 : 0.09), 55);
      }
      if (want('marine-' + nation)) {
        const u = this.spawn('marine', nation); s.player.mode = 'chase'; step(40);
        const e = u.eye(new V()), f = u.aimDir(new V()); f.y = 0; f.normalize();
        await view(`marine-${nation}-face`, new V().copy(e).addScaledVector(f, 0.62), new V(e.x, e.y - 0.03, e.z), 30);
        await view(`marine-${nation}-body`, new V().copy(e).addScaledVector(f, 3.3).add(new V(0, -0.45, 0)), new V(e.x, e.y - 0.78, e.z), 40);
      }
    }
    if (want('ocean') || want('island')) {
      const u = this.spawn('corvette', 'aethia'); s.player.mode = 'chase'; step(40);
      const x = u.pos.x + 900, z = u.pos.z + 900, sd = gfx.sunDir, at = (px, py, pz) => new V(px, py, pz);
      if (want('ocean')) {
        await view('ocean-deck-sun-behind', at(x, 9, z), at(x - sd.x * 200, 0, z - sd.z * 200), 70);
        await view('ocean-deck-into-sun', at(x, 9, z), at(x + sd.x * 200, 2, z + sd.z * 200), 70);
        await view('ocean-low-flight', at(x, 120, z), at(x + 500, 0, z - 600), 70);
        await view('ocean-straight-down', at(x, 400, z), at(x + 1, 0, z + 1), 60);
        await view('ocean-distance', at(x, 400, z), at(x - 4000, 0, z + 3000), 50);
        s.input._press('KeyW'); step(1500); s.input._release('KeyW');
        await view('ocean-wake', ...orbit(u, Math.PI * 0.86, 1.5, 0.55), 50);
        await view('ocean-bow-wave', ...orbit(u, 0.5, 0.75, 0.1), 50);
      }
      if (want('island')) {
        const is = world.islands[0];
        if (is) { await view('island-beach', at(is.x + is.r * 1.25, 12, is.z), at(is.x, 6, is.z), 60); await view('island-high', at(is.x + is.r * 1.3, 260, is.z + is.r * 1.3), at(is.x, 0, is.z), 50); } else skipped.push('island: none in the world');
      }
    }
    if (want('explosion') || want('burning')) {
      const u = this.spawn('corvette', 'extro'); s.player.mode = 'chase'; step(40);
      if (want('explosion')) {
        const q = new V(u.pos.x + 400, 12, u.pos.z + 400), c = new V(q.x - 85, 14, q.z - 20);
        fx.explosion(q, 16, false); step(10); await view('explosion-early', c, q, 55); step(55); await view('explosion-late', c, q, 55);
      }
      if (want('burning')) {
        const t = world.units.filter((o) => o.alive && o.kind === 'ship' && !o.isPlayer).sort((a, b) => b.maxHp - a.maxHp)[0];
        if (t) { for (let k = 0; k < 3; k++) t.damage(t.maxHp * 0.26, null, new V(t.pos.x + (k - 1) * t.dims.length * 0.22, 8, t.pos.z)); step(420); await view('burning-ship', ...orbit(t, 0.75, 0.85, 0.22), 45); await view('burning-ship-close', ...orbit(t, 1.3, 0.3, 0.1), 55); }
        else skipped.push('burning: no other ship');
      }
    }
    if (want('interior')) {
      const m = this.spawn('marine', 'aethia', { sd: true }); step(30);
      let ship = m.on && m.on.def.key === 'superdestroyer' ? m.on : world.units.find((o) => o.alive && o.def.key === 'superdestroyer' && o.nation === 'aethia') || world.units.find((o) => o.alive && o.def.key === 'superdestroyer');
      if (!ship && s.battle.spawnSD) { ship = s.battle.spawnSD('aethia'); step(30); }   // the battle did not bring one: add one
      if (!ship) skipped.push('interior: no Super Destroyer in this battle');
      else for (const [name, x, y, z, yaw] of [['corridor-upper', 0, 8, -20, Math.PI], ['mess', 8, 8, -30, Math.PI], ['bunks', -5, 8, -30.7, Math.PI / 2], ['armoury', 5, 8, -5, -Math.PI / 2], ['wardroom', -5, 8, 23, Math.PI / 2],
        ['corridor-lower', 0, 4, -10, Math.PI], ['engine-room', 4.4, 4, -30, Math.PI], ['generators', -5, 4, -27, Math.PI / 2], ['dock-bay', -7.5, -7.6, 66, Math.PI], ['bridge', 0, 24, -55, 0], ['stair-tower', 0, 8, -53, Math.PI]]) {
        m.placeOn(ship, new V(x, y, z)); s.player.mode = 'first'; step(25, () => { s.player.yaw = ship.yaw + yaw; s.player.pitch = -0.04; }); await keepShot('interior-' + name);
      }
    }
    return { dir, saved: done.length, skipped };
  },
  // Frame time in a battle on every preset (and Fast Graphics): average and worst-in-twenty milliseconds per frame, with
  // the draw calls and triangles of the last frame. Each frame is forced to finish on the graphics card before the clock
  // is read. In a hidden browser pane these are for comparing presets and before / after, not real frames per second.
  bench(frames = 240) {
    const s = S(), gl = gfx.renderer.getContext(), px = new Uint8Array(4), out = {}, keep = { q: save.settings.quality, f: save.settings.fast };
    let clk = performance.now();
    for (const preset of ['fast', 'low', 'medium', 'high', 'ultra']) {
      save.settings.fast = preset === 'fast'; if (preset !== 'fast') save.settings.quality = preset; gfx.applyQuality();
      this.spawn('battlecruiser', 'aethia'); s.player.mode = 'chase';
      for (let i = 0; i < 180; i++) { clk += 1000 / 60; s.app.frame(clk); }
      const ts = [];
      for (let i = 0; i < frames; i++) { clk += 1000 / 60; const t0 = performance.now(); s.app.frame(clk); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); }
      ts.sort((a, b) => a - b); const info = gfx.renderer.info.render;   // with post-processing on, this counts only the last pass
      out[preset] = { avgMs: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2), p95Ms: +ts[Math.floor(ts.length * 0.95)].toFixed(2), calls: info.calls, triangles: info.triangles, units: world.units.length, size: gfx.w + 'x' + gfx.h };
    }
    save.settings.quality = keep.q; save.settings.fast = keep.f; gfx.applyQuality();
    return out;
  },
  // One figure, eight views (whole body from four sides, face, face three-quarter, torso, boots), saved as one JPEG by the
  // local test server. o: buildSoldier options plus { nation, state, t, pitch, moving, dist, turn, lookAt: 'hands' }.
  async person(o = {}, name = 'person', dir = 'people') {
    const s = S(), cam = gfx.camera, src = gfx.renderer.domElement, V = THREE.Vector3, H = await import('./units/v2/human.js');
    if (this._fig) gfx.scene.remove(this._fig);
    const fig = H.buildSoldier(o.nation || 'aethia', o); this._fig = fig;
    const u = s.player.unit, sd = gfx.sunDir; fig.position.set(u ? u.pos.x : 0, 420, u ? u.pos.z : 0); fig.rotation.y = Math.atan2(-sd.x, -sd.z) + (o.turn ?? 0.5); gfx.scene.add(fig);
    H.animateSoldier(fig, o.state || 'idle', o.t ?? 1.3, o.moving || 0, o.pitch || 0, { snap: true, dist: o.dist ?? 0, phase: o.phase }); fig.updateMatrixWorld(true);
    const tw = 400, th = 450, out = document.createElement('canvas'); out.width = tw * 4; out.height = th * 2; const ctx = out.getContext('2d');
    const keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, near: cam.near }; cam.near = 0.05;
    const views = o.views || [[[0, 0.93, -3.3], [0, 0.93, 0], 34], [[-2.0, 1.15, -2.65], [0, 0.93, 0], 34], [[3.3, 0.93, 0], [0, 0.93, 0], 34], [[0, 0.93, 3.3], [0, 0.93, 0], 34],
      [[0, 1.69, -0.68], [0, 1.675, 0], 30], [[-0.42, 1.7, -0.52], [0, 1.675, -0.02], 30], [[0.45, 1.32, -1.05], [0, 1.24, 0], 40], o.lookAt === 'hands' ? [[-0.55, 0.95, -0.45], [-0.2, 0.84, -0.03], 30] : [[0.5, 0.3, -0.75], [0.03, 0.13, -0.06], 34]];
    views.forEach((v, i) => {
      cam.position.copy(fig.localToWorld(new V(...v[0]))); cam.lookAt(fig.localToWorld(new V(...v[1]))); cam.fov = v[2]; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      s.app.present(0, false, true);
      const sh = src.height, sw = Math.min(src.width, sh * tw / th); ctx.drawImage(src, (src.width - sw) / 2, 0, sw, sh, (i % 4) * tw, Math.floor(i / 4) * th, tw, th);
    });
    cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.near = keep.near; cam.updateProjectionMatrix();
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92)); await fetch(`/__save?dir=${dir}&name=${name}.jpg`, { method: 'POST', body: blob });
    return { name, tris: fig.userData.tris };
  },
  // Several figures side by side: each gets a whole-body and a face view. list: buildSoldier options (+ nation, state, t).
  async lineup(list, name = 'lineup', dir = 'people') {
    const s = S(), cam = gfx.camera, src = gfx.renderer.domElement, V = THREE.Vector3, H = await import('./units/v2/human.js'), n = list.length;
    const tw = Math.floor(1600 / n), th = 450, out = document.createElement('canvas'); out.width = tw * n; out.height = th * 2; const ctx = out.getContext('2d');
    const keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, near: cam.near }; cam.near = 0.05; const u = s.player.unit, sd = gfx.sunDir, tris = [];
    list.forEach((o, i) => {
      if (this._fig) gfx.scene.remove(this._fig);
      const fig = H.buildSoldier(o.nation || 'aethia', o); this._fig = fig; fig.position.set(u ? u.pos.x : 0, 420, u ? u.pos.z : 0); fig.rotation.y = Math.atan2(-sd.x, -sd.z) + (o.turn ?? 0.45); gfx.scene.add(fig);
      H.animateSoldier(fig, o.state || 'idle', o.t ?? 1.3, o.moving || 0, o.pitch || 0, { snap: true, dist: o.dist ?? 0, phase: o.phase }); fig.updateMatrixWorld(true); tris.push(fig.userData.tris[0]);
      (o.views || [[[-0.9, 1.05, -3.2], [0, 0.93, 0], 34], [[-0.2, 1.7, -0.74], [0, 1.66, 0], 30]]).forEach((v, r) => {
        cam.position.copy(fig.localToWorld(new V(...v[0]))); cam.lookAt(fig.localToWorld(new V(...v[1]))); cam.fov = v[2]; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); s.app.present(0, false, true);
        const sh = src.height, sw = Math.min(src.width, sh * tw / th); ctx.drawImage(src, (src.width - sw) / 2, 0, sw, sh, i * tw, r * th, tw, th);
      });
    });
    cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.near = keep.near; cam.updateProjectionMatrix();
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92)); await fetch(`/__save?dir=${dir}&name=${name}.jpg`, { method: 'POST', body: blob });
    return { name, tris };
  },
  // save what the game canvas shows now (after drawing one frame) as a JPEG through the local test server
  async snap(name = 'snap', dir = 'people', draw = true) {
    const src = gfx.renderer.domElement, c = document.createElement('canvas'); if (draw) S().app.present(0, false, true);
    c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); await fetch(`/__save?dir=${dir}&name=${name}.jpg`, { method: 'POST', body: blob }); return name;
  },
  // Pictures of a ship's walk-in compartments (js/units/v2/cabins.js): the door from the deck, then views inside. Saved as
  // one JPEG of six tiles by the local test server.
  async cabins(type = 'corvette', nation = 'aethia', name = null, dir = 'interiors') {
    const s = S(), cam = gfx.camera, src = gfx.renderer.domElement, V = THREE.Vector3, u = this.spawn(type, nation), inn = u.model.interior; if (!inn || !inn.door) return { type, interior: !!inn };
    let clk = performance.now(); for (let i = 0; i < 20; i++) { clk += 1000 / 60; s.app.frame(clk); }
    const h = inn.hole, d = inn.door, y = d.y + 1.62, xc = (h.x0 + h.x1) / 2, zc = (h.z0 + h.z1) / 2, L = h.z1 - h.z0, W = h.x1 - h.x0, wide = W >= 7.4;
    const views = [[[d.x + d.side * 4.5, y + 0.6, d.z + 3.5], [d.x - d.side * 0.9, y - 0.4, d.z], 50], [[d.x - d.side * 2.6, y, d.z + 0.05], [d.x + d.side * 3, y - 0.3, d.z], 70],
      [[xc, y, h.z0 + 0.6], [xc, y - 0.25, h.z1], 75], [[xc, y, h.z1 - 0.6], [xc, y - 0.25, h.z0], 75],
      wide ? [[xc + 1.2, y, zc - L * 0.3], [h.x1 - 0.3, y - 0.5, zc - L * 0.34], 80] : [[xc, y, zc - L * 0.2], [h.x1, y - 0.6, zc - L * 0.3], 85],
      wide ? [[xc - 1.2, y, zc + L * 0.3], [h.x0 + 0.3, y - 0.5, zc + L * 0.26], 80] : [[xc, y, zc + L * 0.25], [h.x0, y - 0.6, zc + L * 0.1], 85]];
    const tw = 534, th = 400, out = document.createElement('canvas'); out.width = tw * 3; out.height = th * 2; const ctx = out.getContext('2d'), keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, near: cam.near };
    cam.near = 0.08; inn.group.visible = true;
    views.forEach((v, i) => { cam.position.copy(u.toWorld(new V(...v[0]), new V())); cam.lookAt(u.toWorld(new V(...v[1]), new V())); cam.fov = v[2]; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); if (i > 0) { gfx.setUnderwater(0); } s.app.present(0, false, true); ctx.drawImage(src, (i % 3) * tw, Math.floor(i / 3) * th, tw, th); });
    cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.near = keep.near; cam.updateProjectionMatrix();
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9)); await fetch(`/__save?dir=${dir}&name=${name || type + '-' + nation}.jpg`, { method: 'POST', body: blob });
    return { type, rooms: inn.rooms, door: d, size: [+(W).toFixed(1), +(L).toFixed(1)], on: u.interiorOn, visible: inn.group.visible };
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
