# iOS and Android

The same Vite bundle runs in browsers and Capacitor 8 native shells. Three.js 0.170.0 and all game assets ship inside the app. Fonts use the existing local system fallbacks; no font or JavaScript CDN connection is required for solo play.

## Build and run

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev          # browser development, including LAN access
npm run server       # multiplayer WebSocket service
npm test
npm run native:sync  # production build, then copy into both native projects
npm run native:ios   # sync, then open Xcode
npm run native:android # sync, then open Android Studio
```

Run `native:sync` after changing JavaScript, CSS, or Capacitor settings, before any native build. Generated web assets are ignored by Git and rebuilt from source. Neither app depends on a Vite dev server.

## iOS

Open `ios/App/App.xcodeproj` with Xcode 26 or later. Swift Package Manager resolves the pinned Capacitor runtime. The app supports iOS 15+ and landscape in both directions, including full-screen iPad operation. Choose a signing team and an available bundle identifier before installing on a physical device or archiving for distribution. The checked-in identifier is `com.turbokartrally.game`.

The motion usage description explains tilt steering. Native shells use the local `TiltMotion` Capacitor plugin: CoreMotion device gravity on iOS and a gravity sensor (with a filtered accelerometer fallback) on Android. The plugin suspends sensor updates in the background and resumes while enabled. Browser motion permission is requested from a player gesture; unavailable sensors or denied permission leave touch steering available. The local-network usage description supports races with a LAN server. Device permission prompts and sensor behavior require a real phone; a simulator does not validate tilt steering.

Unsigned simulator compilation:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/turbo-kart-ios-build CODE_SIGNING_ALLOWED=NO build
```

## Android

Install Android Studio 2025.2.1 or later with its JDK and Android SDK 36. Open `android/`, let Gradle sync, and select a physical device or emulator. The minimum Android API is 24. The activity uses sensor landscape orientation; accelerometer and gyroscope hardware are optional so touch-only devices remain supported.

```sh
cd android
./gradlew assembleDebug
```

A debug APK is produced in `android/app/build/outputs/apk/debug/`. Release signing must be configured locally; no keystore or credentials are included. Large-screen Android versions may choose to override app orientation restrictions, so the web UI also needs responsive layouts.

## Multiplayer hosting

Run the race service on a reachable server and configure its WebSocket URL in the game. `localhost` on a phone means that phone, not the development computer. Use a TLS `wss://` endpoint for native releases; the Android shell keeps cleartext traffic disabled. Browser HTTPS deployments also require `wss://`. A reverse proxy can terminate TLS and forward WebSocket upgrades to the Node service. Solo play needs no server.

## Verification and release work

Verified on 2026-09-24: Vite production build, Capacitor sync for both platforms, and unsigned iOS Simulator compilation with Xcode 27 all pass. No simulator runtimes/devices were installed, so launch testing was unavailable. Android debug compilation also passed in GitHub Actions with Java 21 and SDK 36; the local machine has no Android SDK/JDK. The downloadable `turbo-kart-android-debug` artifact is attached to the [verified build](https://github.com/omarRamo/turbo-kart/actions/runs/36041420391). Physical-device motion, touch layout, and multiplayer testing remain necessary before distribution.

The generated native icons and launch art are framework placeholders. Replace them with final game artwork, choose final app identifiers, configure signing, and complete store metadata before publishing. Production dependencies pass `npm audit --omit=dev`; the current Capacitor CLI's `xcode` → `uuid` development dependency has a moderate advisory reported by `npm audit` (GHSA-w5hq-g745-h8pq).

Reference: [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [native workflow](https://capacitorjs.com/docs/basics/workflow), [motion permission](https://capacitorjs.com/docs/apis/motion), [Vite production builds](https://vite.dev/guide/build).

The `Verify and build Android` workflow runs the Node tests, builds the web bundle, syncs Capacitor and compiles a debug APK. Debug signing is for testing; store distribution still needs a release keystore.
