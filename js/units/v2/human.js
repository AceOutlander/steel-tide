// Every person in the game: one code-built human (about 1.8 m, origin at the soles) skinned to a skeleton, dressed by role,
// and animated in code. buildSoldier / animateSoldier keep the call shapes of js/units/marine.js, so this is a drop-in.
//
//   buildSoldier(nation, opts)  opts: { role: 'marine'|'sailor'|'officer'|'gunner'|'lookout'|'pilot'|'deck', jersey: 'yellow'|'green'|
//       'red'|'blue'|'white'|'brown'|'purple', uniform, helmet (keys of UNIFORMS / HELMETS: swappable), vest: true (life vest),
//       rifle: false, skin: 0..3, lod: force one detail level, parts: 'arms' (first-person arms only) }
//     -> Group. userData.attach = { head, face, back, chest, belt, neck, shoulderL, shoulderR, kneeL, kneeR } (Object3Ds on the
//        bones, model axes), userData.rifle (the held rifle or null), userData.shadow (contact shadow), userData.rig2 (skeleton).
//   animateSoldier(model, state, t, moving, lookPitch, extra)
//     states: idle walk run crouch aim swim sit gun (as before) + air dead stand patrol watch signal work.
//     extra (optional): { fire: s since the last shot, reload: 0..1, vy, land: 0..1, dead: s since death, dist: camera distance,
//       back: moving backwards, strafe: -1..1, snap: true = no blending, phase: walk phase to use }
//   buildRifle(lod)  -> Group, about 0.92 m, barrel along -Z, origin at the top of the pistol grip. userData: butt, muzzle, eject,
//       sight (Vector3s), mag (Object3D), wristR / wristL (where the hands hold it).
import * as THREE from 'three';
import { gfx } from '../../gfx/renderer.js';
import { people, ridges } from './people.js';
import { kit, uniformDef, helmetColor, ROLES, SKIN, hairline, blobGeometry, UNIFORM_ALIAS, HELMET_ALIAS, HELMETS, UNIFORMS, ACCESSORIES } from './humankit.js';

const PI = Math.PI, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }, lerp = (a, b, t) => a + (b - a) * t;

/* =============================================================== skeleton */
const SK = [ // name, parent, bind position (model space, metres). Right = +X, forward = -Z.
  ['hips', -1, 0, 0.955, 0], ['spine', 0, 0, 1.07, 0.004], ['chest', 1, 0, 1.24, 0.004], ['neck', 2, 0, 1.495, 0.012], ['head', 3, 0, 1.59, 0.006],
  ['uarmR', 2, 0.198, 1.42, 0], ['larmR', 5, 0.198, 1.125, 0], ['handR', 6, 0.198, 0.861, 0], ['finR', 7, 0.198, 0.75, 0], ['fin2R', 8, 0.198, 0.721, 0], ['thumbR', 7, 0.195, 0.82, -0.031],
  ['uarmL', 2, -0.198, 1.42, 0], ['larmL', 11, -0.198, 1.125, 0], ['handL', 12, -0.198, 0.861, 0], ['finL', 13, -0.198, 0.75, 0], ['fin2L', 14, -0.198, 0.721, 0], ['thumbL', 13, -0.195, 0.82, -0.031],
  ['ulegR', 0, 0.092, 0.955, 0], ['llegR', 17, 0.092, 0.515, 0], ['footR', 18, 0.092, 0.085, 0],
  ['ulegL', 0, -0.092, 0.955, 0], ['llegL', 20, -0.092, 0.515, 0], ['footL', 21, -0.092, 0.085, 0],
];
const HIPS = 0, SPINE = 1, CHEST = 2, NECK = 3, HEAD = 4, ARM_R = 5, ARM_L = 11, LEG_R = 17, LEG_L = 20, NB = SK.length;
const BASE = 0.955, L1 = 0.295, L2 = 0.264, SOLE = 0.085;
const armBase = (s) => (s > 0 ? ARM_R : ARM_L), legBase = (s) => (s > 0 ? LEG_R : LEG_L);

/* =============================================================== geometry */
const SLOTS = ['cloth', 'gear', 'skin', 'glass'], WHITE = [1, 1, 1], SKINUV = [0.5, 0.045];
const CC = new Map(), _c = new THREE.Color();
const C = (hex, k = 1) => { const key = hex + ':' + k; let v = CC.get(key); if (!v) { _c.setHex(hex); v = [_c.r * k, _c.g * k, _c.b * k]; CC.set(key, v); } return v; };
class Acc { constructor() { this.parts = {}; this.fixed = []; this.s = {}; for (const k of SLOTS) this.s[k] = { p: [], n: [], uv: [], c: [], si: [], sw: [], t: [], idx: [] }; } }
const _v = new THREE.Vector3(), _n3 = new THREE.Matrix3();
function pushV(S, x, y, z, nx, ny, nz, u, v, c, b, tint) {
  S.p.push(x, y, z); S.n.push(nx, ny, nz); S.uv.push(u, v); S.c.push(c[0], c[1], c[2]); S.t.push(tint);
  if (typeof b === 'number') { S.si.push(b, 0, 0, 0); S.sw.push(1, 0, 0, 0); } else { S.si.push(b[0], b[1], 0, 0); S.sw.push(1 - b[2], b[2], 0, 0); }
}
// A sheet of nr x (nc + 1) vertices from fn(i, j, f, out), closed round its columns unless o.open. Normals are smoothed
// (seam and poles welded) and turned to face away from the sheet's centre, so callers never think about winding.
function grid(A, slot, nr, nc, fn, o = {}) {
  const S = A.s[slot], open = !!o.open, cols = nc + 1, nv = nr * cols, P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), V = new Array(nv), out = {};
  for (let i = 0; i < nr; i++) for (let j = 0; j < cols; j++) {
    out.u = 0; out.v = 0; out.b = o.b ?? 0; out.c = o.c || WHITE;
    fn(i, open ? j : j % nc, j / nc, out);
    const k = i * cols + j; P[k * 3] = out.x; P[k * 3 + 1] = out.y; P[k * 3 + 2] = out.z; V[k] = [out.u, out.v, out.b, out.c];
  }
  const idx = [];
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc; j++) { const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1; idx.push(a, c, b, b, c, d); }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  const weld = (list) => { let x = 0, y = 0, z = 0; for (const k of list) { x += N[k * 3]; y += N[k * 3 + 1]; z += N[k * 3 + 2]; } for (const k of list) { N[k * 3] = x; N[k * 3 + 1] = y; N[k * 3 + 2] = z; } };
  for (let i = 0; i < nr; i++) {
    const k0 = i * cols, k1 = k0 + 1, km = k0 + (nc >> 1);
    const same = (a, b) => Math.abs(P[a * 3] - P[b * 3]) + Math.abs(P[a * 3 + 1] - P[b * 3 + 1]) + Math.abs(P[a * 3 + 2] - P[b * 3 + 2]) < 1e-6;
    if (same(k0, k1) && same(k0, km)) { const l = []; for (let j = 0; j < cols; j++) l.push(k0 + j); weld(l); } else if (!open) weld([k0, k0 + nc]);
  }
  let cx = 0, cy = 0, cz = 0;
  if (o.center) { cx = o.center[0]; cy = o.center[1]; cz = o.center[2]; } else { for (let k = 0; k < nv; k++) { cx += P[k * 3]; cy += P[k * 3 + 1]; cz += P[k * 3 + 2]; } cx /= nv; cy /= nv; cz /= nv; }
  let dot = 0; for (let k = 0; k < nv; k++) dot += N[k * 3] * (P[k * 3] - cx) + N[k * 3 + 1] * (P[k * 3 + 1] - cy) + N[k * 3 + 2] * (P[k * 3 + 2] - cz);
  const flip = dot < 0 !== !!o.flip, sg = flip ? -1 : 1, base = S.p.length / 3, m = o.m;
  if (m) _n3.getNormalMatrix(m);
  for (let k = 0; k < nv; k++) {
    let x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2], nx = N[k * 3] * sg, ny = N[k * 3 + 1] * sg, nz = N[k * 3 + 2] * sg;
    if (m) { _v.set(x, y, z).applyMatrix4(m); x = _v.x; y = _v.y; z = _v.z; _v.set(nx, ny, nz).applyMatrix3(_n3); nx = _v.x; ny = _v.y; nz = _v.z; }
    const l = Math.hypot(nx, ny, nz) || 1, q = V[k];
    pushV(S, x, y, z, nx / l, ny / l, nz / l, o.uv ? o.uv[0] : q[0], o.uv ? o.uv[1] : q[1], q[3], q[2], o.tint || 0);
  }
  for (let t = 0; t < idx.length; t += 3) { if (flip) S.idx.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]); else S.idx.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]); }
}
// A tube of rings stacked along Y. ring: { y, x, z (centre), rx (half width), rz | rf + rb (half depth: front, back), n (2 = round,
// bigger = boxier), b (bone or [boneA, boneB, t]), c (colour) }. Ends are closed unless cap0 / cap1 are false.
function tube(A, slot, rings, o = {}) {
  const R = rings.slice(), seg = o.seg || 10, a0 = o.a0 ?? PI / 2;
  if (o.cap0 !== false) R.unshift({ ...R[0], rx: 0, rz: 0, rf: 0, rb: 0 });
  if (o.cap1 !== false) R.push({ ...R[R.length - 1], rx: 0, rz: 0, rf: 0, rb: 0 });
  const vv = [0]; let circ = 0.05;
  for (let i = 0; i < R.length; i++) {
    const r = R[i]; circ = Math.max(circ, PI * (r.rx + ((r.rf ?? r.rz ?? r.rx) + (r.rb ?? r.rz ?? r.rx)) / 2));
    if (i) { const q = R[i - 1]; vv.push(vv[i - 1] + Math.hypot(r.y - q.y, (r.x || 0) - (q.x || 0), (r.z || 0) - (q.z || 0)) + Math.abs(r.rx - q.rx) * 0.7); }
  }
  const ur = Math.max(1, Math.round(circ / (o.us || 0.5))), vs = ur / circ;
  grid(A, slot, R.length, seg, (i, j, f, out) => {
    const r = R[i], a = a0 + f * 2 * PI, cs = Math.cos(a), sn = Math.sin(a), e = 2 / (r.n || o.n || 2);
    const ex = Math.sign(cs) * Math.pow(Math.abs(cs), e), ez = Math.sign(sn) * Math.pow(Math.abs(sn), e);
    out.x = (r.x || 0) + ex * r.rx; out.y = r.y; out.z = (r.z || 0) + ez * (ez < 0 ? r.rf ?? r.rz ?? r.rx : r.rb ?? r.rz ?? r.rx);
    out.u = f * ur; out.v = vv[i] * vs; if (r.b !== undefined) out.b = r.b; if (r.c) out.c = r.c;
  }, o);
}
// Part of an ellipsoid round centre c with radii r: rows from the top pole down to o.p1 (radians) or to the height o.rim(theta).
// theta = 0 is the front (-Z). o.lip adds a turned-in edge so an open shell (a helmet) looks thick. o.f(dx, dy, dz, out) reshapes.
function shell(A, slot, c, r, o = {}) {
  const nr = o.rows || 8, nc = o.seg || 12, p0 = o.p0 || 0, p1 = o.p1 ?? PI, part = o.th0 !== undefined, th0 = o.th0 ?? -PI, th1 = o.th1 ?? PI, lip = o.lip ? 1 : 0;
  grid(A, slot, nr + lip, nc, (i, j, f, out) => {
    const th = th0 + (th1 - th0) * f, pe = o.rim ? Math.acos(clamp((o.rim(th) - c[1]) / r[1], -1, 1)) : p1; let ph, k = 1, dy = 0;
    if (i >= nr) { ph = pe; k = o.lip; dy = -0.005; } else ph = p0 + (pe - p0) * (i / (nr - 1));
    const sp = Math.sin(ph), dx = sp * Math.sin(th), dyv = Math.cos(ph), dz = -sp * Math.cos(th);
    out.x = c[0] + dx * r[0] * k; out.y = c[1] + dyv * r[1] + dy; out.z = c[2] + dz * r[2] * k; out.u = f * (o.ur || 1); out.v = (1 - ph / PI) * (o.vr || 1);
    if (o.f) o.f(dx, dyv, dz, out, th, ph);
  }, { ...o, open: part });
}
// any ready-made geometry, rigid on one bone
function addGeo(A, slot, g, m, bone, col, tint = 0) {
  const S = A.s[slot], pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, base = S.p.length / 3;
  _n3.getNormalMatrix(m);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(m); const x = _v.x, y = _v.y, z = _v.z; _v.fromBufferAttribute(nor, i).applyMatrix3(_n3).normalize();
    pushV(S, x, y, z, _v.x, _v.y, _v.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, col, bone, tint);
  }
  if (g.index) for (let i = 0; i < g.index.count; i++) S.idx.push(base + g.index.getX(i)); else for (let i = 0; i < pos.count; i++) S.idx.push(base + i);
  g.dispose();
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s1 = new THREE.Vector3(1, 1, 1);
const TM = (x, y, z, rx = 0, ry = 0, rz = 0, sc = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e.set(rx, ry, rz)), typeof sc === 'number' ? new THREE.Vector3(sc, sc, sc) : new THREE.Vector3(...sc));
// soft-edged box (sx, sy, sz) centred on the transform m
function rbox(A, slot, sx, sy, sz, m, o = {}) { tube(A, slot, [{ y: -sy / 2, rx: sx / 2, rz: sz / 2 }, { y: sy / 2, rx: sx / 2, rz: sz / 2 }], { n: 7, seg: 12, a0: 0, ...o, m }); }
function finish(A, skinned, oneGroup) {
  const g = new THREE.BufferGeometry(), used = SLOTS.filter((k) => A.s[k].idx.length), p = [], n = [], uv = [], c = [], si = [], sw = [], t = [], idx = []; let base = 0, start = 0;
  for (const k of used) {
    const S = A.s[k]; for (const [a, b] of [[p, S.p], [n, S.n], [uv, S.uv], [c, S.c], [si, S.si], [sw, S.sw], [t, S.t]]) for (let i = 0; i < b.length; i++) a.push(b[i]);
    for (let i = 0; i < S.idx.length; i++) idx.push(S.idx[i] + base);
    if (!oneGroup) g.addGroup(start, S.idx.length, used.indexOf(k)); start += S.idx.length; base += S.p.length / 3;
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setAttribute('tint', new THREE.Float32BufferAttribute(t, 1));
  if (skinned) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); }
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.4); g.boundingBox = new THREE.Box3(new THREE.Vector3(-1.6, -1.3, -1.6), new THREE.Vector3(1.6, 2.6, 1.6));
  return { geo: g, slots: used, tris: idx.length / 3 };
}

/* ------------------------------------------------------------------- body */
const HC = [0, 1.685, 0], CHIN = 1.567, HEADH = 0.233;
function headShape(dx, dy, dz, out) {
  let rx = 0.081, rz = dz < 0 ? 0.099 : 0.098; const ry = dy > 0 ? 0.113 : 0.118;
  if (dy < 0) { const t = Math.pow(-dy, 1.25); rx *= 1 - 0.25 * t; rz *= dz > 0 ? 1 - 0.42 * t : 1 - 0.13 * t; }
  const x = dx * rx, y = dy * ry; let z = dz * rz;
  if (dz < 0) {
    const g = (v, s) => Math.exp(-(v * v) / (2 * s * s)), fz = -dz;
    for (const s of [-1, 1]) z += 0.0075 * g(x - s * 0.0305, 0.014) * g(y - 0.013, 0.0095) * fz; // eye sockets
    z -= 0.0045 * g(y - 0.033, 0.009) * g(x, 0.045) * fz; // brow
    z -= 0.0045 * g(y + 0.058, 0.013) * g(x, 0.028) * fz; // mouth
    z -= 0.006 * g(y + 0.102, 0.015) * g(x, 0.028) * fz; // chin
    for (const s of [-1, 1]) z -= 0.003 * g(x - s * 0.05, 0.016) * g(y + 0.012, 0.016) * fz; // cheekbones
  }
  out.x = HC[0] + x; out.y = HC[1] + y; out.z = HC[2] + z; out.v = (out.y - CHIN) / HEADH;
}
const R = (y, rx, rz, b, o) => ({ y, rx, rz, b, ...o });
let TORSO = [ // y, half width, front, back (replaced by the measured body once the people assets are in: see fitTorso)
  [0.885, 0.15, 0.105, 0.115], [0.95, 0.172, 0.112, 0.125], [1.01, 0.166, 0.112, 0.116], [1.07, 0.152, 0.108, 0.1], [1.14, 0.15, 0.11, 0.1], [1.21, 0.158, 0.118, 0.106],
  [1.29, 0.168, 0.128, 0.114], [1.365, 0.174, 0.126, 0.116], [1.43, 0.172, 0.11, 0.108], [1.462, 0.155, 0.098, 0.1], [1.492, 0.112, 0.084, 0.092], [1.518, 0.08, 0.074, 0.082], [1.54, 0.068, 0.065, 0.072],
];
function torsoAt(y) { // [rx, rf, rb] of the bare torso at a height
  const T = TORSO; if (y <= T[0][0]) return T[0].slice(1); for (let i = 1; i < T.length; i++) if (y <= T[i][0]) { const a = T[i - 1], b = T[i], t = (y - a[0]) / (b[0] - a[0]); return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]; } return T[T.length - 1].slice(1);
}
const torsoBone = (y) => (y < 0.98 ? HIPS : y < 1.04 ? [HIPS, SPINE, (y - 0.98) / 0.06] : y < 1.17 ? SPINE : y < 1.25 ? [SPINE, CHEST, (y - 1.17) / 0.08] : y < 1.51 ? CHEST : [CHEST, NECK, 0.4]);
// distance of the torso surface from the body's axis at height y and sideways offset x (front or back)
const surfZ = (y, x, back) => { const t = torsoAt(y); return (back ? t[2] : t[1]) * Math.pow(Math.max(0.02, 1 - Math.pow(Math.min(0.98, Math.abs(x) / t[0]), 2.3)), 1 / 2.3); };
// a band or shell wrapped round the torso between two heights, standing off it by (dx, df, db)
function wrap(A, slot, ys, grow, o) { tube(A, slot, ys.map((y) => { const t = torsoAt(y), g = typeof grow === 'function' ? grow(y) : grow; return { y, rx: t[0] + g[0], rf: t[1] + g[1], rb: t[2] + g[2], b: torsoBone(y) }; }), o); }

