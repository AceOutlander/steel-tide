// Steel Tide audio: sounds are synthesized with the Web Audio API. The big guns and heavy shell hits also layer three
// CC0 recordings from assets/sfx/ (listed in CREDITS.md) under the synthesis; without them the synthesis plays alone.
// Everything is safe to call before init() and never throws.
//
// Output chain: [battle sounds, loops] -> duckBus -> battleBus -> sfxBus -> sfxLP -+
//                                  [interface] -> uiBus ---------------------------+-> master -> comp -+
//                    [music] -> musicGate -> musicDuck -> musicBus ----------------+                   +-> limiter -> clip -> out
//                                  [big guns] -> gunBus -> gunLP -> gunGate -> gunVol -----------------+
// comp glues the mix. The big guns go round it, so a gun beside you really is far louder than one on the horizon; the
// limiter catches the peaks of many guns at once, and clip is a soft ceiling: the output can never clip.

let ctx = null;
let master = null, comp = null, limiter = null, clip = null, sfxBus = null, sfxLP = null, musicBus = null, musicGate = null, musicDuck = null;
let duckBus = null, gunBus = null;   // the player's own heavy guns briefly turn duckBus and the music down
let gunLP = null, gunGate = null, gunVol = null, quiet = false;   // the guns' own underwater filter, menu gate and volume
const GUN_TRIM = 0.42, SILENT = /[?&](devtest|debugtest)/.test(location.search);   // developer checks run silent
const SOUND_SPEED = 343;             // m/s: a far gun is seen before it is heard
// Two buses: everything that belongs to the battle goes through battleBus, which is faded to silence whenever a menu is
// open; interface sounds and the showroom ambience go through uiBus and are never affected by it.
let battleBus = null, uiBus = null, scene = 'menu', amb = null, ambTimer = 0;
const UI_SOUNDS = new Set(['click', 'hover']);
let white = null, brown = null;
let sfxVol = 0.8, musicVol = 0.5;
let underwater = false;
let voices = 0, guns = 0, lastTail = 0, lastMech = 0, rendering = false;   // rendering: an offline developer render is being set up
const VOICE_CAP = 28, GUN_CAP = 30;
// waveshaper curves: GRIT overdrives the body of a big gun; CLIP is the output ceiling (straight up to 0.7, never above 0.91)
const GRIT = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = Math.tanh(2.6 * ((i / (n - 1)) * 2 - 1)); return c; })();
const CLIP = (() => { const n = 2049, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a <= 0.7 ? a : 0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25)); } return c; })();
// recordings (CC0, see CREDITS.md): loaded after the first click
const SAMPLE_FILES = { fieldgun: 'fieldgun.mp3', blast: 'blast.mp3', thunder: 'thunder.mp3' };
const samples = Object.create(null);
let samplesReady = null;
function loadSamples(c) {
  if (samplesReady) return samplesReady;
  samplesReady = Promise.all(Object.entries(SAMPLE_FILES).map(([name, file]) =>
    fetch(new URL('../../assets/sfx/' + file, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => c.decodeAudioData(ab)).then((buf) => { samples[name] = buf; }).catch(() => { /* the synthesized layers stand alone */ })));
  return samplesReady;
}
const lastPlayed = Object.create(null);
const loops = new Map();
const LOOP_CAP = 18;
let loopTimer = 0;
const L = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };

// music state
let musicMode = 'off';
let musicTimer = 0, musicNext = 0, musicBar = 0;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function makeNoise(kind) {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return buf;
}

function spatial(pos, ref) {
  const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return {
    dist,
    att: ref / (ref + dist),
    pan: dist > 2 ? clamp((dx * L.rx + dz * L.rz) / dist, -1, 1) * 0.85 : 0,
    cut: clamp(20000 / (1 + dist / 600), 600, 20000),
  };
}

// ---------- one-shot building blocks ----------
function env(g, t, peak, a, d, hold) {
  peak = Math.max(peak, 0.0002);
  if (hold) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, d - 0.03));
    g.gain.linearRampToValueAtTime(0, t + d);
  } else {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  }
}

// noise burst: o = { k:'white'|'brown', ft, f0, f1, q, g, a, d, hold }
function nz(dest, t, o) {
  const src = ctx.createBufferSource();
  src.buffer = o.k === 'brown' ? brown : white;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.ft || 'lowpass';
  f.Q.value = o.q || 0.7;
  f.frequency.setValueAtTime(Math.max(20, o.f0), t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.d);
  const g = ctx.createGain();
  env(g, t, o.g, o.a || 0.004, o.d, o.hold);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.d + 0.05);
}

// tone: o = { w, f0, f1, g, a, d, hold }
function tn(dest, t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.w || 'sine';
  osc.frequency.setValueAtTime(Math.max(10, o.f0), t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + o.d);
  const g = ctx.createGain();
  env(g, t, o.g, o.a || 0.004, o.d, o.hold);
  osc.connect(g); g.connect(dest);
  osc.start(t);
  osc.stop(t + o.d + 0.05);
}

// recording: o = { n, off, rate, g, a, d, ft, f0 }. Returns false when the recording is not loaded.
function sm(dest, t, o) {
  const buf = samples[o.n];
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.playbackRate.value = o.rate || 1;
  const g = ctx.createGain(), a = o.a || 0.003;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.g, t + a);
  g.gain.setTargetAtTime(0, t + Math.max(a, o.d * 0.6), o.d * 0.12);
  let node = src;
  if (o.ft) { const f = ctx.createBiquadFilter(); f.type = o.ft; f.Q.value = 0.6; f.frequency.value = o.f0; src.connect(f); node = f; }
  node.connect(g); g.connect(dest);
  src.start(t, o.off || 0);
  src.stop(t + o.d + 0.15);
  return true;
}

