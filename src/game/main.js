import * as THREE from 'three';
import { buildWorld, renderMinimap, BOUNDS } from './world.js';
import { LANDMARKS, buildLandmarks, buildAreas } from './landmarks.js';
import { Traffic, Pedestrians, Police } from './traffic.js';
import { makeTurkey, makeCorn, makeFood, FOODS, makeRampageToken, makeCrown } from './models.js';
import { sfx, gobble, muted, setMuted, setSiren } from './audio.js';
import { box, clamp, angleLerp, rand, pick, setNightLights } from './util.js';
import { createGraphics } from './graphics.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');
const params = new URLSearchParams(location.search);

// ---------- tuning ----------
const WALK = 8, SPRINT = 15, SUPER_SPRINT = 19;
const JUMP_V = 8.5, FLAP_V = 7, FLAP_COST = 14, GRAVITY = 18;
const RANKS = [
  { at: 0, name: 'HARMLESS POULT' },
  { at: 800, name: 'NUISANCE', unlock: 'gobble', desc: 'MEGA GOBBLE UNLOCKED! PRESS Q TO FLATTEN EVERYONE NEARBY' },
  { at: 2500, name: 'MENACE', unlock: 'sprint', desc: 'SUPER SPRINT UNLOCKED! YOU ARE 25% FASTER' },
  { at: 6000, name: 'PUBLIC ENEMY', unlock: 'crown', desc: 'GOLDEN CROWN UNLOCKED! WEAR IT WITH PRIDE' },
  { at: 12000, name: 'CAMBRIDGE LEGEND', unlock: 'fire', desc: 'FIRE TRAIL UNLOCKED! YOUR SPRINT LEAVES FLAMES' },
  { at: 25000, name: 'TURKEY KING OF HARVARD SQ', unlock: 'king', desc: 'ALL HAIL THE TURKEY KING!' },
];

// ---------- renderer ----------
// ?q=low|high or the G key picks quality; phones default to low.
const quality = params.get('q') || store.get('tc-quality', isTouch ? 'low' : 'high');
const canvas = $('game');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9dcef, 220, 900);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
camera.rotation.order = 'YXZ';
const gfx = createGraphics(canvas, scene, camera, quality);
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  gfx.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// ---------- load the world ----------
await Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))]).catch(() => {});
const data = await (await fetch('data/harvard.json')).json();
const world = buildWorld(scene, data);
const marks = buildLandmarks(scene, world);
const areaAt = buildAreas(data);
const traffic = new Traffic(scene, data);
const peds = new Pedestrians(scene, data, world);
const police = new Police(scene, world);
const minimap = renderMinimap(data);

const SPAWN = { x: 118, z: -100 };  // Old Yard, near the John Harvard statue
const ARCADE_SPOT = { x: -11.5, z: -4 };

// ---------- player ----------
const turkey = makeTurkey(1.6);
scene.add(turkey.root);
const P = { x: SPAWN.x, z: SPAWN.z, y: 0, vx: 0, vz: 0, vy: 0, yaw: Math.PI / 2, pitch: 0, hp: 3, invuln: 0,
  energy: 100, grounded: true, diving: false, tumble: 0, safeX: SPAWN.x, safeZ: SPAWN.z };
const at = params.get('at');
if (at) { const [x, z] = at.split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(z)) Object.assign(P, { x, z }); }
const returned = !!sessionStorage.getItem('tc-return');
if (returned) {
  sessionStorage.removeItem('tc-return');
  Object.assign(P, { x: ARCADE_SPOT.x + 1.5, z: ARCADE_SPOT.z, yaw: -Math.PI / 2 });
}

const marker = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 3),
  new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false, fog: false }));
marker.rotation.x = Math.PI;
marker.renderOrder = 10;
scene.add(marker);

const prof = makeTurkey(1.9);
prof.root.position.set(SPAWN.x + 6, 0, SPAWN.z - 3);
prof.root.rotation.y = -Math.PI / 2 + 0.4;
box(prof.body, 0.36, 0.08, 0.04, 0x111111, 0, 0.94, -0.49, false);
scene.add(prof.root);
world.addCircle(prof.root.position.x, prof.root.position.z, 0.9, 3);

// ---------- corn, food, rampage tokens ----------
const corn = [];
for (let tries = 0; corn.length < 60 && tries < 4000; tries++) {
  const [x, z] = pick(pick(data.paths).p);
  const jx = x + rand(-1, 1), jz = z + rand(-1, 1);
  if (Math.hypot(jx, jz) > 420 || world.insideBuilding(jx, jz) || world.isWater(jx, jz)) continue;
  if (corn.some(c => Math.hypot(c.x - jx, c.z - jz) < 25)) continue;
  const m = makeCorn();
  m.scale.setScalar(1.4);
  m.position.set(jx, 0.2, jz);
  scene.add(m);
  corn.push({ x: jx, z: jz, m });
}

const foods = [];
function dropFood(x, z) {
  if (foods.length > 30) scene.remove(foods.shift().group);
  const f = makeFood(pick(FOODS));
  f.x = x; f.z = z; f.y = 1.2; f.vy = 5; f.vx = rand(-2, 2); f.vz = rand(-2, 2); f.age = 0;
  f.group.position.set(x, f.y, z);
  scene.add(f.group);
  foods.push(f);
}

const RAMPAGE_SPOTS = [[-40, 28], [96, -170], [-175, -48], [-118, 118], [-230, -300]];
const tokens = RAMPAGE_SPOTS.map(([x, z]) => {
  for (let k = 0; k < 30 && (world.insideBuilding(x, z) || world.roadAt(x, z)); k++) { x += rand(-6, 6); z += rand(-6, 6); }
  const t = makeRampageToken();
  t.group.position.set(x, 0, z);
  scene.add(t.group);
  return { ...t, x, z, cooldown: 0 };
});

