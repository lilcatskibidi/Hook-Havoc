// ============================================================
//  EQUIPMENT SLOTS
// ============================================================
const EQUIP_SLOTS = 4;   // 1, 2, 3, 4 keys
const WEAPONS = [
    // TIER 1 — STARTER (common workhorses, ~100-175 DPS)
    { id: 'pistol', name: 'Tac-Pistol', icon: 'fa-gun', type: 'pistol',
      damage: 25, fireRate: 0.18, range: 520, spread: 0.04, count: 1,
      price: 0, desc: 'Trusty sidearm. Infinite ammo, 10% crits. ~139 DPS.',
      rarity: 'common', pellets: 'Single',
      auto: false, pierce: false, explosive: false, burn: false,
      critCh: 0.10, critMult: 2.0,
      sound: 'pistol', shake: 3, muzzle: 10, recoil: 3 },

    { id: 'smg', name: 'Compact SMG', icon: 'fa-bolt', type: 'smg',
      damage: 11, fireRate: 0.07, range: 460, spread: 0.10, count: 1,
      price: 500, desc: 'Fast spray, 25% free bullets. Weak per-shot. ~157 DPS.',
      rarity: 'common', pellets: 'Auto',
      auto: true, pierce: false, explosive: false, burn: false,
      ecoCh: 0.25,
      sound: 'rifle', shake: 2, muzzle: 8, recoil: 2 },

    { id: 'scrap_smg', name: 'Scrap SMG', icon: 'fa-bolt', type: 'smg',
      damage: 11, fireRate: 0.065, range: 420, spread: 0.12, count: 1,
      price: 1200, desc: 'Held together with wire. Faster hose, 20% free bullets. ~169 DPS.',
      rarity: 'common', pellets: 'Auto',
      auto: true, pierce: false, explosive: false, burn: false,
      ecoCh: 0.20,
      sound: 'rifle', shake: 2, muzzle: 8, recoil: 2 },

    { id: 'shotgun', name: 'Heavy Shotgun', icon: 'fa-shield-halved', type: 'shotgun',
      damage: 18, fireRate: 0.7, range: 380, spread: 0.16, count: 7,
      price: 2200, desc: '7-pellet cloud. All pellets connect underwater. Huge knockback. ~180 DPS close.',
      rarity: 'rare', pellets: '7 pellets',
      auto: false, pierce: false, explosive: false, burn: false,
      knockMult: 2.0,
      sound: 'shotgun', shake: 6, muzzle: 18, recoil: 8 },

    // TIER 2 — MID GAME (rare power, ~100-270 DPS)
    { id: 'rusted_revolver', name: 'Rusted Revolver', icon: 'fa-gun', type: 'pistol',
      damage: 34, fireRate: 0.22, range: 480, spread: 0.05, count: 1,
      price: 900, desc: 'Found in a tackle box. Executes weaklings (+50% vs hurt). ~155 DPS.',
      rarity: 'common', pellets: 'Single',
      auto: false, pierce: false, explosive: false, burn: false,
      executeMult: 1.5,
      sound: 'pistol', shake: 3, muzzle: 10, recoil: 3 },

    { id: 'dual_pistols', name: 'Dual Sidearms', icon: 'fa-gun', type: 'pistol',
      damage: 15, fireRate: 0.12, range: 520, spread: 0.07, count: 2,
      price: 4200, desc: 'Twin pistols, 15% crits. Double the volume. ~250 DPS.',
      rarity: 'rare', pellets: 'Dual',
      auto: false, pierce: false, explosive: false, burn: false,
      critCh: 0.15, critMult: 2.0,
      sound: 'pistol', shake: 4, muzzle: 12, recoil: 4 },

    { id: 'rifle', name: 'Assault Rifle', icon: 'fa-crosshair', type: 'rifle',
      damage: 26, fireRate: 0.075, range: 620, spread: 0.06, count: 1,
      price: 6500, desc: 'Fully automatic, 15% free bullets. Shreds monsters. ~347 DPS.',
      rarity: 'epic', pellets: 'Auto',
      auto: true, pierce: false, explosive: false, burn: false,
      ecoCh: 0.15,
      sound: 'rifle', shake: 3, muzzle: 12, recoil: 3 },

    { id: 'tidecaller', name: 'Tidecaller', icon: 'fa-water', type: 'rifle',
      damage: 34, fireRate: 0.09, range: 660, spread: 0.05, count: 1,
      price: 12000, desc: 'Salvaged coast-guard rifle. Tides exhaust hooked fish (2x stamina drain). ~378 DPS.',
      rarity: 'epic', pellets: 'Auto',
      auto: true, pierce: false, explosive: false, burn: false,
      drainMult: 2.0,
      sound: 'rifle', shake: 3, muzzle: 12, recoil: 3 },

    { id: 'burst_rifle', name: 'Burst Carbine', icon: 'fa-crosshair', type: 'rifle',
      damage: 28, fireRate: 0.22, range: 640, spread: 0.03, count: 3,
      price: 8500, desc: 'Three-round burst, 15% crits. Tight grouping. ~382 DPS.',
      rarity: 'epic', pellets: '3-round burst',
      auto: true, pierce: false, explosive: false, burn: false,
      critCh: 0.15, critMult: 1.75,
      sound: 'rifle', shake: 4, muzzle: 12, recoil: 4 },

    // TIER 3 — LATE GAME (epic punch, ~280-480 DPS)
    { id: 'marksman', name: 'Marksman Rifle', icon: 'fa-crosshair', type: 'rifle',
      damage: 150, fireRate: 0.4, range: 900, spread: 0.005, count: 1,
      price: 14000, desc: 'Deadeye: 30% crits, +25% vs bosses. Precision long-range. ~375 DPS.',
      rarity: 'epic', pellets: 'Precision',
      auto: false, pierce: true, explosive: false, burn: false,
      critCh: 0.30, critMult: 2.5, bossMult: 1.25,
      sound: 'harpoon', shake: 6, muzzle: 14, recoil: 6 },

    { id: 'harpoon', name: 'Spear Harpoon', icon: 'fa-location-arrow', type: 'harpoon',
      damage: 380, fireRate: 0.75, range: 700, spread: 0.01, count: 1,
      price: 17000, desc: 'Heavy piercer. 3x stamina drain on hooked fish. ~507 DPS.',
      rarity: 'legendary', pellets: 'Pierce',
      auto: false, pierce: true, explosive: false, burn: false,
      drainMult: 3.0,
      sound: 'harpoon', shake: 8, muzzle: 10, recoil: 6 },

    { id: 'storm_harpoon', name: 'Storm Harpoon', icon: 'fa-cloud-bolt', type: 'harpoon',
      damage: 420, fireRate: 0.75, range: 750, spread: 0.01, count: 1,
      price: 38000, desc: 'Lightning spear. Chains + brief stun, tires hooked fish. ~560 DPS.',
      rarity: 'legendary', pellets: 'Pierce + Arc',
      auto: false, pierce: true, explosive: false, burn: false, chain: true,
      chainMult: 0.6, stun: true, stunTime: 0.8, drainMult: 1.5,
      sound: 'harpoon', shake: 9, muzzle: 12, recoil: 7 },

    { id: 'auto_shotgun', name: 'Auto Shotgun', icon: 'fa-shield-halved', type: 'shotgun',
      damage: 18, fireRate: 0.3, range: 420, spread: 0.24, count: 8,
      price: 19000, desc: 'Fully automatic 8-pellet fire. Shoves crowds back. ~480 DPS close.',
      rarity: 'epic', pellets: '8 pellets auto',
      auto: true, pierce: false, explosive: false, burn: false,
      knockMult: 1.5,
      sound: 'shotgun', shake: 5, muzzle: 18, recoil: 6 },

    { id: 'flamethrower', name: 'Hydro-Jet', icon: 'fa-fire', type: 'flame',
      damage: 8, fireRate: 0.04, range: 260, spread: 0.35, count: 2,
      price: 22000, desc: 'High-pressure stream: burns + slows hooked fish. ~400 DPS.',
      rarity: 'epic', pellets: 'Stream',
      auto: true, pierce: false, explosive: false, burn: true,
      burnDps: 20, slowHook: 0.35,
      sound: 'rifle', shake: 2, muzzle: 6, recoil: 1 },

    // TIER 4 — LEGENDARY (heavy hitters, ~480-955 DPS)
    { id: 'grenade_launcher', name: 'Harpoon Launcher', icon: 'fa-bomb', type: 'launcher',
      damage: 420, fireRate: 0.8, range: 640, spread: 0.08, count: 1,
      price: 40000, desc: 'Explosive harpoon. Splash + heavy knockback. ~525 DPS.',
      rarity: 'legendary', pellets: 'Explosive',
      auto: false, pierce: false, explosive: true, burn: false,
      knockMult: 2.0,
      sound: 'shotgun', shake: 10, muzzle: 22, recoil: 10 },

    { id: 'kraken_maul', name: 'Kraken Maul', icon: 'fa-bomb', type: 'launcher',
      damage: 520, fireRate: 0.9, range: 700, spread: 0.08, count: 1,
      price: 55000, desc: 'Ship-cannon that fits in your hands. Executes the weak. ~578 DPS.',
      rarity: 'legendary', pellets: 'Explosive',
      auto: false, pierce: false, explosive: true, burn: false,
      executeMult: 1.5,
      sound: 'shotgun', shake: 12, muzzle: 24, recoil: 12 },

    { id: 'railgun', name: 'Rail Cannon', icon: 'fa-bolt', type: 'rail',
      damage: 750, fireRate: 1.0, range: 1200, spread: 0.0, count: 1,
      price: 48000, desc: 'Pierces everything. Double damage to the dying. ~750 DPS.',
      rarity: 'legendary', pellets: 'Pierce line',
      auto: false, pierce: true, explosive: false, burn: false,
      executeMult: 2.0,
      sound: 'harpoon', shake: 12, muzzle: 26, recoil: 12 },

    { id: 'abyssal_cannon', name: 'Abyssal Cannon', icon: 'fa-skull', type: 'rail',
      damage: 1050, fireRate: 1.1, range: 1300, spread: 0.0, count: 1,
      price: 140000, desc: 'Compressed trench darkness. Bane of bosses, reaper of the weak. ~955 DPS.',
      rarity: 'mythic', pellets: 'Pierce line',
      auto: false, pierce: true, explosive: false, burn: false,
      executeMult: 1.75, bossMult: 1.25,
      sound: 'harpoon', shake: 14, muzzle: 30, recoil: 14 },

    { id: 'minigun', name: 'Reel Minigun', icon: 'fa-bolt', type: 'rifle',
      damage: 15, fireRate: 0.03, range: 560, spread: 0.14, count: 1,
      price: 32000, desc: 'Spin up. 30% free bullets. Endless lead storm. ~500 DPS.',
      rarity: 'legendary', pellets: 'Full auto',
      auto: true, pierce: false, explosive: false, burn: false,
      ecoCh: 0.30,
      sound: 'rifle', shake: 4, muzzle: 14, recoil: 2 },

    { id: 'sniper_rail', name: 'Ion Sniper', icon: 'fa-crosshair', type: 'rail',
      damage: 950, fireRate: 1.3, range: 1500, spread: 0.0, count: 1,
      price: 70000, desc: 'Cross-map deletion. 40% crits, +50% vs bosses. ~731 DPS.',
      rarity: 'legendary', pellets: 'Pierce precision',
      auto: false, pierce: true, explosive: false, burn: false,
      critCh: 0.40, critMult: 2.5, bossMult: 1.5,
      sound: 'harpoon', shake: 14, muzzle: 30, recoil: 14 },

    // TIER 5 — MYTHIC (apex predators, ~790-1190 DPS + signature tricks)
    { id: 'plasma_caster', name: 'Plasma Caster', icon: 'fa-fire', type: 'plasma',
      damage: 300, fireRate: 0.28, range: 820, spread: 0.02, count: 1,
      price: 110000, desc: 'Superheated bolts: blast + burn + boil stamina. ~1071 DPS.',
      rarity: 'mythic', pellets: 'Plasma',
      auto: true, pierce: false, explosive: true, burn: true,
      burnDps: 60, drainMult: 1.5,
      sound: 'harpoon', shake: 8, muzzle: 20, recoil: 8 },

    { id: 'trident', name: 'Poseidon Trident', icon: 'fa-location-arrow', type: 'rail',
      damage: 280, fireRate: 0.75, range: 1100, spread: 0.0, count: 3,
      price: 150000, desc: 'Triple pierce. Slows hooked fish, drinks HP (15%). ~1120 DPS.',
      rarity: 'mythic', pellets: 'Triple pierce',
      auto: false, pierce: true, explosive: false, burn: false, slowHook: 0.5,
      lifesteal: 0.15,
      sound: 'harpoon', shake: 12, muzzle: 28, recoil: 12 },

    // TIER 6 — EXOTIC (each with a signature trick)
    { id: 'crossbow', name: 'Abyssal Crossbow', icon: 'fa-bow-arrow', type: 'crossbow',
      damage: 680, fireRate: 0.75, range: 900, spread: 0.0, count: 1,
      price: 80000, desc: 'Silent killer. Venom + 25% crits. ~907 DPS.',
      rarity: 'mythic', pellets: 'Poison Bolt',
      auto: false, pierce: true, explosive: false, burn: false, poison: true,
      poisonDpsMult: 0.6, critCh: 0.25, critMult: 2.0,
      sound: 'harpoon', shake: 6, muzzle: 8, recoil: 5 },

    { id: 'tesla_gun', name: 'Tesla Coil Gun', icon: 'fa-bolt', type: 'tesla',
      damage: 95, fireRate: 0.12, range: 540, spread: 0.08, count: 1,
      price: 95000, desc: 'Overloaded arcs: chains + 10% crit sparks. ~792 DPS.',
      rarity: 'mythic', pellets: 'Chain Lightning',
      auto: true, pierce: false, explosive: false, burn: false, chain: true,
      chainMult: 0.75, critCh: 0.10, critMult: 2.0,
      sound: 'rifle', shake: 3, muzzle: 16, recoil: 2 },

    { id: 'void_rifle', name: 'Void Reaper', icon: 'fa-skull', type: 'void',
      damage: 820, fireRate: 0.8, range: 950, spread: 0.01, count: 1,
      price: 220000, desc: 'Erases matter. Heals 30%, executes the weak. ~1025 DPS.',
      rarity: 'mythic', pellets: 'Void Round',
      auto: false, pierce: true, explosive: false, burn: false, lifesteal: 0.3,
      executeMult: 1.5,
      sound: 'harpoon', shake: 10, muzzle: 24, recoil: 8 },

    { id: 'coral_launcher', name: 'Coral Mortar', icon: 'fa-seedling', type: 'launcher',
      damage: 560, fireRate: 1.0, range: 750, spread: 0.12, count: 1,
      price: 130000, desc: 'Explosive coral + grinding reef (35 dps x 6s). ~560 DPS.',
      rarity: 'legendary', pellets: 'Coral Grenade',
      auto: false, pierce: false, explosive: true, burn: false, coral: true,
      coralDps: 35, knockMult: 1.5,
      sound: 'shotgun', shake: 12, muzzle: 20, recoil: 10 },

    { id: 'frost_bow', name: 'Glacial Bow', icon: 'fa-icicles', type: 'crossbow',
      damage: 220, fireRate: 0.8, range: 850, spread: 0.0, count: 3,
      price: 110000, desc: 'Triple ice shards freeze 2.5s. 20% shatter crits. ~825 DPS.',
      rarity: 'mythic', pellets: 'Ice Shards',
      auto: false, pierce: true, explosive: false, burn: false, freeze: true,
      freezeTime: 2.5, critCh: 0.20, critMult: 2.0,
      sound: 'harpoon', shake: 5, muzzle: 10, recoil: 4 },

    { id: 'magma_shotgun', name: 'Magma Blunderbuss', icon: 'fa-fire-burner', type: 'shotgun',
      damage: 30, fireRate: 0.5, range: 380, spread: 0.30, count: 10,
      price: 75000, desc: 'Molten shrapnel + heavy burn. Executes the melting. ~600 DPS close.',
      rarity: 'legendary', pellets: '10 Molten Pellets',
      auto: false, pierce: false, explosive: false, burn: true,
      burnDps: 45, executeMult: 1.25,
      sound: 'shotgun', shake: 8, muzzle: 22, recoil: 7 },

    { id: 'sonic_pistol', name: 'Resonance Pistol', icon: 'fa-wave-square', type: 'sonic',
      damage: 95, fireRate: 0.22, range: 650, spread: 0.02, count: 1,
      price: 28000, desc: 'Sonic waves pierce + stun, shatter the hurt. ~432 DPS.',
      rarity: 'epic', pellets: 'Sonic Pulse',
      auto: false, pierce: true, explosive: false, burn: false, stun: true,
      stunTime: 1.5, executeMult: 1.5,
      sound: 'pistol', shake: 4, muzzle: 12, recoil: 3 },

    // TIER 7 — NEW BLOOD (rarity-sorted in the shop)
    { id: 'flare_gun', name: 'Flare Gun', icon: 'fa-fire', type: 'pistol',
      damage: 45, fireRate: 0.45, range: 500, spread: 0.03, count: 1,
      price: 2500, desc: 'Distress flare. Heavy burn, executes the burning. ~100 DPS.',
      rarity: 'rare', pellets: 'Flare',
      auto: false, pierce: false, explosive: false, burn: true,
      burnDps: 30, executeMult: 1.5,
      sound: 'pistol', shake: 4, muzzle: 12, recoil: 4 },

    { id: 'nailgun', name: 'Nailgun', icon: 'fa-hammer', type: 'smg',
      damage: 10, fireRate: 0.06, range: 480, spread: 0.07, count: 1,
      price: 4000, desc: 'Nails pierce clean through. 10% crits. ~167 DPS.',
      rarity: 'rare', pellets: 'Auto Pierce',
      auto: true, pierce: true, explosive: false, burn: false,
      critCh: 0.10, critMult: 2.0,
      sound: 'rifle', shake: 2, muzzle: 8, recoil: 2 },

    { id: 'foghorn', name: 'Foghorn', icon: 'fa-volume-high', type: 'sonic',
      damage: 160, fireRate: 0.35, range: 600, spread: 0.03, count: 1,
      price: 32000, desc: 'Harbor foghorn. 2s stun + massive shockwave knockback. ~457 DPS.',
      rarity: 'epic', pellets: 'Blast',
      auto: false, pierce: true, explosive: false, burn: false, stun: true,
      stunTime: 2.0, knockMult: 2.5,
      sound: 'shotgun', shake: 8, muzzle: 20, recoil: 8 },

    { id: 'scattergun', name: 'Scattergun', icon: 'fa-burst', type: 'shotgun',
      damage: 15, fireRate: 0.55, range: 400, spread: 0.26, count: 10,
      price: 22000, desc: '10-pellet wall of lead, 10% crits. Delete close range. ~273 DPS.',
      rarity: 'epic', pellets: '10 pellets',
      auto: false, pierce: false, explosive: false, burn: false,
      critCh: 0.10, critMult: 2.0,
      sound: 'shotgun', shake: 7, muzzle: 20, recoil: 8 },

    { id: 'recurve', name: 'Dune Recurve', icon: 'fa-feather', type: 'crossbow',
      damage: 170, fireRate: 0.6, range: 800, spread: 0.0, count: 1,
      price: 24000, desc: 'Desert huntsman bow. Freezes +30% vs big game. ~283 DPS.',
      rarity: 'epic', pellets: 'Pierce',
      auto: false, pierce: true, explosive: false, burn: false, freeze: true,
      freezeTime: 1.0, bossMult: 1.3,
      sound: 'harpoon', shake: 4, muzzle: 8, recoil: 4 },

    { id: 'arc_caster', name: 'Arc Caster', icon: 'fa-tower-broadcast', type: 'tesla',
      damage: 120, fireRate: 0.15, range: 560, spread: 0.06, count: 1,
      price: 70000, desc: 'Broadcast tower in a gun. Chains x4, sips ammo. ~800 DPS.',
      rarity: 'legendary', pellets: 'Chain Lightning',
      auto: true, pierce: false, explosive: false, burn: false, chain: true,
      chainMult: 0.7, ecoCh: 0.15,
      sound: 'rifle', shake: 4, muzzle: 18, recoil: 3 },

    { id: 'depth_charge', name: 'Depth Charge', icon: 'fa-anchor', type: 'launcher',
      damage: 700, fireRate: 1.3, range: 720, spread: 0.10, count: 1,
      price: 80000, desc: 'Naval ordnance. Huge blast, brutal knockback, concusses. ~538 DPS.',
      rarity: 'legendary', pellets: 'Explosive',
      auto: false, pierce: false, explosive: true, burn: false,
      knockMult: 3.0, stun: true, stunTime: 1.0,
      sound: 'shotgun', shake: 14, muzzle: 26, recoil: 14 },

    { id: 'lance', name: 'Leviathan Lance', icon: 'fa-location-arrow', type: 'harpoon',
      damage: 620, fireRate: 0.75, range: 850, spread: 0.0, count: 1,
      price: 100000, desc: 'Ship-harpoon, shoulder-fired. Slows, exhausts +30% vs big game. ~827 DPS.',
      rarity: 'mythic', pellets: 'Pierce',
      auto: false, pierce: true, explosive: false, burn: false, slowHook: 0.6,
      drainMult: 2.0, bossMult: 1.25,
      sound: 'harpoon', shake: 10, muzzle: 14, recoil: 8 },

    { id: 'pulse_rifle', name: 'Pulse Rifle', icon: 'fa-radiation', type: 'plasma',
      damage: 190, fireRate: 0.16, range: 780, spread: 0.03, count: 1,
      price: 90000, desc: 'Military plasma. Heavy burn, 20% free bolts. ~1188 DPS.',
      rarity: 'mythic', pellets: 'Plasma',
      auto: true, pierce: false, explosive: false, burn: true,
      burnDps: 50, ecoCh: 0.20,
      sound: 'harpoon', shake: 6, muzzle: 18, recoil: 6 },

    { id: 'sun_spear', name: 'Sun Spear', icon: 'fa-sun', type: 'rail',
      damage: 1200, fireRate: 1.1, range: 1400, spread: 0.0, count: 1,
      price: 180000, desc: 'A javelin of noon. Executes the weak, banishes titans. ~1091 DPS.',
      rarity: 'mythic', pellets: 'Pierce precision',
      auto: false, pierce: true, explosive: false, burn: false,
      executeMult: 2.0, bossMult: 1.5,
      sound: 'harpoon', shake: 16, muzzle: 32, recoil: 16 }
];

