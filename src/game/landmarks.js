// Hand-built landmarks, named areas and the Landmarkdex. Positions come from OpenStreetMap
// (metres from the Harvard Square kiosk; x = east, z = south).
import * as THREE from 'three';
import { box, sign, pointInPoly, polyCentroid, distToPoly } from './util.js';
import { makeArcade, makeShell } from './models.js';
import { HARVARD_YARD } from './world.js';

export const LANDMARKS = [
  { id: 'kiosk', name: 'OUT OF TOWN NEWS KIOSK', building: 'Cambridge KiOSK', at: [-1, -25],
    fact: 'Built in 1928 as the entrance to the Harvard subway station. Out of Town News sold papers from all over the world here until 2019.' },
  { id: 't', name: 'HARVARD T STATION', at: [4, -4],
    fact: 'A Red Line stop. Its glass headhouse opened in the 1980s when the line was extended to Alewife.' },
  { id: 'johnston', name: 'JOHNSTON GATE', at: [38.3, -146.9],
    fact: 'Built in 1889 by McKim, Mead & White. It is the oldest and most ceremonial gate into Harvard Yard.' },
  { id: 'jh', name: 'JOHN HARVARD STATUE', at: [145, -123],
    fact: '"The statue of three lies": the model was not John Harvard, he was not the founder, and Harvard was founded in 1636, not 1638. Tourists rub his left shoe for luck.' },
  { id: 'masshall', name: 'MASSACHUSETTS HALL', building: 'Massachusetts Hall',
    fact: 'Finished in 1720, the oldest surviving building at Harvard. The president\'s office is here.' },
  { id: 'widener', name: 'WIDENER LIBRARY', building: 'Widener Library',
    fact: 'Opened in 1915 in memory of Harry Elkins Widener, a book collector who died on the Titanic.' },
  { id: 'memchurch', name: 'MEMORIAL CHURCH', building: 'Memorial Church',
    fact: 'Dedicated in 1932 to Harvard people who died in World War I. It faces Widener across Tercentenary Theatre.' },
  { id: 'sumner', name: 'CHARLES SUMNER STATUE', at: [12, -150],
    fact: 'Charles Sumner, Harvard class of 1830, was an abolitionist senator from Massachusetts.' },
  { id: 'coop', name: 'THE HARVARD COOP', building: 'Harvard Coop',
    fact: 'A cooperative bookstore founded by Harvard students in 1882.' },
  { id: 'firstparish', name: 'FIRST PARISH CHURCH', building: 'The First Parish in Cambridge',
    fact: 'A wooden Gothic Revival church from 1833. The Old Burying Ground next door dates back to the 1630s.' },
  { id: 'christchurch', name: 'CHRIST CHURCH', building: 'Christ Church',
    fact: 'Built in 1761, the oldest church building in Cambridge. Continental soldiers were quartered here in 1775.' },
  { id: 'common', name: 'CAMBRIDGE COMMON', at: [-172, -384], radius: 40,
    fact: 'George Washington took command of the Continental Army in Cambridge in July 1775. Look for the old cannons!' },
  { id: 'brattle', name: 'BRATTLE THEATRE', at: [-207, -20],
    fact: 'Brattle Hall dates to 1890. It has been an independent movie theater since 1953.' },
  { id: 'smith', name: 'SMITH CAMPUS CENTER', building: 'Smith Campus Center',
    fact: 'Opened in the 1960s as Holyoke Center, designed by Josep Lluis Sert.' },
  { id: 'lampoon', name: 'HARVARD LAMPOON CASTLE', building: 'Harvard Lampoon Building',
    fact: 'Home of the Harvard Lampoon humor magazine (founded 1876). The castle was built in 1909.' },
  { id: 'weld', name: 'WELD BOATHOUSE', building: 'Weld Boathouse',
    fact: 'Harvard\'s rowing boathouse on the Charles River, built in 1906.' },
];

// Named areas for the location banner, smallest/most specific first.
const OLD_YARD = [[113.2, -238], [179.8, -223.1], [164.2, -154.2], [142.9, -111.6], [126, -37], [70.4, -49.4]];
const TERCENTENARY = [[272.9, -129.6], [261.2, -81.2], [284.1, -76.5], [277.2, -48.7], [162.4, -76.2], [155, -85.1], [170.1, -152.5], [241.1, -136.8]];

