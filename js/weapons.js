// ============================================================
//  EQUIPMENT SLOTS
// ============================================================
const EQUIP_SLOTS = 4;   // 1, 2, 3, 4 keys
const WEAPONS = [
    // TIER 1 — STARTER
    { id: 'pistol', name: 'Tac-Pistol', icon: 'fa-gun', type: 'pistol',
      damage: 25, fireRate: 0.18, range: 520, spread: 0.04, count: 1,
      price: 0, desc: 'Reliable sidearm. Infinite ammo.',
      rarity: 'common', pellets: 'Single',
      auto: false, pierce: false, explosive: false, burn: false,
      sound: 'pistol', shake: 3, muzzle: 10, recoil: 3 },

    { id: 'smg', name: 'Compact SMG', icon: 'fa-bolt', type: 'smg',
      damage: 12, fireRate: 0.07, range: 460, spread: 0.10, count: 1,
      price: 180, desc: 'Fast spray. Weak per-shot.',
      rarity: 'common', pellets: 'Auto',
      auto: true, pierce: false, explosive: false, burn: false,
      sound: 'rifle', shake: 2, muzzle: 8, recoil: 2 },

    { id: 'shotgun', name: 'Heavy Shotgun', icon: 'fa-shield-halved', type: 'shotgun',
      damage: 16, fireRate: 0.75, range: 380, spread: 0.22, count: 7,
      price: 850, desc: '7-pellet spread. Devastating close range.',
      rarity: 'rare', pellets: '7 pellets',
      auto: false, pierce: false, explosive: false, burn: false,
      sound: 'shotgun', shake: 6, muzzle: 18, recoil: 8 },

    // TIER 2 — MID GAME
    { id: 'dual_pistols', name: 'Dual Sidearms', icon: 'fa-gun', type: 'pistol',
      damage: 20, fireRate: 0.11, range: 520, spread: 0.07, count: 2,
      price: 1800, desc: 'Twin pistols. Double the volume.',
      rarity: 'rare', pellets: 'Dual',
      auto: false, pierce: false, explosive: false, burn: false,
      sound: 'pistol', shake: 4, muzzle: 12, recoil: 4 },

    { id: 'rifle', name: 'Assault Rifle', icon: 'fa-crosshair', type: 'rifle',
      damage: 22, fireRate: 0.08, range: 620, spread: 0.06, count: 1,
      price: 2400, desc: 'Fully automatic. Shreds monsters.',
      rarity: 'epic', pellets: 'Auto',
      auto: true, pierce: false, explosive: false, burn: false,
      sound: 'rifle', shake: 3, muzzle: 12, recoil: 3 },

    { id: 'burst_rifle', name: 'Burst Carbine', icon: 'fa-crosshair', type: 'rifle',
      damage: 26, fireRate: 0.22, range: 640, spread: 0.03, count: 3,
      price: 3200, desc: 'Three-round burst. Tight grouping.',
      rarity: 'epic', pellets: '3-round burst',
      auto: true, pierce: false, explosive: false, burn: false,
      sound: 'rifle', shake: 4, muzzle: 12, recoil: 4 },

    // TIER 3 — LATE GAME
    { id: 'marksman', name: 'Marksman Rifle', icon: 'fa-crosshair', type: 'rifle',
      damage: 95, fireRate: 0.55, range: 900, spread: 0.005, count: 1,
      price: 5200, desc: 'Precision long-range shots.',
      rarity: 'epic', pellets: 'Precision',
      auto: false, pierce: true, explosive: false, burn: false,
      sound: 'harpoon', shake: 6, muzzle: 14, recoil: 6 },

    { id: 'harpoon', name: 'Spear Harpoon', icon: 'fa-location-arrow', type: 'harpoon',
      damage: 140, fireRate: 0.9, range: 700, spread: 0.01, count: 1,
      price: 6500, desc: 'Heavy piercer. Drains stamina on hook.',
      rarity: 'legendary', pellets: 'Pierce',
      auto: false, pierce: true, explosive: false, burn: false,
      sound: 'harpoon', shake: 8, muzzle: 10, recoil: 6 },

    { id: 'auto_shotgun', name: 'Auto Shotgun', icon: 'fa-shield-halved', type: 'shotgun',
      damage: 18, fireRate: 0.28, range: 420, spread: 0.26, count: 8,
      price: 7400, desc: 'Fully automatic 8-pellet fire.',
      rarity: 'epic', pellets: '8 pellets auto',
      auto: true, pierce: false, explosive: false, burn: false,
      sound: 'shotgun', shake: 5, muzzle: 18, recoil: 6 },

    { id: 'flamethrower', name: 'Hydro-Jet', icon: 'fa-fire', type: 'flame',
      damage: 9, fireRate: 0.04, range: 260, spread: 0.35, count: 2,
      price: 8900, desc: 'Short-range stream. Melts anything close.',
      rarity: 'epic', pellets: 'Stream',
      auto: true, pierce: false, explosive: false, burn: true,
      sound: 'rifle', shake: 2, muzzle: 6, recoil: 1 },

    // TIER 4 — LEGENDARY
    { id: 'grenade_launcher', name: 'Harpoon Launcher', icon: 'fa-bomb', type: 'launcher',
      damage: 180, fireRate: 1.0, range: 640, spread: 0.08, count: 1,
      price: 16000, desc: 'Explosive harpoon. Splash damage.',
      rarity: 'legendary', pellets: 'Explosive',
      auto: false, pierce: false, explosive: true, burn: false,
      sound: 'shotgun', shake: 10, muzzle: 22, recoil: 10 },

    { id: 'railgun', name: 'Rail Cannon', icon: 'fa-bolt', type: 'rail',
      damage: 320, fireRate: 1.4, range: 1200, spread: 0.0, count: 1,
      price: 18500, desc: 'Pierces everything. One-shot monsters.',
      rarity: 'legendary', pellets: 'Pierce line',
      auto: false, pierce: true, explosive: false, burn: false,
      sound: 'harpoon', shake: 12, muzzle: 26, recoil: 12 },

    { id: 'minigun', name: 'Reel Minigun', icon: 'fa-bolt', type: 'rifle',
      damage: 20, fireRate: 0.03, range: 560, spread: 0.14, count: 1,
      price: 22000, desc: 'Spin up. Endless lead storm.',
      rarity: 'legendary', pellets: 'Full auto',
      auto: true, pierce: false, explosive: false, burn: false,
      sound: 'rifle', shake: 4, muzzle: 14, recoil: 2 },

    { id: 'sniper_rail', name: 'Ion Sniper', icon: 'fa-crosshair', type: 'rail',
      damage: 500, fireRate: 1.8, range: 1500, spread: 0.0, count: 1,
      price: 28000, desc: 'Cross-map deletion. Very slow fire.',
      rarity: 'legendary', pellets: 'Pierce precision',
      auto: false, pierce: true, explosive: false, burn: false,
      sound: 'harpoon', shake: 14, muzzle: 30, recoil: 14 },

    // TIER 5 — MYTHIC
    { id: 'plasma_caster', name: 'Plasma Caster', icon: 'fa-fire', type: 'plasma',
      damage: 240, fireRate: 0.35, range: 780, spread: 0.02, count: 1,
      price: 52000, desc: 'Superheated bolts that burn on hit.',
      rarity: 'mythic', pellets: 'Plasma',
      auto: false, pierce: false, explosive: false, burn: true,
      sound: 'harpoon', shake: 8, muzzle: 20, recoil: 8 },

    { id: 'trident', name: 'Poseidon Trident', icon: 'fa-location-arrow', type: 'rail',
      damage: 380, fireRate: 0.75, range: 1000, spread: 0.0, count: 3,
      price: 75000, desc: 'Three piercing bolts. Devastating volley.',
      rarity: 'mythic', pellets: 'Triple pierce',
      auto: false, pierce: true, explosive: false, burn: false,
      sound: 'harpoon', shake: 12, muzzle: 28, recoil: 12 },

    // TIER 6 — EXOTIC (NEW WEAPONS)
    { id: 'crossbow', name: 'Abyssal Crossbow', icon: 'fa-bow-arrow', type: 'crossbow',
      damage: 160, fireRate: 1.2, range: 850, spread: 0.0, count: 1,
      price: 35000, desc: 'Silent killer. Bolts pierce and apply poison.',
      rarity: 'mythic', pellets: 'Poison Bolt',
      auto: false, pierce: true, explosive: false, burn: false, poison: true,
      sound: 'harpoon', shake: 6, muzzle: 8, recoil: 5 },

    { id: 'tesla_gun', name: 'Tesla Coil Gun', icon: 'fa-bolt', type: 'tesla',
      damage: 45, fireRate: 0.15, range: 500, spread: 0.08, count: 1,
      price: 42000, desc: 'Chains lightning between enemies.',
      rarity: 'mythic', pellets: 'Chain Lightning',
      auto: true, pierce: false, explosive: false, burn: false, chain: true,
      sound: 'rifle', shake: 3, muzzle: 16, recoil: 2 },

    { id: 'void_rifle', name: 'Void Reaper', icon: 'fa-skull', type: 'void',
      damage: 300, fireRate: 1.0, range: 900, spread: 0.01, count: 1,
      price: 95000, desc: 'Erases matter. Bullets ignore armor and heal you.',
      rarity: 'mythic', pellets: 'Void Round',
      auto: false, pierce: true, explosive: false, burn: false, lifesteal: 0.3,
      sound: 'harpoon', shake: 10, muzzle: 24, recoil: 8 },

    { id: 'coral_launcher', name: 'Coral Mortar', icon: 'fa-seedling', type: 'launcher',
      damage: 220, fireRate: 1.5, range: 700, spread: 0.12, count: 1,
      price: 58000, desc: 'Launches explosive coral that spawns damaging reefs.',
      rarity: 'legendary', pellets: 'Coral Grenade',
      auto: false, pierce: false, explosive: true, burn: false, coral: true,
      sound: 'shotgun', shake: 12, muzzle: 20, recoil: 10 },

    { id: 'frost_bow', name: 'Glacial Bow', icon: 'fa-icicles', type: 'crossbow',
      damage: 140, fireRate: 1.1, range: 800, spread: 0.0, count: 3,
      price: 48000, desc: 'Triple shot that freezes enemies in place.',
      rarity: 'mythic', pellets: 'Ice Shards',
      auto: false, pierce: true, explosive: false, burn: false, freeze: true,
      sound: 'harpoon', shake: 5, muzzle: 10, recoil: 4 },

    { id: 'magma_shotgun', name: 'Magma Blunderbuss', icon: 'fa-fire-burner', type: 'shotgun',
      damage: 25, fireRate: 0.5, range: 350, spread: 0.35, count: 10,
      price: 32000, desc: 'Erupts with molten shrapnel. Burns everything.',
      rarity: 'legendary', pellets: '10 Molten Pellets',
      auto: false, pierce: false, explosive: false, burn: true,
      sound: 'shotgun', shake: 8, muzzle: 22, recoil: 7 },

    { id: 'sonic_pistol', name: 'Resonance Pistol', icon: 'fa-wave-square', type: 'sonic',
      damage: 80, fireRate: 0.25, range: 600, spread: 0.02, count: 1,
      price: 28000, desc: 'Sonic waves pierce walls and stun enemies.',
      rarity: 'epic', pellets: 'Sonic Pulse',
      auto: false, pierce: true, explosive: false, burn: false, stun: true,
      sound: 'pistol', shake: 4, muzzle: 12, recoil: 3 }
];

