# Rapport — Mondes (circuits, décors, créatures, notes)

Zone : `src/tracks.js`, `src/track.js`, `src/environment.js`, `src/track-textures.js`, `src/hazards.js`,
`src/coins.js`, `tests/circuits.test.js`. Captures : `docs/screenshots/track-<id>.png` (caméra de course)
et `track-<id>-high.png` (vue haute derrière le pilote).

## 1. Les 8 circuits

| id | FR / EN | Monde (`theme`) | Coupe | Longueur | Tour IA 100cc* |
|---|---|---|---|---|---|
| `meadow` (nouveau) | Prairies d’aurore / Dawn Meadows | meadow | Aube | 1 753 m | ≈ 47 s |
| `palm-cove` | Lagons de corail / Coral Lagoons | lagoon | Aube | 1 988 m | ≈ 54 s |
| `jungle` (nouveau) | Canopée d’Amazonie / Amazon Canopy | jungle | Aube | 1 733 m | ≈ 45 s |
| `sunset-canyon` | Dunes qui chantent / Singing Dunes | desert | Aube | 1 959 m | ≈ 56 s |
| `medina` (nouveau) | Sidi Bou Saïd / Sidi Bou Said | medina | Crépuscule | 1 765 m | ≈ 46 s |
| `city` (nouveau) | La Ville des toits / Rooftop City | city | Crépuscule | 1 807 m | ≈ 48 s |
| `frosty-peaks` | Nuit des aurores / Aurora Night | aurora | Crépuscule | 1 709 m | ≈ 50 s |
| `lava-keep` | Le Domaine de la Nuit / Realm of Night | night | Crépuscule | 1 926 m | ≈ 56 s |

\* temps du dernier des 8 IA (départ arrêté) dans `tests/gameplay.test.js` en `normal` ; un bon joueur est ~10 % plus rapide.

### Tracés (nouveaux)
- **Prairies d’aurore** — ligne droite de départ, grand virage montant vers la colline des lanternes, **saut** sur la crête
  (cpf 5.75), esses en descente, grande boucle est, puis un **lobe en épingle** dont l’intérieur est un **champ de fleurs
  ouvert (raccourci)** : un pad de boost placé au bord intérieur (cpf 15.0) y projette les experts. Retour par un **pont
  de bois au-dessus de l’étang**. Moutons endormis et pissenlits roulants.
- **Canopée d’Amazonie** — virage rapide le long de la rive, **pont de lianes** (planches) sur la rivière, deux **lacets**
  qui montent à 19 m (le premier, plat, a un **raccourci de fougères** + pad), course dans la canopée avec **saut de
  gorge** (rampe + trou de 12 m, pads avant), descente en esses rapides devant la cascade. Grenouilles sauteuses.
- **Sidi Bou Saïd** — ruelles pavées qui grimpent entre maisons blanches et bleues jusqu’à la falaise (17 m), place
  plate avec **jardin-raccourci** dans le crochet, **saut de place** dans la descente (cpf 13.55), grande courbe le long
  de la baie jusqu’au port. Chats sur les pavés (ils foncent puis se posent).
- **La Ville des toits** — rues à rails de tram, virages à 90° adoucis, **viaduc surélevé (12 m) avec saut entre les
  toits** (rampe + trou de 13 m, chute = vide → secours), épingle est avec **raccourci par la place**, pont sur le canal.
  Pigeons.

Les 4 tracés existants sont conservés (ids, points de contrôle, fonctionnalités) ; `palm-cove` passe à l’échelle 1.08
(1 988 m au lieu de 2 116 m, tour plus proche de la cible) et gagne un raccourci de banc de sable (cpf 18.5–20.4).

### Nouveaux champs de définition (tracks.js)
- `names {fr,en}`, `shorts {fr,en}`, `blurbs {fr,en}` (les champs `name`, `short`, `blurb` EN restent), `color`.
- `song` : **toujours une chanson existante** de l’AudioEngine (`race|snow|desert|lava`) → aucune piste muette.
  `music` : id de la chanson du monde souhaitée (`meadow, lagoon, jungle, dunes, medina, city, aurora, night`) que
  l’audio peut mapper plus tard. Correspondance actuelle : meadow/lagoon/jungle/city → `race`, dunes/medina → `desert`,
  aurora → `snow`, night → `lava`.
- `bridges: [{from,to}]` (cpf) : viaduc / passerelle hors lac (garde-corps, tablier, piles, pas de terrain dessous).
- `shortcuts: [{from,to}]` : ouvre la barrière **intérieure** du virage (rampe en entonnoir aux deux bouts). Le côté
  intérieur est déduit de la courbure ; la zone doit rester **de niveau** (testé) pour éviter les marches de hauteur.
