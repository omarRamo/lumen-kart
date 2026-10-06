# Rapport QA — playtest final de Lumen Kart

Agent : responsable QA / game designer senior · Date : 2026-10-06 · Build testée : `npm run build` (dist/, sans `VITE_WS_URL`)
servie par `vite preview` (port 5190), pilotée par Playwright (Chrome 1xx, ANGLE Metal, Apple M5 Pro).

Résultat : **14 commits de correctifs** (15 bugs ou réglages, B1–B15), **6 tests de régression ajoutés** (75 → 81 tests unitaires).
`npm test` 81/81, `npm run build` sans avertissement, `npm run test:browser` 6/6.

---

## 1. Matrice de test

| Domaine | Contextes | Ce qui a été joué / vérifié | Résultat |
|---|---|---|---|
| Parcours premier lancement | téléphone paysage 844×390 (isMobile, tactile, DPR 2), FR et EN | Titre → Jouer → Mode → Classe → Coupe/Circuit → Pilote → Intro → course, avec les vrais boutons (`tap`) | OK après correctifs B2, B9, B11 |
| Grand Prix complet | 50cc, 100cc, 150cc · Coupe de l'Aube et du Crépuscule | 4 courses × 3 tours (avance rapide), classement, podium, trophées, retour titre | OK (B5) |
| Déblocages | sauvegarde neuve | podium Aube → Crépuscule débloqué ; victoire des deux coupes → Miroir ; victoire Crépuscule → Nox ; écharpe « Or du matin » à 60 notes ; course en Miroir avec Nox | OK, cartes de célébration affichées |
| Contre-la-montre | 150cc, Canopée | 2 essais : « Nouveau record ! », temps au tour, record dans le HUD et dans la liste des circuits | OK (B6) |
| Course libre | 200cc, 1 tour, Lagons | objet donné, Luciole, chute/secours, mauvais sens, arrivée, résultats | OK après B10 |
| Réglages | titre et pause, FR/EN | langue (immédiate, `<html lang>`), musique/effets à 0 (gains WebAudio ≈ 0), qualité auto/haute/moyenne/basse (pixel ratio 1,25/1,5/1, ombres), aide (Auto/Toujours/Jamais → `player.assist`, y compris changée en pause), vibrations (spy `navigator.vibrate`), réduire les effets (`__lumenReduceMotion`, classe body, secousses ×0,25), afficher les i/s, crédits | OK après B4 |
| Pause / retour | tactile + clavier | bouton pause, Reprendre, Réglages, Crédits, Échap à chaque niveau, `visibilitychange` (pause + audio suspendu) | OK après B4 |
| Bureau | 1440×900, clavier seul | navigation au clavier de tous les menus, conduite flèches + Espace, Échap pause/reprise, classement latéral | OK |
| 8 circuits × 3 qualités | téléphone paysage | captures en course, caméra posée sur des points du tracé, mesures de rendu | OK après B1, B7, B12, B13 |
| Robustesse | — | conducteur « chaotique » 200 s × 8 circuits (coups de volant, drift, marche arrière), 17 courses enchaînées (fuites), shortcuts et ligne d'arrivée (exploits) | aucun blocage, aucune fuite, voir §4 |
| Boutique | — | requêtes réseau, hors ligne, sauvegarde corrompue, rechargement, zones sûres, portrait web, déverrouillage audio | OK après B9, voir §5 |

Aucune erreur console, aucune `pageerror`, `__game.errors()` vide sur toutes les sessions.

---

## 2. Bugs trouvés et corrigés