/* ---------------------------------------------------- the MakeHuman base (js/units/v2/people.js) */
let TORSO_FIT = false;
function fitTorso() { // the gear code wraps things round the torso by this table: measure it from the real shirt
  if (TORSO_FIT || !people.ready) return; TORSO_FIT = true;
  const o = 0.011, T = people.meta.torso.map((r) => [r[0], r[1] + o, r[2] + o, r[3] + o]), top = T[T.length - 1];
  TORSO = T.concat([[1.518, 0.085, 0.074 - people.meta.head_dz * 0.3, 0.084], [1.54, 0.07, 0.066 - people.meta.head_dz * 0.4, 0.074]]);
}
const isArm = (b) => b >= ARM_R && b < LEG_R;
const _o = { x: 0, y: 0, z: 0 };
// Adds a part of the human base to a slot. o: { c: colour, tint, shape(x, y, z, nx, ny, nz, bone, out): moves a vertex (cloth
// offset and folds; normals are rebuilt), keep(bone): only triangles on these bones, uvk: UV scale, flag: copy the scalp flag into
// the tint attribute (crowd figures colour hair by it), off: plain offset along the normal }
function addPart(A, slot, name, lod, o = {}) {
  const P = people.part(name, lod); if (!P) return;
  const S = A.s[slot], base = S.p.length / 3, n = P.nv, pos = P.pos, nrm = P.nrm, bw = P.bw, weld = P.weld, idx = P.idx, col = o.c || WHITE, tint = o.tint || 0, uvk = o.uvk || 1;
  let X = pos, N = null;
  if (o.shape || o.off) {
    X = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], nx = nrm[i * 4] / 127, ny = nrm[i * 4 + 1] / 127, nz = nrm[i * 4 + 2] / 127;
      if (o.shape) { o.shape(x, y, z, nx, ny, nz, bw[i * 4], _o); X[i * 3] = _o.x; X[i * 3 + 1] = _o.y; X[i * 3 + 2] = _o.z; } else { X[i * 3] = x + nx * o.off; X[i * 3 + 1] = y + ny * o.off; X[i * 3 + 2] = z + nz * o.off; }
    }
    if (o.shape) { // smooth normals of the moved surface, shared across UV seams
      let wn = 0; for (let i = 0; i < n; i++) if (weld[i] > wn) wn = weld[i];
      const acc = new Float32Array((wn + 1) * 3);
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3, ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        for (let k = 0; k < 3; k++) { const w = weld[idx[t + k]] * 3; acc[w] += fx; acc[w + 1] += fy; acc[w + 2] += fz; }
      }
      N = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const w = weld[i] * 3, l = Math.hypot(acc[w], acc[w + 1], acc[w + 2]) || 1; N[i * 3] = acc[w] / l; N[i * 3 + 1] = acc[w + 1] / l; N[i * 3 + 2] = acc[w + 2] / l; }
    }
  }
  const ux = P.uvs[0] / 65535, uy = P.uvs[1] / 65535, u0 = P.uv0[0], v0 = P.uv0[1], uv = P.uv;
  let seam = null;
  if (o.seams) { if (!P.seam) { let wn = 0; for (let i = 0; i < n; i++) if (weld[i] > wn) wn = weld[i]; const cnt = new Uint8Array(wn + 1); for (let i = 0; i < n; i++) if (cnt[weld[i]] < 3) cnt[weld[i]]++; P.seam = new Uint8Array(n); for (let i = 0; i < n; i++) P.seam[i] = cnt[weld[i]] > 1 ? 1 : 0; } seam = P.seam; }
  for (let i = 0; i < n; i++) {
    if (seam && seam[i]) { S.p.push(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]); if (N) S.n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); else S.n.push(nrm[i * 4] / 127, nrm[i * 4 + 1] / 127, nrm[i * 4 + 2] / 127);
      S.uv.push((u0 + uv[i * 2] * ux) * uvk, (v0 + uv[i * 2 + 1] * uy) * uvk); S.c.push(col[0] * o.seams, col[1] * o.seams, col[2] * o.seams); S.t.push(tint);
      const t = bw[i * 4 + 2] / 255; S.si.push(bw[i * 4], bw[i * 4 + 1], 0, 0); S.sw.push(1 - t, t, 0, 0); continue; }
    S.p.push(X[i * 3], X[i * 3 + 1], X[i * 3 + 2]);
    if (N) S.n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); else S.n.push(nrm[i * 4] / 127, nrm[i * 4 + 1] / 127, nrm[i * 4 + 2] / 127);
    S.uv.push((u0 + uv[i * 2] * ux) * uvk, (v0 + uv[i * 2 + 1] * uy) * uvk); S.c.push(col[0], col[1], col[2]); S.t.push(o.flag ? bw[i * 4 + 3] / 255 : tint);
    const t = bw[i * 4 + 2] / 255; S.si.push(bw[i * 4], bw[i * 4 + 1], 0, 0); S.sw.push(1 - t, t, 0, 0);
  }
  const keep = o.keep;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (keep && !(keep(bw[a * 4]) && keep(bw[b * 4]) && keep(bw[c * 4]))) continue;
    S.idx.push(base + a, base + b, base + c);
  }
  A.parts[slot] = S.p.length / 3; // everything in this slot up to here is the base, not gear
}
// Cloth is the body's surface pushed out and creased. U.fit = { off: how far it stands off the body, fold: how deep the folds }.
function clothShape(kind, U, lod) {
  const F = U.fit || {}, off = F.off ?? 0.012, fk = (F.fold ?? 1) * (lod >= 2 ? 0 : lod === 1 ? 0.5 : 1), g = (v, s) => Math.exp(-(v * v) / (s * s));
  return (x, y, z, nx, ny, nz, b, o) => {
    let d = off, a = 0, r = 0.3;
    if (kind === 'shirt') {
      if (isArm(b)) { // sleeve: loose at the elbow, gathered into the cuff
        d = off * 1.1 + 0.004 * sm((1.32 - y) / 0.3); if (y < 0.965) d = lerp(off * 0.5, d, sm((y - 0.9) / 0.065));
        a = 0.0045 + 0.009 * g(y - 1.125, 0.085) + 0.005 * g(y - 0.97, 0.05) + 0.005 * g(y - 1.38, 0.06);
        if (fk) r = ridges(x * 10, y * 24 + x * 4, z * 10);
      } else {
        const pit = g(y - 1.37, 0.07) * sm((Math.abs(x) - 0.09) / 0.06);
        d = off + 0.0105 * sm((1.03 - y) / 0.1); // the blouse stands off the hips
        if (U.tuck && y < 1.05) { d = lerp(0.0015, off, sm((y - 1.0) / 0.05)); o.x = x + nx * d; o.y = y + ny * d; o.z = z + nz * d; return; } // tucked into the trousers
        a = 0.003 + 0.0085 * g(y - 1.07, 0.075) + 0.007 * pit + 0.004 * g(y - 0.93, 0.03);
        if (fk) r = ridges(x * 6 + (pit > 0.2 ? y * 12 * Math.sign(x) : 0), y * 24, z * 6);
      }
    } else {
      const kn = g(y - 0.5, 0.1), cr = g(y - 0.85, 0.08) * sm((0.14 - Math.abs(x)) / 0.1), bl = g(y - 0.34, 0.045);
      d = off * 1.35 + 0.009 * bl + 0.004 * g(y - 0.7, 0.12) * sm(Math.abs(x) - 0.1 > 0 ? 1 : 0); // bloused over the boot, cargo fullness at the thigh
      if (y < 0.315) d = lerp(-0.007, d, sm((y - 0.285) / 0.03)); // tucked into the boot
      if (y > 1.0) d = lerp(d, off * 0.55, sm((y - 1.0) / 0.05)); // waistband
      a = (0.004 + 0.009 * kn * (z > 0.01 ? 1 : 0.55) + 0.008 * cr + 0.007 * bl) * sm((y - 0.295) / 0.035);
      if (fk) r = ridges(x * 8 + (cr > 0.25 ? y * 16 * Math.sign(x || 1) : 0), y * 24 + (bl > 0.3 ? x * 30 : 0), z * 8);
    }
    const dd = d + a * fk * (r - 0.3);
    o.x = x + nx * dd; o.y = y + ny * dd; o.z = z + nz * dd;
  };
}
// A combat boot built on the measured foot: heeled sole with lugs, toe cap, laced front, padded collar.
function boot(A, s, U, L, keep) {
  const lb = legBase(s), LL = lb + 1, FT = lb + 2, lx = 0.092 * s + 0.004 * s, bc = C(U.boot), sc = C(U.sole), hi = L <= 0, seg = hi ? 16 : L === 1 ? 9 : 6, G = 'gear';
  const fm = TM(lx, 0, 0, -PI / 2, 0, 0); // a tube laid along the ground: its length runs toward the toe, its depth is height
  // sole: heel block, a raised arch, forefoot, toe spring. [z, half width, bottom, top]
  const SOL = [[0.086, 0.024, 0.0, 0.03], [0.074, 0.038, 0.0, 0.032], [0.03, 0.041, 0.0, 0.032], [0.012, 0.04, 0.0, 0.03], [0.004, 0.039, 0.012, 0.03], [-0.045, 0.04, 0.013, 0.028], [-0.062, 0.045, 0.0, 0.026], [-0.12, 0.052, 0.0, 0.024], [-0.175, 0.05, 0.002, 0.024], [-0.212, 0.042, 0.007, 0.026], [-0.232, 0.026, 0.012, 0.028]];
  tube(A, G, keep(SOL.map((r, i) => ({ y: -r[0], z: (r[2] + r[3]) / 2, rx: r[1] + 0.004, rz: (r[3] - r[2]) / 2, b: FT, e: i % 3 === 0 }))), { seg: L >= 2 ? 6 : 10, n: 6, c: sc, m: fm, a0: PI / 4 });
  // upper over the foot: [z, half width, top]
  const UP = [[0.078, 0.027, 0.105], [0.066, 0.036, 0.135], [0.03, 0.041, 0.15], [-0.01, 0.043, 0.15], [-0.05, 0.045, 0.128], [-0.09, 0.048, 0.1], [-0.13, 0.05, 0.082], [-0.17, 0.049, 0.072], [-0.2, 0.043, 0.064], [-0.221, 0.03, 0.05]];
  tube(A, G, keep(UP.map((r, i) => ({ y: -r[0], z: 0.05, rx: r[1], rb: r[2] - 0.05, rf: 0.026, b: FT, e: i % 2 === 0 }))), { seg, n: 2.6, c: bc, m: fm });
  // shaft with a padded collar
  const SH = [[0.115, 0.043, 0.05, 0.05, LL, FT, 0.75], [0.15, 0.042, 0.047, 0.05, LL, FT, 0.35], [0.19, 0.044, 0.046, 0.053, LL], [0.24, 0.05, 0.048, 0.06, LL], [0.282, 0.054, 0.05, 0.064, LL], [0.292, 0.057, 0.053, 0.067, LL], [0.3, 0.054, 0.05, 0.064, LL]];
  tube(A, G, keep(SH.map((r, i) => ({ y: r[0], x: lx + 0.002 * s, z: 0.012, rx: r[1], rf: r[2], rb: r[3], b: r[5] !== undefined ? [r[4], r[5], r[6]] : r[4], e: i % 2 === 0 }))), { seg, n: 2.3, c: bc, cap0: false, cap1: false });
  if (L > 1) return;
  // heel counter and toe cap: a second layer of leather
  tube(A, G, [[0.082, 0.026, 0.085], [0.07, 0.038, 0.1], [0.04, 0.043, 0.094], [0.02, 0.0435, 0.07]].map((r) => ({ y: -r[0], z: 0.05, rx: r[1] + 0.0015, rb: r[2] - 0.05, rf: 0.024, b: FT })), { seg, n: 2.6, c: C(U.boot, 0.82), m: fm });
  tube(A, G, [[-0.158, 0.051, 0.078], [-0.18, 0.0495, 0.071], [-0.203, 0.0435, 0.064], [-0.2235, 0.0305, 0.051]].map((r) => ({ y: -r[0], z: 0.05, rx: r[1] + 0.0012, rb: r[2] - 0.05 + 0.0012, rf: 0.024, b: FT })), { seg, n: 2.6, c: C(U.boot, 0.85), m: fm, cap0: false });
  if (!hi) return;
  // tongue, eyelets and laces: up the instep, then up the front of the shaft
  const LP = []; // [y, z, slope] along the lacing line
  for (let k = 0; k < 4; k++) { const t = k / 3; LP.push([lerp(0.094, 0.143, t), lerp(-0.118, -0.05, t), -0.62, FT]); }
  for (let k = 0; k < 5; k++) { const t = k / 4; LP.push([lerp(0.172, 0.276, t), lerp(-0.037, -0.04, t), -0.03, LL]); }
  const lc = C(0x2c2a26), ec = C(0x0c0c0c);
  for (let k = 0; k < LP.length; k++) {
    const [y, z, sl, bn] = LP[k], w = k < 4 ? 0.02 : 0.021;
    for (const q of [-1, 1]) {
      rbox(A, G, w * 2.25, 0.0036, 0.0036, TM(lx, y, z - 0.002, sl, 0, q * 0.52), { b: bn, c: lc, seg: 4, n: 3 });
      addGeo(A, G, new THREE.CylinderGeometry(0.0034, 0.0034, 0.003, 6), TM(lx + q * w, y + 0.006 * (k < 4 ? 0.5 : 1), z - 0.0005 + (k < 4 ? 0.004 : 0), PI / 2 + sl, 0, 0), bn, ec);
    }
  }
  rbox(A, G, 0.03, 0.012, 0.012, TM(lx, 0.29, -0.047), { b: LL, c: lc, seg: 6, n: 2.2 }); // the knot
  rbox(A, G, 0.012, 0.03, 0.004, TM(lx, 0.298, 0.079, 0.2), { b: LL, c: C(U.boot, 0.7), seg: 4, n: 4 }); // pull loop
  // lugs along the edge of the sole
  for (let k = 0; k < 7; k++) for (const q of [-1, 1]) { const z = -0.07 - k * 0.022, w = 0.05 - Math.max(0, k - 4) * 0.004; rbox(A, G, 0.008, 0.011, 0.012, TM(lx + q * (w + 0.0015), 0.0065, z), { b: FT, c: sc, seg: 4, n: 4 }); }
  for (let k = 0; k < 3; k++) for (const q of [-1, 1]) rbox(A, G, 0.008, 0.012, 0.013, TM(lx + q * 0.0425, 0.007, 0.025 + k * 0.021), { b: FT, c: sc, seg: 4, n: 4 });
}

