// Aircraft toolkit (v2 models): geometry helpers, code-painted textures and shared materials for every aircraft and for
// the ordnance models. Axes as everywhere: +Y up, forward = -Z, starboard = +X, metres.
//
// MATERIALS (all shared, created once):
//   paint[nation]  the airframe paint. One UV set in METRES (u runs along the airframe, v across it); the shader lays a
//                  16 m camouflage tile (turned 20 degrees, so it never lines up with the panels) under a 6 m panel-detail
//                  tile (panel lines, rivets, hatches, stencils, grime) with matching normal and roughness maps. Vertex
//                  colours tint it (dark anti-glare panels, lighter undersides, exhaust soot).
//   trim / metal   vertex-coloured satin paint and bare metal for all the small parts: one draw call each, whatever the colours.
//   lamp           unlit vertex-coloured (navigation lights, lenses).
//   glass / glassDark  tinted canopy glass that turns mirror-like at grazing angles, and opaque dark glazing for windows.
// GEOMETRY: loft() (smooth body through cross-section stations), wingGeo() (real aerofoil sections), latheZ(), cboxGeo(),
// tyreGeo(). Kit merges everything per material into indexed geometry (like PartBuilder, plus colours and metre UVs).
// cached() builds each model once and hands out copies that share geometry and materials.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT, registerTexture } from '../../gfx/materials.js';
import { gfx } from '../../gfx/renderer.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
const XA = new V3(1, 0, 0), YA = new V3(0, 1, 0);
const _m = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3(), _v = new V3(), _n = new V3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const spow = (v, p) => (v < 0 ? -Math.pow(-v, p) : Math.pow(v, p));

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** True when the full-detail build should keep its small parts (Medium quality and up). */
export const fineDetail = () => !gfx.q || gfx.q.lod >= 1;

