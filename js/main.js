// Steel Tide: boot, the fixed-step core loop, and the game-state flow (menu -> battle -> pause / redeploy -> next battle).
import * as THREE from 'three';
import { gfx } from './gfx/renderer.js';
import { ocean, waveHeight } from './gfx/ocean.js';
import { fx } from './gfx/effects.js';
import { audio } from './audio/audio.js';
import { input } from './core/input.js';
import { save } from './core/save.js';
import { NATIONS, UNITS, VERSION } from './core/config.js';
import { V3, clamp, el } from './core/util.js';
import { world } from './world/world.js';
import { battle } from './world/battle.js';
import { weapons } from './sim/weapons.js';
import { player } from './sim/player.js';
import { crew } from './sim/crewpick.js';
import { wrecks } from './sim/wreck.js';
import { econ, fmtCredits, PAY } from './core/economy.js';
import { applyPaint } from './gfx/paint.js';
import { store } from './core/store.js';
import { BUILDERS } from './sim/factory.js';
import { hud } from './ui/hud.js';
import { menus } from './ui/menus.js';

const STEP = 1 / 60, _a = new V3(), _b = new V3();
let last = 0, acc = 0, fpsT = 0, fpsN = 0, fpsWatch = 0, orbit = 0, deadT = 0;
let fpview = null;
if (/[?&]v2/.test(location.search)) import('./sim/v2/fpview.js').then((m) => { fpview = m.fpview; }).catch((e) => console.warn('v2 first-person view not loaded: ' + e.message));
const wakeList = [], shipList = [];

