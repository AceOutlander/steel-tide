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

export const BUILDERS = {
  patrol: buildPatrolBoat, corvette: buildCorvette, battlecruiser: buildBattlecruiser, carrier: buildCarrier,
  reconsub: buildReconSub, attacksub: buildAttackSub, fighter: buildFighter, bomber: buildBomber, recon: buildReconPlane,
  transport: buildTransportHeli, attackheli: buildAttackHeli,
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