function neckTuck(x, y, z, nx, ny, nz, b, o) {
  const d = (y - 1.526) * 0.9317 + z * -0.3634; // height above the collar line (it is lower in front)
  if (d < 0.006) { const k = 1 - 0.3 * sm((0.006 - d) / 0.02); o.x = x * k; o.z = -0.008 + (z + 0.008) * k; o.y = y - 0.012 * (1 - k) / 0.3; } else { o.x = x; o.y = y; o.z = z; }
}
// a flat strap along a line of points (model space); its face looks away from o.from
function ribbon(A, slot, pts, w, th, o = {}) {
  const n = pts.length, cen = o.from || [0, 1.69, -0.01], CS = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
  grid(A, slot, n, 4, (i, j, f, out) => {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let nx = p[0] - cen[0], ny = p[1] - cen[1], nz = p[2] - cen[2]; const d = nx * tx + ny * ty + nz * tz; nx -= d * tx; ny -= d * ty; nz -= d * tz; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const sx = ty * nz - tz * ny, sy = tz * nx - tx * nz, sz = tx * ny - ty * nx, hw = (w / 2) * CS[j][0], ht = th * CS[j][1];
    out.x = p[0] + sx * hw + nx * ht; out.y = p[1] + sy * hw + ny * ht; out.z = p[2] + sz * hw + nz * ht; out.u = f * 0.2; out.v = i * 0.1;
  }, o);
}
// gear built for the old head is moved onto the new one; ranges listed in A.fixed were made for the new head already
const HEAD_Z0 = -0.0125, HEAD_ZK = 1.07;
const mark = (A) => SLOTS.map((k) => A.s[k].p.length / 3);
const fixed = (A, m) => SLOTS.forEach((k, i) => { const e = A.s[k].p.length / 3; if (e > m[i]) A.fixed.push([k, m[i], e]); });
function headFix(A, far) {
  if (far) for (const k of ['cloth', 'gear', 'glass']) { // the far model's head is coarse: give its headgear a little room
    const S = A.s[k], n = S.p.length / 3;
    for (let i = A.parts[k] && k === 'cloth' ? A.parts[k] : 0; i < n; i++) if (S.si[i * 4] === HEAD && S.sw[i * 4] > 0.9) { S.p[i * 3] *= 1.07; S.p[i * 3 + 1] = 1.7 + (S.p[i * 3 + 1] - 1.7) * 1.07; }
  }
  for (const k of ['cloth', 'gear', 'glass']) {
    const S = A.s[k], n = S.p.length / 3, skip = A.fixed.filter((f) => f[0] === k);
    for (let i = A.parts[k] && k === 'cloth' ? A.parts[k] : 0; i < n; i++) {
      const w = (S.si[i * 4] === HEAD ? S.sw[i * 4] : 0) + (S.si[i * 4 + 1] === HEAD ? S.sw[i * 4 + 1] : 0); if (w <= 0) continue;
      if (skip.some((f) => i >= f[1] && i < f[2])) continue;
      const z = S.p[i * 3 + 2]; S.p[i * 3 + 2] = z + w * (HEAD_Z0 + z * HEAD_ZK * (far ? 1.06 : 1) - z);
    }
  }
}
// The combat helmet: sits down over the forehead and round the top of the ears, deeper at the nape; cover band, shroud for
// night vision, side rails, a four-point chin strap. slot / col: 'cloth' + white for a camouflage cover, 'gear' + colour for paint.
function combatHelmet(A, slot, col, L, tint = 0) {
  const m0 = mark(A), hi = L <= 0, rows = L <= 0 ? 10 : L === 1 ? 6 : 3, seg = L <= 0 ? 24 : L === 1 ? 14 : 8, c = [0, 1.702, -0.012], r = [0.1075, 0.126, 0.133];
  const rim = (th) => { const a = Math.abs(th); return a < 0.7 ? 1.728 : a < 1.2 ? lerp(1.728, 1.668, sm((a - 0.7) / 0.5)) : a < 2.2 ? lerp(1.668, 1.652, sm((a - 1.2) / 1.0)) : lerp(1.652, 1.642, sm((a - 2.2) / 0.94)); };
  const flare = (y) => 1 + 0.04 * sm((1.735 - y) / 0.09);
  const shape = (dx, dy, dz, out) => { const fl = flare(out.y); out.x = c[0] + (out.x - c[0]) * fl; out.z = c[2] + (out.z - c[2]) * fl; };
  shell(A, slot, c, r, { rows, seg, rim, lip: 0.88, b: HEAD, c: col, ur: 1.4, vr: 0.62, f: shape, tint });
  const at = (th, y, k = 1) => { const dy = clamp((y - c[1]) / r[1], -1, 1), sp = Math.sqrt(1 - dy * dy) * flare(y) * k; return [c[0] + Math.sin(th) * r[0] * sp, y, c[2] - Math.cos(th) * r[2] * sp]; };
  if (L <= 1) {
    const dk = C(0x1a1b1c), trimC = C(0x2b2d2e), bandSeg = hi ? 36 : 14;
    // rubber edge trim and the cover's elastic band
    grid(A, 'gear', 2, bandSeg, (i, j, f, out) => { const th = -PI + 2 * PI * f, p = at(th, rim(th) + (i ? 0.0055 : -0.0025), 1.008); out.x = p[0]; out.y = p[1]; out.z = p[2]; }, { b: HEAD, c: trimC, center: c });
    grid(A, slot, 2, bandSeg, (i, j, f, out) => { const th = -PI + 2 * PI * f, p = at(th, 1.752 + (i ? 0.02 : 0) - 0.004 * Math.cos(th), 1.01); out.x = p[0]; out.y = p[1]; out.z = p[2]; out.u = f * 1.4; out.v = i * 0.05; }, { b: HEAD, c: slot === 'cloth' ? C(0xffffff, 0.72) : col.map((v) => v * 0.72), center: c, tint });
    const sh = at(0, 1.776), sl = -0.5; rbox(A, 'gear', 0.052, 0.046, 0.012, TM(0, sh[1], sh[2] - 0.004, sl), { b: HEAD, c: dk, seg: 8, n: 5 }); // shroud
    for (const s of [-1, 1]) { const p = at(s * PI / 2, 1.708); rbox(A, 'gear', 0.007, 0.022, 0.1, TM(p[0] + s * 0.002, p[1], p[2] + 0.004, 0, 0, 0), { b: HEAD, c: dk, seg: 6, n: 5 }); }
    if (hi) {
      rbox(A, 'gear', 0.03, 0.024, 0.006, TM(0, sh[1] + 0.001, sh[2] - 0.011, sl), { b: HEAD, c: C(0x0c0c0d), seg: 6, n: 5 });
      for (const s of [-1, 1]) { const p = at(PI + s * 0.35, 1.762, 1.012); rbox(A, 'gear', 0.03, 0.016, 0.003, TM(p[0], p[1], p[2], 0.2, -s * 0.35, 0), { b: HEAD, c: C(0xb9bdb4), seg: 4, n: 5 }); } // reflective tabs on the band
    }
    // chin strap: from the rim in front of and behind each ear to a junction on the jaw, then under the chin
    const st = C(0x3b3a33);
    for (const s of [-1, 1]) {
      const fa = at(s * 0.95, rim(s * 0.95) + 0.006, 0.93), ba = at(s * 2.05, rim(s * 2.05) + 0.006, 0.93), J = [s * 0.0705, 1.618, -0.034];
      ribbon(A, 'gear', [fa, [s * 0.082, 1.65, -0.052], J, [s * 0.058, 1.588, -0.058], [s * 0.036, 1.571, -0.082], [s * 0.012, 1.5655, -0.094], [0, 1.565, -0.096]], 0.0135, 0.0022, { b: HEAD, c: st, from: [0, 1.66, -0.03] });
      ribbon(A, 'gear', [ba, [s * 0.084, 1.636, 0.004], J], 0.0135, 0.0022, { b: HEAD, c: st, from: [0, 1.66, -0.02] });
      if (hi) rbox(A, 'gear', 0.006, 0.02, 0.022, TM(J[0] + s * 0.004, J[1], J[2], 0.5, 0, 0), { b: HEAD, c: C(0x101010), seg: 4, n: 5 }); // buckle
    }
    if (hi) shell(A, 'gear', [0, 1.5655, -0.092], [0.03, 0.006, 0.02], { rows: 4, seg: 8, b: HEAD, c: C(0x1c1b18) }); // chin pad
  }
  fixed(A, m0);
}
// how high the shirt's shoulder is at a point (for straps that lie on it)
const SHOULDER = new Map();
function shoulderY(x, z) {
  const key = Math.round(x * 500) + ':' + Math.round(z * 500); let y = SHOULDER.get(key); if (y !== undefined) return y;
  const P = people.part('shirt', 0), p = P.pos; y = 1.4;
  for (let i = 0; i < P.nv; i++) if (P.bw[i * 4] < 5 && Math.abs(p[i * 3] - x) < 0.014 && Math.abs(p[i * 3 + 2] - z) < 0.014 && p[i * 3 + 1] > y) y = p[i * 3 + 1];
  SHOULDER.set(key, y); return y;
}
// Plate carrier (marines) or flak vest (gun crews): real thickness, plates with cut corners, cummerbund, webbing rows, straps
// over the shoulders, buckles, pouches.
function vest(A, U, V, vc, L, tseg, hi, keep) {
  const G = 'gear', zf = (y) => torsoAt(y)[1], zb = (y) => torsoAt(y)[2], dk = C(U.vestCol, 0.74), pc = C(U.pouchCol ?? U.vestCol), blk = C(0x141516), off = U.fit && U.fit.off ? U.fit.off - 0.012 : 0;
  if (V === 'flak') { // a soft vest wrapped right round, front opening, collar yoke
    wrap(A, G, [1.105, 1.13, 1.2, 1.29, 1.36, 1.415, 1.452], (y) => (y < 1.12 || y > 1.44 ? [0.008, 0.01, 0.01] : [0.02, 0.026, 0.024]), { seg: tseg, n: 2.6, c: vc });
    if (L <= 1) {
      for (const s of [-1, 1]) { const pts = [[s * 0.09, 1.445, -(zf(1.44) + 0.02)]]; for (const z of [-0.065, -0.03, 0.005, 0.04, 0.07]) pts.push([s * 0.1, shoulderY(s * 0.1, z) + 0.016, z]); pts.push([s * 0.09, 1.445, zb(1.44) + 0.02]); ribbon(A, G, pts, 0.085, 0.016, { b: CHEST, c: vc, from: [s * 0.1, 1.36, 0] }); }
      tube(A, G, [1.12, 1.2, 1.3, 1.4, 1.445].map((y) => ({ y, x: 0, z: -(zf(y) + 0.028), rx: 0.016, rz: 0.004, b: torsoBone(y) })), { seg: 6, n: 4, c: dk, a0: PI / 4 }); // front flap edge
      if (hi) for (const y of [1.17, 1.3]) for (const s of [-1, 1]) rbox(A, G, 0.07, 0.085, 0.02, TM(s * 0.075, y, -(zf(y) + 0.032)), { b: torsoBone(y), c: dk, seg: 8, n: 5 }); // flat pockets
    }
    return;
  }
  // plate bags: front and back
  for (const back of [false, true]) {
    const ys = [1.112, 1.124, 1.19, 1.27, 1.345, 1.395, 1.432, 1.452, 1.46];
    tube(A, G, keep(ys.map((y, i) => {
      const w = y < 1.345 ? 0.126 + 0.007 * sm((y - 1.112) / 0.08) : lerp(0.133, 0.078, sm((y - 1.345) / 0.115)), th = i === 0 || i === ys.length - 1 ? 0.012 : 0.0215, s = (back ? zb(y) : zf(y)) + off;
      return { y, x: 0, z: (back ? 1 : -1) * (s - 0.008 + 0.0215), rx: w, rz: th, b: torsoBone(y), e: i % 2 === 0 };
    })), { seg: tseg + 2, n: 4.2, c: vc, a0: PI / 4 });
  }
  const f0 = (y) => zf(y) + off + 0.035, b0 = (y) => zb(y) + off + 0.035; // outer faces of the bags
  // cummerbund round the waist
  wrap(A, G, [1.118, 1.14, 1.2, 1.25, 1.268], (y) => (y < 1.13 || y > 1.26 ? [0.009 + off, 0.004, 0.004] : [0.017 + off, 0.006, 0.006]), { seg: tseg, n: 2.6, c: dk });
  if (L > 1) return;
  const slab = (x, y, z, w, h, t, col, yaw = 0, bone) => rbox(A, G, w, h, t, TM(x, y, z, 0, yaw, 0), { b: bone ?? torsoBone(y), c: col, seg: hi ? 8 : 6, n: 5 });
  // webbing rows: on the cummerbund's sides, across the front above the pouches, and down the back
  for (const y of [1.143, 1.193, 1.243]) wrap(A, G, [y, y + 0.026], () => [0.021 + off, 0.002, 0.002], { seg: tseg, n: 2.6, c: C(U.vestCol, 0.62), cap0: false, cap1: false });
  for (const y of [1.322, 1.366]) slab(0, y, -(f0(y) + 0.001), 0.19, 0.026, 0.006, C(U.vestCol, 0.62));
  for (const y of [1.15, 1.2, 1.25, 1.3, 1.35]) slab(0, y, b0(y) + 0.001, 0.2, 0.026, 0.006, C(U.vestCol, 0.62));
  // shoulder straps with pads, buckled to the front plate bag
  for (const s of [-1, 1]) {
    const pts = [[s * 0.082, 1.43, -(f0(1.43) - 0.012)], [s * 0.088, 1.462, -(zf(1.455) + off + 0.012)]];
    for (const z of [-0.06, -0.03, 0.0, 0.03, 0.06]) pts.push([s * 0.098, shoulderY(s * 0.098, z) + 0.011 + off, z]);
    pts.push([s * 0.088, 1.462, zb(1.455) + off + 0.012], [s * 0.082, 1.43, b0(1.43) - 0.012]);
    ribbon(A, G, pts, 0.05, 0.008, { b: CHEST, c: dk, from: [s * 0.095, 1.37, 0] });
    if (hi) { ribbon(A, G, pts.slice(2, 7).map((p) => [p[0], p[1] + 0.006, p[2]]), 0.058, 0.007, { b: CHEST, c: vc, from: [s * 0.095, 1.37, 0] }); slab(s * 0.084, 1.437, -(f0(1.437) + 0.002), 0.034, 0.022, 0.008, blk); }
    // side buckles of the cummerbund
    const t = torsoAt(1.2); slab(s * (t[0] + 0.022 + off), 1.2, -0.02, 0.01, 0.05, 0.035, blk, 0);
  }
  if (V === 'carrier') {
    const pb = [SPINE, CHEST, 0.5];
    for (const [x, yaw] of [[-0.086, 0.22], [0, 0], [0.086, -0.22]]) { // magazine pouches with lids and pull tabs
      const z = -(f0(1.2) + 0.019 - Math.abs(x) * 0.09), m = TM(x, 0, z, 0, yaw, 0);
      tube(A, G, [R(1.132, 0.036, 0.02, pb), R(1.245, 0.037, 0.022, pb), R(1.252, 0.041, 0.026, pb), R(1.282, 0.04, 0.0255, pb), R(1.287, 0.036, 0.021, pb)], { seg: hi ? 8 : 6, n: 4.5, c: pc, m, a0: PI / 4 });
      if (hi) rbox(A, G, 0.016, 0.03, 0.004, TM(x, 1.238, z - 0.027, 0, yaw, 0), { b: pb, c: blk, seg: 4, n: 5 });
    }
    slab(0.045, 1.345, -(f0(1.345) + 0.014), 0.105, 0.07, 0.026, pc); // admin pouch
    if (hi) {
      slab(-0.062, 1.35, -(f0(1.35) + 0.006), 0.07, 0.045, 0.004, C(0x2a2d30)); // name tape panel
      const t = torsoAt(1.21); slab(-(t[0] + 0.036 + off), 1.215, 0.012, 0.042, 0.13, 0.07, blk); // radio in its pouch on the left side
      addGeo(A, G, new THREE.CylinderGeometry(0.004, 0.005, 0.2, 5), TM(-(t[0] + 0.04 + off), 1.38, 0.022, 0, 0, 0.06), CHEST, C(0x0c0c0c));
      ribbon(A, G, [[-0.045, 1.452, b0(1.45) - 0.008], [-0.03, 1.476, b0(1.45) + 0.012], [0.03, 1.476, b0(1.45) + 0.012], [0.045, 1.452, b0(1.45) - 0.008]], 0.024, 0.006, { b: CHEST, c: dk, from: [0, 1.4, 0.1] }); // drag handle
    }
  }
}

