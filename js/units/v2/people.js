// The human base every figure is built on: a MakeHuman body (CC0) fitted to the game's skeleton by tools/people/build.py.
// loadPeople() fetches assets/people/ once at start-up; human.js asks for parts by name and detail level.
//   people.part(name, lod) -> { nv, pos: Float32Array, nrm: Int8Array (x4), uv: Uint16Array + uv0 / uvs, bw: Uint8Array (bone, bone,
//       weight of the second / 255, flag), weld: Uint32Array (same number = same point of the surface), idx }
//   people.skin(i) -> the loaded skin atlas image for tone i (head, hands, eyes), or null
import * as THREE from 'three';

export const people = {
  ready: false, meta: null, images: [],
  part(name, lod) { const p = this.meta && this.meta.parts[name]; if (!p) return null; return p[lod] || p[0]; },
  skin(i) { return this.images[i] || null; },
};

export async function loadPeople(base = 'assets/people/') {
  try {
    const [meta, bin] = await Promise.all([fetch(base + 'people.json').then((r) => { if (!r.ok) throw new Error('people.json ' + r.status); return r.json(); }), fetch(base + 'people.bin').then((r) => { if (!r.ok) throw new Error('people.bin ' + r.status); return r.arrayBuffer(); })]);
    for (const name in meta.parts) for (const lod in meta.parts[name]) {
      const p = meta.parts[name][lod], n = p.nv;
      p.pos = new Float32Array(bin, p.pos, n * 3); p.nrm = new Int8Array(bin, p.nrm, n * 4); p.uv = new Uint16Array(bin, p.uv, n * 2); p.bw = new Uint8Array(bin, p.bw, n * 4);
      p.weld = new Uint32Array(bin, p.weld, n); p.idx = p.i32 ? new Uint32Array(bin, p.idx, p.ni) : new Uint16Array(bin, p.idx, p.ni);
    }
    const imgs = await Promise.all(meta.tones.map((t, i) => fetch(base + 'skin_' + i + '.webp').then((r) => r.blob()).then((b) => createImageBitmap(b)).catch(() => null)));
    if (imgs.some((x) => !x)) throw new Error('skin textures');
    people.meta = meta; people.images = imgs; people.ready = true;
  } catch (e) { console.warn('People assets did not load; using the simple built-in figure.', e); people.ready = false; }
  return people.ready;
}

/* small repeatable noise for cloth folds */
function h3(x, y, z) { let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) & 0xffff) / 65535; }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = h3(xi, yi, zi), b = h3(xi + 1, yi, zi), c = h3(xi, yi + 1, zi), d = h3(xi + 1, yi + 1, zi), e = h3(xi, yi, zi + 1), f = h3(xi + 1, yi, zi + 1), g = h3(xi, yi + 1, zi + 1), k = h3(xi + 1, yi + 1, zi + 1);
  const l = (p, q, t) => p + (q - p) * t;
  return l(l(l(a, b, fx), l(c, d, fx), fy), l(l(e, f, fx), l(g, k, fx), fy), fz);
}
// a fold field: sharp ridges with soft valleys, 0..1
export function ridges(x, y, z) { const n = noise3(x, y, z) * 0.65 + noise3(x * 2.1 + 7, y * 2.1 + 3, z * 2.1) * 0.35; const r = 1 - Math.abs(2 * n - 1); return r * r; }