// name: [refDistance, duration, builder(out, t, pitch)]
const SOUNDS = {
  mg: [40, 0.18, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 1900 * p, f1: 700 * p, q: 0.8, g: 0.9, d: 0.08 });
    tn(o, t, { w: 'square', f0: 150 * p, f1: 60 * p, g: 0.35, d: 0.06 });
  }],
  rifle: [30, 0.22, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 2600 * p, f1: 900 * p, q: 0.7, g: 0.8, d: 0.1 });
    tn(o, t, { w: 'triangle', f0: 220 * p, f1: 70 * p, g: 0.35, d: 0.07 });
  }],
  ciws: [70, 0.34, (o, t, p) => {
    for (let i = 0; i < 12; i++) nz(o, t + i * 0.022, { ft: 'bandpass', f0: 1300 * p, f1: 600 * p, q: 0.9, g: 0.5, d: 0.03 });
    tn(o, t, { w: 'sawtooth', f0: 46 * p, g: 0.18, a: 0.01, d: 0.28, hold: true });
  }],
  cannon20: [60, 0.32, (o, t, p) => {
    for (let i = 0; i < 7; i++) {
      nz(o, t + i * 0.034, { ft: 'bandpass', f0: 1000 * p, f1: 400 * p, q: 0.8, g: 0.8, d: 0.045 });
      tn(o, t + i * 0.034, { w: 'square', f0: 110 * p, f1: 50 * p, g: 0.3, d: 0.035 });
    }
  }],
  deckgun: [160, 0.7, (o, t, p) => {
    nz(o, t, { ft: 'lowpass', f0: 1400 * p, f1: 180 * p, g: 1.0, d: 0.45 });
    tn(o, t, { f0: 120 * p, f1: 38 * p, g: 0.8, d: 0.32 });
    nz(o, t, { ft: 'highpass', f0: 2500, g: 0.35, d: 0.04 });
  }],
  heavygun: [420, 2.2, (o, t, p) => {
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 700 * p, f1: 70 * p, g: 1.3, d: 1.9 });
    tn(o, t, { f0: 75 * p, f1: 24 * p, g: 1.0, d: 1.0 });
    nz(o, t, { ft: 'bandpass', f0: 1800, q: 0.5, g: 0.6, d: 0.07 });
  }],
  missile: [140, 1.5, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 500 * p, f1: 2400 * p, q: 0.6, g: 0.75, a: 0.05, d: 1.3 });
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 500 * p, f1: 150 * p, g: 0.6, a: 0.03, d: 1.0 });
  }],
  sam: [220, 2.0, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 350 * p, f1: 1800 * p, q: 0.5, g: 0.85, a: 0.06, d: 1.8 });
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 600 * p, f1: 110 * p, g: 0.9, a: 0.03, d: 1.5 });
  }],
  torpedo: [70, 1.3, (o, t, p) => {
    nz(o, t, { ft: 'lowpass', f0: 1600, f1: 400, g: 0.7, a: 0.02, d: 0.45 });
    tn(o, t + 0.1, { w: 'sawtooth', f0: 170 * p, f1: 260 * p, g: 0.12, a: 0.1, d: 1.1 });
  }],
  bombdrop: [120, 1.4, (o, t, p) => {
    tn(o, t, { f0: 1900 * p, f1: 620 * p, g: 0.16, a: 0.15, d: 1.3 });
  }],
  explosion: [260, 1.7, (o, t, p) => {
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 1000 * p, f1: 60 * p, g: 1.3, d: 1.4 });
    tn(o, t, { f0: 95 * p, f1: 28 * p, g: 0.9, d: 0.7 });
    nz(o, t, { ft: 'bandpass', f0: 2200, q: 0.5, g: 0.5, d: 0.08 });
  }],
  bigexplosion: [600, 3.8, (o, t, p) => {
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 800 * p, f1: 40 * p, g: 1.5, d: 3.4 });
    tn(o, t, { f0: 62 * p, f1: 20 * p, g: 1.1, d: 2.0 });
    nz(o, t + 0.28, { k: 'brown', ft: 'lowpass', f0: 500 * p, f1: 50 * p, g: 0.9, d: 2.2 });
    nz(o, t, { ft: 'bandpass', f0: 1500, q: 0.4, g: 0.6, d: 0.12 });
  }],
  // a 380 mm shell into the sea: a deep thump, the column of water going up, and the water falling back
  shellWater: [320, 3.2, (o, t, p) => {
    tn(o, t, { f0: 62 * p, f1: 26 * p, g: 1.3, a: 0.008, d: 0.9 });
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 520 * p, f1: 55, g: 1.2, a: 0.006, d: 1.3 });
    nz(o, t, { ft: 'bandpass', f0: 1500 * p, f1: 480 * p, q: 0.5, g: 0.6, a: 0.07, d: 1.7 });
    nz(o, t + 1.1, { ft: 'bandpass', f0: 2600 * p, f1: 900 * p, q: 0.5, g: 0.09, a: 0.35, d: 1.9 });
  }],
  shellWaterSmall: [110, 1.1, (o, t, p) => {
    tn(o, t, { f0: 120 * p, f1: 48 * p, g: 0.6, a: 0.006, d: 0.3 });
    nz(o, t, { ft: 'bandpass', f0: 1700 * p, f1: 600 * p, q: 0.5, g: 0.6, a: 0.03, d: 0.9 });
  }],
  // a 380 mm shell into a ship: the burst, then the struck steel ringing and bits of it coming down
  shellHit: [380, 2.8, (o, t, p) => {
    nz(o, t, { ft: 'highpass', f0: 2400, g: 0.7, d: 0.05 });
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 1300 * p, f1: 70 * p, g: 1.4, d: 1.4 });
    tn(o, t, { f0: 92 * p, f1: 30 * p, g: 1.1, a: 0.005, d: 0.8 });
    sm(o, t, { n: 'blast', off: 0.29, rate: 0.95 * p, g: 0.9, d: 2.2 });
    for (const [f, g, d] of [[233, 0.2, 1.1], [377, 0.17, 0.9], [612, 0.13, 0.75], [988, 0.09, 0.6], [1433, 0.06, 0.45]]) tn(o, t + 0.01, { w: 'triangle', f0: f * p, f1: f * p * 0.985, g, a: 0.003, d });
    nz(o, t + 0.01, { ft: 'bandpass', f0: 720 * p, q: 9, g: 0.5, d: 0.55 });
    nz(o, t + 0.01, { ft: 'bandpass', f0: 1900 * p, q: 11, g: 0.3, d: 0.4 });
    for (let i = 0; i < 5; i++) nz(o, t + 0.25 + Math.random() * 0.9, { ft: 'bandpass', f0: 2400 + Math.random() * 2600, q: 4, g: 0.1, d: 0.05 });
  }],
  shellHitSmall: [220, 1.2, (o, t, p) => {
    nz(o, t, { ft: 'highpass', f0: 2800, g: 0.5, d: 0.03 });
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 1500 * p, f1: 110 * p, g: 1.0, d: 0.6 });
    tn(o, t, { f0: 130 * p, f1: 45 * p, g: 0.7, d: 0.35 });
    for (const [f, g, d] of [[410, 0.14, 0.5], [655, 0.1, 0.4], [1130, 0.07, 0.3]]) tn(o, t + 0.008, { w: 'triangle', f0: f * p, g, a: 0.003, d });
    nz(o, t + 0.008, { ft: 'bandpass', f0: 1250 * p, q: 9, g: 0.3, d: 0.3 });
  }],
  splash: [90, 1.0, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 1300 * p, f1: 450 * p, q: 0.5, g: 0.7, a: 0.03, d: 0.8 });
  }],
  splashSmall: [35, 0.32, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 2300 * p, f1: 1000 * p, q: 0.6, g: 0.4, a: 0.01, d: 0.22 });
  }],
  ricochet: [30, 0.34, (o, t, p) => {
    tn(o, t, { f0: 2700 * p, f1: 850 * p, g: 0.22, d: 0.28 });
    tn(o, t, { w: 'triangle', f0: 4100 * p, f1: 1500 * p, g: 0.08, d: 0.18 });
  }],
  hit: [50, 0.3, (o, t, p) => {
    tn(o, t, { w: 'square', f0: 523 * p, g: 0.18, d: 0.16 });
    tn(o, t, { w: 'square', f0: 811 * p, g: 0.13, d: 0.12 });
    tn(o, t, { w: 'triangle', f0: 1307 * p, g: 0.12, d: 0.2 });
    nz(o, t, { ft: 'highpass', f0: 3000, g: 0.4, d: 0.03 });
  }],
  ping: [900, 2.4, (o, t, p) => {
    tn(o, t, { f0: 1480 * p, f1: 1440 * p, g: 0.5, a: 0.006, d: 1.1 });
    tn(o, t + 0.4, { f0: 1470 * p, g: 0.16, a: 0.02, d: 0.9 });
    tn(o, t + 0.85, { f0: 1465 * p, g: 0.07, a: 0.04, d: 0.9 });
    tn(o, t + 1.3, { f0: 1460 * p, g: 0.03, a: 0.06, d: 0.9 });
  }],
  pingReturn: [900, 0.5, (o, t, p) => {
    tn(o, t, { f0: 1750 * p, g: 0.2, a: 0.01, d: 0.4 });
  }],
  lock: [1, 0.1, (o, t, p) => { tn(o, t, { w: 'square', f0: 1200 * p, g: 0.12, a: 0.003, d: 0.07, hold: true }); }],
  lockTone: [1, 0.45, (o, t, p) => { tn(o, t, { w: 'square', f0: 1500 * p, g: 0.11, a: 0.005, d: 0.4, hold: true }); }],
  warning: [1, 0.34, (o, t, p) => {
    tn(o, t, { w: 'square', f0: 900 * p, g: 0.16, a: 0.003, d: 0.1, hold: true });
    tn(o, t + 0.16, { w: 'square', f0: 900 * p, g: 0.16, a: 0.003, d: 0.1, hold: true });
  }],
  flare: [50, 0.45, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 3200 * p, f1: 1500 * p, q: 0.8, g: 0.4, a: 0.01, d: 0.38 });
    tn(o, t, { f0: 300 * p, f1: 90 * p, g: 0.25, d: 0.06 });
  }],
  hover: [1, 0.05, (o, t, p) => { tn(o, t, { f0: 1500 * p, f1: 1250 * p, g: 0.06, a: 0.002, d: 0.03 }); }],
  click: [1, 0.07, (o, t, p) => { tn(o, t, { f0: 920 * p, f1: 600 * p, g: 0.2, a: 0.002, d: 0.05 }); }],
  alarm: [200, 1.5, (o, t, p) => {
    for (let i = 0; i < 4; i++) {
      tn(o, t + i * 0.34, { w: 'sawtooth', f0: 330 * p, f1: 520 * p, g: 0.14, a: 0.02, d: 0.3, hold: true });
    }
  }],
  catapult: [120, 2.0, (o, t, p) => {
    nz(o, t, { ft: 'bandpass', f0: 800 * p, f1: 3200 * p, q: 0.5, g: 0.7, a: 0.1, d: 1.7 });
    nz(o, t, { k: 'brown', ft: 'lowpass', f0: 300, g: 0.6, a: 0.05, d: 0.9 });
  }],
  stall: [1, 0.62, (o, t, p) => {
    for (let i = 0; i < 5; i++) tn(o, t + i * 0.12, { w: 'square', f0: 285 * p, g: 0.13, a: 0.003, d: 0.08, hold: true });
  }],
  win: [1, 1.6, (o, t, p) => {
    const n = [72, 76, 79, 84];
    for (let i = 0; i < 4; i++) {
      tn(o, t + i * 0.16, { w: 'triangle', f0: mtof(n[i]) * p, g: 0.2, a: 0.01, d: i === 3 ? 0.9 : 0.3 });
      tn(o, t + i * 0.16, { w: 'sawtooth', f0: mtof(n[i] - 12) * p, g: 0.05, a: 0.01, d: i === 3 ? 0.9 : 0.3 });
    }
  }],
  lose: [1, 1.8, (o, t, p) => {
    const n = [67, 63, 60, 55];
    for (let i = 0; i < 4; i++) tn(o, t + i * 0.3, { w: 'triangle', f0: mtof(n[i]) * p, g: 0.18, a: 0.02, d: i === 3 ? 0.8 : 0.4 });
  }],
};

