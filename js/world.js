// ============================================================
//  WORLD SYSTEM — update 1.1.5: map / weather / time / sea tiers
//  + piers (bridge) + boat trips to 3 detached islands.
//  - Time always runs (day counter, clock, fish conditions).
//  - Day/night LIGHTING can be toggled off in Settings; time keeps running.
//  - Sea tiers by distance from shore: SHORE / SHALLOW / DEEP / ISLAND.
//  - 3 islands are separate maps (cave-style rooms + Teleport loading
//    screen), with boat-ride intros. New-game drift intro lives here too.
// ============================================================
const WorldSystem = {
    DAY_LENGTH_SEC: 900, // one full 24h day (slowed for readable windows)
    WEATHERS: ['clear', 'clouds', 'rain', 'storm', 'fog', 'aurora', 'monsoon'],

    // Each isle sits in a SHARED-style big sea (the room water outside the
    // sand disc fishes exactly like mainland sea: shore/shallow/deep by
    // distance from the sand edge). The inland waters are what differ per
    // island — each has its own lake shape with the isle rarity bonus.
    // Every isle also gets its own pier (east side) + docked ferry boat.
    // SQUARE ISLES (rounded corners): rect math (AABB/SDF) is exact and
    // cheap — no ellipse edge cases, no radial teleports, and what-you-see
    // == what-counts everywhere. SAND_H = half side, SAND_CR = corner radius.
    // The BEACH band (LAND_M beyond the sand) renders as wet sand.
    SAND_H: 560, // sand half-side on every isle (big enough to beach on)
    SAND_CR: 150, // sand corner radius (visual + SDF)
    ISLANDS: [
        {
            id: 'isle_sun', name: 'Sunspill Atoll', icon: '🏝',
            fee: 1500, color: '#fbbf24',
            room: { x0: 8800, x1: 10600, y0: 700, y1: 2300 },
            waters: [{ ox: 0, oy: -40, hw: 260, hh: 200, cr: 90 }],
            desc: 'Sunny lagoon. Dawn choruses, sunspells and monsoons brew here.',
            intro: 'The ferryman rows you past the breakers. Gulls thin out, the water turns glass-green, and a pale atoll rises — Sunspill.',
        },
        {
            id: 'isle_mist', name: 'Mistfall Reef', icon: '🌫',
            fee: 1500, color: '#38bdf8',
            room: { x0: 11000, x1: 12800, y0: 700, y1: 2300 },
            waters: [{ ox: 0, oy: -170, hw: 360, hh: 110, cr: 55 }],
            desc: 'Foggy reef. Fog banks roll in; blood moons rise here.',
            intro: 'Rain curtains part. A reef hums in the fog, buoys clanking. The ferryman kills the lamp — Mistfall Reef. Watch the water.',
        },
        {
            id: 'isle_abyss', name: 'Abyssal Maw', icon: '🌀',
            fee: 1500, color: '#a855f7',
            room: { x0: 13200, x1: 15000, y0: 700, y1: 2300 },
            waters: [{ ox: -160, oy: -80, hw: 150, hh: 120, cr: 55 }, { ox: 160, oy: 90, hw: 150, hh: 120, cr: 55 }],
            desc: 'Storm-wracked rock. Typhoons land and the abyss surges here.',
            intro: 'Lightning walks the horizon all the way out. The sea drops away into black — the Abyssal Maw. Nothing here bites lightly.',
        },
    ],

    islandById(id) {
        return (this.ISLANDS || []).find(i => i.id === id) || null;
    },

    // Deterministic 0..1 hash for decoration scatter (seeded per index):
    // stable across frames (no flicker), varied per island (no cookie
    // cutter). Never use Math.random() in render code.
    // NOTE: named _hashN — WorldSystem._hash(str) already exists for
    // species-id strings; same-name keys would silently overwrite.
    _hashN(n) {
        try {
            let h = (Math.imul(n | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
            h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
            h ^= h >>> 13;
            return (h >>> 0) / 4294967296;
        } catch (e) { return 0.5; }
    },

    // Per-isle seed so the three isles don't scatter identically.
    _isleSeed(state) {
        try {
            const isl = this.islandOf(state);
            const i = Math.max(0, (this.ISLANDS || []).indexOf(isl));
            return (i + 1) * 1000;
        } catch (e) { return 1000; }
    },

    islandOf(state) {
        try {
            const id = state && state.player && state.player.onIsland;
            return id ? this.islandById(id) : null;
        } catch (e) { return null; }
    },

    inSeparateMap(state) {
        try {
            return !!(state && state.player && (state.player.inCave || state.player.onIsland));
        } catch (e) { return false; }
    },

    // ---------- time / weather state ----------
    ensure(state) {
        if (!state.world) {
            state.world = {
                hour: 9.0, day: 1,
                weather: 'clear', weatherT: 90 + Math.random() * 60,
                flashT: 0,
            };
        }
        if (typeof state.world.hour !== 'number') state.world.hour = 9;
        if (typeof state.world.day !== 'number') state.world.day = 1;
        if (!state.world.weather) state.world.weather = 'clear';
        if (typeof state.world.weatherT !== 'number') state.world.weatherT = 90;
        return state.world;
    },

    init(state) {
        this.ensure(state);
        this.ensureClockChip();
        this.refreshClockUI(state);
    },

    periodOf(hour) {
        const h = ((hour % 24) + 24) % 24;
        if (h >= 5 && h < 7) return 'dawn';
        if (h >= 7 && h < 17) return 'day';
        if (h >= 17 && h < 19.5) return 'dusk';
        return 'night';
    },

    periodIcon(period) {
        return period === 'day' ? '☀' : period === 'dawn' ? '🌅' : period === 'dusk' ? '🌇' : '🌙';
    },

    weatherIcon(w) {
        return w === 'clear' ? '☀' : w === 'clouds' ? '☁' : w === 'rain' ? '🌧' : w === 'storm' ? '⛈' : w === 'aurora' ? '🌌' : w === 'monsoon' ? '🌊' : '🌫';
    },

    weatherName(w) {
        return w === 'clear' ? 'Clear' : w === 'clouds' ? 'Cloudy' : w === 'rain' ? 'Rain' : w === 'storm' ? 'Storm' : w === 'aurora' ? 'Aurora' : w === 'monsoon' ? 'Monsoon' : 'Fog';
    },

    pickWeather(current) {
        const bag = ['clear', 'clear', 'clear', 'clouds', 'clouds', 'rain', 'rain', 'fog', 'storm', 'monsoon', 'monsoon', 'aurora'];
        let w = bag[Math.floor(Math.random() * bag.length)];
        if (w === current && Math.random() < 0.5) w = bag[Math.floor(Math.random() * bag.length)];
        return w;
    },

    update(state, delta) {
        const w = this.ensure(state);
        // Ferry rides tick even while the world is otherwise paused-light.
        try { this.updateBoatRide(state, delta); } catch (e) {}
        // Time ALWAYS runs (even with day/night FX off — that only kills lighting).
        w.hour += delta * (24 / this.DAY_LENGTH_SEC);
        if (w.hour >= 24) {
            w.hour -= 24;
            w.day += 1;
            try { this.showDayBanner(state, w.day); } catch (e) {}
        }
        // Weather cycle
        w.weatherT -= delta;
        if (w.weatherT <= 0) {
            w.weather = this.pickWeather(w.weather);
            w.weatherT = 75 + Math.random() * 90;
            try {
                const label = `${this.weatherIcon(w.weather)} ${this.weatherName(w.weather)} rolls in — fish moods shift!`;
                Particles.showFloatingText(state, label, state.player.x, state.player.y - 60, '#7dd3fc');
                if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                    UI.updateStatusBanner(`Weather: <b>${this.weatherName(w.weather)}</b> — ${this.weatherTip(w.weather)}`, 'Weather', 'sky');
                }
                if (typeof audio !== 'undefined' && audio.playThunder && (w.weather === 'storm')) {
                    try { audio.playThunder(); } catch (e) {}
                }
            } catch (e) {}
        }
        if (w.flashT > 0) w.flashT -= delta;
        // Event rotation announcements (change-detected inside).
        try { this._announceEvents(state); } catch (e) {}
        // Throttled clock repaint (~4x/sec)
        w._clockT = (w._clockT || 0) - delta;
        if (w._clockT <= 0) {
            w._clockT = 0.25;
            try { this.refreshClockUI(state); } catch (e) {}
        }
    },

    weatherTip(w) {
        if (w === 'storm') return 'deep hunters + storm lovers bite hard';
        if (w === 'rain') return 'shallow feeders wake up';
        if (w === 'fog') return 'ambush fish strike unseen';
        if (w === 'clouds') return 'dusk/dawn fish linger';
        if (w === 'aurora') return 'MYTHICS + mutations bite hard under the lights';
        if (w === 'monsoon') return 'epic/legendary feeding frenzy — bites come fast';
        return 'fair skies — day fish active';
    },

    dayNightEnabled() {
        try {
            if (typeof Settings !== 'undefined' && Settings.data) {
                return Settings.data.dayNightFx !== false;
            }
        } catch (e) {}
        return true;
    },

    // ---------- sea zones ----------
    // The sea is divided into detection cells by distance from the
    // surf (mainland) or the sand edge (isles):
    //   SHORE <250px, SHALLOW <650px, DEEP beyond, ISLAND = isle lakes.
    // seaCellAt() is the single detector: spawn rates (bonusFor),
    // bite waits (biteMult) and the water tint (render) all read it,
    // so the bobber's cell always decides what bites.
    ZONE_EDGES: { SHORE: 250, SHALLOW: 650 },

    seaCellAt(state, x, y) {
        try {
            const E = this.ZONE_EDGES || { SHORE: 250, SHALLOW: 650 };
            const isl = this.islandOf(state);
            if (isl) {
                if (this.inLakeWater(state, x, y)) return { zone: 'island', d: 0 };
                const d = this.sandSDF(state, x, y);
                if (d < E.SHORE) return { zone: 'shore', d };
                if (d < E.SHALLOW) return { zone: 'shallow', d };
                return { zone: 'deep', d };
            }
            const wb = state.waterBoundaryX || 0;
            const d = x - wb;
            if (d < E.SHORE) return { zone: 'shore', d };
            if (d < E.SHALLOW) return { zone: 'shallow', d };
            return { zone: 'deep', d };
        } catch (e) {
            return { zone: 'shore', d: 0 };
        }
    },

    // SHORE <250px past the surf, SHALLOW <650, DEEP beyond.
    // Around isles the surrounding sea measures from the SAND EDGE exactly
    // like mainland measures from the surf; inland lakes are ISLAND water.
    // No coords = bobber while fishing, else the player (clock chip, etc).
    seaZone(state, x, y) {
        try {
            let px = x, py = y;
            if (typeof px !== 'number' || typeof py !== 'number') {
                const f = state.fishing;
                if (f && (f.mode === 'WAITING_BITES' || f.mode === 'HOOKED') && f.bobber) {
                    px = f.bobber.x; py = f.bobber.y;
                } else {
                    px = state.player.x; py = state.player.y;
                }
            }
            const cell = this.seaCellAt(state, px, py);
            const names = { shore: 'SHORE', shallow: 'SHALLOW', deep: 'DEEP', island: 'ISLAND' };
            const icons = { shore: '🏖', shallow: '🌊', deep: '🌀', island: '🏝' };
            return { id: cell.zone, name: names[cell.zone] || 'SHORE', icon: icons[cell.zone] || '🏖' };
        } catch (e) {
            return { id: 'shore', name: 'SHORE', icon: '🏖' };
        }
    },

    // ---------- EVENT SYSTEM ----------
    // Timed + weather-gated bite events. An event is ACTIVE when the sky
    // matches (weather) and the clock matches (hours, wrap-aware); it
    // boosts its target species ONLY in its places ('main' = mainland sea,
    // island ids = that isle). Islands carry NO rarity buff anymore — all
    // isle luck flows through events + weather, which is exactly what the
    // radar reads. Announced on change (floating text).
    EVENTS: [
        { id: 'dawn_chorus', name: 'DAWN CHORUS', icon: '🌅', weather: 'any', hours: [5, 7], places: ['main', 'isle_sun'],
          targets: { dawn_runner: 3.0, sunfin_tetra: 2.0, cloudskipper: 2.0 } },
        { id: 'sunspell', name: 'SUNSPELL', icon: '☀', weather: 'clear', hours: [7, 17], places: ['isle_sun'],
          targets: { sunscorch_damsel: 3.0, solar_crownfish: 2.5, sunfin_tetra: 2.0 } },
        { id: 'monsoon', name: 'MONSOON', icon: '🌧', weather: 'rain', hours: null, places: ['main', 'isle_sun'],
          targets: { monsoon_garpike: 3.0, monsoon_leopardfish: 2.5, drizzle_minnow: 2.0, midnight_rainfish: 2.5 } },
        { id: 'fog_bank', name: 'FOG BANK', icon: '🌫', weather: 'fog', hours: null, places: ['isle_mist'],
          targets: { fogmother_eel: 3.0, pale_mistlord: 2.5, fog_guppy: 2.0, mistwisp_eel: 2.5 } },
        { id: 'blood_moon', name: 'BLOOD MOON', icon: '🌕', weather: 'clear', hours: [20, 23], places: ['isle_mist', 'isle_abyss'],
          targets: { crimson_tidereaver: 3.0, moonfall_seraph: 2.5, bloodfin_tetra: 2.5, bloodmoon_raya: 2.5 } },
        { id: 'typhoon', name: 'TYPHOON', icon: '🌀', weather: 'storm', hours: null, places: ['isle_abyss', 'main'],
          targets: { tempest_queenfish: 3.0, typhoon_wyrm: 2.5, typhoon_dart: 2.5, stormpetrel_fish: 2.0 } },
        { id: 'abyssal_surge', name: 'ABYSSAL SURGE', icon: '🌊', weather: 'storm', hours: [0, 5], places: ['isle_abyss'],
          targets: { maelstrom_titan: 3.0, abyssal_anglerfish: 2.5, abyss_lanternfish: 2.0 } },
    ],

    // Wrap-aware hour window: [22,2] means 22:00→02:00.
    hourIn(hour, h0, h1) {
        try {
            const h = ((Number(hour) % 24) + 24) % 24;
            if (h0 <= h1) return h >= h0 && h < h1;
            return h >= h0 || h < h1;
        } catch (e) { return true; }
    },

    // Where the player fishes: 'main' or an island id.
    playerPlace(state) {
        try {
            const isl = this.islandOf(state);
            return isl ? isl.id : 'main';
        } catch (e) { return 'main'; }
    },

    // Events whose sky+clock match right now (place checked at bonus time
    // so the radar can project every island honestly).
    activeEvents(state) {
        const out = [];
        try {
            const w = this.ensure(state);
            for (const ev of (this.EVENTS || [])) {
                if (ev.weather && ev.weather !== 'any' && ev.weather !== w.weather) continue;
                if (Array.isArray(ev.hours) && ev.hours.length === 2) {
                    if (!this.hourIn(w.hour, ev.hours[0], ev.hours[1])) continue;
                }
                out.push(ev);
            }
        } catch (e) {}
        return out;
    },

    // Announce event rotation (called from update; change-detected).
    _announceEvents(state) {
        try {
            const ids = this.activeEvents(state).map(e => e.id).sort().join(',');
            const w = this.ensure(state);
            if (ids !== (w._evIds || '')) {
                const before = (w._evIds || '').split(',').filter(Boolean);
                w._evIds = ids;
                const now = ids.split(',').filter(Boolean);
                const fresh = now.filter(id => !before.includes(id));
                for (const id of fresh) {
                    const ev = (this.EVENTS || []).find(e => e.id === id);
                    if (!ev) continue;
                    const where = (ev.places || []).map(p => p === 'main' ? 'mainland sea' : p).join(' + ');
                    Particles.showFloatingText(state, `${ev.icon} ${ev.name} — bite frenzy at ${where}!`,
                        state.player.x, state.player.y - 80, '#fde047');
                }
            }
        } catch (e) {}
    },

    // Product of matching event boosts for a species HERE (place-gated).
    eventMult(state, speciesId) {
        let m = 1;
        try {
            if (!speciesId) return 1;
            const place = this.playerPlace(state);
            for (const ev of this.activeEvents(state)) {
                if (ev.places && !ev.places.includes(place)) continue;
                const t = ev.targets && ev.targets[speciesId];
                if (typeof t === 'number' && t > 0) m *= t;
            }
        } catch (e) {}
        return m;
    },

    // Hard spawn gates: strict species bite ONLY inside their window
    // (e.g. 20:00–23:00 + rain), otherwise their roll weight is 0.
    // Species without strict fields bite like always.
    spawnAllowed(sp, state) {
        try {
            if (!sp || !sp.strict) return true;
            const w = this.ensure(state);
            if (Array.isArray(sp.hours) && sp.hours.length === 2) {
                if (!this.hourIn(w.hour, sp.hours[0], sp.hours[1])) return false;
            }
            if (Array.isArray(sp.weather) && sp.weather.length) {
                if (!sp.weather.includes(w.weather)) return false;
            }
            return true;
        } catch (e) { return true; }
    },

    // ---------- fish condition prefs + spawn bonus ----------
    _hash(str) {
        let h = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h;
    },

    prefsFor(sp) {
        if (!sp) return { time: 'any', weather: 'any', zone: 'any' };
        const h = this._hash(sp.id);
        const rarity = sp.rarity || 'common';
        const size = sp.size || 16;
        // zone: big/mean fish live far out
        let zone = 'shore';
        if (sp.isBoss) zone = 'deep';
        else if (size >= 55 || rarity === 'mythic') zone = 'deep';
        else if (size >= 36 || rarity === 'legendary') zone = (h % 2 ? 'deep' : 'shallow');
        else if (rarity === 'epic') zone = (h % 2 ? 'shallow' : 'deep');
        else if (rarity === 'rare') zone = ['shore', 'shallow', 'shallow'][h % 3];
        else zone = ['shore', 'shore', 'shallow'][h % 3];
        // time
        let time = 'any';
        if (rarity === 'boss' || rarity === 'mythic') time = 'night';
        else if (rarity === 'legendary') time = (h % 2 ? 'night' : 'dusk');
        else if (rarity === 'epic') time = ['dawn', 'dusk', 'night'][h % 3];
        else if (rarity === 'rare') time = ['day', 'dawn', 'any'][h % 3];
        else time = ['day', 'any', 'dawn'][h % 3];
        // weather (aurora/monsoon added to the pools so radar + index
        // hunters can actually chase them — mythics love the lights)
        let weather = 'any';
        const h2 = (((h >>> 3) % 5) + 5) % 5; // h>>>3 keeps it unsigned
        if (size >= 55 || rarity === 'mythic') weather = ['aurora', 'storm', 'aurora', 'monsoon', 'any'][h2];
        else if (rarity === 'legendary') weather = ['storm', 'aurora', 'monsoon', 'any', 'storm'][h2];
        else if (rarity === 'epic') weather = ['monsoon', 'clouds', 'storm', 'any', 'monsoon'][h2];
        else if (rarity === 'rare') weather = ['clear', 'clouds', 'rain', 'any', 'fog'][h2];
        else weather = ['clear', 'clear', 'clouds', 'any', 'rain'][h2];
        return { time, weather, zone };
    },

    bonusFor(species, state) {
        try {
            if (!species || species.isBoss) return 1;
            const pref = this.prefsFor(species);
            const w = this.ensure(state);
            const period = this.periodOf(w.hour);
            const zone = this.seaZone(state).id;
            let mult = 1;
            // zone
            if (pref.zone !== 'any') {
                if (zone === 'island') {
                    mult *= (pref.zone === 'deep' || pref.zone === 'shallow') ? 1.9 : 1.2;
                } else if (zone === pref.zone) {
                    mult *= 2.2;
                } else if ((zone === 'deep' && pref.zone === 'shallow') || (zone === 'shallow' && pref.zone === 'deep')) {
                    mult *= 1.1;
                } else {
                    mult *= 0.7;
                }
            }
            // time
            if (pref.time !== 'any') {
                const match = period === pref.time
                    || (pref.time === 'day' && (period === 'dawn' || period === 'dusk') && Math.random() < 0); // strict
                if (period === pref.time) mult *= 1.8;
                else if (pref.time === 'night' && period !== 'night') mult *= 0.75;
                else mult *= 0.85;
            }
            // weather
            if (pref.weather !== 'any') {
                if (w.weather === pref.weather) mult *= 1.8;
                else if (pref.weather === 'storm' || pref.weather === 'rain') mult *= 0.85;
                else mult *= 0.9;
            }
            // Sky jackpots: aurora crowns mythics/legendaries, monsoon
            // feeds epics/legendaries — the index-completion weathers.
            if (w.weather === 'aurora' && (species.rarity === 'mythic' || species.rarity === 'legendary')) mult *= 1.6;
            if (w.weather === 'monsoon' && (species.rarity === 'epic' || species.rarity === 'legendary')) mult *= 1.5;
            // Event boosts (place-gated): the ONLY island buffs. Rarity
            // boosts are gone — luck flows through sky + clock + events,
            // exactly what the radar reads.
            try {
                const evm = this.eventMult(state, species.id);
                if (evm !== 1) mult *= evm;
            } catch (e) {}
            if (zone === 'deep' && (species.rarity === 'legendary' || species.rarity === 'mythic')) mult *= 1.25;
            return Math.max(0.3, Math.min(9, mult));
        } catch (e) { return 1; }
    },

    // bite waits: matching conditions = faster bites (called from Fishing.landBobber hook)
    biteMult(state) {
        try {
            const w = this.ensure(state);
            const period = this.periodOf(w.hour);
            const night = period === 'night';
            let m = 1;
            if (w.weather === 'rain') m *= 0.9;
            if (w.weather === 'storm') m *= 0.8;
            if (w.weather === 'fog') m *= 0.92;
            if (w.weather === 'monsoon') m *= 0.85;
            if (w.weather === 'aurora') m *= 0.9;
            if (night) m *= 0.95;
            if (this.seaZone(state).id === 'deep') m *= 0.9;
            if (this.seaZone(state).id === 'island') m *= 0.75;
            return m;
        } catch (e) { return 1; }
    },

    fmtTime(hour) {
        const h = ((Math.floor(hour) % 24) + 24) % 24;
        const m = Math.floor((hour - Math.floor(hour)) * 60);
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        return `${hh}:${mm}`;
    },

    // ---------- clock UI (stat chip in the top HUD) ----------
    ensureClockChip() {
        try {
            if (document.getElementById('world-clock-text')) return;
            const row = document.querySelector('#top-hud .flex.gap-2');
            if (!row) return;
            const div = document.createElement('div');
            div.className = 'stat-chip glass-panel px-3 py-1.5 rounded-xl flex items-center gap-2 text-sm font-bold hud-shadow';
            div.id = 'world-clock-chip';
            div.title = 'Time · weather · water tier. Fish bite more when conditions match!';
            div.innerHTML = `<span id="world-clock-icon">☀</span><span id="world-clock-text" class="text-sky-300">09:00</span><span id="world-weather-text" class="text-slate-300 text-xs">Clear · Shore</span>`;
            row.appendChild(div);
        } catch (e) {}
    },

    refreshClockUI(state) {
        try {
            this.ensureClockChip();
            const w = this.ensure(state);
            const period = this.periodOf(w.hour);
            const zone = this.seaZone(state);
            const tEl = document.getElementById('world-clock-text');
            const iEl = document.getElementById('world-clock-icon');
            const wEl = document.getElementById('world-weather-text');
            const periodIcon = this.periodIcon(period);
            const wIcon = this.weatherIcon(w.weather);
            if (tEl) tEl.innerText = `${this.fmtTime(w.hour)} D${w.day}`;
            if (iEl) iEl.innerText = (w.weather === 'clear') ? periodIcon : wIcon;
            if (wEl) wEl.innerText = `${this.weatherName(w.weather)} · ${zone.name}`;
            const chip = document.getElementById('world-clock-chip');
            if (chip) {
                chip.title = `${period.toUpperCase()} ${this.fmtTime(w.hour)} (Day ${w.day})\nWeather: ${this.weatherName(w.weather)} — ${this.weatherTip(w.weather)}\nWater: ${zone.name} — cast farther (pier / boat) for deeper tiers`;
            }
        } catch (e) {}
    },

    // ---------- pier / bridge ----------
    bridgeDef(state) {
        try {
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_Y: 40, MAX_Y: 3500 };
            const wb = state.waterBoundaryX || 600;
            const y = Math.round((B.MIN_Y + B.MAX_Y) / 2) + 500;
            return { x0: wb - 60, x1: wb + 680, y: y, half: 56 };
        } catch (e) { return { x0: 0, x1: 0, y: 0, half: 56 }; }
    },

    onBridge(state, x, y) {
        try {
            if (this.inSeparateMap(state)) return false;
            const b = this.bridgeDef(state);
            // Tight to the deck: no floating a step off the planks.
            return x >= b.x0 - 8 && x <= b.x1 + 8 && Math.abs(y - b.y) <= b.half + 8;
        } catch (e) { return false; }
    },

    boatSpot(state) {
        const b = this.bridgeDef(state);
        return { x: b.x1 - 30, y: b.y };
    },

    nearBoat(state) {
        try {
            if (this.inSeparateMap(state)) return Infinity;
            const s = this.boatSpot(state);
            return Math.hypot(state.player.x - s.x, state.player.y - s.y);
        } catch (e) { return Infinity; }
    },

    // ---------- isle geometry (shared-sea + per-isle lakes + pier) ----------
    islandCenter(state) {
        try {
            const isl = this.islandOf(state);
            if (!isl) return null;
            const r = isl.room;
            return { cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2 };
        } catch (e) { return null; }
    },

    // Rounded-box SDF (negative inside, 0 on edge) + outward normal.
    // Exact for square isles/lakes, branchless-cheap, and — unlike the old
    // radial ellipse push — it resolves along the shallowest axis so
    // walking a shoreline slides instead of teleport-flinging.
    _rbox(dx, dy, hw, hh, cr) {
        const qx = Math.abs(dx) - (hw - cr), qy = Math.abs(dy) - (hh - cr);
        const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
        return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - cr;
    },

    _rboxN(dx, dy, hw, hh, cr) {
        const qx = Math.abs(dx) - (hw - cr), qy = Math.abs(dy) - (hh - cr);
        if (qx > 0 && qy > 0) {
            const l = Math.hypot(qx, qy) || 1;
            return { x: (dx < 0 ? -1 : 1) * qx / l, y: (dy < 0 ? -1 : 1) * qy / l };
        }
        if (qx > qy) return { x: dx < 0 ? -1 : 1, y: 0 };
        return { x: 0, y: dy < 0 ? -1 : 1 };
    },

    sandHalf() { return this.SAND_H || 560; },
    sandCorner() { return this.SAND_CR || 150; },

    // Signed distance to the sand edge (square isles).
    sandSDF(state, x, y) {
        try {
            const c = this.islandCenter(state);
            if (!c) return 1e9;
            return this._rbox(x - c.cx, y - c.cy, this.sandHalf(), this.sandHalf(), this.sandCorner());
        } catch (e) { return 1e9; }
    },

    // Inland water rects, world coords: [{cx,cy,hw,hh,cr}, ...]
    islandWaters(state) {
        try {
            const isl = this.islandOf(state);
            const c = this.islandCenter(state);
            if (!isl || !c) return [];
            return (isl.waters || []).map(w => ({
                cx: c.cx + (w.ox || 0), cy: c.cy + (w.oy || 0),
                hw: (w.hw || w.rx) || 100, hh: (w.hh || w.ry) || 80,
                cr: w.cr || 40,
            }));
        } catch (e) { return []; }
    },

    inLakeWater(state, x, y) {
        try {
            for (const w of this.islandWaters(state)) {
                if (this._rbox(x - w.cx, y - w.cy, w.hw, w.hh, w.cr || 40) < 0) return true;
            }
            return false;
        } catch (e) { return false; }
    },

    // Isle pier: east side, sand edge -> near the room wall. Deck + dock.
    islandPier(state) {
        try {
            const isl = this.islandOf(state);
            const c = this.islandCenter(state);
            if (!isl || !c) return null;
            const H = this.sandHalf();
            return {
                x0: c.cx + H - 20, x1: isl.room.x1 - 120,
                y: c.cy, half: 46,
            };
        } catch (e) { return null; }
    },

    onIslandPier(state, x, y, margin) {
        try {
            const pier = this.islandPier(state);
            if (!pier) return false;
            const m = (typeof margin === 'number') ? margin : 10;
            return x >= pier.x0 - m && x <= pier.x1 + m &&
                Math.abs(y - pier.y) <= pier.half + m;
        } catch (e) { return false; }
    },

    islandExit(state) {
        const pier = this.islandPier(state);
        if (pier) return { x: pier.x1 - 20, y: pier.y };
        const isl = this.islandOf(state);
        if (!isl) return null;
        const r = isl.room;
        return { x: (r.x0 + r.x1) / 2, y: r.y1 - 130 };
    },

    nearIslandExit(state) {
        try {
            const e = this.islandExit(state);
            if (!e) return Infinity;
            return Math.hypot(state.player.x - e.x, state.player.y - e.y);
        } catch (e) { return Infinity; }
    },

    // Any fishable water on the current isle: a lake, or the open sea
    // around the sand (inside the room, outside the square).
    isWaterAt(state, x, y) {
        try {
            const isl = this.islandOf(state);
            if (!isl) {
                const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || {};
                return x > (state.waterBoundaryX || 0) + 8 &&
                    y > (B.MIN_Y || 0) + 20 && y < (B.MAX_Y || 9999) - 20;
            }
            if (this.inLakeWater(state, x, y)) return true;
            const r = isl.room;
            if (!r) return false;
            const inRoom = x > r.x0 + 30 && x < r.x1 - 30 && y > r.y0 + 30 && y < r.y1 - 30;
            return inRoom && this.sandSDF(state, x, y) > 8;
        } catch (e) { return false; }
    },

    // Any "shore" a hooked fish can beach on: mainland surf line, isle
    // sand disc, or either pier deck.
    // LAND RULE (single front door): bridge deck + isle sand + isle pier
    // all count as LAND — dragging a fish onto any of them beaches it.
    // Fishing.updateHooked reads this (never raw coords), so piers and
    // isles beach exactly like the mainland surf.
    // ONE margin everywhere (beach = loot-safe = clamp = render): a fish
    // that counts as beached always lands somewhere loot survives.
    LAND_M: 30,
    isLandAt(state, x, y) {
        return this.isBeachAt(state, x, y);
    },
    isBeachAt(state, x, y) {
        try {
            const off = this.LAND_M;
            const isl = this.islandOf(state);
            if (isl) {
                if (this.sandSDF(state, x, y) <= off) return true;
                return this.onIslandPier(state, x, y, off);
            }
            if (x <= (state.waterBoundaryX || 0) + off) return true;
            return this.onBridge(state, x, y);
        } catch (e) { return false; }
    },

    // Loot survives wherever the player can actually stand to grab it.
    // Same LAND_M as beaching: beached ⇒ lootable, no edge limbo.
    lootSafe(state, x, y) {
        try {
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            const isl = this.islandOf(state);
            if (isl) {
                const r = isl.room;
                if (!r) return false;
                if (x < r.x0 + 20 || x > r.x1 - 20 || y < r.y0 + 20 || y > r.y1 - 20) return false;
                // Lagoon water holds floating loot (magnet + rot timer deal
                // with it) — only the open sea around the square sinks drops.
                if (this.inLakeWater(state, x, y)) return true;
                if (this.sandSDF(state, x, y) <= this.LAND_M) return true;
                return this.onIslandPier(state, x, y, this.LAND_M);
            }
            if (x > (state.waterBoundaryX || 0) + 15 && !this.onBridge(state, x, y)) return false;
            return x >= B.MIN_X - 20 && x <= B.MAX_X + 20 && y >= B.MIN_Y - 20 && y <= B.MAX_Y + 20;
        } catch (e) { return true; }
    },

    // Encounter bounds for hooked-fish physics (boss orbits, world clamps).
    // Islands use their own room — NEVER the mainland surf line.
    fishBounds(state) {
        try {
            const isl = this.islandOf(state);
            if (isl) {
                const r = isl.room;
                return { x0: r.x0 + 40, x1: r.x1 - 40, y0: r.y0 + 40, y1: r.y1 - 40 };
            }
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            return {
                x0: (state.waterBoundaryX || 0) + 15, x1: B.MAX_X - 30,
                y0: B.MIN_Y + 30, y1: B.MAX_Y - 30,
            };
        } catch (e) {
            return { x0: 0, x1: 9999, y0: 0, y1: 9999 };
        }
    },

    // ---------- boat travel (Teleport loading + intro, cave-style) ----------
    canSail(state) {
        try {
            if (this.boatRiding(state)) return { ok: false, why: 'Already sailing!' };
            if (state.player.inCave || state.player.onIsland) return { ok: false, why: 'Not from here.' };
            if (typeof Ritual !== 'undefined' && Ritual.bossFightActive && Ritual.bossFightActive(state)) {
                return { ok: false, why: 'No sailing during a boss!' };
            }
            return { ok: true };
        } catch (e) { return { ok: true }; }
    },

    openBoatMenu(state) {
        try {
            const c = this.canSail(state);
            if (!c.ok) {
                Particles.showFloatingText(state, c.why, state.player.x, state.player.y - 50, '#f87171');
                return;
            }
            let modal = document.getElementById('boat-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'boat-modal';
                modal.className = 'absolute inset-0 bg-slate-950/90 backdrop-blur-lg flex items-center justify-center z-30 p-3';
                modal.innerHTML = `
                    <div class="glass-panel w-full max-w-md rounded-3xl overflow-hidden border border-sky-500/40 shadow-2xl">
                        <div class="p-4 border-b border-slate-800 flex items-center gap-3 bg-gradient-to-r from-sky-900/40 to-slate-900/40">
                            <div class="w-11 h-11 rounded-2xl bg-sky-500/20 text-sky-300 flex items-center justify-center text-2xl border border-sky-500/40">⛵</div>
                            <div class="flex-1">
                                <h2 class="font-black text-white text-lg leading-none">FERRYMAN'S DOCK</h2>
                                <p class="text-[11px] text-sky-300 mt-1">Three wild isles. Separate waters — separate luck.</p>
                            </div>
                            <button id="boat-close" class="text-slate-400 hover:text-white p-2 text-xl">✕</button>
                        </div>
                        <div id="boat-list" class="p-4 flex flex-col gap-2"></div>
                        <div class="p-3 border-t border-slate-800 bg-slate-900/60 text-center text-[10px] text-slate-500 font-bold tracking-widest">FERRY FEE PER TRIP · RETURN IS FREE · E AT THE DOCK TO LEAVE</div>
                    </div>`;
                const gc = document.getElementById('game-container');
                (gc || document.body).appendChild(modal);
                modal.querySelector('#boat-close').onclick = () => modal.classList.add('hidden');
                modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.classList.add('hidden'); });
            }
            const list = modal.querySelector('#boat-list');
            const coins = (state.player && state.player.coins) || 0;
            list.innerHTML = this.ISLANDS.map(isl => `
                <button data-isle="${isl.id}" class="text-left glass-panel-light px-3 py-2.5 rounded-xl border border-slate-700 hover:border-sky-400 transition-all">
                    <div class="flex items-center gap-2">
                        <span class="text-2xl">${isl.icon}</span>
                        <div class="flex-1">
                            <div class="font-black text-white text-sm">${isl.name}</div>
                            <div class="text-[11px] text-slate-400">${isl.desc}</div>
                        </div>
                        <span class="text-xs font-black ${coins >= isl.fee ? 'text-amber-300' : 'text-rose-400'} whitespace-nowrap">${isl.fee}c</span>
                    </div>
                </button>`).join('');
            list.querySelectorAll('[data-isle]').forEach(btn => {
                btn.onclick = () => {
                    const isl = this.islandById(btn.dataset.isle);
                    modal.classList.add('hidden');
                    this.sailTo(state, isl);
                };
            });
            try { if (typeof audio !== 'undefined' && audio.playUIClick) audio.playUIClick(); } catch (e) {}
            modal.classList.remove('hidden');
        } catch (e) {}
    },

    closeBoatMenu() {
        try { const m = document.getElementById('boat-modal'); if (m) m.classList.add('hidden'); } catch (e) {}
    },

    isBoatMenuOpen() {
        try { const m = document.getElementById('boat-modal'); return !!(m && !m.classList.contains('hidden')); } catch (e) { return false; }
    },

    // ---------- animated ferry rides ----------
    // The boat REALLY sails: you board at the pier, ride across the water
    // with a wake (input locked), then the loading-screen crossing fires.
    // Same on arrival — the boat glides in from the offing to the dock.
    boatRiding(state) {
        try { return !!(state && state.world && state.world.boatRide); }
        catch (e) { return false; }
    },

    _rideStep(state, ride, delta) {
        const p = state.player;
        ride.t += delta;
        const k = Math.min(1, ride.t / Math.max(0.01, ride.dur));
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOut
        p.x = ride.x0 + (ride.x1 - ride.x0) * e;
        p.y = ride.y0 + (ride.y1 - ride.y0) * e + Math.sin((state.time || 0) * 3) * 3;
        try {
            if (state.camera) { state.camera.x = p.x; state.camera.y = p.y; }
        } catch (err) {}
        if (typeof Particles !== 'undefined' && Math.random() < 0.6) {
            try { Particles.spawnWaterSplashes(state, p.x - 20, p.y + 14, 1); } catch (err) {}
            try { Particles.spawnWaterSplashes(state, p.x + 20, p.y + 14, 1); } catch (err) {}
        }
        return k >= 1;
    },

    updateBoatRide(state, delta) {
        try {
            const w = state.world;
            if (!w || !w.boatRide) return;
            // Death cancels the voyage (no ghost ferries).
            if (!state.player || state.player.isDead || (state.player.hp || 0) <= 0) {
                w.boatRide = null;
                return;
            }
            const ride = w.boatRide;
            if (this._rideStep(state, ride, delta)) {
                w.boatRide = null;
                if (ride.stage === 'depart') {
                    // Off into the blue — now the loading-screen crossing.
                    if (typeof Teleport !== 'undefined') {
                        Teleport.go(state, {
                            title: ride.ret ? 'SAILING HOME…' : `SAILING TO ${ride.isleName}…`,
                            sub: ride.ret ? 'The mainland light grows on the horizon.'
                                : 'Salt spray. Open water. No turning back.',
                            apply: () => {
                                if (ride.ret) this._applyReturn(state);
                                else {
                                    const isl = this.islandById(ride.isle);
                                    if (isl) {
                                        if (typeof Fishing !== 'undefined') {
                                            try { Fishing.escapeFish(state, ''); } catch (err) {}
                                        }
                                        state.player.coins = Math.max(0, (state.player.coins || 0) - ride.fee);
                                        this._applyLand(state, isl);
                                    }
                                }
                            }
                        });
                    } else if (ride.ret) {
                        this._applyReturn(state);
                    }
                } else {
                    // Arrived — the dock hands you your legs back.
                    if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                        UI.updateStatusBanner(ride.ret ? 'Back at the pier. The isles keep your secret.'
                            : `Ashore at <b>${ride.isleName}</b>! Press E at the dock to sail back.`, ride.ret ? 'Harbor' : 'Island', ride.ret ? 'sky' : 'emerald');
                    }
                    // Island-discovery splash (name + bonus, fades itself).
                    try {
                        if (!ride.ret && ride.isle) {
                            const isl2 = this.islandById(ride.isle);
                            if (isl2) this.showIslandBanner(state, isl2);
                        }
                    } catch (err) {}
                    try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (err) {}
                }
            }
        } catch (e) {}
    },

    sailTo(state, isl) {
        if (!isl) return false;
        const p = state.player;
        if (this.boatRiding(state)) return false;
        if (p.coins < isl.fee) {
            Particles.showFloatingText(state, `Need ${isl.fee}c for the ferry!`, p.x, p.y - 50, '#f87171');
            try { if (typeof audio !== 'undefined' && audio.playError) audio.playError(); } catch (e) {}
            return false;
        }
        // Drop any active line first — you can't tow a hooked fish behind
        // a ferry (it would beach/teleport across the map).
        try { if (typeof Fishing !== 'undefined') Fishing.escapeFish(state, ''); } catch (e) {}
        // Cinematic intro pages first, then the boat REALLY departs.
        this.showBoatIntro(state, isl, () => {
            // Remember the boarding spot (deck) — NOT where the ride ends.
            p.boatReturn = { x: p.x, y: p.y };
            const b = this.bridgeDef(state);
            state.world.boatRide = {
                stage: 'depart', t: 0, dur: 3.0,
                x0: p.x, y0: p.y, x1: b.x1 + 420, y1: b.y,
                isle: isl.id, isleName: isl.name, fee: isl.fee, ret: false,
            };
            if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                UI.updateStatusBanner('⛵ Casting off! Hold on tight…', 'Ferry', 'sky');
            }
        });
        return true;
    },

    _applyLand(state, isl) {
        const p = state.player;
        // boatReturn was stored at boarding time (see sailTo).
        p.onIsland = isl.id;
        // Step off at the isle dock (pier end), then glide in by boat.
        const pier = this.islandPier(state);
        const dx = pier ? pier.x1 - 20 : (isl.room.x0 + isl.room.x1) / 2;
        const dy = pier ? pier.y : isl.room.y1 - 160;
        // Island spawn: dying on the isle respawns you at this dock
        // (kept until you sail home — see sailBack/_applyReturn).
        p.islandSpawn = { x: dx, y: dy };
        p.x = pier ? pier.x1 + 320 : dx;
        p.y = pier ? pier.y : dy;
        try { if (state.camera) { state.camera.x = p.x; state.camera.y = p.y; } } catch (e) {}
        state.enemies = (state.enemies || []).filter(en => en && en.isBoss);
        state.screenShake = Math.max(state.screenShake || 0, 10);
        try { if (typeof Player !== 'undefined') Player.refreshHUD(state); } catch (e) {}
        if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
            UI.updateStatusBanner(`Ashore at <b>${isl.name}</b>! ${isl.desc} Press E at the dock to sail back.`, 'Island', 'emerald');
        }
        // Arrival leg: sail in from the offing to the dock.
        if (pier) {
            state.world.boatRide = {
                stage: 'arrive', t: 0, dur: 2.2,
                x0: p.x, y0: p.y, x1: dx, y1: dy,
                isle: isl.id, isleName: isl.name, fee: 0, ret: false,
            };
        }
        try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (e) {}
    },

    sailBack(state) {
        const p = state.player;
        const isl = this.islandOf(state);
        if (!isl || this.boatRiding(state)) return false;
        try { if (typeof Fishing !== 'undefined') Fishing.escapeFish(state, ''); } catch (e) {}
        const pier = this.islandPier(state);
        const ex = this.islandExit(state) || { x: p.x, y: p.y };
        // Depart leg: push off from the dock toward open water first.
        state.world.boatRide = {
            stage: 'depart', t: 0, dur: 2.6,
            x0: ex.x, y0: ex.y,
            x1: pier ? pier.x1 + 380 : ex.x, y1: (pier ? pier.y : ex.y) + 120,
            isle: isl.id, isleName: isl.name, fee: 0, ret: true,
        };
        if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
            UI.updateStatusBanner('⛵ Casting off for home…', 'Ferry', 'sky');
        }
        return true;
    },

    _applyReturn(state) {
        const p = state.player;
        const r = p.boatReturn;
        const b = this.bridgeDef(state);
        // Home berth, clamped onto something standable (deck or sand) —
        // the ride glides in to a legal spot, never open water.
        p.x = (r && typeof r.x === 'number') ? r.x : b.x1 - 60;
        p.y = (r && typeof r.y === 'number') ? r.y : b.y;
        p.onIsland = null;
        p.boatReturn = null;
        p.islandSpawn = null; // back home: island spawn is gone
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.clampPlayer) WorldSystem.clampPlayer(state);
        } catch (e) {}
        const hx = p.x, hy = p.y;
        // Arrival leg: appear offshore, glide in to the berth.
        p.x = b.x1 + 380; p.y = b.y;
        try { if (state.camera) { state.camera.x = p.x; state.camera.y = p.y; } } catch (e) {}
        state.world.boatRide = {
            stage: 'arrive', t: 0, dur: 2.2,
            x0: p.x, y0: p.y, x1: hx, y1: hy,
            isle: '', isleName: '', fee: 0, ret: true,
        };
        try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (e) {}
    },

    // ---------- intros ----------
    // Big day-rollover banner (not a tiny floating line): DAY N + the
    // morning weather, self-fading like the island splash.
    showDayBanner(state, day) {
        try {
            const host = document.getElementById('game-container') || document.body;
            const old = document.getElementById('day-banner');
            if (old) old.remove();
            const w = this.ensure(state);
            const wicon = this.weatherIcon(w.weather);
            const wname = this.weatherName(w.weather);
            const div = document.createElement('div');
            div.id = 'day-banner';
            div.innerHTML =
                '<div class="day-kicker">☀ A NEW DAY DAWNS ☀</div>' +
                `<div class="day-name">DAY ${day}</div>` +
                `<div class="day-sub">${wicon} ${wname} — the tide renews, check the radar!</div>`;
            host.appendChild(div);
            setTimeout(() => { try { div.remove(); } catch (e) {} }, 3600);
            try {
                Particles.showFloatingText(state, `☀ DAY ${day}`, state.player.x, state.player.y - 70, '#fde047');
            } catch (e) {}
        } catch (e) {}
    },

    // Island-discovery splash: big opaque banner (same family as the
    // boss banner), self-fades after ~3.5s. Fires on arrival only.
    showIslandBanner(state, isl) {
        try {
            if (!isl) return;
            const host = document.getElementById('game-container') || document.body;
            const old = document.getElementById('island-intro-banner');
            if (old) old.remove();
            const div = document.createElement('div');
            div.id = 'island-intro-banner';
            div.innerHTML =
                '<div class="island-intro-kicker">' + (isl.icon || '🏝') + ' NEW SHORE ' + (isl.icon || '🏝') + '</div>' +
                '<div class="island-intro-name">' + String(isl.name || 'ISLAND').toUpperCase() + '</div>' +
                '<div class="island-intro-sub">' + String(isl.desc || '') + '</div>';
            host.appendChild(div);
            try {
                if (typeof Particles !== 'undefined' && state && state.player) {
                    Particles.showFloatingText(state, (isl.icon || '🏝') + ' ' + (isl.name || 'Island') + ' — events brew here, check the radar!',
                        state.player.x, state.player.y - 110, isl.color || '#fbbf24');
                }
            } catch (e) {}
            setTimeout(() => { try { div.remove(); } catch (e) {} }, 3600);
        } catch (e) {}
    },

    showBoatIntro(state, isl, done) {
        try {
            const ov = document.getElementById('intro-overlay');
            if (!ov) { done(); return; }
            const wasPaused = !!state.paused;
            state.paused = true;
            const title = document.getElementById('intro-title');
            const kicker = document.getElementById('intro-kicker');
            const body = document.getElementById('intro-body');
            const dots = document.getElementById('intro-dots');
            const back = document.getElementById('btn-intro-back');
            const next = document.getElementById('btn-intro-next');
            const skip = document.getElementById('btn-intro-skip');
            const pages = [
                { kicker: '⛵ THE CROSSING', title: 'LEAVING THE SHALLOWS', body: `You pay the ferryman ${isl.fee} coins and climb aboard. The pier shrinks behind you; the water deepens from turquoise to ink.` },
                { kicker: `${isl.icon} ${isl.name.toUpperCase()}`, title: 'LANDFALL', body: isl.intro + ' No rarity is favored here — only sky, clock and events. Read the bite forecast before you cast.' },
            ];
            let idx = 0;
            const paint = () => {
                if (kicker) kicker.innerText = pages[idx].kicker;
                if (title) title.innerText = pages[idx].title;
                if (body) body.innerText = pages[idx].body;
                if (dots) dots.innerHTML = pages.map((_, i) => `<span class="w-2 h-2 rounded-full ${i === idx ? 'bg-sky-400' : 'bg-slate-600'}"></span>`).join('');
                if (back) back.style.visibility = idx === 0 ? 'hidden' : 'visible';
                if (next) next.innerText = idx === pages.length - 1 ? T('intro_sail') : T('intro_next');
            };
            ov.classList.remove('hidden');
            ov.classList.add('flex');
            paint();
            const cleanup = () => {
                ov.classList.add('hidden');
                ov.classList.remove('flex');
                if (back) back.onclick = null;
                if (next) next.onclick = null;
                if (skip) skip.onclick = null;
                // Restore the real Intro bindings (Intro.show re-binds on next use)
                try {
                    if (typeof Intro !== 'undefined') {
                        const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
                        on('btn-intro-back', () => Intro.back());
                        on('btn-intro-next', () => Intro.next());
                        on('btn-intro-skip', () => Intro.finish());
                    }
                } catch (e) {}
                // Re-paint real intro page in case a new game starts later
                try { if (typeof Intro !== 'undefined' && Intro.paint) Intro.paint(); } catch (e) {}
                state.paused = wasPaused;
            };
            if (back) back.onclick = () => { if (idx > 0) { idx--; paint(); } };
            if (next) next.onclick = () => {
                if (idx < pages.length - 1) { idx++; paint(); }
                else { cleanup(); done(); }
            };
            if (skip) skip.onclick = () => { cleanup(); done(); };
        } catch (e) { try { done(); } catch (ee) {} }
    },

    // New-game drift intro pages (prepended to Intro.pages at boot).
    driftPages() {
        return [
            {
                kicker: 'PROLOGUE',
                title: 'ADRIFT',
                body: 'You wake to gulls and salt. Your boat went down in the night storm — all that is left is you, a rod, and a splintered plank. The current drags you toward a lamplit shore…',
            },
            {
                kicker: 'PROLOGUE',
                title: 'BLACKTIDE SHORE',
                body: 'Sand under your boots. Someone left a tackle box by the pier, and Old Marlin is already watching from his camp. The sea took everything once — time to take back more.',
            },
        ];
    },

    // ---------- collision ----------
    // One front door for every map's walkable area: beach, pier deck,
    // cave room, isle sand + isle pier. Knockbacks and teleports all end
    // up here, so the player can never be left standing on water.
    clampPlayer(state) {
        try {
            const p = state.player;
            if (!p) return;
            // The ferry owns your legs while it sails — no clamping mid-ride.
            if (this.boatRiding(state)) return;
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            const rad = (p.radius || 16);
            if (p.inCave && typeof Ritual !== 'undefined' && Ritual.caveCollide) {
                try {
                    if (p.inVoidTemple && Ritual.voidTempleCollide) Ritual.voidTempleCollide(state);
                    else Ritual.caveCollide(state);
                } catch (e) {}
                return;
            }
            if (p.onIsland) { this.collide(state); return; }
            const b = (this.bridgeDef) ? this.bridgeDef(state) : null;
            const half = b ? (b.half + rad) : 0;
            const inBand = b ? Math.abs(p.y - b.y) <= half + 10 : false;
            const maxX = (b && inBand) ? b.x1 + rad : (state.waterBoundaryX || 600) - rad;
            p.x = Utils.clamp(p.x, B.MIN_X + rad, maxX);
            if (b && p.x > (state.waterBoundaryX || 600) - rad) {
                // Past the surf you MUST be on the deck band (no nudging
                // off the side over open water).
                p.y = Utils.clamp(p.y, b.y - half, b.y + half);
            } else {
                p.y = Utils.clamp(p.y, B.MIN_Y + rad, B.MAX_Y - rad);
            }
        } catch (e) {}
    },

    // Map-aware clamp for NON-player entities (beached monsters, loot,
    // knockbacks, blink repositions): mainland surf bounds used to yank
    // everything to x<=wb on the isles — the "beached fish turns invisible
    // and teleports to the mainland" bug. Decks keep their deck.
    clampEntity(state, o, size) {
        try {
            if (!o) return o;
            const s = size || 16;
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            // Swim-in arrivals glide through the water (see Ritual.spawnBoss)
            // — land bounds only grab them once the glide completes.
            if (o._swimIn) {
                o.x = Utils.clamp(o.x, (state.waterBoundaryX || 600) + 15, B.MAX_X - 30);
                o.y = Utils.clamp(o.y, B.MIN_Y + 30, B.MAX_Y - 30);
                return o;
            }
            const isl = this.islandOf(state);
            if (isl) {
                const r = isl.room;
                o.x = Utils.clamp(o.x, r.x0 + s, r.x1 - s);
                o.y = Utils.clamp(o.y, r.y0 + s, r.y1 - s);
                return o;
            }
            if (this.onBridge && this.bridgeDef && this.onBridge(state, o.x, o.y)) {
                const b = this.bridgeDef(state);
                o.x = Utils.clamp(o.x, b.x0 - s, b.x1 + s);
                o.y = Utils.clamp(o.y, b.y - b.half - s, b.y + b.half + s);
                return o;
            }
            o.x = Utils.clamp(o.x, B.MIN_X + s, (state.waterBoundaryX || 600) - s);
            o.y = Utils.clamp(o.y, B.MIN_Y + s, B.MAX_Y - s);
            return o;
        } catch (e) { return o; }
    },

    // Map-aware out-of-bounds for enemy projectiles (same bug family:
    // island shots died instantly past B.MAX_X, so isle monsters and
    // hooked-fish skills shot blanks).
    bulletBounds(state) {
        try {
            const isl = this.islandOf(state);
            if (isl) {
                const r = isl.room;
                return { x0: r.x0 - 40, x1: r.x1 + 40, y0: r.y0 - 40, y1: r.y1 + 40 };
            }
        } catch (e) {}
        const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
        return { x0: B.MIN_X, x1: B.MAX_X, y0: B.MIN_Y, y1: B.MAX_Y };
    },

    // ---------- collision for island rooms ----------
    // Walkable = sand square + pier deck. Lakes slide you back out along
    // the shallowest axis (capped per frame — walking a shoreline slides,
    // a deep knockback eases out over frames, nothing teleports = no fling).
    // The open sea around the square is NOT walkable (fish it, don't swim).
    // Push loot/entities out of lagoons (full resolve — placement, no motion
    // feel). cap <= 0 means no cap.
    pushOutOfLakes(state, x, y, pad, cap) {
        try {
            const waters = this.islandWaters(state);
            if (!waters.length) return { x, y };
            for (const w of waters) {
                const cr = w.cr || 40;
                const d = this._rbox(x - w.cx, y - w.cy, w.hw, w.hh, cr);
                if (d < pad) {
                    const n = this._rboxN(x - w.cx, y - w.cy, w.hw, w.hh, cr);
                    let push = (pad - d);
                    if (cap > 0) push = Math.min(push, cap);
                    x += n.x * push;
                    y += n.y * push;
                }
            }
            return { x, y };
        } catch (e) { return { x, y }; }
    },

    collide(state) {
        try {
            const isl = this.islandOf(state);
            if (!isl) return false;
            const p = state.player;
            const r = isl.room;
            const c = this.islandCenter(state);
            const H = this.sandHalf(), CR = this.sandCorner();
            const rad = (p.radius || 16) + 6;
            const pier = this.islandPier(state);
            // Failsafe: never leave the room.
            p.x = Math.max(r.x0 + 30, Math.min(r.x1 - 30, p.x));
            p.y = Math.max(r.y0 + 30, Math.min(r.y1 - 30, p.y));
            // Lakes are water: slide back out to the sand (capped — no fling).
            if (c) {
                const out = this.pushOutOfLakes(state, p.x, p.y, rad + 2, 48);
                p.x = out.x; p.y = out.y;
            }
            // On the pier deck? Clamp to it.
            if (pier && p.x >= pier.x0 - rad && p.x <= pier.x1 + rad &&
                Math.abs(p.y - pier.y) <= pier.half + rad + 12) {
                p.x = Math.max(pier.x0 - rad, Math.min(pier.x1 + rad, p.x));
                p.y = Math.max(pier.y - pier.half - rad, Math.min(pier.y + pier.half + rad, p.y));
                return true;
            }
            // Otherwise you belong on the sand square — ease back to its
            // edge (capped like the lakes: no cross-map yanks).
            if (c) {
                const d = this.sandSDF(state, p.x, p.y);
                if (d > -rad) {
                    const n = this._rboxN(p.x - c.cx, p.y - c.cy, H, H, CR);
                    const pull = Math.min(d + rad, 48);
                    p.x -= n.x * pull;
                    p.y -= n.y * pull;
                }
            }
            return true;
        } catch (e) { return false; }
    },

    // Compat: the single central lagoon (first water). Prefer islandWaters.
    lagoon(state) {
        try {
            const ws = this.islandWaters(state);
            if (ws && ws.length) {
                const w = ws[0];
                return { cx: w.cx, cy: w.cy, rx: w.hw, ry: w.hh, hw: w.hw, hh: w.hh, cr: w.cr };
            }
            return null;
        } catch (e) { return null; }
    },

    // Spawn camp: the beach umbrella you washed up under + the fish-radar
    // board beside it (E to open the bite forecast). Decor only — the
    // radar entry lives in Input.interact.
    SPAWN_UMBRELLA: { x: 238, y: 348 },
    drawSpawnCamp(state, ctx) {
        try {
            if (!state || !state.player) return;
            if (state.player.inCave || state.player.onIsland) return;
            const u = this.SPAWN_UMBRELLA;
            const cam = state.camera;
            if (cam && Math.hypot(cam.x - u.x, cam.y - u.y) > 1400) return;
            const t = state.time || 0;
            // sand patch
            ctx.fillStyle = 'rgba(230,189,130,0.5)';
            ctx.beginPath(); ctx.ellipse(u.x + 60, u.y + 10, 130, 34, 0, 0, Math.PI * 2); ctx.fill();
            // Beach umbrella REMODEL: tilted bamboo pole, big 10-panel
            // canopy with scalloped valance + stitched shading, brass
            // finial, guy-rope, striped towel and a cooler box. Sways
            // gently in the sea breeze (t-driven, decor only).
            const sway = Math.sin(t * 0.9) * 0.022;
            const tilt = 0.16 + sway;
            const px = u.x, py = u.y;
            const topX = px + Math.sin(tilt) * 84, topY = py - Math.cos(tilt) * 84;
            ctx.save();
            // shadow
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.beginPath(); ctx.ellipse(px + 14, py + 4, 66, 14, 0, 0, Math.PI * 2); ctx.fill();
            // pole (bamboo segments)
            ctx.strokeStyle = '#8a5a2b';
            ctx.lineWidth = 7;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(px, py + 2); ctx.lineTo(topX, topY); ctx.stroke();
            ctx.strokeStyle = 'rgba(60,36,12,0.55)';
            ctx.lineWidth = 1.5;
            for (let s = 1; s <= 4; s++) {
                const bx = px + (topX - px) * (s / 5), by = py + 2 + (topY - py - 2) * (s / 5);
                ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx + 3, by); ctx.stroke();
            }
            // guy-rope to a sand peg
            ctx.strokeStyle = 'rgba(226,232,240,0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(topX - 8, topY + 6); ctx.lineTo(px - 66, py + 2); ctx.stroke();
            ctx.fillStyle = '#475569';
            ctx.fillRect(px - 69, py - 2, 6, 8);
            // canopy: 10 alternating panels fanning from the crown
            const R = 62;
            const cols = ['#0ea5e9', '#f8fafc'];
            for (let i = 0; i < 10; i++) {
                const a0 = Math.PI + (i / 10) * Math.PI + tilt * 0.4;
                const a1 = Math.PI + ((i + 1) / 10) * Math.PI + tilt * 0.4;
                const grad = ctx.createRadialGradient(topX, topY, 6, topX, topY, R);
                const base = cols[i % 2];
                grad.addColorStop(0, base);
                grad.addColorStop(1, i % 2 ? '#94a3b8' : '#0369a1');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(topX, topY);
                ctx.arc(topX, topY, R, a0, a1);
                ctx.closePath(); ctx.fill();
                // rib
                ctx.strokeStyle = 'rgba(15,23,42,0.35)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(topX, topY);
                ctx.lineTo(topX + Math.cos(a1) * R, topY + Math.sin(a1) * R);
                ctx.stroke();
            }
            // scalloped valance hanging off the rim
            ctx.fillStyle = 'rgba(248,250,252,0.9)';
            for (let i = 0; i < 10; i++) {
                const a = Math.PI + ((i + 0.5) / 10) * Math.PI + tilt * 0.4;
                const vx = topX + Math.cos(a) * R, vy = topY + Math.sin(a) * R;
                ctx.beginPath(); ctx.arc(vx, vy + 4, 7, 0, Math.PI); ctx.fill();
            }
            // canopy crown highlight
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.beginPath(); ctx.ellipse(topX - 16, topY - 30, 18, 8, -0.5, 0, Math.PI * 2); ctx.fill();
            // brass finial ball + spike
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(topX, topY - 4, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#b45309';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(topX, topY - 10); ctx.lineTo(topX, topY - 20); ctx.stroke();
            ctx.restore();
            // striped towel
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(u.x + 28, u.y - 6, 48, 14);
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(u.x + 28, u.y - 6, 48, 4);
            ctx.fillStyle = '#f472b6';
            ctx.fillRect(u.x + 28, u.y + 4, 48, 3);
            // cooler box
            ctx.fillStyle = '#f97316';
            ctx.fillRect(u.x - 52, u.y - 14, 26, 18);
            ctx.fillStyle = '#fed7aa';
            ctx.fillRect(u.x - 52, u.y - 14, 26, 5);
            ctx.strokeStyle = '#7c2d12';
            ctx.lineWidth = 2;
            ctx.strokeRect(u.x - 52, u.y - 14, 26, 18);
            // radar board: posts + panel + sonar screen
            const r = (typeof FishRadar !== 'undefined' && FishRadar.pos) ? FishRadar.pos() : { x: 390, y: 290 };
            ctx.fillStyle = '#5b4227';
            ctx.fillRect(r.x - 34, r.y - 6, 8, 46);
            ctx.fillRect(r.x + 26, r.y - 6, 8, 46);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(r.x - 44, r.y - 66, 88, 62);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.strokeRect(r.x - 44, r.y - 66, 88, 62);
            ctx.fillStyle = '#04121f';
            ctx.fillRect(r.x - 38, r.y - 60, 76, 34);
            // sonar sweep + blips
            ctx.strokeStyle = '#22ff88';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x <= 76; x += 4) {
                const y = Math.sin(x * 0.15 + t * 3) * 8 * Math.sin(x * 0.05 - t * 1.2);
                if (x === 0) ctx.moveTo(r.x - 38 + x, r.y - 43 + y);
                else ctx.lineTo(r.x - 38 + x, r.y - 43 + y);
            }
            ctx.stroke();
            const blink = (Math.floor(t * 1.5) % 2) === 0;
            ctx.fillStyle = blink ? '#fde047' : '#92610a';
            ctx.beginPath(); ctx.arc(r.x + 28, r.y - 52, 3.5, 0, Math.PI * 2); ctx.fill();
            // labels
            ctx.textAlign = 'center';
            ctx.font = 'black 13px Work Sans';
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText('📡 RADAR', r.x, r.y + 58);
            ctx.fillStyle = '#7dd3fc';
            ctx.fillText('📡 RADAR', r.x, r.y + 58);
            try {
                if (typeof FishRadar !== 'undefined' && FishRadar.near && FishRadar.near(state)) {
                    const bob = Math.sin(t * 4) * 3;
                    ctx.font = 'black 15px Work Sans';
                    ctx.lineWidth = 4;
                    ctx.strokeText('ⓔ', r.x, r.y - 78 + bob);
                    ctx.fillStyle = '#fef08a';
                    ctx.fillText('ⓔ', r.x, r.y - 78 + bob);
                }
            } catch (e) {}
        } catch (e) {}
    },

    // ---------- rendering ----------
    drawUnder(state, ctx) {
        try {
            if (this.islandOf(state)) return; // island draws its own base
            this.drawPier(state, ctx);
        } catch (e) {}
    },

    // Mainland pier. No zone orbs/names here anymore — the WATER COLOR
    // itself tells the tiers apart (light shallow -> dark deep).
    drawPier(state, ctx) {
        const b = this.bridgeDef(state);
        ctx.save();
        // pilings
        ctx.fillStyle = '#4a3525';
        for (let x = b.x0 + 30; x <= b.x1; x += 90) {
            for (const dy of [-b.half + 8, b.half - 8]) {
                ctx.beginPath();
                ctx.arc(x, b.y + dy, 9, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
        // deck
        const deck = ctx.createLinearGradient(0, b.y - b.half, 0, b.y + b.half);
        deck.addColorStop(0, '#8a6a42');
        deck.addColorStop(0.5, '#a97e4f');
        deck.addColorStop(1, '#7a5a36');
        ctx.fillStyle = deck;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(b.x0, b.y - b.half, b.x1 - b.x0, b.half * 2, 10);
        else ctx.rect(b.x0, b.y - b.half, b.x1 - b.x0, b.half * 2);
        ctx.fill();
        ctx.strokeStyle = '#3f2d1d';
        ctx.lineWidth = 4;
        ctx.stroke();
        // planks
        ctx.strokeStyle = 'rgba(63,45,29,0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = b.x0 + 14; x < b.x1; x += 26) {
            ctx.moveTo(x, b.y - b.half + 6);
            ctx.lineTo(x, b.y + b.half - 6);
        }
        ctx.stroke();
        // rails
        ctx.strokeStyle = '#5b4227';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(b.x0, b.y - b.half - 2);
        ctx.lineTo(b.x1, b.y - b.half - 2);
        ctx.moveTo(b.x0, b.y + b.half + 2);
        ctx.lineTo(b.x1, b.y + b.half + 2);
        ctx.stroke();
        // Rope lantern posts along the deck (warm light dots at night).
        for (let x = b.x0 + 60; x <= b.x1 - 20; x += 150) {
            for (const dy of [-b.half - 2, b.half + 2]) {
                ctx.fillStyle = '#3f2d1d';
                ctx.fillRect(x - 3, b.y + dy - 26, 6, 26);
                ctx.fillStyle = '#fde68a';
                ctx.beginPath(); ctx.arc(x, b.y + dy - 30, 6, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(253,230,138,0.25)';
                ctx.beginPath(); ctx.arc(x, b.y + dy - 30, 13, 0, Math.PI * 2); ctx.fill();
            }
        }
        // rope swag between posts
        ctx.strokeStyle = 'rgba(217,180,120,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let x = b.x0 + 60; x <= b.x1 - 170; x += 150) {
            ctx.moveTo(x, b.y - b.half - 28);
            ctx.quadraticCurveTo(x + 75, b.y - b.half - 14, x + 150, b.y - b.half - 28);
            ctx.moveTo(x, b.y + b.half + 28);
            ctx.quadraticCurveTo(x + 75, b.y + b.half + 14, x + 150, b.y + b.half + 28);
        }
        ctx.stroke();
        // boat at the pier end
        const s = this.boatSpot(state);
        const near = Math.hypot(state.player.x - s.x, state.player.y - s.y) < 150;
        ctx.translate(s.x, s.y + 64);
        ctx.fillStyle = '#7c2d12';
        ctx.beginPath();
        ctx.moveTo(-42, 0); ctx.lineTo(42, 0); ctx.lineTo(26, 22); ctx.lineTo(-26, 22);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#431407'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -44); ctx.stroke();
        ctx.fillStyle = near ? '#fef3c7' : '#e7e5e4';
        ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(30, -6); ctx.lineTo(0, -6); ctx.closePath(); ctx.fill();
        ctx.font = 'bold 12px Work Sans';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        const label = near ? '⛵ E: FERRY' : '⛵ FERRY';
        ctx.strokeText(label, 0, 44);
        ctx.fillStyle = near ? '#fef08a' : '#e7e5e4';
        ctx.fillText(label, 0, 44);
        // Circled-E badge above the mast when in range (radar style).
        if (near) {
            const bob = Math.sin((state.time || 0) * 4) * 3;
            ctx.font = 'black 17px Work Sans';
            ctx.lineWidth = 4;
            ctx.strokeText('ⓔ', 0, -58 + bob);
            ctx.fillStyle = '#fef08a';
            ctx.fillText('ⓔ', 0, -58 + bob);
        }
        ctx.restore();
    },

    // ONE sea asset for mainland + isles: same stops everywhere, so the
    // ocean reads as a single body of water (the "background sea" is
    // literally shared). Mainland tiers remap the same hues by distance;
    // isles wash shallow→deep outward from the sand square.
    SEA_STOPS: [[0, '#1093b8'], [0.35, '#0c6e94'], [0.7, '#075985'], [1, '#041f33']],

    paintSeaBase(ctx, x0, y0, w, h, vertical, stops) {
        try {
            const g = vertical ? ctx.createLinearGradient(0, y0, 0, y0 + h)
                : ctx.createLinearGradient(x0, 0, x0 + w, 0);
            for (const [o, col] of (stops || this.SEA_STOPS)) g.addColorStop(o, col);
            ctx.fillStyle = g;
            ctx.fillRect(x0, y0, w, h);
        } catch (e) {}
    },

    // Rounded-rect path (manual arcs — works where ctx.roundRect doesn't).
    _rr(ctx, x0, y0, x1, y1, cr) {
        const r = Math.max(1, Math.min(cr, (x1 - x0) / 2, (y1 - y0) / 2));
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.lineTo(x1 - r, y0);
        ctx.arcTo(x1, y0, x1, y0 + r, r);
        ctx.lineTo(x1, y1 - r);
        ctx.arcTo(x1, y1, x1 - r, y1, r);
        ctx.lineTo(x0 + r, y1);
        ctx.arcTo(x0, y1, x0, y1 - r, r);
        ctx.lineTo(x0, y0 + r);
        ctx.arcTo(x0, y0, x0 + r, y0, r);
        ctx.closePath();
    },

    // Static island gradients (sea / shallow / sand / lakes) never change
    // per island — build once per canvas, not 60×/sec. Gradient
    // construction walks color stops on the CPU; on software renderers
    // that was the hottest per-frame cost of the whole island scene.
    _isleGrads(ctx, isl, c, H, waters) {
        try {
            const key = isl.id + ':sq1:' + H + ':' + waters.length;
            if (!this._gradCache) this._gradCache = {};
            const hit = this._gradCache[key];
            if (hit && hit.ctx === ctx) return hit.g;
            const r = isl.room;
            const sea = ctx.createLinearGradient(0, r.y0, 0, r.y1);
            for (const [o, col] of this.SEA_STOPS) sea.addColorStop(o, col);
            const shal = ctx.createRadialGradient(c.cx, c.cy, H, c.cx, c.cy, H + 260);
            shal.addColorStop(0, 'rgba(45,212,191,0.20)');
            shal.addColorStop(1, 'rgba(45,212,191,0)');
            const GR = H * 1.42;
            const sand = ctx.createRadialGradient(c.cx, c.cy, 10, c.cx, c.cy, GR);
            sand.addColorStop(0, '#e6bd82');
            sand.addColorStop(0.6, '#c99b63');
            sand.addColorStop(1, '#8a6a42');
            const lakes = waters.map(w => {
                const lg = ctx.createRadialGradient(w.cx, w.cy, 6, w.cx, w.cy, Math.max(w.hw, w.hh));
                lg.addColorStop(0, '#134e4a');
                lg.addColorStop(0.55, '#0d9488');
                lg.addColorStop(0.85, '#2dd4bf');
                lg.addColorStop(1, '#5eead4');
                return lg;
            });
            const g = { sea, shal, sand, lakes };
            this._gradCache = {};
            this._gradCache[key] = { ctx, g };
            return g;
        } catch (e) { return null; }
    },

    drawIslandBase(state, ctx) {
        const isl = this.islandOf(state);
        if (!isl) return;
        const r = isl.room;
        const t = state.time || 0;
        const c = this.islandCenter(state) || { cx: (r.x0 + r.x1) / 2, cy: (r.y0 + r.y1) / 2 };
        const H = this.sandHalf(), CR = this.sandCorner();
        // Hoisted once per frame: every clear/lake test below reuses these
        // instead of rebuilding the water list 30+ times.
        const waters = this.islandWaters(state);
        const G = this._isleGrads(ctx, isl, c, H, waters);
        // View rect (world coords): scatter outside it is skipped — same
        // look, far fewer canvas ops when zoomed in.
        let vx0 = -1e9, vy0 = -1e9, vx1 = 1e9, vy1 = 1e9;
        try {
            const cam = state.camera, cv = ctx.canvas;
            if (cam && cv && cam.zoom > 0) {
                const hw = cv.width / cam.zoom / 2 + 60, hh = cv.height / cam.zoom / 2 + 60;
                vx0 = cam.x - hw; vx1 = cam.x + hw;
                vy0 = cam.y - hh; vy1 = cam.y + hh;
            }
        } catch (e) {}
        const inView = (x, y, m) => (x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m);
        // Surrounding sea — the SHARED asset (same stops as mainland).
        if (G) { ctx.fillStyle = G.sea; }
        else {
            const sea = ctx.createLinearGradient(0, r.y0, 0, r.y1);
            for (const [o, col] of this.SEA_STOPS) sea.addColorStop(o, col);
            ctx.fillStyle = sea;
        }
        ctx.fillRect(r.x0 - 400, r.y0 - 400, (r.x1 - r.x0) + 800, (r.y1 - r.y0) + 800);
        // Shallow tint wash hugging the sand (shore water looks lighter).
        ctx.fillStyle = (G && G.shal) || 'rgba(45,212,191,0.10)';
        this._rr(ctx, c.cx - H - 260, c.cy - H - 260, c.cx + H + 260, c.cy + H + 260, CR + 200);
        ctx.fill();
        // Reef rocks: jittered along the square perimeter (broken ring, not
        // a necklace). Clamped inside the room so rocks never sit past the
        // sea fill.
        const seed = this._isleSeed(state);
        const PER = 8 * H;
        for (let i = 0; i < 26; i++) {
            const h1 = this._hashN(seed + i * 7 + 1), h2 = this._hashN(seed + i * 7 + 2);
            const h3 = this._hashN(seed + i * 7 + 3), h4 = this._hashN(seed + i * 7 + 4);
            let u = ((i + 0.13 + (h1 - 0.5) * 0.8) / 26) * PER;
            u = ((u % PER) + PER) % PER;
            const side = Math.floor(u / (PER / 4)) % 4;
            const along = (u % (PER / 4)) / (PER / 4) * 2 * H - H;
            const off = 60 + h2 * 130;
            let rx = c.cx, ry = c.cy;
            if (side === 0) { rx = c.cx + along; ry = c.cy - H - off; }
            else if (side === 1) { rx = c.cx + H + off; ry = c.cy + along; }
            else if (side === 2) { rx = c.cx - along; ry = c.cy + H + off; }
            else { rx = c.cx - H - off; ry = c.cy - along; }
            // Keep inside the room (sea fill ends at room±400, fish at ±30).
            rx = Math.max(r.x0 + 60, Math.min(r.x1 - 60, rx));
            ry = Math.max(r.y0 + 60, Math.min(r.y1 - 60, ry));
            const rs = 10 + h3 * 26;
            if (!inView(rx, ry, rs + 8)) continue;
            ctx.fillStyle = i % 2 ? 'rgba(12,60,80,0.85)' : 'rgba(8,45,62,0.9)';
            ctx.beginPath(); ctx.ellipse(rx, ry, rs, rs * (0.45 + h4 * 0.35), h1 * 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(45,212,191,0.25)';
            ctx.beginPath(); ctx.ellipse(rx - rs * 0.2, ry - rs * 0.25, rs * 0.45, rs * 0.22, 0, 0, Math.PI * 2); ctx.fill();
        }
        // Shore band: the LAND_M square past the sand edge renders as wet
        // sand — beaching / loot logic keys off it, so the border you SEE
        // is the border that COUNTS.
        const LAND_BAND = this.LAND_M || 30;
        ctx.strokeStyle = 'rgba(160,118,72,0.85)';
        ctx.lineWidth = LAND_BAND * 2;
        this._rr(ctx, c.cx - H - LAND_BAND / 2, c.cy - H - LAND_BAND / 2, c.cx + H + LAND_BAND / 2, c.cy + H + LAND_BAND / 2, CR + LAND_BAND / 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(120,90,60,0.5)';
        ctx.lineWidth = 3;
        this._rr(ctx, c.cx - H - LAND_BAND, c.cy - H - LAND_BAND, c.cx + H + LAND_BAND, c.cy + H + LAND_BAND, CR + LAND_BAND);
        ctx.stroke();
        // Animated surf foam: two breathing rounded squares on the band edge.
        for (let k = 0; k < 2; k++) {
            const ph = t * 1.6 + k * Math.PI;
            const e = LAND_BAND + 4 + Math.sin(ph) * 7 + k * 12;
            ctx.strokeStyle = k ? 'rgba(255,255,255,0.35)' : 'rgba(224,242,254,0.55)';
            ctx.lineWidth = k ? 3 : 6;
            this._rr(ctx, c.cx - H - e, c.cy - H - e, c.cx + H + e, c.cy + H + e, CR + e);
            ctx.stroke();
        }
        // Sea sparkle: seeded points in the room, kept off the sand square.
        ctx.fillStyle = 'rgba(186,230,253,0.5)';
        for (let i = 0; i < 40; i++) {
            const h1 = this._hashN(seed + 2000 + i * 3 + 1), h2 = this._hashN(seed + 2000 + i * 3 + 2);
            const rx0 = r.x0 + 40, rx1 = r.x1 - 40, ry0 = r.y0 + 40, ry1 = r.y1 - 40;
            const sx = rx0 + h1 * (rx1 - rx0) + Math.sin(t * 0.4 + i) * 6;
            const sy = ry0 + h2 * (ry1 - ry0) + Math.cos(t * 0.3 + i * 1.3) * 6;
            if (this.sandSDF(state, sx, sy) < LAND_BAND + 30) continue;
            if (!inView(sx, sy, 4)) continue;
            const tw = 1 + Math.sin(t * 3 + i * 1.7) * 1;
            if (tw > 1.2) ctx.fillRect(sx, sy, 2.4, 2.4);
        }
        // sand square (rounded corners)
        ctx.fillStyle = G ? G.sand : '#c99b63';
        if (!G) {
            const sand = ctx.createRadialGradient(c.cx, c.cy, 10, c.cx, c.cy, H * 1.42);
            sand.addColorStop(0, '#e6bd82');
            sand.addColorStop(0.6, '#c99b63');
            sand.addColorStop(1, '#8a6a42');
            ctx.fillStyle = sand;
        }
        this._rr(ctx, c.cx - H, c.cy - H, c.cx + H, c.cy + H, CR);
        ctx.fill();
        // Sand texture: speckles (uniform square scatter) + soft dune bars.
        for (let i = 0; i < 160; i++) {
            const h1 = this._hashN(seed + 3000 + i * 2 + 1), h2 = this._hashN(seed + 3000 + i * 2 + 2);
            const sx = c.cx + (h1 * 2 - 1) * (H - 30);
            const sy = c.cy + (h2 * 2 - 1) * (H - 30);
            if (!inView(sx, sy, 4)) continue;
            ctx.fillStyle = i % 3 ? 'rgba(138,106,66,0.35)' : 'rgba(255,240,210,0.4)';
            ctx.fillRect(sx, sy, 2.5, 2.5);
        }
        ctx.strokeStyle = 'rgba(138,106,66,0.30)';
        ctx.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
            const ins = H * (0.2 + k * 0.15);
            this._rr(ctx, c.cx - ins, c.cy - ins * 0.9, c.cx + ins, c.cy + ins * 0.9, Math.max(20, CR * (0.5 + k * 0.1)));
            ctx.stroke();
        }
        // wet sand rim (inner edge)
        ctx.strokeStyle = 'rgba(120,90,60,0.8)';
        ctx.lineWidth = 10;
        this._rr(ctx, c.cx - H + 2, c.cy - H + 2, c.cx + H - 2, c.cy + H - 2, CR);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,250,235,0.55)';
        ctx.lineWidth = 3;
        this._rr(ctx, c.cx - H - 2 - Math.sin(t * 1.6) * 3, c.cy - H - 2 - Math.sin(t * 1.6) * 3,
            c.cx + H + 2 + Math.sin(t * 1.6) * 3, c.cy + H + 2 + Math.sin(t * 1.6) * 3, CR + 2);
        ctx.stroke();
        // inland waters — LAGOON green rounded rects, never sea blue.
        // Sandy rim under the white lip sells the shoreline.
        for (let wi = 0; wi < waters.length; wi++) {
            const w = waters[wi];
            const wcr = w.cr || 40;
            ctx.fillStyle = 'rgba(214,178,128,0.9)';
            this._rr(ctx, w.cx - w.hw - 12, w.cy - w.hh - 12, w.cx + w.hw + 12, w.cy + w.hh + 12, wcr + 12);
            ctx.fill();
            ctx.fillStyle = (G && G.lakes && G.lakes[wi]) || '#0d9488';
            this._rr(ctx, w.cx - w.hw, w.cy - w.hh, w.cx + w.hw, w.cy + w.hh, wcr);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 3;
            this._rr(ctx, w.cx - w.hw, w.cy - w.hh, w.cx + w.hw, w.cy + w.hh, wcr);
            ctx.stroke();
            ctx.fillStyle = 'rgba(240,253,250,0.7)';
            for (let i = 0; i < 10; i++) {
                const h1 = this._hashN(seed + 4000 + wi * 20 + i * 2 + 1);
                const h2 = this._hashN(seed + 4000 + wi * 20 + i * 2 + 2);
                const gx = w.cx + (h1 * 2 - 1) * w.hw * 0.8 + Math.sin(t * 0.8 + i) * 4;
                const gy = w.cy + (h2 * 2 - 1) * w.hh * 0.8 + Math.cos(t * 0.7 + i * 1.3) * 4;
                if (!inView(gx, gy, 4)) continue;
                ctx.fillRect(gx, gy, 2, 2);
            }
        }
        // Vegetation + rocks: seeded UNIFORM square scatter — a grown
        // shore, not a planted row. Palms lean, fronds vary; rocks + grass
        // tufts fill the gaps. Everything keeps clear of lakes (rounded
        // rects) and the east pier lane (rect, not angle).
        const pier = this.islandPier(state);
        const clearOf = (px, py, pad) => {
            if (pier && px > pier.x0 - 70 && Math.abs(py - pier.y) < pier.half + 70) return false;
            for (const w of waters) {
                if (this._rbox(px - w.cx, py - w.cy, w.hw + pad, w.hh + pad, (w.cr || 40) + pad) < 0) return false;
            }
            return true;
        };
        const sqScatter = (h1, h2, inset) => ({
            x: c.cx + (h1 * 2 - 1) * (H - inset),
            y: c.cy + (h2 * 2 - 1) * (H - inset),
        });
        for (let i = 0; i < 9; i++) {
            const h1 = this._hashN(seed + 500 + i * 5 + 1), h2 = this._hashN(seed + 500 + i * 5 + 2);
            const h3 = this._hashN(seed + 500 + i * 5 + 3), h4 = this._hashN(seed + 500 + i * 5 + 4);
            const sp = sqScatter(h1, h2, 90);
            const px = sp.x, py = sp.y;
            if (!clearOf(px, py, 60)) continue;
            if (!inView(px, py - 20, 55)) continue;
            const lean = (h3 - 0.5) * 10, tall = 24 + h4 * 14;
            const sc = 0.8 + h2 * 0.5;
            ctx.fillStyle = '#78350f';
            ctx.fillRect(px - 3 * sc + lean * 0.4, py - tall, 6 * sc, tall + 2);
            ctx.fillStyle = '#16a34a';
            const fronds = 4 + Math.floor(h3 * 3);
            for (let k = 0; k < fronds; k++) {
                const fa = (k / fronds) * Math.PI * 2 + h1 * 2 + t * 0.1;
                const fl = (13 + h4 * 8) * sc;
                ctx.beginPath();
                ctx.ellipse(px + lean + Math.cos(fa) * fl, py - tall + Math.sin(fa) * fl * 0.5,
                    fl, fl * 0.38, fa, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#713f12';
            ctx.beginPath(); ctx.arc(px + lean, py - tall + 2, 3.4 * sc, 0, Math.PI * 2); ctx.fill();
        }
        // shore rocks: grey, half-buried, random tilt
        for (let i = 0; i < 10; i++) {
            const h1 = this._hashN(seed + 900 + i * 5 + 1), h2 = this._hashN(seed + 900 + i * 5 + 2);
            const h3 = this._hashN(seed + 900 + i * 5 + 3);
            const sp = sqScatter(h1, h2, 50);
            const px = sp.x, py = sp.y;
            const rs = 6 + h3 * 14;
            if (!clearOf(px, py, 40)) continue;
            if (!inView(px, py, rs + 6)) continue;
            ctx.fillStyle = 'rgba(100,116,139,0.95)';
            ctx.beginPath(); ctx.ellipse(px, py, rs, rs * (0.5 + h1 * 0.3), h2 * 3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(203,213,225,0.5)';
            ctx.beginPath(); ctx.ellipse(px - rs * 0.25, py - rs * 0.25, rs * 0.4, rs * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        }
        // grass tufts: 3 blades each, two greens
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 14; i++) {
            const h1 = this._hashN(seed + 1300 + i * 5 + 1), h2 = this._hashN(seed + 1300 + i * 5 + 2);
            const sp = sqScatter(h1, h2, 40);
            const px = sp.x, py = sp.y;
            if (!clearOf(px, py, 30)) continue;
            if (!inView(px, py - 8, 18)) continue;
            ctx.strokeStyle = i % 2 ? '#22c55e' : '#4ade80';
            ctx.beginPath();
            for (let b = -1; b <= 1; b++) {
                const sway = Math.sin(t * 1.3 + i + b) * 2;
                ctx.moveTo(px + b * 4, py);
                ctx.quadraticCurveTo(px + b * 4 + sway, py - 8, px + b * 5 + sway * 1.6, py - 13 - h1 * 5);
            }
            ctx.stroke();
        }
        // VISUAL BORDER: buoy ring on the room edge — the playable water
        // ends here. Red/white, bobbing, with a blinking lamp each 4th.
        // (The room IS the map on isles; past the buoys is off-map void.)
        for (let i = 0; i < 12; i++) {
            const h1 = this._hashN(seed + 5000 + i * 2 + 1);
            const per = 2 * ((r.x1 - r.x0) + (r.y1 - r.y0));
            let u = ((i + h1 * 0.6) / 12) * per;
            u = ((u % per) + per) % per;
            const W2 = (r.x1 - r.x0) / 2 - 70, H2 = (r.y1 - r.y0) / 2 - 70;
            const mcx = (r.x0 + r.x1) / 2, mcy = (r.y0 + r.y1) / 2;
            let bx = mcx, by = mcy;
            if (u < per / 4) { bx = mcx - W2 + (u / (per / 4)) * 2 * W2; by = mcy - H2; }
            else if (u < per / 2) { bx = mcx + W2; by = mcy - H2 + ((u - per / 4) / (per / 4)) * 2 * H2; }
            else if (u < per * 3 / 4) { bx = mcx + W2 - ((u - per / 2) / (per / 4)) * 2 * W2; by = mcy + H2; }
            else { bx = mcx - W2; by = mcy + H2 - ((u - per * 3 / 4) / (per / 4)) * 2 * H2; }
            if (!inView(bx, by, 30)) continue;
            const bob = Math.sin(t * 2 + i * 1.7) * 4;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(bx, by + 12, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath(); ctx.ellipse(bx, by + bob, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#dc2626';
            ctx.beginPath(); ctx.ellipse(bx, by + bob - 2, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#7c2d12';
            ctx.fillRect(bx - 1.5, by + bob - 22, 3, 10);
            if ((i + Math.floor(t * 0.7)) % 4 === 0) {
                ctx.fillStyle = 'rgba(253,224,71,0.9)';
                ctx.beginPath(); ctx.arc(bx, by + bob - 24, 4, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(253,224,71,0.25)';
                ctx.beginPath(); ctx.arc(bx, by + bob - 24, 9, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.fillStyle = '#475569';
                ctx.beginPath(); ctx.arc(bx, by + bob - 24, 3, 0, Math.PI * 2); ctx.fill();
            }
        }
        // isle pier (east) + docked ferry boat
        if (pier) this.drawIslePier(state, ctx, pier);
        // island name banner
        ctx.textAlign = 'center';
        ctx.font = 'black 20px Work Sans';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(`${isl.icon} ${isl.name.toUpperCase()}`, c.cx, r.y0 + 130);
        ctx.fillStyle = isl.color;
        ctx.fillText(`${isl.icon} ${isl.name.toUpperCase()}`, c.cx, r.y0 + 130);
        ctx.font = 'bold 12px Work Sans';
        ctx.lineWidth = 3;
        ctx.strokeText(`watch the sky · events brew here · return ferry is free`, c.cx, r.y0 + 152);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(`watch the sky · events brew here · return ferry is free`, c.cx, r.y0 + 152);
    },

    drawIslePier(state, ctx, pier) {
        const near = Math.hypot(state.player.x - (pier.x1 - 20), state.player.y - pier.y) < 150;
        ctx.save();
        // pilings
        ctx.fillStyle = '#4a3525';
        for (let x = pier.x0 + 24; x <= pier.x1; x += 80) {
            for (const dy of [-pier.half + 7, pier.half - 7]) {
                ctx.beginPath();
                ctx.arc(x, pier.y + dy, 8, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // deck
        const deck = ctx.createLinearGradient(0, pier.y - pier.half, 0, pier.y + pier.half);
        deck.addColorStop(0, '#8a6a42');
        deck.addColorStop(0.5, '#a97e4f');
        deck.addColorStop(1, '#7a5a36');
        ctx.fillStyle = deck;
        ctx.fillRect(pier.x0, pier.y - pier.half, pier.x1 - pier.x0, pier.half * 2);
        ctx.strokeStyle = '#3f2d1d';
        ctx.lineWidth = 4;
        ctx.strokeRect(pier.x0, pier.y - pier.half, pier.x1 - pier.x0, pier.half * 2);
        // docked boat at the pier end
        const bx = pier.x1 - 20, by = pier.y + pier.half + 34;
        ctx.fillStyle = '#7c2d12';
        ctx.beginPath();
        ctx.moveTo(bx - 34, by); ctx.lineTo(bx + 34, by); ctx.lineTo(bx + 20, by + 18); ctx.lineTo(bx - 20, by + 18);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#431407'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = '#78350f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - 36); ctx.stroke();
        ctx.fillStyle = near ? '#fef3c7' : '#e7e5e4';
        ctx.beginPath(); ctx.moveTo(bx, by - 36); ctx.lineTo(bx + 24, by - 4); ctx.lineTo(bx, by - 4); ctx.closePath(); ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px Work Sans';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        const label = near ? '⛵ E: SAIL HOME' : '⛵ DOCK';
        ctx.strokeText(label, bx, by + 38);
        ctx.fillStyle = near ? '#fef08a' : '#e7e5e4';
        ctx.fillText(label, bx, by + 38);
        if (near) {
            const bob = Math.sin((state.time || 0) * 4) * 3;
            ctx.font = 'black 17px Work Sans';
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText('ⓔ', bx, by - 50 + bob);
            ctx.fillStyle = '#fef08a';
            ctx.fillText('ⓔ', bx, by - 50 + bob);
        }
        ctx.restore();
    },

    // Ferry boat under the sailing player (called before drawPlayer).
    drawBoatRide(state, ctx) {
        try {
            if (!this.boatRiding(state)) return;
            const p = state.player;
            ctx.save();
            ctx.translate(p.x, p.y + 10);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(0, 16, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#7c2d12';
            ctx.beginPath();
            ctx.moveTo(-46, 0); ctx.lineTo(46, 0); ctx.lineTo(30, 24); ctx.lineTo(-30, 24);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#431407'; ctx.lineWidth = 3; ctx.stroke();
            ctx.strokeStyle = '#78350f'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(6, -52); ctx.stroke();
            ctx.fillStyle = '#fef3c7';
            ctx.beginPath(); ctx.moveTo(6, -52); ctx.lineTo(40, -8); ctx.lineTo(6, -8); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#431407'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(6, -52); ctx.lineTo(40, -8); ctx.lineTo(6, -8); ctx.closePath(); ctx.stroke();
            ctx.restore();
        } catch (e) {}
    },

    // lighting + weather, screen-space (called AFTER ctx.restore)
    drawScreenFx(state, ctx) {
        try {
            const w = this.ensure(state);
            const cv = ctx.canvas;
            const W = cv.width, H = cv.height;
            // --- day/night lighting (toggleable; time still runs when off) ---
            if (this.dayNightEnabled()) {
                const period = this.periodOf(w.hour);
                let alpha = 0, color = '2,6,23';
                if (period === 'night') alpha = 0.42;
                else if (period === 'dusk') alpha = 0.22;
                else if (period === 'dawn') alpha = 0.10;
                if (w.weather === 'storm') alpha += 0.10;
                else if (w.weather === 'rain') alpha += 0.06;
                else if (w.weather === 'monsoon') alpha += 0.08;
                else if (w.weather === 'aurora') alpha += 0.04;
                else if (w.weather === 'fog') { alpha += 0.06; color = '100,116,139'; }
                else if (w.weather === 'clouds') alpha += 0.05;
                alpha = Math.min(0.62, alpha);
                if (alpha > 0.01) {                    ctx.save();
                    ctx.fillStyle = `rgba(${color},${alpha})`;
                    ctx.fillRect(0, 0, W, H);
                    // warm dusk band / dawn glow
                    if (period === 'dusk') {
                        const g = ctx.createLinearGradient(0, 0, 0, H);
                        g.addColorStop(0, 'rgba(249,115,22,0)');
                        g.addColorStop(1, 'rgba(249,115,22,0.12)');
                        ctx.fillStyle = g;
                        ctx.fillRect(0, 0, W, H);
                    }
                    // moon glow at night
                    if (period === 'night') {
                        ctx.fillStyle = 'rgba(226,232,240,0.9)';
                        ctx.beginPath(); ctx.arc(W - 70, 70, 16, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = 'rgba(226,232,240,0.15)';
                        ctx.beginPath(); ctx.arc(W - 70, 70, 34, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                }
            }
            // --- weather particles (always visual, cheap) ---
            // Bright-storm rule: rain reads bright, lightning hits harder.
            if (w.weather === 'rain' || w.weather === 'storm' || w.weather === 'monsoon') {
                const heavy = w.weather === 'monsoon';
                ctx.save();
                ctx.strokeStyle = w.weather === 'storm' ? 'rgba(186,242,253,0.65)' : heavy ? 'rgba(186,230,253,0.6)' : 'rgba(186,230,253,0.4)';
                ctx.lineWidth = heavy ? 3 : 2;
                const n = w.weather === 'storm' ? 90 : heavy ? 130 : 55;
                const t = (state.time || 0) * 900;
                for (let i = 0; i < n; i++) {
                    const x = ((i * 173.3 + t * 0.3) % (W + 40)) - 20;
                    const y = ((i * 311.7 + t) % (H + 40)) - 20;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x - 6, y + 16);
                    ctx.stroke();
                }
                // lightning
                if ((w.weather === 'storm' || heavy) && Math.random() < (heavy ? 0.02 : 0.012)) w.flashT = 0.18;
                if (w.flashT > 0) {
                    ctx.fillStyle = `rgba(240,249,255,${Math.min(0.65, w.flashT * 2.4)})`;
                    ctx.fillRect(0, 0, W, H);
                }
                ctx.restore();
            } else if (w.weather === 'aurora') {
                // Aurora curtains: bright green/violet bands + starfield.
                ctx.save();
                const t = state.time || 0;
                for (let k = 0; k < 3; k++) {
                    const x0 = W * (0.2 + k * 0.28) + Math.sin(t * 0.5 + k * 2.1) * 40;
                    const g = ctx.createLinearGradient(x0 - 60, 0, x0 + 60, 0);
                    const cols = [['74,222,128', '168,85,247'], ['52,211,153', '129,140,248'], ['110,231,183', '192,132,252']][k];
                    g.addColorStop(0, `rgba(${cols[0]},0)`);
                    g.addColorStop(0.5, `rgba(${cols[0]},0.22)`);
                    g.addColorStop(0.75, `rgba(${cols[1]},0.18)`);
                    g.addColorStop(1, `rgba(${cols[1]},0)`);
                    ctx.fillStyle = g;
                    ctx.fillRect(x0 - 60, 0, 120, H * 0.55);
                }
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                for (let i = 0; i < 40; i++) {
                    const sx = (i * 197.3) % W, sy = (i * 131.7) % (H * 0.5);
                    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + i));
                    ctx.globalAlpha = tw * 0.7;
                    ctx.fillRect(sx, sy, 2, 2);
                }
                ctx.restore();
            } else if (w.weather === 'fog') {
                ctx.save();
                const t = state.time || 0;
                for (let k = 0; k < 3; k++) {
                    const y = H * (0.25 + k * 0.25) + Math.sin(t * 0.4 + k * 2) * 20;
                    const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
                    g.addColorStop(0, 'rgba(148,163,184,0)');
                    g.addColorStop(0.5, 'rgba(148,163,184,0.16)');
                    g.addColorStop(1, 'rgba(148,163,184,0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(0, y - 40, W, 80);
                }
                ctx.restore();
            }
        } catch (e) {}
    },

    // Where beached loot may land: beach sand normally, pier deck when
    // fishing from the bridge, isle sand / isle pier on the isles.
    // (Anything else counts as open water and will sink — see lootSafe.)
    // Keyed on the FISH/loot position (x, y) — never the player's: a fish
    // beached on the deck while you stand on sand still lands on the deck.
    lootClamp(state, x, y) {
        try {
            const p = state.player;
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            const rad = (p.radius || 16) + 4;
            const isl = this.islandOf(state);
            if (isl) {
                const c = this.islandCenter(state);
                const pier = this.islandPier(state);
                if (pier && this.onIslandPier(state, x, y, this.LAND_M)) {
                    // The fish itself is on the pier: land it on the deck.
                    return {
                        x: Math.max(pier.x0, Math.min(pier.x1, x)),
                        y: Math.max(pier.y - pier.half, Math.min(pier.y + pier.half, y)),
                    };
                }
                // Catcher on the pier + loot in nearby water: deck, not a
                // teleport onto the far side of the disc.
                try {
                    if (pier && state.player &&
                        this.onIslandPier(state, state.player.x, state.player.y, 60)) {
                        const nx = Math.max(pier.x0, Math.min(pier.x1, x));
                        const ny = Math.max(pier.y - pier.half, Math.min(pier.y + pier.half, y));
                        if (Math.hypot(x - nx, y - ny) < 300) return { x: nx, y: ny };
                    }
                } catch (e) {}
                if (c) {
                    // Square clamp onto the visible wet-sand band, then out
                    // of any lagoon (loot rests on sand, never mid-lake).
                    const H = this.sandHalf() + this.LAND_M - 12;
                    x = Utils.clamp(x, c.cx - H, c.cx + H);
                    y = Utils.clamp(y, c.cy - H, c.cy + H);
                    const out = this.pushOutOfLakes(state, x, y, 14, 0);
                    return { x: out.x, y: out.y };
                }
                const r = isl.room;
                return {
                    x: Math.max(r.x0 + 100, Math.min(r.x1 - 100, x)),
                    y: Math.max(r.y0 + 100, Math.min(r.y1 - 100, y)),
                };
            }
            if (this.onBridge(state, x, y)) {
                const b = this.bridgeDef(state);
                return {
                    x: Math.max(b.x0, Math.min(b.x1 + 20, x)),
                    y: Math.max(b.y - 46, Math.min(b.y + 46, y)),
                };
            }
            // Catcher on deck + loot in nearby water: land it on the deck,
            // never across the map on the far sand (the old teleport).
            try {
                const b2 = this.bridgeDef(state);
                const pp = state.player;
                if (b2 && pp && !this.islandOf(state) && this.onBridge(state, pp.x, pp.y)) {
                    const nx = Math.max(b2.x0, Math.min(b2.x1 + 20, x));
                    const ny = Math.max(b2.y - 46, Math.min(b2.y + 46, y));
                    if (Math.hypot(x - nx, y - ny) < 320) return { x: nx, y: ny };
                }
            } catch (e) {}
            return {
                x: Math.max(B.MIN_X + rad, Math.min((state.waterBoundaryX || 600) - rad, x)),
                y: Math.max(B.MIN_Y + rad, Math.min(B.MAX_Y - rad, y)),
            };
        } catch (e) { return { x, y }; }
    },

    // ---------- save ----------
    saveExtra(state) {        try {
            const w = this.ensure(state);
            return {
                hour: w.hour, day: w.day, weather: w.weather,
                onIsland: state.player.onIsland || null,
                boatReturn: state.player.boatReturn || null,
            };
        } catch (e) { return {}; }
    },

    loadExtra(state, data) {
        try {
            if (!data) return;
            const w = this.ensure(state);
            if (typeof data.hour === 'number') w.hour = data.hour;
            if (typeof data.day === 'number') w.day = data.day;
            if (typeof data.weather === 'string' && this.WEATHERS.includes(data.weather)) w.weather = data.weather;
            // Never load INTO an island mid-sea without position: restore safely.
            if (typeof data.onIsland === 'string' && this.islandById(data.onIsland)) {
                state.player.onIsland = data.onIsland;
                const ex = this.islandExit(state);
                if (ex) { state.player.x = ex.x - 40; state.player.y = ex.y; }
                else {
                    const isl = this.islandById(data.onIsland);
                    state.player.x = (isl.room.x0 + isl.room.x1) / 2;
                    state.player.y = isl.room.y1 - 160;
                }
                // Re-anchor the island spawn at the dock on load.
                state.player.islandSpawn = { x: state.player.x, y: state.player.y };
                state.player.inCave = false;
            } else {
                state.player.onIsland = null;
            }
            if (data.boatReturn && typeof data.boatReturn.x === 'number') state.player.boatReturn = data.boatReturn;
        } catch (e) {}
    },
};

window.WorldSystem = WorldSystem;
