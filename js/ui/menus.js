// Menus: title, nation select, the 3D unit showroom, settings (with key remapping), how to play, pause, notices.
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { audio } from '../audio/audio.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { NATIONS, UNITS, UNIT_ORDER, WEAPONS, QUALITY, DEFAULT_KEYS, KEY_LABELS, VERSION, otherNation } from '../core/config.js';
import { el, KTS } from '../core/util.js';
import { world } from '../world/world.js';
import { BUILDERS } from '../sim/factory.js';
import { battle } from '../world/battle.js';
import { buildSoldier, animateSoldier } from '../units/marine.js';

let app = null, root = null, cur = null, stack = [];
let nation = 'aethia', unit = 'patrol', startDock = false, opts = {};
const show = { scene: null, cam: null, model: null, angle: 0, t: 0, cache: {} };

const insignia = (n) => n === 'aethia'
  ? '<svg class="insig" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1d4f8f"/><circle cx="50" cy="50" r="31" fill="#f4f7fa"/><circle cx="50" cy="50" r="14" fill="#1d4f8f"/></svg>'
  : '<svg class="insig" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1b2420"/><path d="M18 58 50 26l32 32-9 9-23-23-23 23z" fill="#d8321e"/><path d="M27 76 50 53l23 23-8 8-15-15-15 15z" fill="#f08a1c"/></svg>';
const fastRow = () => `<div class="fastrow"><button class="switch" role="switch" data-fast aria-checked="${save.settings.fast}" aria-label="Fast Graphics"></button><div><b>Fast Graphics</b><span>For older laptops and PCs without a graphics card. Takes effect at once.</span></div></div>`;
const keyName = (c) => (c || '').replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Escape', 'Esc');