/* ------------------------------------------------------------------------------------------------------------ textures */

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const LAT = new Map();
function lattice(n, seed) {
  const key = n + ':' + seed; let c = LAT.get(key); if (c) return c;
  c = mk(n, n); const x = c.getContext('2d'), im = x.createImageData(n, n), r = rng(seed * 7919 + n);
  for (let i = 0; i < im.data.length; i += 4) { const v = (r() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); LAT.set(key, c); return c;
}
// tiling fractal value noise, drawn into ctx
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

// --- camouflage: 16 m per repeat. Aethia: soft-edged sprayed greys. Extro: hard-edged splinter, charcoal and sea green.
function drawCamo(ctx, w, h, nation) {
  const A = nation === 'aethia', r = rng(A ? 31 : 37);
  const cols = A ? ['#5f6b77', '#939eaa', '#6c7884', '#87939f'] : ['#1f4a44', '#1a1d1f', '#3f4a4a', '#245249'];
  const paint = (c, cw, ch) => {
    c.fillStyle = A ? '#7a8692' : '#30363a'; c.fillRect(0, 0, cw, ch);
    const N = A ? 17 : 15;
    for (let i = 0; i < N; i++) {
      const cx = r() * cw, cy = r() * ch, rad = cw * (0.07 + r() * 0.11), np = A ? 9 : 4 + ((r() * 3) | 0), pts = [], rot = r() * TAU, el = A ? 1.5 : 1.9;
      for (let k = 0; k < np; k++) {
        const a = ((k + r() * 0.6) / np) * TAU, rr = rad * (0.55 + r() * 0.7), x = Math.cos(a) * rr * el, y = Math.sin(a) * rr;
        pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
      }
      c.fillStyle = cols[i % cols.length];
      wrapXY(c, cw, ch, () => {
        c.beginPath();
        if (!A) pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
        else {
          const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const s0 = mid(pts[np - 1], pts[0]); c.moveTo(s0[0], s0[1]);
          for (let k = 0; k < np; k++) { const e = mid(pts[k], pts[(k + 1) % np]); c.quadraticCurveTo(pts[k][0], pts[k][1], e[0], e[1]); }
        }
        c.closePath(); c.fill();
      });
    }
  };
  if (A) { // paint small and scale up: the smoothing gives the feathered edge of sprayed paint
    const d = Math.max(64, w >> 3), sm = mk(d, d); paint(sm.getContext('2d'), d, d);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const p = ctx.createPattern(sm, 'repeat'); p.setTransform(new DOMMatrix().scale(w / d, h / d)); ctx.fillStyle = p; ctx.fillRect(0, 0, w, h);
  } else paint(ctx, w, h);
  mottle(ctx, w, h, A ? 41 : 43, 3, A ? 0.3 : 0.38);
  mottle(ctx, w, h, A ? 45 : 47, 24, 0.12);
}

// --- panel detail: one layout shared by the colour, height and roughness textures. 8 m per repeat.
let LAYOUT = null;
function layout() {
  const r = rng(4711), rows = [];
  let y = 0;
  while (y < 0.999) {
    let hh = 0.085 + r() * 0.085; if (1 - (y + hh) < 0.09) hh = 1 - y;
    const xs = []; let x = r() * 0.3; const x0 = x;
    while (x < x0 + 1 - 0.13) { xs.push(x); x += 0.13 + r() * 0.24; }
    rows.push({ y0: y, y1: y + hh, xs, seam: xs.map(() => r() < 0.5), joint: xs.map(() => r() < 0.72), tone: xs.map(() => r()) });
    y += hh;
  }
  const L = { rows, hatches: [], ports: [], streaks: [], stencils: [], vents: [], chips: [] };
  for (let i = 0; i < 20; i++) L.hatches.push({ x: r(), y: r(), w: 0.022 + r() * 0.05, h: 0.016 + r() * 0.032, round: r() < 0.5 });
  for (let i = 0; i < 10; i++) L.ports.push({ x: r(), y: r(), r: 0.005 + r() * 0.009, red: r() < 0.4 });
  for (let i = 0; i < 46; i++) L.streaks.push({ x: r(), y: r(), len: 0.05 + r() * 0.22, wd: 0.0015 + r() * 0.005, a: 0.08 + r() * 0.16, oil: r() < 0.3 });
  for (let i = 0; i < 16; i++) L.stencils.push({ x: r(), y: r(), n: 1 + ((r() * 3) | 0), w: 0.018 + r() * 0.028, kind: r() < 0.55 ? 'w' : r() < 0.6 ? 'r' : 'y', seed: (r() * 1e6) | 0 });
  for (let i = 0; i < 5; i++) L.vents.push({ x: r(), y: r() });
  for (let i = 0; i < 260; i++) L.chips.push({ x: r(), y: r(), s: 0.0008 + r() * 0.0022 });
  return L;
}
function drawDetail(ctx, w, h, mode) {
  if (w < 1024) { // small presets: paint at 1024 and scale down, so the marks keep their real size and simply soften
    const c = mk(1024, Math.round((1024 * h) / w)); drawDetail(c.getContext('2d'), c.width, c.height, mode);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(c, 0, 0, w, h); return;
  }
  const L = LAYOUT || (LAYOUT = layout()), px = Math.max(1, w / 1024), col = mode === 'col', hgt = mode === 'hgt', rgh = mode === 'rgh';
  const g = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
  const wx = (fn) => { for (const dx of [-w, 0, w]) { ctx.save(); ctx.translate(dx, 0); fn(); ctx.restore(); } };
  ctx.fillStyle = g(rgh ? 184 : 128); ctx.fillRect(0, 0, w, h);
  // panel-to-panel paint variation
  if (!hgt) for (const row of L.rows) row.xs.forEach((x0, k) => {
    const x1 = k + 1 < row.xs.length ? row.xs[k + 1] : row.xs[0] + 1, t = row.tone[k] - 0.5;
    ctx.fillStyle = g(col ? 128 + t * 4 : 184 + t * 7);   // barely there: stronger and the panels read as a tile grid from a distance
    wx(() => ctx.fillRect(x0 * w, row.y0 * h, (x1 - x0) * w + 1, (row.y1 - row.y0) * h + 1));
  });
  // broad dirt / wear / skin waviness
  if (col) { mottle(ctx, w, h, 61, 5, 0.3, 'overlay'); mottle(ctx, w, h, 63, 40, 0.1, 'overlay'); }
  if (rgh) { mottle(ctx, w, h, 65, 6, 0.38, 'overlay'); mottle(ctx, w, h, 67, 48, 0.18, 'overlay'); }
  if (hgt) { ctx.save(); ctx.globalAlpha = 0.07; const t = mk(w, h); fbm(t.getContext('2d'), w, h, 69, 6, 3); ctx.drawImage(t, 0, 0); ctx.restore(); }
  // seams: grime first (wide and faint), then the line itself
  const seams = () => {
    ctx.beginPath();
    for (const row of L.rows) row.xs.forEach((x0, k) => {
      const x1 = k + 1 < row.xs.length ? row.xs[k + 1] : row.xs[0] + 1;
      const X0 = Math.round(x0 * w) + 0.5, Y0 = Math.round(row.y0 * h) + 0.5, Y1 = Math.round(row.y1 * h) + 0.5;
      if (row.joint[k]) { ctx.moveTo(X0, Y0); ctx.lineTo(X0, Y1); }
      if (row.seam[k]) { ctx.moveTo(X0, Y0); ctx.lineTo(Math.round(x1 * w) + 0.5, Y0); }
    });
    wx(() => ctx.stroke());
  };
  // (kept thin and faint: wide dark seams survive mip-mapping and turn the skin into brickwork from a distance)
  if (col) { ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 3.5 * px; seams(); ctx.strokeStyle = 'rgba(8,8,10,0.42)'; ctx.lineWidth = 1.1 * px; seams(); }
  if (rgh) { ctx.strokeStyle = 'rgba(240,240,240,0.55)'; ctx.lineWidth = 1.3 * px; seams(); }
  if (hgt) { ctx.strokeStyle = g(64); ctx.lineWidth = 1.8 * px; seams(); }
  // rivet rows either side of the seams (only when there are enough pixels to hold them)
  if (w >= 1024) {
    const s = Math.max(1, Math.round(px * 0.9)), step = 9 * px, off = 5 * px;
    ctx.fillStyle = col ? 'rgba(0,0,0,0.16)' : rgh ? 'rgba(255,255,255,0.2)' : g(104);
    for (const row of L.rows) row.xs.forEach((x0, k) => {
      const x1 = k + 1 < row.xs.length ? row.xs[k + 1] : row.xs[0] + 1, X0 = x0 * w, X1 = x1 * w, Y0 = row.y0 * h, Y1 = row.y1 * h;
      wx(() => {
        if (row.joint[k]) for (let yy = Y0 + off; yy < Y1 - off * 0.5; yy += step) { ctx.fillRect(X0 + off, yy, s, s); ctx.fillRect(X0 - off - s, yy, s, s); }
        if (row.seam[k]) for (let xx = X0 + off * 2; xx < X1 - off; xx += step) { ctx.fillRect(xx, Y0 + off, s, s); ctx.fillRect(xx, Y0 - off - s, s, s); }
      });
    });
  }
  // access hatches with corner fasteners, round ports, louvre vents
  const rr = (x, y, ww, hh, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + ww, y, x + ww, y + hh, rad); ctx.arcTo(x + ww, y + hh, x, y + hh, rad); ctx.arcTo(x, y + hh, x, y, rad); ctx.arcTo(x, y, x + ww, y, rad); ctx.closePath(); };
  for (const q of L.hatches) wrapXY(ctx, w, h, () => {
    const x = q.x * w, y = q.y * h, ww = q.w * w, hh = q.h * h, rad = q.round ? Math.min(ww, hh) * 0.3 : 2 * px;
    rr(x, y, ww, hh, rad);
    if (hgt) { ctx.fillStyle = g(137); ctx.fill(); ctx.strokeStyle = g(60); ctx.lineWidth = 1.6 * px; ctx.stroke(); }
    else if (col) { ctx.fillStyle = 'rgba(140,140,140,0.25)'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2 * px; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(150,150,150,0.5)'; ctx.fill(); ctx.strokeStyle = 'rgba(240,240,240,0.7)'; ctx.lineWidth = 1.4 * px; ctx.stroke(); }
    ctx.fillStyle = hgt ? g(88) : col ? 'rgba(0,0,0,0.4)' : 'rgba(90,90,90,0.9)';
    const fs = Math.max(1.5, 2.2 * px), nx = Math.max(2, Math.round(ww / (14 * px))), ny = Math.max(2, Math.round(hh / (14 * px)));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) if (i === 0 || j === 0 || i === nx || j === ny) ctx.fillRect(x + 3 * px + ((ww - 6 * px - fs) * i) / nx, y + 3 * px + ((hh - 6 * px - fs) * j) / ny, fs, fs);
  });
  for (const q of L.ports) wrapXY(ctx, w, h, () => {
    const x = q.x * w, y = q.y * h, rad = q.r * w;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU);
    if (hgt) { ctx.fillStyle = g(118); ctx.fill(); ctx.strokeStyle = g(58); ctx.lineWidth = 1.6 * px; ctx.stroke(); }
    else if (col) { ctx.fillStyle = 'rgba(60,60,60,0.3)'; ctx.fill(); ctx.strokeStyle = q.red ? 'rgba(235,60,40,0.9)' : 'rgba(0,0,0,0.5)'; ctx.lineWidth = (q.red ? 2 : 1.2) * px; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(110,110,110,0.8)'; ctx.fill(); }
  });
  for (const q of L.vents) wrapXY(ctx, w, h, () => {
    ctx.fillStyle = hgt ? g(40) : col ? 'rgba(0,0,0,0.75)' : 'rgba(250,250,250,0.9)';
    for (let i = 0; i < 4; i++) ctx.fillRect(q.x * w, q.y * h + i * 5 * px, 26 * px, 2.2 * px);
  });
  // streaks trailing aft (+u) from seams and ports: dirt, oil and hydraulic fluid
  if (!hgt) for (const q of L.streaks) wrapXY(ctx, w, h, () => {
    const x = q.x * w, y = q.y * h, len = q.len * w, wd = Math.max(1, q.wd * h);
    const gr = ctx.createLinearGradient(x, 0, x + len, 0);
    if (col) { gr.addColorStop(0, `rgba(${q.oil ? '20,14,8' : '10,10,12'},${q.a})`); gr.addColorStop(1, 'rgba(10,10,12,0)'); }
    else { const v = q.oil ? 70 : 225; gr.addColorStop(0, `rgba(${v},${v},${v},${q.a * 2.5})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); }
    ctx.fillStyle = gr; ctx.fillRect(x, y - wd / 2, len, wd);
  });
  // stencils and warning marks ("greeked" lettering, boxes, hazard corners) and paint chips
  if (col) {
    for (const q of L.stencils) wrapXY(ctx, w, h, () => {
      const x = q.x * w, y = q.y * h, ww = q.w * w, lh = 4.5 * px, rs = rng(q.seed);
      const ink = q.kind === 'w' ? 'rgba(245,245,245,0.75)' : q.kind === 'r' ? 'rgba(235,50,35,0.85)' : 'rgba(250,200,40,0.85)';
      ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, 1.1 * px);
      for (let i = 0; i < q.n; i++) { let cx = x; while (cx < x + ww) { const lw = (2 + rs() * 7) * px; ctx.fillRect(cx, y + i * lh * 1.5, Math.min(lw, x + ww - cx), Math.max(1, 1.6 * px)); cx += lw + 2 * px; } }
      if (q.kind !== 'w') ctx.strokeRect(x - 3 * px, y - 3 * px, ww + 6 * px, q.n * lh * 1.5 + 4 * px);
    });
    ctx.fillStyle = 'rgba(235,235,235,0.3)';
    for (const q of L.chips) ctx.fillRect(q.x * w, q.y * h, Math.max(1, q.s * w * 2), Math.max(1, q.s * w));
  } else if (rgh) { ctx.fillStyle = 'rgba(70,70,70,0.6)'; for (const q of L.chips) ctx.fillRect(q.x * w, q.y * h, Math.max(1, q.s * w * 2), Math.max(1, q.s * w)); }
}

// --- rotor blur disc: faint smear with soft blade ghosts and a tip ring
function drawDisc(ctx, w, h, n, tip) {
  const c = w / 2; ctx.clearRect(0, 0, w, h);
  const gr = ctx.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, 'rgba(20,22,24,0)'); gr.addColorStop(0.1, 'rgba(20,22,24,0.02)'); gr.addColorStop(0.35, 'rgba(20,22,24,0.13)'); gr.addColorStop(0.9, 'rgba(20,22,24,0.2)');
  gr.addColorStop(0.955, 'rgba(20,22,24,0.2)'); gr.addColorStop(0.96, tip); gr.addColorStop(0.985, tip); gr.addColorStop(0.992, 'rgba(20,22,24,0.1)'); gr.addColorStop(1, 'rgba(20,22,24,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n * 2; i++) { // blade ghosts (two sets: the eye sees the blades at more than one place)
    const a = (i / (n * 2)) * TAU + 0.3, wd = i % 2 ? 0.1 : 0.17, al = i % 2 ? 0.07 : 0.13;
    ctx.save(); ctx.translate(c, c); ctx.rotate(a);
    const lg = ctx.createLinearGradient(0, -c * wd, 0, c * wd); lg.addColorStop(0, 'rgba(12,13,14,0)'); lg.addColorStop(0.5, `rgba(12,13,14,${al})`); lg.addColorStop(1, 'rgba(12,13,14,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(c * 0.08, 0); ctx.lineTo(c * 0.97, -c * wd); ctx.lineTo(c * 0.97, c * wd); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}

/* ----------------------------------------------------------------------------------------------------------- materials */

const DETAIL_M = 8, CAMO_M = 16;
const CAMO_ROT = 0.35;
// `map` is the camouflage (so the paint schemes in js/gfx/paint.js, which repaint a material's map, recolour the whole
// airframe); the panel detail is a second texture laid over it at its own scale: 0.5 = neutral, darker and lighter marks.
class AirPaint extends THREE.MeshStandardMaterial {
  constructor(o) { super(); this.isAirPaint = true; this.detailMap = null; if (o) this.setValues(o); }
  copy(s) { super.copy(s); this.detailMap = s.detailMap; return this; }
  onBeforeCompile(sh) {
    sh.uniforms.tDetail = { value: this.detailMap };
    const k = CAMO_M / DETAIL_M, c = (Math.cos(CAMO_ROT) * k).toFixed(4), s = (Math.sin(CAMO_ROT) * k).toFixed(4); // undo the camo tile's scale and turn
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D tDetail;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec3 stCamo = texture2D( map, vMapUv ).rgb;
        vec3 stDetail = texture2D( tDetail, mat2( ${c}, ${s}, -${s}, ${c} ) * vMapUv ).rgb;
        diffuseColor.rgb *= stCamo * stDetail * 2.0;
      #endif`);
  }
}

// The names end in "insignia" on purpose: js/gfx/paint.js then treats these as markings, not paint, and (having no
// texture) leaves them alone, so tyres, pilots, gun barrels and glazing keep their own colours under any paint scheme.
export const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.12 }); trim.name = 'airTrim.fittings.insignia';
export const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.82 }); metal.name = 'airMetal.fittings.insignia';
export const lamp = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); lamp.name = 'airLamp';

