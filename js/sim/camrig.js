// Camera helpers: what is solid around a camera, where a ship's bridge view sits, the cockpit frame for first-person
// flying, and the quick fade used when the view changes. player.js decides where the camera wants to be; this keeps it
// out of geometry.
import * as THREE from 'three';
import { waveHeight } from '../gfx/ocean.js';
import { world } from '../world/world.js';
import { V3, clamp } from '../core/util.js';

const _l0 = new V3(), _l1 = new V3(), _h = new V3(), _p = new V3(), _q = new THREE.Quaternion();
const BOTH = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const TURRET_R = { heavy: 6.5, deckgun: 3.2, sam: 2.6, ciws: 2.1, mg: 1.1, chin: 1 };

// The solid boxes of a ship or submarine in its own coordinates: hull, decks, superstructure and turrets. Built once.
export function solids(ship) {
  const m = ship.model; if (m._solids) return m._solids;
  const d = m.dims, bb = ship.bounds, list = [], decks = m.decks || [];
  const low = decks.length ? Math.min(...decks.map((k) => k.y)) : Math.min(bb.max.y, d.height * 0.3);
  list.push({ x0: -d.beam / 2, x1: d.beam / 2, y0: bb.min.y, y1: low, z0: bb.min.z, z1: bb.max.z });
  for (const k of decks) list.push({ x0: k.x0, x1: k.x1, y0: k.y - 1.5, y1: k.y, z0: k.z0, z1: k.z1 });
  for (const b of m.blocks || []) list.push(b);
  for (const t of m.turrets || []) { const p = t.node.position, r = TURRET_R[t.kind] || 1.5; list.push({ x0: p.x - r, x1: p.x + r, y0: p.y - 1, y1: p.y + r * 0.8, z0: p.z - r, z1: p.z + r }); }
  m._solids = list; return list;
}
// first point (0..1) along the world segment p0 -> p1 where it enters one of the ship's solids, or 1
export function segSolid(ship, p0, p1, pad = 0.5) {
  ship.toLocal(p0, _l0); ship.toLocal(p1, _l1);
  const dx = _l1.x - _l0.x, dy = _l1.y - _l0.y, dz = _l1.z - _l0.z; let best = 1;
  for (const b of solids(ship)) {
    let t0 = 0, t1 = best, ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      const a = i === 0 ? _l0.x : i === 1 ? _l0.y : _l0.z, dd = i === 0 ? dx : i === 1 ? dy : dz;
      const mn = (i === 0 ? b.x0 : i === 1 ? b.y0 : b.z0) - pad, mx = (i === 0 ? b.x1 : i === 1 ? b.y1 : b.z1) + pad;
      if (Math.abs(dd) < 1e-9) { if (a < mn || a > mx) ok = false; continue; }
      let ta = (mn - a) / dd, tb = (mx - a) / dd; if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) ok = false;
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}
export function pointSolid(ship, p, pad = 0.5) {
  ship.toLocal(p, _l0);
  for (const b of solids(ship)) if (_l0.x > b.x0 - pad && _l0.x < b.x1 + pad && _l0.y > b.y0 - pad && _l0.y < b.y1 + pad && _l0.z > b.z0 - pad && _l0.z < b.z1 + pad) return true;
  return false;
}
// inside the box that holds the whole model (masts, dock arms and all), grown by pad
export function inBounds(u, p, pad = 3) {
  u.toLocal(p, _l0); const b = u.bounds;
  return _l0.x > b.min.x - pad && _l0.x < b.max.x + pad && _l0.y < b.max.y + pad && _l0.z > b.min.z - pad && _l0.z < b.max.z + pad;
}

// How far (0..1) a camera can go from `from` toward `to` before something solid is in the way: ships (their real shapes),
// other aircraft, and island ground. `skip` is the unit being followed.
export function clearT(from, to, skip, pad = 0.6) {
  let t = 1; const len = from.distanceTo(to); if (len < 0.01) return 1;
  for (const s of world.units) {
    if (s === skip || s.gone || s.kind === 'soldier') continue;
    const dx = s.pos.x - from.x, dz = s.pos.z - from.z, reach = s.radius * 1.4 + len + 10; if (dx * dx + dz * dz > reach * reach) continue;
    if (s.kind === 'ship' || s.kind === 'sub') t = Math.min(t, segSolid(s, from, to, pad));
  }
  for (let i = 1; i <= 8; i++) { const k = (i / 8) * t; _p.copy(from).lerp(to, k); if (world.terrain(_p.x, _p.z) + pad + 0.6 > _p.y) { t = Math.min(t, ((i - 1) / 8) * t); break; } }
  return t;
}
// is this point inside the space another aircraft takes up (a parked neighbour on a crowded deck)?
export function crowded(p, skip) {
  for (const s of world.units) { if (s === skip || s.gone || !s.isAir) continue; const r = s.radius * 0.85; if (s.pos.distanceToSquared(p) < r * r) return true; }
  for (const n in world.carriers) { // the aircraft parked along the carrier deck are scenery, not units
    const cv = world.carriers[n]; if (!cv || cv.gone || !cv.model.parking || cv.pos.distanceToSquared(p) > 250 * 250) continue;
    for (const k of cv.model.parking) { cv.toWorld(k.pos, _h); _h.y += 2; if (_h.distanceToSquared(p) < 81) return true; }
  }
  return false;
}
// never let a camera that belongs above the water dip into it
export function aboveWater(p, margin = 0.35) { const wy = waveHeight(p.x, p.z) + margin; if (p.y < wy) p.y = wy; return p; }

