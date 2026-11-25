// Saving: one versioned localStorage key holding settings, last picks and lifetime stats.
import { DEFAULT_KEYS } from './config.js';

const KEY = 'steelTide.save.v1';
const defaults = () => ({
  v: 1,
  settings: { fast: false, fastAsked: false, quality: 'auto', resScale: 1, fov: 70, sens: 1, invertY: false, sfx: 0.8, music: 0.35, keys: {} },
  last: { nation: 'aethia', unit: 'patrol' },
  stats: { kills: {}, sinkings: 0, aircraft: 0, battlesWon: 0, battlesLost: 0, deaths: 0 },
});

export const save = {
  data: defaults(),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw), def = defaults();
        if (d && d.v === 1) this.data = { v: 1, settings: { ...def.settings, ...d.settings }, last: { ...def.last, ...d.last }, stats: { ...def.stats, ...d.stats } };
      }
    } catch { /* private mode or corrupt save: start fresh */ }
    return this.data;
  },
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
  get settings() { return this.data.settings; },
  get stats() { return this.data.stats; },
  keysFor(action) { return this.data.settings.keys[action] || DEFAULT_KEYS[action] || []; },
  addKill(unitKey, kind) {
    const s = this.data.stats; s.kills[unitKey] = (s.kills[unitKey] || 0) + 1;
    if (kind === 'ship' || kind === 'sub') s.sinkings++; else if (kind === 'jet' || kind === 'heli') s.aircraft++;
    this.write();
  },
};
