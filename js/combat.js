const Combat = {
    // Armor + umbrella mitigation shared by all enemy damage
    damagePlayer(state, raw, opts = {}) {
        const p = state.player;
        if (p.isDead) return 0;
        let dmg = Math.max(1, Math.round(raw));
        let dr = 0;
        if (typeof Shop !== 'undefined' && Shop.getDamageReduction) {
            try { dr = Shop.getDamageReduction(state); } catch (e) {}
        }
        if (p.umbrellaTimer > 0) dr = Math.min(0.8, dr + 0.35);
        dmg = Math.max(1, Math.round(dmg * (1 - dr)));
        if (p.armorAnchor && opts.knockback) opts.knockback = 0;
        p.hp -= dmg;
        // Reflect back to attacker
        if (opts.attacker && p.armorReflect > 0) {
            opts.attacker.hp -= Math.round(raw * p.armorReflect);
        }
        Player.refreshHUD(state);
        UI.triggerDamageFlash();
        if (p.hp <= 0) Player.die(state);
        return dmg;
    },
    // ============================================================
    //  MAIN UPDATE
    // ============================================================
    update(state, delta) {
        const p = state.player;
        const B = CONFIG.WORLD;

        if (!state.groundHazards) state.groundHazards = [];
        if (!state.monstersOnLand) state.monstersOnLand = [];
        if (!state.bullets) state.bullets = [];
        if (!state.groundLoot) state.groundLoot = [];
        if (!state.delayedBlasts) state.delayedBlasts = [];

        // Boss theme follows boss life: silence it when nothing bossy
        // remains (death, escape, load). Cheap, fully guarded.
        try {
            if (typeof audio !== 'undefined' && audio._bossTheme &&
                typeof Ritual !== 'undefined' && Ritual.bossAlive && !Ritual.bossAlive(state)) {
                audio.stopBossTheme();
            }
        } catch (e) {}
        // Pending intro crossfade: when the camera lock expires, fade the
        // tide music out and the boss theme in — but only if the boss is
        // still alive and the player is still standing.
        try {
            if (typeof state._bossThemeAt === 'number' && state.time >= state._bossThemeAt) {
                state._bossThemeAt = null;
                const pAlive = state.player && !state.player.isDead && (state.player.hp || 0) > 0;
                if (pAlive && typeof Ritual !== 'undefined' && Ritual.bossAlive && Ritual.bossAlive(state) &&
                    typeof audio !== 'undefined' && !audio._bossTheme) {
                    try { audio.stopMusic(); } catch (e) {}
                    try { if (typeof audio.startBossTheme === 'function') audio.startBossTheme(); } catch (e) {}
                }
            } else if (typeof state._bossThemeAt === 'number' &&
                typeof Ritual !== 'undefined' && Ritual.bossAlive && !Ritual.bossAlive(state)) {
                state._bossThemeAt = null; // boss died mid-intro: no theme
            }
        } catch (e) {}

        // MP clients render the host's world: monster death + loot are
        // host-owned (prevents double kills / double loot).
        const isMPClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());

        // Enemy-bullet sim is host-owned; clients only take the hits (intake)
        if (!isMPClient) this.updateBullets(state, delta);
        this.updateDelayedBlasts(state, delta);
        this.updateGroundHazards(state, delta);
        this.updatePlayerStatus(state, delta);

        if (p.isDead || p.hp <= 0) return;

        // Co-op client: the host simulates ALL shared entities. The client
        // only takes damage from them (identical positions = identical view).
        if (isMPClient) {
            this.applyClientIntake(state, delta);
            this.updateGroundLoot(state);
            return;
        }

        for (let i = state.monstersOnLand.length - 1; i >= 0; i--) {
            const m = state.monstersOnLand[i];

            // --- Boss intro tracking ---
            if (m.species.isBoss && !m._announced) {
                m._announced = true;
                state.activeBoss = m;
                // Full cinematic (pad summons already played it in spawnBoss,
                // beached/hooked bosses arrive here).
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.bossIntro) Ritual.bossIntro(state, m.species, m.x, m.y, m);
                    else {
                        try { audio.playRoar(); } catch (e) {}
                        Particles.showFloatingText(state,
                            `⚠ ${m.species.name.toUpperCase()} HAS ARRIVED ⚠`,
                            m.x, m.y - 90, '#f59e0b');
                        state.screenShake = 20;
                    }
                } catch (e) {}
            }

            // --- Death ---
            if (m.hp <= 0) {
                if (isMPClient) continue; // host owns death + loot
                Particles.spawnBloodImpact(state, m.x, m.y, '#ef4444', 30);
                const isBoss = m.species.isBoss ||
                               m.species.rarity === 'legendary' ||
                               m.species.rarity === 'mythic';
                state.screenShake = isBoss ? 14 : 5;

                try {
                    if (isBoss) audio.playBossKilled();
                    else audio.playFishDeath();
                } catch (e) {}

                if (isBoss) {
                    Particles.spawnParticles(state, m.x, m.y, '#f59e0b', 35);
                    state.delayedBlasts.push({
                        x: m.x, y: m.y, radius: 120,
                        damage: 0, timer: 0.35, color: '#f59e0b',
                        shake: 18, leaveHazard: true,
                        hazardType: 'fire', hazardDps: 8, hazardDuration: 2.5
                    });
                    try { audio.playExplosion(); } catch (e) {}
                }

                if (m.species.isBoss) {
                    state.activeBoss = null;
                    state.bossDeaths = 0; // won — chances reset
                    // Boss index: kill counts even if the loot is never picked up
                    try {
                        if (!Array.isArray(state.player.slainBosses)) state.player.slainBosses = [];
                        if (!state.player.slainBosses.includes(m.species.id)) state.player.slainBosses.push(m.species.id);
                        if (typeof Achievements !== 'undefined') Achievements.checkEnemyKill(state, 'boss');
                        // Boss tribute: 100% trophy drop (Emperor gate).
                        // Priest -> Chalice, Hydra -> Fang, Shepherd -> Eye.
                        // Drops where the boss fell — walk over it.
                        if (typeof Ritual !== 'undefined' && Ritual.awardItem && typeof TROPHY_OF !== 'undefined' && TROPHY_OF[m.species.id]) {
                            Ritual.awardItem(state, TROPHY_OF[m.species.id], m.x, m.y, 'boss tribute');
                        }
                        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                    } catch (e) {}
                    UI.updateStatusBanner(`${m.species.name} has fallen!`, 'Victory', 'emerald');
                }

                state.groundLoot.push({ id: 'l' + (state._lootSeq = (state._lootSeq || 0) + 1), species: m.species, x: m.x, y: m.y });
                state.monstersOnLand.splice(i, 1);
                continue;
            }

            // --- Init AI fields ---
            if (!m.aiState) m.aiState = 'APPROACH';
            if (m.skillCooldown === undefined) m.skillCooldown = 2.0;
            if (m.actionTimer === undefined) m.actionTimer = 0;
            if (m.meleeCd === undefined) m.meleeCd = 0;
            if (m.enrageTimer === undefined) m.enrageTimer = 0;
            if (m.ageOnLand === undefined) m.ageOnLand = 0;
            if (m.comboCount === undefined) m.comboCount = 0;
            if (m.phase === undefined) m.phase = 1;

            // --- Intro dormancy: a freshly arrived boss stands down (no
            // movement, no skills, no contact) until its cinematic releases.
            if (m.dormantUntil && state.time < m.dormantUntil) {
                if (m.invulnerableTimer > 0) m.invulnerableTimer -= delta;
                continue;
            }

            m.ageOnLand += delta;
            m.skillCooldown -= delta;
            m.actionTimer -= delta;
            m.meleeCd -= delta;
            if (m.stealthTimer > 0) m.stealthTimer -= delta;
            if (m.invulnerableTimer > 0) m.invulnerableTimer -= delta;
            if (m.enrageTimer > 0) {
                m.enrageTimer -= delta;
                if (m.enrageTimer <= 0) m.isEnraged = false;
            }

            // --- Phase 2: enrage at < 40% HP ---
            const hpRatio = m.hp / (m.maxHp || m.species.maxHp || 100);
            if (m.phase === 1 && hpRatio < 0.4) {
                m.phase = 2;
                m.isEnraged = true;
                m.enrageTimer = 999;
                state.screenShake = 14;
                Particles.spawnParticles(state, m.x, m.y, '#dc2626', 40, { size: 6 });
                Particles.showFloatingText(state, "⚠ ENRAGED! ⚠", m.x, m.y - 60, '#dc2626');
                try { audio.playRoar(); } catch (e) {}
            }

            const dx = p.x - m.x;
            const dy = p.y - m.y;
            const dist = Math.hypot(dx, dy) || 1;
            m.angle = Math.atan2(dy, dx);

            this.updateMonsterAI(state, m, p, dist, dx, dy, delta);

            // --- Status Effects on Monsters ---
            // Burn damage (all burn weapons, incl. water-applied)
            if (m.burnTimer > 0) {
                m.burnTimer -= delta;
                const burnDps = m.burnDps || 12;
                m.hp -= burnDps * delta;
                if (Math.random() < 0.25) {
                    Particles.spawnParticles(state, m.x, m.y, '#f97316', 1, { size: 3 });
                }
            }
            // Poison damage
            if (m.poisonTimer > 0) {
                m.poisonTimer -= delta;
                const poisonDps = m.poisonDps || 10;
                m.hp -= poisonDps * delta;
                if (Math.random() < 0.1) {
                    Particles.showFloatingText(state, `-${Math.round(poisonDps * delta)}`, m.x, m.y - 25, '#84cc16');
                }
            }

            // Freeze/slow effect
            if (m.freezeTimer > 0) {
                m.freezeTimer -= delta;
                m.slowed = true;
            } else {
                m.slowed = false;
            }

            // Stun effect
            if (m.stunTimer > 0) {
                m.stunTimer -= delta;
            }

            const size = m.species.size || 20;
            m.x = Utils.clamp(m.x, B.MIN_X + size, state.waterBoundaryX - size);
            m.y = Utils.clamp(m.y, B.MIN_Y + size, B.MAX_Y - size);

            // --- Contact damage ---
            const hitDist = (p.radius || 15) + size;
            if (dist < hitDist && m.meleeCd <= 0) {
                this.handleDirectMeleeContact(state, m, p, dist, dx, dy);
                m.meleeCd = 0.6;
            }
        }

        this.updateGroundLoot(state);
    },

    // ============================================================
    //  DELAYED BLASTS
    // ============================================================
    updateDelayedBlasts(state, delta) {
        if (!state.delayedBlasts) state.delayedBlasts = [];
        const p = state.player;

        for (let i = state.delayedBlasts.length - 1; i >= 0; i--) {
            const b = state.delayedBlasts[i];
            b.timer -= delta;

            if (Math.random() < 0.6) {
                Particles.spawnParticles(state,
                    b.x + (Math.random() - 0.5) * b.radius * 1.6,
                    b.y + (Math.random() - 0.5) * b.radius * 1.6,
                    b.color, 1, { size: 3 });
            }

            if (b.timer <= 0) {
                const dist = Math.hypot(p.x - b.x, p.y - b.y);
                if (b.damage > 0 && dist < b.radius + (p.radius || 15)) {
                    // Armor counts here too (was raw hp-=, unfair).
                    // damagePlayer handles HUD + flash + death — never die() twice.
                    const dealt = this.damagePlayer(state, b.damage, { knockback: 0 });
                    Particles.showFloatingText(state, `-${dealt}`,
                        p.x, p.y - 25, b.color);
                    Player.refreshHUD(state);
                    try { audio.playHurt(); } catch (e) {}
                    // Telegraph-ring stuns (roar / chain): only if you stood in it
                    if (b.stunOnBlast && (p.hp || 0) > 0) {
                        p.stunTimer = Math.max(p.stunTimer || 0, b.stunOnBlast);
                    }
                }
                state.screenShake = Math.max(state.screenShake, b.shake || 8);
                Particles.spawnParticles(state, b.x, b.y, b.color, 18, { size: 6 });

                // Sound per blast type
                try {
                    const c = (b.color || '').toLowerCase();
                    if (b.shake && b.shake >= 14) audio.playExplosion();
                    else if (c.includes('22d3ee') || c.includes('67e8f9')) audio.playIceCrack();
                    else if (c.includes('7e22ce') || c.includes('a855f7')) audio.playThunder();
                    else if (c.includes('facc15') || c.includes('fde047')) audio.playThunder();
                    else audio.playHit();
                } catch (e) {}

                // Custom callback for summoner skills
                if (typeof b.onDetonate === 'function') {
                    try { b.onDetonate(); } catch (e) { console.warn('onDetonate error', e); }
                }

                if (b.leaveHazard) {
                    state.groundHazards.push({
                        x: b.x, y: b.y,
                        radius: b.radius * 0.8,
                        duration: b.hazardDuration || 2.5,
                        type: b.hazardType || 'fire',
                        damagePerSec: b.hazardDps || 12,
                        color: b.color
                    });
                }

                state.delayedBlasts.splice(i, 1);
            }
        }
    },

    // Co-op damage intake: host owns positions/AI, the client only checks
    // "is a synced threat touching me?" — same positions, same damage.
    _intakeCd() {
        if (!this._clientHitCd || Object.keys(this._clientHitCd).length > 300) {
            this._clientHitCd = {};
        }
        return this._clientHitCd;
    },

    applyClientIntake(state, delta) {
        void delta;
        const p = state.player;
        if (!p || p.isDead || p.hp <= 0) return;
        const cd = this._intakeCd();
        const now = state.time || 0;

        // Beached monsters — same contact rule as the host melee pass
        for (const m of (state.monstersOnLand || [])) {
            if (!m.species || m.hp <= 0) continue;
            const size = m.species.size || 20;
            const dx = p.x - m.x, dy = p.y - m.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < (p.radius || 15) + size) {
                const key = 'm:' + m.id;
                if ((cd[key] || 0) > now) continue;
                cd[key] = now + 0.6;
                this.handleDirectMeleeContact(state, m, p, dist, dx, dy);
                if (p.hp <= 0) return;
            }
        }

        // Open-world enemies touching the player
        for (const e of (state.enemies || [])) {
            if (e.hp <= 0 || e.burrowed || e.state === 'burrowed') continue;
            // Living missiles detonate host-side; the client takes the hit
            // once per missile id (host owns the lifecycle/removal).
            if (e.enemyType === 'gullMissile') {
                if (!e.id || cd['m:' + e.id]) continue;
                if (Math.hypot(p.x - e.x, p.y - e.y) < (p.radius || 15) + 12) {
                    cd['m:' + e.id] = 1;
                    const dealt = this.damagePlayer(state, e.damage || 35);
                    Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25, '#f97316');
                    Particles.spawnParticles(state, p.x, p.y, '#f97316', 10, { size: 5 });
                    state.screenShake = Math.max(state.screenShake, 10);
                    try { audio.playHurt(); } catch (err) {}
                    if (p.hp <= 0) return;
                }
                continue;
            }
            const er = e.isBoss ? 44 : e.enemyType === 'seagull' ? 22 : e.enemyType === 'beachCrab' ? 24 : 30;
            const dist = Math.hypot(p.x - e.x, p.y - e.y);
            if (dist < (p.radius || 15) + er) {
                const key = 'e:' + (e.id || e.enemyType);
                if ((cd[key] || 0) > now) continue;
                cd[key] = now + 0.8;
                const dealt = this.damagePlayer(state, e.damage || 10);
                try { audio.playHurt(); } catch (err) {}
                Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25, '#f43f5e');
                if (p.hp <= 0) return;
            }
        }

        // Host enemy bullets — hit once per bullet id (never despawned locally;
        // the host owns the bullet lifecycle)
        for (const b of (state.bullets || [])) {
            if (b.owner !== 'enemy' || !b.id || cd['b:' + b.id]) continue;
            const dist = Math.hypot(p.x - b.x, p.y - b.y);
            if (dist < (p.radius || 15) + (b.radius || 6)) {
                cd['b:' + b.id] = 1;
                const dealt = this.damagePlayer(state, b.damage || 5);
                Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25, b.color || '#facc15');
                Particles.spawnParticles(state, b.x, b.y, b.color || '#facc15', 6);
                try { audio.playHurt(); } catch (err) {}
                state.screenShake = Math.max(state.screenShake, 6);
                if (p.hp <= 0) return;
            }
        }

        // Host fish-skill projectiles — same one-hit-per-id rule
        for (const b of (state.projectiles || [])) {
            if (!b.id || cd['p:' + b.id]) continue;
            const dist = Math.hypot(p.x - b.x, p.y - b.y);
            if (dist < (p.radius || 15) + (b.radius || 8)) {
                cd['p:' + b.id] = 1;
                const dealt = this.damagePlayer(state, b.damage || 5);
                Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25, b.color || '#facc15');
                Particles.spawnParticles(state, p.x, p.y, b.color || '#facc15', 6);
                try { audio.playHurt(); } catch (err) {}
                if (p.hp <= 0) return;
            }
        }
    },

    // ============================================================
    //  BULLETS
    // ============================================================
    updateBullets(state, delta) {
        const p = state.player;
        const B = CONFIG.WORLD;
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            if (b.owner === 'player') continue;

            // Summoned minion behavior: slow homing
            if (b.isSummon && b.homing) {
                const a = Math.atan2(p.y - b.y, p.x - b.x);
                b.vx += Math.cos(a) * (b.homingForce || 200) * delta;
                b.vy += Math.sin(a) * (b.homingForce || 200) * delta;
                const spd = Math.hypot(b.vx, b.vy);
                const MAX_SPD = 220;
                if (spd > MAX_SPD) {
                    b.vx = (b.vx / spd) * MAX_SPD;
                    b.vy = (b.vy / spd) * MAX_SPD;
                }
            }

            b.x += b.vx * delta;
            b.y += b.vy * delta;
            b.life -= delta;

            if (b.trail) {
                b.trail.push({ x: b.x, y: b.y });
                if (b.trail.length > 8) b.trail.shift();
            }

            if (Math.random() < 0.2) {
                Particles.spawnParticles(state, b.x, b.y,
                    b.color || '#facc15', 1, { size: 2 });
            }

            // Emberlings drop fire trails
            if (b.leavesFireTrail && Math.random() < 0.15) {
                state.groundHazards.push({
                    x: b.x, y: b.y, radius: 30, duration: 1.5,
                    type: 'fire', damagePerSec: 10, color: '#f59e0b'
                });
            }

            const dist = Math.hypot(p.x - b.x, p.y - b.y);
            if (dist < (p.radius || 15) + (b.radius || 6)) {
                const dealt = this.damagePlayer(state, b.damage || 5);
                Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25,
                    b.color || '#facc15');
                Player.refreshHUD(state);
                UI.triggerDamageFlash();
                state.screenShake = Math.max(state.screenShake, 6);
                Particles.spawnParticles(state, b.x, b.y, b.color || '#facc15', 8);
                try { audio.playHurt(); } catch (e) {}
                state.bullets.splice(i, 1);
                if (p.hp <= 0) Player.die(state);
                continue;
            }

            if (b.life <= 0 || b.x < B.MIN_X || b.x > B.MAX_X ||
                b.y < B.MIN_Y || b.y > B.MAX_Y) {
                state.bullets.splice(i, 1);
            }
        }
    },

    spawnBullet(state, x, y, vx, vy, opts = {}) {
        state.bullets.push({
            id: 'e' + (state._ebSeq = (state._ebSeq || 0) + 1),
            x, y, vx, vy,
            owner: 'enemy',
            radius: opts.radius || 7,
            damage: opts.damage || 5,
            color: opts.color || '#facc15',
            life: opts.life || 2.5,
            trail: [],
            isSummon: !!opts.isSummon,
            homing: !!opts.homing,
            homingForce: opts.homingForce || 200,
            leavesFireTrail: !!opts.leavesFireTrail
        });
    },

    // ============================================================
    //  IMPROVED BOSS AI
    // ============================================================
    updateMonsterAI(state, m, p, dist, dx, dy, delta) {
        // Status effect modifiers
        const isStunned = m.stunTimer > 0;
        const isSlowed = m.slowed === true;
        
        if (isStunned) return; // Stunned monsters don't move or act
        
        const slowMult = isSlowed ? 0.3 : 1.0;
        const baseSpeed = (m.species.speed || 4) * 22;
        const speedMult =
            (m.isEnraged ? 1.45 : 1.0) *
            (m.stealthTimer > 0 ? 1.25 : 1.0) *
            (m.phase === 2 ? 1.15 : 1.0) *
            slowMult;
        const spd = baseSpeed * speedMult;

        const dirX = dx / dist;
        const dirY = dy / dist;

        const rarity = m.species.rarity || 'common';
        const prefDist = ({
            common: 0, rare: 90, epic: 120, legendary: 140, mythic: 160,
            boss: 200
        })[rarity] ?? 0;

        const rangeTolerance = 40;
        const aggressionTier = ({
            common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4,
            boss: 5
        })[rarity] ?? 0;

        switch (m.aiState) {
            case 'APPROACH': {
                m.x += dirX * spd * delta;
                m.y += dirY * spd * delta;

                if (dist < prefDist + rangeTolerance) {
                    m.aiState = 'STRAFE';
                    m.actionTimer = 1.2 + Math.random() * 1.4;
                    m.strafeSign = Math.random() < 0.5 ? -1 : 1;
                }

                if (m.skillCooldown <= 0 && this.pickSkill(m)) {
                    m.aiState = 'TELEGRAPH';
                    m.actionTimer = 0.4 - aggressionTier * 0.04;
                    Particles.showFloatingText(state, "⚠️", m.x, m.y - sizeOffset(m), '#f59e0b');
                }
                break;
            }

            case 'STRAFE': {
                const tangentX = -dirY * m.strafeSign;
                const tangentY = dirX * m.strafeSign;

                let radial = 0;
                if (dist > prefDist + rangeTolerance) radial = 1;
                else if (dist < prefDist - rangeTolerance) radial = -1;

                const orbit = 0.75 + aggressionTier * 0.05;
                m.x += (tangentX * orbit + dirX * radial) * spd * delta;
                m.y += (tangentY * orbit + dirY * radial) * spd * delta;

                m.actionTimer -= delta;

                if (m.skillCooldown <= 0 && this.pickSkill(m)) {
                    m.aiState = 'TELEGRAPH';
                    m.actionTimer = 0.4 - aggressionTier * 0.04;
                    Particles.showFloatingText(state, "⚠️", m.x, m.y - sizeOffset(m), '#f59e0b');
                    break;
                }

                if (m.actionTimer <= 0) {
                    if (Math.random() < 0.3) {
                        m.aiState = 'FLANK';
                        m.flankTimer = 0.45;
                        m.flankSign = Math.random() < 0.5 ? -1 : 1;
                    } else {
                        m.strafeSign *= -1;
                        m.actionTimer = 1.0 + Math.random() * 1.5;
                        if (Math.random() < 0.35) m.aiState = 'APPROACH';
                    }
                }
                break;
            }

            case 'FLANK': {
                const tangentX = -dirY * m.flankSign;
                const tangentY = dirX * m.flankSign;
                const flankSpeed = spd * (1.8 + aggressionTier * 0.15);

                m.x += tangentX * flankSpeed * delta;
                m.y += tangentY * flankSpeed * delta;

                if (Math.random() < 0.4) {
                    Particles.spawnParticles(state, m.x, m.y,
                        m.species.color || '#f87171', 1, { size: 2 });
                }

                m.flankTimer -= delta;
                if (m.flankTimer <= 0) {
                    m.aiState = (dist > prefDist) ? 'APPROACH' : 'STRAFE';
                    m.actionTimer = 1.0;
                }
                break;
            }

            case 'TELEGRAPH': {
                m.x += dirX * spd * 0.2 * delta;
                m.y += dirY * spd * 0.2 * delta;

                if (Math.random() < 0.35) {
                    Particles.spawnParticles(state, m.x, m.y,
                        m.species.color || '#ef4444', 2, { size: 3 });
                }

                if (m.actionTimer <= 0) {
                    m.aiState = 'ATTACK';
                    this.executeTerrifyingSkill(state, m, p, dist, dx, dy);
                    m.actionTimer = 0.15;
                }
                break;
            }

            case 'ATTACK': {
                if (m.isCharging) {
                    const chargeSpeed = spd * (3.2 + aggressionTier * 0.2);
                    m.x += (m.chargeDirX || dirX) * chargeSpeed * delta;
                    m.y += (m.chargeDirY || dirY) * chargeSpeed * delta;

                    if (Math.random() < 0.45) {
                        Particles.spawnParticles(state, m.x, m.y,
                            m.phase === 2 ? '#dc2626' : '#f59e0b', 2);
                    }

                    if (m.actionTimer <= 0 || dist < 40) {
                        m.isCharging = false;
                        state.screenShake = 10;
                        Particles.spawnParticles(state, m.x, m.y, '#f59e0b', 16);
                        m.aiState = 'RECOVER';
                        m.actionTimer = 0.5;
                    }
                } else {
                    if (m.actionTimer <= 0) {
                        const comboChance = 0.25 + aggressionTier * 0.08;
                        if (m.comboCount < 2 && Math.random() < comboChance) {
                            m.comboCount++;
                            m.skillCooldown = 0;
                            m.aiState = 'TELEGRAPH';
                            m.actionTimer = 0.25;
                            Particles.showFloatingText(state, "COMBO!",
                                m.x, m.y - 55, '#fbbf24');
                        } else {
                            m.comboCount = 0;
                            m.aiState = 'RECOVER';
                            m.actionTimer = 0.5;
                        }
                    }
                }
                break;
            }

            case 'RECOVER': {
                m.x += dirX * spd * 0.15 * delta;
                m.y += dirY * spd * 0.15 * delta;

                if (m.actionTimer <= 0) {
                    const cooldowns = {
                        common: 3.5, rare: 2.8, epic: 2.0,
                        legendary: 1.4, mythic: 0.9,
                        boss: 0.8
                    };
                    let cd = cooldowns[rarity] || 2.5;
                    if (m.phase === 2) cd *= 0.65;
                    m.skillCooldown = cd;

                    m.aiState = dist > prefDist + rangeTolerance ? 'APPROACH' : 'STRAFE';
                    m.strafeSign = Math.random() < 0.5 ? -1 : 1;
                    m.actionTimer = 0.8 + Math.random() * 0.8;
                }
                break;
            }

            default: {
                m.aiState = 'APPROACH';
            }
        }
    },

    pickSkill(m) {
        const list = m.species.skills ||
                     (m.species.skill ? [m.species.skill] :
                     (m.species.skillName ? [m.species.skillName] : []));
        if (!list.length) return null;
        return list[Math.floor(Math.random() * list.length)];
    },

    // ============================================================
    //  UNIFIED SKILL EXECUTION
    // ============================================================
    executeTerrifyingSkill(state, m, p, dist, dx, dy) {
        const skill = this.pickSkill(m);
        const color = m.species.color || '#ef4444';
        const atk = m.species.attack || 15;

        const safeDist = dist || 1;
        const localDirX = dx / safeDist;
        const localDirY = dy / safeDist;

        const label = (m.species.skillName || skill || 'ATTACK').split('/')[0].trim();
        Particles.showFloatingText(state,
            `💥 ${label.toUpperCase()}!`, m.x, m.y - 45, color);

        // Boss-specific skill bridge — routes to FISH_SKILLS for custom
        // summoner / arena-control abilities that aren't in the local switch
        if (m.species.isBoss && typeof FISH_SKILLS !== 'undefined' && FISH_SKILLS[skill]) {
            const virtualFish = {
                species: m.species,
                x: m.x, y: m.y,
                hp: m.hp, maxHp: m.maxHp,
                vx: 0, vy: 0,
                isRaging: m.isEnraged,
                isInflated: m.isInflated,
                dragState: 'BEACHED'
            };
            try {
                FISH_SKILLS[skill](virtualFish, {
                    state,
                    canvas: { width: state.canvasWidth, height: state.canvasHeight },
                    showFloatingText: (t, x, y, c) => Particles.showFloatingText(state, t, x, y, c),
                    spawnParticles: (x, y, c, n) => Particles.spawnParticles(state, x, y, c, n)
                });
                m.x = virtualFish.x;
                m.y = virtualFish.y;
            } catch (e) {
                console.warn('[boss skill error]', skill, e);
            }
            Player.refreshHUD(state);
            if (p.hp <= 0) Player.die(state);
            return;
        }

        // Sound: rarity-based announcement
        try {
            const rarity = m.species.rarity;
            if (rarity === 'legendary' || rarity === 'mythic' || rarity === 'boss') audio.playRoar();
            else audio.playFishScreech();
        } catch (e) {}

        // Helper: fire a bullet toward a point
        const fire = (tx, ty, spd, dmg, col, opts = {}) => {
            const a = Math.atan2(ty - m.y, tx - m.x);
            this.spawnBullet(state, m.x, m.y,
                Math.cos(a) * spd, Math.sin(a) * spd,
                { radius: opts.radius || 8, damage: dmg,
                  color: col, life: opts.life || 2.5 });
        };

        // Helper: drop a telegraph → detonation at a point
        const blast = (x, y, radius, dmg, timer, col, opts = {}) => {
            state.delayedBlasts.push({
                x, y, radius, damage: Math.round(dmg),
                timer, color: col, shake: opts.shake || 10,
                leaveHazard: !!opts.hazard,
                hazardType: opts.hazardType || 'fire',
                hazardDps: opts.hazardDps || 12,
                hazardDuration: opts.hazardDuration || 2.5
            });
        };

        // Helper: drop a lingering ground hazard
        const hazard = (x, y, radius, dur, dps, type, col) => {
            state.groundHazards.push({
                x, y, radius, duration: dur,
                type, damagePerSec: dps, color: col
            });
        };

        switch (skill) {

            case 'inferno':
            case 'magmaShower':
            case 'supernova': {
                const dmg = Math.round(atk * 1.1);
                if (dist < 260) {
                    const dealt = this.damagePlayer(state, dmg, { attacker: m, knockback: 0 });
                    p.burnTimer = 3.0;
                    Particles.showFloatingText(state, `🔥 -${dealt}`,
                        p.x, p.y - 30, '#ea580c');
                    UI.triggerDamageFlash();
                    state.screenShake = 12;
                }
                const count = skill === 'supernova' ? 10 : 6;
                for (let i = 0; i < count; i++) {
                    const a = (Math.PI * 2 / count) * i + Math.random() * 0.2;
                    fire(m.x + Math.cos(a) * 400, m.y + Math.sin(a) * 400,
                         380, Math.round(atk * 0.55), '#f97316', { radius: 12 });
                }
                for (let i = 0; i < 3; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = 40 + Math.random() * 90;
                    blast(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d,
                          65, atk * 0.9, 0.7 + i * 0.2, '#f97316',
                          { hazard: true, hazardType: 'fire',
                            hazardDps: 14, hazardDuration: 3.5, shake: 12 });
                }
                Particles.spawnParticles(state, m.x, m.y, '#ea580c', 25);
                try { audio.playExplosion(); } catch (e) {}
                break;
            }

            case 'shock':
            case 'zapOrb':
            case 'waterJet':
            case 'stormSpiral': {
                const dmg = Math.round(atk * (skill === 'zapOrb' ? 1.2 : 1.0));
                if (dist < 220) {
                    const dealt = this.damagePlayer(state, dmg, { attacker: m, knockback: 0 });
                    // Stun only at touching range — the telegraphed blast
                    // at 220 is dodgeable damage, not a free stun
                    if (dist < 120) p.stunTimer = Math.max(p.stunTimer || 0, 0.7);
                    Particles.showFloatingText(state, `⚡ -${dealt}`,
                        p.x, p.y - 30, '#facc15');
                    UI.triggerDamageFlash();
                    state.screenShake = 10;
                }

                if (skill === 'stormSpiral') {
                    const baseA = Math.atan2(dy, dx);
                    for (let i = 0; i < 6; i++) {
                        const a = baseA + (i - 2.5) * 0.25;
                        fire(m.x + Math.cos(a) * 500, m.y + Math.sin(a) * 500,
                             440, Math.round(atk * 0.5), '#10b981', { radius: 11 });
                    }
                } else {
                    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                        this.spawnBullet(state, m.x, m.y,
                            Math.cos(a) * 300, Math.sin(a) * 300,
                            { radius: 8, damage: Math.round(atk * 0.4),
                              color: '#facc15', life: 1.5 });
                    }
                    fire(p.x, p.y, 560, Math.round(atk * 0.9), '#eab308',
                         { radius: 12 });
                }

                blast(p.x, p.y, 60, dmg * 0.7, 0.6, '#fde047',
                      { hazard: true, hazardType: 'fire',
                        hazardDps: 12, hazardDuration: 2.0, shake: 12 });

                Particles.spawnParticles(state, m.x, m.y, '#facc15', 20);
                try { audio.playThunder(); } catch (e) {}
                break;
            }

            case 'whirlpool':
            case 'tsunami':
            case 'voidPull':
            case 'tidalWave': {
                const pullForce = 150;
                p.x -= localDirX * pullForce;
                p.y -= localDirY * pullForce;

                const dmg = Math.round(atk * 0.85);
                const dealt = this.damagePlayer(state, dmg, { attacker: m, knockback: 0 });
                Particles.showFloatingText(state, `🌀 PULL -${dealt}`,
                    p.x, p.y - 25, '#8b5cf6');
                state.screenShake = 10;

                const B = CONFIG.WORLD;
                p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
                p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);

                const spread = (skill === 'tidalWave' || skill === 'tsunami') ? 5 : 3;
                for (let i = -Math.floor(spread / 2); i <= Math.floor(spread / 2); i++) {
                    const ox = localDirX * 5 - localDirY * i * 60;
                    const oy = localDirY * 5 + localDirX * i * 60;
                    fire(m.x + ox, m.y + oy, 480, Math.round(atk * 0.6),
                         skill === 'voidPull' ? '#c084fc' : '#2563eb',
                         { radius: 12 });
                }
                for (let i = 0; i < 3; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = 50 + Math.random() * 100;
                    hazard(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
                           60, 3.5, 12,
                           skill === 'voidPull' ? 'void' : 'water',
                           skill === 'voidPull' ? '#a855f7' : '#2563eb');
                }
                Particles.spawnParticles(state, p.x, p.y, '#a855f7', 15);
                try { audio.playBubble(); } catch (e) {}
                break;
            }

            case 'frostbite':
            case 'iceSpikeRing':
            case 'blizzardNova': {
                // Chilling nova has a range — no more map-wide frostbite
                if (dist > 260) break;
                p.slowTimer = Math.max(p.slowTimer || 0, 2.5);
                const dmg = Math.round(atk * 0.8);
                const dealt = this.damagePlayer(state, dmg, { attacker: m, knockback: 0 });
                p.x += localDirX * 60;
                p.y += localDirY * 60;
                Particles.showFloatingText(state, `❄️ -${dealt}`,
                    p.x, p.y - 30, '#38bdf8');
                state.screenShake = 8;

                const ring = skill === 'blizzardNova' ? 12 : 8;
                for (let i = 0; i < ring; i++) {
                    const a = (Math.PI * 2 / ring) * i;
                    fire(m.x + Math.cos(a) * 400, m.y + Math.sin(a) * 400,
                         400, Math.round(atk * 0.5), '#22d3ee', { radius: 10 });
                }
                for (let i = 0; i < (skill === 'blizzardNova' ? 5 : 3); i++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = 40 + Math.random() * 120;
                    hazard(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d,
                           55, 3.5, 10, 'ice', '#38bdf8');
                }
                try { audio.playIceCrack(); } catch (e) {}
                break;
            }

            case 'blink': {
                const backAngle = Math.atan2(dy, dx) + Math.PI;
                const B = CONFIG.WORLD;
                Particles.spawnParticles(state, m.x, m.y, '#fde047', 15);
                m.x = Utils.clamp(p.x + Math.cos(backAngle) * 60,
                    B.MIN_X + 20, state.waterBoundaryX - 20);
                m.y = Utils.clamp(p.y + Math.sin(backAngle) * 60,
                    B.MIN_Y + 20, B.MAX_Y - 20);
                Particles.spawnParticles(state, m.x, m.y, '#fde047', 20);

                const dmg = Math.round(atk * 1.3);
                const dealt = this.damagePlayer(state, dmg, { attacker: m, knockback: 0 });
                Particles.showFloatingText(state, `🗡️ BACKSTAB -${dealt}`,
                    p.x, p.y - 30, '#ef4444');
                UI.triggerDamageFlash();
                state.screenShake = 10;
                blast(p.x, p.y, 60, atk * 0.7, 0.5, '#fde047', { shake: 10 });
                try { audio.playWhoosh(); } catch (e) {}
                break;
            }

            case 'charge':
            case 'elderCharge': {
                m.isCharging = true;
                m.chargeDirX = localDirX;
                m.chargeDirY = localDirY;
                m.actionTimer = skill === 'elderCharge' ? 1.2 : 0.9;
                state.screenShake = skill === 'elderCharge' ? 16 : 8;
                Particles.spawnParticles(state, m.x, m.y,
                    skill === 'elderCharge' ? '#7c3aed' : '#eab308', 20);
                Particles.showFloatingText(state, "CHARGE!", m.x, m.y - 45,
                    skill === 'elderCharge' ? '#7c3aed' : '#eab308');
                const steps = skill === 'elderCharge' ? 8 : 5;
                for (let i = 1; i <= steps; i++) {
                    blast(m.x + localDirX * i * 70,
                          m.y + localDirY * i * 70,
                          55, atk * 0.6, 0.3 + i * 0.1,
                          skill === 'elderCharge' ? '#7c3aed' : '#f87171',
                          { shake: 8 });
                }
                try { audio.playWhoosh(); } catch (e) {}
                break;
            }

            case 'dart': {
                m.x += localDirX * 110;
                m.y += localDirY * 110;
                Particles.spawnParticles(state, m.x, m.y, '#6ee7b7', 12);
                fire(p.x, p.y, 640, Math.round(atk * 0.6), '#6ee7b7',
                     { radius: 8 });
                try { audio.playWhoosh(); } catch (e) {}
                break;
            }

            case 'rage': {
                m.isEnraged = true;
                m.enrageTimer = Math.max(m.enrageTimer, 3.0);
                m.invulnerableTimer = 1.2;
                Particles.spawnParticles(state, m.x, m.y, '#dc2626', 22);
                Particles.showFloatingText(state, "😡 ENRAGED!", m.x, m.y - 45, '#dc2626');
                for (let i = 0; i < 6; i++) {
                    const a = (Math.PI * 2 / 6) * i;
                    blast(m.x + Math.cos(a) * 90, m.y + Math.sin(a) * 90,
                          60, atk * 0.8, 0.5 + i * 0.1, '#ef4444', { shake: 12 });
                }
                try { audio.playRoar(); } catch (e) {}
                break;
            }

            case 'inflate':
            case 'shellGuard': {
                m.isInflated = true;
                m.invulnerableTimer = 2.0;
                Particles.spawnParticles(state, m.x, m.y,
                    skill === 'shellGuard' ? '#16a34a' : '#f97316', 20);
                for (let i = 0; i < 12; i++) {
                    const a = (Math.PI * 2 / 12) * i;
                    fire(m.x + Math.cos(a) * 400, m.y + Math.sin(a) * 400,
                         460, Math.round(atk * 0.5),
                         skill === 'shellGuard' ? '#16a34a' : '#f97316',
                         { radius: 10 });
                }
                break;
            }

            case 'camouflaged': {
                m.stealthTimer = 3.0;
                Particles.spawnParticles(state, m.x, m.y, '#475569', 14);
                Particles.showFloatingText(state, "👻 HIDDEN!", m.x, m.y - 45, '#94a3b8');
                blast(p.x, p.y, 70, atk * 1.2, 0.9, '#94a3b8', { shake: 14 });
                try { audio.playWhoosh(); } catch (e) {}
                break;
            }

            case 'flashBang': {
                state.screenShake = 18;
                UI.triggerDamageFlash();
                // Same rule as the hooked-fish version: the flash IS the
                // effect (white blindness), never a free stun
                p.flashTimer = Math.max(p.flashTimer || 0, 0.6);
                Particles.spawnParticles(state, m.x, m.y, '#fef08a', 30);
                Particles.showFloatingText(state, "💥 FLASH!", m.x, m.y - 45, '#fef08a');
                for (let i = 0; i < 10; i++) {
                    const a = (Math.PI * 2 / 10) * i;
                    fire(m.x + Math.cos(a) * 450, m.y + Math.sin(a) * 450,
                         500, Math.round(atk * 0.4), '#fef08a', { radius: 8 });
                }
                hazard(p.x, p.y, 80, 2.5, 6, 'flash', '#fef08a');
                try { audio.playThunder(); } catch (e) {}
                break;
            }

            case 'drain': {
                const dmg = Math.round(atk * 1.0);
                const dealt = this.damagePlayer(state, dmg, { attacker: m, knockback: 0 });
                m.hp = Math.min(m.species.maxHp, m.hp + Math.round(dealt * 0.3));
                Particles.showFloatingText(state, `💜 DRAIN -${dealt}`,
                    p.x, p.y - 30, '#a855f7');
                UI.triggerDamageFlash();
                state.screenShake = 12;
                const d = Math.hypot(p.x - m.x, p.y - m.y) || 1;
                for (let t = 0; t < 1; t += 0.1) {
                    Particles.spawnParticles(state,
                        m.x + (p.x - m.x) * t,
                        m.y + (p.y - m.y) * t,
                        '#a855f7', 1);
                }
                break;
            }

            case 'spineVolley':
            case 'poisonSpit': {
                const offsets = skill === 'spineVolley'
                    ? [-0.5, -0.25, 0, 0.25, 0.5]
                    : [-0.25, 0, 0.25];
                const baseA = Math.atan2(dy, dx);
                for (const off of offsets) {
                    const a = baseA + off;
                    this.spawnBullet(state, m.x, m.y,
                        Math.cos(a) * (skill === 'spineVolley' ? 560 : 440),
                        Math.sin(a) * (skill === 'spineVolley' ? 560 : 440),
                        { radius: 9, damage: Math.round(atk * 0.5),
                          color: skill === 'spineVolley' ? '#fb923c' : '#84cc16',
                          life: 2.0 });
                }
                if (skill === 'poisonSpit') {
                    hazard(p.x, p.y, 70, 4.0, 15, 'poison', '#84cc16');
                }
                break;
            }

            case 'solarBeam':
            case 'timeWarp':
            case 'cosmicStorm':
            case 'tentacleSlam':
            case 'tidalSlam':
            case 'radiantBarb':
            case 'timePierce':
            case 'poisonBarb': {
                if (skill === 'tentacleSlam') {
                    const dmg = Math.round(atk * 1.6);
                    for (const o of [{x:-50,y:0},{x:50,y:0},{x:0,y:-50},{x:0,y:50}]) {
                        blast(p.x + o.x, p.y + o.y, 55, dmg, 0.55,
                              '#a855f7', { shake: 16 });
                    }
                    fire(p.x, p.y, 400, Math.round(dmg * 0.7), '#a855f7',
                         { radius: 18, life: 3.5 });
                } else if (skill === 'cosmicStorm') {
                    for (let i = -1; i <= 1; i++) {
                        fire(p.x + i * 100, p.y, 340,
                             Math.round(atk * 0.8), '#7e22ce',
                             { radius: 14, life: 4.5 });
                    }
                    for (let i = 0; i < 4; i++) {
                        const a = Math.random() * Math.PI * 2;
                        const r = 40 + Math.random() * 120;
                        blast(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
                              60, atk * 0.7, 0.9 + i * 0.15, '#a855f7',
                              { shake: 12 });
                    }
                } else {
                    const speed = skill === 'solarBeam' ? 900
                                : skill === 'radiantBarb' ? 1100
                                : skill === 'timePierce' ? 220
                                : 420;
                    const mult = skill === 'solarBeam' ? 1.6
                               : skill === 'radiantBarb' ? 1.6
                               : skill === 'timePierce' ? 1.5
                               : skill === 'tidalSlam' ? 1.9
                               : 1.6;
                    fire(p.x, p.y, speed, Math.round(atk * mult),
                         skill === 'solarBeam' ? '#fde047'
                         : skill === 'radiantBarb' ? '#fde047'
                         : skill === 'timePierce' ? '#22d3ee'
                         : skill === 'tidalSlam' ? '#0284c7'
                         : skill === 'poisonBarb' ? '#a855f7'
                         : '#06b6d4',
                         { radius: skill === 'timePierce' ? 24 : 16, life: 4.0 });
                    if (skill === 'tidalSlam') {
                        blast(p.x, p.y, 100, atk * 1.2, 0.8, '#0284c7',
                              { hazard: true, hazardType: 'water',
                                hazardDps: 20, hazardDuration: 3.5, shake: 24 });
                    }
                    if (skill === 'poisonBarb') {
                        hazard(p.x, p.y, 70, 4.0, 16, 'poison', '#a855f7');
                    }
                }
                state.screenShake = Math.max(state.screenShake, 14);
                try {
                    const c = (color || '').toLowerCase();
                    if (skill === 'solarBeam' || skill === 'radiantBarb') audio.playThunder();
                    else if (skill === 'timePierce') audio.playBubble();
                    else audio.playExplosion();
                } catch (e) {}
                break;
            }

            case 'cataclysm': {
                const dmg = Math.round(atk * 1.4);
                for (let i = 0; i < 16; i++) {
                    const a = (Math.PI * 2 / 16) * i;
                    fire(m.x + Math.cos(a) * 700, m.y + Math.sin(a) * 700,
                         620, dmg, '#7c3aed', { radius: 18, glow: true });
                }
                for (let i = 0; i < 8; i++) {
                    const a = (Math.PI * 2 / 8) * i;
                    const r = 60 + (i % 2) * 80;
                    blast(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
                          70, atk * 1.1, 1.0 + i * 0.1, '#7c3aed',
                          { hazard: true, hazardType: 'void',
                            hazardDps: 20, hazardDuration: 4.0, shake: 16 });
                }
                state.screenShake = 32;
                try { audio.playExplosion(); } catch (e) {}
                break;
            }

            case 'emberBreath': {
                const dmg = Math.round(atk * 1.1);
                const baseA = Math.atan2(dy, dx);
                for (let i = -3; i <= 3; i++) {
                    const a = baseA + i * 0.12;
                    fire(m.x + Math.cos(a) * 700, m.y + Math.sin(a) * 700,
                         620, dmg, '#f97316', { radius: 13 });
                }
                for (let i = 0; i < 6; i++) {
                    blast(m.x + Math.cos(baseA) * (i * 90 + 60),
                          m.y + Math.sin(baseA) * (i * 90 + 60),
                          60, atk * 0.5, 0.5 + i * 0.1, '#f97316',
                          { hazard: true, hazardType: 'fire',
                            hazardDps: 15, hazardDuration: 3.0, shake: 10 });
                }
                try { audio.playExplosion(); } catch (e) {}
                break;
            }

            case 'voidRend': {
                const dmg = Math.round(atk * 1.4);
                for (let i = 0; i < 4; i++) {
                    fire(p.x + (Math.random() - 0.5) * 100,
                         p.y + (Math.random() - 0.5) * 100,
                         260 + i * 50, dmg, '#4c1d95',
                         { radius: 18, life: 5.0 });
                }
                hazard(p.x, p.y, 90, 4.0, 22, 'void', '#4c1d95');
                state.screenShake = 18;
                try { audio.playExplosion(); } catch (e) {}
                break;
            }

            case 'inkCloud': {
                const dmg = Math.round(atk * 0.7);
                for (let i = 0; i < 10; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = 40 + Math.random() * 120;
                    fire(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d,
                         300, dmg, '#1e293b', { radius: 14, life: 2.8 });
                }
                for (let i = 0; i < 4; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = 40 + Math.random() * 180;
                    hazard(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
                           70, 4.0, 10, 'void', '#1e293b');
                }
                try { audio.playBubble(); } catch (e) {}
                break;
            }

            case 'starFall': {
                const dmg = Math.round(atk * 1.0);
                for (let i = 0; i < 10; i++) {
                    const usePlayer = i < 6;
                    const a = Math.random() * Math.PI * 2;
                    const r = usePlayer ? (30 + Math.random() * 120)
                                        : (80 + Math.random() * 250);
                    blast(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
                          55, dmg, 0.6 + i * 0.12, '#c084fc',
                          { hazard: true, hazardType: 'fire',
                            hazardDps: 12, hazardDuration: 2.5, shake: 12 });
                }
                state.screenShake = 18;
                try { audio.playExplosion(); } catch (e) {}
                break;
            }

            default: {
                fire(p.x, p.y, 480, Math.round(atk * 0.8), color, { radius: 10 });
                if (dist < 140) {
                    const dealt = this.damagePlayer(state, Math.round(atk * 0.6), { attacker: m, knockback: 0 });
                    Particles.showFloatingText(state, `-${dealt}`,
                        p.x, p.y - 25, '#ef4444');
                    UI.triggerDamageFlash();
                }
                break;
            }
        }

        Player.refreshHUD(state);
        if (p.hp <= 0) Player.die(state);
    },

    // ============================================================
    //  MELEE CONTACT
    // ============================================================
    handleDirectMeleeContact(state, m, p, dist, dx, dy) {
        const B = CONFIG.WORLD;
        let damage = m.species.attack || 10;

        if (m.isCharging) damage *= 1.8;
        if (m.isEnraged) damage *= 1.4;
        if (m.phase === 2) damage *= 1.15;
        if (m.stealthTimer > 0) {
            damage *= 2.0;
            m.stealthTimer = 0;
            Particles.showFloatingText(state, "CRITICAL AMBUSH!",
                p.x, p.y - 45, '#dc2626');
        }

        if (m.isInflated) {
            m.isInflated = false;
            damage *= 0.8;
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                this.spawnBullet(state, m.x, m.y,
                    Math.cos(a) * 260, Math.sin(a) * 260,
                    { radius: 6, damage: 6, color: '#fb923c', life: 1.0 });
            }
        }

        const finalDamage = Math.round(damage);
        const dealt = this.damagePlayer(state, finalDamage, { attacker: m, knockback: 1 });

        try { audio.playHit(); } catch (e) {}
        try { audio.playHurt(); } catch (e) {}
        Particles.showFloatingText(state, `-${dealt}`,
            p.x, p.y - 25, '#f43f5e');
        Player.refreshHUD(state);
        UI.triggerDamageFlash();
        state.screenShake = 8;

        const knockback = (p.armorAnchor || p.umbrellaTimer > 0) ? 0 : 40;
        p.x += (dx / dist) * knockback;
        p.y += (dy / dist) * knockback;

        p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
        p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);

        if (p.hp <= 0) Player.die(state);
    },

    // ============================================================
    //  STATUS / HAZARDS / LOOT
    // ============================================================
    updatePlayerStatus(state, delta) {
        const p = state.player;
        if (p.stunTimer > 0) p.stunTimer -= delta;
        if (p.slowTimer > 0) p.slowTimer -= delta;
        if (p.flashTimer > 0) p.flashTimer -= delta;
        if (p.blurTimer > 0) p.blurTimer -= delta;
        this.updateScreenFx(state);
        if (p.burnTimer > 0) {
            p.burnTimer -= delta;
            p.burnTick = (p.burnTick || 0) + delta;
            if (p.burnTick >= 0.4) {
                p.burnTick = 0;
                const burnDmg = 3;
                p.hp -= burnDmg;
                Particles.showFloatingText(state, `🔥 -${burnDmg}`,
                    p.x, p.y - 30, '#f97316');
                Player.refreshHUD(state);
                try { audio.playHurt(); } catch (e) {}
                if (p.hp <= 0) Player.die(state);
            }
        }
    },

    // Screen FX: white flash overlay + canvas blur, driven by
    // p.flashTimer / p.blurTimer (fish skills set them, never instantly
    // except flash visuals). Blur clears the moment the timer ends.
    _flashOn: false,
    updateScreenFx(state) {
        try {
            const p = state.player;
            const wantFlash = (p.flashTimer || 0) > 0;
            const fl = document.getElementById('flash-overlay');
            if (fl) {
                if (wantFlash && !this._flashOn) {
                    this._flashOn = true;
                    fl.classList.remove('active');
                    void fl.offsetWidth;
                    fl.classList.add('active');
                } else if (!wantFlash && this._flashOn) {
                    this._flashOn = false;
                    fl.classList.remove('active');
                }
            }
            const cv = document.getElementById('gameCanvas');
            if (cv) cv.style.filter = ((p.blurTimer || 0) > 0) ? 'blur(3px) saturate(1.2)' : '';
        } catch (e) {}
    },

    updateGroundHazards(state, delta) {
        const p = state.player;
        for (let i = state.groundHazards.length - 1; i >= 0; i--) {
            const h = state.groundHazards[i];
            h.duration -= delta;

            if (h.duration <= 0) {
                state.groundHazards.splice(i, 1);
                continue;
            }

            const dist = Math.hypot(p.x - h.x, p.y - h.y);
            if (dist < h.radius + (p.radius || 15)) {
                const tickDmg = h.damagePerSec * delta;
                let dr = 0;
                if (typeof Shop !== 'undefined' && Shop.getDamageReduction) {
                    try { dr = Shop.getDamageReduction(state); } catch (e) {}
                }
                if (p.umbrellaTimer > 0) dr = Math.min(0.8, dr + 0.35);
                p.hp -= tickDmg * (1 - dr);
                // Sticky ground slows you while you stand in it — walk out
                // to end it (no more instant slows from skills).
                if (h.type === 'ice' || h.type === 'mud' || h.type === 'ink' ||
                    h.type === 'sand' || h.type === 'coral' || h.type === 'poison') {
                    p.slowTimer = Math.max(p.slowTimer || 0, 0.3);
                }
                // Ink / sand in your eyes blurs the screen while inside
                if (h.type === 'ink' || h.type === 'sand') {
                    p.blurTimer = Math.max(p.blurTimer || 0, 0.4);
                }
                if (Math.random() < 0.2) {
                    Particles.showFloatingText(state, `-${Math.ceil(tickDmg)}`,
                        p.x, p.y - 20, h.color);
                    Player.refreshHUD(state);
                }
                if (p.hp <= 0) Player.die(state);
            }

            if (Math.random() < 0.4) {
                Particles.spawnParticles(state,
                    h.x + (Math.random() - 0.5) * h.radius,
                    h.y + (Math.random() - 0.5) * h.radius,
                    h.color, 1);
            }
        }
    },

    updateGroundLoot(state) {
        const p = state.player;
        if (!state.groundLoot) state.groundLoot = [];

        const MAGNET_RADIUS = 90;
        const PICKUP_RADIUS = 55;
        const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 0, MAX_X: 9999, MIN_Y: 0, MAX_Y: 9999 };

        for (let i = state.groundLoot.length - 1; i >= 0; i--) {
            const item = state.groundLoot[i];
            // Lost to the sea / out of bounds: sink with bubbles, then gone
            if (!item.sinking) {
                const lost = item.x > state.waterBoundaryX + 15 ||
                    item.x < B.MIN_X - 20 || item.x > B.MAX_X + 20 ||
                    item.y < B.MIN_Y - 20 || item.y > B.MAX_Y + 20;
                if (lost) {
                    item.sinking = 1.2;
                    item.sinkMax = 1.2;
                    if (typeof Particles !== 'undefined') {
                        Particles.spawnWaterSplashes(state, item.x, item.y, 6);
                        Particles.showFloatingText(state, 'Lost to the sea...', item.x, item.y - 20, '#38bdf8');
                    }
                }
            }
            if (item.sinking) {
                item.sinking -= 0.016;
                item.y += 22 * 0.016; // settle down
                if (Math.random() < 0.25 && typeof Particles !== 'undefined') {
                    Particles.spawnWaterSplashes(state, item.x, item.y, 1);
                }
                if (item.sinking <= 0) {
                    state.groundLoot.splice(i, 1);
                }
                continue; // no magnet/pickup while sinking
            }
            const dx = p.x - item.x;
            const dy = p.y - item.y;
            const dist = Math.hypot(dx, dy) || 1;

            // Host owns loot physics — clients only pick up (then claim)
            const isMPClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
            if (dist < MAGNET_RADIUS && dist > 4 && !isMPClient) {
                const strength = 1 + (1 - dist / MAGNET_RADIUS) * 3;
                const pullSpeed = 260 * strength;
                item.x += (dx / dist) * pullSpeed * 0.016;
                item.y += (dy / dist) * pullSpeed * 0.016;
            }

            if (dist < PICKUP_RADIUS) {
                // Summon-item loot: straight into the bucket (capacity
                // respected). Never indexed, never quest-counted.
                if (item.item && item.item.keyItem) {
                    if (p.bucket.length < p.bucketCapacity) {
                        try { audio.playCoin(); } catch (e) {}
                        p.bucket.push(Object.assign({}, item.item));
                        Particles.showFloatingText(state, `${item.item.icon || ''} ${item.item.name} kept!`, p.x, p.y - 50, item.item.color || '#fff');
                        Player.addXP(state, 15);
                        Player.refreshHUD(state);
                        state.groundLoot.splice(i, 1);
                        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
                            if (item.id && Multiplayer.sendLootDelete) Multiplayer.sendLootDelete(item.id);
                        }
                        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                    } else {
                        Particles.showFloatingText(state, "BUCKET FULL!",
                            item.x, item.y - 20, '#f87171');
                    }
                    continue;
                }
                // Personal loot: whoever grabs it keeps it. In MP the host
                // is told to delete the shared drop so it can't double-spawn.
                if (p.bucket.length < p.bucketCapacity) {
                    try { audio.playCoin(); } catch (e) {}
                    p.bucket.push(item.species);
                    UI.showCatchPopup(item.species);
                    // Legendary catches sometimes shake loose a Storm Egg
                    // (physical loot, magnet-grabbed on the spot)
                    if (item.species.rarity === 'legendary' && !item.species.isBoss &&
                        Math.random() < 0.12 && typeof Ritual !== 'undefined' && Ritual.awardItem) {
                        try { Ritual.awardItem(state, 'storm_egg', item.x, item.y, 'legendary catch'); } catch (err) {}
                    }
                    // Void-tainted loot carries a shard (only source besides
                    // void jumper kills — plain fish never drop them)
                    if (item.species.mutation === 'void' && typeof Ritual !== 'undefined' && Ritual.awardItem) {
                        try { Ritual.awardItem(state, 'shard', item.x, item.y, 'void catch'); } catch (err) {}
                    }
                    if (typeof NPC !== 'undefined' && NPC.onCatch) {
                        try { NPC.onCatch(state, item.species); } catch (err) {}
                    }
                    if (typeof Tutorial !== 'undefined' && Tutorial.onLoot) {
                        try { Tutorial.onLoot(state); } catch (err) {}
                    }
                    Player.refreshHUD(state);
                    state.groundLoot.splice(i, 1);
                    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
                        if (item.id && Multiplayer.sendLootDelete) Multiplayer.sendLootDelete(item.id);
                    }
                    
                    // Add to fish index (caught fish) — real fish only,
                    // so seagull/crab meat doesn't pollute the index count
                    if (!p.caughtFish) p.caughtFish = [];
                    const isRealFish = (typeof FISH_SPECIES !== 'undefined') && FISH_SPECIES.some(s => s.id === item.species.id);
                    const alreadyCaught = p.caughtFish.some(f => f.id === item.species.id);
                    if (!alreadyCaught && isRealFish) {
                        p.caughtFish.push(item.species);
                        Particles.showFloatingText(state, `NEW ENTRY: ${item.species.name}!`, p.x, p.y - 50, '#facc15');
                    }
                    // Lifetime catch + rarity achievements (the one funnel
                    // every catch flows through — meat excluded above)
                    if (isRealFish && item.species) {
                        try {
                            if (typeof Achievements !== 'undefined') Achievements.checkFishCatch(state, item.species);
                        } catch (e) {}
                    }
                    
                    Player.addXP(state, Math.round((item.species.value || 10) / 10) + 5);
                    UI.updateStatusBanner('Loot Claimed! Return to shop.', 'Claimed!', 'emerald');
                } else {
                    Particles.showFloatingText(state, "BUCKET FULL!",
                        item.x, item.y - 20, '#f87171');
                }
            }
        }
    }
};

function sizeOffset(m) {
    return (m.species.size || 20) + 25;
}