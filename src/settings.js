// Lumen Kart — player settings (audio, language, controls, assist, haptics, graphics). Node-safe.

export const SETTINGS_KEY = 'lumenkart.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  music: 0.7,            // 0..1
  sfx: 0.9,              // 0..1
  lang: 'auto',          // 'auto' | 'fr' | 'en'
  steering: 'touch',     // 'touch' | 'tilt'
  assist: 'auto',        // 'auto' (on in 50cc) | 'on' | 'off'
  haptics: true,
  quality: 'auto',       // 'auto' | 'high' | 'medium' | 'low'
  showFps: false,
  reduceMotion: false,   // accessibility: calmer camera + no speed streaks + fewer UI animations
  last: { mode: 'gp', classId: '100cc', cupId: null, trackId: null, charIndex: 0, laps: 3 },
});

const pick = (v, list, d) => (list.includes(v) ? v : d);
const unit = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

export function sanitizeSettings(raw) {
  const d = DEFAULT_SETTINGS;
  const r = raw && typeof raw === 'object' ? raw : {};
  const l = r.last && typeof r.last === 'object' ? r.last : {};
  return {
    music: unit(r.music, d.music),
    sfx: unit(r.sfx, d.sfx),
    lang: pick(r.lang, ['auto', 'fr', 'en'], d.lang),
    steering: pick(r.steering, ['touch', 'tilt'], d.steering),
    assist: pick(r.assist, ['auto', 'on', 'off'], d.assist),
    haptics: typeof r.haptics === 'boolean' ? r.haptics : d.haptics,
    quality: pick(r.quality, ['auto', 'high', 'medium', 'low'], d.quality),
    showFps: r.showFps === true,
    reduceMotion: r.reduceMotion === true,
    last: {
      mode: pick(l.mode, ['gp', 'vs', 'tt'], d.last.mode),
      classId: typeof l.classId === 'string' ? l.classId.slice(0, 20) : d.last.classId,
      cupId: typeof l.cupId === 'string' ? l.cupId.slice(0, 40) : null,
      trackId: typeof l.trackId === 'string' ? l.trackId.slice(0, 40) : null,
      charIndex: Number.isInteger(l.charIndex) && l.charIndex >= 0 && l.charIndex < 32 ? l.charIndex : 0,
      laps: [1, 2, 3, 5].includes(l.laps) ? l.laps : 3,
    },
  };
}

export function loadSettings(storage) {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch { return sanitizeSettings(null); }
}

export function saveSettings(storage, settings) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings))); } catch { /* quota / private mode */ }
}

/**
 * Steering assist on/off for a given engine class. 'auto' = on in 50cc for everybody and, for touch players
 * (thumbs on glass, auto-throttle), also in 100cc; keyboard / gamepad players keep it off from 100cc up.
 */
export function assistFor(settings, classId, autoClasses = ['50cc'], { touch = false, touchClasses = ['50cc', '100cc'] } = {}) {
  const a = settings?.assist || 'auto';
  if (a === 'on') return true;
  if (a !== 'auto') return false;
  return autoClasses.includes(classId) || (touch && touchClasses.includes(classId));
}

/** Resolve 'auto' quality from the device. env = { mobile, memory, cores }. */
export function resolveQuality(pref, env = {}) {
  if (pref === 'high' || pref === 'medium' || pref === 'low') return pref;
  const { mobile = false, memory = 8, cores = 8 } = env;
  if (mobile) return memory <= 3 || cores <= 4 ? 'low' : 'medium';
  return memory <= 2 || cores <= 2 ? 'medium' : 'high';
}

/** Renderer knobs per quality level. */
export function qualityPreset(level, { mobile = false, dpr = 1 } = {}) {
  if (level === 'low') return { level, pixelRatio: Math.min(dpr, 1), shadows: false, bloom: false, antialias: false };
  if (level === 'medium') return { level, pixelRatio: Math.min(dpr, mobile ? 1.25 : 1.5), shadows: true, softShadows: false, bloom: false, antialias: !mobile };
  return { level: 'high', pixelRatio: Math.min(dpr, mobile ? 1.5 : 2), shadows: true, softShadows: true, bloom: !mobile, antialias: !mobile };
}
