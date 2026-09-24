import * as THREE from 'three';

// ---------- tuning ----------
const COLS = 4;          // playable columns run from -COLS to COLS
const WRAP = 18;         // vehicles wrap around within [-WRAP, WRAP)
const PERIOD = WRAP * 2;
const AHEAD = 32;        // rows generated in front of the camera
const BEHIND = 12;       // rows kept behind the camera
const HOP_TIME = 0.14;
const HAWK_LAG = 3.6;    // rows behind the camera before the hawk strikes
const TURKEY_SCALE = 1.25;

const STREETS = ['MASS AVE', 'JFK ST', 'BRATTLE ST', 'MT AUBURN ST', 'DUNSTER ST', 'BOW ST', 'ARROW ST',
  'PLYMPTON ST', 'HOLYOKE ST', 'CHURCH ST', 'ELIOT ST', 'GARDEN ST', 'KIRKLAND ST', 'QUINCY ST', 'LINDEN ST'];
const SHOPS = ['THE COOP', 'BOOKS', 'PIZZA', 'COFFEE', 'BURRITOS', 'RECORDS', 'DINER', 'NEWS', 'BAGELS',
  'ICE CREAM', 'GRILL', 'DUMPLINGS', 'BURGERS', 'COMICS', 'TEA', 'FALAFEL'];
const CAR_NAMES = ['a ZIPCAR', 'a SUBARU', 'a VOLVO', 'a MINIVAN', 'a PRIUS', 'a JEEP'];
const CAR_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x34495e, 0x1abc9c, 0x7f8c8d];
const FOLIAGE = [0x4f9d3a, 0x5aa845, 0xd9822b, 0xc2452d, 0xe0b23a, 0x8fb03a, 0xb8541f];
const FACADES = [0x9c4a35, 0xb5603f, 0x7d3b2b, 0xd8c9a7, 0x8c8f96, 0xe8dcc0, 0x6f8a6b, 0x4f6d8f];
const AWNINGS = [0xa51c30, 0x2e7d4f, 0x1f4e8c, 0xd35400, 0x333333];
const SKIN = [0xf0c8a0, 0xc68b59, 0x8d5524, 0xe0ac69];

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad0ec);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
let viewH = 11;
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  const viewW = Math.max(11 * aspect, 10.5);
  viewH = viewW / aspect;
  camera.left = -viewW / 2; camera.right = viewW / 2;
  camera.top = viewH / 2; camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

// Darken the ground outside the playable columns (Crossy Road style boundary)
const edgeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
const edges = [-1, 1].map(side => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 90), edgeMat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(side * (COLS + 0.5 + 15), 0.012, 0);
  scene.add(m);
  return m;
});

