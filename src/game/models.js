// Blocky models, all in metres. Every model faces -z ("forward") unless noted.
import * as THREE from 'three';
import { box, pick, sign, paint, glass, NIGHT_LIGHTS } from './util.js';

const SKIN = [0xf0c8a0, 0xc68b59, 0x8d5524, 0xe0ac69, 0xffdbac];
const SHIRTS = [0xa51c30, 0xa51c30, 0x1f4e8c, 0x2e7d4f, 0xf1c40f, 0x7f8c8d, 0x222222, 0xecf0f1, 0x8e44ad, 0xd35400];
const PANTS = [0x2c3e50, 0x1b1b1b, 0x5d6d7e, 0x34495e, 0x6e4a2b];

// A wild turkey about 1 m tall, with legs and head that can be animated.
export function makeTurkey(scale = 1) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const bronze = 0x5a3a22, dark = 0x3a2616, tan = 0xd2a060, headC = 0xa9b8d0, red = 0xd02a2a, beak = 0xe8b44a, leg = 0xd98c5f;

  const legs = [-0.13, 0.13].map(x => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.3, 0.02);
    body.add(pivot);
    box(pivot, 0.07, 0.3, 0.07, leg, 0, -0.3, 0);
    box(pivot, 0.14, 0.03, 0.2, leg, 0, -0.3, -0.05);
    return pivot;
  });
  box(body, 0.56, 0.44, 0.64, bronze, 0, 0.3, 0.02);
  box(body, 0.5, 0.12, 0.5, dark, 0, 0.72, 0.08);
  const wings = [-0.31, 0.31].map(x => box(body, 0.08, 0.3, 0.44, dark, x, 0.38, 0.06));

  const fan = new THREE.Group();
  fan.position.set(0, 0.48, 0.36);
  fan.rotation.x = 0.55;
  body.add(fan);
  for (let k = -3; k <= 3; k++) {
    const p = new THREE.Group();
    p.rotation.z = k * 0.3;
    fan.add(p);
    box(p, 0.19, 0.62, 0.05, k % 2 ? bronze : dark, 0, 0, 0);
    box(p, 0.19, 0.12, 0.06, tan, 0, 0.56, 0);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.6, -0.3);
  body.add(head);
  box(head, 0.16, 0.3, 0.16, headC, 0, 0, 0);
  box(head, 0.22, 0.2, 0.26, headC, 0, 0.26, -0.04);
  box(head, 0.08, 0.06, 0.12, beak, 0, 0.3, -0.22);
  box(head, 0.07, 0.18, 0.06, red, 0, 0.1, -0.17);
  box(head, 0.05, 0.14, 0.05, red, 0.03, 0.22, -0.2);
  box(head, 0.03, 0.05, 0.05, 0x111111, -0.115, 0.34, -0.12, false);
  box(head, 0.03, 0.05, 0.05, 0x111111, 0.115, 0.34, -0.12, false);

  let phase = 0;
  function animate(dt, speed) {
    phase += dt * (4 + speed * 2.2);
    const swing = Math.min(speed / 3, 1) * 0.7;
    legs[0].rotation.x = Math.sin(phase) * swing;
    legs[1].rotation.x = -Math.sin(phase) * swing;
    // turkeys bob their heads forward and back as they walk
    head.position.z = -0.3 + Math.sin(phase * 2) * 0.06 * Math.min(speed, 1);
    wings.forEach((w, i) => { w.rotation.z = speed > 6 ? (i ? -1 : 1) * Math.abs(Math.sin(phase * 2)) * 0.6 : 0; });
    fan.scale.setScalar(1);
  }
  function flap(t) { wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.4 + Math.sin(t * 30) * 0.5); }); }
  // k in [0, 1]: 0 = rest, 1 = full lunge
  function peck(k) {
    head.position.z = -0.3 - k * 0.45;
    head.position.y = 0.6 - k * 0.25;
    body.rotation.x = -k * 0.35;
  }
  return { root, body, head, animate, flap, peck };
}

