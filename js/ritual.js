/**
 * Ritual + Bait system — boss summoning quests & craftable baits.
 *
 * LOOP:
 *   1. Earn summon ITEMS by fishing/fighting — they drop as physical
 *      loot (with models) and live in the bucket, unsellable:
 *      Storm Eggs (Stormcaller/gulls/legendary catches),
 *      Void Shards (void-tainted only), boss trophies (boss kills).
 *   2. Bake a Storm Egg into a Hydra Lure (Shop > Bait tab).
 *   3. Five bosses, five different summons:
 *      Stormcaller = 20 gulls; Priest = Marlin rite; Hydra = hook w/ lure;
 *      Shepherd = 3 shards at the pad; Emperor = 3 trophies at the pad.
 * Fishing baits (same tab, crafted from catches) buff bites/luck while
 * equipped. Everything here is personal (no MP sync needed).
 */

// ---- Boss keys: each boss wants something DIFFERENT.
//   🥚 Storm Egg  <- Stormcaller kill (always) + seagulls (6%)
//   🔮 Void Shard <- jumping-fish kills (30%)
const BOSS_KEYS = {
    storm_egg: { name: 'Storm Egg',  icon: '🥚', color: '#10b981' },
    shard:     { name: 'Void Shard', icon: '🔮', color: '#a855f7' },
};

// ---- Boss trophies: 100% drop from each boss kill. All three trophies
// combined open the way to the Crimson Emperor (endgame gate).
const TROPHIES = {
    chalice: { name: "Priest's Chalice", icon: '🏆', color: '#0ea5e9', from: 'Leviathan Priest' },
    fang:    { name: 'Hydra Fang',       icon: '🦷', color: '#10b981', from: 'Stormlord Hydra' },
    eye:     { name: "Shepherd's Eye",   icon: '👁️', color: '#a855f7', from: 'Void Shepherd' },
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
];

