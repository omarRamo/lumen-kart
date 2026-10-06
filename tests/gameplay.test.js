import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHARACTERS, CLASSES, DIFFICULTY, PHYSICS, normalizeDifficulty } from '../src/config.js';
import { bus } from '../src/events.js';
import { Kart, resolveKartCollisions } from '../src/kart.js';
import { RaceManager } from '../src/race.js';
import { HazardSystem } from '../src/hazards.js';
import { AIDriver } from '../src/ai.js';
import { createTrack } from '../src/track.js';
import { TRACKS } from '../src/tracks.js';

const track = {
  id: 'test-circuit', roadWidth: 24, length: 2000,
  getPointAt: (t) => new THREE.Vector3(0, 0, t * 2000),
  getTangentAt: () => new THREE.Vector3(0, 0, 1),
  getSurfaceInfo: (p) => ({ t: p.z / 2000, height: 0, lateral: -p.x }),
};

test('difficulty levels are canonical, legacy names map, engine classes change driving challenge', () => {
  assert.deepEqual(Object.keys(DIFFICULTY), ['easy', 'normal', 'hard', 'extreme']);
  assert.equal(normalizeDifficulty('medium'), 'normal');
  assert.equal(normalizeDifficulty('bogus'), 'normal');
  assert.equal(DIFFICULTY.medium, DIFFICULTY.normal, 'online rooms may still send medium');
  const karts = CLASSES.filter((c) => !c.mirror).map((c) => { const k = new Kart({ difficulty: c.ai }); k.applyClass(c.speed); return k; });
  for (let i = 1; i < karts.length; i++) assert.ok(karts[i - 1].topSpeed < karts[i].topSpeed, `${CLASSES[i].id} is faster`);
  karts.forEach((k) => k.dispose());
});

test('track hazards animate deterministically and guest updates never touch karts', () => {
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {}, set: () => true });
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    const scene = new THREE.Scene();
    const circuit = createTrack(scene, null, { trackId: 'sunset-canyon' });
    const kart = { position: new THREE.Vector3(), velocity: new THREE.Vector3(0, 0, 20), radius: 1.3, applyHit() { this.hit = true; } };
    const a = new HazardSystem({ scene, track: circuit, karts: [kart] });
    const b = new HazardSystem({ scene, track: circuit, karts: [] });
    a.update(1 / 60, 17.25, { collisions: false }); b.update(0.001, 17.25);
    assert.deepEqual(a.items.map((h) => h.pos.toArray()), b.items.map((h) => h.pos.toArray()));
    const boulder = a.items.find((h) => h.type === 'boulder');
    kart.position.copy(boulder.pos);
    const before = kart.position.clone();
    a.update(1 / 60, 17.25, { collisions: false });
    assert.ok(kart.position.equals(before)); assert.equal(kart.hit, undefined);
    a.update(1 / 60, 17.25);
    assert.equal(kart.hit, true);
    a.dispose(); b.dispose(); circuit.dispose();
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});

test('reverse driving triggers wrong-way regardless of nose direction', () => {
  const kart = { heading: 0, speed: -8, velocity: new THREE.Vector3(0, 0, -8), trackT: 0.2 };
  const race = new RaceManager({ track, karts: [kart], player: kart, silent: true });
  race.startImmediately();
  for (let i = 0; i < 70; i++) race.update(1 / 60);
  assert.equal(race.wrongWay, true);
  kart.velocity.z = 8; kart.speed = 8;
  for (let i = 0; i < 30; i++) race.update(1 / 60);
  assert.equal(race.wrongWay, false);
});

