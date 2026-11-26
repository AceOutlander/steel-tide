// Ship toolkit (v2 models): textures, shared materials, hull lofting, superstructure blocks and deck fittings for the
// ships, the carrier, the submarines and the deck turrets. Axes as everywhere: +Y up, bow = -Z, starboard = +X, metres.
//
// MATERIALS (shipMats(nation), all shared and created once):
//   hull / sup / deck / flight / sub   ShipPaint: `map` is a big soft paint tile (64 or 32 m, so the paint schemes in
//       js/gfx/paint.js recolour it), the shader lays a detail tile over it (weld seams, plating dished between frames,
//       access plates, rust and salt streaks, non-skid grit, coating tiles) with matching normal and roughness maps.
//       UVs are METRES, projected per face (ShipKit does it), so nothing stretches and no texel grid shows. Vertex colours
//       tint the paint (dark fittings, white radomes, gun barrels: all one draw call). The hull paint also draws the
//       anti-fouling, the boot-topping band and the salt line from the height above the waterline.
//   trim / metal / lamp / glass come from the aircraft kit (vertex-coloured fittings, lights, dark reflective glazing).
// GEOMETRY: makeHull() (flared bow, knuckle, tumblehome, bilge, transom, bulwarks), house() (sloped, chamfered deckhouse
// with wall frames to hang doors, windows and ladders on), rail(), and a set of fittings written in local coordinates and
// placed with ShipKit.at() / ShipKit.frame().
import * as THREE from 'three';
import { MAT, registerTexture, hullNumberMaterial } from '../../gfx/materials.js';
import { Kit, C, tone, trim, metal, lamp, rng, fineDetail, cboxGeo, latheZ, wingGeo, cached, stats, airMats } from './airkit.js';

export { C, tone, trim, metal, lamp, rng, fineDetail, cboxGeo, latheZ, wingGeo, cached, stats };
import { addCabins } from './cabins.js';

const TAU = Math.PI * 2, HP = Math.PI / 2, V3 = THREE.Vector3;
const YA = new V3(0, 1, 0), ONE = new V3(1, 1, 1);
const LW = tone(lamp, 0xf2efe2, 0.95);   // a lamp lens in daylight (not lit)
const _v = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------------------------------------------------ textures */

const PAL = {
  aethia: { hull: '#98a3ad', hull2: '#8a95a0', anti: '#6a2f2a', boot: '#17191b', sup: '#a4aeb7', deck: '#4d5359', flight: '#313438', sub: '#272d34', rail: 0x7d868e },
  extro: { hull: '#353a3d', hull2: '#1f4a44', anti: '#141516', boot: '#7c2b1d', sup: '#2c4541', deck: '#2a2f2e', flight: '#2b2e30', sub: '#1f2925', rail: 0x24292b },
};
const g = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const LAT = new Map();
function lattice(n, seed) {
  const key = n + ':' + seed; let c = LAT.get(key); if (c) return c;
  c = mk(n, n); const x = c.getContext('2d'), im = x.createImageData(n, n), r = rng(seed * 7919 + n);
  for (let i = 0; i < im.data.length; i += 4) { const v = (r() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); LAT.set(key, c); return c;
}
function fbm(ctx, w, h, seed, cells = 4, oct = 5) {
  let first = true;
  for (let o = oct - 1; o >= 0; o--) {
    const n = cells << o; if (n > h) continue;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const p = ctx.createPattern(lattice(n, seed + o * 17), 'repeat'); p.setTransform(new DOMMatrix().scale(w / n, h / n));
    ctx.globalAlpha = first ? 1 : 0.5; ctx.fillStyle = p; ctx.fillRect(0, 0, w, h); ctx.restore(); first = false;
  }
  if (first) { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h); }
}
function mottle(ctx, w, h, seed, cells, alpha, op = 'soft-light') {
  const t = mk(w, h); fbm(t.getContext('2d'), w, h, seed, cells, 5);
  ctx.save(); ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha; ctx.drawImage(t, 0, 0); ctx.restore();
}
function wrapXY(ctx, w, h, fn) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); } }
// small presets: paint at 1024 and scale down, so marks keep their real size and simply soften
const hi = (draw) => (ctx, w, h) => {
  if (w >= 1024) return draw(ctx, w, h);
  const c = mk(1024, Math.round((1024 * h) / w)); draw(c.getContext('2d', { willReadFrequently: true }), c.width, c.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c, 0, 0, w, h);
};

