// Fixed-wing flight model (fighter, bomber, recon plane): thrust, drag, stall, g-limited turning, energy bleed, carrier
// catapult launches and arrested landings. The same "fly toward this direction" autopilot serves the player's mouse-aim
// and the computer-flown pilots.
import * as THREE from 'three';
import { fx } from '../gfx/effects.js';
import { waveHeight } from '../gfx/ocean.js';
import { audio } from '../audio/audio.js';
import { world } from '../world/world.js';
import { WEAPONS } from '../core/config.js';
import { V3, clamp, damp, rand, approach } from '../core/util.js';
import { Unit } from './unit.js';
import { weapons } from './weapons.js';
import { surfaceBelow } from './surface.js';
import { wrecks } from './wreck.js';
import { begin, tick } from './rearm.js';

const _a = new V3(), _b = new V3(), _c = new V3(), _f = new V3(), _u = new V3(), _r = new V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const XA = new V3(1, 0, 0), YA = new V3(0, 1, 0), ZA = new V3(0, 0, 1);
const surf = { y: 0, ship: null, type: 'water', local: new V3() };

// Autopilot: fill ctl so the aircraft turns its nose toward the world direction `dir`.
export function flyToward(u, dir, ctl) {
  _q.copy(u.quat).invert(); _a.copy(dir).applyQuaternion(_q); // local: x right, y up, -z forward
  const off = Math.acos(clamp(-_a.z, -1, 1));
  _r.set(1, 0, 0).applyQuaternion(u.quat);
  let rollErr;
  if (off > 0.1) { rollErr = Math.atan2(_a.x, _a.y); if (off < 0.35) rollErr = rollErr * ((off - 0.1) / 0.25) + Math.asin(clamp(_r.y, -1, 1)) * (1 - (off - 0.1) / 0.25); }
  else rollErr = Math.asin(clamp(_r.y, -1, 1)) + Math.atan2(_a.x, -_a.z) * 2;
  ctl.roll = clamp(rollErr * 2.4, -1, 1);
  const pitchErr = Math.atan2(_a.y, -_a.z);
  ctl.pitch = off > 0.35 ? clamp(off * 3, 0, 1) * Math.max(-0.2, Math.cos(rollErr)) : clamp(pitchErr * 4, -1, 1);
  ctl.yaw = clamp(-Math.atan2(_a.x, -_a.z) * 1.5, -1, 1) * (off < 0.5 ? 1 : 0.2);
}

// Missile lock: pick the enemy nearest the boresight inside the seeker cone and build lock time on it.
export function seekLock(u, def, dir, dt, wantAir) {
  let best = null, bestA = def.cone || 0.35;
  for (const e of world.units) {
    if (!e.alive || e.nation === u.nation || !e.seen || !!e.isAir !== wantAir) continue;
    if (!wantAir && (e.kind === 'soldier' || (e.kind === 'sub' && e.depth > 3))) continue;
    _a.copy(e.pos).sub(u.pos); const d = _a.length(); if (d > def.range || d < 80) continue;
    if (e.cloaked && d > 2500 && def.seeker === 'radar') continue;
    const ang = Math.acos(clamp(_a.dot(dir) / d, -1, 1)); if (ang < bestA) { bestA = ang; best = e; }
  }
  if (best !== u.lockTarget) { u.lockTarget = best; u.lockProg = 0; }
  if (best) { u.lockProg = Math.min(def.lockTime, u.lockProg + dt); if (best.isPlayer) best.lockedBy = world.t + 0.4; }
  u.locked = !!best && u.lockProg >= def.lockTime;
  return u.locked ? best : null;
}

