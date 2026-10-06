// Shared tuning + roster. Every module reads from here; do not duplicate these values.

export const GAME_TITLE = 'Lumen Kart';

export const RACE = {
  laps: 3,
  racers: 8,
  countdownSeconds: 3,
};

// World scale: 1 unit = 1 meter. Y is up. Track lies roughly in the XZ plane.
export const PHYSICS = {
  gravity: 38,
  kartRadius: 1.3,          // collision radius (kart vs kart / wall / items)
  maxSpeed: 38,             // base top speed on road (units/s) before stat modifiers
  reverseMaxSpeed: 12,
  accel: 22,
  brakeDecel: 45,
  coastDecel: 8,
  offroadMaxSpeedFactor: 0.45,
  boostSpeedBonus: 16,      // added to max speed while boosting
  // Lumen Kart: mini-turbos escalate (mint < dawn < comet) so the violet one feels like a real reward.
  miniTurboTimes: [0.5, 0.8, 1.15], // stage 1 (mint), 2 (dawn), 3 (comet violet) boost durations (s)
  driftChargeThresholds: [0.8, 1.7, 2.7], // seconds of drifting (at charge rate 1) needed for each stage
  mushroomBoostTime: 1.3,
  starTime: 7.5,
  spinOutTime: 1.1,
  tumbleTime: 1.6,
  lightningShrinkTime: 5,
};

// Game-feel knobs shared by kart.js / camera.js / effects.js (documented in docs/agents/gameplay.md).
export const FEEL = {
  hitStop: { spin: 0.05, tumble: 0.085, shrink: 0.04 }, // per-kart freeze on impact (s, simulation time)
  steerRiseTime: 0.09,       // player steering: 0 -> full lock (digital touch arrows are ramped)
  steerFallTime: 0.06,       // full lock -> centre
  lowSteerGripBonus: 0.3,    // lateral grip x(1 + bonus * (1 - |steer|)): tighter when barely steering
  driftEntrySteer: 0.15,     // |steer| needed to commit a drift while drift is held
  wallGlanceKeep: 0.98,      // tangential speed kept on a shallow (glancing) wall contact
};

// Steering assist defaults ("aide à la direction"). The UI sets kart.assist = { steering, strength }.
export const ASSIST = {
  defaultStrength: 0.6,
  defaultOnFor: ['50cc'],    // classes where the settings screen should default the assist ON
};

// stats are 1..5. speed -> top speed, accel -> acceleration, handling -> turn rate/drift,
// weight -> bump resolution (heavier pushes lighter).
export const CHARACTERS = [
  // `species` drives the driver model in models.js; `title` is the bilingual tagline shown in menus.
  { id: 'lumen', name: 'Lumen', species: 'fox',     color: 0x387d76, accent: 0xe98c73, skin: 0xfff7dc, hat: 'leaves', title: { fr: 'Le petit renard à l’écharpe', en: 'The little fox with the scarf' }, stats: { speed: 3, accel: 3, handling: 4, weight: 3 } },
  { id: 'zina',  name: 'Zina',  species: 'fennec',  color: 0xd9a35b, accent: 0x2f8fc7, skin: 0xf6e3c2, hat: 'chechia', title: { fr: 'Fennec de Tozeur', en: 'Fennec from Tozeur' }, stats: { speed: 2, accel: 4, handling: 5, weight: 1 } },
  { id: 'pip',   name: 'Pip',   species: 'raccoon', color: 0x6d7b8c, accent: 0xf2c14e, skin: 0xd8d2c8, hat: 'cap',     title: { fr: 'Raton des toits de la Ville', en: 'Rooftop raccoon of the City' }, stats: { speed: 3, accel: 4, handling: 3, weight: 2 } },
  { id: 'coralie', name: 'Coralie', species: 'crab', color: 0xe8604c, accent: 0x7fd6d0, skin: 0xff9a7a, hat: 'shell', title: { fr: 'Crabe des Lagons', en: 'Lagoon crab' }, stats: { speed: 2, accel: 5, handling: 4, weight: 2 } },
  { id: 'rivo',  name: 'Rivo',  species: 'frog',    color: 0x47b36b, accent: 0xffd23f, skin: 0x9be08a, hat: 'leafcap', title: { fr: 'Grenouille d’Amazonie', en: 'Amazon tree frog' }, stats: { speed: 3, accel: 4, handling: 4, weight: 1 } },
  { id: 'jagu',  name: 'Jagu',  species: 'jaguar',  color: 0xe0a23a, accent: 0x2b2b2b, skin: 0xf3d9a4, hat: 'goggles', title: { fr: 'Jaguar de la canopée', en: 'Canopy jaguar' }, stats: { speed: 5, accel: 2, handling: 3, weight: 3 } },
  { id: 'kibo',  name: 'Kibo',  species: 'lion',    color: 0xc98a3c, accent: 0x8b3a2b, skin: 0xf0c987, hat: 'mane',    title: { fr: 'Lionceau de la savane', en: 'Savanna lion cub' }, stats: { speed: 4, accel: 2, handling: 2, weight: 5 } },
  { id: 'nox',   name: 'Nox',   species: 'night',   color: 0x2b2160, accent: 0xb7a6ff, skin: 0x433a8a, hat: 'stars',   title: { fr: 'La Nuit qui revient', en: 'The returning Night' }, stats: { speed: 5, accel: 1, handling: 2, weight: 5 } },
];

