# Rapport — Plateforme & publication (Lumen Kart)

Agent : Platform & Release Engineer · Date : 2026-10-06
Périmètre : `package.json`, `package-lock.json`, `capacitor.config.json`, `vite.config.js`, `ios/`, `android/`, `.github/`,
`public/` (hors `fonts`), `Dockerfile`, `.dockerignore`, `server/`, `tests/network.test.js`, `playwright.config.js`,
`tests/browser/`, `store/`, `tools/`, `LICENSE`, `NOTICE.md`, `.gitignore` (sorties natives/secrets).

## 1. Identité

| | Valeur |
|---|---|
| npm | `lumen-kart` **1.0.0** (`private`, MIT, Node ≥ 22.12) |
| Capacitor | `appId` **`com.omartrabelsi.lumenkart`**, `appName` **« Lumen Kart »**, `webDir: dist` |
| Couleur de fond | **`#1f4f4c`** (sarcelle profonde, `CSS.deep` de `src/theme.js`) : WebView, splash, icône adaptative, PWA |
| iOS | `CFBundleDisplayName` « Lumen Kart » (localisé fr/en), `MARKETING_VERSION` 1.0.0, build 1, iOS 15+, iPhone + iPad |
| Android | `applicationId` identique, `versionName` = version de `package.json`, `versionCode` 1 (CI : numéro de run), minSdk 24, **targetSdk/compileSdk 36** |

`capacitor.config.json` (sûr pour la production, sur le modèle de LUMEN) : `contentInset: never`, `scrollEnabled: false`,
`allowsLinkPreview: false`, `zoomEnabled: false`, `allowMixedContent: false`, `minWebViewVersion: 90`, journalisation
seulement en debug (`loggingBehavior: debug`), schémas `capacitor://localhost` (iOS) et `https://localhost` (Android).
Plugins : `SystemBars` (`hidden: true`, `insetsHandling: css`), `StatusBar` (overlay), `SplashScreen`
(auto-masquage après 1,5 s, fondu 300 ms, sans spinner, plein écran immersif).

## 2. Commandes

