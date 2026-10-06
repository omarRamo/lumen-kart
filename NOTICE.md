# Lumen Kart — notices

**Lumen Kart** © 2026 Omar Trabelsi.
Built on the **Turbo Kart Rally** engine © 2026 BridgeMind, released under the MIT License.
Both notices are kept in [`LICENSE`](LICENSE), which must accompany every copy or substantial portion of the code.

## Name, character and brand artwork

The names *Lumen Kart* and *LUMEN*, the character **Lumen** (the teal fox with leaf ears and a coral scarf),
the other pilots' designs, and the brand artwork in `store/brand/` (app icon, splash, store graphics — and the
icon/splash images generated from it in `ios/`, `android/` and `public/`) are original works of Omar Trabelsi.
The MIT License grants rights to the software; it grants no trademark rights to these names, and forks must not
publish to app stores under the Lumen Kart name or icon.

Lumen Kart is an original game. It is not affiliated with, endorsed by or derived from the assets of Nintendo
or any other kart-racing franchise. All 3D models, textures, music and sound effects are generated procedurally in code.

## Third-party software shipped in the apps

| Component | Version | License | Where |
|---|---|---|---|
| [three.js](https://threejs.org) | 0.170.0 | MIT — © 2010-2024 three.js authors | bundled web code (`three`, `three-addons` chunks) |
| [Capacitor](https://capacitorjs.com) core, iOS, Android | 8.5.2 | MIT — © 2017-present Drifty Co. (Ionic) | native shells and JS bridge |
| @capacitor/app, haptics, preferences, status-bar, splash-screen | 8.x | MIT — © Drifty Co. (Ionic) | native plugins |
| [capacitor-swift-pm](https://github.com/ionic-team/capacitor-swift-pm) (Capacitor, Cordova compat) | 8.5.2 | MIT — © Drifty Co. | iOS Swift package |
| AndroidX (appcompat, core, core-splashscreen, coordinatorlayout, webkit) | see `android/variables.gradle` | Apache License 2.0 — © The Android Open Source Project | Android app |
| [Fredoka](https://github.com/hafontia/Fredoka-One) | — | SIL Open Font License 1.1 — © 2016 The Fredoka Project Authors | `public/fonts/fredoka.woff2`, license in `public/fonts/LICENSE-fredoka.txt` |
| [Outfit](https://github.com/Outfitio/Outfit-Fonts) | — | SIL Open Font License 1.1 — © 2021 The Outfit Project Authors | `public/fonts/outfit.woff2`, license in `public/fonts/LICENSE-outfit.txt` |

## Third-party software used by the optional online relay (server, not in the apps)

| Component | License |
|---|---|
| [ws](https://github.com/websockets/ws) 8.x | MIT — © Einar Otto Stangvik and contributors |
| Node.js runtime (Docker image `node:22-alpine`) | MIT and others — see nodejs.org |

## Build and test tools (not distributed)

Vite (MIT), Rolldown (MIT), @capacitor/cli (MIT), Playwright (Apache-2.0), sharp / libvips (Apache-2.0 / LGPL-3.0, used only
at build time to rasterise the icons; no libvips code ships in the apps).

The full license texts of MIT and Apache-2.0 components are included in each package under `node_modules/<package>/LICENSE`;
the OFL texts ship with the fonts. An in-app "Credits / Licenses" screen should reproduce this list (see `docs/agents/platform.md`).