// ---------- persistent state ----------
let found = new Set(store.get('tc-found', []));
let cornTotal = store.get('tc-corn-total', 0);
let career = store.get('tc-career', 0);
let bestChaos = store.get('tc-best-chaos', 0);
let rank = RANKS.reduce((r, R, i) => (career >= R.at ? i : r), 0);
const unlocked = u => RANKS.findIndex(R => R.unlock === u) <= rank;
let chaos = 0, heat = 0, stars = 0, lastCrime = -99;
let combo = 0, comboTimer = 0;
let gobbleCd = 0, sugar = 0, freeze = 0, shake = 0;
let rampage = null;
let view = store.get('tc-view', 'top');
let zoom = 34;
let paused = true, started = false, time = 0;

let crown = null;
function applyCosmetics() {
  if (unlocked('crown') && !crown) { crown = makeCrown(); crown.position.set(0, 0.36, -0.04); turkey.head.add(crown); }
}
applyCosmetics();

function hud() {
  $('hearts').textContent = '❤'.repeat(Math.max(0, P.hp)) + '♡'.repeat(Math.max(0, 3 - P.hp));
  $('chaos').textContent = `CHAOS ${chaos.toLocaleString()}`;
  $('rank').textContent = RANKS[rank].name + (RANKS[rank + 1] ? ` · NEXT ${RANKS[rank + 1].at.toLocaleString()}` : '');
  $('corn').textContent = `🌽 ${cornTotal}`;
  $('dexcount').textContent = `DEX ${found.size}/${LANDMARKS.length}`;
  $('stars').innerHTML = '<b>' + '★'.repeat(stars) + '</b>' + '☆'.repeat(5 - stars);
  $('stars').classList.toggle('hot', stars > 0);
}
hud();

// ---------- announcements, floating text, dialog ----------
let announceTimer = null;
function announce(big, small = '', ms = 2200) {
  const el = $('announce');
  el.textContent = big;
  if (small) { const s = document.createElement('small'); s.textContent = small; el.append(s); }
  el.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => el.classList.remove('show'), ms);
}
const floaters = [];
function floatText(text, x, y, z, color = '#ffd23f') {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.color = color;
  $('floaters').append(el);
  floaters.push({ el, x, y, z, t: 0 });
  if (floaters.length > 16) floaters.shift().el.remove();
}
const tmpV = new THREE.Vector3();
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    tmpV.set(f.x, f.y + f.t * 3, f.z).project(camera);
    f.el.style.left = `${(tmpV.x + 1) / 2 * innerWidth}px`;
    f.el.style.top = `${(1 - tmpV.y) / 2 * innerHeight}px`;
    f.el.style.opacity = String(clamp(1.4 - f.t, 0, 1));
    f.el.style.fontSize = `${13 + Math.min(f.t * 30, 6)}px`;
    if (f.t > 1.4 || tmpV.z > 1) { f.el.remove(); floaters.splice(i, 1); }
  }
}

const dialog = { lines: [], i: 0, n: 0, timer: null, done: null, open: false };
function say(lines, done) {
  Object.assign(dialog, { lines, i: 0, done, open: true });
  paused = true;
  $('dialog').classList.remove('hidden');
  typeLine();
}
function typeLine() {
  clearInterval(dialog.timer);
  const full = dialog.lines[dialog.i];
  dialog.n = 0;
  dialog.timer = setInterval(() => {
    dialog.n++;
    renderLine(full.slice(0, dialog.n));
    if (dialog.n % 3 === 0) sfx.blip();
    if (dialog.n >= full.length) clearInterval(dialog.timer);
  }, 20);
}
function renderLine(text) {
  const el = $('dialog');
  const m = text.match(/^([A-Z. ]+): ([\s\S]*)$/);
  el.textContent = '';
  if (m) {
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = m[1] + ': ';
    el.append(who, m[2]);
  } else el.textContent = text;
}
function advance() {
  const full = dialog.lines[dialog.i];
  if (dialog.n < full.length) { clearInterval(dialog.timer); dialog.n = full.length; renderLine(full); return; }
  dialog.i++;
  if (dialog.i < dialog.lines.length) { typeLine(); return; }
  dialog.open = false;
  $('dialog').classList.add('hidden');
  paused = false;
  const cb = dialog.done; dialog.done = null;
  if (cb) cb();
}

const PROF_INTRO = [
  'PROF. GOBBLEWORTH: Listen up, youngster. For 400 years these humans have walked all over Harvard Square.',
  'PROF. GOBBLEWORTH: Today, we take it back. BITE them (F or click). Steal their sandwiches. Make them RUN.',
  'PROF. GOBBLEWORTH: Every bite earns CHAOS, and chaining bites builds a COMBO. More chaos means a higher rank and new powers.',
  'PROF. GOBBLEWORTH: You can FLY! Tap SPACE in the air to flap up onto the rooftops. Bite in mid-air to DIVE BOMB.',
  'PROF. GOBBLEWORTH: Cause enough trouble and ANIMAL CONTROL will come with nets. At 3 stars the HUPD joins the chase. Fly away to lose them!',
  'PROF. GOBBLEWORTH: Touch the red RAMPAGE tokens for bonus challenges. Now go. Make them remember the turkeys.',
];
function talkToProf() {
  const next = RANKS[rank + 1];
  say([`PROF. GOBBLEWORTH: You are a ${RANKS[rank].name}. Career chaos: ${career.toLocaleString()}.`,
    next ? `PROF. GOBBLEWORTH: Reach ${next.at.toLocaleString()} to become ${next.name}. Now get back out there!`
      : 'PROF. GOBBLEWORTH: The Turkey King of Harvard Square... I never thought I would live to see the day.']);
}