const SCREENS = {
  title: () => `<div class="screen dim"><div class="title-col">
      <div class="logo">STEEL<br>TIDE<small>MODERN NAVAL WARFARE</small></div>
      <div class="menu"><button class="btn primary" data-go="nation">Play</button><button class="btn" data-go="settings">Settings</button><button class="btn" data-go="howto">How to Play</button></div>
      ${fastRow()}
      <a class="homelink" href="/">← Back to HunterAceDev</a>
    </div><div class="ver">${VERSION} · PC · keyboard &amp; mouse</div></div>`,
  nation: () => `<div class="screen center"><div><div class="topbar" style="position:static;margin-bottom:1.5em"><h1>Choose your nation</h1><button class="btn small" data-back>Back</button></div>
      <div class="nations">${['aethia', 'extro'].map((n) => `<button class="nation-card" data-nation="${n}">${insignia(n)}<h3 style="color:${NATIONS[n].color}">${NATIONS[n].name}</h3><p>${NATIONS[n].blurb}</p></button>`).join('')}</div>
      <p style="color:var(--dim);margin-top:1.4em;text-align:center">Both nations field the same twelve unit types with identical performance. Only the look and the names differ.</p></div></div>`,
  units: () => {
    const cats = ['Surface', 'Subsurface', 'Air', 'On Foot'], N = NATIONS[nation];
    return `<div class="screen"><div class="topbar"><h1 style="color:${N.color}">${N.name} · choose your unit</h1>${opts.redeploy ? '' : '<button class="btn small" data-back>Back</button>'}</div>
      ${opts.redeploy ? `<div class="redeploy-banner">${opts.change ? 'Change unit' : opts.next ? (battle.lastWinner === nation ? 'Victory! The enemy carrier is sunk. A new battle begins' : battle.lastWinner ? 'Defeat. Our carrier is lost. A new battle begins' : 'New battle') : 'Unit lost. Redeploy'}</div>` : ''}
      <div class="unitsel"><div class="unitlist">${cats.map((c) => `<h4>${c}</h4>${UNIT_ORDER.filter((k) => UNITS[k].cat === c).map((k) => `<button class="unitbtn${k === unit ? ' on' : ''}" data-unit="${k}">${UNITS[k].label}<small>${N.classes[k]}</small></button>`).join('')}`).join('')}
        ${opts.redeploy ? '<button class="btn small" data-menu style="margin-top:1em;width:100%">Main menu</button>' : ''}</div><div></div><div class="unitinfo" id="unitinfo"></div></div></div>`;
  },
  settings: () => {
    const s = save.settings, q = s.quality;
    const slider = (id, label, min, max, step, val, fmt) => `<div class="row"><label>${label}</label><span><input type="range" data-set="${id}" min="${min}" max="${max}" step="${step}" value="${val}"> <span class="val" id="v-${id}">${fmt(val)}</span></span></div>`;
    return `<div class="screen center"><div class="panel" style="width:46em"><h2>Settings</h2>
      <h3>Graphics</h3>
      <div class="row"><label>Fast Graphics<br><small style="color:var(--dim)">No shadows or effects, simpler water, lower resolution</small></label><button class="switch" role="switch" data-fast aria-checked="${s.fast}" aria-label="Fast Graphics"></button></div>
      <div class="row"><label>Quality <small style="color:var(--dim)" id="q-note"></small></label><div class="seg" id="q-seg">${['auto', 'low', 'medium', 'high', 'ultra'].map((k) => `<button data-q="${k}" class="${q === k ? 'on' : ''}">${k === 'auto' ? 'Auto' : QUALITY[k].label}</button>`).join('')}</div></div>
      ${slider('resScale', 'Render resolution', 0.5, 1.5, 0.05, s.resScale, (v) => Math.round(v * 100) + '%')}
      ${slider('fov', 'Field of view', 55, 100, 1, s.fov, (v) => v + '°')}
      <h3>Controls</h3>
      ${slider('sens', 'Mouse sensitivity', 0.3, 3, 0.05, s.sens, (v) => Number(v).toFixed(2))}
      <div class="row"><label>Invert Y</label><button class="switch" role="switch" data-toggle="invertY" aria-checked="${s.invertY}" aria-label="Invert Y"></button></div>
      <h3>Sound</h3>
      ${slider('sfx', 'Sound volume', 0, 1, 0.05, s.sfx, (v) => Math.round(v * 100) + '%')}
      ${slider('music', 'Music volume', 0, 1, 0.05, s.music, (v) => Math.round(v * 100) + '%')}
      <h3>Keys <small style="color:var(--dim);text-transform:none;letter-spacing:0">click a key, then press the new one</small></h3>
      <div class="keys">${Object.keys(KEY_LABELS).map((a) => `<span>${KEY_LABELS[a]}</span><button class="kb" data-key="${a}">${save.keysFor(a).map(keyName).join(' / ')}</button>`).join('')}</div>
      <div class="actions"><button class="btn small" data-resetkeys>Reset keys</button><button class="btn primary" data-back>Done</button></div></div></div>`;
  },
  howto: () => `<div class="screen center"><div class="panel"><h2>How to Play</h2><div class="howto">
      <div><h3>The battle</h3><p>Two fleets meet in one sea. <b>Sink the enemy carrier to win</b>; lose yours and the battle is lost. Your side's ships, aircraft, submarines and marines fight alongside you the whole time.</p><p>If your unit is destroyed you pick a new one and go straight back in.</p>
        <h3>Everywhere</h3><p><b>Mouse</b> look and aim · <b>Left click</b> fire · <b>Right click</b> zoom · <b>Wheel / 1-4</b> weapons</p><p><b>E</b> get in or out, take a gun · <b>V</b> camera · <b>Tab</b> score and map · <b>Esc</b> pause</p>
        <h3>Ships</h3><p><b>W / S</b> throttle (it stays where you set it) · <b>A / D</b> rudder. Ships gather way slowly and turn wide: plan ahead.</p><p>Aim with the mouse and the turrets follow. AA guns and SAM launchers are worked by the crew.</p><p><b>Battlecruiser:</b> <b>U</b> boards the submarine in the stern dock and launches it.</p></div>
      <div><h3>Submarines</h3><p><b>R / F</b> (or Space / Ctrl) rise and dive · <b>P</b> periscope (works at periscope depth, about 13 m) · <b>Q</b> active sonar ping: shows contacts but gives your position away.</p><p>Attack sub: <b>Left click</b> fires a torpedo along your heading; aim at a ship to give it a target. Surface astern of your battlecruiser and press <b>E</b> to dock.</p>
        <h3>Jets</h3><p>On the catapult hold <b>W</b> to full throttle to launch. The <b>mouse</b> points where you want to go and the aircraft flies there; <b>arrow keys</b> fly pitch and roll directly. <b>A / D</b> rudder · <b>Shift</b> afterburner · <b>G</b> gear · <b>X</b> flares and chaff.</p><p>Hard turns bleed speed. Below stall speed the nose drops. To land: gear down, slow to about 130 kn over the stern, and touch down on the deck.</p><p><b>Bomber:</b> <b>C</b> cloak (time limited). The yellow ring shows where bombs will fall.</p></div>
      <div><h3>Helicopters</h3><p><b>W / S</b> collective (up and down) · <b>mouse</b> tilts (pitch and roll) · <b>A / D</b> turn · <b>Space</b> levels out · <b>X</b> flares.</p><p>Land gently on helipads, decks and islands. The transport carries marines; the gunship has a chin gun and guided missiles (hold the target near the centre to lock).</p>
        <h3>Marine</h3><p><b>WASD</b> move · <b>Shift</b> run · <b>C</b> crouch · <b>Space</b> jump · <b>R</b> reload.</p><p>Walk up to a machine gun and press <b>E</b> to man it. Board a landed helicopter with <b>E</b>; as a passenger press <b>T</b> to take the controls. Overboard you swim slowly: reach a ship and press <b>E</b> to climb back.</p>
        <h3>Missiles</h3><p>A <b>RADAR LOCK</b> or <b>MISSILE</b> warning means act now: drop flares (<b>X</b>), turn hard across the missile, or get low.</p></div>
    </div><div class="actions"><button class="btn primary" data-back>Back</button></div></div></div>`,
  pause: () => `<div class="screen center"><div class="panel" style="width:26em;text-align:center"><h2>Paused</h2>
      <div class="menu" style="width:100%;margin:0"><button class="btn primary" data-resume>Resume</button><button class="btn" data-change>Change unit</button><button class="btn" data-go="settings">Settings</button><button class="btn" data-go="howto">How to Play</button><button class="btn" data-menu>Main menu</button></div>
      <div style="margin-top:1em;text-align:left">${fastRow().replace('width:24em', '')}</div></div></div>`,
};

