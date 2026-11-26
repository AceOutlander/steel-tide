// Weapons and projectiles: pooled bullets/shells with tracers, guided missiles, bombs, torpedoes, flares, and turret mounts.
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { buildAAM, buildSAM, buildAGM, buildBomb, buildTorpedo } from '../units/v2/ordnance.js';
import { save } from '../core/save.js';
import { fx } from '../gfx/effects.js';
import { MAT } from '../gfx/materials.js';
import { waveHeight } from '../gfx/ocean.js';
import { audio } from '../audio/audio.js';
import { world } from '../world/world.js';
import { WEAPONS } from '../core/config.js';
import { V3, clamp, rand, wrapPi, approach, approachAngle, T } from '../core/util.js';
import { PartBuilder } from '../units/builders.js';

const GRAV = 9.81, MAXB = 900;
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _hit = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new V3();
const ZAX = new V3(0, 0, 1);

export function damageFactor(def, unit) {
  const gap = (unit.def.armor || 0) - (def.pen || 0);
  return gap <= 0 ? 1 : gap === 1 ? 0.35 : gap === 2 ? 0.12 : 0.04;
}

// ---- turret mounts -------------------------------------------------------------------------------------------------------
const SLEW = { mg: 3.2, chin: 3.5, deckgun: 0.9, heavy: 0.3, ciws: 3.0, sam: 1.4 };
export class Mount {
  constructor(unit, turret, key) {
    this.unit = unit; this.t = turret; this.def = WEAPONS[key]; this.key = key; this.cd = rand(0, 0.5); this.barrel = 0;
    // ammo: rounds ready to fire. store: rounds below, brought up a magazine at a time. full: everything it started with.
    this.ammo = this.def.mag ?? this.def.ammo ?? Infinity; this.store = this.def.store || 0; this.full = this.ammo + this.store; this.target = null; this.aligned = false; this.inArc = true; this.scan = rand(0, 1); this.lock = 0; this.manned = null; this.burst = 0;
    // the heavy turrets of one ship do not all fire in the same instant: each waits a little longer than the one before
    this.stagger = this.def.salvo ? (((unit._salvoN = (unit._salvoN || 0) + 1) - 1) % 5) * 0.05 : 0;
  }
  // world position of the mount (trunnion)
  pos(out) { const t = this.t; out.copy(t.node.position); out.y += t.pitch.position.y; return out.applyQuaternion(this.unit.quat).add(this.unit.pos); }
  dir(out) { const t = this.t, y = t.rest + t.yaw, ce = Math.cos(t.elev); return out.set(-Math.sin(y) * ce, Math.sin(t.elev), -Math.cos(y) * ce).applyQuaternion(this.unit.quat); }
  aimAt(p, dt, lead = null) {
    const t = this.t, u = this.unit;
    this.pos(_a); _b.copy(p).sub(_a);
    const dist = _b.length();
    if (lead) { const tof = dist / (this.def.speed || 700); _b.addScaledVector(lead, tof); }
    _q.copy(u.quat).invert(); _b.applyQuaternion(_q);
    const flat = Math.hypot(_b.x, _b.z);
    let yawWant = wrapPi(Math.atan2(-_b.x, -_b.z) - t.rest), pitchWant = Math.atan2(_b.y, flat);
    if (this.def.type === 'gun' || this.def.type === 'shell') pitchWant += (GRAV * flat) / (2 * this.def.speed * this.def.speed);
    this.inArc = t.arc >= Math.PI - 0.01 || Math.abs(yawWant) <= t.arc;
    const rate = (SLEW[t.kind] || 1.5) * dt;
    if (t.arc >= Math.PI - 0.01) t.yaw = approachAngle(t.yaw, yawWant, rate); else t.yaw = approach(t.yaw, clamp(yawWant, -t.arc, t.arc), rate);
    const pw = clamp(pitchWant, t.minPitch, t.maxPitch);
    t.elev = approach(t.elev, pw, rate);
    t.node.rotation.y = t.rest + t.yaw; t.pitch.rotation.x = t.elev;
    if (t.barrels && t.spinV > 0.2) { t.barrels.rotation.z += t.spinV * dt; t.spinV *= Math.max(0, 1 - 1.8 * dt); }
    this.aligned = this.inArc && Math.abs(wrapPi(yawWant - t.yaw)) < 0.035 && Math.abs(pw - t.elev) < 0.03 && Math.abs(pw - pitchWant) < 0.08;
    return this.aligned;
  }
  rest(dt) { const t = this.t; t.yaw = approach(t.yaw, 0, 0.5 * dt); t.node.rotation.y = t.rest + t.yaw; }
  // fire one round / salvo along the barrel. Returns true if it fired.
  fire(target = null) {
    const def = this.def, t = this.t, u = this.unit;
    if (this.cd > 0 || this.ammo <= 0) return false;
    this.dir(_c);
    if (def.type === 'missile') {
      const mz = t.muzzles[this.barrel++ % t.muzzles.length]; mz.getWorldPosition(_a);
      weapons.fireMissile(u, def, _a, _c, target); this.cd = def.reload; this.spend(); return true;
    }
    const n = def.salvo ? t.muzzles.length : 1;
    for (let i = 0; i < n; i++) {
      const mz = t.muzzles[this.barrel++ % t.muzzles.length];
      // a multi-barrel heavy turret fires as a ripple: its barrels go one after another, a fraction of a second apart
      const wait = def.salvo ? this.stagger + i * 0.075 + (i ? rand(-0.012, 0.012) : 0) : 0;
      if (wait > 0.001) { weapons.ripple.push({ at: world.t + wait, m: this, mz, lite: i > 0 }); continue; }
      mz.getWorldPosition(_a); weapons.fireGun(u, def, _a, _c, u.vel, i === 0 ? true : 'lite');
    }
    this.cd = 1 / def.rof; this.spend(); if (t.barrels) t.spinV = 42;
    return true;
  }
  // one round (or salvo) gone. An empty magazine is refilled from the store, which takes the crew a while.
  spend() {
    if (--this.ammo > 0 || this.store <= 0) return;
    const n = Math.min(this.def.mag, this.store); this.store -= n; this.ammo = n; this.cd = Math.max(this.cd, this.def.magReload); this.loading = world.t + this.def.magReload;
  }
  rounds() { return this.ammo === Infinity ? Infinity : Math.max(0, this.ammo) + this.store; }
  refill() { this.ammo = this.def.mag ?? this.def.ammo ?? Infinity; this.store = this.def.store || 0; this.loading = 0; }
}