// Vehicles face -z. Returns { group, length, width, name }
export function makeVehicle(kind) {
  const g = new THREE.Group();
  const win = 0x2b3a4d;
  const wheels = (L, W) => {
    for (const z of [-L * 0.32, L * 0.32]) for (const x of [-W / 2, W / 2]) box(g, 0.25, 0.7, 0.7, 0x1b1b1b, x, 0, z);
  };
  let L, W, name;
  if (kind === 'bus' || kind === 'shuttle') {
    const mbta = kind === 'bus';
    L = 12; W = 2.6; name = mbta ? 'an MBTA BUS' : 'a HARVARD SHUTTLE';
    box(g, W, 2.7, L, paint(mbta ? 0xd9d9d9 : 0xa51c30), 0, 0.35, 0);
    box(g, W + 0.04, 0.9, L - 1.2, glass(), 0, 1.7, 0.3);
    box(g, 0.5, 0.25, 0.05, NIGHT_LIGHTS.head, -0.8, 0.7, -L / 2, false);
    box(g, 0.5, 0.25, 0.05, NIGHT_LIGHTS.head, 0.8, 0.7, -L / 2, false);
    box(g, W + 0.04, 0.25, L + 0.02, mbta ? 0xf2c500 : 0xffffff, 0, 1.2, 0);
    box(g, W - 0.2, 1.3, 0.05, win, 0, 1.4, -L / 2);
    box(g, W - 0.6, 0.3, 8, 0xaaaaaa, 0, 3.05, 0);
    const s = sign(mbta ? '1 HARVARD' : 'HARVARD', 1.8, 0.35, { bg: mbta ? '#181818' : '#a51c30', fg: mbta ? '#ffb000' : '#fff', border: null });
    s.position.set(0, 2.85, -L / 2 - 0.03);
    s.rotation.y = Math.PI;
    g.add(s);
    wheels(L * 0.85, W);
  } else if (kind === 'truck') {
    L = 7; W = 2.4; name = 'a BOX TRUCK';
    const c = pick([0x6b4226, 0x2c3e50, 0xc0392b, 0xecf0f1]);
    box(g, W, 2.2, 2, paint(c), 0, 0.4, -2.4);
    box(g, W + 0.02, 0.8, 0.05, glass(), 0, 1.5, -3.42);
    box(g, 0.4, 0.22, 0.05, NIGHT_LIGHTS.head, -0.8, 0.8, -3.42, false);
    box(g, 0.4, 0.22, 0.05, NIGHT_LIGHTS.head, 0.8, 0.8, -3.42, false);
    box(g, W, 3, 4.8, 0xf2f2f2, 0, 0.4, 0.9);
    wheels(L, W);
  } else if (kind === 'police') {
    L = 4.8; W = 2; name = 'an HUPD CRUISER';
    box(g, W, 0.8, L, paint(0xf2f2f2), 0, 0.35, 0);
    box(g, W + 0.02, 0.22, L + 0.02, paint(0xa51c30), 0, 0.62, 0);
    box(g, W - 0.15, 0.62, 2.5, paint(0xf2f2f2), 0, 1.15, 0.3);
    box(g, W - 0.1, 0.42, 2.4, glass(), 0, 1.22, 0.3);
    box(g, 0.4, 0.2, 0.05, NIGHT_LIGHTS.head, -0.6, 0.8, -L / 2, false);
    box(g, 0.4, 0.2, 0.05, NIGHT_LIGHTS.head, 0.6, 0.8, -L / 2, false);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(4) }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2060ff).multiplyScalar(4) }));
    red.position.set(-0.36, 1.88, 0.3); blue.position.set(0.36, 1.88, 0.3);
    g.add(red, blue);
    g.userData.lights = [red, blue];
    wheels(L, W);
  } else {
    const taxi = kind === 'taxi';
    L = 4.5; W = 1.9; name = taxi ? 'a TAXI' : pick(['a ZIPCAR', 'a SUBARU', 'a VOLVO', 'a MINIVAN', 'a PRIUS', 'a JEEP']);
    const c = taxi ? 0xf5c518 : pick([0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x34495e, 0x1abc9c, 0x7f8c8d, 0x222222]);
    box(g, W, 0.8, L, paint(c), 0, 0.35, 0);
    box(g, W - 0.15, 0.65, 2.4, paint(c), 0, 1.15, 0.25);
    box(g, W - 0.1, 0.45, 2.3, glass(), 0, 1.22, 0.25);
    box(g, 0.4, 0.2, 0.05, NIGHT_LIGHTS.head, -0.6, 0.8, -L / 2, false);
    box(g, 0.4, 0.2, 0.05, NIGHT_LIGHTS.head, 0.6, 0.8, -L / 2, false);
    box(g, 0.4, 0.2, 0.05, NIGHT_LIGHTS.tail, -0.6, 0.8, L / 2, false);
    box(g, 0.4, 0.2, 0.05, NIGHT_LIGHTS.tail, 0.6, 0.8, L / 2, false);
    if (taxi) box(g, 0.9, 0.3, 0.4, 0xffffff, 0, 1.8, 0.2);
    wheels(L, W);
  }
  return { group: g, length: L, width: W, name };
}

