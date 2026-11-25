// Corvette (v2): medium escort. Twin deck gun forward, vertical-launch cells ahead of the bridge, anti-ship canisters
// amidships, boats and rafts, hangar with a crew-served machine gun on its roof, helicopter deck with safety nets aft.
// Aethia: knuckled hull with tumblehome, faceted deckhouse, enclosed pyramid mast with flat arrays, faceted funnel.
// Extro: smooth flared hull with a rubbing strake, upright two-level bridge with open wings, lattice mast, raked oval funnel.
// userData.model: the standard contract (dims, turrets [deckgun, mg], spinners [air search, navigation], decks, blocks,
// posts, smoke, view) plus helipad { pos, r }. Decks: main deck, steps up the sheer of the bow, hangar roof.
import * as THREE from 'three';
import { startShip, finishShip, spin, bowDecks, strake, house, rail, net, breakwater, lattice4, radar, hullDecal, sstep, cached, fineDetail, C,
  door, ladder, hatch, liferaft, lifering, firebox, bitts, chock, capstan, windlass, anchor, whip, dome, searchlight, navlight, locker, reel, staff, rhib, davit, vls, canisters, decoys, screw, vent, flood,
  FWD, AFT, SB, PT } from './shipkit.js';
import { MAT } from '../../gfx/materials.js';
import { mount, proxy } from './turrets.js';

const HP = Math.PI / 2;