```sh
npm ci
npm run dev                # Vite, LAN
npm test                   # node --test tests/*.test.js (75 tests verts au dernier passage)
npm run build              # dist/ (base './', chunks three / three-addons / capacitor)
npm run verify             # = test + build
npm run test:browser       # Playwright (preview :4173 + relais :8787)
npm run assets             # régénère icônes, splash, PWA, visuels boutique depuis store/brand/icon.svg
npm run native:sync        # build + cap sync (les deux plateformes)
npm run ios                # sync + ouvre Xcode
npm run android            # sync + ouvre Android Studio
npm run ios:simulator      # build simulateur non signé (xcodebuild, CODE_SIGNING_ALLOWED=NO)
npm run android:apk        # APK debug (android/app/build/outputs/apk/debug/)
npm run android:bundle     # AAB release signé si keystore configuré (bundle/release/app-release.aab)
npm run store:check        # limites des fiches + cohérence identité/version/permissions (--release : aucun placeholder)
npm run store:screenshots  # captures boutique (après npm run build)
npm run server             # relais WebSocket optionnel
```
Alias conservés : `native:ios`, `native:android` (cités dans le README d'origine).

## 3. Build web (`vite.config.js`)
- `base: './'` : le même `dist/` fonctionne depuis `capacitor://localhost`, `https://localhost`, un sous-chemin ou le relais.
- **Découpage Rolldown (Vite 8, `output.codeSplitting.groups`)** : `three` (cœur), `three-addons` (examples/jsm), `capacitor`.
  Le cœur de three r170 est **un seul module ES** (`build/three.module.js`) : après tree-shaking il pèse ~525 kB min /
  133 kB gzip et ne peut pas être scindé davantage (Rolldown découpe au module). `chunkSizeWarningLimit` est donc fixé à
  600 kB, juste au-dessus de ce chunk vendor embarqué dans l'app (jamais téléchargé en natif) ; tout chunk applicatif qui
  dépasserait 600 kB avertit toujours. Build actuel : **aucun avertissement**.
- Cible `['es2022', 'safari15', 'chrome90']` (WKWebView iOS 15+, WebView Android ≥ 90). `es2022` est nécessaire :
  `src/items.js` utilise un `await` de premier niveau.
- `define` : `__APP_VERSION__` et `import.meta.env.VITE_APP_VERSION` = version de `package.json`.

## 4. Projets natifs
Générés à neuf avec `npx cap add ios` / `npx cap add android` (Capacitor 8.5.2, iOS en Swift Package Manager, sans CocoaPods).

### iOS (`ios/App`)
- `Info.plist` : **paysage uniquement** (`LandscapeRight`, `LandscapeLeft`, iPhone **et** iPad), `UIRequiresFullScreen`,
  `UIStatusBarHidden`, `UIUserInterfaceStyle Light`, `CADisableMinimumFrameDurationOnPhone` (ProMotion 120 Hz),
  `LSApplicationCategoryType public.app-category.racing-games`, `LSSupportsGameMode`/`GCSupportsGameMode`,
  `ITSAppUsesNonExemptEncryption = NO`, `UIRequiredDeviceCapabilities arm64`, `CFBundleLocalizations en, fr`.
- `NSMotionUsageDescription` en anglais + **`fr.lproj/InfoPlist.strings` / `en.lproj/InfoPlist.strings`** (texte FR/EN).
  Pas de `NSLocalNetworkUsageDescription` : le mode en ligne est masqué dans les builds boutique (à ajouter seulement si un
  build LAN est distribué).
- **`LumenKartViewController.swift`** (ajouté au projet Xcode) :
  - plugin local **`TiltMotion`** (CoreMotion, gravité à 60 Hz, événements `gravity {x,y,z}` en g, arrêt en arrière-plan,
    reprise au retour) — exactement l'API attendue par `src/native-motion.js` (`start`, `stop`, `addListener('gravity')`),
    repris de Turbo Kart Rally ;
  - sous-classe de `CAPBridgeViewController` : barre d'état masquée, `preferredScreenEdgesDeferringSystemGestures = .bottom`
    (le premier glissement du bas va aux pouces), **écran maintenu allumé** (`isIdleTimerDisabled`), pas de sélection de
    texte / loupe / zoom / rebond, fond `#1f4f4c`. L'indicateur d'accueil est masqué par `SystemBars.hidden`.
  - Correctif par rapport à Turbo Kart Rally : là-bas `SceneDelegate` instanciait `CAPBridgeViewController()` et le plugin
    TiltMotion n'était enregistré que par la classe du storyboard ; ici `SceneDelegate` **et** `Main.storyboard` utilisent
    `LumenKartViewController`, donc le plugin est toujours enregistré.
- `PrivacyInfo.xcprivacy` : pas de traçage, aucune donnée collectée, API à raison requise `UserDefaults` → `CA92.1`
  (utilisée par `@capacitor/preferences`).
- `LaunchScreen.storyboard` : fond sarcelle + image `Splash` (aspect-fill, art centré).
- `ios/ExportOptions.plist` : export App Store Connect (remplacer `__APPLE_TEAM_ID__`).

### Android (`android/`)
- `AndroidManifest.xml` : activité **`sensorLandscape`**, `appCategory="game"` (Android 16+/targetSdk 36 continue
  d'honorer l'orientation sur tablettes/pliables pour les jeux), `usesCleartextTraffic=false`, `hardwareAccelerated`,
  `uses-feature` accéléromètre/gyroscope/écran tactile/manette **non requis**.
- **Permissions** : `INTERNET` uniquement (+ `VIBRATE` fusionnée depuis `@capacitor/haptics`) — deux permissions
  « normales », sans boîte de dialogue. INTERNET est conservée : la WebView Capacitor sert le jeu via
  `https://localhost` (interception), et le mode en ligne optionnel (`VITE_WS_URL`) en a besoin ; la retirer sans test sur
  appareil réel risquerait un écran blanc. Le jeu solo ne fait aucune requête réseau.
- `MainActivity.java` : enregistre **`TiltMotionPlugin`** (capteur de gravité, repli accéléromètre filtré, même convention
  de signe que CoreMotion), plein écran **immersif** (barres système masquées, réapparition transitoire par glissement,
  re-masquées au retour du focus), dessin sous l'encoche (`shortEdges`), **`FLAG_KEEP_SCREEN_ON`**, mode performance
  soutenue, exclusion des gestes système sur la bande basse de 200 dp (pouces).
- Thème : fond `#1F4F4C` partout (pas d'éclair blanc), splash Android 12+ = `windowSplashScreenBackground` +
  `windowSplashScreenAnimatedIcon = @mipmap/ic_launcher_foreground`, images `drawable*/splash.png` pour Android < 12.
- `app/build.gradle` : `versionName` lu dans `package.json`, `versionCode` via `-PlumenKart.versionCode=N`, signature
  release lue dans l'environnement (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`) ou dans `android/keystore.properties` (ignoré par git), jamais via `-P`. Signatures v1+v2+v3.
  `minifyEnabled false` (Capacitor charge ses plugins par réflexion). Pas de Google Services/Firebase.

## 5. Plugins Capacitor (versions exactes, compatibles `@capacitor/core` 8.5.2)
`@capacitor/app` 8.1.2 · `@capacitor/haptics` 8.0.2 · `@capacitor/preferences` 8.0.1 · `@capacitor/status-bar` 8.0.4 ·
`@capacitor/splash-screen` 8.0.2. Tous détectés par `cap sync` (Package.swift iOS et Gradle Android).

**Aucun import JS n'est nécessaire pour qu'ils fonctionnent en natif** : les ponts iOS et Android injectent
`window.Capacitor.Plugins.App / Haptics / Preferences / StatusBar / SplashScreen` (vérifié dans `JSExport` des deux
plateformes). Appel défensif possible :
```js
const P = window.Capacitor?.Plugins;
P?.Haptics?.impact({ style: 'MEDIUM' }).catch(() => {});
```
Recommandé toutefois (petits modules, typés, avec repli web) — à importer dans le code UI (`src/main.js`, `src/save.js`…) :
```js
import { App } from '@capacitor/app';                       // backButton, pause/resume, exitApp
import { Haptics, ImpactStyle } from '@capacitor/haptics';  // web : navigator.vibrate
import { Preferences } from '@capacitor/preferences';       // web : localStorage → même API partout
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
```
Points d'attention pour l'agent UI :
- `App.addListener('backButton', …)` **désactive** le retour par défaut d'Android : gérer pause/menus et appeler
  `App.exitApp()` depuis l'écran titre. `App.addListener('pause' | 'resume', …)` (ou `visibilitychange`) pour la pause auto.
- Le splash se masque seul à 1,5 s ; appeler `SplashScreen.hide()` après le premier rendu est possible (plus tôt).
- Barre d'état / navigation déjà masquées en natif (config + code natif) ; `StatusBar.hide()` est inutile mais sans risque.
- Zones sûres : `env(safe-area-inset-*)` (iOS et Android WebView ≥ 140) **et** variables CSS `--safe-area-inset-*`
  injectées par Capacitor sur Android (`SystemBars.insetsHandling: css`). Ex. :
  `padding-left: max(env(safe-area-inset-left), var(--safe-area-inset-left, 0px));` — la meta viewport doit garder `viewport-fit=cover`.
- Version : `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'` (non défini sous `node --test`).
- Tilt : `src/native-motion.js` fonctionne tel quel avec les plugins natifs `TiltMotion` fournis.

## 6. Icônes, splash, PWA
- **`store/brand/icon.svg`** : icône originale (sans texte) — Lumen (tête de renard sarcelle, oreilles-feuilles,
  masque crème, étoile dorée, écharpe corail flottant au vent) devant une **roue de kart** (pneu à chevrons, jante dorée,
  rayons crème) sur un ciel sarcelle avec lueur d'aube et traînées de vitesse. Deux calques (`#background`, `#foreground`).
- **`tools/generate-assets.mjs`** (sharp 0.34.5) génère 43 fichiers : AppIcon iOS 1024 opaque (Xcode dérive toutes les
  tailles), splash iOS 2732², mipmaps Android (legacy carrée/ronde + calques adaptatifs avant/arrière, art réduit à 74 dp
  pour rester dans le cercle sûr), splashs `drawable(-land|-port)-*`, `public/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.svg`, `favicon-32.png`, et `store/brand/splash.svg`,
  `app-store-icon-1024.png`, `play-icon-512.png`, `play-feature-graphic.png` (1024×500).
- **`public/manifest.webmanifest`** : plein écran (repli standalone), `orientation: landscape`, `theme_color`/`background_color`
  `#1f4f4c`, icônes any + maskable.

### Balises pour `index.html` (propriété de l'agent UI) — à placer dans `<head>`
```html
<title>Lumen Kart</title>
<meta name="description" content="Kart arcade en 3D avec Lumen, le petit renard à l'écharpe. Hors ligne, sans publicité." />
<meta name="theme-color" content="#1f4f4c" />
<meta name="color-scheme" content="light" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Lumen Kart" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
```
(et supprimer l'ancien favicon emoji 🏁). Vérifié : avec `base: './'`, Vite 8 réécrit `/favicon.svg` en `./favicon.svg`
dans `dist/index.html`. Garder `viewport-fit=cover` dans la meta viewport existante.

## 7. Serveur / en ligne
- `server/index.js` : ids de circuits Lumen Kart (`meadow, palm-cove, jungle, sunset-canyon, medina, city, frosty-peaks,
  lava-keep`, exportés `TRACKS`) et pilotes (`CHARS`) ; anciens `alpine-rush`/`neon-harbor` retirés ; types MIME
  `.webmanifest`, `.json`, `.webp`, `.txt` ajoutés.
- `playwright.config.js` : locale `en-US` fixée ; la suite construit son propre bundle **avec** `VITE_WS_URL=ws://127.0.0.1:8787/ws` dans `.e2e-dist/` (ignoré) pour tester le mode en ligne masqué en boutique, sans polluer `dist/`. Assertion de charge de drift rendue indépendante du réglage gameplay.
- `tests/network.test.js` : 2 tests ajoutés (tous les ids circuits/pilotes acceptés, inconnus refusés ; manifest + icônes
  servis avec le bon type). **8/8 verts.**
- `Dockerfile` : copie désormais `public/` (polices, icônes, manifest — manquait), `ARG VITE_WS_URL`, `npm ci --ignore-scripts`,
  `HEALTHCHECK`. **Vérifié** : `docker build` OK, conteneur → `/health` 200, `/` 200, manifest 200 `application/manifest+json`.

## 8. CI (`.github/workflows/`)
- **`verify.yml`** (push `main`, PR, manuel) : `npm ci`, `npm test`, `npm run store:check`, `npm run build`, artefact `dist/`.
  Job optionnel **Playwright** (déclenchement manuel, case « browser »).
- **`android.yml`** (push `main`, tags `v*`, PR touchant le natif, manuel) : JDK 21, SDK 36, tests, build, `cap sync android`,
  **APK debug** (artefact) ; si les secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`
  (+ `ANDROID_KEY_PASSWORD`) existent : décodage du keystore dans `$RUNNER_TEMP` (umask 077, contrôle de taille),
  **`bundleRelease` signé**, vérification `jarsigner`, suppression du keystore, artefact AAB. `versionCode` = numéro de run.
  Les secrets ne sont exposés qu'aux étapes qui en ont besoin ; seul un booléen `HAS_KEYSTORE` est global.
- **`ios.yml`** (push `main`, tags, manuel ; macOS) : tests, build, `cap sync ios`, **build simulateur non signé**.
  (TestFlight automatisé non inclus : nécessite une clé API App Store Connect ; procédure manuelle dans la check-list.)

## 9. Boutiques (`store/`)
- `metadata/fr-FR/` et `metadata/en-US/` : `name` (10 car.), `subtitle` (≤ 30), `short_description` (≤ 80),
  `description`/`full_description`, `keywords` (≤ 100), `promotional_text` (≤ 170), `release_notes`, `privacy_url`, `support_url`.
- `privacy-policy.md` (FR + EN) : aucune donnée collectée, hors ligne, sans pub/traçage/compte, sauvegarde locale uniquement.
  **Placeholder `CONTACT_EMAIL` à remplacer** (je n'ai pas publié d'adresse personnelle) ; `npm run store:check -- --release` bloque tant qu'il reste.
- `app-store-privacy.md` (« Data Not Collected »), `google-play-data-safety.md` (« No data collected / shared »),
  `content-rating.md` (PEGI 3 / 4+ / ESRB E), **`RELEASE_CHECKLIST.md`** (signature, TestFlight, test interne Play +
  règle des 12 testeurs / 14 jours, tailles de captures 6.9"/6.7"/6.5"/iPad 13"/Play téléphone + tablettes, notes de revue FR/EN).
- `tools/capture-store-screenshots.mjs` : sert `dist/` via le relais, Chromium (Chrome local si présent) en contexte tactile,
  pilote `window.__game.startRace / skipIntro / fastForward / debug.autopilot`, écrit
  `store/screenshots/<langue>/<appareil>/NN-scene.png` aux tailles exactes (vérifié : 2796×1290 pour `ios-6.7`).
  Les circuits pas encore livrés (`meadow`, `medina`, …) sont simplement sautés. `store/screenshots/` est ignoré par git :
  **à régénérer sur la build finale**.
- `tools/validate-store.mjs` : limites de caractères, absence de marques tierces, identité/version iOS = `package.json`,
  paysage, permissions Android autorisées, targetSdk ≥ 35.

## 10. Licences
- `LICENSE` : MIT conservée avec la mention **© 2026 BridgeMind (moteur Turbo Kart Rally)** + **© 2026 Omar Trabelsi
  (Lumen Kart)**, et une note de portée renvoyant à `NOTICE.md`.
- `NOTICE.md` : three.js (MIT), Capacitor + plugins (MIT), capacitor-swift-pm (MIT), AndroidX (Apache-2.0),
  Fredoka & Outfit (SIL OFL 1.1, licences dans `public/fonts`), ws (MIT, serveur), outils de build. Précise que les noms
  Lumen Kart/LUMEN, le personnage et l'art de marque ne sont pas concédés comme marques. **Décision à confirmer par
  Omar** : statut exact (MIT ou « tous droits réservés ») de l'art de marque `store/brand/`.

## 11. `.gitignore`
Ajouts : `ios/App/Pods`, `ios/App/build`, `ios/DerivedData`, `DerivedData`, `xcuserdata`, `*.xcarchive`, `*.ipa`,
`android/app/build`, `android/.gradle`, `android/local.properties`, `*.apk`, `*.aab`, `*.keystore`, `*.jks`, `*.p12`, `*.p8`,
`*.mobileprovision`, `keystore.properties`, `play-service-account*.json`, `store/screenshots/`. Les projets `ios/` et `android/`
eux-mêmes sont versionnés ; les fichiers générés par `cap sync` (`public/`, `capacitor.config.json`, `config.xml`,
`capacitor.plugins.json`) restent ignorés par les `.gitignore` de Capacitor → **toujours lancer `npm run native:sync`
avant un build natif** (la CI le fait).

## 12. Ce qui a été vérifié / pas vérifié

| Vérification | Résultat |
|---|---|
| `npm test` | **75/75 verts** sur l'arbre courant (dont `network.test.js` 8/8) |
| `npm run build` | OK, **aucun avertissement** (three 530 kB isolé, three-addons 23 kB, capacitor 8 kB, app 177 kB) |
| `npx cap sync` | OK, 5 plugins détectés sur iOS et Android |
| `xcodebuild … -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build` (Xcode 27.0) | **BUILD SUCCEEDED** ; bundle contrôlé : paysage seul, 1.0.0 (1), `fr.lproj`/`en.lproj`, `PrivacyInfo.xcprivacy`, AppIcon compilée |
| Lancement simulateur iOS | **Non fait** : aucun runtime/appareil simulateur installé |
| `./gradlew assembleDebug` | **Non fait localement** : ni JDK ni SDK Android sur la machine → validé par le workflow `android.yml` au premier push (XML des ressources/manifest contrôlés avec `xmllint`) |
| `bundleRelease` signé | Non testé (pas de keystore) ; chemin CI prêt |
| Docker | `docker build` + `run` OK (`/health`, `/`, manifest) |
| Captures boutique | Script OK (5 captures `ios-6.7` FR à la bonne taille sur la build actuelle) |
| Suite Playwright `test:browser` | **6/6 verts, deux passages consécutifs** sur builds neufs (~1 min) — voir §14 |
| Appareils réels (tilt, haptique, encoche, perfs) | **À faire** avant soumission (check-list §0) |

## 13. Demandes aux autres zones / à l'intégrateur
- **UI (`index.html`)** : balises du §6 ; titre « Lumen Kart » ; garder `viewport-fit=cover`.
- **UI (`src/main.js`, `src/save.js`…)** : appels plugins du §5 (bouton retour Android, pause/reprise, Preferences pour la
  sauvegarde durable, Haptics désactivables) ; écran Crédits/Licences reprenant `NOTICE.md`.
- **Docs (README, `docs/NATIVE.md`)** : remplacer les mentions Turbo Kart Rally / `com.turbokartrally.game` / `native:ios`
  par les commandes du §2 et l'identité du §1 (je n'édite pas ces fichiers).
- **UX** : à 568×320 (iPhone SE 1re gén., paysage), `.mobile-toolbar` (bas 60 px) chevauche `.hud-br` (haut 58 px) de 2 px — test marqué `test.fail` en attendant le correctif dans `src/mobile.css`.
- **Intégrateur** : créer le dépôt GitHub, ajouter les secrets Android, ajuster `privacy_url`/`support_url` si l'URL du
  dépôt n'est pas `github.com/omarRamo/lumen-kart`, remplacer `CONTACT_EMAIL`, régénérer les captures sur la build finale.

## 14. Suite navigateur réalignée sur l'UI finale (`tests/browser/racing.spec.js`)

Sélecteurs : `data-testid` du contrat UX (`docs/agents/ux.md` §2) + classes conservées (`.mobile-*`, `[data-hold]`, `.hud-tl`,
`.hud-minimap`, `.hud-br`, `.results`, `[data-a=resume]`) ; les `back` sont ciblés dans leur écran (`[data-screen=settings]`).
`playwright.config.js` construit à chaque lancement un bundle neuf dans `.e2e-dist/` avec `VITE_WS_URL=ws://127.0.0.1:8787/ws`
(mode en ligne visible), démarre le relais, locale `en-US`.

| # | Test | Parcours |
|---|---|---|
| 1 | Paysage mobile 844×390 | `title-play` → `mode-vs` → `class-100cc` → `track-sunset-canyon` → `start-race` ; accélération auto ; direction tactile (CDP) + drift tenu ~2,5 s (le kart avance > 3 m) ; frein ; pause/reprise ; rendu WebGL ; cockpit sans chevauchement ; résultats |
| 2 | Portrait 320×568 | course lancée via `__game.startRace`, cockpit/HUD vérifiés à 320×568, puis 844×390, puis retour 320×568 : aucune zone ne se chevauche, cibles ≥ 44 px, pas de débordement |
| 2b | Paysage 568×320 | **`test.fail` volontaire** : chevauchement de 2 px barre d'outils / badge de position (bug UX signalé) ; deviendra rouge dès que corrigé, pour retirer l'annotation |
| 3 | Langue | `title-settings` → `[data-k=lang][data-v=fr]` : `<html lang="fr">`, « Réglages », « Jouer » ; persiste après rechargement ; retour en anglais |
| 4 | Grand Prix | `__game.startRace({ gameMode: 'gp', cupId: 'dawn', classId: '50cc' })`, 4 × (`fastForward` + `finishPlayer` + `results-next`) → `.results.podium-screen` + `.podium` → `results-done` → titre, `gp` remis à `null` |
| 5 | En ligne | `__game.openOnline()` sur deux pages, salon privé (`[data-create]`, code, `[data-join]`), prêts, départ, pilotage distant de l'invité, résultats des deux côtés, départ de l'hôte → invité renvoyé au titre |

Chaque test vérifie l'absence d'erreur de page et de `__game.errors()`. Captures dans `test-results/` (ignoré).
