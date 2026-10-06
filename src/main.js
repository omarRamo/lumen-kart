// Lumen Kart — bootstrap, renderer + quality, post-processing, game state machine, progression and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { bus } from './events.js';
import { CHARACTERS, RACE, PHYSICS, CLASSES, ASSIST } from './config.js';
import { RaceManager } from './race.js';
import { HUD } from './hud.js';
import { Menu } from './menu.js';
import { AudioEngine } from './audio.js';
import { TRACKS, CUPS, GP_POINTS, getTrackDef } from './tracks.js';
import { FixedStepper } from './simulation.js';
import { MobileControls } from './mobile-controls.js';
import { OnlineUI } from './online-ui.js';
import { snapshotWorld, SnapshotRenderer } from './multiplayer-race.js';
import { t, setLanguage, resolveLanguage, onLanguageChange, trackName, trackBlurb, cupName, className, itemLabel } from './i18n.js';
import {
  SAVE_KEY, loadSave, writeSave, migrate, defaultSave, recordRace, recordGrandPrix, recordTimeTrial, recordKey, chooseScarf, scarfColor,
} from './save.js';
import { loadSettings, saveSettings, sanitizeSettings, assistFor, resolveQuality, qualityPreset } from './settings.js';
import { setItemIconProvider } from './icons.js';
import { haptic, setHapticsEnabled, onAppEvents, exitApp, prefsGet, prefsSet, isNative } from './native.js';
import './mobile.css';
import './online.css';

const ONLINE_ENABLED = (() => { try { return !!import.meta.env?.VITE_WS_URL; } catch { return false; } })();

// ---------------------------------------------------------------------------------------------
// Error isolation: one failing subsystem must never freeze the loop. Log once per error type.
// ---------------------------------------------------------------------------------------------
const seenErrors = new Set();
function report(tag, err) {
  const key = tag + '|' + (err && err.message);
  if (seenErrors.has(key)) return;
  seenErrors.add(key);
  console.error(`[${tag}]`, err);
}
function safe(tag, fn) {
  try { return fn(); } catch (err) { report(tag, err); return undefined; }
}

// ---------------------------------------------------------------------------------------------
// Persistence: settings + progression save (localStorage, mirrored to native Preferences)
// ---------------------------------------------------------------------------------------------
const storage = (() => { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } })();
let settings = loadSettings(storage);
let save = loadSave(storage);
function persistSave() {
  const json = writeSave(storage, save);
  prefsSet(SAVE_KEY, json);
}
function persistSettings() { saveSettings(storage, settings); }
setLanguage(resolveLanguage(settings.lang));
setHapticsEnabled(settings.haptics);
function applyMotion() {
  window.__lumenReduceMotion = !!settings.reduceMotion;
  window.__lumenShakeScale = settings.reduceMotion ? 0.25 : 1;
  document.body.classList.toggle('reduce-motion', !!settings.reduceMotion);
}
applyMotion();

// ---------------------------------------------------------------------------------------------
// Renderer / camera / post — quality presets (auto / high / medium / low)
// ---------------------------------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');
const mobileDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const deviceEnv = { mobile: mobileDevice, memory: navigator.deviceMemory || 8, cores: navigator.hardwareConcurrency || 8 };
let qualityLevel = resolveQuality(settings.quality, deviceEnv);
window.__lumenQuality = qualityLevel;
const dpr = window.devicePixelRatio || 1;
let preset = qualityPreset(qualityLevel, { mobile: mobileDevice, dpr });
let adaptiveScale = 1;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: preset.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(preset.pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.userData = renderer.userData || {};
renderer.userData.quality = qualityLevel;
renderer.shadowMap.enabled = preset.shadows;
renderer.shadowMap.type = preset.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 30, 60);

const fallbackScene = new THREE.Scene();
fallbackScene.background = new THREE.Color(0x1f4f4c);

const renderPass = new RenderPass(fallbackScene, camera);
let composer = null;
function buildComposer() {
  if (composer || !preset.bloom) return;
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(renderPass);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.45, 0.9));
  composer.addPass(new OutputPass());
}
buildComposer();

/** Apply the current quality preset to the renderer (pixel ratio / shadows / bloom). */
function applyQuality() {
  qualityLevel = resolveQuality(settings.quality, deviceEnv);
  window.__lumenQuality = qualityLevel;
  renderer.userData.quality = qualityLevel;
  preset = qualityPreset(qualityLevel, { mobile: mobileDevice, dpr });
  adaptiveScale = 1;
  renderer.setPixelRatio(preset.pixelRatio);
  const wasShadows = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = preset.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (wasShadows !== preset.shadows && world) world.scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
  if (preset.bloom) buildComposer();
  else if (composer) { composer.dispose?.(); composer = null; }
  composer?.setPixelRatio(renderer.getPixelRatio());
  onResize();
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
}
window.addEventListener('resize', onResize);

// Auto quality: if a race keeps running well below 40 i/s, step the render resolution down.
const perf = { t: 0, frames: 0 };
function adaptQuality(rawDt) {
  if (settings.quality !== 'auto' || state !== 'racing') { perf.t = 0; perf.frames = 0; return; }
  perf.t += rawDt; perf.frames++;
  if (perf.t < 4) return;
  const fps = perf.frames / perf.t;
  perf.t = 0; perf.frames = 0;
  if (fps < 40 && adaptiveScale > 0.6) {
    adaptiveScale = Math.max(0.6, adaptiveScale - 0.15);
    renderer.setPixelRatio(Math.max(0.6, preset.pixelRatio * adaptiveScale));
    composer?.setPixelRatio(renderer.getPixelRatio());
    onResize();
  }
}

// ---------------------------------------------------------------------------------------------
// Modules from other agents are loaded dynamically so a broken file degrades instead of killing the game.
// ---------------------------------------------------------------------------------------------
const mods = {};
async function loadModules() {
  const specs = {
    track: () => import('./track.js'), kart: () => import('./kart.js'), ai: () => import('./ai.js'), input: () => import('./input.js'),
    items: () => import('./items.js'), effects: () => import('./effects.js'), models: () => import('./models.js'), camera: () => import('./camera.js'),
    coins: () => import('./coins.js'), hazards: () => import('./hazards.js'),
  };
  await Promise.all(Object.entries(specs).map(async ([k, p]) => {
    try { mods[k] = await p(); } catch (e) { console.error(`[main] failed to load ${k}`, e); }
  }));
}