const BUCKET_UPGRADES = [
    { id: 'bucket_25',  cap: 25,  price: 500,   name: 'Canvas Creel',  icon: 'fa-basket-shopping', desc: 'Holds 25 fish. Woven kelp canvas.' },
    { id: 'bucket_40',  cap: 40,  price: 2000,  name: 'Oak Barrel',    icon: 'fa-drum',            desc: 'Holds 40 fish. Smells like victory.' },
    { id: 'bucket_60',  cap: 60,  price: 6000,  name: 'Ice Hold',      icon: 'fa-snowflake',       desc: 'Holds 60 fish. Keeps them fresh.' },
    { id: 'bucket_100', cap: 100, price: 15000, name: 'Trawler Hold',  icon: 'fa-ship',            desc: 'Holds 100 fish. A real fishing boat.' },
    { id: 'bucket_160', cap: 160, price: 35000, name: 'Abyssal Vault', icon: 'fa-box-open',        desc: 'Holds 160 fish. It whispers... hold more.' },
];

const RODS = [
    { id: 'rod_starter', name: 'Standard Line',      tensionMax: 100, reelPower: 45,  luck: 0.00, price: 0,      desc: 'Basic setup. Good for panfish.',            rarity: 'common',    color: '#94a3b8', biteTimeMult: 1.0, staminaSave: 0, pullMult: 1.0, bobberModel: 'classic', lineColor: '#94a3b8' },
    { id: 'rod_bamboo',  name: 'Bamboo Stick',       tensionMax: 140, reelPower: 65,  luck: 0.08, price: 450,    desc: 'Literally a stick. A lucky stick.',         rarity: 'common',    color: '#a16207', biteTimeMult: 0.95, staminaSave: 0.05, pullMult: 1.0, bobberModel: 'slim', lineColor: '#a16207' },
    { id: 'rod_copper',  name: 'Copper Rig',         tensionMax: 120, reelPower: 55,  luck: 0.04, price: 200,    desc: 'Penny-tackle that somehow works.',          rarity: 'common',    color: '#b87333', biteTimeMult: 0.97, staminaSave: 0.03, pullMult: 1.0, bobberModel: 'slim', lineColor: '#b87333' },
    { id: 'rod_pro',     name: 'Kevlar Reinforced',  tensionMax: 180, reelPower: 85,  luck: 0.15, price: 1500,   desc: 'High tension limit. 10% faster bites, 10% less stamina drain.', rarity: 'rare', color: '#38bdf8', biteTimeMult: 0.9, staminaSave: 0.10, pullMult: 1.05, bobberModel: 'bulb', lineColor: '#38bdf8' },
    { id: 'rod_kelp',    name: 'Kelp Strand',        tensionMax: 200, reelPower: 95,  luck: 0.20, price: 2200,   desc: 'Living line. Smells like low tide.',        rarity: 'rare',      color: '#16a34a', biteTimeMult: 0.88, staminaSave: 0.12, pullMult: 1.08, bobberModel: 'bulb', lineColor: '#16a34a' },
    { id: 'rod_carbon',  name: 'Carbon Flex',        tensionMax: 220, reelPower: 105, luck: 0.25, price: 3200,   desc: 'Balanced flex. 15% faster bites, 15% stamina save.', rarity: 'rare', color: '#22d3ee', biteTimeMult: 0.85, staminaSave: 0.15, pullMult: 1.1, bobberModel: 'feather', lineColor: '#22d3ee' },
    { id: 'rod_ghost',   name: 'Ghostline',          tensionMax: 260, reelPower: 125, luck: 0.35, price: 5200,   desc: 'Fish never feel the hook. Spooky, effective.', rarity: 'epic', color: '#cbd5e1', biteTimeMult: 0.8, staminaSave: 0.2, pullMult: 1.05, bobberModel: 'glow', lineColor: '#cbd5e1' },
    { id: 'rod_mythic',  name: 'Titanium Reel',      tensionMax: 300, reelPower: 140, luck: 0.50, price: 7000,   desc: 'Ultra-fast reel. 25% faster bites, 25% stamina save, +10% pull.', rarity: 'epic', color: '#a855f7', biteTimeMult: 0.75, staminaSave: 0.25, pullMult: 1.1, bobberModel: 'rocket', lineColor: '#a855f7' },
    { id: 'rod_frost',   name: 'Frostbite Rig',      tensionMax: 330, reelPower: 150, luck: 0.60, price: 9000,   desc: 'Line never freezes. Fingers do.',           rarity: 'epic',      color: '#7dd3fc', biteTimeMult: 0.7, staminaSave: 0.28, pullMult: 1.15, bobberModel: 'feather', lineColor: '#7dd3fc' },
    { id: 'rod_bio',     name: 'Bioluminescent Rig', tensionMax: 380, reelPower: 175, luck: 0.75, price: 12000,  desc: 'Glows underwater. 35% faster bites, 30% stamina save, +20% pull.', rarity: 'epic', color: '#22c55e', biteTimeMult: 0.65, staminaSave: 0.30, pullMult: 1.2, bobberModel: 'glow', lineColor: '#22c55e' },
    { id: 'rod_storm',   name: 'Stormweaver',        tensionMax: 440, reelPower: 205, luck: 1.10, price: 18000,  desc: 'Handles wild currents. 45% faster bites, 35% stamina save, +30% pull.', rarity: 'legendary', color: '#eab308', biteTimeMult: 0.55, staminaSave: 0.35, pullMult: 1.3, bobberModel: 'bulb', lineColor: '#eab308' },
    { id: 'rod_titan',   name: 'Titan Sono-rod',     tensionMax: 480, reelPower: 225, luck: 1.30, price: 26000,  desc: 'Hums at whale frequency. Fish come to stare.', rarity: 'legendary', color: '#f97316', biteTimeMult: 0.5, staminaSave: 0.4, pullMult: 1.35, bobberModel: 'rocket', lineColor: '#f97316' },
    { id: 'rod_abyssal', name: 'Abyssal Grapple',    tensionMax: 520, reelPower: 245, luck: 1.50, price: 32000,  desc: 'Legendary. 55% faster bites, 45% stamina save, +45% pull.', rarity: 'legendary', color: '#f59e0b', biteTimeMult: 0.45, staminaSave: 0.45, pullMult: 1.45, bobberModel: 'glow', lineColor: '#f59e0b' },
    { id: 'rod_doom',    name: 'Doombringer',        tensionMax: 580, reelPower: 265, luck: 1.70, price: 45000,  desc: 'The hook is the least scary part.',         rarity: 'mythic',    color: '#ef4444', biteTimeMult: 0.42, staminaSave: 0.5, pullMult: 1.5, bobberModel: 'rocket', lineColor: '#ef4444' },
    { id: 'rod_kraken',  name: 'Kraken Tendril',     tensionMax: 620, reelPower: 280, luck: 1.90, price: 55000,  desc: 'It grips back. 60% faster bites, 50% stamina save, +55% pull.', rarity: 'mythic', color: '#dc2626', biteTimeMult: 0.4, staminaSave: 0.5, pullMult: 1.55, bobberModel: 'rocket', lineColor: '#dc2626' },
    { id: 'rod_cosmic',  name: 'Cosmic Thread',      tensionMax: 700, reelPower: 310, luck: 2.20, price: 70000,  desc: 'Mythic. 65% faster bites, 55% stamina save, +60% pull. Bends reality.', rarity: 'mythic', color: '#e879f9', biteTimeMult: 0.35, staminaSave: 0.55, pullMult: 1.6, bobberModel: 'glow', lineColor: '#e879f9' }
];
const ARMOR = [
    // Light Armor
    { id: 'vest_light', name: 'Fisher\'s Vest', type: 'chest', slot: 'armor',
      defense: 5, hpBonus: 20, speedPenalty: 0, weight: 'Light',
      price: 1300, desc: 'Light canvas vest. Basic protection.', rarity: 'common', color: '#94a3b8' },
    { id: 'cap_light', name: 'Salt-Stained Cap', type: 'head', slot: 'armor',
      defense: 2, hpBonus: 8, speedBonus: 2, weight: 'Light',
      price: 800, desc: 'Keeps the sun off. Barely keeps teeth in.', rarity: 'common', color: '#94a3b8' },
    { id: 'boots_light', name: 'Wading Boots', type: 'feet', slot: 'armor',
      defense: 3, hpBonus: 10, speedBonus: 5, weight: 'Light',
      price: 1000, desc: 'Rubber boots. Better traction on wet surfaces.', rarity: 'common', color: '#94a3b8' },
    { id: 'gloves_light', name: 'Grip Gloves', type: 'hands', slot: 'armor',
      defense: 2, hpBonus: 5, reelPowerBonus: 10, weight: 'Light',
      price: 800, desc: 'Fingerless gloves. Better rod grip.', rarity: 'common', color: '#94a3b8' },
    { id: 'wetsuit_top', name: 'Patchwork Wetsuit', type: 'chest', slot: 'armor',
      defense: 7, hpBonus: 30, speedPenalty: 2, weight: 'Light',
      price: 1500, desc: 'Smells awful. Works great.', rarity: 'common', color: '#64748b' },
    
    // Medium Armor
    { id: 'vest_medium', name: 'Reinforced Chestplate', type: 'chest', slot: 'armor',
      defense: 15, hpBonus: 50, speedPenalty: 5, weight: 'Medium',
      price: 6300, desc: 'Kevlar-weave vest. Solid protection.', rarity: 'rare', color: '#38bdf8' },
    { id: 'boots_medium', name: 'Treaded Waders', type: 'feet', slot: 'armor',
      defense: 8, hpBonus: 25, speedPenalty: 2, weight: 'Medium',
      price: 4500, desc: 'Heavy-duty waders. Stability in currents.', rarity: 'rare', color: '#38bdf8' },
    { id: 'helm_medium', name: 'Angler\'s Helm', type: 'head', slot: 'armor',
      defense: 10, hpBonus: 30, luckBonus: 0.1, weight: 'Medium',
      price: 5000, desc: 'Wide-brim hat with Kevlar lining.', rarity: 'rare', color: '#38bdf8' },
    { id: 'helm_sonar', name: 'Sonar Headset', type: 'head', slot: 'armor',
      defense: 12, hpBonus: 35, luckBonus: 0.15, weight: 'Medium',
      price: 9000, desc: 'Hear them coming. Fish hate this thing.', rarity: 'rare', color: '#22d3ee' },
    { id: 'vest_kelp', name: 'Kelpweave Vest', type: 'chest', slot: 'armor',
      defense: 18, hpBonus: 60, speedPenalty: 6, weight: 'Medium',
      price: 11000, desc: 'Woven from deep kelp. Slippery but tough.', rarity: 'rare', color: '#16a34a' },
    
    // Heavy Armor
    { id: 'vest_heavy', name: 'Abyssal Plate', type: 'chest', slot: 'armor',
      defense: 30, hpBonus: 100, speedPenalty: 15, weight: 'Heavy',
      price: 30000, desc: 'Titanium-alloy plate. Near-impervious.', rarity: 'epic', color: '#a855f7' },
    { id: 'boots_heavy', name: 'Lead-Soled Boots', type: 'feet', slot: 'armor',
      defense: 20, hpBonus: 60, speedPenalty: 10, anchorBonus: true, weight: 'Heavy',
      price: 20000, desc: 'Cannot be knocked back. Immune to push.', rarity: 'epic', color: '#a855f7' },
    { id: 'gauntlets_heavy', name: 'Crusher Gauntlets', type: 'hands', slot: 'armor',
      defense: 15, hpBonus: 40, meleeDamageBonus: 25, weight: 'Heavy',
      price: 23000, desc: 'Hydraulic crushing grip. Melee kills heal.', rarity: 'epic', color: '#a855f7' },
    { id: 'helm_crusher', name: 'Crusher Helm', type: 'head', slot: 'armor',
      defense: 18, hpBonus: 70, speedPenalty: 8, weight: 'Heavy',
      price: 35000, desc: 'A bucket of spite with eye holes.', rarity: 'epic', color: '#7c3aed' },
    { id: 'boots_magma', name: 'Magma-Walkers', type: 'feet', slot: 'armor',
      defense: 24, hpBonus: 80, speedPenalty: 12, weight: 'Heavy',
      price: 32000, desc: 'Cooled lava soles. Hot, heavy, unstoppable.', rarity: 'epic', color: '#ea580c' },
    
    // Legendary Armor
    { id: 'vest_legendary', name: 'Leviathan Hide', type: 'chest', slot: 'armor',
      defense: 50, hpBonus: 200, speedPenalty: 10, damageReflect: 0.15, weight: 'Legendary',
      price: 125000, desc: 'Scales of a fallen leviathan. Reflects damage.', rarity: 'legendary', color: '#f59e0b' },
    { id: 'boots_legendary', name: 'Tidewalker Striders', type: 'feet', slot: 'armor',
      defense: 25, hpBonus: 80, speedBonus: 20, waterWalk: true, weight: 'Legendary',
      price: 88000, desc: 'Walk on water. Speed boost in shallows.', rarity: 'legendary', color: '#f59e0b' },
    { id: 'helm_legendary', name: 'Crown of Tides', type: 'head', slot: 'armor',
      defense: 30, hpBonus: 100, luckBonus: 0.5, sonarRange: 300, weight: 'Legendary',
      price: 100000, desc: 'See fish through walls. Massive luck boost.', rarity: 'legendary', color: '#f59e0b' },
    { id: 'vest_stormhide', name: 'Stormhide Carapace', type: 'chest', slot: 'armor',
      defense: 60, hpBonus: 250, speedPenalty: 12, damageReflect: 0.2, weight: 'Legendary',
      price: 180000, desc: 'Shed by something that survived lightning.', rarity: 'legendary', color: '#eab308' },
    
    // Mythic Armor
    { id: 'helm_void', name: 'Void Maw Helm', type: 'head', slot: 'armor',
      defense: 40, hpBonus: 150, luckBonus: 0.3, weight: 'Mythic',
      price: 150000, desc: 'It whispers fishing spots. Probably trustworthy.', rarity: 'mythic', color: '#e879f9' },
    { id: 'set_abyssal', name: 'Abyssal Sovereign Set', type: 'set', slot: 'armor',
      defense: 100, hpBonus: 500, speedPenalty: 0, fullSetBonus: { hpRegen: 5, damageReduction: 0.25, fearAura: true }, weight: 'Mythic',
      price: 500000, desc: 'Full set: Unkillable. Regenerates. Enemies flee.', rarity: 'mythic', color: '#e879f9', setItems: ['vest_abyssal', 'boots_abyssal', 'helm_abyssal', 'gauntlets_abyssal'] },
];

