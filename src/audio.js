// Lumen Kart — fully procedural WebAudio: soft engine hum, cute SFX and a warm, melodic soundtrack
// (marimba, kalimba, bell, ney-flute, pads) with one theme per world. Nothing is sampled.
import { bus } from './events.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------------------------
// Song notation. Melodies: 8 tokens per bar (eighth notes) of scale degrees 1..7, with ' = octave
// up, , = octave down, b/# prefix = flat/sharp, - = hold, . = rest. Chords: one scale degree per bar.
// ---------------------------------------------------------------------------------------------
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10],
};

const SONG_DEFS = {
  // Title: a slow, hopeful lullaby — pad, bell melody, kalimba ripples.
  menu: {
    bpm: 78, key: 65, scale: 'major', lead: 'bell', arp: 'kalimba', arpPat: [0, 2, 1, 3, 2, 1], arpEvery: 2,
    pad: 0.05, bass: 'round', drums: 'breeze', leadVol: 0.07,
    chords: [1, 5, 6, 4, 1, 5, 4, 1],
    mel: ['3 - 5 - 6 - 5 -', '5 - - - 3 - 2 -', '1 - 2 - 3 - 6, -', '2 - - - - - . .',
      '3 - 5 - 6 - 1\' -', '2\' - 1\' - 6 - 5 -', '6 - 5 - 3 - 2 -', '1 - - - - - . .'],
  },
  // Dawn Meadows: bright marimba hook, kalimba arps, light shuffle.
  meadow: {
    bpm: 128, key: 72, scale: 'major', lead: 'marimba', counter: 'kalimba', arp: 'kalimba', arpPat: [0, 1, 2, 3, 2, 1, 2, 3],
    pad: 0.03, bass: 'round', drums: 'soft', leadVol: 0.1,
    chords: [1, 5, 6, 4, 1, 5, 4, 5],
    mel: ['5 6 1\' 6 5 3 5 -', '2 3 5 3 2 - 1 2', '3 - 5 - 6 5 3 -', '2 - - 3 2 1 2 -',
      '5 6 1\' 2\' 3\' 2\' 1\' 6', '5 - 3 5 2 - . 3', '1 2 3 5 6 - 5 3', '2 - - 1 2 - 5, -'],
  },
  // Coral Lagoons: steel-pan island groove with offbeat bass.
  lagoon: {
    bpm: 116, key: 67, scale: 'major', lead: 'pan', arp: 'marimba', arpPat: [0, 2, 1, 2], arpEvery: 2,
    pad: 0.025, bass: 'island', drums: 'island', leadVol: 0.1,
    chords: [1, 4, 5, 1, 6, 4, 5, 1],
    mel: ['. 3 5 - 3 5 6 5', '. 4 6 - 1\' - 6 4', '. 5 7 - 2\' - 7 5', '1\' - 5 - 3 - . .',
      '. 3 6 - 1\' - 6 5', '4 - 6 1\' 6 4 2 -', '5 - 2\' - 7 5 2 -', '1 - - - . 5 6 7'],
  },
  // Amazon Canopy: dorian marimba, log drums, playful frogs.
  jungle: {
    bpm: 132, key: 62, scale: 'dorian', lead: 'marimba', counter: 'kalimba', arp: 'kalimba', arpPat: [0, 2, 3, 2, 1, 2],
    pad: 0.025, bass: 'pluck', drums: 'jungle', leadVol: 0.11,
    chords: [1, 4, 1, 4, 7, 4, 1, 5],
    mel: ['1\' - 7 5 4 5 7 1\'', '2\' - 1\' 6 5 - 4 5', '1\' - 7 5 3 4 5 7', '6 - 5 4 2 - 1 2',
      '7 - 2\' 4\' 2\' 7 5 7', '6 - 4 6 1\' - 6 4', '5 - 1\' 7 5 4 3 1', '5 - - 4 5 - 7 -'],
  },
  // Singing Dunes: ney-like flute in hijaz over darbuka.
  desert: {
    bpm: 112, key: 64, scale: 'hijaz', lead: 'flute', counter: 'oud', arp: 'oud', arpPat: [0, 1, 0, 2], arpEvery: 2,
    pad: 0.035, bass: 'pluck', drums: 'darbuka', leadVol: 0.085,
    chords: [1, 1, 2, 1, 7, 2, 1, 1],
    mel: ['1 - 2 3 2 - 1 -', '3 - 4 5 4 3 2 1', '2 - 3 4 6 - 4 2', '3 - - 2 1 - . .',
      '7, - 1 2 4 - 2 1', '2 - 4 6 5 4 3 2', '3 - 5 6 5 3 2 3', '1 - - - . . 7, 1'],
  },
  // Sidi Bou Said: sunny oud & kalimba, riq and darbuka, blue-and-white mixolydian.
  medina: {
    bpm: 124, key: 62, scale: 'mixolydian', lead: 'oud', counter: 'flute', arp: 'kalimba', arpPat: [0, 1, 2, 1], arpEvery: 2,
    pad: 0.03, bass: 'pluck', drums: 'darbuka', leadVol: 0.12,
    chords: [1, 7, 4, 1, 1, 7, 5, 1],
    mel: ['5 - 6 5 3 - 5 -', '7 - 6 5 4 - 2 -', '4 - 5 6 1\' - 6 4', '5 - 3 - 1 - . 5,',
      '1 3 5 6 5 3 5 6', '7 - 5 7 2\' - 1\' 7', '6 - 5 3 2 3 5 -', '1 - - - . 3 2 1'],
  },
  // Rooftop City: soft electric piano city-pop, snaps and a walking bass.
  city: {
    bpm: 134, key: 70, scale: 'major', lead: 'keys', arp: 'keys', arpPat: [0, 1, 2, 3], arpEvery: 2, sevenths: true,
    pad: 0.03, bass: 'walk', drums: 'city', leadVol: 0.09,
    chords: [4, 5, 3, 6, 2, 5, 1, 1],
    mel: ['6 - 1\' - 3\' - 1\' 6', '7 - 2\' - 5 - . 5', '3\' - 2\' 7 5 - 3 5', '6 - - 5 6 1\' 3\' -',
      '4\' - 3\' 2\' 1\' - 6 4', '5 - 7 2\' 4\' - 2\' 7', '1\' - 5 3 1 3 5 1\'', '3\' - - - 2\' - 1\' -'],
  },
  // Aurora Night: glassy bells over a wide pad, half-time pulse.
  aurora: {
    bpm: 120, key: 69, scale: 'minor', lead: 'bell', counter: 'kalimba', arp: 'glass', arpPat: [0, 1, 2, 3, 2, 1],
    pad: 0.06, bass: 'round', drums: 'halftime', leadVol: 0.085,
    chords: [1, 6, 3, 7, 1, 6, 4, 5],
    mel: ['5 - 1\' - 3\' - 2\' 1\'', '1\' - 6 - 3\' - 1\' 6', '7 - 5 - 3\' - 2\' -', '2\' - 7 5 4 - 2 -',
      '1 - 3 5 1\' - 7 5', '6 - 1\' 3\' 4\' - 3\' 1\'', '6 - 4 - 1\' - 6 4', '5 - - - 7 - 2\' -'],
  },
  // Realm of Night: mysterious dorian comet-bells that keep reaching for the light.
  night: {
    bpm: 138, key: 72, scale: 'dorian', lead: 'bell', counter: 'flute', arp: 'glass', arpPat: [0, 2, 1, 3, 2, 1, 2, 3],
    pad: 0.055, bass: 'round', drums: 'night', leadVol: 0.08,
    chords: [1, 7, 4, 1, 3, 7, 4, 5],
    mel: ['1 - 3 5 7 - 5 3', '4 - 2 7, 2 - 4 5', '6 - 1\' - 4 - 6 1\'', '5 - - 3 1 - . .',
      '3\' - 2\' 1\' 7 - 5 7', '2\' - 1\' 7 4 - 5 6', '1\' - 6 4 6 1\' 4\' -', '5\' - - - 2\' - 7 -'],
  },
};

