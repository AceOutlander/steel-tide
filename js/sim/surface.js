// What is underneath a point: a ship deck, island ground, or the sea. Shared by helicopters, jets and people on foot.
import { V3 } from '../core/util.js';
import { waveHeight } from '../gfx/ocean.js';
import { world } from '../world/world.js';

const _l = new V3(), _w = new V3();

// highest walkable deck of `ship` under local point l that is not above (l.y + reach). Returns the deck or null.
export function deckUnder(ship, l, reach = 1.2) {
  let best = null;
  const decks = ship.model.decks;
  for (let i = 0; i < decks.length; i++) { const d = decks[i]; if (l.x >= d.x0 && l.x <= d.x1 && l.z >= d.z0 && l.z <= d.z1 && d.y <= l.y + reach && (!best || d.y > best.y)) best = d; }
  return best;
}
// What stops a person on foot at local point (x, y = feet, z) of a ship: its blocks (boxes, including the ones
// js/units/v2/solids.js derives from the geometry), its rings (one circle per turret / mount), and the ledge rule: no floor
// within a step of the feet but a deck just overhead means walking into the ship's structure (the side of a higher deck,
// the hull under it), not off an edge. pad keeps a body's width between a person and the wall (so an eye-level camera
// cannot poke through it). hit.ring is the ring that stopped the last call, for sliding round it.
// collide.full = false goes back to the boxes typed into each model and nothing else (only tools/tests/clipcheck.js sets it,
// to measure the before-and-after).
export const hit = { ring: null, box: null }, collide = { full: true };
export function blocked(ship, x, y, z, pad = 0.35) {
  const m = ship.model, bl = m.blocks, yy = y + 0.4, full = collide.full; hit.ring = hit.box = null;
  for (let i = 0; i < bl.length; i++) { const b = bl[i]; if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad && yy >= b.y0 && yy < b.y1 && (full || !b.auto)) { hit.box = b; return true; } }
  if (!full) return false;
  const rg = m.rings;
  if (rg) for (let i = 0; i < rg.length; i++) { const r = rg[i]; if (yy < r.y0 || yy >= r.y1) continue; const dx = x - r.x, dz = z - r.z, rr = r.r + pad; if (dx * dx + dz * dz < rr * rr) { hit.ring = r; return true; } }
  return ledge(m.decks, x, y, z);
}
// ...and no room to stand: an outside deck less than 2.2 m over the feet (the lip of a flight deck over a gun sponson).
function ledge(decks, x, y, z) {
  let above = false, floor = false;
  for (let i = 0; i < decks.length; i++) {
    const d = decks[i]; if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
    if (d.y <= y + 0.7) { if (d.y >= y - 1.5) floor = true; } else if (d.y <= y + 4) { if (!d.in && d.y <= y + 2.2) return true; above = true; }
  }
  return above && !floor;
}
// Island solids (bunkers, trees: world.buildIslands puts them on each island as `solids`) at world point (x, y = feet, z).
export function blockedWorld(x, y, z, pad = 0.35) {
  const IS = world.islands, yy = y + 0.4; hit.ring = hit.box = null; if (!collide.full) return false;
  for (let k = 0; k < IS.length; k++) {
    const is = IS[k], L = is.solids; if (!L) continue;
    const dx0 = x - is.x, dz0 = z - is.z, R = is.r * 1.7; if (dx0 * dx0 + dz0 * dz0 > R * R) continue;
    for (let i = 0; i < L.length; i++) {
      const s = L[i]; if (yy < s.y0 || yy >= s.y1) continue;
      if (s.r !== undefined) { const dx = x - s.x, dz = z - s.z, rr = s.r + pad; if (dx * dx + dz * dz < rr * rr) { hit.ring = s; return true; } }
      else if (x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad) { hit.box = s; return true; }
    }
  }
  return false;
}
// Move from (ox, oz) toward (nx, nz) at height y, sliding along whatever is in the way: the whole step if it is clear,
// else round a ring (along its edge), else along one axis, else not at all. test(x, y, z, pad) is blocked() bound to a ship
// or blockedWorld. Someone already standing inside a solid (put there) is let out: away from a ring's centre, or freely
// out of a box. Writes out.x / out.z; returns true if the whole step was taken.
export function slide(test, ox, oz, nx, nz, y, out) {
  out.x = nx; out.z = nz;
  if (!collide.full || !test(ox, y, oz, 0)) { // (the old rule for someone inside a box: tested like everyone else, so mostly stuck)
    const pad = test(ox, y, oz, 0.35) ? 0 : 0.35; // already against a wall (placed there): do not trap them
    if (!test(nx, y, nz, pad)) return true;
    const r = hit.ring;
    if (r) { // along the edge of the circle: the part of the step that does not go toward the centre
      let tx = -(oz - r.z), tz = ox - r.x; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const along = (nx - ox) * tx + (nz - oz) * tz, px = ox + tx * along, pz = oz + tz * along;
      if (!test(px, y, pz, pad)) { out.x = px; out.z = pz; return false; }
    }
    if (!test(nx, y, oz, pad)) { out.z = oz; return false; }
    if (!test(ox, y, nz, pad)) { out.x = ox; return false; }
    out.x = ox; out.z = oz; return false;
  }
  const r = hit.ring, b = hit.box; // inside something already: out of a ring by the shortest way, out of a box only outward
  if (b) { const depth = (x, z) => Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z); if (depth(nx, nz) >= depth(ox, oz)) { out.x = ox; out.z = oz; return false; } }
  else if (r) { const dx = nx - r.x, dz = nz - r.z, d = Math.hypot(dx, dz), rr = r.r + 0.05; if (d < rr) { if (d > 1e-4) { out.x = r.x + (dx * rr) / d; out.z = r.z + (dz * rr) / d; } else { out.x = r.x + rr; out.z = r.z; } } }
  return true;
}

// out: { y, ship, type: 'deck'|'ground'|'water', localY }
export function surfaceBelow(p, out, reach = 1.5) {
  out.ship = null; out.type = 'water'; out.y = waveHeight(p.x, p.z);
  const gy = world.terrain(p.x, p.z);
  if (gy > out.y) { out.y = gy; out.type = 'ground'; }
  const U = world.units;
  for (let i = 0; i < U.length; i++) {
    const s = U[i];
    if ((s.kind !== 'ship' && s.kind !== 'sub') || !s.alive || !s.model.decks.length) continue;
    const dx = p.x - s.pos.x, dz = p.z - s.pos.z; if (dx * dx + dz * dz > s.radius * s.radius * 1.3) continue;
    s.toLocal(p, _l);
    const d = deckUnder(s, _l, reach);
    if (d) { _w.set(_l.x, d.y, _l.z); s.toWorld(_w, _w); if (_w.y > out.y) { out.y = _w.y; out.ship = s; out.type = 'deck'; out.localY = d.y; } }
  }
  return out;
}