- Helpers exportés : `trackName(def, lang)`, `trackBlurb(def, lang)`, `getCup(id)`, `LEGACY_CUP_IDS`.

### Coupes
`CUPS = [{ id:'dawn', name:'Coupe de l’Aube', names, color, unlocked:true, tracks:[meadow, palm-cove, jungle, sunset-canyon] },
{ id:'dusk', name:'Coupe du Crépuscule', names, color, unlocked:false, tracks:[medina, city, frosty-peaks, lava-keep] }]`.
`GP_POINTS` inchangé. Anciennes ids `turbo`/`reverse` → `getCup()` les résout (`dawn`/`dusk`). Recherche dans
`src/ tests/ dev/` : plus aucune référence aux ids `turbo`/`reverse` (main/menu/save utilisent déjà `dawn`/`dusk`).
`getTrackDef('inconnu')` renvoie maintenant le premier circuit (`meadow`).

## 2. Contrat Track — ajouts (rétro-compatibles)
- `track.world` / `track.theme` = clé de monde canonique (`meadow … night`). Les anciennes clés `beach/snow/lava`
  restent acceptées dans les définitions (alias).
- `track.pitKind` = `'water'` ou `'void'` (Domaine de la Nuit : vide étoilé, plus de lave).
- `track.names`, `track.quality`, `track.shortcuts` (`[{t0,t1,side}]`).
- `getSurfaceInfo` : au-dessus d’un raccourci on reste en `offroad` ; la recherche guidée par `hintT` vérifie désormais
  la grille quand le kart est hors route, pour basculer proprement d’une section à l’autre en coupant.
- Tout le reste (getSurfaceInfo, resolveWall, pits/gaps, getRespawnT, pointAt, headingAt…) est inchangé.

## 3. Environnements (environment.js)
Huit ambiances inspirées des palettes de LUMEN (`world-art*.js`, `act-*.js`) : ciel dégradé 4 couleurs (dôme shader,
soleil ou **lune en croissant**, étoiles scintillantes), brouillard teinté, hémisphère + soleil chauds, terrain coloré
par sommets, eau stylisée (caustiques, écume, ou **glace** craquelée pour l’aurore), arrière-plan lointain par monde.

| Monde | Ciel / lumière | Décor |
|---|---|---|
| meadow | aube dorée | arbres ronds sarcelle + cerisiers, fleurs pastel, herbes, moutons, lanternes, étang + pont |
| lagoon | turquoise midi | **chaussée au milieu d’un lagon** (terrain abaissé), palmiers, coraux sous l’eau, paillotes sur pilotis, phare, voiliers, passerelles en bois |
| jungle | vert doré brumeux | kapokiers, arbres touffus, fougères géantes, fleurs, rochers moussus, **cascade**, mogotes, lucioles |
| desert | couchant chaud | dunes en croissant, palmeraie de l’oasis, **arches de grès**, mesas, alfa, poussière |
| medina | turquoise midi | maisons blanches à fenêtres bleues (façades instanciées), dômes, portes bleues, bougainvilliers, cyprès, baie, phare, pétales |
| city | crépuscule pêche | immeubles pastel à fenêtres allumées, châteaux d’eau, lampadaires, néons doux, skyline, canal |
| aurora | nuit bleue | **rubans d’aurore animés**, lune, sapins enneigés, igloos lumineux, cristaux de glace, lac gelé, neige |
| night | indigo étoilé | **île flottante au-dessus du vide étoilé** (terrain découpé + falaises), îlots flottants, château de cristal flottant, tours de cristal, arbres lumineux, fleurs-étoiles, aurore violette |

Routes procédurales distinctes (`makeRoadTexture(world)`) : asphalte mauve doux (prairie), asphalte sablé à lignes
turquoise + **passerelles en planches** sur l’eau (lagon, prairie, jungle), terre rouge à ornières (jungle), sable
tassé avec congères (désert), **pavés + frise bleue** (médina), asphalte à **rails de tram** (ville), neige damée (aurore),
dalles indigo à **étoiles dorées** (nuit). Bordures, barrières (panneaux LUMEN KART ♪ ✦, palissade, grès, chaux et
zellige, béton néon, blocs de glace, pierre de nuit), garde-corps, rampes, piles, piles de pare-chocs et portique de
départ (bannière en ruban, étoiles) sont aux couleurs du monde.

