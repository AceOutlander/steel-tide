// The Credit store and accounts (real-money Credit packs through a payment provider). Everything here is switched OFF
// until js/core/storeconfig.js names a backend. While it is off the game is local-save only and no network request is made.
import { STORE_CONFIG } from './storeconfig.js';

export const store = {
  get enabled() { return !!(STORE_CONFIG && STORE_CONFIG.enabled && STORE_CONFIG.api); },
};