// A student / pedestrian ~1.75 m tall facing -z, with swinging legs.
export function makePerson(officer = false) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const pants = officer ? 0x1f2d4a : pick(PANTS), skin = pick(SKIN), shirt = officer ? 0x1f2d4a : pick(SHIRTS);
  const legs = [-0.12, 0.12].map(x => {
    const p = new THREE.Group();
    p.position.set(x, 0.85, 0);
    g.add(p);
    box(p, 0.18, 0.85, 0.2, pants, 0, -0.85, 0);
    return p;
  });
  box(g, 0.5, 0.62, 0.3, shirt, 0, 0.85, 0);
  box(g, 0.14, 0.55, 0.16, shirt, -0.32, 0.9, 0);
  box(g, 0.14, 0.55, 0.16, shirt, 0.32, 0.9, 0);
  box(g, 0.3, 0.3, 0.3, skin, 0, 1.47, 0);
  if (officer) {
    box(g, 0.54, 0.4, 0.34, 0xd7ff3a, 0, 1.0, 0);           // hi-vis vest
    box(g, 0.36, 0.12, 0.4, 0x1f2d4a, 0, 1.72, -0.04);       // cap
    const net = new THREE.Group();
    net.position.set(0.38, 1.2, 0);
    net.rotation.x = -0.9;
    g.add(net);
    box(net, 0.05, 1.5, 0.05, 0x8a6a3a, 0, 0, 0);
    box(net, 0.55, 0.55, 0.12, 0xdddddd, 0, 1.5, 0);
  } else {
    box(g, 0.32, 0.1, 0.32, pick([0x2b1d0e, 0x111111, 0x8b5a2b, 0xd9b26f, 0x999999]), 0, 1.72, 0);
    if (Math.random() < 0.5) box(g, 0.4, 0.45, 0.16, pick([0x1b1b1b, 0x2e7d4f, 0x1f4e8c, 0xa51c30]), 0, 0.95, 0.22);
  }
  let phase = Math.random() * 6;
  return {
    group: g,
    animate(dt, speed) {
      phase += dt * (speed > 3 ? speed * 2.2 : speed * 5);
      const swing = speed > 3 ? 0.9 : 0.5;
      legs[0].rotation.x = Math.sin(phase) * swing;
      legs[1].rotation.x = -Math.sin(phase) * swing;
    },
  };
}

export function makeCorn() {
  const g = new THREE.Group();
  box(g, 0.28, 0.55, 0.28, 0xf3c623, 0, 0.25, 0);
  box(g, 0.08, 0.45, 0.3, 0x5aa845, -0.17, 0.2, 0);
  box(g, 0.08, 0.45, 0.3, 0x5aa845, 0.17, 0.2, 0);
  return g;
}