// --- big soft paint tiles (the `map` of each paint)
function drawBase(ctx, w, h, nation, kind) {
  const P = PAL[nation], A = nation === 'aethia', r = rng((A ? 11 : 23) + kind.length * 7);
  ctx.fillStyle = P[kind]; ctx.fillRect(0, 0, w, h);
  if (kind === 'hull' && !A) { // hard-edged sea-green and black splinters over charcoal
    const cols = ['#1f4a44', '#24292c', '#27584d', '#1b403b'];
    for (let i = 0; i < 9; i++) {
      const cx = r() * w, cy = r() * h, rad = w * (0.09 + r() * 0.1), np = 4 + ((r() * 2) | 0), rot = 0.5 + r() * 0.5, pts = [];
      for (let k = 0; k < np; k++) { const a = ((k + r() * 0.5) / np) * TAU, rr = rad * (0.6 + r() * 0.6), x = Math.cos(a) * rr * 2.2, y = Math.sin(a) * rr * 0.8; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
      ctx.fillStyle = cols[i % cols.length];
      wrapXY(ctx, w, h, () => { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); });
    }
  } else if (kind === 'hull' || kind === 'sup') { // faint repainted patches
    for (let i = 0; i < 7; i++) {
      const x = r() * w, y = r() * h, rx = w * (0.05 + r() * 0.09), ry = h * (0.03 + r() * 0.06), gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, i % 2 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(128,128,128,0)');
      wrapXY(ctx, w, h, () => { ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.fillStyle = gr; ctx.fillRect(-1, -1, 2, 2); ctx.restore(); });
    }
  } else if (kind === 'deck' || kind === 'flight') { // oil, hydraulic fluid and scuffed patches
    for (let i = 0; i < 22; i++) {
      const x = r() * w, y = r() * h, rx = w * (0.015 + r() * 0.05), ry = rx * (0.4 + r() * 0.6), rot = r() * 3, gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gr.addColorStop(0, i % 3 ? 'rgba(0,0,0,0.16)' : 'rgba(210,210,200,0.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      wrapXY(ctx, w, h, () => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx, ry); ctx.fillStyle = gr; ctx.fillRect(-1, -1, 2, 2); ctx.restore(); });
    }
  }
  mottle(ctx, w, h, A ? 131 : 137, 3, kind === 'sub' ? 0.42 : 0.3);
  mottle(ctx, w, h, A ? 141 : 149, 14, 0.11);
}

// --- panel detail (hull plating, superstructure panels, submarine coating tiles): one layout shared by the colour,
//     height and roughness textures of each set. Canvas +y is DOWN on the model, so streaks run that way.
function panelLayout(seed, o) {
  const r = rng(seed), rows = []; let y = 0;
  while (y < 0.999) {
    let hh = o.rh + r() * o.rv; if (1 - (y + hh) < o.rh * 0.8) hh = 1 - y;
    const xs = []; let x = o.brick ? (rows.length % 2) * o.cw * 0.5 : r() * 0.3; const x0 = x;
    while (x < x0 + 1 - o.cw * 0.6) { xs.push(x); x += o.cw + r() * o.cv; }
    rows.push({ y0: y, y1: y + hh, xs, tone: xs.map(() => (r() < (o.odd || 0) ? (r() < 0.5 ? -1.6 : 2.2) : r())) });
    y += hh;
  }
  const L = { rows, hatches: [], vents: [], streaks: [], stencils: [], chips: [] };
  for (let i = 0; i < (o.hatches || 0); i++) L.hatches.push({ x: r(), y: r(), w: 0.035 + r() * 0.06, h: 0.03 + r() * 0.05, round: r() < 0.4 });
  for (let i = 0; i < (o.vents || 0); i++) L.vents.push({ x: r(), y: r() });
  for (let i = 0; i < (o.streaks || 0); i++) { const row = rows[(r() * rows.length) | 0]; L.streaks.push({ x: r(), y: row.y0, len: 0.04 + r() * (o.streakLen || 0.2), wd: 0.002 + r() * 0.006, a: 0.12 + r() * 0.3, kind: r() < (o.rust ?? 0.3) ? 'rust' : r() < (o.salt ?? 0.3) ? 'salt' : 'dirt' }); }
  for (let i = 0; i < (o.stencils || 0); i++) L.stencils.push({ x: r(), y: r(), n: 1 + ((r() * 2) | 0), w: 0.02 + r() * 0.03, kind: r() < 0.5 ? 'w' : r() < 0.5 ? 'r' : 'y', seed: (r() * 1e6) | 0 });
  for (let i = 0; i < (o.chips || 0); i++) L.chips.push({ x: r(), y: r(), s: 0.001 + r() * 0.0025 });
  return L;
}
const SETS = {
  plate: { tile: 16, seed: 301, rh: 0.1, rv: 0.06, cw: 0.34, cv: 0.2, frames: 1 / 22, streaks: 34, streakLen: 0.24, rust: 0.45, salt: 0.4, chips: 160, rough: 150, toneC: 3.5, seamA: 0.3, nrm: 1.6 },
  panel: { tile: 8, seed: 311, rh: 0.15, rv: 0.16, cw: 0.2, cv: 0.26, hatches: 9, vents: 3, streaks: 40, streakLen: 0.2, rust: 0.2, salt: 0.15, stencils: 8, chips: 200, rough: 146, toneC: 5, seamA: 0.25, nrm: 1.5 },
  tiles: { tile: 8, seed: 321, rh: 0.1, rv: 0, cw: 0.1, cv: 0, brick: true, odd: 0.07, streaks: 46, streakLen: 0.3, rust: 0, salt: 0.75, chips: 120, rough: 190, toneC: 11, seamA: 0.34, nrm: 1.4 },
};
function drawPanels(ctx, w, h, mode, key) {
  const o = SETS[key], L = o.L || (o.L = panelLayout(o.seed, o)), px = w / 1024, col = mode === 'col', hgt = mode === 'hgt', rgh = mode === 'rgh';
  const wx = (fn) => { for (const dx of [-w, 0, w]) { ctx.save(); ctx.translate(dx, 0); fn(); ctx.restore(); } };
  ctx.fillStyle = g(rgh ? o.rough : 128); ctx.fillRect(0, 0, w, h);
  const each = (fn) => { for (const row of L.rows) row.xs.forEach((x0, k) => fn(row, x0, k + 1 < row.xs.length ? row.xs[k + 1] : row.xs[0] + 1, k)); };
  if (!hgt) each((row, x0, x1, k) => { const t = row.tone[k] - 0.5; ctx.fillStyle = g(col ? 128 + t * o.toneC : o.rough + t * 9); wx(() => ctx.fillRect(x0 * w, row.y0 * h, (x1 - x0) * w + 1, (row.y1 - row.y0) * h + 1)); });
  if (col) { mottle(ctx, w, h, o.seed + 1, 5, 0.26, 'overlay'); mottle(ctx, w, h, o.seed + 3, 36, 0.1, 'overlay'); }
  if (rgh) { mottle(ctx, w, h, o.seed + 5, 6, 0.34, 'overlay'); mottle(ctx, w, h, o.seed + 7, 48, 0.16, 'overlay'); }
  if (hgt) {
    ctx.save(); ctx.globalAlpha = 0.07; const t = mk(w, h); fbm(t.getContext('2d'), w, h, o.seed + 9, 6, 3); ctx.drawImage(t, 0, 0); ctx.restore();
    if (o.frames) for (const row of L.rows) { // plating dished between the frames behind it
      const y0 = row.y0 * h + 3 * px, hh = (row.y1 - row.y0) * h - 6 * px;
      const fr = rng(Math.round(row.y0 * 977) + 5);
      for (let x = 0; x < 0.9999; x += o.frames) { const a = 0.015 + fr() * 0.05, gr = ctx.createLinearGradient(x * w, 0, (x + o.frames) * w, 0); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(0,0,0,${a})`); gr.addColorStop(1, `rgba(255,255,255,${a})`); ctx.fillStyle = gr; ctx.fillRect(x * w, y0, o.frames * w + 1, hh); }
    }
  }
  const seams = () => { ctx.beginPath(); each((row, x0, x1) => { const X0 = Math.round(x0 * w) + 0.5, Y0 = Math.round(row.y0 * h) + 0.5; ctx.moveTo(X0, Y0); ctx.lineTo(X0, Math.round(row.y1 * h) + 0.5); ctx.moveTo(X0, Y0); ctx.lineTo(Math.round(x1 * w) + 0.5, Y0); }); wx(() => ctx.stroke()); };
  if (col) { ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 4 * px; seams(); ctx.strokeStyle = `rgba(8,8,10,${o.seamA})`; ctx.lineWidth = 1.1 * px; seams(); }
  if (rgh) { ctx.strokeStyle = 'rgba(235,235,235,0.5)'; ctx.lineWidth = 1.4 * px; seams(); }
  if (hgt) { ctx.strokeStyle = g(66); ctx.lineWidth = 1.9 * px; seams(); }
  const rr = (x, y, ww, hh, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + ww, y, x + ww, y + hh, rad); ctx.arcTo(x + ww, y + hh, x, y + hh, rad); ctx.arcTo(x, y + hh, x, y, rad); ctx.arcTo(x, y, x + ww, y, rad); ctx.closePath(); };
  for (const q of L.hatches) wrapXY(ctx, w, h, () => { // bolted access plates
    const x = q.x * w, y = q.y * h, ww = q.w * w, hh = q.h * h, rad = q.round ? Math.min(ww, hh) * 0.25 : 2 * px;
    rr(x, y, ww, hh, rad);
    if (hgt) { ctx.fillStyle = g(140); ctx.fill(); ctx.strokeStyle = g(58); ctx.lineWidth = 1.8 * px; ctx.stroke(); }
    else if (col) { ctx.fillStyle = 'rgba(140,140,140,0.22)'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2 * px; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(150,150,150,0.5)'; ctx.fill(); ctx.strokeStyle = 'rgba(240,240,240,0.7)'; ctx.lineWidth = 1.4 * px; ctx.stroke(); }
    ctx.fillStyle = hgt ? g(176) : col ? 'rgba(0,0,0,0.4)' : 'rgba(90,90,90,0.9)';
    const fs = Math.max(1.5, 2.4 * px), nx = Math.max(2, Math.round(ww / (13 * px))), ny = Math.max(2, Math.round(hh / (13 * px)));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) if (i === 0 || j === 0 || i === nx || j === ny) ctx.fillRect(x + 3 * px + ((ww - 6 * px - fs) * i) / nx, y + 3 * px + ((hh - 6 * px - fs) * j) / ny, fs, fs);
  });
  for (const q of L.vents) wrapXY(ctx, w, h, () => { // louvres
    ctx.fillStyle = hgt ? g(44) : col ? 'rgba(0,0,0,0.7)' : 'rgba(250,250,250,0.9)';
    for (let i = 0; i < 5; i++) ctx.fillRect(q.x * w, q.y * h + i * 6 * px, 34 * px, 2.6 * px);
  });
  if (!hgt) for (const q of L.streaks) wrapXY(ctx, w, h, () => { // rust, salt and dirt running down from the seams
    const x = q.x * w, y = q.y * h, len = q.len * h, wd = Math.max(1.5, q.wd * w), gr = ctx.createLinearGradient(0, y, 0, y + len);
    const rgb = col ? (q.kind === 'rust' ? '118,60,26' : q.kind === 'salt' ? '226,228,220' : '14,14,16') : q.kind === 'salt' ? '200,200,200' : '236,236,236';
    const a = q.a * (col ? (q.kind === 'salt' ? 0.5 : 1) : 1.5);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); ctx.fillStyle = gr; ctx.fillRect(x - wd / 2, y, wd, len);
    if (col && q.kind === 'rust') { ctx.fillStyle = 'rgba(66,32,14,0.55)'; ctx.beginPath(); ctx.arc(x, y, wd * 0.8, 0, TAU); ctx.fill(); }
  });
  if (col) {
    for (const q of L.stencils) wrapXY(ctx, w, h, () => {
      const x = q.x * w, y = q.y * h, ww = q.w * w, lh = 4.5 * px, rs = rng(q.seed), ink = q.kind === 'w' ? 'rgba(240,240,240,0.6)' : q.kind === 'r' ? 'rgba(225,50,35,0.8)' : 'rgba(245,195,40,0.8)';
      ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, 1.1 * px);
      for (let i = 0; i < q.n; i++) { let cx = x; while (cx < x + ww) { const lw = (2 + rs() * 7) * px; ctx.fillRect(cx, y + i * lh * 1.5, Math.min(lw, x + ww - cx), Math.max(1, 1.6 * px)); cx += lw + 2 * px; } }
      if (q.kind !== 'w') ctx.strokeRect(x - 3 * px, y - 3 * px, ww + 6 * px, q.n * lh * 1.5 + 4 * px);
    });
    ctx.fillStyle = key === 'tiles' ? 'rgba(180,190,185,0.2)' : 'rgba(70,40,24,0.35)';
    for (const q of L.chips) ctx.fillRect(q.x * w, q.y * h, Math.max(1, q.s * w * 1.6), Math.max(1, q.s * w));
  } else if (rgh) { ctx.fillStyle = 'rgba(236,236,236,0.5)'; for (const q of L.chips) ctx.fillRect(q.x * w, q.y * h, Math.max(1, q.s * w * 1.6), Math.max(1, q.s * w)); }
}
// --- non-skid deck coating: fine grit, no pattern. 4 m per repeat.
function drawGrit(ctx, w, h, mode) {
  const col = mode === 'col', hgt = mode === 'hgt', r = rng(977);
  ctx.fillStyle = g(mode === 'rgh' ? 216 : 128); ctx.fillRect(0, 0, w, h);
  const noise = (a, op) => { ctx.save(); ctx.imageSmoothingEnabled = false; const p = ctx.createPattern(lattice(1024, 91), 'repeat'); p.setTransform(new DOMMatrix().scale(w / 1024, h / 1024)); ctx.globalAlpha = a; ctx.globalCompositeOperation = op; ctx.fillStyle = p; ctx.fillRect(0, 0, w, h); ctx.restore(); };
  noise(hgt ? 0.5 : col ? 0.16 : 0.14, hgt ? 'source-over' : 'overlay');
  mottle(ctx, w, h, 981, 8, hgt ? 0.12 : 0.22, hgt ? 'source-over' : 'overlay');
  if (!hgt) { // scuffs
    ctx.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, len = w * (0.03 + r() * 0.12), a = r() * TAU, lt = r() < 0.5;
      ctx.strokeStyle = col ? (lt ? 'rgba(200,200,195,0.07)' : 'rgba(0,0,0,0.1)') : 'rgba(120,120,120,0.25)'; ctx.lineWidth = w * (0.002 + r() * 0.006);
      wrapXY(ctx, w, h, () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke(); });
    }
  }
}

/* ----------------------------------------------------------------------------------------------------------- materials */

// `map` is the big paint tile; the detail tile is laid over it at the normal map's scale (0.5 = neutral). uWL = (on, top of
// the anti-fouling, top of the boot-topping, top of the waterline grime) in metres above the waterline (model y).
export class ShipPaint extends THREE.MeshStandardMaterial {
  constructor(o) {
    super(); this.isShipPaint = true; this.isAirPaint = true; // isAirPaint: Kit then gives it vertex colours and unshared faces
    this.detailMap = null; this.wl = new THREE.Vector4(0, 0, 0, 1); this.anti = new THREE.Color(0); this.boot = new THREE.Color(0);
    if (o) this.setValues(o);
  }
  copy(s) { super.copy(s); this.detailMap = s.detailMap; if (s.wl) { this.wl.copy(s.wl); this.anti.copy(s.anti); this.boot.copy(s.boot); } return this; }
  onBeforeCompile(sh) {
    sh.uniforms.tDetail = { value: this.detailMap }; sh.uniforms.uWL = { value: this.wl }; sh.uniforms.uAnti = { value: this.anti }; sh.uniforms.uBoot = { value: this.boot };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vShipY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShipY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D tDetail; uniform vec4 uWL; uniform vec3 uAnti; uniform vec3 uBoot; varying float vShipY;')
      .replace('#include <map_fragment>', `#if defined( USE_MAP ) && defined( USE_NORMALMAP )
        vec3 stDet = texture2D( tDetail, vNormalMapUv ).rgb * 2.0;
        vec3 stCol = texture2D( map, vMapUv ).rgb * stDet;
        if ( uWL.x > 0.5 ) {
          float y = vShipY + ( stDet.g - 1.0 ) * 0.12;
          stCol *= mix( vec3( 1.0 ), vec3( 0.74, 0.73, 0.68 ), ( 1.0 - smoothstep( uWL.z, uWL.w, y ) ) * 0.6 );
          stCol = mix( stCol, vec3( 0.52, 0.53, 0.5 ) * stDet, ( 1.0 - smoothstep( uWL.z, uWL.z + ( uWL.w - uWL.z ) * 0.35, y ) ) * 0.22 );
          stCol = mix( uBoot * ( 0.55 + stDet * 0.45 ), stCol, smoothstep( uWL.z - 0.03, uWL.z + 0.03, y ) );
          stCol = mix( uAnti * ( 0.5 + stDet * 0.5 ), stCol, smoothstep( uWL.y - 0.03, uWL.y + 0.03, y ) );
        }
        diffuseColor.rgb *= stCol;
      #endif`);
  }
}

const TEXS = {}, MATS = {};
function detailSet(key) {
  if (TEXS[key]) return TEXS[key];
  const grit = key === 'grit', m = grit ? 4 : SETS[key].tile, draw = (mode) => hi((c, w, h) => (grit ? drawGrit(c, w, h, mode) : drawPanels(c, w, h, mode, key)));
  const rep = (t) => { t.repeat.set(1 / m, 1 / m); return t; };
  return (TEXS[key] = {
    d: registerTexture('v2ship_' + key + 'D', { kind: 'rough', scale: grit ? 0.5 : 1, draw: draw('col') }),
    n: rep(registerTexture('v2ship_' + key + 'N', { kind: 'normal', scale: grit ? 0.5 : 1, strength: grit ? 1.1 : SETS[key].nrm, draw: draw('hgt') })),
    r: rep(registerTexture('v2ship_' + key + 'R', { kind: 'rough', scale: 0.5, draw: draw('rgh') })),
  });
}
const lin = (hex) => new THREE.Color(hex);
/** Shared ship materials and colours for a nation. Every tone here is { m, r, g, b }: what ShipKit calls take first. */
export function shipMats(nation) {
  if (MATS[nation]) return MATS[nation];
  const A = nation === 'aethia', P = PAL[nation], v2 = (s) => new THREE.Vector2(s, s);
  const base = (kind, size, rot = 0.31) => { const t = registerTexture(`v2ship_${kind === 'flight' ? 'flightdeck' : kind}_${nation}`, { scale: 0.5, draw: (c, w, h) => drawBase(c, w, h, nation, kind) }); t.repeat.set(1 / size, 1 / size); t.rotation = rot; return t; };
  const paint = (kind, size, set, o) => { const s = detailSet(set), m = new ShipPaint({ map: base(kind, size, kind === 'hull' ? 0 : 0.31), detailMap: s.d, normalMap: s.n, roughnessMap: s.r, roughness: 1, vertexColors: true, ...o }); m.name = `ship_${kind}_${nation}`; return m; };
  const hull = paint('hull', 64, 'plate', { normalScale: v2(0.55), metalness: 0.22, envMapIntensity: 0.8 });
  hull.anti.set(P.anti); hull.boot.set(P.boot);
  const sup = paint('sup', 32, 'panel', { normalScale: v2(0.5), metalness: 0.2, envMapIntensity: 0.8 });
  const deck = paint('deck', 32, 'grit', { normalScale: v2(0.5), metalness: 0.06, envMapIntensity: 0.5 });
  const flight = paint('flight', 32, 'grit', { normalScale: v2(0.45), metalness: 0.06, envMapIntensity: 0.5 });
  const sub = paint('sub', 32, 'tiles', { normalScale: v2(0.5), metalness: 0.12, envMapIntensity: 0.9 });
  sub.wl.set(1, -0.35, -0.35, 0.9); sub.anti.set(A ? '#1c2420' : '#231a17'); sub.boot.set('#000000');
  const hulls = {};
  const tn = (m, k = 1, kg = k, kb = k) => ({ m, r: k, g: kg, b: kb });
  const rel = (m, baseHex) => { const b = lin(baseHex); return (hex, k = 1) => { const c = lin(hex); return { m, r: (c.r / b.r) * k, g: (c.g / b.g) * k, b: (c.b / b.b) * k }; }; };
  const col = rel(sup, P.sup);
  return (MATS[nation] = {
    nation, A, P, sup, deck, flight, sub, trim, metal, lamp, glass: airMats(nation).glassDark, ins: MAT.insignia[nation], num: (text) => hullNumberMaterial(text, nation),
    /** hull paint with a boot-topping band sized for the ship: k = scale (1 = corvette) */
    hull(k = 1) { if (!hulls[k]) { const m = hull.clone(); m.wl.set(1, -0.3 * k, 0.5 * k, 0.5 * k + 2.2 * Math.sqrt(k)); m.name = hull.name; hulls[k] = m; } return hulls[k]; },
    S: tn(sup), SD: tn(sup, A ? 0.6 : 0.62), SL: tn(sup, A ? 1.12 : 1.3), SK: tn(sup, A ? 0.3 : 0.4), D: tn(deck), DD: tn(deck, 0.7), F: tn(flight), U: tn(sub), UD: tn(sub, 0.6), G: airMats(nation).glassDark,
    col, W: col('#d9dcde'), BK: col('#0d0e0f'), GM: col('#2a2d30'), RB: col('#161718'), YL: col('#d9a71a'), RD: col('#a8261c'),
    rail: tone(trim, P.rail), uCol: rel(sub, P.sub),
  });
}

/* ----------------------------------------------------------------------------------------------------------------- Kit */

const RODS = {};
function boxUV(e, n) { // metre UVs projected along the dominant axis of each face; walls keep v = height so streaks run down
  const { pos, nor, uv, idx } = e, ou = (n * 3.71) % 16, ov = (n * 1.93) % 8;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ax = Math.abs(nor[a] + nor[b] + nor[c]), ay = Math.abs(nor[a + 1] + nor[b + 1] + nor[c + 1]), az = Math.abs(nor[a + 2] + nor[b + 2] + nor[c + 2]);
    for (const q of [a, b, c]) {
      const u = (q / 3) * 2;
      if (ay >= ax && ay >= az) { uv[u] = pos[q + 2]; uv[u + 1] = pos[q]; } else if (ax >= az) { uv[u] = pos[q + 2] + ou; uv[u + 1] = pos[q + 1] + ov; } else { uv[u] = pos[q] + ou; uv[u + 1] = pos[q + 1] + ov; }
    }
  }
}
/** Kit with metre UVs for the ship paints, thin rods, and placement frames (author a fitting once in its own coordinates). */
export class ShipKit extends Kit {
  constructor(o = {}) { super(o); this.nUV = 0; }
  add(mc, geo, x, y, z, rot, scl, opt) {
    const mat = mc.m || mc; super.add(mc, geo, x, y, z, rot, scl, opt);
    if (mat.isShipPaint && !geo.userData.uvm) { const l = this.buckets.get(mat); boxUV(l[l.length - 1], this.nUV++); }
    return this;
  }
  /** thin open-ended bar from a to b (rails, stanchions, rungs, stays) */
  rod(mc, a, b, r = 0.03, seg = 4) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _v.length(); if (len < 1e-5) return this;
    _q.setFromUnitVectors(YA, _v.multiplyScalar(1 / len)); _e.setFromQuaternion(_q);
    const geo = RODS[seg] || (RODS[seg] = new THREE.CylinderGeometry(1, 1, 1, seg, 1, true));
    return this.add(mc, geo, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, [_e.x, _e.y, _e.z], [r, len, r]);
  }
  /** run fn(this) with everything it adds placed at (x, y, z) and turned by yaw (then pitch, roll) */
  at(x, y, z, yaw, fn, pitch = 0, roll = 0) { return this.frame(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ')), ONE), fn); }
  frame(m, fn) { const keep = this.base; this.base = keep ? keep.clone().multiply(m) : m; fn(this); this.base = keep; return this; }
}
/** Frame standing on a surface at p with outward normal n: local +Z = out, +Y = up along the surface, +X = to the right of
 *  someone looking at the surface from outside. */
export function frameN(p, n) {
  const z = new V3(n[0], n[1], n[2]).normalize(), x = new V3().crossVectors(YA, z).normalize(), y = new V3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p[0], p[1], p[2]);
}
/** Solid of revolution about Y from [[r, y], ...] listed bottom to top. */
export function latheY(pts, seg = 12) { return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(p[0], 0.0005), p[1])), seg); }
function gridGeo(ni, nj, fn, flip = false, uvm = true) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= ni; i++) for (let j = 0; j <= nj; j++) { const p = fn(i, j); pos.push(p[0], p[1], p[2]); uv.push(p[3] ?? p[2], p[4] ?? p[1]); }
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) { const a = i * (nj + 1) + j, b = a + 1, c = a + nj + 1, d = c + 1; if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals(); if (uvm) geo.userData.uvm = true;
  return geo;
}

