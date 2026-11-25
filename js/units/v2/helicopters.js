// Helicopters (v2): tandem twin-rotor Transport and tandem-seat Attack helicopter.
// userData.model (both): dims, gearHeight (fixed gear, gear: []), engines[], burners [], cockpit, pylons[], view, nose,
//   spinners: rotor entries { node, axis, speed, blades, disc } (the sim hides `blades` and shows the blur `disc` at speed;
//   the hub with its grips keeps turning), rotorDisc / tailDisc (the same blur discs, hidden by default).
// Transport: seats [Vector3 x8], door (ground-level boarding point behind the lowered rear ramp), rotorDisc = forward
//   rotor, tailDisc = aft rotor.
// Attack: pylons [4 stub-wing stations], turrets [chin gun]: a makeTurret('chin')-shaped object (kind, node, pitch,
//   muzzles, rest, arc, minPitch, maxPitch, gunner, yaw, elev) plus `barrels`, the four-barrel cluster: spin it with
//   turret.barrels.rotation.z.
import * as THREE from 'three';
import { Kit, C, S, airMats, loft, patch, stAt, tAt, surf, ogive, wingGeo, makeRotor, addPilot, cached, fineDetail, tyreGeo, cboxGeo } from './airkit.js';
import { buildAGM, buildAAM } from './ordnance.js';

const V3 = THREE.Vector3, PI = Math.PI, TAU = PI * 2;

/* ------------------------------------------------------------------------------------------------------ shared pieces */

// wheel on a stub axle (fixed gear): tyre, hub, cap
function wheel(k, x, y, z, r, wd, side) {
  k.add(C.rubber, tyreGeo(r, wd, k.fine ? 20 : 12), x, y, z);
  k.cyl(C.gearWhite, r * 0.58, r * 0.58, wd * 0.8, x, y, z, 'x', 14); k.cyl(C.iron, r * 0.2, r * 0.2, wd * 0.95, x, y, z, 'x', 8);
  if (k.fine) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.cyl(C.dark, r * 0.07, r * 0.07, wd * 0.84, x, y + Math.sin(a) * r * 0.4, z + Math.cos(a) * r * 0.4, 'x', 5); }
  k.cyl(C.iron, 0.05, 0.05, wd * 0.5 + 0.12, x - side * (wd * 0.25 + 0.06), y, z, 'x', 8);
}
// engine exhaust pipe trailing +Z from (x, y, z), turned by rot: burnt outside with a rolled lip, sooty inside
function exhaust(k, x, y, z, r, len, rot) {
  k.lathe(C.burnt, [[0, r * 1.15], [len * 0.8, r], [len * 0.94, r * 1.04], [len, r * 0.98]], 14, x, y, z, rot);
  k.lathe(C.hot, [[len, r * 0.94], [0.02, r * 0.9]], 14, x, y, z, rot); k.add(C.black, new THREE.CircleGeometry(r * 0.9, 12), x, y, z, [rot[0], rot[1], rot[2]]);
}
// oleo shock strut between two points: painted cylinder at a, bright piston toward b
function oleo(k, a, b, r) {
  const m = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, a[2] + (b[2] - a[2]) * 0.55];
  k.tube(C.gearWhite, a, m, r, 10); k.tube(C.chrome, m, b, r * 0.62, 10);
  k.sphere(C.iron, r * 1.25, a[0], a[1], a[2], null, 8); k.sphere(C.iron, r * 1.1, b[0], b[1], b[2], null, 8);
}
// 19-tube rocket pod, nose toward -Z
function rocketPod(k, M, x, y, z) {
  const r = 0.26, L = 1.9, z0 = z - L / 2;
  k.lathe(M.bodyDark, [[-L / 2, r * 0.95], [-L / 2 + 0.06, r], [L / 2 - 0.55, r], [L / 2 - 0.1, r * 0.5], [L / 2, r * 0.3]], 16, x, y, z);
  k.cyl(C.dark, r * 0.95, r * 0.95, 0.02, x, y, z0 + 0.004, 'z', 16); k.cyl(C.gun, r * 0.3, r * 0.3, 0.02, x, y, z + L / 2, 'z', 10);
  k.cyl(C.yellow, r + 0.003, r + 0.003, 0.05, x, y, z0 + 0.3, 'z', 16, true); k.cyl(C.gun, r + 0.006, r + 0.006, 0.08, x, y, z - 0.25, 'z', 16, true); k.cyl(C.gun, r + 0.006, r + 0.006, 0.08, x, y, z + 0.3, 'z', 16, true);
  const tubes = [[0, 0]]; for (let i = 0; i < 6; i++) tubes.push([Math.cos((i / 6) * TAU) * 0.098, Math.sin((i / 6) * TAU) * 0.098]); for (let i = 0; i < 12; i++) tubes.push([Math.cos(((i + 0.5) / 12) * TAU) * 0.19, Math.sin(((i + 0.5) / 12) * TAU) * 0.19]);
  tubes.forEach(([dx, dy], i) => {
    k.cyl(C.black, 0.04, 0.04, 0.014, x + dx, y + dy, z0 - 0.006, 'z', k.fine ? 8 : 5);
    if (k.fine && i % 3 !== 1) k.lathe(C.olive, [[-0.05, 0.004], [-0.02, 0.022], [0.02, 0.03]], 6, x + dx, y + dy, z0 + 0.012);
  });
}
// The quad-barrel rotary chin cannon: rounded housing that slews (node), cradle that elevates (pitch), four barrels in a
// cluster that spins about the barrel axis (barrels), with clamps, muzzles and a linked ammunition feed chute.
function chinTurret(M, fine) {
  const node = new THREE.Group(), pitch = new THREE.Group(), barrels = new THREE.Group(), muzzles = [];
  node.add(pitch); pitch.add(barrels); pitch.position.set(0, -0.42, 0);
  const nb = new Kit({ fine }), pb = new Kit({ fine }), bb = new Kit({ fine });
  // housing: mounting ring, domed fairing, yoke cheeks with trunnion caps
  nb.cyl(C.iron, 0.36, 0.36, 0.05, 0, -0.02, 0, 'y', 20);
  if (fine) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; nb.cyl(C.steel, 0.016, 0.016, 0.02, Math.cos(a) * 0.32, -0.05, Math.sin(a) * 0.32, 'y', 5); }
  nb.sphere(C.gun, 0.33, 0, -0.06, 0.02, [1, 0.72, 1.12], 18);
  for (const s of [-1, 1]) {
    nb.add(C.gun, cboxGeo(0.07, 0.42, 0.34, 0.025), s * 0.2, -0.36, 0.02);
    nb.cyl(C.iron, 0.085, 0.085, 0.03, s * 0.245, -0.42, 0, 'x', 12); nb.cyl(C.steel, 0.03, 0.03, 0.05, s * 0.25, -0.42, 0, 'x', 6);
  }
  nb.add(C.gun, cboxGeo(0.3, 0.1, 0.2, 0.03), 0, -0.23, 0.2); // ammunition booster box on the back of the housing
  // cradle: receiver, drive motor, recoil dampers
  pb.add(C.gun, cboxGeo(0.24, 0.2, 0.46, 0.03), 0, 0, 0.06);
  pb.cyl(C.iron, 0.075, 0.075, 0.2, 0.0, -0.13, 0.12, 'z', 10); pb.cyl(C.gun, 0.11, 0.11, 0.1, 0, 0, -0.2, 'z', 14);
  for (const s of [-1, 1]) { pb.cyl(C.steel, 0.022, 0.022, 0.42, s * 0.14, 0.04, -0.12, 'z', 6); pb.cyl(C.iron, 0.032, 0.032, 0.18, s * 0.14, 0.04, 0.02, 'z', 8); }
  // feed chute: linked segments from the booster box round to the receiver's right side
  const chute = [[0.1, 0.19, 0.2], [0.24, 0.16, 0.22], [0.3, 0.06, 0.19], [0.27, -0.02, 0.13], [0.16, -0.01, 0.1]];
  const curve = new THREE.CatmullRomCurve3(chute.map((p) => new V3(...p))), NS = fine ? 14 : 7, cg = cboxGeo(0.058, 0.11, 0.04, 0.008), look = new THREE.Object3D();
  for (let i = 0; i <= NS; i++) { const p = curve.getPoint(i / NS), t = curve.getTangent(i / NS); look.position.copy(p); look.lookAt(p.clone().add(t)); pb.add(i % 2 ? C.iron : C.steel, cg, p.x, p.y, p.z, [look.rotation.x, look.rotation.y, look.rotation.z]); }
  // barrel cluster (spins): rear rotor drum, four barrels, two clamps, muzzle ring with bores
  bb.cyl(C.iron, 0.1, 0.1, 0.22, 0, 0, -0.36, 'z', 14); bb.cyl(C.steel, 0.022, 0.022, 1.2, 0, 0, -0.95, 'z', 6);
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + (i / 4) * TAU, x = Math.cos(a) * 0.056, y = Math.sin(a) * 0.056;
    bb.cyl(C.gun, 0.024, 0.027, 1.22, x, y, -0.96, 'z', 10); bb.cyl(C.iron, 0.031, 0.031, 0.1, x, y, -1.53, 'z', 10);
    bb.cyl(C.lens, 0.016, 0.016, 0.006, x, y, -1.582, 'z', 8);
  }
  bb.cyl(C.iron, 0.095, 0.095, 0.035, 0, 0, -0.8, 'z', 14); bb.cyl(C.iron, 0.09, 0.09, 0.03, 0, 0, -1.2, 'z', 14); bb.cyl(C.steel, 0.093, 0.093, 0.045, 0, 0, -1.47, 'z', 14);
  nb.build(node); pb.build(pitch); bb.build(barrels);
  const mz = new THREE.Object3D(); mz.position.set(0, 0, -1.6); pitch.add(mz); muzzles.push(mz);
  return { kind: 'chin', node, pitch, muzzles, rest: 0, arc: 1.9, minPitch: -1.0, maxPitch: 0.25, gunner: null, yaw: 0, elev: 0, barrels };
}

