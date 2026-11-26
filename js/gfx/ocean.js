// Ocean: the same wave sum runs on the GPU (vertex shader) and on the CPU (waveHeight), so hulls float on the waves you see.
// Nothing here is a tiled texture: ripples, glitter and foam are all computed from world position in the shader, so no
// pattern can repeat, and every layer fades out before it gets smaller than a pixel (no shimmer far away).
import * as THREE from 'three';
import { gfx } from './renderer.js';

const G = 9.81;
const WIND = 0.5; // direction the sea runs toward (rad, from +X toward +Z)
// the swell: direction offset from the wind (rad), wavelength (m), amplitude (m). Longest first.
const SPEC = [[0.10, 173, 0.78], [-0.42, 127, 0.60], [0.55, 89, 0.46], [-0.18, 61, 0.36], [0.80, 41, 0.25], [-0.70, 27, 0.17], [0.30, 17, 0.105], [-1.05, 10.5, 0.062]];
export const WAVES = SPEC.map(([off, len, amp], i) => { const k = (Math.PI * 2) / len, ang = WIND + off; return { dx: Math.cos(ang), dz: Math.sin(ang), k, amp, len, w: Math.sqrt(G * k), ph: i * 2.399 }; });
const NW = WAVES.length;
// how peaked the surface is (sum of k * a * sin): its spread sets where crests are steep enough to break
const crestWeight = (len) => Math.min(1, (len / 45) ** 1.5);
const CREST_SIGMA = Math.sqrt(WAVES.reduce((s, w) => s + (w.k * w.amp * crestWeight(w.len)) ** 2 / 2, 0));
export let seaTime = 0;

export function waveHeight(x, z, t = seaTime) {
  let h = 0;
  for (let i = 0; i < NW; i++) { const w = WAVES[i]; h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph); }
  return h;
}
// slope-based normal (for spray, floating debris)
export function waveNormal(x, z, out, t = seaTime) {
  let sx = 0, sz = 0;
  for (let i = 0; i < NW; i++) { const w = WAVES[i], c = w.amp * w.k * Math.cos(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph); sx += c * w.dx; sz += c * w.dz; }
  return out.set(-sx, 1, -sz).normalize();
}

const MAX_SHIPS = 16, MAX_ISL = 6, MAX_SPLASH = 10;
const f = (v, d = 5) => Number(v).toFixed(d);
const WC = f(Math.cos(WIND)), WS = f(Math.sin(WIND));

// Ripples smaller than the swell: wavelength (m), direction offset from the wind (rad), slope strength.
const DETAIL = [[7.0, 0.9, 0.125], [3.1, -0.6, 0.135], [1.35, 0.35, 0.135], [0.6, -1.2, 0.155], [0.26, 1.7, 0.15]];
const octave = ([L, dir, gain], i) => {
  const a = WIND + dir, c = f(Math.cos(a)), s = f(Math.sin(a)), cell = L / 2;
  return `  { float w = 1.0 - smoothstep(0.18, 0.45, fw / ${f(L, 2)});
    if (w > 0.001) { vec2 q = vec2(${c} * uv.x + ${s} * uv.y, ${c} * uv.y - ${s} * uv.x) * ${f(1 / cell)}; q.y *= 0.55; q.x -= uTime * ${f(Math.sqrt(G * L / 6.2832) * 0.55 / cell, 4)};
      vec2 g = noised(q + ${f(i * 17.3, 1)}).yz * vec2(1.0, 0.55) * (${f(gain, 3)} * gA * w);
      slope += vec2(${c} * g.x - ${s} * g.y, ${s} * g.x + ${c} * g.y); }
    lost += ${f(gain * gain * 0.19, 6)} * gA * gA * (1.0 - w * w); }`;
};
// the ripples a preset leaves out are added to the surface roughness instead, so glitter stays soft and never blotchy
const octaves = (n) => DETAIL.slice(0, n).map(octave).join('\n') + `\n  lost += ${f(DETAIL.slice(n).reduce((s, d) => s + d[2] * d[2] * 0.19, 0), 6)} * gA * gA;`;

