const SaveSystem = {
    KEY: 'aquatic_havoc_save_v1', // legacy single save (migrates to slot 1)
    SLOT_PREFIX: 'aquatic_havoc_save_v1_s',
    MP_KEY: 'aquatic_havoc_mp_save_v1',
    LAST_SLOT_KEY: 'ah_slot',
    SLOTS: [1, 2, 3],

    slotKey(slot) { return this.SLOT_PREFIX + (slot || 1); },

    getSlot() {
        try {
            const s = parseInt(localStorage.getItem(this.LAST_SLOT_KEY) || '1', 10);
            return this.SLOTS.includes(s) ? s : 1;
        } catch (e) { return 1; }
    },

    setSlot(slot) {
        try { localStorage.setItem(this.LAST_SLOT_KEY, String(slot)); } catch (e) {}
    },

    collect(state) {
        const p = state.player;
        return {
            version: 1,
            savedAt: Date.now(),
            coins: p.coins,
            level: p.level,
            xp: p.xp,
            xpToNext: p.xpToNext,
            maxHp: p.maxHp,
            ownedWeapons: [...p.ownedWeapons],
            equippedWeapons: [...p.equippedWeapons],
            activeSlot: p.activeSlot,
            gunSkins: p.gunSkins ? { ...p.gunSkins } : {},
            weaponAmmo: { ...p.weaponAmmo },
            unlockedRods: [...p.unlockedRods],
            equippedRodId: p.equippedRod ? p.equippedRod.id : 'rod_starter',
            bucket: p.bucket.map(f => ({ id: f.id, name: f.name, value: f.value, size: f.size, shiny: !!f.shiny, color: f.color, rarity: f.rarity })),
            bucketCapacity: p.bucketCapacity,
            // Fish index - track caught fish
            caughtFish: p.caughtFish ? [...new Set(p.caughtFish.map(f => f.id))] : [],
            casinoTokens: p.casinoTokens || 0,
            casinoLifetimeWinnings: p.casinoLifetimeWinnings || 0,
            seagullKills: p.seagullKills || 0,
            ownedArmor: p.ownedArmor ? [...p.ownedArmor] : ['vest_light'],
            equippedArmor: p.equippedArmor ? { ...p.equippedArmor } : {},
            beachShopUnlocked: !!p.beachShopUnlocked,
            tutorialDone: !!p.tutorialDone,
            tut: p.tut ? { ...p.tut } : { cast: false, hook: false, beach: false },
            quests: p.quests ? JSON.parse(JSON.stringify(p.quests)) : { active: null, offered: [], done: 0 },
            x: p.x,
            y: p.y
        };
    },

    // ---- Local slots (single player) ----
    save(state, slot) {
        // MP sessions: host writes the expedition file, clients write
        // their own personal file (progression is per-player now).
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.roomCode && Multiplayer.isHost) {
                return this.saveMP(state);
            }
        } catch (e) {}
        slot = slot || state.saveSlot || this.getSlot();
        state.saveSlot = slot;
        this.setSlot(slot);
        try {
            const data = this.collect(state);
            localStorage.setItem(this.slotKey(slot), JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('[SaveSystem] save failed:', e);
            return false;
        }
    },

    load(state, slot) {
        slot = slot || state.saveSlot || this.getSlot();
        try {
            // Legacy migration: old single key becomes slot 1
            let raw = localStorage.getItem(this.slotKey(slot));
            if (!raw && slot === 1) raw = localStorage.getItem(this.KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || data.version !== 1) return false;
            state.saveSlot = slot;
            this.setSlot(slot);
            return this.apply(state, data);
        } catch (e) {
            console.warn('[SaveSystem] load failed:', e);
            return false;
        }
    },

    exists(slot) {
        slot = slot || this.getSlot();
        try {
            if (slot === 1 && localStorage.getItem(this.KEY)) return true;
            return !!localStorage.getItem(this.slotKey(slot));
        } catch (e) { return false; }
    },

    // Lightweight summary for the slot picker (no state mutation)
    slotMeta(slot) {
        try {
            let raw = localStorage.getItem(this.slotKey(slot));
            if (!raw && slot === 1) raw = localStorage.getItem(this.KEY);
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (!d || d.version !== 1) return null;
            return { level: d.level || 1, coins: d.coins || 0, savedAt: d.savedAt || 0 };
        } catch (e) { return null; }
    },

    wipe(slot) {
        try {
            if (slot) localStorage.removeItem(this.slotKey(slot));
            else localStorage.removeItem(this.KEY);
        } catch (e) {}
    },

    // ---- Shared multiplayer expedition (host-owned, one file for all) ----
    saveMP(state) {
        try {
            const data = this.collect(state);
            localStorage.setItem(this.MP_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('[SaveSystem] mp save failed:', e);
            return false;
        }
    },

    loadMP(state) {
        try {
            const raw = localStorage.getItem(this.MP_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || data.version !== 1) return false;
            return this.apply(state, data);
        } catch (e) {
            console.warn('[SaveSystem] mp load failed:', e);
            return false;
        }
    },

    existsMP() {
        try { return !!localStorage.getItem(this.MP_KEY); } catch (e) { return false; }
    },

    mpMeta() {
        try {
            const raw = localStorage.getItem(this.MP_KEY);
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (!d || d.version !== 1) return null;
            return { level: d.level || 1, coins: d.coins || 0, savedAt: d.savedAt || 0 };
        } catch (e) { return null; }
    },

    wipeMP() {
        try { localStorage.removeItem(this.MP_KEY); } catch (e) {}
    },

    // Fresh expedition state for a New MP game (or New local slot).
    // Resets economy/progression but keeps records (achievements, index).
    freshPlayer(state) {
        const p = state.player;
        const keepAch = p.achievements;
        const keepCaught = p.caughtFish;
        const keepTotals = { totalFishCaught: p.totalFishCaught, totalKills: p.totalKills, bossKills: p.bossKills, casinoTotalLost: p.casinoTotalLost };
        p.x = 300; p.y = 300;
        p.hp = 100; p.maxHp = 100;
        p.equippedWeapons = ['pistol', null, null, null];
        p.activeSlot = 0;
        p.ownedWeapons = ['pistol'];
        p.gunSkins = {};
        p.weaponAmmo = { pistol: Infinity };
        p.equippedRod = (typeof RODS !== 'undefined' && RODS[0]) || { tensionMax: 100, luck: 0 };
        p.unlockedRods = ['rod_starter'];
        p.coins = 150;
        p.bucket = [];
        p.bucketCapacity = 15;
        p.lastShotTime = -999;
        p.weaponRecoil = 0;
        p.muzzleFlash = 0;
        p.reloading = false;
        p.reloadTimer = 0;
        p.xp = 0;
        p.level = 1;
        p.xpToNext = (typeof CONFIG !== 'undefined' && CONFIG.XP_LEVEL_BASE) || 100;
        p.facing = 1;
        p.stunTimer = 0; p.slowTimer = 0; p.burnTimer = 0; p.burnTick = 0;
        p.isDead = false;
        p.casinoTokens = 0;
        p.casinoLifetimeWinnings = 0;
        p.seagullKills = 0;
        p.ownedArmor = ['vest_light'];
        p.equippedArmor = {};
        p.beachShopUnlocked = false;
        p.tutorialDone = false;
        p.tut = { cast: false, hook: false, beach: false };
        p.quests = { active: null, offered: [], done: 0 };
        p.baitTimer = 0;
        p.umbrellaTimer = 0;
        p.achievements = keepAch;
        p.caughtFish = keepCaught || [];
        Object.assign(p, keepTotals);
        state.fishing = {
            mode: 'IDLE', castPower: 0, castDir: 1,
            bobber: { x: 0, y: 0 }, lineTension: 0, hookedFish: null,
            biteTimer: 0, waitingTime: 0
        };
        state.monstersOnLand = [];
        state.enemies = [];
        state.groundLoot = [];
        state.groundHazards = [];
        state.delayedBlasts = [];
        state.bullets = [];
        state.activeBoss = null;
        state.remotePlayer = null;
        state.remotePlayers = {};
        if (typeof Shop !== 'undefined' && Shop.applyArmorStats) {
            try { Shop.applyArmorStats(state); } catch (e) {}
        }
        if (typeof Casino !== 'undefined') {
            Casino.tokens = 0;
            try { Casino.updateTokenDisplay(); } catch (e) {}
        }
        if (typeof Player !== 'undefined') {
            try { Player.refreshHUD(state); Player.refreshWeaponHUD(state); } catch (e) {}
            try { if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) UI.renderWeaponToolbar(state); } catch (e) {}
            try { if (typeof UI !== 'undefined' && UI.refreshLuckDisplay) UI.refreshLuckDisplay(state); } catch (e) {}
        }
        try {
            if (typeof NPC !== 'undefined' && NPC.ensureQuests) NPC.ensureQuests(state);
            if (typeof NPC !== 'undefined' && NPC.updateTracker) NPC.updateTracker(state);
        } catch (e) {}
    },

    apply(state, data) {
        const p = state.player;

        if (typeof data.coins === 'number')    p.coins = data.coins;
        if (typeof data.level === 'number')    p.level = data.level;
        if (typeof data.xp === 'number')       p.xp = data.xp;
        if (typeof data.xpToNext === 'number') p.xpToNext = data.xpToNext;
        if (typeof data.maxHp === 'number')    p.maxHp = data.maxHp;
        p.hp = p.maxHp;

        if (Array.isArray(data.ownedWeapons) && data.ownedWeapons.length) {
            const validIds = new Set(WEAPONS.map(w => w.id));
            p.ownedWeapons = data.ownedWeapons.filter(id => validIds.has(id));
            if (!p.ownedWeapons.includes('pistol')) p.ownedWeapons.push('pistol');
        }

        if (Array.isArray(data.equippedWeapons) && data.equippedWeapons.length === EQUIP_SLOTS) {
            p.equippedWeapons = data.equippedWeapons.map(id =>
                (id && p.ownedWeapons.includes(id)) ? id : null
            );
            if (!p.equippedWeapons.includes('pistol') && p.ownedWeapons.includes('pistol')) {
                p.equippedWeapons[0] = 'pistol';
            }
        }
        if (typeof data.activeSlot === 'number') {
            p.activeSlot = Math.max(0, Math.min(EQUIP_SLOTS - 1, data.activeSlot));
        }
        // Gun skins: { weaponId: 'custom' | 'classic' } (missing = auto PNG)
        p.gunSkins = {};
        if (data.gunSkins && typeof data.gunSkins === 'object') {
            for (const [id, v] of Object.entries(data.gunSkins)) {
                if (v === 'custom' || v === 'classic') p.gunSkins[id] = v;
            }
        }

        if (data.weaponAmmo && typeof data.weaponAmmo === 'object') {
            p.weaponAmmo = {};
            p.ownedWeapons.forEach(id => {
                const max = (CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[id]) || Infinity;
                if (max === Infinity) {
                    p.weaponAmmo[id] = Infinity;
                } else {
                    const saved = data.weaponAmmo[id];
                    p.weaponAmmo[id] = (typeof saved === 'number' && !isNaN(saved))
                        ? Math.min(max, Math.max(0, saved))
                        : max;
                }
            });
        }

        if (Array.isArray(data.unlockedRods) && data.unlockedRods.length) {
            const validRodIds = new Set(RODS.map(r => r.id));
            p.unlockedRods = data.unlockedRods.filter(id => validRodIds.has(id));
            if (!p.unlockedRods.includes('rod_starter')) p.unlockedRods.unshift('rod_starter');
        }
        if (data.equippedRodId) {
            const rod = RODS.find(r => r.id === data.equippedRodId);
            if (rod && p.unlockedRods.includes(rod.id)) p.equippedRod = rod;
            else p.equippedRod = RODS[0];
        }

        if (Array.isArray(data.bucket)) {
            p.bucket = data.bucket
                .map(f => {
                    const base = FISH_SPECIES.find(s => s.id === f.id);
                    if (!base) return f.shiny || (f.value && f.name) ? f : null;
                    if (f.shiny || (typeof f.value === 'number' && f.value !== base.value)) {
                        const c = Object.assign({}, base);
                        if (f.name) c.name = f.name;
                        if (typeof f.value === 'number') c.value = f.value;
                        if (typeof f.size === 'number') c.size = f.size;
                        if (f.shiny) c.shiny = true;
                        if (f.color) c.color = f.color;
                        return c;
                    }
                    return base;
                })
                .filter(Boolean);
        }
        if (typeof data.bucketCapacity === 'number') p.bucketCapacity = data.bucketCapacity;

        if (typeof data.x === 'number') p.x = data.x;
        if (typeof data.y === 'number') p.y = data.y;

        if (Array.isArray(data.caughtFish)) {
            p.caughtFish = data.caughtFish
                .map(id => FISH_SPECIES.find(s => s.id === id))
                .filter(Boolean);
        } else {
            p.caughtFish = [];
        }

        if (typeof data.casinoTokens === 'number') p.casinoTokens = Math.max(0, Math.floor(data.casinoTokens));
        if (typeof data.casinoLifetimeWinnings === 'number') p.casinoLifetimeWinnings = Math.max(0, Math.floor(data.casinoLifetimeWinnings));
        if (typeof data.seagullKills === 'number') p.seagullKills = Math.max(0, Math.floor(data.seagullKills));
        if (Array.isArray(data.ownedArmor) && data.ownedArmor.length) {
            const valid = new Set(ARMOR.map(a => a.id));
            p.ownedArmor = data.ownedArmor.filter(id => valid.has(id));
            if (!p.ownedArmor.includes('vest_light')) p.ownedArmor.unshift('vest_light');
        } else if (!p.ownedArmor) p.ownedArmor = ['vest_light'];
        if (data.equippedArmor && typeof data.equippedArmor === 'object') {
            p.equippedArmor = {};
            ['head', 'chest', 'hands', 'feet'].forEach(slot => {
                const id = data.equippedArmor[slot];
                if (id && (p.ownedArmor || []).includes(id)) p.equippedArmor[slot] = id;
            });
        }
        if (typeof Shop !== 'undefined' && Shop.applyArmorStats) {
            try { Shop.applyArmorStats(state); } catch (e) {}
        }
        if (typeof Casino !== 'undefined' && state.player) {
            Casino.tokens = p.casinoTokens || 0;
            try { Casino.updateTokenDisplay(); } catch (e) {}
        }
        if (typeof data.beachShopUnlocked === 'boolean') p.beachShopUnlocked = data.beachShopUnlocked;
        // Tutorial + NPC quests
        p.tutorialDone = !!data.tutorialDone;
        if (data.tut && typeof data.tut === 'object') {
            p.tut = { cast: !!data.tut.cast, hook: !!data.tut.hook, beach: !!data.tut.beach };
        } else if (!p.tut) {
            p.tut = { cast: false, hook: false, beach: false };
        }
        if (data.quests && typeof data.quests === 'object' && typeof FISH_SPECIES !== 'undefined') {
            const validIds = new Set(FISH_SPECIES.map(s => s.id));
            const clean = (q) => (q && validIds.has(q.speciesId) && (q.need | 0) > 0) ? {
                qid: String(q.qid), speciesId: q.speciesId,
                need: Math.min(99, q.need | 0), have: Math.min(99, Math.max(0, q.have | 0)),
                rewardCoins: Math.max(0, q.rewardCoins | 0), rewardXp: Math.max(0, q.rewardXp | 0)
            } : null;
            p.quests = { active: null, offered: [], done: Math.max(0, data.quests.done | 0) };
            const a = clean(data.quests.active);
            if (a) p.quests.active = a;
            (data.quests.offered || []).forEach(o => {
                const c = clean(o);
                if (c && p.quests.offered.length < 6) p.quests.offered.push(c);
            });
            // Progress is bucket-derived: resync (sold/missing fish un-count)
            // and refresh the tracker HUD right after loading.
            try {
                if (typeof NPC !== 'undefined') {
                    if (NPC.syncActive) NPC.syncActive(state);
                    if (NPC.updateTracker) NPC.updateTracker(state);
                }
            } catch (e) {}
        }

        return true;
    }
};