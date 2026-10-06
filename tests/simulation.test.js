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