## 4. Créatures (hazards.js)
API inchangée (`HazardSystem`, `getHazards()` pour l’IA, mouvement déterministe en fonction du temps).
`crab` (lagon), `sheep` et `dandelion` (prairie, choc léger `bump`), `frog` (jungle, sauts), `boulder` (boule de grès ;
`lava:true` / monde nuit → orbe d’ombre), `tumbleweed`, `cat` (médina, fonce puis se pose), `pigeon` (ville, petit
vol, `bump`), `snowman`/`snowball` (aurore, écharpe corail), `stomper` (écraseur d’ombre aux yeux lavande).
Chaque créature = **un seul mesh fusionné** à couleurs de sommets (1 appel de dessin), géométrie partagée par type.

## 5. Notes (coins.js)
Les pièces deviennent des **notes ♪ dorées** (forme extrudée tête + hampe + crochet, biseautée), qui flottent et
tournent ; **étincelles en étoile** à la collecte (pool de points). API `CoinSystem` inchangée. Toutes les notes (route +
notes perdues) = **1 InstancedMesh** ; étincelles = 1 Points. Aucune allocation par frame. `createNoteGeometry()` est
exportée si l’Art veut la réutiliser pour le HUD/objet.

## 6. Performance mobile
- Mesuré par circuit (navigateur) : le monde (piste + décor + créatures + notes) = **45 à 55 objets dessinables**
  (+ ~20 projeteurs d’ombre), soit **≤ ~75 appels** avant culling. Avant : notes 144 meshes → 2 ; créatures ~30 → 4–11.
- Tout le décor est en `InstancedMesh` à matériaux partagés (Lambert), la géométrie statique de piste est fusionnée,
  les accessoires complexes sont fusionnés avec couleurs de sommets.
- Toute fusion passe par `safeMerge()` (normalise index/attributs, renvoie `null` au lieu de casser) ; les meshes à
  géométrie nulle sont ignorés. Console propre sur les 8 circuits.
- **Indice de qualité** : `createTrack(scene, renderer, { quality })` sinon `renderer.userData.quality` sinon
  `window.__lumenQuality` (posé par main.js) ∈ `high | medium | low` (défaut `high`).
  - `high` : ombres 2048, terrain 260², densité 100 %.
  - `medium` : ombres 1024, terrain 200², densité 60 %.
  - `low` : ombres 1024 sur une zone réduite, terrain 150², densité 35 %, feuillage moins subdivisé, pas de foule,
    décor sans ombres portées. Triangles du monde : ~0,9 M (high) → ~0,3 M (low) sur la Prairie.
  La géométrie de jeu est **identique** quelle que soit la qualité (testé).

## 7. Tests
`tests/circuits.test.js` : 8 ids, 2 coupes de 4, alias, chanson existante, noms FR/EN ; pour chaque circuit et son
miroir : boucle fermée, largeur 24 m, 8 places, ≥ 4 rangées d’objets, notes sur la route, barrières hors de la route,
pente praticable, pas de chevauchement, rampes = `jump`, trous = `pit`, réapparition hors trou, raccourcis ouverts et
de niveau, créatures + notes construites/animées/libérées sans GPU, nettoyage complet ; qualité sans effet sur le
gameplay. `npm test` (57 tests) et `npm run build` passent. Les 8 IA bouclent un tour sur les 8 circuits en 3 niveaux.

## 8. À signaler aux autres zones
- **Gameplay (kart.js)** : `kart:fall` calcule `lava` avec `track.theme === 'lava'` → ne vaut plus jamais vrai. Utiliser
  `track.pitKind === 'void'` pour un effet « chute dans les étoiles » (et le HUD : pas « SPLASH! » dans la Nuit).
- **Art / items** : le gros du coût de rendu vient des karts (~52 meshes chacun, quasi tous projeteurs d’ombre → ~800
  appels pour 8 karts) et des objets (~90 meshes). Fusionner les karts par matériau ramènerait la frame sous ~150 appels.
- **UX** : `def.names / shorts / blurbs` et `cup.names` sont prêts pour l’i18n ; `def.color` peut colorer les cartes.
- **Audio** : `def.music` donne la chanson de monde voulue ; `def.song` reste une chanson existante.

## 9. Limites connues
- Les raccourcis sont des zones ouvertes « invisibles » en bordure (marquées par des haies) : le bord exact suit la
  projection sur la ligne centrale, pas une forme dessinée.
- Le trou du vide (Nuit) suit la grille du terrain (bords en escalier, masqués par des falaises).
- Les façades instanciées ont des fenêtres identiques sur toutes les faces (pas de porte par façade en ville).
- `CIRCUITS.md` (hors zone) décrit encore l’ancien catalogue.
