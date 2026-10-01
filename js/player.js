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

        p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
        p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);

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
        if (iconEl) iconEl.innerHTML = `<i class="fa-solid ${w.icon}"></i>`;
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
        // Death stamp: die() restores HP instantly, so enemies can never
        // observe "hp <= 0" afterwards — they watch this counter instead.
        try { state._deathSeq = (state._deathSeq || 0) + 1; } catch (e) {}
        p.hp = p.maxHp;
        p.x = 220;
        p.y = 300;

        p.stunTimer = 0;
        p.slowTimer = 0;
        p.burnTimer = 0;
        p.burnTick = 0;

        try { audio.stopReelLoop(); } catch (e) {}

        if (state.fishing) {
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

        state.monstersOnLand = [];

        p.coins = Math.max(0, p.coins - 50);
        this.refreshHUD(state);

        try { audio.playFishDeath(); } catch (e) {}

        if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
            UI.updateStatusBanner('You fainted! Returned to safety.', 'Defeat', 'rose');
        }

        Particles.showFloatingText(state, "Respawned! Lost 50 coins.", 220, 260, '#f87171');
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