// People kit: the canvas-painted textures and the shared materials every human figure uses (fabric, camouflage per nation,
// skin with a painted face, load-bearing gear, boots, visor glass, the rifle) plus the uniform and headgear tables.
// Everything is created once and cached: figures share materials, colours that differ per person live in vertex colours.
import * as THREE from 'three';
import { registerTexture } from '../../gfx/materials.js';
import { people } from './people.js';

/* ---------------------------------------------------------------- helpers */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TILES = new Map();
function noiseTile(n, seed) {
  const key = n + ':' + seed; let c = TILES.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), im = x.createImageData(n, n), r = mulberry(seed * 977 + n);
  for (let i = 0; i < im.data.length; i += 4) { const v = (r() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); TILES.set(key, c); return c;
}
function tiled(ctx, w, h, tile, scale, alpha, op, smooth = false) {
  ctx.save(); ctx.imageSmoothingEnabled = smooth; const p = ctx.createPattern(tile, 'repeat'); p.setTransform(new DOMMatrix().scale(scale, scale));
  ctx.globalAlpha = alpha; if (op) ctx.globalCompositeOperation = op; ctx.fillStyle = p; ctx.fillRect(0, 0, w, h); ctx.restore();
}
// fine cloth: per-thread speckle plus a faint diagonal twill, both far below the size of a camouflage shape
function weave(ctx, w, h, seed, amount = 1) {
  tiled(ctx, w, h, noiseTile(256, seed), 1, 0.2 * amount, 'overlay');
  const t = document.createElement('canvas'); t.width = t.height = 4; const x = t.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 4, 4); x.fillStyle = '#b4b4b4'; for (let i = 0; i < 4; i++) x.fillRect(i, i, 1, 1); x.fillStyle = '#585858'; for (let i = 0; i < 4; i++) x.fillRect((i + 2) % 4, i, 1, 1);
  tiled(ctx, w, h, t, Math.max(1, w / 1024), 0.16 * amount, 'overlay');
}
// large soft light and dark patches (wear, fading) that break up any repetition
function fade(ctx, w, h, seed, n, alpha) {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const cx = r() * w, cy = r() * h, rad = (0.12 + r() * 0.22) * w, light = r() < 0.5;
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const g = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, rad);
      g.addColorStop(0, `rgba(${light ? '255,255,255' : '0,0,0'},${alpha})`); g.addColorStop(1, `rgba(${light ? '255,255,255' : '0,0,0'},0)`);
      ctx.fillStyle = g; ctx.fillRect(cx + dx - rad, cy + dy - rad, rad * 2, rad * 2);
    }
  }
}
function blob(ctx, cx, cy, s, r) {
  const k = 7 + ((r() * 4) | 0), pts = [], el = 0.7 + r() * 1.3, rot = r() * 3.14, co = Math.cos(rot), si = Math.sin(rot);
  for (let j = 0; j < k; j++) { const a = (j / k) * 6.2832, rad = s * (0.5 + r() * 0.85), x = Math.cos(a) * rad * el, y = Math.sin(a) * rad; pts.push([x * co - y * si, x * si + y * co]); }
  return (ox, oy) => {
    ctx.beginPath();
    for (let j = 0; j <= k; j++) { const p = pts[j % k], q = pts[(j + 1) % k], mx = cx + ox + (p[0] + q[0]) / 2, my = cy + oy + (p[1] + q[1]) / 2; if (j === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(cx + ox + p[0], cy + oy + p[1], mx, my); }
    ctx.closePath(); ctx.fill();
  };
}
function blobs(ctx, w, h, r, n, size, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { const d = blob(ctx, r() * w, r() * h, size * w * (0.6 + r() * 0.9), r); for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) d(ox, oy); }
}

