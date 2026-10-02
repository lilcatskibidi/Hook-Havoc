# Aquatic Havoc — Deep Sea Hunter (with LAN Multiplayer)

A hybrid fishing/action game with **LAN multiplayer support** using WebRTC.

## Features
- Single player fishing & combat
- **LAN Multiplayer (up to 4 players)** - Host/Join via room codes
- **Shared Healing System** - Heal your partner (3 heals per session, 10s cooldown)
- Real-time game state synchronization
- In-game chat
- WebRTC peer-to-peer connection (low latency on LAN)

---

## Quick Start

### 1. Start the Signaling Server (Required for Multiplayer)

**On the host computer:**
```bash
cd "path/to/Aquatic Havoc"
npm start
```
This starts the WebSocket signaling server on `port 8080`. You'll see output like:
```
Signaling server running on port 8080
Open http://localhost:8080 in browser
For LAN: http://192.168.x.x:8080
```

### 2. Open the Game

Open `index.html` in a browser (Chrome/Edge/Firefox) on **both computers**.

**Option A: Via signaling server (recommended for LAN)**
- Navigate to `http://<host-ip>:8080` on both computers

**Option B: Direct file open (single player only)**
- Double-click `index.html` on each computer
- Multiplayer will NOT work without the signaling server

---

## Multiplayer Setup (LAN)

### Host Computer (Player 1)
1. Open the game at `http://<host-ip>:8080`
2. Click **"Multiplayer (LAN)"** in the main menu
3. Click **"Host Game"**
4. Share the **4-character room code** (e.g., `A3F2`) with Player 2
5. Wait for Player 2 to join
6. Click **"Start Game"**

### Client Computer (Player 2)
1. Open the game at `http://<host-ip>:8080`
2. Click **"Multiplayer (LAN)"** in the main menu
3. Click **"Join Game"**
4. Enter the **4-character room code** from Player 1
3. Click **"Join"**
4. Wait for host to start the game

---

## Multiplayer Controls

| Key | Action |
|-----|--------|
| `H` | **Heal both players** (3 uses per session, 10s cooldown) |
| `Enter` | Open chat |
| `ESC` | Menu |

### Healing System
- **Shared pool**: 3 heals total per session (not per player)
- **Cooldown**: 10 seconds between heals
- **Amount**: 30 HP per heal
- **Range**: Heals BOTH players simultaneously
- **Visual**: Green screen flash + particles + floating text

### Chat
- Click the chat icon (💬) in the multiplayer HUD (top-right)
- Press `Enter` to focus chat input
- Messages sync between both players

---

## Network Requirements

