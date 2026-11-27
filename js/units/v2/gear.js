// Cosmetic items modelled in Blender (tools/cosmetics/*.py) and shipped as assets/cosmetics/<file>.glb: Draco geometry,
// WebP textures, meshes <file>_lod0 / _lod1 / _lod2, each with material 0 (the item, baked base colour / normal /
// AO + roughness + metalness) and an optional material 1 (glass). Vertices are in the game's model space and bind pose,
// skinned to the game's skeleton by bone name.
//
//   loadGear()        starts loading every item in the background (call once at start-up; never throws)
//   gear.get(key)     -> the loaded item for a helmet key, or null while it is loading, missing or failed (synchronous)
//   gear.onLoad(fn)   fn(key) after an item has loaded (human.js rebuilds the figures already on screen)
//   gear.material(key, part)  the shared material for 'shell' or 'glass'
// An item: { key, kind, lods: [{ shell, glass }] } where a part is { n, pos, nrm, uv, si (2 bones a vertex), sw (weight of
// the second), col (linear RGB from the base colour texture, for baked crowds), idx }.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// helmet key -> file. Items whose file is missing simply stay on the code-built look.
export const GEAR_ITEMS = {
  diver: { file: 'diver_helmet', kind: 'helmet', glass: { color: 0x14201f, opacity: 0.46 }, coat: 0.6 },
};
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmR', 'larmR', 'handR', 'finR', 'fin2R', 'thumbR', 'uarmL', 'larmL', 'handL', 'finL', 'fin2L', 'thumbL', 'ulegR', 'llegR', 'footR', 'ulegL', 'llegL', 'footL'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const ROOT = new URL('../../../', import.meta.url).href;

const items = new Map(), mats = new Map(), listeners = new Set();
let loader = null, started = false;

export const gear = {
  get(key) { return items.get(key) || null; },
  has(key) { return items.has(key); },
  onLoad(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  material(key, part) { return mats.get(key + ':' + part) || null; },
  load(key) { return items.has(key) || !GEAR_ITEMS[key] ? Promise.resolve(items.get(key) || null) : loadItem(key); }, // (again, after a failure)
};

function getLoader() {
  if (loader) return loader;
  const draco = new DRACOLoader(); draco.setDecoderPath(ROOT + 'vendor/three/addons/libs/draco/gltf/'); draco.setDecoderConfig({ type: 'wasm' });
  loader = new GLTFLoader(); loader.setDRACOLoader(draco); return loader;
}

export function loadGear() {
  if (started) return; started = true;
  for (const key in GEAR_ITEMS) loadItem(key);
}

async function loadItem(key) {
  const def = GEAR_ITEMS[key];
  try {
    const gltf = await getLoader().loadAsync(ROOT + 'assets/cosmetics/' + def.file + '.glb');
    const item = extract(key, def, gltf);
    items.set(key, item);
    for (const fn of listeners) { try { fn(key); } catch (e) { console.error(e); } }
    return item;
  } catch (e) { console.warn('Cosmetic item ' + key + ' did not load; using the built-in look.', e); return null; }
}

function extract(key, def, gltf) {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  const lods = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let shellMat = null, glassMat = null;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let p = o, m = null; while (p && !(m = /_lod(\d)/.exec(p.name || ''))) p = p.parent;
    if (!m) return;
    const lod = +m[1], glass = /glass/i.test(o.material.name || ''), g = o.geometry;
    if (glass) glassMat = glassMat || o.material; else shellMat = shellMat || o.material;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, n = pos.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), si = new Uint8Array(n * 2), sw = new Float32Array(n);
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z;
      if (uv) { U[i * 2] = uv.getX(i); U[i * 2 + 1] = uv.getY(i); }
    }
    // joints: the file's skin lists bones by name; keep the two strongest, as the game's figures do
    const ji = g.attributes.skinIndex, jw = g.attributes.skinWeight, bones = o.isSkinnedMesh ? o.skeleton.bones : [];
    const map = bones.map((b) => BI[b.name] ?? BI.head);
    for (let i = 0; i < n; i++) {
      if (!ji) { si[i * 2] = BI.head; si[i * 2 + 1] = BI.head; sw[i] = 0; continue; }
      let a = -1, b = -1, wa = 0, wb = 0;
      for (let k = 0; k < 4; k++) { const w = jw.getComponent(i, k); if (w > wa) { b = a; wb = wa; a = k; wa = w; } else if (w > wb) { b = k; wb = w; } }
      si[i * 2] = map[ji.getComponent(i, a)] ?? BI.head; si[i * 2 + 1] = b >= 0 ? map[ji.getComponent(i, b)] ?? BI.head : si[i * 2]; sw[i] = wb / Math.max(1e-6, wa + wb);
    }
    const idx = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    const L = lods[lod] || (lods[lod] = {});
    L[glass ? 'glass' : 'shell'] = { n, pos: P, nrm: N, uv: U, si, sw, idx, col: null };
  });
  for (let i = 0; i < lods.length; i++) if (!lods[i]) lods[i] = lods[i - 1];
  makeMaterials(key, def, shellMat, glassMat);
  // vertex colours for baked crowd figures: the base colour (times the baked occlusion) under each vertex
  const sample = sampler(shellMat && shellMat.map), occl = sampler(shellMat && shellMat.aoMap, true);
  for (const L of lods) {
    const S = L.shell; if (!S || S.col) continue; S.col = new Float32Array(S.n * 3);
    for (let i = 0; i < S.n; i++) { const c = sample(S.uv[i * 2], S.uv[i * 2 + 1]), a = occl(S.uv[i * 2], S.uv[i * 2 + 1]); S.col[i * 3] = c[0] * a[0]; S.col[i * 3 + 1] = c[1] * a[0]; S.col[i * 3 + 2] = c[2] * a[0]; }
    if (L.glass) { L.glass.col = new Float32Array(L.glass.n * 3).fill(0.02); }
  }
  // the GPU copies of the file are not used: figures take the arrays above
  scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  return { key, kind: def.kind, lods };
}

