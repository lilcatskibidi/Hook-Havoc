# Aquatic Havoc — Deep Sea Hunter (with Online P2P Multiplayer)

A hybrid fishing/action game with **online peer-to-peer multiplayer** (PeerJS, no server to run).

## Features
- Single player fishing & combat
- **Online Multiplayer (up to 4 players)** - Host/Join via room codes, works on itch.io
- **Shared vision** - custom fish/gun/bobber art syncs across peers; catch popups + boss banners mirrored
- Real-time game state synchronization (host-authoritative)
- WebRTC peer-to-peer data (low latency), brokered by the free PeerJS cloud

---

## Quick Start

### 1. Open the Game

Open `index.html` in a browser (Chrome/Edge/Firefox) — or play the itch.io build.
No server needed for anything, including multiplayer.

`npm start` (optional) only serves the files locally for development.

---

## Multiplayer Setup (Online P2P)

Everyone must run the **same game version** (room ids embed the version —
different versions can't even see each other's rooms).

### Host (Player 1)
1. Click **"Multiplayer"** in the main menu
2. Click **"Host Game"**
3. Share the **4-character room code** (e.g., `A3F2`)
4. Wait for players to join
5. Click **"Start Game"**

### Clients (Players 2-4)
1. Click **"Multiplayer"** in the main menu
2. Click **"Join Game"**
3. Enter the **4-character room code** from the host
4. Click **"Join"**
5. Wait for host to start the game

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

- Internet access (PeerJS cloud brokers the handshake; game data is P2P WebRTC)
- Same game version on all PCs
- WebRTC-capable browser (Chrome/Edge/Firefox/Safari); allow UDP where possible
- Max 4 players per room (star topology through the host)

---

## Troubleshooting

### "PeerJS cloud unreachable" / "Room not found"
- Check internet connection / adblock (it must load `cdn.jsdelivr.net` + reach `0.peerjs.com`)
- Room codes are 4 characters; host and clients must share the **same game version**
- "Room is full" means 4 players already joined

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

Works out of the box: the build loads PeerJS from CDN and uses the free
PeerJS cloud to broker rooms, so host/join works right inside the itch.io
embed. Just make sure everyone plays the **same uploaded version**.

---

## Project Structure
```
├── index.html          # Main game HTML
├── server.js           # Static dev server (NOT shipped to itch.io; MP needs no server)
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
    ├── peerlink.js     # PeerJS transport, custom-art sync, announce mirroring
    ├── multiplayer.js  # Room flow, host-authoritative state sync, remote rendering
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
- **Transport** (`peerlink.js`): PeerJS cloud broker + WebRTC DataChannels (reliable). Star topology, max 4 players
- **Same-version gate**: room ids embed the version digits + explicit handshake check
- **Shared vision** (`PeerSkins`, `PeerAnnounce`): custom art syncs per-session (your local art always wins on your screen); catch popups + boss banners mirrored; Settings stay local
- **Host Authoritative**: Host simulates physics, sends state at ~12Hz

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