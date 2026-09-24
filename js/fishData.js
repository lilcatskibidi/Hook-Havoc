// Base skill damage scaler tied to rarity tier and fish attack stat
function getSkillDamage(fish, baseMultiplier = 1.0) {
    const rarityMultipliers = {
        common: 1.0,
        rare: 1.4,
        epic: 2.0,
        legendary: 3.2,
        mythic: 4.8
    };
    const tierMult = rarityMultipliers[fish.species.rarity] || 1.0;
    return Math.round((fish.species.attack * 0.8) * tierMult * baseMultiplier);
}

const FISH_SPECIES = [
    // --- COMMON ---
	    // --- NEW: COMMON ---
    {
        id: 'sardine', name: 'Silver Sardine', color: '#cbd5e1', accent: '#94a3b8',
        size: 12, maxHp: 120, staminaMax: 100, attack: 12, speed: 5.0,
        value: 60, rarity: 'common', shape: 'oval', finColor: '#64748b',
        desc: 'A quick flash in the shallows.',
        skills: ['dart'], skillName: 'Quick Dart'
    },
    {
        id: 'mudcrab', name: 'Mud Crab', color: '#92400e', accent: '#78350f',
        size: 22, maxHp: 380, staminaMax: 260, attack: 30, speed: 2.4,
        value: 200, rarity: 'common', shape: 'crab', finColor: '#451a03',
        desc: 'Armored bottom feeder. Pinches hard.',
        skills: ['mudSlime', 'rage'], skillName: 'Mud Slime / Pinch'
    },

    // --- NEW: RARE ---
    {
        id: 'stingray', name: 'Spotted Stingray', color: '#a78bfa', accent: '#8b5cf6',
        size: 30, maxHp: 640, staminaMax: 400, attack: 58, speed: 4.5,
        value: 560, rarity: 'rare', shape: 'ray', finColor: '#6d28d9',
        desc: 'Glides silently with a venomous barb.',
        skills: ['poisonSpit', 'dart', 'blink'], skillName: 'Barb / Poison / Glide'
    },
    {
        id: 'sea_turtle', name: 'Reef Turtle', color: '#4ade80', accent: '#16a34a',
        size: 28, maxHp: 800, staminaMax: 420, attack: 48, speed: 3.2,
        value: 720, rarity: 'rare', shape: 'turtle', finColor: '#15803d',
        desc: 'Hard shell absorbs most damage.',
        skills: ['inflate', 'whirlpool', 'waterJet'], skillName: 'Shell Guard / Whirl'
    },
    {
        id: 'lionfish', name: 'Lionfish', color: '#fb7185', accent: '#e11d48',
        size: 26, maxHp: 620, staminaMax: 380, attack: 62, speed: 4.0,
        value: 640, rarity: 'rare', shape: 'spiky', finColor: '#9f1239',
        desc: 'Venomous spines fan out when threatened.',
        skills: ['spineVolley', 'poisonSpit', 'rage'], skillName: 'Spine Fan / Venom'
    },

    // --- NEW: EPIC ---
    {
        id: 'thunder_ray', name: 'Thunder Ray', color: '#38bdf8', accent: '#0ea5e9',
        size: 40, maxHp: 1400, staminaMax: 780, attack: 105, speed: 5.0,
        value: 1700, rarity: 'epic', shape: 'ray', finColor: '#0369a1',
        desc: 'Charges the water with crackling static.',
        skills: ['shock', 'zapOrb', 'stormSpiral', 'blink'], skillName: 'Static Field / Zap'
    },
    {
        id: 'coral_dragon', name: 'Coral Dragon', color: '#f97316', accent: '#ea580c',
        size: 44, maxHp: 1700, staminaMax: 850, attack: 118, speed: 4.4,
        value: 2100, rarity: 'epic', shape: 'dragon', finColor: '#9a3412',
        desc: 'An ancient reef guardian with blazing fins.',
        skills: ['inferno', 'magmaShower', 'charge', 'rage'], skillName: 'Ember Breath / Charge'
    },

    // --- NEW: LEGENDARY ---
    {
        id: 'star_ray', name: 'Astral Manta', color: '#c084fc', accent: '#a855f7',
        size: 52, maxHp: 2600, staminaMax: 1300, attack: 150, speed: 3.6,
        value: 4200, rarity: 'legendary', shape: 'manta', finColor: '#7e22ce',
        desc: 'A living constellation gliding through the deep.',
        skills: ['cosmicStorm', 'voidPull', 'solarBeam', 'blink'], skillName: 'Star Fall / Void Rift'
    },
    {
        id: 'leviathan_turtle', name: 'Worldshell Tortoise', color: '#0d9488', accent: '#115e59',
        size: 58, maxHp: 4200, staminaMax: 1800, attack: 155, speed: 3.0,
        value: 5200, rarity: 'legendary', shape: 'turtle', finColor: '#042f2e',
        desc: 'An island given life. Its shell is a fortress.',
        skills: ['tsunami', 'whirlpool', 'inflate', 'shock', 'drain'], skillName: 'Tide Crash / Shell Fortress'
    },

    // --- NEW: MYTHIC ---
    {
        id: 'elder_dragon', name: 'Abyssal Dragon', color: '#7c3aed', accent: '#4c1d95',
        size: 66, maxHp: 8200, staminaMax: 2600, attack: 285, speed: 4.8,
        value: 18000, rarity: 'mythic', shape: 'dragon', finColor: '#2e1065',
        desc: 'The end of the fishing line. Every cast is a gamble.',
        skills: ['inferno', 'cosmicStorm', 'voidPull', 'supernova', 'drain', 'charge'],
        skillName: 'Cataclysm / Void Rend / Elder Charge'
    },
    {
        id: 'celestial_ray', name: 'Celestial Stingray', color: '#fde68a', accent: '#f59e0b',
        size: 60, maxHp: 7000, staminaMax: 2400, attack: 260, speed: 5.2,
        value: 16500, rarity: 'mythic', shape: 'ray', finColor: '#b45309',
        desc: 'Its barb pierces reality itself.',
        skills: ['solarBeam', 'timeWarp', 'flashBang', 'blink', 'drain', 'supernova'],
        skillName: 'Radiant Barb / Time Pierce'
    },
    {
        id: 'bass', name: 'Green Bass', color: '#34d399', accent: '#10b981',
        size: 18, maxHp: 180, staminaMax: 160, attack: 18, speed: 3.2,
        value: 75, rarity: 'common', shape: 'oval', finColor: '#059669',
        desc: 'Aggressive freshwater swimmer.',
        skills: ['waterJet', 'dart'], skillName: 'Water Jet / Dart'
    },
    {
        id: 'snapper', name: 'Razor Snapper', color: '#f87171', accent: '#ef4444',
        size: 22, maxHp: 280, staminaMax: 240, attack: 32, speed: 4.5,
        value: 160, rarity: 'common', shape: 'spiky', finColor: '#dc2626',
        desc: 'Fast. Rages furiously when hooked.',
        skills: ['rage', 'waterJet'], skillName: 'Rage / Water Jet'
    },
    {
        id: 'catfish', name: 'Armored Catfish', color: '#854d0e', accent: '#a16207',
        size: 24, maxHp: 420, staminaMax: 300, attack: 28, speed: 2.8,
        value: 220, rarity: 'common', shape: 'oval', finColor: '#713f12',
        desc: 'Heavy and stubborn tank.',
        skills: ['whirlpool', 'mudSlime'], skillName: 'Whirlpool / Mud Slime'
    },
    {
        id: 'neon_tetra', name: 'Glow Neon', color: '#38bdf8', accent: '#818cf8',
        size: 14, maxHp: 150, staminaMax: 120, attack: 15, speed: 4.8,
        value: 90, rarity: 'common', shape: 'oval', finColor: '#6366f1',
        desc: 'Small and agile. Emits distracting flashes.',
        skills: ['flashBang', 'dart'], skillName: 'Flash / Quick Dart'
    },

    // --- RARE ---
    {
        id: 'eel', name: 'Electric Eel', color: '#fbbf24', accent: '#f59e0b',
        size: 26, maxHp: 520, staminaMax: 380, attack: 50, speed: 5.2,
        value: 450, rarity: 'rare', shape: 'eel', finColor: '#d97706',
        desc: 'Shocks the line and fires chain lightning bursts.',
        skills: ['shock', 'zapOrb', 'blink'], skillName: 'Shock / Zap Orb / Blink'
    },
    {
        id: 'puffer', name: 'Spike Puffer', color: '#fb923c', accent: '#f97316',
        size: 24, maxHp: 650, staminaMax: 350, attack: 55, speed: 3.5,
        value: 520, rarity: 'rare', shape: 'puffer', finColor: '#ea580c',
        desc: 'Inflates to absorb damage and shoots toxic spines.',
        skills: ['inflate', 'spineVolley', 'poisonSpit'], skillName: 'Inflate / Spine Volley'
    },
    {
        id: 'viperfish', name: 'Abyssal Viperfish', color: '#38bdf8', accent: '#0284c7',
        size: 28, maxHp: 720, staminaMax: 420, attack: 65, speed: 4.8,
        value: 680, rarity: 'rare', shape: 'eel', finColor: '#0369a1',
        desc: 'Chills the line and hurls ice lances.',
        skills: ['frostbite', 'iceSpikeRing', 'dart'], skillName: 'Ice Lance / Ice Ring'
    },
    {
        id: 'angler', name: 'Luminous Angler', color: '#a3e635', accent: '#65a30d',
        size: 30, maxHp: 800, staminaMax: 400, attack: 60, speed: 3.8,
        value: 750, rarity: 'rare', shape: 'puffer', finColor: '#4d7c0f',
        desc: 'Spits venomous fluid and blinds with flash bursts.',
        skills: ['poisonSpit', 'flashBang', 'drain'], skillName: 'Poison Spray / Flash'
    },
    {
        id: 'prism_squid', name: 'Prism Squid', color: '#f472b6', accent: '#db2777',
        size: 25, maxHp: 680, staminaMax: 390, attack: 58, speed: 4.6,
        value: 620, rarity: 'rare', shape: 'kraken', finColor: '#be185d',
        desc: 'Blinds with shimmering ink and warps across positions.',
        skills: ['blink', 'flashBang', 'poisonSpit'], skillName: 'Prism Flash / Warp Ink'
    },

    // --- EPIC (BOSS TIER 1) ---
    {
        id: 'shark', name: 'Hammerhead Shark', color: '#94a3b8', accent: '#64748b',
        size: 38, maxHp: 1200, staminaMax: 650, attack: 95, speed: 4.2,
        value: 1250, rarity: 'epic', shape: 'shark', finColor: '#475569',
        desc: 'Brutal predator. Charges violently and fires shockwaves.',
        skills: ['charge', 'waterJet', 'tidalWave', 'rage'], skillName: 'Charge / Tidal Wave'
    },
    {
        id: 'magma_pike', name: 'Infernal Pike', color: '#ea580c', accent: '#c2410c',
        size: 36, maxHp: 1450, staminaMax: 720, attack: 110, speed: 5.5,
        value: 1600, rarity: 'epic', shape: 'spiky', finColor: '#9a3412',
        desc: 'Burns with intense fire, shooting magma blasts and fire rings.',
        skills: ['inferno', 'magmaShower', 'shock', 'dart'], skillName: 'Magma Blast / Shower'
    },
    {
        id: 'ghost_ray', name: 'Phantom Ray', color: '#cbd5e1', accent: '#94a3b8',
        size: 40, maxHp: 1350, staminaMax: 800, attack: 85, speed: 4.6,
        value: 1800, rarity: 'epic', shape: 'oval', finColor: '#64748b',
        desc: 'Fades into camouflage while ambushing with void shots.',
        skills: ['camouflaged', 'voidPull', 'blink', 'drain'], skillName: 'Camouflage / Void Orb'
    },
    {
        id: 'frost_manta', name: 'Glacial Manta', color: '#67e8f9', accent: '#0891b2',
        size: 42, maxHp: 1500, staminaMax: 750, attack: 100, speed: 4.0,
        value: 1950, rarity: 'epic', shape: 'oval', finColor: '#0e7490',
        desc: 'Freezes surrounding waters with sweeping ice spirals.',
        skills: ['iceSpikeRing', 'frostbite', 'blizzardNova', 'whirlpool'], skillName: 'Blizzard Nova / Ice Ring'
    },

    // --- LEGENDARY (RAID BOSS TIER) ---
    {
        id: 'kraken', name: 'Abyssal Leviathan', color: '#a855f7', accent: '#9333ea',
        size: 50, maxHp: 2400, staminaMax: 1200, attack: 145, speed: 3.4,
        value: 3500, rarity: 'legendary', shape: 'kraken', finColor: '#7e22ce',
        desc: 'Terrifying deep-sea titan. Drains tension and fires void barrages.',
        skills: ['drain', 'voidPull', 'tentacleSlam', 'inkCloud', 'whirlpool'], 
        skillName: 'Drain / Void Barrage / Slam'
    },
    {
        id: 'golden', name: 'Golden Koi', color: '#fde047', accent: '#eab308',
        size: 22, maxHp: 1600, staminaMax: 900, attack: 75, speed: 5.8,
        value: 4000, rarity: 'legendary', shape: 'koi', finColor: '#ca8a04',
        desc: 'Evasive teleporting fish that fires radiant golden beams.',
        skills: ['blink', 'solarBeam', 'flashBang', 'shock', 'rage'], 
        skillName: 'Blink / Solar Beam'
    },
    {
        id: 'tsunami_whale', name: 'Tidal Whale', color: '#2563eb', accent: '#1d4ed8',
        size: 56, maxHp: 3200, staminaMax: 1500, attack: 160, speed: 3.0,
        value: 5000, rarity: 'legendary', shape: 'shark', finColor: '#1e40af',
        desc: 'Creates massive waves and water barrages that snap heavy lines.',
        skills: ['tsunami', 'waterJet', 'tidalWave', 'charge', 'drain'], 
        skillName: 'Tsunami Wave / Heavy Jet'
    },
    {
        id: 'storm_hydra', name: 'Tempest Hydra', color: '#10b981', accent: '#047857',
        size: 54, maxHp: 3800, staminaMax: 1700, attack: 175, speed: 3.8,
        value: 5800, rarity: 'legendary', shape: 'eel', finColor: '#065f46',
        desc: 'Unleashes spiraling electric storms and localized whirlpools.',
        skills: ['zapOrb', 'stormSpiral', 'shock', 'tsunami', 'rage'],
        skillName: 'Storm Spiral / Zap Barrage'
    },

    // --- MYTHIC (WORLD BOSS TIER) ---
    {
        id: 'void_drake', name: 'Void Serpent', color: '#6b21a8', accent: '#581c87',
        size: 60, maxHp: 5000, staminaMax: 2000, attack: 220, speed: 4.2,
        value: 9500, rarity: 'mythic', shape: 'eel', finColor: '#3b0764',
        desc: 'Ancient cosmic beast with homing void orbs and gravity wells.',
        skills: ['voidPull', 'cosmicStorm', 'blink', 'drain', 'shock', 'inferno'], 
        skillName: 'Cosmic Storm / Void Orb / Warp'
    },
    {
        id: 'sun_fish', name: 'Celestial Solarfish', color: '#f59e0b', accent: '#d97706',
        size: 52, maxHp: 6500, staminaMax: 2200, attack: 250, speed: 5.0,
        value: 12000, rarity: 'mythic', shape: 'koi', finColor: '#b45309',
        desc: 'Radiates solar heat, firing explosive supernovas and firestorms.',
        skills: ['supernova', 'solarBeam', 'magmaShower', 'rage', 'blink', 'drain'], 
        skillName: 'Supernova / Solar Flare / Flare Rampage'
    },
    {
        id: 'chronos_squid', name: 'Chrono Kraken', color: '#06b6d4', accent: '#0284c7',
        size: 64, maxHp: 7500, staminaMax: 2500, attack: 270, speed: 4.5,
        value: 15000, rarity: 'mythic', shape: 'kraken', finColor: '#0369a1',
        desc: 'Manipulates spacetime, firing temporal shockwaves and dark star orbs.',
        skills: ['timeWarp', 'cosmicStorm', 'supernova', 'blink', 'drain', 'tsunami'],
        skillName: 'Temporal Shockwave / Dark Star / Collapse'
    },
	    // ============================================================
    //  BOSS TIER — SUMMONER ARCHETYPES
    //  These are not "hooked" — they're triggered by the
    //  BOSS_TIDE system when a very rare roll happens.
    // ============================================================
    {
        id: 'leviathan_priest',
        name: 'Leviathan Priest',
        color: '#1e40af', accent: '#0ea5e9',
        size: 78, maxHp: 24000, staminaMax: 8000, attack: 340, speed: 3.0,
        value: 55000,
        rarity: 'boss',
        shape: 'kraken',
        finColor: '#0c4a6e',
        desc: 'A chanting horror from the deep. Summons shades and calls tidal waves.',
        skills: ['summonShades', 'tidalCrush', 'bossWhirlpool', 'leviathanRoar'],
        skillName: 'Summon / Tide / Roar',
        isBoss: true
    },
    {
        id: 'stormlord_hydra',
        name: 'Stormlord Hydra',
        color: '#10b981', accent: '#047857',
        size: 74, maxHp: 28000, staminaMax: 9000, attack: 380, speed: 3.6,
        value: 62000,
        rarity: 'boss',
        shape: 'eel',
        finColor: '#064e3b',
        desc: 'Every head casts. Summons storm orbs and chains lightning across the arena.',
        skills: ['summonStormOrbs', 'chainLightning', 'bossWhirlpool', 'stormField'],
        skillName: 'Storm Orbs / Chain Lightning',
        isBoss: true
    },
    {
        id: 'void_shepherd',
        name: 'Void Shepherd',
        color: '#6b21a8', accent: '#a855f7',
        size: 80, maxHp: 32000, staminaMax: 10000, attack: 420, speed: 3.2,
        value: 78000,
        rarity: 'boss',
        shape: 'kraken',
        finColor: '#3b0764',
        desc: 'The hand that feeds the abyss. Tears holes in reality and calls servants.',
        skills: ['summonVoidlings', 'voidCollapse', 'bossWhirlpool', 'gravitationalPull'],
        skillName: 'Voidlings / Collapse / Gravity',
        isBoss: true
    },
    {
        id: 'crimson_emperor',
        name: 'Crimson Emperor',
        color: '#dc2626', accent: '#f59e0b',
        size: 82, maxHp: 36000, staminaMax: 11000, attack: 460, speed: 3.4,
        value: 92000,
        rarity: 'boss',
        shape: 'dragon',
        finColor: '#7f1d1d',
        desc: 'A tyrant from the molten deep. Summons emberlings and calls firestorms.',
        skills: ['summonEmberlings', 'firestormNova', 'bossWhirlpool', 'magmaPillars'],
        skillName: 'Emberlings / Nova / Pillars',
        isBoss: true
    }
];