function play(name, opts) {
  if (!ctx) return;
  try {
    const def = SOUNDS[name];
    if (!def) return;
    const ui = UI_SOUNDS.has(name);
    if (!ui && scene !== 'battle') return; // nothing from the battle starts while a menu is open, so nothing can pile up
    const nowMs = performance.now();
    if (nowMs - (lastPlayed[name] || 0) < 35) return;
    const o = opts || {};
    let g = o.vol === undefined ? 1 : o.vol;
    let pan = 0, cut = 20000, delay = o.at || 0;
    if (o.pos) {
      const s = spatial(o.pos, def[0]);
      if (s.dist > 9000) return;
      g *= s.att; pan = s.pan; cut = s.cut;
      if (s.dist > 25) delay += s.dist / SOUND_SPEED;   // heard after it is seen
    }
    if (g < (delay > 3 ? 0.012 : 0.003)) return;
    if (voices >= VOICE_CAP && g < 0.3) return;
    if (voices >= VOICE_CAP + 10) return;
    lastPlayed[name] = nowMs;
    const c = ctx, pitch = clamp(o.pitch === undefined ? 1 : o.pitch, 0.25, 4);
    const build = (wait) => {
      const out = ctx.createGain();
      out.gain.value = g;
      let node = out;
      if (cut < 16000) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = cut;
        node.connect(f); node = f;
      }
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        node.connect(p); node = p;
      }
      node.connect(ui ? uiBus : duckBus);
      const tail = node;
      if (!rendering) {
        voices++;
        setTimeout(() => {
          voices--;
          try { out.disconnect(); if (tail !== out) tail.disconnect(); } catch (e) { /* gone */ }
        }, (wait + def[1] + 0.35) * 1000);
      }
      def[2](out, ctx.currentTime + 0.005 + wait, pitch);
    };
    // a far sound is built when it arrives, not when it is made: nothing waits in the audio graph while it crosses the water
    if (delay > 0.25 && !rendering) setTimeout(() => { try { if (ctx === c && scene === 'battle') build(0); } catch (e) { /* never throw */ } }, delay * 1000);
    else build(delay);
  } catch (e) { /* never throw */ }
}

