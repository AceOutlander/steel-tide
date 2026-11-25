// Game data: nations, unit classes, weapons. Both nations share identical stats; only looks and names differ.
import { KTS } from './util.js';

export const VERSION = 'Beta 0.1.0';
export const MAP = { half: 9000, carrierZ: 6000 };

export const NATIONS = {
  aethia: {
    key: 'aethia', name: 'Aethia', adj: 'Aethian', color: '#5aa9ff', dark: '#1d4f8f',
    blurb: 'Haze-grey hulls, clean angular stealth lines, and the blue and white roundel. Ships and aircraft carry bird names.',
    shipNames: ['Tern', 'Plover', 'Avocet', 'Sandpiper', 'Lanner', 'Merganser', 'Wheatear', 'Dunlin', 'Godwit', 'Redstart', 'Pipit', 'Whimbrel', 'Lapwing', 'Siskin', 'Brambling', 'Firecrest'],
    capital: { battlecruiser: 'Shearwater', carrier: 'Lammergeier' },
    classes: {
      patrol: 'Tern-class PV-21', corvette: 'Lanner-class KV-30', battlecruiser: 'Shearwater-class BC-7', carrier: 'Lammergeier-class AC-1',
      reconsub: 'Dipper-class SR-4', attacksub: 'Murre-class SA-9', fighter: 'AF-31 Saker', bomber: 'AB-8 Bateleur', recon: 'AR-5 Curlew',
      transport: 'AT-2 Shoebill', attackheli: 'AG-6 Shikra', marine: 'Aethian Marine',
    },
  },
  extro: {
    key: 'extro', name: 'Extro', adj: 'Extro', color: '#ff6a3d', dark: '#8f2f17',
    blurb: 'Charcoal and sea-green hulls, heavy rugged lines, and the red and orange chevron. Ships and aircraft carry storm names.',
    shipNames: ['Squall', 'Gale', 'Whiteout', 'Thunderclap', 'Downpour', 'Sleet', 'Riptide', 'Headwind', 'Blackfrost', 'Hailstone', 'Cloudburst', 'Crosswind', 'Williwaw', 'Stormglass', 'Surge', 'Northerly'],
    capital: { battlecruiser: 'Maelstrom', carrier: 'Monsoon' },
    classes: {
      patrol: 'Gust-class P-110', corvette: 'Squall-class K-220', battlecruiser: 'Maelstrom-class B-900', carrier: 'Monsoon-class C-1000',
      reconsub: 'Haboob-class S-40', attacksub: 'Derecho-class S-70', fighter: 'XF-50 Thunderhead', bomber: 'XB-90 Supercell', recon: 'XR-20 Stormwatch',
      transport: 'XT-14 Downdraft', attackheli: 'XG-33 Dust Devil', marine: 'Extro Marine',
    },
  },
};
export const otherNation = (n) => (n === 'aethia' ? 'extro' : 'aethia');

