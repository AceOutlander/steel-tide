// Accounts and the Credit store: the game's side of the backend. Everything here is switched OFF until
// js/core/storeconfig.js names a backend (enabled: true and an api address). While it is off the game is local-save only
// and this file makes no network request at all.
//
// When it is on: signing in (email + one-time code) moves the local wallet into the account once; after that the server
// holds the Credits, owned cosmetics and equipped set, and this module keeps the local copy in step with it. If the server
// cannot be reached the game still plays: battle results wait in a queue and are sent (and checked) later.
import { STORE_CONFIG } from './storeconfig.js';
import { save } from './save.js';

const SESSION_KEY = 'steelTide.session.v1';
const dev = /[?&](devtest|debugtest)/.test(location.search);
// developer checks may point the game at a local test server; players cannot (the flag is needed)
const api = () => { try { return (dev && localStorage.getItem('steelTide.devApi')) || (STORE_CONFIG.enabled ? STORE_CONFIG.api : ''); } catch { return ''; } };

export const store = {
  me: null, online: true, packs: null, onChange: null,
  get enabled() { return !!api(); },
  get token() { try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } },
  get signedIn() { return this.enabled && !!this.token; },

  async call(path, body, method = body ? 'POST' : 'GET') {
    if (!this.enabled) return { ok: false, error: 'off' };
    try {
      const r = await fetch(api() + path, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({})); this.online = true;
      if (r.status === 401 && this.token) this.forget();
      return { ok: r.ok, status: r.status, ...d };
    } catch { this.online = false; return { ok: false, error: 'offline', message: 'The server cannot be reached. Playing offline: your progress will sync later.' }; }
  },
  // battles finished but not yet confirmed by the server
  pending() { return (save.data.econ.queue || []).filter((b) => !b.synced && b.played).reduce((s, b) => s + b.ships + b.aircraft + Math.min(b.infantry, 1000) + b.participation + b.win, 0); },
  // take the server's word for the wallet
  adopt(me) { if (!me) return; this.me = me; const e = save.data.econ; e.credits = me.credits + this.pending(); e.owned = me.owned.slice(); for (const n of ['aethia', 'extro']) if (me.equip && me.equip[n]) e.equip[n] = me.equip[n]; e.account = me.email; save.write(); this.onChange && this.onChange(); },
  forget() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } this.me = null; delete save.data.econ.account; save.write(); this.onChange && this.onChange(); },

  requestCode(email) { return this.call('/auth/request', { email }); },
  async verify(email, code) {
    const e = save.data.econ, first = !e.account; // the local wallet travels with the first sign-in; the server takes it only once
    const r = await this.call('/auth/verify', { email, code, guest: first ? { credits: e.credits, owned: e.owned, equip: e.equip } : undefined });
    if (r.ok && r.token) { try { localStorage.setItem(SESSION_KEY, r.token); } catch { /* ignore */ } e.queue = (e.queue || []).map((b) => ({ ...b, synced: true })); this.adopt(r.me); }
    return r;
  },
  async refresh() { if (!this.signedIn) return null; await this.flush(); const r = await this.call('/me'); if (r.ok) this.adopt(r.me); return r; },
  // send finished battles the server has not seen yet (each is counted once there, so sending twice is harmless)
  async flush() {
    if (!this.signedIn) return;
    for (const b of save.data.econ.queue || []) { if (b.synced || !b.played) continue; const r = await this.call('/battle', b); if (r.error === 'offline') return; b.synced = true; b.rejected = !r.ok; }
    save.write();
  },
  async buyCosmetic(id) { const r = await this.call('/cosmetics/buy', { id }); if (r.ok) { const e = save.data.econ; e.owned = r.owned; e.credits = r.credits + this.pending(); if (this.me) { this.me.credits = r.credits; this.me.owned = r.owned; } save.write(); this.onChange && this.onChange(); } return r; },
  saveEquip() { if (this.signedIn) { clearTimeout(this._eq); this._eq = setTimeout(() => this.call('/equip', { equip: save.data.econ.equip }), 800); } },
  async loadPacks() { const r = await this.call('/packs'); if (r.ok) this.packs = r.packs; return r; },
  // open Stripe Checkout in a new tab, then watch the balance for up to a minute
  async checkout(pack, onDone) {
    const before = this.me ? this.me.credits : 0, r = await this.call('/checkout', { pack }); if (!r.ok || !r.url) return r;
    window.open(r.url, '_blank', 'noopener');
    let n = 0; clearInterval(this._poll);
    this._poll = setInterval(async () => { n++; const m = await this.call('/me'); if (m.ok && m.me.credits > before) { clearInterval(this._poll); const got = m.me.credits - before; this.adopt(m.me); onDone && onDone(got); } else if (n >= 20) { clearInterval(this._poll); onDone && onDone(0); } }, 3000);
    return r;
  },
  async signOut() { await this.call('/signout', {}); this.forget(); },
  async deleteAccount() { const r = await this.call('/account/delete', {}); if (r.ok) this.forget(); return r; },
};