- Both computers must be on the **same LAN/WiFi network**
- Host computer runs the signaling server (`node server.js`)
- Port **8080** must be accessible on the host (check firewall)
- WebRTC uses STUN servers (Google's public STUN) for NAT traversal
- If direct P2P fails, relay through signaling server (higher latency)

---

## Troubleshooting

### "Cannot connect to signaling server"
- Make sure `node server.js` is running on host
- Check Windows Firewall: Allow Node.js on port 8080
- Try `http://localhost:8080` on host to verify server works

### "Room not found" / "Room is full"
- Room codes are 4 characters, case-insensitive
- Max 4 players per room
- Codes expire after host leaves or 1 minute of inactivity

### High latency / Disconnections
- Use wired Ethernet if possible
- Close bandwidth-heavy apps
- WebRTC prefers UDP; some networks block it

### Healing not working
- Check heal cooldown (10s) and remaining heals (3 max)
- Must be in-game (not in menu)
- Both players receive heal simultaneously

---

## Single Player
Works without the server! Just open `index.html` directly.
All original features available: fishing, combat, shop, bosses, progression.

---

## Deploying to itch.io

itch.io plays **HTML5 games**: you upload a ZIP that contains `index.html` at the
**root** of the archive. This repo builds exactly that for you.

### What got added

| File | Purpose |
|------|---------|
| `scripts/build-itch.mjs` | Builds `dist/itch/` + `dist/itch.zip` from an allow-list (`index.html`, `css/`, `js/`) — no `node_modules`, no `server.js`. Zero dependencies. |
| `.github/workflows/deploy-itch.yml` | GitHub Actions job that builds the zip and uploads it to itch.io with [butler](https://itch.io/docs/creating/butler). |
| `.github/workflows/ci.yml` | Parse-checks every script and verifies the archive layout on each push/PR. |
| `.gitignore` | Keeps `node_modules/` and `dist/` out of git. |

### 1. One-time itch.io setup

1. **Create the game** on [itch.io/new](https://itch.io/new) → kind: **HTML**.
2. **Game settings** → set the price, visibility and a cover image.
3. **Get your game ID**: open the game's *Settings* page. The URL looks like
   `itch.io/game/1234567` — that trailing number is the **Game ID**.
4. **Create an API key**: [itch.io/settings/api-keys](https://itch.io/settings/api-keys)
   → *Create new API key* → copy it once (it is shown only one time).
5. **Add the uploaded build** once by hand
   (*Upload builds* → drag in `dist/itch.zip`, check *This file will be played in
   the browser*) so the game has a real ID and correct embed settings. Recommended
   embed settings: **Viewport = Fit to screen** (or *Responsive*), **Fullscreen
   button = on**, **Show window title bar = off**.

### 2. Add the GitHub secrets

Create the repo on GitHub first, then go to
**Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Value |
|-------------|-------|
| `ITCHIO_USERNAME` | your itch.io username (e.g. `lilcat`) |
| `ITCHIO_API_KEY` | the API key you just created |
| `ITCHIO_GAME_ID` | the numeric game ID from step 1.3 |

### 3. Publish

```bash
git add .
git commit -m "Add itch.io deploy pipeline"
git push                        # runs CI: lint + build
git tag v1.0.0 && git push --tags   # publishes a build to itch.io
```

You can also use the **Actions → Deploy to itch.io → Run workflow** button
(untick *publish* to save the build as a **draft** you can preview at
`https://<user>.itch.io/<game>?build=<id>` before going live).

Every push also attaches the `aquatic-havoc-itch` artifact, so you can download
`itch.zip` from the run summary and upload it manually if you prefer.

### Local build (no GitHub needed)

```bash
npm run build:itch     # -> dist/itch/ and dist/itch.zip
```

Then drag `dist/itch.zip` onto
`https://itch.io/game/<your-game-id>/upload` in your browser.

### Multiplayer on itch.io

itch.io only hosts the **game page** — it cannot run `server.js`. Single player
works out of the box. For online 2-player sessions, host the signaling server
yourself (Render, Railway, Fly.io, a VPS — anything that runs `npm start` and
supports WebSockets, with `wss://`), then point players at it:

```
https://<user>.itch.io/<game>?server=wss://your-signaling-host
```

The game reads the `?server=` parameter first, then a `localStorage` value, then
falls back to `<current host>:8080` (the LAN default). Plain hostnames work too:
`?server=my-host.com` becomes `ws://my-host.com`.

> itch.io pages are HTTPS, so the connection must be `wss://` — a bare `ws://`
> URL is blocked by the browser as mixed content.

---

## Project Structure
```
├── index.html          # Main game HTML
├── server.js           # WebSocket signaling server (NOT shipped to itch.io)
├── package.json        # Node dependencies (ws)
├── scripts/
│   └── build-itch.mjs  # Builds the itch.io zip (npm run build:itch)
├── .github/workflows/
│   ├── ci.yml          # Lint + archive-layout check
│   └── deploy-itch.yml # Build & upload to itch.io via butler
├── .gitignore
├── css/
│   └── style.css       # Styles including multiplayer UI
└── js/
    ├── main.js         # Game loop, menu, multiplayer integration
    ├── multiplayer.js  # WebRTC, signaling, state sync, healing
    ├── player.js       # Player logic + heal effect
    ├── fishing.js      # Fishing mechanics
    ├── combat.js       # Combat & bosses
    ├── weapons.js      # Weapons & rods
    ├── render.js       # Rendering
    ├── input.js        # Input handling
    ├── camera.js       # Camera
    ├── particles.js    # Particle effects
    ├── shop.js         # Shop UI
    ├── save.js         # Save/load
    ├── config.js       # Game constants
    ├── fishData.js     # Fish species & skills
    ├── utils.js        # Math helpers
    └── audio.js        # Audio
```

---

## Technical Details

### Architecture
- **Signaling Server** (`server.js`): WebSocket server for room management & WebRTC signaling
- **WebRTC DataChannels**: Ordered, reliable channels for game state & inputs
- **Host Authoritative**: Host simulates physics, sends state at 20Hz
- **Client Prediction**: Clients run local prediction, corrected by host state

### State Synchronization
- Player positions, HP, fishing state, monsters, bullets, loot, hazards
- 50ms update interval (20 updates/sec)
- Delta compression for bandwidth efficiency

### Healing Implementation
- Request sent via DataChannel → Host broadcasts to both peers
- Applied instantly locally for responsiveness
- Visual feedback: particles, green flash, floating text
- Shared cooldown & pool tracked by both peers

---

## Credits
Game by **LILCAT**  
Multiplayer implementation using WebRTC + Node.js `ws`

---

## License
MIT - Feel free to modify and share!