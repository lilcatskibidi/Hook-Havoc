/* ====================================================================
 * ItemSystem — buyable consumables (shop Items tab) + one equipped item
 * on F + dash slot. State: p.itemStock {id:count}, p.equippedItem id.
 * 18 items, cheap heals stack to 50, most stack to 30, ordnance caps high.
 * Price scales with power (150c bandage → 4000c sunfall whistle).
 * Timed buffs live on the player (ironSkinT/rageT/swiftT/magnetT/luckT/
 * regenT/thornT) and decay in Player.update; hooks live in Combat
 * (damagePlayer/thorns, loot magnet), WeaponSystem.shoot (rage) and
 * rollFishSpecies (luck). F uses the equipped item.
 * ================================================================== */
const ItemSystem = {
    ITEMS: [
        { id: 'bandage', name: 'Bandage', icon: '🩹', desc: 'Restore 60 HP on use.', price: 150, max: 50 },
        { id: 'smoke', name: 'Smoke Bomb', icon: '💨', desc: 'Stun nearby threats 2.5s + dodge 1s.', price: 250, max: 50 },
        { id: 'adrenaline', name: 'Adrenaline', icon: '💉', desc: 'Reset dash cooldown + 1.5× speed for 8s.', price: 300, max: 30 },
        { id: 'medkit', name: 'Medkit', icon: '⛑', desc: 'FULL heal + cleanse burn/slow.', price: 600, max: 30 },
        { id: 'swift_tide', name: 'Swift Tide', icon: '🌊', desc: '+40% move speed for 20s. Stacks with adrenaline.', price: 700, max: 30 },
        { id: 'magnet_charm', name: 'Magnet Charm', icon: '🧲', desc: 'Loot flies to you (3× magnet) for 60s.', price: 700, max: 30 },
        { id: 'iron_skin', name: 'Ironskin Tonic', icon: '🛡', desc: 'Take 60% less damage for 12s.', price: 800, max: 30 },
        { id: 'regen_kelp', name: 'Regen Kelp', icon: '🌿', desc: '+5 HP/s for 20s (100 HP total).', price: 850, max: 30 },
        { id: 'lucky_lure', name: 'Lucky Lure', icon: '🍀', desc: '+2.0 fishing luck for 60s. Rarer bites!', price: 900, max: 30 },
        { id: 'thorn_shell', name: 'Thorn Shell', icon: '🦔', desc: 'Reflect 50% damage back for 15s.', price: 1000, max: 30 },
        { id: 'berserk', name: 'Berserk Rum', icon: '🍺', desc: '+50% bullet damage for 15s.', price: 1500, max: 30 },
        { id: 'ghost_cloak', name: 'Ghost Cloak', icon: '👻', desc: 'Untouchable 4s + stun nearby 3s.', price: 2000, max: 30 },
        { id: 'titan_heart', name: 'Titan Heart', icon: '💗', desc: 'Heal 150 + cleanse + 2s dodge.', price: 2500, max: 30 },
        { id: 'storm_cell', name: 'Storm Cell', icon: '🌩', desc: 'Lightning smites threats near you (250 dmg + stun).', price: 3000, max: 30 },
        { id: 'glue_bomb', name: 'Glue Bomb', icon: '🫧', desc: 'F primes a ghost preview (free). FIRE plants a close crescent goo wall (1000 HP, 45s, 3s cooldown). Blocks fish, foes, foe fire — and you. Your bullets fly through.', price: 1200, max: 30 },
        { id: 'heal_burst', name: 'Heal Burst', icon: '💚', desc: 'Heal yourself + nearby crewmates 80 HP in a 420px burst.', price: 1800, max: 30 },
        { id: 'sunfall', name: 'Sunfall Whistle', icon: '☀', desc: '800 damage to EVERYTHING on screen. The sky answers.', price: 4000, max: 30 },
        { id: 'timestop', name: 'Timestop Pocketwatch', icon: '⏳', desc: 'Freeze all threats 5s + reload free.', price: 3500, max: 30 },
    ],

    def(id) {
        try { return this.ITEMS.find(i => i.id === id) || null; } catch (e) { return null; }
    },

    ensure(state) {
        try {
            const p = state.player;
            if (!p.itemStock || typeof p.itemStock !== 'object') p.itemStock = {};
            if (typeof p.equippedItem !== 'string') p.equippedItem = null;
            if (p.equippedItem && !this.def(p.equippedItem)) p.equippedItem = null;
        } catch (e) {}
    },

    stock(state, id) {
        try {
            this.ensure(state);
            return Math.max(0, Math.floor(Number(state.player.itemStock[id]) || 0));
        } catch (e) { return 0; }
    },

    // ---- shop ----
    // qty: how many to buy (capped by stack space, affordability and 50).
    buy(state, id, qty) {
        try {
            const def = this.def(id);
            if (!def) return false;
            const p = state.player;
            this.ensure(state);
            const have = this.stock(state, id);
            const space = Math.max(0, def.max - have);
            if (space <= 0) {
                try {
                    Particles.showFloatingText(state, `${def.name} stack full (×${def.max})!`, p.x, p.y - 50, '#fbbf24');
                } catch (e) {}
                try { audio.playError(); } catch (e) {}
                return false;
            }
            let n = Math.floor(Number(qty) || 1);
            if (!isFinite(n) || n < 1) n = 1;
            n = Math.min(n, space, 50);
            // Affordability trims the stack (buy what you can).
            const afford = Math.floor((p.coins || 0) / def.price);
            if (afford <= 0) {
                try {
                    Particles.showFloatingText(state, `Need ${def.price}c for ${def.name}!`, p.x, p.y - 50, '#f87171');
                } catch (e) {}
                try { audio.playError(); } catch (e) {}
                return false;
            }
            n = Math.min(n, afford);
            p.coins -= def.price * n;
            p.itemStock[id] = have + n;
            if (!p.equippedItem) p.equippedItem = id; // first buy auto-equips
            try {
                Particles.showFloatingText(state, `+${n} ${def.name} (−${def.price * n}c)`, p.x, p.y - 50, '#34d399');
            } catch (e) {}
            try { audio.playCoin(); } catch (e) {}
            if (typeof Player !== 'undefined') {
                try { Player.refreshHUD(state); } catch (e) {}
            }
            if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
                try { UI.renderWeaponToolbar(state); } catch (e) {}
            }
            try { if (typeof AntiCheat !== 'undefined' && AntiCheat.markLegit) AntiCheat.markLegit(); } catch (e) {}
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    equip(state, id) {
        try {
            this.ensure(state);
            if (!this.def(id) || this.stock(state, id) <= 0) return false;
            state.player.equippedItem = (state.player.equippedItem === id) ? null : id;
            // Switching gear kills the glue ghost (no cross-item haunting).
            try { state.gluePrimed = false; } catch (e) {}
            try { audio.playUIClick(); } catch (e) {}
            if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
                try { UI.renderWeaponToolbar(state); } catch (e) {}
            }
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    // ---- glue prime (F toggles the ghost; FIRE plants, eating 1) ----
    _gluePrime(state, p) {
        try {
            const say = (txt, col) => {
                try { Particles.showFloatingText(state, txt, p.x, p.y - 50, col || '#fff'); } catch (e) {}
            };
            // Toggle off.
            if (state.gluePrimed) {
                state.gluePrimed = false;
                say('🫧 Ghost off — guns back.', '#94a3b8');
                try { audio.playUIClick(); } catch (e) {}
                return true;
            }
            // 3s placement cooldown gates re-priming (one wall per 3s).
            const cd = (state.glueCdUntil || 0) - (state.time || 0);
            if (cd > 0) {
                say(`🫧 Glue recharging… ${Math.ceil(cd)}s`, '#fbbf24');
                try { audio.playError(); } catch (e) {}
                return false;
            }
            state.gluePrimed = true;
            say('🫧 Ghost ON — FIRE to plant it!', '#7dd3fc');
            try { audio.playUIClick(); } catch (e) {}
            return true;
        } catch (e) { return false; }
    },

    // ---- glue plant (FIRE while primed: eats 1, 3s cooldown) ----
    plantGlue(state) {
        try {
            const p = state && state.player;
            if (!p || p.isDead || state.paused) return false;
            if (!state.gluePrimed) return false;
            if ((p.itemCd || 0) > 0) return false;
            const cd = (state.glueCdUntil || 0) - (state.time || 0);
            if (cd > 0) return false;
            this.ensure(state);
            if (this.stock(state, 'glue_bomb') <= 0) {
                state.gluePrimed = false;
                return false;
            }
            p.itemStock.glue_bomb = this.stock(state, 'glue_bomb') - 1;
            p.itemCd = 0.8;
            state.gluePrimed = false; // ghost off — guns back immediately
            let placed = false;
            try {
                if (typeof GlueWall !== 'undefined' && GlueWall.cast) placed = !!GlueWall.cast(state);
            } catch (e) { placed = false; }
            if (placed) {
                state.glueCdUntil = (state.time || 0) + 3;
                // Clients splatter locally for instant feedback AND forward
                // the segs — the host owns the shared wall (anti-ghost).
                try {
                    if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient() &&
                        Multiplayer.sendGlueCast && state.glueWalls && state.glueWalls.length) {
                        const w = state.glueWalls[state.glueWalls.length - 1];
                        if (w && w.segs) Multiplayer.sendGlueCast(w.segs);
                    }
                } catch (e2) {}
                try {
                    Particles.showFloatingText(state, '🫧 GLUE WALL! Hold the line!', p.x, p.y - 50, '#7dd3fc');
                    try { audio.playSplash(); } catch (e3) {}
                } catch (e4) {}
                if (typeof Player !== 'undefined') { try { Player.refreshHUD(state); } catch (e5) {} }
                if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) { try { UI.renderWeaponToolbar(state); } catch (e6) {} }
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                return true;
            }
            // Fizzle: refund + re-prime so the ghost survives.
            p.itemStock.glue_bomb = this.stock(state, 'glue_bomb') + 1;
            state.gluePrimed = true;
            return false;
        } catch (e) { return false; }
    },

    // ---- use (E fallback) ----
    useEquipped(state) {
        try {
            const p = state.player;
            if (!p || p.isDead || state.paused) return false;
            this.ensure(state);
            if ((p.itemCd || 0) > 0) return false;
            const id = p.equippedItem;
            const def = id && this.def(id);
            if (!def) {
                try {
                    Particles.showFloatingText(state, 'No item equipped (Items tab in shop)', p.x, p.y - 50, '#94a3b8');
                } catch (e) {}
                return false;
            }
            if (this.stock(state, id) <= 0) {
                try {
                    Particles.showFloatingText(state, `No ${def.name} left!`, p.x, p.y - 50, '#f87171');
                    try { audio.playError(); } catch (e) {}
                } catch (e) {}
                return false;
            }
            // Bandage at full HP is wasted — refuse instead of burning stock.
            if (id === 'bandage' && (p.hp || 0) >= (p.maxHp || 1)) {
                try {
                    Particles.showFloatingText(state, 'HP already full!', p.x, p.y - 50, '#94a3b8');
                } catch (e) {}
                return false;
            }
            // Glue bomb: F only PRIMES the ghost (zero stock used). The
            // actual plant happens on FIRE (see wantPlace) and eats 1.
            if (id === 'glue_bomb') return this._gluePrime(state, p);
            p.itemStock[id] = this.stock(state, id) - 1;
            p.itemCd = 0.8;
            let ok = false;
            const say = (txt, col) => {
                try { Particles.showFloatingText(state, txt, p.x, p.y - 50, col || '#fff'); } catch (e) {}
            };
            const stunNear = (R, t) => {
                let hit = 0;
                try {
                    for (const e of (state.enemies || [])) {
                        if (!e || (e.hp || 0) <= 0) continue;
                        if (Math.hypot(e.x - p.x, e.y - p.y) < R) { e.stunTimer = Math.max(e.stunTimer || 0, t); hit++; }
                    }
                    for (const m of (state.monstersOnLand || [])) {
                        if (!m || (m.hp || 0) <= 0) continue;
                        if (Math.hypot(m.x - p.x, m.y - p.y) < R) { m.stunTimer = Math.max(m.stunTimer || 0, t); hit++; }
                    }
                } catch (e) {}
                return hit;
            };
            const hurtNear = (R, dmg, stun) => {
                let hit = 0;
                try {
                    for (const e of (state.enemies || [])) {
                        if (!e || (e.hp || 0) <= 0) continue;
                        if (Math.hypot(e.x - p.x, e.y - p.y) < R) {
                            e.hp -= dmg; e.hitFlash = 0.4;
                            if (stun) e.stunTimer = Math.max(e.stunTimer || 0, stun);
                            if (e.hp <= 0 && typeof EnemySpawner !== 'undefined') EnemySpawner.onEnemyKilled(e);
                            hit++;
                        }
                    }
                    for (const m of (state.monstersOnLand || [])) {
                        if (!m || (m.hp || 0) <= 0) continue;
                        if (Math.hypot(m.x - p.x, m.y - p.y) < R) {
                            m.hp -= dmg; m.hitFlash = 0.4;
                            if (stun) m.stunTimer = Math.max(m.stunTimer || 0, stun);
                            hit++;
                        }
                    }
                } catch (e) {}
                return hit;
            };
            if (id === 'bandage') {
                if (typeof Player !== 'undefined' && Player.heal) {
                    try { Player.heal(state, 60); ok = true; } catch (e) {}
                }
            } else if (id === 'adrenaline') {
                p.dashCd = 0;
                p.adrenalineT = 8;
                try {
                    say('⚡ ADRENALINE! Dash ready, speed up!', '#fde047');
                    try { audio.playLevelUp(); } catch (e) {}
                    ok = true;
                } catch (e) { ok = true; }
            } else if (id === 'smoke') {
                const hit = stunNear(420, 2.5);
                p.iframes = Math.max(p.iframes || 0, 1.0);
                try {
                    Particles.spawnParticles(state, p.x, p.y, '#cbd5e1', 24, { size: 6 });
                    say(hit > 0 ? `💨 Smoked ${hit} threats!` : '💨 Vanish...', '#e2e8f0');
                    try { audio.playWhoosh(); } catch (e) {}
                    ok = true;
                } catch (e) { ok = true; }
            } else if (id === 'medkit') {
                p.hp = p.maxHp;
                p.burnTimer = 0; p.slowTimer = 0; p.poisonTimer = 0;
                if (typeof Player !== 'undefined') { try { Player.refreshHUD(state); } catch (e) {} }
                say('⛑ FULL HEAL + cleansed!', '#34d399');
                try { audio.playLevelUp(); } catch (e) {}
                ok = true;
            } else if (id === 'swift_tide') {
                p.swiftT = 20;
                say('🌊 SWIFT TIDE! +40% speed 20s', '#67e8f9');
                try { audio.playWhoosh(); } catch (e) {}
                ok = true;
            } else if (id === 'magnet_charm') {
                p.magnetT = 60;
                say('🧲 LOOT MAGNET 60s!', '#fbbf24');
                try { audio.playCoin(); } catch (e) {}
                ok = true;
            } else if (id === 'iron_skin') {
                p.ironSkinT = 12;
                say('🛡 IRONSKIN! −60% damage 12s', '#94a3b8');
                try { audio.playUIClick(); } catch (e) {}
                ok = true;
            } else if (id === 'regen_kelp') {
                p.regenT = 20;
                say('🌿 REGENERATING 20s!', '#4ade80');
                try { audio.playUIClick(); } catch (e) {}
                ok = true;
            } else if (id === 'lucky_lure') {
                p.luckT = 60;
                say('🍀 LUCKY! +2 luck 60s — cast now!', '#f0abfc');
                try { audio.playLevelUp(); } catch (e) {}
                ok = true;
            } else if (id === 'thorn_shell') {
                p.thornT = 15;
                say('🦔 THORNS UP! Attackers bleed 15s', '#fb923c');
                try { audio.playUIClick(); } catch (e) {}
                ok = true;
            } else if (id === 'berserk') {
                p.rageT = 15;
                say('🍺 BERSERK! +50% damage 15s', '#ef4444');
                try { audio.playRoar(); } catch (e) {}
                ok = true;
            } else if (id === 'ghost_cloak') {
                p.iframes = Math.max(p.iframes || 0, 4.0);
                const hit = stunNear(420, 3.0);
                try { Particles.spawnParticles(state, p.x, p.y, '#e9d5ff', 30, { size: 6 }); } catch (e) {}
                say(hit > 0 ? `👻 UNTOUCHABLE 4s — ${hit} frozen!` : '👻 UNTOUCHABLE 4s!', '#e9d5ff');
                try { audio.playWhoosh(); } catch (e) {}
                ok = true;
            } else if (id === 'titan_heart') {
                if (typeof Player !== 'undefined' && Player.heal) {
                    try { Player.heal(state, 150); } catch (e) { p.hp = Math.min(p.maxHp, (p.hp || 0) + 150); }
                } else { p.hp = Math.min(p.maxHp, (p.hp || 0) + 150); }
                p.burnTimer = 0; p.slowTimer = 0;
                p.iframes = Math.max(p.iframes || 0, 2.0);
                say('💗 TITAN HEART! +150 HP + dodge', '#f472b6');
                try { audio.playLevelUp(); } catch (e) {}
                ok = true;
            } else if (id === 'storm_cell') {
                const hit = hurtNear(600, 250, 2.0);
                try {
                    for (let k = 0; k < 5; k++) {
                        Particles.spawnLightning(state, p.x + (Math.random() - 0.5) * 500, p.y - 200, p.x + (Math.random() - 0.5) * 500, p.y + 100, '#fde047');
                    }
                    Particles.spawnParticles(state, p.x, p.y, '#fde047', 30, { size: 6 });
                } catch (e) {}
                state.screenShake = Math.max(state.screenShake || 0, 14);
                say(hit > 0 ? `🌩 STORM SMITES ${hit}!` : '🌩 The sky rumbles...', '#fde047');
                try { audio.playThunder(); } catch (e) { try { audio.playExplosion(); } catch (e2) {} }
                ok = true;
            } else if (id === 'glue_bomb') {
                // Unreachable by design: F always primes (see intercept
                // above), FIRE always plants via plantGlue() below. If some
                // other caller lands here unprimed, refuse (no free walls).
                try {
                    Particles.showFloatingText(state, '🫧 Press F to prime the ghost first!', p.x, p.y - 50, '#7dd3fc');
                } catch (e) {}
            } else if (id === 'heal_burst') {
                // AoE heal: you + every crewmate in the burst (host heals
                // remotes directly; clients heal themselves, same as bandage).
                let n = 0;
                try {
                    const R = 420;
                    p.hp = Math.min(p.maxHp, (p.hp || 0) + 80);
                    n = 1;
                    try {
                        let isHost = true;
                        try { isHost = !(typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()); } catch (e2) {}
                        if (isHost) {
                            for (const r of (state.remotePlayers || [])) {
                                if (!r || r.isDead) continue;
                                if (Math.hypot((r.x || 0) - p.x, (r.y || 0) - p.y) < R) {
                                    r.hp = Math.min(r.maxHp || 100, (r.hp || 0) + 80);
                                    n++;
                                }
                            }
                        }
                    } catch (e3) {}
                    try {
                        Particles.spawnParticles(state, p.x, p.y, '#4ade80', 30, { size: 6 });
                        Particles.spawnParticles(state, p.x, p.y, '#bbf7d0', 18, { size: 4 });
                        state.screenShake = Math.max(state.screenShake || 0, 6);
                    } catch (e4) {}
                    if (typeof Player !== 'undefined') { try { Player.refreshHUD(state); } catch (e5) {} }
                } catch (e6) { n = 0; }
                if (n > 0) {
                    say(n > 1 ? `💚 HEAL BURST! +80 HP ×${n} crewmates!` : '💚 HEAL BURST! +80 HP!', '#4ade80');
                    try { audio.playLevelUp(); } catch (e) {}
                    ok = true;
                }
            } else if (id === 'sunfall') {
                let hit = 0;
                try {
                    for (const e of (state.enemies || [])) {
                        if (!e || (e.hp || 0) <= 0 || e.isBoss) continue;
                        e.hp -= 800; e.hitFlash = 0.6;
                        if (e.hp <= 0 && typeof EnemySpawner !== 'undefined') EnemySpawner.onEnemyKilled(e);
                        hit++;
                    }
                    for (const m of (state.monstersOnLand || [])) {
                        if (!m || (m.hp || 0) <= 0) continue;
                        if (m.species && m.species.isBoss) { m.hp -= 200; }
                        else m.hp -= 800;
                        m.hitFlash = 0.6;
                        hit++;
                    }
                    Particles.spawnParticles(state, p.x, p.y - 100, '#fde047', 60, { size: 8 });
                    Particles.spawnParticles(state, p.x, p.y, '#fb923c', 40, { size: 7 });
                } catch (e) {}
                state.screenShake = Math.max(state.screenShake || 0, 22);
                say(hit > 0 ? `☀ SUNFALL! ${hit} scorched!` : '☀ The sky answers...', '#fde047');
                try { audio.playExplosion(); } catch (e) {}
                ok = true;
            } else if (id === 'timestop') {
                let hit = 0;
                try {
                    for (const e of (state.enemies || [])) {
                        if (!e || (e.hp || 0) <= 0 || e.isBoss) continue;
                        e.stunTimer = Math.max(e.stunTimer || 0, 5.0); e.freezeTimer = Math.max(e.freezeTimer || 0, 5.0); hit++;
                    }
                    for (const m of (state.monstersOnLand || [])) {
                        if (!m || (m.hp || 0) <= 0) continue;
                        if (m.species && m.species.isBoss) { m.stunTimer = Math.max(m.stunTimer || 0, 1.5); }
                        else { m.stunTimer = Math.max(m.stunTimer || 0, 5.0); m.freezeTimer = Math.max(m.freezeTimer || 0, 5.0); }
                        hit++;
                    }
                } catch (e) {}
                // Free reload while time stands still.
                try {
                    if (typeof WeaponSystem !== 'undefined' && WeaponSystem.getActiveWeapon) {
                        const w = WeaponSystem.getActiveWeapon(state);
                        if (w && w.id !== 'pistol' && CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id] !== Infinity) {
                            p.weaponAmmo[w.id] = CONFIG.MAX_AMMO[w.id];
                            if (typeof Player !== 'undefined') { try { Player.refreshWeaponHUD(state); } catch (e) {} }
                        }
                    }
                } catch (e) {}
                say(hit > 0 ? `⏳ TIME FROZEN — ${hit} held!` : '⏳ Time stands still...', '#a5f3fc');
                try { audio.playUIClick(); } catch (e) {}
                ok = true;
            }
            if (ok) {
                if (typeof Player !== 'undefined') {
                    try { Player.refreshHUD(state); } catch (e) {}
                }
                if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
                    try { UI.renderWeaponToolbar(state); } catch (e) {}
                }
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                return true;
            }
            // Effect failed: refund the stock.
            p.itemStock[id] = this.stock(state, id) + 1;
            return false;
        } catch (e) { return false; }
    },

    // ---- shop tab ----
    renderItemsTab(state, content) {
        try {
            const p = state.player;
            this.ensure(state);
            const head = document.createElement('div');
            head.className = 'text-[10px] font-black tracking-widest text-slate-500 mt-1 mb-1 px-1';
            head.innerText = 'CONSUMABLES — BUY STACKS, EQUIP ONE, PRESS [F] TO USE';
            content.appendChild(head);
            for (const def of this.ITEMS) {
                const n = this.stock(state, def.id);
                const equipped = p.equippedItem === def.id;
                const full = n >= def.max;
                const afford = (p.coins || 0) >= def.price;
                const div = document.createElement('div');
                div.className = 'shop-item glass-panel-light p-3 rounded-xl flex items-center justify-between' +
                    (equipped ? ' border border-emerald-500/60' : '');
                div.innerHTML =
                    '<div class="flex items-center gap-3">' +
                        `<div class="w-10 h-10 rounded-lg flex items-center justify-center text-2xl" style="background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.35)">${def.icon}</div>` +
                        '<div>' +
                            `<div class="font-bold text-white text-sm">${def.name} <span class="text-xs text-emerald-300">×${n}/${def.max}</span>` +
                            (equipped ? ' <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200">[F] EQUIPPED</span>' : '') +
                            '</div>' +
                            `<div class="text-[10px] text-slate-400">${def.desc}</div>` +
                            `<div class="text-[10px] text-amber-300/80 font-bold">${def.price}c each</div>` +
                        '</div>' +
                    '</div>' +
                    '<div class="flex items-center gap-1.5 shrink-0">' +
                        `<button data-item-equip="${def.id}" title="Equip on [F]" class="px-2.5 h-8 rounded-lg text-[11px] font-black border transition-all ${equipped ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500/50' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'}">F</button>` +
                        `<button data-item-buy="${def.id}" title="Buy ${def.name} (pick qty, max 50)" ${(!afford || full) ? 'disabled' : ''} class="btn-buy px-3 h-8 rounded-lg text-[11px] font-black text-slate-950">` +
                            `<i class="fa-solid fa-cart-plus mr-1"></i>BUY</button>` +
                    '</div>';
                content.appendChild(div);
            }
            content.querySelectorAll('[data-item-buy]').forEach(btn => {
                btn.onclick = () => {
                    try {
                        const def = this.def(btn.dataset.itemBuy);
                        if (!def) return;
                        const have = this.stock(state, def.id);
                        const space = Math.max(0, def.max - have);
                        if (space <= 0) return;
                        const affordN = Math.floor((state.player.coins || 0) / def.price);
                        if (affordN <= 0) {
                            try { audio.playError(); } catch (e) {}
                            return;
                        }
                        const cap = Math.min(space, affordN, 50);
                        const finish = () => {
                            try {
                                if (typeof Shop !== 'undefined' && Shop.renderTab) Shop.renderTab(state, 'items');
                            } catch (e) {}
                        };
                        // Bulk picker (in-game modal, max 50) — 1-tap buy when cap is 1.
                        if (cap <= 1) {
                            if (this.buy(state, def.id, 1)) finish();
                            return;
                        }
                        if (typeof QtyModal !== 'undefined' && QtyModal.ask) {
                            QtyModal.ask({
                                title: def.icon + ' ' + def.name.toUpperCase(),
                                sub: `${def.price}c each · own ×${have}/${def.max} · you afford ${affordN}`,
                                min: 1, max: cap, value: cap,
                            }).then((qty) => {
                                if (qty !== null && qty !== undefined && this.buy(state, def.id, qty)) finish();
                                else finish();
                            });
                            return;
                        }
                        if (this.buy(state, def.id, 1)) finish();
                    } catch (e) {}
                };
            });
            content.querySelectorAll('[data-item-equip]').forEach(btn => {
                btn.onclick = () => {
                    try {
                        if (this.equip(state, btn.dataset.itemEquip) && typeof Shop !== 'undefined' && Shop.renderTab) {
                            Shop.renderTab(state, 'items');
                        }
                    } catch (e) {}
                };
            });
        } catch (e) {}
    },

    // ---- hotbar (item slot + dash cooldown), change-guarded ----
    _lastBar: '',
    updateHUD(state) {
        try {
            const bar = document.getElementById('item-bar');
            if (!bar) return;
            this.ensure(state);
            const p = state.player;
            const eq = p.equippedItem;
            const def = eq && this.def(eq);
            const n = eq ? this.stock(state, eq) : 0;
            const dashCd = Math.max(0, Number(p.dashCd) || 0);
            const dashMax = (typeof Player !== 'undefined' && Player.DASH_CD) || 2.5;
            const key = `${eq || '-'}|${n}|${Math.ceil(dashCd * 5)}|${(p.adrenalineT || 0) > 0 ? 1 : 0}`;
            if (key === this._lastBar) return;
            this._lastBar = key;
            const cdPct = dashCd > 0 ? Math.round((1 - dashCd / dashMax) * 100) : 100;
            bar.innerHTML =
                `<div class="flex items-end gap-1.5">` +
                `<div id="item-slot" title="${def ? `${def.name} ×${n} — press F` : 'No item (buy in shop)'}" class="weapon-slot relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${def ? 'border-emerald-700/60 bg-emerald-900/60' : 'border-slate-700/60 bg-slate-900/60 opacity-60'}">` +
                    `<span class="text-xl leading-none">${def ? def.icon : '🎒'}</span>` +
                    `<span class="text-[9px] font-bold mt-0.5 ${def ? 'text-emerald-300' : 'text-slate-600'}">F${def ? ' ×' + n : ''}</span>` +
                `</div>` +
                `<div title="Dash [Q] — i-frame dodge${dashCd > 0 ? ` (${dashCd.toFixed(1)}s)` : ' READY'}" class="relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${dashCd > 0 ? 'border-slate-700/60 bg-slate-900/60' : 'border-sky-500/60 bg-sky-900/40'}">` +
                    `<span class="text-xl leading-none" style="${dashCd > 0 ? 'filter:grayscale(1);opacity:0.5;' : ''}">💨</span>` +
                    `<span class="text-[9px] font-bold mt-0.5 ${dashCd > 0 ? 'text-slate-500' : 'text-sky-300'}">${dashCd > 0 ? dashCd.toFixed(1) + 's' : 'Q'}</span>` +
                    (dashCd > 0 ? `<div class="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"><div class="absolute bottom-0 left-0 right-0 bg-sky-500/25" style="height:${cdPct}%"></div></div>` : '') +
                `</div>` +
                `</div>`;
            const slot = document.getElementById('item-slot');
            if (slot) slot.onclick = () => { try { this.useEquipped(state); } catch (e) {} };
        } catch (e) {}
    },
};

window.ItemSystem = ItemSystem;
