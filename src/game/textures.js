// Procedural PBR textures drawn on canvases, so the game ships without any image assets.
import * as THREE from 'three';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Seeded random so textures look the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function tex(c, { srgb = true, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// Tangent-space normal map from a greyscale height canvas (Sobel filter).
function normalFromHeight(hc, strength = 2) {
  const n = hc.width;
  const src = hc.getContext('2d').getImageData(0, 0, n, n).data;
  const [c, g] = canvas(n);
  const out = g.createImageData(n, n);
  const h = (x, y) => src[(((y + n) % n) * n + ((x + n) % n)) * 4] / 255;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      out.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}

function speckle(g, size, n, colors, r, maxSize = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = 1 + r() * maxSize;
    g.fillRect(r() * size, r() * size, s, s);
  }
}

// Building facade: 8 windows across x 8 floors per tile (3.2 m x 3.6 m bays).
// Walls are light grey so each building's vertex colour tints them (brick, stone, clapboard...).
export const FACADE = { bayW: 3.2, bayH: 3.6, cols: 8, rows: 8 };
export function facadeTextures() {
  const S = 512, cell = S / 8, r = rng(7);
  const [albedo, a] = canvas(S);
  const [height, h] = canvas(S);
  const [rough, ro] = canvas(S);
  const [emis, e] = canvas(S);

  // brick courses
  a.fillStyle = '#e9e6e1'; a.fillRect(0, 0, S, S);
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  ro.fillStyle = '#e6e6e6'; ro.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) {
    const off = (y / 4) % 2 ? 0 : 5;
    for (let x = -off; x < S; x += 10) {
      const v = 214 + Math.floor(r() * 36);
      a.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      a.fillRect(x, y, 9, 3);
      h.fillStyle = '#9a9a9a'; h.fillRect(x, y, 9, 3);
    }
  }
  // windows, sills and lintels
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x0 = col * cell, y0 = row * cell;
      if (row === 0 && col === 0) continue; // keep the top-left bay plain: roofs sample it
      const wx = x0 + cell * 0.28, wy = y0 + cell * 0.2, ww = cell * 0.44, wh = cell * 0.56;
      a.fillStyle = '#f4f1ea'; a.fillRect(wx - 3, wy - 5, ww + 6, wh + 10);      // frame + lintel
      a.fillStyle = '#d9d4ca'; a.fillRect(wx - 5, wy + wh + 2, ww + 10, 4);      // sill
      const glass = 30 + Math.floor(r() * 25);
      const grad = a.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grad.addColorStop(0, `rgb(${glass + 40},${glass + 55},${glass + 75})`);
      grad.addColorStop(1, `rgb(${glass},${glass + 10},${glass + 25})`);
      a.fillStyle = grad; a.fillRect(wx, wy, ww, wh);
      a.fillStyle = '#f4f1ea'; a.fillRect(wx + ww / 2 - 1, wy, 2, wh); a.fillRect(wx, wy + wh / 2 - 1, ww, 2); // muntins
      h.fillStyle = '#c8c8c8'; h.fillRect(wx - 3, wy - 5, ww + 6, wh + 10);
      h.fillStyle = '#303030'; h.fillRect(wx, wy, ww, wh);
      h.fillStyle = '#d8d8d8'; h.fillRect(wx - 5, wy + wh + 2, ww + 10, 4);
      ro.fillStyle = '#262626'; ro.fillRect(wx, wy, ww, wh);                     // glass is glossy
      if (r() < 0.38) {
        const warm = r() < 0.8;
        e.fillStyle = warm ? `rgb(255,${200 + Math.floor(r() * 40)},${120 + Math.floor(r() * 60)})` : '#bcd8ff';
        e.fillRect(wx, wy, ww, wh);
        e.fillStyle = '#000'; e.fillRect(wx + ww / 2 - 1, wy, 2, wh); e.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      }
    }
  }
  const rep = t => { t.repeat.set(1 / (FACADE.bayW * FACADE.cols), 1 / (FACADE.bayH * FACADE.rows)); return t; };
  return {
    map: rep(tex(albedo)),
    normalMap: rep(tex(normalFromHeight(height, 3), { srgb: false })),
    roughnessMap: rep(tex(rough, { srgb: false })),
    emissiveMap: rep(tex(emis)),
  };
}

