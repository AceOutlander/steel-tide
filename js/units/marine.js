// Jointed soldier model (marines, gunners, pilots) and its procedural animation: idle, walk, run, aim, crouch, swim, sit.
import * as THREE from 'three';
import { MAT } from '../gfx/materials.js';

const G = {};
function geos() {
  if (G.torso) return G;
  G.torso = new THREE.CapsuleGeometry(0.17, 0.32, 3, 8); G.torso.scale(1.15, 1, 0.8);
  G.vest = new THREE.BoxGeometry(0.42, 0.4, 0.3);
  G.hip = new THREE.BoxGeometry(0.36, 0.2, 0.24);
  G.head = new THREE.SphereGeometry(0.115, 10, 8);
  G.helmet = new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  G.uleg = new THREE.CapsuleGeometry(0.085, 0.3, 3, 6); G.uleg.translate(0, -0.22, 0);
  G.lleg = new THREE.CapsuleGeometry(0.07, 0.3, 3, 6); G.lleg.translate(0, -0.22, 0);
  G.boot = new THREE.BoxGeometry(0.11, 0.1, 0.26); G.boot.translate(0, -0.45, -0.05);
  G.uarm = new THREE.CapsuleGeometry(0.06, 0.2, 3, 6); G.uarm.translate(0, -0.15, 0);
  G.larm = new THREE.CapsuleGeometry(0.05, 0.2, 3, 6); G.larm.translate(0, -0.14, 0);
  G.hand = new THREE.SphereGeometry(0.05, 6, 5); G.hand.translate(0, -0.3, 0);
  G.rifleBody = new THREE.BoxGeometry(0.05, 0.11, 0.55); G.rifleBarrel = new THREE.CylinderGeometry(0.014, 0.014, 0.4, 5); G.rifleBarrel.rotateX(Math.PI / 2); G.rifleBarrel.translate(0, 0.02, -0.45);
  G.rifleMag = new THREE.BoxGeometry(0.04, 0.18, 0.08); G.rifleMag.translate(0, -0.12, -0.05); G.rifleStock = new THREE.BoxGeometry(0.045, 0.12, 0.25); G.rifleStock.translate(0, -0.02, 0.38);
  G.pack = new THREE.BoxGeometry(0.3, 0.36, 0.14);
  return G;
}
const mesh = (g, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
const grp = (parent, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };

// opts: { rifle: true, role: 'marine'|'crew'|'pilot'|'deck' }
export function buildSoldier(nation, opts = {}) {
  const g = geos(), root = new THREE.Group(), uni = MAT.uniform[nation], role = opts.role || 'marine';
  const body = grp(root, 0, 0.95, 0); // hips pivot
  mesh(g.hip, uni, body, 0, 0, 0);
  const torso = grp(body, 0, 0.08, 0);
  mesh(g.torso, uni, torso, 0, 0.3, 0);
  mesh(g.vest, role === 'deck' ? MAT.yellow : role === 'crew' ? MAT.orange : MAT.vest[nation], torso, 0, 0.3, 0);
  if (role === 'marine') mesh(g.pack, MAT.vest[nation], torso, 0, 0.32, 0.2);
  const head = grp(torso, 0, 0.66, 0);
  mesh(g.head, MAT.skin, head, 0, 0.02, 0);
  mesh(g.helmet, role === 'pilot' ? MAT.white : role === 'deck' ? MAT.yellow : MAT.helmet[nation], head, 0, 0.04, 0);
  const limb = (parent, x, y, ug, lg, mat, end) => { const u = grp(parent, x, y, 0); mesh(ug, mat, u); const l = grp(u, 0, ug === g.uleg ? -0.44 : -0.3, 0); mesh(lg, mat, l); mesh(end, end === g.boot ? MAT.boots : MAT.skin, l); return { u, l }; };
  const legL = limb(body, -0.1, -0.02, g.uleg, g.lleg, uni, g.boot), legR = limb(body, 0.1, -0.02, g.uleg, g.lleg, uni, g.boot);
  const armL = limb(torso, -0.27, 0.5, g.uarm, g.larm, uni, g.hand), armR = limb(torso, 0.27, 0.5, g.uarm, g.larm, uni, g.hand);
  let rifle = null;
  if (opts.rifle !== false && role === 'marine') { rifle = grp(torso, 0.12, 0.36, -0.3); mesh(g.rifleBody, MAT.rifle, rifle); mesh(g.rifleBarrel, MAT.rifle, rifle); mesh(g.rifleMag, MAT.rifle, rifle); mesh(g.rifleStock, MAT.rifle, rifle); }
  root.userData.rig = { body, torso, head, legL, legR, armL, armR, rifle };
  return root;
}

// state: 'idle' | 'walk' | 'run' | 'aim' | 'crouch' | 'swim' | 'sit' | 'gun'.  t: seconds, phase: per-soldier offset
export function animateSoldier(root, state, t, moving = 0, pitch = 0) {
  const r = root.userData.rig; if (!r) return;
  const { body, torso, head, legL, legR, armL, armR, rifle } = r;
  let hipY = 0.95, lean = 0, bodyRx = 0;
  const set = (limb, u, l) => { limb.u.rotation.x = u; limb.l.rotation.x = l; };
  armL.u.rotation.z = -0.12; armR.u.rotation.z = 0.12; armL.u.rotation.y = 0; armR.u.rotation.y = 0;
  if (state === 'swim') {
    const s = Math.sin(t * 3.2), c = Math.cos(t * 3.2);
    bodyRx = -1.25; hipY = 0.15; set(legL, s * 0.5, -0.3 - s * 0.2); set(legR, -s * 0.5, -0.3 + s * 0.2); set(armL, 2.6 + c * 0.7, 0.4); set(armR, 2.6 - c * 0.7, 0.4);
    head.rotation.x = 0.9; if (rifle) rifle.visible = false;
  } else if (state === 'sit') {
    hipY = 0.55; set(legL, 1.5, -1.5); set(legR, 1.5, -1.5); set(armL, 0.7, 0.5); set(armR, 0.7, 0.5); head.rotation.x = 0; if (rifle) rifle.visible = false;
  } else {
    if (rifle) rifle.visible = true;
    const run = state === 'run', walk = state === 'walk' || (moving > 0.2 && state !== 'run');
    const f = run ? 10.5 : 6.5, amp = run ? 0.95 : walk ? 0.55 : 0, s = Math.sin(t * f), c = Math.cos(t * f);
    const crouch = state === 'crouch' ? 1 : 0;
    hipY = 0.95 - crouch * 0.35 + Math.abs(c) * amp * 0.03; lean = run ? 0.22 : walk ? 0.06 : 0;
    const kn = crouch * 1.3;
    set(legL, s * amp + crouch * 1.0, -Math.max(0, -c) * amp * 1.1 - kn); set(legR, -s * amp + crouch * 1.0, -Math.max(0, c) * amp * 1.1 - kn);
    const aiming = state === 'aim' || state === 'gun' || state === 'crouch' || (rifle && !run);
    if (state === 'gun') { set(armL, 1.25, 0.25); set(armR, 1.25, 0.25); armL.u.rotation.z = 0.25; armR.u.rotation.z = -0.25; }
    else if (aiming && rifle) { set(armR, 1.05 + pitch * 0.6, 0.55); armR.u.rotation.z = -0.25; set(armL, 1.3 + pitch * 0.6, 0.2); armL.u.rotation.z = 0.55; rifle.rotation.x = pitch * 0.8; }
    else { set(armL, -s * amp * 0.8, 0.25 + amp * 0.5); set(armR, s * amp * 0.8, 0.25 + amp * 0.5); if (rifle) rifle.rotation.x = -0.5; }
    if (amp === 0 && !aiming) { const b = Math.sin(t * 1.3) * 0.03; set(armL, b, 0.15); set(armR, -b, 0.15); }
    head.rotation.x = -pitch * 0.4;
  }
  body.position.y = hipY; body.rotation.x = bodyRx; torso.rotation.x = lean + (state === 'crouch' ? 0.25 : 0);
}
