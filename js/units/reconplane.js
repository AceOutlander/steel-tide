// Recon Plane: twin-turboprop airborne radar picket with a big rotating dorsal radar disc. No weapons.
// Extras on userData.model: gearHeight, gear[], engines[2] (exhaust stubs), burners [] (turboprop: none), cockpit, pylons [],
// spinners: [rotodome {axis 'y', speed 0.8}, propeller x2 {axis 'z', speed 40, blades, disc}], view.
import * as THREE from 'three';
import { MAT } from '../gfx/materials.js';
import { PartBuilder, fuselage, wing } from './builders.js';
import { pair, fin, gearLeg, makeRotor, decal } from './fighter.js';

export function buildReconPlane(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const skin = MAT.aircraft[nation], dark = MAT.aircraftDark[nation];
  const prof = A
    ? [[-13, 0.04], [-12.1, 0.66], [-10, 1.25], [-6, 1.5], [5, 1.5], [10, 1.0], [13, 0.32]]
    : [[-12.7, 0.1], [-12.0, 0.85], [-10, 1.36], [-6, 1.56], [5, 1.56], [10, 1.08], [13, 0.4]];
  b.add(skin, fuselage(prof, lod ? 6 : 14, 1, 1.05));
  // high wing, nacelles
  pair(b, skin, () => wing(14.2, 4.2, 2.0, 0.8, 0.45, 0.16, 0.03), 0.8, 1.25, -3.5);
  for (const s of [-1, 1]) b.add(skin, fuselage(A ? [[-3.4, 0.24], [-3, 0.6], [-1, 0.76], [1.5, 0.7], [3.2, 0.28]] : [[-3.4, 0.3], [-3.1, 0.7], [-1, 0.84], [1.8, 0.8], [3.2, 0.4]], lod ? 6 : 10), s * 4.6, 0.72, -2.8);
  // tail
  if (A) {
    b.add(skin, fin(4.0, 4.2, 2.4, 2.4, 0.32, 0, 0.16), 0, 1.1, 8.2);
    pair(b, skin, () => wing(4.6, 2.6, 1.3, 1.2, 0.2, 0.08), 0, 5.1, 10.5);
  } else {
    b.add(skin, fin(2.6, 3.6, 1.9, 1.8, 0.3, 0, 0.16), 0, 1.2, 8.8);
    pair(b, skin, () => wing(5.2, 3.0, 2.0, 0.8, 0.24, 0.12, 0.1), 0.3, 1.2, 9.6);
    for (const s of [-1, 1]) { b.add(skin, fin(2.8, 2.6, 1.5, 1.2, 0.2, 0, 0.1), s * 5.45, 1.6, 10.3); b.add(skin, fin(1.0, 2.4, 1.6, 0.5, 0.2, Math.PI, 0.1), s * 5.45, 1.75, 10.4); }
  }
  // rotodome pylon (static)
  const domeY = 4.35, domeZ = 3;
  if (A) b.taper(skin, 0.7, 2.9, 3.6, 0.5, 2.2, 0, 2.85, domeZ, 0.3);
  else for (const [x, z] of [[-1.3, 1.6], [1.3, 1.6], [-1.3, 4.6], [1.3, 4.6]]) b.tube(dark, [x * 0.8, 1.3, z], [x * 0.35, domeY - 0.2, domeZ + (z - domeZ) * 0.4], 0.11, 6);
  const model = { dims: { length: 26, span: 30, height: 8 }, gearHeight: 2.9, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], view: { chase: 44, chaseH: 9 } };
  if (lod) {
    b.sphere(MAT.white, 1, 0, domeY, domeZ, [3.8, 0.42, 3.8], 8);
  } else {
    // rotodome (spins)
    const dome = new THREE.Group(), db = new PartBuilder(0); dome.position.set(0, domeY, domeZ);
    db.sphere(A ? MAT.white : skin, 1, 0, 0, 0, [3.8, 0.42, 3.8], 18);
    db.sphere(dark, 1, 0, 0, 0, [3.83, 0.435, 0.3], 14);
    db.cyl(dark, 3.82, 3.82, 0.1, 0, 0, 0, 'y', 28);
    db.cyl(MAT.gunmetal, 0.3, 0.4, 0.5, 0, -0.5, 0, 'y', 8);
    db.build(dome); g.add(dome); model.spinners.push({ node: dome, axis: 'y', speed: 0.8 });
    // cockpit glazing, cabin windows, nose radome, probes
    b.sphere(MAT.glass, 1, 0, 0.45, -10.9, [0.95, 0.75, 1.3], 12);
    b.box(dark, 0.06, 0.5, 1.3, 0, 1.0, -11.1, [0.5, 0, 0]);
    b.add(dark, fuselage(A ? [[-13.04, 0.03], [-12.1, 0.68], [-11.6, 0.83]] : [[-12.74, 0.09], [-12.0, 0.87], [-11.6, 0.99]], 14, 1, 1.05));
    b.tube(MAT.gunmetal, [0.5, -0.3, -12.2], [0.5, -0.3, -13.3], 0.025, 4);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) b.box(MAT.glass, 0.06, 0.34, 0.5, s * 1.5, 0.45, -5 + i * 1.9);
      b.box(dark, 0.07, 1.5, 0.9, s * 1.5, 0.05, -8.0); // crew door outline
      // propellers
      const prop = makeRotor(1.95, A ? 6 : 4, A ? 0.3 : 0.38, 'z', MAT.black, 0.2);
      prop.node.position.set(s * 4.6, 0.72, -6.3);
      const sp = new PartBuilder(0); sp.cone(A ? MAT.white : MAT.red, 0.3, 0.9, 0, 0, -0.35, 'z', 10); sp.build(prop.node);
      g.add(prop.node); model.spinners.push({ node: prop.node, axis: 'z', speed: 40 * s, blades: prop.blades, disc: prop.disc });
      // exhaust stubs, intake lips
      b.cyl(MAT.exhaust, 0.2, 0.22, 1.2, s * (4.6 + 0.72), 0.75, -0.6, 'z', 8); b.cyl(MAT.exhaust, 0.2, 0.22, 1.2, s * (4.6 - 0.72), 0.75, -0.6, 'z', 8);
      b.box(MAT.black, 0.5, 0.22, 0.1, s * 4.6, 0.12, -5.6);
      model.engines.push(new THREE.Vector3(s * 4.6, 0.75, 0.2));
      // de-icing boots, wingtip pods + lights, insignia
      b.box(MAT.black, 9.0, 0.1, 0.16, s * 9.6, 1.45, -2.95, [0, s * -0.056, s * 0.03]);
      b.add(dark, fuselage([[-1.1, 0.04], [-0.5, 0.2], [0.8, 0.2], [1.3, 0.04]], 8), s * 15.05, 1.68, -1.6);
      b.box(s < 0 ? MAT.red : MAT.white, 0.1, 0.1, 0.25, s * 15.2, 1.7, -2.5);
      g.add(decal(nation, 2.0, s * 10, 1.71, -1.2, 'up'));
      g.add(decal(nation, 1.3, s * 1.4, 0.1, 6.5, s > 0 ? 'right' : 'left'));
    }
    // antennas along the spine and belly
    for (const z of [-7, -4.5, 7.5]) b.box(dark, 0.05, 0.5, 0.6, 0, 1.8, z);
    b.box(dark, 0.05, 0.4, 0.8, 0, -1.75, -2); b.sphere(dark, 0.5, 0, -1.6, 2.5, [1, 0.5, 1.6], 10);
    if (A) b.add(dark, fuselage([[-1.2, 0.04], [-0.5, 0.22], [0.9, 0.22], [1.6, 0.04]], 8), 0, 5.22, 12);
    b.box(MAT.red, 0.1, 0.1, 0.2, 0, A ? 5.35 : 3.85, A ? 13.1 : 12.3);
    // landing gear: nose + mains retracting into the nacelles
    model.gear.push(gearLeg(0, -1.3, -9.6, 1.2, 0.4, true), gearLeg(-4.6, 0.1, -2.6, 2.4, 0.6, true), gearLeg(4.6, 0.1, -2.6, 2.4, 0.6, true));
    for (const leg of model.gear) g.add(leg);
    model.cockpit = new THREE.Vector3(0.5, 0.95, -11.0);
  }
  b.build(g);
  g.userData.model = model;
  return g;
}
