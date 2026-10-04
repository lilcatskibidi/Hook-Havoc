const EnemySpawner = {
    state: null,
    timers: {
        seagull: 0,
        jumpingFish: 0,
        beachCrab: 0,
        duneBeetle: 0,
        sandUrchin: 0,
    },
    
    init(state) {
        this.state = state;
        this.timers.seagull = CONFIG.ENEMIES.SEAGULL.spawnInterval;
        this.timers.jumpingFish = CONFIG.ENEMIES.JUMPING_FISH.spawnInterval;
        this.timers.beachCrab = CONFIG.ENEMIES.BEACH_CRAB.spawnInterval;
        this.timers.duneBeetle = CONFIG.ENEMIES.DUNE_BEETLE.spawnInterval;
        this.timers.sandUrchin = CONFIG.ENEMIES.LAND_URCHIN.spawnInterval;
    },
    
    update(delta) {
        if (!this.state) return;

        // Don't spawn during menu
        if (this.state.paused) return;

        // No wild spawns inside the sealed cave (its fights come via ritual)
        if (this.state.player && this.state.player.inCave) return;
        // 1.1.5: detached isles are peaceful fishing grounds — wild beach
        // spawns stay on the mainland (bosses can still follow via ritual).
        if (this.state.player && this.state.player.onIsland) return;

        // Only spawn if player is alive
        if (this.state.player.hp <= 0) return;

        // Co-op client: host owns ALL open-world enemies (spawn + movement).
        // The client only takes contact damage from synced positions (intake).
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) return;

        const isMPClient = false;

        this.updateTimers(delta);
        // Host (or single player) spawns — clients get host enemies via sync
        if (!isMPClient) this.trySpawnEnemies(delta);
        // Each updater is isolated: one bad enemy type can lag a system,
        // never kill the frame (see Utils.safeTick).
        Utils.safeTick('Enemies.seagulls', () => this.updateSeagulls(delta));
        Utils.safeTick('Enemies.jumpers', () => this.updateJumpingFish(delta));
        Utils.safeTick('Enemies.crabs', () => this.updateBeachCrabs(delta));
        Utils.safeTick('Enemies.beetles', () => this.updateDuneBeetles(delta));
        Utils.safeTick('Enemies.urchins', () => this.updateSandUrchins(delta));
        Utils.safeTick('Enemies.missiles', () => this.updateGullMissiles(delta));
    },
    
    updateTimers(delta) {
        this.timers.seagull -= delta;
        this.timers.jumpingFish -= delta;
        this.timers.beachCrab -= delta;
        this.timers.duneBeetle -= delta;
        this.timers.sandUrchin -= delta;
    },
    
    trySpawnEnemies(delta) {
        // Seagulls
        if (this.timers.seagull <= 0) {
            this.timers.seagull = CONFIG.ENEMIES.SEAGULL.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.SEAGULL.spawnChance) {
                this.spawnSeagull();
            }
        }
        
        // Jumping Fish
        if (this.timers.jumpingFish <= 0) {
            this.timers.jumpingFish = CONFIG.ENEMIES.JUMPING_FISH.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.JUMPING_FISH.spawnChance) {
                this.spawnJumpingFish();
            }
        }
        
        // Beach Crabs
        if (this.timers.beachCrab <= 0) {
            this.timers.beachCrab = CONFIG.ENEMIES.BEACH_CRAB.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.BEACH_CRAB.spawnChance) {
                this.spawnBeachCrab();
            }
        }

        // Dune Beetles (armored chargers)
        if (this.timers.duneBeetle <= 0) {
            this.timers.duneBeetle = CONFIG.ENEMIES.DUNE_BEETLE.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.DUNE_BEETLE.spawnChance) {
                this.spawnDuneBeetle();
            }
        }

        // Sand Urchins (stationary spikers)
        if (this.timers.sandUrchin <= 0) {
            this.timers.sandUrchin = CONFIG.ENEMIES.LAND_URCHIN.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.LAND_URCHIN.spawnChance) {
                this.spawnSandUrchin();
            }
        }
    },
    
    countEnemies(type) {
        if (!this.state.enemies) return 0;
        return this.state.enemies.filter(e => e.enemyType === type).length;
    },
    
    spawnSeagull() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('seagull') >= CONFIG.ENEMIES.SEAGULL.maxCount) return;
        
        const p = this.state.player;
        const B = CONFIG.WORLD;
        const waterX = this.state.waterBoundaryX;
        
        // Spawn above player, off-screen
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = p.x + side * (B.MAX_X / 2 + Math.random() * 200);
        const y = p.y + (Math.random() - 0.5) * 400;
        
        const cfg = CONFIG.ENEMIES.SEAGULL;
        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'seagull',
            x, y,
            vx: 0, vy: 0,
            hp: cfg.hp,
            maxHp: cfg.hp,
            damage: cfg.damage,
            speed: cfg.speed,
            diveSpeed: cfg.diveSpeed,
            diveCooldown: 0,
            diveTimer: cfg.diveCooldown,
            state: 'circling', // circling, diving, retreating
            targetX: p.x,
            targetY: p.y,
            circleAngle: Math.random() * Math.PI * 2,
            circleRadius: 150 + Math.random() * 100,
            circleDirection: Math.random() < 0.5 ? 1 : -1,
            score: cfg.score,
            xp: cfg.xp,
            hitFlash: 0,
        });
    },
    
    // ---- MINIBOSS: STORMCALLER ----
    // Summoned every 20 seagull kills. While it lives, rods are useless:
    // the storm scatters every fish (see Fishing.onSpaceDown).
    gullBossActive() {
        if (!this.state || !this.state.enemies) return false;
        return this.state.enemies.some(e => e && e.isBoss && e.enemyType === 'seagull' && (e.hp || 0) > 0);
    },

    spawnGullBoss() {
        if (!this.state) return;
        if (!this.state.enemies) this.state.enemies = [];
        if (this.gullBossActive()) return;
        const p = this.state.player;
        const B = CONFIG.WORLD;
        const waterX = this.state.waterBoundaryX;
        const cfg = CONFIG.ENEMIES.SEAGULL;
        // Rides in on the storm front, over the water
        const x = Utils.clamp(waterX + 350 + Math.random() * 200, waterX + 100, B.MAX_X - 60);
        const y = Utils.clamp(p.y + (Math.random() - 0.5) * 300, B.MIN_Y + 60, B.MAX_Y - 60);
        const gullBoss = {
            id: 'boss' + Date.now(),
            enemyType: 'seagull',
            isBoss: true,
            bossName: 'STORMCALLER',
            x, y, vx: 0, vy: 0,
            hp: 14000, maxHp: 14000,
            damage: 70,
            speed: (cfg.speed || 120) + 60,
            diveSpeed: (cfg.diveSpeed || 300) + 150,
            diveCooldown: 0, diveTimer: 2,
            state: 'circling',
            targetX: p.x, targetY: p.y,
            circleAngle: Math.random() * Math.PI * 2,
            circleRadius: 220,
            circleDirection: Math.random() < 0.5 ? 1 : -1,
            skillCooldown: 2.0,
            skillIdx: 0, // rotates: strike -> feathers -> roar
            hitCd: 0,
            enraged: false,
            score: 4000,
            xp: 2000,
            hitFlash: 0,
        };
        this.state.enemies.push(gullBoss);
        // The storm scatters every fish — no rod fishing during the fight
        try {
            if (typeof Fishing !== 'undefined' && this.state.fishing &&
                (this.state.fishing.mode === 'CASTING' || this.state.fishing.mode === 'WAITING_BITES')) {
                Fishing.escapeFish(this.state, 'The storm scatters the fish!');
            }
        } catch (e) {}
        Particles.showFloatingText(this.state, '⛈ STORMCALLER HAS ARRIVED ⛈', p.x, p.y - 90, '#f87171');
        Particles.showFloatingText(this.state, '20 GULLS SLAIN — THEIR MOTHER COMES', x, y - 60, '#fbbf24');
        this.state.screenShake = Math.max(this.state.screenShake || 0, 16);
        // Cinematic arrival (war-horn boss roar inside — no plain roar here,
        // or it stacks into mud). Sky-queen entrance: falls from the storm.
        try {
            if (typeof Ritual !== 'undefined' && Ritual.bossIntro) {
                const info = (typeof STORMCALLER_INFO !== 'undefined') ? STORMCALLER_INFO : { id: 'stormcaller', name: 'Stormcaller' };
                gullBoss._introMode = 'fall';
                gullBoss._swimIn = { x, y };
                gullBoss.y = Math.max(y - 380, B.MIN_Y + 140);
                gullBoss._introImpact = true;
                Ritual.bossIntro(this.state, info, x, y, gullBoss, 5, 'fall');
            } else {
                try { audio.playBossRoar(); } catch (e) {}
            }
        } catch (err) {}
        // Standard opener: 3-2-1 countdown after the 5s descent, like
        // every other boss (pass the real enemy so dormancy covers it).
        try {
            if (typeof Ritual !== 'undefined' && Ritual.fightCountdown) {
                Ritual.fightCountdown(this.state, gullBoss, { delaySec: 5 });
            }
        } catch (err) {}
    },

    updateGullBoss(e, delta, p, dist) {
        const B = CONFIG.WORLD;
        // Intro dormancy: Stormcaller descends from the storm, silent and
        // still, until her cinematic releases her.
        if (e.dormantUntil && this.state.time < e.dormantUntil) {
            if (e._swimIn) {
                const sx = e._swimIn.x - e.x, sy = e._swimIn.y - e.y;
                const sd = Math.hypot(sx, sy) || 1;
                const step = (e._swimIn.spd || 130) * delta;
                if (sd <= Math.max(20, step)) {
                    e.x = e._swimIn.x; e.y = e._swimIn.y;
                    delete e._swimIn;
                    if (e._introImpact) {
                        delete e._introImpact;
                        try {
                            this.state.delayedBlasts.push({
                                x: e.x, y: e.y, radius: 200, damage: 0,
                                timer: 0.3, color: '#facc15', shake: 20,
                            });
                            Particles.spawnParticles(this.state, e.x, e.y, '#e2e8f0', 35, { size: 5 });
                            try { audio.playExplosion(); } catch (err) {}
                        } catch (err) {}
                        this.state.screenShake = Math.max(this.state.screenShake || 0, 20);
                    }
                } else {
                    e.x += (sx / sd) * step;
                    e.y += (sy / sd) * step;
                }
            } else {
                e.vx *= 0.9;
                e.vy *= 0.9;
                e.x += e.vx * delta;
                e.y += e.vy * delta;
            }
            try {
                e._introFxT = (e._introFxT || 0) - delta;
                if (e._introFxT <= 0) {
                    Particles.spawnParticles(this.state, e.x + (Math.random() - 0.5) * 60, e.y - 80, '#e2e8f0', 3, { size: 4 });
                    e._introFxT = 0.12;
                }
            } catch (err) {}
            return;
        }
        // Enrage under 40%: faster, angrier, louder
        if (!e.enraged && e.hp < e.maxHp * 0.4) {
            e.enraged = true;
            e.speed *= 1.5;
            e.diveSpeed *= 1.5;
            Particles.showFloatingText(this.state, '⛈ STORMCALLER ENRAGED ⛈', e.x, e.y - 70, '#ef4444');
            try { audio.playBossRoar(); } catch (err) {}
        }
        // Tight storm circle around the player
        e.circleAngle += e.circleDirection * delta * (e.enraged ? 1.1 : 0.7);
        const gx = p.x + Math.cos(e.circleAngle) * e.circleRadius;
        const gy = p.y + Math.sin(e.circleAngle) * e.circleRadius;
        const tdx = gx - e.x, tdy = gy - e.y;
        const td = Math.hypot(tdx, tdy) || 1;
        e.vx += (tdx / td) * e.speed * delta;
        e.vy += (tdy / td) * e.speed * delta;

        // Close-range combat: wing buffet
        e.hitCd = Math.max(0, (e.hitCd || 0) - delta);
        if (dist < (p.radius || 15) + 34 && e.hitCd <= 0) {
            e.hitCd = 0.8;
            this.hitPlayer(e);
            Particles.spawnParticles(this.state, p.x, p.y, '#e2e8f0', 10);
        }

        // Rotating skill kit: strike -> feathers -> storm dive -> gale wall -> stunning roar
        e.skillCooldown -= delta;
        if (e.skillCooldown <= 0) {
            const skill = ['strike', 'feathers', 'stormDive', 'galeWall', 'roar'][e.skillIdx % 5];
            e.skillIdx++;
            if (skill === 'strike') {
                const alive = this.countEnemies('gullMissile');
                const n = Math.min(e.enraged ? 6 : 4, Math.max(0, 6 - alive));
                for (let i = 0; i < n; i++) {
                    const a = Math.atan2(p.y - e.y, p.x - e.x) + (i - (n - 1) / 2) * 0.28;
                    this.state.enemies.push({
                        id: 'm' + Date.now() + Math.random() + i,
                        enemyType: 'gullMissile',
                        x: e.x, y: e.y,
                        vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
                        hp: 30, maxHp: 30,
                        damage: 45,
                        life: 4,
                        score: 0, xp: 10,
                        hitFlash: 0,
                    });
                }
                Particles.showFloatingText(this.state, 'SEAGULL STRIKE!', e.x, e.y - 60, '#fbbf24');
                try { audio.playFishScreech(); } catch (err) {}
                e.skillCooldown = e.enraged ? 2.2 : 3.0;
            } else if (skill === 'feathers') {
                if (typeof Combat !== 'undefined' && Combat.spawnBullet) {
                    const base = Math.atan2(p.y - e.y, p.x - e.x);
                    for (let i = -4; i <= 4; i++) {
                        const a = base + i * 0.14;
                        Combat.spawnBullet(this.state, e.x, e.y,
                            Math.cos(a) * 420, Math.sin(a) * 420,
                            { radius: 7, damage: 25, color: '#e2e8f0', life: 2.2 });
                    }
                }
                Particles.showFloatingText(this.state, 'FEATHER BARRAGE!', e.x, e.y - 60, '#e2e8f0');
                try { audio.playWhoosh(); } catch (err) {}
                e.skillCooldown = e.enraged ? 2.2 : 3.0;
            } else if (skill === 'stormDive') {
                // Telegraphed dive-bomb: she folds her wings and spears down
                // at the angler. Sidestep the shadow — the blast is real.
                const da = Math.atan2(p.y - e.y, p.x - e.x);
                e.vx = Math.cos(da) * (e.enraged ? 900 : 720);
                e.vy = Math.sin(da) * (e.enraged ? 900 : 720);
                if (typeof Combat !== 'undefined' && Combat.spawnBullet) {
                    for (let i = 0; i < 6; i++) {
                        const a = da + (i - 2.5) * 0.22;
                        Combat.spawnBullet(this.state, e.x, e.y,
                            Math.cos(a) * 480, Math.sin(a) * 480,
                            { radius: 8, damage: 35, color: '#fbbf24', life: 1.8 });
                    }
                }
                this.state.delayedBlasts.push({
                    x: p.x, y: p.y, radius: 85, damage: e.enraged ? 70 : 55,
                    timer: 0.7, color: '#fbbf24', shake: 18,
                    leaveHazard: false
                });
                this.state.screenShake = Math.max(this.state.screenShake || 0, 14);
                Particles.showFloatingText(this.state, '⛈ STORM DIVE — MOVE! ⛈', e.x, e.y - 60, '#fbbf24');
                try { audio.playWhoosh(); } catch (err) {}
                e.skillCooldown = e.enraged ? 2.6 : 3.4;
            } else if (skill === 'galeWall') {
                // Gale wall: a full ring of gale feathers + slowing winds.
                // No safe lane — outrun the ring or tank it with armor.
                if (typeof Combat !== 'undefined' && Combat.spawnBullet) {
                    const n = e.enraged ? 18 : 14;
                    const off = Math.random() * Math.PI * 2;
                    for (let i = 0; i < n; i++) {
                        const a = off + (i / n) * Math.PI * 2;
                        Combat.spawnBullet(this.state, e.x, e.y,
                            Math.cos(a) * 340, Math.sin(a) * 340,
                            { radius: 7, damage: 30, color: '#bae6fd', life: 2.6 });
                    }
                }
                p.slowTimer = Math.max(p.slowTimer || 0, 1.5);
                this.state.screenShake = Math.max(this.state.screenShake || 0, 12);
                Particles.spawnParticles(this.state, e.x, e.y, '#bae6fd', 24, { size: 4 });
                Particles.showFloatingText(this.state, '🌀 GALE WALL!', e.x, e.y - 60, '#bae6fd');
                try { audio.playThunder(); } catch (err) {}
                e.skillCooldown = e.enraged ? 3.0 : 4.0;
            } else {
                p.stunTimer = Math.max(p.stunTimer || 0, 2.0);
                this.state.screenShake = Math.max(this.state.screenShake || 0, 16);
                // Mouth shockwaves for every roar (theatre — the stun above
                // is the real effect, applied directly).
                try {
                    if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                        const mouth = Combat.mouthXY({ x: e.x, y: e.y, angle: Math.atan2(p.y - e.y, p.x - e.x), species: { size: 40 } });
                        Combat.roarShockwave(this.state, mouth.x, mouth.y, { color: '#fbbf24', rings: 3, maxR: 220, shake: 14 });
                    }
                } catch (err) {}
                Particles.spawnParticles(this.state, e.x, e.y, '#fbbf24', 30, { size: 5 });
                Particles.showFloatingText(this.state, '⛈ ROAR — STUNNED 2s ⛈', p.x, p.y - 50, '#f87171');
                try { audio.playBossRoar(); } catch (err) {}
                e.skillCooldown = e.enraged ? 3.5 : 4.5;
            }
        }

        e.x += e.vx * delta;
        e.y += e.vy * delta;
        e.vx *= 0.96;
        e.vy *= 0.96;
        e.x = Utils.clamp(e.x, B.MIN_X, this.state.waterBoundaryX + 500);
        e.y = Utils.clamp(e.y, B.MIN_Y, B.MAX_Y);
    },

    updateGullMissiles(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        for (let i = this.state.enemies.length - 1; i >= 0; i--) {
            const e = this.state.enemies[i];
            if (!e || e.enemyType !== 'gullMissile') continue;
            if (this.tickStatus(e, delta)) continue;
            // Living missile: steers into the player, then detonates
            const dx = p.x - e.x, dy = p.y - e.y;
            const d = Math.hypot(dx, dy) || 1;
            e.vx += (dx / d) * 900 * delta;
            e.vy += (dy / d) * 900 * delta;
            const spd = Math.hypot(e.vx, e.vy) || 1;
            const MAX = 560;
            if (spd > MAX) { e.vx = e.vx / spd * MAX; e.vy = e.vy / spd * MAX; }
            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.life -= delta;
            if (Math.random() < 0.5) {
                Particles.spawnParticles(this.state, e.x, e.y, '#e2e8f0', 1, { size: 2 });
            }
            const hit = Math.hypot(p.x - e.x, p.y - e.y) < (p.radius || 15) + 12;
            if (hit) {
                this.hitPlayer(e);
                Particles.spawnParticles(this.state, e.x, e.y, '#f97316', 16, { size: 5 });
                this.state.screenShake = Math.max(this.state.screenShake || 0, 10);
                try { audio.playExplosion(); } catch (err) {}
                this.state.enemies.splice(i, 1);
            } else if (e.life <= 0) {
                Particles.spawnParticles(this.state, e.x, e.y, '#94a3b8', 6);
                this.state.enemies.splice(i, 1);
            }
        }
    },
    // Returns true if the tick killed the enemy.
    tickStatus(e, delta) {
        let died = false;
        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            e.hp -= (e.burnDps || 12) * delta;
            if (Math.random() < 0.25 && this.state) {
                Particles.spawnParticles(this.state, e.x, e.y, '#f97316', 1, { size: 3 });
            }
        }
        if (e.poisonTimer > 0) {
            e.poisonTimer -= delta;
            e.hp -= (e.poisonDps || 10) * delta;
        }
        if (e.freezeTimer > 0) e.freezeTimer -= delta;
        if (e.stunTimer > 0) e.stunTimer -= delta;
        e.hitFlash = Math.max(0, (e.hitFlash || 0) - delta);
        if (e.hp <= 0 && !e._dead) {
            e._dead = true;
            this.onEnemyKilled(e);
            died = true;
        }
        return died;
    },

    spawnJumpingFish() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('jumpingFish') >= CONFIG.ENEMIES.JUMPING_FISH.maxCount) return;

        const p = this.state.player;
        const B = CONFIG.WORLD;
        const waterX = this.state.waterBoundaryX;

        // LEAP-IN: the fish launches itself out of the SEA in an arc and
        // crash-lands on the beach near the player. Rarity rolls exactly
        // like a rod catch (rod luck included), and it keeps ALL its
        // species skills for the land fight.
        const cfg = CONFIG.ENEMIES.JUMPING_FISH;
        let base = null;
        for (let tries = 0; tries < 10 && !base; tries++) {
            const cand = (typeof rollFishSpecies === 'function')
                ? rollFishSpecies(this.state)
                : FISH_SPECIES[Math.floor(Math.random() * FISH_SPECIES.length)];
            if (cand && !cand.isBoss) base = cand; // bosses stay hook-only
        }
        if (!base) base = FISH_SPECIES.find(f => f.rarity === 'common') || FISH_SPECIES[0];
        const rod = p.equippedRod || {};
        const luck = (typeof rod.luck === 'number') ? rod.luck : 0;
        const species = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, luck) : Object.assign({}, base);
        // Launch point: out in the water near the player's height...
        let sx = Utils.clamp(waterX + 120 + Math.random() * 250, waterX + 40, B.MAX_X - 30);
        let sy = Utils.clamp(p.y + (Math.random() - 0.5) * 500, B.MIN_Y + 30, B.MAX_Y - 30);
        // ...crash point: on the sand near the player.
        const tx = Utils.clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 100), B.MIN_X + 30, waterX - 30);
        const ty = Utils.clamp(p.y + (Math.random() - 0.5) * 200, B.MIN_Y + 30, B.MAX_Y - 30);
        // Never make it fly across the whole map: pull the launch closer
        // when the player is far from the surf.
        const leapDist = Math.hypot(tx - sx, ty - sy);
        if (leapDist > 700) {
            const k = 550 / leapDist;
            sx = tx + (sx - tx) * k;
            sy = ty + (sy - ty) * k;
        }
        const dist = Math.hypot(tx - sx, ty - sy) || 1;

        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'jumpingFish',
            species: species,
            bornDeathSeq: this.state._deathSeq || 0, // revenge eligibility stamp (see updateJumpingFish)
            x: sx, y: sy,
            vx: (tx - sx), vy: (ty - sy),
            hp: Math.max(60, (species.maxHp || cfg.baseHp) * 0.4),
            maxHp: Math.max(60, (species.maxHp || cfg.baseHp) * 0.4),
            damage: cfg.damage,
            state: 'leaping', // leaping -> onLand
            jumpT: 0,
            jumpDur: Utils.clamp(dist / 550, 0.7, 1.4),
            sx, sy, tx, ty,
            leapH: 0,
            landTimer: 60,   // flops back to sea after 60s on land if ignored
            hopTimer: 0.5,
            hitCd: 0,
            skillCooldown: 1.5 + Math.random() * 2, // full species skill kit
            isRaging: false,
            rageTimer: 0,
            isInflated: false,
            inflateTimer: 0,
            score: Math.max(20, Math.round((species.value || 100) * 0.3)),
            xp: cfg.xp,
            hitFlash: 0,
        });
        // VOID MUTATION: tears a portal open at the launch point, then
        // jumps through it. Only void-tainted jumpers carry Void Shards.
        if (species.mutation === 'void') {
            for (let i = 0; i < 3; i++) {
                Particles.spawnParticles(this.state, sx, sy, '#a855f7', 12, { size: 5 });
            }
            Particles.showFloatingText(this.state, '🌀 VOID PORTAL!', sx, sy - 50, '#c084fc');
            this.state.screenShake = Math.max(this.state.screenShake || 0, 8);
            try { audio.playRoar(); } catch (err) {}
        }
        const rc = (typeof CONFIG !== 'undefined' && CONFIG.RARITY_COLORS && CONFIG.RARITY_COLORS[species.rarity]) || species.color || '#38bdf8';
        Particles.showFloatingText(this.state, `🐟 ${species.rarity ? species.rarity.toUpperCase() + ' ' : ''}${species.name} leaps ashore!`, tx, ty - 50, rc);
        Particles.spawnWaterSplashes(this.state, sx, sy, 12);
        try { audio.playSplash(); } catch (e) {}
        this.state.screenShake = Math.max(this.state.screenShake || 0, 4);
    },
    
    spawnBeachCrab() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('beachCrab') >= CONFIG.ENEMIES.BEACH_CRAB.maxCount) return;
        
        const p = this.state.player;
        const waterX = this.state.waterBoundaryX;
        const B = CONFIG.WORLD;
        
        // Spawn on beach near player
        const x = Utils.clamp(p.x + (Math.random() - 0.5) * 400, waterX - 200, waterX + 50);
        const y = Utils.clamp(p.y + (Math.random() - 0.5) * 400, B.MIN_Y + 50, B.MAX_Y - 50);
        
        const cfg = CONFIG.ENEMIES.BEACH_CRAB;
        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'beachCrab',
            x, y,
            vx: 0, vy: 0,
            hp: cfg.hp,
            maxHp: cfg.hp,
            damage: cfg.damage,
            speed: cfg.speed,
            burrowCooldown: 0,
            burrowTimer: cfg.burrowCooldown,
            state: 'walking', // walking, burrowed, charging
            burrowed: false,
            score: cfg.score,
            xp: cfg.xp,
            hitFlash: 0,
        });
    },

    spawnDuneBeetle() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('duneBeetle') >= CONFIG.ENEMIES.DUNE_BEETLE.maxCount) return;

        const p = this.state.player;
        const waterX = this.state.waterBoundaryX;
        const B = CONFIG.WORLD;

        // Spawn on beach near player (never in the surf)
        const x = Utils.clamp(p.x + (Math.random() - 0.5) * 460, B.MIN_X + 40, waterX - 30);
        const y = Utils.clamp(p.y + (Math.random() - 0.5) * 460, B.MIN_Y + 50, B.MAX_Y - 50);

        const cfg = CONFIG.ENEMIES.DUNE_BEETLE;
        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'duneBeetle',
            x, y,
            vx: 0, vy: 0,
            hp: cfg.hp,
            maxHp: cfg.hp,
            damage: cfg.damage,
            speed: cfg.speed,
            state: 'walking', // walking, telegraph, charging
            walkTimer: 0,
            walkTargetX: x, walkTargetY: y,
            telegraphT: 0,
            chargeDx: 0, chargeDy: 0,
            score: cfg.score,
            xp: cfg.xp,
            hitFlash: 0,
        });
        Particles.showFloatingText(this.state, '🪲 Dune Beetle surfaces!', x, y - 40, '#a8a29e');
    },

    spawnSandUrchin() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('sandUrchin') >= CONFIG.ENEMIES.LAND_URCHIN.maxCount) return;

        const p = this.state.player;
        const waterX = this.state.waterBoundaryX;
        const B = CONFIG.WORLD;

        const x = Utils.clamp(p.x + (Math.random() - 0.5) * 420, B.MIN_X + 40, waterX - 30);
        const y = Utils.clamp(p.y + (Math.random() - 0.5) * 420, B.MIN_Y + 50, B.MAX_Y - 50);

        const cfg = CONFIG.ENEMIES.LAND_URCHIN;
        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'sandUrchin',
            x, y,
            vx: 0, vy: 0,
            hp: cfg.hp,
            maxHp: cfg.hp,
            damage: cfg.damage,
            speed: 0,
            state: 'idle',
            volleyTimer: 1.5 + Math.random() * 1.5,
            pulsePhase: Math.random() * Math.PI * 2,
            score: cfg.score,
            xp: cfg.xp,
            hitFlash: 0,
        });
        Particles.showFloatingText(this.state, '🟣 Sand Urchin blooms!', x, y - 30, '#c084fc');
    },
    
    updateSeagulls(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        
        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'seagull') return;
            if (this.tickStatus(e, delta)) return;
            if (e.stunTimer > 0) return;

            e.diveTimer -= delta;
            
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy);

            // Miniboss runs its own storm AI
            if (e.isBoss) {
                this.updateGullBoss(e, delta, p, dist);
                return;
            }
            
            switch (e.state) {
                case 'circling':
                    // Circle around player
                    e.circleAngle += e.circleDirection * delta * 0.5;
                    e.targetX = p.x + Math.cos(e.circleAngle) * e.circleRadius;
                    e.targetY = p.y + Math.sin(e.circleAngle) * e.circleRadius;
                    
                    const tx = e.targetX - e.x;
                    const ty = e.targetY - e.y;
                    const td = Math.hypot(tx, ty);
                    if (td > 0) {
                        e.vx += (tx / td) * e.speed * delta;
                        e.vy += (ty / td) * e.speed * delta;
                    }
                    
                    // Dive attack
                    if (e.diveTimer <= 0 && dist < 300 && Math.random() < 0.02) {
                        e.state = 'diving';
                        e.diveTimer = 3;
                    }
                    break;
                    
                case 'diving':
                    // Fast dive towards player
                    if (dist > 0) {
                        e.vx += (dx / dist) * e.diveSpeed * delta;
                        e.vy += (dy / dist) * e.diveSpeed * delta;
                    }
                    
                    // Check collision with player
                    if (dist < p.radius + 15) {
                        this.hitPlayer(e);
                        e.state = 'retreating';
                    }
                    
                    if (dist > 400) {
                        e.state = 'retreating';
                    }
                    break;
                    
                case 'retreating':
                    // Fly away and reset
                    const retreatX = e.x - dx * 0.5;
                    const retreatY = e.y - dy * 0.5;
                    const rd = Math.hypot(retreatX - e.x, retreatY - e.y);
                    if (rd > 0) {
                        e.vx += ((retreatX - e.x) / rd) * e.speed * delta;
                        e.vy += ((retreatY - e.y) / rd) * e.speed * delta;
                    }
                    
                    if (dist > 500) {
                        e.state = 'circling';
                        e.diveTimer = CONFIG.ENEMIES.SEAGULL.diveCooldown;
                        e.circleAngle = Math.random() * Math.PI * 2;
                    }
                    break;
            }
            
            // Apply velocity
            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.95;
            e.vy *= 0.95;
            
            // Clamp to world
            const B = CONFIG.WORLD;
            e.x = Utils.clamp(e.x, B.MIN_X, this.state.waterBoundaryX + 500);
            e.y = Utils.clamp(e.y, B.MIN_Y, B.MAX_Y);
        });
    },
    
    updateJumpingFish(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        const waterX = this.state.waterBoundaryX;
        const B = CONFIG.WORLD;

        for (let idx = this.state.enemies.length - 1; idx >= 0; idx--) {
            const e = this.state.enemies[idx];
            // Guard: revenge/escape/flop reassign state.enemies mid-loop,
            // so a later index can read past the new end (undefined).
            // Runs BOTH wild jumpers and hydra soldiers (same body logic,
            // separate type so their scripts never collide).
            if (!e || (e.enemyType !== 'jumpingFish' && e.enemyType !== 'hydraSoldier')) continue;

            // Revenge: ONLY jumpers that were alive for the death count.
            // die() restores HP instantly, so hp<=0 can never be observed
            // after — jumpers watch the death counter instead. But a stale
            // counter (died earlier with no jumpers around) must never wipe
            // FRESH spawns with a bogus "revenge" message: each jumper is
            // stamped at birth, and only pre-death jumpers are avenged.
            // Guilt needs proof, too: only jumpers that actually landed a
            // hit (didHurtPlayer) get "Revenge done" — the rest just flee.
            const deaths = this.state._deathSeq || 0;
            if (deaths > (this.state._jfAvengedSeq || 0)) {
                this.state._jfAvengedSeq = deaths;
                const guilty = (this.state.enemies || []).filter(en =>
                    en && en.enemyType === 'jumpingFish' && (en.bornDeathSeq || 0) < deaths);
                if (guilty.length) {
                    const guiltySet = new Set(guilty);
                    for (const g of guilty) {
                        Particles.showFloatingText(this.state,
                            g.didHurtPlayer ? 'Revenge done — back to the sea...' : 'Fish escaped back to sea...',
                            g.x, g.y - 30, '#38bdf8');
                    }
                    this.state.enemies = (this.state.enemies || []).filter(en => !guiltySet.has(en));
                    if (guiltySet.has(e)) continue;
                }
            }

            // Player died -> floppers escape back to the sea
            if (!p || p.isDead || p.hp <= 0) {
                Particles.showFloatingText(this.state, 'Fish escaped back to sea...', e.x, e.y - 30, '#38bdf8');
                this.state.enemies = this.state.enemies.filter(en => en !== e);
                continue;
            }

            if (this.tickStatus(e, delta)) continue;
            if (e.stunTimer > 0) continue;

            // Mid-air leap from the sea: parametric arc, no attacks, no
            // contact — it can't hurt you (or be body-blocked) until it lands.
            if (e.state === 'leaping') {
                e.jumpT = (e.jumpT || 0) + delta;
                const t = Math.min(1, e.jumpT / (e.jumpDur || 1));
                e.x = (e.sx || e.x) + ((e.tx || e.x) - (e.sx || e.x)) * t;
                e.y = (e.sy || e.y) + ((e.ty || e.y) - (e.sy || e.y)) * t;
                e.leapH = Math.sin(t * Math.PI);
                e.vx = ((e.tx || 0) - (e.sx || 0)) / (e.jumpDur || 1);
                e.vy = ((e.ty || 0) - (e.sy || 0)) / (e.jumpDur || 1);
                if (Math.random() < 0.5 && typeof Particles !== 'undefined') {
                    Particles.spawnWaterSplashes(this.state, e.x, e.y, 1);
                }
                e.y = Utils.clamp(e.y, B.MIN_Y + 20, B.MAX_Y - 20);
                if (t >= 1) {
                    // Crash landing: sand burst, then the land fight begins
                    e.state = 'onLand';
                    e.leapH = 0;
                    e.vx = 0; e.vy = 0;
                    e.hopTimer = 0.4;
                    e.hitCd = 0.5; // grace moment before it can bite
                    if (typeof Particles !== 'undefined') {
                        Particles.spawnParticles(this.state, e.x, e.y, '#fef3c7', 14);
                        Particles.showFloatingText(this.state, 'BEACHED!', e.x, e.y - 40, '#facc15');
                    }
                    try { audio.playSplash(); } catch (err) {}
                    this.state.screenShake = Math.max(this.state.screenShake || 0, 6);
                }
                continue;
            }

            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            const slowMult = e.freezeTimer > 0 ? 0.3 : 1.0;

            // Flop-hop toward the player
            e.hopTimer -= delta;
            if (e.hopTimer <= 0) {
                e.hopTimer = 0.7 + Math.random() * 0.5;
                e.vx += (dx / dist) * 220 * slowMult;
                e.vy += (dy / dist) * 220 * slowMult;
                if (typeof Particles !== 'undefined') Particles.spawnParticles(this.state, e.x, e.y, '#fef3c7', 3, { size: 2 });
            }

            e.hitCd = Math.max(0, (e.hitCd || 0) - delta);
            if (dist < 32 && e.hitCd <= 0) {
                this.hitPlayer(e);
                e.hitCd = 0.8;
            }

            // Full species skill kit — same cooldowns as hooked fish
            e.skillCooldown = (e.skillCooldown === undefined ? 2.0 : e.skillCooldown) - delta;
            if (e.skillCooldown <= 0) {
                const rarity = (e.species && e.species.rarity) || 'common';
                e.skillCooldown = { common: 4.0, rare: 2.8, epic: 2.0, legendary: 1.4, mythic: 0.9 }[rarity] || 3.0;
                if (typeof Fishing !== 'undefined' && Fishing.triggerSkill) {
                    try { Fishing.triggerSkill(this.state, e); } catch (err) {}
                }
            }
            if (e.rageTimer > 0) e.rageTimer -= delta;
            if (e.inflateTimer > 0) {
                e.inflateTimer -= delta;
                if (e.inflateTimer <= 0) e.isInflated = false;
            }

            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.90;
            e.vy *= 0.90;
            e.x = Utils.clamp(e.x, B.MIN_X + 20, waterX - 15);
            e.y = Utils.clamp(e.y, B.MIN_Y + 20, B.MAX_Y - 20);

            // Flops back to sea if ignored too long
            e.landTimer -= delta;
            if (e.landTimer <= 0) {
                Particles.showFloatingText(this.state, 'Fish flopped back to sea...', e.x, e.y - 30, '#94a3b8');
                this.state.enemies = this.state.enemies.filter(en => en !== e);
            }
        }
    },
    
    updateBeachCrabs(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        
        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'beachCrab') return;
            if (this.tickStatus(e, delta)) return;
            if (e.stunTimer > 0) return;

            e.burrowTimer -= delta;
            
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy);
            
            switch (e.state) {
                case 'walking':
                    if (e.burrowed) {
                        e.state = 'burrowed';
                        break;
                    }
                    
                    // Walk randomly on beach
                    if (e.walkTimer === undefined) e.walkTimer = 2 + Math.random() * 3;
                    e.walkTimer -= delta;
                    
                    if (e.walkTimer <= 0) {
                        e.walkTargetX = e.x + (Math.random() - 0.5) * 200;
                        e.walkTargetY = e.y + (Math.random() - 0.5) * 200;
                        e.walkTimer = 2 + Math.random() * 3;
                    }
                    
                    const wdx = e.walkTargetX - e.x;
                    const wdy = e.walkTargetY - e.y;
                    const wdist = Math.hypot(wdx, wdy);
                    
                    if (wdist > 0) {
                        e.vx += (wdx / wdist) * e.speed * delta;
                        e.vy += (wdy / wdist) * e.speed * delta;
                    }
                    
                    // Burrow
                    if (e.burrowTimer <= 0 && Math.random() < 0.01) {
                        e.state = 'burrowed';
                        e.burrowTimer = 5 + Math.random() * 5;
                    }
                    
                    // Charge player if close
                    if (dist < 150 && Math.random() < 0.005) {
                        e.state = 'charging';
                    }
                    break;
                    
                case 'charging':
                    if (dist > 0) {
                        e.vx += (dx / dist) * e.speed * 3 * delta;
                        e.vy += (dy / dist) * e.speed * 3 * delta;
                    }
                    
                    if (dist < 25) {
                        this.hitPlayer(e);
                        e.state = 'walking';
                    }
                    
                    if (dist > 300) {
                        e.state = 'walking';
                    }
                    break;
                    
                case 'burrowed':
                    // Immune to damage, wait
                    if (e.burrowTimer <= 0) {
                        e.burrowed = false;
                        e.state = 'walking';
                        e.burrowTimer = CONFIG.ENEMIES.BEACH_CRAB.burrowCooldown;
                    }
                    break;
            }
            
            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.9;
            e.vy *= 0.9;
            
            // Clamp to beach area
            const B = CONFIG.WORLD;
            const waterX = this.state.waterBoundaryX;
            e.x = Utils.clamp(e.x, B.MIN_X, waterX + 50);
            e.y = Utils.clamp(e.y, B.MIN_Y, B.MAX_Y);
        });
    },

    updateDuneBeetles(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        const cfg = CONFIG.ENEMIES.DUNE_BEETLE;

        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'duneBeetle') return;
            if (this.tickStatus(e, delta)) return;
            if (e.stunTimer > 0) return;

            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;

            if (e.state === 'walking') {
                // Slow armored patrol toward the player's side of the beach
                if (e.walkTimer === undefined) e.walkTimer = 0;
                e.walkTimer -= delta;
                if (e.walkTimer <= 0) {
                    e.walkTargetX = e.x + (dx / dist) * 160 + (Math.random() - 0.5) * 120;
                    e.walkTargetY = e.y + (dy / dist) * 160 + (Math.random() - 0.5) * 120;
                    e.walkTimer = 1.5 + Math.random() * 2;
                }
                const wdx = (e.walkTargetX || e.x) - e.x;
                const wdy = (e.walkTargetY || e.y) - e.y;
                const wd = Math.hypot(wdx, wdy);
                if (wd > 4) {
                    e.vx += (wdx / wd) * e.speed * delta;
                    e.vy += (wdy / wd) * e.speed * delta;
                }
                // Telegraph a horn dash when the angler is in range
                if (dist < 320 && dist > 60) {
                    e.state = 'telegraph';
                    e.telegraphT = 0.7;
                    e.chargeDx = dx / dist;
                    e.chargeDy = dy / dist;
                    Particles.showFloatingText(this.state, '❗ BEETLE CHARGE!', e.x, e.y - 40, '#f87171');
                    try { audio.playWhoosh(); } catch (err) {}
                } else if (dist < 30) {
                    this.hitPlayer(e);
                }
            } else if (e.state === 'telegraph') {
                // Planted feet, horn down, dust kicking — dodge NOW
                e.vx *= 0.85;
                e.vy *= 0.85;
                e.telegraphT -= delta;
                if (Math.random() < 0.4) {
                    Particles.spawnParticles(this.state, e.x, e.y + 10, '#d6b98c', 1, { size: 3 });
                }
                if (e.telegraphT <= 0) {
                    e.state = 'charging';
                    e.vx = e.chargeDx * (cfg.chargeSpeed || 320);
                    e.vy = e.chargeDy * (cfg.chargeSpeed || 320);
                    try { audio.playWhoosh(); } catch (err) {}
                }
            } else if (e.state === 'charging') {
                // Committed dash: friction bleed, wall = stop
                e.vx *= Math.pow(0.4, delta);
                e.vy *= Math.pow(0.4, delta);
                if (Math.random() < 0.6) {
                    Particles.spawnParticles(this.state, e.x, e.y + 8, '#d6b98c', 2, { size: 4 });
                }
                if (dist < 32) {
                    this.hitPlayer(e);
                    e.state = 'walking';
                    e.walkTimer = 0;
                } else if (Math.hypot(e.vx, e.vy) < 60) {
                    e.state = 'walking';
                    e.walkTimer = 0;
                }
            }

            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.92;
            e.vy *= 0.92;

            const B = CONFIG.WORLD;
            const waterX = this.state.waterBoundaryX;
            e.x = Utils.clamp(e.x, B.MIN_X, waterX - 20);
            e.y = Utils.clamp(e.y, B.MIN_Y, B.MAX_Y);
        });
    },

    updateSandUrchins(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;

        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'sandUrchin') return;
            if (this.tickStatus(e, delta)) return;
            if (e.stunTimer > 0) return;

            e.pulsePhase = (e.pulsePhase || 0) + delta * 2;
            e.volleyTimer -= delta;

            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;

            // Contact prick
            if (dist < 30) this.hitPlayer(e);

            // Radial spine volley (dodgeable gaps: fires 8, leaves lanes)
            if (e.volleyTimer <= 0 && dist < 560) {
                e.volleyTimer = (CONFIG.ENEMIES.LAND_URCHIN.volleyCooldown || 3.2) * (0.9 + Math.random() * 0.3);
                const off = Math.random() * Math.PI * 2;
                if (typeof Combat !== 'undefined' && Combat.spawnBullet) {
                    for (let i = 0; i < 8; i++) {
                        const a = off + (i / 8) * Math.PI * 2;
                        Combat.spawnBullet(this.state, e.x, e.y,
                            Math.cos(a) * 300, Math.sin(a) * 300,
                            { radius: 6, damage: e.damage, color: '#c084fc', life: 2.0 });
                    }
                }
                Particles.spawnParticles(this.state, e.x, e.y, '#c084fc', 10, { size: 3 });
                Particles.showFloatingText(this.state, 'SPINE RING!', e.x, e.y - 30, '#c084fc');
                try { audio.playSkillZap(); } catch (err) {}
            }
        });
    },
    
    hitPlayer(enemy) {
        const p = this.state.player;
        if (p.hp <= 0 || p.isDead) return;

        // Guilt stamp: this jumper actually drew blood, so a later death
        // is (partly) its fault — eligible for "Revenge done".
        if (enemy && enemy.enemyType === 'jumpingFish') enemy.didHurtPlayer = true;

        // Armor / umbrella aware (same mitigation as land monsters)
        let dealt = enemy.damage;
        if (typeof Combat !== 'undefined' && Combat.damagePlayer) {
            dealt = Combat.damagePlayer(this.state, enemy.damage, { knockback: 0 });
        } else {
            p.hp -= enemy.damage;
            Player.refreshHUD(this.state);
            if (p.hp <= 0) Player.die(this.state);
        }
        this.state.screenShake = Math.max(this.state.screenShake || 0, 8);
        try { audio.playHurt(); } catch (e) {}
        try { UI.triggerDamageFlash(); } catch (e2) {}
        Particles.showFloatingText(this.state, `-${dealt}`, p.x, p.y - 30, '#f87171');
    },

    // Called when enemy is killed by player
    onEnemyKilled(enemy) {
        // Living missiles just pop — no coins, no loot, no fanfare
        if (enemy.enemyType === 'gullMissile') {
            Particles.spawnParticles(this.state, enemy.x, enemy.y, '#e2e8f0', 8);
            this.state.enemies = this.state.enemies.filter(e => e !== enemy);
            return;
        }
        // Kill FX, scaled by victim tier: blood + kick for everything,
        // a sonic ring for elites and bosses.
        try {
            const rar = (enemy.species && enemy.species.rarity) || 'common';
            const elite = enemy.isBoss || rar === 'epic' || rar === 'legendary' || rar === 'mythic';
            const col = (enemy.species && enemy.species.color) || '#ef4444';
            if (typeof Particles !== 'undefined' && Particles.spawnBloodImpact) {
                Particles.spawnBloodImpact(this.state, enemy.x, enemy.y, col, enemy.isBoss ? 40 : (elite ? 22 : 12));
            }
            this.state.screenShake = Math.max(this.state.screenShake || 0, enemy.isBoss ? 20 : (elite ? 10 : 5));
            if (elite && typeof Combat !== 'undefined' && Combat.sonicBoom) {
                Combat.sonicBoom(this.state, enemy.x, enemy.y, {
                    color: col, rings: enemy.isBoss ? 4 : 2,
                    maxR: enemy.isBoss ? 300 : 150, shake: 0,
                    lines: enemy.isBoss ? 18 : 8,
                });
            }
        } catch (e) {}
        // Boss index: record the kill for BOTH sides (display only — the
        // host still owns awards/loot below, so nothing pays out twice).
        if (enemy.isBoss && this.state.player) {
            this.state.bossDeaths = 0; // won — chances reset
            try {
                if (!Array.isArray(this.state.player.slainBosses)) this.state.player.slainBosses = [];
                const bid = enemy.bossName ? enemy.bossName.toLowerCase() : enemy.enemyType;
                if (!this.state.player.slainBosses.includes(bid)) this.state.player.slainBosses.push(bid);
                // Stormcaller tribute: her Storm Egg drops where she falls
                if (enemy.enemyType === 'seagull' && typeof Ritual !== 'undefined' && Ritual.awardItem) {
                    Ritual.awardItem(this.state, 'storm_egg', enemy.x, enemy.y, 'Stormcaller tribute');
                }
            } catch (e) {}
        }
        // Tombstone FIRST so a lagged host snapshot can't resurrect this
        // kill into a paid-twice repeat (see Multiplayer.noteClaimed).
        // Rewards below are LOCAL: whoever's sim lands the killing blow
        // pays its own player the exact value — no shared award queue.
        try { if (typeof Multiplayer !== 'undefined' && Multiplayer.noteClaimed) Multiplayer.noteClaimed(enemy._mpid || enemy.id); } catch (e) {}
        // Miniboss down: storm breaks, big celebration, no meat loot
        if (enemy.isBoss) {
            this.state.screenShake = Math.max(this.state.screenShake || 0, 20);
            Particles.spawnParticles(this.state, enemy.x, enemy.y, '#f59e0b', 50, { size: 6 });
            Particles.spawnParticles(this.state, enemy.x, enemy.y, '#e2e8f0', 30, { size: 4 });
            Particles.showFloatingText(this.state, `⛈ ${(enemy.bossName || 'BOSS')} SLAIN! ⛈`, enemy.x, enemy.y - 70, '#f59e0b');
            try { audio.playBossKilled(); } catch (e) {}
        }
        // Every 20th gull calls down its mother (only while no boss lives).
        // Solo/host only: clients fight the host's shared Stormcaller
        // instead of raising their own.
        if (enemy.enemyType === 'seagull' && !enemy.isBoss && this.state.player) {
            this.state.player.seagullKills = ((this.state.player.seagullKills || 0) + 1);
            let canSummon = true;
            try {
                canSummon = !(typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
            } catch (e) {}
            if (this.state.player.seagullKills % 20 === 0 && canSummon && !this.gullBossActive()) {
                this.spawnGullBoss();
            }
            // Rarely shakes loose a Storm Egg (Hydra key) where it dies
            if (Math.random() < 0.06 && typeof Ritual !== 'undefined' && Ritual.awardItem) {
                Ritual.awardItem(this.state, 'storm_egg', enemy.x, enemy.y, 'gull dropped it');
            }
        }
        // Void Shards come ONLY from void-tainted jumpers (mutation).
        // Plain jumpers never carry one — hunt the purple glow.
        if ((enemy.enemyType === 'jumpingFish' || enemy.enemyType === 'hydraSoldier') && enemy.species && enemy.species.mutation === 'void' &&
            typeof Ritual !== 'undefined' && Ritual.awardItem) {
            Ritual.awardItem(this.state, 'shard', enemy.x, enemy.y, 'void jumper core');
        }
        // Award score and XP — LAST HIT GETS IT, locally and exactly.
        // No shared award queue (it re-paid merged totals every award and
        // minted thousands from seagulls). On the host sim, a crewmate's
        // killing blow pays NOBODY here: they already paid themselves on
        // their own sim the moment they landed it.
        if (this.state.player) {
            const killer = enemy._lastPid;
            const bossKill = !!enemy.isBoss;
            let remoteKill = false;
            try {
                remoteKill = !!(typeof Multiplayer !== 'undefined' && Multiplayer.isHost && killer &&
                    killer !== Multiplayer.localClientId && killer !== 'host' && killer !== 'solo');
            } catch (e) {}
            if (bossKill) {
                if (!remoteKill) {
                    this.state.player.coins += enemy.score || 0;
                    Particles.showFloatingText(this.state, `+${enemy.score || 0} coins!`, enemy.x, enemy.y - 30, '#facc15');
                }
                if (!remoteKill) Player.addXP(this.state, enemy.xp || 0);
                try { if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit(); } catch (e) {}
            } else if (!remoteKill) {
                // Ambient kills: XP + sellable carcass below. Coins come
                // from the SHOP — killing never mints money by itself.
                Player.addXP(this.state, enemy.xp || 0);
                Particles.showFloatingText(this.state, `+${enemy.xp || 0} XP`, enemy.x, enemy.y - 50, '#38bdf8');
            }

            // Check achievements (bosses count toward boss achievements)
            if (typeof Achievements !== 'undefined') {
                Achievements.checkEnemyKill(this.state, enemy.isBoss ? 'boss' : enemy.enemyType);
            }
        }

        // Sellable loot — seagulls & crabs drop meat, jumping fish drop
        // their real species. Pick it up and sell it in the shop like fish.
        if (!this.state.groundLoot) this.state.groundLoot = [];
        let loot = null;
        if (enemy.enemyType === 'seagull' && !enemy.isBoss) {
            loot = { id: 'seagull_meat', name: 'Seagull Meat', value: Math.max(15, enemy.score || 50), color: '#e2e8f0', rarity: 'common', size: 14 };
        } else if (enemy.enemyType === 'beachCrab') {
            loot = { id: 'crab_meat', name: 'Crab Meat', value: Math.max(20, enemy.score || 75), color: '#d97706', rarity: 'common', size: 16 };
        } else if (enemy.enemyType === 'duneBeetle') {
            loot = { id: 'beetle_chitin', name: 'Beetle Chitin', value: Math.max(40, enemy.score || 120), color: '#a8a29e', rarity: 'rare', size: 18 };
        } else if (enemy.enemyType === 'sandUrchin') {
            loot = { id: 'urchin_roe', name: 'Urchin Roe', value: Math.max(35, enemy.score || 100), color: '#c084fc', rarity: 'rare', size: 12 };
        } else if ((enemy.enemyType === 'jumpingFish' || enemy.enemyType === 'hydraSoldier') && enemy.species) {
            loot = enemy.species;
        }
        if (loot) {
            // Client-spawned carcasses are PERSONAL: tagged _local with a
            // collision-proof id so the host snapshot merge keeps them
            // (see syncLoot) instead of wiping them on the next tick.
            let lid = 'l' + (this.state._lootSeq = (this.state._lootSeq || 0) + 1);
            let local = false;
            try {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
                    local = true;
                    lid = 'lc' + Date.now().toString(36) + ((this.state._lootSeq % 1296).toString(36));
                }
            } catch (e) {}
            const drop = { id: lid, species: loot, x: enemy.x, y: enemy.y };
            if (local) drop._local = true;
            this.state.groundLoot.push(drop);
            Particles.showFloatingText(this.state, `+1 ${loot.name}!`, enemy.x, enemy.y - 65, '#34d399');
        }

        // Remove enemy
        this.state.enemies = this.state.enemies.filter(e => e !== enemy);
    }
};