// Digital camouflage: small square cells in clusters, several layers, the way printed uniform cloth looks. The tile is
// 0.55 m of cloth, so a cell is about 3 mm. P: [base, mid dark, mid light, darkest, lightest].
function pnoise(seed, period) { // repeating value noise on a lattice of `period` cells
  const r = mulberry(seed), g = new Float32Array(period * period); for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = (i, j) => g[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
    return (a(xi, yi) * (1 - sx) + a(xi + 1, yi) * sx) * (1 - sy) + (a(xi, yi + 1) * (1 - sx) + a(xi + 1, yi + 1) * sx) * sy; };
}
function digitalCamo(ctx, w, h, P, seed) {
  const G = 176, c = document.createElement('canvas'); c.width = c.height = G; const x = c.getContext('2d'), im = x.createImageData(G, G), d = im.data;
  const rgb = P.map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
  // each layer: big drifting shapes broken up by two finer scales, wider than tall like real patterns
  const L = [[1, 0.56], [2, 0.6], [3, 0.655], [4, 0.7]].map(([k, th], i) => ({ k, th, a: pnoise(seed + i * 17 + 1, 5), b: pnoise(seed + i * 17 + 2, 11), c: pnoise(seed + i * 17 + 3, 44) }));
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    let col = rgb[0];
    for (const l of L) { const u = i / G, v = j / G, n = l.a(u * 5, v * 5) * 0.5 + l.b(u * 11, v * 11) * 0.32 + l.c(u * 44, v * 44) * 0.18; if (n > l.th) col = rgb[l.k]; }
    const o = (j * G + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  x.putImageData(im, 0, 0); ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0, w, h); ctx.restore();
}

/* ------------------------------------------------------------ nation kits */
export const JERSEY = { yellow: 0xd9ad18, green: 0x2c7a36, red: 0xb32d24, blue: 0x2552a6, white: 0xe2e2de, brown: 0x6b4526, purple: 0x6d3a94 };
export const JERSEY_KEYS = Object.keys(JERSEY);
const NAT = {
  aethia: { camo: ['#586573', '#414c59', '#727e8a', '#2c353f', '#8b96a1'], work: 0x4a5c78, work2: 0x35455d, flight: 0x5a6776, flightHelmet: 0xd5d9dc, helmet: 0x5d6b78, carrier: 0x4d5863, pouch: 0x424c56, glove: 0x59616a, deck: 0x2b3442, cap: 0x2a3850, flak: 0x69747e, khaki: 0xb3a482, web: 0x3a4148 },
  extro: { camo: ['#2f3a34', '#1c2421', '#435244', '#12362e', '#566250'], work: 0x3d4c42, work2: 0x2b3630, flight: 0x3e4539, flightHelmet: 0x2b322f, helmet: 0x2b3530, carrier: 0x272d2c, pouch: 0x1f2524, glove: 0x4a4f43, deck: 0x262b28, cap: 0x1f2a25, flak: 0x3a433e, khaki: 0x8b886a, web: 0x1d2120 },
};
export const NATION_KIT = NAT;
const BOOT = 0x1d1b19, SOLE = 0x0d0d0d, BELT = 0x1c1c1b;

