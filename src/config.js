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
  miniTurboTimes: [0.55, 0.45, 0.5], // blue, orange, purple boost durations (s)
  driftChargeThresholds: [0.9, 1.9, 3.0], // seconds of drifting needed to reach each level
  mushroomBoostTime: 1.3,
  starTime: 7.5,
  spinOutTime: 1.1,
  tumbleTime: 1.6,
  lightningShrinkTime: 5,
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

export const DIFFICULTY = {
  easy:    { aiSpeedFactor: 0.86, aiSkill: 0.55, rubberBand: 0.08, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
  normal:  { aiSpeedFactor: 0.94, aiSkill: 0.75, rubberBand: 0.12, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
  hard:    { aiSpeedFactor: 1.00, aiSkill: 0.95, rubberBand: 0.16, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
  extreme: { aiSpeedFactor: 1.00, aiSkill: 1.0, rubberBand: 0.18, speedFactor: 1, handlingFactor: 1, accelFactor: 1 },
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