// kind: ship | sub | jet | heli | soldier.   armor: 0 unarmoured .. 3 capital
export const UNITS = {
  patrol: { key: 'patrol', label: 'Patrol Boat', cat: 'Surface', kind: 'ship', role: 'Fast inshore patrol and harassment', crew: 20, speed: 44 * KTS, accelT: 5, turn: 0.42, hp: 420, armor: 0, radar: 6000, sig: 0.6, weapons: ['mg'], score: 1,
    blurb: 'Light and quick. One crew-served machine gun on the foredeck.' },
  corvette: { key: 'corvette', label: 'Corvette', cat: 'Surface', kind: 'ship', role: 'Escort and surface gunnery', crew: 100, speed: 31 * KTS, accelT: 11, turn: 0.2, hp: 2200, armor: 1, radar: 9000, sig: 1, weapons: ['deckgun', 'mg'], score: 3,
    blurb: 'A twin-barrel deck gun turret and a machine gun mount on a nimble escort hull.' },
  battlecruiser: { key: 'battlecruiser', label: 'Battlecruiser', cat: 'Surface', kind: 'ship', role: 'Heavy gunnery, fleet air defence, submarine tender', crew: 1000, speed: 30 * KTS, accelT: 24, turn: 0.095, hp: 11000, armor: 3, radar: 12000, sig: 1.6, weapons: ['heavy', 'ciws', 'sam', 'mg'], score: 8,
    blurb: 'Four triple heavy turrets, close-in AA guns, a SAM launcher, eight machine gun turrets and a stern submarine dock.' },
  carrier: { key: 'carrier', label: 'Aircraft Carrier', cat: 'Surface', kind: 'ship', role: 'Fleet flagship and floating airfield', crew: 800, speed: 29 * KTS, accelT: 32, turn: 0.07, hp: 22000, armor: 2, radar: 14000, sig: 2, weapons: ['ciws', 'sam', 'mg'], score: 20,
    blurb: 'The heart of the fleet: ten jets, two helicopters, AA guns and SAM launchers. Lose it and the battle is lost.' },
  reconsub: { key: 'reconsub', label: 'Recon Sub', cat: 'Subsurface', kind: 'sub', role: 'Covert scouting and sonar picket', crew: 22, speed: 26 * KTS, accelT: 8, turn: 0.26, hp: 520, armor: 0, radar: 3000, sonar: 7000, sig: 0.25, quiet: 0.45, weapons: [], score: 3,
    blurb: 'Small, quick and very quiet. Periscope and long-range sonar, no weapons: what it finds, the whole fleet sees.' },
  attacksub: { key: 'attacksub', label: 'Attack Sub', cat: 'Subsurface', kind: 'sub', role: 'Hunter: torpedo attack', crew: 55, speed: 22 * KTS, accelT: 11, turn: 0.2, hp: 950, armor: 1, radar: 3000, sonar: 5500, sig: 0.3, quiet: 0.7, weapons: ['torpedo'], score: 5,
    blurb: 'Bow torpedo tubes, periscope and sonar. Stalk from below and break ships in half.' },
  fighter: { key: 'fighter', label: 'Stealth Fighter', cat: 'Air', kind: 'jet', role: 'Air superiority', crew: 1, speed: 420, cruise: 250, stall: 62, hp: 110, armor: 0, radar: 11000, sig: 0.45, gLimit: 9, rollRate: 3.2, pitchRate: 1.25, thrust: 16, abThrust: 30, drag: 0.00021, weapons: ['cannon', 'aam_ir', 'aam_rad'], flares: 12, score: 4,
    blurb: 'A cannon, short-range heat-seekers and medium-range radar missiles in a low-observable airframe.' },
  bomber: { key: 'bomber', label: 'Heavy Bomber', cat: 'Air', kind: 'jet', role: 'Strike: free-fall bombs, radar cloak', crew: 4, speed: 330, cruise: 230, stall: 74, hp: 260, armor: 0, radar: 8000, sig: 1.3, gLimit: 4, rollRate: 1.3, pitchRate: 0.6, thrust: 11, abThrust: 20, drag: 0.00019, weapons: ['bomb'], flares: 16, cloak: { time: 22, cooldown: 40 }, score: 6,
    blurb: 'Swing-wing heavy bomber. Bombs only, plus a time-limited radar cloak. Fly low and turn hard to shake SAM locks.' },
  recon: { key: 'recon', label: 'Recon Plane', cat: 'Air', kind: 'jet', role: 'Airborne radar picket', crew: 6, speed: 240, cruise: 180, stall: 55, hp: 150, armor: 0, radar: 26000, sig: 1.5, gLimit: 3.5, rollRate: 1.2, pitchRate: 0.55, thrust: 9, abThrust: 12, drag: 0.00024, weapons: [], flares: 14, score: 4,
    blurb: 'Very long radar range. Everything it sees appears on the radar of its whole side. No weapons.' },
  transport: { key: 'transport', label: 'Transport Helicopter', cat: 'Air', kind: 'heli', role: 'Marine assault lift', crew: 3, speed: 78, hp: 240, armor: 0, radar: 5000, sig: 1.1, seats: 8, weapons: [], flares: 10, score: 3,
    blurb: 'Twin-rotor heavy lift. Carries marines to helipads, decks and islands.' },
  attackheli: { key: 'attackheli', label: 'Attack Helicopter', cat: 'Air', kind: 'heli', role: 'Gunship: missiles and chin gun', crew: 2, speed: 86, hp: 190, armor: 0, radar: 7000, sig: 0.9, seats: 0, weapons: ['chin', 'agm'], flares: 10, score: 4,
    blurb: 'Guided missiles and a quad-barrel chin machine gun. Deadly against boats and corvettes.' },
  marine: { key: 'marine', label: 'Marine', cat: 'On Foot', kind: 'soldier', role: 'Infantry', crew: 1, speed: 6.2, hp: 100, armor: 0, radar: 1500, sig: 0.05, weapons: ['rifle'], score: 1,
    blurb: 'On foot with a rifle. Walk the decks, man a gun mount, board a helicopter and take the fight to the islands.' },
};
export const UNIT_ORDER = ['patrol', 'corvette', 'battlecruiser', 'carrier', 'reconsub', 'attacksub', 'fighter', 'bomber', 'recon', 'transport', 'attackheli', 'marine'];

