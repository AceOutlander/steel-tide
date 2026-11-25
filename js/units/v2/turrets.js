// Deck weapon mounts (v2 models). makeTurretV2(kind, nation) returns the same turret object as makeTurret() in
// js/units/builders.js, so js/sim/weapons.js (class Mount), the crew and the cameras work unchanged:
//   { kind, node, pitch, muzzles: [Object3D], rest, arc, minPitch, maxPitch, gunner: Vector3 | null, yaw, elev }
//   node: Group at the mount base (node.rotation.y = rest + traverse), pitch: child Group at the trunnion
//   (pitch.rotation.x = elevation, positive up). Barrels point along -Z. Trunnion and muzzle positions match the old mounts.
// kinds: 'mg' pintle heavy machine gun with shield, 'deckgun' twin medium gun, 'heavy' triple 380 mm main battery,
//        'ciws' rotary close-in gun with its own radar, 'sam' eight-round missile launcher.
// Everything is in the superstructure paint with vertex-colour tints: two draw calls per mount (base, elevating part).
import * as THREE from 'three';
import { ShipKit, shipMats, house, rail, ladder, door, hatch, vent, liferaft, whip, latheY, cached, fineDetail, C, FWD, AFT, SB, PT } from './shipkit.js';
import { buildSAM } from './ordnance.js';

const TAU = Math.PI * 2, HP = Math.PI / 2;

export function makeTurretV2(kind, nation) {
  const fine = fineDetail(), node = cached(`turret:${kind}:${nation}:${fine}`, () => build(kind, nation, fine));
  const t = node.userData.model; node.userData = {};
  return t;
}

