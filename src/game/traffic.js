// Cars drive the real street graph (respecting one-way streets); students walk the real footpaths.
import { makeVehicle, makePerson } from './models.js';
import { pick, rand, angleLerp } from './util.js';

const MAX_CARS = 48;
const MAX_PEDS = 50;

export class Traffic {
  constructor(scene, data) {
    this.scene = scene;
    this.cars = [];
    this.out = new Map();   // node key -> outgoing edges
    this.edges = [];
    this.majorEdges = [];
    const key = (x, z) => `${x},${z}`;
    for (const r of data.roads) {
      if (!r.d) continue;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [ax, az] = r.p[i], [bx, bz] = r.p[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        const add = (ax, az, bx, bz) => {
          const e = { ax, az, bx, bz, len, dx: (bx - ax) / len, dz: (bz - az) / len, lane: r.o ? 0 : r.w / 4,
            from: key(ax, az), to: key(bx, bz), name: r.n, major: r.w >= 11 };
          this.edges.push(e);
          if (e.major) this.majorEdges.push(e);
          if (!this.out.has(e.from)) this.out.set(e.from, []);
          this.out.get(e.from).push(e);
        };
        add(ax, az, bx, bz);
        if (!r.o) add(bx, bz, ax, az);
      }
    }
  }

  spawn(px, pz) {
    for (let tries = 0; tries < 30; tries++) {
      // mostly on the main roads (Mass Ave, JFK, Brattle, Mt Auburn...), close enough to matter
      const e = pick(Math.random() < 0.75 ? this.majorEdges : this.edges);
      const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2;
      const d = Math.hypot(mx - px, mz - pz);
      if (d < 40 || d > 150) continue;
      const r = Math.random();
      const kind = r < 0.1 ? 'bus' : r < 0.15 ? 'shuttle' : r < 0.25 ? 'truck' : r < 0.42 ? 'taxi' : 'car';
      const v = makeVehicle(kind);
      const cruise = kind === 'bus' || kind === 'shuttle' || kind === 'truck' ? rand(7, 9) : rand(9, 12.5);
      const car = { ...v, edge: e, t: rand(0, e.len), speed: cruise, cruise, x: 0, z: 0, yaw: 0,
        aggressive: Math.random() < 0.15, honkAt: 0 };
      this.place(car, true);
      this.scene.add(v.group);
      this.cars.push(car);
      return;
    }
  }

  place(car, snap) {
    const e = car.edge;
    car.dirx = e.dx; car.dirz = e.dz;
    car.x = e.ax + e.dx * car.t - e.dz * e.lane;
    car.z = e.az + e.dz * car.t + e.dx * e.lane;
    const yaw = Math.atan2(-e.dx, -e.dz);
    car.yaw = snap ? yaw : angleLerp(car.yaw, yaw, 0.2);
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.yaw;
  }