// Harvard Square's red brick sidewalks, herringbone pattern. One tile = 3 m.
export function paverTextures() {
  const S = 512, r = rng(11), b = 16; // brick = 2b x b px
  const [albedo, a] = canvas(S);
  const [height, h] = canvas(S);
  a.fillStyle = '#6b4638'; a.fillRect(0, 0, S, S);
  h.fillStyle = '#202020'; h.fillRect(0, 0, S, S);
  for (let y = -2 * b; y < S + 2 * b; y += 2 * b) {
    for (let x = -4 * b; x < S + 4 * b; x += 2 * b) {
      const k = (x / (2 * b) + y / (2 * b)) % 2 === 0;
      const bx = x + ((y / (2 * b)) % 2) * b, by = y;
      const rects = k ? [[bx, by, 2 * b, b]] : [[bx, by, b, 2 * b]];
      for (const [rx, ry, rw, rh] of rects) {
        const v = r();
        a.fillStyle = `rgb(${150 + v * 45},${72 + v * 25},${55 + v * 18})`;
        a.fillRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);
        h.fillStyle = `rgb(${170 + v * 60},${170 + v * 60},${170 + v * 60})`;
        h.fillRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);
      }
    }
  }
  speckle(a, S, 5000, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.08)'], r);
  return { map: tex(albedo, { repeat: 1 / 3 }), normalMap: tex(normalFromHeight(height, 1.5), { srgb: false, repeat: 1 / 3 }) };
}

// Asphalt with aggregate speckle and a few cracks and patches. One tile = 8 m.
export function asphaltTextures() {
  const S = 512, r = rng(23);
  const [albedo, a] = canvas(S);
  const [height, h] = canvas(S);
  a.fillStyle = '#56565a'; a.fillRect(0, 0, S, S);
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  for (let i = 0; i < 6; i++) {
    a.fillStyle = `rgba(${r() < 0.5 ? '30,30,32' : '100,98,96'},0.08)`;
    a.beginPath(); a.ellipse(r() * S, r() * S, 30 + r() * 80, 20 + r() * 50, r() * 3, 0, 7); a.fill();
  }
  speckle(a, S, 26000, ['#3d3d40', '#606064', '#77777a', '#4a4a4d'], r, 1.5);
  speckle(h, S, 20000, ['#a0a0a0', '#606060'], r, 1.5);
  a.strokeStyle = 'rgba(15,15,18,.7)'; a.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    let x = r() * S, y = r() * S;
    a.beginPath(); a.moveTo(x, y);
    for (let k = 0; k < 12; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; a.lineTo(x, y); }
    a.stroke();
  }
  return { map: tex(albedo, { repeat: 1 / 8 }), normalMap: tex(normalFromHeight(height, 1.2), { srgb: false, repeat: 1 / 8 }) };
}

// Lawn with blade speckle and mowing stripes. One tile = 10 m.
export function grassTextures() {
  const S = 512, r = rng(31);
  const [albedo, a] = canvas(S);
  a.fillStyle = '#5f9a3c'; a.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 64) { a.fillStyle = (x / 64) % 2 ? 'rgba(255,255,200,.05)' : 'rgba(0,40,0,.05)'; a.fillRect(x, 0, 64, S); }
  speckle(a, S, 30000, ['#4f8a30', '#6fae46', '#7cbd52', '#3f7a2a', '#8cc45a'], r, 2);
  speckle(a, S, 400, ['#d9822b', '#c2452d', '#e0b23a'], r, 3); // fallen leaves
  return { map: tex(albedo, { repeat: 1 / 10 }) };
}

// Plain concrete / packed dirt for everything else. One tile = 10 m.
export function concreteTextures() {
  const S = 256, r = rng(41);
  const [albedo, a] = canvas(S);
  a.fillStyle = '#bdb4a3'; a.fillRect(0, 0, S, S);
  speckle(a, S, 9000, ['#b0a795', '#c9c0af', '#a89f8e', '#d0c8b8'], r, 2);
  a.strokeStyle = 'rgba(90,80,70,.25)';
  for (let k = 0; k <= S; k += 64) { a.beginPath(); a.moveTo(k, 0); a.lineTo(k, S); a.moveTo(0, k); a.lineTo(S, k); a.stroke(); }
  return { map: tex(albedo, { repeat: 1 / 10 }) };
}

// Soft ripple normal map for the Charles. One tile = 12 m; scroll its offset to animate.
export function waterNormal() {
  const S = 256;
  const [height, h] = canvas(S);
  const img = h.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
      const val = Math.sin(u * 3 + Math.sin(v * 2)) * 0.35 + Math.sin(v * 5 + u) * 0.25 + Math.sin((u + v) * 7) * 0.15 + Math.sin(u * 11 - v * 4) * 0.08;
      const c = (val * 0.5 + 0.5) * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
    }
  }
  h.putImageData(img, 0, 0);
  return tex(normalFromHeight(height, 2.5), { srgb: false, repeat: 1 / 12 });
}

// Radial glow used for streetlight pools and headlights.
export function glowTexture(inner = 'rgba(255,220,150,1)') {
  const [c, g] = canvas(128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