// ---------- geometry helpers ----------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitPlane = new THREE.PlaneGeometry(1, 1);
const mats = new Map();
function mat(color) {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); mats.set(color, m); }
  return m;
}
// y is the bottom of the box, not its center
function box(parent, w, h, d, color, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(unitBox, mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = cast;
  parent.add(m);
  return m;
}
function ground(parent, w, color, x = 0) {
  const m = box(parent, w, 0.3, 1, color, x, -0.3, 0, false);
  m.receiveShadow = true;
  return m;
}

function textTexture(text, { bg = '#1f6b3a', fg = '#ffffff', border = '#ffffff', w = 256, h = 64 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = Math.floor(h * 0.42);
  const font = s => `${s}px "Press Start 2P", monospace`;
  g.font = font(size);
  while (g.measureText(text).width > w - 28 && size > 8) g.font = font(--size);
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Center-positioned, +z facing text sign. Pass `disposables` to free the texture later.
function textPlane(parent, text, w, h, style, x, y, z, disposables) {
  const tex = style.texture || textTexture(text, { ...style, w: Math.min(512, Math.round(64 * w / h / 32) * 32 || 64), h: 64 });
  const m = new THREE.MeshBasicMaterial({ map: tex });
  const mesh = new THREE.Mesh(unitPlane, m);
  mesh.scale.set(w, h, 1);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  if (disposables) { if (!style.texture) disposables.push(tex); disposables.push(m); }
  return mesh;
}

// ---------- models ----------
function makeTurkey() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bronze = 0x5a3a22, dark = 0x3a2616, tan = 0xd2a060, head = 0xa9b8d0, red = 0xd02a2a, beak = 0xe8b44a, leg = 0xd98c5f;
  box(body, 0.07, 0.17, 0.07, leg, -0.13, 0, 0.02);
  box(body, 0.07, 0.17, 0.07, leg, 0.13, 0, 0.02);
  box(body, 0.14, 0.03, 0.2, leg, -0.13, 0, -0.04);
  box(body, 0.14, 0.03, 0.2, leg, 0.13, 0, -0.04);
  box(body, 0.56, 0.44, 0.62, bronze, 0, 0.16, 0.02);
  box(body, 0.5, 0.12, 0.48, dark, 0, 0.58, 0.08);
  box(body, 0.08, 0.3, 0.42, dark, -0.31, 0.24, 0.06);
  box(body, 0.08, 0.3, 0.42, dark, 0.31, 0.24, 0.06);
  // tail fan
  const fan = new THREE.Group();
  fan.position.set(0, 0.34, 0.34);
  fan.rotation.x = 0.7;
  body.add(fan);
  for (let k = -3; k <= 3; k++) {
    const p = new THREE.Group();
    p.rotation.z = k * 0.3;
    fan.add(p);
    box(p, 0.19, 0.6, 0.05, k % 2 ? bronze : dark, 0, 0, 0);
    box(p, 0.19, 0.12, 0.06, tan, 0, 0.54, 0);
  }
  // neck + head
  box(body, 0.16, 0.3, 0.16, head, 0, 0.46, -0.3);
  box(body, 0.22, 0.2, 0.26, head, 0, 0.72, -0.34);
  box(body, 0.08, 0.06, 0.12, beak, 0, 0.76, -0.52);
  box(body, 0.07, 0.18, 0.06, red, 0, 0.56, -0.47);   // wattle
  box(body, 0.05, 0.14, 0.05, red, 0.03, 0.68, -0.5); // snood
  box(body, 0.03, 0.05, 0.05, 0x111111, -0.115, 0.8, -0.42, false);
  box(body, 0.03, 0.05, 0.05, 0x111111, 0.115, 0.8, -0.42, false);
  body.scale.setScalar(TURKEY_SCALE);
  return { root, body };
}

function makeHawk() {
  const g = new THREE.Group();
  box(g, 0.45, 0.3, 0.9, 0x6b4a2b, 0, 0, 0);
  const wingL = box(g, 1.0, 0.07, 0.5, 0x5a3d22, -0.7, 0.18, 0);
  const wingR = box(g, 1.0, 0.07, 0.5, 0x5a3d22, 0.7, 0.18, 0);
  box(g, 0.42, 0.06, 0.4, 0xb5452d, 0, 0.14, 0.6);     // the red tail
  box(g, 0.28, 0.26, 0.3, 0xefe6d8, 0, 0.12, -0.55);
  box(g, 0.1, 0.1, 0.16, 0xf2c230, 0, 0.12, -0.76);
  return { g, wingL, wingR };
}

function makeCorn() {
  const g = new THREE.Group();
  box(g, 0.18, 0.36, 0.18, 0xf3c623, 0, 0.12, 0);
  box(g, 0.05, 0.3, 0.2, 0x5aa845, -0.11, 0.08, 0);
  box(g, 0.05, 0.3, 0.2, 0x5aa845, 0.11, 0.08, 0);
  return g;
}

function tree(g, x, z = 0) {
  const h = rand(0.25, 0.6);
  box(g, 0.22, h + 0.3, 0.22, 0x6e4a2b, x, 0, z);
  const c = pick(FOLIAGE);
  box(g, 0.86, 0.62, 0.86, c, x, h + 0.25, z);
  box(g, 0.58, 0.4, 0.58, c, x, h + 0.87, z);
}
function bush(g, x) { box(g, 0.72, 0.42, 0.72, pick([0x3f8f3a, 0x4a9a3f, 0x8c6d2f]), x, 0, 0); }
function lamp(g, x, z = 0) {
  box(g, 0.1, 1.7, 0.1, 0x1e2a24, x, 0, z);
  box(g, 0.26, 0.2, 0.26, 0x1e2a24, x, 1.7, z);
  box(g, 0.18, 0.12, 0.18, 0xfff2a8, x, 1.6, z, false);
}
function hydrant(g, x) {
  box(g, 0.26, 0.42, 0.26, 0xc0392b, x, 0, 0);
  box(g, 0.36, 0.08, 0.1, 0xc0392b, x, 0.22, 0);
  box(g, 0.18, 0.08, 0.18, 0xe0e0e0, x, 0.42, 0);
}
function newsbox(g, x) {
  box(g, 0.38, 0.6, 0.38, pick([0x2f6fb5, 0x2e7d4f, 0xc0392b]), x, 0, 0);
  box(g, 0.3, 0.16, 0.02, 0xdddddd, x, 0.34, 0.2, false);
}
function bench(g, x) {
  box(g, 0.08, 0.22, 0.3, 0x333333, x - 0.32, 0, 0);
  box(g, 0.08, 0.22, 0.3, 0x333333, x + 0.32, 0, 0);
  box(g, 0.82, 0.08, 0.36, 0x8a5a2b, x, 0.22, 0);
  box(g, 0.82, 0.3, 0.06, 0x8a5a2b, x, 0.3, 0.16);
}
function planter(g, x) {
  box(g, 0.7, 0.28, 0.7, 0x8c3b2b, x, 0, 0);
  box(g, 0.16, 0.4, 0.16, 0x6e4a2b, x, 0.28, 0);
  box(g, 0.66, 0.5, 0.66, pick(FOLIAGE), x, 0.62, 0);
}

let busTex = null, shuttleTex = null, taxiTex = null;
const LEN = { car: 1.5, taxi: 1.5, bus: 3.2, shuttle: 3.2, truck: 2.3, bike: 0.9, shell: 3.4, kayak: 2.2 };

function makeVehicle(kind, dir) {
  const g = new THREE.Group();
  const wheel = (x, z, s = 0.34) => box(g, s, s, 0.14, 0x1b1b1b, x, 0, z);
  const win = 0x2b3a4d;
  let name;
  const sideText = (tex, w, h, x, y) => {
    const p = textPlane(g, '', w, h, { texture: tex }, x, y, 0.461);
    if (dir < 0) p.scale.x = -w; // undo the mirroring of the parent group
  };
  if (kind === 'car' || kind === 'taxi') {
    const c = kind === 'taxi' ? 0xf5c518 : pick(CAR_COLORS);
    name = kind === 'taxi' ? 'a TAXI' : pick(CAR_NAMES);
    box(g, 1.5, 0.42, 0.8, c, 0, 0.14, 0);
    box(g, 0.85, 0.34, 0.72, c, -0.08, 0.56, 0);
    box(g, 0.87, 0.2, 0.74, win, -0.08, 0.63, 0);
    box(g, 0.05, 0.1, 0.16, 0xfff5b0, 0.76, 0.34, 0.25, false);
    box(g, 0.05, 0.1, 0.16, 0xfff5b0, 0.76, 0.34, -0.25, false);
    box(g, 0.05, 0.1, 0.16, 0xd62828, -0.76, 0.34, 0.25, false);
    box(g, 0.05, 0.1, 0.16, 0xd62828, -0.76, 0.34, -0.25, false);
    [-0.5, 0.5].forEach(x => { wheel(x, 0.36); wheel(x, -0.36); });
    if (kind === 'taxi') {
      box(g, 0.34, 0.16, 0.5, 0xffffff, -0.08, 0.9, 0);
      taxiTex ||= textTexture('TAXI', { bg: '#ffffff', fg: '#181818', border: null, w: 128, h: 64 });
      const p = textPlane(g, '', 0.32, 0.14, { texture: taxiTex }, -0.08, 0.98, 0.252);
      if (dir < 0) p.scale.x = -0.32;
    }
  } else if (kind === 'bus' || kind === 'shuttle') {
    const mbta = kind === 'bus';
    name = mbta ? 'an MBTA BUS' : 'a HARVARD SHUTTLE';
    box(g, 3.2, 1.0, 0.9, mbta ? 0xd9d9d9 : 0xa51c30, 0, 0.18, 0);
    box(g, 3.0, 0.32, 0.92, win, 0.04, 0.72, 0);
    box(g, 3.22, 0.1, 0.92, mbta ? 0xf2c500 : 0xffffff, 0, 0.46, 0);
    box(g, 0.04, 0.55, 0.8, win, 1.6, 0.52, 0);
    box(g, 2.9, 0.1, 0.7, 0xaaaaaa, 0, 1.18, 0);
    [-1.05, 1.05].forEach(x => { wheel(x, 0.4, 0.4); wheel(x, -0.4, 0.4); });
    if (mbta) { busTex ||= textTexture('1 HARVARD', { bg: '#181818', fg: '#ffb000', border: null, w: 256, h: 48 }); }
    else { shuttleTex ||= textTexture('HARVARD', { bg: '#a51c30', fg: '#ffffff', border: null, w: 256, h: 48 }); }
    sideText(mbta ? busTex : shuttleTex, 1.3, 0.24, -0.5, 0.3);
  } else if (kind === 'truck') {
    name = 'a BOX TRUCK';
    const c = pick([0x6b4226, 0x2c3e50, 0xc0392b, 0xecf0f1]);
    box(g, 0.7, 0.8, 0.85, c, 0.8, 0.14, 0);
    box(g, 0.05, 0.3, 0.75, win, 1.16, 0.55, 0);
    box(g, 1.55, 1.1, 0.9, 0xf2f2f2, -0.35, 0.14, 0);
    box(g, 1.57, 0.12, 0.92, c, -0.35, 0.3, 0);
    [-0.8, 0.8].forEach(x => { wheel(x, 0.4, 0.38); wheel(x, -0.4, 0.38); });
  } else if (kind === 'bike') {
    name = 'a CYCLIST';
    box(g, 0.3, 0.3, 0.05, 0x1b1b1b, -0.3, 0, 0);
    box(g, 0.3, 0.3, 0.05, 0x1b1b1b, 0.3, 0, 0);
    box(g, 0.62, 0.06, 0.05, pick([0x2980b9, 0xe67e22, 0x16a085]), 0, 0.24, 0);
    box(g, 0.1, 0.26, 0.14, 0x2c3e50, -0.04, 0.24, 0);
    box(g, 0.22, 0.34, 0.22, pick([0xe74c3c, 0xf1c40f, 0x8e44ad, 0x27ae60]), 0, 0.46, 0);
    box(g, 0.16, 0.16, 0.16, pick(SKIN), 0.03, 0.8, 0);
    box(g, 0.2, 0.08, 0.2, pick([0xecf0f1, 0x1b1b1b, 0xe67e22]), 0.03, 0.94, 0);
  } else if (kind === 'shell') {
    name = 'a ROWING SHELL';
    box(g, 3.4, 0.2, 0.5, 0xf2efe6, 0, -0.04, 0);
    box(g, 3.42, 0.05, 0.52, 0xa51c30, 0, 0.06, 0);
    [-1.1, -0.4, 0.3, 1.0].forEach(x => {
      box(g, 0.16, 0.26, 0.2, 0xa51c30, x, 0.16, 0);
      box(g, 0.13, 0.13, 0.13, pick(SKIN), x, 0.42, 0);
      box(g, 0.05, 0.03, 1.0, 0xdddddd, x + 0.12, 0.22, 0);
    });
  } else if (kind === 'kayak') {
    name = 'a KAYAK';
    const c = pick([0xf39c12, 0xe74c3c, 0x27ae60, 0xf1c40f]);
    box(g, 2.2, 0.2, 0.55, c, 0, -0.04, 0);
    box(g, 0.5, 0.05, 0.4, 0x222222, 0.3, 0.16, 0, false);
    box(g, 0.2, 0.3, 0.22, 0x2980b9, 0.3, 0.16, 0);
    box(g, 0.14, 0.14, 0.14, pick(SKIN), 0.3, 0.46, 0);
    box(g, 0.05, 0.04, 1.2, 0xeeeeee, 0.42, 0.3, 0).rotation.x = 0.4;
  }
  if (dir < 0) g.scale.x = -1;
  return { mesh: g, len: LEN[kind], kind, name, deck: 0.16 };
}

// ---------- world generation ----------
const rows = new Map();
let lastStreet = '';
let nextRow = 0, pathCol = 0, nextIsSafe = true, lastHazard = 'road';

function newRow(i, type) {
  const group = new THREE.Group();
  group.position.z = -i;
  scene.add(group);
  const row = { i, type, group, blocked: new Set(), movers: [], dir: 1, speed: 0, corn: null, disposables: [] };
  rows.set(i, row);
  return row;
}
function destroyRow(r) {
  scene.remove(r.group);
  r.disposables.forEach(d => d.dispose());
  rows.delete(r.i);
}
const difficulty = i => Math.min(1 + Math.max(0, i) / 140, 2.1);

function makeSafeStrip(start, len, kind, opts = {}) {
  for (let k = 0; k < len; k++) {
    const i = start + k;
    const row = newRow(i, kind);
    const g = row.group;
    const alt = i % 2 === 0;
    if (kind === 'grass') ground(g, 44, alt ? 0x86c35b : 0x7bb852);
    else {
      ground(g, 44, alt ? 0xb4694a : 0xa96043);
      if (i % 2 === 0) { lamp(g, -COLS - 0.6); lamp(g, COLS + 0.6); }
    }

    if (opts.wall) {
      for (let c = -COLS; c <= COLS; c++) { row.blocked.add(c); tree(g, c); }
    } else {
      let n = 0;
      const cols = [];
      for (let c = -COLS; c <= COLS; c++) cols.push(c);
      cols.sort(() => Math.random() - 0.5);
      for (const c of cols) {
        if (c === pathCol || (opts.start && Math.abs(c) <= 1 && i <= 1)) continue;
        if (n >= 3 || Math.random() > (kind === 'grass' ? 0.25 : 0.17)) continue;
        row.blocked.add(c); n++;
        if (kind === 'grass') Math.random() < 0.75 ? tree(g, c) : bush(g, c);
        else pick([lamp, hydrant, newsbox, bench, planter, planter])(g, c);
      }
      if (!opts.start && Math.random() < 0.16) {
        const free = cols.filter(c => !row.blocked.has(c));
        const c = pick(free);
        const mesh = makeCorn();
        mesh.position.x = c;
        g.add(mesh);
        row.corn = { col: c, mesh };
      }
    }
    if (kind === 'grass') {
      for (const side of [-1, 1]) {
        for (const x of [5.6, 7, 8.4, 9.8, 11.2]) {
          if (opts.start && side < 0 && x < 7.5 && i >= 0) continue;
          if (Math.random() < 0.55 || opts.wall) tree(g, side * x);
        }
      }
    }
  }
  if (kind === 'sidewalk') {
    const first = rows.get(start);
    buildings(first, len, -1);
    buildings(first, len, 1);
  }
}

function buildings(row, len, side) {
  const g = row.group;
  const w = rand(5, 7), h = rand(2.2, 4.4);
  const cx = side * (5.8 + w / 2);
  const cz = -(len - 1) / 2;
  const color = pick(FACADES);
  box(g, w, h, len, color, cx, 0, cz);
  box(g, w + 0.12, 0.2, len + 0.06, 0x3d3a36, cx, h, cz);
  const front = 0.5;
  // storefront
  box(g, w * 0.55, 0.7, 0.05, 0x2d3a4f, cx - side * 0.4, 0.2, front, false);
  box(g, 0.45, 0.95, 0.05, 0x4a2f1c, cx + side * (w * 0.32), 0, front, false);
  box(g, w * 0.86, 0.1, 0.36, pick(AWNINGS), cx, 1.08, front + 0.16);
  const signW = Math.min(w * 0.7, 3.4);
  textPlane(g, pick(SHOPS), signW, 0.5, { bg: '#f4ead2', fg: '#181818', border: '#181818' },
    cx, 1.5, front + 0.03, row.disposables);
  // upper floor windows
  for (let y = 2.0; y + 0.55 < h; y += 0.9) {
    for (let x = cx - w / 2 + 0.6; x < cx + w / 2 - 0.4; x += 0.85) {
      box(g, 0.42, 0.5, 0.05, Math.random() < 0.15 ? 0xffe28a : 0x33475f, x, y, front, false);
    }
  }
}

function streetSign(row, text, bg = '#1f6b3a') {
  const g = row.group;
  box(g, 0.08, 1.9, 0.08, 0x5a5f66, -COLS - 0.9, 0, 0.62);
  textPlane(g, text, 1.9, 0.38, { bg }, -COLS - 0.9, 1.75, 0.67, row.disposables);
}

function makeRoadGroup(start, len) {
  const d = difficulty(start);
  let name;
  do { name = pick(STREETS); } while (name === lastStreet);
  lastStreet = name;
  streetSign(rows.get(start - 1), name);
  for (let k = 0; k < len; k++) {
    const i = start + k;
    const row = newRow(i, 'road');
    const g = row.group;
    ground(g, 44, 0x44464f);
    if (k === 0) box(g, 44, 0.06, 0.12, 0x9a9a9a, 0, 0, 0.47, false);
    if (k === len - 1) box(g, 44, 0.06, 0.12, 0x9a9a9a, 0, 0, -0.47, false);
    else for (let x = -WRAP; x < WRAP; x += 2) box(g, 0.8, 0.02, 0.07, 0xf2f2f2, x, 0, -0.5, false);

    const dir = Math.random() < 0.5 ? 1 : -1;
    const bikeLane = i > 8 && Math.random() < 0.15;
    row.dir = dir;
    row.speed = (bikeLane ? rand(3.6, 4.8) : rand(1.7, 3.0)) * d;
    const minGap = bikeLane ? 2.4 : Math.max(2.8, 5 - i / 45);
    const chooser = () => {
      if (bikeLane) return 'bike';
      const r = Math.random();
      if (r < 0.12) return 'bus';
      if (r < 0.18) return 'shuttle';
      if (r < 0.3) return 'truck';
      if (r < 0.45) return 'taxi';
      return 'car';
    };
    fillLane(row, chooser, minGap, minGap * 2.3);
  }
}

function makeWaterGroup(start, len) {
  streetSign(rows.get(start - 1), 'CHARLES RIVER', '#1f4e8c');
  let dir = Math.random() < 0.5 ? 1 : -1;
  for (let k = 0; k < len; k++) {
    const i = start + k;
    const row = newRow(i, 'water');
    const g = row.group;
    ground(g, 44, 0x3b83c9);
    for (let n = 0; n < 7; n++) box(g, rand(0.4, 0.9), 0.02, 0.06, 0x6fb0ea, rand(-WRAP, WRAP), 0, rand(-0.4, 0.4), false);
    row.dir = dir;
    dir = -dir;
    row.speed = rand(1.1, 2.0) * Math.min(difficulty(i), 1.6);
    const maxGap = 2.6 + Math.min(i / 120, 1.2);
    fillLane(row, () => (Math.random() < 0.55 ? 'shell' : 'kayak'), 1.2, maxGap);
  }
}

function fillLane(row, chooser, minGap, maxGap) {
  const items = [];
  let used = 0;
  for (;;) {
    const kind = chooser();
    const gap = rand(minGap, maxGap);
    if (used + LEN[kind] + gap > PERIOD) break;
    items.push({ kind, at: used + LEN[kind] / 2 });
    used += LEN[kind] + gap;
  }
  const offset = rand(0, PERIOD);
  for (const it of items) {
    const v = makeVehicle(it.kind, row.dir);
    v.x = ((it.at + offset) % PERIOD) - WRAP;
    v.mesh.position.x = v.x;
    row.group.add(v.mesh);
    row.movers.push(v);
  }
}

function genChunk() {
  const i = nextRow;
  if (nextIsSafe) {
    const len = pick([1, 1, 1, 2, 2, 3]);
    const kind = Math.random() < 0.3 ? 'grass' : 'sidewalk';
    makeSafeStrip(i, len, kind);
    nextRow += len;
  } else {
    pathCol = clamp(pathCol + randInt(-2, 2), -COLS + 1, COLS - 1);
    if (i > 22 && lastHazard !== 'water' && Math.random() < 0.25) {
      const len = randInt(2, i > 60 ? 4 : 3);
      makeWaterGroup(i, len);
      lastHazard = 'water';
      nextRow += len;
    } else {
      const maxLanes = Math.min(5, 2 + Math.floor(i / 20));
      const len = randInt(1, maxLanes);
      makeRoadGroup(i, len);
      lastHazard = 'road';
      nextRow += len;
    }
  }
  nextIsSafe = !nextIsSafe;
}

function resetWorld() {
  for (const r of [...rows.values()]) destroyRow(r);
  pathCol = 0;
  makeSafeStrip(-9, 8, 'grass', { wall: true });
  makeSafeStrip(-1, 5, 'grass', { start: true });
  const yard = rows.get(1);
  textPlane(yard.group, 'HARVARD YARD', 2.2, 0.42, { bg: '#a51c30' }, -COLS - 1.1, 1.4, 0, yard.disposables);
  box(yard.group, 0.08, 1.25, 0.08, 0x5a5f66, -COLS - 1.1, 0, -0.05);
  nextRow = 4;
  nextIsSafe = false;
  lastHazard = 'road';
  while (nextRow < AHEAD) genChunk();
}

// ---------- audio ----------
let ac = null, muted = false;
try { muted = localStorage.getItem('tc-muted') === '1'; } catch { /* storage unavailable */ }
function audio() {
  if (muted) return null;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, dur, { type = 'square', vol = 0.05, to = null, delay = 0 } = {}) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, { vol = 0.2, freq = 800, q = 0.8 } = {}) {
  const a = audio(); if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let n = 0; n < data.length; n++) data[n] = (Math.random() * 2 - 1) * (1 - n / data.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}
function gobble() {
  const a = audio(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), g = a.createGain();
  const f = a.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(560, t);
  o.frequency.exponentialRampToValueAtTime(320, t + 0.5);
  lfo.type = 'square'; lfo.frequency.value = 24; lg.gain.value = 160;
  lfo.connect(lg).connect(o.frequency);
  f.type = 'lowpass'; f.frequency.value = 1800;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
}
const sfx = {
  hop: () => tone(260, 0.07, { to: 420, vol: 0.03 }),
  corn: () => { tone(880, 0.08, { vol: 0.04 }); tone(1320, 0.12, { vol: 0.04, delay: 0.08 }); },
  splat: () => { noise(0.35, { vol: 0.5, freq: 300 }); tone(415, 0.3, { vol: 0.05, delay: 0.02 }); tone(330, 0.3, { vol: 0.05, delay: 0.02 }); },
  splash: () => noise(0.6, { vol: 0.4, freq: 1400, q: 0.5 }),
  hawk: () => tone(2200, 0.7, { type: 'sawtooth', to: 1100, vol: 0.04 }),
  bump: () => tone(120, 0.08, { vol: 0.04 }),
};

// ---------- player / game state ----------
const turkey = makeTurkey();
scene.add(turkey.root);
const hawk = makeHawk();
hawk.g.visible = false;
scene.add(hawk.g);

const P = { x: 0, row: 0, y: 0, z: 0, hopping: false, t: 0, fx: 0, fz: 0, fy: 0, tx: 0, tz: 0, ty: 0,
  queue: null, platform: null, offset: 0, facing: 0 };
let state = 'title';
let score = 0, cornCount = 0, runCorn = 0, best = 0;
let scroll = 0, camX = 0, started = false, deathCause = null, deathT = 0, shake = 0;
try { best = +localStorage.getItem('tc-best') || 0; cornCount = +localStorage.getItem('tc-corn') || 0; } catch { /* ignore */ }

const $ = id => document.getElementById(id);
function hud() {
  $('score').textContent = score;
  $('best').textContent = `BEST ${Math.max(best, score)}`;
  $('corn').textContent = `🌽 ${cornCount}`;
}

function resetGame() {
  resetWorld();
  Object.assign(P, { x: 0, row: 0, y: 0, z: 0, hopping: false, queue: null, platform: null, facing: 0 });
  turkey.root.visible = true;
  turkey.root.position.set(0, 0, 0);
  turkey.root.rotation.set(0, 0, 0);
  turkey.body.scale.setScalar(TURKEY_SCALE);
  hawk.g.visible = false;
  particles.splice(0).forEach(p => scene.remove(p.mesh));
  score = 0; runCorn = 0; scroll = 0; camX = 0; started = false; deathCause = null; shake = 0;
  hud();
}

function startGame() {
  $('title').classList.add('hidden');
  $('over').classList.add('hidden');
  if (state === 'dead') resetGame();
  state = 'playing';
  gobble();
}

function tryMove(dx, dr) {
  if (state === 'title') { startGame(); }
  if (state !== 'playing') return;
  if (P.hopping) { P.queue = [dx, dr]; return; }
  P.facing = dr > 0 ? 0 : dr < 0 ? Math.PI : dx < 0 ? Math.PI / 2 : -Math.PI / 2;
  const target = rows.get(P.row + dr);
  if (!target) return;
  const water = target.type === 'water';
  let tx = P.x + dx;
  if (!water) tx = dr !== 0 ? clamp(Math.round(tx), -COLS, COLS) : Math.round(tx);
  if (Math.abs(tx) > COLS + (water ? 0.45 : 0)) { sfx.bump(); return; }
  if (!water && target.blocked.has(tx)) { sfx.bump(); return; }
  started = true;
  P.fx = P.x; P.fz = P.z; P.fy = P.y;
  P.tx = tx; P.tz = -(P.row + dr); P.ty = water ? 0.16 : 0;
  P.row += dr;
  P.hopping = true; P.t = 0; P.platform = null;
  sfx.hop();
  if (Math.random() < 0.06) gobble();
}

function findPlatform(row, x) {
  return row.movers.find(m => Math.abs(m.x - x) <= m.len / 2 + 0.1) || null;
}

function land() {
  const r = rows.get(P.row);
  turkey.body.scale.set(1.45, 1.0, 1.45);
  if (r.type === 'water') {
    const m = findPlatform(r, P.x);
    if (!m) return die('water');
    P.platform = m;
    P.offset = P.x - m.x;
  }
  if (r.corn && r.corn.col === Math.round(P.x)) {
    r.group.remove(r.corn.mesh);
    r.corn = null;
    cornCount++; runCorn++;
    try { localStorage.setItem('tc-corn', cornCount); } catch { /* ignore */ }
    sfx.corn();
    burst(8, [0xf3c623, 0xffe066], P.x, 0.4, P.z, 2.5, 0.08);
  }
  if (P.row > score) score = P.row;
  hud();
}

// ---------- particles ----------
const particles = [];
function burst(n, colors, x, y, z, speed = 3, size = 0.12, float = false) {
  for (let k = 0; k < n; k++) {
    const mesh = box(scene, size, size * 0.35, size * 1.6, pick(colors), x, y, z, false);
    const a = rand(0, Math.PI * 2);
    particles.push({ mesh, vx: Math.cos(a) * rand(0.4, 1) * speed, vy: rand(1.5, 4), vz: Math.sin(a) * rand(0.4, 1) * speed,
      life: rand(0.9, 1.8), spin: rand(-8, 8), float });
  }
}
function updateParticles(dt) {
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.life -= dt;
    p.vy -= (p.float ? 3 : 9) * dt;
    if (p.float) { p.vx *= 0.97; p.vz *= 0.97; p.vy = Math.max(p.vy, -0.8); }
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y = Math.max(0.02, p.mesh.position.y + p.vy * dt);
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.z += p.spin * 0.7 * dt;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(k, 1); }
  }
}