export function buildAreas(data) {
  const areas = [
    { name: 'THE PIT', circle: [-8, -12, 20] },
    { name: 'TERCENTENARY THEATRE', poly: TERCENTENARY },
    { name: 'OLD YARD', poly: OLD_YARD },
    { name: 'HARVARD YARD', poly: HARVARD_YARD },
  ];
  for (const g of data.green) if (g.n) areas.push({ name: g.n.toUpperCase(), poly: g.p });
  areas.push({ name: 'HARVARD SQUARE', circle: [0, 0, 110] });
  return (x, z) => {
    for (const a of areas) {
      if (a.circle ? Math.hypot(x - a.circle[0], z - a.circle[1]) < a.circle[2] : pointInPoly(x, z, a.poly)) return a.name;
    }
    return null;
  };
}

// Orientation helper: centre, angle of the longest edge, and the edge nearest a target point.
function frame(poly) {
  let best = 0, angle = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const dx = poly[i][0] - poly[j][0], dz = poly[i][1] - poly[j][1];
    const l = Math.hypot(dx, dz);
    if (l > best) { best = l; angle = Math.atan2(dz, dx); }
  }
  return { c: polyCentroid(poly), angle };
}
function edgeFacing(poly, tx, tz) {
  let best = null, bd = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az);
    const d = Math.hypot(mx - tx, mz - tz) - l * 0.3; // prefer long edges
    if (l > 4 && d < bd) { bd = d; best = { mx, mz, l, angle: Math.atan2(bz - az, bx - ax) }; }
  }
  return best;
}

function roofLabel(scene, text, x, z, y, w) {
  const s = sign(text, w, w * 0.14, { bg: '#f8f8f8', fg: '#181818', border: '#181818' });
  s.rotation.x = -Math.PI / 2;
  s.position.set(x, y + 0.3, z);
  s.userData.topDownOnly = true;
  scene.add(s);
  return s;
}