function buildFigure(S) {
  const NEW = people.ready; if (NEW) fitTorso();
  const A = new Acc(), U = S.U, L = S.lod, hi = L <= 0, fp = L < 0, PL = Math.max(0, L), tseg = fp ? 18 : L === 0 ? 16 : L === 1 ? 10 : 6, lseg = fp ? 16 : L === 0 ? 10 : L === 1 ? 7 : 5;
  const keep = (rings) => (L >= 2 ? rings.filter((r, i) => i === 0 || i === rings.length - 1 || r.e) : L === 1 ? rings.filter((r) => !r.d) : rings);
  const tintTop = S.tintable && U.cloth === 'plain' ? 1 : 0, tintBot = S.tintable && U.cloth === 'plain' && !U.tintTop ? 1 : 0;
  const top = tintTop ? WHITE : C(U.top), bot = tintBot ? C(0xffffff, 0.62) : C(U.bottom), body = S.parts !== 'arms';
  const gearC = (hex, k = 1) => C(hex, k);

  if (NEW) {
    const sk = PL === 0 ? 0.74 : PL === 1 ? 0.85 : 0; // seam shading
    if (body) addPart(A, 'cloth', 'trousers', PL, { c: bot, tint: tintBot, shape: clothShape('trousers', U, PL), seams: sk });
    addPart(A, 'cloth', 'shirt', PL, { c: top, tint: tintTop, shape: clothShape('shirt', U, PL), keep: body ? null : isArm, seams: sk });
    if (body) addPart(A, 'skin', 'head' + S.skin, PL, { flag: true, shape: neckTuck });
  }
  if (body) {
    // pelvis and shirt (the shirt hangs just outside the trousers)
    if (!NEW) tube(A, 'cloth', keep([{ y: 0.84, rx: 0.07, rf: 0.07, rb: 0.075, b: HIPS }, ...TORSO.slice(0, 3).map((t, i) => ({ y: t[0], rx: t[1], rf: t[2], rb: t[3], b: torsoBone(t[0]), e: i !== 1 })), { y: 1.05, rx: 0.156, rf: 0.109, rb: 0.104, b: SPINE }]), { seg: tseg, n: 2.3, c: bot, tint: tintBot });
    if (!NEW) tube(A, 'cloth', keep(TORSO.slice(2).map((t, i) => ({ y: i === 0 ? 1.025 : t[0], rx: t[1] + 0.004, rf: t[2] + 0.004, rb: t[3] + 0.004, b: torsoBone(t[0]), e: i % 2 === 0, d: i === 2 }))), { seg: tseg, n: 2.3, c: top, tint: tintTop, cap0: false });
    // a flat strip of cloth or webbing lying on the torso: pockets, button strips, straps
    const strip = (slot, x, ys, w, th, col, tint = 0, back = false) => tube(A, slot, ys.map((y) => ({ y, x, z: (back ? 1 : -1) * (surfZ(y, x, back) + 0.004 + th * 0.5), rx: w, rz: th, b: torsoBone(y) })), { seg: 6, n: 4, c: col, tint, a0: PI / 4 });
    if (NEW && L <= 1 && !U.noCollar) { // a stand collar following the neckline (lower in front)
      const cc = U.cloth === 'plain' ? (tintTop ? C(0xffffff, 0.82) : C(U.top, 0.82)) : C(0xffffff, 0.9), nb = [CHEST, NECK, 0.55];
      tube(A, 'cloth', [{ y: -0.034, rx: 0.132, rf: 0.078, rb: 0.082, b: CHEST }, { y: -0.01, rx: 0.126, rf: 0.074, rb: 0.077, b: CHEST }, { y: 0.004, rx: 0.112, rf: 0.07, rb: 0.072, b: nb }, { y: 0.016, rx: 0.086, rf: 0.065, rb: 0.066, b: nb }, { y: 0.034, rx: 0.0725, rf: 0.0605, rb: 0.061, b: nb }, { y: 0.036, rx: 0.069, rf: 0.057, rb: 0.058, b: nb }],
        { seg: tseg, n: 2.1, c: cc, tint: tintTop, cap0: false, cap1: false, m: TM(0, 1.528, -0.009, -0.37, 0, 0), us: 0.55 });
    }
    if (U.cloth === 'plain' && L <= 1) {
      const dk = tintTop ? C(0xffffff, 0.8) : C(U.top, 0.8);
      if (!NEW) tube(A, 'cloth', [{ y: 1.522, rx: 0.084, rf: 0.078, rb: 0.086, b: [CHEST, NECK, 0.4] }, { y: 1.556, rx: 0.073, rf: 0.069, rb: 0.079, b: [CHEST, NECK, 0.5] }], { seg: tseg, n: 2.2, c: dk, tint: tintTop, cap0: false, cap1: false }); // collar
      if (U.shirt) {
        strip('cloth', 0, [1.06, 1.16, 1.26, 1.36, 1.45, 1.5], 0.016, 0.004, dk, tintTop); // button strip
        for (const s of [-1, 1]) { strip('cloth', s * 0.088, [1.305, 1.345, 1.385], 0.04, 0.004, top, tintTop); strip('cloth', s * 0.088, [1.372, 1.397], 0.042, 0.007, dk, tintTop); } // chest pockets and flaps
        if (hi) for (let k = 0; k < 4; k++) addGeo(A, 'gear', new THREE.SphereGeometry(0.005, 6, 4), TM(0, 1.1 + k * 0.1, -(surfZ(1.1 + k * 0.1, 0) + 0.012)), torsoBone(1.1 + k * 0.1), C(0x1c1d1f));
      } else if (U.zip) strip('gear', 0, [1.06, 1.16, 1.26, 1.36, 1.45, 1.5], 0.007, 0.003, C(0x8d9093));
    }
    // neck and head
    if (!NEW) {
    tube(A, 'skin', keep([R(1.46, 0.06, 0.059, CHEST, { z: 0.012 }), R(1.51, 0.059, 0.058, [CHEST, NECK, 0.6], { z: 0.012 }), R(1.56, 0.057, 0.058, NECK, { z: 0.011, d: 1 }), R(1.61, 0.057, 0.06, [NECK, HEAD, 0.6], { z: 0.012 }), R(1.645, 0.052, 0.054, HEAD, { z: 0.012 })]), { seg: Math.max(6, lseg), cap0: false, cap1: false, uv: SKINUV });
    shell(A, 'skin', HC, [1, 1, 1], { rows: L <= 0 ? 18 : L === 1 ? 11 : 7, seg: L <= 0 ? 26 : L === 1 ? 14 : 8, f: headShape, b: HEAD });
    if (L <= 1) tube(A, 'skin', [R(1.712, 0.0075, 0, HEAD, { z: -0.0925, rf: 0.006, rb: 0.01 }), R(1.694, 0.0095, 0, HEAD, { z: -0.096, rf: 0.011, rb: 0.01 }), R(1.675, 0.013, 0, HEAD, { z: -0.098, rf: 0.019, rb: 0.01 }), R(1.662, 0.0165, 0, HEAD, { z: -0.098, rf: 0.023, rb: 0.01 }), R(1.654, 0.012, 0, HEAD, { z: -0.096, rf: 0.013, rb: 0.01 })], { seg: hi ? 8 : 5, uv: SKINUV, a0: PI / 2 });
    if (hi) for (const s of [-1, 1]) shell(A, 'skin', [s * 0.0795, 1.683, 0.014], [0.0085, 0.03, 0.017], { rows: 6, seg: 8, b: HEAD, uv: SKINUV, m: null });
    }
  }

  for (const s of [-1, 1]) {
    const ab = armBase(s), UA = ab, LA = ab + 1, HA = ab + 2, F1 = ab + 3, F2 = ab + 4, TH = ab + 5, ax = 0.198 * s;
    // sleeve: a rounded shoulder cap that turns with the upper arm, a soft elbow, a cuff
    if (!NEW) tube(A, 'cloth', keep([R(1.502, 0.026, 0.03, UA, { x: ax * 0.95 }), R(1.484, 0.05, 0.054, UA, { x: ax * 1.01, d: 1 }), R(1.44, 0.061, 0.064, UA, { x: ax * 1.04, e: 1 }), R(1.35, 0.055, 0.059, UA, { x: ax * 1.03 }), R(1.24, 0.049, 0.052, UA, { x: ax, d: 1 }),
      R(1.17, 0.046, 0.048, UA, { x: ax }), R(1.13, 0.046, 0.047, [UA, LA, 0.5], { x: ax, e: 1 }), R(1.09, 0.047, 0.048, LA, { x: ax }), R(1.03, 0.046, 0.047, LA, { x: ax, d: 1 }), R(0.95, 0.039, 0.041, LA, { x: ax }), R(0.9, 0.035, 0.037, LA, { x: ax, e: 1 }), R(0.888, 0.0365, 0.0385, LA, { x: ax, d: 1 })]),
    { seg: lseg, c: top, tint: tintTop, us: 0.36 });
    // hand: skin or glove
    const gl = U.glove != null, hs = gl ? 'gear' : 'skin', hc = gl ? gearC(U.glove) : WHITE, ho = { c: hc, uv: gl ? undefined : SKINUV };
    if (NEW) addPart(A, hs, s > 0 ? 'handR' : 'handL', PL, gl ? { c: hc, off: 0.0016, uvk: 6 } : {});
    else if (L >= 2) tube(A, hs, [R(0.9, 0.028, 0.032, LA, { x: ax }), R(0.84, 0.02, 0.04, HA, { x: ax }), R(0.74, 0.016, 0.04, HA, { x: ax }), R(0.7, 0.012, 0.03, HA, { x: ax })], { seg: 5, n: 2.6, ...ho, cap0: false });
    else {
      tube(A, hs, [R(0.905, 0.028, 0.032, LA, { x: ax }), R(0.868, 0.021, 0.029, [LA, HA, 0.6], { x: ax }), R(0.84, 0.018, 0.039, HA, { x: ax, z: -0.003 }), R(0.8, 0.0155, 0.0435, HA, { x: ax, z: -0.003 }), R(0.772, 0.0135, 0.042, HA, { x: ax, z: -0.002 })], { seg: fp ? 12 : 8, n: 2.8, ...ho, cap0: false });
      if (hi) {
        const FZ = [-0.031, -0.0105, 0.0105, 0.03], FR = [0.0093, 0.0097, 0.0091, 0.0081], FY = [0.777, 0.773, 0.776, 0.784], F1L = [0.04, 0.045, 0.042, 0.033], F2L = [0.04, 0.045, 0.041, 0.032];
        for (let k = 0; k < 4; k++) { const r = FR[k], y0 = FY[k] + 0.006, a = F1L[k] + 0.006, b = F2L[k], o = { x: ax, z: FZ[k] }; tube(A, hs, [R(y0, r, r, F1, o), R(y0 - a * 0.55, r * 0.98, r * 0.98, F1, o), R(y0 - a, r * 0.96, r * 0.96, [F1, F2, 0.5], o), R(y0 - a - b * 0.5, r * 0.9, r * 0.9, F2, o), R(y0 - a - b * 0.88, r * 0.78, r * 0.78, F2, o), R(y0 - a - b, r * 0.45, r * 0.45, F2, o)], { seg: fp ? 8 : 6, ...ho, cap0: false }); }
      } else tube(A, hs, [R(0.778, 0.0115, 0.04, F1, { x: ax }), R(0.735, 0.0105, 0.039, [F1, F2, 0.5], { x: ax }), R(0.7, 0.009, 0.035, F2, { x: ax }), R(0.69, 0.006, 0.028, F2, { x: ax })], { seg: 6, n: 2.8, ...ho, cap0: false });
      // thumb: built pointing down, then swung forward and a little toward the palm
      const tm = TM(ax - s * 0.006, 0.845, -0.028, -0.72, 0, -s * 0.2);
      tube(A, hs, [R(0.012, 0.014, 0.014, [HA, TH, 0.4]), R(-0.022, 0.012, 0.012, TH), R(-0.05, 0.0102, 0.0102, TH), R(-0.064, 0.006, 0.006, TH)], { seg: fp ? 8 : 6, ...ho, m: tm });
      if (gl && hi && !NEW) {
        rbox(A, 'gear', 0.007, 0.05, 0.062, TM(ax + s * 0.0165, 0.805, -0.003), { b: HA, c: gearC(U.glove, 0.6), seg: 8 }); // knuckle guard
        tube(A, 'gear', [R(0.905, 0.031, 0.035, LA, { x: ax }), R(0.878, 0.03, 0.034, LA, { x: ax })], { seg: fp ? 12 : 8, c: gearC(U.glove, 0.7), cap0: false, cap1: false }); // cuff strap
      }
    }
    if (NEW && gl && L <= 1) { // glove: knuckle guard on the back of the hand, a wrist strap
      if (hi) for (let k = 0; k < 4; k++) rbox(A, 'gear', 0.005, 0.014, 0.014, TM(ax + s * (0.0155 - Math.abs(k - 1.4) * 0.0012), 0.757 + (k === 0 || k === 3 ? 0.004 : 0), -0.031 + k * 0.0205, 0, 0, s * 0.1), { b: HA, c: gearC(U.glove, 0.6), seg: 6, n: 2.6 }); // knuckle pads
      tube(A, 'gear', [R(0.893, 0.0325, 0.0355, LA, { x: ax }), R(0.868, 0.031, 0.036, LA, { x: ax })], { seg: fp ? 12 : 8, c: gearC(U.glove, 0.7), cap0: false, cap1: false });
    }
    if (NEW && U.cloth === 'camo' && L <= 1) { // sleeve pocket with a patch panel
      rbox(A, 'cloth', 0.012, 0.115, 0.085, TM(ax + s * 0.058, 1.3, 0.004, 0, 0, s * 0.05), { b: UA, c: C(0xffffff, 0.93), n: 4, seg: 8 });
      rbox(A, 'cloth', 0.014, 0.03, 0.089, TM(ax + s * 0.0585, 1.345, 0.004, 0, 0, s * 0.05), { b: UA, c: C(0xffffff, 0.8), n: 4, seg: 8 });
      if (hi) rbox(A, 'gear', 0.004, 0.05, 0.06, TM(ax + s * 0.0655, 1.292, 0.004, 0, 0, s * 0.05), { b: UA, c: C(S.nation === 'aethia' ? 0x2f4f86 : 0x7a2a1c), n: 5, seg: 6 });
    }
    if (!body) continue;

    // leg: trouser, boot, sole
    const lb = legBase(s), UL = lb, LL = lb + 1, FT = lb + 2, lx = 0.092 * s;
    if (NEW) boot(A, s, U, L, keep);
    if (!NEW) tube(A, 'cloth', keep([R(0.985, 0.045, 0.05, UL, { x: lx }), R(0.94, 0.082, 0.09, UL, { x: lx, d: 1 }), R(0.87, 0.088, 0, UL, { x: lx * 1.02, rf: 0.092, rb: 0.098, e: 1 }), R(0.74, 0.08, 0, UL, { x: lx, rf: 0.086, rb: 0.085 }), R(0.6, 0.069, 0.074, UL, { x: lx, d: 1 }), R(0.54, 0.065, 0.068, UL, { x: lx }),
      R(0.5, 0.064, 0, [UL, LL, 0.5], { x: lx, rf: 0.068, rb: 0.064, e: 1 }), R(0.46, 0.062, 0.064, LL, { x: lx }), R(0.38, 0.062, 0, LL, { x: lx, rf: 0.058, rb: 0.07, d: 1 }), R(0.3, 0.061, 0.063, LL, { x: lx, e: 1 }), R(0.266, 0.057, 0.059, LL, { x: lx }), R(0.258, 0.049, 0.051, LL, { x: lx, d: 1 })]),
    { seg: lseg, c: bot, tint: tintBot, us: 0.5 });
    const bc = gearC(U.boot);
    if (!NEW) {
    tube(A, 'gear', keep([R(0.275, 0.05, 0.053, LL, { x: lx }), R(0.2, 0.047, 0.05, LL, { x: lx, d: 1 }), R(0.13, 0.045, 0.05, LL, { x: lx }), R(0.075, 0.044, 0, [LL, FT, 0.6], { x: lx, rf: 0.056, rb: 0.052 })]), { seg: lseg, c: bc, cap0: false, cap1: false });
    // the foot is a tube laid along the ground: local +Y runs toward the toe, local +Z is up
    const fm = TM(lx, 0, 0, -PI / 2, 0, 0), FR = (zw, w, topY, o) => ({ y: -zw, z: 0.046, rx: w, rb: topY - 0.046, rf: L < 2 ? 0.027 : 0.045, b: FT, ...o });
    tube(A, 'gear', keep([FR(0.078, 0.03, 0.09), FR(0.064, 0.038, 0.108, { d: 1 }), FR(0.03, 0.043, 0.122, { e: 1 }), FR(-0.02, 0.046, 0.118), FR(-0.07, 0.049, 0.094, { e: 1 }), FR(-0.12, 0.052, 0.072, { d: 1 }), FR(-0.165, 0.05, 0.061), FR(-0.198, 0.041, 0.053, { e: 1 }), FR(-0.212, 0.027, 0.044)]), { seg: lseg, n: 2.5, c: bc, m: fm });
    const SR = (zw, w) => ({ y: -zw, z: 0.012, rx: w, rz: 0.012, b: FT }); if (L < 2)
    tube(A, 'gear', keep([SR(0.086, 0.034), SR(0.066, 0.042), SR(-0.02, 0.05, { e: 1 }), SR(-0.12, 0.056), SR(-0.2, 0.046), SR(-0.218, 0.03)]), { seg: L >= 2 ? 4 : 8, n: 5, c: gearC(U.sole), m: fm, a0: PI / 4 });
    if (hi) for (let k = 0; k < 4; k++) rbox(A, 'gear', 0.05, 0.006, 0.01, TM(lx, 0.121 - k * 0.011, -0.03 - k * 0.026, 0.4), { b: FT, c: C(0x3a3731), seg: 4, n: 3 });
    }
    if (U.knee && L <= 1) {
      shell(A, 'gear', [lx, 0.505, -0.052], [0.062, 0.078, 0.04], { rows: 5, seg: hi ? 10 : 6, th0: -1.75, th1: 1.75, p0: 0.25, p1: PI - 0.25, b: LL, c: gearC(U.pouchCol, 0.8), center: [lx, 0.505, 0] });
      if (hi) tube(A, 'gear', [R(0.478, 0.07, 0.072, LL, { x: lx }), R(0.46, 0.07, 0.072, LL, { x: lx })], { seg: 10, c: gearC(U.belt), cap0: false, cap1: false });
    }
    if (U.pockets && L <= 1) { const px = NEW ? 0.089 + (((U.fit && U.fit.off) || 0.012) - 0.012) : 0.074; rbox(A, 'cloth', 0.03, 0.16, 0.12, TM(lx + s * px, 0.72, 0.006, 0, 0, s * 0.03), { b: UL, c: bot, n: 4, seg: 8 }); if (NEW) rbox(A, 'cloth', 0.033, 0.045, 0.124, TM(lx + s * px, 0.785, 0.006, 0, 0, s * 0.03), { b: UL, c: C(0xffffff, 0.82), n: 4, seg: 8 }); }
  }
  if (!body) return A;

  /* ---- load-bearing gear ---- */
  const V = U.vest, vt = S.tintable && U.tintTop ? 1 : 0, vc = V ? (vt ? C(0xffffff, U.vestShade || 1) : C(U.vestCol, U.vestShade || 1)) : null;
  if (NEW && (V === 'carrier' || V === 'flak')) vest(A, U, V, vc, L, tseg, hi, keep);
  else if (V === 'carrier' || V === 'flak') {
    const P = [[1.135, 0.158, 0.13, 0.124], [1.2, 0.168, 0.14, 0.132], [1.29, 0.176, 0.148, 0.138], [1.35, 0.164, 0.146, 0.138], [1.41, 0.13, 0.134, 0.132], [1.447, 0.118, 0.116, 0.12]];
    tube(A, 'gear', keep(P.map((p, i) => ({ y: p[0], rx: p[1], rf: p[2], rb: p[3], b: torsoBone(p[0]), e: i === 2 || i === 4 }))), { seg: tseg, n: 3.4, c: vc });
    if (L <= 1) for (const s of [-1, 1]) shell(A, 'gear', [s * 0.1, 1.482, 0.002], [0.034, 0.024, 0.092], { rows: 5, seg: 8, b: CHEST, c: C(U.vestCol, 0.85) });
    if (V === 'carrier' && L <= 1) {
      const pc = C(U.pouchCol), pb = [SPINE, CHEST, 0.5];
      for (const [x, z, yaw] of [[-0.09, -0.151, 0.3], [0, -0.164, 0], [0.09, -0.151, -0.3]]) { // magazine pouches
        const m = TM(x, 0, z, 0, yaw, 0);
        tube(A, 'gear', [R(1.148, 0.036, 0.022, pb), R(1.255, 0.037, 0.024, pb), R(1.262, 0.04, 0.028, pb), R(1.285, 0.039, 0.027, pb)], { seg: hi ? 8 : 6, n: 4, c: pc, m, a0: PI / 4 });
      }
      rbox(A, 'gear', 0.15, 0.07, 0.03, TM(0, 1.35, -0.154), { b: CHEST, c: pc, seg: 8, n: 5 }); // admin pouch
      rbox(A, 'gear', 0.21, 0.24, 0.05, TM(0, 1.3, 0.15), { b: CHEST, c: pc, seg: 8, n: 5 }); // back panel
      if (hi) {
        rbox(A, 'gear', 0.045, 0.13, 0.075, TM(-0.178, 1.25, -0.02), { b: CHEST, c: C(0x161718), seg: 8, n: 5 }); // radio
        addGeo(A, 'gear', new THREE.CylinderGeometry(0.004, 0.005, 0.2, 5), TM(-0.185, 1.41, 0.0, 0, 0, 0.1), CHEST, C(0x0c0c0c));
        for (const y of [1.17, 1.21]) wrap(A, 'gear', [y, y + 0.022], () => [0.021, 0.035, 0.037], { seg: tseg, n: 3.4, c: C(U.vestCol, 0.72), cap0: false, cap1: false }); // webbing rows on the cummerbund
      }
    }
  } else if (V === 'float') {
    const fg = NEW && L >= 2 ? 0.014 : 0;
    tube(A, 'gear', keep([[1.15, 0.165, 0.146, 0.13], [1.25, 0.18, 0.162, 0.142], [1.36, 0.178, 0.16, 0.144], [1.42, 0.142, 0.142, 0.134], [1.452, 0.115, 0.122, 0.122]].map((p, i) => ({ y: p[0], rx: p[1] + fg, rf: p[2] + fg, rb: p[3] + fg, b: torsoBone(p[0]), e: i === 1 || i === 3 }))), { seg: tseg, n: 2.8, c: vc, tint: vt });
    if (L <= 1) {
      tube(A, 'gear', [{ y: 1.452, rx: 0.108, rf: 0.098, rb: 0.104, b: CHEST }, { y: 1.485, rx: 0.112, rf: 0.1, rb: 0.108, b: CHEST }, { y: 1.512, rx: 0.098, rf: 0.086, rb: 0.098, b: CHEST }], { seg: tseg, n: 2.4, c: vt ? C(0xffffff, 0.9) : C(U.vestCol, 0.9), tint: vt, cap0: false }); // collar
      for (const s of [-1, 1]) rbox(A, 'gear', 0.075, 0.085, 0.022, TM(s * 0.075, 1.24, -0.165), { b: [SPINE, CHEST, 0.6], c: C(0x23262a), seg: 8, n: 5 });
      if (hi) wrap(A, 'gear', [1.3, 1.325], () => [0.014, 0.036, 0.032], { seg: tseg, n: 2.8, c: C(0xc9cdd0), cap0: false, cap1: false }); // reflective band
    }
  } else if (V === 'harness') {
    const wc = C(U.vestCol);
    if (L <= 1) {
      const hg = NEW ? 0.011 : 0;
      for (const y of [1.325, 1.075]) wrap(A, 'gear', [y, y + 0.03], () => [0.009 + hg, 0.009 + hg, 0.009 + hg], { seg: tseg, n: 2.3, c: wc, cap0: false, cap1: false });
      for (const s of [-1, 1]) {
        tube(A, 'gear', [1.08, 1.2, 1.3, 1.4, 1.455].map((y) => ({ y, x: s * (0.085 - (y > 1.4 ? 0.01 : 0)), z: -(torsoAt(y)[1] * Math.sqrt(1 - Math.pow((s * 0.085) / torsoAt(y)[0], 2)) + 0.006 + hg), rx: 0.021, rz: 0.007, b: torsoBone(y) })), { seg: 6, n: 4, c: wc });
        tube(A, 'gear', [1.08, 1.2, 1.3, 1.4, 1.455].map((y) => ({ y, x: s * 0.08, z: torsoAt(y)[2] * Math.sqrt(1 - Math.pow(0.08 / torsoAt(y)[0], 2)) + 0.006 + hg, rx: 0.021, rz: 0.007, b: torsoBone(y) })), { seg: 6, n: 4, c: wc });
        if (NEW) { const pts = [[s * 0.084, 1.455, -(torsoAt(1.455)[1] * 0.86 + 0.012)]]; for (const z of [-0.055, -0.02, 0.015, 0.05]) pts.push([s * 0.09, shoulderY(s * 0.09, z) + 0.016, z]); pts.push([s * 0.08, 1.455, torsoAt(1.455)[2] * 0.9 + 0.012]); ribbon(A, 'gear', pts, 0.042, 0.007, { b: CHEST, c: wc, from: [s * 0.09, 1.38, 0] }); }
        else shell(A, 'gear', [s * 0.088, 1.488, 0.002], [0.024, 0.02, 0.09], { rows: 5, seg: 8, b: CHEST, c: wc });
        tube(A, 'gear', [R(0.84, 0.091 + hg, 0, legBase(s), { x: s * 0.094, rf: 0.095 + hg * 1.6, rb: 0.1 + hg * 1.6 }), R(0.812, 0.09 + hg, 0, legBase(s), { x: s * 0.094, rf: 0.094 + hg * 1.6, rb: 0.098 + hg * 1.6 })], { seg: lseg, c: wc, cap0: false, cap1: false }); // leg strap
      }
      rbox(A, 'gear', 0.085, 0.1, 0.035, TM(-0.085, 1.2, -0.14, 0, 0.25, 0), { b: [SPINE, CHEST, 0.5], c: C(U.pouchCol), seg: 8, n: 5 }); // survival pouch
      rbox(A, 'gear', 0.06, 0.03, 0.02, TM(0, 1.335, -0.14), { b: CHEST, c: C(0x9a9d9f), seg: 6, n: 4 }); // chest buckle
    }
  }
  // belt
  if (L <= 1) {
    const bx = NEW ? Math.max(0, ((U.fit && U.fit.off) || 0.012) - 0.012) + (U.tuck ? 0 : 0.009) : 0; // room for a loose blouse under the belt
    wrap(A, 'gear', [1.0, 1.045], U.gearBelt ? [0.012 + bx, 0.014 + bx, 0.014 + bx] : NEW ? [0.0125 + bx, 0.0125 + bx, 0.0125 + bx] : [0.006, 0.007, 0.007], { seg: tseg, n: 2.3, c: C(U.belt), cap0: false, cap1: false });
    if (U.gearBelt) {
      if (!NEW) { rbox(A, 'gear', 0.05, 0.15, 0.1, TM(-0.19, 0.95, 0.03), { b: HIPS, c: C(U.pouchCol), seg: 8, n: 4 }); // dump pouch
      rbox(A, 'gear', 0.04, 0.17, 0.085, TM(0.19, 0.93, -0.005, -0.15), { b: HIPS, c: C(0x17181a), seg: 8, n: 4 }); } // holster
      if (NEW) { const t = torsoAt(1.022); rbox(A, 'gear', 0.042, 0.034, 0.012, TM(0, 1.022, -(t[1] + 0.018 + bx), 0, 0, 0), { b: HIPS, c: C(0x101112), seg: 6, n: 5 }); } // belt buckle
      if (hi) { if (!NEW) rbox(A, 'gear', 0.03, 0.06, 0.04, TM(0.19, 1.03, 0.028, -0.3), { b: HIPS, c: C(0x101112), seg: 6, n: 4 }); for (const x of NEW ? [] : [-0.07, 0.075]) rbox(A, 'gear', 0.075, 0.08, 0.04, TM(x, 1.01, 0.135), { b: HIPS, c: C(U.pouchCol), seg: 8, n: 4 }); }
    } else rbox(A, 'gear', 0.04, 0.034, 0.012, TM(0, 1.022, NEW ? -(torsoAt(1.022)[1] + 0.014) : -0.122), { b: HIPS, c: C(0x8f8a78), seg: 6, n: 5 });
  }

  /* ---- headgear ---- */
  const H = S.helmet, sideRim = (front, side, back) => (th) => { const a = Math.abs(th) / (PI / 2); return a < 1 ? lerp(front, side, sm(a)) : lerp(side, back, sm(a - 1)); };
  const hrows = L <= 0 ? 8 : L === 1 ? 5 : 3, hseg = L <= 0 ? 20 : L === 1 ? 12 : 8;
  if (NEW && H === 'combat') { const camo = U.cloth === 'camo'; combatHelmet(A, camo ? 'cloth' : 'gear', camo ? WHITE : C(helmetColor(S.nation, 'combat')), L); }
  else if (H === 'combat') {
    const camo = U.cloth === 'camo', hc = camo ? WHITE : C(helmetColor(S.nation, 'combat'));
    shell(A, camo ? 'cloth' : 'gear', [0, 1.705, 0.006], [0.103, 0.108, 0.127], { rows: hrows, seg: hseg, rim: sideRim(1.73, 1.676, 1.65), lip: 0.9, b: HEAD, c: hc, ur: 2, vr: 1.2 });
    if (hi) {
      for (const s of [-1, 1]) rbox(A, 'gear', 0.008, 0.022, 0.09, TM(s * 0.103, 1.705, 0.012), { b: HEAD, c: C(0x1a1b1c), seg: 6, n: 5 });
      rbox(A, 'gear', 0.045, 0.036, 0.012, TM(0, 1.752, -0.117, -0.35), { b: HEAD, c: C(0x1a1b1c), seg: 6, n: 5 });
      const st = new THREE.TorusGeometry(0.088, 0.0045, 4, 14, PI); st.rotateZ(PI); addGeo(A, 'gear', st, TM(0, 1.672, -0.012, -0.22, 0, 0, [1, 1.24, 1]), HEAD, C(0x24231f)); // chin strap
    }
  } else if (H === 'cap' && NEW) {
    const hc = S.tintable && U.cloth === 'plain' && !U.tintTop ? C(0xffffff, 0.5) : C(helmetColor(S.nation, 'cap')), m0 = mark(A), cc = [0, 1.71, -0.0125], cr = [0.0868, 0.101, 0.1145];
    shell(A, 'gear', cc, cr, { rows: hrows + 1, seg: hseg, rim: sideRim(1.737, 1.724, 1.704), lip: 0.95, b: HEAD, c: hc, tint: tintBot, f: (dx, dy, dz, out) => { if (dz < 0 && dy > 0) { const k = 0.012 * sm(-dz * 1.6) * sm(dy * 1.4); out.y += k; out.z -= k * 0.5; } } });
    shell(A, 'gear', [0, 0, 0], [0.076, 0.0055, 0.056], { rows: 4, seg: L <= 0 ? 14 : 8, b: HEAD, c: hc.map((v) => v * 0.9), tint: tintBot, m: TM(0, 1.733, -0.166, -0.2) });
    if (L <= 0) rbox(A, 'gear', 0.012, 0.012, 0.012, TM(0, 1.814, -0.0125), { b: HEAD, c: hc, seg: 6, n: 2 });
    fixed(A, m0);
  } else if (H === 'cap') {
    const hc = S.tintable && U.cloth === 'plain' && !U.tintTop ? C(0xffffff, 0.5) : C(helmetColor(S.nation, 'cap'));
    shell(A, 'gear', [0, 1.713, 0.004], [0.0875, 0.09, 0.106], { rows: hrows, seg: hseg, rim: sideRim(1.738, 1.722, 1.706), lip: 0.93, b: HEAD, c: hc, tint: tintBot });
    shell(A, 'gear', [0, 0, 0], [0.074, 0.006, 0.066], { rows: 4, seg: L <= 0 ? 12 : 8, b: HEAD, c: hc, tint: tintBot, m: TM(0, 1.736, -0.118, -0.16) });
  } else if (H === 'cranial') {
    const hc = vt ? WHITE : C(U.tintTop ? U.top : 0xd9ad18);
    shell(A, 'gear', [0, 1.706, 0.005], [0.099, 0.103, 0.12], { rows: hrows, seg: hseg, rim: sideRim(1.742, 1.704, 1.656), lip: 0.9, b: HEAD, c: hc, tint: vt });
    if (L <= 1) {
      for (const s of [-1, 1]) shell(A, 'gear', [s * 0.091, 1.684, 0.012], [0.024, 0.046, 0.04], { rows: 5, seg: 8, b: HEAD, c: C(0x1b1c1e) }); // ear cups
      const gr = NEW ? [0.097, 1, 0.1235] : [0.09, 1, 0.111], band = (slot, y0, y1, k, a, col) => grid(A, slot, 2, hi ? 10 : 6, (i, j, f, out) => { const th = -a + 2 * a * f, y = i ? y1 : y0; out.x = Math.sin(th) * gr[0] * k; out.y = y; out.z = 0.004 - Math.cos(th) * gr[2] * k; }, { open: true, b: HEAD, c: col, center: [0, 1.7, 0] });
      band('gear', 1.676, 1.727, 1.0, 1.05, C(0x151617)); band('glass', 1.683, 1.72, 1.012, 0.92, C(0xffffff));
    }
  } else if (H === 'flight') {
    const hc = C(helmetColor(S.nation, 'flight'));
    const rim = (th) => { const a = Math.abs(th); return a < 0.85 ? 1.738 : a < 1.3 ? lerp(1.738, 1.612, sm((a - 0.85) / 0.45)) : 1.606; };
    shell(A, 'gear', [0, 1.702, 0.006], [0.113, 0.118, 0.131], { rows: hrows + 1, seg: hseg, rim, lip: 0.9, b: HEAD, c: hc });
    grid(A, 'glass', L <= 0 ? 5 : 3, L <= 0 ? 12 : 6, (i, j, f, out, n = L <= 0 ? 5 : 3) => { const th = -1.08 + 2.16 * f, t = i / (n - 1), y = lerp(NEW ? 1.742 : 1.748, 1.652, t), k = (NEW ? 1.03 : 1) - 0.1 * (t - 0.4) * (t - 0.4); out.x = Math.sin(th) * (NEW ? 0.107 : 0.1) * k; out.y = y; out.z = 0.004 - Math.cos(th) * (NEW ? 0.1275 : 0.118) * k; }, { open: true, b: HEAD, c: WHITE, center: [0, 1.7, 0] });
    if (L <= 1) {
      shell(A, 'gear', [0, 1.628, -0.086], [0.044, 0.048, 0.044], { rows: 6, seg: 10, b: HEAD, c: C(0x24272a) }); // oxygen mask
      tube(A, 'gear', [R(1.6, 0.015, 0.015, HEAD, { z: -0.112 }), R(1.54, 0.014, 0.014, [HEAD, CHEST, 0.5], { x: 0.02, z: -0.125 }), R(1.46, 0.014, 0.014, CHEST, { x: 0.045, z: -0.133 }), R(1.38, 0.014, 0.014, CHEST, { x: 0.06, z: -0.138 })], { seg: 6, c: C(0x2a2d30) });
    }
  }
  else if (H === 'arctic') { // white-covered helmet with a fur edge, and a balaclava
    if (NEW) combatHelmet(A, 'gear', C(0xe4e7ea), L); else shell(A, 'gear', [0, 1.705, 0.006], [0.103, 0.108, 0.127], { rows: hrows, seg: hseg, rim: sideRim(1.73, 1.676, 1.65), lip: 0.9, b: HEAD, c: C(0xe4e7ea) });
    if (L <= 1) {
      shell(A, 'gear', [0, 1.705, 0.006], [0.112, 0.108, 0.136], { rows: 3, seg: hseg, p0: 1.05, rim: sideRim(1.722, 1.668, 1.642), b: HEAD, c: C(0x8f7d66) });
      if (NEW) { // balaclava: follows the face from under the eyes down over the nose, mouth and chin to the collar
        const m0 = mark(A), bz = -0.0125, BR = (y, rx, rf, rb, b) => ({ y, x: 0, z: bz, rx, rf, rb, b });
        tube(A, 'gear', [BR(1.676, 0.083, 0.119, 0.1, HEAD), BR(1.66, 0.0825, 0.127, 0.098, HEAD), BR(1.64, 0.081, 0.134, 0.09, HEAD), BR(1.615, 0.075, 0.123, 0.078, HEAD), BR(1.59, 0.07, 0.117, 0.066, HEAD), BR(1.566, 0.066, 0.108, 0.062, [NECK, HEAD, 0.5]), BR(1.545, 0.07, 0.082, 0.062, NECK), BR(1.51, 0.078, 0.072, 0.068, [CHEST, NECK, 0.6])], { seg: hseg, n: 2.2, c: C(0x2a2d31), cap0: false, cap1: false });
        fixed(A, m0);
      } else {
      shell(A, 'gear', HC, [0.085, 0.124, 0.104], { rows: 6, seg: hseg, p0: 1.62, p1: PI, b: HEAD, c: C(0x2a2d31) });
      tube(A, 'gear', [R(1.5, 0.066, 0.066, [CHEST, NECK, 0.6], { z: 0.012 }), R(1.62, 0.062, 0.066, [NECK, HEAD, 0.6], { z: 0.012 })], { seg: 8, c: C(0x2a2d31), cap0: false, cap1: false });
      }
    }
  } else if (H === 'tacops') { // cut high over the ears for a headset, rails, a night-vision mount
    shell(A, 'gear', [0, 1.705, 0.006], [0.102, 0.107, 0.126], { rows: hrows, seg: hseg, rim: sideRim(1.735, 1.716, 1.66), lip: 0.9, b: HEAD, c: C(0x1d1f21) });
    if (L <= 1) {
      for (const s of [-1, 1]) { shell(A, 'gear', [s * 0.09, 1.684, 0.012], [0.024, 0.044, 0.038], { rows: 5, seg: 8, b: HEAD, c: C(0x2b2e30) }); rbox(A, 'gear', 0.008, 0.02, 0.1, TM(s * 0.102, 1.728, 0.012), { b: HEAD, c: C(0x0f1011), seg: 6, n: 5 }); }
      rbox(A, 'gear', 0.05, 0.04, 0.014, TM(0, 1.75, -0.116, -0.35), { b: HEAD, c: C(0x0f1011), seg: 6, n: 5 });
      rbox(A, 'gear', NEW ? 0.11 : 0.075, 0.035, NEW ? 0.03 : 0.07, NEW ? TM(0, 1.772, -0.104, -0.5) : TM(0, 1.812, -0.085, 0.3), { b: HEAD, c: C(0x141516), seg: 8, n: 5 }); // goggles folded up
      addGeo(A, 'gear', new THREE.CylinderGeometry(0.004, 0.004, 0.11, 5), TM(-0.07, 1.645, -0.055, 0.9, 0, 0.5), HEAD, C(0x0f1011)); // microphone boom
    }
  } else if (H === 'peaked') { // officer's cap: band, wide flat crown, glossy peak, badge
    const wc = C(S.nation === 'aethia' ? 0xe6e6e1 : 0x24332c), bk = C(0x121315);
    tube(A, 'gear', [R(1.722, 0.089, 0.106, HEAD, { z: 0.004, c: bk }), R(1.756, 0.09, 0.107, HEAD, { z: 0.004, c: bk }), R(1.758, 0.091, 0.108, HEAD, { z: 0.004, c: wc }), R(1.792, 0.12, 0.132, HEAD, { z: 0.0, c: wc }), R(1.806, 0.112, 0.124, HEAD, { z: 0.004, c: wc })], { seg: hseg, cap0: false });
    shell(A, 'gear', [0, 0, 0], [0.078, 0.006, 0.06], { rows: 4, seg: L <= 0 ? 12 : 8, b: HEAD, c: bk, m: TM(0, 1.722, -0.118, -0.3) });
    if (L <= 1) rbox(A, 'gear', 0.03, 0.03, 0.008, TM(0, 1.772, -0.118, 0.25), { b: HEAD, c: C(0xc9a23a), seg: 6, n: 4 });
  } else if (H === 'diver') { // full-face dive helmet with a lamp
    shell(A, 'gear', [0, 1.69, 0.004], [0.122, 0.128, 0.134], { rows: hrows + 2, seg: hseg, p1: PI * 0.84, lip: 0.85, b: HEAD, c: C(0xc7a51c) });
    grid(A, 'glass', 4, L <= 0 ? 10 : 6, (i, j, f, out) => { const th = -0.72 + 1.44 * f, y = lerp(1.74, 1.635, i / 3), k = 1.03; out.x = Math.sin(th) * 0.122 * k; out.y = y; out.z = 0.004 - Math.cos(th) * 0.134 * k * (1 - 0.6 * Math.pow((y - 1.69) / 0.128, 2)); }, { open: true, b: HEAD, c: WHITE, center: [0, 1.69, 0] });
    if (L <= 1) {
      addGeo(A, 'gear', new THREE.CylinderGeometry(0.024, 0.02, 0.05, 8), TM(0.085, 1.79, -0.07, PI / 2), HEAD, C(0x2a2c2e)); // lamp
      addGeo(A, 'gear', new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), TM(0, 1.615, -0.135, PI / 2), HEAD, C(0x2a2c2e)); // regulator
      tube(A, 'gear', [R(1.535, 0.085, 0.088, [CHEST, NECK, 0.5], { z: 0.01 }), R(1.575, 0.09, 0.093, [NECK, HEAD, 0.5], { z: 0.01 })], { seg: 10, c: C(0x2a2c2e) });
    }
  } else if (H === 'heavy') { // full coverage: deep shell, armoured visor, jaw guard
    const hc = C(S.nation === 'aethia' ? 0x414a54 : 0x1c2221);
    shell(A, 'gear', [0, 1.703, 0.006], [0.109, 0.113, 0.133], { rows: hrows + 1, seg: hseg, rim: sideRim(1.732, 1.63, 1.612), lip: 0.9, b: HEAD, c: hc });
    const band = (slot, y0, y1, k, a, col, n = 2) => grid(A, slot, n, L <= 0 ? 12 : 6, (i, j, f, out) => { const th = -a + 2 * a * f, y = lerp(y0, y1, i / (n - 1)); out.x = Math.sin(th) * 0.106 * k; out.y = y; out.z = 0.004 - Math.cos(th) * 0.128 * k; }, { open: true, b: HEAD, c: col, center: [0, 1.7, 0] });
    band('glass', NEW ? 1.728 : 1.735, 1.655, NEW ? 1.035 : 1.0, 1.05, WHITE, 3); band('gear', 1.658, 1.572, NEW ? 1.02 : 0.97, 1.2, hc, 3);
  }
  /* ---- extra parts of the Hangar uniforms ---- */
  if (L <= 1) {
    if (U.fur) tube(A, 'gear', [{ y: 1.5, rx: 0.108, rf: 0.098, rb: 0.108, b: CHEST }, { y: 1.535, rx: 0.115, rf: 0.104, rb: 0.114, b: CHEST }, { y: 1.57, rx: 0.1, rf: 0.09, rb: 0.106, b: [CHEST, NECK, 0.4] }], { seg: tseg, n: 2.2, c: C(U.fur), cap0: false, cap1: false });
    if (U.kneeboard) { rbox(A, 'gear', 0.1, 0.15, 0.012, TM(-0.092, 0.72, -0.094, 0.06), { b: LEG_L, c: C(0xd8d8d2), seg: 6, n: 5 }); tube(A, 'gear', [R(0.735, 0.085, 0.09, LEG_L, { x: -0.092 }), R(0.705, 0.083, 0.088, LEG_L, { x: -0.092 })], { seg: lseg, c: C(0x151617), cap0: false, cap1: false }); }
    if (U.ribbons) {
      const RC = [0xb32d24, 0x2552a6, 0xd9ad18, 0x2c7a36, 0xe2e2de, 0x6d3a94];
      for (let k = 0; k < 6; k++) { const x = -0.108 + (k % 3) * 0.021, y = 1.392 - Math.floor(k / 3) * 0.012; rbox(A, 'gear', 0.019, 0.01, 0.004, TM(x, y, -(surfZ(y, x) + 0.008)), { b: CHEST, c: C(RC[k]), seg: 4, n: 4 }); }
      for (const s of [-1, 1]) rbox(A, 'gear', 0.055, 0.009, 0.1, TM(s * 0.142, 1.487, 0.002, 0, 0, -s * 0.22), { b: CHEST, c: C(0x15171c), seg: 6, n: 5 }); // shoulder boards
      rbox(A, 'gear', 0.045, 0.04, 0.012, TM(0, 1.022, -0.126), { b: HIPS, c: C(0xc9a23a), seg: 6, n: 5 });
    }
    if (U.sword) { rbox(A, 'gear', 0.018, 0.74, 0.036, TM(-0.205, 0.7, 0.03, 0.14, 0, 0.05), { b: HIPS, c: C(0x121214), seg: 6, n: 4 }); rbox(A, 'gear', 0.022, 0.13, 0.03, TM(-0.2, 1.125, -0.03, 0.14), { b: HIPS, c: C(0xc9a23a), seg: 6, n: 4 }); }
    if (U.weights) for (let k = 0; k < 6; k++) { const a = (k / 6) * 2 * PI + 0.5, t = torsoAt(1.02); rbox(A, 'gear', 0.06, 0.05, 0.03, TM(Math.sin(a) * (t[0] + 0.02), 1.022, Math.cos(a) * ((Math.cos(a) < 0 ? t[1] : t[2]) + 0.02), 0, a, 0), { b: HIPS, c: C(0x6f747a), seg: 6, n: 5 }); }
    if (U.fins) for (const s of [-1, 1]) rbox(A, 'gear', 0.13, 0.5, 0.02, TM(s * 0.075, 1.2, 0.14, 0.06, 0, s * 0.08), { b: CHEST, c: C(U.stripe), seg: 8, n: 3 });
    if (U.stripe) for (const s of [-1, 1]) tube(A, 'gear', [R(1.33, 0.057, 0.061, armBase(s), { x: 0.204 * s }), R(1.3, 0.055, 0.059, armBase(s), { x: 0.204 * s })], { seg: lseg, c: C(U.stripe), cap0: false, cap1: false });
    if (U.plates) {
      tube(A, 'gear', [{ y: 1.5, rx: 0.102, rf: 0.092, rb: 0.102, b: CHEST }, { y: 1.575, rx: 0.094, rf: 0.088, rb: 0.1, b: [CHEST, NECK, 0.4] }], { seg: tseg, n: 2.6, c: C(U.vestCol, 0.85), cap0: false, cap1: false }); // neck guard
      rbox(A, 'gear', 0.2, 0.17, 0.03, TM(0, 0.9, -0.122, 0.12), { b: HIPS, c: C(U.vestCol), seg: 8, n: 5 }); // groin plate
      for (const s of [-1, 1]) { shell(A, 'gear', [s * 0.214, 1.47, 0], [0.07, 0.05, 0.08], { rows: 5, seg: 8, b: armBase(s), c: C(U.vestCol) }); shell(A, 'gear', [s * 0.236, 1.36, 0], [0.034, 0.1, 0.064], { rows: 5, seg: 8, b: armBase(s), c: C(U.vestCol, 0.85) }); rbox(A, 'gear', 0.03, 0.22, 0.125, TM(s * 0.176, 0.72, 0), { b: legBase(s), c: C(U.vestCol, 0.85), seg: 8, n: 5 }); }
    }
  }
  /* ---- accessories (looks only): each sits at one of the attachment points ---- */
  if (S.acc && S.acc.length && L <= 1) {
    const has = (k) => S.acc.includes(k), arm = V === 'carrier' || V === 'flak' || V === 'float', zf = arm ? 0.168 : surfZ(1.3, 0) + 0.01, zb = V === 'carrier' ? 0.178 : arm ? 0.15 : 0.124;
    const pc = C(U.pouchCol ?? U.nat.pouch), dk = C(0x16181a), sg = hi ? 10 : 6, G = 'gear';
    if (has('tacpack')) { rbox(A, G, 0.27, 0.36, 0.14, TM(0, 1.29, zb + 0.07), { b: CHEST, c: pc, seg: sg, n: 4 }); rbox(A, G, 0.2, 0.15, 0.05, TM(0, 1.23, zb + 0.16), { b: CHEST, c: C(U.nat.web), seg: sg, n: 4 }); rbox(A, G, 0.25, 0.08, 0.1, TM(0, 1.49, zb + 0.055), { b: CHEST, c: C(U.nat.web), seg: sg, n: 3 }); }
    if (has('parachute')) { rbox(A, G, 0.31, 0.4, 0.11, TM(0, 1.26, zb + 0.055), { b: CHEST, c: C(0x4c4f3c), seg: sg, n: 4 }); rbox(A, G, 0.24, 0.1, 0.03, TM(0, 1.38, zb + 0.12), { b: CHEST, c: C(0x3a3d2e), seg: sg, n: 4 }); rbox(A, G, 0.035, 0.03, 0.02, TM(0.105, 1.34, -zf - 0.012), { b: CHEST, c: C(0xb32d24), seg: 6, n: 4 }); }
    if (has('oxygen') || has('dualoxygen')) {
      const dual = has('dualoxygen'), r = dual ? 0.056 : 0.07, tc = C(dual ? 0xc9b21e : 0x9aa0a6);
      for (const x of dual ? [-0.064, 0.064] : [0]) tube(A, G, [{ y: 1.07, rx: r * 0.75 }, { y: 1.1, rx: r }, { y: 1.43, rx: r }, { y: 1.47, rx: r * 0.6 }, { y: 1.5, rx: 0.018 }, { y: 1.525, rx: 0.024 }], { seg: sg, c: tc, b: CHEST, m: TM(x, 0, zb + r) });
      const hose = new THREE.TorusGeometry(0.15, 0.008, 5, 12, PI); addGeo(A, G, hose, TM(0.085, 1.41, 0.01, 0, PI / 2, 0), CHEST, dk); rbox(A, G, 0.05, 0.05, 0.03, TM(0.085, 1.4, -zf - 0.01), { b: CHEST, c: dk, seg: 6, n: 4 });
    }
    if (has('magpouches')) for (const [x, yaw] of arm ? [[-0.165, 0.9], [0.165, -0.9]] : [[-0.09, 0.3], [0, 0], [0.09, -0.3]]) tube(A, G, [R(1.148, 0.036, 0.022, [SPINE, CHEST, 0.5]), R(1.255, 0.037, 0.024, [SPINE, CHEST, 0.5]), R(1.262, 0.04, 0.028, [SPINE, CHEST, 0.5]), R(1.285, 0.039, 0.027, [SPINE, CHEST, 0.5])], { seg: 6, n: 4, c: pc, m: TM(x, 0, -(arm ? 0.085 : zf + 0.012 - Math.abs(x) * 0.12), 0, yaw, 0), a0: PI / 4 });
    if (has('radio')) { rbox(A, G, 0.055, 0.13, 0.04, TM(0.115, 1.37, -zf - 0.002, 0, -0.25, 0), { b: CHEST, c: dk, seg: sg, n: 5 }); addGeo(A, G, new THREE.CylinderGeometry(0.0025, 0.004, 0.42, 5), TM(0.13, 1.64, -zf + 0.02, 0.1, 0, -0.06), CHEST, C(0x0c0c0c)); }
    if (has('grenades')) for (const x of [-0.11, 0.11]) { addGeo(A, G, new THREE.SphereGeometry(0.031, 8, 6), TM(x, 1.2, -zf - 0.012 + Math.abs(x) * 0.12, 0, 0, 0, [1, 1.25, 1]), [SPINE, CHEST, 0.5], C(0x3f4a34)); rbox(A, G, 0.02, 0.03, 0.02, TM(x, 1.245, -zf - 0.012 + Math.abs(x) * 0.12), { b: [SPINE, CHEST, 0.5], c: C(0x8d9093), seg: 4, n: 4 }); }
    if (has('flaregun')) { rbox(A, G, 0.035, 0.13, 0.075, TM(-0.196, 0.93, -0.035, -0.1), { b: HIPS, c: dk, seg: sg, n: 4 }); rbox(A, G, 0.03, 0.07, 0.04, TM(-0.198, 1.03, -0.005, -0.4), { b: HIPS, c: C(0xe0641a), seg: 6, n: 4 }); }
    if (has('diveknife')) { rbox(A, G, 0.02, 0.2, 0.038, TM(-0.19, 0.9, 0.065, 0.1), { b: HIPS, c: dk, seg: 6, n: 4 }); rbox(A, G, 0.022, 0.09, 0.028, TM(-0.19, 1.04, 0.078, 0.1), { b: HIPS, c: C(0xc9b21e), seg: 6, n: 4 }); }
    if (has('sidearm')) { rbox(A, G, 0.036, 0.18, 0.09, TM(0.19, 0.77, 0.005), { b: LEG_R, c: dk, seg: sg, n: 4 }); rbox(A, G, 0.03, 0.075, 0.045, TM(0.192, 0.885, 0.03, -0.3), { b: LEG_R, c: C(0x0d0e0f), seg: 6, n: 4 }); tube(A, G, [R(0.79, 0.089, 0.094, LEG_R, { x: 0.094 }), R(0.765, 0.087, 0.092, LEG_R, { x: 0.094 })], { seg: lseg, c: dk, cap0: false, cap1: false }); }
    if (has('gasmask') && H !== 'diver' && H !== 'flight' && H !== 'heavy') {
      shell(A, G, [0, 1.648, -0.058], [0.066, 0.072, 0.062], { rows: 6, seg: sg, b: HEAD, c: C(0x1b1d1e) });
      for (const s of [-1, 1]) addGeo(A, 'glass', new THREE.SphereGeometry(0.023, 8, 6), TM(s * 0.031, 1.692, -0.092, 0, 0, 0, [1, 0.9, 0.5]), HEAD, WHITE);
      addGeo(A, G, new THREE.CylinderGeometry(0.036, 0.036, 0.05, 10), TM(-0.05, 1.622, -0.108, PI / 2, 0, 0.5), HEAD, C(0x33373a));
    }
    if (has('binoculars')) { for (const s of [-1, 1]) addGeo(A, G, new THREE.CylinderGeometry(0.02, 0.016, 0.11, 8), TM(s * 0.027, 1.32, -zf - 0.03), CHEST, dk); rbox(A, G, 0.03, 0.04, 0.02, TM(0, 1.33, -zf - 0.03), { b: CHEST, c: dk, seg: 6, n: 4 }); const st = new THREE.TorusGeometry(0.1, 0.004, 4, 14); addGeo(A, G, st, TM(0, 1.44, -0.03, 1.2, 0, 0, [0.9, 1.25, 1]), CHEST, dk); }
    if (has('kneepads') || has('padset')) for (const s of [-1, 1]) shell(A, G, [s * 0.094, 0.507, -0.058], [0.068, 0.086, 0.046], { rows: 5, seg: sg, th0: -1.75, th1: 1.75, p0: 0.25, p1: PI - 0.25, b: legBase(s) + 1, c: dk, center: [s * 0.094, 0.507, 0] });
    if (has('shoulderpads') || has('padset')) for (const s of [-1, 1]) { shell(A, G, [s * 0.212, 1.47, 0], [0.068, 0.048, 0.078], { rows: 5, seg: 8, b: armBase(s), c: dk }); shell(A, G, [s * 0.234, 1.385, 0], [0.032, 0.07, 0.06], { rows: 4, seg: 8, b: armBase(s), c: C(0x202326) }); }
    if (has('dogtags')) { const ch = new THREE.TorusGeometry(0.085, 0.002, 3, 14); addGeo(A, G, ch, TM(0, 1.46, -0.035, 1.15, 0, 0, [0.9, 1.3, 1]), CHEST, C(0xaeb3b8)); for (const dx of [-0.006, 0.008]) rbox(A, G, 0.018, 0.03, 0.003, TM(dx, 1.385, -zf - 0.004 - dx * 0.3, 0, 0, dx * 20), { b: CHEST, c: C(0xaeb3b8), seg: 4, n: 4 }); }
    if (has('chemlights')) { const CL = [0x55ff7a, 0xff9a2e, 0x4aa8ff]; for (let k = 0; k < 3; k++) addGeo(A, G, new THREE.CylinderGeometry(0.006, 0.006, 0.085, 6), TM(-0.125 + k * 0.017, 1.4, -zf * 0.93 + 0.004), CHEST, C(CL[k], 1.6)); rbox(A, G, 0.03, 0.022, 0.04, TM(0, 1.812, 0.06), { b: HEAD, c: dk, seg: 6, n: 4 }); }
  }
  if (S.prop === 'binoculars' && L <= 1) {
    for (const s of [-1, 1]) { const g = new THREE.CylinderGeometry(0.019, 0.015, 0.1, 8); addGeo(A, 'gear', g, TM(s * 0.032, 1.699, -0.15, PI / 2), HEAD, C(0x121314)); }
    rbox(A, 'gear', 0.03, 0.016, 0.04, TM(0, 1.699, -0.14), { b: HEAD, c: C(0x121314), seg: 6, n: 4 });
  }
  if (NEW) headFix(A, L >= 2);
  return A;
}