// ---------- the big guns ----------
// One shot of a ship's gun, built from layers. cls: 'heavy' (380 mm main battery) or 'deck' (76 mm deck gun).
// o = { pos, vol, pitch, own, lite, at }. own: the player's gun (ducks everything else for a moment).
// lite: the second and third barrels of a turret's ripple (crack, boom and body; the first barrel carries the tail).
// Distance: the sound arrives dist / 343 s late; the crack fades within a kilometre or so, the low boom and the roll carry.
function duck(secs) {
  const t = ctx.currentTime;
  for (const [g, low] of [[duckBus.gain, 0.28], [musicDuck.gain, 0.4]]) { g.cancelScheduledValues(t); g.setTargetAtTime(low, t, 0.012); g.setTargetAtTime(1, t + secs, 0.14); }
}
function gun(cls, opts) {
  if (!ctx || scene !== 'battle') return;
  try {
    const o = opts || {}, big = cls === 'heavy', lite = !!o.lite, own = !!o.own;
    const s = o.pos ? spatial(o.pos, big ? 700 : 240) : { dist: 0, att: 1, pan: 0 };
    const d = s.dist;
    if (d > (big ? 14000 : 6000)) return;
    const p = clamp((o.pitch || 1) * (0.96 + Math.random() * 0.08), 0.5, 2);
    let near = Math.exp(-d / (big ? 700 : 450)), att = s.att;      // near: 1 beside the gun, 0 far off (the crack does not carry)
    if (own) { near = Math.max(near, 0.85); att = Math.max(att, 0.8); }   // your own guns stay overwhelming from any camera
    const far = 1 - near, g = (o.vol === undefined ? 1 : o.vol) * att * (lite ? 0.8 : 1);
    if (g < 0.004) return;
    const delay = (d > 12 ? (d / SOUND_SPEED) * (own ? 0.35 : 1) : 0) + (o.at || 0), c = ctx;
    const build = (wait) => {
      if (!own && guns >= GUN_CAP) return;
      const thin = !own && guns >= GUN_CAP * 0.6;                    // a huge battle: the far guns keep only boom and body
      const nowMs = performance.now(), t = ctx.currentTime + 0.005 + wait;
      const cut = clamp(17000 / (1 + Math.pow(d / 350, 1.3)), 170, 17000);
      const out = ctx.createGain(); out.gain.value = g;
      let node = out;
      if (cut < 15000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; f.Q.value = 0.5; node.connect(f); node = f; }
      if (s.pan && ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = s.pan; node.connect(pn); node = pn; }
      node.connect(gunBus);
      const grit = ctx.createWaveShaper(), gg = ctx.createGain(); grit.curve = GRIT; gg.gain.value = big ? 0.85 : 0.8; grit.connect(gg); gg.connect(out);
      const soft = 0.004 + Math.min(0.09, d / 30000);                // far away the attack is smeared
      const mech = !lite && d < 110 && nowMs - lastMech > 650;
      let dur;
      if (big) {
        // 1. the crack: the muzzle blast
        if (near > 0.02 && !thin) {
          nz(out, t, { ft: 'highpass', f0: 2600, g: 1.9 * near, d: 0.05 });
          nz(out, t, { ft: 'bandpass', f0: 1500 * p, f1: 320 * p, q: 0.6, g: 1.6 * near, d: 0.14 });
          sm(out, t, { n: 'fieldgun', off: 0.06, rate: 0.82 * p, g: 1.9 * near, d: 0.7, ft: 'highpass', f0: 220 });
        }
        // 2. the boom: sub-bass falling from 80 Hz to under 30
        tn(out, t, { f0: 80 * p, f1: 30 * p, g: 1.7, a: soft, d: 2.4 });
        tn(out, t, { f0: 52 * p, f1: 26 * p, g: 1.0, a: soft + 0.01, d: 3.2 });
        // 3. the body: overdriven low-mid roar, and the recorded blast pitched down
        nz(grit, t, { k: 'brown', ft: 'lowpass', f0: 950 * p, f1: 85 * p, g: 1.5, a: soft, d: 1.9 });
        tn(grit, t, { w: 'triangle', f0: 120 * p, f1: 44 * p, g: 0.7, a: soft, d: 0.8 });
        sm(out, t, { n: 'blast', off: 0.29, rate: 0.72 * p, g: 1.25, a: soft, d: lite ? 1.4 : 3.6 });
        dur = 3.4;
        // 4. the tail: rolling thunder over open water, and the echoes coming back
        if (!lite && !thin) {
          const tk = 0.6 + 0.4 * far, crowded = nowMs - lastTail < 90;
          nz(out, t + 0.05, { k: 'brown', ft: 'lowpass', f0: 300 * p, f1: 60, g: 2.8 * tk, a: 0.25, d: 4.2 });
          if (!crowded) {
            lastTail = nowMs;
            sm(out, t + 0.12, { n: 'thunder', off: 0.7 + Math.random() * 1.6, rate: 0.8 + Math.random() * 0.2, g: 9 * tk, a: 0.3, d: 4.2 });
            for (const [dt, eg, ef] of [[0.42, 1.2, 420], [0.95, 0.85, 300], [1.7, 0.55, 200], [2.5, 0.34, 150]]) {
              const te = t + dt * (0.9 + Math.random() * 0.2);
              nz(out, te, { k: 'brown', ft: 'lowpass', f0: ef * p, f1: 55, g: eg * tk * 1.2, a: 0.03, d: 1.0 });
              tn(out, te, { f0: 58 * p, f1: 30 * p, g: eg * tk * 0.7, a: 0.02, d: 0.7 });
            }
          }
          dur = 4.8;
        }
        // 5. faintly, after the shot: the breech, a clank, the shell hoist, the turret settling
        if (mech) {
          lastMech = nowMs;
          const m = t + 1.05;
          tn(out, m, { w: 'triangle', f0: 170, f1: 80, g: 0.2, a: 0.004, d: 0.11 });
          nz(out, m, { ft: 'bandpass', f0: 800, q: 2, g: 0.18, d: 0.05 });
          for (const f of [640, 937, 1410]) tn(out, m + 0.28, { w: 'square', f0: f, g: 0.04, a: 0.002, d: 0.14 });
          nz(out, m + 0.28, { ft: 'highpass', f0: 4000, g: 0.05, d: 0.02 });
          tn(out, m + 0.75, { f0: 2150, f1: 2050, g: 0.028, a: 0.003, d: 0.45 });
          tn(out, m + 0.75, { f0: 3260, g: 0.014, a: 0.003, d: 0.3 });
          nz(out, m + 1.1, { ft: 'bandpass', f0: 380, f1: 520, q: 9, g: 0.11, a: 0.1, d: 0.5 });
          dur = Math.max(dur, 2.9);
        }
      } else {
        // the deck gun: a sharp bang with a short thump and a brief roll
        if (near > 0.02 && !thin) {
          nz(out, t, { ft: 'highpass', f0: 3200, g: 1.7 * near, d: 0.03 });
          nz(out, t, { ft: 'bandpass', f0: 2100 * p, f1: 600 * p, q: 0.7, g: 1.7 * near, d: 0.09 });
          sm(out, t, { n: 'fieldgun', off: 0.07, rate: 1.3 * p, g: 1.6 * near, d: 0.5, ft: 'highpass', f0: 350 });
        }
        tn(out, t, { f0: 155 * p, f1: 52 * p, g: 1.6, a: soft, d: 0.42 });
        nz(grit, t, { ft: 'lowpass', f0: 1500 * p, f1: 190 * p, g: 1.3, a: soft, d: 0.55 });
        if (!thin) {
          nz(out, t + 0.03, { k: 'brown', ft: 'lowpass', f0: 520, f1: 110, g: 1.1, a: 0.06, d: 1.3 });
          nz(out, t + 0.33, { k: 'brown', ft: 'lowpass', f0: 300, f1: 90, g: 0.55, a: 0.03, d: 0.7 });
        }
        dur = 1.5;
        if (mech && d < 60) {   // the spent case on the deck
          lastMech = nowMs;
          nz(out, t + 0.42, { ft: 'bandpass', f0: 1200, q: 3, g: 0.05, d: 0.03 });
          tn(out, t + 0.42, { f0: 2600, f1: 2400, g: 0.028, a: 0.002, d: 0.25 });
          tn(out, t + 0.42, { f0: 3900, g: 0.012, a: 0.002, d: 0.18 });
        }
      }
      const tailNode = node;
      guns++;
      if (rendering) return;   // an offline render: the count is reset afterwards, nothing to tidy
      setTimeout(() => {
        guns--;
        try { out.disconnect(); gg.disconnect(); if (tailNode !== out) tailNode.disconnect(); } catch (e) { /* gone */ }
      }, (wait + dur + 0.4) * 1000);
      if (own && big) duck(0.3);
    };
    // a far gun is built when its sound arrives (see play)
    if (delay > 0.25 && !rendering) setTimeout(() => { try { if (ctx === c && scene === 'battle') build(0); } catch (e) { /* never throw */ } }, delay * 1000);
    else build(delay);
  } catch (e) { /* never throw */ }
}