// Song keys used by track defs (old and new) -> theme.
const SONG_ALIASES = {
  title: 'menu', menu: 'menu',
  race: 'lagoon', beach: 'lagoon', lagoon: 'lagoon', palm: 'lagoon', 'palm-cove': 'lagoon', coral: 'lagoon',
  meadow: 'meadow', dawn: 'meadow',
  jungle: 'jungle', amazon: 'jungle',
  desert: 'desert', dunes: 'desert', 'sunset-canyon': 'desert',
  medina: 'medina', tunis: 'medina',
  city: 'city', rooftop: 'city',
  snow: 'aurora', aurora: 'aurora', frost: 'aurora', 'frosty-peaks': 'aurora',
  lava: 'night', night: 'night', 'lava-keep': 'night',
};
export const DEFAULT_SONG = 'meadow';
export function resolveSong(name) { return SONG_ALIASES[name] || (SONG_DEFS[name] ? name : DEFAULT_SONG); }

function degreeToSemis(scale, deg) {
  const sc = SCALES[scale] || SCALES.major;
  const d = deg - 1;
  const oct = Math.floor(d / 7);
  return sc[((d % 7) + 7) % 7] + 12 * oct;
}
function parseToken(tok, scale) {
  let s = tok, acc = 0, oct = 0;
  while (s[0] === 'b' || s[0] === '#') { acc += s[0] === 'b' ? -1 : 1; s = s.slice(1); }
  while (s.endsWith("'")) { oct += 12; s = s.slice(0, -1); }
  while (s.endsWith(',')) { oct -= 12; s = s.slice(0, -1); }
  const deg = parseInt(s, 10);
  if (!(deg >= 1 && deg <= 7)) return null;
  return degreeToSemis(scale, deg) + acc + oct;
}
/** Compile a song definition into per-16th-step event lists. */
function compile(def) {
  const bars = def.chords.length;
  const steps = bars * 16;
  const mel = Array.from({ length: steps }, () => null);
  def.mel.forEach((bar, bi) => {
    const toks = bar.trim().split(/\s+/);
    toks.forEach((tok, i) => {
      if (tok === '-' || tok === '.') return;
      const semi = parseToken(tok, def.scale);
      if (semi == null) return;
      let len = 1;
      for (let j = i + 1; j < toks.length && toks[j] === '-'; j++) len++;
      mel[bi * 16 + i * 2] = { m: def.key + semi, len: len * 2 };
    });
  });
  const chords = def.chords.map((deg) => {
    const tones = [deg, deg + 2, deg + 4].map((d) => degreeToSemis(def.scale, d));
    if (def.sevenths) tones.push(degreeToSemis(def.scale, deg + 6));
    return tones;
  });
  return { ...def, bars, steps, melSteps: mel, chordTones: chords };
}
const SONGS = {};
for (const [k, d] of Object.entries(SONG_DEFS)) SONGS[k] = compile(d);

