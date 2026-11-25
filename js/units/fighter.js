// Stealth Fighter (air superiority). Also exports the small airframe helpers shared by the other aircraft modules.
// Extras on userData.model: gearHeight, gear[], engines[], burners[], cockpit, pylons[], surfaces {elevL, elevR} (rotation.x),
// rudders [left, right] (rotation.y), view.
import * as THREE from 'three';
import { MAT } from '../gfx/materials.js';
import { PartBuilder, fuselage, wing } from './builders.js';

// ---- shared airframe helpers ----------------------------------------------------------------------------------------------
// Mirror a geometry across the YZ plane (x -> -x) keeping outward-facing triangles.
export function mirrorX(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  for (let i = 0; i + 2 < p.count; i += 3) {
    const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z);
    if (uv) { const u = uv.getX(i + 1), v = uv.getY(i + 1); uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2)); uv.setXY(i + 2, u, v); }
  }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  return g;
}
// Add a part made by make() on the starboard side at (x,y,z) and its mirror image on the port side.
export function pair(b, mat, make, x, y, z) { b.add(mat, make(), x, y, z); b.add(mat, mirrorX(make()), -x, y, z); }
// Upright fin: a wing() panel stood on its root. Root leading edge at the origin, chord runs aft (+z), span runs up.
// cant leans the tip toward +X (positive) or -X (negative); cant near PI makes a ventral fin.
export function fin(span, rootChord, tipChord, sweep, thick, cant = 0, tipThick = null) {
  const g = wing(span, rootChord, tipChord, sweep, thick, tipThick); g.rotateZ(Math.PI / 2 - cant); return g;
}
// Landing-gear leg: Group at the attachment point, strut down `len`, wheel(s) radius r at the bottom.
export function gearLeg(x, y, z, len, r, twin = false) {
  const grp = new THREE.Group(), pb = new PartBuilder(0); grp.position.set(x, y, z);
  pb.tube(MAT.steel, [0, 0, 0], [0, -len, 0], Math.max(0.05, r * 0.2), 6);
  pb.tube(MAT.steel, [0, -len * 0.35, 0], [0, 0, len * 0.5], Math.max(0.03, r * 0.11), 5);
  pb.box(MAT.steel, 0.04, len * 0.7, r * 1.6, x >= 0 ? r * 0.9 + 0.12 : -(r * 0.9 + 0.12), -len * 0.35, 0);
  for (const wx of twin ? [-r * 0.6, r * 0.6] : [0]) { pb.cyl(MAT.black, r, r, r * 0.55, wx, -len, 0, 'x', 12); pb.cyl(MAT.steel, r * 0.45, r * 0.45, r * 0.58, wx, -len, 0, 'x', 8); }
  pb.build(grp);
  return grp;
}
// Afterburner plume: open cone trailing +Z from the nozzle (uv v = 1 at the nozzle). Hidden until the sim shows it.
export function burnerCone(pos, r, len = 5) {
  const geo = new THREE.CylinderGeometry(r, r * 0.12, len, 12, 1, true);
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, MAT.afterburner); m.position.copy(pos); m.visible = false; m.renderOrder = 3;
  return m;
}
const discMat = new THREE.MeshBasicMaterial({ color: 0x191b1e, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
// Rotor / propeller: { node, blades, disc }. node spins about `axis`; blades is swapped for the translucent disc at speed.
export function makeRotor(radius, nBlades, chord, axis = 'y', bladeMat = MAT.black, hubR = 0.28) {
  const node = new THREE.Group(), blades = new THREE.Group(), pb = new PartBuilder(0);
  for (let i = 0; i < nBlades; i++) {
    const L = radius - hubR, geo = new THREE.BoxGeometry(L, Math.max(0.035, chord * 0.09), chord);
    geo.translate(L / 2 + hubR, 0, 0); geo.rotateZ(axis === 'y' ? -0.035 : 0); geo.rotateX(axis === 'y' ? 0.06 : 0.5); geo.rotateY((i / nBlades) * Math.PI * 2);
    pb.add(bladeMat, geo);
  }
  pb.cyl(MAT.gunmetal, hubR * 1.1, hubR * 1.25, Math.max(0.25, chord * 0.9), 0, 0, 0, 'y', 8);
  pb.build(blades, { cast: true, receive: false });
  const dg = new THREE.CircleGeometry(radius, 28); dg.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(dg, discMat); disc.visible = false; disc.renderOrder = 4;
  if (axis === 'x') { blades.rotation.z = Math.PI / 2; disc.rotation.z = Math.PI / 2; }
  else if (axis === 'z') { blades.rotation.x = Math.PI / 2; disc.rotation.x = Math.PI / 2; }
  node.add(blades, disc);
  return { node, blades, disc };
}
// Insignia decal. face: 'up' (lies on a wing top), 'right' (faces +X), 'left' (faces -X), 'down'
export function decal(nation, size, x, y, z, face = 'up') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), MAT.insignia[nation]);
  if (face === 'up') m.rotation.x = -Math.PI / 2; else if (face === 'down') m.rotation.x = Math.PI / 2; else m.rotation.y = face === 'right' ? Math.PI / 2 : -Math.PI / 2;
  m.position.set(x, y, z); m.renderOrder = 2;
  return m;
}

