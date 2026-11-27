// Shared model-building toolkit. Every unit model is built in code from these helpers.
//
// AXES: +Y up, forward = -Z (bow / nose at negative Z), starboard = +X. Units are metres. Ship origin = waterline, midships
// centre. Aircraft origin = centre of mass. Soldier origin = feet.
//
// MODEL CONTRACT. Every unit builder is `build(nation, lod)` (nation 'aethia'|'extro', lod 0 = full detail, 1 = distant) and
// returns a THREE.Group whose userData.model holds (lod 1 only needs `dims`; everything else is read from the lod 0 build):
//   dims:     { length, beam, height, draft }
//   turrets:  [ turret objects from makeTurret(), already added to the group and positioned ]   (see makeTurret)
//   spinners: [ { node, axis: 'x'|'y'|'z', speed } ]      radars, rotors, propellers (speed in rad/s at full power)
//   decks:    [ { x0, x1, z0, z1, y } ]                    walkable rectangles (local coords); highest one under a point wins
//   blocks:   [ { x0, x1, z0, z1, y0, y1 } ]               solid superstructure boxes people cannot walk through
//             (v2 ships and submarines also get { ..., auto: 1 } boxes and `rings` worked out from the geometry when they are
//             built: see js/units/v2/solids.js. Only the big boxes a model needs for itself have to be typed in.)
//   posts:    [ { x, y, z, yaw, kind } ]                   crew stations: kind 'bridge'|'deck'|'flight'|'lookout'
//   smoke:    [ Vector3 ]                                  funnel exhaust points
//   view:     { bridge: Vector3, chase: metres, chaseH: metres }
//   plus per-class extras documented in each unit module.
// Static geometry is merged per material with PartBuilder (few draw calls). Anything that moves is its own Group.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT } from '../gfx/materials.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

function norm(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

export class PartBuilder {
  constructor(lod = 0) { this.lod = lod; this.detail = lod === 0; this.buckets = new Map(); }
  // add any geometry with a transform. rot = [rx, ry, rz] (Euler XYZ), scl = number | [sx, sy, sz]
  add(mat, geom, x = 0, y = 0, z = 0, rot = null, scl = null) {
    const g = norm(geom.clone ? geom : geom);
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e); _p.set(x, y, z);
    if (scl == null) _s.set(1, 1, 1); else if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
    _m.compose(_p, _q, _s); g.applyMatrix4(_m);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return this;
  }
  box(mat, w, h, d, x = 0, y = 0, z = 0, rot = null) { return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rot); }
  // y is the CENTRE of the cylinder. axis 'y' (default) | 'x' | 'z'
  cyl(mat, rTop, rBot, h, x = 0, y = 0, z = 0, axis = 'y', seg = 10) {
    const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : null;
    return this.add(mat, new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y, z, rot);
  }
  sphere(mat, r, x = 0, y = 0, z = 0, scl = null, seg = 12) { return this.add(mat, new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), x, y, z, null, scl); }
  cone(mat, r, h, x = 0, y = 0, z = 0, axis = 'y', seg = 10) {
    const rot = axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [-Math.PI / 2, 0, 0] : axis === '-z' ? [-Math.PI / 2, 0, 0] : axis === '+z' ? [Math.PI / 2, 0, 0] : null;
    return this.add(mat, new THREE.ConeGeometry(r, h, seg), x, y, z, rot);
  }
  // cylinder between two points a=[x,y,z], b=[x,y,z]
  tube(mat, a, b, r = 0.05, seg = 6, r2 = null) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va), len = d.length();
    const g = norm(new THREE.CylinderGeometry(r2 ?? r, r, len, seg));
    _q.setFromUnitVectors(UPV, d.normalize()); _p.copy(va).add(vb).multiplyScalar(0.5); _s.set(1, 1, 1);
    _m.compose(_p, _q, _s); g.applyMatrix4(_m);
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return this;
  }
  // box whose top face is scaled (topW, topD) and shifted along z (sloped superstructure, funnels, turret housings)
  taper(mat, w, h, d, topW, topD, x = 0, y = 0, z = 0, shiftZ = 0, rot = null) { return this.add(mat, taperBox(w, h, d, topW, topD, shiftZ), x, y, z, rot); }
  // guard rail along a polyline of [x,y,z] deck points (detail lod only)
  rail(mat, pts, height = 1.1, postEvery = 3) {
    if (!this.detail) return this;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      this.tube(mat, [a[0], a[1] + height, a[2]], [b[0], b[1] + height, b[2]], 0.035, 4);
      this.tube(mat, [a[0], a[1] + height * 0.5, a[2]], [b[0], b[1] + height * 0.5, b[2]], 0.025, 4);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.round(len / postEvery));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
        this.tube(mat, [x, y, z], [x, y + height, z], 0.03, 4);
      }
    }
    return this;
  }
  // finish: one mesh per material, added to parent. Returns the meshes.
  build(parent, { cast = true, receive = true } = {}) {
    const out = [];
    for (const [mat, list] of this.buckets) {
      if (!list.length) continue;
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      parent.add(mesh); out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

export function taperBox(w, h, d, topW, topD, shiftZ = 0) {
  let g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * (topW / w)); p.setZ(i, p.getZ(i) * (topD / d) + shiftZ); }
  g.computeVertexNormals();
  return g;
}