// ---------- persistent loops ----------
// type: [refDistance, baseGain, builder(loopCtx)]
function loopNoise(lp, kind, ft, freq, q, gain, pitched) {
  const src = ctx.createBufferSource();
  src.buffer = kind === 'brown' ? brown : white;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = ft; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(lp.mix);
  src.start(0, Math.random() * 1.5);
  lp.srcs.push(src);
  if (pitched) lp.pp.push([f.frequency, freq]);
  return g;
}
function loopOsc(lp, w, freq, gain, pitched = true) {
  const o = ctx.createOscillator();
  o.type = w; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = gain;
  o.connect(g); g.connect(lp.mix);
  o.start();
  lp.srcs.push(o);
  if (pitched) lp.pp.push([o.frequency, freq]);
  return g;
}
function loopLfo(lp, w, freq, depth, param, pitched) {
  const o = ctx.createOscillator();
  o.type = w; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = depth;
  o.connect(g); g.connect(param);
  o.start();
  lp.srcs.push(o);
  if (pitched) lp.pp.push([o.frequency, freq]);
}

const LOOPS = {
  shipEngine: [70, 0.5, (lp) => {
    const n = loopNoise(lp, 'brown', 'lowpass', 130, 0.7, 0.9, true);
    loopLfo(lp, 'sine', 9, 0.35, n.gain, true);
    const s = loopOsc(lp, 'sawtooth', 38, 0.16);
    loopLfo(lp, 'square', 9, 0.07, s.gain, true);
    loopOsc(lp, 'sine', 76, 0.12);
  }],
  subHum: [40, 0.22, (lp) => {
    loopOsc(lp, 'sine', 60, 0.5);
    loopOsc(lp, 'sine', 120, 0.18);
    loopOsc(lp, 'triangle', 181, 0.06);
    loopNoise(lp, 'brown', 'lowpass', 90, 0.7, 0.4, false);
  }],
  jet: [180, 0.5, (lp) => {
    loopNoise(lp, 'white', 'bandpass', 900, 0.6, 0.55, true);
    loopNoise(lp, 'brown', 'lowpass', 260, 0.7, 0.9, true);
    loopOsc(lp, 'sine', 2400, 0.035);
    loopOsc(lp, 'sine', 3650, 0.015);
  }],
  afterburner: [240, 0.7, (lp) => {
    const n = loopNoise(lp, 'brown', 'lowpass', 420, 0.7, 1.2, true);
    loopLfo(lp, 'sawtooth', 31, 0.25, n.gain, false);
    loopNoise(lp, 'white', 'bandpass', 260, 0.5, 0.5, true);
  }],
  rotor: [140, 0.6, (lp) => {
    const n = loopNoise(lp, 'white', 'lowpass', 520, 0.7, 0.45, false);
    loopLfo(lp, 'sawtooth', 11, 0.42, n.gain, true);
    const o = loopOsc(lp, 'triangle', 52, 0.3, false);
    loopLfo(lp, 'sawtooth', 11, 0.28, o.gain, true);
    loopNoise(lp, 'white', 'bandpass', 2600, 1.2, 0.05, true); // turbine whine
  }],
  wind: [1, 0.3, (lp) => {
    const n = loopNoise(lp, 'white', 'bandpass', 620, 0.5, 0.6, true);
    loopLfo(lp, 'sine', 0.23, 0.15, n.gain, false);
  }],
  sea: [1, 0.3, (lp) => {
    const n = loopNoise(lp, 'brown', 'lowpass', 750, 0.5, 0.8, false);
    loopLfo(lp, 'sine', 0.13, 0.4, n.gain, false);
    const h = loopNoise(lp, 'white', 'highpass', 2500, 0.5, 0.05, false);
    loopLfo(lp, 'sine', 0.19, 0.04, h.gain, false);
  }],
  fire: [45, 0.45, (lp) => {
    const n = loopNoise(lp, 'brown', 'bandpass', 520, 0.5, 1.0, false);
    loopLfo(lp, 'sawtooth', 13.7, 0.35, n.gain, false);
    const c = loopNoise(lp, 'white', 'highpass', 3500, 0.5, 0.06, false);
    loopLfo(lp, 'square', 7.3, 0.05, c.gain, false);
  }],
  underwater: [1, 0.35, (lp) => {
    const n = loopNoise(lp, 'brown', 'lowpass', 190, 0.9, 0.9, false);
    loopLfo(lp, 'sine', 0.31, 0.3, n.gain, false);
    const o = loopOsc(lp, 'sine', 45, 0.25, false);
    loopLfo(lp, 'sine', 0.47, 0.12, o.gain, false);
    const b = loopNoise(lp, 'white', 'bandpass', 1100, 6, 0.05, false); // bubbles
    loopLfo(lp, 'square', 5.3, 0.05, b.gain, false);
  }],
};
LOOPS.march = LOOPS.sea; // unused placeholder