function unitInfo() {
  const d = UNITS[unit], N = NATIONS[nation], box = el('unitinfo'); if (!box) return;
  const sp = d.kind === 'soldier' ? `${d.speed.toFixed(0)} m/s running` : `${Math.round(d.speed / KTS)} kn`;
  const wl = d.weapons.length ? d.weapons.map((w) => WEAPONS[w].name).join(', ') : 'None';
  const extra = d.kind === 'jet' ? `<div class="stat"><span>Stall speed</span><span>${Math.round(d.stall / KTS)} kn</span></div><div class="stat"><span>G limit</span><span>${d.gLimit} g</span></div>` : d.kind === 'sub' ? `<div class="stat"><span>Sonar range</span><span>${(d.sonar / 1000).toFixed(1)} km</span></div>` : '';
  const dockOpt = d.kind === 'sub' ? `<div class="startopt seg"><button data-dock="0" class="${startDock ? '' : 'on'}">Start at sea</button><button data-dock="1" class="${startDock ? 'on' : ''}">Start in the battlecruiser dock</button></div>` : '';
  const where = d.kind === 'jet' ? 'Starts on the carrier catapult.' : d.kind === 'heli' ? 'Starts on the carrier helipad.' : d.kind === 'soldier' ? 'Starts on the carrier flight deck, next to the helipad.' : d.kind === 'ship' ? 'You take command of one of the fleet\'s ships.' : '';
  box.innerHTML = `<h2>${d.label}</h2><div class="cls">${N.classes[unit]}</div><p>${d.blurb}</p>
    <div class="stat"><span>Role</span><span>${d.role}</span></div><div class="stat"><span>Crew</span><span>${d.crew}</span></div><div class="stat"><span>Top speed</span><span>${sp}</span></div>
    <div class="stat"><span>Weapons</span><span>${wl}</span></div><div class="stat"><span>Radar range</span><span>${(d.radar / 1000).toFixed(1)} km</span></div>${extra}
    <p style="margin-top:1em;font-size:.88em">${where}</p>${dockOpt}
    <button class="btn primary" data-deploy>Deploy</button>`;
}

