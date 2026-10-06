# Rapport UX/UI, audio et flux de jeu — Lumen Kart

Zone : `src/main.js`, `src/race.js` (inchangé fonctionnellement), `src/menu.js`, `src/hud.js`, `src/styles.css`, `src/mobile.css`,
`src/mobile-controls.js`, `src/audio.js`, `src/online-ui.js`, `src/online.css`, `index.html`, nouveaux `src/i18n.js`, `src/save.js`,
`src/settings.js`, `src/native.js`, `src/icons.js`, tests `tests/mobile.test.js`, `tests/save.test.js`, `tests/i18n.test.js`.

Captures : `docs/screenshots/ui-*.png` (mobile 844×390 tactile, portrait 320×568 et bureau 1440×900, en FR et en EN).

## 1. Identité visuelle

- **Palette LUMEN** en jetons CSS (`:root`) : encre sarcelle `#254d45`, sarcelle `#387d76`, menthe `#99d1b7`, papier crème `#f8f6e7` / `#fff7dc`,
  écharpe corail `#e98c73`, or `#edc371`, nuit indigo `#1c1640`, aurore `#b5f3d0`, aube `#ffc193`, comète `#dbb2f6`.
- **Polices** : Fredoka (titres, chiffres du HUD) et Outfit (texte) via `@font-face` (`/fonts/*.woff2`, réécrit en relatif par Vite), préchargées dans `index.html`.
- Panneaux « papier » opaques à grands rayons (24–30 px), ombres douces, pilules, boutons d’encre ; animations courtes à rebond doux (`--ease-pop`).
  Les panneaux sont opaques : un fond translucide se lisait mal par-dessus la scène WebGL.
- **Logo** : emblème type icône d’app (visage de Lumen, oreilles-feuilles, étoile dorée au front, écharpe corail) en SVG inline
  (`icons.js › logoEmblemSVG`) + mot-symbole « Lumen *Kart* » avec l’étoile scintillante de LUMEN.
- **Icônes d’objets** : `itemIcon(id)` utilise `createItemIcon` de l’agent Art (cohérent avec les modèles 3D) ; à défaut, `icons.js` dessine
  ses propres icônes LUMEN (note, ronce, graine, luciole, comète, fleur solaire, voile, aurore, plume, éclipse, étoile filante, cloche, prisme).
  Les glyphes d’interface (retour, réglages, pause, cadenas, trophée…) sont des SVG à trait.

## 2. Flux et écrans

```
Titre ─ Jouer → Mode (Grand Prix · Course libre · Contre-la-montre · [En ligne si VITE_WS_URL])
      → Classe (50cc Balade · 100cc Élan · 150cc Comète · 200cc Aurore · Miroir)
      → Coupe (GP) ou Circuit (+ nombre de tours en Course libre ; records en CLM)
      → Pilote (portraits, barres de stats, écharpe de Lumen, Nox verrouillé) → C’est parti !
      → Carte d’intro → 3-2-1-Partez ! → Course → Résultats / Classement GP → Podium → Titre
Titre ─ ⚙ → Réglages → Crédits et licences          Course ─ Ⅱ → Pause (Reprendre · Recommencer · Réglages · Quitter)
```

- **Titre** : la course de démonstration continue derrière ; la caméra suit désormais le kart de Lumen. Pastilles « ♪ notes » et « trophées »,
  bouton ⚙, gros bouton crème « Jouer / Play » (anneau or, respiration lente), mentions « hors ligne · sans compte · sans publicité · sans traçage », version.
- **Retour partout** : bouton « Retour », Échap/Retour arrière, bouton B de manette, **bouton retour Android** (`App.backButton`) :
  menus → écran précédent ; course → pause ; pause → reprise ; résultats → action secondaire ; titre → `App.exitApp()`.
- **Navigation clavier/manette** : modèle de focus spatial sur les éléments `[data-nav]` (flèches = élément le plus proche dans la direction),
  Entrée = activer ; anneau or visible seulement en navigation clavier (`body.kbd-nav`). La manette envoie toujours des touches synthétiques.
- **Verrous** : coupe, circuit, classe Miroir, Nox et écharpes verrouillés affichent un cadenas, un message d’aide (toast) et une petite secousse.
- Les dernières sélections (mode, classe, coupe, circuit, pilote, tours) sont mémorisées dans les réglages.

