// What a person on foot cannot walk through, worked out from the model itself when a ship is built (finishShip calls
// addSolids after the cabins and the static geometry are in place). Nothing here is typed in per ship:
//
//   model.rings   [{ x, z, r, y0, y1, ti }]  one circle per turret / mount (ti: its index in model.turrets): its radius is the farthest point of the part that
//                 turns (the barrels and the gun itself left out), so the shape is right at every bearing. y0..y1 is the
//                 mount's height, gun included. js/sim/surface.js blocked() stops people at it; a gunner at the mount is in
//                 the gun's seat, not on foot, so this never traps the one who mans it.
//   model.blocks  + { ..., auto: 1 }  boxes from the drawn geometry: the still parts of the model (everything but turrets,
//                 radars and other moving groups, and the hidden interior) are cut at 1.3 m and 1.75 m above every outside
//                 deck; wherever a cut crosses that deck and nothing already stops a person there, the cells it passes
//                 through (0.25 m) become solid. Pieces narrower than 0.6 m (posts, aerials, ladder stiles) are left alone,
//                 as are walk-in doorways (model.interior.way), interior zones and anything a raised deck stands on (stairs
//                 and platforms one can climb: the step up is surface.js's business).
// The ledge rule in surface.js (no floor at your feet but one just over your head = you are walking into the ship) needs
// nothing from the model but its decks.
import * as THREE from 'three';

const CELL = 0.25, CUTS = [1.3, 1.75], key = (ix, iz) => (ix + 8000) * 16000 + (iz + 8000);

/** The circle a turret's turning base sweeps, in the ship's frame. */
export function ringOf(t) {
  const node = t.node; node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  let r = 0, rg = 0, y0 = 0, y1 = 0;
  const walk = (o, gun) => {
    if (o.isMesh && o.geometry && o.geometry.attributes.position) {
      m.multiplyMatrices(inv, o.matrixWorld); const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m); const h = Math.hypot(v.x, v.z);
        if (!gun) r = Math.max(r, h); else if (v.y < 2 && h <= 1) rg = Math.max(rg, h); // the gun's own body at body height (a small mount's shield and grips), not its barrel
        y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
    for (const c of o.children) walk(c, gun || c === t.pitch);
  };
  walk(node, false);
  const p = node.position;
  return { x: p.x, z: p.z, r: Math.max(0.25, r, rg), y0: p.y + y0 - 0.05, y1: p.y + Math.max(y1, 1.0) };
}