// ---- fallbacks -------------------------------------------------------------------------------
function fallbackKartModel(character) {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: character ? character.color : 0x387d76 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.4), mat);
  body.position.y = 0.5; body.castShadow = true; root.add(body);
  const anchors = {};
  for (const [n, x, y, z] of [['exhaustL', 0.4, 0.5, -1.3], ['exhaustR', -0.4, 0.5, -1.3], ['wheelRL', 0.8, 0.3, -0.8], ['wheelRR', -0.8, 0.3, -0.8],
    ['wheelFL', 0.8, 0.3, 0.8], ['wheelFR', -0.8, 0.3, 0.8], ['itemHold', 0, 0.6, -1.8]]) {
    const o = new THREE.Object3D(); o.position.set(x, y, z); root.add(o); anchors[n] = o;
  }
  return { root, anchors, animate() {}, setShrunk(s) { root.scale.setScalar(s); }, dispose() { body.geometry.dispose(); mat.dispose(); } };
}
function makeKartModel(character) {
  if (mods.models && mods.models.createKartModel) {
    try { return mods.models.createKartModel(character); } catch (e) { report('models.createKartModel', e); }
  }
  return fallbackKartModel(character);
}

class FallbackAI {
  constructor(kart, track) { this.kart = kart; this.track = track; }
  update() {
    const k = this.kart, tr = this.track;
    const p = tr.getPointAt(((k.trackT || 0) + 25 / (tr.length || 2000)) % 1);
    const dx = p.x - k.position.x, dz = p.z - k.position.z;
    const want = Math.atan2(dx, dz);
    let d = want - k.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    k.input = { throttle: 1, brake: 0, steer: THREE.MathUtils.clamp(-d * 2, -1, 1), drift: false, item: !!k.item && Math.random() < 0.01, lookBack: false };
  }
}

class FallbackCamera {
  constructor(cam) { this.cam = cam; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this._p = new THREE.Vector3(); this._l = new THREE.Vector3(); }
  snap(k) { this._target(k, this.pos, this.look); this.cam.position.copy(this.pos); this.cam.lookAt(this.look); }
  _target(k, pos, look) {
    const h = k.heading || 0;
    pos.set(k.position.x - Math.sin(h) * 9, k.position.y + 4, k.position.z - Math.cos(h) * 9);
    look.set(k.position.x + Math.sin(h) * 4, k.position.y + 1.2, k.position.z + Math.cos(h) * 4);
  }
  update(dt, k) {
    this._target(k, this._p, this._l);
    const a = 1 - Math.exp(-dt * 6);
    this.pos.lerp(this._p, a); this.look.lerp(this._l, a);
    this.cam.position.copy(this.pos); this.cam.lookAt(this.look);
  }
}

/** Lumen wears the chosen scarf colour (the art agent paints the scarf with `accent`). */
function characterFor(ch) {
  if (!ch || ch.id !== 'lumen') return ch;
  return { ...ch, scarf: scarfColor(save) };
}
function portraitFor(ch) {
  if (!mods.models?.createCharacterPortrait) return '';
  return mods.models.createCharacterPortrait(characterFor(ch));
}

// ---------------------------------------------------------------------------------------------
// UI + audio
// ---------------------------------------------------------------------------------------------
const audio = new AudioEngine();
audio.setMusicVolume(settings.music);
audio.setSfxVolume(settings.sfx);
const hud = new HUD(uiRoot);
hud.setFpsVisible(settings.showFps);
const menu = new Menu(uiRoot, {
  onStart: (s) => {
    if (settings.steering === 'tilt') safe('tilt', () => mobileControls?.ensureTilt?.());
    mobileControls?.prepareRace();
    startMode(s);
  },
  onOnline: (s) => {
    mobileControls?.prepareRace();
    const level = { easy: 'easy', normal: 'medium', hard: 'hard', extreme: 'hard' }[getClass(s.classId).ai] || 'medium';
    openOnline({ ...s, gameMode: 'vs', difficulty: level });
  },
  onResume: () => resume(),
  onRestart: () => {
    if (onlineClient) { leaveOnline(); goToTitle(); return; }
    menu.hideAll(); if (gp && lastSettings.gameMode === 'gp') gp.restartCurrent = true; startRace(lastSettings);
  },
  onQuit: () => goToTitle(),
  onScreen: (s) => {
    if (RACE_STATES.has(state) || state === 'paused' || state === 'loading' || state === 'online') return;
    if (s === 'select') setState('select');
    else if (['title', 'mode', 'class', 'course', 'settings', 'credits'].includes(s)) setState('title');
  },
  onSettingsChange: (patch) => updateSettings(patch),
  onScarf: (id) => {
    if (!chooseScarf(save, id)) return;
    persistSave();
    hud.setPortraitProvider(portraitFor);
    recolorAttractLumen();
  },
  onRemember: (last) => { settings.last = { ...settings.last, ...last }; settings = sanitizeSettings(settings); persistSettings(); },
  onResetProgress: () => { save = defaultSave(); persistSave(); hud.setPortraitProvider(portraitFor); recolorAttractLumen(); hud.toast(t('settings.reset.done')); menu.refresh(); },
  onLocked: (msg) => hud.toast(msg),
}, { getSave: () => save, getSettings: () => settings, characterFor });

function updateSettings(patch) {
  const prev = settings;
  settings = sanitizeSettings({ ...settings, ...patch });
  persistSettings();
  if (prev.music !== settings.music) audio.setMusicVolume(settings.music);
  if (prev.sfx !== settings.sfx) { audio.setSfxVolume(settings.sfx); }
  if (prev.lang !== settings.lang) setLanguage(resolveLanguage(settings.lang));
  if (prev.haptics !== settings.haptics) { setHapticsEnabled(settings.haptics); if (settings.haptics) haptic('medium'); }
  if (prev.quality !== settings.quality) applyQuality();
  if (prev.showFps !== settings.showFps) hud.setFpsVisible(settings.showFps);
  if (prev.reduceMotion !== settings.reduceMotion) { applyMotion(); if (world?.effects) safe('motion', () => { world.effects.speedLines = !settings.reduceMotion; }); }
  if (prev.steering !== settings.steering && settings.steering === 'touch') safe('tilt', () => mobileControls?.disableTilt?.());
  if (prev.steering !== settings.steering && settings.steering === 'tilt') safe('tilt', () => mobileControls?.ensureTilt?.());
  if (prev.assist !== settings.assist && world?.player) applyAssist(world);
}
onLanguageChange(() => { menu.refresh(); hud.relabel(); mobileControls?.relabel?.(); document.title = t('app.name'); });