const Projectiles = {
    update(state, delta) {
        if (!state.projectiles) state.projectiles = [];
        const p = state.player;
        const B = CONFIG.WORLD;

        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const proj = state.projectiles[i];

            // 1. Move projectile
            proj.x += proj.vx * delta;
            proj.y += proj.vy * delta;
            proj.life -= delta;

            // Spiral path modifier if set
            if (proj.isSpiral) {
                proj.spiralAngle = (proj.spiralAngle || 0) + delta * 8;
                proj.x += Math.cos(proj.spiralAngle) * (proj.spiralRadius || 3);
                proj.y += Math.sin(proj.spiralAngle) * (proj.spiralRadius || 3);
            }

            // Homing logic with improved turn speed
            if (proj.isHoming && proj.life > 0.3) {
                const angle = Math.atan2(p.y - proj.y, p.x - proj.x);
                proj.vx += Math.cos(angle) * (proj.homingForce || 350) * delta;
                proj.vy += Math.sin(angle) * (proj.homingForce || 350) * delta;
            }

            // Enhanced Particle Trail Effects
            const spawnRate = proj.particleDensity || 0.6;
            if (Math.random() < spawnRate) {
                const count = proj.trailCount || 1;
                Particles.spawnParticles(state, proj.x, proj.y, proj.color, count, {
                    glow: proj.glow || false,
                    size: proj.radius * 0.5
                });
            }

            // 2. Player Collision Check
            const dist = Math.hypot(p.x - proj.x, p.y - proj.y);
            if (dist < p.radius + proj.radius) {
                p.hp -= proj.damage;
                if (audio.playHit) audio.playHit();
                
                // Burst impact visual
                Particles.spawnParticles(state, proj.x, proj.y, proj.glowColor || proj.color, 12, {
                    speed: 150,
                    size: proj.radius
                });

                Particles.showFloatingText(state, `-${proj.damage}`, p.x, p.y - 25, proj.color);
                Player.refreshHUD(state);
                UI.triggerDamageFlash();
                state.screenShake = proj.impactShake || 10;

                // Knockback away from projectile trajectory
                p.x += (proj.vx > 0 ? 1 : -1) * (proj.knockback || 25);
                p.y += (proj.vy > 0 ? 1 : -1) * (proj.knockback || 25);

                // Clamp player within world bounds
                p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
                p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);

                // Remove projectile
                state.projectiles.splice(i, 1);
                if (p.hp <= 0) Player.die(state);
                continue;
            }

            // 3. Expiration / Out of Bounds Cleanup
            if (proj.life <= 0 || proj.x < B.MIN_X || proj.y < B.MIN_Y || proj.y > B.MAX_Y) {
                Particles.spawnParticles(state, proj.x, proj.y, proj.color, proj.radius > 12 ? 10 : 5);
                state.projectiles.splice(i, 1);
            }
        }
    },

    spawn(state, x, y, targetX, targetY, speed, damage, color, options = {}) {
        if (!state.projectiles) state.projectiles = [];
        const angle = Math.atan2(targetY - y, targetX - x);

        state.projectiles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage,
            color,
            radius: options.radius || 8,
            life: options.life || 3.0,
            isHoming: !!options.isHoming,
            isSpiral: !!options.isSpiral,
            spiralRadius: options.spiralRadius || 3,
            homingForce: options.homingForce || 350,
            glowColor: options.glowColor || color,
            glow: !!options.glow,
            particleDensity: options.particleDensity || 0.6,
            trailCount: options.trailCount || 1,
            impactShake: options.impactShake || 10,
            knockback: options.knockback || 25
        });
    }
};

