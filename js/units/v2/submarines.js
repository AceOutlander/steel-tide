// Submarines (v2): the small unarmed Recon Sub and the torpedo-armed Attack Sub.
// Smooth pressure hull covered in staggered coating tiles (metre UVs wrapped round the hull, so no seam), a foil-section
// sail with a bridge well, retracting masts, real aerofoil dive planes (bow planes on the Recon Sub, fairwater planes on
// the Attack Sub), cruciform or X stern planes, and a shrouded propulsor with stator vanes and a turning rotor.
// Aethia: upright teardrop sail. Extro: long raked sail, flank arrays along the hull, a towed-array pod on the top rudder.
// Origin = waterline when fully surfaced; the hull axis sits 0.2 x diameter below it (about 30% of the hull shows).
// userData.model, as before: mast (periscope Group: the sim moves position.y between mast.userData.down and .up),
//   scopeTop (periscope head, local coords, when raised), tubes [Vector3] bow tube mouths (attack: 4, recon: none),
//   sailTop, axisY, spinners [rotor { node, axis 'z', speed 12, prop: true (turns with the throttle) }],
//   decks (casing strip), blocks (sail), posts, view { bridge, chase, chaseH }.
import * as THREE from 'three';
import { ShipKit, shipMats, rail, wingGeo, latheZ, cached, fineDetail, C, tone, metal, navlight, capstan } from './shipkit.js';

const TAU = Math.PI * 2, HP = Math.PI / 2, BRONZE = tone(metal, 0x6a5630);

// hull of revolution along Z with the coating tiles wrapped round it: u = z, v = distance round the hull (a whole number of 8 m tiles)
const rOf = (P, t) => (t < P.tn ? Math.pow(1 - Math.pow(1 - t / P.tn, P.np), 1 / P.np) : t > P.ta ? P.re + (1 - P.re) * Math.pow(1 - Math.pow(Math.min(1, (t - P.ta) / (0.992 - P.ta)), 1.5), 0.92) : 1);
function hullGeo(L, R, P, seg) {
  const prof = [], N = 46;
  for (let i = 0; i <= N; i++) {
    const f = i / N, t = f < 0.3 ? P.tn * Math.pow(f / 0.3, 1.7) : f < 0.6 ? P.tn + (P.ta - P.tn) * ((f - 0.3) / 0.3) : P.ta + (0.992 - P.ta) * Math.pow((f - 0.6) / 0.4, 0.9);


    prof.push([-L / 2 + t * L, Math.max(0.01, rOf(P, t)) * R]);
  }
  const g = latheZ(prof, seg), uv = g.attributes.uv, p = g.attributes.position, circ = Math.max(1, Math.round((TAU * R) / 8)) * 8;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getZ(i), uv.getX(i) * circ);
  g.userData.uvm = true;
  return g;
}
// upright foil standing on y = 0: chord along Z from z0, height h, full thickness w; rake shifts the top aft, taper shortens it
function foil(z0, len, w, h, rake = 0, taper = 0.94, round = true, n = 8) {
  const f = (h - 0.2) / h, g = wingGeo([{ x: 0, z: z0, c: len, t: w / len }, { x: h - 0.2, z: z0 + rake * f, c: len * (1 - (1 - taper) * f), t: w / len }, { x: h, z: z0 + rake + len * taper * 0.012, c: len * taper * 0.976, t: (w * 0.8) / (len * taper) }], { n, tip: 'flat' });
  g.rotateZ(HP);
  return g;
}
function ductGeo(r, len, seg) {
  const pts = [[r * 0.93, 0], [r * 1.0, len * 0.3], [r * 0.97, len * 0.7], [r * 0.86, len], [r * 0.8, len], [r * 0.84, len * 0.6], [r * 0.86, len * 0.25], [r * 0.89, 0], [r * 0.93, 0]];
  const g = new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), seg); g.rotateX(HP);
  return g;
}

