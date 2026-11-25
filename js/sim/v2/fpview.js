// The Marine's first-person hands and rifle. Drawn after the main frame in a pass of its own (own scene, camera and field of
// view, depth cleared first), so the weapon can never poke into a wall or the deck however close the player stands, and it
// throws no shadow on the world. Lit by a copy of the scene's sun, sky light and environment.
//
// Reads from the player: unit, yaw, pitch, zoom (0..1 while the right button is held).
// Reads from the soldier: kind, alive, nation, aboard, gun, swim, hideBody (true = the camera is at the eyes), grounded, vy,
//   moving, state ('run' = sprinting), ctl.crouch, reloadT, selKey, on (the ship underfoot, for deck roll), shots (rounds
//   fired so far), landN / landV (landings so far, speed of the last), lod0.userData.uniform (which sleeves to wear).
import * as THREE from 'three';
import { WEAPONS } from '../../core/config.js';
import { buildSoldier, buildRifle, holdRifle, reloadPose } from '../../units/v2/human.js';
import { kit } from '../../units/v2/humankit.js';

const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(58, 1, 0.02, 8);
const sun = new THREE.DirectionalLight(0xffffff, 3), hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7), flashLight = new THREE.PointLight(0xffb060, 0, 2.5, 2);
scene.add(sun, sun.target, hemi, flashLight);
const HIP = new THREE.Vector3(0.108, -0.168, -0.4), ADS = new THREE.Vector3(0, -0.112, -0.17), ARMS = new THREE.Vector3(0, -1.68, -0.1);
const _p = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _lh = new THREE.Vector3(), _rl = {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t, sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
let arms = null, rifle = null, flash = null, built = '', show = false, fast = false;
const casings = []; let casingN = 0;
const S = { vis: 0, unit: null, sprint: 0, crouch: 0, move: 0, air: 0, bob: 0, t: 0, yaw: 0, pitch: 0, lagX: 0, lagY: 0, kz: 0, kp: 0, ky: 0, kr: 0, landY: 0, landV: 0, shots: 0, landN: 0, sel: null, swap: 0, flashT: 0, deck: 0, tilt: 0, ads: 0 };

function build(u, isFast) {
  const uni = (u.lod0 && u.lod0.userData.uniform) || 'fatigues', key = u.nation + '|' + uni + '|' + (isFast ? 1 : 0);
  if (key === built) return; built = key; fast = isFast;
  if (arms) scene.remove(arms);
  arms = buildSoldier(u.nation, { parts: 'arms', lod: isFast ? 0 : -1, uniform: uni });
  arms.userData.rig2.bones[2].rotation.y = -0.45; // chest turned, left shoulder forward, as when shouldering a rifle
  arms.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
  rifle = buildRifle(0); rifle.traverse((o) => { o.castShadow = false; o.frustumCulled = false; }); arms.add(rifle);
  flash = new THREE.Group(); flash.position.copy(rifle.userData.muzzle); flash.position.z -= 0.06; flash.visible = false;
  const a = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), kit.flash()), b = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.13), kit.flash()), c = b.clone();
  b.rotation.y = Math.PI / 2; b.position.z = -0.1; c.rotation.set(0, Math.PI / 2, Math.PI / 2); c.rotation.order = 'ZYX'; c.position.z = -0.1;
  for (const m of [a, b, c]) { m.renderOrder = 10; m.frustumCulled = false; flash.add(m); }
  rifle.add(flash); scene.add(arms);
  if (!casings.length) { const g = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6); for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(g, kit.brass()); m.visible = false; m.frustumCulled = false; m.userData = { v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 }; scene.add(m); casings.push(m); } }
}
function eject() {
  const m = casings[casingN++ % casings.length], d = m.userData;
  rifle.updateWorldMatrix(true, false); m.position.copy(rifle.userData.eject).applyMatrix4(rifle.matrixWorld);
  d.v.set(1.5 + Math.random() * 0.8, 1.1 + Math.random() * 0.7, 0.25 + Math.random() * 0.4); d.w.set(Math.random() * 30 - 15, Math.random() * 30 - 15, 20 + Math.random() * 20); d.life = 0.55; m.visible = true; m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
}

