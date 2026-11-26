// Battle setup and flow: both fleets, the player's unit, reinforcements, and the win condition (sink the enemy carrier).
import * as THREE from 'three';
import { world } from './world.js';
import { NATIONS, UNITS, MAP, otherNation } from '../core/config.js';
import { save } from '../core/save.js';
import { V3, rand, pick } from '../core/util.js';
import { createUnit, BUILDERS } from '../sim/factory.js';
import { attachAI } from '../sim/ai.js';
import { weapons } from '../sim/weapons.js';
import { wrecks } from '../sim/wreck.js';
import { cosmetics } from '../core/cosmetics.js';
import { applyPaint } from '../gfx/paint.js';
import { audio } from '../audio/audio.js';

const sgn = (n) => (n === 'aethia' ? 1 : -1);
const facing = (n) => (n === 'aethia' ? 0 : Math.PI);
// fleet composition per side: [type, x, zOffset from mid toward home (multiplied by side sign), formation slot relative to the carrier]
const FLEET = [
  ['carrier', 0, 6000, [0, 0]], ['battlecruiser', -900, 3350, [-900, -950]], ['corvette', 950, 3000, [950, -1300]], ['corvette', -2000, 2900, [-1900, -1200]],
  ['patrol', 300, 2250, [300, 0]], ['patrol', 1800, 2400, [900, 0]], ['patrol', -1200, 2200, [-900, 0]],
  ['attacksub', 2500, 2700, [1500, 0]], ['reconsub', -2700, 2500, [-1500, 0]],
];
const AIR = [['fighter', -600, 700], ['fighter', 500, 900], ['fighter', 1400, 1100], ['bomber', -1500, 1300], ['recon', 300, 1800], ['attackheli', 800, 110]];

