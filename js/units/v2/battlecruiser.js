// Battlecruiser (v2): heavy gun ship. Four triple 380 mm turrets (two forward, two aft, the inner pair superfiring on
// barbettes), two close-in guns, one missile launcher, eight machine-gun tubs along the deck edge, missile cells and
// canisters on the citadel, and a submarine dock at the stern: two pontoon arms with fenders, gangways down from the
// quarterdeck and a travelling gantry crane across them.
// Aethia: knuckled hull, sloped citadel, stepped tower with an enclosed mast and flat arrays, faceted funnels.
// Extro: smooth flared hull with an armour belt and scuttles, upright citadel, tower with open platforms, rangefinder and
// lattice mast, raked oval funnels with steam pipes, boat cranes.
// userData.model: the standard contract (turrets in the order heavy x4, ciws x2, sam, mg x8) plus
//   dock = { pos, yaw, exit } (where a docked submarine floats, and the point it leaves toward).
import * as THREE from 'three';
import { startShip, finishShip, spin, bowDecks, house, rail, breakwater, lattice4, radar, hullDecal, sstep, latheY, cached, fineDetail, C,
  door, porthole, ladder, stairs, hatch, liferaft, lifering, firebox, bitts, chock, capstan, windlass, anchor, whip, dome, searchlight, navlight, locker, staff, rhib, davit, crane, vls, canisters, decoys, screw, vent, flood,
  FWD, AFT, SB, PT } from './shipkit.js';
import { mount, proxy } from './turrets.js';

const HP = Math.PI / 2;
const FUNNELS = [-8, 12], TURRET_Z = [-78, -58, 58, 78];

