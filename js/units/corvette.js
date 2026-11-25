// Corvette: medium escort. One twin-barrel deck gun forward, one crew-served machine gun on the hangar roof aft,
// helicopter deck at the stern. Also exports a few helpers shared by the bigger ship modules.
import * as THREE from 'three';
import { MAT, hullNumberMaterial } from '../gfx/materials.js';
import { PartBuilder, hullGeo, hullShape, makeTurret, makeRadar, sideDecal, deckDecal } from './builders.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const HP = Math.PI / 2;

// Half-width of a hullGeo() hull (same options object) at station z and height y.
export function hullHalfWidth(o, z, y) {
  const L = o.L, bowLen = o.bowLen ?? 0.32, flare = o.flare ?? 0.35, full = o.full ?? 0.4;
  const sh = hullShape(o), s = clamp01((z + L / 2) / L);
  const hb = sh.halfBeamS(s), dy = sh.deckYS(s);
  const bowT = clamp01(1 - s / bowLen), sternT = clamp01((s - 0.8) / 0.2);
  const keel = -o.draft * (1 - 0.75 * Math.pow(bowT, 3) - 0.55 * sternT * sternT);
  const v = clamp01((y - keel) / (dy - keel));
  return hb * Math.pow(v, full + (1.15 - full) * Math.pow(bowT, 0.8) * (0.5 + flare));
}
// Decal that hugs the (sloped, curved) hull side. side = +1 starboard, -1 port.
export function hullDecal(mat, w, h, o, y, z, side) {
  const top = hullHalfWidth(o, z, y + h / 2), bot = hullHalfWidth(o, z, y - h / 2);
  const fwd = hullHalfWidth(o, z - w / 2, y), aft = hullHalfWidth(o, z + w / 2, y);
  const m = sideDecal(mat, w, h, side * (Math.max((top + bot) / 2, (fwd + aft) / 2) + 0.12), y, z, side);
  m.rotation.order = 'YXZ';
  m.rotation.x = Math.atan2(top - bot, h);
  m.rotation.y += side * Math.atan2(aft - fwd, w);
  return m;
}
// Open lattice mast (four legs, rings and diagonals) from y0 to y1, square w0 at the foot, w1 at the head.
export function lattice(b, mat, x, z, y0, y1, w0, w1, levels = 4, r = 0.09) {
  const c = (t, sx, sz) => { const w = (w0 + (w1 - w0) * t) / 2; return [x + sx * w, y0 + (y1 - y0) * t, z + sz * w]; };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) b.tube(mat, c(0, sx, sz), c(1, sx, sz), r, 4);
  for (let i = 1; i <= levels; i++) {
    const t0 = (i - 1) / levels, t1 = i / levels;
    for (let k = 0; k < 4; k++) {
      const a = corners[k], d = corners[(k + 1) % 4];
      b.tube(mat, c(t1, a[0], a[1]), c(t1, d[0], d[1]), r * 0.6, 4);
      b.tube(mat, c(t0, a[0], a[1]), c(t1, d[0], d[1]), r * 0.5, 4);
    }
  }
}
// Constant cross-section [[x,y],...] extruded along Z from z0 to z1 (sponsons, deck overhang fairings).
export function prismZ(pts, z0, z1, uvScale = 10) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false });
  g.translate(0, 0, z0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / uvScale, uv.getY(i) / uvScale);
  return g;
}

