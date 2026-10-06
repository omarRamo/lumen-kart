import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRACKS, CUPS, getTrackDef } from '../src/tracks.js';
import { createTrack } from '../src/track.js';

// Geometry and physical surface tests do not need a GPU or rasterized textures.
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {}, set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => context }) };

test('four stable course IDs, cups reference them, legacy IDs resolve', () => {
  assert.deepEqual(TRACKS.map(c => c.id), ['palm-cove', 'frosty-peaks', 'sunset-canyon', 'lava-keep']);
  for (const cup of CUPS) for (const id of cup.tracks) assert.ok(TRACKS.some((t) => t.id === id), `${cup.id}: ${id}`);
  assert.equal(getTrackDef('unknown').id, 'palm-cove');
  assert.equal(getTrackDef('alpine-rush').id, 'frosty-peaks');
  assert.equal(getTrackDef('neon-harbor').id, 'lava-keep');
});

for (const def of TRACKS) for (const mirror of [false, true]) {
  test(`${def.id}${mirror ? ' (mirror)' : ''}: closed drivable course, grid and gameplay features`, () => {
    const scene = new THREE.Scene();
    const track = createTrack(scene, null, { def, mirror });
    assert.equal(track.id, def.id);
    assert.equal(track.roadWidth, 24);
    assert.equal(track.startPositions.length, 8);
    assert.equal(track.minimap.points.length, 256);
    assert.ok(track.getPointAt(0).distanceTo(track.getPointAt(1)) < 0.001);
    assert.ok(track.length > 1500);
    const inGap = (t, pad = 0) => track.gaps.some((g) => (g.t0 <= g.t1 ? t >= g.t0 - pad && t <= g.t1 + pad : t >= g.t0 - pad || t <= g.t1 + pad));
    for (let n = 0; n < 400; n++) {
      const t = n / 400, p = track.getPointAt(t), surface = track.getSurfaceInfo(p, t);
      assert.ok(Number.isFinite(surface.height));
      if (inGap(t, 0.002)) { if (inGap(t)) assert.equal(surface.surface, 'pit'); continue; }
      assert.ok(surface.onRoad);
      assert.ok(Math.abs(surface.lateral) < 0.1);
      assert.equal(track.resolveWall(p), null);
      assert.ok(Math.abs(track.getTangentAt(t).y) < 0.3, 'grade remains drivable');
      assert.ok(!inGap(track.getRespawnT(t)), 'respawn never lands in a gap');
    }
    const samples = Array.from({ length: 240 }, (_, i) => track.getPointAt(i / 240));
    for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
      const separation = Math.min(j - i, samples.length - j + i) / samples.length * track.length;
      if (separation < 85) continue;
      assert.ok(Math.hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z) > 50, 'separate road sections do not overlap');
    }
    for (const start of track.startPositions) assert.ok(track.getSurfaceInfo(start.position).onRoad);
    for (const p of track.itemBoxPositions) assert.ok(track.getSurfaceInfo(p).onRoad);
    for (const p of track.coinPositions) assert.ok(track.getSurfaceInfo(p).onRoad);
    assert.ok(track.boostPads.length >= 3);
    assert.equal(track.jumpRamps.length, def.ramps.length);
    for (const ramp of track.jumpRamps) {
      const t = ramp.t + ramp.length / track.length * 0.5;
      assert.equal(track.getSurfaceInfo(track.getPointAt(t), t).surface, 'jump');
    }
    assert.equal(track.hazardDefs.length, def.hazards.length);
    track.dispose();
    assert.equal(scene.children.length, 0, 'world disposed cleanly');
  });
}
