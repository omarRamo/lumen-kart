import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, SCARVES, defaultSave, loadSave, writeSave, migrate, sanitize, recordGrandPrix, recordRace, recordTimeTrial, recordKey,
  isCupUnlocked, isMirrorUnlocked, isCharacterUnlocked, isTrackUnlocked, isClassUnlocked, isScarfUnlocked, scarfColor, chooseScarf, computeUnlocks,
} from '../src/save.js';
import { sanitizeSettings, assistFor, resolveQuality, qualityPreset, DEFAULT_SETTINGS } from '../src/settings.js';

class MemoryStorage {
  constructor(init = {}) { this.map = new Map(Object.entries(init)); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
const CUPS = [{ id: 'dawn', tracks: ['meadow', 'palm-cove', 'jungle', 'sunset-canyon'] }, { id: 'dusk', tracks: ['medina', 'city', 'frosty-peaks', 'lava-keep'] }];
const IDS = CUPS.map((c) => c.id);

test('a fresh save is versioned and only the first cup is open', () => {
  const s = loadSave(new MemoryStorage());
  assert.equal(s.version, 1);
  assert.equal(s.notes, 0);
  assert.equal(s.scarf, 'coral');
  assert.ok(isCupUnlocked(s, 'dawn', IDS));
  assert.ok(!isCupUnlocked(s, 'dusk', IDS));
  assert.ok(!isMirrorUnlocked(s, IDS));
  assert.ok(!isCharacterUnlocked(s, 'nox', IDS));
  assert.ok(isCharacterUnlocked(s, 'lumen', IDS));
  assert.ok(isTrackUnlocked(s, 'meadow', CUPS));
  assert.ok(!isTrackUnlocked(s, 'medina', CUPS));
  assert.ok(isTrackUnlocked(s, 'not-in-a-cup', CUPS));
});

test('corrupt JSON never throws: it is backed up and replaced by a default save', () => {
  const st = new MemoryStorage({ [SAVE_KEY]: '{"notes": 12, oops' });
  const s = loadSave(st);
  assert.deepEqual({ notes: s.notes, version: s.version }, { notes: 0, version: 1 });
  assert.equal(st.getItem(SAVE_KEY + '.corrupt'), '{"notes": 12, oops');
  for (const junk of ['null', '[]', '"text"', '42', 'true']) assert.equal(loadSave(new MemoryStorage({ [SAVE_KEY]: junk })).version, 1);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadSave(throwing).version, 1);
  assert.doesNotThrow(() => writeSave(throwing, defaultSave()));
  assert.equal(loadSave(null).version, 1);
});

test('sanitize keeps valid fields and drops malformed ones field by field', () => {
  const s = sanitize({
    version: 1, notes: -5, races: 'x', wins: 3.7, medals: { dawn: { '100cc': 2, '50cc': 9, bad: 'gold' }, junk: 4 },
    records: { meadow: { time: 95.2, lap: 30.1, char: 'lumen' }, broken: { time: -1 }, nope: 3 },
    scarf: 'night', tutorial: { drift: true, items: 'yes' },
  });
  assert.equal(s.notes, 0);
  assert.equal(s.races, 0);
  assert.equal(s.wins, 3);
  assert.deepEqual(s.medals, { dawn: { '100cc': 2 } });
  assert.deepEqual(Object.keys(s.records), ['meadow']);
  assert.equal(s.scarf, 'coral', 'a scarf that is not unlocked falls back to coral');
  assert.deepEqual(s.tutorial, { drift: true, items: false, notes: false });
});

test('v0 saves migrate (coins -> notes, trophies -> medals, tt -> records)', () => {
  const s = migrate({ coins: 200, trophies: { 'dawn-100cc': 1, 'dusk-mirror': 3 }, tt: { meadow: { time: 90, lap: 29 } } });
  assert.equal(s.version, 1);
  assert.equal(s.notes, 200);
  assert.deepEqual(s.medals, { dawn: { '100cc': 1 }, dusk: { mirror: 3 } });
  assert.equal(s.records.meadow.time, 90);
  const json = writeSave(new MemoryStorage(), s);
  assert.deepEqual(migrate(JSON.parse(json)), s, 'round trip is stable');
});

test('legacy time-trial records are imported on first launch', () => {
  const st = new MemoryStorage({ 'tkr-tt-palm-cove': JSON.stringify({ time: 101.5, lap: 33.2, char: 'pip' }), 'tkr-tt-lava-keep-m': JSON.stringify({ time: 120 }), 'tkr-tt-bad': '{' });
  const s = loadSave(st);
  assert.equal(s.records['palm-cove'].time, 101.5);
  assert.equal(s.records[recordKey('lava-keep', true)].time, 120);
  assert.equal(s.records.bad, undefined);
});

test('unlock rules: Dusk after a Dawn podium, Mirror after winning both, Nox after winning Dusk', () => {
  const s = defaultSave();
  let ev = recordGrandPrix(s, { cupId: 'dawn', classId: '100cc', place: 4 }, IDS);
  assert.deepEqual(ev, []);
  ev = recordGrandPrix(s, { cupId: 'dawn', classId: '100cc', place: 3 }, IDS);
  assert.deepEqual(ev.map((e) => e.type), ['medal', 'cup']);
  assert.equal(ev[1].id, 'dusk');
  assert.ok(isTrackUnlocked(s, 'medina', CUPS));
  ev = recordGrandPrix(s, { cupId: 'dawn', classId: '100cc', place: 3 }, IDS);
  assert.deepEqual(ev, [], 'no event for an equal medal');
  ev = recordGrandPrix(s, { cupId: 'dusk', classId: '50cc', place: 1 }, IDS);
  assert.deepEqual(ev.map((e) => e.type), ['medal', 'character']);
  assert.ok(isCharacterUnlocked(s, 'nox', IDS));
  assert.ok(!isMirrorUnlocked(s, IDS));
  ev = recordGrandPrix(s, { cupId: 'dawn', classId: '200cc', place: 1 }, IDS);
  assert.deepEqual(ev.map((e) => e.type), ['medal', 'mirror']);
  assert.ok(isClassUnlocked(s, 'mirror', IDS));
  assert.equal(s.medals.dawn['100cc'], 3);
});

test('notes accumulate across races and unlock scarf colours', () => {
  const s = defaultSave();
  assert.deepEqual(computeUnlocks(s, IDS).scarves, ['coral']);
  let ev = recordRace(s, { place: 1, notes: 59 }, IDS);
  assert.deepEqual(ev, []);
  ev = recordRace(s, { place: 5, notes: 1 }, IDS);
  assert.deepEqual(ev, [{ type: 'scarf', id: 'gold' }]);
  assert.equal(s.races, 2); assert.equal(s.wins, 1); assert.equal(s.podiums, 1);
  assert.ok(!chooseScarf(s, 'night'));
  assert.ok(chooseScarf(s, 'gold'));
  assert.equal(scarfColor(s), SCARVES.find((x) => x.id === 'gold').color);
  assert.ok(isScarfUnlocked(s, 'coral'));
  recordRace(s, { notes: -50 }, IDS);
  assert.equal(s.notes, 60, 'negative note counts are ignored');
});

test('time-trial records only improve', () => {
  const s = defaultSave();
  let r = recordTimeTrial(s, 'meadow', { time: 100, lap: 32, char: 'lumen' });
  assert.deepEqual([r.newTime, r.newLap, r.previous], [true, true, null]);
  r = recordTimeTrial(s, 'meadow', { time: 101, lap: 31 });
  assert.deepEqual([r.newTime, r.newLap], [false, true]);
  assert.deepEqual(s.records.meadow, { time: 100, lap: 31, char: 'lumen' });
  r = recordTimeTrial(s, 'meadow', { time: NaN, lap: null });
  assert.deepEqual([r.newTime, r.newLap], [false, false]);
});

test('settings sanitize, steering assist defaults and quality presets', () => {
  assert.deepEqual(sanitizeSettings(null), sanitizeSettings({}));
  const s = sanitizeSettings({ music: 4, sfx: -1, lang: 'de', steering: 'tilt', assist: 'maybe', haptics: 'no', quality: 'ultra', last: { charIndex: 99, laps: 7 } });
  assert.equal(s.music, 1); assert.equal(s.sfx, 0); assert.equal(s.lang, 'auto'); assert.equal(s.steering, 'tilt');
  assert.equal(s.assist, 'auto'); assert.equal(s.haptics, true); assert.equal(s.quality, 'auto'); assert.equal(s.last.charIndex, 0); assert.equal(s.last.laps, 3);
  assert.equal(DEFAULT_SETTINGS.assist, 'auto');
  assert.ok(assistFor(s, '50cc'));
  assert.ok(!assistFor(s, '150cc'));
  assert.ok(assistFor({ assist: 'on' }, '200cc'));
  assert.ok(!assistFor({ assist: 'off' }, '50cc'));
  // QA polish: 'auto' also helps touch players in 100cc, never keyboard / gamepad players from 100cc up
  assert.ok(!assistFor(s, '100cc'), '100cc keyboard/gamepad: off');
  assert.ok(assistFor(s, '100cc', ['50cc'], { touch: true }), '100cc touch: on');
  assert.ok(!assistFor(s, '150cc', ['50cc'], { touch: true }), '150cc touch: off');
  assert.ok(!assistFor({ assist: 'off' }, '100cc', ['50cc'], { touch: true }));
  assert.equal(resolveQuality('low', {}), 'low');
  assert.equal(resolveQuality('auto', { mobile: false }), 'high');
  assert.equal(resolveQuality('auto', { mobile: true, memory: 8, cores: 8 }), 'medium');
  assert.equal(resolveQuality('auto', { mobile: true, memory: 2, cores: 8 }), 'low');
  assert.equal(qualityPreset('low', { dpr: 3 }).pixelRatio, 1);
  assert.equal(qualityPreset('high', { mobile: true, dpr: 3 }).bloom, false);
  assert.ok(qualityPreset('high', { mobile: false, dpr: 3 }).pixelRatio <= 2);
});