let input = null;
let mobileControls = null;
const stepper = new FixedStepper();
let onlineClient = null;
let onlineUI = null;
let onlineSession = null;
let onlinePaused = false;

function openOnline(s = menu.settings) {
  menu.hideAll();
  setState('online');
  onlineUI = new OnlineUI({ root: uiRoot,
    onClose: () => { onlineUI = null; setState('title'); menu.showMode(); },
    onStart: (client, session) => {
      onlineUI = null;
      onlineClient = client;
      onlineSession = session;
      client.addEventListener('closed', (event) => {
        if (onlineClient !== client) return;
        leaveOnline(); goToTitle(); hud.toast(event.detail.reason || t('toast.connClosed'));
      });
      client.addEventListener('room', (event) => {
        if (!world?.network || !client.isHost) return;
        const present = new Set(event.detail.players.map((p) => p.id));
        for (const k of world.karts) if (k.netId && !present.has(k.netId)) {
          k.netId = null;
          if (!world.ais.some((ai) => ai.kart === k)) world.ais.push(new mods.ai.AIDriver(k, world.track, { difficulty: world.difficulty }));
        }
      });
      client.addEventListener('snapshot', (event) => {
        const w = world;
        if (!w?.network || client.isHost || !w.snapshots) return;
        if (!w.snapshots.accept(event.detail)) return;
        if (w.race.phase === 'racing' && state === 'countdown') { setState('racing'); playTrackMusic(w); }
        if (event.detail.ended && !resultsShown) showOnlineResults(w.snapshots.results());
      });
      startRace({ ...session.room.config });
    },
  });
  onlineUI.show({ character: CHARACTERS[s.characterIndex]?.id || 'lumen', config: s });
}
function leaveOnline() {
  const client = onlineClient;
  onlineClient = null; onlineSession = null; onlinePaused = false;
  client?.disconnect();
}
function showOnlineResults(results) {
  if (!results?.length || resultsShown) return;
  resultsShown = true;
  menu.hideAll(); onlinePaused = false;
  setState('finished');
  audio.playMusic('menu');
  hud.showResults(results, {
    laps: world.race.laps,
    onRestart: () => { leaveOnline(); goToTitle(); },
    onMenu: () => { leaveOnline(); goToTitle(); },
  });
}

// ---------------------------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------------------------
let state = 'boot';
let prevState = null;
let world = null;
let lastSettings = { characterIndex: 0, classId: '100cc', laps: RACE.laps, gameMode: 'vs', trackId: TRACKS[0]?.id || 'palm-cove' };
let gp = null;   // Grand Prix state: { cup, index, roster: [characterIndex], points: {id: n}, gridIds, notes }
let introTimer = 0;
let resultsShown = false;
let time = 0;
let flowVersion = 0;
let raceNotes = 0;
const clock = new THREE.Clock();
const NEUTRAL = Object.freeze({ throttle: 0, brake: 0, steer: 0, drift: false, item: false, lookBack: false });

function setState(s) {
  if (state === s) return;
  state = s;
  document.body.dataset.state = s;
  mobileControls?.updateState(onlinePaused ? 'paused' : s);
  if (s === 'paused' || s === 'loading' || s === 'title') { input?.reset(); stepper.reset(); }
  bus.emit('game:state', { state: s });
}

const RACE_STATES = new Set(['intro', 'countdown', 'racing', 'finished']);

// ---------------------------------------------------------------------------------------------
// World lifecycle
// ---------------------------------------------------------------------------------------------
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

function getClass(id) { return CLASSES.find((c) => c.id === id) || CLASSES[1]; }
const CLASS_FOR_DIFFICULTY = { easy: '50cc', medium: '100cc', normal: '100cc', hard: '150cc' };

function applyAssist(w) {
  if (!w?.player) return;
  safe('assist', () => { w.player.assist = { steering: assistFor(settings, w.cls.id, ASSIST?.defaultOnFor || ['50cc']), strength: ASSIST?.defaultStrength ?? 0.6 }; });
}

