// Marine collision check (developer tool, runs in the browser on a ?devtest page).
//
// For every ship, both submarines and the five islands, a marine is walked straight at every solid thing from several
// directions and the check reports how many walks went THROUGH it. "Solid things" are found from the drawn geometry, not
// from the collision lists, so the check also finds things that have no collision at all:
//   ships: the model's triangles are cut at chest height (1.3 m) above every outside deck; the joined-up cuts wider than
//          0.6 m are the obstacles (turrets, mounts, launchers, deckhouse walls, funnels, mast feet ...). Each one is
//          approached at points 3 m apart along it from 8 directions (2.6 m out), and end-on from its four sides; a walk
//          passed through if the marine's path crosses a triangle of that obstacle at 1.0 m or 1.5 m above the feet.
//          A walk only starts where a marine could stand under the old rules too (on a deck at that level, not in or
//          against a typed-in box, not touching geometry, not shut inside a hollow), so before and after walk the same walks.
//   islands: the concrete bunkers (their mesh boxes) from 8 directions and up to 10 trees per island from 4 directions.
// The doors: every walk-in deckhouse door (in and back out) and the Super Destroyer's hatchway down from the helipad.
// Also: crew posts and spawn spots standing inside something solid, and every gun a marine can man (reach it, take it,
// leave it, walk away).
//
//   const c = await import('/steel-tide/tools/tests/clipcheck.js');
//   c.ship('corvette')          -> { walks, through, obstacles, passable, worst: [...] }   ({ run: 1 } sprints, { jump: 1 } jumps all the way)
//   c.island(0)                 -> { walks, through, ... }
//   c.doors('patrol')           -> [{ what, ok }]
//   c.seats('battlecruiser')    -> { guns, reach, take, leave }
//   c.posts('carrier')          -> { posts, inside: [...], spotsIn, floorsShut: [...] }
//   c.explain / c.list / c.trace / c.rays: what an obstacle is made of, the obstacles, one walk point by point
//   c.before(() => c.ship('corvette'))   the same with the old collision (boxes typed into the models only)
// Keep each call to one ship: a single long script can close the tab.
import * as THREE from 'three';
import { createUnit } from '../../js/sim/factory.js';
import { deckUnder, blocked, collide } from '../../js/sim/surface.js';
import { world } from '../../js/world/world.js';

const DT = 1 / 30, CELL = 0.5, GRID = 1.0, CHEST = 1.3;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _t = new THREE.Vector3();
const ships = new Map(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3();

// ---- geometry: every triangle of the outside model, in the ship's own frame, filed in a 1 m grid ---------------------------
function triangles(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), out = [], m = new THREE.Matrix4(), v = new THREE.Vector3();
  const owners = []; // which mesh each triangle came from (for explaining a result)
  const walk = (o) => {
    if (!o.visible) return; // the interior and the first-person bridge are hidden groups: rooms are checked by doors()
    if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.attributes.position) {
      m.multiplyMatrices(inv, o.matrixWorld); const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m); out.push(v.x, v.y, v.z); if (i % 3 === 0) owners.push(o); }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  const T = new Float32Array(out); T.owners = owners;
  return T;
}
const key = (ix, iz) => (ix + 4000) * 8000 + (iz + 4000);
function fileTris(T) {
  const g = new Map();
  for (let t = 0; t < T.length; t += 9) {
    const x0 = Math.floor(Math.min(T[t], T[t + 3], T[t + 6]) / GRID), x1 = Math.floor(Math.max(T[t], T[t + 3], T[t + 6]) / GRID);
    const z0 = Math.floor(Math.min(T[t + 2], T[t + 5], T[t + 8]) / GRID), z1 = Math.floor(Math.max(T[t + 2], T[t + 5], T[t + 8]) / GRID);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4000) continue; // a whole-deck plate: never in the way at chest height
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const k = key(ix, iz); let l = g.get(k); if (!l) g.set(k, (l = [])); l.push(t); }
  }
  return g;
}
// segment a -> b against triangle t: the distance along (0..1) or -1
function segTri(T, t, a, b) {
  _p.set(T[t], T[t + 1], T[t + 2]); _e1.set(T[t + 3], T[t + 4], T[t + 5]).sub(_p); _e2.set(T[t + 6], T[t + 7], T[t + 8]).sub(_p);
  _b.copy(b).sub(a); _q.crossVectors(_b, _e2); const det = _e1.dot(_q); if (Math.abs(det) < 1e-10) return -1;
  const f = 1 / det; _t.copy(a).sub(_p); const u = f * _t.dot(_q); if (u < 0 || u > 1) return -1;
  _t.cross(_e1); const w = f * _b.dot(_t); if (w < 0 || u + w > 1) return -1;
  const s = f * _e2.dot(_t); return s >= 0 && s <= 1 ? s : -1;
}
// the triangles the segment a -> b crosses (indices), from the grid
function crossings(S, a, b, out) {
  const x0 = Math.floor(Math.min(a.x, b.x) / GRID), x1 = Math.floor(Math.max(a.x, b.x) / GRID), z0 = Math.floor(Math.min(a.z, b.z) / GRID), z1 = Math.floor(Math.max(a.z, b.z) / GRID);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const l = S.grid.get(key(ix, iz)); if (l) for (const t of l) if (segTri(S.T, t, a, b) >= 0) out.add(t); }
  return out;
}

