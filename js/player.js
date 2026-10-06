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

        // Corpses don't act: no walking, no casting, no drift. The WORLD
        // keeps simulating around the body (see mainLoop) — only the
        // body's own update stops here.
        if (p.isDead) return;

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
            // Adrenaline item: 1.5x legs while it lasts.
            if ((p.adrenalineT || 0) > 0) {
                p.adrenalineT = Math.max(0, p.adrenalineT - delta);
                moveSpeed *= 1.5;
            }
            // Swift Tide item: +40% legs while it lasts (stacks with adrenaline).
            if ((p.swiftT || 0) > 0) {
                p.swiftT = Math.max(0, p.swiftT - delta);
                moveSpeed *= 1.4;
            }
            // Regen Kelp: +5 HP/s while it lasts.
            if ((p.regenT || 0) > 0) {
                p.regenT = Math.max(0, p.regenT - delta);
                if ((p.hp || 0) > 0 && !p.isDead && p.hp < p.maxHp) {
                    p.hp = Math.min(p.maxHp, p.hp + 5 * delta);
                    p._regenTick = (p._regenTick || 0) + delta;
                    if (p._regenTick >= 1) {
                        p._regenTick = 0;
                        try { this.refreshHUD(state); } catch (e) {}
                    }
                }
            }
            // Timed item buffs: just decay (hooks live in Combat/weapons/fishData).
            if ((p.ironSkinT || 0) > 0) p.ironSkinT = Math.max(0, p.ironSkinT - delta);
            if ((p.rageT || 0) > 0) p.rageT = Math.max(0, p.rageT - delta);
            if ((p.thornT || 0) > 0) p.thornT = Math.max(0, p.thornT - delta);
            if ((p.magnetT || 0) > 0) p.magnetT = Math.max(0, p.magnetT - delta);
            if ((p.luckT || 0) > 0) p.luckT = Math.max(0, p.luckT - delta);

            p.x += dx * moveSpeed * 60 * delta;
            p.y += dy * moveSpeed * 60 * delta;

            if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
        }

        // Dash (Q): burst of speed + i-frames. Reuses the pull-velocity
        // channel so knockbacks and dashes compose instead of stacking.
        if ((p.dashT || 0) > 0) {
            p.dashT = Math.max(0, p.dashT - delta);
            try {
                Particles.spawnParticles(state, p.x, p.y, '#67e8f9', 1, { size: 3 });
            } catch (e) {}
        }
        if ((p.iframes || 0) > 0) p.iframes = Math.max(0, p.iframes - delta);
        if ((p.dashCd || 0) > 0) p.dashCd = Math.max(0, p.dashCd - delta);
        if ((p.itemCd || 0) > 0) p.itemCd = Math.max(0, p.itemCd - delta);

        // Pull velocity (fish yanks, knockbacks, dash): REAL dragging over
        // time — never a teleport. clampPlayer below keeps it legal, so a
        // 200px yank slides along the shore instead of corner-stranding you.
        if ((p.pullT || 0) > 0) {
            p.x += (p.pullVx || 0) * delta;
            p.y += (p.pullVy || 0) * delta;
            p.pullT -= delta;
            if (p.pullT <= 0) { p.pullVx = 0; p.pullVy = 0; p.pullT = 0; }
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

        // Glue walls are solid: the caster can't walk through their own goo.
        try {
            if (typeof GlueWall !== 'undefined' && GlueWall.collide) GlueWall.collide(state, p, p.radius || 16);
        } catch (e) {}

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
        // Hydra grasping tide: living leash anchored to the hydra body.
        // Drags the player toward it for 5s; the dotted energy rope is
        // drawn as particles (no render plumbing needed).
        if (p.tether && p.tether.timer > 0) {
            p.tether.timer -= delta;
            let ax = p.tether.x, ay = p.tether.y;
            try {
                const s = p.tether.src;
                if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) { ax = s.x; ay = s.y; }
            } catch (e) {}
            const dx = ax - p.x, dy = ay - p.y;
            const d = Math.hypot(dx, dy) || 1;
            const pull = 260;
            p.x += (dx / d) * pull * delta;
            p.y += (dy / d) * pull * delta;
            try {
                for (let i = 1; i <= 5; i++) {
                    const t = i / 6;
                    Particles.spawnParticles(state, p.x + dx * t, p.y + dy * t, '#4ade80', 1, { size: 3 });
                }
                if (typeof WorldSystem !== 'undefined' && WorldSystem.clampEntity) {
                    WorldSystem.clampEntity(state, p, p.radius);
                }
            } catch (e) {}
            if (p.tether.timer <= 0) {
                p.tether = null;
                try {
                    Particles.showFloatingText(state, '🪢 LEASH BROKEN!', p.x, p.y - 50, '#86efac');
                } catch (e) {}
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
        // Live: other divers see the switched gun instantly.
        try { if (typeof Multiplayer !== 'undefined' && Multiplayer.pushSkinPrefs) Multiplayer.pushSkinPrefs(); } catch (e) {}
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
        // Money sanitizer: coins are whole and never negative/NaN — a
        // single funnel so casino/MP/sell float dust can't corrupt the wallet.
        try {
            p.coins = Math.max(0, Math.floor(Number(p.coins) || 0));
        } catch (e) {}
        const hpText = document.getElementById('hp-text');
        if (hpText) hpText.innerText = `${Math.max(0, Math.round(p.hp))} / ${p.maxHp}`;

        const hpBar = document.getElementById('hp-bar');
        if (hpBar) hpBar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;

        const coinsDisplay = document.getElementById('coins-display');
        if (coinsDisplay) coinsDisplay.innerText = p.coins;

        const bucketDisplay = document.getElementById('bucket-display');
        if (bucketDisplay) {
            bucketDisplay.innerText = `${p.bucket.length} / ${p.bucketCapacity}`;
            // Full bucket reads instantly: red pulsing count (CSS .bucket-full).
            try {
                bucketDisplay.classList.toggle('bucket-full', (p.bucket.length || 0) >= (p.bucketCapacity || 15));
            } catch (e) {}
        }

        // Crafted bait chip (Ritual system)
        if (typeof Ritual !== 'undefined' && Ritual.refreshBaitHUD) {
            try { Ritual.refreshBaitHUD(state); } catch (e) {}
        }

        const xpDisplay = document.getElementById('xp-display');
        if (xpDisplay) xpDisplay.innerText = `Lv.${p.level}`;

        // XP progress bar (vitals panel) — kept in sync on every HUD pass
        // so gains read live, not just on level-up.
        try {
            const xpBar = document.getElementById('xp-bar');
            const xpText = document.getElementById('xp-text');
            const need = Math.max(1, Number(p.xpToNext) || 1);
            const pct = Math.max(0, Math.min(100, (Number(p.xp) || 0) / need * 100));
            if (xpBar) xpBar.style.width = `${pct}%`;
            if (xpText) xpText.innerText = `${Math.floor(Number(p.xp) || 0)} / ${Math.floor(need)}`;
        } catch (e) {}

        const shopCoins = document.getElementById('shop-coins-display');
        if (shopCoins) shopCoins.innerText = p.coins;

        // Live fortune achievements (guarded, one comparison each)
        try {
            if (typeof Achievements !== 'undefined' && Achievements.checkWealth) {
                Achievements.checkWealth(state);
            }
        } catch (e) {}
    },

    addXP(state, amount) {
        const p = state.player;
        if (!Number.isFinite(Number(p.xpToNext)) || Number(p.xpToNext) <= 0) {
            p.xpToNext = (typeof CONFIG !== 'undefined' && CONFIG.XP_LEVEL_BASE) || 100;
        }
        if (!Number.isFinite(Number(p.xp))) p.xp = 0;
        p.xp += Math.max(0, Math.floor(Number(amount) || 0));
        let guard = 0;
        while (p.xp >= p.xpToNext && guard++ < 100) {
            p.xp -= p.xpToNext;
            p.level++;
            p.xpToNext = Math.round(p.xpToNext * CONFIG.XP_LEVEL_GROWTH);
            p.maxHp += 15;
            p.hp = p.maxHp;
            try { audio.playLevelUp(); } catch (e) {}
            Particles.showFloatingText(state, `LEVEL UP! Lv.${p.level}`, p.x, p.y - 50, '#facc15');
            this.refreshHUD(state);
        }
        this.refreshHUD(state);
    },

    // Pull-velocity channel: fish yanks, knockbacks and dash all push
    // THROUGH here (px/s over time) instead of teleporting position.
    // Capped so simultaneous hits can't stack into orbit.
    addPull(state, vx, vy, dur) {
        try {
            const p = state.player;
            if (!p || p.isDead) return;
            p.pullVx = (p.pullVx || 0) + (vx || 0);
            p.pullVy = (p.pullVy || 0) + (vy || 0);
            const m = Math.hypot(p.pullVx, p.pullVy);
            const MAXV = 950;
            if (m > MAXV) { p.pullVx *= MAXV / m; p.pullVy *= MAXV / m; }
            p.pullT = Math.max(p.pullT || 0, dur || 0.25);
        } catch (e) {}
    },

    // Dash (Q): short burst + i-frames for dodging. Direction = current
    // move input (keys / joystick), else facing. Blocked while casting,
    // frozen, sailing or dead — same gates as walking.
    DASH_CD: 2.5,
    DASH_TIME: 0.16,
    DASH_SPEED: 680,
    DASH_IFRAMES: 0.35,

    tryDash(state) {
        try {
            const p = state.player;
            if (!p || p.isDead || (p.hp || 0) <= 0) return false;
            if (state.paused) return false;
            if ((p.dashCd || 0) > 0) return false;
            if (typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil) return false;
            try {
                if (typeof WorldSystem !== 'undefined' && WorldSystem.boatRiding && WorldSystem.boatRiding(state)) return false;
            } catch (e) {}
            if (state.fishing && state.fishing.mode === 'CASTING') return false;
            let dx = 0, dy = 0;
            try {
                const k = state.keys || {};
                if (k['w'] || k['arrowup']) dy -= 1;
                if (k['s'] || k['arrowdown']) dy += 1;
                if (k['a'] || k['arrowleft']) dx -= 1;
                if (k['d'] || k['arrowright']) dx += 1;
                if (dx === 0 && dy === 0 && typeof TouchControls !== 'undefined' && TouchControls.active) {
                    dx = TouchControls.joy.dx || 0;
                    dy = TouchControls.joy.dy || 0;
                }
            } catch (e) {}
            if (dx === 0 && dy === 0) dx = (p.facing && p.facing < 0) ? -1 : 1;
            const l = Math.hypot(dx, dy) || 1;
            // Dash overrides the channel (a fresh dodge, not a stack).
            p.pullVx = (dx / l) * this.DASH_SPEED;
            p.pullVy = (dy / l) * this.DASH_SPEED;
            p.pullT = this.DASH_TIME;
            p.dashT = this.DASH_TIME;
            p.iframes = Math.max(p.iframes || 0, this.DASH_IFRAMES);
            p.dashCd = this.DASH_CD;
            try { audio.playWhoosh(); } catch (e) {}
            try {
                Particles.spawnParticles(state, p.x, p.y, '#67e8f9', 10, { size: 4 });
            } catch (e) {}
            return true;
        } catch (e) { return false; }
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
        p.totalDeaths = (p.totalDeaths || 0) + 1;
        // Hydra soldiers are bound to the fight's momentum, not the map:
        // they scatter the moment you fall (regular jumpers keep their
        // revenge/flee script in updateJumpingFish instead).
        try {
            const gone = (state.enemies || []).filter(e => e && e.enemyType === 'hydraSoldier');
            if (gone.length) {
                state.enemies = (state.enemies || []).filter(e => !e || e.enemyType !== 'hydraSoldier');
                if (typeof Particles !== 'undefined') {
                    Particles.showFloatingText(state, 'The hydra\'s soldiers scatter...', p.x, p.y - 60, '#94a3b8');
                }
            }
        } catch (e) {}
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
        // (Hooked bosses — hydra circling your corpse — count the same.)
        let inBossFight = false;
        try {
            inBossFight = (typeof Ritual !== 'undefined' && Ritual.bossFightActive)
                ? Ritual.bossFightActive(state) : false;
        } catch (e) {}
        let hookedBoss = false;
        try {
            const hf = state.fishing && state.fishing.hookedFish;
            hookedBoss = !!(hf && hf.species && (hf.species.isBoss || hf.species.rarity === 'boss'));
        } catch (e) {}
        if (inBossFight) {
            state.bossDeaths = (state.bossDeaths || 0) + 1;
            if (state.bossDeaths >= 10) {
                this.fleeBoss(state);
            }
        } else if (hookedBoss) {
            state.bossDeaths = (state.bossDeaths || 0) + 1;
            if (state.bossDeaths >= 10) {
                state.bossDeaths = 0;
                try {
                    if (typeof Fishing !== 'undefined') Fishing.escapeFish(state, 'THE BOSS TIRES OF WAITING...');
                } catch (e) {}
                try {
                    if (typeof UI !== 'undefined') UI.updateStatusBanner('Ten deaths. The boss spurns you and leaves. Train, gear up, try again.', 'Outmatched', 'rose');
                } catch (e) {}
            }
        } else {
            state.bossDeaths = 0;
        }

        // Normal death drops your current fight — but NEVER a boss fight
        if (!inBossFight && !hookedBoss && state.fishing) {
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
            ['shop-modal', 'casino-modal', 'index-modal', 'npc-modal', 'radar-modal'].forEach(id => {
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
        const cause = wasBurning ? T('death_burned') : T('death_slain');
        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
        set('death-cause', cause);
        const chances = 10 - (state.bossDeaths || 0);
        set('death-stats', (state.bossDeaths > 0)
            ? `Boss fight — ${chances} ${chances === 1 ? 'chance' : 'chances'} left before it leaves · Penalty −${lost}c`
            : `Lv.${p.level} · Bucket kept (${(p.bucket || []).length} fish) · Penalty −${lost}c`);
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        // Dying on an isle offers the island dock as respawn (stays on the
        // isle). Island spawn set = NO free teleport to Marlin's camp:
        // sail home like everyone else (or abandon via menu).
        const isleSpawn = (p.onIsland && p.islandSpawn &&
            typeof p.islandSpawn.x === 'number') ? p.islandSpawn : null;
        const campBtn = document.getElementById('btn-respawn-camp');
        if (campBtn) campBtn.style.display = isleSpawn ? 'none' : '';
        const beachBtn = document.getElementById('btn-respawn-beach');
        if (isleSpawn) {
            if (beachBtn) beachBtn.innerHTML = '<i class="fa-solid fa-anchor mr-2"></i> ' + T('death_isle');
            on('btn-respawn-beach', () => this.respawnAt(state, isleSpawn.x, isleSpawn.y, 'Island Dock', false, true));
        } else {
            if (beachBtn) beachBtn.innerHTML = '<i class="fa-solid fa-heart-pulse mr-2"></i> ' + T('death_beach');
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
            // The sea belongs to the angler again: lift any boss curse
            // (void black / hydra green) and let forced storms pass soon.
            try {
                if (typeof Ritual !== 'undefined') {
                    if (Ritual.clearVoidBlackSea) Ritual.clearVoidBlackSea(state);
                    if (Ritual.clearHydraSea) Ritual.clearHydraSea(state);
                    if (Ritual.unwindBossStorm) Ritual.unwindBossStorm(state);
                }
            } catch (e) {}
            try { audio.playRoar(); } catch (e) {}
            Particles.showFloatingText(state, '💀 "YOU ARE NOT STRONG ENOUGH TO BEAT ME."', bx, by, '#ef4444');
            try {
                if (typeof Ritual !== 'undefined' && Ritual.noteBossEnded) {
                    Ritual.noteBossEnded(state, 'Boss fled', true);
                }
            } catch (e2) {}
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
        // Fresh body, fresh fight: drop boss debuffs (tether/drain).
        p.tether = null;
        p.voidDrain = null;
        try { document.getElementById('tension-hud').classList.add('hidden'); } catch (e) {}
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