export const app = {
  state: 'boot', // boot | menu | select | battle | paused | dead | over
  fps: 60,
  boot() {
    const bar = el('boot-fill'), txt = el('boot-text'); const prog = (p, t) => { bar.style.width = p + '%'; txt.textContent = t; };
    save.load();
    const canvas = el('game');
    prog(15, 'Painting hulls');
    setTimeout(() => {
      try {
        gfx.init(canvas); prog(45, 'Filling the sea');
        fx.init(); ocean.init(); weapons.init(); world.buildIslands(); crew.init(); wrecks.init(BUILDERS); world.missiles = weapons.missiles; world.torps = weapons.torps;
        input.init(canvas); hud.init(); menus.init(app);
        // Credits: only the player's own kills (and assists where they did a fifth of the damage) pay
        world.onBattleStart = () => econ.startBattle();
        world.onAdd = (u) => { if (!battle.spawning) battle.dressRandom(u); }; // not the unit the player is about to take
        wrecks.paintFn = applyPaint;
        world.onBattleEnd = (won) => { econ.finish(won); store.refresh(); }; // with an account: send the result to be checked, then take the server's balance
        if (store.signedIn) store.refresh();
        world.onPay = (u, by) => {
          const pu = player.unit; if (!pu || u.nation === world.playerNation || !(this.state === 'battle' || this.state === 'dead')) return null;
          const mine = by && (by === pu || by.isPlayer || (pu.gun && pu.gun.unit === by));
          if (mine) return { mine: true, text: econ.credit(u, 1) };
          if ((u.playerDmg || 0) >= u.maxHp * 0.2) return { mine: false, text: econ.credit(u, PAY.assist) };
          return null;
        };
        econ.onPop = (t) => hud.pop(t);
        econ.onCap = () => { world.say(`Infantry pay limit reached (${fmtCredits(PAY.infantryCap)} this battle). Ships and aircraft still pay full. Go after bigger targets!`, 'info'); };
        world.onKill = (u, by) => { battle.onKill(u, by); if (by && by.isPlayer) world.playerKills = (world.playerKills || 0) + 1; if (u.isPlayer || (player.soldier === u && player.unit && player.unit.pilot === u)) this.playerDied(u, by); };
        battle.onEnd = () => this.nextBattle();
        input.onLockChange = (l) => { if (!l && this.state === 'battle') this.pause(); };
        document.addEventListener('visibilitychange', () => { if (document.hidden) { if (this.state === 'battle') this.pause(); audio.suspend(); } else { last = performance.now(); if (this.state !== 'paused') audio.resume(); } });
        addEventListener('keydown', (e) => { if (e.code === 'Escape') { if (this.state === 'battle' && input.noLock) this.pause(); else if (this.state === 'paused') menus.back(); } });
        prog(80, 'Putting to sea');
        battle.start(save.data.last.nation); world.playerKills = 0;
        prog(100, 'Ready');
        this.state = 'menu'; menus.show('title'); el('boot').hidden = true;
        audio.setVolumes(save.settings.sfx, save.settings.music);
        const q = new URLSearchParams(location.search);
        // Ctrl is the plane's throttle-down key and Ctrl+W closes a browser tab: ask before leaving a battle
        addEventListener('beforeunload', (e) => { if (this.state === 'battle' && !input.noLock) { e.preventDefault(); e.returnValue = ''; } });
        if (q.has('devtest') || q.has('debugtest')) import('./debug.js').then((m) => { window.__steelTide.dev = m.dev; });
        if (q.has('auto')) this.play(q.get('nation') || save.data.last.nation, q.get('auto'), { dock: q.has('dock') });
        last = performance.now(); requestAnimationFrame((t) => this.frame(t));
      } catch (e) { console.error(e); txt.textContent = 'Could not start: ' + e.message; }
    }, 30);
  },

  // ---- flow ------------------------------------------------------------------------------------------------------------------
  play(nation, type, opts = {}) {
    audio.init(); audio.resume(); audio.setScene('battle');
    if (world.playerNation !== nation || world.over || !battle.active) { battle.start(nation); world.playerKills = 0; hud.clearFeed(); }
    if (player.unit && player.unit.alive && player.unit.isPlayer) battle.releasePlayer(player.unit);
    const u = battle.spawnPlayer(type, opts); player.soldier = null; player.setUnit(u);
    document.documentElement.style.setProperty('--nation', NATIONS[nation].color);
    econ.join(); if (econ.data.battles < 3 && !econ.b.tipped) { econ.b.tipped = true; world.say('Tip: sinking ships pays more than taking out soldiers.', 'info'); }
    this.state = 'battle'; menus.hide(); hud.show(true); input.lock(); fpsWatch = 7; fpsT = 0; fpsN = 0; acc = 0;
    hud.message(u.def.label.toUpperCase(), `${NATIONS[nation].classes[type]}${u.name ? ' · ' + u.name : ''}`, 3.5);
  },
  pause() { if (this.state !== 'battle') return; this.state = 'paused'; input.unlock(); menus.show('pause'); audio.suspend(); },
  resume() { if (this.state !== 'paused') return; this.state = 'battle'; menus.hide(); audio.resume(); input.lock(); last = performance.now(); acc = 0; },
  toMenu() { if (player.unit && player.unit.alive) battle.releasePlayer(player.unit); player.unit = null; world.player = null; this.state = 'menu'; hud.show(false); input.unlock(); audio.resume(); audio.music('menu'); menus.show('title'); },
  playerDied(u, by) {
    if (this.state !== 'battle' && this.state !== 'paused') return;
    save.stats.deaths++; save.write(); deadT = u.isAir ? 5.5 : 3.2; this.state = 'dead'; // long enough to watch the wreck fall
    hud.message(u.kind === 'ship' || u.kind === 'sub' ? 'SHIP LOST' : u.kind === 'soldier' ? 'KILLED IN ACTION' : 'AIRCRAFT LOST', by ? `by ${by.label}` : '', 3);
  },
  redeploy() { this.state = 'select'; input.unlock(); hud.show(false); menus.show('units', { redeploy: true }); },
  nextBattle() {
    const n = world.playerNation; if (this.state === 'menu') { battle.start(n); return; } // the title-screen battle just starts over
    if (player.unit && player.unit.alive) battle.releasePlayer(player.unit); player.unit = null;
    battle.start(n); world.playerKills = 0; hud.clearFeed(); this.state = 'select'; input.unlock(); hud.show(false); menus.show(econ.last && econ.last.played ? 'results' : 'units', { redeploy: true, next: true });
  },
  setFast(on, silent) { save.settings.fast = on; save.settings.fastAsked = true; save.write(); gfx.applyQuality(); menus.syncFast(); if (!silent) audio.play('click'); },

  // test hook: run the simulation forward synchronously (the tab may be throttled while hidden)
  advance(secs) { this.alpha = 1; const n = Math.round(secs / STEP); for (let i = 0; i < n; i++) { if (i % 2 === 0 && (this.state === 'battle' || this.state === 'dead')) { player.update(STEP * 2); player.camera(STEP * 2); } if (this.state !== 'paused') this.step(STEP); if (i % 2 === 1) input.endFrame(); if (i % 6 === 5) this.present(STEP * 6, true); } return world.t; },

  // ---- loop ------------------------------------------------------------------------------------------------------------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1; if (dt <= 0) return;
    fpsT += dt; fpsN++; if (fpsT >= 1) { this.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; this.fpsTick(); }
    // if the browser refused to give the mouse back (it does for a moment after Esc), fall back to the pause menu
    if (this.state === 'battle' && !input.locked) { this._noLock = (this._noLock || 0) + dt; if (this._noLock > 0.6) { this._noLock = 0; this.pause(); } } else this._noLock = 0;
    const sim = this.state !== 'paused' && this.state !== 'boot';
    if (sim) {
      if (this.state === 'battle' || this.state === 'dead') player.update(dt);
      acc += dt; let n = 0;
      while (acc >= STEP && n < 4) { this.step(STEP); acc -= STEP; n++; }
      if (n === 4) acc = 0;
      this.alpha = acc / STEP;
      if (this.state === 'dead') { deadT -= dt; if (deadT <= 0) { if (battle.active) this.redeploy(); else this.state = 'over'; } }
    }
    audio.setScene(this.state === 'battle' || this.state === 'dead' ? 'battle' : 'menu');
    const showroom = menus.showroomActive && (this.state === 'select' || this.state === 'menu'); audio.ambience(showroom);
    if (showroom) { menus.renderShowroom(dt); input.endFrame(); return; } // the battle above still ran; it is just not drawn or heard
    this.present(dt, sim);
    input.endFrame();
  },
  step(dt) {
    world.t += dt;
    const U = world.units;
    for (let i = U.length - 1; i >= 0; i--) U[i].keepPose();
    for (let i = U.length - 1; i >= 0; i--) { const u = U[i]; if (u) u.update(dt); }
    weapons.update(dt); world.updateDetection(dt); battle.update(dt);
  },
  present(dt, sim, keepCam) {
    const cam = gfx.camera, pu = player.unit, U = world.units, al = this.alpha;
    for (let i = 0; i < U.length; i++) U[i].pushRender(al); // draw between physics steps, see Unit.pushRender
    if (keepCam) { /* a developer check has placed the camera */ }
    else if ((this.state === 'battle' || this.state === 'dead' || this.state === 'paused') && pu) { if (sim) player.camera(dt); }
    else this.attractCamera(dt);
    // sync transforms, LOD, wakes
    shipList.length = 0; const cp = cam.position;
    for (const u of world.units) {
      u.sync(); u.updateLod(cp);
      if ((u.kind === 'ship' || u.kind === 'sub') && u.camDist < 9000 && !(u.kind === 'sub' && u.depth > 6) && u.sunk < u.dims.draft + 4) shipList.push(u);
    }
    shipList.sort((a, b) => a.camDist - b.camDist);
    // wakes and hull foam for the nearest ships (objects are reused: nothing is created per frame)
    wakeList.length = Math.min(shipList.length, 16);
    for (let k = 0; k < wakeList.length; k++) { const u = shipList[k], o = wakeList[k] || (wakeList[k] = {}), spd = clamp(Math.abs(u.speed) / u.def.speed, 0, 1); o.x = u.pos.x; o.z = u.pos.z; o.fx = -Math.sin(u.yaw); o.fz = -Math.cos(u.yaw); o.hl = u.dims.length / 2; o.hb = Math.min(u.dims.beam / 2, u.dims.length * 0.075); o.spd = u.alive ? spd : 0.15; o.wake = u.dims.length * 2.6 * spd; }
    ocean.setShips(wakeList);
    const wy = waveHeight(cp.x, cp.z), under = wy - cp.y;
    gfx.setUnderwater(under > 0.05 ? under : 0); audio.setUnderwater(under > 0.05);
    ocean.update(sim ? dt : 0, cam);
    if (sim) { fx.update(dt); wrecks.update(dt, cp); crew.update(dt, cp); if (under > 0.05 && Math.random() < 0.3) { cam.getWorldDirection(_a); _b.copy(cp).addScaledVector(_a, 6 + Math.random() * 14); _b.x += (Math.random() - 0.5) * 16; _b.y += (Math.random() - 0.5) * 8; _b.z += (Math.random() - 0.5) * 16; fx.bubbles(_b, 0.6); } }
    const focus = pu && this.state !== 'menu' && this.state !== 'select' ? (pu.kind === 'soldier' && pu.on ? pu.on : pu) : world.carriers[world.playerNation];
    if (focus) gfx.focusShadow(pu && pu.kind === 'soldier' ? pu.pos : focus.pos, focus.dims ? Math.max(focus.dims.length * 0.62, 40) : 60);
    this.audioScene(dt, cam);
    if (this.state === 'battle' || this.state === 'dead') hud.update(dt);
    if (fpview) fpview.update(sim ? dt : 0, player, gfx);
    gfx.render();
    if (fpview) fpview.render(gfx);
    for (let i = 0; i < U.length; i++) U[i].popRender();
  },
  attractCamera(dt) {
    const cv = world.carriers[world.playerNation] || world.units[0]; if (!cv) return; orbit += dt * 0.035;
    const cam = gfx.camera, r = 430;
    cam.position.set(cv.pos.x + Math.cos(orbit) * r, 62 + Math.sin(orbit * 0.7) * 22, cv.pos.z + Math.sin(orbit) * r);
    _a.copy(cv.pos); _a.y += 24; cam.lookAt(_a);
    if (cam.fov !== 55) { cam.fov = 55; cam.near = 0.5; cam.updateProjectionMatrix(); }
  },
  audioScene(dt, cam) {
    if (!audio.ready) return;
    cam.getWorldDirection(_a); audio.setListener(cam.position, _a);
    const pu = player.unit, veh = pu && pu.kind === 'soldier' && pu.aboard ? pu.aboard : pu, battleOn = this.state === 'battle' || this.state === 'dead';
    audio.setLoop('sea', gfx.underwater ? 'underwater' : 'sea', { vol: gfx.underwater ? 0.5 : cam.position.y < 150 ? 0.35 : 0.12 });
    if (battleOn && veh && veh.alive) {
      if (veh.kind === 'ship') audio.setLoop('p', 'shipEngine', { vol: 0.35 + Math.abs(veh.throttle) * 0.4, pitch: 0.7 + Math.abs(veh.throttle) * 0.7 });
      else if (veh.kind === 'sub') audio.setLoop('p', 'subHum', { vol: 0.3 + Math.abs(veh.throttle) * 0.3, pitch: 0.8 + Math.abs(veh.throttle) * 0.5 });
      else if (veh.kind === 'jet') { audio.setLoop('p', 'jet', { vol: 0.35 + veh.throttle * 0.5, pitch: 0.6 + veh.throttle * 0.8 }); if (veh.abOn) audio.setLoop('pab', 'afterburner', { vol: 0.8 }); if (veh.state === 'fly') audio.setLoop('pw', 'wind', { vol: clamp(veh.speed / 500, 0, 0.6) }); }
      else if (veh.kind === 'heli') audio.setLoop('p', 'rotor', { vol: veh.rpm * 0.9, pitch: 0.4 + veh.rpm * 0.6 });
    }
    // the nearest few other engines around the camera
    let n = 0;
    for (const u of world.units) {
      if (u === veh || !u.alive || u.kind === 'soldier' || u.camDist > 2500 || n >= 4) continue;
      const id = 'u' + u.id;
      if (u.kind === 'jet' && u.state !== 'deck') { audio.setLoop(id, 'jet', { vol: 0.9, pitch: 1 + clamp(u.speed / 400, 0, 1) * 0.5, pos: u.pos }); n++; }
      else if (u.kind === 'heli' && u.rpm > 0.2) { audio.setLoop(id, 'rotor', { vol: u.rpm, pitch: 1, pos: u.pos }); n++; }
      else if (u.kind === 'ship' && u.camDist < 900) { audio.setLoop(id, 'shipEngine', { vol: 0.5, pitch: 0.8 + Math.abs(u.throttle) * 0.4, pos: u.pos }); n++; }
      if (u.fires && u.fires.length && u.camDist < 700) audio.setLoop('f' + u.id, 'fire', { vol: 0.6, pos: u.pos });
    }
  },
  // low frame rate early in a battle: switch Fast Graphics on and say so
  fpsTick() {
    if (this.state !== 'battle' || fpsWatch <= 0) return;
    fpsWatch -= 1; this._low = (this._low || 0) + (this.fps < 27 ? 1 : 0);
    if (fpsWatch <= 0) { if (this._low >= 4 && !save.settings.fast && !save.settings.fastAsked) { this.setFast(true, true); menus.notice('Frame rate was low, so Fast Graphics was turned on.', 'Turn it off', () => this.setFast(false)); } this._low = 0; }
  },
};
window.__steelTide = { app, world, player, gfx, battle, input, save, audio, hud, THREE };
app.boot();
