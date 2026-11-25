// Submarines: small unarmed Recon Sub and torpedo-armed Attack Sub.
// Origin = waterline when fully surfaced; the hull axis sits 0.2 x diameter below it (about 30% of the hull shows).
// Extras on userData.model: mast (periscope Group: sim moves position.y between mast.userData.down and .up),
//   scopeTop (periscope head, local coords, when raised), tubes [Vector3] bow tube mouths (attack: 4, recon: none),
//   sailTop (y of the sail top), axisY (y of the hull axis), spinners [propeller {axis 'z', speed 12, blades, disc}],
//   decks (casing strip), blocks (sail), posts, view { bridge, chase, chaseH }.
import * as THREE from 'three';
import { MAT } from '../gfx/materials.js';
import { PartBuilder, fuselage, wing, slab } from './builders.js';
import { pair, makeRotor, decal } from './fighter.js';

function sailOutline(A, w, z0, len) {
  const pts = [];
  if (A) { // teardrop
    const n = 9, f = (t) => (w / 2) * 2.6 * Math.sqrt(t) * (1 - t);
    for (let i = 0; i <= n; i++) pts.push([f(i / n), z0 + (i / n) * len]);
    for (let i = n - 1; i >= 1; i--) pts.push([-f(i / n), z0 + (i / n) * len]);
  } else { // blunt slab with chamfered ends
    const h = w / 2;
    pts.push([h * 0.45, z0], [h, z0 + len * 0.1], [h, z0 + len * 0.82], [h * 0.4, z0 + len], [-h * 0.4, z0 + len], [-h, z0 + len * 0.82], [-h, z0 + len * 0.1], [-h * 0.45, z0]);
  }
  return pts;
}

