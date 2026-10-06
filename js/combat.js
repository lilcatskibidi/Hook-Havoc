const Combat = {
    // Armor + umbrella mitigation shared by all enemy damage
    damagePlayer(state, raw, opts = {}) {
        const p = state && state.player;
        if (!p || p.isDead) return 0;
        // Bulletproof: every caller funnels here — a single NaN/undefined
        // damage (custom enemy, corrupt sync) must never poison p.hp.
        let base = Number(raw);
        if (!Number.isFinite(base)) base = 5;
        // Dash i-frames: a clean dodge eats the hit entirely (no chip).
        if ((p.iframes || 0) > 0) {
            try {
                if (!p._dodgeT || state.time - p._dodgeT > 0.4) {
                    p._dodgeT = state.time;
                    Particles.showFloatingText(state, 'DODGED!', p.x, p.y - 30, '#67e8f9');
                }
            } catch (e) {}
            return 0;
        }
        let dmg = Math.max(1, Math.round(base));
        let dr = 0;
        if (typeof Shop !== 'undefined' && Shop.getDamageReduction) {
            try { dr = Shop.getDamageReduction(state); } catch (e) {}
        }
        if (!Number.isFinite(dr)) dr = 0;
        if (p.umbrellaTimer > 0) dr = Math.min(0.8, dr + 0.35);
        // Ironskin Tonic item: −60% damage while it lasts.
        if ((p.ironSkinT || 0) > 0) dr = Math.min(0.85, dr + 0.60);
        dmg = Math.max(1, Math.round(base * (1 - dr)));
        if (p.armorAnchor && opts.knockback) opts.knockback = 0;
        p.hp -= dmg;
        // Reflect back to attacker
        if (opts.attacker && p.armorReflect > 0) {
            opts.attacker.hp -= Math.round(base * p.armorReflect);
        }
        // Thorn Shell item: attackers bleed 50% back while it lasts.
        if (opts.attacker && (p.thornT || 0) > 0) {
            try {
                opts.attacker.hp -= Math.max(1, Math.round(base * 0.5));
                if (Math.random() < 0.3) Particles.spawnParticles(state, p.x, p.y, '#fb923c', 4, { size: 3 });
            } catch (e) {}
        }
        // Gamepad rumble (guarded, throttled inside)
        try { if (typeof GamepadControls !== 'undefined') GamepadControls.rumble(0.25, 0.7, 0.5); } catch (e) {}
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
        this.updateVoidPits(state, delta);
        this.updatePlayerStatus(state, delta);
        try { if (typeof GlueWall !== 'undefined' && GlueWall.tick) GlueWall.tick(state, delta); } catch (e) {}

        if (p.isDead || p.hp <= 0) return;

        // Co-op client: the host simulates ALL shared entities. The client
        // only takes damage from them (identical positions = identical view).
        // While the link is STALE (host tab hidden/killed), incoming danger
        // freezes too — frozen bullets must not kill you. Own actions
        // (fishing, shooting, looting below) keep working.
        if (isMPClient) {
            let stale = false;
            try {
                stale = !!(typeof Multiplayer !== 'undefined' && Multiplayer.syncStale && Multiplayer.syncStale());
            } catch (e) {}
            if (!stale) this.applyClientIntake(state, delta);
            this.updateGroundLoot(state, delta);
            return;
        }

        for (let i = state.monstersOnLand.length - 1; i >= 0; i--) {
            const m = state.monstersOnLand[i];

            // --- Boss intro tracking ---
            if (m.species && m.species.isBoss && !m._announced) {
                m._announced = true;
                state.activeBoss = m;
                // Full cinematic (pad summons already played it in spawnBoss,
                // beached/hooked bosses arrive here) + standard 3-2-1 AFTER
                // the default 10s intro reveal.
                // Shore re-entries stay quiet: the name was said exactly
                // once at first arrival (beachFish thuds instead).
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.bossIntro) Ritual.bossIntro(state, m.species, m.x, m.y, m, undefined, undefined, m._reentry ? true : undefined);
                    else {
                        try { audio.playRoar(); } catch (e) {}
                        Particles.showFloatingText(state,
                            `⚠ ${m.species.name.toUpperCase()} HAS ARRIVED ⚠`,
                            m.x, m.y - 90, '#f59e0b');
                        state.screenShake = 20;
                    }
                    if (typeof Ritual !== 'undefined' && Ritual.fightCountdown) Ritual.fightCountdown(state, m, { delaySec: 10 });
                } catch (e) {}
            }

            // --- Priest finisher: at 0 HP it KNEELS instead of dying.
            // Burn/poison ticks land here too, so clamp first: the heart
            // must be ripped out by hand (E + SPACE), never burned down.
            if (m.species.id === 'leviathan_priest' && m._kneeling) {
                if (m.hp <= 0) m.hp = 1;
                try {
                    if (Math.random() < 0.4) {
                        Particles.spawnParticles(state, m.x, m.y - 50, '#7dd3fc', 1, { size: 3 });
                    }
                    m._kneelMsgT = (m._kneelMsgT || 0) - delta;
                    const pd = Math.hypot(p.x - m.x, p.y - m.y);
                    if (pd < 220 && m._kneelMsgT <= 0) {
                        m._kneelMsgT = 2.2;
                        Particles.showFloatingText(state, 'ⓔ RIP THE HEART — press E!', m.x, m.y - 110, '#fef08a');
                    }
                } catch (e) {}
                continue;
            }

            // --- Death ---
            if (m.hp <= 0) {
                if (isMPClient) continue; // host owns death + loot
                // Priest at 0 HP kneels for the heart-rip finisher.
                if (m.species && m.species.id === 'leviathan_priest' && !m._kneeling) {
                    m._kneeling = true;
                    m.hp = 1;
                    m.skillCooldown = 9999;
                    m.stunTimer = 0;
                    m.isCharging = false;
                    m._kneelMsgT = 0;
                    state.screenShake = Math.max(state.screenShake || 0, 18);
                    try {
                        Particles.spawnParticles(state, m.x, m.y, '#0ea5e9', 40, { size: 6 });
                        if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                            Combat.roarShockwave(state, m.x, m.y, { color: '#0ea5e9', rings: 3, maxR: 220, shake: 14 });
                        }
                    } catch (e) {}
                    Particles.showFloatingText(state, '💙 THE PRIEST KNEELS — RIP ITS HEART!', m.x, m.y - 110, '#7dd3fc');
                    try {
                        if (typeof UI !== 'undefined' && UI.updateStatusBanner) {
                            UI.updateStatusBanner('It kneels! Get close and press <b>E</b>, then mash <b>SPACE</b> to rip the heart free!', 'Finisher', 'sky');
                        }
                    } catch (e) {}
                    try { audio.playBossRoar(); } catch (e) {}
                    continue;
                }
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
                    try {
                        if (typeof Combat !== 'undefined' && Combat.sonicBoom) {
                            Combat.sonicBoom(state, m.x, m.y, {
                                color: (m.species && m.species.color) || '#f59e0b',
                                rings: 4, maxR: 300, shake: 0, lines: 18,
                            });
                        }
                    } catch (e) {}
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
                    // The black sea lifts once the Star-Eater falls.
                    try {
                        if (m.species.id === 'void_shepherd' && typeof Ritual !== 'undefined' && Ritual.clearVoidBlackSea) Ritual.clearVoidBlackSea(state);
                        if (m.species.id === 'stormlord_hydra' && typeof Ritual !== 'undefined') {
                            if (Ritual.clearHydraSea) Ritual.clearHydraSea(state);
                            if (Ritual.unwindBossStorm) Ritual.unwindBossStorm(state);
                        }
                    } catch (e) {}
                    // Boss down: release its grips (tether, apocalypse).
                    try {
                        state.player.tether = null;
                        state.player.voidDrain = null;
                        document.getElementById('tension-hud').classList.add('hidden');
                    } catch (e) {}
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
                    // Queue + rest AFTER the victory banner so the breather
                    // call-out isn't overwritten (it announces the next turn).
                    try {
                        if (typeof Ritual !== 'undefined' && Ritual.noteBossEnded) {
                            Ritual.noteBossEnded(state, (m.species.name || 'Boss') + ' slain', true);
                        }
                    } catch (e0) {}
                }

                // Personal carcass on clients: tagged _local with a unique
                // id so the host snapshot merge keeps it (see syncLoot).
                let lid = 'l' + (state._lootSeq = (state._lootSeq || 0) + 1);
                let lilocal = false;
                try {
                    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
                        lilocal = true;
                        lid = 'lc' + Date.now().toString(36) + ((state._lootSeq % 1296).toString(36));
                    }
                } catch (e) {}
                const ldrop = { id: lid, species: m.species, x: m.x, y: m.y };
                if (lilocal) ldrop._local = true;
                state.groundLoot.push(ldrop);
                // Tombstone so a lagged host snapshot can't resurrect this
                // kill into a second carcass (see Multiplayer.noteClaimed).
                try { if (typeof Multiplayer !== 'undefined' && Multiplayer.noteClaimed) Multiplayer.noteClaimed(m.id); } catch (e) {}
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
            // Swim-in arrivals still GLIDE to the arena while dormant.
            if (m.dormantUntil && state.time < m.dormantUntil) {
                if (m.invulnerableTimer > 0) m.invulnerableTimer -= delta;
                if (m._swimIn) {
                    const sx = m._swimIn.x - m.x, sy = m._swimIn.y - m.y;
                    const sd = Math.hypot(sx, sy) || 1;
                    const step = (m._swimIn.spd || 260) * delta;
                    if (sd <= Math.max(24, step)) {
                        m.x = m._swimIn.x; m.y = m._swimIn.y;
                        delete m._swimIn;
                        // Sky-drop impact: ring + dust + thud on touchdown.
                        if (m._introImpact) {
                            delete m._introImpact;
                            try {
                                state.delayedBlasts.push({
                                    x: m.x, y: m.y, radius: 220, damage: 0,
                                    timer: 0.3, color: '#fbbf24', shake: 22,
                                });
                                Particles.spawnParticles(state, m.x, m.y, '#e2e8f0', 40, { size: 6 });
                                try { audio.playExplosion(); } catch (e) {}
                            } catch (e) {}
                            state.screenShake = Math.max(state.screenShake || 0, 22);
                        }
                    } else {
                        m.x += (sx / sd) * step;
                        m.y += (sy / sd) * step;
                    }
                }
                // Per-tick arrival FX by intro mode (theatre only).
                // Portal-grow: bosses that step out of portals scale from
                // 25% to full across the cinematic (see drawBossMonster).
                // VOID GATE 3-act play (see spawnVoidBossFromGate):
                //  act I holds it INSIDE the portal, growing 0.05 -> 1;
                //  act II breaches (roar) and assigns the swim;
                //  act III names it ONCE on arrival. Never swims + grows.
                try {
                    if (m._voidPortal) {
                        const vt = state.time || 0;
                        if (vt < (m._voidSwimAt || 0)) {
                            const g0 = (typeof m._voidGrowFrom === 'number') ? m._voidGrowFrom : vt;
                            const g1 = (typeof m._voidGrowTo === 'number') ? m._voidGrowTo : vt;
                            if (vt < g0) { m._sizeMult = 0.05; m._voidFade = 0; }
                            else {
                                const k = Math.max(0, Math.min(1, (vt - g0) / Math.max(0.01, g1 - g0)));
                                m._sizeMult = 0.05 + 0.95 * k;
                                m._voidFade = k;
                            }
                            // Growing crackle inside the gate.
                            if (Math.random() < 0.5 && typeof Particles !== 'undefined') {
                                try {
                                    Particles.spawnParticles(state, m._voidPortal.x + (Math.random() - 0.5) * 220, m._voidPortal.y + (Math.random() - 0.5) * 160, '#a855f7', 2, { size: 3 });
                                } catch (e2) {}
                            }
                        } else {
                            if (!m._voidBreached && (m.hp || 0) > 0) {
                                m._voidBreached = true;
                                const a = m._voidArena || { x: m.x, y: m.y };
                                const d = Math.hypot(a.x - m.x, 0) || 1;
                                m._swimIn = { x: a.x, y: a.y, spd: d / 7 };
                                try { audio.playBossRoar(); } catch (e2) {}
                                try {
                                    if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                                        Combat.roarShockwave(state, m.x, m.y, { color: '#a855f7', rings: 5, maxR: 340, shake: 22, gap: 0.16 });
                                    }
                                } catch (e2) {}
                                if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                                    try { Particles.spawnWaterSplashes(state, m.x, m.y + 20, 20); } catch (e2) {}
                                }
                                Particles.showFloatingText(state, '🌌 THE STAR-EATER BREACHES!', m.x, m.y - 130, '#c084fc');
                                state.screenShake = Math.max(state.screenShake || 0, 24);
                            }
                            m._sizeMult = 1;
                            m._voidFade = 1;
                            // Arrival: ONE name banner as it grounds ashore.
                            if (!m._swimIn && m._voidBreached && !m._voidNamed && (m.hp || 0) > 0) {
                                m._voidNamed = true;
                                try {
                                    state.delayedBlasts = state.delayedBlasts || [];
                                    state.delayedBlasts.push({
                                        x: m.x, y: m.y, radius: 300, damage: 0,
                                        timer: 0.4, color: '#22d3ee', shake: 24,
                                    });
                                } catch (e2) {}
                                try {
                                    const host = document.getElementById('game-container') || document.body;
                                    const old = document.getElementById('boss-intro-banner');
                                    if (old) old.remove();
                                    const meta = { title: 'THE STAR-EATER', color: '#a855f7', glow: '#22d3ee' };
                                    const div = document.createElement('div');
                                    div.id = 'boss-intro-banner';
                                    div.innerHTML =
                                        `<div class="boss-intro-kicker">UNHOLY CATCH</div>` +
                                        `<div class="boss-intro-name" style="--boss-color:${meta.color};--boss-glow:${meta.glow};">${m.species.name.toUpperCase()}</div>` +
                                        `<div class="boss-intro-sub">${meta.title}</div>`;
                                    host.appendChild(div);
                                    setTimeout(() => { try { div.remove(); } catch (e) {} }, 3200);
                                } catch (e2) {}
                                try { audio.playBossRoar(); } catch (e2) {}
                            }
                        }
                    } else if (typeof m._sizeMult === 'number' && m._sizeMult < 1) {
                        const total = Math.max(1, m._introDur || 6);
                        const left = Math.max(0, (m.dormantUntil || 0) - state.time);
                        const from = 0.25;
                        m._sizeMult = Math.min(1, Math.max(from, 1 - left / total) * (1 - from) + from);
                    }
                } catch (e) {}
                try {
                    m._introFxT = (m._introFxT || 0) - delta;
                    if (m._introFxT <= 0) {
                        const how = m._introMode || 'swim';
                        if (how === 'rise' && typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                            Particles.spawnWaterSplashes(state, m.x + (Math.random() - 0.5) * 90, m.y + 24, 5);
                            m._introFxT = 0.14;
                        } else if (how === 'fall') {
                            Particles.spawnParticles(state, m.x + (Math.random() - 0.5) * 60, m.y - 120, '#e2e8f0', 3, { size: 4 });
                            m._introFxT = 0.1;
                        } else if (m._swimIn && typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                            Particles.spawnWaterSplashes(state, m.x, m.y + 16, 2);
                            m._introFxT = 0.3;
                        } else {
                            m._introFxT = 0.5;
                        }
                        if ((how === 'rise' || how === 'fall') && Math.random() < 0.3) {
                            state.screenShake = Math.max(state.screenShake || 0, 6);
                        }
                    }
                } catch (e) {}
                continue;
            }

            m.ageOnLand += delta;
            m.skillCooldown -= delta;
            if (m._voidChannelCd > 0) m._voidChannelCd -= delta;
            if (m._hydraChannelCd > 0) m._hydraChannelCd -= delta;
            if (m._overloadCd > 0) m._overloadCd -= delta;
            // Signature-orb gather progress (render reads t/dur).
            if (m._chargeOrb) {
                m._chargeOrb.t = (m._chargeOrb.t || 0) + delta;
                if (m._chargeOrb.t > (m._chargeOrb.dur || 2) + 0.5) m._chargeOrb = null;
            }
            m.actionTimer -= delta;
            m.meleeCd -= delta;
            if (m.stealthTimer > 0) m.stealthTimer -= delta;
            if (m.invulnerableTimer > 0) m.invulnerableTimer -= delta;
            if (m.enrageTimer > 0) {
                m.enrageTimer -= delta;
                if (m.enrageTimer <= 0) m.isEnraged = false;
            }

            // --- Phase 2: enrage at < 40% HP ---
            // (Crimson Emperor runs its own 3-phase script below instead.)
            const hpRatio = m.hp / (m.maxHp || m.species.maxHp || 100);
            if (m.species.id === 'crimson_emperor') {
                this.updateEmperorPhases(state, m, hpRatio);
            } else if (m.species.id === 'void_shepherd') {
                this.updateVoidPhases(state, m, hpRatio);
            } else if (m.phase === 1 && hpRatio < 0.4) {
                m.phase = 2;
                m.isEnraged = true;
                m.enrageTimer = 999;
                state.screenShake = 14;
                Particles.spawnParticles(state, m.x, m.y, '#dc2626', 40, { size: 6 });
                Particles.showFloatingText(state, "⚠ ENRAGED! ⚠", m.x, m.y - 60, '#dc2626');
                try { audio.playRoar(); } catch (e) {}
                // Enrage roar: red shockwaves out of the mouth (theatre).
                try {
                    const mouth = this.mouthXY(m);
                    this.roarShockwave(state, mouth.x, mouth.y, { color: '#ef4444', rings: 3, maxR: 200, shake: 14 });
                } catch (e) {}
            }

            const dx = p.x - m.x;
            const dy = p.y - m.y;
            const dist = Math.hypot(dx, dy) || 1;
            m.angle = Math.atan2(dy, dx);
            // Void self-destruct fuse lit (see updateVoidPhases).
            if (m.species.id === 'void_shepherd' && m._selfDestructAt && state.time >= m._selfDestructAt && m.hp > 0) {
                try { this.detonateVoidBoss(state, m); } catch (e) {}
                state.monstersOnLand.splice(i, 1);
                continue;
            }

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
            // Map-aware: the old mainland-only clamp teleported every isle
            // catch to x=wb (invisible + gone from the island).
            if (typeof WorldSystem !== 'undefined' && WorldSystem.clampEntity) {
                try { WorldSystem.clampEntity(state, m, size); } catch (e) {}
            } else {
            m.x = Utils.clamp(m.x, B.MIN_X + size, state.waterBoundaryX - size);
            m.y = Utils.clamp(m.y, B.MIN_Y + size, B.MAX_Y - size);
            }

            // --- Contact damage (with opener telegraph) ---
            // First touch after closing in is a WARNING, not damage: red
            // ring + screech + 0.4s grace. Back off and the opener whiffs;
            // standing in it eats the hit like before. Rhythm hits (0.6s)
            // are unchanged — dodge by leaving.
            const hitDist = (p.radius || 15) + size;
            if (dist < hitDist + 46 && !m._meleeWarned) {
                m._meleeWarned = true;
                m.meleeCd = Math.max(m.meleeCd || 0, 0.4);
                state.delayedBlasts.push({
                    x: m.x, y: m.y, radius: hitDist + 26, damage: 0,
                    timer: 0.4, color: '#ef4444', shake: 0,
                });
                Particles.showFloatingText(state, '⚠ TEETH!', m.x, m.y - 50, '#f87171');
                try { audio.playFishScreech(); } catch (e) {}
            } else if (dist > hitDist + 90) {
                m._meleeWarned = false; // fully disengaged: next touch warns again
            }
            if (dist < hitDist && m.meleeCd <= 0) {
                this.handleDirectMeleeContact(state, m, p, dist, dx, dy);
                m.meleeCd = 0.6;
            }
            // Glue walls are solid for beached monsters too.
            try {
                if (typeof GlueWall !== 'undefined' && GlueWall.collide) GlueWall.collide(state, m, size * 0.7);
            } catch (e) {}
        }

        this.updateGroundLoot(state, delta);
    },

    // ============================================================
    //  DELAYED BLASTS
    // ============================================================
    // Mouth position of a monster/fish (for roar shockwaves that erupt
    // FROM the mouth, not the body center). Falls back to center.
    mouthXY(m) {        try {
            const size = (m.species && m.species.size) || 40;
            const a = (typeof m.angle === 'number') ? m.angle : 0;
            return { x: m.x + Math.cos(a) * size * 0.7, y: m.y + Math.sin(a) * size * 0.7 };
        } catch (e) { return { x: (m && m.x) || 0, y: (m && m.y) || 0 }; }
    },

    // SONIC BOOM — pure anime roar VFX (no damage, no telegraphs):
    // impact flash + expanding ripple rings + radiating speed lines +
    // a rotating dashed "air distortion" ring, all from one epicenter.
    // MP-safe: every boom carries a globally-unique id + full params so
    // snapshots and mirrors can merge by id (see syncSonicFx).
    _sonicSeq: 0,
    sonicBoom(state, x, y, opts) {
        try {
            const o = opts || {};
            const dur = Math.max(0.3, Math.min(2.5, o.dur || 0.8));
            const rings = Math.max(1, Math.min(8, o.rings || 3));
            const lines = Math.max(0, Math.min(40, o.lines === undefined ? 14 : o.lines));
            const seeds = [];
            for (let i = 0; i < lines; i++) seeds.push(((i / Math.max(1, lines)) * Math.PI * 2) + Math.random() * 0.2);
            state.sonicBooms = state.sonicBooms || [];
            if (state.sonicBooms.length > 24) state.sonicBooms.splice(0, state.sonicBooms.length - 24);
            this._sonicSeq = (this._sonicSeq + 1) % 46656;
            state.sonicBooms.push({
                id: 'sb' + Date.now().toString(36) + this._sonicSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36),
                x, y, t0: state.time || 0, dur,
                rings, maxR: o.maxR || 220,
                color: o.color || '#f87171',
                lines, seeds,
                flash: o.flash === undefined ? true : !!o.flash,
            });
            state.screenShake = Math.max(state.screenShake || 0, o.shake || 14);
        } catch (e) {}
    },

    // Roar shockwave: mouth-origin sonic boom (visual) + optional single
    // gameplay ring when damage > 0 (kept for compat — all live roars
    // pass damage 0 and get pure theatre).
    roarShockwave(state, x, y, opts) {
        try {
            const o = opts || {};
            this.sonicBoom(state, x, y, {
                color: o.color, rings: o.rings, maxR: o.maxR,
                shake: o.shake, dur: 0.5 + (o.rings || 3) * 0.09,
                lines: 10 + (o.rings || 3) * 3,
            });
            if ((o.damage || 0) > 0) {
                state.delayedBlasts = state.delayedBlasts || [];
                state.delayedBlasts.push({
                    x, y, radius: o.maxR || 220, damage: o.damage,
                    timer: 0.5, color: o.color || '#f87171', shake: o.shake || 14,
                    stunOnBlast: o.stun || 0,
                });
            }
        } catch (e) {}
    },

    // Crimson Emperor's 3-phase script (70% Blood Moon, 30% mutation).
    // Called instead of the generic 40% enrage for this boss.
    updateEmperorPhases(state, m, hpRatio) {
        try {
            if (m.phase === 1 && hpRatio < 0.7) {
                m.phase = 2;
                m.isEnraged = true;
                m.enrageTimer = 999;
                state.bloodMoonUntil = (state.time || 0) + 90;
                state.screenShake = Math.max(state.screenShake || 0, 18);
                Particles.spawnParticles(state, m.x, m.y, '#dc2626', 60, { size: 6 });
                Particles.showFloatingText(state, '🌕 BLOOD MOON — THE EMPEROR RAGES!', m.x, m.y - 80, '#ef4444');
                try { audio.playBossRoar(); } catch (e) {}
                const mouth = this.mouthXY(m);
                this.roarShockwave(state, mouth.x, mouth.y, { color: '#ef4444', rings: 4, maxR: 280, shake: 18 });
            } else if (m.phase === 2 && hpRatio < 0.3) {
                m.phase = 3;
                state.screenShake = Math.max(state.screenShake || 0, 22);
                // Mutation: tendrils burst from the belly (particles).
                for (let i = 0; i < 4; i++) {
                    const a = (Math.PI * 2 / 4) * i + 0.4;
                    Particles.spawnParticles(state, m.x + Math.cos(a) * 40, m.y + Math.sin(a) * 40, '#7f1d1d', 25, { size: 5 });
                }
                Particles.showFloatingText(state, '☠️ ABYSSAL MUTATION — IT CRAWLS ASHORE!', m.x, m.y - 80, '#f87171');                try { audio.playBossRoar(); } catch (e) {}
                const mouth2 = this.mouthXY(m);
                this.roarShockwave(state, mouth2.x, mouth2.y, { color: '#991b1b', rings: 5, maxR: 320, shake: 20 });
            }
        } catch (e) {}
    },

    // Void Leviathan's script: P1 unstable star, COSMIC RIFT entry at
    // 65% (then P2), mutation at 30% (P3 star-eater), Void Apocalypse
    // final enrage below 10%.
    updateVoidPhases(state, m, hpRatio) {
        try {
            const p = state.player;
            if (m.phase === 1 && hpRatio < 0.65) {
                // No tug-of-war: it tears the rift open and crawls out.
                m.phase = 2;
                m.isEnraged = true;
                m.enrageTimer = 999;
                state.screenShake = Math.max(state.screenShake || 0, 18);
                Particles.spawnParticles(state, m.x, m.y, '#a855f7', 50, { size: 6 });
                Particles.showFloatingText(state, '🌌 COSMIC RIFT — IT CRAWLS!', m.x, m.y - 80, '#a855f7');
                try { audio.playBossRoar(); } catch (e) {}
                const mouth = this.mouthXY(m);
                this.roarShockwave(state, mouth.x, mouth.y, { color: '#7c3aed', rings: 4, maxR: 280, shake: 18 });
                // Rift-entry burst: tail slams chase you as it lands.
                for (let i = 0; i < 3; i++) {
                    state.delayedBlasts.push({
                        x: p.x + (Math.random() - 0.5) * 160,
                        y: p.y + (Math.random() - 0.5) * 160,
                        radius: 100, damage: Math.round(120 + (m.species.attack || 400) * 0.15),
                        timer: 1.2 + i * 1.4, color: '#6d28d9', shake: 16, stunOnBlast: 0.4,
                    });
                }
            } else if (m.phase === 2 && hpRatio < 0.3) {
                m.phase = 3;
                // Star-Eater's clock: 60s to kill it or it eats itself
                // (no loot — see detonateVoidBoss).
                m._selfDestructAt = (state.time || 0) + 60;
                state.screenShake = Math.max(state.screenShake || 0, 22);
                Particles.spawnParticles(state, m.x, m.y, '#ef4444', 40, { size: 5 });
                Particles.spawnParticles(state, m.x, m.y, '#a855f7', 40, { size: 5 });
                Particles.showFloatingText(state, '☠️ STAR-EATER — ITS EYES OPEN! 💥60s💥', m.x, m.y - 80, '#ef4444');
                try { audio.playBossRoar(); } catch (e) {}
                const mouth2 = this.mouthXY(m);
                this.roarShockwave(state, mouth2.x, mouth2.y, { color: '#991b1b', rings: 5, maxR: 320, shake: 20 });
            } else if (hpRatio < 0.1 && !m._apocalypse) {
                // VOID APOCALYPSE: root + bleed until it dies. Burn it down.
                m._apocalypse = true;
                p.stunTimer = Math.max(p.stunTimer || 0, 2.0);
                p.voidDrain = { dps: 6 };
                state.screenShake = Math.max(state.screenShake || 0, 24);
                Particles.showFloatingText(state, '🕳 VOID APOCALYPSE — BURN IT DOWN!', p.x, p.y - 70, '#a855f7');
                try { UI.triggerDamageFlash(); } catch (e) {}
                try { audio.playBossRoar(); } catch (e) {}
            }
        } catch (e) {}
    },

    // Struck lightning: a rendered jagged bolt from the sky + ground
    // flash. Visual-only unless damage > 0 (then a matching telegraph
    // ring pops with it). Bolts render from state.lightnings (see
    // drawLightning) — MP peers see rings, the bolt itself is local
    // theatre like all custom intro FX.
    _boltSeq: 0,
    strikeLightning(state, x, y, opts) {
        try {
            const o = opts || {};
            state.lightnings = state.lightnings || [];
            if (state.lightnings.length > 16) state.lightnings.splice(0, state.lightnings.length - 16);
            this._boltSeq = (this._boltSeq + 1) % 46656;
            // Jagged bolt path, deterministic per strike.
            const segs = [];
            let bx = x + (Math.random() - 0.5) * 60;
            const top = y - 420;
            const steps = 7;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                segs.push([bx + (Math.random() - 0.5) * (1 - t) * 90, top + (y - top) * t]);
            }
            segs.push([x, y]);
            state.lightnings.push({
                id: 'lt' + Date.now().toString(36) + this._boltSeq.toString(36),
                segs, x, y, t0: state.time || 0, dur: o.dur || 0.35,
                color: o.color || '#fef08a', width: o.width || 5,
            });
            Particles.spawnParticles(state, x, y, o.color || '#fef08a', 14, { size: 4 });
            state.screenShake = Math.max(state.screenShake || 0, o.shake || 10);
            try { audio.playThunder(); } catch (e) {}
            if ((o.damage || 0) > 0) {
                state.delayedBlasts = state.delayedBlasts || [];
                state.delayedBlasts.push({
                    x, y, radius: o.radius || 85, damage: o.damage,
                    timer: o.timer === undefined ? 0.55 : o.timer,
                    color: o.color || '#facc15', shake: o.shake || 16,
                    stunOnBlast: o.stun || 0,
                });
            }
        } catch (e) {}
    },

    // Void pits: black holes that drink the player. Standing in the
    // maw (within ~48px of center) CONSUMES you outright — instant death,
    // no mitigation. Tuned escapable: 0.8s forming grace, pull slightly
    // above run speed (dash + angle out to live), pits die after 5s.
    updateVoidPits(state, delta) {
        try {
            if (!state.groundHazards) return;
            const p = state.player;
            if (!p || p.isDead) return;
            for (const h of state.groundHazards) {
                if (!h || !h.voidPit || !(h.duration > 0)) continue;
                if (h.duration > 4.2) continue; // forming — no pull yet
                const dx = h.x - p.x, dy = h.y - p.y;
                const d = Math.hypot(dx, dy) || 1;
                const R = h.radius || 110;
                if (d < 48) {
                    // CONSUMED BY THE VOID.
                    Particles.showFloatingText(state, '🕳 CONSUMED BY THE VOID', p.x, p.y - 60, '#000000');
                    try { UI.triggerDamageFlash(); } catch (e) {}
                    if (typeof Player !== 'undefined') Player.die(state);
                    return;
                }
                if (d < R + 170) {
                    const sp = 300;
                    if (typeof Player !== 'undefined' && Player.addPull) {
                        try { Player.addPull(state, (dx / d) * sp, (dy / d) * sp, 0.12); } catch (e) {}
                    } else {
                        p.x += (dx / d) * sp * delta;
                        p.y += (dy / d) * sp * delta;
                    }
                }
                // Keep a portal visual glued to each pit (clients conjure
                // their own — no wire cost, self-healing on lag).
                try {
                    state.realmFx = state.realmFx || [];
                    let vis = null;
                    for (const g of state.realmFx) {
                        if (g && g.pit && Math.hypot(g.x - h.x, g.y - h.y) < 60) { vis = g; break; }
                    }
                    if (!vis) {
                        state.realmFx.push({ x: h.x, y: h.y, t0: state.time || 0, dur: Math.max(0.5, h.duration || 5), pit: true });
                    }
                } catch (e) {}
            }
        } catch (e) {}
    },

    // Void self-destruct: 60s into P3 the Star-Eater eats itself —
    // black-hole bloom (wide, then tight, then gone), no loot, no
    // tribute, no index. Kill it first if you want the spoils.
    detonateVoidBoss(state, m) {
        try {
            state.realmFx = state.realmFx || [];
            state.realmFx.push({ x: m.x, y: m.y, t0: state.time || 0, dur: 3 });
            state.delayedBlasts = state.delayedBlasts || [];
            [[0.3, 260], [0.8, 340], [1.3, 420]].forEach(([timer, radius]) => {
                state.delayedBlasts.push({
                    x: m.x, y: m.y, radius, damage: 0,
                    timer, color: '#4c1d95', shake: 26,
                });
            });
            Particles.spawnParticles(state, m.x, m.y, '#a855f7', 60, { size: 6 });
            state.screenShake = Math.max(state.screenShake || 0, 30);
            try { audio.playBossRoar(); } catch (e) {}
            Particles.showFloatingText(state, '🕳 THE VOID CONSUMES ITSELF — NOTHING REMAINS', m.x, m.y - 100, '#c084fc');
            if (state.activeBoss === m) state.activeBoss = null;
            try { if (typeof Ritual !== 'undefined' && Ritual.clearVoidBlackSea) Ritual.clearVoidBlackSea(state); } catch (e) {}
            try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (e) {}
        } catch (e) {}
    },

    updateDelayedBlasts(state, delta) {
        if (!state.delayedBlasts) state.delayedBlasts = [];
        const p = state.player;
        // Expired sonic booms leave the FX list (rendered by time).
        // Same for void realm portals and lightning bolts.
        try {
            if (state.sonicBooms && state.sonicBooms.length) {
                const t = state.time || 0;
                state.sonicBooms = state.sonicBooms.filter(b => b && (t - (b.t0 || 0)) < (b.dur || 0.8));
            }
            if (state.realmFx && state.realmFx.length) {
                const t2 = state.time || 0;
                state.realmFx = state.realmFx.filter(g => g && (t2 - (g.t0 || 0)) < (g.dur || 6));
            }
            if (state.lightnings && state.lightnings.length) {
                const t3 = state.time || 0;
                state.lightnings = state.lightnings.filter(l => l && (t3 - (l.t0 || 0)) < (l.dur || 0.35));
            }
        } catch (e) {}

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
                state.screenShake = Math.max(state.screenShake || 0, b.shake || 8);
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
                    state.screenShake = Math.max(state.screenShake || 0, 10);
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
                state.screenShake = Math.max(state.screenShake || 0, 6);
                if (p.hp <= 0) return;
            }
        }

        // Host fish-skill projectiles WITHOUT a catcher owner (bosses) —
        // same one-hit-per-id rule. Catcher-owned shots are fully
        // simulated in Projectiles.update now (shared threat, personal
        // damage), so intake skips them — no double hits.
        for (const b of (state.projectiles || [])) {
            if (!b.id || cd['p:' + b.id]) continue;
            if (b.owner || b.ownerPid) continue;
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
            // Glue wall catches enemy fire first (pierce ignores the goo).
            try {
                if (typeof GlueWall !== 'undefined' && GlueWall.bulletHit && GlueWall.bulletHit(state, b)) {
                    state.bullets.splice(i, 1);
                    continue;
                }
            } catch (e) {}
            if (dist < (p.radius || 15) + (b.radius || 6)) {
                const dealt = this.damagePlayer(state, b.damage || 5);
                Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25,
                    b.color || '#facc15');
                Player.refreshHUD(state);
                UI.triggerDamageFlash();
                state.screenShake = Math.max(state.screenShake || 0, 6);
                Particles.spawnParticles(state, b.x, b.y, b.color || '#facc15', 8);
                try { audio.playHurt(); } catch (e) {}
                state.bullets.splice(i, 1);
                if (p.hp <= 0) Player.die(state);
                continue;
            }

            if (b.life <= 0 || (function () {
                // Map-aware cull: island shots used to die instantly past
                // B.MAX_X (x≈10000), so isle fights shot blanks.
                try {
                    if (typeof WorldSystem !== 'undefined' && WorldSystem.bulletBounds) {
                        const bb = WorldSystem.bulletBounds(state);
                        return b.x < bb.x0 || b.x > bb.x1 || b.y < bb.y0 || b.y > bb.y1;
                    }
                } catch (e) {}
                return b.x < B.MIN_X || b.x > B.MAX_X || b.y < B.MIN_Y || b.y > B.MAX_Y;
            })()) {
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

        // Fight countdown cinematic: no NEW skill casts from anyone (the
        // boss is dormant anyway; this covers wild bystanders) — movement
        // and already-flying shots continue.
        const frozen = typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil;
        // Blood Moon ambience (Emperor phase 2+): red motes drift while it lasts.
        try {
            if (typeof state.bloodMoonUntil === 'number' && state.time < state.bloodMoonUntil && Math.random() < 0.12) {
                Particles.spawnParticles(state, p.x + (Math.random() - 0.5) * 700, p.y + (Math.random() - 0.5) * 500, '#7f1d1d', 1, { size: 4 });
            }
        } catch (e) {}
        const slowMult = isSlowed ? 0.3 : 1.0;
        const baseSpeed = (m.species.speed || 4) * 22;
        const speedMult =
            (m.isEnraged ? 1.45 : 1.0) *
            (m.stealthTimer > 0 ? 1.25 : 1.0) *
            (m.phase >= 2 ? 1.15 : 1.0) *
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

                if (!frozen && m.skillCooldown <= 0 && this.pickSkill(m)) {
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

                if (!frozen && m.skillCooldown <= 0 && this.pickSkill(m)) {
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
                    if (m.phase >= 2) cd *= 0.65;
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
        // Hydra phase 2 (ashore): a different, meaner shore moveset.
        // Storm-orb convergence locks it like the void orb (shore too).
        try {
            if (m && m.species && m.species.id === 'stormlord_hydra' && m.phase === 2) {
                if ((m._hydraChannelCd || 0) > 0) return null;
                const shore = ['hydraLightning', 'hydraRoar', 'hydraBiteShore', 'hydraTether', 'hydraVenom', 'hydraStormOrb', 'danmakuRing', 'danmakuFan'];
                return shore[Math.floor(Math.random() * shore.length)];
            }
        } catch (e) {}
        // Priest ashore: land kit, Heart Overload on a strict 15s clock.
        try {
            if (m && m.species && m.species.id === 'leviathan_priest') {
                if ((m._overloadCd || 0) <= 0) { m._overloadCd = 15; return 'heartOverload'; }
                const land = (m.species.landSkills && m.species.landSkills.length)
                    ? m.species.landSkills : (m.species.skills || []);
                if (land.length) return land[Math.floor(Math.random() * land.length)];
            }
        } catch (e) {}
        // Hydra at sea (hooked phase 1): no other cast mid-converge.
        try {
            if (m && m.species && m.species.id === 'stormlord_hydra') {
                if ((m._hydraChannelCd || 0) > 0) return null;
            }
        } catch (e) {}
        // Crimson Emperor: 3-phase movesets, plus a death-throe below 10%
        // HP that spams the Last Bite.
        try {
            if (m && m.species && m.species.id === 'crimson_emperor') {
                const r = m.hp / (m.maxHp || 1);
                if (r < 0.1 && Math.random() < 0.5) return 'sovereignBite';
                if (m.phase >= 3) {
                    const p3 = ['tentacleSlam', 'bloodBeam', 'bloodBeam', 'sovereignBite', 'goreBarbs', 'abyssalCharge'];
                    return p3[Math.floor(Math.random() * p3.length)];
                }
                if (m.phase === 2) {
                    const p2 = ['abyssalCharge', 'crimsonMaelstrom', 'goreBarbs', 'tentacleSlam', 'bloodBeam'];
                    return p2[Math.floor(Math.random() * p2.length)];
                }
                const p1 = ['crimsonBreach', 'tailSlapWave', 'homingBubbles'];
                return p1[Math.floor(Math.random() * p1.length)];
            }
        } catch (e) {}
        // Void Leviathan: breach QTE splits P1/P2 at 65%, mutation at 30%,
        // frenzy barrage below 10%.
        try {
            if (m && m.species && m.species.id === 'void_shepherd') {
                // Star-Eater Orb convergence locks the boss: while the orb
                // gathers it cannot cast anything else.
                if ((m._voidChannelCd || 0) > 0) return null;
                const r = m.hp / (m.maxHp || 1);
                if (r < 0.1 && Math.random() < 0.5) return 'phaseBarrage';
                if (m.phase >= 3) {
                    const p3 = ['cosmicBlast', 'cosmicBlast', 'phaseBarrage', 'starRain', 'realityShear', 'voidBarrage', 'voidStarEaterOrb', 'danmakuSpiral'];
                    return p3[Math.floor(Math.random() * p3.length)];
                }
                if (m.phase === 2) {
                    const p2 = ['realityShear', 'voidPit', 'starRain', 'cosmicBlast', 'voidBarrage', 'voidStarEaterOrb', 'danmakuRing'];
                    return p2[Math.floor(Math.random() * p2.length)];
                }
                const p1 = ['voidSpitting', 'voidBarrage', 'abyssalGeyser', 'voidTentacle', 'voidStarEaterOrb', 'danmakuFan'];
                return p1[Math.floor(Math.random() * p1.length)];
            }
        } catch (e) {}
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
                dragState: 'BEACHED',
                _monster: m, // back-ref: delayed skill stages can steer the real body
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
                // Real drag toward/away (0.3s velocity), never a teleport —
                // clampPlayer keeps the slide legal on every map.
                if (typeof Player !== 'undefined' && Player.addPull) {
                    try { Player.addPull(state, -localDirX * 600, -localDirY * 600, 0.3); } catch (e) {}
                } else {
                    const pullForce = 150;
                    p.x -= localDirX * pullForce;
                    p.y -= localDirY * pullForce;
                }

                const dmg = Math.round(atk * 0.85);
                const dealt = this.damagePlayer(state, dmg, { attacker: m, knockback: 0 });
                Particles.showFloatingText(state, `🌀 PULL -${dealt}`,
                    p.x, p.y - 25, '#8b5cf6');
                state.screenShake = 10;

                const B = CONFIG.WORLD;
                // Map-aware knockback (same teleport family as the monster
                // clamp): clampPlayer already handles the map next frame,
                // this just avoids a one-frame yank to the mainland surf.
                if (typeof WorldSystem !== 'undefined' && WorldSystem.clampEntity) {
                    try { WorldSystem.clampEntity(state, p, p.radius); } catch (e) {}
                } else {
                p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
                p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);
                }

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
                // Shove as velocity, never a teleport (see Player.addPull).
                if (typeof Player !== 'undefined' && Player.addPull) {
                    try { Player.addPull(state, localDirX * 240, localDirY * 240, 0.25); } catch (e) {}
                } else {
                    p.x += localDirX * 60;
                    p.y += localDirY * 60;
                }
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
                // Map-aware blink landing (same teleport family).
                if (typeof WorldSystem !== 'undefined' && WorldSystem.clampEntity) {
                    m.x = p.x + Math.cos(backAngle) * 60;
                    m.y = p.y + Math.sin(backAngle) * 60;
                    try { WorldSystem.clampEntity(state, m, 20); } catch (e) {}
                } else {
                m.x = Utils.clamp(p.x + Math.cos(backAngle) * 60,
                    B.MIN_X + 20, state.waterBoundaryX - 20);
                m.y = Utils.clamp(p.y + Math.sin(backAngle) * 60,
                    B.MIN_Y + 20, B.MAX_Y - 20);
                }
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
                state.screenShake = Math.max(state.screenShake || 0, 14);
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
        if (m.phase >= 2) damage *= 1.15;
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
        // Melee shove rides the pull channel too (smooth + map-legal).
        if (knockback > 0 && typeof Player !== 'undefined' && Player.addPull) {
            try { Player.addPull(state, (dx / dist) * 160, (dy / dist) * 160, 0.25); } catch (e) {}
        } else if (knockback > 0) {
            p.x += (dx / dist) * knockback;
            p.y += (dy / dist) * knockback;
        }

        // Pier/isle-aware: a hit on the deck must NOT yank you back to the
        // beach (the old beach-only clamp teleported pier walkers ashore).
        if (typeof WorldSystem !== 'undefined' && WorldSystem.clampPlayer) {
            try { WorldSystem.clampPlayer(state); } catch (e) {}
        } else {
        p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
        p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);
        }

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
        // Void Apocalypse bleed: the Leviathan drinks you until it dies.
        // Cleared on boss death / respawn (see death block + respawnAt).
        if (p.voidDrain) {
            const alive = state.activeBoss && (state.activeBoss.hp || 0) > 0;
            if (!alive) {
                p.voidDrain = null;
            } else {
                p.hp -= (p.voidDrain.dps || 6) * delta;
                p._drainTick = (p._drainTick || 0) + delta;
                if (p._drainTick >= 1) {
                    p._drainTick = 0;
                    Particles.showFloatingText(state, `🕳 -${Math.round((p.voidDrain.dps || 6))}/s`,
                        p.x, p.y - 30, '#a855f7');
                    Player.refreshHUD(state);
                    try { UI.triggerDamageFlash(); } catch (e) {}
                }
                if (Math.random() < 0.3) {
                    Particles.spawnParticles(state, p.x + (Math.random() - 0.5) * 40, p.y - 20, '#4c1d95', 1, { size: 4 });
                }
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
                // Bulletproof: a hazard without damagePerSec (hand-made /
                // corrupt sync) must never NaN the player's HP into godmode.
                const dps = Number(h.damagePerSec);
                const tickDmg = (Number.isFinite(dps) ? dps : 8) * delta;
                let dr = 0;
                if (typeof Shop !== 'undefined' && Shop.getDamageReduction) {
                    try { dr = Shop.getDamageReduction(state); } catch (e) {}
                }
                if (!Number.isFinite(dr)) dr = 0;
                if (p.umbrellaTimer > 0) dr = Math.min(0.8, dr + 0.35);
                if ((p.ironSkinT || 0) > 0) dr = Math.min(0.85, dr + 0.60);
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

    updateGroundLoot(state, delta) {
        const p = state.player;
        if (!state.groundLoot) state.groundLoot = [];
        // Real delta (not a hardcoded 1/60 step) so background ticks
        // (1s steps while the tab is hidden) advance loot at true speed.
        // Foreground callers pass ~0.016 — behavior there is unchanged.
        const DT = (typeof delta === 'number' && delta > 0) ? Math.min(delta, 5) : 0.016;

        const MAGNET_RADIUS = 90;
        const PICKUP_RADIUS = 55;
        // Small isle sands are less forgiving than the long mainland beach:
        // widen the grab so edge-beached loot stays reachable.
        let magnetR = MAGNET_RADIUS, pickupR = PICKUP_RADIUS;
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.islandOf && WorldSystem.islandOf(state)) {
                magnetR = 150; pickupR = 80;
            }
        } catch (e) {}
        // Magnet Charm item: loot flies from 3x farther, grabs at 2x range.
        try {
            if (state.player && (state.player.magnetT || 0) > 0) {
                magnetR *= 3; pickupR *= 2;
            }
        } catch (e) {}
        const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 0, MAX_X: 9999, MIN_Y: 0, MAX_Y: 9999 };

        for (let i = state.groundLoot.length - 1; i >= 0; i--) {
            const item = state.groundLoot[i];
            // Lost to the sea / out of bounds: sink with bubbles, then gone.
            // Pier decks and isle sand/piers count as SAFE ground — only true
            // open water (and off-map) sinks loot now.
            if (!item.sinking) {
                // Island rooms live far past B.MAX_X: the mainland
                // out-of-bounds pre-check must not condemn isle loot before
                // lootSafe even runs (that sank EVERY island drop, even on
                // dry sand).
                let lost = false;
                try {
                    const isl = (typeof WorldSystem !== 'undefined' && WorldSystem.islandOf) ? WorldSystem.islandOf(state) : null;
                    if (isl) {
                        const r = isl.room;
                        lost = item.x < r.x0 - 20 || item.x > r.x1 + 20 ||
                            item.y < r.y0 - 20 || item.y > r.y1 + 20;
                        if (!lost && typeof WorldSystem.lootSafe === 'function') {
                            lost = !WorldSystem.lootSafe(state, item.x, item.y);
                        }
                    } else {
                        lost = item.x < B.MIN_X - 20 || item.x > B.MAX_X + 20 ||
                            item.y < B.MIN_Y - 20 || item.y > B.MAX_Y - 20;
                        if (!lost) {
                            try {
                                if (typeof WorldSystem !== 'undefined' && WorldSystem.lootSafe) {
                                    lost = !WorldSystem.lootSafe(state, item.x, item.y);
                                } else {
                                    lost = item.x > state.waterBoundaryX + 15;
                                }
                            } catch (e) {
                                lost = item.x > state.waterBoundaryX + 15;
                            }
                        }
                    }
                } catch (e) {
                    lost = item.x < B.MIN_X - 20 || item.x > B.MAX_X + 20 ||
                        item.y < B.MIN_Y - 20 || item.y > B.MAX_Y - 20;
                }
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
                item.sinking -= DT;
                item.y += 22 * DT; // settle down
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

            // Rot timer: unclaimed loot sinks away (key items linger
            // longer). Stops full-bucket / far-flung drops piling up
            // forever and softens the "catch and forget" clutter.
            if (!item.sinking) {
                item.age = (item.age || 0) + DT;
                const ttl = (item.item && item.item.keyItem) ? 300 : 150;
                const left = ttl - item.age;
                if (left <= 0) {
                    item.sinking = 0.8;
                    item.sinkMax = 0.8;
                } else if (left <= 15 && !item._rotWarned && dist < 600) {
                    item._rotWarned = true;
                    if (typeof Particles !== 'undefined') {
                        Particles.showFloatingText(state, 'Fading away...', item.x, item.y - 20, '#94a3b8');
                    }
                }
            }

            // Host owns loot physics — clients only pick up (then claim)
            const isMPClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
            // Full bucket: leave loot where it lies instead of dragging a
            // dead pile to the player's feet. One global hint (throttled),
            // not one "BUCKET FULL!" text per item — freeing space resumes
            // the magnet on the very next frame.
            const bucketFull = (p.bucket.length >= p.bucketCapacity);
            if (bucketFull) {
                if (dist < magnetR + 40 && state.time - (state._bucketFullHintT || 0) > 6) {
                    state._bucketFullHintT = state.time;
                    Particles.showFloatingText(state, '🎒 BUCKET FULL! Press B — drop cheap fish, or sell at shop', p.x, p.y - 60, '#f87171');
                    try { audio.playError(); } catch (e2) {}
                }
            }

            if (dist < magnetR && dist > 4 && !isMPClient && !bucketFull) {
                const strength = 1 + (1 - dist / magnetR) * 3;
                const pullSpeed = 260 * strength;
                item.x += (dx / dist) * pullSpeed * DT;
                item.y += (dy / dist) * pullSpeed * DT;
            }

            if (dist < pickupR) {
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
                        try { if (typeof Multiplayer !== 'undefined' && Multiplayer.noteClaimed) Multiplayer.noteClaimed(item.id); } catch (e) {}
                        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
                            if (item.id && Multiplayer.sendLootDelete) Multiplayer.sendLootDelete(item.id);
                        }
                        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                    } // Full bucket: silent here — the global throttled hint
                      // above already fired (no per-item spam pile-up).
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
                    try { if (typeof Multiplayer !== 'undefined' && Multiplayer.noteClaimed) Multiplayer.noteClaimed(item.id); } catch (e) {}
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
                } // Full bucket: silent here — the global throttled hint
                  // above already fired (no per-item spam pile-up).
            }
        }
    }
};

