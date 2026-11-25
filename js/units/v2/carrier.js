// Aircraft Carrier (v2): the biggest unit. Flared hull with a bulbous bow, overhanging flight deck on faired sponsons,
// angled landing strip with four arresting wires, two bow catapult tracks with shuttles and blast-deflector panels, three
// deck-edge elevators hung outside the hangar doors, starboard island, catwalks, safety nets and raft racks all round,
// four close-in guns, four machine guns and two missile launchers on sponsons and galleries.
// Aethia: sloped, faceted island with an enclosed mast and flat arrays. Extro: stepped island with open platforms, a
// lattice mast and a raked round funnel.
// The flight deck layout (outline, elevators, catapults, strip, helipads, parking) is the same as the old model, so flight
// operations are unchanged. userData.model: the standard contract plus deckY, catapults[], landing{}, helipads[],
// parking[], elevators[], spawn{} (see the bottom of make()). Turret order: ciws x4, mg x4, sam x2.
import * as THREE from 'three';
import { registerTexture } from '../../gfx/materials.js';
import { slab } from '../builders.js';
import { startShip, finishShip, spin, house, rail, net, lattice4, radar, hullDecal, latheZ, cached, fineDetail, C,
  door, ladder, liferaft, firebox, anchor, whip, dome, searchlight, navlight, staff, screw, flood, rhib, davit,
  FWD, AFT, SB, PT } from './shipkit.js';
import { mount } from './turrets.js';

const HP = Math.PI / 2;
const DY = 20;                               // flight deck height above the waterline
const LD = 336, WD = 80, CX = -7, CZ = 0;    // painted overlay plane: length (z), width (x), centre
const STRIP = 0.158;                         // tan of the angled-deck angle (about 9 degrees to port)
const stripX = (z) => -8 - STRIP * (160 - z); // centreline x of the landing strip at station z
const OUTLINE = [[-16, -166], [16, -166], [20, -160], [24, -120], [32, -90], [32, 120], [26, 150], [24, 166], [-24, 166], [-30, 150], [-34, 80], [-46, 60], [-46, -30], [-36, -62], [-22, -80], [-20, -160]];
const NOTCHED = [[-16, -166], [16, -166], [20, -160], [24, -120], [32, -90], [32, -62], [19, -62], [19, -38], [32, -38], [32, 78], [19, 78], [19, 102], [32, 102], [32, 120], [26, 150], [24, 166],
  [-24, 166], [-30, 150], [-31.83, 118], [-21, 118], [-21, 94], [-33.2, 94], [-34, 80], [-46, 60], [-46, -30], [-36, -62], [-22, -80], [-20, -160]];
const ELEVATORS = [[[19, -62], [32, -62], [32, -38], [19, -38]], [[19, 78], [32, 78], [32, 102], [19, 102]], [[-33.2, 94], [-21, 94], [-21, 118], [-31.83, 118]]];
const HELIPADS = [[15.5, 138], [17, -24]];
const CATS = [-8.5, 8.5];
const WIRES = [105, 113, 121, 129];

