// A person on foot: walks ship decks (moving with the ship), islands, swims, mans gun mounts and rides helicopters.
import * as THREE from 'three';
import { fx } from '../gfx/effects.js';
import { waveHeight } from '../gfx/ocean.js';
import { audio } from '../audio/audio.js';
import { world } from '../world/world.js';
import { WEAPONS } from '../core/config.js';
import { V3, clamp, wrapPi, rand } from '../core/util.js';
import { Unit } from './unit.js';
import { weapons } from './weapons.js';
import { buildSoldier, animateSoldier } from '../units/marine.js';
import { surfaceBelow, deckUnder, blocked } from './surface.js';

const _a = new V3(), _b = new V3(), _l = new V3(), _q = new THREE.Quaternion(), YA = new V3(0, 1, 0);
const surf = { y: 0, ship: null, type: 'water', localY: 0 };

export class Soldier extends Unit {
  constructor(nation, name = '') {
    super('marine', nation, name);
    this.lod0 = buildSoldier(nation, { role: 'marine' }); this.lod1 = new THREE.Group(); this.root.add(this.lod0);
    this.model = { dims: { length: 0.6, beam: 0.6, height: 1.8, draft: 0 }, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [] }; this.dims = this.model.dims;
    this.radius = 1.3; this.lodDist = 700; this.box = { x: 0.4, y0: 0, y1: 1.85, z: 0.4 };
    this.ctl = { mx: 0, mz: 0, run: false, crouch: false, jump: false, fire: false }; this.look = 0; this.lookPitch = 0;
    this.on = null; this.local = new V3(); this.vy = 0; this.grounded = false; this.state = 'idle'; this.swim = false;
    this.aboard = null; this.gun = null; this.mag = WEAPONS.rifle.mag; this.reloadT = 0; this.cd = 0; this.moving = 0; this.selKey = 'rifle';
  }
  updateLod(cam) { this.camDist = this.pos.distanceTo(cam); this.root.visible = !this.aboard && this.camDist < this.lodDist * 1.5 && !this.hideBody; }
  eye(out) { return out.set(this.pos.x, this.pos.y + (this.swim ? 0.25 : this.ctl.crouch ? 1.15 : 1.68), this.pos.z); }
  aimDir(out) { const cp = Math.cos(this.lookPitch); return out.set(-Math.sin(this.look) * cp, Math.sin(this.lookPitch), -Math.cos(this.look) * cp); }
  placeOn(ship, local) { this.on = ship; this.local.copy(local); this.vy = 0; ship.toWorld(this.local, this.pos); }
  placeAt(x, y, z) { this.on = null; this.pos.set(x, y, z); this.vy = 0; }
  board(heli, asPilot) { this.leaveGun(); this.aboard = heli; this.on = null; if (asPilot) heli.pilot = this; else heli.passengers.push(this); }
  alight(heli) {
    if (heli.pilot === this) heli.pilot = null; else { const i = heli.passengers.indexOf(this); if (i >= 0) heli.passengers.splice(i, 1); }
    this.aboard = null; this.look = heli.yaw;
    _a.copy(heli.model.door || _b.set(2.5, -heli.model.gearHeight, 0)); _a.y = -heli.model.gearHeight + 0.05; heli.toWorld(_a, this.pos);
    if (heli.on) { heli.on.toLocal(this.pos, this.local); const d = deckUnder(heli.on, this.local, 2); if (d) { this.local.y = d.y; this.on = heli.on; } else this.on = null; } else this.on = null;
    this.vy = 0;
  }
  takeGun(m) { this.gun = m; m.manned = this; this.on = m.unit; }
  leaveGun() { if (!this.gun) return; const m = this.gun; m.manned = null; this.gun = null; const u = m.unit; _a.copy(m.t.node.position); _a.z += 1.4; this.local.copy(_a); const d = deckUnder(u, this.local, 2.5); if (d) this.local.y = d.y; this.on = u; }