export const fpview = {
  scene, camera: cam, state: S,
  update(dt, player, gfx) {
    const pu = player.unit, u = pu && pu.kind === 'soldier' ? pu : null;
    if (u && u.selKey !== S.sel) { if (S.sel !== null && S.unit === u) S.swap = 0.34; S.sel = u.selKey; }
    S.swap = Math.max(0, S.swap - dt);
    const ok = !!u && u.alive && !u.aboard && !u.gun && !u.swim && !!u.hideBody && S.swap < 0.17;
    if (ok || (u && S.vis > 0)) build(u, gfx.qName === 'fast');
    if (!arms) { show = false; return; }
    S.vis = ok ? Math.min(1, S.vis + dt / 0.3) : Math.max(0, S.vis - dt / 0.15);
    show = S.vis > 0.002;
    if (!u || !show) { S.unit = u; if (u) { S.yaw = player.yaw; S.pitch = player.pitch; S.shots = u.shots || 0; S.landN = u.landN || 0; } S.lagX = S.lagY = S.kz = S.kp = S.ky = S.kr = S.landY = S.landV = 0; S.flashT = 0; for (const c of casings) c.visible = false; return; }
    if (S.unit !== u) { S.unit = u; S.yaw = player.yaw; S.pitch = player.pitch; S.shots = u.shots || 0; S.landN = u.landN || 0; }
    const d = (a, b, r) => a + (b - a) * (1 - Math.exp(-r * dt)), run = u.state === 'run', crouch = !!u.ctl.crouch, ground = !!u.grounded;
    S.t += dt; S.sprint = d(S.sprint, run ? 1 : 0, run ? 11 : 9); S.crouch = d(S.crouch, crouch ? 1 : 0, 10); S.move = d(S.move, ground ? clamp(u.moving || 0, 0, 1) : 0, 9); S.air = d(S.air, ground ? 0 : 1, 10);
    S.bob += dt * (run ? 10.4 : crouch ? 8.2 : 9.7) * clamp(u.moving || 0, 0, 1);
    // reload: exactly as long as the weapon's reload time
    const rl = u.reloadT > 0 ? reloadPose(1 - u.reloadT / WEAPONS.rifle.reload, _rl) : null; S.tilt = rl ? rl.tilt : d(S.tilt, 0, 14);
    const ads = S.ads = clamp(player.zoom, 0, 1) * (1 - S.sprint) * (1 - S.tilt), hip = 1 - ads, hipS = lerp(1, 0.22, ads);
    // shots and landings since the last frame
    const sh = u.shots || 0;
    if (sh !== S.shots) {
      if (sh > S.shots) { S.kz = Math.min(0.05, S.kz + 0.017 * lerp(1, 0.6, ads)); S.kp = Math.min(0.07, S.kp + 0.02 * lerp(1, 0.5, ads)); S.ky += (Math.random() - 0.5) * 0.014 * hipS; S.kr += (Math.random() - 0.5) * 0.035; S.flashT = 0.05; flash.rotation.z = Math.random() * 6.28; flash.scale.setScalar(0.7 + Math.random() * 0.6); if (!fast) eject(); }
      S.shots = sh;
    }
    if ((u.landN || 0) !== S.landN) { S.landN = u.landN; S.landV -= clamp((u.landV || 0) * 0.25, 0.3, 2.6); }
    if (dt > 0) {
      S.kz *= Math.exp(-16 * dt); S.kp *= Math.exp(-12 * dt); S.ky *= Math.exp(-10 * dt); S.kr *= Math.exp(-10 * dt);
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n; for (let i = 0; i < n; i++) { S.landV += (-190 * S.landY - 21 * S.landV) * h; S.landY += S.landV * h; }
      // the rifle trails the view a little when the mouse moves, then settles
      S.lagX = clamp(S.lagX + wrapPi(player.yaw - S.yaw) * 0.4, -0.075, 0.075) * Math.exp(-9 * dt); S.lagY = clamp(S.lagY + (player.pitch - S.pitch) * 0.4, -0.06, 0.06) * Math.exp(-9 * dt);
      // the deck leaning under the feet
      let lean = 0; if (u.on && u.on.quat) { _v.set(0, 1, 0).applyQuaternion(u.on.quat); lean = -(_v.x * Math.cos(player.yaw) - _v.z * Math.sin(player.yaw)); }
      S.deck = d(S.deck, clamp(lean * 0.7, -0.07, 0.07), 3);
    }
    S.yaw = player.yaw; S.pitch = player.pitch;

    // ---- where the rifle is, in camera space ----
    const s = S.sprint, t = S.t, c = S.crouch * hip, low = 1 - sm(S.vis);
    _p.lerpVectors(HIP, ADS, sm(ads));
    let rx = 0.02 * hip, ry = 0.04 * hip, rz = 0;
    _p.x += -0.05 * s - 0.008 * c; _p.y += -0.045 * s - 0.014 * c; _p.z += 0.04 * s; rx += -0.2 * s; ry += 0.62 * s; rz += 0.2 * s - 0.05 * c; // sprint: tilted and lowered. crouch: tucked in
    _p.y += Math.sin(t * 1.7) * 0.0022 * hipS; _p.x += Math.sin(t * 0.85) * 0.0016 * hipS; rx += Math.sin(t * 1.7 + 0.8) * 0.0035 * hipS; ry += Math.sin(t * 0.85 + 1) * 0.003 * hipS; // breathing
    const bx = lerp(0.0055, 0.02, s) * (1 - 0.35 * S.crouch) * hipS * S.move, by = lerp(0.0045, 0.015, s) * (1 - 0.35 * S.crouch) * hipS * S.move; // steps
    _p.x += Math.sin(S.bob) * bx; _p.y += -Math.abs(Math.cos(S.bob)) * by * 1.6 + by * 0.8; rz += Math.sin(S.bob) * bx * 2.2; rx += Math.cos(S.bob * 2) * by * 1.5; ry += Math.sin(S.bob) * bx * 1.2 * s * 3;
    _p.y += (0.02 + clamp(-(u.vy || 0) * 0.002, -0.015, 0.02)) * S.air * hipS + S.landY; rx += 0.05 * S.air * hip + S.landY * 1.4; // jump, fall, landing dip
    ry -= S.lagX; _p.x -= S.lagX * 0.1; rx -= S.lagY; _p.y -= S.lagY * 0.08; // look lag
    rz += S.deck; _p.x += S.deck * 0.06; // deck roll
    _p.z += S.kz; _p.y += S.kz * 0.12 * hip; rx += S.kp; ry += S.ky; rz += S.kr; // recoil
    const tl = S.tilt; rz -= 0.5 * tl; rx += 0.3 * tl; ry += 0.12 * tl; _p.y += 0.03 * tl; _p.x -= 0.03 * tl; // canted for the magazine change
    _p.y -= 0.32 * low; _p.x += 0.04 * low; rx -= 0.8 * low; // raised / lowered
    _v.copy(_p).sub(HIP); arms.position.set(ARMS.x + _v.x * 0.45, ARMS.y + Math.min(0, _v.y) * 0.45, ARMS.z + _v.z * 0.45); // the shoulders follow the rifle a little, but never rise into view
    rifle.position.copy(_p).sub(arms.position); rifle.quaternion.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    const mg = rifle.userData.mag;
    if (rl) { _lh.set(rl.lx, rl.ly, rl.lz); mg.visible = !rl.mag; mg.position.set(rl.mx, rl.my, -0.105 + rl.mz); } else { _lh.set(0, 0, 0); mg.visible = true; mg.position.set(0, 0, -0.105); }
    holdRifle(arms, rifle, _lh, rl ? lerp(0.85, 0.7, rl.grab) : 0.85, 1);

    // muzzle flash and spent cases
    S.flashT -= dt; flash.visible = S.flashT > 0;
    if (flash.visible && !fast) { rifle.updateWorldMatrix(true, false); flashLight.position.copy(rifle.userData.muzzle).applyMatrix4(rifle.matrixWorld); flashLight.intensity = 5; } else flashLight.intensity = 0;
    for (const m of casings) { const k = m.userData; if (k.life <= 0) { m.visible = false; continue; } k.life -= dt; k.v.y -= 9.8 * dt; m.position.addScaledVector(k.v, dt); m.rotation.x += k.w.x * dt; m.rotation.y += k.w.y * dt; m.rotation.z += k.w.z * dt; }

    // light like the world: sun and sky brought into the camera's frame
    const wc = gfx.camera; _q.copy(wc.quaternion).invert();
    sun.position.copy(gfx.sunDir).applyQuaternion(_q); sun.color.copy(gfx.sun.color); sun.intensity = gfx.sun.intensity;
    hemi.color.copy(gfx.hemi.color); hemi.groundColor.copy(gfx.hemi.groundColor); hemi.intensity = gfx.hemi.intensity; hemi.position.set(0, 1, 0).applyQuaternion(_q);
    scene.environment = gfx.scene.environment; scene.environmentIntensity = gfx.scene.environmentIntensity;
    const er = scene.environmentRotation; er.setFromQuaternion(wc.quaternion, 'XYZ'); er.set(-er.x, -er.y, -er.z, 'XYZ');
    const fov = lerp(58, 46, sm(ads)), asp = gfx.w / gfx.h;
    if (Math.abs(cam.fov - fov) > 0.02 || Math.abs(cam.aspect - asp) > 1e-4) { cam.fov = fov; cam.aspect = asp; cam.updateProjectionMatrix(); }
  },
  render(gfx) {
    if (!show || !arms) return;
    const r = gfx.renderer, ac = r.autoClear; r.autoClear = false; r.clearDepth(); r.render(scene, cam); r.autoClear = ac;
  },
};
