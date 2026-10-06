# Gameplay — conduite, aide, objets, IA

Référence technique du gameplay de Lumen Kart (fichiers `src/kart.js`, `src/ai.js`, `src/items.js`, `src/effects.js`,
`src/camera.js`, `src/input.js`, `src/config.js`). Rapport détaillé de l'agent : [`agents/gameplay.md`](agents/gameplay.md).
Les ids internes des objets (`banana`, `green_shell`…) sont conservés du moteur Turbo Kart Rally ; leurs noms
affichés viennent de `src/theme.js`.

## Classes et difficulté

`CLASSES` (config.js) applique un multiplicateur de vitesse à tous les karts et choisit la difficulté IA.

| Classe | Nom FR | Vitesse | Clé IA | Vitesse IA de base | Charge du drift | Élastique (IA derrière / devant) |
|---|---|---|---|---|---|---|
| 50cc | Balade | ×0,86 | `easy` | 0,90 | ×1,3 | +3 % / −7 % |
| 100cc | Élan | ×1,00 | `normal` | 0,95 | ×1,15 | +8 % / −5 % |
| 150cc | Comète | ×1,12 | `hard` | 0,99 | ×1 | +12 % / −3,5 % |
| 200cc | Aurore | ×1,30 | `extreme` | 1,00 | ×1 | +12 % / −2 % |
| Miroir | Miroir | ×1,12, circuits inversés | `hard` | 0,99 | ×1 | +12 % / −3,5 % |

`'medium'` (code en ligne) est un alias non énumérable de `'normal'` ; utiliser `normalizeDifficulty()`.
L'élastique est lissé (constante 1,5 s⁻¹) et atteint son maximum à ~185–190 m d'écart avec le joueur.

## Sensations de conduite (`PHYSICS`, `FEEL`)

| Réglage | Valeur | Effet |
|---|---|---|
| Rampe de direction joueur | 0 → plein braquage 0,09 s, retour 0,06 s | les flèches tactiles numériques ne donnent pas de coups de volant secs (joueur uniquement) |
| Adhérence à faible braquage | grip × (1 + 0,3 × (1 − \|steer\|)) | plus « collé » en ligne droite |
| Entrée en drift | drift maintenu + \|steer\| > 0,15, vitesse ≥ 10 | s'engage même tard, et à l'atterrissage d'un tremplin |
| Seuils de charge | 0,8 / 1,7 / 2,7 s | menthe `#b5f3d0` → aube `#ffc193` → comète `#dbb2f6` |
| Mini-turbos | 0,5 / 0,8 / 1,15 s (force 0,7 / 0,85 / 1) | |
| Mur rasant | ~95 % de la vitesse conservée sous ~12° | rebond 0,35 en frontal |
| Hit-stop | 0,05 s (tête-à-queue), 0,085 s (culbute), 0,04 s (éclipse) | gel du kart touché, en temps simulé |
| Notes | +0,3 m/s de vitesse de pointe par note, 10 max | 2–3 perdues par choc |
| Départ fusée | accélérer 0,2–0,95 s avant « Partez ! » → boost 1,2 s | 0,95–1,3 s → petit boost ; plus tôt → calage ; jamais pénalisant sur mobile (accélération auto exclue) |

Autres mécaniques : figure au tremplin (appui drift en quittant la rampe), aspiration (`updateSlipstream`), plaques de
boost, hors-piste ralenti (ignoré en boost/aurore), collisions pondérées par le poids, chute dans l'eau ou le vide puis
repêchage par l'oiseau-lanterne.

La physique est **déterministe au pas fixe 1/60 s** (aucun `Math.random` dans `kart.js`) ; `tests/simulation.test.js`
le vérifie.

## Aide à la direction

```js
kart.assist = { steering: false, strength: 0.6 };   // défaut : désactivée
// main.js : player.assist = { steering: assistFor(settings, classId), strength: ASSIST.defaultStrength }
kart.assistNudge   // 0..1, intensité de la correction en cours
```

Réglage joueur : Auto (activée en 50cc, `ASSIST.defaultOnFor`), Toujours, Jamais.

1. **Suivi de trajectoire** (mains libres) : poursuite de la trajectoire idéale (`track.getRacingLine`, table de 512
   points), regard à 7 m + 0,4 × vitesse ; le poids baisse dès que le joueur tourne.
2. **Garde-bord** (toujours actif) : position latérale prédite à 0,55 s, correction croissante sur les 2,5 derniers
   mètres avant le bord, en drift et en l'air aussi.
3. **Régulateur de virage** : lève le pied si le virage suivant est trop serré pour la vitesse ; ne contredit jamais un
   freinage.
4. **Filet anti-chute** : au-dessus d'un trou, gravité réduite, vitesse maintenue et rappel vers la route.

Validé : « accélérateur seul + aide » sur les 8 circuits en 50cc et 100cc → tour complet, 0 sortie, 0 chute (le même
kart sans aide sort de la route).

## Objets

