// Helicopters: tandem twin-rotor Transport and tandem-seat Attack helicopter.
// Extras on userData.model (both): gearHeight (fixed gear, gear: []), engines[], burners [], cockpit, pylons[], view,
//   spinners: rotor entries { node, axis, speed, blades, disc } (sim hides blades and shows the blur disc at speed).
// Transport: seats [Vector3 x8], door (ground-level boarding point behind the rear ramp).
// Attack: turrets [chin quad MG], pylons [4 stub-wing stations].
import * as THREE from 'three';
import { MAT } from '../gfx/materials.js';
import { PartBuilder, fuselage, wing, makeTurret } from './builders.js';
import { pair, fin, makeRotor, decal } from './fighter.js';

function staticRotor(b, r, x, y, z) { b.box(MAT.black, r * 2, 0.06, 0.5, x, y, z, [0, 0.5, 0]); b.box(MAT.black, r * 2, 0.06, 0.5, x, y, z, [0, 0.5 + Math.PI / 2, 0]); }

export function buildTransportHeli(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const skin = MAT.aircraft[nation], dark = MAT.aircraftDark[nation];
  b.add(skin, fuselage([[-8, 0.15], [-7.3, 0.9], [-6, 1.25], [5.5, 1.25], [7, 1.12], [8, 0.75]], lod ? 6 : A ? 8 : 12, 1.25, 1.15));
  // rotor pylons
  b.taper(skin, 1.6, 1.0, 3.4, 1.0, 2.0, 0, 1.9, -5.6, 0.2);
  b.taper(skin, 1.7, 2.2, 4.4, 1.1, 2.4, 0, 2.5, 6.0, 0.5);
  // side sponsons (fuel)
  for (const s of [-1, 1]) {
    if (A) b.add(skin, fuselage([[-5.2, 0.1], [-4.4, 0.42], [4.4, 0.42], [5.2, 0.1]], lod ? 5 : 8, 0.9, 1.05), s * 1.62, -0.95, 0);
    else b.box(skin, 0.75, 0.95, 10, s * 1.62, -0.95, 0);
  }
  const hubF = new THREE.Vector3(0, 2.62, -5.6), hubA = new THREE.Vector3(0, 3.82, 6.2);
  const model = { dims: { length: 16, span: 18, height: 5.9 }, gearHeight: 2.15, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], seats: [], view: { chase: 34, chaseH: 9 } };
  if (lod) { staticRotor(b, 9, hubF.x, hubF.y, hubF.z); staticRotor(b, 9, hubA.x, hubA.y, hubA.z); }
  else {
    // rotors (counter-rotating)
    for (const [hub, spd] of [[hubF, 28], [hubA, -28]]) {
      const r = makeRotor(9, 3, 0.78, 'y', MAT.black, 0.4); r.node.position.copy(hub);
      b.cyl(MAT.gunmetal, 0.16, 0.2, 0.5, hub.x, hub.y - 0.25, hub.z, 'y', 8);
      g.add(r.node); model.spinners.push({ node: r.node, axis: 'y', speed: spd, blades: r.blades, disc: r.disc });
    }
    // glazed nose, chin windows, cockpit frames
    b.sphere(MAT.glass, 1, 0, 0.3, -6.95, [1.27, 0.8, 1.05], 12);
    b.box(dark, 0.07, 1.3, 0.1, 0, 0.45, -7.85, [0.5, 0, 0]);
    b.box(dark, 2.3, 0.07, 0.1, 0, -0.1, -7.9);
    b.sphere(MAT.glass, 0.45, 0.6, -0.75, -7.2, [1, 0.7, 1], 8); b.sphere(MAT.glass, 0.45, -0.6, -0.75, -7.2, [1, 0.7, 1], 8);
    b.tube(MAT.gunmetal, [0.9, -0.5, -7.3], [0.9, -0.5, -8.6], 0.025, 4); b.tube(MAT.gunmetal, [-0.9, -0.5, -7.3], [-0.9, -0.5, -8.6], 0.025, 4);
    for (const s of [-1, 1]) {
      // engine pods on the aft pylon shoulders
      b.add(dark, fuselage([[-1.5, 0.2], [-1.2, 0.46], [0.9, 0.5], [1.4, 0.36]], 10), s * 1.38, 1.5, 5.4);
      b.cyl(MAT.black, 0.3, 0.3, 0.06, s * 1.38, 1.5, 3.88, 'z', 10);
      if (A) b.cyl(MAT.exhaust, 0.3, 0.34, 0.5, s * 1.38, 1.5, 6.95, 'z', 10);
      else { b.box(MAT.exhaust, 0.8, 0.8, 1.3, s * 1.5, 1.6, 7.2, [0, s * 0.3, 0]); b.box(dark, 0.06, 1.6, 2.6, s * 1.6, 0.2, -3.5); } // IR suppressor, cockpit armour plate
      model.engines.push(new THREE.Vector3(s * 1.38, 1.5, 7.3));
      // cabin windows, wheels, struts
      for (let i = 0; i < 4; i++) b.cyl(MAT.glass, 0.26, 0.26, 0.06, s * 1.555, 0.35, -3.6 + i * 2.2, 'x', 10);
      for (const z of [-4.6, 4.6]) {
        b.tube(MAT.steel, [s * 1.5, -1.25, z], [s * 1.72, -1.75, z], 0.07, 6);
        b.cyl(MAT.black, 0.4, 0.4, 0.3, s * 1.78, -1.75, z, 'x', 12); b.cyl(MAT.steel, 0.18, 0.18, 0.32, s * 1.78, -1.75, z, 'x', 8);
      }
      if (!A) b.add(skin, fuselage([[-1.8, 0.05], [-1.2, 0.4], [1.2, 0.4], [1.8, 0.05]], 8), s * 2.25, -1.0, 0.5); // external tank
      g.add(decal(nation, 1.2, s * 1.585, 0.2, 2.2 + 1.1, s > 0 ? 'right' : 'left'));
      // cabin seats
      for (const z of [-3.2, -1.2, 0.8, 2.8]) model.seats.push(new THREE.Vector3(s * 0.9, -0.55, z));
    }
    // starboard crew door, rear ramp (lowered) and cargo opening, antennas, tail light
    b.box(dark, 0.06, 1.7, 1.1, 1.57, -0.15, -4.4);
    b.box(MAT.black, 1.75, 1.6, 0.1, 0, -0.15, 7.98);
    b.box(skin, 1.9, 0.12, 2.7, 0, -1.72, 9.0, [0.31, 0, 0]);
    b.box(dark, 0.06, 0.45, 0.6, 0, 1.75, -1); b.tube(MAT.gunmetal, [0, 1.45, 0.5], [0, 2.3, 3.6], 0.015, 4);
    b.box(MAT.red, 0.1, 0.1, 0.15, 0, 3.75, 8.4);
    model.door = new THREE.Vector3(0, -2.15, 10.6);
    model.cockpit = new THREE.Vector3(0.55, 0.45, -6.6);
  }
  b.build(g);
  g.userData.model = model;
  return g;
}