/* ---------------------------------------------------------------------------------------------------------------- hull */

/** Lofted ship hull. o: L (overall), B (widest, at the knuckle), D draft, fb freeboard amidships, sheer (extra at the bow),
 *  sheerLen, bowLen / bowPow (plan of the bow), sternW / sternLen (transom width), knuckle (height of the chine as a fraction
 *  of the deck height; 0 = smooth flared side), flareTop / tumble (deck width over knuckle width at the bow / amidships),
 *  wlBow / wlMid / wlStern (waterline width over knuckle width), bilge (2 round .. 5 boxy), rake (stem overhang), forefoot,
 *  keelRise / bowRise, bulwark: (s) => height above the deck at station s (0 bow .. 1 stern), stations.
 *  Returns { side: [geometries, metre UVs], deck, xAt(z, y), deckY(z), half(z), edge(z0, z1, step, inset), wall(z, y, side) }. */
export function makeHull(o) {
  const L = o.L, B = o.B, D = o.D, fb = o.fb, sheer = o.sheer ?? 0, sheerLen = o.sheerLen ?? 0.42, bowLen = o.bowLen ?? 0.34, bowPow = o.bowPow ?? 0.72;
  const sternW = o.sternW ?? 0.8, sternLen = o.sternLen ?? 0.18, kn = o.knuckle ?? 0.5, rdBow = o.flareTop ?? 1.3, rdMid = o.tumble ?? 0.94;
  const rwBow = o.wlBow ?? 0.45, rwMid = o.wlMid ?? 0.96, rwStern = o.wlStern ?? 0.92, bilge = o.bilge ?? 3.4, rake = o.rake ?? L * 0.04, cut = o.forefoot ?? L * 0.012;
  const keelRise = o.keelRise ?? 0.5, bowRise = o.bowRise ?? 0.3, bulw = o.bulwark || null, th = o.bulwarkT ?? 0.14, NS = o.stations ?? 48, NU = o.under ?? 6, NK = o.mid ?? 3;
  const Lw = L - rake, ydBow = fb + sheer, pk = kn > 0 ? 1.15 : 1.5;
  const plan = (s) => (s < bowLen ? Math.pow(Math.sin((s / bowLen) * HP), bowPow) : s > 1 - sternLen ? 1 - (1 - sternW) * Math.pow((s - (1 - sternLen)) / sternLen, 2) : 1);
  const yd = (s) => fb + sheer * Math.pow(Math.max(0, 1 - s / sheerLen), 2);
  const sec = (s) => {
    const bk0 = (B / 2) * plan(s), ydk = yd(s), tb = sstep(0, bowLen * 1.1, s), ts = sstep(0.72, 1, s);
    const bd = bk0 * lerp(rdBow, rdMid, sstep(bowLen * 0.2, bowLen * 1.05, s)), bw = bk0 * lerp(rwBow, rwMid, tb) * lerp(1, rwStern, ts);
    return { s, bk: kn > 0 ? bk0 : bd, bw, bd, ydk, yk: kn > 0 ? ydk * kn : ydk, d: D * (1 - bowRise * Math.pow(1 - tb, 2) - keelRise * ts), n: lerp(1.3, bilge, sstep(0, bowLen * 0.9, s)),
      e: s < bowLen ? Math.pow(1 - s / bowLen, 2) : 0, bh: bulw ? Math.max(0, bulw(s)) : 0 };
  };
  const xOf = (c, y) => {
    if (y <= 0) return c.bw * Math.pow(Math.max(0, 1 - Math.pow(clamp(-y / c.d, 0, 1), c.n)), 1 / c.n);
    if (y <= c.yk) return c.bw + (c.bk - c.bw) * Math.pow(y / c.yk, pk);
    return kn > 0 ? c.bk + ((c.bd - c.bk) * (y - c.yk)) / (c.ydk - c.yk) : c.bd + ((y - c.ydk) * pk * (c.bd - c.bw)) / c.ydk;
  };
  const zOf = (c, y) => -L / 2 + rake + c.s * Lw + c.e * (y >= 0 ? -rake * Math.min(1.3, y / ydBow) : cut * Math.pow(Math.min(1, -y / D), 1.5));
  const SS = [], lower = [], upper = [];
  for (let i = 0; i <= NS; i++) {
    const c = sec(Math.pow(i / NS, 1.12)), a = [], b = [];
    for (let j = 0; j <= NU; j++) { const t = (j / NU) * HP; a.push([c.bw * Math.pow(Math.sin(t), 2 / c.n), -c.d * Math.pow(Math.cos(t), 2 / c.n)]); }
    for (let j = 1; j <= NK; j++) { const y = (c.yk * j) / NK; a.push([xOf(c, y), y]); }
    if (kn > 0) b.push([c.bk, c.yk], [c.bd, c.ydk]); else b.push([c.bd, c.ydk]);
    if (bulw) b.push([xOf(c, c.ydk + c.bh), c.ydk + c.bh]);
    SS.push(c); lower.push(a); upper.push(b);
  }
  const strip = (rows, side) => gridGeo(NS, rows[0].length - 1, (i, j) => { const p = rows[i][j]; return [side * p[0], p[1], zOf(SS[i], p[1])]; }, side < 0);
  const side = [];
  for (const s of [1, -1]) {
    if (kn > 0) { side.push(strip(lower, s)); side.push(strip(upper, s)); } else side.push(strip(lower.map((a, i) => a.concat(upper[i])), s));
  }
  { // transom
    const c = SS[NS], pts = lower[NS].concat(upper[NS]), z = zOf(c, 0);
    side.push(gridGeo(1, pts.length - 1, (i, j) => [(i ? -1 : 1) * pts[j][0], pts[j][1], z, pts[j][0] * (i ? -1 : 1) + 50, pts[j][1]]));
  }
  const inner = (c) => c.bd - (c.bh > 0.03 ? th : 0);
  if (bulw) { // cap and inner face of the bulwark
    let i0 = -1, i1 = -1; for (let i = 0; i <= NS; i++) if (SS[i].bh > 0.03) { if (i0 < 0) i0 = i; i1 = i; }
    if (i1 > i0) for (const s of [1, -1]) {
      const top = (i) => { const c = SS[i0 + i]; return [xOf(c, c.ydk + c.bh), c.ydk + c.bh, zOf(c, c.ydk + c.bh)]; };
      side.push(gridGeo(i1 - i0, 1, (i, j) => { const t = top(i); return [s * (t[0] - j * th), t[1], t[2]]; }, s < 0));
      side.push(gridGeo(i1 - i0, 1, (i, j) => { const t = top(i), c = SS[i0 + i]; return j ? [s * (c.bd - th), c.ydk, zOf(c, c.ydk)] : [s * (t[0] - th), t[1], t[2]]; }, s < 0));
    }
  }
  const deck = gridGeo(NS, 1, (i, j) => { const c = SS[i]; return [(j ? 1 : -1) * inner(c), c.ydk, zOf(c, c.ydk)]; }, true, false);
  const sAt = (z, yf) => { let s = clamp((z + L / 2 - rake) / Lw, 0, 1); for (let k = 0; k < 5; k++) { const c = sec(s); s = clamp((z + L / 2 - rake - (zOf(c, yf(c)) - (-L / 2 + rake + s * Lw))) / Lw, 0, 1); } return sec(s); };
  const H = {
    L, B, D, fb, side, deck, sec, xOf,
    /** half-breadth of the hull surface at station z, height y */
    xAt: (z, y) => { const c = sAt(z, () => y); return xOf(c, y); },
    deckY: (z) => sAt(z, (c) => c.ydk).ydk,
    /** half-breadth of the deck (inside any bulwark) */
    half: (z) => inner(sAt(z, (c) => c.ydk)),
    bulwark: (z) => sAt(z, (c) => c.ydk).bh,
    /** starboard deck-edge polyline [[x, y, z], ...] from z0 to z1, `inset` metres inboard (mirror x for port) */
    edge(z0, z1, step = 4, inset = 0.25) { const n = Math.max(1, Math.round(Math.abs(z1 - z0) / step)), out = []; for (let i = 0; i <= n; i++) { const z = z0 + ((z1 - z0) * i) / n; out.push([H.half(z) - inset, H.deckY(z), z]); } return out; },
    /** frame on the hull side at (z, y): +Z out of the plating, +Y up it */
    wall(z, y, s = 1, out = 0) { const x = H.xAt(z, y), fy = (H.xAt(z, y + 0.2) - H.xAt(z, y - 0.2)) / 0.4, fz = (H.xAt(z + 0.4, y) - H.xAt(z - 0.4, y)) / 0.8; return frameN([s * (x + out), y, z], [s, -fy, -fz]); },
  };
  return H;
}
/** Hull number / insignia plane hugging the hull side, as a geometry for a decal kit. side = +1 starboard, -1 port. */
export function hullDecal(k, mat, w, h, hull, y, z, side) {
  const top = hull.xAt(z, y + h / 2), bot = hull.xAt(z, y - h / 2), fwd = hull.xAt(z - w / 2, y), aft = hull.xAt(z + w / 2, y);
  const geo = new THREE.PlaneGeometry(w, h); geo.rotateX(Math.atan2(top - bot, h));
  return k.add(mat, geo, side * (Math.max((top + bot) / 2, (fwd + aft) / 2) + 0.1), y, z, [0, side * (HP + Math.atan2(aft - fwd, w)), 0]);
}