function paintDeck(ctx, w, h, nation) {
  const A = nation === 'aethia';
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(w / LD, h / WD);                 // draw in metres: canvas X runs stern -> bow, canvas Y runs port -> starboard
  const X = (z) => LD / 2 - (z - CZ), Y = (x) => WD / 2 + (x - CX);
  const WHITE = '#e8e6da', YELLOW = '#e2b93b', RED = '#c2392b', NAT = A ? '#3d78c9' : '#d9582a';
  const path = (pts) => { ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(X(z), Y(x)) : ctx.moveTo(X(z), Y(x)))); ctx.closePath(); };
  const line = (x0, z0, x1, z1, color, lw, dash = null, off = 0) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.lineDashOffset = off;
    ctx.beginPath(); ctx.moveTo(X(z0), Y(x0)); ctx.lineTo(X(z1), Y(x1)); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  };
  path(OUTLINE); ctx.clip();
  ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
  // tyre rubber on the landing strip and at the catapults, jet blast scorching behind the deflectors (soft, under the paint)
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 150; i++) { const z0 = 96 + rnd() * 62, len = 14 + rnd() * 46, o = (rnd() - 0.5) * 16 + (rnd() - 0.5) * 6; ctx.globalAlpha = 0.05 + rnd() * 0.07; line(stripX(z0) + o, z0, stripX(z0 - len) + o + (rnd() - 0.5), z0 - len, '#050505', 0.35 + rnd() * 0.5); }
  for (const cx of CATS) for (let i = 0; i < 40; i++) { const z0 = -58 - rnd() * 30, o = (rnd() < 0.5 ? -1 : 1) * (2.2 + rnd() * 1.6); ctx.globalAlpha = 0.05 + rnd() * 0.06; line(cx + o, z0, cx + o * 0.9, z0 - 10 - rnd() * 30, '#050505', 0.3 + rnd() * 0.4); }
  for (const cx of CATS) { const gr = ctx.createRadialGradient(X(-46), Y(cx), 1, X(-46), Y(cx), 11); gr.addColorStop(0, 'rgba(8,7,6,0.5)'); gr.addColorStop(1, 'rgba(8,7,6,0)'); ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(X(-46) - 11, Y(cx) - 11, 22, 22); }
  ctx.globalAlpha = 0.93; ctx.lineCap = 'butt';
  // deck-edge safety stripe: nation colour outside, white inside
  path(OUTLINE); ctx.strokeStyle = WHITE; ctx.lineWidth = 3.6; ctx.stroke();
  path(OUTLINE); ctx.strokeStyle = NAT; ctx.lineWidth = 2.2; ctx.stroke();
  // axial centreline and the two bow catapult tracks with their blast deflectors
  line(0, -163, 0, -46, WHITE, 0.45, [9, 5]);
  for (const cx of CATS) {
    line(cx - 0.95, -64, cx - 0.95, -161, WHITE, 0.24); line(cx + 0.95, -64, cx + 0.95, -161, WHITE, 0.24);
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 0.4; ctx.strokeRect(X(-55), Y(cx - 4.3), 6.2, 8.6);
    for (let k = 0; k < 6; k++) line(cx - 4.3, -55 - k, cx + 4.3, -56 - k, YELLOW, 0.22);
    line(cx - 3, -64.5, cx + 3, -64.5, WHITE, 0.5);
    for (const s of [-1, 1]) line(cx + s * 5.5, -62, cx + s * 5.5, -100, RED, 0.25, [2, 2]);
  }
  // angled landing strip: edge lines, dashed yellow/white centreline, threshold keys, ladder marks
  for (const o of [-14, 14]) line(stripX(166) + o, 166, stripX(-64) + o, -64, WHITE, 0.75);
  line(stripX(164), 164, stripX(-64), -64, YELLOW, 0.9, [7, 7]);
  line(stripX(164), 164, stripX(-64), -64, WHITE, 0.9, [7, 7], 7);
  for (let k = -5; k <= 5; k++) if (k) line(stripX(163) + k * 2.3, 163, stripX(151) + k * 2.3, 151, WHITE, 1.0);
  for (let z = 90; z > -50; z -= 20) for (const o of [-14, 14]) line(stripX(z) + o, z, stripX(z) + o * 0.86, z + 0.3, WHITE, 0.6);
  // elevators: yellow border with red hatching
  for (const e of ELEVATORS) {
    path(e); ctx.setLineDash([]); ctx.strokeStyle = YELLOW; ctx.lineWidth = 1.5; ctx.stroke();
    path(e); ctx.setLineDash([1.6, 1.6]); ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  }
  // ordnance lifts and hatches along the centre
  ctx.lineWidth = 0.22; for (const [x, z] of [[12, -30], [4, 60], [12, 70], [-14, 20], [14, 112]]) { ctx.strokeStyle = YELLOW; ctx.strokeRect(X(z) - 2.2, Y(x) - 1.6, 4.4, 3.2); ctx.strokeStyle = RED; ctx.setLineDash([0.8, 0.8]); ctx.strokeRect(X(z) - 2.2, Y(x) - 1.6, 4.4, 3.2); ctx.setLineDash([]); }
  // helipads: white circle and H, thin yellow outer ring
  for (const [hx, hz] of HELIPADS) {
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(X(hz), Y(hx), 12.6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 0.95; ctx.beginPath(); ctx.arc(X(hz), Y(hx), 11, 0, Math.PI * 2); ctx.stroke();
    line(hx - 3.3, hz - 4.8, hx - 3.3, hz + 4.8, WHITE, 1.5); line(hx + 3.3, hz - 4.8, hx + 3.3, hz + 4.8, WHITE, 1.5); line(hx - 3.3, hz, hx + 3.3, hz, WHITE, 1.5);
  }
  // foul line beside the island, parking tram lines, deck number at the bow (reads from astern)
  line(18, 4, 18, 62, RED, 0.45); line(18, 4, 18, 62, WHITE, 0.45, [3, 3]);
  line(18.6, -92, 18.6, -36, WHITE, 0.3, [1.5, 1.5]); line(18.6, 64, 18.6, 120, WHITE, 0.3, [1.5, 1.5]);
  ctx.save(); ctx.translate(X(-141), Y(0)); ctx.rotate(Math.PI / 2);
  ctx.font = 'bold 11.5px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = WHITE;
  ctx.fillText(A ? '07' : '31', 0, 0); ctx.restore();
  ctx.restore();
}
const deckMats = new Map();
function deckPaintMaterial(nation) {
  let m = deckMats.get(nation);
  if (!m) {
    const map = registerTexture('v2carrierDeck_' + nation, { aspect: 4.2, scale: 2, kind: 'color', draw: (ctx, w, h) => paintDeck(ctx, w, h, nation) });
    m = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.02, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.85, metalness: 0 });
    m.name = 'carrierDeckPaint_' + nation; deckMats.set(nation, m);
  }
  return m;
}
function prismZ(pts, z0, z1) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: z1 - z0, bevelEnabled: false });
  geo.translate(0, 0, z0); geo.deleteAttribute('uv');
  return geo;
}

export function buildCarrier(nation, lod = 0) { const fine = fineDetail(); return cached(`carrier:${nation}:${lod}:${fine}`, () => make(nation, lod, fine)); }