let bannerTimer = null, currentArea = '', pendingArea = '', pendingSince = 0;
function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
let speech = null;
function speak(ped, text) {
  if (speech && time - speech.at < 1.2 && speech.ped !== ped) return;
  speech = { ped, text, at: time };
  $('speech').textContent = text;
}

function openDex() {
  const list = $('dex-list');
  list.textContent = '';
  for (const L of LANDMARKS) {
    const e = document.createElement('div');
    const ok = found.has(L.id);
    e.className = 'entry' + (ok ? '' : ' unknown');
    const b = document.createElement('b');
    b.textContent = ok ? `★ ${L.name}` : '? ? ? ? ?';
    e.append(b, ok ? L.fact : 'Not discovered yet.');
    list.append(e);
  }
  $('dex').classList.remove('hidden');
  paused = true;
}
function closeDex() { $('dex').classList.add('hidden'); if (!dialog.open) paused = false; }
const dexOpen = () => !$('dex').classList.contains('hidden');

// ---------- chaos, heat, ranks ----------
function addChaos(base, label, x, y, z, { combo: useCombo = true, heatGain = 0 } = {}) {
  const mult = useCombo ? Math.min(1 + Math.floor(combo / 2), 10) : 1;
  const pts = Math.round(base * mult);
  chaos += pts; career += pts;
  if (chaos > bestChaos) { bestChaos = chaos; store.set('tc-best-chaos', bestChaos); }
  store.set('tc-career', career);
  floatText(`+${pts} ${label}`, x, y, z, mult > 3 ? '#ff5a3c' : '#ffd23f');
  if (heatGain) addHeat(heatGain);
  while (RANKS[rank + 1] && career >= RANKS[rank + 1].at) {
    rank++;
    sfx.unlock();
    announce(`RANK UP! ${RANKS[rank].name}`, RANKS[rank].desc, 3800);
    applyCosmetics();
  }
  hud();
}
function bumpCombo() {
  combo++;
  comboTimer = 3.2;
  const mult = Math.min(1 + Math.floor(combo / 2), 10);
  const el = $('combo');
  el.textContent = mult > 1 ? `COMBO x${mult}!` : '';
  el.style.transform = 'translateX(-50%) scale(1.35)';
  setTimeout(() => { el.style.transform = 'translateX(-50%) scale(1)'; }, 110);
}
function starsFor(h) { return h < 60 ? 0 : Math.min(5, 1 + Math.floor((h - 60) / 150)); }
function addHeat(n) {
  heat = Math.min(heat + n, 800);
  lastCrime = time;
  const s = starsFor(heat);
  if (s > stars) {
    sfx.star();
    if (s === 1) toast('ANIMAL CONTROL HAS BEEN CALLED!');
    if (s === 3) announce('★★★ HUPD IS COMING', 'FLY ONTO A ROOF OR OUTRUN THEM!');
    if (s === 5) announce('★★★★★ PUBLIC ENEMY #1', 'THE WHOLE CITY WANTS YOUR FEATHERS');
  }
  stars = s;
  hud();
}

// ---------- actions ----------
const forward = () => [-Math.sin(P.yaw), -Math.cos(P.yaw)];
let peckT = 0;

function bitePed(p, label = 'CHOMP!') {
  peds.bite(p, P.x, P.z);
  bumpCombo();
  if (Math.random() < 0.5) dropFood(p.x, p.z);
  speak(p, pick(['AAAAH!', 'IT BIT ME!', 'MY SANDWICH!', 'OW OW OW!', 'NOT MY ANKLE!', 'WHY ME?!']));
  addChaos(p.hits > 1 ? 150 : 100, p.hits > 1 ? 'DOUBLE CHOMP!' : label, p.x, 2.2, p.z, { heatGain: 22 });
  if (rampage) { rampage.got++; if (rampage.got >= rampage.need) finishRampage(true); }
}

function peck() {
  if (!started || paused || peckT > 0) return;
  if (!P.grounded && P.y > 2.2 && !P.diving) {
    P.diving = true; P.vy = -30; sfx.whoosh();
    return;
  }
  peckT = 0.28;
  const [fx, fz] = forward();
  const reach = (x, z, r) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
    return d < r && (d < 1.2 || (dx * fx + dz * fz) / d > 0.15);
  };
  let hits = 0;
  for (const p of peds.peds) if (p.mode !== 'down' && reach(p.x, p.z, 2.6)) { bitePed(p); hits++; }
  for (const o of police.officers) {
    if (o.stun <= 0 && reach(o.x, o.z, 2.6)) {
      o.stun = 3.5; hits++; bumpCombo();
      addChaos(300, 'OFFICER BONKED!', o.x, 2.2, o.z, { heatGain: 40 });
    }
  }
  for (const c of [...traffic.cars, ...police.cruisers]) {
    if (reach(c.x, c.z, c.length / 2 + 1.2)) {
      hits++; bumpCombo();
      sfx.honk();
      addChaos(40, 'VANDALISM!', c.x, 2.5, c.z, { heatGain: 8 });
      break;
    }
  }
  sfx.chomp();
  if (hits) {
    sfx.scream();
    freeze = 0.06; shake = Math.max(shake, 0.25);
    peds.panic(P.x, P.z, 16);
    burst(P.x + fx, 1, P.z + fz, 10, [0xffffff, 0xffd23f, 0xff5a3c], 4);
  }
}

