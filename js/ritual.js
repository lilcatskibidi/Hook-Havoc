/**
 * Ritual + Bait system — boss summoning quests & craftable baits.
 *
 * LOOP:
 *   1. Earn summon ITEMS by fishing/fighting — they drop as physical
 *      loot (with models) and live in the bucket. Keys have sell prices:
 *      sell spares for coins, or 🔒 lock them (shop) to keep them safe
 *      from SELL ALL and ritual/craft spending:
 *      Storm Eggs (Stormcaller/gulls/legendary catches),
 *      Void Shards (void-tainted only), boss trophies (boss kills).
 *   2. Bake a Storm Egg into a Hydra Lure (Shop > Bait tab).
 *   3. Five bosses, five different summons:
 *      Stormcaller = 20 gulls; Priest = Marlin rite; Hydra = hook w/ lure;
 *      Shepherd = 7 shards open a gate at the pad; Emperor = 3 trophies at the pad.
 * Fishing baits (same tab, crafted from catches) buff bites/luck while
 * equipped. Everything here is personal (no MP sync needed).
 */

// ---- Boss keys: each boss wants something DIFFERENT.
//   🥚 Storm Egg  <- Stormcaller kill (always) + seagulls (6%)
//   🔮 Void Shard <- jumping-fish kills (30%)
//   🗝️ Void Key  <- hooked from the sea like a fish (legendary rate)
// Keys are SELLABLE (value below): sell spares for coins, or 🔒 lock them
// in the shop to keep them safe from SELL ALL and ritual spending.
const BOSS_KEYS = {
    storm_egg: { name: 'Storm Egg',  icon: '🥚', color: '#10b981', value: 1200 },
    shard:     { name: 'Void Shard', icon: '🔮', color: '#a855f7', value: 2000 },
    void_key:  { name: 'Void Key',   icon: '🗝️', color: '#22d3ee', value: 5000 },
    heart_sea: { name: 'Heart of the Sea', icon: '💙', color: '#38bdf8', value: 15000 },
    bloodheart:{ name: 'Bloodheart of the Abyss', icon: '❤️‍🔥', color: '#dc2626', value: 30000 },
    priest_core: { name: 'Abyssal Priest Core', icon: '🜂', color: '#7dd3fc', value: 12000 },
};

// ---- Boss trophies: 100% drop from each boss kill. All three trophies
// combined open the way to the Crimson Emperor (endgame gate).
// Sellable like keys — but selling them delays the Emperor.
const TROPHIES = {
    chalice: { name: "Priest's Chalice", icon: '🏆', color: '#0ea5e9', from: 'Leviathan Priest', value: 8000 },
    fang:    { name: 'Hydra Fang',       icon: '🦷', color: '#10b981', from: 'Stormlord Hydra', value: 8000 },
    eye:     { name: "Leviathan's Eye",   icon: '👁️', color: '#a855f7', from: 'Void Leviathan', value: 8000 },
    crown:   { name: "Tidefather Crown",  icon: '👑', color: '#fbbf24', from: 'Leviathan Priest', value: 12000, wild: true },
};

// Boss species id -> trophy id (kill tribute drops). Matches
// Ritual.grantTrophy's map; the combat/fishing kill paths read this.
const TROPHY_OF = {
    leviathan_priest: 'chalice',
    stormlord_hydra: 'fang',
    void_shepherd: 'eye',
};

// ---- Baits are PER-HOOK consumables (no timers): 1 craft = 10 baits,
// 1 hook eats 1 bait. Basic baits are also buyable with coins.
const BAIT_YIELD = 10;
const BAIT_PRICES = { worm: 150, shrimp: 500, chum: 300, blood: 1200, golden: 3000 }; // +10 stock each
const BAITS = [
    { id: 'worm', name: 'Earthworm', icon: 'fa-worm', color: '#a16207',
      desc: 'Classic wriggler. 10% faster bites while stocked.',
      recipe: { tier: 'any', count: 2 },
      biteMult: 0.90, luckBonus: 0, yield: 10 },
    { id: 'shrimp', name: 'Live Shrimp', icon: 'fa-shrimp', color: '#fb7185',
      desc: 'Kickin’ live shrimp. 20% faster bites, +5% luck.',
      recipe: { tier: 'any', count: 2 },
      biteMult: 0.80, luckBonus: 0.05, yield: 10 },
    { id: 'chum', name: 'Chum Mash', icon: 'fa-fish', color: '#94a3b8',
      desc: 'Mashed scraps. 25% faster bites while stocked.',
      recipe: { tier: 'any', count: 3 },
      biteMult: 0.75, luckBonus: 0, yield: 10 },
    { id: 'stink', name: 'Stink Squid', icon: 'fa-wind', color: '#84cc16',
      desc: 'Horrible smell, irresistible. 35% faster bites, no luck.',
      recipe: { tier: 'any', count: 4 },
      biteMult: 0.65, luckBonus: 0, yield: 10 },
    { id: 'blood', name: 'Blood Bait', icon: 'fa-droplet', color: '#ef4444',
      desc: 'Rare blood. +15% luck, 15% faster bites.',
      recipe: { tier: 'rarePlus', count: 3 },
      biteMult: 0.85, luckBonus: 0.15, yield: 10 },
    { id: 'crab', name: 'Crab Legs', icon: 'fa-bug', color: '#f97316',
      desc: 'Crunchy crab legs. +10% luck, 15% faster bites.',
      recipe: { tier: 'rarePlus', count: 2 },
      biteMult: 0.85, luckBonus: 0.10, yield: 10 },
    { id: 'golden', name: 'Golden Lure', icon: 'fa-crown', color: '#fbbf24',
      desc: 'Epic flesh. +30% luck on every hook.',
      recipe: { tier: 'epicPlus', count: 2 },
      biteMult: 0.90, luckBonus: 0.30, yield: 10 },
    { id: 'glow', name: 'Glow Grub', icon: 'fa-lightbulb', color: '#22d3ee',
      desc: 'Bioluminescent grub. +20% luck, 15% faster bites.',
      recipe: { tier: 'epicPlus', count: 2 },
      biteMult: 0.85, luckBonus: 0.20, yield: 10 },
    { id: 'royal', name: "King's Feast", icon: 'fa-gem', color: '#e879f9',
      desc: 'A royal platter. +25% luck, 35% faster bites.',
      recipe: { tier: 'epicPlus', count: 3 },
      biteMult: 0.65, luckBonus: 0.25, yield: 10 },
    { id: 'yolk', name: 'Storm Yolk', icon: 'fa-egg', color: '#34d399',
      desc: 'Baked Storm Egg essence. +35% luck, 20% faster bites.',
      recipe: { key: 'storm_egg', tier: 'legendaryPlus', count: 1 },
      biteMult: 0.80, luckBonus: 0.35, yield: 5 },
    { id: 'abyss', name: 'Abyssal Maw', icon: 'fa-eye', color: '#a855f7',
      desc: 'Void-tainted flesh. +45% luck, 25% faster bites. Hungry stuff.',
      recipe: { key: 'shard', tier: 'epicPlus', count: 2 },
      biteMult: 0.75, luckBonus: 0.45, yield: 5 },
    { id: 'lure_hydra', name: 'Hydra Lure', icon: 'fa-egg', color: '#10b981',
      desc: 'EQUIP as bait: 30% of hooks grab the STORMLORD HYDRA itself. Eaten per hook.',
      recipe: { key: 'storm_egg', tier: 'legendaryPlus', count: 2 }, summon: 'stormlord_hydra',
      hookBait: true, yield: 2 },
    { id: 'bloodheart_lure', name: 'Bloodheart Lure', icon: 'fa-heart', color: '#dc2626',
      desc: 'FORGED, not crafted: 100% of hooks grab the LEVIATHAN PRIEST itself. Eaten per hook.',
      recipe: { key: 'bloodheart', tier: 'legendaryPlus', count: 99 }, summon: 'leviathan_priest',
      hookBait: true, yield: 1 },
    // ---- Event-tide crafts: explicit special-fish + coins recipes ----
    { id: 'stormchum', name: 'Storm Chum', icon: 'fa-cloud-bolt', color: '#38bdf8',
      desc: 'Typhoon-ground mash. +32% luck, 30% faster bites.',
      recipe: { coins: 800, fish: [{ id: 'typhoon_dart', n: 2 }, { id: 'stormpetrel_fish', n: 1 }] },
      biteMult: 0.70, luckBonus: 0.32, yield: 8 },
    { id: 'moonpaste', name: 'Moon Paste', icon: 'fa-moon', color: '#e2e8f0',
      desc: 'Ground under a clear night moon. +40% luck, 20% faster bites.',
      recipe: { coins: 1500, fish: [{ id: 'bloodmoon_raya', n: 1 }, { id: 'bloodfin_tetra', n: 2 }] },
      biteMult: 0.80, luckBonus: 0.40, yield: 6 },
    { id: 'fogmash', name: 'Fog Mash', icon: 'fa-smog', color: '#94a3b8',
      desc: 'Condensed fog bank. +30% luck, 25% faster bites.',
      recipe: { coins: 800, fish: [{ id: 'mistwisp_eel', n: 2 }, { id: 'fog_guppy', n: 3 }] },
      biteMult: 0.75, luckBonus: 0.30, yield: 8 },
    { id: 'dawncry', name: 'Dawn Cry', icon: 'fa-sun', color: '#fdba74',
      desc: 'Bottled first light. +35% luck, 30% faster bites.',
      recipe: { coins: 1200, fish: [{ id: 'dawn_runner', n: 2 }, { id: 'sunfin_tetra', n: 2 }] },
      biteMult: 0.70, luckBonus: 0.35, yield: 8 },
];

// ---- Pad rituals (only Emperor uses the circle directly now).
// Void Leviathan: 7 shards open a VOID GATE at the pad (no direct spawn).
// Enter the gate (E) into the shrine, offer 4 legendaries + 1 void key on
// 5 pillars, then the space gate + boss cinematic begins.
// cost = { shards: n } or { trophies: { id: n } }
const RITUALS = [
    { bossId: 'void_shepherd', cost: { shards: 7 }, intro: 'rise', introDur: 12,
      blurb: 'The abyss takes 7 Void Shards to tear a GATE (no direct spawn). Enter it, feed the 5 shrine pillars, and the Star-Eater comes.' },
    { bossId: 'crimson_emperor', cost: { trophies: { chalice: 1, fang: 1, eye: 1 } }, intro: 'fall', introDur: 10,
      blurb: 'The endgame gate: one trophy from each lesser boss. No fish can buy this.' },
];

// ---- Void shrine offerings: one VOID-mutated fish per rarity tier
// (common / rare / epic / legendary) + 1 void-key center pillar.
// Any species of the right rarity + void mutation feeds its pillar.
const VOID_TEMPLE_OFFERINGS = [
    { slot: 0, rarity: 'common', mutation: 'void' },
    { slot: 1, rarity: 'rare', mutation: 'void' },
    { slot: 2, rarity: 'epic', mutation: 'void' },
    { slot: 3, rarity: 'legendary', mutation: 'void' },
];

// The black book never names species — each pillar gets a riddle.
const VOID_RIDDLES = [
    'the smallest shadow the void ever touched (void-touched common)',
    'a hunter wearing the small dark (void-touched rare)',
    'a terror half-drowned in night (void-touched epic)',
    'a legend the abyss itself keeps (void-touched legendary)',
];
const VOID_BOOK_VERSE = [
    'Four rose where no light swims,',
    'the small, the keen, the dread, the crowned —',
    'each kissed by dark, each glory drowned.',
    'Lay common shadow, rare, then dread,',
    'then legend on the quartz rims.',
    'Then turn the key the sea let fall,',
    'and wake the Eater of them all.',
];

const RITUAL_TIERS = {
    any:            ['common', 'rare', 'epic', 'legendary', 'mythic', 'boss'],
    rarePlus:       ['rare', 'epic', 'legendary', 'mythic', 'boss'],
    epicPlus:       ['epic', 'legendary', 'mythic', 'boss'],
    legendaryPlus:  ['legendary', 'mythic', 'boss'],
};

