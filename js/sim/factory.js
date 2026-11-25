// Creates any unit by type.
import { Ship, Sub } from './unit.js';
import { Jet } from './jet.js';
import { Heli } from './heli.js';
import { Soldier } from './soldier.js';
import { buildPatrolBoat } from '../units/patrolboat.js';
import { buildCorvette } from '../units/corvette.js';
import { buildBattlecruiser } from '../units/battlecruiser.js';
import { buildCarrier } from '../units/carrier.js';
import { buildReconSub, buildAttackSub } from '../units/submarines.js';
import { buildFighter } from '../units/fighter.js';
import { buildBomber } from '../units/bomber.js';
import { buildReconPlane } from '../units/reconplane.js';
import { buildTransportHeli, buildAttackHeli } from '../units/helicopters.js';

// Work in progress lives in js/units/v2/ and is only loaded when the address has ?v2, so unfinished models can never
// break the game. js/units/v2/index.js may export any of the builder names below; missing ones fall back to the current model.
let V2 = {};
if (/[?&]v2/.test(location.search)) { try { V2 = await import('../units/v2/index.js'); } catch (e) { console.warn('v2 models not loaded: ' + e.message); } }

export const BUILDERS = {
  patrol: V2.buildPatrolBoat || buildPatrolBoat, corvette: V2.buildCorvette || buildCorvette, battlecruiser: V2.buildBattlecruiser || buildBattlecruiser, carrier: V2.buildCarrier || buildCarrier,
  reconsub: V2.buildReconSub || buildReconSub, attacksub: V2.buildAttackSub || buildAttackSub, fighter: V2.buildFighter || buildFighter, bomber: V2.buildBomber || buildBomber, recon: V2.buildReconPlane || buildReconPlane,
  transport: V2.buildTransportHeli || buildTransportHeli, attackheli: V2.buildAttackHeli || buildAttackHeli,
};

export function createUnit(type, nation, name = '') {
  switch (type) {
    case 'patrol': case 'corvette': case 'battlecruiser': case 'carrier': return new Ship(type, nation, name, BUILDERS[type]);
    case 'reconsub': case 'attacksub': return new Sub(type, nation, name, BUILDERS[type]);
    case 'fighter': case 'bomber': case 'recon': return new Jet(type, nation, name, BUILDERS[type]);
    case 'transport': case 'attackheli': return new Heli(type, nation, name, BUILDERS[type]);
    case 'marine': return new Soldier(nation, name);
    default: throw new Error('unknown unit ' + type);
  }
}