function shockwave(radius, label, pts) {
  const hit = peds.panic(P.x, P.z, radius * 2.2, radius);
  for (const p of hit) {
    bumpCombo();
    if (Math.random() < 0.4) dropFood(p.x, p.z);
    addChaos(pts, label, p.x, 2.2, p.z, { heatGain: 12 });
    if (rampage) { rampage.got++; if (rampage.got >= rampage.need) { finishRampage(true); break; } }
  }
  const n = police.stunNear(P.x, P.z, radius);
  if (n) addChaos(300 * n, 'OFFICERS FLATTENED!', P.x, 3, P.z, { heatGain: 30 });
  ring(P.x, P.z, radius);
  burst(P.x, 0.3, P.z, 24, [0xd9c7a5, 0xbfae8e, 0xffffff], 9);
  shake = Math.max(shake, 0.7);
  freeze = 0.08;
  sfx.boom();
  if (hit.length) sfx.scream();
}

function megaGobble() {
  if (!started || paused) return;
  if (!unlocked('gobble')) { toast(`MEGA GOBBLE UNLOCKS AT ${RANKS[1].at} CAREER CHAOS`); return; }
  if (gobbleCd > 0) return;
  gobbleCd = 8;
  gobble(0.55, 0.22);
  shockwave(11, 'MEGA GOBBLE!', 120);
  addHeat(35);
}

function startRampage(t) {
  rampage = { need: 10, got: 0, t: 45 };
  t.cooldown = 90;
  sfx.rampage();
  announce('RAMPAGE!', 'BITE 10 PEOPLE IN 45 SECONDS');
}
function finishRampage(ok) {
  if (!rampage) return;
  rampage = null;
  $('rampage-hud').classList.add('hidden');
  if (ok) {
    sfx.win();
    announce('RAMPAGE COMPLETE!', '+2,500 CHAOS · HEALTH RESTORED');
    P.hp = 3;
    addChaos(2500, 'RAMPAGE!', P.x, 3, P.z, { combo: false });
  } else { sfx.faint(); announce('RAMPAGE FAILED', 'TRY ANOTHER TOKEN'); }
}

function respawn() {
  Object.assign(P, { x: SPAWN.x, z: SPAWN.z, y: 0, vx: 0, vz: 0, vy: 0, hp: 3, invuln: 2, diving: false, tumble: 0 });
  heat = 0; stars = 0; combo = 0;
  police.clear();
  setSiren(false);
  if (rampage) finishRampage(false);
  hud();
}

function hurt(by) {
  if (P.invuln > 0 || paused) return;
  P.hp--;
  P.invuln = 2;
  P.vx = (by.dirx || 0) * 16 + rand(-3, 3); P.vz = (by.dirz || 0) * 16 + rand(-3, 3); P.vy = 11;
  P.tumble = 1; P.grounded = false;
  burst(P.x, 1, P.z, 22, [0x5a3a22, 0x3a2616, 0xd2a060], 6);
  sfx.hit();
  shake = 0.6; freeze = 0.1;
  combo = 0;
  hud();
  if (P.hp > 0) { floatText(`OOF! ${by.name.toUpperCase()}!`, P.x, 2.5, P.z, '#ff5a3c'); return; }
  sfx.faint();
  setTimeout(() => say([`TURKEY was flattened by ${by.name}!`, 'TURKEY fainted!', '...',
    `TURKEY woke up in the OLD YARD. Chaos this run: ${chaos.toLocaleString()}.`], respawn), 700);
}

function busted() {
  if (paused) return;
  sfx.busted();
  const lost = Math.floor(chaos / 2);
  chaos -= lost;
  announce('BUSTED!', `ANIMAL CONTROL GOT YOU · -${lost.toLocaleString()} CHAOS`, 2600);
  paused = true;
  setTimeout(() => say(['ANIMAL CONTROL caught TURKEY in a net!', 'TURKEY was released back in the OLD YARD with a stern warning.',
    'PROF. GOBBLEWORTH: Sloppy. Next time, FLY when you see the nets!'], respawn), 1200);
}

// ---------- particles ----------
const particles = [];
function burst(x, y, z, n, colors, speed = 4, size = 0.18) {
  for (let k = 0; k < n; k++) {
    const m = box(scene, size, size * 0.4, size * 1.5, pick(colors), x, y, z, false);
    const a = rand(0, Math.PI * 2), s = rand(0.3, 1) * speed;
    particles.push({ m, vx: Math.cos(a) * s, vy: rand(2, 6), vz: Math.sin(a) * s, life: rand(0.7, 1.5), spin: rand(-10, 10) });
  }
}
const rings = [];
function ring(x, z, r) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.3, z);
  scene.add(m);
  rings.push({ m, t: 0, r });
}
let dustT = 0;

// ---------- input ----------
const keys = new Set();
const stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
let lookTouch = null;
let jumpHeld = false;

function jumpPress() {
  if (!started || paused) return;
  if (P.grounded) { P.vy = JUMP_V; P.grounded = false; sfx.flap(); }
  else if (P.energy >= FLAP_COST) {
    P.vy = Math.min(Math.max(P.vy, 0) + FLAP_V, 11);
    P.energy -= FLAP_COST;
    sfx.flap();
    burst(P.x, P.y + 0.5, P.z, 3, [0x5a3a22, 0x3a2616], 2, 0.14);
  }
}
function interact() {
  if (dialog.open) { advance(); return; }
  if (!started) return;
  if (nearArcade()) { sessionStorage.setItem('tc-return', '1'); location.href = 'crossing.html'; return; }
  if (nearProf()) talkToProf();
}
function toggleView() {
  view = view === 'top' ? 'fp' : 'top';
  store.set('tc-view', view);
  if (view === 'fp') { P.pitch = 0; if (!isTouch) canvas.requestPointerLock?.(); }
  else document.exitPointerLock?.();
  toast(view === 'top' ? 'CHASE VIEW' : 'TURKEY-EYE VIEW');
}
function toggleMute() {
  setMuted(!muted);
  $('mute').textContent = muted ? '🔇' : '🔊';
  if (muted) setSiren(false); else gobble();
}
$('mute').textContent = muted ? '🔇' : '🔊';