const WeaponSystem = {
    // Returns the weapon currently held in the active slot, or null.
    getActiveWeapon(state) {
        const p = state.player;
        const id = p.equippedWeapons[p.activeSlot];
        if (!id) return null;
        return WEAPONS.find(w => w.id === id) || null;
    },

    // Shared damage roll: crit (rolled per-bullet at fire time) x execute
    // (target under 35% HP) x boss-bane (boss / legendary / mythic).
    // targetHp/targetMax are the victim's CURRENT values (pre-hit).
    rollHit(b, targetHp, targetMax, species) {
        let dmg = (b.damage || 0) * (b.critMult || 1);
        const crit = (b.critMult || 1) > 1;
        if (b.executeMult && targetMax > 0 && targetHp / targetMax < 0.35) dmg *= b.executeMult;
        if (b.bossMult && species &&
            (species.isBoss || species.rarity === 'legendary' ||
             species.rarity === 'mythic' || species.rarity === 'boss')) dmg *= b.bossMult;
        return { dmg: Math.max(1, Math.round(dmg)), crit };
    },

    // Swept point-vs-circle: did the segment (px,py)->(x,y) touch the
    // circle? Stops fast pellets tunneling through small fish at low fps.
    segHitsCircle(px, py, x, y, cx, cy, r) {
        const dx = x - px, dy = y - py;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((cx - px) * dx + (cy - py) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const nx = px + dx * t - cx, ny = py + dy * t - cy;
        return nx * nx + ny * ny <= r * r;
    },

    // Damage popup with a random offset so a 7-pellet volley reads as
    // 7 separate hits instead of one stacked number.
    popText(state, txt, x, y, color) {
        try {
            Particles.showFloatingText(state, txt,
                x + (Math.random() - 0.5) * 40, y - 18 + (Math.random() - 0.5) * 22, color);
        } catch (e) {}
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
        // Eco perk: chance this trigger pull is free (bullet-hose economy)
        const freeShot = w.ecoCh && Math.random() < w.ecoCh;
        if (!freeShot && p.weaponAmmo[w.id] !== Infinity && p.weaponAmmo[w.id] !== undefined) {
            p.weaponAmmo[w.id]--;
            Player.refreshWeaponHUD(state);
        }

        p.weaponRecoil = (w.recoil || 4);
        p.muzzleFlash = (w.muzzle || 12) / 10;

        try { audio.playGunshot(w.sound || w.type); } catch (e) {}
        state.screenShake = w.shake || 3;

        const angle = Math.atan2(state.mouse.worldY - p.y, state.mouse.worldX - p.x);

        const mpClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());
        const pid = (typeof Multiplayer !== 'undefined' && Multiplayer.localClientId)
            || ((typeof Multiplayer !== 'undefined' && Multiplayer.isHost) ? 'host' : 'solo');

        for (let i = 0; i < w.count; i++) {
            const spreadAngle = angle + (Math.random() - 0.5) * w.spread;
            // Crits roll per bullet so every pellet of a shotgun can crit
            const critMult = (w.critCh && Math.random() < w.critCh) ? (w.critMult || 2) : 1;
            const bullet = {
                id: pid + ':' + (p._bulletSeq = (p._bulletSeq || 0) + 1),
                pid,
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
                burnDps: w.burnDps || 12,
                // NEW: Special weapon properties (work on LAND and WATER)
                poison: !!w.poison,
                poisonDpsMult: w.poisonDpsMult || 0.3,
                chain: !!w.chain,
                chainMult: w.chainMult || 0.6,
                lifesteal: w.lifesteal || 0,
                coral: !!w.coral,
                coralDps: w.coralDps || 15,
                freeze: !!w.freeze,
                freezeTime: w.freezeTime || 2.5,
                stun: !!w.stun,
                stunTime: w.stunTime || 1.5,
                slowHook: w.slowHook || 0,
                // BALANCE PASS: universal damage perks (plain data -> MP-safe)
                critMult,                       // rolled above, 1 when no crit
                executeMult: w.executeMult || 0, // x dmg vs targets under 35% HP
                bossMult: w.bossMult || 0,        // x dmg vs boss/legendary/mythic
                drainMult: w.drainMult || 0,      // x stamina drain on hooked fish
                knockMult: w.knockMult || 0,      // x knockback on land hits
                scatter: w.count > 1,            // pellet cloud: generous hooked-fish hitbox
                hitSet: new Set(),
                trail: []
            };
            if (mpClient) {
                // Client bullets render + weaken the local hooked fish;
                // the host sim owns all world damage (see update below).
                bullet.local = true;
                state.bullets.push(bullet);
                if (typeof Multiplayer !== 'undefined' && Multiplayer.queueBullet) {
                    Multiplayer.queueBullet({
                        id: bullet.id, pid,
                        x: bullet.x, y: bullet.y,
                        vx: bullet.vx, vy: bullet.vy, damage: bullet.damage,
                        range: bullet.range, type: bullet.type,
                        pierce: bullet.pierce, explosive: bullet.explosive,
                        burn: bullet.burn, burnDps: bullet.burnDps,
                        poison: bullet.poison, poisonDpsMult: bullet.poisonDpsMult,
                        chain: bullet.chain, chainMult: bullet.chainMult,
                        lifesteal: bullet.lifesteal, coral: bullet.coral,
                        coralDps: bullet.coralDps, freeze: bullet.freeze,
                        freezeTime: bullet.freezeTime, stun: bullet.stun,
                        stunTime: bullet.stunTime, slowHook: bullet.slowHook,
                        critMult: bullet.critMult, executeMult: bullet.executeMult,
                        bossMult: bullet.bossMult, drainMult: bullet.drainMult,
                        knockMult: bullet.knockMult, scatter: bullet.scatter
                    });
                }
            } else {
                state.bullets.push(bullet);
            }
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
        try { audio.playReload(); } catch (e) {}
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
                            try { audio.playUIClick(); } catch (e) {}
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
        const frozen = typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil;
        if (state.mouse.isDown && w && w.auto && !p.reloading && !frozen) {
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
            // MP clients only damage their own hooked fish locally —
            // all world damage is simulated by the host.
            const mpClient = (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient());

            const hooked = state.fishing.hookedFish;
            // A helper's claimed hit may already be applied for this bullet
            // id (claim arrived before the synced bullet overlapped) — skip
            // so overlap + claim can never double-damage.
            const _bid = b.id;
            const _claimed = _bid && typeof Multiplayer !== 'undefined' && Multiplayer._fishHitApplied && Multiplayer._fishHitApplied[_bid];
            if (_claimed) {
                if (b.hitSet) b.hitSet.add('fish');
                if (!b.pierce) consumed = true;
            } else if (hooked && state.fishing.mode === 'HOOKED' &&
                !(b.hitSet && b.hitSet.has('fish'))) {
                // Pellet clouds get a generous hitbox so a full shotgun
                // volley can connect underwater instead of 1 stray pellet.
                const hitR = hooked.species.size + (hooked.isInflated ? 12 : 0) + 8 + (b.scatter ? 10 : 0);
                const px = b.x - stepX, py = b.y - stepY;
                if (this.segHitsCircle(px, py, b.x, b.y, hooked.x, hooked.y, hitR)) {
                    const hr = this.rollHit(b, hooked.hp, hooked.maxHp || hooked.hp, hooked.species);
                    let dmg = hr.dmg;
                    if (hooked.isInflated) dmg = Math.max(1, Math.round(dmg * 0.5));
                    hooked.hp -= dmg;
                    hooked.stamina -= dmg * CONFIG.STAMINA_DRAIN_PER_BULLET * (b.drainMult || 1);
                    // Special effects now work in WATER too (fixed)
                    if (b.burn) { hooked.burnTimer = Math.max(hooked.burnTimer || 0, 3.0); hooked.burnDps = b.burnDps || 12; }
                    if (b.poison) { hooked.poisonTimer = Math.max(hooked.poisonTimer || 0, 5.0); hooked.poisonDps = Math.round(dmg * (b.poisonDpsMult || 0.3)); }
                    if (b.freeze) { hooked.freezeTimer = Math.max(hooked.freezeTimer || 0, b.freezeTime || 2.5); }
                    if (b.stun) { hooked.stunTimer = Math.max(hooked.stunTimer || 0, b.stunTime || 1.5); }
                    if (b.slowHook) { hooked.slowTimer = Math.max(hooked.slowTimer || 0, 3.0); hooked.slowMult = b.slowHook; }
                    if (b.lifesteal) {
                        const healAmount = Math.round(dmg * b.lifesteal);
                        state.player.hp = Math.min(state.player.maxHp, state.player.hp + healAmount);
                        Player.refreshHUD(state);
                    }
                    if (b.explosive) {
                        const splash = dmg * 0.5;
                        hooked.hp -= splash * 0.3;
                        hooked.stamina -= splash * 0.3 * CONFIG.STAMINA_DRAIN_PER_BULLET;
                        Particles.spawnParticles(state, hooked.x, hooked.y, '#f97316', 12, { size: 5 });
                        state.screenShake = Math.max(state.screenShake, 8);
                    }
                    try { audio.playHit(); } catch (e) {}
                    Particles.spawnWaterSplashes(state, hooked.x, hooked.y, 5);
                    this.popText(state, (hr.crit ? 'CRIT -' : '-') + Math.round(dmg),
                        hooked.x, hooked.y, hr.crit ? '#fde047' : '#38bdf8');
                    if (b.hitSet) b.hitSet.add('fish');
                    // Record foreign-bullet ids so a late helper claim for
                    // the same bullet is ignored (no double damage).
                    try {
                        if (_bid && typeof Multiplayer !== 'undefined' && !b.local) {
                            if (!Multiplayer._fishHitApplied) Multiplayer._fishHitApplied = {};
                            Multiplayer._fishHitApplied[_bid] = Date.now();
                        }
                    } catch (e) {}

                    if (hooked.hp <= 0) {
                        hooked.hp = 0;
                        Fishing.killHookedFish(state);
                    }
                    if (!b.pierce) consumed = true;
                }
            }

            if (!consumed && !mpClient) {
                for (let j = state.monstersOnLand.length - 1; j >= 0; j--) {
                    const m = state.monstersOnLand[j];
                    if (b.hitSet && b.hitSet.has(m)) continue;
                    const px = b.x - stepX, py = b.y - stepY;
                    if (this.segHitsCircle(px, py, b.x, b.y, m.x, m.y, m.species.size + 5)) {
                        const hr = this.rollHit(b, m.hp, m.maxHp || m.species.maxHp || m.hp, m.species);
                        m.hp -= hr.dmg;
                        try { audio.playHit(); } catch (e) {}
                        Particles.spawnBloodImpact(state, m.x, m.y, m.species.color);
                        this.popText(state, (hr.crit ? 'CRIT -' : '-') + hr.dmg,
                            m.x, m.y - 4, hr.crit ? '#fde047' : '#f87171');
                        const knock = 12 * (b.knockMult || 1);
                        m.x += (b.vx / 900) * knock;
                        m.y += (b.vy / 900) * knock;
                        if (b.hitSet) b.hitSet.add(m);

                        if (b.burn) { m.burnTimer = 3.0; m.burnDps = b.burnDps || 12; }

                        // NEW: Poison effect (crossbow)
                        if (b.poison) {
                            m.poisonTimer = 5.0;
                            m.poisonDps = Math.round(hr.dmg * (b.poisonDpsMult || 0.3));
                            Particles.spawnParticles(state, m.x, m.y, '#84cc16', 8);
                            Particles.showFloatingText(state, 'POISONED!', m.x, m.y - 30, '#84cc16');
                        }

                        // NEW: Freeze effect (frost bow)
                        if (b.freeze) {
                            m.freezeTimer = b.freezeTime || 2.5;
                            m.slowed = true;
                            Particles.spawnParticles(state, m.x, m.y, '#67e8f9', 12, { size: 4 });
                            Particles.showFloatingText(state, 'FROZEN!', m.x, m.y - 30, '#67e8f9');
                        }

                        // NEW: Stun effect (sonic pistol)
                        if (b.stun) {
                            m.stunTimer = b.stunTime || 1.5;
                            Particles.spawnParticles(state, m.x, m.y, '#fde047', 10);
                            Particles.showFloatingText(state, 'STUNNED!', m.x, m.y - 30, '#fde047');
                        }

                        // NEW: Lifesteal (void rifle)
                        if (b.lifesteal) {
                            const healAmount = Math.round(hr.dmg * b.lifesteal);
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
                                type: 'coral', damagePerSec: (b.coralDps || 15), color: '#14b8a6'
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
                            const chainDmg = Math.round(b.damage * (b.chainMult || 0.6));
                            for (const other of state.monstersOnLand) {
                                if (other === m) continue;
                                if (targetsHit >= 4) break; // Max 4 targets
                                const dist = Math.hypot(other.x - m.x, other.y - m.y);
                                if (dist < 220) {
                                    other.hp -= chainDmg;
                                    Particles.spawnParticles(state, other.x, other.y, '#38bdf8', 8);
                                    Particles.showFloatingText(state, `-${chainDmg}`,
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

            // --- Open-world enemies: seagulls / beach crabs / beached jumping fish.
            // These live in state.enemies (not monstersOnLand) and previously
            // could never be hit, so they were unkillable.
            // (Host only in MP — clients route damage through merged bullets.)
            if (!consumed && !mpClient && state.enemies) {
                for (let j = state.enemies.length - 1; j >= 0; j--) {
                    const e = state.enemies[j];
                    if (b.hitSet && b.hitSet.has(e)) continue;
                    if (e.burrowed || e.state === 'burrowed') continue;
                    const er = e.enemyType === 'seagull' ? 20
                        : e.enemyType === 'beachCrab' ? 22
                        : ((e.species && e.species.size) || 20) + 4;
                    const epx = b.x - stepX, epy = b.y - stepY;
                    if (this.segHitsCircle(epx, epy, b.x, b.y, e.x, e.y, er)) {
                        const ehr = this.rollHit(b, e.hp, e.maxHp || e.hp, e.species || null);
                        e.hp -= ehr.dmg;
                        e.hitFlash = 0.4;
                        if (b.pid) e._lastPid = b.pid; // kill credit for co-op awards
                        try { audio.playHit(); } catch (e2) {}
                        Particles.spawnParticles(state, e.x, e.y, '#f87171', 6, { size: 3 });
                        this.popText(state, (ehr.crit ? 'CRIT -' : '-') + ehr.dmg, e.x, e.y - 8, ehr.crit ? '#fde047' : '#f87171');
                        const eknock = 8 * (b.knockMult || 1);
                        e.x += (b.vx / 900) * eknock;
                        e.y += (b.vy / 900) * eknock;
                        if (b.hitSet) b.hitSet.add(e);
                        if (b.burn) { e.burnTimer = 3.0; e.burnDps = b.burnDps || 12; }
                        if (b.poison) { e.poisonTimer = 5.0; e.poisonDps = Math.round(ehr.dmg * (b.poisonDpsMult || 0.3)); }
                        if (b.freeze) e.freezeTimer = b.freezeTime || 2.5;
                        if (b.stun) e.stunTimer = b.stunTime || 1.5;
                        if (b.lifesteal) {
                            state.player.hp = Math.min(state.player.maxHp, state.player.hp + Math.round(ehr.dmg * b.lifesteal));
                            Player.refreshHUD(state);
                        }
                        if (b.explosive) {
                            for (const other of state.enemies) {
                                if (other === e) continue;
                                if (Math.hypot(other.x - e.x, other.y - e.y) < 70) other.hp -= b.damage * 0.5;
                            }
                            Particles.spawnParticles(state, e.x, e.y, '#f97316', 12, { size: 5 });
                        }
                        if (b.chain) {
                            for (const other of state.enemies) {
                                if (other === e) continue;
                                if (Math.hypot(other.x - e.x, other.y - e.y) < 220) {
                                    other.hp -= Math.round(b.damage * (b.chainMult || 0.6));
                                    other.hitFlash = 0.4;
                                    if (typeof Particles !== 'undefined') Particles.spawnLightning(state, e.x, e.y, other.x, other.y, '#38bdf8');
                                    break;
                                }
                            }
                        }
                        if (e.hp <= 0 && typeof EnemySpawner !== 'undefined') {
                            EnemySpawner.onEnemyKilled(e);
                        }
                        if (!b.pierce) { consumed = true; break; }
                    }
                }
            }

            // MP client instant echo: synced enemies/monsters are damaged in
            // the HOST sim (this bullet rides there via outbox) — here we
            // only flash + bleed the LOCAL copy so hits feel instant.
            // No hp touched (host owns it), no popText (the real damage
            // number rides back via snapshot fx a moment later).
            if (!consumed && mpClient) {
                const echoHit = (ex, ey, col) => {
                    try {
                        if (state.particles) {
                            for (let k = 0; k < 5; k++) {
                                state.particles.push({
                                    x: ex, y: ey,
                                    vx: (Math.random() - 0.5) * 260,
                                    vy: (Math.random() - 0.5) * 260,
                                    color: col, life: 0.3, size: 3
                                });
                            }
                        }
                    } catch (e) {}
                };
                if (state.enemies) {
                    for (const e of state.enemies) {
                        if (!e || e.burrowed || e.state === 'burrowed') continue;
                        const er = e.enemyType === 'seagull' ? 20
                            : e.enemyType === 'beachCrab' ? 22
                            : ((e.species && e.species.size) || 20) + 4;
                        if (this.segHitsCircle(b.x - stepX, b.y - stepY, b.x, b.y, e.x, e.y, er)) {
                            e.hitFlash = 0.25;
                            echoHit(e.x, e.y, '#f87171');
                            try { audio.playHit(); } catch (e2) {}
                            break;
                        }
                    }
                }
                if (state.monstersOnLand) {
                    for (const m of state.monstersOnLand) {
                        if (!m || !m.species) continue;
                        if (this.segHitsCircle(b.x - stepX, b.y - stepY, b.x, b.y, m.x, m.y, (m.species.size || 16) + 5)) {
                            m.hitFlash = 0.25;
                            echoHit(m.x, m.y, (m.species.color || '#f87171'));
                            try { audio.playHit(); } catch (e2) {}
                            break;
                        }
                    }
                }
            }

            if (consumed) state.bullets.splice(i, 1);
        }

        // Co-op: my bullets vs OTHER players' hooked fish. Local damage is
        // owned by the catcher — here we only show the impact splash and
        // route a damage claim to them (once per bullet per catcher).
        this._remoteFishHelp(state);
    },

    _remoteFishHelp(state) {
        if (typeof Multiplayer === 'undefined' || !Multiplayer.roomCode) return;
        const isHost = Multiplayer.isHost;
        let remotes = null;
        try {
            remotes = isHost
                ? Object.entries(Multiplayer.hostPeers || {})
                : Object.entries(state.remotePlayers || {});
        } catch (e) { return; }
        if (!remotes.length || !state.bullets) return;
        for (const b of state.bullets) {
            if (!b || b.owner !== 'player' || !b.id) continue;
            for (const [pid, rp] of remotes) {
                const h = rp && rp.fishing && rp.fishing.mode === 'HOOKED' ? rp.fishing.hooked : null;
                if (!h || h.isDead || typeof h.x !== 'number') continue;
                if (b._claimedFor && b._claimedFor[pid]) continue;
                const hitR = (h.size || 16) + (h.isInflated ? 12 : 0) + 8;
                if (Math.hypot(b.x - h.x, b.y - h.y) < hitR) {
                    if (!b._claimedFor) b._claimedFor = {};
                    b._claimedFor[pid] = 1;
                    try { Particles.spawnWaterSplashes(state, b.x, b.y, 4); } catch (e) {}
                    try {
                        Multiplayer.queueFishHit({
                            to: pid, bid: b.id, dmg: b.damage,
                            burn: !!b.burn, burnDps: b.burnDps,
                            poison: !!b.poison, poisonDpsMult: b.poisonDpsMult,
                            freeze: !!b.freeze, freezeTime: b.freezeTime,
                            stun: !!b.stun, stunTime: b.stunTime,
                            slowHook: b.slowHook || 0, explosive: !!b.explosive,
                            critMult: b.critMult || 1, executeMult: b.executeMult || 0,
                            bossMult: b.bossMult || 0, drainMult: b.drainMult || 0
                        });
                    } catch (e) {}
                    if (!b.pierce) break;
                }
            }
        }
    }
};