const FISH_ROLL_TABLE = [
    { species: FISH_SPECIES.find(f => f.id === 'celestial_ray'),    weight: 0.05 },
    { species: FISH_SPECIES.find(f => f.id === 'elder_dragon'),     weight: 0.10 },
    { species: FISH_SPECIES.find(f => f.id === 'chronos_squid'),    weight: 0.15 },
    { species: FISH_SPECIES.find(f => f.id === 'sun_fish'),         weight: 0.20 },
    { species: FISH_SPECIES.find(f => f.id === 'void_drake'),       weight: 0.40 },
    { species: FISH_SPECIES.find(f => f.id === 'leviathan_turtle'), weight: 0.60 },
    { species: FISH_SPECIES.find(f => f.id === 'star_ray'),         weight: 0.90 },
    { species: FISH_SPECIES.find(f => f.id === 'storm_hydra'),      weight: 1.20 },
    { species: FISH_SPECIES.find(f => f.id === 'tsunami_whale'),    weight: 1.50 },
    { species: FISH_SPECIES.find(f => f.id === 'golden'),           weight: 1.80 },
    { species: FISH_SPECIES.find(f => f.id === 'kraken'),           weight: 2.20 },
    { species: FISH_SPECIES.find(f => f.id === 'coral_dragon'),     weight: 3.50 },
    { species: FISH_SPECIES.find(f => f.id === 'thunder_ray'),      weight: 4.00 },
    { species: FISH_SPECIES.find(f => f.id === 'frost_manta'),      weight: 4.50 },
    { species: FISH_SPECIES.find(f => f.id === 'ghost_ray'),        weight: 5.00 },
    { species: FISH_SPECIES.find(f => f.id === 'magma_pike'),       weight: 5.50 },
    { species: FISH_SPECIES.find(f => f.id === 'shark'),            weight: 6.00 },
    { species: FISH_SPECIES.find(f => f.id === 'lionfish'),         weight: 6.80 },
    { species: FISH_SPECIES.find(f => f.id === 'sea_turtle'),       weight: 7.20 },
    { species: FISH_SPECIES.find(f => f.id === 'stingray'),         weight: 7.60 },
    { species: FISH_SPECIES.find(f => f.id === 'prism_squid'),      weight: 8.00 },
    { species: FISH_SPECIES.find(f => f.id === 'angler'),           weight: 8.40 },
    { species: FISH_SPECIES.find(f => f.id === 'viperfish'),        weight: 8.80 },
    { species: FISH_SPECIES.find(f => f.id === 'puffer'),           weight: 9.20 },
    { species: FISH_SPECIES.find(f => f.id === 'eel'),              weight: 9.60 },
    { species: FISH_SPECIES.find(f => f.id === 'neon_tetra'),       weight: 10.0 },
    { species: FISH_SPECIES.find(f => f.id === 'catfish'),          weight: 10.4 },
    { species: FISH_SPECIES.find(f => f.id === 'mudcrab'),          weight: 10.8 },
    { species: FISH_SPECIES.find(f => f.id === 'snapper'),          weight: 11.2 },
    { species: FISH_SPECIES.find(f => f.id === 'bass'),             weight: 11.6 },
    { species: FISH_SPECIES.find(f => f.id === 'sardine'),          weight: 12.0 }
];
// ============================================================
//  LUCK-AWARE FISH ROLL
//  The rod's `luck` value raises the weight of rare+ species.
//  Common and rare weights stay flat; epic/legendary/mythic
//  get boosted by rarity * luck.
// ============================================================
function rollFishSpecies(state) {
    // Pull the active rod's luck value (default 0 if none)
    const rod = state && state.player && state.player.equippedRod;
    const luck = rod && typeof rod.luck === 'number' ? rod.luck : 0;

    // Build a weighted table (recompute each roll so it always uses current luck)
    const luckMult = {
        common:    1.0,                       // never boosted
        rare:      1.0 + luck * 0.10,         // small bump
        epic:      1.0 + luck * 0.35,         // medium bump
        legendary: 1.0 + luck * 0.65,         // big bump
        mythic:    1.0 + luck * 1.00          // full luck multiplier
    };

    let total = 0;
    const weighted = FISH_ROLL_TABLE.map(entry => {
        const rarity = (entry.species && entry.species.rarity) || 'common';
        const mult = luckMult[rarity] || 1.0;
        const w = entry.weight * mult;
        total += w;
        return { species: entry.species, weight: w };
    });

    // Weighted random selection
    const roll = Math.random() * total;
    let acc = 0;
    for (const entry of weighted) {
        acc += entry.weight;
        if (roll < acc) return entry.species;
    }
    return FISH_SPECIES[0];
}
const FISH_SKILLS = {

    // ============================================================
    //  WATER / BASIC PROJECTILES  (still dodgeable, now faster + multi)
    // ============================================================
    waterJet(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.0);
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        // Three-shot spread, tighter and faster than before
        for (let i = -1; i <= 1; i++) {
            const a = baseA + i * 0.08;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 600, fish.y + Math.sin(a) * 600,
                620, dmg, '#38bdf8', {
                    radius: 10, glow: true, particleDensity: 0.9, glowColor: '#93c5fd'
                });
        }
        // Water puddle left behind where the player was
        if (Math.random() < 0.5) {
            ctx.state.groundHazards.push({
                x: p.x, y: p.y, radius: 34, duration: 2.5,
                type: 'water', damagePerSec: 5, color: '#38bdf8'
            });
        }
        ctx.showFloatingText("💦 WATER JET!", fish.x, fish.y - 40, '#38bdf8');
    },

    zapOrb(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.2);
        // Slow homing orb + 4 fast sparks
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 320, dmg, '#eab308', {
            radius: 14, isHoming: true, homingForce: 320,
            life: 4.0, glow: true, glowColor: '#fef08a', trailCount: 2, impactShake: 14
        });
        for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 500, fish.y + Math.sin(a) * 500,
                560, Math.round(dmg * 0.4), '#facc15', { radius: 7 });
        }
        // Lightning patch under the player
        ctx.state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 55, damage: Math.round(dmg * 0.6),
            timer: 0.7, color: '#facc15', shake: 10,
            leaveHazard: true, hazardType: 'fire', hazardDps: 8, hazardDuration: 2.0
        });
        ctx.showFloatingText("⚡ ZAP ORB!", fish.x, fish.y - 40, '#eab308');
    },

    // ============================================================
    //  POISON / SPINES
    // ============================================================
    poisonSpit(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 0.8);
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        // Arc of 6 globs
        for (let i = 0; i < 6; i++) {
            const a = baseA + (i - 2.5) * 0.14;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 400, fish.y + Math.sin(a) * 400,
                400 + i * 20, dmg, '#84cc16', { radius: 9, particleDensity: 0.8 });
        }
        // Big lingering poison pool at player position (slows + damages)
        ctx.state.groundHazards.push({
            x: p.x, y: p.y, radius: 60, duration: 4.0,
            type: 'poison', damagePerSec: 14, color: '#84cc16'
        });
        ctx.showFloatingText("🤢 POISON SPRAY!", fish.x, fish.y - 40, '#84cc16');
    },

    spineVolley(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 0.7);
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        // Wider 9-spike fan, fast
        for (let i = -4; i <= 4; i++) {
            const a = baseA + i * 0.11;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 500, fish.y + Math.sin(a) * 500,
                620, dmg, '#fb923c', { radius: 7, particleDensity: 0.5 });
        }
        // Ring of spikes at player position after delay
        ctx.state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 50, damage: Math.round(dmg * 1.2),
            timer: 0.6, color: '#fb923c', shake: 8
        });
        ctx.showFloatingText("🦔 SPINE VOLLEY!", fish.x, fish.y - 40, '#fb923c');
    },

    // ============================================================
    //  ICE
    // ============================================================
    frostbite(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.3);
        // Fast lance
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 700, dmg, '#06b6d4', {
            radius: 12, glow: true, glowColor: '#a5f3fc', trailCount: 3
        });
        // Ice patch that slows
        ctx.state.groundHazards.push({
            x: p.x, y: p.y, radius: 55, duration: 3.5,
            type: 'ice', damagePerSec: 10, color: '#06b6d4'
        });
        ctx.showFloatingText("❄️ ICE LANCE!", fish.x, fish.y - 40, '#06b6d4');
    },

    iceSpikeRing(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 0.9);
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        // Dense 12-spike ring that overlaps — dodging is a thin gap
        for (let i = 0; i < 12; i++) {
            const a = baseA + (Math.PI * 2 / 12) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 400, fish.y + Math.sin(a) * 400,
                460, dmg, '#22d3ee', { radius: 10, glow: true, particleDensity: 0.9 });
        }
        // Follow-up: three delayed ice bombs at random offsets around the player
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 40 + Math.random() * 90;
            ctx.state.delayedBlasts.push({
                x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
                radius: 55, damage: Math.round(dmg * 1.2), timer: 0.9 + i * 0.25,
                color: '#22d3ee', shake: 10,
                leaveHazard: true, hazardType: 'ice', hazardDps: 8, hazardDuration: 2.5
            });
        }
        ctx.showFloatingText("🧊 FROST RING!", fish.x, fish.y - 40, '#22d3ee');
    },

    blizzardNova(fish, ctx) {
        const dmg = getSkillDamage(fish, 1.3);
        // 16-spike nova with spiral paths (hard to dodge — spiral outward)
        for (let i = 0; i < 16; i++) {
            const a = (Math.PI * 2 / 16) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 500, fish.y + Math.sin(a) * 500,
                380, dmg, '#67e8f9', { radius: 11, isSpiral: true, spiralRadius: 6, glow: true });
        }
        // Arena-wide slow ice field for 4s
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 60 + Math.random() * 180;
            ctx.state.groundHazards.push({
                x: fish.x + Math.cos(a) * d,
                y: fish.y + Math.sin(a) * d,
                radius: 70, duration: 4.0,
                type: 'ice', damagePerSec: 12, color: '#67e8f9'
            });
        }
        ctx.state.screenShake = 18;
        ctx.showFloatingText("🧊 BLIZZARD NOVA!", fish.x, fish.y - 40, '#67e8f9');
    },

    // ============================================================
    //  FIRE / EXPLOSIONS
    // ============================================================
    inferno(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.5);
        // Heavy blast aimed at player
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 520, dmg, '#f97316', {
            radius: 16, glow: true, glowColor: '#fef08a', trailCount: 3, impactShake: 18
        });
        // Fire wave 3 wide
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = -1; i <= 1; i++) {
            const a = baseA + i * 0.18;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 600, fish.y + Math.sin(a) * 600,
                480, Math.round(dmg * 0.6), '#ea580c', { radius: 13 });
        }
        // 3 fire zones at random points around player
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 30 + Math.random() * 130;
            ctx.state.delayedBlasts.push({
                x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
                radius: 65, damage: Math.round(dmg * 0.9),
                timer: 0.7 + i * 0.2, color: '#f97316', shake: 12,
                leaveHazard: true, hazardType: 'fire',
                hazardDps: 18, hazardDuration: 3.5
            });
        }
        ctx.showFloatingText("🔥 MAGMA BLAST!", fish.x, fish.y - 40, '#f97316');
    },

    magmaShower(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.1);
        // 8 delayed meteor impacts forming a rough line toward the player
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = 0; i < 8; i++) {
            const t = i / 7;
            const mx = fish.x + Math.cos(baseA) * (100 + t * 450);
            const my = fish.y + Math.sin(baseA) * (100 + t * 450);
            ctx.state.delayedBlasts.push({
                x: mx + (Math.random() - 0.5) * 80,
                y: my + (Math.random() - 0.5) * 80,
                radius: 55, damage: Math.round(dmg * 0.9),
                timer: 0.5 + i * 0.14, color: '#ea580c', shake: 10,
                leaveHazard: true, hazardType: 'fire',
                hazardDps: 14, hazardDuration: 3.0
            });
        }
        ctx.state.screenShake = 12;
        ctx.showFloatingText("🌋 MAGMA SHOWER!", fish.x, fish.y - 40, '#ea580c');
    },

    supernova(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.4);
        // Two-stage: dense 12-burst nova, then a delayed big blast
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI / 6) * i + Math.atan2(p.y - fish.y, p.x - fish.x);
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 550, fish.y + Math.sin(a) * 550,
                560, dmg, '#f59e0b', { radius: 15, glow: true, particleDensity: 1.0 });
        }
        ctx.state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 110, damage: Math.round(dmg * 1.6),
            timer: 1.0, color: '#fbbf24', shake: 22,
            leaveHazard: true, hazardType: 'fire',
            hazardDps: 25, hazardDuration: 3.5
        });
        ctx.state.screenShake = 20;
        ctx.showFloatingText("💥 SUPERNOVA!", fish.x, fish.y - 40, '#f59e0b');
    },

    // ============================================================
    //  VOID / COSMIC
    // ============================================================
    voidPull(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.6);
        // Slow homing orb
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 300, dmg, '#c084fc', {
            radius: 15, isHoming: true, homingForce: 420,
            life: 5.0, glow: true, glowColor: '#f472b6', trailCount: 2
        });
        // Yank the player toward the boss
        const d = Math.hypot(p.x - fish.x, p.y - fish.y) || 1;
        const pull = 180;
        p.x -= ((p.x - fish.x) / d) * pull * 0.4;
        p.y -= ((p.y - fish.y) / d) * pull * 0.4;
        // Void rift at player's old spot
        ctx.state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 70, damage: Math.round(dmg * 0.8),
            timer: 0.7, color: '#a855f7', shake: 12,
            leaveHazard: true, hazardType: 'void',
            hazardDps: 20, hazardDuration: 3.0
        });
        ctx.showFloatingText("🌌 VOID ORB!", fish.x, fish.y - 40, '#c084fc');
    },

    cosmicStorm(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.5);
        // 3 homing orbs
        for (let i = -1; i <= 1; i++) {
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                p.x + i * 120, p.y, 320, dmg, '#7e22ce', {
                    radius: 14, isHoming: true, homingForce: 440,
                    life: 5.5, glow: true, trailCount: 2
                });
        }
        // Starfall zones around player
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 30 + Math.random() * 180;
            ctx.state.delayedBlasts.push({
                x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
                radius: 60, damage: Math.round(dmg * 0.9),
                timer: 0.8 + i * 0.18, color: '#a855f7', shake: 12
            });
        }
        ctx.state.screenShake = 14;
        ctx.showFloatingText("🌌 COSMIC STORM!", fish.x, fish.y - 40, '#7e22ce');
    },

    // ============================================================
    //  ELECTRIC
    // ============================================================
    shock(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.0);
        // Instant ring of 12 sparks
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 400, fish.y + Math.sin(a) * 400,
                480, Math.round(dmg * 0.5), '#facc15', { radius: 8 });
        }
        // Lightning strike at player position after delay
        ctx.state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 65, damage: dmg,
            timer: 0.55, color: '#fde047', shake: 14,
            leaveHazard: true, hazardType: 'fire', hazardDps: 12, hazardDuration: 2.0
        });
        ctx.state.screenShake = 10;
        ctx.showFloatingText("⚡ SHOCK!", fish.x, fish.y - 40, '#facc15');
    },

    stormSpiral(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.4);
        // 6 spiraling bolts with real spiral motion
        for (let i = 0; i < 6; i++) {
            Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y,
                400 + i * 40, dmg, '#10b981', {
                    radius: 12, isSpiral: true, spiralRadius: 8,
                    glow: true, glowColor: '#a7f3d0'
                });
        }
        // Chain: 4 delayed strikes in a line
        for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            ctx.state.delayedBlasts.push({
                x: p.x + Math.cos(a) * (60 + i * 40),
                y: p.y + Math.sin(a) * (60 + i * 40),
                radius: 50, damage: Math.round(dmg * 0.6),
                timer: 0.6 + i * 0.2, color: '#10b981', shake: 10
            });
        }
        ctx.state.screenShake = 16;
        ctx.showFloatingText("⚡ STORM SPIRAL!", fish.x, fish.y - 40, '#10b981');
    },

    // ============================================================
    //  HEAVY / BEAM
    // ============================================================
    solarBeam(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 2.2);
        // Big fast beam
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 900, dmg, '#fde047', {
            radius: 22, life: 2.5, glow: true, glowColor: '#ffffff',
            trailCount: 5, impactShake: 24
        });
        // Sunfire ground trails in a ring
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 / 6) * i;
            ctx.state.groundHazards.push({
                x: p.x + Math.cos(a) * 70,
                y: p.y + Math.sin(a) * 70,
                radius: 50, duration: 4.0,
                type: 'fire', damagePerSec: 20, color: '#fde047'
            });
        }
        ctx.state.screenShake = 20;
        ctx.showFloatingText("☀️ SOLAR BEAM!", fish.x, fish.y - 40, '#fde047');
    },

    tentacleSlam(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.8);
        // 4 slams in a cross pattern
        const offs = [
            { x: -50, y: 0 }, { x: 50, y: 0 },
            { x: 0, y: -50 }, { x: 0, y: 50 }
        ];
        offs.forEach(o => {
            ctx.state.delayedBlasts.push({
                x: p.x + o.x, y: p.y + o.y,
                radius: 55, damage: dmg, timer: 0.55,
                color: '#a855f7', shake: 18
            });
        });
        // Slow tracking tentacle at player
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 380, Math.round(dmg * 0.7), '#a855f7', {
            radius: 18, isHoming: true, homingForce: 300, life: 3.5,
            glow: true, trailCount: 2
        });
        ctx.state.screenShake = 18;
        ctx.showFloatingText("🦑 TENTACLE SLAM!", fish.x, fish.y - 40, '#a855f7');
    },

    // ============================================================
    //  PULL / AOE
    // ============================================================
    whirlpool(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.2);
        // Pull hard toward boss
        const d = Math.hypot(p.x - fish.x, p.y - fish.y) || 1;
        p.x -= ((p.x - fish.x) / d) * 160;
        p.y -= ((p.y - fish.y) / d) * 160;

        // Vortex at boss: 12 projectiles rotating outward
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 / 12) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 500, fish.y + Math.sin(a) * 500,
                440, dmg, '#0284c7', {
                    radius: 11, isSpiral: true, spiralRadius: 5, glow: true
                });
        }
        // Water zone under player
        ctx.state.groundHazards.push({
            x: p.x, y: p.y, radius: 70, duration: 3.0,
            type: 'water', damagePerSec: 12, color: '#0284c7'
        });
        ctx.showFloatingText("🌀 WHIRLPOOL!", fish.x, fish.y - 40, '#0284c7');
    },

    tsunami(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.5);
        // Massive wall of projectiles — 9-wide
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = -4; i <= 4; i++) {
            const a = baseA + i * 0.12;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                560, dmg, '#1d4ed8', {
                    radius: 14, glow: true, particleDensity: 0.9
                });
        }
        // Slow flood fields that force repositioning
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 60 + Math.random() * 200;
            ctx.state.groundHazards.push({
                x: p.x + Math.cos(a) * r,
                y: p.y + Math.sin(a) * r,
                radius: 80, duration: 4.5,
                type: 'water', damagePerSec: 16, color: '#1d4ed8'
            });
        }
        ctx.state.screenShake = 24;
        ctx.showFloatingText("🌊 TSUNAMI SURGE!", fish.x, fish.y - 40, '#1d4ed8');
    },

    tidalWave(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.2);
        // Wide 5-column wave
        for (let i = -2; i <= 2; i++) {
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                p.x, p.y + i * 70, 520, dmg, '#2563eb', {
                    radius: 14, glow: true, particleDensity: 0.9
                });
        }
        // Two follow-up waves at offsets
        for (let w = 0; w < 2; w++) {
            for (let i = -2; i <= 2; i++) {
                ctx.state.delayedBlasts.push({
                    x: p.x + (Math.random() - 0.5) * 100,
                    y: p.y + (Math.random() - 0.5) * 100 + i * 40,
                    radius: 55, damage: Math.round(dmg * 0.6),
                    timer: 0.8 + w * 0.4, color: '#2563eb', shake: 12,
                    leaveHazard: true, hazardType: 'water',
                    hazardDps: 10, hazardDuration: 2.5
                });
            }
        }
        ctx.showFloatingText("🌊 TIDAL WAVE!", fish.x, fish.y - 40, '#2563eb');
    },

    // ============================================================
    //  UTILITY / MOBILITY / STATUS
    // ============================================================
    dart(fish, ctx) {
        // Fast 3-shot burst toward the player
        const p = ctx.state.player;
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = -1; i <= 1; i++) {
            const a = baseA + i * 0.1;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 400, fish.y + Math.sin(a) * 400,
                700, getSkillDamage(fish, 0.6), '#6ee7b7', { radius: 8 });
        }
        // Also physically dart the fish
        fish.vx += Math.cos(baseA) * 300;
        fish.vy += Math.sin(baseA) * 300;
        ctx.showFloatingText("💨 DART!", fish.x, fish.y - 40, '#6ee7b7');
    },

    rage(fish, ctx) {
        fish.isRaging = true;
        fish.rageTimer = 4.0;
        // Ground quake: 6 delayed blasts in a ring around the fish
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 / 6) * i;
            ctx.state.delayedBlasts.push({
                x: fish.x + Math.cos(a) * 90,
                y: fish.y + Math.sin(a) * 90,
                radius: 60, damage: getSkillDamage(fish, 0.8),
                timer: 0.5 + i * 0.1, color: '#ef4444', shake: 12
            });
        }
        ctx.showFloatingText("😡 ENRAGED!", fish.x, fish.y - 40, '#ef4444');
    },

    drain(fish, ctx) {
        // Tension drain + damage beam + healing
        ctx.state.fishing.lineTension += 60;
        const dmg = getSkillDamage(fish, 1.2);
        Projectiles.spawn(ctx.state, fish.x, fish.y,
            ctx.state.player.x, ctx.state.player.y, 500, dmg, '#a855f7', {
                radius: 14, glow: true, glowColor: '#e9d5ff', trailCount: 2
            });
        ctx.spawnParticles(fish.x, fish.y, '#a855f7', 24);
        ctx.state.screenShake = 14;
        ctx.showFloatingText("TENSION DRAIN!", fish.x, fish.y - 40, '#a855f7');
    },

    blink(fish, ctx) {
        const p = ctx.state.player;
        // Teleport behind the player
        const a = Math.atan2(p.y - fish.y, p.x - fish.x) + Math.PI;
        const d = 60;
        fish.x = Utils.clamp(p.x + Math.cos(a) * d,
            ctx.state.waterBoundaryX + 20, CONFIG.WORLD.MAX_X - 30);
        fish.y = Utils.clamp(p.y + Math.sin(a) * d,
            CONFIG.WORLD.MIN_Y + 30, CONFIG.WORLD.MAX_Y - 30);
        ctx.spawnParticles(fish.x, fish.y, '#fde047', 20);
        // Fake-out flash where it was, so player looks away
        ctx.state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 55,
            damage: getSkillDamage(fish, 0.9),
            timer: 0.5, color: '#fde047', shake: 12
        });
        ctx.showFloatingText("BLINK!", fish.x, fish.y - 40, '#fde047');
    },

    mudSlime(fish, ctx) {
        const p = ctx.state.player;
        ctx.state.fishing.lineTension += 30;
        // Big mud pool that slows
        ctx.state.groundHazards.push({
            x: p.x, y: p.y, radius: 70, duration: 4.5,
            type: 'mud', damagePerSec: 8, color: '#a16207'
        });
        // Mud globs
        for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 300, fish.y + Math.sin(a) * 300,
                320, getSkillDamage(fish, 0.5), '#a16207', { radius: 12 });
        }
        ctx.showFloatingText("💩 MUD SLIME!", fish.x, fish.y - 40, '#a16207');
    },

    inflate(fish, ctx) {
        fish.isInflated = true;
        fish.inflateTimer = 3.0;
        // Burst of spines when inflating
        for (let i = 0; i < 10; i++) {
            const a = (Math.PI * 2 / 10) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 350, fish.y + Math.sin(a) * 350,
                460, getSkillDamage(fish, 0.7), '#f97316', { radius: 10 });
        }
        ctx.showFloatingText("🎈 INFLATED!", fish.x, fish.y - 40, '#f97316');
    },

    camouflaged(fish, ctx) {
        // Turn visually faint AND drop a delayed strike
        fish.stealthTimer = 3.0;
        ctx.state.delayedBlasts.push({
            x: ctx.state.player.x, y: ctx.state.player.y,
            radius: 70, damage: getSkillDamage(fish, 1.2),
            timer: 0.9, color: '#94a3b8', shake: 14
        });
        ctx.showFloatingText("👻 CAMOUFLAGE!", fish.x, fish.y - 40, '#94a3b8');
    },

    flashBang(fish, ctx) {
        const p = ctx.state.player;
        ctx.state.screenShake = 20;
        UI.triggerDamageFlash();
        p.stunTimer = 0.7;
        // Ring of sparks
        for (let i = 0; i < 10; i++) {
            const a = (Math.PI * 2 / 10) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 450, fish.y + Math.sin(a) * 450,
                500, getSkillDamage(fish, 0.4), '#fef08a', { radius: 8 });
        }
        // Blinding patch under player
        ctx.state.groundHazards.push({
            x: p.x, y: p.y, radius: 80, duration: 2.5,
            type: 'flash', damagePerSec: 6, color: '#fef08a'
        });
        ctx.showFloatingText("💥 FLASHBANG!", fish.x, fish.y - 40, '#fef08a');
    },

    charge(fish, ctx) {
        const p = ctx.state.player;
        const angle = Math.atan2(p.y - fish.y, p.x - fish.x);
        fish.vx += Math.cos(angle) * 800;
        fish.vy += Math.sin(angle) * 800;
        ctx.state.screenShake = 10;
        // Dust trail telegraphing the charge lane
        for (let i = 1; i <= 6; i++) {
            ctx.state.delayedBlasts.push({
                x: fish.x + Math.cos(angle) * i * 60,
                y: fish.y + Math.sin(angle) * i * 60,
                radius: 50, damage: getSkillDamage(fish, 0.6),
                timer: 0.3 + i * 0.1, color: '#f87171', shake: 8
            });
        }
        ctx.showFloatingText("🦈 CHARGE!", fish.x, fish.y - 40, '#f87171');
    },

    // ============================================================
    //  HIGH-END SKILLS
    // ============================================================
    emberBreath(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.6);
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        // Massive 7-beam cone
        for (let i = -3; i <= 3; i++) {
            const a = baseA + i * 0.12;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                620, dmg, '#f97316', {
                    radius: 13, glow: true, glowColor: '#fed7aa', particleDensity: 1.0
                });
        }
        // Fire trails along the breath
        for (let i = 0; i < 6; i++) {
            ctx.state.delayedBlasts.push({
                x: fish.x + Math.cos(baseA) * (i * 90 + 60),
                y: fish.y + Math.sin(baseA) * (i * 90 + 60),
                radius: 60, damage: Math.round(dmg * 0.5),
                timer: 0.5 + i * 0.1, color: '#f97316', shake: 10,
                leaveHazard: true, hazardType: 'fire',
                hazardDps: 15, hazardDuration: 3.0
            });
        }
        ctx.showFloatingText("🐉 EMBER BREATH!", fish.x, fish.y - 40, '#f97316');
    },

    elderCharge(fish, ctx) {
        const p = ctx.state.player;
        const a = Math.atan2(p.y - fish.y, p.x - fish.x);
        fish.vx += Math.cos(a) * 1100;
        fish.vy += Math.sin(a) * 1100;
        ctx.state.screenShake = 22;
        // Trail of blasts along the charge path
        for (let i = 1; i <= 8; i++) {
            ctx.state.delayedBlasts.push({
                x: fish.x + Math.cos(a) * i * 70,
                y: fish.y + Math.sin(a) * i * 70,
                radius: 55, damage: getSkillDamage(fish, 0.8),
                timer: 0.25 + i * 0.08, color: '#7c3aed', shake: 12
            });
        }
        ctx.showFloatingText("👑 ELDER CHARGE!", fish.x, fish.y - 40, '#7c3aed');
    },

    voidRend(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 2.4);
        // 4 homing orbs
        for (let i = 0; i < 4; i++) {
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                p.x + (Math.random() - 0.5) * 100,
                p.y + (Math.random() - 0.5) * 100,
                260 + i * 50, dmg, '#4c1d95', {
                    radius: 18, isHoming: true, homingForce: 480,
                    life: 5.0, glow: true, glowColor: '#a78bfa', trailCount: 3
                });
        }
        // Rift zone under player
        ctx.state.groundHazards.push({
            x: p.x, y: p.y, radius: 90, duration: 4.0,
            type: 'void', damagePerSec: 22, color: '#4c1d95'
        });
        ctx.state.screenShake = 18;
        ctx.showFloatingText("🕳️ VOID REND!", fish.x, fish.y - 40, '#4c1d95');
    },

    cataclysm(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 3.0);
        // Two-stage: 16-projectile nova, then 8 delayed blasts
        for (let i = 0; i < 16; i++) {
            const a = (Math.PI * 2 / 16) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                620, dmg, '#7c3aed', {
                    radius: 18, glow: true, glowColor: '#ffffff', particleDensity: 1.0
                });
        }
        // Carpet of delayed blasts around the player
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 / 8) * i;
            const r = 60 + (i % 2) * 80;
            ctx.state.delayedBlasts.push({
                x: p.x + Math.cos(a) * r,
                y: p.y + Math.sin(a) * r,
                radius: 70, damage: Math.round(dmg * 0.8),
                timer: 1.0 + i * 0.1, color: '#7c3aed', shake: 16,
                leaveHazard: true, hazardType: 'void',
                hazardDps: 20, hazardDuration: 4.0
            });
        }
        ctx.state.screenShake = 32;
        ctx.showFloatingText("💀 CATACLYSM!", fish.x, fish.y - 50, '#7c3aed');
    },

    radiantBarb(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 2.6);
        // Super-fast piercing barb
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 1100, dmg, '#fde047', {
            radius: 15, life: 3.0, glow: true, glowColor: '#ffffff',
            trailCount: 5, impactShake: 24, knockback: 70
        });
        // Light trail of hazards behind it
        const a = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = 1; i <= 6; i++) {
            ctx.state.delayedBlasts.push({
                x: fish.x + Math.cos(a) * i * 100,
                y: fish.y + Math.sin(a) * i * 100,
                radius: 50, damage: Math.round(dmg * 0.4),
                timer: 0.3 + i * 0.08, color: '#fde047', shake: 8
            });
        }
        ctx.showFloatingText("🌟 RADIANT BARB!", fish.x, fish.y - 40, '#fde047');
    },

    timePierce(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 2.2);
        // Slow homing orb that won't leave you alone
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 180, dmg, '#22d3ee', {
            radius: 26, isHoming: true, homingForce: 500,
            life: 7.0, glow: true, glowColor: '#cffafe', trailCount: 4, impactShake: 22
        });
        // Warp zones across the arena — forces the player to never stand still
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 80 + Math.random() * 200;
            ctx.state.delayedBlasts.push({
                x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
                radius: 70, damage: Math.round(dmg * 0.7),
                timer: 0.9 + i * 0.15, color: '#22d3ee', shake: 12,
                leaveHazard: true, hazardType: 'void',
                hazardDps: 14, hazardDuration: 3.5
            });
        }
        ctx.showFloatingText("⏳ TIME PIERCE!", fish.x, fish.y - 40, '#22d3ee');
    },

    // ============================================================
    //  NEW SKILLS FROM EXPANDED ROSTER
    // ============================================================
    inkCloud(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.0);
        // Big spread of ink globs
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 40 + Math.random() * 120;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * d, fish.y + Math.sin(a) * d,
                300, dmg, '#1e293b', { radius: 14, life: 2.8, particleDensity: 1.0 });
        }
        // Dark zones that obscure + damage
        for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 40 + Math.random() * 180;
            ctx.state.groundHazards.push({
                x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
                radius: 70, duration: 4.0,
                type: 'void', damagePerSec: 10, color: '#1e293b'
            });
        }
        ctx.state.screenShake = 16;
        ctx.showFloatingText("🖤 INK CLOUD!", fish.x, fish.y - 40, '#1e293b');
    },

    tidalSlam(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.9);
        // Slow heavy orb that leaves explosions
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 500, dmg, '#0284c7', {
            radius: 22, glow: true, glowColor: '#7dd3fc', trailCount: 4, impactShake: 22
        });
        // Big blast at player after 0.8s
        ctx.state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 100, damage: Math.round(dmg * 1.2),
            timer: 0.8, color: '#0284c7', shake: 24,
            leaveHazard: true, hazardType: 'water', hazardDps: 20, hazardDuration: 3.5
        });
        ctx.state.screenShake = 20;
        ctx.showFloatingText("🌊 TIDAL SLAM!", fish.x, fish.y - 40, '#0284c7');
    },

    poisonBarb(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.3);
        // Fast triple barb
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = -1; i <= 1; i++) {
            const a = baseA + i * 0.1;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 500, fish.y + Math.sin(a) * 500,
                700, dmg, '#a855f7', { radius: 10, glow: true, glowColor: '#e9d5ff' });
        }
        // Poison pool where player is
        ctx.state.groundHazards.push({
            x: p.x, y: p.y, radius: 70, duration: 4.0,
            type: 'poison', damagePerSec: 16, color: '#a855f7'
        });
        ctx.showFloatingText("🦂 POISON BARB!", fish.x, fish.y - 40, '#a855f7');
    },

    shellGuard(fish, ctx) {
        fish.isInflated = true;
        fish.inflateTimer = 3.0;
        // Shockwave of spines when hardening
        for (let i = 0; i < 14; i++) {
            const a = (Math.PI * 2 / 14) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 400, fish.y + Math.sin(a) * 400,
                420, getSkillDamage(fish, 0.8), '#16a34a', { radius: 11 });
        }
        ctx.state.screenShake = 12;
        ctx.showFloatingText("🛡️ SHELL GUARD!", fish.x, fish.y - 40, '#16a34a');
    },

    starFall(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.5);
        // 10 meteors, some aimed at player, some around
        for (let i = 0; i < 10; i++) {
            const usePlayer = i < 6;
            const a = Math.random() * Math.PI * 2;
            const r = usePlayer ? (30 + Math.random() * 120) : (80 + Math.random() * 250);
            ctx.state.delayedBlasts.push({
                x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
                radius: 55, damage: Math.round(dmg * 0.9),
                timer: 0.6 + i * 0.14, color: '#c084fc', shake: 12,
                leaveHazard: true, hazardType: 'fire',
                hazardDps: 12, hazardDuration: 2.5
            });
        }
        ctx.state.screenShake = 18;
        ctx.showFloatingText("✨ STAR FALL!", fish.x, fish.y - 40, '#c084fc');
    },

    timeWarp(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 2.5);
        // Slow homing void orb
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 200, dmg, '#06b6d4', {
            radius: 24, isHoming: true, homingForce: 500,
            life: 7.0, glow: true, glowColor: '#ffffff', trailCount: 4, impactShake: 24
        });
        // Time bubble hazards that force movement
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 80 + Math.random() * 220;
            ctx.state.groundHazards.push({
                x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
                radius: 75, duration: 5.0,
                type: 'void', damagePerSec: 18, color: '#06b6d4'
            });
        }
        ctx.state.screenShake = 22;
        ctx.showFloatingText("⏳ TEMPORAL COLLAPSE!", fish.x, fish.y - 40, '#06b6d4');
    },
	    // ============================================================
    //  BOSS SKILLS — summoners, arena control, phase abilities
    // ============================================================

    // --- SUMMONERS ---
    summonShades(fish, ctx) {
        const state = ctx.state;
        const count = 3;
        for (let i = 0; i < count; i++) {
            const a = (Math.PI * 2 / count) * i + Math.random() * 0.4;
            const d = 60 + Math.random() * 40;
            const x = fish.x + Math.cos(a) * d;
            const y = fish.y + Math.sin(a) * d;
            state.delayedBlasts.push({
                x, y, radius: 40, damage: 0, timer: 0.4,
                color: '#1e40af', shake: 6,
                onDetonate: () => {
                    // Spawn 3 shades around the point
                    for (let k = 0; k < 3; k++) {
                        const ka = (Math.PI * 2 / 3) * k;
                        state.bullets.push({
                            x: x + Math.cos(ka) * 30,
                            y: y + Math.sin(ka) * 30,
                            vx: 0, vy: 0,
                            owner: 'enemy',
                            radius: 8, damage: 40,
                            color: '#38bdf8',
                            life: 4.0,
                            trail: [],
                            homing: true,
                            homingForce: 200,
                            isSummon: true
                        });
                    }
                    Particles.spawnParticles(state, x, y, '#1e40af', 25, { size: 4 });
                }
            });
        }
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText("⚠ SUMMONING! ⚠", fish.x, fish.y - 60, '#38bdf8');
    },

    summonStormOrbs(fish, ctx) {
        const state = ctx.state;
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 / 6) * i;
            const d = 80;
            const x = fish.x + Math.cos(a) * d;
            const y = fish.y + Math.sin(a) * d;
            state.delayedBlasts.push({
                x, y, radius: 45, damage: 0, timer: 0.5,
                color: '#10b981', shake: 5,
                onDetonate: () => {
                    for (let k = 0; k < 4; k++) {
                        const ka = (Math.PI * 2 / 4) * k + Math.PI / 4;
                        state.bullets.push({
                            x, y,
                            vx: Math.cos(ka) * 220,
                            vy: Math.sin(ka) * 220,
                            owner: 'enemy',
                            radius: 9, damage: 50,
                            color: '#10b981',
                            life: 3.5,
                            trail: [],
                            isSummon: true
                        });
                    }
                    Particles.spawnParticles(state, x, y, '#10b981', 20, { size: 4 });
                }
            });
        }
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText("⚠ STORM ORBS! ⚠", fish.x, fish.y - 60, '#10b981');
    },

    summonVoidlings(fish, ctx) {
        const state = ctx.state;
        for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 70 + Math.random() * 60;
            const x = fish.x + Math.cos(a) * d;
            const y = fish.y + Math.sin(a) * d;
            state.delayedBlasts.push({
                x, y, radius: 50, damage: 0, timer: 0.6,
                color: '#6b21a8', shake: 7,
                onDetonate: () => {
                    state.bullets.push({
                        x, y,
                        vx: 0, vy: 0,
                        owner: 'enemy',
                        radius: 12, damage: 60,
                        color: '#a855f7',
                        life: 5.0,
                        trail: [],
                        homing: true,
                        homingForce: 180,
                        isSummon: true
                    });
                    Particles.spawnParticles(state, x, y, '#a855f7', 22, { size: 5 });
                }
            });
        }
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText("⚠ VOIDLINGS! ⚠", fish.x, fish.y - 60, '#a855f7');
    },

    summonEmberlings(fish, ctx) {
        const state = ctx.state;
        for (let i = 0; i < 4; i++) {
            const a = (Math.PI * 2 / 4) * i + Math.random() * 0.3;
            const d = 70;
            const x = fish.x + Math.cos(a) * d;
            const y = fish.y + Math.sin(a) * d;
            state.delayedBlasts.push({
                x, y, radius: 45, damage: 0, timer: 0.5,
                color: '#dc2626', shake: 6,
                onDetonate: () => {
                    state.bullets.push({
                        x, y,
                        vx: 0, vy: 0,
                        owner: 'enemy',
                        radius: 11, damage: 55,
                        color: '#f59e0b',
                        life: 4.5,
                        trail: [],
                        homing: true,
                        homingForce: 220,
                        leavesFireTrail: true,
                        isSummon: true
                    });
                    Particles.spawnParticles(state, x, y, '#dc2626', 22, { size: 4 });
                }
            });
        }
        try { audio.playExplosion(); } catch (e) {}
        ctx.showFloatingText("⚠ EMBERLINGS! ⚠", fish.x, fish.y - 60, '#f59e0b');
    },

    // --- ARENA CONTROL ---
    tidalCrush(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Massive wave pushing the player away from the boss
        const dx = p.x - fish.x;
        const dy = p.y - fish.y;
        const d = Math.hypot(dx, dy) || 1;
        // Push 260px outward
        p.x += (dx / d) * 260;
        p.y += (dy / d) * 260;
        // Clamp inside world
        const B = CONFIG.WORLD;
        p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
        p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);

        p.hp -= 120;
        Particles.showFloatingText(state, "-120 TIDAL CRUSH", p.x, p.y - 30, '#0ea5e9');
        UI.triggerDamageFlash();
        state.screenShake = 22;

        // Rings of projectiles outward
        for (let i = 0; i < 16; i++) {
            const a = (Math.PI * 2 / 16) * i;
            state.bullets.push({
                x: fish.x + Math.cos(a) * 80,
                y: fish.y + Math.sin(a) * 80,
                vx: Math.cos(a) * 380,
                vy: Math.sin(a) * 380,
                owner: 'enemy',
                radius: 12, damage: 45,
                color: '#0ea5e9',
                life: 3.0,
                trail: []
            });
        }
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText("🌊 TIDAL CRUSH!", fish.x, fish.y - 50, '#0ea5e9');
    },

    bossWhirlpool(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Slow pull over 1.5s
        const dx = p.x - fish.x;
        const dy = p.y - fish.y;
        const d = Math.hypot(dx, dy) || 1;
        // Immediate small pull
        p.x -= (dx / d) * 100;
        p.y -= (dy / d) * 100;

        // Big vortex zone at the player's position
        state.groundHazards.push({
            x: p.x, y: p.y, radius: 130, duration: 3.5,
            type: 'void', damagePerSec: 30, color: '#0284c7'
        });
        // Projectiles spiraling outward from boss
        for (let i = 0; i < 20; i++) {
            const a = (Math.PI * 2 / 20) * i;
            state.bullets.push({
                x: fish.x, y: fish.y,
                vx: Math.cos(a) * 260,
                vy: Math.sin(a) * 260,
                owner: 'enemy',
                radius: 11, damage: 35,
                color: '#0284c7',
                life: 3.0,
                trail: [],
                isSpiral: true,
                spiralAngle: 0,
                spiralRadius: 4
            });
        }
        ctx.showFloatingText("🌀 BOSS WHIRLPOOL!", fish.x, fish.y - 50, '#0284c7');
    },

    chainLightning(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Build a chain: boss -> random point -> random point -> player
        const pts = [{ x: fish.x, y: fish.y }];
        for (let i = 0; i < 3; i++) {
            pts.push({
                x: fish.x + (Math.random() - 0.5) * 500,
                y: fish.y + (Math.random() - 0.5) * 500
            });
        }
        pts.push({ x: p.x, y: p.y });

        // Visual chain
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            for (let s = 0; s < 8; s++) {
                const t = s / 8;
                const x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 20;
                const y = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 20;
                Particles.spawnParticles(state, x, y, '#facc15', 2);
            }
            // Damage if within 60px of a chain segment
            const distToPlayer = Math.hypot(p.x - b.x, p.y - b.y);
            if (distToPlayer < 80) {
                p.hp -= 60;
                Particles.showFloatingText(state, "-60", p.x, p.y - 25, '#facc15');
                UI.triggerDamageFlash();
            }
        }
        state.screenShake = 16;
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText("⚡ CHAIN LIGHTNING!", fish.x, fish.y - 50, '#facc15');
    },

    stormField(fish, ctx) {
        const state = ctx.state;
        // Persistent arena-wide electric field
        for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 100 + Math.random() * 400;
            state.groundHazards.push({
                x: fish.x + Math.cos(a) * r,
                y: fish.y + Math.sin(a) * r,
                radius: 70, duration: 6.0,
                type: 'flash', damagePerSec: 25, color: '#10b981'
            });
        }
        ctx.showFloatingText("⚡ STORM FIELD!", fish.x, fish.y - 50, '#10b981');
    },

    voidCollapse(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Pull everything toward a single point
        const cx = (p.x + fish.x) / 2;
        const cy = (p.y + fish.y) / 2;
        const dx = cx - p.x;
        const dy = cy - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * 140;
        p.y += (dy / d) * 140;

        // Detonate
        state.delayedBlasts.push({
            x: cx, y: cy, radius: 200, damage: 180,
            timer: 1.0, color: '#4c1d95', shake: 30,
            leaveHazard: true, hazardType: 'void',
            hazardDps: 30, hazardDuration: 4.0
        });
        ctx.showFloatingText("🕳️ VOID COLLAPSE!", fish.x, fish.y - 50, '#a855f7');
    },

    gravitationalPull(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Strong pull toward boss over a short window
        const dx = fish.x - p.x;
        const dy = fish.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * 220;
        p.y += (dy / d) * 220;
        p.hp -= 40;
        state.screenShake = 18;
        // Orbiting projectiles
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 / 12) * i;
            state.bullets.push({
                x: fish.x + Math.cos(a) * 200,
                y: fish.y + Math.sin(a) * 200,
                vx: Math.cos(a + Math.PI / 2) * 240,
                vy: Math.sin(a + Math.PI / 2) * 240,
                owner: 'enemy',
                radius: 10, damage: 45,
                color: '#a855f7',
                life: 4.0,
                trail: []
            });
        }
        ctx.showFloatingText("🌌 GRAVITY PULL!", fish.x, fish.y - 50, '#a855f7');
    },

    firestormNova(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Two-stage explosive nova with fire hazards
        for (let i = 0; i < 24; i++) {
            const a = (Math.PI * 2 / 24) * i;
            state.bullets.push({
                x: fish.x, y: fish.y,
                vx: Math.cos(a) * 400,
                vy: Math.sin(a) * 400,
                owner: 'enemy',
                radius: 13, damage: 55,
                color: '#f97316',
                life: 3.0,
                trail: []
            });
        }
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 / 8) * i;
            const r = 180 + Math.random() * 100;
            state.groundHazards.push({
                x: fish.x + Math.cos(a) * r,
                y: fish.y + Math.sin(a) * r,
                radius: 80, duration: 5.0,
                type: 'fire', damagePerSec: 35, color: '#f97316'
            });
        }
        state.screenShake = 26;
        try { audio.playExplosion(); } catch (e) {}
        ctx.showFloatingText("🔥 FIRESTORM NOVA!", fish.x, fish.y - 50, '#f97316');
    },

    magmaPillars(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Pillars erupt in sequence
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 / 8) * i + Math.random() * 0.3;
            const r = 80 + Math.random() * 200;
            state.delayedBlasts.push({
                x: p.x + Math.cos(a) * r,
                y: p.y + Math.sin(a) * r,
                radius: 65, damage: 90,
                timer: 0.4 + i * 0.15,
                color: '#dc2626', shake: 14,
                leaveHazard: true, hazardType: 'fire',
                hazardDps: 25, hazardDuration: 4.0
            });
        }
        ctx.showFloatingText("🌋 MAGMA PILLARS!", fish.x, fish.y - 50, '#dc2626');
    },

    leviathanRoar(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Screen-wide stun + heavy damage + telegraph
        UI.triggerDamageFlash();
        state.screenShake = 32;
        p.hp -= 90;
        p.stunTimer = 1.2;
        // Massive warning rings
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 / 6) * i;
            state.delayedBlasts.push({
                x: fish.x + Math.cos(a) * 200,
                y: fish.y + Math.sin(a) * 200,
                radius: 90, damage: 70,
                timer: 0.8 + i * 0.1,
                color: '#0ea5e9', shake: 20
            });
        }
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText("🌊 LEVIATHAN ROAR!", fish.x, fish.y - 70, '#0ea5e9');
    },
};