/** A material with a colour: what every Kit call takes as its first argument. k scales the brightness (lamps above 1 glow). */
export function tone(m, hex, k = 1) { const c = new THREE.Color(hex); return { m, r: c.r * k, g: c.g * k, b: c.b * k }; }
// shared colours
export const C = {
  black: tone(trim, 0x0b0b0c), rubber: tone(trim, 0x131314), dark: tone(trim, 0x24272a), grey: tone(trim, 0x6f767c), white: tone(trim, 0xdfe2e4), gearWhite: tone(trim, 0xc9cdd0),
  red: tone(trim, 0xb3261e), yellow: tone(trim, 0xe0b21a), orange: tone(trim, 0xe8641a), olive: tone(trim, 0x40452f), tan: tone(trim, 0x8a7a58), skin: tone(trim, 0xc49a7a),
  seat: tone(trim, 0x2e3128), strap: tone(trim, 0x6b6a52), brown: tone(trim, 0x5a3a22), radome: tone(trim, 0x3a3f44), lens: tone(metal, 0x05070a), lensBlue: tone(metal, 0x0c1a30), lensGold: tone(metal, 0x4a3410),
  gun: tone(metal, 0x3b3f44), steel: tone(metal, 0xb4b8bc), chrome: tone(metal, 0xe4e6e8), iron: tone(metal, 0x5a5f65), burnt: tone(metal, 0x46392f), hot: tone(metal, 0x1c1a19), brass: tone(metal, 0xb08d3c), titan: tone(metal, 0x7a7670),
  lampRed: tone(lamp, 0xff2a18, 2.2), lampGreen: tone(lamp, 0x18ff70, 2.0), lampWhite: tone(lamp, 0xffffff, 2.4), lampAmber: tone(lamp, 0xffb030, 1.8), form: tone(lamp, 0xc8e070, 0.55),
};

const WHITE = { m: trim, r: 1, g: 1, b: 1 }, LEAD = { r: 0.1, g: 0.105, b: 0.11 };
const MATS = {};
/** Shared aircraft materials and colours for a nation. */
export function airMats(nation) {
  if (MATS[nation]) return MATS[nation];
  const A = nation === 'aethia', rep = (t) => { t.repeat.set(1 / DETAIL_M, 1 / DETAIL_M); return t; };
  const camo = registerTexture('v2air_camo_' + nation, { scale: 0.5, draw: (c, w, h) => drawCamo(c, w, h, nation) });
  camo.repeat.set(1 / CAMO_M, 1 / CAMO_M); camo.rotation = CAMO_ROT;
  const det = registerTexture('v2air_detail', { kind: 'rough', draw: (c, w, h) => drawDetail(c, w, h, 'col') });
  const nrm = rep(registerTexture('v2air_detailN', { kind: 'normal', strength: 1.5, draw: (c, w, h) => drawDetail(c, w, h, 'hgt') }));
  const rgh = rep(registerTexture('v2air_detailR', { kind: 'rough', scale: 0.5, draw: (c, w, h) => drawDetail(c, w, h, 'rgh') }));
  const paint = new AirPaint({ map: camo, detailMap: det, normalMap: nrm, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: rgh, roughness: A ? 0.9 : 1, metalness: A ? 0.2 : 0.16, envMapIntensity: 0.85, vertexColors: true });
  paint.name = 'airPaint_' + nation;
  const fres = (m, a1, p) => { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `diffuseColor.a = mix( diffuseColor.a, ${a1}, pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), ${p} ) );\n#include <opaque_fragment>`); }; return m; };
  const glass = fres(new THREE.MeshPhysicalMaterial({ color: A ? 0x16242f : 0x3a2a10, roughness: 0.04, metalness: A ? 0.15 : 0.45, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.7, transparent: true, opacity: A ? 0.36 : 0.44, depthWrite: false }), '0.94', '2.2');
  glass.name = 'airGlass_' + nation;
  const glassDark = new THREE.MeshPhysicalMaterial({ color: A ? 0x0a1119 : 0x110d07, roughness: 0.06, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 });
  glassDark.name = 'airGlazing_' + nation + '.insignia';
  const discTex = (n, tip) => registerTexture('v2air_disc' + n + tip, { size: 256, wrap: false, draw: (c, w, h) => drawDisc(c, w, h, n, tip) });
  const disc = (n, tip = 'rgba(214,170,40,0.34)') => { const key = 'disc' + n + tip; return MATS[key] || (MATS[key] = new THREE.MeshBasicMaterial({ map: discTex(n, tip), transparent: true, depthWrite: false, side: THREE.DoubleSide })); };
  const P = { m: paint, r: 1, g: 1, b: 1 }, mul = (k, g = k, b = k) => ({ m: paint, r: k, g, b });
  return (MATS[nation] = {
    nation, A, paint, glass, glassDark, trim, metal, lamp, disc, insignia: MAT.insignia[nation], burner: MAT.afterburner,
    P, mul, PD: mul(A ? 0.42 : 0.5), PL: mul(A ? 1.16 : 1.3, A ? 1.16 : 1.34, A ? 1.18 : 1.36), G: glass, GD: glassDark,
    under: A ? 1.14 : 1.22,                                   // how much lighter the paint is underneath
    frame: mul(A ? 0.42 : 0.4), body: P, bodyDark: mul(A ? 0.62 : 0.6),   // airframe-coloured parts: all in the paint, so paint schemes reach them
    helmet: tone(trim, A ? 0xd4d9dd : 0x26352f), suit: tone(trim, A ? 0x4e5a48 : 0x2a2e31), blade: tone(trim, A ? 0x1b1d1f : 0x15181a), spinner: tone(trim, A ? 0xdadde0 : 0xa8281e),
    ord: tone(trim, A ? 0xd9dcde : 0x7b8386), ordBody: tone(trim, A ? 0x8f989f : 0x434b46),
  });
}

/* ------------------------------------------------------------------------------------------------------------ geometry */

/** Station for loft(): half-width w, height above (ht) and below (hb) the centre line y, superellipse exponents (2 = ellipse,
 *  4+ = rounded box, below 2 = diamond with chines). extra: { x, sk (z shear per metre of height: raked sections),
 *  sx (z shear per metre out from the centre: swept-back lips), c: true (crease: no smoothing through this station) }. */