function start() {
  if (started) return;
  started = true;
  $('title').classList.add('hidden');
  gobble();
  if (returned) { paused = false; return; }
  if (!store.get('tc-met-prof2', false)) { store.set('tc-met-prof2', true); say(PROF_INTRO); }
  else say(['PROF. GOBBLEWORTH: Back for more? Go cause some CHAOS. (F to bite, SPACE to fly, TAB for the Landmarkdex.)']);
}

addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!started) { if ($('start-msg').dataset.ready) start(); return; }
  if (e.code === 'KeyM') return toggleMute();
  if (dialog.open) { if (!e.repeat && ['Space', 'Enter', 'KeyE', 'KeyF'].includes(e.code)) advance(); return; }
  if (e.code === 'Tab' || e.code === 'KeyL') { dexOpen() ? closeDex() : openDex(); return; }
  if (dexOpen()) { if (e.code === 'Escape') closeDex(); return; }
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'KeyT') {
    // daytime only: morning, midday, afternoon, golden hour
    const presets = [8.5, 12, 15, 17.2];
    const next = presets.find(h => h > gfx.state.tod + 0.01) ?? presets[0];
    gfx.setTime(next);
    toast(`☀ ${gfx.clockText()}`);
  }
  if (e.code === 'KeyG') { store.set('tc-quality', quality === 'high' ? 'low' : 'high'); location.reload(); }
  if (e.code === 'KeyE' || e.code === 'Enter') interact();
  if (e.code === 'Space') { jumpHeld = true; jumpPress(); }
  if (e.code === 'KeyF' || e.code === 'KeyJ') peck();
  if (e.code === 'KeyQ') megaGobble();
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') jumpHeld = false; });
addEventListener('blur', () => { keys.clear(); jumpHeld = false; });
addEventListener('wheel', e => { zoom = clamp(zoom * (e.deltaY > 0 ? 1.1 : 0.9), 14, 110); }, { passive: true });
canvas.addEventListener('mousedown', e => {
  if (!started || e.button !== 0) return;
  if (dialog.open) { advance(); return; }
  if (view === 'fp' && !isTouch && document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
  peck();
});
$('title').addEventListener('click', () => { if ($('start-msg').dataset.ready) start(); });
$('dialog').addEventListener('click', advance);
$('dex').addEventListener('click', closeDex);
$('dex-btn').addEventListener('click', e => { e.stopPropagation(); dexOpen() ? closeDex() : openDex(); });
$('view-btn').addEventListener('click', e => { e.stopPropagation(); toggleView(); });
$('mute').addEventListener('click', e => { e.stopPropagation(); toggleMute(); });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas || view !== 'fp' || paused) return;
  P.yaw -= e.movementX * 0.0025;
  P.pitch = clamp(P.pitch - e.movementY * 0.0025, -1.2, 1.2);
});

const stickEl = $('stick');
addEventListener('touchstart', e => {
  if (e.target.closest('button')) return;
  if (!started) { if ($('start-msg').dataset.ready) start(); return; }
  if (dialog.open) { advance(); return; }
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2 && stick.id === null) {
      Object.assign(stick, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 });
      stickEl.style.display = 'block';
      stickEl.style.left = t.clientX + 'px'; stickEl.style.top = t.clientY + 'px';
    } else if (t.clientX >= innerWidth / 2 && !lookTouch) {
      lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }
}, { passive: true });
addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) {
      const dx = t.clientX - stick.ox, dy = t.clientY - stick.oy, d = Math.hypot(dx, dy), m = Math.min(d, 50);
      stick.x = d ? (dx / d) * (m / 50) : 0; stick.y = d ? (dy / d) * (m / 50) : 0;
      stickEl.firstElementChild.style.transform = `translate(${stick.x * 35}px, ${stick.y * 35}px)`;
    } else if (lookTouch && t.identifier === lookTouch.id) {
      if (view === 'fp') {
        P.yaw -= (t.clientX - lookTouch.x) * 0.006;
        P.pitch = clamp(P.pitch - (t.clientY - lookTouch.y) * 0.006, -1.2, 1.2);
      }
      lookTouch.x = t.clientX; lookTouch.y = t.clientY;
    }
  }
}, { passive: true });
addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) {
      Object.assign(stick, { id: null, x: 0, y: 0 });
      stickEl.style.display = 'none';
      stickEl.firstElementChild.style.transform = '';
    }
    if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
  }
});
const tbtn = (id, down, up) => {
  $(id).addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
  if (up) $(id).addEventListener('touchend', up);
};
tbtn('t-jump', () => { jumpHeld = true; jumpPress(); }, () => { jumpHeld = false; });
tbtn('t-peck', peck);
tbtn('t-gobble', megaGobble);
tbtn('t-act', interact);

const nearArcade = () => Math.hypot(P.x - ARCADE_SPOT.x, P.z - ARCADE_SPOT.z) < 2.8 && P.y < 1;
const nearProf = () => Math.hypot(P.x - prof.root.position.x, P.z - prof.root.position.z) < 3.5 && P.y < 1;

