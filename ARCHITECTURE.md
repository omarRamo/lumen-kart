# Lumen Kart — Architecture Contract

Lumen Kart is a 3D arcade kart racer starring **Lumen**, the little fox with the scarf from the 2D platformer LUMEN.
It is built with **Three.js r170** as ES modules bundled by **Vite 8**, and wrapped for iOS and Android with
**Capacitor 8**. The engine comes from Turbo Kart Rally (MIT, © BridgeMind); everything the player sees and hears
has been re-dressed for Lumen's world.

This file is the **technical contract** between modules. Product/design decisions live in
[`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md); the French owner documentation is
[`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md).

**Original IP only**: no Nintendo names, characters, logos or assets. Everything is procedural (geometry,
CanvasTexture textures, WebAudio music/SFX). The only binary assets are two OFL fonts (`public/fonts/`) and the app
icons/splash rasterised from `store/brand/icon.svg` by `npm run assets`.

## Conventions (everyone must follow)

- 1 unit = 1 metre. **Y is up.** The track lies in the XZ plane (with elevation).
- Kart heading `h` (radians) is `object3D.rotation.y`. **Forward = (sin h, 0, cos h)**. Models face **+Z**.
- Driver's right = forward × up = **(−cos h, 0, sin h)**. Turning right *decreases* heading.
- `input.steer`: **+1 = toward the driver's right**, −1 = left.
- Shared tuning lives in `src/config.js` (`PHYSICS`, `FEEL`, `ASSIST`, `RACE`, `CHARACTERS`, `ITEMS`, `DIFFICULTY`,
  `CLASSES`, `KEYS`). Shared identity (palette, item names) lives in `src/theme.js`. Import; don't duplicate.
- Cross-system notifications go through `bus` from `src/events.js` (`bus.on(name, fn)` returns an unsubscribe,
  `bus.emit(name, data)`; a throwing handler is logged, never propagated).
- Runtime dependencies: `three` / `three/addons/...` and `@capacitor/*` (only through `src/native.js` /
  `src/native-motion.js`). Every gameplay/render module must stay **importable under Node** (`node --test`): no DOM
  access at module load.
- Robustness: never throw in the frame loop; guard optional fields. `main.js` additionally wraps every subsystem call
  in `safe()` and loads gameplay modules with dynamic `import()` so a broken module degrades instead of killing the game.
- **No per-frame allocation** in hot paths (scratch vectors, pools, instancing).
- `dispose()` everything you create (restarting a race builds a fresh world).
- Simulation is **fixed-step 1/60 s** (`FixedStepper` in `src/simulation.js`, max 12 catch-up steps). Physics in
  `kart.js` uses no `Math.random` and is deterministic for identical inputs.

## Module ownership

| Zone | Files | Main exports |
|---|---|---|
| Art (characters, karts, items) | `src/models.js`, `src/kartfx.js` | `createKartModel`, `createItemModel`, `createCharacterPortrait`, `createItemIcon`, `createRescueDrone`, `createRocketShell` |
| Worlds (circuits, scenery) | `src/tracks.js`, `src/track.js`, `src/environment.js`, `src/track-textures.js`, `src/hazards.js`, `src/coins.js`, `tests/circuits.test.js` | `TRACKS`, `CUPS`, `GP_POINTS`, `getTrackDef`, `getCup`, `createTrack`, `createEnvironment`, `HazardSystem`, `CoinSystem`, `createNoteGeometry` |
| Gameplay (driving, items, AI, camera, FX) | `src/kart.js`, `src/ai.js`, `src/items.js`, `src/effects.js`, `src/camera.js`, `src/input.js`, `src/config.js` (except `CHARACTERS`), `tests/gameplay.test.js`, `tests/simulation.test.js` | `Kart`, `resolveKartCollisions`, `updateSlipstream`, `AIDriver`, `PERSONALITIES`, `ItemSystem`, `itemOdds`, `ITEM_WEIGHTS`, `CLASS_ITEM_MODS`, `Effects`, `FX_QUALITY`, `ChaseCamera`, `InputController` |
| UX/UI, audio, game flow | `src/main.js`, `src/race.js`, `src/menu.js`, `src/hud.js`, `src/styles.css`, `src/mobile.css`, `src/mobile-controls.js`, `src/audio.js`, `src/native-motion.js`, `src/online-ui.js`, `src/online.css`, `src/i18n.js`, `src/save.js`, `src/settings.js`, `src/native.js`, `src/icons.js`, `index.html`, `tests/mobile.test.js`, `tests/save.test.js`, `tests/i18n.test.js` | game loop, `RaceManager`, `Menu`, `HUD`, `MobileControls`, `AudioEngine`, i18n / save / settings helpers |
| Platform & release | `package.json`, `capacitor.config.json`, `vite.config.js`, `ios/`, `android/`, `.github/`, `public/` (except fonts), `Dockerfile`, `server/`, `playwright.config.js`, `tests/network.test.js`, `tests/browser/`, `store/`, `tools/` | relay server, native shells, CI, store tooling |
| Shared (read-only) | `src/theme.js`, `src/events.js`, `src/simulation.js`, `docs/GAME_DESIGN.md` | `PALETTE`, `CSS`, `ITEM_INFO`, `itemName`, `bus`, `FixedStepper` |
| Documentation | `README.md`, `ARCHITECTURE.md`, `docs/DOCUMENTATION.md`, `docs/GAMEPLAY.md`, `docs/CIRCUITS.md`, `docs/NATIVE.md`, `docs/MOBILE_DESIGN.md`, `docs/MULTIPLAYER.md` | — |