| # | Gravité | Bug | Correctif | Commit |
|---|---|---|---|---|
| B1 | **Bloquant visuel** | Le terrain passait **jusqu'à 6 m au-dessus de la route** près des ponts et sur les flancs de colline : route recouverte d'herbe (Canopée t≈0,16–0,25), **caméra entièrement dans le sol** sur le pont de l'étang des Prairies (1er circuit du jeu), aussi Aurores, Ville, Sidi Bou Saïd. Cause : le poids de couloir s'annule aux extrémités de pont et le fondu de 58 m laissait quelques % d'une haute colline ; la grille grossière (12,7 m en basse) interpolait au-dessus de la route. | `heightAt()` plafonne le sol sous la route avec un talus doux (0,35) à partir de mur + 4 m. **Test de régression** : échantillonnage des triangles du terrain sous toute la route, 8 circuits, grilles haute et basse. | `349e682` |
| B2 | Majeur | Écran Pilote : la caméra « gros plan » regardait ~6 m devant le kart choisi, qui se retrouvait **caché derrière la grille ou la carte de stats** (on voyait du décor vide ou un autre kart). | Avance de la caméra = retard exact du suivi exponentiel. | `df212df` |
| B3 | Majeur | Un rival juste derrière le joueur (départ, chocs) **traversait le plan proche de la caméra** et remplissait l'écran. | Les karts à moins de 3,4 m de l'objectif sont masqués. | `df212df` |
| B4 | Majeur | **Échap dans Réglages ouverts depuis la pause relançait la course** (le menu revenait à « pause », puis `main.js` traitait la même touche comme « reprendre » ; Crédits sautait deux niveaux). HUD de course sous l'en-tête des réglages. Compteur « i/s » non traduit en anglais. | Le menu arrête l'événement qu'il a traité (**test**) ; HUD masqué sous réglages/crédits ; `hud.fps` traduit. | `a684afc` |
| B5 | Mineur | Podium : le « 3 » de la 3e marche **coupé** sur téléphone. `color-mix()` (Safari 16.2 / Chrome 111) alors qu'iOS 15+ est supporté : sans support, badge de position, place d'arrivée et marches du podium **sans fond**. | Taille adaptée ; repli `@supports not (color: color-mix(...))`. | `298b993` |
| B6 | Mineur | Bannière de départ : nom du circuit **en miroir** vu de derrière (intro, CLM, rétroviseur). | Deux faces simples dos à dos. | `103009c` |
| B7 | Majeur (perf) | Moyenne (défaut téléphone) : notes à ~730 triangles × ~70 instances + ombres, pare-chocs (54 k tri) et fougères (82 k tri) dans la passe d'ombre. | Notes allégées et sans ombre hors « haute » ; pare-chocs et fougères projettent seulement en « haute ». −10 à −20 % de triangles par image. | `0000c35` |
| B8 | Majeur (équilibrage) | **50cc pas gagnable par un débutant** : pilote assisté sans rien toucher 7e/5e/7e/2e, débutant qui utilise ses objets 7e/2e/8e/2e (aucun trophée). | IA 50cc 0,90 → 0,86, leaders qui ralentissent jusqu'à 9 % (au lieu de 7). Après : 3e/7e/3e/3e et **1er/6e/2e/1er**. 100cc+ inchangés. | `c800879` |
| B9 | Mineur | Bouton **Jouer décentré** de la moitié de sa largeur (coupé en portrait web) : l'animation générique `rise` écrasait `translateX(-50%)`, l'effet d'appui et la respiration dorée. | Centrage par marges, fondu dédié ; lueur dorée plus chaude. | `98df2e4` |
| B10 | Mineur | Résultats « **1 laps** » / « 1 tours » ; l'astuce de drift **masquait la bannière « Mauvais sens ! »**. | Clé `res.lapRace1` ; astuce masquée pendant le mauvais sens. | `a721565` |
| B11 | Mineur (FR) | 42 chaînes françaises avec espace ordinaire avant `! ? : ;` → « ! » seul en début de ligne sur téléphone. | Espaces insécables (fine avant `! ? ;`, normale avant `:` et dans « »), dans `t()` et les descriptions (**test**). | `6910467` |
| B12 | Cosmétique | Carte de coupe verrouillée : le message du cadenas s'imprimait sur les noms de circuits estompés. | Noms et médailles masqués sous le cadenas. | `39746c4` |
| B13 | Cosmétique (DA) | Domaine de la Nuit : îlots flottants **noirs** (seule la lumière d'hémisphère du sol les éclairait) — contraire à « jamais sombre ». | Roche teintée lavande. | `910b500` |
| B14 | **Softlock** | La course ne se terminait **que si le joueur passait la ligne** : un jeune joueur coincé contre un mur (accélération automatique en tactile, pas d'aide au-delà du 50cc) restait bloqué indéfiniment une fois les 7 rivaux arrivés. | 20 s après l'arrivée du dernier rival (toast « {n} s pour finir ! »), la course se clôt, joueur classé au temps estimé ; le GP continue (**test**). | `45b75ea` |
| B15 | Majeur visuel | Le survol d'intro commençait **dans le toit des tribunes** (une dalle crème remplissait la moitié de l'écran, Canopée). | Orbite gardée au-dessus du couloir de la route (latéral ≤ 9 m), départ à 24 m. | `4a4f3a6` |
| — | Test | Exploits de tours : passage par **chaque raccourci** (corde droite à travers le champ) et va-et-vient sur la ligne. | Les tours comptent par les raccourcis ; le va-et-vient n'ajoute jamais de tour (**test**). | `40afdd3` |


---

## 3. Ce que j'ai joué et ressenti (game design)

- **Durée** : tours assistés en 100cc de 42 à 50 s (Prairies 42,9 s, Lagons 50,2 s, Canopée 41,8 s, Dunes 48,9 s) → courses de
  2 min 10 à 2 min 30. 50cc : 46 à 60 s par tour. 150cc : 35 à 45 s. Cible « 40–55 s à 100cc » tenue.
- **50cc** (après B8) : un enfant qui ne fait qu'utiliser ses objets gagne ou monte sur le podium ; sans rien toucher il finit
  autour de la 3e place. Les Lagons restent le circuit le plus dur pour un débutant (crabes sur la trajectoire assistée,
  jusqu'à 12 chocs par course).
- **150cc** : peloton serré (8 karts en 6–10 s), un pilote IA « difficile » au volant du joueur finit 3e à 8e → vrai combat.
- **Objets** : 3 à 8 touches subies par course en 50cc, réparties (Graine, Luciole, Résonance, Ronce) ; l'Étoile filante reste rare.
- **Tutoriel** : astuces drift (1,8 s après le départ), objets (au premier objet), notes ; textes clairs en FR et EN.
- **Podium** : confettis, trophée, fanfare, cartes « Trophée gagné », « Coupe débloquée », « Mode Miroir », « Nox rejoint la
  course » → gratifiant. La file de cartes est lente (voir §6).
- **Beauté** : les 8 mondes sont lisibles et distincts aux trois qualités (captures `perf-*`, `grid-*` dans le scratchpad).
  Points corrigés : B1, B6, B13, B15. Aucun objet de décor posé sur la route (vérifié par instance sur les 8 circuits).

---

## 4. Performances (rendu complet par image : passe d'ombre + scène + post-traitement)

Machine de mesure : Apple M5 Pro (le GPU n'est **pas** représentatif d'un téléphone : toutes les images tiennent 16,7 ms).
Les chiffres utiles sont les **appels de dessin**, les **triangles** et le **temps JS par image** (CPU ×4 via
`Emulation.setCPUThrottlingRate`), mesurés pendant 6 s de course en 150cc, pilote automatique, après le départ.

### Après correctifs — appels moyens (max) / triangles par image / JS par image sous CPU ×4 (p97)

| Circuit | Haute (DPR 1,5) | Moyenne (DPR 1,25, défaut téléphone) | Basse (DPR 1) |
|---|---|---|---|
| Prairies d'aurore | 141 (153) / 1 338 k | 144 (158) / 874 k / 2,6 ms (3,6) | 100 (110) / 317 k / 1,6 ms (2,6) |
| Lagons de corail | 140 (155) / 1 318 k | 149 (153) / 833 k / 2,4 ms (3,5) | 103 (112) / 329 k / 1,7 ms (2,8) |
| Canopée d'Amazonie | 159 (172) / 1 938 k | 159 (169) / 1 117 k / 2,8 ms (4,2) | 95 (114) / 427 k / 1,9 ms (3,0) |
| Dunes qui chantent | 144 (169) / 990 k | 151 (159) / 635 k / 2,1 ms (3,0) | 94 (103) / 295 k / 1,5 ms (2,3) |
| Sidi Bou Saïd | 141 (150) / 1 102 k | 150 (155) / 759 k / 2,6 ms (3,8) | 104 (114) / 447 k / 1,8 ms (2,7) |
| La Ville des toits | 152 (164) / 884 k | 145 (148) / 560 k / 2,2 ms (3,1) | 101 (111) / 233 k / 1,6 ms (2,7) |
| Nuit des aurores | 162 (174) / 782 k | 150 (161) / 478 k / 2,1 ms (3,3) | 86 (107) / 230 k / 1,7 ms (2,8) |
| Domaine de la Nuit | 154 (170) / 861 k | 150 (159) / 533 k / 2,3 ms (3,7) | 103 (112) / 221 k / 1,5 ms (2,3) |

Avant B7 (moyenne) : Canopée 1 333 k, Prairies 962 k, Lagons 953 k, Sidi Bou Saïd 892 k, Dunes 716 k, Ville 680 k,
Lava 632 k, Aurores 575 k triangles.

- **Pics** : seule la première image de l'intro dépasse (≈ 130 ms sous CPU ×4 : compilation des shaders), masquée par la
  carte d'intro. En course, < 1 image sur 500 au-dessus de 25 ms.
- **Mémoire** : 17 courses enchaînées sur les 8 circuits → géométries 137–151, textures 19–24, programmes ≤ 49, tas JS stable
  (44–67 Mo), 126 écouteurs du bus constants : **aucune fuite**.
- **Estimation téléphone milieu de gamme** : en « moyenne », ~150 appels et 0,5–1,1 M triangles. Le CPU (2–3 ms à ×4) n'est pas
  le goulot ; le risque est GPU sur la Canopée (1,1 M triangles, forêt dense). La qualité auto choisit « basse » sur ≤ 4 cœurs
  ou ≤ 3 Go et baisse la résolution si < 40 i/s pendant 4 s. **À valider sur appareil réel** (voir §6).

---

## 5. Prêt pour les boutiques — vérifications

| Point | Résultat |
|---|---|
| Aucune UI de debug visible en production | OK (compteur i/s seulement si activé ; `window.__game` existe mais n'affiche rien) |
| Version affichée | `v1.0.0` sur le titre et dans les réglages/crédits |
| Crédits / licences | écran complet FR/EN (moteur TKR MIT, three.js, Capacitor, AndroidX, polices OFL, confidentialité) |
| **Aucune requête réseau** sans `VITE_WS_URL` | journal Playwright : uniquement l'origine locale (JS, CSS, 2 polices, favicons). Mode en ligne absent des menus |
| Hors ligne | après chargement, réseau coupé : courses sur 3 circuits, retour titre, aucun appel |
| Sauvegarde | survit au rechargement ; JSON corrompu → copie `.corrupt` + sauvegarde neuve ; valeurs absurdes bornées ; aucune erreur |
| Bouton retour Android | chaîne testée (unitaire) + Échap identique ; corrigé B4 |
| Paysage | verrouillé côté natif (plateforme) ; en web portrait, le titre reste utilisable (B9) |
| Zones sûres | `--safe-area-inset-*` injectées (47 px) : HUD, volant, boutons et barre se décalent correctement |
| Audio | contexte `running` au premier appui ; suspendu en arrière-plan |
| Pause en arrière-plan | `visibilitychange` → état `paused`, reste en pause au retour |
| Métadonnées | `npm run store:check` OK |

---

## 6. Problèmes connus restants et recommandations avant soumission

### À faire sur appareils réels (impossible ici)
1. **Performance et chauffe** sur iPhone 11 / SE 2 et Pixel 6 / Android 4 cœurs, 10 min de GP : vérifier 60 i/s en « moyenne »
   sur la Canopée et les Lagons, et que la qualité auto + baisse de résolution se déclenchent bien.
2. Vibrations (Capacitor Haptics), **inclinaison** (TiltMotion iOS/Android), encoche/îlot dynamique réels (`env()`),
   bouton retour Android natif, déverrouillage audio dans WKWebView, reprise après appel entrant.
3. iOS 15–16.1 (pas de `color-mix`) : contrôler badges et podium avec le repli ajouté.

### Recommandations (non bloquantes)
- **Perf (prochain levier)** : les décors instanciés couvrent tout le circuit, donc toute la forêt est dessinée à chaque image
  dans les passes ombre et scène. Découper les `InstancedMesh` par tuiles (~250 m) laisserait le frustum culling agir
  (Canopée −30 à −40 % de triangles estimés) au prix de quelques appels.
- Anticrénelage coupé sur mobile (pixel ratio 1,25) : arêtes visibles sur les toits et rails ; envisager FXAA en « haute ».
- **Aide à la direction** : en tactile 100cc, un débutant sans aide percute les murs ; proposer l'aide « Auto » aussi pour
  100cc au premier lancement, ou un bouton « remettre sur la piste ». (B14 garantit déjà la fin de course.)
- File des cartes de déblocage lente (3–4 cartes enchaînées après le podium) : elles débordent sur l'écran titre et les
  menus suivants ; accélérer ou regrouper.
- Contre-la-montre : seul en piste, on ramasse toutes les notes (+46 par essai contre ~10 en GP) → les écharpes se
  débloquent vite en farmant le CLM ; plafonner les notes CLM si on veut garder la progression.
- `window.__game` reste exposé en production (utile aux tests et à `store:screenshots`) : le restreindre à `?debug` pour la
  version finale si l'on veut éviter la triche locale.
- Le badge de position annonce « 8e » pendant la première seconde (les karts devant passent la ligne avant le joueur) :
  cosmétique.
- Régénérer `store/screenshots` sur cette build (les captures existantes datent d'avant B1/B2/B9/B13/B15).

---

## 7. Outils de playtest utilisés (scratchpad, non versionnés)

Scripts Playwright : parcours complet (`journey`), GP par classe avec bots « inactif / objets / IA » (`gp`), réglages et pause
(`settings`, `pause`), CLM (`tt`), déblocages (`unlock`), mesures (`perf`, `tris`, `hitch`, `leak`), terrain sous la route
(`terrain`), décor sur la route (`props`), conducteur chaotique (`chaos`), boutique (`store`, `offline`), photos par point du
tracé (`photo`). Les tests de régression correspondants sont dans `tests/circuits.test.js`, `tests/gameplay.test.js`,
`tests/mobile.test.js` et `tests/i18n.test.js`.
