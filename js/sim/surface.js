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
export function blocked(ship, x, y, z) {
  const bl = ship.model.blocks;
  for (let i = 0; i < bl.length; i++) { const b = bl[i]; if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y + 0.4 >= b.y0 && y + 0.4 < b.y1) return true; }
  return false;
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
