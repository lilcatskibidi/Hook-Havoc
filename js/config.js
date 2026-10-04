// Central tunable game constants
const CONFIG = {
    // World
    // FIXED world-space shoreline — NEVER derived from viewport size.
    // The old `cssW * RATIO` made the surf line move per client (16:9 vs
    // 1:1 vs phone), so one peer's legal cast rendered as "fishing on
    // the sand" on another peer. All water/land checks must agree.
    WATER_BOUNDARY_X: 830,
    WATER_BOUNDARY_RATIO: 0.52, // deprecated: kept for compat, not used
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
    XP_LEVEL_BASE: 250,
    XP_LEVEL_GROWTH: 1.6,

    // BRUTAL TIDE difficulty — applied to every catch in makeCatchInstance.
    // Fish are tankier, angrier, and pay less. One place to tune it all.
    DIFFICULTY: {
        FISH_HP_MULT: 1.7,
        FISH_STAMINA_MULT: 1.4,
        FISH_ATK_MULT: 1.5,
        FISH_VALUE_MULT: 0.7
    },

    // Shop prices (cost per bullet when reloading / buying ammo).
    // Tuned so mid-game guns are comfortably affordable: a full magazine
    // costs roughly 1-3 average fish, even at the top end.
    AMMO_PRICES: {
        pistol:          Infinity,   // infinite ammo — never reload
        popgun:        1,
        rusted_revolver: 1,
        flare_gun:       2,
        nailgun:         1,
        smg:             1,
        scrap_smg:       1,
        shotgun:         2,
        dual_pistols:    2,
        rifle:           1,
        tidecaller:      2,
        burst_rifle:     2,
        marksman:        3,
        harpoon:         8,
        storm_harpoon:   12,
        lance:           15,
        auto_shotgun:    3,
        scattergun:      3,
        flamethrower:    1,
        grenade_launcher: 20,
        depth_charge:    25,
        kraken_maul:     22,
        railgun:         25,
        abyssal_cannon:  30,
        sun_spear:       35,
        minigun:         1,
        sniper_rail:     30,
        plasma_caster:   15,
        pulse_rifle:     12,
        trident:         28,
        crossbow:        12,
        tesla_gun:       2,
        arc_caster:      3,
        void_rifle:      40,
        coral_launcher:  22,
        frost_bow:       15,
        recurve:         12,
        longshot:        2,
        blunderbuss:     2,
        harpoon_pistol:  8,
        storm_cell:      2,
        coral_repeater:  1,
        magma_mortar:    18,
        inkcaster:       4,
        glacier_cannon:  28,
        vampire_fang:    1,
        thunder_maul:    3,
        doom_horn:       6,
        starfall_launcher: 32,
        leviathan_caller: 30,
        event_horizon:   45,
        magma_shotgun:   3,
        sonic_pistol:    4,
        foghorn:         6
    },

    // Magazine / reserve size per weapon
    MAX_AMMO: {
        pistol:          Infinity,
        popgun:        400,
        rusted_revolver: 120,
        flare_gun:       40,
        nailgun:         220,
        smg:             180,
        scrap_smg:       150,
        shotgun:         50,
        dual_pistols:    60,
        rifle:           150,
        tidecaller:      120,
        burst_rifle:     120,
        marksman:        40,
        harpoon:         30,
        storm_harpoon:   24,
        lance:           20,
        auto_shotgun:    48,
        scattergun:      40,
        flamethrower:    500,
        grenade_launcher: 8,
        depth_charge:     5,
        kraken_maul:     6,
        railgun:         6,
        abyssal_cannon:  5,
        sun_spear:       4,
        minigun:         800,
        sniper_rail:     5,
        plasma_caster:   60,
        pulse_rifle:     80,
        trident:         16,
        crossbow:        20,
        tesla_gun:       200,
        arc_caster:      160,
        void_rifle:      8,
        coral_launcher:  6,
        frost_bow:       18,
        recurve:         24,
        longshot:        120,
        blunderbuss:     40,
        harpoon_pistol:  30,
        storm_cell:      200,
        coral_repeater:  300,
        magma_mortar:    10,
        inkcaster:       90,
        glacier_cannon:  8,
        vampire_fang:    260,
        thunder_maul:    36,
        doom_horn:       30,
        starfall_launcher: 6,
        leviathan_caller: 14,
        event_horizon:   5,
        magma_shotgun:   24,
        sonic_pistol:    50,
        foghorn:         40
    },
    //  FX — global particle density (0-1). Lowers visual clutter so
    // enemy projectiles stay readable. Does not touch damage.
    FX_DENSITY: 0.55,

    // 1.1.5 WORLD — day length, pier reach, ferry fees (island defs live
    // in js/world.js; fees duplicated here for shop-balance reference).
    WORLD15: {
        DAY_LENGTH_SEC: 900,
        PIER_REACH: 680,       // px past the surf at the pier end (DEEP tier)
        SHORE_EDGE: 250,       // SHORE < +250px, SHALLOW < +650px, else DEEP
        SHALLOW_EDGE: 650,
        FERRY_FEES: { isle_sun: 1500, isle_mist: 1500, isle_abyss: 1500 },
    },

    //  Rarity colors
    RARITY_COLORS: {
        common:    '#94a3b8',
        rare:      '#38bdf8',
        epic:      '#a855f7',
        legendary: '#f59e0b',
        mythic:    '#e879f9',
        boss:      '#ef4444'
    },

    // Enemy Types Configuration (BRUTAL TIDE: more of them, tankier, meaner)
    ENEMIES: {
        // Land enemies (spawned from beached fish)
        LAND: {
            maxCount: 12,
            spawnInterval: 20, // seconds between spawn attempts
        },
        
        // Seagulls - aerial enemies
        SEAGULL: {
            maxCount: 6,
            spawnInterval: 30,
            spawnChance: 0.45, // per interval
            hp: 130,
            damage: 22,
            speed: 140,
            diveSpeed: 340,
            diveCooldown: 6,
            score: 50,
            xp: 25,
        },
        
        // Jumping Fish - fish that leap from water
        JUMPING_FISH: {
            maxCount: 4,
            spawnInterval: 40,
            spawnChance: 0.35,
            baseHp: 320,
            damage: 34,
            jumpSpeed: 280,
            jumpHeight: 170,
            landTime: 3, // seconds on land before returning
            score: 100,
            xp: 50,
        },
        
        // Crab - beach walker
        BEACH_CRAB: {
            maxCount: 5,
            spawnInterval: 60,
            spawnChance: 0.3,
            hp: 480,
            damage: 30,
            speed: 55,
            burrowCooldown: 8,
            score: 75,
            xp: 40,
        },

        // Dune Beetle - armored charger (telegraphed horn dash)
        DUNE_BEETLE: {
            maxCount: 4,
            spawnInterval: 75,
            spawnChance: 0.35,
            hp: 950,
            damage: 42,
            speed: 48,
            chargeSpeed: 320,
            score: 120,
            xp: 70,
        },

        // Sand Urchin - stationary spiker (radial spine rings)
        LAND_URCHIN: {
            maxCount: 4,
            spawnInterval: 90,
            spawnChance: 0.3,
            hp: 700,
            damage: 26,
            volleyCooldown: 3.2,
            score: 100,
            xp: 60,
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

        // Tide-breaker achievements (bulk fishing + the whale)
        CATCH_500: { id: 'catch_500', name: 'Seasoned Pro', desc: 'Catch 500 fish', reward: { coins: 15000, xp: 6000 }, icon: 'fa-fish-fins' },
        CATCH_SHINY: { id: 'catch_shiny', name: 'Lucky Glint', desc: 'Catch a shiny fish', reward: { coins: 8000, xp: 3000 }, icon: 'fa-wand-magic-sparkles' },
        WHALE_WATCHER: { id: 'whale_watcher', name: 'Whale Watcher', desc: 'Hook the Colossal Whale', reward: { coins: 30000, xp: 12000 }, icon: 'fa-fish' },

        // Extermination achievements (bulk + per-species kill counts)
        KILL_500: { id: 'kill_500', name: 'Exterminator', desc: 'Defeat 500 enemies', reward: { coins: 25000, xp: 10000 }, icon: 'fa-bug-slash' },
        KILL_CRAB_25: { id: 'kill_crab_25', name: 'Crab Boil', desc: 'Defeat 25 beach crabs', reward: { coins: 4000, xp: 1500 }, icon: 'fa-shrimp' },
        KILL_GULL_50: { id: 'kill_gull_50', name: 'Scarecrow', desc: 'Defeat 50 seagulls', reward: { coins: 6000, xp: 2500 }, icon: 'fa-crow' },
        KILL_BEETLE_20: { id: 'kill_beetle_20', name: 'Bug Crusher', desc: 'Defeat 20 dune beetles', reward: { coins: 5000, xp: 2000 }, icon: 'fa-bug' },
        KILL_10_BOSSES: { id: 'kill_10_bosses', name: 'Decaboss', desc: 'Defeat 10 bosses', reward: { coins: 100000, xp: 40000 }, icon: 'fa-skull' },

        // Fortune achievements (coins, full hold, quests)
        CASINO_HIGH_ROLLER: { id: 'casino_high_roller', name: 'High Roller', desc: 'Win 5000+ tokens in one bet', reward: { coins: 15000, xp: 5000 }, icon: 'fa-coins' },
        TYCOON_100K: { id: 'tycoon_100k', name: 'Harbor Tycoon', desc: 'Hold 100,000 coins at once', reward: { coins: 20000, xp: 8000 }, icon: 'fa-sack-dollar' },
        FULL_BUCKET: { id: 'full_bucket', name: 'Full Hold', desc: 'Fill your bucket to capacity', reward: { coins: 3000, xp: 1200 }, icon: 'fa-bucket' },
        QUEST_5: { id: 'quest_5', name: "Marlin's Regular", desc: 'Complete 5 quests for Old Marlin', reward: { coins: 8000, xp: 4000 }, icon: 'fa-scroll' },
        
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