# Google Play Console — Data safety answers (« Sécurité des données »)

Play Console → *Policy and programs → App content → Data safety*.

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | Not applicable (no data collected) |
| Do you provide a way for users to request that their data is deleted? | Not applicable — no data leaves the device; uninstalling deletes the local save |
| Resulting label | **No data collected · No data shared** |

Notes:
- Google's definition: data processed only on the device and never sent off it is not "collected". Lumen Kart's save (Capacitor Preferences / WebView storage) and tilt sensor readings stay on the device.
- Android backup (`allowBackup=true`) is handled by Google's system backup under the user's own account; it is not collection by the developer.
- Permissions in the merged manifest: `INTERNET` (Capacitor WebView https://localhost scheme; the online mode is not enabled in store builds) and `VIBRATE` (haptics). Both are normal permissions, no runtime prompt. No location, camera, microphone, contacts, storage or advertising ID permission.
- No Google Play Services, Firebase, ads or analytics SDK.

Other App content declarations:
- **Privacy policy**: `https://github.com/omarRamo/lumen-kart/blob/main/store/privacy-policy.md`
- **Ads**: *No, my app does not contain ads*.
- **App access**: *All functionality is available without special access* (no login).
- **Target audience and content**: age groups **13–15, 16–17, 18+** recommended (selecting under-13 groups enrols the app in the Families policy; possible later, requires Families compliance review). The app is not designed primarily for children.
- **News app**: No. **COVID-19**: No. **Government app**: No. **Financial features**: None. **Health**: None.
- **Advertising ID**: the app does not use it (declare "No"; targetSdk 33+ requires this declaration).
