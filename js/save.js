const SaveSystem = {
    KEY: 'aquatic_havoc_save_v1',

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
            weaponAmmo: { ...p.weaponAmmo },
            unlockedRods: [...p.unlockedRods],
            equippedRodId: p.equippedRod ? p.equippedRod.id : 'rod_starter',
            bucket: p.bucket.map(f => ({ id: f.id, name: f.name, value: f.value, size: f.size, shiny: !!f.shiny, color: f.color, rarity: f.rarity })),
            bucketCapacity: p.bucketCapacity,
            // Fish index - track caught fish
            caughtFish: p.caughtFish ? [...new Set(p.caughtFish.map(f => f.id))] : [],
            casinoTokens: p.casinoTokens || 0,
            casinoLifetimeWinnings: p.casinoLifetimeWinnings || 0,
            ownedArmor: p.ownedArmor ? [...p.ownedArmor] : ['vest_light'],
            equippedArmor: p.equippedArmor ? { ...p.equippedArmor } : {},
            beachShopUnlocked: !!p.beachShopUnlocked,
            x: p.x,
            y: p.y
        };
    },

    save(state) {
        try {
            const data = this.collect(state);
            localStorage.setItem(this.KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('[SaveSystem] save failed:', e);
            return false;
        }
    },

    load(state) {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || data.version !== 1) return false;
            return this.apply(state, data);
        } catch (e) {
            console.warn('[SaveSystem] load failed:', e);
            return false;
        }
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
                    // Restore per-catch shiny/value overrides on a clone
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

        // Restore caught fish index
        if (Array.isArray(data.caughtFish)) {
            p.caughtFish = data.caughtFish
                .map(id => FISH_SPECIES.find(s => s.id === id))
                .filter(Boolean);
        } else {
            p.caughtFish = [];
        }

        if (typeof data.casinoTokens === 'number') p.casinoTokens = Math.max(0, Math.floor(data.casinoTokens));
        if (typeof data.casinoLifetimeWinnings === 'number') p.casinoLifetimeWinnings = Math.max(0, Math.floor(data.casinoLifetimeWinnings));
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

        return true;
    },

    wipe() {
        try { localStorage.removeItem(this.KEY); } catch (e) {}
    },

    exists() {
        try { return !!localStorage.getItem(this.KEY); }
        catch (e) { return false; }
    }
};