// A uniform is data, so later cosmetics only add entries here. opts.jersey picks the flight-deck colour.
// cloth: which fabric the body uses ('camo' = the nation's pattern, 'plain' = dyed cloth tinted by the colours below).
export const UNIFORMS = {
  fatigues: (n) => ({ cloth: 'camo', top: 0xffffff, bottom: 0xffffff, glove: NAT[n].glove, vest: 'carrier', vestCol: NAT[n].carrier, pouchCol: NAT[n].pouch, pockets: true, fit: { off: 0.0155, fold: 1.4 }, belt: NAT[n].web, gearBelt: true }),
  working: (n) => ({ cloth: 'plain', top: NAT[n].work, bottom: NAT[n].work2, glove: null, vest: null, belt: BELT, shirt: true, tuck: true, fit: { off: 0.01, fold: 0.8 } }),
  khaki: (n) => ({ cloth: 'plain', top: NAT[n].khaki, bottom: NAT[n].khaki, glove: null, vest: null, belt: BELT, shirt: true, tuck: true, fit: { off: 0.009, fold: 0.6 } }),
  battle: (n) => ({ cloth: 'plain', top: NAT[n].work, bottom: NAT[n].work2, glove: 0x8a8672, vest: 'flak', vestCol: NAT[n].flak, belt: BELT, tuck: true, fit: { off: 0.01, fold: 0.8 } }),
  flightsuit: (n) => ({ cloth: 'plain', top: NAT[n].flight, bottom: NAT[n].flight, glove: NAT[n].glove, vest: 'harness', vestCol: NAT[n].web, pouchCol: NAT[n].pouch, belt: NAT[n].web, zip: true, tuck: true, fit: { off: 0.012, fold: 0.9 } }),
  jersey: (n, o) => { const j = JERSEY[o.jersey] ?? JERSEY.yellow; return { cloth: 'plain', top: j, bottom: NAT[n].deck, glove: 0x86704c, vest: 'float', vestCol: j, vestShade: 0.78, belt: BELT, tintTop: true, tuck: true, fit: { off: 0.008, fold: 0.6 } }; },
  // looks sold in the Hangar
  arctic: (n) => ({ cloth: 'plain', top: 0xdde1e4, bottom: 0xd0d5d9, glove: 0x2b2e31, vest: null, belt: NAT[n].web, fur: 0x8f7d66, pockets: true, fit: { off: 0.021, fold: 1.1 } }),
  tacops: (n) => ({ ...UNIFORMS.fatigues(n), vestCol: 0x1b1d1f, pouchCol: 0x25282a, glove: 0x151617, belt: 0x151617, kneeboard: true }),
  dress: (n) => ({ cloth: 'plain', top: n === 'aethia' ? 0xe2e2dd : 0x25342d, bottom: n === 'aethia' ? 0x1c2535 : 0x141917, glove: 0xe6e6e2, vest: null, belt: n === 'aethia' ? 0xe6e6e2 : 0x121212, shirt: true, ribbons: true, sword: true, tuck: true, fit: { off: 0.01, fold: 0.35 } }),
  drysuit: (n) => ({ cloth: 'plain', top: 0x17191b, bottom: 0x17191b, glove: 0x0e0f10, vest: null, belt: 0x25282b, weights: true, fins: true, stripe: n === 'aethia' ? 0x3a6ea8 : 0x1f7a66, tuck: true, noCollar: true, fit: { off: 0.004, fold: 0.15 } }),
  heavy: (n) => ({ ...UNIFORMS.fatigues(n), vestCol: n === 'aethia' ? 0x3c444d : 0x1a1f1e, plates: true }),
};
// what each role wears unless opts.uniform / opts.helmet say otherwise
export const ROLES = {
  marine: { uniform: 'fatigues', helmet: 'combat', rifle: true },
  sailor: { uniform: 'working', helmet: 'cap' },
  crew: { uniform: 'working', helmet: 'cap' },
  officer: { uniform: 'khaki', helmet: 'cap' },
  gunner: { uniform: 'battle', helmet: 'combat' },
  lookout: { uniform: 'battle', helmet: 'combat', prop: 'binoculars' },
  pilot: { uniform: 'flightsuit', helmet: 'flight' },
  deck: { uniform: 'jersey', helmet: 'cranial' },
};
export function uniformDef(nation, key, opts = {}) {
  const f = UNIFORMS[UNIFORM_ALIAS[key] || key] || UNIFORMS.fatigues, u = f(nation, opts);
  u.key = key; u.boot = BOOT; u.sole = SOLE; u.nat = NAT[nation];
  if (opts.vest === true && !u.vest) { u.vest = 'float'; u.vestCol = 0xc8521c; u.vestShade = 1; }
  return u;
}
// names used by the cosmetics shop (js/core/cosmetics.js) for the looks that exist so far; unknown keys fall back to the role's own
export const UNIFORM_ALIAS = { standard: 'fatigues', deckcrew: 'jersey', flight: 'flightsuit', officer: 'dress', diver: 'drysuit' };
export const HELMET_ALIAS = { standard: 'combat', deckcrew: 'cranial', officer: 'peaked' };
export const HELMETS = ['combat', 'cap', 'cranial', 'flight', 'none', 'arctic', 'tacops', 'peaked', 'diver', 'heavy'];
export const ACCESSORIES = ['tacpack', 'parachute', 'oxygen', 'dualoxygen', 'magpouches', 'radio', 'grenades', 'flaregun', 'diveknife', 'sidearm', 'gasmask', 'binoculars', 'kneepads', 'shoulderpads', 'padset', 'dogtags', 'chemlights'];
export function helmetColor(nation, key) { const k = NAT[nation]; return key === 'flight' ? k.flightHelmet : key === 'cap' ? k.cap : k.helmet; }