function buildSub(nation, lod, fine, P) {
  const M = shipMats(nation), A = M.A, g = new THREE.Group(), k = new ShipKit({ lod, fine }), dk = new ShipKit({ lod, fine });
  const L = P.L, R = P.D / 2, axisY = -0.2 * P.D, top = 0.3 * P.D, sailTop = top + P.sailH, U = M.U, UD = M.UD, BK = M.uCol('#050607');
  const sz = P.sailZ, sl = P.sailLen, sw = P.sailW, deckY = top + 0.1, cz0 = P.caseZ0, cz1 = P.caseZ1;
  const model = {
    dims: { length: L, beam: P.D, height: 0.7 * P.D + sailTop, draft: 0.7 * P.D }, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [], tubes: [],
    sailTop, axisY, view: { bridge: new THREE.Vector3(0, sailTop + 1.3, sz + sl * 0.35), chase: P.chase, chaseH: P.chaseH },
  };
  k.add(U, hullGeo(L, R, P, lod ? 10 : fine ? 40 : 22), 0, axisY, 0);
  k.add(U, foil(sz, sl, sw, P.sailH + 0.9, A ? sl * 0.04 : sl * 0.2, A ? 0.93 : 0.74, A, lod ? 4 : 9), 0, top - 0.9, 0);
  // stern planes: a cross on the Attack Sub, an X on the Recon Sub
  const angles = P.xform ? [0.25, 0.75, 1.25, 1.75] : [0, 0.5, 1, 1.5], c = P.planeChord;
  const plane = wingGeo([{ x: P.planeR0 * 0.6, z: P.planeZ, c, t: 0.14 }, { x: P.planeR0 + P.planeSpan, z: P.planeZ + c * 0.42, c: c * 0.55, t: 0.11 }], { n: lod ? 3 : 6, tip: 'flat' });
  for (const a of angles) k.add(U, plane, 0, axisY, 0, [0, 0, a * Math.PI]);
  if (lod) { k.build(g); g.userData.model = model; return g; }

  // ---- casing: walkway, limber holes, hatches, cleats, capstan, rails
  k.cbox(UD, P.caseW, 0.34, cz1 - cz0, 0.1, 0, top - 0.07, (cz0 + cz1) / 2);
  k.add(UD, latheZ([[-1.6, 0.02], [-0.8, P.caseW * 0.42], [0, P.caseW * 0.5]], 10), 0, top - 0.07, cz0, null, [1, 0.34, 1]); k.add(UD, latheZ([[0, P.caseW * 0.5], [1.2, P.caseW * 0.4], [2.4, 0.02]], 10), 0, top - 0.07, cz1, null, [1, 0.34, 1]);
  if (fine) for (const s of [-1, 1]) for (let z = cz0 + 0.8; z < cz1 - 0.5; z += 1.3) if (z < sz - 0.3 || z > sz + sl + 0.3) k.box(BK, 0.04, 0.09, 0.5, s * (P.caseW / 2 + 0.005), top - 0.02, z);
  for (const z of [cz0 + 3, cz1 - 5]) k.at(0, deckY, z, 0, (q) => { q.cyl(UD, 0.46, 0.5, 0.12, 0, 0.06, 0, 'y', 14); q.cyl(U, 0.4, 0.4, 0.05, 0, 0.14, 0, 'y', 14); q.torus(BK, 0.14, 0.02, 0, 0.19, 0, [HP, 0, 0], 8); q.box(BK, 0.1, 0.06, 0.16, 0, 0.14, 0.42); });
  for (const s of [-1, 1]) for (const z of [cz0 + 1.5, sz - 2.2, sz + sl + 1.6, cz1 - 1.5]) k.at(s * (P.caseW / 2 - 0.22), deckY, z, 0, (q) => { q.box(C.gun, 0.1, 0.1, 0.14, 0, 0.05, 0); q.box(C.gun, 0.12, 0.06, 0.5, 0, 0.13, 0); });
  k.at(0, deckY, cz0 + 1.3, 0, (q) => capstan(q, 0.5)); k.rod(C.gun, [0.5, deckY + 0.03, cz0 + 3], [0.5, deckY + 0.03, sz - 0.6], 0.02, 3);
  for (const s of [-1, 1]) rail(k, [[s * (P.caseW / 2 - 0.07), deckY, cz0 + 0.6], [s * (P.caseW / 2 - 0.07), deckY, sz - 1]], { mc: C.gun, h: 1.0, post: 2.6, bars: 1 });
  if (P.vls) for (let i = 0; i < P.vls; i++) for (const s of [-1, 1]) { const z = sz - 3 - i * 1.5; k.cyl(UD, 0.4, 0.4, 0.05, s * 0.52, deckY + 0.01, z, 'y', 12); k.torus(BK, 0.4, 0.018, s * 0.52, deckY + 0.04, z, [HP, 0, 0], 12); }
  // ---- sail: bridge well, windscreen, fixed aerial and lights, mast hatches, insignia, flood holes
  const bz = sz + sl * 0.3, rk = A ? sl * 0.04 : sl * 0.2;
  k.cbox(BK, sw * 0.46, 0.06, sl * 0.2, 0.02, 0, sailTop + 0.012, bz + rk);
  if (fine) { for (const s of [-1, 1]) k.rod(C.gun, [s * sw * 0.26, sailTop, bz + rk - sl * 0.1], [s * sw * 0.26, sailTop + 0.5, bz + rk - sl * 0.1], 0.02, 3); k.rod(C.gun, [-sw * 0.26, sailTop + 0.5, bz + rk - sl * 0.1], [sw * 0.26, sailTop + 0.5, bz + rk - sl * 0.1], 0.02, 3); }
  if (A) k.box(M.G, sw * 0.5, 0.26, 0.05, 0, sailTop + 0.14, bz + rk - sl * 0.11, [-0.35, 0, 0]);
  k.rod(UD, [0.2, sailTop - 0.2, bz + rk + sl * 0.34], [0.2, sailTop + 1.5, bz + rk + sl * 0.34], 0.08, 6); k.box(UD, 0.7, 0.14, 0.14, 0.2, sailTop + 1.55, bz + rk + sl * 0.34);
  k.rod(C.gun, [-0.2, sailTop - 0.2, bz + rk + sl * 0.42], [-0.2, sailTop + 2.6, bz + rk + sl * 0.42], 0.025, 3);
  k.at(-sw * 0.25, sailTop + 0.1, bz + rk, 0, (q) => navlight(q, C.lampRed, 0.06)); k.at(sw * 0.25, sailTop + 0.1, bz + rk, 0, (q) => navlight(q, C.lampGreen, 0.06)); k.at(0.2, sailTop + 1.72, bz + rk + sl * 0.34, 0, (q) => navlight(q, C.lampWhite, 0.06));
  const mz = bz + sl * 0.12;
  for (const [x, z] of [[0, 0], [0.3, 0.5], [-0.3, 1.0]]) k.cyl(BK, 0.16, 0.16, 0.03, x, sailTop + 0.012, mz + rk + z, 'y', 10);
  const isz = Math.min(1.6, P.sailH * 0.5), ih = P.sailH * (P.fairwater ? 0.27 : 0.5), iff = (ih + 0.9) / (P.sailH + 0.9);
  for (const s of [-1, 1]) {
    dk.decal(M.ins, isz, s * (sw / 2 + 0.03), top + ih, sz + rk * iff + sl * (1 - (1 - (A ? 0.93 : 0.74)) * iff) * 0.3, s > 0 ? 'right' : 'left');
    if (fine) for (let i = 0; i < 4; i++) k.box(BK, 0.03, 0.12, 0.42, s * sw * 0.44, top + 0.5, sz + sl * (0.42 + i * 0.09));
    if (fine) for (let y = top + 0.5; y < sailTop - 0.3; y += 0.45) k.rod(C.gun, [s * sw * 0.2, y, sz + sl * 0.93], [s * sw * 0.2 + s * 0.2, y, sz + sl * 0.9], 0.016, 3);
  }
  // ---- diving planes: on the sail (Attack Sub) or the bow (Recon Sub)
  if (P.fairwater) k.pair(U, wingGeo([{ x: sw * 0.3, z: sz + sl * 0.3, c: sl * 0.24, t: 0.15 }, { x: sw * 0.3 + P.D * 0.36, z: sz + sl * 0.36, c: sl * 0.14, t: 0.12 }], { n: 6, tip: 'round' }), 0, top + P.sailH * 0.55, 0);
  else k.pair(U, wingGeo([{ x: R * 0.8, z: -L / 2 + L * 0.17, c: 1.6, t: 0.15 }, { x: R * 0.8 + R * 0.8, z: -L / 2 + L * 0.17 + 0.5, c: 0.95, t: 0.12 }], { n: 6, tip: 'round' }), 0, axisY + R * 0.38, 0);
  // ---- bow: sonar window band, torpedo tube shutters; flank arrays and towed-array pod (Extro); draught marks
  k.cyl(UD, rOf(P, P.bandT + 0.006) * R * 1.004, rOf(P, P.bandT - 0.006) * R * 1.004, L * 0.012, 0, axisY, -L / 2 + L * P.bandT, 'z', fine ? 40 : 22, true);
  for (let i = 0; i < P.tubes; i++) {
    const x = (i % 2 ? 1 : -1) * R * 0.24, y = axisY + (i < 2 ? 1 : -1) * R * 0.2;
    k.cyl(BK, 0.32, 0.32, 0.1, x, y, -L / 2 + L * 0.0085, 'z', 12); k.torus(UD, 0.33, 0.035, x, y, -L / 2 + L * 0.0085 - 0.05, null, 12);
    model.tubes.push(new THREE.Vector3(x, y, -L / 2 - 0.3));
  }
  if (!A) {
    for (const s of [-1, 1]) k.cbox(UD, 0.2, 0.5, L * 0.44, 0.06, s * (R + 0.02), axisY, -L * 0.03);
    if (!P.xform) k.add(UD, latheZ([[-1.7, 0.03], [-1.1, 0.3], [1.2, 0.34], [2.1, 0.04]], 12), 0, axisY + P.planeR0 + P.planeSpan, P.planeZ + c * 0.7);
  } else if (fine) for (const s of [-1, 1]) for (const z of [-L * 0.2, L * 0.1]) k.cbox(UD, 0.06, 0.5, 1.6, 0.02, s * (R - 0.01), axisY + 0.2, z);
  if (fine) for (const s of [-1, 1]) for (let i = 0; i < 5; i++) dk.box(C.white, 0.02, 0.05, 0.22, s * Math.sqrt(Math.max(0, R * R - Math.pow(0.15 + i * 0.3 - axisY, 2))) * 1.004, 0.15 + i * 0.3, -L * 0.3);
  // ---- propulsor: shroud on struts, stator vanes, rotor turning inside, tail cone
  const pz = L / 2 - L * 0.045, pr = R * 0.52, pl = L * 0.05;
  k.add(UD, ductGeo(pr, pl, fine ? 28 : 16), 0, axisY, pz);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.2; k.add(UD, new THREE.BoxGeometry(0.05, pr * 0.72, pl * 0.3), Math.sin(a) * pr * 0.55, axisY + Math.cos(a) * pr * 0.55, pz + pl * 0.22, [0, 0, -a]); }
  const rotor = new THREE.Group(), rk2 = new ShipKit({ fine });
  const blade = wingGeo([{ x: pr * 0.2, z: -pl * 0.1, c: pl * 0.2, t: 0.16 }, { x: pr * 0.55, z: -pl * 0.16, c: pl * 0.3, t: 0.08 }, { x: pr * 0.84, z: -pl * 0.05, c: pl * 0.24, t: 0.06 }], { n: 3, tip: 'flat' });
  for (let i = 0; i < 9; i++) { const b = blade.clone(); b.rotateX(0.75); b.rotateZ((i / 9) * TAU); rk2.add(BRONZE, b); }
  rk2.lathe(BRONZE, [[-pl * 0.2, pr * 0.24], [pl * 0.15, pr * 0.2], [pl * 0.5, pr * 0.02]], 10);
  rk2.build(rotor); rotor.position.set(0, axisY, pz + pl * 0.62); g.add(rotor);
  model.spinners.push({ node: rotor, axis: 'z', speed: 12, prop: true });
  // ---- masts (raised and lowered together by the sim): search and attack periscopes, radar, snorkel, aerial
  const mast = new THREE.Group(), mk = new ShipKit({ fine });
  mk.cyl(UD, 0.09, 0.1, 3.6, 0, 1.8, 0, 'y', 10); mk.cbox(UD, 0.2, 0.36, 0.26, 0.04, 0, 3.75, 0); mk.box(M.G, 0.13, 0.14, 0.03, 0, 3.8, -0.135); mk.cyl(UD, 0.12, 0.12, 0.1, 0, 3.5, 0, 'y', 10);
  mk.cyl(C.gun, 0.05, 0.06, 3.0, 0.3, 1.5, 0.5, 'y', 8); mk.cyl(C.gun, 0.1, 0.1, 0.3, 0.3, 3.1, 0.5, 'y', 10); mk.cyl(M.G, 0.05, 0.05, 0.02, 0.3, 3.16, 0.4, 'z', 8);
  mk.cyl(UD, 0.07, 0.08, 2.6, -0.3, 1.3, 1.0, 'y', 8); mk.cbox(UD, 0.7, 0.14, 0.12, 0.03, -0.3, 2.68, 1.0); mk.cyl(UD, 0.1, 0.1, 0.12, -0.3, 2.56, 1.0, 'y', 8);
  if (sl > 8) { mk.cyl(UD, 0.2, 0.22, 2.4, 0.1, 1.2, 1.9, 'y', 12); mk.sphere(UD, 0.26, 0.1, 2.45, 1.9, [1, 0.7, 1], 10); mk.rod(C.gun, [-0.25, 0, 2.6], [-0.25, 3.4, 2.6], 0.02, 3); }
  mk.build(mast);
  mast.userData.up = sailTop - 0.3; mast.userData.down = sailTop - 4.05;
  mast.position.set(0, mast.userData.down, mz + rk); g.add(mast);
  model.mast = mast; model.scopeTop = new THREE.Vector3(0, mast.userData.up + 3.8, mz + rk - 0.14);
  model.decks.push({ x0: -P.caseW / 2, x1: P.caseW / 2, z0: cz0, z1: cz1, y: deckY });
  model.blocks.push({ x0: -sw / 2, x1: sw / 2, z0: sz, z1: sz + sl, y0: top, y1: sailTop });
  model.posts.push({ x: 0, y: deckY, z: sz - 4, yaw: 0, kind: 'lookout' }, { x: 0.3, y: deckY, z: sz + sl + 3, yaw: 3.14, kind: 'deck' });
  k.build(g); dk.build(g, { cast: false });
  g.userData.model = model;
  return g;
}

