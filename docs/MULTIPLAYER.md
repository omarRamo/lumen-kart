# Multiplayer relay

Online races use a real WebSocket connection, with private invite rooms and public matchmaking. Run the browser app and relay separately:

```sh
npm install
npm run dev -- --host 0.0.0.0
npm run server
```

The relay listens on port 8787, endpoint `/ws`; `/health` returns JSON. Open the game in two browsers, choose Online, create a private room, and enter its six-character code in the other browser. Each racer marks Ready, then the host starts. Public matchmaking joins an available lobby with the same track, difficulty, and laps, or creates one. The first racer is its host. Public races also require the host to start once everyone is ready. Rooms hold 2–8 human players; the game can fill the remaining grid with AI.

Share the room's invite link; its `?room=ABC123` query pre-fills the join field when Online is opened. Hosted browser invite links also include the chosen `server` URL, validated to accept only ws/wss without embedded credentials. Localhost and native app URLs cannot open the same app on another device, so their share button shows the room code and server address instead; share those with a friend who has the game open. Clipboard access requires a secure browser context; if unavailable, share the displayed code manually. Room codes expire when their host leaves. This version does not reconnect into an existing race or migrate hosts. A guest leaving is removed from the room and receives neutral controls; host departure closes the race for all peers. Race completion does not automatically reopen a lobby: return to online play for another race.

## LAN and native phones

A phone cannot reach a computer's server through `localhost`. In Online → Server connection, enter `ws://COMPUTER_LAN_IP:8787/ws` for local HTTP development, or a deployed `wss://` endpoint for HTTPS/native builds. Configure `VITE_WS_URL` before `npm run build` to embed a deployment endpoint. It is a public URL, never a secret. Hosted HTTPS pages require `wss://`; iOS/Android production builds should also use trusted TLS rather than development transport exceptions. Development localhost pages default to `ws://localhost:8787/ws`; hosted pages default to the same host at `/ws`.

## Production

Deploy the static Vite build on an HTTPS host, and deploy `server/index.js` on a continuously running Node server with WebSocket support. Set:

```sh
NODE_ENV=production
PORT=8787
HOST=0.0.0.0
ALLOWED_ORIGINS=https://kart.example,capacitor://localhost,https://localhost
```

Use only the actual browser and native wrapper origins in your installation. Production startup rejects an empty allowlist. Origin checks prevent casual cross-site connections; they are not authentication and nonbrowser clients can forge origins. Never configure a wildcard origin. Set `VITE_WS_URL=wss://relay.example/ws` when building a separately hosted frontend. With a reverse proxy, forward Upgrade/Connection headers and allow a long idle timeout. Example Nginx location on your TLS virtual host:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
}
```

Terminate TLS at the proxy; do not expose a plain WebSocket endpoint to HTTPS clients. Keep one relay process per deployment: rooms are held in process memory, so multiple replicas require sticky routing and a shared room registry that this starter does not provide. Process restarts discard rooms. Put public deployments behind connection/IP limits at the proxy, monitor active connections, and set suitable process memory/CPU limits. Application defaults cap rooms at 1,000, players at eight per room, frames at 64 KiB, send backlog at 256 KiB, and incoming messages at 100 per client per second. Inputs relay at up to ~83 Hz and snapshots at up to 40 Hz; the bundled client sends at 30/20 Hz. Heartbeats detect silent dead connections within roughly 30 seconds.

## Authority and protocol

The server generates player IDs and room codes, owns membership, readies, host permissions, lobby/race phase, roster/grid ordering, and race settings. Clients cannot choose another player's identity. A host start event supplies the same roster/configuration and `startAt` timestamp to every client, five seconds ahead for scene loading. Host simulation snapshots subsequently govern the actual race clock. Client clocks can differ; initial countdown presentation may differ slightly until the first host snapshot.

The host browser simulates human and AI karts, items, laps and results, using inputs relayed from guest IDs. Guests render host snapshots and send controls. This is **host-authoritative, not server-authoritative physics**: a malicious host can cheat positions, items or results. No competitive ranking, account identity, anti-cheat, reconnect, or persistence is provided. Host tab suspension/backgrounding stalls simulation. The relay validates input numeric ranges, race settings, message size/rate and snapshot depth/numeric bounds, but it cannot verify that a host snapshot follows game rules. Six-character codes are a convenience for friends, not an access-control secret.

Browser API: `NetworkClient` in `src/network.js` is an `EventTarget`; `connect()` resolves on welcome. `create`, `join`, `match`, `ready`, `start`, `leave` send lobby actions. `room`, `start`, `snapshot`, `error`, and `closed` events carry details. Host code should call `consumeInput(id)` each frame, which consumes one-shot item presses and applies braking after one second without guest input. `sendSnapshot` throttles host snapshots and `sendInput` latches item presses across its input throttle. `disconnect` closes the socket. The online UI takes `{root,onStart(client,{room,startAt}),onClose}`.

## Verification

```sh
node --test tests/network.test.js
```

The tests use real clients against an ephemeral server and verify private join, public matchmaking, readiness/start authority, shared settings/roster/start time, input and snapshot relay, rejected guest snapshots, invalid settings/JSON, origin rejection, guest exit, and host cleanup. For visual verification use two devices/browsers: turn/accelerate on the guest and confirm its kart moves on both screens, finish a race, then test guest and host disconnects. Check native devices on Wi-Fi and mobile data against the deployed TLS endpoint; a successful local socket test alone does not establish production network reachability.

## Single-service container

The relay also serves the production `dist/` directory, so the web game and `/ws` can share one HTTPS hostname. The included Dockerfile builds the frontend and runs the relay as an unprivileged user:

```sh
docker build -t turbo-kart .
docker run --rm -p 8787:8787 \
  -e ALLOWED_ORIGINS=https://kart.example.com,capacitor://localhost,https://localhost \
  turbo-kart
```

Put TLS in front of port 8787 and preserve WebSocket upgrade headers. Visit `https://kart.example.com`; browser clients use `wss://kart.example.com/ws` automatically. Native clients set that endpoint in Server connection, or bundle it using `VITE_WS_URL` with the native build. This configuration is provided but has not been deployed to an external host.
