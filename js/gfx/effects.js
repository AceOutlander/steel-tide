// Pooled particle effects: smoke, fire, flashes, spray, flares, bubbles. Two point clouds (blended + additive), CPU-updated.
import * as THREE from 'three';
import { gfx } from './renderer.js';
import { TEX } from './materials.js';
import { audio } from '../audio/audio.js';
import { rand } from '../core/util.js';

const vsh = /* glsl */`
attribute float size; attribute vec4 pcolor; uniform float uScale; varying vec4 vC; varying float vFog; uniform float uFogDensity;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(-mv.z, 0.1);
  gl_PointSize = clamp(size * uScale / d, 0.0, 900.0); vC = pcolor; vFog = 1.0 - exp(-uFogDensity * uFogDensity * d * d); }`;
const fsh = (add) => /* glsl */`
uniform sampler2D uMap; uniform vec3 uFogColor; varying vec4 vC; varying float vFog;
void main(){ float a = texture2D(uMap, gl_PointCoord).a; if (a < 0.01) discard;
  ${add ? 'gl_FragColor = vec4(vC.rgb * a * vC.a * (1.0 - vFog) * 3.0, 1.0);' : 'gl_FragColor = vec4(mix(vC.rgb, uFogColor, vFog), a * vC.a);'}
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Cloud {
  constructor(max, additive) {
    this.max = max; this.n = 0; this.additive = additive;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max); this.cool = new Float32Array(max);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: additive ? TEX.glow : TEX.smoke }, uScale: { value: 600 }, uFogColor: { value: gfx.scene.fog.color }, uFogDensity: { value: 0.0001 } },
      vertexShader: vsh, fragmentShader: fsh(additive), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = additive ? 11 : 10;
    gfx.scene.add(this.points);
  }
  // p: {x,y,z, vx,vy,vz, r,g,b, a, size, grow, life, drag, grav, cool}
  emit(x, y, z, vx, vy, vz, r, g, b, a, size, grow, life, drag = 0.6, grav = 0, cool = 0) {
    let i = this.n;
    if (i >= this.max) { i = (this._rr = ((this._rr || 0) + 1) % this.max); } else this.n++;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a; this.a0[i] = a;
    this.size[i] = size; this.grow[i] = grow; this.life[i] = life; this.maxLife[i] = life; this.drag[i] = drag; this.grav[i] = grav; this.cool[i] = cool;
  }
  update(dt) {
    const { pos, vel, col, size, life, maxLife, grow, drag, grav, a0, cool } = this;
    let n = this.n;
    for (let i = 0; i < n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { // swap-remove
        n--; if (i !== n) {
          const a = i * 3, b = n * 3, c = i * 4, d = n * 4;
          pos[a] = pos[b]; pos[a + 1] = pos[b + 1]; pos[a + 2] = pos[b + 2]; vel[a] = vel[b]; vel[a + 1] = vel[b + 1]; vel[a + 2] = vel[b + 2];
          col[c] = col[d]; col[c + 1] = col[d + 1]; col[c + 2] = col[d + 2]; col[c + 3] = col[d + 3];
          size[i] = size[n]; life[i] = life[n]; maxLife[i] = maxLife[n]; grow[i] = grow[n]; drag[i] = drag[n]; grav[i] = grav[n]; a0[i] = a0[n]; cool[i] = cool[n];
        }
        i--; continue;
      }
      const i3 = i * 3, k = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k - grav[i] * dt; vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      size[i] += grow[i] * dt;
      const t = life[i] / maxLife[i];
      col[i * 4 + 3] = a0[i] * (t < 0.7 ? t / 0.7 : 1) * (t > 0.92 ? (1 - t) / 0.08 : 1);
      if (cool[i] > 0) { const c = i * 4, f = 1 - cool[i] * dt; col[c + 1] *= f; col[c + 2] *= f * f; }
    }
    this.n = n;
    const g = this.geo; g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true; g.attributes.size.needsUpdate = true;
    const u = this.mat.uniforms; u.uScale.value = gfx.h * gfx.renderer.getPixelRatio() / (2 * Math.tan((gfx.camera.fov * Math.PI) / 360)); u.uFogDensity.value = gfx.scene.fog.density;
  }
}

export const fx = {
  smoke: null, glow: null, k: 1,
  init() { this.smoke = new Cloud(5000, false); this.glow = new Cloud(3000, true); gfx.onQuality((q) => { this.k = q.particles; }); this.k = gfx.q.particles; },
  update(dt) { this.smoke.update(dt); this.glow.update(dt); },
  count(n) { const v = n * this.k; return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0); },

  puff(p, vx, vy, vz, size, grey = 0.5, a = 0.5, life = 3, grow = 2) { this.smoke.emit(p.x, p.y, p.z, vx, vy, vz, grey, grey, grey * 1.02, a, size, grow, life, 0.5, -0.4); },
  // funnel / damage smoke column
  stack(p, size, dark = 0.18, a = 0.45) { if (Math.random() > this.k) return; this.smoke.emit(p.x + rand(-1, 1) * size * 0.2, p.y, p.z + rand(-1, 1) * size * 0.2, rand(-1, 1) + 3, rand(2, 5), rand(-1, 1) + 1, dark, dark, dark, a, size, size * 0.9, rand(4, 8), 0.25, -0.5); },
  fire(p, size) {
    if (Math.random() > this.k) return;
    this.glow.emit(p.x + rand(-1, 1) * size * 0.3, p.y + rand(0, size * 0.3), p.z + rand(-1, 1) * size * 0.3, rand(-1, 1), rand(2, 6), rand(-1, 1), 2.6, 1.1, 0.25, 0.9, size * rand(0.7, 1.3), -size * 0.4, rand(0.4, 0.9), 0.5, -2, 1.4);
    if (Math.random() < 0.5) this.stack({ x: p.x, y: p.y + size * 0.6, z: p.z }, size * 1.4, 0.07, 0.6);
  },
  muzzle(p, d, size = 1) {
    this.glow.emit(p.x + d.x * size, p.y + d.y * size, p.z + d.z * size, d.x * 6, d.y * 6, d.z * 6, 3.2, 2.2, 0.9, 1, size * 2.2, size * 4, 0.07, 0, 0);
    if (size > 1.5) { const n = this.count(size > 6 ? 10 : 4); for (let i = 0; i < n; i++) this.smoke.emit(p.x + d.x * size * 2, p.y + d.y * size * 2, p.z + d.z * size * 2, d.x * rand(8, 30) + rand(-4, 4), d.y * rand(8, 30) + rand(-2, 4), d.z * rand(8, 30) + rand(-4, 4), 0.75, 0.72, 0.68, 0.5, size * 1.2, size * 1.6, rand(1.5, 3.5), 1.6, -0.3); this.glow.emit(p.x + d.x * size * 1.5, p.y + d.y * size * 1.5, p.z + d.z * size * 1.5, d.x * 20, d.y * 20, d.z * 20, 3.5, 1.8, 0.5, 1, size * 3.2, size * 6, 0.14, 2, 0, 2); }
  },
  explosion(p, size = 8, sound = true) {
    const n = this.count(Math.min(26, 6 + size * 0.7));
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 4, 3, 1.6, 1, size * 3.5, size * 6, 0.16, 0, 0);
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.283), e = rand(-0.2, 1.4), s = rand(0.3, 1) * size * 1.6, c = Math.cos(e);
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * c * s, Math.sin(e) * s, Math.sin(a) * c * s, 3.2, 1.5, 0.35, 0.95, size * rand(0.7, 1.4), size * 0.6, rand(0.35, 0.9), 1.6, 0, 1.6);
      this.smoke.emit(p.x, p.y, p.z, Math.cos(a) * c * s * 0.6, Math.sin(e) * s * 0.5 + 1, Math.sin(a) * c * s * 0.6, 0.12, 0.11, 0.1, 0.7, size * rand(0.8, 1.5), size * 0.5, rand(2.5, 6.5) * (0.6 + size * 0.03), 1.1, -0.6);
    }
    const sp = this.count(Math.min(14, size * 0.5));
    for (let i = 0; i < sp; i++) { const a = rand(0, 6.283), s = rand(1, 3) * size; this.glow.emit(p.x, p.y, p.z, Math.cos(a) * s, rand(0.5, 3) * size, Math.sin(a) * s, 3, 1.8, 0.6, 1, size * 0.14, 0, rand(0.5, 1.4), 0.4, 9.8); }
    if (sound) audio.play(size > 18 ? 'bigexplosion' : 'explosion', { pos: p, vol: Math.min(1.4, 0.5 + size * 0.04) });
  },
  splash(p, size = 3, sound = true) {
    const n = this.count(Math.min(18, 4 + size));
    for (let i = 0; i < n; i++) { const a = rand(0, 6.283), s = rand(0, 0.35) * size; this.smoke.emit(p.x, p.y, p.z, Math.cos(a) * s, rand(1.5, 4.2) * size * 0.8, Math.sin(a) * s, 0.9, 0.95, 0.97, 0.75, size * rand(0.3, 0.6), size * 0.35, rand(0.8, 1.8) * (0.7 + size * 0.03), 0.3, 9.8); }
    for (let i = 0; i < n / 2; i++) { const a = rand(0, 6.283), s = rand(0.5, 1.5) * size; this.smoke.emit(p.x, p.y, p.z, Math.cos(a) * s, 0.3, Math.sin(a) * s, 0.92, 0.96, 0.98, 0.5, size * 0.5, size * 0.8, rand(1.5, 3), 0.8, 0); }
    if (sound && size > 0.8) audio.play(size > 5 ? 'splash' : 'splashSmall', { pos: p, vol: Math.min(1, 0.3 + size * 0.06) });
  },
  spray(p, vx, vz, size = 1.5) { this.smoke.emit(p.x, p.y, p.z, vx + rand(-2, 2), rand(1, 4), vz + rand(-2, 2), 0.92, 0.96, 0.98, 0.45, size, size * 1.5, rand(0.6, 1.3), 0.6, 6); },
  trail(p, size = 1.2, grey = 0.82, life = 3.5) { this.smoke.emit(p.x, p.y, p.z, rand(-0.5, 0.5), rand(-0.2, 0.6), rand(-0.5, 0.5), grey, grey, grey, 0.5, size, size * 1.4, life * rand(0.7, 1.2), 0.3, -0.1); },
  flame(p, size = 1) { this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 3.5, 2.0, 0.6, 1, size, 0, 0.05, 0, 0); },
  flare(p, vx, vy, vz) { this.glow.emit(p.x, p.y, p.z, vx, vy, vz, 4, 3.4, 2.2, 1, 5, -0.6, 3.2, 0.5, 6); for (let i = 0; i < 3; i++) this.smoke.emit(p.x, p.y, p.z, vx * 0.5, vy * 0.5, vz * 0.5, 0.9, 0.9, 0.9, 0.35, 1.5, 2.5, 2.5, 0.8, 0); },
  chaff(p, vx, vy, vz) { for (let i = 0; i < 6; i++) this.smoke.emit(p.x, p.y, p.z, vx * 0.3 + rand(-6, 6), vy * 0.3 + rand(-6, 6), vz * 0.3 + rand(-6, 6), 0.95, 0.95, 1, 0.35, 2.5, 5, 2.2, 0.9, 0.5); },
  bubbles(p, size = 1) { if (Math.random() > this.k) return; this.smoke.emit(p.x + rand(-1, 1) * size, p.y, p.z + rand(-1, 1) * size, rand(-0.3, 0.3), rand(1, 2.5), rand(-0.3, 0.3), 0.75, 0.92, 0.95, 0.35, rand(0.15, 0.5) * size, 0.1, rand(1, 3), 0.3, 0); },
  spark(p, d) { const n = this.count(3); for (let i = 0; i < n; i++) this.glow.emit(p.x, p.y, p.z, d.x * 10 + rand(-8, 8), d.y * 10 + rand(0, 10), d.z * 10 + rand(-8, 8), 3, 2, 0.8, 1, 0.35, 0, rand(0.15, 0.4), 0.5, 9.8); },
  heat(p, vx, vy, vz, size) { this.glow.emit(p.x, p.y, p.z, vx, vy, vz, 1.6, 0.9, 0.5, 0.35, size, size * 2, 0.12, 0, 0); },
};
