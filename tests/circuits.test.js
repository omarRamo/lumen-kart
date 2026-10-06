import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRACKS, CUPS, GP_POINTS, getTrackDef, getCup, trackName } from '../src/tracks.js';
import { createTrack } from '../src/track.js';
import { HazardSystem } from '../src/hazards.js';
import { CoinSystem } from '../src/coins.js';

// Geometry and physical surface tests do not need a GPU or rasterized textures.
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get: (_, name) => name.startsWith('create') ? () => gradient : () => {}, set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => context }) };

const IDS = ['meadow', 'palm-cove', 'jungle', 'sunset-canyon', 'medina', 'city', 'frosty-peaks', 'lava-keep'];
const WORLDS = { meadow: 'meadow', 'palm-cove': 'lagoon', jungle: 'jungle', 'sunset-canyon': 'desert', medina: 'medina', city: 'city', 'frosty-peaks': 'aurora', 'lava-keep': 'night' };
const SONGS = new Set(['race', 'snow', 'desert', 'lava']);

test('eight stable course IDs, two cups of four, legacy IDs resolve', () => {
  assert.deepEqual(TRACKS.map((c) => c.id), IDS);
  assert.deepEqual(CUPS.map((c) => c.id), ['dawn', 'dusk']);
  assert.deepEqual(CUPS[0].tracks, ['meadow', 'palm-cove', 'jungle', 'sunset-canyon']);
  assert.deepEqual(CUPS[1].tracks, ['medina', 'city', 'frosty-peaks', 'lava-keep']);
  for (const cup of CUPS) {
    assert.equal(typeof cup.name, 'string');
    assert.ok(cup.names.fr && cup.names.en);
    for (const id of cup.tracks) assert.ok(TRACKS.some((t) => t.id === id), `${cup.id}: ${id}`);
  }
  assert.equal(new Set(CUPS.flatMap((c) => c.tracks)).size, 8, 'every course is in exactly one cup');
  assert.deepEqual(GP_POINTS, [15, 12, 10, 8, 6, 4, 2, 1]);
  assert.equal(getCup('turbo').id, 'dawn');
  assert.equal(getCup('reverse').id, 'dusk');
  assert.equal(getTrackDef('unknown').id, 'meadow');
  assert.equal(getTrackDef('alpine-rush').id, 'frosty-peaks');
  assert.equal(getTrackDef('neon-harbor').id, 'lava-keep');
  for (const def of TRACKS) {
    assert.equal(def.theme, WORLDS[def.id]);
    assert.ok(SONGS.has(def.song), `${def.id} uses an existing song`);
    assert.ok(def.names.fr && def.names.en && def.blurbs.fr && def.blurbs.en && def.short && def.blurb && def.name);
    assert.equal(trackName(def, 'fr'), def.names.fr);
  }
});

for (const def of TRACKS) for (const mirror of [false, true]) {
  test(`${def.id}${mirror ? ' (mirror)' : ''}: closed drivable course, grid and gameplay features`, () => {
    const scene = new THREE.Scene();
    const track = createTrack(scene, null, { def, mirror });
    assert.equal(track.id, def.id);
    assert.equal(track.world, WORLDS[def.id]);
    assert.equal(track.roadWidth, 24);
    assert.equal(track.startPositions.length, 8);
    assert.equal(track.minimap.points.length, 256);
    assert.ok(track.getPointAt(0).distanceTo(track.getPointAt(1)) < 0.001);
    assert.ok(track.length > 1500 && track.length < 2100, `lap length ${track.length.toFixed(0)} m`);
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
      // the barrier always leaves the full road plus a margin
      const w = track.getWallOffsets(t);
      assert.ok(w.left >= 13 && w.right >= 13, 'barriers clear the road');
    }
    const samples = Array.from({ length: 240 }, (_, i) => track.getPointAt(i / 240));
    for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
      const separation = Math.min(j - i, samples.length - j + i) / samples.length * track.length;
      if (separation < 85) continue;
      assert.ok(Math.hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z) > 50, 'separate road sections do not overlap');
    }
    for (const start of track.startPositions) assert.ok(track.getSurfaceInfo(start.position).onRoad);
    assert.ok(track.itemBoxPositions.length >= 20, 'at least four item rows');
    for (const p of track.itemBoxPositions) assert.ok(track.getSurfaceInfo(p).onRoad);
    assert.ok(track.coinPositions.length >= 25, 'note lines');
    for (const p of track.coinPositions) assert.ok(track.getSurfaceInfo(p).onRoad);
    assert.ok(track.boostPads.length >= 3);
    assert.ok(def.ramps.length >= 1, 'every course has a jump');
    assert.equal(track.jumpRamps.length, def.ramps.length);
    for (const ramp of track.jumpRamps) {
      const t = ramp.t + ramp.length / track.length * 0.5;
      assert.equal(track.getSurfaceInfo(track.getPointAt(t), t).surface, 'jump');
    }
    // shortcuts: the inner side opens onto offroad; driving across the field never hits a barrier
    assert.equal(track.shortcuts.length, (def.shortcuts || []).length);
    for (const sc of track.shortcuts) {
      const tm = sc.t0 <= sc.t1 ? (sc.t0 + sc.t1) / 2 : ((sc.t0 + sc.t1 + 1) / 2) % 1;
      const p = track.pointAt(tm, sc.side * 22);
      const info = track.getSurfaceInfo(p, tm);
      assert.equal(info.surface, 'offroad');
      assert.equal(track.resolveWall(p), null, 'shortcut field is open');
      assert.ok(Math.abs(track.pointAt(sc.t0).y - track.pointAt(sc.t1).y) < 1.5, 'shortcut stays level');
    }
    if (def.id !== 'sunset-canyon' && def.id !== 'frosty-peaks' && def.id !== 'lava-keep') assert.ok(track.shortcuts.length >= 1, 'new layouts have an expert shortcut');
    assert.equal(track.hazardDefs.length, def.hazards.length);
    // creatures and notes build, animate and dispose without a GPU
    const kart = { position: new THREE.Vector3(1e5, 0, 1e5), velocity: new THREE.Vector3(), radius: 1.3 };
    const hz = new HazardSystem({ scene, track, karts: [kart] });
    assert.equal(hz.items.length, def.hazards.length, 'every hazard type has a model');
    hz.update(1 / 60, 3.2); hz.update(1 / 60, 3.3);
    for (const h of hz.items) assert.ok(Number.isFinite(h.pos.x) && Number.isFinite(h.pos.y));
    assert.ok(hz.getHazards().every((h) => h.radius > 0));
    const notes = new CoinSystem({ scene, track, karts: [kart] });
    notes.update(1 / 60);
    hz.dispose(); notes.dispose();
    track.dispose();
    assert.equal(scene.children.length, 0, 'world disposed cleanly');
  });
}

