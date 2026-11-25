// Heavy Bomber (v2): swing-wing strike aircraft, four engines in two underwing nacelles, internal bomb bay.
// userData.model: dims, gearHeight, gear[3], engines[4], burners[4], cockpit, pylons[3], bay (bomb release point), view, nose,
//   swing [leftWingGroup, rightWingGroup] with swingSign [1, -1]: swing[i].rotation.y = swingSign[i] * sweep
//   (0 = spread, up to 0.85 rad = fully swept),
//   surfaces { elevL, elevR } (all-moving tailplanes, rotation.x: new), rudders [rudder] (rotation.y: new).
import * as THREE from 'three';
import { Kit, C, S, airMats, loft, patch, stAt, surf, ogive, wingGeo, midSec, hinge, pivot, burnerCone, gearLeg, lipSt, intakeMouth, nozzle, cached, fineDetail, cboxGeo, tyreGeo } from './airkit.js';

const V3 = THREE.Vector3, PI = Math.PI;

export function buildBomber(nation, lod = 0) { const fine = fineDetail(); return cached(`bomber:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

function make(nation, lod, fine) {
  const M = airMats(nation), A = M.A, g = new THREE.Group(), P = M.P;
  const model = { dims: { length: 44, span: 41, height: 10 }, gearHeight: 3.7, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], swing: [], swingSign: [1, -1], surfaces: {}, rudders: [], view: { chase: 62, chaseH: 12 } };
  const NX = 4.2, NY = -1.95, exs = [-NX - 0.85, -NX + 0.85, NX - 0.85, NX + 0.85];
  const shade = { lod, fine, under: M.under, soot: lod ? null : [-NX, NX].map((x) => ({ p: new V3(x, NY + 0.4, 11.4), r: 2.6, a: 0.5 })) };
  const k = new Kit(shade);
  // ---- shapes
  const wk = A ? 0.96 : 1, n = 2.3, nb = A ? 2.4 : 2.9;
  const base = S(-19.4, 0.84 * wk, 0.82, 0.76, 0, n, nb);
  const fuse = [...ogive(-22, base, 5, 0.66, -0.2), base, S(-17.4, 1.2 * wk, 1.26, 1.1, 0.02, n, nb), S(-14, 1.5 * wk, 1.5, 1.4, 0, n, nb), S(-8, 1.75 * wk, 1.65, 1.6, 0, n, nb), S(0, 1.85 * wk, 1.7, 1.7, 0, n, nb),
    S(8, 1.7 * wk, 1.6, 1.55, 0, n, nb), S(14, 1.3 * wk, 1.3, 1.2, 0.1, n, n), S(19, 0.75, 0.9, 0.7, 0.3, n, n), S(21.6, 0.32, 0.4, 0.34, 0.48), S(22, 0.12, 0.14, 0.12, 0.5)];
  const top = (z) => surf(fuse, z, 0.5, 0).y, bot = (z) => surf(fuse, z, 0, 0).y, edge = (f) => (f < 0.03 ? 0.6 : 1);
  const spine = [[-11, 0.15, 0.08], [-7, 0.42, 0.34], [9, 0.42, 0.34], [13.5, 0.2, 0.1]].map(([z, w, h]) => S(z, w, h, 0.3, top(z) - 0.1, 3, 2));
  const glove = [{ x: 0.7, y: -0.3, z: -13.6, c: 16.4, t: 0.045 }, { x: 6.3, y: -0.12, z: -2.7, c: 4.9, t: 0.11 }];
  const shoulder = [{ x: 0.9, y: -0.35, z: 1.0, c: 10.6, t: 0.06 }, { x: 6.1, y: -0.2, z: 1.6, c: 7.2, t: 0.07 }];
  const PX = 5.2, PY = -0.05, PZ = -0.5;
  const wR = { x: 4.7, y: PY, z: -2.85, c: 5.3, t: 0.09 }, wT = { x: 20.5, y: 0.26, z: -0.2, c: 2.0, t: 0.075 };
  const lip = S(1.6, 1.72, 1.35, 0.8, NY, 5, 5, { x: NX, sk: A ? -0.35 : 0 });
  const nac = [lipSt(lip, 0.06, 0.07), lip, S(3.2, 1.78, 1.45, 0.86, NY, 5, 5, { x: NX }), S(9, 1.72, 1.45, 0.86, NY, 5, 5, { x: NX }), S(11.0, 1.58, 1.05, 0.8, NY, 4, 4, { x: NX })];
  const FH = 5.9, finY = 1.05, fS = (h) => midSec({ x: 0, z: 10.5, c: 8.5, t: 0.06 }, { x: FH, z: 16.6, c: 3.0, t: 0.06 }, h / FH), RF = 0.7;
  const stabS = [{ x: 0.2, y: 3.3, z: 14.6, c: 4.6, t: 0.06 }, { x: 6.65, y: 3.3, z: 18.3, c: 1.6, t: 0.05 }];

  if (lod) {
    k.add(P, loft(fuse, { seg: 8, step: 4, tint: (z) => (z < -19.6 ? 0.5 : 1) }));
    k.pair(P, wingGeo(glove, { n: 2 })); k.pair(P, wingGeo(shoulder, { n: 2, tip: 'flat' })); k.pair(P, loft(nac.slice(1), { seg: 6, step: 5, capA: true, capB: true }));
    k.pair(P, wingGeo([{ ...wR, x: wR.x - PX, z: wR.z - PZ, y: 0 }, { ...wT, x: wT.x - PX, z: wT.z - PZ, y: wT.y - PY }], { n: 2, tip: 'flat' }), PX, PY, PZ, [0, -0.3, 0]);
    k.add(P, wingGeo([fS(0), fS(FH)], { n: 2, tip: 'flat' }), 0, finY, 0, [0, 0, PI / 2]); k.pair(P, wingGeo(stabS, { n: 2, tip: 'flat' }));
    k.build(g); g.userData.model = model;
    return g;
  }
  const seg = fine ? 32 : 18, step = fine ? 0.8 : 1.5, wn = fine ? 8 : 4;
  // ---- fuselage (dark radome), spine, flight-deck glazing
  k.add(P, loft(fuse, { seg, step, tint: (z) => (z < -19.7 ? 0.5 : z > 21.3 ? 0.5 : 1) }));
  k.add(P, loft(spine, { seg: 10, step: 2, arc: [0.2, 0.8] }));
  for (const [z0, z1, t0, t1] of [[-18.75, -17.5, 0.39, 0.492], [-18.75, -17.5, 0.508, 0.61], [-17.38, -16.5, 0.335, 0.405], [-17.38, -16.5, 0.595, 0.665], [-17.38, -16.9, 0.425, 0.475], [-17.38, -16.9, 0.525, 0.575]])
    k.add(M.GD, patch(fuse, z0, z1, t0, t1, 0.01, fine ? 6 : 3, 0.3));
  if (fine) for (const [z0, z1, t0, t1] of [[-18.8, -17.45, 0.492, 0.508], [-17.5, -17.38, 0.33, 0.67], [-18.82, -18.75, 0.385, 0.615]]) k.add(M.frame, patch(fuse, z0, z1, t0, t1, 0.014, 6, 0.3));
  // ---- fixed wing: glove out to the pivots, shoulder over the engines, pivot fairings
  k.pair(P, wingGeo(glove, { n: wn, tint: edge })); k.pair(P, wingGeo(shoulder, { n: wn, tip: 'flat' }));
  for (const s of [-1, 1]) { k.cyl(M.body, 1.5, 1.75, 0.5, s * PX, PY + 0.12, PZ, 'y', 20); k.sphere(M.body, 1.5, s * PX, PY + 0.36, PZ, [1, 0.12, 1], 18); }
  // ---- swing wings: each built in its own pivot group
  for (const s of [-1, 1]) {
    const pv = pivot(g, s * PX, PY, PZ), q = new Kit({ ...shade, base: pv.inv });
    q.add(P, wingGeo([wR, wT], { n: wn, tip: 'round', root: true, tint: edge }), 0, 0, 0, null, null, { mirror: s < 0 });
    q.lathe(M.bodyDark, [[-0.9, 0.02], [-0.5, 0.13], [0.9, 0.13], [1.4, 0.02]], 8, s * 20.52, 0.27, 0.9);
    q.decal(M.insignia, 2.6, s * 14.6, midSec(wR, wT, 0.63).y + 0.15, 0.55, 'up');
    if (fine) for (const f of [0.3, 0.5, 0.7, 0.9]) { const w = midSec(wR, wT, f); q.box(M.frame, 0.03, 0.012, w.c * 0.3, s * w.x, w.y + 0.5 * w.t * w.c * 0.72, w.z + w.c * 0.78); }   // spoiler / flap track lines
    q.build(pv.g); model.swing[s > 0 ? 1 : 0] = pv.g;                                                                      // (two draw calls a wing: paint and insignia)
    k.sphere(s < 0 ? C.lampRed : C.lampGreen, 0.08, s * 6.42, -0.1, -2.35, [1, 0.7, 2], 8);                                  // navigation lights on the fixed glove
  }
  // ---- engine nacelles: twin intakes with a splitter, four nozzles, afterburner plumes
  k.pair(P, loft(nac, { seg: fine ? 20 : 12, step: 1.2, capB: true }));
  for (const s of [-1, 1]) {
    k.mirror = s < 0; intakeMouth(k, lip, 1.8, 0.86, false);
    k.add(M.bodyDark, wingGeo([{ x: 0, z: 0.7, c: 2.6, t: 0.06 }, { x: 2.0, z: 1.5, c: 1.8, t: 0.06 }], { n: 3, tip: 'flat', root: true }), NX, NY - 0.75, 0, [0, 0, PI / 2]);
    if (!A) k.cbox(M.bodyDark, 3.5, 0.1, 2.2, 0.03, NX, NY + 1.42, 2.4);
    k.mirror = false;
  }
  for (const x of exs) {
    nozzle(k, x, NY, 10.75, 0.68, 1.8, fine);
    const p = new V3(x, NY, 12.55); model.engines.push(p); const bc = burnerCone(p, 0.55, 7); g.add(bc); model.burners.push(bc);
  }
  // ---- tail: fin with hinged rudder, bullet fairing, all-moving tailplanes
  k.add(P, wingGeo([fS(0), fS(0.6)], { n: wn, tint: edge }), 0, finY, 0, [0, 0, PI / 2], null, { uv: [0, 9] });
  k.add(P, wingGeo([fS(0.6), fS(5.3)], { n: wn, c1: RF, tint: edge }), 0, finY, 0, [0, 0, PI / 2], null, { uv: [0, 9] });
  k.add(P, wingGeo([fS(5.3), fS(FH)], { n: wn, tip: 'flat', tint: edge }), 0, finY, 0, [0, 0, PI / 2], null, { uv: [0, 9] });
  { const a = [0, finY + 0.62, fS(0.62).z + RF * fS(0.62).c], b = [0, finY + 5.28, fS(5.28).z + RF * fS(5.28).c], h = hinge(g, a, [0, b[1] - a[1], b[2] - a[2]], 'y');
    const q = new Kit({ ...shade, base: h.inv }); q.add(P, wingGeo([fS(0.63), fS(5.27)], { n: 4, c0: RF + 0.004, tip: 'flat', root: true }), 0, finY, 0, [0, 0, PI / 2], null, { uv: [0, 9] }); q.build(h.inner); model.rudders.push(h.inner); }
  k.lathe(M.bodyDark, [[-1.9, 0.03], [-1.1, 0.3], [0.9, 0.32], [2.0, 0.05]], 12, 0, finY + FH + 0.1, 18.1);
  k.sphere(C.lampRed, 0.08, 0, finY + FH + 0.12, 20.1, [1, 1, 1.6], 8); k.sphere(C.lampWhite, 0.07, 0, 0.5, 22.02, null, 8);
  for (const s of [-1, 1]) {
    const pv = pivot(g, s * 0.3, 3.3, 16.9), q = new Kit({ ...shade, base: pv.inv });
    q.add(P, wingGeo(stabS, { n: wn, tip: 'round', root: true, tint: edge }), 0, 0, 0, null, null, { mirror: s < 0, uv: [6, 0] }); q.build(pv.g);
    model.surfaces[s > 0 ? 'elevR' : 'elevL'] = pv.g;
    k.sphere(M.body, 0.5, s * 0.22, 3.3, 16.9, [0.5, 0.6, 3.2], 12);                                                        // tailplane root fairing
    if (!A) { k.add(P, wingGeo([{ x: 0, z: 0, c: 3.6, t: 0.05 }, { x: 1.4, z: 1.8, c: 1.6, t: 0.05 }], { n: 3, tip: 'flat' }), s * 1.2, bot(15) + 0.5, 14.6, [0, 0, s > 0 ? -PI / 2 + 0.3 : -PI / 2 - 0.3]);   // ventral strakes
      k.add(P, wingGeo([{ x: 0, z: 0, c: 1.6, t: 0.06 }, { x: 1.5, z: 0.9, c: 0.6, t: 0.06 }], { n: 3, tip: 'flat' }), s * stAt(fuse, -16.5).w * 0.9, -0.1, -17.2, [0, 0, s > 0 ? -0.25 : PI + 0.25]); }                 // nose vanes
    k.decal(M.insignia, 1.6, s * (stAt(fuse, -9.5).w + 0.02), 0.12, -9.5, s > 0 ? 'right' : 'left');
    k.box(C.form, 0.014, 0.12, 1.0, s * (stAt(fuse, -15).w * 0.992), 0.2, -15, [0, s * -0.1, 0]); k.box(C.form, 0.014, 0.12, 1.0, s * (stAt(fuse, 12).w + 0.006), 0.25, 12, [0, s * 0.1, 0]);
  }
  // ---- bomb bay doors, probes, antennas, lights
  for (const s of [-1, 1]) k.box(C.black, 0.03, 0.012, 12, s * 0.95, bot(-3) + 0.05, -3);
  for (const z of [-9, -3, 3]) k.box(C.black, 1.9, 0.012, 0.03, 0, bot(z) - 0.003, z);
  k.box(C.black, 0.03, 0.012, 12, 0, bot(-3) - 0.004, -3);
  k.tube(C.steel, [0, -0.2, -21.98], [0, -0.2, -23.2], 0.04, 6, 0.012);
  for (const [z, up] of [[-6, 1], [3, 1], [-11, -1], [6, -1]]) k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.75, t: 0.08 }, { x: 0.5, z: 0.35, c: 0.3, t: 0.08 }], { n: 2, tip: 'flat' }), 0, up > 0 ? top(z) + 0.18 : bot(z) + 0.02, z, [0, 0, (up * PI) / 2]);
  k.sphere(C.lampRed, 0.09, 0, top(-2) + 0.26, -2, [1, 0.7, 1.5], 8); k.sphere(C.lampRed, 0.09, 0, bot(7), 7, [1, 0.7, 1.5], 8);
  if (fine) { for (const s of [-1, 1]) { const v = surf(fuse, -19.2, s > 0 ? 0.22 : 0.78, 0); k.tube(C.steel, [v.x, v.y, v.z], [v.x + s * 0.12, v.y, v.z - 0.5], 0.02, 5, 0.008); } k.cyl(C.red, 0.2, 0.2, 0.012, 0, top(-13.5) + 0.004, -13.5, 'y', 14); }
  model.nose = { pos: new V3(0, -0.2, -22), radius: 0.6 };
  k.build(g);
  // ---- landing gear: nose leg, two four-wheel main bogies
  const door = (q, x, y, z, w, l, ang) => q.add(M.bodyDark, cboxGeo(0.04, w, l, 0.015), x, y - Math.cos(ang) * w * 0.5, z, [0, 0, ang]);
  const ny = bot(-14) + 1.2, my = -0.62 + 0.6;
  model.gear.push(gearLeg(M, 0, -1.2, -14, 2.0, 0.5, { twin: true, light: true, brace: -1, fine, extra: (q) => { q.box(C.black, 0.9, 0.012, 2.4, 0, ny - 0.01, 0.3); for (const s of [-1, 1]) door(q, s * 0.5, ny, 0.3, 0.7, 2.4, s * 0.1); } }));
  for (const s of [-1, 1]) model.gear.push(gearLeg(M, s * 2.1, -0.6, 3, 2.5, 0.6, { twin: true, brace: 1, fine, extra: (q) => {
    q.cbox(C.gearWhite, 0.16, 0.14, 1.9, 0.03, 0, -2.5, 0.55); for (const wx of [-0.27, 0.27]) { q.add(C.rubber, tyreGeo(0.6, 0.37, 18), wx, -2.5, 1.3); q.cyl(C.gearWhite, 0.35, 0.35, 0.29, wx, -2.5, 1.3, 'x', 14); }
    q.box(C.black, 1.1, 0.012, 3.4, 0, my - 0.02, 0.6); door(q, -s * 0.52, my + 0.05, 0.6, 0.9, 3.4, -s * 0.15);
  } }));
  for (const leg of model.gear) g.add(leg);
  model.bay = new V3(0, -2.3, -3);
  model.pylons.push(new V3(0, -2.3, -7), new V3(0, -2.3, -3), new V3(0, -2.3, 1));
  model.cockpit = new V3(0.55, 1.2, -17.2);
  g.userData.model = model;
  return g;
}
