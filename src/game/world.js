// Builds Harvard Square from OpenStreetMap data (see tools/build_map.py) and answers
// spatial questions about it: collisions, water, which street/area a point is in.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Grid, closestOnSeg, pointInPoly, polyArea, polyCentroid, pick, rand } from './util.js';

export const BOUNDS = 680;
// Harvard Yard, traced from its gates (Johnston, McKean, Dexter, Bradstreet...)
export const HARVARD_YARD = [[30, -150], [106, 20], [188, 49], [255, 66], [322, 50], [350, -97], [315, -196], [214, -248], [122, -272]];

const PALETTE = {
  uni: [0xa0523d, 0x9a4b36, 0xb0603f, 0x8f4632, 0xa65a41],
  church: [0xf0ece2, 0xd8d0c0],
  house: [0xe8dcc0, 0xc9d3dc, 0xd8c9a7, 0xb8c4b0, 0xf0e6d0, 0x9fb3c8, 0xe6d3a3, 0xc8a98b],
  other: [0xb5603f, 0xd8c9a7, 0x8c8f96, 0xe8dcc0, 0x9c4a35, 0xa65a41, 0xc2b8a3, 0x8f4632],
};
const NAMED_COLORS = {
  'Smith Campus Center': 0xbdb8ad,
  'Harvard Lampoon Building': 0xc08a4f,
  'Memorial Church': 0xa0523d,
  'Cambridge KiOSK': 0xa86a4c,
  'The First Parish in Cambridge': 0xe9e2d0,
  'Christ Church': 0xc9c0ae,
};
const FOLIAGE = [0x4f9d3a, 0x5aa845, 0xd9822b, 0xc2452d, 0xe0b23a, 0x8fb03a, 0xb8541f, 0x6aa84f];

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#e6e0d6'; g.fillRect(16, 12, 32, 36);
  g.fillStyle = '#34465e'; g.fillRect(19, 15, 26, 30);
  g.fillStyle = '#5b7391'; g.fillRect(19, 15, 12, 30);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 3.2, 1 / 3.6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}

