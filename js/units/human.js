// People: one place to get the human model from. With ?v2 in the address the work-in-progress figure in js/units/v2/human.js
// is used instead (same two functions), so it can be developed without touching the game.
import * as v1 from './marine.js';

let impl = v1;
if (/[?&]v2/.test(location.search)) { try { impl = await import('./v2/human.js'); } catch (e) { console.warn('v2 human not loaded: ' + e.message); } }

export const buildSoldier = (...a) => impl.buildSoldier(...a);
export const animateSoldier = (...a) => impl.animateSoldier(...a);
