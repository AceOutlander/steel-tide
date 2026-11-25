// Patrol Boat (v2): fast inshore craft. Hard-chine hull with a flared, bulwarked bow, deckhouse with a raised pilothouse,
// radar mast, a boat and crane on the after deck, one crew-served machine gun on the foredeck.
// Aethia: faceted, raked-back pilothouse and a small enclosed mast. Extro: upright house with forward-raked windows,
// lattice mast, a proper funnel and a black rubbing strake.
// userData.model: the standard contract of js/units/builders.js (dims, turrets [mg], spinners [radar], decks, blocks,
// posts, smoke, view). Decks now also hold the deckhouse roof and three steps up the sheer of the bow.
import * as THREE from 'three';
import { startShip, finishShip, spin, bowDecks, strake, house, rail, lattice4, radar, hullDecal, sstep, cached, fineDetail, C,
  door, porthole, ladder, hatch, liferaft, lifering, bitts, chock, capstan, anchor, whip, dome, searchlight, navlight, locker, staff, rhib, crane, screw, vent, firebox,
  FWD, AFT, SB, PT } from './shipkit.js';
import { mount } from './turrets.js';

const HP = Math.PI / 2;

export function buildPatrolBoat(nation, lod = 0) { const fine = fineDetail(); return cached(`patrol:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

function make(nation, lod, fine) {
  const A = nation === 'aethia', L = 34, B = 7.4, D = 1.7, fb = 2.5;
  const S = startShip(nation, lod, fine, { L, B, D, fb, sheer: 0.9, sheerLen: 0.5, bowLen: 0.46, bowPow: 0.8, sternW: 0.9, sternLen: 0.14, knuckle: A ? 0.42 : 0.36, flareTop: 1.24, tumble: A ? 0.97 : 1,
    wlBow: 0.5, wlMid: 0.92, bilge: 2.4, rake: 2.0, keelRise: 0.4, bulwark: (s) => 0.5 * sstep(0.36, 0.22, s), stations: 44 }, 0.5);
  const { M, k, dk, hull, model } = S, dY = hull.deckY, hy = fb + 2.4, py = hy + 2.2;
  model.dims = { length: L, beam: B, height: 11, draft: D };

  // ---- deckhouse, pilothouse, mast (both detail levels)
  const H1 = house(k, M.S, { z0: -4.4, z1: 5.8, w: 5.0, y0: fb - 0.05, y1: hy, slope: A ? 0.1 : 0.02, rakeF: A ? 0.25 : 0.06, rakeA: A ? 0.1 : 0.02, cf: 0.6, ca: 0.4, roof: M.D });
  const H2 = house(k, M.S, { z0: -3.6, z1: 1.4, w: A ? 4.1 : 4.3, y0: hy, y1: py, slope: A ? 0.14 : 0.03, rakeF: A ? 0.42 : -0.14, rakeA: 0.06, cf: A ? 0.8 : 0.5, ca: 0.3 });
  const mastTop = py + (A ? 3.0 : 3.9), mz = 0.4;
  if (A) { house(k, M.S, { z0: mz - 0.9, z1: mz + 0.8, w: 1.5, y0: py, y1: py + 2.4, slope: 0.2, rakeF: 0.22, rakeA: 0.12, cf: 0.25, ca: 0.25 }); k.cyl(M.SD, 0.07, 0.1, 1.6, 0, py + 3.2, mz + 0.3, 'y', 6); }
  else { lattice4(k, M.SD, 0, mz, py, py + 3.7, 1.7, 0.7, 3, 0.05); k.cbox(M.SD, 1.1, 0.08, 1.1, 0.02, 0, py + 3.74, mz); house(k, M.S, { z0: 2.3, z1: 4.7, w: 1.7, y0: hy, y1: hy + 2.2, slope: 0.1, rakeF: -0.12, rakeA: 0.3, cf: 0.4, ca: 0.4 }); k.cbox(M.BK, 1.3, 0.3, 1.6, 0.1, 0, hy + 2.3, 3.75); }

  if (k.detail) {
    // ---- windows, doors, portholes, ladders
    H2.windows(k, M, FWD, 0.95, 1.75, 5, 0.3); H2.windows(k, M, SB, 0.95, 1.75, 4, 0.4); H2.windows(k, M, PT, 0.95, 1.75, 4, 0.4); H2.windows(k, M, AFT, 1.05, 1.7, 2, 1.1);
    for (const e of [FS(0), FS(1)]) H2.windows(k, M, e, 0.95, 1.75, 1, 0.12);
    for (const e of [SB, PT]) {
      H1.on(k, e, 3.9, 0.05, (q) => door(q, M)); for (const z of [-2.6, -0.6, 1.4]) H1.on(k, e, z, 1.55, (q) => porthole(q, M));
      H2.on(k, e, 0.75, 0.95, (q) => lifering(q)); H1.on(k, e, -3.4, 1.3, (q) => firebox(q));
    }
    H2.on(k, AFT, 0.95, 0, (q) => door(q, M, 0.7, 1.8)); H1.on(k, AFT, -1.7, 0, (q) => ladder(q, M.rail, 2.5));
    H2.on(k, SB, -3.0, 1.5, (q) => navlight(q, C.lampGreen)); H2.on(k, PT, -3.0, 1.5, (q) => navlight(q, C.lampRed));
    rail(k, [[-2.25, hy, 1.6], [-2.25, hy, 5.55], [2.25, hy, 5.55], [2.25, hy, 1.6]], { mc: M.rail, post: 1.3 });
    // ---- pilothouse roof: searchlight, aerials, dome, horn; mast yard and lights
    k.at(0, py, -2.2, 0, (q) => searchlight(q, M, 0.8));
    k.at(-1.5, py, 0.9, 0, (q) => whip(q, 4.6, -0.12)); k.at(1.5, py, 0.9, 0, (q) => whip(q, 3.6, -0.1));
    k.at(1.2, py, -1.3, 0, (q) => dome(q, M, 0.32, 0.25)); k.at(-1.2, py, -1.4, 0, (q) => { q.cyl(M.SD, 0.05, 0.05, 0.4, 0, 0.2, 0, 'y', 6); q.cyl(M.RD, 0.1, 0.16, 0.34, 0, 0.42, -0.1, 'z', 8); });
    const yy = py + (A ? 2.9 : 2.6);
    k.rod(M.SD, [-1.5, yy, mz + 0.3], [1.5, yy, mz + 0.3], 0.04, 4);
    for (const s of [-1, 1]) { k.rod(C.gun, [s * 1.4, yy, mz + 0.3], [s * 1.4, yy + 1.4, mz + 0.3], 0.014, 3); k.at(s * 0.8, yy + 0.12, mz + 0.3, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.06)); }
    k.at(0, mastTop + (A ? 0.9 : 0.0), mz + 0.3, 0, (q) => navlight(q, C.lampWhite, 0.07));
    for (const s of [-1, 1]) k.at(s * 2.0, hy, 3.4, 0, (q) => liferaft(q, 1.2, 0.3));
    if (A) { for (const s of [-1, 1]) { k.pipe(M.SD, [[s * 0.9, hy, 5.0], [s * 0.9, hy + 0.7, 5.05], [s * 0.9, hy + 1.0, 5.35]], 0.16, 8, 8); k.cyl(M.BK, 0.17, 0.17, 0.06, s * 0.9, hy + 1.0, 5.36, 'z', 8); } k.cbox(M.SD, 1.2, 0.6, 0.9, 0.04, 0, hy + 0.3, 4.6); }
    else { for (const s of [-1, 1]) k.cyl(M.BK, 0.14, 0.14, 0.5, s * 0.3, hy + 2.6, 3.9, 'y', 8); k.box(M.SK, 1.0, 0.7, 0.03, 0, hy + 1.0, 2.24); }
    // ---- after deck: boat and crane, lockers, hatch, bitts, ensign staff
    k.at(0.55, fb, 11.4, 0, (q) => rhib(q, M, 5.6, 2.1));
    k.at(-2.4, fb, 8.9, -2.3, (q) => crane(q, M, 1.9, 3.4, 0.55));
    k.at(1.9, fb, 6.5, HP, (q) => locker(q, M, 1.2, 0.65, 0.6)); k.at(-1.2, fb, 6.5, HP, (q) => locker(q, M, 1.0, 0.65, 0.6));
    k.at(-1.9, fb, 15.0, 0, (q) => hatch(q, M, 0.8));
    k.at(0, fb, 16.6, Math.PI, (q) => staff(q, 2.4, 0.15));
    // ---- foredeck: gun ring, hatch, capstan, anchor, bitts, jackstaff
    k.cyl(M.SD, 0.95, 1.05, 0.14, 0, dY(-9) + 0.06, -9, 'y', 16);
    k.at(0, dY(-5.6), -5.7, 0, (q) => hatch(q, M, 0.85));
    k.at(0, dY(-13), -13, 0, (q) => capstan(q, 0.7)); k.rod(C.iron, [0.25, dY(-13) + 0.2, -13.2], [1.0, dY(-14.6) + 0.1, -14.6], 0.04, 4);
    k.frame(hull.wall(-14.6, fb + 0.75, 1), (q) => anchor(q, 0.42));
    k.at(0, dY(-16.3) + 0.3, -16.2, 0, (q) => staff(q, 1.6, 0.2));
    for (const s of [-1, 1]) {
      for (const z of [-11.5, 14.2]) k.at(s * (hull.half(z) - 0.45), dY(z), z, 0, (q) => bitts(q, 0.55));
      for (const z of [-7.5, 15.6]) k.at(s * (hull.half(z) - 0.12), dY(z), z, 0, (q) => chock(q, 0.6));
      const pts = hull.edge(-6.4, 16.75, 2.2, 0.16).map((p) => [s * p[0], p[1], p[2]]); pts.unshift([s * (hull.half(-7.6) - 0.1), dY(-7.6) - 0.4, -7.6]);
      rail(k, pts, { mc: M.rail, post: 1.6 });
    }
    rail(k, [[-(hull.half(16.75) - 0.16), fb, 16.75], [hull.half(16.75) - 0.16, fb, 16.75]], { mc: M.rail, post: 1.5 });
    strake(k, hull, A ? M.rail : C.black, fb * (A ? 0.42 : 0.36), -13.5, 16.8, A ? 0.06 : 0.1, 2);
    if (!A) k.at(0, dY(-7.2), -7.2, 0, (q) => vent(q, M, 0.7, 0.2));
    for (const s of [-1, 1]) k.at(s * 1.35, -1.25, 14.2, 0, (q) => screw(q, S.HC, 0.5, 4));
    // ---- markings
    const num = M.num(A ? 'P21' : '110');
    hullDecal(dk, num, 3.2, 1.6, hull, 1.45, -8.5, 1); hullDecal(dk, num, 3.2, 1.6, hull, 1.45, -8.5, -1);
    dk.decal(M.ins, 2.0, 0, py + 0.03, -1.6, 'up');
  }

  if (lod === 0) {
    mount(S, 'mg', 0, dY(-9) + 0.12, -9, 0, 2.5);
    spin(S, radar(M, 'bar', 2.3, 0.5, fine), 0, A ? py + 2.4 : py + 3.78, A ? mz - 0.25 : mz, 2.4);
    model.decks.push({ x0: -3.25, x1: 3.25, z0: -5, z1: 16.6, y: fb }, ...bowDecks(hull, -5, -15.5, 3, 0.45), { x0: -2.2, x1: 2.2, z0: 1.6, z1: 5.5, y: hy });
    model.blocks.push(H1.block(), H2.block());
    model.posts.push({ x: 0.8, y: hy, z: -1.2, yaw: 0, kind: 'bridge' }, { x: -0.8, y: hy, z: -0.8, yaw: 0, kind: 'bridge' },
      { x: 2.9, y: fb, z: 8.4, yaw: -HP, kind: 'deck' }, { x: -1.6, y: fb, z: 13.2, yaw: Math.PI, kind: 'deck' }, { x: 1.9, y: dY(-11.5), z: -11.5, yaw: 0.3, kind: 'lookout' });
    model.smoke.push(new THREE.Vector3(0, A ? hy + 1.2 : hy + 2.9, A ? 5.5 : 3.9));
    model.view = { bridge: new THREE.Vector3(0, hy + 1.45, -1.6), chase: 46, chaseH: 13 };
  }
  return finishShip(S);
}
// the pilothouse's forward corner walls (0 = starboard, 1 = port)
function FS(i) { return i ? 6 : 0; }