/* ------------------------------------------------------------------ rifle */
const RB = { butt: [0, 0.008, 0.306], muzzle: [0, 0.038, -0.632], eject: [0.024, 0.042, -0.06], sight: [0, 0.112, 0], wristR: [0.031, -0.0895, 0.123], wristL: [-0.05, -0.006, -0.262], mag: [0, 0, -0.105] };
const QGR = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.92, 0, 0)), QGL = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.75)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.45, PI / 2, 'YXZ')));
{ // left hand: palm against the lower left of the handguard, fingers wrapping under it, thumb along the side
  const n = new THREE.Vector3(1, 0, 0).applyQuaternion(QGL), f = new THREE.Vector3(0, -1, 0).applyQuaternion(QGL), w = new THREE.Vector3(0, 0.038, -0.3).addScaledVector(n, -0.044).addScaledVector(f, -0.076);
  RB.wristL = [w.x, w.y, w.z];
}
const RIFLE_GEO = {};
function rifleGeo(lod) {
  if (RIFLE_GEO[lod]) return RIFLE_GEO[lod];
  const A = new Acc(), M = new Acc(), G = 'gear', metal = C(0x2e3134), poly = C(0x3b3d3c), dark = C(0x151617), hi = lod === 0;
  const cylZ = (acc, r, z0, z1, x, y, col, seg = 8, r1 = r) => tube(acc, G, [{ y: z0, rx: r1 }, { y: z1, rx: r }], { seg, c: col, m: TM(x, y, 0, PI / 2, 0, 0) });
  if (lod >= 2) { rbox(A, G, 0.045, 0.09, 0.5, TM(0, 0.03, 0.05), { c: metal, seg: 4, n: 4 }); rbox(A, G, 0.02, 0.02, 0.45, TM(0, 0.038, -0.4), { c: metal, seg: 4, n: 4 }); rbox(M, G, 0.026, 0.17, 0.06, TM(0, -0.09, -0.11, -0.12), { c: poly, seg: 4, n: 4 }); }
  else {
    const sg = hi ? 12 : 6;
    rbox(A, G, 0.044, 0.074, 0.235, TM(0, 0.03, -0.055), { c: metal, seg: sg }); // receiver
    rbox(A, G, 0.038, 0.05, 0.072, TM(0, -0.022, -0.105), { c: metal, seg: sg }); // magazine well
    rbox(A, G, 0.032, 0.115, 0.044, TM(0, -0.058, 0.043, -0.33), { c: poly, seg: sg }); // pistol grip
    cylZ(A, 0.0145, 0.05, 0.275, 0, 0.04, metal, hi ? 8 : 5); // buffer tube
    rbox(A, G, 0.04, 0.086, 0.135, TM(0, 0.016, 0.215), { c: poly, seg: sg }); rbox(A, G, 0.043, 0.122, 0.036, TM(0, 0.002, 0.288), { c: poly, seg: sg }); // stock, butt pad
    tube(A, G, [{ y: -0.455, rx: 0.026 }, { y: -0.168, rx: 0.027 }], { seg: hi ? 10 : 6, n: 3, c: poly, m: TM(0, 0.038, 0, PI / 2, 0, 0) }); // handguard
    cylZ(A, 0.0085, -0.59, -0.45, 0, 0.038, metal, hi ? 8 : 5); cylZ(A, 0.0118, -0.632, -0.582, 0, 0.038, dark, hi ? 8 : 5); // barrel, muzzle device
    rbox(A, G, 0.021, 0.009, 0.5, TM(0, 0.0705, -0.21), { c: metal, seg: hi ? 8 : 4, n: 5 }); // top rail
    rbox(A, G, 0.03, 0.02, 0.058, TM(0, 0.084, -0.058), { c: metal, seg: sg }); // optic mount
    if (hi) {
      rbox(A, G, 0.011, 0.007, 0.062, TM(0, -0.048, -0.022), { c: metal, seg: 4, n: 4 }); rbox(A, G, 0.006, 0.026, 0.008, TM(0, -0.03, -0.012, 0.25), { c: dark, seg: 4, n: 4 }); // trigger guard, trigger
      for (let k = 0; k < 22; k++) rbox(A, G, 0.0215, 0.005, 0.0055, TM(0, 0.0765, -0.445 + k * 0.0215), { c: metal, seg: 4, n: 4 }); // rail teeth
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) rbox(A, G, 0.004, 0.009, 0.034, TM(s * 0.0258, 0.038, -0.215 - k * 0.062), { c: dark, seg: 4, n: 4 }); // handguard slots
      rbox(A, G, 0.003, 0.02, 0.054, TM(0.0222, 0.042, -0.06), { c: dark, seg: 4, n: 4 }); // ejection port
      rbox(A, G, 0.05, 0.008, 0.02, TM(0, 0.066, 0.058), { c: metal, seg: 4, n: 4 }); // charging handle
      rbox(A, G, 0.016, 0.03, 0.012, TM(0, 0.088, -0.425), { c: metal, seg: 4, n: 4 }); rbox(A, G, 0.018, 0.022, 0.012, TM(0, 0.084, 0.03), { c: metal, seg: 4, n: 4 }); // folded sights
      cylZ(A, 0.013, -0.49, -0.462, 0, 0.038, metal, 8); // gas block
      const ring = new THREE.LatheGeometry([[0.0185, 0], [0.0235, 0], [0.0245, 0.012], [0.0235, 0.024], [0.0235, 0.07], [0.0185, 0.07], [0.0185, 0]].map((p) => new THREE.Vector2(p[0], p[1])), 28);
      addGeo(A, G, ring, TM(0, 0.112, -0.022, -PI / 2, 0, 0), 0, metal); // optic body: a real tube you can look through
      addGeo(A, 'glass', new THREE.CircleGeometry(0.0185, 24), TM(0, 0.112, -0.088, 0, PI, 0), 0, WHITE);
    } else cylZ(A, 0.022, -0.092, -0.022, 0, 0.112, metal, 6);
    tube(M, G, [{ y: 0.005, rx: 0.0135, rz: 0.03, z: 0.005 }, { y: -0.09, rx: 0.0135, rz: 0.03, z: -0.004 }, { y: -0.185, rx: 0.0135, rz: 0.03, z: -0.026 }], { seg: hi ? 8 : 4, n: 5, c: poly, a0: PI / 4 }); // magazine (its own mesh so it can come out)
  }
  return (RIFLE_GEO[lod] = { body: finish(A, false), mag: finish(M, false) });
}
export function buildRifle(lod = 0) {
  const g = rifleGeo(clamp(lod | 0, 0, 2)), r = new THREE.Group(), mats = g.body.slots.map((k) => (k === 'glass' ? kit.glass('lens') : kit.rifle()));
  const body = new THREE.Mesh(g.body.geo, mats); body.castShadow = lod < 2; r.add(body);
  const mag = new THREE.Mesh(g.mag.geo, kit.rifle()); mag.position.set(...RB.mag); mag.castShadow = lod < 1; r.add(mag);
  r.userData = { mag, butt: new THREE.Vector3(...RB.butt), muzzle: new THREE.Vector3(...RB.muzzle), eject: new THREE.Vector3(...RB.eject), sight: new THREE.Vector3(...RB.sight), wristR: new THREE.Vector3(...RB.wristR), wristL: new THREE.Vector3(...RB.wristL), tris: g.body.tris + g.mag.tris };
  return r;
}