// pen: armour class the round defeats at full damage; below that damage falls off sharply.
export const WEAPONS = {
  mg: { key: 'mg', name: '12.7 mm machine gun', type: 'gun', rof: 10, speed: 880, dmg: 7, pen: 0, range: 2000, spread: 0.005, sound: 'mg', tracer: 1, life: 2.6, heat: true },
  rifle: { key: 'rifle', name: 'Assault rifle', type: 'gun', rof: 9, speed: 800, dmg: 16, pen: 0, range: 600, spread: 0.004, sound: 'rifle', tracer: 0.5, life: 1.2, mag: 30, reload: 2.2 },
  chin: { key: 'chin', name: 'Quad chin machine gun', type: 'gun', rof: 24, speed: 900, dmg: 7, pen: 0, range: 2200, spread: 0.008, sound: 'mg', tracer: 1, life: 2.6 },
  cannon: { key: 'cannon', name: '20 mm cannon', type: 'gun', rof: 30, speed: 1050, dmg: 9, pen: 0, range: 1800, spread: 0.004, sound: 'cannon20', tracer: 1, life: 2.0, ammo: 480 },
  ciws: { key: 'ciws', name: 'Close-in AA gun', type: 'gun', rof: 28, speed: 1100, dmg: 5, pen: 0, range: 2600, spread: 0.007, sound: 'ciws', tracer: 1, life: 2.6, aa: true },
  deckgun: { key: 'deckgun', name: '76 mm twin deck gun', type: 'shell', rof: 1.6, speed: 760, dmg: 95, pen: 1, splash: 9, range: 9000, aiRange: 5000, spread: 0.004, sound: 'deckgun', life: 16 },
  heavy: { key: 'heavy', name: '380 mm triple turret', type: 'shell', rof: 0.13, speed: 620, dmg: 560, pen: 3, splash: 28, range: 15000, aiRange: 5600, spread: 0.0065, sound: 'heavygun', life: 30, salvo: 3 },
  sam: { key: 'sam', name: 'Surface-to-air missile', type: 'missile', seeker: 'radar', speed: 720, accel: 260, turnG: 28, dmg: 130, range: 9500, reload: 5, life: 16, sound: 'sam', lockTime: 1.6 },
  aam_ir: { key: 'aam_ir', name: 'Short-range heat-seeker', type: 'missile', seeker: 'ir', speed: 760, accel: 300, turnG: 34, dmg: 90, range: 4500, reload: 1.0, life: 9, ammo: 4, sound: 'missile', lockTime: 1.0, cone: 0.42 },
  aam_rad: { key: 'aam_rad', name: 'Medium-range radar missile', type: 'missile', seeker: 'radar', speed: 900, accel: 300, turnG: 24, dmg: 120, range: 11000, reload: 1.5, life: 16, ammo: 4, sound: 'missile', lockTime: 2.2, cone: 0.3 },
  agm: { key: 'agm', name: 'Guided attack missile', type: 'missile', seeker: 'surface', speed: 380, accel: 160, turnG: 12, dmg: 300, pen: 2, splash: 10, range: 6000, reload: 1.4, life: 20, ammo: 8, sound: 'missile', lockTime: 1.2, cone: 0.35 },
  bomb: { key: 'bomb', name: '900 kg bomb', type: 'bomb', dmg: 700, pen: 3, splash: 38, reload: 0.28, ammo: 24, sound: 'bombdrop' },
  torpedo: { key: 'torpedo', name: 'Heavy torpedo', type: 'torpedo', speed: 27, dmg: 1700, pen: 3, splash: 25, range: 7000, reload: 9, tubes: 4, life: 260, sound: 'torpedo' },
};