/* ------------------------------------------------------------------ faces */
export const SKIN = [
  { skin: '#c39373', lip: '#9c5f55', hair: '#2a2019', brow: '#30241b', rgb: 0xc39373 },
  { skin: '#a67550', lip: '#7d4a3d', hair: '#15110e', brow: '#17120f', rgb: 0xa67550 },
  { skin: '#d6aa8b', lip: '#b06f66', hair: '#5a4630', brow: '#4f3d2b', rgb: 0xd6aa8b },
  { skin: '#7a5238', lip: '#5c372c', hair: '#0e0c0b', brow: '#0e0c0b', rgb: 0x7a5238 },
];
// The head is unwrapped like a globe: u = 0.5 is the nose, u = 0 / 1 the back of the head; v runs chin (0) to crown (1).
// hairline(deg) = the v above which hair grows at that angle round the head (0 = front, 180 = back).
export function hairline(deg) {
  const a = Math.abs(deg), L = (x, a0, a1, v0, v1) => v0 + (v1 - v0) * Math.min(1, Math.max(0, (x - a0) / (a1 - a0)));
  if (a < 38) return 0.87; if (a < 66) return L(a, 38, 66, 0.87, 0.7); if (a < 82) return L(a, 66, 82, 0.7, 0.56);
  if (a < 100) return L(a, 82, 100, 0.56, 0.66); if (a < 128) return L(a, 100, 128, 0.66, 0.27); return 0.25;
}
const HEAD_H = 0.233, HEAD_C = 0.553; // metres covered by v = 0..1 and by u = 0..1 (round the head at eye level)
function drawFace(ctx, w, h, tone) {
  const T = SKIN[tone], r = mulberry(31 + tone * 7), X = (u) => u * w, Y = (v) => (1 - v) * h, mx = w / HEAD_C, my = h / HEAD_H;
  const soft = (u, v, ru, rv, col, a) => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); ctx.save(); ctx.translate(X(u), Y(v)); ctx.scale(ru * mx, rv * my); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.3); ctx.fill(); ctx.restore(); };
  const ell = (u, v, ru, rv, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(X(u), Y(v), ru * mx, rv * my, 0, 0, 6.3); ctx.fill(); };
  ctx.fillStyle = T.skin; ctx.fillRect(0, 0, w, h);
  tiled(ctx, w, h, noiseTile(64, 5), w / 64 / 6, 0.06, 'overlay', true); // faint blotchiness
  tiled(ctx, w, h, noiseTile(256, 9), 1, 0.05, 'overlay'); // pores
  // hair: a short military cut, drawn first so the face shading sits over the hairline
  ctx.save(); ctx.filter = `blur(${Math.max(1, w / 220)}px)`; ctx.fillStyle = T.hair; ctx.beginPath(); ctx.moveTo(0, 0);
  for (let i = 0; i <= 90; i++) { const u = i / 90; ctx.lineTo(X(u), Y(hairline((u - 0.5) * 360))); }
  ctx.lineTo(w, 0); ctx.closePath(); ctx.globalAlpha = 0.93; ctx.fill(); ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, w / 700);
  for (let i = 0; i < 900; i++) { const u = r(), v = hairline((u - 0.5) * 360) + 0.02 + r() * 0.75; if (v > 1) continue; ctx.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(150,130,110,0.22)'; ctx.beginPath(); ctx.moveTo(X(u), Y(v)); ctx.lineTo(X(u) + (r() - 0.5) * w * 0.006, Y(v) + w * (0.006 + r() * 0.012)); ctx.stroke(); }
  ctx.restore();
  // shading: eye sockets, under the cheekbones, under the nose and lip, the jaw line, a little colour in the cheeks
  for (const s of [-1, 1]) {
    soft(0.5 + s * 0.064, 0.565, 0.028, 0.018, 'rgba(60,30,20,A)', 0.5);
    soft(0.5 + s * 0.095, 0.4, 0.03, 0.03, 'rgba(190,80,60,A)', 0.14);
    soft(0.5 + s * 0.13, 0.3, 0.03, 0.035, 'rgba(40,20,10,A)', 0.2);
    soft(0.5 + s * 0.022, 0.42, 0.012, 0.03, 'rgba(60,30,20,A)', 0.16); // side of the nose
  }
  soft(0.5, 0.355, 0.022, 0.012, 'rgba(50,25,15,A)', 0.35); soft(0.5, 0.215, 0.03, 0.012, 'rgba(50,25,15,A)', 0.25);
  soft(0.5, 0.22, 0.11, 0.07, 'rgba(40,45,55,A)', 0.14); // shaved jaw
  const g = ctx.createLinearGradient(0, Y(0.2), 0, Y(0.06)); g.addColorStop(0, 'rgba(40,20,10,0)'); g.addColorStop(0.5, 'rgba(40,20,10,0.3)'); g.addColorStop(1, 'rgba(40,20,10,0)'); ctx.fillStyle = g; ctx.fillRect(X(0.2), Y(0.2), X(0.6), Y(0.06) - Y(0.2));
  for (const s of [-1, 1]) {
    const u = 0.5 + s * 0.064, v = 0.565;
    // brows: a few dozen short hairs along a gentle arch
    ctx.strokeStyle = T.brow; ctx.lineWidth = Math.max(1.5, w / 300); ctx.globalAlpha = 0.9;
    for (let i = 0; i < 70; i++) { const f = r(), bu = u + s * (f - 0.42) * 0.066, bv = v + 0.062 + Math.sin(f * 3.1) * 0.012 - f * 0.006 + (r() - 0.5) * 0.012; ctx.beginPath(); ctx.moveTo(X(bu), Y(bv)); ctx.lineTo(X(bu + s * 0.008), Y(bv + 0.008)); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // eye: white, iris, pupil, a glint, then the lids as dark arcs
    ctx.save(); ctx.beginPath(); ctx.ellipse(X(u), Y(v), 0.015 * mx, 0.0062 * my, 0, 0, 6.3); ctx.clip();
    ell(u, v, 0.015, 0.0062, '#d6cfc5'); ell(u, v + 0.004, 0.0064, 0.0064, '#33241a'); ell(u, v + 0.004, 0.003, 0.003, '#070605'); ell(u - 0.004, v + 0.011, 0.0012, 0.0012, 'rgba(255,255,255,0.8)');
    const sh = ctx.createLinearGradient(0, Y(v + 0.022), 0, Y(v)); sh.addColorStop(0, 'rgba(30,15,10,0.65)'); sh.addColorStop(1, 'rgba(30,15,10,0)'); ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(30,15,10,0.95)'; ctx.lineWidth = Math.max(1.5, w / 260); ctx.beginPath(); ctx.ellipse(X(u), Y(v), 0.0158 * mx, 0.0067 * my, 0, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,30,20,0.45)'; ctx.lineWidth = Math.max(1, w / 520); ctx.beginPath(); ctx.ellipse(X(u), Y(v), 0.0154 * mx, 0.0064 * my, 0, 0, Math.PI); ctx.stroke();
  }
  // mouth
  ctx.fillStyle = T.lip; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.ellipse(X(0.5), Y(0.262), 0.024 * mx, 0.0048 * my, 0, 0, Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(X(0.5), Y(0.268), 0.025 * mx, 0.0034 * my, 0, Math.PI, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(45,18,14,0.85)'; ctx.lineWidth = Math.max(1, w / 420); ctx.beginPath(); ctx.moveTo(X(0.452), Y(0.268)); ctx.quadraticCurveTo(X(0.5), Y(0.262), X(0.548), Y(0.268)); ctx.stroke();
}

/* --------------------------------------------------------------- textures */
let TEXS = null;
function textures() {
  if (TEXS) return TEXS;
  const T = TEXS = { camo: {}, face: [] };
  for (const n of ['aethia', 'extro']) {
    T.camo[n] = registerTexture('hk_camo_' + n, { draw(ctx, w, h) {
      const P = NAT[n].camo, r = mulberry(n === 'aethia' ? 101 : 202);
      digitalCamo(ctx, w, h, P, n === 'aethia' ? 101 : 202);
      fade(ctx, w, h, 77, 9, 0.06); weave(ctx, w, h, 3, 1.15);
    } });
  }
  T.cloth = registerTexture('hk_cloth', { draw(ctx, w, h) { ctx.fillStyle = '#dcdcdc'; ctx.fillRect(0, 0, w, h); fade(ctx, w, h, 41, 12, 0.07); weave(ctx, w, h, 5, 0.9); } });
  T.clothN = registerTexture('hk_clothN', { kind: 'normal', strength: 3.2, draw(ctx, w, h) {
    const r = mulberry(909); ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
    // folds: long soft ridges and valleys running mostly across the limb
    for (let i = 0; i < 70; i++) {
      const cx = r() * w, cy = r() * h, len = (0.1 + r() * 0.3) * w, wd = (0.012 + r() * 0.03) * w, rot = (r() - 0.5) * 1.1 + (r() < 0.25 ? 1.2 : 0), up = r() < 0.5, a = 0.1 + r() * 0.16;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        ctx.save(); ctx.translate(cx + dx, cy + dy); ctx.rotate(rot); ctx.scale(len, wd);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1), c = up ? '255,255,255' : '0,0,0'; g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.3); ctx.fill(); ctx.restore();
      }
    }
    weave(ctx, w, h, 12, 0.55);
  } });
  T.gear = registerTexture('hk_gear', { scale: 0.5, draw(ctx, w, h) { ctx.fillStyle = '#d2d2d2'; ctx.fillRect(0, 0, w, h); fade(ctx, w, h, 5, 10, 0.1); tiled(ctx, w, h, noiseTile(256, 21), 1, 0.3, 'overlay'); } });
  T.gearN = registerTexture('hk_gearN', { scale: 0.5, kind: 'normal', strength: 1.6, draw(ctx, w, h) {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
    const t = document.createElement('canvas'); t.width = t.height = 4; const x = t.getContext('2d'); x.fillStyle = '#6c6c6c'; x.fillRect(0, 0, 4, 4); x.fillStyle = '#a0a0a0'; x.fillRect(0, 0, 2, 2); x.fillRect(2, 2, 2, 2);
    tiled(ctx, w, h, t, Math.max(1, w / 512), 0.6, null); tiled(ctx, w, h, noiseTile(256, 33), 1, 0.25, 'overlay');
  } });
  for (let i = 0; i < SKIN.length; i++) T.face[i] = registerTexture('hk_face_' + i, { scale: 0.5, wrap: true, draw(ctx, w, h) { drawFace(ctx, w, h, i); } });
  T.blob = registerTexture('hk_blob', { size: 64, wrap: false, draw(ctx, w, h) { ctx.clearRect(0, 0, w, h); const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.45, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); } });
  T.flash = registerTexture('hk_flash', { size: 128, wrap: false, draw(ctx, w, h) {
    ctx.clearRect(0, 0, w, h); const r = mulberry(4), c = w / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.25, 'rgba(255,205,110,0.85)'); g.addColorStop(0.6, 'rgba(255,130,40,0.25)'); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.2832, rr = c * (i % 2 ? 0.3 + r() * 0.15 : 0.7 + r() * 0.3); ctx.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  } });
  return T;
}

