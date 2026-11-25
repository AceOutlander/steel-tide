// Renderer, sky, lighting, environment map, post-processing and the quality presets (incl. Fast Graphics).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { QUALITY } from '../core/config.js';
import { save } from '../core/save.js';
import { initMaterials, setTextureQuality, setEnvIntensity, TEX } from './materials.js';

const FOG_COLOR = new THREE.Color(0x9fbdd4);
const BASE_FOG = 0.000085;

export const gfx = {
  renderer: null, scene: null, camera: null, sun: null, hemi: null, sky: null, clouds: null, composer: null, bloom: null, renderPass: null,
  sunDir: new THREE.Vector3(), skyCube: null, q: QUALITY.medium, qName: 'medium', auto: 'medium', listeners: [], underwater: false,
  fogColor: FOG_COLOR.clone(), w: 1, h: 1, gpu: '',

  init(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.62;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.5, 22000);
    this.scene.add(this.camera);
    this.auto = this.detectPreset();

    // sun + sky
    const elev = THREE.MathUtils.degToRad(31), az = THREE.MathUtils.degToRad(128);
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
    const mkSky = () => {
      const s = new Sky(); s.scale.setScalar(400000);
      const u = s.material.uniforms; u.turbidity.value = 5.5; u.rayleigh.value = 1.5; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(this.sunDir);
      return s;
    };
    this.sky = mkSky(); this.sky.renderOrder = -10; this.scene.add(this.sky);
    // environment: render the sky once into a cube (water reflections) and prefilter it (PBR reflections on metal and glass)
    const skyScene = new THREE.Scene(); skyScene.add(mkSky());
    const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(1, 1000000, cubeRT);
    const tm = r.toneMapping; r.toneMapping = THREE.NoToneMapping; cubeCam.update(r, skyScene); r.toneMapping = tm;
    this.skyCube = cubeRT.texture;
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(skyScene, 0.02).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.1);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.35;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd6f0, 0x26384a, 0.75);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), BASE_FOG);

    initMaterials(1024, 4);
    this.makeClouds();

    // post-processing chain (only used by presets with post: true)
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 6.5);
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());

    addEventListener('resize', () => this.resize());
    this.applyQuality();
  },

  makeClouds() {
    // a high layer of soft procedural cloud: cheap, and it breaks up the sky
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 512);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 260; i++) {
      const px = rnd() * 512, py = rnd() * 512, rr = 14 + rnd() * 46, a = 0.05 + rnd() * 0.09;
      for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rr);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px + ox, py + oy, rr, 0, 7); x.fill();
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); t.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.CircleGeometry(60000, 48);
    // fade toward the horizon with vertex alpha via a radial alpha map baked into colours
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, depthWrite: false, fog: false, color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vR;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvR = length(position.xy) / 60000.0;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vR;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= smoothstep(0.75, 0.2, vR);\ndiffuseColor.rgb *= 1.6;');
    };
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = 4200; m.renderOrder = -5; m.frustumCulled = false;
    this.clouds = m; this.cloudTex = t; this.scene.add(m);
  },

  detectPreset() {
    let name = '';
    try { const gl = this.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); name = (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || ''; } catch { /* ignore */ }
    this.gpu = name; const n = name.toLowerCase();
    if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 'fast';
    if (/rtx|radeon rx [5-9]\d{3}|rx [67]\d{3}|gtx 1[0-9]{3}|gtx 16|arc a[57]|apple m[1-9]/.test(n)) return 'high';
    if (/intel|uhd|iris|hd graphics|mali|adreno|vega [3-8]\b/.test(n)) return 'low';
    if (/nvidia|geforce|radeon|amd/.test(n)) return 'medium';
    return 'medium';
  },

  presetName() { const s = save.settings; if (s.fast) return 'fast'; return s.quality === 'auto' || !QUALITY[s.quality] || s.quality === 'fast' ? (this.auto === 'fast' ? 'low' : this.auto) : s.quality; },

  applyQuality() {
    const name = this.presetName(), q = QUALITY[name], prev = this.q, first = !this._applied;
    this.q = q; this.qName = name; this._applied = true;
    const r = this.renderer;
    const shadowsOn = q.shadows > 0;
    if (r.shadowMap.enabled !== shadowsOn) { r.shadowMap.enabled = shadowsOn; this.scene.traverse((o) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); } }); }
    this.sun.castShadow = shadowsOn;
    if (shadowsOn && this.sun.shadow.mapSize.x !== q.shadows) { this.sun.shadow.mapSize.set(q.shadows, q.shadows); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    if (first || prev.tex !== q.tex || prev.aniso !== q.aniso) { if (!first || q.tex !== 1024 || q.aniso !== 4) setTextureQuality(q.tex, Math.min(q.aniso, r.capabilities.getMaxAnisotropy())); }
    this.clouds.visible = q.clouds && !this.underwater;
    this.camera.far = q.view + 2000; this.camera.fov = save.settings.fov; this.camera.updateProjectionMatrix();
    if (!this.underwater) this.scene.fog.density = BASE_FOG * q.fog;
    this.resize();
    for (const fn of this.listeners) fn(q, name);
  },
  onQuality(fn) { this.listeners.push(fn); },

  resize() {
    const w = innerWidth, h = innerHeight, q = this.q;
    let pr = Math.min(devicePixelRatio || 1, Math.max(q.prCap, 1)); if (q.prCap < 1) pr *= q.prCap;
    pr = Math.max(0.4, pr * (save.settings.resScale || 1));
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (q.post) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
  },

  // keep the shadow box centred on what the player is looking at
  focusShadow(pos, radius) {
    const s = this.sun; s.target.position.copy(pos); s.position.copy(pos).addScaledVector(this.sunDir, 900);
    if (!s.castShadow) return;
    const c = s.shadow.camera, rad = Math.min(Math.max(radius, 40), 260);
    if (c.right !== rad) { c.left = -rad; c.right = rad; c.top = rad; c.bottom = -rad; c.near = 100; c.far = 1700; c.updateProjectionMatrix(); }
    s.shadow.normalBias = rad * 0.004;
  },

  // depth > 0 when the camera is below the surface
  setUnderwater(depth) {
    const under = depth > 0;
    if (under) {
      const k = Math.min(depth / 120, 1);
      this.fogColor.setRGB(0.02 + 0.05 * (1 - k), 0.16 * (1 - k * 0.8) + 0.02, 0.22 * (1 - k * 0.75) + 0.03);
      this.scene.fog.color.copy(this.fogColor); this.scene.fog.density = 0.012 + k * 0.012;
      this.scene.background = this.fogColor;
      this.hemi.intensity = 0.75 * (1 - k * 0.7); this.sun.intensity = 3.1 * (0.6 - 0.5 * k);
    }
    if (under !== this.underwater) {
      this.underwater = under; this.sky.visible = !under; this.clouds.visible = !under && this.q.clouds;
      if (!under) { this.scene.fog.color.copy(FOG_COLOR); this.fogColor.copy(FOG_COLOR); this.scene.fog.density = BASE_FOG * this.q.fog; this.scene.background = null; this.hemi.intensity = 0.75; this.sun.intensity = 3.1; }
    }
  },

  render(scene = this.scene, camera = this.camera) {
    if (this.clouds && scene === this.scene) { this.clouds.position.x = camera.position.x; this.clouds.position.z = camera.position.z; this.cloudTex.offset.x += 0.00002; }
    if (this.q.post && scene === this.scene) { this.renderPass.scene = scene; this.renderPass.camera = camera; this.composer.render(); }
    else this.renderer.render(scene, camera);
  },
};
export { TEX, setEnvIntensity };