/* ============================================================ the figure */
const GEO = new Map();
function figureGeo(S) {
  const key = [S.nation, S.ukey, S.helmet, S.jersey || '', S.vest ? 1 : 0, S.prop || '', S.lod, S.parts || '', S.tintable ? 1 : 0, S.acc.join('+'), people.ready ? 's' + S.skin : ''].join('|');
  let g = GEO.get(key); if (!g) { g = finish(buildFigure(S), true); GEO.set(key, g); }
  return g;
}
function materialsFor(S, slots) { return slots.map((k) => (k === 'cloth' ? kit.cloth(S.nation, S.U.cloth) : k === 'gear' ? kit.gear() : k === 'skin' ? kit.skin(S.skin) : kit.glass('visor'))); }
const ATTACH = { head: [HEAD, 0, 1.705, 0.005], face: [HEAD, 0, 1.675, -0.1], back: [CHEST, 0, 1.3, 0.13], chest: [CHEST, 0, 1.3, -0.15], belt: [HIPS, 0, 1.02, 0], neck: [CHEST, 0, 1.47, -0.07], shoulderL: [ARM_L, -0.208, 1.468, 0], shoulderR: [ARM_R, 0.208, 1.468, 0], kneeL: [LEG_L + 1, -0.092, 0.505, -0.075], kneeR: [LEG_R + 1, 0.092, 0.505, -0.075] };
let SEED = 1;

