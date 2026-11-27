// Crew life on every ship, drawn with the new human figure (js/units/v2/human.js). Same interface as js/sim/crew.js.
// A skinned figure cannot be instanced, so a crowd is drawn three ways, nearest first:
//   1. the few people closest to the camera are real animated figures taken from a small pool,
//   2. everyone else nearby is an instance of a baked pose (stand, six walk frames, watch, signals, deck work, gun),
//   3. far away, instances of a much simpler baked figure.
// Each instance carries its own colour (uniform or flight-deck jersey). Feet are placed on the deck in the ship's own frame, so
// they stay planted as it rolls, and everyone gets a soft contact shadow. Fast Graphics shows fewer people and simpler levels sooner.
import * as THREE from 'three';
import { gfx } from '../../gfx/renderer.js';
import { world } from '../../world/world.js';
import { rand, approachAngle } from '../../core/util.js';
import { blocked, slide } from '../surface.js';
import { buildSoldier, animateSoldier, bakeFigure, JERSEY, JERSEY_KEYS, NATION_KIT } from '../../units/v2/human.js';
import { kit, blobGeometry } from '../../units/v2/humankit.js';

const MAX = 260, TWO_PI = Math.PI * 2, WALK_FRAMES = 6;
const _m = new THREE.Matrix4(), _base = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _l = new THREE.Matrix4(), _c = new THREE.Color(), _w = new THREE.Vector3();
const YA = new THREE.Vector3(0, 1, 0);
const _mv = { x: 0, z: 0 }, _bt = { ship: null, fn: (x, y, z, pad) => blocked(_bt.ship, x, y, z, pad) };
const COUNT = { patrol: 5, corvette: 9, battlecruiser: 16, carrier: 30, reconsub: 0, attacksub: 0 };
// flight-deck jobs: who directs aircraft, who kneels at the gear, how common each colour is
const JOBS = ['yellow', 'yellow', 'green', 'green', 'blue', 'blue', 'red', 'brown', 'purple', 'white'];
// baked poses: name -> how to pose the figure once
const POSE = { stand: { state: 'stand', t: 1.2 }, watch: { state: 'watch', t: 2 }, gun: { state: 'gun', t: 1 }, work: { state: 'work', t: 0.4 }, sigA: { state: 'signal', t: 1.5 }, sigB: { state: 'signal', t: 1.8 }, sigC: { state: 'signal', t: 2.1 }, sigD: { state: 'signal', t: 2.4 }, sigOut: { state: 'signal', t: 6.4 }, sigStop: { state: 'signal', t: 9.2 } };
for (let i = 0; i < WALK_FRAMES; i++) POSE['walk' + i] = { state: 'patrol', t: 1, phase: (i / WALK_FRAMES) * TWO_PI, moving: 1 };
const SIG = ['sigD', 'sigA', 'sigB', 'sigC']; // one wave of the forearms: rising, up, falling, down
const FAR = { stand: 'stand', gun: 'gun', watch: 'stand', work: 'stand', sigOut: 'stand', sigStop: 'stand' }; // the simple figure keeps only a few poses

let ready = false, k = 1, nReal = 0, lodK = 1, blobs = null, nBlob = 0;
const meshes = new Map(), queue = [], pool = new Map(), cands = [];

function bake(job) {
  const P = POSE[job.pose], role = job.variant, { geo } = bakeFigure(job.nation, { role }, P.state, { lod: job.far ? 2 : 1, t: P.t, phase: P.phase, moving: P.moving || 0 });
  const m = new THREE.InstancedMesh(geo, kit.crowd(), job.far ? MAX : 72);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = !job.far; m.count = 0; m.visible = false; m.setColorAt(0, _c.set(0xffffff)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  gfx.scene.add(m); meshes.set(job.key, m);
}
// the instanced mesh for a baked pose, or null while it is still waiting to be baked (a couple are made per frame)
function meshFor(nation, variant, pose, far) {
  const key = (variant === 'sailor' ? '' : nation) + '|' + variant + '|' + pose + (far ? '|far' : '');
  const m = meshes.get(key);
  if (m === undefined) { meshes.set(key, null); queue.push({ key, nation, variant, pose, far }); return null; }
  return m;
}
function put(mesh, mat, col) { if (!mesh || mesh.count >= mesh.instanceMatrix.count) return false; const i = mesh.count++; mesh.setMatrixAt(i, mat); _c.setHex(col); mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b); return true; }
function blob(mat) { if (nBlob >= MAX) return; _l.makeScale(0.95, 1, 0.95); _l.elements[13] = 0.02; _l.premultiply(mat); blobs.setMatrixAt(nBlob++, _l); }