### Attributs pour les tests navigateur (`data-testid`)
`title-play`, `title-settings`, `back`, `mode-gp|vs|tt|online`, `class-50cc|100cc|150cc|200cc|mirror`, `cup-<id>`, `track-<id>`, `laps-1|2|3|5`,
`char-<characterId>`, `scarf-<id>`, `start-race`, `pause-resume|restart|settings|quit` (+ `data-a` conservé), `results-restart|menu|next|done`,
`settings-reset`, `settings-credits`, `touch-steering`, `touch-item`, `touch-drift`, `touch-brake`, `touch-pause`, `touch-tilt`.
Classes conservées : `.title-screen`, `.mode-card.m-<id>`, `.mobile-*`, `.hud-tl`, `.hud-minimap`, `.hud-br`, `.results`, `[data-hold=…]`.
**À réaligner dans `tests/browser/racing.spec.js` (plateforme)** : l’ancien `.race-btn` / `.course-card` / `.online-race-btn` n’existent plus.
Nouveau parcours : `title-play` → `mode-vs` → `class-100cc` → `track-sunset-canyon` → `start-race`. Le mode en ligne n’apparaît que si
`VITE_WS_URL` est défini au build ; `window.__game.openOnline()` reste disponible pour les tests.

## 3. Internationalisation (`src/i18n.js`)

- Dictionnaires `STRINGS.fr` / `STRINGS.en` (~250 clés), `t(clé, {variables})`, repli EN puis clé.
- Langue par défaut : `navigator.language` commence par `fr` → français, sinon anglais ; choix manuel dans les réglages (`lang: auto|fr|en`).
  Le changement est **immédiat** : menus re-rendus, HUD et commandes tactiles réétiquetés, `<html lang>` mis à jour.
- Aides pour les données : `trackName/trackBlurb` (lit `names/blurbs {fr,en}` des circuits, sinon table interne conforme à la bible),
  `cupName` (`names` ou table interne dawn/dusk), `className` (Balade/Stroll, Élan/Stride, Comète/Comet, Aurore/Aurora, Miroir/Mirror),
  `itemLabel` (= `itemName` de `theme.js`), `characterTitle`, ordinaux (1er/2e · 1st/2nd), `formatTime`, `esc` (échappement HTML).
- Test : chaque clé FR a sa clé EN (et inversement), mêmes variables `{…}`, aucune chaîne vide, noms de circuits/coupes/classes/objets/écharpes présents dans les deux langues.

## 4. Sauvegarde et progression (`src/save.js`)

Clé `lumenkart.save.v1` (localStorage, dupliquée dans Capacitor **Preferences** sur natif, restaurée au démarrage si iOS a vidé le stockage web).

```js
{
  version: 1,
  notes: 0,                 // notes ♪ collectées au total (monnaie cosmétique, jamais dépensée)
  races: 0, wins: 0, podiums: 0,
  medals:  { dawn: { '100cc': 1 } },                 // meilleure place GP (1 or, 2 argent, 3 bronze) par coupe et classe
  records: { 'meadow': { time, lap, char }, 'meadow:m': {…} },  // contre-la-montre (':m' = miroir)
  scarf: 'coral',           // écharpe choisie pour Lumen
  tutorial: { drift: false, items: false, notes: false },
  createdAt, updatedAt
}
```

- **Robuste** : JSON illisible → copie dans `lumenkart.save.v1.corrupt` puis sauvegarde neuve ; chaque champ est validé séparément
  (types, bornes, médailles 1–3, écharpe débloquée) ; stockage indisponible (navigation privée) → aucune exception.
- **Migration** : format v0 (`coins`, `trophies`, `tt`) → v1 ; anciens records `tkr-tt-*` importés au premier lancement.
- **Déblocages dérivés** (jamais stockés, donc jamais désynchronisés) :
  - Coupe du Crépuscule : podium (≤ 3) dans la Coupe de l’Aube, toutes classes ;
  - Miroir : victoire (1er) dans les deux coupes ;
  - Nox : victoire dans la Coupe du Crépuscule (Nox court tout de même comme rival IA) ;
  - circuits : ouverts si une coupe qui les contient est ouverte (Course libre et CLM) ;
  - écharpes selon les notes cumulées : corail 0, or du matin 60, menthe 150, ciel 300, bougainvillier 500, comète 750, aurore 1050, nuit étoilée 1400.
- Les notes = chaque `coin:pickup` du joueur pendant la course (même à 10/10). Fin de course → `recordRace` ; podium GP → `recordGrandPrix` ;
  CLM → `recordTimeTrial`. Les événements renvoyés (médaille, coupe, miroir, pilote, écharpe) s’affichent en **cartes de célébration** en file
  (`hud.celebrate`, son de carillon, événement `game:unlock`), sur les résultats ou au retour au titre.