Do **not** edit files you don't own. If you need something from another module, code against this contract and
note the request in your report (`docs/agents/<zone>.md`).

---

## 0. Shared identity — `src/theme.js`, `src/config.js`

```js
PALETTE   // 0xRRGGBB: lumenTeal, lumenDeep, lumenMint, leafLight, cream, scarf, scarfStitch, starGold, chestStar,
          // eye, cheek, night, aurora, dawn, comet
CSS       // '#rrggbb' versions for the DOM (teal, deep #1f4f4c, mint, cream, scarf, gold, night, aurora, dawn, comet)
ITEM_INFO // { [internalId]: { fr, en, color, icon /* emoji fallback */ } } for every item id + 'item_box'
itemName(id, lang = 'fr')
```

Internal item ids are **kept from the original engine** (physics, AI, network, tests). Display mapping:

| Internal id | FR | EN |
|---|---|---|
| `coin` | Note | Note |
| `item_box` | Prisme de lumière | Light prism |
| `banana` / `triple_banana` | Ronce / Triple ronce | Bramble / Triple bramble |
| `green_shell` / `triple_green` | Graine / Triple graine | Seed / Triple seed |
| `red_shell` | Luciole | Firefly |
| `mushroom` / `triple_mushroom` | Comète / Triple comète | Comet / Triple comet |
| `bomb` | Fleur solaire | Sunflower burst |
| `ghost` | Voile de nuit | Night veil |
| `star` | Aurore | Aurora |
| `bullet` | Plume d'envol | Flight feather |
| `lightning` | Éclipse | Eclipse |
| `blue_shell` | Étoile filante | Shooting star |
| `horn` | Résonance | Resonance |

`config.js` highlights:
- `CHARACTERS[]`: `{ id, name, species, color, accent, skin, hat, title: {fr,en}, stats: {speed, accel, handling, weight} }`
  (stats 1–5). Ids: `lumen, zina, pip, coralie, rivo, jagu, kibo, nox`. `species` drives the 3D model.
- `CLASSES[]`: `50cc` (speed 0.86, AI `easy`), `100cc` (1.0, `normal`), `150cc` (1.12, `hard`), `200cc` (1.3,
  `extreme`), `mirror` (1.12, `hard`, `mirror: true`).
- `DIFFICULTY[key]`: `aiSpeedFactor`, `aiSkill`, `rubberBandBehind`, `rubberBandAhead`, `driftChargeMul`…
  `'medium'` is a non-enumerable alias of `'normal'`; use `normalizeDifficulty()`.
- `PHYSICS.driftChargeThresholds = [0.8, 1.7, 2.7]`, `PHYSICS.miniTurboTimes = [0.5, 0.8, 1.15]`.
- `FEEL` (hit-stop durations, player steering ramp, low-steer grip bonus, drift entry threshold, wall glance).
- `ASSIST = { defaultStrength: 0.6, defaultOnFor: ['50cc'] }`.

## 1. Worlds — `src/tracks.js`, `src/track.js`, `src/environment.js`