test('finish freezes lap data and reversing across the finish cannot earn a lap', () => {
  const kart = { trackT: 0.98 };
  const race = new RaceManager({ track, karts: [kart], laps: 1, silent: true });
  kart._prevT = 0.98;
  race.startImmediately();
  const move = (t) => { kart.trackT = t; race.update(0.1); };
  move(0.01); // Initial start-line crossing.
  move(0.99); move(0.01);
  assert.equal(kart._lapCount, 1);
  assert.equal(kart.lapTimes.length, 0);
  for (let t = 0.03; t < 1; t += 0.02) move(t);
  move(0.01);
  assert.equal(kart.finished, true);
  const laps = kart.lapTimes.slice(), finish = kart.finishTime;
  for (let i = 0; i < 3; i++) {
    for (let t = 0.03; t < 1; t += 0.02) move(t);
    move(0.01);
  }
  assert.deepEqual(kart.lapTimes, laps); assert.equal(kart.finishTime, finish);
});

test('rocket start duration is measured with simulation time', () => {
  const kart = new Kart({ isPlayer: true });
  kart.input.throttle = 1; kart.time = 8; kart._countdown.holdStart = 7.5;
  kart._onGo();
  assert.equal(kart.boostSource, 'start'); assert.equal(kart.boostTimer, 1.2);
  kart.dispose();
});


