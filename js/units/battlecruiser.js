// Battlecruiser: heavy gun ship. Four triple main turrets (two forward, two aft, inner pair superfiring), two close-in AA
// guns, one SAM launcher, eight machine gun mounts, and a submarine dock (two pontoon arms + gantry) at the stern.
// Extra on the model: dock = { pos, yaw, exit } (where a docked submarine floats, and the point it leaves toward).
import * as THREE from 'three';
import { MAT, hullNumberMaterial } from '../gfx/materials.js';
import { PartBuilder, hullGeo, makeTurret, makeRadar, sideDecal, deckDecal } from './builders.js';
import { hullHalfWidth, hullDecal, lattice } from './corvette.js';

const HP = Math.PI / 2;

export function buildBattlecruiser(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const L = 250, B = 30, draft = 8.5, fb = 7.5;
  const HO = { L, B, draft, freeboard: fb, sheer: 3, bowLen: 0.34, sternW: 0.8, sternLen: 0.16, flare: A ? 0.5 : 0.3, full: A ? 0.36 : 0.46 };
  const hull = hullGeo({ ...HO, stations: lod ? 14 : 44, rings: lod ? 3 : 8 });
  b.add(MAT.hull[nation], hull.side); b.add(MAT.deck[nation], hull.deck);
  const sup = MAT.superstructure[nation], dark = MAT.superDark[nation], gm = MAT.gunmetal, glass = MAT.glass;
  const dY = hull.deckYAt, hbAt = hull.halfBeamAt;
  const y1 = fb + 5, y2 = fb + 9;                 // roofs of citadel level 1 and level 2
  const FUNNELS = [-8, 12], TURRET_Z = [-78, -58, 58, 78];

  // ---- main blocks (both lods) ----
  if (A) {
    b.taper(sup, 24, 5, 88, 22, 84, 0, fb + 2.5, 0, 0);
    b.taper(sup, 20, 4, 66, 17.5, 62, 0, fb + 7, -7, 0);
    b.taper(sup, 14, 9, 17, 11, 13, 0, y2 + 4.5, -30, 1.2);            // tower, lower
    b.taper(sup, 11, 7, 13, 8, 9, 0, y2 + 12.5, -29, 1.0);             // tower, upper
    b.taper(sup, 5, 13, 5, 1.6, 1.8, 0, y2 + 22.5, -28, 0.5);          // enclosed mast (top at y2 + 29)
    for (const zf of FUNNELS) b.taper(sup, 8, 12, 11, 5, 6.5, 0, y2 + 6, zf, 2.2);
    b.taper(sup, 11, 8, 8, 8, 5.5, 0, y1 + 4, 40, -0.5);               // aft control tower
  } else {
    b.box(sup, 24, 5, 88, 0, fb + 2.5, 0);
    b.box(sup, 19, 4, 66, 0, fb + 7, -7);
    b.box(sup, 14, 8, 17, 0, y2 + 4, -30);
    b.box(sup, 11, 6, 12, 0, y2 + 11.4, -30);
    b.box(sup, 8, 5, 8, 0, y2 + 17.3, -30);
    for (const zf of FUNNELS) b.add(sup, new THREE.CylinderGeometry(2.9, 3.7, 13, lod ? 7 : 14), 0, y2 + 6.5, zf, [0.1, 0, 0]);
    b.box(sup, 11, 7, 8, 0, y1 + 3.5, 40);
    b.box(sup, 7, 3.5, 5.5, 0, y1 + 8.75, 40);
  }
  // barbettes for the superfiring turrets
  b.cyl(dark, 5.3, 5.5, 4.2, 0, dY(-58) + 2.1, -58, 'y', lod ? 8 : 18);
  b.cyl(dark, 5.3, 5.5, 4.2, 0, fb + 2.1, 58, 'y', lod ? 8 : 18);
  // submarine dock: two pontoon arms aft of the transom
  for (const s of [-1, 1]) {
    b.box(MAT.hull[nation], 5, 4.4, 48, s * 9, 0.2, 147);
    b.box(MAT.deck[nation], 5, 0.1, 48, s * 9, 2.45, 147);
  }

  if (b.detail) {
    if (A) {
      b.box(glass, 10, 1.2, 0.14, 0, y2 + 6.75, -36.18, [0.342, 0, 0]);
      b.box(glass, 7.6, 1.0, 0.14, 0, y2 + 13.2, -33.78, [0.405, 0, 0]);
      for (const s of [-1, 1]) {
        b.box(glass, 0.14, 1.2, 9, s * 5.93, y2 + 6.75, -30.5, [0, 0, s * 0.165]);
        b.box(glass, 0.14, 1.0, 6.5, s * 4.66, y2 + 13.2, -29, [0, 0, s * 0.211]);
        b.box(glass, 0.12, 0.6, 50, s * 9.3, fb + 7.4, -8, [0, 0, s * 0.3]);
        b.box(dark, 0.14, 2.6, 2.2, s * 1.95, y2 + 20, -27.8, [0, 0, s * 0.13]);       // mast arrays
        b.sphere(MAT.white, 1.1, s * 3.4, y2 + 16.9, -27.5);
      }
      b.box(dark, 2.2, 2.6, 0.14, 0, y2 + 20, -30.05, [0.13, 0, 0]);
      for (const zf of FUNNELS) b.box(dark, 4.6, 0.5, 6.0, 0, y2 + 12.2, zf + 2.2);
      b.box(glass, 6.5, 0.9, 0.14, 0, y1 + 6, 36.5, [-0.15, 0, 0]);
    } else {
      b.box(dark, 17, 0.4, 20, 0, y2 + 8.2, -30); b.box(dark, 14, 0.4, 14, 0, y2 + 14.6, -30);   // tower platforms
      b.rail(gm, [[-8.4, y2 + 8.4, -39.8], [8.4, y2 + 8.4, -39.8], [8.4, y2 + 8.4, -20.2], [-8.4, y2 + 8.4, -20.2], [-8.4, y2 + 8.4, -39.8]], 1.05, 3.2);
      b.rail(gm, [[-6.9, y2 + 14.8, -36.9], [6.9, y2 + 14.8, -36.9], [6.9, y2 + 14.8, -23.1], [-6.9, y2 + 14.8, -23.1], [-6.9, y2 + 14.8, -36.9]], 1.05, 3.4);
      b.box(dark, 18, 1.0, 1.6, 0, y2 + 19.2, -30);                                             // rangefinder
      b.box(glass, 11, 1.1, 0.14, 0, y2 + 6.3, -38.55); b.box(glass, 9, 1.0, 0.14, 0, y2 + 12.6, -36.05); b.box(glass, 6.4, 0.9, 0.14, 0, y2 + 18.2, -34.05);
      for (const s of [-1, 1]) {
        b.box(glass, 0.14, 1.1, 12, s * 7.03, y2 + 6.3, -30.5); b.box(glass, 0.14, 1.0, 8, s * 5.53, y2 + 12.6, -30);
        b.box(glass, 0.12, 0.6, 50, s * 9.55, fb + 7.4, -8);
        b.cyl(gm, 0.5, 0.5, 0.8, s * 7.6, y2 + 9.4, -37.5, 'z', 8);                              // searchlights
        b.sphere(MAT.white, 1.0, s * 2.6, y2 + 20.6, -28);
        // armour belt following the hull side
        const lo = hullHalfWidth(HO, 5, 0), hi = hullHalfWidth(HO, 5, 3.2);
        b.box(dark, 0.3, 3.4, 150, s * ((lo + hi) / 2 + 0.1), 1.6, 5, [0, 0, -s * Math.atan2(hi - lo, 3.2)]);
        b.tube(dark, [s * 11.5, y1, 22], [s * 11.5, y1 + 7, 22], 0.3, 6); b.tube(dark, [s * 11.5, y1 + 7, 22], [s * 15.5, y1 + 9, 30], 0.2, 6); // boat cranes
      }
      lattice(b, gm, 0, -30, y2 + 19.8, y2 + 31, 4.2, 1.4, 5, 0.13);
      b.box(dark, 3.0, 0.25, 3.0, 0, y2 + 31.1, -30); b.tube(gm, [-5, y2 + 27, -30], [5, y2 + 27, -30], 0.08);
      for (const zf of FUNNELS) {
        b.add(MAT.black, new THREE.CylinderGeometry(3.05, 3.05, 0.9, 14), 0, y2 + 13.3, zf + 0.65, [0.1, 0, 0]);
        b.tube(gm, [1.6, y2, zf + 4.2], [1.6, y2 + 13.6, zf + 5.2], 0.22); b.tube(gm, [-1.6, y2, zf + 4.2], [-1.6, y2 + 12.8, zf + 5.1], 0.18);
      }
      b.box(glass, 5.6, 0.9, 0.14, 0, y1 + 9.2, 37.2);
    }
    for (const s of [-1, 1]) {
      // close-in gun pedestals, boats and davits, life rafts, doors
      b.cyl(dark, 1.3, 1.6, 4, s * 10.4, y1 + 2, 2, 'y', 10);
      b.add(MAT.black, new THREE.CapsuleGeometry(1.2, 7, 4, 8), s * 9.4, y1 + 1.3, 38.5, [HP, 0, 0], [1.15, 1, 0.8]);
      b.box(MAT.orange, 1.5, 0.25, 6, s * 9.4, y1 + 1.6, 38.5);
      for (const z of [35.5, 41.5]) { b.tube(dark, [s * 11, y1, z], [s * 11, y1 + 3.4, z], 0.14); b.tube(dark, [s * 11, y1 + 3.4, z], [s * 9.4, y1 + 3.8, z], 0.1); }
      for (let z = -34; z <= 22; z += 7) b.cyl(MAT.white, 0.45, 0.45, 1.5, s * (A ? 10.3 : 11.2), y1 + 0.5, z, 'z', 8);
      for (const z of [-36, -4, 24]) b.box(dark, 0.12, 2.1, 1.0, s * (A ? 11.82 : 12.03), fb + 1.15, z);
      for (const z of [-20, 10]) b.add(MAT.orange, new THREE.TorusGeometry(0.4, 0.1, 6, 12), s * (A ? 11.8 : 12.06), fb + 1.9, z, [0, HP, 0]);
      // foredeck gear, bollards, machine gun tubs
      b.box(dark, 9.5, 1.3, 0.2, s * 4.3, dY(-96) + 0.65, -95.5, [0, s * 0.45, 0]);                // breakwater
      b.cyl(gm, 0.8, 0.8, 2.6, s * 3.0, dY(-108) + 0.8, -108, 'x', 10);                            // windlasses
      b.tube(gm, [s * 3.0, dY(-109) + 0.5, -109], [s * 3.6, dY(-116) + 0.1, -116.5], 0.14, 5);
      b.box(gm, 0.4, 2.6, 1.8, s * (hullHalfWidth(HO, -113, fb + 0.6) + 0.15), fb + 0.6, -113);    // anchors
      for (const z of [-104, -70, -48, 50, 70, 100, 120]) b.cyl(gm, 0.3, 0.36, 0.8, s * (hbAt(z) - 1.0), dY(z) + 0.4, z, 'y', 8);
      for (const z of [-46, -16, 16, 46]) { b.cyl(dark, 1.1, 1.2, 0.25, s * 13.6, fb + 0.12, z, 'y', 10); b.box(dark, 0.8, 0.7, 1.4, s * 12.6, fb + 0.35, z + 2.4); }
      // deck-edge railings
      const pts = []; for (let z = -116; z <= 124; z += 8) pts.push([s * (hbAt(z) - 0.25), dY(z), z]);
      b.rail(gm, pts, 1.1, 4);
      // ---- dock arm fittings ----
      b.cyl(MAT.hull[nation], 2.5, 2.5, 4.4, s * 9, 0.2, 171, 'y', 12); b.cyl(MAT.deck[nation], 2.5, 2.5, 0.1, s * 9, 2.45, 171, 'y', 12);
      for (let z = 129; z <= 169; z += 8) b.cyl(MAT.black, 0.55, 0.55, 1.8, s * 6.35, 0.9, z, 'y', 8);     // fenders
      b.rail(gm, [[s * 11.3, 2.5, 126], [s * 11.3, 2.5, 170.5]], 1.05, 4.5);
      for (const z of [134, 146, 158, 168]) b.cyl(gm, 0.22, 0.26, 0.6, s * 7.1, 2.8, z, 'y', 6);
      b.box(gm, 1.6, 0.2, 7.9, s * 9, 5.0, 128.1, [0.69, 0, 0]);                                           // gangway down from the quarterdeck
      b.tube(gm, [s * 9, 2.5, 172.5], [s * 9, 5.6, 172.5], 0.08); b.sphere(s > 0 ? MAT.white : MAT.red, 0.3, s * 9, 5.8, 172.5);
      for (const z of [147, 153]) { b.box(dark, 1.0, 12, 1.0, s * 9.6, 8.5, z); b.tube(dark, [s * 9.6, 3, z], [s * 6.5, 13.8, z], 0.12, 5); }
      b.box(dark, 1.0, 1.0, 7, s * 9.6, 14.5, 150);
      b.box(MAT.white, 0.6, 0.4, 0.6, s * 8.6, 13.6, 146.4);                                               // floodlights
    }
    // gantry crane across the dock
    b.box(dark, 21, 1.4, 1.2, 0, 14.5, 147); b.box(dark, 21, 1.4, 1.2, 0, 14.5, 153);
    b.box(MAT.yellow, 3.2, 1.2, 5.2, 0, 13.7, 150);
    b.tube(gm, [-0.6, 13.2, 150], [-0.6, 7.2, 150], 0.05, 4); b.tube(gm, [0.6, 13.2, 150], [0.6, 7.2, 150], 0.05, 4);
    b.box(MAT.yellow, 1.8, 0.8, 0.8, 0, 6.9, 150); b.box(dark, 13.2, 0.3, 0.5, 0, 6.4, 150);               // spreader bar
    b.rail(gm, [[-(hbAt(124.6) - 0.3), fb, 124.6], [hbAt(124.6) - 0.3, fb, 124.6]], 1.1, 4);
    // SAM base, hatches, vents, jackstaff, ensign staff
    b.cyl(dark, 2.2, 2.4, 0.6, 0, y1 + 0.3, 31, 'y', 14);
    for (const z of [-90, -68, 68, 92, 108]) b.box(dark, 3.2, 0.3, 3.2, z < 0 ? 7.5 : -7, dY(z) + 0.15, z);
    for (const z of [-42, 28]) for (const s of [-1, 1]) { b.cyl(dark, 0.6, 0.6, 1.8, s * 7, y2 + 0.9, z < 0 ? -18 : 20, 'y', 8); b.cyl(dark, 0.9, 0.6, 0.4, s * 7, y2 + 2.0, z < 0 ? -18 : 20, 'y', 8); }
    b.tube(gm, [0, dY(-121), -121.5], [0, dY(-121) + 4, -122], 0.06, 4); b.tube(gm, [0, fb, 124], [0, fb + 4.5, 124.4], 0.06, 4);
    b.tube(gm, [2.5, y2 + (A ? 16 : 19.8), -26], [3.2, y2 + (A ? 24 : 27), -25.5], 0.04, 4); b.tube(gm, [-2.5, y2 + (A ? 16 : 19.8), -26], [-3.2, y2 + (A ? 23 : 26), -25.5], 0.04, 4);
  }
  b.build(g);

  const model = { dims: { length: L, beam: B, height: A ? fb + 40.5 : fb + 43.5, draft }, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [], view: {} };
  if (lod === 0) {
    // ---- weapons. Order: heavy x4, ciws x2, sam, mg x8 ----
    const tY = [dY(-78), dY(-58) + 4.2, fb + 4.2, fb];
    TURRET_Z.forEach((z, i) => {
      const t = makeTurret('heavy', nation);
      t.node.position.set(0, tY[i], z); t.rest = z < 0 ? 0 : Math.PI; t.arc = 2.5; t.node.rotation.y = t.rest; g.add(t.node); model.turrets.push(t);
      if (i === 1 || i === 2) { const d = deckDecal(MAT.insignia[nation], 3.4, 3.4, 0, 4.4, 1.0); t.node.add(d); }
    });
    for (const s of [1, -1]) {
      const c = makeTurret('ciws', nation);
      c.node.position.set(s * 10.4, y1 + 4, 2); c.rest = -s * HP; c.arc = 2.6; c.node.rotation.y = c.rest; g.add(c.node); model.turrets.push(c);
    }
    const sam = makeTurret('sam', nation);
    sam.node.position.set(0, y1 + 0.6, 31); sam.rest = Math.PI; sam.arc = Math.PI; sam.node.rotation.y = sam.rest; g.add(sam.node); model.turrets.push(sam);
    for (const s of [1, -1]) for (const z of [-46, -16, 16, 46]) {
      const m = makeTurret('mg', nation);
      m.node.position.set(s * 13.6, fb + 0.25, z); m.rest = -s * HP; m.arc = 1.6; m.node.rotation.y = m.rest; g.add(m.node); model.turrets.push(m);
    }
    // radars
    const r1 = makeRadar(nation, A ? 7 : 8, A ? 2.0 : 2.4); r1.position.set(0, A ? y2 + 29 : y2 + 31.2, A ? -27.5 : -30); g.add(r1);
    const r2 = makeRadar(nation, 5, 1.4); r2.position.set(0, A ? y1 + 8 : y1 + 10.5, A ? 39.5 : 40); g.add(r2);
    const r3 = makeRadar(nation, 2.6, 0.6); r3.position.set(0, A ? y2 + 16 : y2 + 19.8, A ? -31.8 : -33.2); g.add(r3);
    model.spinners.push({ node: r1, axis: 'y', speed: 1.1 }, { node: r2, axis: 'y', speed: 1.7 }, { node: r3, axis: 'y', speed: 3.0 });
    // decals
    const num = hullNumberMaterial(A ? 'B07' : '900', nation);
    g.add(hullDecal(num, 12, 6, HO, 3.6, -50, 1), hullDecal(num, 12, 6, HO, 3.6, -50, -1));
    for (const s of [-1, 1]) {
      const ins = sideDecal(MAT.insignia[nation], 4.5, 4.5, s * (A ? 6.28 : 7.0), y2 + (A ? 4.3 : 3.2), -30, s);
      if (A) { ins.rotation.order = 'YXZ'; ins.rotation.x = -0.165; }
      g.add(ins);
    }
    // walkable areas, obstacles, crew stations
    model.decks.push({ x0: -14.3, x1: 14.3, z0: -95, z1: 95, y: fb }, { x0: -12, x1: 12, z0: 95, z1: 124.5, y: fb }, { x0: -9, x1: 9, z0: -116, z1: -95, y: fb + 1.6 },
      { x0: 6.5, x1: 11.5, z0: 124.5, z1: 171, y: 2.5 }, { x0: -11.5, x1: -6.5, z0: 124.5, z1: 171, y: 2.5 });
    model.blocks.push({ x0: -12, x1: 12, z0: -44, z1: 44, y0: fb, y1: fb + 9 },
      { x0: -5.5, x1: 5.5, z0: -63.5, z1: -52.5, y0: fb, y1: fb + 5.5 }, { x0: -5.5, x1: 5.5, z0: 52.5, z1: 63.5, y0: fb, y1: fb + 5 });
    if (A) model.posts.push({ x: 3, y: y2 + 5.2, z: -34, yaw: 0, kind: 'bridge' }, { x: -3, y: y2 + 5.2, z: -34, yaw: 0, kind: 'bridge' },
      { x: 0, y: y2 + 5.2, z: -31, yaw: 0, kind: 'bridge' }, { x: 2, y: y2 + 12, z: -32, yaw: 0, kind: 'bridge' });
    else model.posts.push({ x: 7.6, y: y2 + 8.4, z: -30, yaw: -HP, kind: 'bridge' }, { x: -7.6, y: y2 + 8.4, z: -30, yaw: HP, kind: 'bridge' },
      { x: 0, y: y2 + 8.4, z: -39, yaw: 0, kind: 'bridge' }, { x: 6.2, y: y2 + 14.8, z: -34, yaw: -HP, kind: 'bridge' });
    model.posts.push({ x: 13.3, y: fb, z: -30, yaw: -HP, kind: 'deck' }, { x: -13.3, y: fb, z: -30, yaw: HP, kind: 'deck' },
      { x: 13.3, y: fb, z: 0, yaw: -HP, kind: 'deck' }, { x: -13.3, y: fb, z: 2, yaw: HP, kind: 'deck' },
      { x: 13.3, y: fb, z: 30, yaw: -HP, kind: 'deck' }, { x: -13.3, y: fb, z: 32, yaw: HP, kind: 'deck' },
      { x: 6, y: fb, z: 110, yaw: Math.PI, kind: 'deck' }, { x: -5, y: fb, z: 100, yaw: Math.PI, kind: 'deck' },
      { x: 9, y: 2.5, z: 140, yaw: HP, kind: 'deck' }, { x: -9, y: 2.5, z: 158, yaw: -HP, kind: 'deck' },
      { x: 2, y: dY(-100), z: -100, yaw: 0, kind: 'lookout' }, { x: -8, y: fb, z: -48, yaw: 0.3, kind: 'lookout' });
    for (const zf of FUNNELS) model.smoke.push(new THREE.Vector3(0, A ? y2 + 12.8 : y2 + 14, zf + (A ? 2.2 : 0.8)));
    model.view = { bridge: new THREE.Vector3(0, y2 + (A ? 6.9 : 6.5), A ? -35.2 : -37.6), chase: 260, chaseH: 60 };
    model.dock = { pos: new THREE.Vector3(0, 0, L / 2 + 24), yaw: 0, exit: new THREE.Vector3(0, 0, L / 2 + 90) };
  }
  g.userData.model = model;
  return g;
}