export function S(z, w, ht, hb = ht, y = 0, nt = 2, nb = nt, extra = null) { return { z, w, ht, hb, y, nt, nb, x: 0, sk: 0, sx: 0, c: false, ...extra }; }
const KEYS = ['x', 'y', 'w', 'ht', 'hb', 'nt', 'nb', 'sk', 'sx'];
function slope(st, i, key, side) {
  const n = st.length, a = st[i];
  if (i === 0) return (st[1][key] - a[key]) / (st[1].z - a.z);
  if (i === n - 1) return (a[key] - st[i - 1][key]) / (a.z - st[i - 1].z);
  if (a.c) { const b = st[i + side]; return (b[key] - a[key]) / (b.z - a.z); }
  return (st[i + 1][key] - st[i - 1][key]) / (st[i + 1].z - st[i - 1].z);
}
function evalSeg(st, i, t) {
  const a = st[i], b = st[i + 1], dz = b.z - a.z, o = { z: a.z + dz * t, c: false };
  const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  for (const k of KEYS) {
    const lo = Math.min(a[k], b[k]), hi = Math.max(a[k], b[k]);
    o[k] = lo === hi ? lo : clamp(h00 * a[k] + h10 * dz * slope(st, i, k, 1) + h01 * b[k] + h11 * dz * slope(st, i + 1, k, -1), lo, hi);
  }
  return o;
}
/** The interpolated station of a loft at z (for frames, bands and parts that must sit on the surface). */
export function stAt(st, z) {
  if (z <= st[0].z) return { ...st[0], z };
  for (let i = 0; i < st.length - 1; i++) if (z <= st[i + 1].z) return evalSeg(st, i, (z - st[i].z) / (st[i + 1].z - st[i].z));
  return { ...st[st.length - 1], z };
}
/** Surface point of a loft at z and angle fraction t (0 = keel, 0.25 = starboard, 0.5 = top, 0.75 = port), pushed out by `out`. */
export function surf(st, z, t, out = 0) {
  const r = stAt(st, z), sn = Math.sin(TAU * t), cs = Math.cos(TAU * t), low = cs > 0, n = low ? r.nb : r.nt, hh = (low ? r.hb : r.ht) + out;
  const x = (r.w + out) * spow(sn, 2 / n), y = -hh * spow(cs, 2 / n);
  return new V3(r.x + x, r.y + y, z + r.sk * y + r.sx * Math.abs(x));
}
/** The angle fraction t at which a loft's starboard side (side = 1; -1 = port) is at height y, at station z. */
export function tAt(st, z, y, side = 1) {
  const r = stAt(st, z), d = y - r.y, low = d < 0, hh = low ? r.hb : r.ht, n = low ? r.nb : r.nt;
  const t = Math.acos(clamp(-Math.sign(d) * Math.pow(Math.min(1, Math.abs(d) / hh), n / 2), -1, 1)) / TAU;
  return side > 0 ? t : 1 - t;
}
/** Stations for a rounded nose or tail: from the tip at zTip to `base` (a station), n steps, shape power p (0.5 = blunt, 1 = cone). */
export function ogive(zTip, base, n = 4, p = 0.6, yTip = base.y) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = i / n, k = i === 0 ? 0.012 : Math.pow(f, p);
    out.push({ ...base, z: zTip + (base.z - zTip) * f, w: Math.max(base.w * k, 0.004), ht: Math.max(base.ht * k, 0.004), hb: Math.max(base.hb * k, 0.004), y: yTip + (base.y - yTip) * Math.pow(f, 0.8), c: false });
  }
  if (base.z < zTip) out.reverse(); // a tail cone: the caller places it after the base
  return out;
}

/** Smooth body through cross-section stations (ordered by z). o: seg (around), step (ring spacing, m), grow (push the surface
 *  out, m), arc [t0, t1] (part of the way round only), keep(z, t) (leave quads out: windows, cut-outs), tint(z, t) (vertex
 *  colour: number or [r, g, b]), capA / capB (flat end caps), inside (face inward). UVs are metres: u = z, v = girth from the top. */
export function loft(st, o = {}) {
  const seg = o.seg || 24, step = o.step || 0.5, grow = o.grow || 0, a0 = o.arc ? o.arc[0] : 0, a1 = o.arc ? o.arc[1] : 1, full = !o.arc;
  const rings = [];
  for (let i = 0; i < st.length - 1; i++) { const n = Math.max(1, Math.round((st[i + 1].z - st[i].z) / step)); for (let k = 0; k < n; k++) rings.push(evalSeg(st, i, k / n)); }
  rings.push({ ...st[st.length - 1] });
  const nr = rings.length, nv = seg + 1, N = nr * nv, pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), ts = new Float32Array(nv);
  for (let j = 0; j < nv; j++) ts[j] = a0 + ((a1 - a0) * j) / seg;
  const pt = (r, t, out) => {
    const sn = Math.sin(TAU * t), cs = Math.cos(TAU * t), low = cs > 0, n = low ? r.nb : r.nt, w = Math.max(r.w + grow, 1e-3), hh = Math.max((low ? r.hb : r.ht) + grow, 1e-3);
    const x = w * spow(sn, 2 / n), y = -hh * spow(cs, 2 / n);
    out[0] = r.x + x; out[1] = r.y + y; out[2] = r.z + r.sk * y + r.sx * Math.abs(x);
  };
  const a = [0, 0, 0], b = [0, 0, 0], GL = 40, girth = new Float32Array(GL + 1);
  for (let i = 0; i < nr; i++) {
    const r = rings[i];
    pt(r, 0, a); girth[0] = 0; // girth table from the keel, both ways round
    for (let k = 1; k <= GL; k++) { pt(r, (k / GL) * 0.5, b); girth[k] = girth[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]); a[0] = b[0]; a[1] = b[1]; }
    for (let j = 0; j < nv; j++) {
      const t = ts[j], q = (i * nv + j) * 3; pt(r, t, a); pos[q] = a[0]; pos[q + 1] = a[1]; pos[q + 2] = a[2];
      const tt = t > 0 && t % 1 === 0 ? 1 : ((t % 1) + 1) % 1, half = tt <= 0.5 ? tt : 1 - tt, gk = half * 2 * GL, g0 = Math.floor(Math.min(gk, GL - 1)), gv = girth[g0] + (girth[g0 + 1] - girth[g0]) * (gk - g0);
      uv[(i * nv + j) * 2] = a[2]; uv[(i * nv + j) * 2 + 1] = (girth[GL] - gv) * (tt <= 0.5 ? 1 : -1);
    }
  }
  // smooth normals from the whole grid (so pieces cut from the same loft shade as one surface)
  const P = (i, j, out) => { const q = (i * nv + j) * 3; return out.set(pos[q], pos[q + 1], pos[q + 2]); };
  const va = new V3(), vb = new V3(), vc = new V3(), vd = new V3(), fn = new V3();
  const acc = (i, j, n) => { const q = (i * nv + j) * 3; nor[q] += n.x; nor[q + 1] += n.y; nor[q + 2] += n.z; };
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < seg; j++) {
    P(i, j, va); P(i, j + 1, vb); P(i + 1, j, vc); P(i + 1, j + 1, vd);
    fn.copy(vb).sub(va).cross(_v.copy(vc).sub(va)); acc(i, j, fn); acc(i, j + 1, fn); acc(i + 1, j, fn);
    fn.copy(vd).sub(vb).cross(_v.copy(vc).sub(vb)); acc(i, j + 1, fn); acc(i + 1, j + 1, fn); acc(i + 1, j, fn);
  }
  for (let i = 0; i < nr; i++) {
    if (full) { const q0 = i * nv * 3, q1 = (i * nv + seg) * 3; for (let k = 0; k < 3; k++) { const v = nor[q0 + k] + nor[q1 + k]; nor[q0 + k] = nor[q1 + k] = v; } }
    if (rings[i].w + grow < 0.02 && full) { let x = 0, y = 0, z = 0; for (let j = 0; j < nv; j++) { const q = (i * nv + j) * 3; x += nor[q]; y += nor[q + 1]; z += nor[q + 2]; } for (let j = 0; j < nv; j++) { const q = (i * nv + j) * 3; nor[q] = x; nor[q + 1] = y; nor[q + 2] = z; } }
  }
  for (let q = 0; q < N * 3; q += 3) { const l = Math.hypot(nor[q], nor[q + 1], nor[q + 2]) || 1, s = (o.inside ? -1 : 1) / l; nor[q] *= s; nor[q + 1] *= s; nor[q + 2] *= s; }
  const idx = [];
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < seg; j++) {
    if (o.keep && !o.keep((rings[i].z + rings[i + 1].z) / 2, (ts[j] + ts[j + 1]) / 2)) continue;
    const A = i * nv + j, B = A + 1, Cc = A + nv, D = Cc + 1;
    if (o.inside) idx.push(A, Cc, B, B, Cc, D); else idx.push(A, B, Cc, B, D, Cc);
  }
  let col = null;
  if (o.tint) { col = new Float32Array(N * 3); for (let i = 0; i < nr; i++) for (let j = 0; j < nv; j++) { const c = o.tint(rings[i].z, ts[j]), q = (i * nv + j) * 3; if (typeof c === 'number') col[q] = col[q + 1] = col[q + 2] = c; else { col[q] = c[0]; col[q + 1] = c[1]; col[q + 2] = c[2]; } } }
  let P2 = Array.from(pos), N2 = Array.from(nor), U2 = Array.from(uv), C2 = col ? Array.from(col) : null;
  if (o.keep) { // drop the vertices nothing uses
    const map = new Int32Array(N).fill(-1); P2 = []; N2 = []; U2 = []; C2 = col ? [] : null; let n = 0;
    for (let k = 0; k < idx.length; k++) { const v = idx[k]; if (map[v] < 0) { map[v] = n++; P2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); N2.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); U2.push(uv[v * 2], uv[v * 2 + 1]); if (col) C2.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]); } idx[k] = map[v]; }
  }
  const cap = (i, front) => {
    const r = rings[i], base = P2.length / 3, nz = front ? -1 : 1;
    P2.push(r.x, r.y, r.z); N2.push(0, 0, nz); U2.push(r.z, 0); if (C2) C2.push(1, 1, 1);
    for (let j = 0; j < nv; j++) { const q = (i * nv + j) * 3; P2.push(pos[q], pos[q + 1], pos[q + 2]); N2.push(0, 0, nz); U2.push(r.z + (pos[q + 1] - r.y), pos[q] - r.x); if (C2) C2.push(1, 1, 1); }
    for (let j = 0; j < seg; j++) { if (front) idx.push(base, base + 2 + j, base + 1 + j); else idx.push(base, base + 1 + j, base + 2 + j); }
  };
  if (o.capA) cap(0, true);
  if (o.capB) cap(nr - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2));
  if (C2) g.setAttribute('color', new THREE.Float32BufferAttribute(C2, 3));
  g.setIndex(idx); g.userData.uvm = true;
  return g;
}

