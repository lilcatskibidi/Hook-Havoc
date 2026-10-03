const Player = {
    update(state, delta) {
        const p = state.player;
        const B = CONFIG.WORLD;

        // Safety net: no damage path may leave the player at 0 HP and
        // "alive" (used to happen with fish skills). Death always respawns.
        if (p.hp <= 0 && !p.isDead) {
            this.die(state);
            return;
        }

        if (p.stunTimer > 0) {
            p.stunTimer = Math.max(0, p.stunTimer - delta);
        } else if (state.fishing && state.fishing.mode === 'CASTING') {
            // Rooted while charging a cast: no walking the bobber onto land.
            // (Releasing SPACE throws from exactly where the press validated.)
        } else if (typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil) {
            // Boss-fight countdown: hold still until FIGHT!
        } else if (typeof WorldSystem !== 'undefined' && WorldSystem.boatRiding && WorldSystem.boatRiding(state)) {
            // Mid ferry ride: the boat owns your legs (see WorldSystem.updateBoatRide).
        } else {
            let dx = 0, dy = 0;
            if (state.keys['w'] || state.keys['arrowup']) dy -= 1;
            if (state.keys['s'] || state.keys['arrowdown']) dy += 1;
            if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
            if (state.keys['d'] || state.keys['arrowright']) dx += 1;
            if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

            let moveSpeed = p.speed;
            if (p.slowTimer > 0) {
                p.slowTimer = Math.max(0, p.slowTimer - delta);
                moveSpeed *= 0.5;
            }

            p.x += dx * moveSpeed * 60 * delta;
            p.y += dy * moveSpeed * 60 * delta;

            if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
        }

        if (p.burnTimer > 0) {
            p.burnTimer = Math.max(0, p.burnTimer - delta);
            p.burnTick = (p.burnTick || 0) + delta;
            if (p.burnTick >= 0.5) {
                p.burnTick = 0;
                p.hp = Math.max(0, p.hp - 3);
                try { audio.playHurt(); } catch (e) {}
                this.refreshHUD(state);
                if (typeof UI !== 'undefined' && UI.triggerDamageFlash) UI.triggerDamageFlash();
                if (p.hp <= 0) {
                    this.die(state);
                    return;
                }
            }
        }

        // One front door for every map's walkable area (beach, pier,
        // cave, isle sand + isle pier) — knockbacks land here too, so the
        // player can never be left standing a step off the deck.
        if (typeof WorldSystem !== 'undefined' && WorldSystem.clampPlayer) {
            try { WorldSystem.clampPlayer(state); } catch (e) {}
        } else if (state.player.inCave && typeof Ritual !== 'undefined' && Ritual.caveCollide) {
            try { Ritual.caveCollide(state); } catch (e) {}
        } else if (state.player.onIsland && typeof WorldSystem !== 'undefined' && WorldSystem.collide) {
            // 1.1.5: detached island rooms have their own collision.
            try { WorldSystem.collide(state); } catch (e) {}
        } else if (typeof WorldSystem !== 'undefined' && WorldSystem.onBridge && WorldSystem.bridgeDef) {
            // 1.1.5: the pier deck extends over the sea — walking its
            // plank lets the player reach SHALLOW then DEEP water.
            // Rule: past the surf you MUST be on the deck band (no
            // sideways escape over water); back on the sand you walk free.
            const b = WorldSystem.bridgeDef(state);
            const half = 46 + p.radius;
            const inBand = Math.abs(p.y - b.y) <= half + 26;
            const maxX = inBand ? b.x1 + p.radius : state.waterBoundaryX - p.radius;
            p.x = Utils.clamp(p.x, B.MIN_X + p.radius, maxX);
            if (p.x > state.waterBoundaryX - p.radius) {
                p.y = Utils.clamp(p.y, b.y - half, b.y + half);
            } else {
                p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);
            }
        } else {
        p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
        p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);
        }

        // Beach consumable timers
        if (p.baitTimer > 0) p.baitTimer = Math.max(0, p.baitTimer - delta);
        if (p.umbrellaTimer > 0) {
            p.umbrellaTimer = Math.max(0, p.umbrellaTimer - delta);
            // Safe-zone regen + fear enemies away
            if (p.hp < p.maxHp) {
                p.hp = Math.min(p.maxHp, p.hp + 2 * delta);
                if (Math.random() < 0.05) this.refreshHUD(state);
            }
            if (state.monstersOnLand) {
                for (const m of state.monstersOnLand) {
                    const d = Math.hypot(m.x - p.x, m.y - p.y);
                    if (d < 220 && d > 1) {
                        m.x += ((m.x - p.x) / d) * 60 * delta;
                        m.y += ((m.y - p.y) / d) * 60 * delta;
                    }
                }
            }
        }
        // Abyssal set regen
        if (p.armorSetBonus && p.armorSetBonus.hpRegen && p.hp < p.maxHp && !p.isDead) {
            p._regenTick = (p._regenTick || 0) + delta;
            if (p._regenTick >= 1) {
                p._regenTick = 0;
                p.hp = Math.min(p.maxHp, p.hp + p.armorSetBonus.hpRegen);
                this.refreshHUD(state);
            }
        }
    },

    selectWeapon(state, slotIdx) {
        const p = state.player;
        if (slotIdx < 0 || slotIdx >= EQUIP_SLOTS) return;

        const weaponId = p.equippedWeapons[slotIdx];
        if (!weaponId) {
            Particles.showFloatingText(state, `Slot ${slotIdx + 1} empty`, p.x, p.y - 30, '#94a3b8');
            return;
        }
        p.activeSlot = slotIdx;
        this.refreshWeaponHUD(state);
        if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
            UI.renderWeaponToolbar(state);
        }
    },

    refreshWeaponHUD(state) {
        const p = state.player;
        const weaponId = p.equippedWeapons[p.activeSlot];
        const w = weaponId ? WEAPONS.find(x => x.id === weaponId) : null;

        const nameEl = document.getElementById('weapon-name');
        const ammoEl = document.getElementById('weapon-ammo');
        const iconEl = document.getElementById('weapon-icon-box');
        const descEl = document.getElementById('weapon-desc');

        if (!w) {
            if (nameEl) nameEl.innerText = '— EMPTY SLOT —';
            if (ammoEl) ammoEl.innerText = 'Equip a weapon';
            if (iconEl) iconEl.innerHTML = `<i class="fa-solid fa-ban"></i>`;
            if (descEl) descEl.innerText = 'Open the shop and equip a gun to slot ' + (p.activeSlot + 1);
            return;
        }

        if (nameEl) nameEl.innerText = w.name.toUpperCase();
        if (ammoEl) {
            const ammo = p.weaponAmmo[w.id];
            ammoEl.innerText = (ammo === Infinity || ammo === undefined)
                ? '∞ Infinite'
                : `${ammo} / ${CONFIG.MAX_AMMO[w.id]}`;
        }
        if (iconEl) {
            // Live gun-model thumbnail (procedural or custom skin), FA icon fallback.
            let art = `<i class="fa-solid ${w.icon}"></i>`;
            try {
                if (typeof Render !== 'undefined' && Render.gunPreview) {
                    const snap = Render.gunPreview(w, p.gunSkins);
                    if (snap) art = `<img src="${snap}" class="gun-preview max-w-[44px] max-h-[30px] object-contain" alt="${w.name}">`;
                }
            } catch (e) {}
            iconEl.innerHTML = art;
        }
        if (descEl) descEl.innerText = w.desc;
    },

    refreshHUD(state) {
        const p = state.player;
        const hpText = document.getElementById('hp-text');
        if (hpText) hpText.innerText = `${Math.max(0, Math.round(p.hp))} / ${p.maxHp}`;

        const hpBar = document.getElementById('hp-bar');
        if (hpBar) hpBar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;

        const coinsDisplay = document.getElementById('coins-display');
        if (coinsDisplay) coinsDisplay.innerText = p.coins;

        const bucketDisplay = document.getElementById('bucket-display');
        if (bucketDisplay) bucketDisplay.innerText = `${p.bucket.length} / ${p.bucketCapacity}`;

        // Crafted bait chip (Ritual system)
        if (typeof Ritual !== 'undefined' && Ritual.refreshBaitHUD) {
            try { Ritual.refreshBaitHUD(state); } catch (e) {}
        }

        const xpDisplay = document.getElementById('xp-display');
        if (xpDisplay) xpDisplay.innerText = `Lv.${p.level}`;

        const shopCoins = document.getElementById('shop-coins-display');
        if (shopCoins) shopCoins.innerText = p.coins;
    },

    addXP(state, amount) {
        const p = state.player;
        p.xp += amount;
        while (p.xp >= p.xpToNext) {
            p.xp -= p.xpToNext;
            p.level++;
            p.xpToNext = Math.round(p.xpToNext * CONFIG.XP_LEVEL_GROWTH);
            p.maxHp += 15;
            p.hp = p.maxHp;
            try { audio.playLevelUp(); } catch (e) {}
            Particles.showFloatingText(state, `LEVEL UP! Lv.${p.level}`, p.x, p.y - 50, '#facc15');
            this.refreshHUD(state);
        }
    },

    die(state) {
        const p = state.player;
        // Single-shot: corpse ticks (hazards, burn) must not re-kill and
        // re-charge the -50c penalty while the death menu is open.
        if (p.isDead) return;
        p.isDead = true;
        try { state.mouse.isDown = false; } catch (e) {}
        const wasBurning = (p.burnTimer || 0) > 0;
        // Death stamp: HP stays 0 while dead, so enemies watch this
        // counter to know revenge was served (see EnemySpawner).
        try { state._deathSeq = (state._deathSeq || 0) + 1; } catch (e) {}
        p.hp = 0;

        p.stunTimer = 0;
        p.slowTimer = 0;
        p.burnTimer = 0;
        p.burnTick = 0;
        p.flashTimer = 0;
        p.blurTimer = 0;
        try {
            const cv = document.getElementById('gameCanvas');
            if (cv) cv.style.filter = '';
            const fl = document.getElementById('flash-overlay');
            if (fl) fl.classList.remove('active');
        } catch (e) {}

        try { audio.stopReelLoop(); } catch (e) {}

        // Boss-fight rule: bosses DON'T run and DON'T despawn. Dying costs
        // one of 10 chances — the field is left exactly as it was so the
        // boss waits for you. Die 10 times and it leaves, mocking you.
        let inBossFight = false;
        try {
            inBossFight = (typeof Ritual !== 'undefined' && Ritual.bossFightActive)
                ? Ritual.bossFightActive(state) : false;
        } catch (e) {}
        if (inBossFight) {
            state.bossDeaths = (state.bossDeaths || 0) + 1;
            if (state.bossDeaths >= 10) {
                this.fleeBoss(state);
            }
        } else {
            state.bossDeaths = 0;
        }

        // Normal death drops your current fight — but NEVER a boss fight
        if (!inBossFight && state.fishing) {
            if (state.fishing.mode === 'REELING' ||
                state.fishing.mode === 'WAITING' ||
                state.fishing.mode === 'BITING') {
                Particles.showFloatingText(state, 'Fish Escaped!',
                    state.fishing.bobber.x, state.fishing.bobber.y - 20, '#ef4444');
            }
            state.fishing.mode = 'IDLE';
            state.fishing.hookedFish = null;
            state.fishing.lineTension = 0;
            state.fishing.biteTimer = 0;
            state.fishing.waitingTime = 0;
            state.fishing.castPower = 0;
            state.fishing.castFrom = null;
            state.fishing.castTo = null;
            state.fishing.castT = 0;
        }

        // Clear the field so nothing camps the corpse (bosses stay put)
        if (!inBossFight) state.monstersOnLand = [];

        const lost = Math.min(p.coins, 50);
        p.coins = Math.max(0, p.coins - 50);
        this.refreshHUD(state);

        try { audio.playFishDeath(); } catch (e) {}
        try { audio.playRoar(); } catch (e) {}

        // Close anything else open — death takes over the screen
        try {
            ['shop-modal', 'casino-modal', 'index-modal', 'npc-modal'].forEach(id => {
                const m = document.getElementById(id);
                if (m) m.classList.add('hidden');
            });
        } catch (e) {}

        this.showDeathMenu(state, lost, wasBurning);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
    },

    showDeathMenu(state, lost, wasBurning) {
        const p = state.player;
        const menu = document.getElementById('death-menu');
        if (!menu) return;
        const cause = wasBurning ? 'Burned alive!' : 'Slain in the deep!';
        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
        set('death-cause', cause);
        const chances = 10 - (state.bossDeaths || 0);
        set('death-stats', (state.bossDeaths > 0)
            ? `Boss fight — ${chances} ${chances === 1 ? 'chance' : 'chances'} left before it leaves · Penalty −${lost}c`
            : `Lv.${p.level} · Bucket kept (${(p.bucket || []).length} fish) · Penalty −${lost}c`);
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        // Dying on an isle offers the island dock as respawn (stays on the
        // isle); camp/menu still send you back to the mainland beach.
        const isleSpawn = (p.onIsland && p.islandSpawn &&
            typeof p.islandSpawn.x === 'number') ? p.islandSpawn : null;
        const beachBtn = document.getElementById('btn-respawn-beach');
        if (isleSpawn) {
            if (beachBtn) beachBtn.innerHTML = '<i class="fa-solid fa-anchor mr-2"></i> Respawn — Island Dock';
            on('btn-respawn-beach', () => this.respawnAt(state, isleSpawn.x, isleSpawn.y, 'Island Dock', false, true));
        } else {
            if (beachBtn) beachBtn.innerHTML = '<i class="fa-solid fa-heart-pulse mr-2"></i> Respawn — Beach';
            on('btn-respawn-beach', () => this.respawnAt(state, 220, 300, 'Beach'));
        }
        on('btn-respawn-camp', () => {
            let s = { x: 220, y: 300 };
            try {
                if (typeof NPC !== 'undefined' && NPC.spot) s = NPC.spot(state);
            } catch (e) {}
            this.respawnAt(state, s.x, s.y, "Marlin's Camp");
        });
        on('btn-death-menu', () => {
            // Fresh and safe before leaving: respawn silently, then menu
            this.respawnAt(state, 220, 300, null, true);
            if (typeof MainMenu !== 'undefined') MainMenu.show();
        });
        menu.classList.remove('hidden');
        menu.classList.add('flex');
    },

    hideDeathMenu() {
        try {
            const menu = document.getElementById('death-menu');
            if (menu) { menu.classList.add('hidden'); menu.classList.remove('flex'); }
        } catch (e) {}
    },

    // 10th death in a boss fight: every boss leaves at once, mocking you.
    // Counter resets — earn your next 10 the hard way.
    fleeBoss(state) {
        try {
            const p = state.player;
            let bx = p.x, by = p.y - 60;
            const land = (state.monstersOnLand || []).filter(m => m && m.species && m.species.isBoss);
            if (land.length) { bx = land[0].x; by = land[0].y - 90; }
            const hf = state.fishing && state.fishing.mode === 'HOOKED' ? state.fishing.hookedFish : null;
            if (hf && hf.species && hf.species.isBoss) { bx = hf.x; by = hf.y - 90; }
            state.monstersOnLand = (state.monstersOnLand || []).filter(m => !(m && m.species && m.species.isBoss));
            if (state.activeBoss && state.activeBoss.species && state.activeBoss.species.isBoss) state.activeBoss = null;
            if (hf && hf.species && hf.species.isBoss) {
                if (typeof Fishing !== 'undefined' && Fishing.escapeFish) Fishing.escapeFish(state, '');
                else { state.fishing.mode = 'IDLE'; state.fishing.hookedFish = null; }
            }
            state.enemies = (state.enemies || []).filter(e => !(e && e.isBoss));
            state.bossDeaths = 0;
            try { audio.playRoar(); } catch (e) {}
            Particles.showFloatingText(state, '💀 "YOU ARE NOT STRONG ENOUGH TO BEAT ME."', bx, by, '#ef4444');
            if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                UI.updateStatusBanner('The boss spurns you and leaves. Train, gear up, try again.', 'Outmatched', 'rose');
            }
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        } catch (e) {}
    },

    respawnAt(state, x, y, label, silent, keepIsland) {
        const p = state.player;
        p.isDead = false;
        p.hp = p.maxHp;
        p.x = x;
        p.y = y;
        // Death ejects you from the cave (no corpse-camping the circle)
        p.inCave = false;
        p.returnPos = null;
        // Detached islands normally eject you to the beach — UNLESS you
        // respawn at your island spawn (dock), which keeps you on the isle.
        if (!(keepIsland && p.onIsland)) {
            p.onIsland = null;
            p.boatReturn = null;
            p.islandSpawn = null;
        }
        p.stunTimer = 0;
        p.slowTimer = 0;
        p.burnTimer = 0;
        p.burnTick = 0;
        p.flashTimer = 0;
        p.blurTimer = 0;
        this.hideDeathMenu();
        this.refreshHUD(state);
        if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) UI.renderWeaponToolbar(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        if (!silent) {
            try { audio.playLevelUp(); } catch (e) {}
            Particles.showFloatingText(state, `Respawned at ${label || 'safety'}!`, x, y - 50, '#34d399');
            if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                UI.updateStatusBanner(`Back on your feet at ${label || 'safety'}.`, 'Respawn', 'emerald');
            }
        }
    },

    // Heal effect for multiplayer
    heal(state, amount) {
        const p = state.player;
        const oldHp = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + amount);
        const actualHeal = p.hp - oldHp;
        
        if (actualHeal > 0) {
            // Green heal particles
            if (typeof Particles !== 'undefined') {
                Particles.spawnParticles(state, p.x, p.y, '#34d399', 20, { size: 4, speed: 100 });
                Particles.showFloatingText(state, `+${actualHeal} HP`, p.x, p.y - 40, '#34d399');
            }
            
            // Green screen flash
            const el = document.getElementById('damage-flash');
            if (el) {
                el.style.background = 'radial-gradient(circle, transparent 30%, rgba(52, 211, 153, 0.4) 100%)';
                el.classList.remove('active');
                void el.offsetWidth;
                el.classList.add('active');
                setTimeout(() => el.style.background = '', 300);
            }
            
            if (typeof audio !== 'undefined') {
                try { audio.playCoin(); } catch (e) {}
            }
            
            this.refreshHUD(state);
        }
        
        return actualHeal;
    },
    
    // Select rod from inventory
    selectRod(state) {
        const p = state.player;
        if (!p.unlockedRods || p.unlockedRods.length === 0) return;
        
        // Cycle through unlocked rods
        const currentIdx = p.unlockedRods.indexOf(p.equippedRod?.id || 'rod_starter');
        const nextIdx = (currentIdx + 1) % p.unlockedRods.length;
        const rodId = p.unlockedRods[nextIdx];
        const rod = RODS.find(r => r.id === rodId);
        
        if (rod) {
            p.equippedRod = rod;
            this.refreshHUD(state);
            UI.refreshLuckDisplay(state);
            UI.renderWeaponToolbar(state);
            Particles.showFloatingText(state, `Rod: ${rod.name}`, p.x, p.y - 30, rod.color);
            try { audio.playUIClick(); } catch (e) {}
        }
    }
};