export function buildBattlecruiser(nation, lod = 0) { const fine = fineDetail(); return cached(`battlecruiser:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

function make(nation, lod, fine) {
  const A = nation === 'aethia', L = 250, B = 30, D = 8.5, fb = 7.5;
  const S = startShip(nation, lod, fine, { L, B, D, fb, sheer: 3, sheerLen: 0.34, bowLen: 0.34, bowPow: 0.72, sternW: 0.8, sternLen: 0.16, knuckle: A ? 0.5 : 0, flareTop: A ? 1.3 : 1.22, tumble: A ? 0.955 : 0.985,
    wlBow: A ? 0.44 : 0.5, wlMid: A ? 0.95 : 0.94, bilge: 3.8, rake: 9, keelRise: 0.5, bulwark: (s) => 1.25 * sstep(0.13, 0.07, s), stations: 68 }, 1.8);
  const { M, k, dk, hull, model, HC } = S, dY = hull.deckY, half = hull.half, y1 = fb + 5, y2 = fb + 9;
  model.dims = { length: L, beam: B, height: A ? fb + 40.5 : fb + 43.5, draft: D };
  const tY = [dY(-78), dY(-58) + 4.2, fb + 4.2, fb];

  // ---- citadel, tower, funnels, after tower, barbettes, dock arms (both detail levels)
  const C1 = house(k, M.S, { z0: -44, z1: 44, w: 23, y0: fb, y1, slope: A ? 0.1 : 0.015, cf: A ? 2.4 : 1.2, ca: A ? 2.4 : 1.2, roof: M.D });
  const C2 = house(k, M.S, { z0: -40, z1: 26, w: 19, y0: y1, y1: y2, slope: A ? 0.12 : 0.015, cf: A ? 2 : 1, ca: A ? 2 : 1, roof: M.D });
  const blocks = [C1.block(), C2.block()];
  let T1, T2, T3 = null, AT, mastTop;
  if (A) {
    T1 = house(k, M.S, { z0: -38.6, z1: -21.4, w: 14, y0: y2, y1: y2 + 9, slope: 0.15, rakeF: 0.14, rakeA: 0.05, cf: 2.2, ca: 1.2 });
    T2 = house(k, M.S, { z0: -36.0, z1: -22.6, wf: 9.6, wa: 10.6, y0: y2 + 9, y1: y2 + 16, slope: 0.15, rakeF: 0.2, rakeA: 0.06, cf: 1.6, ca: 1 });
    T3 = house(k, M.S, { z0: -30.6, z1: -25.2, w: 5.2, y0: y2 + 16, y1: y2 + 28.8, slope: 0.135, rakeF: 0.16, rakeA: 0.06, cf: 1, ca: 1 }); mastTop = y2 + 28.8;
    for (const zf of FUNNELS) blocks.push(house(k, M.S, { z0: zf - 5.5, z1: zf + 5.5, w: 8, y0: y2, y1: y2 + 12, slope: 0.125, rakeF: 0.38, rakeA: 0.02, cf: 1.6, ca: 1.6 }).block());
    AT = house(k, M.S, { z0: 36, z1: 44, w: 11, y0: y1, y1: y1 + 8, slope: 0.16, rakeF: 0.05, rakeA: 0.3, cf: 1.4, ca: 1.6 });
  } else {
    T1 = house(k, M.S, { z0: -38.5, z1: -21.5, w: 14, y0: y2, y1: y2 + 8.2, slope: 0.02, cf: 1.6, ca: 0.8 });
    T2 = house(k, M.S, { z0: -36, z1: -24, w: 11, y0: y2 + 8.4, y1: y2 + 14.6, slope: 0.02, rakeF: -0.05, cf: 1.4, ca: 0.6 });
    T3 = house(k, M.S, { z0: -34, z1: -26, w: 8, y0: y2 + 14.8, y1: y2 + 19.8, slope: 0.03, rakeF: -0.08, cf: 1.2, ca: 0.5 });
    k.cbox(M.SD, 17, 0.3, 20, 0.08, 0, y2 + 8.25, -30); k.cbox(M.SD, 14, 0.3, 14, 0.08, 0, y2 + 14.65, -30);
    lattice4(k, M.SD, 0, -30, y2 + 19.8, y2 + 31, 4.2, 1.4, 5, 0.13); mastTop = y2 + 31; k.cbox(M.SD, 3.1, 0.2, 3.1, 0.05, 0, y2 + 31.05, -30);
    for (const zf of FUNNELS) {
      k.add(M.S, new THREE.CylinderGeometry(2.9, 3.7, 13, lod ? 8 : 24), 0, y2 + 6.5, zf, [0.1, 0, 0], [1, 1, 1.35]);
      k.add(M.BK, new THREE.CylinderGeometry(3.0, 3.0, 1.2, lod ? 8 : 24), 0, y2 + 13.2, zf + 0.67, [0.1, 0, 0], [1, 1, 1.35]);
      blocks.push({ x0: -3.7, x1: 3.7, z0: zf - 5, z1: zf + 5.6, y0: y2, y1: y2 + 13.5 });
    }
    AT = house(k, M.S, { z0: 36, z1: 44, w: 11, y0: y1, y1: y1 + 7, slope: 0.02, cf: 1, ca: 1 });
    house(k, M.S, { z0: 37.2, z1: 42.8, w: 7, y0: y1 + 7, y1: y1 + 10.5, slope: 0.03, cf: 0.8, ca: 0.8 });
  }
  blocks.push(T1.block(), T2.block(), T3.block(), { ...AT.block(), y1: y1 + 10 });
  k.add(M.SD, latheY([[5.6, 0], [5.6, 0.3], [5.35, 0.5], [5.3, 4.2]], lod ? 10 : 28), 0, dY(-58), -58); k.add(M.SD, latheY([[5.6, 0], [5.6, 0.3], [5.35, 0.5], [5.3, 4.2]], lod ? 10 : 28), 0, fb, 58);
  const ARM = [1, -1].map((s) => house(k, HC, { x: s * 9, z0: 123, z1: 172.5, w: 5, y0: -2.2, y1: 2.45, slope: 0, cf: 0, ca: 1.9, roof: M.D }));
  for (const s of [-1, 1]) for (const z of [147, 153]) k.box(M.SD, 1.0, 12.2, 1.0, s * 9.9, 8.55, z);
  k.box(M.SD, 22, 1.3, 1.1, 0, 14.5, 147); k.box(M.SD, 22, 1.3, 1.1, 0, 14.5, 153);
  if (lod) { TURRET_Z.forEach((z, i) => proxy(k, M, 'heavy', 0, tY[i], z, z < 0 ? 0 : Math.PI)); return finishShip(S); }

  // ---- tower: bridge windows, arrays or platforms, lights and aerials
  if (A) {
    T1.windows(k, M, FWD, 6.3, 7.4, 9, 0.5); T1.windows(k, M, SB, 6.3, 7.4, 8, 0.8); T1.windows(k, M, PT, 6.3, 7.4, 8, 0.8); T1.windows(k, M, 0, 6.3, 7.4, 2, 0.2); T1.windows(k, M, 6, 6.3, 7.4, 2, 0.2);
    T2.windows(k, M, FWD, 3.7, 4.7, 7, 0.4); T2.windows(k, M, SB, 3.7, 4.7, 6, 0.8); T2.windows(k, M, PT, 3.7, 4.7, 6, 0.8);
    for (const e of [FWD, SB, AFT, PT]) { const c = e === FWD || e === AFT ? 0 : -27.9; T3.on(k, e, c, 4.4, (q) => { q.cbox(M.SD, 2.7, 3.2, 0.08, 0.5, 0, 0, 0.01); q.cbox(M.SK, 2.4, 2.9, 0.16, 0.45, 0, 0, 0.04); }); T3.on(k, e, c, 9.6, (q) => q.cbox(M.SK, 1.2, 1.6, 0.12, 0.2, 0, 0, 0.04)); }
    k.cbox(M.SD, 2.6, 0.2, 2.8, 0.05, 0, mastTop + 0.08, -27.5);
    k.rod(M.SD, [-5.5, y2 + 23.5, -27.6], [5.5, y2 + 23.5, -27.6], 0.1, 5);
    for (const s of [-1, 1]) {
      k.at(s * 5.3, y2 + 23.5, -27.6, 0, (q) => whip(q, 4.5, 0)); k.at(s * 3.6, y2 + 23.6, -27.6, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.12));
      k.at(s * 3.6, y2 + 16, -27.2, 0, (q) => dome(q, M, 1.1, 0.7)); k.at(s * 3.7, y2 + 9, -24.4, 0, (q) => dome(q, M, 0.8, 0.6));
      k.at(s * 5.0, y2 + 9, -35.6, 0, (q) => searchlight(q, M, 1.2)); k.at(s * 2.6, y2 + 16, -34.2, 0, (q) => whip(q, 7, 0.1));
      T1.on(k, s > 0 ? SB : PT, -24.5, 0, (q) => door(q, M, 0.9, 2.0));
    }
    for (const zf of FUNNELS) { // funnel caps, uptakes and intake grilles
      k.cbox(M.BK, 4.4, 0.4, 6.4, 0.1, 0, y2 + 12.1, zf + 2.2);
      for (const z of [-0.2, 2.2, 4.6]) for (const s of [-1, 1]) { k.cyl(M.SD, 0.62, 0.7, 1.3, s * 0.95, y2 + 12.8, zf + z, 'y', 12); k.cyl(M.BK, 0.52, 0.52, 0.06, s * 0.95, y2 + 13.46, zf + z, 'y', 12); }
      for (const s of [-1, 1]) k.at(s * 3.6, y2 + 3.4, zf + 0.5, s * HP, (q) => { q.cbox(M.SK, 5.4, 2.4, 0.3, 0.06, 0, 0, 0); if (fine) for (let i = 0; i < 7; i++) q.box(M.SD, 5.2, 0.1, 0.34, 0, -0.9 + i * 0.3, 0); }, 0, -s * 0.125);
    }
    AT.windows(k, M, AFT, 5.4, 6.3, 6, 0.5); AT.windows(k, M, SB, 5.4, 6.3, 3, 0.9); AT.windows(k, M, PT, 5.4, 6.3, 3, 0.9);
  } else {
    T1.windows(k, M, FWD, 5.6, 6.7, 9, 0.6); T1.windows(k, M, SB, 5.6, 6.7, 9, 0.8); T1.windows(k, M, PT, 5.6, 6.7, 9, 0.8);
    T2.windows(k, M, FWD, 3.6, 4.6, 7, 0.5); T2.windows(k, M, SB, 3.6, 4.6, 6, 0.7); T2.windows(k, M, PT, 3.6, 4.6, 6, 0.7);
    T3.windows(k, M, FWD, 2.9, 3.8, 5, 0.4); T3.windows(k, M, SB, 2.9, 3.8, 4, 0.5); T3.windows(k, M, PT, 2.9, 3.8, 4, 0.5);
    rail(k, [[-8.4, y2 + 8.4, -39.8], [8.4, y2 + 8.4, -39.8], [8.4, y2 + 8.4, -20.2], [-8.4, y2 + 8.4, -20.2], [-8.4, y2 + 8.4, -39.8]], { mc: M.rail, post: 2.2 });
    rail(k, [[-6.9, y2 + 14.8, -36.9], [6.9, y2 + 14.8, -36.9], [6.9, y2 + 14.8, -23.1], [-6.9, y2 + 14.8, -23.1], [-6.9, y2 + 14.8, -36.9]], { mc: M.rail, post: 2.2 });
    k.cyl(M.S, 0.75, 0.75, 18.4, 0, y2 + 20.6, -30, 'x', 14); k.cbox(M.S, 3.2, 1.8, 3.2, 0.2, 0, y2 + 20.6, -30);
    for (const s of [-1, 1]) {
      k.cbox(M.S, 1.4, 1.5, 1.7, 0.15, s * 9.2, y2 + 20.6, -30); k.cyl(M.G, 0.4, 0.4, 0.05, s * 9.3, y2 + 20.6, -30.88, 'z', 12);
      k.at(s * 7.6, y2 + 8.4, -38.2, 0, (q) => searchlight(q, M, 1.4)); k.at(s * 6.0, y2 + 14.8, -24.2, Math.PI, (q) => searchlight(q, M, 1.1));
      k.at(s * 2.7, y2 + 19.8, -27.5, 0, (q) => dome(q, M, 1.0, 0.6)); k.at(s * 3.0, y2 + 19.8, -32.8, 0, (q) => whip(q, 7, 0.1));
      for (const [y, w] of [[y2 + 24, 3.8], [y2 + 28, 2.4]]) k.cbox(M.SD, w, 0.12, w, 0.03, 0, y, -30);
      k.at(s * 4.9, y2 + 27, -30, 0, (q) => whip(q, 4.5, 0)); k.at(s * 3.4, y2 + 27.1, -30, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.12));
      T1.on(k, s > 0 ? SB : PT, -24, 0, (q) => door(q, M, 0.9, 2.0)); T2.on(k, s > 0 ? SB : PT, -26, 0, (q) => door(q, M)); T2.on(k, s > 0 ? SB : PT, -33, 0.3, (q) => ladder(q, M.rail, 5.8));
      for (const z of [22, 30]) k.at(s * 10.6, y1, z, s > 0 ? -2.2 : 2.2, (q) => crane(q, M, 5.5, 9, 0.35));   // boat cranes
    }
    k.rod(M.SD, [-5, y2 + 27, -30], [5, y2 + 27, -30], 0.1, 5);
    for (const zf of FUNNELS) { // steam pipes, sirens, ladders, searchlight platform
      k.rod(M.SD, [1.6, y2, zf + 5.4], [1.6, y2 + 13.8, zf + 6.75], 0.22, 6); k.rod(M.SD, [-1.6, y2, zf + 5.4], [-1.6, y2 + 13, zf + 6.65], 0.18, 6);
      for (const s of [-1, 1]) { k.cyl(M.BK, 0.7, 0.7, 0.6, s * 1.1, y2 + 13.9, zf + 0.9, 'y', 12); k.cyl(M.SD, 3.55, 3.55, 0.16, 0, y2 + 4 + s * 3, zf + 0.4 + s * 0.3, 'y', 24, true); }
      k.cbox(M.SD, 9, 0.2, 2.4, 0.05, 0, y2 + 5, zf - 4.6); for (const s of [-1, 1]) k.at(s * 3.6, y2 + 5.1, zf - 4.8, 0, (q) => searchlight(q, M, 1.2));
      rail(k, [[-4.4, y2 + 5.1, zf - 3.5], [-4.4, y2 + 5.1, zf - 5.7], [4.4, y2 + 5.1, zf - 5.7], [4.4, y2 + 5.1, zf - 3.5]], { mc: M.rail, post: 1.5 });
    }
    AT.windows(k, M, AFT, 4.6, 5.5, 6, 0.6); AT.windows(k, M, SB, 4.6, 5.5, 4, 0.8); AT.windows(k, M, PT, 4.6, 5.5, 4, 0.8);
    rail(k, [[-5.3, y1 + 7, 36.3], [-5.3, y1 + 7, 43.7], [5.3, y1 + 7, 43.7], [5.3, y1 + 7, 36.3], [-5.3, y1 + 7, 36.3]], { mc: M.rail, post: 1.8 });
    // armour belt and scuttles along the hull
    for (const s of [-1, 1]) { for (let z = -68; z <= 84; z += 4) k.frame(hull.wall(z, 1.7, s), (q) => q.box(HC, 4.06, 3.6, 0.5, 0, 0, -0.08)); for (let z = -92; z <= 104; z += 4) if (z < -72 || z > 88) k.frame(hull.wall(z, 5.2, s), (q) => porthole(q, M, 0.22)); }
  }
  const lz = (A ? -27.5 : -30) + 1.1; k.rod(M.SD, [1.1, mastTop, lz], [1.1, mastTop + 3, lz], 0.05, 4); k.at(1.1, mastTop + 3.1, lz, 0, (q) => navlight(q, C.lampWhite, 0.12));
  // ---- citadel sides and roofs
  for (const s of [-1, 1]) {
    const e = s > 0 ? SB : PT;
    for (const z of [-38, -24, -6, 10, 26, 40]) C1.on(k, e, z, 0, (q) => door(q, M, 0.9, 2.0));
    for (const z of [-31, 2, 33]) C1.on(k, e, z, 1.5, (q) => firebox(q)); for (const z of [-15, 18]) C1.on(k, e, z, 1.9, (q) => lifering(q));
    if (fine) { for (let z = -36; z <= 22; z += 4) C2.on(k, e, z, 2.3, (q) => porthole(q, M, 0.24)); for (let z = -41; z <= 41; z += 8.2) C1.on(k, e, z, 4.2, (q) => flood(q, 0.8)); }
    for (const z of [-30, 12]) C2.on(k, e, z, 0, (q) => door(q, M));
    C1.on(k, e, 34.2, 0, (q) => ladder(q, M.rail, 5));
    for (let z = -34; z <= 22; z += 7) if (Math.abs(z - 2) > 4) k.at(s * 10.25, y1, z, 0, (q) => liferaft(q, 1.5, 0.4));
    rail(k, [[s * 9.5, y1, -43.3], [s * 10.85, y1, -42.2], [s * 10.85, y1, 42.2], [s * 9.4, y1, 43.3], [s * 6, y1, 43.6]], { mc: M.rail, post: 2.6 });
    rail(k, [[s * 7.2, y2, -39.4], [s * 8.85, y2, -38], [s * 8.85, y2, 24.2], [s * 7.4, y2, 25.5], [0, y2, 25.5]], { mc: M.rail, post: 2.8 });
    // close-in gun towers, boats and davits, canisters, decoys, vents
    if (A) house(k, M.S, { x: s * 10.4, z0: 0.4, z1: 3.6, w: 2.6, y0: y1, y1: y1 + 4, slope: 0.06, cf: 0.5, ca: 0.5 }); else k.cyl(M.SD, 1.2, 1.5, 4, s * 10.4, y1 + 2, 2, 'y', 12);
    k.at(s * 8.2, y1, 39.8, 0, (q) => rhib(q, M, 8.4, 2.9)); for (const z of [36.8, 42.8]) k.at(s * 10.3, y1, z, s > 0 ? Math.PI : 0, (q) => davit(q, M, 3.6, 1.9));
    k.at(s * 5.7, y2, 2, s * HP, (q) => canisters(q, M, 4, 5.4, 0.42, 0.4));
    k.at(s * 7.6, y2, -18.5, -s * 0.9, (q) => decoys(q, M)); k.at(s * 7.6, y2, 9, -s * 2.2, (q) => decoys(q, M));
    for (const z of [-17, 20]) k.at(s * 6.4, y2, z, 0, (q) => vent(q, M, 1.9, 0.6));
    // main deck: machine-gun tubs, bitts, chocks, hatches, anchors, rails
    for (const z of [-46, -16, 16, 46]) {
      k.cyl(M.SD, 1.15, 1.25, 0.25, s * 13.6, fb + 0.1, z, 'y', 14); k.at(s * 12.7, fb, z + 2.3, HP, (q) => locker(q, M, 1.3, 0.7, 0.75));
      k.add(M.S, new THREE.LatheGeometry([[1.27, 0], [1.27, 0.95], [1.19, 0.95], [1.19, 0]].map((p) => new THREE.Vector2(p[0], p[1])), 12, s > 0 ? 0.25 : Math.PI + 0.25, Math.PI - 0.5), s * 13.6, fb + 0.1, z);
    }
    for (const z of [-104, -70, -48, 50, 70, 100, 120]) k.at(s * (half(z) - 1.0), dY(z), z, 0, (q) => bitts(q, 1.4));
    for (const z of [-100, -64, -30, 0, 30, 64, 96, 118]) k.at(s * (half(z) - 0.25), dY(z), z, 0, (q) => chock(q, 1.3));
    k.frame(hull.wall(-112, fb + 1.4, s), (q) => anchor(q, 1.45));
    k.at(s * 3.2, dY(-106), -106, 0, (q) => windlass(q, M, 1.1)); k.rod(C.iron, [s * 3.2, dY(-107) + 0.6, -106.6], [s * 4.6, dY(-111) + 0.2, -111.3], 0.12, 5);
    const pts = hull.edge(-99, 124.6, 5, 0.25).map((p) => [s * p[0], p[1], p[2]]); pts.unshift([s * (half(-101.5) - 0.15), dY(-101.5) - 0.6, -101.5]);
    rail(k, pts, { mc: M.rail, post: 2.5, h: 1.1 });
    rail(k, [[s * (half(124.7) - 0.25), fb, 124.7], [s * 10.2, fb, 124.7]], { mc: M.rail, post: 2 }); rail(k, [[s * 7.8, fb, 124.7], [0, fb, 124.7]], { mc: M.rail, post: 2.2 });
    for (const x of [6, 11.5]) k.at(s * x, -6.6, 112, 0, (q) => screw(q, HC, 2.3, 20));
    // ---- dock arm: gangway, fenders, bitts, rails, crane legs, lights
    const arm = ARM[s > 0 ? 0 : 1];
    k.at(s * 9, 2.45, 131.4, 0, (q) => stairs(q, M, 5.05, 6.6, 1.3));
    for (let z = 129; z <= 169; z += 5) { k.cyl(C.black, 0.5, 0.5, 1.9, s * 6.3, 0.95, z, 'y', 10); k.rod(C.gun, [s * 6.45, 1.9, z], [s * 6.7, 2.5, z], 0.03, 3); }
    rail(k, [[s * 11.3, 2.45, 132.5], [s * 11.3, 2.45, 170.4], [s * 9.6, 2.45, 172.2]], { mc: M.rail, post: 2.4 }); rail(k, [[s * 11.3, 2.45, 123.6], [s * 11.3, 2.45, 130.2]], { mc: M.rail, post: 2.2 });
    for (const z of [136, 144, 158, 167]) k.at(s * 7.2, 2.45, z, 0, (q) => bitts(q, 0.7));
    for (const z of [147, 153]) { k.rod(M.SD, [s * 9.9, 3, z], [s * 7.2, 13.8, z], 0.16, 5); if (fine) for (let y = 4.5; y < 14; y += 2.4) k.box(M.YL, 1.04, 0.5, 1.04, s * 9.9, y, z); }
    k.at(s * 10.42, 2.5, 147, s * HP, (q) => ladder(q, M.rail, 11.4, 0.5));
    k.rod(M.SD, [s * 9.9, 9, 147], [s * 9.9, 9, 153], 0.14, 4); k.rod(M.SD, [s * 9.9, 3.2, 147], [s * 9.9, 9, 153], 0.1, 4); k.rod(M.SD, [s * 9.9, 3.2, 153], [s * 9.9, 9, 147], 0.1, 4);
    k.box(M.SD, 1.0, 1.1, 7.2, s * 10.4, 14.5, 150); for (const z of [146.3, 153.7]) k.at(s * 8.4, 13.9, z, 0, (q) => flood(q, 1.8), HP);
    k.rod(M.SD, [s * 9, 2.45, 171.6], [s * 9, 5.8, 171.6], 0.08, 5); k.at(s * 9, 5.95, 171.6, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.22));
    k.at(s * 10.4, 2.45, 126.3, 0, (q) => locker(q, M, 1.4, 1.0, 2.2)); k.at(s * 9.4, 2.45, 163, 0, (q) => capstan(q, 0.9));
    if (fine) for (let z = 126; z <= 170; z += 4) k.box(C.yellow, 0.14, 0.02, 2.0, s * 6.75, 2.47, z);
  }
  // gantry crane: girders with walkway, trolley, hoist and spreader beam over the berth
  for (const z of [147, 153]) { rail(k, [[-10.8, 15.15, z], [10.8, 15.15, z]], { mc: M.rail, post: 2.4, h: 0.9, bars: 1 }); if (fine) for (let x = -9; x <= 9; x += 3) k.rod(M.SD, [x, 13.9, z], [x + 1.5, 15.1, z], 0.07, 3); }
  k.cbox(C.yellow, 3.4, 1.3, 6.4, 0.1, 0, 14.0, 150); k.cbox(M.SK, 2.2, 0.9, 2.2, 0.08, 0, 15.0, 150); k.cyl(M.SK, 0.55, 0.55, 2.4, 0, 14.1, 150, 'x', 12);
  for (const x of [-0.7, 0.7]) for (const z of [149.4, 150.6]) k.rod(C.gun, [x, 13.4, z], [x * 0.6, 7.6, 150], 0.035, 3);
  k.cbox(C.yellow, 1.6, 0.9, 1.0, 0.08, 0, 7.2, 150); k.cbox(M.SD, 13.6, 0.4, 0.6, 0.06, 0, 6.6, 150);
  for (const x of [-6.4, -3.2, 3.2, 6.4]) { k.rod(C.gun, [x, 6.4, 150], [x, 5.2, 150], 0.03, 3); k.torus(C.yellow, 0.16, 0.04, x, 5.05, 150, [0, HP, 0], 8); }
  // ---- foredeck and quarterdeck
  breakwater(k, M, dY(-96), -97.5, 9, 1.3);
  k.at(0, dY(-113), -113, 0, (q) => capstan(q, 1.4)); k.at(0, dY(-121.5) + 1.2, -121.8, 0, (q) => staff(q, 4, 0.2)); k.at(0, fb, 124.2, Math.PI, (q) => staff(q, 4.6, 0.15));
  for (const [x, z] of [[7.5, -90], [-7, -68], [7.5, -47.5], [-7, 68], [7.5, 92], [-7, 108], [6, 116]]) k.at(x, dY(z), z, 0, (q) => hatch(q, M, 1.5));
  k.at(0, y2, 21.6, 0, (q) => vls(q, M, 3, 1));
  k.cyl(M.SD, 2.2, 2.45, 0.6, 0, y1 + 0.3, 31, 'y', 18);
  // ---- markings
  const num = M.num(A ? 'B07' : '900');
  hullDecal(dk, num, 12, 6, hull, 3.9, -52, 1); hullDecal(dk, num, 12, 6, hull, 3.9, -52, -1);
  for (const e of [SB, PT]) dk.frame(T1.frame(e, -30, A ? 3.2 : 3.0, 0.04), (q) => q.add(M.ins, new THREE.PlaneGeometry(4.2, 4.2)));

  // ---- weapons. Order: heavy x4, ciws x2, sam, mg x8
  TURRET_Z.forEach((z, i) => { const t = mount(S, 'heavy', 0, tY[i], z, z < 0 ? 0 : Math.PI, 2.5); if (i === 1 || i === 2) { const d = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), M.ins); d.rotation.x = -HP; d.position.set(0, 4.55, -1.4); d.renderOrder = 2; t.node.add(d); } });
  for (const s of [1, -1]) mount(S, 'ciws', s * 10.4, y1 + 4, 2, -s * HP, 2.6);
  mount(S, 'sam', 0, y1 + 0.6, 31, Math.PI, Math.PI);
  for (const s of [1, -1]) for (const z of [-46, -16, 16, 46]) mount(S, 'mg', s * 13.6, fb + 0.25, z, -s * HP, 1.6);
  spin(S, radar(M, A ? 'twin' : 'mesh', A ? 6.6 : 8, A ? 2.2 : 2.6, fine), 0, mastTop + 0.2, A ? -27.5 : -30, 1.1);
  spin(S, radar(M, A ? 'panel' : 'mesh', A ? 4.6 : 5, 1.5, fine), 0, A ? y1 + 8 : y1 + 10.5, A ? 39.4 : 40, 1.7);
  spin(S, radar(M, 'bar', 2.8, 0.6, fine), 0, A ? y2 + 16 : y2 + 19.8, A ? -33.2 : -32.6, 3.0);
  // ---- walkable areas, obstacles, crew stations
  model.decks.push({ x0: -14.2, x1: 14.2, z0: -44, z1: 95, y: fb }, { x0: -12, x1: 12, z0: 95, z1: 124.5, y: fb }, ...bowDecks(hull, -44, -114, 5, 0.9),
    { x0: 6.5, x1: 11.5, z0: 124.5, z1: 171, y: 2.5 }, { x0: -11.5, x1: -6.5, z0: 124.5, z1: 171, y: 2.5 });
  if (!A) model.decks.push({ x0: -8.3, x1: 8.3, z0: -39.7, z1: -20.3, y: y2 + 8.4 }, { x0: -6.8, x1: 6.8, z0: -36.8, z1: -23.2, y: y2 + 14.8 });
  model.blocks.push(...blocks, { x0: -5.6, x1: 5.6, z0: -63.6, z1: -52.4, y0: fb, y1: fb + 5.5 }, { x0: -5.6, x1: 5.6, z0: 52.4, z1: 63.6, y0: fb, y1: fb + 5 });
  if (A) model.posts.push({ x: 3, y: y2 + 5.2, z: -34, yaw: 0, kind: 'bridge' }, { x: -3, y: y2 + 5.2, z: -34, yaw: 0, kind: 'bridge' }, { x: 0, y: y2 + 5.2, z: -31, yaw: 0, kind: 'bridge' }, { x: 2, y: y2 + 12, z: -32, yaw: 0, kind: 'bridge' });
  else model.posts.push({ x: 7.6, y: y2 + 8.4, z: -30, yaw: -HP, kind: 'bridge' }, { x: -7.6, y: y2 + 8.4, z: -30, yaw: HP, kind: 'bridge' }, { x: 0, y: y2 + 8.4, z: -39, yaw: 0, kind: 'bridge' }, { x: 6.2, y: y2 + 14.8, z: -34, yaw: -HP, kind: 'bridge' });
  model.posts.push({ x: 13.2, y: fb, z: -30, yaw: -HP, kind: 'deck' }, { x: -13.2, y: fb, z: -30, yaw: HP, kind: 'deck' }, { x: 13.2, y: fb, z: 0, yaw: -HP, kind: 'deck' }, { x: -13.2, y: fb, z: 2, yaw: HP, kind: 'deck' },
    { x: 13.2, y: fb, z: 30, yaw: -HP, kind: 'deck' }, { x: -13.2, y: fb, z: 32, yaw: HP, kind: 'deck' }, { x: 4.5, y: fb, z: 112, yaw: Math.PI, kind: 'deck' }, { x: -5, y: fb, z: 100, yaw: Math.PI, kind: 'deck' },
    { x: 9, y: 2.5, z: 140, yaw: HP, kind: 'deck' }, { x: -9, y: 2.5, z: 158, yaw: -HP, kind: 'deck' }, { x: 2, y: dY(-101), z: -101, yaw: 0, kind: 'lookout' }, { x: -8, y: dY(-49), z: -49, yaw: 0.3, kind: 'lookout' });
  for (const zf of FUNNELS) model.smoke.push(new THREE.Vector3(0, A ? y2 + 13.6 : y2 + 14.2, zf + (A ? 2.2 : 0.8)));
  model.view = { bridge: new THREE.Vector3(0, y2 + (A ? 6.9 : 6.2), A ? -35.2 : -36.8), chase: 260, chaseH: 60 };
  model.dock = { pos: new THREE.Vector3(0, 0, L / 2 + 24), yaw: 0, exit: new THREE.Vector3(0, 0, L / 2 + 90) };
  return finishShip(S);
}