/** A piece of a loft's surface between z0..z1 and angle fractions t0..t1, raised by `grow`: flush windows, frames, doors,
 *  raised panels, paint bands. Follows the body exactly. */
export function patch(st, z0, z1, t0, t1, grow = 0.01, seg = 6, step = 0.3, extra = null) {
  const n = Math.max(1, Math.ceil((z1 - z0) / step)), ss = [];
  for (let i = 0; i <= n; i++) ss.push({ ...stAt(st, z0 + ((z1 - z0) * i) / n), c: true });
  seg = Math.max(seg, Math.ceil(Math.abs(t1 - t0) * 80)); // fine enough round the body that its facets never dip under the skin
  return loft(ss, { arc: [t0, t1], grow, seg, step: 1e6, ...extra });
}

/** Wing / fin / blade panel with a real aerofoil section. secs: [{ x (span station), z (leading edge), c (chord), t (thickness
 *  ratio), y (height) }] from root to tip along +X. o: n (points per surface), c0 / c1 (build only that part of the chord:
 *  the fixed wing ahead of a control surface, or the surface itself), tip: 'round' | 'flat' | false, root: true (cap the root).
 *  UVs are metres: u = z, v = x. */
export function wingGeo(secsIn, o = {}) {
  const n = o.n || 8, c0 = o.c0 || 0, c1 = o.c1 ?? 1, secs = secsIn.map((s) => ({ y: 0, ...s }));
  if (o.tip === 'round') { const s = secs[secs.length - 1], T = s.t * s.c; secs.push({ ...s, x: s.x + Math.max(T * 0.55, 0.012), z: s.z + s.c * 0.035, c: s.c * 0.93, t: s.t * 0.3 }); }
  const fs = []; for (let j = 0; j <= n; j++) { const k = c0 === 0 ? 1 - Math.cos((Math.PI / 2) * (j / n)) : j / n; fs.push(c0 + (c1 - c0) * (c0 === 0 ? k * 0.55 + (j / n) * 0.45 : k)); }
  const yt = (f, t) => 5 * t * (0.2969 * Math.sqrt(f) - 0.126 * f - 0.3516 * f * f + 0.2843 * f * f * f - 0.1036 * f * f * f * f);
  const top = [], bot = []; for (let j = n; j >= 0; j--) top.push([fs[j], 1]); for (let j = 0; j <= n; j++) bot.push([fs[j], -1]);
  const strips = [];
  if (c0 === 0) strips.push([...top, ...bot.slice(1)]); else strips.push(top, [[fs[0], 1], [fs[0], -1]], bot);
  if (c1 < 1) strips.push([[fs[n], -1], [fs[n], 1]]);
  const pos = [], uv = [], idx = [], col = o.tint ? [] : null, ns = secs.length;
  const put = (s, f, side) => {
    pos.push(s.x, s.y + side * yt(f, s.t) * s.c, s.z + f * s.c); uv.push(s.z + f * s.c, s.x);
    if (col) { const c = o.tint(f, s.x, side); if (typeof c === 'number') col.push(c, c, c); else col.push(c[0], c[1], c[2]); }
  };
  for (const strip of strips) {
    const base = pos.length / 3, m = strip.length;
    for (const s of secs) for (const [f, side] of strip) put(s, f, side);
    for (let i = 0; i < ns - 1; i++) for (let k = 0; k < m - 1; k++) { const A = base + i * m + k, B = A + m, Cc = A + 1, D = B + 1; idx.push(A, B, Cc, B, D, Cc); }
  }
  const capAt = (s, tipSide) => {
    const base = pos.length / 3;
    for (let j = 0; j <= n; j++) { put(s, fs[j], 1); put(s, fs[j], -1); }
    for (let j = 0; j < n; j++) { const A = base + j * 2, D = A + 1, B = A + 2, Cc = A + 3; if (tipSide) idx.push(A, B, Cc, A, Cc, D); else idx.push(A, Cc, B, A, D, Cc); }
  };
  if (o.tip) capAt(secs[ns - 1], true);
  if (o.root) capAt(secs[0], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); g.userData.uvm = true;
  return g;
}
/** Wing section halfway (t) between two sections. */
export const midSec = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t, z: a.z + (b.z - a.z) * t, c: a.c + (b.c - a.c) * t, t: a.t + (b.t - a.t) * t });

/** Body of revolution along Z: profile [[z, r], ...] from nose (most negative z) to tail. Smooth normals. */
export function latheZ(profile, seg = 16) {
  const pts = profile.map(([z, r]) => new THREE.Vector2(Math.max(r, 0.0005), -z)).reverse();
  const g = new THREE.LatheGeometry(pts, seg); g.rotateX(-Math.PI / 2);
  return g;
}
/** Box with every edge chamfered by b, shaded as a soft-edged box. */
const CBOX = new Map();
export function cboxGeo(w, h, d, b = 0.02) {
  const key = [w, h, d, b].join(); let g = CBOX.get(key); if (g) return g;
  b = Math.min(b, w * 0.45, h * 0.45, d * 0.45);
  const hw = w / 2 - b, hh = h / 2 - b, c = Math.min(b * 0.6, hw * 0.9, hh * 0.9), sh = new THREE.Shape();
  sh.moveTo(-hw + c, -hh); sh.lineTo(hw - c, -hh); sh.lineTo(hw, -hh + c); sh.lineTo(hw, hh - c); sh.lineTo(hw - c, hh); sh.lineTo(-hw + c, hh); sh.lineTo(-hw, hh - c); sh.lineTo(-hw, -hh + c); sh.closePath();
  g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -(d - 2 * b) / 2); g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4); g.computeVertexNormals(); CBOX.set(key, g);
  return g;
}
/** Tyre about the X axis: radius r, width wd. */
export function tyreGeo(r, wd, seg = 18) {
  const h = wd / 2, ri = r * 0.56;
  const pts = [[ri, -h * 0.82], [r * 0.8, -h], [r * 0.95, -h * 0.86], [r, -h * 0.5], [r, h * 0.5], [r * 0.95, h * 0.86], [r * 0.8, h], [ri, h * 0.82]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, seg); g.rotateZ(Math.PI / 2);
  return g;
}

/* ----------------------------------------------------------------------------------------------------------------- Kit */

/** Collects geometry per material and merges it into one indexed mesh each. Every add takes a material or a tone() first.
 *  o: lod, fine (keep small parts), base (Matrix4: bake everything into a moving group's own frame; author in aircraft
 *  coordinates), under (paint brightness underneath), soot [{ p: Vector3, r, a }] (paint darkened around exhausts). */