function buildWorld({ mode, characterIndex = 0, classId = null, difficulty = null, laps = RACE.laps, trackId = TRACKS[0]?.id, gameMode = 'vs', roster = null, gridIds = null }) {
  if (!mods.track || !mods.track.createTrack) throw new Error('track.js unavailable');
  if (!mods.kart || !mods.kart.Kart) throw new Error('kart.js unavailable');
  window.__lumenQuality = qualityLevel;
  const cls = getClass(classId || CLASS_FOR_DIFFICULTY[difficulty] || '100cc');
  const aiLevel = mode === 'race' ? cls.ai : 'hard';
  const network = mode === 'race' && !!onlineClient;
  if (network) gameMode = 'vs';
  const w = { mode, gameMode, difficulty: aiLevel, cls, laps, network, karts: [], ais: [], playerAI: null, player: null, scene: new THREE.Scene() };
  w.track = mods.track.createTrack(w.scene, renderer, { def: getTrackDef(trackId), mirror: mode === 'race' && !!cls.mirror });

  let chars;
  if (network) {
    chars = onlineSession.room.players.map((p) => CHARACTERS.find((c) => c.id === p.character) || CHARACTERS[0]);
    while (chars.length < RACE.racers) chars.push(CHARACTERS[chars.length % CHARACTERS.length]);
  } else if (mode === 'race') {
    if (roster) chars = roster.map((i) => CHARACTERS[i]);
    else chars = [CHARACTERS[characterIndex], ...shuffle(CHARACTERS.filter((_, i) => i !== characterIndex))];
  } else chars = CHARACTERS.slice();
  chars = chars.map(characterFor);
  const racers = mode === 'race' && gameMode === 'tt' ? 1 : RACE.racers;

  const { Kart } = mods.kart;
  for (let i = 0; i < racers; i++) {
    const character = chars[i % chars.length];
    const netPlayer = w.network ? onlineSession.room.players[i] : null;
    const isPlayer = w.network ? netPlayer?.id === onlineClient.playerId : mode === 'race' && i === 0;
    const model = makeKartModel(character);
    const kart = new Kart({ scene: w.scene, track: w.track, character, isPlayer, index: i, model, difficulty: aiLevel });
    kart.netId = netPlayer?.id || null;
    safe('kart.applyClass', () => kart.applyClass && kart.applyClass(mode === 'race' ? cls.speed : 1.05));
    w.karts.push(kart);
    if (isPlayer) w.player = kart;
  }
  applyAssist(w);

  let gridOrder = new Array(racers);
  if (gridIds && gridIds.length === racers) {
    gridOrder = gridIds.map((id) => w.karts.find((k) => k.character.id === id)).filter(Boolean);
    if (gridOrder.length !== racers) gridOrder = new Array(racers);
  }
  if (!gridOrder[0]) {
    const rest = shuffle(w.karts.filter((k) => k !== w.player));
    if (w.player) gridOrder[racers === 1 ? 0 : 4 + ((Math.random() * 2) | 0)] = w.player;
    for (let i = 0; i < gridOrder.length; i++) if (!gridOrder[i]) gridOrder[i] = rest.shift();
  }

  w.race = new RaceManager({ track: w.track, karts: w.karts, player: w.player, laps, silent: mode !== 'race' });
  w.race.placeOnGrid(w.network ? w.karts : gridOrder);

  const AIClass = (mods.ai && mods.ai.AIDriver) || null;
  for (const k of w.karts) {
    if (k === w.player || k.netId || (w.network && !onlineClient.isHost)) continue;
    let ai = null;
    if (AIClass) ai = safe('ai.ctor', () => new AIClass(k, w.track, { difficulty: aiLevel }));
    w.ais.push(ai || new FallbackAI(k, w.track));
  }

  if (mods.items && mods.items.ItemSystem) w.items = safe('items.ctor', () => new mods.items.ItemSystem({ scene: w.scene, track: w.track, karts: w.karts, noBoxes: gameMode === 'tt' && mode === 'race' }));
  if (mods.coins && mods.coins.CoinSystem) w.coins = safe('coins.ctor', () => new mods.coins.CoinSystem({ scene: w.scene, track: w.track, karts: w.karts }));
  if (mods.hazards && mods.hazards.HazardSystem) w.hazards = safe('hazards.ctor', () => new mods.hazards.HazardSystem({ scene: w.scene, track: w.track, karts: w.karts }));
  if (w.items && w.hazards) w.items.extraHazards = () => w.hazards.getHazards();
  if (w.items && gameMode === 'tt' && w.player) safe('tt.items', () => w.items.giveItem(w.player, 'triple_mushroom', 3));
  if (mods.effects && mods.effects.Effects) w.effects = safe('effects.ctor', () => new mods.effects.Effects(w.scene, camera));
  w.chase = (mods.camera && mods.camera.ChaseCamera && safe('camera.ctor', () => new mods.camera.ChaseCamera(camera))) || new FallbackCamera(camera);
  w.ctx = { karts: w.karts, player: w.player || w.karts[0], itemSystem: w.items || null, time: 0 };
  if (w.player) safe('camera.snap', () => w.chase.snap(w.player));

  if (w.network && !onlineClient.isHost) w.snapshots = new SnapshotRenderer(w, bus);
  renderPass.scene = w.scene;
  return w;
}

function disposeWorld() {
  const w = world;
  world = null;
  renderPass.scene = fallbackScene;
  if (!w) return;
  w.snapshots?.dispose();
  safe('dispose.items', () => w.items && w.items.dispose && w.items.dispose());
  safe('dispose.coins', () => w.coins && w.coins.dispose());
  safe('dispose.hazards', () => w.hazards && w.hazards.dispose());
  safe('dispose.effects', () => w.effects && w.effects.dispose && w.effects.dispose());
  for (const k of w.karts) safe('dispose.kart', () => k.dispose && k.dispose());
  safe('dispose.track', () => w.track && w.track.dispose && w.track.dispose());
  safe('dispose.race', () => w.race && w.race.dispose());
  safe('dispose.ai', () => { for (const a of [...w.ais, w.playerAI]) a && a.dispose && a.dispose(); });
  safe('dispose.chase', () => w.chase && w.chase.dispose && w.chase.dispose());
  safe('dispose.scene', () => {
    const seen = new Set();
    const dispTex = (m) => {
      for (const key in m) {
        const v = m[key];
        if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
      }
    };
    w.scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (!seen.has(m)) { seen.add(m); dispTex(m); m.dispose(); }
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    if (w.scene.background && w.scene.background.isTexture) w.scene.background.dispose();
    if (w.scene.environment && w.scene.environment.isTexture) w.scene.environment.dispose();
    w.scene.clear();
  });
  renderer.renderLists.dispose();
}

/** Repaint the attract-mode Lumen kart after a scarf change (materials using the old accent). */
let attractLumenAccent = null;
function recolorAttractLumen() {
  const w = world;
  if (!w || w.mode !== 'attract') return;
  const k = w.karts.find((x) => x.character?.id === 'lumen');
  if (!k) return;
  const next = scarfColor(save);
  const prevHex = attractLumenAccent ?? (k.character.scarf ?? k.character.accent);
  if (prevHex === next) return;
  safe('scarf.recolor', () => {
    k.object3D.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) if (m.color && m.color.getHex() === prevHex) m.color.setHex(next);
    });
  });
  attractLumenAccent = next;
}

// ---------------------------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------------------------
function buildAttract() {
  disposeWorld();
  try {
    const pool = TRACKS.filter((d) => d && d.id);
    world = buildWorld({ mode: 'attract', trackId: pool[(Math.random() * pool.length) | 0].id });
    world.race.startImmediately();
    attractLumenAccent = scarfColor(save);
    attractCam.targetIndex = Math.max(0, world.karts.findIndex((k) => k.character?.id === 'lumen'));
    attractCam.init = false;
    uiRoot.classList.remove('no-world');
  } catch (e) {
    report('attract', e);
    disposeWorld();
    uiRoot.classList.add('no-world');
  }
}

function goToTitle() {
  const flow = ++flowVersion;
  leaveOnline();
  disposeWorld();
  hideIntroCard();
  hud.hide(); hud.hideResults();
  audio.setPaused(false);
  audio.setGameplayActive(false);
  resultsShown = false;
  gp = null;
  menu.showLoading(t('loading.loading'));
  setState('loading');
  setTimeout(() => {
    if (flow !== flowVersion) return;
    buildAttract();
    setState('title');
    menu.showTitle();
    audio.playMusic('menu');
    flushCelebrations();
  }, 30);
}

/** Menu entry point: settings.gameMode = 'gp' | 'vs' | 'tt'. */
function startMode(s0) {
  const s = { ...lastSettings, ...s0 };
  if (s.gameMode === 'gp') {
    const cup = CUPS.find((c) => c.id === s.cupId) || CUPS[0];
    const ci = s.characterIndex | 0;
    const roster = [ci, ...shuffle(CHARACTERS.map((_, i) => i).filter((i) => i !== ci))];
    gp = { cup, index: 0, roster, points: {}, gridIds: null, history: [], notes: 0 };
    for (const i of roster) gp.points[CHARACTERS[i].id] = 0;
    startRace({ ...s, laps: 3, trackId: cup.tracks[0] });
  } else {
    gp = null;
    startRace({ ...s, laps: s.gameMode === 'tt' ? 3 : s.laps });
  }
}