export const battle = {
  nameIdx: { aethia: 0, extro: 0 }, respawns: [], endT: 0, onEnd: null, active: false, parked: {},
  sdChance: 0.4, // how often a side brings its Super Destroyer to a battle (never more than one a side)

  shipName(nation) { const l = NATIONS[nation].shipNames; return l[this.nameIdx[nation]++ % l.length]; },
  unitName(type, nation) {
    const N = NATIONS[nation];
    if (N.capital[type]) return N.capital[type];
    const k = UNITS[type].kind;
    if (k === 'ship' || k === 'sub') return this.shipName(nation);
    if (k === 'soldier') return '';
    return `${nation === 'aethia' ? pick(['Kite', 'Swift', 'Martin', 'Linnet', 'Wren', 'Rook', 'Dove', 'Finch']) : pick(['Gust', 'Flash', 'Rumble', 'Sleet', 'Drift', 'Bolt', 'Haze', 'Frost'])} ${Math.floor(rand(1, 9))}-${Math.floor(rand(1, 9))}`;
  },

  start(playerNation) {
    world.clear(); weapons.clear(); wrecks.clear(); world.onBattleStart && world.onBattleStart(); this.respawns.length = 0; this.nameIdx = { aethia: 0, extro: 0 }; this.endT = 0; this.active = true; world.t = 0;
    world.playerNation = playerNation;
    for (const n of ['aethia', 'extro']) this.spawnSide(n);
    for (const n of ['aethia', 'extro']) if (Math.random() < this.sdChance) { const u = this.spawnSD(n); world.say(`${NATIONS[n].name} has brought a Super Destroyer: ${u.name}.`, n === playerNation ? 'info' : 'bad'); }
    world.say(`${NATIONS.aethia.name} and ${NATIONS.extro.name} fleets are closing. Sink the enemy carrier.`, 'info');
  },

  spawnSide(n) {
    const s = sgn(n);
    for (const [type, x, z, slot] of FLEET) {
      const u = createUnit(type, n, this.unitName(type, n));
      u.pos.set(x * s, 0, z * s); u.yaw = facing(n); u.throttle = 0.5; u.speed = u.def.speed * 0.4;
      attachAI(u, new V3(slot[0] * s, 0, slot[1] * 1)); world.add(u);
      if (type === 'carrier') { world.carriers[n] = u; this.dressCarrier(u); }
      if (u.kind === 'sub') { u.depth = u.depthT = 13; }
    }
    // the recon sub starts in the battlecruiser's dock and slips out once the fleets engage
    const bc = world.units.find((u) => u.nation === n && u.type === 'battlecruiser'), rs = world.units.find((u) => u.nation === n && u.type === 'reconsub');
    if (bc && rs) { rs.depth = rs.depthT = 0; rs.dock(bc); }
    for (const [type, x, alt] of AIR) this.spawnAir(type, n, x * s, alt, true);
    // transport helicopter on the carrier helipad, marines waiting on deck and holding the island
    const cv = world.carriers[n], hp = cv.model.helipads[0];
    const th = createUnit('transport', n, this.unitName('transport', n)); th.place(cv, hp.pos, 0); attachAI(th); world.add(th);
    for (let i = 0; i < 4; i++) this.spawnMarine(n, 'deck');
    for (let i = 0; i < 4; i++) this.spawnMarine(n, 'island');
  },

  // The Super Destroyer, with an attack submarine in its dock. home: arriving from the home edge (the player asked for one).
  spawnSD(n, home = false) {
    const s = sgn(n), u = createUnit('superdestroyer', n, this.unitName('superdestroyer', n));
    if (home) u.pos.set(rand(-1500, 1500), 0, s * (MAP.carrierZ + 1100)); else u.pos.set(700 * s, 0, 4500 * s);
    u.yaw = facing(n); u.throttle = 0.5; u.speed = u.def.speed * 0.4; attachAI(u, new V3(700 * s, 0, -1500)); world.add(u);
    const sub = createUnit('attacksub', n, this.unitName('attacksub', n)); attachAI(sub, new V3(-1200 * s, 0, 0)); world.add(sub); sub.berth(u);
    return u;
  },

  // parked aircraft on the flight deck (the air wing waiting its turn)
  dressCarrier(cv) {
    const spots = cv.model.parking; const g = new THREE.Group();
    spots.forEach((p, i) => {
      const heli = i >= 10; const m = (heli ? BUILDERS.attackheli : BUILDERS.fighter)(cv.nation, 0);
      const gh = m.userData.model.gearHeight; m.position.copy(p.pos); m.position.y += gh; m.rotation.y = p.yaw;
      for (const gr of m.userData.model.gear) gr.visible = true; for (const b of m.userData.model.burners) b.visible = false;
      for (const sp of m.userData.model.spinners) if (sp.disc) sp.disc.visible = false;
      for (const t of m.userData.model.turrets) m.add(t.node);
      g.add(m);
    });
    cv.lod0.add(g); cv.parkedGroup = g;
  },

  spawnAir(type, n, x, alt, airborne) {
    const s = sgn(n), cv = world.carriers[n], u = createUnit(type, n, this.unitName(type, n));
    if (u.kind === 'jet') {
      if (airborne || !cv || !cv.alive) { u.pos.set(x, alt, s * (MAP.carrierZ - 600 + rand(-500, 500))); u.quat.setFromAxisAngle(new V3(0, 1, 0), facing(n)); u.vel.set(0, 0, -s * u.def.cruise); u.speed = u.def.cruise; u.state = 'fly'; u.throttle = 0.8; }
      else { const cat = cv.model.catapults[Math.random() < 0.5 ? 0 : 1]; u.park(cv, cat.pos, cat.yaw); u.launch(cat); }
    } else {
      if (airborne || !cv || !cv.alive) { u.pos.set(x, alt, s * 2600); u.yaw = facing(n); u.state = 'fly'; u.rpm = 1; }
      else { u.place(cv, cv.model.helipads[1].pos, 0); }
    }
    attachAI(u); world.add(u); return u;
  },

  spawnMarine(n, where) {
    const u = createUnit('marine', n), cv = world.carriers[n];
    if (where === 'deck' && cv && cv.alive) { const hp = cv.model.helipads[0].pos; u.placeOn(cv, new V3(hp.x + rand(-9, 9), hp.y, hp.z - 18 + rand(-4, 4))); u.look = rand(0, 6.28); }
    else { const p = world.pads[n === 'aethia' ? 0 : 1]; const x = p.x + rand(-28, 28), z = p.z + rand(-28, 28); u.placeAt(x, world.terrain(x, z), z); u.look = n === 'aethia' ? 0 : Math.PI; }
    attachAI(u); world.add(u); return u;
  },

  // ---- the player's unit ---------------------------------------------------------------------------------------------------
  spawnPlayer(type, opts = {}) {
    const n = world.playerNation, s = sgn(n), def = UNITS[type], cv = world.carriers[n]; this.spawning = true;
    let u = null;
    if (def.kind === 'ship' || def.kind === 'sub') {
      // take command of one of our ships of that class if one is afloat, otherwise a fresh one arrives from the home edge
      const free = (x) => x.nation === n && x.type === type && x.alive && !x.isPlayer;
      u = world.units.find((x) => free(x) && !x.dockedTo && !x.transit) || world.units.find(free); // a submarine at sea before one sitting in a dock
      if (!u && type === 'superdestroyer') u = this.spawnSD(n, true);
      if (!u) { u = createUnit(type, n, this.unitName(type, n)); u.pos.set(rand(-1500, 1500), 0, s * (MAP.carrierZ + 900)); u.yaw = facing(n); world.add(u); if (type === 'carrier') { world.carriers[n] = u; this.dressCarrier(u); } }
      u.ai = null;
      if (def.kind === 'sub') {
        const bc = world.units.find((x) => x.nation === n && x.type === 'battlecruiser' && x.alive);
        if (opts.dock && bc) { if (bc.docked && bc.docked !== u) { const o = bc.docked; o.undock(); o.undockT = 0; o.pos.z += s * 400; o.pos.x += 300; } if (!u.dockedTo) { u.depth = u.depthT = 0; u.dock(bc); } }
        else if (u.dockedTo) { u.undock(); u.undockT = 0; u.dockedTo = null; u.pos.x += 260; u.pos.z -= s * 250; u.throttle = 0; u.ctl.throttle = 0; u.speed = 4; }
      }
    } else if (def.kind === 'jet') {
      u = createUnit(type, n, this.unitName(type, n));
      if (cv && cv.alive) { const cat = cv.model.catapults.find((k) => this.spotFree(cv, k.pos, 'jet', 14)) || cv.model.catapults[0]; u.park(cv, cat.pos, cat.yaw); } // a catapult nobody is sitting on
      else { u.pos.set(0, 900, s * (MAP.carrierZ + 500)); u.quat.setFromAxisAngle(new V3(0, 1, 0), facing(n)); u.vel.set(0, 0, -s * def.cruise); u.state = 'fly'; u.throttle = 0.8; u.ctl.throttle = 0.8; }
      world.add(u);
    } else if (def.kind === 'heli') {
      u = createUnit(type, n, this.unitName(type, n));
      const pad = cv && cv.alive && (this.spotFree(cv, cv.model.helipads[1].pos, 'heli', 16) ? cv.model.helipads[1] : cv.model.helipads.find((k) => this.spotFree(cv, k.pos, 'heli', 16)));
      if (pad) u.place(cv, pad.pos, 0);
      else if (cv && cv.alive) { u.pos.copy(cv.pos); u.pos.y += 130; u.pos.x += 160; u.yaw = cv.yaw; u.state = 'fly'; u.rpm = 1; } // both pads taken: start in the hover alongside
      else { u.pos.set(0, 150, s * 3000); u.yaw = facing(n); u.state = 'fly'; u.rpm = 1; }
      world.add(u);
    } else {
      u = createUnit('marine', n);
      const sd = opts.sd && world.units.find((x) => x.type === 'superdestroyer' && x.nation === n && x.alive);
      if (sd) { const hp = sd.model.helipads[0].pos; u.placeOn(sd, new V3(hp.x + 4, hp.y, hp.z - 14)); u.look = sd.yaw; } // by the helipad, facing the hatch that leads below
      else if (cv && cv.alive) { const hp = cv.model.helipads[0].pos; u.placeOn(cv, new V3(hp.x - 9, hp.y, hp.z - 17)); u.look = cv.yaw + Math.PI * 0.85; } else { const p = world.pads[n === 'aethia' ? 0 : 1]; u.placeAt(p.x, world.terrain(p.x, p.z), p.z); }
      world.add(u);
    }
    this.spawning = false; this.dress(u, cosmetics.paintFor(n, type), cosmetics.outfit(n));
    u.isPlayer = true; u.invuln = world.t + 5; // spawn protection world.player = u;
    save.data.last = { nation: n, unit: type }; save.write();
    return u;
  },
  // hand a unit back to its crew (when the player moves to another unit)
  // Looks: paint a unit's model (once), or note a marine's outfit. The player's units wear what is equipped in the Hangar;
  // about one in six of the others wears something too, so the cosmetics are seen in action.
  dress(u, paint, outfit) {
    if (u.kind === 'soldier') { if (outfit && u.setOutfit) u.setOutfit(outfit); return; }
    if (paint && u.paint !== paint && !u.paint) { u.paint = paint; applyPaint(u.lod0, u.nation, paint); }
  },
  dressRandom(u) { if (Math.random() > 0.16) return; if (u.kind === 'soldier') this.dress(u, '', cosmetics.randomOutfit()); else this.dress(u, cosmetics.randomPaint(u.type)); },
  // is a deck spot (local point on `ship`) clear of other aircraft of that kind?
  spotFree(ship, local, kind, r) { const p = ship.toWorld(local, new V3()); return !world.units.some((o) => o.kind === kind && o.alive && o.pos.distanceTo(p) < r); },
  releasePlayer(u) { if (!u) return; u.isPlayer = false; if (u.alive && !u.ai) attachAI(u, new V3(rand(-800, 800), 0, -900)); if (world.player === u) world.player = null; },

  // ---- reinforcements + victory --------------------------------------------------------------------------------------------
  onKill(u) {
    if (!this.active) return;
    if (u.type === 'carrier') { this.finish(otherNation(u.nation)); return; }
    if (u.kind === 'soldier') { if (!u.isPlayer) this.respawns.push({ type: 'marine', nation: u.nation, t: world.t + rand(15, 30) }); return; }
    if (u.isPlayer && u.kind !== 'ship' && u.kind !== 'sub') return; // the player's own extra aircraft is not part of the roster
    if (u.type === 'superdestroyer') return;                          // one a side at most: a sunk one is not replaced
    this.respawns.push({ type: u.type, nation: u.nation, t: world.t + (u.type === 'battlecruiser' ? 150 : u.kind === 'ship' || u.kind === 'sub' ? rand(45, 70) : rand(22, 40)) });
  },
  finish(winner) {
    if (!this.active) return; this.active = false; this.endT = world.t + 9; world.over = winner; this.lastWinner = winner;
    const won = winner === world.playerNation; if (won) save.stats.battlesWon++; else save.stats.battlesLost++; save.write();
    world.onBattleEnd && world.onBattleEnd(won);
    audio.play(won ? 'win' : 'lose');
    world.say(`${NATIONS[otherNation(winner)].adj} carrier lost. ${NATIONS[winner].name} holds the sea.`, won ? 'win' : 'bad');
  },
  update(dt) {
    if (!this.active) { if (this.endT && world.t > this.endT) { this.endT = 0; this.onEnd && this.onEnd(world.over); } return; }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i]; if (world.t < r.t) continue; this.respawns.splice(i, 1);
      const n = r.nation, s = sgn(n), def = UNITS[r.type], cv = world.carriers[n];
      if (def.kind === 'ship' || def.kind === 'sub') {
        const u = createUnit(r.type, n, this.unitName(r.type, n)); u.pos.set(rand(-2500, 2500), 0, s * (MAP.half - 800)); u.yaw = facing(n); u.speed = u.def.speed * 0.6; u.throttle = 0.6;
        if (u.kind === 'sub') u.depth = u.depthT = 13;
        attachAI(u, new V3(rand(-1500, 1500), 0, rand(-1400, -600))); world.add(u);
        if (n === world.playerNation) world.say(`${u.label} joins the fleet`, 'info');
      } else if (def.kind === 'soldier') { if (cv && cv.alive) this.spawnMarine(n, 'deck'); }
      else if (cv && cv.alive) { const u = this.spawnAir(r.type, n, 0, 0, false); if (n === world.playerNation && u.kind === 'jet') world.say(`${u.label} launching from ${cv.name}`, 'info'); }
    }
  },
};
