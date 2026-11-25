// Ocean: the same wave sum runs on the GPU (vertex shader) and on the CPU (waveHeight), so hulls float on the waves you see.
import * as THREE from 'three';
import { gfx } from './renderer.js';
import { TEX } from './materials.js';

const G = 9.81;
// direction angle (rad), wavelength (m), amplitude (m)
const SPEC = [[0.35, 150, 1.05], [1.25, 88, 0.55], [-0.55, 49, 0.32], [2.1, 24, 0.15], [-1.4, 11.5, 0.065]];
export const WAVES = SPEC.map(([ang, len, amp], i) => { const k = (Math.PI * 2) / len; return { dx: Math.cos(ang), dz: Math.sin(ang), k, amp, w: Math.sqrt(G * k), ph: i * 1.7 }; });
export let seaTime = 0;

export function waveHeight(x, z, t = seaTime) {
  let h = 0;
  for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i]; h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph); }
  return h;
}
// slope-based normal (for spray, floating debris)
export function waveNormal(x, z, out, t = seaTime) {
  let sx = 0, sz = 0;
  for (let i = 0; i < WAVES.length; i++) { const w = WAVES[i], c = w.amp * w.k * Math.cos(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph); sx += c * w.dx; sz += c * w.dz; }
  return out.set(-sx, 1, -sz).normalize();
}

const MAX_SHIPS = 16, MAX_ISL = 6;
const vert = /* glsl */`
uniform float uTime; uniform vec4 uWave[5]; uniform vec2 uWaveB[5];
varying vec3 vWorld; varying vec3 vN; varying float vH;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = 0.0, sx = 0.0, sz = 0.0;
  float dist = distance(wp.xz, cameraPosition.xz);
  for (int i = 0; i < 5; i++) {
    float fade = i < 3 ? 1.0 : 1.0 - smoothstep(600.0, 2500.0, dist);
    float th = uWave[i].z * (uWave[i].x * wp.x + uWave[i].y * wp.z) - uWaveB[i].x * uTime + uWaveB[i].y;
    h += uWave[i].w * sin(th) * fade;
    float c = uWave[i].w * uWave[i].z * cos(th) * fade; sx += c * uWave[i].x; sz += c * uWave[i].y;
  }
  wp.y += h; vH = h; vWorld = wp.xyz; vN = normalize(vec3(-sx, 1.0, -sz));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const frag = /* glsl */`