/* -------------------------------------------------------------------------------------------------- attack helicopter */

export function buildAttackHeli(nation, lod = 0) { const fine = fineDetail(); return cached(`attackheli:${nation}:${lod}:${fine}`, () => makeAttack(nation, lod, fine)); }

function makeAttack(nation, lod, fine) {
  const M = airMats(nation), A = M.A, g = new THREE.Group(), P = M.P;
  const hubP = new V3(0, 2.38, 0.2), tailP = new V3(-0.34, 1.7, 7.1), engs = [new V3(-1.0, 0.78, 2.9), new V3(1.0, 0.78, 2.9)];
  const model = { dims: { length: 15, span: 14.6, height: 4.6 }, gearHeight: 2.1, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], view: { chase: 26, chaseH: 7 } };
  const k = new Kit({ lod, fine, under: M.under, soot: lod ? null : engs.map((p) => ({ p: new V3(p.x * 1.15, p.y, p.z - 0.3), r: 1.5, a: 0.6 })) });
  const nT = A ? 2.7 : 3.6, nB = A ? 3.2 : 4.2;
  const base = S(-5.45, 0.43, 0.46, 0.46, -0.22, nT, nB);
  const fuse = [...ogive(-6.02, base, 3, 0.5, -0.28), base,
    S(-4.7, 0.58, 0.6, 0.66, -0.2, nT, nB), S(-3.9, 0.69, 0.73, 0.74, -0.2, nT, nB), S(-3.0, 0.77, 0.92, 0.8, -0.2, nT, nB), S(-2.1, 0.81, 1.08, 0.82, -0.2, nT, nB),
    S(-1.2, 0.85, 1.25, 0.82, -0.2, nT, nB), S(0.2, 0.87, 1.3, 0.82, -0.2, nT, nB), S(1.6, 0.75, 1.2, 0.68, -0.15, nT, nB), S(2.6, 0.5, 0.82, 0.42, 0.02, 2.4, 2.6),
    S(3.5, 0.34, 0.4, 0.36, 0.2, 2.2, 2.2), S(7.4, 0.17, 0.2, 0.19, 0.35), S(7.85, 0.06, 0.08, 0.08, 0.38)];
  const dog = [S(-1.6, 0.2, 0.12, 0.3, 1.0, 2.6), S(-0.9, 0.48, 0.42, 0.4, 1.1, 2.6), S(0.2, 0.56, 0.5, 0.4, 1.14, 2.8), S(1.6, 0.5, 0.42, 0.4, 1.08, 2.6), S(2.7, 0.32, 0.26, 0.3, 0.92, 2.4), S(3.5, 0.1, 0.08, 0.1, 0.62)];
  const nac = (x) => [S(-0.86, 0.3, 0.3, 0.3, 0.78, 2.6, 2.6, { x }), S(-0.62, 0.39, 0.39, 0.39, 0.78, 2.8, 2.8, { x }), S(0.6, 0.43, 0.43, 0.43, 0.78, 2.8, 2.8, { x }), S(1.8, 0.41, 0.4, 0.42, 0.78, 2.6, 2.6, { x }), S(2.45, 0.3, 0.3, 0.33, 0.8, 2.2, 2.2, { x })];
  const wingS = [{ x: 0.55, y: -0.05, z: -0.78, c: 1.38, t: 0.13 }, { x: 3.0, y: -0.18, z: -0.5, c: 0.92, t: 0.11 }];
  const finS = [{ x: 0.2, z: 5.7, c: 1.75, t: 0.11 }, { x: 2.45, z: 6.82, c: 0.95, t: 0.1 }];   // x = height: stood up with a quarter turn about Z
  const stabS = [{ x: 0.08, y: 0.2, z: 6.5, c: 1.0, t: 0.1 }, { x: 1.6, y: 0.2, z: 6.78, c: 0.62, t: 0.09 }];

  if (lod) { // distant: silhouette only, two materials
    k.add(P, loft(fuse, { seg: 8, step: 1.6, tint: (z, t) => (z > -5 && z < -1.2 && Math.abs(t - 0.5) < 0.2 ? 0.22 : 1) }));
    k.add(P, loft(dog, { seg: 6, step: 2 })); k.pair(P, loft(nac(1.0), { seg: 6, step: 2 }));
    k.pair(P, wingGeo(wingS, { n: 2, tip: 'flat' })); k.add(P, wingGeo(finS, { n: 2, tip: 'flat' }), 0, 0, 0, [0, 0, PI / 2]); k.pair(P, wingGeo(stabS, { n: 2, tip: 'flat' }));
    for (const a of [0.5, 0.5 + PI / 2]) k.box(M.blade, 14.6, 0.05, 0.45, hubP.x, hubP.y, hubP.z, [0, a, 0]);
    k.cyl(M.blade, 0.12, 0.12, 0.8, 0, 2.0, 0.2, 'y', 6); k.box(M.blade, 0.04, 2.8, 0.2, tailP.x, tailP.y, tailP.z, [0.7, 0, 0]);
    for (const s of [-1, 1]) k.cyl(C.rubber, 0.38, 0.38, 0.26, s * 1.28, -1.72, -2.3, 'x', 8);
    k.build(g); g.userData.model = model;
    return g;
  }
  const seg = fine ? 28 : 18, step = fine ? 0.35 : 0.6;
  // ---- airframe
  k.add(P, loft(fuse, { seg, step, tint: (z, t) => (z > -5.0 && z < -1.25 && Math.abs(t - 0.5) < 0.105 ? 0.13 : 1) }));
  k.add(P, loft(dog, { seg: fine ? 18 : 12, step: 0.45 }));
  // stepped tandem canopy: glass shell on the cockpit sills, frames laid over it
  const cz = [[-5.12, 0.06], [-4.56, 0.6], [-3.9, 0.8], [-3.22, 0.8], [-3.0, 1.0], [-2.2, 1.0], [-1.5, 0.86], [-0.95, 0.42]];
  const can = cz.map(([z, h], i) => { const f = stAt(fuse, z); return S(z, f.w * 0.74, h, 0.03, f.y + f.ht * 0.86, A ? 2.8 : 4.6, 2, { c: i === 3 || i === 4 }); });
  k.add(M.G, loft(can.slice(0, 7), { arc: [0.245, 0.755], seg: fine ? 16 : 10, step: 0.22 }));
  k.add(P, patch(can, -1.5, -0.95, 0.245, 0.755, 0.004, 10, 0.2));
  const bows = A ? [[-4.56, 0.07], [-3.22, 0.05], [-3.0, 0.05], [-2.2, 0.06], [-1.52, 0.08]] : [[-4.56, 0.09], [-3.9, 0.07], [-3.22, 0.07], [-3.0, 0.07], [-2.6, 0.07], [-2.05, 0.07], [-1.52, 0.1]];
  for (const [z, wd] of bows) k.add(M.frame, patch(can, z - wd / 2, z + wd / 2, 0.245, 0.755, 0.014, fine ? 14 : 8, 1));
  for (const [t0, t1] of [[0.245, 0.266], [0.734, 0.755], [0.489, 0.511]]) k.add(M.frame, patch(can, -5.12, -1.5, t0, t1, 0.014, 1, 0.22));
  if (!A) for (const [t0, t1] of [[0.36, 0.378], [0.622, 0.64]]) k.add(M.frame, patch(can, -4.56, -1.5, t0, t1, 0.014, 1, 0.22));
  // crew: gunner in front, pilot behind and above; coamings with a sight and instrument hoods
  addPilot(k, M, 0, 1.0, -3.82, { lean: 0.22 }); addPilot(k, M, 0, 1.45, -2.18, { lean: 0.22 });
  k.cbox(C.black, 0.56, 0.2, 0.34, 0.04, 0, 0.6, -4.5, [0.25, 0, 0]); k.cbox(C.black, 0.64, 0.34, 0.26, 0.04, 0, 1.02, -2.92, [0.15, 0, 0]);
  if (fine) { k.cbox(C.dark, 0.16, 0.14, 0.2, 0.02, 0, 0.76, -4.42); k.cyl(C.lensBlue, 0.05, 0.05, 0.02, 0, 0.78, -4.31, 'z', 8); k.box(C.lensBlue, 0.18, 0.12, 0.01, 0, 1.24, -2.86, [-0.5, 0, 0]); }
  // ---- engines: nacelles with intake lips, particle separators and exhausts
  k.pair(P, loft(nac(1.0), { seg: fine ? 16 : 10, step: 0.4 }));
  for (const s of [-1, 1]) {
    k.cyl(C.black, 0.26, 0.26, 0.02, s * 1.0, 0.78, -0.8, 'z', 14); k.lathe(C.steel, [[-0.2, 0.003], [-0.1, 0.07], [0.06, 0.13]], 10, s * 1.0, 0.78, -0.78);
    k.torus(C.iron, 0.285, 0.025, s * 1.0, 0.78, -0.86, null, 16);
    k.cbox(M.body, 0.12, 0.3, 1.5, 0.04, s * 0.66, 0.86, 0.6);                             // nacelle-to-fuselage fairing
    if (A) { // upturned exhaust with a cooled shroud
      exhaust(k, s * 1.02, 0.8, 2.25, 0.25, 0.8, [-0.32, s * 0.22, 0]);
    } else { // box infra-red suppressor exhausting outward and up
      k.add(M.bodyDark, cboxGeo(0.56, 0.6, 1.5, 0.06), s * 1.16, 0.84, 2.7, [0, -s * 0.22, 0]);
      for (let i = 0; i < 4; i++) k.box(C.hot, 0.03, 0.42, 0.26, s * 1.48, 0.88, 2.25 + i * 0.32, [0, -s * 0.22 + s * 0.5, 0]);
      k.cbox(C.black, 0.4, 0.04, 1.1, 0.01, s * 1.2, 1.15, 2.75, [0, -s * 0.22, 0]);
    }
    model.engines.push(new V3(s * 1.0, 0.78, 2.9));
    // forward avionics / gear fairings along the lower sides
    const fx = stAt(fuse, -2.6).w;
    k.add(P, loft([S(-4.3, 0.05, 0.12, 0.12, -0.52, 3, 3, { x: s * (fx - 0.16) }), S(-3.9, 0.2, 0.3, 0.3, -0.52, 4, 4, { x: s * (fx - 0.1) }), S(-1.4, 0.24, 0.34, 0.34, -0.5, 4, 4, { x: s * fx }), S(0.6, 0.2, 0.3, 0.32, -0.48, 4, 4, { x: s * (fx - 0.02) }), S(1.2, 0.05, 0.1, 0.1, -0.45, 3, 3, { x: s * (fx - 0.2) })], { seg: fine ? 14 : 8, step: 0.5 }));
    if (!A) k.cbox(M.bodyDark, 0.05, 0.62, 2.3, 0.02, s * (stAt(fuse, -3).w * 0.97), 0.3, -3.0, [0, 0, -s * 0.12]);   // cockpit side armour
  }
  // ---- stub wings, pylons, stores
  k.pair(P, wingGeo(wingS, { n: fine ? 7 : 4, tip: 'round' }));
  for (const s of [-1, 1]) {
    for (const [px, pz] of [[1.6, -0.12], [2.6, -0.06]]) k.add(M.bodyDark, wingGeo([{ x: 0, z: pz - 0.4, c: 0.85, t: 0.14 }, { x: 0.34, z: pz - 0.32, c: 0.7, t: 0.14 }], { n: 3 }), s * px, -0.14 - (px - 0.55) * 0.053, 0, [0, 0, -PI / 2]);
    rocketPod(k, M, s * 1.6, -0.72, -0.1);
    // four-rail missile launcher
    k.cbox(M.bodyDark, 0.44, 0.07, 0.9, 0.02, s * 2.6, -0.55, -0.05); k.cbox(M.bodyDark, 0.07, 0.3, 0.6, 0.02, s * 2.6, -0.72, 0.0);
    for (const [dx, dy] of [[-0.17, -0.63], [0.17, -0.63], [-0.17, -0.93], [0.17, -0.93]]) {
      k.box(C.gun, 0.05, 0.035, 1.25, s * 2.6 + dx, dy + 0.115, -0.1); k.box(C.gun, 0.12, 0.03, 0.05, s * 2.6 + dx * 0.6, dy + 0.14, 0.2);
      k.parts(buildAGM(), s * 2.6 + dx, dy, -0.12);
    }
    // wing tip: fairing and navigation light (Extro carries a short-range missile on a tip rail)
    k.lathe(M.bodyDark, [[-0.6, 0.01], [-0.45, 0.07], [0.3, 0.075], [0.55, 0.02]], 10, s * 3.06, -0.185, -0.02);
    k.sphere(s < 0 ? C.lampRed : C.lampGreen, 0.03, s * 3.1, -0.17, -0.52, [1, 1, 1.6], 8);
    if (!A) { k.box(C.gun, 0.05, 0.06, 1.0, s * 3.12, -0.27, 0.0); k.parts(buildAAM(), s * 3.12, -0.37, 0.0, null, 0.52); }
    // main gear: trailing arm, shock strut, wheel
    k.tube(C.gearWhite, [s * 0.84, -0.66, -3.02], [s * 1.14, -1.66, -2.32], 0.075, 10, 0.06);
    oleo(k, [s * 0.9, -0.2, -2.05], [s * 1.12, -1.5, -2.3], 0.06);
    k.cbox(C.gearWhite, 0.12, 0.2, 0.24, 0.03, s * 0.86, -0.66, -3.02);
    wheel(k, s * 1.28, -1.72, -2.3, 0.38, 0.26, s);
    if (fine) k.pipe(C.black, [[s * 0.88, -0.6, -2.9], [s * 1.0, -1.1, -2.6], [s * 1.14, -1.6, -2.4]], 0.014, 4, 8);
  }
  model.pylons.push(new V3(-2.6, -0.7, -0.9), new V3(-1.6, -0.7, -1.1), new V3(1.6, -0.7, -1.1), new V3(2.6, -0.7, -0.9));
  // ---- tail: swept fin with a ventral extension, tailplane, tail-rotor gearbox, tail wheel
  k.add(P, wingGeo(finS, { n: fine ? 7 : 4, tip: 'round' }), 0, 0, 0, [0, 0, PI / 2], null, { uv: [0, 3.3] });
  k.add(P, wingGeo([{ x: 0.0, z: 5.9, c: 1.5, t: 0.1 }, { x: 0.95, z: 6.05, c: 0.8, t: 0.1 }], { n: fine ? 5 : 3, tip: 'round' }), 0, 0.3, 0, [0, 0, -PI / 2], null, { uv: [0, -4.1] });
  k.pair(P, wingGeo(stabS, { n: fine ? 6 : 3, tip: 'round' }));
  k.lathe(M.body, [[-0.3, 0.02], [-0.18, 0.13], [0.2, 0.15], [0.42, 0.04]], 10, -0.1, 1.7, 7.08); k.cyl(C.iron, 0.07, 0.09, 0.2, -0.22, 1.7, 7.1, 'x', 10);
  k.tube(C.gearWhite, [0, -0.6, 6.15], [0, -1.83, 6.48], 0.055, 8); oleo(k, [0, -0.5, 6.55], [0, -1.6, 6.5], 0.04);
  for (const s of [-1, 1]) k.tube(C.gearWhite, [0, -1.6, 6.44], [s * 0.11, -1.88, 6.5], 0.03, 6);
  k.add(C.rubber, tyreGeo(0.22, 0.14, 14), 0, -1.88, 6.5); k.cyl(C.gearWhite, 0.12, 0.12, 0.12, 0, -1.88, 6.5, 'x', 10); k.cyl(C.iron, 0.03, 0.03, 0.26, 0, -1.88, 6.5, 'x', 6);
  // ---- nose sensor turret with lenses (and a second small sight above it)
  const nz = -6.02;
  k.cyl(C.iron, 0.25, 0.27, 0.12, 0, -0.28, nz + 0.1, 'z', 16);
  k.sphere(M.bodyDark, 0.3, 0, -0.3, nz - 0.14, [1, 0.95, 0.9], 18);
  for (const [lx, ly, lr] of [[-0.09, -0.26, 0.105], [0.13, -0.2, 0.062], [0.1, -0.42, 0.05]]) {
    const lz = nz - 0.14 - Math.sqrt(Math.max(0.0001, 0.27 * 0.27 - lx * lx - (ly + 0.3) * (ly + 0.3))) * 0.9;
    k.cyl(C.gun, lr * 1.18, lr * 1.25, 0.07, lx, ly, lz + 0.01, 'z', 12); k.cyl(lr > 0.09 ? C.lensBlue : C.lensGold, lr, lr, 0.012, lx, ly, lz - 0.028, 'z', 12);
    k.torus(C.iron, lr * 1.08, 0.009, lx, ly, lz - 0.03, null, 12);
  }
  k.cyl(C.iron, 0.13, 0.15, 0.1, 0, 0.2, -5.6, 'y', 12); k.sphere(M.bodyDark, 0.17, 0, 0.36, -5.6, [1, 0.9, 1.05], 12);
  k.cyl(C.gun, 0.085, 0.09, 0.05, 0, 0.37, -5.765, 'z', 10); k.cyl(C.lensGold, 0.07, 0.07, 0.012, 0, 0.37, -5.79, 'z', 10);
  model.nose = { pos: new V3(0, -0.26, nz), radius: 0.42 };   // the fuselage nose behind the sensor turret
  // ---- sensors, antennas, lights, fittings
  const top = (z, d = 0) => surf(dog, z, 0.5, d).y;
  k.cyl(C.iron, 0.2, 0.26, 0.22, 0, top(0.2) + 0.08, 0.2, 'y', 14);                                                      // mast fairing
  k.cyl(C.iron, 0.1, 0.12, 0.16, 0, top(1.7) + 0.06, 1.7, 'y', 10); k.cyl(C.lensGold, 0.11, 0.11, 0.2, 0, top(1.7) + 0.24, 1.7, 'y', 8); k.cyl(C.iron, 0.12, 0.1, 0.05, 0, top(1.7) + 0.36, 1.7, 'y', 10); // IR jammer
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.34, t: 0.08 }, { x: 0.42, z: 0.2, c: 0.16, t: 0.08 }], { n: 2, tip: 'flat' }), 0, top(2.5), 2.4, [0, 0, PI / 2]);  // blade antenna
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.3, t: 0.08 }, { x: 0.34, z: 0.14, c: 0.14, t: 0.08 }], { n: 2, tip: 'flat' }), 0, surf(fuse, 4.6, 0, 0).y, 4.5, [0, 0, -PI / 2]);
  k.tube(C.gun, [0, 2.6, 7.2], [0.0, 3.5, 7.75], 0.012, 4, 0.006);                                                         // whip antenna on the fin
  k.sphere(C.lampRed, 0.05, 0, 2.7, 6.95, [1, 0.8, 1.4], 8); k.sphere(C.lampWhite, 0.04, 0, 0.62, 7.86, null, 8); k.sphere(C.lampRed, 0.05, 0, surf(fuse, 0.6, 0, 0).y - 0.03, 0.6, [1, 0.6, 1], 8);
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.5, t: 0.05 }, { x: 0.5, z: 0.5, c: 0.06, t: 0.05 }], { n: 2 }), 0, surf(can, -4.56, 0.5, 0).y - 0.05, -4.75, [0, 0, PI / 2]);          // wire cutter above the windscreen
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.45, t: 0.05 }, { x: 0.42, z: 0.42, c: 0.06, t: 0.05 }], { n: 2 }), 0, surf(fuse, -4.9, 0, 0).y + 0.03, -5.1, [0, 0, -PI / 2]);        // and below the nose
  for (const s of [-1, 1]) {
    k.box(C.form, 0.012, 0.07, 0.5, s * (stAt(fuse, 5).w + 0.004), stAt(fuse, 5).y, 5.0);                                   // formation strips on the boom
    k.cbox(M.bodyDark, 0.07, 0.22, 0.4, 0.015, s * (stAt(fuse, 5.9).w + 0.03), stAt(fuse, 5.9).y, 5.9);                     // flare / chaff dispensers
    if (fine) for (let i = 0; i < 6; i++) k.box(C.black, 0.01, 0.05, 0.05, s * (stAt(fuse, 5.9).w + 0.066), stAt(fuse, 5.9).y - 0.05 + (i % 2) * 0.1, 5.78 + Math.floor(i / 2) * 0.12);
    const pn = surf(fuse, -5.3, s > 0 ? 0.3 : 0.7, 0); k.tube(C.gun, [pn.x, pn.y, pn.z], [pn.x + s * 0.12, pn.y + 0.02, pn.z - 0.02], 0.015, 5); k.tube(C.steel, [pn.x + s * 0.12, pn.y + 0.02, pn.z], [pn.x + s * 0.12, pn.y + 0.02, pn.z - 0.42], 0.012, 5, 0.006); // pitot
    const rw = surf(fuse, -5.0, s > 0 ? 0.2 : 0.8, 0); k.sphere(C.radome, 0.07, rw.x, rw.y, rw.z, [0.6, 1, 1.3], 8);       // radar-warning bumps
    const rt = surf(fuse, 7.2, s > 0 ? 0.25 : 0.75, 0); k.sphere(C.radome, 0.06, rt.x, rt.y, rt.z, [0.6, 1, 1.3], 8);
    if (fine) { // steps and grab handles up to the cockpits
      for (const [z, y] of [[-3.5, -0.1], [-1.9, 0.15]]) { const w = stAt(fuse, z).w + 0.24; k.torus(C.gun, 0.06, 0.012, s * (w + 0.05), y, z, [0, PI / 2, 0], 8, PI); }
      k.box(C.black, 0.02, 0.012, 0.34, s * 0.3, surf(can, -4.8, 0.5, 0).y - 0.12, -4.82, [0.75, 0, s * 0.5]);            // wipers
    }
    k.decal(M.insignia, 0.62, s * 0.115, 1.25, 6.95, s > 0 ? 'right' : 'left');
    k.decal(M.insignia, 0.5, s * (stAt(fuse, 4.3).w + 0.012), stAt(fuse, 4.3).y, 4.3, s > 0 ? 'right' : 'left');
  }
  k.build(g);
  // ---- rotors
  const mr = makeRotor(M, { radius: 7.3, n: 4, chord: 0.5, axis: 'y', speed: 30, hubR: 0.3, kind: 'main', mast: 0.82, fine,
    cap: A ? (hk) => { hk.cyl(C.iron, 0.09, 0.11, 0.35, 0, 0.3, 0, 'y', 10); hk.sphere(C.radome, 0.52, 0, 0.62, 0, [1, 0.42, 1], 18); } : (hk) => hk.sphere(C.gun, 0.2, 0, 0.2, 0, [1, 0.5, 1], 12) });
  mr.node.position.copy(hubP); g.add(mr.node); model.spinners.push({ node: mr.node, axis: 'y', speed: 30, blades: mr.blades, disc: mr.disc });
  const tr = makeRotor(M, { radius: 1.4, n: 4, chord: 0.24, axis: 'x', speed: 90, hubR: 0.1, kind: 'tail', fine, angles: A ? [0, 0.96, PI, PI + 0.96] : null, tipTone: C.red });
  tr.node.position.copy(tailP); g.add(tr.node); model.spinners.push({ node: tr.node, axis: 'x', speed: 90, blades: tr.blades, disc: tr.disc });
  model.rotorDisc = mr.disc; model.tailDisc = tr.disc;
  // ---- chin gun
  const chin = chinTurret(M, fine); chin.node.position.set(0, -0.95, -3.6); g.add(chin.node); model.turrets.push(chin);
  model.cockpit = new V3(0, 1.45, -2.25);
  g.userData.model = model;
  return g;
}