function killLoop(id, lp) {
  loops.delete(id);
  try {
    const t = ctx.currentTime;
    lp.mix.gain.cancelScheduledValues(t);
    lp.mix.gain.setTargetAtTime(0, t, 0.07);
  } catch (e) { /* ignore */ }
  setTimeout(() => {
    try {
      for (const s of lp.srcs) { try { s.stop(); } catch (e) { /* stopped */ } s.disconnect(); }
      lp.mix.disconnect(); lp.filt.disconnect(); if (lp.pan) lp.pan.disconnect();
    } catch (e) { /* ignore */ }
  }, 450);
}

function makeLoop(type) {
  const def = LOOPS[type];
  if (!def) return null;
  const lp = { type, srcs: [], pp: [], last: 0, mix: ctx.createGain(), filt: ctx.createBiquadFilter(), pan: null };
  lp.mix.gain.value = 0;
  lp.filt.type = 'lowpass'; lp.filt.frequency.value = 18000;
  lp.mix.connect(lp.filt);
  if (ctx.createStereoPanner) {
    lp.pan = ctx.createStereoPanner();
    lp.filt.connect(lp.pan); lp.pan.connect(duckBus);
  } else lp.filt.connect(duckBus);
  def[2](lp);
  return lp;
}

function setLoop(id, type, opts) {
  if (!ctx || scene !== 'battle') return;
  try {
    const def = LOOPS[type];
    if (!def) return;
    const o = opts || {};
    let lp = loops.get(id);
    if (lp && lp.type !== type) { killLoop(id, lp); lp = null; }
    let g = (o.vol === undefined ? 1 : o.vol) * def[1];
    let pan = 0, cut = 18000;
    if (o.pos) {
      const s = spatial(o.pos, def[0]);
      g *= s.att; pan = s.pan; cut = Math.min(18000, s.cut);
      if (s.dist > 9000) g = 0;
    }
    if (!lp) {
      if (g < 0.002 || loops.size >= LOOP_CAP) return;
      lp = makeLoop(type);
      if (!lp) return;
      loops.set(id, lp);
    }
    lp.last = performance.now();
    const t = ctx.currentTime;
    lp.mix.gain.setTargetAtTime(g, t, 0.08);
    lp.filt.frequency.setTargetAtTime(cut, t, 0.1);
    if (lp.pan) lp.pan.pan.setTargetAtTime(pan, t, 0.08);
    const p = clamp(o.pitch === undefined ? 1 : o.pitch, 0.2, 4);
    if (p !== lp.pitch) {
      lp.pitch = p;
      for (const [param, base] of lp.pp) param.setTargetAtTime(base * p, t, 0.12);
    }
  } catch (e) { /* never throw */ }
}