const RECON = { L: 42, D: 5.2, tn: 0.15, ta: 0.66, np: 2.3, re: 0.2, sailZ: -9, sailLen: 6.5, sailW: 1.5, sailH: 2.6, caseW: 1.5, caseZ0: -16, caseZ1: 10, bandT: 0.06, bandR: 0.842, bandR2: 0.872,
  xform: true, planeSpan: 2.4, planeChord: 1.9, planeR0: 1.1, planeZ: 14.2, fairwater: false, tubes: 0, vls: 0, chase: 70, chaseH: 16 };
const ATTACK = { L: 68, D: 8, tn: 0.17, ta: 0.66, np: 2.4, re: 0.17, sailZ: -15, sailLen: 11, sailW: 2.3, sailH: 5.0, caseW: 2.2, caseZ0: -27, caseZ1: 16, bandT: 0.07, bandR: 0.86, bandR2: 0.888,
  xform: false, planeSpan: 2.9, planeChord: 2.8, planeR0: 1.5, planeZ: 24.5, fairwater: true, tubes: 4, vls: 4, chase: 100, chaseH: 22 };

export function buildReconSub(nation, lod = 0) { const fine = fineDetail(); return cached(`reconsub:${nation}:${lod}:${fine}`, () => buildSub(nation, lod, fine, RECON)); }
export function buildAttackSub(nation, lod = 0) { const fine = fineDetail(); return cached(`attacksub:${nation}:${lod}:${fine}`, () => buildSub(nation, lod, fine, ATTACK)); }