export class Kit {
  constructor(o = {}) {
    this.lod = o.lod || 0; this.detail = this.lod === 0; this.fine = this.detail && (o.fine ?? true); this.base = o.base || null;
    this.under = o.under ?? 1; this.soot = o.soot || null; this.buckets = new Map(); this.tris = 0;
    this.mirror = false;   // while true, everything added is built as its port-side mirror image
  }
  add(mc, geo, x = 0, y = 0, z = 0, rot = null, scl = null, opt = null) {
    const mat = mc.m || mc, vc = !!mat.vertexColors, paint = !!mat.isAirPaint, mirror = !!(opt && opt.mirror) !== this.mirror;
    let g = geo; const uvm = !!g.userData.uvm;
    if (paint && !uvm && g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    const sp = g.attributes.position, sn = g.attributes.normal, su = g.attributes.uv, sc = g.attributes.color, n = sp.count;
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0); _q.setFromEuler(_e); _p.set(x, y, z);
    if (scl == null) _s.set(1, 1, 1); else if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
    _m.compose(_p, _q, _s); _nm.getNormalMatrix(_m);
    const flip = (_s.x * _s.y * _s.z < 0) !== mirror;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = vc ? new Float32Array(n * 3) : null;
    const cr = mc.m ? mc.r : 1, cg = mc.m ? mc.g : 1, cb = mc.m ? mc.b : 1, du = (opt && opt.uv ? opt.uv[0] : 0) + z, dv = (opt && opt.uv ? opt.uv[1] : 0) + x;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(sp, i).applyMatrix4(_m); _n.fromBufferAttribute(sn, i).applyMatrix3(_nm).normalize();
      if (mirror) { _v.x = -_v.x; _n.x = -_n.x; }
      if (uvm) { uv[i * 2] = su.getX(i) + du; uv[i * 2 + 1] = (su.getY(i) + dv) * (mirror ? -1 : 1); } else if (su && !paint) { uv[i * 2] = su.getX(i); uv[i * 2 + 1] = su.getY(i); }
      if (vc) {
        let k = 1;
        if (paint) {
          k = 1 + (this.under - 1) * sstep(0.1, -0.6, _n.y);
          if (this.soot) for (const s of this.soot) { const d = Math.hypot(_v.x - s.p.x, _v.y - s.p.y, (_v.z - s.p.z) * (_v.z > s.p.z ? 0.45 : 1.6)); k *= 1 - s.a * sstep(s.r, s.r * 0.2, d); }
        }
        col[i * 3] = cr * k * (sc ? sc.getX(i) : 1); col[i * 3 + 1] = cg * k * (sc ? sc.getY(i) : 1); col[i * 3 + 2] = cb * k * (sc ? sc.getZ(i) : 1);
      }
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z; nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z;
    }
    const src = g.index ? g.index.array : null, ni = src ? src.length : n, idx = new Uint32Array(ni);
    for (let i = 0; i < ni; i += 3) { const a = src ? src[i] : i, b = src ? src[i + 1] : i + 1, c = src ? src[i + 2] : i + 2; idx[i] = a; idx[i + 1] = flip ? c : b; idx[i + 2] = flip ? b : c; }
    if (paint && !uvm) { // no metre UVs: project along the dominant axis of each face
      for (let i = 0; i < ni; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        const ax = Math.abs(nor[a] + nor[b] + nor[c]), ay = Math.abs(nor[a + 1] + nor[b + 1] + nor[c + 1]), az = Math.abs(nor[a + 2] + nor[b + 2] + nor[c + 2]);
        for (const q of [a, b, c]) { const u = (q / 3) * 2; if (ay >= ax && ay >= az) { uv[u] = pos[q + 2]; uv[u + 1] = pos[q]; } else if (ax >= az) { uv[u] = pos[q + 2]; uv[u + 1] = pos[q + 1] + 3.1; } else { uv[u] = pos[q + 1] + 1.7; uv[u + 1] = pos[q]; } }
      }
    }
    if (this.base) { _nm.setFromMatrix4(this.base); for (let i = 0; i < n; i++) { _v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(this.base); _n.set(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]).applyMatrix3(_nm); pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z; nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z; } }
    let bk = this.buckets.get(mat); if (!bk) this.buckets.set(mat, (bk = []));
    bk.push({ pos, nor, uv, col, idx }); this.tris += ni / 3;
    return this;
  }
  /** add the part and its mirror image on the port side */
  pair(mc, geo, x = 0, y = 0, z = 0, rot = null, scl = null, opt = null) { this.add(mc, geo, x, y, z, rot, scl, opt); return this.add(mc, geo, x, y, z, rot, scl, { ...opt, mirror: true }); }
  box(mc, w, h, d, x = 0, y = 0, z = 0, rot = null) { return this.add(mc, new THREE.BoxGeometry(w, h, d), x, y, z, rot); }
  cbox(mc, w, h, d, b, x = 0, y = 0, z = 0, rot = null) { return this.add(mc, cboxGeo(w, h, d, b), x, y, z, rot); }
  cyl(mc, rTop, rBot, h, x = 0, y = 0, z = 0, axis = 'y', seg = 12, open = false) {
    const rot = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : null;
    return this.add(mc, new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), x, y, z, rot);
  }
  sphere(mc, r, x = 0, y = 0, z = 0, scl = null, seg = 14) { return this.add(mc, new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), x, y, z, null, scl); }
  /** cylinder between two points; r2 = radius at b */
  tube(mc, a, b, r = 0.05, seg = 8, r2 = null) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _v.length(); _q.setFromUnitVectors(YA, _v.normalize()); _e.setFromQuaternion(_q);
    return this.add(mc, new THREE.CylinderGeometry(r2 ?? r, r, len, seg), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, [_e.x, _e.y, _e.z]);
  }
  /** round-section pipe through points (bent struts, hoses, feed chutes) */
  pipe(mc, pts, r = 0.03, seg = 6, steps = 0) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(p[0], p[1], p[2])));
    return this.add(mc, new THREE.TubeGeometry(curve, steps || pts.length * 4, r, seg, false));
  }
  lathe(mc, profile, seg = 16, x = 0, y = 0, z = 0, rot = null, scl = null) { return this.add(mc, latheZ(profile, seg), x, y, z, rot, scl); }
  torus(mc, R, r, x = 0, y = 0, z = 0, rot = null, seg = 16, arc = TAU) { return this.add(mc, new THREE.TorusGeometry(R, r, 6, seg, arc), x, y, z, rot); }
  /** insignia or number decal: square of `size` facing 'up' | 'down' | 'right' (+X) | 'left' | 'fwd' | 'aft', tilt = extra roll about Z for canted fins */
  decal(mat, size, x, y, z, face = 'up', tilt = 0, aspect = 1) {
    const rot = face === 'up' ? [-Math.PI / 2, 0, 0] : face === 'down' ? [Math.PI / 2, 0, 0] : face === 'right' ? [0, Math.PI / 2, 0] : face === 'left' ? [0, -Math.PI / 2, 0] : face === 'aft' ? [0, 0, 0] : [0, Math.PI, 0];
    const g = new THREE.PlaneGeometry(size * aspect, size); if (tilt) { g.rotateY(rot[1]); g.rotateX(rot[0]); g.rotateZ(tilt); return this.add(mat, g, x, y, z); }
    return this.add(mat, g, x, y, z, rot);
  }
  /** ordnance parts [{ geo, mat }] (from ordnance.js) placed on a pylon */
  parts(list, x = 0, y = 0, z = 0, rot = null, scl = null, opt = null) { for (const p of list) this.add(p.mat, p.geo, x, y, z, rot, scl, opt); return this; }
  merged() {
    const out = [];
    for (const [mat, list] of this.buckets) {
      let nv = 0, ni = 0; for (const p of list) { nv += p.pos.length / 3; ni += p.idx.length; }
      if (!ni) continue;
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = mat.vertexColors ? new Float32Array(nv * 3) : null, idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let v = 0, i = 0;
      for (const p of list) { pos.set(p.pos, v * 3); nor.set(p.nor, v * 3); uv.set(p.uv, v * 2); if (col) col.set(p.col, v * 3); for (let k = 0; k < p.idx.length; k++) idx[i + k] = p.idx[k] + v; v += p.pos.length / 3; i += p.idx.length; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      out.push({ geo: g, mat });
    }
    this.buckets.clear();
    return out;
  }
  /** finish: one mesh per material, added to parent. Returns the meshes. */
  build(parent, { cast = true, receive = true } = {}) {
    return this.merged().map(({ geo, mat }) => {
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = cast && !mat.transparent; mesh.receiveShadow = receive && !mat.transparent;
      if (mat.transparent) mesh.renderOrder = 2;
      parent.add(mesh); return mesh;
    });
  }
}

/* -------------------------------------------------------------------------------------------------- moving parts, crew */

/** A hinged group: `inner` turns about the hinge line (its own X or Y axis, whichever `about` says) through `origin` along
 *  `axis`. Build its parts in aircraft coordinates with new Kit({ base: h.inv }) and build into h.inner. */
export function hinge(parent, origin, axis, about = 'x') {
  const outer = new THREE.Group(), inner = new THREE.Group(); outer.position.set(origin[0], origin[1], origin[2]);
  outer.quaternion.setFromUnitVectors(about === 'x' ? XA : YA, new V3(axis[0], axis[1], axis[2]).normalize());
  outer.add(inner); parent.add(outer); outer.updateMatrix();
  return { outer, inner, inv: outer.matrix.clone().invert() };
}
/** Group at a point with the inverse matrix to bake aircraft-coordinate parts into it (swing wings, gear legs). */
export function pivot(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); g.updateMatrix();
  return { g, inv: g.matrix.clone().invert() };
}

