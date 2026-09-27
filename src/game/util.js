import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export const unitBox = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
export function mat(color) {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); mats.set(color, m); }
  return m;
}

// Adds a box to `parent`. y is the bottom of the box, not its centre.
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(unitBox, mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  parent.add(m);
  return m;
}

export function textTexture(text, { bg = '#1f6b3a', fg = '#ffffff', border = '#ffffff', w = 256, h = 64 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(3, h / 14); g.strokeRect(h / 10, h / 10, w - h / 5, h - h / 5); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = Math.floor(h * 0.42);
  const font = s => `${s}px "Press Start 2P", monospace`;
  g.font = font(size);
  while (g.measureText(text).width > w - h * 0.5 && size > 8) g.font = font(--size);
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A text sign (plane) of w x h metres, facing +z by default.
export function sign(text, w, h, style = {}) {
  const px = 64;
  const tex = textTexture(text, { ...style, w: Math.min(1024, Math.round(px * w / h)), h: px });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: !style.bg, side: THREE.DoubleSide }));
  return m;
}

// ---------- 2D geometry helpers (x, z in metres) ----------
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  return [ax + dx * t, az + dz * t, t];
}

export function polyCentroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a / 2);
}

export function distToPoly(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [cx, cz] = closestOnSeg(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    best = Math.min(best, Math.hypot(x - cx, z - cz));
  }
  return pointInPoly(x, z, poly) ? 0 : best;
}

// Uniform spatial hash of arbitrary items by bounding box.
export class Grid {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 100003 + j; }
  add(item, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++) {
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const k = this.key(i, j);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(item);
      }
    }
  }
  query(x, z, r = 0) {
    const c = this.cell, out = new Set();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const arr = this.map.get(this.key(i, j));
        if (arr) for (const it of arr) out.add(it);
      }
    }
    return out;
  }
}
