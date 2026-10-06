# Turbo Kart Rally

A procedural Three.js kart racer in the spirit of Mario Kart, for desktop browsers, touch devices, iOS and Android. Karts, courses, scenery, textures, music and sound effects are all generated in code. Vite bundles the game and Three.js locally; solo play in the native apps does not need an internet connection.

## Play modes

- **Grand Prix:** four races in a row on the Turbo Cup or the Blazing Cup. Points 15-12-10-8-6-4-2-1, standings between races (leader starts on pole) and an award ceremony with a gold, silver or bronze trophy saved per cup and class.
- **Versus:** any course, 1 to 7 laps.
- **Time Trial:** just you, the clock and a triple mushroom. Best total and best lap are saved per course.
- **Online (friends or public):** create a private room, share its code or an invite link, ready up and start together. Up to eight human racers; AI fills empty slots.
- **Engine classes:** 50cc, 100cc, 150cc, 200cc and Mirror (150cc on flipped courses).

The online mode needs the included WebSocket server. This repository does not configure or deploy a public server automatically. The host simulates the race and guests send controls; it is suitable for casual races, not trusted competitive rankings. If the host leaves, the room closes. An online pause menu does not stop the other racers.

## Courses

| Course | Character |
| --- | --- |
| Palm Cove Circuit | Sunny seaside sprint over a lagoon bridge, with scuttling crabs |
| Frosty Peaks Pass | Climb to a snowy summit and a downhill jump, snowfall, snowmen and rolling snowballs |
| Sunset Canyon Raceway | Desert at dusk with mesas and cacti, fast straights, big jumps, boulders and tumbleweeds |
| Lava Keep | Night fortress: stone stompers, a wall-less bridge over a lava moat and a broken drawbridge to jump |

Falling off a bridge or into the gap drops you in the water or lava; a rescue drone fishes you out and puts you back on the road.

## Features

- **Eight racers** with their own hat, look and stats for speed, acceleration, handling and weight.
- **Arcade handling** with hop, drift, three-stage mini-turbo, rocket start, trick boosts off ramps, off-road slowdown, wall bumps and weight-based kart collisions.
- **Coins:** each one gives a tiny boost and raises your top speed; you can hold ten. Getting hit spills them.
- **Slipstream:** tuck in behind a rival at speed to charge a draft boost.
- **Fifteen items**, weighted by race position: coin, banana, triple bananas, green shell, triple green shells (orbiting), homing red shell, mushroom, triple mushroom, bomb, ghost (turn intangible and steal an item), star, bullet (autopilot rocket), lightning, winged blue shell and super horn (shockwave that even destroys a blue shell).
- **Item defence:** hold the item button to drag a banana or shell behind you as a shield; triple items trail or orbit you and absorb hits.
- **AI drivers** that follow a racing line, drift, dodge items and hazards, drag shields, use every item and rubber-band toward the player.
- **Audio:** synthesised engine, drift and item sounds and a chiptune soundtrack per course that speeds up on the final lap.
- **Presentation:** demo race behind the title, intro flyover, 3-2-1-GO with start lights, lap/position/coin HUD, item roulette, minimap, on-screen callouts, results, GP standings and podium.

## Controls

Desktop: W/↑ accelerate, S/↓ brake, A/D or ←/→ steer, Space hop/drift, E/X/left Shift item (hold to drag behind), C look back, Esc/P pause, M mute. Gamepads remain supported.

Hold drift through a corner: sparks turn blue, orange, then purple; release for a mini-turbo. Hold accelerate as the countdown reaches GO for a rocket start. Tap drift leaving a ramp for a trick boost. Hold look back while firing to throw shells and bombs backwards.

### Mobile controls

Acceleration is automatic once the race starts. The first Race or Online tap requests motion access where required. Hold the phone comfortably to calibrate, then tilt it to steer. **GYRO** toggles tilt steering and **RECENTER** calibrates it again.

Touch left/right arrows always remain available. Brake, Drift and Item buttons sit under the right thumb; pause is in the top toolbar. If permission is denied or no sensor data arrives, touch controls still work. Browser sensor access requires HTTPS (or localhost). Landscape is preferred, with a responsive portrait layout for browsers.

## Run locally

Node.js **22.12+**:

```sh
npm ci
npm run dev
```

Open the Vite URL printed in the terminal. For online play, run this in a second terminal:

```sh
npm run server
```

The default local relay is `ws://localhost:8787/ws`. The online lobby's Server connection field accepts another endpoint. For phones, use a reachable TLS endpoint; localhost refers to the phone itself. Set `VITE_WS_URL=wss://your-server/ws` when building a release. [Server deployment and invite behavior](docs/MULTIPLAYER.md)

```sh
npm run build       # production web bundle in dist/
npm run preview     # serve the production bundle
```

## iOS and Android

```sh
npm run native:sync     # rebuild and copy web assets into both native projects
npm run native:ios     # open Xcode
npm run native:android # open Android Studio
```

The checked-in Capacitor projects are in `ios/` and `android/`. Xcode signing and Android SDK/JDK tooling are needed for device builds. [Native setup, build commands and verification limits](docs/NATIVE.md)

## Verification

```sh
npm test                 # physics, courses, mobile input and real WebSocket clients
npm run build
npm run test:browser      # mobile gameplay and a two-browser online race
```

## Code layout

- `src/main.js`: world lifecycle, fixed-step simulation, game modes (GP / Versus / Time Trial) and online integration.
- `src/kart.js`, `ai.js`, `input.js`, `mobile-controls.js`: driving and controls.
- `src/tracks.js`, `track.js`, `environment.js`, `hazards.js`, `coins.js`: course catalogue, generator, themes, hazards and coins.
- `src/items.js`, `effects.js`, `models.js`, `kartfx.js`, `audio.js`: items, effects and procedural content.
- `src/network.js`, `multiplayer-race.js`, `online-ui.js`: lobby, controls transport and snapshots.
- `server/index.js`: bounded WebSocket rooms and relay.
- `src/menu.js`, `hud.js`, `styles.css`, `mobile.css`: screens and racing interface.
- `tests/`: automated checks; `dev/`: original interactive module harnesses.

`window.__game` exposes development helpers such as `startRace({ gameMode: 'gp', cupId: 'turbo' })`, `startRace({ trackId: 'lava-keep', classId: '200cc' })`, `finishPlayer()`, `fastForward(seconds)` and `debug.autopilot`.

The original game architecture is recorded in [ARCHITECTURE.md](ARCHITECTURE.md). Mobile/native/network extensions are described in `docs/`. This is an original fan-made homage to arcade kart racing, unaffiliated with Nintendo.

## License

[MIT](LICENSE) © 2026
