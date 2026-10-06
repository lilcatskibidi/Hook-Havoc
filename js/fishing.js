const Fishing = {
    // Boss hooked fish (hydra etc.): never flees, never escapes on death.
    isBossFish(fish) {
        try {
            return !!(fish && fish.species && (fish.species.isBoss || fish.species.rarity === 'boss'));
        } catch (e) { return false; }
    },

    onSpaceDown(state) {
        if (!state.player || state.player.isDead || state.player.hp <= 0) return;
        // Heart-rip finisher: SPACE mashes the heart loose, never casts.
        try {
            if (state._heartRip && !state._heartRip.done) {
                state._heartRip.mash = (state._heartRip.mash || 0) + 1;
                state.screenShake = Math.max(state.screenShake || 0, 4);
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.tickHeartRip) Ritual.tickHeartRip(state);
                } catch (e) {}
                return;
            }
        } catch (e) {}
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
                Particles.showFloatingText(state, T('t_near_water'), p.x, p.y - 30, '#f87171');
                return;
            }
            if (p.bucket && p.bucket.length >= p.bucketCapacity) {
                Particles.showFloatingText(state, T('t_bucket_full'), p.x, p.y - 30, '#f87171');
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

    // Deck landing spot: when YOU stand on a deck (mainland bridge /
    // isle pier), catches must come onto the planks. Returns the nearest
    // deck point to the fish + which deck, or null on open sand play.
    deckSpotFor(state, p, fish) {
        try {
            if (typeof WorldSystem === 'undefined' || !p || !fish) return null;
            if (!WorldSystem.islandOf(state)) {
                if (WorldSystem.onBridge && WorldSystem.bridgeDef &&
                    WorldSystem.onBridge(state, p.x, p.y)) {
                    const b = WorldSystem.bridgeDef(state);
                    return {
                        kind: 'bridge',
                        x: Utils.clamp(fish.x, b.x0, b.x1),
                        y: Utils.clamp(fish.y, b.y - 46, b.y + 46),
                    };
                }
                return null;
            }
            if (WorldSystem.islandPier && WorldSystem.onIslandPier &&
                WorldSystem.islandPier(state) &&
                WorldSystem.onIslandPier(state, p.x, p.y, 60)) {
                const pier = WorldSystem.islandPier(state);
                return {
                    kind: 'pier',
                    x: Utils.clamp(fish.x, pier.x0, pier.x1),
                    y: Utils.clamp(fish.y, pier.y - pier.half, pier.y + pier.half),
                };
            }
        } catch (e) {}
        return null;
    },

    // Step banner vs fight bars: the tutorial steps live at the TOP;
    // the tension/drag bars own the BOTTOM. While a fish is hooked the
    // bars REPLACE the banner (no redundant text crowding the fight).
    syncBanner(state) {
        try {
            const banner = document.getElementById('status-banner');
            if (!banner) return;
            if (state.fishing.mode === 'HOOKED') banner.classList.add('hidden');
            else banner.classList.remove('hidden');
        } catch (e) {}
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
        Particles.showFloatingText(state, T('t_bobber_back'), p.x, p.y - 40, '#7dd3fc');
        UI.updateStatusBanner(T('step1_html'), T('step1_tag'), 'amber');
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
                Particles.showFloatingText(state, T('t_no_water'), state.player.x, state.player.y - 30, '#f87171');
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
        UI.updateStatusBanner(T('step2_html'), T('step2_tag'));
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
        // Bloodheart Lure: ALWAYS grabs the LEVIATHAN PRIEST (100%).
        // Every hook eats 1 equipped bait (see consumeHookBait below).
        let rolled = null;
        try {
            if (hookBait && hookBait.id === 'bloodheart_lure') {
                const priest = (typeof FISH_SPECIES !== 'undefined') && FISH_SPECIES.find(s => s.id === 'leviathan_priest');
                if (priest) {
                    rolled = priest;
                    Particles.showFloatingText(state, '❤️‍🔥 THE BLOODHEART SINGS... SOMETHING ANCIENT BITES!', f.bobber.x, f.bobber.y - 60, '#dc2626');
                    try { audio.playBell(); } catch (e) {}
                }
            } else if (hookBait && hookBait.id === 'lure_hydra' && Math.random() < 0.30) {
                const hydra = (typeof FISH_SPECIES !== 'undefined') && FISH_SPECIES.find(s => s.id === 'stormlord_hydra');
                if (hydra) {
                    rolled = hydra;
                    Particles.showFloatingText(state, '🌀 THE HYDRA TAKES THE LURE!', f.bobber.x, f.bobber.y - 60, '#10b981');
                    try { audio.playRoar(); } catch (e) {}
                }
            }
        } catch (e) {}
        if (!rolled) {
            // 🗝️ Void Key bites the hook like a fish, at the legendary rate.
            // Easy to reel (weak common body) — beach it to pocket the key
            // for the shrine's center pillar.
            let voidKey = false;
            try {
                const lk = (rod && typeof rod.luck === 'number' ? rod.luck : 0) + hookBaitLuck;
                const keyCh = Math.min(0.04, 0.015 + Math.max(0, lk) * 0.005);
                if (Math.random() < keyCh) voidKey = true;
            } catch (e) {}
            if (voidKey) {
                rolled = { id: '__void_key', name: 'Void Key', rarity: 'common', color: '#22d3ee', accent: '#a855f7', size: 18, maxHp: 120, staminaMax: 90, attack: 8, speed: 2.5, value: 0, shape: 'oval', finColor: '#0e7490', desc: 'A key that hums with void.', skills: ['dart'], skillName: 'Heavy Key', _voidKeyItem: true };
                Particles.showFloatingText(state, '🗝️ SOMETHING HEAVY BITES...', f.bobber.x, f.bobber.y - 60, '#22d3ee');
            } else {
                rolled = (typeof rollFishSpecies === 'function')
                    ? rollFishSpecies(state)
                    : { name: 'Common Bass', rarity: 'common', maxHp: 100, staminaMax: 100, speed: 100, color: '#38bdf8', value: 10 };
                // Bulletproof: an empty roll table yields null — fall back
                // to a plain bass instead of crashing the bite.
                if (!rolled) rolled = { name: 'Common Bass', rarity: 'common', maxHp: 100, staminaMax: 100, speed: 100, color: '#38bdf8', value: 10 };
            }
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
        // Sky surge: aurora/storm/monsoon multiply mutation odds so
        // index + blood hunts ride the weather (see makeCatchInstance wx).
        let wxm = 1;
        try {
            const ww = state.world && state.world.weather;
            wxm = ww === 'aurora' ? 2.2 : ww === 'storm' ? 1.5 : ww === 'monsoon' ? 1.3 : 1;
            if (wxm > 1) {
                Particles.showFloatingText(state, '🌌 THE SKY SURGES — MUTATIONS STIR!', f.bobber.x, f.bobber.y - 80, '#c4b5fd');
            }
        } catch (e) {}
        const species = (typeof makeCatchInstance === 'function')
            ? makeCatchInstance(rolled, luck + hookBaitLuck, wxm) : Object.assign({}, rolled);
        if (species.shiny) {
            Particles.showFloatingText(state, '✨ SHINY! Worth 3x! ✨', f.bobber.x, f.bobber.y - 60, '#fde047');
            try { audio.playLevelUp(); } catch (e) {}
        }
        // Hook-time achievements: the whale counts the moment it bites
        try {
            if (typeof Achievements !== 'undefined') {
                if (species.id === 'colossal_whale') Achievements.unlock('whale_watcher');
                if (species.shiny) Achievements.unlock('catch_shiny');
            }
        } catch (e) {}
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

        const rodBonus = 0.85 + ((Number(rod.reelPower) || 80) / 280) * 1.05;
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

        // MP aggro: mark nearby hunters — the fish must kill them or watch
        // them flee before it may vanish (see buildAggro/aggroTick).
        try { this.buildAggro(state); } catch (e) {}

        // BOSSES are never reeled: the line snaps on the spot and the
        // boss stays under the sea, swimming and shooting back. Guns out.
        if (species.isBoss && f.hookedFish) {
            f.hookedFish.lineBroken = true;
            f.lineTension = 0;
            try { audio.stopReelLoop(); } catch (e) {}
            try { audio.playSnap(); } catch (e) {}
            state.screenShake = 14;
            Particles.showFloatingText(state, '💥 LINE SNAPPED!', f.bobber.x, f.bobber.y - 60, '#ef4444');
            // Cinematic arrival for the hooked horror: roar + swim already
            // out at sea + the same 3-2-1 mutual freeze as ritual bosses
            // (no teleport — the angler stays on the rod).
            // HYDRA gets the full 10s: GIANT offshore roar FIRST (camera
            // glides player -> roar on its own), then bolts, rise, reveal.
            // HYDRA arrival, restaged: no instant pop. Tremor -> raging
            // waves -> nonstop lightning around the hook -> the nine heads
            // breach out of a splash column, roar, and the fight starts.
            // Storm + green sea roll in with it (see Ritual hydra-sea).
            try {
                const isHydra = species.id === 'stormlord_hydra';
                if (isHydra) {
                    try {
                        if (typeof Ritual !== 'undefined' && Ritual.startHydraStorm) Ritual.startHydraStorm(state);
                    } catch (e2) {}
                    if (f.hookedFish) {
                        f.hookedFish._hydraRising = true;
                        f.hookedFish._anchor = { x: f.bobber.x, y: f.bobber.y };
                    }
                    state.screenShake = Math.max(state.screenShake || 0, 18);
                    Particles.showFloatingText(state, '🌊 THE SEA TREMBLES...', f.bobber.x, f.bobber.y - 80, '#6ee7b7');
                    // 0-2.5s: tremor — shaking deck, churning foam ring.
                    for (let i = 0; i < 5; i++) {
                        setTimeout(() => {
                            try {
                                state.screenShake = Math.max(state.screenShake || 0, 12 + i * 2);
                                if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                                    Particles.spawnWaterSplashes(state,
                                        f.bobber.x + (Math.random() - 0.5) * 320, f.bobber.y + (Math.random() - 0.5) * 200, 8);
                                }
                            } catch (e2) {}
                        }, i * 500);
                    }
                    setTimeout(() => {
                        try { Particles.showFloatingText(state, '🌪 THE WAVES RAGE!', f.bobber.x, f.bobber.y - 80, '#34d399'); } catch (e2) {}
                    }, 2600);
                    // 2.5-5.5s: lightning hammers the hook point nonstop.
                    try {
                        if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                            for (let i = 0; i < 7; i++) {
                                setTimeout(() => {
                                    try {
                                        Combat.strikeLightning(state,
                                            f.bobber.x + (Math.random() - 0.5) * 340,
                                            f.bobber.y + (Math.random() - 0.5) * 220,
                                            { color: '#a7f3d0', shake: 10 });
                                    } catch (e2) {}
                                }, 2500 + i * 450);
                            }
                        }
                    } catch (e2) {}
                    // ~6s: BREACH — splash column + roar + shockwave.
                    setTimeout(() => {
                        try {
                            if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                                for (let k = 0; k < 6; k++) {
                                    Particles.spawnWaterSplashes(state,
                                        f.bobber.x + (Math.random() - 0.5) * 160, f.bobber.y + 10, 18);
                                }
                                Particles.spawnParticles(state, f.bobber.x, f.bobber.y - 40, '#10b981', 30, { size: 5 });
                            }
                            try { audio.playBossRoar(); } catch (e3) {}
                            try {
                                if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                                    Combat.roarShockwave(state, f.bobber.x, f.bobber.y, { color: '#10b981', rings: 6, maxR: 480, shake: 26 });
                                }
                            } catch (e3) {}
                            state.screenShake = Math.max(state.screenShake || 0, 26);
                            Particles.showFloatingText(state, '🐲 THE STORMLORD HYDRA RISES!', f.bobber.x, f.bobber.y - 110, '#10b981');
                        } catch (e2) {}
                    }, 6000);
                    if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                        // Reveal blast lands as dormancy lifts (theatre).
                        state.delayedBlasts = state.delayedBlasts || [];
                        state.delayedBlasts.push({
                            x: f.bobber.x, y: f.bobber.y, radius: 340, damage: 0,
                            timer: 6.6, color: '#10b981', shake: 24,
                        });
                    }
                }
                if (typeof Ritual !== 'undefined' && Ritual.bossIntro) {
                    const isPriest = species.id === 'leviathan_priest';
                    // Priest: quiet lock (no model reveal yet — bells, then
                    // the breach). Hydra/others keep their normal intros.
                    Ritual.bossIntro(state, species, f.bobber.x, f.bobber.y, f.hookedFish, isPriest ? 6 : (isHydra ? 7 : 5), 'rise', isPriest);
                    // Camera starts on YOU, then glides to the breach — the
                    // lock tracks the boss, so the pan plays itself.
                    if (isHydra || isPriest) {
                        try {
                            if (state._introCam) { state._introCam.x = state.player.x; state._introCam.y = state.player.y; }
                        } catch (e) {}
                    }
                    // PRIEST ARRIVAL: giant ritual spins up underfoot, the
                    // model stays HIDDEN (sea shadow only), bells toll from
                    // the deep, then it breaches the sky and dives into a
                    // real tsunami. Dormant through impact: no attacks in
                    // or out, no gun damage, until the cutscene lands.
                    if (isPriest && f.hookedFish) {
                        state._priestCircle = { x: state.player.x, y: state.player.y, t0: state.time || 0 };
                        state._priestBells = { t0: state.time || 0, x: f.bobber.x, y: f.bobber.y, rung: 0, done: false };
                        f.hookedFish._priestHidden = true;
                        f.hookedFish._priestBreach = {
                            t0: state.time || 0,
                            ax: f.bobber.x, ay: f.bobber.y,
                            impacted: false,
                        };
                        // Invulnerable + silent until the breach impact.
                        f.hookedFish.dormantUntil = Math.max(f.hookedFish.dormantUntil || 0, (state.time || 0) + 13.5);
                        Particles.showFloatingText(state, '🕯 THE WATER FALLS SILENT...', f.bobber.x, f.bobber.y - 90, '#7dd3fc');
                    }
                }
            } catch (e) {}
            try {
                if (typeof Ritual !== 'undefined' && Ritual.fightCountdown) Ritual.fightCountdown(state, f.hookedFish, { noTeleport: true, delaySec: species.id === 'leviathan_priest' ? 13 : (species.id === 'stormlord_hydra' ? 7 : 5) });
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

    // MP aggro list: whoever is NEAR when the fish is hooked is marked —
    // the fish must kill them (or watch them flee) before it may vanish.
    // Solo rooms / bosses: no aggro, legacy behavior untouched.
    AGGRO_RADIUS: 700,
    FLEE_RADIUS: 1400,

    buildAggro(state) {
        try {
            const fish = state.fishing && state.fishing.hookedFish;
            if (!fish || !fish.species || fish.species.isBoss) return;
            if (typeof Multiplayer === 'undefined' || !Multiplayer.roomCode) return;
            const me = Multiplayer.localClientId || 'self';
            const list = [{ pid: me, self: true }];
            const R = this.AGGRO_RADIUS;
            const add = (pid, x, y) => {
                if (!pid || pid === me) return;
                if (typeof x !== 'number' || typeof y !== 'number') return;
                if (Math.hypot(x - fish.x, y - fish.y) > R) return;
                list.push({ pid });
            };
            if (Multiplayer.isHost) {
                const peers = Multiplayer.hostPeers || {};
                for (const pid of Object.keys(peers)) {
                    const rp = peers[pid];
                    if (rp) add(pid, rp.x, rp.y);
                }
            } else if (state.remotePlayers) {
                for (const pid of Object.keys(state.remotePlayers)) {
                    const rp = state.remotePlayers[pid];
                    if (!rp) continue;
                    add(pid, (typeof rp.rx === 'number') ? rp.rx : rp.x,
                        (typeof rp.ry === 'number') ? rp.ry : rp.y);
                }
            }
            // A lone catcher fights the legacy fight (no raid announce).
            if (list.length > 1) {
                fish.aggro = list;
                const others = list.length - 1;
                Particles.showFloatingText(state,
                    `⚔ RAID HOOKED! ${others} hunter${others > 1 ? 's' : ''} marked — it must kill or outrun!`,
                    fish.x, fish.y - 70, '#f87171');
            }
        } catch (e) {}
    },

    // Resolve one aggro entry to a live body (pos / death / map slice).
    _aggroBody(state, entry) {
        try {
            const p = state.player;
            if (entry.self) {
                return {
                    x: p.x, y: p.y, dead: !(p.hp > 0) || !!p.isDead,
                    map: ((p.onIsland || null) + '|' + (!!p.inCave)),
                    name: 'you',
                };
            }
            const pid = entry.pid;
            let rp = null;
            try {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.isHost) {
                    rp = (Multiplayer.hostPeers || {})[pid] || null;
                } else if (state.remotePlayers) {
                    rp = state.remotePlayers[pid] || null;
                }
            } catch (e) { rp = null; }
            if (!rp) return { gone: true };
            const x = (typeof rp.rx === 'number') ? rp.rx : rp.x;
            const y = (typeof rp.ry === 'number') ? rp.ry : rp.y;
            return {
                x, y,
                dead: !(rp.hp > 0),
                map: (((rp.onIsland || null)) + '|' + (!!rp.inCave)),
                name: rp.playerName || rp.label || 'crewmate',
            };
        } catch (e) { return { gone: true }; }
    },

    _catcherMap(state) {
        try {
            const p = state.player;
            return ((p.onIsland || null) + '|' + (!!p.inCave));
        } catch (e) { return '|false'; }
    },

    // Per-frame aggro: 'escaped' (caller must return), 'hold', or null.
    // Dead/gone/fled entries resolve; fled = too far (>1400px) or on
    // another map slice (other island / portal / cave) — the fish then
    // runs back to the sea.
    aggroTick(state, fish) {
        try {
            if (!fish.aggro || !fish.aggro.length) return null;
            if (fish.isDead || !fish.species || fish.species.isBoss) { fish.aggro = null; return null; }
            if (fish.dragState !== 'IN_WATER') { fish.aggro = null; return null; }
            const myMap = this._catcherMap(state);
            let engaged = 0;
            const fledNames = [];
            for (const entry of fish.aggro) {
                if (!entry) continue;
                const b = this._aggroBody(state, entry);
                if (b.gone) { entry.done = 'gone'; continue; }
                if (b.dead) { entry.done = 'dead'; continue; }
                const far = Math.hypot((b.x || 0) - fish.x, (b.y || 0) - fish.y) > this.FLEE_RADIUS;
                if (far || b.map !== myMap) {
                    if (!entry.done) fledNames.push(b.name);
                    entry.done = 'fled';
                    continue;
                }
                entry.done = null;
                engaged++;
            }
            if (engaged > 0) return 'hold';
            // Nobody left to fight: the fish slips back to the sea.
            fish.aggro = null;
            try { audio.stopReelLoop(); } catch (e) {}
            this.escapeFish(state, fledNames.length
                ? `FISH FLED! (${fledNames.slice(0, 2).join(', ')} ran)`
                : 'FISH VANISHED!');
            UI.updateStatusBanner('Everyone left the fight — the fish returned to the sea.', 'Escaped', 'rose');
            return 'escaped';
        } catch (e) { return null; }
    },

    killHookedFish(state) {
        const f = state.fishing;
        const fish = f.hookedFish;
        if (!fish || fish.isDead) return;

        // Priest never dies at sea: a killing blow below 50% still
        // storms it ashore (the heart must be ripped on land).
        if (fish.species && fish.species.id === 'leviathan_priest' && !fish._p2) {
            fish.hp = Math.max(1, Math.round((fish.maxHp || 1) * 0.5));
            try { this.priestToShore(state, fish); } catch (e) {}
            return;
        }

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
                if (fish.species.id === 'void_shepherd' && typeof Ritual !== 'undefined' && Ritual.clearVoidBlackSea) Ritual.clearVoidBlackSea(state);
                if (fish.species.id === 'stormlord_hydra' && typeof Ritual !== 'undefined') {
                    if (Ritual.clearHydraSea) Ritual.clearHydraSea(state);
                    if (Ritual.unwindBossStorm) Ritual.unwindBossStorm(state);
                }
            } catch (e) {}
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
        try { this.syncBanner(state); } catch (e) {}

        // Host owns enemy skill shots — clients only take the hits (intake)
        const isMPClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
        if (typeof Projectiles !== 'undefined' && Projectiles.update && !isMPClient) {
            Projectiles.update(state, delta);
        }

        if (!state.player || state.player.isDead || state.player.hp <= 0) {
            // Bosses hold the field for a corpse — no escapeFish here
            // (see updateHooked's death branch + Player.die).
            if (f.mode !== 'IDLE' && !this.isBossFish(f.hookedFish)) {
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
            // Bulletproof: a synced snapshot can carry CAST_FLY without the
            // arc endpoints (or a mid-flight death cleared them) — bail to
            // IDLE instead of throwing every frame.
            if (!f.castFrom || !f.castTo || typeof f.castFrom.x !== 'number' || typeof f.castTo.x !== 'number') {
                f.mode = 'IDLE';
                f.castT = 0;
                return;
            }
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
        // Hit blink decay (local gun hits + co-op claims share this flag).
        try {
            if (fish.hitFlash > 0) fish.hitFlash = Math.max(0, fish.hitFlash - delta);
            if (fish._hitFlash > 0) fish._hitFlash = Math.max(0, fish._hitFlash - delta);
        } catch (e) {}

        const rod = p.equippedRod || { reelPower: 80, tensionMax: 100 };
        const B = CONFIG.WORLD;

        // Reel loop management + reel tick (no line, no reeling for bosses;
        // never while dead — the corpse holds no rod).
        const isReelingNow = !!state.keys[' '] && !fish.lineBroken && !p.isDead && (p.hp || 0) > 0;
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
            // BOSSES NEVER FLEE A CORPSE (hydra included): hold the sea
            // phase, bleed off tension, reset the escape clock, and wait for
            // your return. Chances are counted in Player.die (10 deaths and
            // even a boss tires of waiting).
            if (this.isBossFish(fish)) {
                fish.seaTimer = 0;
                fish.warnedSeaEscape = false;
                fish.warnedSeaEscape2 = false;
                f.lineTension = Math.max(0, f.lineTension - CONFIG.TENSION_DECAY_RATE * 2 * delta);
                UI.updateStatusBanner(`<b>${fish.species.name}</b> circles your corpse... it WAITS. Respawn and finish it!`, 'Boss', 'rose');
                return;
            }
            try { audio.playSnap(); } catch (e) {}
            state.screenShake = 10;
            this.escapeFish(state, "YOU DIED - FISH ESCAPED!");
            UI.updateStatusBanner('You were slain! The fish escaped back into the depths.', 'Fainted', 'rose');
            return;
        }

        // MP aggro: while marked hunters stand their ground the fish may
        // not vanish; when none remain it slips back to the sea.
        if (fish.aggro && fish.aggro.length) {
            const ag = this.aggroTick(state, fish);
            if (ag === 'escaped') return;
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
                // MP aggro hold: marked hunters still engaged → no vanishing.
                // Kill it or outrun it (1400px / other island / portal).
                } else if (fish.aggro && fish.aggro.length && fish.aggro.some(e => e && !e.done)) {
                    fish.seaTimer = fish.seaEscapeLimit * 0.7;
                    state.screenShake = Math.max(state.screenShake || 0, 6);
                    Particles.showFloatingText(state,
                        'THE FISH WANTS BLOOD! (kill it or outrun it)',
                        fish.x, fish.y - 55, '#ef4444');
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
            // Burn / poison DoT in water (gun effects fixed) — paused
            // while dormant: the intro cinematic is invulnerable theatre,
            // damage resumes when the boss wakes.
            if (fish.burnTimer > 0) {
                fish.burnTimer -= delta;
                if (!dormant) {
                    const dps = fish.burnDps || 12;
                    fish.hp -= dps * delta;
                    fish.stamina -= dps * 0.5 * delta;
                    if (Math.random() < 0.2) Particles.spawnParticles(state, fish.x, fish.y, '#f97316', 1, { size: 3 });
                }
            }
            if (fish.poisonTimer > 0) {
                fish.poisonTimer -= delta;
                if (!dormant) {
                    const dps = fish.poisonDps || 10;
                    fish.hp -= dps * delta;
                    if (Math.random() < 0.1) Particles.showFloatingText(state, `-${Math.round(dps * delta)}`, fish.x, fish.y - 25, '#84cc16');
                }
            }
            if (fish.slowTimer > 0) fish.slowTimer -= delta;
            if (fish._voidChannelCd > 0) fish._voidChannelCd -= delta;
            if (fish._hydraChannelCd > 0) fish._hydraChannelCd -= delta;
            if (fish._chargeOrb) {
                fish._chargeOrb.t = (fish._chargeOrb.t || 0) + delta;
                if (fish._chargeOrb.t > (fish._chargeOrb.dur || 2) + 0.5) fish._chargeOrb = null;
            }
            if (fish.hp <= 0) { this.killHookedFish(state); return; }
            // Priest cutscene: hidden + breaching = silent. No skills
            // until the tsunami impact hands control back.
            const priestCine = fish.species && fish.species.id === 'leviathan_priest' &&
                (fish._priestHidden || (fish._priestBreach && !fish._priestBreach.done));
            if (!dormant && !priestCine && fish.skillCooldown <= 0 && !(fish._voidChannelCd > 0) && !(fish._hydraChannelCd > 0)) {
                const cooldowns = {
                    common: 4.0,
                    rare: 2.8,
                    epic: 2.0,
                    legendary: 1.4,
                    mythic: 0.9,
                    boss: 1.6
                };
                // Hydra spams: shorter fuse between volleys (its pressure
                // is fire-rate, not single big hits).
                const isHydra = fish.species && fish.species.id === 'stormlord_hydra';
                const rarity = (fish.species && fish.species.rarity) ? fish.species.rarity : 'common';
                fish.skillCooldown = isHydra ? 1.0 : (cooldowns[rarity] || 3.0);
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
            // Cutscene facing: a dormant (intro) boss always aims its
            // HEAD at the player — never a back or tail mid-cinematic.
            // (Action poses like the priest breach set rotation after.)
            if (dormant && fish.species && fish.species.isBoss && !fish.isDead) {
                try {
                    const pp = state.player;
                    fish.rotation = Math.atan2(pp.y - fish.y, pp.x - fish.x);
                } catch (e) {}
            }
            // Sea-intro theatre: rising bosses churn the water above them.
            if (dormant && fish._introMode === 'rise') {
                try {
                    fish._introFxT = (fish._introFxT || 0) - delta;
                    if (fish._introFxT <= 0) {
                        if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                            Particles.spawnWaterSplashes(state, fish.x + (Math.random() - 0.5) * 100, fish.y, 4);
                        }
                        state.screenShake = Math.max(state.screenShake || 0, 5);
                        fish._introFxT = 0.25;
                    }
                } catch (e) {}
            }
        }

        // BROKEN LINE (boss): no reel, no tension, no escape, no beaching.
        // The boss circles you under the sea and keeps firing its skills —
        // kill it with guns. Loot washes ashore on the kill.
        if (fish.lineBroken && !fish.isDead) {
            // PRIEST BREACH theatre (bloodheart hook): the model hides,
            // bells toll, then it leaps skyward and dives into a tsunami.
            // Runs even while dormant; hands control back after impact.
            if (fish.species && fish.species.id === 'leviathan_priest' && fish._priestBreach && !fish._priestBreach.done) {
                const br = fish._priestBreach;
                const e = (state.time || 0) - (br.t0 || 0);
                if (e < 11) {
                    // Waiting in the deep: churn under the bobber.
                    fish.x += (br.ax - fish.x) * Math.min(1, delta * 2);
                    fish.y += (br.ay - fish.y) * Math.min(1, delta * 2);
                    if (Math.random() < 0.4) Particles.spawnWaterSplashes(state, fish.x, fish.y, 2);
                } else if (e < 12.4) {
                    // ASCEND: the model breaches skyward — third bell has
                    // rung, NOW it may be seen.
                    if (fish._priestHidden) {
                        fish._priestHidden = false;
                        Particles.showFloatingText(state, '🌊 IT RISES!', br.ax, br.ay - 200, '#7dd3fc');
                    }
                    const k = (e - 11) / 1.4;
                    fish.x = br.ax + Math.sin(k * Math.PI * 2) * 40;
                    fish.y = br.ay - 640 * k * k;
                    fish.rotation = -Math.PI / 2 + k * 0.4;
                    if (Math.random() < 0.7) Particles.spawnParticles(state, fish.x, fish.y + 40, '#7dd3fc', 2, { size: 4 });
                } else if (e < 13.2) {
                    // DIVE: arcs down from the sky toward open water.
                    const k = (e - 12.4) / 0.8;
                    const sx = br.ax, sy = br.ay - 640;
                    const tx2 = br.ax + 220, ty2 = br.ay + 30;
                    fish.x = sx + (tx2 - sx) * k;
                    fish.y = sy + (ty2 - sy) * k * k;
                    fish.rotation = Math.PI / 4 + k * 0.8;
                    if (Math.random() < 0.8) Particles.spawnParticles(state, fish.x, fish.y, '#e0f2fe', 3, { size: 5 });
                } else {
                    // IMPACT: the dive lands AS the tsunami skill, plus a
                    // real wall rolling to the beach + name reveal.
                    br.done = true;
                    try {
                        if (typeof FISH_SKILLS !== 'undefined' && FISH_SKILLS.tsunami) {
                            FISH_SKILLS.tsunami(fish, {
                                state,
                                canvas: { width: state.canvasWidth, height: state.canvasHeight },
                                showFloatingText: (t, x, y, c) => Particles.showFloatingText(state, t, x, y, c),
                                spawnParticles: (x, y, c, n) => Particles.spawnParticles(state, x, y, c, n),
                            });
                        }
                    } catch (e2) {}
                    try { audio.playBossRoar(); } catch (e2) {}
                    try {
                        if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                            Combat.roarShockwave(state, fish.x, fish.y, { color: '#0ea5e9', rings: 6, maxR: 520, shake: 28 });
                        }
                    } catch (e2) {}
                    if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                        for (let k = 0; k < 8; k++) {
                            Particles.spawnWaterSplashes(state, fish.x + (Math.random() - 0.5) * 300, fish.y + 10, 18);
                        }
                    }
                    state.screenShake = Math.max(state.screenShake || 0, 30);
                    state._priestTsunami = { t0: state.time || 0, x: fish.x + 200, y: fish.y, done: false };
                    Particles.showFloatingText(state, '🌊 TSUNAMI!', fish.x, fish.y - 130, '#7dd3fc');
                    try {
                        const host = document.getElementById('game-container') || document.body;
                        const old = document.getElementById('boss-intro-banner');
                        if (old) old.remove();
                        const div = document.createElement('div');
                        div.id = 'boss-intro-banner';
                        div.innerHTML =
                            `<div class="boss-intro-kicker">CHANT OF THE DEEP</div>` +
                            `<div class="boss-intro-name" style="--boss-color:#0ea5e9;--boss-glow:#7dd3fc;">${fish.species.name.toUpperCase()}</div>` +
                            `<div class="boss-intro-sub">THE TIDEFATHER RISES</div>`;
                        host.appendChild(div);
                        setTimeout(() => { try { div.remove(); } catch (e2) {} }, 3200);
                    } catch (e2) {}
                    fish.x = br.ax; fish.y = br.ay;
                    fish.rotation = 0;
                }
                f.lineTension = 0;
                try { UI.updateTensionBar(state); } catch (e2) {}
                return;
            }
            // PRIEST: no weakened-snag, no reel minigame — at 50% the line
            // is torn free and it storms ashore for land combat.
            if (fish.species && fish.species.id === 'leviathan_priest' &&
                !fish._p2 && (fish.hp / (fish.maxHp || 1)) <= 0.50) {
                try { this.priestToShore(state, fish); } catch (e) {}
                return;
            }
            // Weakened at 30%: your hook snags it — REEL IT IN like a
            // normal catch (drag to beach -> bucket -> sellable).
            // (Priest never reels: it already left at 50% above.)
            if (fish.hp / (fish.maxHp || 1) <= 0.30 && (!fish.species || fish.species.id !== 'leviathan_priest')) {
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
            // HYDRA PHASE 2 at half HP: breaches the shore and keeps
            // fighting on land with a meaner moveset (see pickSkill).
            // Host/solo converts; MP clients keep their personal sea
            // instance (the shared P2 body rides the host snapshot).
            if (isHydraSea && !fish._p2 && (fish.hp / (fish.maxHp || 1)) <= 0.5) {
                fish._p2 = true;
                try { audio.playBossRoar(); } catch (e) {}
                try {
                    if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                        Combat.roarShockwave(state, fish.x, fish.y, { color: '#ef4444', rings: 5, maxR: 320, shake: 22 });
                    }
                } catch (e) {}
                Particles.showFloatingText(state, '🌊 THE HYDRA STORMS THE SHORE!', fish.x, fish.y - 90, '#ef4444');
                try {
                    const soloOrHost = !(typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
                    if (soloOrHost) {
                        let bx = state.waterBoundaryX - 70, by = p.y;
                        try {
                            if (typeof WorldSystem !== 'undefined' && WorldSystem.lootClamp) {
                                const c = WorldSystem.lootClamp(state, p.x - 120, p.y + 40);
                                bx = c.x; by = c.y;
                            }
                        } catch (e) {}
                        const m = {
                            id: 'boss' + Date.now() + Math.random(),
                            species: fish.species,
                            x: bx, y: by,
                            hp: Math.max(1, Math.round(fish.hp)), maxHp: fish.maxHp,
                            vx: 0, vy: 0, chargeCooldown: 2, isCharging: false,
                            phase: 2, isEnraged: true, enrageTimer: 999,
                            _announced: true, // custom P2 cinematic above, no fallback banner
                            _introMode: 'rise',
                            dormantUntil: (state.time || 0) + 3,
                        };
                        (state.monstersOnLand = state.monstersOnLand || []).push(m);
                        state.activeBoss = m;
                        if (typeof Ritual !== 'undefined' && Ritual.fightCountdown) Ritual.fightCountdown(state, m);
                    }
                } catch (e) {}
                try { this.escapeFish(state, ''); } catch (e) {}
                return;
            }
            const ang = (fish.orbitAngle = (fish.orbitAngle || Math.random() * Math.PI * 2) + delta * (isHydraSea ? 1.25 : 0.55));
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
            const swimSpd = ((fish.species && fish.species.speed) || 100) * (isHydraSea ? 4.2 : 2.4)
                * (fish.freezeTimer > 0 ? 0.25 : 1.0)
                // Stun SLOWS sea bosses instead of rooting them: rapid-fire
                // stun guns used to nail phase 1 to one spot mid-fight.
                * (fish.stunTimer > 0 ? 0.35 : 1.0)
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
                // Dormant: bleed off velocity, hang still — EXCEPT the
                // rising hydra, which circles menacingly through its own
                // storm instead of floating dead (phase 1 never idles).
                if (fish.species && fish.species.id === 'stormlord_hydra' && fish._hydraRising) {
                    try {
                        if (!fish._anchor) fish._anchor = { x: fish.x, y: fish.y };
                        const t = state.time || 0;
                        const hx = fish._anchor.x + Math.cos(t * 0.9) * 130;
                        const hy = fish._anchor.y + Math.sin(t * 1.3) * 80;
                        fish.vx = (hx - fish.x) * 2.2;
                        fish.vy = (hy - fish.y) * 2.2;
                        fish.x += fish.vx * delta;
                        fish.y += fish.vy * delta;
                        // Head tracks the player through the whole circle.
                        try {
                            const pp2 = state.player;
                            fish.rotation = Math.atan2(pp2.y - fish.y, pp2.x - fish.x);
                        } catch (e2) {}
                        if (Math.random() < 0.5) Particles.spawnWaterSplashes(state, fish.x, fish.y, 2);
                        if (Math.random() < 0.3) Particles.spawnParticles(state, fish.x, fish.y, '#10b981', 1, { size: 3 });
                    } catch (e2) {
                        fish.vx *= 0.9;
                        fish.vy *= 0.9;
                    }
                } else {
                    fish.vx *= 0.9;
                    fish.vy *= 0.9;
                }
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
            Particles.showFloatingText(state, T('t_beached'), fish.x, fish.y - 40, '#facc15');
            UI.updateStatusBanner(T('t_keep_reeling'), T('t_beached_tag'), 'amber');
        }

        // Deck landing: when YOU stand on a deck (mainland bridge / isle
        // pier), the catch must physically slide onto YOUR planks. Without
        // this, BEACHED fired at 130-190px out in open water and loot
        // teleported to the far shore — the "invisible wall" on the bridge.
        let deckSpot = null, onDeck = false;
        try {
            deckSpot = this.deckSpotFor(state, p, fish);
            if (deckSpot) {
                onDeck = Math.hypot(fish.x - deckSpot.x, fish.y - deckSpot.y) < 40;
                if (fish.dragState === 'BEACHING' && !onDeck) {
                    const ddx = deckSpot.x - fish.x, ddy = deckSpot.y - fish.y;
                    const dd = Math.hypot(ddx, ddy) || 1;
                    const homing = 900 * delta;
                    fish.vx += (ddx / dd) * homing;
                    fish.vy += (ddy / dd) * homing;
                }
            }
        } catch (e) { deckSpot = null; }

        fish.x += fish.vx * delta;
        fish.y += fish.vy * delta;

        // Hooked fish grind against glue walls instead of phasing through.
        try {
            if (typeof GlueWall !== 'undefined' && GlueWall.collide) {
                GlueWall.collide(state, fish, ((fish.species && fish.species.size) || 30) * 0.7);
            }
        } catch (e) {}

        // TITAN SLAM landing (whale breach): the fish hangs skyward, then
        // comes down ON THE ANGLER — earthquake blast at the player's feet.
        // Sidestep the impact ring: it lands where you STAND, not where
        // you WERE, so keep moving.
        if (fish._slamT && fish._slamT > 0 && !fish.isDead) {
            fish._slamT -= delta;
            if (Math.random() < 0.5 && typeof Particles !== 'undefined') {
                Particles.spawnParticles(state, fish.x, fish.y, '#bae6fd', 2, { size: 4 });
            }
            if (fish._slamT <= 0) {
                fish._slamT = 0;
                fish.vy = 1500; // crashing back down
                const px = p.x, py = p.y;
                const slamDmg = fish._slamDmg || Math.round((fish.species.attack || 100) * 2);
                state.delayedBlasts.push({
                    x: px, y: py, radius: 150, damage: slamDmg,
                    timer: 0.45, color: '#93c5fd', shake: 30,
                    leaveHazard: true, hazardType: 'mud', hazardDps: 22, hazardDuration: 4.0
                });
                // Aftershock ring
                state.delayedBlasts.push({
                    x: px, y: py, radius: 90, damage: Math.round(slamDmg * 0.6),
                    timer: 0.9, color: '#fbbf24', shake: 20,
                    leaveHazard: false
                });
                state.screenShake = Math.max(state.screenShake || 0, 30);
                try { audio.playExplosion(); } catch (e) {}
                try { audio.playThunder(); } catch (e) {}
                Particles.spawnParticles(state, px, py, '#d6b98c', 30, { size: 6 });
                Particles.spawnParticles(state, px, py, '#93c5fd', 20, { size: 5 });
                Particles.showFloatingText(state, '💥 EARTHQUAKE!', px, py - 70, '#fbbf24');
                UI.updateStatusBanner('The whale breached on YOU! Keep moving when it leaps!', 'Quake', 'rose');
            }
        }

        if (fish.dragState === 'BEACHING' || fish.dragState === 'BEACHED') {
            // Swimming up onto YOUR deck is still swimming: water friction
            // until the fish overlaps the planks, sand friction after.
            // (Land friction from 190px out was half the "wall" feeling.)
            let deckSwim = false;
            try { deckSwim = !!(deckSpot && !onDeck); } catch (e) {}
            const res = deckSwim ? CONFIG.DRAG_WATER_RESISTANCE : CONFIG.DRAG_LAND_RESISTANCE;
            const sandFriction = Math.pow(res, delta * 60);
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
            let closeEnough = distToP < grabR || (fishOnLand && distToP < grabR + 60) || (!offMain && dxToShore < -30);
            // Deck landing gate: while the fish is still swimming toward
            // YOUR planks, hold BEACHING even inside grab range — the catch
            // completes on deck contact (or touching you), never remotely
            // in open water. Genuine sand landings pass straight through.
            try {
                if (deckSpot && !onDeck && !fishOnLand && distToP > 48) closeEnough = false;
            } catch (e) {}

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
            // Piers + isles: progress = distance closed since beaching.
            // Threshold-aware: the bar hits 100% exactly where BEACHED
            // fires (grab radius / surf line), never stalls at 50-90%.
            let progress = 0;
            try {
                const offBeach = (typeof WorldSystem !== 'undefined' &&
                    ((WorldSystem.islandOf && WorldSystem.islandOf(state)) ||
                     (WorldSystem.onBridge && WorldSystem.onBridge(state, p.x, p.y))));
                if (offBeach) {
                    const from = fish.beachFrom || 1;
                    // Deck landing: measure fish→planks, not fish→you, so
                    // the bar fills as it slides up onto the deck.
                    let deck = null;
                    try { deck = this.deckSpotFor(state, p, fish); } catch (e) {}
                    if (deck) {
                        const dd = Math.hypot(fish.x - deck.x, fish.y - deck.y);
                        if (fish.beachDeckFrom == null || fish.beachDeckFrom < dd) fish.beachDeckFrom = dd;
                        const df = fish.beachDeckFrom || 1;
                        progress = df < 60 ? (dd < 40 ? 1 : 0.9)
                            : Utils.clamp(1 - dd / df, 0, 1);
                    } else {
                        const grab = 130; // mirrors the offMain grabR below
                        const dist = Math.hypot(p.x - fish.x, p.y - fish.y);
                        progress = from <= grab ? 1 : Utils.clamp((from - dist) / (from - grab), 0, 1);
                    }
                } else {
                    const startX = state.waterBoundaryX + 35;
                    const endX = state.waterBoundaryX - 30; // BEACHED fires at dxToShore < -30
                    progress = Utils.clamp((startX - fish.x) / (startX - endX), 0, 1);
                }
            } catch (e) {
                const startX = state.waterBoundaryX + 35;
                const endX = state.waterBoundaryX - 30;
                progress = Utils.clamp((startX - fish.x) / (startX - endX), 0, 1);
            }

            const dragBar = document.getElementById('drag-bar');
            const dragDist = document.getElementById('drag-dist');
            // DOM-write guard (see UI.updateTensionBar): the bar moves in
            // whole percents; skip identical frames.
            const dpct = Math.round(progress * 100);
            if (this._dragPct !== dpct) {
                this._dragPct = dpct;
                if (dragBar) dragBar.style.width = `${dpct}%`;
                if (dragDist) dragDist.innerText = `${dpct}%`;
            }
        } else if (fish.dragState === 'IN_WATER') {
            const dragHud = document.getElementById('drag-hud');
            if (dragHud) dragHud.classList.add('hidden');
        }
    },

    triggerSkill(state, fish) {
        if (!fish || !fish.species) return;
        // Hooked bosses fight at sea: roll the sea kit (no tension/reel
        // minigame for snapped lines — guns do the talking).
        const availableSkills = ((fish.lineBroken && fish.species.seaSkills && fish.species.seaSkills.length)
            ? fish.species.seaSkills
            : (fish.species.skills || [fish.species.skill || 'waterJet']));
        const selectedSkillKey = availableSkills[Math.floor(Math.random() * availableSkills.length)];
        try { audio.playSkillCast(); } catch (e) {}

        if (typeof FISH_SKILLS !== 'undefined') {
            const handler = FISH_SKILLS[selectedSkillKey] || FISH_SKILLS.waterJet;
            if (typeof handler === 'function') {
                // In co-op the catcher's sim owns the fight: fresh shots
                // are tagged (owner = catcher) and, for clients, mirrored
                // to the room so EVERY peer sees the skill (see mirrorSkill).
                let beforeP = -1, beforeH = -1, beforeB = -1, beforeS = -1;
                try {
                    if (state.projectiles) beforeP = state.projectiles.length;
                    if (state.groundHazards) beforeH = state.groundHazards.length;
                    if (state.delayedBlasts) beforeB = state.delayedBlasts.length;
                    if (state.sonicBooms) beforeS = state.sonicBooms.length;
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
                    // Mirror the whole skill (shots + zones + sonic VFX) to the room.
                    if (me && isMPClient && typeof Multiplayer !== 'undefined' && Multiplayer.mirrorSkill) {
                        Multiplayer.mirrorSkill(state, beforeP, beforeH, beforeB, beforeS);
                    }
                } catch (e) {}
            }
        }
    },

    // PRIEST 50% transition: the line tears free and it storms ashore
    // carrying its current HP — land combat from here, no reel, no
    // tension. Host-only land body (clients ride the host snapshot).
    priestToShore(state, fish) {
        try {
            const p = state.player;
            fish._p2 = true;
            try { audio.playBossRoar(); } catch (e) {}
            try {
                if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                    Combat.roarShockwave(state, fish.x, fish.y, { color: '#0ea5e9', rings: 5, maxR: 380, shake: 24 });
                }
            } catch (e) {}
            if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                for (let k = 0; k < 5; k++) {
                    Particles.spawnWaterSplashes(state, fish.x + (Math.random() - 0.5) * 200, fish.y + 10, 14);
                }
            }
            Particles.showFloatingText(state, '🌊 THE PRIEST STORMS ASHORE!', fish.x, fish.y - 90, '#0ea5e9');
            try {
                const soloOrHost = !(typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
                if (soloOrHost) {
                    let bx = state.waterBoundaryX - 70, by = p.y;
                    try {
                        if (typeof WorldSystem !== 'undefined' && WorldSystem.lootClamp) {
                            const c = WorldSystem.lootClamp(state, p.x - 120, p.y + 40);
                            bx = c.x; by = c.y;
                        }
                    } catch (e) {}
                    const m = {
                        id: 'boss' + Date.now() + Math.random(),
                        species: fish.species,
                        x: bx, y: by,
                        hp: Math.max(1, Math.round(fish.hp)), maxHp: fish.maxHp,
                        vx: 0, vy: 0, chargeCooldown: 2, isCharging: false,
                        _announced: true, // named once at the breach already
                        _reentry: true,   // quiet if Combat ever intros it
                        _overloadCd: 3,   // first Heart Overload comes fast
                        _introMode: 'rise',
                        dormantUntil: (state.time || 0) + 3,
                    };
                    (state.monstersOnLand = state.monstersOnLand || []).push(m);
                    state.activeBoss = m;
                    if (typeof Ritual !== 'undefined' && Ritual.fightCountdown) Ritual.fightCountdown(state, m);
                }
            } catch (e) {}
            try { this.escapeFish(state, ''); } catch (e) {}
        } catch (e) {}
    },

    beachFish(state, fish) {
        if (!fish) return;

        try { audio.stopReelLoop(); } catch (e) {}
        try { audio.playVictory(); } catch (e) {}

        state.screenShake = 8;

        Particles.spawnParticles(state, fish.x, fish.y, '#fef3c7', 20);
        Particles.spawnWaterSplashes(state, fish.x, fish.y, 10);

        // 🗝️ Void Key catch: never a monster/loot — straight to the bucket.
        try {
            const isKey = !!(fish && ((fish.species && (fish.species._voidKeyItem || fish.species.id === '__void_key')) || fish._voidKeyItem));
            if (isKey) {
                if (typeof Ritual !== 'undefined' && Ritual.grantItem) Ritual.grantItem(state, 'void_key', 'fished key');
                else {
                    (state.player.bucket = state.player.bucket || []).push({ kind: 'item', keyItem: true, id: 'void_key', name: 'Void Key', icon: '🗝️', color: '#22d3ee', rarity: 'key', value: 5000 });
                }
                Particles.showFloatingText(state, '🗝️ VOID KEY secured! (shrine center)', fish.x, fish.y - 50, '#22d3ee');
                try { if (typeof Tutorial !== 'undefined') Tutorial.onBeach(state); } catch (e2) {}
                this.escapeFish(state, "");
                return;
            }
        } catch (e) {}

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
                // Instance max (shiny/mutation buffs included) — the base
                // template is smaller, which used to overflow HP bars and
                // break execute thresholds on buffed catches.
                maxHp: fish.maxHp || speciesMaxHp,
                vx: 0,
                vy: 0,
                chargeCooldown: 3,
                isCharging: false,
                // Beached re-entry: already introduced at the hook/ritual,
                // so Combat skips the name banner. Shore landing gets a
                // ground-thud instead (see below) — name said exactly once.
                _reentry: !!(fish.species && fish.species.isBoss),
            });
            // Shore thud for beached bosses: quake + spray + ring, no name.
            try {
                if (fish.species && fish.species.isBoss) {
                    state.screenShake = Math.max(state.screenShake || 0, 20);
                    if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                        Particles.spawnWaterSplashes(state, mx, my, 14);
                    }
                    Particles.spawnParticles(state, mx, my, '#d6c79a', 22, { size: 5 });
                    state.delayedBlasts = state.delayedBlasts || [];
                    state.delayedBlasts.push({
                        x: mx, y: my, radius: 190, damage: 0,
                        timer: 0.4, color: '#d6c79a', shake: 18,
                    });
                    Particles.showFloatingText(state, '💥 IT SLAMS ASHORE!', mx, my - 80, '#fbbf24');
                    try { audio.playExplosion(); } catch (e2) {}
                }
            } catch (e) {}
            UI.updateStatusBanner('BEACHED! Shoot it to capture it!', 'Step 5', 'amber');
            try { audio.playRoar(); } catch (e) {}
        }
        if (typeof Tutorial !== 'undefined') Tutorial.onBeach(state);

        this.escapeFish(state, "");
    }
};