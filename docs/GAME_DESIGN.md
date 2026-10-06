# Lumen Kart — Bible de conception (contrat d'équipe)

> Document de référence partagé par toute l'équipe. En cas de doute, ce fichier fait foi.

## 1. Vision

**Lumen Kart** est un jeu de kart arcade en 3D où **Lumen, le petit renard à l'écharpe** (héros du jeu de plateforme LUMEN),
dispute des Grands Prix à travers les mondes qu'il a traversés : prairies d'aurore, lagons, canopée d'Amazonie,
dunes qui chantent de Tunisie, Sidi Bou Saïd, la Ville, la nuit des aurores et le domaine de la Nuit.

Il reprend le principe de Turbo Kart Rally (moteur Three.js existant : drift en 3 niveaux, objets pondérés par position,
Grand Prix, contre-la-montre, IA) et vise une **sortie sur l'App Store et Google Play**.

### Piliers
1. **Fun immédiat au pouce** — on joue en 3 secondes, accélération automatique sur mobile, drift lisible, objets clairs.
   Une course dure 2 à 3 minutes. Le jeu pardonne (aide à la conduite optionnelle) mais récompense la maîtrise (mini-turbo violet, raccourcis, notes).
2. **Beau et lumineux** — direction artistique douce et chaleureuse de LUMEN : couleurs pastel saturées, lumière dorée,
   ciels en dégradé, particules de lumière, contours lisibles. Jamais sombre ni agressif, même dans la Nuit (indigo étoilé).
3. **Mobile d'abord** — 60 i/s visés sur un téléphone milieu de gamme (iPhone 11 / Pixel 6), paysage, zones tactiles ≥ 48 px,
   safe areas, hors ligne, sans compte, sans publicité, sans traçage.
4. **Jeu sérieux de boutique** — progression qui donne envie de revenir (coupes, médailles, déblocages), réglages complets,
   FR/EN, sauvegarde robuste, zéro crash, classement PEGI 3 / 4+.

## 2. Lumen — référence visuelle obligatoire

Lumen est un **petit renard bipède, rond et doux**, tiré du jeu LUMEN (`../lumen/js/song-art.js`, fonction `drawLumen`).

| Élément | Description | Couleur |
|---|---|---|
| Corps / pelage | ovale, sarcelle | `#387d76` |
| Ventre | ovale menthe | `#99d1b7` (surpiqûres pointillées `#d2e4b3`) |
| Visage / masque | large forme crème arrondie, plus large que haute | `#fff7dc` |
| Oreilles | **deux longues feuilles** en V, extérieur `#306f70`, intérieur `#a6dfc6` | |
| Yeux | grands ovales verticaux, reflets blancs, clignent | `#25575b` |
| Joues | petits ovales rosés | `#edba9c` |
| Front | petite **étoile dorée** | `#edc371` |
| Poitrine | **étoile** dorée avec cœur clair | `#f3d096` / `#fff0ce` |
| Sourire | arc corail | `#ed9b77` |
| **Écharpe** | longue écharpe corail qui **flotte derrière lui avec la vitesse**, surpiqûre dorée pointillée | `#e98c73` / `#ffe2ac` |
| Pieds | ovales sarcelle foncé | `#234f53` |