function build(kind, nation, fine) {
  const M = shipMats(nation), A = M.A, node = new THREE.Group(), pitch = new THREE.Group(); node.add(pitch);
  const k = new ShipKit({ fine }), p = new ShipKit({ fine }), muzzles = [];
  const t = { kind, node, pitch, muzzles, rest: 0, arc: Math.PI, minPitch: -0.12, maxPitch: 1.2, gunner: null, yaw: 0, elev: 0 };
  const BC = M.col(A ? '#4b5157' : '#1d2123');   // gun barrels: dark paint
  const MT = { ...M, G: M.BK, rail: M.col(A ? '#7d868e' : '#24292b') };   // fittings in paint tints only, so a mount stays at two draw calls
  const raft = (q, len, r) => { q.lathe(M.W, [[-len / 2, 0.02], [-len / 2 + 0.05, r * 0.75], [-len / 2 + 0.16, r], [len / 2 - 0.16, r], [len / 2 - 0.05, r * 0.75], [len / 2, 0.02]], fine ? 12 : 8, 0, r + 0.14, 0); for (const z of [-len * 0.25, len * 0.25]) { q.cyl(M.SK, r + 0.012, r + 0.012, 0.06, 0, r + 0.14, z, 'z', 12, true); q.box(M.SD, r * 1.7, 0.14, 0.08, 0, 0.07, z); } };
  const aerial = (q, h, lean) => { q.cyl(M.SK, 0.05, 0.08, 0.3, 0, 0.15, 0, 'y', 6); q.rod(M.GM, [0, 0.3, 0], [0, 0.3 + h * Math.cos(lean), -h * Math.sin(lean)], 0.018, 3); };
  const muzzle = (x, y, z) => { const m = new THREE.Object3D(); m.position.set(x, y, z); pitch.add(m); muzzles.push(m); };
  const bolts = (r, y, n, s = 0.05) => { if (fine) for (let i = 0; i < n; i++) { const a = (i / n) * TAU; k.cyl(M.SK, s, s, s, Math.cos(a) * r, y, Math.sin(a) * r, 'y', 6); } };

  if (kind === 'mg') {
    // ---- pintle mount: bolted base, conical pedestal, cradle
    k.cyl(M.GM, 0.34, 0.36, 0.05, 0, 0.025, 0, 'y', 14); bolts(0.28, 0.06, 6, 0.025);
    k.add(M.GM, latheY([[0.17, 0.05], [0.13, 0.3], [0.085, 0.96], [0.12, 1.0], [0.12, 1.07], [0.02, 1.08]], 12));
    for (const s of [-1, 1]) k.cbox(M.GM, 0.03, 0.3, 0.16, 0.01, s * 0.1, 1.2, 0);
    pitch.position.set(0, 1.25, 0);
    // ---- gun: receiver, perforated barrel jacket, muzzle brake, sights, spade grips, ammunition box and belt
    p.cbox(M.GM, 0.11, 0.15, 0.72, 0.018, 0, 0, -0.02); p.box(M.BK, 0.09, 0.03, 0.34, 0, 0.085, -0.06);
    p.cyl(M.GM, 0.024, 0.024, 1.14, 0, 0.02, -0.94, 'z', 8);
    p.cyl(M.BK, 0.037, 0.037, 0.6, 0, 0.02, -0.7, 'z', 10);
    for (let i = 0; i < 6; i++) p.cyl(M.GM, 0.041, 0.041, 0.022, 0, 0.02, -0.44 - i * 0.104, 'z', 10);
    p.cyl(M.BK, 0.04, 0.032, 0.13, 0, 0.02, -1.49, 'z', 8); p.cyl(M.GM, 0.043, 0.043, 0.02, 0, 0.02, -1.43, 'z', 8); p.box(M.BK, 0.09, 0.02, 0.05, 0, 0.02, -1.5);
    p.box(M.BK, 0.012, 0.07, 0.012, 0, 0.09, -1.0); p.torus(M.BK, 0.032, 0.006, 0, 0.14, 0.22, null, 8); p.box(M.BK, 0.012, 0.06, 0.012, 0, 0.1, 0.22);
    for (const s of [-1, 1]) { p.rod(M.BK, [s * 0.07, -0.01, 0.33], [s * 0.07, -0.01, 0.5], 0.014, 4); p.rod(M.RB, [s * 0.07, -0.09, 0.5], [s * 0.07, 0.07, 0.5], 0.02, 6); }
    p.cbox(M.col('#3f4a35'), 0.18, 0.21, 0.34, 0.015, -0.17, -0.04, -0.05); p.box(M.col('#9a7a34'), 0.07, 0.014, 0.1, -0.075, 0.07, -0.05, [0, 0, 0.6]);
    p.box(M.GM, 0.06, 0.1, 0.2, 0.09, -0.1, 0.02);
    // ---- shield: two cheek plates either side of the gun, a visor plate above it, angled wings
    for (const s of [-1, 1]) {
      p.box(M.S, 0.36, 0.66, 0.025, s * 0.26, 0.08, -0.43); p.box(M.S, 0.3, 0.66, 0.025, s * 0.57, 0.08, -0.36, [0, -s * 0.5, 0]);
      p.box(M.SD, 0.36, 0.03, 0.05, s * 0.26, 0.42, -0.43); if (fine) p.box(M.BK, 0.14, 0.03, 0.03, s * 0.26, 0.3, -0.44);
    }
    p.box(M.S, 0.17, 0.22, 0.025, 0, 0.3, -0.43); p.box(M.S, 0.17, 0.2, 0.025, 0, -0.16, -0.43);
    if (!A) p.box(M.S, 0.9, 0.025, 0.2, 0, 0.44, -0.36, [0.5, 0, 0]);
    muzzle(0, 0.02, -1.6); t.minPitch = -0.3; t.maxPitch = 1.3; t.gunner = new THREE.Vector3(0, 0, 0.85);
  } else if (kind === 'deckgun') {
    // ---- barbette ring and gunhouse (Aethia: faceted, strongly raked; Extro: upright, ribbed)
    k.add(M.SD, latheY([[2.1, 0], [2.1, 0.12], [1.95, 0.2], [1.9, 0.5]], 22)); bolts(2.02, 0.14, 18, 0.045);
    const y1 = A ? 2.45 : 2.35;
    const H = house(k, M.S, { z0: -2.35, z1: 2.25, wf: A ? 2.9 : 3.2, wa: 3.5, y0: 0.45, y1, slope: A ? 0.3 : 0.1, rakeF: A ? 0.5 : 0.3, rakeA: A ? 0.22 : 0.08, cf: 0.7, ca: 0.5 });
    for (const x of [-0.45, 0.45]) H.on(k, FWD, x, 1.05, (q) => q.cbox(M.SK, 0.52, 1.35, 0.08, 0.03, 0, 0, 0.02));
    H.on(k, AFT, 0, 0, (q) => door(q, MT, 0.7, 1.5));
    H.on(k, SB, 0.6, 0.2, (q) => ladder(q, MT.rail, 1.7, 0.4));
    for (const e of [SB, PT]) H.on(k, e, -0.3, 1.0, (q) => { q.cbox(M.SD, 0.9, 0.7, 0.04, 0.02, 0, 0, 0.02); if (fine) q.rod(MT.rail, [-0.6, 0.6, 0.08], [0.6, 0.6, 0.08], 0.018, 3); });
    k.at(0.75, y1, -0.5, 0, (q) => { q.cbox(M.SD, 0.5, 0.36, 0.62, 0.04, 0, 0.18, 0); q.box(MT.G, 0.34, 0.2, 0.02, 0, 0.2, -0.32); });
    k.at(-0.6, y1, 0.5, 0, (q) => hatch(q, MT, 0.62));
    k.at(0.5, y1, 1.0, 0, (q) => vent(q, M, 0.3, 0.14));
    k.at(-0.9, y1, 1.3, 0, (q) => aerial(q, 2.6, -0.12));
    if (fine) for (const [x, z] of [[-0.8, -0.9], [0.2, -1.0], [-0.9, 1.5], [0.9, 1.5]]) k.torus(M.SK, 0.07, 0.016, x, y1 + 0.06, z, [0, x, 0], 8);
    if (!A) { for (const z of [-0.6, 0.4, 1.4]) k.box(M.SD, 3.0, 0.07, 0.09, 0, y1 + 0.03, z); k.at(-1.0, y1, -0.6, 0, (q) => { q.cyl(M.SD, 0.2, 0.24, 0.3, 0, 0.15, 0, 'y', 10); q.sphere(M.S, 0.24, 0, 0.3, 0, [1, 0.6, 1], 10); }); }
    pitch.position.set(0, 1.5, -1.6);
    // ---- guns: trunnion drum, blast bags, sleeved barrels with thermal straps, slotted muzzle brakes
    p.cyl(M.SD, 0.36, 0.36, 1.7, 0, 0, 0.1, 'x', 14);
    for (const x of [-0.45, 0.45]) {
      p.sphere(M.RB, 1, x, 0, -0.4, [0.27, 0.27, 0.42], 12);
      p.lathe(BC, [[-5.08, 0.075], [-5.08, 0.16], [-4.58, 0.16], [-4.56, 0.098], [-2.0, 0.112], [-1.98, 0.155], [-1.9, 0.165], [-0.35, 0.18], [-0.3, 0.2], [0, 0.2]], fine ? 14 : 8, x, 0, 0);
      for (const z of [-4.7, -4.82, -4.94]) p.box(M.BK, 0.335, 0.07, 0.07, x, 0, z);
      p.cyl(M.BK, 0.075, 0.075, 0.02, x, 0, -5.07, 'z', 8);
      if (fine) for (const z of [-2.6, -3.3, -4.0]) p.cyl(M.SD, 0.125, 0.125, 0.06, x, 0, z, 'z', 12, true);
      muzzle(x, 0, -5.1);
    }
    p.cbox(M.SD, 0.3, 0.2, 0.5, 0.03, 0, 0.3, -0.5);
    t.minPitch = -0.08; t.maxPitch = 1.2;
  } else if (kind === 'heavy') {
    // ---- barbette and armoured gunhouse: raked face plate with three gun ports, rangefinder across the roof
    k.add(M.SD, latheY([[4.95, 0], [4.95, 0.2], [4.72, 0.32], [4.6, 1.2]], 28)); bolts(4.84, 0.22, 28, 0.08);
    const y1 = 4.5, H = house(k, M.S, { z0: -5.7, z1: 5.3, wf: A ? 7.4 : 8.0, wa: 9.2, y0: 1.2, y1, slope: A ? 0.14 : 0.06, rakeF: A ? 0.42 : 0.3, rakeA: 0.1, cf: 1.5, ca: 1.3 });
    for (const x of [-2.1, 0, 2.1]) H.on(k, FWD, x, 1.7, (q) => { q.cbox(M.SD, 1.56, 2.3, 0.1, 0.05, 0, 0, 0.03); q.cbox(M.SK, 1.24, 1.9, 0.1, 0.05, 0, 0, 0.06); });
    k.cyl(M.S, 0.46, 0.46, 9.9, 0, y1 + 0.05, 2.6, 'x', 12);
    for (const s of [-1, 1]) {
      k.cbox(M.S, 1.5, 1.05, 1.7, 0.12, s * 4.75, y1 - 0.2, 2.6); k.cyl(M.SK, 0.3, 0.3, 0.04, s * 4.9, y1 - 0.15, 1.74, 'z', 12); k.cyl(MT.G, 0.24, 0.24, 0.04, s * 4.9, y1 - 0.15, 1.73, 'z', 12);
      k.add(M.S, cb(0.9, 0.5, 1.1), s * 2.3, y1 + 0.25, -3.2); k.box(MT.G, 0.5, 0.16, 0.02, s * 2.3, y1 + 0.32, -3.76);
      k.at(s * 1.6, y1, 0.4, 0, (q) => hatch(q, MT, 0.8)); k.at(s * 3.0, y1, 4.0, 0, (q) => vent(q, M, 0.5, 0.2));
      H.on(k, s > 0 ? SB : PT, 1.8, 1.3, (q) => q.at(0, 0, 0.42, HP, (r) => raft(r, 1.5, 0.36)));
      H.on(k, s > 0 ? SB : PT, -1.6, 1.3, (q) => q.at(0, 0, 0.42, HP, (r) => raft(r, 1.5, 0.36)));
      if (fine) H.on(k, s > 0 ? SB : PT, -3.4, 0.3, (q) => ladder(q, MT.rail, 2.9, 0.42));
    }
    for (const x of [-0.5, 0, 0.5]) k.cbox(M.SD, 0.22, 0.2, 0.3, 0.03, x, y1 + 0.1, -1.6);
    H.on(k, AFT, 0, 0, (q) => door(q, MT, 0.9, 1.9)); H.on(k, AFT, 2.6, 0, (q) => ladder(q, MT.rail, 3.3, 0.45));
    rail(k, [[-3.6, y1, 3.4], [-3.6, y1, 4.7], [3.6, y1, 4.7], [3.6, y1, 3.4]], { h: 1.0, post: 1.6, mc: MT.rail });
    k.at(-3.3, y1, 4.4, 0, (q) => aerial(q, 4.5, -0.1));
    if (!A) { for (const z of [-2.2, -0.4, 1.4]) k.box(M.SD, 7.6, 0.1, 0.14, 0, y1 + 0.05, z); k.at(0, y1, -0.2, 0, (q) => { q.cyl(M.SD, 0.7, 0.8, 0.5, 0, 0.25, 0, 'y', 12); q.cyl(M.S, 0.62, 0.62, 0.5, 0, 0.7, 0, 'y', 12); }); }
    else k.cbox(M.SD, 2.2, 0.3, 2.6, 0.06, 0, y1 + 0.15, 0.2);
    pitch.position.set(0, 2.9, -4.2);
    // ---- guns: canvas blast bags, built-up barrels (stepped jackets), muzzle swell
    for (const x of [-2.1, 0, 2.1]) {
      p.lathe(M.RB, [[-2.3, 0.5], [-1.9, 0.62], [-1.2, 0.8], [-0.5, 0.86], [0.2, 0.84]], fine ? 14 : 8, x, 0, 0);
      p.lathe(BC, [[-13.14, 0.2], [-13.14, 0.33], [-12.9, 0.36], [-12.4, 0.33], [-11.9, 0.29], [-5.6, 0.4], [-5.56, 0.47], [-2.3, 0.52], [-2.26, 0.58], [-1.6, 0.6]], fine ? 16 : 8, x, 0, 0);
      p.cyl(M.BK, 0.2, 0.2, 0.02, x, 0, -13.13, 'z', 10);
      if (fine) for (const z of [-3.4, -4.6]) p.cyl(M.SD, 0.53, 0.53, 0.12, x, 0, z, 'z', 14, true);
      muzzle(x, 0, -13.2);
    }
    t.minPitch = -0.05; t.maxPitch = 0.75;
  } else if (kind === 'ciws') {
    // ---- base ring, equipment cabinet, yoke
    k.add(M.SD, latheY([[1.05, 0], [1.05, 0.1], [0.92, 0.18], [0.9, 0.3]], 16)); bolts(0.98, 0.12, 10, 0.035);
    k.cbox(M.S, 1.3, 1.1, 1.5, 0.08, 0, 0.85, 0.25);
    k.box(M.SD, 0.7, 0.8, 0.03, 0, 0.85, 1.01); if (fine) { for (let i = 0; i < 4; i++) k.box(M.SK, 0.5, 0.04, 0.02, 0, 0.62 + i * 0.14, 1.03); k.box(M.YL, 0.2, 0.08, 0.01, 0.4, 1.2, 1.01); }
    for (const s of [-1, 1]) { k.cbox(M.S, 0.16, 1.0, 0.7, 0.04, s * 0.56, 1.75, 0); k.cyl(M.SD, 0.2, 0.2, 0.08, s * 0.66, 1.9, 0, 'x', 10); }
    pitch.position.set(0, 1.9, 0);
    // ---- gun: six-barrel cluster with clamps, ammunition drum and feed chute, radar on top
    p.cbox(M.SD, 0.76, 0.66, 1.3, 0.06, 0, 0, 0.05);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; p.cyl(M.GM, 0.034, 0.034, 1.9, Math.cos(a) * 0.1, -0.05 + Math.sin(a) * 0.1, -1.5, 'z', 6); }
    for (const z of [-0.75, -1.5, -2.2]) p.cyl(M.BK, 0.165, 0.165, 0.07, 0, -0.05, z, 'z', 12);
    p.cyl(M.GM, 0.2, 0.17, 0.24, 0, -0.05, -0.7, 'z', 12); p.cyl(M.BK, 0.15, 0.15, 0.04, 0, -0.05, -2.44, 'z', 12);
    p.cyl(M.SD, 0.4, 0.4, 0.62, 0, -0.62, 0.15, 'x', 14); p.pipe(M.BK, [[0.3, -0.5, -0.1], [0.42, -0.2, -0.3], [0.3, 0, -0.5]], 0.07, 5, 8);
    if (A) { // tall white radome: search dish under a dome, tracking antenna in the barrel
      p.add(M.W, latheY([[0.5, 0.3], [0.54, 0.45], [0.54, 1.5], [0.46, 1.86], [0.3, 2.05], [0.02, 2.12]], fine ? 18 : 10), 0, 0, 0.1);
      p.cyl(M.SD, 0.56, 0.56, 0.06, 0, 0.98, 0.1, 'y', 16, true); p.cyl(M.SD, 0.46, 0.5, 0.1, 0, 0.3, 0.1, 'y', 14);
      p.cbox(M.SD, 0.22, 0.26, 0.3, 0.03, 0.5, 0.45, -0.5); p.cyl(MT.G, 0.08, 0.08, 0.02, 0.5, 0.45, -0.66, 'z', 8);
    } else { // flat-topped radar drum, tracking dish and optical sight
      p.cyl(M.S, 0.5, 0.56, 0.42, 0, 0.56, 0.2, 'y', 16); p.cyl(M.W, 0.5, 0.5, 0.06, 0, 0.8, 0.2, 'y', 16);
      p.sphere(M.W, 0.36, 0, 1.15, -0.05, [1, 1, 0.42], 12); p.rod(M.SD, [0, 0.82, 0.1], [0, 1.15, 0], 0.06, 5);
      p.cbox(M.SD, 0.26, 0.3, 0.36, 0.03, -0.52, 0.42, -0.45); p.cyl(MT.G, 0.09, 0.09, 0.02, -0.52, 0.42, -0.64, 'z', 8);
    }
    muzzle(0, -0.05, -2.6); t.minPitch = -0.2; t.maxPitch = 1.45;
  } else if (kind === 'sam') {
    // ---- pedestal with an access door, cable trunk and ladder rungs
    k.add(M.SD, latheY([[1.55, 0], [1.55, 0.14], [1.38, 0.24], [1.3, 1.0]], 18)); bolts(1.46, 0.16, 12, 0.045);
    k.cyl(M.S, 0.72, 0.8, 1.5, 0, 1.7, 0, 'y', 14); k.cyl(M.SD, 0.84, 0.84, 0.1, 0, 2.4, 0, 'y', 14);
    k.at(0, 1.15, 0.8, 0, (q) => door(q, MT, 0.55, 1.0));
    if (fine) { for (let i = 0; i < 4; i++) k.rod(MT.rail, [0.8, 1.2 + i * 0.3, -0.2], [0.8, 1.2 + i * 0.3, 0.2], 0.018, 3); k.pipe(M.SK, [[-0.6, 1.0, 0.55], [-0.75, 1.6, 0.4], [-0.6, 2.3, 0.3]], 0.05, 5, 8); }
    pitch.position.set(0, 2.2, 0);
    p.cyl(M.SD, 0.24, 0.24, 2.7, 0, 0, 0, 'x', 12); p.cbox(M.SD, 0.9, 0.7, 0.9, 0.06, 0, 0, 0.05);
    for (const s of [-1, 1]) {
      const x = s * 1.25;
      if (A) { // box launcher: four sealed cells per side
        p.cbox(M.S, 1.4, 1.5, 4.2, 0.07, x, 0, 0);
        for (const z of [-1.7, -0.6, 0.6, 1.7]) p.cbox(M.SD, 1.46, 1.56, 0.1, 0.03, x, 0, z);
        for (const cx of [-0.33, 0.33]) for (const cy of [-0.35, 0.35]) {
          p.cyl(M.SK, 0.3, 0.3, 0.04, x + cx, cy, -2.1, 'z', 12); p.sphere(M.W, 0.26, x + cx, cy, -2.1, [1, 1, 0.3], 10);
          p.box(M.SK, 0.5, 0.56, 0.03, x + cx, cy, 2.11);
        }
        if (fine) { p.box(M.YL, 0.5, 0.1, 0.01, x + s * 0.71, 0.3, -1.2, [0, HP, 0]); for (const z of [-1.2, 1.2]) p.torus(M.SK, 0.08, 0.02, x, 0.78, z, [0, HP, 0], 8); }
      } else { // rail launcher: two rounds on each arm
        p.cbox(M.S, 0.34, 0.5, 3.8, 0.05, x, 0, 0.1); p.cbox(M.SD, 0.5, 0.3, 0.8, 0.04, x, 0, 1.6);
        for (const cy of [-0.45, 0.45]) {
          p.box(M.SD, 0.12, 0.08, 3.4, x, cy * 0.62, 0);
          p.parts(buildSAM(), x, cy, 0.25, null, 0.74);
        }
      }
      muzzle(x, 0, -2.3);
    }
    if (!A) { p.sphere(M.W, 0.3, 0, 0.5, -0.2, [1, 1, 0.5], 10); p.rod(M.SD, [0, 0.3, 0], [0, 0.5, -0.1], 0.05, 4); }
    t.minPitch = 0.1; t.maxPitch = 1.3; t.elev = 0.5;
  }
  k.build(node); p.build(pitch);
  pitch.rotation.x = t.elev;
  node.userData.model = t;
  return node;
}
// tapered sighting hood
function cb(w, h, d) { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(), q = g.attributes.position; for (let i = 0; i < q.count; i++) if (q.getY(i) > 0) { q.setX(i, q.getX(i) * 0.7); q.setZ(i, q.getZ(i) * 0.6 + d * 0.12); } g.computeVertexNormals(); return g; }