const vert = /* glsl */`
#define NW ${NW}
uniform float uTime; uniform vec4 uWave[NW]; uniform vec3 uWaveB[NW]; uniform vec3 uGrid;
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // the grid's cells grow with distance: leave out any wave a cell is too coarse to carry, so the far sea cannot crawl
  float ring = max(abs(position.x), abs(position.z));
  float cell = uGrid.x + max(ring - uGrid.y, 0.0) * uGrid.z, far = smoothstep(0.0, 60.0, ring - uGrid.y);
  float h = 0.0;
  for (int i = 0; i < NW; i++) {
    float fade = 1.0 - smoothstep(0.22, 0.5, cell / uWaveB[i].z) * far;
    h += uWave[i].w * sin(uWave[i].z * (uWave[i].x * wp.x + uWave[i].y * wp.z) - uWaveB[i].x * uTime + uWaveB[i].y) * fade;
  }
  wp.y += h; vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */`
precision highp float;
#define NW ${NW}
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform samplerCube uSky;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFar; uniform vec3 uDeep; uniform vec3 uScatter; uniform vec3 uShallow; uniform vec3 uHorizon; uniform vec3 uZenith;
uniform vec4 uWave[NW]; uniform vec3 uWaveB[NW]; uniform float uCw[NW]; uniform vec4 uBend[NW]; uniform vec2 uCap;
uniform vec4 uShipA[${MAX_SHIPS}]; uniform vec4 uShipB[${MAX_SHIPS}]; uniform int uShipCount; uniform vec4 uHoleA; uniform vec4 uHoleB;
uniform vec4 uIsl[${MAX_ISL}]; uniform int uIslCount; uniform vec4 uSplash[${MAX_SPLASH}]; uniform int uSplashCount; uniform float uUnder; uniform vec4 uFlash[2];
varying vec3 vWorld;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// smooth noise from world position: x = value (0..1), yz = its slope. Smooth to the second derivative, so highlights have no facets.
vec3 noised(vec2 x){
  vec2 i = floor(x), t = fract(x);
  vec2 u = t * t * t * (t * (t * 6.0 - 15.0) + 10.0), du = 30.0 * t * t * (t * (t - 2.0) + 1.0);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
// foam pattern: noise at several sizes, stretched into streaks along the wind, each layer sliding its own way
float foamTex(vec2 uv, float fw){
  vec2 p = vec2(${WC} * uv.x + ${WS} * uv.y, ${WC} * uv.y - ${WS} * uv.x); p.x *= 0.45;
  float n = 0.5 * mix(0.5, noised(p * 0.45 + vec2(uTime * 0.05, 3.1)).x, 1.0 - smoothstep(0.25, 0.6, fw / 4.4));
#if WATER > 0
  n += 0.3 * mix(0.5, noised(vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 1.25 - vec2(uTime * 0.09, uTime * 0.04)).x, 1.0 - smoothstep(0.25, 0.6, fw / 1.6));
  n += 0.2 * mix(0.5, noised(vec2(0.6 * p.x + 0.8 * p.y, 0.6 * p.y - 0.8 * p.x) * 3.3 + vec2(uTime * 0.07, -uTime * 0.11)).x, 1.0 - smoothstep(0.25, 0.6, fw / 0.6));
#else
  n += 0.5 * mix(0.5, noised(vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 1.6 - vec2(uTime * 0.09, uTime * 0.04)).x, 1.0 - smoothstep(0.25, 0.6, fw / 1.25));
#endif
  return clamp((n - 0.5) * 1.7 + 0.5, 0.0, 1.0);
}
void main(){
  // no sea inside a ship that has rooms under the waterline: a rectangle in the ship's own frame is left out
  if (uHoleA.z != 0.0 || uHoleA.w != 0.0) { vec2 hr = vWorld.xz - uHoleA.xy; float hz = -dot(hr, uHoleA.zw), hx = dot(hr, vec2(-uHoleA.w, uHoleA.z)); if (hx > uHoleB.x && hx < uHoleB.y && hz > uHoleB.z && hz < uHoleB.w) discard; }
  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  vec2 uv = vWorld.xz;
  // how much sea one pixel covers here (m): anything finer than that is averaged out instead of being drawn
  vec2 ddx = dFdx(uv), ddy = dFdy(uv); float la = length(ddx), lb = length(ddy);
  float fw = 1.3 * pow(max(la, lb), 0.6) * pow(max(min(la, lb), 0.0001), 0.4);
  float fwW = pow(max(la, lb), 0.8) * pow(max(min(la, lb), 0.0001), 0.2);   // for the regular swell: stricter, or it draws moire rings
  // gusts: slow, wide patches of rougher and calmer water, so no two stretches of sea look the same
  float gust = noised(uv / 310.0 + vec2(uTime * 0.012, uTime * 0.007)).x;
  float bend = noised(vec2(0.74 * uv.x - 0.67 * uv.y, 0.67 * uv.x + 0.74 * uv.y) / 95.0 - vec2(uTime * 0.02, 0.0)).x;
  float gA = 0.55 + 0.9 * (0.6 * gust + 0.4 * bend);
  // the swell, exactly as the hulls feel it. In the shading only, the shorter waves are bent and made uneven
  // (uBend is zero for the long ones), so from high up their crests never form straight, evenly spaced rows.
  float h = 0.0, crest = 0.0, lost = 0.0; vec2 slope = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    float th = uWave[i].z * (uWave[i].x * uv.x + uWave[i].y * uv.y) - uWaveB[i].x * uTime + uWaveB[i].y;
    float s = sin(th), ka = uWave[i].w * uWave[i].z, w = 1.0 - smoothstep(0.05, 0.16, fwW / uWaveB[i].z);
    h += uWave[i].w * s; crest += ka * s * uCw[i];
    float thB = th + uBend[i].x * (bend - 0.5) + uBend[i].y * (gust - 0.5), amp = 1.0 + uBend[i].z * (gust - 0.5) + uBend[i].w * (bend - 0.5);
    slope += uWave[i].xy * (ka * cos(thB) * w * amp); lost += ka * ka * 0.5 * (1.0 - w * w);
  }
  vec3 Nb = normalize(vec3(-slope.x, 1.0, -slope.y));
  gust = 0.6 * gust + 0.4 * bend;
  // wind ripples
DETAIL_OCTAVES
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  if (uUnder > 0.5) {
    // seen from below: bright window overhead, dark beyond it
    float up = abs(V.y); float win = smoothstep(0.55, 0.85, up + slope.x * 0.35);
    vec3 c = mix(uFogColor * 0.9, vec3(0.45, 0.85, 0.9) * (0.7 + 0.5 * max(dot(-V, uSunDir), 0.0)), win);
    float fu = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    gl_FragColor = vec4(mix(c, uFogColor, fu), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float sig = sqrt(lost);
  float ndv = max(dot(N, V), 0.0);
  // reflectivity: weak looking straight down, strong at a glancing angle, and held back where the surface is rough
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0 * exp(-2.69 * sig)) / (1.0 + 22.7 * pow(sig, 1.5));
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02; R = normalize(R);
#if WATER > 0
  vec3 refl = min(textureLod(uSky, R, 1.0 + 14.0 * sig).rgb, vec3(4.0));
#else
  vec3 refl = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));