- **Écharpe** : `characterFor()` construit Lumen avec `{ ...character, scarf: couleur }` (contrat de l’agent Art) pour la course, les portraits et la démo ;
  le kart de démo est recoloré en direct quand on change d’écharpe dans l’écran Pilote.

## 5. Réglages (`src/settings.js`, clé `lumenkart.settings.v1`)

| Réglage | Valeurs | Effet |
|---|---|---|
| Musique / Effets | 0–100 % | gains séparés `musicVol` / `sfxGain` |
| Langue | Français / English (défaut auto) | bascule immédiate |
| Direction | Flèches tactiles / Inclinaison | l’inclinaison est demandée depuis le geste « C’est parti ! » (permission iOS) ; le bouton GYRO en course met le réglage à jour |
| Aide à la direction | Auto (50cc) / Toujours / Jamais | `player.assist = { steering, strength: ASSIST.defaultStrength }` |
| Vibrations | oui / non | Capacitor Haptics, repli `navigator.vibrate` |
| Qualité graphique | Auto / Haute / Moyenne / Basse | `window.__lumenQuality` + `renderer.userData.quality` posés avant la création du monde ; pixel ratio, ombres (douces/PCF/aucune), bloom (bureau en Haute) appliqués tout de suite |
| Réduire les effets | oui / non | `__lumenReduceMotion` (pas de traînées), `__lumenShakeScale = 0.25`, animations décoratives coupées |
| Afficher les i/s | oui / non | compteur discret |
| Effacer la progression | double appui (armé 3,5 s) | remet la sauvegarde à zéro |
| Crédits et licences | écran | Lumen Kart, moteur TKR (MIT), three.js, Capacitor, AndroidX, Fredoka/Outfit (OFL), confidentialité |

Qualité *auto* : téléphone → Moyenne (Basse si ≤ 3 Go ou ≤ 4 cœurs), ordinateur → Haute. En course, si le jeu reste sous 40 i/s pendant 4 s,
la résolution baisse par paliers (jusqu’à 60 %).

## 6. HUD

- Haut gauche : pilules « Tour 2/3 » (corail au dernier tour), chrono, **♪ 7/10** (doré à 10), record en CLM ; temps au tour sur bureau.
- Haut centre : emplacement d’objet rond (roulette, ×3) et **nom de l’objet** à la prise (sur mobile, seul le nom s’affiche : l’icône est sur le bouton objet).
- Bas droite : **badge de position** coloré (or, argent, bronze, menthe) avec ordinal localisé ; **jauge de drift** en 3 segments (ciel, aube, comète) sur bureau,
  sur le bouton DRIFT en tactile. Classement à droite sur grand écran.
- Bas gauche : **mini-carte** (route crème cernée d’encre, pastilles aux couleurs des pilotes, flèche du joueur à la couleur de son écharpe).
- Compte à rebours 3-2-1 (corail, or, menthe) puis « Partez ! » ; bannière « Dernier tour ! » ; « Mauvais sens ! » ; « Arrivée ! » + place ;
  annonces (figure, départ fusée, aspiration, ultra mini-turbo…) placées **sous** le kart pour libérer le centre.
- **Astuces du premier lancement** (une seule fois, mémorisées dans la sauvegarde) : drift (1,8 s après le départ), objets (premier objet reçu,
  texte tactile ou clavier), notes. Pas d’astuce en CLM.
- Résultats, classement GP (onglets Course / Classement), podium avec trophée et confettis, CLM avec temps au tour et records.

## 7. Mobile

- Cockpit conservé : accélération auto, direction à gauche (pilule à curseur ‹ ›), Objet / Drift / Frein sous le pouce droit, inclinaison optionnelle.
  Style « disques de verre » de LUMEN ; cibles ≥ 48 px ; zones sûres via `env()` **et** `--safe-area-inset-*` injectées par Capacitor sur Android.
- Vérifié sans chevauchement à 844×390, 932×430, 667×375, 568×320 et 320×568 (bug de la barre d’outils corrigé en portrait étroit).
- Pause automatique sur `visibilitychange`, `pagehide` et `App.pause` ; l’AudioContext est suspendu en arrière-plan et repris au retour.
- Audio débloqué au premier `pointerdown`/`touchend`.
- Zoom, défilement, appui long et menus contextuels bloqués (viewport `user-scalable=no`, `touch-action`, `-webkit-touch-callout`, `gesturestart`,
  `touchmove` sauf dans les listes défilantes).
