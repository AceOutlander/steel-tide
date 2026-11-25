// Unit base class + Ship and Sub simulation (throttle, rudder, buoyancy on the real wave field, flooding, sinking, mounts).
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { fx } from '../gfx/effects.js';
import { MAT } from '../gfx/materials.js';
import { waveHeight } from '../gfx/ocean.js';
import { audio } from '../audio/audio.js';
import { world } from '../world/world.js';
import { UNITS, WEAPONS, NATIONS, MAP } from '../core/config.js';
import { save } from '../core/save.js';
import { V3, clamp, damp, rand, wrapPi, approach, yawToDir, T } from '../core/util.js';
import { Mount, weapons } from './weapons.js';

const _a = new V3(), _b = new V3(), _c = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const scorchGeo = new THREE.CircleGeometry(1, 10);

export class Unit {
  constructor(type, nation, name = '') {
    this.type = type; this.def = UNITS[type]; this.kind = this.def.kind; this.nation = nation; this.name = name;
    this.pos = new V3(); this.vel = new V3(); this.quat = new THREE.Quaternion(); this.yaw = 0; this.speed = 0;
    this.maxHp = this.hp = this.def.hp; this.alive = true; this.gone = false; this.isPlayer = false; this.ai = null;
    this.mounts = []; this.radius = 10; this.isAir = false; this.seen = false; this.incoming = 0;
    this.flares = this.def.flares || 0; this.flareCd = 0; this.flareT = 0; this.fires = []; this.scorch = 0; this.depth = 0;
    this.root = new THREE.Group(); this.lodDist = 500; this.box = { x: 3, y0: -2, y1: 4, z: 8 }; this.kills = 0; this.t = rand(0, 10);
    this.selKey = null; this.aimPoint = new V3(); this.aimLead = null; this.firing = false;
    this.prevPos = new V3(); this.prevQuat = new THREE.Quaternion(); this._pp = new V3(); this._pq = new THREE.Quaternion(); this._hasPrev = false; this._pushed = false;
    this.bounds = new THREE.Box3(new V3(-1, -1, -1), new V3(1, 2, 1)); this.hideModel = false;
  }
  setModel(build) {
    this.lod0 = build(this.nation, 0); this.lod1 = build(this.nation, 1); this.lod1.visible = false;
    this.root.add(this.lod0, this.lod1); this.model = this.lod0.userData.model; this.dims = this.model.dims;
    for (const t of this.model.turrets || []) this.mounts.push(new Mount(this, t, t.kind));
    this.bounds.setFromObject(this.lod0); // the box that holds the whole model, in its own coordinates (the root is still at the origin)
  }
  get label() { return world.label(this); }
  sync() { this.root.position.copy(this.pos); this.root.quaternion.copy(this.quat); }
  // Smooth drawing between fixed physics steps: remember the pose before each step, and for the drawn frame stand the unit
  // part-way (a = 0..1) between that and the new pose. Everything drawn in the frame (model, camera, crew) reads pos/quat,
  // so they all move together; the real values go back afterwards.
  keepPose() { this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat); this._hasPrev = true; }
  pushRender(a) {
    if (!this._hasPrev || a >= 0.999 || this.prevPos.distanceToSquared(this.pos) > 900) return; // a jump (spawn, docking) is not smoothed
    this._pp.copy(this.pos); this._pq.copy(this.quat); this._pushed = true;
    this.pos.lerpVectors(this.prevPos, this._pp, a); this.quat.slerpQuaternions(this.prevQuat, this._pq, a);
  }
  popRender() { if (this._pushed) { this.pos.copy(this._pp); this.quat.copy(this._pq); this._pushed = false; } }
  updateLod(cam) {
    const d = this.pos.distanceTo(cam), far = d > this.lodDist * gfx.q.lod && !this.isPlayer;
    if (this.hideModel) { this.lod0.visible = this.lod1.visible = false; this.camDist = d; return; } // first person in a cockpit
    if (!this.lod0.visible && !this.lod1.visible) this.lod0.visible = !far;
    if (this.lod0.visible === far) { this.lod0.visible = !far; this.lod1.visible = far; }
    this.camDist = d;
  }
  // segment (world) vs oriented box. Writes the entry point to out.
  hitTest(p0, p1, out, pad = 0) {
    _q.copy(this.quat).invert();
    _a.copy(p0).sub(this.pos).applyQuaternion(_q); _b.copy(p1).sub(this.pos).applyQuaternion(_q);
    const bx = this.box, min = [-bx.x - pad, bx.y0 - pad, -bx.z - pad], max = [bx.x + pad, bx.y1 + pad, bx.z + pad];
    const a = [_a.x, _a.y, _a.z], d = [_b.x - _a.x, _b.y - _a.y, _b.z - _a.z];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (a[i] < min[i] || a[i] > max[i]) return false; continue; }
      let ta = (min[i] - a[i]) / d[i], tb = (max[i] - a[i]) / d[i]; if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
    }
    out.copy(p0).lerp(p1, t0);
    return true;
  }
  distToPoint(p) {
    _q.copy(this.quat).invert(); _a.copy(p).sub(this.pos).applyQuaternion(_q);
    const bx = this.box, dx = Math.max(Math.abs(_a.x) - bx.x, 0), dy = Math.max(bx.y0 - _a.y, _a.y - bx.y1, 0), dz = Math.max(Math.abs(_a.z) - bx.z, 0);
    return Math.hypot(dx, dy, dz);
  }
  toLocal(p, out) { _q.copy(this.quat).invert(); return out.copy(p).sub(this.pos).applyQuaternion(_q); }
  toWorld(local, out) { return out.copy(local).applyQuaternion(this.quat).add(this.pos); }
  damage(amount, attacker, hitPos, def) {
    if (!this.alive || amount <= 0) return;
    if (this.invuln > world.t) return;
    this.hp -= amount; if (attacker && attacker !== this) this.lastHitBy = attacker; this.lastHitT = world.t;
    if (this.isPlayer) { this.hitFlash = 1; if (amount > 20) audio.play('hit', { vol: 0.9 }); gfx.shake(clamp(amount / (this.maxHp * 0.12 + 40), 0.12, 0.7)); }
    if (attacker && attacker.isPlayer && attacker !== this) attacker.hitMarker = world.t + 0.25;
    if (hitPos && amount >= 30 && this.lod0 && (this.kind === 'ship' || this.kind === 'sub')) this.addScorch(hitPos, Math.min(5, 1 + amount * 0.004));
    if (this.hp <= 0) { this.hp = 0; this.kill(attacker || this.lastHitBy); }
  }
  addScorch(hitPos, size) {
    const l = this.toLocal(hitPos, new V3());
    if (this.fires.length < 4 && this.hp < this.maxHp * (0.7 - this.fires.length * 0.18)) this.fires.push({ p: l.clone().setY(Math.max(l.y, this.box.y1 * 0.35)), s: 2 + size });
    if (this.scorch >= 14) return; this.scorch++;
    const m = new THREE.Mesh(scorchGeo, MAT.soot); m.scale.setScalar(size * 1.3);
    const bx = this.box;
    if (Math.abs(l.x) > bx.x * 0.8 && l.y < bx.y1 * 0.6) { m.rotation.y = l.x > 0 ? Math.PI / 2 : -Math.PI / 2; m.position.set(l.x + Math.sign(l.x) * 0.15, l.y, l.z); }
    else { m.rotation.x = -Math.PI / 2; m.position.set(l.x, l.y + 0.15, l.z); }
    m.renderOrder = 3; this.lod0.add(m);
  }
  kill(attacker) {
    if (!this.alive) return; this.alive = false; this.killedT = world.t;
    const by = attacker && attacker !== this ? attacker : null;
    const verb = this.kind === 'ship' || this.kind === 'sub' ? 'sunk' : this.kind === 'soldier' ? (by ? 'killed' : 'lost') : by ? 'shot down' : 'crashed';
    const mine = by && by.isPlayer, cls = this.isPlayer ? 'bad' : mine ? 'mine' : this.nation === world.playerNation ? 'loss' : 'win';
    world.say(`${this.label} ${verb}${by ? ' by ' + by.label : ''}`, cls);
    if (by) { by.kills++; world.score[by.nation] += this.def.score; if (mine) save.addKill(this.type, this.kind); }
    world.onKill && world.onKill(this, by);
    this.onKilled(by);
  }
  onKilled() { fx.explosion(this.pos, 10); world.remove(this); }
  update() {}
  dispose() {}
  // pick the best enemy for an automatic mount
  autoTarget(m, dt) {
    m.scan -= dt;
    const k = m.key, def = m.def;
    if (m.scan <= 0 || (m.target && !m.target.alive)) {
      m.scan = 0.5 + Math.random() * 0.3; let best = null, bd = 1e9; const maxR = this.isPlayer ? def.range : def.aiRange || def.range; m.pos(_a);
      for (const u of world.units) {
        if (!u.alive || u.nation === this.nation || !u.seen) continue;
        if (k === 'ciws' || k === 'sam') { if (!u.isAir) continue; if (k === 'sam' && (u.pos.y < 25 || (u.cloaked && u.pos.distanceTo(_a) > 2600))) continue; }
        else if (k === 'mg' || k === 'chin') { if (u.kind === 'sub' && u.depth > 2) continue; if (u.kind === 'jet') continue; if (u.kind === 'ship' && u.def.armor > 1) continue; }
        else if (u.isAir || (u.kind === 'sub' && u.depth > 4) || u.kind === 'soldier') continue;
        const d0 = u.pos.distanceTo(_a); if (d0 > maxR) continue; const d = d0 * (u === this.aiTarget ? 0.5 : 1); if (d < bd) { bd = d; best = u; }
      }
      if (best !== m.target) m.lock = 0; m.target = best;
    }
    return m.target;
  }
  // crew-operated mounts: aim with lead and fire
  runAutoMount(m, dt) {
    const tg = this.autoTarget(m, dt);
    if (!tg) { m.lock = 0; if (m.t.kind !== 'sam') m.rest(dt); return; }
    _b.copy(tg.vel).sub(this.vel);
    const ok = m.aimAt(tg.aimPos ? tg.aimPos(_c) : tg.pos, dt, m.def.type === 'missile' ? null : _b);
    if (m.def.type === 'missile') {
      m.lock += dt; if (tg.isPlayer) tg.lockedBy = world.t + 0.5;
      if (m.lock >= m.def.lockTime && m.inArc && (tg.incoming || 0) < 2 && m.cd <= 0) m.fire(tg);
    } else if (ok) m.fire();
  }
  updateMounts(dt) {
    for (const m of this.mounts) {
      m.cd -= dt;
      if (m.manned) continue; // a player marine has taken this gun
      if (this.isPlayer && m.key === this.selKey) { const ok = m.aimAt(this.aimPoint, dt, this.aimLead); if (this.firing && (ok || m.key === 'mg' || m.key === 'chin') && m.inArc) m.fire(); continue; }
      if (this.ai || this.isPlayer || this.crewed) this.runAutoMount(m, dt);
    }
  }
  weaponKeys() { const s = []; for (const m of this.mounts) if (!s.includes(m.key) && m.key !== 'ciws' && m.key !== 'sam') s.push(m.key); return s; }
}

