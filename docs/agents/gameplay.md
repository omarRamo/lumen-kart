# Rapport — Gameplay (conduite, objets, IA, caméra, effets)

Fichiers modifiés : `src/kart.js`, `src/ai.js`, `src/items.js`, `src/effects.js`, `src/camera.js`, `src/input.js`,
`src/config.js` (hors `CHARACTERS`), `tests/gameplay.test.js`, `tests/simulation.test.js`.
Aucun autre fichier touché. Ids internes des objets inchangés (réseau / tests).

État : `npm test` → 75/75, `npm run build` vert. Tous mes tests passent sur les **8 circuits** (dont `meadow`,
`jungle`, `medina`, `city`).

---

## 1. Sensations de conduite (kart.js + `FEEL` dans config.js)

| Réglage | Avant | Maintenant | Pourquoi |
|---|---|---|---|
| Rampe de direction joueur (`FEEL.steerRiseTime` / `steerFallTime`) | aucune (sauf clavier 0,08 s) | 0 → plein braquage 0,09 s, retour 0,06 s | les flèches tactiles numériques (0 → ±1) ne donnent plus de coups de volant secs ; appliquée au seul kart joueur (l'IA garde sa direction brute) |
| Adhérence faible braquage (`FEEL.lowSteerGripBonus`) | grip 13 | 13 × (1 + 0,3 × (1 − \|steer\|)) → 16,9 en ligne droite | plus « collé » quand on corrige légèrement, glisse toujours en virage serré |
| Entrée en drift (`FEEL.driftEntrySteer`) | fenêtre de 0,28 s après le saut, \|steer\| > 0,25 | **« drift maintenu + n'importe quelle direction »** : tant que le bouton est tenu après l'appui, le drift s'engage dès que \|steer\| > 0,15, même tard ; aussi à l'atterrissage d'un tremplin | indispensable au pouce sur mobile |
| Vitesse mini de drift | 12 | 10 | |
| Seuils de charge (`PHYSICS.driftChargeThresholds`) | 0,9 / 1,9 / 3,0 s | 0,8 / 1,7 / 2,7 s | courses courtes ; la jauge mobile suit ces seuils |
| Vitesse de charge par classe (`DIFFICULTY.*.driftChargeMul`) | 1 | 50cc ×1,3 · 100cc ×1,15 · 150/200cc ×1 | mini-turbos plus généreux en 50/100cc |
| Durée des mini-turbos (`PHYSICS.miniTurboTimes`) | 0,55 / 0,45 / 0,5 s | 0,5 / 0,8 / 1,15 s (force 0,7 / 0,85 / 1) | progression lisible menthe < aube < comète violette |
| Mur rasant | perte de 12 % tangentielle + rebond 0,35 | rebond 0,08 et frottement ≈ 2 % × (impact/12) sous ~12° d'incidence ; rebond 0,35 en frontal ; le nez s'aligne sur le mur | frôler un mur garde ~95 % de la vitesse (test) |
| Hit-stop (`FEEL.hitStop`) | — | gel du kart touché 0,05 s (spin), 0,085 s (tumble), 0,04 s (éclair) en temps simulé | impact lisible, déterministe |
| Atterrissage | squash ≤ 3,5 | squash 0,6 + 0,15 × impact (≤ 4,5) + petit squash à chaque saut de drift ; `kart:land` porte `intensity` et `squash` | |

Physique 100 % déterministe au pas fixe 1/60 (aucun `Math.random` dans kart.js ; test dédié dans `simulation.test.js`).

## 2. Aide à la direction (« aide à la direction »)

```js
kart.assist = { steering: false, strength: 0.6 };   // défaut : désactivée
// UI : kart.assist = { steering: settings.assist, strength: 0.6 }  (ASSIST.defaultOnFor = ['50cc'])
kart.assistNudge   // 0..1, intensité de la correction en cours (indicateur HUD facultatif)
```

Fonctionnement (dans `Kart._assistSteer`, sans allocation par image) :
1. **Suivi de trajectoire (mains libres)** : poursuite pure vers la trajectoire idéale (`track.getRacingLine`,
   échantillonnée une fois par circuit dans une table de 512 points), regard à 7 m + 0,4 × vitesse, cible bornée à
   `roadWidth/2 − 2,4`. Poids = `(1 − |steer joueur| × 1,6) × (0,35 + 0,65 × strength)` : dès que le joueur
   tourne, il reprend la main.
2. **Garde-bord** (toujours actif) : position latérale prédite à 0,55 s ; au-delà de `roadWidth/2 − 2`, la
   correction monte sur 2,5 m jusqu'à « contre-braquer » (poids `danger × min(1, 0,4 + strength)`). Marche aussi en
   drift et en l'air.
3. **Régulateur de virage** (mains libres) : si le prochain virage demande plus de lacet que le kart ne peut en
   fournir, l'aide lève le pied (et freine légèrement à fort excès). Marge = 2 + (1 − strength) × 10 m/s.
   Ne contredit jamais un freinage du joueur.
4. **Filet anti-chute** : au-dessus d'un trou / d'un pont ouvert, gravité réduite de 45 % × strength, vitesse le
   long du circuit maintenue ≥ 24 m/s et rappel latéral vers la route.

Validation : test « throttle seul » sur les 8 circuits, en 50cc et 100cc : tour complet, **0 image hors piste,
0 chute** ; le même kart sans aide sort de la route. Harnais hors-test : 0 sortie aussi en 150cc (force 1) ; en
200cc (force 0,6) quelques sorties brèves après un tremplin + plaque de boost (accepté : l'aide vise 50/100cc).

## 3. Objets (items.js)

Visuels et sémantique selon `src/theme.js`, ids conservés. Comète (champignon) émet maintenant `source: 'mushroom'`.
Les modèles de repli (si `models.js` échoue) prennent les couleurs du thème (graine, luciole, étoile filante,
ronce, prisme de lumière). Les **notes** (coins) : mêmes mécaniques, 10 max, +2 avec l'objet Note.

Probabilités (API exportée `itemOdds(place, racers, difficulty)`, tables `ITEM_WEIGHTS`, `CLASS_ITEM_MODS`) :

### 100cc (« normal » ; 150cc identique, 200cc : Luciole et Étoile filante ×1,1)
| Place | Note | Ronce | Triple ronce | Graine | Triple graine | Luciole | Comète | Triple comète | Fleur solaire | Voile de nuit | Aurore | Plume d’envol | Éclipse | Étoile filante | Résonance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 24 | 25 | 7 | 20 | 5 | · | 5 | · | · | 2 | · | · | · | · | 12 |
| 2 | 10 | 14 | 6 | 16 | 8 | 18 | 12 | 2 | 5 | 3 | 1 | · | · | 1 | 4 |
| 3 | 5 | 8 | 5 | 12 | 10 | 22 | 16 | 5 | 7 | 3 | 3 | · | · | 1 | 2 |
| 4 | 2 | 4 | 3 | 7 | 9 | 24 | 18 | 11 | 7 | 3 | 5 | 1 | 1 | 2 | 2 |
| 5 | · | 2 | 1 | 4 | 6 | 22 | 18 | 18 | 6 | 3 | 8 | 5 | 2 | 2 | 2 |
| 6 | · | · | · | 2 | 4 | 18 | 16 | 24 | 4 | 2 | 12 | 10 | 3 | 2 | 1 |
| 7 | · | · | · | · | 2 | 12 | 12 | 29 | 2 | 2 | 16 | 16 | 5 | 2 | 1 |
| 8 | · | · | · | · | · | 8 | 10 | 29 | · | · | 21 | 24 | 7 | 2 | · |

### 50cc (« easy » : Étoile filante ×0,25, Éclipse ×0,35, Luciole ×0,7, Fleur solaire ×0,6 → Comètes)
| Place | Note | Ronce | Triple ronce | Graine | Triple graine | Luciole | Comète | Triple comète | Fleur solaire | Voile de nuit | Aurore | Plume d’envol | Éclipse | Étoile filante | Résonance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 24 | 25 | 7 | 20 | 5 | · | 6 | · | · | 2 | · | · | · | · | 12 |
| 2 | 10 | 15 | 6 | 17 | 8 | 13 | 16 | 3 | 3 | 3 | 1 | · | · | 0 | 4 |
| 4 | 2 | 4 | 3 | 7 | 10 | 18 | 24 | 14 | 4 | 3 | 6 | 1 | 0 | 1 | 2 |
| 6 | · | · | · | 2 | 4 | 13 | 20 | 29 | 2 | 2 | 13 | 10 | 1 | 1 | 1 |
| 8 | · | · | · | · | · | 6 | 12 | 34 | · | · | 22 | 23 | 3 | 1 | · |

Règles de situation conservées : une seule Étoile filante en jeu, jamais pour le 1er, Plume interdite au top 2,
une seule Éclipse en main. Le 1er n'a que des objets défensifs (dont la Résonance pour contrer l'Étoile filante).
`ItemSystem.difficulty` est déduit des karts (main.js construit tous les karts avec le niveau IA de la classe) ;
on peut le forcer (`items.difficulty = 'easy'`).

## 4. IA (ai.js)

Personnalités exportées dans `PERSONALITIES` (clé = `CHARACTERS[i].id`), mélangées à un peu d'aléatoire :

| Pilote | Style | Traits |
|---|---|---|
| Lumen | équilibré | agressivité 0,5, drift 0,75, cherche les prismes 0,45 |
| Zina | maîtresse du drift | drift 1,0, vise toujours le mini-turbo violet (niveau 3), regard +5 % |
| Pip | opportuniste | agressivité 0,7, réaction ×0,7, **détour systématique par les prismes** (boxSeek 1) |
| Coralie | prudente | agressivité 0,25, freine plus tôt, voit mieux les pièges (+0,25) |
| Rivo | nerveux | zigzague (louvoiement ×1,8, bruit ×1,4), drift 0,85 |
| Jagu | bolide | freine plus tard (caution 1,07), regard +10 %, +0,6 % de vitesse |
| Kibo | cogneur | **se colle aux karts à sa hauteur** s'il est au moins aussi lourd |
| Nox | agressif (rival) | agressivité max, réaction ×0,5, tire Graines jusqu'à 65 m et Lucioles jusqu'à 120 m, +1 % de vitesse |

L'agressivité est en plus multipliée par `0,55 + 0,45 × skill` (IA 50cc plus douces).

Élastique (rubber-band) équitable, lissé (constante 1,5 s⁻¹), écart en mètres par rapport au joueur :

| Classe | Vitesse IA de base | Derrière le joueur (max, au-delà de 185 m) | Devant le joueur (max, au-delà de 190 m) |
|---|---|---|---|
| 50cc | 0,90 | +3 % (pas de remontée flagrante) | −7 % |
| 100cc | 0,95 | +8 % | −5 % |
| 150cc / Miroir | 0,99 | +12 % (vrai combat) | −3,5 % |
| 200cc | 1,00 | +12 % | −2 % |

Simulation 3 tours × 8 circuits × 4 classes avec objets : 128/128 arrivées. Un joueur « accélérateur seul + aide »
finit en général dans le top 4 en 50cc (gagne parfois), milieu/fin de peloton en 100cc+.

## 5. Effets (effects.js)

- **Étincelles de drift** : naissent dans la couleur exacte du stade (1 menthe `#b5f3d0`, 2 aube `#ffc193`,
  3 comète `#dbb2f6`) et refroidissent vers une teinte plus profonde (`#4fdba4`, `#ff8a4a`, `#a772ee`) pour rester
  lisibles en additif + bloom.
- **Boosts** : flammes aux couleurs de la source (Comète = violet, mini-turbo = couleur du stade, plaques/départ =
  aube) ; **traînée de comète** (poussière d'étoile violette) pendant une Comète ; **particules de lumière douces**
  autour du kart pendant tout boost ; **lignes de vitesse / vent** (vue caméra) teintées par la source, avec
  « kick » immédiat au déclenchement.
- **Aurore** (étoile) : étincelles et deux rubans aux couleurs d'aurore boréale.
- **Trainées d'objets** : Luciole = halo luciole ambré clignotant ; Étoile filante = traînée d'étoiles bleu ciel →
  violet ; Graine = poussière menthe ; Fleur solaire = pétales et pollen.
- **Explosions** : Fleur solaire = boule de floraison pêche/crème + **pluie de pétales de tournesol** ; Étoile
  filante = éclat stellaire bleu/violet ; petites = « pouf » doux. **Plus aucune fumée noire** (lavande/crème).
- **Résonance** : trois anneaux concentriques menthe-écho + notes de lumière.
- **Notes** : scintillement doré qui monte. **Prisme** : éclats pastel.
- Nouveaux `burst(kind)` : `'petals'`, `'leaves'`, `'lightMotes'` (en plus des existants). Feuilles à
  l'atterrissage hors-piste et sur un kart touché.
- Correctif : les particules qui arrivent dans l'objectif s'effacent (fondu 0,8–3,2 m) et la taille des points est
  plafonnée à 22 % de la hauteur d'écran (avant : une étincelle pouvait couvrir tout l'écran).
- Fragments (pétales, feuilles, confettis) en `MeshBasicMaterial` : couleurs pastel exactes et moins coûteux.

Budget par qualité (`window.__lumenQuality`, lu à la création de la course pour la taille des pools, et à chaque
image pour le débit d'émission) :

| Qualité | Points additifs | Fumée | Fragments | Lignes de vitesse | Débit / nombre par burst |
|---|---|---|---|---|---|
| `high` (défaut) | 5000 | 2200 | 700 | 70 | ×1 |
| `medium` | 3000 | 1300 | 420 | 48 | ×0,6 |
| `low` | 1500 | 650 | 220 | 28 | ×0,35 |

Tout est en pools (3 draw calls de particules + 10 boules + 20 anneaux + étoiles instanciées + 1 mesh de lignes).
`effects.speedLines = false` ou `window.__lumenReduceMotion = true` coupe les lignes de vitesse.

## 6. Caméra (camera.js)

- Suivi plus doux (lacet 5,0/s, position 9/s), **regard anticipé dans les virages** (1,6 m vers l'intérieur à pleine
  vitesse), **balancier de drift** (la caméra glisse vers l'extérieur pour montrer l'angle du kart), roulis léger.
- Distance 6,1 m, hauteur 2,45 m. **Cadrage paysage** : FOV vertical réduit pour plafonner le FOV horizontal à
  104° (écran 19,5:9 → ~62° au lieu de 70°, kart plus lisible), un peu plus bas/près en très large, plus haut/loin
  en portrait.
- **FOV kick** au boost (+7° Comète/plaque/départ, +4,5° autres, +2,5 à +7° selon le mini-turbo) qui s'ouvre vite et
  revient lentement ; petite secousse temporisée au boost.
- **Punch** (zoom-in bref, ressort) quand le joueur est touché, quand il touche quelqu'un et aux gros atterrissages.

API : `chase.shake(intensity 0..1, duration s)`, `chase.punch(strength = 1)`, `chase.addShake(amount)`,
`chase.shakeScale` (0 = aucune secousse) ou `window.__lumenShakeScale`.

## 7. Entrées (input.js)

Rampe clavier raccourcie (0,05 s) puisque le kart joueur applique sa propre rampe ; courbe expo 1,35 sur le stick
de manette pour des petites corrections précises.

## 8. Événements (bus) et API à brancher côté UI

Nouveau, centralisé pour les vibrations — **émis uniquement pour le joueur local** :

```js
bus.on('haptic', ({ kart, style, intensity, source }) => { ... });
// style : 'selection' | 'light' | 'medium' | 'heavy' | 'success' ; intensity 0..1
// source : 'hit' (heavy) · 'miniTurbo' (light/medium/heavy selon stade) · 'boost' · 'land' · 'wall' · 'bump'
//          · 'driftStart' / 'driftLevel' (selection) · 'itemHit' (success : le joueur a touché quelqu'un)
```
Correspondance suggérée Capacitor Haptics : `selection` → `selectionChanged()`, `light/medium/heavy` →
`impact({ style })`, `success` → `notification({ type: 'SUCCESS' })`.

Autres événements nouveaux ou enrichis :
- `kart:hitStop { kart, kind, duration }` — gel d'impact (main.js pourrait en faire un gel global, facultatif).
- `kart:land` gagne `intensity` (0..1) et `squash`.
- `kart:wallBump` gagne `glancing` (contact rasant).
- `items:created { system }`, `items:disposed { system }`, `fx:created { effects }` — couplage interne items ↔ effets
  (traînées de projectiles). Pas d'usage UI.
- Événements existants toujours émis : `kart:hit`, `kart:miniTurbo`, `kart:boost`, `kart:land`, `kart:wallBump`,
  `item:hit`.

À brancher par l'agent UI :
1. **Aide** : `world.player.assist = { steering: bool, strength: 0..1 }` (défaut ON en 50cc :
   `ASSIST.defaultOnFor`, force par défaut `ASSIST.defaultStrength = 0.6`), à faire après la création du monde.
2. **Qualité** : `window.__lumenQuality = 'high' | 'medium' | 'low'` avant `startRace` (taille des pools).
3. **Secousses** : `world.chase.shakeScale = 0..1` ou `window.__lumenShakeScale` ; `world.chase.shake(i, d)` et
   `world.chase.punch()` disponibles pour l'UI.
4. **Mouvement réduit** : `window.__lumenReduceMotion = true` (coupe les lignes de vitesse), ou
   `world.effects.speedLines = false`.
5. **Vibrations** : écouter `haptic`.
6. Facultatif : `world.player.assistNudge` pour un petit indicateur « aide active ».

## 9. Tests ajoutés

`tests/gameplay.test.js` : aide (tour complet accélérateur seul, 8 circuits × 50/100cc, 0 sortie / 0 chute, témoin
sans aide) ; garde-bord en braquage forcé ; entrée en drift tardive ; mini-turbos plus généreux en 50/100cc ;
mur rasant vs frontal ; hit-stop + événements `haptic`/`kart:hitStop` ; probabilités d'objets par position et par
classe (+ roulette seedée conforme à la table) ; personnalités et élastique par classe ; courses complètes avec
`ItemSystem` réel sur les 8 circuits (toutes les IA + joueur assisté finissent, variété d'objets utilisés).
`tests/simulation.test.js` : déterminisme de la physique (drift, aide, hit-stop, murs, collisions) au pas fixe.

## 10. Limites connues / demandes aux autres zones

- En playtest navigateur, erreur de rendu `Cannot read properties of null (reading 'boundingSphere')` précédée de
  `BufferGeometryUtils.mergeGeometries() failed` : vient d'une géométrie fusionnée nulle dans les fichiers
  Mondes/Art (`track.js`, `environment.js`, `hazards.js` ou `models.js`), pas de ma zone.
- `ARCHITECTURE.md` n'est pas à moi : il faudrait y ajouter `kart.assist`, `haptic`, `kart:hitStop`,
  `chase.shake/punch`, les nouveaux `burst`.
- L'aide ne gère pas le boost : en 200cc un boost juste avant un virage serré peut encore faire mordre le bas-côté.
- Le hit-stop est par kart (le reste du monde continue) : un gel global demanderait une modification de `main.js`.

## 11. Suivi : chute dans le vide et performances des objets

### Chute dans le vide (monde de la Nuit)
- `kart.js` ne teste plus `track.theme === 'lava'` (n'existe plus) mais `track.pitKind` (`'water' | 'void'`,
  repli sur `theme === 'night'`). `kart:fall` porte maintenant `{ kart, position, pitKind, void, lava }` ; `lava`
  est conservé pour la compatibilité et vaut `true` pour le vide → le HUD affiche le message « vide » au lieu de
  « SPLASH ! », et l'audio ne joue pas le plouf d'eau.
- Effet `burst('voidFall')` : tourbillon d'étoiles scintillantes blanc/bleu ciel aspirées vers le bas, volutes
  lavande, éclat et deux anneaux comète/ciel. Aucune éclaboussure d'eau.
- `item:splash` (objet tombé dans un trou) porte aussi `pitKind`/`void` → petit « pouf » d'étoiles au-dessus du vide.
- Aucun autre test `theme === 'beach'|'snow'|'lava'` dans mes fichiers.
- Note pour l'agent UI/audio : `audio.js` et `hud.js` lisent encore `d.lava` (ça fonctionne), mais ils peuvent
  passer à `d.pitKind`.

### Prismes instanciés
- Avant : chaque prisme était un modèle complet (halo en sprite, 2 étoiles du cœur, cristal, arêtes), soit
  **5 objets × 30 prismes = ~150 objets** dans la scène.
- Maintenant (`PrismBatch` dans `items.js`) : **un `InstancedMesh` par pièce du modèle + un seul `Points` pour tous
  les halos**, soit 5 objets pour toute la course. Chaque boîte garde un `holder` (`Object3D` hors scène) dont
  position / rotation / échelle / `visible` pilotent ses instances. C'est compatible avec le rendu réseau des
  invités (`b.holder.visible`), car les instances sont aussi synchronisées au rendu.
- Les projectiles et objets tenus restent poolés (`_acquire`/`_release`).
- Les traînées et particules utilisent les pools d'`effects.js`.
- Tous les visuels d'objets ont `castShadow = receiveShadow = false`. Particules et fragments : aucune ombre.

### Mesures (`renderer.info.render.calls`, Chromium headless, meadow, 150cc, en course)

| Mesure | Avant | Après |
|---|---|---|
| Objets dessinables dans le groupe items | 152–156 | 9–11 (5 pour les prismes + projectiles/objets tenus) |
| Draw calls des objets, pire cas (une rangée de prismes à l'écran) | 17 | 9 |
| Draw calls des effets (tous les pools) | 4 | 4 |
| Objets dessinables dans toute la scène | ~433–441 | ~288–295 (moins de matrices à mettre à jour, moins de tests de frustum) |
| Ombres portées par les objets ou les effets | (variable) | 0 |
| Draw calls de l'image entière (composer compris) | ~190–266 selon le circuit | ~210–269 selon le circuit (bruit : karts en mouvement) |

Les prismes hors champ étaient déjà éliminés par le frustum culling. Le gain est donc surtout côté CPU (environ 145
objets de moins à parcourir chaque image) et en pic quand une rangée est visible. Le coût restant n'est pas dans ma
zone. Répartition mesurée sur une image (rendu direct, 219 appels) :

| Poste | Draw calls |
|---|---|
| Passe d'ombre (lumière directionnelle) | ~100 |
| 8 karts | 11 à 27 chacun, ~175 au total avec leur ombre |
| Circuit | 32 |
| Items | 4 |
| Effets | 4 |
| Notes | 3 |

**Suggestion pour l'agent Art** (`models.js`) : fusionner les géométries des karts et pilotes par matériau, et
limiter les ombres portées aux karts proches de la caméra. C'est le principal levier pour mobile.
