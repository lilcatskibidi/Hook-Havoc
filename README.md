# Aquatic Havoc — Deep Sea Hunter (v1.4.0, with Online P2P Multiplayer)

A hybrid fishing/action game with **online peer-to-peer multiplayer** (PeerJS, no server to run).
Cast, hook monsters, drag them ashore, finish them with guns. Bosses, a sealed void cave,
a casino, wild isles, living weather, bite-driving events — and **281 catchable fish** with **32 mutations**.

## Features (v1.4.0)
- Fishing + gun combat, dash with i-frames (Q), consumable items (Bandage / Adrenaline / Smoke on F)
- **Craft tab** (bait/armor/rod/gun sub-tabs) with key-material recipes: priest cores forge Heartlance,
  Choir Repeater, Tithe rods, Tidefather armor; crowns cover emperor trophy gaps
- **Boss remakes**: Void (star-orb, 7-shard gate, quartz shrine, black sea), Hydra (breach arrival,
  storm sea, thunder orb, tiered calls), Priest (blood-mutation heart chain, sacrifice, tsunami
  arrival, shore hunt, heart-rip finisher), Stormcaller (3.5s intro cutscene, 8-skill kit)
- 32 catchable **mutations** (blood/toxic/diamond/…); fish art resolves by species id
- Every sound is a file in `assets/audio/` (`npm run gen-audio` fills gaps) — swap any file to reskin
- Local-only **admin console** (F9): mythical fish, coins, all guns, storm intro, test kits
- 7 rotating sky **events** (Typhoon, Monsoon, Fog Bank, Blood Moon, …); strict-schedule fish bite only in-window
- 📡 **Fish radar** at spawn: live per-species odds, best ferry trip, schedules, active events
- Minecraft-style **keybinds** + sectioned Settings (Audio / Graphics / Controls / Game)
- Square wild isles, shared sea asset, flat 1500c ferry, buoy borders
- Deep Sea Casino, Fish Index (custom-art friendly), 26 achievements
- **Online Multiplayer (up to 4 players)** — Host/Join via room codes, works on itch.io

## Controls
| Key | Action |
|-----|--------|
| `WASD` / Arrows | Move (fixed) |
| `Q` | Dash — i-frame dodge (rebindable) |
| `SPACE` | Cast / reel / pull bobber back (rebindable) |
| Mouse | Shoot · Wheel/Z/X zoom |
| `1-4` | Weapons · `R` reload · `J` fish index |
| `E` | Talk / shop / portal / radar (rebindable) |
| `F` | Use equipped item (rebindable) |
| `ESC` | Menu · `F3` perf overlay |
| Gamepad | Stick move, RT shoot, A cast, B interact, R3 dash |

Walk to the beach SHOP/CASINO pads and press E (circled ⓔ bubbles mark every pad).
No HUD shop button — the trip is the price.

## Quick Start

Open `index.html` in a browser (Chrome/Edge/Firefox) — or play the itch.io build.
No server needed for anything, including multiplayer.

`npm start` (optional) only serves the files locally for development.

---

## Multiplayer Setup (Online P2P)

Everyone must run the **same snapshot build** (menu shows `v1.4.0 · #0001` —
same version is NOT enough: `1.4.0.0001` and `1.4.0.0002` can't see or join
each other's rooms, so a stale tab never desyncs a fresh one).

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

Personal skills, catches, casino tokens, custom art and Settings stay on
your own file — only the shared world (clock, weather, bodies, loot,
announcements) syncs through the host.

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

### High latency / Disconnections
- Use wired Ethernet if possible
- Close bandwidth-heavy apps
- WebRTC prefers UDP; some networks block it (a TURN relay can be saved in Multiplayer → TURN RELAY)

### Lag on wild isles
- Press `F3` — if update/render/HUD are all tiny but FPS is low, the stall is
  outside the page (background tab, another heavy tab, GPU present)
- `F3` also shows canvas backing size; oversized canvases are auto-capped

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
│   ├── build-itch.mjs  # Builds the itch.io zip (npm run build:itch)
│   └── verify-*.mjs    # Headless regression sims (events, crafts, clamps…)
├── .github/workflows/
│   ├── ci.yml          # Lint + archive-layout check
│   └── deploy-itch.yml # Build & upload to itch.io via butler
├── .gitignore
├── css/
│   └── style.css       # Styles including multiplayer UI
└── js/
    ├── main.js         # Game loop, menu, settings, changelog, HUD
    ├── peerlink.js     # PeerJS transport, custom-art sync, announce mirroring
    ├── multiplayer.js  # Room flow, host-authoritative state sync, remote rendering
    ├── netcodec.js     # Binary input codec (14-byte locomotion ticks)
    ├── player.js       # Player logic, dash + i-frames, XP, death/respawn
    ├── fishing.js      # Fishing mechanics + hooked-fish fights
    ├── combat.js       # Combat, hazards, loot, bosses
    ├── weapons.js      # Weapons, rods, armor defs
    ├── render.js       # Rendering (fish models, world, PNG trim)
    ├── input.js        # Input handling + Minecraft-style keybinds
    ├── camera.js       # Camera
    ├── particles.js    # Particle effects
    ├── shop.js         # Shop UI (sell/weapons/rods/armor/ammo/bucket/bait/items)
    ├── items.js        # Consumables (buy/equip/use, hotbar)
    ├── craft.js        # Fish + coins crafting engine
    ├── radar.js        # Fish radar forecast board
    ├── ritual.js       # Cave, runes, boss rituals, bait system
    ├── npc.js          # Old Marlin quests
    ├── casino.js       # Casino games
    ├── save.js         # Save/load
    ├── config.js       # Game constants
    ├── fishData.js     # Fish species, skills, roll tables
    ├── world.js        # Islands, sea zones, events, weather, ferry
    ├── touch.js        # Mobile controls
    ├── gamepad.js      # Gamepad controls
    ├── bgtick.js       # Background-tab simulation ticks
    ├── feedback.js     # Bug-report panel
    ├── utils.js        # Math helpers
    ├── audio.js        # Audio
    ├── lang.js         # EN/VI localization
    └── assetpack.js    # Custom-skin zip export/import
```

---

## Technical Details

### Architecture
- **Transport** (`peerlink.js`): PeerJS cloud broker + WebRTC DataChannels.
  Ephemeral traffic (snapshots ~12Hz, inputs ~15Hz/binary 14B) rides an
  unreliable + unordered lane; lobby/awards/skins stay reliable.
  Star topology, max 4 players
- **Same-version gate**: room ids embed the version digits + explicit handshake check
- **Shared vision** (`PeerSkins`, `PeerAnnounce`): custom art syncs per-session (your local art always wins on your screen); catch popups + boss banners mirrored; Settings stay local
- **Host Authoritative**: Host simulates physics; clients predict locally with
  snapshot smoothing; binary locomotion ticks keep host upload lean

### State Synchronization
- Player positions, HP, fishing state, monsters, bullets, loot, hazards
- Personal files (skills, catches, tokens, items, Settings) never cross the wire

---

## Credits
Game by **LILCAT**  
Multiplayer implementation using WebRTC + Node.js `ws`

---

## License
MIT - Feel free to modify and share!