// Flat slab from a 2D outline in the XZ plane: pts = [[x,z],...] (any winding), thickness along Y, top surface at y = 0.
// UVs are in metres / uvScale (so tiling deck textures work); pass uvRect {x0,x1,z0,z1} to map 0..1 over a rectangle instead.
export function slab(pts, thickness = 0.5, uvScale = 4, uvRect = null) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  let g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, -thickness, 0);
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (uvRect) uv.setXY(i, (p.getX(i) - uvRect.x0) / (uvRect.x1 - uvRect.x0), (p.getZ(i) - uvRect.z0) / (uvRect.z1 - uvRect.z0));
    else uv.setXY(i, p.getX(i) / uvScale, p.getZ(i) / uvScale);
  }
  g.computeVertexNormals();
  return g;
}

// Body of revolution along the Z axis. profile = [[z, r], ...] from nose (most negative z) to tail. sx/sy squash the section.
export function fuselage(profile, seg = 14, sx = 1, sy = 1) {
  const pts = profile.map(([z, r]) => new THREE.Vector2(Math.max(r, 0.001), -z)).reverse(); // ascending y = outward faces
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(-Math.PI / 2); // lathe axis Y -> -Z... (y = -z input) so nose ends up at negative z
  g.scale(sx, sy, 1);
  g.computeVertexNormals();
  return g;
}