function sizeOffset(m) {
    return (m.species.size || 20) + 25;
}

// ============================================================
//  GLUE WALL — crescent goo barrier from the Glue Bomb item.
//  Blocks enemy bullets, hooked-fish drags, land monsters, enemies
//  and the player (solid circle segments). Own bullets fly through.
//  Enemy shots with a pierce flag ignore it; everything else chips
//  its 500 HP and vanishes on impact, like hitting the player.
//  state.glueWalls[]: {segs:[{x,y}], hp, maxHp, until}.
// ============================================================
const GlueWall = {
    SEG_R: 30,
    HP: 1000,
    DUR: 45,
    // Blue goo palette (was lime).
    COL_HI: '#bae6fd',
    COL_MID: '#38bdf8',
    COL_DEEP: 'rgba(12,74,110,0.9)',

    list(state) {
        try {
            if (!state) return [];
            if (!Array.isArray(state.glueWalls)) state.glueWalls = [];
            return state.glueWalls;
        } catch (e) { return []; }
    },

    // Aim pose shared by cast() + the ghost preview: crescent center in
    // front of the player + aim angle. Close (150px) so it lands nearby.
    aimPose(state) {
        try {
            const p = state && state.player;
            if (!p) return null;
            let ax = 1, ay = 0;
            try {
                const dx = (state.mouse.worldX - p.x), dy = (state.mouse.worldY - p.y);
                const d = Math.hypot(dx, dy);
                if (d > 40) { ax = dx / d; ay = dy / d; }
                else if (p.facing && p.facing < 0) { ax = -1; ay = 0; }
            } catch (e) {}
            const base = Math.atan2(ay, ax);
            return { cx: p.x + Math.cos(base) * 150, cy: p.y + Math.sin(base) * 150, base };
        } catch (e) { return null; }
    },

    // Fire-to-place: glue PRIMED via F + stock left + 3s cooldown clear
    // => the fire button (mouse / touch / gamepad) plants the wall at
    // the ghost instead of shooting. Unprimed clicks shoot normally.
    wantPlace(state) {
        try {
            const p = state && state.player;
            if (!p || p.isDead || state.paused) return false;
            if ((p.itemCd || 0) > 0) return false;
            if (!state.gluePrimed) return false;
            if ((state.glueCdUntil || 0) - (state.time || 0) > 0) return false;
            if (!p.equippedItem || p.equippedItem !== 'glue_bomb') return false;
            if (typeof ItemSystem !== 'undefined' && ItemSystem.stock) {
                return ItemSystem.stock(state, 'glue_bomb') > 0;
            }
            return (p.itemStock && p.itemStock.glue_bomb > 0) || false;
        } catch (e) { return false; }
    },

    cast(state) {
        try {
            const p = state && state.player;
            if (!p) return false;
            const pose = this.aimPose(state);
            if (!pose) return false;
            const segs = [];
            const N = 7;
            for (let i = 0; i < N; i++) {
                const a = pose.base + (i - (N - 1) / 2) * 0.24;
                segs.push({
                    x: Math.round(pose.cx + Math.cos(a) * 110),
                    y: Math.round(pose.cy + Math.sin(a) * 110),
                });
            }
            const walls = this.list(state);
            walls.push({ segs, hp: this.HP, maxHp: this.HP, until: (state.time || 0) + this.DUR });
            // One wall at a time per caster — the old goo DISSOLVES with a
            // burst (never a silent swap, never a stack).
            while (walls.length > 1) {
                const old = walls.shift();
                try {
                    if (old && old.segs && old.segs[3]) {
                        Particles.spawnParticles(state, old.segs[3].x, old.segs[3].y, '#38bdf8', 20, { size: 5 });
                        Particles.showFloatingText(state, '🫧 Old goo dissolved!', old.segs[3].x, old.segs[3].y - 40, '#7dd3fc');
                    }
                } catch (eOld) {}
            }
            try {
                Particles.spawnParticles(state, pose.cx, pose.cy, this.COL_MID, 26, { size: 6 });
                try { audio.playSplash(); } catch (e2) {}
            } catch (e3) {}
            return true;
        } catch (e) { return false; }
    },

    tick(state, delta) {
        try {
            const walls = this.list(state);
            const now = state.time || 0;
            for (let i = walls.length - 1; i >= 0; i--) {
                const w = walls[i];
                if (!w || (w.hp || 0) <= 0 || now >= (w.until || 0)) {
                    if (w && (w.hp || 0) <= 0 && w.segs && w.segs[0]) {
                        try {
                            Particles.spawnParticles(state, w.segs[3].x, w.segs[3].y, '#38bdf8', 22, { size: 5 });
                            Particles.showFloatingText(state, '🫧 Glue wall melted!', w.segs[3].x, w.segs[3].y - 40, '#7dd3fc');
                        } catch (e2) {}
                    }
                    walls.splice(i, 1);
                }
            }
        } catch (e) {}
    },

    // Solid-body push for circles (player / fish / monsters / enemies).
    // Accumulates ALL overlapping segs in one pass (never single-push +
    // return: adjacent segs would ping-pong the body forever). Net push
    // points along the arc normal, so bodies slide OUT, never trapped.
    collide(state, o, r) {
        try {
            if (!o) return false;
            const R = (r || 15) + this.SEG_R;
            const walls = this.list(state);
            let px = 0, py = 0, hit = false;
            for (const w of walls) {
                if (!w || !w.segs) continue;
                for (const s of w.segs) {
                    const dx = o.x - s.x, dy = o.y - s.y;
                    const d = Math.hypot(dx, dy);
                    if (d < R) {
                        hit = true;
                        if (d > 0.01) {
                            const push = R - d;
                            px += (dx / d) * push;
                            py += (dy / d) * push;
                        } else {
                            px += R; // dead-center: shove +x, neighbors refine
                        }
                    }
                }
            }
            if (hit) { o.x += px; o.y += py; return true; }
        } catch (e) {}
        return false;
    },

    // Enemy bullet vs goo: pierce ignores, else chip + absorb.
    bulletHit(state, b) {
        try {
            if (!b || b.pierce) return false;
            const R = (b.radius || 6) + this.SEG_R;
            const walls = this.list(state);
            for (const w of walls) {
                if (!w || !w.segs) continue;
                for (const s of w.segs) {
                    if (Math.hypot(b.x - s.x, b.y - s.y) < R) {
                        w.hp -= (b.damage || 5);
                        try {
                            Particles.spawnParticles(state, b.x, b.y, '#7dd3fc', 6, { size: 4 });
                        } catch (e2) {}
                        return true;
                    }
                }
            }
        } catch (e) {}
        return false;
    },

    // Missiles / contact enemies detonate on the goo (no pass-through).
    missileHit(state, e) {
        try {
            if (!e) return false;
            const R = 12 + this.SEG_R;
            const walls = this.list(state);
            for (const w of walls) {
                if (!w || !w.segs) continue;
                for (const s of w.segs) {
                    if (Math.hypot(e.x - s.x, e.y - s.y) < R) {
                        w.hp -= (e.damage || 45);
                        return true;
                    }
                }
            }
        } catch (e2) {}
        return false;
    },
};

try { window.GlueWall = GlueWall; } catch (e) {}