// reads a texture's image once into a small canvas; returns (u, v) -> [r, g, b] linear (or raw for data maps)
function sampler(tex, raw = false) {
  const img = tex && tex.image;
  if (!img) return () => [raw ? 1 : 0.5, 0.5, 0.5];
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data;
  const lin = (b) => (raw ? b / 255 : Math.pow(b / 255, 2.2));
  return (u, v) => { const px = Math.min(W - 1, Math.max(0, Math.floor((u - Math.floor(u)) * W))), py = Math.min(H - 1, Math.max(0, Math.floor((v - Math.floor(v)) * H))), o = (py * W + px) * 4; return [lin(d[o]), lin(d[o + 1]), lin(d[o + 2])]; };
}

function makeMaterials(key, def, src, glassSrc) {
  // the item: its baked maps on a physical material. Clear coat follows the base colour's red channel, which is high on
  // the painted shell and low on rubber, so only the gloss paint gets the lacquer layer.
  const m = new THREE.MeshPhysicalMaterial({ name: 'hk_item_' + key, color: 0xffffff, roughness: 1, metalness: 1 });
  if (src) {
    m.map = src.map; m.normalMap = src.normalMap; if (src.normalScale) m.normalScale.copy(src.normalScale);
    const orm = src.roughnessMap || src.metalnessMap || src.aoMap; m.roughnessMap = orm; m.metalnessMap = orm; m.aoMap = src.aoMap || orm; m.aoMapIntensity = 1;
    if (!orm) { m.roughness = src.roughness; m.metalness = src.metalness; }
    if (def.coat) { m.clearcoat = def.coat; m.clearcoatRoughness = 0.1; m.clearcoatMap = src.map; }
  }
  mats.set(key + ':shell', m);
  const G = def.glass || {};
  mats.set(key + ':glass', new THREE.MeshPhysicalMaterial({ name: 'hk_visor_item_' + key, color: G.color ?? 0x1a2629, roughness: 0.03, metalness: 0.0, transparent: true, opacity: G.opacity ?? 0.35, depthWrite: false, envMapIntensity: 2.4, specularIntensity: 1, ior: 1.5 }));
  if (glassSrc && glassSrc.dispose) glassSrc.dispose();
}
