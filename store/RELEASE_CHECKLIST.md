# Lumen Kart — check-list de publication (App Store + Google Play)

Identité : **Lumen Kart** · `com.omartrabelsi.lumenkart` · version **1.0.0** (build/versionCode 1, puis numéro de run CI).
Commandes de référence : `docs/agents/platform.md`.

## 0. Avant toute soumission
- [ ] `npm ci && npm run verify` vert (tests + build) ; `npm run test:browser` vert sur la build finale.
- [ ] `npm run store:check -- --release` vert (limites de caractères, identité, permissions, plus aucun `CONTACT_EMAIL`).
- [ ] Renseigner l'adresse de contact dans `store/privacy-policy.md` et publier la politique à une URL publique
      (`store/metadata/*/privacy_url.txt`, à ajuster si le dépôt n'est pas `github.com/omarRamo/lumen-kart`).
- [ ] Vérifier que les descriptions (`store/metadata/*/description.txt`) correspondent au jeu livré (circuits, pilotes, modes).
- [ ] Build **sans** `VITE_WS_URL` : le mode en ligne reste masqué (déclarations « aucune donnée », « pas d'interaction en ligne »).
- [ ] `npm run assets` si l'icône a changé ; contrôler l'icône sur fond clair/sombre et en masque rond Android.
- [ ] Monter la version : `package.json` `version` (→ versionName Android, `__APP_VERSION__`) **et** `MARKETING_VERSION`
      dans Xcode (le validateur vérifie qu'ils sont égaux). Build iOS / versionCode Android strictement croissants.
- [ ] Écran « Crédits / Licences » en jeu reprenant `NOTICE.md` (OFL des polices, MIT three.js / Capacitor, Apache-2.0 AndroidX).
- [ ] Test sur appareils réels : iPhone (notch + Dynamic Island), iPad, Android milieu de gamme, tablette Android :
      paysage verrouillé, zones sûres, son au premier appui, pause en arrière-plan, bouton retour Android,
      inclinaison (autorisation + recalibrage), vibrations on/off, sauvegarde conservée après fermeture forcée, 60 i/s visés.

## 1. Signature
### Android (clé d'upload + Play App Signing)
1. Créer la clé d'upload **une seule fois** et la sauvegarder hors du dépôt (gestionnaire de mots de passe + copie hors ligne) :
   ```sh
   keytool -genkeypair -v -keystore lumenkart-upload.keystore -alias lumenkart -keyalg RSA -keysize 4096 -validity 10000
   ```
2. Local : créer `android/keystore.properties` (ignoré par git) :
   ```properties
   storeFile=/chemin/absolu/lumenkart-upload.keystore
   storePassword=…
   keyAlias=lumenkart
   keyPassword=…
   ```
   puis `npm run android:bundle` → `android/app/build/outputs/bundle/release/app-release.aab`.
3. CI : secrets GitHub `ANDROID_KEYSTORE_BASE64` (`base64 -i lumenkart-upload.keystore | pbcopy`), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Le workflow **Android** produit alors l'AAB signé (artefact `lumen-kart-release-aab-N`).
4. Play Console : activer **Play App Signing** (Google conserve la clé d'application ; la clé ci-dessus n'est que la clé d'upload).

### iOS
1. Compte Apple Developer (99 $/an). Dans *Certificates, Identifiers & Profiles* : App ID explicite `com.omartrabelsi.lumenkart`
   (aucune capability spéciale nécessaire).
2. App Store Connect → *Apps* → **+** : nom « Lumen Kart », langue principale Français (ou Anglais), bundle ID ci-dessus, SKU `lumenkart-ios`.
3. Xcode : `npm run ios` → cible *App* → *Signing & Capabilities* → Team, « Automatically manage signing ».
4. *Product → Archive* (destination « Any iOS Device ») → *Distribute App* → *App Store Connect* → *Upload*.
   En ligne de commande : `ios/ExportOptions.plist` (remplacer `__APPLE_TEAM_ID__`) avec `xcodebuild archive` puis `-exportArchive`.
5. `ITSAppUsesNonExemptEncryption=NO` est déjà dans Info.plist : pas de question d'export à chaque build.

## 2. Bêta
- [ ] **TestFlight** : build traité (≈ 15–30 min) → groupe interne (jusqu'à 100 testeurs, sans revue) ; groupe externe = revue bêta.
      Renseigner « What to Test » (`store/metadata/fr-FR/release_notes.txt`).
- [ ] **Google Play – Test interne** : Play Console → *Testing → Internal testing* → nouvelle release → AAB → liste de testeurs.
      Les comptes personnels créés après nov. 2023 doivent ensuite faire un **test fermé de 12 testeurs pendant 14 jours**
      avant l'accès à la production.
- [ ] Rapport de pré-lancement Play (Firebase Test Lab automatique) : aucun plantage, aucun problème d'accessibilité bloquant.

## 3. Fiches boutique
Textes : `store/metadata/fr-FR/` et `store/metadata/en-US/` (nom, sous-titre, descriptions, mots-clés, texte promo, notes de version).

| Champ | App Store | Google Play |
|---|---|---|
| Nom | `name.txt` (≤ 30) | `name.txt` (≤ 30) |
| Sous-titre / description courte | `subtitle.txt` (≤ 30) | `short_description.txt` (≤ 80) |
| Description | `description.txt` (≤ 4000) | `full_description.txt` (≤ 4000) |
| Mots-clés | `keywords.txt` (≤ 100) | — |
| Texte promotionnel | `promotional_text.txt` (≤ 170) | — |
| Nouveautés | `release_notes.txt` | `release_notes.txt` (≤ 500) |
| Catégorie | Jeux › Course (secondaire : Action / Famille) | Jeux › Course |
| Icône | intégrée au binaire (`AppIcon-1024.png`) | `store/brand/play-icon-512.png` (512×512) |
| Visuel | — | `store/brand/play-feature-graphic.png` (1024×500, requis) |
| Prix | Gratuit (ou payant, décision produit) | Gratuit |

### Captures d'écran (paysage) — `npm run build && npm run store:screenshots`
Sortie : `store/screenshots/<langue>/<appareil>/NN-scene.png`, 2 à 10 images par taille, FR et EN.

| Appareil | Pixels (paysage) | Obligatoire |
|---|---|---|
| iPhone 6.9" (`ios-6.9`) | 2868 × 1320 | **oui** (taille iPhone principale actuelle) |
| iPhone 6.7" (`ios-6.7`) | 2796 × 1290 | accepté à la place du 6.9" |
| iPhone 6.5" (`ios-6.5`) | 2688 × 1242 | conseillé (anciens appareils) |
| iPad 13" (`ipad-13`) | 2752 × 2064 | **oui** (l'app est universelle iPhone + iPad) |
| Play téléphone (`play-phone`) | 1920 × 1080 | **oui** (min. 2) |
| Play tablette 7" (`play-tablet-7`) | 1920 × 1200 | conseillé |
| Play tablette 10" (`play-tablet-10`) | 2560 × 1600 | conseillé (mise en avant tablettes) |

Relire chaque capture : pas de HUD de debug, pas de texte tronqué, pas d'écran noir WebGL (régénérer si besoin, Chrome local recommandé).

## 4. Questionnaires
- [ ] App Store *App Privacy* → **Data Not Collected** : `store/app-store-privacy.md`.
- [ ] Play *Data safety* → **No data collected / shared** : `store/google-play-data-safety.md`.
- [ ] Classification : `store/content-rating.md` (IARC → PEGI 3 ; Apple → 4+). Ne pas cocher « Made for Kids » / Kids Category.
- [ ] Play : *Ads* = non, *App access* = tout accessible, *Target audience* = 13+ (voir fiche), *Advertising ID* = non utilisé.
- [ ] Play : pays de distribution ; Apple : disponibilité (attention aux obligations DSA « trader status » dans l'UE :
      déclarer le statut de commerçant ou non dans App Store Connect et Play Console).

## 5. Notes pour la revue (à coller)
**FR** — Lumen Kart est un jeu de kart arcade 3D entièrement hors ligne, sans compte, sans publicité, sans achat intégré et sans
collecte de données. Toutes les fonctions sont accessibles immédiatement : touchez l'écran titre, choisissez un mode puis un circuit.
L'accélération est automatique ; dirigez avec les flèches tactiles (ou l'inclinaison, facultative — c'est le seul usage des capteurs
de mouvement). Le jeu se joue en paysage. La Coupe du Crépuscule se débloque en finissant sur le podium de la Coupe de l'Aube.

**EN** — Lumen Kart is a fully offline 3D arcade kart racer: no account, no ads, no in-app purchases, no data collection.
Everything is available immediately: tap the title screen, pick a mode and a circuit. Acceleration is automatic; steer with the
on-screen arrows (or optional tilt — the only use of the motion sensors). The game runs in landscape. The Dusk Cup unlocks after
a podium finish in the Dawn Cup.

## 6. Après publication
- [ ] Taguer `vX.Y.Z` (déclenche les workflows Android/iOS sur le tag) et archiver l'AAB / l'archive Xcode.
- [ ] Surveiller les plantages : Play Console *Android vitals*, Xcode *Organizer → Crashes* (aucun SDK tiers n'est intégré).
- [ ] Répondre aux avis ; préparer la version suivante en incrémentant la version.