function make(nation, lod, fine) {
  const A = nation === 'aethia', L = 330, B = 40, D = 11, fb = 18.8, IX = 26;
  const S = startShip(nation, lod, fine, { L, B, D, fb, sheer: 0, bowLen: 0.3, bowPow: 0.56, sternW: 0.86, sternLen: 0.14, knuckle: A ? 0.45 : 0, flareTop: A ? 1.5 : 1.4, tumble: 1, wlBow: A ? 0.36 : 0.42, wlMid: 0.95,
    bilge: 4.4, rake: 7, forefoot: 5, keelRise: 0.45, bowRise: 0.1, stations: 72 }, 2.4);
  const { M, k, dk, hull, model, HC } = S;
  model.dims = { length: 332, beam: 78, height: A ? DY + 38.5 : DY + 41, draft: D };

  // ---- flight deck, overhang fairings (cut away at the elevators), island blocks (both detail levels)
  k.add(M.F, slab(lod ? OUTLINE : NOTCHED, 1.2, 4), 0, DY, 0);
  const sb = [[12, 7], [32, 15.5], [32, 18.8], [12, 18.8]], ptf = [[-12, 8], [-12, 18.8], [-30, 18.8], [-30, 16]];
  for (const [z0, z1] of lod ? [[-95, 122]] : [[-95, -62], [-38, 78], [102, 122]]) k.add(HC, prismZ(sb, z0, z1));
  for (const [z0, z1] of lod ? [[60, 150]] : [[60, 94], [118, 150]]) k.add(HC, prismZ(ptf, z0, z1));
  k.add(HC, prismZ([[10, 9], [24, 16], [24, 18.8], [10, 18.8]], -125, -95));
  k.add(HC, prismZ([[12, 9], [26, 16], [26, 18.8], [12, 18.8]], 122, 150)); k.add(HC, prismZ([[12, 11], [24, 16.6], [24, 18.8], [12, 18.8]], 150, 164)); k.add(HC, prismZ([[-12, 11], [-12, 18.8], [-24, 18.8], [-24, 16.6]], 150, 164));
  k.add(HC, prismZ([[3, 12], [20, 16.5], [20, 18.8], [3, 18.8]], -158, -125));         // bow flare
  k.add(HC, prismZ([[-3, 12], [-3, 18.8], [-20, 18.8], [-20, 16.5]], -158, -80));
  k.add(HC, prismZ([[-12, 7], [-12, 18.8], [-46, 18.8], [-46, 15.8]], -30, 60));       // angled-deck sponson
  k.add(HC, prismZ([[-12, 8], [-12, 18.8], [-36, 18.8], [-36, 16]], -62, -30));
  let I1, I2, I3, I4 = null, MS = null, FN = null, mastTop;
  if (A) {
    I1 = house(k, M.S, { x: IX, z0: 12, z1: 52, w: 10, y0: DY, y1: DY + 12, slope: 0.07, rakeF: 0.2, rakeA: 0.12, cf: 1.6, ca: 1.6 });
    I2 = house(k, M.S, { x: IX, z0: 12.6, z1: 36, w: 8.6, y0: DY + 12, y1: DY + 18, slope: 0.09, rakeF: 0.26, rakeA: 0.05, cf: 1.4, ca: 0.8 });
    I3 = house(k, M.S, { x: IX, z0: 14.6, z1: 29.6, w: 7, y0: DY + 18, y1: DY + 22, slope: 0.12, rakeF: 0.3, rakeA: 0.08, cf: 1.2, ca: 0.8 });
    MS = house(k, M.S, { x: IX, z0: 19.8, z1: 24.4, w: 4.2, y0: DY + 22, y1: DY + 35.8, slope: 0.105, rakeF: 0.12, rakeA: 0.06, cf: 0.8, ca: 0.8 }); mastTop = DY + 35.8;
    FN = house(k, M.S, { x: IX + 0.3, z0: 38, z1: 50.5, w: 6.6, y0: DY + 12, y1: DY + 21, slope: 0.12, rakeF: 0.45, rakeA: 0.06, cf: 1.2, ca: 1.2 });
  } else {
    I1 = house(k, M.S, { x: IX, z0: 11, z1: 53, w: 10, y0: DY, y1: DY + 10, slope: 0.01, cf: 1, ca: 1 });
    I2 = house(k, M.S, { x: IX, z0: 12, z1: 40, w: 9, y0: DY + 10, y1: DY + 15, slope: 0.015, rakeF: -0.06, cf: 1, ca: 0.6 });
    I3 = house(k, M.S, { x: IX, z0: 14.5, z1: 31.5, w: 8, y0: DY + 15.3, y1: DY + 19.3, slope: 0.02, rakeF: -0.08, cf: 1, ca: 0.6 });
    I4 = house(k, M.S, { x: IX, z0: 17, z1: 27, w: 6, y0: DY + 19.65, y1: DY + 23.15, slope: 0.03, rakeF: -0.1, cf: 0.8, ca: 0.5 });
    k.cbox(M.SD, 12.5, 0.3, 30, 0.08, IX - 0.5, DY + 15.15, 26); k.cbox(M.SD, 11, 0.3, 19, 0.08, IX - 0.5, DY + 19.5, 23); k.cbox(M.SD, 7.5, 0.26, 11.5, 0.06, IX, DY + 23.28, 22);
    lattice4(k, M.SD, IX, 22, DY + 23.4, DY + 38, 3.8, 1.3, 6, 0.13); mastTop = DY + 38; k.cbox(M.SD, 2.9, 0.2, 2.9, 0.05, IX, DY + 38.05, 22);
    k.add(M.S, new THREE.CylinderGeometry(2.6, 3.4, 13, lod ? 8 : 24), IX, DY + 16.5, 45, [0.16, 0, 0], [1, 1, 1.3]);
    k.add(M.BK, new THREE.CylinderGeometry(2.72, 2.72, 1.1, lod ? 8 : 24), IX, DY + 23.2, 46.1, [0.16, 0, 0], [1, 1, 1.3]);
  }
  if (lod) return finishShip(S);

  // ---- elevators: platforms on girders, guide columns, hangar doors behind them, edge nets
  ELEVATORS.forEach((e, i) => {
    const s = i < 2 ? 1 : -1, z0 = e[0][1], z1 = e[2][1], xi = s > 0 ? 19 : -21, xo = s > 0 ? 32 : -32.5, zc = (z0 + z1) / 2;
    k.add(M.F, slab(e, 0.5, 4), 0, DY - 0.1, 0);
    for (const z of [z0 + 2, zc, z1 - 2]) k.box(M.SD, Math.abs(xo - xi) - 0.6, 1.5, 0.7, (xi + xo) / 2, DY - 1.35, z);
    k.box(M.SD, 0.7, 1.7, z1 - z0 - 0.4, xo - s * 0.6, DY - 1.4, zc); k.box(M.SD, 0.7, 1.7, z1 - z0 - 0.4, xi + s * 1.2, DY - 1.4, zc);
    for (const z of [z0 + 0.6, z1 - 0.6]) { k.box(M.SD, 1.1, 10.5, 0.9, s * 20.6, DY - 6.4, z); k.rod(M.SD, [s * 21, 10.5, z], [xo - s * 1.5, DY - 2.1, z], 0.28, 5); }
    k.frame(hull.wall(zc, 13.4, s), (q) => { q.box(M.SK, z1 - z0 - 2.4, 9.2, 0.3, 0, 0, -0.04); if (fine) { for (let y = -4; y <= 4; y += 1) q.box(M.SD, z1 - z0 - 2.6, 0.12, 0.1, 0, y, 0.12); for (const x of [-1, 1]) q.box(M.YL, 0.4, 9.2, 0.06, x * (z1 - z0 - 2.4) / 2, 0, 0.14); } });
    net(k, M.rail, [[xo, DY - 0.1, z0 + 0.3], [xo, DY - 0.1, z1 - 0.3]], [s, 0], 1.5);
  });
  // ---- catapults: slotted tracks, shuttles, blast-deflector panels, bow fittings; arresting wires with sheaves
  for (const cx of CATS) {
    k.box(M.BK, 0.3, 0.05, 97, cx, DY + 0.015, -112.5); for (const s of [-1, 1]) k.box(C.iron, 0.16, 0.06, 97, cx + s * 0.26, DY + 0.02, -112.5);
    if (fine) for (let z = -66; z > -160; z -= 6) k.box(M.SK, 0.9, 0.03, 0.1, cx, DY + 0.035, z);
    k.cbox(C.iron, 0.5, 0.2, 1.3, 0.05, cx, DY + 0.12, -66.5); k.box(C.steel, 0.22, 0.1, 0.5, cx, DY + 0.26, -67);
    k.cbox(C.iron, 1.0, 0.16, 2.6, 0.05, cx, DY + 0.07, -161.8);
    for (let i = 0; i < 3; i++) { k.cbox(M.SD, 2.7, 0.08, 5.6, 0.03, cx + (i - 1) * 2.82, DY + 0.03, -52); if (fine) k.box(M.SK, 2.5, 0.03, 0.16, cx + (i - 1) * 2.82, DY + 0.075, -49.5); }
  }
  for (const z of WIRES) {
    const a = [stripX(z) - 12.8, DY + 0.09, z + 2.0], b = [stripX(z) + 12.8, DY + 0.09, z - 2.0];
    k.rod(C.gun, a, b, 0.035, 4);
    for (const p of [a, b]) { k.cbox(M.SD, 0.9, 0.16, 0.9, 0.04, p[0], DY + 0.07, p[2]); k.cyl(C.iron, 0.24, 0.24, 0.1, p[0], DY + 0.18, p[2], 'y', 10); }
    if (fine) for (let t = 0.1; t < 0.95; t += 0.2) k.box(C.iron, 0.1, 0.07, 0.4, a[0] + (b[0] - a[0]) * t, DY + 0.04, a[2] + (b[2] - a[2]) * t);
  }
  // ---- island: bridges, flight control, arrays or platforms, funnel, lights and aerials
  const win = (H, v0, v1, nf, ns) => { H.windows(k, M, FWD, v0, v1, nf, 0.4); H.windows(k, M, PT, v0, v1, ns, 0.6); H.windows(k, M, SB, v0, v1, ns, 0.6); H.windows(k, M, 0, v0, v1, 1, 0.15); H.windows(k, M, 6, v0, v1, 1, 0.15); };
  if (A) {
    win(I2, 3.0, 4.2, 6, 14); win(I3, 1.7, 2.7, 5, 9); I2.windows(k, M, AFT, 3.0, 4.0, 5, 0.6);
    house(k, M.S, { x: IX - 4.1, z0: 20, z1: 27, w: 2.2, y0: DY + 18, y1: DY + 21, slope: 0.1, cf: 0.5, ca: 0.5 }).windows(k, M, PT, 1.3, 2.3, 5, 0.3);   // flight control
    for (const e of [FWD, SB, AFT, PT]) { const c = e === FWD || e === AFT ? IX : 22.1; MS.on(k, e, c, 4.6, (q) => { q.cbox(M.SD, 2.5, 3.0, 0.08, 0.4, 0, 0, 0.01); q.cbox(M.SK, 2.2, 2.7, 0.16, 0.36, 0, 0, 0.04); }); MS.on(k, e, c, 10, (q) => q.cbox(M.SK, 1.0, 1.4, 0.12, 0.2, 0, 0, 0.04)); }
    k.cbox(M.SD, 2.4, 0.2, 2.6, 0.05, IX, mastTop + 0.08, 22.3);
    k.rod(M.SD, [IX - 5, DY + 30.5, 22.2], [IX + 5, DY + 30.5, 22.2], 0.1, 5);
    for (const s of [-1, 1]) { k.at(IX + s * 4.8, DY + 30.5, 22.2, 0, (q) => whip(q, 4, 0)); k.at(IX + s * 3.2, DY + 30.6, 22.2, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.12)); k.at(IX + s * 2.3, DY + 22, 27.2, 0, (q) => dome(q, M, 0.9, 0.5)); k.at(IX + s * 2.4, DY + 22, 16.8, 0, (q) => whip(q, 6.5, 0.1)); }
    k.at(IX, DY + 22, 18.2, 0, (q) => dome(q, M, 1.3, 0.5)); k.cyl(M.SD, 0.5, 0.7, 3, IX, DY + 19.5, 32, 'y', 10); k.at(IX + 2.6, DY + 18, 33.5, 0, (q) => dome(q, M, 1.0, 0.6));
    k.cbox(M.BK, 4.0, 0.4, 7.4, 0.1, IX + 0.3, DY + 21.1, 45.6);
    for (const z of [43.2, 45.6, 48]) for (const s of [-1, 1]) { k.cyl(M.SD, 0.6, 0.68, 1.2, IX + 0.3 + s * 0.9, DY + 21.7, z, 'y', 12); k.cyl(M.BK, 0.5, 0.5, 0.06, IX + 0.3 + s * 0.9, DY + 22.31, z, 'y', 12); }
    for (const e of [SB, PT]) FN.on(k, e, 45, 4.5, (q) => { q.cbox(M.SK, 6, 2.6, 0.08, 0.05, 0, 0, 0.02); if (fine) for (let i = 0; i < 8; i++) q.box(M.SD, 5.8, 0.08, 0.06, 0, -1.05 + i * 0.3, 0.07); });
  } else {
    win(I2, 2.6, 3.8, 6, 16); win(I3, 1.9, 3.0, 5, 10); win(I4, 1.7, 2.7, 4, 6);
    rail(k, [[19.4, DY + 15.3, 11.2], [19.4, DY + 15.3, 40.8], [32.4, DY + 15.3, 40.8]], { mc: M.rail, post: 2.4 }); rail(k, [[20.2, DY + 19.65, 13.7], [20.2, DY + 19.65, 32.3], [31.8, DY + 19.65, 32.3]], { mc: M.rail, post: 2.4 });
    rail(k, [[22.4, DY + 23.4, 16.4], [22.4, DY + 23.4, 27.6], [29.6, DY + 23.4, 27.6], [29.6, DY + 23.4, 16.4], [22.4, DY + 23.4, 16.4]], { mc: M.rail, post: 1.9 });
    for (const [y, w] of [[DY + 28, 3.2], [DY + 33, 2.2]]) k.cbox(M.SD, w, 0.12, w, 0.03, IX, y, 22);
    k.rod(M.SD, [IX - 5, DY + 33, 22], [IX + 5, DY + 33, 22], 0.1, 5);
    for (const s of [-1, 1]) { k.at(IX + s * 4.8, DY + 33, 22, 0, (q) => whip(q, 4, 0)); k.at(IX + s * 3.2, DY + 33.1, 22, 0, (q) => navlight(q, s > 0 ? C.lampGreen : C.lampRed, 0.12)); k.at(IX + s * 2.3, DY + 23.4, 25.8, 0, (q) => dome(q, M, 0.8, 0.4)); }
    k.at(IX, DY + 23.4, 18.2, 0, (q) => dome(q, M, 0.9, 0.4)); k.cyl(M.SD, 0.5, 0.7, 3.5, IX, DY + 16.9, 35.5, 'y', 10);
    k.rod(M.SD, [IX + 1.4, DY + 10, 48.6], [IX + 1.4, DY + 23.8, 50.8], 0.2, 6); k.rod(M.SD, [IX - 1.4, DY + 10, 48.6], [IX - 1.4, DY + 23, 50.6], 0.16, 6);
    for (const s of [-1, 1]) k.cyl(M.BK, 0.7, 0.7, 0.6, IX + s * 1.0, DY + 23.9, 46.4, 'y', 12);
    for (const z of [16, 30]) k.at(20.3, DY + 15.3, z, HP, (q) => searchlight(q, M, 1.1)); for (const [x, z] of [[23, 13], [29, 13], [29.5, 39.5]]) k.at(x, DY + 15.3, z, 0, (q) => whip(q, 6.5, 0.06));
  }
  const lz = (A ? 22.3 : 22) + 1.0; k.rod(M.SD, [IX + 1, mastTop, lz], [IX + 1, mastTop + 3, lz], 0.05, 4); k.at(IX + 1, mastTop + 3.1, lz, 0, (q) => navlight(q, C.lampWhite, 0.12));
  // open bridge wing on the deck side, doors, ladders, floodlights, fire stations
  k.cbox(M.SD, 2.3, 0.25, 16, 0.05, 20.8, DY + 12, 24); for (const z of [17.5, 24, 30.5]) k.rod(M.SD, [19.9, DY + 11.9, z], [21.2, DY + 10, z], 0.1, 4);
  rail(k, [[21.7, DY + 12.12, 16.1], [19.8, DY + 12.12, 16.1], [19.8, DY + 12.12, 31.9], [21.7, DY + 12.12, 31.9]], { mc: M.rail, post: 1.6 });
  for (const e of [PT, SB]) { for (const z of [20, 34, 46]) I1.on(k, e, z, 0, (q) => door(q, M, 0.9, 2.0)); for (const z of [15, 27, 40, 49]) I1.on(k, e, z, 6.5, (q) => flood(q, 1.4)); I1.on(k, e, 38, 0.2, (q) => ladder(q, M.rail, 9.5)); I1.on(k, e, 24, 1.5, (q) => firebox(q)); }
  I1.on(k, AFT, IX, 0, (q) => door(q, M, 0.9, 2.0)); I1.on(k, FWD, IX, 0, (q) => door(q, M, 0.9, 2.0)); I2.on(k, PT, 28, 0.13, (q) => door(q, M));
  // ---- sponsons for the close-in guns and missile launchers; galleries for the machine guns; catwalks and raft racks
  const sponson = (x, y, z, w, d, s) => {
    const hx = hull.xAt(z, y - 7) - 0.6, ox = Math.abs(x) + w / 2 - 0.4;
    k.cbox(M.SD, w, 0.5, d, 0.08, x, y - 0.25, z); k.add(HC, prismZ([[s * ox, y - 0.5], [s * hx, y - 7.5], [s * hx, y - 0.5]], z - d * 0.36, z + d * 0.36));
    const xo = x + s * w / 2; rail(k, [[xo - s * w * 0.9, y, z - d / 2], [xo, y, z - d / 2], [xo, y, z + d / 2], [xo - s * w * 0.9, y, z + d / 2]], { mc: M.rail, post: 1.8 });
  };
  sponson(26, 15.5, -128, 6, 7, 1); sponson(-24, 15.5, -128, 6, 7, -1); sponson(29, 15.5, 152, 6, 7, 1); sponson(-33, 15.5, 152, 6, 7, -1); sponson(31.5, 16, -106, 7, 8, 1); sponson(-35, 16, 128, 7, 8, -1);
  const gallery = (x0, x1, z0, z1, s) => {
    k.cbox(M.SD, x1 - x0, 0.3, z1 - z0, 0.06, (x0 + x1) / 2, 17.85, (z0 + z1) / 2); const xo = s > 0 ? x1 : x0, xi = s > 0 ? x0 : x1;
    rail(k, [[xi, 18, z0], [xo, 18, z0], [xo, 18, z1], [xi, 18, z1]], { mc: M.rail, post: 2 });
    for (let z = z0 + 1; z < z1; z += 5) k.rod(M.SD, [xo - s * 0.2, 17.7, z], [xi, 16, z], 0.1, 4);
  };
  gallery(32, 35.2, -86, -70, 1); gallery(32, 35.2, 104, 120, 1); gallery(-24.6, -21.2, -118, -102, -1); gallery(-49.2, -46, -28, 58, -1);
  k.box(M.SD, 1.5, 0.2, 110, 32.75, 18.3, 20); rail(k, [[33.5, 18.4, -35], [33.5, 18.4, 75]], { mc: M.rail, post: 2.5 });
  for (let z = -30; z <= 70; z += 5) { k.at(32.6, 17.0, z, 0, (q) => liferaft(q, 1.5, 0.42)); if (z > -26 && z < 56) k.at(-46.6, 16.6, z + 2.5, 0, (q) => liferaft(q, 1.5, 0.42)); }
  for (const [x, z, s] of [[23.4, -140, 1], [27, -108, 1], [29.5, 135, 1], [25, 160, 1], [-20.8, -140, -1], [-33, 100, -1], [-27, 158, -1], [-40, -46, -1]]) k.at(x, 19.4, z, -s * HP, (q) => whip(q, 7, 0.55));
  // safety nets along the open deck edges
  const edge = (pts, out) => net(k, M.rail, pts.map(([x, z]) => [x, DY - 0.05, z]), out, 1.6);
  edge([[20.2, -158], [24, -120], [31.6, -92]], [1, 0]); edge([[-20.2, -158], [-21.9, -82]], [-1, 0]); edge([[-23, -79], [-36, -62], [-45.6, -31]], [-0.85, -0.5]);
  edge([[32, 121], [26.2, 150], [24.2, 165]], [1, 0]); edge([[-45.6, 61], [-34.2, 80], [-33.3, 93]], [-0.8, 0.6]); edge([[-31.7, 119], [-30, 150], [-24.2, 165]], [-1, 0]);
  edge([[-15.5, -166.2], [15.5, -166.2]], [0, -1]); edge([[-23.5, 166.2], [23.5, 166.2]], [0, 1]);
  // ---- deck gear: landing aid, tractors, crash crane, tie-down stores
  k.at(-44.4, DY, 40, 0, (q) => { q.cbox(M.SD, 1.2, 0.3, 5, 0.05, 0, 0.15, 0); q.cbox(M.SK, 0.7, 2.0, 1.3, 0.05, 0, 1.3, 0); q.box(C.lampAmber, 0.05, 0.9, 0.5, 0.36, 1.4, 0); for (const z of [-1.7, -1.2, 1.2, 1.7]) q.box(C.lampGreen, 0.05, 0.22, 0.34, 0.3, 1.45, z); q.box(C.lampRed, 0.05, 0.2, 0.5, 0.36, 2.15, 0); q.box(M.SD, 0.2, 1.2, 4.2, -0.1, 1.4, 0); });
  const tractor = (x, z, yaw) => k.at(x, DY, z, yaw, (q) => { q.cbox(C.yellow, 1.7, 0.7, 3.1, 0.08, 0, 0.72, 0); q.cbox(C.yellow, 1.5, 0.4, 1.2, 0.06, 0, 1.25, 0.7); q.cbox(C.black, 1.3, 0.35, 0.5, 0.04, 0, 1.2, -0.2); for (const sx of [-1, 1]) for (const sz of [-1, 1]) q.cyl(C.rubber, 0.42, 0.42, 0.4, sx * 0.75, 0.42, sz * 1.0, 'x', 12); q.box(C.dark, 0.2, 0.2, 0.6, 0, 0.5, -1.8); });
  tractor(-18.4, -104, 0.2); tractor(-18.4, -118, -0.1);
  k.at(21, DY, -108, 0, (q) => { q.cbox(C.yellow, 2.6, 1.3, 5.6, 0.1, 0, 1.25, 0); q.cbox(C.yellow, 1.6, 1.3, 1.6, 0.08, -0.4, 2.5, 1.6); q.box(M.G, 1.2, 0.7, 0.05, -0.4, 2.7, 0.78); for (const sx of [-1, 1]) for (const sz of [-1.6, 0, 1.6]) q.cyl(C.rubber, 0.62, 0.62, 0.5, sx * 1.15, 0.62, sz, 'x', 12); q.add(C.yellow, new THREE.BoxGeometry(0.5, 0.6, 8.6), 0.4, 4.6, -2.6, [0.6, 0, 0]); q.rod(C.gun, [0.4, 6.95, -6.1], [0.4, 3.6, -6.1], 0.04, 3); q.cbox(C.black, 0.4, 0.5, 0.4, 0.05, 0.4, 3.4, -6.1); });
  // ---- bow and stern: anchors, bulb, fantail gallery, staffs, screws and rudders
  k.add(HC, latheZ([[-10, 0.2], [-8.6, 2.4], [-5, 3.6], [0, 3.9], [7, 3.3], [13, 1.2]], 14), 0, -6.6, -154, null, [1, 0.9, 1]);
  for (const s of [-1, 1]) {
    k.frame(hull.wall(-151, 14.2, s), (q) => anchor(q, 2.0));
    rail(k, [[s * 16.5, 16, L / 2 + 0.9], [s * 0.2, 16, L / 2 + 0.9]], { mc: M.rail, post: 2.2 });
    for (const x of [6.5, 14]) k.at(s * x, -8.2, 148, 0, (q) => screw(q, HC, 3.0, 26));
    k.frame(hull.wall(86, 3.6, s), (q) => { q.at(0, 0, 1.9, HP, (r) => rhib(r, M, 8.0, 2.7)); for (const x of [-2.7, 2.7]) q.at(x, 0.3, 0, -HP, (r) => davit(r, M, 3.4, 1.9)); });   // sea boats on davits
    for (const z of [-120, -60, 0, 60, 110]) k.frame(hull.wall(z, 5.2, s), (q) => { q.box(M.SK, 9, 2.8, 0.2, 0, 0, -0.06); q.box(M.SD, 9.4, 0.2, 0.5, 0, -1.5, 0.15); if (fine) for (const x of [-4.4, 0, 4.4]) q.rod(M.rail, [x, -1.4, 0.35], [x, -0.3, 0.35], 0.04, 3); q.rod(M.rail, [-4.5, -0.3, 0.35], [4.5, -0.3, 0.35], 0.04, 3); });
  }
  k.box(M.SK, 26, 6.0, 0.4, 0, 12.6, L / 2 + 0.05); k.cbox(M.SD, 33, 0.3, 3, 0.06, 0, 15.85, L / 2 + 0.6); k.cbox(M.SD, 27, 0.3, 0.6, 0.05, 0, 9.5, L / 2 + 0.3);
  if (fine) for (let x = -12; x <= 12; x += 4) k.box(M.SD, 0.3, 6, 0.5, x, 12.6, L / 2 + 0.2);
  k.at(0, 16, L / 2 + 1.8, Math.PI, (q) => staff(q, 5, 0.15)); k.at(0, DY - 1.2, -166.8, 0, (q) => navlight(q, C.lampWhite, 0.15));

  // ---- painted deck overlay (one plane; canvas X = stern -> bow, canvas Y = port -> starboard), numbers, insignia
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(LD, WD), deckPaintMaterial(nation));
  paint.rotation.set(-HP, 0, HP); paint.position.set(CX, DY + 0.012, CZ); paint.receiveShadow = true; paint.renderOrder = 2; S.g.add(paint);
  const num = M.num(A ? '07' : '31');
  hullDecal(dk, num, 12, 6, hull, 10.6, -134, 1); hullDecal(dk, num, 12, 6, hull, 10.6, -134, -1);
  for (const e of [PT, SB]) { dk.frame(I1.frame(e, 41.5, 6, 0.04), (q) => q.add(num, new THREE.PlaneGeometry(8, 4))); dk.frame(I1.frame(e, 30, 6, 0.04), (q) => q.add(M.ins, new THREE.PlaneGeometry(4.6, 4.6))); }

  // ---- weapons. Order: ciws x4, mg x4, sam x2
  const mt = (kind, x, y, z, s, arc) => mount(S, kind, x, y, z, -s * HP, arc);
  mt('ciws', 26, 15.5, -128, 1, 2.0); mt('ciws', -24, 15.5, -128, -1, 2.0); mt('ciws', 29, 15.5, 152, 1, 2.0); mt('ciws', -33, 15.5, 152, -1, 2.0);
  mt('mg', 33.6, 18, -78, 1, 1.5); mt('mg', -23, 18, -110, -1, 1.5); mt('mg', 33.6, 18, 112, 1, 1.5); mt('mg', -47.6, 18, 20, -1, 1.5);
  mt('sam', 31.5, 16, -106, 1, 1.8); mt('sam', -35, 16, 128, -1, 1.8);
  spin(S, radar(M, A ? 'twin' : 'mesh', 7, 2.3, fine), IX, mastTop + 0.2, A ? 22.3 : 22, 1.0);
  spin(S, radar(M, A ? 'panel' : 'mesh', 4.5, 1.5, fine), IX, A ? DY + 21 : DY + 18.65, A ? 32 : 35.5, 1.9);
  // ---- walkable areas (flight deck as rectangles), obstacles
  model.decks.push({ x0: -20, x1: 20, z0: -164, z1: -90, y: DY }, { x0: -22, x1: 32, z0: -90, z1: 120, y: DY }, { x0: -46, x1: -22, z0: -32, z1: 60, y: DY },
    { x0: -36, x1: -22, z0: -62, z1: -32, y: DY }, { x0: -31, x1: -22, z0: 60, z1: 150, y: DY }, { x0: -25, x1: 25, z0: 120, z1: 165, y: DY },
    { x0: 32, x1: 35.2, z0: -86, z1: -70, y: 18 }, { x0: 32, x1: 35.2, z0: 104, z1: 120, y: 18 }, { x0: -24.6, x1: -21.2, z0: -118, z1: -102, y: 18 }, { x0: -49.2, x1: -46, z0: -28, z1: 58, y: 18 },
    { x0: 19.7, x1: 21.9, z0: 16, z1: 32, y: DY + 12.12 });
  model.blocks.push({ x0: 21, x1: 31, z0: A ? 12 : 11, z1: A ? 52 : 53, y0: DY, y1: DY + 26 });
  // ---- crew stations
  const fl = (x, z, yaw) => model.posts.push({ x, y: DY, z, yaw, kind: 'flight' });
  fl(19.8, 16, HP); fl(19.8, 30, HP); fl(19.8, 48, HP); fl(30.5, 8, HP); fl(30.5, 124, HP); fl(16.5, -100, HP); fl(-17, -70, -HP);
  fl(-18, -130, -HP); fl(18, -140, HP); fl(0, -44, 0); fl(12, 84, HP); fl(9, 102, HP); fl(-28.5, 140, Math.PI); fl(-29.5, 126, -HP);
  model.posts.push({ x: 20.6, y: DY + 12.12, z: 20, yaw: HP, kind: 'bridge' }, { x: 20.6, y: DY + 12.12, z: 28, yaw: HP, kind: 'bridge' },
    { x: IX - 1.5, y: A ? DY + 12 : DY + 10, z: 16, yaw: 0, kind: 'bridge' }, { x: IX + 1.5, y: A ? DY + 12 : DY + 10, z: 17, yaw: 0, kind: 'bridge' });
  model.smoke.push(new THREE.Vector3(A ? IX + 0.3 : IX, A ? DY + 22.6 : DY + 24.4, A ? 45.6 : 46.4));
  model.view = { bridge: new THREE.Vector3(A ? 23.2 : 22.4, A ? DY + 15.6 : DY + 13.2, A ? 16.2 : 13.6), chase: 340, chaseH: 85 };
  // ---- flight operations
  model.deckY = DY;
  model.catapults = CATS.map((x) => ({ pos: new THREE.Vector3(x, DY, -65), yaw: 0, length: 95 }));
  model.landing = { touch: new THREE.Vector3(stripX(120), DY, 120), yaw: 0.157, length: 220, width: 28 };
  model.helipads = HELIPADS.map(([x, z]) => ({ pos: new THREE.Vector3(x, DY, z), r: 13 }));
  const pk = HP - 0.3;
  model.parking = [[24.5, -86], [24.5, -70], [25, -50], [22, 1], [9, 18], [9, 32], [9, 46], [24.5, 58], [24.5, 72], [25, 90], [22, 112], [5, 62]]
    .map(([x, z]) => ({ pos: new THREE.Vector3(x, DY, z), yaw: pk }));
  model.elevators = ELEVATORS.map((e) => ({ x0: Math.min(...e.map((p) => p[0])), x1: Math.max(...e.map((p) => p[0])), z0: e[0][1], z1: e[2][1], y: DY - 0.1 }));
  model.spawn = { marine: new THREE.Vector3(27, DY, 123) };
  return finishShip(S);
}