/* -------------------------------------------------------------- materials */
const M = { cloth: {}, skin: [], glass: {} };
const V2 = (v) => new THREE.Vector2(v, v);
export const kit = {
  tex: textures,
  // body fabric. 'camo' carries the nation's pattern; 'plain' is dyed cloth whose colour comes from the vertex colours.
  cloth(nation, kind = 'camo') {
    const key = kind === 'camo' ? 'camo_' + nation : 'plain', T = textures();
    return M.cloth[key] || (M.cloth[key] = new THREE.MeshStandardMaterial({ name: 'hk_cloth_' + key, map: kind === 'camo' ? T.camo[nation] : T.cloth, normalMap: T.clothN, normalScale: V2(1), roughness: 0.93, metalness: 0, vertexColors: true }));
  },
  gear() { const T = textures(); return M.gear || (M.gear = new THREE.MeshStandardMaterial({ name: 'hk_gear', map: T.gear, normalMap: T.gearN, normalScale: V2(0.6), roughness: 0.8, metalness: 0.02, vertexColors: true })); },
  skin(tone = 0) {
    const T = textures(), i = ((tone % SKIN.length) + SKIN.length) % SKIN.length; if (M.skin[i]) return M.skin[i];
    // with the MakeHuman base: the skin atlas (head, hands, eyes) made by tools/people/build.py
    const map = people.ready ? registerTexture('hk_skinp_' + i, { aspect: people.meta.atlas[0] / people.meta.atlas[1], scale: 2, wrap: false, draw(ctx, w, h) { ctx.drawImage(people.skin(i), 0, 0, w, h); } }) : T.face[i];
    // skin: a soft sheen at grazing angles (the light that scatters in skin and its fine hair) and a gentle highlight
    if (people.ready) return (M.skin[i] = new THREE.MeshPhysicalMaterial({ name: 'hk_skin_' + i, map, roughness: 0.52, metalness: 0, vertexColors: true, sheen: 0.55, sheenRoughness: 0.45, sheenColor: new THREE.Color(i === 3 ? 0x5a3626 : 0xd98a6a), specularIntensity: 0.55 }));
    return (M.skin[i] = new THREE.MeshStandardMaterial({ name: 'hk_skin_' + i, map, roughness: 0.58, metalness: 0, vertexColors: true }));
  },
  glass(kind = 'visor') {
    return M.glass[kind] || (M.glass[kind] = new THREE.MeshStandardMaterial(kind === 'lens'
      ? { name: 'hk_lens', color: 0x2a3d4a, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.4 }
      : { name: 'hk_visor', color: 0x16130f, roughness: 0.07, metalness: 0.92, envMapIntensity: 1.5 }));
  },
  rifle() { return M.rifle || (M.rifle = new THREE.MeshStandardMaterial({ name: 'hk_rifle', color: 0xffffff, roughness: 0.5, metalness: 0.45, vertexColors: true })); },
  brass() { return M.brass || (M.brass = new THREE.MeshStandardMaterial({ name: 'hk_brass', color: 0xb8923f, roughness: 0.35, metalness: 0.9 })); },
  // one material for the baked crowd figures: vertex colours, and the per-person colour only where the mesh says so (`tint`)
  crowd() {
    if (M.crowd) return M.crowd;
    const T = textures(), m = M.crowd = new THREE.MeshStandardMaterial({ name: 'hk_crowd', map: T.cloth, normalMap: T.clothN, normalScale: V2(0.5), roughness: 0.9, metalness: 0, vertexColors: true });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float tint;')
        .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, tint );'));
    };
    m.customProgramCacheKey = () => 'hk_crowd';
    return m;
  },
  // soft dark patch under a person's feet
  blob() { const T = textures(); return M.blob || (M.blob = new THREE.MeshBasicMaterial({ name: 'hk_blob', map: T.blob, transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, color: 0x000000 })); },
  flash() { const T = textures(); return M.flash || (M.flash = new THREE.MeshBasicMaterial({ name: 'hk_flash', map: T.flash, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })); },
};
let BLOB_GEO = null;
export function blobGeometry() { if (!BLOB_GEO) { BLOB_GEO = new THREE.PlaneGeometry(1, 1); BLOB_GEO.rotateX(-Math.PI / 2); } return BLOB_GEO; }