function buildSub(nation, lod, S) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const hullM = MAT.sub[nation], dark = MAT.superDark[nation];
  const L = S.L, R = S.D / 2, axisY = -0.2 * S.D, top = 0.3 * S.D, sailTop = top + S.sailH;
  b.add(hullM, fuselage(S.prof.map(([t, r]) => [-L / 2 + t * L, r * R]), lod ? 8 : 18), 0, axisY, 0);
  b.add(hullM, slab(sailOutline(A, S.sailW, S.sailZ, S.sailLen), S.sailH + 0.7, 3), 0, sailTop, 0);
  const deckY = top + 0.1, cz0 = S.caseZ0, cz1 = S.caseZ1;
  const model = {
    dims: { length: L, beam: S.D, height: 0.7 * S.D + sailTop, draft: 0.7 * S.D }, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [], tubes: [],
    sailTop, axisY, view: { bridge: new THREE.Vector3(0, sailTop + 1.3, S.sailZ + S.sailLen * 0.35), chase: S.chase, chaseH: S.chaseH },
  };
  // stern planes (static in both lods)
  const angles = S.xform ? [0.25, 0.75, 1.25, 1.75] : [0, 0.5, 1, 1.5];
  for (const a of angles) {
    const p = wing(S.planeSpan, S.planeChord, S.planeChord * 0.55, S.planeChord * 0.4, 0.22, 0.1);
    p.translate(S.planeR0, 0, 0); p.rotateZ(a * Math.PI);
    b.add(hullM, p, 0, axisY, S.planeZ);
  }
  if (b.detail) {
    // casing strip, hatches, cleats, rails
    b.box(hullM, S.caseW, 0.3, cz1 - cz0, 0, top - 0.05, (cz0 + cz1) / 2);
    for (const z of [cz0 + 4, cz1 - 5]) { b.cyl(dark, 0.42, 0.42, 0.14, 0, deckY + 0.07, z, 'y', 12); b.box(MAT.gunmetal, 0.08, 0.06, 0.5, 0.3, deckY + 0.16, z); }
    for (const s of [-1, 1]) for (const z of [cz0 + 1.5, cz1 - 1.5]) b.box(MAT.gunmetal, 0.12, 0.14, 0.5, s * (S.caseW / 2 - 0.2), deckY + 0.07, z);
    for (const s of [-1, 1]) b.rail(MAT.gunmetal, [[s * (S.caseW / 2 - 0.06), deckY, cz0 + 0.5], [s * (S.caseW / 2 - 0.06), deckY, S.sailZ - 1]], 1.0, 3);
    // sail fittings: bridge well, windscreen, fixed masts, nav lights
    const bz = S.sailZ + S.sailLen * 0.3;
    b.box(MAT.black, S.sailW * 0.5, 0.06, S.sailLen * 0.22, 0, sailTop + 0.02, bz);
    if (A) b.box(MAT.glass, S.sailW * 0.55, 0.28, 0.06, 0, sailTop - 0.3, S.sailZ + S.sailLen * 0.085, [-0.3, 0, 0]);
    else { b.box(dark, S.sailW * 0.9, S.sailH * 0.16, S.sailLen * 0.36, 0, sailTop + S.sailH * 0.08, S.sailZ + S.sailLen * 0.6); b.rail(MAT.gunmetal, [[-S.sailW * 0.3, sailTop, bz - S.sailLen * 0.12], [S.sailW * 0.3, sailTop, bz - S.sailLen * 0.12]], 0.8, 1); }
    b.tube(dark, [0.25, sailTop - 0.2, bz + S.sailLen * 0.3], [0.25, sailTop + 1.5, bz + S.sailLen * 0.3], 0.1, 6);
    b.box(dark, 0.7, 0.2, 0.2, 0.25, sailTop + 1.6, bz + S.sailLen * 0.3);
    b.tube(MAT.gunmetal, [-0.25, sailTop - 0.2, bz + S.sailLen * 0.42], [-0.25, sailTop + 2.4, bz + S.sailLen * 0.42], 0.03, 4);
    b.box(MAT.red, 0.1, 0.1, 0.1, -S.sailW * 0.3, sailTop + 0.06, bz); b.box(MAT.white, 0.1, 0.1, 0.1, S.sailW * 0.3, sailTop + 0.06, bz);
    const iw = (A ? 0.96 : 1) * S.sailW / 2 + 0.03, isz = Math.min(1.7, S.sailH * 0.55);
    for (const s of [-1, 1]) g.add(decal(nation, isz, s * iw, sailTop - S.sailH * 0.45, S.sailZ + S.sailLen * (A ? 0.34 : 0.45), s > 0 ? 'right' : 'left'));
    // diving planes: on the sail (attack) or the bow (recon)
    if (S.fairwater) pair(b, hullM, () => wing(S.D * 0.34, S.sailLen * 0.2, S.sailLen * 0.12, S.sailLen * 0.05, 0.24, 0.1), S.sailW * 0.3, top + S.sailH * 0.55, S.sailZ + S.sailLen * 0.3);
    else pair(b, hullM, () => wing(R * 0.75, 1.5, 0.9, 0.5, 0.18, 0.08), R * 0.85, axisY + R * 0.35, -L / 2 + L * 0.17);
    if (!A) { for (const s of [-1, 1]) b.box(dark, 0.16, 0.34, L * 0.5, s * R, axisY, 0); b.add(dark, fuselage([[-1.6, 0.05], [-1.0, 0.32], [1.2, 0.32], [2.0, 0.05]], 8), 0, axisY + S.planeR0 + S.planeSpan, S.planeZ + S.planeChord * 0.6); } // strakes, towed-array pod
    // bow torpedo tube shutters
    for (let i = 0; i < S.tubes; i++) {
      const x = (i % 2 ? 1 : -1) * R * 0.24, y = axisY + (i < 2 ? 1 : -1) * R * 0.2;
      b.cyl(MAT.black, 0.3, 0.3, 0.12, x, y, -L / 2 + L * 0.0085, 'z', 10);
      model.tubes.push(new THREE.Vector3(x, y, -L / 2 - 0.3));
    }
    // propulsor
    const pz = L / 2 - L * 0.012;
    let prop;
    if (S.pumpjet) {
      b.cyl(dark, R * 0.4, R * 0.5, L * 0.045, 0, axisY, pz - L * 0.02, 'z', 16);
      prop = makeRotor(R * 0.37, 9, R * 0.12, 'z', MAT.brass, R * 0.1); prop.node.position.set(0, axisY, pz + L * 0.004);
    } else {
      prop = makeRotor(R * 0.58, 7, R * 0.24, 'z', MAT.brass, R * 0.1); prop.node.position.set(0, axisY, pz + 0.5);
      const hb = new PartBuilder(0); hb.cone(MAT.brass, R * 0.1, R * 0.28, 0, 0, R * 0.2, '+z', 8); hb.build(prop.node);
    }
    g.add(prop.node); model.spinners.push({ node: prop.node, axis: 'z', speed: 12, blades: prop.blades, disc: prop.disc });
    // periscope mast (raised and lowered by the sim)
    const mast = new THREE.Group(), mb = new PartBuilder(0), mz = bz + S.sailLen * 0.12;
    mb.tube(dark, [0, 0, 0], [0, 3.6, 0], 0.09, 8); mb.box(dark, 0.2, 0.34, 0.26, 0, 3.75, 0); mb.box(MAT.glass, 0.14, 0.14, 0.04, 0, 3.8, -0.14);
    mb.tube(MAT.gunmetal, [0.3, 0, 0.5], [0.3, 3.0, 0.5], 0.05, 6); mb.cyl(MAT.gunmetal, 0.11, 0.11, 0.3, 0.3, 3.1, 0.5, 'y', 8);
    mb.build(mast);
    mast.userData.up = sailTop - 0.3; mast.userData.down = sailTop - 4.05;
    mast.position.set(0, mast.userData.down, mz); g.add(mast);
    model.mast = mast; model.scopeTop = new THREE.Vector3(0, mast.userData.up + 3.8, mz - 0.14);
    model.decks.push({ x0: -S.caseW / 2, x1: S.caseW / 2, z0: cz0, z1: cz1, y: deckY });
    model.blocks.push({ x0: -S.sailW / 2, x1: S.sailW / 2, z0: S.sailZ, z1: S.sailZ + S.sailLen, y0: top, y1: sailTop });
    model.posts.push({ x: 0, y: deckY, z: S.sailZ - 4, yaw: 0, kind: 'lookout' }, { x: 0.3, y: deckY, z: S.sailZ + S.sailLen + 3, yaw: 3.14, kind: 'deck' });
  }
  b.build(g);
  g.userData.model = model;
  return g;
}

