// Ship crews: with ?v2 in the address the work-in-progress crew in js/sim/v2/crew.js is used (same interface as crew.js).
import { crew as v1 } from './v2/crew.js';

let pick = v1;
if (/[?&]v2/.test(location.search)) { try { pick = (await import('./v2/crew.js')).crew; } catch (e) { console.warn('v2 crew not loaded: ' + e.message); } }

export const crew = pick;
