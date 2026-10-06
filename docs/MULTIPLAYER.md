# Mode en ligne et relais WebSocket

> **Statut : masqué dans les builds boutique.** Le code est conservé, mais la carte « En ligne » n'apparaît dans le menu
> que si `VITE_WS_URL` est défini **au moment du build**. Les builds App Store / Google Play se font sans cette
> variable : le jeu reste entièrement hors ligne et les déclarations « aucune donnée collectée » restent exactes.
> Pourquoi : voir [`DOCUMENTATION.md` §6.13](DOCUMENTATION.md#613-mode-en-ligne-masqué-et-pourquoi).

Fichiers : `src/network.js` (`NetworkClient`), `src/multiplayer-race.js` (`snapshotWorld`, `SnapshotRenderer`),
`src/online-ui.js` (`OnlineUI`), `src/online.css`, `server/index.js` (relais), `Dockerfile`, `tests/network.test.js`,
scénario « en ligne » de `tests/browser/racing.spec.js`.

## Essayer en local

```sh
npm ci
VITE_WS_URL=ws://localhost:8787/ws npm run dev   # la variable rend le mode visible
npm run server                                    # second terminal : relais sur le port 8787, endpoint /ws
```

`/health` renvoie du JSON. Ouvrez le jeu dans deux navigateurs, choisissez **En ligne**, créez un salon privé et entrez
son code à six caractères dans l'autre navigateur. Chacun se déclare prêt, puis l'hôte lance. Le **matchmaking public**
rejoint un salon disponible avec le même circuit, la même difficulté et le même nombre de tours, ou en crée un.
Les salons accueillent 2 à 8 humains ; l'IA complète la grille. Depuis la console, `__game.openOnline()` ouvre le
salon même sans `VITE_WS_URL`.

Réglages d'un salon : circuit (ids Lumen Kart : `meadow`, `palm-cove`, `jungle`, `sunset-canyon`, `medina`, `city`,
`frosty-peaks`, `lava-keep`), difficulté `easy` / `medium` / `hard` (→ 50cc / 100cc / 150cc), 1 à 9 tours.

### Invitations
Le lien d'invitation porte `?room=ABC123` (pré-remplit le code) et, pour un navigateur hébergé, `server=` (validé :
`ws`/`wss` uniquement, sans identifiants). Depuis `localhost` ou l'app native, le bouton de partage affiche le code et
l'adresse du serveur à transmettre. Le serveur choisi est mémorisé (`lumenkart.server`). Le code expire quand l'hôte
part. Pas de reconnexion ni de migration d'hôte ; un invité qui part reçoit des commandes neutres ; le départ de l'hôte
ferme la course pour tous.

## Téléphones et réseau local

Sur un téléphone, `localhost` désigne le téléphone. Dans *En ligne › Connexion au serveur*, saisir
`ws://IP_DU_PC:8787/ws` en développement HTTP, ou un endpoint `wss://` déployé pour HTTPS et les apps natives.
`VITE_WS_URL` est une URL publique, jamais un secret. Les pages HTTPS exigent `wss://` ; Android interdit le trafic en
clair. Si un build LAN est un jour distribué sur iOS, il faudra ajouter `NSLocalNetworkUsageDescription`.

## Production

Déployer le build statique sur un hôte HTTPS et `server/index.js` sur un serveur Node permanent avec WebSocket :

```sh
NODE_ENV=production
PORT=8787
HOST=0.0.0.0
ALLOWED_ORIGINS=https://kart.example,capacitor://localhost,https://localhost
```

N'autoriser que les origines réelles (navigateur et coques natives) ; le démarrage en production refuse une liste vide.
La vérification d'origine n'est pas une authentification. Construire le front avec `VITE_WS_URL=wss://relay.example/ws`.
Derrière un reverse proxy, transmettre les en-têtes `Upgrade`/`Connection` :

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
}
```

Un seul processus par déploiement (les salons sont en mémoire ; un redémarrage les efface). Limites applicatives :
1 000 salons, 8 joueurs par salon, trames de 64 Kio, file d'envoi de 256 Kio, 100 messages/s par client. Le client
envoie les commandes à 30 Hz et l'hôte les snapshots à 20 Hz ; les battements de cœur détectent une connexion morte en
~30 s. Mettre aussi des limites de connexions par IP au niveau du proxy.

### Conteneur unique

Le relais sert aussi `dist/`, donc le jeu web et `/ws` peuvent partager un même nom d'hôte HTTPS :

```sh
docker build -t lumen-kart --build-arg VITE_WS_URL=wss://kart.example.com/ws .
docker run --rm -p 8787:8787 \
  -e ALLOWED_ORIGINS=https://kart.example.com,capacitor://localhost,https://localhost \
  lumen-kart
```

L'image (Node 22 Alpine, utilisateur non privilégié, `HEALTHCHECK` sur `/health`) a été construite et testée en local
(`/health`, `/`, manifest) mais **n'a été déployée sur aucun hôte**.

## Autorité et protocole

Le serveur génère les ids de joueurs et les codes, gère membres, « prêt », droits de l'hôte, phase, ordre de grille et
réglages. Au départ, tous les clients reçoivent la même configuration et un `startAt` cinq secondes plus tard.

Le navigateur **hôte simule** tous les karts (humains et IA), objets, tours et résultats à partir des commandes relayées ;
les invités affichent les snapshots et envoient leurs commandes. C'est une autorité **de l'hôte**, pas du serveur : un
hôte malveillant peut tricher. Pas de classement compétitif, de compte, d'anti-triche, de reconnexion ni de persistance.
Si l'onglet de l'hôte passe en arrière-plan, la simulation s'arrête. Le relais valide plages numériques, réglages,
taille/débit des messages et profondeur des snapshots, mais ne peut pas vérifier qu'un snapshot respecte les règles.

API navigateur : `NetworkClient` (`EventTarget`) — `connect()`, `create`, `join`, `match`, `ready`, `start`, `leave`,
`consumeInput(id)` (côté hôte, à chaque image), `sendSnapshot`, `sendInput`, `disconnect` ; événements `room`, `start`,
`snapshot`, `error`, `closed`. `OnlineUI({ root, onStart(client, { room, startAt }), onClose })`.

## Vérification

```sh
node --test tests/network.test.js   # inclus dans npm test
npm run test:browser                # course en ligne à deux navigateurs (build .e2e-dist avec VITE_WS_URL)
```

Les tests utilisent de vrais clients contre un serveur éphémère : salon privé, matchmaking, autorité prêt/départ,
réglages et grille partagés, relais commandes/snapshots, snapshots d'invité refusés, réglages/JSON invalides, origine
refusée, ids de circuits et pilotes Lumen Kart acceptés (inconnus refusés), manifest et icônes servis avec le bon type,
départ d'un invité, nettoyage à la sortie de l'hôte. Avant toute activation publique : tester sur deux appareils en
Wi-Fi et en données mobiles contre l'endpoint TLS déployé, puis mettre à jour les déclarations de confidentialité et la
classification des boutiques.
