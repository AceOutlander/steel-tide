// Aircraft Carrier: the biggest unit. Full flight deck (painted with an angled landing strip, two bow catapults, three
// deck-edge elevators and two helipads), starboard island, four close-in guns, four machine guns, two SAM launchers.
// Extras on the model: deckY, catapults[], landing{}, helipads[], parking[], spawn{} (see the bottom of buildCarrier).
import * as THREE from 'three';
import { MAT, hullNumberMaterial, registerTexture } from '../gfx/materials.js';
import { PartBuilder, hullGeo, slab, makeTurret, makeRadar, sideDecal } from './builders.js';
import { hullHalfWidth, hullDecal, lattice, prismZ } from './corvette.js';

const HP = Math.PI / 2;
const DY = 20;                               // flight deck height above the waterline
const LD = 336, WD = 80, CX = -7, CZ = 0;    // painted overlay plane: length (z), width (x), centre
const STRIP = 0.158;                         // tan of the angled-deck angle (about 9 degrees to port)
const stripX = (z) => -8 - STRIP * (160 - z); // centreline x of the landing strip at station z
// flight deck outline [x, z] (bow at -z, starboard +x), and the same with the three elevator notches cut in
const OUTLINE = [[-16, -166], [16, -166], [20, -160], [24, -120], [32, -90], [32, 120], [26, 150], [24, 166], [-24, 166], [-30, 150], [-34, 80], [-46, 60], [-46, -30], [-36, -62], [-22, -80], [-20, -160]];
const NOTCHED = [[-16, -166], [16, -166], [20, -160], [24, -120], [32, -90], [32, -62], [19, -62], [19, -38], [32, -38], [32, 78], [19, 78], [19, 102], [32, 102], [32, 120], [26, 150], [24, 166],
  [-24, 166], [-30, 150], [-31.83, 118], [-21, 118], [-21, 94], [-33.2, 94], [-34, 80], [-46, 60], [-46, -30], [-36, -62], [-22, -80], [-20, -160]];
const ELEVATORS = [[[19, -62], [32, -62], [32, -38], [19, -38]], [[19, 78], [32, 78], [32, 102], [19, 102]], [[-33.2, 94], [-21, 94], [-21, 118], [-31.83, 118]]];
const HELIPADS = [[15.5, 138], [17, -24]];
const CATS = [-8.5, 8.5];

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
  ctx.globalAlpha = 0.93; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  // deck-edge safety stripe: nation colour outside, white inside
  path(OUTLINE); ctx.strokeStyle = WHITE; ctx.lineWidth = 3.6; ctx.stroke();
  path(OUTLINE); ctx.strokeStyle = NAT; ctx.lineWidth = 2.2; ctx.stroke();
  // axial centreline and the two bow catapult tracks with their blast deflectors
  line(0, -163, 0, -46, WHITE, 0.45, [9, 5]);
  for (const cx of CATS) {
    line(cx, -64, cx, -161, '#101214', 1.0);
    line(cx - 0.95, -64, cx - 0.95, -161, WHITE, 0.24); line(cx + 0.95, -64, cx + 0.95, -161, WHITE, 0.24);
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 0.45; ctx.strokeRect(X(-55), Y(cx - 4.2), 6, 8.4);
    for (let k = 0; k < 6; k++) line(cx - 4.2, -55 - k, cx + 4.2, -56 - k, YELLOW, 0.25);
    line(cx - 3, -64.5, cx + 3, -64.5, WHITE, 0.5);
  }
  // angled landing strip: edge lines, dashed yellow/white centreline, threshold keys, arresting wires
  for (const o of [-14, 14]) line(stripX(166) + o, 166, stripX(-64) + o, -64, WHITE, 0.75);
  line(stripX(164), 164, stripX(-64), -64, YELLOW, 0.9, [7, 7]);
  line(stripX(164), 164, stripX(-64), -64, WHITE, 0.9, [7, 7], 7);
  for (let k = -5; k <= 5; k++) if (k) line(stripX(163) + k * 2.3, 163, stripX(151) + k * 2.3, 151, WHITE, 1.0);
  for (const z of [105, 113, 121, 129]) line(stripX(z) - 12.8, z + 2.0, stripX(z) + 12.8, z - 2.0, '#aeb2b6', 0.36);
  // elevators: yellow border with red hatching
  for (const e of ELEVATORS) {
    path(e); ctx.setLineDash([]); ctx.strokeStyle = YELLOW; ctx.lineWidth = 1.5; ctx.stroke();
    path(e); ctx.setLineDash([1.6, 1.6]); ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
  }
  // helipads: white circle and H, thin yellow outer ring
  for (const [hx, hz] of HELIPADS) {
    ctx.strokeStyle = YELLOW; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(X(hz), Y(hx), 12.6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 0.95; ctx.beginPath(); ctx.arc(X(hz), Y(hx), 11, 0, Math.PI * 2); ctx.stroke();
    line(hx - 3.3, hz - 4.8, hx - 3.3, hz + 4.8, WHITE, 1.5); line(hx + 3.3, hz - 4.8, hx + 3.3, hz + 4.8, WHITE, 1.5); line(hx - 3.3, hz, hx + 3.3, hz, WHITE, 1.5);
  }
  // foul line beside the island, deck number at the bow (reads from astern)
  line(18, 4, 18, 62, RED, 0.45); line(18, 4, 18, 62, WHITE, 0.45, [3, 3]);
  ctx.save(); ctx.translate(X(-141), Y(0)); ctx.rotate(Math.PI / 2);
  ctx.font = 'bold 11.5px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = WHITE;
  ctx.fillText(A ? '07' : '31', 0, 0); ctx.restore();
  ctx.restore();
}

