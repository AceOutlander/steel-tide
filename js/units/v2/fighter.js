// Stealth Fighter (v2): twin-engine air-superiority fighter. Aethia: chined nose, raked intakes, canted tails, flat
// thrust-vectoring nozzles. Extro: rounder nose, splitter-plate intakes, near-upright tails, round nozzles, ventral strakes.
// userData.model: dims, gearHeight, gear[3] (nose, left, right: legs with doors and bays, shown when the gear is down),
//   engines[2], burners[2], cockpit, pylons[4], view, nose, spinners [], turrets [],
//   surfaces { elevL, elevR (all-moving tailplanes, rotation.x), ailL, ailR (ailerons, rotation.x: new) },
//   rudders [left, right] (rotation.y about the canted hinge line).
import * as THREE from 'three';
import { Kit, C, S, airMats, loft, patch, stAt, surf, ogive, wingGeo, midSec, hinge, pivot, burnerCone, addPilot, gearLeg, lipSt, intakeMouth, nozzle, cached, fineDetail, cboxGeo } from './airkit.js';
import { buildAAM } from './ordnance.js';

const V3 = THREE.Vector3, PI = Math.PI;

export function buildFighter(nation, lod = 0) { const fine = fineDetail(); return cached(`fighter:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

function make(nation, lod, fine) {
  const M = airMats(nation), A = M.A, g = new THREE.Group(), P = M.P;
  const ex = A ? 0.75 : 0.8, engs = [new V3(-ex, 0, 9.85), new V3(ex, 0, 9.85)];
  const model = { dims: { length: 19, span: 13.6, height: 5 }, gearHeight: 2.06, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], surfaces: {}, rudders: [], view: { chase: 30, chaseH: 6 } };
  const shade = { lod, fine, under: M.under, soot: lod ? null : engs.map((p) => ({ p: new V3(p.x, 0.1, 8.9), r: 1.5, a: 0.5 })) };
  const k = new Kit(shade);
  // ---- shapes
  const nT = A ? 1.75 : 2.2, nB = A ? 2.3 : 2.4;
  const base = S(-8.3, 0.4, 0.32, 0.35, -0.02, nT, nB);
  const fuse = [...ogive(-9.5, base, 4, 0.72, -0.06), base, S(-7.0, 0.66, 0.48, 0.5, 0, nT, nB), S(-6.0, 0.84, 0.55, 0.62, 0, nT, nB), S(-5.0, 0.98, 0.6, 0.74, 0, nT, nB), S(-4.0, 1.08, 0.72, 0.82, 0, 2, 2.4),
    S(-3.0, 1.18, 0.9, 0.88, 0, 2.2, 2.6), S(-1.0, 1.24, 0.98, 0.92, 0, 2.4, 3), S(2.0, 1.22, 0.94, 0.92, 0, 2.6, 3), S(5.0, 1.0, 0.76, 0.84, 0, 2.6, 3), S(7.4, 0.62, 0.5, 0.62, 0, 2.4, 2.8), S(8.9, 0.22, 0.2, 0.28, 0, 2.2, 2.4)];
  const nx = A ? 4.5 : 3.2, rake = A ? -0.5 : 0, lip = S(-4.3, 0.6, 0.5, 0.56, -0.14, nx, nx, { x: 1.52, sk: rake, sx: A ? 0.25 : 0 });
  const nac = [lipSt(lip), lip, S(-3.3, 0.7, 0.56, 0.62, -0.14, nx, nx, { x: 1.52, sk: rake * 0.4 }), S(-1.0, 0.8, 0.6, 0.68, -0.1, 3.4, 4, { x: 1.48 }), S(2.0, 0.8, 0.6, 0.66, -0.06, 3, 3.6, { x: 1.3 }),
    S(5.5, 0.74, 0.56, 0.6, -0.02, 2.6, 3, { x: 1.0 }), S(8.25, A ? 0.58 : 0.62, A ? 0.46 : 0.6, A ? 0.46 : 0.6, 0, A ? 4 : 2, A ? 4 : 2, { x: ex })];
  const boom = [S(3.6, 0.1, 0.08, 0.08, -0.05, 3, 3, { x: 1.7 }), S(4.8, 0.5, 0.16, 0.18, -0.05, 3, 3, { x: 1.75 }), S(8.2, 0.46, 0.14, 0.16, -0.05, 3, 3, { x: 1.82 }), S(9.1, 0.08, 0.05, 0.05, -0.05, 3, 3, { x: 1.9 })];
  const wz = A ? -3.0 : -2.4, edge = (f) => (f < 0.035 ? 0.55 : 1);
  const wR = { x: 1.7, y: 0.02, z: wz, c: A ? 7.9 : 7.3, t: 0.042 }, wT = { x: 6.8, y: -0.06, z: wz + (A ? 5.4 : 4.6), c: 1.35, t: 0.04 };
  const wA = midSec(wR, wT, (4.2 - 1.7) / 5.1), wB = midSec(wR, wT, (6.5 - 1.7) / 5.1), HF = 0.75;
  const lerx = [{ x: 0.05, y: 0.1, z: A ? -8.7 : -7.0, c: A ? 5.9 : 4.6, t: 0.02 }, { x: A ? 1.15 : 1.3, y: 0.1, z: A ? -3.2 : -2.8, c: 0.4, t: 0.12 }];
  const cant = A ? 0.47 : 0.14, FH = 3.0, finRoot = [A ? 1.5 : 1.42, 0.32, 3.3];
  const fS = (h) => midSec({ x: 0, z: 0, c: 3.9, t: 0.05 }, { x: FH, z: 2.5, c: 1.3, t: 0.045 }, h / FH);
  const finPt = (h, f, s = 1) => { const q = fS(h); return [s * (finRoot[0] + Math.sin(cant) * h), finRoot[1] + Math.cos(cant) * h, finRoot[2] + q.z + f * q.c]; };
  const finRot = [0, 0, PI / 2 - cant], RF = 0.68;
  const stabS = [{ x: 1.85, y: -0.05, z: 5.5, c: 3.2, t: 0.045 }, { x: 4.55, y: -0.05, z: 7.9, c: 1.0, t: 0.04 }];
  const cz = [[-6.55, 0.03, 0.16], [-6.1, 0.3, 0.6], [-5.5, 0.52, 0.9], [-4.8, 0.62, 1], [-4.1, 0.56, 0.92], [-3.4, 0.36, 0.7], [-2.75, 0.06, 0.2]];
  const can = cz.map(([z, h, wk]) => { const f = stAt(fuse, z); return S(z, Math.min(f.w * 0.62, 0.56) * wk, h, 0.03, f.y + f.ht * 0.82, 2.3, 2); });

  if (lod) { // distant silhouette: one material
    k.add(P, loft(fuse, { seg: 8, step: 2.5, tint: (z, t) => (z > -6.3 && z < -3 && Math.abs(t - 0.5) < 0.15 ? 0.2 : 1) }));
    k.pair(P, loft(nac.slice(1), { seg: 6, step: 3, capA: true, capB: true }));
    k.pair(P, wingGeo([wR, wT], { n: 2, tip: 'flat' })); k.pair(P, wingGeo(stabS, { n: 2, tip: 'flat' }));
    k.pair(P, wingGeo([fS(0), fS(FH)], { n: 2, tip: 'flat' }), finRoot[0], finRoot[1], finRoot[2], finRot);
    k.build(g); g.userData.model = model;
    return g;
  }
  const seg = fine ? 28 : 16, step = fine ? 0.45 : 0.8, wn = fine ? 8 : 4;
  // ---- fuselage, intakes and engine bays, tail booms
  k.add(P, loft(fuse, { seg, step, tint: (z, t) => (z > -6.45 && z < -2.85 && Math.abs(t - 0.5) < 0.085 ? 0.13 : z < -8.9 ? 0.7 : 1) }));
  k.pair(P, loft(nac, { seg: fine ? 20 : 12, step }));
  k.pair(P, loft(boom, { seg: 10, step: 0.8 }));
  k.add(P, loft([S(-4.2, 1.5, 0.2, 0.3, 0.02, 3, 3), S(-3.0, 2.0, 0.3, 0.42, 0, 3, 3), S(1.0, 2.05, 0.32, 0.5, -0.02, 3, 3), S(4.5, 1.9, 0.3, 0.45, -0.02, 3, 3), S(7.4, 1.5, 0.2, 0.3, 0, 3, 3), S(8.7, 1.1, 0.1, 0.14, 0, 3, 3)], { seg: 16, step: 0.8 }));   // blended centre body between fuselage and engine bays
  for (const s of [-1, 1]) { k.mirror = s < 0; intakeMouth(k, lip, 1.3, 0.78); } k.mirror = false;
  if (!A) for (const s of [-1, 1]) { k.cbox(M.bodyDark, 0.05, 1.2, 1.5, 0.015, s * 0.9, -0.12, -4.5, [0, s * 0.04, 0]); k.box(C.black, 0.06, 0.9, 0.3, s * 0.95, -0.12, -3.95); }   // splitter plates
  // chines / leading-edge extensions running back into the wing roots
  k.pair(P, wingGeo(lerx, { n: 3, tint: edge }));
  // ---- wings: fixed panels, ailerons on their own hinges
  k.pair(P, wingGeo([wR, wA], { n: wn, tint: edge })); k.pair(P, wingGeo([wA, wB], { n: wn, c1: HF, tint: edge })); k.pair(P, wingGeo([wB, wT], { n: wn, tip: 'round', tint: edge }));
  for (const s of [-1, 1]) {
    const a = [s * 4.22, wA.y, wA.z + HF * wA.c + 0.02], b = [s * 6.48, wB.y, wB.z + HF * wB.c + 0.02], h = hinge(g, s > 0 ? a : b, s > 0 ? [b[0] - a[0], b[1] - a[1], b[2] - a[2]] : [a[0] - b[0], a[1] - b[1], a[2] - b[2]], 'x');
    const q = new Kit({ ...shade, base: h.inv }); q.add(P, wingGeo([midSec(wA, wB, 0.01), midSec(wA, wB, 0.99)], { n: 4, c0: HF + 0.004, tip: 'flat', root: true }), 0, 0, 0, null, null, { mirror: s < 0 }); q.build(h.inner);
    model.surfaces[s > 0 ? 'ailR' : 'ailL'] = h.inner;
  }
  // ---- tails: fixed fins with hinged rudders, all-moving tailplanes
  k.pair(P, wingGeo([fS(0), fS(0.42)], { n: wn, tint: edge }), finRoot[0], finRoot[1], finRoot[2], finRot, null, { uv: [0, 5] });
  k.pair(P, wingGeo([fS(0.42), fS(2.76)], { n: wn, c1: RF, tint: edge }), finRoot[0], finRoot[1], finRoot[2], finRot, null, { uv: [0, 5] });
  k.pair(P, wingGeo([fS(2.76), fS(FH)], { n: wn, tip: 'round', tint: edge }), finRoot[0], finRoot[1], finRoot[2], finRot, null, { uv: [0, 5] });
  for (const s of [-1, 1]) {
    const a = finPt(0.43, RF, s), b = finPt(2.75, RF, s), h = hinge(g, a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], 'y');
    const q = new Kit({ ...shade, base: h.inv }); q.add(P, wingGeo([fS(0.44), fS(2.74)], { n: 4, c0: RF + 0.006, tip: 'flat', root: true }), finRoot[0], finRoot[1], finRoot[2], finRot, null, { mirror: s < 0, uv: [0, 5] }); q.build(h.inner);
    model.rudders.push(h.inner);
    const pv = pivot(g, s * 1.45, -0.05, 6.9), e = new Kit({ ...shade, base: pv.inv });
    e.add(P, wingGeo(stabS, { n: wn, tip: 'round', root: true, tint: edge }), 0, 0, 0, null, null, { mirror: s < 0, uv: [3, 0] }); e.build(pv.g);
    model.surfaces[s > 0 ? 'elevR' : 'elevL'] = pv.g;
  }
  // ---- nozzles and afterburner plumes
  for (const s of [-1, 1]) {
    if (A) { // flat thrust-vectoring nozzle: upper and lower flaps, burnt inside
      const nz = [S(8.2, 0.58, 0.46, 0.46, 0, 5, 5, { x: s * ex }), S(9.0, 0.56, 0.36, 0.36, 0, 6, 6, { x: s * ex }), S(9.85, 0.52, 0.17, 0.17, 0, 7, 7, { x: s * ex })];
      k.add(C.titan, loft(nz, { seg: 16, step: 0.5 })); k.add(C.hot, loft(nz.slice(1), { seg: 16, step: 1, inside: true, grow: -0.03 }));
      k.add(C.black, loft([S(9.0, 0.5, 0.3, 0.3, 0, 6, 6, { x: s * ex }), S(9.02, 0.5, 0.3, 0.3, 0, 6, 6, { x: s * ex })], { seg: 12, step: 1, capB: true }));
      if (fine) for (const y of [0.3, -0.3]) for (let i = 0; i < 3; i++) k.box(C.hot, 0.02, 0.02, 1.0, s * ex + (i - 1) * 0.3, y * (1 - 0.3), 9.2, [y > 0 ? 0.24 : -0.24, 0, 0]);
    } else nozzle(k, s * ex, 0, 8.2, 0.56, 1.65, fine);
    const p = new V3(s * ex, 0, 9.85); model.engines.push(p); const bc = burnerCone(p, A ? 0.42 : 0.46, 5.5); g.add(bc); model.burners.push(bc);
    if (!A) k.add(P, wingGeo([{ x: 0, z: 0, c: 2.6, t: 0.05 }, { x: 0.9, z: 1.3, c: 1.0, t: 0.05 }], { n: 3, tip: 'flat' }), s * 1.25, -0.5, 5.2, [0, 0, s > 0 ? -PI / 2 + 0.5 : -PI / 2 - 0.5]);   // ventral strakes
  }
  // ---- canopy: one-piece bubble on a dark cockpit tub, bow and sill frames, ejection seat and pilot, head-up display
  k.add(M.G, loft(can, { arc: [0.24, 0.76], seg: fine ? 18 : 10, step: 0.22 }));
  for (const [t0, t1] of [[0.24, 0.262], [0.738, 0.76]]) k.add(M.frame, patch(can, -6.5, -2.8, t0, t1, 0.012, 1, 0.22));
  for (const [z, wd] of A ? [[-3.3, 0.12]] : [[-5.55, 0.08], [-3.3, 0.12]]) k.add(M.frame, patch(can, z - wd / 2, z + wd / 2, 0.24, 0.76, 0.014, 12, 1));
  k.add(M.frame, patch(can, -2.95, -2.75, 0.24, 0.76, 0.014, 8, 1));
  addPilot(k, M, 0, 0.95, -4.95, { lean: 0.28 });
  k.cbox(C.black, 0.62, 0.2, 0.5, 0.05, 0, 0.62, -5.75, [0.18, 0, 0]);
  if (fine) { k.box(C.lensBlue, 0.2, 0.17, 0.008, 0, 0.84, -5.72, [-0.5, 0, 0]); k.box(C.dark, 0.02, 0.2, 0.02, -0.1, 0.8, -5.7, [-0.5, 0, 0]); k.box(C.dark, 0.02, 0.2, 0.02, 0.1, 0.8, -5.7, [-0.5, 0, 0]); k.cbox(C.dark, 0.5, 0.18, 0.4, 0.04, 0, 0.56, -4.0); }
  // ---- weapons: bay doors on the belly, wing pylons with missiles
  const by = (z) => surf(fuse, z, 0, 0.004).y;
  for (const x of [-0.5, 0, 0.5]) k.box(C.black, 0.02, 0.012, 3.5, x, by(0.4), 0.4);
  for (const z of [-1.35, 2.15]) k.box(C.black, 1.0, 0.012, 0.02, 0, by(z), z);
  const stations = A ? [[2.75, 1.2]] : [[2.75, 1.2], [4.4, 2.2]];
  for (const s of [-1, 1]) {
    for (const [px, pz] of stations) {
      const wy = midSec(wR, wT, (px - 1.7) / 5.1).y - 0.1;
      k.add(M.bodyDark, wingGeo([{ x: 0, z: pz - 0.9, c: 1.7, t: 0.07 }, { x: 0.3, z: pz - 0.6, c: 1.3, t: 0.07 }], { n: 3 }), s * px, wy, 0, [0, 0, -PI / 2]);
      k.box(C.gun, 0.07, 0.06, 2.2, s * px, wy - 0.33, pz + 0.1); k.parts(buildAAM(), s * px, wy - 0.46, pz + 0.1, [0, 0, PI / 4]);
    }
    if (!A) { k.box(C.gun, 0.06, 0.07, 2.0, s * 6.86, -0.07, wT.z + 0.5); k.parts(buildAAM(), s * 6.97, -0.07, wT.z + 0.4, [0, 0, PI / 4], 0.8); }
    model.pylons.push(new V3(s * 0.9, -1.0, 0.2), new V3(s * 2.7, -0.35, 1.2));
  }
  // ---- probes, antennas, lights, hook, markings
  k.tube(C.steel, [0, -0.06, -9.48], [0, -0.06, -10.3], 0.03, 6, 0.01);
  for (const s of [-1, 1]) {
    const v = surf(fuse, -7.6, s > 0 ? 0.2 : 0.8, 0); k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.16, t: 0.1 }, { x: 0.14, z: 0.08, c: 0.06, t: 0.1 }], { n: 2 }), v.x, v.y, v.z, [0, 0, s > 0 ? -0.5 : PI + 0.5]);   // angle-of-attack vanes
    k.box(C.form, 0.012, 0.09, 0.55, s * (stAt(fuse, -7.2).w * 0.985), 0.03, -7.2, [0, s * -0.22, 0]);
    const ft = finPt(1.5, 0.3, s); k.box(C.form, 0.014, 0.5, 0.09, ft[0] + s * 0.06, ft[1], ft[2], [0, 0, -s * cant]);
    const tp = finPt(FH, 0.75, s); k.sphere(C.lampWhite, 0.028, tp[0], tp[1] + 0.02, tp[2], null, 6);
    k.sphere(s < 0 ? C.lampRed : C.lampGreen, 0.05, s * 6.84, -0.06, wT.z + 0.35, [1, 0.7, 2], 8);
    k.decal(M.insignia, 1.5, s * 4.3, midSec(wR, wT, 0.5).y + 0.085, wz + 4.9, 'up');
    const nz = stAt(nac, -2.3); k.decal(M.insignia, 0.8, s * (nz.x + nz.w + 0.012), nz.y, -2.3, s > 0 ? 'right' : 'left');
    if (fine) for (const f of [0.3, 0.6, 0.9]) { const q = midSec(wA, wT, f); k.tube(C.gun, [s * q.x, q.y, q.z + q.c], [s * q.x, q.y, q.z + q.c + 0.3], 0.008, 3); }   // static wicks
  }
  k.box(C.black, 0.1, 0.04, 0.7, 1.15, 0.2, -3.6); k.cyl(C.gun, 0.045, 0.045, 0.3, 1.15, 0.18, -3.95, 'z', 8);                       // cannon port in the starboard wing root
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.5, t: 0.08 }, { x: 0.36, z: 0.25, c: 0.2, t: 0.08 }], { n: 2, tip: 'flat' }), 0, surf(fuse, 1.4, 0.5, -0.02).y, 1.3, [0, 0, PI / 2]);
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.45, t: 0.08 }, { x: 0.3, z: 0.2, c: 0.18, t: 0.08 }], { n: 2, tip: 'flat' }), 0, by(-2.6) + 0.02, -2.7, [0, 0, -PI / 2]);
  k.sphere(C.lampRed, 0.055, 0, surf(fuse, 3.2, 0.5, 0).y, 3.2, [1, 0.7, 1.5], 8); k.sphere(C.lampRed, 0.055, 0, by(3.5), 3.5, [1, 0.7, 1.5], 8);
  k.tube(C.gun, [0, by(6.2) + 0.03, 6.2], [0, by(8.3) - 0.1, 8.5], 0.045, 6); k.cbox(C.iron, 0.09, 0.12, 0.2, 0.02, 0, by(8.3) - 0.14, 8.58);       // arrestor hook
  model.nose = { pos: new V3(0, -0.06, -9.5), radius: 0.62 };
  k.build(g);
  // ---- landing gear: nose leg and two mains, each with its doors and dark bay (hidden with the leg)
  const door = (q, x, y, z, w, l, ang) => q.add(M.bodyDark, cboxGeo(0.03, w, l, 0.012), x, y - Math.cos(ang) * w * 0.5, z, [0, 0, ang]);
  const noseY = by(-5.6), mainY = surf(nac, 1.2, 0, 0).y;
  model.gear.push(gearLeg(M, 0, -0.6, -5.6, 1.16, 0.3, { fork: true, light: true, brace: -1, fine, extra: (q) => { q.box(C.black, 0.5, 0.01, 1.6, 0, noseY + 0.595, 0.2); for (const s of [-1, 1]) door(q, s * 0.27, noseY + 0.6, 0.2, 0.42, 1.6, s * 0.12); } }));
  for (const s of [-1, 1]) model.gear.push(gearLeg(M, s * 1.7, -0.55, 1.2, 1.09, 0.42, { side: s, brace: 1, fine, extra: (q) => { q.box(C.black, 0.75, 0.01, 1.9, -s * 0.1, mainY + 0.545, 0.3); door(q, s * 0.3, mainY + 0.55, 0.3, 0.55, 1.9, s * 0.2); door(q, -s * 0.5, mainY + 0.55, 0.3, 0.3, 1.9, -s * 0.5); } }));
  for (const leg of model.gear) g.add(leg);
  model.cockpit = new V3(0, 0.95, -4.95);
  g.userData.model = model;
  return g;
}