/** Afterburner plume: open cone trailing +Z from the nozzle. Hidden until the sim shows it. */
export function burnerCone(pos, r, len = 5) {
  const geo = new THREE.CylinderGeometry(r, r * 0.12, len, 14, 1, true); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, MAT.afterburner); m.position.copy(pos); m.visible = false; m.renderOrder = 3;
  return m;
}

/** The rounded lip of an intake: a station just ahead of st0 and a little smaller. Put it first in the nacelle's loft. */
export const lipSt = (st0, t = 0.045, ahead = 0.05) => ({ ...st0, z: st0.z - ahead, w: st0.w - t, ht: st0.ht - t, hb: st0.hb - t });
/** The dark duct seen through an intake: walls from the lip station back `depth`, closed by a dark plate with a compressor face. */
export function intakeMouth(k, lip, depth = 1.0, shrink = 0.8, fan = true) {
  const a = { ...lip, c: true }, b = { ...lip, z: lip.z + depth, w: lip.w * shrink, ht: lip.ht * shrink, hb: lip.hb * shrink, sk: 0, sx: 0, c: true };
  k.add(C.black, loft([a, b], { inside: true, seg: 14, step: 99 }));
  k.add(C.black, loft([{ ...b, z: b.z - 0.02 }, b], { seg: 14, step: 99, capA: true }));
  if (fan) { const r = Math.min(b.w, b.ht, b.hb) * 0.9; k.cyl(C.iron, r, r, 0.02, b.x, b.y, b.z - 0.04, 'z', 14); k.lathe(C.steel, [[-0.3, 0.004], [-0.12, r * 0.22], [0, r * 0.3]], 8, b.x, b.y, b.z - 0.05); }
}
/** Round engine nozzle trailing +Z from (x, y, z): petals outside, burnt duct and flame holder inside. */
export function nozzle(k, x, y, z, r, len, fine = true) {
  const seg = fine ? 20 : 12;
  k.lathe(C.titan, [[-0.25, r * 1.1], [0, r * 1.1]], seg, x, y, z);
  k.lathe(C.burnt, [[0, r * 1.07], [len * 0.15, r * 1.08], [len * 0.6, r * 0.98], [len, r * 0.8]], seg, x, y, z);
  k.lathe(C.hot, [[len, r * 0.77], [len * 0.5, r * 0.92], [0.05, r * 0.7]], seg, x, y, z);
  k.cyl(C.black, r * 0.7, r * 0.7, 0.02, x, y, z + 0.06, 'z', seg); k.lathe(C.hot, [[0.05, r * 0.3], [0.5, r * 0.06]], 8, x, y, z);
  if (fine) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.add(C.hot, new THREE.BoxGeometry(0.02, 0.02, len * 0.85), x + Math.cos(a) * r * 1.0, y + Math.sin(a) * r * 1.0, z + len * 0.56, [Math.sin(a) * -0.15, Math.cos(a) * 0.15, 0]); }
}

/** Ejection seat with a helmeted pilot. (x, y, z) = the pilot's head centre. o: { lean (seat-back rake), seatOnly, arms } */
export function addPilot(k, M, x, y, z, o = {}) {
  const lean = o.lean ?? 0.2, hy = y - 0.7, R = [lean, 0, 0];
  // seat: pan, back, headrest box, rails, pull handles
  k.cbox(C.seat, 0.44, 0.1, 0.44, 0.02, x, hy - 0.02, z + 0.02);
  k.cbox(C.seat, 0.42, 0.78, 0.1, 0.02, x, hy + 0.36, z + 0.27 + lean * 0.36, R);
  k.cbox(C.dark, 0.3, 0.26, 0.16, 0.03, x, hy + 0.84, z + 0.26 + lean * 0.84, R);
  if (k.fine) {
    for (const s of [-1, 1]) k.box(C.iron, 0.03, 1.0, 0.05, x + s * 0.2, hy + 0.42, z + 0.34 + lean * 0.42, R);
    k.torus(C.yellow, 0.05, 0.012, x, hy + 0.04, z - 0.2, [0.3, 0, 0], 8);
    k.torus(C.yellow, 0.045, 0.011, x - 0.07, hy + 1.0, z + 0.2 + lean, [1.2, 0, 0], 8); k.torus(C.yellow, 0.045, 0.011, x + 0.07, hy + 1.0, z + 0.2 + lean, [1.2, 0, 0], 8);
  }
  if (o.seatOnly) return;
  // pilot: torso, shoulders, harness, arms forward to the controls, helmet, visor, mask and hose
  k.sphere(M.suit, 1, x, hy + 0.3, z + 0.1, [0.19, 0.3, 0.15], 10);
  k.sphere(M.suit, 1, x, hy + 0.5, z + 0.1, [0.25, 0.12, 0.14], 10);
  k.box(C.strap, 0.05, 0.4, 0.02, x - 0.09, hy + 0.38, z - 0.045, [0.12, 0, 0.1]); k.box(C.strap, 0.05, 0.4, 0.02, x + 0.09, hy + 0.38, z - 0.045, [0.12, 0, -0.1]);
  for (const s of [-1, 1]) { k.tube(M.suit, [x + s * 0.22, hy + 0.5, z + 0.08], [x + s * 0.24, hy + 0.24, z - 0.12], 0.055, 6); k.tube(M.suit, [x + s * 0.24, hy + 0.24, z - 0.12], [x + s * 0.12, hy + 0.2, z - 0.4], 0.048, 6); k.sphere(C.dark, 0.05, x + s * 0.12, hy + 0.2, z - 0.42, null, 6); }
  k.cyl(M.suit, 0.06, 0.07, 0.1, x, hy + 0.58, z + 0.08, 'y', 8);
  k.sphere(M.helmet, 0.13, x, y, z + 0.02, [1, 1.02, 1.1], 14);
  k.sphere(C.lens, 0.124, x, y + 0.012, z - 0.05, [0.96, 0.6, 1], 12);
  k.cbox(C.dark, 0.09, 0.08, 0.08, 0.02, x, y - 0.07, z - 0.115);
  if (k.fine) { k.pipe(C.dark, [[x, y - 0.1, z - 0.13], [x + 0.05, y - 0.2, z - 0.1], [x + 0.08, y - 0.32, z - 0.02]], 0.018, 5, 6); k.box(C.dark, 0.27, 0.03, 0.05, x, y + 0.01, z + 0.03); }
}

/** Landing-gear leg: Group at the attachment point; oleo strut down `len` to the axle, wheel(s) of radius r below it (the
 *  tyre bottoms out at -(len + r)). o: { twin, fork (single wheel in a fork, nose legs), side (+1/-1: single wheel carried
 *  outboard of the strut), brace (drag strut: +1 aft, -1 forward), light, extra(k) to add doors and the dark bay in leg coordinates } */
export function gearLeg(M, x, y, z, len, r, o = {}) {
  const grp = new THREE.Group(), k = new Kit({ fine: o.fine ?? true }); grp.position.set(x, y, z);
  const sr = Math.max(0.045, r * 0.17), wd = r * 0.62, br = o.brace ?? 1;
  k.cyl(C.gearWhite, sr * 1.15, sr * 1.25, len * 0.5, 0, -len * 0.25, 0, 'y', 10);
  k.cyl(C.gearWhite, sr * 1.45, sr * 1.45, sr * 1.2, 0, -len * 0.5, 0, 'y', 10);
  k.cyl(C.chrome, sr * 0.72, sr * 0.72, len * 0.52, 0, -len * 0.74, 0, 'y', 10);
  k.tube(C.gearWhite, [0, -len * 0.42, 0], [0, 0.02, br * len * 0.55], sr * 0.6, 8);
  if (k.fine) { // torque links, brake line
    k.tube(C.gearWhite, [0, -len * 0.48, -br * sr], [0, -len * 0.72, -br * sr * 4.2], sr * 0.34, 5); k.tube(C.gearWhite, [0, -len * 0.96, -br * sr], [0, -len * 0.72, -br * sr * 4.2], sr * 0.34, 5);
    k.pipe(C.black, [[sr * 1.2, -len * 0.1, 0], [sr * 1.6, -len * 0.5, sr], [sr * 0.9, -len * 0.95, 0]], 0.012, 4, 8);
  }
  const wheels = o.twin ? [-wd * 0.72, wd * 0.72] : o.side ? [o.side * (wd * 0.5 + sr * 0.9)] : [0];
  if (o.fork || (!o.twin && !o.side)) { for (const s of [-1, 1]) k.tube(C.gearWhite, [0, -len * 0.93, 0], [s * (wd * 0.5 + 0.035), -len, 0], sr * 0.5, 6); k.cyl(C.gearWhite, sr * 0.9, sr * 0.9, wd + 0.14, 0, -len * 0.93, 0, 'x', 8); }
  k.cyl(C.iron, sr * 0.55, sr * 0.55, o.twin ? wd * 2.6 : wd * 1.3 + sr * 2, (o.side || 0) * (wd * 0.25 + sr * 0.45), -len, 0, 'x', 8);
  for (const wx of wheels) {
    k.add(C.rubber, tyreGeo(r, wd, k.fine ? 20 : 12), wx, -len, 0);
    k.cyl(C.gearWhite, r * 0.58, r * 0.58, wd * 0.78, wx, -len, 0, 'x', 14);
    k.cyl(C.iron, r * 0.22, r * 0.22, wd * 0.9, wx, -len, 0, 'x', 8);
    if (k.fine) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.cyl(C.dark, r * 0.07, r * 0.07, wd * 0.8, wx, -len + Math.sin(a) * r * 0.4, Math.cos(a) * r * 0.4, 'x', 5); }
  }
  if (o.light) { k.cyl(C.iron, 0.07, 0.06, 0.1, 0, -len * 0.4, -sr * 1.8, 'z', 10); k.cyl(C.lampWhite, 0.058, 0.058, 0.02, 0, -len * 0.4, -sr * 1.8 - 0.055, 'z', 10); }
  if (o.extra) o.extra(k);
  k.build(grp);
  return grp;
}