// ---------- landmarks / area banner ----------
function discover() {
  if (P.y > 3) return;
  for (const L of marks.discovered(P.x, P.z)) {
    if (found.has(L.id)) continue;
    found.add(L.id);
    store.set('tc-found', [...found]);
    sfx.discover();
    addChaos(200, 'LANDMARK!', P.x, 3, P.z, { combo: false });
    const lines = [`★ NEW LANDMARK! ★\nRegistered ${L.name} in the LANDMARKDEX! (${found.size}/${LANDMARKS.length})`, L.fact];
    if (found.size === LANDMARKS.length) lines.push('You found every landmark in Harvard Square!');
    say(lines);
    return;
  }
}

let areaCheck = 0;
function updateArea(dt) {
  areaCheck -= dt;
  if (areaCheck > 0) return;
  areaCheck = 0.3;
  const road = world.roadAt(P.x, P.z);
  const name = areaAt(P.x, P.z) || (road && road.name ? road.name.toUpperCase() : null) || 'CAMBRIDGE';
  if (name !== pendingArea) { pendingArea = name; pendingSince = time; }
  if (pendingArea !== currentArea && time - pendingSince > 0.5) { currentArea = pendingArea; banner(currentArea); }
  if (!paused && started) discover();
  const prompt = $('prompt');
  if (nearArcade()) { prompt.textContent = `${isTouch ? 'TAP E' : 'PRESS E'}: PLAY TURKEY CROSSING`; prompt.classList.remove('hidden'); }
  else if (nearProf()) { prompt.textContent = `${isTouch ? 'TAP E' : 'PRESS E'}: TALK TO PROF. GOBBLEWORTH`; prompt.classList.remove('hidden'); }
  else prompt.classList.add('hidden');
}

// ---------- player update ----------
let lastWaterWarn = 0;
function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  ix += stick.x; iz += stick.y;
  const mag = Math.min(1, Math.hypot(ix, iz));
  let dx = 0, dz = 0;
  if (mag > 0.05) {
    const nx = ix / Math.hypot(ix, iz), nz = iz / Math.hypot(ix, iz);
    if (view === 'top') { dx = nx; dz = nz; }
    else {
      const f = -nz, r = nx;
      dx = -Math.sin(P.yaw) * f + Math.cos(P.yaw) * r;
      dz = -Math.cos(P.yaw) * f - Math.sin(P.yaw) * r;
    }
  }
  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || (isTouch && mag > 0.9);
  let speed = (sprinting ? (unlocked('sprint') ? SUPER_SPRINT : SPRINT) : WALK) * mag;
  if (sugar > 0) speed *= 1.35;
  const accel = P.grounded ? 14 : 5;
  if (P.tumble <= 0) {
    P.vx += (dx * speed - P.vx) * Math.min(1, dt * accel);
    P.vz += (dz * speed - P.vz) * Math.min(1, dt * accel);
  } else { P.vx *= 1 - dt * 1.5; P.vz *= 1 - dt * 1.5; }

  // vertical: jump, flap, glide, dive
  P.vy -= GRAVITY * dt;
  if (jumpHeld && P.vy < -2.5 && !P.diving) P.vy = -2.5;
  const ox = P.x, oz = P.z;
  const pos = { x: P.x + P.vx * dt, z: P.z + P.vz * dt };
  world.resolve(pos, 0.5, P.y);
  for (const p of peds.peds) {
    if (P.y > 1.5 || p.mode === 'down') continue;
    const ddx = pos.x - p.x, ddz = pos.z - p.z, d = Math.hypot(ddx, ddz);
    if (d < 0.85 && d > 1e-4) { pos.x = p.x + ddx / d * 0.85; pos.z = p.z + ddz / d * 0.85; }
  }
  P.x = clamp(pos.x, -BOUNDS, BOUNDS);
  P.z = clamp(pos.z, -BOUNDS, BOUNDS);
  P.y += P.vy * dt;
  const floor = world.groundAt(P.x, P.z, Math.max(P.y, 0));
  const wasAir = !P.grounded;
  if (P.y <= floor) {
    P.y = floor; P.vy = 0; P.grounded = true;
    if (wasAir && P.diving) { P.diving = false; shockwave(7, 'DIVE BOMB!', 150); addHeat(20); }
    P.tumble = 0;
  } else P.grounded = false;
  if (P.grounded) P.energy = Math.min(100, P.energy + 40 * dt);

  // water: turkeys can glide over the Charles, but not swim in it
  if (P.y < 0.3 && world.isWater(P.x, P.z) && !world.roadAt(P.x, P.z, 0.5)) {
    P.x = P.safeX; P.z = P.safeZ; P.vx = P.vz = 0;
    if (time - lastWaterWarn > 2) { lastWaterWarn = time; toast("TURKEYS CAN'T SWIM!"); sfx.splash(); burst(ox, 0.2, oz, 12, [0x6fb0ea, 0xffffff], 3); }
  } else if (P.grounded && P.y < 0.3) { P.safeX = P.x; P.safeZ = P.z; }

  const moving = Math.hypot(P.vx, P.vz);
  if (view === 'top' && moving > 0.5 && P.tumble <= 0) P.yaw = angleLerp(P.yaw, Math.atan2(-P.vx, -P.vz), Math.min(1, dt * 14));
  if (!P.grounded) turkey.flap(time); else turkey.animate(dt, moving);
  peckT = Math.max(0, peckT - dt);
  turkey.peck(peckT > 0 ? Math.sin((1 - peckT / 0.28) * Math.PI) : 0);
  P.invuln = Math.max(0, P.invuln - dt);

  // dust (and fire, once unlocked) when sprinting
  dustT -= dt;
  if (P.grounded && moving > 11 && dustT <= 0) {
    dustT = 0.05;
    const fire = unlocked('fire');
    burst(P.x - P.vx * 0.04, 0.15, P.z - P.vz * 0.04, fire ? 3 : 1, fire ? [0xff5a1f, 0xffc93c, 0xff2d1a] : [0xd9c7a5, 0xc9b996], 1.2, fire ? 0.3 : 0.22);
  }

  // corn
  for (let i = corn.length - 1; i >= 0; i--) {
    const c = corn[i];
    if (Math.hypot(c.x - P.x, c.z - P.z) < 1.6 && P.y < 1.5) {
      scene.remove(c.m); corn.splice(i, 1);
      cornTotal++; store.set('tc-corn-total', cornTotal);
      sfx.corn();
      addChaos(25, 'CORN', c.x, 1.5, c.z, { combo: false });
    }
  }
  // stolen food
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    f.age += dt;
    if (f.y > 0.15 || f.vy > 0) { f.vy -= 14 * dt; f.y = Math.max(0.15, f.y + f.vy * dt); f.x += f.vx * dt; f.z += f.vz * dt; if (f.y <= 0.15) f.vy = 0; }
    f.group.position.set(f.x, f.y + Math.sin(time * 4 + i) * 0.08, f.z);
    f.group.rotation.y += dt * 2;
    if (f.age > 0.5 && Math.hypot(f.x - P.x, f.z - P.z) < 1.7 && P.y < 1.8) {
      scene.remove(f.group); foods.splice(i, 1);
      sfx.corn();
      if (P.hp < 3) P.hp++;
      if (f.kind === 'coffee') { sugar = 6; toast('☕ CAFFEINE RUSH!'); }
      addChaos(60, `STOLE A ${f.kind.toUpperCase()}!`, f.x, 1.5, f.z, { combo: false });
    } else if (f.age > 40) { scene.remove(f.group); foods.splice(i, 1); }
  }
  // rampage tokens
  for (const t of tokens) {
    t.cooldown = Math.max(0, t.cooldown - dt);
    t.group.visible = t.cooldown <= 0;
    t.inner.rotation.y += dt * 3;
    t.inner.position.y = Math.sin(time * 3) * 0.3;
    if (!rampage && t.cooldown <= 0 && Math.hypot(t.x - P.x, t.z - P.z) < 2.2 && P.y < 3) startRampage(t);
  }
  if (rampage) {
    rampage.t -= dt;
    const el = $('rampage-hud');
    el.classList.remove('hidden');
    el.textContent = `RAMPAGE! BITES ${rampage.got}/${rampage.need} · ${Math.ceil(rampage.t)}s`;
    if (rampage.t <= 0) finishRampage(false);
  }
}

