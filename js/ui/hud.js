// In-battle HUD: status, weapons, radar, kill feed, crosshair and markers, warnings, prompts, score + map overlay.
import { gfx } from '../gfx/renderer.js';
import { world } from '../world/world.js';
import { player } from '../sim/player.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { NATIONS, WEAPONS, UNITS, MAP, otherNation } from '../core/config.js';
import { V3, clamp, el, KTS } from '../core/util.js';
import { audio } from '../audio/audio.js';

const _v = new V3();
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
      <div id="h-radar" class="hud-box"><canvas width="256" height="256"></canvas><div class="lbl" id="h-rlbl"></div></div>
      <div id="h-status" class="hud-box"><div class="cl" id="h-cl"></div><div class="nm" id="h-nm"></div><div class="bar"><i id="h-hp"></i></div><div class="grid2" id="h-grid"></div></div>
      <div class="thr" id="h-thr"><i></i><b></b></div>
      <div id="h-weap" class="hud-box"></div>
      <div id="h-cross"></div>
      <div id="h-nose" class="mark" hidden><i></i></div><div id="h-lock" class="mark" hidden><i></i><span></span></div><div id="h-aimtg" class="mark" hidden><i></i><span></span></div><div id="h-bomb" class="mark" hidden><i></i></div>
      <div id="h-stick" hidden><i></i></div>
      <div id="h-warn"></div><div id="h-prompt" hidden></div><div id="h-msg" hidden></div><div id="h-hint"></div>
      <div id="h-map" hidden><div class="mapwrap"><canvas width="640" height="640"></canvas><div class="scoreboard" id="h-sb"></div></div></div>`;
    for (const id of ['vig', 'black', 'scope', 'scopetxt', 'feed', 'score', 'radar', 'rlbl', 'status', 'cl', 'nm', 'hp', 'grid', 'thr', 'weap', 'cross', 'nose', 'lock', 'aimtg', 'bomb', 'stick', 'warn', 'prompt', 'msg', 'hint', 'map', 'sb']) E[id] = el('h-' + id);
    rctx = E.radar.querySelector('canvas').getContext('2d'); mctx = E.map.querySelector('canvas').getContext('2d');
    world.onFeed = (text, cls) => this.feed(text, cls);
  },
  show(on) { root.hidden = !on; },
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
    E.cross.className = jet && player.mode === 'chase' ? 'circle' : ''; if (u.hitMarker > world.t) E.cross.classList.add('hit');
    E.cross.hidden = !u.alive || (u.kind === 'soldier' && !!u.aboard);
    if (jet && u.state === 'fly') { u.fwd(_v).multiplyScalar(900).add(u.pos); place(E.nose, _v.clone()); } else E.nose.hidden = true;
    if ((jet || heli) && u.lockTarget && u.lockTarget.alive) { if (place(E.lock, u.lockTarget.pos)) { E.lock.classList.toggle('locked', u.locked); E.lock.lastChild.textContent = u.locked ? 'LOCKED: FIRE' : 'LOCKING'; } } else E.lock.hidden = true;
    const at = player.aimTarget;
    if (at && at.alive && !(u.lockTarget === at)) { if (place(E.aimtg, at.pos)) E.aimtg.lastChild.textContent = `${world.label(at)}  ${(at.pos.distanceTo(u.pos) / 1000).toFixed(1)} km`; } else E.aimtg.hidden = true;
    if (player.showBomb) place(E.bomb, player.bombPoint); else E.bomb.hidden = true;
    E.stick.hidden = !(heli && u.state === 'fly'); if (!E.stick.hidden) E.stick.firstChild.style.transform = `translate(${player.stick.x * 3.1}em, ${player.stick.y * 3.1}em)`;
    E.scope.hidden = !player.scopeView;
    u.hitFlash = Math.max(0, (u.hitFlash || 0) - dt * 1.5); E.vig.style.opacity = Math.min(0.8, u.hitFlash + (u.hp < u.maxHp * 0.25 ? 0.25 : 0));
    E.black.style.opacity = jet ? clamp((u.gSmooth - 6.5) / 3, 0, 0.92) : 0;
    E.prompt.hidden = !player.prompt; if (player.prompt && E.prompt._t !== player.prompt) { E.prompt.innerHTML = player.prompt; E.prompt._t = player.prompt; }
    if (input.tap('map')) { E.map.hidden = !E.map.hidden; }
    // ---- slower text ----
    acc += dt; if (acc < 0.09) return; const step = acc; acc = 0;
    const N = NATIONS[u.nation];
    E.cl.textContent = N.classes[veh.type] || veh.def.label; E.nm.textContent = veh.name ? `${veh.def.label} ${veh.name}` : veh.def.label;
    const hp = clamp(veh.hp / veh.maxHp, 0, 1); E.hp.style.width = `${hp * 100}%`; E.hp.style.background = hp > 0.5 ? 'var(--good)' : hp > 0.25 ? 'var(--warn)' : 'var(--bad)';
    const hdg = ((((-(veh.kind === 'soldier' ? veh.look : veh.yaw) * 180) / Math.PI) % 360) + 360) % 360;
    const cells = [];
    const kts = (Math.abs(veh.kind === 'heli' || veh.kind === 'jet' ? veh.vel.length() : veh.speed) / KTS).toFixed(0);
    cells.push(['SPD', `${veh.speed < 0 ? '-' : ''}${kts} kn`], ['HDG', `${hdg.toFixed(0).padStart(3, '0')}°`]);
    if (veh.kind === 'jet' || veh.kind === 'heli') { cells.push(['ALT', `${Math.max(0, veh.pos.y).toFixed(0)} m`], ['V/S', `${veh.vel.y.toFixed(0)} m/s`]); if (veh.kind === 'jet') { cells.push(['G', veh.gSmooth.toFixed(1)], ['THR', `${(veh.throttle * 100).toFixed(0)}%${veh.abOn ? ' AB' : ''}`], ['GEAR', veh.gearDown ? 'DOWN' : 'UP'], ['FLR', String(veh.flares)]); if (veh.def.cloak) cells.push(['CLOAK', veh.cloaked ? `${veh.cloakT.toFixed(0)} s` : veh.cloakCd > 0 ? `wait ${veh.cloakCd.toFixed(0)}` : 'READY']); } else cells.push(['RPM', `${(veh.rpm * 100).toFixed(0)}%`], ['FLR', String(veh.flares)], ['CREW', String(veh.passengers.length + (veh.pilot ? 1 : 0))]); }
    else if (veh.kind === 'sub') cells.push(['DEPTH', `${veh.depth.toFixed(0)} m`], ['ORDER', `${veh.depthT.toFixed(0)} m`], ['SCOPE', veh.scopeA > 0.9 ? 'UP' : veh.scope ? 'RAISING' : 'DOWN'], ['SONAR', veh.pingT > world.t ? 'ACTIVE' : 'PASSIVE']);
    else if (veh.kind === 'ship') cells.push(['THR', `${(veh.throttle * 100).toFixed(0)}%`], ['RUD', veh.rudderA > 0.05 ? 'PORT' : veh.rudderA < -0.05 ? 'STBD' : 'MID'], ['CREW', String(veh.def.crew)], ['FLOOD', `${(veh.flood * 100).toFixed(0)}%`]);
    else cells.push(['STANCE', u.swim ? 'SWIM' : u.ctl.crouch ? 'CROUCH' : 'STAND'], ['ON', u.on ? (u.on.name || u.on.def.label) : u.swim ? 'Sea' : 'Island']);
    E.grid.innerHTML = cells.map((c) => `<div><span>${c[0]}</span>${c[1]}</div>`).join('');
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
    if (veh.kind === 'jet' && veh.state === 'fly') { if (veh.speed < veh.def.stall * 1.15) w.push(['STALL', '']); if (veh.pos.y < 120 && veh.vel.y < -25) w.push(['PULL UP', '']); if (veh.gearDown && veh.speed > 160) w.push(['GEAR', 'amber']); }
    if (veh.kind === 'sub' && veh.pinged > world.t) w.push(['POSITION REVEALED', 'amber']);
    if (veh.hp < veh.maxHp * 0.25 && veh.alive) w.push(['CRITICAL DAMAGE', 'amber']);
    const wk = w.map((x) => x[0]).join('|'); if (E.warn._k !== wk) { E.warn._k = wk; E.warn.innerHTML = w.map((x) => `<div class="${x[1]}">${x[0]}</div>`).join(''); }
    warnT -= step; if (warnT <= 0 && w.length && w[0][1] === '') { warnT = 0.7; audio.play(w[0][0] === 'STALL' ? 'stall' : 'warning'); }
    if (E.hint._t !== player.hint) { E.hint.textContent = player.hint; E.hint._t = player.hint; }
    if (player.scopeView) E.scopetxt.textContent = `PERISCOPE  ${hdgOf(player.yaw)}°  x${(1 + player.zoom * 3).toFixed(1)}`;
    // score strip: carrier health for both sides
    const me = u.nation, en = otherNation(me), c1 = world.carriers[me], c2 = world.carriers[en];
    const cvBar = (c, n) => `<div class="cv"><span style="color:${NATIONS[n].color}">${NATIONS[n].name.toUpperCase()}</span><i><b style="width:${c ? clamp(c.hp / c.maxHp, 0, 1) * 100 : 0}%;background:${NATIONS[n].color}"></b></i></div>`;
    const sh = cvBar(c1, me) + `<span>${world.score[me]} : ${world.score[en]}</span>` + cvBar(c2, en); if (E.score._h !== sh) { E.score.innerHTML = sh; E.score._h = sh; }
    racc += step; if (racc > 0.18) { racc = 0; this.radar(veh); if (!E.map.hidden) this.bigMap(veh); }
  },

  blip(ctx, u, x, y, s, mine) {
    ctx.fillStyle = u.nation === mine ? NATIONS[mine].color : '#ff4a3d'; if (u.isPlayer) ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (u.kind === 'ship') ctx.rect(x - s, y - s, s * 2, s * 2); else if (u.kind === 'sub') { ctx.moveTo(x, y - s * 1.3); ctx.lineTo(x + s * 1.3, y); ctx.lineTo(x, y + s * 1.3); ctx.lineTo(x - s * 1.3, y); }
    else if (u.kind === 'jet' || u.kind === 'heli') { ctx.moveTo(x, y - s * 1.4); ctx.lineTo(x + s * 1.2, y + s); ctx.lineTo(x - s * 1.2, y + s); } else ctx.arc(x, y, s * 0.7, 0, 7);
    ctx.fill();
    if (u.type === 'carrier' || u.type === 'battlecruiser') { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.strokeRect(x - s * 2, y - s * 2, s * 4, s * 4); }
  },
  radar(u) {
    const c = rctx, S = 256, R = S / 2, range = u.kind === 'soldier' ? 900 : u.kind === 'jet' ? 12000 : u.kind === 'heli' ? 7000 : u.type === 'patrol' ? 4000 : 7000, k = (R - 6) / range;
    const yaw = u.kind === 'soldier' ? u.look : u.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
    c.clearRect(0, 0, S, S); c.save(); c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.clip();
    c.fillStyle = 'rgba(6,22,34,.82)'; c.fillRect(0, 0, S, S);
    const tx = (wx, wz) => { const dx = wx - u.pos.x, dz = wz - u.pos.z; return [R + (dx * cs - dz * sn) * k, R + (dx * sn + dz * cs) * k]; };
    c.fillStyle = 'rgba(92,120,84,.75)'; for (const is of world.islands) { const [x, y] = tx(is.x, is.z); c.beginPath(); c.arc(x, y, is.r * k, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(140,190,220,.25)'; c.lineWidth = 1; for (const f of [0.33, 0.66, 1]) { c.beginPath(); c.arc(R, R, (R - 6) * f, 0, 7); c.stroke(); }
    c.beginPath(); c.moveTo(R, 6); c.lineTo(R, S - 6); c.moveTo(6, R); c.lineTo(S - 6, R); c.stroke();
    for (const e of world.units) { if (!e.alive || (e.nation !== u.nation && !e.seen) || (e.kind === 'soldier' && e.aboard)) continue; const [x, y] = tx(e.pos.x, e.pos.z); if (Math.hypot(x - R, y - R) > R) continue; this.blip(c, e, x, y, e === u ? 4 : 3.2, u.nation); }
    c.fillStyle = '#ffb347'; for (const m of world.missiles || []) { if (m.nation === u.nation) continue; const [x, y] = tx(m.pos.x, m.pos.z); c.fillRect(x - 1.5, y - 1.5, 3, 3); }
    c.restore(); c.strokeStyle = 'rgba(160,200,230,.5)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 2, 0, 7); c.stroke();
    E.rlbl.textContent = `RADAR ${(range / 1000).toFixed(range < 1000 ? 1 : 0)} KM`;
  },
  bigMap(u) {
    const c = mctx, S = 640, k = S / (MAP.half * 2 + 2000), tx = (x) => S / 2 + x * k;
    c.fillStyle = '#0d2a3f'; c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(140,190,220,.12)'; for (let i = 0; i <= 10; i++) { c.beginPath(); c.moveTo(i * 64, 0); c.lineTo(i * 64, S); c.moveTo(0, i * 64); c.lineTo(S, i * 64); c.stroke(); }
    c.fillStyle = '#5c7854'; for (const is of world.islands) { c.beginPath(); c.arc(tx(is.x), tx(is.z), is.r * k, 0, 7); c.fill(); }
    for (const e of world.units) { if (!e.alive || (e.nation !== u.nation && !e.seen) || (e.kind === 'soldier' && e.aboard)) continue; this.blip(c, e, tx(e.pos.x), tx(e.pos.z), e === u ? 5 : e.kind === 'soldier' ? 2 : 3.5, u.nation); }
    c.fillStyle = '#fff'; c.font = '11px sans-serif'; for (const n of ['aethia', 'extro']) { const cv = world.carriers[n]; if (cv && cv.alive && (n === u.nation || cv.seen)) c.fillText(cv.name, tx(cv.pos.x) + 10, tx(cv.pos.z) + 4); }
    const st = save.stats, me = u.nation, en = otherNation(me), count = (n, f) => world.units.filter((x) => x.alive && x.nation === n && f(x)).length;
    E.sb.innerHTML = `<h3>Battle</h3>
      <div class="stat"><span>${NATIONS[me].name} score</span><span>${world.score[me]}</span></div><div class="stat"><span>${NATIONS[en].name} score</span><span>${world.score[en]}</span></div>
      <div class="stat"><span>Your kills this battle</span><span>${world.playerKills || 0}</span></div>
      <div class="stat"><span>Our ships / aircraft</span><span>${count(me, (x) => x.kind === 'ship' || x.kind === 'sub')} / ${count(me, (x) => x.isAir)}</span></div>
      <div class="stat"><span>Enemy contacts held</span><span>${world.units.filter((x) => x.alive && x.nation === en && x.seen).length}</span></div>
      <h3 style="margin-top:1.2em">Service record</h3>
      <div class="stat"><span>Ships sunk</span><span>${st.sinkings}</span></div><div class="stat"><span>Aircraft shot down</span><span>${st.aircraft}</span></div>
      <div class="stat"><span>Battles won / lost</span><span>${st.battlesWon} / ${st.battlesLost}</span></div>
      <p style="color:var(--dim);font-size:.8em;margin-top:1.4em">Tab closes the map. White marker: you. Squares: ships. Diamonds: submarines. Triangles: aircraft.</p>`;
  },
};
function hdgOf(yaw) { return String(Math.round(((((-yaw * 180) / Math.PI) % 360) + 360) % 360)).padStart(3, '0'); }