/** Rotor or propeller. Returns { node, blades, disc, hub }: node spins about its own `axis`; `blades` is hidden and `disc`
 *  (the blur disc) shown at speed, the hub stays. o: { radius, n, chord, axis 'y'|'x'|'z', speed (sign sets which way the
 *  leading edges face), hubR, pitch, tipSweep, taper, kind: 'main' | 'tail' | 'prop', droop } */
export function makeRotor(M, o) {
  const { radius: R, n, chord: c } = o, axis = o.axis || 'y', kind = o.kind || 'main', hubR = o.hubR ?? 0.3, fine = o.fine ?? true;
  const node = new THREE.Group(), rig = new THREE.Group(), blades = new THREE.Group(), hub = new THREE.Group();
  if (axis === 'x') rig.rotation.z = Math.PI / 2; else if (axis === 'z') rig.rotation.x = -Math.PI / 2;
  const dir = (axis === 'y' ? 1 : -1) * Math.sign(o.speed || 1), pitch = o.pitch ?? (kind === 'prop' ? 0.75 : 0.1);
  const root = hubR + (kind === 'prop' ? 0.02 : c * 0.9), tk = kind === 'prop' ? 0.1 : 0.115, sw = o.tipSweep ?? (kind === 'main' ? c * 0.55 : 0), tp = o.taper ?? (kind === 'prop' ? 0.55 : 0.62);
  const secs = kind === 'prop'
    ? [{ x: hubR * 0.6, z: -c * 0.2, c: c * 0.4, t: 0.5 }, { x: R * 0.3, z: -c * 0.42, c: c * 0.9, t: 0.16 }, { x: R * 0.62, z: -c * 0.5, c, t: 0.1 }, { x: R * 0.9, z: -c * 0.42, c: c * 0.85, t: 0.07 }, { x: R, z: -c * 0.2, c: c * tp, t: 0.06 }]
    : [{ x: root, z: -c * 0.25, c, t: tk }, { x: R * 0.93, z: -c * 0.25, c, t: tk * 0.9 }, { x: R, z: -c * 0.25 + sw, c: c * tp, t: tk * 0.75 }];
  const bg = wingGeo(secs, { n: fine ? 5 : 3, tip: 'flat', root: true });
  // tip band and leading-edge strip as vertex colours
  { const p = bg.attributes.position, col = new Float32Array(p.count * 3), tc = o.tipTone || C.yellow, bc = o.bladeTone || M.blade;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), le = kind !== 'prop' && p.getZ(i) < -c * 0.14, v = x > R * (kind === 'prop' ? 0.9 : 0.955) - 1e-3 ? tc : le ? LEAD : bc; col[i * 3] = v.r; col[i * 3 + 1] = v.g; col[i * 3 + 2] = v.b; }
    bg.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const bk = new Kit({ fine }), hk = new Kit({ fine }), droop = o.droop ?? (kind === 'main' ? -0.035 : 0);
  for (let i = 0; i < n; i++) {
    const a = (o.angles ? o.angles[i] : (i / n) * TAU) + (o.phase || 0), g = bg.clone();
    g.rotateX(pitch); if (dir < 0) g.scale(1, 1, -1); g.rotateZ(droop); g.rotateY(a);
    if (dir < 0) { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; } g.computeVertexNormals(); }
    bk.add(WHITE, g);
    const ca = Math.cos(a), sa = Math.sin(a), at = (r, y = 0, off = 0) => [ca * r + sa * off, y, -sa * r + ca * off];
    if (kind === 'main') { // blade grip with bolts, pitch horn and link, lead-lag damper
      hk.add(C.gun, cboxGeo(root - hubR * 0.5 + c * 0.25, 0.1, c * 0.62, 0.02), ...at((root + hubR * 0.5 + c * 0.25) / 2), [0, a, 0]);
      hk.add(C.iron, cboxGeo(0.16, 0.16, c * 0.4, 0.03), ...at(hubR * 0.95), [0, a, 0]);
      if (fine) {
        for (const q of [0.35, 0.75]) hk.cyl(C.steel, 0.022, 0.022, 0.13, ...at(hubR + (root - hubR) * q + c * 0.1), 'y', 6);
        hk.tube(C.steel, at(hubR * 1.25, -0.02, dir * c * 0.42), at(hubR * 0.85, -0.42, dir * c * 0.3), 0.016, 5);
        hk.tube(C.iron, at(hubR * 0.9, 0.02, -dir * c * 0.34), at(root * 0.98, 0.03, -dir * c * 0.4), 0.032, 6);
      }
    } else if (kind === 'tail') {
      hk.add(C.gun, cboxGeo(root - hubR * 0.3, 0.05, c * 0.6, 0.012), ...at((root + hubR * 0.3) / 2 + 0.02), [0, a, 0]);
      if (fine) hk.tube(C.steel, at(hubR * 1.6, 0.0, dir * c * 0.4), at(0.03, 0.2, 0), 0.01, 4);
    }
  }
  if (kind === 'main') {
    hk.cyl(C.gun, hubR * 0.85, hubR * 0.95, 0.2, 0, 0, 0, 'y', 16); hk.sphere(C.gun, hubR * 0.8, 0, 0.1, 0, [1, 0.45, 1], 14);
    hk.cyl(C.steel, hubR * 0.32, hubR * 0.36, o.mast ?? 0.7, 0, -(o.mast ?? 0.7) / 2, 0, 'y', 12);
    hk.cyl(C.iron, hubR * 1.0, hubR * 1.0, 0.045, 0, -0.42, 0, 'y', 16); hk.cyl(C.gun, hubR * 1.08, hubR * 1.08, 0.04, 0, -0.475, 0, 'y', 16);
  } else if (kind === 'tail') {
    hk.cyl(C.gun, hubR, hubR, 0.12, 0, 0, 0, 'y', 10); hk.cyl(C.steel, hubR * 0.4, hubR * 0.4, 0.3, 0, 0.08, 0, 'y', 8); hk.cyl(C.iron, hubR * 0.9, hubR * 0.9, 0.03, 0, 0.21, 0, 'y', 8);
  } else {
    hk.cyl(C.dark, hubR * 0.9, hubR * 0.9, 0.2, 0, -0.05, 0, 'y', 12);
  }
  if (o.cap) o.cap(hk);
  bk.build(blades, { receive: false }); hk.build(hub);
  const dg = new THREE.CircleGeometry(R, 40); dg.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(dg, M.disc(n, o.tip)); disc.visible = false; disc.renderOrder = 4;
  rig.add(hub, blades, disc); node.add(rig);
  return { node, blades, disc, hub };
}

/* ------------------------------------------------------------------------------------------------------------- caching */

const TPL = new Map();
function remap(v, map) {
  if (!v || typeof v !== 'object') return v;
  if (v.isObject3D) return map.get(v) || v;
  if (v.isVector3) return v.clone();
  if (Array.isArray(v)) return v.map((e) => remap(e, map));
  if (v.constructor === Object) { const o = {}; for (const k in v) o[k] = remap(v[k], map); return o; }
  return v;
}
/** Build a model once per key and return a copy that shares its geometry and materials but has its own moving groups
 *  and its own userData.model (every Object3D and Vector3 inside it is remapped to the copy). */
export function cached(key, make) {
  let t = TPL.get(key);
  if (!t) { const g = make(); t = { g, model: g.userData.model }; g.userData = {}; TPL.set(key, t); }
  const copy = t.g.clone(true), map = new Map();
  const walk = (a, b) => { map.set(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); };
  walk(t.g, copy);
  copy.userData.model = remap(t.model, map);
  return copy;
}
/** Triangle and draw-call count of a built model (for reports). */
export function stats(g) { let tris = 0, calls = 0; g.traverse((o) => { if (o.isMesh && o.visible) { calls++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { tris, calls }; }
