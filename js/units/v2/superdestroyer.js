// Super Destroyer (v2): the largest warship in the game. Twelve triple 380 mm turrets (two superfiring pairs on the
// centre line, eight in the wings), ten missile launchers and eight close-in guns along the citadel, a helipad aft, hull
// sonar, a walk-in interior (js/units/v2/sdinterior.js) and a dock under the waterline for one attack submarine, which
// comes and goes through two doors in the transom.
// Aethia: knuckled hull, sloped citadel, enclosed mast with flat arrays, faceted funnels.
// Extro: smooth flared hull with an armour belt, upright citadel, lattice mast, raked oval funnels.
// userData.model: the standard contract (turrets in the order heavy x12, sam x10, ciws x8) plus
//   dock = { pos, yaw, exit, under: true, depth, only } (where the docked submarine floats, under water),
//   dockDoors [Group, Group] (turned by the ship as a submarine comes or goes), helipads [{ pos, r }],
//   interior { group, mats, zones, hole, bay } (see sdinterior.js).
import * as THREE from 'three';
import { startShip, finishShip, spin, bowDecks, house, rail, breakwater, lattice4, radar, hullDecal, sstep, latheY, cached, fineDetail, C, ShipKit,
  door, porthole, ladder, hatch, liferaft, lifering, firebox, bitts, chock, capstan, windlass, anchor, whip, dome, searchlight, navlight, locker, staff, rhib, davit, crane, vls, canisters, decoys, screw, vent, flood,
  FWD, AFT, SB, PT } from './shipkit.js';
import { mount, proxy } from './turrets.js';
import { buildInterior, PLAN, minus, minusAll } from './sdinterior.js';

const HP = Math.PI / 2, V3 = THREE.Vector3;
const FUNNELS = [-8, 18], WING_Z = [-66, -28, 10, 48], SAM_Z = [-66, -40, -14, 12, 38], CIWS_Z = [-53, -27, -1, 25];
let GLASS = null, MOUTH = null;