export function buildSoldier(nation, opts = {}) {
  const role = ROLES[opts.role] ? opts.role : 'marine', RD = ROLES[role];
  // uniform and helmet are looked up by key, so new ones are only table entries (unknown keys wear the role's own)
  let ukey = UNIFORM_ALIAS[opts.uniform] || opts.uniform; if (!UNIFORMS[ukey]) ukey = RD.uniform;
  let helmet = HELMET_ALIAS[opts.helmet] || opts.helmet; if (!HELMETS.includes(helmet)) helmet = RD.helmet;
  const U = uniformDef(nation, ukey, opts), arms = opts.parts === 'arms';
  const base = { nation, U, ukey, helmet, jersey: ukey === 'jersey' ? opts.jersey || 'yellow' : '', vest: !!opts.vest, prop: opts.prop || RD.prop || '', acc: arms || !Array.isArray(opts.acc) ? [] : opts.acc.filter((k) => ACCESSORIES.includes(k)).sort(), parts: opts.parts || '', tintable: !!opts.tintable, skin: opts.skin ?? (SEED * 7) % SKIN.length };
  const root = new THREE.Group(), bones = [];
  for (let i = 0; i < NB; i++) { const d = SK[i], b = new THREE.Bone(); b.name = d[0]; const p = d[1]; if (p < 0) { b.position.set(d[2], d[3], d[4]); root.add(b); } else { b.position.set(d[2] - SK[p][2], d[3] - SK[p][3], d[4] - SK[p][4]); bones[p].add(b); } bones.push(b); }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones), lods = opts.lod !== undefined ? [opts.lod] : arms ? [-1] : [0, 1, 2], meshes = [], tris = [];
  for (const lod of lods) {
    const S = { ...base, lod }, g = figureGeo(S), m = new THREE.SkinnedMesh(g.geo, materialsFor(S, g.slots));
    m.bind(skeleton, new THREE.Matrix4()); m.castShadow = lod < 2 && !arms; m.receiveShadow = false; m.visible = meshes.length === 0; m.frustumCulled = !arms;
    m.boundingSphere = g.geo.boundingSphere.clone(); m.boundingBox = g.geo.boundingBox.clone();
    root.add(m); meshes.push(m); tris.push(g.tris);
  }
  const attach = {};
  for (const k in ATTACH) { const a = ATTACH[k], o = new THREE.Object3D(); o.name = 'attach_' + k; o.position.set(a[1] - SK[a[0]][2], a[2] - SK[a[0]][3], a[3] - SK[a[0]][4]); bones[a[0]].add(o); attach[k] = o; }
  let rifle = null, rifles = null;
  const wantRifle = opts.rifle !== undefined ? !!opts.rifle : !!RD.rifle;
  if (wantRifle && !arms) { rifle = new THREE.Group(); rifles = lods.map((l) => { const r = buildRifle(Math.max(0, l)); r.visible = false; rifle.add(r); return r; }); rifles[0].visible = true; rifle.userData = rifles[0].userData; root.add(rifle); }
  let shadow = null;
  if (!arms && opts.shadow !== false) { shadow = new THREE.Mesh(blobGeometry(), kit.blob()); shadow.scale.set(0.95, 1, 0.95); shadow.position.y = 0.015; shadow.renderOrder = 2; root.add(shadow); }
  const rig = { bones, skeleton, meshes, lods, tris, rifle, rifles, shadow, hasRifle: !!rifle, role, M: bones.map(() => new THREE.Matrix4()), w: {}, poses: {}, out: newPose(), t: -1e9, ph: (SEED * 0.37) % 6.28, seed: ((SEED * 0.618034) % 1), lod: 0, cur: '' };
  SEED++;
  root.userData.rig2 = rig; root.userData.attach = attach; root.userData.rifle = rifle; root.userData.shadow = shadow; root.userData.uniform = opts.uniform || ukey; root.userData.helmet = opts.helmet || helmet; root.userData.acc = base.acc;
  root.userData.tris = tris; root.userData.size = 2.6;
  if (!arms) animateSoldier(root, rifle ? 'idle' : 'stand', 0, 0, 0, { snap: true });
  return root;
}

/* ================================================================== poses */
const KEYS = ['hy', 'gnd', 'hx', 'hz', 'hrx', 'hry', 'hrz', 'srx', 'sry', 'srz', 'crx', 'cry', 'crz', 'nrx', 'nry', 'nrz', 'erx', 'ery', 'erz', 'ndy',
  'txL', 'tyL', 'tzL', 'knL', 'anL', 'txR', 'tyR', 'tzR', 'knR', 'anR',
  'axL', 'ayL', 'azL', 'elL', 'fwL', 'wxL', 'wzL', 'fcL', 'axR', 'ayR', 'azR', 'elR', 'fwR', 'wxR', 'wzR', 'fcR',
  'ikL', 'ikR', 'rpx', 'rpy', 'rpz', 'rrx', 'rry', 'rrz', 'sl', 'rv', 'lhx', 'lhy', 'lhz', 'mag', 'gk', 'glx', 'gly', 'glz', 'grx', 'gry', 'grz', 'ghx', 'shd'];
const DEF = { gnd: 1, tzL: 0.03, tzR: 0.03, knL: 0.04, knR: 0.04, tyL: 0.1, tyR: 0.1, axL: 0.03, axR: 0.03, azL: 0.13, azR: 0.13, elL: 0.22, elR: 0.22, fcL: 0.35, fcR: 0.35, rpx: 0.085, rpy: 0.235, rpz: -0.075, ghx: 1.57, shd: 1 };
function newPose() { const P = {}; for (const k of KEYS) P[k] = DEF[k] || 0; return P; }
function resetPose(P) { for (let i = 0; i < KEYS.length; i++) { const k = KEYS[i]; P[k] = DEF[k] || 0; } return P; }

// one walking / running cycle for both legs. ph: phase, A: thigh swing (rad), kb: standing knee bend, ks: extra bend in the swing
function legs(P, ph, A, kb, ks, bias = 0.05) {
  for (let k = 0; k < 2; k++) {
    const f = ph + (k ? PI : 0), s = Math.sin(f), c = Math.cos(f), sw = c > 0 ? c : 0;
    const tx = bias + A * s, kn = kb + ks * Math.pow(sw, 1.2) + (c < 0 && s > 0 ? 0.25 * A * s * -c : 0);
    let an = kn - tx; // foot level with the ground
    an += sw * (s < 0 ? 0.9 * s * A : 0.5 * s * A); // toes trail as the foot leaves, lift as it reaches forward
    if (c <= 0 && s < -0.5) an -= (-s - 0.5) * 1.4 * A; // heel peels off at the end of the stance
    if (k) { P.txR = tx; P.knR = kn; P.anR = an; } else { P.txL = tx; P.knL = kn; P.anL = an; }
  }
  P.hry = -0.16 * A * Math.sin(ph); P.sry = 0.1 * A * Math.sin(ph); P.hrz = 0.05 * A * Math.cos(ph);
}
function swingArms(P, ph, amp, bend = 0.25) {
  const s = Math.sin(ph);
  P.axL = -amp * s; P.axR = amp * s; P.elL = bend + 0.45 * amp * Math.max(0, -s) + 0.1; P.elR = bend + 0.45 * amp * Math.max(0, s) + 0.1; P.cry = -0.12 * amp * s;
}
function breathe(P, c) { const b = Math.sin(c.t * 1.5 + c.seed * 6); P.crx += b * 0.012; P.srx += b * 0.006; }
// rifle in the shoulder, pointing along the look pitch; the body bladed, left shoulder forward, cheek toward the stock
function aimUpper(P, pitch, blade = 1, low = 0) {
  const pc = clamp(pitch, -1.25, 1.25);
  P.hry += -0.26 * blade; P.sry += -0.08 * blade; P.cry += -0.1 * blade; P.nry = 0.18 * blade; P.ery = 0.26 * blade;
  P.srx += -0.08 + pc * 0.2; P.crx += -0.07 + pc * 0.18; P.nrx = pc * 0.22 - 0.1; P.erx = pc * 0.26 + 0.06; P.erz = -0.13; P.nrz = -0.06; P.ndy = -0.022;
  P.ikL = P.ikR = 1; P.rv = 1; P.rrx = pc - low; P.fcR = 1; P.fcL = 0.85;
}
const RATE = { walk: 9.7, run: 10.4, jog: 10.4, crouchwalk: 8.2, patrol: 8.3 };
const POSES = {
  stand(P, c) { // at ease: weight on one leg (which one differs from person to person), the other knee soft, arms hanging
    breathe(P, c); const k = c.seed > 0.5 ? 1 : -1, sw = Math.sin(c.t * 0.5 + c.seed * 6) * 0.012;
    P.hrz = 0.045 * k + sw; P.srz = -0.03 * k; P.crz = -0.025 * k; P.hx = 0.018 * k; P.hry = 0.06 * k; P.ery = Math.sin(c.t * 0.37 + c.seed * 9) * 0.28; P.erz = 0.02 * k;
    const bt = 0.17, bk = 0.3; if (k > 0) { P.txL = bt; P.knL = bk; P.tyL = 0.26; P.tzL = 0.085; P.tzR = -0.005; P.txR = -0.02; P.anL = 0.1; } else { P.txR = bt; P.knR = bk; P.tyR = 0.26; P.tzR = 0.085; P.tzL = -0.005; P.txL = -0.02; P.anR = 0.1; }
    P.azL = 0.1; P.azR = 0.1; P.elL = 0.2 + 0.05 * k; P.elR = 0.2 - 0.05 * k; P.axL = 0.04; P.axR = 0.04; P.fcL = P.fcR = 0.32;
  },
  patrol(P, c) { legs(P, c.ph, 0.34, 0.06, 0.95); swingArms(P, c.ph, 0.42); P.srx = -0.04; breathe(P, c); },
  jog(P, c) { legs(P, c.ph, 0.82, 0.22, 1.75, 0.16); swingArms(P, c.ph, 0.9, 1.3); P.srx = -0.2; P.crx = -0.08; P.azL = P.azR = 0.1; P.fcL = P.fcR = 1; },
  idle(P, c) { // low ready: weight on the right leg, left foot a little forward, the rifle angled down across the chest
    breathe(P, c);
    P.hrz = 0.04; P.srz = -0.025; P.crz = -0.02; P.hx = 0.016; P.hry = -0.16; P.sry = -0.05; P.cry = -0.06; P.ery = 0.22 + Math.sin(c.t * 0.4 + c.seed * 9) * 0.28; P.erx = 0.03;
    P.txL = 0.2; P.knL = 0.3; P.tyL = 0.2; P.tzL = 0.08; P.anL = 0.1; P.txR = -0.04; P.knR = 0.07; P.tzR = 0.0; P.tyR = 0.16;
    P.ikL = P.ikR = 1; P.rv = 1; P.rpx = 0.125; P.rpy = 0.118; P.rpz = -0.1; P.rrx = -0.6 + Math.sin(c.t * 1.5) * 0.008; P.rry = 0.78; P.rrz = 0.2; P.fcR = 1; P.fcL = 0.85;
  },
  aim(P, c) { breathe(P, c); P.txL = 0.3; P.knL = 0.34; P.txR = -0.16; P.knR = 0.24; P.tzL = P.tzR = 0.07; P.anL = 0.04; P.anR = 0.4; aimUpper(P, c.pitch); },
  walk(P, c) { legs(P, c.ph, 0.5, 0.2, 1.15, 0.1); aimUpper(P, c.pitch, 0.7, 0.06); P.hry -= c.strafe * 0.5; P.cry += c.strafe * 0.5; },
  run(P, c) { // rifle carried across the chest
    legs(P, c.ph, 0.86, 0.22, 1.8, 0.16); const s = Math.sin(c.ph);
    P.srx = -0.22; P.crx = -0.1; P.nrx = 0.12; P.erx = 0.12; P.cry = 0.14 * s;
    P.ikL = P.ikR = 1; P.rv = 1; P.rpx = 0.16; P.rpy = -0.05 + Math.abs(Math.cos(c.ph)) * 0.015; P.rpz = -0.13; P.rrx = 0.52 + 0.05 * Math.sin(c.ph * 2); P.rry = 0.95 + 0.14 * s; P.rrz = 0.25; P.fcR = 1; P.fcL = 0.85;
  },
  crouch(P, c) { // kneeling, right knee down
    breathe(P, c); P.txL = 1.42; P.knL = 1.85; P.anL = 0.42; P.txR = 0.22; P.knR = 1.75; P.anR = -0.2; P.tzL = 0.1; P.tzR = 0.05; P.srx = -0.1; aimUpper(P, c.pitch, 0.8);
  },
  crouchwalk(P, c) { legs(P, c.ph, 0.3, 1.85, 0.3, 1.12); P.srx = -0.28; P.crx = -0.1; aimUpper(P, c.pitch, 0.6, 0.04); P.nrx += 0.2; P.hry -= c.strafe * 0.4; P.cry += c.strafe * 0.4; },
  air(P, c) { // jumping or falling
    const up = clamp((c.ex.vy || 0) / 4, -1, 1), f = up < 0 ? -up : 0;
    P.gnd = 0; P.hy = 0.04; P.shd = 0; P.txL = 0.5 + 0.25 * up - 0.2 * f; P.knL = 0.95 + 0.3 * up - 0.5 * f; P.txR = 0.16 - 0.1 * f; P.knR = 0.6 - 0.25 * f; P.anL = P.anR = -0.35; P.srx = -0.08;
    aimUpper(P, c.pitch, 0.6, 0.25 - 0.35 * f); P.rpy += 0.02 * f;
  },
  swim(P, c) {
    const w = c.t * 3.1, s = Math.sin(w), k = Math.sin(w * 2.3);
    P.gnd = 0; P.shd = 0; P.hy = 0.02 + Math.sin(w) * 0.02; P.hz = 0.28; P.hrx = -1.12; P.srx = 0.08; P.crx = 0.1; P.nrx = 0.42; P.erx = 0.55;
    P.txL = -0.12 + k * 0.28; P.txR = -0.12 - k * 0.28; P.knL = 0.25 + Math.max(0, -k) * 0.4; P.knR = 0.25 + Math.max(0, k) * 0.4; P.anL = P.anR = -0.8;
    const st = (s + 1) / 2; // breaststroke: reach forward, sweep out and back
    P.axL = P.axR = 2.75 - 1.5 * sm(st); P.azL = P.azR = 0.15 + 0.95 * Math.sin(st * PI); P.elL = P.elR = 0.25 + 0.9 * Math.sin(st * PI); P.fcL = P.fcR = 0.1; P.sl = 1; P.rv = c.rifle ? 1 : 0;
  },
  sit(P, c) {
    breathe(P, c); P.txL = P.txR = 1.5; P.knL = P.knR = 1.5; P.tzL = P.tzR = 0.09; P.hrx = 0.07; P.shd = 0;
    if (c.role === 'pilot') { P.axR = 0.72; P.elR = 0.95; P.azR = 0.02; P.axL = 0.5; P.azL = 0.28; P.elL = 0.85; P.fcL = P.fcR = 1; } else { P.axL = P.axR = 0.42; P.elL = P.elR = 1.05; P.azL = P.azR = 0.08; P.fcL = P.fcR = 0.5; }
    P.ery = Math.sin(c.t * 0.3 + c.seed * 9) * 0.2;
  },
  gun(P, c) { // both hands on the spade grips of a pintle gun
    breathe(P, c); P.txL = 0.16; P.txR = -0.12; P.knL = 0.2; P.knR = 0.16; P.tzL = P.tzR = 0.12; P.anR = 0.28; P.srx = -0.14; P.crx = -0.06; P.nrx = 0.1; P.erx = 0.08;
    P.gk = 1; P.glx = -0.17; P.grx = 0.17; P.gly = P.gry = 1.1; P.glz = P.grz = -0.2; P.ghx = 1.75; P.fcL = P.fcR = 1.1; P.sl = 1; P.rv = c.rifle ? 1 : 0;
  },
  watch(P, c) { // binoculars up, slowly sweeping the horizon
    breathe(P, c); const sw = Math.sin(c.t * 0.22 + c.seed * 7) * 0.5;
    P.txL = 0.05; P.txR = -0.05; P.tzL = P.tzR = 0.08; P.sry = sw * 0.4; P.cry = sw * 0.4; P.nry = sw * 0.2; P.erx = 0.03;
    const y = 1.685, cs = Math.cos(sw), sn = Math.sin(sw), fx = -sn * 0.17, fz = -cs * 0.17;
    P.gk = 1; P.glx = fx - cs * 0.062; P.glz = fz + sn * 0.062; P.grx = fx + cs * 0.062; P.grz = fz - sn * 0.062; P.gly = P.gry = y; P.ghx = 2.75; P.fcL = P.fcR = 0.9;
  },
  signal(P, c) { // directing aircraft: come ahead, hold, arms out, back to rest
    breathe(P, c); const T = (c.t + c.seed * 9) % 11, a = sm(T / 0.6) * (1 - sm((T - 4.6) / 0.5)), b = sm((T - 5) / 0.6) * (1 - sm((T - 7.6) / 0.5)), d = sm((T - 8) / 0.5) * (1 - sm((T - 10.2) / 0.6));
    const wv = Math.sin(c.t * 5.2);
    P.txL = 0.06; P.txR = -0.06; P.tzL = P.tzR = 0.11; P.srx = -0.03;
    const ax = 0.03 + a * 2.55 + b * 0.05 + d * 2.9, az = 0.13 + a * 0.3 + b * 1.42 - d * 0.02, el = 0.22 + a * (0.95 + 0.55 * wv) + b * 0.08 + d * 0.5;
    P.axL = P.axR = ax; P.azL = P.azR = az; P.elL = P.elR = el; P.fcL = P.fcR = 0.2 + d * 0.9; P.erx = 0.05 * a;
  },
  work(P, c) { // kneeling at a deck fitting, hands busy
    const w = Math.sin(c.t * 2.2 + c.seed * 5);
    P.txL = 1.42; P.knL = 1.85; P.anL = 0.42; P.txR = 0.22; P.knR = 1.75; P.anR = -0.2; P.tzL = 0.1; P.srx = -0.42; P.crx = -0.22; P.nrx = 0.1; P.erx = -0.1;
    P.axL = 0.75 + w * 0.08; P.axR = 0.85 - w * 0.1; P.elL = 0.7 - w * 0.2; P.elR = 0.55 + w * 0.25; P.azL = P.azR = 0.05; P.fcL = P.fcR = 0.9;
  },
  dead(P, c) {
    const td = c.ex.dead ?? 9, front = c.seed > 0.6, u1 = sm(td / 0.38), u2 = sm((td - 0.16) / 0.62), mid = u1 * (1 - u2), sd = front ? -1 : 1;
    P.gnd = 1 - u2; P.hy = (0.125 - BASE) * u2; P.hz = sd * 0.72 * u2; P.hrx = sd * (front ? 1.47 : 1.5) * u2; P.hry = (c.seed - 0.5) * 0.5 * u2; P.shd = 1 - u2 * 0.4;
    P.txL = 0.75 * mid + (front ? -0.02 : 0.2) * u2; P.knL = 1.5 * mid + (front ? 0.08 : 0.42) * u2; P.txR = 0.55 * mid + 0.02 * u2; P.knR = 1.3 * mid + 0.06 * u2;
    P.tzL = 0.03 + 0.12 * u2; P.tzR = 0.03 + 0.2 * u2; P.tyL = 0.1 + 0.3 * u2; P.tyR = 0.1 + 0.5 * u2; P.anL = P.anR = (front ? -1.15 : -0.45) * u2 + 0.3 * mid;
    P.srx = -0.35 * mid + (front ? -0.03 : 0.04) * u2; P.crx = -0.2 * mid; P.nrx = 0.3 * mid; P.ery = (front ? 1.15 : 0.6) * u2 * (c.seed > 0.3 ? 1 : -1); P.erx = 0.12 * u2;
    if (front) { P.axL = 0.03 + 2.95 * u2; P.azL = 0.13 + 0.35 * u2; P.elL = 0.22 + 0.5 * u2 + 0.6 * mid; P.axR = 0.03 + 0.12 * u2 + 0.5 * mid; P.azR = 0.13 + 0.3 * u2; P.elR = 0.22 + 0.2 * u2; }
    else { P.axL = 0.03 - 0.08 * u2 - 0.5 * mid; P.azL = 0.13 + 0.85 * u2 + 0.4 * mid; P.elL = 0.22; P.axR = 0.03 - 0.06 * u2 - 0.3 * mid; P.azR = 0.13 + 0.42 * u2 + 0.5 * mid; P.elR = 0.22 + 0.25 * u2; }
    P.fcL = P.fcR = 0.45;
    if (c.rifle) { P.rv = 1; P.rpx = front ? 0.3 : 0.06; P.rpy = 0.1; P.rpz = front ? -0.02 : -0.165; P.rrx = 0; P.rry = 0.5 + c.seed; P.rrz = 1.45 * u1; }
  },
};