// ---------------------------------------------------------------------------------------------------------------------------
export class Ship extends Unit {
  constructor(type, nation, name, build) {
    super(type, nation, name);
    this.setModel(build);
    const d = this.dims;
    this.radius = d.length * 0.55; this.lodDist = d.length * 16;
    this.box = { x: d.beam / 2, y0: -d.draft, y1: Math.min(d.height * 0.5, type === 'carrier' ? 22 : 16), z: d.length / 2 };
    this.throttle = 0; this.rudder = 0; this.rudderA = 0; this.ctl = { throttle: 0, rudder: 0 };
    this.pitchA = 0; this.rollA = 0; this.heave = 0; this.flood = 0; this.list = 0; this.sinkT = 0; this.sunk = 0;
    this.selKey = this.weaponKeys()[0] || null; this.crewed = true; this.smokeT = 0; this.resp = clamp(60 / d.length, 0.35, 3.2);
    this.docked = null; // battlecruiser: the sub in the stern dock
  }
  update(dt) {
    this.t += dt;
    if (!this.alive) return this.updateSinking(dt);
    if (this.ai) this.ai.update(dt);
    const def = this.def, d = this.dims;
    this.throttle = approach(this.throttle, clamp(this.ctl.throttle, -0.4, 1), dt * 0.7);
    this.rudderA = approach(this.rudderA, clamp(this.ctl.rudder, -1, 1), dt * (0.6 + this.resp * 0.3));
    const hpF = this.hp / this.maxHp, top = def.speed * (1 - 0.55 * this.flood) * (hpF < 0.25 ? 0.6 : 1);
    this.speed = damp(this.speed, this.throttle * top, 2.2 / def.accelT, dt);
    this.speed *= 1 - 0.1 * Math.abs(this.rudderA) * dt;
    const yawRate = this.rudderA * def.turn * clamp(Math.abs(this.speed) / (def.speed * 0.4), 0, 1) * Math.sign(this.speed || 1);
    this.yaw = wrapPi(this.yaw + yawRate * dt);
    const fx_ = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let nx = this.pos.x + fx_ * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    // running aground
    const bow = d.length * 0.45 * Math.sign(this.speed || 1), gy = world.terrain(nx + fx_ * bow, nz + fz * bow);
    if (gy > -d.draft - this.depthNow()) { this.speed *= -0.25; nx = this.pos.x; nz = this.pos.z; if ((this.agT || 0) < world.t) { this.agT = world.t + 1.5; this.damage(this.maxHp * 0.01, null, null, null); if (this.isPlayer) world.say('Run aground!', 'bad'); } }
    if (Math.abs(nx) > MAP.half) { nx = Math.sign(nx) * MAP.half; } if (Math.abs(nz) > MAP.half) { nz = Math.sign(nz) * MAP.half; }
    this.vel.set((nx - this.pos.x) / dt, 0, (nz - this.pos.z) / dt);
    this.pos.x = nx; this.pos.z = nz;
    this.float(dt, yawRate);
    this.updateMounts(dt);
    this.effects(dt, hpF);
  }
  depthNow() { return 0; }
  float(dt, yawRate) {
    const d = this.dims, L = d.length * 0.4, Bm = d.beam * 0.42, fx_ = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = -fz, rz = fx_;
    const x = this.pos.x, z = this.pos.z;
    const hb = waveHeight(x + fx_ * L, z + fz * L), hs = waveHeight(x - fx_ * L, z - fz * L), hp = waveHeight(x - rx * Bm, z - rz * Bm), hsb = waveHeight(x + rx * Bm, z + rz * Bm), hc = waveHeight(x, z);
    const big = clamp(40 / d.length, 0.12, 1); // long hulls bridge the waves
    const ty = ((hb + hs + hp + hsb + hc * 2) / 6) * (0.5 + 0.5 * big) - this.flood * d.draft * 1.3;
    const tp = Math.atan2(hb - hs, 2 * L) * (0.4 + 0.6 * big) + clamp(this.speed / this.def.speed, -1, 1) * 0.012 * this.resp;
    const tr = Math.atan2(hsb - hp, 2 * Bm) * (0.35 + 0.5 * big) + yawRate * this.speed * 0.012 * Math.min(this.resp, 1.5) + this.list;
    this.heave = damp(this.heave, ty, this.resp * 1.6, dt); this.pitchA = damp(this.pitchA, tp, this.resp * 1.4, dt); this.rollA = damp(this.rollA, tr, this.resp * 1.2, dt);
    this.pos.y = this.heave - this.depthNow();
    _e.set(this.pitchA, this.yaw, this.rollA, 'YXZ'); this.quat.setFromEuler(_e);
  }
  effects(dt, hpF) {
    for (const s of this.model.spinners) s.node.rotation[s.axis] += s.speed * dt * (s.prop ? this.throttle : 1);
    const near = (this.camDist || 0) < 3500;
    if (this.parkedGroup) this.parkedGroup.visible = (this.camDist || 0) < 1700 * gfx.q.lod;
    if (near) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.12;
        for (const p of this.model.smoke) { this.toWorld(p, _a); fx.stack(_a, 2 + this.dims.length * 0.012, 0.3, 0.12 + 0.2 * Math.abs(this.throttle)); }
        for (const f of this.fires) { this.toWorld(f.p, _a); fx.fire(_a, f.s); }
        // bow spray
        const sp = Math.abs(this.speed) / this.def.speed;
        if (sp > 0.45 && this.camDist < 1200 && this.kind === 'ship') { _b.set(rand(-0.3, 0.3) * this.dims.beam, 0.5, -this.dims.length * 0.44); this.toWorld(_b, _a); _a.y = waveHeight(_a.x, _a.z) + 0.4; fx.spray(_a, this.vel.x * 0.4, this.vel.z * 0.4, 1.5 + this.dims.beam * 0.12); }
      }
    }
    if (hpF < 0.5) { this.flood = Math.min(0.5, this.flood + dt * 0.002 * (1 - hpF)); this.list = damp(this.list, (this.listDir || (this.listDir = Math.random() < 0.5 ? -1 : 1)) * (0.5 - hpF) * 0.22, 0.2, dt); }
  }
  onKilled() {
    // the wreck stays: fires, a growing list, then it slides under
    fx.explosion(_a.copy(this.pos).setY(this.pos.y + 6), 12 + this.dims.length * 0.08);
    this.sinkDir = Math.random() < 0.5 ? -1 : 1; this.sinkPitch = rand(-1, 1) > 0 ? 1 : -1;
    for (let i = this.fires.length; i < 3; i++) this.fires.push({ p: new V3(rand(-0.2, 0.2) * this.dims.beam, this.box.y1 * 0.4, rand(-0.3, 0.3) * this.dims.length), s: 3 + this.dims.length * 0.02 });
    if (this.docked) { this.docked.dockedTo = null; this.docked = null; }
  }
  updateSinking(dt) {
    this.sinkT += dt; const d = this.dims, dur = 14 + d.length * 0.09;
    this.speed = damp(this.speed, 0, 0.3, dt);
    this.pos.x += -Math.sin(this.yaw) * this.speed * dt; this.pos.z += -Math.cos(this.yaw) * this.speed * dt; this.vel.set(0, 0, 0);
    const k = this.sinkT / dur;
    this.sunk += dt * (0.4 + k * k * (d.draft + d.height * 0.5) / dur * 3);
    this.rollA = damp(this.rollA, this.sinkDir * Math.min(1.1, 0.25 + k * 0.9), 0.5, dt); this.pitchA = damp(this.pitchA, this.sinkPitch * Math.min(0.5, k * 0.45), 0.4, dt);
    this.pos.y = waveHeight(this.pos.x, this.pos.z) * 0.3 - this.sunk;
    _e.set(this.pitchA, this.yaw, this.rollA, 'YXZ'); this.quat.setFromEuler(_e);
    if ((this.camDist || 0) < 4000) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = 0.14; for (const f of this.fires) { this.toWorld(f.p, _a); if (_a.y > 0.5) fx.fire(_a, f.s); else if (Math.random() < 0.4) { _a.y = 0.3; fx.splash(_a, 2, false); } }
        if (Math.random() < 0.3) { _a.set(this.pos.x + rand(-1, 1) * d.beam, 0.3, this.pos.z + rand(-1, 1) * d.length * 0.3); fx.splash(_a, 3, false); } }
    }
    if (this.pos.y < -(d.height + 12)) world.remove(this);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
