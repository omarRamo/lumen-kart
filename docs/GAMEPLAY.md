# Gameplay integration

`normalizeDifficulty()` canonicalizes `easy`, `medium`, `hard`; the old `normal` value maps to `medium`. `DIFFICULTY.normal` remains readable but is non-enumerable. Pass difficulty to both `new Kart({ difficulty, ... })` and `new AIDriver(kart, track, { difficulty })`.

| Setting | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Kart speed multiplier | 0.88 | 1 | 1.12 |
| Steering authority | 1.14 | 1 | 0.95 |
| Base AI speed multiplier | 0.83 | 0.95 | 1.03 |
| Obstacles | 8 | 14 | 20 |
| Moving obstacles | 1 | 3 | 5 |

Easy offers slower, more forgiving driving and less competitive AI. Hard increases speed while reducing steering authority and filling more course stations with hazards. Character stats remain effective at each level.

Construct `ObstacleSystem({ scene, track, karts, difficulty })`. Call `update(dt, simulationTime)` during authoritative physics and provide the system as `obstacleSystem` in each AI update context. Guests call `update(dt, hostSimulationTime, { collisions: false })`; this changes only obstacle visuals. Placement depends only on track ID and difficulty; movement depends only on absolute simulation time. `getHazards()` returns stable objects with position, radius, track parameter and lateral offset. Dispose the system on course changes.

Orange cones produce a mild slowdown. Striped barriers, rocks and yellow moving sweepers spin karts and reduce velocity. Star power passes through hazards. Elevated jumping karts can clear them. Stations are spaced along the middle 76% of the circuit, keeping the grid/finish approach open. Each station has one obstacle offset toward a shoulder; movement stays on that side and preserves a clear central lane. AI includes obstacles in its existing lane-avoidance planning.

Race bookkeeping accumulates signed course distance and requires the midpoint checkpoint before accepting a completed lap. Reversing across the finish does not earn another lap or erase a completed lap. Finished racers' times are frozen. Wrong-way detection follows velocity along the course, including reversing with the kart nose facing forward.

Rocket starts use simulation seconds. Feed neutral driving input during the countdown; `peekThrottle()` supplies explicit manual throttle intent without automatic acceleration. Pausing simulation pauses the countdown hold duration and AI start delay.

Run `node --test tests/gameplay.test.js` for difficulty, hazard determinism/clearance, guest collision isolation, reverse-driving detection, lap integrity and rocket timing checks.

The seeded real-course smoke test also runs all eight characters at 60 Hz on each of the twelve circuit/difficulty combinations, with real kart and obstacle collisions. All 96 racers finish within the 240-second simulation budget. Observed last-finisher lap times with seed 7831:

| Circuit | Easy | Medium | Hard |
| --- | --- | --- | --- |
| Palm Cove | 76.33 s | 64.35 s | 66.65 s |
| Sunset Canyon | 92.32 s | 74.45 s | 67.20 s |
| Alpine Rush | 95.25 s | 71.85 s | 78.05 s |
| Neon Harbor | 87.17 s | 71.73 s | 64.35 s |

This smoke test uses canvas stubs for texture creation and no GPU; it validates race completion and physics, while browser checks cover rendering and controls. It excludes item attacks and multiplayer network transport. Hard difficulty's extra collisions can make the last finisher slower despite higher cruising speed.