### Catalogue (`tracks.js`)

```js
TRACKS      // 8 definitions (see below)
CUPS        // [{ id:'dawn', names:{fr,en}, color, unlocked:true,  tracks:[meadow, palm-cove, jungle, sunset-canyon] },
            //  { id:'dusk', names:{fr,en}, color, unlocked:false, tracks:[medina, city, frosty-peaks, lava-keep] }]
GP_POINTS   // [15, 12, 10, 8, 6, 4, 2, 1]
LEGACY_CUP_IDS // { turbo: 'dawn', reverse: 'dusk' }   (old Turbo Kart Rally ids)
getCup(id)  // resolves legacy ids
getTrackDef(id)        // unknown id -> first track ('meadow')
trackName(def, lang) / trackBlurb(def, lang)
```

| id | FR / EN | `theme` (world) | Cup |
|---|---|---|---|
| `meadow` | Prairies d'aurore / Dawn Meadows | `meadow` | dawn |
| `palm-cove` | Lagons de corail / Coral Lagoons | `lagoon` | dawn |
| `jungle` | Canopée d'Amazonie / Amazon Canopy | `jungle` | dawn |
| `sunset-canyon` | Dunes qui chantent / Singing Dunes | `desert` | dawn |
| `medina` | Sidi Bou Saïd / Sidi Bou Said | `medina` | dusk |
| `city` | La Ville des toits / Rooftop City | `city` | dusk |
| `frosty-peaks` | Nuit des aurores / Aurora Night | `aurora` | dusk |
| `lava-keep` | Le Domaine de la Nuit / Realm of Night | `night` | dusk |

Ids are stable (tests, save records, network). A definition holds control points (`cp`), `scale`, `theme`, `names`,
`shorts`, `blurbs` (`{fr,en}`), `color`, `song` (an existing legacy song key), `music` (world theme id read by
`audio.js`), and features placed in **cpf** (fractional control-point index): boost pads, ramps (optionally followed
by a `gap`), item rows, note lines, hazards, `lake` (`lake.open` = wall-less bridge), `bridges: [{from,to}]` and
`shortcuts: [{from,to}]` (opens the inner barrier of a bend onto a level off-road cut).
Legacy theme keys `beach / snow / lava` are accepted as aliases of `lagoon / aurora / night` (`WORLD_ALIASES`).

### Track object (`createTrack(scene, renderer, { def | trackId, mirror, quality })`)

Quality is read from `opts.quality`, then `renderer.userData.quality`, then `window.__lumenQuality` (default `high`).
**Gameplay geometry is identical at every quality** (tested); only scenery density, terrain resolution and shadow map
size change.

| member | type | meaning |
|---|---|---|
| `id`, `def`, `name`, `names` | | identity (`names` = `{fr,en}`) |
| `theme`, `world` | string | canonical world key (`meadow … night`) |
| `pitKind` | `'water' \| 'void'` | what a pit/gap drops into (`void` = starry void of the Realm of Night) |
| `quality`, `mirror` | | build options actually used |
| `curve`, `length`, `roadWidth` | | closed centreline (`CatmullRomCurve3`), length (~1.7–2.0 km), full road width (24 m) |
| `startPositions` | `Array<{position, heading}>` (≥ 8) | grid slots, index 0 = pole |
| `itemBoxPositions`, `coinPositions` | `Vector3[]` | prism rows, note lines |
| `hazardDefs` | array | creature placements for `HazardSystem` |
| `gaps`, `shortcuts` | `[{t0,t1}]`, `[{t0,t1,side}]` | road gaps and open shortcut zones |
| `boostPads`, `jumpRamps` | arrays | `{t, lateral, length, halfWidth}` / `{t, length, halfWidth, height}` |
| `minimap` | `{ points, bounds }` | ≥ 200 centreline samples |
| `getSurfaceInfo(pos, hintT?)` | → `{ height, normal, surface, t, lateral, onRoad, pit?, roadY? }` | `surface` ∈ `'road'\|'offroad'\|'boost'\|'jump'\|'pit'`; over a shortcut the surface stays `offroad` |
| `resolveWall(pos, radius)` | → `null \| { normal, depth }` | barrier collision |
| `getPointAt(t)`, `getTangentAt(t)`, `getRacingLine(t)` | `Vector3` | centreline / direction / AI line |
| `pointAt(t, lat, out?)`, `headingAt(t)`, `getRespawnT(t)`, `getWallOffsets(t)` | | helpers (respawn never inside or just before a gap) |
| `sunLight`, `setShadowFocus(v)` | | the single shadow-casting light follows the focused kart |
| `update(dt, time)`, `dispose()` | | never throws |

