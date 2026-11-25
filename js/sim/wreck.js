// Aircraft wreckage. A destroyed aircraft never just vanishes: its own model is cut into pieces that keep its speed, get
// thrown by the blast, tumble, burn, trail smoke and come down into the sea, onto a deck or onto an island.
// How badly it breaks up depends on what destroyed it:
//   light  (machine-gun fire, loss of control)  stays in one piece, on fire, spirals down shedding small parts, breaks on impact
//   medium (AA and cannon fire, a near miss)     a fireball and a few big pieces: wings, nose, tail
//   heavy  (a direct missile hit, bombs going up) a big blast and many burning pieces and fragments
//   crash  (sea, deck, ground)                   by speed: a slow belly-flop floats and burns before it sinks, a fast one shatters
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { fx } from '../gfx/effects.js';
import { ocean, waveHeight } from '../gfx/ocean.js';
import { audio } from '../audio/audio.js';
import { world } from '../world/world.js';
import { WEAPONS } from '../core/config.js';
import { V3, clamp, rand } from '../core/util.js';
import { surfaceBelow } from './surface.js';

const _a = new V3(), _b = new V3(), _c = new V3(), _n = new V3(), _q = new THREE.Quaternion(), _m3 = new THREE.Matrix3(), _m = new THREE.Matrix4(), _s = new V3(1, 1, 1);
const surf = { y: 0, ship: null, type: 'water', localY: 0 };
const templates = new Map(), scorched = new Map();
const SHARDS = 140;
let shardMesh = null; const shards = [];

// a burnt version of a paint material (made once per material)
function scorch(mat) {
  let s = scorched.get(mat);
  if (!s) { s = mat.clone(); if (s.color) s.color.multiplyScalar(0.42); if ('roughness' in s) s.roughness = 0.95; if ('metalness' in s) s.metalness *= 0.5; if ('envMapIntensity' in s) s.envMapIntensity = 0.2; scorched.set(mat, s); }
  return s;
}

// Cut a fresh copy of the aircraft's model into zones (level 1: nose/tail x left wing/body/right wing; level 2: finer).
// Rotors and other spinning parts always come away whole. Built once per aircraft type, nation, paint and level.
function template(type, nation, level, paint = '') {
  const key = `${type}|${nation}|${level}|${paint}`; let t = templates.get(key); if (t) return t;
  const g = wrecks.builders[type](nation, 0); g.updateMatrixWorld(true);
  const model = g.userData.model, L = model.dims.length, S = model.dims.span || L * 0.8;
  const spin = new Map(); for (const s of model.spinners || []) spin.set(s.node, s);
  const xe = level >= 2 ? [-0.3, -0.1, 0.1, 0.3] : [-0.13, 0.13], ze = level >= 2 ? [-0.17, 0.17] : [0];
  const bin = (v, edges, size) => { let i = 0; while (i < edges.length && v > edges[i] * size) i++; return i; };
  const zones = new Map();
  g.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry || !o.material || (o.material.transparent && o.material.opacity < 0.5)) return;
    for (let p = o; p && p !== g; p = p.parent) if (!p.visible) return;
    let sp = null; for (let p = o; p && p !== g; p = p.parent) if (spin.has(p)) { sp = p; break; }
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    if (!P || !N) return; _m3.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < P.count; i += 3) {
      _a.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); _b.fromBufferAttribute(P, i + 1).applyMatrix4(o.matrixWorld); _c.fromBufferAttribute(P, i + 2).applyMatrix4(o.matrixWorld);
      const cx = (_a.x + _b.x + _c.x) / 3, cz = (_a.z + _b.z + _c.z) / 3;
      const id = sp ? 'spin' + sp.id : bin(cx, xe, S) + '_' + bin(cz, ze, L);
      let z = zones.get(id); if (!z) { z = { mats: new Map(), n: 0, cx: 0, cy: 0, cz: 0, spin: !!sp, wing: !sp && Math.abs(cx) > 0.13 * S }; zones.set(id, z); }
      let arr = z.mats.get(o.material); if (!arr) { arr = { p: [], n: [], u: [] }; z.mats.set(o.material, arr); }
      for (let k = 0; k < 3; k++) {
        const v = k === 0 ? _a : k === 1 ? _b : _c; arr.p.push(v.x, v.y, v.z); z.cx += v.x; z.cy += v.y; z.cz += v.z; z.n++;
        _n.fromBufferAttribute(N, i + k).applyMatrix3(_m3).normalize(); arr.n.push(_n.x, _n.y, _n.z);
        if (U) arr.u.push(U.getX(i + k), U.getY(i + k)); else arr.u.push(0, 0);
      }
    }
  });
  const pieces = [];
  for (const z of zones.values()) {
    if (z.n < 9) continue;
    const c = new V3(z.cx / z.n, z.cy / z.n, z.cz / z.n), parts = []; let r = 0;
    for (const [mat, a] of z.mats) {
      for (let i = 0; i < a.p.length; i += 3) { a.p[i] -= c.x; a.p[i + 1] -= c.y; a.p[i + 2] -= c.z; r = Math.max(r, Math.hypot(a.p[i], a.p[i + 1], a.p[i + 2])); }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(a.u, 2));
      parts.push({ geo: bg, mat: scorch(mat) });
    }
    pieces.push({ parts, off: c, r, spin: z.spin, wing: z.wing, tris: z.n / 3 });
  }
  pieces.sort((p, q) => q.tris - p.tris);
  g.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  t = { pieces, L, S }; templates.set(key, t); return t;
}