precision highp float;
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform samplerCube uSky; uniform sampler2D uNormalMap; uniform sampler2D uFoamMap;
uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uDeep; uniform vec3 uScatter; uniform vec3 uShallow; uniform vec3 uHorizon; uniform vec3 uZenith;
uniform vec4 uShipA[${MAX_SHIPS}]; uniform vec4 uShipB[${MAX_SHIPS}]; uniform int uShipCount;
uniform vec4 uIsl[${MAX_ISL}]; uniform int uIslCount; uniform float uUnder;
varying vec3 vWorld; varying vec3 vN; varying float vH;
void main(){
  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  // detail normals: two scrolling layers, fading with distance so the horizon stays calm
  vec2 uv = vWorld.xz;
  vec3 n1 = texture2D(uNormalMap, uv * 0.045 + vec2(uTime * 0.018, uTime * 0.011)).xyz * 2.0 - 1.0;
#ifndef SIMPLE
  vec3 n2 = texture2D(uNormalMap, uv * 0.0131 + vec2(-uTime * 0.009, uTime * 0.014)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(uNormalMap, uv * 0.171 + vec2(uTime * 0.03, -uTime * 0.021)).xyz * 2.0 - 1.0;
  vec2 dn = n1.xy * 0.5 + n2.xy * 0.7 + n3.xy * 0.3 * (1.0 - smoothstep(20.0, 260.0, dist));
#else
  vec2 dn = n1.xy * 0.8;
#endif
  float detail = mix(0.42, 0.035, smoothstep(40.0, 1400.0, dist));
  vec3 n4 = texture2D(uNormalMap, uv * 0.0029 + vec2(uTime * 0.004, -uTime * 0.003)).xyz * 2.0 - 1.0;
  dn = dn * detail + n4.xy * 0.11; detail = 1.0;
  vec3 N = normalize(vN + vec3(dn.x, 0.0, dn.y) * detail);
  if (uUnder > 0.5) {
    // seen from below: bright Snell window overhead, dark beyond it
    float up = abs(V.y); float win = smoothstep(0.55, 0.85, up + dn.x * 0.08);
    vec3 c = mix(uFogColor * 0.9, vec3(0.45, 0.85, 0.9) * (0.7 + 0.5 * max(dot(-V, uSunDir), 0.0)), win);
    float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
#ifndef SIMPLE
  vec3 refl = textureCube(uSky, normalize(R)).rgb;
#else
  vec3 refl = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.45));
#endif
  // body colour: deep blue, greener where waves stand up against the light
  float crest = clamp(vH * 0.28 + 0.35, 0.0, 1.0);
  vec3 body = mix(uDeep, uScatter, crest * (0.35 + 0.65 * pow(1.0 - ndv, 2.0)));
  float shallow = 0.0, shore = 0.0;
  for (int i = 0; i < ${MAX_ISL}; i++) { if (i >= uIslCount) break; float d = distance(vWorld.xz, uIsl[i].xy) / uIsl[i].z; shallow = max(shallow, 1.0 - smoothstep(0.95, 1.5, d)); shore = max(shore, (1.0 - smoothstep(0.985, 1.06, d)) * smoothstep(0.9, 0.985, d)); }
  body = mix(body, uShallow, shallow * 0.75);
  float sunL = max(dot(N, uSunDir), 0.0);
  vec3 col = mix(body * (0.55 + 0.6 * sunL), refl, fres * (1.0 - shallow * 0.3));
  // sun glitter
  vec3 H = normalize(V + uSunDir); float spec = pow(max(dot(N, H), 0.0), 420.0);
  col += uSunColor * spec * 14.0 * (0.25 + fres);
  // foam: wave crests, shorelines, hulls and wakes
  float fn = texture2D(uFoamMap, uv * 0.03 + vec2(uTime * 0.01, 0.0)).r;
  float fn2 = texture2D(uFoamMap, uv * 0.11 - vec2(0.0, uTime * 0.02)).r;
  #ifndef SIMPLE
  float foam = smoothstep(1.5, 2.3, vH + fn * 0.75) * 0.42 * fn2 * (1.0 - smoothstep(1200.0, 4000.0, dist));
#else
  float foam = 0.0;
#endif
  foam += shore * (0.5 + 0.5 * sin(uTime * 0.9 + fn * 6.0)) * 0.9;
  for (int i = 0; i < ${MAX_SHIPS}; i++) {
    if (i >= uShipCount) break;
    vec2 d = vWorld.xz - uShipA[i].xy; vec2 f = uShipA[i].zw; // f = forward (unit)
    float along = dot(d, f), across = dot(d, vec2(-f.y, f.x));
    float hl = uShipB[i].x, hb = uShipB[i].y, spd = uShipB[i].z, wl = uShipB[i].w;
    if (abs(along) > hl + wl + 30.0 || abs(across) > wl * 0.45 + hb + 30.0) continue;
    float e = length(vec2(across / (hb + 2.5 + hb * 0.15), along / (hl + 4.0)));
    foam += (1.0 - smoothstep(0.9, 1.25, e)) * (0.25 + 0.75 * spd) * (0.55 + 0.6 * fn2);
    float back = -along - hl * 0.75;
    if (back > 0.0 && wl > 1.0) {
      float t = clamp(back / wl, 0.0, 1.0), a = abs(across);
      float wdt = hb * (0.9 + t * 2.2) + 1.0;
      foam += (1.0 - smoothstep(wdt * 0.45, wdt, a)) * pow(1.0 - t, 1.6) * spd * (0.5 + 0.8 * fn2);
      float arm = back * 0.33 + hb; float aw = 1.5 + back * 0.035;
      foam += exp(-pow((a - arm) / aw, 2.0)) * (1.0 - t) * spd * 0.55 * (0.4 + fn);
    }
  }
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, vec3(0.92, 0.96, 0.98) * (0.5 + 0.65 * sunL), foam * 0.9);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function gridGeometry(N) {
  // uniform fine cells near the camera, geometrically growing rings beyond
  const d = N >= 100 ? 2.6 : N >= 70 ? 3.4 : 5.0, inner = Math.floor(N * 0.42), outer = N - inner;
  const target = 26000 / d; let g = 1.05;
  for (let it = 0; it < 40; it++) { const s = (Math.pow(g, outer) - 1) / (g - 1); g += s < target ? 0.004 : -0.002; }
  const coord = (i) => { const a = Math.abs(i); const v = a <= inner ? a * d : d * (inner + (Math.pow(g, a - inner) - 1) / (g - 1) * 1.0); return Math.sign(i) * v; };
  const n = N * 2 + 1, pos = new Float32Array(n * n * 3), idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let p = 0;
  for (let j = -N; j <= N; j++) for (let i = -N; i <= N; i++) { pos[p++] = coord(i); pos[p++] = 0; pos[p++] = coord(j); }
  p = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, e = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = e; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.userData.cell = d;
  return geo;
}