`createEnvironment(scene, renderer, root, layout)` builds the per-world sky dome (gradient, sun or crescent moon,
stars), fog, lights, terrain, water/ice/void, background and instanced scenery. All merges go through
`safeMerge()` (returns `null` instead of throwing; null meshes are skipped).

### Per-race systems
```js
new CoinSystem({ scene, track, karts })      // golden ♪ notes: one InstancedMesh + one Points for sparkles
new HazardSystem({ scene, track, karts })    // creatures; update(dt, time, { collisions = true }); getHazards()
```
Hazard types: `crab`, `sheep`, `dandelion`, `frog`, `boulder` (shadow orb in the Night world), `tumbleweed`, `cat`,
`pigeon`, `snowman`, `snowball`, `stomper`. Motion is a pure function of simulation time (deterministic; guests
call `update(..., { collisions: false })`).

## 2. Driving — `src/kart.js`, `src/ai.js`, `src/input.js`

```js
export class Kart {
  constructor({ scene, track, character, isPlayer, index, model, difficulty = 'medium' })
  object3D, position, velocity, heading, speed, radius
  input            // { throttle 0..1, brake 0..1, steer -1..1, drift bool (held), item bool (edge), itemHeld bool, lookBack bool }
  isPlayer, character, index, trackT, surface, airborne
  drifting, driftDir, driftLevel (0..3), boostTimer, starTimer, shrinkTimer, spinTimer, invulnTimer, fallTimer
  item, itemCount, coins (0..10), slipCharge, controlsLocked
  lap, place, finished, finishTime, raceProgress   // maintained by RaceManager
  assist           // { steering: bool, strength: 0..1 } — steering assist ("aide à la direction"), default off
  assistNudge      // 0..1, current correction strength (optional HUD hint)
  update(dt)
  applyHit(kind)   // 'spin' | 'tumble' | 'shrink'  (ignored under star / invulnerability)
  applyBoost(seconds, strength = 1, source?)
  startStar(s), startRocket(s), startGhost(s), applyClass(scale), addCoins(n), loseCoins(n)
  reset(position, heading), dispose()
}
export function resolveKartCollisions(karts)
export function updateSlipstream(karts, dt)
```

Handling: hop + drift (hold drift; the drift commits as soon as `|steer| > FEEL.driftEntrySteer` while held, also on
landing), 3-stage mini-turbo (mint → dawn → comet violet), rocket start, ramp tricks, slipstream, off-road slowdown,
glancing wall contacts keep ~95 % speed, per-kart **hit-stop** (`FEEL.hitStop`), coins raise top speed.
The player kart ramps digital steering (`FEEL.steerRiseTime/steerFallTime`); AI steering is raw.

**Steering assist** (`kart.assist`, `Kart._assistSteer`, allocation-free): pure-pursuit toward the racing line when
hands-off, an always-on edge guard (predicted lateral position at 0.55 s), a corner speed governor that never
overrides player braking, and an anti-fall net over pits. The UI sets
`world.player.assist = { steering: assistFor(settings, classId), strength: ASSIST.defaultStrength }` after building the
world.

Pits: `kart:fall` carries `{ kart, position, pitKind, void, lava }` (`lava` kept for compatibility, true for the void).
The rescue bird (`createRescueDrone`) brings the kart back at `track.getRespawnT(t)`.

```js
export class AIDriver { constructor(kart, track, { difficulty, personality? }); update(dt, ctx) }
// ctx = { karts, player, itemSystem, time, ... }. Personalities in PERSONALITIES (keyed by character id).
// Smoothed rubber band (1.5 s⁻¹) relative to the player, per class (DIFFICULTY.*.rubberBandBehind/Ahead).
export class InputController { getInput(); isPressed(a); consumePressed(a); peekThrottle(); reset(); dispose() }
// Keyboard (KEYS + EXTRA_KEYS: confirm, back, up, down, mute) and standard Gamepad mapping (stick expo 1.35).
```