  next(car) {
    const e = car.edge;
    const opts = (this.out.get(e.to) || []).filter(n => !(n.to === e.from && n.bx === e.ax && n.bz === e.az));
    const all = opts.length ? opts : (this.out.get(e.to) || []);
    if (!all.length) return null;
    // mostly keep going straight, sometimes turn
    const weights = all.map(n => Math.max(0.15, n.dx * e.dx + n.dz * e.dz + 1.1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < all.length; i++) { r -= weights[i]; if (r <= 0) return all[i]; }
    return all[0];
  }

  // Returns the car that hit the player this frame, if any. onHonk(car) is called when a car
  // brakes for the turkey.
  update(dt, player, onHonk, now) {
    while (this.cars.length < MAX_CARS) this.spawn(player.x, player.z);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (Math.hypot(c.x - player.x, c.z - player.z) > 190) {
        this.scene.remove(c.group);
        this.cars.splice(i, 1);
      }
    }
    let hit = null;
    for (const c of this.cars) {
      const rx = -c.dirz, rz = c.dirx; // right-hand normal
      let want = c.cruise;
      // brake for the turkey (unless it's a Boston driver in a hurry)
      const px = player.x - c.x, pz = player.z - c.z;
      const along = px * c.dirx + pz * c.dirz, lat = px * rx + pz * rz;
      if (!c.aggressive && along > 0 && along < 16 && Math.abs(lat) < c.width / 2 + 1.2) {
        want = Math.min(want, Math.max(0, along - c.length / 2 - 2.5) * 1.3);
        if (now - c.honkAt > 2.5 && along < 12) { c.honkAt = now; onHonk(c); }
      }
      // keep a gap to the car ahead
      for (const o of this.cars) {
        if (o === c) continue;
        const ox = o.x - c.x, oz = o.z - c.z;
        if (Math.abs(ox) > 25 || Math.abs(oz) > 25) continue;
        const a = ox * c.dirx + oz * c.dirz, l = ox * rx + oz * rz;
        if (a > 0 && a < 22 && Math.abs(l) < 1.8 && o.dirx * c.dirx + o.dirz * c.dirz > 0.3) {
          want = Math.min(want, Math.max(0, a - (c.length + o.length) / 2 - 2) * 1.5);
        }
      }
      c.speed += Math.max(-12 * dt, Math.min(4 * dt, want - c.speed));
      c.t += c.speed * dt;
      while (c.t > c.edge.len) {
        const n = this.next(c);
        if (!n) { c.t = c.edge.len; c.speed = 0; break; }
        c.t -= c.edge.len;
        c.edge = n;
      }
      this.place(c, false);

      if (c.speed > 1.5 && player.y < 1.5 && Math.abs(along) < c.length / 2 + 0.35 && Math.abs(lat) < c.width / 2 + 0.35) hit = c;
    }
    return hit;
  }
}

const CALM = ['Aww, a turkey!', 'Is that turkey following me?', 'Go Crimson!', "Don't make eye contact...",
  'Classic Cambridge.', 'Late for section!', 'They own this town.', 'Wait, can I get a selfie?'];
const SCARED = ['AAAAH!', 'IT BIT ME!', 'MY SANDWICH!', 'RUN!!', 'NOT AGAIN!', 'CALL ANIMAL CONTROL!', 'THE TURKEYS ARE REVOLTING!',
  'WHY IS IT SO BIG?!', 'I HAVE A MIDTERM!', 'SAVE THE COFFEE!'];

