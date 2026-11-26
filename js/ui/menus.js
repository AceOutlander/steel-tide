// Menus: title, nation select, the 3D unit showroom, settings (with key remapping), how to play, pause, notices.
import * as THREE from 'three';
import { gfx } from '../gfx/renderer.js';
import { audio } from '../audio/audio.js';
import { input } from '../core/input.js';
import { save } from '../core/save.js';
import { NATIONS, UNITS, UNIT_ORDER, WEAPONS, QUALITY, DEFAULT_KEYS, KEY_LABELS, VERSION, otherNation } from '../core/config.js';
import { el, KTS, clamp } from '../core/util.js';
import { world } from '../world/world.js';
import { BUILDERS } from '../sim/factory.js';
import { econ, fmtCredits, PAY, PAY_TABLE, CREDIT } from '../core/economy.js';
import { cosmetics, ITEMS, ITEM, TIERS, SLOTS, PAINT_UNITS, MAX_ACCESSORIES } from '../core/cosmetics.js';
import { applyPaint } from '../gfx/paint.js';
import { store } from '../core/store.js';
import { battle } from '../world/battle.js';
import { buildSoldier, animateSoldier } from '../units/human.js';

let app = null, root = null, cur = null, stack = [];
let nation = 'aethia', unit = 'patrol', startDock = false, startSD = false, opts = {};
const ul = { confirm: false, msg: '' }; // the Super Destroyer unlock: the confirm step and its message
const LOCK = '<svg class="lockic" viewBox="0 0 16 16" width="12" height="12" aria-label="locked"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z" fill="currentColor"/></svg>';
const show = { scene: null, cam: null, model: null, angle: 0, t: 0, cache: {} };

const insignia = (n) => n === 'aethia'
  ? '<svg class="insig" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1d4f8f"/><circle cx="50" cy="50" r="31" fill="#f4f7fa"/><circle cx="50" cy="50" r="14" fill="#1d4f8f"/></svg>'
  : '<svg class="insig" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1b2420"/><path d="M18 58 50 26l32 32-9 9-23-23-23 23z" fill="#d8321e"/><path d="M27 76 50 53l23 23-8 8-15-15-15 15z" fill="#f08a1c"/></svg>';
const fastRow = () => `<div class="fastrow"><button class="switch" role="switch" data-fast aria-checked="${save.settings.fast}" aria-label="Fast Graphics"></button><div><b>Fast Graphics</b><span>For older laptops and PCs without a graphics card. Takes effect at once.</span></div></div>`;
const keyName = (c) => (c || '').replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('ControlRight', 'Ctrl').replace('ShiftRight', 'Shift').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Escape', 'Esc').replace('Equal', '+').replace('Minus', '-').replace('NumpadAdd', 'Num +').replace('NumpadSubtract', 'Num -');

