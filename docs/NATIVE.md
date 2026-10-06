# iOS et Android (Capacitor 8)

Le même bundle Vite tourne dans le navigateur et dans les coques natives Capacitor 8. Three.js 0.170.0, les polices et
toutes les ressources du jeu sont **embarqués dans l'app** : aucune connexion n'est nécessaire pour jouer en solo.
Rapport détaillé de l'agent Plateforme : [`agents/platform.md`](agents/platform.md). Publication :
[`../store/RELEASE_CHECKLIST.md`](../store/RELEASE_CHECKLIST.md).

## Identité

| | Valeur |
|---|---|
| Nom | **Lumen Kart** (localisé fr/en sur iOS) |
| Identifiant (`appId` / `applicationId` / bundle ID) | **`com.omartrabelsi.lumenkart`** |
| Version | `package.json` `version` (1.0.0) → `versionName` Android et `__APP_VERSION__` ; `MARKETING_VERSION` Xcode à garder égal (vérifié par `npm run store:check`) |
| Build | iOS build 1 ; Android `versionCode` 1 en local, numéro de run en CI |
| Couleur de fond | `#1f4f4c` (WebView, splash, icône adaptative, PWA) |
| Cibles | iOS 15+ (iPhone et iPad) · Android minSdk 24, targetSdk/compileSdk 36 |

## Construire et lancer

Prérequis : Node.js ≥ 22.12 ; Xcode 26 ou plus récent (vérifié avec Xcode 27) ; Android Studio avec JDK 21 et SDK 36.

```sh
npm ci
npm run native:sync     # build de production + cap sync (iOS et Android) — à relancer après tout changement JS/CSS/config
npm run ios             # sync puis ouvre Xcode (alias : npm run native:ios)
npm run android         # sync puis ouvre Android Studio (alias : npm run native:android)
npm run ios:simulator   # build simulateur non signé (xcodebuild, CODE_SIGNING_ALLOWED=NO, ios/DerivedData)
npm run android:apk     # APK debug → android/app/build/outputs/apk/debug/
npm run android:bundle  # AAB release signé → android/app/build/outputs/bundle/release/app-release.aab
```

Les fichiers générés par `cap sync` (`public/`, `capacitor.config.json`, `capacitor.plugins.json` dans les projets
natifs) sont ignorés par git : **toujours lancer `npm run native:sync` avant un build natif** (la CI le fait).

## iOS (`ios/App`)

- Projet Xcode en **Swift Package Manager** (pas de CocoaPods), cible *App*.
- `Info.plist` : **paysage uniquement** (iPhone et iPad), plein écran, barre d'état masquée, style clair,
  `CADisableMinimumFrameDurationOnPhone` (ProMotion 120 Hz), catégorie *racing-games*, Game Mode,
  `ITSAppUsesNonExemptEncryption = NO`, localisations `en` et `fr`.
- `NSMotionUsageDescription` traduite (`fr.lproj` / `en.lproj/InfoPlist.strings`) : seul usage des capteurs =
  direction par inclinaison. Pas de `NSLocalNetworkUsageDescription` (mode en ligne masqué).
- **`LumenKartViewController.swift`** (utilisé par `SceneDelegate` et `Main.storyboard`) :
  - plugin local **`TiltMotion`** (CoreMotion, gravité à 60 Hz, événements `gravity {x,y,z}`, arrêt en arrière-plan),
    consommé par `src/native-motion.js` ;
  - gestes système différés en bas d'écran, écran maintenu allumé, pas de sélection/loupe/zoom/rebond.
- `PrivacyInfo.xcprivacy` : pas de traçage, aucune donnée collectée, raison `CA92.1` pour `UserDefaults`
  (utilisé par `@capacitor/preferences`).
- Signature : choisir l'équipe dans *Signing & Capabilities* ; archive via *Product › Archive*, ou
  `ios/ExportOptions.plist` (remplacer `__APPLE_TEAM_ID__`) avec `xcodebuild archive` / `-exportArchive`.

## Android (`android/`)

- Activité **`sensorLandscape`**, `appCategory="game"`, trafic en clair interdit, accéléromètre/gyroscope/manette
  **non requis** (appareils tactiles seuls acceptés).