export function buildCorvette(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const L = 95, B = 12.5, draft = 3.8, fb = 4.6;
  const HO = { L, B, draft, freeboard: fb, sheer: 1.6, bowLen: 0.38, sternW: 0.84, flare: A ? 0.5 : 0.3, full: A ? 0.34 : 0.44 };
  const hull = hullGeo({ ...HO, stations: lod ? 12 : 34, rings: lod ? 3 : 7 });
  b.add(MAT.hull[nation], hull.side); b.add(MAT.deck[nation], hull.deck);
  const sup = MAT.superstructure[nation], dark = MAT.superDark[nation], gm = MAT.gunmetal, glass = MAT.glass;
  const dY = hull.deckYAt, hbAt = hull.halfBeamAt;
  const roofY = fb + 3.2, hangarY = fb + 4.4;

  // ---- main superstructure blocks (both lods) ----
  if (A) {
    b.taper(sup, 9.8, 3.2, 34, 8.8, 31.5, 0, fb + 1.6, 0, 0.6);          // deckhouse
    b.taper(sup, 8.6, 3.0, 13, 6.6, 9.4, 0, fb + 4.7, -9, 0.9);          // bridge
    b.taper(sup, 3.4, 9.5, 3.8, 1.3, 1.5, 0, fb + 10.95, -6.5, 0.4);     // enclosed mast
    b.taper(sup, 4.6, 4.6, 7.5, 2.8, 4.2, 0, fb + 5.5, 6.5, 1.1);        // faceted funnel
    b.taper(sup, 9.0, 4.4, 10, 8.0, 9.2, 0, fb + 2.2, 19, -0.2);         // hangar
  } else {
    b.box(sup, 9.8, 3.2, 34, 0, fb + 1.6, 0);
    b.box(sup, 8.8, 2.8, 12, 0, fb + 4.6, -10);
    b.box(sup, 7.4, 2.4, 7.5, 0, fb + 7.2, -11.5);
    b.add(dark, new THREE.CylinderGeometry(1.5, 2.0, 6.5, lod ? 6 : 12), 0, fb + 6.4, 7, [0.12, 0, 0]);
    b.box(sup, 9.0, 4.4, 10, 0, fb + 2.2, 19);
  }

  if (b.detail) {
    if (A) {
      // bridge windows (follow the sloped faces)
      b.box(glass, 6.4, 1.0, 0.12, 0, fb + 5.2, -13.77, [0.733, 0, 0]);
      b.box(glass, 0.12, 1.0, 7.0, 3.68, fb + 5.2, -8.6, [0, 0, 0.32]); b.box(glass, 0.12, 1.0, 7.0, -3.68, fb + 5.2, -8.6, [0, 0, -0.32]);
      // flat radar arrays on the mast faces
      b.box(dark, 1.5, 1.8, 0.12, 0, fb + 9, -8.0, [0.16, 0, 0]);
      b.box(dark, 0.12, 1.8, 1.6, 1.42, fb + 9, -6.3, [0, 0, 0.11]); b.box(dark, 0.12, 1.8, 1.6, -1.42, fb + 9, -6.3, [0, 0, -0.11]);
      b.box(dark, 2.6, 0.35, 4.0, 0, fb + 7.95, 7.6);                    // funnel cap
      for (const s of [-1, 1]) b.sphere(MAT.white, 0.6, s * 2.2, fb + 6.5, -10.2);
      b.box(dark, 6.2, 3.4, 0.15, 0, fb + 1.9, 23.82, [-0.136, 0, 0]);   // hangar door
    } else {
      b.box(dark, 8.0, 0.3, 8.2, 0, fb + 8.55, -11.5);                   // bridge roof
      b.box(dark, 12.0, 0.25, 2.6, 0, fb + 6.05, -7.2);                  // bridge wings
      b.rail(gm, [[-5.9, fb + 6.17, -8.4], [-5.9, fb + 6.17, -6.0]], 1.0, 2.4); b.rail(gm, [[5.9, fb + 6.17, -8.4], [5.9, fb + 6.17, -6.0]], 1.0, 2.4);
      b.box(glass, 6.6, 0.95, 0.12, 0, fb + 7.4, -15.28);
      b.box(glass, 0.12, 0.95, 5.6, 3.72, fb + 7.4, -11.8); b.box(glass, 0.12, 0.95, 5.6, -3.72, fb + 7.4, -11.8);
      b.box(glass, 7.6, 0.7, 0.12, 0, fb + 5.0, -16.03);
      lattice(b, gm, 0, -5.5, fb + 6.0, fb + 17, 3.0, 1.0, 5, 0.1);
      b.box(dark, 2.2, 0.2, 2.2, 0, fb + 17.1, -5.5);
      b.tube(gm, [-3.2, fb + 13.5, -5.5], [3.2, fb + 13.5, -5.5], 0.06);
      b.add(MAT.black, new THREE.CylinderGeometry(1.6, 1.6, 0.6, 12), 0, fb + 9.8, 7.4, [0.12, 0, 0]);
      b.tube(gm, [0.9, fb + 3.2, 9.2], [0.9, fb + 10.4, 10.0], 0.14); b.tube(gm, [-0.9, fb + 3.2, 9.2], [-0.9, fb + 10.0, 9.9], 0.12);
      for (const s of [-1, 1]) {
        b.sphere(MAT.white, 0.55, s * 2.8, fb + 9.1, -9.6);
        b.cyl(gm, 0.3, 0.3, 0.5, s * 5.2, fb + 6.9, -7.2, 'z', 8);                              // searchlights
        b.box(dark, 0.18, 0.5, 52, s * (hullHalfWidth(HO, 4, fb - 1.3) + 0.06), fb - 1.3, 4);   // rubbing strakes
        b.cyl(dark, 0.35, 0.35, 1.1, s * 4.0, roofY + 0.55, -1.5 + s, 'y', 8); b.cyl(dark, 0.5, 0.35, 0.3, s * 4.0, roofY + 1.25, -1.5 + s, 'y', 8); // vents
        b.cyl(gm, 0.55, 0.55, 1.0, s * 3.4, fb + 0.55, 25.6, 'x', 10);                          // cable reels
        b.box(dark, 1.2, 0.8, 2.0, s * 5.2, fb + 0.4, -19.5);                                   // deck lockers
      }
      b.box(dark, 6.2, 3.4, 0.15, 0, fb + 1.9, 24.06);
    }
    // foredeck: gun ring, breakwater, windlass, anchors, jackstaff
    b.cyl(dark, 2.4, 2.6, 0.4, 0, dY(-27) + 0.18, -27, 'y', 14);
    for (const s of [-1, 1]) {
      b.box(dark, 4.2, 0.9, 0.15, s * 1.9, dY(-34.5) + 0.45, -34.3, [0, s * 0.5, 0]);
      b.box(gm, 0.25, 1.4, 1.0, s * (hullHalfWidth(HO, -42.5, fb + 0.2) + 0.1), fb + 0.2, -42.5);
      b.tube(gm, [s * 0.7, dY(-41) + 0.4, -41], [s * 1.6, dY(-43.5) + 0.05, -43.6], 0.07, 5);
      for (const z of [-38, -22, 26, 44]) b.cyl(gm, 0.16, 0.2, 0.5, s * (hbAt(z) - 0.6), dY(z) + 0.25, z, 'y', 6);
      // boats on the deckhouse roof with davits
      b.add(MAT.black, new THREE.CapsuleGeometry(0.8, 4.5, 4, 8), s * 3.4, roofY + 0.95, 0.5, [HP, 0, 0], [1.15, 1, 0.8]);
      b.box(MAT.orange, 1.0, 0.2, 3.4, s * 3.4, roofY + 1.15, 0.5);
      for (const z of [-1.6, 2.6]) { b.tube(dark, [s * 4.2, roofY, z], [s * 4.2, roofY + 2.4, z], 0.09); b.tube(dark, [s * 4.2, roofY + 2.4, z], [s * 3.3, roofY + 2.7, z], 0.07); }
      // life rafts, life rings, doors, whip aerials, missile canisters
      for (const z of [10.2, 11.8]) b.cyl(MAT.white, 0.38, 0.38, 1.3, s * (A ? 3.6 : 4.3), roofY + 0.45, z, 'z', 8);
      b.add(MAT.orange, new THREE.TorusGeometry(0.36, 0.09, 6, 12), s * (A ? 4.76 : 4.97), fb + 1.6, -5, [0, HP, 0]);
      b.box(dark, 0.1, 2.0, 0.9, s * (A ? 4.74 : 4.92), fb + 1.1, 3); b.box(dark, 0.1, 2.0, 0.9, s * (A ? 4.74 : 4.92), fb + 1.1, -13);
      b.tube(gm, [s * 3.0, A ? fb + 6.2 : fb + 8.7, -13.5], [s * 3.3, (A ? fb + 6.2 : fb + 8.7) + 4.5, -13.2], 0.025, 4);
      b.add(sup, new THREE.CylinderGeometry(0.42, 0.42, 4.6, 8), s * 1.9, roofY + 1.15, 12.4, [0, 0, -s * 1.05]);
      // flight deck edge lines
      b.box(MAT.deckLine, 0.25, 0.04, 18, s * 4.7, fb + 0.03, 36);
      // deck-edge railings
      const pts = []; for (let z = -44; z <= 46; z += 6) pts.push([s * (hbAt(z) - 0.2), dY(z), z]);
      pts.push([s * (hbAt(47.2) - 0.2), fb, 47.2]);
      b.rail(gm, pts, 1.05, 3);
    }
    b.cyl(gm, 0.45, 0.45, 2.2, 0, dY(-41) + 0.5, -41, 'x', 8);
    b.tube(gm, [0, dY(-46), -46], [0, dY(-46) + 2.6, -46.3], 0.04, 4); b.tube(gm, [0, fb, 47], [0, fb + 3.0, 47.2], 0.04, 4);
    b.rail(gm, [[-(hbAt(47.2) - 0.2), fb, 47.2], [hbAt(47.2) - 0.2, fb, 47.2]], 1.05, 2.6);
    b.box(MAT.deckLine, 9.6, 0.04, 0.25, 0, fb + 0.03, 27);
    // hangar roof: gun platform and rails
    b.cyl(dark, 1.0, 1.1, 0.2, 0, hangarY + 0.1, 21, 'y', 12);
    b.rail(gm, [[-3.7, hangarY, 15], [-3.7, hangarY, 23.1], [3.7, hangarY, 23.1], [3.7, hangarY, 15]], 1.05, 2.7);
  }
  b.build(g);

  const model = { dims: { length: L, beam: B, height: fb + (A ? 17 : 19.5), draft }, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [], view: {} };
  if (lod === 0) {
    // weapons: twin deck gun forward, crew-served machine gun on the hangar roof
    const gun = makeTurret('deckgun', nation);
    gun.node.position.set(0, dY(-27) + 0.35, -27); gun.rest = 0; gun.arc = 2.4; gun.node.rotation.y = gun.rest; g.add(gun.node);
    const mg = makeTurret('mg', nation);
    mg.node.position.set(0, hangarY, 21); mg.rest = Math.PI; mg.arc = 2.3; mg.node.rotation.y = mg.rest; g.add(mg.node);
    model.turrets.push(gun, mg);
    // radars
    const r1 = makeRadar(nation, 3.6, 1.0); r1.position.set(0, A ? fb + 15.7 : fb + 17.2, A ? -6.1 : -5.5); g.add(r1);
    const r2 = makeRadar(nation, 1.7, 0.4); r2.position.set(0, A ? fb + 6.2 : fb + 8.7, -11.6); g.add(r2);
    model.spinners.push({ node: r1, axis: 'y', speed: 1.6 }, { node: r2, axis: 'y', speed: 3.0 });
    // decals
    const num = hullNumberMaterial(A ? 'K31' : '220', nation);
    g.add(hullDecal(num, 6.4, 3.2, HO, 2.3, -24, 1), hullDecal(num, 6.4, 3.2, HO, 2.3, -24, -1));
    for (const s of [-1, 1]) {
      const ins = sideDecal(MAT.insignia[nation], 2.6, 2.6, s * (A ? 4.27 : 4.5), fb + 2.3, 19, s);
      if (A) { ins.rotation.order = 'YXZ'; ins.rotation.x = -0.113; }
      g.add(ins);
    }
    g.add(deckDecal(MAT.helipad, 9.4, 9.4, 0, fb, 36.5));
    // walkable areas, obstacles, crew stations
    model.decks.push({ x0: -5.9, x1: 5.9, z0: -38, z1: 47, y: fb }, { x0: -3.2, x1: 3.2, z0: -45.5, z1: -38, y: fb + 1.1 },
      { x0: -3.7, x1: 3.7, z0: 14.6, z1: 23.2, y: hangarY });
    model.blocks.push({ x0: -4.9, x1: 4.9, z0: -17, z1: 14.4, y0: fb, y1: fb + 8.5 });
    const by = A ? roofY : fb + 6.0;
    model.posts.push({ x: 1.4, y: by, z: -12.4, yaw: 0, kind: 'bridge' }, { x: -1.4, y: by, z: -12.0, yaw: 0, kind: 'bridge' },
      { x: 5.4, y: fb, z: -20, yaw: -HP, kind: 'deck' }, { x: -5.4, y: fb, z: 2, yaw: HP, kind: 'deck' }, { x: 5.4, y: fb, z: 10, yaw: -HP, kind: 'deck' },
      { x: 0.6, y: fb, z: 45.5, yaw: Math.PI, kind: 'deck' }, { x: 4.0, y: fb, z: 29, yaw: HP, kind: 'flight' },
      { x: 0, y: dY(-40), z: -39.5, yaw: 0, kind: 'lookout' }, A ? { x: -5.3, y: fb, z: -30, yaw: HP, kind: 'deck' } : { x: 5.3, y: fb + 6.17, z: -7.2, yaw: -HP, kind: 'lookout' });
    model.smoke.push(new THREE.Vector3(0, A ? fb + 8.3 : fb + 10.3, A ? 7.6 : 7.5));
    model.view = { bridge: new THREE.Vector3(0, A ? fb + 5.3 : fb + 7.5, A ? -12.6 : -14.6), chase: 110, chaseH: 28 };
    model.helipad = { pos: new THREE.Vector3(0, fb, 36.5), r: 5 };
  }
  g.userData.model = model;
  return g;
}