// Seagull rendering (boss gets 2x scale + storm crown)
function renderSeagull(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const sc = e.isBoss ? 2 : 1;
    ctx.scale(sc, sc);
    
    const angle = Math.atan2(e.vy, e.vx);
    ctx.rotate(angle);
    
    // Body
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Wings
    const wingFlap = Math.sin(performance.now() / 100) * 0.5;
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.ellipse(-5, -8 * wingFlap, 25, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-5, 8 * wingFlap, 25, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Head
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(18, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Beak
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(32, -3);
    ctx.lineTo(32, 3);
    ctx.closePath();
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(20, -3, 2, 0, Math.PI * 2);
    ctx.fill();

    // Storm crown for the miniboss (drawn unrotated above the head)
    if (e.isBoss) {
        ctx.rotate(-angle);
        ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(-8, -14);
        ctx.lineTo(-8, -20); ctx.lineTo(-4, -16);
        ctx.lineTo(0, -22);  ctx.lineTo(4, -16);
        ctx.lineTo(8, -20);  ctx.lineTo(8, -14);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        // Enrage sparks
        if (e.enraged && Math.random() < 0.4) {
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc((Math.random() - 0.5) * 40, -18, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Hit flash
    if (e.hitFlash > 0) {
        ctx.fillStyle = `rgba(248,113,113,${e.hitFlash * 2})`;
        ctx.beginPath();
        ctx.arc(0, 0, e.isBoss ? 55 : 30, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// Living missile: a small gull, folded into a dart, trailing sparks
function renderGullMissile(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    // Speed lines
    ctx.strokeStyle = 'rgba(226,232,240,0.5)';
    ctx.lineWidth = 2;
    const spd = Math.hypot(e.vx || 0, e.vy || 0) || 1;
    ctx.beginPath();
    ctx.moveTo(-e.vx / spd * 34, -e.vy / spd * 34);
    ctx.lineTo(-e.vx / spd * 14, -e.vy / spd * 14);
    ctx.stroke();
    const angle = Math.atan2(e.vy, e.vx);
    ctx.rotate(angle);
    ctx.scale(0.62, 0.62);
    // Folded body (dart profile)
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Swept wings
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(-2, 0); ctx.lineTo(-22, -12); ctx.lineTo(-16, 0); ctx.lineTo(-22, 12);
    ctx.closePath();
    ctx.fill();
    // Beak first
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(28, -3); ctx.lineTo(28, 3);
    ctx.closePath();
    ctx.fill();
    // Angry eye
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(12, -3, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // Fuse spark
    ctx.fillStyle = '#fde047';
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(-20, 0, 3 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Jumping Fish rendering (uses fish model)
function renderJumpingFish(ctx, e) {
    if (e.species && typeof Render !== 'undefined') {
        const h = e.leapH || 0;
        // Ground shadow while airborne — sells the arc in top-down view
        if (h > 0.02) {
            ctx.save();
            ctx.globalAlpha = 0.35 * (1 - h * 0.5);
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(e.x, e.y, (e.species.size || 16) * 0.7, (e.species.size || 16) * 0.45, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        let ang = Math.atan2(e.vy, e.vx);
        if (e.state === 'leaping' && e.jumpDur) {
            // Full barrel roll across the leap
            const t = Math.min(1, (e.jumpT || 0) / e.jumpDur);
            ang += t * Math.PI * 2;
        }
        Render.drawFishModel(ctx, e.x, e.y - h * 70, (e.species.size || 16) * 0.8 * (1 + h * 0.5), e.species, {
            angle: ang,
            glow: e.hitFlash
        });
        // Mutation auras: void-tainted jumpers pulse purple (shard carriers)
        const mut = e.species.mutation;
        if (mut === 'void' || mut === 'golden' || mut === 'giant') {
            const col = mut === 'void' ? '#a855f7' : mut === 'golden' ? '#fde047' : '#fb923c';
            ctx.save();
            ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 180) * 0.25;
            ctx.strokeStyle = col;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = col;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(e.x, e.y - h * 70, (e.species.size || 16) * 1.1, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

// Beach Crab rendering
function renderBeachCrab(ctx, e) {
    const t = Date.now() / 1000;
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.burrowed) {
        // Sand mound with cracks + watching eyes
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(3, 5, 24, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        const mound = ctx.createLinearGradient(0, -14, 0, 6);
        mound.addColorStop(0, '#d6a45c');
        mound.addColorStop(1, '#8a5a2b');
        ctx.fillStyle = mound;
        ctx.beginPath();
        ctx.ellipse(0, -2, 22, 12, 0, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,35,15,0.6)';
        ctx.lineWidth = 1.5;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 8, -12);
            ctx.quadraticCurveTo(i * 8 + 3, -6, i * 8 - 2, -2);
            ctx.stroke();
        }
        // Eyes track the player
        const look = Math.max(-3, Math.min(3, ((e._lookX || 0))));
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.arc(-6 + look, -12, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(6 + look, -12, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath(); ctx.arc(-6 + look + 1, -13, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(6 + look + 1, -13, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
    }

    // Shadow grounds the body
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 26, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const ang = Math.atan2(e.vy || 0, e.vx || 0);
    const moving = Math.hypot(e.vx || 0, e.vy || 0) > 12;
    const stepping = moving ? Math.sin(t * 14) : 0;
    ctx.rotate(Number.isFinite(ang) && moving ? ang : 0);
    const charging = e.state === 'charging';
    const squash = charging ? 1.08 : 1 + Math.sin(t * 6) * 0.02;

    // Walking legs (4 pairs, alternating gait, animated)
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 4; i++) {
            const phase = stepping * (i % 2 === 0 ? 1 : -1) * side;
            const bx = -10 + i * 7;
            ctx.beginPath();
            ctx.moveTo(bx, side * 10);
            ctx.quadraticCurveTo(bx - 4, side * 18, bx - 8 + phase * 4, side * 24);
            ctx.stroke();
        }
    }

    // Main carapace: layered dome with ridge spikes
    const shell = ctx.createLinearGradient(0, -18, 0, 16);
    shell.addColorStop(0, '#f59e0b');
    shell.addColorStop(0.55, '#c2410c');
    shell.addColorStop(1, '#7c2d12');
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24 * squash, 17 / squash, 0, 0, Math.PI * 2);
    ctx.fill();
    // Carapace plates
    ctx.strokeStyle = 'rgba(67,20,7,0.55)';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 8, 0, 7, 13, i * 0.25, 0, Math.PI * 2);
        ctx.stroke();
    }
    // Dorsal spikes
    ctx.fillStyle = '#431407';
    for (let i = -2; i <= 2; i++) {
        const sx = i * 9;
        ctx.beginPath();
        ctx.moveTo(sx - 4, -12);
        ctx.lineTo(sx, -22 - (i % 2 === 0 ? 3 : 0));
        ctx.lineTo(sx + 4, -12);
        ctx.closePath();
        ctx.fill();
    }
    // Rim highlight
    ctx.strokeStyle = 'rgba(253,230,138,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -2, 21, 13, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // Crusher claw (big, right) + cutter claw (small, left)
    const snap = charging ? 0.5 + Math.sin(t * 20) * 0.2 : 0.9;
    const drawClaw = (side, size, color) => {
        const cx = 24 * side;
        ctx.save();
        ctx.translate(cx, side * 6);
        ctx.rotate(side * (charging ? -0.3 : 0.15));
        // Arm
        ctx.strokeStyle = '#9a3412';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(size * 0.6, side * 4, size * 0.9, side * 2);
        ctx.stroke();
        // Pincer: fixed finger + moving finger
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(size * 0.9, side * 2);
        ctx.quadraticCurveTo(size * 1.7, side * 2 - 6, size * 1.9, side * 2 - 12);
        ctx.quadraticCurveTo(size * 1.5, side * 2 - 4, size * 0.9, side * 2 + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7c2d12';
        const open = (1 - snap) * 10;
        ctx.beginPath();
        ctx.moveTo(size * 0.9, side * 2 + 2);
        ctx.quadraticCurveTo(size * 1.6, side * 2 + 6 + open, size * 1.8, side * 2 + 12 + open);
        ctx.quadraticCurveTo(size * 1.3, side * 2 + 6, size * 0.9, side * 2 + 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };
    drawClaw(1, 14, '#ea580c');
    drawClaw(-1, 10, '#c2410c');

    // Eye stalks (front = +x after rotation)
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(18, s * 7);
        ctx.lineTo(26, s * 10);
        ctx.stroke();
    }
    for (const s of [-1, 1]) {
        const blink = (Math.sin(t * 0.7 + s) > 0.97) ? 0.15 : 1;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.arc(27, s * 10, 4.5 * blink + 0.5, 0, Math.PI * 2); ctx.fill();
        if (blink > 0.5) {
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath(); ctx.arc(28.5, s * 10 - 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(26, s * 10 + 1, 1, 0, Math.PI * 2); ctx.fill();
        }
    }
    // Charging telegraph glow
    if (charging) {
        ctx.strokeStyle = `rgba(239,68,68,${0.5 + Math.sin(t * 16) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, 34, 26, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Hit flash
    if (e.hitFlash > 0) {
        ctx.fillStyle = `rgba(248,113,113,${Math.min(0.8, e.hitFlash * 2)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 30, 24, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function renderDuneBeetle(ctx, e) {
    const t = Date.now() / 1000;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    const ang = Math.atan2(e.vy || 0, e.vx || 0);
    const moving = Math.hypot(e.vx || 0, e.vy || 0) > 20 || e.state === 'charging';
    ctx.rotate(Number.isFinite(ang) && (moving || e.state !== 'walking') ? ang : (e.faceA || 0));
    const telegraph = e.state === 'telegraph';
    const throb = telegraph ? 1 + Math.sin(t * 24) * 0.05 : 1;

    // Six digging legs
    ctx.strokeStyle = '#44403c';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    const gait = moving ? Math.sin(t * 12) : 0;
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 3; i++) {
            const phase = gait * (i % 2 === 0 ? 1 : -1);
            const bx = -12 + i * 10;
            ctx.beginPath();
            ctx.moveTo(bx, side * 12);
            ctx.quadraticCurveTo(bx - 6, side * 22, bx - 10 + phase * 5, side * 30);
            ctx.stroke();
        }
    }

    // Armored elytra (wing cases) with bronze seams
    const shell = ctx.createLinearGradient(0, -20, 0, 18);
    shell.addColorStop(0, '#78716c');
    shell.addColorStop(0.5, '#57534e');
    shell.addColorStop(1, '#292524');
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30 * throb, 18 * throb, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d6a45c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(0, 17);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,164,92,0.5)';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 4, -14);
        ctx.quadraticCurveTo(s * 14, 0, s * 4, 14);
        ctx.stroke();
    }
    // Horn (front): curved rhino horn, glows when telegraphing
    ctx.save();
    ctx.translate(28, 0);
    const hornGrad = ctx.createLinearGradient(0, 0, 26, 0);
    hornGrad.addColorStop(0, '#a8a29e');
    hornGrad.addColorStop(1, telegraph ? '#ef4444' : '#e7e5e4');
    ctx.fillStyle = hornGrad;
    ctx.shadowColor = telegraph ? '#ef4444' : 'transparent';
    ctx.shadowBlur = telegraph ? 16 : 0;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(18, -8, 28, -16);
    ctx.quadraticCurveTo(22, -2, 26, 6);
    ctx.quadraticCurveTo(12, 4, 0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Head + mandibles
    ctx.fillStyle = '#44403c';
    ctx.beginPath();
    ctx.ellipse(20, 0, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(26, s * 4);
        ctx.quadraticCurveTo(34, s * 8, 32, s * 14);
        ctx.stroke();
    }
    // Eyes
    ctx.fillStyle = telegraph ? '#ef4444' : '#fbbf24';
    ctx.beginPath(); ctx.arc(22, -5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(22, 5, 3, 0, Math.PI * 2); ctx.fill();

    if (e.hitFlash > 0) {
        ctx.fillStyle = `rgba(248,113,113,${Math.min(0.8, e.hitFlash * 2)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, 34, 24, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function renderSandUrchin(ctx, e) {
    const t = Date.now() / 1000;
    const pulse = 1 + Math.sin((e.pulsePhase || t * 2)) * 0.06;
    ctx.save();
    ctx.translate(e.x, e.y);

    // Shadow + sandy mound base
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.ellipse(0, 6, 18, 8, 0, Math.PI, 0);
    ctx.fill();

    // Spines: two rings, slowly rotating, tips glow before a volley
    const winding = e.volleyTimer < 0.8;
    const rot = t * 0.4;
    for (let ring = 0; ring < 2; ring++) {
        const n = ring === 0 ? 12 : 8;
        const len = (ring === 0 ? 26 : 18) * pulse;
        for (let i = 0; i < n; i++) {
            const a = rot + ring * 0.4 + (i / n) * Math.PI * 2;
            const x0 = Math.cos(a) * 8, y0 = Math.sin(a) * 8 - 4;
            const x1 = Math.cos(a) * (8 + len), y1 = Math.sin(a) * (8 + len) - 4;
            ctx.strokeStyle = winding ? '#f0abfc' : (ring === 0 ? '#7e22ce' : '#a855f7');
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.shadowColor = winding ? '#e879f9' : 'transparent';
            ctx.shadowBlur = winding ? 10 : 0;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    // Core: pulsing purple dome with nucleus
    const core = ctx.createRadialGradient(0, -8, 2, 0, -4, 16);
    core.addColorStop(0, '#f5d0fe');
    core.addColorStop(0.5, '#a855f7');
    core.addColorStop(1, '#581c87');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, -4, 12 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(t * 3) * 0.3})`;
    ctx.beginPath();
    ctx.arc(-3, -8, 3, 0, Math.PI * 2);
    ctx.fill();

    if (e.hitFlash > 0) {
        ctx.fillStyle = `rgba(248,113,113,${Math.min(0.8, e.hitFlash * 2)})`;
        ctx.beginPath();
        ctx.arc(0, -4, 26, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// Register renderers globally
window.renderSeagull = renderSeagull;
window.renderGullMissile = renderGullMissile;
window.renderJumpingFish = renderJumpingFish;
window.renderBeachCrab = renderBeachCrab;
window.renderDuneBeetle = renderDuneBeetle;
window.renderSandUrchin = renderSandUrchin;
window.EnemySpawner = EnemySpawner;