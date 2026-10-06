import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepper } from '../src/simulation.js';

for (const fps of [15, 20, 30, 60, 120]) {
  test(`10 seconds at ${fps} FPS remains 10 seconds of simulation`, () => {
    const loop = new FixedStepper();
    let elapsed = 0;
    for (let i = 0; i < fps * 10; i++) loop.advance(1 / fps, dt => { elapsed += dt; });
    assert.ok(Math.abs(elapsed - 10) < 1e-8);
  });
}
test('returning after suspension bounds catch-up and reset drops residual time', () => {
  const loop = new FixedStepper();
  assert.equal(loop.advance(60, () => {}), 12);
  loop.reset();
  assert.equal(loop.advance(0, () => {}), 0);
});

test('kart physics is deterministic at the fixed 1/60 step (drift, assist, hit-stop, walls)', async () => {
  const THREE = await import('three');
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {}, set: () => true });
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    const { Kart, resolveKartCollisions } = await import('../src/kart.js');
    const { createTrack } = await import('../src/track.js');
    const { CHARACTERS } = await import('../src/config.js');
    const run = () => {
      const scene = new THREE.Scene();
      const track = createTrack(scene, null, { trackId: 'lava-keep' });
      const karts = [0, 1].map((i) => {
        const k = new Kart({ scene, track, character: CHARACTERS[i * 6], isPlayer: i === 0, index: i, difficulty: 'easy',
          model: { root: new THREE.Group(), animate() {}, dispose() {} } });
        k.applyClass(0.86);
        k.reset(track.startPositions[i].position, track.startPositions[i].heading);
        return k;
      });
      karts[0].assist = { steering: true, strength: 0.6 };
      const stepper = new FixedStepper();
      for (let f = 0; f < 30 * 60; f++) {
        const tt = f / 60;
        karts[0].input = { throttle: 1, brake: 0, steer: Math.sin(tt * 0.7) * 0.6, drift: (f % 300) > 200, item: false, lookBack: false };
        karts[1].input = { throttle: 1, brake: 0, steer: Math.sin(tt * 1.3) > 0.6 ? 1 : 0, drift: false, item: false, lookBack: false };
        if (f === 900) karts[1].applyHit('tumble');
        stepper.advance(1 / 60, (dt) => { for (const k of karts) k.update(dt); resolveKartCollisions(karts); });
      }
      const out = karts.map((k) => [k.position.x, k.position.y, k.position.z, k.heading, k.speed, k.driftCharge]);
      karts.forEach((k) => k.dispose()); track.dispose();
      return out;
    };
    const a = run(), b = run();
    assert.deepEqual(a, b);
    for (const row of a) for (const v of row) assert.ok(Number.isFinite(v));
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});