export function buildSuperDestroyer(nation, lod = 0) { const fine = fineDetail(); return cached(`superdestroyer:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

// the main deck as strips between stations, following the sheer, with rectangular openings left in it
function deckGeo(hull, L, holes) {
  const list = []; for (let z = -L / 2 + 0.3; z < L / 2; z += z < -L * 0.16 ? 3 : 8) list.push(z); list.push(L / 2);
  for (const h of holes) list.push(h.z0, h.z1);
  const Z = [...new Set(list.map((z) => +z.toFixed(3)))].sort((a, b) => a - b), pos = [], idx = []; let n = 0;
  for (let i = 0; i < Z.length - 1; i++) {
    const za = Z[i], zb = Z[i + 1], ha = hull.half(za), hb = hull.half(zb), ya = hull.deckY(za), yb = hull.deckY(zb), mid = (za + zb) / 2;
    const cuts = holes.filter((h) => mid > h.z0 && mid < h.z1).sort((p, q) => p.x0 - q.x0), segs = []; let from = null;
    for (const h of cuts) { segs.push([from, h.x0]); from = h.x1; } segs.push([from, null]);
    for (const [a, b] of segs) {
      pos.push(a ?? -ha, ya, za, b ?? ha, ya, za, a ?? -hb, yb, zb, b ?? hb, yb, zb);
      idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); n += 4;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the flat roof of a deckhouse with rectangular openings left in it
function roofGeo(k, mc, H, holes) {
  const sh = new THREE.Shape(H.top.map((p) => new THREE.Vector2(p[0], -p[1])));
  for (const h of holes) sh.holes.push(new THREE.Path([[h.x0, -h.z0], [h.x1, -h.z0], [h.x1, -h.z1], [h.x0, -h.z1]].map((p) => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-HP); g.translate(0, H.y1, 0); g.deleteAttribute('uv');
  const flat = g.toNonIndexed(); flat.computeVertexNormals(); k.add(mc, flat);
}

function make(nation, lod, fine) {
  const A = nation === 'aethia', L = 360, B = 52, D = 16, fb = 12, P = PLAN;
  const S = startShip(nation, lod, fine, { L, B, D, fb, sheer: 4, sheerLen: 0.3, bowLen: 0.34, bowPow: 0.72, sternW: 0.82, sternLen: 0.16, knuckle: A ? 0.5 : 0, flareTop: A ? 1.26 : 1.2, tumble: A ? 0.96 : 0.985,
    wlBow: A ? 0.44 : 0.5, wlMid: 0.95, bilge: 3.8, rake: 12, keelRise: 0.1, bulwark: (s) => 1.3 * sstep(0.12, 0.06, s), stations: 76 }, 2.4);
  const { M, k, dk, hull, model, HC } = S, dY = hull.deckY, half = hull.half, y1 = fb + 5, y2 = fb + 10, yBr = P.yBridge, yTop = P.bridgeTop;
  model.dims = { length: L, beam: B, height: fb + (A ? 53 : 56), draft: D };
  const SH = P.shaft, HT = P.hatch, shaftHole = { x0: SH.x0 - 0.15, x1: SH.x1 + 0.15, z0: SH.z0 - 0.15, z1: SH.z1 + 0.15 };
  const tA = [0, dY(-122), -122], tB = [0, dY(-100) + 4.2, -100], tX = [0, fb + 4.2, 78], tY = [0, fb, 100], wx = 18.4;
  const HEAVY = [[...tA, 0, 2.5], [...tB, 0, 2.5], [...tX, Math.PI, 2.5], [...tY, Math.PI, 2.5]];
  for (const z of WING_Z) for (const s of [1, -1]) HEAVY.push([s * wx, fb, z, -s * HP, 1.45]);

  // ---- main deck with its openings (the stair tower and the helipad hatchway)
  if (!lod) { k.buckets.get(M.D.m).pop(); k.add(M.D, deckGeo(hull, L, [shaftHole, HT])); }

  // ---- citadel (two levels), tower base, wheelhouse, funnels, after tower, barbettes (both detail levels)
  const C1 = house(k, M.S, { z0: -74, z1: 62, w: 23, y0: fb, y1, slope: A ? 0.1 : 0.015, cf: A ? 2.4 : 1.2, ca: A ? 2.4 : 1.2, roof: M.D, noRoof: !lod });
  const C2 = house(k, M.S, { z0: -70, z1: 58, w: 13.4, y0: y1, y1: y2, slope: A ? 0.1 : 0.015, cf: A ? 1.6 : 0.8, ca: A ? 1.6 : 0.8, roof: M.D, noRoof: !lod });
  const T0 = house(k, M.S, { z0: -63, z1: -40.2, w: A ? 12.4 : 13.2, y0: y2, y1: yBr, slope: 0, cf: 0.6, ca: 0.6, noRoof: true });
  const WH = { x0: -7.3, x1: 7.3, z0: -62.6, z1: -40.4 };                                       // the wheelhouse footprint (bridge forward, stair tower aft)
  const blocks = [...minus(C1.block(), shaftHole), ...minus(C2.block(), shaftHole), ...minus(T0.block(), shaftHole)];
  blocks.push(...minusAll([{ ...WH, y0: yBr, y1: yTop + 0.3 }], [P.bridge, shaftHole]));
  let mastTop;
  if (A) {
    const T3 = house(k, M.S, { z0: -49, z1: -42.5, w: 5.6, y0: yTop + 0.3, y1: yTop + 15, slope: 0.12, rakeF: 0.16, rakeA: 0.06, cf: 1, ca: 1 }); mastTop = yTop + 15;
    if (!lod) for (const e of [FWD, SB, AFT, PT]) { const c = e === FWD || e === AFT ? 0 : -45.7; T3.on(k, e, c, 5, (q) => { q.cbox(M.SD, 3.0, 3.6, 0.08, 0.5, 0, 0, 0.01); q.cbox(M.SK, 2.7, 3.3, 0.16, 0.45, 0, 0, 0.04); }); T3.on(k, e, c, 10.6, (q) => q.cbox(M.SK, 1.3, 1.8, 0.12, 0.2, 0, 0, 0.04)); }
    for (const zf of FUNNELS) blocks.push(house(k, M.S, { z0: zf - 6.5, z1: zf + 6.5, w: 9, y0: y2, y1: y2 + 14, slope: 0.12, rakeF: 0.36, rakeA: 0.02, cf: 1.8, ca: 1.8 }).block());
  } else {
    lattice4(k, M.SD, 0, -45.8, yTop + 0.3, yTop + 17, 4.6, 1.5, 6, 0.14); mastTop = yTop + 17; k.cbox(M.SD, 3.3, 0.2, 3.3, 0.05, 0, mastTop + 0.05, -45.8);
    for (const zf of FUNNELS) {
      k.add(M.S, new THREE.CylinderGeometry(3.3, 4.2, 15, lod ? 8 : 24), 0, y2 + 7.5, zf, [0.1, 0, 0], [1, 1, 1.35]);
      k.add(M.BK, new THREE.CylinderGeometry(3.4, 3.4, 1.3, lod ? 8 : 24), 0, y2 + 15.2, zf + 0.78, [0.1, 0, 0], [1, 1, 1.35]);
      blocks.push({ x0: -4.2, x1: 4.2, z0: zf - 5.7, z1: zf + 6.3, y0: y2, y1: y2 + 15.5 });
    }
  }
  const AT = house(k, M.S, { z0: 40, z1: 52, w: 11, y0: y2, y1: y2 + 8, slope: A ? 0.14 : 0.02, rakeF: 0.05, rakeA: A ? 0.3 : 0.02, cf: 1.4, ca: 1.6 }); blocks.push(AT.block());
  for (const [x, y, z] of [[0, dY(-100), -100], [0, fb, 78]]) k.add(M.SD, latheY([[5.6, 0], [5.6, 0.3], [5.35, 0.5], [5.3, 4.2]], lod ? 10 : 28), x, y, z);
  if (lod) {
    house(k, M.S, { z0: WH.z0, z1: WH.z1, w: 14.6, y0: yBr, y1: yTop + 0.3, slope: 0, cf: 0.5, ca: 0.5 });
    for (const [x, y, z, rest] of HEAVY) proxy(k, M, 'heavy', x, y, z, rest);
    return finishShip(S);
  }
  roofGeo(k, M.D, C1, [shaftHole]); roofGeo(k, M.D, C2, [shaftHole]);

  // ---- wheelhouse: a real room with glass all round the forward part (the bridge), the stair tower in the after part
  if (!GLASS) { GLASS = new THREE.MeshStandardMaterial({ color: 0x86b3ab, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }); GLASS.name = 'sdGlass.insignia'; }
  for (const r of minusAll([{ ...WH }], [shaftHole])) k.box(M.D, r.x1 - r.x0, 0.24, r.z1 - r.z0, (r.x0 + r.x1) / 2, yBr - 0.12, (r.z0 + r.z1) / 2);
  k.cbox(M.S, 15.6, 0.36, 23.4, 0.1, 0, yTop + 0.18, -51.3); k.box(M.D, 14.8, 0.04, 22.6, 0, yTop + 0.37, -51.3);                       // roof with a brow
  const BZ = P.bridge.z1;   // the bulkhead between the bridge and the stair tower
  const winWall = (axis, c, a0, a1) => { // sill, lintel, posts and one long pane
    const len = a1 - a0, mid = (a0 + a1) / 2, n = Math.max(2, Math.round(len / 1.9));
    const put = (mc, hgt, yc, th) => (axis === 'x' ? k.box(mc, len, hgt, th, mid, yc, c) : k.box(mc, th, hgt, len, c, yc, mid));
    put(M.S, 1.05, yBr + 0.525, 0.3); put(M.S, yTop - yBr - 2.55, (yBr + 2.55 + yTop) / 2, 0.3);
    for (let i = 0; i <= n; i++) { const a = a0 + (len * i) / n; if (axis === 'x') k.box(M.SD, 0.14, 1.5, 0.3, a, yBr + 1.8, c); else k.box(M.SD, 0.3, 1.5, 0.14, c, yBr + 1.8, a); }
    if (axis === 'x') k.box(GLASS, len, 1.5, 0.04, mid, yBr + 1.8, c); else k.box(GLASS, 0.04, 1.5, len, c, yBr + 1.8, mid);
  };
  winWall('x', WH.z0 + 0.15, WH.x0, WH.x1); for (const s of [-1, 1]) winWall('z', s * (WH.x1 - 0.15), WH.z0 + 0.3, BZ);
  for (const s of [-1, 1]) {
    k.box(M.S, 0.3, yTop - yBr, WH.z1 - BZ, s * (WH.x1 - 0.15), (yBr + yTop) / 2, (BZ + WH.z1) / 2);                                  // solid sides of the after part
    k.box(M.S, WH.x1 - SH.x1, yTop - yBr, 0.24, s * (WH.x1 + SH.x1) / 2, (yBr + yTop) / 2, BZ);                           // bulkhead either side of the tower door
  }
  k.box(M.S, WH.x1 - WH.x0, yTop - yBr, 0.3, 0, (yBr + yTop) / 2, WH.z1 - 0.15);
  // mast top: lights and aerials
  const mz = A ? -45.7 : -45.8;
  k.rod(M.SD, [-6, mastTop - 5, mz], [6, mastTop - 5, mz], 0.11, 5); k.rod(M.SD, [1.1, mastTop, mz + 1.1], [1.1, mastTop + 3.4, mz + 1.1], 0.05, 4); k.at(1.1, mastTop + 3.5, mz + 1.1, 0, (q) => navlight(q, C.lampWhite, 0.13));
  for (const s of [-1, 1]) {
    k.at(s * 5.8, mastTop - 5, mz, 0, (q) => whip(q, 5, 0)); k.at(s * 3.9, mastTop - 4.9, mz, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.13));
    k.at(s * 5.4, yTop + 0.4, -60.4, 0, (q) => searchlight(q, M, 1.3)); k.at(s * 5.6, yTop + 0.4, -42.6, 0, (q) => dome(q, M, 1.2, 0.7)); k.at(s * 2.6, yTop + 0.4, -55, 0, (q) => whip(q, 7.5, 0.1));
    T0.on(k, s > 0 ? SB : PT, -46, 0, (q) => door(q, M, 0.9, 2.0));
  }
  // funnel caps and uptakes
  for (const zf of FUNNELS) {
    if (A) { k.cbox(M.BK, 5, 0.4, 7.4, 0.1, 0, y2 + 14.1, zf + 2.4); for (const z of [-0.6, 2.2, 5]) for (const s of [-1, 1]) { k.cyl(M.SD, 0.7, 0.8, 1.4, s * 1.1, y2 + 14.9, zf + z, 'y', 12); k.cyl(M.BK, 0.6, 0.6, 0.06, s * 1.1, y2 + 15.62, zf + z, 'y', 12); } }
    else { k.rod(M.SD, [1.9, y2, zf + 6.2], [1.9, y2 + 15.8, zf + 7.7], 0.24, 6); for (const s of [-1, 1]) k.cyl(M.SD, 4.05, 4.05, 0.18, 0, y2 + 5 + s * 3.4, zf + 0.5 + s * 0.34, 'y', 24, true); }
  }
  AT.windows(k, M, AFT, 4.8, 5.8, 6, 0.6); AT.windows(k, M, SB, 4.8, 5.8, 5, 0.8); AT.windows(k, M, PT, 4.8, 5.8, 5, 0.8);
  // ---- citadel sides and roofs: doors, scuttles, rafts, rails, missile cells, boats
  for (const s of [-1, 1]) {
    const e = s > 0 ? SB : PT;
    for (const z of [-68, -47, -8, 29, 56]) C1.on(k, e, z, 0, (q) => door(q, M, 0.9, 2.0));
    for (const z of [-60, -20, 20, 44]) C1.on(k, e, z, 1.5, (q) => firebox(q)); for (const z of [-34, 2, 36]) C1.on(k, e, z, 1.9, (q) => lifering(q));
    if (fine) { for (let z = -66; z <= 54; z += 4) C2.on(k, e, z, 2.4, (q) => porthole(q, M, 0.24)); for (let z = -70; z <= 58; z += 8) C1.on(k, e, z, 4.3, (q) => flood(q, 0.8)); }
    for (const z of [-58, -22, 30]) C2.on(k, e, z, 0, (q) => door(q, M));
    C1.on(k, e, 59, 0, (q) => ladder(q, M.rail, 5));
    rail(k, [[s * 9.4, y1, -73.3], [s * 10.9, y1, -72], [s * 10.9, y1, 60], [s * 9.4, y1, 61.3], [s * 6.5, y1, 61.6]], { mc: M.rail, post: 2.8 });
    rail(k, [[s * 4.9, y2, -69.4], [s * 6.1, y2, -68.2], [s * 6.1, y2, 56.4], [s * 4.9, y2, 57.5], [0, y2, 57.5]], { mc: M.rail, post: 3 });
    for (const z of [-33, -20.5, 5.5, 31.5]) k.at(s * 5.2, y2, z, 0, (q) => liferaft(q, 1.5, 0.4));
    for (const z of [-30, 28]) k.at(s * 4.6, y2, z, 0, (q) => vent(q, M, 1.9, 0.6));
    for (const z of SAM_Z) k.cyl(M.SD, 2.2, 2.45, 0.6, s * 9.2, y1 + 0.3, z, 'y', 18);
    for (const z of CIWS_Z) { if (A) house(k, M.S, { x: s * 9.2, z0: z - 1.5, z1: z + 1.5, w: 2.6, y0: y1, y1: y1 + 2, slope: 0.06, cf: 0.5, ca: 0.5 }); else k.cyl(M.SD, 1.2, 1.5, 2, s * 9.2, y1 + 1, z, 'y', 12); }
    // main deck: boats and davits, bitts, chocks, anchors, rails, screws
    for (const z of [66, 72]) k.at(s * 21.5, fb, z - 3, 0, (q) => rhib(q, M, 8.4, 2.9)); for (const z of [61.5, 70.5]) k.at(s * 23.4, fb, z, s > 0 ? Math.PI : 0, (q) => davit(q, M, 3.6, 1.9));
    for (const z of [-150, -110, -84, -47, -9, 29, 66, 110, 150, 170]) k.at(s * (half(z) - 1.0), dY(z), z, 0, (q) => bitts(q, 1.5));
    for (const z of [-146, -100, -60, -20, 20, 60, 104, 140, 166]) k.at(s * (half(z) - 0.25), dY(z), z, 0, (q) => chock(q, 1.4));
    k.frame(hull.wall(-160, fb + 2.2, s), (q) => anchor(q, 1.8));
    k.at(s * 3.6, dY(-152), -152, 0, (q) => windlass(q, M, 1.3)); k.rod(C.iron, [s * 3.6, dY(-153) + 0.7, -152.7], [s * 5.2, dY(-158) + 0.2, -158.4], 0.14, 5);
    const pts = hull.edge(-146, 179.4, 6, 0.25).map((p) => [s * p[0], p[1], p[2]]); pts.unshift([s * (half(-148.5) - 0.15), dY(-148.5) - 0.6, -148.5]);
    rail(k, pts, { mc: M.rail, post: 2.6, h: 1.1 });
    rail(k, [[s * (half(179.6) - 0.25), fb, 179.6], [0, fb, 179.6]], { mc: M.rail, post: 2.2 });
    for (const x of [10, 15.5]) k.at(s * x, -12.8, 162, 0, (q) => screw(q, HC, 2.7, 24));
    if (!A) { for (let z = -100; z <= 124; z += 4) k.frame(hull.wall(z, 2.6, s), (q) => q.box(HC, 4.06, 5.4, 0.55, 0, 0, -0.08)); for (let z = -130; z <= 150; z += 4) if (z < -104 || z > 128) k.frame(hull.wall(z, 8, s), (q) => porthole(q, M, 0.24)); }
    else if (fine) for (let z = -120; z <= 150; z += 5) k.frame(hull.wall(z, 8.6, s), (q) => porthole(q, M, 0.22));
    // sonar dome fairings low on the bow
    k.frame(hull.wall(-128, -9, s), (q) => q.sphere(HC, 2.2, 0, 0, -0.9, [1, 0.8, 0.5], 12));
  }
  for (const z of [-30, 28]) k.at(0, y2, z, 0, (q) => vls(q, M, 3, 2)); for (const s of [-1, 1]) k.at(s * 3.2, y2, 36, s * HP, (q) => canisters(q, M, 4, 5.4, 0.42, 0.4));
  for (const s of [-1, 1]) for (const z of [-64, 55]) k.at(s * 3.6, y2, z, -s * (z < 0 ? 0.9 : 2.2), (q) => decoys(q, M));
  // ---- foredeck and quarterdeck
  breakwater(k, M, dY(-136), -137.5, 10, 1.5);
  k.at(0, dY(-160), -160, 0, (q) => capstan(q, 1.6)); k.at(0, dY(-170) + 1.3, -170.6, 0, (q) => staff(q, 4.4, 0.2)); k.at(0, fb, 179, Math.PI, (q) => staff(q, 5, 0.15));
  for (const [x, z] of [[8, -128], [-8, -104], [9, -88], [-16, 66], [16, 86], [-15, 112], [14, 124]]) k.at(x, dY(z), z, 0, (q) => hatch(q, M, 1.6));
  // ---- helipad: circle, H, approach line and deck-edge lights
  const hz = 146;
  dk.add(C.white, new THREE.RingGeometry(10.5, 11.2, 56), 0, fb + 0.03, hz, [-HP, 0, 0]); dk.add(C.yellow, new THREE.RingGeometry(12.2, 12.5, 56), 0, fb + 0.03, hz, [-HP, 0, 0]);
  for (const x of [-3.3, 3.3]) dk.box(C.white, 1.4, 0.02, 9.8, x, fb + 0.03, hz); dk.box(C.white, 6.6, 0.02, 1.4, 0, fb + 0.03, hz); dk.box(C.white, 0.4, 0.02, 14, 0, fb + 0.03, hz + 20);
  if (fine) for (let a = 0; a < 6.28; a += 0.39) k.at(Math.sin(a) * 13.2, fb + 0.06, hz + Math.cos(a) * 13.2, 0, (q) => navlight(q, C.lampAmber, 0.1));
  k.at(15, fb, 132, 0, (q) => locker(q, M, 2.2, 1.1, 1.0)); k.at(-15, fb, 160, 0, (q) => firebox(q));
  // ---- hatchway by the helipad: coaming and rails round the stair opening (open at the after end)
  for (const x of [HT.x0 - 0.1, HT.x1 + 0.1]) k.box(M.SD, 0.2, 0.3, HT.z1 - HT.z0 + 0.2, x, fb + 0.15, (HT.z0 + HT.z1) / 2); k.box(M.SD, HT.x1 - HT.x0 + 0.4, 0.3, 0.2, 0, fb + 0.15, HT.z0 - 0.1);
  rail(k, [[HT.x1 + 0.1, fb + 0.3, HT.z1], [HT.x1 + 0.1, fb + 0.3, HT.z0 - 0.1], [HT.x0 - 0.1, fb + 0.3, HT.z0 - 0.1], [HT.x0 - 0.1, fb + 0.3, HT.z1]], { mc: M.rail, post: 1.6, h: 0.9 });
  // ---- markings
  const num = M.num(A ? 'SD1' : '2000');
  hullDecal(dk, num, 14, 7, hull, 5.6, -84, 1); hullDecal(dk, num, 14, 7, hull, 5.6, -84, -1);
  for (const e of [SB, PT]) dk.frame(T0.frame(e, -56, 1.0, 0.04), (q) => q.add(M.ins, new THREE.PlaneGeometry(1.8, 1.8)));
  for (const e of [SB, PT]) dk.frame(C1.frame(e, 10, 2.5, 0.06), (q) => q.add(M.ins, new THREE.PlaneGeometry(4.2, 4.2)));

  // ---- weapons. Order: heavy x12, sam x10, ciws x8
  HEAVY.forEach(([x, y, z, rest, arc], i) => { const t = mount(S, 'heavy', x, y, z, rest, arc); if (i === 1 || i === 2) { const d = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), M.ins); d.rotation.x = -HP; d.position.set(0, 4.55, -1.4); d.renderOrder = 2; t.node.add(d); } });
  for (const z of SAM_Z) for (const s of [1, -1]) mount(S, 'sam', s * 9.2, y1 + 0.6, z, -s * HP, Math.PI);
  for (const z of CIWS_Z) for (const s of [1, -1]) mount(S, 'ciws', s * 9.2, y1 + 2, z, -s * HP, 2.7);
  spin(S, radar(M, A ? 'twin' : 'mesh', A ? 8 : 9.5, A ? 2.6 : 3, fine), 0, mastTop + 0.2, mz, 1.0);
  spin(S, radar(M, A ? 'panel' : 'mesh', A ? 5 : 5.6, 1.6, fine), 0, y2 + 8, 46, 1.6);
  spin(S, radar(M, 'bar', 3, 0.6, fine), 0, yTop + 0.4, -58.5, 3.0);

  // ---- dock doors in the transom, under the waterline: two leaves hinged at their outer edges, a dark mouth behind them
  if (!MOUTH) { MOUTH = new THREE.MeshBasicMaterial({ color: 0x03070a }); MOUTH.name = 'sdMouth.insignia'; }
  const dTop = -1.0, dBot = -14.2, dW = 6.2, dMid = (dTop + dBot) / 2, mouth = new THREE.Mesh(new THREE.PlaneGeometry(dW * 2 - 0.2, dTop - dBot - 0.2), MOUTH); mouth.position.set(0, dMid, L / 2 + 0.05); S.g.add(mouth);
  model.dockDoors = [1, -1].map((s) => {
    const g = new THREE.Group(), q = new ShipKit({ lod, fine }); g.position.set(s * dW, dMid, L / 2 + 0.3);
    q.box(HC, dW, dTop - dBot, 0.5, -s * dW / 2, 0, 0); if (fine) for (const y of [-4.4, 0, 4.4]) q.box(HC, dW - 0.4, 0.5, 0.2, -s * dW / 2, y, 0.3);
    q.cyl(C.dark, 0.3, 0.3, dTop - dBot + 0.4, 0, 0, 0.1, 'y', 10);
    q.build(g); g.userData.side = s; S.g.add(g); return g;
  });
  for (const s of [-1, 1]) k.box(HC, 0.5, dTop - dBot + 0.8, 0.5, s * (dW + 0.35), dMid, L / 2 + 0.2); k.box(HC, dW * 2 + 1.2, 0.5, 0.5, 0, dTop + 0.3, L / 2 + 0.2);

  // ---- the interior, and what can be walked on outside
  const inn = buildInterior(nation, model, fine, fb); S.g.add(inn.group); model.interior = inn;
  const holes = [shaftHole, HT];
  model.decks.push(...minusAll([{ x0: -24.2, x1: 24.2, z0: -74, z1: 120, y: fb }, { x0: -22.5, x1: 22.5, z0: 120, z1: 150, y: fb }, { x0: -20, x1: 20, z0: 150, z1: 178.5, y: fb }], holes), ...bowDecks(hull, -74, -166, 7, 1.0));
  model.blocks.push(...blocks,
    { x0: HT.x0 - 0.25, x1: HT.x0, z0: HT.z0 - 0.25, z1: HT.z1, y0: fb, y1: fb + 1.3 }, { x0: HT.x1, x1: HT.x1 + 0.25, z0: HT.z0 - 0.25, z1: HT.z1, y0: fb, y1: fb + 1.3 }, { x0: HT.x0, x1: HT.x1, z0: HT.z0 - 0.25, z1: HT.z0, y0: fb, y1: fb + 1.3 });
  for (const [x, y, z] of HEAVY) model.blocks.push({ x0: x - 5.4, x1: x + 5.4, z0: z - 5.4, z1: z + 5.4, y0: Math.min(y, fb) - 0.2, y1: y + 5 });
  // crew stations: the bridge watch, the helipad crew, deck hands and lookouts (the interior adds its own)
  const R = P.bridge;
  model.posts.push({ x: 0, y: yBr, z: R.z0 + 2.1, yaw: 0, kind: 'bridge' }, { x: -2.6, y: yBr, z: R.z0 + 1.9, yaw: 0, kind: 'bridge' }, { x: 2.8, y: yBr, z: R.z0 + 1.9, yaw: 0, kind: 'bridge' }, { x: -4.4, y: yBr, z: R.z1 - 0.9, yaw: Math.PI, kind: 'bridge' },
    { x: 14, y: fb, z: 134, yaw: -HP, kind: 'flight' }, { x: -14.5, y: fb, z: 150, yaw: HP, kind: 'flight' }, { x: 4, y: fb, z: 164, yaw: Math.PI, kind: 'flight' },
    { x: 22.5, y: fb, z: -47, yaw: -HP, kind: 'deck' }, { x: -22.5, y: fb, z: -9, yaw: HP, kind: 'deck' }, { x: 22.5, y: fb, z: 29, yaw: -HP, kind: 'deck' }, { x: -22, y: fb, z: 66, yaw: HP, kind: 'deck' }, { x: 12, y: fb, z: 116, yaw: Math.PI, kind: 'deck' },
    { x: 2.5, y: dY(-152), z: -152, yaw: 0, kind: 'lookout' }, { x: -9, y: dY(-100), z: -100, yaw: 0.3, kind: 'lookout' }, { x: 6, y: fb, z: 174, yaw: Math.PI, kind: 'lookout' });
  for (const zf of FUNNELS) model.smoke.push(new V3(0, A ? y2 + 15.8 : y2 + 16.2, zf + (A ? 2.4 : 0.9)));
  model.view = { bridge: new V3(0, yBr + 1.72, R.z0 + 1.9), chase: 380, chaseH: 85 };
  model.helipads = [{ pos: new V3(0, fb, hz), r: 12 }];
  model.dock = { pos: new V3(P.dock.x, P.dock.y, P.dock.z), yaw: 0, exit: new V3(0, P.dock.y, L / 2 + 64), under: true, depth: -P.dock.y, only: 'attacksub' };
  return finishShip(S);
}