#endif
  // ---- foam: only where water really breaks ----
  float foam = 0.0, air = 0.0;   // air: churned, aerated water (a smooth pale green trail), separate from white foam
  // whitecaps on the steepest crests, with a fading trail where a crest broke a moment ago
  float thr = uCap.x + (0.5 - gust) * uCap.y * 2.6, capFade = 1.0 - smoothstep(2.5, 8.0, fw);
  if (capFade > 0.0) {
    float cap = smoothstep(thr, thr + uCap.y, crest);
#if WATER > 1
    float lag = 0.6 + 2.6 * noised(uv / 9.0 + 7.7).x, old = 0.0;
    for (int i = 0; i < NW; i++) old += uCw[i] * uWave[i].w * uWave[i].z * sin(uWave[i].z * (uWave[i].x * uv.x + uWave[i].y * uv.y) - uWaveB[i].x * (uTime - lag) + uWaveB[i].y);
    cap = max(cap, smoothstep(thr + uCap.y * 0.1, thr + uCap.y, old) * exp(-lag * 0.75) * 0.8);
#endif
    // not every steep crest breaks: thin them out in loose, uneven clumps
    if (cap > 0.0) cap *= 0.8 * smoothstep(0.3, 0.62, noised(vec2(${WC} * uv.x + ${WS} * uv.y, (${WC} * uv.y - ${WS} * uv.x) * 0.4) / 13.0 + vec2(uTime * 0.03, 1.7)).x);
    foam += cap * capFade;
  }
  float shallow = 0.0;
  for (int i = 0; i < ${MAX_ISL}; i++) {
    if (i >= uIslCount) break;
    float d = distance(uv, uIsl[i].xy) / uIsl[i].z; shallow = max(shallow, 1.0 - smoothstep(0.95, 1.5, d));
    // surf: bands that roll in toward the beach
    float band = (1.0 - smoothstep(0.985, 1.075, d)) * smoothstep(0.9, 0.985, d);
    if (band > 0.0) foam += band * (0.5 + 0.45 * sin(d * uIsl[i].z * 0.3 + uTime * 0.8 + gust * 9.0));
  }
  for (int i = 0; i < ${MAX_SHIPS}; i++) {
    if (i >= uShipCount) break;
    vec2 d = uv - uShipA[i].xy; vec2 fd = uShipA[i].zw; // fd = forward (unit)
    float along = dot(d, fd), across = dot(d, vec2(-fd.y, fd.x));
    float hl = uShipB[i].x, hb = uShipB[i].y, spd = uShipB[i].z, wl = uShipB[i].w;
    if (abs(along) > hl + wl + 30.0 || abs(across) > wl * 0.45 + hb + 30.0) continue;
    // water breaking along the hull, heavier at the bow when under way
    float e = length(vec2(across / (hb * 1.15 + 2.5), along / (hl + 4.0)));
    foam += (1.0 - smoothstep(0.88, 1.3, e)) * (0.3 + 0.7 * spd) * (0.75 + 0.5 * smoothstep(0.2, 1.0, along / hl) * spd);
    float back = -along - hl * 0.75;
    if (back > 0.0 && wl > 1.0) {
      float t = clamp(back / wl, 0.0, 1.0), a = abs(across);
      float wdt = hb * (0.9 + t * 2.2) + 1.0;
      float churn = (1.0 - smoothstep(wdt * 0.3, wdt, a)) * spd;
      foam += churn * pow(1.0 - t, 4.0) * 0.62;   // white water close astern, thinning fast
      air += churn * pow(1.0 - t, 1.3);            // the long smooth trail of churned water
      float arm = back * 0.33 + hb, aw = 1.5 + back * 0.04;
      foam += exp(-pow((a - arm) / aw, 2.0)) * (1.0 - t) * (1.0 - t) * spd * 0.45;      // the two arms of the wake
    }
  }
  for (int i = 0; i < ${MAX_SPLASH}; i++) {
    if (i >= uSplashCount) break;
    foam += uSplash[i].w * (1.0 - smoothstep(0.3, 1.0, distance(uv, uSplash[i].xy) / uSplash[i].z));
  }
  foam = clamp(foam, 0.0, 1.0);
  float white = 0.0;
  float ft = 0.5;
  if (foam > 0.004) { ft = foamTex(uv, fw); white = smoothstep(0.0, 0.55, ft * 1.2 + foam - 0.95); }
  // ---- water colour ----
  float sunB = max(dot(Nb, uSunDir), 0.0);
  vec3 body = uDeep * (0.55 + 0.6 * sunB);
  // light scattered back out of the water: more at a glancing angle, and a green glow through thin crests seen against the sun
  float thin = smoothstep(0.1, 2.0, h) * (0.35 + 0.65 * (1.0 - max(dot(Nb, V), 0.0)));
  float through = pow(max(dot(V, -uSunDir), 0.0), 3.0);
  body += uScatter * (0.10 * pow(1.0 - ndv, 2.0) + 0.05 * smoothstep(0.3, 2.2, h) + 0.62 * thin * through);
  body = mix(body, uShallow * (0.6 + 0.5 * sunB), shallow * 0.75);
  body = mix(body, uScatter * (0.9 + 0.9 * sunB), clamp(foam * 0.55 + air * 0.42, 0.0, 0.55));   // aerated water under and around foam
  vec3 col = mix(body, refl, fres * (1.0 - shallow * 0.3));
  // sun glitter: where the slope of the water lines the sun up with the eye. Slopes finer than a pixel widen it into a soft path.
  vec3 Hh = normalize(V + uSunDir);
  vec2 ds = slope + Hh.xz / max(Hh.y, 0.05);
  float var = GLINT_BASE + lost * 0.5;
  float glint = exp(-dot(ds, ds) / (2.0 * var)) / (6.2832 * var) * (0.02 + 0.98 * pow(1.0 - max(dot(V, Hh), 0.0), 5.0));
  col += uSunColor * min(glint * 0.8, 11.0);
  col = mix(col, vec3(0.86, 0.9, 0.92) * ((0.4 + 0.85 * sunB) * (0.8 + 0.25 * ft)), white * 0.93);
  // the muzzle flash of a big gun on the water around it (xyz: where, w: how bright right now)
  for (int i = 0; i < 2; i++) { if (uFlash[i].w > 0.0) { vec3 fl = uFlash[i].xyz - vWorld; float fq = dot(fl, fl); col += vec3(1.0, 0.6, 0.26) * uFlash[i].w * (0.3 + 0.7 * max(dot(Nb, fl * inversesqrt(fq)), 0.0)) / (1.0 + fq / 1600.0); } }
  float fog = max(1.0 - exp(-uFogDensity * uFogDensity * dist * dist), smoothstep(0.55, 0.97, dist / uFar));
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// ripple layers and sharpest highlight per water level (0 = Fast Graphics, 1 = Low, 2 = Medium and up)
const LEVELS = [{ oct: 3, glint: 0.0035 }, { oct: 4, glint: 0.0012 }, { oct: 5, glint: 0.0007 }];
const fragFor = (lvl) => frag.replace('DETAIL_OCTAVES', octaves(LEVELS[lvl].oct)).replace('GLINT_BASE', f(LEVELS[lvl].glint, 4));