L'écharpe qui flotte au vent est **la signature** : elle doit s'allonger avec la vitesse et onduler en drift.
Pouvoirs de LUMEN (couleurs d'aura) : floraison `#ffc193`, brise `#b5f3d0`, comète `#dbb2f6`, écho `#c5f5de`.

## 3. Pilotes (src/config.js `CHARACTERS`)

| id | Nom | Espèce | Monde | Profil |
|---|---|---|---|---|
| lumen | Lumen | renard (héros) | tous | équilibré, maniable |
| zina | Zina | fennec, chéchia rouge | Tunisie | ultra-léger, maniabilité max |
| pip | Pip | raton laveur, casquette | Ville | accélération |
| coralie | Coralie | crabe | Lagons | accélération max, léger |
| rivo | Rivo | grenouille | Amazonie | léger, nerveux |
| jagu | Jagu | jaguar, lunettes | Amazonie | vitesse max |
| kibo | Kibo | lionceau, crinière | Tanzanie | lourd |
| nox | Nox | La Nuit — silhouette indigo étoilée, yeux lavande | Nuit | rival, lourd et rapide (à débloquer) |

Chaque pilote : un modèle 3D stylisé (pas de copie de personnages Nintendo), un kart aux couleurs du pilote, un portrait.

## 4. Objets (ids internes conservés — noms et visuels dans `src/theme.js`)

| id interne | Lumen Kart | Effet |
|---|---|---|
| coin | **Note** de musique | +vitesse max, 10 max (comme LUMEN : les notes) |
| item_box | **Prisme de lumière** | boîte à objets |
| banana / triple | **Ronce** | piège qui fait tourner |
| green_shell / triple | **Graine** | projectile droit qui rebondit |
| red_shell | **Luciole** | projectile à tête chercheuse |
| mushroom / triple | **Comète** | ruée / boost |
| bomb | **Fleur solaire** | explosion de pétales |
| ghost | **Voile de nuit** | intangible + vol d'objet |
| star | **Aurore** | invincible, arc-en-ciel d'aurore |
| bullet | **Plume d'envol** | pilote automatique en planant |
| lightning | **Éclipse** | rétrécit les adversaires |
| blue_shell | **Étoile filante** | vise le 1er |
| horn | **Résonance** | onde de choc (l'appel de Lumen) |

## 5. Mondes et circuits (8 circuits, 2 coupes + miroir)

Les ids existants sont **conservés** (tests, réseau) ; seuls nom, thème et décor changent. 4 nouveaux circuits sont ajoutés.

| id | Nom FR | Nom EN | Thème | Coupe |
|---|---|---|---|---|
| `meadow` (nouveau) | Prairies d'aurore | Dawn Meadows | meadow : collines vertes, fleurs, lanternes, aube dorée | Aube |
| `palm-cove` | Lagons de corail | Coral Lagoons | lagoon : eau turquoise, coraux, pontons, crabes | Aube |
| `jungle` (nouveau) | Canopée d'Amazonie | Amazon Canopy | jungle : rivière, ponts de lianes, cascades, grenouilles | Aube |
| `sunset-canyon` | Dunes qui chantent | Singing Dunes | desert : dunes de Tozeur, palmeraie, arches de grès | Aube |
| `medina` (nouveau) | Sidi Bou Saïd | Sidi Bou Said | medina : maisons blanches et bleues, bougainvilliers, mer | Crépuscule |
| `city` (nouveau) | La Ville des toits | Rooftop City | city : toits, rails, néons doux, trams, pigeons | Crépuscule |
| `frosty-peaks` | Nuit des aurores | Aurora Night | aurora : neige, rubans d'aurore boréale | Crépuscule |
| `lava-keep` | Le Domaine de la Nuit | Realm of Night | night : château d'indigo, vide étoilé au lieu de lave | Crépuscule |

Coupes : **Coupe de l'Aube** (débloquée) puis **Coupe du Crépuscule** (débloquée par un podium en Aube).
Le mode Miroir se débloque en gagnant les deux coupes. Nox se débloque en gagnant la Coupe du Crépuscule.

## 6. Modes
- **Grand Prix** (4 courses, points 15-12-10-8-6-4-2-1, podium, trophée or/argent/bronze par coupe et classe)
- **Course libre** (n'importe quel circuit débloqué)
- **Contre-la-montre** (fantôme du meilleur tour si possible, records)
- **En ligne** : conservé dans le code, **masqué** dans les menus tant que `import.meta.env.VITE_WS_URL` n'est pas défini.
- Classes : 50cc « Balade », 100cc « Élan », 150cc « Comète », 200cc « Aurore », Miroir.

## 7. Progression et sauvegarde
- Notes collectées en course = monnaie cumulée → débloque des **écharpes** (couleurs) pour Lumen et des peintures de kart.
- Médailles par coupe/classe, records CLM, pilotes et coupes débloqués.
- Sauvegarde versionnée (`lumenkart.save.v1`), migration tolérante, jamais de crash sur sauvegarde corrompue.

## 8. Mobile / boutique
- Paysage verrouillé en natif, safe areas, audio débloqué au premier appui, pause automatique en arrière-plan.
- Contrôles : accélération auto, flèches tactiles + inclinaison optionnelle, Drift / Objet / Frein sous le pouce droit,
  **aide à la direction** optionnelle (activée par défaut en 50cc), vibrations (Capacitor Haptics) désactivables.
- Qualité graphique automatique (haute/moyenne/basse) + réglage manuel ; pixel ratio plafonné ; ombres et bloom adaptés.
- Langues : français (défaut si navigateur FR) et anglais.
- App id : `com.omartrabelsi.lumenkart`, nom « Lumen Kart ».

## 9. Règles de l'équipe d'agents
- **Ne modifiez que les fichiers que vous possédez** (tableau ci-dessous). Besoin d'une autre zone ? Codez contre le contrat
  d'`ARCHITECTURE.md` et notez la demande dans votre rapport.
- **Ne faites pas de commit git** : l'intégrateur commite.
- `npm test` et `npm run build` doivent rester verts. Mettez à jour/ajoutez les tests de votre zone.
- Aucune ressource externe ni copie d'IP tierce : tout est procédural (Three.js, CanvasTexture, WebAudio) ; polices Fredoka / Outfit (OFL) dans `public/fonts`.
- Pas d'allocation par frame dans la boucle ; `dispose()` propre ; pas d'exception dans la boucle de jeu.
- Chaque agent écrit un rapport `docs/agents/<zone>.md` : ce qui a été fait, choix techniques, limites connues.

| Zone | Fichiers |
|---|---|
| Art (personnages, karts, objets) | `src/models.js`, `src/kartfx.js` |
| Mondes (circuits, décors) | `src/tracks.js`, `src/track.js`, `src/environment.js`, `src/track-textures.js`, `src/hazards.js`, `src/coins.js`, `tests/circuits.test.js` |
| Gameplay (conduite, objets, IA, caméra, effets) | `src/kart.js`, `src/ai.js`, `src/items.js`, `src/effects.js`, `src/camera.js`, `src/config.js` (sauf `CHARACTERS`), `src/input.js`, `tests/gameplay.test.js`, `tests/simulation.test.js` |
| UX/UI, audio, flux de jeu | `src/main.js`, `src/race.js`, `src/menu.js`, `src/hud.js`, `src/styles.css`, `src/mobile.css`, `src/mobile-controls.js`, `src/audio.js`, `src/native-motion.js`, `src/online-ui.js`, `src/online.css`, nouveaux `src/i18n.js`, `src/save.js`, `src/settings.js`, `index.html`, `tests/mobile.test.js` |
| Plateforme & publication | `package.json`, `capacitor.config.json`, `vite.config.js`, `ios/`, `android/`, `.github/`, `public/` (hors fonts), `Dockerfile`, `server/`, `tests/network.test.js`, `playwright.config.js`, `tests/browser/`, `store/`, `tools/` |
| Partagé (lecture seule) | `src/theme.js`, `src/events.js`, `docs/GAME_DESIGN.md` |