// ---- obstacles: the chest-height cut through the model above each outside deck, joined up into pieces --------------------
function obstacles(S) {
  const T = S.T, m = S.ship.model, levels = [...new Set(m.decks.filter((d) => !d.in).map((d) => Math.round(d.y * 100) / 100))], list = [];
  const intr = m.interior && m.interior.door ? m.interior.door : null;
  for (const y of levels) {
    const h = y + CHEST, cells = new Map(), decks = m.decks.filter((d) => !d.in && Math.abs(d.y - y) < 0.011);
    const onDeck = (x, z) => decks.some((d) => x > d.x0 - 0.3 && x < d.x1 + 0.3 && z > d.z0 - 0.3 && z < d.z1 + 0.3);
    for (let t = 0; t < T.length; t += 9) {
      const ya = T[t + 1], yb = T[t + 4], yc = T[t + 7]; if (Math.min(ya, yb, yc) > h || Math.max(ya, yb, yc) < h) continue;
      // the cut of this triangle by the plane y = h: two points
      const pts = [];
      for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) { const y0 = T[t + i + 1], y1 = T[t + j + 1]; if ((y0 - h) * (y1 - h) > 0 || y0 === y1) continue; const f = (h - y0) / (y1 - y0); pts.push([T[t + i] + (T[t + j] - T[t + i]) * f, T[t + i + 2] + (T[t + j + 2] - T[t + i + 2]) * f]); }
      if (pts.length < 2) continue;
      const [p0, p1] = pts, n = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / (CELL * 0.5)));
      for (let k = 0; k <= n; k++) { const x = p0[0] + ((p1[0] - p0[0]) * k) / n, z = p0[1] + ((p1[1] - p0[1]) * k) / n; if (!onDeck(x, z)) continue; const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL), c = key(ix, iz); let e = cells.get(c); if (!e) cells.set(c, (e = { ix, iz, tris: new Set() })); e.tris.add(t); }
    }
    // join neighbouring cells into pieces
    const seen = new Set();
    for (const [c0, e0] of cells) {
      if (seen.has(c0)) continue; const piece = [], stack = [e0]; seen.add(c0);
      while (stack.length) { const e = stack.pop(); piece.push(e); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const c = key(e.ix + dx, e.iz + dz), n = cells.get(c); if (n && !seen.has(c)) { seen.add(c); stack.push(n); } } }
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const tris = new Set();
      for (const e of piece) { x0 = Math.min(x0, e.ix * CELL); x1 = Math.max(x1, (e.ix + 1) * CELL); z0 = Math.min(z0, e.iz * CELL); z1 = Math.max(z1, (e.iz + 1) * CELL); for (const t of e.tris) tris.add(t); }
      if (Math.max(x1 - x0, z1 - z0) < 0.6 + CELL) continue; // posts, ladder stiles, aerials: thinner than a person
      // points to walk at: one cell in every 3 m along the piece
      const targets = []; for (const e of piece) { const x = (e.ix + 0.5) * CELL, z = (e.iz + 0.5) * CELL; if (!targets.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) targets.push({ x, z }); }
      list.push({ y, x0, x1, z0, z1, tris, targets, door: intr && Math.abs(intr.y - y) < 0.05 ? intr : null });
    }
  }
  return list;
}