function startRace(s) {
  const flow = ++flowVersion;
  lastSettings = { ...lastSettings, ...s };
  if (lastSettings.gameMode === 'gp' && gp) {
    lastSettings.trackId = gp.cup.tracks[gp.index];
    lastSettings.roster = gp.roster;
    lastSettings.gridIds = gp.gridIds;
    gp.restartCurrent = false;
  } else { lastSettings.roster = null; lastSettings.gridIds = null; }
  hud.hide(); hud.hideResults();
  menu.showLoading(t('loading.ready'));
  audio.setPaused(false);
  audio.stopMusic();
  setState('loading');
  setTimeout(() => {
    if (flow !== flowVersion) return;
    disposeWorld();
    try {
      time = 0; stepper.reset();
      world = buildWorld({ mode: 'race', ...lastSettings });
    } catch (e) {
      report('buildWorld', e);
      menu.showLoading(t('loading.failed'));
      setTimeout(goToTitle, 2500);
      return;
    }
    resultsShown = false;
    introTimer = 0;
    raceNotes = 0;
    tipState.itemsShown = false;
    seenErrors.clear();
    const mirror = !!getClass(lastSettings.classId).mirror;
    hud.reset({ player: world.player, track: world.track, laps: lastSettings.laps, gameMode: lastSettings.gameMode, touch: !!mobileControls?.enabled,
      record: lastSettings.gameMode === 'tt' ? save.records[recordKey(lastSettings.trackId, mirror)] || null : null });
    hud.show();
    menu.hideAll();
    audio.setGameplayActive(true);
    uiRoot.classList.remove('no-world');
    if (world.network) {
      world.networkStartAt = onlineSession.startAt;
      setState('countdown');
      if (onlineClient.latestSnapshot && !onlineClient.isHost) world.snapshots.accept(onlineClient.latestSnapshot);
      hud.toast(t('toast.connected'));
    } else {
      setState('intro');
      showIntroCard();
    }
  }, 40);
}

let introCard = null;
function showIntroCard() {
  if (!introCard) {
    introCard = Object.assign(document.createElement('div'), { className: 'intro-card' });
    introCard.addEventListener('click', () => beginCountdown());
  }
  uiRoot.appendChild(introCard);
  const def = world?.track?.def || getTrackDef(lastSettings.trackId);
  const name = trackName(def) || world?.track?.name || '';
  const cls = getClass(lastSettings.classId);
  const mode = lastSettings.gameMode === 'gp' && gp ? `${cupName(gp.cup)} · ${t('intro.race', { i: gp.index + 1, n: gp.cup.tracks.length })}`
    : t(lastSettings.gameMode === 'tt' ? 'mode.tt' : 'mode.vs');
  const laps = lastSettings.laps === 1 ? t('intro.lap1') : t('intro.laps', { n: lastSettings.laps });
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  introCard.innerHTML = `<div class="ic-mode">${esc(mode)}</div><div class="ic-name">${esc(name)}</div><div class="ic-blurb">${esc(trackBlurb(def))}</div>
    <div class="ic-sub">${esc(cls.mirror ? className(cls) : `${cls.label} · ${className(cls)}`)} · ${esc(laps)}</div><div class="ic-skip">${esc(t('intro.skip'))}</div>`;
  introCard.classList.remove('show'); void introCard.offsetWidth; introCard.classList.add('show');
}
function hideIntroCard() { if (introCard) introCard.classList.remove('show'); }

function beginCountdown() {
  if (state !== 'intro' || !world) return;
  hideIntroCard();
  world.race.startCountdown();
  setState('countdown');
  safe('camera.snap', () => world.chase.snap(world.player));
}

function pause() {
  if (world?.network && !resultsShown) {
    onlinePaused = true; input?.reset(); mobileControls?.updateState('paused');
    menu.showPause(); hud.toast(t('toast.onlineContinues')); return;
  }
  if (!RACE_STATES.has(state) || resultsShown) return;
  prevState = state;
  setState('paused');
  menu.showPause();
  audio.setPaused(true);
}
function resume() {
  if (world?.network && onlinePaused) { onlinePaused = false; menu.hideAll(); mobileControls?.updateState(state); return; }
  if (state !== 'paused') return;
  menu.hideAll();
  setState(prevState || 'racing');
  audio.setPaused(false);
  clock.getDelta();
}

function playTrackMusic(w) {
  const def = w?.track?.def;
  const pick = [def?.music, w?.track?.world, def?.theme, def?.song].find((k) => k && audio.hasSong(k));
  const song = pick || 'meadow';
  audio.playMusic(song);
}

// ---------------------------------------------------------------------------------------------
// First-race tutorial hints + haptics
// ---------------------------------------------------------------------------------------------
const tipState = { itemsShown: false };
function markTutorial(key) { if (!save.tutorial[key]) { save.tutorial[key] = true; persistSave(); } }
const touchUI = () => !!mobileControls?.enabled;

bus.on('race:go', () => {
  if (state === 'countdown' || (state === 'paused' && prevState === 'countdown')) {
    if (state === 'paused') prevState = 'racing'; else setState('racing');
    playTrackMusic(world);
    if (world && !world.network && !save.tutorial.drift && lastSettings.gameMode !== 'tt') {
      setTimeout(() => { if (state === 'racing') hud.tip(t(touchUI() ? 'tip.drift.touch' : 'tip.drift.keys')); }, 1800);
      markTutorial('drift');
    }
  }
});
bus.on('item:got', (d) => {
  if (!d?.kart?.isPlayer || save.tutorial.items || tipState.itemsShown || state !== 'racing') return;
  tipState.itemsShown = true;
  const id = d.item || d.kart.item;
  hud.tip(t(touchUI() ? 'tip.items.touch' : 'tip.items.keys', { item: itemLabel(id) }), null);
  markTutorial('items');
});
bus.on('coin:pickup', (d) => {
  if (!d?.kart?.isPlayer || world?.mode !== 'race') return;
  raceNotes++;
  if (!save.tutorial.notes && save.tutorial.drift && state === 'racing' && !hud.tipEl.classList.contains('show')) { hud.tip(t('tip.notes')); markTutorial('notes'); }
});
const isP = (k) => !!(k && k.isPlayer && world?.mode === 'race');
// Gameplay emits 'haptic' {kart, style, intensity, source} for the local player only.
bus.on('haptic', (d) => { if (!d || (d.kart && !d.kart.isPlayer)) return; haptic(d.style === 'success' ? 'success' : d.style === 'heavy' ? 'heavy' : d.style === 'medium' ? 'medium' : 'light'); });
bus.on('race:finish', (d) => { if (isP(d?.kart)) haptic(d.place <= 3 ? 'success' : 'medium'); });