function showroomSet() {
  if (!show.scene) {
    show.scene = new THREE.Scene(); show.scene.background = new THREE.Color(0x0b1c2b); show.scene.environment = gfx.scene.environment; show.scene.environmentIntensity = 0.6;
    show.scene.fog = new THREE.Fog(0x0b1c2b, 400, 1800);
    const sun = new THREE.DirectionalLight(0xfff2e0, 3.2); sun.position.set(-0.6, 1, 0.7); show.scene.add(sun, new THREE.HemisphereLight(0xbcd6f0, 0x1a2835, 0.9));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: 0x0f2a3d, roughness: 0.25, metalness: 0.6 })); floor.rotation.x = -Math.PI / 2; show.scene.add(floor); show.floor = floor;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.5 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; show.scene.add(ring); show.ring = ring;
    show.cam = new THREE.PerspectiveCamera(32, 1, 0.5, 4000); show.pivot = new THREE.Group(); show.scene.add(show.pivot);
  }
  const key = nation + ':' + unit;
  if (!show.cache[key]) {
    let g; if (unit === 'marine') { g = buildSoldier(nation, { role: 'marine' }); g.userData.size = 2.6; g.userData.lift = 0; }
    else { g = BUILDERS[unit](nation, 0); const m = g.userData.model, d = m.dims; g.userData.size = Math.max(d.length, d.span || 0, d.beam || 0); g.userData.lift = UNITS[unit].kind === 'jet' || UNITS[unit].kind === 'heli' ? m.gearHeight : UNITS[unit].kind === 'sub' ? d.draft + 1 : d.draft + 0.5; if (m.gear) for (const gr of m.gear) gr.visible = true; if (m.burners) for (const b of m.burners) b.visible = false; }
    show.cache[key] = g;
  }
  if (show.model) show.pivot.remove(show.model);
  show.model = show.cache[key]; show.model.position.y = show.model.userData.lift; show.pivot.add(show.model);
  const s = show.model.userData.size; show.ring.scale.setScalar(s * 0.62); show.dist = s * 1.85 + 3; /* far enough that the whole unit fits between the two panels at any angle */ show.h = s * 0.26 + 1.0; show.look = show.model.userData.lift + s * 0.07;
  show.ring.material.color.set(NATIONS[nation].color);
}