// ---- projectile pool -------------------------------------------------------------------------------------------------------
const B = { n: 0, tg: new Array(MAXB), pos: new Float32Array(MAXB * 3), vel: new Float32Array(MAXB * 3), life: new Float32Array(MAXB), def: new Array(MAXB), owner: new Array(MAXB), tr: new Uint8Array(MAXB) };
let tracerMesh = null, shellMesh = null, missileGeo = null, bombGeo = null, torpGeo = null, samGeo = null, agmGeo = null;

export const weapons = {
  missiles: [], bombs: [], torps: [], flares: [], ripple: [],
  init() {
    const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0, 0.5);
    MAT.tracer.color.setRGB(9, 5.5, 1.8); MAT.tracer.toneMapped = true; if (MAT.afterburner.color) MAT.afterburner.color.setScalar(4);
    tracerMesh = new THREE.InstancedMesh(g, MAT.tracer, MAXB); tracerMesh.frustumCulled = false; tracerMesh.count = 0; tracerMesh.renderOrder = 9;
    gfx.scene.add(tracerMesh);
    let b = new PartBuilder(0);
    b.cyl(MAT.white, 0.09, 0.09, 2.6, 0, 0, 0, 'z', 8); b.cone(MAT.gunmetal, 0.09, 0.5, 0, 0, -1.55, 'z', 8);
    for (const r of [0, Math.PI / 2]) { b.box(MAT.gunmetal, 0.5, 0.02, 0.4, 0, 0, 1.1, [0, 0, r]); b.box(MAT.gunmetal, 0.34, 0.02, 0.3, 0, 0, -0.5, [0, 0, r]); }
    const tmp = new THREE.Group(); const ms = b.build(tmp); missileGeo = ms.map((m) => ({ geo: m.geometry, mat: m.material }));
    b = new PartBuilder(0); b.add(MAT.gunmetal, new THREE.CapsuleGeometry(0.28, 1.6, 4, 8), 0, 0, 0, [Math.PI / 2, 0, 0]); for (const r of [0, Math.PI / 2]) b.box(MAT.gunmetal, 0.8, 0.03, 0.5, 0, 0, 1.0, [0, 0, r]);
    bombGeo = b.build(tmp).map((m) => ({ geo: m.geometry, mat: m.material }));
    b = new PartBuilder(0); b.add(MAT.black, new THREE.CapsuleGeometry(0.27, 5.2, 4, 8), 0, 0, 0, [Math.PI / 2, 0, 0]); b.cyl(MAT.orange, 0.275, 0.275, 0.5, 0, 0, -2.2, 'z', 8);
    torpGeo = b.build(tmp).map((m) => ({ geo: m.geometry, mat: m.material }));
    // the detailed, full-size weapons replace the placeholder shapes above
    missileGeo = buildAAM(); samGeo = buildSAM(); agmGeo = buildAGM(); bombGeo = buildBomb(); torpGeo = buildTorpedo();
  },
  mesh(parts, scale = 1) { const g = new THREE.Group(); for (const p of parts) g.add(new THREE.Mesh(p.geo, p.mat)); g.scale.setScalar(scale); gfx.scene.add(g); return g; },
  clear() { B.n = 0; this.ripple.length = 0; for (const l of [this.missiles, this.bombs, this.torps]) { for (const o of l) gfx.scene.remove(o.mesh); l.length = 0; } this.flares.length = 0; },

  fireGun(owner, def, pos, dir, inherit, sound = true) {
    if (B.n >= MAXB) return;
    const i = B.n++, i3 = i * 3, sp = def.spread * (owner.isPlayer ? 1 : save.diff.spread); B.tg[i] = owner.isPlayer && def.type === 'shell' ? owner.fireTarget || null : null;
    _d.copy(dir); _d.x += rand(-sp, sp); _d.y += rand(-sp, sp); _d.z += rand(-sp, sp); _d.normalize();
    B.pos[i3] = pos.x; B.pos[i3 + 1] = pos.y; B.pos[i3 + 2] = pos.z;
    B.vel[i3] = _d.x * def.speed + (inherit ? inherit.x : 0); B.vel[i3 + 1] = _d.y * def.speed + (inherit ? inherit.y : 0); B.vel[i3 + 2] = _d.z * def.speed + (inherit ? inherit.z : 0);
    B.life[i] = def.life; B.def[i] = def; B.owner[i] = owner; B.tr[i] = def.type === 'shell' ? 2 : Math.random() < (def.tracer || 0) ? 1 : 0;
    if (sound) {
      if (def.key === 'heavy' || def.key === 'deckgun') {   // a ship's gun: layered boom, muzzle blast, and a kick you feel
        const big = def.key === 'heavy', lite = sound === 'lite', own = !!owner.isPlayer;
        fx.gunBlast(pos, _d, big, lite);
        audio.gun(big ? 'heavy' : 'deck', { pos, own, lite, pitch: owner.def && owner.def.key === 'superdestroyer' ? 0.92 : 1 });
        const cd = own ? 0 : gfx.camera.position.distanceTo(pos), reach = big ? 260 : 70;   // your own guns kick hardest, a gun near you less
        if (cd < reach) gfx.shake((big ? (lite ? 0.16 : 0.5) : 0.14) * (1 - cd / reach));
      } else { fx.muzzle(pos, _d, 0.6); audio.play(def.sound, { pos, vol: owner.isPlayer ? 1 : 0.8 }); }
    }
  },

  fireMissile(owner, def, pos, dir, target) {
    const m = { def, owner, nation: owner.nation, pos: pos.clone(), vel: dir.clone().multiplyScalar(Math.max(80, owner.vel.length() + 40)).add(_s.set(0, 0, 0)), dir: dir.clone().normalize(), speed: Math.max(80, owner.vel.length() + 40), target, life: def.life, decoy: null, mesh: this.mesh(def.key === 'sam' ? samGeo : def.key === 'agm' ? agmGeo : missileGeo, 1), t: 0, lost: false, chk: 0 };
    this.missiles.push(m);
    if (target) { target.incoming = (target.incoming || 0) + 1; m.counted = true; }
    audio.play(def.sound, { pos, vol: 1 });
    fx.muzzle(pos, dir, 2);
    return m;
  },
  dropBomb(owner, def, pos, vel) {
    this.bombs.push({ def, owner, pos: pos.clone(), vel: vel.clone(), mesh: this.mesh(bombGeo, 1), life: 40 });
    audio.play('bombdrop', { pos, vol: 0.6 });
  },
  fireTorpedo(owner, def, pos, yaw, target) {
    const t = { def, owner, nation: owner.nation, pos: pos.clone(), yaw, target, life: def.life, mesh: this.mesh(torpGeo, 1), run: 0, depth: Math.min(-3, pos.y) };
    this.torps.push(t); audio.play('torpedo', { pos, vol: 1 });
    return t;
  },
  // countermeasures from an aircraft: flares + chaff together
  dropFlares(u) {
    if (u.flares <= 0 || u.flareCd > 0) return false;
    u.flares--; u.flareCd = 0.6; u.flareT = world.t + 2.2;
    for (let i = 0; i < 4; i++) { _a.set(rand(-25, 25), rand(-30, -8), rand(-25, 25)).add(u.vel).multiplyScalar(0.6); fx.flare(u.pos, _a.x, _a.y, _a.z); }
    fx.chaff(u.pos, u.vel.x, u.vel.y, u.vel.z);
    const f = { pos: u.pos.clone(), vel: u.vel.clone().multiplyScalar(0.5).add(_a.set(0, -12, 0)), life: 3 };
    this.flares.push(f);
    for (const m of this.missiles) { if (m.target === u && !m.decoy) { const p = m.def.seeker === 'ir' ? 0.7 : m.def.seeker === 'radar' ? 0.5 : 0.2; if (Math.random() < p) { m.decoy = f; this.release(m); } } }
    audio.play('flare', { pos: u.pos });
    return true;
  },
  release(m) { if (m.counted && m.target) { m.target.incoming = Math.max(0, (m.target.incoming || 1) - 1); m.counted = false; } },

  // area damage. falloff linear to the radius.
  blast(pos, radius, dmg, def, owner, skip = null) {
    for (const u of world.units) {
      if (!u.alive || u === skip) continue;
      const d = u.distToPoint ? u.distToPoint(pos) : Math.max(0, u.pos.distanceTo(pos) - u.radius * 0.6);
      if (d < radius) u.damage(dmg * (1 - d / radius) * (u === owner ? 0.5 : 1), owner, pos, def);
    }
  },

  update(dt) {
    // barrels of a ripple whose moment has come
    for (let i = this.ripple.length - 1; i >= 0; i--) {
      const r = this.ripple[i]; if (r.at > world.t) continue;
      this.ripple.splice(i, 1); const u = r.m.unit; if (!u.alive) continue;
      r.mz.getWorldPosition(_a); r.m.dir(_c); this.fireGun(u, r.m.def, _a, _c, u.vel, r.lite ? 'lite' : true);
    }
    this.updateBullets(dt); this.updateMissiles(dt); this.updateBombs(dt); this.updateTorps(dt);
    for (let i = this.flares.length - 1; i >= 0; i--) { const f = this.flares[i]; f.life -= dt; f.vel.y -= 6 * dt; f.pos.addScaledVector(f.vel, dt); if (f.life <= 0) this.flares.splice(i, 1); }
  },

  updateBullets(dt) {
    const U = world.units, cam = gfx.camera.position;
    let vis = 0;
    for (let i = 0; i < B.n; i++) {
      const i3 = i * 3, def = B.def[i], owner = B.owner[i];
      _a.set(B.pos[i3], B.pos[i3 + 1], B.pos[i3 + 2]);
      B.vel[i3 + 1] -= GRAV * dt;
      _b.set(_a.x + B.vel[i3] * dt, _a.y + B.vel[i3 + 1] * dt, _a.z + B.vel[i3 + 2] * dt);
      B.life[i] -= dt;
      let dead = B.life[i] <= 0;
      // units
      if (!dead) {
        const mx = (_a.x + _b.x) * 0.5, my = (_a.y + _b.y) * 0.5, mz = (_a.z + _b.z) * 0.5, half = def.speed * dt * 0.5 + 2;
        for (let k = 0; k < U.length; k++) {
          const u = U[k];
          if (!u.alive || u.nation === owner.nation || u === owner) continue;
          const r = u.radius + half + (def.aa && u.isAir ? 6 : 0);
          const dx = u.pos.x - mx, dy = u.pos.y - my, dz = u.pos.z - mz;
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          if (u.hitTest(_a, _b, _hit, def.aa || def.key === 'cannon' ? 5 : def.type === 'shell' ? 1.5 : 0.6)) {
            u.damage(def.dmg * damageFactor(def, u), owner, _hit, def);
            if (def.type === 'shell') { const big = def.key === 'heavy'; fx.explosion(_hit, big ? 16 : 6, false); audio.play(big ? 'shellHit' : 'shellHitSmall', { pos: _hit, vol: big ? 1.2 : 0.9 }); if (def.splash) this.blast(_hit, def.splash, def.dmg * 0.4, def, owner, u); if (owner.isPlayer) world.shellFall(owner, _hit, B.tg[i], u); }
            else { fx.spark(_hit, _c.set(0, 1, 0)); if (Math.random() < 0.25) audio.play('hit', { pos: _hit, vol: 0.5 }); }
            dead = true; break;
          }
        }
      }
      // water / ground
      if (!dead && _b.y < 3) {
        const wy = waveHeight(_b.x, _b.z);
        if (_b.y < wy) {
          _b.y = wy; dead = true;
          if (def.type === 'shell') { const big = def.key === 'heavy'; fx.splash(_b, big ? 16 : 6, false); audio.play(big ? 'shellWater' : 'shellWaterSmall', { pos: _b, vol: 1 }); if (owner.isPlayer) world.shellFall(owner, _b, B.tg[i], null); if (def.splash) this.blast(_b, def.splash * 0.7, def.dmg * 0.3, def, owner); }
          else if (Math.random() < 0.5) fx.splash(_b, 0.7, Math.random() < 0.15);
        }
      }
      if (!dead && _b.y < 100) {
        const gy = world.terrain(_b.x, _b.z);
        if (gy > -1 && _b.y < gy) { dead = true; _b.y = gy; if (def.type === 'shell') { fx.explosion(_b, def.key === 'heavy' ? 14 : 5); if (def.splash) this.blast(_b, def.splash, def.dmg * 0.5, def, owner); } else fx.puff(_b, 0, 2, 0, 1.2, 0.6, 0.5, 1.2, 2); }
      }
      if (dead) { // swap-remove
        const n = --B.n; if (i !== n) { const n3 = n * 3; B.pos[i3] = B.pos[n3]; B.pos[i3 + 1] = B.pos[n3 + 1]; B.pos[i3 + 2] = B.pos[n3 + 2]; B.vel[i3] = B.vel[n3]; B.vel[i3 + 1] = B.vel[n3 + 1]; B.vel[i3 + 2] = B.vel[n3 + 2]; B.life[i] = B.life[n]; B.def[i] = B.def[n]; B.owner[i] = B.owner[n]; B.tr[i] = B.tr[n]; B.tg[i] = B.tg[n]; }
        i--; continue;
      }
      B.pos[i3] = _b.x; B.pos[i3 + 1] = _b.y; B.pos[i3 + 2] = _b.z;
      if (B.tr[i]) {
        _c.set(B.vel[i3], B.vel[i3 + 1], B.vel[i3 + 2]); const sp = _c.length(); _c.multiplyScalar(1 / sp);
        const dcam = _b.distanceTo(cam), w = (B.tr[i] === 2 ? (def.key === 'heavy' ? 0.5 : 0.22) : 0.07) * Math.max(1, dcam * 0.004);
        _q.setFromUnitVectors(ZAX, _c.negate());
        _m.compose(_b, _q, _s.set(w, w, Math.min(sp * 0.035, 60) * (B.tr[i] === 2 ? 0.5 : 1)));
        tracerMesh.setMatrixAt(vis++, _m);
      }
    }
    tracerMesh.count = vis; tracerMesh.instanceMatrix.needsUpdate = true;
  },

  updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i], def = m.def; m.life -= dt; m.t += dt;
      m.speed = Math.min(def.speed, m.speed + def.accel * dt);
      let aim = null, tgt = m.target;
      if (m.decoy) { if (m.decoy.life > 0) aim = m.decoy.pos; else { m.decoy = null; m.lost = true; } }
      else if (tgt && tgt.alive && !m.lost) {
        // lock checks (radar seekers): cloaked, sea-skimming or hard-turning targets can shake the missile
        m.chk -= dt;
        if (m.chk <= 0 && def.seeker === 'radar') {
          m.chk = 0.5; const d = tgt.pos.distanceTo(m.pos);
          let p = 0; if (tgt.cloaked && d > 1500) p += 0.3; if (tgt.isAir && tgt.pos.y < 70) p += 0.14; if ((tgt.gLoad || 1) > (tgt.type === 'bomber' ? 2.8 : 6.5)) p += 0.1;
          if (tgt.kind === 'sub' && tgt.depth > 3) p = 1;
          if (Math.random() < p) { m.lost = true; this.release(m); if (tgt.isPlayer) world.say('Missile lock broken', 'good'); }
        }
        if (!m.lost) { const d = tgt.pos.distanceTo(m.pos), tof = d / Math.max(m.speed, 100); aim = _a.copy(tgt.pos).addScaledVector(tgt.vel, tof * 0.9); if (!tgt.isAir) aim.y = Math.max(aim.y, 1) + (tgt.kind === 'ship' ? 4 : 0); }
      }
      if (aim) {
        _b.copy(aim).sub(m.pos).normalize();
        const maxTurn = (def.turnG * GRAV) / Math.max(m.speed, 150) * dt, ang = m.dir.angleTo(_b);
        if (ang > 1.6 && m.t > 1.5 && !m.decoy) { m.lost = true; this.release(m); } // overshot
        else if (ang > 1e-4) m.dir.lerp(_b, Math.min(1, maxTurn / ang)).normalize();
      } else if (m.t > 0.5) m.dir.y -= 0.05 * dt;
      _c.copy(m.pos); m.pos.addScaledVector(m.dir, m.speed * dt);
      let boom = false, hitU = null;
      // proximity / hit
      for (const u of world.units) {
        if (!u.alive || u.nation === m.nation) continue;
        const r = u.radius + m.speed * dt + 10; if (u.pos.distanceToSquared(m.pos) > r * r) continue;
        if (u.hitTest(_c, m.pos, _hit, u.isAir ? 9 : 2)) { boom = true; hitU = u; break; }
      }
      if (!boom && m.decoy && m.decoy.pos.distanceTo(m.pos) < 25) boom = true;
      if (!boom) { if (m.pos.y < waveHeight(m.pos.x, m.pos.z)) { boom = true; fx.splash(m.pos, 6); } else if (m.pos.y < 120 && world.terrain(m.pos.x, m.pos.z) > m.pos.y) boom = true; }
      if (boom || m.life <= 0) {
        if (boom) {
          fx.explosion(hitU ? _hit : m.pos, def.key === 'agm' ? 10 : 7);
          if (hitU) { hitU.damage(def.dmg * damageFactor(def, hitU), m.owner, _hit, def); if (def.splash) this.blast(_hit, def.splash, def.dmg * 0.3, def, m.owner, hitU); }
        }
        this.release(m); gfx.scene.remove(m.mesh); this.missiles.splice(i, 1); continue;
      }
      m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(ZAX, _b.copy(m.dir).negate());
      _a.copy(m.pos).addScaledVector(m.dir, -2.5);
      fx.trail(_a, 1.6, 0.86, 3.2); fx.flame(_a, 3.2);
    }
  },

  updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i], def = b.def; b.life -= dt;
      b.vel.y -= GRAV * dt; b.vel.multiplyScalar(1 - 0.02 * dt); _c.copy(b.pos); b.pos.addScaledVector(b.vel, dt);
      let boom = false, direct = null;
      for (const u of world.units) {
        if (!u.alive || u.nation === b.owner.nation || u.isAir) continue;
        const r = u.radius + 60; if (u.pos.distanceToSquared(b.pos) > r * r) continue;
        if (u.hitTest(_c, b.pos, _hit, 2.5)) { boom = true; direct = u; b.pos.copy(_hit); break; }
      }
      const wy = waveHeight(b.pos.x, b.pos.z), gy = world.terrain(b.pos.x, b.pos.z);
      if (!boom && (b.pos.y < wy || b.pos.y < gy)) { boom = true; b.pos.y = Math.max(wy, gy); if (gy < wy) fx.splash(b.pos, 22); }
      if (boom || b.life <= 0) {
        if (boom) { fx.explosion(b.pos, 22); if (direct) direct.damage(def.dmg * damageFactor(def, direct), b.owner, b.pos, def); this.blast(b.pos, def.splash, def.dmg * 0.55, def, b.owner, direct); }
        gfx.scene.remove(b.mesh); this.bombs.splice(i, 1); continue;
      }
      b.mesh.position.copy(b.pos); b.mesh.quaternion.setFromUnitVectors(ZAX, _b.copy(b.vel).normalize().negate());
    }
  },

  updateTorps(dt) {
    for (let i = this.torps.length - 1; i >= 0; i--) {
      const t = this.torps[i], def = t.def; t.life -= dt; t.run += def.speed * dt;
      // gentle homing once armed
      let tg = t.target;
      if (t.run > 150) {
        if (!tg || !tg.alive) { let best = 900; tg = null; for (const u of world.units) { if (!u.alive || u.nation === t.nation || (u.kind !== 'ship' && u.kind !== 'sub')) continue; const d = Math.hypot(u.pos.x - t.pos.x, u.pos.z - t.pos.z); if (d < best) { best = d; tg = u; } } t.target = tg; }
        if (tg) { const tof = Math.hypot(tg.pos.x - t.pos.x, tg.pos.z - t.pos.z) / def.speed; const want = Math.atan2(-(tg.pos.x + tg.vel.x * tof - t.pos.x), -(tg.pos.z + tg.vel.z * tof - t.pos.z)); t.yaw = approachAngle(t.yaw, want, 0.16 * dt); const wd = tg.kind === 'sub' ? Math.min(-3, -tg.depth) : -3.5; t.depth = approach(t.depth, wd, 4 * dt); }
      }
      _c.copy(t.pos);
      t.pos.x += -Math.sin(t.yaw) * def.speed * dt; t.pos.z += -Math.cos(t.yaw) * def.speed * dt; t.pos.y = approach(t.pos.y, t.depth, 5 * dt);
      let boom = false;
      for (const u of world.units) {
        if (!u.alive || (u.kind !== 'ship' && u.kind !== 'sub') || u === t.owner || (u.nation === t.nation && t.run < 400)) continue;
        const r = u.radius + 20; if (u.pos.distanceToSquared(t.pos) > r * r) continue;
        if (u.hitTest(_c, t.pos, _hit, 3)) { boom = true; u.damage(def.dmg * damageFactor(def, u), t.owner, _hit, def); if (u.flood !== undefined) u.flood += 0.06; break; }
      }
      if (!boom && world.terrain(t.pos.x, t.pos.z) > t.pos.y) boom = true;
      if (boom || t.life <= 0 || t.run > def.range) {
        if (boom) { _a.set(t.pos.x, Math.max(t.pos.y, -2), t.pos.z); fx.explosion(_a, 20); _a.y = 0; fx.splash(_a, 30); this.blast(t.pos, def.splash, def.dmg * 0.3, def, t.owner); }
        gfx.scene.remove(t.mesh); this.torps.splice(i, 1); continue;
      }
      t.mesh.position.copy(t.pos); t.mesh.rotation.y = t.yaw;
      if (Math.random() < 0.6) { _a.set(t.pos.x, t.pos.y + 0.5, t.pos.z); fx.bubbles(_a, 1.2); }
      if (Math.random() < 0.3 && t.pos.y > -6) { _a.set(t.pos.x, waveHeight(t.pos.x, t.pos.z) + 0.1, t.pos.z); fx.spray(_a, 0, 0, 1.2); }
    }
  },
};