/* ------------------------------------------------------------------------------------------------------ superstructure */

export const FS = 0, SB = 1, AS = 2, AFT = 3, AP = 4, PT = 5, FP = 6, FWD = 7;
/** Deckhouse: chamfered rectangle in plan from z0 (forward) to z1 (aft), walls leaning in. o: { x, z0, z1, w | wf, wa, y0, y1,
 *  slope (side lean, metres in per metre up), rakeF, rakeA (front and aft lean), cf, ca (corner chamfers), roof: tone,
 *  dx (shift of the top to starboard), noRoof }. Returns the block: frame(edge, c, v) gives a wall frame (edge FWD / AFT /
 *  SB / PT or a corner; c = world x for FWD and AFT, world z for the sides, 0..1 for corners; v = metres above y0),
 *  on(k, edge, c, v, fn), block(), top(margin), windows(...). */
export function house(k, mc, o) {
  const x = o.x || 0, z0 = o.z0, z1 = o.z1, y0 = o.y0, y1 = o.y1, h = y1 - y0, wf = (o.wf ?? o.w) / 2, wa = (o.wa ?? o.w) / 2;
  const sl = o.slope ?? 0, si = sl * h, fi = (o.rakeF ?? sl) * h, ai = (o.rakeA ?? sl) * h, cf = o.cf ?? 0, ca = o.ca ?? 0, dx = o.dx || 0;
  const ring = (cx, wF, wA, zF, zA, cF, cA) => [[cx + wF - cF, zF], [cx + wF, zF + cF], [cx + wA, zA - cA], [cx + wA - cA, zA], [cx - wA + cA, zA], [cx - wA, zA - cA], [cx - wF, zF + cF], [cx - wF + cF, zF]];
  const bot = ring(x, wf, wa, z0, z1, cf, ca), top = ring(x + dx, Math.max(0.05, wf - si), Math.max(0.05, wa - si), z0 + fi, z1 - ai, cf * Math.max(0.1, (wf - si) / wf), ca * Math.max(0.1, (wa - si) / wa));
  const pos = [], P = (p, y) => pos.push(p[0], y, p[1]);
  for (let i = 0; i < 8; i++) {
    const a = bot[i], b = bot[(i + 1) % 8], at = top[i], bt = top[(i + 1) % 8];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-4 && Math.hypot(bt[0] - at[0], bt[1] - at[1]) < 1e-4) continue;
    P(a, y0); P(at, y1); P(b, y0); P(at, y1); P(bt, y1); P(b, y0);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  k.add(mc, geo);
  if (!o.noRoof) {
    const rp = []; for (let i = 1; i < 7; i++) { rp.push(top[0][0], y1, top[0][1], top[i + 1][0], y1, top[i + 1][1], top[i][0], y1, top[i][1]); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.computeVertexNormals();
    k.add(o.roof || mc, rg);
  }
  const H = {
    bot, top, y0, y1, x, h,
    pt(e, t, v) { const f = v / h, a = bot[e], b = bot[(e + 1) % 8], at = top[e], bt = top[(e + 1) % 8], ax = lerp(a[0], at[0], f), az = lerp(a[1], at[1], f), bx = lerp(b[0], bt[0], f), bz = lerp(b[1], bt[1], f); return [lerp(ax, bx, t), y0 + v, lerp(az, bz, t)]; },
    len(e, v = 0) { const a = H.pt(e, 0, v), b = H.pt(e, 1, v); return Math.hypot(b[0] - a[0], b[2] - a[2]); },
    normal(e) { const a = H.pt(e, 0, 0), b = H.pt(e, 1, 0), at = H.pt(e, 0, h); return new V3(at[0] - a[0], h, at[2] - a[2]).cross(new V3(b[0] - a[0], 0, b[2] - a[2])).normalize(); },
    /** t (0..1 along the wall) of world coordinate c at height v */
    tOf(e, c, v) { if (e % 2 === 0) return c; const a = H.pt(e, 0, v), b = H.pt(e, 1, v), ax = e === SB || e === PT ? 2 : 0; return (c - a[ax]) / (b[ax] - a[ax]); },
    frame(e, c, v, out = 0) { const n = H.normal(e), p = H.pt(e, H.tOf(e, c, v), v); return frameN([p[0] + n.x * out, p[1] + n.y * out, p[2] + n.z * out], [n.x, n.y, n.z]); },
    on(kk, e, c, v, fn) { kk.frame(H.frame(e, c, v), fn); return H; },
    block(pad = 0) { const xs = bot.map((p) => p[0]), zs = bot.map((p) => p[1]); return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad, y0, y1 }; },
    roof(margin = 0.3) { const xs = top.map((p) => p[0]), zs = top.map((p) => p[1]); return { x0: Math.min(...xs) + margin, x1: Math.max(...xs) - margin, z0: Math.min(...zs) + margin, z1: Math.max(...zs) - margin, y: y1 }; },
    /** a framed band of n window panes on wall e between heights v0 and v1 */
    windows(kk, M, e, v0, v1, n, inset = 0.35, gap = 0.12) {
      const vm = (v0 + v1) / 2, len = H.len(e, vm) - inset * 2, pw = (len - gap * (n - 1)) / n, ph = (v1 - v0) / Math.max(0.3, Math.sqrt(1 - Math.pow(H.normal(e).y, 2)));
      if (len < 0.3) return H;
      kk.frame(frameN(H.pt(e, 0.5, vm), H.normal(e).toArray()), (q) => {
        q.box(M.SK, len + 0.16, ph + 0.16, 0.05, 0, 0, 0.012);
        for (let i = 0; i < n; i++) q.box(M.G, pw, ph, 0.03, -len / 2 + pw / 2 + i * (pw + gap), 0, 0.035);
      });
      return H;
    },
  };
  return H;
}