// Arcade cabinet facing +z (the screen side).
export function makeArcade() {
  const g = new THREE.Group();
  box(g, 1.1, 1.9, 0.9, 0x1b1b1b, 0, 0, 0);
  box(g, 1.14, 0.35, 0.95, 0xa51c30, 0, 1.9, 0);
  box(g, 0.9, 0.7, 0.05, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x39ff88).multiplyScalar(2.5) }), 0, 1.1, 0.46, false);
  box(g, 1.0, 0.1, 0.4, 0x333333, 0, 0.95, 0.55);
  const s = sign('TURKEY CROSSING', 1.1, 0.3, { bg: '#a51c30', fg: '#ffe066', border: null });
  s.position.set(0, 2.08, 0.48);
  g.add(s);
  return g;
}

// A rowing shell with four crimson rowers, facing -z. ~12 m long.
export function makeShell() {
  const g = new THREE.Group();
  box(g, 0.6, 0.3, 12, 0xf2efe6, 0, -0.1, 0);
  box(g, 0.62, 0.08, 12.02, 0xa51c30, 0, 0.12, 0);
  for (const z of [-3.6, -1.2, 1.2, 3.6]) {
    box(g, 0.4, 0.6, 0.3, 0xa51c30, 0, 0.2, z);
    box(g, 0.28, 0.28, 0.28, pick(SKIN), 0, 0.8, z);
    box(g, 4.5, 0.06, 0.1, 0xdddddd, 0, 0.35, z + 0.3);
  }
  return g;
}

// Food that people drop when a turkey bites them. Returns { group, kind }.
export const FOODS = ['sandwich', 'coffee', 'bagel', 'pizza', 'burrito'];
export function makeFood(kind) {
  const g = new THREE.Group();
  if (kind === 'sandwich') {
    box(g, 0.5, 0.08, 0.36, 0xe8c07a, 0, 0, 0); box(g, 0.52, 0.06, 0.38, 0x5aa845, 0, 0.08, 0);
    box(g, 0.5, 0.06, 0.36, 0xd0453a, 0, 0.14, 0); box(g, 0.5, 0.08, 0.36, 0xe8c07a, 0, 0.2, 0);
  } else if (kind === 'coffee') {
    box(g, 0.24, 0.4, 0.24, 0xffffff, 0, 0, 0); box(g, 0.26, 0.12, 0.26, 0xe8601c, 0, 0.16, 0);
    box(g, 0.26, 0.05, 0.26, 0x5a3a22, 0, 0.4, 0);
  } else if (kind === 'bagel') {
    for (const [x, z] of [[-0.16, 0], [0.16, 0], [0, -0.16], [0, 0.16]]) box(g, 0.2, 0.14, 0.2, 0xc98a3f, x, 0, z);
  } else if (kind === 'pizza') {
    box(g, 0.5, 0.05, 0.42, 0xf2c14e, 0, 0, 0); box(g, 0.5, 0.07, 0.1, 0xc98a3f, 0, 0, 0.2);
    for (const [x, z] of [[-0.1, -0.05], [0.12, 0.05]]) box(g, 0.1, 0.03, 0.1, 0xb8322a, x, 0.05, z);
  } else {
    box(g, 0.24, 0.22, 0.55, 0xd9d9d9, 0, 0, 0); box(g, 0.22, 0.2, 0.08, 0xc98a3f, 0, 0.01, -0.3);
  }
  g.scale.setScalar(1.6);
  return { group: g, kind };
}

// Spinning rampage token.
export function makeRampageToken() {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b30).multiplyScalar(3) });
  const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23f).multiplyScalar(2.5) });
  const a = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), glow);
  const b = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 6, 16), gold);
  a.position.y = b.position.y = 1.6;
  inner.add(a, b);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 24), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2;
  g.add(ring);
  return { group: g, inner };
}

export function makeCrown() {
  const g = new THREE.Group();
  const gold = 0xffd23f;
  box(g, 0.34, 0.1, 0.34, gold, 0, 0, 0);
  for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) box(g, 0.08, 0.16, 0.08, gold, x, 0.1, z);
  box(g, 0.07, 0.07, 0.07, 0xd0021b, 0, 0.12, -0.17, false);
  return g;
}
