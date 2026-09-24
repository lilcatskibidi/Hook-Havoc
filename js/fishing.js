const Fishing = {
    onSpaceDown(state) {
        if (!state.player || state.player.isDead || state.player.hp <= 0) return;

        const p = state.player;
        const distToWater = state.waterBoundaryX - p.x;
        const f = state.fishing;

        if (f.mode === 'IDLE') {
            if (distToWater > 160 || distToWater < -20) {
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
        }
    },

    onSpaceUp(state) {
        if (!state.player || state.player.isDead || state.player.hp <= 0) return;

        const f = state.fishing;
        if (f.mode === 'CASTING') {
            try { audio.playCast(); } catch (e) {}
            f.mode = 'WAITING_BITES';
            const castDist = CONFIG.CAST_MIN_DIST + (f.castPower / 100) * (CONFIG.CAST_MAX_DIST - CONFIG.CAST_MIN_DIST);
            f.bobber.x = state.player.x + castDist;
            f.bobber.y = state.player.y + Utils.rand(-50, 50);
            f.waitingTime = 0;
            f.biteTimer = Utils.rand(CONFIG.BITE_MIN_DELAY, CONFIG.BITE_MAX_DELAY);
            UI.updateStatusBanner('Waiting for a bite...', 'Step 2');
        }
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
        state.screenShake = 6;

        const species = (typeof rollFishSpecies === 'function')
            ? rollFishSpecies(state)
            : { name: 'Common Bass', rarity: 'common', maxHp: 100, staminaMax: 100, speed: 100, color: '#38bdf8', value: 10 };
        const maxHp = species.maxHp || 100;
        const staminaMax = species.staminaMax || 100;

        const seaEscapeLimits = {
            common:    40.0,
            rare:      50.0,
            epic:      65.0,
            legendary: 85.0,
            mythic:    110.0
        };

        const rod = state.player.equippedRod || { reelPower: 80 };
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
            if (rarity === 'legendary' || rarity === 'mythic') audio.playRoar();
            else audio.playFishScreech();
        } catch (e) {}

        const rc = (CONFIG.RARITY_COLORS && CONFIG.RARITY_COLORS[species.rarity]) || '#cbd5e1';
        UI.updateStatusBanner(
            `<span style="color:${rc};font-weight:900">${species.rarity.toUpperCase()}</span> — ${species.name} hooked! Drag it to land quickly!`,
            'Step 3', 'amber'
        );
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

        if (typeof Projectiles !== 'undefined' && Projectiles.update) {
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

        // Reel loop management + reel tick
        const isReelingNow = !!state.keys[' '];
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
                try { audio.playSnap(); } catch (e) {}
                state.screenShake = 10;
                this.escapeFish(state, "FISH SWAM AWAY! (DRAG TO LAND)");
                UI.updateStatusBanner(
                    'The fish tore off the hook! Drag fish to land before fighting.',
                    'Escaped', 'rose');
                return;
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

        if (!fish.isDead) {
            fish.skillCooldown -= delta;
            if (fish.skillCooldown <= 0) {
                const cooldowns = {
                    common: 4.0,
                    rare: 2.8,
                    epic: 2.0,
                    legendary: 1.4,
                    mythic: 0.9
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
            const swimPower = fishSpeed * (fish.isRaging ? 1.8 : 1.0) * (0.4 + staminaRatio * 0.6);

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

            const reelPower = rod.reelPower || 80;
            const pullAccel = reelPower * pullMultiplier * 1.2;
            fish.vx += (dx / dist) * pullAccel * delta;
            fish.vy += (dy / dist) * pullAccel * delta;

            if (!fish.isDead) {
                fish.stamina -= CONFIG.STAMINA_DRAIN_PER_REEL * delta;
                const ragePenalty = fish.isRaging ? 2.2 : 1.0;
                f.lineTension += CONFIG.TENSION_PER_REEL * ragePenalty * staminaRatio * delta;
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

        const onLand = fish.x <= state.waterBoundaryX + CONFIG.BEACH_TRIGGER_OFFSET;
        if (onLand && fish.dragState === 'IN_WATER') {
            fish.dragState = 'BEACHING';
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

        fish.x = Utils.clamp(fish.x, B.MIN_X + 30, B.MAX_X - 30);
        fish.y = Utils.clamp(fish.y, B.MIN_Y + 30, B.MAX_Y - 30);

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
            const dxToPlayer = Math.abs(p.x - fish.x);
            const dxToShore = fish.x - state.waterBoundaryX;
            const closeEnough = dxToShore < -30 || dxToPlayer < 60;

            if (closeEnough || (fish.isDead && dxToShore < 0)) {
                fish.dragState = 'BEACHED';
                fish.beachedTimer = 0;

                // If dead, snap inside player's reachable area right away
                if (fish.isDead) {
                    const minX = B.MIN_X + p.radius + 4;
                    const maxX = state.waterBoundaryX - p.radius - 4;
                    const minY = B.MIN_Y + p.radius + 4;
                    const maxY = B.MAX_Y - p.radius - 4;
                    fish.x = Utils.clamp(fish.x, minX, maxX);
                    fish.y = Utils.clamp(fish.y, minY, maxY);
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

                const MAGNET_RADIUS = 150;
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
                const minX = B.MIN_X + p.radius + 4;
                const maxX = state.waterBoundaryX - p.radius - 4;
                const minY = B.MIN_Y + p.radius + 4;
                const maxY = B.MAX_Y - p.radius - 4;
                fish.x = Utils.clamp(fish.x, minX, maxX);
                fish.y = Utils.clamp(fish.y, minY, maxY);
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
            const startX = state.waterBoundaryX + 35;
            const endX = state.waterBoundaryX - 40;
            const progress = Utils.clamp((startX - fish.x) / (startX - endX), 0, 1);

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

        if (typeof FISH_SKILLS !== 'undefined') {
            const handler = FISH_SKILLS[selectedSkillKey] || FISH_SKILLS.waterJet;
            if (typeof handler === 'function') {
                handler(fish, {
                    state,
                    canvas: { width: state.canvasWidth, height: state.canvasHeight },
                    showFloatingText: (t, x, y, c) => Particles.showFloatingText(state, t, x, y, c),
                    spawnParticles: (x, y, c, n) => Particles.spawnParticles(state, x, y, c, n)
                });
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

        if (fish.isDead || fish.hp <= 0) {
            // Spawn loot safely inside the player's reachable zone
            const p = state.player;
            const B = CONFIG.WORLD;
            const lootX = Utils.clamp(fish.x, B.MIN_X + p.radius + 4, state.waterBoundaryX - p.radius - 4);
            const lootY = Utils.clamp(fish.y, B.MIN_Y + p.radius + 4, B.MAX_Y - p.radius - 4);

            state.groundLoot.push({
                species: fish.species,
                x: lootX,
                y: lootY
            });
            Particles.showFloatingText(state, `+1 ${fish.species ? fish.species.name : 'Fish'}!`, lootX, lootY - 30, '#34d399');
            UI.updateStatusBanner('Dead fish washed ashore! Walk over to collect it.', 'Dead Catch', 'emerald');
        } else {
            state.monstersOnLand.push({
                id: Date.now() + Math.random(),
                species: fish.species,
                x: fish.x,
                y: fish.y,
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

        this.escapeFish(state, "");
    }
};