// Tapered, swept wing panel lying in the XZ plane, root at x = 0 extending to +X (mirror with scale -1 for the other side).
// rootChord/tipChord along Z, sweep = how far the tip leading edge sits aft (+z) of the root leading edge.
// The root leading edge is at z = 0; thickness along Y, centred.
export function wing(span, rootChord, tipChord, sweep, thick = 0.25, tipThick = null, dihedral = 0) {
  const tt = tipThick ?? thick * 0.4, dy = Math.tan(dihedral) * span;
  const v = [
    [0, thick / 2, 0], [0, thick / 2, rootChord], [span, dy + tt / 2, sweep + tipChord], [span, dy + tt / 2, sweep],
    [0, -thick / 2, 0], [0, -thick / 2, rootChord], [span, dy - tt / 2, sweep + tipChord], [span, dy - tt / 2, sweep],
  ];
  const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 3, 7, 4], [1, 5, 6, 2], [3, 2, 6, 7], [0, 4, 5, 1]];
  const pos = [], uv = [];
  for (const f of faces) for (const k of [0, 1, 2, 0, 2, 3]) { const p = v[f[k]]; pos.push(p[0], p[1], p[2]); uv.push(p[0] / 4, p[2] / 4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---- lofted ship hull ---------------------------------------------------------------------------------------------------
// opts: L length, B beam, draft, freeboard (deck edge height above water amidships), sheer (extra bow height),
//       bowLen (fraction of L that is the pointed bow, default .32), sternW (transom width fraction 0..1), sternLen (fraction),
//       flare (0..1 how much the bow sections flare), full (0.2 fine .. 0.6 boxy midsection), rake (bow overhang metres)
// Returns { side: BufferGeometry, deck: BufferGeometry, halfBeamAt(z), deckYAt(z) }. Bow at z = -L/2.
export function hullShape(o) {
  const L = o.L, B = o.B, bowLen = o.bowLen ?? 0.32, sternW = o.sternW ?? 0.7, sternLen = o.sternLen ?? 0.18;
  const halfBeamS = (s) => { // s: 0 bow .. 1 stern (deck level)
    if (s < bowLen) { const t = s / bowLen; return (B / 2) * Math.pow(Math.sin(t * Math.PI / 2), o.bowPow ?? 0.75); }
    if (s > 1 - sternLen) { const t = (s - (1 - sternLen)) / sternLen; return (B / 2) * (1 - (1 - sternW) * t * t); }
    return B / 2;
  };
  const deckYS = (s) => o.freeboard + (o.sheer ?? 0) * Math.pow(Math.max(0, 1 - s / 0.4), 2);
  return {
    halfBeamAt: (z) => halfBeamS(clamp01((z + L / 2) / L)),
    deckYAt: (z) => deckYS(clamp01((z + L / 2) / L)),
    halfBeamS, deckYS,
  };
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hullGeo(o) {
  const L = o.L, draft = o.draft, flare = o.flare ?? 0.35, full = o.full ?? 0.4, rake = o.rake ?? L * 0.03;
  const sh = hullShape(o), NS = o.stations ?? 28, NV = o.rings ?? 7;
  const pos = [], uv = [];
  const ring = (i) => { // points from keel (j=0) to deck edge (j=NV) for the +X side
    const s = i / NS, hb = sh.halfBeamS(s), dy = sh.deckYS(s), out = [];
    const bowT = clamp01(1 - s / (o.bowLen ?? 0.32)), sternT = clamp01((s - 0.8) / 0.2);
    const keel = -draft * (1 - 0.75 * Math.pow(bowT, 3) - 0.55 * sternT * sternT);
    const expo = full + (1.15 - full) * Math.pow(bowT, 0.8) * (0.5 + flare); // V sections toward the bow
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, y = keel + (dy - keel) * v;
      let w = hb * Math.pow(v, expo);
      if (j === NV) w = hb;
      const z = -L / 2 + s * L - rake * bowT * bowT * v; // raked stem: the deck reaches further forward than the keel
      // texture v: the hull texture puts the waterline at v = 0.35 (anti-fouling paint below, hull paint above)
      out.push([w, y, z, y <= 0 ? 0.35 * (1 - y / -draft) : 0.35 + 0.65 * (y / dy)]);
    }
    return out;
  };
  const rings = []; for (let i = 0; i <= NS; i++) rings.push(ring(i));
  const quad = (a, b, c, d, ua, ub, uc, ud) => { for (const [p, t] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { pos.push(p[0], p[1], p[2]); uv.push(t[0], t[1]); } };
  for (const side of [1, -1]) {
    for (let i = 0; i < NS; i++) for (let j = 0; j < NV; j++) {
      const A = rings[i][j], Bq = rings[i + 1][j], C = rings[i + 1][j + 1], D = rings[i][j + 1];
      const P = (r) => [r[0] * side, r[1], r[2]], U = (r, ii) => [((ii / NS) * L) / 20, r[3]];
      if (side > 0) quad(P(A), P(D), P(C), P(Bq), U(A, i), U(D, i), U(C, i + 1), U(Bq, i + 1));
      else quad(P(A), P(Bq), P(C), P(D), U(A, i), U(Bq, i + 1), U(C, i + 1), U(D, i));
    }
  }
  // transom
  const last = rings[NS];
  for (let j = 0; j < NV; j++) {
    const a = last[j], b = last[j + 1];
    quad([a[0], a[1], a[2]], [b[0], b[1], b[2]], [-b[0], b[1], b[2]], [-a[0], a[1], a[2]], [0, a[3]], [0, b[3]], [0.5, b[3]], [0.5, a[3]]);
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  side.computeVertexNormals();
  // deck
  const dp = [], du = [];
  for (let i = 0; i < NS; i++) {
    const a = rings[i][NV], b = rings[i + 1][NV];
    const P = [[a[0], a[1], a[2]], [-a[0], a[1], a[2]], [-b[0], b[1], b[2]], [b[0], b[1], b[2]]];
    for (const k of [0, 1, 2, 0, 2, 3]) { dp.push(P[k][0], P[k][1], P[k][2]); du.push(P[k][0] / 4, P[k][2] / 4); }
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  deck.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2));
  deck.computeVertexNormals();
  return { side, deck, halfBeamAt: sh.halfBeamAt, deckYAt: sh.deckYAt };
}

// ---- standard weapon mounts (shared by every ship) -----------------------------------------------------------------------
// makeTurret(kind, nation) -> turret object:
//   { kind, node, pitch, muzzles: [Object3D], rest, arc, minPitch, maxPitch, gunner: Vector3|null (local to node), detailNode }
//   node:  Group at the mount base. node.rotation.y = rest + traverse. (rest 0 faces the bow, Math.PI faces aft)
//   pitch: child Group at the trunnion. pitch.rotation.x = elevation (positive = up). Barrels point along -Z.
// kinds: 'mg' (pintle machine gun with shield, crew-served), 'deckgun' (twin-barrel medium turret), 'heavy' (triple-barrel
//        main battery), 'ciws' (rapid-fire close-in AA gun with radome), 'sam' (8-cell missile launcher), 'chin' (heli quad MG)
// Position it with turret.node.position.set(...), set turret.rest / turret.arc, then group.add(turret.node).
export function makeTurret(kind, nation) {
  const node = new THREE.Group(), pitch = new THREE.Group(); node.add(pitch);
  const sup = MAT.superstructure[nation], dark = MAT.superDark[nation], gm = MAT.gunmetal;
  const b = new PartBuilder(0), pb = new PartBuilder(0), muzzles = [];
  const t = { kind, node, pitch, muzzles, rest: 0, arc: Math.PI, minPitch: -0.12, maxPitch: 1.2, gunner: null, yaw: 0, elev: 0 };
  const muzzle = (x, y, z) => { const m = new THREE.Object3D(); m.position.set(x, y, z); pitch.add(m); muzzles.push(m); };
  if (kind === 'mg') {
    b.cyl(gm, 0.09, 0.14, 1.1, 0, 0.55, 0, 'y', 8); b.cyl(gm, 0.3, 0.34, 0.08, 0, 0.04, 0, 'y', 10);
    pitch.position.set(0, 1.25, 0);
    pb.box(gm, 0.14, 0.16, 0.9, 0, 0, -0.1); pb.cyl(gm, 0.028, 0.028, 1.1, 0, 0.02, -1.0, 'z', 6);
    pb.box(MAT.black, 0.3, 0.25, 0.35, 0.22, -0.02, 0.0); // ammo box
    pb.box(sup, 0.9, 0.7, 0.03, 0, 0.12, -0.45); // gun shield
    pb.tube(gm, [-0.18, -0.05, 0.4], [-0.18, -0.2, 0.7], 0.02); pb.tube(gm, [0.18, -0.05, 0.4], [0.18, -0.2, 0.7], 0.02);
    muzzle(0, 0.02, -1.6); t.minPitch = -0.3; t.maxPitch = 1.3; t.gunner = new THREE.Vector3(0, 0, 0.85);
  } else if (kind === 'deckgun') {
    b.cyl(dark, 1.9, 2.0, 0.5, 0, 0.25, 0, 'y', 14);
    b.taper(sup, 3.4, 1.9, 4.4, nation === 'aethia' ? 2.2 : 3.0, nation === 'aethia' ? 2.6 : 3.6, 0, 1.45, 0, 0.35);
    pitch.position.set(0, 1.5, -1.6);
    for (const x of [-0.45, 0.45]) { pb.cyl(gm, 0.1, 0.13, 5.0, x, 0, -2.5, 'z', 8); pb.cyl(gm, 0.15, 0.15, 0.5, x, 0, -4.8, 'z', 8); pb.cyl(MAT.black, 0.2, 0.2, 0.9, x, 0, -0.5, 'z', 8); muzzle(x, 0, -5.1); }
    t.minPitch = -0.08; t.maxPitch = 1.2;
  } else if (kind === 'heavy') {
    b.cyl(dark, 4.6, 4.8, 1.2, 0, 0.6, 0, 'y', 18);
    b.taper(sup, 9.0, 3.2, 11.0, nation === 'aethia' ? 6.2 : 8.0, nation === 'aethia' ? 7.5 : 9.4, 0, 2.8, 0.5, 0.6);
    b.box(dark, 10.5, 0.9, 1.4, 0, 3.0, 3.6); // rangefinder arms
    pitch.position.set(0, 2.9, -4.2);
    for (const x of [-2.1, 0, 2.1]) { pb.cyl(gm, 0.26, 0.38, 13, x, 0, -6.5, 'z', 10); pb.cyl(gm, 0.34, 0.34, 0.8, x, 0, -12.7, 'z', 10); pb.cyl(MAT.black, 0.55, 0.6, 1.6, x, 0, -0.6, 'z', 10); muzzle(x, 0, -13.2); }
    t.minPitch = -0.05; t.maxPitch = 0.75;
  } else if (kind === 'ciws') {
    b.cyl(dark, 0.9, 1.0, 0.5, 0, 0.25, 0, 'y', 12); b.box(sup, 1.3, 1.2, 1.5, 0, 1.1, 0.2);
    pitch.position.set(0, 1.9, 0);
    pb.cyl(MAT.white, 0.55, 0.55, 1.5, 0, 1.0, 0.1, 'y', 12); pb.sphere(MAT.white, 0.55, 0, 1.75, 0.1);
    pb.box(gm, 0.7, 0.7, 1.2, 0, 0, 0); pb.cyl(gm, 0.16, 0.16, 2.0, 0, -0.05, -1.5, 'z', 8); pb.cyl(MAT.black, 0.2, 0.2, 0.25, 0, -0.05, -2.4, 'z', 8);
    muzzle(0, -0.05, -2.6); t.minPitch = -0.2; t.maxPitch = 1.45;
  } else if (kind === 'sam') {
    b.cyl(dark, 1.3, 1.5, 1.0, 0, 0.5, 0, 'y', 12); b.box(sup, 1.0, 1.6, 1.4, 0, 1.6, 0);
    pitch.position.set(0, 2.2, 0);
    for (const x of [-1.25, 1.25]) {
      pb.box(sup, 1.4, 1.5, 4.2, x, 0, 0);
      for (const cx of [-0.33, 0.33]) for (const cy of [-0.35, 0.35]) { pb.cyl(MAT.black, 0.24, 0.24, 0.06, x + cx, cy, -2.11, 'z', 8); }
      muzzle(x, 0, -2.3);
    }
    pb.cyl(gm, 0.2, 0.2, 2.5, 0, 0, 0, 'x', 8);
    t.minPitch = 0.1; t.maxPitch = 1.3; t.elev = 0.5;
  } else if (kind === 'chin') {
    b.cyl(gm, 0.22, 0.26, 0.3, 0, -0.15, 0, 'y', 10);
    pitch.position.set(0, -0.4, 0);
    pb.box(gm, 0.3, 0.26, 0.6, 0, 0, 0);
    for (const [x, y] of [[-0.06, 0.06], [0.06, 0.06], [-0.06, -0.06], [0.06, -0.06]]) pb.cyl(gm, 0.022, 0.022, 1.3, x, y, -0.9, 'z', 5);
    muzzle(0, 0, -1.6); t.minPitch = -1.0; t.maxPitch = 0.25; t.arc = 1.9;
  }
  b.build(node); pb.build(pitch);
  pitch.rotation.x = t.elev;
  return t;
}

// A little radar set: returns { node (spins about y), base added into builder b }.
export function makeRadar(nation, w = 5, h = 1.6) {
  const node = new THREE.Group(), b = new PartBuilder(0);
  if (nation === 'aethia') { b.box(MAT.superstructure.aethia, w, h, 0.25, 0, h / 2 + 0.3, 0, [0.12, 0, 0]); b.cyl(MAT.gunmetal, 0.15, 0.2, 0.6, 0, 0.3, 0); }
  else { b.box(MAT.gunmetal, w, 0.18, 0.18, 0, h + 0.3, 0); b.box(MAT.gunmetal, w, 0.18, 0.18, 0, 0.4, 0); for (let i = -4; i <= 4; i++) b.box(MAT.gunmetal, 0.08, h, 0.08, (i / 4) * w * 0.48, h / 2 + 0.3, 0); b.box(MAT.superDark.extro, w * 0.5, h * 0.6, 0.5, 0, h / 2 + 0.3, 0.3); b.cyl(MAT.gunmetal, 0.2, 0.25, 0.6, 0, 0.3, 0); }
  b.build(node);
  return node;
}

// flat decal plane lying on a deck (faces up), size w (x) by d (z)
export function deckDecal(mat, w, d, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.set(-Math.PI / 2, 0, rotY); m.position.set(x, y + 0.04, z); m.receiveShadow = true; m.renderOrder = 2;
  return m;
}
// vertical decal plane on a ship side; side = +1 starboard (faces +X) or -1 port
export function sideDecal(mat, w, h, x, y, z, side = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; m.position.set(x + side * 0.06, y, z); m.renderOrder = 2;
  return m;
}
