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
            bucket: p.bucket.map(f => ({ id: f.id })),
            bucketCapacity: p.bucketCapacity,
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
                .map(f => FISH_SPECIES.find(s => s.id === f.id))
                .filter(Boolean);
        }
        if (typeof data.bucketCapacity === 'number') p.bucketCapacity = data.bucketCapacity;

        if (typeof data.x === 'number') p.x = data.x;
        if (typeof data.y === 'number') p.y = data.y;

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