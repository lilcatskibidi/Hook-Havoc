const Combat = {
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

        this.updateBullets(state, delta);
        this.updateDelayedBlasts(state, delta);
        this.updateGroundHazards(state, delta);
        this.updatePlayerStatus(state, delta);

        if (p.isDead || p.hp <= 0) return;

        for (let i = state.monstersOnLand.length - 1; i >= 0; i--) {
            const m = state.monstersOnLand[i];

            // --- Death ---
            if (m.hp <= 0) {
                Particles.spawnBloodImpact(state, m.x, m.y, '#ef4444', 30);
                const isBoss = m.species.rarity === 'legendary' || m.species.rarity === 'mythic';
                state.screenShake = isBoss ? 12 : 5;
                if (isBoss) {
                    Particles.spawnParticles(state, m.x, m.y, '#f59e0b', 35);
                    // Boss death explosion
                    state.delayedBlasts.push({
                        x: m.x, y: m.y, radius: 120,
                        damage: 0, timer: 0.35, color: '#f59e0b',
                        shake: 18, leaveHazard: true,
                        hazardType: 'fire', hazardDps: 8, hazardDuration: 2.5
                    });
                }
                state.groundLoot.push({ species: m.species, x: m.x, y: m.y });
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
            }

            const dx = p.x - m.x;
            const dy = p.y - m.y;
            const dist = Math.hypot(dx, dy) || 1;
            m.angle = Math.atan2(dy, dx);

            this.updateMonsterAI(state, m, p, dist, dx, dy, delta);

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
                    p.hp -= b.damage;
                    Particles.showFloatingText(state, `-${b.damage}`,
                        p.x, p.y - 25, b.color);
                    Player.refreshHUD(state);
                    UI.triggerDamageFlash();
                    if (p.hp <= 0) Player.die(state);
                }
                state.screenShake = Math.max(state.screenShake, b.shake || 8);
                Particles.spawnParticles(state, b.x, b.y, b.color, 18, { size: 6 });

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

    // ============================================================
    //  BULLETS
    // ============================================================
    updateBullets(state, delta) {
        const p = state.player;
        const B = CONFIG.WORLD;
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            if (b.owner === 'player') continue;

            b.x += b.vx * delta;
            b.y += b.vy * delta;
            b.life -= delta;

            if (b.trail) {
                b.trail.push({ x: b.x, y: b.y });
                if (b.trail.length > 8) b.trail.shift();
            }

            if (Math.random() < 0.5) {
                Particles.spawnParticles(state, b.x, b.y,
                    b.color || '#facc15', 1, { size: 2 });
            }

            const dist = Math.hypot(p.x - b.x, p.y - b.y);
            if (dist < (p.radius || 15) + (b.radius || 6)) {
                p.hp -= b.damage || 5;
                Particles.showFloatingText(state, `-${b.damage || 5}`, p.x, p.y - 25,
                    b.color || '#facc15');
                Player.refreshHUD(state);
                UI.triggerDamageFlash();
                state.screenShake = Math.max(state.screenShake, 6);
                Particles.spawnParticles(state, b.x, b.y, b.color || '#facc15', 8);
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
            x, y, vx, vy,
            owner: 'enemy',
            radius: opts.radius || 7,
            damage: opts.damage || 5,
            color: opts.color || '#facc15',
            life: opts.life || 2.5,
            trail: []
        });
    },

    // ============================================================
    //  IMPROVED BOSS AI
    //  Adds: FLANK, REPOSITION, COMBO states, aggression scaling,
    //  phase 2 awareness, and a cooldown-driven skill chaining.
    // ============================================================
    updateMonsterAI(state, m, p, dist, dx, dy, delta) {
        const baseSpeed = (m.species.speed || 4) * 22;
        const speedMult =
            (m.isEnraged ? 1.45 : 1.0) *
            (m.stealthTimer > 0 ? 1.25 : 1.0) *
            (m.phase === 2 ? 1.15 : 1.0);
        const spd = baseSpeed * speedMult;

        const dirX = dx / dist;
        const dirY = dy / dist;

        const rarity = m.species.rarity || 'common';
        const prefDist = ({
            common: 0, rare: 90, epic: 120, legendary: 140, mythic: 160
        })[rarity] ?? 0;

        const rangeTolerance = 40;
        // Aggression: higher rarity + phase 2 → short cooldowns, more combos
        const aggressionTier = ({
            common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4
        })[rarity] ?? 0;

        switch (m.aiState) {

            // ----------------------------------------------------
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
                    m.actionTimer = 0.4 - aggressionTier * 0.04; // faster telegraphs for rarer
                    Particles.showFloatingText(state, "⚠️", m.x, m.y - sizeOffset(m), '#f59e0b');
                }
                break;
            }

            // ----------------------------------------------------
            case 'STRAFE': {
                const tangentX = -dirY * m.strafeSign;
                const tangentY = dirX * m.strafeSign;

                let radial = 0;
                if (dist > prefDist + rangeTolerance) radial = 1;
                else if (dist < prefDist - rangeTolerance) radial = -1;

                // Mythic & legendary orbit farther & tighter
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

                // Change orbit direction or FLANK
                if (m.actionTimer <= 0) {
                    if (Math.random() < 0.3) {
                        // Flank: dash sideways to close in unexpectedly
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

            // ----------------------------------------------------
            case 'FLANK': {
                // Quick lateral dash then resume approach
                const tangentX = -dirY * m.flankSign;
                const tangentY = dirX * m.flankSign;
                const flankSpeed = spd * (1.8 + aggressionTier * 0.15);

                m.x += tangentX * flankSpeed * delta;
                m.y += tangentY * flankSpeed * delta;

                if (Math.random() < 0.6) {
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

            // ----------------------------------------------------
            case 'TELEGRAPH': {
                // Boss winds up — slows to a crawl, glows
                m.x += dirX * spd * 0.2 * delta;
                m.y += dirY * spd * 0.2 * delta;

                if (Math.random() < 0.55) {
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

            // ----------------------------------------------------
            case 'ATTACK': {
                if (m.isCharging) {
                    const chargeSpeed = spd * (3.2 + aggressionTier * 0.2);
                    m.x += (m.chargeDirX || dirX) * chargeSpeed * delta;
                    m.y += (m.chargeDirY || dirY) * chargeSpeed * delta;

                    if (Math.random() < 0.7) {
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
                        // COMBO: 40% chance to chain another skill immediately
                        // (rarer monsters chain more)
                        const comboChance = 0.25 + aggressionTier * 0.08;
                        if (m.comboCount < 2 && Math.random() < comboChance) {
                            m.comboCount++;
                            m.skillCooldown = 0; // immediately ready
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

            // ----------------------------------------------------
            case 'RECOVER': {
                m.x += dirX * spd * 0.15 * delta;
                m.y += dirY * spd * 0.15 * delta;

                if (m.actionTimer <= 0) {
                    // Cooldowns shortened by aggression tier and phase 2
                    const cooldowns = {
                        common: 3.5, rare: 2.8, epic: 2.0,
                        legendary: 1.4, mythic: 0.9
                    };
                    let cd = cooldowns[rarity] || 2.5;
                    if (m.phase === 2) cd *= 0.65;         // phase 2 fires faster
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
    //  Same skill set on land and in water. Uses delayedBlasts,
    //  telegraphs, and ground hazards — no more bland attacks.
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

            // ====================================================
            //  FIRE / EXPLOSIVE
            // ====================================================
            case 'inferno':
            case 'magmaShower':
            case 'supernova': {
                const dmg = Math.round(atk * 1.1);
                if (dist < 260) {
                    p.hp -= dmg;
                    p.burnTimer = 3.0;
                    Particles.showFloatingText(state, `🔥 -${dmg}`,
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
                // 3 telegraphed fire patches at random spots around player
                for (let i = 0; i < 3; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = 40 + Math.random() * 90;
                    blast(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d,
                          65, atk * 0.9, 0.7 + i * 0.2, '#f97316',
                          { hazard: true, hazardType: 'fire',
                            hazardDps: 14, hazardDuration: 3.5, shake: 12 });
                }
                Particles.spawnParticles(state, m.x, m.y, '#ea580c', 25);
                break;
            }

            // ====================================================
            //  ELECTRIC / WATER
            // ====================================================
            case 'shock':
            case 'zapOrb':
            case 'waterJet':
            case 'stormSpiral': {
                const dmg = Math.round(atk * (skill === 'zapOrb' ? 1.2 : 1.0));
                if (dist < 220) {
                    p.hp -= dmg;
                    p.stunTimer = 0.7;
                    Particles.showFloatingText(state, `⚡ -${dmg}`,
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
                    // Radial burst
                    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                        this.spawnBullet(state, m.x, m.y,
                            Math.cos(a) * 300, Math.sin(a) * 300,
                            { radius: 8, damage: Math.round(atk * 0.4),
                              color: '#facc15', life: 1.5 });
                    }
                    // Aimed shot
                    fire(p.x, p.y, 560, Math.round(atk * 0.9), '#eab308',
                         { radius: 12 });
                }

                // Lightning patch under player
                blast(p.x, p.y, 60, dmg * 0.7, 0.6, '#fde047',
                      { hazard: true, hazardType: 'fire',
                        hazardDps: 12, hazardDuration: 2.0, shake: 12 });

                Particles.spawnParticles(state, m.x, m.y, '#facc15', 20);
                break;
            }

            // ====================================================
            //  PULL / VORTEX
            // ====================================================
            case 'whirlpool':
            case 'tsunami':
            case 'voidPull':
            case 'tidalWave': {
                const pullForce = 150;
                p.x -= localDirX * pullForce;
                p.y -= localDirY * pullForce;

                const dmg = Math.round(atk * 0.85);
                p.hp -= dmg;
                Particles.showFloatingText(state, `🌀 PULL -${dmg}`,
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
                // Water/void zones
                for (let i = 0; i < 3; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = 50 + Math.random() * 100;
                    hazard(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
                           60, 3.5, 12,
                           skill === 'voidPull' ? 'void' : 'water',
                           skill === 'voidPull' ? '#a855f7' : '#2563eb');
                }
                Particles.spawnParticles(state, p.x, p.y, '#a855f7', 15);
                break;
            }

            // ====================================================
            //  ICE
            // ====================================================
            case 'frostbite':
            case 'iceSpikeRing':
            case 'blizzardNova': {
                p.slowTimer = 2.5;
                const dmg = Math.round(atk * 0.8);
                p.hp -= dmg;
                p.x += localDirX * 60;
                p.y += localDirY * 60;
                Particles.showFloatingText(state, `❄️ -${dmg}`,
                    p.x, p.y - 30, '#38bdf8');
                state.screenShake = 8;

                const ring = skill === 'blizzardNova' ? 12 : 8;
                for (let i = 0; i < ring; i++) {
                    const a = (Math.PI * 2 / ring) * i;
                    fire(m.x + Math.cos(a) * 400, m.y + Math.sin(a) * 400,
                         400, Math.round(atk * 0.5), '#22d3ee', { radius: 10 });
                }
                // Ice patches
                for (let i = 0; i < (skill === 'blizzardNova' ? 5 : 3); i++) {
                    const a = Math.random() * Math.PI * 2;
                    const d = 40 + Math.random() * 120;
                    hazard(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d,
                           55, 3.5, 10, 'ice', '#38bdf8');
                }
                break;
            }

            // ====================================================
            //  MOBILITY / TELEPORT
            // ====================================================
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
                p.hp -= dmg;
                Particles.showFloatingText(state, `🗡️ BACKSTAB -${dmg}`,
                    p.x, p.y - 30, '#ef4444');
                UI.triggerDamageFlash();
                state.screenShake = 10;
                // Delayed blast where player stood
                blast(p.x, p.y, 60, atk * 0.7, 0.5, '#fde047', { shake: 10 });
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
                // Charge lane telegraphs
                const steps = skill === 'elderCharge' ? 8 : 5;
                for (let i = 1; i <= steps; i++) {
                    blast(m.x + localDirX * i * 70,
                          m.y + localDirY * i * 70,
                          55, atk * 0.6, 0.3 + i * 0.1,
                          skill === 'elderCharge' ? '#7c3aed' : '#f87171',
                          { shake: 8 });
                }
                break;
            }

            case 'dart': {
                m.x += localDirX * 110;
                m.y += localDirY * 110;
                Particles.spawnParticles(state, m.x, m.y, '#6ee7b7', 12);
                // Small burst on arrival
                fire(p.x, p.y, 640, Math.round(atk * 0.6), '#6ee7b7',
                     { radius: 8 });
                break;
            }

            // ====================================================
            //  BUFFS / DEBUFFS
            // ====================================================
            case 'rage': {
                m.isEnraged = true;
                m.enrageTimer = Math.max(m.enrageTimer, 3.0);
                m.invulnerableTimer = 1.2;
                Particles.spawnParticles(state, m.x, m.y, '#dc2626', 22);
                Particles.showFloatingText(state, "😡 ENRAGED!", m.x, m.y - 45, '#dc2626');
                // Quake: 6 delayed blasts around the monster
                for (let i = 0; i < 6; i++) {
                    const a = (Math.PI * 2 / 6) * i;
                    blast(m.x + Math.cos(a) * 90, m.y + Math.sin(a) * 90,
                          60, atk * 0.8, 0.5 + i * 0.1, '#ef4444', { shake: 12 });
                }
                break;
            }

            case 'inflate':
            case 'shellGuard': {
                m.isInflated = true;
                m.invulnerableTimer = 2.0;
                Particles.spawnParticles(state, m.x, m.y,
                    skill === 'shellGuard' ? '#16a34a' : '#f97316', 20);
                // Burst of spines when defending
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
                // Ambush: delayed blast on player position
                blast(p.x, p.y, 70, atk * 1.2, 0.9, '#94a3b8', { shake: 14 });
                break;
            }

            case 'flashBang': {
                state.screenShake = 18;
                UI.triggerDamageFlash();
                p.stunTimer = 0.7;
                Particles.spawnParticles(state, m.x, m.y, '#fef08a', 30);
                Particles.showFloatingText(state, "💥 FLASH!", m.x, m.y - 45, '#fef08a');
                // Ring of sparks
                for (let i = 0; i < 10; i++) {
                    const a = (Math.PI * 2 / 10) * i;
                    fire(m.x + Math.cos(a) * 450, m.y + Math.sin(a) * 450,
                         500, Math.round(atk * 0.4), '#fef08a', { radius: 8 });
                }
                hazard(p.x, p.y, 80, 2.5, 6, 'flash', '#fef08a');
                break;
            }

            // ====================================================
            //  DRAIN / HEAL
            // ====================================================
            case 'drain': {
                const dmg = Math.round(atk * 1.0);
                p.hp -= dmg;
                m.hp = Math.min(m.species.maxHp, m.hp + Math.round(dmg * 0.3));
                Particles.showFloatingText(state, `💜 DRAIN -${dmg}`,
                    p.x, p.y - 30, '#a855f7');
                UI.triggerDamageFlash();
                state.screenShake = 12;
                // Visual beam
                const d = Math.hypot(p.x - m.x, p.y - m.y) || 1;
                for (let t = 0; t < 1; t += 0.1) {
                    Particles.spawnParticles(state,
                        m.x + (p.x - m.x) * t,
                        m.y + (p.y - m.y) * t,
                        '#a855f7', 1);
                }
                break;
            }

            // ====================================================
            //  VOLLEYS
            // ====================================================
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
                // Poison pool on player
                if (skill === 'poisonSpit') {
                    hazard(p.x, p.y, 70, 4.0, 15, 'poison', '#84cc16');
                }
                break;
            }

            // ====================================================
            //  BEAMS / HEAVY
            // ====================================================
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
                break;
            }

            // ====================================================
            //  ULTIMATES
            // ====================================================
            case 'cataclysm': {
                const dmg = Math.round(atk * 1.4);
                for (let i = 0; i < 16; i++) {
                    const a = (Math.PI * 2 / 16) * i;
                    fire(m.x + Math.cos(a) * 700, m.y + Math.sin(a) * 700,
                         620, dmg, '#7c3aed', {
                             radius: 18, glow: true
                         });
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
                break;
            }

            // ====================================================
            //  DEFAULT
            // ====================================================
            default: {
                fire(p.x, p.y, 480, Math.round(atk * 0.8), color, { radius: 10 });
                if (dist < 140) {
                    p.hp -= Math.round(atk * 0.6);
                    Particles.showFloatingText(state, `-${Math.round(atk * 0.6)}`,
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
        p.hp -= finalDamage;

        if (typeof audio !== 'undefined' && audio.playHit) audio.playHit();
        Particles.showFloatingText(state, `-${finalDamage}`,
            p.x, p.y - 25, '#f43f5e');
        Player.refreshHUD(state);
        UI.triggerDamageFlash();
        state.screenShake = 8;

        const knockback = 40;
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
                if (p.hp <= 0) Player.die(state);
            }
        }
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
                p.hp -= tickDmg;
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

        for (let i = state.groundLoot.length - 1; i >= 0; i--) {
            const item = state.groundLoot[i];
            if (Math.hypot(p.x - item.x, p.y - item.y) < 42) {
                if (p.bucket.length < p.bucketCapacity) {
                    if (typeof audio !== 'undefined' && audio.playCoin) audio.playCoin();
                    p.bucket.push(item.species);
                    UI.showCatchPopup(item.species);
                    Player.refreshHUD(state);
                    state.groundLoot.splice(i, 1);
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