const _sz = new THREE.Vector3(1, 1, 1);
export const crew = {
  init() {
    blobs = new THREE.InstancedMesh(blobGeometry(), kit.blob(), MAX); blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blobs.frustumCulled = false; blobs.count = 0; blobs.renderOrder = 2; gfx.scene.add(blobs);
    const q = (Q) => { k = Q.crew; lodK = Q.lod; nReal = Math.max(0, Math.round((Q.crew - 0.3) * 8)); };
    gfx.onQuality(q); q(gfx.q); ready = true;
  },
  // give a ship its people (called lazily the first time the ship comes near the camera)
  muster(ship) {
    const list = ship.crewList = [], m = ship.model, carrier = ship.type === 'carrier', N = NATION_KIT[ship.nation];
    const person = (o) => { const hgt = rand(0.955, 1.045), c = { x: 0, y: 0, z: 0, yaw: 0, hgt, wid: hgt * rand(0.965, 1.045), t: rand(0, 20), ph: rand(0, 6), wait: 1e9, tx: 0, tz: 0, variant: 'sailor', jersey: '', col: N.work, idle: 'stand', pose: 'stand', m: new THREE.Matrix4(), d: 0, ...o }; c.tx = c.x; c.tz = c.z; if (c.wait < 1e8) this.settle(c); list.push(c); return c; };
    const deckHand = (o) => { const j = JOBS[Math.floor(rand(0, JOBS.length))]; return person({ variant: 'deck', jersey: j, col: JERSEY[j], ...o }); };
    for (const mt of ship.mounts) if (mt.key === 'mg') person({ gun: mt, variant: 'gunner' });
    const posts = m.posts || []; let nb = 0;
    for (const p of posts) {
      const o = { x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0, home: p, in: p.in };
      if (p.kind === 'flight') deckHand({ ...o, wait: rand(4, 30) });
      else if (p.kind === 'bridge') { const off = nb++ % 3 === 0; person({ ...o, officer: off, col: off ? N.khaki : N.work }); }
      else if (p.kind === 'lookout') person({ ...o, variant: 'lookout', idle: 'watch' });
      else if (p.kind === 'work') person({ ...o, idle: 'work' });                               // kneeling at a machine
      else person({ ...o, wait: rand(4, 30) });
    }
    const extra = Math.max(0, (COUNT[ship.type] || 0) - posts.length);
    for (let i = 0; i < extra; i++) {
      const d = m.decks[Math.floor(rand(0, m.decks.length))]; if (!d) break;
      const x = rand(d.x0 + 1, d.x1 - 1), z = rand(d.z0 + 1, d.z1 - 1); if (blocked(ship, x, d.y, z)) continue;
      const o = { x, y: d.y, z, yaw: rand(0, 6), deck: d, wait: rand(1, 12) };
      if (carrier) deckHand(o); else person(o);
    }
  },
  // what a person does once they stop walking: directors signal, maintainers kneel at the gear now and then, the rest stand
  settle(c) {
    if (c.variant !== 'deck') { c.idle = 'stand'; return; }
    const r = Math.random();
    c.idle = c.jersey === 'yellow' ? (r < 0.75 ? 'signal' : 'stand') : c.jersey === 'green' || c.jersey === 'purple' || c.jersey === 'red' || c.jersey === 'brown' ? (r < 0.4 ? 'work' : 'stand') : 'stand';
    c.sigT = 0;
  },
  // the baked frame that shows what this person is doing now
  frame(c) {
    if (c.gun) return 'gun';
    if (c.walk) return 'walk' + (Math.floor(((c.ph % TWO_PI) / TWO_PI) * WALK_FRAMES) % WALK_FRAMES);
    if (c.idle === 'signal') { const T = c.t % 11; return T < 0.3 ? 'stand' : T < 4.8 ? SIG[Math.floor((c.t * 5.2 + Math.PI / 4) / (Math.PI / 2)) % 4] : T < 5.2 ? 'stand' : T < 7.8 ? 'sigOut' : T < 8.2 ? 'stand' : T < 10.4 ? 'sigStop' : 'stand'; }
    return c.idle === 'watch' ? 'watch' : c.idle === 'work' ? 'work' : 'stand';
  },
  draw(c, ship) {
    const far = c.d > Math.max(30, 48 * lodK), f = this.frame(c), pose = far ? (c.walk ? (f === 'walk1' || f === 'walk2' || f === 'walk3' ? 'walk1' : 'walk4') : FAR[f] || 'stand') : f;
    const mesh = meshFor(ship.nation, c.variant, pose, far) || meshFor(ship.nation, c.variant, 'stand', far);
    if (put(mesh, c.m, c.col) && c.d < 140) blob(c.m);
  },
  real(c, ship) {
    const key = ship.nation + '|' + (c.officer ? 'officer' : c.variant) + '|' + c.jersey; let p = pool.get(key); if (!p) pool.set(key, (p = { figs: [], n: 0 }));
    let fig = p.figs[p.n];
    if (!fig) { fig = buildSoldier(ship.nation, { role: c.officer ? 'officer' : c.variant, jersey: c.jersey || undefined }); fig.matrixAutoUpdate = false; fig.userData.rig2.seed = 0; gfx.scene.add(fig); p.figs.push(fig); }
    p.n++; fig.visible = true; fig.matrix.copy(c.m); fig.matrixWorldNeedsUpdate = true;
    const state = c.gun ? 'gun' : c.walk ? 'patrol' : c.idle, snap = fig.userData.who !== c; fig.userData.who = c;
    animateSoldier(fig, state, c.t, c.walk ? 1 : 0, 0, snap ? { dist: c.d, snap: true, phase: c.ph } : { dist: c.d, phase: c.ph });
  },
  update(dt, cam) {
    if (!ready) return;
    for (let i = 0; i < 2 && queue.length; i++) bake(queue.shift());
    for (const m of meshes.values()) if (m) m.count = 0;
    for (const p of pool.values()) p.n = 0;
    nBlob = 0; cands.length = 0; let n = 0;
    for (const s of world.units) {
      if (s.kind !== 'ship' || !s.alive || s.camDist - s.radius > 650) continue;
      if (!s.crewList) this.muster(s);
      _base.compose(s.pos, s.quat, _s);
      const list = s.crewList, show = Math.ceil(list.length * Math.min(1, k));
      for (let i = 0; i < list.length; i++) {
        const c = list[i]; if (c.in && !s.interiorOn) continue; // people inside are only worked out while the interior is being drawn
        c.t += dt; c.walk = false;
        if (c.gun) { const t = c.gun.t, y = t.rest + t.yaw; if (c.gun.manned) continue; _p.copy(t.gunner).applyAxisAngle(YA, y).add(t.node.position); c.x = _p.x; c.y = _p.y; c.z = _p.z; c.yaw = y; }
        else if (c.wait < 1e8) {
          // amble to a new spot on the same deck now and then
          const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
          if (d > 0.3) {
            const want = Math.atan2(-dx, -dz); c.yaw = approachAngle(c.yaw, want, dt * 4); const sp = 1.5 * dt, nx = c.x + (dx / d) * sp, nz = c.z + (dz / d) * sp;
            let ok = !blocked(s, nx, c.y, nz, 0), mx = nx, mz = nz;
            if (!ok) { _bt.ship = s; slide(_bt.fn, c.x, c.z, nx, nz, c.y, _mv); mx = _mv.x; mz = _mv.z; ok = Math.hypot(mx - c.x, mz - c.z) > sp * 0.3; } // slide along a turret or a wall; stop if that gets nowhere
            if (!ok) { c.tx = c.x; c.tz = c.z; this.settle(c); } else { c.x = mx; c.z = mz; c.walk = true; c.ph += dt * 8.3; if (d - sp <= 0.3) this.settle(c); }
          } else {
            c.wait -= dt;
            if (c.wait <= 0) {
              c.wait = rand(6, 28);
              const dk = c.deck || s.model.decks.find((q) => c.x >= q.x0 && c.x <= q.x1 && c.z >= q.z0 && c.z <= q.z1 && Math.abs(q.y - c.y) < 0.5);
              if (dk) { c.deck = dk; const r = c.home ? 9 : 30; c.tx = Math.min(dk.x1 - 0.8, Math.max(dk.x0 + 0.8, (c.home ? c.home.x : c.x) + rand(-r, r))); c.tz = Math.min(dk.z1 - 0.8, Math.max(dk.z0 + 0.8, (c.home ? c.home.z : c.z) + rand(-r, r))); }
            }
          }
        }
        if (i >= show && !c.gun) continue; if (n >= MAX) break; n++;
        // body matrix = ship * translate(local) * rotY(yaw): the feet sit on the deck plane whatever the ship is doing
        _p.set(c.x, c.y, c.z); _q.setFromAxisAngle(YA, c.yaw); _l.compose(_p, _q, _sz.set(c.wid, c.hgt, c.wid)); c.m.multiplyMatrices(_base, _l); // people are not all one size
        c.d = _w.setFromMatrixPosition(c.m).distanceTo(cam); c.ship = s;
        if (nReal > 0 && c.d < 24) cands.push(c); else this.draw(c, s);
      }
    }
    if (cands.length > nReal) cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cands.length; i++) { const c = cands[i]; if (i < nReal) this.real(c, c.ship); else this.draw(c, c.ship); }
    for (const m of meshes.values()) if (m) { m.visible = m.count > 0; if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } }
    for (const p of pool.values()) for (let i = p.n; i < p.figs.length; i++) p.figs[i].visible = false;
    blobs.count = nBlob; blobs.visible = nBlob > 0; blobs.instanceMatrix.needsUpdate = true;
  },
};