export function addSolids(S) {
  const model = S.model, g = S.g;
  model.rings = (model.turrets || []).map((t, i) => ({ ...ringOf(t), ti: i })); // ti: index in model.turrets
  const decks = model.decks || [], out = decks.filter((d) => !d.in);
  if (!out.length) return;
  // triangles of the still parts, in the ship's frame
  const skip = new Set([...(model.turrets || []).map((t) => t.node), ...(model.spinners || []).map((s) => s.node), ...(model.dockDoors || []), model.mast].filter(Boolean));
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3(), T = [];
  const walk = (o) => {
    if (!o.visible || skip.has(o)) return; // the interior and the first-person bridge are hidden groups
    if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.attributes.position) {
      m.multiplyMatrices(inv, o.matrixWorld); const p = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : p.count;
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(m); T.push(v.x, v.y, v.z); }
    }
    for (const c of o.children) walk(c);
  };
  walk(g);
  const zones = (model.interior && model.interior.zones) || [], way = model.interior && model.interior.way;
  const levels = [...new Set(out.map((d) => Math.round(d.y * 100) / 100))].sort((a, b) => a - b);
  const blocks = model.blocks, rings = model.rings, added = [];
  for (const L of levels) {
    const here = out.filter((d) => Math.abs(d.y - L) < 0.011), raised = decks.filter((d) => d.y > L + 0.05 && d.y <= L + 2.1);
    const stops = blocks.filter((b) => L + 0.4 >= b.y0 && L + 0.4 < b.y1), rs = rings.filter((r) => L + 0.4 >= r.y0 && L + 0.4 < r.y1);
    const ok = (x, z, h) => {
      if (!here.some((d) => x > d.x0 - 0.3 && x < d.x1 + 0.3 && z > d.z0 - 0.3 && z < d.z1 + 0.3)) return false;      // over this deck
      if (raised.some((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1)) return false;                           // a step or platform to climb
      if (way && x > way.x0 && x < way.x1 && z > way.z0 && z < way.z1) return false;                                    // the walk-in doorway
      for (const b of zones) if (x > b.x0 - 0.1 && x < b.x1 + 0.1 && z > b.z0 - 0.1 && z < b.z1 + 0.1 && h > b.y0 && h < b.y1) return false;
      for (const b of stops) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return false;                           // already solid
      for (const r of rs) if (Math.hypot(x - r.x, z - r.z) < r.r) return false;
      return true;
    };
    const cells = new Map();
    for (let t = 0; t < T.length; t += 9) {
      const ya = T[t + 1], yb = T[t + 4], yc = T[t + 7], lo = Math.min(ya, yb, yc), hi = Math.max(ya, yb, yc);
      for (const c of CUTS) {
        const h = L + c; if (lo > h || hi < h) continue;
        const pts = [];
        for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) { const y0 = T[t + i + 1], y1 = T[t + j + 1]; if ((y0 - h) * (y1 - h) > 0 || y0 === y1) continue; const f = (h - y0) / (y1 - y0); pts.push(T[t + i] + (T[t + j] - T[t + i]) * f, T[t + i + 2] + (T[t + j + 2] - T[t + i + 2]) * f); }
        if (pts.length < 4) continue;
        const n = Math.max(1, Math.ceil(Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) / (CELL * 0.5)));
        for (let k = 0; k <= n; k++) {
          const x = pts[0] + ((pts[2] - pts[0]) * k) / n, z = pts[1] + ((pts[3] - pts[1]) * k) / n, ix = Math.floor(x / CELL), iz = Math.floor(z / CELL), id = key(ix, iz);
          let e = cells.get(id); if (e === undefined) { e = ok((ix + 0.5) * CELL, (iz + 0.5) * CELL, h) ? { ix, iz, top: hi } : null; cells.set(id, e); }
          if (e && hi > e.top) e.top = hi;
        }
      }
    }
    // join neighbouring cells into pieces; keep the ones at least as wide as a person, as runs of cells along x
    const seen = new Set();
    for (const [id0, e0] of cells) {
      if (!e0 || seen.has(id0)) continue; const piece = [e0], stack = [e0]; seen.add(id0);
      while (stack.length) { const e = stack.pop(); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const id = key(e.ix + dx, e.iz + dz), n = cells.get(id); if (n && !seen.has(id)) { seen.add(id); stack.push(n); piece.push(n); } } }
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, top = L;
      for (const e of piece) { x0 = Math.min(x0, e.ix); x1 = Math.max(x1, e.ix + 1); z0 = Math.min(z0, e.iz); z1 = Math.max(z1, e.iz + 1); top = Math.max(top, e.top); }
      if (Math.max(x1 - x0, z1 - z0) * CELL < 0.6) continue;
      const y1 = Math.min(L + 12, Math.max(L + 1.9, top));
      const rows = new Map(); for (const e of piece) { let r = rows.get(e.iz); if (!r) rows.set(e.iz, (r = [])); r.push(e.ix); }
      for (const [iz, xs] of rows) {
        xs.sort((a, b) => a - b);
        for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; added.push({ x0: xs[i] * CELL, x1: (xs[j] + 1) * CELL, z0: iz * CELL, z1: (iz + 1) * CELL, y0: L - 0.1, y1, auto: 1 }); i = j + 1; }
      }
    }
  }
  // runs in the same columns on neighbouring rows with the same height become one box
  added.sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1 || a.y0 - b.y0 || a.z0 - b.z0);
  for (let i = 0; i < added.length; i++) {
    const a = added[i]; if (!a) continue;
    for (let j = i + 1; j < added.length; j++) { const b = added[j]; if (!b) continue; if (b.x0 !== a.x0 || b.x1 !== a.x1 || b.y0 !== a.y0) break; if (Math.abs(b.z0 - a.z1) < 1e-6) { a.z1 = b.z1; a.y1 = Math.max(a.y1, b.y1); added[j] = null; } }
  }
  for (const a of added) if (a) blocks.push(a);
}
