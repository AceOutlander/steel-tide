// Ordnance models (v2): missiles, rocket, bomb, torpedo and shell, shaped like the real things. Each build function returns
// [{ geo, mat }] parts (the form js/sim/weapons.js uses for missileGeo / bombGeo / torpGeo), nose toward -Z, body along Z,
// origin at mid-length, modelled at FULL SIZE in metres (use scale 1). At most two parts (painted + bare metal), so a
// round in flight costs two draw calls; the shell is a single part and can be instanced. The same parts hang on the
// aircraft pylons (Kit.parts). Sizes: AAM 3.6 m, SAM 5.4 m, AGM 1.9 m, rocket 1.45 m, bomb 3.3 m, torpedo 5.8 m, shell 0.9 m.
import { Kit, C, tone, trim, metal, wingGeo } from './airkit.js';

const cache = {};
const once = (key, fn) => cache[key] || (cache[key] = fn());
const T = { olive: tone(trim, 0x596046), green: tone(trim, 0x2f3d36), light: tone(trim, 0xd4d8da), mid: tone(trim, 0x8b9399), band: tone(trim, 0xe0ad18), brown: tone(trim, 0x7a4e28), copper: tone(metal, 0xb06a3c) };
// n fins around the body: each a thin aerofoil panel from the skin (r) outward; phase 0 = "+" layout, PI / 4 = "x"
function fins(k, mc, n, r, z, chord, span, tipChord, sweep, phase = Math.PI / 4, thick = 0.05) {
  const g = wingGeo([{ x: r * 0.8, z, c: chord, t: thick }, { x: r + span, z: z + sweep, c: tipChord, t: thick * 0.8 }], { n: 2, tip: 'flat' });
  for (let i = 0; i < n; i++) k.add(mc, g, 0, 0, 0, [0, 0, phase + (i / n) * Math.PI * 2]);
}

