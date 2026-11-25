// Crew life on every ship: sailors walking the decks, standing watch on the bridge, handling the flight deck and manning
// the machine guns (the gunner turns with his gun). Drawn with instanced meshes; a simpler figure is used at a distance.
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { MAT } from '../gfx/materials.js';
import { world } from '../world/world.js';
import { rand, wrapPi, approachAngle } from '../core/util.js';
import { blocked } from './surface.js';

const MAX = 260;
const _m = new THREE.Matrix4(), _base = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _l = new THREE.Matrix4(), _e = new THREE.Euler(), _c = new THREE.Color();
const YA = new THREE.Vector3(0, 1, 0);
const COUNT = { patrol: 5, corvette: 9, battlecruiser: 16, carrier: 22, reconsub: 0, attacksub: 0 };
const UNIFORM = { aethia: 0x56677d, extro: 0x3a4a3d }, JERSEY = [0xd8b21e, 0x2f7d3a, 0xb5332a, 0x2a56a8, 0x7a3fa0, 0xdedede];
let parts = null, n = 0, k = 1;

function inst(geo, mat) { const m = new THREE.InstancedMesh(geo, mat, MAX); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; m.count = 0; gfx.scene.add(m); return m; }

export const crew = {
  init() {
    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const torso = new THREE.CapsuleGeometry(0.19, 0.3, 3, 6); torso.scale(1.1, 1, 0.75); torso.translate(0, 1.28, 0);
    const head = new THREE.SphereGeometry(0.115, 8, 6); head.translate(0, 1.72, 0);
    const helmet = new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55); helmet.translate(0, 1.74, 0);
    const leg = new THREE.CapsuleGeometry(0.08, 0.72, 2, 5); leg.translate(0, -0.46, 0);
    const arm = new THREE.CapsuleGeometry(0.055, 0.5, 2, 5); arm.translate(0, -0.3, 0);
    parts = { torso: inst(torso, cloth), head: inst(head, MAT.skin), helmet: inst(helmet, cloth), legL: inst(leg, cloth), legR: inst(leg, cloth), armL: inst(arm, cloth), armR: inst(arm, cloth) };
    for (const key of ['torso', 'helmet', 'legL', 'legR', 'armL', 'armR']) parts[key].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    gfx.onQuality((q) => { k = q.crew; }); k = gfx.q.crew;
  },
  // give a ship its people (called lazily the first time the ship comes near the camera)
  muster(ship) {
    const list = ship.crewList = [], m = ship.model, carrier = ship.type === 'carrier';
    for (const mt of ship.mounts) if (mt.key === 'mg') list.push({ gun: mt, x: 0, y: 0, z: 0, yaw: 0, t: rand(0, 9), walk: 0, col: UNIFORM[ship.nation], hat: 0x3a3f45 });
    const posts = m.posts || [];
    for (const p of posts) list.push({ x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0, home: p, t: rand(0, 9), walk: 0, wait: p.kind === 'bridge' ? 1e9 : rand(4, 30), col: p.kind === 'flight' ? JERSEY[Math.floor(rand(0, 6))] : p.kind === 'bridge' ? 0xe8e8e0 : UNIFORM[ship.nation], hat: p.kind === 'flight' ? JERSEY[Math.floor(rand(0, 6))] : 0xe0e0e0, tx: p.x, tz: p.z });
    const extra = Math.max(0, (COUNT[ship.type] || 0) - posts.length);
    for (let i = 0; i < extra; i++) { const d = m.decks[Math.floor(rand(0, m.decks.length))]; if (!d) break; const x = rand(d.x0 + 1, d.x1 - 1), z = rand(d.z0 + 1, d.z1 - 1); if (blocked(ship, x, d.y, z)) continue; list.push({ x, y: d.y, z, yaw: rand(0, 6), deck: d, t: rand(0, 9), walk: 0, wait: rand(1, 12), col: carrier ? JERSEY[Math.floor(rand(0, 6))] : UNIFORM[ship.nation], hat: carrier ? JERSEY[Math.floor(rand(0, 6))] : 0x3a3f45, tx: x, tz: z }); }
  },
  put(mesh, mat, i, color) { mesh.setMatrixAt(i, mat); if (color !== undefined && mesh.instanceColor) { _c.setHex(color); mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b); } },
  update(dt, cam) {
    if (!parts) return; n = 0; let nArms = 0;
    for (const s of world.units) {
      if (s.kind !== 'ship' || !s.alive || s.camDist - s.radius > 650) continue;
      if (!s.crewList) this.muster(s);
      _base.compose(s.pos, s.quat, _s);
      const list = s.crewList, show = Math.ceil(list.length * Math.min(1, k)), close = s.camDist - s.radius < 260;
      for (let i = 0; i < list.length; i++) {
        const c = list[i]; c.t += dt; let pose = 0; // 0 stand, 1 walk, 2 gun
        if (c.gun) { const t = c.gun.t, y = t.rest + t.yaw; if (c.gun.manned) continue; _p.copy(t.gunner).applyAxisAngle(YA, y).add(t.node.position); c.x = _p.x; c.y = _p.y; c.z = _p.z; c.yaw = y; pose = 2; }
        else if (c.wait < 1e8) {
          // amble to a new spot on the same deck now and then
          const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
          if (d > 0.3) { const want = Math.atan2(-dx, -dz); c.yaw = approachAngle(c.yaw, want, dt * 4); const sp = 1.5 * dt, nx = c.x + (dx / d) * sp, nz = c.z + (dz / d) * sp; if (blocked(s, nx, c.y, nz, 0)) { c.tx = c.x; c.tz = c.z; } else { c.x = nx; c.z = nz; } pose = 1; }
          else { c.wait -= dt; if (c.wait <= 0) { c.wait = rand(5, 25); const dk = c.deck || s.model.decks.find((q) => c.x >= q.x0 && c.x <= q.x1 && c.z >= q.z0 && c.z <= q.z1 && Math.abs(q.y - c.y) < 0.5); if (dk) { c.deck = dk; const r = c.home ? 9 : 30; c.tx = Math.min(dk.x1 - 0.8, Math.max(dk.x0 + 0.8, (c.home ? c.home.x : c.x) + rand(-r, r))); c.tz = Math.min(dk.z1 - 0.8, Math.max(dk.z0 + 0.8, (c.home ? c.home.z : c.z) + rand(-r, r))); } } }
        }
        if (i >= show && !c.gun) continue; if (n >= MAX) break;
        // body matrix = ship * translate(local) * rotY(yaw)
        _p.set(c.x, c.y, c.z); _q.setFromAxisAngle(YA, c.yaw); _l.compose(_p, _q, _s); _m.multiplyMatrices(_base, _l);
        this.put(parts.torso, _m, n, c.col); this.put(parts.head, _m, n); this.put(parts.helmet, _m, n, c.hat);
        const sw = pose === 1 ? Math.sin(c.t * 6.5) * 0.6 : 0;
        const limb = (mesh, x, y, rx, rz, idx, col) => { _p.set(x, y, 0); _e.set(rx, 0, rz); _q.setFromEuler(_e); _l.compose(_p, _q, _s); _l.premultiply(_m); this.put(mesh, _l, idx, col); };
        limb(parts.legL, -0.1, 0.92, sw, 0, n, 0x2c3440); limb(parts.legR, 0.1, 0.92, -sw, 0, n, 0x2c3440);
        if (close) { const ar = pose === 2 ? 1.3 : pose === 1 ? -sw * 0.8 : 0.05; limb(parts.armL, -0.27, 1.5, pose === 2 ? 1.3 : ar, pose === 2 ? 0.3 : -0.08, nArms, c.col); limb(parts.armR, 0.27, 1.5, pose === 2 ? 1.3 : -ar, pose === 2 ? -0.3 : 0.08, nArms, c.col); nArms++; }
        n++;
      }
    }
    for (const key in parts) { const p = parts[key], cnt = key === 'armL' || key === 'armR' ? nArms : n; p.count = cnt; p.instanceMatrix.needsUpdate = true; if (p.instanceColor) p.instanceColor.needsUpdate = true; }
  },
};