function setup(type, nation = 'aethia') {
  const id = type + ':' + nation; if (ships.has(id)) return ships.get(id);
  const ship = createUnit(type, nation); ship.pos.set(0, 0, 0); ship.yaw = 0; ship.quat.identity(); ship.sync();
  const T = triangles(ship.lod0), S = { ship, T, grid: fileTris(T) };
  S.obs = obstacles(S); ships.set(id, S);
  return S;
}
function marine(nation = 'aethia') { const m = createUnit('marine', nation); m.camDist = 1e9; m.ai = null; return m; }

// walk m on ship from local (x, y, z) along world yaw `look` for `secs`; returns the path (local points) and whether it stayed aboard
function walk(S, m, x, y, z, look, secs, run = false, jump = false) {
  const ship = S.ship; m.alive = true; m.gun = null; m.aboard = null; m.vy = 0; m.grounded = true; m.swim = false; m.placeOn(ship, _a.set(x, y, z));
  m.look = look; m.ctl.mx = 0; m.ctl.mz = 1; m.ctl.run = run; m.ctl.fire = false; m.ctl.jump = false; m.ctl.crouch = false;
  const path = [m.local.clone()]; let aboard = true, inside = false;
  for (let t = 0; t < secs; t += DT) { m.ctl.jump = jump; m.update(DT); if (m.on !== ship) { aboard = false; break; } if (m.inside) inside = true; if (m.local.distanceTo(path[path.length - 1]) > 0.25) path.push(m.local.clone()); }
  path.push(m.local.clone()); m.ctl.mz = 0;
  return { path, aboard, inside, insideEnd: m.inside, end: m.local.clone() };
}
// does the path cross one of the obstacle's triangles at 1.0 m or 1.5 m above the feet (away from the walk-in door)?
function through(S, o, path) {
  const hit = new Set();
  for (let i = 1; i < path.length; i++) for (const up of [1.0, 1.5]) {
    const a = path[i - 1].clone(), b = path[i].clone(); a.y += up; b.y += up; hit.clear(); crossings(S, a, b, hit);
    for (const t of hit) if (o.tris.has(t)) { if (o.door && Math.hypot((a.x + b.x) / 2 - (o.door.x - o.door.side * 0.9), (a.z + b.z) / 2 - o.door.z) < 1.2) continue; return true; }
  }
  return false;
}

/** Walk at every obstacle of one ship. Returns { walks, through, obstacles, passable, worst }. */
export function ship(type, nation = 'aethia', o = {}) {
  const S = setup(type, nation), m = marine(nation), dirs = o.dirs || 8, R = 2.6, res = { type, walks: 0, through: 0, obstacles: S.obs.length, passable: 0, worst: [] };
  // a start spot: on a deck at the obstacle's level (chosen from the decks alone, so the same walks run before and after a change)
  // and not shut in: from inside a hollow (a closed deckhouse, a gunhouse) 7 of 8 level rays hit a wall within 10 m
  const shut = (x, y, z) => { const r = rays(type, x, y, z, nation); return r.filter((n) => n > 0).length >= 7; };
  // and not touching anything already (a body's width of clear space at both test heights): a walk that starts inside a wall's
  // skin only grazes along it
  const touching = (x, y, z) => { const hs = new Set(); for (const up of [1.0, 1.5]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; _p2.set(x, y + up, z); _p3.set(x + Math.sin(a) * 0.4, y + up, z + Math.cos(a) * 0.4); if (crossings(S, _p2, _p3, hs).size) return true; } return false; };
  // and somewhere a marine could stand under the old rules too (not in or against a box typed into the model), so that the
  // before and after runs walk exactly the same walks
  const free = (x, y, z) => { const d = deckUnder(S.ship, { x, y, z }, 0.3); return !!d && Math.abs(d.y - y) <= 0.3 && !before(() => blocked(S.ship, x, y, z)) && !touching(x, y, z) && !shut(x, y, z); };
  for (const ob of S.obs) {
    let n = 0; const cx = (ob.x0 + ob.x1) / 2, cz = (ob.z0 + ob.z1) / 2, hx = (ob.x1 - ob.x0) / 2 + R, hz = (ob.z1 - ob.z0) / 2 + R;
    // every target from `dirs` directions, and the middle of the piece end-on from its four sides
    const runs = []; for (const tg of ob.targets) for (let k = 0; k < dirs; k++) { const a = (k / dirs) * Math.PI * 2; runs.push([tg, tg.x + Math.sin(a) * R, tg.z + Math.cos(a) * R]); }
    for (const [x, z] of [[cx + hx, cz], [cx - hx, cz], [cx, cz + hz], [cx, cz - hz]]) runs.push([{ x: cx, z: cz }, x, z]);
    for (const [tg, x, z] of runs) {
      if (!free(x, ob.y, z)) continue;
      const look = Math.atan2(-(tg.x - x), -(tg.z - z)); // face the target
      const w = walk(S, m, x, ob.y, z, look, (Math.hypot(tg.x - x, tg.z - z) * 2) / 2.6 + 0.3, !!o.run, !!o.jump); // o.run / o.jump: sprint, or jump all the way
      res.walks++; if (through(S, ob, w.path)) { res.through++; n++; if (o.log) (res.log = res.log || []).push({ from: [x, ob.y, z].map((v) => +v.toFixed(2)), to: [tg.x, tg.z], end: w.end.toArray().map((v) => +v.toFixed(2)), n: w.path.length }); }
    }
    if (n) { res.passable++; res.worst.push({ at: [+((ob.x0 + ob.x1) / 2).toFixed(1), ob.y, +((ob.z0 + ob.z1) / 2).toFixed(1)], size: [+(ob.x1 - ob.x0).toFixed(1), +(ob.z1 - ob.z0).toFixed(1)], through: n }); }
  }
  res.worst.sort((p, q) => q.through - p.through); if (!o.all) res.worst = res.worst.slice(0, o.top || 12);
  return res;
}