- **Permissions** : `INTERNET` (la WebView sert le jeu via `https://localhost` ; utile aussi au mode en ligne optionnel)
  et `VIBRATE` (fusionnée par `@capacitor/haptics`). Aucune boîte de dialogue.
- `MainActivity.java` : enregistre **`TiltMotionPlugin`** (capteur de gravité, repli accéléromètre filtré, même
  convention que CoreMotion), plein écran immersif, dessin sous l'encoche, écran allumé, mode performance soutenue,
  exclusion des gestes système sur les 200 dp du bas.
- Splash Android 12+ (`windowSplashScreen*`) et images `drawable*/splash.png` pour les versions antérieures.
- `app/build.gradle` : `versionName` lu dans `package.json`, `versionCode` via `-PlumenKart.versionCode=N`, signature lue
  dans l'environnement (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`) ou dans `android/keystore.properties` (ignoré par git). Signatures v1+v2+v3,
  `minifyEnabled false` (Capacitor charge ses plugins par réflexion). Pas de Google Services/Firebase.

## Plugins Capacitor

| Plugin | Version | Usage dans le jeu |
|---|---|---|
| `@capacitor/app` | 8.1.2 | bouton retour Android, pause/reprise automatiques, quitter depuis le titre |
| `@capacitor/haptics` | 8.0.2 | vibrations (événement `haptic`), désactivables |
| `@capacitor/preferences` | 8.0.1 | copie native de la sauvegarde (iOS peut vider le stockage de la WebView) |
| `@capacitor/splash-screen` | 8.0.2 | écran de lancement 1,5 s, fondu 300 ms |
| `@capacitor/status-bar` | 8.0.4 | barre d'état en surimpression (déjà masquée par `SystemBars`) |
| `TiltMotion` (local) | — | direction par inclinaison |

Tout accès passe par `src/native.js` / `src/native-motion.js`, de façon **défensive** (`window.Capacitor.Plugins`, repli
`registerPlugin`) : sur le web ou si un plugin manque, le jeu continue (repli `navigator.vibrate`, `localStorage`).
Zones sûres : `env(safe-area-inset-*)` et variables `--safe-area-inset-*` injectées par Capacitor sur Android
(`SystemBars.insetsHandling: css`).

## Icônes et splash

Source unique : `store/brand/icon.svg` (Lumen devant une roue de kart). `npm run assets` (sharp) génère l'AppIcon iOS
1024, le splash iOS 2732², les mipmaps Android (legacy + adaptatives), les splashs Android, les icônes PWA/favicon et les
visuels boutique (`app-store-icon-1024.png`, `play-icon-512.png`, `play-feature-graphic.png`).

## Intégration continue

| Workflow | Résultat |
|---|---|
| `android.yml` | tests, build, `cap sync android`, **APK debug** (`lumen-kart-debug-apk-N`) ; si les secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (+ `ANDROID_KEY_PASSWORD`) existent : **AAB signé** vérifié par `jarsigner` (`lumen-kart-release-aab-N`) |
| `ios.yml` | tests, build, `cap sync ios`, **build simulateur non signé** (TestFlight automatisé non inclus : clé API App Store Connect nécessaire) |

## Vérifié / à vérifier

| Vérification | État |
|---|---|
| `npm run build`, `npx cap sync` (5 plugins détectés sur les deux plateformes) | OK |
| Build simulateur iOS non signé (Xcode 27) : paysage seul, 1.0.0 (1), `fr.lproj`/`en.lproj`, PrivacyInfo, AppIcon | OK |
| Lancement en simulateur iOS | non fait (aucun runtime simulateur installé) |
| `./gradlew assembleDebug` | non fait localement (pas de JDK/SDK) ; validé par `android.yml` |
| AAB release signé | chemin CI prêt, non testé sans keystore |
| **Appareils réels** (inclinaison, haptique, encoche, 60 i/s, sauvegarde après fermeture forcée) | **à faire avant soumission** |

Références : [Capacitor — environnement](https://capacitorjs.com/docs/getting-started/environment-setup),
[workflow natif](https://capacitorjs.com/docs/basics/workflow), [Vite — build](https://vite.dev/guide/build).