export const menus = {
  showroomActive: false,
  init(a) {
    app = a; root = el('screens');
    root.addEventListener('click', (e) => this.click(e)); root.addEventListener('input', (e) => this.inputEv(e));
    el('notice').addEventListener('click', (e) => { if (e.target.dataset.act && this._noticeFn) this._noticeFn(); el('notice').hidden = true; });
    nation = save.data.last.nation; unit = save.data.last.unit;
  },
  show(name, o = {}) {
    if (cur && name !== cur && (name === 'settings' || name === 'howto')) stack.push(cur); else if (name === 'title' || name === 'pause' || (name === 'units' && o.redeploy)) stack = [];
    if (name === 'units') { opts = o; if (o.redeploy) nation = world.playerNation; }
    cur = name; root.innerHTML = SCREENS[name](); this.showroomActive = name === 'units';
    if (name === 'units') { showroomSet(); unitInfo(); document.documentElement.style.setProperty('--nation', NATIONS[nation].color); }
    if (name === 'settings') this.syncFast();
  },
  hide() { cur = null; root.innerHTML = ''; this.showroomActive = false; stack = []; },
  back() { if (cur === 'pause') { app.resume(); return; } const prev = stack.pop(); if (prev) { const s = stack; this.show(prev, opts); stack = s; } else if (cur === 'nation' || cur === 'units') this.show(cur === 'units' ? 'nation' : 'title'); else this.show(app.state === 'paused' ? 'pause' : 'title'); },
  syncFast() {
    root.querySelectorAll('[data-fast]').forEach((b) => b.setAttribute('aria-checked', String(save.settings.fast)));
    const seg = el('q-seg'), note = el('q-note'); if (seg) { seg.style.opacity = save.settings.fast ? 0.4 : 1; note.textContent = save.settings.fast ? '(Fast Graphics is on)' : save.settings.quality === 'auto' ? `(auto: ${QUALITY[gfx.qName].label})` : ''; }
  },
  notice(text, btn, fn) { const n = el('notice'); n.innerHTML = `<span>${text}</span>${btn ? `<button class="btn small" data-act="1">${btn}</button>` : ''}<button class="btn small">OK</button>`; n.hidden = false; this._noticeFn = fn; clearTimeout(this._nt); this._nt = setTimeout(() => { n.hidden = true; }, 12000); },
  click(e) {
    const t = e.target.closest('button, a'); if (!t || t.tagName === 'A') return; const d = t.dataset; audio.init(); audio.play('click');
    if (d.fast !== undefined) { app.setFast(!save.settings.fast, true); return; }
    if (d.go) { if (d.go === 'nation') audio.music('menu'); this.show(d.go); return; }
    if (d.back !== undefined) return this.back();
    if (d.nation) { nation = d.nation; this.show('units'); return; }
    if (d.unit) { unit = d.unit; root.querySelectorAll('.unitbtn').forEach((b) => b.classList.toggle('on', b.dataset.unit === unit)); showroomSet(); unitInfo(); return; }
    if (d.dock !== undefined) { startDock = d.dock === '1'; unitInfo(); return; }
    if (d.deploy !== undefined) { app.play(nation, unit, { dock: startDock && UNITS[unit].kind === 'sub' }); return; }
    if (d.resume !== undefined) return app.resume();
    if (d.change !== undefined) { app.state = 'select'; this.show('units', { redeploy: true, change: true }); return; }
    if (d.menu !== undefined) return app.toMenu();
    if (d.q) { save.settings.quality = d.q; save.write(); gfx.applyQuality(); t.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t)); this.syncFast(); return; }
    if (d.toggle) { save.settings[d.toggle] = !save.settings[d.toggle]; save.write(); t.setAttribute('aria-checked', String(save.settings[d.toggle])); return; }
    if (d.key) { t.classList.add('wait'); t.textContent = 'Press a key…'; input.capture = (code) => { if (code !== 'Escape') { save.settings.keys[d.key] = [code]; save.write(); } t.classList.remove('wait'); t.textContent = save.keysFor(d.key).map(keyName).join(' / '); }; return; }
    if (d.resetkeys !== undefined) { save.settings.keys = {}; save.write(); const s = stack; this.show('settings'); stack = s; }
  },
  inputEv(e) {
    const id = e.target.dataset.set; if (!id) return; const v = Number(e.target.value), s = save.settings; s[id] = v; save.write();
    const out = el('v-' + id); if (out) out.textContent = id === 'fov' ? v + '°' : id === 'sens' ? v.toFixed(2) : Math.round(v * 100) + '%';
    if (id === 'resScale') gfx.resize(); if (id === 'fov') { gfx.camera.fov = v; gfx.camera.updateProjectionMatrix(); } if (id === 'sfx' || id === 'music') audio.setVolumes(s.sfx, s.music);
  },
  renderShowroom(dt) {
    if (!show.scene || !show.model) return; show.t += dt; show.pivot.rotation.y += dt * 0.35;
    const c = show.cam, a = 0.5; c.aspect = gfx.w / gfx.h; c.updateProjectionMatrix();
    c.position.set(Math.sin(a) * show.dist * 1.25, show.h + show.dist * 0.2, Math.cos(a) * show.dist * 1.25); c.lookAt(0, show.look, 0);
    if (unit === 'marine') animateSoldier(show.model, 'aim', show.t, 0, 0);
    const m = show.model.userData.model; if (m) for (const s of m.spinners) s.node.rotation[s.axis] += s.speed * dt * (s.blades ? 0.15 : 1);
    gfx.renderer.render(show.scene, c);
  },
};