/** Islands: bunkers (8 directions) and trees (4 directions). i = island index 0..4. */
export function island(i, o = {}) {
  const is = world.islands[i], m = marine(), res = { island: i, walks: 0, through: 0, bunkers: 0, bunkerThrough: 0, trees: 0, treeThrough: 0 };
  const boxes = [], trees = [];
  for (const c of world.group.children) {
    if (c.isInstancedMesh) { const mm = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); for (let k = 0; k < c.count; k++) { c.getMatrixAt(k, mm); mm.decompose(p, q, s); if (Math.hypot(p.x - is.x, p.z - is.z) < is.r * 1.3) trees.push({ x: p.x, y: p.y, z: p.z, s: s.x }); } }
    else if (c.isMesh && c.geometry.type === 'BoxGeometry') { const b = new THREE.Box3().setFromObject(c); if (Math.hypot(b.min.x - is.x, b.min.z - is.z) < is.r * 1.3) boxes.push(b); }
  }
  const inTree = (t, p) => { const h = (p.y - t.y) / t.s; if (h < 1 || h > 10) return false; return Math.hypot(p.x - t.x, p.z - t.z) < 2.6 * t.s * ((10 - h) / 9) * 0.85; };
  const go = (x, z, look, secs, test) => {
    m.alive = true; m.placeAt(x, world.terrain(x, z), z); m.grounded = true; m.look = look; m.ctl.mz = 1; m.ctl.mx = 0; m.ctl.run = false; let hit = false;
    for (let t = 0; t < secs; t += DT) { m.update(DT); for (const up of [1.0, 1.5]) { _a.copy(m.pos); _a.y += up; if (test(_a)) { hit = true; if (o.log) (res.log = res.log || []).push({ at: m.pos.toArray().map((v) => +v.toFixed(2)), from: [x, z].map((v) => +v.toFixed(1)) }); } } if (hit && o.log) break; }
    m.ctl.mz = 0; return hit;
  };
  for (const b of boxes) {
    res.bunkers++; const c = b.getCenter(new THREE.Vector3()), R = Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2 + 4;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, x = c.x + Math.sin(a) * R, z = c.z + Math.cos(a) * R; const sh = b.clone().expandByScalar(-0.05); const h = go(x, z, Math.atan2(-(c.x - x), -(c.z - z)), (2 * R) / 2.6, (p) => sh.containsPoint(p)); res.walks++; if (h) { res.through++; res.bunkerThrough++; } }
  }
  const pick = trees.filter((t, k) => k % Math.max(1, Math.floor(trees.length / (o.trees || 10))) === 0).slice(0, o.trees || 10);
  for (const t of pick) {
    res.trees++; const R = 6;
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.3, x = t.x + Math.sin(a) * R, z = t.z + Math.cos(a) * R; const h = go(x, z, Math.atan2(-(t.x - x), -(t.z - z)), (2 * R) / 2.6, (p) => inTree(t, p)); res.walks++; if (h) { res.through++; res.treeThrough++; } }
  }
  return res;
}