const Ritual = {
    state: null,
    RADIUS: 110,

    spot(state) {
        // The circle burns deep inside the cave (separate map — E to enter).
        return this.cavePad();
    },

    // The cave is a WHOLE NEW PLACE, not beach decor: a sealed chamber on
    // a far-off map region. E at the beach hole teleports you in/out.
    caveRoom() {
        return { x0: 6000, x1: 7400, y0: 1000, y1: 2000 };
    },

    cavePad() {
        return { x: 6700, y: 1450 };
    },

    caveExit() {
        return { x: 6700, y: 1900 };
    },

    // The hole on the beach — pinned to the SOUTH-WEST corner of the
    // sand (bottom beach corner) so it never drifts into spawn play.
    caveHole(state) {
        const B = CONFIG.WORLD;
        return { x: B.MIN_X + 250, y: B.MAX_Y - 250 };
    },

    runeStones(state) {
        const h = this.caveHole(state);
        return [
            { x: h.x - 110, y: h.y + 155, color: '#38bdf8', n: 1 },
            { x: h.x + 20,  y: h.y + 195, color: '#f59e0b', n: 2 },
            { x: h.x + 150, y: h.y + 155, color: '#a855f7', n: 3 },
        ];
    },

    // Each rune demands a fishing offering (eaten on touch). This is the
    // "harder puzzle" gate: you must FISH before the cave opens.
    //   1: 2x any fish · 2: 2x rare+ · 3: 1x epic+
    RUNE_COSTS: [
        { tier: 'any',       count: 2, label: '🐟×2' },
        { tier: 'rarePlus',  count: 2, label: '💎 rare×2' },
        { tier: 'epicPlus',  count: 1, label: '👑 epic×1' },
    ],

    runeCost(i) {
        return (this.RUNE_COSTS && this.RUNE_COSTS[i]) || null;
    },

    runeHasCost(state, i) {
        const c = this.runeCost(i);
        if (!c) return true;
        try { return this.countTier(state, c.tier) >= c.count; } catch (e) { return false; }
    },

    nearHole(state) {
        const h = this.caveHole(state);
        return Math.hypot(state.player.x - h.x, state.player.y - h.y);
    },

    nearExit(state) {
        const e = this.caveExit();
        return Math.hypot(state.player.x - e.x, state.player.y - e.y);
    },

    canEnter(state) {
        const p = state.player;
        if (p.inCave) return { ok: false, why: 'Already inside.' };
        if (!p.caveUnlocked) return { ok: false, why: 'Sealed! Offer fish at runes 1 → 2 → 3.' };
        try {
            if (this.bossFightActive && this.bossFightActive(state)) {
                return { ok: false, why: 'No hiding from a boss!' };
            }
        } catch (e) {}
        return { ok: true };
    },

    enter(state) {
        const c = this.canEnter(state);
        const p = state.player;
        if (!c.ok) {
            Particles.showFloatingText(state, c.why, p.x, p.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        // Vortex loading screen — the actual position swap happens mid-fade
        // so the pop is hidden behind the swirl (see Teleport.go).
        const dest = this.caveExit();
        Teleport.go(state, {
            title: 'DESCENDING…',
            sub: 'The void pulls you into the Hollow Cave.',
            apply: () => {
                p.returnPos = { x: p.x, y: p.y };
                p.inCave = true;
                p.x = dest.x; p.y = dest.y - 40;
                p.vx = 0; p.vy = 0;
                try {
                    if (state.camera) { state.camera.x = p.x; state.camera.y = p.y; }
                } catch (e) {}
                // Wild things can't follow you through the hole (bosses block entry)
                state.enemies = (state.enemies || []).filter(en => en && en.isBoss);
                state.screenShake = Math.max(state.screenShake || 0, 10);
                UI.updateStatusBanner('You descend into the sealed cave... the circle burns ahead.', 'Cave', 'fuchsia');
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            }
        });
        return true;
    },

    exit(state) {
        const p = state.player;
        if (!p.inCave) return false;
        Teleport.go(state, {
            title: 'RETURNING…',
            sub: 'Daylight pulls you back to the beach.',
            apply: () => {
                const r = p.returnPos;
                const h = this.caveHole(state);
                p.x = (r && typeof r.x === 'number') ? r.x : h.x;
                p.y = (r && typeof r.y === 'number') ? r.y : h.y + 120;
                p.vx = 0; p.vy = 0;
                p.inCave = false;
                try {
                    if (state.camera) { state.camera.x = p.x; state.camera.y = p.y; }
                } catch (e) {}
                UI.updateStatusBanner('Back on the beach. The cave waits.', 'Cave', 'sky');
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            }
        });
        return true;
    },

    // Per-frame: rune touch order + save on unlock. Runes stand on the
    // beach by the hole — nothing to do once inside.
    // Debounced: a touch only counts on ENTERING a stone's radius, and
    // at most once per RUNE_TOUCH_COOLDOWN sec. This stops one stand-still
    // from firing touch 1 -> wrong-order -> 1 -> ... every frame.
    RUNE_TOUCH_RADIUS: 55,
    RUNE_TOUCH_COOLDOWN: 0.9,
    update(state, delta) {
        try {
            // Zone music follows the map (boss theme always wins).
            try {
                if (typeof audio !== 'undefined' && audio.syncZoneMusic && state.player && !state.player.isDead) {
                    const bossOn = !!(typeof Ritual !== 'undefined' && Ritual.bossAlive && Ritual.bossAlive(state));
                    const zone = state.player.inVoidTemple ? 'temple'
                        : state.player.inCave ? 'cave'
                        : state.player.onIsland ? 'isle' : 'tide';
                    audio.syncZoneMusic(zone, bossOn);
                }
            } catch (e) {}
            // Reload safety: an open gate with no birth stamp (fresh
            // session) counts as fully opened — never a rock-like crack.
            try {
                const vt0 = state.player && state.player.voidTemple;
                if (vt0 && vt0.gateOpen && typeof state._voidGateBorn !== 'number') {
                    state._voidGateBorn = (state.time || 0) - 6;
                }
            } catch (e) {}
            // Priest sacrifice cutscene, pause-safe beats:
            //  ~7s merge burst (cover orb + 1.5s flash),
            //  ~8.5s heart reveal, ~15s cleanup.
            if (state._priestRite && !state._priestRite.gone) {
                const prt = state._priestRite;
                const pe = (state.time || 0) - (prt.t0 || 0);
                if (!prt.burst && pe >= 7) {
                    try { this.burstPriestRite(state); } catch (e) {}
                }
                if (prt.burst && !prt.done && pe >= 8.5) {
                    try { this.finishPriestRite(state); } catch (e) {}
                }
                if (prt.done && pe >= 15) {
                    state._priestRite = null;
                }
            }
            // Black book reading: one line fades in, fades out, next.
            // Each floating text lives ~1.2s; a 2.6s beat gives clean gaps.
            if (state._bookRead && !state._bookRead.done) {
                const br = state._bookRead;
                const e = (state.time || 0) - (br.t0 || 0);
                const beat = 2.6;
                const i = Math.floor(e / beat);
                if (e >= 0 && i !== br.idx && i < br.lines.length) {
                    br.idx = i;
                    try {
                        Particles.showFloatingText(state, br.lines[i], state.player.x, state.player.y - 110, i === 0 ? '#e9d5ff' : '#c4b5fd');
                        if (typeof audio !== 'undefined' && audio.playUIHover) audio.playUIHover();
                    } catch (e2) {}
                }
                if (i >= br.lines.length) {
                    br.done = true;
                    try { Particles.showFloatingText(state, '📖 The book falls silent.', state.player.x, state.player.y - 70, '#94a3b8'); } catch (e2) {}
                }
            }
            // Priest bells: 3 deep tolls from the bobber, even and huge.
            if (state._priestBells && !state._priestBells.done) {
                const b = state._priestBells;
                const e = (state.time || 0) - (b.t0 || 0);
                const marks = [6, 8, 10];
                while ((b.rung || 0) < marks.length && e >= marks[b.rung || 0]) {
                    const n = (b.rung || 0) + 1;
                    b.rung = n;
                    try {
                        if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                            Combat.roarShockwave(state, b.x, b.y, { color: '#7dd3fc', rings: 5, maxR: 520, shake: 18, gap: 0.22 });
                        }
                        if (typeof audio !== 'undefined' && audio.playBell) audio.playBell();
                        else if (typeof audio !== 'undefined' && audio.playThunder) audio.playThunder();
                        Particles.showFloatingText(state, `🔔 THE DEEP TOLLS (${n}/3)`, b.x, b.y - 130, '#7dd3fc');
                        state.screenShake = Math.max(state.screenShake || 0, 14);
                    } catch (e2) {}
                }
                if ((b.rung || 0) >= marks.length) b.done = true;
            }
            // Priest tsunami: 5s wall shoving everything toward the beach.
            if (state._priestTsunami && !state._priestTsunami.done) {
                const ts = state._priestTsunami;
                const e2 = (state.time || 0) - (ts.t0 || 0);
                if (e2 >= 5) ts.done = true;
                else {
                    try {
                        const p = state.player;
                        if (p && !p.isDead && !p.inCave && !p.onIsland) {
                            p.x -= 230 * (delta || 0.016);
                            if (typeof WorldSystem !== 'undefined' && WorldSystem.clampPlayer) {
                                try { WorldSystem.clampPlayer(state); } catch (e3) {}
                            }
                        }
                        if (Math.random() < 0.6 && typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                            const wx = ts.x - (e2 / 5) * 700;
                            Particles.spawnWaterSplashes(state, wx + (Math.random() - 0.5) * 200, (ts.y || 1500) + (Math.random() - 0.5) * 300, 6);
                        }
                        state.screenShake = Math.max(state.screenShake || 0, 10);
                    } catch (e3) {}
                }
            }
            // Void black-sea fade-out after the Star-Eater dies (3s back
            // to normal water). Fade-in is instant at spawn.
            if (state._voidBlackFade && state._voidBlackSea > 0) {
                const dt = (typeof delta === 'number' && delta > 0) ? Math.min(delta, 1) : 0.016;
                state._voidBlackSea = Math.max(0, state._voidBlackSea - dt / 3);
                if (state._voidBlackSea <= 0) state._voidBlackFade = 0;
            }
            // Hydra green-sea fade-out (same 3s rule).
            if (state._hydraSeaFade && state._hydraSea > 0) {
                const dt2 = (typeof delta === 'number' && delta > 0) ? Math.min(delta, 1) : 0.016;
                state._hydraSea = Math.max(0, state._hydraSea - dt2 / 3);
                if (state._hydraSea <= 0) state._hydraSeaFade = 0;
            }
            // Cave fog fade (runs both inside + outside so exits fade out).
            const wantFog = !!(state.player && state.player.inCave);
            const curFog = (typeof state._caveFog === 'number') ? state._caveFog : 0;
            state._caveFog = wantFog
                ? Math.min(1, curFog + Math.min(0.1, Math.max(0.008, (delta || 0.016) * 1.5)))
                : Math.max(0, curFog - 0.06);
            const p = state.player;
            if (!p || p.caveUnlocked || p.inCave) return;
            // Cap at 1s (not 0.1s): foreground frames never exceed 0.05s so
            // they behave identically, while 1s background ticks stay exact.
            const dt = (typeof delta === 'number' && delta > 0) ? Math.min(delta, 1.0) : 0.016;
            state._caveTouchCd = Math.max(0, (state._caveTouchCd || 0) - dt);
            const R = this.RUNE_TOUCH_RADIUS;
            const stones = this.runeStones(state);
            let touched = -1;
            for (let i = 0; i < stones.length; i++) {
                const s = stones[i];
                if (Math.hypot(p.x - s.x, p.y - s.y) < R) { touched = i; break; }
            }
            // Outside every stone: re-arm so the NEXT entry counts.
            if (touched < 0) {
                state._caveTouchArmed = true;
                return;
            }
            // Still standing inside, or cooling down: ignore.
            if (!state._caveTouchArmed && state._caveTouchArmed !== undefined) return;
            if (state._caveTouchArmed === undefined) {
                // First run while already standing on a stone: consume it
                // once, then require stepping out before the next touch.
                state._caveTouchArmed = true;
            }
            if (state._caveTouchCd > 0) return;
            const i = touched;
            const s = stones[i];
            let seq = state._caveSeq || 0;
            // Touching a wrong rune first (seq === 0) is a free no-op: don't
            // eat the cooldown or disarm, so the player can slide to rune 1
            // without a penalty pause.
            if (i !== seq && seq === 0) return;
            state._caveTouchArmed = false;
            state._caveTouchCd = this.RUNE_TOUCH_COOLDOWN;
            if (i === seq) {
                // Harder puzzle: the rune eats a fishing offering first.
                const cost = this.runeCost(i);
                if (cost && !this.runeHasCost(state, i)) {
                    state._caveTouchArmed = false;
                    state._caveTouchCd = this.RUNE_TOUCH_COOLDOWN;
                    try { audio.playError(); } catch (e) {}
                    Particles.showFloatingText(state, `Rune ${s.n} hungers: ${cost.label}!`, s.x, s.y - 40, '#f87171');
                    UI.updateStatusBanner(`Rune ${s.n} demands ${cost.label} from your bucket — go fish!`, 'Hungry rune', 'rose');
                    return;
                }
                if (cost) {
                    this.consumeFish(state, cost.tier, cost.count);
                    try { Player.refreshHUD(state); } catch (e) {}
                }
                seq++;
                state._caveSeq = seq;
                try { audio.playUIClick(); } catch (e) {}
                Particles.showFloatingText(state, `Rune ${seq}/3!`, s.x, s.y - 40, s.color);
                if (seq >= stones.length) {
                    p.caveUnlocked = true;
                    state._caveSeq = 0;
                    try { audio.playPortal(); } catch (e) {}
                    state.screenShake = Math.max(state.screenShake || 0, 12);
                    Particles.showFloatingText(state, '🔓 THE CAVE SEAL BREAKS!', p.x, p.y - 70, '#facc15');
                    UI.updateStatusBanner('The runes drink your offerings. The void portal yawns open.', 'Cave Open', 'emerald');
                    if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                }
            } else if (seq > 0) {
                state._caveSeq = 0;
                try { audio.playError(); } catch (e) {}
                Particles.showFloatingText(state, 'Wrong order! The runes go dark...', s.x, s.y - 40, '#f87171');
            }
            // Touching a wrong first rune while seq === 0 was a free no-op
            // above (early return) — no reset spam, no sound spam.
        } catch (e) {}
    },

    // Solid rock pillars inside the chamber (world-anchored). Rendered as
    // boulders in drawCaveInterior, collided in caveCollide.
    cavePillars() {
        const r = this.caveRoom();
        const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
        return [
            { x: cx - 380, y: cy - 180, r: 90 },
            { x: cx + 380, y: cy - 180, r: 90 },
            { x: cx - 380, y: cy + 220, r: 78 },
            { x: cx + 380, y: cy + 220, r: 78 },
            // 5th keeps clear of the void-gate alcove (gate sits at
            // pad.y - 300 straight above the circle).
            { x: cx + 250, y: cy - 250, r: 64 },
        ];
    },

    // Rock-wall collision for the CAVE ROOM (separate map). Thick stone
    // walls + solid pillars. Called from Player.update after world clamp.
    caveCollide(state) {
        try {
            const p = state.player;
            if (!p.inCave) return;
            const r = this.caveRoom();
            const WALL = 70; // walkable inset matches the rendered rock ring
            const rad = (p.radius || 16) + 8;
            p.x = Utils.clamp(p.x, r.x0 + WALL + rad, r.x1 - WALL - rad);
            p.y = Utils.clamp(p.y, r.y0 + WALL + rad, r.y1 - WALL - rad);
            // Push out of each pillar
            const pillars = this.cavePillars();
            for (let k = 0; k < pillars.length; k++) {
                const c = pillars[k];
                const dx = p.x - c.x, dy = p.y - c.y;
                const d = Math.hypot(dx, dy);
                const min = c.r + rad;
                if (d < min && d > 0.001) {
                    p.x = c.x + (dx / d) * min;
                    p.y = c.y + (dy / d) * min;
                } else if (d <= 0.001) {
                    p.x = c.x + min;
                }
            }
        } catch (e) {}
    },

    near(state) {
        const s = this.spot(state);
        return Math.hypot(state.player.x - s.x, state.player.y - s.y);
    },

    // ================= VOID SHRINE (temple) =================
    // New summon path for the Void Leviathan (nothing else changes):
    //  7 shards -> VOID GATE at the cave pad -> E into the shrine ->
    //  5 pillars (4 legendaries + 1 void key) -> space gate + boss.
    voidTempleRoom() {
        return { x0: 8000, x1: 9400, y0: 1000, y1: 2000 };
    },

    voidTempleExit() {
        const r = this.voidTempleRoom();
        return { x: (r.x0 + r.x1) / 2, y: r.y1 - 90 };
    },

    // 5 pillars: 4 outer legendary altars + 1 center void-key altar.
    voidPillars() {
        const r = this.voidTempleRoom();
        const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
        return [
            { x: cx - 380, y: cy - 180, r: 70, kind: 'fish', slot: 0 },
            { x: cx + 380, y: cy - 180, r: 70, kind: 'fish', slot: 1 },
            { x: cx - 380, y: cy + 220, r: 70, kind: 'fish', slot: 2 },
            { x: cx + 380, y: cy + 220, r: 70, kind: 'fish', slot: 3 },
            { x: cx,       y: cy,       r: 80, kind: 'key',  slot: 4 },
        ];
    },

    ensureVoidTemple(state) {
        try {
            const p = state.player;
            if (!p.voidTemple || typeof p.voidTemple !== 'object') {
                p.voidTemple = { legs: {}, key: false, gateOpen: false, ready: false };
            }
            if (!p.voidTemple.legs || typeof p.voidTemple.legs !== 'object') p.voidTemple.legs = {};
        } catch (e) {}
    },

    voidGatePos() {
        // The gate tears open on the NORTH wall ABOVE the ritual circle,
        // never on top of it (pad radius 110 + labels need clear sand).
        const pad = this.cavePad();
        return { x: pad.x, y: pad.y - 300 };
    },

    nearVoidGate(state) {
        try {
            if (!state.player || !state.player.voidTemple || !state.player.voidTemple.gateOpen) return 1e9;
            if (!state.player.inCave || state.player.inVoidTemple) return 1e9;
            const g = this.voidGatePos();
            return Math.hypot(state.player.x - g.x, state.player.y - g.y);
        } catch (e) { return 1e9; }
    },

    // Ritual button for void: consume 7 shards, tear open a gate with a
    // LONG rift cutscene (crack -> tear -> rift, ~6s, no boss yet).
    // Player enters with E.
    openVoidGate(state) {
        const ritual = (typeof RITUALS !== 'undefined' && RITUALS.find(r => r.bossId === 'void_shepherd')) || null;
        const chk = ritual ? this.canSummon(state, ritual) : { ok: false, why: 'Ritual missing.' };
        if (!chk.ok) {
            Particles.showFloatingText(state, chk.why, state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        this.ensureVoidTemple(state);
        // Never wipe a standing run: an open gate or unfinished offerings
        // block re-opening (re-open used to clear legs AND save the wipe).
        const vt0 = state.player.voidTemple || {};
        if (vt0.gateOpen) {
            Particles.showFloatingText(state, 'The gate already stands open — press E at the cave circle!', state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        if (!vt0.ready && vt0.legs && Object.keys(vt0.legs).length > 0) {
            Particles.showFloatingText(state, 'Unfinished offerings stand — complete the shrine first!', state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        this.payCost(state, ritual.cost);
        // Fresh shrine run: clear old offerings (gate stays the run token).
        state.player.voidTemple.legs = {};
        state.player.voidTemple.key = false;
        state.player.voidTemple.ready = false;
        state.player.voidTemple.gateOpen = true;
        const g = this.voidGatePos();
        try { state._voidGateBorn = state.time || 0; } catch (e) {}
        try {
            state.realmFx = state.realmFx || [];
            // Gate-birth: the stone CRACKS first (thin fissure), then the
            // rift tears wide. Staggered rings over ~5s so the opening
            // reads as a slow crack, not a pop.
            state.realmFx.push({ x: g.x, y: g.y - 30, t0: state.time || 0, dur: 8 });
            state.delayedBlasts = state.delayedBlasts || [];
            [70, 120, 180, 250, 330].forEach((radius, i) => {
                state.delayedBlasts.push({
                    x: g.x, y: g.y, radius, damage: 0,
                    timer: 0.6 + i * 0.9, color: i % 2 ? '#4c1d95' : '#a855f7', shake: 14 + i * 2,
                });
            });
            for (let i = 0; i < 40; i++) {
                setTimeout(() => {
                    try {
                        Particles.spawnParticles(state,
                            g.x + (Math.random() - 0.5) * 420, g.y + (Math.random() - 0.5) * 300,
                            Math.random() < 0.5 ? '#e9d5ff' : '#7c3aed', 2, { size: 3 });
                    } catch (e2) {}
                }, i * 120);
            }
            try { audio.playPortal(); } catch (e2) {}
            setTimeout(() => { try { audio.playThunder(); } catch (e2) {} }, 2500);
            setTimeout(() => { try { audio.playBossRoar(); } catch (e2) {} }, 4800);
        } catch (e) {}
        state.screenShake = Math.max(state.screenShake || 0, 20);
        Particles.showFloatingText(state, '🕳 A VOID GATE TEARS OPEN! Press E to enter!', g.x, g.y - 130, '#c084fc');
        try {
            if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                UI.updateStatusBanner('The void gate yawns at the cave circle — <b>press E</b> to step into the shrine!', 'Void Gate', 'fuchsia');
            }
        } catch (e) {}
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        try { this.render(); } catch (e) {}
        return true;
    },

    enterVoidTemple(state) {
        const p = state.player;
        this.ensureVoidTemple(state);
        if (!p.voidTemple.gateOpen) return false;
        if (this.bossAlive(state)) {
            Particles.showFloatingText(state, 'A boss already walks. Slay it first.', p.x, p.y - 50, '#f87171');
            return false;
        }
        const dest = this.voidTempleExit();
        Teleport.go(state, {
            title: 'ENTERING THE SHRINE…',
            sub: 'Five pillars drink the deep. Feed them.',
            apply: () => {
                p.returnPos = { x: p.x, y: p.y };
                p.inVoidTemple = true;
                // Stay flagged inCave so beach systems keep ignoring us;
                // the temple room is a separate map region.
                p.inCave = true;
                p.x = dest.x; p.y = dest.y - 40;
                p.vx = 0; p.vy = 0;
                try { if (state.camera) { state.camera.x = p.x; state.camera.y = p.y; } } catch (e) {}
                state.screenShake = Math.max(state.screenShake || 0, 10);
                try {
                    if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                        UI.updateStatusBanner('The shrine: 4 legendary pillars + the center key. Press <b>E</b> at each.', 'Void Shrine', 'fuchsia');
                    }
                } catch (e) {}
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            }
        });
        return true;
    },

    exitVoidTemple(state) {
        const p = state.player;
        if (!p.inVoidTemple) return false;
        Teleport.go(state, {
            title: 'LEAVING THE SHRINE…',
            sub: 'The gate spits you back to the cave circle.',
            apply: () => {
                const g = this.voidGatePos();
                p.x = g.x; p.y = g.y + 90;
                p.vx = 0; p.vy = 0;
                p.inVoidTemple = false;
                p.inCave = true;
                try { if (state.camera) { state.camera.x = p.x; state.camera.y = p.y; } } catch (e) {}
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            }
        });
        return true;
    },

    voidTempleCollide(state) {
        try {
            const p = state.player;
            if (!p.inVoidTemple) return;
            const r = this.voidTempleRoom();
            const WALL = 70;
            const rad = (p.radius || 16) + 8;
            p.x = Utils.clamp(p.x, r.x0 + WALL + rad, r.x1 - WALL - rad);
            p.y = Utils.clamp(p.y, r.y0 + WALL + rad, r.y1 - WALL - rad);
            const pillars = this.voidPillars();
            for (let k = 0; k < pillars.length; k++) {
                const c = pillars[k];
                const dx = p.x - c.x, dy = p.y - c.y;
                const d = Math.hypot(dx, dy);
                const min = c.r + rad;
                if (d < min && d > 0.001) {
                    p.x = c.x + (dx / d) * min;
                    p.y = c.y + (dy / d) * min;
                } else if (d <= 0.001) {
                    p.x = c.x + min;
                }
            }
        } catch (e) {}
    },

    nearTemplePillar(state) {
        try {
            if (!state.player || !state.player.inVoidTemple) return { i: -1, d: 1e9 };
            const pillars = this.voidPillars();
            let bi = -1, bd = 1e9;
            for (let i = 0; i < pillars.length; i++) {
                const d = Math.hypot(state.player.x - pillars[i].x, state.player.y - pillars[i].y);
                if (d < bd) { bd = d; bi = i; }
            }
            return { i: bi, d: bd, pillar: pillars[bi] };
        } catch (e) { return { i: -1, d: 1e9 }; }
    },

    nearTempleExit(state) {
        try {
            if (!state.player || !state.player.inVoidTemple) return 1e9;
            const e = this.voidTempleExit();
            return Math.hypot(state.player.x - e.x, state.player.y - e.y);
        } catch (e) { return 1e9; }
    },

    voidBookPos() {
        const r = this.voidTempleRoom();
        return { x: (r.x0 + r.x1) / 2, y: r.y0 + 190 };
    },

    nearVoidBook(state) {
        try {
            if (!state.player || !state.player.inVoidTemple) return 1e9;
            const b = this.voidBookPos();
            return Math.hypot(state.player.x - b.x, state.player.y - b.y);
        } catch (e) { return 1e9; }
    },

    riddleFor(slot) {
        try {
            if (slot >= 4) return 'a key the sea let fall, humming with the void';
            if (typeof VOID_RIDDLES !== 'undefined' && VOID_RIDDLES[slot]) return VOID_RIDDLES[slot];
            return 'a void-touched fish';
        } catch (e) { return 'a void-touched fish'; }
    },

    readVoidBook(state) {
        try {
            // Cinematic reading: one line fades in, fades out, next line.
            // Driven pause-safe from Ritual.update (no stuck banner).
            const lines = [
                '📖 THE BLACK BOOK — CURSE OF THE VOID',
                `Pillar I — ${this.riddleFor(0)}`,
                `Pillar II — ${this.riddleFor(1)}`,
                `Pillar III — ${this.riddleFor(2)}`,
                `Pillar IV — ${this.riddleFor(3)}`,
                `Center — ${this.riddleFor(4)}`,
            ];
            state._bookRead = { t0: (state.time || 0) + 1.4, lines, idx: -1, done: false };
            Particles.showFloatingText(state, '📖 The book drinks the candlelight...', state.player.x, state.player.y - 70, '#e9d5ff');
            try { audio.playUIClick(); } catch (e) {}
        } catch (e) {}
        return true;
    },

    // Pitch-black sea while the Star-Eater walks (set at spawn, cleared
    // on ANY void death so the water transitions back to normal).
    setVoidBlackSea(state) {
        try { state._voidBlackSea = 1; state._voidBlackFade = 0; } catch (e) {}
    },

    clearVoidBlackSea(state) {
        try {
            if (!state) return;
            if (state._voidBlackSea > 0) state._voidBlackFade = 1;
        } catch (e) {}
    },

    // Hydra's sea: DARK GREEN while the Stormlord fights (hook + shore).
    // Void is purple-black; hydra is deep green — never both at once.
    setHydraSea(state) {
        try { state._hydraSea = 1; state._hydraSeaFade = 0; } catch (e) {}
    },

    clearHydraSea(state) {
        try {
            if (!state) return;
            if (state._hydraSea > 0) state._hydraSeaFade = 1;
        } catch (e) {}
    },

    // Storm follows the Hydra in. Forced at hook; unwinds (rolls soon)
    // when the hydra dies or flees — never stuck forever.
    startHydraStorm(state) {
        try {
            this.setHydraSea(state);
            if (typeof WorldSystem === 'undefined') return;
            const w = (state.world = state.world || {});
            w.weather = 'storm';
            w.weatherT = Math.max(typeof w.weatherT === 'number' ? w.weatherT : 0, 240);
            try { if (typeof WorldSystem.refreshClockUI === 'function') WorldSystem.refreshClockUI(state); } catch (e) {}
            Particles.showFloatingText(state, '⛈ THE STORM ANSWERS THE HYDRA!', state.player.x, state.player.y - 90, '#6ee7b7');
            try { audio.playThunder(); } catch (e2) {}
        } catch (e) {}
    },

    unwindBossStorm(state) {
        try {
            const w = state.world;
            if (!w) return;
            if (w.weather === 'storm' && typeof w.weatherT === 'number') {
                w.weatherT = Math.min(w.weatherT, 25);
            }
        } catch (e) {}
    },

    templeOfferingState(state, slot) {
        this.ensureVoidTemple(state);
        if (slot < 4) {
            const want = (typeof VOID_TEMPLE_OFFERINGS !== 'undefined' && VOID_TEMPLE_OFFERINGS[slot]) || null;
            const rarity = (want && want.rarity) || 'common';
            const mut = (want && want.mutation) || 'void';
            const done = !!(state.player.voidTemple.legs && state.player.voidTemple.legs['slot' + slot]);
            const have = (state.player.bucket || []).filter(f =>
                f && !f.locked && !f.keyItem && f.mutation === mut && f.rarity === rarity).length;
            return { kind: 'fish', rarity, mutation: mut, done, have, need: 1 };
        }
        const done = !!state.player.voidTemple.key;
        const have = this.countItem(state, 'void_key');
        return { kind: 'key', done, have, need: 1 };
    },

    offerAtPillar(state) {
        const hit = this.nearTemplePillar(state);
        if (!hit || hit.i < 0 || hit.d > (hit.pillar.r + 70)) return false;
        const slot = hit.pillar.slot;
        const st = this.templeOfferingState(state, slot);
        if (st.done) {
            Particles.showFloatingText(state, 'Already offered.', hit.pillar.x, hit.pillar.y - 90, '#94a3b8');
            return true;
        }
        if (slot < 4) {
            const bucket = state.player.bucket || [];
            const idx = bucket.findIndex(f => f && !f.locked && !f.keyItem &&
                f.mutation === st.mutation && f.rarity === st.rarity);
            if (idx < 0) {
                // Never name species: rarity + riddle only.
                Particles.showFloatingText(state, `Needs a void-touched ${st.rarity}! (read the black book)`, hit.pillar.x, hit.pillar.y - 90, '#f87171');
                try { audio.playError(); } catch (e) {}
                return true;
            }
            const eaten = bucket.splice(idx, 1)[0] || {};
            this.ensureVoidTemple(state);
            // Keep a snapshot so the pillar hovers its true model.
            state.player.voidTemple.legs['slot' + slot] = {
                id: eaten.id || 'unknown', name: eaten.name || 'Void fish',
                size: eaten.size || 30, color: eaten.color || '#a855f7',
                accent: eaten.accent || eaten.mutColor || '#7c3aed',
                shape: eaten.shape || 'oval', finColor: eaten.finColor || '#4c1d95',
                rarity: eaten.rarity || st.rarity, mutation: eaten.mutation || 'void',
            };
            Particles.showFloatingText(state, '🐟 The quartz drinks the offering!', hit.pillar.x, hit.pillar.y - 90, '#6ee7b7');
            try { audio.playLevelUp(); } catch (e) {}
        } else {
            if (!(this.countItem(state, 'void_key') > 0)) {
                Particles.showFloatingText(state, 'Needs 1× 🗝️ Void Key (fish the sea)!', hit.pillar.x, hit.pillar.y - 90, '#f87171');
                try { audio.playError(); } catch (e) {}
                return true;
            }
            this.consumeItems(state, 'void_key', 1);
            this.ensureVoidTemple(state);
            state.player.voidTemple.key = true;
            Particles.showFloatingText(state, '🗝️ Void Key offered!', hit.pillar.x, hit.pillar.y - 90, '#6ee7b7');
            try { audio.playLevelUp(); } catch (e) {}
        }
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.checkTempleComplete(state);
        return true;
    },

    isTempleComplete(state) {
        try {
            this.ensureVoidTemple(state);
            const vt = state.player.voidTemple;
            if (!vt.key) return false;
            for (let s = 0; s < 4; s++) {
                if (!vt.legs['slot' + s]) return false;
            }
            return true;
        } catch (e) { return false; }
    },

    checkTempleComplete(state) {
        try {
            if (state.player.voidTemple.ready) return true;
            if (!this.isTempleComplete(state)) return false;
            state.player.voidTemple.ready = true;
            state.player.voidTemple.gateOpen = false;
            Particles.showFloatingText(state, '🌀 THE SPACE GATE HAS APPEARED!', state.player.x, state.player.y - 90, '#e9d5ff');
            try {
                if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                    UI.updateStatusBanner('🌀 <b>THE SPACE GATE HAS APPEARED!</b> The Star-Eater comes...', 'Void', 'fuchsia');
                }
            } catch (e) {}
            try { audio.playPortal(); } catch (e2) {}
            try { audio.playBossRoar(); } catch (e2) {}
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            // Beat, then the offshore cinematic (beach return inside).
            setTimeout(() => { try { this.startVoidBossFight(state); } catch (e) {} }, 1800);
            return true;
        } catch (e) { return false; }
    },

    // Finale: leave the shrine, pan FAR offshore, tear open a BIG gate,
    // FADE the boss in from inside it (PNG-safe: alpha + grow, no pop),
    // roar once, then swim it to the beach arena for the normal fight.
    startVoidBossFight(state, opts) {
        opts = opts || {};
        try {
            const sp = (typeof FISH_SPECIES !== 'undefined' && FISH_SPECIES.find(s => s.id === 'void_shepherd')) || null;
            if (!sp) return false;
            if (!opts.skipBusy && this.bossAlive(state)) return false;
            const begin = () => this.spawnVoidBossFromGate(state, sp);
            // From the shrine: ride back to the beach first so the pan
            // starts on familiar sand, then the camera leaves it far behind.
            if (state.player && state.player.inVoidTemple && !opts.skipTeleport) {
                Teleport.go(state, {
                    title: 'THE SPACE GATE CALLS…',
                    sub: 'The shrine falls silent behind you.',
                    apply: () => {
                        try {
                            const h = this.caveHole(state);
                            state.player.x = h.x; state.player.y = h.y + 120;
                            state.player.inVoidTemple = false;
                            state.player.inCave = false;
                            // Walk to the surf for the arrival.
                            state.player.x = (state.waterBoundaryX || 830) - 120;
                            state.player.y = Utils.clamp(state.player.y, 1200, 1800);
                            state.player.vx = 0; state.player.vy = 0;
                            if (state.camera) { state.camera.x = state.player.x; state.camera.y = state.player.y; }
                        } catch (e) {}
                        setTimeout(begin, 600);
                    }
                });
            } else {
                begin();
            }
            return true;
        } catch (e) { return false; }
    },

    spawnVoidBossFromGate(state, sp) {
        try {
            sp = sp || ((typeof FISH_SPECIES !== 'undefined' && FISH_SPECIES.find(s => s.id === 'void_shepherd')) || null);
            if (!sp) return false;
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            const wb = state.waterBoundaryX || 830;
            // Arena on the sand near the player; portal MUCH farther offshore.
            const tx = Utils.clamp(state.player.x + 140, B.MIN_X + 40, wb - 60);
            const ty = Utils.clamp(state.player.y + 40, B.MIN_Y + 40, B.MAX_Y - 40);
            const px = Utils.clamp(tx + 1400, wb + 60, B.MAX_X - 60);
            const hpMult = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.FISH_HP_MULT) || 1;
            // 3-act timing (state.time-driven, pause-safe — see Combat):
            //  act I (0-6s) portal open, boss grows INSIDE it, stationary;
            //  act II (6.5s) breach roar, starts swimming (~7s glide);
            //  act III (~13.5s) arrival: ONE name banner, then FIGHT.
            const t0 = state.time || 0;
            const dur = 19;
            const m = {
                id: 'boss' + Date.now() + Math.random(),
                species: sp,
                x: px, y: ty,
                hp: Math.round(sp.maxHp * hpMult), maxHp: Math.round(sp.maxHp * hpMult),
                vx: 0, vy: 0, chargeCooldown: 3, isCharging: false,
                _announced: true,
                // NO _swimIn yet: act I holds it inside the portal.
                _sizeMult: 0.05,
                _voidFade: 0,
                _voidPortal: { x: px, y: ty },
                _voidArena: { x: tx, y: ty },
                _voidT0: t0,
                _voidGrowFrom: t0 + 1,
                _voidGrowTo: t0 + 6,
                _voidSwimAt: t0 + 6.5,
                _voidBreached: false,
                _voidNamed: false,
            };
            (state.monstersOnLand = state.monstersOnLand || []).push(m);
            state.activeBoss = m;
            // The sea goes PITCH BLACK until it dies (see drawWater overlay).
            try { this.setVoidBlackSea(state); } catch (e) {}
            // ONE portal tears open (the only gate of this fight).
            try {
                state.realmFx = state.realmFx || [];
                state.realmFx.push({ x: px, y: ty - 40, t0: state.time || 0, dur: 13, big: true });
                state.delayedBlasts = state.delayedBlasts || [];
                [120, 220, 340, 470, 620, 780].forEach((radius, i) => {
                    state.delayedBlasts.push({
                        x: px, y: ty, radius, damage: 0,
                        timer: 0.5 + i * 0.5, color: i % 2 ? '#020617' : '#4c1d95', shake: 18 + i * 2,
                    });
                });
                for (let i = 0; i < 50; i++) {
                    Particles.spawnParticles(state,
                        px + (Math.random() - 0.5) * 900, ty + (Math.random() - 0.5) * 600,
                        Math.random() < 0.4 ? '#020617' : (Math.random() < 0.5 ? '#e9d5ff' : '#7c3aed'), 1, { size: 4 });
                }
                // Sky splits: violet bolts hammer the tear while it opens.
                for (let i = 0; i < 6; i++) {
                    setTimeout(() => {
                        try {
                            if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                                Combat.strikeLightning(state, px + (Math.random() - 0.5) * 420, ty + (Math.random() - 0.5) * 260, { color: '#c084fc', shake: 12 });
                            }
                        } catch (e2) {}
                    }, 800 + i * 900);
                }
                try { audio.playThunder(); } catch (e2) {}
            } catch (e) {}
            // Standard intro lock (camera pans player -> FAR portal on its
            // own since it tracks the boss) + void alarm beats. Arrival
            // (~13.5s) lands before the countdown ends, so the boss waits
            // at the arena for FIGHT.
            this.bossIntro(state, sp, px, ty, m, dur, 'rise', true);
            try { this.voidIntro(state, m); } catch (e2) {}
            // HP bar stays hidden until it reaches the shore arena.
            m._hpHiddenUntil = t0 + 13.5;
            this.fightCountdown(state, m, { delaySec: 14 });
            Player.refreshHUD(state);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return m;
        } catch (e) { return false; }
    },

    ensure(state) {
        const p = state.player;
        if (!p.baitStock) p.baitStock = {};
        if (!('activeBait' in p)) p.activeBait = null;
    },

    // ---------- summon items: physical bucket loot (never counters) ----------
    itemDef(keyId) {
        if (typeof BOSS_KEYS !== 'undefined' && BOSS_KEYS[keyId]) return BOSS_KEYS[keyId];
        if (typeof TROPHIES !== 'undefined' && TROPHIES[keyId]) {
            const t = TROPHIES[keyId];
            const icons = { chalice: '🏆', fang: '🦷', eye: '👁️' };
            return { name: t.name, icon: icons[keyId] || '🏆', color: t.color || '#fbbf24', value: t.value || 0 };
        }
        return null;
    },

    bucketItem(keyId) {
        const def = this.itemDef(keyId);
        if (!def) return null;
        const icon = def.icon || (TROPHIES[keyId] ? '🏆' : '❔');
        return { kind: 'item', keyItem: true, id: keyId, name: def.name,
            icon, color: def.color || '#fbbf24', rarity: 'key',
            value: this.keyValue(keyId) };
    },

    // Sell price of a summon item. Old saves stored value: 0 — the def is
    // the source of truth, so those migrate automatically wherever sold.
    keyValue(keyId) {
        try {
            const def = this.itemDef(keyId);
            const v = def && def.value;
            return (typeof v === 'number' && v > 0) ? Math.round(v) : 0;
        } catch (e) { return 0; }
    },

    // Spendable value of one bucket entry (fish or key), with the key-def
    // fallback for pre-price saves.
    entryValue(entry) {
        try {
            if (!entry) return 0;
            if (typeof entry.value === 'number' && entry.value > 0) return Math.round(entry.value);
            if (entry.keyItem) return this.keyValue(entry.id);
        } catch (e) {}
        return 0;
    },

    // How many UNLOCKED summon items sit in the bucket (spendable /
    // sellable). Locked 🔒 items are keepers: rituals, crafts and SELL ALL
    // must never touch them.
    countItem(state, keyId) {
        return (state.player.bucket || []).filter(f => f && f.keyItem && f.id === keyId && !f.locked).length;
    },

    // Total copies regardless of lock (stash display).
    countItemAll(state, keyId) {
        return (state.player.bucket || []).filter(f => f && f.keyItem && f.id === keyId).length;
    },

    // Remove N UNLOCKED summon items from the bucket. Returns removed count.
    consumeItems(state, keyId, count) {
        const bucket = state.player.bucket || [];
        let left = count;
        for (let i = bucket.length - 1; i >= 0 && left > 0; i--) {
            const f = bucket[i];
            if (f && f.keyItem && f.id === keyId && !f.locked) {
                bucket.splice(i, 1);
                left--;
            }
        }
        return count - left;
    },

    // Grant into the bucket (overflow drops as ground loot at the player).
    // Same signature as before so all callers keep working.
    grantKey(state, keyId, why) {
        this.grantItem(state, keyId, why);
    },

    grantTrophy(state, bossId) {
        const map = { leviathan_priest: 'chalice', stormlord_hydra: 'fang', void_shepherd: 'eye' };
        const tid = map[bossId];
        if (!tid) return;
        this.grantItem(state, tid, 'boss tribute');
    },

    grantItem(state, keyId, why) {
        const entry = this.bucketItem(keyId);
        if (!entry) return;
        this.ensure(state);
        const p = state.player;
        p.bucket = p.bucket || [];
        if (p.bucket.length < (p.bucketCapacity || 15)) {
            p.bucket.push(entry);
        } else {
            (state.groundLoot = state.groundLoot || []).push({
                id: 'k' + Date.now() + Math.random(),
                item: entry, x: p.x, y: p.y - 30,
            });
            Particles.showFloatingText(state, 'Bucket full — item dropped!', p.x, p.y - 40, '#f87171');
        }
        Particles.showFloatingText(state, `${entry.icon} ${entry.name}! (${why || 'loot'})`, p.x, p.y - 60, entry.color);
        try { audio.playLevelUp(); } catch (e) {}
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
    },

    // Drop a summon item as world loot (with model) at a position
    dropItemLoot(state, keyId, x, y) {
        const entry = this.bucketItem(keyId);
        if (!entry) return;
        (state.groundLoot = state.groundLoot || []).push({
            id: 'k' + Date.now() + Math.random(),
            item: entry, x, y,
        });
    },

    // Award routing: solo/host get a physical drop to walk over (model +
    // magnet + pickup); MP clients get it straight into the bucket since
    // the host owns ground-loot sync and local drops would vanish.
    awardItem(state, keyId, x, y, why) {
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
                this.grantItem(state, keyId, why);
                return;
            }
        } catch (e) {}
        if (typeof x === 'number' && typeof y === 'number') this.dropItemLoot(state, keyId, x, y);
        else this.grantItem(state, keyId, why);
    },

    // ---------- bait stock ----------
    countTier(state, tier) {
        const allowed = RITUAL_TIERS[tier] || RITUAL_TIERS.any;
        return (state.player.bucket || []).filter(f => f && !f.locked && allowed.includes(f.rarity)).length;
    },

    // Remove N unlocked fish of a tier (oldest first). Returns removed count.
    consumeFish(state, tier, count) {
        const allowed = RITUAL_TIERS[tier] || RITUAL_TIERS.any;
        const bucket = state.player.bucket || [];
        let left = count;
        for (let i = bucket.length - 1; i >= 0 && left > 0; i--) {
            const f = bucket[i];
            if (f && !f.locked && allowed.includes(f.rarity)) {
                bucket.splice(i, 1);
                left--;
            }
        }
        return count - left;
    },

    // ---------- mutation offerings (priest chain) ----------
    // Rarities counted for blood offerings (epic and up).
    BLOOD_TIERS: ['epic', 'legendary', 'mythic', 'boss'],

    countMutation(state, mut, tiers) {
        const allow = tiers || this.BLOOD_TIERS;
        return (state.player.bucket || []).filter(f =>
            f && !f.locked && !f.keyItem && f.mutation === mut && allow.includes(f.rarity)).length;
    },

    // Remove N mutation fish; returns the removed entries (snapshots for
    // the sacrifice cutscene models). Oldest first, never locked/key.
    consumeMutation(state, mut, count, tiers) {
        const allow = tiers || this.BLOOD_TIERS;
        const bucket = state.player.bucket || [];
        const taken = [];
        for (let i = bucket.length - 1; i >= 0 && taken.length < count; i--) {
            const f = bucket[i];
            if (f && !f.locked && !f.keyItem && f.mutation === mut && allow.includes(f.rarity)) {
                taken.push(bucket.splice(i, 1)[0]);
            }
        }
        return taken;
    },

    // PRIEST SACRIFICE at the cave circle: 3 blood-mutated epic+ fish +
    // 1 Heart of the Sea. Plays the merge cutscene, forges the
    // Bloodheart of the Abyss (+1 bloodheart lure, auto-equipped).
    priestSacrifice(state) {
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
            Particles.showFloatingText(state, 'Only the host can perform rituals.', state.player.x, state.player.y - 50, '#f87171');
            return false;
        }
        if (state.player && state.player.onIsland) {
            Particles.showFloatingText(state, 'No ritual ground here — sail back to the mainland beach.', state.player.x, state.player.y - 50, '#f87171');
            return false;
        }
        if (this.bossAlive(state)) {
            Particles.showFloatingText(state, 'A boss already walks. Slay it first.', state.player.x, state.player.y - 50, '#f87171');
            return false;
        }
        if (this.countMutation(state, 'blood') < 3) {
            Particles.showFloatingText(state, 'Need 3× 🩸 blood-mutated epic+ fish!', state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        if (!(this.countItem(state, 'heart_sea') > 0)) {
            Particles.showFloatingText(state, 'Need 💙 Heart of the Sea (Marlin)!', state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        // Offerings are SNAPSHOT for the visuals here but only REALLY leave
        // the bucket at the reveal (fail-closed: reloads lose nothing, a
        // mid-rite sale just fizzles the finish — see finishPriestRite).
        const held = [];
        try {
            for (const f of (state.player.bucket || [])) {
                if (held.length >= 3) break;
                if (f && !f.locked && !f.keyItem && f.mutation === 'blood' && this.BLOOD_TIERS.includes(f.rarity)) {
                    held.push(Object.assign({}, f));
                }
            }
        } catch (e) {}
        if (held.length < 3) return false;
        if (!(this.countItem(state, 'heart_sea') > 0)) return false;
        const pad = this.cavePad();
        state._priestRite = {
            t0: state.time || 0,
            fish: held.slice(0, 3),
            cx: pad.x, cy: pad.y - 40,
            done: false,
        };
        try { audio.playPortal(); } catch (e) {}
        Particles.showFloatingText(state, '🩸 THE SACRIFICE BEGINS...', pad.x, pad.y - 160, '#dc2626');
        try {
            if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                UI.updateStatusBanner('Three blood offerings rise... the heart drinks them.', 'Sacrifice', 'rose');
            }
        } catch (e) {}
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        try { this.render(); } catch (e) {}
        return true;
    },

    // Rite merge (called once from update at ~7s): the offerings slam
    // together under a blood orb that swallows the whole group, then a
    // 1.5s red flash. The heart itself is revealed after (see below).
    burstPriestRite(state) {
        const rite = state._priestRite;
        if (!rite || rite.burst) return;
        rite.burst = true;
        rite.coverFrom = state.time || 0;
        try {
            state.delayedBlasts = state.delayedBlasts || [];
            [160, 260, 380, 520].forEach((radius, i) => {
                state.delayedBlasts.push({
                    x: rite.cx, y: rite.cy - 60, radius, damage: 0,
                    timer: 0.3 + i * 0.25, color: i % 2 ? '#dc2626' : '#fbbf24', shake: 22,
                });
            });
            Particles.spawnParticles(state, rite.cx, rite.cy - 60, '#ef4444', 50, { size: 7 });
            Particles.spawnParticles(state, rite.cx, rite.cy - 60, '#fbbf24', 30, { size: 5 });
            Particles.spawnParticles(state, rite.cx, rite.cy - 60, '#7f1d1d', 30, { size: 6 });
            state.screenShake = Math.max(state.screenShake || 0, 30);
            // Blood flash, held 1.5s so the merge burns into the screen.
            try {
                const fl = document.getElementById('flash-overlay');
                if (fl) {
                    fl.classList.remove('active');
                    fl.style.transition = 'none';
                    fl.style.background = '#b91c1c';
                    fl.style.opacity = '1';
                    setTimeout(() => {
                        try {
                            fl.style.transition = 'opacity 0.8s';
                            fl.style.opacity = '0';
                            setTimeout(() => { try { fl.style.background = ''; } catch (e) {} }, 850);
                        } catch (e) {}
                    }, 1500);
                }
            } catch (e) {}
            try { audio.playExplosion(); } catch (e2) {}
            try { audio.playSacrifice(); } catch (e2) {}
            Particles.showFloatingText(state, '🩸 MERGE!', rite.cx, rite.cy - 170, '#fecaca');
        } catch (e) {}
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
    },

    // Heart reveal (called once from update at ~8.5s): the cover burns
    // off into the floating Bloodheart + its only lure, auto-equipped.
    finishPriestRite(state) {
        const rite = state._priestRite;
        if (!rite || rite.done) return;
        rite.done = true;
        // Pay now (fail-closed): re-take 3 blood + the heart. A reload
        // mid-rite consumed nothing, so nothing is lost; if the player
        // sold/spent/locked the goods mid-cutscene the forge fizzles with
        // a message instead of conjuring a free Bloodheart.
        let paid = false;
        try {
            const taken = this.consumeMutation(state, 'blood', 3);
            const hearts = (taken.length >= 3) ? this.consumeItems(state, 'heart_sea', 1) : 0;
            paid = (taken.length >= 3 && hearts >= 1);
            if (!paid) {
                // Partial take must go back — never eat half a sacrifice.
                try {
                    for (const f of taken) (state.player.bucket = state.player.bucket || []).push(f);
                } catch (e) {}
            }
        } catch (e) { paid = false; }
        if (!paid) {
            state._priestRite = null;
            Particles.showFloatingText(state, '🩸 The circle starves — offerings gone! Bring 3 blood + heart again.', state.player.x, state.player.y - 60, '#f87171');
            try { audio.playError(); } catch (e2) {}
            try {
                if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                    UI.updateStatusBanner('Sacrifice fizzled — the offerings left the bucket mid-rite.', 'Fizzle', 'rose');
                }
            } catch (e2) {}
            try { Player.refreshHUD(state); } catch (e2) {}
            return;
        }
        rite.heartUntil = (state.time || 0) + 6;
        try {
            Particles.spawnParticles(state, rite.cx, rite.cy - 90, '#fecaca', 36, { size: 5 });
            Particles.spawnParticles(state, rite.cx, rite.cy - 90, '#fbbf24', 24, { size: 4 });
            state.screenShake = Math.max(state.screenShake || 0, 16);
            try { audio.playLevelUp(); } catch (e2) {}
            try { audio.playPortal(); } catch (e2) {}
        } catch (e) {}
        this.grantItem(state, 'bloodheart', 'sacrifice forged');
        this.ensure(state);
        state.player.baitStock = state.player.baitStock || {};
        state.player.baitStock['bloodheart_lure'] = (state.player.baitStock['bloodheart_lure'] || 0) + 1;
        state.player.activeBait = 'bloodheart_lure';
        Particles.showFloatingText(state, '❤️‍🔥 BLOODHEART OF THE ABYSS! Lure on hook — 100% priest!', rite.cx, rite.cy - 170, '#fbbf24');
        try {
            if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                UI.updateStatusBanner('❤️‍🔥 <b>BLOODHEART OF THE ABYSS</b> forged! Cast with it — the Priest <b>always</b> bites.', 'Bloodheart', 'amber');
            }
        } catch (e) {}
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        try { this.render(); } catch (e) {}
    },

    // ---------- priest heart-rip finisher ----------
    // The kneeling priest waits for hands, not bullets.
    nearKneelingPriest(state) {
        try {
            const p = state.player;
            if (!p || p.isDead) return null;
            const m = (state.monstersOnLand || []).find(m =>
                m && m.species && m.species.id === 'leviathan_priest' && m._kneeling && (m.hp || 0) > 0);
            if (!m) return null;
            if (Math.hypot(p.x - m.x, p.y - m.y) > 150) return null;
            return m;
        } catch (e) { return null; }
    },

    startHeartRip(state) {
        const m = this.nearKneelingPriest(state);
        if (!m) return false;
        state._heartRip = { boss: m, mash: 0, need: 8, done: false };
        Particles.showFloatingText(state, '🫀 GRAB THE HEART — MASH SPACE!', m.x, m.y - 130, '#f0abfc');
        try { audio.playUIClick(); } catch (e) {}
        return true;
    },

    tickHeartRip(state) {
        const rip = state._heartRip;
        if (!rip || rip.done || !rip.boss) return;
        try {
            Particles.spawnParticles(state, rip.boss.x, rip.boss.y - 50, '#f0abfc', 4, { size: 4 });
            state.screenShake = Math.max(state.screenShake || 0, 6);
            Particles.showFloatingText(state, `💓 RIP ${Math.min(rip.need, rip.mash)}/${rip.need}`, rip.boss.x, rip.boss.y - 130, '#f0abfc');
            if (rip.mash >= rip.need) this.finishHeartRip(state);
        } catch (e) {}
    },

    finishHeartRip(state) {
        const rip = state._heartRip;
        const m = rip && rip.boss;
        if (!m) { state._heartRip = null; return; }
        rip.done = true;
        try {
            // Black sea-foam detonation where the heart tore free.
            Particles.spawnParticles(state, m.x, m.y, '#020617', 50, { size: 7 });
            Particles.spawnParticles(state, m.x, m.y, '#0ea5e9', 30, { size: 5 });
            Particles.spawnParticles(state, m.x, m.y, '#e2e8f0', 20, { size: 4 });
            if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                Combat.roarShockwave(state, m.x, m.y, { color: '#020617', rings: 5, maxR: 380, shake: 24 });
            }
            state.screenShake = Math.max(state.screenShake || 0, 28);
            try { audio.playExplosion(); } catch (e) {}
            try { audio.playBossKilled(); } catch (e) {}
            state.monstersOnLand = (state.monstersOnLand || []).filter(x => x !== m);
            if (state.activeBoss === m) state.activeBoss = null;
            state.bossDeaths = 0; // won — chances reset
            this.awardItem(state, 'crown', m.x, m.y, 'tidefather tribute');
            this.awardItem(state, 'priest_core', m.x, m.y, 'abyssal core');
            if (!Array.isArray(state.player.slainBosses)) state.player.slainBosses = [];
            if (!state.player.slainBosses.includes('leviathan_priest')) state.player.slainBosses.push('leviathan_priest');
            if (typeof Achievements !== 'undefined') Achievements.checkEnemyKill(state, 'boss');
            Particles.showFloatingText(state, '👑 +1 PRIEST CROWN · 🜂 +1 PRIEST CORE!', m.x, m.y - 130, '#fbbf24');
            try {
                if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                    UI.updateStatusBanner('The Priest bursts into black foam! <b>Crown</b> (wild emperor tribute) + <b>Core</b> (crafting) claimed — walk over the drops!', 'Victory', 'emerald');
                }
            } catch (e) {}
            Player.refreshHUD(state);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            try { this.render(); } catch (e) {}
        } catch (e) {}
        state._heartRip = null;
    },

    baitDef(id) {
        return BAITS.find(b => b.id === id) || null;
    },

    canCraft(state, baitId) {
        if (baitId === 'bloodheart_lure') return { ok: false, why: 'Forged by blood sacrifice, not crafted.' };
        const def = this.baitDef(baitId);
        if (!def) return { ok: false, why: 'Unknown bait.' };
        // Explicit fish + coins recipes go through the Craft engine.
        if (def.recipe && (def.recipe.fish || def.recipe.coins)) {
            try {
                if (typeof Craft !== 'undefined') {
                    const chk = Craft.check(state, def.recipe);
                    return chk.ok ? { ok: true } : { ok: false, why: chk.why };
                }
            } catch (e) {}
        }
        this.ensure(state);
        if (def.recipe.key && !(this.countItem(state, def.recipe.key) > 0)) {
            return { ok: false, why: `Needs 1× ${BOSS_KEYS[def.recipe.key].name} (fish one first).` };
        }
        const have = this.countTier(state, def.recipe.tier);
        if (have < def.recipe.count) {
            return { ok: false, why: `Needs ${def.recipe.count} ${def.recipe.tier} fish (have ${have}).` };
        }
        return { ok: true };
    },

    craftBait(state, baitId) {
        const def = this.baitDef(baitId);
        const chk = this.canCraft(state, baitId);
        if (!def || !chk.ok) {
            Particles.showFloatingText(state, chk.why || 'Cannot craft.', state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        // Explicit recipes (fish + coins) are spent by the Craft engine.
        if (def.recipe && (def.recipe.fish || def.recipe.coins)) {
            try {
                if (typeof Craft !== 'undefined') return Craft.craftBait(state, baitId);
            } catch (e) {}
            return false;
        }
        if (def.recipe.key) this.consumeItems(state, def.recipe.key, 1);
        this.consumeFish(state, def.recipe.tier, def.recipe.count);
        const n = def.yield || BAIT_YIELD;
        state.player.baitStock[def.id] = (state.player.baitStock[def.id] || 0) + n;
        try { audio.playCoin(); } catch (e) {}
        Particles.showFloatingText(state, `Crafted +${n} ${def.name}!`, state.player.x, state.player.y - 50, def.color);
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        return true;
    },

    // Buy basic baits with coins (+10 stock). Lures are craft-only.
    buyBait(state, baitId) {
        const def = this.baitDef(baitId);
        const price = (typeof BAIT_PRICES !== 'undefined' && BAIT_PRICES[baitId]) || 0;
        if (!def || !price) return false;
        this.ensure(state);
        const p = state.player;
        if (p.coins < price) {
            Particles.showFloatingText(state, `Need ${price}c!`, p.x, p.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        p.coins -= price;
        p.baitStock[baitId] = (p.baitStock[baitId] || 0) + BAIT_YIELD;
        try { audio.playCoin(); } catch (e) {}
        Particles.showFloatingText(state, `+${BAIT_YIELD} ${def.name}!`, p.x, p.y - 50, def.color);
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        return true;
    },

    // Equip a bait type on the hook. Stays equipped while stock lasts —
    // every hook eats exactly 1 (see consumeHookBait).
    useBait(state, baitId) {
        const def = this.baitDef(baitId);
        if (!def) return false;
        this.ensure(state);
        if (!(state.player.baitStock[baitId] > 0)) {
            try { audio.playError(); } catch (e) {}
            return false;
        }
        state.player.activeBait = baitId;
        try { audio.playCoin(); } catch (e) {}
        Particles.showFloatingText(state, `${def.name} on the hook!`, state.player.x, state.player.y - 50, def.color);
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        return true;
    },

    // Equipped bait def, or null (nothing equipped / out of stock).
    equippedBait(state) {
        try {
            const id = state.player.activeBait;
            if (typeof id !== 'string' || !id) return null;
            const def = this.baitDef(id);
            if (!def || !(state.player.baitStock[id] > 0)) return null;
            return def;
        } catch (e) { return null; }
    },

    // 1 hook = 1 bait eaten. Emptied type auto-unequips.
    consumeHookBait(state) {
        try {
            const def = this.equippedBait(state);
            if (!def) return null;
            const p = state.player;
            p.baitStock[def.id]--;
            if (!(p.baitStock[def.id] > 0)) {
                p.activeBait = null;
                Particles.showFloatingText(state, `${def.name} ran out!`, p.x, p.y - 40, '#94a3b8');
            }
            Player.refreshHUD(state);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return def;
        } catch (e) { return null; }
    },

    refreshBaitHUD(state) {
        try {
            const el = document.getElementById('bait-display');
            if (!el) return;
            const def = this.equippedBait(state);
            if (def) {
                const n = state.player.baitStock[def.id] || 0;
                el.innerHTML = `<span style="color:${def.color}">◉</span> ${def.name} ×${n}`;
                el.className = 'text-sky-300';
            } else {
                el.innerText = T('hud_no_bait');
                el.className = 'text-slate-500';
            }
        } catch (e) {}
    },

    // ---------- ritual ----------
    bossAlive(state) {
        if (state.activeBoss && state.activeBoss.hp > 0) return true;
        if ((state.monstersOnLand || []).some(m => m && m.species && m.species.isBoss && (m.hp || 0) > 0)) return true;
        // Hooked water boss (line snapped) and Stormcaller count too
        const hf = state.fishing && state.fishing.mode === 'HOOKED' ? state.fishing.hookedFish : null;
        if (hf && hf.species && hf.species.isBoss && (hf.hp || 0) > 0) return true;
        if ((state.enemies || []).some(e => e && e.isBoss && (e.hp || 0) > 0)) return true;
        return false;
    },

    // Death-rule + HUD alias: is ANY boss fight currently running?
    bossFightActive(state) {
        try { return this.bossAlive(state); } catch (e) { return false; }
    },

    // Cost lines for display + checks. Two shapes:
    //   { shards: n } | { trophies: { id: n } }
    // Counts come from the BUCKET (physical summon items).
    // 👑 Tidefather Crowns are WILD: each covers one missing trophy.
    costLines(state, cost) {
        const lines = [];
        if (cost.shards) {
            const have = this.countItem(state, 'shard');
            lines.push({ label: `🔮 Void Shard ×${cost.shards}`, have, need: cost.shards });
        }
        if (cost.trophies) {
            const troIcons = { chalice: '🏆', fang: '🦷', eye: '👁️', crown: '👑' };
            for (const [tid, n] of Object.entries(cost.trophies)) {
                const t = (typeof TROPHIES !== 'undefined' && TROPHIES[tid]) || { name: tid };
                const icon = (t && t.icon) || troIcons[tid] || '🏆';
                const have = this.countItem(state, tid);
                lines.push({ label: `${icon} ${t.name} ×${n}`, have, need: n, tid });
            }
            const wild = this.countItem(state, 'crown');
            if (wild > 0) lines.push({ label: `👑 Tidefather Crown (wild) ×${wild}`, have: wild, need: 0, wild: true });
        }
        return lines;
    },

    // Trophy coverage with wild crowns: missing pieces are filled by crowns.
    trophiesMet(state, cost) {
        try {
            if (!cost.trophies) return true;
            let missing = 0;
            for (const [tid, n] of Object.entries(cost.trophies)) {
                missing += Math.max(0, n - this.countItem(state, tid));
            }
            return missing <= this.countItem(state, 'crown');
        } catch (e) { return false; }
    },

    ritualState(state, ritual) {
        this.ensure(state);
        const p = state.player;
        const sp = FISH_SPECIES.find(s => s.id === ritual.bossId);
        const slain = (p.slainBosses || []).includes(ritual.bossId);
        const lines = this.costLines(state, ritual.cost);
        let met = lines.every(l => l.have >= l.need);
        // Wild crowns cover trophy gaps (emperor gate).
        if (!met && ritual.cost && ritual.cost.trophies) {
            met = this.trophiesMet(state, ritual.cost);
        }
        return { sp, slain, lines, met };
    },

    canSummon(state, ritual) {
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
            return { ok: false, why: 'Only the host can perform rituals.' };
        }
        // Ritual circles belong to the mainland beach — sail home first.
        // (Bait-hooked bosses are the only ones that fight on the isles.)
        if (state.player && state.player.onIsland) {
            return { ok: false, why: 'No ritual ground here — sail back to the mainland beach.' };
        }
        if (this.bossAlive(state)) return { ok: false, why: 'A boss already walks. Slay it first.' };
        // Void gate runs standing progress: an open gate (or unfinished
        // offerings) disables OPEN GATE so it can never wipe the shrine.
        try {
            if (ritual && ritual.bossId === 'void_shepherd') {
                this.ensureVoidTemple(state);
                const vt = (state.player && state.player.voidTemple) || {};
                if (vt.gateOpen) return { ok: false, why: 'The gate already stands open — press E at the cave circle.' };
                if (!vt.ready && vt.legs && Object.keys(vt.legs).length > 0) {
                    return { ok: false, why: 'Unfinished offerings stand — complete the shrine first.' };
                }
            }
        } catch (e) {}
        // One boss per room: if a crewmate is already fighting one (their
        // hooked boss), nobody else may summon — even with full items.
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.roomBossBusy) {
                const busy = Multiplayer.roomBossBusy();
                if (busy) return { ok: false, why: `${busy.by} is already fighting a boss — one per room.` };
            }
        } catch (e) {}
        const rs = this.ritualState(state, ritual);
        if (!rs.met) {
            const missing = rs.lines.filter(l => !l.wild && l.have < l.need).map(l => `${l.label} (have ${l.have})`);
            if (missing.length) return { ok: false, why: 'Missing: ' + missing.join(' · ') };
            return { ok: false, why: 'Missing trophy pieces (crowns cover gaps).' };
        }
        return { ok: true };
    },

    payCost(state, cost) {
        if (cost.shards) this.consumeItems(state, 'shard', cost.shards);
        if (cost.trophies) {
            for (const [tid, n] of Object.entries(cost.trophies)) {
                const have = this.countItem(state, tid);
                const take = Math.min(have, n);
                if (take > 0) this.consumeItems(state, tid, take);
                // Wild crowns cover the remainder.
                if (take < n) this.consumeItems(state, 'crown', n - take);
            }
        }
    },

    // Shared spawn: pad rituals AND the Marlin rite land the boss here.
    // Returns the boss monster (or false). Dormancy + intro length ride
    // along so every arrival stands down for its own cinematic.
    // mode: 'swim' (glide in from the far sea), 'rise' (erupt here from
    // the water), 'fall' (drop from the sky with an impact).
    spawnBoss(state, bossId, introDurSec, mode, quietName) {
        const sp = FISH_SPECIES.find(s => s.id === bossId);
        if (!sp) return false;
        // Ritual summons stay on the mainland beach — never on an isle.
        // (Bait-hooked bosses fight wherever they were hooked instead.)
        if (state.player && state.player.onIsland) {
            Particles.showFloatingText(state, 'No ritual ground here — sail back to the mainland beach.', state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        const hpMult = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.FISH_HP_MULT) || 1;
        const B = CONFIG.WORLD;
        // Arrival from the far sea: the boss surfaces out east and GLIDES
        // ashore to the arena during its intro (see _swimIn + dormant glide
        // in Combat) — never pops onto the sand beside you.
        const px = Utils.clamp(state.waterBoundaryX + 320 + Math.random() * 260, state.waterBoundaryX + 60, B.MAX_X - 60);
        const py = Utils.clamp(state.player.y + (Math.random() - 0.5) * 320, B.MIN_Y + 40, B.MAX_Y - 40);
        const dur = (typeof introDurSec === 'number' && introDurSec > 0) ? introDurSec : 5;
        const tx = Utils.clamp(state.player.x + 140, B.MIN_X + 40, state.waterBoundaryX - 60);
        const ty = Utils.clamp(state.player.y + 40, B.MIN_Y + 40, B.MAX_Y - 40);
        const swimDist = Math.hypot(tx - px, ty - py) || 1;
        const m = {
            id: 'boss' + Date.now() + Math.random(),
            species: sp,
            x: px, y: py,
            hp: Math.round(sp.maxHp * hpMult), maxHp: Math.round(sp.maxHp * hpMult),
            vx: 0, vy: 0, chargeCooldown: 3, isCharging: false,
            _announced: true, // intro plays here, combat won't double it
            _swimIn: { x: tx, y: ty, spd: swimDist / Math.max(1.5, dur) },
        };
        const how = mode || 'swim';
        if (how === 'rise') {
            // Erupts from the water and SURGES ashore: starts out at sea,
            // glides in fast trailing spray, grounds at the arena.
            const sx = Utils.clamp(tx + 280, state.waterBoundaryX + 40, B.MAX_X - 60);
            m.x = sx; m.y = ty;
            m._swimIn = { x: tx, y: ty, spd: Math.hypot(tx - sx, 0) / Math.max(1.2, dur * 0.55) };
        } else if (how === 'fall') {
            // Drops from the sky: start high above the arena, slam down.
            // Clamped inside the world so the intro camera never stares
            // into the black void past the map edge.
            m.x = tx; m.y = Math.max(ty - 600, B.MIN_Y + 140);
            m._swimIn = { x: tx, y: ty, spd: 600 / Math.max(1.2, dur * 0.55) };
            m._introImpact = true;
        }
        // Universal arrival: a portal tears open where the boss starts,
        // and it grows from 25% to full while swimming in. Slow glide —
        // every boss takes its time, no teleports.
        m._sizeMult = 0.25;
        try {
            state.realmFx = state.realmFx || [];
            state.realmFx.push({ x: m.x, y: m.y - 30, t0: state.time || 0, dur: Math.max(2, dur * 0.7) });
            state.delayedBlasts = state.delayedBlasts || [];
            state.delayedBlasts.push({
                x: m.x, y: m.y, radius: 150, damage: 0,
                timer: 0.5, color: '#e9d5ff', shake: 14,
            });
        } catch (e) {}
        (state.monstersOnLand = state.monstersOnLand || []).push(m);
        state.activeBoss = m;
        this.bossIntro(state, sp, m.x, m.y, m, introDurSec, how, quietName);
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        return m;
    },

    // Cinematic boss arrival, part 1: screen flash + quake + war-horn,
    // shockwave rings, flaming name banner, and a ~10s camera lock on the
    // boss. Part 2 (tide music fading out, boss theme fading in) fires when
    // the lock expires — see Combat.update's pending-crossfade check.
    INTRO_CAM_DUR: 10,
    // Phase gate marks drawn on the boss HP bar (fraction of max HP,
    // descending). The bar renders a tick per mark so each phase reads.
    PHASE_MARKS: {
        stormlord_hydra:  [0.5, 0.4],
        void_shepherd:    [0.65, 0.3, 0.1],
        crimson_emperor:  [0.7, 0.3, 0.1],
        leviathan_priest: [0.4],
        stormcaller:      [0.4],
    },
    BOSS_TITLES: {
        stormlord_hydra:  { title: 'THE NINE-HEADED STORM', color: '#10b981', glow: '#6ee7b7' },
        leviathan_priest: { title: 'CHANT OF THE DEEP',     color: '#0ea5e9', glow: '#7dd3fc' },
        void_shepherd:    { title: 'THE STAR-EATER',        color: '#a855f7', glow: '#22d3ee' },
        crimson_emperor:   { title: 'THE MOLTEN TYRANT',     color: '#ef4444', glow: '#fbbf24' },
        stormcaller:       { title: 'QUEEN OF THE GALES',    color: '#facc15', glow: '#fef08a' },
    },

    bossIntro(state, sp, px, py, bossRef, durSec, mode, quietName) {
        try {
            const meta = (this.BOSS_TITLES && this.BOSS_TITLES[sp.id]) || { title: 'BOSS', color: '#ef4444', glow: '#fbbf24' };
            const x = (typeof px === 'number') ? px : state.player.x;
            const y = (typeof py === 'number') ? py : state.player.y;
            const dur = (typeof durSec === 'number' && durSec > 0) ? durSec : (this.INTRO_CAM_DUR || 10);
            const how = mode || (bossRef && bossRef._introMode) || 'swim';
            if (bossRef) bossRef._introMode = how;
            // Feel: flash + quake + war-horn (boss roar only — the plain roar
            // underneath was muddying it, and Stormcaller got the wrong one)
            try {
                const fl = document.getElementById('flash-overlay');
                if (fl) { fl.classList.remove('active'); void fl.offsetWidth; fl.classList.add('active'); }
            } catch (e) {}
            try { UI.triggerDamageFlash(); } catch (e) {}
            try { audio.playThunder(); } catch (e) {}
            try { audio.playBossRoar(); } catch (e) {}
            try { if (typeof GamepadControls !== 'undefined') GamepadControls.rumble(0.8, 1.0, 0.7); } catch (e) {}
            state.screenShake = Math.max(state.screenShake || 0, 32);
            // Camera lock: pan to the boss and hold for the intro. The
            // camera update tracks bossRef (bosses keep moving) and releases
            // early if the boss dies mid-intro. The boss itself stands down
            // for the same window: no movement, no skills, no contact.
            try {
                state._introCam = { x, y, t: dur, boss: bossRef || null };
                if (bossRef) {
                    bossRef.dormantUntil = (state.time || 0) + dur;
                    bossRef._introDur = dur;
                }
            } catch (e) {}
            // Sea tint: the whole map grades toward the boss's color for
            // the length of its arrival (fades on its own clock).
            try {
                state.seaTint = { color: meta.color, until: (state.time || 0) + dur };
            } catch (e) {}
            // Music, part 2 is scheduled: when the lock expires the tide
            // music fades out and the boss theme fades in (Combat.update).
            try {
                state._bossThemeAt = (state.time || 0) + dur;
            } catch (e) {}
            // Expanding shockwave rings (zero damage — pure theatre)
            try {
                state.delayedBlasts = state.delayedBlasts || [];
                [90, 170, 260].forEach((radius, i) => {
                    state.delayedBlasts.push({
                        x, y, radius, damage: 0, timer: 0.35 + i * 0.22,
                        color: meta.color, shake: 18,
                    });
                });
                Particles.spawnParticles(state, x, y, meta.color, 60, { size: 6 });
                Particles.spawnParticles(state, x, y, meta.glow, 40, { size: 4 });
            } catch (e) {}
            // Arrival-modeFX: rise erupts a water column, fall streaks down
            // from the sky. (Per-tick motion/FX continue in the dormant
            // branches of Combat / Enemies / Fishing.)
            try {
                if (how === 'rise' && typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                    for (let i = 0; i < 3; i++) {
                        Particles.spawnWaterSplashes(state, x + (Math.random() - 0.5) * 120, y + 20, 14);
                    }
                    Particles.spawnParticles(state, x, y - 40, '#7dd3fc', 30, { size: 5 });
                    state.screenShake = Math.max(state.screenShake || 0, 24);
                } else if (how === 'fall') {
                    Particles.spawnParticles(state, x, y - 260, '#e2e8f0', 40, { size: 5 });
                    Particles.spawnParticles(state, x, y - 260, meta.color, 25, { size: 4 });
                    try { audio.playThunder(); } catch (e) {}
                }
            } catch (e) {}
            if (!quietName) {
                Particles.showFloatingText(state, `🕯 ${sp.name.toUpperCase()} RISES!`, x, y - 110, '#ef4444');
            }
            // Giant flaming name banner (DOM, auto-removes). quietName
            // skips it AND the floating name above — the caller reveals
            // the name on its own beat, exactly once (see emperorIntro's
            // 8s / voidIntro's 9s reveal).
            if (!quietName) {
            try {
                const host = document.getElementById('game-container') || document.body;
                const old = document.getElementById('boss-intro-banner');
                if (old) old.remove();
                const div = document.createElement('div');
                div.id = 'boss-intro-banner';
                div.innerHTML =
                    `<div class="boss-intro-kicker">⚠ WARNING ⚠</div>` +
                    `<div class="boss-intro-name" style="--boss-color:${meta.color};--boss-glow:${meta.glow};">${sp.name.toUpperCase()}</div>` +
                    `<div class="boss-intro-sub">${meta.title}</div>`;
                host.appendChild(div);
                setTimeout(() => { try { div.remove(); } catch (e) {} }, 3000);
            } catch (e) {}
            }
        } catch (e) {}
    },

    // CRIMSON EMPEROR 10s cinematic (The Unhookable Sovereign):
    //  0-2s  bite alarm — flashing LEVIATHAN DETECTED + screech + shake
    //  2-5s  blood water erupts around the arena, fin circles the shore
    //  5-8s  sky-drop impact (mode 'fall') + tsunami rings both sides
    //  8-10s name banner + HP bar reveal + red roar shockwave, then FIGHT.
    // Timers are cosmetic (fightCountdown already froze the fight); if the
    // boss dies mid-intro the banner still fades harmlessly.
    emperorIntro(state, m) {
        try {
            const sp = m.species;
            const meta = (this.BOSS_TITLES && this.BOSS_TITLES[sp.id]) || { title: 'SOVEREIGN OF THE BLOOD TIDES', color: '#ef4444', glow: '#fbbf24' };
            m._hpHiddenUntil = (state.time || 0) + 8;
            const later = (ms, fn) => setTimeout(() => { try { fn(); } catch (e) {} }, ms);
            // 0-2s: alarm.
            [0, 700, 1400].forEach((ms) => later(ms, () => {
                Particles.showFloatingText(state, '⚠ LEVIATHAN DETECTED ⚠', state.player.x, state.player.y - 110, '#ef4444');
                state.screenShake = Math.max(state.screenShake || 0, 14);
                try { audio.playFishScreech(); } catch (e) {}
            }));
            // 2-5s: the water turns red + fin circles.
            [2000, 2900, 3800, 4700].forEach((ms, i) => later(ms, () => {
                const a = (i / 4) * Math.PI * 2;
                const fx = m.x + Math.cos(a) * 190, fy = m.y + Math.sin(a) * 120;
                try {
                    if (Particles.spawnWaterSplashes) Particles.spawnWaterSplashes(state, fx, fy, 14);
                    Particles.spawnParticles(state, fx, fy, '#7f1d1d', 22, { size: 5 });
                    Particles.spawnParticles(state, fx, fy - 30, '#dc2626', 12, { size: 4 });
                } catch (e) {}
                if (i === 0) {
                    Particles.showFloatingText(state, '🩸 THE WATER TURNS RED...', m.x, m.y - 130, '#dc2626');
                }
            }));
            // 6s: tsunami walls left + right of the impact.
            later(6000, () => {
                try {
                    state.delayedBlasts = state.delayedBlasts || [];
                    [-1, 1].forEach(s => {
                        state.delayedBlasts.push({
                            x: m.x + s * 220, y: m.y, radius: 180, damage: 0,
                            timer: 0.5, color: '#991b1b', shake: 20,
                        });
                    });
                    state.screenShake = Math.max(state.screenShake || 0, 20);
                } catch (e) {}
            });
            // 8s: name + HP reveal + deep-sea roar with red shockwave.
            later(8000, () => {
                try {
                    const host = document.getElementById('game-container') || document.body;
                    const old = document.getElementById('boss-intro-banner');
                    if (old) old.remove();
                    const div = document.createElement('div');
                    div.id = 'boss-intro-banner';
                    div.innerHTML =
                        `<div class="boss-intro-kicker">SOVEREIGN OF THE BLOOD TIDES</div>` +
                        `<div class="boss-intro-name" style="--boss-color:${meta.color};--boss-glow:${meta.glow};">${sp.name.toUpperCase()}</div>` +
                        `<div class="boss-intro-sub">${meta.title}</div>`;
                    host.appendChild(div);
                    setTimeout(() => { try { div.remove(); } catch (e) {} }, 3200);
                } catch (e) {}
                try { audio.playBossRoar(); } catch (e) {}
                try {
                    if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                        Combat.roarShockwave(state, m.x, m.y, { color: '#ef4444', rings: 5, maxR: 340, shake: 22, gap: 0.16 });
                    }
                } catch (e) {}
            });
        } catch (e) {}
    },

    // VOID LEVIATHAN cinematic — gate-path version is owned by
    // spawnVoidBossFromGate (single portal, grow-inside, swim, one name
    // banner on arrival). Here: alarm + black-sky veil only.
    // Legacy direct-spawn path (no gate): full old beats, unchanged.
    voidIntro(state, m) {
        try {
            const sp = m.species;
            const meta = (this.BOSS_TITLES && this.BOSS_TITLES[sp.id]) || { title: 'THE STAR-EATER', color: '#a855f7', glow: '#22d3ee' };
            const gatePath = !!(m._voidPortal && typeof m._voidPortal.x === 'number');
            const later = (ms, fn) => setTimeout(() => { try { fn(); } catch (e) {} }, ms);
            // Black-sky overlay node (created once, faded in/out on beats).
            try {
                const host = document.getElementById('game-container') || document.body;
                let veil = document.getElementById('void-realm-overlay');
                if (!veil) {
                    veil = document.createElement('div');
                    veil.id = 'void-realm-overlay';
                    host.appendChild(veil);
                }
                veil.style.opacity = '0';
                later(2500, () => { try { veil.style.opacity = '0.7'; } catch (e) {} });
                // Gate path swims longer: lift the sky as it reaches shore.
                later(gatePath ? 14000 : 14000, () => { try { veil.style.opacity = '0'; } catch (e) {} });
                later(gatePath ? 17000 : 16000, () => { try { veil.remove(); } catch (e) {} });
            } catch (e) {}
            // 0-3s: alarm + rendered violet bolts around the arena.
            [0, 1000, 2000].forEach((ms) => later(ms, () => {
                Particles.showFloatingText(state, '🟣 VOID ANOMALY DETECTED', state.player.x, state.player.y - 110, '#c084fc');
                state.screenShake = Math.max(state.screenShake || 0, 14);
                try {
                    if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                        Combat.strikeLightning(state, m.x + (Math.random() - 0.5) * 300, m.y + (Math.random() - 0.5) * 200, { color: '#c084fc', shake: 8 });
                    } else { try { audio.playThunder(); } catch (e) {} }
                } catch (e) {}
            }));
            if (gatePath) return; // the gate owns every later beat.
            m._hpHiddenUntil = (state.time || 0) + 7.5;
            m._sizeMult = 0.25; // grows out of the portal (see Combat)
            // Portal far at sea: east of the arena, in open water. The boss
            // starts INSIDE it and swims in over ~6s.
            let portal = null;
            try {
                if (gatePath) {
                    portal = { x: m._voidPortal.x, y: m._voidPortal.y };
                } else {
                    const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MAX_X: 4500 };
                    const tx = (m._swimIn && typeof m._swimIn.x === 'number') ? m._swimIn.x
                        : Utils.clamp(state.player.x + 140, 40, (state.waterBoundaryX || 830) - 60);
                    const ty = (m._swimIn && typeof m._swimIn.y === 'number') ? m._swimIn.y : state.player.y;
                    const px = Utils.clamp(tx + 460, (state.waterBoundaryX || 830) + 60, B.MAX_X - 60);
                    portal = { x: px, y: ty };
                    m.x = px; m.y = ty;
                    const d = Math.hypot(tx - px, 0) || 1;
                    m._swimIn = { x: tx, y: ty, spd: d / 6 };
                }
            } catch (e) {}
            // Black-sky overlay node (created once, faded in/out on beats).
            try {
                const host = document.getElementById('game-container') || document.body;
                let veil = document.getElementById('void-realm-overlay');
                if (!veil) {
                    veil = document.createElement('div');
                    veil.id = 'void-realm-overlay';
                    host.appendChild(veil);
                }
                veil.style.opacity = '0';
                later(2500, () => { try { veil.style.opacity = '0.7'; } catch (e) {} });
                later(14000, () => { try { veil.style.opacity = '0'; } catch (e) {} });
                later(16000, () => { try { veil.remove(); } catch (e) {} });
            } catch (e) {}
            // 0-3s: alarm + rendered violet bolts around the arena.
            [0, 1000, 2000].forEach((ms) => later(ms, () => {
                Particles.showFloatingText(state, '🟣 VOID ANOMALY DETECTED', state.player.x, state.player.y - 110, '#c084fc');
                state.screenShake = Math.max(state.screenShake || 0, 14);
                try {
                    if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                        Combat.strikeLightning(state, m.x + (Math.random() - 0.5) * 300, m.y + (Math.random() - 0.5) * 200, { color: '#c084fc', shake: 8 });
                    } else { try { audio.playThunder(); } catch (e) {} }
                } catch (e) {}
            }));
            // 2.5s: the portal TEARS OPEN far at sea + starfield.
            later(2500, () => {
                try {
                    if (!portal) return;
                    state.realmFx = state.realmFx || [];
                    state.realmFx.push({ x: portal.x, y: portal.y - 40, t0: state.time || 0, dur: 7.5 });
                    state.delayedBlasts = state.delayedBlasts || [];
                    [0, 1, 2].forEach(i => {
                        state.delayedBlasts.push({
                            x: portal.x, y: portal.y, radius: 120 + i * 70, damage: 0,
                            timer: 0.4 + i * 0.3, color: '#4c1d95', shake: 14,
                        });
                    });
                    Particles.showFloatingText(state, '🕳 A VOID PORTAL TEARS OPEN!', portal.x, portal.y - 150, '#c084fc');
                    state.screenShake = Math.max(state.screenShake || 0, 20);
                    for (let i = 0; i < 16; i++) {
                        Particles.spawnParticles(state,
                            portal.x + (Math.random() - 0.5) * 500, portal.y + (Math.random() - 0.5) * 340,
                            Math.random() < 0.5 ? '#e9d5ff' : '#7c3aed', 1, { size: 3 });
                    }
                } catch (e) {}
            });
            // 2.5-5s: it steps out — breach bursts around it.
            [2900, 3800, 4700].forEach((ms, i) => later(ms, () => {
                try {
                    if (Particles.spawnWaterSplashes) Particles.spawnWaterSplashes(state, m.x, m.y + 20, 16);
                    Particles.spawnParticles(state, m.x, m.y, '#1e293b', 22, { size: 6 });
                    Particles.spawnParticles(state, m.x, m.y - 34, '#22d3ee', 12, { size: 4 });
                } catch (e) {}
                if (i === 0) {
                    Particles.showFloatingText(state, '🌊 IT STEPS THROUGH!', m.x, m.y - 130, '#22d3ee');
                }
            }));
            // 5.5s: roar + Void Realm starfield while it closes in.
            // (The portal itself opened far at sea at 2.5s — see above.)
            later(5500, () => {
                try { audio.playBossRoar(); } catch (e) {}
                try {
                    if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                        Combat.roarShockwave(state, m.x, m.y, { color: '#a855f7', rings: 5, maxR: 340, shake: 22, gap: 0.16 });
                    }
                } catch (e) {}
                Particles.showFloatingText(state, '🌌 THE VOID REALM MANIFESTS', m.x, m.y - 130, '#c084fc');
            });
            [6000, 6800, 7600].forEach((ms) => later(ms, () => {
                try {
                    for (let i = 0; i < 14; i++) {
                        Particles.spawnParticles(state,
                            m.x + (Math.random() - 0.5) * 900, m.y + (Math.random() - 0.5) * 600,
                            Math.random() < 0.5 ? '#e9d5ff' : '#7c3aed', 1, { size: 3 });
                    }
                } catch (e) {}
            }));
            // 7.5s: tail-slam wave + name/HP reveal.
            later(7500, () => {
                try {
                    state.delayedBlasts = state.delayedBlasts || [];
                    state.delayedBlasts.push({
                        x: m.x, y: m.y, radius: 300, damage: 0,
                        timer: 0.4, color: '#22d3ee', shake: 24,
                    });
                    state.screenShake = Math.max(state.screenShake || 0, 24);
                } catch (e) {}
                try {
                    const host = document.getElementById('game-container') || document.body;
                    const old = document.getElementById('boss-intro-banner');
                    if (old) old.remove();
                    const div = document.createElement('div');
                    div.id = 'boss-intro-banner';
                    div.innerHTML =
                        `<div class="boss-intro-kicker">UNHOLY CATCH</div>` +
                        `<div class="boss-intro-name" style="--boss-color:${meta.color};--boss-glow:${meta.glow};">${sp.name.toUpperCase()}</div>` +
                        `<div class="boss-intro-sub">${meta.title}</div>`;
                    host.appendChild(div);
                    setTimeout(() => { try { div.remove(); } catch (e) {} }, 3200);
                } catch (e) {}
                try { audio.playBossRoar(); } catch (e) {}
            });
        } catch (e) {}
    },

    summon(state, bossId) {
        const ritual = RITUALS.find(r => r.bossId === bossId);
        if (!ritual) return false;
        // VOID path: never spawns directly — 7 shards tear a gate instead.
        if (bossId === 'void_shepherd') {
            return this.openVoidGate(state);
        }
        const chk = this.canSummon(state, ritual);
        if (!chk.ok) {
            Particles.showFloatingText(state, chk.why, state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        this.payCost(state, ritual.cost);
        // Short intro (camera beats + countdown below), then the boss wakes.
        // Arrival mode + length ride on the ritual def; the Emperor and the
        // Leviathan get full cinematics with delayed name/HP reveals.
        const isEmperor = bossId === 'crimson_emperor';
        const isVoid = bossId === 'void_shepherd';
        const m = this.spawnBoss(state, bossId, ritual.introDur || 5, ritual.intro, isEmperor || isVoid);
        if (!m) return false;
        if (isEmperor) {
            try { this.emperorIntro(state, m); } catch (e) {}
        }
        if (isVoid) {
            try { this.voidIntro(state, m); } catch (e) {}
        }
        this.fightCountdown(state, m, { delaySec: ritual.introDur || 5 });
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.render();
        return true;
    },

    // Ritual-summon fight opener: READY? then 3-2-1-FIGHT over the live
    // arena. NO teleport, NO freeze: the player keeps their position and
    // can move + shoot throughout — but the boss stays dormant (hence
    // invulnerable) until FIGHT lands, so early shots can't hurt it.
    // Hooked bosses reuse the same call (the angler never moved anyway).
    fightCountdown(state, m, opts) {
        try {
            // noTeleport is legacy (hook flow never teleported) — nobody is
            // moved anymore, on any path: you fight from where you stand.
            // Sequencing: intro cinematic (name reveal) plays FIRST, the
            // countdown starts AFTER it — never on top of it.
            const delayMs = Math.max(0, Math.min(15000, ((opts && opts.delaySec) || 0) * 1000));
            if (delayMs > 0) {
                setTimeout(() => {
                    try {
                        // Boss died mid-intro (burn/posion ticked? no — still
                        // skip the countdown for a corpse.
                        if (m && (m.isDead || (typeof m.hp === 'number' && m.hp <= 0))) return;
                        this.fightCountdown(state, m, {});
                    } catch (e) {}
                }, delayMs);
                return;
            }
            const overlay = document.getElementById('fight-ready-overlay');
            const text = document.getElementById('fight-ready-text');
            const show = (t, cls) => {
                if (!overlay || !text) return;
                overlay.classList.remove('hidden');
                // re-trigger the fade each time
                overlay.classList.remove('fight-ready-show');
                void overlay.offsetWidth;
                overlay.classList.add('fight-ready-show');
                text.innerText = t;
                text.className = 'fight-ready-text' + (cls ? ' ' + cls : '');
            };
            const hide = () => {
                if (!overlay) return;
                overlay.classList.add('hidden');
                overlay.classList.remove('fight-ready-show');
            };
            const p = state.player;
            // No freeze, no teleport: you move and shoot through the whole
            // countdown. The boss simply can't be hurt until FIGHT lands
            // (dormantUntil below covers the full 3-2-1 window).
            try {
                state.bullets = (state.bullets || []).filter(b => b && b.owner !== 'enemy');
            } catch (e) {}
            // The boss stays down through the whole countdown (covers the
            // 3-2-1 window even when the intro was short).
            try {
                if (m) m.dormantUntil = Math.max(m.dormantUntil || 0, (state.time || 0) + 5.5);
            } catch (e) {}
            show(T('fight_ready'));
            try { audio.playUIClick(); } catch (e) {}
            const steps = ['3', '2', '1', T('fight_go')];
            steps.forEach((s, i) => {
                setTimeout(() => {
                    show(s, s === T('fight_go') ? 'fight-ready-go' : '');
                    try {
                        if (s === T('fight_go')) audio.playRoar();
                        else audio.playUIClick();
                    } catch (e) {}
                    if (s === T('fight_go')) {
                        setTimeout(hide, 650);
                        UI.updateStatusBanner(T('fight_go'), 'Boss', 'rose');
                    }
                }, 1300 + i * 800);
            });
        } catch (e) {}
    },

    // ---------- modal ----------
    open(state) {
        this.state = state || this.state;
        if (!this.state) return;
        this.ensure(this.state);
        const modal = document.getElementById('ritual-modal');
        if (!modal) return;
        try { audio.playUIClick(); } catch (e) {}
        this.render();
        modal.classList.remove('hidden');
        const c = document.getElementById('btn-ritual-close');
        if (c) c.onclick = () => this.close();
    },

    close() {
        const modal = document.getElementById('ritual-modal');
        if (modal) modal.classList.add('hidden');
        try { audio.playUIClick(); } catch (e) {}
    },

    isOpen() {
        const modal = document.getElementById('ritual-modal');
        return !!(modal && !modal.classList.contains('hidden'));
    },

    // Shared stash panel (ritual modal + bait tab): live bucket counts.
    // Shows sell price + locked keepers (locked items can't be spent).
    stashLine(state) {
        const chip = (color, icon, name, n, price, locked) => {
            const lockTxt = locked > 0 ? ` <span style="opacity:0.75">🔒${locked}</span>` : '';
            const priceTxt = price > 0 ? ` · ${price}c` : '';
            return `<span class="px-2 py-1 rounded-lg text-[10px] font-black border" style="color:${color};border-color:${color}55;background:${color}14">${icon} ${name} ×${n}${lockTxt}${priceTxt}</span>`;
        };
        const keyChip = (k) => {
            const total = this.countItemAll(state, k);
            const unlocked = this.countItem(state, k);
            return chip(BOSS_KEYS[k].color, BOSS_KEYS[k].icon, BOSS_KEYS[k].name, total, this.keyValue(k), total - unlocked);
        };
        const troIcons = { chalice: '🏆', fang: '🦷', eye: '👁️', crown: '👑' };
        const troChip = (k) => {
            const total = this.countItemAll(state, k);
            const unlocked = this.countItem(state, k);
            return chip(TROPHIES[k].color, TROPHIES[k].icon || troIcons[k] || '🏆', TROPHIES[k].name, total, this.keyValue(k), total - unlocked);
        };
        const keys = Object.keys(BOSS_KEYS).map(keyChip).join('');
        const tros = Object.keys(TROPHIES).map(troChip).join('');
        return `<div class="flex gap-1.5 justify-center flex-wrap">${keys}</div>
            <div class="flex gap-1.5 justify-center flex-wrap mt-1.5">${tros}</div>`;
    },

    render() {
        const st = this.state;
        const box = document.getElementById('ritual-content');
        if (!st || !box) return;
        this.ensure(st);
        const p = st.player;
        let html = `<div class="glass-panel-light p-3 rounded-xl mb-3 text-center">
            <div class="text-[10px] font-black tracking-widest text-slate-400 mb-1.5">SUMMON STASH (physical bucket loot — walk over drops to grab)</div>
            ${this.stashLine(st)}
            <div class="text-[10px] text-slate-500 mt-1.5">🥚 Egg: Stormcaller + gulls + legendary catches · 🔮 Shard: <b>void-tainted</b> jumpers & catches only · 🏆 Trophies: boss kills.<br>Priest: Marlin's rite · Hydra: hook it with a Hydra Lure.</div>
        </div>`;
        // Stormcaller keeps her kill-quest (no key, no ritual)
        const gulls = p.seagullKills || 0;
        const gSlain = (p.slainBosses || []).includes('stormcaller');
        html += `<div class="glass-panel p-3 rounded-xl mb-2 border ${gSlain ? 'border-emerald-500/50' : 'border-red-500/40'}">
            <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="font-bold text-white text-sm">⛈ Stormcaller ${gSlain ? '<span class="text-[9px] text-emerald-300 font-black">SLAIN ✓</span>' : ''}</div>
                    <div class="text-[10px] text-slate-400">Quest: slay 20 seagulls (${gulls % 20}/20) — she comes on her own. Drops a Storm Egg.</div>
                </div>
            </div>
        </div>`;
        // Marlin's rite (Priest is quest-summoned, not pad-summoned)
        const pSlain = (p.slainBosses || []).includes('leviathan_priest');
        html += `<div class="glass-panel p-3 rounded-xl mb-2 border ${pSlain ? 'border-emerald-500/50' : 'border-red-500/40'}">
            <div class="min-w-0">
                <div class="font-bold text-white text-sm">🌊 Leviathan Priest ${pSlain ? '<span class="text-[9px] text-emerald-300 font-black">SLAIN ✓</span>' : ''}</div>
                <div class="text-[10px] text-slate-400">Marlin trades 10× blood-mutated epic+ catches for the Heart of the Sea — feed it to the circle below.</div>
            </div>
        </div>`;
        // Hydra is hook-summoned, not pad-summoned
        const hSlain = (p.slainBosses || []).includes('stormlord_hydra');
        const hLures = (p.baitStock || {}).lure_hydra || 0;
        html += `<div class="glass-panel p-3 rounded-xl mb-2 border ${hSlain ? 'border-emerald-500/50' : 'border-red-500/40'}">
            <div class="min-w-0">
                <div class="font-bold text-white text-sm">🌀 Stormlord Hydra ${hSlain ? '<span class="text-[9px] text-emerald-300 font-black">SLAIN ✓</span>' : ''}</div>
                <div class="text-[10px] text-slate-400">Bake a Storm Egg into a Hydra Lure (Bait tab), EQUIP it, and fish — 30% of hooks grab the Hydra itself. Lures held: ${hLures}.</div>
            </div>
        </div>`;
        // Priest is sacrifice-summoned: 3 blood epic+ + Heart of the Sea.
        // The cutscene merges them into a Bloodheart Lure (100% hook).
        try {
            const prSlain = (p.slainBosses || []).includes('leviathan_priest');
            const prBlood = this.countMutation(st, 'blood');
            const prHeart = this.countItem(st, 'heart_sea');
            const prLures = (p.baitStock || {}).bloodheart_lure || 0;
            const prBusy = this.bossAlive(st);
            let prClient = false;
            try { prClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()); } catch (e) {}
            const prOk = prBlood >= 3 && prHeart >= 1 && !prBusy && !prClient && !(st.player && st.player.onIsland);
            const prWhy = prClient ? 'Only the host can perform rituals.'
                : prBusy ? 'A boss already walks. Slay it first.'
                : (st.player && st.player.onIsland) ? 'No ritual ground here — sail back to the mainland beach.'
                : `Missing: ${prBlood < 3 ? `🩸 blood epic+ (${prBlood}/3)` : ''}${prBlood < 3 && prHeart < 1 ? ' · ' : ''}${prHeart < 1 ? `💙 Heart (${prHeart}/1)` : ''}`;
            html += `<div class="glass-panel p-3 rounded-xl mb-2 border ${prSlain ? 'border-emerald-500/50' : 'border-rose-500/40'}">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white text-sm">🩸 Leviathan Priest
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/50">BOSS</span>
                            ${prSlain ? '<span class="text-[9px] text-emerald-300 font-black">SLAIN ✓</span>' : ''}
                        </div>
                        <div class="text-[10px] text-slate-400">Sacrifice 3× 🩸 blood-mutated epic+ fish + 1× 💙 Heart of the Sea (Marlin) — forge a Bloodheart Lure. Lures held: ${prLures}.</div>
                        <div class="flex gap-2 mt-1 text-[10px] font-bold flex-wrap">
                            <span class="${prBlood >= 3 ? 'text-emerald-300' : 'text-slate-400'}">🩸 Blood epic+ (${prBlood}/3)</span>
                            <span class="${prHeart >= 1 ? 'text-emerald-300' : 'text-slate-400'}">💙 Heart (${prHeart}/1)</span>
                        </div>
                        ${prOk ? '' : `<div class="text-[10px] text-amber-300/80 mt-0.5">${prWhy}</div>`}
                    </div>
                    <button data-priest-sacrifice ${prOk ? '' : 'disabled'}
                        class="px-4 py-2 text-xs font-black rounded-xl shrink-0 transition-all ${prOk ? 'bg-gradient-to-r from-red-500 to-amber-500 hover:from-red-400 hover:to-amber-400 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}">
                        SACRIFICE
                    </button>
                </div>
            </div>`;
        } catch (e) {}
        RITUALS.forEach(r => {
            const rs = this.ritualState(st, r);
            const sp = rs.sp || { name: r.bossId, color: '#ef4444', rarity: 'boss' };
            const chk = this.canSummon(st, r);
            const costHtml = rs.lines.map(l =>
                `<span class="${l.have >= l.need ? 'text-emerald-300' : 'text-slate-400'}">${l.label} (${l.have}/${l.need})</span>`
            ).join('');
            const isVoid = r.bossId === 'void_shepherd';
            let extra = '';
            if (isVoid) {
                try {
                    this.ensureVoidTemple(st);
                    const vt = st.player.voidTemple || {};
                    if (vt.gateOpen) extra = `<div class="text-[10px] text-fuchsia-300 font-black mt-0.5">🕳 GATE OPEN — press E at the cave circle to enter the shrine!</div>`;
                    else if (this.isTempleComplete(st)) extra = `<div class="text-[10px] text-emerald-300 font-black mt-0.5">🌀 SHRINE COMPLETE — the Star-Eater comes!</div>`;
                    else {
                        const legs = (typeof VOID_TEMPLE_OFFERINGS !== 'undefined' ? VOID_TEMPLE_OFFERINGS : []).map(o => {
                            const done = !!((vt.legs || {})['slot' + o.slot]);
                            return `${done ? '✅' : '▫️'}void-${o.rarity}`;
                        }).join(' · ');
                        extra = `<div class="text-[10px] text-slate-500 mt-0.5">Shrine: ${legs} · ${vt.key ? '✅' : '▫️'}void_key</div>`;
                    }
                } catch (e) {}
            }
            const btnLabel = isVoid ? 'OPEN GATE' : 'SUMMON';
            html += `<div class="glass-panel p-3 rounded-xl mb-2 border ${rs.slain ? 'border-emerald-500/50' : 'border-red-500/40'}">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white text-sm">🕯 ${sp.name}
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/50">BOSS</span>
                            ${rs.slain ? '<span class="text-[9px] text-emerald-300 font-black">SLAIN ✓</span>' : ''}
                        </div>
                        <div class="text-[10px] text-slate-400">${r.blurb}</div>
                        <div class="flex gap-2 mt-1 text-[10px] font-bold flex-wrap">${costHtml}</div>
                        ${extra}
                        ${chk.ok ? '' : `<div class="text-[10px] text-amber-300/80 mt-0.5">${chk.why}</div>`}
                    </div>
                    <button data-summon="${r.bossId}" ${chk.ok ? '' : 'disabled'}
                        class="px-4 py-2 text-xs font-black rounded-xl shrink-0 transition-all ${chk.ok ? 'bg-gradient-to-r from-red-500 to-amber-500 hover:from-red-400 hover:to-amber-400 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}">
                        ${btnLabel}
                    </button>
                </div>
            </div>`;
        });
        box.innerHTML = html;
        box.querySelectorAll('[data-summon]').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                if (this.summon(st, btn.dataset.summon)) this.close();
                else this.render();
            };
        });
        box.querySelectorAll('[data-priest-sacrifice]').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                if (this.priestSacrifice(st)) this.close();
                else this.render();
            };
        });
    },

    // Animated void portal (beach cave mouth). Pure canvas: layered
    // glow, dark event horizon, counter-rotating void wisps, orbiting
    // sparks and a breathing rim. Sealed state is dimmer + rock-chained.
    drawVoidPortal(ctx, x, y, t, unlocked, near, squash) {
        const open = !!unlocked;
        const pulse = 1 + Math.sin(t * 3) * 0.04;
        const R = 52 * pulse;
        const sq = (typeof squash === 'number') ? squash : 0.66;
        ctx.save();
        ctx.translate(x, y);
        // Outer void haze
        const haze = ctx.createRadialGradient(0, 0, 4, 0, 0, R * 2.1);
        haze.addColorStop(0, open ? 'rgba(124,58,237,0.45)' : 'rgba(124,58,237,0.16)');
        haze.addColorStop(0.55, open ? 'rgba(76,29,149,0.28)' : 'rgba(76,29,149,0.10)');
        haze.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haze;
        ctx.beginPath(); ctx.arc(0, 0, R * 2.1, 0, Math.PI * 2); ctx.fill();
        // Scorched sand ring
        ctx.strokeStyle = open ? 'rgba(196,181,253,0.5)' : 'rgba(87,83,126,0.7)';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(0, 0, R + 8, R * sq + 8, 0, 0, Math.PI * 2); ctx.stroke();
        // Event horizon (dark disc; squashed on the beach, round on the wall)
        const core = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
        core.addColorStop(0, '#000000');
        core.addColorStop(0.55, open ? '#12041f' : '#0b0b12');
        core.addColorStop(0.85, open ? '#3b1470' : '#23232f');
        core.addColorStop(1, open ? '#7c3aed' : '#3a3a48');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.ellipse(0, 0, R, R * sq, 0, 0, Math.PI * 2); ctx.fill();
        // Swirl arms (clip to the disc so wisps never spill onto sand)
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, 0, R, R * sq, 0, 0, Math.PI * 2); ctx.clip();
        for (let arm = 0; arm < 3; arm++) {
            ctx.save();
            ctx.rotate(t * (open ? 1.6 : 0.4) + arm * (Math.PI * 2 / 3));
            ctx.scale(1, sq);
            const grad = ctx.createLinearGradient(R * 0.15, 0, R, 0);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, open ? 'rgba(168,85,247,0.85)' : 'rgba(120,113,170,0.4)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = open ? 7 : 4;
            ctx.lineCap = 'round';
            ctx.shadowColor = open ? '#a855f7' : '#55556a';
            ctx.shadowBlur = open ? 14 : 4;
            ctx.beginPath();
            ctx.arc(0, 0, R * (0.55 + arm * 0.14), 0.2, 1.7);
            ctx.stroke();
            ctx.restore();
        }
        // Inner throat: deep black hole that breathes
        ctx.fillStyle = '#000';
        const throat = (open ? 15 : 9) + Math.sin(t * (open ? 4 : 1.5)) * 2;
        ctx.beginPath(); ctx.ellipse(0, 0, throat, throat * (sq < 1 ? 0.62 : 1), 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Breathing rim light
        ctx.strokeStyle = open ? '#c4b5fd' : '#52525b';
        ctx.lineWidth = open ? 3 : 2;
        ctx.shadowColor = open ? '#a855f7' : 'transparent';
        ctx.shadowBlur = open ? (near ? 22 : 12) : 0;
        ctx.beginPath(); ctx.ellipse(0, 0, R, R * sq, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        // Orbiting void sparks (deterministic — no allocation)
        if (open) {
            for (let k = 0; k < 10; k++) {
                const a = t * 1.9 + k * (Math.PI * 2 / 10);
                const rr = R + 10 + Math.sin(t * 2 + k * 1.3) * 5;
                const sx = Math.cos(a) * rr;
                const sy = Math.sin(a) * rr * sq;
                const tw = 0.5 + Math.sin(t * 6 + k * 2.2) * 0.5;
                ctx.globalAlpha = 0.35 + tw * 0.65;
                ctx.fillStyle = k % 3 === 0 ? '#f0abfc' : '#a855f7';
                ctx.beginPath(); ctx.arc(sx, sy, 1.5 + tw * 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        } else {
            // Sealed: chains of rock across the mouth
            ctx.fillStyle = '#3f3f4d';
            ctx.beginPath(); ctx.ellipse(-R * 0.35, -2, 16, 10, 0.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#55555f';
            ctx.beginPath(); ctx.ellipse(R * 0.3, 3, 19, 11, -0.3, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(248,113,113,0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.lineDashOffset = -t * 12;
            ctx.beginPath(); ctx.ellipse(0, 0, R + 4, (R + 4) * sq, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    },

    // Slow gate birth: 0 -> crack fissure, 0.35 -> tear, 1 -> wide rift.
    // Jagged crack polyline + radiating fissures + violet rift + shards.
    drawVoidGateOpening(ctx, x, y, t, prog, near) {
        const open = Math.max(0, Math.min(1, prog));
        ctx.save();
        ctx.translate(x, y);
        // Stone arch backdrop (always solid).
        ctx.fillStyle = '#23232f';
        ctx.beginPath(); ctx.ellipse(0, -6, 86, 100, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4c4c62';
        ctx.lineWidth = 4;
        ctx.stroke();
        // Crack: vertical jagged fissure, grows with prog.
        const segs = 9;
        const len = 20 + open * 150;
        ctx.save();
        ctx.strokeStyle = open < 0.35 ? '#7c3aed' : '#e9d5ff';
        ctx.lineWidth = 2 + open * 4;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 6 + open * 22;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
            const k = i / segs;
            if (k > open + 0.08) break;
            const yy = -len / 2 + k * len;
            const xx = Math.sin(i * 2.3 + 1) * (6 + open * 14);
            if (i === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.restore();
        // Radiating hairline cracks (appear once tearing).
        if (open > 0.3) {
            ctx.save();
            ctx.strokeStyle = 'rgba(168,85,247,0.8)';
            ctx.lineWidth = 1.5;
            for (let c = 0; c < 7; c++) {
                const a = (c / 7) * Math.PI * 2 + 0.4;
                const r0 = 30 + open * 30, r1 = r0 + 26 + ((c * 37) % 30);
                ctx.globalAlpha = Math.min(1, (open - 0.3) * 2.5);
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 1.1);
                ctx.lineTo(Math.cos(a + 0.15) * ((r0 + r1) / 2), Math.sin(a + 0.15) * ((r0 + r1) / 2) * 1.1);
                ctx.lineTo(Math.cos(a - 0.1) * r1, Math.sin(a - 0.1) * r1 * 1.1);
                ctx.stroke();
            }
            ctx.restore();
        }
        // Rift body (only once half torn).
        if (open > 0.45) {
            const rk = (open - 0.45) / 0.55;
            const R = 18 + rk * 46;
            ctx.save();
            const haze = ctx.createRadialGradient(0, 0, 4, 0, 0, R * 2.2);
            haze.addColorStop(0, 'rgba(124,58,237,0.55)');
            haze.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = haze;
            ctx.beginPath(); ctx.arc(0, 0, R * 2.2, 0, Math.PI * 2); ctx.fill();
            const core = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
            core.addColorStop(0, '#000000');
            core.addColorStop(0.6, '#1c0633');
            core.addColorStop(1, '#7c3aed');
            ctx.fillStyle = core;
            ctx.beginPath(); ctx.ellipse(0, 0, R * (0.55 + rk * 0.2), R, 0, 0, Math.PI * 2); ctx.fill();
            ctx.save();
            ctx.beginPath(); ctx.ellipse(0, 0, R * 0.75, R, 0, 0, Math.PI * 2); ctx.clip();
            for (let arm = 0; arm < 3; arm++) {
                ctx.save();
                ctx.rotate(t * 1.8 + arm * (Math.PI * 2 / 3));
                const grad = ctx.createLinearGradient(6, 0, R, 0);
                grad.addColorStop(0, 'rgba(0,0,0,0)');
                grad.addColorStop(1, 'rgba(233,213,255,0.9)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.shadowColor = '#a855f7';
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(0, 0, R * (0.5 + arm * 0.15), 0.2, 1.7);
                ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
            for (let k = 0; k < 8; k++) {
                const a = t * 2 + k * (Math.PI * 2 / 8);
                const rr = R + 12 + Math.sin(t * 2.4 + k) * 5;
                ctx.globalAlpha = 0.5 + Math.sin(t * 6 + k * 2) * 0.3;
                ctx.fillStyle = k % 2 ? '#e9d5ff' : '#a855f7';
                ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.restore();
        }
        if (open >= 1) {
            ctx.strokeStyle = near ? '#e9d5ff' : '#8b5cf6';
            ctx.lineWidth = near ? 3.5 : 2.5;
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = near ? 22 : 12;
            ctx.beginPath(); ctx.ellipse(0, 0, 64, 78, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    },

    // Rendered heart model (Heart of the Sea / Bloodheart): bezier heart
    // with gradient + breathing glow + orbiting sparks.
    drawHeart(ctx, x, y, s, cA, cB, t) {
        try {
            const pulse = 1 + Math.sin((t || 0) * 3) * 0.08;
            const r = s * pulse;
            ctx.save();
            ctx.translate(x, y);
            ctx.shadowColor = cA;
            ctx.shadowBlur = 22;
            const g = ctx.createLinearGradient(0, -r, 0, r);
            g.addColorStop(0, cA);
            g.addColorStop(1, cB);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, r * 0.9);
            ctx.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.8, -r * 1.1, 0, -r * 0.35);
            ctx.bezierCurveTo(r * 0.8, -r * 1.1, r * 1.5, -r * 0.1, 0, r * 0.9);
            ctx.fill();
            ctx.shadowBlur = 0;
            // Inner shine.
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2);
            ctx.fill();
            // Orbiting sparks.
            for (let i = 0; i < 5; i++) {
                const a = (t || 0) * 2.2 + i * (Math.PI * 2 / 5);
                ctx.fillStyle = cA;
                ctx.globalAlpha = 0.7;
                ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, 2.4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        } catch (e) {}
    },

    // Circled-E badge (radar style): bobbing ⓔ above an interact point.
    drawEBubble(ctx, x, y, t, color) {
        try {
            const bob = Math.sin(t * 4) * 3;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = 'black 22px Work Sans';
            ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText('ⓔ', x, y + bob);
            ctx.fillStyle = color || '#fef08a';
            ctx.fillText('ⓔ', x, y + bob);
            ctx.restore();
        } catch (e) {}
    },

    // ---------- world: beach hole + rune puzzle; pad pentacle (cave) ------
    drawWorld(state, ctx) {
        const s = this.spot(state);
        const t = state.time || 0;
        const p = state.player;
        const inCave = !!p.inCave;
        const near = Math.hypot(p.x - s.x, p.y - s.y) < this.RADIUS + 50;
        const h = this.caveHole(state);
        const unlocked = !!p.caveUnlocked;
        const seq = state._caveSeq || 0;
        const nearHole = Math.hypot(p.x - h.x, p.y - h.y) < 120;
        ctx.save();
        // Beach-side portal + runes live on the sand only. Inside the cave
        // the chamber (drawCaveInterior) is the whole world — drawing the
        // beach hole here would double-draw far off-screen.
        if (!inCave) {
        // --- VOID PORTAL: swirling abyss in the SW corner sand.
        // Sealed = cracked rock + faint void seep; open = full vortex.
        this.drawVoidPortal(ctx, h.x, h.y, t, unlocked, nearHole);
        // Cave sign + seal state
        ctx.textAlign = 'center';
        ctx.font = 'black 24px Work Sans';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('🕳 SEALED CAVE', h.x, h.y - 62);
        ctx.fillStyle = unlocked ? '#34d399' : '#f87171';
        ctx.fillText('🕳 SEALED CAVE', h.x, h.y - 62);
        ctx.font = 'bold 14px Work Sans';
        ctx.lineWidth = 4;
        const sealHint = unlocked
            ? (nearHole ? 'ⓔ Descend!' : 'The seal is broken — descend!')
            : 'Sealed! Offer fish at runes 1 → 2 → 3';
        ctx.strokeText(sealHint, h.x, h.y + 62);
        ctx.fillStyle = unlocked ? '#6ee7b7' : '#fca5a5';
        ctx.fillText(sealHint, h.x, h.y + 62);
        if (nearHole && unlocked) this.drawEBubble(ctx, h.x, h.y - 96, t);
        // Rune stones (puzzle): numbered, next one pulses, cost below
        this.runeStones(state).forEach((st, i) => {
            const isNext = !unlocked && i === seq;
            const isDone = !unlocked && i < seq;
            const cost = this.runeCost(i);
            const afford = this.runeHasCost(state, i);
            const pulse = isNext ? (1 + Math.sin(t * 6) * 0.15) : 1;
            ctx.save();
            ctx.translate(st.x, st.y);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = isDone ? '#0b2e1f' : '#2b2b38';
            ctx.strokeStyle = isDone ? '#34d399' : (isNext && !afford ? '#f87171' : st.color);
            ctx.lineWidth = isNext ? 4 : 2.5;
            if (isNext) { ctx.shadowColor = afford ? st.color : '#f87171'; ctx.shadowBlur = 18; }
            ctx.beginPath();
            ctx.moveTo(0, -26); ctx.lineTo(20, 10); ctx.lineTo(-20, 10);
            ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = isDone ? '#34d399' : '#ffffff';
            ctx.font = 'black 20px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillText(String(st.n), 0, 8);
            ctx.restore();
            // Offering cost tag under each undone rune
            if (!unlocked && !isDone && cost) {
                ctx.font = 'bold 12px Work Sans';
                ctx.textAlign = 'center';
                ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                ctx.strokeText(cost.label, st.x, st.y + 30);
                ctx.fillStyle = afford ? '#e2e8f0' : '#f87171';
                ctx.fillText(cost.label, st.x, st.y + 30);
            }
        });
        }
        // Blood-red pad + rotating pentacle (now inside the cave)
        ctx.globalAlpha = near ? 0.32 : 0.16;
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath(); ctx.arc(s.x, s.y, this.RADIUS, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = near ? '#ef4444' : '#991b1b';
        ctx.lineWidth = near ? 4 : 2.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, this.RADIUS * 0.8, 0, Math.PI * 2); ctx.stroke();
        // Rotating star
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(t * 0.3);
        ctx.strokeStyle = near ? '#fca5a5' : '#7f1d1d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 5; i++) {
            const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
            const px = Math.cos(a) * this.RADIUS * 0.62;
            const py = Math.sin(a) * this.RADIUS * 0.62;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
        // Candle flickers
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 + 0.4;
            const cx = s.x + Math.cos(a) * this.RADIUS * 0.92;
            const cy = s.y + Math.sin(a) * this.RADIUS * 0.92;
            const fl = 3 + Math.sin(t * 9 + i * 2) * 1.5;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(cx, cy, fl, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(251,191,36,0.25)';
            ctx.beginPath(); ctx.arc(cx, cy, fl * 2.4, 0, Math.PI * 2); ctx.fill();
        }
        // Label
        ctx.textAlign = 'center';
        ctx.font = 'black 24px Work Sans';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('🕯 RITUAL', s.x, s.y - 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🕯 RITUAL', s.x, s.y - 6);
        ctx.font = 'bold 15px Work Sans';
        ctx.lineWidth = 4;
        const hint = near ? 'ⓔ Enter' : 'Walk in + ⓔ';
        ctx.strokeText(hint, s.x, s.y + 24);
        ctx.fillStyle = near ? '#fef08a' : '#ef4444';
        ctx.fillText(hint, s.x, s.y + 24);
        if (near) this.drawEBubble(ctx, s.x, s.y - this.RADIUS - 30, t);
        // PRIEST SACRIFICE cutscene (cave circle): 3 blood fish hover at
        // triangle corners, heart middle; they spiral in and merge.
        try {
            const rite = state._priestRite;
            if (rite && p.inCave && !p.inVoidTemple) {
                const e = (state.time || 0) - (rite.t0 || 0);
                // Heart reveal: the forged Bloodheart hovers over the
                // circle in a pillar of light (after the cover burns off).
                if (rite.done && (state.time || 0) < (rite.heartUntil || 0)) {
                    const hy = rite.cy - 110 + Math.sin(t * 2) * 8;
                    ctx.save();
                    const beam = ctx.createLinearGradient(0, hy - 200, 0, hy + 60);
                    beam.addColorStop(0, 'rgba(251,191,36,0)');
                    beam.addColorStop(1, 'rgba(251,191,36,0.35)');
                    ctx.fillStyle = beam;
                    ctx.fillRect(rite.cx - 30, hy - 200, 60, 260);
                    ctx.restore();
                    try { this.drawHeart(ctx, rite.cx, hy, 34, '#ef4444', '#7f1d1d', t); } catch (e2) {}
                    try {
                        if (Math.random() < 0.5) Particles.spawnParticles(state, rite.cx + (Math.random() - 0.5) * 90, hy + (Math.random() - 0.5) * 60, '#fbbf24', 1, { size: 3 });
                    } catch (e2) {}
                    ctx.textAlign = 'center';
                    ctx.font = 'black 18px Work Sans';
                    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                    ctx.strokeText('❤️‍🔥 BLOODHEART OF THE ABYSS', rite.cx, hy - 60);
                    ctx.fillStyle = '#fbbf24';
                    ctx.fillText('❤️‍🔥 BLOODHEART OF THE ABYSS', rite.cx, hy - 60);
                    return;
                }
                // Merge cover orb: a blood globe swallows the whole group
                // so the models vanish inside it before the reveal.
                if (rite.burst && !rite.done) {
                    const bk = Math.max(0, Math.min(1, ((state.time || 0) - (rite.coverFrom || 0)) / 0.6));
                    const br = 60 + bk * 170;
                    ctx.save();
                    const cov = ctx.createRadialGradient(rite.cx, rite.cy - 70, 4, rite.cx, rite.cy - 70, br);
                    cov.addColorStop(0, `rgba(127,29,29,${0.75 + bk * 0.25})`);
                    cov.addColorStop(0.7, `rgba(220,38,38,${0.65 + bk * 0.3})`);
                    cov.addColorStop(1, 'rgba(220,38,38,0)');
                    ctx.fillStyle = cov;
                    ctx.beginPath(); ctx.arc(rite.cx, rite.cy - 70, br, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = `rgba(254,202,202,${0.5 + bk * 0.5})`;
                    ctx.lineWidth = 3 + bk * 4;
                    ctx.shadowColor = '#ef4444';
                    ctx.shadowBlur = 24;
                    ctx.beginPath(); ctx.arc(rite.cx, rite.cy - 70, br * 0.9, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                    return;
                }
                // Forged and claimed: nothing left to draw.
                if (rite.done) return;
                const prog = Math.max(0, Math.min(1, e / 7));
                const rad = 150 * (1 - prog * 0.87);
                const spin = e * (1.2 + prog * 6);
                // Heart of the Sea, center (rendered model).
                try { this.drawHeart(ctx, rite.cx, rite.cy - 70 + Math.sin(t * 2) * 6, 26, '#38bdf8', '#0ea5e9', t); } catch (e2) {}
                // The three offerings spiral inward, faster and faster.
                (rite.fish || []).forEach((sp, i) => {
                    const a = spin + i * (Math.PI * 2 / 3);
                    const fx = rite.cx + Math.cos(a) * rad;
                    const fy = rite.cy - 70 + Math.sin(a) * rad * 0.7 + Math.sin(t * 3 + i) * 6;
                    try {
                        if (typeof Render !== 'undefined' && Render.drawFishModel) {
                            Render.drawFishModel(ctx, fx, fy, Math.max(20, ((sp && sp.size) || 36) * 0.65), sp, { glow: true, angle: Math.sin(t * 2 + i) * 0.3 });
                        }
                    } catch (e2) {}
                    try {
                        Particles.spawnParticles(state, fx, fy, '#dc2626', 1, { size: 3 });
                    } catch (e2) {}
                });
                // Inward energy streams.
                ctx.save();
                ctx.strokeStyle = `rgba(220,38,38,${0.35 + prog * 0.5})`;
                ctx.lineWidth = 2 + prog * 3;
                ctx.shadowColor = '#dc2626';
                ctx.shadowBlur = 10 + prog * 14;
                for (let i = 0; i < 3; i++) {
                    const a = spin + i * (Math.PI * 2 / 3);
                    ctx.beginPath();
                    ctx.moveTo(rite.cx + Math.cos(a) * (rad + 30), rite.cy - 70 + Math.sin(a) * (rad + 30) * 0.7);
                    ctx.lineTo(rite.cx, rite.cy - 70);
                    ctx.stroke();
                }
                ctx.restore();
            }
        } catch (e) {}
        // PRIEST RITUAL CIRCLE under the player's feet (hook cinematic).
        try {
            const pc = state._priestCircle;
            if (pc && !p.inCave && !p.onIsland) {
                const e3 = (state.time || 0) - (pc.t0 || 0);
                if (e3 < 14) {
                    const R = 120;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, 1 - e3 / 14);
                    ctx.strokeStyle = '#0ea5e9';
                    ctx.lineWidth = 4;
                    ctx.shadowColor = '#38bdf8';
                    ctx.shadowBlur = 18;
                    ctx.beginPath(); ctx.arc(pc.x, pc.y, R, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.arc(pc.x, pc.y, R * 0.7, 0, Math.PI * 2); ctx.stroke();
                    // Rotating rune ring.
                    ctx.save();
                    ctx.translate(pc.x, pc.y);
                    ctx.rotate(e3 * 1.5);
                    ctx.fillStyle = '#7dd3fc';
                    ctx.font = 'bold 20px Work Sans';
                    ctx.textAlign = 'center';
                    for (let i = 0; i < 8; i++) {
                        const a = i * Math.PI / 4;
                        ctx.fillText('◈', Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85 + 7);
                    }
                    ctx.restore();
                    ctx.restore();
                }
            }
        } catch (e) {}
        // PRIEST TSUNAMI wall rolling toward the beach.
        try {
            const ts = state._priestTsunami;
            if (ts && !ts.done && !p.inCave && !p.onIsland) {
                const e4 = (state.time || 0) - (ts.t0 || 0);
                const wx = (ts.x || 2000) - (e4 / 5) * 700;
                const wy = ts.y || 1500;
                ctx.save();
                const wg = ctx.createLinearGradient(0, wy - 240, 0, wy + 40);
                wg.addColorStop(0, 'rgba(125,211,252,0.85)');
                wg.addColorStop(0.7, 'rgba(14,116,144,0.9)');
                wg.addColorStop(1, 'rgba(2,44,74,0.9)');
                ctx.fillStyle = wg;
                ctx.beginPath();
                ctx.moveTo(wx - 260, wy + 60);
                ctx.quadraticCurveTo(wx - 100, wy - 260, wx + 120, wy - 180);
                ctx.quadraticCurveTo(wx + 220, wy - 60, wx + 260, wy + 60);
                ctx.closePath(); ctx.fill();
                // Foam crest.
                ctx.strokeStyle = '#f0f9ff';
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(wx - 240, wy + 30);
                ctx.quadraticCurveTo(wx - 90, wy - 240, wx + 110, wy - 165);
                ctx.stroke();
                ctx.restore();
            }
        } catch (e) {}
        // VOID GATE: torn rift on the NORTH wall above the pad (never on
        // the circle). Slow crack opening: fissure -> tear -> wide rift.
        try {
            const vt = (p.voidTemple && typeof p.voidTemple === 'object') ? p.voidTemple : null;
            if (vt && vt.gateOpen && p.inCave && !p.inVoidTemple) {
                const g = this.voidGatePos();
                const born = (typeof state._voidGateBorn === 'number') ? state._voidGateBorn : (state.time || 0);
                const prog = Math.max(0, Math.min(1, ((state.time || 0) - born) / 6));
                const nearGate = Math.hypot(p.x - g.x, p.y - g.y) < 170;
                this.drawVoidGateOpening(ctx, g.x, g.y, t, prog, nearGate);
                ctx.textAlign = 'center';
                ctx.font = 'black 22px Work Sans';
                ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                ctx.strokeText('🕳 VOID GATE', g.x, g.y - 120);
                ctx.fillStyle = '#e9d5ff';
                ctx.fillText('🕳 VOID GATE', g.x, g.y - 120);
                ctx.font = 'bold 14px Work Sans';
                ctx.lineWidth = 4;
                const gh = prog < 1
                    ? 'The stone cracks... the rift widens...'
                    : (nearGate ? 'ⓔ Enter the shrine!' : 'A rift yawns — step close + ⓔ');
                ctx.strokeText(gh, g.x, g.y + 96);
                ctx.fillStyle = nearGate && prog >= 1 ? '#fef08a' : '#c4b5fd';
                ctx.fillText(gh, g.x, g.y + 96);
                if (nearGate && prog >= 1) this.drawEBubble(ctx, g.x, g.y - 158, t);
            }
        } catch (e) {}
        // VOID SHRINE pillars: QUARTZ altars. Names are NEVER shown —
        // only pillar numerals + riddles (the black book holds the verse).
        try {
            if (p.inVoidTemple) {
                const ROMAN = ['I', 'II', 'III', 'IV'];
                const pillars = this.voidPillars();
                pillars.forEach((pl) => {
                    const isNear = Math.hypot(p.x - pl.x, p.y - pl.y) < pl.r + 70;
                    // Quartz altar: faceted violet crystal column.
                    ctx.save();
                    ctx.fillStyle = 'rgba(0,0,0,0.55)';
                    ctx.beginPath(); ctx.ellipse(pl.x + 7, pl.y + 13, pl.r, pl.r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
                    const qg = ctx.createLinearGradient(pl.x - pl.r, pl.y - pl.r, pl.x + pl.r, pl.y + pl.r);
                    qg.addColorStop(0, isNear ? '#5b21b6' : '#3b2a5e');
                    qg.addColorStop(0.45, isNear ? '#7c3aed' : '#4c1d95');
                    qg.addColorStop(0.55, isNear ? '#a855f7' : '#5b21b6');
                    qg.addColorStop(1, '#1c0633');
                    ctx.fillStyle = qg;
                    // Hexagonal crystal top.
                    ctx.beginPath();
                    for (let k = 0; k < 6; k++) {
                        const a = Math.PI / 6 + k * Math.PI / 3;
                        const hx = pl.x + Math.cos(a) * pl.r * 0.92;
                        const hy = pl.y + Math.sin(a) * pl.r * 0.92;
                        if (k === 0) ctx.moveTo(hx, hy);
                        else ctx.lineTo(hx, hy);
                    }
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = isNear ? '#e9d5ff' : '#8b5cf6';
                    ctx.lineWidth = isNear ? 3.5 : 2;
                    if (isNear) { ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 20; }
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    // Facet lines from the heart.
                    ctx.strokeStyle = 'rgba(233,213,255,0.35)';
                    ctx.lineWidth = 1.5;
                    for (let k = 0; k < 6; k++) {
                        const a = Math.PI / 6 + k * Math.PI / 3;
                        ctx.beginPath();
                        ctx.moveTo(pl.x, pl.y);
                        ctx.lineTo(pl.x + Math.cos(a) * pl.r * 0.92, pl.y + Math.sin(a) * pl.r * 0.92);
                        ctx.stroke();
                    }
                    // Heart glow.
                    const pulse = 0.6 + Math.sin(t * 2.6 + pl.slot * 1.4) * 0.4;
                    ctx.globalAlpha = 0.35 + pulse * 0.4;
                    ctx.fillStyle = '#c084fc';
                    ctx.beginPath(); ctx.arc(pl.x, pl.y, 10 + pulse * 6, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.restore();
                    const slot = pl.slot;
                    const done = slot < 4
                        ? !!((() => { try { return p.voidTemple && p.voidTemple.legs && p.voidTemple.legs['slot' + slot]; } catch (e) { return false; } })())
                        : !!(p.voidTemple && p.voidTemple.key);
                    const title = slot < 4 ? `◈ PILLAR ${ROMAN[slot]}` : '◈ CENTER';
                    const sub = done ? '✅ OFFERED' : (isNear ? 'ⓔ Offer' : this.riddleFor(slot));
                    // Hovering visual model once offered — the true fish
                    // snapshot eaten by this pillar (name stays hidden).
                    if (done && slot < 4) {
                        try {
                            const sp = (p.voidTemple && p.voidTemple.legs && p.voidTemple.legs['slot' + slot]) || null;
                            if (sp) {
                                const hy = pl.y - 96 + Math.sin(t * 2 + slot) * 8;
                                if (typeof Render !== 'undefined' && Render.drawFishModel) {
                                    Render.drawFishModel(ctx, pl.x, hy, Math.max(22, (sp.size || 40) * 0.7), sp, { glow: true });
                                }
                                ctx.save();
                                ctx.strokeStyle = 'rgba(168,85,247,0.7)';
                                ctx.lineWidth = 2;
                                ctx.beginPath(); ctx.ellipse(pl.x, pl.y - 56, 44, 12, 0, 0, Math.PI * 2); ctx.stroke();
                                ctx.restore();
                            }
                        } catch (e2) {}
                    }
                    if (done && slot >= 4) {
                        try {
                            const hy = pl.y - 100 + Math.sin(t * 2.4) * 8;
                            ctx.save();
                            ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 22;
                            ctx.font = '44px serif'; ctx.textAlign = 'center';
                            ctx.fillText('🗝️', pl.x, hy);
                            ctx.restore();
                        } catch (e2) {}
                    }
                    ctx.textAlign = 'center';
                    ctx.font = 'black 15px Work Sans';
                    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                    ctx.strokeText(title, pl.x, pl.y + 6);
                    ctx.fillStyle = '#e9d5ff';
                    ctx.fillText(title, pl.x, pl.y + 6);
                    ctx.font = 'italic bold 11px Work Sans';
                    ctx.lineWidth = 3;
                    const rline = done ? '✅ the quartz sings' : `“${sub}”`;
                    // Wrap long riddles to two lines.
                    if (!done && rline.length > 42) {
                        const mid = rline.lastIndexOf(' ', 40);
                        const l1 = rline.slice(0, mid), l2 = rline.slice(mid + 1);
                        ctx.strokeText(l1, pl.x, pl.y + 24);
                        ctx.fillStyle = isNear ? '#fef08a' : '#b8a6d9';
                        ctx.fillText(l1, pl.x, pl.y + 24);
                        ctx.strokeText(l2, pl.x, pl.y + 39);
                        ctx.fillText(l2, pl.x, pl.y + 39);
                    } else {
                        ctx.strokeText(rline, pl.x, pl.y + 26);
                        ctx.fillStyle = done ? '#6ee7b7' : (isNear ? '#fef08a' : '#b8a6d9');
                        ctx.fillText(rline, pl.x, pl.y + 26);
                    }
                    if (isNear && !done) this.drawEBubble(ctx, pl.x, pl.y - pl.r - 44, t);
                });
                // Black book pedestal (north, by the entrance wall).
                try {
                    const b = this.voidBookPos();
                    const nearB = Math.hypot(p.x - b.x, p.y - b.y) < 110;
                    ctx.save();
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + 16, 40, 14, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#2c2c3a';
                    ctx.fillRect(b.x - 26, b.y - 6, 52, 34);
                    ctx.strokeStyle = nearB ? '#e9d5ff' : '#5b5b74';
                    ctx.lineWidth = nearB ? 3 : 2;
                    if (nearB) { ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 16; }
                    ctx.strokeRect(b.x - 26, b.y - 6, 52, 34);
                    ctx.shadowBlur = 0;
                    // Open book: two violet pages breathing.
                    const pg = 0.8 + Math.sin(t * 3) * 0.2;
                    ctx.fillStyle = `rgba(233,213,255,${0.75 + pg * 0.2})`;
                    ctx.beginPath();
                    ctx.moveTo(b.x, b.y - 12);
                    ctx.quadraticCurveTo(b.x - 20, b.y - 16, b.x - 24, b.y - 2);
                    ctx.lineTo(b.x, b.y + 2);
                    ctx.quadraticCurveTo(b.x + 20, b.y - 2, b.x + 24, b.y - 2);
                    ctx.quadraticCurveTo(b.x + 20, b.y - 16, b.x, b.y - 12);
                    ctx.fill();
                    ctx.fillStyle = '#a855f7';
                    ctx.font = 'bold 13px Work Sans'; ctx.textAlign = 'center';
                    ctx.fillText('📖', b.x, b.y - 18);
                    ctx.restore();
                    ctx.textAlign = 'center';
                    ctx.font = 'black 16px Work Sans';
                    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                    ctx.strokeText('📖 BLACK BOOK', b.x, b.y - 34);
                    ctx.fillStyle = '#e9d5ff';
                    ctx.fillText('📖 BLACK BOOK', b.x, b.y - 34);
                    ctx.font = 'bold 12px Work Sans';
                    ctx.lineWidth = 3;
                    const bh = nearB ? 'ⓔ Read the curse' : 'A verse hums in the dark...';
                    ctx.strokeText(bh, b.x, b.y + 46);
                    ctx.fillStyle = nearB ? '#fef08a' : '#94a3b8';
                    ctx.fillText(bh, b.x, b.y + 46);
                    if (nearB) this.drawEBubble(ctx, b.x, b.y - 72, t);
                } catch (e2) {}
                // Shrine exit hint.
                try {
                    const e2 = this.voidTempleExit();
                    const nearTe = Math.hypot(p.x - e2.x, p.y - e2.y) < 120;
                    ctx.textAlign = 'center';
                    ctx.font = 'black 20px Work Sans';
                    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                    ctx.strokeText('🚪 SHRINE EXIT', e2.x, e2.y - 40);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText('🚪 SHRINE EXIT', e2.x, e2.y - 40);
                    if (nearTe) this.drawEBubble(ctx, e2.x, e2.y - 78, t);
                } catch (e2) {}
            }
        } catch (e) {}
        ctx.restore();
    },

    // The cave interior: a sealed rock chamber. Layered stone floor,
    // jagged rock walls (no beach visible past them), solid pillars,
    // stalactites/stalagmites, crystals, lava veins, and a portal wall
    // (stone gate + void swirl) as the only way out, south.
    drawCaveInterior(state, ctx) {
        const t = state.time || 0;
        const p = state.player;
        const r = this.caveRoom();
        const e = this.caveExit();
        const pillars = this.cavePillars();
        ctx.save();
        // Far-outside void: anything past the rock ring is pure abyss, so
        // the beach can never peek through at any zoom.
        ctx.fillStyle = '#030308';
        ctx.fillRect(r.x0 - 1400, r.y0 - 1400, (r.x1 - r.x0) + 2800, (r.y1 - r.y0) + 2800);
        // Floor: cold layered stone slabs (world-anchored hash, never swims)
        const fg = ctx.createLinearGradient(0, r.y0, 0, r.y1);
        fg.addColorStop(0, '#1c1926');
        fg.addColorStop(0.5, '#14121d');
        fg.addColorStop(1, '#0b0a12');
        ctx.fillStyle = fg;
        ctx.fillRect(r.x0 - 120, r.y0 - 120, (r.x1 - r.x0) + 240, (r.y1 - r.y0) + 240);
        // Slab seams
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        for (let gx = r.x0; gx <= r.x1; gx += 140) {
            for (let gy = r.y0; gy <= r.y1; gy += 140) {
                const h = Math.sin(gx * 0.37 + gy * 0.73) * 10000;
                const rr = h - Math.floor(h);
                if (rr < 0.55) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
                    ctx.strokeRect(gx, gy, 140, 140);
                }
                if (rr < 0.3) {
                    ctx.strokeStyle = 'rgba(124,58,237,0.28)';
                    ctx.beginPath();
                    ctx.moveTo(gx + rr * 60, gy + 20);
                    ctx.lineTo(gx + 40 + rr * 60, gy + 70);
                    ctx.stroke();
                }
                // Pebbles
                if (rr > 0.82) {
                    ctx.fillStyle = 'rgba(255,255,255,0.05)';
                    ctx.beginPath();
                    ctx.arc(gx + rr * 120, gy + (1 - rr) * 120, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        // Moss patches near crystals (faint green breathing)
        ctx.fillStyle = `rgba(52,211,153,${0.05 + Math.sin(t * 1.3) * 0.02})`;
        ctx.beginPath(); ctx.ellipse(r.x0 + 200, r.y1 - 160, 90, 40, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r.x1 - 200, r.y0 + 220, 90, 40, -0.4, 0, Math.PI * 2); ctx.fill();
        // ---- Rock walls: thick double ring with jagged inner teeth ----
        const T = 70; // wall thickness (matches caveCollide WALL)
        // Outer mass
        ctx.fillStyle = '#101018';
        ctx.fillRect(r.x0 - T - 60, r.y0 - T - 60, (r.x1 - r.x0) + (T + 60) * 2, T + 60);
        ctx.fillRect(r.x0 - T - 60, r.y1, (r.x1 - r.x0) + (T + 60) * 2, T + 60);
        ctx.fillRect(r.x0 - T - 60, r.y0 - T - 60, T + 60, (r.y1 - r.y0) + (T + 60) * 2);
        ctx.fillRect(r.x1, r.y0 - T - 60, T + 60, (r.y1 - r.y0) + (T + 60) * 2);
        // Inner rock band with strata lines
        ctx.fillStyle = '#262633';
        ctx.fillRect(r.x0 - T, r.y0 - T, (r.x1 - r.x0) + T * 2, T);
        ctx.fillRect(r.x0 - T, r.y1, (r.x1 - r.x0) + T * 2, T);
        ctx.fillRect(r.x0 - T, r.y0 - T, T, (r.y1 - r.y0) + T * 2);
        ctx.fillRect(r.x1, r.y0 - T, T, (r.y1 - r.y0) + T * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const off = 18 + i * 18;
            ctx.strokeRect(r.x0 - T + off * 0.3, r.y0 - T + 6 + i * 8, (r.x1 - r.x0) + T * 2 - off * 0.6, T - 12 - i * 8);
        }
        // Jagged teeth along the inner edge (deterministic rock noise)
        ctx.fillStyle = '#2e2e3d';
        const tooth = (x, y, s, flip) => {
            ctx.beginPath();
            ctx.moveTo(x - s, y);
            ctx.lineTo(x + s, y);
            ctx.lineTo(x, y + flip * (10 + s * 0.7));
            ctx.closePath(); ctx.fill();
        };
        for (let sx = r.x0; sx <= r.x1; sx += 46) {
            const j = Math.sin(sx * 0.61) * 8;
            tooth(sx + j, r.y0, 20, 1);
            tooth(sx - j, r.y1, 20, -1);
        }
        for (let sy = r.y0; sy <= r.y1; sy += 46) {
            const j = Math.sin(sy * 0.53) * 8;
            ctx.beginPath();
            ctx.moveTo(r.x0, sy - 20); ctx.lineTo(r.x0, sy + 20); ctx.lineTo(r.x0 + 12 + Math.abs(j), sy + j * 0.4);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(r.x1, sy - 20); ctx.lineTo(r.x1, sy + 20); ctx.lineTo(r.x1 - 12 - Math.abs(j), sy - j * 0.4);
            ctx.closePath(); ctx.fill();
        }
        // Rim light on the inner edge
        ctx.strokeStyle = '#54546a';
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
        ctx.strokeStyle = 'rgba(168,85,247,0.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x0 + 4, r.y0 + 4, (r.x1 - r.x0) - 8, (r.y1 - r.y0) - 8);
        // Stalactites (north) + stalagmites (south, shorter so exit stays clear)
        for (let sx = r.x0 + 40; sx < r.x1; sx += 90) {
            const k = Math.sin(sx * 1.7) * 0.5 + 0.5;
            const len = 44 + k * 54;
            const grad = ctx.createLinearGradient(0, r.y0, 0, r.y0 + len);
            grad.addColorStop(0, '#3a3a4d'); grad.addColorStop(1, '#23232f');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(sx - 18, r.y0); ctx.lineTo(sx + 18, r.y0); ctx.lineTo(sx, r.y0 + len);
            ctx.closePath(); ctx.fill();
            if (sx < e.x - 90 || sx > e.x + 90) {
                const glen = 26 + ((1 - k) * 30);
                ctx.fillStyle = '#2e2e3d';
                ctx.beginPath();
                ctx.moveTo(sx - 13, r.y1); ctx.lineTo(sx + 13, r.y1); ctx.lineTo(sx, r.y1 - glen);
                ctx.closePath(); ctx.fill();
            }
        }
        // Solid pillars: shaded boulders with rim + cracks
        pillars.forEach((c) => {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(c.x + 8, c.y + 12, c.r, c.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
            const pg = ctx.createRadialGradient(c.x - c.r * 0.35, c.y - c.r * 0.4, c.r * 0.1, c.x, c.y, c.r);
            pg.addColorStop(0, '#3d3d52'); pg.addColorStop(0.6, '#2a2a38'); pg.addColorStop(1, '#17171f');
            ctx.fillStyle = pg;
            ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#4c4c62';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(c.x - c.r * 0.5, c.y - c.r * 0.2);
            ctx.quadraticCurveTo(c.x, c.y + c.r * 0.1, c.x + c.r * 0.45, c.y - c.r * 0.35);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(168,85,247,0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 6, Math.PI * 0.7, Math.PI * 1.3); ctx.stroke();
            ctx.restore();
        });
        // Glowing crystals (breathing light)
        const crystals = [
            { x: r.x0 + 130, y: r.y0 + 170, c: '#22d3ee' },
            { x: r.x1 - 130, y: r.y0 + 230, c: '#a855f7' },
            { x: r.x0 + 210, y: r.y1 - 170, c: '#34d399' },
            { x: r.x1 - 210, y: r.y1 - 130, c: '#f59e0b' },
        ];
        crystals.forEach((c, i) => {
            const pulse = 0.7 + Math.sin(t * 2.5 + i * 1.7) * 0.3;
            ctx.save();
            ctx.globalAlpha = 0.25 * pulse + 0.35;
            ctx.fillStyle = c.c;
            ctx.beginPath(); ctx.arc(c.x, c.y, 44 * pulse + 18, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.shadowColor = c.c;
            ctx.shadowBlur = 24;
            ctx.fillStyle = c.c;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y - 22);
            ctx.lineTo(c.x + 13, c.y);
            ctx.lineTo(c.x, c.y + 22);
            ctx.lineTo(c.x - 13, c.y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // rock socket
            ctx.fillStyle = '#23232f';
            ctx.beginPath(); ctx.ellipse(c.x, c.y + 24, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
        });
        // Lava veins (warm pulse)
        ctx.strokeStyle = `rgba(249,115,22,${0.5 + Math.sin(t * 2) * 0.2})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(r.x0 + 300, r.y1 - 120);
        ctx.quadraticCurveTo(r.x0 + 500, r.y1 - 200, r.x0 + 700, r.y1 - 100);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r.x1 - 650, r.y0 + 300);
        ctx.quadraticCurveTo(r.x1 - 450, r.y0 + 380, r.x1 - 300, r.y0 + 300);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // ---- NORTH ALCOVE: the void gate's home (above the circle).
        // Recessed arch + stair shadow + floor cracks + candle rows so the
        // gate never sits on the ritual art.
        try {
            const g = this.voidGatePos();
            ctx.save();
            // Alcove shadow.
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath(); ctx.ellipse(g.x, g.y + 30, 150, 60, 0, 0, Math.PI * 2); ctx.fill();
            // Arch stones.
            ctx.strokeStyle = '#3f3f55';
            ctx.lineWidth = 10;
            ctx.beginPath(); ctx.ellipse(g.x, g.y, 104, 116, 0, Math.PI, 0); ctx.stroke();
            ctx.strokeStyle = '#5b5b74';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(g.x, g.y, 104, 116, 0, Math.PI, 0); ctx.stroke();
            // Floor cracks crawling from the arch.
            ctx.strokeStyle = 'rgba(168,85,247,0.5)';
            ctx.lineWidth = 2;
            for (let c = 0; c < 5; c++) {
                const sx = g.x - 90 + c * 45;
                ctx.beginPath();
                ctx.moveTo(sx, g.y + 78);
                ctx.lineTo(sx + Math.sin(c * 2.1) * 22, g.y + 120);
                ctx.lineTo(sx + Math.cos(c * 1.7) * 30, g.y + 165);
                ctx.stroke();
            }
            // Candle rows flanking the arch (flicker).
            for (let c = 0; c < 6; c++) {
                const cx = g.x - 150 + c * 60;
                const cy = g.y + 96;
                const fl = 3 + Math.sin(t * 9 + c * 2.4) * 1.6;
                ctx.fillStyle = '#3a3a48';
                ctx.fillRect(cx - 3, cy - 2, 6, 14);
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath(); ctx.arc(cx, cy - 6, fl, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(251,191,36,0.18)';
                ctx.beginPath(); ctx.arc(cx, cy - 6, fl * 3, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        } catch (e) {}
        // ---- PORTAL WALL: stone gate fused into the south wall, void swirl inside
        const nearExit = Math.hypot(p.x - e.x, p.y - e.y) < 130;
        ctx.save();
        // gate pillars
        ctx.fillStyle = '#343442';
        ctx.fillRect(e.x - 78, e.y - 66, 26, 110);
        ctx.fillRect(e.x + 52, e.y - 66, 26, 110);
        ctx.fillStyle = '#45455c';
        ctx.fillRect(e.x - 78, e.y - 66, 26, 12);
        ctx.fillRect(e.x + 52, e.y - 66, 26, 12);
        // lintel
        ctx.fillStyle = '#2c2c3a';
        ctx.fillRect(e.x - 84, e.y - 88, 168, 26);
        ctx.strokeStyle = '#5b5b74';
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x - 84, e.y - 88, 168, 26);
        // runes on the gate
        ctx.fillStyle = nearExit ? '#6ee7b7' : '#38bdf8';
        ctx.font = 'bold 13px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillText('◈ ✦ ◈', e.x, e.y - 68);
        // void disc (reuse the beach portal look, upright)
        this.drawVoidPortal(ctx, e.x, e.y - 6, t, true, nearExit, 1);
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.font = 'black 24px Work Sans';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('🕳 WAY OUT', e.x, e.y - 108);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('🕳 WAY OUT', e.x, e.y - 108);
        ctx.font = 'bold 15px Work Sans';
        ctx.lineWidth = 4;
        const hint = nearExit ? 'ⓔ Leave!' : 'Exit portal — south';
        ctx.strokeText(hint, e.x, e.y + 66);
        ctx.fillStyle = nearExit ? '#fef08a' : '#7dd3fc';
        ctx.fillText(hint, e.x, e.y + 66);
        if (nearExit) this.drawEBubble(ctx, e.x, e.y - 146, t);
        // Cavern title
        ctx.font = 'black 30px Work Sans';
        ctx.lineWidth = 6;
        ctx.strokeText('🔮 THE HOLLOW CAVE', (r.x0 + r.x1) / 2, r.y0 + 70);
        ctx.fillStyle = '#c4b5fd';
        ctx.fillText('🔮 THE HOLLOW CAVE', (r.x0 + r.x1) / 2, r.y0 + 70);
        ctx.restore();
    },

    // Void shrine interior: same chamber renderer, violet-graded, with
    // the shrine title. Pillars themselves draw in drawWorld (above).
    drawVoidTempleInterior(state, ctx) {
        try { this.drawCaveInterior(state, ctx); } catch (e) { return; }
        try {
            const r = this.voidTempleRoom();
            const t = state.time || 0;
            const p = state.player;
            ctx.save();
            // Gloomy violet wash.
            ctx.fillStyle = `rgba(30,8,58,${0.22 + Math.sin(t * 1.2) * 0.03})`;
            ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
            // Hanging chains (north wall).
            ctx.strokeStyle = 'rgba(90,90,110,0.8)';
            ctx.lineWidth = 3;
            for (let cx = r.x0 + 120; cx < r.x1; cx += 170) {
                const sway = Math.sin(t * 0.9 + cx) * 8;
                const len = 90 + ((cx * 13) % 60);
                ctx.beginPath();
                ctx.moveTo(cx, r.y0 + 10);
                ctx.lineTo(cx + sway, r.y0 + 10 + len);
                ctx.stroke();
                ctx.fillStyle = '#3f3f55';
                ctx.beginPath(); ctx.arc(cx + sway, r.y0 + 16 + len, 7, 0, Math.PI * 2); ctx.fill();
            }
            // Cobwebs (corners).
            ctx.strokeStyle = 'rgba(200,200,220,0.25)';
            ctx.lineWidth = 1.5;
            [[r.x0 + 40, r.y0 + 40, 1, 1], [r.x1 - 40, r.y0 + 40, -1, 1]].forEach(([wx, wy, sx, sy]) => {
                for (let k = 1; k <= 3; k++) {
                    ctx.beginPath();
                    ctx.arc(wx, wy, k * 32, sx > 0 ? 0 : Math.PI / 2, sx > 0 ? Math.PI / 2 : Math.PI);
                    ctx.stroke();
                }
                for (let a = 0; a <= 3; a++) {
                    const ang = (sx > 0 ? 0 : Math.PI / 2) + a * (Math.PI / 6);
                    ctx.beginPath();
                    ctx.moveTo(wx, wy);
                    ctx.lineTo(wx + Math.cos(ang) * 96 * sx, wy + Math.sin(ang) * 96 * sy);
                    ctx.stroke();
                }
            });
            // Skull piles (south corners).
            ctx.font = '22px serif'; ctx.textAlign = 'center';
            ctx.fillText('💀 💀 💀', r.x0 + 130, r.y1 - 120);
            ctx.fillText('💀 💀', r.x1 - 130, r.y1 - 120);
            // Carpet runner to the center altar.
            ctx.fillStyle = 'rgba(76,29,149,0.35)';
            const cxm = (r.x0 + r.x1) / 2;
            ctx.fillRect(cxm - 46, r.y0 + 120, 92, (r.y1 - r.y0) - 260);
            ctx.strokeStyle = 'rgba(168,85,247,0.4)';
            ctx.lineWidth = 2;
            ctx.strokeRect(cxm - 46, r.y0 + 120, 92, (r.y1 - r.y0) - 260);
            // Candle clusters: pillars get warm pools of light.
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const candles = [];
            try {
                this.voidPillars().forEach(pl => {
                    candles.push({ x: pl.x - pl.r - 18, y: pl.y + pl.r * 0.6 });
                    candles.push({ x: pl.x + pl.r + 18, y: pl.y + pl.r * 0.6 });
                });
                const b = this.voidBookPos();
                candles.push({ x: b.x - 44, y: b.y + 10 });
                candles.push({ x: b.x + 44, y: b.y + 10 });
            } catch (e2) {}
            candles.forEach((c, i) => {
                const fl = 1 + Math.sin(t * 10 + i * 2.7) * 0.25;
                const g2 = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 90 * fl);
                g2.addColorStop(0, 'rgba(251,191,36,0.20)');
                g2.addColorStop(1, 'rgba(251,191,36,0)');
                ctx.fillStyle = g2;
                ctx.beginPath(); ctx.arc(c.x, c.y, 90 * fl, 0, Math.PI * 2); ctx.fill();
            });
            ctx.restore();
            // Standing candles (drawn solid, above the light).
            try {
                const stands = [];
                this.voidPillars().forEach(pl => {
                    stands.push({ x: pl.x - pl.r - 18, y: pl.y + pl.r * 0.6 });
                    stands.push({ x: pl.x + pl.r + 18, y: pl.y + pl.r * 0.6 });
                });
                const b2 = this.voidBookPos();
                stands.push({ x: b2.x - 44, y: b2.y + 10 });
                stands.push({ x: b2.x + 44, y: b2.y + 10 });
                stands.forEach((c, i) => {
                    const fl = 3 + Math.sin(t * 9 + i * 2.2) * 1.4;
                    ctx.fillStyle = '#2c2c3a';
                    ctx.fillRect(c.x - 3, c.y - 2, 6, 14);
                    ctx.fillStyle = '#fbbf24';
                    ctx.beginPath(); ctx.arc(c.x, c.y - 6, fl, 0, Math.PI * 2); ctx.fill();
                });
            } catch (e2) {}
            // Void mist drifting along the floor.
            for (let k = 0; k < 8; k++) {
                const mx = r.x0 + ((t * 30 + k * 210) % (r.x1 - r.x0));
                const my = r.y0 + 200 + ((k * 137) % 600);
                ctx.fillStyle = `rgba(124,58,237,${0.05 + ((k * 29) % 20) / 400})`;
                ctx.beginPath(); ctx.ellipse(mx, my, 90, 22, 0, 0, Math.PI * 2); ctx.fill();
            }
            ctx.textAlign = 'center';
            ctx.font = 'black 30px Work Sans';
            ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText('🕳 VOID SHRINE', (r.x0 + r.x1) / 2, r.y0 + 70);
            ctx.fillStyle = '#e9d5ff';
            ctx.fillText('🕳 VOID SHRINE', (r.x0 + r.x1) / 2, r.y0 + 70);
            ctx.font = 'bold 14px Work Sans';
            ctx.lineWidth = 4;
            ctx.strokeText('Read the black book — the quartz names nothing', (r.x0 + r.x1) / 2, r.y0 + 100);
            ctx.fillStyle = '#c4b5fd';
            ctx.fillText('Read the black book — the quartz names nothing', (r.x0 + r.x1) / 2, r.y0 + 100);
            // Player lantern extra: book + pillars stay readable in the gloom.
            try {
                const b3 = this.voidBookPos();
                const g3 = ctx.createRadialGradient(b3.x, b3.y, 4, b3.x, b3.y, 150);
                g3.addColorStop(0, 'rgba(168,85,247,0.18)');
                g3.addColorStop(1, 'rgba(168,85,247,0)');
                ctx.fillStyle = g3;
                ctx.beginPath(); ctx.arc(b3.x, b3.y, 150, 0, Math.PI * 2); ctx.fill();
            } catch (e2) {}
            ctx.restore();
        } catch (e) {}
    },

    // Darkness + lantern light inside the cave. Called AFTER the player is
    // drawn so rock, loot, enemies and the player all fall into shadow
    // except a breathing pool of light around the player (+ small glows at
    // crystals / portal / ritual pad so landmarks stay findable).
    drawCaveFog(state, ctx) {
        const p = state.player;
        if (!p) return;
        const t = state.time || 0;
        const fog = (typeof state._caveFog === 'number') ? state._caveFog : 1;
        if (fog <= 0.01) return;
        const cam = state.camera;
        let vx0, vy0, vx1, vy1;
        try {
            const w = ctx.canvas.width / cam.zoom / 2 + 80;
            const h = ctx.canvas.height / cam.zoom / 2 + 80;
            vx0 = cam.x - w; vx1 = cam.x + w; vy0 = cam.y - h; vy1 = cam.y + h;
        } catch (e) {
            const r = this.caveRoom();
            vx0 = r.x0 - 300; vx1 = r.x1 + 300; vy0 = r.y0 - 300; vy1 = r.y1 + 300;
        }
        const R = 250 + Math.sin(t * 3.1) * 10 + Math.sin(t * 7.7) * 5;
        ctx.save();
        // Solid night with a hard hole at the player (evenodd punch-out)
        ctx.beginPath();
        ctx.rect(vx0, vy0, vx1 - vx0, vy1 - vy0);
        ctx.moveTo(p.x + R, p.y);
        ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(1,1,10,${0.88 * fog})`;
        ctx.fill('evenodd');
        // Soft falloff ring so the light edge breathes instead of cutting
        const soft = ctx.createRadialGradient(p.x, p.y, R * 0.45, p.x, p.y, R);
        soft.addColorStop(0, 'rgba(1,1,10,0)');
        soft.addColorStop(1, `rgba(1,1,10,${0.85 * fog})`);
        ctx.fillStyle = soft;
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
        // Warm lantern pool on the floor
        ctx.globalCompositeOperation = 'lighter';
        const lamp = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 130);
        lamp.addColorStop(0, `rgba(253,224,71,${0.16 * fog})`);
        lamp.addColorStop(1, 'rgba(253,224,71,0)');
        ctx.fillStyle = lamp;
        ctx.beginPath(); ctx.arc(p.x, p.y, 130, 0, Math.PI * 2); ctx.fill();
        // Landmark glows punch through the dark (crystals / exit / pad)
        const beacons = [];
        try {
            const r = this.caveRoom();
            beacons.push({ x: r.x0 + 130, y: r.y0 + 170, c: '34,211,238' });
            beacons.push({ x: r.x1 - 130, y: r.y0 + 230, c: '168,85,247' });
            beacons.push({ x: this.caveExit().x, y: this.caveExit().y, c: '56,189,248' });
            beacons.push({ x: this.cavePad().x, y: this.cavePad().y, c: '239,68,68' });
        } catch (e) {}
        beacons.forEach((b, i) => {
            const rr = 120 + Math.sin(t * 2.5 + i * 1.7) * 18;
            const g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, rr);
            g.addColorStop(0, `rgba(${b.c},${0.22 * fog})`);
            g.addColorStop(1, `rgba(${b.c},0)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, Math.PI * 2); ctx.fill();
        });
        // Drifting dust motes in the lantern light (deterministic)
        ctx.fillStyle = `rgba(196,181,253,${0.5 * fog})`;
        for (let k = 0; k < 14; k++) {
            const a = t * 0.25 + k * 2.4;
            const rr = 40 + ((k * 53) % 170);
            const dx = Math.cos(a + k) * rr + Math.sin(t * 0.7 + k * 1.9) * 12;
            const dy = Math.sin(a * 1.3 + k * 0.7) * rr * 0.7;
            ctx.globalAlpha = (0.25 + ((k * 37) % 40) / 100) * fog;
            ctx.fillRect(p.x + dx, p.y + dy, 2, 2);
        }
        ctx.restore();
    },
};

window.Ritual = Ritual;

// ============================================================
//  TELEPORT — vortex loading screen for cave enter/exit.
//  Fade in -> swap positions mid-cover (apply) -> progress -> out.
//  Re-entrancy guarded: spamming E mid-teleport is ignored.
// ============================================================
const Teleport = {
    busy: false,
    DUR: 1150,

    go(state, opts) {
        opts = opts || {};
        if (this.busy) return false;
        this.busy = true;
        const overlay = document.getElementById('teleport-overlay');
        const title = document.getElementById('teleport-title');
        const sub = document.getElementById('teleport-sub');
        const fill = document.getElementById('teleport-bar-fill');
        if (title && opts.title) title.innerText = opts.title;
        if (sub && opts.sub) sub.innerText = opts.sub;
        // OPAQUE cover FIRST: visible instantly (no transition in), so no
        // frame of the position swap ever leaks through. Fade-out happens
        // only at the very end (see step k>=1 below).
        if (overlay) {
            overlay.style.transition = 'none';
            overlay.classList.remove('hidden');
            try { void overlay.offsetWidth; } catch (e) {}
            overlay.style.transition = '';
        }
        if (fill) fill.style.width = '0%';
        try { if (typeof audio !== 'undefined' && audio.playPortal) audio.playPortal(); } catch (e) {}
        const t0 = performance.now();
        let applied = false;
        const step = () => {
            const k = Math.min(1, (performance.now() - t0) / this.DUR);
            // eased progress with a little swirl wobble
            const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            if (fill) fill.style.width = Math.round(eased * 100) + '%';
            if (!applied && k >= 0.45) {
                applied = true;
                try { if (typeof opts.apply === 'function') opts.apply(); } catch (e) {}
            }
            if (k < 1) {
                requestAnimationFrame(step);
            } else {
                if (overlay) overlay.classList.add('hidden');
                this.busy = false;
            }
        };
        requestAnimationFrame(step);
        return true;
    },
};

window.Teleport = Teleport;