bus.on('race:finish', (d) => {
  if (!world || !d || !d.kart || !d.kart.isPlayer) return;
  setState('finished');
  hud.hideTip();
  const AIClass = mods.ai && mods.ai.AIDriver;
  if (world.network && !onlineClient?.isHost) return;
  world.playerAI = (AIClass && safe('ai.player', () => new AIClass(world.player, world.track, { difficulty: 'easy' }))) || new FallbackAI(world.player, world.track);
});

// ---------------------------------------------------------------------------------------------
// Results, records, Grand Prix trophies and unlocks
// ---------------------------------------------------------------------------------------------
let pendingCelebrations = [];
function celebrateLater(events) { if (events?.length) pendingCelebrations.push(...events); }
function flushCelebrations() { if (pendingCelebrations.length) { const ev = pendingCelebrations; pendingCelebrations = []; setTimeout(() => hud.celebrate(ev), 500); } }
const cupIdList = () => CUPS.map((c) => c.id);

bus.on('race:end', (d) => {
  if (!world || world.mode !== 'race') return;
  if (world.network) { showOnlineResults(d.results); return; }
  resultsShown = true;
  const results = (d && d.results) || world.race.computeResults();
  if (state === 'paused') resume();
  const w = world;
  const me = results.find((r) => r.isPlayer);
  const notes = raceNotes;
  celebrateLater(safe('save.race', () => recordRace(save, { place: me?.place || 9, notes }, cupIdList())) || []);
  if (gp) gp.notes += notes;
  persistSave();
  setTimeout(() => {
    if (!world || world !== w || !resultsShown) return;
    audio.playMusic('menu');
    const gm = lastSettings.gameMode;
    if (gm === 'gp' && gp) { showGPResults(results, notes); flushCelebrations(); return; }
    if (gm === 'tt') {
      const mirror = !!getClass(lastSettings.classId).mirror;
      const res = me && !me.estimated ? recordTimeTrial(save, recordKey(lastSettings.trackId, mirror), { time: me.time, lap: me.bestLap, char: me.character?.id }) : { newTime: false, newLap: false, previous: save.records[recordKey(lastSettings.trackId, mirror)] || null };
      persistSave();
      if (res.newTime) bus.emit('game:record', {});
      hud.showResults(results, {
        laps: w.race.laps, mode: 'tt', record: res.previous, newTime: res.newTime, newLap: res.newLap, notes,
        onRestart: () => startRace(lastSettings), onMenu: () => goToTitle(),
      });
      flushCelebrations();
      return;
    }
    hud.showResults(results, { laps: w.race.laps, notes, onRestart: () => startRace(lastSettings), onMenu: () => goToTitle() });
    flushCelebrations();
  }, 200);
});

function showGPResults(results, notes) {
  const last = gp.index >= gp.cup.tracks.length - 1;
  for (const r of results) {
    const pts = GP_POINTS[r.place - 1] || 0;
    r.points = pts;
    gp.points[r.character.id] = (gp.points[r.character.id] || 0) + pts;
  }
  const standings = gp.roster.map((ci) => {
    const ch = characterFor(CHARACTERS[ci]);
    return { character: ch, name: ch.name, isPlayer: ci === gp.roster[0], points: gp.points[ch.id] || 0, race: results.find((r) => r.character.id === ch.id) };
  }).sort((a, b) => b.points - a.points || (a.race?.place || 9) - (b.race?.place || 9));
  standings.forEach((s, i) => { s.place = i + 1; });
  gp.gridIds = standings.map((s) => s.character.id);
  hud.showGPResults(results, standings, {
    cup: gp.cup, raceIndex: gp.index, total: gp.cup.tracks.length, last, notes,
    onNext: () => {
      if (last) return showPodium(standings);
      gp.index++;
      startRace(lastSettings);
    },
    onMenu: () => { gp = null; goToTitle(); },
  });
}

function showPodium(standings) {
  const me = standings.find((s) => s.isPlayer);
  const place = me ? me.place : 9;
  const events = recordGrandPrix(save, { cupId: gp.cup.id, classId: lastSettings.classId, place }, cupIdList());
  persistSave();
  bus.emit('game:podium', { place });
  if (audio.ctx) safe('audio.fanfare', () => audio.fanfare(place));
  const cls = getClass(lastSettings.classId);
  const cup = gp.cup;
  hud.showPodium(standings, { cup, classLabel: cls.mirror ? className(cls) : `${cls.label} · ${className(cls)}`, onDone: () => { gp = null; goToTitle(); } });
  if (events.length) setTimeout(() => hud.celebrate(events), 1600);
}

// ---------------------------------------------------------------------------------------------
// Back button (Escape / Android back) + keyboard
// ---------------------------------------------------------------------------------------------
function handleBack() {
  if (onlineUI) { safe('online.close', () => onlineUI.close()); return; }
  if (hud.resultsVisible) { hud.resultsBack(); return; }
  if (state === 'paused' || onlinePaused) {
    if (menu.screen === 'settings' || menu.screen === 'credits') menu.back(); else resume();
    return;
  }
  if (state === 'intro') { beginCountdown(); return; }
  if (RACE_STATES.has(state)) { pause(); return; }
  if (state === 'loading' || state === 'boot') return;
  if (!menu.back()) exitApp();
}

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) && e.target?.type !== 'range') return;
  if (e.target?.isContentEditable) return;
  if (e.code === 'KeyM' && !e.repeat) {
    const muted = audio.toggleMute();
    hud.toast(t(muted ? 'toast.soundOff' : 'toast.soundOn'));
    return;
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (onlinePaused) { resume(); }
    else if (state === 'paused') {
      if (menu.screen === 'settings' || menu.screen === 'credits') { if (e.code === 'Escape') menu.back(); }
      else { bus.emit('ui:back'); resume(); }
    } else if (RACE_STATES.has(state) && !resultsShown) pause();
    return;
  }
  if (state === 'intro' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && !e.repeat) beginCountdown();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && state !== 'boot') e.preventDefault();
});
canvas.addEventListener('click', () => { if (state === 'intro') beginCountdown(); });