export const ITEMS = ['coin', 'banana', 'triple_banana', 'green_shell', 'triple_green', 'red_shell', 'mushroom', 'triple_mushroom',
  'bomb', 'ghost', 'star', 'bullet', 'lightning', 'blue_shell', 'horn'];

// Per engine class tuning (difficulty key == CLASSES[i].ai). aiSpeedFactor: AI top-speed multiplier.
// rubberBandBehind/Ahead: max extra/less top speed when an AI is behind/ahead of the player (fraction).
// driftChargeMul: mini-turbo charge speed for every kart of the race (50/100cc are more generous).
export const DIFFICULTY = {
  easy:    { aiSpeedFactor: 0.9, aiSkill: 0.55, rubberBand: 0.03, rubberBandBehind: 0.03, rubberBandAhead: 0.07, driftChargeMul: 1.3, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
  normal:  { aiSpeedFactor: 0.95, aiSkill: 0.75, rubberBand: 0.08, rubberBandBehind: 0.08, rubberBandAhead: 0.05, driftChargeMul: 1.15, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
  hard:    { aiSpeedFactor: 0.99, aiSkill: 0.95, rubberBand: 0.12, rubberBandBehind: 0.12, rubberBandAhead: 0.035, driftChargeMul: 1.0, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
  extreme: { aiSpeedFactor: 1.00, aiSkill: 1.0, rubberBand: 0.12, rubberBandBehind: 0.12, rubberBandAhead: 0.02, driftChargeMul: 1.0, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
};
// 'medium' (used by the online/mobile code) is an alias of 'normal'.
Object.defineProperty(DIFFICULTY, 'medium', { value: DIFFICULTY.normal });
export function normalizeDifficulty(value) {
  return value === 'medium' ? 'normal' : Object.hasOwn(DIFFICULTY, value) ? value : 'normal';
}

// Engine classes: speed multiplier applied to every kart + AI difficulty used.
export const CLASSES = [
  { id: '50cc', label: '50cc', sub: 'EASY', speed: 0.86, ai: 'easy' },
  { id: '100cc', label: '100cc', sub: 'NORMAL', speed: 1.0, ai: 'normal' },
  { id: '150cc', label: '150cc', sub: 'HARD', speed: 1.12, ai: 'hard' },
  { id: '200cc', label: '200cc', sub: 'EXTREME', speed: 1.3, ai: 'extreme' },
  { id: 'mirror', label: 'MIRROR', sub: '150cc FLIPPED', speed: 1.12, ai: 'hard', mirror: true },
];

export const KEYS = {
  accelerate: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['Space', 'ShiftRight'],
  item: ['KeyE', 'ShiftLeft', 'KeyX'],
  lookBack: ['KeyC'],
  pause: ['Escape', 'KeyP'],
};