// A ship's first-person viewpoint: just outside the bridge front, at window height. The model's `view.bridge` point is
// inside the bridge block, so look forward from it through the real meshes and stop just past the last wall.
export function bridgeEye(u) {
  const m = u.model; if (m._eye) return m._eye;
  const start = m.view && m.view.bridge ? m.view.bridge : new V3(0, (u.bounds.max.y) * 0.6, 0), eye = start.clone();
  if (u.kind === 'ship') {
    const keepP = u.root.position.clone(), keepQ = u.root.quaternion.clone();
    u.root.position.set(0, 0, 0); u.root.quaternion.identity(); u.root.updateMatrixWorld(true);
    const swapped = []; u.lod0.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { swapped.push([o, o.material]); o.material = BOTH; } });
    const rc = new THREE.Raycaster(start, new V3(0, 0, -1), 0, 30), hits = rc.intersectObject(u.lod0, true);
    for (const [o, mat] of swapped) o.material = mat;
    let last = 0; for (const h of hits) { if (h.distance - last > 3.5) break; last = h.distance; }
    eye.z -= last + 1.1;
    u.root.position.copy(keepP); u.root.quaternion.copy(keepQ); u.root.updateMatrixWorld(true);
  }
  m._eye = eye; return eye;
}

// ---- cockpit frame: what the pilot sees of their own aircraft in first person (the outside model is hidden) ------------------
let cockMat = null, glassMat = null;
function bar(g, a, b, r = 0.022) {
  const va = new V3(...a), vb = new V3(...b), d = vb.clone().sub(va), mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), cockMat);
  mesh.position.copy(va).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); g.add(mesh);
}
export function buildCockpit(kind) {
  if (!cockMat) { cockMat = new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.85, metalness: 0.15 }); glassMat = new THREE.MeshBasicMaterial({ color: 0x9fd8c0, transparent: true, opacity: 0.07, depthWrite: false }); }
  const g = new THREE.Group(), box = (w, h, d, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cockMat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  if (kind === 'jet') {
    box(1.5, 0.3, 0.7, 0, -0.62, -0.78, 0.1);                 // instrument coaming
    box(0.3, 0.06, 0.26, 0, -0.44, -0.74);                     // sight base
    bar(g, [-0.11, -0.42, -0.72], [-0.11, -0.2, -0.76], 0.008); bar(g, [0.11, -0.42, -0.72], [0.11, -0.2, -0.76], 0.008);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.2), glassMat); glass.position.set(0, -0.3, -0.74); glass.rotation.x = -0.25; g.add(glass);
    bar(g, [-0.62, -0.5, -0.95], [-0.42, 0.42, -0.5]); bar(g, [0.62, -0.5, -0.95], [0.42, 0.42, -0.5]); bar(g, [-0.42, 0.42, -0.5], [0.42, 0.42, -0.5]); // windscreen bow
    box(0.08, 0.1, 1.9, -0.66, -0.56, 0.05); box(0.08, 0.1, 1.9, 0.66, -0.56, 0.05);                                                                    // canopy rails
  } else {
    box(1.9, 0.34, 0.6, 0, -0.74, -0.8, 0.12);                // instrument panel
    box(0.34, 0.5, 0.5, 0, -0.95, -0.45);                      // centre console
    bar(g, [0, -0.6, -1.05], [0, 0.62, -0.75], 0.028);         // centre post
    bar(g, [-0.95, -0.6, -1.0], [-0.8, 0.62, -0.6], 0.03); bar(g, [0.95, -0.6, -1.0], [0.8, 0.62, -0.6], 0.03);
    bar(g, [-0.8, 0.62, -0.6], [0.8, 0.62, -0.6], 0.03);       // overhead bar
    box(1.9, 0.08, 1.6, 0, 0.72, 0.2);                         // cabin roof
    box(0.06, 0.5, 1.6, -0.98, -0.75, 0.1); box(0.06, 0.5, 1.6, 0.98, -0.75, 0.1); // door sills
  }
  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
  return g;
}

// ---- quick dip to black when the view jumps (camera mode, new unit), so a cut never shows a frame inside geometry ---------------
let veil = null;
export function cut(ms = 200) {
  if (!veil) { veil = document.createElement('div'); veil.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:5'; (document.getElementById('ui') || document.body).prepend(veil); }
  veil.style.transition = 'none'; veil.style.opacity = '1'; void veil.offsetWidth;
  veil.style.transition = `opacity ${ms}ms ease-out`; veil.style.opacity = '0';
}
export { clamp };
