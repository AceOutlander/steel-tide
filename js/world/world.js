// The battle space: islands and terrain, the unit registry, who can see whom (radar / sonar), and the kill feed.
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { ocean } from '../gfx/ocean.js';
import { MAT } from '../gfx/materials.js';
import { mulberry32, sstep, clamp } from '../core/util.js';
import { NATIONS } from '../core/config.js';

const ISLANDS = [
  { x: 0, z: 0, r: 640, h: 58, s: 1.3 }, { x: -3700, z: -1250, r: 430, h: 74, s: 4.1 }, { x: 3500, z: 1450, r: 390, h: 50, s: 2.2 },
  { x: 2900, z: -2900, r: 300, h: 92, s: 5.7 }, { x: -2800, z: 2700, r: 340, h: 42, s: 0.4 },
];
// landing zones on the centre island (flat pads) where marines fight; index 0 is nearer Aethia (+z), 1 nearer Extro (-z)
export const PADS = [{ x: 60, z: 330, r: 34, y: 9 }, { x: -60, z: -330, r: 34, y: 9 }];

function islandH(is, x, z) {
  const dx = x - is.x, dz = z - is.z, d = Math.hypot(dx, dz);
  if (d > is.r * 1.7) return -90;
  const ang = Math.atan2(dz, dx);
  const rr = is.r * (1 + 0.15 * Math.sin(3 * ang + is.s) + 0.08 * Math.sin(7 * ang + is.s * 2.3) + 0.035 * Math.sin(13 * ang + is.s));
  const t = 1 - d / rr;
  if (t <= 0) return Math.max(-90, t * 75);
  const ridge = 0.72 + 0.28 * Math.sin(d * 0.021 + ang * 4 + is.s) * Math.sin(ang * 2.3 + is.s);
  return 2.6 * sstep(0, 0.07, t) + is.h * Math.pow(sstep(0.07, 0.95, t), 1.5) * ridge;
}