/** The ways in: every walk-in door (in, then back out) and the Super Destroyer's hatchway from the helipad. */
export function doors(type, nation = 'aethia') {
  const S = setup(type, nation), md = S.ship.model, m = marine(nation), out = [];
  const inn = md.interior;
  if (inn && inn.door) {
    // from just outside the wall (d.x is 0.9 m out, which on a narrow deck is over the side), into the house and back out
    const d = inn.door, s = d.side, xw = d.x - s * 0.9, x0 = xw + s * 0.55;
    const w1 = walk(S, m, x0, d.y, d.z, s > 0 ? Math.PI / 2 : -Math.PI / 2, 2); // walking toward -s, into the house
    out.push({ what: 'deckhouse door, in', ok: w1.inside && w1.aboard, end: w1.end.toArray().map((v) => +v.toFixed(2)) });
    if (w1.inside) { const e = w1.end; const w2 = walk(S, m, e.x, e.y, e.z, s > 0 ? -Math.PI / 2 : Math.PI / 2, (Math.abs(x0 - e.x) - 0.1) / 2.6); out.push({ what: 'deckhouse door, out', ok: w2.aboard && !w2.insideEnd && (w2.end.x - xw) * s > 0.2, end: w2.end.toArray().map((v) => +v.toFixed(2)) }); }
  }
  if (type === 'superdestroyer') {
    // the hatchway by the helipad: down the stair (going forward), into the upper deck corridor, and back up
    const fb = md.helipads[0].pos.y, w1 = walk(S, m, 0, fb, 129.5, 0, 9);
    out.push({ what: 'helipad hatchway, down', ok: w1.inside, end: w1.end.toArray().map((v) => +v.toFixed(2)) });
    if (w1.inside) { const e = w1.end; const w2 = walk(S, m, e.x, e.y, e.z, Math.PI, 10); out.push({ what: 'helipad hatchway, back up', ok: !w2.insideEnd && w2.aboard && w2.end.y > fb - 0.3, end: w2.end.toArray().map((v) => +v.toFixed(2)) }); }
  }
  return out;
}

