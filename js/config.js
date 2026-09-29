// Central tunable game constants
const CONFIG = {
    // World
    WATER_BOUNDARY_RATIO: 0.52,
    SHORE_DRAG_FRICTION: 2.8,
    WATER_DRAG_FRICTION: 1.4,
    BEACH_TRIGGER_OFFSET: 30,

    // World bounds (map borders)
    WORLD: {
        MIN_X: 40,
        MAX_X: 4500,
        MIN_Y: 40,
        MAX_Y: 3500,
        BORDER_THICKNESS: 18,
        BORDER_GLOW: 26,
        SHOW_GRID: true,
        GRID_SIZE: 120
    },

    // Player
    PLAYER_SPEED: 4.2,
    PLAYER_RADIUS: 16,
    PLAYER_MAX_HP: 100,

    // Fishing
    CAST_MAX_POWER: 100,
    CAST_CHARGE_RATE: 120, // Slower charge
    CAST_MIN_DIST: 80,
    CAST_MAX_DIST: 350,
    BITE_MIN_DELAY: 2000, // Longer wait for bites
    BITE_MAX_DELAY: 5000,
    TENSION_DECAY_RATE: 55, // Faster tension decay
    TENSION_PER_REEL: 45, // More tension per reel
    STAMINA_DRAIN_PER_REEL: 45, // More stamina drain
    STAMINA_DRAIN_PER_BULLET: 1.0, // Less stamina per bullet

    // Drag-to-shore physics
    DRAG_BASE_SPEED: 45, // Slower base drag
    DRAG_REEL_ACCEL: 180, // Less reel acceleration
    DRAG_WATER_RESISTANCE: 0.88, // More water resistance
    DRAG_LAND_RESISTANCE: 0.72, // More land resistance
    DRAG_BEACHED_THRESHOLD: 0.65, // Harder to beach

    // Camera
    CAMERA_ZOOM_MIN: 0.5,
    CAMERA_ZOOM_MAX: 2.5,
    CAMERA_FOLLOW_SPEED: 0.06,
    CAMERA_ZOOM_SPEED: 0.06,

    // XP - Much harder progression
    XP_LEVEL_BASE: 200,
    XP_LEVEL_GROWTH: 1.5,

    // Shop prices (cost per bullet when reloading / buying ammo)
    AMMO_PRICES: {
        pistol:          Infinity,   // infinite ammo — never reload
        smg:             1,
        shotgun:         2,
        dual_pistols:    2,
        rifle:           1,
        burst_rifle:     2,
        marksman:        4,
        harpoon:         15,
        auto_shotgun:    3,
        flamethrower:    1,
        grenade_launcher: 40,
        railgun:         60,
        minigun:         1,
        sniper_rail:     90,
        plasma_caster:   30,
        trident:         70,
        crossbow:        25,
        tesla_gun:       2,
        void_rifle:      120,
        coral_launcher:  50,
        frost_bow:       30,
        magma_shotgun:   4,
        sonic_pistol:    5
    },

    // Magazine / reserve size per weapon
    MAX_AMMO: {
        pistol:          Infinity,
        smg:             180,
        shotgun:         50,
        dual_pistols:    60,
        rifle:           150,
        burst_rifle:     120,
        marksman:        40,
        harpoon:         30,
        auto_shotgun:    48,
        flamethrower:    500,
        grenade_launcher: 8,
        railgun:         6,
        minigun:         800,
        sniper_rail:     5,
        plasma_caster:   60,
        trident:         16,
        crossbow:        20,
        tesla_gun:       200,
        void_rifle:      8,
        coral_launcher:  6,
        frost_bow:       18,
        magma_shotgun:   24,
        sonic_pistol:    50
    },
    // Rarity colors
    RARITY_COLORS: {
        common:    '#94a3b8',
        rare:      '#38bdf8',
        epic:      '#a855f7',
        legendary: '#f59e0b',
        mythic:    '#e879f9'
    },

    // Enemy Types Configuration
    ENEMIES: {
        // Land enemies (spawned from beached fish)
        LAND: {
            maxCount: 8,
            spawnInterval: 30, // seconds between spawn attempts
        },
        
        // Seagulls - aerial enemies
        SEAGULL: {
            maxCount: 4,
            spawnInterval: 45,
            spawnChance: 0.3, // per interval
            hp: 80,
            damage: 15,
            speed: 120,
            diveSpeed: 300,
            diveCooldown: 8,
            score: 50,
            xp: 25,
        },
        
        // Jumping Fish - fish that leap from water
        JUMPING_FISH: {
            maxCount: 3,
            spawnInterval: 60,
            spawnChance: 0.25,
            baseHp: 200,
            damage: 25,
            jumpSpeed: 250,
            jumpHeight: 150,
            landTime: 3, // seconds on land before returning
            score: 100,
            xp: 50,
        },
        
        // Crab - beach walker
        BEACH_CRAB: {
            maxCount: 3,
            spawnInterval: 90,
            spawnChance: 0.2,
            hp: 300,
            damage: 20,
            speed: 40,
            burrowCooldown: 10,
            score: 75,
            xp: 40,
        },
    },

    // Achievement System
    ACHIEVEMENTS: {
        // Fishing achievements
        FIRST_CATCH: { id: 'first_catch', name: 'First Blood', desc: 'Catch your first fish', reward: { coins: 100, xp: 50 }, icon: 'fa-fish' },
        CATCH_10: { id: 'catch_10', name: 'Apprentice Angler', desc: 'Catch 10 fish', reward: { coins: 500, xp: 200 }, icon: 'fa-fish' },
        CATCH_100: { id: 'catch_100', name: 'Master Angler', desc: 'Catch 100 fish', reward: { coins: 5000, xp: 2000 }, icon: 'fa-trophy' },
        CATCH_1000: { id: 'catch_1000', name: 'Legendary Fisherman', desc: 'Catch 1000 fish', reward: { coins: 50000, xp: 20000 }, icon: 'fa-crown' },
        
        // Rarity achievements
        CATCH_RARE: { id: 'catch_rare', name: 'Rare Find', desc: 'Catch a Rare fish', reward: { coins: 1000, xp: 500 }, icon: 'fa-gem' },
        CATCH_EPIC: { id: 'catch_epic', name: 'Epic Encounter', desc: 'Catch an Epic fish', reward: { coins: 2500, xp: 1000 }, icon: 'fa-star' },
        CATCH_LEGENDARY: { id: 'catch_legendary', name: 'Living Legend', desc: 'Catch a Legendary fish', reward: { coins: 10000, xp: 5000 }, icon: 'fa-medal' },
        CATCH_MYTHIC: { id: 'catch_mythic', name: 'Mythic Hunter', desc: 'Catch a Mythic fish', reward: { coins: 50000, xp: 25000 }, icon: 'fa-dragon' },
        
        // Combat achievements
        KILL_10: { id: 'kill_10', name: 'First Blood', desc: 'Defeat 10 enemies', reward: { coins: 500, xp: 200 }, icon: 'fa-skull' },
        KILL_100: { id: 'kill_100', name: 'Monster Slayer', desc: 'Defeat 100 enemies', reward: { coins: 5000, xp: 2000 }, icon: 'fa-skull-crossbones' },
        KILL_BOSS: { id: 'kill_boss', name: 'Boss Hunter', desc: 'Defeat a Boss', reward: { coins: 10000, xp: 5000 }, icon: 'fa-crown' },
        KILL_5_BOSSES: { id: 'kill_5_bosses', name: 'Boss Slayer', desc: 'Defeat 5 Bosses', reward: { coins: 50000, xp: 25000 }, icon: 'fa-skull' },
        
        // Casino achievements
        CASINO_WIN_1000: { id: 'casino_win_1000', name: 'Lucky Streak', desc: 'Win 1000 tokens in one bet', reward: { coins: 5000, xp: 1000 }, icon: 'fa-dice' },
        CASINO_JACKPOT: { id: 'casino_jackpot', name: 'Jackpot!', desc: 'Hit the slots jackpot', reward: { coins: 25000, xp: 10000 }, icon: 'fa-gem' },
        CASINO_BANKRUPT: { id: 'casino_bankrupt', name: 'House Always Wins', desc: 'Lose 10000 tokens total', reward: { coins: 1000, xp: 500 }, icon: 'fa-skull' },
        
        // Progression achievements
        LEVEL_10: { id: 'level_10', name: 'Rising Tide', desc: 'Reach Level 10', reward: { coins: 2000, xp: 0 }, icon: 'fa-arrow-up' },
        LEVEL_25: { id: 'level_25', name: 'Deep Diver', desc: 'Reach Level 25', reward: { coins: 10000, xp: 0 }, icon: 'fa-water' },
        LEVEL_50: { id: 'level_50', name: 'Abyssal Walker', desc: 'Reach Level 50', reward: { coins: 50000, xp: 0 }, icon: 'fa-anchor' },
        LEVEL_100: { id: 'level_100', name: 'God of the Sea', desc: 'Reach Level 100', reward: { coins: 250000, xp: 0 }, icon: 'fa-crown' },
        
        // Collection achievements
        FISH_INDEX_25: { id: 'fish_index_25', name: 'Collector', desc: 'Discover 25 fish species', reward: { coins: 5000, xp: 1000 }, icon: 'fa-book' },
        FISH_INDEX_50: { id: 'fish_index_50', name: 'Encyclopedia', desc: 'Discover 50 fish species', reward: { coins: 25000, xp: 5000 }, icon: 'fa-book-open' },
        FISH_INDEX_100: { id: 'fish_index_100', name: 'Marine Biologist', desc: 'Discover 100 fish species', reward: { coins: 100000, xp: 20000 }, icon: 'fa-graduation-cap' },
        FISH_INDEX_ALL: { id: 'fish_index_all', name: 'Pokédex Complete', desc: 'Discover ALL fish species', reward: { coins: 500000, xp: 100000 }, icon: 'fa-infinity' },
        
        // Hardcore achievements
        NO_DEATH_1HR: { id: 'no_death_1hr', name: 'Survivor', desc: 'Play 1 hour without dying', reward: { coins: 10000, xp: 5000 }, icon: 'fa-heart' },
        MAX_RODS: { id: 'max_rods', name: 'Rod Master', desc: 'Unlock all rods', reward: { coins: 50000, xp: 10000 }, icon: 'fa-fishing-rod' },
        MAX_WEAPONS: { id: 'max_weapons', name: 'Arsenal', desc: 'Own all weapons', reward: { coins: 100000, xp: 20000 }, icon: 'fa-gun' },
    }
};