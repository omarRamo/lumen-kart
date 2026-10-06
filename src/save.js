// Lumen Kart — versioned progression save. Pure logic + a tiny storage wrapper; never throws on bad data.
//
// Schema (lumenkart.save.v1):
// {
//   version: 1,
//   notes: number            // total ♪ notes ever collected (cosmetic currency, never spent)
//   races, wins, podiums: number
//   medals:  { [cupId]: { [classId]: 1|2|3 } }            // best GP finish per cup and class
//   records: { [trackId | trackId+':m']: { time, lap, char } } // time-trial records (':m' = mirror)
//   scarf:   string           // chosen scarf id for Lumen (must be unlocked)
//   tutorial:{ drift: bool, items: bool, notes: bool }   // first-race hints already shown
//   createdAt, updatedAt: number (ms)
// }
// Unlocks are *derived* from medals/notes (never stored), so they can never desync from progress.

export const SAVE_KEY = 'lumenkart.save.v1';
export const SAVE_VERSION = 1;
export const CLASS_IDS = ['50cc', '100cc', '150cc', '200cc', 'mirror'];
export const DEFAULT_CUP_IDS = ['dawn', 'dusk'];
export const LOCKED_CHARACTERS = ['nox'];

// Lumen's scarf colours (the art agent paints the scarf with `character.accent`).
export const SCARVES = [
  { id: 'coral', color: 0xe98c73, cost: 0 },
  { id: 'gold', color: 0xedc371, cost: 60 },
  { id: 'mint', color: 0x7cc8a4, cost: 150 },
  { id: 'sky', color: 0x7cc4ef, cost: 300 },
  { id: 'rose', color: 0xe0719f, cost: 500 },
  { id: 'comet', color: 0xb592ea, cost: 750 },
  { id: 'aurora', color: 0x6fdcc0, cost: 1050 },
  { id: 'night', color: 0x4a3d9c, cost: 1400 },
];

const num = (v, d = 0, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : d);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function defaultSave(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    notes: 0, races: 0, wins: 0, podiums: 0,
    medals: {}, records: {},
    scarf: 'coral',
    tutorial: { drift: false, items: false, notes: false },
    createdAt: now, updatedAt: now,
  };
}

/** Upgrade an older shape to the current version. Unknown future versions are sanitized as-is. */
export function migrate(data) {
  if (!isObj(data)) return defaultSave();
  const v = Number(data.version) || 0;
  let out = { ...data };
  if (v < 1) {
    // v0 (pre-release builds): { coins, trophies: {cup-class: place}, tt: {track: {...}} }
    if (out.notes == null && Number.isFinite(out.coins)) out.notes = out.coins;
    if (isObj(out.trophies) && !out.medals) {
      out.medals = {};
      for (const [k, place] of Object.entries(out.trophies)) {
        const i = k.lastIndexOf('-');
        if (i <= 0) continue;
        const cup = k.slice(0, i), cls = k.slice(i + 1);
        (out.medals[cup] = out.medals[cup] || {})[cls] = place;
      }
    }
    if (isObj(out.tt) && !out.records) out.records = out.tt;
    out.version = 1;
  }
  return sanitize(out);
}