// App lifecycle: pause the race and silence audio in the background; Android back button.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'racing' || state === 'countdown' || state === 'intro') pause();
    audio.suspend();
  } else audio.resume();
});
window.addEventListener('pagehide', () => audio.suspend());
onAppEvents({
  back: () => handleBack(),
  pause: () => { if (state === 'racing' || state === 'countdown' || state === 'intro') pause(); audio.suspend(); },
  resume: () => audio.resume(),
});

// No zoom, scroll or long-press menus on touch devices.
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', (e) => { if (!['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) e.preventDefault(); });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1) e.preventDefault();
  else if (!e.target?.closest?.('.scroll-y, .settings-body, .res-panel, .online-card, .track-cards, .char-grid, .course-body, .card-row, input')) e.preventDefault();
}, { passive: false });

// ---------------------------------------------------------------------------------------------
// Attract-mode camera (title / menus): cinematic orbit around Lumen, close-up on the chosen driver
// ---------------------------------------------------------------------------------------------
const attractCam = {
  targetIndex: 0, switchT: 0, angle: 0,
  pos: new THREE.Vector3(0, 40, 80), look: new THREE.Vector3(), init: false,
  _p: new THREE.Vector3(), _l: new THREE.Vector3(),
};
function updateAttractCamera(dt) {
  const w = world;
  const ac = attractCam;
  const select = state === 'select';
  ac.angle += dt * (select ? 0.28 : 0.14);
  let target = null;
  if (w && w.karts.length) target = select ? (w.karts[menu.charIndex] || w.karts[0]) : (w.karts[ac.targetIndex] || w.karts[0]);
  if (target) {
    const r = select ? 7.2 : 10.5 + Math.sin(ac.angle * 0.7) * 2;
    const h = target.heading || 0;
    const a = h + (select ? Math.PI * 0.78 + Math.sin(ac.angle) * 0.45 : Math.PI * 0.82 + Math.sin(ac.angle) * 0.9);
    ac._p.set(target.position.x + Math.sin(a) * r, target.position.y + (select ? 2.5 : 3.6 + Math.sin(ac.angle * 0.5) * 1.2), target.position.z + Math.cos(a) * r);
    ac._l.set(target.position.x, target.position.y + (select ? 1.0 : 1.3), target.position.z);
    const v = target.velocity;
    // Lead by exactly the exponential follow lag (1 / rate) so the driver stays centred while it races:
    // with the old fixed 0.4 s lead the select close-up looked 6 m ahead of the kart, which ended up
    // hidden behind the roster grid or the stats card.
    if (v) { const lead = 1 / (select ? 4 : 2.5); ac._p.addScaledVector(v, lead); ac._l.addScaledVector(v, lead); }
  } else {
    let cx = 0, cz = 0, span = 200;
    const mm = w && w.track && w.track.minimap && w.track.minimap.bounds;
    if (mm) { cx = (mm.minX + mm.maxX) / 2; cz = (mm.minZ + mm.maxZ) / 2; span = Math.max(mm.maxX - mm.minX, mm.maxZ - mm.minZ); }
    ac._p.set(cx + Math.cos(ac.angle) * span * 0.6, span * 0.3, cz + Math.sin(ac.angle) * span * 0.6);
    ac._l.set(cx, 0, cz);
  }
  const k = ac.init ? 1 - Math.exp(-dt * (select ? 4 : 2.5)) : 1;
  ac.init = true;
  ac.pos.lerp(ac._p, k); ac.look.lerp(ac._l, k);
  camera.position.copy(ac.pos);
  camera.lookAt(ac.look);
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
}

// ---------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------
let playerInput = null;
const debug = { autopilot: false };
function simulate(w, dt) {
  time += dt;
  w.ctx.time = time;
  const racing = w.mode === 'race';
  const player = w.player;

  if (racing && player) {
    let raw = null;
    if (input) raw = safe('input.getInput', () => input.getInput());
    if (input) safe('input.pause', () => input.consumePressed && input.consumePressed('pause'));
    if (onlinePaused) raw = { ...NEUTRAL, brake: 1 };
    playerInput = raw || NEUTRAL;
    if (debug.autopilot && !w.playerAI && !player.controlsLocked) {
      const AIClass = mods.ai && mods.ai.AIDriver;
      w.playerAI = (AIClass && safe('ai.player', () => new AIClass(player, w.track, { difficulty: 'hard' }))) || new FallbackAI(player, w.track);
    }
    if ((player.finished || debug.autopilot) && w.playerAI) {
      safe('ai.player', () => w.playerAI.update(dt, w.ctx));
    } else if (player.controlsLocked) {
      player.input = { ...NEUTRAL };
    } else {
      player.input = raw || { ...NEUTRAL };
    }
  }

  if (w.network && onlineClient?.isHost) {
    if (w.race.phase === 'grid' && Date.now() >= w.networkStartAt) w.race.startCountdown();
    for (const k of w.karts) {
      if (!k.netId || k === player) continue;
      if (k.finished) {
        if (!w.ais.some((ai) => ai.kart === k)) w.ais.push(new mods.ai.AIDriver(k, w.track, { difficulty: 'easy' }));
      } else k.input = onlineClient.consumeInput(k.netId) || { ...NEUTRAL };
    }
  }
  for (let i = 0; i < w.ais.length; i++) {
    const ai = w.ais[i];
    try { ai.update(dt, w.ctx); } catch (e) { report('ai.update', e); }
  }
  for (let i = 0; i < w.karts.length; i++) {
    try { w.karts[i].update(dt); } catch (e) { report('kart.update', e); }
  }
  if (mods.kart && mods.kart.resolveKartCollisions) safe('resolveKartCollisions', () => mods.kart.resolveKartCollisions(w.karts));
  if (mods.kart && mods.kart.updateSlipstream) safe('slipstream', () => mods.kart.updateSlipstream(w.karts, dt));
  if (w.items) safe('items.update', () => w.items.update(dt, time));
  if (w.coins) safe('coins.update', () => w.coins.update(dt));
  if (w.hazards) safe('hazards.update', () => w.hazards.update(dt, time));
  if (w.network) w.race.endTimer = -1;
  safe('race.update', () => w.race.update(dt));
  if (w.network && !w.race.ended) {
    w.race.endTimer = -1;
    const humans = w.karts.filter((k) => k.netId);
    if (humans.some((k) => k.finished)) w.finishWait = (w.finishWait || 0) + dt;
    if ((humans.length && humans.every((k) => k.finished)) || w.finishWait > 60) {
      w.resultWait = (w.resultWait || 0) + dt;
      if (w.resultWait > 3.8) w.race._end();
    }
  }
  if (w.effects) safe('effects.update', () => w.effects.update(dt, w.karts));
  safe('track.update', () => w.track.update && w.track.update(dt, time));
  const focus = racing ? player : (w.karts[state === 'select' ? menu.charIndex : attractCam.targetIndex] || w.karts[0]);
  if (focus && w.track.setShadowFocus) safe('track.setShadowFocus', () => w.track.setShadowFocus(focus.position));

  if (racing && state === 'intro') {
    introTimer += dt;
    if (introTimer > 4.2) beginCountdown();
  }
}

