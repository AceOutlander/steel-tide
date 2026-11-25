// Recon Plane (v2): twin-turboprop airborne radar picket with a big rotating dorsal radar dome. No weapons.
// Aethia: T-tail, six-blade propellers, single streamlined dome pylon. Extro: twin-fin tail, four-blade propellers, strut pylon.
// userData.model: dims, gearHeight, gear[3], engines[2] (exhaust stubs), burners [], cockpit, pylons [], view, nose,
//   spinners: [radar dome { axis 'y', speed 0.8 }, propeller x2 { axis 'z', speed +-40, blades, disc, park: true }]
//     (park: the sim may show the blades instead of the blur disc while the aircraft sits on deck with engines idle),
//   surfaces { elevL, elevR (elevators), ailL, ailR (ailerons) } (rotation.x: new), rudders [1 or 2] (rotation.y: new).
import * as THREE from 'three';
import { Kit, C, S, airMats, loft, patch, stAt, tAt, surf, ogive, wingGeo, midSec, hinge, makeRotor, gearLeg, cached, fineDetail, cboxGeo } from './airkit.js';

const V3 = THREE.Vector3, PI = Math.PI;

export function buildReconPlane(nation, lod = 0) { const fine = fineDetail(); return cached(`recon:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

function make(nation, lod, fine) {
  const M = airMats(nation), A = M.A, g = new THREE.Group(), P = M.P;
  const model = { dims: { length: 26, span: 30, height: 8 }, gearHeight: 2.9, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], surfaces: {}, rudders: [], view: { chase: 44, chaseH: 9 } };
  const EX = 4.6, EY = 0.72, domeY = 4.35, domeZ = 3;
  const shade = { lod, fine, under: M.under, soot: lod ? null : [-EX, EX].map((x) => ({ p: new V3(x, EY, 0.4), r: 1.5, a: 0.5 })) };
  const k = new Kit(shade);
  // ---- shapes
  const n = 2.2, base = S(-11.6, 0.9, 0.86, 0.8, -0.08, n);
  const fuse = [...ogive(-13, base, 4, 0.55, -0.18), base, S(-10, 1.3, 1.32, 1.25, 0, n), S(-6, 1.5, 1.575, 1.5, 0, n), S(5, 1.5, 1.575, 1.5, 0, n), S(10, 1.0, 1.1, 0.9, 0.3, n), S(12.6, 0.4, 0.48, 0.36, 0.58), S(13, 0.12, 0.15, 0.12, 0.62)];
  const top = (z) => surf(fuse, z, 0.5, 0).y, bot = (z) => surf(fuse, z, 0, 0).y, boot = (f) => (f < 0.045 ? 0.3 : 1);
  const w0 = { x: 0, y: 1.3, z: -3.6, c: 4.4, t: 0.15 }, wT = { x: 15, y: 1.72, z: -2.7, c: 2.0, t: 0.12 }, wA = midSec(w0, wT, 9.6 / 15), wB = midSec(w0, wT, 14.3 / 15), HF = 0.72;
  const nac = [S(-5.9, 0.42, 0.42, 0.5, EY, 2.4, 2.4, { x: EX }), S(-5.0, 0.68, 0.66, 0.8, EY - 0.02, 2.4, 2.6, { x: EX }), S(-2.5, 0.78, 0.76, 0.86, EY - 0.02, 2.4, 2.6, { x: EX }), S(0.5, 0.7, 0.66, 0.7, EY + 0.03, 2.4, 2.4, { x: EX }), S(2.6, 0.4, 0.36, 0.36, EY + 0.2, 2.2, 2.2, { x: EX }), S(3.5, 0.06, 0.06, 0.06, EY + 0.3, 2, 2, { x: EX })];
  const FH = A ? 4.0 : 2.6, finY = 1.1, fS = (h) => (A ? midSec({ x: 0, z: 8.2, c: 4.4, t: 0.1 }, { x: 4.0, z: 10.6, c: 2.4, t: 0.09 }, h / 4.0) : midSec({ x: 0, z: 8.8, c: 3.7, t: 0.1 }, { x: 2.6, z: 10.6, c: 1.9, t: 0.09 }, h / 2.6));
  const tR = A ? { x: 0, y: 5.1, z: 10.45, c: 2.7, t: 0.1 } : { x: 0.1, y: 1.34, z: 9.6, c: 3.0, t: 0.1 }, tT = A ? { x: 4.6, y: 5.1, z: 11.65, c: 1.3, t: 0.09 } : { x: 5.45, y: 1.9, z: 10.4, c: 2.0, t: 0.09 }, EF = 0.64;
  const eS = (h) => midSec({ x: 0, z: 10.3, c: 2.6, t: 0.09 }, { x: 2.8, z: 11.5, c: 1.5, t: 0.08 }, h / 2.8);   // Extro end-plate fins
  const domeGeo = (r, h, sg) => new THREE.LatheGeometry([[0.01, -h], [r * 0.42, -h * 0.95], [r * 0.79, -h * 0.71], [r * 0.955, -h * 0.34], [r, 0], [r * 0.955, h * 0.34], [r * 0.79, h * 0.71], [r * 0.42, h * 0.95], [0.01, h]].map(([x, y]) => new THREE.Vector2(x, y)), sg);

  if (lod) {
    k.add(P, loft(fuse, { seg: 8, step: 3, tint: (z, t) => (z < -10.2 && z > -12.2 && Math.abs(t - 0.5) < 0.14 ? 0.2 : 1) }));
    k.pair(P, wingGeo([w0, wT], { n: 2, tip: 'flat' })); k.pair(P, loft(nac, { seg: 6, step: 3 }));
    k.add(P, wingGeo([fS(0), fS(FH)], { n: 2, tip: 'flat' }), 0, finY, 0, [0, 0, PI / 2]); k.pair(P, wingGeo([tR, tT], { n: 2, tip: 'flat' }));
    if (!A) k.pair(P, wingGeo([eS(0), eS(2.8)], { n: 2, tip: 'flat' }), 5.45, 1.85, 0, [0, 0, PI / 2]);
    k.add(A ? M.PL : P, domeGeo(3.8, 0.42, 10), 0, domeY, domeZ); k.box(M.bodyDark, 0.6, 2.6, 2.6, 0, 2.8, domeZ);
    k.build(g); g.userData.model = model;
    return g;
  }
  const seg = fine ? 28 : 16, step = fine ? 0.6 : 1.1, wn = fine ? 8 : 4;
  // ---- fuselage with dark radome and tail cone, flight-deck glazing, cabin windows, crew door
  k.add(P, loft(fuse, { seg, step, tint: (z) => (z < -12.15 ? 0.45 : z > 12.3 ? 0.5 : 1) }));
  for (const [z0, z1, t0, t1] of [[-12.0, -10.95, 0.375, 0.492], [-12.0, -10.95, 0.508, 0.625], [-10.85, -10.0, 0.33, 0.41], [-10.85, -10.0, 0.59, 0.67], [-10.85, -10.3, 0.43, 0.48], [-10.85, -10.3, 0.52, 0.57]])
    k.add(M.GD, patch(fuse, z0, z1, t0, t1, 0.008, fine ? 6 : 3, 0.25));
  if (fine) for (const [z0, z1, t0, t1] of [[-12.05, -10.9, 0.492, 0.508], [-10.95, -10.85, 0.325, 0.675], [-12.08, -12.0, 0.37, 0.63]]) k.add(M.frame, patch(fuse, z0, z1, t0, t1, 0.012, 6, 0.25));
  for (const s of [-1, 1]) for (const z of [-4.5, 1.2, 6.0]) { k.sphere(M.GD, 0.2, s * (stAt(fuse, z).w - 0.012), 0.45, z, [0.12, 1, 1.2], 12); k.torus(M.frame, 0.215, 0.02, s * (stAt(fuse, z).w + 0.002), 0.45, z, [0, PI / 2, 0], 14, PI * 2); }
  { const dT = (y) => tAt(fuse, -8, y, -1), d0 = dT(-0.9), d1 = dT(0.85); for (const z of [-8.5, -7.5]) k.add(C.dark, patch(fuse, z - 0.012, z + 0.012, d1, d0, 0.004, 8, 1)); for (const t of [d0, d1]) k.add(C.dark, patch(fuse, -8.5, -7.5, t - 0.0015, t + 0.0015, 0.004, 1, 1)); k.box(C.yellow, 0.02, 0.05, 0.14, -1.45, 0.0, -7.6); }
  // ---- high wing with de-icing boots, ailerons on their own hinges
  k.pair(P, wingGeo([w0, wA], { n: wn, tint: boot })); k.pair(P, wingGeo([wA, wB], { n: wn, c1: HF, tint: boot })); k.pair(P, wingGeo([wB, wT], { n: wn, tip: 'round', tint: boot }));
  for (const s of [-1, 1]) {
    const a = [s * 9.62, wA.y, wA.z + HF * wA.c + 0.015], b = [s * 14.28, wB.y, wB.z + HF * wB.c + 0.015], h = hinge(g, s > 0 ? a : b, s > 0 ? [b[0] - a[0], b[1] - a[1], b[2] - a[2]] : [a[0] - b[0], a[1] - b[1], a[2] - b[2]], 'x');
    const q = new Kit({ ...shade, base: h.inv }); q.add(P, wingGeo([midSec(wA, wB, 0.005), midSec(wA, wB, 0.995)], { n: 4, c0: HF + 0.004, tip: 'flat', root: true }), 0, 0, 0, null, null, { mirror: s < 0 }); q.build(h.inner);
    model.surfaces[s > 0 ? 'ailR' : 'ailL'] = h.inner;
    if (fine) { const f = midSec(w0, wA, 0.5); k.box(C.black, 4.2, 0.012, 0.03, s * 5.2, f.y + 0.5 * f.t * f.c * 0.55, f.z + f.c * 0.74, [0, s * -0.03, s * 0.028]); }       // flap line
    k.lathe(M.bodyDark, [[-1.0, 0.03], [-0.5, 0.16], [0.7, 0.17], [1.2, 0.03]], 10, s * 15.06, 1.73, -1.7); k.sphere(s < 0 ? C.lampRed : C.lampGreen, 0.06, s * 15.1, 1.74, -2.62, [1, 1, 1.8], 8);
    k.decal(M.insignia, 2.0, s * 10, midSec(w0, wT, 10 / 15).y + 0.2, -1.6, 'up');
    k.decal(M.insignia, 1.3, s * (stAt(fuse, 6.9).w + 0.03), 0.4, 7.4, s > 0 ? 'right' : 'left');
  }
  // ---- engine nacelles: chin intakes, exhaust stubs; propellers
  k.pair(P, loft(nac, { seg: fine ? 18 : 10, step: 0.6 }));
  for (const s of [-1, 1]) {
    k.sphere(C.black, 0.26, s * EX, EY - 0.56, -5.48, [1.1, 0.55, 0.6], 10); k.torus(M.bodyDark, 0.27, 0.035, s * EX, EY - 0.57, -5.56, [0.35, 0, 0], 12);
    for (const e of [-1, 1]) { k.add(C.burnt, new THREE.CylinderGeometry(0.17, 0.2, 1.1, 10, 1, true), s * EX + e * 0.72, EY + 0.02, -0.7, [PI / 2, 0, e * 0.22]); k.cyl(C.black, 0.16, 0.16, 0.02, s * EX + e * 0.66, EY + 0.02, -1.0, 'z', 8); }
    model.engines.push(new V3(s * EX, 0.75, 0.2));
    const pr = makeRotor(M, { radius: 1.95, n: A ? 6 : 4, chord: A ? 0.36 : 0.44, axis: 'z', speed: 40 * s, kind: 'prop', hubR: 0.24, fine, tipTone: A ? C.yellow : C.white,
      cap: (hk) => hk.add(M.spinner, new THREE.LatheGeometry([[0.36, -0.14], [0.35, 0.06], [0.28, 0.34], [0.15, 0.58], [0.01, 0.7]].map(([x, y]) => new THREE.Vector2(x, y)), 16)) });
    pr.node.position.set(s * EX, EY, -6.12); g.add(pr.node);
    model.spinners.push({ node: pr.node, axis: 'z', speed: 40 * s, blades: pr.blades, disc: pr.disc, park: true });
  }
  // ---- tail
  const hingeSurf = (secs, c0, name, s, about = 'x', xf = null) => { // control surface cut from the back of a panel
    const [r, t] = secs, P0 = (q) => (xf ? xf(q.x, q.y, q.z + c0 * q.c) : [s * q.x, q.y, q.z + c0 * q.c]), a = P0(r), b = P0(t), flipAxis = about === 'x' && s < 0;
    const h = hinge(g, flipAxis ? b : a, flipAxis ? [a[0] - b[0], a[1] - b[1], a[2] - b[2]] : [b[0] - a[0], b[1] - a[1], b[2] - a[2]], about), q = new Kit({ ...shade, base: h.inv });
    return { h, q, done: () => { q.build(h.inner); if (name) model.surfaces[name] = h.inner; else model.rudders.push(h.inner); } };
  };
  const finRot = [0, 0, PI / 2];
  if (A) { // tall fin with rudder, tailplane on top
    k.add(P, wingGeo([fS(0), fS(0.4)], { n: wn, tint: boot }), 0, finY, 0, finRot, null, { uv: [0, 7] }); k.add(P, wingGeo([fS(0.4), fS(3.6)], { n: wn, c1: 0.68, tint: boot }), 0, finY, 0, finRot, null, { uv: [0, 7] }); k.add(P, wingGeo([fS(3.6), fS(FH)], { n: wn, tint: boot }), 0, finY, 0, finRot, null, { uv: [0, 7] });
    const r = hingeSurf([fS(0.42), fS(3.58)], 0.68, null, 1, 'y', (h, y, z) => [0, finY + h, z]); r.q.add(P, wingGeo([fS(0.42), fS(3.58)], { n: 4, c0: 0.685, tip: 'flat', root: true }), 0, finY, 0, finRot, null, { uv: [0, 7] }); r.done();
    k.lathe(M.bodyDark, [[-1.5, 0.03], [-0.7, 0.24], [0.9, 0.24], [1.7, 0.03]], 10, 0, 5.16, 11.8);
  } else { // low fin, end-plate fins with rudders
    k.add(P, wingGeo([fS(0), fS(FH)], { n: wn, tip: 'round', tint: boot }), 0, finY, 0, finRot, null, { uv: [0, 7] });
    for (const s of [-1, 1]) {
      k.add(P, wingGeo([eS(0), eS(0.3)], { n: wn, tint: boot }), s * 5.45, 1.85, 0, finRot, null, { uv: [0, s * 9] }); k.add(P, wingGeo([eS(0.3), eS(2.5)], { n: wn, c1: 0.66, tint: boot }), s * 5.45, 1.85, 0, finRot, null, { uv: [0, s * 9] }); k.add(P, wingGeo([eS(2.5), eS(2.8)], { n: wn, tip: 'round', tint: boot }), s * 5.45, 1.85, 0, finRot, null, { uv: [0, s * 9] });
      k.add(P, wingGeo([{ x: 0, z: 10.35, c: 2.5, t: 0.09 }, { x: 1.0, z: 10.9, c: 1.6, t: 0.08 }], { n: wn, tip: 'round', tint: boot }), s * 5.45, 1.95, 0, [0, 0, -PI / 2], null, { uv: [0, s * 12] });
      const r = hingeSurf([eS(0.32), eS(2.48)], 0.66, null, 1, 'y', (h, y, z) => [s * 5.45, 1.85 + h, z]); r.q.add(P, wingGeo([eS(0.32), eS(2.48)], { n: 4, c0: 0.665, tip: 'flat', root: true }), s * 5.45, 1.85, 0, finRot, null, { uv: [0, s * 9] }); r.done();
    }
  }
  const eA = midSec(tR, tT, 0.06), eB = midSec(tR, tT, 0.95);
  k.pair(P, wingGeo([tR, eA], { n: wn, tint: boot })); k.pair(P, wingGeo([eA, eB], { n: wn, c1: EF, tint: boot })); k.pair(P, wingGeo([eB, tT], { n: wn, tip: A ? 'round' : false, tint: boot }));
  for (const s of [-1, 1]) { const e = hingeSurf([midSec(eA, eB, 0.01), midSec(eA, eB, 0.99)], EF, s > 0 ? 'elevR' : 'elevL', s); e.q.add(P, wingGeo([midSec(eA, eB, 0.01), midSec(eA, eB, 0.99)], { n: 4, c0: EF + 0.005, tip: 'flat', root: true }), 0, 0, 0, null, null, { mirror: s < 0 }); e.done(); }
  // ---- radar dome on its pylon (the dome turns)
  if (A) k.add(P, wingGeo([{ x: 0, z: 1.1, c: 3.9, t: 0.17 }, { x: 2.75, z: 1.85, c: 2.4, t: 0.15 }], { n: wn }), 0, top(domeZ) - 0.2, 0, finRot, null, { uv: [0, 13] });
  else { for (const [x, z] of [[-1, 1.5], [1, 1.5], [-1, 4.7], [1, 4.7]]) k.tube(M.bodyDark, [x * 0.95, 1.2, z], [x * 0.4, domeY - 0.3, domeZ + (z - domeZ) * 0.35], 0.1, 8, 0.08); k.tube(M.bodyDark, [0, 1.5, domeZ], [0, domeY - 0.3, domeZ], 0.16, 10); k.tube(M.bodyDark, [-0.95, 2.2, 1.9], [0.95, 2.2, 1.9], 0.05, 6); k.tube(M.bodyDark, [-0.95, 2.2, 4.3], [0.95, 2.2, 4.3], 0.05, 6); }
  const dome = new THREE.Group(), dk = new Kit({ ...shade }); dome.position.set(0, domeY, domeZ);
  dk.add(A ? M.PL : P, domeGeo(3.8, 0.42, fine ? 40 : 24)); dk.add(M.frame, domeGeo(3.8, 0.42, fine ? 40 : 24), 0, 0, 0, null, [1.003, 1.03, 0.085]);
  dk.cyl(M.bodyDark, 0.36, 0.44, 0.34, 0, -0.52, 0, 'y', 14); dk.cyl(M.frame, 3.815, 3.815, 0.07, 0, 0, 0, 'y', fine ? 40 : 24, true);
  if (fine) for (const a of [0, PI]) dk.cbox(M.bodyDark, 0.5, 0.08, 0.16, 0.02, Math.cos(a) * 2.2, 0.36, Math.sin(a) * 2.2);
  dk.build(dome); g.add(dome); model.spinners.unshift({ node: dome, axis: 'y', speed: 0.8 });
  // ---- antennas, probes, lights, belly fairing
  for (const z of [-7.5, -5.0, 7.6]) k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.6, t: 0.08 }, { x: 0.5, z: 0.3, c: 0.25, t: 0.08 }], { n: 2, tip: 'flat' }), 0, top(z) - 0.02, z, finRot);
  k.add(M.frame, wingGeo([{ x: 0, z: 0, c: 0.7, t: 0.08 }, { x: 0.42, z: 0.3, c: 0.3, t: 0.08 }], { n: 2, tip: 'flat' }), 0, bot(-2) + 0.02, -2.2, [0, 0, -PI / 2]);
  k.sphere(M.bodyDark, 0.5, 0, bot(2.5) + 0.1, 2.5, [1, 0.5, 1.7], 12);
  k.tube(C.steel, [0.5, -0.35, -12.3], [0.5, -0.35, -13.35], 0.026, 5, 0.01);
  k.sphere(C.lampRed, 0.07, 0, bot(-4) - 0.01, -4, [1, 0.6, 1.4], 8); k.sphere(C.lampWhite, 0.06, 0, 0.64, 13.03, null, 8); k.sphere(C.lampRed, 0.07, 0, A ? 5.42 : finY + FH + 0.03, A ? 12.6 : 11.8, [1, 0.8, 1.5], 8);
  if (fine) k.tube(C.gun, [0, top(-6.5) + 0.3, -6.5], [0, finY + FH * 0.8, fS(FH * 0.8).z + 0.1], 0.006, 3);
  model.nose = { pos: new V3(0, -0.18, -13), radius: 0.9 };
  k.build(g);
  // ---- landing gear: nose leg, mains folding into the nacelles
  const door = (q, x, y, z, w, l, ang) => q.add(M.bodyDark, cboxGeo(0.03, w, l, 0.012), x, y - Math.cos(ang) * w * 0.5, z, [0, 0, ang]);
  const ny = bot(-9.6) + 1.3, my = surf(nac, -2.6, 0, 0).y - 0.1;
  model.gear.push(gearLeg(M, 0, -1.3, -9.6, 1.2, 0.4, { twin: true, light: true, brace: -1, fine, extra: (q) => { q.box(C.black, 0.7, 0.012, 1.7, 0, ny - 0.006, 0.2); for (const s of [-1, 1]) door(q, s * 0.38, ny, 0.2, 0.45, 1.7, s * 0.1); } }));
  for (const s of [-1, 1]) model.gear.push(gearLeg(M, s * EX, 0.1, -2.6, 2.4, 0.6, { twin: true, brace: 1, fine, extra: (q) => { q.box(C.black, 0.9, 0.012, 2.6, 0, my - 0.006, 0.4); for (const e of [-1, 1]) door(q, e * 0.48, my, 0.4, 0.75, 2.6, e * 0.1); } }));
  for (const leg of model.gear) g.add(leg);
  model.cockpit = new V3(0.5, 0.95, -11.0);
  g.userData.model = model;
  return g;
}