export function buildReconSub(nation, lod = 0) {
  return buildSub(nation, lod, {
    L: 42, D: 5.2, prof: [[0, 0.02], [0.02, 0.46], [0.06, 0.81], [0.14, 1], [0.69, 1], [0.83, 0.77], [0.94, 0.38], [0.985, 0.17]],
    sailZ: -9, sailLen: 6.5, sailW: 1.5, sailH: 2.6, caseW: 1.5, caseZ0: -16, caseZ1: 10,
    xform: true, planeSpan: 2.4, planeChord: 1.9, planeR0: 1.1, planeZ: 14.2, fairwater: false, tubes: 0, pumpjet: true, chase: 70, chaseH: 16,
  });
}

export function buildAttackSub(nation, lod = 0) {
  return buildSub(nation, lod, {
    L: 68, D: 8, prof: [[0, 0.02], [0.015, 0.48], [0.045, 0.78], [0.1, 0.97], [0.18, 1], [0.68, 1], [0.82, 0.75], [0.93, 0.4], [0.985, 0.13]],
    sailZ: -15, sailLen: 11, sailW: 2.3, sailH: 5.0, caseW: 2.2, caseZ0: -27, caseZ1: 16,
    xform: false, planeSpan: 2.9, planeChord: 2.8, planeR0: 1.5, planeZ: 24.5, fairwater: true, tubes: 4, pumpjet: false, chase: 100, chaseH: 22,
  });
}