/** Put a mount on a ship being built (S from startShip): position, rest bearing (0 = bow, PI = aft) and arc. */
export function mount(S, kind, x, y, z, rest, arc) {
  const t = makeTurretV2(kind, S.nation);
  t.node.position.set(x, y, z); t.rest = rest; t.arc = arc; t.node.rotation.y = rest; S.g.add(t.node); S.model.turrets.push(t);
  return t;
}
/** Static stand-in for a mount in the distant model (no moving parts, a handful of triangles). */
export function proxy(k, M, kind, x, y, z, rest) {
  k.at(x, y, z, rest, (q) => {
    if (kind === 'heavy') { q.cyl(M.SD, 4.6, 4.9, 1.2, 0, 0.6, 0, 'y', 10); house(q, M.S, { z0: -5.7, z1: 5.3, wf: 7.6, wa: 9.2, y0: 1.2, y1: 4.5, slope: 0.1, rakeF: 0.35, cf: 1.5, ca: 1.3 }); for (const bx of [-2.1, 0, 2.1]) q.cyl(M.GM, 0.3, 0.5, 9.5, bx, 3.1, -9.3, 'z', 5); }
    else if (kind === 'deckgun') { house(q, M.S, { z0: -2.35, z1: 2.25, wf: 3, wa: 3.5, y0: 0, y1: 2.4, slope: 0.2, rakeF: 0.4, cf: 0.7, ca: 0.5 }); for (const bx of [-0.45, 0.45]) q.cyl(M.GM, 0.12, 0.17, 3.6, bx, 1.55, -3.4, 'z', 4); }
    else if (kind === 'ciws') { q.box(M.S, 1.3, 1.6, 1.5, 0, 0.8, 0.2); q.cyl(M.W, 0.54, 0.54, 1.9, 0, 3.0, 0.1, 'y', 6); q.cyl(M.GM, 0.16, 0.16, 2, 0, 1.85, -1.4, 'z', 4); }
    else if (kind === 'sam') { q.cyl(M.SD, 0.8, 1.5, 2.2, 0, 1.1, 0, 'y', 6); for (const s of [-1, 1]) q.box(M.S, 1.4, 1.5, 4.2, s * 1.25, 2.6, 0, [0.5, 0, 0]); }
  });
}