function sweepLoops() {
  if (!ctx) return;
  const now = performance.now();
  for (const [id, lp] of loops) if (now - lp.last > 500) killLoop(id, lp);
}

// ---------- music: slow minor pads, sparse drums in battle ----------
const PROG = [
  [45, 52, 57, 60, 64], // A minor
  [41, 48, 53, 57, 60], // F
  [43, 50, 55, 58, 62], // G minor
  [40, 47, 52, 55, 59], // E minor
];

function padNote(t, midi, dur, gain, cutoff) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 0.6;
  f.frequency.setValueAtTime(cutoff * 0.6, t);
  f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
  f.frequency.linearRampToValueAtTime(cutoff * 0.5, t + dur + 1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
  f.connect(g); g.connect(musicGate);
  const fr = mtof(midi);
  for (const [w, det] of [['sawtooth', -7], ['triangle', 6]]) {
    const o = ctx.createOscillator();
    o.type = w; o.frequency.value = fr; o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + dur + 1.7);
  }
}
function drum(t, f0, gain, d) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(musicGate);
  o.start(t); o.stop(t + d + 0.05);
}
function scheduleBar(t) {
  const battle = musicMode === 'battle';
  const len = battle ? 4.8 : 7;
  const ch = PROG[musicBar % PROG.length];
  const notes = battle ? [ch[0] - 12, ch[0], ch[1], ch[3]] : [ch[0], ch[1], ch[2], ch[4]];
  for (let i = 0; i < notes.length; i++) padNote(t + i * 0.05, notes[i], len, i === 0 ? 0.075 : 0.05, battle ? 650 : 480);
  if (!battle && musicBar % 2 === 1) padNote(t + len * 0.5, ch[4] + 12, len * 0.5, 0.025, 900);
  if (battle) {
    const step = len / 8;
    const pat = musicBar % 4 === 3 ? [0, 3, 4, 6, 7] : [0, 3, 4];
    for (const s of pat) drum(t + s * step, s === 7 ? 95 : 68, s === 0 ? 0.5 : 0.32, 0.4);
    if (musicBar % 2 === 0) { // low pulse
      for (let s = 0; s < 8; s += 2) drum(t + s * step + step * 0.5, mtof(ch[0] - 12), 0.12, 0.25);
    }
  }
  musicBar++;
  return len;
}
function musicTick() {
  if (!ctx || musicMode === 'off' || ctx.state !== 'running') return;
  try {
    if (musicNext < ctx.currentTime) musicNext = ctx.currentTime + 0.1;
    let guard = 0;
    while (musicNext < ctx.currentTime + 1.2 && guard++ < 4) musicNext += scheduleBar(musicNext);
  } catch (e) { /* never throw */ }
}
function music(mode) {
  if (mode !== 'menu' && mode !== 'battle') mode = 'off';
  if (mode === musicMode) return;
  musicMode = mode;
  if (!ctx) return; // applied at init()
  try {
    const t = ctx.currentTime;
    clearInterval(musicTimer); musicTimer = 0;
    // fade out whatever is ringing, then start the new mode
    musicGate.gain.cancelScheduledValues(t);
    musicGate.gain.setTargetAtTime(0, t, 0.25);
    if (mode !== 'off') {
      musicGate.gain.setTargetAtTime(1, t + 1.2, 0.3);
      musicNext = t + 1.3;
      musicTimer = setInterval(musicTick, 250);
    }
  } catch (e) { /* never throw */ }
}

// ---------- lifecycle ----------
// Builds the whole output chain on a context: the speakers, or an offline render (developer checks).
function graph(c, offline) {
  ctx = c;
  // the ceiling: a fast limiter, then a soft clip that cannot pass 0.91 of full scale
  clip = ctx.createWaveShaper(); clip.curve = CLIP; clip.oversample = '2x'; clip.connect(ctx.destination);
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.09;
  limiter.connect(clip);
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  comp.connect(limiter);
  quiet = !offline && SILENT;
  master = ctx.createGain(); master.gain.value = quiet ? 0 : 0.7;
  master.connect(comp);
  sfxLP = ctx.createBiquadFilter();
  sfxLP.type = 'lowpass'; sfxLP.frequency.value = underwater ? 500 : 20000; sfxLP.Q.value = 0.5;
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol;
  sfxBus.connect(sfxLP); sfxLP.connect(master);
  battleBus = ctx.createGain(); battleBus.gain.value = offline || scene === 'battle' ? 1 : 0; battleBus.connect(sfxBus);
  duckBus = ctx.createGain(); duckBus.connect(battleBus);
  gunBus = ctx.createGain();
  gunLP = ctx.createBiquadFilter(); gunLP.type = 'lowpass'; gunLP.frequency.value = underwater ? 500 : 20000; gunLP.Q.value = 0.5;
  gunGate = ctx.createGain(); gunGate.gain.value = battleBus.gain.value;
  gunVol = ctx.createGain(); gunVol.gain.value = quiet ? 0 : sfxVol * GUN_TRIM;
  gunBus.connect(gunLP); gunLP.connect(gunGate); gunGate.connect(gunVol); gunVol.connect(limiter);
  uiBus = ctx.createGain(); uiBus.gain.value = sfxVol * 0.8; uiBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = musicVol * 0.6;
  musicBus.connect(master);
  musicDuck = ctx.createGain(); musicDuck.connect(musicBus);
  musicGate = ctx.createGain(); musicGate.gain.value = 0;
  musicGate.connect(musicDuck);
  white = makeNoise('white');
  brown = makeNoise('brown');
}
const grab = () => [ctx, master, comp, limiter, clip, sfxBus, sfxLP, musicBus, musicGate, musicDuck, duckBus, gunBus, gunLP, gunGate, gunVol, quiet, battleBus, uiBus, white, brown, scene];
const put = (a) => { [ctx, master, comp, limiter, clip, sfxBus, sfxLP, musicBus, musicGate, musicDuck, duckBus, gunBus, gunLP, gunGate, gunVol, quiet, battleBus, uiBus, white, brown, scene] = a; };