function gridGeometry(N) {
  // uniform fine cells near the camera, geometrically growing rings beyond
  const d = N >= 100 ? 2.6 : N >= 70 ? 3.4 : 5.0, inner = Math.floor(N * 0.42), outer = N - inner;
  // growth factor that makes the outer rings reach 26 km whatever the cell count (found by bisection)
  const target = 26000 / d; let lo = 1.001, hi = 2, g = 1.05;
  for (let it = 0; it < 40; it++) { g = (lo + hi) / 2; if ((Math.pow(g, outer) - 1) / (g - 1) < target) lo = g; else hi = g; }
  const coord = (i) => { const a = Math.abs(i); const v = a <= inner ? a * d : d * (inner + (Math.pow(g, a - inner) - 1) / (g - 1) * 1.0); return Math.sign(i) * v; };
  const n = N * 2 + 1, pos = new Float32Array(n * n * 3), idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let p = 0;
  for (let j = -N; j <= N; j++) for (let i = -N; i <= N; i++) { pos[p++] = coord(i); pos[p++] = 0; pos[p++] = coord(j); }
  p = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, e = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = e; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.userData.cell = d; geo.userData.grid = new THREE.Vector3(d, inner * d, g - 1);
  return geo;
}

export const ocean = {
  mesh: null, mat: null, cell: 2.6, maxWakes: 16, splashes: [],
  init() {
    const U = {
      uTime: { value: 0 }, uWave: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.amp)) }, uWaveB: { value: WAVES.map((w) => new THREE.Vector3(w.w, w.ph, w.len)) },
      uGrid: { value: new THREE.Vector3(2.6, 100, 0.07) }, uCw: { value: WAVES.map((w) => crestWeight(w.len)) }, uBend: { value: WAVES.map((w, i) => { const k = Math.max(0, Math.min(1, (70 - w.len) / 45)), sg = i % 2 ? -1 : 1; return new THREE.Vector4(7 * k * sg, -5 * k * sg, 1.6 * k * sg, -1.6 * k * sg); }) }, uCap: { value: new THREE.Vector2(CREST_SIGMA * 1.85, CREST_SIGMA * 0.8) },
      uSunDir: { value: gfx.sunDir }, uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) }, uSky: { value: gfx.skyCube },
      uFogColor: { value: gfx.scene.fog.color }, uFogDensity: { value: 0.0001 }, uFar: { value: 20000 },
      uDeep: { value: new THREE.Color(0.004, 0.044, 0.066) }, uScatter: { value: new THREE.Color(0.012, 0.19, 0.2) }, uShallow: { value: new THREE.Color(0.03, 0.36, 0.34) },
      uHorizon: { value: new THREE.Color(0.55, 0.7, 0.85) }, uZenith: { value: new THREE.Color(0.12, 0.3, 0.62) },
      uShipA: { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4()) }, uShipB: { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4()) }, uShipCount: { value: 0 }, uHoleA: { value: new THREE.Vector4() }, uHoleB: { value: new THREE.Vector4() },
      uIsl: { value: Array.from({ length: MAX_ISL }, () => new THREE.Vector4(0, 0, 1, 0)) }, uIslCount: { value: 0 },
      uSplash: { value: Array.from({ length: MAX_SPLASH }, () => new THREE.Vector4(0, 0, 1, 0)) }, uSplashCount: { value: 0 }, uUnder: { value: 0 }, uFlash: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: vert, fragmentShader: fragFor(2), side: THREE.DoubleSide, defines: { WATER: 2 } });
    this.mesh = new THREE.Mesh(gridGeometry(128), this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -2;
    gfx.scene.add(this.mesh);
    // underwater light shafts: a ring of soft additive blades hanging from the surface around the camera
    const sc = document.createElement('canvas'); sc.width = 64; sc.height = 64; const sx = sc.getContext('2d'); const gr = sx.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#000'); gr.addColorStop(0.5, '#fff'); gr.addColorStop(1, '#000'); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64); const gv = sx.createLinearGradient(0, 0, 0, 64); gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(1, 'rgba(0,0,0,1)'); sx.fillStyle = gv; sx.fillRect(0, 0, 64, 64);
    const sg = new THREE.Group(), sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 0.85), map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 14; i++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(3 + (i % 4) * 2.5, 90), sm); const a = i * 2.4, r = 14 + (i * 37) % 60; pl.position.set(Math.cos(a) * r, -42, Math.sin(a) * r); pl.rotation.set(0, a * 1.7, 0.32); sg.add(pl); }
    sg.visible = false; this.shafts = sg; this.shaftMat = sm; gfx.scene.add(sg);
    gfx.onQuality((q) => this.setQuality(q));
    this.setQuality(gfx.q);
  },
  setQuality(q) {
    if (this._n !== q.ocean) { this._n = q.ocean; this.mesh.geometry.dispose(); this.mesh.geometry = gridGeometry(q.ocean); this.cell = this.mesh.geometry.userData.cell; this.mat.uniforms.uGrid.value.copy(this.mesh.geometry.userData.grid); }
    const lvl = q.water ?? 2;
    if (this.mat.defines.WATER !== lvl) { this.mat.defines.WATER = lvl; this.mat.fragmentShader = fragFor(lvl); this.mat.needsUpdate = true; }
    this.maxWakes = q.wakes;
  },
  setIslands(list) { const u = this.mat.uniforms; list.slice(0, MAX_ISL).forEach((is, i) => u.uIsl.value[i].set(is.x, is.z, is.r, 0)); u.uIslCount.value = Math.min(list.length, MAX_ISL); },
  // the opening in the sea for a ship with rooms below the waterline: ship = { pos, yaw }, hole = { x0, x1, z0, z1 } in its frame (null = none)
  setHole(ship, hole) { const u = this.mat.uniforms; if (!ship) { u.uHoleA.value.set(0, 0, 0, 0); return; } u.uHoleA.value.set(ship.pos.x, ship.pos.z, -Math.sin(ship.yaw), -Math.cos(ship.yaw)); u.uHoleB.value.set(hole.x0, hole.x1, hole.z0, hole.z1); },
  // a gun flash lighting the water: slot 0 or 1, where it is, how bright (0 = off)
  setFlash(i, p, k) { const v = this.mat.uniforms.uFlash.value[i]; if (p && k > 0) v.set(p.x, p.y, p.z, k); else v.w = 0; },
  // ships: array of { x, z, fx, fz, hl, hb, spd (0..1), wake (m) } nearest first
  setShips(ships) {
    const u = this.mat.uniforms, n = Math.min(ships.length, this.maxWakes, MAX_SHIPS);
    for (let i = 0; i < n; i++) { const s = ships[i]; u.uShipA.value[i].set(s.x, s.z, s.fx, s.fz); u.uShipB.value[i].set(s.hl, s.hb, s.spd, s.wake); }
    u.uShipCount.value = n;
  },
  // a patch of foam left by a splash or an explosion in the water: spreads and fades over its life (seconds)
  addFoam(x, z, radius, life = 7) {
    const S = this.splashes;
    if (S.length >= MAX_SPLASH) { let o = 0; for (let i = 1; i < S.length; i++) if (S[i].r * (1 - S[i].t / S[i].life) < S[o].r * (1 - S[o].t / S[o].life)) o = i; S.splice(o, 1); }
    S.push({ x, z, r: radius, t: 0, life });
  },
  update(dt, camera) {
    seaTime += dt;
    const u = this.mat.uniforms; u.uTime.value = seaTime; u.uFogDensity.value = gfx.scene.fog.density; u.uFar.value = camera.far; u.uUnder.value = gfx.underwater ? 1 : 0;
    const S = this.splashes;
    for (let i = S.length - 1; i >= 0; i--) { S[i].t += dt; if (S[i].t >= S[i].life) S.splice(i, 1); }
    for (let i = 0; i < S.length; i++) { const s = S[i], k = s.t / s.life; u.uSplash.value[i].set(s.x, s.z, s.r * (0.55 + 0.75 * Math.sqrt(k)), Math.min(1, s.t * 3) * (1 - k) ** 1.4); }
    u.uSplashCount.value = S.length;
    const sh = this.shafts; sh.visible = gfx.underwater && camera.position.y > -70 && !gfx.q.simpleWater; if (sh.visible) { sh.position.set(camera.position.x, 0, camera.position.z); sh.rotation.y = seaTime * 0.02; this.shaftMat.opacity = 0.16 + 0.05 * Math.sin(seaTime * 1.7); }
    const c = this.cell; this.mesh.position.set(Math.round(camera.position.x / c) * c, 0, Math.round(camera.position.z / c) * c);
  },
};
