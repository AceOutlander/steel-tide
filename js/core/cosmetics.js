// Cosmetics: looks only, bought with Credits, kept for good. This file is the catalogue and the rules for owning and
// wearing things; js/gfx/paint.js and the human model draw them. What is owned and equipped lives in the save through
// js/core/economy.js, per nation for the equipped set.
import { save } from './save.js';
import { econ, fmtCredits } from './economy.js';

export const TIERS = { free: { label: 'Standard issue', color: '#9aa7b0' }, standard: { label: 'Standard', color: '#b9c2c9' }, rare: { label: 'Rare', color: '#5aa9ff' }, epic: { label: 'Epic', color: '#b57bff' }, elite: { label: 'Elite', color: '#ffcf4a' } };
export const AIR = ['fighter', 'bomber', 'recon', 'transport', 'attackheli'];
export const PAINT_UNITS = ['patrol', 'corvette', 'battlecruiser', 'carrier', 'reconsub', 'attacksub', 'fighter', 'bomber', 'recon', 'transport', 'attackheli'];
export const SLOTS = { back: 'Back', chest: 'Chest', belt: 'Belt and hip', face: 'Face', neck: 'Neck', limbs: 'Arms and legs', detail: 'Small details' };
export const MAX_ACCESSORIES = 4;

const P = (id, name, tier, price, desc, air = false) => ({ id: 'paint.' + id, key: id, kind: 'paint', name, tier, price, desc, air });
const H = (id, name, uniform, tier, price, desc, udesc) => [{ id: 'helmet.' + id, key: id, kind: 'helmet', name, tier, price, desc, pair: 'uniform.' + id }, { id: 'uniform.' + id, key: id, kind: 'uniform', name: uniform, tier, price, desc: udesc, pair: 'helmet.' + id }];
const A = (id, slot, name, tier, price, desc) => ({ id: 'acc.' + id, key: id, kind: 'accessory', slot, name, tier, price, desc });