// ---- the fighter ----------------------------------------------------------------------------------------------------------
export function buildFighter(nation, lod = 0) {
  const A = nation === 'aethia';
  const g = new THREE.Group(), b = new PartBuilder(lod);
  const skin = MAT.aircraft[nation], dark = MAT.aircraftDark[nation];
  const prof = A
    ? [[-9.5, 0.02], [-8.7, 0.26], [-7, 0.58], [-5, 0.84], [-3, 1.02], [0, 1.12], [4, 1.08], [7, 0.92], [8.5, 0.78]]
    : [[-9.3, 0.05], [-8.8, 0.38], [-7, 0.72], [-5, 0.94], [-3, 1.08], [0, 1.18], [4, 1.14], [7, 1.0], [8.5, 0.86]];
  b.add(skin, fuselage(prof, lod ? 6 : A ? 10 : 14, A ? 1.5 : 1.4, A ? 0.82 : 0.92));
  const wz = A ? -3.0 : -2.4, cant = A ? 0.47 : 0.14;
  pair(b, skin, () => wing(5.2, A ? 8.0 : 7.4, 1.4, A ? 5.4 : 4.6, 0.3, 0.07), 1.6, 0.02, wz);
  const finGeo = (s) => fin(3.0, 3.8, 1.3, 2.5, 0.16, s * cant);
  const tailGeo = () => { const t = wing(2.9, 3.2, 1.0, 2.4, 0.14, 0.05); t.translate(0, 0, -1.4); return t; };
  for (const s of [-1, 1]) b.add(skin, finGeo(s), s * 1.55, 0.45, 3.4);
  b.box(dark, 2.3, 1.1, 0.3, 0, 0, 8.4);
  if (lod) { pair(b, skin, tailGeo, 1.45, -0.05, 6.9); }
  const model = { dims: { length: 19, span: 13.6, height: 5 }, gearHeight: 2.06, gear: [], engines: [], burners: [], pylons: [], spinners: [], turrets: [], surfaces: {}, rudders: [], view: { chase: 30, chaseH: 6 } };
  if (b.detail) {
    // chined nose / leading-edge extensions blending into the wing root
    pair(b, skin, () => wing(1.0, A ? 5.9 : 4.6, 0.3, A ? 5.5 : 4.2, 0.12, 0.04), 0.75, 0.1, A ? -8.7 : -7.2);
    b.tube(MAT.gunmetal, [0, 0, -9.4], [0, 0, -10.3], 0.03, 5, 0.012);
    // canopy, frame, pilot
    b.sphere(MAT.canopy, 1, 0, 0.6, -4.7, [0.52, A ? 0.62 : 0.68, A ? 2.0 : 1.7], 12);
    b.box(dark, 1.0, 0.1, 0.12, 0, 0.98, -4.1, [0, 0, 0]);
    b.sphere(MAT.white, 0.16, 0, 0.84, -4.95); b.box(MAT.black, 0.5, 0.7, 0.25, 0, 0.6, -4.45);
    for (const s of [-1, 1]) {
      // intake trunks + mouths
      const iw = A ? 1.0 : 1.25, ih = A ? 1.05 : 1.3;
      b.box(skin, iw, ih, 5.4, s * 1.72, -0.14, -1.5);
      b.box(MAT.black, iw - 0.14, ih - 0.14, 0.08, s * 1.72, -0.14, -4.22);
      if (!A) b.box(dark, 0.06, ih + 0.2, 1.3, s * 1.14, -0.14, -4.5); // splitter plate
      // engine nozzles
      if (A) { b.box(MAT.exhaust, 1.15, 0.7, 1.6, s * 0.75, 0, 9.0); b.box(MAT.black, 0.95, 0.5, 0.06, s * 0.75, 0, 9.81); b.box(MAT.exhaust, 1.25, 0.05, 1.0, s * 0.75, 0.37, 9.6, [0.12, 0, 0]); }
      else { b.cyl(MAT.exhaust, 0.5, 0.64, 1.7, s * 0.8, 0, 9.0, 'z', 12); b.cyl(MAT.black, 0.42, 0.42, 0.06, s * 0.8, 0, 9.84, 'z', 12); b.cyl(dark, 0.68, 0.68, 0.25, s * 0.8, 0, 8.2, 'z', 12); }
      const ex = new THREE.Vector3(s * (A ? 0.75 : 0.8), 0, 9.85); model.engines.push(ex);
      const bc = burnerCone(ex, A ? 0.42 : 0.46, 5.5); g.add(bc); model.burners.push(bc);
      // ventral strakes (Extro) / wing fences
      if (!A) { b.add(skin, fin(0.9, 2.6, 1.0, 1.3, 0.1, s * (Math.PI - 0.45)), s * 1.2, -0.75, 5.2); b.box(dark, 0.05, 0.22, 1.6, s * 4.2, 0.2, 1.0); }
      // bay door seams, formation strips, wingtip lights
      b.box(MAT.black, 0.025, 0.02, 3.4, s * 0.55, -(A ? 0.925 : 1.09), 0.4);
      b.box(MAT.yellow, 0.03, 0.5, 0.08, s * (1.55 + Math.sin(cant) * 1.5) + s * 0.09, 0.45 + Math.cos(cant) * 1.5, 5.6);
      b.box(s < 0 ? MAT.red : MAT.white, 0.1, 0.05, 0.3, s * 6.78, 0.03, wz + (A ? 6.1 : 5.3));
      // weapon stations
      model.pylons.push(new THREE.Vector3(s * 0.9, -1.0, 0.2), new THREE.Vector3(s * 2.7, -0.35, 1.2));
      // insignia
      g.add(decal(nation, 1.5, s * 4.2, 0.15, wz + 4.6, 'up'));
      g.add(decal(nation, 0.8, s * (1.72 + (A ? 0.5 : 0.625) + 0.03), -0.14, -2.3, s > 0 ? 'right' : 'left'));
      // all-moving tailplanes
      const elev = new THREE.Group(), eb = new PartBuilder(0); elev.position.set(s * 1.45, -0.05, 6.9);
      eb.add(skin, s > 0 ? tailGeo() : mirrorX(tailGeo())); eb.build(elev);
      g.add(elev); model.surfaces[s > 0 ? 'elevR' : 'elevL'] = elev;
      // rudders: hinge group tilted with the fin, inner group swings about the hinge
      const hinge = new THREE.Group(), rud = new THREE.Group(), rb = new PartBuilder(0);
      hinge.position.set(s * (1.55 + Math.sin(cant) * 0.25), 0.45 + Math.cos(cant) * 0.25, 3.4 + 2.82); hinge.rotation.z = -s * cant;
      rb.add(skin, fin(2.3, 1.0, 1.0, 0, 0.2, 0, 0.12)); rb.build(rud); hinge.add(rud); g.add(hinge); model.rudders.push(rud);
    }
    b.box(MAT.black, 0.12, 0.06, 0.6, 1.72, 0.42, -2.6); // cannon port
    b.box(dark, 0.04, 0.3, 0.5, 0, A ? 1.0 : 1.14, 1.5); // antenna blade
    // landing gear
    model.gear.push(gearLeg(0, -0.6, -5.6, 1.16, 0.3), gearLeg(-1.7, -0.55, 1.2, 1.09, 0.42), gearLeg(1.7, -0.55, 1.2, 1.09, 0.42));
    for (const leg of model.gear) g.add(leg);
    model.cockpit = new THREE.Vector3(0, 0.95, -4.95);
  }
  b.build(g);
  g.userData.model = model;
  return g;
}
