// Heavy Bomber: swing-wing strike aircraft, four engines in two underwing nacelles, bombs only.
// Extras on userData.model: gearHeight, gear[], engines[4], burners[4], cockpit, pylons[], bay (bomb release point),
// swing [leftWingGroup, rightWingGroup] with swingSign [1, -1]: set swing[i].rotation.y = swingSign[i] * sweep
// (sweep 0 = spread, up to 0.85 rad = fully swept back), view.
import * as THREE from 'three';
import { MAT } from '../gfx/materials.js';
import { PartBuilder, fuselage, wing } from './builders.js';
import { mirrorX, pair, fin, gearLeg, burnerCone, decal } from './fighter.js';

export function buildBomber(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const skin = MAT.aircraft[nation], dark = MAT.aircraftDark[nation];
  const prof = A
    ? [[-22, 0.04], [-20.6, 0.62], [-18, 1.25], [-14, 1.72], [-8, 1.98], [4, 2.0], [12, 1.7], [18, 1.1], [22, 0.32]]
    : [[-21.6, 0.1], [-20.6, 0.85], [-18, 1.5], [-14, 1.9], [-8, 2.08], [4, 2.1], [12, 1.82], [18, 1.2], [22, 0.4]];
  b.add(skin, fuselage(prof, lod ? 6 : 14, A ? 1.15 : 1.08, A ? 0.92 : 1.0));
  // fixed wing glove blending the fuselage into the wing pivots
  pair(b, skin, () => wing(4.6, 16, 4.2, 11, 0.7, 0.4), 1.5, -0.25, -13.5);
  // swing wings (outer panels). Pivot on the glove at (+-5.2, -0.05, -0.5).
  const PX = 5.2, PZ = -0.5;
  const panel = () => { const w = wing(15.3, 5.2, 2.0, 2.6, 0.5, 0.14, 0.02); w.translate(0, 0, -2.3); return w; };
  // tail: single tall fin with a mid-set tailplane
  b.add(skin, fin(5.9, 8.2, 3.0, 6.0, 0.5, 0, 0.2), 0, 1.5, 10.6);
  pair(b, skin, () => wing(6.4, 4.6, 1.6, 3.7, 0.26, 0.1), 0.2, 3.3, 14.6);
  // engine nacelles
  for (const s of [-1, 1]) {
    if (A) b.taper(skin, 3.5, 1.7, 9.4, 3.1, 8.6, s * 4.2, -1.95, 6.3, 0.2);
    else b.box(skin, 3.7, 1.9, 9.6, s * 4.2, -2.0, 6.3);
  }
  const model = { dims: { length: 44, span: 41, height: 10 }, gearHeight: 3.7, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], swing: [], swingSign: [1, -1], view: { chase: 62, chaseH: 12 } };
  if (lod) {
    for (const s of [-1, 1]) { const w = s > 0 ? panel() : mirrorX(panel()); w.rotateY(-s * 0.35); b.add(skin, w, s * PX, -0.05, PZ); }
  } else {
    for (const s of [-1, 1]) {
      const grp = new THREE.Group(), wb = new PartBuilder(0); grp.position.set(s * PX, -0.05, PZ);
      wb.add(skin, s > 0 ? panel() : mirrorX(panel()));
      wb.box(dark, 0.6, 0.12, 0.5, s * 15.1, 0.3, 1.3); // tip fairing
      wb.box(s < 0 ? MAT.red : MAT.white, 0.12, 0.06, 0.4, s * 15.35, 0.3, 0.7);
      wb.build(grp);
      grp.add(decal(nation, 2.6, s * 9.5, 0.37, 0.9, 'up'));
      g.add(grp); model.swing[s > 0 ? 1 : 0] = grp;
      // pivot fairing on the glove
      b.cyl(skin, 1.5, 1.7, 0.8, s * PX, -0.05, PZ, 'y', 14);
      // nacelle intakes, nozzles, burners
      for (const e of [-0.85, 0.85]) {
        const ex = s * 4.2 + e;
        b.box(MAT.black, A ? 1.35 : 1.5, A ? 1.25 : 1.5, 0.1, ex, -1.98, A ? 1.63 : 1.53);
        b.cyl(MAT.exhaust, 0.6, 0.76, 1.8, ex, -1.95, 11.6, 'z', 12); b.cyl(MAT.black, 0.52, 0.52, 0.06, ex, -1.95, 12.52, 'z', 12);
        const p = new THREE.Vector3(ex, -1.95, 12.55); model.engines.push(p);
        const bc = burnerCone(p, 0.55, 7); g.add(bc); model.burners.push(bc);
      }
      b.box(dark, 0.08, A ? 1.5 : 1.9, 1.6, s * 4.2, -1.98, 1.9); // intake splitter
      if (!A) { b.box(dark, 3.9, 0.12, 2.2, s * 4.2, -1.0, 2.6); b.add(skin, fin(1.4, 3.6, 1.6, 1.8, 0.14, s * (Math.PI - 0.3)), s * 1.3, -1.6, 15); } // intake ramp plate, ventral strakes
      // fuselage insignia, cockpit side glazing
      g.add(decal(nation, 1.6, s * (1.98 * (A ? 1.15 : 1.08) + 0.06), 0.1, -9.5, s > 0 ? 'right' : 'left'));
      b.box(MAT.glass, 0.08, 0.5, 1.5, s * (A ? 1.2 : 1.3), 1.0, -16.6, [0, s * 0.16, s * 0.5]);
    }
    // windscreen, crew hatch lines, nose probe / radome
    b.box(MAT.glass, 1.7, 0.08, 1.7, 0, 1.28, -17.3, [0.42, 0, 0]);
    b.box(dark, 0.07, 0.1, 1.75, 0, 1.32, -17.3, [0.42, 0, 0]);
    b.add(dark, fuselage(A ? [[-22.05, 0.03], [-20.6, 0.64], [-19.6, 0.9]] : [[-21.65, 0.09], [-20.6, 0.87], [-19.8, 1.08]], 14, A ? 1.15 : 1.08, A ? 0.92 : 1.0));
    b.tube(MAT.gunmetal, [0, 0, -22], [0, 0, -23.2], 0.04, 5, 0.015);
    // dorsal spine, antennas, bomb-bay door seams, fin-top fairing
    b.box(skin, A ? 0.7 : 1.1, 0.5, 20, 0, A ? 1.75 : 2.0, 2);
    b.box(dark, 0.05, 0.45, 0.7, 0, A ? 2.2 : 2.45, -6); b.box(dark, 0.05, 0.45, 0.7, 0, A ? 2.2 : 2.45, 3);
    for (const z of [-9, -3, 3]) b.box(MAT.black, 2.2, 0.03, 0.05, 0, -(A ? 1.84 : 2.1), z);
    for (const s of [-1, 1]) b.box(MAT.black, 0.04, 0.03, 12, s * 0.9, -(A ? 1.8 : 2.06), -3);
    b.add(dark, fuselage([[-1.6, 0.05], [-0.8, 0.3], [0.8, 0.3], [1.8, 0.05]], 8), 0, 7.45, 18.2);
    b.box(MAT.red, 0.12, 0.12, 0.2, 0, 7.6, 20.0);
    // landing gear: nose leg + two twin-wheel main bogies
    model.gear.push(gearLeg(0, -1.7, -14, 1.5, 0.5, true), gearLeg(-2.2, -1.8, 3, 1.3, 0.6, true), gearLeg(2.2, -1.8, 3, 1.3, 0.6, true));
    for (const leg of model.gear) g.add(leg);
    model.bay = new THREE.Vector3(0, -2.3, -3);
    model.pylons.push(new THREE.Vector3(0, -2.3, -7), new THREE.Vector3(0, -2.3, -3), new THREE.Vector3(0, -2.3, 1));
    model.cockpit = new THREE.Vector3(0.55, 1.2, -17.2);
  }
  b.build(g);
  g.userData.model = model;
  return g;
}