export class Jet extends Unit {
  constructor(type, nation, name, build) {
    super(type, nation, name); this.setModel(build);
    const d = this.dims; this.radius = d.length * 0.6; this.lodDist = d.length * 34; this.isAir = true;
    this.box = { x: d.span * 0.32, y0: -d.height * 0.35, y1: d.height * 0.45, z: d.length * 0.5 };
    this.ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 0, ab: false }; this.throttle = 0; this.state = 'fly';
    this.gearDown = false; this.gLoad = 1; this.gSmooth = 1; this.carrier = null; this.deckLocal = new V3(); this.deckYaw = 0; this.catV = 0;
    this.fw = {}; for (const k of this.def.weapons) this.fw[k] = { def: WEAPONS[k], ammo: WEAPONS[k].ammo ?? Infinity, cd: 0, n: 0 };
    this.selKey = this.def.weapons[0] || null; this.lockTarget = null; this.lockProg = 0; this.locked = false;
    this.cloaked = false; this.cloakT = 0; this.cloakCd = 0; this.stalled = false; this.sweep = 0; this.speed = 0; this.ctlS = { pitch: 0, roll: 0, yaw: 0 };
  }
  fwd(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  // sit on a carrier deck spot (local position on the deck surface)
  park(carrier, local, yaw) { this.carrier = carrier; this.deckLocal.copy(local); this.deckYaw = yaw; this.state = 'deck'; this.gearDown = true; this.throttle = 0; this.catV = 0; this.speed = 0; this.stick(); }
  stick() {
    const c = this.carrier; _a.copy(this.deckLocal); _a.y += this.model.gearHeight; c.toWorld(_a, this.pos);
    _q.setFromAxisAngle(YA, this.deckYaw); this.quat.copy(c.quat).multiply(_q);
    this.vel.copy(c.vel);
  }
  launch(cat) { if (this.state !== 'deck' || this.service) return;   // not while the deck crew are still working on it
    this.deckLocal.copy(cat.pos); this.deckYaw = cat.yaw; this.state = 'cat'; this.catV = 0; this.catLeft = cat.length; this.throttle = 1; audio.play('catapult', { pos: this.pos }); }
  rearm() { for (const k in this.fw) { this.fw[k].ammo = this.fw[k].def.ammo ?? Infinity; } this.flares = this.def.flares; this.hp = this.maxHp; }

  update(dt) {
    this.t += dt; this.flareCd -= dt;
    for (const k in this.fw) this.fw[k].cd -= dt;
    if (this.ai) this.ai.update(dt);
    const def = this.def, c = this.ctl;
    this.throttle = approach(this.throttle, clamp(c.throttle, 0, 1), dt * 0.6);
    if (this.state === 'deck') {
      if (!this.carrier || !this.carrier.alive) { this.kill(null); return; } this.stick(); this.speed = 0;
      if (this.service && tick(this, dt) && this.isPlayer) world.say(this.def.weapons.length ? 'Rearmed, refuelled and repaired. Taxi to the catapult.' : 'Refuelled and repaired. Taxi to the catapult.', 'good');
    }
    else if (this.state === 'cat') {
      this.catV += 36 * dt; const s = this.catV * dt; this.catLeft -= s;
      this.deckLocal.x += -Math.sin(this.deckYaw) * s; this.deckLocal.z += -Math.cos(this.deckYaw) * s; this.stick();
      this.speed = this.catV;
      if (Math.random() < 0.6) { _a.copy(this.pos); _a.y -= this.model.gearHeight; fx.puff(_a, 0, 1, 0, 2, 0.95, 0.35, 1.2, 4); }
      if (this.catLeft <= 0 || !this.carrier.alive) { this.state = 'fly'; this.fwd(_f); _q.setFromAxisAngle(XA, 0.1); this.quat.multiply(_q); this.fwd(_f); this.vel.copy(_f).multiplyScalar(this.catV).add(this.carrier.vel); this.speed = this.vel.length(); this.carrier = null; this.launchT = world.t; }
    } else if (this.state === 'arrest') {
      if (!this.carrier.alive) { this.kill(null); return; }
      this.catV = Math.max(0, this.catV - 52 * dt); const s = this.catV * dt;
      this.deckLocal.x += -Math.sin(this.deckYaw) * s; this.deckLocal.z += -Math.cos(this.deckYaw) * s; this.stick(); this.speed = this.catV;
      if (this.catV <= 0) {   // stopped on the wires: the deck crew take over (see rearm.js)
        this.state = 'deck'; this.landedT = world.t;
        const sv = begin(this, this.carrier, this.def.weapons.length ? 'Deck crew rearming and refuelling' : 'Deck crew refuelling');
        if (this.isPlayer) world.say(sv ? `Trapped. ${sv.label}: about ${Math.round(sv.total)} s.` : 'Trapped. Nothing to load: taxi to the catapult when ready.', 'good');
      }
    } else this.fly(dt);
    this.visuals(dt);
  }

  fly(dt) {
    const def = this.def, c = this.ctl, s = this.ctlS;
    s.pitch = damp(s.pitch, c.pitch, 7, dt); s.roll = damp(s.roll, c.roll, 9, dt); s.yaw = damp(s.yaw, c.yaw, 6, dt);
    let speed = this.vel.length(); if (speed < 1) { this.fwd(_f); this.vel.copy(_f).multiplyScalar(1); speed = 1; }
    const auth = clamp((speed - def.stall * 0.45) / (def.stall * 0.9), 0.08, 1);
    const maxPitch = Math.min(def.pitchRate, (def.gLimit * 9.81) / Math.max(speed, 1)) * auth;
    const pr = s.pitch * maxPitch * (s.pitch < 0 ? 0.55 : 1), rr = s.roll * def.rollRate * auth, yr = s.yaw * 0.22 * auth;
    _q.setFromAxisAngle(XA, pr * dt); this.quat.multiply(_q);
    _q.setFromAxisAngle(ZA, -rr * dt); this.quat.multiply(_q);
    _q.setFromAxisAngle(YA, yr * dt); this.quat.multiply(_q);
    this.fwd(_f); _u.set(0, 1, 0).applyQuaternion(this.quat);
    // stall: the nose drops and the wing stops holding the aircraft up
    this.stalled = speed < def.stall;
    if (speed < def.stall * 1.25) {
      const k = clamp(1 - (speed - def.stall * 0.6) / (def.stall * 0.65), 0, 1);
      _a.set(0, -1, 0); _b.crossVectors(_f, _a); const sl = _b.length();
      if (sl > 0.01) { _q.setFromAxisAngle(_b.multiplyScalar(1 / sl), k * 0.9 * dt); this.quat.premultiply(_q); }
      this.vel.y -= 9.81 * k * 0.9 * dt;
    }
    this.quat.normalize();
    // the velocity vector swings round to the nose with a short lag (that lag is the angle of attack)
    _a.copy(this.vel).multiplyScalar(1 / speed);
    const before = _c.copy(_a);
    _a.lerp(_f, 1 - Math.exp(-(2.2 + 2.4 * auth) * dt)).normalize();
    const turn = before.angleTo(_a) / dt; // rad/s of the flight path
    const g = (turn * speed) / 9.81 + _u.y;
    this.gLoad = g; this.gSmooth = damp(this.gSmooth, g, 3, dt);
    const ab = c.ab && this.throttle > 0.8;
    const thrust = this.throttle * def.thrust + (ab ? def.abThrust - def.thrust : 0);
    const drag = def.drag * speed * speed * (1 + 0.035 * g * g) * (this.gearDown ? 1.7 : 1) * (1 - this.sweep * 0.12);
    speed = Math.max(1, speed + (thrust - drag - 9.81 * _a.y) * dt);
    this.vel.copy(_a).multiplyScalar(speed); this.speed = speed; this.abOn = ab;
    this.pos.addScaledVector(this.vel, dt);
    this.yaw = Math.atan2(-_f.x, -_f.z);
    // cloak timer (bomber)
    if (this.cloaked) { this.cloakT -= dt; if (this.cloakT <= 0) { this.cloaked = false; this.cloakCd = def.cloak.cooldown; if (this.isPlayer) world.say('Cloak exhausted', 'info'); } } else if (this.cloakCd > 0) this.cloakCd -= dt;
    this.collide(dt);
  }
  toggleCloak() { const ck = this.def.cloak; if (!ck) return; if (this.cloaked) { this.cloaked = false; this.cloakCd = ck.cooldown * (1 - this.cloakT / ck.time) + 5; } else if (this.cloakCd <= 0) { this.cloaked = true; this.cloakT = ck.time; audio.play('click'); } }

  collide() {
    const p = this.pos, gh = this.model.gearHeight;
    if (p.y > 140 || world.t - (this.launchT ?? -99) < 3.5) return; // just off the catapult: still over the bow
    surfaceBelow(p, surf, gh + 3);
    if (surf.type === 'deck' && p.y - gh <= surf.y + 0.2) {
      const sh = surf.ship; _a.copy(this.vel).sub(sh.vel);
      const sink = -_a.y, rel = _a.length(); _u.set(0, 1, 0).applyQuaternion(this.quat);
      if (this.gearDown && sink < 11 && rel < 135 && _u.y > 0.9 && sh.nation === this.nation && sh.type === 'carrier') {
        this.carrier = sh; sh.toLocal(p, this.deckLocal); this.deckLocal.y = surf.localY; this.fwd(_f); _q.copy(sh.quat).invert(); _f.applyQuaternion(_q);
        this.deckYaw = Math.atan2(-_f.x, -_f.z); this.catV = rel; this.state = 'arrest'; this.throttle = 0; this.ctl.throttle = 0; audio.play('hit', { pos: p });
      } else { this.crashInto = 'deck'; this.crashShip = sh; this.crash(); }
      return;
    }
    if (surf.type !== 'deck' && p.y - (this.gearDown ? gh : 1) < surf.y) { this.crashInto = surf.type === 'water' ? 'water' : 'ground'; this.crash(); }
    if (Math.abs(p.x) > 12500 || Math.abs(p.z) > 12500) { if (this.isPlayer && (this.edgeT || 0) < world.t) { this.edgeT = world.t + 4; world.say('Leaving the battle area: turn back', 'bad'); } if (Math.abs(p.x) > 14500 || Math.abs(p.z) > 14500) this.kill(null); }
  }
  crash() { this.kill(this.lastHitBy && world.t - (this.lastHitT || 0) < 12 ? this.lastHitBy : null); }
  onKilled(by) { wrecks.destroy(this, by, this.crashInto || 'shot'); } // breaks up and falls: see wreck.js

  // weapons ---------------------------------------------------------------------------------------------------------------
  bombImpact(out) { const h = this.pos.y, vy = this.vel.y, t = (vy + Math.sqrt(vy * vy + 2 * 9.81 * Math.max(h, 0))) / 9.81; return out.set(this.pos.x + this.vel.x * t * 0.98, 0, this.pos.z + this.vel.z * t * 0.98); }
  fire(key = this.selKey) {
    const w = this.fw[key]; if (!w || w.cd > 0 || w.ammo <= 0 || this.state !== 'fly') return false;
    const def = w.def; this.fwd(_f);
    if (def.type === 'gun') { _a.copy(this.pos).addScaledVector(_f, this.dims.length * 0.5); weapons.fireGun(this, def, _a, _f, this.vel, w.n++ % 3 === 0); w.cd = 1 / def.rof; w.ammo--; return true; }
    if (def.type === 'missile') {
      if (!this.locked || !this.lockTarget) return false;
      const py = this.model.pylons; if (py.length) this.toWorld(py[w.n++ % py.length], _a); else _a.copy(this.pos); _a.y -= 0.6;
      weapons.fireMissile(this, def, _a, _f, this.lockTarget); w.cd = def.reload; w.ammo--; return true;
    }
    if (def.type === 'bomb') { this.toWorld(this.model.bay || _b.set(0, -1.5, 0), _a); weapons.dropBomb(this, def, _a, this.vel); w.cd = def.reload; w.ammo--; return true; }
    return false;
  }

  visuals(dt) {
    const m = this.model, near = (this.camDist || 0) < 2500;
    for (const g of m.gear) g.visible = this.gearDown;
    const hot = this.state === 'fly' || this.state === 'cat';
    for (const b of m.burners) { const on = hot && (this.abOn || this.state === 'cat'); b.visible = on; if (on) b.scale.z = 0.8 + Math.random() * 0.4; }
    for (const s of m.spinners) { s.node.rotation[s.axis] += s.speed * dt * (s.blades ? Math.max(0.25, this.throttle) : 1); if (s.disc) { const blur = !(s.park && this.state === 'deck' && this.throttle < 0.05); s.disc.visible = blur; s.blades.visible = !blur; } } // v2 propellers (park: true) show their blades while parked
    if (m.surfaces && m.surfaces.ailL) { m.surfaces.ailL.rotation.x = this.ctlS.roll * 0.4; m.surfaces.ailR.rotation.x = -this.ctlS.roll * 0.4; } // v2 models: ailerons
    if (m.surfaces && m.surfaces.elevL) { m.surfaces.elevL.rotation.x = -this.ctlS.pitch * 0.35 + this.ctlS.roll * 0.15; m.surfaces.elevR.rotation.x = -this.ctlS.pitch * 0.35 - this.ctlS.roll * 0.15; }
    if (m.rudders) for (const r of m.rudders) r.rotation.y = this.ctlS.yaw * 0.4;
    if (m.swing) { this.sweep = damp(this.sweep, clamp((this.speed - 150) / 110, 0, 1), 0.8, dt); m.swing[0].rotation.y = m.swingSign[0] * this.sweep * 0.85; m.swing[1].rotation.y = m.swingSign[1] * this.sweep * 0.85; }
    if (this.lod0) { const tr = this.cloaked; if (tr !== this._tr) { this._tr = tr; this.lod0.traverse((o) => { if (o.isMesh) { if (tr) { o.userData.m0 = o.material; o.material = cloakMat(o.material); } else if (o.userData.m0) o.material = o.userData.m0; } }); } }
    if (near && hot && fx.k > 0.4) { for (const e of m.engines) { this.toWorld(e, _a); if (this.abOn) fx.heat(_a, this.vel.x * 0.9, this.vel.y * 0.9, this.vel.z * 0.9, 2.2); if (this.hp < this.maxHp * 0.5 && Math.random() < 0.5) fx.trail(_a, 3, 0.15, 2.5); } }
    if (near && this.state === 'fly' && this.gSmooth > 5.5 && Math.random() < 0.5) { for (const sx of [-1, 1]) { _b.set(sx * this.dims.span * 0.48, 0, this.dims.length * 0.2); this.toWorld(_b, _a); fx.trail(_a, 0.8, 0.97, 0.7); } }
  }
}
const cloakCache = new Map();
function cloakMat(m) { if (!cloakCache.has(m)) { const c = m.clone(); c.transparent = true; c.opacity = 0.32; c.depthWrite = false; cloakCache.set(m, c); } return cloakCache.get(m); }