/** Guard rail along a polyline of deck points: top rail, mid rails and stanchions. o: { h, post, bars, mc } */
export function rail(k, pts, o = {}) {
  if (!k.detail) return;
  const h = o.h ?? 1.05, every = o.post ?? 2, mc = o.mc || C.grey, bars = o.bars ?? (k.fine ? 2 : 1), seg = k.fine ? 4 : 3;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); if (len < 0.05) continue;
    k.rod(mc, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.03, seg);
    for (let q = 1; q <= bars; q++) { const f = q / (bars + 1); k.rod(mc, [a[0], a[1] + h * f, a[2]], [b[0], b[1] + h * f, b[2]], 0.017, 3); }
    const n = Math.max(1, Math.round(len / (k.fine ? every : every * 2)));
    for (let q = i ? 1 : 0; q <= n; q++) { const t = q / n, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t), z = lerp(a[2], b[2], t); k.rod(mc, [x, y, z], [x, y + h, z], 0.026, seg); }
  }
}
/** Open lattice mast (four legs, rings and diagonals) from y0 to y1, square w0 at the foot, w1 at the head. */
export function lattice4(k, mc, x, z, y0, y1, w0, w1, levels = 4, r = 0.09) {
  const c = (t, sx, sz) => { const w = (w0 + (w1 - w0) * t) / 2; return [x + sx * w, y0 + (y1 - y0) * t, z + sz * w]; };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) k.rod(mc, c(0, sx, sz), c(1, sx, sz), r, 5);
  for (let i = 1; i <= levels; i++) {
    const t0 = (i - 1) / levels, t1 = i / levels;
    for (let q = 0; q < 4; q++) { const a = corners[q], d = corners[(q + 1) % 4]; k.rod(mc, c(t1, a[0], a[1]), c(t1, d[0], d[1]), r * 0.6, 4); if (k.detail) { k.rod(mc, c(t0, a[0], a[1]), c(t1, d[0], d[1]), r * 0.45, 3); if (k.fine) k.rod(mc, c(t0, d[0], d[1]), c(t1, a[0], a[1]), r * 0.45, 3); } }
  }
}

/* ------------------------------------------------------------------------------------------------------------ fittings */
// Each is written in its own coordinates: place it with k.at(x, y, z, yaw, (k) => fitting(k, ...)) or on a wall frame
// (X along the wall, Y up, Z out, origin at the foot).

