// Paint schemes: repaint any built unit model. A scheme never changes the model, only its materials (each painted
// material gets a variant whose texture is the original with the scheme painted over it, made once and shared), plus a
// few extra parts (flags for Ceremonial White, the jaws for Shark-mouth). Looks only.
import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

const cache = new Map();           // material uuid | scheme -> painted material
let gold = null, flagGeo = null; const flagMats = {};
const NATION_COL = { aethia: ['#2c5fa8', '#f2f4f6'], extro: ['#2e4a3f', '#e0562a'] };

const kindOf = (mat) => { const n = (mat.map && mat.map.name) || mat.name || ''; return /insignia/.test(n) ? 'mark' : /hullnum/.test(n) ? 'number' : /deck|helipad|concrete/i.test(n) ? 'deck' : 'paint'; };
const seedOf = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

function over(ctx, w, h, scheme, kind, seed) {
  const r = mulberry32(seed), tint = (col, a) => { ctx.globalCompositeOperation = 'source-atop'; ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; };
  if (scheme === 'battleworn') {
    if (kind !== 'paint' && kind !== 'deck') { tint('#3a2a20', 0.3); return; }
    tint('#4b3a2c', 0.16);
    for (let i = 0; i < 46; i++) { // rust streaks running down from seams and fittings
      const x = r() * w, y = r() * h * 0.8, len = (0.05 + r() * 0.22) * h, wd = (0.004 + r() * 0.012) * w, g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, `rgba(${110 + r() * 50 | 0},${50 + r() * 30 | 0},22,${0.35 + r() * 0.3})`); g.addColorStop(1, 'rgba(90,45,20,0)'); ctx.fillStyle = g; ctx.fillRect(x, y, wd, len);
    }
    for (let i = 0; i < 9; i++) { // scorch marks
      const x = r() * w, y = r() * h, rad = (0.03 + r() * 0.07) * w, g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(12,10,9,.7)'); g.addColorStop(1, 'rgba(12,10,9,0)'); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 7; i++) { // patched plating: a plate of a slightly different shade, riveted at the corners
      const pw = (0.05 + r() * 0.08) * w, ph = (0.04 + r() * 0.07) * h, x = r() * (w - pw), y = r() * (h - ph);
      ctx.fillStyle = `rgba(${r() < 0.5 ? '150,155,160' : '70,74,78'},.28)`; ctx.fillRect(x, y, pw, ph); ctx.strokeStyle = 'rgba(20,20,20,.5)'; ctx.lineWidth = Math.max(1, w / 700); ctx.strokeRect(x, y, pw, ph);
      ctx.fillStyle = 'rgba(25,25,25,.8)'; for (const [cx, cy] of [[x + 3, y + 3], [x + pw - 3, y + 3], [x + 3, y + ph - 3], [x + pw - 3, y + ph - 3]]) { ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.2, w / 500), 0, 7); ctx.fill(); }
    }
  } else if (scheme === 'ceremonial') {
    if (kind === 'deck') return;
    if (kind === 'number' || kind === 'mark') { tint('#d9b23c', kind === 'number' ? 0.92 : 0.25); return; }
    tint('#f4f5f3', 0.9);
  } else if (scheme === 'stealthblack') {
    if (kind === 'number' || kind === 'mark') { tint('#5d6064', 0.88); return; }
    tint(kind === 'deck' ? '#151617' : '#131416', kind === 'deck' ? 0.6 : 0.92);
  } else if (scheme === 'goldtrim') {
    if (kind === 'number' || kind === 'mark') { tint('#e0b83e', 0.8); return; }
    if (kind === 'deck') return;
    ctx.fillStyle = '#d2a93a'; const b = Math.max(2, h * 0.018); // gold edging along the plating edges
    ctx.fillRect(0, 0, w, b); ctx.fillRect(0, h - b, w, b); ctx.fillRect(0, h * 0.34, w, b * 0.6);
  }
}

function repaint(mat, scheme) {
  if (!mat || !mat.isMeshStandardMaterial || (mat.transparent && mat.opacity < 0.9 && !mat.alphaTest)) return mat; // glass and discs stay as they are
  const key = mat.uuid + '|' + scheme; let m = cache.get(key); if (m) return m;
  const kind = kindOf(mat), img = mat.map && mat.map.image;
  m = mat.clone(); m.name = (mat.name || 'mat') + ':' + scheme;
  if (img && img.width) {
    const c = document.createElement('canvas'), s = Math.min(1, 1024 / img.width); c.width = Math.max(4, Math.round(img.width * s)); c.height = Math.max(4, Math.round(img.height * s));
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height); over(ctx, c.width, c.height, scheme, kind, seedOf((mat.map.name || mat.name || 'x') + scheme));
    const t = new THREE.CanvasTexture(c), o = mat.map; t.name = (o.name || '') + ':' + scheme;
    t.wrapS = o.wrapS; t.wrapT = o.wrapT; t.repeat.copy(o.repeat); t.offset.copy(o.offset); t.rotation = o.rotation; t.colorSpace = o.colorSpace; t.anisotropy = o.anisotropy; t.minFilter = o.minFilter; t.magFilter = o.magFilter; t.generateMipmaps = true; t.needsUpdate = true;
    m.map = t;
  } else if (kind === 'paint' && m.color) { // an untextured painted part
    if (scheme === 'ceremonial') m.color.set(0xf0f1ef); else if (scheme === 'stealthblack') m.color.set(0x16171a); else if (scheme === 'battleworn') m.color.multiplyScalar(0.8);
  }
  if (kind === 'paint') {
    if (scheme === 'ceremonial') { m.roughness = 0.3; m.metalness = Math.min(m.metalness, 0.15); }
    else if (scheme === 'stealthblack') { m.roughness = 0.88; m.metalness = 0.05; if ('envMapIntensity' in m) m.envMapIntensity = 0.35; }
    else if (scheme === 'battleworn') m.roughness = Math.min(1, m.roughness + 0.12);
  }
  cache.set(key, m); return m;
}

