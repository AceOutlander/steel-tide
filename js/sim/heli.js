// Helicopter flight model: collective for lift, tilt for speed, yaw pedals; lands on decks, helipads, islands. Carries marines.
import * as THREE from 'three';
import { fx } from '../gfx/effects.js';
import { audio } from '../audio/audio.js';
import { world } from '../world/world.js';
import { WEAPONS } from '../core/config.js';
import { V3, clamp, damp, approach, wrapPi } from '../core/util.js';
import { Unit } from './unit.js';
import { weapons } from './weapons.js';
import { surfaceBelow } from './surface.js';

const _a = new V3(), _b = new V3(), _f = new V3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const surf = { y: 0, ship: null, type: 'water', localY: 0 };
const TILT = 0.52;

export class Heli extends Unit {
  constructor(type, nation, name, build) {
    super(type, nation, name); this.setModel(build);
    const d = this.dims; this.radius = d.length * 0.6; this.lodDist = d.length * 34; this.isAir = true;
    this.box = { x: 1.8, y0: -d.height * 0.45, y1: d.height * 0.5, z: d.length * 0.5 };
    this.ctl = { pitch: 0, roll: 0, yaw: 0, collective: 0 }; // pitch: +1 = nose down / forward
    this.pitchA = 0; this.rollA = 0; this.rpm = 0; this.state = 'landed'; this.on = null; this.onLocal = new V3(); this.onYaw = 0;
    this.passengers = []; this.pilot = null; // pilot: a player Soldier when a marine is flying it
    this.fw = {}; for (const k of this.def.weapons) if (k !== 'chin') this.fw[k] = { def: WEAPONS[k], ammo: WEAPONS[k].ammo ?? Infinity, cd: 0, n: 0 };
    this.selKey = this.def.weapons[0] || null; this.lockTarget = null; this.lockProg = 0; this.locked = false; this.engine = true;
  }
  fwd(out) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  // put it down on a ship deck (local point on the deck surface) or on the ground (ship = null, local = world point)
  place(ship, local, yaw) {
    this.state = 'landed'; this.on = ship; this.onLocal.copy(local); this.onYaw = yaw; this.rpm = 0; this.vel.set(0, 0, 0); this.pitchA = this.rollA = 0; this.stick();
  }
  stick() {
    const gh = this.model.gearHeight;
    if (this.on) { const s = this.on; _a.copy(this.onLocal); _a.y += gh; s.toWorld(_a, this.pos); this.yaw = wrapPi(s.yaw + this.onYaw); _e.set(s.pitchA, this.yaw, s.rollA, 'YXZ'); this.quat.setFromEuler(_e); this.vel.copy(s.vel); }
    else { this.pos.copy(this.onLocal); this.pos.y += gh; this.yaw = this.onYaw; _e.set(0, this.yaw, 0, 'YXZ'); this.quat.setFromEuler(_e); this.vel.set(0, 0, 0); }
  }
  update(dt) {
    this.t += dt; this.flareCd -= dt; for (const k in this.fw) this.fw[k].cd -= dt;
    if (this.ai) this.ai.update(dt);
    const c = this.ctl, def = this.def;
    const want = this.engine && (this.state === 'fly' || c.collective > 0.05 || this.spool) ? 1 : 0;
    this.rpm = approach(this.rpm, want, dt * 0.35);
    if (this.state === 'landed') {
      if (this.on && !this.on.alive) { this.on = null; this.kill(null); return; }
      this.stick();
      if (this.rpm > 0.92 && c.collective > 0.15) { this.state = 'fly'; this.vel.y += 1.5; if (this.on) { this.onYaw = 0; this.on = null; } }
    } else {
      this.pitchA = damp(this.pitchA, clamp(c.pitch, -1, 1) * TILT, 3.2, dt); this.rollA = damp(this.rollA, clamp(c.roll, -1, 1) * TILT, 3.6, dt);
      this.yaw = wrapPi(this.yaw + clamp(c.yaw, -1, 1) * 1.1 * dt - Math.tan(this.rollA) * 0.25 * dt * clamp(this.speed / 40, 0, 1));
      const fx_ = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = -fz, rz = fx_;
      const af = 9.81 * Math.tan(this.pitchA), ar = 9.81 * Math.tan(this.rollA), k = (9.81 * Math.tan(TILT)) / def.speed;
      this.vel.x += (fx_ * af + rx * ar - this.vel.x * k) * dt; this.vel.z += (fz * af + rz * ar - this.vel.z * k) * dt;
      const vyT = clamp(c.collective, -1, 1) * (c.collective > 0 ? 13 : 9) * this.rpm - (1 - this.rpm) * 30;
      this.vel.y = approach(this.vel.y, vyT, (this.rpm > 0.9 ? 7 : 12) * dt);
      this.pos.addScaledVector(this.vel, dt);
      this.speed = Math.hypot(this.vel.x, this.vel.z);
      _e.set(-this.pitchA, this.yaw, -this.rollA, 'YXZ'); this.quat.setFromEuler(_e);
      this.collide();
    }
    this.updateMounts(dt);
    // rotors
    for (const s of this.model.spinners) { s.node.rotation[s.axis] += s.speed * this.rpm * dt; if (s.disc) { const blur = this.rpm > 0.55; s.disc.visible = blur; s.blades.visible = !blur; } }
    if (this.hp < this.maxHp * 0.45 && (this.camDist || 0) < 2500 && Math.random() < 0.4) fx.trail(this.pos, 3, 0.12, 2.5);
  }
  collide() {
    const p = this.pos, gh = this.model.gearHeight;
    if (p.y > 200) { if (p.y > 3200) this.vel.y = Math.min(this.vel.y, 0); return; }
    surfaceBelow(p, surf, gh + 4);
    if (p.y - gh <= surf.y) {
      const hard = this.vel.y < -8.5 || Math.abs(this.pitchA) > 0.45 || Math.abs(this.rollA) > 0.45 || this.speed > 22;
      if (surf.type === 'water') { fx.splash(p, 10); this.kill(this.lastHitBy || null); return; }
      if (hard) { this.kill(this.lastHitBy || null); return; }
      if (surf.type === 'deck') { const s = surf.ship; s.toLocal(p, _a); _a.y = surf.localY; this.place(s, _a, wrapPi(this.yaw - s.yaw)); }
      else { _a.set(p.x, surf.y, p.z); this.place(null, _a, this.yaw); }
      this.spool = false; if (this.isPlayer || this.pilot) audio.play('hit', { vol: 0.4 });
    }
    if (Math.abs(p.x) > 12000) { p.x = Math.sign(p.x) * 12000; this.vel.x = 0; } if (Math.abs(p.z) > 12000) { p.z = Math.sign(p.z) * 12000; this.vel.z = 0; }
  }
  fire(key = this.selKey) {
    const w = this.fw[key]; if (!w || w.cd > 0 || w.ammo <= 0 || this.state !== 'fly') return false;
    if (!this.locked || !this.lockTarget) return false;
    const py = this.model.pylons; if (py && py.length) this.toWorld(py[w.n++ % py.length], _a); else _a.copy(this.pos);
    this.fwd(_f); weapons.fireMissile(this, w.def, _a, _f, this.lockTarget); w.cd = w.def.reload; w.ammo--; return true;
  }
  rearm() { for (const k in this.fw) this.fw[k].ammo = this.fw[k].def.ammo ?? Infinity; this.flares = this.def.flares; this.hp = this.maxHp; }
  onKilled(by) {
    fx.explosion(this.pos, 12);
    for (const s of [...this.passengers]) { s.aboard = null; s.kill(by); } this.passengers.length = 0;
    if (this.pilot) { const s = this.pilot; this.pilot = null; s.aboard = null; s.kill(by); }
    world.remove(this);
  }
}
