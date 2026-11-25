// Steel Tide: shared procedural texture + PBR material library.
// Every texture is painted on a 2D canvas in code (no image files), registered in a list so a
// quality switch can repaint all of them in place (same THREE.Texture and material objects).
import * as THREE from 'three';

export const TEX = {};
export const MAT = {};

const REG = [];            // texture registry: { name, aspect, scale, size, kind, strength, wrap, draw, tex }
const REG_BY_NAME = new Map();
const ALL = [];            // every material made here (for envMapIntensity)
const NUM_CACHE = new Map();
let BASE = 1024;
let ANISO = 4;
let READY = false;

/* ------------------------------------------------------------------ helpers */

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const pow2 = (v) => Math.min(4096, Math.max(32, Math.pow(2, Math.round(Math.log2(v)))));
function shade(hex, d) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + d)) | 0;
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

const TILE_CACHE = new Map();
/** Small square canvas of random greys (the lattice for value noise). */
function noiseTile(cells, seed) {
  const key = cells + ':' + seed;
  let c = TILE_CACHE.get(key);
  if (c) return c;
  c = mk(cells, cells);
  const x = c.getContext('2d');
  const im = x.createImageData(cells, cells);
  const r = mulberry(seed * 7919 + cells);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = (r() * 255) | 0;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  TILE_CACHE.set(key, c);
  return c;
}
/** Fill the canvas with a repeating tile, scaled; smooth = bilinear (value noise), else crisp (grit). */
function fillTiled(ctx, w, h, tile, sx, sy, o = {}) {
  ctx.save();
  ctx.imageSmoothingEnabled = o.smooth !== false;
  ctx.imageSmoothingQuality = 'high';
  const p = ctx.createPattern(tile, 'repeat');
  p.setTransform(new DOMMatrix().scale(sx, sy));
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.op) ctx.globalCompositeOperation = o.op;
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
/** Tiling fractal value noise (greyscale), cheap: low-res lattices upscaled by the canvas. */
function fbm(ctx, w, h, seed, cells = 4, oct = 5) {
  let first = true;
  for (let o = oct - 1; o >= 0; o--) {
    const n = cells << o;
    if (n > h) continue;
    fillTiled(ctx, w, h, noiseTile(n, seed + o * 17), h / n, h / n, { alpha: first ? 1 : 0.5 });
    first = false;
  }
  if (first) { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h); }
}
/** Blend a layer of fractal noise over what is already painted. */
function mottle(ctx, w, h, seed, cells, alpha, op = 'soft-light') {
  const t = mk(w, h);
  fbm(t.getContext('2d'), w, h, seed, cells, 5);
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = alpha;
  ctx.drawImage(t, 0, 0);
  ctx.restore();
}
/** Per-pixel speckle (non-slip grit, fabric weave). */
function grit(ctx, w, h, seed, alpha, op = 'overlay') {
  fillTiled(ctx, w, h, noiseTile(128, seed), 1, 1, { alpha, op, smooth: false });
}
function wrapX(ctx, w, fn) {
  for (const dx of [-w, 0, w]) { ctx.save(); ctx.translate(dx, 0); fn(); ctx.restore(); }
}
function wrapXY(ctx, w, h, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { ctx.save(); ctx.translate(dx, dy); fn(); ctx.restore(); }
}

