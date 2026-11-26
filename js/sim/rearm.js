// Rearming. Jets, helicopters and submarines carry a fixed load; when it is gone they have to go back for more:
//   jets        trap on their own side's carrier (the recon plane, which has no weapons, refuels there)
//   helicopters land on a friendly ship that has a helipad (the carrier, anywhere on its deck, or a Super Destroyer)
//   submarines  reload their tubes from the torpedoes they carry; when those are gone they dock with a friendly ship
// The work takes time. While it runs the unit has `service = { t, total, host, label }` and stays where it is; when it
// ends the unit is fully loaded, and an aircraft is repaired too. Leaving early (lifting off, casting off) throws the
// work away. Ships do not rearm: their mounts have big magazines of their own (see Mount in weapons.js).
// Crews of both sides follow the same rules (js/sim/ai.js).
import { world } from '../world/world.js';
import { V3, clamp } from '../core/util.js';
import { crew } from './crew.js';

// seconds for the work, [nearly full, completely empty]
export const TIMES = { jet: [20, 40], heli: [15, 30], sub: [10, 30] };
const _l = new V3();

/** how much of its full load a unit is missing: 0 (full) to 1 (everything gone). Damage to an aircraft counts too. */
export function missing(u) {
  let have = 0, full = 0;
  if (u.fw) for (const k in u.fw) { const w = u.fw[k], f = w.def.ammo; if (f) { full++; have += clamp(w.ammo / f, 0, 1); } }
  if (u.isAir && u.mounts) for (const m of u.mounts) if (m.full !== Infinity) { full++; have += clamp(m.rounds() / m.full, 0, 1); }
  if (u.def.flares) { full += 0.5; have += 0.5 * clamp(u.flares / u.def.flares, 0, 1); }
  if (u.tubes) { const tb = u.tubes; full++; have += clamp((tb.ready + tb.stock) / (tb.def.tubes + tb.def.stock), 0, 1); }
  let miss = full ? 1 - have / full : 0;
  if (u.isAir && u.hp < u.maxHp) miss = Math.max(miss, 0.2 + 0.8 * (1 - u.hp / u.maxHp));
  return clamp(miss, 0, 1);
}

/** start the work if anything is missing. Returns the service, or null when the unit is already full. */
export function begin(u, host, label) {
  const m = missing(u); if (m < 0.01) return null;
  const [a, b] = TIMES[u.kind] || TIMES.heli;
  u.service = { t: 0, total: a + (b - a) * m, host, label };
  // the deck crew walk over to an aircraft and stand by it while they work
  if (u.isAir && host && host.crewList) { host.toLocal(u.pos, _l); crew.attend(host, _l.x, _l.z, Math.max(3.5, (u.dims.span || 10) * 0.42), u.service.total, u.kind === 'jet' ? 4 : 3); }
  return u.service;
}
/** advance the work. True on the step it finishes (the unit has just been reloaded). */
export function tick(u, dt) {
  const s = u.service; if (!s) return false;
  if (!s.host || !s.host.alive) { u.service = null; return false; }
  s.t += dt; if (s.t < s.total) return false;
  u.service = null; u.rearm(); return true;
}
export const left = (u) => (u.service ? Math.max(0, u.service.total - u.service.t) : 0);

/** the first thing this unit has run out of (a weapon key, or 'flares'), or null. For a submarine: tubes and store both empty. */
export function emptyKey(u) {
  if (u.tubes) return u.tubes.ready <= 0 && u.tubes.stock <= 0 ? 'torpedo' : null;
  if (u.fw) for (const k in u.fw) if (u.fw[k].def.ammo && u.fw[k].ammo <= 0) return k;
  if (u.isAir && u.mounts) for (const m of u.mounts) if (m.full !== Infinity && m.rounds() <= 0) return m.key;
  if (u.isAir && u.def.flares && u.flares <= 0) return 'flares';
  return null;
}

/** the nearest place this unit can rearm: { ship, pos (world, a new vector), d, busy } or null when there is none left.
 *  busy: a dock that holds another submarine which will cast off to make way (see makeWay). A free dock always wins. */
export function spot(u) {
  let best = null, bd = Infinity;
  const take = (ship, local, busy = false) => { const p = ship.toWorld(local, new V3()), d = Math.hypot(p.x - u.pos.x, p.z - u.pos.z) + (busy ? 1e6 : 0); if (d < bd) { bd = d; best = { ship, pos: p, d: d - (busy ? 1e6 : 0), busy }; } };
  if (u.kind === 'jet') { const cv = world.carriers[u.nation]; if (cv && cv.alive) take(cv, cv.model.landing.touch); return best; }
  for (const s of world.units) {
    if (!s.alive || s.kind !== 'ship' || s.nation !== u.nation) continue;
    if (u.kind === 'heli') { for (const h of s.model.helipads || []) take(s, h.pos); }
    else if (u.kind === 'sub') {
      const dk = s.model.dock; if (!dk || (dk.only && dk.only !== u.type)) continue;
      if (!s.docked || s.docked === u) take(s, dk.pos); else if (s.docked.ai && !s.isPlayer) take(s, dk.pos, true);   // a submarine with its own crew can cast off
    }
  }
  return best;
}
/** A submarine coming to a dock for torpedoes: a ship under its own crew slows right down so it can be caught, and a
 *  submarine sitting in that dock is asked to cast off (it does once its own restocking is done). */
export function makeWay(sp, u) {
  if (!sp || !u || u.kind !== 'sub') return;
  if (sp.d < 2500 && !sp.ship.isPlayer) sp.ship.slowFor = world.t + 3;
  if (sp.busy && sp.d < 1500 && sp.ship.docked) sp.ship.docked.makeWay = true;
}

const NOUN = { missile: 'missiles', bomb: 'bombs', gun: 'cannon rounds', torpedo: 'torpedoes' };
/** what to tell the player when something has run out (sp: the result of spot) */
export function outText(u, key, sp, defs) {
  const what = key === 'flares' ? 'flares' : NOUN[(defs[key] || {}).type] || 'ammunition';
  const where = u.kind === 'jet' ? (sp ? 'Land on the carrier to rearm' : 'There is no carrier left to rearm on')
    : u.kind === 'heli' ? (sp ? 'Land on a friendly helipad or the carrier deck to rearm' : 'There is no friendly helipad left to rearm on')
      : sp ? `Dock with ${sp.ship.def.label} ${sp.ship.name} to restock` + (sp.busy ? ' (the submarine in its dock will cast off as you come up astern)' : '') : 'There is no friendly dock left to restock at';
  return `Out of ${what}. ${where}`;
}
/** the line shown while the work goes on: a label, a progress bar and the seconds left */
export function serviceText(u) {
  const s = u.service; if (!s) return '';
  return `${s.label} <b class="bar"><i style="width:${Math.round((s.t / s.total) * 50) * 2}%"></i></b> ${Math.ceil(s.total - s.t)} s`;
}