const RODS = [
    { id: 'rod_starter', name: 'Standard Line',      tensionMax: 100, reelPower: 45,  luck: 0.00, price: 0,      desc: 'Basic setup. Good for panfish.',            rarity: 'common',    color: '#94a3b8' },
    { id: 'rod_pro',     name: 'Kevlar Reinforced',  tensionMax: 180, reelPower: 80,  luck: 0.15, price: 900,    desc: 'High tension limit for wild fish.',         rarity: 'rare',      color: '#38bdf8' },
    { id: 'rod_carbon',  name: 'Carbon Flex',        tensionMax: 220, reelPower: 95,  luck: 0.25, price: 2000,   desc: 'Balanced flex. Smooth reeling.',            rarity: 'rare',      color: '#22d3ee' },
    { id: 'rod_mythic',  name: 'Titanium Reel',      tensionMax: 300, reelPower: 130, luck: 0.50, price: 4200,   desc: 'Ultra-fast reel. Drags monsters to shore.', rarity: 'epic',      color: '#a855f7' },
    { id: 'rod_bio',     name: 'Bioluminescent Rig', tensionMax: 380, reelPower: 160, luck: 0.75, price: 7500,   desc: 'Glows underwater. Fish hesitate to fight.', rarity: 'epic',      color: '#22c55e' },
    { id: 'rod_storm',   name: 'Stormweaver',        tensionMax: 440, reelPower: 185, luck: 1.10, price: 11000,  desc: 'Handles the wildest currents.',             rarity: 'legendary', color: '#eab308' },
    { id: 'rod_abyssal', name: 'Abyssal Grapple',    tensionMax: 520, reelPower: 220, luck: 1.50, price: 18000,  desc: 'Legendary. Nothing escapes this line.',     rarity: 'legendary', color: '#f59e0b' },
    { id: 'rod_cosmic',  name: 'Cosmic Thread',      tensionMax: 700, reelPower: 280, luck: 2.20, price: 45000,  desc: 'Mythic. The line bends reality itself.',    rarity: 'mythic',    color: '#e879f9' }
];
const WeaponSystem = {
    // Returns the weapon currently held in the active slot, or null.
    getActiveWeapon(state) {
        const p = state.player;
        const id = p.equippedWeapons[p.activeSlot];
        if (!id) return null;
        return WEAPONS.find(w => w.id === id) || null;
    },

    shoot(state) {
        const p = state.player;
        const w = this.getActiveWeapon(state);
        const now = Utils.now();

        if (!w) return;
        if (p.reloading) return;
        if (p.lastShotTime > 0 && now - p.lastShotTime < w.fireRate) return;

        const ammo = p.weaponAmmo[w.id];
        if (ammo !== undefined && ammo <= 0) {
            Particles.showFloatingText(state, `OUT OF AMMO! Press R`, p.x, p.y - 30, '#f87171');
            return;
        }

        p.lastShotTime = now;
        if (p.weaponAmmo[w.id] !== Infinity && p.weaponAmmo[w.id] !== undefined) {
            p.weaponAmmo[w.id]--;
            Player.refreshWeaponHUD(state);
        }

        p.weaponRecoil = (w.recoil || 4);
        p.muzzleFlash = (w.muzzle || 12) / 10;

        try { audio.playGunshot(w.sound || w.type); } catch (e) {}
        state.screenShake = w.shake || 3;

        const angle = Math.atan2(state.mouse.worldY - p.y, state.mouse.worldX - p.x);

        for (let i = 0; i < w.count; i++) {
            const spreadAngle = angle + (Math.random() - 0.5) * w.spread;
            state.bullets.push({
                x: p.x + Math.cos(angle) * 26,
                y: p.y + Math.sin(angle) * 26,
                vx: Math.cos(spreadAngle) * 900,
                vy: Math.sin(spreadAngle) * 900,
                damage: w.damage,
                range: w.range,
                distTraveled: 0,
                type: w.type,
                owner: 'player',
                pierce: !!w.pierce,
                explosive: !!w.explosive,
                burn: !!w.burn,
                // NEW: Special weapon properties
                poison: !!w.poison,
                chain: !!w.chain,
                lifesteal: w.lifesteal || 0,
                coral: !!w.coral,
                freeze: !!w.freeze,
                stun: !!w.stun,
                hitSet: new Set(),
                trail: []
            });
        }

        const smokeCol = w.type === 'plasma' ? '#a5f3fc'
                       : w.type === 'rail'   ? '#93c5fd'
                       : w.type === 'flame'  ? '#fb923c'
                       : '#fbbf24';
        for (let i = 0; i < 6; i++) {
            const a = angle + (Math.random() - 0.5) * 0.6;
            state.particles.push({
                x: p.x + Math.cos(angle) * 20,
                y: p.y + Math.sin(angle) * 20,
                vx: Math.cos(a) * (150 + Math.random() * 150),
                vy: Math.sin(a) * (150 + Math.random() * 150),
                color: smokeCol, life: 0.15, size: 3
            });
        }
    },

    reload(state) {
        const p = state.player;
        const w = this.getActiveWeapon(state);
        if (!w) return;
        if (w.id === 'pistol') return;
        if (p.reloading) return;

        const max = (CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id]) || Infinity;
        if (max === Infinity) return;
        if (p.weaponAmmo[w.id] >= max) {
            Particles.showFloatingText(state, "Magazine full!", p.x, p.y - 30, '#94a3b8');
            return;
        }
        p.reloading = true;
        p.reloadTimer = 1.2;
        Particles.showFloatingText(state, "Reloading...", p.x, p.y - 30, '#38bdf8');
    },

    update(state, delta) {
        const p = state.player;

        // Reload tick
        if (p.reloading) {
            p.reloadTimer -= delta;
            if (p.reloadTimer <= 0) {
                p.reloading = false;
                const w = this.getActiveWeapon(state);
                if (w) {
                    const max = (CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id]) || Infinity;
                    if (max !== Infinity) {
                        const needed = max - (p.weaponAmmo[w.id] || 0);
                        const unit = (CONFIG.AMMO_PRICES && CONFIG.AMMO_PRICES[w.id]) || 1;
                        const cost = needed * unit;
                        if (p.coins >= cost) {
                            p.coins -= cost;
                            p.weaponAmmo[w.id] = max;
                            Player.refreshHUD(state);
                            Player.refreshWeaponHUD(state);
                            Particles.showFloatingText(state, `Reloaded! -${cost}c`, p.x, p.y - 30, '#facc15');
                        } else {
                            const canAfford = Math.floor(p.coins / unit);
                            if (canAfford > 0) {
                                p.weaponAmmo[w.id] = (p.weaponAmmo[w.id] || 0) + canAfford;
                                p.coins -= canAfford * unit;
                                Player.refreshHUD(state);
                                Player.refreshWeaponHUD(state);
                                Particles.showFloatingText(state, `Partial reload: +${canAfford}`, p.x, p.y - 30, '#facc15');
                            } else {
                                Particles.showFloatingText(state, "Can't afford ammo!", p.x, p.y - 30, '#f87171');
                            }
                        }
                    }
                }
            }
        }

        // Auto fire
        const w = this.getActiveWeapon(state);
        if (state.mouse.isDown && w && w.auto && !p.reloading) {
            this.shoot(state);
        }

        if (p.weaponRecoil > 0) p.weaponRecoil = Math.max(0, p.weaponRecoil - delta * 40);
        if (p.muzzleFlash > 0)   p.muzzleFlash   = Math.max(0, p.muzzleFlash   - delta * 30);

        // Bullet step + collision (player bullets only)
        for (let i = state.bullets.length - 1; i >= 0; i--) {
            const b = state.bullets[i];
            if (b.owner === 'enemy') continue;

            const stepX = b.vx * delta;
            const stepY = b.vy * delta;
            b.x += stepX; b.y += stepY;
            b.distTraveled = (b.distTraveled || 0) + Math.hypot(stepX, stepY);

            if (b.trail) {
                b.trail.push({ x: b.x, y: b.y });
                if (b.trail.length > 5) b.trail.shift();
            }

            if (b.range && b.distTraveled >= b.range) {
                state.bullets.splice(i, 1);
                continue;
            }

            let consumed = false;

            const hooked = state.fishing.hookedFish;
            if (hooked && state.fishing.mode === 'HOOKED' &&
                !(b.hitSet && b.hitSet.has('fish'))) {
                const hitR = hooked.species.size + (hooked.isInflated ? 12 : 0) + 8;
                if (Math.hypot(b.x - hooked.x, b.y - hooked.y) < hitR) {
                    let dmg = b.damage;
                    if (hooked.isInflated) dmg *= 0.5;
                    hooked.hp -= dmg;
                    hooked.stamina -= dmg * CONFIG.STAMINA_DRAIN_PER_BULLET;
                    try { audio.playHit(); } catch (e) {}
                    Particles.spawnWaterSplashes(state, hooked.x, hooked.y, 5);
                    Particles.showFloatingText(state, `-${Math.round(dmg)}`,
                        hooked.x, hooked.y - 20, '#38bdf8');
                    if (b.hitSet) b.hitSet.add('fish');

                    if (hooked.hp <= 0) {
                        hooked.hp = 0;
                        Fishing.killHookedFish(state);
                    }
                    if (!b.pierce) consumed = true;
                }
            }

            if (!consumed) {
                for (let j = state.monstersOnLand.length - 1; j >= 0; j--) {
                    const m = state.monstersOnLand[j];
                    if (b.hitSet && b.hitSet.has(m)) continue;
                    if (Math.hypot(b.x - m.x, b.y - m.y) < m.species.size + 5) {
                        m.hp -= b.damage;
                        try { audio.playHit(); } catch (e) {}
                        Particles.spawnBloodImpact(state, m.x, m.y, m.species.color);
                        Particles.showFloatingText(state, `-${b.damage}`,
                            m.x, m.y - 15, '#f87171');
                        m.x += (b.vx / 900) * 12;
                        m.y += (b.vy / 900) * 12;
                        if (b.hitSet) b.hitSet.add(m);

                        if (b.burn) m.burnTimer = 3.0;

                        // NEW: Poison effect (crossbow)
                        if (b.poison) {
                            m.poisonTimer = 5.0;
                            m.poisonDps = Math.round(b.damage * 0.3);
                            Particles.spawnParticles(state, m.x, m.y, '#84cc16', 8);
                            Particles.showFloatingText(state, 'POISONED!', m.x, m.y - 30, '#84cc16');
                        }

                        // NEW: Freeze effect (frost bow)
                        if (b.freeze) {
                            m.freezeTimer = 2.5;
                            m.slowed = true;
                            Particles.spawnParticles(state, m.x, m.y, '#67e8f9', 12, { size: 4 });
                            Particles.showFloatingText(state, 'FROZEN!', m.x, m.y - 30, '#67e8f9');
                        }

                        // NEW: Stun effect (sonic pistol)
                        if (b.stun) {
                            m.stunTimer = 1.5;
                            Particles.spawnParticles(state, m.x, m.y, '#fde047', 10);
                            Particles.showFloatingText(state, 'STUNNED!', m.x, m.y - 30, '#fde047');
                        }

                        // NEW: Lifesteal (void rifle)
                        if (b.lifesteal) {
                            const healAmount = Math.round(b.damage * b.lifesteal);
                            const p = state.player;
                            const oldHp = p.hp;
                            p.hp = Math.min(p.maxHp, p.hp + healAmount);
                            if (p.hp > oldHp) {
                                Particles.showFloatingText(state, `+${p.hp - oldHp} HP`, p.x, p.y - 40, '#34d399');
                                if (typeof UI !== 'undefined' && UI.triggerDamageFlash) {
                                    const el = document.getElementById('damage-flash');
                                    if (el) {
                                        el.style.background = 'radial-gradient(circle, transparent 30%, rgba(52, 211, 153, 0.4) 100%)';
                                        el.classList.remove('active');
                                        void el.offsetWidth;
                                        el.classList.add('active');
                                        setTimeout(() => el.style.background = '', 300);
                                    }
                                }
                                Player.refreshHUD(state);
                            }
                        }

                        // NEW: Coral reef creation (coral launcher)
                        if (b.coral) {
                            state.groundHazards.push({
                                x: m.x, y: m.y, radius: 80, duration: 6.0,
                                type: 'coral', damagePerSec: 15, color: '#14b8a6'
                            });
                            Particles.spawnParticles(state, m.x, m.y, '#14b8a6', 15, { size: 5 });
                        }

                        if (b.explosive) {
                            const splash = 70;
                            const sDmg = b.damage * 0.5;
                            for (const other of state.monstersOnLand) {
                                if (other === m) continue;
                                if (Math.hypot(other.x - m.x, other.y - m.y) < splash) {
                                    other.hp -= sDmg;
                                    Particles.showFloatingText(state,
                                        `-${Math.round(sDmg)}`,
                                        other.x, other.y - 15, '#fbbf24');
                                }
                            }
                            Particles.spawnParticles(state, m.x, m.y, '#f97316', 20, { size: 6 });
                            state.screenShake = Math.max(state.screenShake, 12);
                        }

                        // NEW: Chain lightning (tesla gun)
                        if (b.chain) {
                            let targetsHit = 1;
                            for (const other of state.monstersOnLand) {
                                if (other === m) continue;
                                if (targetsHit >= 4) break; // Max 4 targets
                                const dist = Math.hypot(other.x - m.x, other.y - m.y);
                                if (dist < 200) {
                                    other.hp -= Math.round(b.damage * 0.6);
                                    Particles.spawnParticles(state, other.x, other.y, '#38bdf8', 8);
                                    Particles.showFloatingText(state, `-${Math.round(b.damage * 0.6)}`,
                                        other.x, other.y - 15, '#38bdf8');
                                    // Visual chain
                                    if (typeof Particles !== 'undefined') {
                                        Particles.spawnLightning(state, m.x, m.y, other.x, other.y, '#38bdf8');
                                    }
                                    targetsHit++;
                                }
                            }
                        }

                        if (!b.pierce) { consumed = true; break; }
                    }
                }
            }

            if (consumed) state.bullets.splice(i, 1);
        }
    }
};