export function buildAttackHeli(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const skin = MAT.aircraft[nation], dark = MAT.aircraftDark[nation];
  b.add(skin, fuselage([[-6.3, 0.08], [-5.6, 0.42], [-3.6, 0.78], [0, 0.86], [1.6, 0.74], [3.0, 0.36], [7.4, 0.16]], lod ? 5 : A ? 6 : 10, 0.95, 1.2));
  // transmission fairing, tail fin, stub wings
  b.taper(skin, 1.3, 0.75, 3.6, 0.9, 2.6, 0, 1.25, 0.3, 0.2);
  b.add(skin, fin(2.3, 1.6, 0.9, 1.0, 0.16, 0, 0.08), 0, 0.1, 5.9);
  pair(b, skin, () => wing(2.3, 1.3, 0.9, 0.3, 0.16, 0.1, -0.05), 0.7, -0.05, -0.7);
  const hub = new THREE.Vector3(0, 2.38, 0.2), tail = new THREE.Vector3(-0.34, 1.7, 7.1);
  const model = { dims: { length: 15, span: 14.6, height: 4.6 }, gearHeight: 2.1, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], view: { chase: 26, chaseH: 7 } };
  if (lod) { staticRotor(b, 7.3, hub.x, hub.y, hub.z); }
  else {
    // main + tail rotors
    const mr = makeRotor(7.3, 4, 0.5, 'y', MAT.black, 0.3); mr.node.position.copy(hub); g.add(mr.node);
    model.spinners.push({ node: mr.node, axis: 'y', speed: 30, blades: mr.blades, disc: mr.disc });
    const tr = makeRotor(1.4, 4, 0.24, 'x', MAT.black, 0.1); tr.node.position.copy(tail); g.add(tr.node);
    model.spinners.push({ node: tr.node, axis: 'x', speed: 90, blades: tr.blades, disc: tr.disc });
    b.cyl(MAT.gunmetal, 0.12, 0.16, 0.8, 0, 2.0, 0.2, 'y', 8); b.sphere(dark, 0.3, 0, 2.75, 0.2, [1, 0.6, 1], 10); // mast + mast-top sensor
    b.cyl(MAT.gunmetal, 0.07, 0.07, 0.3, -0.2, 1.7, 7.1, 'x', 6);
    // stepped tandem canopy with frames; crew
    if (A) {
      b.taper(MAT.canopy, 0.95, 0.75, 1.9, 0.62, 1.1, 0, 0.95, -3.9, 0.25);
      b.taper(MAT.canopy, 1.0, 0.85, 2.0, 0.66, 1.2, 0, 1.3, -2.1, 0.2);
    } else {
      b.taper(MAT.canopy, 1.0, 0.75, 1.9, 0.85, 1.4, 0, 0.95, -3.9, 0.1);
      b.taper(MAT.canopy, 1.05, 0.85, 2.0, 0.9, 1.5, 0, 1.3, -2.1, 0.1);
      for (const s of [-1, 1]) { b.box(dark, 0.05, 0.9, 0.08, s * 0.5, 0.95, -3.9); b.box(dark, 0.05, 1.0, 0.08, s * 0.52, 1.3, -2.1); b.box(dark, 0.07, 0.9, 1.8, s * 0.86, 0.2, -3.0); }
    }
    b.box(dark, 1.02, 0.9, 0.1, 0, 1.25, -3.02); b.box(dark, 1.05, 0.08, 0.1, 0, 1.72, -1.35);
    b.sphere(MAT.white, 0.15, 0, 1.0, -3.8); b.sphere(MAT.white, 0.15, 0, 1.4, -2.0);
    // nose sensor turret
    b.cyl(dark, 0.24, 0.24, 0.3, 0, -0.2, -5.95, 'z', 10); b.sphere(dark, 0.32, 0, -0.25, -6.25, null, 10); b.cyl(MAT.glass, 0.14, 0.14, 0.08, 0, -0.25, -6.56, 'z', 8);
    for (const s of [-1, 1]) {
      // engines + exhausts
      b.add(skin, fuselage([[-1.6, 0.2], [-1.3, 0.4], [1.0, 0.42], [1.5, 0.3]], 10), s * 1.0, 0.78, 0.8);
      b.cyl(MAT.black, 0.26, 0.26, 0.06, s * 1.0, 0.78, -0.82, 'z', 10);
      if (A) b.cyl(MAT.exhaust, 0.24, 0.3, 0.6, s * 1.0, 0.78, 2.5, 'z', 10);
      else b.box(MAT.exhaust, 0.5, 0.7, 1.4, s * 1.15, 0.85, 2.7, [0, s * 0.35, 0]);
      model.engines.push(new THREE.Vector3(s * 1.0, 0.78, 2.9));
      // weapon stations: inner rocket pod, outer four-missile rack
      b.box(dark, 0.08, 0.28, 0.7, s * 1.6, -0.3, -0.1); b.box(dark, 0.08, 0.28, 0.7, s * 2.6, -0.34, -0.05);
      b.cyl(dark, 0.26, 0.26, 1.9, s * 1.6, -0.68, -0.1, 'z', 10); b.cyl(MAT.black, 0.22, 0.22, 0.04, s * 1.6, -0.68, -1.06, 'z', 10);
      for (const [dx, dy] of [[-0.17, -0.5], [0.17, -0.5], [-0.17, -0.8], [0.17, -0.8]]) { b.cyl(MAT.white, 0.075, 0.075, 1.5, s * 2.6 + dx, dy, -0.1, 'z', 6); b.cone(MAT.black, 0.075, 0.25, s * 2.6 + dx, dy, -0.97, 'z', 6); }
      b.box(dark, 0.5, 0.06, 0.9, s * 2.6, -0.65, 0);
      b.box(s < 0 ? MAT.red : MAT.white, 0.08, 0.06, 0.2, s * 3.02, -0.14, -0.1);
      // main gear, tailplane, insignia on the fin
      b.tube(MAT.steel, [s * 0.6, -0.6, -2.4], [s * 1.15, -1.7, -2.3], 0.07, 6); b.tube(MAT.steel, [s * 0.6, -0.3, -1.5], [s * 1.12, -1.6, -2.25], 0.045, 5);
      b.cyl(MAT.black, 0.38, 0.38, 0.26, s * 1.28, -1.72, -2.3, 'x', 12); b.cyl(MAT.steel, 0.16, 0.16, 0.28, s * 1.28, -1.72, -2.3, 'x', 8);
      g.add(decal(nation, 0.7, s * 0.1, 1.1, 6.98, s > 0 ? 'right' : 'left'));
      if (!A) b.box(dark, 0.05, 0.7, 2.4, s * 0.83, -0.2, -1.4); // side armour
    }
    model.pylons.push(new THREE.Vector3(-2.6, -0.7, -0.9), new THREE.Vector3(-1.6, -0.7, -1.1), new THREE.Vector3(1.6, -0.7, -1.1), new THREE.Vector3(2.6, -0.7, -0.9));
    pair(b, skin, () => wing(1.5, 0.9, 0.6, 0.3, 0.08, 0.04), 0.1, 0.15, 6.6);
    // tail wheel, wire cutter, antennas
    b.tube(MAT.steel, [0, -0.15, 6.2], [0, -1.8, 6.5], 0.06, 6); b.cyl(MAT.black, 0.22, 0.22, 0.16, 0, -1.88, 6.5, 'x', 10);
    b.box(dark, 0.04, 0.5, 0.3, 0, 1.85, -1.2, [0.5, 0, 0]); b.box(dark, 0.04, 0.4, 0.5, 0, 0.5, 4.4);
    b.box(MAT.red, 0.08, 0.08, 0.12, 0, 2.45, 7.6);
    // chin gun
    const chin = makeTurret('chin', nation); chin.node.position.set(0, -0.95, -3.6); chin.rest = 0; chin.arc = 1.9; g.add(chin.node); model.turrets.push(chin);
    model.cockpit = new THREE.Vector3(0, 1.45, -2.25);
  }
  b.build(g);
  g.userData.model = model;
  return g;
}