/** Crew posts and spawn spots inside something solid (pad 0). */
export function posts(type, nation = 'aethia') {
  const S = setup(type, nation), md = S.ship.model, inside = [];
  for (const p of md.posts) if (blocked(S.ship, p.x, p.y, p.z, 0)) inside.push({ kind: p.kind, at: [p.x, p.y, p.z].map((v) => +v.toFixed(2)) });
  const spots = [];
  if (type === 'carrier') { const hp = md.helipads[0].pos; for (let dx = -9; dx <= 9; dx += 3) for (let dz = -4; dz <= 4; dz += 2) spots.push([hp.x + dx, hp.y, hp.z - 18 + dz]); spots.push([hp.x - 9, hp.y, hp.z - 17]); }
  if (type === 'superdestroyer') { const hp = md.helipads[0].pos; spots.push([hp.x + 4, hp.y, hp.z - 14]); }
  const spotsIn = spots.filter(([x, y, z]) => blocked(S.ship, x, y, z, 0)).length;
  // the middle of every floor a person can stand on (rooms, passages, stair treads, outside decks): newly shut by the new solids?
  const floors = md.decks.filter((d) => d.x1 - d.x0 > 0.3 && d.z1 - d.z0 > 0.15), shutNow = floors.filter((d) => { const x = (d.x0 + d.x1) / 2, z = (d.z0 + d.z1) / 2; return blocked(S.ship, x, d.y, z, 0) && !before(() => blocked(S.ship, x, d.y, z, 0)); }).map((d) => [d.x0, d.x1, d.z0, d.z1, d.y, d.in ? 'in' : 'out'].map((v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
  return { posts: md.posts.length, inside, spots: spots.length, spotsIn, floors: floors.length, floorsShut: shutNow };
}

/** Every gun a marine can man: reach it (a free spot within 3 m), take it, leave it, then walk away from it. */
export function seats(type, nation = 'aethia') {
  const S = setup(type, nation), ship = S.ship, m = marine(nation), res = { guns: 0, reach: 0, take: 0, leave: 0, fails: [] };
  for (const mt of ship.mounts) {
    if (mt.key !== 'mg' && mt.key !== 'ciws') continue; res.guns++;
    const p = mt.t.node.position; let reach = false;
    for (let r = 1.0; r <= 2.8 && !reach; r += 0.3) for (let k = 0; k < 16 && !reach; k++) { const a = (k / 16) * Math.PI * 2, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r, d = deckUnder(ship, { x, y: p.y + 0.5, z }, 0.3); if (d && Math.abs(d.y - p.y) < 2.5 && !blocked(ship, x, d.y, z)) reach = true; }
    if (reach) res.reach++;
    m.alive = true; m.placeOn(ship, _a.set(p.x, p.y, p.z + 1.4)); m.takeGun(mt); m.update(DT); const took = m.gun === mt; if (took) res.take++;
    m.leaveGun(); const l = m.local.clone(); const stuck = blocked(ship, l.x, l.y, l.z, 0);
    // walk away in the best of four directions: must get at least 0.8 m
    let best = 0; for (let k = 0; k < 4; k++) { const w = walk(S, m, l.x, l.y, l.z, (k * Math.PI) / 2, 1); best = Math.max(best, Math.hypot(w.end.x - l.x, w.end.z - l.z)); }
    if (!stuck && best > 0.8) res.leave++; else res.fails.push({ kind: mt.key, at: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), stuck, best: +best.toFixed(2) });
    if (!reach) res.fails.push({ kind: mt.key, at: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), reach: false });
  }
  return res;
}
export function reset() { ships.clear(); }
/** One walk, every point: trace('carrier', [x, y, z], [tx, tz]) */
export function trace(type, from, to, secs = 4, nation = 'aethia') { const S = setup(type, nation), m = marine(nation), w = walk(S, m, from[0], from[1], from[2], Math.atan2(-(to[0] - from[0]), -(to[1] - from[2])), secs); return w.path.map((p) => p.toArray().map((v) => +v.toFixed(2))); }
export function rays(type, x, y, z, nation = 'aethia') { const S = setup(type, nation), out = [], hs = new Set(); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; hs.clear(); _p2.set(x, y + CHEST, z); _p3.set(x + Math.sin(a) * 10, y + CHEST, z + Math.cos(a) * 10); out.push(crossings(S, _p2, _p3, hs).size); } return out; }
/** Run fn with the old collision (only the boxes typed into each model, nothing on the islands): the "before" numbers. */
export function before(fn) { const was = collide.full; collide.full = false; try { return fn(); } finally { collide.full = was; } }
/** What an obstacle is made of: the obstacle nearest (x, z) at deck level y, its meshes and the height its triangles span. */
export function explain(type, x, y, z, nation = 'aethia') {
  const S = setup(type, nation), ob = S.obs.filter((o) => Math.abs(o.y - y) < 0.1).sort((p, q) => Math.hypot((p.x0 + p.x1) / 2 - x, (p.z0 + p.z1) / 2 - z) - Math.hypot((q.x0 + q.x1) / 2 - x, (q.z0 + q.z1) / 2 - z))[0];
  if (!ob) return null; const by = new Map();
  for (const t of ob.tris) { const o = S.T.owners[t / 9]; let up = o, path = []; while (up && up !== S.ship.lod0) { path.push(up.name || up.type); up = up.parent; } const k = path.reverse().join('/') + ' ' + (o.material && (o.material.name || o.material.type)); let e = by.get(k); if (!e) by.set(k, (e = { n: 0, y0: 1e9, y1: -1e9, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 })); e.n++; for (let j = 0; j < 3; j++) { e.y0 = Math.min(e.y0, S.T[t + j * 3 + 1]); e.y1 = Math.max(e.y1, S.T[t + j * 3 + 1]); e.x0 = Math.min(e.x0, S.T[t + j * 3]); e.x1 = Math.max(e.x1, S.T[t + j * 3]); e.z0 = Math.min(e.z0, S.T[t + j * 3 + 2]); e.z1 = Math.max(e.z1, S.T[t + j * 3 + 2]); } }
  const r = (v) => +v.toFixed(2);
  return { box: [ob.x0, ob.x1, ob.z0, ob.z1].map(r), y: ob.y, parts: [...by].map(([k, e]) => ({ k, n: e.n, x: [r(e.x0), r(e.x1)], y: [r(e.y0), r(e.y1)], z: [r(e.z0), r(e.z1)] })) };
}
export function list(type, nation = 'aethia') { const S = setup(type, nation); return S.obs.map((o) => ({ at: [+((o.x0 + o.x1) / 2).toFixed(1), o.y, +((o.z0 + o.z1) / 2).toFixed(1)], size: [o.x1 - o.x0, o.z1 - o.z0], targets: o.targets.length })); }