// Pedestrians walk the real footpaths until a turkey ruins their day.
// modes: walk -> (bitten) down -> flee -> idle; walk -> (panic) flee
export class Pedestrians {
  constructor(scene, data, world) {
    this.scene = scene;
    this.world = world;
    this.paths = data.paths.map(p => {
      const segs = [];
      let total = 0;
      for (let i = 0; i < p.p.length - 1; i++) {
        const [ax, az] = p.p[i], [bx, bz] = p.p[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        segs.push({ ax, az, bx, bz, len, s0: total });
        total += len;
      }
      return { segs, total };
    }).filter(p => p.total > 25);
    this.peds = [];
    this.max = 60;
  }

  pointAt(path, s) {
    for (const g of path.segs) {
      if (s <= g.s0 + g.len) {
        const t = (s - g.s0) / (g.len || 1);
        return [g.ax + (g.bx - g.ax) * t, g.az + (g.bz - g.az) * t, g.bx - g.ax, g.bz - g.az];
      }
    }
    const g = path.segs[path.segs.length - 1];
    return [g.bx, g.bz, g.bx - g.ax, g.bz - g.az];
  }

  spawnNear(px, pz, minD = 30, maxD = 150) {
    for (let tries = 0; tries < 20; tries++) {
      const path = pick(this.paths);
      const s = rand(0, path.total);
      const [x, z] = this.pointAt(path, s);
      const d = Math.hypot(x - px, z - pz);
      if (d < minD || d > maxD) continue;
      const m = makePerson();
      this.scene.add(m.group);
      const p = { ...m, path, s, dir: Math.random() < 0.5 ? 1 : -1, speed: rand(1.1, 1.6), off: rand(-0.6, 0.6),
        x, z, mode: 'walk', timer: 0, spoke: 0, fall: 0 };
      this.peds.push(p);
      return p;
    }
    return null;
  }

  // A turkey bit this person.
  bite(p, fromX, fromZ) {
    p.mode = 'down';
    p.timer = 1.6;
    p.fromX = fromX; p.fromZ = fromZ;
    p.hits = (p.hits || 0) + 1;
  }

  // Everyone within radius runs away from (x, z).
  panic(x, z, radius, knockRadius = 0) {
    const hit = [];
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < knockRadius && p.mode !== 'down') { this.bite(p, x, z); hit.push(p); }
      else if (d < radius && (p.mode === 'walk' || p.mode === 'idle')) { p.mode = 'flee'; p.timer = rand(4, 7); p.fromX = x; p.fromZ = z; }
    }
    return hit;
  }

  update(dt, player, onSpeak) {
    for (let n = 0; this.peds.length < this.max && n < 3; n++) this.spawnNear(player.x, player.z);
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const dist = Math.hypot(p.x - player.x, p.z - player.z);
      if (dist > 190) { this.scene.remove(p.group); this.peds.splice(i, 1); continue; }
      let moveSpeed = 0;
      if (p.mode === 'walk') {
        const stopped = dist < 2.2;
        if (!stopped) {
          p.s += p.dir * p.speed * dt;
          if (p.s < 0 || p.s > p.path.total) { p.dir *= -1; p.s = Math.max(0, Math.min(p.path.total, p.s)); }
        }
        const [x, z, dx, dz] = this.pointAt(p.path, p.s);
        const l = Math.hypot(dx, dz) || 1;
        p.x = x - (dz / l) * p.off; p.z = z + (dx / l) * p.off;
        const face = stopped ? Math.atan2(-(player.x - p.x), -(player.z - p.z)) : Math.atan2(-dx * p.dir, -dz * p.dir);
        p.group.rotation.y = angleLerp(p.group.rotation.y, face, Math.min(1, dt * 8));
        moveSpeed = stopped ? 0 : p.speed;
        if (dist < 3 && !p.spoke) { p.spoke = 1; onSpeak(p, pick(CALM)); }
      } else if (p.mode === 'down') {
        p.timer -= dt;
        p.fall = Math.min(1, p.fall + dt * 8);
        if (p.timer <= 0) { p.mode = 'flee'; p.timer = rand(5, 8); onSpeak(p, pick(SCARED)); }
      } else if (p.mode === 'flee') {
        p.timer -= dt;
        p.fall = Math.max(0, p.fall - dt * 5);
        // run away from the turkey (or wherever the chaos happened)
        const fx = p.x - (dist < 25 ? player.x : p.fromX), fz = p.z - (dist < 25 ? player.z : p.fromZ);
        const fl = Math.hypot(fx, fz) || 1;
        const pos = { x: p.x + (fx / fl) * 5.5 * dt, z: p.z + (fz / fl) * 5.5 * dt };
        this.world.resolve(pos, 0.35);
        if (this.world.isWater(pos.x, pos.z)) { pos.x = p.x; pos.z = p.z; }
        p.x = pos.x; p.z = pos.z;
        p.group.rotation.y = angleLerp(p.group.rotation.y, Math.atan2(-fx, -fz), Math.min(1, dt * 10));
        moveSpeed = 5.5;
        if (p.timer <= 0) p.mode = 'idle';
      } else {
        p.group.rotation.y = angleLerp(p.group.rotation.y, Math.atan2(-(player.x - p.x), -(player.z - p.z)), Math.min(1, dt * 3));
      }
      p.group.position.set(p.x, p.fall * 0.25, p.z);
      p.group.rotation.x = -p.fall * Math.PI / 2;
      p.animate(dt, moveSpeed);
    }
  }
}

