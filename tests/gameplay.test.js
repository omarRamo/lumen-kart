import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CHARACTERS, CLASSES, DIFFICULTY, normalizeDifficulty } from '../src/config.js';
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