export const world = {
  lost: [], // enemy contacts just lost: { x, z, t, nation, unit }
  // the running tally the score bar shows: kills credited to each side and what each side has lost
  kills: { aethia: 0, extro: 0 }, losses: { aethia: { ships: 0, subs: 0, aircraft: 0, men: 0 }, extro: { ships: 0, subs: 0, aircraft: 0, men: 0 } },
  tally(u, by) {
    const cat = u.kind === 'ship' ? 'ships' : u.kind === 'sub' ? 'subs' : u.isAir ? 'aircraft' : 'men';
    this.losses[u.nation][cat]++; if (by && by.nation !== u.nation) this.kills[by.nation]++;
  },
  // ---- feedback for the HUD ----
  hits: { t: -9, dmg: 0, big: false, kill: false, name: '' },     // what the player's fire last did
  hurts: [],                                                       // who is hitting the player: { from, t, x, z }
  falls: [],                                                       // where the player's shells landed: { x, y, z, t, text, hit }
  struck(target, amount, kill) {
    const h = this.hits; if (this.t - h.t > 1.2) h.dmg = 0;
    h.t = this.t; h.dmg += Math.min(amount, target.hp); h.kill = kill; h.big = kill || amount >= target.maxHp * 0.12; h.name = kill ? this.label(target) : '';
  },
  hurt(victim, from, pos) {
    let e = this.hurts.find((k) => k.from === from); if (!e) { e = { from }; this.hurts.push(e); if (this.hurts.length > 4) this.hurts.shift(); }
    e.t = this.t; e.x = from.pos.x; e.z = from.pos.z;
  },
  // a shell from the player's guns has landed: say how it fell relative to the target it was fired at
  shellFall(owner, p, target, struckUnit) {
    if (this.t - (this._fallT || -9) < 0.5) return; this._fallT = this.t;
    let text = '', hit = false;
    if (struckUnit && struckUnit.nation !== owner.nation) { text = 'HIT'; hit = true; }
    else if (target && target.alive) {
      const lx = target.pos.x - owner.pos.x, lz = target.pos.z - owner.pos.z, l = Math.hypot(lx, lz) || 1, ax = lx / l, az = lz / l;
      const dx = p.x - target.pos.x, dz = p.z - target.pos.z, along = dx * ax + dz * az, across = dx * -az + dz * ax, r = target.radius;
      if (Math.abs(along) > r * 0.7 && Math.abs(along) >= Math.abs(across)) text = (along < 0 ? 'SHORT ' : 'OVER ') + Math.round(Math.abs(along) / 10) * 10 + ' m';
      else if (Math.abs(across) > r * 0.5) text = (across > 0 ? 'RIGHT ' : 'LEFT ') + Math.round(Math.abs(across) / 10) * 10 + ' m';
      else text = 'CLOSE';
    } else return;
    this.falls.push({ x: p.x, y: Math.max(p.y, 1), z: p.z, t: this.t, text, hit }); if (this.falls.length > 3) this.falls.shift();
  },
  t: 0, units: [], islands: ISLANDS, pads: PADS, player: null, playerNation: 'aethia', carriers: {}, feed: [], onFeed: null, onKill: null, group: null,
  score: { aethia: 0, extro: 0 }, over: null, nextId: 1,

  terrain(x, z) {
    let best = -90;
    for (let i = 0; i < ISLANDS.length; i++) { const h = islandH(ISLANDS[i], x, z); if (h > best) best = h; }
    if (best > -5 && Math.abs(x) < 200 && Math.abs(z) < 420) for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r * 1.6) best = best + (p.y - best) * (1 - sstep(p.r, p.r * 1.6, d)); }
    return best;
  },
  nearIsland(x, z, margin = 0) { for (const is of ISLANDS) { if (Math.hypot(x - is.x, z - is.z) < is.r * 1.22 + margin) return is; } return null; },

  buildIslands() {
    const rnd = mulberry32(99), grp = new THREE.Group();
    const treeGeo = new THREE.ConeGeometry(2.6, 9, 6); treeGeo.translate(0, 5.5, 0);
    const trunks = []; const dummy = new THREE.Object3D();
    for (const is of ISLANDS) {
      const RINGS = 30, SEG = 84, pos = [], col = [], uv = [], idx = [];
      const c = new THREE.Color();
      for (let i = 0; i <= RINGS; i++) for (let j = 0; j <= SEG; j++) {
        const rr = (i / RINGS) * is.r * 1.55, a = (j / SEG) * Math.PI * 2, x = is.x + Math.cos(a) * rr, z = is.z + Math.sin(a) * rr, y = this.terrain(x, z);
        pos.push(x, Math.max(y, -40), z); uv.push(x / 14, z / 14);
        const slope = Math.abs(this.terrain(x + 3, z) - y) + Math.abs(this.terrain(x, z + 3) - y), n = rnd() * 0.06;
        if (y < 0.4) c.setRGB(0.42 + n, 0.38 + n, 0.27); else if (y < 3.2) c.setRGB(0.78 + n, 0.71 + n, 0.5);
        else if (slope > 3.4 || y > is.h * 0.78) c.setRGB(0.36 + n, 0.34 + n, 0.31); else c.setRGB(0.2 + n, 0.36 + n * 2, 0.14);
        col.push(c.r, c.g, c.b);
      }
      for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) { const a = i * (SEG + 1) + j, b = a + 1, d = a + SEG + 1, e = d + 1; idx.push(a, b, d, b, e, d); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, MAT.island); m.receiveShadow = true; grp.add(m);
      const nTrees = Math.round(is.r * 0.28);
      for (let k = 0; k < nTrees; k++) {
        const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * is.r * 0.9, x = is.x + Math.cos(a) * rr, z = is.z + Math.sin(a) * rr, y = this.terrain(x, z);
        if (y < 4 || y > is.h * 0.7) continue;
        if (is === ISLANDS[0] && PADS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 1.8)) continue;
        dummy.position.set(x, y - 0.5, z); dummy.scale.setScalar(0.7 + rnd() * 0.9); dummy.rotation.y = rnd() * 6; dummy.updateMatrix(); trunks.push(dummy.matrix.clone());
      }
    }
    const trees = new THREE.InstancedMesh(treeGeo, MAT.foliage, trunks.length);
    trunks.forEach((m, i) => trees.setMatrixAt(i, m)); trees.castShadow = true; grp.add(trees);
    for (const p of PADS) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.7, p.r * 0.74, 0.5, 28), MAT.concrete); pad.position.set(p.x, p.y - 0.1, p.z); pad.receiveShadow = true; grp.add(pad);
      const hmark = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), MAT.helipad); hmark.rotation.x = -Math.PI / 2; hmark.position.set(p.x, p.y + 0.2, p.z); grp.add(hmark);
      const bunker = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 8), MAT.concrete); bunker.position.set(p.x + 40, p.y + 1.4, p.z + Math.sign(p.z) * 10); bunker.castShadow = true; grp.add(bunker);
    }
    gfx.scene.add(grp); this.group = grp;
    ocean.setIslands(ISLANDS);
  },

  add(u) { if (this.onAdd) this.onAdd(u); u.id = this.nextId++; this.units.push(u); if (u.root) gfx.scene.add(u.root); return u; },
  remove(u) { const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1); if (u.root && u.root.parent === gfx.scene) gfx.scene.remove(u.root); u.gone = true; },
  clear() { for (const u of [...this.units]) { if (u.dispose) u.dispose(); this.remove(u); } this.units.length = 0; this.lost.length = 0; for (const n of ['aethia', 'extro']) { this.kills[n] = 0; const l = this.losses[n]; l.ships = l.subs = l.aircraft = l.men = 0; } this.hurts.length = 0; this.falls.length = 0; this.hits.t = -9; this.carriers = {}; this.over = null; this.score = { aethia: 0, extro: 0 }; this.feed.length = 0; this.player = null; },

  say(text, cls = '') { this.feed.push({ text, cls, t: this.t }); if (this.feed.length > 40) this.feed.shift(); this.onFeed && this.onFeed(text, cls); },

  // --- detection: enemy units a side currently holds on radar / sonar / in sight -------------------------------------
  _detT: 0,
  // ---- detection ------------------------------------------------------------------------------------------------------------
  // THE one place that decides who can be seen. Everything else (radar and map, target boxes and labels, the aim point,
  // missile and gun lock, crews and pilots choosing targets) reads only unit.seen: "the other side holds this contact
  // right now". A side shares its contacts, but a contact exists only if one of its units can really detect the target.
  //
  // Submarines: SURFACED (0-3 m) like a small ship. PERISCOPE DEPTH (3-18 m): by eye inside 1.5 km, by radar at short
  // range only while the mast is up, otherwise sonar only. DEEP: sonar only. Sonar is carried by submarines, corvettes and
  // battlecruisers; a fast sub is loud, a slow one quiet. An active ping finds subs out to 1.5x sonar range and gives the
  // pinging boat away to every enemy sonar within 9 km.
  // Aircraft: radar range scales with the target's signature (stealth fighter 0.45, cloaked bomber a tenth of normal);
  // eyes still work up close whatever the radar says.
  sonarRange(f) { return f.kind === 'sub' ? (f.def.sonar || 3000) : f.kind === 'ship' && (f.type === 'corvette' || f.type === 'battlecruiser') ? 2200 : 0; },
  // how observer f detects e at horizontal range d: 'eye' | 'radar' | 'sonar' | 'ping' | null
  detects(f, e, d) {
    if (e.kind === 'soldier' && e.aboard) return null;
    const t = this.t, son = this.sonarRange(f);
    if (e.kind === 'sub' && e.depth > 3 && !e.dockedTo) {
      if (son) {
        const noise = (e.def.quiet || 1) * (0.35 + 0.9 * clamp(Math.abs(e.speed) / e.def.speed, 0, 1)) * (e.depth > 60 ? 0.7 : 1);
        if (d < son * noise) return 'sonar';
        if (f.pingT > t && d < son * 1.5) return 'ping';
        if (e.pinged > t && d < 9000) return 'ping';
      }
      if (e.depth < 18) {
        if (d < 1500) return 'eye';                                              // the mast and its feather of wake
        if (e.scopeA > 0.5 && d < Math.min(f.def.radar * 0.12, 2500)) return 'radar';
      }
      return null;
    }
    if (son && e.pinged > t && d < 9000) return 'ping';
    if (d < 1800 * Math.min(1, e.def.sig * 2 + 0.3) * (e.cloaked ? 0.6 : 1)) return 'eye';
    let sig = e.def.sig; if (e.cloaked) sig *= 0.1; if ((e.kind === 'jet' || e.kind === 'heli') && e.pos.y < 40) sig *= 0.6;
    return d < f.def.radar * sig ? 'radar' : null;
  },
  updateDetection(dt) {
    this._detT -= dt; if (this._detT > 0) return; this._detT = 0.4;
    const U = this.units;
    for (let i = 0; i < U.length; i++) {
      const e = U[i], was = e.seen; let how = null;
      if (e.alive) for (let j = 0; j < U.length && !how; j++) {
        const f = U[j]; if (f.nation === e.nation || !f.alive || f.passive) continue;
        how = this.detects(f, e, Math.hypot(f.pos.x - e.pos.x, f.pos.z - e.pos.z));
      }
      e.seen = !!how; e.seenHow = how;
      // contact lost: remember where, for the fading "?" on the radar and map
      if (was && !how && e.alive) this.lost.push({ x: e.pos.x, z: e.pos.z, t: this.t, nation: e.nation, unit: e });
    }
    for (let i = this.lost.length - 1; i >= 0; i--) { const l = this.lost[i]; if (this.t - l.t > 13 || l.unit.seen || !l.unit.alive) this.lost.splice(i, 1); }
  },
  visibleTo(u, nation) { return u.nation === nation || u.seen; },
  label(u) { return `${NATIONS[u.nation].adj} ${u.def.label.toLowerCase()}${u.name ? ' ' + u.name : ''}`; },
};
