// In-battle HUD: status, weapons, radar, kill feed, crosshair and markers, warnings, prompts, score + map overlay.
import { gfx } from '../gfx/renderer.js';
import { world } from '../world/world.js';
import { player } from '../sim/player.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { NATIONS, WEAPONS, UNITS, MAP, otherNation } from '../core/config.js';
import { V3, clamp, el, KTS } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { econ, fmtCredits, PAY, CREDIT } from '../core/economy.js';

const _v = new V3();
const PAL = { ally: '#5fe07a', foe: '#ff4a3d' }, PAL_CB = { ally: '#4da3ff', foe: '#ff9a2e' }, RANGES = [1000, 3000, 7000, 15000];
const ICON = {
  kill: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 0v5M8 11v5M0 8h5M11 8h5" stroke="currentColor" stroke-width="1.6"/></svg>',
  carrier: '<svg viewBox="0 0 24 16"><path d="M1 8h22l-2.5 5H4z M14 8V4h4v4 M15.5 4V2" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>',
};
let root, E = {}, rctx, mctx, acc = 0, racc = 0, warnT = 0;

function mk(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function screen(p, out) {
  _v.copy(p).project(gfx.camera);
  out.x = (_v.x * 0.5 + 0.5) * gfx.w; out.y = (-_v.y * 0.5 + 0.5) * gfx.h; out.ok = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
  return out;
}
const sp = { x: 0, y: 0, ok: false };
function place(node, p) { screen(p, sp); if (sp.ok) { node.hidden = false; node.style.transform = `translate(${sp.x}px, ${sp.y}px)`; } else node.hidden = true; return sp.ok; }

export const hud = {
  init() {
    root = el('hud');
    root.innerHTML = `
      <div id="h-vig"></div><div id="h-black"></div><div id="h-scope" hidden><span id="h-scopetxt"></span></div>
      <div id="h-feed"></div>
      <div id="h-score"></div>
      <div id="h-radar" class="hud-box"><canvas width="256" height="256"></canvas><div class="lbl" id="h-rlbl"></div><div class="legend" id="h-rleg" hidden></div></div>
      <div id="h-status" class="hud-box"><div class="cl" id="h-cl"></div><div class="nm" id="h-nm"></div><div class="bar"><i id="h-hp"></i></div><div class="grid2" id="h-grid"></div></div>
      <div class="thr" id="h-thr"><i></i><b></b></div>
      <div id="h-weap" class="hud-box"></div><div id="h-econ" class="hud-box"></div><div id="h-pops"></div>
      <div id="h-cross" class="r"><i class="l t"></i><i class="l b"></i><i class="l lf"></i><i class="l rt"></i><i class="ring"></i><i class="dot"></i></div><div id="h-rinfo"></div><div id="h-hitx" hidden></div><div id="h-dmg" hidden></div><div id="h-dirs"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div id="h-lead" class="mark" hidden><i></i><span></span></div><div id="h-fall0" class="mark fall" hidden><span></span></div><div id="h-fall1" class="mark fall" hidden><span></span></div><div id="h-fall2" class="mark fall" hidden><span></span></div>
      <div id="h-nose" class="mark" hidden><i></i></div><div id="h-fpm" class="mark" hidden><i></i></div><div id="h-lock" class="mark" hidden><i></i><span></span></div><div id="h-aimtg" class="mark" hidden><i></i><b><u></u></b><span></span></div><div id="h-bomb" class="mark" hidden><i></i></div>
      <div id="h-stick" hidden><i></i></div>
      <div id="h-warn"></div><div id="h-prompt" hidden></div><div id="h-msg" hidden></div><div id="h-hint"></div>
      <div id="h-map" hidden><div class="mapwrap"><canvas width="640" height="640"></canvas><div class="scoreboard" id="h-sb"></div></div></div>`;
    for (const id of ['vig', 'black', 'scope', 'scopetxt', 'feed', 'score', 'radar', 'rlbl', 'rleg', 'status', 'cl', 'nm', 'hp', 'grid', 'thr', 'weap', 'econ', 'pops', 'cross', 'rinfo', 'hitx', 'dmg', 'dirs', 'lead', 'fall0', 'fall1', 'fall2', 'nose', 'fpm', 'lock', 'aimtg', 'bomb', 'stick', 'warn', 'prompt', 'msg', 'hint', 'map', 'sb']) E[id] = el('h-' + id);
    rctx = E.radar.querySelector('canvas').getContext('2d'); mctx = E.map.querySelector('canvas').getContext('2d');
    world.onFeed = (text, cls) => this.feed(text, cls);
  },
  on: false, // is the HUD on screen? Only js/main.js syncHud() decides
  show(on) { this.on = on; root.hidden = !on; if (root && E.cross) { this._unit = null; clearTimeout(this._mt); if (!on) E.msg.hidden = true; } },
  feed(text, cls) {
    const d = document.createElement('div'); d.className = cls || ''; d.textContent = text; E.feed.appendChild(d);
    while (E.feed.children.length > 7) E.feed.removeChild(E.feed.firstChild);
    setTimeout(() => { d.style.transition = 'opacity .6s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 700); }, 7000);
  },
  clearFeed() { E.feed.innerHTML = ''; },
  message(big, small = '', secs = 4) { E.msg.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`; E.msg.hidden = false; clearTimeout(this._mt); if (secs) this._mt = setTimeout(() => { E.msg.hidden = true; }, secs * 1000); },

  update(dt) {
    const u = player.unit; if (!u) return;
    const veh = u.kind === 'soldier' && u.aboard ? u.aboard : u;
    // ---- per-frame markers ----
    const jet = u.kind === 'jet', heli = u.kind === 'heli';
    // reticle: red over an enemy, green over one of ours (the trigger is locked), white over nothing
    // Whenever control changes hands (another unit, a seat, a gun, a camera mode, the periscope, death) the HUD starts clean
    const kind = this.kindOf(u), tag = kind + '|' + player._camTag;
    if (this._unit !== u) { this.reset(true); this._unit = u; this._tag = tag; } else if (this._tag !== tag) { this.reset(false); this._tag = tag; }
    // one reticle per kind of control (see the r-* rules in style.css); red over an enemy, green over one of ours
    const at = player.aimTarget, fr = player.aimFriend, rc = 'r r-' + kind + (at ? ' enemy' : fr ? ' friend' : '');
    if (E.cross._c !== rc) { E.cross.className = rc; E.cross._c = rc; }
    if (kind === 'foot') { // the marine's crosshair opens up when moving or firing and closes (then fades) when aiming down the sights
      const gap = (0.3 + u.moving * (u.ctl.run ? 0.9 : 0.45) + (u.grounded ? 0 : 0.5) + clamp(u.cd * 9, 0, 1) * 0.35) * (1 - player.zoom * 0.6);
      E.cross.style.setProperty('--gap', gap.toFixed(2) + 'em'); E.cross.style.opacity = (1 - player.zoom * 0.85).toFixed(2);
    } else if (E.cross.style.opacity !== '') E.cross.style.opacity = '';
    this.reticleInfo(u, veh, kind);
    this.feedback(u, veh, dt);
    E.cross.hidden = kind === 'none';
    if (jet && u.state === 'fly' && u.alive) {
      u.fwd(_v).multiplyScalar(900).add(u.pos); place(E.nose, _v);                       // where the nose (and the guns) point
      const sp = u.vel.length(); if (sp > 30) { _v.copy(u.vel).multiplyScalar(900 / sp).add(u.pos); place(E.fpm, _v); } else E.fpm.hidden = true; // where the plane is going
    } else { E.nose.hidden = true; E.fpm.hidden = true; }
    if ((jet || heli) && u.lockTarget && u.lockTarget.alive) { if (place(E.lock, u.lockTarget.pos)) { E.lock.classList.toggle('locked', u.locked); E.lock.lastChild.textContent = u.locked ? 'LOCKED: FIRE' : 'LOCKING'; } } else E.lock.hidden = true;
    // the unit under the reticle: name, type, range and health for an enemy; a hold-fire note for one of ours
    const tg = at || fr;
    if (tg && tg.alive && u.alive && !(u.lockTarget === tg)) {
      if (place(E.aimtg, tg.pos)) {
        const txt = at ? `${world.label(at)}  ${(at.pos.distanceTo(u.pos) / 1000).toFixed(1)} km` : `${world.label(fr)}  HOLD FIRE`, cl = at ? 'mark enemy' : 'mark friend';
        if (E.aimtg._t !== txt) { E.aimtg.lastChild.textContent = txt; E.aimtg._t = txt; } if (E.aimtg._c !== cl) { E.aimtg.className = cl; E.aimtg._c = cl; }
        E.aimtg.children[1].firstChild.style.width = `${clamp(tg.hp / tg.maxHp, 0, 1) * 100}%`;
      }
    } else E.aimtg.hidden = true;
    if (player.showLead && u.alive && place(E.lead, player.leadPoint)) { const lt = player.leadT >= 0.8 ? `Impact in ${player.leadT.toFixed(1)} s` : ''; if (E.lead._t !== lt) { E.lead.lastChild.textContent = lt; E.lead._t = lt; } } else E.lead.hidden = true;
    if (player.showBomb) place(E.bomb, player.bombPoint); else E.bomb.hidden = true;
    E.stick.hidden = !(heli && u.state === 'fly'); if (!E.stick.hidden) E.stick.firstChild.style.transform = `translate(${player.stick.x * 3.1}em, ${player.stick.y * 3.1}em)`;
    E.scope.hidden = !player.scopeView;
    u.hitFlash = Math.max(0, (u.hitFlash || 0) - dt * 1.5); E.vig.style.opacity = Math.min(0.8, u.hitFlash + (u.hp < u.maxHp * 0.25 ? 0.25 : 0));
    E.black.style.opacity = jet && u.alive ? clamp((u.gSmooth - 6.5) / 3, 0, 0.92) : 0;
    E.prompt.hidden = !player.prompt; if (player.prompt && E.prompt._t !== player.prompt) { E.prompt.innerHTML = player.prompt; E.prompt._t = player.prompt; }
    if (input.tap('radarIn')) this.radarZoom(veh, -1); else if (input.tap('radarOut')) this.radarZoom(veh, 1);
    this.pal();
    { const open = input.on('map'); if (E.map.hidden === open) { E.map.hidden = !open; racc = 1; } }
    // ---- slower text ----
    acc += dt; if (acc < 0.09) return; const step = acc; acc = 0;
    const N = NATIONS[u.nation];
    E.cl.textContent = N.classes[veh.type] || veh.def.label; E.nm.textContent = veh.name ? `${veh.def.label} ${veh.name}` : veh.def.label;
    const hp = clamp(veh.hp / veh.maxHp, 0, 1); E.hp.style.width = `${hp * 100}%`; E.hp.style.background = hp > 0.5 ? 'var(--good)' : hp > 0.25 ? 'var(--warn)' : 'var(--bad)';
    const hdg = ((((-(veh.kind === 'soldier' ? veh.look : veh.yaw) * 180) / Math.PI) % 360) + 360) % 360;
    const cells = [];
    const kts = (Math.abs(veh.kind === 'heli' || veh.kind === 'jet' ? veh.vel.length() : veh.speed) / KTS).toFixed(0);
    cells.push(['SPD', `${veh.speed < 0 ? '-' : ''}${kts} kn`], ['HDG', `${hdg.toFixed(0).padStart(3, '0')}°`]);
    if (veh.kind === 'jet' || veh.kind === 'heli') { cells.push(['ALT', `${Math.max(0, veh.pos.y).toFixed(0)} m`], ['V/S', `${veh.vel.y.toFixed(0)} m/s`]); if (veh.kind === 'jet') { cells.push(['G', veh.gSmooth.toFixed(1)], ['THR', `${(veh.throttle * 100).toFixed(0)}%${veh.abOn ? ' AB' : ''}`], ['GEAR', veh.gearDown ? 'DOWN' : 'UP'], ['FLR', String(veh.flares)], ['CREW', veh.def.crew.toLocaleString('en-US')]); if (veh.def.cloak) cells.push(['CLOAK', veh.cloaked ? `${veh.cloakT.toFixed(0)} s` : veh.cloakCd > 0 ? `wait ${veh.cloakCd.toFixed(0)}` : 'READY']); } else cells.push(['RPM', `${(veh.rpm * 100).toFixed(0)}%`], ['FLR', String(veh.flares)], ['CREW', veh.def.crew.toLocaleString('en-US')]); if (veh.type === 'transport') cells.push(['TROOPS', `${veh.passengers.length}/${veh.def.seats}`]); }
    else if (veh.kind === 'sub') cells.push(['DEPTH', `${veh.depth.toFixed(0)} m`], ['ORDER', `${veh.depthT.toFixed(0)} m`], ['SCOPE', veh.scopeA > 0.9 ? 'UP' : veh.scope ? 'RAISING' : 'DOWN'], ['SONAR', veh.pingT > world.t ? 'ACTIVE' : 'PASSIVE'], ['CREW', veh.def.crew.toLocaleString('en-US')]);
    else if (veh.kind === 'ship') cells.push(['THR', `${(veh.throttle * 100).toFixed(0)}%`], ['RUD', veh.rudderA > 0.05 ? 'PORT' : veh.rudderA < -0.05 ? 'STBD' : 'MID'], ['CREW', veh.def.crew.toLocaleString('en-US')], ['FLOOD', `${(veh.flood * 100).toFixed(0)}%`]);
    else cells.push(['STANCE', u.swim ? 'SWIM' : u.ctl.crouch ? 'CROUCH' : 'STAND'], ['ON', u.on ? (u.on.name || u.on.def.label) : u.swim ? 'Sea' : 'Island']);
    const gh = cells.map((c) => `<div><span>${c[0]}</span>${c[1]}</div>`).join(''); if (E.grid._h !== gh) { E.grid.innerHTML = gh; E.grid._h = gh; } // only touch the page when a number changed
    const thr = veh.kind === 'heli' ? veh.ctl.collective * 0.5 + 0.2 : veh.throttle ?? 0; E.thr.hidden = veh.kind === 'soldier';
    const ti = E.thr.firstChild; if (thr >= 0) { ti.style.bottom = '28.6%'; ti.style.height = `${thr * 71.4}%`; } else { ti.style.height = `${-thr * 71.4}%`; ti.style.bottom = `${28.6 + thr * 71.4}%`; }
    // weapons
    const keys = player.keys || []; let wh = '';
    keys.forEach((k, i) => {
      const def = WEAPONS[k]; let am = '';
      if (veh.fw && veh.fw[k]) { const w = veh.fw[k]; am = w.ammo === Infinity ? '' : String(w.ammo); if (w.cd > 0.3) am += ' …'; }
      else if (k === 'torpedo') am = `${veh.tubes.ready}/${veh.tubes.def.tubes} tubes`;
      else if (k === 'rifle') am = u.reloadT > 0 ? 'reloading' : `${u.mag}/30`;
      else { const ms = veh.mounts.filter((m) => m.key === k), rdy = ms.filter((m) => m.cd <= 0 && m.inArc).length; am = `${rdy}/${ms.length} ready`; }
      wh += `<div class="wp${k === veh.selKey ? ' on' : ''}"><span><kbd>${i + 1}</kbd>${def.name}</span><span class="am">${am}</span></div>`;
    });
    if (veh.mounts) { const auto = {}; for (const m of veh.mounts) if (!keys.includes(m.key)) auto[m.key] = (auto[m.key] || 0) + 1; for (const k in auto) wh += `<div class="wp auto"><span>${auto[k]}× ${WEAPONS[k].name}</span><span class="am">crew</span></div>`; }
    if (u.gun) wh = `<div class="wp on"><span>${u.gun.def.name}</span><span class="am">manned</span></div>`;
    if (!wh) wh = '<div class="wp auto"><span>No weapons</span><span></span></div>';
    if (E.weap._h !== wh) { E.weap.innerHTML = wh; E.weap._h = wh; }
    // warnings
    const w = [];
    if (veh.incoming > 0) w.push(['MISSILE', '']); else if (veh.lockedBy > world.t) w.push(['RADAR LOCK', 'amber']);
    if (this.torpNear) w.push([`TORPEDO  ${this.torpNear}`, '']);
    if (veh.invuln > world.t && veh.alive) w.push([`PROTECTED  ${Math.ceil(veh.invuln - world.t)} s`, 'amber']);
    const hf = world.hurts.length ? world.hurts[world.hurts.length - 1] : null; if (hf && world.t - hf.t < 3 && veh.alive) w.push([`Under fire: ${world.label(hf.from)}`, 'amber']);
    if (veh.kind === 'jet' && veh.state === 'fly') { if (veh.speed < veh.def.stall * 1.15) w.push(['STALL', '']); if (veh.pos.y < 120 && veh.vel.y < -25) w.push(['PULL UP', '']); if (veh.gearDown && veh.speed > 160) w.push(['GEAR', 'amber']); }
    if (veh.kind === 'sub' && veh.pinged > world.t) w.push(['POSITION REVEALED', 'amber']);
    if (veh.hp < veh.maxHp * 0.25 && veh.alive) w.push(['CRITICAL DAMAGE', 'amber']);
    const wk = w.map((x) => x[0]).join('|'); if (E.warn._k !== wk) { E.warn._k = wk; E.warn.innerHTML = w.map((x) => `<div class="${x[1]}">${x[0]}</div>`).join(''); }
    warnT -= step; if (warnT <= 0 && w.length && w[0][1] === '') { warnT = 0.7; audio.play(w[0][0] === 'STALL' ? 'stall' : 'warning'); }
    // Credits: the wallet, and how much of this battle's infantry pay is used (grey when the limit is reached)
    { const inf = econ.b ? econ.b.infantry : 0, full = inf >= PAY.infantryCap;
      const eh = `<div class="cr">${CREDIT} ${Math.round(econ.credits).toLocaleString('en-US')}</div><div class="inf${full ? ' full' : ''}"><span>Infantry pay: ${fmtCredits(inf)} / ${fmtCredits(PAY.infantryCap)}</span><i><u style="width:${Math.min(100, (inf / PAY.infantryCap) * 100)}%"></u></i></div>`;
      if (E.econ._h !== eh) { E.econ.innerHTML = eh; E.econ._h = eh; } }
    if (E.hint._t !== player.hint) { E.hint.textContent = player.hint; E.hint._t = player.hint; }
    if (player.scopeView) E.scopetxt.textContent = `PERISCOPE  ${hdgOf(player.yaw)}°  x${(1 + player.zoom * 3).toFixed(1)}`;
    // score bar: your side on the left, the goal in the middle, the enemy on the right. Kills and carrier health are labelled.
    const me = u.nation, en = otherNation(me);
    const side = (n, mine) => {
      const c = world.carriers[n], f = c ? clamp(c.hp / c.maxHp, 0, 1) : 0, pct = Math.ceil(f * 100);
      if (c) { // flash the bar when the carrier is hit, and call out 50% and 25%
        if (c._hudHp !== undefined && c.hp < c._hudHp - 1) c._hudFlash = world.t + 0.8; c._hudHp = c.hp;
        for (const th of [50, 25]) if (pct <= th && c.alive && (c._alerted || 100) > th) { c._alerted = th; world.say(mine ? `Our carrier ${c.name} is down to ${th}%` : `Enemy carrier ${c.name} is down to ${th}%`, mine ? 'bad' : 'good'); if (mine) audio.play('warning'); }
      }
      const flash = c && c._hudFlash > world.t ? ' flash' : '', low = pct <= 25 ? ' low' : pct <= 50 ? ' mid' : '';
      return `<div class="side ${mine ? 'me' : 'en'}"><b class="nm" style="color:${NATIONS[n].color}">${NATIONS[n].name.toUpperCase()}${mine ? ' (YOU)' : ''}</b><span class="kl">${ICON.kill}${world.kills[n]} KILLS</span><span class="cvl${flash}${low}">${ICON.carrier}CARRIER ${pct}%<i><u style="width:${pct}%;background:${NATIONS[n].color}"></u></i></span></div>`;
    };
    const sh = side(me, true) + '<div class="goal">SINK THE ENEMY CARRIER</div>' + side(en, false); if (E.score._h !== sh) { E.score.innerHTML = sh; E.score._h = sh; }
    racc += step; if (racc > 0.18) { racc = 0; this.radar(veh); if (!E.map.hidden) this.bigMap(veh); }
  },

  // "+800" style popup beside the reticle when a kill pays
  pop(text) {
    const d = document.createElement('div'); d.textContent = text; E.pops.appendChild(d);
    while (E.pops.children.length > 4) E.pops.removeChild(E.pops.firstChild);
    setTimeout(() => d.remove(), 1900);
  },
  // which reticle and HUD layout the player's current seat uses
  kindOf(u) {
    if (!u.alive) return 'none';
    if (u.kind === 'soldier') return u.aboard ? 'none' : u.gun ? 'gun' : 'foot';
    if (u.kind === 'ship') return player.mode === 'gunner' ? 'gun' : 'ship';
    if (u.kind === 'sub') return player.scopeView ? 'scope' : 'sub';
    return u.kind; // jet, heli
  },
  // Wipe everything that belongs to the previous unit or view: markers, boxes, labels, cached text. `full` (a different
  // unit) also forgets hit and damage feedback and warnings.
  reset(full) {
    for (const id of ['nose', 'fpm', 'lock', 'aimtg', 'bomb', 'lead', 'fall0', 'fall1', 'fall2', 'hitx', 'dmg', 'stick', 'scope']) { const n = E[id]; n.hidden = true; n._t = n._c = undefined; }
    for (const a of E.dirs.children) a.style.opacity = '0';
    E.rinfo.textContent = ''; E.rinfo._t = ''; E.cross._c = ''; E.cross.style.opacity = '';
    if (full) {
      world.hits.t = -9; world.hits.dmg = 0; world.hurts.length = 0; world.falls.length = 0; this.torpNear = '';
      E.warn._k = ''; E.warn.innerHTML = ''; E.prompt.hidden = true; E.prompt._t = ''; E.hint._t = null; E.grid._h = ''; E.weap._h = ''; warnT = 0; acc = 1; // redraw the panels at once
    }
  },
  // the line under the reticle: range to what is under it and the state of the weapon in hand
  reticleInfo(u, veh, kind) {
    let t = '';
    if (kind === 'ship' || kind === 'gun') {
      const key = u.gun ? u.gun.key : veh.selKey, ms = u.gun ? [u.gun] : (veh.mounts || []).filter((m) => m.key === key);
      if (ms.length) {
        const rdy = ms.filter((m) => m.cd <= 0 && m.inArc).length, arc = ms.some((m) => m.inArc), wait = Math.min(...ms.map((m) => Math.max(m.cd, 0)));
        const rng = player.aimTarget ? `${(player.aimTarget.pos.distanceTo(veh.pos) / 1000).toFixed(1)} km` : `${(player.aimPoint.distanceTo(veh.pos) / 1000).toFixed(1)} km`;
        if (key === 'sam' && !u.gun) { // the missile group fired by hand: it needs an aircraft under the reticle and a lock
          const tg = player.aimTarget && player.aimTarget.isAir ? player.aimTarget : null, lk = tg ? Math.max(...ms.map((m) => (m.target === tg ? m.lock : 0))) : 0;
          t = tg ? `${rng}  ·  ${lk >= WEAPONS.sam.lockTime ? `LOCKED  ·  ${rdy}/${ms.length} READY` : 'LOCKING'}` : 'AIM AT AN AIRCRAFT  ·  CREW FIRING';
        } else t = `${rng}  ·  ${!arc ? 'OUT OF ARC' : rdy ? (ms.length > 1 ? `${rdy}/${ms.length} READY` : 'READY') : wait < 0.25 ? 'FIRING' : `RELOADING ${wait.toFixed(1)} s`}`;
      }
    } else if (kind === 'sub' || kind === 'scope') {
      const tb = veh.tubes; if (tb) t = veh.depth > 40 ? 'TOO DEEP TO FIRE' : `${tb.ready}/${tb.def.tubes} TUBES${player.aimTarget ? `  ·  ${(player.aimTarget.pos.distanceTo(veh.pos) / 1000).toFixed(1)} km` : ''}`;
    } else if (kind === 'heli' || kind === 'jet') {
      const w = veh.fw && veh.fw[veh.selKey], def = WEAPONS[veh.selKey];
      if (def) t = def.name + (w && w.ammo !== Infinity ? `  ·  ${w.ammo}` : '');
    } else if (kind === 'foot') t = u.reloadT > 0 ? 'RELOADING' : u.mag <= 5 ? `${u.mag} ROUNDS` : '';
    if (E.rinfo._t !== t) { E.rinfo.textContent = t; E.rinfo._t = t; }
  },
  // ---- hit markers, damage direction, shell-fall calls (every frame) ----
  feedback(u, veh, dt) {
    const h = world.hits, age = world.t - h.t, cam = gfx.camera;
    const showX = age >= 0 && age < (h.big ? 0.45 : 0.2); E.hitx.hidden = !showX; if (showX) { const c = h.big ? 'big' : ''; if (E.hitx._c !== c) { E.hitx.className = c; E.hitx._c = c; } }
    if (h.t !== this._ht) { this._ht = h.t; if (age >= 0 && age < 0.3 && world.t - (this._tick || -9) > 0.07) { this._tick = world.t; audio.play(h.big ? 'hit' : 'click', { vol: h.big ? 0.8 : 0.4 }); } }
    const showD = age >= 0 && age < 1.3 && h.dmg > 0; E.dmg.hidden = !showD;
    if (showD) { const t = h.kill ? 'TARGET DESTROYED' : '+' + Math.round(h.dmg); if (E.dmg._t !== t) { E.dmg.textContent = t; E.dmg._t = t; E.dmg.className = h.kill ? 'kill' : ''; } }
    // arcs round the reticle pointing at whoever is hitting us (red), and at incoming torpedoes and missiles (amber)
    cam.getWorldDirection(_v); const fl = Math.hypot(_v.x, _v.z) || 1, fx = _v.x / fl, fz = _v.z / fl, arcs = E.dirs.children; let n = 0;
    const arc = (x, z, op, amber) => { if (n >= arcs.length) return; const dx = x - cam.position.x, dz = z - cam.position.z, a = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz), el = arcs[n++]; el.style.transform = `rotate(${a.toFixed(3)}rad)`; el.style.opacity = op.toFixed(2); const c = amber ? 'amber' : ''; if (el._c !== c) { el.className = c; el._c = c; } };
    if (veh.alive) {
      for (const e of world.hurts) { const a = world.t - e.t; if (a >= 0 && a < 3) arc(e.x, e.z, 1 - a / 3, false); }
      let near = null, nd = 1700 * 1700;
      if (veh.kind === 'ship' || veh.kind === 'sub') for (const t of world.torps || []) { if (t.nation === veh.nation) continue; const d2 = t.pos.distanceToSquared(veh.pos); if (d2 < nd) { nd = d2; near = t; } }
      if (near) { arc(near.pos.x, near.pos.z, 1, true); this.torpNear = hdgOf(Math.atan2(-(near.pos.x - veh.pos.x), -(near.pos.z - veh.pos.z))) + '°  ' + Math.round(Math.sqrt(nd) / 10) * 10 + ' m'; } else this.torpNear = '';
      if (veh.incoming > 0) for (const m of world.missiles || []) if (m.target === veh) arc(m.pos.x, m.pos.z, 1, true);
    } else this.torpNear = '';
    for (; n < arcs.length; n++) if (arcs[n].style.opacity !== '0') arcs[n].style.opacity = '0';
    // where our shells fell
    for (let i = 0; i < 3; i++) {
      const f = world.falls[i], node = E['fall' + i], a = f ? world.t - f.t : 9;
      if (f && a >= 0 && a < 2.4 && place(node, _v.set(f.x, f.y, f.z))) { if (node._t !== f.text) { node.firstChild.textContent = f.text; node._t = f.text; node.className = f.hit ? 'mark fall hit' : 'mark fall'; } } else node.hidden = true;
    }
  },
  // ---- radar and map ----
  // Colours: green = your side, red = the enemy (blue and orange with the colour-blind setting), white = you.
  // Shapes are the same for both colours: a hull for ships (longer for bigger ships, a boxed flat-top for carriers), a
  // diamond for submarines, a plane for aircraft, an X for helicopters, a dot for people.
  pal() { const cb = !!save.settings.colorblind; if (this._cb !== cb) { this._cb = cb; root.style.setProperty('--ally', cb ? '#4da3ff' : '#5fe07a'); root.style.setProperty('--foe', cb ? '#ff9a2e' : '#ff4a3d'); } return cb ? PAL_CB : PAL; },
  heading(e) { if (e.kind === 'soldier') return e.look; if (e.isAir && e.vel.lengthSq() > 25) return Math.atan2(-e.vel.x, -e.vel.z); return e.yaw; },
  blip(ctx, e, x, y, k, col, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
    if (e.isPlayer) { ctx.moveTo(0, -6 * k); ctx.lineTo(4.2 * k, 5 * k); ctx.lineTo(0, 2.6 * k); ctx.lineTo(-4.2 * k, 5 * k); ctx.closePath(); ctx.fill(); }
    else if (e.kind === 'ship') {
      const L = (e.type === 'carrier' ? 8.5 : e.type === 'superdestroyer' ? 9.6 : e.type === 'battlecruiser' ? 7 : e.type === 'corvette' ? 4.8 : 3.4) * k, B = (e.type === 'carrier' ? 3 : e.type === 'superdestroyer' ? 2.9 : e.type === 'battlecruiser' ? 2.2 : 1.7) * k;
      if (e.type === 'carrier') { ctx.rect(-B, -L, B * 2, L * 2); ctx.fill(); ctx.strokeRect(-B - 2.2, -L - 2.2, B * 2 + 4.4, L * 2 + 4.4); }
      else { ctx.moveTo(0, -L); ctx.lineTo(B, -L * 0.45); ctx.lineTo(B, L); ctx.lineTo(-B, L); ctx.lineTo(-B, -L * 0.45); ctx.closePath(); ctx.fill(); }
      if (e.type === 'superdestroyer') { const o = 2.4; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, -L - o * 1.6); ctx.lineTo(B + o, -L * 0.45 - o * 0.4); ctx.lineTo(B + o, L + o); ctx.lineTo(-B - o, L + o); ctx.lineTo(-B - o, -L * 0.45 - o * 0.4); ctx.closePath(); ctx.stroke(); } // the biggest hull, with an outline round it
    } else if (e.kind === 'sub') { const d = 3.6 * k; ctx.moveTo(0, -d * 1.3); ctx.lineTo(d, 0); ctx.lineTo(0, d * 1.3); ctx.lineTo(-d, 0); ctx.closePath(); ctx.fill(); }
    else if (e.kind === 'heli') { const d = 3 * k; ctx.lineWidth = 1.9; ctx.moveTo(-d, -d); ctx.lineTo(d, d); ctx.moveTo(d, -d); ctx.lineTo(-d, d); ctx.stroke(); }
    else if (e.kind === 'jet') { const d = k; ctx.moveTo(0, -5 * d); ctx.lineTo(1.1 * d, -1 * d); ctx.lineTo(4.6 * d, 1.8 * d); ctx.lineTo(1.1 * d, 1.5 * d); ctx.lineTo(0.9 * d, 3.6 * d); ctx.lineTo(2.3 * d, 4.9 * d); ctx.lineTo(-2.3 * d, 4.9 * d); ctx.lineTo(-0.9 * d, 3.6 * d); ctx.lineTo(-1.1 * d, 1.5 * d); ctx.lineTo(-4.6 * d, 1.8 * d); ctx.lineTo(-1.1 * d, -1 * d); ctx.closePath(); ctx.fill(); }
    else { ctx.arc(0, 0, 1.6 * k, 0, 7); ctx.fill(); }
    ctx.restore();
  },
  radar(u) {
    const c = rctx, S = 256, R = S / 2, P = this.pal();
    const zk = u.kind === 'ship' && u.type === 'patrol' ? 'patrol' : u.kind, zi = clamp(save.settings.radarZoom[zk] ?? (u.kind === 'soldier' ? 0 : u.kind === 'jet' ? 3 : zk === 'patrol' ? 1 : 2), 0, 3), range = RANGES[zi], k = (R - 6) / range;
    const yaw = this.heading(u), cs = Math.cos(yaw), sn = Math.sin(yaw);
    c.clearRect(0, 0, S, S); c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
    c.fillStyle = 'rgba(6,22,34,.85)'; c.fillRect(0, 0, S, S);
    const tx = (wx, wz) => { const dx = wx - u.pos.x, dz = wz - u.pos.z; return [R + (dx * cs - dz * sn) * k, R + (dx * sn + dz * cs) * k]; };
    c.fillStyle = 'rgba(150,160,168,.28)'; for (const is of world.islands) { const [x, y] = tx(is.x, is.z); c.beginPath(); c.arc(x, y, is.r * k, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(140,190,220,.22)'; c.lineWidth = 1; for (const f of [0.33, 0.66, 1]) { c.beginPath(); c.arc(R, R, (R - 6) * f, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(R, 6); c.lineTo(R, S - 6); c.moveTo(6, R); c.lineTo(S - 6, R); c.stroke();
    const mark = player.aimTarget || u.lockTarget;
    for (const e of world.units) {
      if (!e.alive || e === u || (e.nation !== u.nation && !e.seen) || (e.kind === 'soldier' && (e.aboard || range > 1000))) continue;
      const [x, y] = tx(e.pos.x, e.pos.z); if (Math.hypot(x - R, y - R) > R) continue;
      this.blip(c, e, x, y, 0.95, e.nation === u.nation ? P.ally : P.foe, yaw - this.heading(e));
      if (e === mark) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 11, 0, 7); c.stroke(); } // what you are aiming at
    }
    this.lostMarks(c, u, (l) => tx(l.x, l.z), P);
    if (Math.floor(performance.now() / 180) % 2) { c.fillStyle = P.foe; for (const m of world.missiles || []) { if (m.nation === u.nation) continue; const [x, y] = tx(m.pos.x, m.pos.z); c.beginPath(); c.arc(x, y, m.target === u ? 3.4 : 2.2, 0, 7); c.fill(); } } // incoming missiles flash
    this.blip(c, { isPlayer: true }, R, R, 1, '#fff', 0);
    c.restore(); c.strokeStyle = 'rgba(160,200,230,.5)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.stroke();
    const lbl = `RADAR ${range / 1000} KM   - / + ZOOM`; if (E.rlbl._t !== lbl) { E.rlbl.textContent = lbl; E.rlbl._t = lbl; }
    const st = save.stats, showLeg = !!save.settings.radarLegend || (st.battlesWon + st.battlesLost) < 3;
    if (E.rleg.hidden === showLeg) { E.rleg.hidden = !showLeg; if (showLeg) E.rleg.innerHTML = '<span><b style="color:#fff">▲</b> you</span><span><b style="color:var(--ally)">■</b> your side</span><span><b style="color:var(--foe)">■</b> enemy</span><span>▮ ship</span><span>◆ submarine</span><span>✈ plane</span><span>✕ helicopter</span><span>? lost contact</span>'; }
  },
  radarZoom(u, step) {
    const zk = u.kind === 'ship' && u.type === 'patrol' ? 'patrol' : u.kind, cur = save.settings.radarZoom[zk] ?? (u.kind === 'soldier' ? 0 : u.kind === 'jet' ? 3 : zk === 'patrol' ? 1 : 2);
    save.settings.radarZoom[zk] = clamp(cur + step, 0, 3); save.write(); racc = 1; audio.play('click', { vol: 0.4 });
  },
  // a fading "?" where an enemy contact was last held (13 seconds)
  lostMarks(c, u, at, P) {
    c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillStyle = P.foe;
    for (const l of world.lost) { if (l.nation === u.nation) continue; const [x, y] = at(l); c.globalAlpha = Math.max(0, 1 - (world.t - l.t) / 13); c.fillText('?', x, y + 4); }
    c.globalAlpha = 1;
    c.textAlign = 'left';
  },
  bigMap(u) {
    const c = mctx, S = 640, k = S / (MAP.half * 2 + 2000), tx = (x) => S / 2 + x * k;
    c.fillStyle = '#0d2a3f'; c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(140,190,220,.12)'; for (let i = 0; i <= 10; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, S); c.moveTo(0, i * 64); c.lineTo(S, i * 64); c.stroke(); }
    const P = this.pal();
    c.fillStyle = 'rgba(150,160,168,.32)'; for (const is of world.islands) { c.beginPath(); c.arc(tx(is.x), tx(is.z), is.r * k, 0, 7); c.fill(); }
    for (const e of world.units) { if (!e.alive || (e.nation !== u.nation && !e.seen) || (e.kind === 'soldier' && !e.isPlayer)) continue; this.blip(c, e, tx(e.pos.x), tx(e.pos.z), e === u ? 1.5 : 1.1, e === u ? '#fff' : e.nation === u.nation ? P.ally : P.foe, -this.heading(e)); }
    this.lostMarks(c, u, (l) => [tx(l.x), tx(l.z)], P);
    c.fillStyle = '#fff'; c.font = '11px sans-serif'; for (const n of ['aethia', 'extro']) { const cv = world.carriers[n]; if (cv && cv.alive && (n === u.nation || cv.seen)) c.fillText(cv.name, tx(cv.pos.x) + 10, tx(cv.pos.z) + 4); }
    const st = save.stats, me = u.nation, en = otherNation(me), count = (n, f) => world.units.filter((x) => x.alive && x.nation === n && f(x)).length;
    const L = world.losses, lossRow = (label, key) => `<div class="stat"><span>${label}</span><span>${L[me][key]} / ${L[en][key]}</span></div>`;
    E.sb.innerHTML = `<h3>Battle</h3>
      <div class="stat"><span>Kills: ${NATIONS[me].name} / ${NATIONS[en].name}</span><span>${world.kills[me]} / ${world.kills[en]}</span></div>
      <h3 style="margin-top:1.2em">Losses: ours / theirs</h3>
      ${lossRow('Ships', 'ships')}${lossRow('Submarines', 'subs')}${lossRow('Aircraft', 'aircraft')}${lossRow('Marines', 'men')}
      <h3 style="margin-top:1.2em">Now</h3>
      <div class="stat"><span>Your kills this battle</span><span>${world.playerKills || 0}</span></div>
      <div class="stat"><span>Our ships / aircraft</span><span>${count(me, (x) => x.kind === 'ship' || x.kind === 'sub')} / ${count(me, (x) => x.isAir)}</span></div>
      <div class="stat"><span>Enemy contacts held</span><span>${world.units.filter((x) => x.alive && x.nation === en && x.seen).length}</span></div>
      <h3 style="margin-top:1.2em">Service record</h3>
      <div class="stat"><span>Ships sunk</span><span>${st.sinkings}</span></div><div class="stat"><span>Aircraft shot down</span><span>${st.aircraft}</span></div>
      <div class="stat"><span>Battles won / lost</span><span>${st.battlesWon} / ${st.battlesLost}</span></div>
      <p style="color:var(--dim);font-size:.8em;margin-top:1.4em">Hold Tab to keep this open. White marker: you. Hull shapes: ships (carriers boxed, a Super Destroyer outlined). Diamonds: submarines. Planes: aircraft. X: helicopters.</p>`;
  },
};
function hdgOf(yaw) { return String(Math.round(((((-yaw * 180) / Math.PI) % 360) + 360) % 360)).padStart(3, '0'); }