/** Keep only well-typed fields; anything odd falls back to defaults field by field. */
export function sanitize(data) {
  const s = defaultSave(num(data?.createdAt, Date.now(), 8.64e15));
  if (!isObj(data)) return s;
  s.notes = Math.floor(num(data.notes));
  s.races = Math.floor(num(data.races));
  s.wins = Math.floor(num(data.wins));
  s.podiums = Math.floor(num(data.podiums));
  s.updatedAt = num(data.updatedAt, s.createdAt, 8.64e15);
  if (isObj(data.medals)) {
    for (const [cup, byClass] of Object.entries(data.medals)) {
      if (!isObj(byClass) || cup.length > 40) continue;
      for (const [cls, place] of Object.entries(byClass)) {
        const p = Math.round(Number(place));
        if (p >= 1 && p <= 3 && cls.length <= 20) (s.medals[cup] = s.medals[cup] || {})[cls] = p;
      }
    }
  }
  if (isObj(data.records)) {
    for (const [key, rec] of Object.entries(data.records)) {
      if (!isObj(rec) || key.length > 60) continue;
      const time = num(rec.time, null, 3600), lap = num(rec.lap, null, 3600);
      if (!(time > 0) && !(lap > 0)) continue;
      s.records[key] = { time: time > 0 ? time : null, lap: lap > 0 ? lap : null, char: typeof rec.char === 'string' ? rec.char.slice(0, 20) : null };
    }
  }
  if (typeof data.scarf === 'string' && SCARVES.some((x) => x.id === data.scarf)) s.scarf = data.scarf;
  if (!isScarfUnlocked(s, s.scarf)) s.scarf = 'coral';
  if (isObj(data.tutorial)) for (const k of Object.keys(s.tutorial)) s.tutorial[k] = data.tutorial[k] === true;
  return s;
}

// ------------------------------------------------------------------------------------ queries
export function bestPlace(save, cupId) {
  const m = save?.medals?.[cupId];
  if (!m) return null;
  let best = null;
  for (const p of Object.values(m)) if (p >= 1 && p <= 3 && (best == null || p < best)) best = p;
  return best;
}
export function medal(save, cupId, classId) { return save?.medals?.[cupId]?.[classId] || null; }

export function isCupUnlocked(save, cupId, cupIds = DEFAULT_CUP_IDS) {
  const i = cupIds.indexOf(cupId);
  if (i <= 0) return true; // first cup, or a cup we don't know about
  const prev = bestPlace(save, cupIds[i - 1]);
  return prev != null && prev <= 3;
}
export function isMirrorUnlocked(save, cupIds = DEFAULT_CUP_IDS) {
  return cupIds.length > 0 && cupIds.every((id) => bestPlace(save, id) === 1);
}
export function isClassUnlocked(save, classId, cupIds = DEFAULT_CUP_IDS) {
  return classId === 'mirror' ? isMirrorUnlocked(save, cupIds) : true;
}
export function isCharacterUnlocked(save, charId, cupIds = DEFAULT_CUP_IDS) {
  if (charId !== 'nox') return true;
  const last = cupIds[cupIds.length - 1];
  return !!last && bestPlace(save, last) === 1;
}
/** cups: [{ id, tracks: [trackId] }]. A course is open when any cup holding it is open. */
export function isTrackUnlocked(save, trackId, cups = []) {
  const ids = cups.map((c) => c.id);
  const holders = cups.filter((c) => Array.isArray(c.tracks) && c.tracks.includes(trackId));
  if (!holders.length) return true;
  return holders.some((c) => isCupUnlocked(save, c.id, ids));
}
export function isScarfUnlocked(save, scarfId) {
  const sc = SCARVES.find((x) => x.id === scarfId);
  return !!sc && (save?.notes || 0) >= sc.cost;
}
export function scarfColor(save) {
  const sc = SCARVES.find((x) => x.id === save?.scarf && isScarfUnlocked(save, x.id));
  return (sc || SCARVES[0]).color;
}
export function nextScarf(save) {
  return SCARVES.find((x) => (save?.notes || 0) < x.cost) || null;
}
export function trophyCount(save) {
  let n = 0;
  for (const m of Object.values(save?.medals || {})) n += Object.keys(m).length;
  return n;
}

/** Snapshot of everything derived from the save (used to diff for celebration toasts). */
export function computeUnlocks(save, cupIds = DEFAULT_CUP_IDS) {
  return {
    cups: cupIds.filter((id) => isCupUnlocked(save, id, cupIds)),
    mirror: isMirrorUnlocked(save, cupIds),
    characters: LOCKED_CHARACTERS.filter((id) => isCharacterUnlocked(save, id, cupIds)),
    scarves: SCARVES.filter((x) => isScarfUnlocked(save, x.id)).map((x) => x.id),
  };
}
export function diffUnlocks(before, after) {
  const ev = [];
  for (const id of after.cups) if (!before.cups.includes(id)) ev.push({ type: 'cup', id });
  if (after.mirror && !before.mirror) ev.push({ type: 'mirror' });
  for (const id of after.characters) if (!before.characters.includes(id)) ev.push({ type: 'character', id });
  for (const id of after.scarves) if (!before.scarves.includes(id)) ev.push({ type: 'scarf', id });
  return ev;
}