/** Air-to-air missile: glass seeker dome, slim body, four steering canards, four clipped-delta tail fins, rocket nozzle. */
export function buildAAM() {
  return once('aam', () => {
    const k = new Kit(), r = 0.085;
    k.lathe(C.lens, [[-1.8, 0.004], [-1.775, 0.03], [-1.72, 0.052], [-1.655, 0.064]], 12);
    k.lathe(C.gun, [[-1.66, 0.066], [-1.63, 0.068]], 12);
    k.lathe(T.light, [[-1.635, 0.066], [-1.5, 0.08], [-1.36, r], [1.66, r], [1.7, 0.074]], 12);
    k.cyl(T.band, r + 0.002, r + 0.002, 0.07, 0, 0, -1.02, 'z', 12, true); k.cyl(T.brown, r + 0.002, r + 0.002, 0.07, 0, 0, 0.1, 'z', 12, true);
    k.cyl(C.dark, r + 0.003, r + 0.003, 0.16, 0, 0, 0.9, 'z', 12, true);
    fins(k, T.mid, 4, r, -1.3, 0.3, 0.17, 0.09, 0.19);
    fins(k, T.mid, 4, r, 1.02, 0.66, 0.25, 0.24, 0.4);
    k.lathe(C.hot, [[1.7, 0.074], [1.76, 0.06]], 12); k.cyl(C.black, 0.058, 0.04, 0.05, 0, 0, 1.72, 'z', 10);
    for (const z of [-0.55, 0.45]) k.box(C.gun, 0.03, 0.03, 0.12, 0, r + 0.01, z);
    return k.merged();
  });
}
/** Surface-to-air missile: long, sharp radome, strakes along the body, four tail control fins, booster nozzle. */
export function buildSAM() {
  return once('sam', () => {
    const k = new Kit(), r = 0.16;
    k.lathe(C.radome, [[-2.7, 0.004], [-2.6, 0.03], [-2.4, 0.07], [-2.15, 0.105]], 14);
    k.lathe(T.light, [[-2.15, 0.105], [-1.85, 0.135], [-1.5, r], [2.56, r], [2.64, 0.14]], 14);
    k.cyl(C.red, r + 0.003, r + 0.003, 0.08, 0, 0, -1.3, 'z', 14, true); k.cyl(C.dark, r + 0.003, r + 0.003, 0.3, 0, 0, 1.1, 'z', 14, true);
    k.cyl(C.dark, r + 0.003, r + 0.003, 0.05, 0, 0, -0.2, 'z', 14, true);
    fins(k, T.light, 4, r, -0.6, 2.3, 0.1, 1.9, 0.4, Math.PI / 4, 0.02);
    fins(k, T.mid, 4, r, 1.9, 0.7, 0.42, 0.28, 0.42);
    k.lathe(C.hot, [[2.64, 0.14], [2.7, 0.12], [2.78, 0.135]], 14); k.cyl(C.black, 0.12, 0.08, 0.08, 0, 0, 2.7, 'z', 12);
    return k.merged();
  });
}
/** Guided attack missile: blunt glass seeker, short thick body, small nose canards, four wings at the tail. */
export function buildAGM() {
  return once('agm', () => {
    const k = new Kit(), r = 0.09;
    k.sphere(C.lens, r * 0.92, 0, 0, -0.83, [1, 1, 0.8], 12);
    k.cyl(C.gun, r + 0.004, r + 0.004, 0.05, 0, 0, -0.82, 'z', 12, true);
    k.lathe(T.olive, [[-0.84, r * 0.98], [-0.8, r], [0.86, r], [0.92, 0.075]], 12);
    k.cyl(T.band, r + 0.002, r + 0.002, 0.045, 0, 0, -0.55, 'z', 12, true); k.cyl(C.black, r + 0.002, r + 0.002, 0.03, 0, 0, 0.2, 'z', 12, true);
    fins(k, C.dark, 4, r, -0.62, 0.14, 0.07, 0.08, 0.06);
    fins(k, T.olive, 4, r, 0.42, 0.44, 0.15, 0.36, 0.08, Math.PI / 4, 0.035);
    k.lathe(C.hot, [[0.92, 0.075], [0.95, 0.062]], 12); k.cyl(C.black, 0.06, 0.04, 0.04, 0, 0, 0.93, 'z', 10);
    return k.merged();
  });
}
/** Unguided rocket: warhead, motor tube, fold-out fins round the nozzle. */
export function buildRocket() {
  return once('rocket', () => {
    const k = new Kit(), r = 0.036;
    k.lathe(T.olive, [[-0.725, 0.003], [-0.69, 0.016], [-0.6, 0.03], [-0.5, r], [-0.28, r]], 10);
    k.cyl(C.gun, 0.012, 0.016, 0.03, 0, 0, -0.725, 'z', 6); k.cyl(T.band, r + 0.001, r + 0.001, 0.03, 0, 0, -0.42, 'z', 10, true);
    k.lathe(T.light, [[-0.28, r], [0.68, r], [0.7, 0.03]], 10);
    fins(k, C.gun, 4, r * 0.9, 0.52, 0.2, 0.085, 0.16, 0.1, 0, 0.03);
    k.lathe(C.hot, [[0.7, 0.03], [0.725, 0.026]], 10); k.cyl(C.black, 0.024, 0.016, 0.02, 0, 0, 0.715, 'z', 8);
    return k.merged();
  });
}
/** 900 kg general-purpose bomb: ogive body, nose fuze, tail cone with four fins, suspension lugs, nose band. */
export function buildBomb() {
  return once('bomb', () => {
    const k = new Kit(), r = 0.24;
    k.lathe(T.olive, [[-1.6, 0.035], [-1.52, 0.09], [-1.36, 0.155], [-1.1, 0.205], [-0.7, r - 0.006], [-0.3, r], [0.35, r], [0.8, 0.205], [1.2, 0.14], [1.56, 0.1], [1.62, 0.085]], 16);
    k.lathe(C.steel, [[-1.67, 0.012], [-1.65, 0.03], [-1.6, 0.036]], 10); k.cyl(C.gun, 0.014, 0.014, 0.05, 0, 0, -1.68, 'z', 6);
    k.cyl(T.band, 0.186, 0.168, 0.07, 0, 0, -1.24, 'z', 16, true);
    k.cyl(C.dark, 0.086, 0.086, 0.02, 0, 0, 1.625, 'z', 12);
    fins(k, T.olive, 4, 0.12, 0.92, 0.72, 0.22, 0.42, 0.3, Math.PI / 4, 0.03);
    for (const z of [-0.3, 0.25]) { k.box(C.gun, 0.05, 0.03, 0.09, 0, r + 0.01, z); k.torus(C.gun, 0.03, 0.009, 0, r + 0.035, z, [0, Math.PI / 2, 0], 8); }
    return k.merged();
  });
}
/** Heavy torpedo: blunt sonar nose, long body, tapered tail with cruciform fins and a shrouded propulsor. */
export function buildTorpedo() {
  return once('torp', () => {
    const k = new Kit(), r = 0.2665;
    k.lathe(C.black, [[-2.9, 0.03], [-2.88, 0.1], [-2.8, 0.19], [-2.66, 0.245], [-2.45, r]], 16);
    k.lathe(T.green, [[-2.45, r], [1.55, r], [2.0, 0.21], [2.45, 0.12], [2.7, 0.07]], 16);
    k.cyl(C.orange, r + 0.003, r + 0.003, 0.22, 0, 0, -2.2, 'z', 16, true); k.cyl(C.brass, r + 0.003, r + 0.003, 0.04, 0, 0, -0.6, 'z', 16, true); k.cyl(C.dark, r + 0.003, r + 0.003, 0.5, 0, 0, 1.25, 'z', 16, true);
    fins(k, T.green, 4, 0.13, 2.05, 0.5, 0.15, 0.3, 0.14, 0, 0.05);
    k.lathe(C.gun, [[2.47, 0.235], [2.5, 0.25], [2.77, 0.225]], 16); k.lathe(C.iron, [[2.77, 0.205], [2.47, 0.225]], 16);   // propulsor shroud, outside and inside
    k.lathe(C.brass, [[2.6, 0.075], [2.8, 0.06], [2.9, 0.012]], 10);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; k.box(C.brass, 0.14, 0.012, 0.09, Math.cos(a) * 0.135, Math.sin(a) * 0.135, 2.66, [0.5, 0, a]); }
    return k.merged();
  });
}
/** Gun shell: fuzed ogive nose, body, copper driving band, boat-tail base. One part (bare metal). */
export function buildShell() {
  return once('shell', () => {
    const k = new Kit(), r = 0.1;
    k.lathe(C.brass, [[-0.45, 0.003], [-0.43, 0.016], [-0.385, 0.032]], 12);
    k.lathe(C.iron, [[-0.385, 0.032], [-0.3, 0.058], [-0.18, 0.083], [-0.05, 0.097], [0.05, r], [0.3, r]], 12);
    k.lathe(T.copper, [[0.3, r + 0.004], [0.36, r + 0.004]], 12);
    k.lathe(C.iron, [[0.36, r], [0.4, r], [0.45, 0.086]], 12); k.cyl(C.gun, 0.086, 0.086, 0.004, 0, 0, 0.45, 'z', 12);
    return k.merged();
  });
}