// Animal Control officers on foot, and HUPD cruisers once things get serious.
export class Police {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.officers = [];
    this.cruisers = [];
  }

  clear() {
    for (const o of this.officers) this.scene.remove(o.group);
    for (const c of this.cruisers) this.scene.remove(c.group);
    this.officers = []; this.cruisers = [];
  }

  spawnPoint(px, pz, minD, maxD) {
    for (let tries = 0; tries < 40; tries++) {
      const a = rand(0, Math.PI * 2), d = rand(minD, maxD);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (!this.world.insideBuilding(x, z) && !this.world.isWater(x, z)) return [x, z];
    }
    return null;
  }

  // Returns 'busted' if an officer grabbed the turkey, or the cruiser that rammed it.
  update(dt, stars, player, time) {
    const wantOfficers = stars === 0 ? 0 : Math.min(2 + stars * 2, 10);
    const wantCruisers = stars >= 3 ? stars - 2 : 0;
    if (this.officers.length < wantOfficers) {
      const at = this.spawnPoint(player.x, player.z, 35, 60);
      if (at) {
        const m = makePerson(true);
        this.scene.add(m.group);
        this.officers.push({ ...m, x: at[0], z: at[1], stun: 0, fall: 0 });
      }
    }
    if (this.cruisers.length < wantCruisers) {
      const at = this.spawnPoint(player.x, player.z, 55, 80);
      if (at) {
        const v = makeVehicle('police');
        this.scene.add(v.group);
        this.cruisers.push({ ...v, x: at[0], z: at[1], yaw: Math.atan2(-(player.x - at[0]), -(player.z - at[1])), speed: 0, stuck: 0 });
      }
    }
    // Officers give up and leave once the heat is gone
    if (stars === 0) this.clear();
    while (this.officers.length > wantOfficers + 2) this.scene.remove(this.officers.shift().group);
    while (this.cruisers.length > wantCruisers) this.scene.remove(this.cruisers.shift().group);

    let result = null;
    const runSpeed = 7.5 + stars * 0.9;
    for (const o of this.officers) {
      const dx = player.x - o.x, dz = player.z - o.z, d = Math.hypot(dx, dz);
      if (o.stun > 0) {
        o.stun -= dt;
        o.fall = Math.min(1, o.fall + dt * 8);
      } else {
        o.fall = Math.max(0, o.fall - dt * 4);
        const pos = { x: o.x + (dx / (d || 1)) * runSpeed * dt, z: o.z + (dz / (d || 1)) * runSpeed * dt };
        this.world.resolve(pos, 0.35);
        o.x = pos.x; o.z = pos.z;
        o.group.rotation.y = angleLerp(o.group.rotation.y, Math.atan2(-dx, -dz), Math.min(1, dt * 10));
        if (d < 1.3 && player.y < 1.8) result = 'busted';
      }
      o.group.position.set(o.x, o.fall * 0.25, o.z);
      o.group.rotation.x = -o.fall * Math.PI / 2;
      o.animate(dt, o.stun > 0 ? 0 : runSpeed);
    }
    for (const c of this.cruisers) {
      const dx = player.x - c.x, dz = player.z - c.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(-dx, -dz);
      const turn = Math.atan2(Math.sin(want - c.yaw), Math.cos(want - c.yaw));
      if (c.stuck > 0) { c.stuck -= dt; c.speed = -6; c.yaw += 1.5 * dt; }
      else { c.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, turn)); c.speed = Math.min(c.speed + 14 * dt, 15 + stars * 1.5); }
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      const pos = { x: c.x + fx * c.speed * dt, z: c.z + fz * c.speed * dt };
      const hitWall = this.world.resolve(pos, 1.6);
      if (hitWall && c.stuck <= 0 && Math.hypot(pos.x - c.x, pos.z - c.z) < c.speed * dt * 0.3) c.stuck = 0.8;
      c.x = pos.x; c.z = pos.z;
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = c.yaw;
      c.dirx = fx; c.dirz = fz;
      const flash = Math.floor(time * 8) % 2 === 0;
      c.group.userData.lights[0].visible = flash; c.group.userData.lights[1].visible = !flash;
      const along = dx * fx + dz * fz, lat = dx * -fz + dz * fx;
      if (Math.abs(along) < c.length / 2 + 0.5 && Math.abs(lat) < c.width / 2 + 0.5 && player.y < 1.6 && c.speed > 3) result = c;
    }
    return result;
  }

  // A peck or shockwave knocks officers down for a few seconds.
  stunNear(x, z, radius) {
    let n = 0;
    for (const o of this.officers) if (o.stun <= 0 && Math.hypot(o.x - x, o.z - z) < radius) { o.stun = 3.5; n++; }
    return n;
  }
}