## 3. Items & FX — `src/items.js`, `src/effects.js`

```js
export class ItemSystem {
  constructor({ scene, track, karts, noBoxes = false })
  update(dt, time); getHazards(); rouletteState(kart); giveItem(kart, item, count); isDragging(kart); dispose()
  difficulty   // inferred from karts; can be forced ('easy' | 'normal' | 'hard' | 'extreme')
  extraHazards // hook: track hazards merged into getHazards() for AI
}
export function itemOdds(place, racers = 8, difficulty = 'normal') // weighted table per place × class
export const ITEM_WEIGHTS, CLASS_ITEM_MODS, ITEM_ORDER
```
Rules: one shooting star in play, never for 1st; flight feather never for the top 2; one eclipse held at a time.
Prisms are drawn by `PrismBatch` (one `InstancedMesh` per model part + one `Points` for halos). Projectiles and held
items are pooled; no item visual casts shadows.

```js
export class Effects {
  constructor(scene, camera)
  update(dt, karts)
  burst(kind, position, opts)
  // kinds: 'explosion' 'confetti' 'itemBox' 'hitStars' 'splash' 'landingDust' 'sparks' 'miniTurbo' 'shrink' 'smoke'
  //        + Lumen Kart: 'petals' 'leaves' 'lightMotes' 'voidFall'
  speedLines   // bool; false (or window.__lumenReduceMotion) disables speed streaks
}
export const FX_QUALITY // pool sizes per quality: high 5000/2200/700/70, medium 3000/1300/420/48, low 1500/650/220/28
```
Pool sizes are read from `window.__lumenQuality` when the race is created; emission rate is read every frame.

## 4. Art & Camera — `src/models.js`, `src/kartfx.js`, `src/camera.js`

```js
export function createKartModel(character /* + optional scarf: 0xRRGGBB */) // -> KartModel
KartModel = {
  root, quality,
  anchors: { exhaustL, exhaustR, wheelRL, wheelRR, wheelFL, wheelFR, itemHold },
  parts: { body, driver, head, wheels /* FL, FR, rear axle */, eyes, ears, lantern, scarf }, // eyes/ears/lantern null in 'low'
  animate({ dt, speed, steer, drifting, driftDir, boosting, airborne, spin, star, time }),
  setShrunk(scale), dispose()
}
export function createItemModel(type)               // every ITEM_INFO id (incl. triples, ghost, bullet, horn, coin)
export function createCharacterPortrait(character)  // dataURL 128×128
export function createItemIcon(type, size = 96)     // dataURL icon for HUD / roulette
export function createRescueDrone()                 // lantern bird (kartfx.js)
export function createRocketShell()                 // flight feather cocoon (kartfx.js)
```
All static parts are baked into vertex-coloured geometry with a per-vertex `surf` attribute (glow, roughness, metal)
read by **one shared `MeshStandardMaterial` program**. One mesh per moving group (10–12 meshes per kart in `high`);
only body + torso cast shadows (a blob decal replaces shadows in `low`). LOD is read from `window.__lumenQuality`
**at creation time** (templates cached per character × quality). The scarf is a dynamic ribbon (≤ 44 vertices)
updated without allocation.

```js
export class ChaseCamera {
  constructor(camera)
  update(dt, kart, { lookBack, mode /* 'race'|'countdown'|'finish'|'intro' */ })
  snap(kart)
  shake(intensity /* 0..1 */, duration /* s */)   // timed shake, scaled by shakeScale
  punch(strength = 1)                              // short zoom-in spring (hits, big landings)
  addShake(amount)                                 // legacy decaying impulse
  shakeScale                                       // 0..1; also window.__lumenShakeScale
}
```
Landscape framing caps the horizontal FOV at 104°; FOV kick on boosts; corner look-ahead; drift swing.

## 5. Game, UI, audio, persistence

### `main.js` — bootstrap and loop
Owns the renderer (ACES tone mapping, sRGB), quality presets, optional bloom composer (desktop `high` only), state
machine (`boot → title → mode/class/cup/track/select → loading → intro → countdown → racing → finished`, `paused`,
`online`), Grand Prix state, progression hooks and the loop:

```
frame():  rawDt = clock.getDelta()
          menu.update, hud.tickFps, adaptQuality(rawDt)
          stepper.advance(rawDt, step => simulate(world, step))     // fixed 1/60 s, bounded catch-up
          chase.update(dt, player, {lookBack, mode}); hud.update(...); mobileControls.updateRace(...); audio.update(...)
          composer ? composer.render() : renderer.render()
simulate(dt): player input -> AIDriver.update -> Kart.update -> resolveKartCollisions -> updateSlipstream
              -> items.update -> coins.update -> hazards.update -> race.update -> effects.update -> track.update
              -> track.setShadowFocus(focus)
```

Grand Prix: 4 races, `GP_POINTS`, the standings order becomes the next grid (leader on pole); the player starts
5th/6th in the first race. Time trial: one kart, no prisms, a triple comet. Online is enabled only when
`import.meta.env.VITE_WS_URL` is set at build time.

### Quality flags (set by `main.js` before a world is built)
| Global | Values | Read by |
|---|---|---|
| `window.__lumenQuality` | `'high' \| 'medium' \| 'low'` | `models.js` (LOD), `track.js`/`environment.js` (density, shadows), `effects.js` (pools) |
| `renderer.userData.quality` | same | `track.js` |
| `window.__lumenReduceMotion` | bool | `effects.js` (speed lines), CSS (`body.reduce-motion`) |
| `window.__lumenShakeScale` | 0..1 (0.25 with reduce motion) | `camera.js` |

`settings.js › qualityPreset(level, { mobile, dpr })`:

| Level | Pixel ratio (mobile / desktop) | Shadows | Bloom | MSAA |
|---|---|---|---|---|
| `high` | ≤ 1.5 / ≤ 2 | PCF soft | desktop only | desktop only |
| `medium` | ≤ 1.25 / ≤ 1.5 | PCF | no | desktop only |
| `low` | ≤ 1 | none (blob shadows) | no | no |

`resolveQuality('auto', env)`: phone → `medium` (`low` if ≤ 3 GB RAM or ≤ 4 cores); desktop → `high`. In `auto`,
if a race stays below 40 fps for 4 s, the pixel ratio steps down by 15 % (floor 60 %).

### Other UI modules
- `race.js` — `RaceManager({ track, karts, player, laps, silent })`: grid, countdown, laps (mid-lap checkpoint),
  places, wrong-way, results.