export const ocean = {
  mesh: null, mat: null, cell: 2.6, maxWakes: 16,
  init() {
    const U = {
      uTime: { value: 0 }, uWave: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, w.amp)) }, uWaveB: { value: WAVES.map((w) => new THREE.Vector2(w.w, w.ph)) },
      uSunDir: { value: gfx.sunDir }, uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) }, uSky: { value: gfx.skyCube }, uNormalMap: { value: TEX.waterNormal }, uFoamMap: { value: TEX.foam },
      uFogColor: { value: gfx.scene.fog.color }, uFogDensity: { value: 0.0001 },
      uDeep: { value: new THREE.Color(0.006, 0.045, 0.085) }, uScatter: { value: new THREE.Color(0.015, 0.2, 0.21) }, uShallow: { value: new THREE.Color(0.03, 0.36, 0.34) },
      uHorizon: { value: new THREE.Color(0.55, 0.7, 0.85) }, uZenith: { value: new THREE.Color(0.12, 0.3, 0.62) },
      uShipA: { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4()) }, uShipB: { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4()) }, uShipCount: { value: 0 },
      uIsl: { value: Array.from({ length: MAX_ISL }, () => new THREE.Vector4(0, 0, 1, 0)) }, uIslCount: { value: 0 }, uUnder: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: vert, fragmentShader: frag, side: THREE.DoubleSide, defines: {} });
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
    if (this._n !== q.ocean) { this._n = q.ocean; this.mesh.geometry.dispose(); this.mesh.geometry = gridGeometry(q.ocean); this.cell = this.mesh.geometry.userData.cell; }
    const simple = !!q.simpleWater;
    if (!!this.mat.defines.SIMPLE !== simple) { if (simple) this.mat.defines.SIMPLE = 1; else delete this.mat.defines.SIMPLE; this.mat.needsUpdate = true; }
    this.maxWakes = q.wakes;
  },
  setIslands(list) { const u = this.mat.uniforms; list.slice(0, MAX_ISL).forEach((is, i) => u.uIsl.value[i].set(is.x, is.z, is.r, 0)); u.uIslCount.value = Math.min(list.length, MAX_ISL); },
  // ships: array of { x, z, fx, fz, hl, hb, spd (0..1), wake (m) } nearest first
  setShips(ships) {
    const u = this.mat.uniforms, n = Math.min(ships.length, this.maxWakes, MAX_SHIPS);
    for (let i = 0; i < n; i++) { const s = ships[i]; u.uShipA.value[i].set(s.x, s.z, s.fx, s.fz); u.uShipB.value[i].set(s.hl, s.hb, s.spd, s.wake); }
    u.uShipCount.value = n;
  },
  update(dt, camera) {
    seaTime += dt;
    const u = this.mat.uniforms; u.uTime.value = seaTime; u.uFogDensity.value = gfx.scene.fog.density; u.uUnder.value = gfx.underwater ? 1 : 0;
    const sh = this.shafts; sh.visible = gfx.underwater && camera.position.y > -70 && !gfx.q.simpleWater; if (sh.visible) { sh.position.set(camera.position.x, 0, camera.position.z); sh.rotation.y = seaTime * 0.02; this.shaftMat.opacity = 0.16 + 0.05 * Math.sin(seaTime * 1.7); }
    const c = this.cell; this.mesh.position.set(Math.round(camera.position.x / c) * c, 0, Math.round(camera.position.z / c) * c);
  },
};