export function buildCorvette(nation, lod = 0) { const fine = fineDetail(); return cached(`corvette:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

function make(nation, lod, fine) {
  const A = nation === 'aethia', L = 95, B = 12.5, D = 3.8, fb = 4.6;
  const S = startShip(nation, lod, fine, { L, B, D, fb, sheer: 1.5, sheerLen: 0.34, bowLen: 0.38, bowPow: 0.74, sternW: 0.84, sternLen: 0.18, knuckle: A ? 0.5 : 0, flareTop: A ? 1.28 : 1.2, tumble: A ? 0.95 : 1,
    wlBow: A ? 0.46 : 0.5, wlMid: A ? 0.95 : 0.93, bilge: 3.2, rake: 4.2, keelRise: 0.55, bulwark: (s) => 0.95 * sstep(0.2, 0.12, s), stations: 60 }, 1);
  const { M, k, dk, hull, model } = S, dY = hull.deckY, half = hull.half, roofY = fb + 3.2, hangarY = fb + 4.4, by = A ? roofY : fb + 6.0;
  model.dims = { length: L, beam: B, height: fb + (A ? 17 : 19.5), draft: D };

  // ---- main blocks (both detail levels)
  const H1 = house(k, M.S, { z0: -17, z1: 14, w: 9.6, y0: fb, y1: roofY, slope: A ? 0.1 : 0.015, rakeF: A ? 0.35 : 0.05, rakeA: 0, cf: A ? 1.3 : 0.6, ca: 0, roof: M.D });
  const HG = house(k, M.S, { z0: 14, z1: 24, w: 9.4, y0: fb, y1: hangarY, slope: A ? 0.08 : 0.015, rakeF: 0, rakeA: A ? 0.06 : 0, cf: 0, ca: A ? 0.5 : 0.25, roof: M.D });
  let H2, H3 = null, mast, fun, mastTop;
  if (A) {
    H2 = house(k, M.S, { z0: -15.8, z1: -4, wf: 7.2, wa: 8.2, y0: roofY, y1: roofY + 3.0, slope: 0.15, rakeF: 0.5, rakeA: 0.1, cf: 1.3, ca: 0.6 });
    mast = house(k, M.S, { z0: -9.4, z1: -5.0, w: 3.8, y0: roofY + 3.0, y1: fb + 15.5, slope: 0.125, rakeF: 0.17, rakeA: 0.08, cf: 0.7, ca: 0.7 }); mastTop = fb + 15.5;
    fun = house(k, M.S, { z0: 2.8, z1: 10.2, w: 4.6, y0: roofY, y1: fb + 8.0, slope: 0.17, rakeF: 0.55, rakeA: 0.16, cf: 0.9, ca: 0.9 });
  } else {
    H2 = house(k, M.S, { z0: -16, z1: -4, w: 8.8, y0: roofY, y1: fb + 6.0, slope: 0.02, rakeF: 0.05, cf: 0.7, ca: 0.3, roof: M.D });
    H3 = house(k, M.S, { z0: -15.3, z1: -7.8, w: 7.4, y0: fb + 6.0, y1: fb + 8.4, slope: 0.03, rakeF: -0.14, rakeA: 0.02, cf: 0.8, ca: 0.3 });
    lattice4(k, M.SD, 0, -5.5, fb + 6.0, fb + 17, 3.0, 1.0, 5, 0.1); mastTop = fb + 17; k.cbox(M.SD, 2.3, 0.14, 2.3, 0.04, 0, fb + 17.05, -5.5);
    k.add(M.S, new THREE.CylinderGeometry(1.45, 1.95, 6.6, lod ? 8 : 20), 0, fb + 6.4, 7, [0.12, 0, 0], [1, 1, 1.5]);
    k.add(M.BK, new THREE.CylinderGeometry(1.5, 1.5, 0.7, lod ? 8 : 20), 0, fb + 9.75, 7.42, [0.12, 0, 0], [1, 1, 1.5]);
  }
  if (lod) { proxy(k, M, 'deckgun', 0, dY(-27) + 0.2, -27, 0); return finishShip(S); }

  // ---- bridge: windows, doors, wings
  const BR = A ? H2 : H3, wv = A ? [1.55, 2.4] : [1.0, 1.85];
  BR.windows(k, M, FWD, wv[0], wv[1], 7, 0.4); BR.windows(k, M, SB, wv[0], wv[1], A ? 6 : 5, 0.5); BR.windows(k, M, PT, wv[0], wv[1], A ? 6 : 5, 0.5); BR.windows(k, M, 0, wv[0], wv[1], 1, 0.15); BR.windows(k, M, 6, wv[0], wv[1], 1, 0.15);
  if (!A) { H2.windows(k, M, FWD, 1.5, 2.1, 6, 0.6); BR.windows(k, M, AFT, 1.0, 1.7, 3, 1.2); }
  for (const e of [SB, PT]) {
    const s = e === SB ? 1 : -1;
    for (const z of [-13, 2.5, 11]) H1.on(k, e, z, 0, (q) => door(q, M));
    H1.on(k, e, -5, 1.6, (q) => lifering(q)); H1.on(k, e, 7, 1.4, (q) => firebox(q)); H1.on(k, e, -9, 1.4, (q) => firebox(q));
    HG.on(k, e, 16, 0, (q) => door(q, M)); HG.on(k, e, 21.5, 1.7, (q) => lifering(q)); HG.on(k, e, 22.6, 0, (q) => ladder(q, M.rail, 4.4));
    H2.on(k, e, -5.2, 0, (q) => door(q, M, 0.75, 1.85));
    if (fine) for (const z of [-15, -9, -1, 5, 9]) H1.on(k, e, z, 2.6, (q) => flood(q, 0.6));
    // boats, rafts and decoy launchers on the deckhouse roof
    if (s > 0) { k.at(3.45, roofY, A ? -0.4 : 1.0, 0, (q) => rhib(q, M, 6.0, 2.2)); for (const z of A ? [-2.6, 1.8] : [-1.2, 3.2]) k.at(4.5, roofY, z, Math.PI, (q) => davit(q, M, 2.5, 1.3)); }
    else k.at(-3.5, roofY, A ? -0.4 : 1.0, s * HP, (q) => canisters(q, M, 2, 4.6, 0.4));
    for (const z of [11.0, 12.6]) k.at(s * 4.2, roofY, z, 0, (q) => liferaft(q));
    k.at(s * 3.9, roofY, A ? -3.4 : -2.6, -s * 0.9, (q) => decoys(q, M));
    rail(k, [[s * 4.6, roofY, A ? -3.8 : -3.8], [s * 4.6, roofY, 13.8]], { mc: M.rail, post: 2.2 });
  }
  // ---- mast and sensors
  if (A) {
    for (const e of [FWD, SB, AFT, PT]) { mast.on(k, e, e === FWD || e === AFT ? 0 : -7.2, 3.6, (q) => { q.cbox(M.SK, 1.7, 2.0, 0.12, 0.3, 0, 0, 0.04); q.cbox(M.SD, 1.9, 2.2, 0.06, 0.34, 0, 0, 0.01); }); mast.on(k, e, e === FWD || e === AFT ? 0 : -7.2, 7.6, (q) => q.cbox(M.SK, 0.9, 1.1, 0.1, 0.12, 0, 0, 0.04)); }
    k.cbox(M.SD, 2.0, 0.14, 2.2, 0.04, 0, mastTop + 0.05, -6.9);
    k.rod(M.SD, [-3.4, fb + 12.2, -6.6], [3.4, fb + 12.2, -6.6], 0.07, 5);
    for (const s of [-1, 1]) { k.at(s * 3.3, fb + 12.2, -6.6, 0, (q) => whip(q, 3.2, 0)); k.at(s * 2.2, fb + 12.25, -6.6, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.08)); k.at(s * 2.5, roofY + 3.0, -10.6, 0, (q) => dome(q, M, 0.62, 0.5)); k.at(s * 3.1, roofY + 3.0, -5.6, 0, (q) => whip(q, 5, -0.1)); }
    k.at(0, roofY + 3.0, -13.2, 0, (q) => searchlight(q, M, 0.8));
    // funnel: recessed dark cap, exhaust uptakes, grilles
    k.cbox(M.BK, 2.4, 0.3, 4.2, 0.08, 0, fb + 8.05, 7.3);
    for (const z of [6.2, 8.4]) for (const s of [-1, 1]) { k.cyl(M.SD, 0.36, 0.4, 0.9, s * 0.55, fb + 8.5, z, 'y', 10); k.cyl(M.BK, 0.3, 0.3, 0.05, s * 0.55, fb + 8.96, z, 'y', 10); }
    for (const e of [SB, PT]) { fun.on(k, e, 6.5, 1.6, (q) => { q.cbox(M.SK, 2.6, 1.3, 0.06, 0.04, 0, 0, 0.02); if (fine) for (let i = 0; i < 5; i++) q.box(M.SD, 2.4, 0.06, 0.05, 0, -0.5 + i * 0.25, 0.06); }); }
  } else {
    // open bridge wings with lookout positions, searchlights
    k.cbox(M.SD, 13.0, 0.2, 2.8, 0.04, 0, fb + 5.98, -7.2);
    for (const s of [-1, 1]) { rail(k, [[s * 4.5, fb + 6.08, -8.5], [s * 6.4, fb + 6.08, -8.5], [s * 6.4, fb + 6.08, -5.9], [s * 4.5, fb + 6.08, -5.9]], { mc: M.rail, post: 1.2 }); k.at(s * 6.0, fb + 6.08, -8.1, 0, (q) => searchlight(q, M, 0.7)); k.box(M.S, 0.06, 0.9, 2.6, s * 6.42, fb + 6.5, -7.2); k.rod(M.SD, [s * 5.5, fb + 3.2, -7.2], [s * 6.2, fb + 5.9, -7.2], 0.08, 4); }
    k.cbox(M.SD, 8.0, 0.22, 8.2, 0.05, 0, fb + 8.5, -11.5);
    for (const [y, w] of [[fb + 10, 2.8], [fb + 13.5, 2.0]]) { k.cbox(M.SD, w, 0.1, w, 0.03, 0, y, -5.5); }
    k.rod(M.SD, [-3.6, fb + 13.6, -5.5], [3.6, fb + 13.6, -5.5], 0.07, 5);
    for (const s of [-1, 1]) { k.at(s * 3.5, fb + 13.6, -5.5, 0, (q) => whip(q, 3.4, 0)); k.at(s * 2.4, fb + 13.66, -5.5, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.08)); k.at(s * 2.9, fb + 8.6, -9.4, 0, (q) => dome(q, M, 0.55, 0.4)); k.at(s * 3.2, fb + 8.6, -13.6, 0, (q) => whip(q, 4.5, 0.08)); k.at(s * 0.9, fb + 10.05, -5.5, 0, (q) => dome(q, M, 0.3, 0.2)); }
    k.at(0, fb + 8.6, -14.2, 0, (q) => searchlight(q, M, 0.8));
    // funnel fittings: steam pipes, ladder, grille
    k.rod(M.SD, [0.9, roofY, 9.4], [0.9, fb + 10.4, 10.15], 0.14, 6); k.rod(M.SD, [-0.9, roofY, 9.4], [-0.9, fb + 10.0, 10.1], 0.11, 6);
    for (const s of [-1, 1]) { k.cyl(M.BK, 0.4, 0.4, 0.5, s * 0.5, fb + 10.2, 7.5, 'y', 10); k.at(s * 4.0, roofY, 5 + s, 0, (q) => vent(q, M, 1.2, 0.3)); k.at(s * 3.0, fb, 26.2, 0, (q) => reel(q, M, 0.5, 0.9)); k.at(s * 5.2, fb, -19.5, HP, (q) => locker(q, M, 1.8, 0.8, 0.9)); }
  }
  const lz = (A ? -6.9 : -5.5) + 0.8;
  k.rod(M.SD, [0.8, mastTop + 0.1, lz], [0.8, mastTop + 1.9, lz], 0.03, 4); k.at(0.8, mastTop + 2.0, lz, 0, (q) => navlight(q, C.lampWhite, 0.08));
  // ---- hangar: roller door, roof gun platform, rails
  HG.on(k, AFT, 0, 0, (q) => { q.cbox(M.SD, 6.6, 3.7, 0.12, 0.05, 0, 1.85, 0.03); if (fine) for (let i = 0; i < 9; i++) q.box(M.SK, 6.3, 0.05, 0.03, 0, 0.3 + i * 0.4, 0.1); q.box(M.YL, 6.6, 0.12, 0.02, 0, 3.78, 0.09); });
  for (const s of [-1, 1]) HG.on(k, AFT, s * 4.0, 3.5, (q) => flood(q, 0.9));
  k.cyl(M.SD, 1.0, 1.1, 0.16, 0, hangarY + 0.08, 21, 'y', 14);
  rail(k, [[-4.1, hangarY, 14.5], [-4.1, hangarY, 23.4], [4.1, hangarY, 23.4], [4.1, hangarY, 14.5]], { mc: M.rail, post: 1.8 });
  k.at(-2.6, hangarY, 16.2, 0, (q) => dome(q, M, 0.7, 0.5)); k.at(2.6, hangarY, 16.4, 0, (q) => whip(q, 5.5, -0.08)); k.at(2.4, hangarY, 18.6, 0, (q) => locker(q, M, 1.2, 0.6, 0.7));
  // ---- flight deck: markings, nets, tie-down gear
  dk.add(MAT.helipad, new THREE.PlaneGeometry(9.4, 9.4), 0, fb + 0.03, 36.5, [-HP, 0, 0]);
  for (const s of [-1, 1]) dk.box(MAT.deckLine, 0.22, 0.02, 20, s * 4.4, fb + 0.02, 35.6);
  dk.box(MAT.deckLine, 9.0, 0.02, 0.22, 0, fb + 0.02, 25.6);
  for (const s of [-1, 1]) {
    net(k, M.rail, hull.edge(25, 46.6, 3.6, 0.05).map((p) => [s * p[0], p[1], p[2]]), [s, 0], 1.3);
    // ---- deck edge: rails, bitts, chocks, anchors
    const pts = hull.edge(-33.5, 24.6, 3, 0.2).map((p) => [s * p[0], p[1], p[2]]); pts.unshift([s * (half(-35) - 0.1), dY(-35) - 0.5, -35]);
    rail(k, pts, { mc: M.rail, post: 2 });
    for (const z of [-38, -22, 26, 44]) k.at(s * (half(z) - 0.7), dY(z), z, 0, (q) => bitts(q, 0.8));
    for (const z of [-36.5, -20, 0, 20, 45.4]) k.at(s * (half(z) - 0.16), dY(z), z, 0, (q) => chock(q, 0.8));
    k.frame(hull.wall(-41.5, fb + 0.75, s), (q) => anchor(q, 0.72));
    k.rod(C.iron, [s * 0.62, dY(-40.6) + 0.5, -40.6], [s * 1.9, dY(-42.6) + 0.12, -42.6], 0.06, 4);
    k.at(s * 2.2, -3.1, 41.5, 0, (q) => screw(q, S.HC, 1.15, 9));
  }
  net(k, M.rail, [[-(half(47.2) - 0.05), fb, 47.3], [half(47.2) - 0.05, fb, 47.3]], [0, 1], 1.2);
  // ---- foredeck: gun ring, missile cells, breakwater, windlass, hatches, jackstaff
  k.cyl(M.SD, 2.45, 2.65, 0.3, 0, dY(-27) + 0.1, -27, 'y', 20);
  k.at(0, fb + 0.02, -20.4, 0, (q) => vls(q, M, 2, 1));
  breakwater(k, M, dY(-34.2), -34.6, 3.6, 0.95);
  k.at(0, dY(-41), -41, 0, (q) => windlass(q, M, 0.7)); k.at(0, dY(-44), -44, 0, (q) => capstan(q, 0.7));
  k.at(2.6, dY(-31), -31, 0, (q) => hatch(q, M, 0.9)); k.at(-3.3, fb, -15.2 - 3.4, 0, (q) => hatch(q, M, 0.9));
  k.at(0, dY(-46.5) + 0.9, -46.6, 0, (q) => staff(q, 2.4, 0.2)); k.at(0, fb, 47.0, Math.PI, (q) => staff(q, 3.0, 0.15));
  if (!A) strake(k, hull, M.GM, fb - 1.4, -30, 45, 0.11, 3);
  // ---- markings
  const num = M.num(A ? 'K31' : '220');
  hullDecal(dk, num, 6.4, 3.2, hull, 2.45, -25, 1); hullDecal(dk, num, 6.4, 3.2, hull, 2.45, -25, -1);
  for (const e of [SB, PT]) dk.frame(HG.frame(e, 19, 2.3, 0.03), (q) => q.add(M.ins, new THREE.PlaneGeometry(2.4, 2.4)));

  // ---- weapons, sensors, walkable areas, crew stations
  mount(S, 'deckgun', 0, dY(-27) + 0.25, -27, 0, 2.4);
  mount(S, 'mg', 0, hangarY + 0.16, 21, Math.PI, 2.3);
  spin(S, radar(M, A ? 'panel' : 'mesh', A ? 3.4 : 3.8, A ? 1.5 : 1.3, fine), 0, mastTop + 0.12, A ? -6.9 : -5.5, 1.6);
  spin(S, radar(M, 'bar', 1.9, 0.4, fine), 0, A ? roofY + 3.0 : fb + 8.62, -11.6, 3.0);
  model.decks.push({ x0: -5.85, x1: 5.85, z0: -14, z1: 34, y: fb }, { x0: -5.0, x1: 5.0, z0: 34, z1: 47, y: fb }, ...bowDecks(hull, -14, -44.5, 4, 0.5), { x0: -4.0, x1: 4.0, z0: 14.6, z1: 23.3, y: hangarY });
  model.blocks.push(H1.block(), { ...HG.block(), y1: hangarY }, H2.block(), { x0: -1.8, x1: 1.8, z0: -9.4, z1: -3.6, y0: by, y1: mastTop }, { x0: -2.2, x1: 2.2, z0: 3, z1: 10.5, y0: roofY, y1: fb + 9.5 }, { x0: -3.5, x1: 3.5, z0: -21.8, z1: -19, y0: fb, y1: fb + 0.5 });
  if (H3) model.blocks.push(H3.block());
  model.posts.push({ x: 1.4, y: by, z: -12.4, yaw: 0, kind: 'bridge' }, { x: -1.4, y: by, z: -12.0, yaw: 0, kind: 'bridge' },
    { x: 5.3, y: fb, z: -20, yaw: -HP, kind: 'deck' }, { x: -5.3, y: fb, z: 2, yaw: HP, kind: 'deck' }, { x: 5.3, y: fb, z: 10, yaw: -HP, kind: 'deck' },
    { x: 0.8, y: fb, z: 45.5, yaw: Math.PI, kind: 'deck' }, { x: 4.0, y: fb, z: 29, yaw: HP, kind: 'flight' },
    { x: 0, y: dY(-37.6), z: -37.6, yaw: 0, kind: 'lookout' }, A ? { x: -4.6, y: dY(-30), z: -30, yaw: HP, kind: 'deck' } : { x: 5.6, y: fb + 6.08, z: -7.2, yaw: -HP, kind: 'lookout' });
  model.smoke.push(new THREE.Vector3(0, A ? fb + 9.1 : fb + 10.4, A ? 7.3 : 7.5));
  model.view = { bridge: new THREE.Vector3(0, A ? fb + 5.3 : fb + 7.5, A ? -12.6 : -13.4), chase: 110, chaseH: 28 };
  model.helipad = { pos: new THREE.Vector3(0, fb, 36.5), r: 5 };
  return finishShip(S);
}
