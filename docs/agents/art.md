# Rapport Art — personnages, karts, objets (agent Art Director)

Fichiers possédés : `src/models.js`, `src/kartfx.js`, ce rapport. Captures : `docs/screenshots/art-roster.png`,
`art-lumen.png`, `art-items.png`.

## Ce qui a été fait

### Lumen en 3D (fidèle à `drawLumen`, `../lumen/js/song-art.js`)
- Tête = grand visage crème `#fff7dc`, plus large que haut (ellipsoïde 1.14 × 0.94), comme dans le 2D où le
  visage *est* la tête. Corps rond sarcelle `#387d76`, ventre menthe `#99d1b7` avec surpiqûres pointillées `#d2e4b3`.
- Deux **oreilles-feuilles** longues en V (même courbe de Bézier que `leaf()` du 2D), extérieur `#306f70`, intérieur
  `#a6dfc6` ; elles se couchent avec la vitesse et rebondissent avec la suspension.
- Grands yeux ovales verticaux `#25575b` avec deux reflets blancs, **clignement** aléatoire (parfois double),
  yeux mi-clos quand il est sonné. Joues `#edba9c`, sourire corail `#ed9b77`, **étoile dorée à 4 branches**
  (l'étoile LUMEN, pas une étoile à 5 branches) sur le front `#edc371` et sur la poitrine `#f3d096` / `#fff0ce`.
- **Écharpe corail** `#e98c73` : col noué autour du cou avec points dorés + **deux pans animés** (ruban CPU de
  2 × 13 rangées, texture tricot + piqûre dorée pointillée `#ffe2ac` + franges). Ils s'allongent avec la vitesse
  (≈0,5 m à l'arrêt → ≈1,6 m lancé, + boost), se soulèvent au vent, ondulent (fréquence liée à la vitesse),
  partent sur le côté en drift (sens opposé à la glisse), flottent vers le haut en l'air. Lisible depuis la
  caméra de poursuite (le dossier du siège et l'aileron ont été abaissés pour la dégager).

### Les 7 rivaux (pilotés par `species`, même langage doux et rond)
| Pilote | Design |
|---|---|
| Zina (fennec) | très grandes oreilles larges intérieur rose, **chéchia rouge** à pompon marine, foulard bleu, queue touffue à bout crème |
| Pip (raton) | masque gris foncé avec cercles clairs autour des yeux, sourcils blancs, **casquette jaune à l'envers** (badge étoile visible de dos), queue annelée |
| Coralie (crabe) | carapace large à bosses, **yeux sur pédoncules**, **pinces sur le volant**, barrette coquillage aqua + perle |
| Rivo (grenouille) | tête large, yeux globuleux, grand sourire, **casquette-feuille** vert tilleul, bandana jaune, mains à ventouses |
| Jagu (jaguar) | taches, **lunettes d'aviateur** cerclées d'or sur le front, queue tachetée annelée |
| Kibo (lionceau) | **crinière** en pompons roux, houppe de queue |
| Nox (la Nuit) | « ombre » de Lumen : silhouette indigo, masque indigo, oreilles pointues à intérieur lavande lumineux, **yeux lavande lumineux**, croissant de lune sur le front, **étoiles scintillantes** (3 matériaux partagés animés), **voile étoilé** à la place de l'écharpe |

Les anciens chapeaux Turbo Kart (cap/crown/mushroom/horns/shell/bow, moustaches, etc.) sont supprimés. Un personnage
sans `species` est mappé depuis `hat` (`cap→raccoon, crown→lion, mushroom→frog, horns→jaguar, shell→crab, bow→fennec`),
sinon renard.

### Karts
- Coque douce et trapue (profil extrudé fortement biseauté), pontons latéraux ronds, pare-chocs en accent avec
  embouts crème, phares-lanternes ronds, **ornement de capot étoile LUMEN dorée**, siège teinte foncée de la
  couleur du pilote, **moteur de lumière** (orbe lumineux dans un anneau d'or) et deux « trompettes-fleurs »
  lumineuses à la place des pots, aileron arrondi avec le nom (police Fredoka si chargée), roues ballon à jantes
  accent et moyeu étoile dorée.
- **Lanterne-signature** (forme losange du 2D) suspendue à une tige de liane : pendule animé (accélération,
  virage, drift, bosses). Version lavande pour Nox.
- Emblème latéral (étoile ou lune pour Nox). Mode **Aurore** (`star`) : peinture qui cycle dans les pastels
  d'aurore (menthe, ciel, lilas, pêche, or) au lieu d'un arc-en-ciel saturé.
- API intacte : `anchors` (wheelRL/RR/FL/FR, exhaustL/R, itemHold — mêmes positions qu'avant), `animate({dt,speed,
  steer,drifting,driftDir,boosting,airborne,spin,star,time})`, `setShrunk`, `dispose`, `parts` (+ `eyes`,
  `lantern`, `scarf`).

### Objets (`createItemModel(type)`, clés inchangées)
`item_box` prisme de cristal hexagonal à facettes arc-en-ciel + étoile intérieure pulsante + halo ;
`banana` ronce (boule de lianes, épines crème, baies roses) ; `green_shell` graine rayée avec pousse et petit visage ;
`red_shell` luciole (abdomen ambré lumineux, ailes qui battent, antennes) ; `blue_shell` étoile filante 3D avec
**traînée orientée selon le mouvement réel** ; `mushroom` comète lilas à queue dégradée ; `star` étoile d'aurore avec
rubans arc-en-ciel tournants ; `lightning` disque d'éclipse à couronne dorée ; `bomb` bouton de fleur solaire au cœur
pulsant ; `coin` **note de musique** dorée ; bonus : `ghost` voile de nuit, `bullet` plume d'envol, `horn` cloche de
résonance, `triple_banana/green/mushroom`. Les parties animées le sont via `onBeforeRender` (appliqué à l'image
suivante), sans appel `update()` côté gameplay.

### Portraits (`createCharacterPortrait`) et icônes
Portraits 128×128 style LUMEN : formes plates douces sans contour, fond en dégradé radial + rayons + étincelles,
cadre arrondi. Lumen est un recadrage fidèle de `drawLumen` (écharpe au vent incluse). **Nouveau** :
`createItemIcon(type, size = 96)` → dataURL d'une icône 2D pour le HUD (tous les ids de `ITEM_INFO`).

### `kartfx.js`
- `createRescueDrone()` → **oiseau-lanterne** crème doré aux ailes menthe qui battent, joues, bec d'or, aigrette en
  feuilles, lanterne lumineuse sous le ventre et **quatre fils de lumière** (mêmes positions/échelle `ropeLen`).
- `createRocketShell()` → **plume d'envol** : cocon menthe lumineux avec étoile dorée et yeux, deux grandes plumes qui
  planent, traînée d'étincelles. Signatures inchangées.

## Choix techniques
- **Un seul shader pour tout ce qui est statique** : chaque pièce est cuite dans une géométrie à *couleurs de
  sommet* + un attribut `surf` (lueur, rugosité, métal) par sommet ; un `MeshStandardMaterial` partagé
  (`onBeforeCompile`, `customProgramCacheKey` → un seul programme GPU) lit ces attributs. Les « lampes »
  (phares, orbe, lanterne, yeux de Nox) sont des sommets à lueur ≈ 1 ; les étoiles de Nox scintillent via une
  valeur de lueur ≥ 2 et un `uTime` partagé (plus aucun matériau animé par pièce).
- Chaque groupe qui bouge = **un seul mesh** : carrosserie (avec emblèmes latéraux en géométrie, phares, moteur,
  liane), roue AV gauche, roue AV droite, **essieu arrière** (2 roues dans une géométrie, flip déjà cuit),
  volant + pattes, torse **+ bras** (cuits jusqu'à la position neutre des pattes sur le volant), tête, yeux
  (clignement), oreilles (les deux dans un mesh, pivot commun), queue, écharpe/voile, lanterne. Le nom sur
  l'aileron (seule texture) n'existe qu'en qualité haute.
- Mode Aurore : chaque kart a son clone du matériau (même programme) pour la carrosserie/roues/volant ; on fait
  varier son `emissive` (teinte pastel cyclique), sans fuite vers les autres karts.
- **Ombres** : seuls la carrosserie et le torse projettent (2 meshes/kart) ; en `low`, aucun : **ombre-disque**
  (decal transparent) sous le kart.
- **LOD** lu dans `window.__lumenQuality` à la création (`high` par défaut) : `high` / `medium` / `low`
  réduisent la tessellation (≈ ×0,62 / ×0,36 / ×0,26 pour les petits détails, ×0,8 / ×0,48 / ×0,32 pour les
  formes principales) et coupent les détails décoratifs (surpiqûres, taches, crampons de pneus, anneaux…).
  En `low` : écharpe à 1 pan et 5 segments, lanterne fixe et sans lueur fusionnée dans la carrosserie, yeux et
  oreilles fusionnés dans la tête (pas de clignement), queue fusionnée dans le torse, pas de jambes. Les gabarits
  sont mis en cache par personnage × qualité.
- Fusion robuste : toutes les géométries sont normalisées (non indexées, Float32 position/normal/uv/color/surf,
  sans groupes ni morphs) ; si `mergeGeometries` échouait, les pièces resteraient séparées (jamais de géométrie
  `null`). Vérifié : 0 géométrie nulle, aucun message `mergeGeometries` en jeu.
- Écharpe : `BufferGeometry` dynamique (≤ 44 sommets), normales calculées à la main, vecteurs scratch
  préalloués → **zéro allocation par image**. `dispose()` libère le matériau et la géométrie propres au kart.
- Objets : ≤ 3 meshes chacun (corps fusionné + au plus une partie transparente/additive + un halo `Sprite`) ;
  les triples sont **un seul mesh** (3 copies fusionnées). Gabarits partagés par type × qualité.

## Budget perf (mesuré dans `dev/models-test.html`, 8 karts + 9 objets, passe d'ombre comprise)
| | Avant | Après (high) | medium | low |
|---|---|---|---|---|
| Draw calls karts (8, + ombres) | ≈ 418 | **≈ 92** | ≈ 84 | ≈ 66 |
| Draw calls objets (9) | ≈ 79 | **≈ 25** | ≈ 25 | ≈ 25 |
| Frame complète du banc (8 karts + 9 objets + décor) | 511 | **132** | 124 | 106 |
| Meshes par kart | 48–55 | **10–12** | 9–11 | 8–9 |
| Meshes projetant une ombre / kart | 35–44 | **2** | 2 | 0 (disque) |
| Triangles par kart | 21,8–26,7 k | **10,5–11,4 k** (≤ 12 k) | 5,5–6,0 k (≤ 6 k) | 2,7–2,97 k (≤ 3 k) |
| Triangles frame du banc | 206 k | 95 k | 51 k | 27 k |

Objets (meshes) : prisme 3, ronce 1, graine 1, luciole 3, étoile filante 3, comète 2, aurore 3, éclipse 2,
fleur solaire 3, note 1, voile 1, plume 1, cloche 2, triples 1–2. Oiseau-lanterne 6 meshes, plume d'envol 5.
`animate()` : ≈ 4 ms pour 600 appels (SwiftShader), aucune allocation.

## Limites connues / à faire
- Les bras sont cuits dans le torse : le volant ne tourne plus que de ±0,45 rad et l'inclinaison du pilote a été
  réduite pour que les pattes restent sur le volant (léger décalage visible de très près en virage serré).
- En `low`, la lanterne ne se balance plus, les yeux ne clignent plus et les oreilles ne bougent plus.
- Le prisme (`item_box`) est transparent (tri des facettes approximatif vu de près).
- La traînée de l'étoile filante s'oriente selon le déplacement mesuré ; immobile, elle garde sa dernière direction.
- Le nom sur l'aileron n'existe qu'en `high` et utilise Fredoka seulement si la police est déjà chargée.
- La plume d'envol (`createRocketShell`) ne connaît pas le pilote (signature sans argument).
- `kartfx.js` importe désormais `models.js` (blocs de construction partagés) : `models.js` est donc chargé
  avec `kart.js` (chunk séparé de ~70 kB, ~26 kB gzip). Import sûr sous Node (aucun accès DOM au chargement).

## Pour les autres agents
- **Nouvel export** `createItemIcon(type, size?)` → dataURL (icônes HUD/roulette, ids de `ITEM_INFO`).
- `createKartModel(character)` accepte un champ optionnel **`scarf`** (couleur hex) pour les écharpes à débloquer
  (défaut : `accent`, corail canonique).
- `model.parts` expose désormais `eyes`, `ears`, `lantern`, `scarf` en plus de `body/driver/head/wheels`
  (`eyes`/`ears`/`lantern` valent `null` en qualité `low`, où ils sont fusionnés) ; `model.quality` indique le
  niveau utilisé. `wheels` contient 3 pivots (AV gauche, AV droite, essieu AR) ; les 4 `anchors` de roues sont
  inchangés.
- **Qualité** : définir `window.__lumenQuality` **avant** de créer karts et objets ; changer de qualité en cours
  de route n'affecte que les modèles créés ensuite.
- `models.js` importe `PALETTE` depuis `src/theme.js` (lecture seule).
- Mondes : les `safeMerge` de `track.js`, `hazards.js` et `environment.js` n'alignent que les **noms** d'attributs ;
  `mergeGeometries` peut encore échouer (et le signaler en console) si `itemSize`, le type de tableau, `normalized`
  ou des attributs entrelacés diffèrent. Normaliser comme `Builder.add()` dans `models.js` le corrigerait.