// ---- Pad rituals (only Shepherd + Emperor use the circle now — every
// boss summons DIFFERENTLY: gulls / Marlin rite / hook lure / pad).
// cost = { shards: n } or { trophies: { id: n } }
const RITUALS = [
    { bossId: 'void_shepherd', cost: { shards: 3 },
      blurb: 'The abyss only takes its own: 3 Void Shards from void-tainted jumpers.' },
    { bossId: 'crimson_emperor', cost: { trophies: { chalice: 1, fang: 1, eye: 1 } },
      blurb: 'The endgame gate: one trophy from each lesser boss. No fish can buy this.' },
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

    // The hole on the beach — pinned to the NORTH-WEST corner of the
    // sand so it never drifts into the middle of play.
    caveHole(state) {
        const B = CONFIG.WORLD;
        return { x: B.MIN_X + 250, y: B.MIN_Y + 250 };
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
            // Cave fog fade (runs both inside + outside so exits fade out).
            const wantFog = !!(state.player && state.player.inCave);
            const curFog = (typeof state._caveFog === 'number') ? state._caveFog : 0;
            state._caveFog = wantFog
                ? Math.min(1, curFog + Math.min(0.1, Math.max(0.008, (delta || 0.016) * 1.5)))
                : Math.max(0, curFog - 0.06);
            const p = state.player;
            if (!p || p.caveUnlocked || p.inCave) return;
            const dt = (typeof delta === 'number' && delta > 0) ? Math.min(delta, 0.1) : 0.016;
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
            { x: cx,       y: cy - 320, r: 64 },
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
            return { name: t.name, icon: icons[keyId] || '🏆', color: t.color || '#fbbf24' };
        }
        return null;
    },

    bucketItem(keyId) {
        const def = this.itemDef(keyId);
        if (!def) return null;
        const icon = def.icon || (TROPHIES[keyId] ? '🏆' : '❔');
        return { kind: 'item', keyItem: true, id: keyId, name: def.name,
            icon, color: def.color || '#fbbf24', rarity: 'key', value: 0 };
    },

    // How many of a summon item sit in the bucket
    countItem(state, keyId) {
        return (state.player.bucket || []).filter(f => f && f.keyItem && f.id === keyId).length;
    },

    // Remove N summon items from the bucket. Returns removed count.
    consumeItems(state, keyId, count) {
        const bucket = state.player.bucket || [];
        let left = count;
        for (let i = bucket.length - 1; i >= 0 && left > 0; i--) {
            const f = bucket[i];
            if (f && f.keyItem && f.id === keyId) {
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

    baitDef(id) {
        return BAITS.find(b => b.id === id) || null;
    },

    canCraft(state, baitId) {
        const def = this.baitDef(baitId);
        if (!def) return { ok: false, why: 'Unknown bait.' };
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
                el.innerText = 'No bait';
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
    costLines(state, cost) {
        const lines = [];
        if (cost.shards) {
            const have = this.countItem(state, 'shard');
            lines.push({ label: `🔮 Void Shard ×${cost.shards}`, have, need: cost.shards });
        }
        if (cost.trophies) {
            const troIcons = { chalice: '🏆', fang: '🦷', eye: '👁️' };
            for (const [tid, n] of Object.entries(cost.trophies)) {
                const t = (typeof TROPHIES !== 'undefined' && TROPHIES[tid]) || { name: tid };
                const have = this.countItem(state, tid);
                lines.push({ label: `${troIcons[tid] || '🏆'} ${t.name} ×${n}`, have, need: n });
            }
        }
        return lines;
    },

    ritualState(state, ritual) {
        this.ensure(state);
        const p = state.player;
        const sp = FISH_SPECIES.find(s => s.id === ritual.bossId);
        const slain = (p.slainBosses || []).includes(ritual.bossId);
        const lines = this.costLines(state, ritual.cost);
        return { sp, slain, lines, met: lines.every(l => l.have >= l.need) };
    },

    canSummon(state, ritual) {
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
            return { ok: false, why: 'Only the host can perform rituals.' };
        }
        if (this.bossAlive(state)) return { ok: false, why: 'A boss already walks. Slay it first.' };
        const rs = this.ritualState(state, ritual);
        const missing = rs.lines.filter(l => l.have < l.need).map(l => `${l.label} (have ${l.have})`);
        if (missing.length) return { ok: false, why: 'Missing: ' + missing.join(' · ') };
        return { ok: true };
    },

    payCost(state, cost) {
        if (cost.shards) this.consumeItems(state, 'shard', cost.shards);
        if (cost.trophies) {
            for (const [tid, n] of Object.entries(cost.trophies)) {
                this.consumeItems(state, tid, n);
            }
        }
    },

    // Shared spawn: pad rituals AND the Marlin rite land the boss here.
    // Returns the boss monster (or false). Dormancy + intro length ride
    // along so every arrival stands down for its own cinematic.
    spawnBoss(state, bossId, introDurSec) {
        const sp = FISH_SPECIES.find(s => s.id === bossId);
        if (!sp) return false;
        const hpMult = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.FISH_HP_MULT) || 1;
        const B = CONFIG.WORLD;
        const px = Utils.clamp(state.player.x + (Math.random() - 0.5) * 120, B.MIN_X + 40, state.waterBoundaryX - 40);
        const py = Utils.clamp(state.player.y + (Math.random() - 0.5) * 120, B.MIN_Y + 40, B.MAX_Y - 40);
        const m = {
            id: 'boss' + Date.now() + Math.random(),
            species: sp,
            x: px, y: py,
            hp: Math.round(sp.maxHp * hpMult), maxHp: Math.round(sp.maxHp * hpMult),
            vx: 0, vy: 0, chargeCooldown: 3, isCharging: false,
            _announced: true, // intro plays here, combat won't double it
        };
        (state.monstersOnLand = state.monstersOnLand || []).push(m);
        state.activeBoss = m;
        this.bossIntro(state, sp, px, py, m, introDurSec);
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        return m;
    },

    // Cinematic boss arrival, part 1: screen flash + quake + war-horn,
    // shockwave rings, flaming name banner, and a ~10s camera lock on the
    // boss. Part 2 (tide music fading out, boss theme fading in) fires when
    // the lock expires — see Combat.update's pending-crossfade check.
    INTRO_CAM_DUR: 10,
    BOSS_TITLES: {
        stormlord_hydra:  { title: 'THE NINE-HEADED STORM', color: '#10b981', glow: '#6ee7b7' },
        leviathan_priest: { title: 'CHANT OF THE DEEP',     color: '#0ea5e9', glow: '#7dd3fc' },
        void_shepherd:    { title: 'HAND OF THE ABYSS',     color: '#a855f7', glow: '#d8b4fe' },
        crimson_emperor:   { title: 'THE MOLTEN TYRANT',     color: '#ef4444', glow: '#fbbf24' },
        stormcaller:       { title: 'QUEEN OF THE GALES',    color: '#facc15', glow: '#fef08a' },
    },

    bossIntro(state, sp, px, py, bossRef, durSec) {
        try {
            const meta = (this.BOSS_TITLES && this.BOSS_TITLES[sp.id]) || { title: 'BOSS', color: '#ef4444', glow: '#fbbf24' };
            const x = (typeof px === 'number') ? px : state.player.x;
            const y = (typeof py === 'number') ? py : state.player.y;
            const dur = (typeof durSec === 'number' && durSec > 0) ? durSec : (this.INTRO_CAM_DUR || 10);
            // Feel: flash + quake + war-horn (boss roar only — the plain roar
            // underneath was muddying it, and Stormcaller got the wrong one)
            try {
                const fl = document.getElementById('flash-overlay');
                if (fl) { fl.classList.remove('active'); void fl.offsetWidth; fl.classList.add('active'); }
            } catch (e) {}
            try { UI.triggerDamageFlash(); } catch (e) {}
            try { audio.playThunder(); } catch (e) {}
            try { audio.playBossRoar(); } catch (e) {}
            state.screenShake = Math.max(state.screenShake || 0, 32);
            // Camera lock: pan to the boss and hold for the intro. The
            // camera update tracks bossRef (bosses keep moving) and releases
            // early if the boss dies mid-intro. The boss itself stands down
            // for the same window: no movement, no skills, no contact.
            try {
                state._introCam = { x, y, t: dur, boss: bossRef || null };
                if (bossRef) bossRef.dormantUntil = (state.time || 0) + dur;
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
            Particles.showFloatingText(state, `🕯 ${sp.name.toUpperCase()} RISES!`, x, y - 110, '#ef4444');
            // Giant flaming name banner (DOM, auto-removes)
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
        } catch (e) {}
    },

    summon(state, bossId) {
        const ritual = RITUALS.find(r => r.bossId === bossId);
        if (!ritual) return false;
        const chk = this.canSummon(state, ritual);
        if (!chk.ok) {
            Particles.showFloatingText(state, chk.why, state.player.x, state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            return false;
        }
        this.payCost(state, ritual.cost);
        // Short intro (camera beats + countdown below), then the boss wakes.
        const m = this.spawnBoss(state, bossId, 5);
        if (!m) return false;
        this.fightCountdown(state, m);
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.render();
        return true;
    },

    // Ritual-summon fight opener: black fade with READY?, teleport to the
    // beach beside the boss, then 3-2-1-FIGHT. The boss stays dormant until
    // the intro window ends, and the player is frozen for the sequence.
    fightCountdown(state, m) {
        try {
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
            // Freeze player + clear incoming fire for a fair cinematic.
            state._fightFreezeUntil = (state.time || 0) + 5;
            try {
                state.bullets = (state.bullets || []).filter(b => b && b.owner !== 'enemy');
            } catch (e) {}
            show('READY?');
            try { audio.playUIClick(); } catch (e) {}
            setTimeout(() => {
                try {
                    const B = CONFIG.WORLD;
                    p.inCave = false;
                    p.returnPos = null;
                    p.x = Utils.clamp(m.x - 220, B.MIN_X + 40, state.waterBoundaryX - 40);
                    p.y = Utils.clamp(m.y + 60, B.MIN_Y + 40, B.MAX_Y - 40);
                    p.vx = 0; p.vy = 0;
                    if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                } catch (e) {}
            }, 350);
            const steps = ['3', '2', '1', 'FIGHT!'];
            steps.forEach((s, i) => {
                setTimeout(() => {
                    show(s, s === 'FIGHT!' ? 'fight-ready-go' : '');
                    try {
                        if (s === 'FIGHT!') audio.playRoar();
                        else audio.playUIClick();
                    } catch (e) {}
                    if (s === 'FIGHT!') {
                        setTimeout(hide, 650);
                        UI.updateStatusBanner('FIGHT!', 'Boss', 'rose');
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

    // Shared stash panel (ritual modal + bait tab): live bucket counts
    stashLine(state) {
        const chip = (color, icon, name, n) =>
            `<span class="px-2 py-1 rounded-lg text-[10px] font-black border" style="color:${color};border-color:${color}55;background:${color}14">${icon} ${name} ×${n}</span>`;
        const keys = Object.keys(BOSS_KEYS).map(k =>
            chip(BOSS_KEYS[k].color, BOSS_KEYS[k].icon, BOSS_KEYS[k].name, this.countItem(state, k))).join('');
        const troIcons = { chalice: '🏆', fang: '🦷', eye: '👁️' };
        const tros = Object.keys(TROPHIES).map(k =>
            chip(TROPHIES[k].color, troIcons[k] || '🏆', TROPHIES[k].name, this.countItem(state, k))).join('');
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
                <div class="text-[10px] text-slate-400">Marlin's RITE OF THE DEEP: deliver 5 epic+ catches on his Quest Board — he calls the Priest down himself.</div>
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
        RITUALS.forEach(r => {
            const rs = this.ritualState(st, r);
            const sp = rs.sp || { name: r.bossId, color: '#ef4444', rarity: 'boss' };
            const chk = this.canSummon(st, r);
            const costHtml = rs.lines.map(l =>
                `<span class="${l.have >= l.need ? 'text-emerald-300' : 'text-slate-400'}">${l.label} (${l.have}/${l.need})</span>`
            ).join('');
            html += `<div class="glass-panel p-3 rounded-xl mb-2 border ${rs.slain ? 'border-emerald-500/50' : 'border-red-500/40'}">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-white text-sm">🕯 ${sp.name}
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/50">BOSS</span>
                            ${rs.slain ? '<span class="text-[9px] text-emerald-300 font-black">SLAIN ✓</span>' : ''}
                        </div>
                        <div class="text-[10px] text-slate-400">${r.blurb}</div>
                        <div class="flex gap-2 mt-1 text-[10px] font-bold flex-wrap">${costHtml}</div>
                        ${chk.ok ? '' : `<div class="text-[10px] text-amber-300/80 mt-0.5">${chk.why}</div>`}
                    </div>
                    <button data-summon="${r.bossId}" ${chk.ok ? '' : 'disabled'}
                        class="px-4 py-2 text-xs font-black rounded-xl shrink-0 transition-all ${chk.ok ? 'bg-gradient-to-r from-red-500 to-amber-500 hover:from-red-400 hover:to-amber-400 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}">
                        SUMMON
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
        // --- VOID PORTAL: swirling abyss in the NW corner sand.
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
            ? (nearHole ? 'Press E to descend!' : 'The seal is broken — descend!')
            : 'Sealed! Offer fish at runes 1 → 2 → 3';
        ctx.strokeText(sealHint, h.x, h.y + 62);
        ctx.fillStyle = unlocked ? '#6ee7b7' : '#fca5a5';
        ctx.fillText(sealHint, h.x, h.y + 62);
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
        const hint = near ? 'Press E!' : 'Walk in + Press E';
        ctx.strokeText(hint, s.x, s.y + 24);
        ctx.fillStyle = near ? '#fef08a' : '#ef4444';
        ctx.fillText(hint, s.x, s.y + 24);
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
        const hint = nearExit ? 'Press E to leave!' : 'Exit portal — south';
        ctx.strokeText(hint, e.x, e.y + 66);
        ctx.fillStyle = nearExit ? '#fef08a' : '#7dd3fc';
        ctx.fillText(hint, e.x, e.y + 66);
        // Cavern title
        ctx.font = 'black 30px Work Sans';
        ctx.lineWidth = 6;
        ctx.strokeText('🔮 THE HOLLOW CAVE', (r.x0 + r.x1) / 2, r.y0 + 70);
        ctx.fillStyle = '#c4b5fd';
        ctx.fillText('🔮 THE HOLLOW CAVE', (r.x0 + r.x1) / 2, r.y0 + 70);
        ctx.restore();
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
        if (overlay) overlay.classList.remove('hidden');
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