// Flat triangle ribbons along polylines (roads, paths, lane markings), merged into one geometry.
function ribbons(lines, y) {
  const pos = [];
  const tri = (a, b, c) => pos.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1]);
  for (const { p, w } of lines) {
    const h = w / 2;
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * h, nz = (dx / len) * h;
      const A = [ax + nx, az + nz], B = [bx + nx, bz + nz], C = [bx - nx, bz - nz], D = [ax - nx, az - nz];
      tri(A, B, C); tri(A, C, D);
    }
    // round joints so corners don't show gaps
    if (w > 2) for (const [cx, cz] of p) {
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
        tri([cx, cz], [cx + Math.cos(a1) * h, cz + Math.sin(a1) * h], [cx + Math.cos(a0) * h, cz + Math.sin(a0) * h]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

function flatPolys(polys, y) {
  const geos = [];
  for (const poly of polys) {
    if (poly.length < 3) continue;
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    g.deleteAttribute('uv');
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function flatMesh(geo, color) {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.receiveShadow = true;
  return m;
}

export function buildWorld(scene, data) {
  const collide = new Grid(16);   // building edges and tree trunks
  const roadGrid = new Grid(24);  // road segments (for bridges and street names)
  const buildings = [];

  // ---------- ground layers ----------
  const groundMesh = flatMesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), 0xc9bfae);
  scene.add(groundMesh);
  scene.add(flatMesh(flatPolys(data.green.map(g => g.p), 0.03), 0x7fb85a));
  scene.add(flatMesh(flatPolys(data.water.map(g => g.p), 0.05), 0x3f86c9));
  scene.add(flatMesh(ribbons(data.paths, 0.08), 0xc0907a));
  scene.add(flatMesh(ribbons(data.roads, 0.12), 0x4a4c52));

  const dashes = [];
  for (const r of data.roads) {
    if (!r.d || r.w < 11 || r.o) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 1; s + 3 < len; s += 6) {
        const t0 = s / len, t1 = (s + 3) / len;
        dashes.push({ p: [[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]], w: 0.25 });
      }
    }
  }
  scene.add(flatMesh(ribbons(dashes, 0.15), 0xf2c500));

  for (const r of data.roads) {
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
      const seg = { ax, az, bx, bz, w: r.w, name: r.n, drivable: !!r.d };
      roadGrid.add(seg, Math.min(ax, bx) - r.w, Math.min(az, bz) - r.w, Math.max(ax, bx) + r.w, Math.max(az, bz) + r.w);
    }
  }

  // ---------- buildings ----------
  const geos = [];
  const tmp = new THREE.Color();
  for (const b of data.buildings) {
    const poly = b.p;
    if (poly.length < 3) continue;
    const h = Math.min(Math.max(b.h, 4), 60);
    b.h = h;
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    let g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g = g.index ? g.toNonIndexed() : g;

    let color = NAMED_COLORS[b.n];
    if (color === undefined && b.c) { try { color = new THREE.Color(b.c).getHex(); } catch { /* bad tag */ } }
    if (color === undefined) {
      const [cx, cz] = polyCentroid(poly);
      const kind = b.k === 'church' || b.k === 'house' ? b.k : (b.k === 'uni' || pointInPoly(cx, cz, HARVARD_YARD) ? 'uni' : 'other');
      color = pick(PALETTE[kind]);
    }
    const wall = new THREE.Color(color), roof = new THREE.Color(color).multiplyScalar(0.62);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const uv = g.attributes.uv;
    const normal = g.attributes.normal;
    for (let i = 0; i < count; i++) {
      const isCap = Math.abs(normal.getY(i)) > 0.5;
      tmp.copy(isCap ? roof : wall);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      if (isCap) uv.setXY(i, 0.1, 0.1); // plain (window-less) part of the texture
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);

    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const bld = { poly, h, name: b.n, kind: b.k, minX, minZ, maxX, maxZ };
    buildings.push(bld);
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j], [bx, bz] = poly[i];
      collide.add({ seg: true, ax, az, bx, bz, h }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }
    collide.add({ bld }, minX, minZ, maxX, maxZ);
  }
  const bMesh = new THREE.Mesh(mergeGeometries(geos),
    new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture() }));
  bMesh.castShadow = bMesh.receiveShadow = true;
  scene.add(bMesh);

  const insideBuilding = (x, z) => {
    for (const it of collide.query(x, z)) {
      const b = it.bld;
      if (b && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInPoly(x, z, b.poly)) return b;
    }
    return null;
  };

  const water = data.water.map(w => {
    const xs = w.p.map(p => p[0]), zs = w.p.map(p => p[1]);
    return { poly: w.p, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  });
  const isWater = (x, z) => water.some(w => x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ && pointInPoly(x, z, w.poly));

  function roadAt(x, z, pad = 0) {
    let best = null, bestD = Infinity;
    for (const s of roadGrid.query(x, z, 2)) {
      const [cx, cz] = closestOnSeg(x, z, s.ax, s.az, s.bx, s.bz);
      const d = Math.hypot(x - cx, z - cz);
      if (d < s.w / 2 + pad && d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  // ---------- trees (instanced) ----------
  const trees = [];
  const addTree = (x, z) => {
    if (Math.abs(x) > BOUNDS || Math.abs(z) > BOUNDS) return;
    if (insideBuilding(x, z) || isWater(x, z) || roadAt(x, z, 1.2)) return;
    trees.push({ x, z, s: rand(0.8, 1.25) });
  };
  for (const g of data.green) {
    const area = polyArea(g.p);
    if (area < 80) continue;
    const n = Math.min(Math.floor(area / 260), 70);
    const xs = g.p.map(p => p[0]), zs = g.p.map(p => p[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    for (let k = 0, tries = 0; k < n && tries < n * 4; tries++) {
      const x = rand(x0, x1), z = rand(z0, z1);
      if (pointInPoly(x, z, g.p)) { addTree(x, z); k++; }
    }
  }
  // street trees along the bigger roads
  for (const r of data.roads) {
    if (r.w < 8) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = 6; s < len; s += 16) {
        for (const side of [-1, 1]) {
          if (Math.random() < 0.45) continue;
          const off = r.w / 2 + 2.2;
          addTree(ax + (bx - ax) * s / len + nx * off * side, az + (bz - az) * s / len + nz * off * side);
        }
      }
    }
  }
  const N = trees.length;
  const trunk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshLambertMaterial({ color: 0x6e4a2b }), N);
  const crownA = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  const crownB = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  trees.forEach((t, i) => {
    const s = t.s;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    trunk.setMatrixAt(i, m4.compose(v.set(t.x, 1.5 * s, t.z), q, sc.set(s, 3 * s, s)));
    crownA.setMatrixAt(i, m4.compose(v.set(t.x, 4.2 * s, t.z), q, sc.set(4.2 * s, 3 * s, 4.2 * s)));
    crownB.setMatrixAt(i, m4.compose(v.set(t.x, 6.3 * s, t.z), q, sc.set(2.8 * s, 1.8 * s, 2.8 * s)));
    const c = new THREE.Color(pick(FOLIAGE));
    crownA.setColorAt(i, c);
    crownB.setColorAt(i, c.multiplyScalar(1.08));
    collide.add({ circle: true, x: t.x, z: t.z, r: 0.35 * s, h: 2.5 * s }, t.x - 1, t.z - 1, t.x + 1, t.z + 1);
  });
  for (const m of [trunk, crownA, crownB]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // ---------- queries ----------
  function addCircle(x, z, r, h = 60) { collide.add({ circle: true, x, z, r, h }, x - r, z - r, x + r, z + r); }
  function addBox(cx, cz, w, d, angle = 0, h = 60) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
      .map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c]);
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [ax, az] = pts[j], [bx, bz] = pts[i];
      collide.add({ seg: true, ax, az, bx, bz, h }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }
  }

  // Push a circle (pos.x, pos.z, radius r) at height y out of anything solid that is taller
  // than y (so a flying turkey passes over low things). Returns true if it touched something.
  function resolve(pos, r, y = 0) {
    let touched = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const it of collide.query(pos.x, pos.z, r + 1)) {
        if (it.h !== undefined && y >= it.h - 0.05) continue;
        let cx, cz, rr = r;
        if (it.seg) [cx, cz] = closestOnSeg(pos.x, pos.z, it.ax, it.az, it.bx, it.bz);
        else if (it.circle) { cx = it.x; cz = it.z; rr = r + it.r; }
        else continue;
        const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-6) { pos.x = cx + (dx / d) * rr; pos.z = cz + (dz / d) * rr; touched = true; }
      }
    }
    return touched;
  }

  // Height of the roof under (x, z) that something at height y could stand on, or 0 for the street.
  function groundAt(x, z, y) {
    let g = 0;
    for (const it of collide.query(x, z)) {
      const b = it.bld;
      if (b && b.h <= y + 0.6 && b.h > g && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && pointInPoly(x, z, b.poly)) g = b.h;
    }
    return g;
  }

  function findBuilding(name) { return buildings.find(b => b.name === name); }

  return { buildings, trees, isWater, roadAt, insideBuilding, resolve, groundAt, addCircle, addBox, findBuilding, polyCentroid };
}

// Pre-rendered map image used by the minimap (north up, 1 px = 1/scale m).
export function renderMinimap(data, scale = 0.6) {
  const size = Math.round(BOUNDS * 2 * scale);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const X = x => (x + BOUNDS) * scale, Z = z => (z + BOUNDS) * scale;
  const poly = (p, fill) => { g.beginPath(); p.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.fillStyle = fill; g.fill(); };
  g.fillStyle = '#d8d0bf'; g.fillRect(0, 0, size, size);
  data.green.forEach(a => poly(a.p, '#8cc46a'));
  data.water.forEach(a => poly(a.p, '#4d95d6'));
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of data.roads) {
    g.strokeStyle = r.d ? '#55575e' : '#8a8c92';
    g.lineWidth = Math.max(1, r.w * scale);
    g.beginPath(); r.p.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke();
  }
  data.buildings.forEach(b => poly(b.p, b.k === 'uni' ? '#b3664c' : '#a59c93'));
  return { canvas: c, scale, size };
}