function goldMat() { return gold || (gold = new THREE.MeshStandardMaterial({ color: 0xcfa53a, roughness: 0.32, metalness: 0.92, name: 'gold' })); }
function flag(nation) {
  if (!flagGeo) { flagGeo = new THREE.PlaneGeometry(1, 0.62, 6, 1); const p = flagGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 6) * 0.05); flagGeo.translate(0.5, 0, 0); flagGeo.computeVertexNormals(); }
  if (!flagMats[nation]) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 80; const x = c.getContext('2d'), [a, b] = NATION_COL[nation] || NATION_COL.aethia;
    x.fillStyle = a; x.fillRect(0, 0, 128, 80); x.fillStyle = b;
    if (nation === 'extro') { x.beginPath(); x.moveTo(20, 66); x.lineTo(64, 16); x.lineTo(108, 66); x.lineTo(92, 66); x.lineTo(64, 34); x.lineTo(36, 66); x.fill(); } else { x.beginPath(); x.arc(64, 40, 24, 0, 7); x.fill(); x.fillStyle = a; x.beginPath(); x.arc(64, 40, 12, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; flagMats[nation] = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 });
  }
  return new THREE.Mesh(flagGeo, flagMats[nation]);
}
// painted jaws and eyes round the nose (aircraft). Uses model.nose = { pos, radius } when the model gives one.
function sharkMouth(group, model) {
  const L = model.dims.length, nose = model.nose || { pos: new THREE.Vector3(0, 0, -L * 0.5), radius: Math.max(0.5, L * 0.04) };
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  for (const side of [0, 1]) { // the texture wraps round the nose: one jaw on each side, mirrored
    x.save(); x.translate(side ? 512 : 0, 0); x.scale(side ? -1 : 1, 1);
    x.fillStyle = '#b01d1d'; x.beginPath(); x.moveTo(8, 150); x.quadraticCurveTo(120, 96, 244, 132); x.quadraticCurveTo(140, 236, 8, 150); x.fill(); // open mouth
    x.fillStyle = '#f4f4ee'; for (let i = 0; i < 9; i++) { const t0 = 24 + i * 24; x.beginPath(); x.moveTo(t0, 128 - i * 0.2); x.lineTo(t0 + 11, 158); x.lineTo(t0 + 22, 127); x.fill(); x.beginPath(); x.moveTo(t0 + 4, 204 - i * 5.6); x.lineTo(t0 + 14, 176 - i * 3); x.lineTo(t0 + 24, 200 - i * 6); x.fill(); } // teeth
    x.strokeStyle = '#111'; x.lineWidth = 5; x.beginPath(); x.moveTo(8, 150); x.quadraticCurveTo(120, 96, 244, 132); x.quadraticCurveTo(140, 236, 8, 150); x.stroke();
    x.fillStyle = '#f4f4ee'; x.beginPath(); x.ellipse(170, 62, 26, 15, -0.25, 0, 7); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(176, 62, 9, 0, 7); x.fill(); x.lineWidth = 4; x.beginPath(); x.ellipse(170, 62, 26, 15, -0.25, 0, 7); x.stroke(); // eye
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  const len = Math.max(2.2, nose.radius * 3.4), geo = new THREE.CylinderGeometry(nose.radius * 0.5, nose.radius * 1.06, len, 28, 1, true, Math.PI * 0.5, Math.PI * 2); // narrow end toward the tip
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.copy(nose.pos); m.position.z += len * 0.5 + nose.radius * 0.55; m.name = 'paint-extra'; group.add(m);
}

export const SCHEME_KEYS = ['battleworn', 'sharkmouth', 'ceremonial', 'stealthblack', 'goldtrim'];

// Repaint a built unit model in place. scheme '' (or unknown) leaves it alone. Safe to call once per model.
export function applyPaint(group, nation, scheme) {
  if (!scheme || !SCHEME_KEYS.includes(scheme) || group.userData.paint === scheme) return group;
  const model = group.userData.model || {}; group.userData.paint = scheme;
  if (scheme === 'sharkmouth') { if (model.dims && !('beam' in model.dims && !model.gearHeight)) sharkMouth(group, model); return group; }
  const turretNodes = new Set((model.turrets || []).map((t) => t.node));
  group.traverse((o) => {
    if (!o.isMesh || o.name === 'paint-extra') return;
    if (scheme === 'goldtrim') { for (let p = o; p && p !== group; p = p.parent) if (turretNodes.has(p)) { if (o.material && o.material.isMeshStandardMaterial && !o.material.transparent) o.material = goldMat(); return; } }
    o.material = Array.isArray(o.material) ? o.material.map((m) => repaint(m, scheme)) : repaint(o.material, scheme);
  });
  if (scheme === 'ceremonial') { // flags flying from the highest point
    group.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), top = new THREE.Vector3(0, -1e9, 0), v = new THREE.Vector3(); let lo = 1e9;
    group.traverse((o) => { if (!o.isMesh || o.name === 'paint-extra' || !o.geometry.attributes.position) return; const p = o.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), step = Math.max(1, Math.floor(p.count / 4000)); for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m); if (v.y > top.y) top.copy(v); if (v.y < lo) lo = v.y; } });
    const sz = Math.max(1.2, (top.y - lo) * 0.09), f = flag(nation); f.scale.setScalar(sz); f.position.set(top.x, top.y - sz * 0.35, top.z); f.rotation.y = -Math.PI / 2; f.name = 'paint-extra'; group.add(f);
  }
  return group;
}