test('quality hint thins the world but keeps the gameplay identical', () => {
  const def = getTrackDef('meadow');
  const a = createTrack(new THREE.Scene(), null, { def, quality: 'high' });
  const b = createTrack(new THREE.Scene(), null, { def, quality: 'low' });
  assert.equal(a.quality, 'high'); assert.equal(b.quality, 'low');
  assert.equal(a.length, b.length);
  assert.deepEqual(a.itemBoxPositions.map((p) => p.toArray()), b.itemBoxPositions.map((p) => p.toArray()));
  a.dispose(); b.dispose();
});

// QA regression: the terrain mesh used to rise metres above the road near bridge ends and on hillsides (meadow pond
// bridge, jungle river, aurora…), hiding the road and even swallowing the camera. Sample the rendered terrain
// triangles under the drivable road at both terrain resolutions.
for (const quality of ['high', 'low']) {
  test(`terrain never covers the road (${quality} terrain grid)`, () => {
    for (const def of TRACKS) {
      const scene = new THREE.Scene();
      const track = createTrack(scene, null, { def, quality });
      let terrain = null;
      scene.traverse((o) => { if (o.name === 'terrain') terrain = o; });
      assert.ok(terrain, `${def.id}: terrain mesh`);
      const pos = terrain.geometry.attributes.position, idx = terrain.geometry.index.array;
      const cell = 16, grid = new Map();
      const key = (i, j) => i * 100003 + j;
      for (let t = 0; t < idx.length; t += 3) {
        const xs = [pos.getX(idx[t]), pos.getX(idx[t + 1]), pos.getX(idx[t + 2])];
        const zs = [pos.getZ(idx[t]), pos.getZ(idx[t + 1]), pos.getZ(idx[t + 2])];
        for (let i = Math.floor(Math.min(...xs) / cell); i <= Math.floor(Math.max(...xs) / cell); i++) {
          for (let j = Math.floor(Math.min(...zs) / cell); j <= Math.floor(Math.max(...zs) / cell); j++) {
            const k = key(i, j);
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(t);
          }
        }
      }
      const groundAt = (x, z) => {
        for (const t of grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []) {
          const a = idx[t], b = idx[t + 1], c = idx[t + 2];
          const ax = pos.getX(a), az = pos.getZ(a), bx = pos.getX(b), bz = pos.getZ(b), cx = pos.getX(c), cz = pos.getZ(c);
          const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
          const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
          if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) return l1 * pos.getY(a) + l2 * pos.getY(b) + (1 - l1 - l2) * pos.getY(c);
        }
        return null;
      };
      let worst = 0, where = null;
      for (let i = 0; i < 1500; i++) {
        const t = i / 1500, p = track.getPointAt(t), tan = track.getTangentAt(t);
        const len = Math.hypot(tan.x, tan.z) || 1;
        for (const lat of [-11, -6, 0, 6, 11]) {
          const x = p.x + (tan.z / len) * lat, z = p.z - (tan.x / len) * lat;
          const info = track.getSurfaceInfo(new THREE.Vector3(x, p.y, z), t);
          if (info.surface === 'pit') continue;
          const g = groundAt(x, z);
          if (g != null && g - info.height > worst) { worst = g - info.height; where = `t=${t.toFixed(3)} lat=${lat}`; }
        }
      }
      assert.ok(worst < 0.05, `${def.id} (${quality}): terrain ${worst.toFixed(2)} m above the road at ${where}`);
      track.dispose();
    }
  });
}
