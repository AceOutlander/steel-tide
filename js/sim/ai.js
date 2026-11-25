// Computer-controlled crews: ship captains, submarine commanders, pilots, helicopter crews and marines.
import { world } from '../world/world.js';
import { MAP } from '../core/config.js';
import { V3, clamp, rand, wrapPi, angDiff, pick } from '../core/util.js';
import { weapons } from './weapons.js';
import { flyToward, seekLock } from './jet.js';
import { WEAPONS } from '../core/config.js';

const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3();
const sgn = (nation) => (nation === 'aethia' ? 1 : -1);
const enemyCarrier = (u) => world.carriers[u.nation === 'aethia' ? 'extro' : 'aethia'];
const ownCarrier = (u) => world.carriers[u.nation];

function nearestEnemy(u, filter, maxD = 1e9) {
  let best = null, bd = maxD;
  for (const e of world.units) { if (!e.alive || e.nation === u.nation || !e.seen || !filter(e)) continue; const d = e.pos.distanceTo(u.pos); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---- ships -----------------------------------------------------------------------------------------------------------------
class ShipAI {
  constructor(u, slot) { this.u = u; this.slot = slot || new V3(); this.think = rand(0, 1); this.target = null; this.side = Math.random() < 0.5 ? 1 : -1; this.heading = u.yaw; this.thr = 0.6; this.orbit = rand(0, 6.28); }
  update(dt) {
    const u = this.u; this.think -= dt;
    if (this.think <= 0) { this.think = 1 + Math.random() * 0.5; this.plan(); }
    // steer toward the planned heading
    const err = angDiff(u.yaw, this.heading);
    u.ctl.rudder = clamp(err * 2.2, -1, 1); u.ctl.throttle = this.thr * (Math.abs(err) > 1.2 ? 0.7 : 1);
  }
  plan() {
    const u = this.u, def = u.def, type = u.type, home = ownCarrier(u), foe = enemyCarrier(u);
    const isSurf = (e) => e.kind === 'ship' || (e.kind === 'sub' && e.depth < 4);
    let tg = nearestEnemy(u, isSurf, type === 'battlecruiser' ? 12000 : 7000);
    if (type === 'battlecruiser' && foe && foe.alive && foe.seen && foe.pos.distanceTo(u.pos) < 6500 && (!tg || tg.def.armor < 2)) tg = foe;
    this.target = tg; u.aiTarget = tg;
    let gx, gz, thr = 0.7;
    if (type === 'carrier') {
      // the flagship keeps to its own waters on a slow racetrack, and turns away from anything that gets close
      this.orbit += 0.012; gx = Math.sin(this.orbit) * 1100; gz = sgn(u.nation) * (MAP.carrierZ + Math.cos(this.orbit) * 500); thr = 0.5;
      if (tg && tg.pos.distanceTo(u.pos) < 3200) { gx = u.pos.x + (u.pos.x - tg.pos.x); gz = u.pos.z + (u.pos.z - tg.pos.z); thr = 1; }
    } else if (tg) {
      const d = tg.pos.distanceTo(u.pos), pref = type === 'battlecruiser' ? 4800 : type === 'corvette' ? 2600 : 800;
      const brg = Math.atan2(-(tg.pos.x - u.pos.x), -(tg.pos.z - u.pos.z));
      // close to gun range, then turn broadside so every turret bears
      let h; if (d > pref * 1.25) h = brg; else if (d < pref * 0.6) h = brg + this.side * 2.0; else h = brg + this.side * 1.25;
      gx = u.pos.x - Math.sin(h) * 1000; gz = u.pos.z - Math.cos(h) * 1000; thr = d > pref * 1.25 ? 1 : 0.75;
      if (Math.random() < 0.03) this.side *= -1;
    } else if (home && home.alive && type !== 'patrol') {
      // screen formation around the carrier, pushed toward the enemy
      _a.copy(this.slot).applyAxisAngle(_b.set(0, 1, 0), home.yaw).add(home.pos); gx = _a.x; gz = _a.z - sgn(u.nation) * 900;
      thr = Math.hypot(gx - u.pos.x, gz - u.pos.z) > 600 ? 0.9 : 0.45;
    } else {
      // patrol boats range ahead toward the enemy fleet
      const fz = foe && foe.alive ? foe.pos.z : -sgn(u.nation) * MAP.carrierZ, fxp = foe && foe.alive ? foe.pos.x : 0;
      gx = fxp + this.slot.x * 2; gz = fz + sgn(u.nation) * 1500; thr = 0.9;
    }
    let h = Math.atan2(-(gx - u.pos.x), -(gz - u.pos.z));
    h = this.avoid(h);
    this.heading = h; this.thr = thr;
  }
  // steer around islands, other ships and the map edge
  avoid(h) {
    const u = this.u, L = u.dims.length, look = L * 4 + 250;
    for (const is of world.islands) {
      const dx = is.x - u.pos.x, dz = is.z - u.pos.z, d = Math.hypot(dx, dz), R = is.r * 1.3 + L * 0.8;
      if (d > R + look) continue;
      const brg = Math.atan2(-dx, -dz), off = angDiff(h, brg), half = Math.asin(clamp(R / Math.max(d, R + 1), 0, 1));
      if (Math.abs(off) < half + 0.25) { const side = off >= 0 ? -1 : 1; h = brg + side * (half + 0.45); if (d < R) h = brg + Math.PI; }
    }
    for (const o of world.units) {
      if (o === u || (o.kind !== 'ship' && o.kind !== 'sub') || !o.alive) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz), R = (L + o.dims.length) * 0.75;
      if (d > R + L * 2) continue;
      const brg = Math.atan2(-dx, -dz), off = angDiff(h, brg);
      if (Math.abs(off) < 0.9) h = brg + (off >= 0 ? -1 : 1) * 1.2;
    }
    const m = MAP.half - 900;
    if (Math.abs(u.pos.x) > m || Math.abs(u.pos.z) > m) h = Math.atan2(u.pos.x, u.pos.z);
    return h;
  }
}

class SubAI extends ShipAI {
  constructor(u, slot) { super(u, slot); this.evade = 0; this.fireT = rand(4, 10); this.launchT = rand(40, 90); }
  update(dt) {
    const u = this.u;
    if (u.dockedTo) { this.launchT -= dt; if (this.launchT <= 0 && !u.dockedTo.isPlayer) u.undock(); return; }
    if (u.undockT > world.t) { u.ctl.throttle = -0.35; u.ctl.rudder = 0; return; }
    super.update(dt);
    this.fireT -= dt; this.evade -= dt;
    if (u.lastHitT && world.t - u.lastHitT < 1) this.evade = 30;
    const tg = this.target;
    u.scope = false;
    if (this.evade > 0) { u.depthT = 90; u.ctl.throttle = 1; return; }
    u.depthT = 13;
    if (tg && u.tubes) {
      const d = tg.pos.distanceTo(u.pos), brg = Math.atan2(-(tg.pos.x - u.pos.x), -(tg.pos.z - u.pos.z));
      u.scope = d < 4000;
      if (d < 2600 && Math.abs(angDiff(u.yaw, brg)) < 0.3 && this.fireT <= 0 && u.depth < 20) { if (u.fireTorpedo(tg)) this.fireT = rand(5, 9); }
      if (d < 500) this.evade = 20;
    }
  }
  plan() {
    const u = this.u, foe = enemyCarrier(u);
    const isSurf = (e) => e.kind === 'ship' && e.type !== 'patrol';
    let tg = nearestEnemy(u, isSurf, 9000); this.target = tg; u.aiTarget = tg;
    let gx, gz, thr = 0.6;
    if (this.evade > 0 && tg) { gx = u.pos.x * 2 - tg.pos.x; gz = u.pos.z * 2 - tg.pos.z; thr = 1; }
    else if (tg) { const d = tg.pos.distanceTo(u.pos); if (u.tubes || d > 2600) { gx = tg.pos.x + tg.vel.x * 20; gz = tg.pos.z + tg.vel.z * 20; } else { gx = u.pos.x; gz = u.pos.z + sgn(u.nation) * 100; thr = 0.2; } thr = d > 2000 ? 0.9 : 0.4; }
    else { gx = (foe && foe.alive ? foe.pos.x : 0) + this.slot.x; gz = (foe && foe.alive ? foe.pos.z : -sgn(u.nation) * MAP.carrierZ) + sgn(u.nation) * 2500; thr = 0.8; }
    this.heading = this.avoid(Math.atan2(-(gx - u.pos.x), -(gz - u.pos.z))); this.thr = thr;
  }
}

// ---- fixed-wing pilots -----------------------------------------------------------------------------------------------------
class JetAI {
  constructor(u) { this.u = u; this.state = 'patrol'; this.think = rand(0, 1); this.wp = new V3(); this.target = null; this.evadeT = 0; this.dir = new V3(0, 0, -1); this.newWp(); this.runT = 0; this.cloakT = 0; }
  newWp() {
    const u = this.u, s = sgn(u.nation), t = u.type;
    if (t === 'recon') this.wp.set(rand(-3000, 3000), rand(1500, 2200), s * rand(3200, 5600));
    else if (t === 'bomber') this.wp.set(rand(-4000, 4000), rand(900, 1400), s * rand(3000, 6000));
    else this.wp.set(rand(-4500, 4500), rand(450, 1300), s * rand(-1500, 4200));
  }
  update(dt) {
    const u = this.u, c = u.ctl;
    if (u.state !== 'fly') { c.throttle = 1; return; }
    if (u.gearDown && world.t - (u.launchT || 0) > 2) u.gearDown = false;
    this.think -= dt; this.evadeT -= dt;
    if (this.think <= 0) { this.think = 0.4 + Math.random() * 0.3; this.plan(); }
    // missile defence: flares and a hard break across the missile's path
    if (u.incoming > 0) { if (u.flareCd <= 0 && Math.random() < 0.05) weapons.dropFlares(u); if (this.evadeT <= 0) { this.evadeT = 3.5; u.fwd(_a); this.breakDir = _b.set(-_a.z, rand(-0.5, 0.3), _a.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1).normalize().clone(); } }
    let dir = this.dir, ab = false, thr = 0.85;
    if (this.evadeT > 0 && this.breakDir) { dir = _d.copy(this.breakDir); ab = true; thr = 1; }
    else if (this.state === 'engage' && this.target) {
      const tg = this.target; _a.copy(tg.pos).sub(u.pos); const d = _a.length(), tof = d / 1000;
      _a.addScaledVector(tg.vel, tof).addScaledVector(u.vel, -tof * 0.3).normalize(); dir = _d.copy(_a); thr = 1; ab = d > 2500;
      u.fwd(_b); const ang = Math.acos(clamp(_b.dot(_a), -1, 1));
      // missiles when locked, guns when close and lined up
      const key = d > 3500 && u.fw.aam_rad && u.fw.aam_rad.ammo > 0 ? 'aam_rad' : u.fw.aam_ir && u.fw.aam_ir.ammo > 0 ? 'aam_ir' : null;
      if (key) { u.selKey = key; if (seekLock(u, WEAPONS[key], _b, dt + 0.35, true) && (u.lockTarget.incoming || 0) < 1 && Math.random() < 0.3) u.fire(key); }
      if (d < 1100 && ang < 0.05 && u.fw.cannon) u.fire('cannon');
      if (d < 350) { dir.y += 0.6; dir.normalize(); }
    } else if (this.state === 'strike' && this.target) {
      const tg = this.target; _a.set(tg.pos.x + tg.vel.x * 8, 0, tg.pos.z + tg.vel.z * 8);
      const d = Math.hypot(_a.x - u.pos.x, _a.z - u.pos.z); const alt = d > 1500 ? 650 : 480;
      dir = _d.set(_a.x - u.pos.x, (alt - u.pos.y) * 0.6, _a.z - u.pos.z).normalize(); thr = 1; ab = d < 5000;
      if (u.def.cloak && d < 6500 && !u.cloaked && u.cloakCd <= 0) u.toggleCloak();
      u.bombImpact(_b); const miss = Math.hypot(_b.x - _a.x, _b.z - _a.z);
      if (miss < 70 + tg.dims.length * 0.3 || this.runT > 0) { if (this.runT <= 0) this.runT = 1.5; u.fire('bomb'); }
      if (this.runT > 0) { this.runT -= dt; if (this.runT <= 0) { this.state = 'egress'; this.egT = 14; this.newWp(); } }
    } else {
      _a.copy(this.wp).sub(u.pos); if (_a.length() < 900) this.newWp(); dir = _d.copy(_a).normalize();
      if (this.state === 'egress') { this.egT -= dt; ab = true; thr = 1; if (this.egT <= 0) this.state = 'patrol'; }
    }
    // never fly into the sea, the islands or out of the area
    const floor = Math.max(0, world.terrain(u.pos.x + u.vel.x * 3, u.pos.z + u.vel.z * 3)) + 110;
    const ahead = u.pos.y + u.vel.y * 3.5;
    if (ahead < floor) { dir.y = Math.max(dir.y, 0.5 + (floor - ahead) * 0.01); dir.normalize(); }
    if (u.pos.y > 3200) { dir.y = Math.min(dir.y, -0.15); }
    const lim = MAP.half + 1500; if (Math.abs(u.pos.x) > lim || Math.abs(u.pos.z) > lim) { dir.set(-u.pos.x, 0.05, -u.pos.z).normalize(); }
    if (u.speed < u.def.stall * 1.5) { thr = 1; ab = true; dir.y = Math.min(dir.y, 0.1); }
    flyToward(u, dir, c); c.throttle = thr; c.ab = ab; this.dir.copy(dir);
  }
  plan() {
    const u = this.u, t = u.type;
    if (t === 'fighter') {
      const tg = nearestEnemy(u, (e) => e.isAir, 9000);
      if (tg) { this.state = 'engage'; this.target = tg; } else if (this.state === 'engage') { this.state = 'patrol'; this.target = null; }
    } else if (t === 'bomber') {
      if (this.state === 'patrol' && u.fw.bomb.ammo > 0) {
        const tg = nearestEnemy(u, (e) => e.kind === 'ship' && e.def.armor >= 1, 16000) || (enemyCarrier(u) && enemyCarrier(u).alive && Math.random() < 0.1 ? enemyCarrier(u) : null);
        if (tg) { this.state = 'strike'; this.target = tg; this.runT = 0; }
      } else if (this.state === 'strike' && (!this.target || !this.target.alive)) { this.state = 'patrol'; this.target = null; }
      if (u.fw.bomb.ammo <= 0 && this.state === 'patrol') { this.rearmT = (this.rearmT || 0) + 0.5; if (this.rearmT > 45) { this.rearmT = 0; u.fw.bomb.ammo = WEAPONS.bomb.ammo; } }
    }
  }
}

// ---- helicopter crews ------------------------------------------------------------------------------------------------------
class HeliAI {
  constructor(u) { this.u = u; this.think = rand(0, 1); this.goal = new V3(); this.alt = 110; this.target = null; this.state = u.type === 'transport' ? 'load' : 'patrol'; this.wait = rand(8, 16); this.face = null; this.cruise = 1; this.goal.copy(u.pos); }
  update(dt) {
    const u = this.u, c = u.ctl; this.think -= dt;
    if (this.think <= 0) { this.think = 0.5; if (u.type === 'transport') this.planTransport(); else this.planAttack(); }
    if (u.incoming > 0 && u.flareCd <= 0 && Math.random() < 0.04) weapons.dropFlares(u);
    if (this.state === 'load' || this.state === 'unload' || this.state === 'idle') { c.collective = -1; c.pitch = c.roll = c.yaw = 0; u.spool = false; this.wait -= dt; return; }
    u.spool = true;
    if (u.state === 'landed') { c.collective = 1; c.pitch = c.roll = 0; return; }
    // fly to the goal: lean toward it, hold height, point the nose
    const dx = this.goal.x - u.pos.x, dz = this.goal.z - u.pos.z, d = Math.hypot(dx, dz);
    const wantSp = Math.min(u.def.speed * this.cruise, d * 0.22 + (this.landing ? 0 : 2));
    const vx = (dx / (d || 1)) * wantSp - u.vel.x, vz = (dz / (d || 1)) * wantSp - u.vel.z;
    const s = Math.sin(u.yaw), co = Math.cos(u.yaw), af = -s * vx - co * vz, ar = co * vx - s * vz;
    c.pitch = clamp(af * 0.09, -1, 1); c.roll = clamp(ar * 0.09, -1, 1);
    const hd = this.face ? Math.atan2(-(this.face.x - u.pos.x), -(this.face.z - u.pos.z)) : d > 60 ? Math.atan2(-dx, -dz) : u.yaw;
    c.yaw = clamp(angDiff(u.yaw, hd) * 1.6, -1, 1);
    let alt = this.alt; const gy = Math.max(0, world.terrain(u.pos.x + u.vel.x * 2, u.pos.z + u.vel.z * 2));
    if (this.landing) { alt = d < 14 ? this.goal.y - 3 : this.goal.y + Math.min(45, 8 + d * 0.35); c.collective = clamp((alt - u.pos.y) * 0.1, d < 14 ? -0.4 : -0.8, 1); }
    else c.collective = clamp((Math.max(alt, gy + 45) - u.pos.y) * 0.08, -0.8, 1);
  }
  planAttack() {
    const u = this.u;
    const tg = nearestEnemy(u, (e) => (e.kind === 'ship' && e.def.armor <= 1) || e.kind === 'heli' || (e.kind === 'sub' && e.depth < 3) || (e.kind === 'soldier' && !e.aboard), 8000);
    this.target = tg; u.aiTarget = tg; this.landing = false;
    if (tg) {
      const d = Math.hypot(tg.pos.x - u.pos.x, tg.pos.z - u.pos.z), stand = 1500;
      _a.set(u.pos.x - tg.pos.x, 0, u.pos.z - tg.pos.z).normalize().multiplyScalar(stand); this.goal.set(tg.pos.x + _a.x, 0, tg.pos.z + _a.z); this.alt = 90; this.face = tg.pos; this.cruise = 0.9;
      if (u.fw.agm && u.fw.agm.ammo > 0 && !tg.isAir && tg.kind !== 'soldier') { u.fwd(_b); if (seekLock(u, WEAPONS.agm, _b, 0.5, false) && (u.lockTarget.incoming || 0) < 1 && d < 5200) u.fire('agm'); }
      else if (u.fw.agm && u.fw.agm.ammo <= 0) { this.rearm = (this.rearm || 0) + 0.5; if (this.rearm > 50) { this.rearm = 0; u.fw.agm.ammo = WEAPONS.agm.ammo; } }
    } else {
      this.face = null; this.cruise = 0.6;
      if (Math.hypot(this.goal.x - u.pos.x, this.goal.z - u.pos.z) < 200 || Math.random() < 0.01) this.goal.set(rand(-3500, 3500), 0, sgn(u.nation) * rand(300, 3200));
      this.alt = 120;
    }
  }
  // the marine shuttle: carrier helipad -> island landing zone -> back
  planTransport() {
    const u = this.u, home = ownCarrier(u), pad = world.pads[u.nation === 'aethia' ? 0 : 1];
    this.face = null; this.cruise = 0.85;
    if (this.state === 'load') {
      if (u.state !== 'landed') { this.state = 'return'; return; }
      // marines waiting on the deck climb in
      if (u.on) for (const m of world.units) { if (m.kind === 'soldier' && m.alive && m.nation === u.nation && !m.isPlayer && !m.aboard && !m.gun && m.on === u.on && u.passengers.length < u.def.seats && m.pos.distanceTo(u.pos) < 40) { m.board(u, false); } }
      if (this.wait <= 0) { this.state = 'outbound'; this.alt = 140; this.landing = false; this.goal.set(pad.x, pad.y, pad.z); world.onHeliDepart && world.onHeliDepart(u); }
    } else if (this.state === 'outbound') {
      const d = Math.hypot(pad.x - u.pos.x, pad.z - u.pos.z); this.goal.set(pad.x, pad.y, pad.z); this.landing = d < 260;
      if (u.state === 'landed' && u.pos.y > 2) { this.state = 'unload'; this.wait = 7; for (const m of [...u.passengers]) { if (!m.isPlayer) { m.alight(u); m.pos.x += rand(-4, 4); m.pos.z += rand(-4, 4); } } }
    } else if (this.state === 'unload') {
      if (this.wait <= 0) { this.state = 'return'; this.landing = false; this.alt = 140; }
    } else if (this.state === 'return') {
      if (!home || !home.alive) { this.goal.set(pad.x + 60, pad.y, pad.z); this.landing = true; if (u.state === 'landed') this.state = 'idle'; return; }
      const hp = home.model.helipads[0]; home.toWorld(hp.pos, _a); _a.addScaledVector(home.vel, 1.5); const d = Math.hypot(_a.x - u.pos.x, _a.z - u.pos.z); this.goal.copy(_a); this.landing = d < 300;
      if (u.state === 'landed' && u.on === home) { this.state = 'load'; this.wait = rand(14, 22); u.rearm(); }
      else if (u.state === 'landed') { this.state = 'outbound2'; }
    } else if (this.state === 'outbound2') { this.state = 'return'; }
  }
}

// ---- marines on foot -------------------------------------------------------------------------------------------------------
class MarineAI {
  constructor(u) { this.u = u; this.think = rand(0, 1); this.target = null; this.goal = null; this.burst = 0; this.err = 0; }
  update(dt) {
    const u = this.u, c = u.ctl; this.think -= dt; this.burst -= dt;
    if (u.aboard || u.gun) { c.fire = false; return; }
    if (this.think <= 0) {
      this.think = 0.6 + Math.random() * 0.5;
      this.target = nearestEnemy(u, (e) => (e.kind === 'soldier' && !e.aboard) || (e.kind === 'heli' && e.state === 'landed'), 420) || (() => { let b = null, bd = 400; for (const e of world.units) { if (e.alive && e.nation !== u.nation && e.kind === 'soldier' && !e.aboard) { const d = e.pos.distanceTo(u.pos); if (d < bd) { bd = d; b = e; } } } return b; })();
      if (!u.on && !this.target) { const pad = world.pads[u.nation === 'aethia' ? 1 : 0]; this.goal = _c.set(pad.x + rand(-25, 25), 0, pad.z + rand(-25, 25)).clone(); } else if (u.on) this.goal = null;
      this.err = rand(-0.05, 0.05); if (this.target && this.burst < -1) this.burst = rand(0.5, 1.2);
      c.crouch = !!this.target && Math.random() < 0.4;
    }
    c.mx = 0; c.mz = 0; c.run = false; c.fire = false;
    const tg = this.target;
    if (tg && tg.alive) {
      _a.copy(tg.pos).sub(u.pos); _a.y += 1.0 - (u.ctl.crouch ? 1.1 : 1.6); const d = _a.length();
      u.look = Math.atan2(-_a.x, -_a.z) + this.err; u.lookPitch = Math.atan2(_a.y, Math.hypot(_a.x, _a.z)) + this.err * 0.5;
      if (d > 120 && !u.on) { c.mz = 1; c.run = d > 200; } else if (d < 250) c.fire = this.burst > 0;
    } else if (this.goal && !u.on) {
      const dx = this.goal.x - u.pos.x, dz = this.goal.z - u.pos.z; if (Math.hypot(dx, dz) > 12) { u.look = Math.atan2(-dx, -dz); c.mz = 1; c.run = !u.swim; }
      u.lookPitch = 0;
    }
  }
}

export function attachAI(u, slot) {
  if (u.kind === 'ship') u.ai = new ShipAI(u, slot); else if (u.kind === 'sub') u.ai = new SubAI(u, slot);
  else if (u.kind === 'jet') u.ai = new JetAI(u); else if (u.kind === 'heli') u.ai = new HeliAI(u); else if (u.kind === 'soldier') u.ai = new MarineAI(u);
  return u.ai;
}
