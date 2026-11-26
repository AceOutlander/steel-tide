// The player's hands and eyes: input -> unit controls for every unit kind, the cameras, aiming, and context actions (E).
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { waveHeight } from '../gfx/ocean.js';
import { audio } from '../audio/audio.js';
import { emptyKey, spot, outText, serviceText, makeWay } from './rearm.js';
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
import { segSolid, inBounds, clearT, crowded, aboveWater, bridgeEye, buildCockpit, cut, fadeVeil } from './camrig.js';
import { buildBridgeView } from '../units/v2/cabins.js';

const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _f = new V3(), _g = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
// how each plane answers the stick: resp = how fast inputs build (1/s), bank = the bank angle A/D hold (rad)
const FEEL = { fighter: { resp: 6, bank: 1.31 }, recon: { resp: 3.6, bank: 1.08 }, bomber: { resp: 2.4, bank: 0.87 } };
const MODES = { ship: ['chase', 'first', 'gunner'], sub: ['chase', 'first'], jet: ['chase', 'first'], heli: ['chase', 'first'], soldier: ['first', 'chase'] };

export const player = {
  unit: null, yaw: 0, pitch: 0, mode: 'chase', zoom: 0, aimPoint: new V3(), aimDir: new V3(0, 0, -1), aimTarget: null, stick: { x: 0, y: 0 },
  lookYaw: 0, lookPitch: 0, lookIdle: 0, jp: 0, jt: 0,
  aimFriend: null, lmb: false, lmbHit: false, leadPoint: new V3(), leadT: 0, showLead: false,
  prompt: '', hint: '', scope: false, camShake: 0, _off: new V3(), _pullT: 1, _camTag: '', _camUnit: null, _cockUnit: null, bombPoint: new V3(), showBomb: false, lockDef: null, soldier: null,

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
    if (!u.alive) return;
    if (u.kind === 'soldier' && u.inside) this.mode = 'first';
    else if (input.tap('camera')) { const l = MODES[u.kind]; this.mode = l[(l.indexOf(this.mode) + 1) % l.length]; if (this.mode === 'gunner' && !u.mounts.some((m) => m.key === u.selKey)) this.mode = 'chase'; this.scope = false; }
    this.zoom = damp(this.zoom, input.rmb ? 1 : 0, 10, dt);
    const heli = u.kind === 'heli' && u.state === 'fly';
    if (u.kind === 'jet' && u.state === 'fly') {
      if (input.mx || input.my) { this.lookIdle = 2.5; this.lookYaw = clamp(this.lookYaw - input.mx * sens, -2.7, 2.7); this.lookPitch = clamp(this.lookPitch - input.my * sens * (s.invertY ? -1 : 1), -1.2, 1.2); }
      else if ((this.lookIdle -= dt) <= 0) { this.lookYaw = damp(this.lookYaw, 0, 3.5, dt); this.lookPitch = damp(this.lookPitch, 0, 3.5, dt); }
    } else if (!heli) { this.yaw = wrapPi(this.yaw - input.mx * sens); this.pitch = clamp(this.pitch - input.my * sens * (s.invertY ? -1 : 1), -1.45, 1.45); }
    // weapon selection: number keys and the wheel
    const keys = u.kind === 'jet' || u.kind === 'heli' ? u.def.weapons : u.kind === 'sub' ? (u.tubes ? ['torpedo'] : []) : u.kind === 'soldier' ? ['rifle'] : u.weaponKeys();
    for (let i = 0; i < 4; i++) if (input.tap('weapon' + (i + 1)) && keys[i]) { u.selKey = keys[i]; audio.play('click'); }
    if (input.wheel && keys.length > 1) { u.selKey = keys[(keys.indexOf(u.selKey) + (input.wheel > 0 ? 1 : keys.length - 1)) % keys.length]; audio.play('click'); }
    this.keys = keys;
    this.rearmNote(u);
    this.aim(); // from the camera as it was last drawn
    // fire discipline: the trigger is dead while the reticle is on one of our own
    this.lmb = input.lmb && !this.aimFriend; this.lmbHit = input.lmbHit && !this.aimFriend; u.fireTarget = this.aimTarget;
    this.lead(u);
    if (u.kind === 'ship') this.ship(u, dt); else if (u.kind === 'sub') this.sub(u, dt); else if (u.kind === 'jet') this.jet(u, dt); else if (u.kind === 'heli') this.heli(u, dt); else this.foot(u, dt);
  },

  // ---- ships -----------------------------------------------------------------------------------------------------------------
  helm(u, dt) {
    u.ctl.throttle = clamp(u.ctl.throttle + input.axis('throttleDown', 'throttleUp') * dt * 0.6, -0.4, 1);
    if (Math.abs(u.ctl.throttle) < 0.03 && !input.on('throttleUp') && !input.on('throttleDown')) u.ctl.throttle = 0;
    u.ctl.rudder = input.axis('right', 'left');
    u.aimPoint.copy(this.aimPoint); u.aimLead = this.aimTarget && this.assist === 'full' ? (u._lead || (u._lead = new V3())).copy(this.aimTarget.vel).sub(u.vel) : null; u.firing = this.lmb;
  },
  ship(u, dt) {
    this.helm(u, dt);
    if (u.docked) { this.prompt = `<kbd>U</kbd> Board the docked ${u.docked.def.label} and launch`; if (input.tap('launchSub')) { const sub = u.docked, under = u.model.dock.under; battle.releasePlayer(u); sub.ai = null; sub.homeShip = u; this.setUnit(sub); sub.undock(); world.say(under ? `Hull doors open. ${sub.label} is leaving the dock.` : `${sub.label} away from the dock`, 'info'); return; } }
    else if (u.dockBusy) this.prompt = u.dockBusy.transit && u.dockBusy.transit.dock ? `${u.dockBusy.name} is coming in through the hull doors` : `${u.dockBusy.name} is leaving through the hull doors`;
    this.hint = 'W/S throttle  A/D rudder  Mouse aim  LMB fire  RMB zoom  1-3 weapons  V camera' + (u.docked ? '  U submarine' : '');
  },
  // Back to the ship the submarine came from: its own crew takes the submarine, brings it home and docks it (or fights on
  // nearby until it can), and the player has the ship again.
  backToShip(sub, ship) {
    const docked = sub.dockedTo === ship;
    battle.releasePlayer(sub); sub.returnTo = docked ? null : ship; if (sub.ai) sub.ai.returnTo = sub.returnTo;
    ship.ai = null; this.setUnit(ship);
    if (!docked) ship.ctl.throttle = Math.min(ship.ctl.throttle, 0.3); // slow ahead, so the submarine can catch up (the throttle is the player's again)
    world.say(docked ? `Back aboard ${ship.name}` : `Back aboard ${ship.name}, slow ahead. ${sub.name || 'The submarine'} is coming home to dock.`, 'info');
  },
  sub(u, dt) {
    const home = u.homeShip && u.homeShip.alive ? u.homeShip : (u.homeShip = null);
    const back = home ? `<kbd>B</kbd> Return to ${home.name}` : '';
    if (home && input.tap('returnShip')) { this.backToShip(u, home); return; }
    if (u.transit) { this.prompt = (u.transit.dock ? 'Docking: the ship is taking the submarine in' : 'Leaving through the hull doors') + (back ? '  ' + back : ''); u.aimPoint.copy(this.aimPoint); this.hint = home ? 'B return to the ship' : ''; return; }
    if (u.dockedTo) {
      const under = u.dockedTo.model.dock.under;
      this.prompt = (u.service ? serviceText(u) + '  ' : '') + (under ? '<kbd>E</kbd> Launch through the hull doors' : '<kbd>E</kbd> Cast off from the dock') + (back ? '  ' + back : ''); u.aimPoint.copy(this.aimPoint); this.hint = home ? 'E launch  B return to the ship' : 'E launch';
      if (input.tap('use')) { if (!u.homeShip) u.homeShip = u.dockedTo; u.undock(); world.say(under ? 'Hull doors open. Leaving the dock.' : 'Cast off. Backing out of the dock.', 'info'); }
      return;
    }
    if (u.undockT > world.t) { u.ctl.throttle = -0.35; u.ctl.rudder = 0; this.prompt = 'Backing out of the dock' + (back ? '  ' + back : ''); return; }
    this.helm(u, dt); u.firing = false;
    u.depthT = clamp(u.depthT + input.axis('rise', 'dive') * dt * 9, 0, u.maxDepth);
    if (input.tap('periscope')) { if (u.depth < 6 || u.depth > 20) { u.depthT = 13; world.say('Coming to periscope depth', 'info'); u.scope = true; this.scope = true; } else { u.scope = !u.scope; this.scope = u.scope; } }
    if (this.scope && (u.depth < 5 || u.depth > 21 || !u.scope)) { if (Math.abs(u.depthT - 13) > 6) { this.scope = false; u.scope = false; } }
    if (input.tap('ping')) { if (u.ping()) world.say('Active sonar ping: contacts revealed, and so are you', 'info'); }
    if (this.lmbHit && u.tubes) { if (u.depth > 40) world.say('Too deep to fire torpedoes', 'bad'); else if (!u.fireTorpedo(this.aimTarget && (this.aimTarget.kind === 'ship' || this.aimTarget.kind === 'sub') ? this.aimTarget : null)) audio.play('click'); }
    // docking with one of our ships that has a dock: it happens by itself when lined up and close, or on E from a little further off
    for (const s of world.units) {
      if (s.kind !== 'ship' || s.nation !== u.nation || !s.model.dock) continue;
      if (!u.canDock(s)) { if (u.awayFrom === s) u.awayFrom = null; continue; }   // clear of the ship it just left: the dock may take it in again
      const under = s.model.dock.under, lined = u.awayFrom !== s && u.lined(s);
      this.prompt = lined ? `Lined up: docking with ${s.name}` : `<kbd>E</kbd> Dock with ${s.name}` + (under ? ' (or line up astern at this depth)' : '');
      if (lined || input.tap('use')) { u.dock(s); if (!u.homeShip) u.homeShip = s; world.say(under ? `Hull doors open. Docking with ${s.name}.` : `Docked with ${s.name}`, 'good'); return; }
    }
    if (!this.prompt && back) this.prompt = back + (home.model.dock.under && Math.abs(u.depth - home.model.dock.depth) > 8 ? `  (its dock is ${Math.round(home.model.dock.depth)} m down)` : '');
    this.hint = 'W/S throttle  A/D rudder  R/F depth  P periscope  Q sonar ping' + (u.tubes ? '  LMB torpedo' : '') + (home ? '  B return to the ship' : '');
  },

  // Out of something that can only be had elsewhere: say so once, and keep a waypoint on the nearest place to get it.
  rearmNote(u) {
    this.rearmAt = null;
    if (!u.alive || (u.kind !== 'jet' && u.kind !== 'heli' && u.kind !== 'sub')) return;
    const k = emptyKey(u); if (!k) { this._outKey = null; return; }
    const sp = spot(u);
    if (k !== this._outKey || u !== this._outUnit) { this._outKey = k; this._outUnit = u; world.say(outText(u, k, sp, WEAPONS), 'bad'); }
    if (sp && !u.service && !u.dockedTo) { this.rearmAt = sp; makeWay(sp, u); }
  },

  // ---- jets ------------------------------------------------------------------------------------------------------------------
  // Planes fly on the keys: W nose down, S nose up, A/D a coordinated banked turn, Q/E rudder, Shift/Ctrl throttle.
  // The mouse only looks around. Guns and missiles follow the nose.
  jet(u, dt) {
    const c = u.ctl, s = save.settings, F = FEEL[u.type] || FEEL.fighter;
    c.throttle = clamp(c.throttle + input.axis('jetThrottleDown', 'jetThrottleUp') * dt * 0.7, 0, 1);
    c.ab = u.type === 'fighter' && input.on('jetThrottleUp') && c.throttle >= 0.995; // keep holding past 100%
    if (input.tap('gear') && u.state === 'fly') { u.gearDown = !u.gearDown; world.say(u.gearDown ? 'Gear down' : 'Gear up', 'info'); }
    if (input.tap('flares')) weapons.dropFlares(u);
    if (input.tap('cloak') && u.def.cloak) { u.toggleCloak(); world.say(u.cloaked ? 'Cloak on' : u.cloakCd > 0 ? 'Cloak recharging' : 'Cloak off', 'info'); }
    this.hint = 'W/S nose down/up  A/D turn  Q/E rudder  Shift/Ctrl throttle' + (u.type === 'fighter' ? ' (hold Shift for afterburner)' : '') + '  Mouse look  G gear  X flares' + (u.def.cloak ? '  C cloak' : '') + '  LMB fire';
    if (u.state === 'deck') {
      const cv = u.carrier; this.yaw = wrapPi(cv.yaw + u.deckYaw); this.pitch = 0.02; this.lookYaw = this.lookPitch = 0; this.jp = this.jt = 0; this.holdP = undefined;
      const onCat = cv.model.catapults.find((k) => k.pos.distanceTo(u.deckLocal) < 3);
      if (u.service) { this.prompt = serviceText(u); c.throttle = 0; }   // the deck crew are loading it: nothing to do but wait
      else if (onCat) { this.prompt = 'Hold <kbd>Shift</kbd> to full throttle: the catapult fires at 100%'; if (c.throttle >= 0.99) { u.launch(onCat); } }
      else { this.prompt = '<kbd>E</kbd> Taxi to the catapult'; c.throttle = 0; if (input.tap('use')) { const k = cv.model.catapults[0]; u.park(cv, k.pos, k.yaw); u.gearDown = true; } }
      return;
    }
    u.fwd(_f); const hy = Math.atan2(-_f.x, -_f.z), hp = Math.asin(clamp(_f.y, -1, 1));
    if (u.state !== 'fly') { c.pitch = 0.1; c.roll = 0; c.yaw = 0; this.yaw = hy; this.pitch = 0.12; this.lookYaw = this.lookPitch = 0; return; }
    this.yaw = wrapPi(hy + this.lookYaw); this.pitch = clamp(hp + this.lookPitch, -1.45, 1.45); // where the camera looks
    // stick: inputs build up smoothly, faster in the fighter than in the bomber
    let kp = input.axis('jetPitchDown', 'jetPitchUp'); if (s.invertPlane) kp = -kp;
    const kt = input.axis('jetLeft', 'jetRight');
    this.jp = damp(this.jp, kp, F.resp, dt); this.jt = damp(this.jt, kt, F.resp, dt);
    _a.set(1, 0, 0).applyQuaternion(u.quat); _b.set(0, 1, 0).applyQuaternion(u.quat);
    const bank = Math.atan2(-_a.y, _b.y), steep = Math.abs(_f.y) > 0.9; // bank > 0: right wing down
    // A/D hold a bank angle; letting go levels the wings. Near the vertical the keys roll the aircraft directly.
    c.roll = steep ? this.jt : clamp((this.jt * F.bank - bank) * 2.6, -1, 1);
    // the pull a banked turn needs to keep the nose on the horizon and bring it round (a level turn at this bank and speed)
    let pull = 0, fixP = 0, fixY = 0;
    const sp = Math.max(u.speed, 30), auth = clamp((sp - u.def.stall * 0.45) / (u.def.stall * 0.9), 0.08, 1), maxQ = Math.max(0.05, Math.min(u.def.pitchRate, (u.def.gLimit * 9.81) / sp) * auth), upright = !steep && _b.y > 0.1;
    if (upright) { const b2 = clamp(Math.abs(bank), 0, 1.4); pull = clamp((9.81 * Math.tan(b2) * Math.sin(b2)) / sp / maxQ * 1.3, 0, 0.95); } // a little over the textbook figure: the flight path lags the nose
    // While a turn is held and W/S are left alone, the nose stays at the height it had when the turn began. The pull alone
    // lifts it a little every second; the correction is shared between pitch and rudder by the bank angle.
    if (!upright || u.stalled || this.holdP === undefined || Math.abs(kp) > 0.01 || Math.abs(this.jp) > 0.06 || (Math.abs(this.jt) < 0.05 && Math.abs(bank) < 0.1)) this.holdP = hp;
    else { const w = clamp((hp - this.holdP) * 2.4, -0.2, 0.2); fixP = -w * Math.cos(bank) / maxQ; fixY = -w * Math.sin(bank) / (0.22 * auth); } // w > 0: the nose is high, rad/s to take off
    if (world.t - (u.launchT || -9) < 1.4 && !kp) this.jp = Math.max(this.jp, 0.35); // off the catapult: a little back-stick so it climbs away
    c.pitch = clamp(this.jp + pull + fixP, -1, 1);
    c.yaw = clamp(input.axis('jetRudderRight', 'jetRudderLeft') * 0.3 - this.jt * 0.3 + fixY, -1, 1); // gentle rudder for small corrections, plus a touch into the turn
    // weapons point where the nose points
    const w = u.fw[u.selKey];
    if (w && w.def.type === 'missile') { this.lockDef = w.def; const had = u.locked; seekLock(u, w.def, _f, dt, true); if (u.locked && !had) audio.play('lockTone'); else if (u.lockTarget && !u.locked && (this._bt = (this._bt || 0) - dt) < 0) { this._bt = 0.3; audio.play('lock'); } }
    else { u.lockTarget = null; u.locked = false; }
    if (w && w.def.type === 'bomb') { this.showBomb = true; u.bombImpact(this.bombPoint); }
    if (w && (w.def.type === 'missile' ? this.lmbHit : this.lmb)) { if (!u.fire() && this.lmbHit) audio.play('click'); }
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
    } else { this.stick.x = this.stick.y = 0; c.pitch = c.roll = c.yaw = 0; u.spool = c.collective > 0 || u.spool; this.prompt = u.service ? serviceText(u) + '  (lifting off stops it)' : u.rpm < 0.9 ? 'Hold <kbd>W</kbd> to spin up and lift off' : ''; if (u.pilot) { this.prompt += (this.prompt ? '  ' : '') + '<kbd>E</kbd> Get out'; if (input.tap('use')) { this.leaveHeli(u); return; } } }
    if (input.tap('flares')) weapons.dropFlares(u);
    u.aimPoint.copy(this.aimPoint); u.aimLead = this.aimTarget && this.assist === 'full' ? (u._lead || (u._lead = new V3())).copy(this.aimTarget.vel).sub(u.vel) : null; u.firing = this.lmb && u.selKey === 'chin';
    const w = u.fw[u.selKey];
    if (w) { this.lockDef = w.def; u.fwd(_f); const had = u.locked; seekLock(u, w.def, _f, dt, false); if (u.locked && !had) audio.play('lockTone'); if (this.lmbHit && !u.fire()) audio.play('click'); }
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
      const m = u.gun; m.cd -= 0; m.aimAt(this.aimPoint, dt, this.aimTarget && this.assist === 'full' ? _a.copy(this.aimTarget.vel).sub(m.unit.vel) : null);
      if (this.lmb) m.fire(this.aimTarget);
      this.prompt = '<kbd>E</kbd> Leave the gun'; if (input.tap('use')) { u.leaveGun(); }
      this.hint = 'Mouse aim  LMB fire  RMB zoom  E leave'; return;
    }
    c.mx = input.axis('left', 'right'); c.mz = input.axis('throttleDown', 'throttleUp'); c.run = input.on('run'); c.crouch = input.on('crouch'); c.jump = input.tap('jump'); c.fire = this.lmb;
    if (input.tap('reload')) u.reload();
    // context action: guns, helicopters, climbing out of the water
    let act = null;
    if (u.on) {
      for (const m of u.on.mounts) { if (m.manned || (m.key !== 'mg' && m.key !== 'ciws')) continue; _a.copy(m.t.node.position); if (Math.hypot(_a.x - u.local.x, _a.z - u.local.z) < 3 && Math.abs(_a.y - u.local.y) < 2.5) { act = { text: `<kbd>E</kbd> Man the ${m.def.name}`, run: () => u.takeGun(m) }; break; } }
    }
    if (!act && u.inside && u.on && u.on.docked && u.on.model.dock.under && u.local.y < u.on.model.interior.bay.y + 1) {
      const ship = u.on, sub = ship.docked;
      act = { text: `<kbd>E</kbd> Board the ${sub.def.label} ${sub.name}`, run: () => { u.isPlayer = false; world.remove(u); this.soldier = null; sub.ai = null; sub.homeShip = ship; this.setUnit(sub); world.say('Aboard the submarine. E launches through the hull doors.', 'info'); } };
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
  // Places the camera for the unit and view in use. Runs once per drawn frame, on the smoothed unit positions.
  // Rules: never inside geometry (chase views are pushed out of the own hull or pulled in front of whatever is in the way,
  // first-person views use anchors outside the model or hide it), never under water unless the unit is a submerged sub.
  camera(dt) {
    if (this._bv) { this._bv.visible = false; this._bv = null; } // the bridge's inside is drawn only in a ship's first-person view
    const u = this.unit, cam = gfx.camera, s = save.settings; if (!u) return;
    const view = u.model.view || {}, cp = Math.cos(this.pitch);
    _d.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp); // look direction from yaw/pitch
    let fov = s.fov, near = 0.5, cockpit = false;
    const scope = u.kind === 'sub' && this.scope && u.scopeA > 0.9;
    // a submarine in (or passing through) a dock under the waterline is watched from the walkway beside the berth
    const host = u.kind === 'sub' && u.alive ? u.dockedTo || (u.transit && u.transit.ship) : null;
    const inBay = !!(host && host.model.dock.under && host.model.interior && (u.dockedTo || host.toLocal(u.pos, _a).z < host.dims.length / 2 + 8));
    const tag = u.kind + ':' + (u.alive ? this.mode : 'dead') + ':' + (u.gun ? 'gun' : u.aboard ? 'ride' : scope ? 'scope' : '') + (u.kind === 'ship' && this.mode === 'gunner' ? u.selKey : '') + (inBay ? 'bay' : '');
    const snap = this._camUnit !== u || this._camTag !== tag;
    if (snap) { if (this._camUnit) cut(); this._camUnit = u; this._camTag = tag; this._pullT = 1; }
    fadeVeil(dt);
    this.scopeView = scope;
    if (u.kind === 'ship' || u.kind === 'sub') {
      const gun = this.mode === 'gunner' && (u.mounts.find((k) => k.key === u.selKey && k.inArc) || u.mounts.find((k) => k.key === u.selKey));
      if (inBay) {
        const bay = host.model.interior.bay; host.toLocal(u.pos, _a);
        _b.set(7.7, bay.y + 1.75, clamp(_a.z - 36, bay.z0 + 6, bay.z1 - 8)); host.toWorld(_b, cam.position);
        _a.y += 2.2; _a.z -= 10; host.toWorld(_a, _c); cam.lookAt(_c); near = 0.2;
      } else if (scope) { u.toWorld(u.model.scopeTop, cam.position); cam.position.y = Math.max(cam.position.y + 1.2, waveHeight(cam.position.x, cam.position.z) + 2.6); fov = 32; }
      else if (this.mode === 'first') {
        const eye = bridgeEye(u); u.toWorld(eye, cam.position); near = 0.25;
        if (u.kind === 'ship') {
          aboveWater(cam.position, 1);
          // the Super Destroyer has a real bridge to stand in; every other ship gets the bridge built round the eye
          if (u.bridgeView === undefined) { u.bridgeView = u.model.interior && u.model.interior.bay ? null : buildBridgeView(u.nation, eye, u.dims.beam); if (u.bridgeView) u.root.add(u.bridgeView); }
          if (u.bridgeView && u.alive) { u.bridgeView.visible = true; this._bv = u.bridgeView; near = 0.12; }
        }
      }
      else if (gun) {
        // over the gun and a little behind it; pulled forward if the superstructure is in the way
        const k = gun.t.kind, up = k === 'heavy' ? 6.4 : k === 'deckgun' ? 3.8 : 1.5, back = k === 'heavy' ? 12 : k === 'deckgun' ? 7.5 : 2.6;
        gun.pos(_a); _a.y += up; _b.copy(_a).addScaledVector(_d, -back); if (_b.y < _a.y - 1) _b.y = _a.y - 1;
        cam.position.copy(_a).lerp(_b, Math.max(segSolid(u, _a, _b, 0.6) - 0.05, 0)); aboveWater(cam.position, 0.8); near = 0.25;
      } else {
        // orbit: far enough out that the camera is never inside the box that holds the whole ship (masts and dock arms included)
        let dist = (view.chase || 80) * (1 - this.zoom * 0.25); const h = view.chaseH || 20, deep = u.kind === 'sub' && u.depth > 4, base = Math.max(u.pos.y, u.kind === 'sub' ? -400 : 0);
        for (let i = 0; i < 40; i++) {
          cam.position.set(u.pos.x - _d.x / (cp || 1) * dist, deep ? u.pos.y + h * 0.5 - this.pitch * dist * 0.5 : base + h * (0.55 - this.pitch * 0.9), u.pos.z - _d.z / (cp || 1) * dist);
          if (!inBounds(u, cam.position, 3)) break; dist += Math.max(5, dist * 0.06);
        }
        if (deep) cam.position.y = Math.min(cam.position.y, waveHeight(cam.position.x, cam.position.z) - 0.8); // stay cleanly below the surface
        else { aboveWater(cam.position, 1.5); this.lift(cam.position, u); }
      }
      if (!inBay) cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    } else if (u.kind === 'jet') {
      if (this.mode === 'first' && u.alive) { u.toWorld(u.model.cockpit, cam.position); cam.quaternion.copy(u.quat); if (u.state === 'fly') { _e.set(this.lookPitch, this.lookYaw, 0, 'YXZ'); cam.quaternion.multiply(_q.setFromEuler(_e)); } near = 0.1; cockpit = true; }
      else {
        const dist = view.chase || 30, h = view.chaseH || 6, fly = u.state === 'fly';
        u.fwd(_f); _b.copy(fly ? _d : _f);
        // the camera keeps a smoothed offset from the aircraft, so its distance does not change with speed
        _a.copy(_b).multiplyScalar(-dist); _a.y += h;
        if (snap) this._off.copy(_a); else this._off.lerp(_a, 1 - Math.exp(-7 * dt));
        _c.copy(u.pos); _c.y += 1.5; _a.copy(u.pos).add(this._off);
        this.pull(_c, _a, u, dt, snap, 6 / dist, 0.6, fly ? 0 : dist * 0.3); aboveWater(cam.position, 1);
        if (fly) _c.copy(u.pos).addScaledVector(_d, 400); else { _c.copy(u.pos).addScaledVector(_f, 25); _c.y += 2; } // on deck: keep the aircraft in frame even from a raised camera
        cam.lookAt(_c);
      }
      fov = s.fov + clamp((u.speed - 150) / 300, 0, 1) * 5;
    } else if (u.kind === 'heli') {
      if (this.mode === 'first' && u.alive) { u.toWorld(u.model.cockpit || _a.set(0, 0.5, -3), cam.position); cam.quaternion.copy(u.quat); near = 0.1; cockpit = true; }
      else {
        const dist = view.chase || 28, h = view.chaseH || 8; u.fwd(_f); const yaw = Math.atan2(-_f.x, -_f.z);
        _c.copy(u.pos); _c.y += 1.5; _a.set(u.pos.x + Math.sin(yaw) * dist, u.pos.y + h, u.pos.z + Math.cos(yaw) * dist);
        const landed = u.state !== 'fly';
        this.pull(_c, _a, u, dt, snap, 6 / dist, 0.6, landed ? dist * 0.3 : 0); aboveWater(cam.position, 1);
        if (landed) { _c.copy(u.pos).addScaledVector(_f, 12); cam.lookAt(_c); } else cam.rotation.set(-0.16, yaw, 0, 'YXZ');
      }
    } else {
      near = 0.1; u.hideBody = false;
      if (u.aboard) { const h = u.aboard, dist = 30; _c.copy(h.pos); _c.y += 2; _a.set(h.pos.x - _d.x * dist, h.pos.y + 6 - _d.y * dist, h.pos.z - _d.z * dist); this.pull(_c, _a, h, dt, snap, 0.2); aboveWater(cam.position, 1); near = 0.5; }
      else if (u.gun) { const m = u.gun; m.pos(cam.position); m.dir(_f); cam.position.y += 0.42; cam.position.addScaledVector(_f, -0.55); u.hideBody = u.alive; }
      else if ((this.mode === 'first' && u.alive) || u.inside) { u.eye(cam.position); if (!u.alive) cam.position.y -= 1.2; cam.position.addScaledVector(_d, 0.1); if (!u.inside) aboveWater(cam.position, 0.3); u.hideBody = u.alive; }
      else {
        // over the right shoulder; comes in close when a wall or the deck above is behind the marine
        u.eye(_c); _a.copy(_c).addScaledVector(_d, -4.2); _a.y += 0.7; _a.x += Math.cos(this.yaw) * 0.6; _a.z -= Math.sin(this.yaw) * 0.6;
        this.pull(_c, _a, u, dt, snap, 0.1, 0.3);
        // squeezed right up against the marine: use their eyes instead, so the camera is never inside the body or the wall behind
        if (cam.position.distanceTo(_c) < 1.1 && u.alive) { cam.position.copy(_c).addScaledVector(_d, 0.1); u.hideBody = true; }
        aboveWater(cam.position, 0.3);
      }
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    }
    // first person in an aircraft: the outside model is hidden and a cockpit frame is drawn instead
    const hide = cockpit && u.alive, was = this._cockUnit;
    if (was && (was !== u || !hide)) { was.hideModel = false; if (was._cockpit) was._cockpit.visible = false; this._cockUnit = null; }
    if (hide) { if (!u._cockpit) { u._cockpit = buildCockpit(u.kind); u._cockpit.position.copy(u.model.cockpit || _a.set(0, 0.5, -3)); u.root.add(u._cockpit); } u._cockpit.visible = true; u.hideModel = true; this._cockUnit = u; }
    if (gfx.trauma > 0.002) {
      // camera shake: only from real events (hits, explosions close by, heavy guns firing, very hard turns), never from speed
      const k = gfx.trauma * gfx.trauma * (s.shake ?? 0.5) * 2, t = performance.now() / 1000;
      if (k > 0) { cam.rotateX(k * 0.016 * Math.sin(t * 37)); cam.rotateY(k * 0.016 * Math.sin(t * 29 + 1)); cam.rotateZ(k * 0.024 * Math.sin(t * 23 + 2)); }
      gfx.trauma = Math.max(0, gfx.trauma - dt * 1.9);
    }
    // right button: a marine on foot only leans into the sights (slight zoom); everything else zooms properly
    if (this.zoom > 0.01) fov = fov / (1 + this.zoom * (this.scopeView ? 3 : u.kind === 'soldier' && !u.gun && !u.aboard ? 0.35 : 2));
    if (Math.abs(cam.fov - fov) > 0.05 || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  },
  // move the camera from `from` toward `to`, stopping short of anything solid. Comes in at once, eases back out.
  // With `lift` (m), a blocked or crowded spot is first swapped for a higher, closer one: on a busy flight deck the camera
  // rises to look down over the neighbours instead of ending up inside one.
  pull(from, to, skip, dt, snap, minT = 0.15, pad = 0.6, lift = 0) {
    let t = clearT(from, to, skip, pad);
    if (lift > 0 && (t < 0.85 || crowded(to, skip))) {
      for (let k = 1; k <= 5; k++) {
        _g.copy(from).lerp(to, 1 - 0.12 * k); _g.y = to.y + lift * k;
        const tk = clearT(from, _g, skip, pad);
        if ((tk >= 0.85 && !crowded(_g, skip)) || k === 5) { to.copy(_g); t = tk; break; }
      }
    }
    t = Math.max(t, minT);
    this._pullT = snap || t < this._pullT ? t : this._pullT + (t - this._pullT) * (1 - Math.exp(-4 * dt));
    gfx.camera.position.copy(from).lerp(to, Math.max(this._pullT - 0.03, 0.02));
  },
  // a ship's orbit camera rises over island ground and over any other ship it would otherwise sit inside
  lift(p, skip) {
    const gy = world.terrain(p.x, p.z) + 3; if (p.y < gy) p.y = gy;
    for (const o of world.units) {
      if (o === skip || o.gone || (o.kind !== 'ship' && o.kind !== 'sub') || !o.bounds) continue;
      const dx = o.pos.x - p.x, dz = o.pos.z - p.z, r = o.radius * 1.3 + 10; if (dx * dx + dz * dz > r * r) continue;
      if (inBounds(o, p, 2)) p.y = Math.max(p.y, o.pos.y + o.bounds.max.y + 4);
    }
  },
  // What is under the reticle (from the camera as last drawn): the enemy nearest the sight line, or failing that one of our
  // own (which locks the trigger). The catch area is generous, so a small ship on the horizon still registers.
  // Aim point by assistance level: FULL = the target itself (guns then range and lead on it), PARTIAL = the point on the
  // sight line at the target's range (range set for you, lead is yours), OFF = wherever the sight line meets the sea.
  aim() {
    const u = this.unit, cam = gfx.camera, subj = u.kind === 'soldier' && u.aboard ? u.aboard : u;
    this.assist = save.settings.aimAssist || 'full';
    cam.getWorldDirection(_f);
    let best = null, bestA = 0.042, friend = null, frA = 0.016;
    for (const e of world.units) {
      if (!e.alive || e === subj || e === u) continue;
      const foe = e.nation !== u.nation; if (foe ? !e.seen : (e === u.on || e === u.carrier || e === subj.on || (u.gun && e === u.gun.unit) || (e.kind === 'soldier' && e.aboard))) continue;
      _a.copy(e.pos).sub(cam.position); const d = _a.length(); if (d > 16000 || d < 2) continue;
      const ang = Math.acos(clamp(_a.dot(_f) / d, -1, 1)) - Math.atan(e.radius * 0.5 / d);
      if (foe) { if (ang < bestA) { bestA = ang; best = e; } } else if (ang < frA) { frA = ang; friend = e; }
    }
    this.aimTarget = best; this.aimFriend = best ? null : friend;
    if (best && this.assist === 'full') { this.aimPoint.copy(best.pos); if (best.kind === 'ship') this.aimPoint.y += 2; else if (best.kind === 'soldier') this.aimPoint.y += 1.1; }
    else if (best && this.assist === 'partial') this.aimPoint.copy(cam.position).addScaledVector(_f, cam.position.distanceTo(best.pos));
    else { const t = _f.y < -0.004 ? Math.min((cam.position.y - 0) / -_f.y, 16000) : 5000; this.aimPoint.copy(cam.position).addScaledVector(_f, Math.max(t, 30)); }
  },
  // the aim-off point for the weapon in hand: where the target will be when the round arrives, and the flight time
  lead(u) {
    this.showLead = false; const tg = this.aimTarget; if (!tg || this.assist !== 'full') return;
    const def = u.gun ? u.gun.def : WEAPONS[u.selKey]; if (!def || !def.speed || (def.type !== 'gun' && def.type !== 'shell')) return;
    const from = u.kind === 'soldier' && u.gun ? u.gun.unit : u, own = u.kind === 'soldier' && !u.gun ? null : from.vel; // rifle rounds do not carry the shooter's speed
    let tof = from.pos.distanceTo(tg.pos) / def.speed;
    for (let k = 0; k < 2; k++) { this.leadPoint.copy(tg.pos).addScaledVector(tg.vel, tof); if (own) this.leadPoint.addScaledVector(own, -tof); tof = from.pos.distanceTo(this.leadPoint) / def.speed; }
    if (from.pos.distanceTo(tg.pos) > def.range * 1.2) return;
    if (tg.kind === 'ship') this.leadPoint.y += 2;
    this.leadT = tof; this.showLead = true;
  },
};