/** Watertight door on a wall frame: frame, slab, dogs, handwheel, round window. */
export function door(k, M, w = 0.8, h = 1.9) {
  k.cbox(M.SD, w + 0.2, h + 0.2, 0.06, 0.02, 0, h / 2 + 0.22, 0.03);
  k.cbox(M.SL, w, h, 0.06, 0.03, 0, h / 2 + 0.22, 0.075);
  if (!k.fine) return;
  for (const s of [-1, 1]) for (const y of [0.25, 0.5, 0.75]) k.box(M.SK, 0.14, 0.035, 0.03, s * (w / 2 - 0.02), 0.22 + h * y, 0.115);
  k.torus(M.SK, 0.11, 0.016, 0, h * 0.5 + 0.22, 0.13, null, 10); k.cyl(M.SK, 0.025, 0.025, 0.06, 0, h * 0.5 + 0.22, 0.12, 'z', 6);
  k.cyl(M.SK, 0.12, 0.12, 0.02, 0, h * 0.78 + 0.22, 0.106, 'z', 10); k.cyl(M.G, 0.09, 0.09, 0.02, 0, h * 0.78 + 0.22, 0.112, 'z', 10);
  k.box(M.YL, 0.3, 0.08, 0.01, 0, h + 0.4, 0.012);
}
/** Porthole on a wall frame. */
export function porthole(k, M, r = 0.17) { k.cyl(M.SK, r + 0.04, r + 0.04, 0.04, 0, 0, 0.02, 'z', 10); k.cyl(M.G, r, r, 0.03, 0, 0, 0.035, 'z', 10); }
/** Vertical ladder on a wall frame, from the foot up h metres. */
export function ladder(k, mc, h, w = 0.42, off = 0.12) {
  for (const s of [-1, 1]) { k.rod(mc, [s * w / 2, 0, off], [s * w / 2, h, off], 0.022, 4); for (const y of [0.15, h - 0.15]) k.rod(mc, [s * w / 2, y, 0], [s * w / 2, y, off], 0.016, 3); }
  const n = Math.max(2, Math.round(h / (k.fine ? 0.32 : 0.64))); for (let i = 1; i < n; i++) k.rod(mc, [-w / 2, (h * i) / n, off], [w / 2, (h * i) / n, off], 0.014, 3);
}
/** Inclined ladder (ship's stairs) rising `rise` over `run` toward local -Z, with handrails. */
export function stairs(k, M, rise, run, w = 0.8) {
  const len = Math.hypot(rise, run), a = Math.atan2(rise, run), n = Math.max(3, Math.round(rise / 0.26));
  for (const s of [-1, 1]) {
    k.box(M.SD, 0.05, 0.16, len, s * w / 2, rise / 2, -run / 2, [a, 0, 0]);
    k.rod(M.rail, [s * w / 2, 0.95, 0], [s * w / 2, rise + 0.95, -run], 0.022, 4);
    for (const t of [0, 0.5, 1]) k.rod(M.rail, [s * w / 2, rise * t, -run * t], [s * w / 2, rise * t + 0.95, -run * t], 0.02, 3);
  }
  for (let i = 1; i <= n; i++) k.box(M.SD, w, 0.03, 0.22, 0, (rise * i) / n - 0.02, (-run * i) / n + 0.05);
}
/** Deck hatch with coaming, lid, hinges and handwheel (origin on the deck). */
export function hatch(k, M, s = 0.9) {
  k.cbox(M.SD, s, 0.26, s, 0.03, 0, 0.13, 0); k.cbox(M.S, s + 0.08, 0.07, s + 0.08, 0.02, 0, 0.29, 0);
  if (k.fine) { k.torus(M.SK, s * 0.17, 0.018, 0, 0.35, 0, [HP, 0, 0], 10); for (const x of [-0.25, 0.25]) k.box(M.SK, 0.12, 0.06, 0.1, x * s, 0.3, s / 2 + 0.05); }
}
/** Mushroom ventilator (origin on the deck). */
export function vent(k, M, h = 1, r = 0.26) { k.cyl(M.S, r, r * 1.1, h, 0, h / 2, 0, 'y', 10); k.sphere(M.S, r * 1.7, 0, h, 0, [1, 0.42, 1], 10); k.cyl(M.SK, r * 1.5, r * 1.5, 0.04, 0, h - 0.05, 0, 'y', 10); }
/** Gooseneck air pipe. */
export function gooseneck(k, M, h = 0.9, r = 0.09) { k.pipe(M.S, [[0, 0, 0], [0, h, 0], [0, h + r * 2, -r * 2], [0, h, -r * 4], [0, h - r * 2, -r * 4]], r, 6, 10); }
/** Inflatable life raft canister in its cradle; the canister lies along local Z (origin on the deck). */
export function liferaft(k, len = 1.35, r = 0.34) {
  k.lathe(C.white, [[-len / 2, 0.02], [-len / 2 + 0.05, r * 0.75], [-len / 2 + 0.16, r], [len / 2 - 0.16, r], [len / 2 - 0.05, r * 0.75], [len / 2, 0.02]], k.fine ? 12 : 8, 0, r + 0.14, 0);
  for (const z of [-len * 0.25, len * 0.25]) { k.cyl(C.dark, r + 0.012, r + 0.012, 0.06, 0, r + 0.14, z, 'z', k.fine ? 12 : 8, true); k.box(C.grey, r * 1.7, 0.14, 0.08, 0, 0.07, z); }
  if (k.fine) k.box(C.yellow, 0.14, 0.1, 0.02, r * 0.72, r + 0.14, 0, [0, HP, 0]);
}
/** Life ring on a wall frame. */
export function lifering(k) { k.torus(C.orange, 0.3, 0.07, 0, 0, 0.09, null, 12); if (k.fine) for (let i = 0; i < 4; i++) { const a = i * HP + 0.78; k.box(C.white, 0.16, 0.16, 0.16, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.09, [0, 0, a]); } }
/** Fire station on a wall frame: red hose box and reel. */
export function firebox(k) { k.cbox(C.red, 0.55, 0.7, 0.2, 0.02, 0, 0, 0.1); k.torus(C.dark, 0.2, 0.05, 0, -0.02, 0.22, null, 10); }
/** Twin mooring bitts on a base plate (origin on the deck, the pair lies along local Z). */
export function bitts(k, s = 1) {
  k.cbox(C.dark, 0.5 * s, 0.06 * s, 1.3 * s, 0.015, 0, 0.03 * s, 0);
  for (const z of [-0.36, 0.36]) { k.cyl(C.dark, 0.13 * s, 0.14 * s, 0.5 * s, 0, 0.3 * s, z * s, 'y', 10); k.cyl(C.dark, 0.18 * s, 0.18 * s, 0.06 * s, 0, 0.56 * s, z * s, 'y', 10); }
}
/** Closed chock / fairlead at the deck edge (the opening faces local X). */
export function chock(k, s = 1) { k.torus(C.dark, 0.2 * s, 0.07 * s, 0, 0.24 * s, 0, [0, HP, 0], 10); k.box(C.dark, 0.16 * s, 0.08 * s, 0.6 * s, 0, 0.04 * s, 0); }
/** Capstan (origin on the deck). */
export function capstan(k, s = 1) { k.add(C.dark, new THREE.LatheGeometry([[0.36, 0], [0.36, 0.06], [0.22, 0.14], [0.17, 0.4], [0.24, 0.62], [0.3, 0.66], [0.3, 0.72], [0.02, 0.76]].map((p) => new THREE.Vector2(p[0] * s, p[1] * s)), 12)); }
/** Anchor windlass: two cable lifters and a warping drum on one shaft across local X, with its motor. */
export function windlass(k, M, s = 1) {
  k.cbox(M.SD, 2.4 * s, 0.1 * s, 1.1 * s, 0.02, 0, 0.05 * s, 0);
  k.cyl(C.iron, 0.09 * s, 0.09 * s, 2.5 * s, 0, 0.5 * s, 0, 'x', 8);
  for (const x of [-0.6, 0.6]) { k.cyl(C.dark, 0.34 * s, 0.34 * s, 0.26 * s, x * s, 0.5 * s, 0, 'x', 14); k.cyl(C.iron, 0.4 * s, 0.4 * s, 0.05 * s, (x - 0.16) * s, 0.5 * s, 0, 'x', 14); k.cyl(C.iron, 0.4 * s, 0.4 * s, 0.05 * s, (x + 0.16) * s, 0.5 * s, 0, 'x', 14); k.box(M.SD, 0.12 * s, 0.5 * s, 0.5 * s, (x + 0.3) * s, 0.3 * s, 0); }
  for (const x of [-1.15, 1.15]) k.add(C.dark, new THREE.LatheGeometry([[0.2, -0.16], [0.13, -0.08], [0.13, 0.08], [0.2, 0.16]].map((p) => new THREE.Vector2(p[0] * s, p[1] * s)), 10), x * s, 0.5 * s, 0, [0, 0, HP]);
  k.cbox(M.S, 0.5 * s, 0.5 * s, 0.6 * s, 0.03, 0, 0.35 * s, 0.6 * s);
}
/** Stockless anchor stowed against the hull on a wall frame (origin = the hawse pipe mouth), with the pipe's lip. s = size. */
export function anchor(k, s = 1) {
  k.torus(C.dark, 0.42 * s, 0.11 * s, 0, 0, 0.02, null, 12); k.cyl(C.black, 0.36 * s, 0.36 * s, 0.03, 0, 0, 0.01, 'z', 12);
  k.cbox(C.iron, 0.2 * s, 1.5 * s, 0.18 * s, 0.03, 0, -0.75 * s, 0.14 * s);
  k.cbox(C.iron, 1.3 * s, 0.34 * s, 0.26 * s, 0.05, 0, -1.55 * s, 0.16 * s);
  for (const x of [-1, 1]) k.add(C.iron, new THREE.ConeGeometry(0.2 * s, 0.9 * s, 4), x * 0.5 * s, -1.1 * s, 0.18 * s, [0, 0, x * 0.25], [1, 1, 0.45]);
}
/** Whip aerial (origin at its foot): spring base and a thin rod leaning by `lean` radians toward local -Z. */
export function whip(k, h = 5, lean = 0.1) { k.cyl(C.dark, 0.05, 0.08, 0.3, 0, 0.15, 0, 'y', 6); k.rod(C.gun, [0, 0.3, 0], [0, 0.3 + h * Math.cos(lean), -h * Math.sin(lean)], 0.018, 3); }
/** Radome on a collar and pedestal (origin at the foot). */
export function dome(k, M, r = 0.6, ped = 0.4, mc = null) { k.cyl(M.SD, r * 0.5, r * 0.62, ped, 0, ped / 2, 0, 'y', 10); k.cyl(M.SD, r * 0.8, r * 0.8, 0.07, 0, ped, 0, 'y', 12); k.sphere(mc || M.W, r, 0, ped + r * 0.78, 0, null, k.fine ? 16 : 10); }
/** Searchlight or signal lamp on a yoke (origin at the foot, the lens faces local -Z). */
export function searchlight(k, M, s = 1) {
  k.cyl(M.SD, 0.08 * s, 0.12 * s, 0.6 * s, 0, 0.3 * s, 0, 'y', 8);
  for (const x of [-1, 1]) k.box(M.SD, 0.04 * s, 0.5 * s, 0.08 * s, x * 0.3 * s, 0.82 * s, 0);
  k.cyl(M.SD, 0.27 * s, 0.24 * s, 0.4 * s, 0, 0.9 * s, 0, 'z', 12); k.cyl(M.G, 0.24 * s, 0.24 * s, 0.02, 0, 0.9 * s, -0.2 * s, 'z', 12);
}
/** Flood light on a wall frame or post. */
export function flood(k, s = 1) { k.cbox(C.dark, 0.34 * s, 0.26 * s, 0.16 * s, 0.02, 0, 0, 0.1 * s); k.box(LW, 0.28 * s, 0.2 * s, 0.02, 0, 0, 0.19 * s); }
/** Navigation light on a wall frame or post. */
export function navlight(k, mc, r = 0.09) { k.cyl(C.dark, r * 1.2, r * 1.2, r * 0.6, 0, -r * 0.9, 0, 'y', 8); k.sphere(mc, r, 0, 0, 0, null, 8); }
/** Deck locker / ready-use box (origin on the deck). */
export function locker(k, M, w = 1.4, h = 0.7, d = 0.7) { k.cbox(M.SD, w, h, d, 0.03, 0, h / 2, 0); k.cbox(M.S, w + 0.06, 0.06, d + 0.06, 0.02, 0, h + 0.02, 0); if (k.fine) for (const x of [-0.3, 0.3]) k.box(M.SK, 0.08, 0.14, 0.03, x * w, h - 0.08, d / 2 + 0.01); }
/** Cable or hose reel on a stand; the axle lies along local X (origin on the deck). */
export function reel(k, M, r = 0.5, w = 0.8) {
  for (const x of [-1, 1]) { k.cyl(M.SD, r, r, 0.05, x * w / 2, r + 0.12, 0, 'x', 14); k.box(M.SD, 0.06, r + 0.12, 0.5, x * (w / 2 + 0.06), (r + 0.12) / 2, 0); }
  k.cyl(C.black, r * 0.78, r * 0.78, w - 0.08, 0, r + 0.12, 0, 'x', 12);
}
/** Flag staff / jackstaff raked toward local -Z. */
export function staff(k, h = 3, lean = 0.1) { k.rod(C.grey, [0, 0, 0], [0, h * Math.cos(lean), -h * Math.sin(lean)], 0.035, 4); k.sphere(C.brass, 0.07, 0, h * Math.cos(lean), -h * Math.sin(lean), null, 6); }
/** Rigid-hull inflatable boat on chocks: bow toward local -Z, origin on the deck under its keel. */
export function rhib(k, M, len = 6.2, w = 2.3) {
  const r = w * 0.17, y = 0.75, hw = w / 2 - r;
  k.add(C.grey, latheZ([[-len / 2 + 0.3, 0.05], [-len * 0.3, 0.62], [len * 0.1, 0.72], [len / 2 - 0.2, 0.66], [len / 2 - 0.19, 0.02]], 10), 0, y - 0.1, 0, null, [hw * 1.5, 0.75, 1]);
  for (const s of [-1, 1]) k.add(C.dark, new THREE.CapsuleGeometry(r, len - w - 0.2, 4, k.fine ? 10 : 6), s * hw, y + 0.12, w * 0.2, [HP, 0, 0]);
  k.torus(C.dark, hw, r, 0, y + 0.12, -len / 2 + w * 0.7 + 0.1, [-HP, 0, 0], k.fine ? 12 : 8, Math.PI);
  k.box(C.orange, hw * 2 - 0.1, 0.06, len - w - 0.3, 0, y + 0.02, w * 0.2);
  k.cbox(C.grey, 0.7, 0.75, 0.6, 0.04, 0, y + 0.42, 0.1); k.box(M.G, 0.66, 0.3, 0.03, 0, y + 0.95, -0.2, [-0.4, 0, 0]);
  k.cbox(C.black, 0.6, 0.3, 1.0, 0.04, 0, y + 0.2, 1.1);
  k.cbox(C.black, 0.45, 0.75, 0.55, 0.06, 0, y + 0.35, len / 2 - 0.2); k.cbox(C.white, 0.47, 0.12, 0.57, 0.02, 0, y + 0.62, len / 2 - 0.2);
  for (const z of [-len * 0.22, len * 0.24]) k.box(M.SD, w * 0.8, 0.3, 0.14, 0, 0.15, z);
  if (k.fine) { k.rod(C.steel, [-0.3, y + 0.8, 0.5], [-0.3, y + 1.5, 0.6], 0.025, 4); k.rod(C.steel, [0.3, y + 0.8, 0.5], [0.3, y + 1.5, 0.6], 0.025, 4); k.rod(C.steel, [-0.3, y + 1.5, 0.6], [0.3, y + 1.5, 0.6], 0.025, 4); k.at(0, y + 1.6, 0.6, 0, (q) => navlight(q, C.lampWhite, 0.05)); }
}
/** Boat davit: a curved arm from its foot (origin) reaching `reach` toward local +X at height h, with its falls. */
export function davit(k, M, h = 2.6, reach = 1.6) {
  k.cbox(M.SD, 0.4, 0.3, 0.4, 0.03, 0, 0.15, 0);
  k.pipe(M.SD, [[0, 0.2, 0], [0, h * 0.75, 0], [reach * 0.3, h, 0], [reach, h * 1.02, 0]], 0.1, 6, 12);
  if (k.fine) { k.rod(C.gun, [reach * 0.95, h, 0], [reach * 0.95, h - 1.0, 0], 0.014, 3); k.box(C.dark, 0.1, 0.16, 0.1, reach * 0.95, h - 1.05, 0); }
}
/** Deck crane: pedestal, slewing cab, boom raised by `lift` radians reaching toward local -Z, ram and hook. */
export function crane(k, M, h = 2.2, boom = 5, lift = 0.5) {
  k.cyl(M.SD, 0.34, 0.42, h, 0, h / 2, 0, 'y', 12); k.cbox(M.S, 0.9, 0.7, 1.0, 0.05, 0, h + 0.3, 0.1);
  const ex = [0, h + 0.45 + Math.sin(lift) * boom, -Math.cos(lift) * boom];
  k.add(M.S, cboxGeo(0.3, 0.34, boom, 0.03), 0, (h + 0.45 + ex[1]) / 2, ex[2] / 2, [lift, 0, 0]);
  k.rod(C.steel, [0, h + 0.1, -0.45], [0, h + 0.45 + Math.sin(lift) * boom * 0.45 - 0.12, -Math.cos(lift) * boom * 0.45], 0.06, 6);
  k.rod(C.gun, ex, [0, ex[1] - boom * 0.45, ex[2]], 0.016, 3); k.cbox(C.yellow, 0.2, 0.3, 0.2, 0.03, 0, ex[1] - boom * 0.45 - 0.15, ex[2]);
}
/** Vertical-launch missile cells: `nx` by `nz` modules of eight cells (two rows of four with the exhaust uptake between). Origin on the deck. */
export function vls(k, M, nx = 1, nz = 1) {
  const mw = 3.3, md = 2.5, W = nx * mw + 0.3, Dp = nz * md + 0.3;
  k.cbox(M.SD, W, 0.4, Dp, 0.04, 0, 0.2, 0);
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const cx = (ix - (nx - 1) / 2) * mw, cz = (iz - (nz - 1) / 2) * md;
    k.box(M.SK, mw - 0.3, 0.05, 0.34, cx, 0.42, cz);
    if (k.fine) for (let q = 0; q < 6; q++) k.box(M.GM, 0.05, 0.03, 0.3, cx - (mw - 0.5) / 2 + (q * (mw - 0.5)) / 5, 0.455, cz);
    for (const s of [-1, 1]) for (let q = 0; q < 4; q++) {
      const x = cx + (q - 1.5) * 0.75, z = cz + s * 0.72;
      k.box(M.S, 0.66, 0.07, 0.72, x, 0.435, z);
      if (k.fine) { k.box(M.SK, 0.6, 0.03, 0.06, x, 0.475, z + s * 0.36); k.box(M.SK, 0.1, 0.03, 0.1, x, 0.48, z - s * 0.2); }
    }
  }
}
/** Deck-mounted anti-ship missile canisters: n tubes side by side firing toward local -Z, raised by `elev`. Origin on the deck. */
export function canisters(k, M, n = 2, len = 5, elev = 0.42, r = 0.36) {
  const w = n * (r * 2 + 0.08);
  for (const z of [-0.9, 1.2]) { k.box(M.SD, w + 0.3, 0.12, 0.2, 0, 0.06, z); for (const s of [-1, 1]) k.rod(M.SD, [s * w / 2, 0.1, z], [s * w / 2, 0.75 + (1.2 - z) * 0.0 - z * Math.tan(elev) * 0.9, z], 0.06, 4); }
  k.at(0, 0.95, 0, 0, (q) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (r * 2 + 0.08);
      q.cyl(M.S, r, r, len, x, 0, 0, 'z', k.fine ? 12 : 8); q.cyl(M.SL, r * 0.92, r * 0.92, 0.05, x, 0, -len / 2 - 0.02, 'z', 10); q.cyl(M.SK, r * 0.8, r * 0.8, 0.05, x, 0, len / 2 + 0.02, 'z', 10);
      if (k.fine) for (const z of [-len * 0.36, 0, len * 0.36]) q.cyl(M.SD, r + 0.025, r + 0.025, 0.09, x, 0, z, 'z', 12, true);
    }
    q.box(M.SD, w + 0.1, 0.1, len * 0.8, 0, -r - 0.05, 0);
  }, elev);
}
/** Decoy / chaff launcher: a fan of short tubes on a pedestal, firing toward local -Z. */
export function decoys(k, M) {
  k.cyl(M.SD, 0.16, 0.22, 0.7, 0, 0.35, 0, 'y', 8); k.cbox(M.SD, 0.9, 0.2, 0.7, 0.03, 0, 0.78, 0);
  for (let i = 0; i < 6; i++) { const x = ((i % 3) - 1) * 0.28, up = 0.6 + Math.floor(i / 3) * 0.25; k.add(M.S, new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8), x, 1.15 + Math.floor(i / 3) * 0.12, -0.15 - Math.floor(i / 3) * 0.2, [-(HP - up), 0, x * 0.4]); }
}
/** Two-bladed propeller on a shaft with its bracket, and the rudder behind it (static, mostly under water). Origin = propeller hub. */
export function screw(k, hc, r = 1.6, shaft = 8) {
  k.rod(C.steel, [0, 0, 0], [0, shaft * 0.16, -shaft], r * 0.09, 6); k.rod(hc, [0, 0, -r * 0.5], [0, r * 1.3, -r * 0.7], r * 0.09, 4);
  k.lathe(C.brass, [[-0.3 * r, 0.16 * r], [0, 0.2 * r], [0.3 * r, 0.12 * r], [0.5 * r, 0.01]], 8);
  const bg = wingGeo([{ x: r * 0.15, z: -r * 0.12, c: r * 0.3, t: 0.2 }, { x: r * 0.6, z: -r * 0.28, c: r * 0.56, t: 0.07 }, { x: r, z: -r * 0.05, c: r * 0.3, t: 0.05 }], { n: 3, tip: 'flat' });
  for (let i = 0; i < 5; i++) { const b = bg.clone(); b.rotateX(0.7); b.rotateZ((i / 5) * TAU); k.add(C.brass, b); }
  k.add(hc, wingGeo([{ x: 0, z: r * 0.9, c: r * 1.5, t: 0.14 }, { x: r * 2.0, z: r * 1.1, c: r * 1.1, t: 0.12 }], { n: 4, tip: 'flat' }), 0, r * 1.2, 0, [0, 0, -HP]);
}