/** Greyscale height canvas -> tangent-space normal map canvas (Sobel, wraps at the edges). */
export function heightToNormal(src, strength = 2) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const hgt = new Float32Array(w * h);
  for (let i = 0, j = 0; i < hgt.length; i++, j += 4) hgt[i] = d[j] / 255;
  const out = mk(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const o = img.data;
  const s = strength * (h / 512); // keep the apparent slope the same at every resolution
  for (let y = 0; y < h; y++) {
    const y0 = ((y - 1 + h) % h) * w, y1 = y * w, y2 = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const x0 = (x - 1 + w) % w, x2 = (x + 1) % w;
      const dx = hgt[y0 + x2] + 2 * hgt[y1 + x2] + hgt[y2 + x2] - (hgt[y0 + x0] + 2 * hgt[y1 + x0] + hgt[y2 + x0]);
      const dy = hgt[y2 + x0] + 2 * hgt[y2 + x] + hgt[y2 + x2] - (hgt[y0 + x0] + 2 * hgt[y0 + x] + hgt[y0 + x2]);
      const nx = -dx * s, ny = dy * s;
      const l = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (y1 + x) * 4;
      o[k] = nx * l + 127.5;
      o[k + 1] = ny * l + 127.5;
      o[k + 2] = l + 127.5;
      o[k + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/* ----------------------------------------------------------------- registry */

function renderEntry(e) {
  const w = e.size ? e.size : pow2(BASE * e.scale);
  const h = Math.max(16, Math.round(w / e.aspect));
  const c = mk(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: e.kind === 'normal' });
  e.draw(ctx, w, h);
  return e.kind === 'normal' ? heightToNormal(c, e.strength) : c;
}
/**
 * Register a canvas-painted texture. opts: { aspect = 1 (w/h), scale = 1 (of the base size), size (fixed px
 * width, ignores quality), kind: 'color' | 'normal' | 'rough', strength (normal maps: draw() paints HEIGHT),
 * wrap = true, draw(ctx, w, h) }. Returns the THREE.CanvasTexture; it is repainted on quality changes.
 */
export function registerTexture(name, opts) {
  const had = REG_BY_NAME.get(name);
  if (had) return had.tex;
  const e = {
    name, aspect: opts.aspect || 1, scale: opts.scale || 1, size: opts.size || 0, kind: opts.kind || 'color',
    strength: opts.strength ?? 2, wrap: opts.wrap !== false, draw: opts.draw, tex: null,
  };
  const t = new THREE.CanvasTexture(renderEntry(e));
  t.name = name;
  t.wrapS = t.wrapT = e.wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.colorSpace = e.kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  e.tex = t;
  REG.push(e);
  REG_BY_NAME.set(name, e);
  return t;
}

/** Repaint every registered texture at a new base size, in place (no reload, same objects). */
export function setTextureQuality(texSize, anisotropy = ANISO) {
  const sizeChanged = texSize !== BASE;
  BASE = texSize;
  ANISO = anisotropy;
  for (const e of REG) {
    if (sizeChanged && !e.size) {
      e.tex.dispose();
      e.tex.image = renderEntry(e);
    }
    e.tex.anisotropy = ANISO;
    e.tex.needsUpdate = true;
  }
}

export function setEnvIntensity(v) {
  for (const m of ALL) if ('envMapIntensity' in m) m.envMapIntensity = v;
}

function std(o) {
  const m = new THREE.MeshStandardMaterial(o);
  ALL.push(m);
  return m;
}

/* ------------------------------------------------------------------ palette */

const PAL = {
  aethia: {
    hull: '#98a3ad', hull2: '#8c97a2', antifoul: '#6a2f2a', boot: '#17191b', sup: '#a7b1ba', supDark: '#69737c',
    deck: '#52585e', air: ['#9aa6b2', '#7f8c99', '#b6c0ca'], sub: '#151a20',
    uni: ['#6c7a88', '#55626f', '#8793a0', '#3f4a55'],
  },
  extro: {
    hull: '#34393c', hull2: '#1f4a44', antifoul: '#121314', boot: '#7c2b1d', sup: '#2c4541', supDark: '#202527',
    deck: '#2b302f', air: ['#33383b', '#1f4a44', '#4b5255'], sub: '#121a17',
    uni: ['#2f3a33', '#232a27', '#3d4a3f', '#191d1b'],
  },
};
const NATIONS = ['aethia', 'extro'];

/* ------------------------------------------------------------ hull plating */

const HULL_WL = 0.65; // canvas y (0 = deck edge, 1 = keel) of the waterline: the bottom 35% is anti-fouling
function hullStreaks() {
  const r = mulberry(11), out = [];
  for (let i = 0; i < 16; i++) {
    const fromDeck = r() < 0.6;
    out.push({ x: r(), y0: fromDeck ? 0.03 : (1 + ((r() * 4) | 0)) / 8, len: 0.1 + r() * 0.28, wd: 0.004 + r() * 0.009, a: 0.3 + r() * 0.35 });
  }
  return out;
}
function hullSeams(ctx, w, h, style, lw) {
  ctx.strokeStyle = style;
  ctx.lineWidth = lw;
  ctx.beginPath();
  const rows = 8, cols = 5;
  for (let k = 1; k < rows; k++) { const y = Math.round((k * h) / rows) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
  for (let k = 0; k < rows; k++) {
    const off = (k % 2) * 0.5;
    for (let c = 0; c < cols; c++) { const x = Math.round(((c + off) * w) / cols) + 0.5; ctx.moveTo(x, (k * h) / rows); ctx.lineTo(x, ((k + 1) * h) / rows); }
  }
  ctx.stroke();
}
function hullRivets(ctx, w, h, style) {
  if (w < 512) return;
  ctx.fillStyle = style;
  const s = Math.max(1, w / 700), step = w / 160;
  for (let k = 1; k < 8; k++) {
    const y = (k * h) / 8;
    for (let x = step / 2; x < w; x += step) { ctx.fillRect(x - s / 2, y - s * 2.8, s, s); ctx.fillRect(x - s / 2, y + s * 1.8, s, s); }
  }
}
function drawHull(ctx, w, h, n, mode) {
  const P = PAL[n], wl = h * HULL_WL, lw = Math.max(1, w / 1024), streaks = hullStreaks();
  const streakFill = (rgb, alphaMul) => {
    for (const s of streaks) wrapX(ctx, w, () => {
      const g = ctx.createLinearGradient(0, s.y0 * h, 0, (s.y0 + s.len) * h);
      g.addColorStop(0, `rgba(${rgb},${s.a * alphaMul})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(s.x * w - (s.wd * w) / 2, s.y0 * h, s.wd * w, s.len * h);
    });
  };
  if (mode === 'color') {
    ctx.fillStyle = P.hull;
    ctx.fillRect(0, 0, w, h);
    const r = mulberry(n === 'aethia' ? 31 : 47);
    if (n === 'extro') { // deep sea-green splinter camouflage over charcoal
      ctx.fillStyle = P.hull2;
      for (let i = 0; i < 4; i++) {
        const x = r() * w, bw = w * (0.14 + r() * 0.16), sk = w * (r() - 0.5) * 0.25, t = h * r() * 0.15;
        wrapX(ctx, w, () => { ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x + bw, t); ctx.lineTo(x + bw + sk, wl); ctx.lineTo(x + sk - bw * 0.2, wl); ctx.closePath(); ctx.fill(); });
      }
    } else { // faint repaint patches
      ctx.fillStyle = P.hull2;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * wl * 0.8; wrapX(ctx, w, () => ctx.fillRect(x, y, w * (0.05 + r() * 0.08), h * (0.06 + r() * 0.1))); }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = P.antifoul;
    ctx.fillRect(0, wl, w, h - wl);
    ctx.fillStyle = P.boot;
    ctx.fillRect(0, wl - h * 0.028, w, h * 0.028);
    mottle(ctx, w, h, 3, 4, 0.4);
    // salt and grime around the waterline
    let g = ctx.createLinearGradient(0, wl - h * 0.12, 0, wl + h * 0.07);
    g.addColorStop(0, 'rgba(46,50,40,0)'); g.addColorStop(0.62, 'rgba(46,50,40,0.5)'); g.addColorStop(1, 'rgba(46,50,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, wl - h * 0.12, w, h * 0.19);
    ctx.fillStyle = 'rgba(225,228,220,0.13)';
    for (let i = 0; i < 90; i++) ctx.fillRect(r() * w, wl - h * (0.03 + r() * 0.09), lw * (1 + r() * 2), h * (0.02 + r() * 0.07));
    ctx.fillStyle = 'rgba(70,95,60,0.18)'; // weed below the line
    for (let i = 0; i < 70; i++) ctx.fillRect(r() * w, wl + h * r() * 0.05, lw * (2 + r() * 5), h * (0.02 + r() * 0.08));
    hullSeams(ctx, w, h, 'rgba(0,0,0,0.3)', lw);
    ctx.save(); ctx.translate(lw, lw); hullSeams(ctx, w, h, 'rgba(255,255,255,0.07)', lw); ctx.restore();
    hullRivets(ctx, w, h, 'rgba(0,0,0,0.26)');
    streakFill(n === 'extro' ? '150,82,36' : '120,62,26', 1);
    for (const s of streaks) { ctx.fillStyle = 'rgba(70,34,14,0.6)'; ctx.beginPath(); ctx.arc(s.x * w, s.y0 * h, s.wd * w * 0.9, 0, 7); ctx.fill(); }
    g = ctx.createLinearGradient(0, 0, 0, h * 0.04); // shadow under the deck edge
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h * 0.04);
  } else if (mode === 'height') {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    mottle(ctx, w, h, 5, 8, 0.22, 'source-over');
    hullSeams(ctx, w, h, '#484848', lw * 1.6);
    hullRivets(ctx, w, h, '#c4c4c4');
  } else { // roughness (green channel): paint ~0.5, rust and anti-fouling rough
    ctx.fillStyle = '#7c7c7c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d6d6d6';
    ctx.fillRect(0, wl, w, h - wl);
    const g = ctx.createLinearGradient(0, wl - h * 0.12, 0, wl);
    g.addColorStop(0, 'rgba(210,210,210,0)'); g.addColorStop(1, 'rgba(210,210,210,0.8)');
    ctx.fillStyle = g;
    ctx.fillRect(0, wl - h * 0.12, w, h * 0.12);
    mottle(ctx, w, h, 9, 4, 0.35);
    streakFill('232,232,232', 1.6);
    hullSeams(ctx, w, h, 'rgba(215,215,215,0.6)', lw);
  }
}

/* ---------------------------------------------- superstructure, decks, subs */

function superSeams(ctx, w, h, style, lw) {
  ctx.strokeStyle = style;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { const x = Math.round((k * w) / 4) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let k = 0; k < 3; k++) { const y = Math.round((k * h) / 3) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}
function drawSuper(ctx, w, h, color, mode, seed) {
  const lw = Math.max(1, w / 512);
  if (mode === 'color') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    mottle(ctx, w, h, seed, 4, 0.28);
    const r = mulberry(seed);
    for (let i = 0; i < 26; i++) { // rain streaks from the seams
      const x = r() * w, y0 = ((r() * 3) | 0) * (h / 3), len = h * (0.08 + r() * 0.2);
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      const dark = r() < 0.7;
      g.addColorStop(0, dark ? 'rgba(20,22,24,0.2)' : 'rgba(125,70,30,0.25)'); g.addColorStop(1, 'rgba(20,22,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y0, lw * (1 + r() * 3), len);
    }
    superSeams(ctx, w, h, 'rgba(0,0,0,0.2)', lw);
    ctx.save(); ctx.translate(lw, lw); superSeams(ctx, w, h, 'rgba(255,255,255,0.06)', lw); ctx.restore();
  } else {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    mottle(ctx, w, h, 61, 8, 0.15, 'source-over');
    superSeams(ctx, w, h, '#4c4c4c', lw * 1.5);
  }
}
function drawDeck(ctx, w, h, color, seed, tyres) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  mottle(ctx, w, h, seed, 4, 0.35);
  grit(ctx, w, h, seed + 1, 0.3);
  const r = mulberry(seed + 2);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; // oil and scuff stains
  for (let i = 0; i < 9; i++) { const x = r() * w, y = r() * h, rad = w * (0.02 + r() * 0.05); wrapXY(ctx, w, h, () => { ctx.beginPath(); ctx.ellipse(x, y, rad * 1.6, rad, r() * 3, 0, 7); ctx.fill(); }); }
  if (tyres) {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const y = r() * h, bend = (r() - 0.5) * h * 0.08, x0 = r() * w, len = w * (0.3 + r() * 0.5);
      ctx.lineWidth = h * (0.006 + r() * 0.008);
      wrapXY(ctx, w, h, () => { ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + len / 2, y + bend, x0 + len, y + bend * 0.3); ctx.stroke(); });
    }
  }
}
function drawSub(ctx, w, h, n, mode) {
  const P = PAL[n], N = 8, cw = w / N, ch = h / N, r = mulberry(n === 'aethia' ? 71 : 73), lw = Math.max(1, w / 400);
  if (mode === 'color') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { ctx.fillStyle = shade(P.sub, ((r() - 0.5) * 14) | 0); ctx.fillRect(x * cw, y * ch, cw + 1, ch + 1); }
    mottle(ctx, w, h, 75, 4, 0.35);
    ctx.fillStyle = 'rgba(170,180,175,0.07)';
    for (let i = 0; i < 40; i++) ctx.fillRect(r() * w, r() * h, lw * (1 + r() * 2), h * (0.03 + r() * 0.1));
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  } else {
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, 0, w, h);
    mottle(ctx, w, h, 77, 8, 0.15, 'source-over');
    ctx.strokeStyle = '#3c3c3c';
  }
  ctx.lineWidth = mode === 'color' ? lw : lw * 1.8;
  ctx.beginPath();
  for (let k = 0; k < N; k++) { ctx.moveTo(k * cw + 0.5, 0); ctx.lineTo(k * cw + 0.5, h); ctx.moveTo(0, k * ch + 0.5); ctx.lineTo(w, k * ch + 0.5); }
  ctx.stroke();
}

/* ------------------------------------------------------- aircraft, uniforms */

function drawAircraft(ctx, w, h, n, mode) {
  const P = PAL[n], lw = Math.max(1, w / 700), r = mulberry(n === 'aethia' ? 91 : 97), angular = n === 'extro';
  const lines = (style, width) => {
    const q = mulberry(101);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const x = (i * w) / 8 + 0.5, y = (j * h) / 8 + 0.5;
      if (q() < 0.8) { ctx.moveTo(x, y); ctx.lineTo(x + w / 8, y); }
      if (q() < 0.8) { ctx.moveTo(x, y); ctx.lineTo(x, y + h / 8); }
    }
    ctx.stroke();
  };
  const rivets = (style) => {
    if (w < 512) return;
    ctx.fillStyle = style;
    const s = Math.max(1, w / 600), step = w / 96;
    for (let j = 0; j < 8; j++) for (let x = step / 2; x < w; x += step) { ctx.fillRect(x, (j * h) / 8 + s * 2.5, s, s); ctx.fillRect((j * w) / 8 + s * 2.5, x, s, s); }
  };
  if (mode === 'color') {
    ctx.fillStyle = P.air[0];
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 11; i++) {
      const cx = r() * w, cy = r() * h, rad = w * (0.08 + r() * 0.13), np = angular ? 4 + ((r() * 3) | 0) : 9, pts = [];
      for (let k = 0; k < np; k++) { const a = ((k + r() * 0.6) / np) * Math.PI * 2, rr = rad * (0.55 + r() * 0.7); pts.push([cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr]); }
      ctx.fillStyle = P.air[1 + (i % 2)];
      wrapXY(ctx, w, h, () => {
        ctx.beginPath();
        if (angular) { pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); } else {
          const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          let s = m(pts[np - 1], pts[0]);
          ctx.moveTo(s[0], s[1]);
          for (let k = 0; k < np; k++) { const e = m(pts[k], pts[(k + 1) % np]); ctx.quadraticCurveTo(pts[k][0], pts[k][1], e[0], e[1]); }
        }
        ctx.closePath();
        ctx.fill();
      });
    }
    mottle(ctx, w, h, 93, 4, 0.3);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(15,15,15,0.1)'; ctx.fillRect(r() * w, r() * h, w * (0.02 + r() * 0.06), lw * (1 + r() * 2)); } // exhaust and oil streaks
    lines('rgba(0,0,0,0.3)', lw);
    rivets('rgba(0,0,0,0.2)');
  } else {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    lines('#404040', lw * 1.5);
    rivets('#b8b8b8');
  }
}
function drawUniform(ctx, w, h, n) {
  const u = PAL[n].uni, cells = 32, cw = w / cells, chh = h / cells, r = mulberry(n === 'aethia' ? 111 : 113);
  ctx.fillStyle = u[0];
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 280; i++) {
    ctx.fillStyle = u[1 + ((r() * 3) | 0)];
    let cx = (r() * cells) | 0, cy = (r() * cells) | 0;
    const len = 2 + ((r() * 5) | 0);
    for (let j = 0; j < len; j++) {
      ctx.fillRect((((cx % cells) + cells) % cells) * cw, (((cy % cells) + cells) % cells) * chh, cw + 0.5, chh + 0.5);
      if (r() < 0.5) cx += r() < 0.5 ? 1 : -1; else cy += r() < 0.5 ? 1 : -1;
    }
  }
  grit(ctx, w, h, 115, 0.28);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; // weave
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0.5; y < h; y += Math.max(2, h / 128)) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

/* ---------------------------------------------------------- decals, sprites */

function drawInsignia(ctx, w, h, n) {
  const c = w / 2;
  ctx.clearRect(0, 0, w, h);
  const disc = (rad, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(c, c, rad * w, 0, 7); ctx.fill(); };
  if (n === 'aethia') {
    disc(0.48, '#f2f5f8'); disc(0.455, '#1b4f9c'); disc(0.33, '#f2f5f8'); disc(0.15, '#1b4f9c');
  } else {
    disc(0.48, '#e2622a'); disc(0.445, '#15181a');
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; ctx.lineWidth = w * 0.095;
    const chev = (y, col) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(c - w * 0.25, y + w * 0.13); ctx.lineTo(c, y - w * 0.1); ctx.lineTo(c + w * 0.25, y + w * 0.13); ctx.stroke(); };
    chev(c - w * 0.1, '#c8281e');
    chev(c + w * 0.1, '#f08a1c');
  }
}
function drawHelipad(ctx, w, h) {
  const c = w / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#e2b824'; ctx.lineWidth = w * 0.03;
  ctx.beginPath(); ctx.arc(c, c, w * 0.47, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#ecece6'; ctx.lineWidth = w * 0.035;
  ctx.beginPath(); ctx.arc(c, c, w * 0.37, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ecece6';
  ctx.fillRect(w * 0.345, h * 0.31, w * 0.075, h * 0.38);
  ctx.fillRect(w * 0.58, h * 0.31, w * 0.075, h * 0.38);
  ctx.fillRect(w * 0.345, h * 0.4625, w * 0.31, h * 0.075);
  // worn paint
  ctx.globalCompositeOperation = 'destination-out';
  const r = mulberry(131);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 160; i++) ctx.fillRect(r() * w, r() * h, w * (0.004 + r() * 0.02), w * 0.004);
  ctx.globalCompositeOperation = 'source-over';
}
function drawGlow(ctx, w, h, tight) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(tight ? 0.12 : 0.25, tight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)');
  g.addColorStop(tight ? 0.4 : 0.6, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (tight) { // star streaks
    ctx.globalCompositeOperation = 'lighter';
    for (const horiz of [true, false]) {
      const s = ctx.createLinearGradient(horiz ? 0 : w / 2, horiz ? h / 2 : 0, horiz ? w : w / 2, horiz ? h / 2 : h);
      s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, 'rgba(255,255,255,0.8)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = s;
      if (horiz) ctx.fillRect(0, h / 2 - h * 0.015, w, h * 0.03); else ctx.fillRect(w / 2 - w * 0.015, 0, w * 0.03, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
function drawSmoke(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const r = mulberry(141);
  for (let i = 0; i < 16; i++) {
    const a = r() * 7, d = r() * w * 0.2, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d, rad = w * (0.16 + r() * 0.14);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.34)'); g.addColorStop(0.6, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
function drawConcrete(ctx, w, h) {
  ctx.fillStyle = '#9a9b97';
  ctx.fillRect(0, 0, w, h);
  mottle(ctx, w, h, 161, 4, 0.4);
  grit(ctx, w, h, 163, 0.22);
  const r = mulberry(165), lw = Math.max(1, w / 512);
  ctx.strokeStyle = 'rgba(30,30,28,0.35)'; ctx.lineWidth = lw * 1.5; // expansion joints
  ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(0.5, h); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.moveTo(0, 0.5); ctx.lineTo(w, 0.5); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke();
  ctx.strokeStyle = 'rgba(25,25,24,0.3)'; ctx.lineWidth = lw;
  for (let i = 0; i < 7; i++) { let x = r() * w, y = r() * h; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * w * 0.08; y += (r() - 0.3) * h * 0.06; ctx.lineTo(x, y); } ctx.stroke(); }
}

/* --------------------------------------------------------------------- init */

/** Generate every texture and material once. Calling it again only applies the new quality. */
export function initMaterials(texSize = 1024, anisotropy = 4) {
  if (READY) { setTextureQuality(texSize, anisotropy); return; }
  READY = true;
  BASE = texSize;
  ANISO = anisotropy;
  const T = registerTexture;
  const per = (fn) => ({ aethia: fn('aethia'), extro: fn('extro') });

  // --- textures
  TEX.noise = T('noise', { scale: 0.5, draw: (c, w, h) => fbm(c, w, h, 1, 4, 6) });
  TEX.hull = per((n) => T('hull_' + n, { aspect: 2, draw: (c, w, h) => drawHull(c, w, h, n, 'color') }));
  TEX.hullNormal = T('hullNormal', { aspect: 2, kind: 'normal', strength: 2.2, draw: (c, w, h) => drawHull(c, w, h, 'aethia', 'height') });
  TEX.hullRough = T('hullRough', { aspect: 2, scale: 0.5, kind: 'rough', draw: (c, w, h) => drawHull(c, w, h, 'aethia', 'rough') });
  TEX.superstructure = per((n) => T('super_' + n, { scale: 0.5, draw: (c, w, h) => drawSuper(c, w, h, PAL[n].sup, 'color', n === 'aethia' ? 51 : 53) }));
  TEX.superDark = per((n) => T('superDark_' + n, { scale: 0.25, draw: (c, w, h) => drawSuper(c, w, h, PAL[n].supDark, 'color', n === 'aethia' ? 55 : 57) }));
  TEX.superNormal = T('superNormal', { scale: 0.5, kind: 'normal', strength: 1.8, draw: (c, w, h) => drawSuper(c, w, h, '', 'height', 59) });
  TEX.deck = per((n) => T('deck_' + n, { scale: 0.5, draw: (c, w, h) => drawDeck(c, w, h, PAL[n].deck, n === 'aethia' ? 81 : 85, false) }));
  TEX.flightDeck = T('flightDeck', { draw: (c, w, h) => drawDeck(c, w, h, '#25272a', 89, true) });
  TEX.gritNormal = T('gritNormal', {
    scale: 0.5, kind: 'normal', strength: 1.6,
    draw: (c, w, h) => { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); mottle(c, w, h, 83, 16, 0.3, 'source-over'); fillTiled(c, w, h, noiseTile(128, 87), 1, 1, { alpha: 0.5, smooth: false }); },
  });
  TEX.aircraft = per((n) => T('aircraft_' + n, { draw: (c, w, h) => drawAircraft(c, w, h, n, 'color') }));
  TEX.aircraftNormal = T('aircraftNormal', { scale: 0.5, kind: 'normal', strength: 1.6, draw: (c, w, h) => drawAircraft(c, w, h, 'aethia', 'height') });
  TEX.sub = per((n) => T('sub_' + n, { scale: 0.5, draw: (c, w, h) => drawSub(c, w, h, n, 'color') }));
  TEX.subNormal = T('subNormal', { scale: 0.5, kind: 'normal', strength: 2, draw: (c, w, h) => drawSub(c, w, h, 'aethia', 'height') });
  TEX.uniform = per((n) => T('uniform_' + n, { scale: 0.25, draw: (c, w, h) => drawUniform(c, w, h, n) }));
  TEX.insignia = per((n) => T('insignia_' + n, { scale: 0.25, wrap: false, draw: (c, w, h) => drawInsignia(c, w, h, n) }));
  TEX.helipad = T('helipad', { scale: 0.5, wrap: false, draw: drawHelipad });
  TEX.islandDetail = T('islandDetail', {
    scale: 0.5,
    draw: (c, w, h) => { c.fillStyle = '#d2d2d2'; c.fillRect(0, 0, w, h); mottle(c, w, h, 171, 4, 0.55); grit(c, w, h, 173, 0.25); },
  });
  TEX.islandNormal = T('islandNormal', { scale: 0.5, kind: 'normal', strength: 3, draw: (c, w, h) => { fbm(c, w, h, 175, 4, 6); grit(c, w, h, 177, 0.2, 'source-over'); } });
  TEX.concrete = T('concrete', { scale: 0.5, draw: drawConcrete });
  TEX.smoke = T('smoke', { size: 128, wrap: false, draw: drawSmoke });
  TEX.glow = T('glow', { size: 128, wrap: false, draw: (c, w, h) => drawGlow(c, w, h, false) });
  TEX.spark = T('spark', { size: 64, wrap: false, draw: (c, w, h) => drawGlow(c, w, h, true) });
  // afterburner plume: v = 1 (canvas top) is the hot blue-white nozzle end, fading through orange to black at v = 0
  TEX.afterburner = T('afterburner', {
    size: 32, aspect: 0.25, wrap: false,
    draw: (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#dfeaff'); g.addColorStop(0.18, '#7aa8ff'); g.addColorStop(0.45, '#ff9a3c'); g.addColorStop(0.8, '#7a2a08'); g.addColorStop(1, '#000000');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
  });

  // --- ships
  const v2 = (s) => new THREE.Vector2(s, s);
  MAT.hull = per((n) => std({ map: TEX.hull[n], normalMap: TEX.hullNormal, normalScale: v2(0.8), roughnessMap: TEX.hullRough, roughness: 1, metalness: 0.3 }));
  MAT.superstructure = per((n) => std({ map: TEX.superstructure[n], normalMap: TEX.superNormal, normalScale: v2(0.5), roughness: n === 'aethia' ? 0.5 : 0.58, metalness: 0.3 }));
  MAT.superDark = per((n) => std({ map: TEX.superDark[n], normalMap: TEX.superNormal, normalScale: v2(0.5), roughness: 0.6, metalness: 0.35 }));
  MAT.deck = per((n) => std({ map: TEX.deck[n], normalMap: TEX.gritNormal, normalScale: v2(0.7), roughness: 0.92, metalness: 0.1 }));
  MAT.flightDeck = std({ map: TEX.flightDeck, normalMap: TEX.gritNormal, normalScale: v2(0.6), roughness: 0.9, metalness: 0.1 });
  MAT.glass = std({ color: 0x0a1420, roughness: 0.08, metalness: 0.9 });
  MAT.canopy = new THREE.MeshPhysicalMaterial({ color: 0x2c4050, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.45, depthWrite: false });
  ALL.push(MAT.canopy);
  MAT.gunmetal = std({ color: 0x2b2e31, roughness: 0.4, metalness: 0.85 });
  MAT.steel = std({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.9 });
  MAT.black = std({ color: 0x0d0d0e, roughness: 0.9, metalness: 0 });
  MAT.rust = std({ color: 0x6b3a1e, map: TEX.noise, roughness: 0.95, metalness: 0.1 });
  MAT.soot = std({ color: 0x050505, roughness: 1, metalness: 0, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.white = std({ color: 0xe8eaec, roughness: 0.5, metalness: 0.05 });
  MAT.red = std({ color: 0xb3261e, roughness: 0.55, metalness: 0.1 });
  MAT.yellow = std({ color: 0xe0b21a, roughness: 0.55, metalness: 0.1 });
  MAT.orange = std({ color: 0xe8641a, roughness: 0.6, metalness: 0.05 });
  MAT.brass = std({ color: 0xb08d3c, roughness: 0.3, metalness: 1 });
  MAT.deckLine = std({ color: 0xe6e6de, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  MAT.deckYellow = std({ color: 0xd9ad1c, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  MAT.helipad = std({ map: TEX.helipad, transparent: true, alphaTest: 0.4, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MAT.insignia = per((n) => std({ map: TEX.insignia[n], alphaTest: 0.5, roughness: 0.6, metalness: 0.1, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));

  // --- aircraft and submarines
  MAT.aircraft = per((n) => std({ map: TEX.aircraft[n], normalMap: TEX.aircraftNormal, normalScale: v2(0.5), roughness: n === 'aethia' ? 0.42 : 0.5, metalness: 0.45 }));
  MAT.aircraftDark = per((n) => std({ color: n === 'aethia' ? 0x3d444b : 0x17191a, roughness: 0.5, metalness: 0.4 }));
  MAT.exhaust = std({ color: 0x1c1a19, roughness: 0.35, metalness: 0.9 });
  MAT.afterburner = new THREE.MeshBasicMaterial({ map: TEX.afterburner, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  MAT.sub = per((n) => std({ map: TEX.sub[n], normalMap: TEX.subNormal, normalScale: v2(0.7), roughness: 0.75, metalness: 0.2 }));

  // --- people
  MAT.uniform = per((n) => std({ map: TEX.uniform[n], normalMap: TEX.gritNormal, normalScale: v2(0.4), roughness: 0.95, metalness: 0 }));
  MAT.skin = std({ color: 0xc49a7a, roughness: 0.7, metalness: 0 });
  MAT.helmet = per((n) => std({ color: n === 'aethia' ? 0x647382 : 0x27332e, roughness: 0.7, metalness: 0.1 }));
  MAT.vest = per((n) => std({ color: n === 'aethia' ? 0x46525d : 0x1f2526, map: TEX.noise, roughness: 0.9, metalness: 0 }));
  MAT.boots = std({ color: 0x1b1a18, roughness: 0.8, metalness: 0 });
  MAT.rifle = std({ color: 0x1d1f21, roughness: 0.45, metalness: 0.6 });

  // --- islands
  MAT.island = std({ vertexColors: true, map: TEX.islandDetail, normalMap: TEX.islandNormal, normalScale: v2(0.9), roughness: 0.95, metalness: 0 });
  MAT.rock = std({ color: 0x77726a, map: TEX.islandDetail, normalMap: TEX.islandNormal, normalScale: v2(1.5), roughness: 0.92, metalness: 0 });
  MAT.foliage = std({ color: 0x27421f, map: TEX.noise, roughness: 1, metalness: 0 });
  MAT.concrete = std({ map: TEX.concrete, normalMap: TEX.gritNormal, normalScale: v2(0.5), roughness: 0.9, metalness: 0 });
  MAT.sand = std({ color: 0xd2bf90, map: TEX.islandDetail, normalMap: TEX.gritNormal, normalScale: v2(0.4), roughness: 0.95, metalness: 0 });

  // --- effects (unlit)
  MAT.tracer = new THREE.MeshBasicMaterial({ color: 0xffd070, toneMapped: false });
  MAT.flash = new THREE.MeshBasicMaterial({ map: TEX.glow, color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
}

/** Cached transparent decal material with a painted hull number, for a plane of aspect 2:1. */
export function hullNumberMaterial(text, nation) {
  const key = nation + ':' + text;
  let m = NUM_CACHE.get(key);
  if (m) return m;
  const tex = registerTexture('hullnum_' + key, {
    size: 256, aspect: 2, wrap: false,
    draw: (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = `bold ${Math.round(h * 0.82)}px "Arial Narrow", Arial, Helvetica, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width, sx = Math.min(1, (w * 0.9) / Math.max(1, tw));
      ctx.translate(w / 2, h / 2 + h * 0.04);
      ctx.scale(sx, 1);
      ctx.lineJoin = 'round';
      ctx.lineWidth = h * 0.09;
      ctx.strokeStyle = nation === 'aethia' ? '#1c2228' : '#0c0e0f';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = nation === 'aethia' ? '#eef2f5' : '#9aa0a3';
      ctx.fillText(text, 0, 0);
    },
  });
  m = std({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.7, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  NUM_CACHE.set(key, m);
  return m;
}