function updateCrime(dt) {
  comboTimer -= dt;
  if (comboTimer <= 0 && combo) { combo = 0; $('combo').textContent = ''; }
  gobbleCd = Math.max(0, gobbleCd - dt);
  sugar = Math.max(0, sugar - dt);
  // heat cools off when you lie low, faster if no officer is nearby
  if (time - lastCrime > 7 && heat > 0) {
    const watched = police.officers.some(o => Math.hypot(o.x - P.x, o.z - P.z) < 30 && o.stun <= 0);
    heat = Math.max(0, heat - (watched ? 6 : 18) * dt);
    const s = starsFor(heat);
    if (s !== stars) { stars = s; hud(); if (!s) toast('YOU LOST THEM!'); }
  }
  const r = police.update(dt, stars, P, time);
  setSiren(police.cruisers.length > 0 && !muted);
  if (r === 'busted') busted();
  else if (r) hurt(r);

  $('energy').firstElementChild.style.width = `${P.energy}%`;
  $('gobble-state').textContent = unlocked('gobble') ? (gobbleCd > 0 ? `GOBBLE ${Math.ceil(gobbleCd)}s` : 'Q: MEGA GOBBLE READY') : '';
}

// ---------- camera ----------
const camPos = new THREE.Vector3(P.x, 40, P.z + 20);
const look = new THREE.Vector3(P.x, 0, P.z);
function updateCamera(dt) {
  const fp = view === 'fp';
  turkey.root.visible = !fp && (P.invuln <= 0 || Math.floor(time * 12) % 2 === 0);
  marker.visible = !fp;
  for (const s of marks.topDownOnly) s.visible = !fp;
  const speed = Math.hypot(P.vx, P.vz);
  let sx = 0, sy = 0;
  if (shake > 0) { shake = Math.max(0, shake - dt * 1.8); sx = rand(-1, 1) * shake; sy = rand(-1, 1) * shake; }
  if (fp) {
    camera.near = 0.1;
    camera.fov += ((78 + speed * 0.8) - camera.fov) * Math.min(1, dt * 6);
    camera.position.set(P.x + sx * 0.3, P.y + 1.4, P.z + sy * 0.3);
    camera.rotation.set(P.pitch, P.yaw, 0);
  } else {
    camera.fov += ((50 + speed * 0.9) - camera.fov) * Math.min(1, dt * 4);
    const h = zoom + Math.max(0, P.y) * 0.9;
    const lead = 0.45;
    const tx = P.x + P.vx * lead, tz = P.z + P.vz * lead;
    camPos.lerp(new THREE.Vector3(tx, P.y + h, tz + h * 0.45), Math.min(1, dt * 4));
    // cutaway: slice off rooftops that would sit between the camera and the turkey
    camera.near = h * 0.55;
    look.lerp(new THREE.Vector3(tx, P.y * 0.8, tz), Math.min(1, dt * 6));
    camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
    camera.lookAt(look.x + sx * 0.5, look.y, look.z);
  }
  camera.updateProjectionMatrix();
  turkey.root.position.set(P.x, P.y, P.z);
  turkey.root.rotation.y = P.yaw;
  turkey.root.rotation.x = P.tumble > 0 ? time * 14 : 0;
  if (P.diving) turkey.root.rotation.x = -0.9;
  marker.position.set(P.x, P.y + 4.2 + Math.sin(time * 4) * 0.25, P.z);
  marker.scale.setScalar(clamp(zoom / 35, 0.6, 2.5));

  const sp = $('speech');
  if (speech && time - speech.at < 2 && speech.ped.group.parent) {
    tmpV.set(speech.ped.x, 2.3, speech.ped.z).project(camera);
    if (tmpV.z < 1) {
      sp.textContent = speech.text;
      sp.classList.remove('hidden');
      sp.style.left = `${(tmpV.x + 1) / 2 * innerWidth}px`;
      sp.style.top = `${(1 - tmpV.y) / 2 * innerHeight}px`;
    } else sp.classList.add('hidden');
  } else sp.classList.add('hidden');
}