/** A rival right behind the player sits inside the chase camera and fills the screen (grid start, bumping):
 *  hide karts closer than ~3.4 m to the lens instead of letting them clip through the near plane. */
const NEAR_KART2 = 3.4 * 3.4;
function hideKartsNearCamera(w) {
  for (let i = 0; i < w.karts.length; i++) {
    const k = w.karts[i];
    if (k === w.player || !k.object3D || !k.position) continue;
    const near = camera.position.distanceToSquared(k.position) < NEAR_KART2;
    if (k.object3D.visible === near) k.object3D.visible = !near;
  }
}

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.1);
  safe('menu.update', () => menu.update(rawDt, resultsShown ? 'results' : state));
  hud.tickFps(rawDt);
  adaptQuality(rawDt);

  const w = world;
  if (w) {
    const running = state !== 'paused' && state !== 'loading' && state !== 'boot';
    if (w.network && onlineClient && !onlineClient.isHost) {
      playerInput = onlinePaused ? { ...NEUTRAL, brake: 1 } : input.getInput();
      onlineClient?.sendInput(playerInput);
      w.snapshots.update(dt);
      w.hazards?.update(dt, w.ctx.time, { collisions: false });
      w.track.update?.(dt, w.ctx.time);
      w.effects?.update(dt, w.karts);
      w.track.setShadowFocus?.(w.player.position);
    } else if (running) {
      stepper.advance(rawDt, (step) => simulate(w, step));
      if (w.network) onlineClient?.sendSnapshot(snapshotWorld(w, state));
    } else stepper.reset();

    if (w.mode === 'race' && w.player) {
      if (state !== 'paused') {
        const mode = state === 'intro' ? 'intro' : state === 'countdown' ? 'countdown' : state === 'finished' ? 'finish' : 'race';
        const lookBack = !!(state === 'racing' && playerInput && playerInput.lookBack);
        safe('camera.update', () => w.chase.update(dt, w.player, { lookBack, mode }));
      }
      hideKartsNearCamera(w);
      safe('hud.update', () => hud.update(dt, { player: w.player, karts: w.karts, race: w.race, itemSystem: w.items, track: w.track, time }));
      safe('mobile.updateRace', () => mobileControls?.updateRace(w.player, w.items));
    } else {
      updateAttractCamera(dt);
    }
    safe('audio.update', () => audio.update(dt, { player: w.player, karts: w.karts, camera }));
  } else {
    updateAttractCamera(dt);
    safe('audio.update', () => audio.update(dt, { camera }));
  }

  try {
    if (composer) composer.render(dt);
    else renderer.render(renderPass.scene, camera);
  } catch (e) { report('render', e); }
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------
async function restoreNativeSave() {
  // iOS may evict WKWebView storage: fall back to the copy mirrored in native Preferences.
  if (!isNative()) return;
  try {
    const local = storage?.getItem(SAVE_KEY);
    if (local) return;
    const json = await prefsGet(SAVE_KEY);
    if (!json) return;
    save = migrate(JSON.parse(json));
    writeSave(storage, save);
  } catch { /* keep the local save */ }
}

async function boot() {
  document.body.dataset.state = 'boot';
  document.title = t('app.name');
  menu.showLoading(t('loading.loading'));
  requestAnimationFrame(frame);
  await Promise.all([loadModules(), restoreNativeSave()]);
  if (mods.input && mods.input.InputController) input = safe('input.ctor', () => new mods.input.InputController());
  mobileControls = new MobileControls({
    input, parent: uiRoot, onPause: () => pause(),
    onSteeringChange: (mode) => { if (settings.steering !== mode) { settings = sanitizeSettings({ ...settings, steering: mode }); persistSettings(); } },
  });
  mobileControls.updateState(state);
  if (mods.models?.createItemIcon) safe('itemIcons', () => { setItemIconProvider(mods.models.createItemIcon); hud.relabel(); });
  if (mods.models && mods.models.createCharacterPortrait) {
    safe('portraits', () => menu.setPortraitProvider(portraitFor));
    hud.setPortraitProvider(portraitFor);
  }
  buildAttract();
  setState('title');
  menu.showTitle();
  audio.playMusic('menu');
  if (ONLINE_ENABLED && new URL(location.href).searchParams.has('room')) openOnline();
}
boot();

// ---------------------------------------------------------------------------------------------
// Debug / test hook
// ---------------------------------------------------------------------------------------------
window.__game = {
  get state() { return state; },
  get world() { return world; },
  get mods() { return mods; },
  get input() { return input; },
  get mobileControls() { return mobileControls; },
  get save() { return save; },
  get settings() { return settings; },
  audio, hud, menu, renderer, camera, bus,
  startRace: (s = {}) => startMode({ ...lastSettings, ...s }),
  get gp() { return gp; },
  fastForward(seconds = 1, step = 1 / 60) {
    const w = world; if (!w) return;
    const n = Math.round(seconds / step);
    for (let i = 0; i < n && world === w; i++) {
      if (state === 'intro') beginCountdown();
      simulate(w, step);
    }
  },
  goToTitle,
  openOnline: () => openOnline(),
  setSettings: (patch) => updateSettings(patch),
  skipIntro: () => beginCountdown(),
  errors: () => [...seenErrors],
  toFinalLap() {
    const w = world; if (!w || !w.player) return;
    w.race.debugSetLap(w.player, w.race.laps);
    if (w.race.laps > 1) bus.emit('race:finalLap', {});
  },
  finishPlayer() {
    const w = world; if (!w || !w.player) return;
    w.race.debugSetLap(w.player, w.race.laps + 1);
    w.race._finish(w.player);
  },
  PHYSICS,
  debug,
};