function init() {
  try {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    graph(new AC(), false);
    loadSamples(ctx);
    loopTimer = setInterval(sweepLoops, 200);
    { const m = musicMode === 'off' ? scene : musicMode; musicMode = 'off'; music(m); } // menus have their own calm music from the first click
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (e) { ctx = null; }
}

export const audio = {
  init,
  get ready() { return !!ctx; },
  resume() { try { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } },
  suspend() { try { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); } catch (e) { /* ignore */ } },
  setVolumes(sfx01, music01) {
    sfxVol = clamp(+sfx01 || 0, 0, 1);
    musicVol = clamp(+music01 || 0, 0, 1);
    if (!ctx) return;
    try {
      sfxBus.gain.setTargetAtTime(sfxVol, ctx.currentTime, 0.05); uiBus.gain.setTargetAtTime(sfxVol * 0.8, ctx.currentTime, 0.05);
      gunVol.gain.setTargetAtTime(quiet ? 0 : sfxVol * GUN_TRIM, ctx.currentTime, 0.05);
      musicBus.gain.setTargetAtTime(musicVol * 0.6, ctx.currentTime, 0.05);
    } catch (e) { /* ignore */ }
  },
  setListener(pos, fwd) {
    if (!pos) return;
    L.x = pos.x; L.y = pos.y; L.z = pos.z;
    if (fwd) {
      // right = fwd x up(0,1,0) = (-fz, 0, fx)
      const rx = -fwd.z, rz = fwd.x;
      const m = Math.hypot(rx, rz);
      if (m > 1e-4) { L.rx = rx / m; L.rz = rz / m; }
    }
  },
  setUnderwater(on) {
    on = !!on;
    if (on === underwater) return;
    underwater = on;
    if (!ctx) return;
    try { sfxLP.frequency.setTargetAtTime(on ? 500 : 20000, ctx.currentTime, 0.12); gunLP.frequency.setTargetAtTime(on ? 500 : 20000, ctx.currentTime, 0.12); } catch (e) { /* ignore */ }
  },
  // 'battle' while the player is in the fight, 'menu' on every menu screen (title, nation, unit select and redeploy,
  // settings, how to play, hangar, pause). The battle bus fades over half a second each way; music follows the scene.
  setScene(next) {
    if (next !== 'battle') next = 'menu';
    if (next === scene) return; scene = next; music(next);
    if (!ctx) return;
    try {
      const t = ctx.currentTime, g = battleBus.gain;
      for (const q of [g, gunGate.gain]) { q.cancelScheduledValues(t); q.setValueAtTime(q.value, t); q.linearRampToValueAtTime(next === 'battle' ? 1 : 0, t + 0.5); }
      if (next === 'menu') setTimeout(() => { if (scene === 'menu' && ctx) for (const [id, lp] of [...loops]) killLoop(id, lp); }, 650); // engines and sea stop once faded
    } catch (e) { /* ignore */ }
  },
  get scene() { return scene; },
  get debug() { return { scene, battleGain: battleBus ? +battleBus.gain.value.toFixed(2) : null, loops: loops.size, voices, guns, samples: Object.keys(samples).length, duck: duckBus ? +duckBus.gain.value.toFixed(2) : null, state: ctx ? ctx.state : null, music: musicMode, ambience: !!amb }; },
  // quiet harbour ambience for the unit showroom: slow water wash and a distant gull now and then
  ambience(on) {
    if (!ctx || !!amb === !!on) return;
    try {
      if (on) {
        const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.4;
        const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.16, ctx.currentTime, 0.8);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.07; lfo.connect(lg); lg.connect(g.gain);
        src.connect(f); f.connect(g); g.connect(uiBus); src.start(); lfo.start();
        amb = { src, g, lfo };
        ambTimer = setInterval(() => { if (!amb || Math.random() > 0.35) return; const t = ctx.currentTime, o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; const f0 = 1500 + Math.random() * 500; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + 0.28); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.018, t + 0.04); og.gain.exponentialRampToValueAtTime(0.0005, t + 0.3); o.connect(og); og.connect(uiBus); o.start(t); o.stop(t + 0.32); }, 4200);
      } else {
        const a = amb; amb = null; clearInterval(ambTimer);
        a.g.gain.cancelScheduledValues(ctx.currentTime); a.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => { try { a.src.stop(); a.lfo.stop(); a.g.disconnect(); } catch (e) { /* gone */ } }, 900);
      }
    } catch (e) { amb = null; }
  },
  play,
  gun,
  // Developer check (js/debug.js): renders what fn() plays through the whole output chain into a buffer, not the speakers.
  async offline(secs, fn, sr = 48000) {
    const OC = window.OfflineAudioContext;
    if (!OC) return null;
    const oc = new OC(2, Math.ceil(secs * sr), sr);
    if (!Object.keys(samples).length) samplesReady = null;
    await loadSamples(oc);              // decoding only: nothing is swapped while the files load
    const keep = grab(), keepL = { ...L }, counts = [voices, guns];
    try {
      graph(oc, true); scene = 'battle'; rendering = true; guns = 0;
      for (const k in lastPlayed) delete lastPlayed[k];
      lastTail = lastMech = 0;
      fn();
    } finally { rendering = false; put(keep); Object.assign(L, keepL); [voices, guns] = counts; }
    return oc.startRendering();
  },
  setLoop,
  stopLoop(id) { const lp = loops.get(id); if (lp && ctx) killLoop(id, lp); },
  stopAllLoops() { if (!ctx) return; for (const [id, lp] of [...loops]) killLoop(id, lp); },
  music,
};
