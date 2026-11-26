// Credits: the in-game currency (always written with the anchor sign, never a dollar sign). Earned only by the player's own
// kills and by taking part in battles; spent on looks in the Hangar. Until accounts exist the wallet lives in the local save;
// everything goes through this module so a server can take it over later (see `sync` at the bottom).
import { save } from './save.js';

export const CREDIT = '⚓';
export const fmtCredits = (n) => Math.round(n).toLocaleString('en-US') + CREDIT;

// What a kill pays. Soldiers (and every crew member lost with a ship or aircraft) pay 25 each, up to 1,000 a battle.
export const PAY = { soldier: 25, aircraft: 150, patrol: 100, corvette: 250, submarine: 400, battlecruiser: 800, carrier: 2000, superdestroyer: 2500, assist: 0.5, participation: 300, win: 1000, infantryCap: 1000 };
export const PAY_TABLE = [['Marine or sailor', PAY.soldier], ['Aircraft (any)', PAY.aircraft], ['Patrol boat', PAY.patrol], ['Corvette', PAY.corvette], ['Submarine', PAY.submarine], ['Battlecruiser', PAY.battlecruiser], ['Carrier', PAY.carrier], ['Super Destroyer', PAY.superdestroyer]];

const hullPay = (u) => (u.kind === 'soldier' ? 0 : u.isAir ? PAY.aircraft : u.kind === 'sub' ? PAY.submarine : PAY[u.type] || 0);
const heads = (u) => (u.kind === 'soldier' ? 1 : u.def.crew || 0); // people lost with it

let writeT = 0;
const persist = () => { clearTimeout(writeT); writeT = setTimeout(() => save.write(), 1500); };

export const econ = {
  b: null,          // this battle's running tally
  last: null,       // the finished battle's summary, for the results screen
  onPop: null, onCap: null, onChange: null,
  get data() { return save.data.econ; },
  get credits() { return save.data.econ.credits; },
  add(n) { if (!n) return; this.data.credits += n; persist(); this.onChange && this.onChange(); },
  // false if the wallet cannot cover it
  spend(n) { if (n > this.data.credits) return false; this.data.credits -= n; save.write(); this.onChange && this.onChange(); return true; },

  startBattle() { this.b = { ships: 0, aircraft: 0, infantry: 0, heads: 0, kills: 0, assists: 0, played: false, capSaid: false, t0: Date.now() }; },
  join() { if (this.b) this.b.played = true; },
  get infantryLeft() { return this.b ? Math.max(0, PAY.infantryCap - this.b.infantry) : PAY.infantryCap; },

  // Pay the player for a destroyed enemy. share: 1 for a kill, 0.5 for an assist. Returns the words for the kill feed.
  credit(u, share = 1) {
    const b = this.b; if (!b) return '';
    const hull = Math.round(hullPay(u) * share), n = heads(u), want = Math.round(n * PAY.soldier * share), got = Math.min(want, this.infantryLeft), capped = got < want;
    if (u.isAir) b.aircraft += hull; else b.ships += hull;
    b.infantry += got; b.heads += n; if (share === 1) b.kills++; else b.assists++;
    this.add(hull + got);
    if (hull + got > 0 && this.onPop) this.onPop(`+${fmtCredits(hull + got)}`);
    if (capped && !b.capSaid) { b.capSaid = true; this.onCap && this.onCap(); }
    const lim = capped ? (got > 0 ? ', infantry limit reached' : '') : '';
    if (u.kind === 'soldier') return got > 0 ? `+${fmtCredits(got)}${capped ? ' (infantry limit reached)' : ''}` : 'no pay (infantry limit reached)';
    const crew = n > 0 ? `. Crew lost: ${n.toLocaleString('en-US')} (${got > 0 ? `+${fmtCredits(got)}${lim}` : 'no pay, infantry limit reached'})` : '';
    return `+${fmtCredits(hull)}${crew}`;
  },

  // The battle is over: add participation and the win bonus, and keep a summary for the results screen and for syncing.
  finish(won) {
    const b = this.b; if (!b) return null;
    const part = b.played ? PAY.participation : 0, win = b.played && won ? PAY.win : 0;
    this.add(part + win);
    const sum = { won, played: b.played, ships: b.ships, aircraft: b.aircraft, infantry: b.infantry, capped: b.infantry >= PAY.infantryCap, heads: b.heads, kills: b.kills, assists: b.assists, participation: part, win, total: b.ships + b.aircraft + b.infantry + part + win, secs: Math.round((Date.now() - b.t0) / 1000), at: Date.now() };
    this.last = sum; this.b = null;
    if (b.played) { const d = this.data; d.battles++; d.queue.push(sum); if (d.queue.length > 30) d.queue.shift(); save.write(); } // queue: battle results a server has not confirmed yet
    return sum;
  },
};