- **Haptique** : écoute l’événement `haptic` de l’agent Gameplay (impacts, mini-turbo, boost, atterrissage…) + succès à l’arrivée sur le podium,
  limitée à une vibration toutes les 60–90 ms ; plugins natifs lus via `window.Capacitor.Plugins` (repli `registerPlugin`), jamais d’import obligatoire.

## 8. Audio (`src/audio.js`)

- Graphe : instruments → `musicGain` → atténuation pause → volume musique → maître → compresseur ; effets → `sfxGain` → maître ;
  réverbération procédurale (réponse impulsionnelle de bruit décroissant) partagée.
- **Timbres** : marimba, kalimba, cloche (partiels inharmoniques), steel-pan, verre, flûte-ney (souffle + vibrato), oud, piano électrique doux,
  nappes de triangles désaccordés, basses rondes ; percussions douces, shaker, tambours de bois, darbouka/tek.
- Notation compacte (degrés de gamme, 8 croches par mesure) compilée au chargement ; **un thème par monde**, clé `def.music` puis `track.world`,
  `def.theme`, `def.song` ; inconnu → Prairies :
  titre (berceuse 78 bpm, fa majeur), prairies (marimba 128 bpm, pentatonique), lagons (steel-pan, basse décalée), canopée (dorien, tambours de bois),
  dunes (hijaz, ney et darbouka), Sidi Bou Saïd (mixolydien, oud et riq), ville (city-pop, accords de septième, basse marchante),
  aurores (cloches sur grande nappe, demi-temps), domaine de la Nuit (dorien mystérieux mais lumineux).
- **Dernier tour** : tempo ×1,1, charleston doublé, octave de verre sur la mélodie.
- **Effets doux** : note ♪ = arpège de carillon qui monte avec le compteur ; prisme = scintillement ; roulette = tic-tac de boîte à musique pentatonique ;
  Résonance = grande cloche ; touches de menu en bois/cloche ; chocs en « boing » arrondi ; fleur solaire = souffle + pétales ; éclipse = cascade de verre ;
  moteur = ronronnement électrique feutré ; drift = sable chuintant ; chute dans le vide (`pitKind: 'void'`) = carillon descendant étoilé
  et message « Tombé dans la nuit étoilée ! », l’eau garde le « Plouf ».

## 9. Accessibilité

- Contraste encre sur papier (≈ 9:1), texte minimum 11–12 px sur mobile, chiffres tabulaires.
- Tout est atteignable au clavier et à la manette ; `aria-label` traduits sur les commandes tactiles, `role="switch"` sur les interrupteurs,
  `role="status"` pour l’état du capteur.
- `prefers-reduced-motion` et le réglage « Réduire les effets » coupent les animations décoratives sans masquer d’information (le compte à rebours reste visible).
- La couleur n’est jamais seule porteuse d’information (ordinaux écrits, cadenas, libellés de médailles).

## 10. Tests et vérifications

- `npm test` : 75 tests verts, dont `tests/save.test.js` (sauvegarde neuve, JSON corrompu, stockage qui lève, assainissement, migration v0,
  import des anciens records, règles de déblocage, écharpes, records CLM, réglages et qualité) et `tests/i18n.test.js`
  (complétude FR/EN, données bilingues, détection de langue, ordinaux, thème musical de chaque monde, compilation de toutes les mélodies).
  `tests/mobile.test.js` : chaîne du bouton retour, bascule inclinaison/réglages.
- `npm run build` vert.
- Captures Playwright réalisées sur un build statique (le serveur Vite de dev rechargeait la page à chaque modification des autres agents).

## 11. Limites connues / demandes aux autres zones

- **Plateforme** : réaligner `tests/browser/racing.spec.js` sur les `data-testid` ci-dessus ; le test en ligne nécessite `VITE_WS_URL` au build.
- **Mondes/Art** : pendant mes captures, `mergeGeometries()` a parfois échoué (erreur `boundingSphere` au rendu) sur un circuit en cours de travail ;
  `main.js` l’isole (la boucle continue) mais l’image de ce monde ne se dessine pas tant que la géométrie est invalide.
- Le changement d’ombres (qualité) recompile les matériaux du monde courant ; la taille des pools de particules ne change qu’à la course suivante.
- Les animations CSS des résultats démarrent avec un léger décalage sur les GPU logiciels (headless) ; sans effet sur appareil réel.
