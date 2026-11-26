// The Super Destroyer's walk-in interior: two decks of corridors and rooms above the waterline, a stair tower from the
// lower deck up to the bridge, a hatchway to the helipad, and a long stair down to the submarine dock bay under the
// waterline. Everything here is in the ship's own coordinates (bow = -Z, starboard = +X, y = 0 at the waterline).
//
// Walking uses the same two lists as every other ship: model.decks (flat rectangles to stand on; stairs are rows of
// shallow steps) and model.blocks (boxes that stop a person: walls, railings, furniture). Interior entries carry `in: 1`
// so the outside cameras ignore them. The pictures are drawn with unlit materials (the sun does not reach in here): one
// vertex-coloured material for everything, one for the lamps. setAlert() turns both red for battle stations.
import * as THREE from 'three';
import { Kit, tone } from './airkit.js';
import { registerTexture } from '../../gfx/materials.js';

// ---- painted steel and deck coating, drawn once: every interior surface is one of these two, tinted by its vertex colour
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function speckle(ctx, w, h, r, n, a) { for (let i = 0; i < n; i++) { const v = r() < 0.5 ? 0 : 255; ctx.fillStyle = `rgba(${v},${v},${v},${a * r()})`; const s = 1 + r() * 2; ctx.fillRect(r() * w, r() * h, s, s); } }
function drawSteel(ctx, w, h) { // a 2.4 m square of painted plating: weld seams, rivet rows, runs of dirt and rust, scuffs
  const r = rnd(4711), u = w / 2.4; ctx.fillStyle = '#e3e4e2'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rad = (0.12 + r() * 0.3) * w, c = r() < 0.5 ? '255,255,255' : '70,70,66', g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(${c},0.07)`); g.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = g; for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); ctx.restore(); } }
  speckle(ctx, w, h, r, 9000, 0.05);
  // runs: thin streaks of grime and rust trailing down from seams and fittings
  for (let i = 0; i < 46; i++) { const x = r() * w, y = r() * h, len = (0.08 + r() * 0.35) * h, wd = 1 + r() * 3, rust = r() < 0.4, g = ctx.createLinearGradient(0, y, 0, y + len); g.addColorStop(0, rust ? 'rgba(120,70,40,0.16)' : 'rgba(40,42,44,0.13)'); g.addColorStop(1, 'rgba(60,50,40,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, wd, len); ctx.fillRect(x, y - h, wd, len); }
  // plates 1.2 m wide and 1.2 m high: a welded seam is a dark line with a bright bead beside it; rivets along it
  const seam = (x0, y0, x1, y1) => { ctx.strokeStyle = 'rgba(40,44,46,0.5)'; ctx.lineWidth = Math.max(1.5, u * 0.006); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, u * 0.004); const o = Math.max(1.5, u * 0.006); ctx.beginPath(); ctx.moveTo(x0 + (y0 === y1 ? 0 : o), y0 + (y0 === y1 ? o : 0)); ctx.lineTo(x1 + (y0 === y1 ? 0 : o), y1 + (y0 === y1 ? o : 0)); ctx.stroke(); };
  const rivet = (x, y) => { const q = Math.max(1.6, u * 0.009); ctx.fillStyle = 'rgba(30,32,34,0.45)'; ctx.beginPath(); ctx.arc(x + q * 0.35, y + q * 0.35, q, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(236,238,236,0.95)'; ctx.beginPath(); ctx.arc(x, y, q * 0.82, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - q * 0.25, y - q * 0.25, q * 0.35, 0, 6.3); ctx.fill(); };
  for (const f of [0, 0.5]) { seam(f * w + 1, 0, f * w + 1, h); seam(0, f * h + 1, w, f * h + 1); for (let t = 0.03; t < 1; t += 1 / 20) { rivet(f * w + u * 0.045, t * h); rivet(f * w - u * 0.045 + (f ? 0 : w), t * h); rivet(t * w, f * h + u * 0.045); rivet(t * w, f * h - u * 0.045 + (f ? 0 : h)); } }
  // scuffs and chips
  for (let i = 0; i < 70; i++) { ctx.strokeStyle = r() < 0.5 ? 'rgba(50,52,54,0.12)' : 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1 + r(); const x = r() * w, y = r() * h, a = r() * 6.3, l = 4 + r() * 22; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.3); ctx.stroke(); }
}
function drawDeck(ctx, w, h) { // a 1.25 m square of deck: non-skid coating with a raised tread pattern, worn where feet go
  const r = rnd(1337); ctx.fillStyle = '#d9d9d6'; ctx.fillRect(0, 0, w, h); speckle(ctx, w, h, r, 26000, 0.16);
  const n = 16, c = w / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i + 0.5) * c, y = (j + 0.5) * c, a = (i + j) & 1 ? 0.6 : -0.6; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = 'rgba(20,22,24,0.3)'; ctx.beginPath(); ctx.ellipse(c * 0.03, c * 0.05, c * 0.34, c * 0.1, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(0, 0, c * 0.32, c * 0.085, 0, 0, 6.3); ctx.fill(); ctx.restore(); }
  for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h, rad = (0.15 + r() * 0.3) * w, cc = r() < 0.6 ? '255,255,255' : '30,30,30', g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(${cc},0.1)`); g.addColorStop(1, `rgba(${cc},0)`); ctx.fillStyle = g; for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); ctx.restore(); } }
}

// stencilled plates: one texture of 4 x 4 labels; SIGN gives each label's cell
export const SIGN = { mess: 0, berth: 1, ops: 2, galley: 3, workshop: 4, store: 5, office: 6, exit: 7, fire: 8, danger: 9, wtd: 10, aid: 11, smoke: 12, frame: 13, deck: 14, dc: 15 };
const SIGNS = [['MESS DECK', '#2f6b47'], ['BERTHING', '#2f6b47'], ['OPERATIONS', '#2f6b47'], ['GALLEY', '#2f6b47'], ['WORKSHOP', '#2f6b47'], ['STORES', '#2f6b47'], ["SHIP'S OFFICE", '#2f6b47'], ['EXIT  >', '#1f7a3a'],
  ['FIRE POINT', '#a8261c'], ['DANGER|HIGH VOLTAGE', '#d2aa18', '#141414'], ['WATERTIGHT DOOR|KEEP CLOSED AT SEA', '#1f4f86'], ['+|FIRST AID', '#e6e8e4', '#1f7a3a'], ['NO SMOKING', '#a8261c'], ['FR 64', '#d8dad6', '#141414'], ['MAIN DECK', '#1f4f86'], ['DAMAGE CONTROL|LOCKER', '#a8261c']];
