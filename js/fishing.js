const Fishing = {
    onSpaceDown(state) {
        if (!state.player || state.player.isDead || state.player.hp <= 0) return;
        // No casting during the boss-fight countdown.
        if (typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil) return;
        // No casting mid ferry ride.
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.boatRiding && WorldSystem.boatRiding(state)) return;
        } catch (e) {}

        const p = state.player;
        const distToWater = state.waterBoundaryX - p.x;
        const f = state.fishing;

        // The Stormcaller's storm scatters every fish — rods are useless
        // until the miniboss dies.
        try {
            const storm = (state.enemies || []).some(e => e && e.isBoss && e.enemyType === 'seagull' && (e.hp || 0) > 0);
            if (storm) {
                Particles.showFloatingText(state, "Can't fish during the storm! Kill STORMCALLER!", p.x, p.y - 30, '#f87171');
                return;
            }
        } catch (e) {}

        if (f.mode === 'IDLE') {
            // 1.2.1: the pier deck hangs over the sea and isles have
            // their own lakes + surrounding sea — all legal casting spots.
            let onPier = false, onIsle = false;
            try {
                if (typeof WorldSystem !== 'undefined') {
                    onPier = WorldSystem.onBridge(state, p.x, p.y);
                    onIsle = !!WorldSystem.islandOf(state);
                }
            } catch (e) {}
            if (onIsle) {
                // Isle sand + both piers are all legal casting spots —
                // collision already guarantees you stand somewhere sane.
            } else if (onPier) {
                // casting from the pier: always fine (deck is over water)
            } else if (distToWater > 160 || distToWater < -20) {
                Particles.showFloatingText(state, "Move closer to the shore!", p.x, p.y - 30, '#f87171');
                return;
            }
            if (p.bucket && p.bucket.length >= p.bucketCapacity) {
                Particles.showFloatingText(state, "Bucket Full! Sell in shop.", p.x, p.y - 30, '#f87171');
                return;
            }
            f.mode = 'CASTING';
            f.castPower = 0;
            f.castDir = 1;
        } else if (f.mode === 'WAITING_BITES') {
            // Pull the bobber back before anything bites — the hook never
            // fired, so no bait is eaten (bait is consumed in triggerBite).
            this.retakeBobber(state);
        }
    },

    // SPACE while waiting: reel the bobber home, keep your bait.
    retakeBobber(state) {
        const f = state.fishing;
        const p = state.player;
        if (!f || f.mode !== 'WAITING_BITES') return false;
        try {
            if (typeof Particles !== 'undefined') {
                Particles.spawnWaterSplashes(state, f.bobber.x, f.bobber.y, 4);
            }
        } catch (e) {}
        try { audio.playReelTick(); } catch (e) {}
        try { audio.playWaterTouch(); } catch (e) {}
        f.mode = 'IDLE';
        f.bobber.x = p.x; f.bobber.y = p.y;
        f.castPower = 0;
        f.biteTimer = 0;
        f.waitingTime = 0;
        f.castFrom = null;
        f.castTo = null;
        f.castT = 0;
        Particles.showFloatingText(state, 'Bobber back — bait kept!', p.x, p.y - 40, '#7dd3fc');
        UI.updateStatusBanner('Stand near water & Hold <span class="key">SPACE</span> to Cast!', 'Step 1', 'amber');
        return true;
    },

    onSpaceUp(state) {
        if (!state.player || state.player.isDead || state.player.hp <= 0) return;
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.boatRiding && WorldSystem.boatRiding(state)) return;
        } catch (e) {}

        const f = state.fishing;
        if (f.mode === 'CASTING') {
            const p = state.player;
            // Aim: live mouse direction in world space on every map
            // (touch + gamepad feed the same mouse pipeline). Falls back
            // to the body facing on a fresh page / keyboard-only play.
            let dx = 0, dy = 0, aimed = false;
            try {
                const m = state.mouse;
                if (m && m._moved) {
                    const mx = (m.worldX || 0) - p.x, my = (m.worldY || 0) - p.y;
                    const ml = Math.hypot(mx, my);
                    if (ml > 8) { dx = mx / ml; dy = my / ml; aimed = true; }
                }
            } catch (e) {}
            if (!aimed) { dx = (p.facing && p.facing < 0) ? -1 : 1; dy = 0; }
            // Release-point validation: the throw must land in open water.
            // (Movement is locked while charging, but knockback or edge cases
            // must never produce a land bobber that fishes from the sand.)
            const castDist = CONFIG.CAST_MIN_DIST + (f.castPower / 100) * (CONFIG.CAST_MAX_DIST - CONFIG.CAST_MIN_DIST);
            // Small natural spread so full-power hurls don't laser-stack.
            const spread = 14;
            let lx = p.x + dx * castDist - dy * Utils.rand(-spread, spread);
            let ly = p.y + dy * castDist + dx * Utils.rand(-spread, spread);
            // Walk the point back toward the rod until it sits in real
            // water — beach, pier deck, isle lake and open sea all share
            // one rule: land = sand/deck, sea = water (see isWaterAt).
            let waterOk = false;
            try {
                if (typeof WorldSystem !== 'undefined' && WorldSystem.isWaterAt) {
                    for (let k = 0; k < 32; k++) {
                        if (WorldSystem.isWaterAt(state, lx, ly)) { waterOk = true; break; }
                        lx -= dx * 15; ly -= dy * 15;
                        if (Math.hypot(lx - p.x, ly - p.y) < 50) break;
                    }
                    waterOk = waterOk && WorldSystem.isWaterAt(state, lx, ly);
                } else {
                    const WB = CONFIG.WORLD;
                    waterOk = lx > state.waterBoundaryX + 30 && ly > WB.MIN_Y + 30 && ly < WB.MAX_Y - 30;
                }
            } catch (e) { waterOk = false; }
            if (!waterOk) {
                f.mode = 'IDLE';
                f.castPower = 0;
                f.castDir = 1;
                Particles.showFloatingText(state, 'No water that way — aim at the sea!', state.player.x, state.player.y - 30, '#f87171');
                try { audio.playError(); } catch (e) {}
                return;
            }
            try { audio.playThrow(); } catch (e) {}
            // THROW: the bobber flies from the rod tip to the target along
            // an arc instead of teleporting there (see update CAST_FLY).
            f.castFrom = { x: state.player.x, y: state.player.y };
            f.castTo = { x: lx, y: ly };
            const flyDist = Math.hypot(f.castTo.x - f.castFrom.x, f.castTo.y - f.castFrom.y) || 1;
            f.mode = 'CAST_FLY';
            f.castT = 0;
            f.castDur = Utils.clamp(flyDist / 600, 0.35, 0.8);
            f.bobber.x = f.castFrom.x;
            f.bobber.y = f.castFrom.y;
            if (typeof Particles !== 'undefined') {
                Particles.spawnParticles(state, state.player.x, state.player.y, '#fef3c7', 4, { size: 2 });
            }
            if (typeof Tutorial !== 'undefined') Tutorial.onCast(state);
        }
    },

    // Bobber touchdown: ripple + banner + bite countdown starts here
    // (moved out of onSpaceUp so the throw animation plays first).
    landBobber(state) {
        const f = state.fishing;
        f.mode = 'WAITING_BITES';
        f.bobber.x = f.castTo.x;
        f.bobber.y = f.castTo.y;
        f.castFrom = null;
        f.castTo = null;
        f.waitingTime = 0;
        const rod = state.player.equippedRod || {};
        // Bait bonus: +5% catch rate ~ shorter wait handled via biteTimer scale
        let biteMult = rod.biteTimeMult || 1.0;
        if (state.player.baitTimer > 0) biteMult *= 0.8;
        // Equipped bait (per-hook stock) multiplies on top
        try {
            const hb = (typeof Ritual !== 'undefined' && Ritual.equippedBait) ? Ritual.equippedBait(state) : null;
            if (hb && hb.biteMult) biteMult *= hb.biteMult;
        } catch (e) {}
        f.biteTimer = Utils.rand(CONFIG.BITE_MIN_DELAY, CONFIG.BITE_MAX_DELAY) * biteMult;
        // 1.1.5 WORLD: weather + water tier shorten the wait when
        // conditions are right (deep water and islands bite faster).
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.biteMult) {
                f.biteTimer *= WorldSystem.biteMult(state) || 1;
            }
        } catch (e) {}
        try { audio.playWaterTouch(); } catch (e) {}
        if (typeof Particles !== 'undefined') {
            Particles.spawnWaterSplashes(state, f.bobber.x, f.bobber.y, 8);
        }
        UI.updateStatusBanner('Waiting for a bite... (tap <span class="key">SPACE</span> to pull back, keeps bait)', 'Step 2');
    },

    escapeFish(state, message = "FISH ESCAPED!") {
        const f = state.fishing;
        const p = state.player;

        f.mode = 'IDLE';
        f.hookedFish = null;
        f.lineTension = 0;
        f.castPower = 0;
        f.biteTimer = 0;
        f.waitingTime = 0;
        f.castFrom = null;
        f.castTo = null;
        f.castT = 0;

        try { audio.stopReelLoop(); } catch (e) {}

        const tensionHud = document.getElementById('tension-hud');
        if (tensionHud) tensionHud.classList.add('hidden');

        const dragHud = document.getElementById('drag-hud');
        if (dragHud) dragHud.classList.add('hidden');

        if (p && message) {
            Particles.showFloatingText(state, message, p.x, p.y - 30, '#f87171');
        }
    },

    triggerBite(state) {
        if (!state.player || state.player.isDead || state.player.hp <= 0) {
            this.escapeFish(state, "Player died!");
            return;
        }

        try { audio.playSplash(); } catch (e) {}
        const f = state.fishing;
        f.mode = 'HOOKED';
        f.lineTension = 15;
        if (typeof Tutorial !== 'undefined') Tutorial.onHook(state);
        state.screenShake = 6;

        const rod = state.player.equippedRod || { reelPower: 80 };
        // Snapshot the hook bait ONCE: the roll, the hydra check and the
        // shiny roll must all see the same bait, because consumeHookBait
        // below may eat the last one (equippedBait would then read null).
        let hookBait = null;
        try {
            hookBait = (typeof Ritual !== 'undefined' && Ritual.equippedBait) ? Ritual.equippedBait(state) : null;
        } catch (e) {}
        const hookBaitLuck = (hookBait && hookBait.luckBonus) || 0;
        // Hydra Lure on the hook: 30% of bites grab the STORMLORD HYDRA.
        // Every hook eats 1 equipped bait (see consumeHookBait below).
        let rolled = null;
        try {
            if (hookBait && hookBait.id === 'lure_hydra' && Math.random() < 0.30) {
                const hydra = (typeof FISH_SPECIES !== 'undefined') && FISH_SPECIES.find(s => s.id === 'stormlord_hydra');
                if (hydra) {
                    rolled = hydra;
                    Particles.showFloatingText(state, '🌀 THE HYDRA TAKES THE LURE!', f.bobber.x, f.bobber.y - 60, '#10b981');
                    try { audio.playRoar(); } catch (e) {}
                }
            }
        } catch (e) {}
        if (!rolled) {
            rolled = (typeof rollFishSpecies === 'function')
                ? rollFishSpecies(state)
                : { name: 'Common Bass', rarity: 'common', maxHp: 100, staminaMax: 100, speed: 100, color: '#38bdf8', value: 10 };
        }
        try {
            if (typeof Ritual !== 'undefined' && Ritual.consumeHookBait) Ritual.consumeHookBait(state);
        } catch (e) {}
        // Per-catch instance: unique size, dot pattern, possible shiny.
        // Cloned so shiny/value mods never leak into the global species.
        // Rod luck + equipped-bait luck BOTH feed the shiny roll (bait used
        // to be silently dropped here — only the rarity weights got it).
        // Uses the pre-consume snapshot so the LAST bait still counts.
        const luck = (rod && typeof rod.luck === 'number') ? rod.luck : 0;
        const species = (typeof makeCatchInstance === 'function')
            ? makeCatchInstance(rolled, luck + hookBaitLuck) : Object.assign({}, rolled);
        if (species.shiny) {
            Particles.showFloatingText(state, '✨ SHINY! Worth 3x! ✨', f.bobber.x, f.bobber.y - 60, '#fde047');
            try { audio.playLevelUp(); } catch (e) {}
        }
        const maxHp = species.maxHp || 100;
        const staminaMax = species.staminaMax || 100;

        const seaEscapeLimits = {
            common:    40.0,
            rare:      50.0,
            epic:      65.0,
            legendary: 85.0,
            mythic:    110.0,
            boss:      160.0
        };

        const rodBonus = 0.85 + (rod.reelPower / 280) * 1.05;
        const baseLimit = seaEscapeLimits[species.rarity] || 50.0;
        const escapeLimit = baseLimit * rodBonus;

        f.hookedFish = {
            species,
            x: f.bobber.x, y: f.bobber.y,
            vx: 0, vy: 0,
            hp: maxHp, maxHp: maxHp,
            stamina: staminaMax, staminaMax: staminaMax,
            targetAngle: Math.random() * Math.PI * 2,
            isRaging: false, rageTimer: 0,
            skillCooldown: 1.5 + Math.random() * 2,
            isInflated: false, inflateTimer: 0,
            dragState: 'IN_WATER',
            beachedTimer: 0,
            rotation: 0,
            isDead: false,
            seaTimer: 0,
            seaEscapeLimit: escapeLimit,
            warnedSeaEscape: false,
            warnedSeaEscape2: false,
            _reelTickTimer: 0
        };

        const tensionHud = document.getElementById('tension-hud');
        if (tensionHud) tensionHud.classList.remove('hidden');

        try {
            const rarity = species.rarity || 'common';
            if (rarity === 'legendary' || rarity === 'mythic' || rarity === 'boss' || species.isBoss) audio.playRoar();
            else audio.playFishScreech();
        } catch (e) {}

        const rc = (CONFIG.RARITY_COLORS && CONFIG.RARITY_COLORS[species.rarity]) || '#cbd5e1';
        UI.updateStatusBanner(
            `<span style="color:${rc};font-weight:900">${species.rarity.toUpperCase()}</span> — ${species.name} hooked! Drag it to land quickly!`,
            'Step 3', 'amber'
        );

        // BOSSES are never reeled: the line snaps on the spot and the
        // boss stays under the sea, swimming and shooting back. Guns out.
        if (species.isBoss && f.hookedFish) {
            f.hookedFish.lineBroken = true;
            f.lineTension = 0;
            try { audio.stopReelLoop(); } catch (e) {}
            try { audio.playSnap(); } catch (e) {}
            state.screenShake = 14;
            Particles.showFloatingText(state, '💥 LINE SNAPPED!', f.bobber.x, f.bobber.y - 60, '#ef4444');
            // Cinematic arrival for the hooked horror
            try {
                if (typeof Ritual !== 'undefined' && Ritual.bossIntro) Ritual.bossIntro(state, species, f.bobber.x, f.bobber.y, f.hookedFish);
            } catch (e) {}
            UI.updateStatusBanner(
                `<b>${species.name}</b> is too strong — LINE SNAPPED! It circles below. <b>Shoot it!</b>`,
                'Boss', 'rose'
            );
        }

        // Void-tainted hook: warn + mark the shard carrier
        if (species.mutation === 'void' && f.hookedFish) {
            Particles.showFloatingText(state, '🌀 VOID-TAINTED! Kill it for its shard...', f.bobber.x, f.bobber.y - 80, '#c084fc');
        }
    },

    killHookedFish(state) {
        const f = state.fishing;
        const fish = f.hookedFish;
        if (!fish || fish.isDead) return;

        fish.isDead = true;
        fish.hp = 0;
        fish.stamina = 0;
        fish.isRaging = false;

        try { audio.stopReelLoop(); } catch (e) {}
        try {
            const rarity = fish.species.rarity;
            if (rarity === 'legendary' || rarity === 'mythic') audio.playBossKilled();
            else audio.playFishDeath();
        } catch (e) {}

        state.screenShake = 8;
        Particles.spawnBloodImpact(state, fish.x, fish.y, '#ef4444', 20);
        Particles.spawnWaterSplashes(state, fish.x, fish.y, 10);
        Particles.showFloatingText(state, "FISH KILLED!", fish.x, fish.y - 40, '#ef4444');

        // Boss kill counts for the index + trophy + achievement even when
        // gunned down at sea — the loot still beaches into your bucket.
        if (fish.species.isBoss) {
            state.bossDeaths = 0; // won — chances reset
            try {
                if (!Array.isArray(state.player.slainBosses)) state.player.slainBosses = [];
                if (!state.player.slainBosses.includes(fish.species.id)) state.player.slainBosses.push(fish.species.id);
                if (typeof Achievements !== 'undefined') Achievements.checkEnemyKill(state, 'boss');
                if (typeof Ritual !== 'undefined' && Ritual.awardItem && typeof TROPHY_OF !== 'undefined' && TROPHY_OF[fish.species.id]) {
                    Ritual.awardItem(state, TROPHY_OF[fish.species.id], fish.x, fish.y, 'boss tribute');
                }
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            } catch (e) {}
            Particles.showFloatingText(state, `👑 ${fish.species.name} SLAIN!`, fish.x, fish.y - 70, '#facc15');
            UI.updateStatusBanner(`${fish.species.name} has fallen! Reel it ashore!`, 'Victory', 'emerald');
        }

        const dx = state.player.x - fish.x;
        const dy = state.player.y - fish.y;
        const dist = Math.hypot(dx, dy) || 1;
        const killPullSpeed = 900;
        fish.vx = (dx / dist) * killPullSpeed;
        fish.vy = (dy / dist) * killPullSpeed;

        fish.dragState = 'BEACHING';
        UI.updateStatusBanner('Dead fish drifting to shore! Keep reeling to speed it up.', 'Dead', 'rose');
    },

    update(state, delta) {
        const f = state.fishing;

        // Host owns enemy skill shots — clients only take the hits (intake)
        const isMPClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
        if (typeof Projectiles !== 'undefined' && Projectiles.update && !isMPClient) {
            Projectiles.update(state, delta);
        }

        if (!state.player || state.player.isDead || state.player.hp <= 0) {
            if (f.mode !== 'IDLE') {
                this.escapeFish(state, "Player died!");
            }
            return;
        }

        if (f.mode === 'CASTING') {
            f.castPower += f.castDir * CONFIG.CAST_CHARGE_RATE * delta;
            if (f.castPower >= 100) { f.castPower = 100; f.castDir = -1; }
            if (f.castPower <= 0) { f.castPower = 0; f.castDir = 1; }
            return;
        }

        if (f.mode === 'CAST_FLY') {
            f.castT = (f.castT || 0) + delta;
            const t = Math.min(1, f.castT / (f.castDur || 0.5));
            f.bobber.x = f.castFrom.x + (f.castTo.x - f.castFrom.x) * t;
            f.bobber.y = f.castFrom.y + (f.castTo.y - f.castFrom.y) * t;
            if (Math.random() < 0.35 && typeof Particles !== 'undefined') {
                Particles.spawnWaterSplashes(state, f.bobber.x, f.bobber.y, 1);
            }
            if (t >= 1) this.landBobber(state);
            return;
        }

        if (f.mode === 'WAITING_BITES') {
            f.waitingTime += delta * 1000;
            if (f.waitingTime >= f.biteTimer) this.triggerBite(state);
            return;
        }

        if (f.mode === 'HOOKED' && f.hookedFish) {
            this.updateHooked(state, delta);
        }
    },

    updateHooked(state, delta) {
        const f = state.fishing;
        const p = state.player;
        const fish = f.hookedFish;

        if (!fish) return;

        const rod = p.equippedRod || { reelPower: 80, tensionMax: 100 };
        const B = CONFIG.WORLD;

        // Reel loop management + reel tick (no line, no reeling for bosses)
        const isReelingNow = !!state.keys[' '] && !fish.lineBroken;
        if (isReelingNow && !fish.isDead && fish.dragState !== 'BEACHED') {
            try { audio.startReelLoop(); } catch (e) {}
            fish._reelTickTimer = (fish._reelTickTimer || 0) - delta;
            if (fish._reelTickTimer <= 0) {
                fish._reelTickTimer = 0.12;
                try { audio.playReelTick(); } catch (e) {}
            }
        } else {
            try { audio.stopReelLoop(); } catch (e) {}
        }

        // High tension warning sound
        if (rod.tensionMax && f.lineTension / rod.tensionMax > 0.85 && !fish.isDead) {
            if (Math.random() < 0.08) {
                try { audio.playTensionStress(); } catch (e) {}
            }
        }

        if (p.isDead || p.hp <= 0) {
            try { audio.playSnap(); } catch (e) {}
            state.screenShake = 10;
            this.escapeFish(state, "YOU DIED - FISH ESCAPED!");
            UI.updateStatusBanner('You were slain! The fish escaped back into the depths.', 'Fainted', 'rose');
            return;
        }

        const isReeling = !!state.keys[' '];
        const inWater = !fish.isDead && fish.dragState === 'IN_WATER';
        const isFighting = inWater && (isReeling || fish.hp < fish.maxHp);

        if (inWater && !isFighting) {
            fish.seaTimer += delta;

            const pct = fish.seaTimer / fish.seaEscapeLimit;
            if (pct >= 0.60 && !fish.warnedSeaEscape) {
                fish.warnedSeaEscape = true;
                Particles.showFloatingText(state,
                    "PULL TO SHORE! UNHOOKING...",
                    fish.x, fish.y - 50, '#f97316');
                state.screenShake = 4;
                try { audio.playTensionStress(); } catch (e) {}
            }
            if (pct >= 0.85 && !fish.warnedSeaEscape2) {
                fish.warnedSeaEscape2 = true;
                Particles.showFloatingText(state,
                    "!!! HOOK ABOUT TO TEAR !!!",
                    fish.x, fish.y - 55, '#ef4444');
                state.screenShake = 8;
                try { audio.playTensionStress(); } catch (e) {}
            }

            if (fish.seaTimer >= fish.seaEscapeLimit) {
                // Bosses NEVER escape — they fight to the death or get reeled
                if (fish.species.isBoss) {
                    fish.seaTimer = 0;
                    fish.warnedSeaEscape = false;
                    fish.warnedSeaEscape2 = false;
                    Particles.showFloatingText(state,
                        `${fish.species.name.toUpperCase()} REFUSES TO FLEE!`,
                        fish.x, fish.y - 50, '#ef4444');
                } else {
                try { audio.playSnap(); } catch (e) {}
                state.screenShake = 10;
                this.escapeFish(state, "FISH SWAM AWAY! (DRAG TO LAND)");
                UI.updateStatusBanner(
                    'The fish tore off the hook! Drag fish to land before fighting.',
                    'Escaped', 'rose');
                return;
                }
            }
        } else {
            let decayRate = 2.0;
            if (isReeling) decayRate = 3.0;
            if (fish.isDead) decayRate = 5.0;
            fish.seaTimer = Math.max(0, fish.seaTimer - delta * decayRate);

            if (fish.seaTimer < fish.seaEscapeLimit * 0.4) {
                fish.warnedSeaEscape = false;
                fish.warnedSeaEscape2 = false;
            }
        }

        // Intro dormancy: a freshly hooked boss hangs still and silent
        // (no skills, no swimming) until its cinematic releases it.
        const dormant = !fish.isDead && fish.dormantUntil && state.time < fish.dormantUntil;
        if (!fish.isDead) {
            fish.skillCooldown -= delta;
            // Stun/freeze from guns pauses fish skills & movement in water too
            if (fish.stunTimer > 0) fish.stunTimer -= delta;
            if (fish.freezeTimer > 0) fish.freezeTimer -= delta;
            // Burn / poison DoT in water (gun effects fixed)
            if (fish.burnTimer > 0) {
                fish.burnTimer -= delta;
                const dps = fish.burnDps || 12;
                fish.hp -= dps * delta;
                fish.stamina -= dps * 0.5 * delta;
                if (Math.random() < 0.2) Particles.spawnParticles(state, fish.x, fish.y, '#f97316', 1, { size: 3 });
            }
            if (fish.poisonTimer > 0) {
                fish.poisonTimer -= delta;
                const dps = fish.poisonDps || 10;
                fish.hp -= dps * delta;
                if (Math.random() < 0.1) Particles.showFloatingText(state, `-${Math.round(dps * delta)}`, fish.x, fish.y - 25, '#84cc16');
            }
            if (fish.slowTimer > 0) fish.slowTimer -= delta;
            if (fish.hp <= 0) { this.killHookedFish(state); return; }
            if (!dormant && fish.skillCooldown <= 0) {
                const cooldowns = {
                    common: 4.0,
                    rare: 2.8,
                    epic: 2.0,
                    legendary: 1.4,
                    mythic: 0.9,
                    boss: 1.6
                };
                const rarity = (fish.species && fish.species.rarity) ? fish.species.rarity : 'common';
                fish.skillCooldown = cooldowns[rarity] || 3.0;
                this.triggerSkill(state, fish);
            }
            fish.rageTimer -= delta;
            if (fish.rageTimer <= 0) {
                fish.isRaging = Math.random() < 0.45;
                fish.rageTimer = Utils.rand(1, 3);
                if (fish.isRaging) {
                    try { audio.playFishScreech(); } catch (e) {}
                }
            }
        }

        // BROKEN LINE (boss): no reel, no tension, no escape, no beaching.
        // The boss circles you under the sea and keeps firing its skills —
        // kill it with guns. Loot washes ashore on the kill.
        if (fish.lineBroken && !fish.isDead) {
            // Weakened at 30%: your hook snags it — REEL IT IN like a
            // normal catch (drag to beach -> bucket -> sellable).
            if (fish.hp / (fish.maxHp || 1) <= 0.30) {
                fish.lineBroken = false;
                try { audio.playLevelUp(); } catch (e) {}
                state.screenShake = 10;
                Particles.showFloatingText(state, '🎣 WEAKENED — HOOK SNAGGED! REEL!', fish.x, fish.y - 60, '#facc15');
                UI.updateStatusBanner(
                    `The ${fish.species.name} is exhausted! <b>Hold SPACE to reel it in!</b>`,
                    'Weaken', 'emerald'
                );
            } else {
            // SEA PHASE: the boss circles you under the sea and keeps
            // firing. HYDRA hunts: faster weave orbit, lunges, heavy wake.
            // (Dormant arrivals hang motionless until the intro releases.)
            if (!dormant) {
            const isHydraSea = fish.species && fish.species.id === 'stormlord_hydra';
            const ang = (fish.orbitAngle = (fish.orbitAngle || Math.random() * Math.PI * 2) + delta * (isHydraSea ? 0.95 : 0.55));
            const R = isHydraSea ? 360 : 300;
            const weave = isHydraSea ? Math.sin(state.time * 2.2) * 90 : 0;
            // Encounter-local bounds: isles use their own room, never the
            // mainland surf line (which used to fling isle bosses ashore).
            let fb = null;
            try {
                fb = (typeof WorldSystem !== 'undefined' && WorldSystem.fishBounds)
                    ? WorldSystem.fishBounds(state) : null;
            } catch (e) {}
            const tx = fb ? Utils.clamp(p.x + Math.cos(ang) * R, fb.x0, fb.x1)
                : Utils.clamp(p.x + Math.cos(ang) * R, state.waterBoundaryX + 30, B.MAX_X - 60);
            const ty = fb ? Utils.clamp(p.y + Math.sin(ang) * R * 0.7 + weave, fb.y0, fb.y1)
                : Utils.clamp(p.y + Math.sin(ang) * R * 0.7 + weave, B.MIN_Y + 40, B.MAX_Y - 40);
            const swimSpd = ((fish.species && fish.species.speed) || 100) * (isHydraSea ? 3.4 : 2.4)
                * (fish.freezeTimer > 0 ? 0.25 : 1.0)
                * (fish.stunTimer > 0 ? 0.0 : 1.0)
                * (fish.slowTimer > 0 ? (fish.slowMult || 0.5) : 1.0);
            fish.vx += Utils.clamp(tx - fish.x, -1, 1) * swimSpd * delta;
            fish.vy += Utils.clamp(ty - fish.y, -1, 1) * swimSpd * delta;
            fish.x += fish.vx * delta;
            fish.y += fish.vy * delta;
            const waterFriction = Math.pow(CONFIG.DRAG_WATER_RESISTANCE, delta * 60);
            fish.vx *= waterFriction;
            fish.vy *= waterFriction;
            // Stay under the sea (encounter-local water)
            if (fb) {
                fish.x = Utils.clamp(fish.x, fb.x0, fb.x1);
                fish.y = Utils.clamp(fish.y, fb.y0, fb.y1);
            } else {
            fish.x = Utils.clamp(fish.x, state.waterBoundaryX + 15, B.MAX_X - 30);
            fish.y = Utils.clamp(fish.y, B.MIN_Y + 30, B.MAX_Y - 30);
            }
            const spd = Math.hypot(fish.vx, fish.vy);
            if (spd > 5) {
                const velAngle = Math.atan2(fish.vy, fish.vx);
                fish.rotation = Utils.smooth(fish.rotation, velAngle + Math.PI, 0.15, delta);
            }
            if (Math.random() < 0.3) Particles.spawnWaterSplashes(state, fish.x, fish.y, 1);
            if (isHydraSea) {
                // Storm wake: crackling trail + head-snap telegraphs
                if (Math.random() < 0.5) Particles.spawnParticles(state, fish.x, fish.y, '#10b981', 2, { size: 4 });
                if (Math.random() < 0.06) {
                    Particles.showFloatingText(state, '🐲 THE NINE HEADS CIRCLE...', fish.x, fish.y - 70, '#6ee7b7');
                    try { audio.playThunder(); } catch (e) {}
                }
            }
            } else {
                // Dormant: bleed off velocity, hang still.
                fish.vx *= 0.9;
                fish.vy *= 0.9;
            }
            f.lineTension = 0;
            UI.updateTensionBar(state);
            return;
            }
        }

        if (fish.dragState === 'IN_WATER' && !fish.isDead) {
            if (!fish._wanderTimer || fish._wanderTimer <= 0) {
                fish._wanderTimer = Utils.rand(0.5, 1.5);
                if (fish.isRaging) {
                    fish.targetAngle = Utils.angle(p.x, p.y, fish.x, fish.y) + Utils.rand(-0.5, 0.5);
                } else {
                    fish.targetAngle = Math.random() * Math.PI * 2;
                }
            }
            fish._wanderTimer -= delta;

            const maxStam = fish.staminaMax || 100;
            const staminaRatio = fish.stamina / maxStam;
            const fishSpeed = (fish.species && fish.species.speed) ? fish.species.speed : 100;
            const swimPower = fishSpeed * (fish.isRaging ? 1.8 : 1.0) * (0.4 + staminaRatio * 0.6)
                * (fish.freezeTimer > 0 ? 0.25 : 1.0)
                * (fish.stunTimer > 0 ? 0.0 : 1.0)
                * (fish.slowTimer > 0 ? (fish.slowMult || 0.5) : 1.0);

            fish.vx += Math.cos(fish.targetAngle) * swimPower * 35 * delta;
            fish.vy += Math.sin(fish.targetAngle) * swimPower * 20 * delta;
        }

        const reeling = state.keys[' '];
        if (reeling && fish.dragState !== 'BEACHED') {
            const dx = p.x - fish.x;
            const dy = p.y - fish.y;
            const dist = Math.hypot(dx, dy) || 1;

            const maxStam = fish.staminaMax || 100;
            const staminaRatio = fish.stamina / maxStam;

            let pullMultiplier;
            if (fish.isDead) {
                pullMultiplier = 8.0;
            } else if (staminaRatio <= 0.01) {
                pullMultiplier = 5.0;
            } else {
                pullMultiplier = 1 + (1 - staminaRatio) * 3.0;
            }

            const reelPower = (rod.reelPower || 80) * (rod.pullMult || 1.0);
            // Beached fish are out of their element: they slide in fast
            // and barely fight the line (otherwise pier/isle drags crawl
            // at ~25px/s while tension climbs and the line snaps first).
            // Piers + isles get the biggest boost: short decks and small
            // sands must still finish the drag.
            let beachedBoost = 2.2;
            try {
                const offMain = (typeof WorldSystem !== 'undefined' &&
                    ((WorldSystem.islandOf && WorldSystem.islandOf(state)) ||
                     (WorldSystem.onBridge && WorldSystem.onBridge(state, p.x, p.y)) ||
                     (WorldSystem.onIslandPier && WorldSystem.onIslandPier(state, p.x, p.y, 60))));
                if (offMain) beachedBoost = 3.2;
            } catch (e) {}
            const pullAccel = reelPower * pullMultiplier * 1.2 * beachedBoost;
            fish.vx += (dx / dist) * pullAccel * delta;
            fish.vy += (dy / dist) * pullAccel * delta;

            if (!fish.isDead) {
                const save = rod.staminaSave || 0;
                fish.stamina -= CONFIG.STAMINA_DRAIN_PER_REEL * (1 - save) * delta;
                const ragePenalty = fish.isRaging ? 2.2 : 1.0;
                let tensionEase = (fish.dragState === 'BEACHING') ? 0.35 : 1.0;
                try {
                    const offMain2 = (typeof WorldSystem !== 'undefined' &&
                        ((WorldSystem.islandOf && WorldSystem.islandOf(state)) ||
                         (WorldSystem.onBridge && WorldSystem.onBridge(state, p.x, p.y))));
                    if (offMain2 && fish.dragState === 'BEACHING') tensionEase = 0.25;
                } catch (e) {}
                f.lineTension += CONFIG.TENSION_PER_REEL * ragePenalty * staminaRatio * tensionEase * delta;
            }

            if (fish.dragState === 'IN_WATER' && Math.random() < 0.5) {
                Particles.spawnWaterSplashes(state, fish.x, fish.y, 1);
            }
            if (fish.dragState === 'BEACHING') {
                Particles.spawnDragTrail(state, fish.x, fish.y);
            }
        } else {
            if (!fish.isDead) {
                f.lineTension -= CONFIG.TENSION_DECAY_RATE * delta;
            } else {
                f.lineTension -= CONFIG.TENSION_DECAY_RATE * 3 * delta;
            }
        }

        // "Land" = mainland surf line, either pier deck, or isle sand /
        // isle pier. (The old surf-line-only check could never beach on
        // piers or isles, so those fish swam away forever.)
        let onLand = false;
        try {
            onLand = (typeof WorldSystem !== 'undefined' && WorldSystem.isBeachAt)
                ? WorldSystem.isBeachAt(state, fish.x, fish.y)
                : fish.x <= state.waterBoundaryX + CONFIG.BEACH_TRIGGER_OFFSET;
        } catch (e) {
            onLand = fish.x <= state.waterBoundaryX + CONFIG.BEACH_TRIGGER_OFFSET;
        }
        if (onLand && fish.dragState === 'IN_WATER') {
            fish.dragState = 'BEACHING';
            fish.beachFrom = Math.hypot(p.x - fish.x, p.y - fish.y) || 1;
            try { audio.playSplash(); } catch (e) {}
            state.screenShake = 5;
            Particles.spawnParticles(state, fish.x, fish.y, '#fef3c7', 14);
            Particles.showFloatingText(state, "BEACHED!", fish.x, fish.y - 40, '#facc15');
            UI.updateStatusBanner("It's on the sand! Keep reeling to finish dragging it in!", 'Step 4', 'amber');
        }

        fish.x += fish.vx * delta;
        fish.y += fish.vy * delta;

        if (fish.dragState === 'BEACHING' || fish.dragState === 'BEACHED') {
            const sandFriction = Math.pow(CONFIG.DRAG_LAND_RESISTANCE, delta * 60);
            fish.vx *= sandFriction;
            fish.vy *= sandFriction;
        } else {
            const waterFriction = Math.pow(CONFIG.DRAG_WATER_RESISTANCE, delta * 60);
            fish.vx *= waterFriction;
            fish.vy *= waterFriction;
        }

        // Encounter-local world clamp (isles have their own room).
        // BEACHING / BEACHED / dead fish MUST be allowed onto land:
        // clamping every hooked fish to the surf line was an invisible
        // wall — nothing dragged ashore could ever cross onto the sand,
        // so beach (and pier/isle) catches were impossible from afar.
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.fishBounds) {
                const fb2 = WorldSystem.fishBounds(state);
                const ashore = fish.dragState === 'BEACHING' || fish.dragState === 'BEACHED' || fish.isDead;
                const x0 = (ashore && !WorldSystem.islandOf(state)) ? B.MIN_X + 30 : fb2.x0;
                fish.x = Utils.clamp(fish.x, x0, fb2.x1);
                fish.y = Utils.clamp(fish.y, fb2.y0, fb2.y1);
            } else {
        fish.x = Utils.clamp(fish.x, B.MIN_X + 30, B.MAX_X - 30);
        fish.y = Utils.clamp(fish.y, B.MIN_Y + 30, B.MAX_Y - 30);
            }
        } catch (e) {
            fish.x = Utils.clamp(fish.x, B.MIN_X + 30, B.MAX_X - 30);
            fish.y = Utils.clamp(fish.y, B.MIN_Y + 30, B.MAX_Y - 30);
        }

        const speed = Math.hypot(fish.vx, fish.vy);
        if (speed > 5) {
            const velAngle = Math.atan2(fish.vy, fish.vx);
            fish.rotation = Utils.smooth(fish.rotation, velAngle + Math.PI, 0.15, delta);
        }

        // ------------------------------------------------------------
        //  BEACHING -> BEACHED transition
        //  Also clamps dead fish inside the player's walkable area
        // ------------------------------------------------------------
        if (fish.dragState === 'BEACHING') {
            const distToP = Math.hypot(p.x - fish.x, p.y - fish.y);
            const dxToShore = fish.x - state.waterBoundaryX;
            // LAND RULE: the fish itself is already on LAND (surf / sand /
            // bridge deck / isle pier) — finish the catch by distance to
            // YOU, never by a mainland-only x check. Decks and small isles
            // use a generous radius so the drag can actually complete.
            let fishOnLand = false;
            let offMain = false;
            try {
                if (typeof WorldSystem !== 'undefined' && WorldSystem.isLandAt) {
                    fishOnLand = !!WorldSystem.isLandAt(state, fish.x, fish.y);
                } else if (typeof WorldSystem !== 'undefined' && WorldSystem.isBeachAt) {
                    fishOnLand = !!WorldSystem.isBeachAt(state, fish.x, fish.y);
                }
                offMain = !!((typeof WorldSystem !== 'undefined' && WorldSystem.islandOf)
                    ? WorldSystem.islandOf(state)
                    : (p.onIsland)) ||
                    !!((typeof WorldSystem !== 'undefined' && WorldSystem.onBridge)
                        ? (WorldSystem.onBridge(state, p.x, p.y) || WorldSystem.onBridge(state, fish.x, fish.y)) : false);
            } catch (e) {}
            const grabR = offMain ? 130 : 70;
            const closeEnough = distToP < grabR || (fishOnLand && distToP < grabR + 60) || (!offMain && dxToShore < -30);

            if (closeEnough || (fish.isDead && (offMain ? distToP < 130 : dxToShore < 0))) {
                fish.dragState = 'BEACHED';
                fish.beachedTimer = 0;

                // If dead, snap inside player's reachable area right away
                if (fish.isDead) {
                    try {
                        if (typeof WorldSystem !== 'undefined' && WorldSystem.lootClamp) {
                            const c = WorldSystem.lootClamp(state, fish.x, fish.y);
                            fish.x = c.x; fish.y = c.y;
                        } else {
                    const minX = B.MIN_X + p.radius + 4;
                    const maxX = state.waterBoundaryX - p.radius - 4;
                    const minY = B.MIN_Y + p.radius + 4;
                    const maxY = B.MAX_Y - p.radius - 4;
                    fish.x = Utils.clamp(fish.x, minX, maxX);
                    fish.y = Utils.clamp(fish.y, minY, maxY);
                        }
                    } catch (e) {}
                }
            }
        }

        // ------------------------------------------------------------
        //  BEACHED: Dead fish magnet toward the player so it can always
        //  be collected, even if it lands past the player's walkable zone.
        // ------------------------------------------------------------
        if (fish.dragState === 'BEACHED') {
            if (fish.isDead) {
                const dxToP = p.x - fish.x;
                const dyToP = p.y - fish.y;
                const distToP = Math.hypot(dxToP, dyToP);

                // Dead fish magnet: bigger on piers/isles so loot stuck
                // on a deck edge or small sand still reaches you.
                let MAGNET_RADIUS = 150;
                try {
                    const offMain3 = (typeof WorldSystem !== 'undefined' &&
                        ((WorldSystem.islandOf && WorldSystem.islandOf(state)) ||
                         (WorldSystem.onBridge && (WorldSystem.onBridge(state, p.x, p.y) || WorldSystem.onBridge(state, fish.x, fish.y)))));
                    if (offMain3) MAGNET_RADIUS = 240;
                } catch (e) {}
                if (distToP < MAGNET_RADIUS && distToP > 1) {
                    // Stronger pull the closer the player is
                    const strength = 1 + (1 - distToP / MAGNET_RADIUS) * 3;
                    const pullSpeed = 240 * strength;

                    fish.vx += (dxToP / distToP) * pullSpeed * delta;
                    fish.vy += (dyToP / distToP) * pullSpeed * delta;

                    if (Math.random() < 0.4) {
                        Particles.spawnParticles(state, fish.x, fish.y, '#fef3c7', 1);
                    }
                }

                // Apply slide motion with heavy land friction
                fish.x += fish.vx * delta;
                fish.y += fish.vy * delta;
                const friction = Math.pow(CONFIG.DRAG_LAND_RESISTANCE, delta * 60);
                fish.vx *= friction;
                fish.vy *= friction;

                // Hard clamp — never let dead fish escape the walkable zone
                try {
                    if (typeof WorldSystem !== 'undefined' && WorldSystem.lootClamp) {
                        const c = WorldSystem.lootClamp(state, fish.x, fish.y);
                        fish.x = c.x; fish.y = c.y;
                    } else {
                const minX = B.MIN_X + p.radius + 4;
                const maxX = state.waterBoundaryX - p.radius - 4;
                const minY = B.MIN_Y + p.radius + 4;
                const maxY = B.MAX_Y - p.radius - 4;
                fish.x = Utils.clamp(fish.x, minX, maxX);
                fish.y = Utils.clamp(fish.y, minY, maxY);
                    }
                } catch (e) {}
            }

            fish.beachedTimer += delta;
            const threshold = fish.isDead ? 0.2 : 0.6;
            if (fish.beachedTimer > threshold) {
                this.beachFish(state, fish);
                return;
            }
        }

        f.lineTension = Math.max(0, f.lineTension);
        fish.stamina = Math.max(0, fish.stamina);
        fish.hp = Math.max(0, fish.hp);

        UI.updateTensionBar(state);

        const maxTension = rod.tensionMax || 100;
        if (!fish.isDead && f.lineTension >= maxTension) {
            try { audio.playSnap(); } catch (e) {}
            try { audio.playHurt(); } catch (e) {}
            this.escapeFish(state, "LINE SNAPPED!");
            UI.updateStatusBanner('Line Snapped! Ease space when tension turns red.', 'Tips', 'rose');
            state.screenShake = 12;
            return;
        }

        if (fish.dragState === 'BEACHING') {
            const dragHud = document.getElementById('drag-hud');
            if (dragHud) dragHud.classList.remove('hidden');
            // Piers + isles: progress = distance closed since beaching
            // (the surf-line bar is meaningless off the mainland beach).
            let progress = 0;
            try {
                const offBeach = (typeof WorldSystem !== 'undefined' &&
                    ((WorldSystem.islandOf && WorldSystem.islandOf(state)) ||
                     (WorldSystem.onBridge && WorldSystem.onBridge(state, p.x, p.y))));
                if (offBeach) {
                    const from = fish.beachFrom || 1;
                    progress = Utils.clamp(1 - Math.hypot(p.x - fish.x, p.y - fish.y) / from, 0, 1);
                } else {
                    const startX = state.waterBoundaryX + 35;
                    const endX = state.waterBoundaryX - 40;
                    progress = Utils.clamp((startX - fish.x) / (startX - endX), 0, 1);
                }
            } catch (e) {
                const startX = state.waterBoundaryX + 35;
                const endX = state.waterBoundaryX - 40;
                progress = Utils.clamp((startX - fish.x) / (startX - endX), 0, 1);
            }

            const dragBar = document.getElementById('drag-bar');
            if (dragBar) dragBar.style.width = `${progress * 100}%`;

            const dragDist = document.getElementById('drag-dist');
            if (dragDist) dragDist.innerText = `${Math.round(progress * 100)}%`;
        } else if (fish.dragState === 'IN_WATER') {
            const dragHud = document.getElementById('drag-hud');
            if (dragHud) dragHud.classList.add('hidden');
        }
    },

    triggerSkill(state, fish) {
        if (!fish || !fish.species) return;
        const availableSkills = fish.species.skills || [fish.species.skill || 'waterJet'];
        const selectedSkillKey = availableSkills[Math.floor(Math.random() * availableSkills.length)];
        try { audio.playSkillCast(); } catch (e) {}

        if (typeof FISH_SKILLS !== 'undefined') {
            const handler = FISH_SKILLS[selectedSkillKey] || FISH_SKILLS.waterJet;
            if (typeof handler === 'function') {
                // In co-op the catcher's sim owns the fight: fresh shots
                // are tagged (owner = catcher) and, for clients, mirrored
                // to the room so EVERY peer sees the skill (see mirrorSkill).
                let beforeP = -1, beforeH = -1, beforeB = -1;
                try {
                    if (state.projectiles) beforeP = state.projectiles.length;
                    if (state.groundHazards) beforeH = state.groundHazards.length;
                    if (state.delayedBlasts) beforeB = state.delayedBlasts.length;
                } catch (e) {}
                handler(fish, {
                    state,
                    canvas: { width: state.canvasWidth, height: state.canvasHeight },
                    showFloatingText: (t, x, y, c) => Particles.showFloatingText(state, t, x, y, c),
                    spawnParticles: (x, y, c, n) => Particles.spawnParticles(state, x, y, c, n)
                });
                try {
                    let me = null;
                    try {
                        me = (typeof Multiplayer !== 'undefined' && Multiplayer.roomCode)
                            ? (Multiplayer.localClientId || 'host') : null;
                    } catch (e) {}
                    const isMPClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
                    if (state.projectiles && beforeP >= 0) {
                        for (let i = beforeP; i < state.projectiles.length; i++) {
                            const pr = state.projectiles[i];
                            if (!pr) continue;
                            if (me) pr.ownerPid = me;
                            if (isMPClient) pr.local = true; // host snapshot keeps them
                        }
                    }
                    // Mirror the whole skill (shots + zones) to the room.
                    if (me && isMPClient && typeof Multiplayer !== 'undefined' && Multiplayer.mirrorSkill) {
                        Multiplayer.mirrorSkill(state, beforeP, beforeH, beforeB);
                    }
                } catch (e) {}
            }
        }
    },

    beachFish(state, fish) {
        if (!fish) return;

        try { audio.stopReelLoop(); } catch (e) {}
        try { audio.playVictory(); } catch (e) {}

        state.screenShake = 8;

        Particles.spawnParticles(state, fish.x, fish.y, '#fef3c7', 20);
        Particles.spawnWaterSplashes(state, fish.x, fish.y, 10);

        if (!state.groundLoot) state.groundLoot = [];
        if (!state.monstersOnLand) state.monstersOnLand = [];

        const speciesMaxHp = (fish.species && fish.species.maxHp) ? fish.species.maxHp : 100;

        // Co-op: catches become SHARED world objects. The client sends the
        // beached fish to the host (live ones spawn as shared monsters for
        // everyone to fight, dead ones drop as shared loot).
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
                if (Multiplayer.sendBeachClaim && Multiplayer.sendBeachClaim(fish)) {
                    Particles.showFloatingText(state, 'Shared with the party!', fish.x, fish.y - 40, '#34d399');
                    this.escapeFish(state, "");
                    return;
                }
            }
        } catch (e) {}

        if (fish.isDead || fish.hp <= 0) {
            // Spawn loot safely inside the player's reachable zone
            const p = state.player;
            const B = CONFIG.WORLD;
            let lootX = fish.x, lootY = fish.y;
            try {
                if (typeof WorldSystem !== 'undefined' && WorldSystem.lootClamp) {
                    const c = WorldSystem.lootClamp(state, fish.x, fish.y);
                    lootX = c.x; lootY = c.y;
                } else {
            lootX = Utils.clamp(fish.x, B.MIN_X + p.radius + 4, state.waterBoundaryX - p.radius - 4);
            lootY = Utils.clamp(fish.y, B.MIN_Y + p.radius + 4, B.MAX_Y - p.radius - 4);
                }
            } catch (e) {}

            state.groundLoot.push({
                id: 'l' + (state._lootSeq = (state._lootSeq || 0) + 1),
                species: fish.species,
                x: lootX,
                y: lootY
            });
            Particles.showFloatingText(state, `+1 ${fish.species ? fish.species.name : 'Fish'}!`, lootX, lootY - 30, '#34d399');
            UI.updateStatusBanner('Dead fish washed ashore! Walk over to collect it.', 'Dead Catch', 'emerald');
        } else {
            // Live beach: clamp onto a survivable surface (same rule as
            // dead loot) so the monster never stands on open water where
            // its kill-drop would instantly sink.
            let mx = fish.x, my = fish.y;
            try {
                if (typeof WorldSystem !== 'undefined' && WorldSystem.lootClamp) {
                    const c = WorldSystem.lootClamp(state, fish.x, fish.y);
                    mx = c.x; my = c.y;
                }
            } catch (e) {}
            state.monstersOnLand.push({
                id: Date.now() + Math.random(),
                species: fish.species,
                x: mx,
                y: my,
                hp: fish.hp,
                maxHp: speciesMaxHp,
                vx: 0,
                vy: 0,
                chargeCooldown: 3,
                isCharging: false
            });
            UI.updateStatusBanner('BEACHED! Shoot it to capture it!', 'Step 5', 'amber');
            try { audio.playRoar(); } catch (e) {}
        }
        if (typeof Tutorial !== 'undefined') Tutorial.onBeach(state);

        this.escapeFish(state, "");
    }
};