function meshes(piece) { const g = new THREE.Group(); for (const p of piece.parts) { const m = new THREE.Mesh(p.geo, p.mat); m.castShadow = true; g.add(m); } return g; }

export const wrecks = {
  list: [], chutes: [], max: 46, builders: null,
  init(builders) {
    this.builders = builders; // the unit model builders (handed in to avoid a circular import)
    const geo = new THREE.BoxGeometry(1, 0.12, 0.7), mat = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.9, metalness: 0.3 });
    shardMesh = new THREE.InstancedMesh(geo, mat, SHARDS); shardMesh.count = 0; shardMesh.frustumCulled = false; gfx.scene.add(shardMesh);
    gfx.onQuality((q) => { this.max = q.simpleWater ? 20 : Math.round(30 + q.particles * 20); }); this.max = gfx.q.simpleWater ? 20 : Math.round(30 + gfx.q.particles * 20);
  },
  clear() { for (const w of this.list) gfx.scene.remove(w.obj); this.list.length = 0; for (const c of this.chutes) gfx.scene.remove(c.obj); this.chutes.length = 0; shards.length = 0; if (shardMesh) shardMesh.count = 0; },

  // What kind of end was it? Decided from the last thing that hit the aircraft and how it met the surface.
  severity(u, cause) {
    const sp = u.vel.length(), def = u.lastHitDef, recent = world.t - (u.lastHitT || -99) < 2.5;
    if (cause === 'water' || cause === 'deck' || cause === 'ground') {
      if (recent && def && def.type === 'missile') return 'heavy';
      const sink = Math.max(0, -u.vel.y);
      if (cause === 'water' && sp < 75 && sink < 16) return 'float';
      return sp > 120 || sink > 30 ? 'heavy' : 'medium';
    }
    if (!def) return 'light';
    const bombs = u.fw && u.fw.bomb && u.fw.bomb.ammo > 4;
    if (def.type === 'missile' || def.type === 'bomb' || def.type === 'torpedo' || def.key === 'heavy') return (u.lastHitAmount || 0) >= u.maxHp * 0.45 || bombs ? 'heavy' : 'medium';
    if (def.key === 'ciws' || def.key === 'cannon' || def.key === 'deckgun') return bombs && Math.random() < 0.5 ? 'heavy' : 'medium';
    return 'light';
  },

  // Called instead of simply removing a destroyed aircraft. cause: 'shot' | 'water' | 'deck' | 'ground'
  destroy(u, by, cause = 'shot') {
    const sev = this.severity(u, cause), far = (u.camDist ?? 0) > 2600 && !u.isPlayer, fast = gfx.q.simpleWater;
    const size = u.dims.length * 0.6, bombs = u.fw && u.fw.bomb && u.fw.bomb.ammo > 4;
    u.wreckSev = sev;
    if (sev === 'float') {
      fx.splash(u.pos, 9); this.intact(u, 'float');
    } else if (sev === 'light') {
      fx.explosion(u.pos, size * 0.45); this.intact(u, 'fall');
      if (!far && u.kind === 'jet' && Math.random() < 0.6) this.eject(u);
    } else {
      const heavy = sev === 'heavy';
      fx.explosion(u.pos, heavy ? size * (bombs ? 1.9 : 1.3) : size * 0.85);
      if (heavy) { for (let i = 0; i < 6; i++) fx.stack(_a.copy(u.pos).add(_b.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).multiplyScalar(size * 0.8)), size * 0.9, 0.08, 0.7); if (bombs) audio.play('bigexplosion', { pos: u.pos, vol: 1 }); }
      if (cause === 'water') fx.splash(u.pos, heavy ? 16 : 11);
      this.breakUp(u, heavy && !fast && !far ? 2 : 1, heavy ? 1 : 0.55, far || fast ? 4 : 99);
      this.spray(u.pos, u.vel, heavy ? 26 : 10, size);
      if (cause === 'deck' && u.crashShip) u.crashShip.damage(heavy ? 60 : 30, u, u.pos, WEAPONS.bomb);
    }
    world.remove(u);
    u.wreck = this.list.find((w) => w.owner === u && w.main) || null; // what a shot-down player's camera follows
  },

  // the whole airframe as one burning object: falling out of control ('fall') or floating after a slow ditching ('float')
  intact(u, mode) {
    const t = template(u.type, u.nation, 1, u.paint || ''), obj = new THREE.Group();
    for (const p of t.pieces) { const m = meshes(p); m.position.copy(p.off); obj.add(m); }
    obj.position.copy(u.pos); obj.quaternion.copy(u.quat); gfx.scene.add(obj);
    const w = { obj, owner: u, main: true, mode, r: t.L * 0.5, pos: obj.position, vel: u.vel.clone(), ang: new V3(rand(-0.3, 0.3), rand(-0.5, 0.5), rand(1.2, 2.4) * (Math.random() < 0.5 ? -1 : 1)), t: 0, life: 40, burn: 30, wing: false, shed: 0.4, type: u.type, nation: u.nation, paint: u.paint || '', boom: 0 };
    if (mode === 'float') { w.vel.multiplyScalar(0.25); w.vel.y = 0; w.ang.set(0, 0, 0); w.life = 9; w.burn = 6; }
    this.add(w); return w;
  },

  // separate pieces, each on its own way down
  breakUp(u, level, push, cap) {
    const t = template(u.type, u.nation, level, u.paint || ''), sp = u.vel.length(); let n = 0;
    for (const p of t.pieces) {
      if (n >= cap) break;
      const obj = meshes(p); _a.copy(p.off).applyQuaternion(u.quat); obj.position.copy(u.pos).add(_a); obj.quaternion.copy(u.quat); gfx.scene.add(obj);
      _b.copy(_a).normalize().multiplyScalar(rand(8, 26) * push + (p.spin ? 18 : 0)); if (_a.lengthSq() < 0.01) _b.set(rand(-1, 1), rand(0, 1), rand(-1, 1)).multiplyScalar(10 * push);
      const w = { obj, owner: u, main: n === 0, mode: 'piece', r: Math.max(p.r, 0.8), pos: obj.position, vel: u.vel.clone().multiplyScalar(rand(0.82, 1)).add(_b), ang: new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(p.spin ? 11 : p.wing ? 2.2 : 3.5), t: 0, life: 34, burn: p.spin ? 0 : rand(6, 22), wing: p.wing, spin: p.spin, boom: !p.spin && Math.random() < 0.3 * push ? rand(0.5, 2.6) : 0 };
      if (sp < 5) w.vel.y += rand(2, 8);
      this.add(w); n++;
    }
  },
  add(w) { this.list.push(w); while (this.list.length > this.max) { const o = this.list.findIndex((k) => !k.main) >= 0 ? this.list.findIndex((k) => !k.main) : 0; gfx.scene.remove(this.list[o].obj); this.list.splice(o, 1); } },

  // small fragments (one instanced mesh, reused)
  spray(pos, vel, n, size) {
    n = Math.round(n * (gfx.q.simpleWater ? 0.4 : 1));
    for (let i = 0; i < n; i++) { if (shards.length >= SHARDS) shards.shift(); shards.push({ p: pos.clone(), v: vel.clone().multiplyScalar(rand(0.6, 1)).add(_a.set(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).multiplyScalar(rand(8, 40))), e: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)), w: new V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), s: rand(0.25, 0.9) * Math.min(1.6, size * 0.12), t: 0 }); }
  },

  // sometimes the crew of a lightly hit plane get out: a canopy drifting down to the water
  eject(u) {
    const obj = new THREE.Group(), cloth = new THREE.MeshStandardMaterial({ color: 0xd8d6cc, roughness: 0.9, side: THREE.DoubleSide }), dark = new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.9 });
    const can = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth); can.position.y = 7.5; can.scale.y = 0.75; obj.add(can);
    const man = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 3, 6), dark); obj.add(man);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 7.6, 3), dark); l.position.set(Math.cos(a) * 1.5, 3.9, Math.sin(a) * 1.5); l.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); obj.add(l); }
    obj.position.copy(u.pos); obj.position.y += 4; gfx.scene.add(obj);
    this.chutes.push({ obj, vel: new V3(u.vel.x * 0.25, 18, u.vel.z * 0.25), t: 0, open: 0 }); obj.children[0].visible = false;
    if (u.isPlayer) world.say('Ejected', 'info');
  },

  update(dt, camPos) {
    const fast = gfx.q.simpleWater;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i], p = w.pos; w.t += dt;
      const near = p.distanceToSquared(camPos) < 3200 * 3200;
      if (w.mode === 'float') { // ditched: afloat and burning, then nose down and gone
        const wy = waveHeight(p.x, p.z), k = clamp((w.t - w.burn) / (w.life - w.burn), 0, 1);
        p.x += w.vel.x * dt; p.z += w.vel.z * dt; w.vel.multiplyScalar(1 - 1.2 * dt); p.y = wy - 0.4 - k * k * 14;
        w.obj.rotateX(-k * 0.5 * dt);
        if (w.t < w.burn && near && Math.random() < 0.5) { fx.fire(_a.set(p.x + rand(-2, 2), wy + 0.6, p.z + rand(-2, 2)), 2.2); }
      } else if (w.landed === 'water') { // sinking, with burning fuel left on the surface for a while
        p.y -= (1.2 + w.t * 0.3) * dt * 2; w.obj.rotateX(0.2 * dt);
        if (w.slick > 0) { w.slick -= dt; if (near && Math.random() < 0.3) fx.fire(_a.set(w.sx + rand(-1.5, 1.5), waveHeight(w.sx, w.sz) + 0.3, w.sz + rand(-1.5, 1.5)), 1.3); }
        if (p.y < -30 && w.slick <= 0) w.t = w.life;
      } else if (w.landed) { // on a deck or on the ground: slides to a stop and burns
        if (w.ship) { if (!w.ship.alive && w.ship.sinkT > 4) w.t = w.life; else { w.local.x += w.vel.x * dt; w.local.z += w.vel.z * dt; w.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt)); w.ship.toWorld(w.local, p); } }
        else { p.x += w.vel.x * dt; p.z += w.vel.z * dt; w.vel.multiplyScalar(Math.max(0, 1 - 2.5 * dt)); }
        if (w.burn > 0 && near && Math.random() < 0.35) fx.fire(_a.copy(p).setY(p.y + 0.5), Math.min(3, w.r * 0.6));
        w.burn -= dt;
      } else { // in the air
        const sp = w.vel.length(), cd = w.mode === 'fall' ? 0.0009 : w.wing ? 0.02 : w.spin ? 0.012 : 0.006;
        w.vel.multiplyScalar(Math.max(0, 1 - cd * sp * dt)); w.vel.y -= 9.81 * dt * (w.wing ? 0.75 : 1);
        if (w.wing) { w.vel.x += Math.sin(w.t * 3.1 + i) * 6 * dt; w.vel.z += Math.cos(w.t * 2.7 + i) * 6 * dt; } // flat pieces flutter
        if (w.mode === 'fall') { // out of control: nose drops, it rolls, and bits come off
          _a.set(0, 0, -1).applyQuaternion(w.obj.quaternion); _b.copy(w.vel).normalize(); _c.crossVectors(_a, _b); const s = _c.length();
          if (s > 0.001) { _q.setFromAxisAngle(_c.multiplyScalar(1 / s), Math.min(s, 1) * 1.6 * dt); w.obj.quaternion.premultiply(_q); }
          w.obj.rotateZ(w.ang.z * dt); w.shed -= dt;
          if (w.shed <= 0 && near) { w.shed = rand(0.5, 1.3); this.spray(p, w.vel, 2, 5); }
        } else { w.obj.rotateX(w.ang.x * dt); w.obj.rotateY(w.ang.y * dt); w.obj.rotateZ(w.ang.z * dt); }
        p.addScaledVector(w.vel, dt);
        // smoke and flame at a steady rate whatever the frame rate (about 14 puffs a second, half that in Fast Graphics)
        if (near && w.burn > 0) { w.em = (w.em || 0) + dt; const step = fast ? 0.14 : 0.07; let k = 0; while (w.em >= step && k++ < 4) { w.em -= step; fx.trail(_a.copy(p).addScaledVector(w.vel, -w.em), Math.min(6, 1.6 + w.r * 0.6), 0.07, 3.6); if (k === 1) fx.fire(p, Math.min(3.5, 0.8 + w.r * 0.5)); } if (w.em > 0.5) w.em = 0; }
        if (w.boom > 0 && w.t > w.boom) { w.boom = 0; fx.explosion(p, 5); this.spray(p, w.vel, 4, 5); } // fuel or ammunition going off
        if (p.y < 140) this.land(w, near);
      }
      if (w.owner && w.main && w.owner.wreck === w) w.owner.pos.copy(p); // the camera of a shot-down player follows this
      if (w.t >= w.life) { gfx.scene.remove(w.obj); this.list.splice(i, 1); }
    }
    // fragments
    let n = 0;
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i]; s.t += dt; s.v.y -= 9.81 * dt; s.v.multiplyScalar(1 - 0.4 * dt); s.p.addScaledVector(s.v, dt);
      if (s.t > 7 || s.p.y < waveHeight(s.p.x, s.p.z)) { if (s.t < 7 && Math.random() < 0.25 && s.p.distanceToSquared(camPos) < 1500 * 1500) fx.splash(s.p, 0.8, false); shards.splice(i, 1); continue; }
      s.e.x += s.w.x * dt; s.e.y += s.w.y * dt; s.e.z += s.w.z * dt;
    }
    for (const s of shards) { _q.setFromEuler(s.e); _s.setScalar(s.s); _m.compose(s.p, _q, _s); shardMesh.setMatrixAt(n++, _m); }
    shardMesh.count = n; shardMesh.instanceMatrix.needsUpdate = true;
    // parachutes
    for (let i = this.chutes.length - 1; i >= 0; i--) {
      const c = this.chutes[i]; c.t += dt;
      if (c.t > 1.1 && !c.open) { c.open = 1; c.obj.children[0].visible = true; }
      c.vel.y = c.open ? Math.max(c.vel.y - 30 * dt, -6.5) : c.vel.y - 9.81 * dt; c.vel.x *= 1 - 0.5 * dt; c.vel.z *= 1 - 0.5 * dt;
      c.obj.position.addScaledVector(c.vel, dt); c.obj.rotation.z = Math.sin(c.t * 0.9) * 0.08;
      if (c.obj.position.y < waveHeight(c.obj.position.x, c.obj.position.z) + 0.6 || c.t > 90) { fx.splash(c.obj.position, 1.5, false); gfx.scene.remove(c.obj); this.chutes.splice(i, 1); }
    }
  },

  // a piece reaches the sea, a deck or the ground
  land(w, near) {
    const p = w.pos; surfaceBelow(p, surf, 3);
    if (p.y - Math.min(w.r * 0.3, 1.5) > surf.y) return;
    const sp = w.vel.length(), big = w.r > 3;
    if (w.mode === 'fall') { // the intact airframe hits: now it breaks
      gfx.scene.remove(w.obj); const i = this.list.indexOf(w); if (i >= 0) this.list.splice(i, 1);
      const fake = { type: w.type, nation: w.nation, paint: w.paint, pos: p, quat: w.obj.quaternion, vel: w.vel.clone().multiplyScalar(surf.type === 'water' ? 0.25 : 0.4), wreck: null, isPlayer: false };
      fake.vel.y = Math.abs(w.vel.y) * 0.12 + 3;
      fx.explosion(p, 11); if (surf.type === 'water') fx.splash(p, 14); else if (surf.ship) surf.ship.damage(40, null, p, WEAPONS.bomb);
      this.breakUp(fake, 1, 0.5, gfx.q.simpleWater ? 3 : 6); this.spray(p, fake.vel, 10, 8);
      const next = this.list.find((k) => k.owner === fake && k.main) || null;
      if (w.owner && w.owner.wreck === w) { w.owner.wreck = next; if (next) next.owner = w.owner; }
      return;
    }
    if (surf.type === 'water') {
      w.landed = 'water'; w.slick = big && w.burn > 0 ? rand(5, 9) : 0; w.sx = p.x; w.sz = p.z; w.life = w.t + 14;
      if (near) { fx.splash(p, clamp(w.r * 1.3, 1.5, 9), big); for (let k = 0; k < 3; k++) fx.puff(_a.set(p.x + rand(-1, 1), surf.y + 0.5, p.z + rand(-1, 1)), 0, rand(2, 4), 0, 2 + w.r * 0.4, 0.92, 0.5, 2.2, 3); } // splash and steam
      if (big) ocean.addFoam(p.x, p.z, 3 + w.r, 6);
    } else if (w.bounced || sp < 14) { // comes to rest
      w.landed = surf.type; w.ship = surf.ship || null; p.y = surf.y + Math.min(0.5, w.r * 0.2);
      if (w.ship) { w.local = w.ship.toLocal(p, new V3()); _a.copy(w.vel).sub(w.ship.vel); _q.copy(w.ship.quat).invert(); _a.applyQuaternion(_q); w.vel.set(_a.x, 0, _a.z); } else w.vel.y = 0;
      w.burn = big ? rand(9, 16) : rand(3, 7); w.life = w.t + w.burn + 6;
    } else { // first touch: it bounces and can hurt what it lands on
      w.bounced = true; p.y = surf.y + Math.min(w.r * 0.3, 1.5) + 0.05; w.vel.y = Math.abs(w.vel.y) * 0.3; w.vel.x *= 0.6; w.vel.z *= 0.6; w.ang.multiplyScalar(0.5);
      if (surf.ship) { surf.ship.damage(big ? 25 : 8, null, p, WEAPONS.bomb); w.vel.add(surf.ship.vel.clone().multiplyScalar(0.4)); }
      if (near) { fx.spark(p, _a.set(0, 1, 0)); audio.play('hit', { pos: p, vol: 0.6 }); }
    }
  },
};
