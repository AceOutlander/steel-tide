// Small shared maths helpers. Convention everywhere: +Y up, unit forward = -Z, starboard = +X.
// A yaw angle psi (rotation.y) gives forward = (-sin psi, 0, -cos psi).
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
export const angDiff = (from, to) => wrapPi(to - from);
export const approachAngle = (cur, target, maxStep) => { const d = angDiff(cur, target); return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep; };
export const approach = (cur, target, maxStep) => (Math.abs(target - cur) <= maxStep ? target : cur + Math.sign(target - cur) * maxStep);
export const yawToDir = (psi, out = new V3()) => out.set(-Math.sin(psi), 0, -Math.cos(psi));
export const dirToYaw = (x, z) => Math.atan2(-x, -z);
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const KTS = 0.5144; // m/s per knot
export const smooth = (t) => t * t * (3 - 2 * t);
export const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// scratch objects (never hold across calls)
export const T = {
  v1: new V3(), v2: new V3(), v3: new V3(), v4: new V3(), v5: new V3(), v6: new V3(),
  q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), m1: new THREE.Matrix4(), m2: new THREE.Matrix4(), e1: new THREE.Euler(),
};
export const UP = new V3(0, 1, 0);
export const FWD = new V3(0, 0, -1);
export const RIGHT = new V3(1, 0, 0);

export const el = (id) => document.getElementById(id);
export function fmt(n, d = 0) { return Number(n).toFixed(d); }

// is point p inside any of the boxes { x0, x1, y0, y1, z0, z1 } (grown by pad)?
export function inZones(zones, p, pad = 0) { for (let i = 0; i < zones.length; i++) { const b = zones[i]; if (p.x > b.x0 - pad && p.x < b.x1 + pad && p.y > b.y0 - pad && p.y < b.y1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad) return true; } return false; }