| id | FR / EN | Effet |
|---|---|---|
| `coin` | Note / Note | +2 notes et petit boost |
| `banana`, `triple_banana` | Ronce / Bramble | piège posé derrière, fait tourner ; maintenir Objet pour la traîner en bouclier |
| `green_shell`, `triple_green` | Graine / Seed | projectile droit qui rebondit ; la triple orbite autour du kart |
| `red_shell` | Luciole / Firefly | tête chercheuse vers le kart devant |
| `mushroom`, `triple_mushroom` | Comète / Comet | boost 1,3 s |
| `bomb` | Fleur solaire / Sunflower burst | explosion de pétales |
| `ghost` | Voile de nuit / Night veil | intangible 6 s + vol d'objet |
| `star` | Aurore / Aurora | invincible et rapide 7,5 s |
| `bullet` | Plume d'envol / Flight feather | pilote automatique 5,5 s |
| `lightning` | Éclipse / Eclipse | rétrécit les adversaires 5 s |
| `blue_shell` | Étoile filante / Shooting star | vise le 1er |
| `horn` | Résonance / Resonance | onde de choc, détruit l'Étoile filante |
| `item_box` | Prisme de lumière / Light prism | roulette |

Regarder derrière (C / L3 / R3) en tirant envoie graines et fleurs vers l'arrière.

### Probabilités (`itemOdds(place, racers, difficulty)`, `ITEM_WEIGHTS`, `CLASS_ITEM_MODS`)

100cc (150cc identique ; 200cc : Luciole et Étoile filante ×1,1) :

| Place | Note | Ronce | ×3 ronce | Graine | ×3 graine | Luciole | Comète | ×3 comète | Fleur | Voile | Aurore | Plume | Éclipse | Étoile f. | Résonance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 24 | 25 | 7 | 20 | 5 | · | 5 | · | · | 2 | · | · | · | · | 12 |
| 2 | 10 | 14 | 6 | 16 | 8 | 18 | 12 | 2 | 5 | 3 | 1 | · | · | 1 | 4 |
| 3 | 5 | 8 | 5 | 12 | 10 | 22 | 16 | 5 | 7 | 3 | 3 | · | · | 1 | 2 |
| 4 | 2 | 4 | 3 | 7 | 9 | 24 | 18 | 11 | 7 | 3 | 5 | 1 | 1 | 2 | 2 |
| 5 | · | 2 | 1 | 4 | 6 | 22 | 18 | 18 | 6 | 3 | 8 | 5 | 2 | 2 | 2 |
| 6 | · | · | · | 2 | 4 | 18 | 16 | 24 | 4 | 2 | 12 | 10 | 3 | 2 | 1 |
| 7 | · | · | · | · | 2 | 12 | 12 | 29 | 2 | 2 | 16 | 16 | 5 | 2 | 1 |
| 8 | · | · | · | · | · | 8 | 10 | 29 | · | · | 21 | 24 | 7 | 2 | · |

50cc : Étoile filante ×0,25, Éclipse ×0,35, Luciole ×0,7, Fleur solaire ×0,6, la différence part vers les Comètes.
Règles : une seule Étoile filante en jeu et jamais pour le 1er ; Plume interdite au top 2 ; une seule Éclipse en main.

Rendu : les prismes sont dessinés par `PrismBatch` (un `InstancedMesh` par pièce + un `Points` pour les halos,
5 objets pour toute la course) ; projectiles et objets tenus sont poolés ; aucun objet ne projette d'ombre.

## IA (`ai.js`)

| Pilote | Style | Traits |
|---|---|---|
| Lumen | équilibré | agressivité 0,5, drift 0,75 |
| Zina | maîtresse du drift | vise toujours le mini-turbo violet |
| Pip | opportuniste | agressivité 0,7, détour systématique par les prismes |
| Coralie | prudente | freine plus tôt, voit mieux les pièges |
| Rivo | nerveux | zigzague |
| Jagu | bolide | freine plus tard, +0,6 % de vitesse |
| Kibo | cogneur | se colle aux karts à sa hauteur |
| Nox | rival agressif | réaction ×0,5, tire de loin, +1 % de vitesse |

L'agressivité est multipliée par `0,55 + 0,45 × skill` (IA 50cc plus douces). Simulation 3 tours × 8 circuits ×
4 classes avec objets : 128/128 arrivées.

## Caméra et effets

- `ChaseCamera` : distance 6,1 m, hauteur 2,45 m, regard anticipé en virage, balancier de drift, FOV horizontal plafonné
  à 104° en paysage, FOV kick au boost, `shake(i, d)`, `punch(force)`, `shakeScale` / `window.__lumenShakeScale`.
- `Effects` : étincelles de drift aux couleurs des stades, flammes selon la source du boost, traînée de comète,
  lignes de vitesse (coupées par `__lumenReduceMotion`), pétales, feuilles, motes de lumière, chute dans le vide
  (`burst('voidFall')`). Pools par qualité : 5000 / 3000 / 1500 points additifs (haute / moyenne / basse).

## Événements utiles à l'UI

- `haptic { kart, style, intensity, source }` — joueur local uniquement (voir `src/native.js`).
- `kart:hitStop { kart, kind, duration }`, `kart:land { intensity, squash }`, `kart:wallBump { glancing }`,
  `kart:fall { pitKind, void }`, `item:splash { pitKind, void }`.

Catalogue complet : [`../ARCHITECTURE.md`](../ARCHITECTURE.md#event-catalogue-bus).

## Tests

`tests/gameplay.test.js` : aide sur les 8 circuits × 50/100cc, garde-bord, drift tardif, mini-turbos par classe, murs,
hit-stop + `haptic`, probabilités d'objets (roulette seedée), personnalités et élastique, courses complètes avec
`ItemSystem` réel. `tests/simulation.test.js` : déterminisme. Lancer : `npm test`.