- `menu.js` — `Menu(uiRoot, handlers, ctx)`: title, mode, class, cup/track, character (+ Lumen's scarf), settings,
  credits; spatial keyboard/gamepad focus on `[data-nav]`; `data-testid` hooks (see `docs/agents/ux.md` §2).
- `hud.js` — `HUD(uiRoot)`: `reset`, `update`, `callout`, `banner`, `toast`, `tip`, `celebrate(events)`,
  `showResults`, `showGPResults`, `showPodium`, `relabel`, `setFpsVisible`, `tickFps`, `setPortraitProvider`.
- `mobile-controls.js` — `MobileControls({ input, parent, onPause, onSteeringChange })`: auto-throttle cockpit,
  touch steering pill, Item / Drift / Brake, tilt (GYRO) + recentre, pause. Pure helpers `screenTilt`, `gravityTilt`,
  `tiltSteer`, `touchSteer`, `driftProgress` are unit-tested.
- `audio.js` — `AudioEngine`: procedural instruments, one theme per world (`def.music`, then `track.world`), menu
  lullaby, final-lap tempo ×1.1, soft SFX; `resolveSong(name)`.
- `icons.js` — `itemIcon(id)` (uses `createItemIcon` when provided via `setItemIconProvider`, else its own canvas
  icons), `svgIcon(name)`, `logoEmblemSVG()`, `logoEmblemDataURL()`.
- `i18n.js` — `STRINGS.fr/en`, `t(key, vars)`, `setLanguage`, `resolveLanguage('auto'|'fr'|'en')`,
  `detectLanguage`, `onLanguageChange`, `trackName`, `trackBlurb`, `cupName`, `className`, `classLabel`, `itemLabel`,
  `characterTitle`, `ordinal`, `ordinalParts`, `formatTime`, `esc`.
- `save.js` — key `lumenkart.save.v1`; `loadSave`, `writeSave`, `migrate`, `sanitize`, `recordRace`,
  `recordGrandPrix`, `recordTimeTrial`, `recordKey(trackId, mirror)`, `computeUnlocks`, `diffUnlocks`,
  `isCupUnlocked`, `isMirrorUnlocked`, `isCharacterUnlocked`, `isTrackUnlocked`, `isScarfUnlocked`, `chooseScarf`,
  `SCARVES`. Unlocks are **derived**, never stored.
- `settings.js` — key `lumenkart.settings.v1`; `DEFAULT_SETTINGS`, `sanitizeSettings`, `loadSettings`,
  `saveSettings`, `assistFor`, `resolveQuality`, `qualityPreset`.
- `native.js` — defensive Capacitor access: `isNative()`, `haptic(kind)` (throttled 60–90 ms, `navigator.vibrate`
  fallback), `setHapticsEnabled`, `onAppEvents({ back, pause, resume })`, `exitApp()`, `prefsGet/prefsSet`
  (save mirrored to native Preferences). `native-motion.js` talks to the local `TiltMotion` plugin.

### Debug / test hook
`window.__game` exposes `state`, `world`, `save`, `settings`, `startRace({ gameMode: 'gp'|'vs'|'tt', cupId, trackId,
classId, ... })`, `fastForward(seconds)`, `skipIntro()`, `toFinalLap()`, `finishPlayer()`, `goToTitle()`,
`openOnline()`, `setSettings(patch)`, `errors()`, `debug.autopilot`.

## 6. Online (hidden in store builds)
`network.js` (`NetworkClient`), `multiplayer-race.js` (`snapshotWorld`, `SnapshotRenderer`), `online-ui.js`
(`OnlineUI`), `server/index.js` (bounded WebSocket relay). Host-authoritative simulation; see
[`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md).

## Event catalogue (bus)

| Event | Payload | Notes |
|---|---|---|
| `race:countdown` | `{n}` | 3, 2, 1 |
| `race:go`, `race:finalLap`, `race:end` | | |
| `race:lap` | `{kart, lap}` | |
| `race:finish` | `{kart, place}` | |
| `race:wrongWay` | `{active}` | player only |
| `kart:driftStart` / `kart:driftEnd` | `{kart}` | |
| `kart:driftLevel` / `kart:miniTurbo` | `{kart, level}` | |
| `kart:boost` | `{kart, source, seconds?, strength?}` | source: `start`, `miniTurbo`, `pad`, `trick`, `slipstream`, `rocket`, `star`, `mushroom`, `coin`, `item` |
| `kart:hit` | `{kart, kind}` | |
| `kart:hitStop` | `{kart, kind, duration}` | per-kart impact freeze (simulation time) |
| `kart:wallBump` | `{kart, intensity, glancing}` | |
| `kart:hop`, `kart:jump`, `kart:trick`, `kart:stall`, `kart:respawn` | `{kart}` | |
| `kart:land` | `{kart, impact, airTime, intensity, squash}` | |
| `kart:bump` | `{a, b, intensity}` | |
| `kart:fall` | `{kart, position, pitKind, void, lava}` | |
| `kart:coin` / `kart:coinLoss` | `{kart, count, gained}` / `{kart, n, position}` | |
| `kart:rocket` / `kart:rocketEnd`, `kart:ghost` / `kart:ghostEnd`, `kart:slipstream` | | |
| `haptic` | `{kart, style, intensity, source}` | **local player only**; style `selection\|light\|medium\|heavy\|success`; source `hit`, `miniTurbo`, `boost`, `land`, `wall`, `bump`, `driftStart`, `driftLevel`, `itemHit` |
| `coin:pickup` | `{kart, position}` | counts toward the saved notes total |
| `item:pickup`, `item:roulette`, `item:got`, `item:use`, `item:hit`, `item:explode`, `item:lightning`, `item:drag`, `item:block`, `item:steal`, `item:horn` | | |
| `item:splash` | `{position, pitKind, void}` | item dropped in a pit |
| `items:created` / `items:disposed` / `fx:created` | `{system}` / `{effects}` | internal items ↔ effects coupling |
| `hazard:hit`, `hazard:smash`, `hazard:stomp` | | |
| `game:state` | `{state}` | |
| `game:record`, `game:podium {place}`, `game:unlock {type, id?}` | | progression feedback |
| `ui:move`, `ui:confirm`, `ui:back` | | menu sounds |