const wallet = () => `<div class="wallet" title="Credits">${CREDIT} ${Math.round(econ.credits).toLocaleString('en-US')}</div>`;
const SCREENS = {
  title: () => `<div class="screen dim"><div class="title-col">
      <div class="logo">STEEL<br>TIDE<small>MODERN NAVAL WARFARE</small></div>
      <div class="menu"><button class="btn primary" data-go="nation">Play</button><button class="btn" data-go="hangar">Hangar</button><button class="btn" data-go="settings">Settings</button><button class="btn" data-go="howto">How to Play</button></div>
      ${wallet()}
      ${store.enabled ? `<div class="storerow"><button class="btn small" data-go="store">Get Credits</button><button class="btn small" data-go="account">${store.signedIn ? 'Account' : 'Sign in'}</button></div>` : '<div class="soon">Store coming soon</div>'}
      ${fastRow()}
      <a class="homelink" href="/">← Back to HunterAceDev</a>
    </div><div class="ver">${VERSION} · PC · keyboard &amp; mouse</div></div>`,
  nation: () => `<div class="screen center"><div><div class="topbar" style="position:static;margin-bottom:1.5em"><h1>Choose your nation</h1><button class="btn small" data-back>Back</button></div>
      <div class="nations">${['aethia', 'extro'].map((n) => `<button class="nation-card" data-nation="${n}">${insignia(n)}<h3 style="color:${NATIONS[n].color}">${NATIONS[n].name}</h3><p>${NATIONS[n].blurb}</p></button>`).join('')}</div>
      <p style="color:var(--dim);margin-top:1.4em;text-align:center">Both nations field the same unit types with identical performance. Only the look and the names differ.</p></div></div>`,
  units: () => {
    const cats = ['Surface', 'Subsurface', 'Air', 'On Foot'], N = NATIONS[nation];
    return `<div class="screen"><div class="topbar"><h1 style="color:${N.color}">${N.name} · choose your unit</h1><span style="display:flex;gap:.8em;align-items:center">${wallet()}${opts.redeploy ? '' : '<button class="btn small" data-back>Back</button>'}</span></div>
      ${opts.redeploy ? `<div class="redeploy-banner">${opts.change ? 'Change unit' : opts.next ? (battle.lastWinner === nation ? 'Victory! The enemy carrier is sunk. A new battle begins' : battle.lastWinner ? 'Defeat. Our carrier is lost. A new battle begins' : 'New battle') : 'Unit lost. Redeploy'}</div>` : ''}
      <div class="unitsel"><div class="unitlist">${cats.map((c) => `<h4>${c}</h4>${UNIT_ORDER.filter((k) => UNITS[k].cat === c).map((k) => `<button class="unitbtn${k === unit ? ' on' : ''}" data-unit="${k}">${UNITS[k].label}${cosmetics.unlocked(k) ? '' : ' ' + LOCK}<small>${N.classes[k]}</small></button>`).join('')}`).join('')}
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
      ${slider('shake', 'Camera shake', 0, 1, 0.05, s.shake ?? 0.5, (v) => Math.round(v * 100) + '%')}
      <div class="row"><label>Motion blur<br><small style="color:var(--dim)">Blends each frame into the next. High and Ultra quality only</small></label><button class="switch" role="switch" data-toggle="motionBlur" aria-checked="${!!s.motionBlur}" aria-label="Motion blur"></button></div>
      <h3>Gameplay</h3>
      <div class="row"><label>Aim assistance<br><small style="color:var(--dim)">Full: guns set range and lead on the target under the reticle, and a marker shows the aim-off. Partial: range only. Off: aim by eye</small></label><div class="seg">${['full', 'partial', 'off'].map((k) => `<button data-opt="aimAssist" data-val="${k}" class="${(s.aimAssist || 'full') === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
      <div class="row"><label>Difficulty<br><small style="color:var(--dim)">How accurately and how quickly the other side shoots</small></label><div class="seg">${['easy', 'normal', 'hard'].map((k) => `<button data-opt="difficulty" data-val="${k}" class="${(s.difficulty || 'normal') === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
      <div class="row"><label>Colour-blind colours<br><small style="color:var(--dim)">Blue for your side and orange for the enemy, instead of green and red</small></label><button class="switch" role="switch" data-toggle="colorblind" aria-checked="${!!s.colorblind}" aria-label="Colour-blind colours"></button></div>
      <div class="row"><label>Radar legend<br><small style="color:var(--dim)">Always show what the radar shapes mean (it shows by itself for your first three battles)</small></label><button class="switch" role="switch" data-toggle="radarLegend" aria-checked="${!!s.radarLegend}" aria-label="Radar legend"></button></div>
      <h3>Controls</h3>
      ${slider('sens', 'Mouse sensitivity', 0.3, 3, 0.05, s.sens, (v) => Number(v).toFixed(2))}
      <div class="row"><label>Invert Y</label><button class="switch" role="switch" data-toggle="invertY" aria-checked="${s.invertY}" aria-label="Invert Y"></button></div>
      <div class="row"><label>Invert aircraft pitch (W = nose up)</label><button class="switch" role="switch" data-toggle="invertPlane" aria-checked="${!!s.invertPlane}" aria-label="Invert aircraft pitch"></button></div>
      <h3>Sound</h3>
      ${slider('sfx', 'Effects volume', 0, 1, 0.05, s.sfx, (v) => Math.round(v * 100) + '%')}
      ${slider('music', 'Music volume', 0, 1, 0.05, s.music, (v) => Math.round(v * 100) + '%')}
      <h3>Keys <small style="color:var(--dim);text-transform:none;letter-spacing:0">click a key, then press the new one</small></h3>
      <div class="keys">${Object.keys(KEY_LABELS).map((a) => `<span>${KEY_LABELS[a]}</span><button class="kb" data-key="${a}">${save.keysFor(a).map(keyName).join(' / ')}</button>`).join('')}</div>
      <div class="actions"><button class="btn small" data-resetkeys>Reset keys</button><button class="btn primary" data-back>Done</button></div></div></div>`;
  },
  howto: () => `<div class="screen center"><div class="panel"><h2>How to Play</h2><div class="howto">
      <div><h3>The battle</h3><p>Two fleets meet in one sea. <b>Sink the enemy carrier to win</b>; lose yours and the battle is lost. Your side's ships, aircraft, submarines and marines fight alongside you the whole time.</p><p>If your unit is destroyed you pick a new one and go straight back in.</p>
        <h3>Everywhere</h3><p><b>Mouse</b> look and aim · <b>Left click</b> fire · <b>Right click</b> zoom · <b>Wheel / 1-4</b> weapons</p><p><b>E</b> get in or out, take a gun · <b>V</b> camera · <b>Tab</b> score and map · <b>Esc</b> pause</p>
        <h3>Ships</h3><p><b>W / S</b> throttle (it stays where you set it) · <b>A / D</b> rudder. Ships gather way slowly and turn wide: plan ahead.</p><p>Aim with the mouse and the turrets follow. AA guns and SAM launchers are worked by the crew.</p><p><b>Battlecruiser and Super Destroyer:</b> <b>U</b> boards the docked submarine and launches it; your crew keeps fighting the ship. In the submarine, <b>B</b> takes you back to the ship and the sub's own crew brings it home to dock.</p><p><b>Super Destroyer</b> (unlocked with Credits): twelve heavy turrets, and its SAM launchers and AA guns can be picked with <b>2</b> and <b>3</b> and fired by hand. It has a helipad, decks a marine can walk through, and a dock under the waterline: the submarine leaves and returns through doors in the stern, about 9 m down.</p></div>
      <div><h3>Submarines</h3><p><b>R / F</b> (or Space / Ctrl) rise and dive · <b>P</b> periscope (works at periscope depth, about 13 m) · <b>Q</b> active sonar ping: shows contacts but gives your position away.</p><p>Attack sub: <b>Left click</b> fires a torpedo along your heading; aim at a ship to give it a target. To dock, come up astern of the ship on its heading: on the surface for the battlecruiser, about 9 m down for the Super Destroyer. It docks by itself when lined up, or press <b>E</b>.</p>
        <h3>Planes</h3><p>On the catapult hold <b>Shift</b> to full throttle to launch. <b>W</b> nose down · <b>S</b> nose up · <b>A / D</b> bank and turn (let go and the wings level) · <b>Q / E</b> rudder for small corrections · <b>Shift / Ctrl</b> throttle, and on the fighter keep holding Shift past 100% for afterburner. The <b>mouse</b> only looks around. Guns and missiles point where the nose points (the cross marker); the small winged circle shows where the plane is actually going. <b>G</b> gear · <b>X</b> flares and chaff.</p><p>Hard turns bleed speed. Below stall speed the nose drops. To land: gear down, slow to about 130 kn over the stern, and touch down on the deck.</p><p><b>Bomber:</b> <b>C</b> cloak (time limited). The yellow ring shows where bombs will fall.</p></div>
      <div><h3>Helicopters</h3><p><b>W / S</b> collective (up and down) · <b>mouse</b> tilts (pitch and roll) · <b>A / D</b> turn · <b>Space</b> levels out · <b>X</b> flares.</p><p>Land gently on helipads, decks and islands. The transport carries marines; the gunship has a chin gun and guided missiles (hold the target near the centre to lock).</p>
        <h3>Marine</h3><p><b>WASD</b> move · <b>Shift</b> run · <b>C</b> crouch · <b>Space</b> jump · <b>R</b> reload.</p><p>Walk up to a machine gun and press <b>E</b> to man it. Board a landed helicopter with <b>E</b>; as a passenger press <b>T</b> to take the controls. Overboard you swim slowly: reach a ship and press <b>E</b> to climb back.</p><p>On a Super Destroyer the hatch forward of the helipad leads below: corridors, the mess, bunk rooms, the armoury, the engine rooms, a stair tower up to the bridge, and the submarine dock, where <b>E</b> boards the sub.</p>
        <h3>Missiles</h3><p>A <b>RADAR LOCK</b> or <b>MISSILE</b> warning means act now: drop flares (<b>X</b>), turn hard across the missile, or get low.</p>
        <h3>Rearming</h3><p>Ammunition runs out. A yellow <b>REARM</b> marker shows the nearest place to get more.</p><p><b>Planes:</b> land on your carrier (gear down, onto the strip from astern); the deck crew rearm, refuel and repair in 20 to 40 s, then taxi to the catapult. <b>Helicopters:</b> land on the carrier or a Super Destroyer's helipad and stay down for 15 to 30 s. <b>Attack sub:</b> the four tubes reload from 12 torpedoes carried aboard; when those are gone, dock with a Battlecruiser or Super Destroyer for about 30 s. Ships carry large magazines and cannot rearm.</p></div>
    </div><div class="actions"><button class="btn" data-go="pay">Pay: how Credits are earned</button><button class="btn primary" data-back>Back</button></div></div></div>`,
  pay: () => `<div class="screen center"><div class="panel" style="width:40em"><h2>Pay</h2>
      <p style="color:var(--dim);line-height:1.5">Credits (${CREDIT}) are earned in battle and spent on looks in the Hangar. Only your own kills pay; an assist pays half.</p>
      <table class="paytable"><tr><th>Destroyed</th><th>Pays</th></tr>${PAY_TABLE.map((r) => `<tr><td>${r[0]}</td><td>${fmtCredits(r[1])}</td></tr>`).join('')}
        <tr><td>Assist</td><td>half the value</td></tr><tr><td>Taking part in a battle</td><td>${fmtCredits(PAY.participation)}</td></tr><tr><td>Winning the battle</td><td>${fmtCredits(PAY.win)} more</td></tr></table>
      <p style="line-height:1.5">Soldiers pay ${fmtCredits(PAY.soldier)} each, up to ${fmtCredits(PAY.infantryCap)} per battle, so going down with a ship doesn't flood your wallet.</p>
      <p style="color:var(--dim);line-height:1.5">That limit counts everyone: marines you shoot, and the crews lost with the ships and aircraft you destroy. Ships and aircraft themselves always pay in full. The meter beside your Credits in battle shows how much infantry pay is left.</p>
      <div class="actions"><button class="btn primary" data-back>Back</button></div></div></div>`,
  // Get Credits: the four packs. Prices come from the server and are always shown with CAD; Credits always with the anchor.
  store: () => `<div class="screen center"><div class="panel" style="width:46em"><h2>Get Credits</h2>
      ${!store.signedIn ? `<p>Sign in to buy Credits, so they are kept with your account on any computer.</p><div class="actions"><button class="btn primary" data-go="account">Sign in</button><button class="btn" data-back>Back</button></div>`
    : `<p style="color:var(--dim)">Credits (${CREDIT}) buy looks in the Hangar: paint, helmets, uniforms and accessories. They never change how a unit performs. Your Credits: <b style="color:#ffe9a8">${fmtCredits(econ.credits)}</b></p>
      <div class="packs">${(store.packs || []).map((p) => `<div class="pack${p.best ? ' best' : ''}">${p.best ? '<span class="tag">BEST VALUE</span>' : ''}<b>${fmtCredits(p.credits)}</b><span class="price">${p.label}</span><button class="btn primary small" data-pack="${p.id}">Buy</button></div>`).join('') || '<p>Loading the packs…</p>'}</div>
      <p class="hmsg">${st.msg}</p>
      <p style="color:var(--dim);font-size:.85em;line-height:1.5">Payments are handled by Stripe and open in a new tab. Prices are in Canadian dollars (CAD). Purchases may need a parent's or guardian's permission. <a href="store.html" target="_blank" rel="noopener" style="color:#9fd0ff">What you are buying, refunds, accounts and privacy</a></p>
      <div class="actions"><button class="btn" data-go="account">Account and purchases</button><button class="btn primary" data-back>Back</button></div>`}</div></div>`,
  account: () => {
    const m = store.me, pur = (m && m.purchases) || [];
    return `<div class="screen center"><div class="panel" style="width:36em"><h2>Account</h2>
      ${store.signedIn ? `<div class="stat"><span>Signed in as</span><span>${m ? m.email : '…'}</span></div><div class="stat"><span>Credits</span><span>${fmtCredits(econ.credits)}</span></div>
        <div class="stat"><span>Server</span><span>${store.online ? 'connected' : 'offline: battles will sync later, purchases wait until it is back'}</span></div>
        <h3>Purchases</h3>${pur.length ? pur.map((p) => `<div class="stat"><span>${new Date(p.created * 1000).toLocaleDateString()} · ${p.status}</span><span>${fmtCredits(p.credits)} · ${'$' + (p.amount / 100).toFixed(2)} ${String(p.currency).toUpperCase()}</span></div>`).join('') : '<p style="color:var(--dim)">No purchases yet.</p>'}
        <p class="hmsg">${st.msg}</p>
        <div class="actions"><button class="btn" data-signout>Sign out</button><button class="btn" data-delacct>${st.del ? 'Confirm: delete my account for good' : 'Delete my account'}</button><button class="btn primary" data-back>Back</button></div>`
      : `<p style="color:var(--dim);line-height:1.5">Sign in with your email. We send a one-time code: there is no password. Playing as a guest still works; your Credits and looks then stay on this computer only. The first time you sign in, what you have earned here moves into your account.</p>
        <label class="field">Email<input id="acct-email" type="email" autocomplete="email" value="${st.email}" placeholder="you@example.com"></label>
        ${st.sent ? '<label class="field">Code from the email<input id="acct-code" inputmode="numeric" maxlength="6" placeholder="6 digits"></label>' : ''}
        <p class="hmsg">${st.msg}</p>
        <div class="actions">${st.sent ? '<button class="btn primary" data-verify>Sign in</button><button class="btn" data-sendcode>Send a new code</button>' : '<button class="btn primary" data-sendcode>Email me a code</button>'}<button class="btn" data-back>Back</button></div>`}
      <p style="font-size:.85em;margin-top:1em"><a href="store.html" target="_blank" rel="noopener" style="color:#9fd0ff">How accounts work, and privacy</a></p></div></div>`;
  },
  // Hangar: try on, buy and equip looks. Left: tabs and the list; middle: the 3D preview; right: the selected item.
  hangar: () => {
    const tabs = [['paint', 'Paint'], ['helmet', 'Helmets'], ['uniform', 'Uniforms'], ['accessory', 'Accessories']], N = NATIONS[hg.nation];
    const list = ITEMS.filter((i) => i.kind === hg.tab);
    const row = (i) => { const own = cosmetics.owns(i.id), eq = cosmetics.isEquipped(hg.nation, i.id, hg.unit), na = !cosmetics.fits(i.id, hg.unit); return `<button class="hitem${i.id === hg.sel ? ' on' : ''}${na ? ' na' : ''}" data-item="${i.id}" style="--tier:${TIERS[i.tier].color}"><b>${i.name}</b><small>${i.kind === 'accessory' ? SLOTS[i.slot] + ' · ' : ''}${TIERS[i.tier].label}</small>${na ? `<em class="only">${ONLY_AIR}</em>` : ''}<span class="st">${eq ? 'EQUIPPED' : own ? 'OWNED' : '<i class="lock"></i>' + cosmetics.priceText(i)}</span></button>`; };
    return `<div class="screen"><div class="topbar"><h1>Hangar</h1><span style="display:flex;gap:.8em;align-items:center">${wallet()}${store.enabled ? '<button class="btn small" data-store>Get Credits</button>' : ''}<button class="btn small" data-back>Back</button></span></div>
      <div class="unitsel"><div class="unitlist"><div class="seg htabs">${tabs.map((t) => `<button data-htab="${t[0]}" class="${hg.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
        <div class="seg" style="margin:.7em 0">${['aethia', 'extro'].map((n) => `<button data-hnation="${n}" class="${hg.nation === n ? 'on' : ''}" style="color:${NATIONS[n].color}">${NATIONS[n].name}</button>`).join('')}</div>
        ${hg.tab === 'paint' ? `<label class="hsel">Show on <select data-hunit>${PAINT_UNITS.map((k) => `<option value="${k}"${k === hg.unit ? ' selected' : ''}>${UNITS[k].label}</option>`).join('')}</select></label>` : hg.tab === 'accessory' ? `<p class="hnote">Wear up to ${MAX_ACCESSORIES} at once, one per slot. Wearing now: ${cosmetics.set(hg.nation).acc.length}.</p>` : ''}
        ${list.map(row).join('')}</div><div class="hdrag" id="hdrag"></div><div class="unitinfo" id="hinfo"></div></div></div>`;
  },
  // after every battle: what it paid, line by line
  results: () => {
    const r = econ.last || {}, row = (a, b, note = '') => `<div class="stat"><span>${a}${note ? ` <em>${note}</em>` : ''}</span><span>${fmtCredits(b || 0)}</span></div>`;
    return `<div class="screen center"><div class="panel" style="width:30em"><h2 style="color:${r.won ? 'var(--good)' : 'var(--bad)'}">${r.won ? 'Victory' : 'Defeat'}</h2>
      <p style="color:var(--dim)">${r.won ? 'The enemy carrier is sunk.' : 'Our carrier is lost.'} Your kills: ${r.kills || 0}${r.assists ? `, assists: ${r.assists}` : ''}.</p>
      ${row('Ships and submarines', r.ships)}${row('Aircraft', r.aircraft)}${row(`Infantry (${fmtCredits(PAY.infantryCap)} max)`, r.infantry, r.capped ? 'limit reached' : '')}${row('Participation', r.participation)}${row('Win bonus', r.win)}
      <div class="stat total"><span>This battle</span><span>${fmtCredits(r.total || 0)}</span></div>
      <div class="stat"><span>Your Credits</span><span>${fmtCredits(econ.credits)}</span></div>
      <div class="actions"><button class="btn primary" data-continue>Next battle</button></div></div></div>`;
  },
  pause: () => `<div class="screen center"><div class="panel" style="width:26em;text-align:center"><h2>Paused</h2>
      <div class="menu" style="width:100%;margin:0"><button class="btn primary" data-resume>Resume</button><button class="btn" data-change>Change unit</button><button class="btn" data-go="settings">Settings</button><button class="btn" data-go="howto">How to Play</button><button class="btn" data-menu>Main menu</button></div>
      <div style="margin-top:1em;text-align:left">${fastRow().replace('width:24em', '')}</div></div></div>`,
};

// ---- store and account screens ----
const st = { msg: '', email: '', sent: false, del: false, fresh: false };
// ---- Hangar ----
const hg = { tab: 'paint', sel: '', unit: 'fighter', nation: 'aethia', confirm: '', msg: '', spin: 0.6, zoom: 1, drag: false };
const ONLY_AIR = 'Jets and helicopters only';
// The unit on show is the player's choice ("Show on"): selecting an item never changes it. A paint that unit cannot
// wear is not drawn on it; the unit stays as it is equipped now.
function hangarPreview() {
  const it = ITEM[hg.sel]; if (!it) return;
  if (it.kind === 'paint') showroomSet({ nation: hg.nation, unit: hg.unit, paint: cosmetics.fits(it.id, hg.unit) ? it.key : cosmetics.paintFor(hg.nation, hg.unit) });
  else { const o = cosmetics.outfit(hg.nation); if (it.kind === 'helmet') o.helmet = it.key; else if (it.kind === 'uniform') o.uniform = it.key; else { o.acc = o.acc.filter((k) => ITEM['acc.' + k].slot !== it.slot); if (o.acc.length >= MAX_ACCESSORIES) o.acc.pop(); o.acc.push(it.key); } showroomSet({ nation: hg.nation, unit: 'marine', outfit: o }); }
}
function hangarInfo() {
  const box = el('hinfo'), it = ITEM[hg.sel]; if (!box || !it) return;
  const own = cosmetics.owns(it.id), eq = cosmetics.isEquipped(hg.nation, it.id, hg.unit), short = Math.max(0, it.price - econ.credits), T = TIERS[it.tier];
  const na = !cosmetics.fits(it.id, hg.unit), allLabel = it.air ? 'Apply to every aircraft' : 'Apply to all units';
  const tryAir = na ? '<button class="btn" data-hair>Preview on an aircraft</button>' : '';
  let act;
  if (!own) act = (short > 0 ? `<p class="need">Need ${fmtCredits(short)} more</p><button class="btn" data-store>${store.enabled ? 'Get Credits' : 'Get Credits (store coming soon)'}</button>`
    : `<button class="btn primary" data-buy="${it.id}">${hg.confirm === it.id ? `Confirm: pay ${fmtCredits(it.price)}` : `Buy for ${fmtCredits(it.price)}`}</button>`) + tryAir;
  else if (it.kind === 'paint') act = (na ? tryAir : `<button class="btn primary" data-equip="${it.id}">${eq ? 'Remove from' : 'Paint'} the ${UNITS[hg.unit].label}</button>`) + `<button class="btn" data-equip="${it.id}" data-all="1">${allLabel}</button>`;
  else act = `<button class="btn primary" data-equip="${it.id}">${eq ? 'Unequip' : 'Equip'}</button>`;
  box.innerHTML = `<h2 style="color:${T.color}">${it.name}</h2><div class="cls" style="color:${T.color}">${T.label}${it.kind === 'accessory' ? ' · ' + SLOTS[it.slot] : ''}</div><p>${it.desc}</p>
    ${it.pair && !own ? `<p>Comes with: ${ITEM[it.pair].name} (${ITEM[it.pair].kind}).</p>` : ''}
    <div class="stat"><span>Price</span><span>${cosmetics.priceText(it)}</span></div><div class="stat"><span>Status</span><span>${eq ? 'Equipped' : own ? 'Owned' : na ? 'Not owned' : 'Preview only'}</span></div><div class="stat"><span>Your Credits</span><span>${fmtCredits(econ.credits)}</span></div>
    <p class="hmsg">${hg.msg || (na ? `${ONLY_AIR}: the ${UNITS[hg.unit].label} cannot wear it, so it is shown as it is.` : own ? '' : 'You are trying it on. Looks only: nothing here changes how a unit performs.')}</p>
    <div class="hact">${act}</div><p class="hnote">Drag to turn, wheel to zoom. Equipped looks are saved for ${NATIONS[hg.nation].name}.</p>`;
}

function unitInfo() {
  const d = UNITS[unit], N = NATIONS[nation], box = el('unitinfo'); if (!box) return;
  const sp = d.kind === 'soldier' ? `${d.speed.toFixed(0)} m/s running` : `${Math.round(d.speed / KTS)} kn`;
  const wl = d.weapons.length ? d.weapons.map((w) => WEAPONS[w].name).join(', ') : 'None';
  const extra = d.kind === 'jet' ? `<div class="stat"><span>Stall speed</span><span>${Math.round(d.stall / KTS)} kn</span></div><div class="stat"><span>G limit</span><span>${d.gLimit} g</span></div>` : d.kind === 'sub' ? `<div class="stat"><span>Sonar range</span><span>${(d.sonar / 1000).toFixed(1)} km</span></div>` : '';
  const sdAfloat = world.units.some((u) => u.type === 'superdestroyer' && u.nation === nation && u.alive);
  const dockOpt = d.kind === 'sub' ? `<div class="startopt seg"><button data-dock="0" class="${startDock ? '' : 'on'}">Start at sea</button><button data-dock="1" class="${startDock ? 'on' : ''}">Start in the battlecruiser dock</button></div>`
    : d.kind === 'soldier' && sdAfloat ? `<div class="startopt seg"><button data-msd="0" class="${startSD ? '' : 'on'}">Start on the carrier</button><button data-msd="1" class="${startSD ? 'on' : ''}">Start on the Super Destroyer</button></div>` : '';
  const locked = !cosmetics.unlocked(unit), short = locked ? d.unlock - econ.credits : 0;
  const big = d.manualAA ? '<div class="stat"><span>Armament</span><span>12 triple turrets, 10 SAM launchers, 8 AA guns</span></div><div class="stat"><span>Hull sonar</span><span>2.8 km</span></div><div class="stat"><span>Carries</span><span>1 attack submarine (underwater dock), helipad</span></div>' : '';
  const action = !locked ? '<button class="btn primary" data-deploy>Deploy</button>'
    : `<div class="stat"><span>Unlock price</span><span>${fmtCredits(d.unlock)}</span></div><div class="stat"><span>Your Credits</span><span>${fmtCredits(econ.credits)}</span></div><p class="hnote">One purchase unlocks it for both nations, for good.</p>`
      + (short > 0 ? `<p class="need">Need ${fmtCredits(short)} more</p>${store.enabled ? '<button class="btn" data-store>Get Credits</button>' : '<p class="hnote">Store coming soon. Credits are earned in battle.</p>'}`
        : `<button class="btn primary" data-unlock>${ul.confirm ? `Confirm: spend ${fmtCredits(d.unlock)}` : `Unlock for ${fmtCredits(d.unlock)}`}</button>`) + `<p class="hmsg">${ul.msg}</p>`;
  const where = d.kind === 'jet' ? 'Starts on the carrier catapult.' : d.kind === 'heli' ? 'Starts on the carrier helipad.' : d.kind === 'soldier' ? 'Starts on the carrier flight deck, next to the helipad.' : d.manualAA ? 'You take command of your side\'s Super Destroyer, or a new one joins the battle. There is never more than one a side.' : d.kind === 'ship' ? 'You take command of one of the fleet\'s ships.' : '';
  box.innerHTML = `<h2>${d.label}</h2><div class="cls">${N.classes[unit]}</div><p>${d.blurb}</p>
    <div class="stat"><span>Role</span><span>${d.role}</span></div><div class="stat"><span>Crew</span><span>${d.crew.toLocaleString('en-US')}</span></div><div class="stat"><span>Top speed</span><span>${sp}</span></div>
    <div class="stat"><span>Weapons</span><span>${wl}</span></div><div class="stat"><span>Radar range</span><span>${(d.radar / 1000).toFixed(1)} km</span></div>${extra}${big}
    <p style="margin-top:1em;font-size:.88em">${where}</p>${locked ? '' : dockOpt}
    ${action}`;
}

function showroomSet(custom = null) {
  const nation_ = custom ? custom.nation : nation, unit_ = custom ? custom.unit : unit;
  if (!show.scene) {
    show.scene = new THREE.Scene(); show.scene.background = new THREE.Color(0x0b1c2b); show.scene.environment = gfx.scene.environment; show.scene.environmentIntensity = 0.6;
    show.scene.fog = new THREE.Fog(0x0b1c2b, 400, 1800);
    const sun = new THREE.DirectionalLight(0xfff2e0, 3.2); sun.position.set(-0.6, 1, 0.7); show.scene.add(sun, new THREE.HemisphereLight(0xbcd6f0, 0x1a2835, 0.9));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: 0x0f2a3d, roughness: 0.25, metalness: 0.6 })); floor.rotation.x = -Math.PI / 2; show.scene.add(floor); show.floor = floor;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.5 })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; show.scene.add(ring); show.ring = ring;
    show.cam = new THREE.PerspectiveCamera(32, 1, 0.5, 4000); show.pivot = new THREE.Group(); show.scene.add(show.pivot);
  }
  const key = nation_ + ':' + unit_ + (custom ? ':' + (custom.paint || '') + ':' + JSON.stringify(custom.outfit || '') : '');
  show.unit = unit_; show.paint = custom ? custom.paint || '' : cosmetics.paintFor(nation_, unit_);
  if (!show.cache[key]) {
    const nation = nation_, unit = unit_; // the build below uses these names
    let g; if (unit === 'marine') { g = buildSoldier(nation, { role: 'marine', ...(custom && custom.outfit ? custom.outfit : cosmetics.outfit(nation)) }); g.userData.size = 2.6; g.userData.lift = 0; }
    else { g = BUILDERS[unit](nation, 0); applyPaint(g, nation, custom ? custom.paint : cosmetics.paintFor(nation, unit)); const m = g.userData.model, d = m.dims; g.userData.size = Math.max(d.length, d.span || 0, d.beam || 0); g.userData.lift = UNITS[unit].kind === 'jet' || UNITS[unit].kind === 'heli' ? m.gearHeight : UNITS[unit].kind === 'sub' ? d.draft + 1 : d.draft + 0.5; if (m.gear) for (const gr of m.gear) gr.visible = true; if (m.burners) for (const b of m.burners) b.visible = false; }
    show.cache[key] = g; show.keys = show.keys || []; show.keys.push(key); if (show.keys.length > 14) delete show.cache[show.keys.shift()]; // keep the cache small
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
    // the account's balance arrives a moment after the page: the screens that show Credits redraw when it does
    store.onChange = () => { if (cur === 'title' || cur === 'units' || cur === 'hangar') this.refresh(); };
    root.addEventListener('click', (e) => this.click(e));
    root.addEventListener('pointerdown', (e) => { if (cur === 'hangar' && e.target.id === 'hdrag') { hg.drag = true; hg.px = e.clientX; e.target.setPointerCapture(e.pointerId); } });
    root.addEventListener('pointermove', (e) => { if (hg.drag && show.pivot) { show.pivot.rotation.y += (e.clientX - hg.px) * 0.01; hg.px = e.clientX; } });
    root.addEventListener('pointerup', () => { hg.drag = false; }); root.addEventListener('pointercancel', () => { hg.drag = false; });
    root.addEventListener('wheel', (e) => { if (cur === 'hangar' && e.target.id === 'hdrag') hg.zoom = clamp(hg.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.35, 1.6); }, { passive: true });
    root.addEventListener('change', (e) => { if (e.target.dataset.hunit !== undefined) { hg.unit = e.target.value; this.refresh(); } });
    root.addEventListener('pointerover', (e) => { const b = e.target.closest('button'); if (b && b !== this._hov) { this._hov = b; audio.play('hover'); } else if (!b) this._hov = null; }); root.addEventListener('input', (e) => this.inputEv(e));
    el('notice').addEventListener('click', (e) => { if (e.target.dataset.act && this._noticeFn) this._noticeFn(); el('notice').hidden = true; });
    nation = save.data.last.nation; unit = save.data.last.unit;
  },
  show(name, o = {}) {
    if (cur && name !== cur && (name === 'settings' || name === 'howto' || name === 'pay' || name === 'hangar' || name === 'store' || name === 'account')) stack.push(cur); else if (name === 'title' || name === 'pause' || (name === 'units' && o.redeploy)) stack = [];
    if (name === 'results') opts = o;
    if (name === 'units') { opts = o; if (o.redeploy) nation = world.playerNation; }
    if (name === 'hangar' && !hg.sel) { hg.nation = world.playerNation || nation; hg.sel = ITEMS.find((i) => i.kind === hg.tab).id; }
    cur = name; root.innerHTML = SCREENS[name](); this.showroomActive = name === 'units' || name === 'hangar';
    if (app) app.syncHud(); // a menu is open: the battle HUD goes
    if (name === 'hangar') { hangarPreview(); hangarInfo(); }
    if (name === 'store' && store.signedIn && !store.packs) store.loadPacks().then(() => { if (cur === 'store') this.refresh(); });
    if (name === 'account' && store.signedIn && !st.fresh) { st.fresh = true; store.refresh().then(() => { if (cur === 'account') this.refresh(); }); }
    if (name === 'units') { showroomSet(); unitInfo(); document.documentElement.style.setProperty('--nation', NATIONS[nation].color); }
    if (name === 'settings') this.syncFast();
  },
  refresh() { const st = stack; this.show(cur, opts); stack = st; },
  get open() { return cur !== null; },
  // what the showroom is showing now (checks): the unit, the paint scheme given to it, and whether the scheme added parts (the jaws)
  get showing() { return { unit: show.unit, paint: show.paint, extra: !!(show.model && show.model.getObjectByName('paint-extra')) }; },
  hide() { cur = null; root.innerHTML = ''; this.showroomActive = false; stack = []; if (app) app.syncHud(); },
  // (the list is copied before show(): show() adds the screen being left to it, which would make Back go forward again)
  back() { if (cur === 'pause') { app.resume(); return; } const prev = stack.pop(); if (prev) { const s = stack.slice(); this.show(prev, opts); stack = s; } else if (cur === 'nation' || cur === 'units') this.show(cur === 'units' ? 'nation' : 'title'); else this.show(app.state === 'paused' ? 'pause' : 'title'); },
  syncFast() {
    root.querySelectorAll('[data-fast]').forEach((b) => b.setAttribute('aria-checked', String(save.settings.fast)));
    const seg = el('q-seg'), note = el('q-note'); if (seg) { seg.style.opacity = save.settings.fast ? 0.4 : 1; note.textContent = save.settings.fast ? '(Fast Graphics is on)' : save.settings.quality === 'auto' ? `(auto: ${QUALITY[gfx.qName].label})` : ''; }
  },
  notice(text, btn, fn) { const n = el('notice'); n.innerHTML = `<span>${text}</span>${btn ? `<button class="btn small" data-act="1">${btn}</button>` : ''}<button class="btn small">OK</button>`; n.hidden = false; this._noticeFn = fn; clearTimeout(this._nt); this._nt = setTimeout(() => { n.hidden = true; }, 12000); },
  click(e) {
    const t = e.target.closest('button, a'); if (!t || t.tagName === 'A') return; const d = t.dataset; audio.init(); audio.play('click');
    if (d.fast !== undefined) { app.setFast(!save.settings.fast, true); return; }
    if (d.go === 'account' && !store.signedIn && store.goSignIn()) return; // the site's sign-in page, then back
    if (d.go) { this.show(d.go); return; }
    if (d.back !== undefined) return this.back();
    if (d.nation) { nation = d.nation; this.show('units'); return; }
    if (d.unit) { unit = d.unit; ul.confirm = false; ul.msg = ''; root.querySelectorAll('.unitbtn').forEach((b) => b.classList.toggle('on', b.dataset.unit === unit)); showroomSet(); unitInfo(); return; }
    if (d.dock !== undefined) { startDock = d.dock === '1'; unitInfo(); return; }
    if (d.msd !== undefined) { startSD = d.msd === '1'; unitInfo(); return; }
    if (d.unlock !== undefined) { // the Super Destroyer: first press asks, second press buys (through the account when signed in)
      const id = 'unit.' + unit; if (!ul.confirm) { ul.confirm = true; ul.msg = ''; unitInfo(); return; } ul.confirm = false;
      const done = (ok, msg) => { ul.msg = ok ? 'Unlocked for both nations.' : msg || 'Could not unlock it.'; if (cur === 'units') this.refresh(); };
      if (store.signedIn) { ul.msg = 'Unlocking…'; unitInfo(); store.buyCosmetic(id).then((r) => done(r.ok, r.error === 'offline' ? 'The server cannot be reached. Purchases wait until it is back.' : r.message)); return; }
      done(cosmetics.buy(id).ok); return;
    }
    if (d.deploy !== undefined) { if (!cosmetics.unlocked(unit)) return; app.play(nation, unit, { dock: startDock && UNITS[unit].kind === 'sub', sd: startSD && unit === 'marine' }); return; }
    if (d.pack) { st.msg = 'Opening Stripe in a new tab. Waiting for the payment…'; this.refresh(); store.checkout(d.pack, (got) => { st.msg = got ? `Purchase complete: +${fmtCredits(got)}` : 'No payment seen yet. If you paid, your Credits will appear shortly: open Account to check.'; if (cur === 'store') this.refresh(); }).then((r) => { if (!r.ok) { st.msg = r.message || 'Could not start the checkout.'; if (cur === 'store') this.refresh(); } }); return; }
    if (d.sendcode !== undefined) { const em = (el('acct-email') || {}).value || st.email; st.email = em.trim(); st.msg = 'Sending…'; this.refresh(); store.requestCode(st.email).then((r) => { st.sent = !!r.ok; st.msg = r.ok ? 'Code sent. Check your email (it works for 10 minutes).' : r.message || 'Could not send the code.'; if (cur === 'account') this.refresh(); }); return; }
    if (d.verify !== undefined) { const code = ((el('acct-code') || {}).value || '').trim(); st.msg = 'Checking…'; store.verify(st.email, code).then((r) => { st.msg = r.ok ? 'Signed in. Your account keeps your Credits and items on any computer.' : r.message || 'That code is not right.'; if (r.ok) { st.sent = false; st.fresh = true; } if (cur === 'account') this.refresh(); }); return; }
    if (d.signout !== undefined) { store.signOut().then(() => { st.msg = 'Signed out. Playing as a guest.'; st.fresh = false; if (cur === 'account') this.refresh(); }); return; }
    if (d.delacct !== undefined) { if (!st.del) { st.del = true; st.msg = 'This removes your account, Credits and cosmetics from the server for good.'; return this.refresh(); } st.del = false; store.deleteAccount().then((r) => { st.msg = r.ok ? 'Account deleted.' : r.message || 'Could not delete the account.'; st.fresh = false; if (cur === 'account') this.refresh(); }); return; }
    if (d.htab) { hg.tab = d.htab; hg.sel = ITEMS.find((i) => i.kind === hg.tab).id; hg.confirm = ''; hg.msg = ''; return this.refresh(); }
    if (d.hnation) { hg.nation = d.hnation; hg.msg = ''; return this.refresh(); }
    if (d.item) { hg.sel = d.item; hg.confirm = ''; hg.msg = ''; return this.refresh(); }
    if (d.buy) { if (hg.confirm !== d.buy) { hg.confirm = d.buy; hangarInfo(); return; } hg.confirm = '';
      if (store.signedIn) { hg.msg = 'Buying…'; hangarInfo(); store.buyCosmetic(d.buy).then((r) => { hg.msg = r.ok ? 'Bought. It is yours for good.' : r.error === 'offline' ? 'The server cannot be reached. Purchases wait until it is back.' : r.message || 'Could not buy that.'; if (cur === 'hangar') this.refresh(); }); return; }
      const r = cosmetics.buy(d.buy); hg.msg = r.ok ? 'Bought. It is yours for good.' : ''; return this.refresh(); }
    if (d.hair !== undefined) { hg.unit = 'fighter'; hg.msg = ''; return this.refresh(); }   // the only way an item's screen changes the unit on show: the player asks
    if (d.equip) {
      const r = cosmetics.toggle(hg.nation, d.equip, d.all ? 'all' : hg.unit), it = ITEM[d.equip];
      hg.msg = !r.ok ? r.why : !d.all || it.kind !== 'paint' ? ''
        : (r.on ? (it.air ? 'Painted on every jet and helicopter.' : 'Painted on all units.') : (it.air ? 'Removed from every jet and helicopter.' : 'Removed from all units.')) + (r.skipped ? ' Ships and submarines cannot wear it, so they were skipped.' : '');
      if (r.ok) store.saveEquip(); return this.refresh();
    }
    if (d.store !== undefined) { if (store.enabled) this.show('store'); else { hg.msg = 'Store coming soon.'; if (cur === 'hangar') hangarInfo(); else this.notice('Store coming soon.'); } return; }
    if (d.continue !== undefined) { this.show('units', { redeploy: true, next: true }); return; }
    if (d.resume !== undefined) return app.resume();
    if (d.change !== undefined) return app.changeUnit();
    if (d.menu !== undefined) return app.toMenu();
    if (d.q) { save.settings.quality = d.q; save.write(); gfx.applyQuality(); t.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t)); this.syncFast(); return; }
    if (d.opt) { save.settings[d.opt] = d.val; save.write(); t.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t)); return; }
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
    if (!show.scene || !show.model) return; show.t += dt; if (!hg.drag) show.pivot.rotation.y += dt * (cur === 'hangar' ? 0.22 : 0.35);
    const c = show.cam, a = 0.5, z = cur === 'hangar' ? hg.zoom : 1; c.aspect = gfx.w / gfx.h; c.updateProjectionMatrix();
    c.position.set(Math.sin(a) * show.dist * 1.25 * z, show.h + show.dist * 0.2 * z, Math.cos(a) * show.dist * 1.25 * z); c.lookAt(0, show.look, 0);
    if (show.unit === 'marine') animateSoldier(show.model, cur === 'hangar' ? 'idle' : 'aim', show.t, 0, 0);
    const m = show.model.userData.model; if (m) for (const s of m.spinners) s.node.rotation[s.axis] += s.speed * dt * (s.blades ? 0.15 : 1);
    gfx.renderer.render(show.scene, c);
  },
};