test('all eight AI characters finish a real lap on every course and level, hazards included', (t) => {
  const originalDocument = globalThis.document, originalRandom = Math.random;
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  let seed = 7831;
  Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  try {
    for (const id of TRACKS.map((t) => t.id)) {
      for (const difficulty of ['easy', 'normal', 'hard']) {
        const scene = new THREE.Scene();
        const circuit = createTrack(scene, null, { trackId: id, difficulty });
        const karts = CHARACTERS.map((character, index) => new Kart({ scene, track: circuit, character, index, difficulty,
          model: { root: new THREE.Group(), animate() {}, dispose() {} } }));
        const drivers = karts.map((kart) => new AIDriver(kart, circuit, { difficulty }));
        const race = new RaceManager({ track: circuit, karts, laps: 1, silent: true });
        const hazards = new HazardSystem({ scene, track: circuit, karts });
        try {
          race.placeOnGrid(); race.startImmediately();
          const dt = 1 / 60;
          let tick = 0;
          for (; tick < 240 * 60 && karts.some((kart) => !kart.finished); tick++) {
            const ctx = { karts, itemSystem: { getHazards: () => hazards.getHazards() }, time: tick * dt };
            for (const driver of drivers) driver.update(dt, ctx);
            for (const kart of karts) kart.update(dt);
            resolveKartCollisions(karts);
            hazards.update(dt, tick * dt);
            race.update(dt);
          }
          for (const kart of karts) {
            assert.equal(kart.finished, true, `${id}/${difficulty}/${kart.character.id} stuck at t=${kart.trackT}`);
            assert.equal(kart.lapTimes.length, 1, 'finished lap records remain frozen');
            assert.ok(Number.isFinite(kart.finishTime) && kart.finishTime > 0);
          }
          t.diagnostic(`${id}/${difficulty}: 8/8 finish, last ${(tick * dt).toFixed(2)} s`);
        } finally {
          drivers.forEach((driver) => driver.dispose());
          karts.forEach((kart) => kart.dispose());
          hazards.dispose(); circuit.dispose(); race.dispose();
        }
      }
    }
  } finally {
    Math.random = originalRandom;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

// ---------------------------------------------------------------------------------------------
// Lumen Kart gameplay: steering assist, drift entry, mini-turbo windows, walls, hit-stop, items, AI
// ---------------------------------------------------------------------------------------------
function withCanvasStub(fn) {
  const originalDocument = globalThis.document;
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try { return fn(); } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
}
const stubModel = () => ({ root: new THREE.Group(), animate() {}, dispose() {} });
const drive = (kart, input) => { kart.input = { throttle: 1, brake: 0, steer: 0, drift: false, item: false, lookBack: false, ...input }; kart.update(1 / 60); };

// Straight synthetic road along +Z (paved half-width 12 m) with a barrier 10 m to the driver's left (+X side).
const wallTrack = {
  id: 'wall-test', roadWidth: 24, length: 4000,
  getPointAt: (t) => new THREE.Vector3(0, 0, t * 4000),
  getTangentAt: () => new THREE.Vector3(0, 0, 1),
  getSurfaceInfo: (p) => ({ t: (((p.z / 4000) % 1) + 1) % 1, height: 0, lateral: -p.x, surface: 'road', onRoad: true }),
  resolveWall: (p, r = 1.3) => (p.x + r > 10 ? { normal: new THREE.Vector3(-1, 0, 0), depth: p.x + r - 10 } : null),
};

test('steering assist: throttle only, the player stays on the road for a full lap of every course (50cc and 100cc)', (t) => {
  withCanvasStub(() => {
    for (const def of TRACKS) {
      for (const [classId, scale, difficulty] of [['50cc', 0.86, 'easy'], ['100cc', 1.0, 'normal']]) {
        const scene = new THREE.Scene();
        const circuit = createTrack(scene, null, { def });
        const run = (assist) => {
          const kart = new Kart({ scene, track: circuit, character: CHARACTERS[0], isPlayer: true, difficulty, model: stubModel() });
          kart.applyClass(scale);
          kart.assist = { steering: assist, strength: 0.6 };
          const start = circuit.startPositions[0];
          kart.reset(start.position, start.heading);
          let progress = 0, prev = kart.trackT, offroad = 0, falls = 0, frames = 0;
          for (; frames < 150 * 60 && progress < 1.01; frames++) {
            drive(kart, {});
            let d = kart.trackT - prev; d -= Math.round(d); progress += d; prev = kart.trackT;
            if (!kart.airborne && kart.surface === 'offroad') offroad++;
            if (kart.fallTimer > 0) falls++;
          }
          kart.dispose();
          return { progress, offroad, falls, seconds: frames / 60 };
        };
        const on = run(true);
        assert.ok(on.progress >= 1, `${def.id}/${classId}: assisted kart completes the lap (${on.progress.toFixed(2)})`);
        assert.equal(on.offroad, 0, `${def.id}/${classId}: assisted kart never leaves the road`);
        assert.equal(on.falls, 0, `${def.id}/${classId}: assisted kart never falls`);
        const off = run(false);
        assert.ok(off.offroad > 60 || off.progress < 1, `${def.id}/${classId}: without assist a hands-off kart does leave the road`);
        t.diagnostic(`${def.id}/${classId}: assisted lap ${on.seconds.toFixed(1)} s`);
        circuit.dispose();
      }
    }
  });
});

test('steering assist defaults off and its edge guard keeps a kart steered at the verge on the road', () => {
  // same straight road, but with 2 m of verge before the barrier (like the real courses)
  const verge = { ...wallTrack, resolveWall: (p, r = 1.3) => (p.x + r > 14 ? { normal: new THREE.Vector3(-1, 0, 0), depth: p.x + r - 14 } : null) };
  const kart = new Kart({ isPlayer: true, track: verge });
  assert.deepEqual(Object.keys(kart.assist).sort(), ['steering', 'strength']);
  assert.equal(kart.assist.steering, false);
  kart.reset(new THREE.Vector3(0, 0, 10), 0);
  for (let i = 0; i < 120; i++) drive(kart, {});
  kart.assist = { steering: true, strength: 1 };
  // steering hard toward the barrier: the edge guard must keep us off it
  let bumps = 0;
  const off = bus.on('kart:wallBump', () => { bumps++; });
  for (let i = 0; i < 240; i++) drive(kart, { steer: -1 });
  off();
  assert.ok(kart.position.x < 12, `edge guard holds the kart on the paved road (x=${kart.position.x.toFixed(2)})`);
  assert.equal(kart.surface, 'road');
  assert.equal(bumps, 0);
  kart.dispose();
});

test('drift entry works with "drift held + any steer", even when the steer comes late', () => {
  const kart = new Kart({ isPlayer: true, track: wallTrack, difficulty: 'normal' });
  kart.reset(new THREE.Vector3(-4, 0, 10), 0);
  for (let i = 0; i < 120; i++) drive(kart, {});
  for (let i = 0; i < 45; i++) drive(kart, { drift: true }); // hop and land with no steering
  assert.equal(kart.drifting, false);
  for (let i = 0; i < 3; i++) drive(kart, { drift: true, steer: 0.25 });
  assert.equal(kart.drifting, true, 'a small steer while still holding drift commits the drift');
  assert.equal(kart.driftDir, 1);
  kart.dispose();
});

test('mini-turbo windows are more generous at 50/100cc and the boost escalates by stage', () => {
  const charge = (difficulty) => {
    const kart = new Kart({ isPlayer: true, track: wallTrack, difficulty });
    kart.reset(new THREE.Vector3(-4, 0, 10), 0);
    for (let i = 0; i < 120; i++) drive(kart, {});
    for (let i = 0; i < 20; i++) drive(kart, { drift: true, steer: 0.5 });
    for (let i = 0; i < 60; i++) drive(kart, { drift: true, steer: 0.5 });
    const c = kart.driftCharge;
    kart.dispose();
    return c;
  };
  const easy = charge('easy'), normal = charge('normal'), hard = charge('hard');
  assert.ok(easy > normal && normal > hard, `charge 50cc ${easy.toFixed(2)} > 100cc ${normal.toFixed(2)} > 150cc ${hard.toFixed(2)}`);
  const times = PHYSICS.miniTurboTimes;
  assert.ok(times[0] < times[1] && times[1] < times[2], 'mint < dawn < comet violet');
});

test('glancing wall contact keeps speed, head-on contact bounces', () => {
  const hitWall = (angle) => {
    const kart = new Kart({ track: wallTrack });
    kart.reset(new THREE.Vector3(10 - kart.radius - 0.05, 0, 10), angle);
    kart.velocity.set(Math.sin(angle) * 30, 0, Math.cos(angle) * 30);
    kart.speed = 30;
    const before = Math.hypot(kart.velocity.x, kart.velocity.z);
    for (let i = 0; i < 6; i++) drive(kart, { throttle: 0 });
    const after = Math.hypot(kart.velocity.x, kart.velocity.z);
    kart.dispose();
    return after / before;
  };
  const glance = hitWall(0.18), headOn = hitWall(1.3);
  assert.ok(glance > 0.93, `shallow contact keeps ${(glance * 100).toFixed(0)} % of its speed`);
  assert.ok(headOn < 0.7, `head-on contact loses speed (${(headOn * 100).toFixed(0)} % kept)`);
});

test('item hits freeze the victim briefly (hit-stop) and emit haptic + hit-stop events', () => {
  const kart = new Kart({ isPlayer: true, track: wallTrack });
  kart.reset(new THREE.Vector3(-4, 0, 10), 0);
  for (let i = 0; i < 60; i++) drive(kart, {});
  const events = [];
  const offs = ['haptic', 'kart:hitStop', 'kart:hit'].map((name) => bus.on(name, (d) => events.push([name, d])));
  assert.equal(kart.applyHit('tumble'), true);
  offs.forEach((o) => o());
  assert.ok(events.some(([n, d]) => n === 'haptic' && d.style === 'heavy' && d.source === 'hit'));
  assert.ok(events.some(([n, d]) => n === 'kart:hitStop' && d.duration > 0));
  const z = kart.position.z;
  drive(kart, {});
  assert.equal(kart.position.z, z, 'frozen during hit-stop');
  for (let i = 0; i < 10; i++) drive(kart, {});
  assert.notEqual(kart.position.z, z, 'resumes afterwards');
  kart.dispose();
});

test('item odds per position: leader defends, the back catches up, 50cc spares the leader', async () => {
  const { itemOdds, ITEM_ORDER, ItemSystem } = await import('../src/items.js');
  const attack = ['red_shell', 'blue_shell', 'lightning', 'bomb', 'bullet', 'star'];
  const catchUp = (o) => o.mushroom + o.triple_mushroom + o.star + o.bullet;
  for (const difficulty of ['easy', 'normal', 'hard', 'extreme']) {
    for (let place = 1; place <= 8; place++) {
      const o = itemOdds(place, 8, difficulty);
      const sum = ITEM_ORDER.reduce((s, id) => s + o[id], 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `${difficulty} P${place} sums to 1`);
    }
    const first = itemOdds(1, 8, difficulty), last = itemOdds(8, 8, difficulty), mid = itemOdds(4, 8, difficulty);
    for (const id of attack) assert.equal(first[id], 0, `1st never rolls ${id}`);
    assert.equal(first.blue_shell, 0);
    assert.ok(first.horn > 0.05, 'the leader can answer a shooting star with a Résonance');
    assert.ok(catchUp(last) > 0.7 && catchUp(last) > catchUp(mid) && catchUp(mid) > catchUp(first), `${difficulty}: catch-up grows toward the back`);
  }
  const easy4 = itemOdds(4, 8, 'easy'), hard4 = itemOdds(4, 8, 'hard');
  assert.ok(easy4.blue_shell < hard4.blue_shell * 0.5 && easy4.lightning < hard4.lightning, '50cc: fewer shooting stars / eclipses');
  assert.ok(easy4.mushroom > hard4.mushroom, '50cc: the freed odds become comets');
  // the roulette follows the table (seeded) and never hands a shooting star to the leader
  const karts = Array.from({ length: 8 }, (_, i) => ({ place: i + 1, difficulty: 'normal', position: new THREE.Vector3() }));
  const sys = new ItemSystem({ scene: null, track: null, karts });
  let seed = 99;
  const rng = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const tally = (kart, n) => { const c = {}; for (let i = 0; i < n; i++) { const it = sys._rollItem(kart, rng); c[it] = (c[it] || 0) + 1; } return c; };
  const lead = tally(karts[0], 4000), back = tally(karts[7], 4000);
  assert.equal(lead.blue_shell, undefined);
  assert.equal(lead.red_shell, undefined);
  const expect = itemOdds(8, 8, 'normal');
  assert.ok(Math.abs(back.triple_mushroom / 4000 - expect.triple_mushroom) < 0.03, 'roulette matches the published odds');
  sys.dispose();
});

test('AI personalities follow the roster and rubber-banding is fair per class', async () => {
  const { PERSONALITIES } = await import('../src/ai.js');
  for (const c of CHARACTERS) assert.ok(PERSONALITIES[c.id], `${c.id} has a personality`);
  const make = (id, difficulty) => {
    const kart = new Kart({ track, character: CHARACTERS.find((c) => c.id === id), difficulty });
    return { kart, ai: new AIDriver(kart, track, { difficulty }) };
  };
  const zina = make('zina', 'easy');
  assert.equal(zina.ai.style, 'drift-master'); assert.equal(zina.ai.driftTargetLevel, 3);
  const nox = make('nox', 'hard');
  assert.equal(nox.ai.sniper, true); assert.ok(nox.ai.aggression >= 0.75);
  assert.equal(make('kibo', 'hard').ai.bumper, 1);
  // rubber band: AI 300 m behind / ahead of the player (track length 2000)
  const player = { raceProgress: 1.5, finished: false };
  const band = (difficulty, gap) => {
    const { kart, ai } = make('lumen', difficulty);
    kart.raceProgress = 1.5 + gap / 2000;
    for (let i = 0; i < 600; i++) ai._rubberBand({ player }, 1 / 60);
    return kart.maxSpeedScale - DIFFICULTY[difficulty].aiSpeedFactor;
  };
  assert.ok(band('easy', -300) <= 0.031, '50cc: no blatant catch-up from behind');
  assert.ok(band('easy', 300) < -0.05, '50cc: leaders ease off for the player');
  assert.ok(band('hard', -300) > 0.1, '150cc: AIs behind fight back');
  assert.ok(band('hard', 300) > -0.04, '150cc: leaders barely lift');
});

test('full races with items: every AI (personalities, box seeking, item use) and an assisted player finish', async (t) => {
  const { ItemSystem } = await import('../src/items.js');
  const originalRandom = Math.random;
  let seed = 4242;
  Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const used = new Set();
  const off = bus.on('item:use', (d) => used.add(d.item));
  try {
    withCanvasStub(() => {
      for (const def of TRACKS) {
        const cls = CLASSES[2]; // 150cc: the most item-hungry AIs
        const scene = new THREE.Scene();
        const circuit = createTrack(scene, null, { def });
        const karts = CHARACTERS.map((character, index) => { const k = new Kart({ scene, track: circuit, character, index, difficulty: cls.ai, model: stubModel() }); k.applyClass(cls.speed); return k; });
        const player = karts[0];
        player.isPlayer = true; player.assist = { steering: true, strength: 0.6 };
        const drivers = karts.slice(1).map((k) => new AIDriver(k, circuit, { difficulty: cls.ai }));
        const race = new RaceManager({ track: circuit, karts, player, laps: 1, silent: true });
        const items = new ItemSystem({ scene, track: circuit, karts });
        try {
          race.placeOnGrid(); race.startImmediately();
          const ctx = { karts, player, itemSystem: items, time: 0 };
          let tick = 0;
          for (; tick < 200 * 60 && karts.some((k) => !k.finished); tick++) {
            ctx.time = tick / 60;
            player.input = { throttle: 1, brake: 0, steer: 0, drift: false, item: !!player.item && tick % 90 === 0, lookBack: false };
            for (const d of drivers) d.update(1 / 60, ctx);
            for (const k of karts) k.update(1 / 60);
            resolveKartCollisions(karts);
            items.update(1 / 60, ctx.time);
            race.update(1 / 60);
          }
          for (const k of karts) assert.equal(k.finished, true, `${def.id}: ${k.character.id} finishes with items in play`);
          t.diagnostic(`${def.id}/150cc with items: 8/8 in ${(tick / 60).toFixed(1)} s`);
        } finally {
          drivers.forEach((d) => d.dispose()); items.dispose(); karts.forEach((k) => k.dispose()); circuit.dispose(); race.dispose();
        }
      }
    });
  } finally { Math.random = originalRandom; off(); }
  assert.ok(used.size >= 4, `AIs actually use a variety of items (${[...used].join(', ')})`);
});

test('falling into the Night void emits pitKind "void" (no splash); water courses still splash', () => {
  for (const [pitKind, expectVoid] of [['void', true], ['water', false]]) {
    const kart = new Kart({ isPlayer: true, track: { ...wallTrack, pitKind, waterLevel: -1 } });
    kart.reset(new THREE.Vector3(0, 0, 10), 0);
    let ev = null;
    const off = bus.on('kart:fall', (d) => { ev = d; });
    kart._startFall({});
    off();
    assert.equal(ev.pitKind, pitKind);
    assert.equal(ev.void, expectVoid);
    assert.equal(ev.lava, expectVoid, 'legacy flag: HUD shows the void callout instead of SPLASH');
    kart.dispose();
  }
});

test('light prisms are instanced: a whole course of item boxes costs a handful of draw objects, no shadows', async () => {
  const { ItemSystem } = await import('../src/items.js');
  withCanvasStub(() => {
    const scene = new THREE.Scene();
    const circuit = createTrack(scene, null, { def: TRACKS[0] });
    const sys = new ItemSystem({ scene, track: circuit, karts: [] });
    let drawables = 0, shadows = 0;
    sys.group.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite) drawables++; if (o.castShadow || o.receiveShadow) shadows++; });
    assert.ok(sys.boxes.length >= 12);
    assert.ok(drawables <= 8, `${sys.boxes.length} boxes -> ${drawables} draw objects`);
    assert.equal(shadows, 0);
    sys.boxes[0].holder.visible = false;
    sys.prisms.sync();
    const m = new THREE.Matrix4();
    sys.prisms.parts[0].mesh.getMatrixAt(0, m);
    assert.equal(m.elements[0], 0, 'a collected prism collapses its instances');
    sys.dispose(); circuit.dispose();
    assert.equal(sys.group.children.length, 0);
  });
});