export const ITEMS = [
  P('battleworn', 'Battle-Worn', 'rare', 5000, 'Rust streaks, scorch marks and patched plating.'),
  P('sharkmouth', 'Shark-mouth', 'rare', 6000, 'Painted jaws and eyes on the nose. Jets and helicopters only.', true),
  P('ceremonial', 'Ceremonial White', 'epic', 12000, 'Gloss white, gold numbers, flags flying.'),
  P('stealthblack', 'Stealth Black', 'epic', 15000, 'Matte black with low-visibility grey markings.'),
  P('goldtrim', 'Gold Trim', 'elite', 30000, 'Nation colours with gold edging, gold turrets and insignia.'),
  ...H('standard', 'Standard Issue', 'Fleet fatigues', 'free', 0, 'Basic combat helmet.', 'The uniform every marine is issued.'),
  ...H('deckcrew', 'Deck Crew', 'Flight-deck jersey', 'standard', 2000, 'Padded cranial helmet with goggles.', 'Bright flight-deck jersey and float vest.'),
  ...H('arctic', 'Arctic Ops', 'Arctic parka', 'rare', 5000, 'Fur-lined helmet and balaclava.', 'White insulated parka and snow trousers.'),
  ...H('flight', 'Flight Helmet', 'Flight suit', 'rare', 6000, 'Tinted visor and oxygen hose.', 'Flight suit with harness and G-suit.'),
  ...H('tacops', 'Tac-Ops', 'Tac-Ops kit', 'epic', 12000, 'Cut-away helmet with night-vision mount, rails and headset.', 'Plate carrier, combat shirt, gloves and kneeboard.'),
  ...H('officer', 'Bridge Officer', 'Dress uniform', 'epic', 14000, "Peaked officer's cap.", 'Dress uniform with ribbons and sword belt.'),
  ...H('diver', 'Elite Diver', 'Drysuit', 'elite', 25000, 'Full-face dive helmet with lamp.', 'Drysuit, weight belt, fins carried on the back.'),
  ...H('heavy', 'Heavy Ballistic', 'Heavy armoured suit', 'elite', 30000, 'Full-coverage helmet with armoured visor and jaw guard.', 'Armoured suit with neck, groin and arm plates.'),
  A('tacpack', 'back', 'Tac-Pack', 'standard', 2000, 'Compact assault pack.'),
  A('parachute', 'back', 'Parachute', 'rare', 5000, 'Packed parachute and harness.'),
  A('oxygen', 'back', 'Oxygen Tank', 'rare', 5000, 'Single breathing cylinder.'),
  A('dualoxygen', 'back', 'Dual Oxygen Tank', 'epic', 10000, 'Twin breathing cylinders.'),
  A('magpouches', 'chest', 'Mag Pouches', 'standard', 1500, 'Triple magazine pouches.'),
  A('radio', 'chest', 'Radio', 'standard', 2500, 'Chest radio with a whip antenna.'),
  A('grenades', 'chest', 'Grenade Pouches', 'rare', 4000, 'Two grenade pouches.'),
  A('flaregun', 'belt', 'Flare Gun', 'rare', 4000, 'Holstered flare pistol.'),
  A('diveknife', 'belt', 'Dive Knife', 'rare', 4500, 'Sheathed dive knife.'),
  A('sidearm', 'belt', 'Sidearm Holster', 'rare', 5000, 'Holstered pistol.'),
  A('gasmask', 'face', 'Gas Mask', 'epic', 8000, 'Full-face respirator.'),
  A('binoculars', 'neck', 'Binoculars', 'standard', 2000, 'Slung around the neck.'),
  A('kneepads', 'limbs', 'Knee Pads', 'standard', 1500, 'Hard-shell knee pads.'),
  A('shoulderpads', 'limbs', 'Shoulder Pads', 'rare', 4000, 'Armoured shoulder caps.'),
  A('padset', 'limbs', 'Shoulder and Knee Pad Set', 'epic', 7000, 'Matching shoulder and knee armour.'),
  A('dogtags', 'detail', 'Dog Tags', 'standard', 1000, 'Tags on a chain.'),
  A('chemlights', 'detail', 'Chemlights and IR Strobe', 'rare', 3000, 'Light sticks and a strobe on the webbing.'),
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const cosmetics = {
  get owned() { return save.data.econ.owned; },
  owns(id) { const it = ITEM[id]; return !!it && (it.price === 0 || this.owned.includes(id)); },
  // the equipped set for a nation: { paint: { unitType: schemeKey }, helmet, uniform, acc: [keys] }
  set(nation) { const e = save.data.econ.equip; const s = e[nation] || (e[nation] = {}); s.paint = s.paint || {}; s.acc = s.acc || []; s.helmet = s.helmet || 'standard'; s.uniform = s.uniform || 'standard'; return s; },

  // Buying a helmet also unlocks its uniform (and the other way round). Returns { ok } or { ok: false, need }.
  buy(id) {
    const it = ITEM[id]; if (!it) return { ok: false };
    if (this.owns(id)) return { ok: true };
    if (econ.credits < it.price) return { ok: false, need: it.price - econ.credits };
    if (!econ.spend(it.price)) return { ok: false, need: it.price - econ.credits };
    this.owned.push(id); if (it.pair && !this.owned.includes(it.pair)) this.owned.push(it.pair);
    save.write(); return { ok: true };
  },
  paintFor(nation, unitType) { const k = this.set(nation).paint[unitType]; return k && this.owns('paint.' + k) ? k : ''; },
  isEquipped(nation, id, unitType) {
    const it = ITEM[id], s = this.set(nation); if (!it) return false;
    if (it.kind === 'paint') return s.paint[unitType] === it.key;
    if (it.kind === 'helmet') return s.helmet === it.key;
    if (it.kind === 'uniform') return s.uniform === it.key;
    return s.acc.includes(it.key);
  },
  // Equip (or take off). unitType: for paint, one unit type or 'all'. Returns { ok } or { ok: false, why }.
  toggle(nation, id, unitType) {
    const it = ITEM[id], s = this.set(nation); if (!it || !this.owns(id)) return { ok: false, why: 'Not owned yet.' };
    if (it.kind === 'paint') {
      const types = unitType === 'all' ? PAINT_UNITS : [unitType], on = types.every((t) => s.paint[t] === it.key || (it.air && !AIR.includes(t)));
      for (const t of types) { if (it.air && !AIR.includes(t)) continue; if (on) delete s.paint[t]; else s.paint[t] = it.key; }
    } else if (it.kind === 'helmet') s.helmet = s.helmet === it.key ? 'standard' : it.key;
    else if (it.kind === 'uniform') s.uniform = s.uniform === it.key ? 'standard' : it.key;
    else {
      const i = s.acc.indexOf(it.key);
      if (i >= 0) s.acc.splice(i, 1);
      else {
        const clash = s.acc.find((k) => ITEM['acc.' + k] && ITEM['acc.' + k].slot === it.slot);
        if (clash) return { ok: false, why: `The ${SLOTS[it.slot].toLowerCase()} slot already holds ${ITEM['acc.' + clash].name}. Unequip something first.` };
        if (s.acc.length >= MAX_ACCESSORIES) return { ok: false, why: `You can wear ${MAX_ACCESSORIES} accessories at once. Unequip something first.` };
        s.acc.push(it.key);
      }
    }
    save.write(); return { ok: true };
  },
  // what a marine of this nation should be built with (the player's set, or a preview set)
  outfit(nation, over = null) { const s = this.set(nation); return { helmet: (over && over.helmet) || s.helmet, uniform: (over && over.uniform) || s.uniform, acc: (over && over.acc) || s.acc.slice() }; },
  // something for a few of the other side's and our own units to wear, so the looks are seen in action
  randomPaint(unitType) { const pool = ITEMS.filter((i) => i.kind === 'paint' && (!i.air || AIR.includes(unitType))); return pool[Math.floor(Math.random() * pool.length)].key; },
  randomOutfit() { const hs = ITEMS.filter((i) => i.kind === 'helmet'), as = ITEMS.filter((i) => i.kind === 'accessory'), h = hs[Math.floor(Math.random() * hs.length)].key, acc = []; for (let k = 0; k < 2; k++) { const a = as[Math.floor(Math.random() * as.length)]; if (!acc.some((x) => ITEM['acc.' + x].slot === a.slot)) acc.push(a.key); } return { helmet: h, uniform: h, acc }; },
  priceText(it) { return it.price ? fmtCredits(it.price) : 'Free'; },
};
