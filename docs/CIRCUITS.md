# Circuits

`createTrack(scene, renderer, { trackId, difficulty })` accepts the four stable
IDs below. Omitted options retain Palm Cove and medium difficulty; unknown IDs
fall back to Palm Cove. All road layouts retain 24 control points, eight starting
positions, 30 item positions, eight boost pads, two ramps, a 256-point minimap,
continuous barriers, and the original track sampling/collision API.

| ID | World | Layout |
| --- | --- | --- |
| `palm-cove` | Original tropical island, lagoon bridge, palms and boats | Original circuit |
| `sunset-canyon` | Warm sunset, sandstone mesas and cacti | Elevated canyon S-bends and broad western return |
| `alpine-rush` | Snow terrain, fir forest and distant peaks | Long ascent to 44 m, switchbacks and downhill return |
| `neon-harbor` | Blue night, luminous cargo stacks, cranes and skyline | Dockside corners with an elevated eastern section |

Difficulty changes full road width to 28 m (easy), 24 m (medium), or 21 m (hard).
It does not change centerline topology, enabling deterministic session selection.
The resulting track exposes `id`, `name`, and `difficulty`; gameplay features
continue to expose normalized `t` values and physical dimensions.

The new environments use shared instanced low-poly scenery and one shadowed
sun, with 1024-pixel shadow maps. Terrain follows road elevation near barriers;
props are rejected within 38 m of any road centerline. All assets are procedural.
Disposal removes world lights, meshes, textures/materials, and restores scene fog
and background. Palm Cove retains its existing environment and visual assets.

Verification: `node --test tests/circuits.test.js` constructs all three new worlds
without a GPU and checks closed geometry, start positions, item placement, road
projection, ramp surfaces, slopes, minimap shape, and cleanup. Canvas drawing is
stubbed only for this geometry test; visual appearance still requires browser QA.
