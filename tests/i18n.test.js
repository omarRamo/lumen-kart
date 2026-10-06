import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LANGS, t, setLanguage, getLanguage, detectLanguage, resolveLanguage, ordinal, trackName, trackBlurb, cupName, className, itemLabel, esc } from '../src/i18n.js';
import { TRACKS, CUPS } from '../src/tracks.js';
import { CLASSES, CHARACTERS } from '../src/config.js';
import { ITEM_INFO } from '../src/theme.js';
import { SCARVES } from '../src/save.js';
import { __test as audioTest, resolveSong } from '../src/audio.js';

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every French key has an English key (and vice versa) with the same placeholders', () => {
  const fr = Object.keys(STRINGS.fr), en = Object.keys(STRINGS.en);
  assert.deepEqual(fr.filter((k) => !(k in STRINGS.en)), [], 'FR keys missing in EN');
  assert.deepEqual(en.filter((k) => !(k in STRINGS.fr)), [], 'EN keys missing in FR');
  for (const k of fr) {
    assert.ok(STRINGS.fr[k].trim() && STRINGS.en[k].trim(), `empty string for ${k}`);
    assert.deepEqual(vars(STRINGS.fr[k]), vars(STRINGS.en[k]), `placeholders differ for ${k}`);
  }
});

test('data-driven labels exist in both languages', () => {
  for (const lang of LANGS) {
    for (const d of TRACKS) assert.ok(trackName(d, lang) && trackBlurb(d, lang), `track ${d.id} ${lang}`);
    for (const c of CUPS) assert.ok(cupName(c, lang), `cup ${c.id} ${lang}`);
    for (const c of CLASSES) assert.ok(className(c, lang), `class ${c.id} ${lang}`);
    for (const id of Object.keys(ITEM_INFO)) assert.ok(itemLabel(id, lang), `item ${id} ${lang}`);
    for (const ch of CHARACTERS) assert.ok(ch.title?.[lang], `title ${ch.id} ${lang}`);
    for (const s of SCARVES) assert.ok(STRINGS[lang]['scarf.' + s.id], `scarf ${s.id} ${lang}`);
    for (const c of CLASSES) assert.ok(STRINGS[lang][`class.${c.id}.desc`], `class desc ${c.id} ${lang}`);
  }
  assert.equal(trackName({ id: 'meadow' }, 'fr'), 'Prairies d’aurore');
  assert.equal(className({ id: '150cc' }, 'fr'), 'Comète');
  assert.equal(itemLabel('red_shell', 'fr'), 'Luciole');
});

test('language detection: French devices get French, everything else English', () => {
  assert.equal(detectLanguage({ language: 'fr-CA' }), 'fr');
  assert.equal(detectLanguage({ language: 'FR' }), 'fr');
  assert.equal(detectLanguage({ language: 'en-GB' }), 'en');
  assert.equal(detectLanguage({ language: 'ar-TN', languages: ['ar-TN', 'fr'] }), 'en');
  assert.equal(detectLanguage(undefined), 'en');
  assert.equal(resolveLanguage('fr', { language: 'en' }), 'fr');
  assert.equal(resolveLanguage('auto', { language: 'fr-FR' }), 'fr');
});

test('translation lookup, interpolation, ordinals and escaping', () => {
  const prev = getLanguage();
  setLanguage('fr');
  assert.equal(t('title.play'), 'Jouer');
  assert.equal(t('intro.race', { i: 2, n: 4 }), 'Course 2 / 4');
  assert.equal(ordinal(1), '1er'); assert.equal(ordinal(2), '2e');
  setLanguage('en');
  assert.equal(t('title.play'), 'Play');
  assert.equal(ordinal(1), '1st'); assert.equal(ordinal(2), '2nd'); assert.equal(ordinal(3), '3rd'); assert.equal(ordinal(11), '11th'); assert.equal(ordinal(22), '22nd');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('xx');
  assert.equal(getLanguage(), 'en');
  assert.equal(esc('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
  setLanguage(prev);
});

test('every world has a soundtrack and every song compiles to valid notes', () => {
  for (const key of ['meadow', 'lagoon', 'jungle', 'dunes', 'desert', 'medina', 'city', 'aurora', 'night', 'race', 'snow', 'lava', 'menu']) {
    assert.ok(audioTest.SONGS[resolveSong(key)], `song for ${key}`);
  }
  assert.equal(resolveSong('unknown-world'), 'meadow');
  for (const [name, def] of Object.entries(audioTest.SONG_DEFS)) {
    assert.equal(def.mel.length, def.chords.length, `${name}: one melody bar per chord`);
    for (const bar of def.mel) {
      const toks = bar.trim().split(/\s+/);
      assert.equal(toks.length, 8, `${name}: 8 eighth notes per bar (${bar})`);
      for (const tok of toks) if (tok !== '-' && tok !== '.') assert.notEqual(audioTest.parseToken(tok, def.scale), null, `${name}: bad token ${tok}`);
    }
    const song = audioTest.SONGS[name];
    assert.ok(song.melSteps.some(Boolean));
    for (const ev of song.melSteps) if (ev) assert.ok(ev.m > 40 && ev.m < 110 && ev.len > 0);
  }
  // pentatonic hooks: menu and meadow melodies stay inside the major pentatonic scale
  for (const name of ['menu', 'meadow']) {
    const def = audioTest.SONG_DEFS[name];
    for (const ev of audioTest.SONGS[name].melSteps) if (ev) assert.ok([0, 2, 4, 7, 9].includes(((ev.m - def.key) % 12 + 12) % 12), `${name} note ${ev.m}`);
  }
});

test('French typography: no-break spaces before high punctuation (QA)', async () => {
  const { frenchSpacing, setLanguage, t } = await import('../src/i18n.js');
  assert.equal(frenchSpacing('Partez ! Prêt ? Note : « ok »'), 'Partez\u202f! Prêt\u202f? Note\u00a0: «\u00a0ok\u00a0»');
  setLanguage('fr');
  for (const key of ['hud.go', 'select.go', 'loading.ready']) assert.ok(!/ [!?:;]/.test(t(key)), `${key}: ${t(key)}`);
  setLanguage('en');
  assert.equal(t('hud.go'), 'Go!');
});