/* ---------------------------------------------------------------------------------------------------------- radar sets */

/** Rotating radar antenna (a spinner): 'bar' navigation radar, 'panel' flat planar array, 'mesh' lattice reflector with a
 *  feed horn, 'twin' back-to-back arrays. Origin at the foot of its pedestal; it turns about Y. One draw call. */
export function radar(M, kind, w = 4, h = 1.2, fine = true) {
  const node = new THREE.Group(), k = new ShipKit({ fine });
  if (kind === 'bar') {
    k.cyl(M.SD, 0.14, 0.18, 0.3, 0, 0.15, 0, 'y', 8); k.cbox(M.SD, 0.42, 0.26, 0.42, 0.04, 0, 0.42, 0);
    k.cbox(M.W, w, 0.17, 0.2, 0.04, 0, 0.64, 0); k.box(M.SK, w * 0.96, 0.06, 0.02, 0, 0.64, -0.105);
  } else if (kind === 'panel' || kind === 'twin') {
    k.cyl(M.SD, 0.3, 0.42, 0.5, 0, 0.25, 0, 'y', 10); k.cbox(M.SD, 0.8, 0.5, 0.8, 0.05, 0, 0.7, 0);
    const face = (dir) => k.at(0, 0.9 + h / 2, dir * 0.26, dir > 0 ? Math.PI : 0, (q) => {
      q.cbox(M.S, w, h, 0.3, 0.06, 0, 0, 0); q.box(M.SK, w * 0.93, h * 0.86, 0.02, 0, 0, -0.16);
      if (fine) { for (let i = -2; i <= 2; i++) q.box(M.SD, 0.06, h * 0.9, 0.1, (i / 2) * w * 0.42, 0, 0.19); q.cbox(M.SD, w * 0.6, 0.12, 0.14, 0.03, 0, h / 2 + 0.1, -0.02); }
    }, -0.16);
    face(-1); if (kind === 'twin') face(1); else { k.cbox(M.SD, w * 0.3, h * 0.5, 0.5, 0.05, 0, 0.9 + h * 0.4, 0.5); k.rod(M.SD, [0, 0.9, 0.3], [0, 0.9 + h * 0.4, 0.5], 0.08, 4); }
  } else { // lattice reflector
    k.cyl(M.SD, 0.24, 0.34, 0.6, 0, 0.3, 0, 'y', 10); k.cbox(M.SD, 0.7, 0.4, 0.9, 0.05, 0, 0.75, 0.1);
    const d = w * 0.13, pt = (u, v) => [u * w / 2, 1.0 + v * h, d * (u * u - 0.35) + (v - 0.5) * (v - 0.5) * h * 0.25], nu = fine ? 8 : 4, nv = fine ? 5 : 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) k.rod(M.SD, pt(-1 + (2 * i) / nu, j / nv), pt(-1 + (2 * (i + 1)) / nu, j / nv), j === 0 || j === nv ? 0.05 : 0.028, 3);
    for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) k.rod(M.SD, pt(-1 + (2 * i) / nu, j / nv), pt(-1 + (2 * i) / nu, (j + 1) / nv), i === 0 || i === nu ? 0.05 : 0.028, 3);
    k.rod(M.SD, [0, 0.95, 0.2], [0, 1.0 + h * 0.5, -w * 0.36], 0.05, 4); k.cbox(M.SK, 0.3, 0.3, 0.4, 0.04, 0, 1.0 + h * 0.5, -w * 0.38);
    for (const s of [-1, 1]) { k.rod(M.SD, [s * 0.3, 0.9, 0.4], pt(s * 0.6, 0.85), 0.045, 3); k.rod(M.SD, [s * 0.3, 0.9, 0.4], pt(s * 0.6, 0.15), 0.045, 3); }
    k.cbox(M.SD, 0.5, 0.3, 0.3, 0.04, 0, 0.9, 0.6);
  }
  k.build(node);
  return node;
}