  update(dt) {
    this.t += dt; this.cd -= dt;
    if (!this.alive) { this.deadT = (this.deadT || 0) + dt; this.lod0.rotation.x = Math.max(-1.5, this.lod0.rotation.x - dt * 4); if (this.on && this.on.alive !== undefined) this.on.toWorld(this.local, this.pos); if (this.deadT > 6) world.remove(this); this.sync(); return; }
    if (this.ai) this.ai.update(dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = WEAPONS.rifle.mag; }
    if (this.aboard) { const h = this.aboard; if (!h.alive) { this.aboard = null; this.kill(h.lastHitBy || null); return; } this.pos.copy(h.pos); this.vel.copy(h.vel); this.quat.copy(h.quat); return; }
    const c = this.ctl;
    if (this.gun) {
      const m = this.gun, u = m.unit; if (!u.alive) { this.gun = null; m.manned = null; this.on = null; } else {
        const t = m.t, y = t.rest + t.yaw; _a.copy(t.gunner || _b.set(0, 0, 0.9)).applyAxisAngle(YA, y).add(t.node.position); u.toWorld(_a, this.pos);
        this.look = wrapPi(u.yaw + y); _q.setFromAxisAngle(YA, y); this.quat.copy(u.quat).multiply(_q); this.vel.copy(u.vel);
        animateSoldier(this.lod0, 'gun', this.t, 0, 0); this.local.copy(_a); this.on = u; return;
      }
    }
    // movement in the horizontal plane, relative to where the soldier is looking
    const sp = this.swim ? 1.6 : c.crouch ? 1.4 : c.run ? this.def.speed : 2.6;
    const len = Math.hypot(c.mx, c.mz) || 1, mx = (c.mx / len) * (Math.abs(c.mx) > 0 || Math.abs(c.mz) > 0 ? 1 : 0), mz = (c.mz / len) * (Math.abs(c.mx) > 0 || Math.abs(c.mz) > 0 ? 1 : 0);
    const s = Math.sin(this.look), co = Math.cos(this.look);
    let wx = (-s * mz + co * mx) * sp, wz = (-co * mz - s * mx) * sp; // mz forward, mx right
    this.moving = Math.hypot(wx, wz) / sp || 0;
    if (this.on) {
      const ship = this.on;
      if (!ship.alive && ship.sinkT > 6) { this.on = null; } else {
        // move in the ship's frame so the deck carries us along
        const sy = Math.sin(-ship.yaw), cy = Math.cos(-ship.yaw), lx = wx * cy + wz * sy, lz = -wx * sy + wz * cy;
        let nx = this.local.x + lx * dt, nz = this.local.z + lz * dt;
        const pad = blocked(ship, this.local.x, this.local.y, this.local.z) ? 0 : 0.35; // already against a wall (placed there): do not trap them
        if (blocked(ship, nx, this.local.y, nz, pad)) { if (!blocked(ship, nx, this.local.y, this.local.z, pad)) nz = this.local.z; else if (!blocked(ship, this.local.x, this.local.y, nz, pad)) nx = this.local.x; else { nx = this.local.x; nz = this.local.z; } }
        this.local.x = nx; this.local.z = nz;
        if (c.jump && this.grounded) { this.vy = 4.6; this.grounded = false; }
        this.vy -= 9.81 * dt; this.local.y += this.vy * dt;
        _l.copy(this.local); const d = deckUnder(ship, _l, 0.7);
        if (d && this.local.y <= d.y) { this.local.y = d.y; this.vy = 0; this.grounded = true; }
        else if (!d) { // walked off the edge: now in free fall in the world
          ship.toWorld(this.local, this.pos); this.on = null; this.grounded = false; this.vel.copy(ship.vel);
        } else this.grounded = false;
        if (this.on) { ship.toWorld(this.local, this.pos); this.vel.copy(ship.vel); }
      }
    }
    if (!this.on) {
      this.pos.x += wx * dt; this.pos.z += wz * dt;
      if (c.jump && this.grounded && !this.swim) { this.vy = 4.6; this.grounded = false; }
      this.vy -= 9.81 * dt; this.pos.y += this.vy * dt;
      surfaceBelow(this.pos, surf, 0.7);
      const wy = waveHeight(this.pos.x, this.pos.z);
      if (surf.type === 'water' || (surf.type === 'ground' && surf.y < wy - 1.2)) {
        if (this.pos.y <= wy - 1.25) { if (!this.swim && this.vy < -4) fx.splash(this.pos, 2.5); this.pos.y = wy - 1.25; this.vy = 0; this.swim = true; this.grounded = false; }
        else if (this.pos.y > wy) this.swim = false;
      } else {
        this.swim = false;
        if (this.pos.y <= surf.y) {
          if (this.vy < -13) this.damage((-this.vy - 13) * 9, null, null, null);
          this.pos.y = surf.y; this.vy = 0; this.grounded = true;
          if (surf.type === 'deck') { this.on = surf.ship; surf.ship.toLocal(this.pos, this.local); this.local.y = surf.localY; }
        } else this.grounded = false;
      }
      this.vel.set(wx, this.vy, wz);
    }
    if (!this.alive) return;
    this.yaw = this.look; _q.setFromAxisAngle(YA, this.look); this.quat.copy(_q);
    this.state = this.swim ? 'swim' : c.crouch ? 'crouch' : this.moving > 0.1 ? (c.run ? 'run' : 'walk') : c.fire || this.isPlayer ? 'aim' : 'idle';
    this.box.y1 = c.crouch ? 1.25 : 1.85;
    if ((this.camDist || 0) < 500) animateSoldier(this.lod0, this.state, this.t, this.moving, this.lookPitch);
    if (c.fire && !this.swim) this.shoot();
  }
  shoot() {
    if (this.cd > 0 || this.reloadT > 0) return false;
    if (this.mag <= 0) { this.reloadT = WEAPONS.rifle.reload; audio.play('click', { pos: this.pos }); return false; }
    this.eye(_a); this.aimDir(_b); _a.addScaledVector(_b, 0.8);
    weapons.fireGun(this, WEAPONS.rifle, _a, _b, null, true); this.cd = 1 / WEAPONS.rifle.rof; this.mag--;
    return true;
  }
  reload() { if (this.reloadT <= 0 && this.mag < WEAPONS.rifle.mag) this.reloadT = WEAPONS.rifle.reload; }
  onKilled() { if (this.gun) { this.gun.manned = null; this.gun = null; } if (this.aboard) { world.remove(this); return; } /* body stays a few seconds, see update */ }
}