// ---------- death ----------
const MESSAGES = {
  water: ['TURKEY fell into the CHARLES RIVER!', 'Turkeys cannot swim.'],
  swept: ['TURKEY drifted downstream toward BOSTON!', 'It was never seen in Cambridge again.'],
  hawk: ['A wild RED-TAILED HAWK appeared!', 'TURKEY dawdled too long...'],
};
function die(cause, mover) {
  if (state !== 'playing') return;
  state = 'dead';
  deathCause = cause; deathT = 0;
  P.hopping = false; P.queue = null;
  let lines;
  if (cause === 'car') {
    turkey.body.scale.set(1.9, 0.15, 1.9);
    turkey.root.position.y = 0.01;
    burst(22, [0x5a3a22, 0x3a2616, 0xd2a060], P.x, 0.3, P.z, 3.5, 0.14, true);
    sfx.splat();
    shake = 0.35;
    lines = [`TURKEY was flattened by ${mover.name}!`, 'The wild TURKEY fainted!'];
  } else if (cause === 'hawk') {
    hawk.g.visible = true;
    sfx.hawk();
    lines = MESSAGES.hawk;
  } else {
    burst(16, [0x6fb0ea, 0xffffff, 0x3b83c9], P.x, 0.1, P.z, 2, 0.12);
    sfx.splash();
    lines = MESSAGES[cause];
  }
  const newBest = score > best;
  if (newBest) { best = score; try { localStorage.setItem('tc-best', best); } catch { /* ignore */ } }
  setTimeout(() => showGameOver(lines, newBest), cause === 'hawk' ? 1500 : 900);
}

