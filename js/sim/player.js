// The player's hands and eyes: input -> unit controls for every unit kind, the cameras, aiming, and context actions (E).
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { waveHeight } from '../gfx/ocean.js';
import { audio } from '../audio/audio.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { world } from '../world/world.js';
import { WEAPONS } from '../core/config.js';
import { V3, clamp, damp, wrapPi, approach } from '../core/util.js';
import { flyToward, seekLock } from './jet.js';
import { weapons } from './weapons.js';
import { attachAI } from './ai.js';
import { deckUnder } from './surface.js';
import { battle } from '../world/battle.js';

const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _f = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const MODES = { ship: ['chase', 'first', 'gunner'], sub: ['chase', 'first'], jet: ['chase', 'first'], heli: ['chase', 'first'], soldier: ['first', 'chase'] };

export const player = {
  unit: null, yaw: 0, pitch: 0, mode: 'chase', zoom: 0, aimPoint: new V3(), aimDir: new V3(0, 0, -1), aimTarget: null, stick: { x: 0, y: 0 },
  prompt: '', hint: '', scope: false, camShake: 0, bombPoint: new V3(), showBomb: false, lockDef: null, soldier: null,

  setUnit(u, keepView = false) {
    this.unit = u; world.player = u; u.isPlayer = true; this.aimTarget = null; this.scope = false; this.stick.x = this.stick.y = 0;
    if (!keepView) { this.yaw = u.kind === 'soldier' ? u.look : u.yaw || Math.atan2(-(_f.set(0, 0, -1).applyQuaternion(u.quat)).x, -_f.z); this.pitch = u.kind === 'ship' || u.kind === 'sub' ? -0.12 : 0; }
    this.mode = MODES[u.kind][0];
    if (u.kind === 'soldier') this.soldier = u;
  },

  // ------------------------------------------------------------------------------------------------------------------------
  update(dt) {
    const u = this.unit; if (!u) return;
    const s = save.settings, sens = 0.0021 * s.sens * (1 - this.zoom * 0.7);
    this.prompt = ''; this.showBomb = false; this.lockDef = null;
    if (!u.alive) { this.camera(dt); return; }
    if (input.tap('camera')) { const l = MODES[u.kind]; this.mode = l[(l.indexOf(this.mode) + 1) % l.length]; if (this.mode === 'gunner' && !u.mounts.some((m) => m.key === u.selKey)) this.mode = 'chase'; this.scope = false; }
    this.zoom = damp(this.zoom, input.rmb ? 1 : 0, 10, dt);
    const heli = u.kind === 'heli' && u.state === 'fly';
    if (!heli) { this.yaw = wrapPi(this.yaw - input.mx * sens); this.pitch = clamp(this.pitch - input.my * sens * (s.invertY ? -1 : 1), -1.45, 1.45); }
    // weapon selection: number keys and the wheel
    const keys = u.kind === 'jet' || u.kind === 'heli' ? u.def.weapons : u.kind === 'sub' ? (u.tubes ? ['torpedo'] : []) : u.kind === 'soldier' ? ['rifle'] : u.weaponKeys();
    for (let i = 0; i < 4; i++) if (input.tap('weapon' + (i + 1)) && keys[i]) { u.selKey = keys[i]; audio.play('click'); }
    if (input.wheel && keys.length > 1) { u.selKey = keys[(keys.indexOf(u.selKey) + (input.wheel > 0 ? 1 : keys.length - 1)) % keys.length]; audio.play('click'); }
    this.keys = keys;
    this.camera(dt, true); // compute the aim ray first (uses last frame's unit position; fine at 60 Hz)
    if (u.kind === 'ship') this.ship(u, dt); else if (u.kind === 'sub') this.sub(u, dt); else if (u.kind === 'jet') this.jet(u, dt); else if (u.kind === 'heli') this.heli(u, dt); else this.foot(u, dt);
  },

  // ---- ships -----------------------------------------------------------------------------------------------------------------
  helm(u, dt) {
    u.ctl.throttle = clamp(u.ctl.throttle + input.axis('throttleDown', 'throttleUp') * dt * 0.6, -0.4, 1);
    if (Math.abs(u.ctl.throttle) < 0.03 && !input.on('throttleUp') && !input.on('throttleDown')) u.ctl.throttle = 0;
    u.ctl.rudder = input.axis('right', 'left');
    u.aimPoint.copy(this.aimPoint); u.aimLead = this.aimTarget ? _a.copy(this.aimTarget.vel).sub(u.vel).clone() : null; u.firing = input.lmb;
  },
  ship(u, dt) {
    this.helm(u, dt);
    if (u.docked) { this.prompt = `<kbd>U</kbd> Board the docked ${u.docked.def.label} and launch`; if (input.tap('launchSub')) { const sub = u.docked; battle.releasePlayer(u); sub.ai = null; this.setUnit(sub); sub.undock(); world.say(`${sub.label} away from the dock`, 'info'); } }
    this.hint = 'W/S throttle  A/D rudder  Mouse aim  LMB fire  RMB zoom  1-3 weapons  V camera';
  },
  sub(u, dt) {
    if (u.dockedTo) {
      this.prompt = '<kbd>E</kbd> Cast off from the dock'; u.aimPoint.copy(this.aimPoint);
      if (input.tap('use')) { u.undock(); world.say('Cast off. Backing out of the dock.', 'info'); }
      return;
    }
    if (u.undockT > world.t) { u.ctl.throttle = -0.35; u.ctl.rudder = 0; this.prompt = 'Backing out of the dock'; return; }
    this.helm(u, dt); u.firing = false;
    u.depthT = clamp(u.depthT + input.axis('rise', 'dive') * dt * 9, 0, u.maxDepth);
    if (input.tap('periscope')) { if (u.depth < 6 || u.depth > 20) { u.depthT = 13; world.say('Coming to periscope depth', 'info'); u.scope = true; this.scope = true; } else { u.scope = !u.scope; this.scope = u.scope; } }
    if (this.scope && (u.depth < 5 || u.depth > 21 || !u.scope)) { if (Math.abs(u.depthT - 13) > 6) { this.scope = false; u.scope = false; } }
    if (input.tap('ping')) { if (u.ping()) world.say('Active sonar ping: contacts revealed, and so are you', 'info'); }
    if (input.lmbHit && u.tubes) { if (u.depth > 40) world.say('Too deep to fire torpedoes', 'bad'); else if (!u.fireTorpedo(this.aimTarget && (this.aimTarget.kind === 'ship' || this.aimTarget.kind === 'sub') ? this.aimTarget : null)) audio.play('click'); }
    // docking with our battlecruiser
    for (const s of world.units) { if (s.type === 'battlecruiser' && s.nation === u.nation && u.canDock(s)) { this.prompt = `<kbd>E</kbd> Dock with ${s.name}`; if (input.tap('use')) { u.dock(s); world.say(`Docked with ${s.name}`, 'good'); } } }
    this.hint = 'W/S throttle  A/D rudder  R/F depth  P periscope  Q sonar ping' + (u.tubes ? '  LMB torpedo' : '');
  },

  // ---- jets ------------------------------------------------------------------------------------------------------------------
  jet(u, dt) {
    const c = u.ctl;
    c.throttle = clamp(c.throttle + input.axis('throttleDown', 'throttleUp') * dt * 0.7, 0, 1); c.ab = input.on('afterburner');
    if (input.tap('gear') && u.state === 'fly') { u.gearDown = !u.gearDown; world.say(u.gearDown ? 'Gear down' : 'Gear up', 'info'); }
    if (input.tap('flares')) weapons.dropFlares(u);
    if (input.tap('cloak') && u.def.cloak) { u.toggleCloak(); world.say(u.cloaked ? 'Cloak on' : u.cloakCd > 0 ? 'Cloak recharging' : 'Cloak off', 'info'); }
    const cp = Math.cos(this.pitch); this.aimDir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    if (u.state === 'deck') {
      const cv = u.carrier; this.yaw = wrapPi(cv.yaw + u.deckYaw); this.pitch = 0.02;
      const onCat = cv.model.catapults.find((k) => k.pos.distanceTo(u.deckLocal) < 3);
      if (onCat) { this.prompt = 'Hold <kbd>W</kbd> to full throttle: the catapult fires at 100%'; if (c.throttle >= 0.99) { u.launch(onCat); this.pitch = 0.1; } }
      else { this.prompt = '<kbd>E</kbd> Taxi to the catapult'; c.throttle = 0; if (input.tap('use')) { const k = cv.model.catapults[0]; u.park(cv, k.pos, k.yaw); u.gearDown = true; } }
      return;
    }
    if (u.state !== 'fly') { c.pitch = 0.1; c.roll = 0; c.yaw = 0; this.yaw = u.yaw; this.pitch = 0.12; return; }
    if (world.t - (u.launchT || -9) < 1.2) { this.yaw = u.yaw; this.pitch = 0.14; }
    const kp = input.axis('pitchDown', 'pitchUp'), kr = input.axis('rollLeft', 'rollRight');
    if (kp || kr) { c.pitch = kp; c.roll = kr; c.yaw = 0; u.fwd(_f); this.yaw = Math.atan2(-_f.x, -_f.z); this.pitch = Math.asin(clamp(_f.y, -1, 1)); }
    else flyToward(u, this.aimDir, c);
    c.yaw = clamp(c.yaw + input.axis('right', 'left') * 1, -1, 1);
    // weapons
    const w = u.fw[u.selKey]; u.fwd(_f);
    if (w && w.def.type === 'missile') { this.lockDef = w.def; const had = u.locked; seekLock(u, w.def, _f, dt, true); if (u.locked && !had) audio.play('lockTone'); else if (u.lockTarget && !u.locked && (this._bt = (this._bt || 0) - dt) < 0) { this._bt = 0.3; audio.play('lock'); } }
    else { u.lockTarget = null; u.locked = false; }
    if (w && w.def.type === 'bomb') { this.showBomb = true; u.bombImpact(this.bombPoint); }
    if (w && (w.def.type === 'missile' ? input.lmbHit : input.lmb)) { if (!u.fire() && input.lmbHit) audio.play('click'); }
    this.hint = 'Mouse steer  W/S throttle  Shift afterburner  A/D rudder  G gear  X flares' + (u.def.cloak ? '  C cloak' : '') + '  LMB fire';
  },

  // ---- helicopters -----------------------------------------------------------------------------------------------------------
  heli(u, dt) {
    const c = u.ctl, s = save.settings;
    c.collective = input.axis('throttleDown', 'throttleUp');
    if (u.state === 'fly') {
      const k = 0.0032 * s.sens; this.stick.x = clamp(this.stick.x + input.mx * k, -1, 1); this.stick.y = clamp(this.stick.y + input.my * k * (s.invertY ? -1 : 1), -1, 1);
      if (input.key('Space')) { this.stick.x = damp(this.stick.x, 0, 8, dt); this.stick.y = damp(this.stick.y, 0, 8, dt); }
      c.pitch = -this.stick.y; c.roll = this.stick.x; c.yaw = input.axis('right', 'left');
      this.yaw = u.yaw; this.pitch = -0.08;
    } else { this.stick.x = this.stick.y = 0; c.pitch = c.roll = c.yaw = 0; u.spool = c.collective > 0 || u.spool; this.prompt = u.rpm < 0.9 ? 'Hold <kbd>W</kbd> to spin up and lift off' : ''; if (u.pilot) { this.prompt += (this.prompt ? '  ' : '') + '<kbd>E</kbd> Get out'; if (input.tap('use')) { this.leaveHeli(u); return; } } }
    if (input.tap('flares')) weapons.dropFlares(u);
    u.aimPoint.copy(this.aimPoint); u.aimLead = this.aimTarget ? _a.copy(this.aimTarget.vel).sub(u.vel).clone() : null; u.firing = input.lmb && u.selKey === 'chin';
    const w = u.fw[u.selKey];
    if (w) { this.lockDef = w.def; u.fwd(_f); const had = u.locked; seekLock(u, w.def, _f, dt, false); if (u.locked && !had) audio.play('lockTone'); if (input.lmbHit && !u.fire()) audio.play('click'); }
    else { u.lockTarget = null; u.locked = false; }
    this.hint = 'W/S collective  Mouse tilt  A/D turn  Space level out  X flares  LMB fire' + (u.type === 'transport' ? '  Land on pads, decks and islands' : '');
  },
  leaveHeli(h) { const s = h.pilot; if (!s) return; h.isPlayer = false; h.ctl.collective = -1; s.alight(h); this.setUnit(s); if (h.type === 'transport') attachAI(h); },

  // ---- on foot ---------------------------------------------------------------------------------------------------------------
  foot(u, dt) {
    const c = u.ctl;
    if (u.aboard) { // riding as a passenger
      const h = u.aboard; c.fire = false;
      this.prompt = (h.state === 'landed' ? '<kbd>E</kbd> Get out  ' : '') + '<kbd>T</kbd> Take the controls';
      if (input.tap('use') && h.state === 'landed') { u.alight(h); return; }
      if (input.tap('takeControls')) { const i = h.passengers.indexOf(u); if (i >= 0) h.passengers.splice(i, 1); h.pilot = u; h.ai = null; u.isPlayer = false; this.setUnit(h); world.say('You have the controls', 'info'); }
      return;
    }
    u.look = this.yaw; u.lookPitch = this.pitch;
    if (u.gun) {
      const m = u.gun; m.cd -= 0; m.aimAt(this.aimPoint, dt, this.aimTarget ? _a.copy(this.aimTarget.vel).sub(m.unit.vel) : null);
      if (input.lmb) m.fire(this.aimTarget);
      this.prompt = '<kbd>E</kbd> Leave the gun'; if (input.tap('use')) { u.leaveGun(); }
      this.hint = 'Mouse aim  LMB fire  RMB zoom  E leave'; return;
    }
    c.mx = input.axis('left', 'right'); c.mz = input.axis('throttleDown', 'throttleUp'); c.run = input.on('run'); c.crouch = input.on('crouch'); c.jump = input.tap('jump'); c.fire = input.lmb;
    if (input.tap('reload')) u.reload();
    // context action: guns, helicopters, climbing out of the water
    let act = null;
    if (u.on) {
      for (const m of u.on.mounts) { if (m.manned || (m.key !== 'mg' && m.key !== 'ciws')) continue; _a.copy(m.t.node.position); if (Math.hypot(_a.x - u.local.x, _a.z - u.local.z) < 3 && Math.abs(_a.y - u.local.y) < 2.5) { act = { text: `<kbd>E</kbd> Man the ${m.def.name}`, run: () => u.takeGun(m) }; break; } }
    }
    if (!act) for (const h of world.units) {
      if (h.kind !== 'heli' || !h.alive || h.nation !== u.nation || h.state !== 'landed' || h.pos.distanceTo(u.pos) > 11) continue;
      if (h.type === 'transport' && h.ai) act = { text: `<kbd>E</kbd> Board the ${h.def.label} as a passenger`, run: () => { u.board(h, false); world.say('Aboard. T takes the controls.', 'info'); } };
      else if (!h.pilot && !h.isPlayer) act = { text: `<kbd>E</kbd> Fly the ${h.def.label}`, run: () => { u.board(h, true); h.ai = null; u.isPlayer = false; this.setUnit(h); } };
      break;
    }
    if (!act && u.swim) for (const sh of world.units) {
      if ((sh.kind !== 'ship' && sh.kind !== 'sub') || !sh.alive || !sh.model.decks.length) continue;
      if (sh.distToPoint(u.pos) < 9) { act = { text: `<kbd>E</kbd> Climb aboard ${sh.name || 'the ship'}`, run: () => { sh.toLocal(u.pos, _a); let best = null, bd = 1e9; for (const d of sh.model.decks) { const x = clamp(_a.x, d.x0 + 0.6, d.x1 - 0.6), z = clamp(_a.z, d.z0 + 0.6, d.z1 - 0.6), dd = Math.hypot(x - _a.x, z - _a.z) + d.y * 0.2; if (dd < bd) { bd = dd; best = { x, y: d.y, z }; } } if (best) { u.swim = false; u.placeOn(sh, _b.set(best.x, best.y, best.z)); } } }; break; }
    }
    if (act) { this.prompt = act.text; if (input.tap('use')) act.run(); }
    this.hint = u.swim ? 'WASD swim  Swim to a ship and press E to climb aboard' : 'WASD move  Shift run  C crouch  Space jump  LMB fire  R reload  E use';
  },

  // ---- camera ----------------------------------------------------------------------------------------------------------------
  camera(dt, aimOnly = false) {
    const u = this.unit, cam = gfx.camera, s = save.settings; if (!u) return;
    const view = u.model.view || {}, cp = Math.cos(this.pitch);
    _d.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); // look direction from yaw/pitch
    let fov = s.fov, near = 0.5;
    const subj = u.kind === 'soldier' && u.aboard ? u.aboard : u;
    if (u.kind === 'ship' || u.kind === 'sub') {
      const scope = u.kind === 'sub' && this.scope && u.scopeA > 0.9;
      if (scope) { u.toWorld(u.model.scopeTop, cam.position); cam.position.y = Math.max(cam.position.y, waveHeight(cam.position.x, cam.position.z) + 0.9); fov = 32; }
      else if (this.mode === 'first') { u.toWorld(view.bridge, cam.position); }
      else if (this.mode === 'gunner' && u.mounts.some((m) => m.key === u.selKey)) { const m = u.mounts.find((k) => k.key === u.selKey && k.inArc) || u.mounts.find((k) => k.key === u.selKey); m.pos(cam.position); cam.position.y += m.t.kind === 'heavy' ? 5 : 1.1; cam.position.addScaledVector(_d, m.t.kind === 'heavy' ? -9 : -2.2); }
      else {
        const dist = (view.chase || 80) * (1 - this.zoom * 0.25), h = (view.chaseH || 20);
        cam.position.set(u.pos.x - _d.x / (cp || 1) * dist, Math.max(u.pos.y, u.kind === 'sub' ? -400 : 0) + h * (0.55 - this.pitch * 0.9), u.pos.z - _d.z / (cp || 1) * dist);
        if (u.kind === 'sub' && u.depth > 4) cam.position.y = u.pos.y + h * 0.5 - this.pitch * dist * 0.5; else cam.position.y = Math.max(cam.position.y, waveHeight(cam.position.x, cam.position.z) + 1.5);
      }
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); this.scopeView = scope;
    } else if (u.kind === 'jet') {
      this.scopeView = false;
      if (this.mode === 'first') { u.toWorld(u.model.cockpit, cam.position); cam.quaternion.copy(u.quat); near = 0.3; }
      else {
        const dist = view.chase || 30, h = view.chaseH || 6;
        u.fwd(_f); _b.copy(_f).lerp(_d, u.state === 'fly' ? 0.55 : 0).normalize();
        _a.copy(u.pos).addScaledVector(_b, -dist); _a.y += h;
        if (!this._cj) { this._cj = true; cam.position.copy(_a); } cam.position.lerp(_a, 1 - Math.exp(-14 * dt));
        cam.position.y = Math.max(cam.position.y, waveHeight(cam.position.x, cam.position.z) + 1);
        _c.copy(u.pos).addScaledVector(u.state === 'fly' ? _d : _f, 400); cam.lookAt(_c);
      }
      fov = s.fov + clamp((u.speed - 150) / 300, 0, 1) * 8;
    } else if (u.kind === 'heli') {
      this.scopeView = false;
      if (this.mode === 'first') { u.toWorld(u.model.cockpit || _a.set(0, 0.5, -3), cam.position); cam.quaternion.copy(u.quat); near = 0.3; }
      else { const dist = view.chase || 28, h = view.chaseH || 8; cam.position.set(u.pos.x + Math.sin(u.yaw) * dist, u.pos.y + h, u.pos.z + Math.cos(u.yaw) * dist); cam.rotation.set(-0.16, u.yaw, 0, 'YXZ'); }
    } else {
      this.scopeView = false; const sd = u; near = 0.12;
      if (u.aboard) { const h = u.aboard, dist = 30; cam.position.set(h.pos.x - _d.x * dist, h.pos.y + 6 - _d.y * dist, h.pos.z - _d.z * dist); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
      else if (u.gun) { const m = u.gun; m.pos(cam.position); m.dir(_f); cam.position.y += 0.45; cam.position.addScaledVector(_f, -1.5); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
      else if (this.mode === 'first' && u.alive) { sd.eye(cam.position); cam.position.addScaledVector(_d, 0.12); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
      else { sd.eye(_a); cam.position.copy(_a).addScaledVector(_d, -4.2); cam.position.y += 0.7; cam.position.x += Math.cos(this.yaw) * 0.6; cam.position.z -= Math.sin(this.yaw) * 0.6; cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); }
      u.hideBody = this.mode === 'first' && !u.gun && u.alive;
    }
    if (this.zoom > 0.01) fov = fov / (1 + this.zoom * (this.scopeView ? 3 : 2));
    if (Math.abs(cam.fov - fov) > 0.05 || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // aim: where the centre of the screen meets the sea, or the enemy nearest that line
    cam.getWorldDirection(_f);
    let best = null, bestA = 0.035;
    for (const e of world.units) {
      if (!e.alive || e.nation === u.nation || !e.seen || e === subj) continue;
      _a.copy(e.pos).sub(cam.position); const d = _a.length(); if (d > 16000) continue;
      const ang = Math.acos(clamp(_a.dot(_f) / d, -1, 1)) - Math.atan(e.radius * 0.5 / d); if (ang < bestA) { bestA = ang; best = e; }
    }
    this.aimTarget = best;
    if (best) { this.aimPoint.copy(best.pos); if (best.kind === 'ship') this.aimPoint.y += 2; else if (best.kind === 'soldier') this.aimPoint.y += 1.1; }
    else { const t = _f.y < -0.004 ? Math.min((cam.position.y - 0) / -_f.y, 16000) : 5000; this.aimPoint.copy(cam.position).addScaledVector(_f, Math.max(t, 30)); }
  },
};