export const DEPTHS = { surface: 0, periscope: 13, deep: 60 };
export class Sub extends Ship {
  constructor(type, nation, name, build) {
    super(type, nation, name, build);
    this.depth = 0; this.depthT = 0; this.scope = false; this.scopeA = 0; this.pingT = 0; this.pinged = 0; this.dockedTo = null; this.crewed = false;
    const d = this.dims; this.box = { x: d.beam / 2, y0: -d.draft, y1: (this.model.sailTop || d.height - d.draft), z: d.length / 2 };
    this.tubes = this.def.weapons.includes('torpedo') ? { def: WEAPONS.torpedo, cd: 0, n: 0, ready: WEAPONS.torpedo.tubes, loadT: 0 } : null;
    this.selKey = this.tubes ? 'torpedo' : null; this.maxDepth = 160;
  }
  depthNow() { return this.depth; }
  setDepthMode(mode) { this.depthT = DEPTHS[mode]; }
  ping() {
    if (this.pingCd > world.t) return false;
    this.pingCd = world.t + 6; this.pingT = world.t + 5; this.pinged = world.t + 12; audio.play('ping', { pos: this.pos, vol: 1 });
    return true;
  }
  fireTorpedo(target) {
    const tb = this.tubes; if (!tb || tb.ready <= 0 || tb.cd > 0 || this.depth > 40 || this.dockedTo) return false;
    tb.ready--; tb.cd = 1.2; const pts = this.model.tubes; const p = pts && pts.length ? pts[tb.n++ % pts.length] : _b.set(0, -2, -this.dims.length / 2);
    this.toWorld(p, _a); weapons.fireTorpedo(this, tb.def, _a, this.yaw, target || null);
    return true;
  }
  update(dt) {
    if (this.alive) {
      const tb = this.tubes; if (tb) { tb.cd -= dt; if (tb.ready < tb.def.tubes) { tb.loadT += dt; if (tb.loadT >= tb.def.reload) { tb.loadT = 0; tb.ready++; } } }
      if (this.dockedTo) return this.updateDocked(dt);
      const rate = 2.2 + Math.abs(this.speed) * 0.12;
      this.depthT = clamp(this.depthT, 0, this.maxDepth);
      const floor = -world.terrain(this.pos.x, this.pos.z) - this.dims.draft - 3; // do not dig into the seabed
      this.depth = approach(this.depth, Math.max(0, Math.min(this.depthT, floor)), rate * dt);
      const want = this.scope && this.depth > 6 && this.depth < 20 ? 1 : 0; this.scopeA = approach(this.scopeA, want, dt * 0.8);
      const mast = this.model.mast; if (mast) mast.position.y = mast.userData.down + (mast.userData.up - mast.userData.down) * this.scopeA;
      if (this.depth > 3 && (this.camDist || 0) < 400 && Math.random() < 0.4) { _b.set(rand(-1, 1), 1, this.dims.length * 0.48); this.toWorld(_b, _a); fx.bubbles(_a, 1.5); }
    }
    super.update(dt);
    if (this.alive && this.depth > 8) { // below the swell
      const k = clamp((this.depth - 8) / 12, 0, 1); this.pos.y = -this.depth + this.heave * (1 - k);
      _e.set(this.pitchA * (1 - k) + clamp((this.depthT - this.depth) * -0.01, -0.12, 0.12), this.yaw, this.rollA * (1 - k), 'YXZ'); this.quat.setFromEuler(_e);
    }
  }
  updateDocked(dt) {
    const s = this.dockedTo, dk = s.model.dock;
    this.yaw = s.yaw; this.depth = 0; this.speed = s.speed; this.vel.copy(s.vel); this.throttle = 0; this.ctl.throttle = 0;
    s.toWorld(dk.pos, this.pos); this.pos.y = s.pos.y * 0.5; this.quat.copy(s.quat);
  }
  dock(ship) { this.dockedTo = ship; ship.docked = this; this.ctl.throttle = 0; this.ctl.rudder = 0; this.depthT = 0; }
  undock() { const s = this.dockedTo; if (!s) return; s.docked = null; this.dockedTo = null; this.speed = s.speed - 3; this.throttle = -0.3; this.ctl.throttle = -0.35; this.undockT = world.t + 9; }
  canDock(ship) {
    if (!ship || !ship.alive || ship.docked || !ship.model.dock || this.depth > 1.5) return false;
    ship.toWorld(ship.model.dock.pos, _a); return Math.hypot(_a.x - this.pos.x, _a.z - this.pos.z) < 45 && Math.abs(wrapPi(this.yaw - ship.yaw)) < 0.6 && Math.abs(this.speed - ship.speed) < 7;
  }
}