// Drum patterns, 16 steps: k = kick, s = soft snare/clap, h = shaker/hat, d/t = darbuka doum/tek, l = log drum.
const DRUMS = {
  breeze: { h: '....h.......h...' },
  soft: { k: 'k.......k.k.....', s: '....s.......s...', h: '..h...h...h...h.' },
  island: { k: 'k.......k.......', s: '......s.......s.', h: 'h.hhh.hhh.hhh.hh', l: '...l......l.....' },
  jungle: { k: 'k.....k...k.....', s: '....s.......s...', h: 'h.h.h.h.h.h.h.hh', l: '..l..l.....l.l..' },
  darbuka: { d: 'd.....d...d.....', t: '...t.t..t.....t.', h: '..h.......h.h...' },
  city: { k: 'k.......k..k....', s: '....s.......s...', h: 'h.h.h.h.h.h.h.h.' },
  halftime: { k: 'k.........k.....', s: '........s.......', h: '..h...h...h...h.' },
  night: { k: 'k.......k.....k.', s: '....s.......s...', h: 'h.hh..h.h.hh..h.' },
};
const PENTA = [0, 2, 4, 7, 9];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.85;
    this.musicVolume = 0.7;
    this.sfxVolume = 0.9;
    this.gameplay = false;
    this.paused = false;
    this.camera = null;
    this.player = null;
    this.songName = null;
    this.tempoScale = 1;
    this.finalLap = false;
    this._pendingSong = null;
    this._rouletteTimer = 0;
    this._rouletteActive = false;
    this._offs = [];

    this._onGesture = () => this.unlock();
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this._onGesture);
      window.addEventListener('keydown', this._onGesture);
      window.addEventListener('touchstart', this._onGesture);
      window.addEventListener('touchend', this._onGesture);
    }
    this._subscribe();
  }

  // ------------------------------------------------------------------ setup
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { console.warn('[audio] no AudioContext', e); return; }
      try { this._buildGraph(); } catch (e) { console.warn('[audio] graph failed', e); this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended' && !this._appSuspended) this.ctx.resume().catch(() => {});
    if (this._pendingSong !== null && this.ctx) {
      const s = this._pendingSong; this._pendingSong = null; this.playMusic(s);
    }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 14; this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.006; this.comp.release.value = 0.25;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);

    // music: notes -> musicGain (mix) -> musicDuck (pause) -> musicVol (setting) -> master
    this.musicVol = ctx.createGain(); this.musicVol.gain.value = this.musicVolume; this.musicVol.connect(this.master);
    this.musicDuck = ctx.createGain(); this.musicDuck.gain.value = 1; this.musicDuck.connect(this.musicVol);
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.musicDuck);
    this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = this.sfxVolume; this.sfxGain.connect(this.master);

    // shared noise buffer (2 s)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // soft room reverb (procedural impulse) shared by music and bell-like SFX
    try {
      const irLen = Math.floor(ctx.sampleRate * 1.8);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
      }
      this.verb = ctx.createConvolver(); this.verb.buffer = ir;
      this.verbOut = ctx.createGain(); this.verbOut.gain.value = 0.32;
      this.verb.connect(this.verbOut);
      this.musicVerb = ctx.createGain(); this.musicVerb.gain.value = 0.28; this.musicGain.connect(this.musicVerb); this.musicVerb.connect(this.verb);
      this.verbOut.connect(this.musicDuck);
      this.sfxVerb = ctx.createGain(); this.sfxVerb.gain.value = 1; this.sfxVerb.connect(this.verb);
      this.sfxVerbOut = ctx.createGain(); this.sfxVerbOut.gain.value = 0.35; this.verb.connect(this.sfxVerbOut); this.sfxVerbOut.connect(this.sfxGain);
    } catch { this.verb = null; this.sfxVerb = null; }

    // -- engine: a soft electric hum (triangle + sine + gentle sub) through a lowpass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 380; this.engFilter.Q.value = 1.2;
    this.engA = ctx.createOscillator(); this.engA.type = 'triangle'; this.engA.frequency.value = 70;
    this.engB = ctx.createOscillator(); this.engB.type = 'sawtooth'; this.engB.frequency.value = 70; this.engB.detune.value = 9;
    this.engSub = ctx.createOscillator(); this.engSub.type = 'sine'; this.engSub.frequency.value = 35;
    const gA = ctx.createGain(); gA.gain.value = 0.55;
    const gB = ctx.createGain(); gB.gain.value = 0.12;
    const gS = ctx.createGain(); gS.gain.value = 0.45;
    this.engA.connect(gA); this.engB.connect(gB); this.engSub.connect(gS);
    gA.connect(this.engFilter); gB.connect(this.engFilter); gS.connect(this.engFilter);
    this.engLfo = ctx.createOscillator(); this.engLfo.frequency.value = 9;
    this.engLfoGain = ctx.createGain(); this.engLfoGain.gain.value = 0.12;
    this.engAm = ctx.createGain(); this.engAm.gain.value = 0.85;
    this.engLfo.connect(this.engLfoGain); this.engLfoGain.connect(this.engAm.gain);
    this.engFilter.connect(this.engAm); this.engAm.connect(this.engGain); this.engGain.connect(this.sfxGain);
    for (const o of [this.engA, this.engB, this.engSub, this.engLfo]) o.start();

    // -- drift: soft sandy "shhh" through a wide bandpass
    this.drSrc = ctx.createBufferSource(); this.drSrc.buffer = this.noiseBuf; this.drSrc.loop = true;
    this.drFilter = ctx.createBiquadFilter(); this.drFilter.type = 'bandpass'; this.drFilter.frequency.value = 1200; this.drFilter.Q.value = 2.2;
    this.drGain = ctx.createGain(); this.drGain.gain.value = 0;
    this.drSrc.connect(this.drFilter); this.drFilter.connect(this.drGain); this.drGain.connect(this.sfxGain);
    this.drSrc.start();

    this._step = 0; this._nextTime = 0;
    this._sched = setInterval(() => this._schedule(), 25);
  }

  _subscribe() {
    const on = (n, f) => this._offs.push(bus.on(n, (d) => { if (this.ctx && this.ctx.state === 'running') { try { f(d || {}); } catch (e) { console.warn('[audio]', n, e); } } }));
    const isP = (k) => k && k.isPlayer;
    on('race:countdown', (d) => this.countBeep(d.n));
    on('race:go', () => this.goChord());
    on('race:lap', (d) => { if (isP(d.kart)) this.lapChime(); });
    on('race:finalLap', () => { this.finalLapJingle(); this.tempoScale = 1.1; this.finalLap = true; });
    on('race:finish', (d) => { if (isP(d.kart)) this.fanfare(d.place); });
    on('kart:driftLevel', (d) => { if (isP(d.kart) && d.level > 0) this.sparkTick(d.level); });
    on('kart:miniTurbo', (d) => { if (isP(d.kart)) { this.whoosh(0.3 + 0.12 * (d.level || 1), 1 + 0.15 * (d.level || 1)); this.sparkTick(d.level || 1, 0.6); } });
    on('kart:boost', (d) => {
      if (!isP(d.kart) || d.source === 'miniTurbo' || d.source === 'coin' || d.source === 'star') return;
      if (d.source === 'trick') this.trickSound(); else if (d.source === 'slipstream') this.whoosh(0.7, 1.3); else this.cometWhoosh();
    });
    on('coin:pickup', (d) => { if (isP(d.kart)) this.noteChime(d.kart.coins || 0); });
    on('kart:coinLoss', (d) => { if (isP(d.kart)) this.coinLossSound(); });
    const isVoid = (d) => (d.pitKind ? d.pitKind === 'void' : !!(d.void || d.lava));
    on('kart:fall', (d) => { const v = isVoid(d); if (isP(d.kart)) (v ? this.nightFall() : this.splashSound(false)); else this.atPos(d.position, 0.5, (g) => (v ? this.nightFall(g) : this.splashSound(false, g))); });
    on('kart:respawn', (d) => { if (isP(d.kart)) this.rescueSound(); });
    on('kart:rocket', (d) => { if (isP(d.kart)) this.featherSound(); });
    on('kart:ghost', (d) => { if (isP(d.kart)) this.veilSound(); });
    on('item:horn', (d) => this.atPos(d.position, 1, (g) => this.resonanceBell(g)));
    on('item:steal', (d) => { if (isP(d.kart) || isP(d.from)) this.stealSound(isP(d.kart)); });
    on('item:block', (d) => { if (isP(d.kart)) this.clink(); });
    on('item:drag', (d) => { if (isP(d.kart)) this._tone('sine', mtof(84), this.ctx.currentTime, 0.06, 0.05); });
    on('item:splash', (d) => this.atPos(d.position, 0.4, (g) => (isVoid(d) ? this.nightFall(g * 0.5) : this.splashSound(false, g * 0.6))));
    on('hazard:stomp', (d) => this.atPos(d.position, 1, (g) => this.thud(g, 70)));
    on('hazard:smash', (d) => this.atPos(d.position, 0.8, (g) => this.pop(g)));
    on('game:record', () => this.celebrate());
    on('game:unlock', () => this.celebrate());
    on('kart:hit', (d) => { if (isP(d.kart)) this.hitSound(d.kind); else this.atPos(d.kart && d.kart.position, 0.5, (g) => this.hitSound(d.kind, g)); });
    on('kart:wallBump', (d) => { if (isP(d.kart)) this.thud(clamp(d.intensity ?? 0.5, 0.1, 1) * 0.8); });
    on('kart:bump', (d) => { if (isP(d.a) || isP(d.b)) this.thud(clamp((d.intensity ?? 0.5) * 0.6, 0.1, 0.7), 160); });
    on('kart:jump', (d) => { if (isP(d.kart)) this.boing(); });
    on('kart:land', (d) => { if (isP(d.kart)) this.thud(0.3, 90); });
    on('item:pickup', (d) => { if (isP(d.kart)) this.prismShimmer(); });
    on('item:roulette', (d) => { if (isP(d.kart)) { this._rouletteActive = true; this._rouletteTimer = 0; this._rouletteElapsed = 0; this._rouletteIdx = 0; } });
    on('item:got', (d) => { if (isP(d.kart)) { this._rouletteActive = false; this.gotItem(); } });
    on('item:use', (d) => { if (isP(d.kart)) this.throwSound(d.item); });
    on('item:hit', (d) => { if (isP(d.by) && !isP(d.kart)) this.hitConfirm(); });
    on('item:explode', (d) => { const small = d.kind === 'small' || (d.radius != null && d.radius < 3); this.atPos(d.position, small ? 0.35 : 1, (g) => (small ? this.pop(g) : this.bloomBurst(g))); });
    on('item:lightning', () => this.eclipse());
    on('ui:move', () => this.uiClick(0));
    on('ui:confirm', () => this.uiClick(1));
    on('ui:back', () => this.uiClick(2));
  }

  // ------------------------------------------------------------------ public controls
  setGameplayActive(on) { this.gameplay = !!on; if (!on) { this._rouletteActive = false; this.tempoScale = 1; this.finalLap = false; } }
  setPaused(p) {
    this.paused = !!p;
    if (this.musicDuck && this.ctx) this.musicDuck.gain.setTargetAtTime(p ? 0.35 : 1, this.ctx.currentTime, 0.1);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    return this.muted;
  }
  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.master && !this.muted) this.master.gain.value = this.volume; }
  setMusicVolume(v) {
    this.musicVolume = clamp(Number(v) || 0, 0, 1);
    if (this.musicVol && this.ctx) this.musicVol.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
  }
  setSfxVolume(v) {
    this.sfxVolume = clamp(Number(v) || 0, 0, 1);
    if (this.sfxGain && this.ctx) this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
  }
  /** App went to background / came back (visibilitychange or Capacitor pause/resume). */
  suspend() { this._appSuspended = true; try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); } catch { /* ignore */ } }
  resume() { this._appSuspended = false; try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); } catch { /* ignore */ } }
  hasSong(name) { return !!SONG_ALIASES[name] || !!SONG_DEFS[name]; }

  playMusic(name) {
    const song = resolveSong(name);
    if (!this.ctx) { this._pendingSong = song; return; }
    if (song === this.songName) return;
    this.songName = song;
    this.tempoScale = 1;
    this.finalLap = false;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.1;
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(0.0, t); g.linearRampToValueAtTime(0.5, t + 0.6);
  }
  stopMusic() { this.songName = null; this._pendingSong = null; }

  update(dt, { player, camera } = {}) {
    this.player = player || null;
    this.camera = camera || this.camera;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const live = this.gameplay && !this.paused && player;
    if (live) {
      const sp = Math.abs(player.speed || 0);
      const boosting = (player.boostTimer > 0) || (player.starTimer > 0);
      const shrunk = player.shrinkTimer > 0 ? 1.45 : 1;
      let f = (58 + sp * 2.0 + (boosting ? 18 : 0)) * shrunk;
      if (player.airborne) f *= 1.1;
      this.engA.frequency.setTargetAtTime(f, t, 0.08);
      this.engB.frequency.setTargetAtTime(f * 1.004, t, 0.08);
      this.engSub.frequency.setTargetAtTime(f * 0.5, t, 0.08);
      this.engLfo.frequency.setTargetAtTime(7 + sp * 0.35, t, 0.1);
      this.engFilter.frequency.setTargetAtTime(240 + sp * 26 + (boosting ? 500 : 0), t, 0.1);
      this.engGain.gain.setTargetAtTime(0.08 + Math.min(sp, 40) * 0.0011, t, 0.12);
      const drifting = player.drifting && sp > 6 && !player.airborne;
      this.drGain.gain.setTargetAtTime(drifting ? 0.035 : 0, t, drifting ? 0.05 : 0.09);
      this.drFilter.frequency.setTargetAtTime(1000 + (player.driftLevel || 0) * 260, t, 0.06);
    } else {
      this.engGain.gain.setTargetAtTime(0, t, 0.12);
      this.drGain.gain.setTargetAtTime(0, t, 0.05);
    }
    // item roulette: music-box ticks walking up a pentatonic scale
    if (this._rouletteActive && live) {
      this._rouletteTimer -= dt; this._rouletteElapsed += dt;
      if (this._rouletteTimer <= 0) {
        this._rouletteTimer = 0.085;
        const i = this._rouletteIdx++;
        this.musicBox(84 + PENTA[i % 5] + 12 * (Math.floor(i / 5) % 2), 0.045);
      }
      if (this._rouletteElapsed > 3) this._rouletteActive = false;
    }
  }

  // ------------------------------------------------------------------ voice helpers
  _env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  _tone(type, freq, t, dur, peak, dest, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain(); this._env(g, t, attack, peak, Math.max(0.02, dur));
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return { o, g };
  }
  _noise(t, dur, peak, filterType, freq, q = 1, dest) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = ctx.createGain(); this._env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    const off = Math.random() * Math.max(0, 1.9 - dur);
    s.start(t, off); s.stop(t + dur + 0.05);
    return { s, f, g };
  }
  /** Bell: inharmonic partials, long decay. */
  _bell(m, t, peak, dest, decay = 1.4) {
    const f = mtof(m);
    this._tone('sine', f, t, decay, peak, dest, 0.003);
    this._tone('sine', f * 2.0, t, decay * 0.6, peak * 0.35, dest, 0.002);
    this._tone('sine', f * 2.76, t, decay * 0.4, peak * 0.22, dest, 0.002);
    this._tone('sine', f * 5.4, t, decay * 0.18, peak * 0.1, dest, 0.001);
  }
  _sfxBell(m, t, peak, decay = 1.1) {
    this._bell(m, t, peak, this.sfxGain, decay);
    if (this.sfxVerb) this._tone('sine', mtof(m), t, decay * 0.6, peak * 0.5, this.sfxVerb, 0.003);
  }
  atPos(pos, maxGain, fn) {
    if (!this.gameplay) return;
    let g = maxGain;
    if (pos && this.camera) {
      const d = this.camera.position.distanceTo(pos);
      g = maxGain * clamp(1 - d / 140, 0, 1);
    }
    if (g > 0.03) fn(g);
  }

  // ------------------------------------------------------------------ SFX (soft, round, cute)
  beep(freq, dur, type = 'sine', vol = 0.12) { if (this.ctx) this._tone(type, freq, this.ctx.currentTime, dur, vol); }
  musicBox(m, vol = 0.05) {
    const t = this.ctx.currentTime, f = mtof(m);
    this._tone('sine', f, t, 0.22, vol, this.sfxGain, 0.002);
    this._tone('sine', f * 3, t, 0.06, vol * 0.4, this.sfxGain, 0.001);
  }
  uiClick(kind) {
    const t = this.ctx.currentTime;
    if (kind === 0) { this._tone('sine', mtof(88), t, 0.07, 0.07, this.sfxGain, 0.002); this._tone('sine', mtof(88) * 4, t, 0.02, 0.02); }
    else if (kind === 1) { this._sfxBell(79, t, 0.06, 0.4); this._sfxBell(86, t + 0.07, 0.06, 0.6); }
    else { this._tone('sine', mtof(81), t, 0.08, 0.07, this.sfxGain, 0.002); this._tone('sine', mtof(74), t + 0.07, 0.12, 0.07, this.sfxGain, 0.002); }
  }
  countBeep(n) {
    const t = this.ctx.currentTime;
    this._marimbaSfx(n === 1 ? 79 : 74, t, 0.16);
  }
  goChord() {
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((m, i) => this._sfxBell(m + 12, t + i * 0.025, 0.07, 1.2));
    this._noise(t, 0.6, 0.05, 'highpass', 7000);
  }
  _marimbaSfx(m, t, vol) {
    const f = mtof(m);
    this._tone('sine', f, t, 0.45, vol, this.sfxGain, 0.002);
    this._tone('sine', f * 3.92, t, 0.06, vol * 0.25, this.sfxGain, 0.001);
  }
  /** Note pickup: a quick rising chime that climbs with the note count. */
  noteChime(count = 0) {
    const t = this.ctx.currentTime;
    const base = 81 + PENTA[clamp(count, 0, 10) % 5] + (count >= 5 ? 12 : 0);
    [0, 4, 7].forEach((iv, i) => this._sfxBell(base + iv, t + i * 0.045, 0.045, 0.5));
  }
  prismShimmer() {
    const t = this.ctx.currentTime;
    [84, 86, 88, 91, 93, 96].forEach((m, i) => this._tone('sine', mtof(m), t + i * 0.03, 0.25, 0.035, this.sfxVerb || this.sfxGain, 0.002));
    this._noise(t, 0.35, 0.03, 'highpass', 8000);
  }
  gotItem() {
    const t = this.ctx.currentTime;
    this._sfxBell(84, t, 0.06, 0.5); this._sfxBell(91, t + 0.08, 0.07, 0.9);
  }
  sparkTick(level, vol = 1) {
    const t = this.ctx.currentTime;
    const base = [0, 79, 84, 91][clamp(level | 0, 1, 3)];
    this._tone('triangle', mtof(base), t, 0.12, 0.06 * vol, this.sfxGain, 0.002);
    this._tone('sine', mtof(base + 7), t + 0.04, 0.16, 0.05 * vol, this.sfxGain, 0.002);
  }
  whoosh(dur = 0.6, pitch = 1) {
    const t = this.ctx.currentTime;
    const n = this._noise(t, dur, 0.16, 'bandpass', 380 * pitch, 1.0);
    n.f.frequency.exponentialRampToValueAtTime(2600 * pitch, t + dur * 0.5);
    n.f.frequency.exponentialRampToValueAtTime(800, t + dur);
    const o = this._tone('sine', 180 * pitch, t, dur, 0.04);
    o.o.frequency.exponentialRampToValueAtTime(520 * pitch, t + dur * 0.8);
  }
  cometWhoosh() {
    this.whoosh(0.7, 1.1);
    const t = this.ctx.currentTime;
    [79, 83, 86, 91].forEach((m, i) => this._tone('sine', mtof(m + 12), t + 0.05 + i * 0.05, 0.2, 0.025, this.sfxVerb || this.sfxGain));
  }
  hitSound(kind, vol = 1) {
    const t = this.ctx.currentTime;
    if (kind === 'shrink') {
      const o = this._tone('sine', 900, t, 0.5, 0.08 * vol);
      o.o.frequency.exponentialRampToValueAtTime(260, t + 0.5);
      return;
    }
    // a cartoon "boing-wobble": round sine dropping with a vibrato, plus a soft thump
    const o = this._tone('sine', 620, t, 0.55, 0.12 * vol);
    o.o.frequency.exponentialRampToValueAtTime(180, t + 0.55);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 14;
    const lg = this.ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg); lg.connect(o.o.frequency); lfo.start(t); lfo.stop(t + 0.6);
    this._noise(t, 0.12, 0.12 * vol, 'lowpass', 900);
    this._tone('sine', 110, t, 0.18, 0.18 * vol);
  }
  hitConfirm() { const t = this.ctx.currentTime; this._sfxBell(91, t, 0.05, 0.4); this._sfxBell(96, t + 0.06, 0.04, 0.5); }
  thud(intensity = 0.5, freq = 120) {
    const t = this.ctx.currentTime;
    const o = this._tone('sine', freq, t, 0.16, 0.26 * intensity);
    o.o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    this._noise(t, 0.06, 0.1 * intensity, 'lowpass', 500);
  }
  boing() {
    const t = this.ctx.currentTime;
    const o = this._tone('sine', 260, t, 0.25, 0.08);
    o.o.frequency.exponentialRampToValueAtTime(700, t + 0.2);
  }
  throwSound(item) {
    const t = this.ctx.currentTime;
    if (item === 'mushroom' || item === 'triple_mushroom') return; // kart:boost plays the comet whoosh
    if (item === 'star') { [72, 76, 79, 84, 88, 91].forEach((m, i) => this._sfxBell(m + 12, t + i * 0.05, 0.04, 0.6)); return; }
    if (item === 'lightning' || item === 'horn') return;
    const n = this._noise(t, 0.22, 0.12, 'bandpass', 1800, 1.4);
    n.f.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    const o = this._tone('sine', 520, t, 0.14, 0.05);
    o.o.frequency.exponentialRampToValueAtTime(1100, t + 0.14);
  }
  /** Sunflower burst: soft whoomp + scattering petal pings. */
  bloomBurst(vol = 1) {
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.9, 0.32 * vol, 'lowpass', 1600, 0.6);
    n.f.frequency.exponentialRampToValueAtTime(140, t + 0.8);
    const o = this._tone('sine', 120, t, 0.6, 0.4 * vol);
    o.o.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    for (let i = 0; i < 5; i++) this._tone('sine', mtof(84 + PENTA[i]), t + 0.08 + i * 0.05, 0.25, 0.03 * vol, this.sfxVerb || this.sfxGain);
  }
  explosion(vol = 1) { this.bloomBurst(vol); }
  pop(vol = 1) {
    const t = this.ctx.currentTime;
    this._noise(t, 0.14, 0.22 * vol, 'bandpass', 1300, 0.8);
    const o = this._tone('sine', 420, t, 0.12, 0.1 * vol);
    o.o.frequency.exponentialRampToValueAtTime(140, t + 0.12);
  }
  /** Eclipse: a descending glassy shimmer over a low swell. */
  eclipse() {
    const t = this.ctx.currentTime;
    [96, 93, 91, 88, 86, 84, 81].forEach((m, i) => this._tone('sine', mtof(m), t + i * 0.05, 0.3, 0.035, this.sfxVerb || this.sfxGain));
    const o = this._tone('sine', 90, t, 1.0, 0.25, null, 0.15);
    o.o.frequency.exponentialRampToValueAtTime(45, t + 1.0);
  }
  zap() { this.eclipse(); }
  lapChime() {
    const t = this.ctx.currentTime;
    [79, 84, 88].forEach((m, i) => this._marimbaSfx(m, t + i * 0.09, 0.12));
    this._sfxBell(91, t + 0.27, 0.06, 1.0);
  }
  finalLapJingle() {
    const t = this.ctx.currentTime;
    const seq = [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.6], [84, 0.72], [88, 0.96]];
    for (const [m, dt] of seq) this._marimbaSfx(m, t + dt, 0.13);
    this._sfxBell(88, t + 0.96, 0.07, 1.4);
    this._sfxBell(79, t + 0.96, 0.05, 1.4);
  }
  fanfare(place = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const good = place <= 3;
    const seq = good
      ? [[72, 0], [76, 0.14], [79, 0.28], [84, 0.42], [81, 0.7], [84, 0.84], [88, 1.0]]
      : [[76, 0], [74, 0.22], [72, 0.44], [74, 0.66], [72, 0.95]];
    for (const [m, dt] of seq) this._marimbaSfx(m, t + dt, 0.14);
    if (good) { [72, 76, 79, 84].forEach((m) => this._sfxBell(m + 12, t + 1.0, 0.045, 1.8)); this._noise(t + 1.0, 1.2, 0.04, 'highpass', 7000); }
    else this._sfxBell(79, t + 0.95, 0.05, 1.4);
  }
  celebrate() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => this._sfxBell(m, t + i * 0.06, 0.05, 1.0));
  }
  coinSound() { this.noteChime(0); }
  coinLossSound() {
    const t = this.ctx.currentTime;
    [91, 88, 84].forEach((m, i) => this._tone('sine', mtof(m), t + i * 0.06, 0.1, 0.04));
  }
  trickSound() {
    const t = this.ctx.currentTime;
    const o = this._tone('sine', 520, t, 0.28, 0.08);
    o.o.frequency.exponentialRampToValueAtTime(1300, t + 0.2);
    this._sfxBell(91, t + 0.16, 0.04, 0.5);
  }
  splashSound(lava = false, vol = 1) {
    const t = this.ctx.currentTime;
    const n = this._noise(t, lava ? 0.9 : 0.6, 0.25 * vol, lava ? 'highpass' : 'bandpass', lava ? 2200 : 1400, 0.7);
    n.f.frequency.exponentialRampToValueAtTime(lava ? 5000 : 300, t + 0.5);
    const o = this._tone('sine', lava ? 400 : 520, t, 0.45, 0.1 * vol);
    o.o.frequency.exponentialRampToValueAtTime(lava ? 90 : 130, t + 0.45);
  }
  /** Falling into the starry night: a soft descending chime with a shimmer. */
  nightFall(vol = 1) {
    const t = this.ctx.currentTime;
    [96, 91, 88, 84, 79, 76].forEach((m, i) => this._tone('sine', mtof(m), t + i * 0.09, 0.4, 0.045 * vol, this.sfxVerb || this.sfxGain, 0.003));
    const o = this._tone('sine', 520, t, 0.9, 0.06 * vol, null, 0.05);
    o.o.frequency.exponentialRampToValueAtTime(180, t + 0.9);
  }
  rescueSound() {
    const t = this.ctx.currentTime;
    [76, 79, 84, 88].forEach((m, i) => this._sfxBell(m, t + 0.5 + i * 0.08, 0.04, 0.6));
  }
  droneSound() { this.rescueSound(); }
  featherSound() {
    const t = this.ctx.currentTime;
    const n = this._noise(t, 1.4, 0.16, 'bandpass', 500, 0.8);
    n.f.frequency.exponentialRampToValueAtTime(2400, t + 0.7);
    [72, 79, 84, 88].forEach((m, i) => this._tone('sine', mtof(m), t + i * 0.1, 0.4, 0.04, this.sfxVerb || this.sfxGain, 0.02));
  }
  rocketSound() { this.featherSound(); }
  veilSound() {
    const t = this.ctx.currentTime;
    const o = this._tone('sine', 880, t, 1.0, 0.07, null, 0.1);
    o.o.frequency.exponentialRampToValueAtTime(440, t + 1.0);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 6;
    const lg = this.ctx.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.o.frequency); lfo.start(t); lfo.stop(t + 1.1);
  }
  ghostSound() { this.veilSound(); }
  /** Résonance — Lumen's call: a big warm bell with a low hum. */
  resonanceBell(vol = 1) {
    const t = this.ctx.currentTime;
    this._sfxBell(67, t, 0.16 * vol, 2.2);
    this._sfxBell(74, t + 0.02, 0.07 * vol, 1.8);
    this._tone('sine', mtof(43), t, 1.2, 0.16 * vol, null, 0.02);
  }
  hornSound(vol = 1) { this.resonanceBell(vol); }
  stealSound(gain) {
    const t = this.ctx.currentTime;
    const seq = gain ? [79, 84, 91] : [91, 84, 79];
    seq.forEach((m, i) => this._tone('sine', mtof(m), t + i * 0.07, 0.14, 0.07));
  }
  clink() { const t = this.ctx.currentTime; this._sfxBell(96, t, 0.05, 0.3); this._noise(t, 0.05, 0.08, 'highpass', 4000); }
  clank() { this.clink(); }

  // ------------------------------------------------------------------ music sequencer
  _schedule() {
    if (!this.ctx || !this.songName || this.ctx.state !== 'running') return;
    const song = SONGS[this.songName];
    if (!song) return;
    const now = this.ctx.currentTime;
    if (this._nextTime < now - 0.2) this._nextTime = now + 0.03; // tab was asleep
    const stepDur = 60 / (song.bpm * this.tempoScale) / 4;
    while (this._nextTime < now + 0.14) {
      try { this._playStep(song, this._step, this._nextTime, stepDur); } catch { /* never break the scheduler */ }
      this._nextTime += stepDur;
      this._step = (this._step + 1) % song.steps;
    }
  }

  _voice(type, freq, t, dur, vol, { attack = 0.006, cutoff = 0, dest = null, release = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    if (release) { g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
    let last = o;
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); last = f; }
    last.connect(g); g.connect(dest || this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  _inst(kind, m, t, dur, vol) {
    const f = mtof(m);
    switch (kind) {
      case 'marimba':
        this._voice('sine', f, t, Math.min(0.7, dur + 0.25), vol, { attack: 0.002 });
        this._voice('sine', f * 3.93, t, 0.07, vol * 0.22, { attack: 0.001 });
        this._voice('sine', f * 2, t, 0.18, vol * 0.18, { attack: 0.002 });
        break;
      case 'pan':
        this._voice('sine', f, t, Math.min(0.9, dur + 0.3), vol, { attack: 0.003 });
        this._voice('sine', f * 2, t, 0.35, vol * 0.4, { attack: 0.003 });
        this._voice('sine', f * 3.01, t, 0.15, vol * 0.18, { attack: 0.002 });
        break;
      case 'kalimba':
        this._voice('sine', f, t, 0.75, vol, { attack: 0.002 });
        this._voice('triangle', f * 2, t, 0.09, vol * 0.25, { attack: 0.001 });
        this._voice('sine', f * 5.95, t, 0.03, vol * 0.08, { attack: 0.001 });
        break;
      case 'bell':
        this._voice('sine', f, t, Math.max(0.9, dur * 1.4), vol, { attack: 0.003 });
        this._voice('sine', f * 2.76, t, 0.45, vol * 0.18, { attack: 0.002 });
        this._voice('sine', f * 5.4, t, 0.18, vol * 0.07, { attack: 0.001 });
        break;
      case 'glass':
        this._voice('sine', f, t, 0.5, vol, { attack: 0.004 });
        this._voice('sine', f * 2.01, t, 0.25, vol * 0.3, { attack: 0.003 });
        break;
      case 'flute': {
        const o = this._voice('sine', f, t, dur, vol, { attack: 0.05, release: Math.min(0.12, dur * 0.4) });
        this._voice('triangle', f, t, dur, vol * 0.25, { attack: 0.06, cutoff: 1800, release: Math.min(0.12, dur * 0.4) });
        if (dur > 0.25) {
          const l = this.ctx.createOscillator(); l.frequency.value = 5.2;
          const lg = this.ctx.createGain(); lg.gain.value = 9;
          l.connect(lg); lg.connect(o.detune); l.start(t + 0.12); l.stop(t + dur);
        }
        this._noise(t, 0.08, vol * 0.25, 'bandpass', f * 2, 2, this.musicGain);
        break;
      }
      case 'oud':
        this._voice('triangle', f, t, Math.min(0.6, dur + 0.15), vol, { attack: 0.002, cutoff: 2400 });
        this._voice('sawtooth', f, t, 0.12, vol * 0.18, { attack: 0.001, cutoff: 1600 });
        break;
      case 'keys': {
        this._voice('sine', f, t, Math.min(1.2, dur + 0.4), vol, { attack: 0.004 });
        this._voice('sine', f * 2, t, 0.3, vol * 0.25, { attack: 0.003 });
        this._voice('sine', f * 7, t, 0.04, vol * 0.05, { attack: 0.001 });
        break;
      }
      default:
        this._voice('triangle', f, t, dur, vol, { attack: 0.005 });
    }
  }
  _kick(t, vol = 0.45) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.3);
  }
  _snare(t, vol = 0.16) { this._noise(t, 0.12, vol, 'bandpass', 2200, 0.9, this.musicGain); }
  _hat(t, vol = 0.04, open = false) { this._noise(t, open ? 0.1 : 0.03, vol, 'highpass', 7000, 0.7, this.musicGain); }
  _hand(t, freq, vol, dur) {
    const o = this._voice('sine', freq, t, dur, vol, { attack: 0.002 });
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur);
  }
  _drums(style, s, t, bar, song) {
    const p = DRUMS[style];
    if (!p) return;
    const fin = this.finalLap;
    if (p.k?.[s] === 'k') this._kick(t, style === 'halftime' ? 0.4 : 0.42);
    if (p.s?.[s] === 's') this._snare(t, style === 'city' ? 0.14 : 0.11);
    if (p.h?.[s] === 'h' || (fin && s % 2 === 1)) this._hat(t, style === 'breeze' ? 0.02 : 0.03);
    if (p.d?.[s] === 'd') this._hand(t, 110, 0.32, 0.22);
    if (p.t?.[s] === 't') { this._noise(t, 0.05, 0.1, 'bandpass', 3200, 1.6, this.musicGain); this._hand(t, 420, 0.06, 0.06); }
    if (p.l?.[s] === 'l') this._hand(t, 196 + ((bar % 2) * 66), 0.16, 0.18);
  }
  _bass(song, s, t, sd, chord, root) {
    const b = root - 24;
    const sub = (m, len, v = 0.16) => this._voice('sine', mtof(m), t, sd * len, v, { attack: 0.01 }) && this._voice('triangle', mtof(m), t, sd * Math.min(len, 2), v * 0.3, { attack: 0.005, cutoff: 700 });
    switch (song.bass) {
      case 'round': if (s === 0) sub(b, 6); else if (s === 8) sub(b + 7, 6, 0.12); break;
      case 'island': if (s === 0) sub(b, 3); else if (s === 6) sub(b + 7, 2, 0.12); else if (s === 10) sub(b, 3, 0.13); break;
      case 'pluck': if (s % 4 === 0) this._voice('triangle', mtof(s === 8 ? b + 7 : b), t, sd * 2.5, 0.16, { attack: 0.003, cutoff: 650 }); break;
      case 'walk': if (s % 4 === 0) { const w = [0, chord[1] - chord[0], 7, chord[1] - chord[0] + 0][s / 4]; sub(b + w, 3, 0.13); } break;
      default: if (s === 0) sub(b, 8);
    }
  }
  _playStep(song, step, t, sd) {
    const barIdx = Math.floor(step / 16) % song.bars;
    const s = step % 16;
    const chord = song.chordTones[barIdx];
    const root = song.key + chord[0];
    // pad: warm detuned triangles, one per bar
    if (song.pad && s === 0) {
      for (const semi of chord) {
        const m = song.key - 12 + semi;
        this._voice('triangle', mtof(m), t, sd * 16, song.pad, { attack: 0.35, cutoff: 1100, release: 0.5 });
        this._voice('sine', mtof(m) * 1.005, t, sd * 16, song.pad * 0.6, { attack: 0.4, release: 0.5 });
      }
    }
    this._bass(song, s, t, sd, chord, root);
    this._drums(song.drums, s, t, barIdx, song);
    // arpeggio ripple
    const every = song.arpEvery || 1;
    if (song.arp && s % every === 0) {
      const pat = song.arpPat || [0, 1, 2, 3];
      const idx = pat[(s / every) % pat.length];
      const m = song.key - (song.key >= 70 ? 12 : 0) + (idx >= chord.length ? chord[0] + 12 : chord[idx]);
      this._inst(song.arp, m, t, sd * every, song.arp === 'kalimba' ? 0.035 : 0.028);
    }
    // lead melody (+ an octave-down counter voice on long notes)
    const ev = song.melSteps[step];
    if (ev) {
      this._inst(song.lead, ev.m, t, sd * ev.len, song.leadVol || 0.09);
      if (song.counter && ev.len >= 4) this._inst(song.counter, ev.m - 12, t, sd * ev.len, (song.leadVol || 0.09) * 0.45);
      if (this.finalLap && song.lead !== 'bell') this._inst('glass', ev.m + 12, t, sd * 2, 0.018);
    }
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs = [];
    clearInterval(this._sched);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this._onGesture);
      window.removeEventListener('keydown', this._onGesture);
      window.removeEventListener('touchstart', this._onGesture);
      window.removeEventListener('touchend', this._onGesture);
    }
    try { this.ctx && this.ctx.close(); } catch { /* ignore */ }
  }
}

export const __test = { SONGS, SONG_DEFS, compile, parseToken };
