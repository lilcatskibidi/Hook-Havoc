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
    CAST_CHARGE_RATE: 160,
    CAST_MIN_DIST: 90,
    CAST_MAX_DIST: 380,
    BITE_MIN_DELAY: 1000,
    BITE_MAX_DELAY: 2800,
    TENSION_DECAY_RATE: 45,
    TENSION_PER_REEL: 35,
    STAMINA_DRAIN_PER_REEL: 35,
    STAMINA_DRAIN_PER_BULLET: 1.5,

    // Drag-to-shore physics
    DRAG_BASE_SPEED: 60,
    DRAG_REEL_ACCEL: 220,
    DRAG_WATER_RESISTANCE: 0.92,
    DRAG_LAND_RESISTANCE: 0.78,
    DRAG_BEACHED_THRESHOLD: 0.7,

    // Camera
    CAMERA_ZOOM_MIN: 0.5,
    CAMERA_ZOOM_MAX: 2.5,
    CAMERA_FOLLOW_SPEED: 0.08,
    CAMERA_ZOOM_SPEED: 0.08,

    // XP
    XP_LEVEL_BASE: 100,
    XP_LEVEL_GROWTH: 1.3,

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
        trident:         70
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
        trident:         16
    },
    // Rarity colors
    RARITY_COLORS: {
        common:    '#94a3b8',
        rare:      '#38bdf8',
        epic:      '#a855f7',
        legendary: '#f59e0b'
    }
};