/* ----------------------------------------------------------------------------------------------- transport helicopter */

export function buildTransportHeli(nation, lod = 0) { const fine = fineDetail(); return cached(`transport:${nation}:${lod}:${fine}`, () => makeTransport(nation, lod, fine)); }

function makeTransport(nation, lod, fine) {
  const M = airMats(nation), A = M.A, g = new THREE.Group(), P = M.P;
  const hubF = new V3(0, 2.62, -5.6), hubA = new V3(0, 3.82, 6.2), engs = [new V3(-1.38, 1.5, 7.3), new V3(1.38, 1.5, 7.3)];
  const model = { dims: { length: 16, span: 18, height: 5.9 }, gearHeight: 2.15, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], seats: [], view: { chase: 34, chaseH: 9 } };
  const k = new Kit({ lod, fine, under: M.under, soot: lod ? null : engs.map((p) => ({ p: new V3(p.x, p.y + 0.3, p.z - 0.2), r: 1.7, a: 0.55 })) });
  const n = A ? 4.2 : 5.5, W = 1.56;
  const base = S(-7.0, 1.3, 1.14, 1.16, -0.02, 3, 3.2);
  const fuse = [...ogive(-8.0, base, 4, 0.52, -0.2), base, S(-6.0, 1.5, 1.4, 1.42, 0, n, n), S(-5.0, W, 1.44, 1.44, 0, n, n), S(5.4, W, 1.44, 1.44, 0, n, n), S(6.8, 1.52, 1.4, 1.36, 0.02, n, n), S(8.0, 1.4, 1.34, 1.3, 0.05, n, n)];
  const pylF = [S(-7.3, 0.3, 0.15, 0.3, 1.2, 2.6), S(-6.5, 0.72, 0.8, 0.5, 1.5, 2.8), S(-5.6, 0.82, 0.98, 0.5, 1.5, 3), S(-4.4, 0.7, 0.85, 0.5, 1.45, 2.8), S(-3.2, 0.42, 0.4, 0.4, 1.35, 2.6), S(-2.4, 0.2, 0.12, 0.2, 1.3, 2.4)];
  const pylA = [S(2.6, 0.2, 0.12, 0.2, 1.3, 2.4), S(3.6, 0.5, 0.6, 0.4, 1.4, 2.6), S(4.6, 0.8, 1.5, 0.5, 1.5, 3), S(5.6, 0.86, 2.1, 0.5, 1.55, 3.2), S(6.7, 0.84, 2.14, 0.5, 1.55, 3.2), S(7.6, 0.6, 2.0, 0.5, 1.6, 3), S(8.35, 0.16, 1.5, 0.3, 1.9, 2.4)];
  const tun = [S(-2.6, 0.3, 0.2, 0.2, 1.4, 3), S(2.8, 0.3, 0.2, 0.2, 1.4, 3)];
  const spon = (x) => [S(-5.3, 0.1, 0.12, 0.12, -0.95, 2.4, 2.4, { x }), S(-4.7, 0.36, 0.42, 0.46, -0.95, A ? 2.8 : 5, A ? 2.8 : 5, { x }), S(4.5, 0.36, 0.42, 0.46, -0.95, A ? 2.8 : 5, A ? 2.8 : 5, { x }), S(5.3, 0.1, 0.12, 0.12, -0.95, 2.4, 2.4, { x })];
  const eng = (x) => [S(3.92, 0.32, 0.32, 0.32, 1.5, 2.4, 2.4, { x }), S(4.2, 0.46, 0.46, 0.46, 1.5, 2.6, 2.6, { x }), S(6.3, 0.5, 0.5, 0.5, 1.5, 2.6, 2.6, { x }), S(6.9, 0.38, 0.38, 0.38, 1.52, 2.4, 2.4, { x })];
  const staticRotor = (hub) => { for (const a of [0.4, 0.4 + TAU / 3, 0.4 + (2 * TAU) / 3]) k.box(M.blade, 9, 0.05, 0.7, hub.x + Math.cos(a) * 4.5, hub.y, hub.z - Math.sin(a) * 4.5, [0, a, 0]); };

  if (lod) {
    k.add(P, loft(fuse, { seg: 8, step: 2.5, capB: true, tint: (z, t) => (z < -6.6 && t > 0.3 && t < 0.7 ? 0.2 : 1) }));
    k.add(P, loft(pylF, { seg: 6, step: 2 })); k.add(P, loft(pylA, { seg: 6, step: 2 })); k.pair(P, loft(spon(1.62), { seg: 6, step: 5 })); k.pair(P, loft(eng(1.38), { seg: 6, step: 3 }));
    staticRotor(hubF); staticRotor(hubA);
    for (const s of [-1, 1]) for (const z of [-4.6, 4.6]) k.cyl(C.rubber, 0.4, 0.4, 0.3, s * 1.78, -1.75, z, 'x', 8);
    k.build(g); g.userData.model = model;
    return g;
  }
  const seg = fine ? 32 : 20, step = fine ? 0.45 : 0.8;
  // ---- airframe: cabin (open at the back), rotor pylons, drive-shaft tunnel, fuel sponsons
  k.add(P, loft(fuse, { seg, step }));
  k.add(P, loft(pylF, { seg: fine ? 18 : 12, step: 0.45 })); k.add(P, loft(pylA, { seg: fine ? 18 : 12, step: 0.45 })); k.add(P, loft(tun, { seg: 10, step: 3 }));
  k.pair(P, loft(spon(1.62), { seg: fine ? 14 : 8, step: 0.6 }));
  // cargo hold seen through the open ramp: dark walls, floor, forward bulkhead, troop seats, the lowered ramp
  k.add(C.dark, loft(fuse.slice(-3), { seg: 16, step: 1.3, inside: true, grow: -0.05 }));
  k.box(C.black, 2.9, 2.7, 0.05, 0, 0, 5.45); k.box(C.dark, 2.7, 0.05, 2.6, 0, -1.2, 6.72);
  for (const s of [-1, 1]) { k.box(C.red, 0.42, 0.06, 2.3, s * 1.1, -0.72, 6.75); k.box(C.red, 0.05, 0.5, 2.3, s * 1.34, -0.45, 6.75); if (fine) for (let i = 0; i < 4; i++) k.box(C.iron, 0.03, 0.5, 0.03, s * 0.92, -0.97, 5.8 + i * 0.65); }
  const rampA = 0.31, rz = 9.12, ry = -1.66, sa = Math.sin(rampA), ca = Math.cos(rampA);
  k.add(M.body, cboxGeo(2.3, 0.1, 2.6, 0.03), 0, ry, rz, [rampA, 0, 0]);
  k.add(C.dark, new THREE.BoxGeometry(2.1, 0.012, 2.4), 0, ry + 0.06 * ca, rz + 0.06 * sa, [rampA, 0, 0]);
  if (fine) { for (let i = 0; i < 9; i++) { const d = -1.05 + i * 0.26; k.box(C.iron, 2.0, 0.025, 0.04, 0, ry - sa * d + 0.075 * ca, rz + ca * d + 0.075 * sa, [rampA, 0, 0]); } for (const s of [-1, 1]) oleo(k, [s * 1.25, -0.2, 7.9], [s * 1.12, ry - sa * 0.3 + 0.05, rz + 0.3], 0.035); }
  k.add(M.frame, patch(fuse, 7.86, 8.0, 0, 1, 0.014, 24, 1));                                                             // door frame round the opening
  k.cbox(M.body, 2.5, 0.55, 0.08, 0.02, 0, 1.08, 7.97); if (fine) for (const s of [-1, 1]) k.box(C.yellow, 0.05, 2.0, 0.03, s * 1.3, -0.1, 8.0);
  // ---- flight deck glazing (flush dark glass on the nose), cabin portholes, crew door
  const GD = M.GD;
  for (const [z0, z1, t0, t1] of [[-7.78, -6.86, 0.292, 0.482], [-7.78, -6.86, 0.518, 0.708], [-6.76, -5.9, 0.3, 0.405], [-6.76, -5.9, 0.595, 0.7], [-7.7, -7.12, 0.105, 0.215], [-7.7, -7.12, 0.785, 0.895], [-6.7, -6.0, 0.42, 0.47], [-6.7, -6.0, 0.53, 0.58]])
    k.add(GD, patch(fuse, z0, z1, t0, t1, 0.008, fine ? 6 : 3, 0.16));
  if (fine) for (const [z0, z1, t0, t1] of [[-7.82, -6.82, 0.482, 0.518], [-6.86, -6.76, 0.28, 0.72], [-7.84, -7.78, 0.29, 0.71]]) k.add(M.frame, patch(fuse, z0, z1, t0, t1, 0.012, 6, 0.2));
  const wy = 0.38;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -3.9 + i * 1.95; if (s > 0 && i === 0) continue;
      k.sphere(GD, 0.27, s * (W - 0.012), wy, z, [0.12, 1, 1], 14); k.torus(M.frame, 0.275, 0.022, s * (W + 0.004), wy, z, [0, PI / 2, 0], 16);
    }
  }
  // starboard crew door (upper half glazed) with a step and rescue hoist; outline as a seam
  const dT = (y) => tAt(fuse, -4.1, y), d0 = dT(-0.95), d1 = dT(1.0), dm = dT(0.1);
  for (const z of [-4.7, -3.5]) k.add(C.dark, patch(fuse, z - 0.012, z + 0.012, d0, d1, 0.004, 8, 1));
  for (const t of [d0, dm, d1]) k.add(C.dark, patch(fuse, -4.7, -3.5, t - 0.0012, t + 0.0012, 0.004, 1, 1));
  k.add(GD, patch(fuse, -4.5, -3.7, dT(0.25), dT(0.85), 0.008, 4, 1)); k.box(C.yellow, 0.02, 0.05, 0.14, W + 0.012, -0.1, -3.65);
  k.cbox(M.bodyDark, 0.25, 0.04, 0.8, 0.015, W + 0.14, -1.0, -4.1);
  k.tube(C.gun, [W - 0.1, 1.2, -4.1], [W + 0.5, 1.42, -4.1], 0.05, 8); k.cyl(C.iron, 0.11, 0.11, 0.2, W + 0.5, 1.4, -4.1, 'z', 10); k.cbox(C.yellow, 0.06, 0.12, 0.06, 0.015, W + 0.5, 1.2, -4.1);
  // ---- engines on the aft pylon shoulders: intake with debris screen, exhaust
  k.pair(P, loft(eng(1.38), { seg: fine ? 16 : 10, step: 0.5 }));
  for (const s of [-1, 1]) {
    k.sphere(C.iron, 0.3, s * 1.38, 1.5, 3.95, [1, 1, 0.75], 12); k.torus(C.gun, 0.31, 0.03, s * 1.38, 1.5, 3.93, null, 16);
    k.cbox(M.body, 0.5, 0.36, 1.6, 0.06, s * 0.98, 1.42, 5.3);                                                             // pylon-to-engine fairing
    if (A) exhaust(k, s * 1.38, 1.52, 6.8, 0.3, 0.6, [0, s * 0.14, 0]);
    else { k.add(M.bodyDark, cboxGeo(0.84, 0.84, 1.5, 0.08), s * 1.5, 1.6, 7.2, [0, -s * 0.3, 0]); for (let i = 0; i < 4; i++) k.box(C.hot, 0.03, 0.6, 0.24, s * 1.98, 1.62, 6.82 + i * 0.3, [0, s * 0.3, 0]); k.cbox(M.bodyDark, 0.06, 0.9, 1.6, 0.02, s * (W - 0.02), -0.4, -5.5); }
    model.engines.push(new V3(s * 1.38, 1.5, 7.3));
    // fixed gear: stub struts, shock struts, wheels (twin at the front)
    for (const z of [-4.6, 4.6]) {
      k.tube(C.gearWhite, [s * 1.6, -1.2, z], [s * 1.74, -1.72, z], 0.075, 8); oleo(k, [s * 1.84, -0.9, z + 0.16], [s * 1.8, -1.6, z + 0.03], 0.045);
      wheel(k, s * 1.86, -1.75, z, 0.4, 0.26, s); if (z < 0) wheel(k, s * 2.16, -1.75, z, 0.4, 0.26, s);
    }
    // sponson details: fuel caps, steps, navigation lights; Extro carries external tanks
    k.cyl(C.red, 0.06, 0.06, 0.02, s * 1.62, -0.52, 1.2, 'y', 10); k.sphere(s < 0 ? C.lampRed : C.lampGreen, 0.05, s * 2.0, -0.8, -4.9, [1, 1, 1.5], 8);
    if (!A) { k.lathe(M.body, [[-1.8, 0.02], [-1.4, 0.3], [-0.8, 0.4], [1.0, 0.4], [1.5, 0.28], [1.8, 0.03]], 12, s * 2.3, -0.92, 0.6); for (const z of [0, 1.2]) k.cbox(M.bodyDark, 0.3, 0.12, 0.2, 0.03, s * 2.02, -0.86, z); }
    k.box(C.form, 0.012, 0.08, 0.7, s * (W + 0.004), 1.0, 2.2);
    k.decal(M.insignia, 1.15, s * (W + 0.014), 0.3, 5.2, s > 0 ? 'right' : 'left');
    if (fine) { k.cbox(M.bodyDark, 0.06, 0.3, 0.5, 0.015, s * 0.86, 2.6, 7.3); for (const y of [-0.3, -0.75]) k.torus(C.gun, 0.07, 0.012, s * (W + 0.02), y, -5.3, [0, PI / 2, 0], 8, PI); }
    for (const z of [-3.2, -1.2, 0.8, 2.8]) model.seats.push(new V3(s * 0.9, -0.55, z));
  }
  // ---- antennas, probes, lights, wipers, cargo hook
  const tF = (z) => surf(pylF, z, 0.5, 0).y;
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.4, t: 0.08 }, { x: 0.5, z: 0.22, c: 0.2, t: 0.08 }], { n: 2, tip: 'flat' }), 0, 1.6, -1.2, [0, 0, PI / 2]);
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.4, t: 0.08 }, { x: 0.45, z: 0.2, c: 0.2, t: 0.08 }], { n: 2, tip: 'flat' }), 0, -1.44, -2.0, [0, 0, -PI / 2]);
  k.tube(C.gun, [0, tF(-4.2), -4.2], [0, tF(-4.2) + 0.5, -4.1], 0.012, 4); k.tube(C.gun, [0, tF(-4.2) + 0.5, -4.1], [0.0, 3.2, 4.3], 0.006, 3); // HF wire aerial back to the aft pylon
  for (const s of [-1, 1]) { const pn = surf(fuse, -7.4, s > 0 ? 0.2 : 0.8, 0); k.tube(C.gun, [pn.x, pn.y, pn.z], [pn.x + s * 0.06, pn.y - 0.06, pn.z - 0.1], 0.02, 5); k.tube(C.steel, [pn.x + s * 0.06, pn.y - 0.06, pn.z - 0.08], [pn.x + s * 0.06, pn.y - 0.06, pn.z - 0.75], 0.014, 5, 0.007); }
  k.sphere(C.lampRed, 0.06, 0, 3.72, 8.2, [1, 0.8, 1.4], 8); k.sphere(C.lampWhite, 0.045, 0, 2.4, 8.5, null, 8); k.sphere(C.lampRed, 0.06, 0, -1.47, 1.0, [1, 0.6, 1], 8);
  k.cyl(C.iron, 0.12, 0.12, 0.08, 0, -1.47, 0.2, 'y', 10); k.torus(C.steel, 0.07, 0.018, 0, -1.56, 0.2, null, 10);
  k.sphere(C.radome, 0.3, 0, -1.25, -6.6, [1, 0.5, 1.5], 12);
  if (fine) for (const s of [-1, 1]) k.box(C.black, 0.02, 0.012, 0.42, s * 0.42, surf(fuse, -7.3, 0.4, 0).y + 0.06, -7.42, [0.9, 0, s * 0.35]);
  model.nose = { pos: new V3(0, -0.2, -8.0), radius: 1.0 };
  k.build(g);
  // ---- rotors (counter-rotating, blades interleaved)
  const mk = (hub, spd, phase) => { const r = makeRotor(M, { radius: 9, n: 3, chord: 0.78, axis: 'y', speed: spd, hubR: 0.4, kind: 'main', mast: 0.75, phase, fine }); r.node.position.copy(hub); g.add(r.node); model.spinners.push({ node: r.node, axis: 'y', speed: spd, blades: r.blades, disc: r.disc }); return r; };
  const rf = mk(hubF, 28, 0), ra = mk(hubA, -28, PI / 3);
  model.rotorDisc = rf.disc; model.tailDisc = ra.disc;
  model.door = new V3(0, -2.15, 10.6);
  model.cockpit = new V3(0.55, 0.45, -6.6);
  g.userData.model = model;
  return g;
}