const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const W = mm.canvas.width, span = 260;
  const s = minimap.scale, src = span * s;
  mm.fillStyle = '#d8d0bf';
  mm.fillRect(0, 0, W, W);
  mm.drawImage(minimap.canvas, (P.x + BOUNDS) * s - src / 2, (P.z + BOUNDS) * s - src / 2, src, src, 0, 0, W, W);
  const toMM = (x, z) => [W / 2 + (x - P.x) / span * W, W / 2 + (z - P.z) / span * W];
  const edge = (x, z) => { const [a, b] = toMM(x, z); return [clamp(a, 7, W - 7), clamp(b, 7, W - 7)]; };
  mm.fillStyle = '#333';
  for (const c of traffic.cars) { const [x, y] = toMM(c.x, c.z); mm.fillRect(x - 1.5, y - 1.5, 3, 3); }
  const flash = Math.floor(time * 6) % 2 === 0;
  mm.fillStyle = flash ? '#ff2020' : '#2060ff';
  for (const o of [...police.officers, ...police.cruisers]) { const [x, y] = edge(o.x, o.z); mm.beginPath(); mm.arc(x, y, 3.5, 0, 7); mm.fill(); }
  mm.font = '10px "Press Start 2P"'; mm.textAlign = 'center'; mm.textBaseline = 'middle';
  for (const L of LANDMARKS) {
    const [x, y] = edge(L.at[0], L.at[1]);
    mm.fillStyle = found.has(L.id) ? '#e0a800' : '#7a5aa0';
    mm.fillText(found.has(L.id) ? '★' : '?', x, y);
  }
  for (const t of tokens) {
    if (t.cooldown > 0) continue;
    const [x, y] = edge(t.x, t.z);
    mm.fillStyle = '#ff3b30'; mm.fillRect(x - 4, y - 4, 8, 8);
  }
  const [ax, ay] = toMM(ARCADE_SPOT.x, ARCADE_SPOT.z);
  mm.fillStyle = '#39c46a'; mm.fillRect(ax - 3, ay - 3, 6, 6);
  mm.save();
  mm.translate(W / 2, W / 2);
  mm.rotate(-P.yaw);
  mm.fillStyle = '#ff3b30'; mm.strokeStyle = '#fff'; mm.lineWidth = 2;
  mm.beginPath(); mm.moveTo(0, -8); mm.lineTo(6, 6); mm.lineTo(-6, 6); mm.closePath(); mm.stroke(); mm.fill();
  mm.restore();
}

// ---------- main loop ----------
const clock = new THREE.Clock();
const focus = new THREE.Vector3();
let clockShown = -1;
function frame() {
  const rawDt = Math.min(clock.getDelta(), 0.05);
  time += rawDt;
  let dt = rawDt;
  if (freeze > 0) { freeze -= rawDt; dt = rawDt * 0.05; }
  if (!paused) {
    updatePlayer(dt);
    const hit = traffic.update(dt, P, () => sfx.honk(), time);
    if (hit) hurt(hit);
    peds.update(dt, P, speak);
    updateCrime(dt);
  } else if (!started) {
    traffic.update(dt, { x: P.x, z: P.z, y: 99 }, () => {}, time);
    peds.update(dt, P, () => {});
  }
  updateArea(dt);
  for (const c of corn) { c.m.rotation.y += dt * 2; c.m.position.y = 0.2 + Math.sin(time * 3 + c.x) * 0.15; }
  for (const s of marks.shells) s.position.y = 0.1 + Math.sin(time * 1.5 + s.position.x) * 0.05;
  prof.animate(dt, 0);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vy -= 12 * dt;
    p.vx *= 0.98; p.vz *= 0.98;
    p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.6 * dt;
    p.m.scale.multiplyScalar(p.life < 0.3 ? 0.92 : 1);
    if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    const k = r.t / 0.45;
    r.m.scale.setScalar(1 + k * r.r);
    r.m.material.opacity = Math.max(0, 0.9 * (1 - k));
    if (k >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
  }
  updateCamera(rawDt);
  gfx.update(dt, focus.set(P.x, P.y, P.z));
  world.update(dt, time, gfx.state.night, P);
  setNightLights(gfx.state.night);
  updateFloaters(rawDt);
  drawMinimap();
  if (time - clockShown > 1) { clockShown = time; $('clock').textContent = gfx.clockText(); }
  gfx.render(rawDt);
  requestAnimationFrame(frame);
}

if (params.has('debug')) window.__tc = { P, traffic, peds, police, world, addHeat, addChaos };
$('start-msg').textContent = isTouch ? '▶ TAP TO START' : '▶ PRESS ANY KEY OR CLICK';
$('start-msg').dataset.ready = '1';
frame();