// ------------------------------------------------------------------------------------ mutations
function touch(save) { save.updatedAt = Date.now(); return save; }

/** A Grand Prix finished. Returns celebration events (medal + any new unlocks). */
export function recordGrandPrix(save, { cupId, classId, place }, cupIds = DEFAULT_CUP_IDS) {
  const before = computeUnlocks(save, cupIds);
  const events = [];
  const p = Math.round(place);
  if (p >= 1 && p <= 3 && cupId && classId) {
    const prev = medal(save, cupId, classId);
    if (!prev || p < prev) {
      (save.medals[cupId] = save.medals[cupId] || {})[classId] = p;
      events.push({ type: 'medal', cupId, classId, place: p });
    }
  }
  touch(save);
  return events.concat(diffUnlocks(before, computeUnlocks(save, cupIds)));
}

/** Any finished race (GP leg, free race, time trial). */
export function recordRace(save, { place = 9, notes = 0 } = {}, cupIds = DEFAULT_CUP_IDS) {
  const before = computeUnlocks(save, cupIds);
  save.races += 1;
  if (place === 1) save.wins += 1;
  if (place <= 3) save.podiums += 1;
  save.notes = Math.min(1e9, save.notes + Math.max(0, Math.floor(notes) || 0));
  touch(save);
  return diffUnlocks(before, computeUnlocks(save, cupIds));
}

export function recordKey(trackId, mirror = false) { return `${trackId}${mirror ? ':m' : ''}`; }

/** Time-trial result. Returns { newTime, newLap, previous }. */
export function recordTimeTrial(save, key, { time, lap, char } = {}) {
  const previous = save.records[key] ? { ...save.records[key] } : null;
  const newTime = Number.isFinite(time) && time > 0 && (!previous?.time || time < previous.time);
  const newLap = Number.isFinite(lap) && lap > 0 && (!previous?.lap || lap < previous.lap);
  if (newTime || newLap) {
    save.records[key] = {
      time: newTime ? time : previous?.time ?? null,
      lap: newLap ? lap : previous?.lap ?? null,
      char: char || previous?.char || null,
    };
    touch(save);
  }
  return { newTime, newLap, previous };
}

export function chooseScarf(save, scarfId) {
  if (!isScarfUnlocked(save, scarfId)) return false;
  save.scarf = scarfId;
  touch(save);
  return true;
}

// ------------------------------------------------------------------------------------ storage
function legacyRecords(storage) {
  const out = {};
  try {
    for (let i = 0; i < (storage.length || 0); i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith('tkr-tt-')) continue;
      const rest = k.slice(7);
      const mirror = rest.endsWith('-m');
      const id = mirror ? rest.slice(0, -2) : rest;
      try { const v = JSON.parse(storage.getItem(k)); if (isObj(v)) out[recordKey(id, mirror)] = v; } catch { /* skip */ }
    }
  } catch { /* storage not iterable */ }
  return out;
}

/** Read the save from a Storage-like object. Never throws; corrupt data is backed up and replaced. */
export function loadSave(storage) {
  let raw = null;
  try { raw = storage ? storage.getItem(SAVE_KEY) : null; } catch { raw = null; }
  if (raw == null) {
    const s = defaultSave();
    if (storage) s.records = sanitize({ records: legacyRecords(storage) }).records;
    return s;
  }
  try {
    return migrate(JSON.parse(raw));
  } catch {
    try { storage.setItem(SAVE_KEY + '.corrupt', String(raw).slice(0, 100000)); } catch { /* ignore */ }
    return defaultSave();
  }
}

export function writeSave(storage, save) {
  const json = JSON.stringify(sanitize(save));
  try { storage?.setItem(SAVE_KEY, json); return json; } catch { return json; }
}