// Builds the landmark models, resolves each landmark's position, returns interactables.
export function buildLandmarks(scene, world) {
  const topDownOnly = [];
  for (const L of LANDMARKS) {
    const b = L.building && world.findBuilding(L.building);
    if (b) {
      L.poly = b.poly;
      L.at = polyCentroid(b.poly);
      L.h = b.h;
    }
  }
  const byId = Object.fromEntries(LANDMARKS.map(l => [l.id, l]));

  // Out of Town News kiosk: copper-green roof and the famous sign
  {
    const k = byId.kiosk, f = frame(k.poly);
    const roof = new THREE.Group();
    roof.position.set(f.c[0], k.h, f.c[1]);
    roof.rotation.y = -f.angle;
    scene.add(roof);
    box(roof, 16, 0.6, 7, 0x5f9e8a, 0, 0, 0);
    box(roof, 13, 0.8, 5, 0x6fb09a, 0, 0.6, 0);
    box(roof, 8, 0.7, 2.6, 0x7fc0aa, 0, 1.4, 0);
    const s = sign('OUT OF TOWN NEWS', 9, 1, { bg: '#1b1b1b', fg: '#f2f2f2', border: null });
    s.position.set(0, -0.8, 3.56);
    roof.add(s);
    const s2 = s.clone(); s2.position.z = -3.56; s2.rotation.y = Math.PI; roof.add(s2);
  }
  // Harvard T headhouse: glass box with the round T sign
  {
    const [x, z] = byId.t.at;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = 0.35;
    scene.add(g);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(9, 3.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x9fc6d8, transparent: true, opacity: 0.55 }));
    glass.position.y = 1.8;
    g.add(glass);
    box(g, 9.4, 0.4, 6.4, 0x6b6f75, 0, 3.6, 0);
    box(g, 0.3, 3.6, 0.3, 0x6b6f75, -4.5, 0, -3);
    box(g, 0.3, 3.6, 0.3, 0x6b6f75, 4.5, 0, -3);
    box(g, 0.3, 3.6, 0.3, 0x6b6f75, -4.5, 0, 3);
    box(g, 0.3, 3.6, 0.3, 0x6b6f75, 4.5, 0, 3);
    box(g, 0.2, 4.5, 0.2, 0x333333, 5.5, 0, 3.6);
    const t = sign('T', 1.1, 1.1, { bg: '#ffffff', fg: '#181818', border: '#181818' });
    t.position.set(5.5, 4.9, 3.62);
    g.add(t);
    world.addBox(x, z, 9, 6, 0.35, 4.2);
  }
  // Johnston Gate: brick piers and an iron arch, opening east into the Yard
  {
    const [x, z] = byId.johnston.at;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = -0.23; // gate faces Mass Ave / Peabody St to the west
    scene.add(g);
    for (const zz of [-3.4, 3.4]) {
      box(g, 1.4, 5.2, 1.4, 0xa0523d, 0, 0, zz);
      box(g, 1.7, 0.4, 1.7, 0xd9d2c3, 0, 5.2, zz);
      box(g, 0.8, 0.6, 0.8, 0xd9d2c3, 0, 5.6, zz);
      world.addCircle(x + Math.sin(0.23) * zz, z + Math.cos(0.23) * zz, 0.9, 6.2);
    }
    for (let zz = -2.6; zz <= 2.6; zz += 0.65) box(g, 0.08, 4.4 + Math.cos(zz / 2.6) * 0.8, 0.08, 0x1f1f1f, 0, 0, zz);
    box(g, 0.14, 0.14, 6.6, 0x1f1f1f, 0, 5.1, 0);
    // brick fence either side
    for (const dir of [-1, 1]) {
      box(g, 0.6, 1.2, 14, 0xa0523d, 0, 0, dir * 11.2);
      for (let zz = 4.6; zz < 18; zz += 0.5) box(g, 0.05, 1.3, 0.05, 0x1f1f1f, 0, 1.2, dir * zz, false);
    }
    const s = sign('JOHNSTON GATE', 3.2, 0.5, { bg: '#a51c30' });
    s.position.set(-0.75, 6.6, 0);
    s.rotation.y = -Math.PI / 2;
    g.add(s);
  }
  // John Harvard statue: granite pedestal, seated bronze figure, shiny left shoe
  {
    const [x, z] = byId.jh.at;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI / 2 - 0.23; // faces west
    scene.add(g);
    box(g, 2.4, 0.4, 3.2, 0x9a9a95, 0, 0, 0);
    box(g, 1.9, 2.1, 2.6, 0xb4b3ad, 0, 0.4, 0);
    const bronze = 0x3f5a4c;
    box(g, 1.2, 0.8, 1.4, bronze, 0, 2.5, 0.1);        // chair + lap
    box(g, 1.0, 1.2, 0.7, bronze, 0, 3.1, 0.35);       // torso
    box(g, 0.45, 0.5, 0.45, bronze, 0, 4.3, 0.3);      // head
    box(g, 0.3, 0.9, 0.35, bronze, -0.3, 1.9, -0.55);  // legs
    box(g, 0.3, 0.9, 0.35, bronze, 0.3, 1.9, -0.55);
    box(g, 0.34, 0.18, 0.5, 0xe8c15a, 0.3, 1.9, -0.72);  // the lucky left shoe
    world.addCircle(x, z, 1.8, 4.6);
  }
  // Widener's grand steps and columns facing Memorial Church
  {
    const w = byId.widener, mc = byId.memchurch.at;
    const e = edgeFacing(w.poly, mc[0], mc[1]);
    const g = new THREE.Group();
    const [cx, cz] = polyCentroid(w.poly);
    const nx = e.mx - cx, nz = e.mz - cz, nl = Math.hypot(nx, nz);
    g.position.set(e.mx + (nx / nl) * 2.2, 0, e.mz + (nz / nl) * 2.2);
    g.rotation.y = -e.angle;
    scene.add(g);
    const span = Math.min(e.l * 0.7, 36);
    for (let k = 0; k < 12; k++) box(g, 1.1, 12, 1.1, 0xeae4d6, -span / 2 + (span * k) / 11, 1.2, 0);
    box(g, span + 4, 1.4, 3.8, 0xe4ddcc, 0, 13.2, 0);
    for (let s = 0; s < 4; s++) box(g, span + 6, 0.3, 3 + s * 1.6, 0xd6cfbe, 0, s * 0.3, 0);
  }
  // Memorial Church steeple
  {
    const m = byId.memchurch, wd = byId.widener.at;
    const e = edgeFacing(m.poly, wd[0], wd[1]);
    const g = new THREE.Group();
    g.position.set(e.mx, 0, e.mz);
    scene.add(g);
    box(g, 7, 22, 7, 0xa0523d, 0, 0, 0);
    box(g, 5.6, 8, 5.6, 0xf2efe8, 0, 22, 0);
    box(g, 4.4, 6, 4.4, 0xf2efe8, 0, 30, 0);
    box(g, 3.2, 4, 3.2, 0xf2efe8, 0, 36, 0);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.9, 18, 4), new THREE.MeshStandardMaterial({ color: 0xf2efe8 }));
    spire.position.y = 49;
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = true;
    g.add(spire);
    world.addBox(e.mx, e.mz, 7, 7, 0);
  }
  // Towers on the other churches
  for (const id of ['firstparish', 'christchurch']) {
    const c = byId[id], f = frame(c.poly);
    const tx = f.c[0] + Math.cos(f.angle) * 8, tz = f.c[1] + Math.sin(f.angle) * 8;
    const g = new THREE.Group();
    g.position.set(tx, 0, tz);
    scene.add(g);
    const col = id === 'firstparish' ? 0xe9e2d0 : 0xc9c0ae;
    box(g, 5, c.h + 9, 5, col, 0, 0, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 8, 4), new THREE.MeshStandardMaterial({ color: 0x4a4f55 }));
    cap.position.y = c.h + 13; cap.rotation.y = Math.PI / 4; cap.castShadow = true;
    g.add(cap);
    world.addBox(tx, tz, 5, 5, 0);
  }
  // Lampoon Castle turrets
  {
    const l = byId.lampoon;
    const west = l.poly.reduce((a, p) => (p[0] < a[0] ? p : a));
    const g = new THREE.Group();
    g.position.set(west[0] + 3, 0, west[1]);
    scene.add(g);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, l.h + 5, 8), new THREE.MeshStandardMaterial({ color: 0xc08a4f }));
    tower.position.y = (l.h + 5) / 2; tower.castShadow = true;
    g.add(tower);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6, 8), new THREE.MeshStandardMaterial({ color: 0x2f6b4f }));
    cap.position.y = l.h + 8; cap.castShadow = true;
    g.add(cap);
  }
  // Brattle Theatre marquee
  {
    const [x, z] = byId.brattle.at;
    const s = sign('BRATTLE', 5, 1.2, { bg: '#1b1b1b', fg: '#ffcc33', border: '#ffcc33' });
    s.position.set(x + 4, 5, z + 9);
    scene.add(s);
  }
  // Cannons on Cambridge Common
  {
    const [x, z] = byId.common.at;
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      g.position.set(x + 30 + k * 5, 0, z + 35);
      scene.add(g);
      box(g, 1.2, 0.5, 1.6, 0x5a4632, 0, 0, 0);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x2b2b2b }));
      barrel.rotation.x = Math.PI / 2 - 0.25; barrel.position.set(0, 0.9, -0.4); barrel.castShadow = true;
      g.add(barrel);
      world.addCircle(g.position.x, g.position.z, 1, 1.3);
    }
  }
  // Rowing shells resting on the Charles near Weld Boathouse
  const shells = [];
  {
    const [x, z] = byId.weld.at;
    for (let k = 0; k < 3; k++) {
      const s = makeShell();
      s.position.set(x + 30 + k * 25, 0.1, z + 25 + k * 12);
      s.rotation.y = Math.PI / 2 + 0.5;
      if (world.isWater(s.position.x, s.position.z)) { scene.add(s); shells.push(s); }
    }
  }

  // Rooftop labels (readable in the top-down view, hidden in first person)
  for (const L of LANDMARKS) {
    if (!L.poly || L.id === 'kiosk') continue;
    const xs = L.poly.map(p => p[0]);
    const w = Math.min(Math.max(...xs) - Math.min(...xs), 34);
    topDownOnly.push(roofLabel(scene, L.name.replace('THE ', ''), L.at[0], L.at[1], Math.min(Math.max(L.h, 4), 60), Math.max(w * 0.9, 8)));
  }

  // The arcade cabinet in the Pit
  const arcade = makeArcade();
  arcade.position.set(-14, 0, -4);
  arcade.rotation.y = Math.PI / 2;
  scene.add(arcade);
  world.addBox(-14, -4, 0.9, 1.1, 0, 2.3);

  const discovered = (x, z) => LANDMARKS.filter(L => (L.poly ? distToPoly(x, z, L.poly) < 9
    : Math.hypot(x - L.at[0], z - L.at[1]) < (L.radius || 10)));

  return { topDownOnly, arcade, shells, discovered };
}