/* -------------------------------------------------------------------------------------------------------- ship scaffold */

/** Start a ship: materials, kits (k: everything static; dk: decals, no shadows), the hull and an empty model. ho = makeHull options. */
export function startShip(nation, lod, fine, ho, hk = 1) {
  const M = shipMats(nation), g = new THREE.Group(), k = new ShipKit({ lod, fine }), dk = new ShipKit({ lod, fine });
  const hull = makeHull({ ...ho, stations: lod ? 14 : fine ? ho.stations ?? 56 : 34, under: lod ? 3 : 6, mid: lod ? 2 : 3 });
  const HC = { m: M.hull(hk), r: 1, g: 1, b: 1 };
  for (const s of hull.side) k.add(HC, s);
  k.add(M.D, hull.deck);
  const model = { dims: null, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [], view: {} };
  return { M, A: M.A, nation, lod, fine, g, k, dk, hull, HC, model };
}
export function finishShip(S) { if (!S.lod && !S.model.interior && S.cabins !== false) { try { addCabins(S); } catch (e) { console.warn('cabins: ' + e.message); } } S.k.build(S.g); S.dk.build(S.g, { cast: false }); S.g.userData.model = S.model; return S.g; }
/** Add a spinner (radar set) to the ship. */
export function spin(S, node, x, y, z, speed) { node.position.set(x, y, z); S.g.add(node); S.model.spinners.push({ node, axis: 'y', speed }); return node; }
/** Walkable rectangles stepping up the sheer of the bow from zFlat forward to zBow. */
export function bowDecks(hull, zFlat, zBow, n = 3, inset = 0.5) {
  const out = [];
  for (let i = 0; i < n; i++) { const za = lerp(zFlat, zBow, i / n), zb = lerp(zFlat, zBow, (i + 1) / n), x = Math.max(0.7, Math.min(hull.half(za), hull.half(zb)) - inset); out.push({ x0: -x, x1: x, z0: zb, z1: za, y: hull.deckY((za + zb) / 2) }); }
  return out;
}
/** Rubbing strake / fender bar along the hull at height y from z0 to z1 (both sides). */
export function strake(k, hull, mc, y, z0, z1, r = 0.09, step = 2.5) {
  const n = Math.max(1, Math.round((z1 - z0) / step));
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) { const za = z0 + ((z1 - z0) * i) / n, zb = z0 + ((z1 - z0) * (i + 1)) / n; k.rod(mc, [s * (hull.xAt(za, y) + r * 0.4), y, za], [s * (hull.xAt(zb, y) + r * 0.4), y, zb], r, 4); }
}
/** Flight-deck safety net: a frame of bars hung outboard of the deck edge along pts; out = [dx, dz] pointing outboard. */
export function net(k, mc, pts, out, w = 1.3) {
  if (!k.detail) return;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ao = [a[0] + out[0] * w, a[1] - 0.22, a[2] + out[1] * w], bo = [b[0] + out[0] * w, b[1] - 0.22, b[2] + out[1] * w];
    k.rod(mc, ao, bo, 0.035, 3);
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / (k.fine ? 0.9 : 1.8)));
    for (let q = i ? 1 : 0; q <= n; q++) { const t = q / n; k.rod(mc, [lerp(a[0], b[0], t), lerp(a[1], b[1], t) - 0.04, lerp(a[2], b[2], t)], [lerp(ao[0], bo[0], t), lerp(ao[1], bo[1], t), lerp(ao[2], bo[2], t)], 0.02, 3); }
    if (k.fine) for (const f of [0.33, 0.66]) k.rod(mc, [lerp(a[0], ao[0], f), lerp(a[1] - 0.04, ao[1], f), lerp(a[2], ao[2], f)], [lerp(b[0], bo[0], f), lerp(b[1] - 0.04, bo[1], f), lerp(b[2], bo[2], f)], 0.012, 3);
  }
}
/** V-shaped breakwater across the foredeck at z, half-width w, height h. */
export function breakwater(k, M, y, z, w, h = 0.9) {
  for (const s of [-1, 1]) { k.box(M.SD, w * 1.12, h, 0.08, s * w * 0.5, y + h / 2, z + w * 0.25, [0, -s * 0.46, 0]); if (k.fine) for (const t of [0.25, 0.6, 0.9]) k.box(M.SD, 0.06, h * 0.8, 0.5, s * w * t, y + h * 0.4, z + w * 0.5 * t + 0.28, [0.5, -s * 0.46, 0]); }
}
