// Patrol Boat: light, fast, one crew-served machine gun on the foredeck. Reference example for every other unit module.
import * as THREE from 'three';
import { MAT, hullNumberMaterial } from '../gfx/materials.js';
import { PartBuilder, hullGeo, makeTurret, makeRadar, sideDecal, deckDecal } from './builders.js';

export function buildPatrolBoat(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const L = 34, B = 7.4, draft = 1.7, fb = 2.5;
  const hull = hullGeo({ L, B, draft, freeboard: fb, sheer: 1.1, bowLen: 0.42, sternW: 0.86, flare: A ? 0.5 : 0.25, full: A ? 0.32 : 0.42, stations: lod ? 10 : 26, rings: lod ? 3 : 6 });
  b.add(MAT.hull[nation], hull.side); b.add(MAT.deck[nation], hull.deck);
  const sup = MAT.superstructure[nation], dark = MAT.superDark[nation];
  // wheelhouse
  if (A) {
    b.taper(sup, 5.4, 2.6, 8.5, 4.2, 6.4, 0, fb + 1.3, 0.5, 0.6);
    b.taper(sup, 4.0, 1.9, 4.6, 3.0, 3.2, 0, fb + 3.55, -0.3, 0.3);
    b.box(MAT.glass, 3.7, 0.7, 0.1, 0, fb + 3.8, -2.35, [-0.25, 0, 0]);
    b.box(MAT.glass, 0.08, 0.7, 2.6, 1.72, fb + 3.8, -0.4); b.box(MAT.glass, 0.08, 0.7, 2.6, -1.72, fb + 3.8, -0.4);
  } else {
    b.box(sup, 5.8, 2.5, 9.5, 0, fb + 1.25, 0.8);
    b.box(sup, 4.6, 2.1, 4.8, 0, fb + 3.55, -0.6);
    b.box(dark, 5.0, 0.25, 5.4, 0, fb + 4.7, -0.6);
    b.box(MAT.glass, 4.1, 0.8, 0.1, 0, fb + 3.8, -3.02);
    b.box(MAT.glass, 0.08, 0.8, 3.2, 2.32, fb + 3.8, -0.8); b.box(MAT.glass, 0.08, 0.8, 3.2, -2.32, fb + 3.8, -0.8);
    b.box(dark, 1.2, 2.4, 1.6, 0, fb + 3.2, 4.2); // stack
  }
  const mastY = fb + (A ? 4.5 : 4.8);
  if (b.detail) {
    // mast, antennas, lights
    b.tube(dark, [0, mastY, 1.2], [0, mastY + 4.2, 1.6], 0.14, 6, 0.08);
    b.tube(dark, [-1.6, mastY + 2.6, 1.5], [1.6, mastY + 2.6, 1.5], 0.05);
    b.tube(MAT.gunmetal, [1.5, mastY + 2.6, 1.5], [1.5, mastY + 5.6, 1.5], 0.02); b.tube(MAT.gunmetal, [-1.5, mastY + 2.6, 1.5], [-1.5, mastY + 4.8, 1.5], 0.02);
    b.sphere(MAT.white, 0.45, 0, mastY + 0.5, 3.0);
    // RHIB on the aft deck + crane
    b.add(MAT.black, new THREE.CapsuleGeometry(0.75, 3.6, 4, 8), 0, fb + 0.95, 11.5, [Math.PI / 2, 0, 0], [1.2, 1, 0.75]);
    b.box(MAT.orange, 1.0, 0.25, 3.0, 0, fb + 1.2, 11.5);
    b.tube(dark, [2.2, fb, 9.0], [2.2, fb + 2.6, 9.0], 0.12); b.tube(dark, [2.2, fb + 2.6, 9.0], [0.4, fb + 3.0, 10.6], 0.08);
    // life rafts, life rings, deck lockers, bollards, anchor
    for (const s of [-1, 1]) {
      b.cyl(MAT.white, 0.4, 0.4, 1.2, s * 3.0, fb + 0.55, 5.5, 'z', 8);
      b.add(MAT.orange, new THREE.TorusGeometry(0.34, 0.08, 6, 12), s * 2.72, fb + 1.6, 2.0, [0, Math.PI / 2, 0]);
      b.box(dark, 0.9, 0.6, 1.6, s * 2.6, fb + 0.3, 7.6);
      for (const z of [-12.5, 13.5]) b.cyl(MAT.gunmetal, 0.12, 0.14, 0.4, s * (hull.halfBeamAt(z) - 0.5), hull.deckYAt(z) + 0.2, z);
    }
    b.box(MAT.gunmetal, 0.5, 0.2, 1.0, 0, hull.deckYAt(-15) + 0.1, -15);
    // railings following the deck edge
    for (const s of [-1, 1]) {
      const pts = []; for (let z = -15.5; z <= 16.5; z += 4) pts.push([s * (hull.halfBeamAt(z) - 0.15), hull.deckYAt(z), z]);
      b.rail(MAT.gunmetal, pts, 1.05, 2);
    }
    if (!A) { for (const s of [-1, 1]) b.box(dark, 0.12, 0.9, 14, s * 3.72, fb - 0.3, 3); } // rubbing strakes
  }
  b.build(g);
  const model = { dims: { length: L, beam: B, height: 11, draft }, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [], view: {} };
  if (lod === 0) {
    // weapon: one crew-served machine gun on the foredeck
    const mg = makeTurret('mg', nation);
    mg.node.position.set(0, hull.deckYAt(-9), -9); mg.rest = 0; mg.arc = 2.5; g.add(mg.node); model.turrets.push(mg);
    b.cyl(MAT.superDark[nation], 0.9, 1.0, 0.25, 0, hull.deckYAt(-9) + 0.1, -9, 'y', 12); b.build(g);
    const radar = makeRadar(nation, 2.2, 0.5); radar.position.set(0, mastY + 4.2, 1.6); g.add(radar); model.spinners.push({ node: radar, axis: 'y', speed: 2.4 });
    g.add(sideDecal(hullNumberMaterial(A ? 'P21' : '110', nation), 3.2, 1.6, hull.halfBeamAt(-8), 1.3, -8, 1));
    g.add(sideDecal(hullNumberMaterial(A ? 'P21' : '110', nation), 3.2, 1.6, -hull.halfBeamAt(-8), 1.3, -8, -1));
    g.add(deckDecal(MAT.insignia[nation], 2.2, 2.2, 0, fb + (A ? 4.52 : 4.84), -0.5));
    model.decks.push({ x0: -3.2, x1: 3.2, z0: -14, z1: 16.5, y: fb }, { x0: -2.2, x1: 2.2, z0: -16.5, z1: -14, y: fb + 0.5 });
    model.blocks.push({ x0: -2.9, x1: 2.9, z0: -3.9, z1: 5.6, y0: fb, y1: fb + 4.6 });
    model.posts.push({ x: 0.8, y: fb + 2.7, z: -1.0, yaw: 0, kind: 'bridge' }, { x: -0.8, y: fb + 2.7, z: -0.6, yaw: 0, kind: 'bridge' },
      { x: 2.6, y: fb, z: 8.5, yaw: -1.57, kind: 'deck' }, { x: -1.5, y: fb, z: 13.5, yaw: 3.14, kind: 'deck' }, { x: 2.2, y: fb, z: -12, yaw: 0.3, kind: 'lookout' });
    model.smoke.push(new THREE.Vector3(0, fb + (A ? 2.8 : 4.6), A ? 5.2 : 4.2));
    model.view = { bridge: new THREE.Vector3(0, fb + 3.9, -1.6), chase: 46, chaseH: 13 };
  }
  g.userData.model = model;
  return g;
}