/* =============================================================== solving */
const _m1 = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _qe = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();
const QID = new THREE.Quaternion(), QSLUNG = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.42)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-PI / 2, 0, 0))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, PI)));
const FOOT_PTS = [[0, -SOLE, 0.082], [0, -SOLE, -0.214], [0.045, -SOLE, -0.12], [-0.045, -SOLE, -0.12]];
function fk(rig, from = 0, to = NB) { const b = rig.bones, M = rig.M; for (let i = from; i < to; i++) { const o = b[i]; o.updateMatrix(); const p = SK[i][1]; if (p < 0) M[i].copy(o.matrix); else M[i].multiplyMatrices(M[p], o.matrix); } }
// two-bone reach: turn the upper and lower arm so the wrist lands on `wrist` (model space) and the hand takes rotation `hq`
function armIK(rig, s, wrist, hq, w, poleX) {
  if (w <= 0.001) return;
  const ab = armBase(s), b = rig.bones, M = rig.M, U = b[ab], Lw = b[ab + 1], H = b[ab + 2];
  _qc.setFromRotationMatrix(M[CHEST]); // parent of the upper arm
  _a.setFromMatrixPosition(M[ab]); _d.copy(wrist).sub(_a); let dist = _d.length(); dist = clamp(dist, 0.1, L1 + L2 - 0.004); _d.normalize();
  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _p.set(poleX * s, -0.82, 0.3).applyQuaternion(_qc); _p.addScaledVector(_d, -_p.dot(_d)); if (_p.lengthSq() < 1e-6) _p.set(s, 0, 0); _p.normalize();
  _b.copy(_a).addScaledVector(_d, L1 * cosA).addScaledVector(_p, L1 * sinA); // elbow
  _w.copy(_a).addScaledVector(_d, dist); // wrist actually reached
  _x.crossVectors(_p, _d).normalize(); // elbow hinge
  _y.copy(_a).sub(_b).normalize(); _z.crossVectors(_x, _y); _m1.makeBasis(_x, _y, _z); _qa.setFromRotationMatrix(_m1); // upper arm, model space
  _y.copy(_b).sub(_w).normalize(); _z.crossVectors(_x, _y); _m1.makeBasis(_x, _y, _z); _qb.setFromRotationMatrix(_m1); // forearm, model space
  // let the forearm take most of the hand's twist, as a real one does
  _qd.copy(_qb).invert().multiply(hq); _qe.set(0, _qd.y, 0, _qd.w); if (_qe.lengthSq() > 1e-8) { _qe.normalize(); _qe.slerp(QID, 0.3); _qb.multiply(_qe); }
  _qd.copy(_qc).invert().multiply(_qa); U.quaternion.slerp(_qd, w);
  _qd.copy(_qa).invert().multiply(_qb); Lw.quaternion.slerp(_qd, w);
  _qd.copy(_qb).invert().multiply(hq); H.quaternion.slerp(_qd, w);
}
const _rq = new THREE.Quaternion(), _rp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hp = new THREE.Vector3();
function solve(rig, P) {
  const b = rig.bones, M = rig.M;
  b[HIPS].position.set(P.hx, BASE, P.hz); b[HIPS].rotation.set(P.hrx, P.hry, P.hrz); b[SPINE].rotation.set(P.srx, P.sry, P.srz); b[CHEST].rotation.set(P.crx, P.cry, P.crz);
  b[NECK].rotation.set(P.nrx, P.nry, P.nrz); b[NECK].position.y = SK[NECK][3] - SK[CHEST][3] + P.ndy; b[HEAD].rotation.set(P.erx, P.ery, P.erz);
  for (const s of [1, -1]) {
    const R = s > 0, lb = legBase(s), ab = armBase(s);
    b[lb].rotation.set(R ? P.txR : P.txL, -s * (R ? P.tyR : P.tyL), s * (R ? P.tzR : P.tzL)); b[lb + 1].rotation.set(-(R ? P.knR : P.knL), 0, 0); b[lb + 2].rotation.set(R ? P.anR : P.anL, 0, 0);
    b[ab].rotation.set(R ? P.axR : P.axL, s * (R ? P.ayR : P.ayL), s * (R ? P.azR : P.azL)); b[ab + 1].rotation.set(R ? P.elR : P.elL, R ? P.fwR : P.fwL, 0); b[ab + 2].rotation.set(R ? P.wxR : P.wxL, 0, s * (R ? P.wzR : P.wzL));
    const fc = R ? P.fcR : P.fcL; b[ab + 3].rotation.set(0, 0, -s * fc * 1.05); b[ab + 4].rotation.set(0, 0, -s * fc * 1.2); b[ab + 5].rotation.set(0.25 * fc, -s * 0.5 * fc, -s * 0.35 * fc);
  }
  fk(rig);
  // plant the lowest point of either foot (or knee) on the ground
  let low = 1e9;
  for (const s of [1, -1]) {
    const lb = legBase(s), F = M[lb + 2];
    for (const p of FOOT_PTS) { const y = _t.set(p[0], p[1], p[2]).applyMatrix4(F).y; if (y < low) low = y; }
    const ky = M[lb + 1].elements[13] - 0.062; if (ky < low) low = ky;
  }
  const dy = lerp(P.hy, -low, clamp(P.gnd, 0, 1));
  b[HIPS].position.y = BASE + dy; for (let i = 0; i < NB; i++) M[i].elements[13] += dy;
  // rifle and hands
  const rf = rig.rifle;
  if (rf) {
    const ud = rf.userData; _rq.setFromEuler(_e.set(P.rrx, P.rry, P.rrz, 'YXZ')); _e.order = 'XYZ';
    _rp.set(P.rpx, P.rpy, P.rpz).applyMatrix4(M[CHEST]); _t.copy(ud.butt).applyQuaternion(_rq); _rp.sub(_t);
    if (P.sl > 0.001) { _qc.setFromRotationMatrix(M[CHEST]).multiply(QSLUNG); _t.set(0.03, 0.12, 0.185).applyMatrix4(M[CHEST]); _rp.lerp(_t, P.sl); _rq.slerp(_qc, P.sl); }
    rf.position.copy(_rp); rf.quaternion.copy(_rq); rf.visible = P.rv > 0.5;
    const mg = ud.mag; if (mg) { mg.visible = P.mag < 0.5; mg.position.set(RB.mag[0] + P.mgx, RB.mag[1] + P.mgy, RB.mag[2] + P.mgz); }
    if (rig.rifles) for (const r of rig.rifles) if (r.userData.mag !== mg) { r.userData.mag.visible = mg.visible; }
  }
  const wr = Math.max(P.ikR, P.gk), wl = Math.max(P.ikL, P.gk);
  if (wr > 0.001 || wl > 0.001) {
    const g = P.gk / Math.max(1e-6, Math.max(P.ikR, P.ikL) + P.gk);
    _qc.setFromEuler(_e.set(P.ghx, 0, 0));
    if (rf) { _hp.copy(rf.userData.wristR).applyQuaternion(_rq).add(_rp); _hq.copy(_rq).multiply(QGR); } else { _hp.set(P.grx, P.gry, P.grz); _hq.copy(_qc); }
    if (g > 0) { _t.set(P.grx, P.gry, P.grz); _hp.lerp(_t, g); _hq.slerp(_qc, g); }
    _qc.copy(_hq); _t.copy(_hp); // armIK uses the scratch quaternions: hand the targets over in fresh ones
    armIK(rig, 1, IKP.copy(_t), IKQ.copy(_qc), wr, 0.32);
    _qc.setFromEuler(_e.set(P.ghx, 0, 0));
    if (rf) { _hp.copy(rf.userData.wristL); _hp.x += P.lhx; _hp.y += P.lhy; _hp.z += P.lhz; _hp.applyQuaternion(_rq).add(_rp); _hq.copy(_rq).multiply(QGL); } else { _hp.set(P.glx, P.gly, P.glz); _hq.copy(_qc); }
    if (g > 0) { _t.set(P.glx, P.gly, P.glz); _hp.lerp(_t, g); _hq.slerp(_qc, g); }
    armIK(rig, -1, IKP.copy(_hp), IKQ.copy(_hq), wl, 0.36);
  }
  if (rig.shadow) { rig.shadow.visible = P.shd > 0.3; rig.shadow.position.x = P.hx; rig.shadow.position.z = P.hz * 0.6; }
}
const IKP = new THREE.Vector3(), IKQ = new THREE.Quaternion();
KEYS.push('mgx', 'mgy', 'mgz');

// The reload, as fractions of its length: the left hand leaves the handguard, pulls the magazine, takes a fresh one from the
// belt, seats it and returns. Shared by the third-person figure and the first-person view so both match the reload time.
// out: lx, ly, lz = left wrist offset from its hold on the handguard (rifle space); mx, my, mz = magazine offset from the
// magazine well; mag = 0 in / attached to the hand, 1 = out of sight; tilt = how far the rifle is canted for the change.
const MAG_HOLD = [-0.046 - RB.wristL[0], -0.166 - RB.wristL[1], -0.094 - RB.wristL[2]], POUCH = [-0.15 - RB.wristL[0], -0.426 - RB.wristL[1], 0.068 - RB.wristL[2]];
export function reloadPose(r, out = {}) {
  r = clamp(r, 0, 1);
  const seg = (a, b) => sm((r - a) / (b - a)), toMag = seg(0.02, 0.14), pull = seg(0.14, 0.24), down = seg(0.24, 0.42), up = seg(0.54, 0.74), seat = seg(0.76, 0.84), back = seg(0.9, 1);
  const hold = toMag * (1 - back), away = down * (1 - up), pulled = pull * (1 - seat);
  out.lx = lerp(0, lerp(MAG_HOLD[0], POUCH[0], away), hold); out.ly = lerp(0, lerp(MAG_HOLD[1] - 0.13 * pulled, POUCH[1], away), hold); out.lz = lerp(0, lerp(MAG_HOLD[2], POUCH[2], away), hold);
  out.mx = lerp(0, POUCH[0] - MAG_HOLD[0], away); out.my = -0.13 * pulled + lerp(0, POUCH[1] - MAG_HOLD[1], away); out.mz = lerp(0, POUCH[2] - MAG_HOLD[2], away) - 0.02 * pulled;
  out.mag = away > 0.85 ? 1 : 0; out.tilt = seg(0, 0.12) * (1 - seg(0.88, 1)); out.grab = hold; out.tap = seg(0.84, 0.87) * (1 - seg(0.87, 0.92));
  return out;
}
const _rl = {};

/* ============================================================== animating */
export function animateSoldier(model, state, t = 0, moving = 0, pitch = 0, ex) {
  const rig = model.userData.rig2; if (!rig) return;
  ex = ex || NOEX;
  let dt = t - rig.t, snap = !!ex.snap; rig.t = t; if (dt < 0 || dt > 0.3) { snap = true; dt = 0; }
  const rf = rig.hasRifle; let st = state;
  if (st === 'crouch' && moving > 0.15) st = 'crouchwalk';
  if (!rf) { if (st === 'idle' || st === 'aim') st = 'stand'; else if (st === 'walk') st = 'patrol'; else if (st === 'run') st = 'jog'; else if (st === 'crouch' || st === 'crouchwalk') st = 'work'; else if (st === 'air') st = 'stand'; }
  if (!POSES[st]) st = rf ? 'idle' : 'stand';
  const W = rig.w;
  if (snap) { for (const k in W) delete W[k]; W[st] = 1; }
  else { const step = dt / (st === 'air' || rig.cur === 'air' ? 0.11 : st === 'dead' ? 0.14 : 0.2); if (W[st] === undefined) W[st] = 0; for (const k in W) { W[k] = k === st ? Math.min(1, W[k] + step) : W[k] - step; if (W[k] <= 0 && k !== st) delete W[k]; } }
  rig.cur = st;
  if (ex.phase !== undefined) rig.ph = ex.phase; else rig.ph += dt * (RATE[st] || 9) * (ex.back ? -1 : 1) * (st === 'patrol' ? 1 : clamp(moving * 1.2, 0.35, 1));
  CTX.t = t; CTX.ph = rig.ph; CTX.moving = moving; CTX.pitch = pitch || 0; CTX.ex = ex; CTX.seed = rig.seed; CTX.rifle = rf; CTX.role = rig.role; CTX.strafe = ex.strafe || 0;
  let sum = 0, n = 0, only = null; for (const k in W) { sum += W[k]; n++; only = k; }
  let P;
  if (n === 1) { P = rig.poses[only] || (rig.poses[only] = newPose()); resetPose(P); P.mgx = P.mgy = P.mgz = 0; POSES[only](P, CTX); }
  else {
    P = rig.out; for (let i = 0; i < KEYS.length; i++) P[KEYS[i]] = 0;
    for (const k in W) { const Q = rig.poses[k] || (rig.poses[k] = newPose()); resetPose(Q); Q.mgx = Q.mgy = Q.mgz = 0; POSES[k](Q, CTX); const w = sm(W[k] / sum); Q._w = w; }
    let ws = 0; for (const k in W) ws += rig.poses[k]._w;
    for (const k in W) { const Q = rig.poses[k], w = Q._w / ws; for (let i = 0; i < KEYS.length; i++) { const key = KEYS[i]; P[key] += Q[key] * w; } }
  }
  // overlays: the kick of a shot, a magazine change, the knees taking a landing
  if (rf && P.ikR > 0.5) {
    if (ex.fire !== undefined && ex.fire < 0.25) { const k = Math.exp(-ex.fire * 24); P.rpz += 0.02 * k; P.rrx += 0.03 * k; P.crx += 0.02 * k; P.erx -= 0.015 * k; }
    if (ex.reload !== undefined && ex.reload >= 0) { const q = reloadPose(ex.reload, _rl); P.lhx += q.lx; P.lhy += q.ly; P.lhz += q.lz; P.mgx = q.mx; P.mgy = q.my; P.mgz = q.mz; P.mag = q.mag; P.rrz -= 0.38 * q.tilt; P.rrx += 0.2 * q.tilt * (1 - clamp(P.rrx + 0.2, 0, 1)); P.rry += 0.22 * q.tilt; P.erx -= 0.2 * q.tilt; P.fcL = lerp(P.fcL, 0.7, q.grab); }
  }
  if (ex.land > 0.01 && P.gnd > 0.5) { const l = Math.min(1, ex.land); P.txL += 0.5 * l; P.txR += 0.42 * l; P.knL += 0.95 * l; P.knR += 0.85 * l; P.anL += 0.45 * l; P.anR += 0.43 * l; P.srx -= 0.18 * l; }
  solve(rig, P);
  // detail level by distance (closer levels are kept longer on higher quality presets)
  if (rig.lods.length > 1) {
    const d = ex.dist ?? 0, q = gfx.q ? gfx.q.lod : 1, l = d < 16 * q ? 0 : d < 60 * q ? 1 : 2;
    if (l !== rig.lod) { rig.lod = l; for (let i = 0; i < rig.meshes.length; i++) rig.meshes[i].visible = i === l; if (rig.rifles) { for (let i = 0; i < rig.rifles.length; i++) rig.rifles[i].visible = i === l; } }
  }
}
const NOEX = {}, CTX = {};

/* ============================================ first-person arms and baking */
// First-person view: the caller places model.userData.rifleFP (any Object3D holding the rifle) in the model's space;
// this reaches both arms to it. lh: left wrist offset in rifle space (reload), curl: finger curl.
export function holdRifle(model, rifle, lh, curlL = 0.85, curlR = 1) {
  const rig = model.userData.rig2, b = rig.bones; if (!rig) return;
  for (const s of [1, -1]) { const ab = armBase(s), fc = s > 0 ? curlR : curlL; b[ab].quaternion.identity(); b[ab + 1].quaternion.identity(); b[ab + 2].quaternion.identity(); b[ab + 3].rotation.set(0, 0, -s * fc * 1.05); b[ab + 4].rotation.set(0, 0, -s * fc * 1.2); b[ab + 5].rotation.set(0.25 * fc, -s * 0.5 * fc, -s * 0.35 * fc); }
  fk(rig); const ud = rifle.userData;
  _rq.copy(rifle.quaternion); _rp.copy(rifle.position);
  _hp.copy(ud.wristR).applyQuaternion(_rq).add(_rp); _hq.copy(_rq).multiply(QGR); armIK(rig, 1, IKP.copy(_hp), IKQ.copy(_hq), 1, 0.5);
  _hp.copy(ud.wristL); if (lh) _hp.add(lh); _hp.applyQuaternion(_rq).add(_rp); _hq.copy(_rq).multiply(QGL); armIK(rig, -1, IKP.copy(_hp), IKQ.copy(_hq), 1, 0.55);
}
// A posed figure frozen into ordinary geometry (for instanced crowds). Vertex colours carry skin, hair, boots and gear; the
// `tint` attribute marks the cloth a per-person colour may dye. Returns { geo, tris }.
export function bakeFigure(nation, opts, state, o = {}) {
  const fig = buildSoldier(nation, { ...opts, tintable: true, lod: o.lod ?? 1, shadow: false, rifle: false, skin: 0 }), rig = fig.userData.rig2;
  rig.seed = 0;
  animateSoldier(fig, state, o.t ?? 0, o.moving ?? 0, 0, { snap: true, phase: o.phase ?? 0 });
  fk(rig);
  const src = rig.meshes[0].geometry, pos = src.attributes.position, nor = src.attributes.normal, uv = src.attributes.uv, col = src.attributes.color, si = src.attributes.skinIndex, sw = src.attributes.skinWeight, n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(col.array), M = rig.M, v = new THREE.Vector3(), a = new THREE.Vector3(), nn = new THREE.Vector3(), an = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    a.set(0, 0, 0); an.set(0, 0, 0);
    for (let k = 0; k < 2; k++) { const w = sw.getComponent(i, k); if (w <= 0) continue; const bi = si.getComponent(i, k), d = SK[bi]; v.fromBufferAttribute(pos, i); v.x -= d[2]; v.y -= d[3]; v.z -= d[4]; v.applyMatrix4(M[bi]); a.addScaledVector(v, w); nn.fromBufferAttribute(nor, i).transformDirection(M[bi]); an.addScaledVector(nn, w); }
    an.normalize(); P[i * 3] = a.x; P[i * 3 + 1] = a.y; P[i * 3 + 2] = a.z; N[i * 3] = an.x; N[i * 3 + 1] = an.y; N[i * 3 + 2] = an.z;
  }
  // skin and visor have their own materials on a real figure; here they become plain colours
  const slots = rig.meshes[0].material, T = SKIN[0], NEWP = people.ready, tn = NEWP ? people.meta.tones[0] : null, skinC = NEWP ? tn.rgb.map((v) => Math.pow(v, 2.2)) : C(T.rgb), hairC = NEWP ? tn.hair.map((v) => Math.pow(v, 2.2)) : C(parseInt(T.hair.slice(1), 16)), idx = src.index;
  const tintA = src.attributes.tint.clone();
  src.groups.forEach((g) => {
    const name = slots[g.materialIndex].name; if (name.indexOf('hk_skin') && name.indexOf('hk_visor')) return;
    for (let k = g.start; k < g.start + g.count; k++) { const i = idx.getX(k); let c = name.indexOf('hk_visor') ? skinC : C(0x0b0c0d); if (c === skinC) { if (NEWP) { const f = tintA.getX(i); if (f > 0.5) c = hairC; tintA.setX(i, 0); } else { const u = uv.getX(i), vv = uv.getY(i); if (vv > 0.2 && vv > hairline((u - 0.5) * 360)) c = hairC; } } Cc[i * 3] = c[0]; Cc[i * 3 + 1] = c[1]; Cc[i * 3 + 2] = c[2]; }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', uv.clone()); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); g.setAttribute('tint', tintA);
  g.setIndex(idx.clone()); g.computeBoundingSphere();
  return { geo: g, tris: idx.count / 3 };
}
export { JERSEY, JERSEY_KEYS, NATION_KIT } from './humankit.js';