export const QUALITY = {
  fast: { label: 'Fast', shadows: 0, post: false, tex: 256, aniso: 1, prCap: 0.8, ocean: 44, view: 7500, fog: 2.0, particles: 0.35, crew: 0.3, lod: 0.45, wakes: 4, simpleWater: true, clouds: false },
  low: { label: 'Low', shadows: 0, post: false, tex: 512, aniso: 2, prCap: 1, ocean: 80, view: 13000, fog: 1.25, particles: 0.6, crew: 0.5, lod: 0.75, wakes: 8, simpleWater: false, clouds: true },
  medium: { label: 'Medium', shadows: 1024, post: false, tex: 1024, aniso: 4, prCap: 1.25, ocean: 112, view: 18000, fog: 1, particles: 0.85, crew: 0.8, lod: 1, wakes: 12, simpleWater: false, clouds: true },
  high: { label: 'High', shadows: 2048, post: true, tex: 1024, aniso: 8, prCap: 1.5, ocean: 128, view: 22000, fog: 1, particles: 1, crew: 1, lod: 1.3, wakes: 16, simpleWater: false, clouds: true },
  ultra: { label: 'Ultra', shadows: 4096, post: true, tex: 2048, aniso: 16, prCap: 2, ocean: 160, view: 24000, fog: 0.9, particles: 1.4, crew: 1.3, lod: 1.8, wakes: 16, simpleWater: false, clouds: true },
};

export const DEFAULT_KEYS = {
  throttleUp: ['KeyW'], throttleDown: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  rise: ['KeyR', 'Space'], dive: ['KeyF', 'ControlLeft'], periscope: ['KeyP'], ping: ['KeyQ'],
  afterburner: ['ShiftLeft', 'ShiftRight'], gear: ['KeyG'], flares: ['KeyX'], cloak: ['KeyC'],
  run: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'], jump: ['Space'],
  use: ['KeyE'], camera: ['KeyV'], map: ['Tab'], pause: ['Escape'], takeControls: ['KeyT'], launchSub: ['KeyU'], reload: ['KeyR'],
  pitchDown: ['ArrowUp'], pitchUp: ['ArrowDown'], rollLeft: ['ArrowLeft'], rollRight: ['ArrowRight'],
  weapon1: ['Digit1'], weapon2: ['Digit2'], weapon3: ['Digit3'], weapon4: ['Digit4'],
};
export const KEY_LABELS = {
  throttleUp: 'Throttle up / forward / collective up', throttleDown: 'Throttle down / back / collective down', left: 'Steer or rudder left / strafe left', right: 'Steer or rudder right / strafe right',
  rise: 'Submarine: rise', dive: 'Submarine: dive', periscope: 'Submarine: periscope', ping: 'Submarine: active sonar ping',
  afterburner: 'Jet: afterburner', gear: 'Jet: landing gear', flares: 'Aircraft: flares and chaff', cloak: 'Bomber: cloak',
  run: 'Marine: run', crouch: 'Marine: crouch', jump: 'Marine: jump', use: 'Get in or out / take a gun', camera: 'Change camera', map: 'Score and map', pause: 'Pause',
  takeControls: 'Helicopter passenger: take the controls', launchSub: 'Battlecruiser: board and launch the docked sub', reload: 'Marine: reload',
  pitchDown: 'Aircraft: nose down', pitchUp: 'Aircraft: nose up', rollLeft: 'Aircraft: roll left', rollRight: 'Aircraft: roll right',
  weapon1: 'Weapon 1', weapon2: 'Weapon 2', weapon3: 'Weapon 3', weapon4: 'Weapon 4',
};
