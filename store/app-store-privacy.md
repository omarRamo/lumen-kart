# App Store Connect — App Privacy answers (« Confidentialité de l'app »)

App Store Connect → *App Privacy* → **Get Started**.

| Question | Answer |
|---|---|
| Do you or your third-party partners collect data from this app? | **No, we do not collect data from this app** |
| Resulting label | **Data Not Collected** / « Aucune donnée collectée » |
| Privacy Policy URL | `https://github.com/omarRamo/lumen-kart/blob/main/store/privacy-policy.md` (update if the repo URL differs) |
| Tracking (ATT) | None — no `NSUserTrackingUsageDescription`, no IDFA |

Justification (for review notes if asked):
- No analytics / ads / crash-reporting SDK. Only Capacitor (MIT) and first-party Capacitor plugins (App, Haptics, Preferences, Status Bar, Splash Screen).
- Saves are written with `@capacitor/preferences` (UserDefaults) and WebView storage, on device only — "data that is processed only on device is not collected" (Apple definition).
- Motion data (CoreMotion gravity) is used in memory for steering and never leaves the device.
- `ios/App/App/PrivacyInfo.xcprivacy`: `NSPrivacyTracking = false`, no collected data types, Required-Reason API `UserDefaults` → `CA92.1` (app's own data).

Other App Store Connect declarations:
- **Export compliance**: `ITSAppUsesNonExemptEncryption = NO` is set in Info.plist (no encryption beyond the OS). No documentation needed.
- **Content rights**: the app contains no third-party content (procedural art/audio, OFL fonts).
- **Advertising identifier**: not used.
- **Kids Category**: do **not** opt in (game for all ages, not designed specifically for children; avoids Kids Category constraints).