function drawSigns(ctx, w, h) {
  const cw = w / 4, ch = h / 4; ctx.fillStyle = '#888'; ctx.fillRect(0, 0, w, h); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  SIGNS.forEach(([text, bg, fg = '#f2f3ef'], i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch, lines = text.split('|'); ctx.fillStyle = bg; ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = fg; ctx.lineWidth = Math.max(2, ch * 0.035); ctx.strokeRect(x + ch * 0.07, y + ch * 0.07, cw - ch * 0.14, ch - ch * 0.14); ctx.fillStyle = fg;
    lines.forEach((ln, j) => { let size = ch * (lines.length > 1 ? (j === 0 && ln.length < 3 ? 0.5 : 0.24) : 0.34); ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`; const tw = ctx.measureText(ln).width, max = cw - ch * 0.32; if (tw > max) { size *= max / tw; ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`; } ctx.fillText(ln, x + cw / 2, y + ch * (lines.length > 1 ? (j === 0 ? 0.36 : 0.7) : 0.52)); });
  });
}
/** a flat plate showing label `key`, w x h metres, for Kit.add(mats.signs, ...) */
export function signGeo(key, w = 0.5, h = 0.25) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, i = SIGN[key] ?? 0, col = i % 4, row = Math.floor(i / 4);
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k) * 0.96 + 0.02) / 4, (3 - row + uv.getY(k) * 0.94 + 0.03) / 4);
  return g;
}
const HP = Math.PI / 2;
const MATS = {};
export function interiorMats(nation) {
  if (MATS[nation]) return MATS[nation];
  const int = new THREE.MeshBasicMaterial({ vertexColors: true }); int.name = 'sdInterior.insignia';
  // No sun in here, so the look is built in the shader: the two textures laid on by the direction a surface faces (walls
  // and ceilings are plating, decks are tread), and the even light of ceiling tubes (decks brightest, walls a little
  // different by which way they face, undersides dimmer).
  const steel = registerTexture('int_steel', { draw: drawSteel }), deckT = registerTexture('int_deck', { draw: drawDeck });
  int.onBeforeCompile = (sh) => {
    sh.uniforms.uSteel = { value: steel }; sh.uniforms.uDeckT = { value: deckT };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vIP; varying vec3 vIN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvIP = position; vIN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uSteel; uniform sampler2D uDeckT; varying vec3 vIP; varying vec3 vIN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 an = abs( vIN ); vec3 tx; float lit;
        if ( an.y > 0.6 ) { if ( vIN.y > 0.0 ) { tx = texture2D( uDeckT, vIP.xz * 0.8 ).rgb; lit = 1.0; } else { tx = texture2D( uSteel, vIP.xz / 2.4 ).rgb; lit = 0.86; } }
        else if ( an.x > an.z ) { tx = texture2D( uSteel, vIP.zy / 2.4 ).rgb; lit = 0.9; }
        else { tx = texture2D( uSteel, vIP.xy / 2.4 ).rgb; lit = 0.98; }
        diffuseColor.rgb *= tx * lit * 1.22; }`);
  };
  int.customProgramCacheKey = () => 'sdInteriorTex';
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff3d8 }); lamp.name = 'sdLamp.insignia';
  const water = new THREE.MeshBasicMaterial({ color: 0x0b2c36, transparent: true, opacity: 0.82, depthWrite: false }); water.name = 'sdPool.insignia';
  const dark = new THREE.MeshBasicMaterial({ color: 0x020405 }); dark.name = 'sdDark.insignia';
  const signs = new THREE.MeshBasicMaterial({ map: registerTexture('int_signs', { aspect: 2, wrap: false, draw: drawSigns }) }); signs.name = 'sdSigns.insignia';
  return (MATS[nation] = { int, lamp, water, dark, signs, alert: 0 });
}
// 0 = normal white lighting, 1 = red battle-stations lighting
export function setAlert(mats, k) {
  if (Math.abs(k - mats.alert) < 0.004) return; mats.alert = k;
  mats.int.color.setRGB(1, 1 - 0.46 * k, 1 - 0.5 * k); mats.lamp.color.setRGB(1, 0.953 - 0.72 * k, 0.847 - 0.7 * k);
}

/** the parts of rectangle r (x0, x1, z0, z1 and whatever else it carries) that lie outside rectangle h */
export function minus(r, h) {
  if (h.x1 <= r.x0 || h.x0 >= r.x1 || h.z1 <= r.z0 || h.z0 >= r.z1) return [r];
  const out = [], z0 = Math.max(r.z0, h.z0), z1 = Math.min(r.z1, h.z1);
  if (h.z0 > r.z0) out.push({ ...r, z1: h.z0 });
  if (h.z1 < r.z1) out.push({ ...r, z0: h.z1 });
  if (h.x0 > r.x0) out.push({ ...r, z0, z1, x1: h.x0 });
  if (h.x1 < r.x1) out.push({ ...r, z0, z1, x0: h.x1 });
  return out;
}
export const minusAll = (list, holes) => holes.reduce((acc, h) => acc.flatMap((r) => minus(r, h)), list);

// ---- the plan (shared with the outside model: it cuts the same holes in its decks and roofs) -----------------------------------
export const PLAN = {
  yA: 8, yB: 4, h: 3.4, yBay: -7.6, bayTop: -1.0, yBridge: 24, bridgeTop: 27.4,
  shaft: { x0: -1.75, x1: 1.75, z0: -50.2, z1: -40.8 },       // the stair tower, lower deck to bridge
  hatch: { x0: -1.15, x1: 1.15, z0: 120.8, z1: 126.9 },       // stair from the upper deck to the main deck by the helipad
  bridge: { x0: -7.0, x1: 7.0, z0: -62.3, z1: -50.2 },
  bay: { x0: -9.75, x1: 9.75, z0: 57.3, z1: 134 },
  dock: { x: 0, y: -8.6, z: 98 },                             // where the docked submarine floats (its own waterline)
};

/** Build the interior into a new Group and add its decks, blocks and crew posts to model. Returns { group, mats, zones, hole }. */
export function buildInterior(nation, model, fine, fb) {
  const P = PLAN, M = interiorMats(nation), k = new Kit({ lod: 0, fine }), kl = new Kit({ lod: 0, fine }), g = new THREE.Group(); g.name = 'interior';
  const A = nation === 'aethia';
  const T = (hex, m = 1) => tone(M.int, hex, m);
  const WALL = T(0xb4bdb8), DADO = T(0x6d7a79), FLOOR = T(0x3b4246), FLOOR2 = T(0x4a5257), CEIL = T(0x8b9593), FRAME = T(0x47525a), STEEL = T(0x8f999e), DARKS = T(0x23292e), YEL = T(0xc9a227), RED = T(0xa3382b), BLUE = T(0x2c6788), WOOD = T(0x7a5c3d),
    CLOTH = T(A ? 0x35527e : 0x7a4a33), BED = T(0xb9b7a6), GREEN = T(0x3f6a4a), SCREEN = T(0x58d6b4), SCREEN2 = T(0xd6a04a), BRASS = T(0xa78a43), WHITE = T(0xd8dcda), HAZ = T(0xd9b21c);
  const decks = [], blocks = [], posts = [];
  const deck = (x0, x1, z0, z1, y) => decks.push({ x0, x1, z0, z1, y, in: 1 });
  const block = (xa, xb, za, zb, y0, y1) => blocks.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), y0, y1, in: 1 });
  const post = (x, y, z, yaw, kind = 'in') => posts.push({ x, y, z, yaw, kind, in: 1 });
  // boxes are given by their two corners, in either order
  const box = (c, xa, xb, ya, yb, za, zb, gr = null) => {
    const geo = new THREE.BoxGeometry(Math.abs(xb - xa), Math.abs(yb - ya), Math.abs(zb - za));
    if (gr) { const p = geo.attributes.position, col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const v = p.getY(i) > 0 ? gr[1] : gr[0]; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    k.add(c, geo, (xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2);
  };
  const lampBox = (xa, xb, ya, yb, za, zb) => kl.box(M.lamp, Math.abs(xb - xa), Math.abs(yb - ya), Math.abs(zb - za), (xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2);
  // floor slab (top at y) and ceiling (underside at y + h) of a room, with ceiling lamps; holes are left open
  const slab = (x0, x1, z0, z1, y, h, holes = [], col = FLOOR, ceilHoles = holes) => {
    for (const r of minusAll([{ x0, x1, z0, z1 }], holes)) box(col, r.x0, r.x1, y - 0.14, y, r.z0, r.z1);
    if (h) {
      for (const r of minusAll([{ x0, x1, z0, z1 }], ceilHoles)) box(CEIL, r.x0, r.x1, y + h, y + h + 0.12, r.z0, r.z1);
      const nx = Math.max(1, Math.round((x1 - x0) / 6)), nz = Math.max(1, Math.round((z1 - z0) / 7));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const x = x0 + ((i + 0.5) * (x1 - x0)) / nx, z = z0 + ((j + 0.5) * (z1 - z0)) / nz;
        if (ceilHoles.some((q) => x > q.x0 - 0.8 && x < q.x1 + 0.8 && z > q.z0 - 0.8 && z < q.z1 + 0.8)) continue;
        box(FRAME, x - 0.22, x + 0.22, y + h - 0.07, y + h, z - 0.75, z + 0.75); lampBox(x - 0.16, x + 0.16, y + h - 0.1, y + h - 0.07, z - 0.68, z + 0.68);
      }
    }
  };
  // a wall along X at z (axis 'x') or along Z at x (axis 'z'), from a0 to a1, with doorways [[g0, g1], ...] 2.1 m high
  const wall = (axis, c, a0, a1, y, h, gaps = [], th = 0.22) => {
    const seg = (b0, b1, y0, y1, col, gr = null) => { if (b1 - b0 < 0.02) return; if (axis === 'x') box(col, b0, b1, y0, y1, c - th / 2, c + th / 2, gr); else box(col, c - th / 2, c + th / 2, y0, y1, b0, b1, gr); };
    const gs = gaps.slice().sort((p, q) => p[0] - q[0]); let at = a0;
    const run = (b0, b1) => {
      if (b1 - b0 < 0.02) return;
      seg(b0, b1, y, y + 1.0, DADO, [0.62, 0.98]); if (h > 2.2) { seg(b0, b1, y + 1.0, y + h - 0.7, WALL, [0.9, 1.05]); seg(b0, b1, y + h - 0.7, y + h, WALL, [1.05, 0.76]); } else seg(b0, b1, y + 1.0, y + h, WALL, [0.9, 1.0]);
      if (fine) { seg(b0, b1, y, y + 0.1, FRAME); seg(b0, b1, y + 0.98, y + 1.03, FRAME); }
      if (axis === 'x') block(b0, b1, c - 0.16, c + 0.16, y, y + h); else block(c - 0.16, c + 0.16, b0, b1, y, y + h);
      if (fine) for (let q = Math.ceil(b0 / 2.5) * 2.5; q < b1 - 0.1; q += 2.5) { if (q - b0 < 0.2) continue; if (axis === 'x') box(FRAME, q - 0.05, q + 0.05, y, y + h, c - th / 2 - 0.05, c + th / 2 + 0.05); else box(FRAME, c - th / 2 - 0.05, c + th / 2 + 0.05, y, y + h, q - 0.05, q + 0.05); }
    };
    for (const [g0, g1] of gs) {
      run(at, g0);
      seg(g0, g1, y + 2.1, y + h, WALL);                                                      // lintel
      for (const e of [g0, g1]) { if (axis === 'x') box(FRAME, e - 0.07, e + 0.07, y, y + 2.16, c - th / 2 - 0.06, c + th / 2 + 0.06); else box(FRAME, c - th / 2 - 0.06, c + th / 2 + 0.06, y, y + 2.16, e - 0.07, e + 0.07); }
      if (axis === 'x') { box(FRAME, g0, g1, y + 2.1, y + 2.18, c - th / 2 - 0.06, c + th / 2 + 0.06); box(YEL, g0, g1, y, y + 0.03, c - th / 2 - 0.02, c + th / 2 + 0.02); } else { box(FRAME, c - th / 2 - 0.06, c + th / 2 + 0.06, y + 2.1, y + 2.18, g0, g1); box(YEL, c - th / 2 - 0.02, c + th / 2 + 0.02, y, y + 0.03, g0, g1); }
      at = g1;
    }
    run(at, a1);
  };
  // a flight of n shallow steps: from (zLow, yLow) rising toward dir (+1 aft, -1 forward). Each step is a small deck.
  const flight = (x0, x1, zLow, yLow, dir, n, rise, run) => {
    for (let i = 1; i <= n; i++) {
      const za = zLow + dir * (i - 1) * run, zb = zLow + dir * i * run, z0 = Math.min(za, zb), z1 = Math.max(za, zb), y = yLow + i * rise;
      deck(x0, x1, z0, z1, y);
      box(i % 2 ? FLOOR2 : FLOOR, x0, x1, y - rise - 0.04, y, z0, z1);
      if (fine) box(YEL, x0, x1, y - 0.012, y + 0.004, dir > 0 ? z0 : z1 - 0.04, dir > 0 ? z0 + 0.04 : z1);
    }
    // handrails on both sides
    for (const x of [x0 + 0.05, x1 - 0.05]) k.tube(STEEL, [x, yLow + 0.95, zLow], [x, yLow + n * rise + 0.95, zLow + dir * n * run], 0.025, 5);
  };
  // pipes and a cable tray along a corridor wall, just under the ceiling
  const services = (x, z0, z1, y) => {
    if (!fine) return;
    const s = Math.sign(x) || 1;
    k.tube(RED, [x - s * 0.22, y - 0.25, z0], [x - s * 0.22, y - 0.25, z1], 0.06, 6); k.tube(BLUE, [x - s * 0.22, y - 0.45, z0], [x - s * 0.22, y - 0.45, z1], 0.045, 6); k.tube(T(0xbfb48a), [x - s * 0.36, y - 0.3, z0], [x - s * 0.36, y - 0.3, z1], 0.035, 5);
    box(DARKS, x - s * 0.66, x - s * 0.46, y - 0.16, y - 0.12, z0, z1);
  };
  const sign = (x, y, z, face, col = GREEN) => { if (!fine) return; if (face === 'x') box(col, x - 0.01, x + 0.01, y, y + 0.22, z - 0.3, z + 0.3); else box(col, x - 0.3, x + 0.3, y, y + 0.22, z - 0.01, z + 0.01); };

  const yA = P.yA, yB = P.yB, H = P.h, SH = P.shaft, HT = P.hatch;

  // ============================================================== stair tower (lower deck 4 m ... bridge 24 m)
  {
    const lx0 = SH.x0 + 0.15, lx1 = -0.12, rx0 = 0.12, rx1 = SH.x1 - 0.15, zf0 = SH.z0 + 0.15, zf1 = SH.z0 + 1.75, za0 = SH.z1 - 1.75, za1 = SH.z1 - 0.15, n = 20, rise = 0.2, run = (za0 - zf1) / n;
    const levels = [4, 8, 12, 16, 20, 24];
    levels.forEach((y, i) => {
      const aft = i % 2 === 0; // the landing at this level is at the aft end for 4, 12, 20 and at the forward end for 8, 16, 24
      deck(lx0, rx1, aft ? za0 : SH.z0 - 0.1, aft ? SH.z1 + 0.1 : zf1, y); box(FLOOR2, lx0, rx1, y - 0.14, y, aft ? za0 : zf0, aft ? za1 : zf1);
      { const zl = aft ? za1 - 0.35 : zf0 + 0.35; lampBox(-0.6, 0.6, y + 3.0, y + 3.2, zl - 0.05, zl + 0.05); }
      box(WHITE, aft ? rx1 - 0.02 : lx0, aft ? rx1 : lx0 + 0.02, y + 1.5, y + 1.9, (aft ? za0 : zf0) + 0.5, (aft ? za0 : zf0) + 1.1); // deck number plate
      if (i < levels.length - 1) { if (aft) flight(rx0, rx1, za0, y, -1, n, rise, run); else flight(lx0, lx1, zf1, y, 1, n, rise, run); }
    });
    // the centre divider between the two lanes, and the dead ends of the lanes at the bottom and the top
    block(-0.12, 0.12, zf1, za0, 3.6, P.bridgeTop); box(FRAME, -0.06, 0.06, 4, P.bridgeTop, zf1 + 0.05, za0 - 0.05);
    block(lx0, lx1, zf1, za0, 3.6, 7.9); block(lx0, lx1, zf1, za0, 23.6, P.bridgeTop);
    box(FLOOR2, lx0, lx1, 23.86, 24, zf1, za0);                                                 // floor over the unused lane at the top
    box(FLOOR, SH.x0, SH.x1, 3.8, 3.96, SH.z0, SH.z1);                                          // the bottom of the tower
    // walls: sides full height; forward wall with doors at 8 (upper deck) and 24 (bridge); aft wall with a door at 4
    const band = [[4, 8], [8, 12], [12, 16], [16, 20], [20, 24], [24, P.bridgeTop]];
    for (const [y0, y1] of band) {
      wall('z', SH.x0, SH.z0, SH.z1, y0, y1 - y0); wall('z', SH.x1, SH.z0, SH.z1, y0, y1 - y0);
      wall('x', SH.z0, SH.x0, SH.x1, y0, y1 - y0, y0 === 8 || y0 === 24 ? [[-0.8, 0.8]] : []);
      wall('x', SH.z1, SH.x0, SH.x1, y0, y1 - y0, y0 === 4 ? [[-0.8, 0.8]] : []);
    }
    box(CEIL, SH.x0, SH.x1, P.bridgeTop, P.bridgeTop + 0.12, SH.z0, SH.z1);
  }

  // ============================================================== upper deck (8 m): lobby, corridor, mess, barracks, armoury
  {
    const y = yA, cx = 1.35, ox = 15.5, zL0 = -55, zL1 = -37, zEnd = 133, zRooms = 50;
    const shaftHole = { x0: SH.x0, x1: SH.x1, z0: SH.z0, z1: SH.z1 };
    // floors, ceilings and what can be walked on
    slab(-5, 5, zL0, zL1, y, H, [shaftHole]); for (const r of minus({ x0: -5, x1: 5, z0: zL0, z1: zL1 }, shaftHole)) deck(r.x0, r.x1, r.z0, r.z1, y);
    slab(-cx, cx, zL1, zEnd, y, H, [], FLOOR, [HT]); deck(-cx, cx, zL1 - 0.2, zEnd, y);
    if (fine) for (const s of [-1, 1]) box(YEL, s * (cx - 0.3) - 0.04, s * (cx - 0.3) + 0.04, y, y + 0.006, zL1, zEnd);
    // outer walls and ends
    wall('x', zL0, -5, 5, y, H); wall('z', -5, zL0, zL1, y, H); wall('z', 5, zL0, zL1, y, H);
    wall('x', zL1, -ox, -cx, y, H); wall('x', zL1, cx, ox, y, H); wall('z', -ox, zL1, zRooms, y, H); wall('z', ox, zL1, zRooms, y, H);
    wall('x', zEnd, -cx, cx, y, H);
    // rooms: [name, side, z0, z1, door z]
    const rooms = [['mess', 1, zL1, -10, -26.1], ['armory', 1, -10, 8, -1], ['bunksS', 1, 8, 34, 21], ['storeS', 1, 34, zRooms, 0], ['bunksP1', -1, zL1, -14, -26], ['bunksP2', -1, -14, 12, -1], ['ward', -1, 12, 34, 23], ['storeP', -1, 34, zRooms, 0]];
    for (const s of [-1, 1]) {
      const doors = rooms.filter((r) => r[1] === s && r[4]).map((r) => [r[4] - 0.7, r[4] + 0.7]);
      wall('z', s * cx, zL1, zRooms, y, H, doors); wall('z', s * cx, zRooms, zEnd, y, H);
      services(s * cx, zL1 + 0.3, zEnd - 0.3, y + H);
      for (const r of rooms.filter((q) => q[1] === s)) { if (r[3] < zRooms) wall('x', r[3], s > 0 ? cx : -ox, s > 0 ? ox : -cx, y, H); if (r[4]) sign(s * (cx - 0.13), y + 2.25, r[4], 'x'); }
      wall('x', zRooms, s > 0 ? cx : -ox, s > 0 ? ox : -cx, y, H);
    }
    for (const [name, s, z0, z1, dz] of rooms) {
      if (!dz) continue;
      const x0 = s > 0 ? cx : -ox, x1 = s > 0 ? ox : -cx; slab(x0, x1, z0, z1, y, H, [], name === 'mess' || name === 'ward' ? FLOOR2 : FLOOR); deck(x0, x1, z0, z1, y);
      const X = (t) => (s > 0 ? x0 + t : x1 - t); // t metres in from the corridor wall
      if (name === 'mess') {
        for (let z = z0 + 4; z < z1 - 3; z += 4.6) for (const t of [4.2, 9.2]) {
          const x = X(t); box(STEEL, x - 1.5, x + 1.5, y + 0.72, y + 0.78, z - 0.45, z + 0.45); box(FRAME, x - 0.06, x + 0.06, y, y + 0.72, z - 0.06, z + 0.06);
          for (const q of [-0.85, 0.85]) { box(CLOTH, x - 1.5, x + 1.5, y + 0.42, y + 0.48, z + q - 0.17, z + q + 0.17); box(FRAME, x - 1.4, x - 1.3, y, y + 0.42, z + q - 0.05, z + q + 0.05); box(FRAME, x + 1.3, x + 1.4, y, y + 0.42, z + q - 0.05, z + q + 0.05); }
          block(x - 1.5, x + 1.5, z - 1.0, z + 1.0, y, y + 0.9);
          if (fine) for (const q of [-0.9, 0, 0.9]) box(WHITE, x + q - 0.12, x + q + 0.12, y + 0.78, y + 0.8, z - 0.12, z + 0.12);
        }
        // serving counter along the forward wall
        box(STEEL, X(2.5), X(11.5), y, y + 0.95, z0 + 0.3, z0 + 1.2); block(Math.min(X(2.5), X(11.5)), Math.max(X(2.5), X(11.5)), z0 + 0.1, z0 + 1.3, y, y + 1.1); box(DARKS, X(2.5), X(11.5), y + 0.95, y + 0.99, z0 + 0.3, z0 + 1.2);
        if (fine) for (let t = 3.2; t < 11; t += 1.3) box(BRASS, X(t) - 0.25, X(t) + 0.25, y + 0.99, y + 1.2, z0 + 0.5, z0 + 1.0);
        post(X(4.2), y, z0 + 6.3, HP * s); post(X(9.2), y, z0 + 10.9, -HP * s); post(X(6.8), y, z0 + 2.1, Math.PI); post(X(2), y, z1 - 3, 0); post(X(11), y, z0 + 15.5, HP);
      } else if (name.startsWith('bunks')) {
        // rows of three-high bunks against the outer wall and across the room, lockers by the corridor wall
        for (let z = z0 + 1.6; z < z1 - 1.2; z += 3.1) {
          const xa = X(5.2), xb = X(12.6), bx0 = Math.min(xa, xb), bx1 = Math.max(xa, xb);
          for (const [fy, col] of [[0.35, BED], [1.25, BED], [2.15, BED]]) { box(FRAME, bx0, bx1, y + fy - 0.05, y + fy, z - 0.45, z + 0.45); box(col, bx0 + 0.05, bx1 - 0.05, y + fy, y + fy + 0.1, z - 0.4, z + 0.4); box(CLOTH, bx0 + 0.6, bx1 - 0.05, y + fy + 0.1, y + fy + 0.14, z - 0.4, z + 0.4); }
          for (const x of [bx0, (bx0 + bx1) / 2, bx1]) for (const q of [-0.45, 0.45]) box(FRAME, x - 0.03, x + 0.03, y, y + 2.5, z + q - 0.03, z + q + 0.03);
          block(bx0, bx1, z - 0.5, z + 0.5, y, y + 2.6);
        }
        for (let z = z0 + 0.8; z < z1 - 0.8; z += 0.62) { if (Math.abs(z - dz) < 1.3) continue; box(T(0x5c6a72), X(0.15), X(0.7), y, y + 1.9, z - 0.28, z + 0.28); if (fine) box(DARKS, X(0.7), X(0.72), y + 1.5, y + 1.6, z - 0.1, z + 0.1); }
        block(Math.min(X(0.1), X(0.75)), Math.max(X(0.1), X(0.75)), z0 + 0.5, dz - 1.3, y, y + 2); block(Math.min(X(0.1), X(0.75)), Math.max(X(0.1), X(0.75)), dz + 1.3, z1 - 0.5, y, y + 2);
        post(X(2.6), y, (z0 + z1) / 2 - 3, 0); post(X(3.4), y, (z0 + z1) / 2 + 4, Math.PI);
      } else if (name === 'armory') {
        // rifle racks along the walls, ammunition crates, a caged counter
        for (let z = z0 + 1; z < z1 - 0.8; z += 1.5) {
          box(DARKS, X(12.3), X(12.75), y, y + 2.1, z - 0.6, z + 0.6); box(FRAME, X(12.2), X(12.3), y + 0.3, y + 0.36, z - 0.6, z + 0.6); box(FRAME, X(12.2), X(12.3), y + 1.3, y + 1.36, z - 0.6, z + 0.6);
          if (fine) for (let q = -0.45; q <= 0.46; q += 0.18) { box(T(0x1b1e21), X(12.12), X(12.2), y + 0.4, y + 1.5, z + q - 0.025, z + q + 0.025); box(WOOD, X(12.1), X(12.2), y + 0.36, y + 0.72, z + q - 0.03, z + q + 0.03); }
        }
        block(Math.min(X(12), X(12.8)), Math.max(X(12), X(12.8)), z0 + 0.3, z1 - 0.3, y, y + 2.2);
        for (const [t, z, w, hh, col] of [[4, z0 + 2.2, 1.2, 0.6, GREEN], [4, z0 + 3.6, 1.2, 0.6, GREEN], [4.1, z0 + 2.9, 1.0, 1.15, T(0x56633f)], [8, z1 - 2.4, 1.4, 0.7, WOOD], [8, z1 - 4.2, 1.4, 0.7, WOOD], [6.2, z1 - 3.2, 0.9, 0.5, GREEN]]) {
          const x = X(t); box(col, x - w / 2, x + w / 2, y, y + hh, z - 0.4, z + 0.4); if (fine) box(HAZ, x - w / 2 - 0.005, x + w / 2 + 0.005, y + hh * 0.5, y + hh * 0.5 + 0.06, z - 0.405, z + 0.405); block(x - w / 2, x + w / 2, z - 0.4, z + 0.4, y, y + hh + 0.2);
        }
        box(STEEL, X(1.4), X(1.5), y, y + 1.05, dz + 1.6, z1 - 0.4); box(STEEL, X(1.4), X(3.2), y + 1.0, y + 1.05, dz + 1.6, dz + 2.2);
        post(X(6), y, (z0 + z1) / 2, HP * s); post(X(10), y, z0 + 5, -HP * s);
      } else if (name === 'ward') {
        // briefing room: a long chart table, chairs, a wall board
        const xm = X(6.5), zm = (z0 + z1) / 2; box(WOOD, xm - 1.1, xm + 1.1, y + 0.72, y + 0.8, zm - 4, zm + 4); for (const q of [-3.4, 3.4]) box(FRAME, xm - 0.9, xm + 0.9, y, y + 0.72, zm + q - 0.06, zm + q + 0.06);
        block(xm - 1.1, xm + 1.1, zm - 4, zm + 4, y, y + 0.95); box(SCREEN, xm - 0.7, xm + 0.7, y + 0.8, y + 0.815, zm - 2.6, zm + 2.6);
        for (let z = zm - 3.3; z <= zm + 3.4; z += 1.1) for (const q of [-1.6, 1.6]) { box(CLOTH, xm + q - 0.22, xm + q + 0.22, y + 0.42, y + 0.5, z - 0.22, z + 0.22); box(CLOTH, xm + q + Math.sign(q) * 0.2 - 0.03, xm + q + Math.sign(q) * 0.2 + 0.03, y + 0.5, y + 0.95, z - 0.22, z + 0.22); }
        box(DARKS, X(12.7), X(12.78), y + 0.9, y + 2.5, zm - 3, zm + 3); box(SCREEN2, X(12.66), X(12.7), y + 1.0, y + 2.4, zm - 2.8, zm + 2.8);
        post(X(3.5), y, zm - 2, HP * s); post(X(9.5), y, zm + 1, -HP * s); post(X(11.4), y, zm - 1, -HP * s);
      }
    }
    // people in the corridor
    post(0.6, y, -20, 0); post(-0.6, y, 14, Math.PI); post(0.6, y, 70, 0); post(-0.6, y, 104, Math.PI); post(3.4, y, -46, 0.5);
    // ---- the hatchway up to the main deck by the helipad: 20 steps rising aft
    flight(HT.x0 + 0.1, HT.x1 - 0.1, HT.z0 + 0.25, y, 1, 20, 0.2, (HT.z1 - HT.z0 - 0.25) / 20);
    block(HT.x0 - 0.12, HT.x0 + 0.12, HT.z0 + 0.3, HT.z1 + 0.3, y, fb); block(HT.x1 - 0.12, HT.x1 + 0.12, HT.z0 + 0.3, HT.z1 + 0.3, y, fb); block(HT.x0, HT.x1, HT.z1, HT.z1 + 0.3, y, fb - 0.3);
    for (const x of [HT.x0, HT.x1]) box(FRAME, x - 0.04, x + 0.04, y, fb, HT.z0 + 0.3, HT.z1 + 0.3); box(FRAME, HT.x0, HT.x1, y, fb - 0.2, HT.z1, HT.z1 + 0.25);
    sign(0, y + 2.4, HT.z0 - 0.4, 'z', BLUE);
  }

  // ============================================================== lower deck (4 m): corridor, engine rooms, the stair to the dock
  {
    const y = yB, cx = 1.35, ox = 16, z0 = SH.z1, z1 = 40, zE0 = -34, zE1 = 22;
    slab(-cx, cx, z0, z1, y, H); deck(-cx, cx, z0 - 0.1, z1 + 0.2, y);
    for (const s of [-1, 1]) {
      wall('z', s * cx, z0, z1, y, H, s > 0 ? [[-7.2, -5.8]] : [[-18.7, -17.3], [9.3, 10.7]]); services(s * cx, z0 + 0.3, z1 - 0.3, y + H);
      wall('x', zE0, s > 0 ? cx : -ox, s > 0 ? ox : -cx, y, H); wall('x', zE1, s > 0 ? cx : -ox, s > 0 ? ox : -cx, y, H); wall('z', s * ox, zE0, zE1, y, H);
    }
    wall('x', z0, -cx, -SH.x1, y, H); wall('x', z0, SH.x1, cx, y, H); wall('x', z1, -cx, cx, y, H, [[-1.1, 1.1]]);
    wall('x', -2, -ox, -cx, y, H);
    // starboard: main engine room. Two gas turbines in housings, reduction gear, a raised control desk, pipework
    slab(cx, ox, zE0, zE1, y, H, [], FLOOR2); deck(cx, ox, zE0, zE1, y);
    for (const zc of [-22, 6]) {
      box(T(0x56626c), 6.2, 12.8, y + 0.3, y + 2.5, zc - 6.5, zc + 6.5); block(6.2, 12.8, zc - 6.5, zc + 6.5, y, y + 2.6); box(DARKS, 6.0, 13.0, y, y + 0.3, zc - 6.8, zc + 6.8);
      k.cyl(STEEL, 1.0, 1.0, 0.9, 9.5, y + 2.95, zc - 3, 'y', 12); k.cyl(STEEL, 0.75, 0.75, 0.9, 9.5, y + 2.95, zc + 3.4, 'y', 12);
      if (fine) { for (let z = zc - 5.5; z <= zc + 5.6; z += 2.2) box(HAZ, 6.18, 6.2, y + 1.9, y + 2.05, z - 0.8, z + 0.8); for (const z of [zc - 4, zc, zc + 4]) { box(DARKS, 6.14, 6.2, y + 0.6, y + 1.7, z - 0.5, z + 0.5); box(SCREEN, 6.12, 6.14, y + 1.25, y + 1.55, z - 0.3, z + 0.3); } }
      k.tube(RED, [13.6, y + 0.6, zc - 6], [13.6, y + 0.6, zc + 6], 0.14, 8); k.tube(BLUE, [14.3, y + 1.3, zc - 6], [14.3, y + 1.3, zc + 6], 0.1, 8); k.tube(T(0xbfb48a), [14.9, y + 2.2, zc - 6], [14.9, y + 2.2, zc + 6], 0.18, 8);
    }
    box(T(0x4d5961), 7.0, 12.0, y, y + 1.8, -13.5, -2.5); block(7.0, 12.0, -13.5, -2.5, y, y + 2); k.cyl(BRASS, 0.5, 0.5, 6, 9.5, y + 0.9, 17, 'z', 10);   // reduction gear and a shaft
    box(DARKS, 3.2, 4.4, y, y + 1.05, 12, 17); box(SCREEN, 3.25, 4.35, y + 1.05, y + 1.07, 12.2, 16.8); block(3.1, 4.5, 11.9, 17.1, y, y + 1.2);                       // control desk
    post(5.2, y, -22, -HP, 'work'); post(5.2, y, 4, -HP, 'work'); post(5.0, y, 14.5, -HP); post(4.6, y, -8, HP, 'work'); post(4.4, y, -30, 0);
    // port forward: generator room. port aft: pumps and switchboards
    slab(-ox, -cx, zE0, -2, y, H); deck(-ox, -cx, zE0, -2, y); slab(-ox, -cx, -2, zE1, y, H); deck(-ox, -cx, -2, zE1, y);
    for (const zc of [-27, -19, -11]) { box(T(0x5f6b52), -13.5, -7.5, y + 0.25, y + 1.9, zc - 1.6, zc + 1.6); k.cyl(STEEL, 0.8, 0.8, 2.6, -10.5, y + 1.3, zc, 'x', 12); box(DARKS, -13.7, -7.3, y, y + 0.25, zc - 1.8, zc + 1.8); block(-13.7, -7.3, zc - 1.8, zc + 1.8, y, y + 2.1); }
    for (let z = 1; z < 20; z += 1.3) { box(T(0x59666e), -15.8, -15.1, y, y + 2.1, z - 0.6, z + 0.6); if (fine) { box(SCREEN2, -15.1, -15.08, y + 1.5, y + 1.7, z - 0.4, z + 0.4); box(RED, -15.1, -15.08, y + 1.1, y + 1.2, z - 0.1, z + 0.1); } }
    block(-15.9, -15.0, 0.3, 20.3, y, y + 2.2);
    for (const zc of [5, 13]) { k.cyl(BLUE, 0.9, 0.9, 1.6, -9.5, y + 0.8, zc, 'y', 12); k.cyl(STEEL, 0.5, 0.5, 2.6, -9.5, y + 1.3, zc, 'x', 10); block(-11, -8, zc - 1.2, zc + 1.2, y, y + 1.8); }
    post(-5.2, y, -19, HP, 'work'); post(-5, y, -27, HP); post(-13.8, y, 8, HP, 'work'); post(-6, y, 15, Math.PI);
    post(0.6, y, -30, 0); post(-0.6, y, 22, Math.PI);
    // ---- the stair down to the dock bay: 58 steps under the waterline, in its own trunk
    const n = 58, rise = 0.2, zs0 = z1, run = (P.bay.z0 - 0.5 - zs0) / n, sx = 1.25;
    for (let i = 1; i <= n; i++) { const yy = y - i * rise, za = zs0 + (i - 1) * run, zb = zs0 + i * run; deck(-sx + 0.15, sx - 0.15, za, zb, yy); box(i % 2 ? FLOOR2 : FLOOR, -sx, sx, yy - rise - 0.04, yy, za, zb); }
    deck(-sx + 0.15, sx - 0.15, zs0 + n * run, P.bay.z0 + 0.2, P.yBay); box(FLOOR2, -sx, sx, P.yBay - 0.14, P.yBay, zs0 + n * run, P.bay.z0 + 0.2);
    for (const s of [-1, 1]) { box(WALL, s * sx - 0.11, s * sx + 0.11, P.yBay, y + H, z1, P.bay.z0); block(s * sx - 0.16, s * sx + 0.16, z1, P.bay.z0, P.yBay - 0.4, y + H); k.tube(STEEL, [s * (sx - 0.16), y + 0.95, zs0], [s * (sx - 0.16), P.yBay + 0.95, zs0 + n * run], 0.025, 5); }
    { // sloped ceiling of the trunk, 2.9 m above the treads, with lamps
      const dz = n * run, dy = n * rise, len = Math.hypot(dz, dy), a = Math.atan2(dy, dz);
      k.box(CEIL, sx * 2, 0.12, len, 0, y + 2.9 - dy / 2, zs0 + dz / 2, [a, 0, 0]);
      for (let t = 0.12; t < 1; t += 0.2) kl.box(M.lamp, 0.3, 0.05, 1.0, 0, y + 2.82 - dy * t, zs0 + dz * t, [a, 0, 0]);
      box(WALL, -sx, sx, y + 2.1, y + H, z1 + 0.11, z1 + 0.3); box(CEIL, -sx, sx, P.yBay + 2.9, P.yBay + 3.02, zs0 + dz - 0.5, P.bay.z0);
    }
    sign(0, y + 2.3, z1 - 0.14, 'z', BLUE);
  }

  // ============================================================== submarine dock bay (under the waterline)
  {
    const B = P.bay, y = P.yBay, top = P.bayTop, wx = 5.2, zc = 62.5, pool = -15.2, wl = P.dock.y + 0.05;
    // walkways: one across the forward end, one down each side of the berth
    deck(B.x0, B.x1, B.z0, zc, y); box(FLOOR2, B.x0, B.x1, y - 0.2, y, B.z0, zc);
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? wx : B.x0, x1 = s > 0 ? B.x1 : -wx;
      deck(x0, x1, zc, B.z1, y); box(FLOOR2, x0, x1, y - 0.2, y, zc, B.z1);
      box(DARKS, s * wx - 0.1, s * wx + 0.1, pool, y - 0.2, zc, B.z1);                                       // side of the berth below the walkway
      block(s * wx - 0.15, s * wx + 0.15, zc - 0.15, B.z1, y, y + 2.2);                                     // the rail along the water's edge
      k.tube(STEEL, [s * wx, y + 1.05, zc], [s * wx, y + 1.05, B.z1], 0.03, 5); k.tube(STEEL, [s * wx, y + 0.55, zc], [s * wx, y + 0.55, B.z1], 0.02, 4);
      for (let z = zc; z <= B.z1; z += 2.4) k.tube(STEEL, [s * wx, y, z], [s * wx, y + 1.05, z], 0.025, 4);
      if (fine) { box(HAZ, s * (wx + 0.25) - 0.08, s * (wx + 0.25) + 0.08, y, y + 0.006, zc, B.z1); for (let z = 70; z < B.z1 - 4; z += 12) { box(T(0x16181a), s * (wx - 0.28) - 0.22, s * (wx - 0.28) + 0.22, y - 1.6, y - 0.3, z - 0.6, z + 0.6); k.cyl(DARKS, 0.16, 0.2, 0.5, s * 6.4, y + 0.25, z + 3, 'y', 8); } }
      // gangway across to the casing by the sail
      const gz = P.dock.z - 12; box(FLOOR2, s > 0 ? 1.6 : -wx, s > 0 ? wx : -1.6, y - 0.08, y, gz - 0.5, gz + 0.5); for (const q of [-0.5, 0.5]) k.tube(STEEL, [s * 1.6, y + 0.9, gz + q], [s * wx, y + 0.9, gz + q], 0.02, 4);
      // outer walls with frames, pipes and lamps; lockers and a tool bench
      wall('z', s > 0 ? B.x1 : B.x0, B.z0, B.z1, y, top - y);
      k.tube(RED, [s * 9.4, y + 4.6, B.z0 + 0.5], [s * 9.4, y + 4.6, B.z1 - 0.5], 0.09, 6); k.tube(BLUE, [s * 9.4, y + 4.2, B.z0 + 0.5], [s * 9.4, y + 4.2, B.z1 - 0.5], 0.07, 6);
      for (let z = 68; z < B.z1 - 3; z += 9) { kl.box(M.lamp, 0.06, 0.25, 1.4, s * 9.55, y + 3.4, z); box(FRAME, s * 9.6 - 0.04, s * 9.6 + 0.04, y + 3.2, y + 3.6, z - 0.8, z + 0.8); }
      for (let z = 66; z < 76; z += 0.62) box(T(0x5c6a72), s * 9.6, s * 9.25, y, y + 1.9, z - 0.28, z + 0.28); block(s * 9.6, s * 9.2, 65.6, 76.4, y, y + 2);
      post(s * 7.4, y, 84 + s * 9, -s * HP, s > 0 ? 'work' : 'in'); post(s * 7.2, y, 112 - s * 6, s > 0 ? 0 : Math.PI);
    }
    block(-wx, wx, zc - 0.15, zc + 0.15, y, y + 2.2); k.tube(STEEL, [-wx, y + 1.05, zc], [wx, y + 1.05, zc], 0.03, 5); k.tube(STEEL, [-wx, y + 0.55, zc], [wx, y + 0.55, zc], 0.02, 4); for (let x = -wx; x <= wx; x += 2.08) k.tube(STEEL, [x, y, zc], [x, y + 1.05, zc], 0.025, 4);
    box(DARKS, -wx, wx, pool, y - 0.2, zc - 0.1, zc + 0.1); box(DARKS, B.x0, B.x1, pool - 0.2, pool, zc, B.z1);
    // forward wall (the stair comes in through it), ceiling with girders and floodlights, the aft wall with the tunnel to the hull doors
    wall('x', B.z0, B.x0, B.x1, y, top - y, [[-1.1, 1.1]]);
    box(CEIL, B.x0, B.x1, top, top + 0.15, B.z0, B.z1);
    for (let z = B.z0 + 4; z < B.z1; z += 6) { box(FRAME, B.x0, B.x1, top - 0.45, top, z - 0.15, z + 0.15); for (const x of [-6.5, 0, 6.5]) kl.box(M.lamp, 1.6, 0.06, 0.4, x, top - 0.5, z); }
    box(YEL, -1.0, 1.0, top - 1.1, top - 0.5, 96, 100); k.tube(DARKS, [0, top - 1.1, 98], [0, top - 2.4, 98], 0.04, 4);                                                        // travelling hoist
    for (const s of [-1, 1]) { box(WALL, s > 0 ? 6 : B.x0, s > 0 ? B.x1 : -6, y, top, B.z1 - 0.11, B.z1 + 0.11); block(s > 0 ? 6 : B.x0, s > 0 ? B.x1 : -6, B.z1 - 0.2, B.z1 + 0.2, y, top); box(HAZ, s * 6 - 0.2, s * 6 + 0.2, pool, top, B.z1 - 0.2, B.z1 + 0.2); }
    box(HAZ, -6, 6, top - 0.5, top, B.z1 - 0.2, B.z1 + 0.2);
    k.add(M.dark, new THREE.PlaneGeometry(12.6, top - pool), 0, (top + pool) / 2, B.z1 + 16, [0, Math.PI, 0]);          // the tunnel runs aft into darkness
    for (const s of [-1, 1]) { box(DARKS, s * 6.3 - 0.1, s * 6.3 + 0.1, pool, top, B.z1, B.z1 + 16); } box(DARKS, -6.3, 6.3, top - 0.1, top + 0.1, B.z1, B.z1 + 16); box(DARKS, -6.3, 6.3, pool - 0.1, pool + 0.1, B.z1, B.z1 + 16);
    // the water in the berth
    kl.add(M.water, new THREE.PlaneGeometry(wx * 2, B.z1 + 16 - zc), 0, wl, (zc + B.z1 + 16) / 2, [-HP, 0, 0]);
    post(-2.5, y, 59.8, 0); post(3, y, 60, Math.PI * 0.8);
  }

  // ============================================================== bridge (24 m): consoles, helm, chart table. The walls are part of the outside model
  {
    const R = P.bridge, y = P.yBridge;
    deck(R.x0, R.x1, R.z0, R.z1 + 0.2, y);
    box(DARKS, R.x0 + 0.6, R.x1 - 0.6, y, y + 1.0, R.z0 + 0.45, R.z0 + 1.25); block(R.x0 + 0.5, R.x1 - 0.5, R.z0 + 0.3, R.z0 + 1.35, y, y + 1.05);
    for (let x = R.x0 + 1.3; x < R.x1 - 1; x += 1.5) box(x > -1 && x < 1 ? SCREEN2 : SCREEN, x - 0.5, x + 0.5, y + 1.0, y + 1.02, R.z0 + 0.6, R.z0 + 1.15);
    k.cyl(BRASS, 0.42, 0.42, 0.05, 0, y + 1.25, R.z0 + 1.42, 'z', 16); box(DARKS, -0.25, 0.25, y, y + 1.1, R.z0 + 1.3, R.z0 + 1.6);                              // the wheel
    for (const x of [-3.4, 3.4]) { box(CLOTH, x - 0.3, x + 0.3, y + 0.55, y + 0.65, R.z0 + 3.0, R.z0 + 3.6); box(CLOTH, x - 0.3, x + 0.3, y + 0.65, y + 1.3, R.z0 + 3.55, R.z0 + 3.65); k.cyl(FRAME, 0.06, 0.2, 0.55, x, y + 0.28, R.z0 + 3.3, 'y', 8); block(x - 0.4, x + 0.4, R.z0 + 2.9, R.z0 + 3.75, y, y + 1.2); }
    box(WOOD, -5.6, -3.2, y + 0.85, y + 0.92, R.z1 - 4.2, R.z1 - 1.4); box(FRAME, -5.5, -3.3, y, y + 0.85, R.z1 - 4.1, R.z1 - 1.5); box(SCREEN, -5.3, -3.5, y + 0.92, y + 0.93, R.z1 - 4.0, R.z1 - 1.6); block(-5.7, -3.1, R.z1 - 4.3, R.z1 - 1.3, y, y + 1);
    box(DARKS, 3.6, 5.8, y, y + 1.9, R.z1 - 1.3, R.z1 - 0.5); box(SCREEN2, 3.8, 5.6, y + 1.0, y + 1.7, R.z1 - 1.32, R.z1 - 1.3); block(3.5, 5.9, R.z1 - 1.4, R.z1 - 0.3, y, y + 2);
  }

  k.build(g, { cast: false, receive: false }); kl.build(g, { cast: false, receive: false });
  g.visible = false;
  model.decks.push(...decks); model.blocks.push(...blocks); model.posts.push(...posts);
  // zones: the boxes a camera can be in when it is inside the ship (used to switch off the underwater look and the sea surface)
  const zones = [
    { x0: -16.3, x1: 16.3, z0: -55.3, z1: 133.3, y0: yB - 0.2, y1: fb - 0.1 },
    { x0: SH.x0 - 0.2, x1: SH.x1 + 0.2, z0: SH.z0 - 0.2, z1: SH.z1 + 0.2, y0: yB - 0.2, y1: P.bridgeTop },
    { x0: -1.5, x1: 1.5, z0: 39.8, z1: P.bay.z0 + 0.3, y0: P.yBay - 0.3, y1: yB + 0.2 },
    { x0: P.bay.x0 - 0.2, x1: P.bay.x1 + 0.2, z0: P.bay.z0 - 0.2, z1: P.bay.z1 + 16, y0: -15.6, y1: P.bayTop + 0.3 },
  ];
  return { group: g, mats: M, zones, hole: { x0: -12, x1: 12, z0: 36, z1: 152 }, bay: { y: P.yBay, z0: P.bay.z0, z1: P.bay.z1 } };
}