let typer = null;
function showGameOver(lines, newBest) {
  $('final-score').textContent = score;
  $('final-best').textContent = best;
  $('final-corn').textContent = runCorn;
  $('new-best').textContent = newBest && score > 0 ? '★ NEW HIGH SCORE! ★' : '';
  $('over').classList.remove('hidden');
  $('retry').focus({ preventScroll: true });
  const el = $('death-msg');
  const full = lines.join('\n');
  let n = 0;
  clearInterval(typer);
  el.textContent = '';
  el.style.whiteSpace = 'pre-line';
  typer = setInterval(() => {
    el.textContent = full.slice(0, ++n);
    if (n >= full.length) clearInterval(typer);
  }, 28);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function update(dt) {
  const time = clock.elapsedTime;

  // movers
  for (const r of rows.values()) {
    if (!r.movers.length) {
      if (r.corn) { r.corn.mesh.rotation.y += dt * 2; r.corn.mesh.position.y = 0.08 + Math.sin(time * 4) * 0.06; }
      continue;
    }
    const step = r.dir * r.speed * dt;
    for (const m of r.movers) {
      m.x += step;
      if (m.x >= WRAP) m.x -= PERIOD;
      else if (m.x < -WRAP) m.x += PERIOD;
      m.mesh.position.x = m.x;
      if (r.type === 'water') m.mesh.position.y = Math.sin(time * 2 + m.x) * 0.02;
    }
  }

  // player movement
  if (state === 'playing') {
    if (P.hopping) {
      P.t += dt / HOP_TIME;
      const k = Math.min(P.t, 1);
      P.x = lerp(P.fx, P.tx, k);
      P.z = lerp(P.fz, P.tz, k);
      P.y = lerp(P.fy, P.ty, k) + Math.sin(k * Math.PI) * 0.4;
      if (k >= 1) {
        P.hopping = false;
        P.y = P.ty;
        land();
        if (P.queue && state === 'playing') { const q = P.queue; P.queue = null; tryMove(...q); }
      }
    } else if (P.platform) {
      P.x = P.platform.x + P.offset;
      if (Math.abs(P.x) > COLS + 1.3) die('swept');
    }

    // traffic collisions, checked against whichever row the turkey is physically over
    const r = rows.get(Math.round(-P.z));
    if (r && r.type === 'road') {
      for (const m of r.movers) {
        if (Math.abs(m.x - P.x) < m.len / 2 + 0.24) { die('car', m); break; }
      }
    }
  }

  // turkey visuals
  const tr = turkey.root;
  if (deathCause !== 'car') {
    tr.position.set(P.x, P.y, P.z);
    let dr = P.facing - tr.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    tr.rotation.y += dr * Math.min(1, dt * 20);
  }
  if (state !== 'dead') {
    const s = turkey.body.scale;
    s.x += (TURKEY_SCALE - s.x) * Math.min(1, dt * 12);
    s.y += (TURKEY_SCALE - s.y) * Math.min(1, dt * 12);
    s.z = s.x;
    if (state === 'title') tr.rotation.y = Math.sin(time * 0.8) * 0.5;
  }

  // death animations
  if (state === 'dead') {
    deathT += dt;
    if (deathCause === 'water' || deathCause === 'swept') {
      if (P.platform && deathCause === 'swept') P.x = P.platform.x + P.offset;
      tr.position.set(P.x, Math.max(-1, P.y - deathT * 1.6), P.z);
    } else if (deathCause === 'hawk') {
      const t = deathT;
      const hx = P.x, hz = P.z;
      if (t < 0.7) {
        const k = t / 0.7;
        hawk.g.position.set(hx, lerp(7, 1.1, k), lerp(hz - 7, hz, k));
      } else {
        const k = t - 0.7;
        hawk.g.position.set(hx + k * 2, 1.1 + k * 6, hz + k * 3);
        tr.position.set(hawk.g.position.x, hawk.g.position.y - 0.9, hawk.g.position.z);
      }
      hawk.g.rotation.x = t < 0.7 ? 0.5 : -0.4;
      const flap = Math.sin(t * 22) * 0.5;
      hawk.wingL.rotation.z = flap; hawk.wingR.rotation.z = -flap;
    }
  }

  // camera: slow auto-advance once the run starts; hawk if you fall behind
  const visRow = -P.z;
  if (state === 'playing' && started) scroll += (0.32 + Math.min(score, 200) / 450) * dt;
  if (visRow > scroll) scroll += (visRow - scroll) * Math.min(1, dt * 4);
  if (state === 'playing' && started && visRow < scroll - HAWK_LAG) die('hawk');

  camX += (clamp(P.x, -2.5, 2.5) * 0.6 - camX) * Math.min(1, dt * 3);
  const lookAhead = viewH > 14 ? 3.5 : 2;
  const tz = -(scroll + lookAhead);
  let sx = 0, sy = 0;
  if (shake > 0) { shake -= dt; sx = rand(-1, 1) * shake * 0.5; sy = rand(-1, 1) * shake * 0.5; }
  camera.position.set(camX + 3 + sx, 20 + sy, tz + 14);
  camera.lookAt(camX + sx, sy, tz);
  sun.position.set(camX - 8, 22, tz + 10);
  sun.target.position.set(camX, 0, tz);
  edges.forEach(e => { e.position.z = tz; });

  // stream the world
  const front = Math.floor(scroll) + AHEAD;
  while (nextRow < front) genChunk();
  for (const r of [...rows.values()]) if (r.i < scroll - BEHIND) destroyRow(r);

  updateParticles(dt);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- input ----------
const KEYS = {
  ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};
addEventListener('keydown', e => {
  if (e.code === 'KeyM') { toggleMute(); return; }
  const mv = KEYS[e.code];
  if (mv || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
  if (e.repeat) return;
  if (state === 'dead') {
    if ((e.code === 'Space' || e.code === 'Enter') && !$('over').classList.contains('hidden')) startGame();
    return;
  }
  if (mv) tryMove(...mv);
  else if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) startGame();
});

let touch0 = null;
addEventListener('touchstart', e => {
  if (e.target.closest('button')) return;
  const t = e.changedTouches[0];
  touch0 = { x: t.clientX, y: t.clientY };
}, { passive: true });
addEventListener('touchend', e => {
  if (!touch0 || e.target.closest('button')) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
  touch0 = null;
  if (state === 'dead') return;
  if (Math.hypot(dx, dy) < 24) tryMove(0, 1);
  else if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
  else tryMove(0, dy < 0 ? 1 : -1);
});
// mouse click on the title screen also starts (desktop)
$('title').addEventListener('click', () => { if (state === 'title' && !('ontouchstart' in window)) startGame(); });

function toggleMute() {
  muted = !muted;
  $('mute').textContent = muted ? '🔇' : '🔊';
  try { localStorage.setItem('tc-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  if (!muted) gobble();
}
$('mute').addEventListener('click', e => { e.stopPropagation(); toggleMute(); e.currentTarget.blur(); });
$('mute').textContent = muted ? '🔇' : '🔊';
$('retry').addEventListener('click', () => startGame());
$('share').addEventListener('click', async () => {
  const text = `I strutted ${score} blocks through Harvard Square in Turkey Crossing 🦃 Can you beat me?`;
  const url = location.href.split('#')[0];
  try {
    if (navigator.share) { await navigator.share({ title: 'Turkey Crossing', text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    $('share').textContent = 'COPIED!';
    setTimeout(() => { $('share').textContent = 'SHARE'; }, 1500);
  } catch { /* share cancelled */ }
});

// ---------- boot ----------
// The signs are drawn to canvas, so wait briefly for the pixel font before building the world.
await Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
resetGame();
frame();
