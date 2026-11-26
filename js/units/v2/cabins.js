// Walk-in compartments for every ship that has no interior of its own (patrol boat, corvette, battlecruiser, carrier).
// They are inside the main deckhouse, at main-deck level: an open watertight door in the deckhouse wall leads through a
// short vestibule into a passage with compartments off it (mess, berthing, operations room, galley, workshop, stores).
// Nothing is cut out of the outside model: the doorway is a dark opening standing just proud of the wall, and the rooms
// are drawn only while the camera is at the ship (the same switch as the Super Destroyer's interior).
//
// addCabins(S) is called by finishShip() for the close-up model. It adds a group to S.g, walking surfaces, walls and crew
// posts to the model (all marked `in: 1`), carves the walk-in space out of the deckhouse's block, and sets
// model.interior = { group, mats, zones, hole } like js/units/v2/sdinterior.js.
import * as THREE from 'three';
import { Kit, tone, C } from './airkit.js';
import { interiorMats, minus, minusAll, signGeo } from './sdinterior.js';

const HP = Math.PI / 2, area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
const ROOMS = ['mess', 'ops', 'berth', 'galley', 'berth', 'workshop', 'store', 'office'];

export function addCabins(S) {
  const model = S.model, nation = S.nation, fine = S.fine;
  if (S.lod || model.interior || !model.blocks || !model.decks || !model.decks.length) return null;
  const main = model.decks.filter((d) => !d.in).sort((a, b) => area(b) - area(a))[0], y = main.y;
  const B = model.blocks.filter((b) => Math.abs(b.y0 - y) < 0.3 && b.y1 - b.y0 >= 1.95 && b.x1 - b.x0 >= 3.6 && b.z1 - b.z0 >= 6).sort((a, b) => area(b) - area(a))[0];
  if (!B) return null;
  const H = Math.min(2.35, B.y1 - y - 0.12), len = B.z1 - B.z0, iz = Math.min(2.8, Math.max(0.9, 0.05 * len + 0.6));
  let X0 = B.x0 + 0.62, X1 = B.x1 - 0.62, Z0 = B.z0 + iz, Z1 = B.z1 - iz;
  if (X1 - X0 > 16) { const c = (X0 + X1) / 2; X0 = c - 8; X1 = c + 8; }
  if (Z1 - Z0 > 42) { const c = (Z0 + Z1) / 2; Z0 = c - 21; Z1 = c + 21; }
  if (X1 - X0 < 2.6 || Z1 - Z0 < 4) return null;
  // the door: on the side with the wider deck beside it, where nothing else stands in the way
  const others = model.blocks.filter((b) => b !== B && b.y0 < y + 1.8 && b.y1 > y + 0.3);
  const free = (x, z) => x > main.x0 + 0.1 && x < main.x1 - 0.1 && z > main.z0 && z < main.z1 && !others.some((b) => x > b.x0 - 0.4 && x < b.x1 + 0.4 && z > b.z0 - 0.4 && z < b.z1 + 0.4);
  let door = null;
  const sides = [1, -1].sort((p, q) => (q > 0 ? main.x1 - B.x1 : B.x0 - main.x0) - (p > 0 ? main.x1 - B.x1 : B.x0 - main.x0));
  for (const s of sides) { const xw = s > 0 ? B.x1 : B.x0; for (const t of [0.5, 0.62, 0.38, 0.74, 0.26]) { const z = Z0 + (Z1 - Z0) * t; if (free(xw + s * 0.42, z) && free(xw + s * 0.42, z - 0.6) && free(xw + s * 0.42, z + 0.6)) { door = { s, xw, z }; break; } } if (door) break; }
  if (!door) return null;

  const M = interiorMats(nation), k = new Kit({ lod: 0, fine }), kl = new Kit({ lod: 0, fine }), g = new THREE.Group(); g.name = 'interior';
  const A = nation === 'aethia', T = (hex, m = 1) => tone(M.int, hex, m);
  const WALL = T(0xbfc7c2), DADO = T(0x73807f), FLOOR = T(0x3f474b), FLOOR2 = T(0x4e565b), CEIL = T(0x98a19e), FRAME = T(0x4a555d), STEEL = T(0x98a2a7), DARKS = T(0x23292e), YEL = T(0xc9a227), RED = T(0xa3382b), BLUE = T(0x2c6788), WOOD = T(0x7a5c3d),
    CLOTH = T(A ? 0x35527e : 0x7a4a33), BED = T(0xb9b7a6), GREEN = T(0x3f6a4a), SCREEN = T(0x58d6b4), SCREEN2 = T(0xd6a04a), BRASS = T(0xa78a43), WHITE = T(0xd8dcda), HAZ = T(0xd9b21c), PIPE = T(0xbfb48a), LOCK = T(0x5c6a72), DOOR = T(0x8d989c), BLK = T(0x16181a);
  const decks = [], blocks = [], posts = [];
  const deck = (x0, x1, z0, z1, yy = y) => decks.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y: yy, in: 1 });
  const block = (xa, xb, za, zb, y0 = y, y1 = y + H) => blocks.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), y0, y1, in: 1 });
  const post = (x, z, yaw, kind = 'in') => posts.push({ x, y, z, yaw, kind, in: 1 });
  const box = (c, xa, xb, ya, yb, za, zb, gr = null) => {
    if (Math.abs(xb - xa) < 0.002 || Math.abs(yb - ya) < 0.002 || Math.abs(zb - za) < 0.002) return;
    const geo = new THREE.BoxGeometry(Math.abs(xb - xa), Math.abs(yb - ya), Math.abs(zb - za));
    if (gr) { const p = geo.attributes.position, col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const v = p.getY(i) > 0 ? gr[1] : gr[0]; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    k.add(c, geo, (xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2);
  };
  const yb = (v) => y + v; // heights above the deck
  // a fluorescent fitting under the ceiling, its tube along `axis`
  const lamp = (x, z, axis = 'z') => { const lx = axis === 'x' ? 0.62 : 0.09, lz = axis === 'x' ? 0.09 : 0.62; box(FRAME, x - lx, x + lx, yb(H - 0.07), yb(H), z - lz, z + lz); kl.box(M.lamp, lx * 2 - 0.1, 0.035, lz * 2 - 0.1, x, yb(H - 0.085), z); if (fine) for (const q of [-0.8, 0.8]) box(STEEL, x + (axis === 'x' ? q * lx : 0) - 0.012, x + (axis === 'x' ? q * lx : 0) + 0.012, yb(H - 0.12), yb(H - 0.07), z + (axis === 'x' ? 0 : q * lz) - 0.012, z + (axis === 'x' ? 0 : q * lz) + 0.012); };
  // steel wall along z at x (axis 'z') or along x at z (axis 'x'), a0..a1, with door gaps [[g0, g1]]; face: which side shows stiffeners
  const wall = (axis, c, a0, a1, gaps = [], th = 0.08) => {
    const seg = (b0, b1, y0, y1, col, t = th, gr = null) => { if (b1 - b0 < 0.02) return; if (axis === 'x') box(col, b0, b1, y0, y1, c - t / 2, c + t / 2, gr); else box(col, c - t / 2, c + t / 2, y0, y1, b0, b1, gr); };
    const run = (b0, b1) => {
      if (b1 - b0 < 0.02) return;
      seg(b0, b1, yb(0), yb(0.95), DADO, th, [0.66, 0.98]); seg(b0, b1, yb(0.95), yb(H - 0.5), WALL, th, [0.9, 1.04]); seg(b0, b1, yb(H - 0.5), yb(H), WALL, th, [1.04, 0.8]); seg(b0, b1, yb(0), yb(0.09), FRAME, th + 0.03); seg(b0, b1, yb(0.93), yb(0.97), FRAME, th + 0.012);
      if (axis === 'x') block(b0, b1, c - 0.12, c + 0.12); else block(c - 0.12, c + 0.12, b0, b1);
      if (fine) for (let q = Math.ceil((b0 + 0.3) / 0.8) * 0.8; q < b1 - 0.25; q += 0.8) seg(q - 0.022, q + 0.022, yb(0.09), yb(H), DADO, th + 0.11, [0.7, 1.0]); // stiffeners
    };
    let at = a0;
    for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) {
      run(at, g0); at = g1;
      // watertight doorway: raised sill, heavy frame, the door swung back against the wall
      seg(g0, g1, yb(1.95), yb(H), WALL); seg(g0, g1, yb(0), yb(0.15), FRAME, th + 0.1); seg(g0, g1, yb(0.15), yb(0.165), HAZ, th + 0.1); seg(g0, g1, yb(1.9), yb(1.99), FRAME, th + 0.1);
      for (const e of [g0, g1]) seg(e - 0.045, e + 0.045, yb(0), yb(1.99), FRAME, th + 0.1);
      if (axis === 'x') deck(g0, g1, c - 0.11, c + 0.11, yb(0.15)); else deck(c - 0.11, c + 0.11, g0, g1, yb(0.15));
    }
    run(at, a1);
  };
  // the leaf of an open watertight door lying against a wall: hinge at (x, z), opening along +dir of `axis`, standing off by `off`
  const leaf = (axis, x, z, dir, off) => {
    const w = 0.78, a = axis === 'x' ? [x, x + dir * w, z + off - 0.022, z + off + 0.022] : [x + off - 0.022, x + off + 0.022, z, z + dir * w];
    box(DOOR, a[0], a[1], yb(0.17), yb(1.92), a[2], a[3]);
    const cx = axis === 'x' ? x + dir * w * 0.5 : x + off * 1.9, cz = axis === 'x' ? z + off * 1.9 : z + dir * w * 0.5;
    k.torus(BLK, 0.11, 0.014, cx, yb(1.05), cz, axis === 'x' ? null : [0, HP, 0], 12); // hand wheel
    if (fine) for (const v of [0.4, 1.05, 1.7]) for (const q of [0.08, 0.92]) { const px = axis === 'x' ? x + dir * w * q : x + off * 1.6, pz = axis === 'x' ? z + off * 1.6 : z + dir * w * q; box(FRAME, px - 0.03, px + 0.03, yb(v - 0.02), yb(v + 0.02), pz - 0.03, pz + 0.03); } // dogs
  };
  // a stencilled plate on a wall: face 'x+' / 'x-' / 'z+' / 'z-' is the way it looks
  const plate = (key, x, v, z, face, w = 0.46, h = 0.2) => k.add(M.signs, signGeo(key, w, h), x, yb(v), z, [0, face === 'x+' ? HP : face === 'x-' ? -HP : face === 'z-' ? Math.PI : 0, 0]);
  const sign = () => {};
  const KEY = { mess: 'mess', berth: 'berth', ops: 'ops', galley: 'galley', workshop: 'workshop', store: 'store', office: 'office', chart: 'ops' };

  /* ------------------------------------------------------------------ shell: floor, ceiling, outer walls, entry */
  const s = door.s, xw = door.xw, zd = door.z, Xd = s > 0 ? X1 : X0; // Xd: the interior's wall on the door side
  box(FLOOR, X0, X1, y + 0.005, y + 0.03, Z0, Z1); box(CEIL, X0, X1, yb(H), yb(H + 0.1), Z0, Z1); deck(X0, X1, Z0, Z1, y + 0.03);
  wall('x', Z0, X0, X1); wall('x', Z1, X0, X1); wall('z', s > 0 ? X0 : X1, Z0, Z1); wall('z', Xd, Z0, Z1, [[zd - 0.42, zd + 0.42]]);
  // vestibule between the deckhouse's skin and the inner wall
  box(FLOOR2, Xd, xw + s * 0.02, y + 0.005, y + 0.03, zd - 0.5, zd + 0.5); box(CEIL, Xd, xw + s * 0.02, yb(1.98), yb(2.06), zd - 0.5, zd + 0.5); deck(Xd - s * 0.2, xw + s * 0.3, zd - 0.42, zd + 0.42, y + 0.03);
  for (const q of [-1, 1]) { box(WALL, Xd, xw + s * 0.02, y, yb(2.0), zd + q * 0.46, zd + q * 0.54); block(Xd, xw - s * 0.05, zd + q * 0.42, zd + q * 0.6); }
  // outside: a framed open doorway standing just proud of the wall, sill, rain hood, the door folded back, a light
  const OK_ = S.k, MS = S.M.S, MD = S.M.SD || S.M.S, dark = C.dark, xo = xw + s * 0.06;
  OK_.add(tone((S.M.SD || S.M.S).m, 0x05070a), new THREE.PlaneGeometry(0.84, 1.8), xo, y + 0.15 + 0.9, zd, [0, s * HP, 0]);
  for (const q of [-1, 1]) OK_.box(MD, 0.34, 2.02, 0.09, xo - s * 0.12, y + 1.01, zd + q * 0.465);
  OK_.box(MD, 0.34, 0.09, 1.02, xo - s * 0.12, y + 1.995, zd); OK_.box(MD, 0.34, 0.15, 0.84, xo - s * 0.12, y + 0.075, zd); OK_.box(C.yellow, 0.345, 0.02, 0.84, xo - s * 0.12, y + 0.158, zd);
  OK_.box(MS, 0.42, 0.04, 1.3, xo + s * 0.08, y + 2.1, zd); // rain hood
  OK_.box(MS, 0.05, 1.74, 0.78, xo + s * 0.03, y + 1.05, zd + 0.93); OK_.torus(dark, 0.11, 0.014, xo + s * 0.07, y + 1.05, zd + 0.93, [0, HP, 0], 12);

  /* ------------------------------------------------------------------ plan */
  const W = X1 - X0, L = Z1 - Z0, wide = W >= 7.4, xc = (X0 + X1) / 2, rooms = []; // rooms: { x0, x1, z0, z1, wallSide: +1/-1 (which x side is the outer wall), aisle: [x0, x1] kept clear }
  const split = (z0, z1, max) => { const n = Math.max(1, Math.round((z1 - z0) / max)), out = []; for (let i = 0; i < n; i++) out.push([z0 + ((z1 - z0) * i) / n, z0 + ((z1 - z0) * (i + 1)) / n]); return out; };
  if (wide) {
    const cw = 0.68, far = -s; // central passage xc +- cw; a cross passage from the entry to it
    // door side: compartments forward and aft of the cross passage; far side: compartments all along
    const sideRooms = (sd, ranges) => { const gaps = []; for (const [a, b] of ranges) { if (b - a < 2.2) continue; const zm = (a + b) / 2, x0 = sd > 0 ? xc + cw : X0, x1 = sd > 0 ? X1 : xc - cw; rooms.push({ x0, x1, z0: a, z1: b, wallSide: sd, doorZ: zm, aisle: sd > 0 ? [x0, x0 + 1.0] : [x1 - 1.0, x1] }); gaps.push([zm - 0.4, zm + 0.4]); } return gaps; };
    const nearRanges = [...split(Z0, zd - 0.6, 7), ...split(zd + 0.6, Z1, 7)], farRanges = split(Z0, Z1, 7);
    const gN = sideRooms(s, nearRanges), gF = sideRooms(far, farRanges);
    wall('z', xc + s * cw, Z0, Z1, [...gN, [zd - 0.6, zd + 0.6]].sort((p, q) => p[0] - q[0])); wall('z', xc + far * cw, Z0, Z1, gF);
    // cross passage walls (from the inner outer wall to the central passage) and the bulkheads between compartments
    for (const q of [-1, 1]) wall('x', zd + q * 0.6, Math.min(xc + s * cw, Xd), Math.max(xc + s * cw, Xd));
    for (const r of rooms) if (r.z1 < Z1 - 0.1 && Math.abs(r.z1 - (zd - 0.6)) > 0.05) wall('x', r.z1, r.x0, r.x1);
    for (const r of rooms) { leaf('z', xc + r.wallSide * cw, r.doorZ + 0.42, 1, r.wallSide * -0.07); sign(xc + r.wallSide * (cw - 0.06), r.doorZ, 'x'); }
    // the passage: lines on the deck, pipes and a cable tray overhead, lamps, a fire point
    if (fine) for (const q of [-1, 1]) box(YEL, xc + q * (cw - 0.14) - 0.02, xc + q * (cw - 0.14) + 0.02, y + 0.03, y + 0.036, Z0 + 0.1, Z1 - 0.1);
    k.tube(RED, [xc - cw + 0.14, yb(H - 0.16), Z0 + 0.1], [xc - cw + 0.14, yb(H - 0.16), Z1 - 0.1], 0.045, 6); k.tube(BLUE, [xc - cw + 0.27, yb(H - 0.13), Z0 + 0.1], [xc - cw + 0.27, yb(H - 0.13), Z1 - 0.1], 0.035, 6); k.tube(PIPE, [xc - cw + 0.14, yb(H - 0.3), Z0 + 0.1], [xc - cw + 0.14, yb(H - 0.3), Z1 - 0.1], 0.03, 5);
    box(DARKS, xc + cw - 0.36, xc + cw - 0.1, yb(H - 0.2), yb(H - 0.17), Z0 + 0.1, Z1 - 0.1); if (fine) for (const q of [0.16, 0.22, 0.29]) k.tube(BLK, [xc + cw - q, yb(H - 0.15), Z0 + 0.1], [xc + cw - q, yb(H - 0.15), Z1 - 0.1], 0.014, 4);
    for (let z = Z0 + 1.6; z < Z1 - 1; z += 3.2) lamp(xc, z);
    lamp(xc + s * (Math.abs(Xd - xc) / 2 + cw / 2), zd, 'x');
    box(RED, xc - cw + 0.045, xc - cw + 0.2, yb(0.5), yb(1.05), Z0 + 1.0, Z0 + 1.2); k.cyl(RED, 0.2, 0.2, 0.1, xc + cw - 0.1, yb(1.25), Z1 - 1.2, 'x', 12); // extinguisher, hose reel
    post(xc + 0.2, (Z0 + zd) / 2, 0); if (L > 20) post(xc - 0.2, (zd + Z1) / 2 + 2, Math.PI);
  } else {
    // one compartment after another, doors on the centre line
    const cuts = split(Z0, Z1, 6.2); cuts.forEach(([a, b], i) => { rooms.push({ x0: X0, x1: X1, z0: a, z1: b, wallSide: 0, aisle: [xc - 0.55, xc + 0.55] }); if (i < cuts.length - 1) { wall('x', b, X0, X1, [[xc - 0.4, xc + 0.4]]); leaf('x', xc + 0.42, b, 1, -0.07); sign(xc, b - 0.06, 'z'); } });
    k.tube(RED, [X0 + 0.14, yb(H - 0.16), Z0 + 0.1], [X0 + 0.14, yb(H - 0.16), Z1 - 0.1], 0.04, 6); k.tube(PIPE, [X0 + 0.26, yb(H - 0.13), Z0 + 0.1], [X0 + 0.26, yb(H - 0.13), Z1 - 0.1], 0.03, 5);
    box(DARKS, X1 - 0.34, X1 - 0.1, yb(H - 0.2), yb(H - 0.17), Z0 + 0.1, Z1 - 0.1);
  }
  leaf('z', Xd, zd + 0.44, 1, -s * 0.07);
  plate('exit', Xd - s * 0.05, 2.1, zd, s > 0 ? 'x-' : 'x+'); plate('wtd', Xd - s * 0.1, 1.45, zd + 0.83, s > 0 ? 'x-' : 'x+', 0.4, 0.18);
  if (wide) { // along the passage: frame plates, a first-aid box, a telephone, junction boxes feeding the cable tray, valve wheels on the fire main
    const cw_ = 0.68, px = xc - cw_ + 0.045, sx = xc + cw_ - 0.045;
    plate('fire', px, 1.35, Z0 + 1.1, 'x+', 0.4, 0.18); plate('deck', sx, 1.6, Z0 + 0.9, 'x-', 0.5, 0.2);
    for (let z = Z0 + 3.5; z < Z1 - 2; z += 6.4) plate('frame', sx, 1.75, z, 'x-', 0.26, 0.13);
    box(WHITE, px, px + 0.1, yb(1.25), yb(1.6), Z1 - 2.4, Z1 - 2.05); plate('aid', px + 0.105, 1.425, Z1 - 2.225, 'x+', 0.32, 0.3);
    box(BLK, sx - 0.09, sx, yb(1.25), yb(1.6), Z1 - 3.4, Z1 - 3.2); box(BLK, sx - 0.13, sx - 0.09, yb(1.3), yb(1.55), Z1 - 3.34, Z1 - 3.26); plate('dc', px, 1.7, Z1 - 4.2, 'x+', 0.44, 0.2);
    if (fine) { for (let z = Z0 + 2.2; z < Z1 - 1; z += 4.8) { box(STEEL, sx - 0.09, sx, yb(1.5), yb(1.82), z - 0.14, z + 0.14); k.tube(BLK, [sx - 0.05, yb(1.82), z], [sx - 0.05, yb(H - 0.2), z], 0.016, 4); } for (let z = Z0 + 4; z < Z1 - 1; z += 7.3) k.torus(RED, 0.075, 0.012, xc - cw_ + 0.14, yb(H - 0.25), z, [HP, 0, 0], 10); }
  } else { plate('fire', X0 + 0.05, 1.35, Z0 + 0.6, 'x+', 0.4, 0.18); box(RED, X0 + 0.05, X0 + 0.2, yb(0.5), yb(1.05), Z0 + 0.5, Z0 + 0.7); plate('aid', X1 - 0.05, 1.5, Z1 - 0.6, 'x-', 0.3, 0.28); }

  /* ------------------------------------------------------------------ fitting out each compartment */
  // strips of a room that furniture may use: for a side room everything but the aisle; for a centre-line room both sides
  const kinds = rooms.length === 1 ? ['mess'] : rooms.length === 2 ? ['ops', 'mess'] : rooms.map((r, i) => ROOMS[i % ROOMS.length]);
  rooms.forEach((r, i) => {
    const kind = kinds[i], zm = (r.z0 + r.z1) / 2, strips = r.wallSide ? [{ x0: r.wallSide > 0 ? r.aisle[1] : r.x0 + 0.1, x1: r.wallSide > 0 ? r.x1 - 0.1 : r.aisle[0], side: r.wallSide }] : [{ x0: r.x0 + 0.1, x1: r.aisle[0], side: -1 }, { x0: r.aisle[1], x1: r.x1 - 0.1, side: 1 }];
    // keep the entry clear in the room the outside door opens into
    const z0 = r.z0 + 0.25, z1 = r.z1 - 0.25, entry = !wide && zd > r.z0 && zd < r.z1;
    if (wide && r.wallSide) plate(KEY[kind], xc + r.wallSide * (0.68 - 0.05), 2.1, r.doorZ, r.wallSide > 0 ? 'x-' : 'x+');
    else if (!wide && i > 0) plate(KEY[kind], xc, 2.1, r.z0 - 0.05, 'z-');
    lamp((r.x0 + r.x1) / 2, zm, r.x1 - r.x0 > r.z1 - r.z0 ? 'x' : 'z'); if (r.z1 - r.z0 > 6) lamp((r.x0 + r.x1) / 2, zm + (r.z1 - r.z0) * 0.3, 'x');
    if (r.wallSide) box(kind === 'mess' || kind === 'galley' ? FLOOR2 : FLOOR, r.x0, r.x1, y + 0.03, y + 0.034, r.z0, r.z1);
    const all = []; for (const st of strips) { all.push(st); const w = st.x1 - st.x0; if (w > 3.3) { const cut = st.side > 0 ? st.x1 - w * 0.5 : st.x0 + w * 0.5; all.push(st.side > 0 ? { x0: st.x0, x1: cut, side: st.side, row: 1 } : { x0: cut, x1: st.x1, side: st.side, row: 1 }); if (st.side > 0) st.x0 = cut + 0.95; else st.x1 = cut - 0.95; } }
    all.forEach((st, si) => {
      const w = st.x1 - st.x0; if (w < 0.55) return;
      const xo_ = st.side > 0 ? st.x1 : st.x0, inw = -st.side, X = (t) => xo_ + inw * t; // t metres in from the outer wall (or from the partition of a middle row)
      if (st.row) { box(LOCK, xo_ - 0.03, xo_ + 0.03, y, yb(1.55), z0 + 0.5, z1 - 0.5, [0.75, 1]); block(xo_ - 0.06, xo_ + 0.06, z0 + 0.5, z1 - 0.5, y, yb(1.6)); }
      let a = st.row ? z0 + 0.5 : z0, b = st.row ? z1 - 0.5 : z1; if (entry && st.side === s) { if (zd - z0 > z1 - zd) b = zd - 0.75; else a = zd + 0.75; } // the door-side strip stops short of the entry
      if (b - a < 0.9) return;
      const K = kind === 'mess' && si === 1 && !r.wallSide ? 'galley' : kind === 'ops' && si === 1 && !r.wallSide ? 'chart' : kind;
      if (K === 'mess') {
        // tables with fixed benches, bolted down
        const tw = Math.min(0.75, w - 0.5); if (tw < 0.4) { for (let z = a + 0.3; z < b - 0.3; z += 0.62) box(LOCK, X(0.02), X(0.5), y, yb(1.85), z - 0.28, z + 0.28); block(X(0), X(0.55), a, b, y, yb(1.9)); return; }
        for (let z = a + 0.95; z < b - 0.7; z += 1.9) {
          const x = X(0.12 + tw / 2 + 0.36); box(STEEL, x - tw / 2, x + tw / 2, yb(0.72), yb(0.76), z - 0.6, z + 0.6); box(FRAME, x - 0.04, x + 0.04, y, yb(0.72), z - 0.04, z + 0.04); box(FRAME, x - 0.16, x + 0.16, y + 0.03, y + 0.045, z - 0.16, z + 0.16);
          for (const q of [-1, 1]) { const bx = x + q * (tw / 2 + 0.2); if (q * inw > 0 && w < tw + 1.0) continue; box(CLOTH, bx - 0.15, bx + 0.15, yb(0.42), yb(0.47), z - 0.6, z + 0.6); for (const e of [-0.5, 0.5]) box(FRAME, bx - 0.03, bx + 0.03, y, yb(0.42), z + e - 0.03, z + e + 0.03); }
          block(x - tw / 2 - 0.36, x + tw / 2 + (w < tw + 1.0 ? 0 : 0.36), z - 0.62, z + 0.62, y, yb(0.9));
          if (fine) { box(WHITE, x - 0.1, x + 0.1, yb(0.76), yb(0.775), z - 0.32, z - 0.12); k.cyl(RED, 0.035, 0.035, 0.12, x + 0.05, yb(0.82), z + 0.3, 'y', 8); }
        }
        box(GREEN, X(0.045), X(0.06), yb(1.2), yb(1.75), a + 0.3, Math.min(b - 0.3, a + 1.3)); // notice board
        post(X(0.12 + tw + 0.9), Math.min(b - 0.5, a + 1.0), st.side > 0 ? HP : -HP);
      } else if (K === 'berth') {
        // three-high racks with curtains and reading lights, lockers at the end
        const d = Math.min(0.8, w - 0.1);
        for (let z = a + 1.05; z + 1.0 < b + 0.05; z += 2.08) {
          for (const fy of [0.3, 0.98, 1.66]) { box(FRAME, X(0.03), X(d), yb(fy - 0.04), yb(fy), z - 1.0, z + 1.0); box(BED, X(0.05), X(d - 0.03), yb(fy), yb(fy + 0.09), z - 0.96, z + 0.96); box(WHITE, X(0.07), X(d - 0.08), yb(fy + 0.09), yb(fy + 0.14), z + 0.62, z + 0.92); if (fine) { box(CLOTH, X(d - 0.012), X(d + 0.012), yb(fy + 0.1), yb(fy + 0.6), z - 0.96, z - 0.2); box(WHITE, X(0.05), X(0.08), yb(fy + 0.42), yb(fy + 0.47), z + 0.5, z + 0.7); } }
          for (const e of [-1.0, 1.0]) box(FRAME, X(d - 0.03), X(d + 0.02), y, yb(2.2), z + e - 0.025, z + e + 0.025);
          block(X(0), X(d + 0.05), z - 1.02, z + 1.02, y, yb(2.25));
        }
        const rem = (b - a) % 2.08; if (rem > 0.75) { for (let z = b - rem + 0.42; z < b - 0.2; z += 0.6) box(LOCK, X(0.03), X(0.5), y, yb(1.85), z - 0.27, z + 0.27); block(X(0), X(0.55), b - rem + 0.1, b, y, yb(1.9)); }
        if (si === 0) post(X(Math.min(w - 0.1, d + 0.5)), (a + b) / 2, st.side > 0 ? HP : -HP);
      } else if (K === 'ops' || K === 'chart') {
        // consoles with screens along the wall, chairs bolted on pedestals; the other side a chart table
        if (K === 'chart') { const cl = Math.min(1.8, b - a - 0.4), cz = (a + b) / 2; box(WOOD, X(0.05), X(Math.min(0.85, w)), yb(0.88), yb(0.93), cz - cl / 2, cz + cl / 2); box(FRAME, X(0.07), X(Math.min(0.8, w - 0.05)), y, yb(0.88), cz - cl / 2 + 0.05, cz + cl / 2 - 0.05); box(SCREEN, X(0.15), X(Math.min(0.75, w - 0.1)), yb(0.93), yb(0.936), cz - cl / 2 + 0.15, cz + cl / 2 - 0.15); block(X(0), X(Math.min(0.9, w)), cz - cl / 2, cz + cl / 2, y, yb(1.0)); post(X(Math.min(w, 1.3)), cz, st.side > 0 ? HP : -HP); return; }
        for (let z = a + 0.6; z < b - 0.45; z += 1.15) {
          box(DARKS, X(0.04), X(0.62), y, yb(0.78), z - 0.52, z + 0.52); box(DARKS, X(0.04), X(0.3), yb(0.78), yb(1.5), z - 0.52, z + 0.52); box((Math.round(z * 3) & 1) ? SCREEN : SCREEN2, X(0.3), X(0.312), yb(0.95), yb(1.4), z - 0.38, z + 0.38);
          if (fine) { box(BLK, X(0.36), X(0.6), yb(0.78), yb(0.795), z - 0.3, z + 0.3); for (const q of [-0.42, 0.42]) box(RED, X(0.3), X(0.31), yb(0.83), yb(0.87), z + q - 0.03, z + q + 0.03); }
          if (w > 1.45) { const cx = X(1.05); k.cyl(FRAME, 0.04, 0.16, 0.42, cx, yb(0.21), z, 'y', 8); box(CLOTH, cx - 0.2, cx + 0.2, yb(0.42), yb(0.5), z - 0.2, z + 0.2); box(CLOTH, cx - inw * 0.2 - 0.025, cx - inw * 0.2 + 0.025, yb(0.5), yb(0.98), z - 0.2, z + 0.2); }
        }
        block(X(0), X(0.66), a + 0.05, b - 0.05, y, yb(1.55)); box(BLUE, X(0.045), X(0.06), yb(1.62), yb(2.05), a + 0.3, b - 0.3); // status board over the consoles
        post(X(Math.min(w, 1.5) - 0.05), (a + b) / 2 + 0.58, st.side > 0 ? HP : -HP);
      } else if (K === 'galley') {
        const d = Math.min(0.62, w - 0.05); box(STEEL, X(0.03), X(d), y, yb(0.9), a + 0.1, b - 0.1); box(DARKS, X(0.03), X(d + 0.02), yb(0.9), yb(0.93), a + 0.1, b - 0.1); block(X(0), X(d + 0.04), a, b, y, yb(1.0));
        if (fine) { for (let z = a + 0.5; z < b - 0.4; z += 0.9) { k.cyl(BLK, 0.13, 0.13, 0.012, X(d / 2), yb(0.936), z, 'y', 12); if ((Math.round(z * 2) & 1) === 0) k.cyl(STEEL, 0.12, 0.11, 0.16, X(d / 2), yb(1.02), z, 'y', 12); } box(FRAME, X(0.03), X(0.34), yb(1.5), yb(1.53), a + 0.2, b - 0.2); for (let z = a + 0.45; z < b - 0.3; z += 0.5) box((Math.round(z * 4) & 1) ? WHITE : BRASS, X(0.08), X(0.28), yb(1.53), yb(1.7), z - 0.12, z + 0.12); }
        post(X(d + 0.5), (a + b) / 2, st.side > 0 ? HP : -HP, 'work');
      } else if (K === 'workshop') {
        const d = Math.min(0.7, w - 0.05); box(WOOD, X(0.03), X(d), yb(0.86), yb(0.92), a + 0.15, b - 0.15); for (let z = a + 0.25; z < b - 0.2; z += 1.2) box(FRAME, X(0.06), X(d - 0.04), y, yb(0.86), z - 0.04, z + 0.04); block(X(0), X(d + 0.04), a + 0.1, b - 0.1, y, yb(1.0));
        box(DARKS, X(0.045), X(0.06), yb(1.1), yb(1.9), a + 0.3, b - 0.3); if (fine) { for (let z = a + 0.5; z < b - 0.4; z += 0.28) box([RED, STEEL, YEL, BLUE][Math.abs(Math.round(z * 7)) % 4], X(0.06), X(0.075), yb(1.25), yb(1.25 + 0.2 + (Math.abs(Math.round(z * 13)) % 4) * 0.1), z - 0.025, z + 0.025); box(STEEL, X(d - 0.3), X(d - 0.1), yb(0.92), yb(1.06), a + 0.5, a + 0.72); k.cyl(GREEN, 0.07, 0.09, 0.5, X(d / 2), yb(1.17), b - 0.6, 'y', 8); }
        post(X(d + 0.5), (a + b) / 2, st.side > 0 ? HP : -HP, 'work');
      } else if (K === 'store') {
        const d = Math.min(0.6, w - 0.05);
        for (const fy of [0.12, 0.75, 1.38]) { box(FRAME, X(0.03), X(d), yb(fy), yb(fy + 0.04), a + 0.1, b - 0.1); for (let z = a + 0.35; z < b - 0.3; z += 0.62) { const hh = 0.28 + (Math.abs(Math.round(z * 5 + fy * 7)) % 3) * 0.08; box([GREEN, WOOD, LOCK, T(0x56633f)][Math.abs(Math.round(z * 3 + fy * 11)) % 4], X(0.07), X(d - 0.05), yb(fy + 0.04), yb(fy + 0.04 + hh), z - 0.25, z + 0.25); } }
        for (let z = a + 0.1; z <= b - 0.09; z += Math.max(0.8, (b - a - 0.2) / Math.max(1, Math.round((b - a) / 1.4)))) box(FRAME, X(d - 0.04), X(d), y, yb(1.95), z - 0.02, z + 0.02);
        block(X(0), X(d + 0.04), a, b, y, yb(2));
      } else if (K === 'office') {
        const cz = (a + b) / 2, dl = Math.min(1.5, b - a - 0.3), d = Math.min(0.7, w - 0.05); box(STEEL, X(0.04), X(d), yb(0.72), yb(0.76), cz - dl / 2, cz + dl / 2); box(LOCK, X(0.06), X(d - 0.04), y, yb(0.72), cz - dl / 2, cz - dl / 2 + 0.42); box(FRAME, X(0.1), X(0.16), y, yb(0.72), cz + dl / 2 - 0.08, cz + dl / 2 - 0.02); block(X(0), X(d + 0.04), cz - dl / 2, cz + dl / 2, y, yb(0.9));
        if (fine) { box(DARKS, X(0.1), X(0.14), yb(0.76), yb(1.12), cz - 0.25, cz + 0.25); box(SCREEN, X(0.14), X(0.146), yb(0.8), yb(1.08), cz - 0.21, cz + 0.21); }
        for (let z = a + 0.3; z < cz - dl / 2 - 0.3; z += 0.5) box(LOCK, X(0.04), X(0.5), y, yb(1.35), z - 0.23, z + 0.23);
        post(X(d + 0.45), cz, st.side > 0 ? HP : -HP);
      }
    });
  });

  k.build(g, { cast: false, receive: false }); kl.build(g, { cast: false, receive: false });
  g.visible = false; S.g.add(g);
  // the walk-in space is cut out of the deckhouse's block (its skin stays solid), with a way in at the door
  const inner = { x0: X0 + 0.02, x1: X1 - 0.02, z0: Z0 + 0.02, z1: Z1 - 0.02 }, way = { x0: Math.min(xw, Xd) - 0.9, x1: Math.max(xw, Xd) + 0.9, z0: zd - 0.44, z1: zd + 0.44 };
  const i = model.blocks.indexOf(B); model.blocks.splice(i, 1, ...minusAll(minus(B, inner), [way]));
  model.decks.push(...decks); model.blocks.push(...blocks); model.posts.push(...posts);
  const zones = [{ x0: X0 - 0.1, x1: X1 + 0.1, z0: Z0 - 0.1, z1: Z1 + 0.1, y0: y - 0.2, y1: y + H + 0.15 }, { x0: Math.min(xw, Xd) - 0.05, x1: Math.max(xw, Xd) + 0.05, z0: zd - 0.5, z1: zd + 0.5, y0: y - 0.2, y1: y + 2.1 }];
  model.interior = { group: g, mats: M, zones, hole: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, door: { x: xw + s * 0.9, y, z: zd, side: s }, rooms: rooms.length };
  return model.interior;
}