const deckMats = new Map();
function deckPaintMaterial(nation) {
  let m = deckMats.get(nation);
  if (!m) {
    const map = registerTexture('carrierDeck_' + nation, { aspect: 4.2, scale: 2, kind: 'color', draw: (ctx, w, h) => paintDeck(ctx, w, h, nation) });
    m = new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.85, metalness: 0 });
    deckMats.set(nation, m);
  }
  return m;
}

export function buildCarrier(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const L = 330, B = 40, draft = 11, fb = 19.5;
  const HO = { L, B, draft, freeboard: fb, sheer: 0, bowLen: 0.3, bowPow: 0.5, rake: 1.5, sternW: 0.86, sternLen: 0.14, flare: A ? 0.65 : 0.5, full: A ? 0.4 : 0.46 };
  const hull = hullGeo({ ...HO, stations: lod ? 14 : 48, rings: lod ? 3 : 9 });
  b.add(MAT.hull[nation], hull.side);
  const sup = MAT.superstructure[nation], dark = MAT.superDark[nation], gm = MAT.gunmetal, glass = MAT.glass;
  const IX = 26;                               // island centreline x (island footprint x 21..31, z 12..52)

  // ---- flight deck, overhang fairings, island blocks (both lods) ----
  b.add(MAT.flightDeck, slab(lod ? OUTLINE : NOTCHED, 1.2, 4), 0, DY, 0);
  b.add(sup, prismZ([[12, 7], [32, 15.5], [32, 18.8], [12, 18.8]], -95, 122));          // starboard overhang
  b.add(sup, prismZ([[10, 9], [24, 16], [24, 18.8], [10, 18.8]], -125, -95));
  b.add(sup, prismZ([[12, 9], [26, 16], [26, 18.8], [12, 18.8]], 122, 150));
  b.add(sup, prismZ([[3, 12], [20, 16.5], [20, 18.8], [3, 18.8]], -158, -125));         // bow flare
  b.add(sup, prismZ([[-3, 12], [-3, 18.8], [-20, 18.8], [-20, 16.5]], -158, -80));
  b.add(sup, prismZ([[-12, 7], [-12, 18.8], [-46, 18.8], [-46, 15.8]], -30, 60));       // angled-deck sponson
  b.add(sup, prismZ([[-12, 8], [-12, 18.8], [-36, 18.8], [-36, 16]], -62, -30));
  b.add(sup, prismZ([[-12, 8], [-12, 18.8], [-30, 18.8], [-30, 16]], 60, 150));
  if (A) {
    b.taper(sup, 10, 12, 40, 8.4, 35, IX, DY + 6, 32, 0);
    b.taper(sup, 8.4, 6, 24, 7, 20, IX, DY + 15, 24, 0.5);
  } else {
    b.box(sup, 10, 10, 42, IX, DY + 5, 32);
    b.box(sup, 9, 5, 28, IX, DY + 12.5, 26);
  }

  if (b.detail) {
    for (const e of ELEVATORS) b.add(MAT.flightDeck, slab(e, 1.0, 4), 0, DY - 0.1, 0);
    // ---- island ----
    if (A) {
      b.taper(sup, 7, 4, 15, 5.6, 11, IX, DY + 20, 22, 0.5);                     // flight control level
      b.taper(sup, 3.6, 14, 3.6, 1.2, 1.2, IX, DY + 29, 22, 0.3);                // enclosed mast (top DY + 36)
      b.taper(sup, 6.5, 9, 12, 4.5, 7.5, IX + 0.3, DY + 16.5, 44, 1.5);          // funnel
      b.box(dark, 4.2, 0.5, 7.0, IX + 0.3, DY + 21.2, 45.5);
      b.box(glass, 0.14, 1.3, 19, 22.16, DY + 15.6, 24.5, [0, 0, -0.116]); b.box(glass, 0.14, 1.3, 19, 29.84, DY + 15.6, 24.5, [0, 0, 0.116]);
      b.box(glass, 6.4, 1.3, 0.14, IX, DY + 15.6, 13.42, [0.39, 0, 0]);
      b.box(glass, 0.14, 1.1, 11, 22.82, DY + 20.2, 22.4, [0, 0, -0.173]); b.box(glass, 0.14, 1.1, 11, 29.18, DY + 20.2, 22.4, [0, 0, 0.173]);
      b.box(glass, 4.6, 1.1, 0.14, IX, DY + 20.2, 15.8, [0.56, 0, 0]);
      b.box(dark, 0.14, 2.6, 2.0, 24.45, DY + 28, 22.1, [0, 0, -0.085]); b.box(dark, 0.14, 2.6, 2.0, 27.55, DY + 28, 22.1, [0, 0, 0.085]);
      b.box(dark, 2.0, 2.6, 0.14, IX, DY + 28, 20.55, [0.1, 0, 0]);
      b.sphere(MAT.white, 1.3, IX, DY + 23.0, 18.2);
      b.cyl(dark, 0.5, 0.7, 3, IX, DY + 19.5, 32, 'y', 8);                       // aft radar pedestal
    } else {
      b.box(dark, 12.5, 0.35, 30, IX - 0.5, DY + 15.2, 26);
      b.box(sup, 8, 4, 17, IX, DY + 17.3, 23);
      b.box(dark, 11, 0.35, 19, IX - 0.5, DY + 19.5, 23);
      b.box(sup, 6, 3.5, 10, IX, DY + 21.4, 22);
      b.box(dark, 7.5, 0.3, 11.5, IX, DY + 23.3, 22);
      b.rail(gm, [[19.4, DY + 15.4, 11.2], [19.4, DY + 15.4, 40.8]], 1.05, 3.7); b.rail(gm, [[20.2, DY + 19.7, 13.7], [20.2, DY + 19.7, 32.3]], 1.05, 3.7);
      lattice(b, gm, IX, 22, DY + 23.4, DY + 38, 3.8, 1.3, 6, 0.13);
      b.box(dark, 2.8, 0.25, 2.8, IX, DY + 38.1, 22); b.tube(gm, [IX - 5, DY + 33, 22], [IX + 5, DY + 33, 22], 0.08);
      b.add(sup, new THREE.CylinderGeometry(2.6, 3.4, 13, 14), IX, DY + 16.5, 45, [0.16, 0, 0]);
      b.add(MAT.black, new THREE.CylinderGeometry(2.75, 2.75, 0.9, 14), IX, DY + 23.3, 46.1, [0.16, 0, 0]);
      b.tube(gm, [IX + 1.4, DY + 10, 48.6], [IX + 1.4, DY + 23.6, 50.6], 0.2);
      b.box(glass, 0.14, 1.2, 24, 21.44, DY + 13.2, 26); b.box(glass, 0.14, 1.2, 24, 30.56, DY + 13.2, 26); b.box(glass, 7.6, 1.2, 0.14, IX, DY + 13.2, 11.94);
      b.box(glass, 0.14, 1.1, 14, 21.94, DY + 17.8, 23); b.box(glass, 0.14, 1.1, 14, 30.06, DY + 17.8, 23); b.box(glass, 6.6, 1.1, 0.14, IX, DY + 17.8, 14.44);
      b.box(glass, 4.8, 1.0, 0.14, IX, DY + 21.8, 16.94); b.box(glass, 0.14, 1.0, 8, 22.94, DY + 21.8, 22);
      b.sphere(MAT.white, 1.2, IX, DY + 24.4, 25.5);
      b.cyl(dark, 0.5, 0.7, 3.5, IX, DY + 16.9, 35.5, 'y', 8);
      for (const z of [16, 30]) b.cyl(gm, 0.45, 0.45, 0.7, 20.3, DY + 16.4, z, 'x', 8);    // searchlights
    }
    // open bridge wing on the deck side of the island
    b.box(dark, 2.2, 0.25, 16, 20.8, DY + 12, 24);
    b.rail(gm, [[19.8, DY + 12.12, 16.1], [19.8, DY + 12.12, 31.9]], 1.05, 2.7);
    b.box(dark, 0.12, 2.1, 1.0, A ? 20.95 : 20.94, DY + 1.1, 20); b.box(dark, 0.12, 2.1, 1.0, A ? 20.95 : 20.94, DY + 1.1, 44);   // island doors
    for (const [x, z] of (A ? [[23.6, 27.5], [28.4, 27.5]] : [[23, 13], [29, 13], [29.5, 39.5]])) b.tube(gm, [x, DY + (A ? 22 : 15.4), z], [x + 0.4, DY + (A ? 28.5 : 22), z - 0.3], 0.04, 4);
    // ---- sponsons for the close-in guns and SAM launchers ----
    const sponson = (x, y, z, w, d, side) => {
      b.box(sup, w, 0.5, d, x, y - 0.25, z);
      b.taper(sup, w * 0.35, 4.5, d * 0.6, w, d, x - side * w * 0.3, y - 2.75, z);
      const xo = x + side * w / 2;
      b.rail(gm, [[xo - side * w * 0.8, y, z - d / 2], [xo, y, z - d / 2], [xo, y, z + d / 2], [xo - side * w * 0.8, y, z + d / 2]], 1.05, 3.5);
    };
    sponson(26, 15.5, -128, 6, 7, 1); sponson(-24, 15.5, -128, 6, 7, -1); sponson(29, 15.5, 152, 6, 7, 1); sponson(-33, 15.5, 152, 6, 7, -1);
    sponson(31.5, 16, -106, 7, 8, 1); sponson(-35, 16, 128, 7, 8, -1);
    // ---- deck-edge galleries (machine guns) and catwalks ----
    const gallery = (x0, x1, z0, z1, side) => {
      b.box(dark, x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, 17.85, (z0 + z1) / 2);
      const xo = side > 0 ? x1 : x0;
      b.rail(gm, [[xo - side * (x1 - x0), 18, z0], [xo, 18, z0], [xo, 18, z1], [xo - side * (x1 - x0), 18, z1]], 1.05, 4);
    };
    gallery(32, 35.2, -86, -70, 1); gallery(32, 35.2, 104, 120, 1); gallery(-24.6, -21.2, -118, -102, -1); gallery(-49.2, -46, -28, 58, -1);
    b.box(dark, 1.5, 0.2, 110, 32.75, 18.3, 20); b.rail(gm, [[33.5, 18.4, -35], [33.5, 18.4, 75]], 1.05, 5);
    for (let z = -30; z <= 70; z += 5) { b.cyl(MAT.white, 0.45, 0.45, 1.5, 32.5, 17.3, z, 'z', 8); if (z > -26 && z < 56) b.cyl(MAT.white, 0.45, 0.45, 1.5, -46.5, 17.0, z + 2.5, 'z', 8); }
    for (const [x, z, s] of [[23.4, -140, 1], [27, -108, 1], [29.5, 135, 1], [25, 160, 1], [-20.8, -140, -1], [-33, 100, -1], [-27, 158, -1]]) b.tube(gm, [x, 19.4, z], [x + s * 3.6, 25.5, z], 0.05, 4);
    // optical landing aid on the port edge, tow tractors and crash crane, fantail, anchors
    b.box(dark, 0.6, 2.2, 4, -44.6, DY + 1.3, 40); b.box(MAT.yellow, 0.2, 0.3, 3.4, -44.2, DY + 1.8, 40); b.box(MAT.red, 0.2, 0.3, 0.8, -44.2, DY + 1.2, 40);
    for (const z of [-104, -118]) {
      b.box(MAT.yellow, 1.8, 0.9, 3.2, -18.4, DY + 0.75, z); b.box(MAT.black, 2.0, 0.6, 0.7, -18.4, DY + 0.3, z - 1.0); b.box(MAT.black, 2.0, 0.6, 0.7, -18.4, DY + 0.3, z + 1.0);
    }
    b.box(MAT.yellow, 2.6, 1.6, 5.5, 21, DY + 1.1, -108); b.box(MAT.black, 2.8, 0.7, 4.4, 21, DY + 0.35, -108);
    b.tube(MAT.yellow, [21, DY + 1.9, -106], [21, DY + 6.5, -113], 0.28, 6); b.tube(gm, [21, DY + 6.5, -113], [21, DY + 3.2, -113], 0.04, 4);
    b.box(MAT.black, 24, 5.5, 0.3, 0, 13, L / 2 + 0.1);
    for (const s of [-1, 1]) {
      b.box(gm, 0.5, 3.2, 2.2, s * (hullHalfWidth(HO, -150, 14) + 0.2), 14, -150);
      b.rail(gm, [[s * 15, 16, L / 2 + 0.6], [s * 4, 16, L / 2 + 0.6]], 1.05, 3.7);
    }
    b.box(dark, 30, 0.3, 3, 0, 15.85, L / 2 + 0.4);                             // stern gallery under the round-down
  }
  b.build(g);

  const model = { dims: { length: 332, beam: 78, height: A ? DY + 38.5 : DY + 41, draft }, turrets: [], spinners: [], decks: [], blocks: [], posts: [], smoke: [], view: {} };
  if (lod === 0) {
    // painted deck overlay (one plane; canvas X = stern -> bow, canvas Y = port -> starboard)
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(LD, WD), deckPaintMaterial(nation));
    paint.rotation.set(-HP, 0, HP); paint.position.set(CX, DY + 0.05, CZ); paint.receiveShadow = true; paint.renderOrder = 2;
    g.add(paint);
    // ---- weapons. Order: ciws x4, mg x4, sam x2 ----
    const mount = (kind, x, y, z, side, arc) => {
      const t = makeTurret(kind, nation);
      t.node.position.set(x, y, z); t.rest = -side * HP; t.arc = arc; t.node.rotation.y = t.rest; g.add(t.node); model.turrets.push(t);
    };
    mount('ciws', 26, 15.5, -128, 1, 2.0); mount('ciws', -24, 15.5, -128, -1, 2.0); mount('ciws', 29, 15.5, 152, 1, 2.0); mount('ciws', -33, 15.5, 152, -1, 2.0);
    mount('mg', 33.6, 18, -78, 1, 1.5); mount('mg', -23, 18, -110, -1, 1.5); mount('mg', 33.6, 18, 112, 1, 1.5); mount('mg', -47.6, 18, 20, -1, 1.5);
    mount('sam', 31.5, 16, -106, 1, 1.8); mount('sam', -35, 16, 128, -1, 1.8);
    // radars
    const r1 = makeRadar(nation, 7, 2.2); r1.position.set(IX, A ? DY + 36 : DY + 38.2, A ? 22.3 : 22); g.add(r1);
    const r2 = makeRadar(nation, 4.5, 1.3); r2.position.set(IX, A ? DY + 21 : DY + 18.65, A ? 32 : 35.5); g.add(r2);
    model.spinners.push({ node: r1, axis: 'y', speed: 1.0 }, { node: r2, axis: 'y', speed: 1.9 });
    // decals: hull numbers near the bow, island number and insignia
    const num = hullNumberMaterial(A ? '07' : '31', nation);
    g.add(hullDecal(num, 14, 7, HO, 13, -96, 1), hullDecal(num, 14, 7, HO, 13, -96, -1));
    g.add(sideDecal(num, 8, 4, A ? 21.38 : 21, DY + 6, 41, -1), sideDecal(num, 8, 4, A ? 30.62 : 31, DY + 6, 41, 1));
    g.add(sideDecal(MAT.insignia[nation], 5, 5, A ? 21.38 : 21, DY + 6, 30, -1), sideDecal(MAT.insignia[nation], 5, 5, A ? 30.62 : 31, DY + 6, 30, 1));
    // ---- walkable areas (flight deck as rectangles), obstacles ----
    model.decks.push({ x0: -20, x1: 20, z0: -164, z1: -90, y: DY }, { x0: -22, x1: 32, z0: -90, z1: 120, y: DY }, { x0: -46, x1: -22, z0: -32, z1: 60, y: DY },
      { x0: -36, x1: -22, z0: -62, z1: -32, y: DY }, { x0: -31, x1: -22, z0: 60, z1: 150, y: DY }, { x0: -25, x1: 25, z0: 120, z1: 165, y: DY },
      { x0: 32, x1: 35.2, z0: -86, z1: -70, y: 18 }, { x0: 32, x1: 35.2, z0: 104, z1: 120, y: 18 }, { x0: -24.6, x1: -21.2, z0: -118, z1: -102, y: 18 }, { x0: -49.2, x1: -46, z0: -28, z1: 58, y: 18 },
      { x0: 19.7, x1: 21.9, z0: 16, z1: 32, y: DY + 12.12 });
    model.blocks.push({ x0: 21, x1: 31, z0: 12, z1: 52, y0: DY, y1: DY + 26 });
    // ---- crew stations ----
    const fl = (x, z, yaw) => model.posts.push({ x, y: DY, z, yaw, kind: 'flight' });
    fl(19.8, 16, HP); fl(19.8, 30, HP); fl(19.8, 48, HP); fl(30.5, 8, HP); fl(30.5, 124, HP); fl(16.5, -100, HP); fl(-17, -70, -HP);
    fl(-18, -130, -HP); fl(18, -140, HP); fl(0, -44, 0); fl(12, 84, HP); fl(9, 102, HP); fl(-28.5, 140, Math.PI); fl(-29.5, 126, -HP);
    model.posts.push({ x: 20.6, y: DY + 12.12, z: 20, yaw: HP, kind: 'bridge' }, { x: 20.6, y: DY + 12.12, z: 28, yaw: HP, kind: 'bridge' },
      { x: IX - 1.5, y: A ? DY + 12 : DY + 10, z: 16, yaw: 0, kind: 'bridge' }, { x: IX + 1.5, y: A ? DY + 12 : DY + 10, z: 17, yaw: 0, kind: 'bridge' });
    model.smoke.push(new THREE.Vector3(A ? IX + 0.3 : IX, A ? DY + 21.8 : DY + 24, A ? 45.5 : 46.2));
    model.view = { bridge: new THREE.Vector3(A ? 22.7 : 22.0, A ? DY + 15.6 : DY + 13.2, A ? 15.5 : 13), chase: 340, chaseH: 85 };
    // ---- flight operations ----
    model.deckY = DY;
    model.catapults = CATS.map((x) => ({ pos: new THREE.Vector3(x, DY, -65), yaw: 0, length: 95 }));
    model.landing = { touch: new THREE.Vector3(stripX(120), DY, 120), yaw: 0.157, length: 220, width: 28 };
    model.helipads = HELIPADS.map(([x, z]) => ({ pos: new THREE.Vector3(x, DY, z), r: 13 }));
    const pk = HP - 0.3;
    model.parking = [[24.5, -86], [24.5, -70], [25, -50], [22, 1], [9, 18], [9, 32], [9, 46], [24.5, 58], [24.5, 72], [25, 90], [22, 112], [5, 62]]
      .map(([x, z]) => ({ pos: new THREE.Vector3(x, DY, z), yaw: pk }));
    model.elevators = ELEVATORS.map((e) => ({ x0: Math.min(...e.map((p) => p[0])), x1: Math.max(...e.map((p) => p[0])), z0: e[0][1], z1: e[2][1], y: DY - 0.1 }));
    model.spawn = { marine: new THREE.Vector3(27, DY, 123) };
  }
  g.userData.model = model;
  return g;
}
