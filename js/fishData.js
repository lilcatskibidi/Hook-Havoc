// Base skill damage scaler tied to rarity tier and fish attack stat.
// Bulletproof: virtual/remote fish without a species block deal chip.
function getSkillDamage(fish, baseMultiplier = 1.0) {    const rarityMultipliers = {
        common: 1.0,
        rare: 1.4,
        epic: 2.0,
        legendary: 3.2,
        mythic: 4.8
    };
    const sp = (fish && fish.species) || {};
    const tierMult = rarityMultipliers[sp.rarity] || 1.0;
    const atk = Number(sp.attack);
    return Math.max(1, Math.round(((Number.isFinite(atk) ? atk : 10) * 0.8) * tierMult * (Number(baseMultiplier) || 1)));
}

// Fish-skill damage to the player. Routes through Combat.damagePlayer so
// armor, HUD, damage flash AND death are handled. Direct `p.hp -= x` here
// used to leave the player walking around at 0/100 HP, seemingly alive.
// Returns the mitigated amount actually dealt (for floating texts).
function hurtFishSkill(state, raw) {
    try {
        if (typeof Combat !== 'undefined' && Combat.damagePlayer) {
            return Combat.damagePlayer(state, raw);
        }
    } catch (e) {}
    const p = state.player;
    const dmg = Math.max(1, Math.round(raw));
    p.hp = Math.max(0, (p.hp || 0) - dmg);
    try {
        if (typeof Player !== 'undefined') Player.refreshHUD(state);
        if (p.hp <= 0) Player.die(state);
    } catch (e) {}
    return dmg;
}

// ============================================================
//  FISH IMAGE LOADER — id-based PNG art + per-fish player uploads.
//  Shipped file = assets/fish/<species-id>.png (drop it in, done).
//  Probes are lazy on first draw; misses fall back to procedural
//  (Render.drawFishModel) and are remembered for the session.
//  Player uploads (Fish Index, localStorage ah_fishimg_<id>) win.
// ============================================================
// ============================================================
//  FISH IMAGE LOADER — art resolves by SPECIES ID:
//  shipped file = assets/fish/<id>.png, player upload wins.
//  Probes are lazy (first draw) + remembered per session, so species
//  without a PNG cost exactly one failed request, then procedural.
// ============================================================
const FishImageLoader = {
    cache: new Map(),
    loading: new Map(),
    failed: new Set(),
    _artIds: null,      // shipped-art allowlist from assets/fish/manifest.json
    _artTried: false,

    storageKey(id) {
        return 'ah_fishimg_' + id;
    },

    hasCustom(id) {
        try { return !!localStorage.getItem(this.storageKey(id)); } catch (e) { return false; }
    },

    // ID-based: every species may ship assets/fish/<id>.png.
    wantsImage(species) {
        if (!species || !species.id) return false;
        if (this.cache.has(species.id)) return true; // uploaded or loaded
        if (this.failed.has(species.id)) return false; // probed: no file
        return true;
    },

    resolveId(species) {
        if (!species || !species.id) return null;
        // Player upload always keyed by species id
        if (this.cache.has(species.id)) return species.id;
        if (this.failed.has(species.id)) {
            // Legacy fallback: an explicit `image` name differing from id.
            if (typeof species.image === 'string' && species.image.length > 0 &&
                species.image !== species.id && !this.failed.has(species.image)) {
                return species.image;
            }
            return null;
        }
        // Allowlist known + id absent = procedural, no request at all.
        if (this._artIds && !this._artIds.has(species.id)) {
            this.failed.add(species.id);
            if (typeof species.image === 'string' && species.image.length > 0 &&
                species.image !== species.id && !this.failed.has(species.image)) {
                return species.image;
            }
            return null;
        }
        return species.id;
    },

    // Fire-and-forget probe for first-draw lazy loading. Species with
    // no shipped file (per manifest) are marked failed with ZERO requests.
    ensure(id) {
        try {
            if (!id || this.cache.has(id) || this.failed.has(id) || this.loading.has(id)) return;
            if (this._artIds && !this._artIds.has(id)) { this.failed.add(id); return; }
            this.load(id);
        } catch (e) {}
    },

    // Allowlist fetch (once): assets/fish/manifest.json from gen script.
    // Missing/unreachable manifest = legacy probe behavior (unchanged).
    ensureManifest() {
        try {
            if (this._artTried || typeof fetch !== 'function') return;
            this._artTried = true;
            fetch('assets/fish/manifest.json').then(r => r.ok ? r.json() : null).then(m => {
                try {
                    if (m && Array.isArray(m.ids)) this._artIds = new Set(m.ids);
                } catch (e) {}
            }).catch(() => {});
        } catch (e) {}
    },

    load(id) {
        if (!id) return Promise.resolve(null);
        if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
        if (this.failed.has(id)) return Promise.resolve(null);
        if (this.loading.has(id)) return this.loading.get(id);

        const promise = new Promise((resolve) => {
            const img = new Image();
            img.src = `assets/fish/${id}.png`;
            img.onload = () => {
                this.cache.set(id, img);
                this.loading.delete(id);
                resolve(img);
            };
            img.onerror = () => {
                this.loading.delete(id);
                this.failed.add(id); // remember: never retry this session
                resolve(null); // Fallback to procedural drawing
            };
        });
        this.loading.set(id, promise);
        return promise;
    },

    get(id) {
        return this.cache.get(id) || null;
    },

    saveUpload(id, file) {
        return new Promise((resolve, reject) => {
            try {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    try {
                        const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
                        const cw = Math.max(1, Math.round(img.naturalWidth * k));
                        const ch = Math.max(1, Math.round(img.naturalHeight * k));
                        const cv = document.createElement('canvas');
                        cv.width = cw; cv.height = ch;
                        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
                        const dataUrl = cv.toDataURL('image/png');
                        URL.revokeObjectURL(url);
                        const done = new Image();
                        done.onload = () => {
                            this.cache.set(id, done);
                            this.failed.delete(id);
                            try { localStorage.setItem(this.storageKey(id), dataUrl); } catch (se) {
                                reject(new Error('STORAGE FULL — kept for this session only'));
                                return;
                            }
                            resolve({ sessionOnly: false });
                        };
                        done.onerror = () => reject(new Error('BAD IMAGE'));
                        done.src = dataUrl;
                    } catch (e) { reject(e); }
                };
                img.onerror = () => reject(new Error('BAD IMAGE'));
                img.src = url;
            } catch (e) { reject(e); }
        });
    },

    clearUpload(id) {
        try { localStorage.removeItem(this.storageKey(id)); } catch (e) {}
        this.cache.delete(id);
        // keep failed as-is; a shipped file (if any) can be re-probed
    },

    restoreUploads(speciesList) {
        (speciesList || []).forEach(sp => {
            const id = typeof sp === 'string' ? sp : sp.id;
            let raw = null;
            try { raw = localStorage.getItem(this.storageKey(id)); } catch (e) {}
            if (!raw) return;
            const img = new Image();
            img.onload = () => { this.cache.set(id, img); };
            img.onerror = () => { try { localStorage.removeItem(this.storageKey(id)); } catch (e) {} };
            img.src = raw;
        });
    },

    preload(speciesList) {
        // 1. player uploads first (they win over shipped files)
        try { this.restoreUploads(speciesList); } catch (e) {}
        // 2. shipped-art allowlist (kills 404 spray; misses stay silent)
        try { this.ensureManifest(); } catch (e) {}
        // 2. shipped art loads lazily on first draw (see ensure) — no
        // boot-time fetch storm. Legacy explicit `image` names prefetch.
        (speciesList || []).forEach(species => {
            if (species && typeof species.image === 'string' && species.image.length > 0 &&
                species.image !== species.id) {
                try { this.load(species.image); } catch (e) {}
            }
        });
    }
};

// Make globally available
window.FishImageLoader = FishImageLoader;

const FISH_SPECIES = [
    // --- COMMON ---
	    // --- NEW: COMMON ---
    // ============================================================
//  MEGA EXPANSION — 135+ ADDITIONAL FISH SPECIES
//  Insert into FISH_SPECIES array before the closing bracket
// ============================================================

// --- COMMON (25 new) ---
{
    id: 'bluegill', name: 'Bluegill Sunfish', color: '#60a5fa', accent: '#3b82f6',
    size: 14, maxHp: 140, staminaMax: 110, attack: 14, speed: 4.2,
    value: 65, rarity: 'common', shape: 'oval', finColor: '#2563eb',
    desc: 'A popular panfish. Fights hard for its size.',
    skills: ['dart', 'waterJet'], skillName: 'Quick Dart / Splash'
},
{
    id: 'perch', name: 'Yellow Perch', color: '#fbbf24', accent: '#f59e0b',
    size: 16, maxHp: 160, staminaMax: 130, attack: 16, speed: 3.8,
    value: 70, rarity: 'common', shape: 'oval', finColor: '#d97706',
    desc: 'Striped schooling fish. Common in lakes.',
    skills: ['dart'], skillName: 'Quick Dart'
},
{
    id: 'crappie', name: 'Black Crappie', color: '#94a3b8', accent: '#64748b',
    size: 15, maxHp: 150, staminaMax: 120, attack: 15, speed: 4.0,
    value: 68, rarity: 'common', shape: 'oval', finColor: '#475569',
    desc: 'Speckled and elusive. Prefers deep cover.',
    skills: ['blink', 'dart'], skillName: 'Shadow Dash / Dart'
},
{
    id: 'pumpkinseed', name: 'Pumpkinseed', color: '#fb923c', accent: '#ea580c',
    size: 12, maxHp: 110, staminaMax: 90, attack: 12, speed: 4.5,
    value: 55, rarity: 'common', shape: 'oval', finColor: '#c2410c',
    desc: 'Colorful little fighter with a sunny disposition.',
    skills: ['flashBang', 'dart'], skillName: 'Flash / Dart'
},
{
    id: 'carp', name: 'Common Carp', color: '#a16207', accent: '#854d0e',
    size: 26, maxHp: 400, staminaMax: 280, attack: 26, speed: 2.6,
    value: 180, rarity: 'common', shape: 'carp', finColor: '#713f12',
    desc: 'Heavy bottom feeder. Pulls like a truck.',
    skills: ['mudSlime', 'whirlpool'], skillName: 'Mud / Vortex'
},
{
    id: 'bream', name: 'Bronze Bream', color: '#d97706', accent: '#b45309',
    size: 18, maxHp: 200, staminaMax: 150, attack: 18, speed: 3.2,
    value: 85, rarity: 'common', shape: 'oval', finColor: '#92400e',
    desc: 'Flat-bodied forager. Fights with surprising stamina.',
    skills: ['dart', 'waterJet'], skillName: 'Dash / Splash'
},
{
    id: 'tench', name: 'Tench', color: '#4d7c0f', accent: '#3f6212',
    size: 20, maxHp: 240, staminaMax: 180, attack: 20, speed: 2.8,
    value: 95, rarity: 'common', shape: 'oval', finColor: '#365314',
    desc: 'Olive-green and slimy. Hardy fighter.',
    skills: ['mudSlime', 'dart'], skillName: 'Slime / Dash'
},
{
    id: 'roach', name: 'Silver Roach', color: '#e2e8f0', accent: '#cbd5e1',
    size: 13, maxHp: 120, staminaMax: 100, attack: 13, speed: 4.4,
    value: 58, rarity: 'common', shape: 'oval', finColor: '#94a3b8',
    desc: 'Shiny schooling fish. Quick and nimble.',
    skills: ['dart'], skillName: 'Quick Dart'
},
{
    id: 'rudd', name: 'Golden Rudd', color: '#fcd34d', accent: '#fbbf24',
    size: 14, maxHp: 130, staminaMax: 105, attack: 14, speed: 4.3,
    value: 62, rarity: 'common', shape: 'oval', finColor: '#f59e0b',
    desc: 'Red-finned beauty. Flashes gold in sunlight.',
    skills: ['flashBang', 'dart'], skillName: 'Flash / Dart'
},
{
    id: 'dace', name: 'Common Dace', color: '#cbd5e1', accent: '#94a3b8',
    size: 11, maxHp: 100, staminaMax: 85, attack: 11, speed: 4.8,
    value: 48, rarity: 'common', shape: 'oval', finColor: '#64748b',
    desc: 'Streamlined swimmer. Loves fast currents.',
    skills: ['dart', 'waterJet'], skillName: 'Current Dash'
},
{
    id: 'gudgeon', name: 'Gudgeon', color: '#a8a29e', accent: '#78716c',
    size: 10, maxHp: 90, staminaMax: 75, attack: 10, speed: 3.5,
    value: 42, rarity: 'common', shape: 'oval', finColor: '#57534e',
    desc: 'Tiny bottom dweller. Easy to catch, fun to fight.',
    skills: ['mudSlime'], skillName: 'Mud Slime'
},
{
    id: 'bleak', name: 'Common Bleak', color: '#f1f5f9', accent: '#e2e8f0',
    size: 8, maxHp: 70, staminaMax: 60, attack: 8, speed: 5.4,
    value: 35, rarity: 'common', shape: 'oval', finColor: '#cbd5e1',
    desc: 'Tiny silver flash. Almost too fast to hook.',
    skills: ['dart', 'blink'], skillName: 'Blink Dash'
},
{
    id: 'smelt', name: 'Rainbow Smelt', color: '#a5f3fc', accent: '#67e8f9',
    size: 12, maxHp: 105, staminaMax: 88, attack: 12, speed: 4.6,
    value: 52, rarity: 'common', shape: 'oval', finColor: '#22d3ee',
    desc: 'Iridescent and oily. Smells like cucumber.',
    skills: ['dart', 'flashBang'], skillName: 'Iridescent Flash'
},
{
    id: 'shad', name: 'American Shad', color: '#94a3b8', accent: '#64748b',
    size: 20, maxHp: 220, staminaMax: 165, attack: 20, speed: 4.0,
    value: 105, rarity: 'common', shape: 'oval', finColor: '#475569',
    desc: 'Migratory fighter. Runs hard when hooked.',
    skills: ['charge', 'dart'], skillName: 'Migration Charge'
},
{
    id: 'herring', name: 'Atlantic Herring', color: '#cbd5e1', accent: '#94a3b8',
    size: 16, maxHp: 170, staminaMax: 135, attack: 16, speed: 4.5,
    value: 72, rarity: 'common', shape: 'oval', finColor: '#64748b',
    desc: 'Schooling silver fish. Swims in massive groups.',
    skills: ['dart'], skillName: 'School Dash'
},
{
    id: 'mackerel', name: 'Atlantic Mackerel', color: '#0ea5e9', accent: '#0284c7',
    size: 18, maxHp: 190, staminaMax: 150, attack: 18, speed: 5.0,
    value: 82, rarity: 'common', shape: 'oval', finColor: '#0369a1',
    desc: 'Striped speedster. Fights with pure aggression.',
    skills: ['dart', 'charge'], skillName: 'Speed Blitz'
},
{
    id: 'pilchard', name: 'Pilchard', color: '#bae6fd', accent: '#7dd3fc',
    size: 14, maxHp: 125, staminaMax: 100, attack: 13, speed: 4.7,
    value: 56, rarity: 'common', shape: 'oval', finColor: '#38bdf8',
    desc: 'Fatty baitfish. Attracts bigger predators.',
    skills: ['dart', 'flashBang'], skillName: 'Bait Flash'
},
{
    id: 'sprat', name: 'European Sprat', color: '#e0f2fe', accent: '#bae6fd',
    size: 11, maxHp: 95, staminaMax: 78, attack: 11, speed: 4.9,
    value: 45, rarity: 'common', shape: 'oval', finColor: '#7dd3fc',
    desc: 'Tiny and plentiful. Feeds the whole ocean.',
    skills: ['dart'], skillName: 'Quick Dart'
},
{
    id: 'sand_smelt', name: 'Sand Smelt', color: '#fef3c7', accent: '#fde68a',
    size: 10, maxHp: 85, staminaMax: 70, attack: 10, speed: 4.4,
    value: 40, rarity: 'common', shape: 'oval', finColor: '#fcd34d',
    desc: 'Sandy-colored coastal dweller.',
    skills: ['dart', 'blink'], skillName: 'Sand Dash'
},
{
    id: 'goby', name: 'Round Goby', color: '#78716c', accent: '#57534e',
    size: 12, maxHp: 115, staminaMax: 92, attack: 13, speed: 3.0,
    value: 50, rarity: 'common', shape: 'oval', finColor: '#44403c',
    desc: 'Invasive bottom hugger. Surprisingly aggressive.',
    skills: ['mudSlime', 'rage'], skillName: 'Territorial Rage'
},
{
    id: 'sculpin', name: 'Mottled Sculpin', color: '#57534e', accent: '#44403c',
    size: 13, maxHp: 125, staminaMax: 98, attack: 15, speed: 2.8,
    value: 54, rarity: 'common', shape: 'spiky', finColor: '#292524',
    desc: 'Spiny bottom dweller. Camouflages perfectly.',
    skills: ['camouflaged', 'mudSlime'], skillName: 'Camouflage / Slime'
},
{
    id: 'stickleback', name: 'Three-Spined Stickleback', color: '#64748b', accent: '#475569',
    size: 9, maxHp: 75, staminaMax: 62, attack: 9, speed: 4.0,
    value: 38, rarity: 'common', shape: 'spiky', finColor: '#334155',
    desc: 'Tiny but armed with defensive spines.',
    skills: ['spineVolley', 'dart'], skillName: 'Spine Defense'
},
{
    id: 'minnow_creek', name: 'Creek Minnow', color: '#fef9c3', accent: '#fde047',
    size: 8, maxHp: 65, staminaMax: 55, attack: 8, speed: 5.1,
    value: 32, rarity: 'common', shape: 'minnow', finColor: '#eab308',
    desc: 'Tiny creek dweller. Quick and curious.',
    skills: ['dart'], skillName: 'Creek Dash'
},
{
    id: 'topminnow', name: 'Blackstripe Topminnow', color: '#fbbf24', accent: '#f59e0b',
    size: 10, maxHp: 88, staminaMax: 72, attack: 10, speed: 4.6,
    value: 44, rarity: 'common', shape: 'oval', finColor: '#d97706',
    desc: 'Surface skimmer. Darts across the top.',
    skills: ['dart', 'flashBang'], skillName: 'Surface Flash'
},
{
    id: 'mosquitofish', name: 'Mosquitofish', color: '#a3a3a3', accent: '#737373',
    size: 7, maxHp: 60, staminaMax: 50, attack: 7, speed: 5.3,
    value: 28, rarity: 'common', shape: 'oval', finColor: '#525252',
    desc: 'Tiny but feisty. Eats mosquito larvae.',
    skills: ['dart'], skillName: 'Quick Dart'
},

// --- RARE (30 new) ---
{
    id: 'bonefish', name: 'Bonefish', color: '#e7e5e4', accent: '#d6d3d1',
    size: 30, maxHp: 580, staminaMax: 420, attack: 52, speed: 6.8,
    value: 620, rarity: 'rare', shape: 'oval', finColor: '#a8a29e',
    desc: 'Silver ghost of the flats. Runs like lightning.',
    skills: ['dart', 'charge', 'blink'], skillName: 'Ghost Run'
},
{
    id: 'permit', name: 'Florida Permit', color: '#f5f5f4', accent: '#e7e5e4',
    size: 32, maxHp: 620, staminaMax: 450, attack: 55, speed: 5.5,
    value: 680, rarity: 'rare', shape: 'oval', finColor: '#d6d3d1',
    desc: 'Deep-bodied fighter. Stubborn and powerful.',
    skills: ['charge', 'waterJet', 'rage'], skillName: 'Power Run'
},
{
    id: 'tarpon', name: 'Silver King Tarpon', color: '#cbd5e1', accent: '#94a3b8',
    size: 38, maxHp: 780, staminaMax: 520, attack: 65, speed: 5.2,
    value: 850, rarity: 'rare', shape: 'oval', finColor: '#64748b',
    desc: 'Acrobatic leaper. Breaches to throw the hook.',
    skills: ['blink', 'charge', 'waterJet'], skillName: 'Silver Leap'
},
{
    id: 'snook', name: 'Common Snook', color: '#d4d4d4', accent: '#a3a3a3',
    size: 34, maxHp: 720, staminaMax: 480, attack: 60, speed: 5.0,
    value: 780, rarity: 'rare', shape: 'oval', finColor: '#737373',
    desc: 'Line-sider ambush predator. Fights dirty.',
    skills: ['charge', 'dart', 'camouflaged'], skillName: 'Ambush Strike'
},
{
    id: 'redfish', name: 'Red Drum', color: '#dc2626', accent: '#b91c1c',
    size: 36, maxHp: 750, staminaMax: 500, attack: 62, speed: 4.5,
    value: 800, rarity: 'rare', shape: 'oval', finColor: '#991b1b',
    desc: 'Bronze bruiser. Pulls with relentless power.',
    skills: ['charge', 'rage', 'waterJet'], skillName: 'Bull Run'
},
{
    id: 'speckled_trout', name: 'Speckled Sea Trout', color: '#cbd5e1', accent: '#94a3b8',
    size: 28, maxHp: 560, staminaMax: 400, attack: 50, speed: 4.8,
    value: 580, rarity: 'rare', shape: 'trout', finColor: '#64748b',
    desc: 'Spotted predator. Strikes with precision.',
    skills: ['dart', 'flashBang', 'charge'], skillName: 'Speckled Strike'
},
{
    id: 'flounder', name: 'Summer Flounder', color: '#a8a29e', accent: '#78716c',
    size: 26, maxHp: 520, staminaMax: 380, attack: 48, speed: 3.0,
    value: 540, rarity: 'rare', shape: 'ray', finColor: '#57534e',
    desc: 'Flatfish ambusher. Buries in sand to strike.',
    skills: ['camouflaged', 'mudSlime', 'dart'], skillName: 'Sand Ambush'
},
{
    id: 'halibut', name: 'Atlantic Halibut', color: '#78716c', accent: '#57534e',
    size: 34, maxHp: 700, staminaMax: 460, attack: 58, speed: 3.2,
    value: 760, rarity: 'rare', shape: 'ray', finColor: '#44403c',
    desc: 'Massive flatfish. Ambushes from the bottom.',
    skills: ['camouflaged', 'charge', 'mudSlime'], skillName: 'Bottom Ambush'
},
{
    id: 'sole', name: 'Dover Sole', color: '#d6d3d1', accent: '#a8a29e',
    size: 24, maxHp: 480, staminaMax: 350, attack: 45, speed: 2.8,
    value: 500, rarity: 'rare', shape: 'flatfish', finColor: '#78716c',
    desc: 'Delicate flatfish. Fights with surprising determination.',
    skills: ['camouflaged', 'waterJet'], skillName: 'Ghost Glide'
},
{
    id: 'turbot', name: 'Turbot', color: '#a3a3a3', accent: '#737373',
    size: 28, maxHp: 550, staminaMax: 390, attack: 52, speed: 3.0,
    value: 570, rarity: 'rare', shape: 'ray', finColor: '#525252',
    desc: 'Diamond-shaped flatfish. Prized catch.',
    skills: ['camouflaged', 'mudSlime', 'dart'], skillName: 'Diamond Dash'
},
{
    id: 'monkfish', name: 'Monkfish', color: '#78716c', accent: '#57534e',
    size: 32, maxHp: 680, staminaMax: 440, attack: 58, speed: 2.5,
    value: 720, rarity: 'rare', shape: 'puffer', finColor: '#44403c',
    desc: 'Ugly but delicious. Huge mouth, bigger appetite.',
    skills: ['drain', 'mudSlime', 'inflate'], skillName: 'Devour'
},
{
    id: 'john_dory', name: 'John Dory', color: '#fbbf24', accent: '#f59e0b',
    size: 26, maxHp: 530, staminaMax: 380, attack: 50, speed: 3.8,
    value: 550, rarity: 'rare', shape: 'spiky', finColor: '#d97706',
    desc: 'Alien-looking fish with a targeting spot.',
    skills: ['flashBang', 'spineVolley', 'dart'], skillName: 'Target Flash'
},
{
    id: 'gurnard', name: 'Red Gurnard', color: '#ef4444', accent: '#dc2626',
    size: 24, maxHp: 490, staminaMax: 355, attack: 46, speed: 4.2,
    value: 510, rarity: 'rare', shape: 'spiky', finColor: '#b91c1c',
    desc: 'Winged bottom feeder. Walks on fin rays.',
    skills: ['spineVolley', 'dart', 'mudSlime'], skillName: 'Wing Walk'
},
{
    id: 'weever', name: 'Lesser Weever', color: '#a16207', accent: '#854d0e',
    size: 22, maxHp: 460, staminaMax: 340, attack: 48, speed: 3.5,
    value: 480, rarity: 'rare', shape: 'spiky', finColor: '#713f12',
    desc: 'Venomous spines. Handle with extreme care.',
    skills: ['poisonSpit', 'spineVolley'], skillName: 'Venom Strike'
},
{
    id: 'scorpionfish', name: 'Scorpionfish', color: '#dc2626', accent: '#b91c1c',
    size: 26, maxHp: 540, staminaMax: 385, attack: 55, speed: 2.8,
    value: 560, rarity: 'rare', shape: 'spiky', finColor: '#991b1b',
    desc: 'Master of disguise. Venomous and patient.',
    skills: ['camouflaged', 'poisonSpit', 'spineVolley'], skillName: 'Venom Ambush'
},
{
    id: 'stonefish', name: 'Stonefish', color: '#78716c', accent: '#57534e',
    size: 28, maxHp: 580, staminaMax: 400, attack: 60, speed: 2.0,
    value: 600, rarity: 'rare', shape: 'stonefish', finColor: '#44403c',
    desc: 'Most venomous fish alive. Looks like a rock.',
    skills: ['camouflaged', 'poisonSpit', 'spineVolley', 'inflate'], skillName: 'Stone Venom'
},
{
    id: 'toadfish', name: 'Toadfish', color: '#a8a29e', accent: '#78716c',
    size: 24, maxHp: 510, staminaMax: 365, attack: 48, speed: 2.5,
    value: 520, rarity: 'rare', shape: 'puffer', finColor: '#57534e',
    desc: 'Grumpy ambusher. Makes humming sounds.',
    skills: ['inflate', 'poisonSpit', 'mudSlime'], skillName: 'Grumpy Puff'
},
{
    id: 'frogfish', name: 'Frogfish', color: '#fb923c', accent: '#ea580c',
    size: 22, maxHp: 470, staminaMax: 345, attack: 50, speed: 2.2,
    value: 490, rarity: 'rare', shape: 'frogfish', finColor: '#c2410c',
    desc: 'Walking fish. Lures prey with a fake worm.',
    skills: ['camouflaged', 'drain', 'poisonSpit'], skillName: 'Lure Strike'
},
{
    id: 'batfish', name: 'Red-lipped Batfish', color: '#dc2626', accent: '#b91c1c',
    size: 20, maxHp: 440, staminaMax: 320, attack: 42, speed: 2.0,
    value: 460, rarity: 'rare', shape: 'ray', finColor: '#991b1b',
    desc: 'Walks on fins. Wears bright red lipstick.',
    skills: ['camouflaged', 'mudSlime'], skillName: 'Strange Walk'
},
{
    id: 'squirrelfish', name: 'Squirrelfish', color: '#ef4444', accent: '#dc2626',
    size: 24, maxHp: 500, staminaMax: 360, attack: 48, speed: 4.0,
    value: 530, rarity: 'rare', shape: 'spiky', finColor: '#b91c1c',
    desc: 'Big-eyed nocturnal hunter. Spiny and fierce.',
    skills: ['flashBang', 'spineVolley', 'dart'], skillName: 'Night Strike'
},
{
    id: 'soldierfish', name: 'Blotcheye Soldierfish', color: '#dc2626', accent: '#b91c1c',
    size: 22, maxHp: 470, staminaMax: 340, attack: 46, speed: 3.8,
    value: 500, rarity: 'rare', shape: 'spiky', finColor: '#991b1b',
    desc: 'Red armor and big eyes. Travels in squads.',
    skills: ['spineVolley', 'flashBang'], skillName: 'Squad Formation'
},
{
    id: 'cardinalfish', name: 'Banggai Cardinalfish', color: '#1e293b', accent: '#334155',
    size: 16, maxHp: 380, staminaMax: 280, attack: 38, speed: 4.2,
    value: 420, rarity: 'rare', shape: 'oval', finColor: '#0f172a',
    desc: 'Elegant striped fish. Endangered beauty.',
    skills: ['flashBang', 'dart', 'blink'], skillName: 'Elegant Flash'
},
{
    id: 'clownfish', name: 'Ocellaris Clownfish', color: '#f97316', accent: '#ea580c',
    size: 14, maxHp: 350, staminaMax: 260, attack: 35, speed: 4.0,
    value: 400, rarity: 'rare', shape: 'clownfish', finColor: '#c2410c',
    desc: 'Anemone dweller. Fiercely territorial.',
    skills: ['dart', 'rage', 'flashBang'], skillName: 'Territorial Dance'
},
{
    id: 'damselfish', name: 'Blue Damselfish', color: '#3b82f6', accent: '#2563eb',
    size: 12, maxHp: 320, staminaMax: 240, attack: 32, speed: 4.5,
    value: 380, rarity: 'rare', shape: 'oval', finColor: '#1d4ed8',
    desc: 'Tiny but aggressive. Defends territory fiercely.',
    skills: ['dart', 'rage'], skillName: 'Reef Rage'
},
{
    id: 'anthias', name: 'Lyretail Anthias', color: '#f97316', accent: '#ea580c',
    size: 18, maxHp: 400, staminaMax: 300, attack: 40, speed: 4.3,
    value: 440, rarity: 'rare', shape: 'oval', finColor: '#c2410c',
    desc: 'Colorful schooling fish. Males are harem masters.',
    skills: ['flashBang', 'dart', 'blink'], skillName: 'Harem Flash'
},
{
    id: 'chromis', name: 'Blue-Green Chromis', color: '#22d3ee', accent: '#06b6d4',
    size: 14, maxHp: 340, staminaMax: 255, attack: 34, speed: 4.4,
    value: 410, rarity: 'rare', shape: 'oval', finColor: '#0891b2',
    desc: 'Shimmering schooler. Dances in the current.',
    skills: ['dart', 'flashBang'], skillName: 'School Shimmer'
},
{
    id: 'wrasse', name: 'Cleaner Wrasse', color: '#38bdf8', accent: '#0ea5e9',
    size: 16, maxHp: 370, staminaMax: 275, attack: 36, speed: 4.6,
    value: 430, rarity: 'rare', shape: 'wrasse', finColor: '#0284c7',
    desc: 'Cleans parasites from other fish. Trusted by all.',
    skills: ['dart', 'blink', 'drain'], skillName: 'Cleaning Dash'
},
{
    id: 'parrotfish', name: 'Rainbow Parrotfish', color: '#22c55e', accent: '#16a34a',
    size: 30, maxHp: 600, staminaMax: 430, attack: 54, speed: 3.5,
    value: 650, rarity: 'rare', shape: 'oval', finColor: '#15803d',
    desc: 'Beak-like teeth crush coral. Colorful and strong.',
    skills: ['charge', 'mudSlime', 'rage'], skillName: 'Coral Crush'
},
{
    id: 'surgeonfish', name: 'Blue Tang Surgeonfish', color: '#2563eb', accent: '#1d4ed8',
    size: 26, maxHp: 550, staminaMax: 400, attack: 50, speed: 4.0,
    value: 600, rarity: 'rare', shape: 'oval', finColor: '#1e40af',
    desc: 'Sharp tail spines. Cuts anything that threatens.',
    skills: ['spineVolley', 'dart', 'charge'], skillName: 'Scalpel Slash'
},
{
    id: 'butterflyfish', name: 'Copperband Butterflyfish', color: '#fbbf24', accent: '#f59e0b',
    size: 20, maxHp: 420, staminaMax: 310, attack: 42, speed: 4.2,
    value: 470, rarity: 'rare', shape: 'butterfly', finColor: '#d97706',
    desc: 'Elegant long-snout. Picks coral polyps.',
    skills: ['dart', 'flashBang', 'blink'], skillName: 'Elegant Peck'
},
{
    id: 'angelfish', name: 'Emperor Angelfish', color: '#f97316', accent: '#ea580c',
    size: 28, maxHp: 580, staminaMax: 420, attack: 52, speed: 3.8,
    value: 630, rarity: 'rare', shape: 'angelfish', finColor: '#c2410c',
    desc: 'Regal reef dweller. Bold and beautiful.',
    skills: ['flashBang', 'charge', 'spineVolley'], skillName: 'Imperial Charge'
},

// --- EPIC (25 new) ---
{
    id: 'bluefin_tuna', name: 'Atlantic Bluefin Tuna', color: '#1e40af', accent: '#1d4ed8',
    size: 48, maxHp: 1800, staminaMax: 950, attack: 125, speed: 6.5,
    value: 2200, rarity: 'epic', shape: 'tuna', finColor: '#1e3a8a',
    desc: 'Torpedo of the sea. Burns with raw power.',
    skills: ['charge', 'waterJet', 'tidalWave', 'blink'], skillName: 'Torpedo Strike'
},
{
    id: 'yellowfin_tuna', name: 'Yellowfin Tuna', color: '#fbbf24', accent: '#f59e0b',
    size: 44, maxHp: 1600, staminaMax: 850, attack: 115, speed: 6.0,
    value: 1900, rarity: 'epic', shape: 'tuna', finColor: '#d97706',
    desc: 'Yellow-finned speedster. Fights with endless stamina.',
    skills: ['charge', 'waterJet', 'rage', 'blink'], skillName: 'Yellowfin Blitz'
},
{
    id: 'bigeye_tuna', name: 'Bigeye Tuna', color: '#0ea5e9', accent: '#0284c7',
    size: 42, maxHp: 1500, staminaMax: 800, attack: 110, speed: 5.5,
    value: 1800, rarity: 'epic', shape: 'tuna', finColor: '#0369a1',
    desc: 'Deep-diving hunter. Big eyes for dark waters.',
    skills: ['charge', 'drain', 'waterJet', 'blink'], skillName: 'Deep Strike'
},
{
    id: 'marlin_black', name: 'Black Marlin', color: '#1f2937', accent: '#374151',
    size: 50, maxHp: 2000, staminaMax: 1050, attack: 135, speed: 6.8,
    value: 2500, rarity: 'epic', shape: 'swordfish', finColor: '#111827',
    desc: 'Fastest billfish. Jumps with explosive power.',
    skills: ['charge', 'blink', 'solarBeam', 'waterJet'], skillName: 'Black Lightning'
},
{
    id: 'marlin_striped', name: 'Striped Marlin', color: '#0ea5e9', accent: '#0284c7',
    size: 46, maxHp: 1750, staminaMax: 920, attack: 120, speed: 7.0,
    value: 2100, rarity: 'epic', shape: 'swordfish', finColor: '#0369a1',
    desc: 'Striped speedster. The acrobat of billfish.',
    skills: ['blink', 'charge', 'flashBang', 'waterJet'], skillName: 'Stripe Blitz'
},
{
    id: 'sailfish_atlantic', name: 'Atlantic Sailfish', color: '#1e40af', accent: '#1d4ed8',
    size: 44, maxHp: 1650, staminaMax: 880, attack: 118, speed: 7.5,
    value: 2000, rarity: 'epic', shape: 'swordfish', finColor: '#1e3a8a',
    desc: 'Fastest fish in the ocean. Sails to confuse prey.',
    skills: ['blink', 'charge', 'solarBeam', 'flashBang'], skillName: 'Sail Blitz'
},
{
    id: 'spearfish', name: 'Shortbill Spearfish', color: '#334155', accent: '#475569',
    size: 42, maxHp: 1550, staminaMax: 830, attack: 112, speed: 6.2,
    value: 1850, rarity: 'epic', shape: 'swordfish', finColor: '#1e293b',
    desc: 'Compact billfish. Fights with surprising ferocity.',
    skills: ['charge', 'dart', 'waterJet', 'rage'], skillName: 'Spear Thrust'
},
{
    id: 'tarpon_giant', name: 'Giant Tarpon', color: '#cbd5e1', accent: '#94a3b8',
    size: 46, maxHp: 1700, staminaMax: 900, attack: 115, speed: 5.8,
    value: 1950, rarity: 'epic', shape: 'oval', finColor: '#64748b',
    desc: 'Silver king of the flats. Breaches to shake hooks.',
    skills: ['blink', 'charge', 'waterJet', 'rage'], skillName: 'Silver King'
},
{
    id: 'amberjack', name: 'Greater Amberjack', color: '#a16207', accent: '#854d0e',
    size: 40, maxHp: 1450, staminaMax: 780, attack: 105, speed: 4.8,
    value: 1700, rarity: 'epic', shape: 'oval', finColor: '#713f12',
    desc: 'Reef bruiser. Pulls with relentless power.',
    skills: ['charge', 'rage', 'whirlpool', 'waterJet'], skillName: 'Reef Crush'
},
{
    id: 'dogtooth_tuna', name: 'Dogtooth Tuna', color: '#94a3b8', accent: '#64748b',
    size: 44, maxHp: 1650, staminaMax: 860, attack: 120, speed: 5.5,
    value: 1900, rarity: 'epic', shape: 'shark', finColor: '#475569',
    desc: 'Vicious teeth. Fights with pure aggression.',
    skills: ['charge', 'rage', 'drain', 'waterJet'], skillName: 'Dogtooth Fury'
},
{
    id: 'cubera_snapper', name: 'Cubera Snapper', color: '#b91c1c', accent: '#991b1b',
    size: 42, maxHp: 1550, staminaMax: 820, attack: 110, speed: 4.0,
    value: 1800, rarity: 'epic', shape: 'snapper', finColor: '#7f1d1d',
    desc: 'Large snapper. Crushes shells with molar teeth.',
    skills: ['charge', 'rage', 'mudSlime', 'waterJet'], skillName: 'Cubera Crush'
},
{
    id: 'mutton_snapper', name: 'Mutton Snapper', color: '#ef4444', accent: '#dc2626',
    size: 38, maxHp: 1400, staminaMax: 760, attack: 100, speed: 4.2,
    value: 1650, rarity: 'epic', shape: 'oval', finColor: '#b91c1c',
    desc: 'Powerful snapper. Fights dirty around structure.',
    skills: ['charge', 'mudSlime', 'waterJet'], skillName: 'Structure Strike'
},
{
    id: 'grouper_gag', name: 'Gag Grouper', color: '#a16207', accent: '#854d0e',
    size: 44, maxHp: 1600, staminaMax: 850, attack: 108, speed: 3.2,
    value: 1850, rarity: 'epic', shape: 'grouper', finColor: '#713f12',
    desc: 'Ambush predator. Swallows prey whole.',
    skills: ['inflate', 'drain', 'mudSlime', 'whirlpool'], skillName: 'Ambush Gulp'
},
{
    id: 'grouper_goliath', name: 'Goliath Grouper', color: '#57534e', accent: '#44403c',
    size: 50, maxHp: 1900, staminaMax: 1000, attack: 125, speed: 2.5,
    value: 2300, rarity: 'epic', shape: 'grouper', finColor: '#292524',
    desc: 'Gentle giant. Can swallow a diver whole.',
    skills: ['inflate', 'drain', 'whirlpool', 'mudSlime'], skillName: 'Goliath Gulp'
},
{
    id: 'cobia', name: 'Cobia', color: '#78716c', accent: '#57534e',
    size: 42, maxHp: 1500, staminaMax: 800, attack: 105, speed: 4.5,
    value: 1750, rarity: 'epic', shape: 'shark', finColor: '#44403c',
    desc: 'Curious and powerful. Rides rays and turtles.',
    skills: ['charge', 'waterJet', 'rage', 'drain'], skillName: 'Cobia Crush'
},
{
    id: 'kingfish', name: 'King Mackerel', color: '#1e40af', accent: '#1d4ed8',
    size: 40, maxHp: 1400, staminaMax: 760, attack: 102, speed: 6.0,
    value: 1700, rarity: 'epic', shape: 'oval', finColor: '#1e3a8a',
    desc: 'Speedster mackerel. Razor-sharp teeth.',
    skills: ['charge', 'dart', 'waterJet', 'blink'], skillName: 'King Blitz'
},
{
    id: 'wahoo_giant', name: 'Giant Wahoo', color: '#0f172a', accent: '#334155',
    size: 44, maxHp: 1550, staminaMax: 830, attack: 112, speed: 6.5,
    value: 1850, rarity: 'epic', shape: 'eel', finColor: '#020617',
    desc: 'Fastest of the mackerels. Cuts lines with ease.',
    skills: ['charge', 'dart', 'waterJet', 'blink'], skillName: 'Wahoo Slash'
},
{
    id: 'barracuda_giant', name: 'Great Barracuda', color: '#334155', accent: '#475569',
    size: 44, maxHp: 1500, staminaMax: 800, attack: 110, speed: 6.2,
    value: 1800, rarity: 'epic', shape: 'eel', finColor: '#1e293b',
    desc: 'Needle-toothed ambusher. Strikes like lightning.',
    skills: ['charge', 'dart', 'camouflaged', 'blink'], skillName: 'Ambush Slash'
},
{
    id: 'rainbow_runner', name: 'Rainbow Runner', color: '#fbbf24', accent: '#f59e0b',
    size: 36, maxHp: 1300, staminaMax: 720, attack: 95, speed: 5.8,
    value: 1550, rarity: 'epic', shape: 'oval', finColor: '#d97706',
    desc: 'Colorful speedster. Fast and flashy.',
    skills: ['dart', 'charge', 'flashBang', 'blink'], skillName: 'Rainbow Blitz'
},
{
    id: 'pompano', name: 'Florida Pompano', color: '#f5f5f4', accent: '#e7e5e4',
    size: 34, maxHp: 1250, staminaMax: 700, attack: 92, speed: 4.8,
    value: 1480, rarity: 'epic', shape: 'oval', finColor: '#d6d3d1',
    desc: 'Buttery fighter. Prized for both sport and table.',
    skills: ['charge', 'dart', 'waterJet'], skillName: 'Pompano Run'
},
{
    id: 'jack_crevalle', name: 'Crevalle Jack', color: '#fbbf24', accent: '#f59e0b',
    size: 38, maxHp: 1350, staminaMax: 740, attack: 98, speed: 5.2,
    value: 1600, rarity: 'epic', shape: 'oval', finColor: '#d97706',
    desc: 'Relentless fighter. Never gives up.',
    skills: ['charge', 'rage', 'waterJet', 'whirlpool'], skillName: 'Relentless Run'
},
{
    id: 'jack_horse_eye', name: 'Horse-eye Jack', color: '#0ea5e9', accent: '#0284c7',
    size: 36, maxHp: 1280, staminaMax: 710, attack: 95, speed: 5.0,
    value: 1520, rarity: 'epic', shape: 'oval', finColor: '#0369a1',
    desc: 'Big-eyed jack. Travels in marauding schools.',
    skills: ['charge', 'dart', 'waterJet', 'blink'], skillName: 'School Strike'
},
{
    id: 'bluefish', name: 'Bluefish', color: '#2563eb', accent: '#1d4ed8',
    size: 34, maxHp: 1250, staminaMax: 690, attack: 100, speed: 5.5,
    value: 1500, rarity: 'epic', shape: 'oval', finColor: '#1e40af',
    desc: 'Vicious predator. Attacks in feeding frenzies.',
    skills: ['charge', 'rage', 'dart', 'waterJet'], skillName: 'Feeding Frenzy'
},
{
    id: 'striped_bass', name: 'Striped Bass', color: '#94a3b8', accent: '#64748b',
    size: 38, maxHp: 1350, staminaMax: 740, attack: 98, speed: 4.5,
    value: 1580, rarity: 'epic', shape: 'oval', finColor: '#475569',
    desc: 'Striped warrior. Fights hard in currents.',
    skills: ['charge', 'waterJet', 'whirlpool', 'rage'], skillName: 'Striper Run'
},
{
    id: 'muskie', name: 'Muskellunge', color: '#4d7c0f', accent: '#3f6212',
    size: 42, maxHp: 1500, staminaMax: 810, attack: 108, speed: 5.0,
    value: 1750, rarity: 'epic', shape: 'pike', finColor: '#365314',
    desc: 'Freshwater apex predator. Teeth like needles.',
    skills: ['charge', 'camouflaged', 'drain', 'waterJet'], skillName: 'Muskie Ambush'
},
{
    id: 'northern_pike', name: 'Northern Pike', color: '#65a30d', accent: '#4d7c0f',
    size: 40, maxHp: 1400, staminaMax: 770, attack: 102, speed: 4.8,
    value: 1680, rarity: 'epic', shape: 'pike', finColor: '#3f6212',
    desc: 'Ambush predator of cold waters. Razor teeth.',
    skills: ['charge', 'camouflaged', 'drain', 'blink'], skillName: 'Pike Ambush'
},

// --- LEGENDARY (25 new) ---
{
    id: 'bluefin_tuna_giant', name: 'Giant Bluefin Tuna', color: '#1e3a8a', accent: '#1e40af',
    size: 56, maxHp: 3200, staminaMax: 1600, attack: 165, speed: 5.5,
    value: 5500, rarity: 'legendary', shape: 'shark', finColor: '#172554',
    desc: 'Record-breaking torpedo. Fights for hours.',
    skills: ['charge', 'tsunami', 'tidalWave', 'blink', 'drain'], skillName: 'Record Breaker'
},
{
    id: 'marlin_blue_giant', name: 'Giant Blue Marlin', color: '#1e40af', accent: '#1d4ed8',
    size: 58, maxHp: 3500, staminaMax: 1750, attack: 175, speed: 6.5,
    value: 6000, rarity: 'legendary', shape: 'swordfish', finColor: '#1e3a8a',
    desc: 'The ultimate billfish. Jumps with terrifying power.',
    skills: ['blink', 'charge', 'solarBeam', 'tsunami', 'drain'], skillName: 'Blue Lightning'
},
{
    id: 'swordfish_giant', name: 'Giant Swordfish', color: '#475569', accent: '#334155',
    size: 56, maxHp: 3400, staminaMax: 1700, attack: 170, speed: 6.0,
    value: 5800, rarity: 'legendary', shape: 'swordfish', finColor: '#1e293b',
    desc: 'Deep-diving gladiator. Bill pierces steel.',
    skills: ['charge', 'blink', 'solarBeam', 'waterJet', 'drain'], skillName: 'Gladiator Thrust'
},
{
    id: 'tuna_giant', name: 'Atlantic Giant Tuna', color: '#1e40af', accent: '#1d4ed8',
    size: 60, maxHp: 3800, staminaMax: 1900, attack: 180, speed: 5.0,
    value: 6500, rarity: 'legendary', shape: 'shark', finColor: '#1e3a8a',
    desc: 'Thousand-pound torpedo. A fish of legends.',
    skills: ['charge', 'tsunami', 'tidalWave', 'drain', 'rage'], skillName: 'Thousand Pounder'
},
{
    id: 'sturgeon', name: 'Beluga Sturgeon', color: '#78716c', accent: '#57534e',
    size: 62, maxHp: 4200, staminaMax: 2100, attack: 155, speed: 3.5,
    value: 7000, rarity: 'legendary', shape: 'sturgeon', finColor: '#44403c',
    desc: 'Living fossil. Armored and ancient.',
    skills: ['charge', 'tsunami', 'whirlpool', 'drain', 'inflate'], skillName: 'Ancient Armor'
},
{
    id: 'sturgeon_white', name: 'White Sturgeon', color: '#a8a29e', accent: '#78716c',
    size: 58, maxHp: 3800, staminaMax: 1900, attack: 148, speed: 3.8,
    value: 6500, rarity: 'legendary', shape: 'sturgeon', finColor: '#57534e',
    desc: 'Freshwater giant. Leaps like a missile.',
    skills: ['charge', 'tsunami', 'blink', 'drain', 'whirlpool'], skillName: 'River Leap'
},
{
    id: 'alligator_gar', name: 'Alligator Gar', color: '#4d7c0f', accent: '#3f6212',
    size: 54, maxHp: 3500, staminaMax: 1750, attack: 160, speed: 3.2,
    value: 6000, rarity: 'legendary', shape: 'eel', finColor: '#365314',
    desc: 'Armored predator with interlocking scales.',
    skills: ['charge', 'camouflaged', 'drain', 'spineVolley', 'rage'], skillName: 'Armored Ambush'
},
{
    id: 'arapaima', name: 'Arapaima', color: '#0d9488', accent: '#115e59',
    size: 58, maxHp: 4000, staminaMax: 2000, attack: 158, speed: 4.0,
    value: 6800, rarity: 'legendary', shape: 'shark', finColor: '#042f2e',
    desc: 'Amazonian giant. Breathes air, smashes boats.',
    skills: ['charge', 'tsunami', 'inflate', 'drain', 'rage'], skillName: 'Amazon Smash'
},
{
    id: 'piraiba', name: 'Piraíba Catfish', color: '#57534e', accent: '#44403c',
    size: 60, maxHp: 4100, staminaMax: 2050, attack: 152, speed: 3.0,
    value: 6900, rarity: 'legendary', shape: 'catfish', finColor: '#292524',
    desc: 'Largest catfish. Swallows prey whole.',
    skills: ['drain', 'whirlpool', 'mudSlime', 'tsunami', 'inflate'], skillName: 'River Devour'
},
{
    id: 'wels_catfish', name: 'Wels Catfish', color: '#78716c', accent: '#57534e',
    size: 56, maxHp: 3600, staminaMax: 1800, attack: 150, speed: 3.2,
    value: 6200, rarity: 'legendary', shape: 'catfish', finColor: '#44403c',
    desc: 'European monster. Allegedly eats swimmers.',
    skills: ['drain', 'whirlpool', 'mudSlime', 'charge', 'inflate'], skillName: 'Monster Devour'
},
{
    id: 'mekong_catfish', name: 'Mekong Giant Catfish', color: '#a8a29e', accent: '#78716c',
    size: 62, maxHp: 4300, staminaMax: 2150, attack: 155, speed: 3.0,
    value: 7200, rarity: 'legendary', shape: 'catfish', finColor: '#57534e',
    desc: 'Gentle giant of the Mekong. Critically endangered.',
    skills: ['drain', 'tsunami', 'whirlpool', 'mudSlime', 'inflate'], skillName: 'Mekong Crush'
},
{
    id: 'giant_mekong', name: 'Giant Pangasius', color: '#94a3b8', accent: '#64748b',
    size: 56, maxHp: 3700, staminaMax: 1850, attack: 145, speed: 3.5,
    value: 6400, rarity: 'legendary', shape: 'shark', finColor: '#475569',
    desc: 'Massive migratory catfish. Disappearing fast.',
    skills: ['charge', 'drain', 'tsunami', 'whirlpool'], skillName: 'Migration Run'
},
{
    id: 'coelacanth', name: 'Coelacanth', color: '#1e40af', accent: '#1d4ed8',
    size: 52, maxHp: 3300, staminaMax: 1650, attack: 145, speed: 3.2,
    value: 8000, rarity: 'legendary', shape: 'spiky', finColor: '#1e3a8a',
    desc: 'Living fossil thought extinct. Prehistoric fighter.',
    skills: ['drain', 'timeWarp', 'whirlpool', 'voidPull', 'shock'], skillName: 'Living Fossil'
},
{
    id: 'oarfish', name: 'Giant Oarfish', color: '#cbd5e1', accent: '#94a3b8',
    size: 68, maxHp: 3500, staminaMax: 1750, attack: 140, speed: 3.8,
    value: 7500, rarity: 'legendary', shape: 'oarfish', finColor: '#64748b',
    desc: 'Doomsday fish. Ribbon of the deep.',
    skills: ['charge', 'voidPull', 'blink', 'drain', 'tsunami'], skillName: 'Doomsday Ribbon'
},
{
    id: 'megamouth', name: 'Megamouth Shark', color: '#78716c', accent: '#57534e',
    size: 58, maxHp: 3800, staminaMax: 1900, attack: 148, speed: 3.5,
    value: 7000, rarity: 'legendary', shape: 'shark', finColor: '#44403c',
    desc: 'Rare filter feeder. Mouth like a cave.',
    skills: ['drain', 'whirlpool', 'tsunami', 'camouflaged'], skillName: 'Cave Mouth'
},
{
    id: 'basking_shark', name: 'Basking Shark', color: '#64748b', accent: '#475569',
    size: 64, maxHp: 4000, staminaMax: 2000, attack: 145, speed: 2.8,
    value: 6800, rarity: 'legendary', shape: 'shark', finColor: '#334155',
    desc: 'Second largest fish. Gentle giant of the surface.',
    skills: ['drain', 'tsunami', 'whirlpool', 'inflate'], skillName: 'Basking Crush'
},
{
    id: 'whale_shark_juv', name: 'Juvenile Whale Shark', color: '#94a3b8', accent: '#64748b',
    size: 66, maxHp: 4400, staminaMax: 2200, attack: 150, speed: 3.0,
    value: 7200, rarity: 'legendary', shape: 'shark', finColor: '#475569',
    desc: 'Spotted giant. Still growing into its size.',
    skills: ['drain', 'tsunami', 'whirlpool', 'charge'], skillName: 'Gentle Giant'
},
{
    id: 'manta_giant', name: 'Giant Oceanic Manta', color: '#334155', accent: '#1e293b',
    size: 60, maxHp: 3600, staminaMax: 1800, attack: 142, speed: 4.2,
    value: 6600, rarity: 'legendary', shape: 'manta', finColor: '#0f172a',
    desc: 'Wingspan of a small plane. Glides with grace.',
    skills: ['blink', 'whirlpool', 'voidPull', 'tsunami', 'drain'], skillName: 'Ocean Glide'
},
{
    id: 'devil_ray', name: 'Giant Devil Ray', color: '#1f2937', accent: '#374151',
    size: 56, maxHp: 3400, staminaMax: 1700, attack: 148, speed: 4.5,
    value: 6400, rarity: 'legendary', shape: 'manta', finColor: '#111827',
    desc: 'Horns and speed. Leaps like a missile.',
    skills: ['blink', 'charge', 'tsunami', 'voidPull', 'drain'], skillName: 'Devil Leap'
},
{
    id: 'sawfish', name: 'Largetooth Sawfish', color: '#78716c', accent: '#57534e',
    size: 58, maxHp: 3700, staminaMax: 1850, attack: 155, speed: 3.5,
    value: 6800, rarity: 'legendary', shape: 'ray', finColor: '#44403c',
    desc: 'Rostrum lined with teeth. Slashes side to side.',
    skills: ['charge', 'spineVolley', 'tsunami', 'drain', 'rage'], skillName: 'Saw Slash'
},
{
    id: 'guitarfish', name: 'Giant Guitarfish', color: '#a8a29e', accent: '#78716c',
    size: 54, maxHp: 3500, staminaMax: 1750, attack: 145, speed: 3.8,
    value: 6300, rarity: 'legendary', shape: 'ray', finColor: '#57534e',
    desc: 'Shark-ray hybrid. Strange and powerful.',
    skills: ['charge', 'camouflaged', 'whirlpool', 'drain'], skillName: 'Hybrid Strike'
},
{
    id: 'electric_eel_giant', name: 'Giant Electric Eel', color: '#fbbf24', accent: '#f59e0b',
    size: 54, maxHp: 3400, staminaMax: 1700, attack: 150, speed: 4.0,
    value: 6500, rarity: 'legendary', shape: 'eel', finColor: '#d97706',
    desc: 'Living battery. Discharges lethal voltage.',
    skills: ['shock', 'stormSpiral', 'zapOrb', 'drain', 'supernova'], skillName: 'Living Battery'
},
{
    id: 'giant_squid', name: 'Giant Squid', color: '#dc2626', accent: '#b91c1c',
    size: 56, maxHp: 3600, staminaMax: 1800, attack: 152, speed: 4.5,
    value: 6800, rarity: 'legendary', shape: 'kraken', finColor: '#991b1b',
    desc: 'Elusive deep-sea hunter. Eyes the size of dinner plates.',
    skills: ['inkCloud', 'voidPull', 'tentacleSlam', 'drain', 'blink'], skillName: 'Deep Ambush'
},
{
    id: 'colossal_squid', name: 'Colossal Squid', color: '#b91c1c', accent: '#991b1b',
    size: 60, maxHp: 3900, staminaMax: 1950, attack: 158, speed: 4.2,
    value: 7200, rarity: 'legendary', shape: 'kraken', finColor: '#7f1d1d',
    desc: 'Heavier than a giant squid. Hooks on tentacles.',
    skills: ['inkCloud', 'voidPull', 'tentacleSlam', 'drain', 'tsunami'], skillName: 'Colossal Crush'
},

// --- MYTHIC (20 new) ---
{
    id: 'megalodon_alpha', name: 'Alpha Megalodon', color: '#0f172a', accent: '#334155',
    size: 78, maxHp: 12000, staminaMax: 3500, attack: 380, speed: 4.5,
    value: 35000, rarity: 'mythic', shape: 'shark', finColor: '#020617',
    desc: 'The apex of apex predators. Jaws of extinction.',
    skills: ['charge', 'tsunami', 'inferno', 'supernova', 'drain', 'cataclysm'], skillName: 'Extinction'
},
{
    id: 'liopleurodon', name: 'Liopleurodon', color: '#1e40af', accent: '#1d4ed8',
    size: 76, maxHp: 11500, staminaMax: 3400, attack: 370, speed: 4.2,
    value: 33000, rarity: 'mythic', shape: 'shark', finColor: '#1e3a8a',
    desc: 'Prehistoric marine reptile. Tore whales in half.',
    skills: ['charge', 'tsunami', 'drain', 'supernova', 'cataclysm'], skillName: 'Prehistoric Terror'
},
{
    id: 'basilosaurus', name: 'Basilosaurus', color: '#0d9488', accent: '#115e59',
    size: 80, maxHp: 13000, staminaMax: 3800, attack: 390, speed: 3.8,
    value: 38000, rarity: 'mythic', shape: 'eel', finColor: '#042f2e',
    desc: 'Ancient whale-serpent. King of prehistoric seas.',
    skills: ['drain', 'tsunami', 'supernova', 'cataclysm', 'cosmicStorm'], skillName: 'Ancient King'
},
{
    id: 'mosasaurus', name: 'Mosasaurus', color: '#065f46', accent: '#047857',
    size: 78, maxHp: 12500, staminaMax: 3600, attack: 385, speed: 4.0,
    value: 36000, rarity: 'mythic', shape: 'shark', finColor: '#064e3b',
    desc: 'Apex predator of the Cretaceous. Crushes anything.',
    skills: ['charge', 'tsunami', 'drain', 'supernova', 'cataclysm'], skillName: 'Cretaceous Crush'
},
{
    id: 'dunkleosteus', name: 'Dunkleosteus', color: '#78716c', accent: '#57534e',
    size: 74, maxHp: 11000, staminaMax: 3200, attack: 375, speed: 4.2,
    value: 32000, rarity: 'mythic', shape: 'prehistoric', finColor: '#44403c',
    desc: 'Armored skull. Bite force of a tank shell.',
    skills: ['charge', 'inflate', 'tsunami', 'drain', 'cataclysm'], skillName: 'Armored Extinction'
},
{
    id: 'xiphactinus', name: 'Xiphactinus', color: '#64748b', accent: '#475569',
    size: 72, maxHp: 10500, staminaMax: 3100, attack: 365, speed: 5.5,
    value: 30000, rarity: 'mythic', shape: 'eel', finColor: '#334155',
    desc: 'Prehistoric bulldog fish. Swallowed prey whole.',
    skills: ['charge', 'drain', 'tsunami', 'supernova', 'blink'], skillName: 'Bulldog Devour'
},
{
    id: 'helicoprion', name: 'Helicoprion', color: '#0ea5e9', accent: '#0284c7',
    size: 70, maxHp: 10000, staminaMax: 3000, attack: 360, speed: 4.0,
    value: 28000, rarity: 'mythic', shape: 'shark', finColor: '#0369a1',
    desc: 'Buzzsaw shark. Tooth whorl shreds everything.',
    skills: ['charge', 'spineVolley', 'tsunami', 'drain', 'cataclysm'], skillName: 'Buzzsaw'
},
{
    id: 'leviathan_whale', name: 'Leviathan Whale', color: '#1e40af', accent: '#1d4ed8',
    size: 88, maxHp: 15000, staminaMax: 4200, attack: 400, speed: 3.0,
    value: 45000, rarity: 'mythic', shape: 'shark', finColor: '#1e3a8a',
    desc: 'Living island. One tail sweep sinks ships.',
    skills: ['tsunami', 'tidalCrush', 'drain', 'cataclysm', 'supernova'], skillName: 'Island Breaker'
},
{
    id: 'kraken_ancient', name: 'Ancient Kraken', color: '#6b21a8', accent: '#581c87',
    size: 86, maxHp: 14000, staminaMax: 4000, attack: 395, speed: 3.5,
    value: 42000, rarity: 'mythic', shape: 'kraken', finColor: '#3b0764',
    desc: 'First of its kind. Wrapped around the world.',
    skills: ['summonVoidlings', 'tidalCrush', 'voidCollapse', 'cosmicStorm', 'cataclysm'], skillName: 'World Coil'
},
{
    id: 'cthulhu', name: 'Cthulhu Spawn', color: '#7c3aed', accent: '#4c1d95',
    size: 84, maxHp: 13500, staminaMax: 3900, attack: 390, speed: 3.8,
    value: 40000, rarity: 'mythic', shape: 'kraken', finColor: '#2e1065',
    desc: 'That which sleeps in R\'lyeh. Nightmare made flesh.',
    skills: ['summonShades', 'voidCollapse', 'gravitationalPull', 'cataclysm', 'timeWarp'], skillName: 'R\'lyeh Rising'
},
{
    id: 'jormungandr', name: 'Jörmungandr', color: '#10b981', accent: '#047857',
    size: 82, maxHp: 13000, staminaMax: 3800, attack: 388, speed: 4.0,
    value: 38000, rarity: 'mythic', shape: 'serpent', finColor: '#065f46',
    desc: 'World serpent. Circles the mortal realm.',
    skills: ['chainLightning', 'stormField', 'tidalCrush', 'cataclysm', 'cosmicStorm'], skillName: 'World Serpent'
},
{
    id: 'yamata_no_orochi', name: 'Yamata no Orochi', color: '#dc2626', accent: '#b91c1c',
    size: 80, maxHp: 12500, staminaMax: 3700, attack: 385, speed: 4.2,
    value: 36000, rarity: 'mythic', shape: 'serpent', finColor: '#991b1b',
    desc: 'Eight-headed serpent. Each head a storm.',
    skills: ['summonStormOrbs', 'chainLightning', 'firestormNova', 'supernova', 'cataclysm'], skillName: 'Eight Head Fury'
},
{
    id: 'tiamat', name: 'Tiamat', color: '#7c3aed', accent: '#4c1d95',
    size: 86, maxHp: 14500, staminaMax: 4100, attack: 398, speed: 3.5,
    value: 44000, rarity: 'mythic', shape: 'dragon', finColor: '#2e1065',
    desc: 'Primordial dragon of chaos. Mother of monsters.',
    skills: ['inferno', 'cosmicStorm', 'voidCollapse', 'supernova', 'cataclysm'], skillName: 'Chaos Primeval'
},
{
    id: 'shenlong', name: 'Shenlong', color: '#10b981', accent: '#047857',
    size: 84, maxHp: 13800, staminaMax: 3950, attack: 392, speed: 4.5,
    value: 41000, rarity: 'mythic', shape: 'dragon', finColor: '#065f46',
    desc: 'Eternal dragon. Grants wishes to the worthy.',
    skills: ['solarBeam', 'cosmicStorm', 'timeWarp', 'supernova', 'cataclysm'], skillName: 'Eternal Dragon'
},
{
    id: 'bahamut', name: 'Bahamut', color: '#fbbf24', accent: '#f59e0b',
    size: 88, maxHp: 15200, staminaMax: 4300, attack: 405, speed: 4.0,
    value: 48000, rarity: 'mythic', shape: 'dragon', finColor: '#d97706',
    desc: 'King of dragons. His roar shatters mountains.',
    skills: ['inferno', 'supernova', 'solarBeam', 'cataclysm', 'cosmicStorm'], skillName: 'Dragon King'
},
{
    id: 'midgardsormr', name: 'Miðgarðsormr', color: '#0ea5e9', accent: '#0284c7',
    size: 82, maxHp: 13200, staminaMax: 3850, attack: 390, speed: 3.8,
    value: 39000, rarity: 'mythic', shape: 'serpent', finColor: '#0369a1',
    desc: 'Norse world serpent. Bites its own tail.',
    skills: ['chainLightning', 'stormField', 'voidCollapse', 'cataclysm', 'supernova'], skillName: 'Ouroboros'
},
{
    id: 'apep', name: 'Apep', color: '#1f2937', accent: '#374151',
    size: 80, maxHp: 12800, staminaMax: 3750, attack: 387, speed: 4.0,
    value: 37000, rarity: 'mythic', shape: 'serpent', finColor: '#111827',
    desc: 'Serpent of chaos. Swallows the sun.',
    skills: ['voidPull', 'voidCollapse', 'cosmicStorm', 'cataclysm', 'supernova'], skillName: 'Sun Devourer'
},
{
    id: 'leviathan_biblical', name: 'Leviathan (Biblical)', color: '#1e40af', accent: '#1d4ed8',
    size: 90, maxHp: 16000, staminaMax: 4500, attack: 410, speed: 3.2,
    value: 52000, rarity: 'mythic', shape: 'dragon', finColor: '#1e3a8a',
    desc: 'The primordial sea monster. None can tame it.',
    skills: ['tsunami', 'tidalCrush', 'drain', 'cataclysm', 'supernova'], skillName: 'Primordial Sea'
},
{
    id: 'behemoth', name: 'Behemoth', color: '#a16207', accent: '#854d0e',
    size: 86, maxHp: 15500, staminaMax: 4400, attack: 408, speed: 2.8,
    value: 50000, rarity: 'mythic', shape: 'spiky', finColor: '#713f12',
    desc: 'Land and sea titan. Moves mountains.',
    skills: ['tidalCrush', 'cataclysm', 'supernova', 'gravitationalPull', 'tsunami'], skillName: 'Earth Shaker'
},
{
    id: 'ziz', name: 'Ziz', color: '#fde047', accent: '#eab308',
    size: 84, maxHp: 14200, staminaMax: 4050, attack: 395, speed: 5.0,
    value: 43000, rarity: 'mythic', shape: 'manta', finColor: '#ca8a04',
    desc: 'Sky titan. Its wingspan blocks the sun.',
    skills: ['stormField', 'chainLightning', 'solarBeam', 'cataclysm', 'supernova'], skillName: 'Sky Block'
},
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
        value: 640, rarity: 'rare', shape: 'lionfish', finColor: '#9f1239',
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
        value: 75, rarity: 'common', shape: 'bass', finColor: '#059669',
        desc: 'Aggressive freshwater swimmer.',
        skills: ['waterJet', 'dart'], skillName: 'Water Jet / Dart'
    },
    {
        id: 'snapper', name: 'Razor Snapper', color: '#f87171', accent: '#ef4444',
        size: 22, maxHp: 280, staminaMax: 240, attack: 32, speed: 4.5,
        value: 160, rarity: 'common', shape: 'snapper', finColor: '#dc2626',
        desc: 'Fast. Rages furiously when hooked.',
        skills: ['rage', 'waterJet'], skillName: 'Rage / Water Jet'
    },
    {
        id: 'catfish', name: 'Armored Catfish', color: '#854d0e', accent: '#a16207',
        size: 24, maxHp: 420, staminaMax: 300, attack: 28, speed: 2.8,
        value: 220, rarity: 'common', shape: 'catfish', finColor: '#713f12',
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
        value: 750, rarity: 'rare', shape: 'angler', finColor: '#4d7c0f',
        desc: 'Spits venomous fluid and blinds with flash bursts.',
        skills: ['poisonSpit', 'flashBang', 'drain'], skillName: 'Poison Spray / Flash'
    },
    {
        id: 'prism_squid', name: 'Prism Squid', color: '#f472b6', accent: '#db2777',
        size: 25, maxHp: 680, staminaMax: 390, attack: 58, speed: 4.6,
        value: 620, rarity: 'rare', shape: 'squid', finColor: '#be185d',
        desc: 'Blinds with shimmering ink and warps across positions.',
        skills: ['blink', 'flashBang', 'poisonSpit'], skillName: 'Prism Flash / Warp Ink'
    },

    // --- EPIC (BOSS TIER 1) ---
    {
        id: 'shark', name: 'Hammerhead Shark', color: '#94a3b8', accent: '#64748b',
        size: 38, maxHp: 1200, staminaMax: 650, attack: 95, speed: 4.2,
        value: 1250, rarity: 'epic', shape: 'hammerhead', finColor: '#475569',
        desc: 'Brutal predator. Charges violently and fires shockwaves.',
        skills: ['charge', 'waterJet', 'tidalWave', 'rage'], skillName: 'Charge / Tidal Wave'
    },
    {
        id: 'magma_pike', name: 'Infernal Pike', color: '#ea580c', accent: '#c2410c',
        size: 36, maxHp: 1450, staminaMax: 720, attack: 110, speed: 5.5,
        value: 1600, rarity: 'epic', shape: 'pike', finColor: '#9a3412',
        desc: 'Burns with intense fire, shooting magma blasts and fire rings.',
        skills: ['inferno', 'magmaShower', 'shock', 'dart'], skillName: 'Magma Blast / Shower'
    },
    {
        id: 'ghost_ray', name: 'Phantom Ray', color: '#cbd5e1', accent: '#94a3b8',
        size: 40, maxHp: 1350, staminaMax: 800, attack: 85, speed: 4.6,
        value: 1800, rarity: 'epic', shape: 'ray', finColor: '#64748b',
        desc: 'Fades into camouflage while ambushing with void shots.',
        skills: ['camouflaged', 'voidPull', 'blink', 'drain'], skillName: 'Camouflage / Void Orb'
    },
    {
        id: 'frost_manta', name: 'Glacial Manta', color: '#67e8f9', accent: '#0891b2',
        size: 42, maxHp: 1500, staminaMax: 750, attack: 100, speed: 4.0,
        value: 1950, rarity: 'epic', shape: 'manta', finColor: '#0e7490',
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
        value: 5800, rarity: 'legendary', shape: 'serpent', finColor: '#065f46',
        desc: 'Unleashes spiraling electric storms and localized whirlpools.',
        skills: ['zapOrb', 'stormSpiral', 'shock', 'tsunami', 'rage'],
        skillName: 'Storm Spiral / Zap Barrage'
    },

    // --- MYTHIC (WORLD BOSS TIER) ---
    {
        id: 'void_drake', name: 'Void Serpent', color: '#6b21a8', accent: '#581c87',
        size: 60, maxHp: 5000, staminaMax: 2000, attack: 220, speed: 4.2,
        value: 9500, rarity: 'mythic', shape: 'serpent', finColor: '#3b0764',
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
        value: 15000, rarity: 'mythic', shape: 'squid', finColor: '#0369a1',
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
        size: 78, maxHp: 36000, staminaMax: 8000, attack: 340, speed: 3.0,
        value: 55000,
        rarity: 'boss',
        shape: 'kraken',
        finColor: '#0c4a6e',
        desc: 'A chanting horror from the deep. Summons shades and calls tidal waves.',
        skills: ['summonShades', 'tidalCrush', 'bossWhirlpool', 'leviathanRoar'],
        skillName: 'Summon / Tide / Roar',
        isBoss: true,
        image: 'leviathan_priest',
        // Sea (hooked) vs land split: triggerSkill rolls seaSkills,
        // Combat.pickSkill rolls landSkills for the shore body.
        seaSkills: ['abyssalChant', 'coralMortar', 'phantomEels', 'heartbeatBurst', 'summonShades', 'tidalCrush', 'bossWhirlpool', 'leviathanRoar'],
        landSkills: ['scytheSlash', 'slamSpikes', 'heartOverload', 'tidalCrush', 'leviathanRoar', 'summonShades']
    },
    {
        id: 'stormlord_hydra',
        name: 'Stormlord Hydra',
        color: '#10b981', accent: '#047857',
        size: 74, maxHp: 52000, staminaMax: 9000, attack: 470, speed: 3.6,
        value: 62000,
        rarity: 'boss',
        shape: 'serpent',
        finColor: '#064e3b',
        desc: 'NINE heads, one storm. Lightning from the sky, a roar that calls the sea, rift bites, grasping tides and venom.',
        skills: ['hydraLightning', 'hydraRoar', 'hydraBiteSea', 'hydraTether', 'hydraVenom', 'hydraStormOrb', 'danmakuSpiral', 'danmakuFan'],
        skillName: 'Stormcall / Ocean Roar / Rift Bite / Grasp / Venom / Storm Orb',
        isBoss: true,
        image: 'stormlord_hydra',
        heads: 9
    },
    {
        id: 'void_shepherd',
        name: 'Void Leviathan',
        color: '#1e293b', accent: '#22d3ee',
        aura2: '#a855f7',
        size: 104, maxHp: 48000, staminaMax: 10000, attack: 420, speed: 3.2,
        value: 78000,
        rarity: 'boss',
        shape: 'serpent',
        finColor: '#0f172a',
        image: 'void_shepherd',
        desc: 'The Star-Eater. Unholy catch from the void — spits stars, breaches beaches and eats space itself.',
        skills: ['voidSpitting', 'voidBarrage', 'abyssalGeyser', 'voidTentacle', 'realityShear', 'voidPit', 'starRain', 'cosmicBlast', 'phaseBarrage', 'voidStarEaterOrb'],
        skillName: 'Spit / Barrage / Geyser / Tentacles / Shear / Pits / Rain / Blast / Frenzy / Star-Eater Orb',
        isBoss: true
    },
    {
        id: 'crimson_emperor',
        name: 'Crimson Emperor',
        color: '#dc2626', accent: '#f59e0b',
        size: 82, maxHp: 54000, staminaMax: 11000, attack: 460, speed: 3.4,
        value: 92000,
        rarity: 'boss',
        shape: 'dragon',
        finColor: '#7f1d1d',
        desc: 'Sovereign of the Blood Tides. Breaches, roars, charges and mutates — three phases of carnage.',
        skills: ['crimsonBreach', 'tailSlapWave', 'homingBubbles', 'abyssalCharge', 'crimsonMaelstrom', 'goreBarbs', 'tentacleSlam', 'bloodBeam', 'sovereignBite'],
        skillName: 'Breach / Tails / Bubbles / Charge / Maelstrom / Barbs / Slam / Beam / Bite',
        isBoss: true
    },

    // ============================================================
    //  NEW FISH SPECIES (20 Additional Species)
    // ============================================================
    // COMMON (4)
    {
        id: 'anchovy', name: 'Glitter Anchovy', color: '#e2e8f0', accent: '#94a3b8',
        size: 10, maxHp: 100, staminaMax: 80, attack: 10, speed: 5.5,
        value: 50, rarity: 'common', shape: 'anchovy', finColor: '#64748b',
        desc: 'Tiny but blindingly fast. Swims in schools.',
        skills: ['dart'], skillName: 'Quick Dart'
    },
    {
        id: 'mudskipper', name: 'Mudskipper', color: '#78716c', accent: '#57534e',
        size: 16, maxHp: 180, staminaMax: 140, attack: 16, speed: 3.0,
        value: 80, rarity: 'common', shape: 'oval', finColor: '#44403c',
        desc: 'Can breathe on land. Hops unpredictably.',
        skills: ['blink', 'mudSlime'], skillName: 'Hop / Mud Slime'
    },
    {
        id: 'guppy', name: 'Fancy Guppy', color: '#fce7f3', accent: '#f472b6',
        size: 8, maxHp: 80, staminaMax: 60, attack: 8, speed: 4.8,
        value: 40, rarity: 'common', shape: 'goldfish', finColor: '#ec4899',
        desc: 'Colorful and elusive. Hard to hit due to size.',
        skills: ['flashBang', 'dart'], skillName: 'Dazzle / Dart'
    },
    {
        id: 'minnow', name: 'Silver Minnow', color: '#f1f5f9', accent: '#cbd5e1',
        size: 9, maxHp: 90, staminaMax: 70, attack: 9, speed: 5.2,
        value: 45, rarity: 'common', shape: 'minnow', finColor: '#94a3b8',
        desc: 'Shimmering bait fish. Often attracts predators.',
        skills: ['waterJet', 'dart'], skillName: 'Splash / Dart'
    },

    // RARE (5)
    {
        id: 'barracuda', name: 'Barracuda', color: '#334155', accent: '#475569',
        size: 32, maxHp: 700, staminaMax: 400, attack: 70, speed: 6.0,
        value: 800, rarity: 'rare', shape: 'eel', finColor: '#1e293b',
        desc: 'Needle-toothed speedster. Strikes in straight lines.',
        skills: ['charge', 'dart', 'waterJet'], skillName: 'Charge / Slash'
    },
    {
        id: 'mahi_mahi', name: 'Mahi-Mahi', color: '#22d3ee', accent: '#06b6d4',
        size: 35, maxHp: 750, staminaMax: 450, attack: 65, speed: 5.8,
        value: 850, rarity: 'rare', shape: 'oval', finColor: '#0891b2',
        desc: 'Brilliant colors. Fights with acrobatic leaps.',
        skills: ['blink', 'waterJet', 'rage'], skillName: 'Leap / Jet / Rage'
    },
    {
        id: 'swordfish', name: 'Broadbill Swordfish', color: '#64748b', accent: '#475569',
        size: 38, maxHp: 850, staminaMax: 500, attack: 75, speed: 5.5,
        value: 950, rarity: 'rare', shape: 'swordfish', finColor: '#334155',
        desc: 'Long bill slashes tension. Pierce attacks ignore armor.',
        skills: ['charge', 'dart', 'waterJet'], skillName: 'Bill Slash / Thrust'
    },
    {
        id: 'sailfish', name: 'Indo-Pacific Sailfish', color: '#14b8a6', accent: '#0d9488',
        size: 36, maxHp: 800, staminaMax: 480, attack: 72, speed: 6.2,
        value: 900, rarity: 'rare', shape: 'swordfish', finColor: '#0f766e',
        desc: 'Fastest fish in the ocean. Deploys sail to confuse.',
        skills: ['blink', 'charge', 'flashBang'], skillName: 'Sail Flash / Blitz'
    },
    {
        id: 'wahoo', name: 'Wahoo', color: '#0f172a', accent: '#334155',
        size: 34, maxHp: 780, staminaMax: 420, attack: 68, speed: 5.9,
        value: 820, rarity: 'rare', shape: 'eel', finColor: '#020617',
        desc: 'Razor-sharp teeth. Cuts line if tension too high.',
        skills: ['dart', 'charge', 'rage'], skillName: 'Slice / Sprint'
    },

    // EPIC (4)
    {
        id: 'electric_ray', name: 'Electric Torpedo Ray', color: '#fde047', accent: '#facc15',
        size: 40, maxHp: 1200, staminaMax: 650, attack: 90, speed: 3.5,
        value: 1500, rarity: 'epic', shape: 'ray', finColor: '#ca8a04',
        desc: 'Discharges massive voltage. Stuns and burns.',
        skills: ['shock', 'zapOrb', 'stormSpiral', 'inflate'], skillName: 'Torpedo Shock / Nova'
    },
    {
        id: 'giant_trevally', name: 'Giant Trevally', color: '#3f3f46', accent: '#27272a',
        size: 42, maxHp: 1350, staminaMax: 700, attack: 95, speed: 4.2,
        value: 1650, rarity: 'epic', shape: 'oval', finColor: '#18181b',
        desc: 'Apex reef predator. Smashes prey with brute force.',
        skills: ['charge', 'rage', 'waterJet', 'tsunami'], skillName: 'GT Slam / Tidal Crush'
    },
    {
        id: 'napoleon_wrasse', name: 'Napoleon Wrasse', color: '#10b981', accent: '#059669',
        size: 44, maxHp: 1400, staminaMax: 750, attack: 88, speed: 3.8,
        value: 1700, rarity: 'epic', shape: 'wrasse', finColor: '#065f46',
        desc: 'Hump-headed giant. Crushes shells and coral alike.',
        skills: ['inflate', 'whirlpool', 'mudSlime', 'rage'], skillName: 'Crush / Vortex'
    },
    {
        id: 'tiger_shark', name: 'Tiger Shark', color: '#1f2937', accent: '#374151',
        size: 45, maxHp: 1500, staminaMax: 800, attack: 100, speed: 4.5,
        value: 1800, rarity: 'epic', shape: 'shark', finColor: '#111827', tigerStripes: true,
        desc: 'Garbage eater of the sea. Eats anything, including gear.',
        skills: ['charge', 'rage', 'waterJet', 'tidalWave'], skillName: 'Devour / Surge'
    },

    // LEGENDARY (4)
    {
        id: 'great_white', name: 'Great White Shark', color: '#9ca3af', accent: '#6b7280',
        size: 50, maxHp: 2500, staminaMax: 1250, attack: 140, speed: 4.8,
        value: 4000, rarity: 'legendary', shape: 'shark', finColor: '#4b5563',
        desc: 'The ultimate predator. Breaches to strike from below.',
        skills: ['charge', 'tsunami', 'rage', 'waterJet'], skillName: 'Breach / Annihilate'
    },
    {
        id: 'blue_marlin', name: 'Blue Marlin', color: '#1e3a8a', accent: '#1e40af',
        size: 48, maxHp: 2200, staminaMax: 1100, attack: 130, speed: 6.5,
        value: 3800, rarity: 'legendary', shape: 'marlin', finColor: '#172554',
        desc: 'Billfish royalty. Jumps high, fights harder.',
        skills: ['blink', 'charge', 'solarBeam', 'waterJet'], skillName: 'Sky Dance / Bill Pierce'
    },
    {
        id: 'giant_grouper', name: 'Giant Grouper', color: '#57534e', accent: '#44403c',
        size: 55, maxHp: 2800, staminaMax: 1300, attack: 135, speed: 2.8,
        value: 4200, rarity: 'legendary', shape: 'grouper', finColor: '#292524',
        desc: 'Ambush predator. Swallows prey whole in one gulp.',
        skills: ['inflate', 'drain', 'whirlpool', 'mudSlime'], skillName: 'Gulp / Abyss Pull'
    },
    {
        id: 'ocean_sunfish', name: 'Ocean Sunfish (Mola Mola)', color: '#a8a29e', accent: '#78716c',
        size: 60, maxHp: 3000, staminaMax: 1400, attack: 80, speed: 2.5,
        value: 4500, rarity: 'legendary', shape: 'puffer', finColor: '#57534e',
        desc: 'Heaviest bony fish. Flattens to crush, lays millions of eggs.',
        skills: ['inflate', 'tsunami', 'whirlpool', 'flashBang'], skillName: 'Flatten / Solar Flare'
    },

    // MYTHIC (3)
    {
        id: 'megalodon', name: 'Megalodon', color: '#18181b', accent: '#3f3f46',
        size: 70, maxHp: 8000, staminaMax: 2500, attack: 300, speed: 4.0,
        value: 20000, rarity: 'mythic', shape: 'shark', finColor: '#09090b',
        desc: 'Prehistoric nightmare returned. Jaws crush steel.',
        skills: ['charge', 'tsunami', 'inferno', 'rage', 'drain', 'supernova'], skillName: 'Extinction Bite / Apocalypse'
    },
    {
        id: 'leviathan_eel', name: 'Abyssal Leviathan Eel', color: '#581c87', accent: '#7e22ce',
        size: 75, maxHp: 9000, staminaMax: 2800, attack: 320, speed: 4.5,
        value: 22000, rarity: 'mythic', shape: 'eel', finColor: '#3b0764',
        desc: 'Coils around reality. Warps space with every movement.',
        skills: ['voidPull', 'cosmicStorm', 'timeWarp', 'blink', 'drain', 'supernova'], skillName: 'Reality Coil / Chrono Crush'
    },
    {
        id: 'kraken_prime', name: 'Primeval Kraken', color: '#0c4a6e', accent: '#0369a1',
        size: 85, maxHp: 12000, staminaMax: 3500, attack: 350, speed: 3.0,
        value: 30000, rarity: 'mythic', shape: 'titan', finColor: '#075985',
        desc: 'Ancient progenitor of all krakens. Ten miles of tentacle.',
        skills: ['summonVoidlings', 'tidalCrush', 'voidCollapse', 'cosmicStorm', 'supernova', 'tsunami', 'gravitationalPull'], skillName: 'Primordial Tide / Void Ascension'
    },

    // ============================================================
    //  EXPANDED FISH SPECIES (80+ Additional Species for 135+ Total)
    // ============================================================
    // COMMON (15 more)
    {
        id: 'pilchard', name: 'Pilchard', color: '#cbd5e1', accent: '#94a3b8',
        size: 11, maxHp: 110, staminaMax: 90, attack: 11, speed: 5.3,
        value: 55, rarity: 'common', shape: 'oval', finColor: '#64748b',
        desc: 'Silvery bait fish. Travels in massive schools.',
        skills: ['dart', 'waterJet'], skillName: 'School Dash'
    },
    {
        id: 'sprat', name: 'European Sprat', color: '#e2e8f0', accent: '#cbd5e1',
        size: 9, maxHp: 85, staminaMax: 70, attack: 9, speed: 5.8,
        value: 40, rarity: 'common', shape: 'oval', finColor: '#94a3b8',
        desc: 'Tiny and oily. Favorite food of larger predators.',
        skills: ['dart'], skillName: 'Micro Dart'
    },
    {
        id: 'herring', name: 'Atlantic Herring', color: '#94a3b8', accent: '#64748b',
        size: 13, maxHp: 130, staminaMax: 110, attack: 13, speed: 5.0,
        value: 65, rarity: 'common', shape: 'oval', finColor: '#475569',
        desc: 'Keystone species. Shimmers like living mercury.',
        skills: ['dart', 'blink'], skillName: 'Mirror Flash'
    },
    {
        id: 'mackerel', name: 'Chub Mackerel', color: '#475569', accent: '#334155',
        size: 18, maxHp: 170, staminaMax: 140, attack: 18, speed: 4.5,
        value: 85, rarity: 'common', shape: 'oval', finColor: '#1e293b',
        desc: 'Tiger-striped speedster. Fights hard for its size.',
        skills: ['waterJet', 'rage'], skillName: 'Striped Fury'
    },
    {
        id: 'sandeel', name: 'Lesser Sandeel', color: '#fde68a', accent: '#fcd34d',
        size: 10, maxHp: 90, staminaMax: 75, attack: 10, speed: 4.8,
        value: 48, rarity: 'common', shape: 'eel', finColor: '#f59e0b',
        desc: 'Burrows in sand. Pops out to strike.',
        skills: ['blink', 'dart'], skillName: 'Sand Burst'
    },
    {
        id: 'garfish', name: 'Garfish', color: '#67e8f9', accent: '#22d3ee',
        size: 20, maxHp: 160, staminaMax: 130, attack: 20, speed: 5.2,
        value: 90, rarity: 'common', shape: 'eel', finColor: '#0891b2',
        desc: 'Needle-nose surface dweller. Jumps when hooked.',
        skills: ['charge', 'blink'], skillName: 'Surface Skip'
    },
    {
        id: 'pipefish', name: 'Straight-nosed Pipefish', color: '#86efac', accent: '#4ade80',
        size: 12, maxHp: 100, staminaMax: 85, attack: 11, speed: 3.2,
        value: 52, rarity: 'common', shape: 'eel', finColor: '#22c55e',
        desc: 'Seahorse cousin. Camouflages in seagrass.',
        skills: ['camouflaged', 'dart'], skillName: 'Grass Hide'
    },
    {
        id: 'goby', name: 'Sand Goby', color: '#a8a29e', accent: '#78716c',
        size: 8, maxHp: 75, staminaMax: 60, attack: 8, speed: 3.5,
        value: 35, rarity: 'common', shape: 'oval', finColor: '#57534e',
        desc: 'Bottom-hugging. Darts between rocks.',
        skills: ['blink', 'mudSlime'], skillName: 'Rock Dart'
    },
    {
        id: 'blenny', name: 'Tompot Blenny', color: '#d6d3d1', accent: '#a8a29e',
        size: 9, maxHp: 85, staminaMax: 70, attack: 10, speed: 3.0,
        value: 42, rarity: 'common', shape: 'oval', finColor: '#78716c',
        desc: 'Curious rock-dweller. Watches anglers.',
        skills: ['poisonSpit', 'dart'], skillName: 'Venom Nip'
    },
    {
        id: 'dragonet', name: 'Common Dragonet', color: '#fef08a', accent: '#fde047',
        size: 11, maxHp: 105, staminaMax: 85, attack: 12, speed: 3.8,
        value: 58, rarity: 'common', shape: 'spiky', finColor: '#facc15',
        desc: 'Ornate fins. Walks on pectoral fins.',
        skills: ['flashBang', 'mudSlime'], skillName: 'Fin Display'
    },
    {
        id: 'weever', name: 'Lesser Weever', color: '#9ca3af', accent: '#6b7280',
        size: 14, maxHp: 140, staminaMax: 110, attack: 18, speed: 4.0,
        value: 72, rarity: 'common', shape: 'spiky', finColor: '#4b5563',
        desc: 'Venomous dorsal spines. Buries in sand.',
        skills: ['poisonSpit', 'camouflaged'], skillName: 'Sting Trap'
    },
    {
        id: 'scorpionfish', name: 'Small Scorpionfish', color: '#d97706', accent: '#b45309',
        size: 15, maxHp: 150, staminaMax: 120, attack: 20, speed: 2.8,
        value: 78, rarity: 'common', shape: 'spiky', finColor: '#92400e',
        desc: 'Master of disguise. Venomous spines.',
        skills: ['camouflaged', 'poisonSpit', 'inflate'], skillName: 'Stonefish Mimic'
    },
    {
        id: 'flatfish', name: 'European Flounder', color: '#a16207', accent: '#854d0e',
        size: 16, maxHp: 180, staminaMax: 130, attack: 15, speed: 3.0,
        value: 82, rarity: 'common', shape: 'flatfish', finColor: '#78350f',
        desc: 'Flattened ambush predator. Both eyes on one side.',
        skills: ['camouflaged', 'mudSlime'], skillName: 'Bottom Blend'
    },
    {
        id: 'sole', name: 'Common Sole', color: '#78350f', accent: '#5c2a0d',
        size: 18, maxHp: 200, staminaMax: 150, attack: 16, speed: 2.5,
        value: 95, rarity: 'common', shape: 'flatfish', finColor: '#451a03',
        desc: 'Nocturnal hunter. Incredibly well camouflaged.',
        skills: ['camouflaged', 'blink'], skillName: 'Night Stalker'
    },
    {
        id: 'plaice', name: 'European Plaice', color: '#92400e', accent: '#78350f',
        size: 17, maxHp: 190, staminaMax: 140, attack: 17, speed: 2.8,
        value: 88, rarity: 'common', shape: 'flatfish', finColor: '#5c2a0d',
        desc: 'Orange-spotted flatfish. Tasty but tricky.',
        skills: ['camouflaged', 'waterJet'], skillName: 'Spot Flash'
    },

    // RARE (12 more)
    {
        id: 'tuna_skipjack', name: 'Skipjack Tuna', color: '#1e293b', accent: '#0f172a',
        size: 30, maxHp: 650, staminaMax: 400, attack: 65, speed: 6.5,
        value: 750, rarity: 'rare', shape: 'tuna', finColor: '#020617',
        desc: 'Tropical speedster. Schools with dolphins.',
        skills: ['charge', 'dart', 'waterJet'], skillName: 'Purse Seine Dash'
    },
    {
        id: 'tuna_albacore', name: 'Albacore Tuna', color: '#334155', accent: '#1e293b',
        size: 35, maxHp: 800, staminaMax: 500, attack: 72, speed: 6.0,
        value: 900, rarity: 'rare', shape: 'tuna', finColor: '#0f172a',
        desc: 'Long pectoral fins. "Chicken of the sea."',
        skills: ['charge', 'blink', 'waterJet'], skillName: 'Longfin Sprint'
    },
    {
        id: 'bonito', name: 'Atlantic Bonito', color: '#475569', accent: '#334155',
        size: 28, maxHp: 580, staminaMax: 350, attack: 60, speed: 6.2,
        value: 680, rarity: 'rare', shape: 'tuna', finColor: '#1e293b',
        desc: 'Striped back. Ferocious feeder.',
        skills: ['rage', 'charge', 'waterJet'], skillName: 'Striped Rage'
    },
    {
        id: 'little_tunny', name: 'Little Tunny (False Albacore)', color: '#64748b', accent: '#475569',
        size: 26, maxHp: 520, staminaMax: 320, attack: 55, speed: 6.3,
        value: 620, rarity: 'rare', shape: 'tuna', finColor: '#334155',
        desc: 'Worm-like markings. Explosive runs.',
        skills: ['blink', 'charge', 'rage'], skillName: 'False Alarm'
    },
    {
        id: 'kingfish', name: 'Kingfish (Yellowtail Amberjack)', color: '#fde047', accent: '#facc15',
        size: 38, maxHp: 900, staminaMax: 550, attack: 78, speed: 5.5,
        value: 1100, rarity: 'rare', shape: 'oval', finColor: '#eab308',
        desc: 'Golden stripe. Pulls like a freight train.',
        skills: ['charge', 'waterJet', 'rage'], skillName: 'Gold Rush'
    },
    {
        id: 'samson_fish', name: 'Samson Fish', color: '#f59e0b', accent: '#d97706',
        size: 36, maxHp: 850, staminaMax: 500, attack: 75, speed: 5.3,
        value: 1000, rarity: 'rare', shape: 'oval', finColor: '#b45309',
        desc: 'Kingfish cousin. Even stronger pound-for-pound.',
        skills: ['charge', 'rage', 'tsunami'], skillName: 'Biblical Strength'
    },
    {
        id: 'queenfish', name: 'Queenfish', color: '#38bdf8', accent: '#0ea5e9',
        size: 32, maxHp: 700, staminaMax: 420, attack: 62, speed: 5.8,
        value: 820, rarity: 'rare', shape: 'oval', finColor: '#0369a1',
        desc: 'Silver missile. Multiple hook-ups common.',
        skills: ['blink', 'charge', 'dart'], skillName: 'Royal Volley'
    },
    {
        id: 'trevally_giant', name: 'Giant Trevally (GT)', color: '#18181b', accent: '#09090b',
        size: 45, maxHp: 1400, staminaMax: 750, attack: 95, speed: 4.5,
        value: 1800, rarity: 'rare', shape: 'oval', finColor: '#09090b',
        desc: 'Reef bully. Smashes poppers with authority.',
        skills: ['charge', 'tsunami', 'rage', 'waterJet'], skillName: 'GT Smash'
    },
    {
        id: 'bluefin_trevally', name: 'Bluefin Trevally', color: '#1e3a8a', accent: '#1e40af',
        size: 30, maxHp: 650, staminaMax: 400, attack: 68, speed: 5.2,
        value: 880, rarity: 'rare', shape: 'oval', finColor: '#172554',
        desc: 'Electric blue spots. Coral reef terror.',
        skills: ['charge', 'shock', 'waterJet'], skillName: 'Electric Blue'
    },
    {
        id: 'golden_trevally', name: 'Golden Trevally', color: '#fde047', accent: '#facc15',
        size: 34, maxHp: 750, staminaMax: 450, attack: 70, speed: 5.0,
        value: 950, rarity: 'rare', shape: 'oval', finColor: '#eab308',
        desc: 'Golden with black bands. Follows sharks.',
        skills: ['blink', 'charge', 'drain'], skillName: 'Pilot Fish'
    },
    {
        id: 'permite', name: 'Permit', color: '#67e8f9', accent: '#22d3ee',
        size: 35, maxHp: 800, staminaMax: 480, attack: 60, speed: 5.5,
        value: 920, rarity: 'rare', shape: 'oval', finColor: '#0891b2',
        desc: 'Permit to catch. Crab-crushing pharyngeal teeth.',
        skills: ['inflate', 'mudSlime', 'charge'], skillName: 'Crab Crusher'
    },

    // EPIC (10 more)
    {
        id: 'roosterfish', name: 'Roosterfish', color: '#3f3f46', accent: '#27272a',
        size: 48, maxHp: 1500, staminaMax: 800, attack: 92, speed: 5.5,
        value: 2200, rarity: 'epic', shape: 'oval', finColor: '#18181b',
        desc: 'Seven-spined dorsal "comb". Surf zone phantom.',
        skills: ['charge', 'blink', 'tsunami', 'rage'], skillName: 'Comb Raise'
    },
    {
        id: 'cubera_snapper', name: 'Cubera Snapper', color: '#78350f', accent: '#5c2a0d',
        size: 50, maxHp: 1800, staminaMax: 900, attack: 105, speed: 4.0,
        value: 2500, rarity: 'epic', shape: 'snapper', finColor: '#451a03',
        desc: 'Massive canine teeth. Mangrove monarch.',
        skills: ['charge', 'rage', 'inflate', 'mudSlime'], skillName: 'Mangrove Maw'
    },
    {
        id: 'dogtooth_tuna', name: 'Dogtooth Tuna', color: '#1e293b', accent: '#0f172a',
        size: 52, maxHp: 2000, staminaMax: 1000, attack: 115, speed: 5.8,
        value: 2800, rarity: 'epic', shape: 'oval', finColor: '#020617',
        desc: 'Tuna with dog-like teeth. Deep water brute.',
        skills: ['charge', 'shock', 'tsunami', 'rage'], skillName: 'White Dog'
    },
    {
        id: 'wahoo_peterson', name: 'Peterson\'s Wahoo', color: '#0f172a', accent: '#020617',
        size: 42, maxHp: 1200, staminaMax: 650, attack: 88, speed: 7.0,
        value: 1900, rarity: 'epic', shape: 'eel', finColor: '#020617',
        desc: 'Razor teeth. First run burns drag.',
        skills: ['charge', 'blink', 'dart', 'rage'], skillName: 'Razor Line'
    },
    {
        id: 'sailfish_atlantic', name: 'Atlantic Sailfish', color: '#14b8a6', accent: '#0d9488',
        size: 55, maxHp: 1600, staminaMax: 850, attack: 95, speed: 7.5,
        value: 2600, rarity: 'epic', shape: 'swordfish', finColor: '#0f766e',
        desc: 'Iconic billfish. Jumps greyhound style.',
        skills: ['blink', 'charge', 'solarBeam', 'waterJet', 'flashBang'], skillName: 'Sail Dance'
    },
    {
        id: 'white_marlin', name: 'White Marlin', color: '#e2e8f0', accent: '#cbd5e1',
        size: 50, maxHp: 1400, staminaMax: 750, attack: 88, speed: 6.8,
        value: 2200, rarity: 'epic', shape: 'marlin', finColor: '#94a3b8',
        desc: 'Rounded dorsal. Smallest marlin, biggest heart.',
        skills: ['charge', 'blink', 'waterJet', 'solarBeam'], skillName: 'White Lightning'
    },
    {
        id: 'striped_marlin', name: 'Striped Marlin', color: '#1e293b', accent: '#0f172a',
        size: 58, maxHp: 1800, staminaMax: 950, attack: 105, speed: 7.0,
        value: 3000, rarity: 'epic', shape: 'marlin', finColor: '#020617',
        desc: 'Vertical stripes lit up. Pack hunter.',
        skills: ['charge', 'tsunami', 'stormSpiral', 'blink'], skillName: 'Striped Squadron'
    },
    {
        id: 'black_marlin', name: 'Black Marlin', color: '#09090b', accent: '#18181b',
        size: 65, maxHp: 2200, staminaMax: 1100, attack: 120, speed: 6.5,
        value: 3500, rarity: 'epic', shape: 'swordfish', finColor: '#09090b',
        desc: 'Rigid pectorals. "The bull of the sea."',
        skills: ['charge', 'tsunami', 'rage', 'inferno'], skillName: 'Black Bull'
    },
    {
        id: 'blue_marlin_grand', name: 'Grand Blue Marlin', color: '#1e3a8a', accent: '#1e40af',
        size: 70, maxHp: 2800, staminaMax: 1400, attack: 140, speed: 6.0,
        value: 4500, rarity: 'epic', shape: 'marlin', finColor: '#172554',
        desc: 'Granders exceed 1000lbs. Ultimate billfish.',
        skills: ['charge', 'tsunami', 'solarBeam', 'supernova', 'rage'], skillName: 'Grand Slam'
    },
    {
        id: 'swordfish_broadbill', name: 'Broadbill Swordfish', color: '#374151', accent: '#1f2937',
        size: 60, maxHp: 2000, staminaMax: 1000, attack: 110, speed: 5.5,
        value: 2800, rarity: 'epic', shape: 'swordfish', finColor: '#111827',
        desc: 'Gladius bill. Hunts in midnight zone.',
        skills: ['charge', 'zapOrb', 'blink', 'drain'], skillName: 'Deep Sword'
    },

    // LEGENDARY (10 more)
    {
        id: 'bluefin_tuna', name: 'Atlantic Bluefin Tuna', color: '#1e293b', accent: '#0f172a',
        size: 80, maxHp: 4000, staminaMax: 2000, attack: 160, speed: 7.0,
        value: 12000, rarity: 'legendary', shape: 'tuna', finColor: '#020617',
        desc: 'Warm-blooded giant. Crosses oceans.',
        skills: ['charge', 'tsunami', 'stormSpiral', 'rage', 'supernova'], skillName: 'Toro Toro'
    },
    {
        id: 'yellowfin_tuna', name: 'Yellowfin Tuna (Ahi)', color: '#fde047', accent: '#facc15',
        size: 60, maxHp: 2500, staminaMax: 1300, attack: 135, speed: 7.2,
        value: 5500, rarity: 'legendary', shape: 'tuna', finColor: '#eab308',
        desc: 'Sickle fins. Football-shaped torpedoes.',
        skills: ['charge', 'blink', 'stormSpiral', 'solarBeam'], skillName: 'Ahi Speed'
    },
    {
        id: 'bigeye_tuna', name: 'Bigeye Tuna', color: '#0f172a', accent: '#020617',
        size: 55, maxHp: 2200, staminaMax: 1100, attack: 125, speed: 6.5,
        value: 4800, rarity: 'legendary', shape: 'tuna', finColor: '#020617',
        desc: 'Huge eyes for deep hunting. Fatty prized.',
        skills: ['charge', 'zapOrb', 'blink', 'drain'], skillName: 'Deep Eye'
    },
    {
        id: 'swordfish_giant', name: 'Giant Swordfish', color: '#1f2937', accent: '#111827',
        size: 75, maxHp: 3000, staminaMax: 1500, attack: 150, speed: 5.8,
        value: 6000, rarity: 'legendary', shape: 'swordfish', finColor: '#030712',
        desc: 'Bill flattens prey. Daytime deep, night surface.',
        skills: ['charge', 'zapOrb', 'blink', 'drain', 'supernova'], skillName: 'Gladius'
    },
    {
        id: 'great_hammerhead', name: 'Great Hammerhead', color: '#4b5563', accent: '#374151',
        size: 70, maxHp: 2500, staminaMax: 1200, attack: 130, speed: 4.8,
        value: 4200, rarity: 'legendary', shape: 'hammerhead', finColor: '#1f293b',
        desc: 'Cephalofoil scans. Stingray specialist.',
        skills: ['charge', 'tsunami', 'shock', 'blink', 'rage'], skillName: 'Hammer Time'
    },
    {
        id: 'tiger_shark_great', name: 'Great Tiger Shark', color: '#18181b', accent: '#09090b',
        size: 75, maxHp: 3000, staminaMax: 1400, attack: 145, speed: 4.5,
        value: 5000, rarity: 'legendary', shape: 'shark', finColor: '#09090b', tigerStripes: true,
        desc: 'Garbage can stomach. Eats license plates.',
        skills: ['charge', 'rage', 'tsunami', 'drain', 'inferno'], skillName: 'Trash Compactor'
    },
    {
        id: 'greenland_shark', name: 'Greenland Shark', color: '#374151', accent: '#1f2937',
        size: 65, maxHp: 3500, staminaMax: 1600, attack: 120, speed: 1.8,
        value: 4500, rarity: 'legendary', shape: 'shark', finColor: '#111827',
        desc: '400-year lifespan. Toxic flesh. Arctic ghost.',
        skills: ['poisonSpit', 'drain', 'camouflaged', 'inflate'], skillName: 'Time Eater'
    },
    {
        id: 'sixgill_shark', name: 'Bluntnose Sixgill', color: '#111827', accent: '#030712',
        size: 60, maxHp: 2800, staminaMax: 1300, attack: 135, speed: 3.5,
        value: 3800, rarity: 'legendary', shape: 'shark', finColor: '#030712',
        desc: 'Six gill slits. Living fossil from Jurassic.',
        skills: ['charge', 'drain', 'voidPull', 'camouflaged'], skillName: 'Primeval Six'
    },
    {
        id: 'megamouth_shark', name: 'Megamouth Shark', color: '#1e293b', accent: '#0f172a',
        size: 55, maxHp: 2200, staminaMax: 1100, attack: 90, speed: 2.5,
        value: 3200, rarity: 'legendary', shape: 'shark', finColor: '#020617',
        desc: 'Glowing mouth. Filter feeds on krill.',
        skills: ['inflate', 'waterJet', 'flashBang', 'blink'], skillName: 'Bio-Lure'
    },
    {
        id: 'basking_shark', name: 'Basking Shark', color: '#6b7280', accent: '#4b5563',
        size: 85, maxHp: 3500, staminaMax: 1600, attack: 80, speed: 3.0,
        value: 4000, rarity: 'legendary', shape: 'shark', finColor: '#374151',
        desc: 'Second largest fish. Harmless giant.',
        skills: ['inflate', 'tsunami', 'whirlpool', 'waterJet'], skillName: 'Passive Filter'
    },

    // MYTHIC (8 more)
    {
        id: 'colossal_squid', name: 'Colossal Squid', color: '#581c87', accent: '#7e22ce',
        size: 90, maxHp: 10000, staminaMax: 3000, attack: 300, speed: 4.0,
        value: 35000, rarity: 'mythic', shape: 'kraken', finColor: '#3b0764',
        desc: 'Largest eyes in animal kingdom. Hooked tentacles.',
        skills: ['tentacleSlam', 'voidPull', 'inkCloud', 'drain', 'supernova'], skillName: 'Antarctic Horror'
    },
    {
        id: 'giant_oarfish', name: 'Giant Oarfish (King of Herrings)', color: '#c084fc', accent: '#a855f7',
        size: 100, maxHp: 6000, staminaMax: 2500, attack: 180, speed: 3.5,
        value: 15000, rarity: 'mythic', shape: 'oarfish', finColor: '#7e22ce',
        desc: 'Longest bony fish. Sea serpent legend.',
        skills: ['blink', 'solarBeam', 'cosmicStorm', 'timeWarp', 'drain'], skillName: 'Ribbon of Doom'
    },
    {
        id: 'whale_shark', name: 'Whale Shark', color: '#1e3a8a', accent: '#1e40af',
        size: 120, maxHp: 15000, staminaMax: 4000, attack: 100, speed: 3.0,
        value: 25000, rarity: 'mythic', shape: 'shark', finColor: '#172554',
        desc: 'Largest fish alive. Gentle polka-dotted giant.',
        skills: ['inflate', 'tsunami', 'whirlpool', 'waterJet', 'solarBeam'], skillName: 'Starry Night'
    },
    {
        id: 'coelacanth', name: 'Coelacanth (Living Fossil)', color: '#3f3f46', accent: '#27272a',
        size: 45, maxHp: 3000, staminaMax: 1500, attack: 140, speed: 2.8,
        value: 20000, rarity: 'mythic', shape: 'spiky', finColor: '#18181b',
        desc: 'Lobe-finned. Thought extinct 66M years.',
        skills: ['voidPull', 'timeWarp', 'drain', 'camouflaged', 'blink'], skillName: 'Lazarus Taxon'
    },
    {
        id: 'dunkleosteus', name: 'Dunkleosteus (Placoderm)', color: '#7f1d1d', accent: '#991b1b',
        size: 55, maxHp: 5000, staminaMax: 2000, attack: 250, speed: 4.2,
        value: 28000, rarity: 'mythic', shape: 'prehistoric', finColor: '#450a0a',
        desc: 'Armored jaw plates. First vertebrate superpredator.',
        skills: ['charge', 'inferno', 'tsunami', 'supernova', 'voidPull'], skillName: 'Armor Crusher'
    },
    {
        id: 'leedsichthys', name: 'Leedsichthys (Giant Ray-Finned)', color: '#1e40af', accent: '#1e3a8a',
        size: 110, maxHp: 12000, staminaMax: 3500, attack: 150, speed: 3.2,
        value: 30000, rarity: 'mythic', shape: 'prehistoric', finColor: '#172554',
        desc: 'Largest ray-finned fish ever. Jurassic filter feeder.',
        skills: ['inflate', 'tsunami', 'whirlpool', 'solarBeam', 'supernova'], skillName: 'Jurassic Leviathan'
    },
    {
        id: 'xiphactinus', name: 'Xiphactinus (Bulldog Fish)', color: '#dc2626', accent: '#b91c1c',
        size: 50, maxHp: 4000, staminaMax: 1800, attack: 220, speed: 5.5,
        value: 22000, rarity: 'mythic', shape: 'swordfish', finColor: '#7f1d1d',
        desc: 'Cretaceous bulldog. Swallowed prey whole.',
        skills: ['charge', 'rage', 'inferno', 'tsunami', 'drain'], skillName: 'Bulldog Bite'
    },
    {
        id: 'megalodon_prime', name: 'Primeval Megalodon', color: '#030712', accent: '#111827',
        size: 100, maxHp: 20000, staminaMax: 5000, attack: 500, speed: 5.0,
        value: 100000, rarity: 'mythic', shape: 'shark', finColor: '#030712',
        desc: 'The ultimate apex. 60-foot, 50-ton nightmare.',
        skills: ['charge', 'tsunami', 'inferno', 'supernova', 'voidPull', 'cosmicStorm', 'gravitationalPull', 'timeWarp'], skillName: 'Extinction Event',
        image: 'megalodon_prime'
    },
    {
        id: 'seahorse', name: 'Coral Seahorse', color: '#f0abfc', accent: '#d946ef',
        size: 14, maxHp: 420, staminaMax: 300, attack: 38, speed: 2.2,
        value: 450, rarity: 'rare', shape: 'seahorse', finColor: '#a855f7',
        desc: 'Tiny knight of the reef. Hides in plain sight.',
        skills: ['camouflaged', 'dart', 'bubblePrison'], skillName: 'Hide / Bubble'
    },
    {
        id: 'moon_jelly', name: 'Moon Jellyfish', color: '#e0f2fe', accent: '#a5f3fc',
        size: 30, maxHp: 1500, staminaMax: 800, attack: 110, speed: 2.0,
        value: 1750, rarity: 'epic', shape: 'jellyfish', finColor: '#67e8f9',
        desc: 'Drifting bell of venom. Its sting numbs limbs.',
        skills: ['shock', 'inkBurst', 'bubblePrison'], skillName: 'Sting / Ink'
    },
    {
        id: 'cuttlefish', name: 'Flamboyant Cuttlefish', color: '#f97316', accent: '#fde047',
        size: 22, maxHp: 900, staminaMax: 550, attack: 80, speed: 4.2,
        value: 1050, rarity: 'epic', shape: 'squid', finColor: '#ea580c',
        desc: 'Walking rainbow. Flashes color, then vanishes in ink.',
        skills: ['flashBang', 'inkBurst', 'camouflaged'], skillName: 'Flash / Ink'
    },
    // ---- TIDE-BREAKER EXPANSION: stronger species across every tier ----
    {
        id: 'mudskipper', name: 'Giant Mudskipper', color: '#65a30d', accent: '#3f6212',
        size: 18, maxHp: 320, staminaMax: 220, attack: 30, speed: 5.2,
        value: 140, rarity: 'common', shape: 'frogfish', finColor: '#365314',
        desc: 'Walks on land to mock you. Jumps like it pays rent.',
        skills: ['dart', 'mudSlime', 'charge'], skillName: 'Hop / Mud'
    },
    {
        id: 'glass_minnow', name: 'Glass Minnow School', color: '#bae6fd', accent: '#e0f2fe',
        size: 12, maxHp: 200, staminaMax: 260, attack: 18, speed: 6.5,
        value: 120, rarity: 'common', shape: 'anchovy', finColor: '#7dd3fc',
        desc: 'You see right through them. They see right through you.',
        skills: ['dart', 'blink', 'mirrorImage'], skillName: 'Shimmer / Split'
    },
    {
        id: 'lanternfish', name: 'Hadal Lanternfish', color: '#22d3ee', accent: '#a5f3fc',
        size: 24, maxHp: 700, staminaMax: 480, attack: 70, speed: 3.8,
        value: 620, rarity: 'rare', shape: 'angler', finColor: '#0e7490',
        desc: 'Carries its own spotlight into the dark.',
        skills: ['flashBang', 'shock', 'lure'], skillName: 'Lure / Shock'
    },
    {
        id: 'thunder_eel', name: 'Thunder Eel', color: '#facc15', accent: '#fef08a',
        size: 34, maxHp: 1100, staminaMax: 650, attack: 120, speed: 5.0,
        value: 980, rarity: 'rare', shape: 'eel', finColor: '#a16207',
        desc: 'Swims like lightning, stings like betrayal.',
        skills: ['shock', 'stormSpiral', 'charge'], skillName: 'Volt / Spiral'
    },
    {
        id: 'obsidian_tuna', name: 'Obsidian Tuna', color: '#1c1917', accent: '#57534e',
        size: 46, maxHp: 2200, staminaMax: 1100, attack: 170, speed: 6.2,
        value: 3400, rarity: 'epic', shape: 'tuna', finColor: '#0c0a09',
        desc: 'Forged in a volcano, served at full speed.',
        skills: ['charge', 'emberBreath', 'inferno'], skillName: 'Ram / Magma'
    },
    {
        id: 'abyssal_angler', name: 'Abyssal Angler', color: '#6d28d9', accent: '#c4b5fd',
        size: 38, maxHp: 2600, staminaMax: 1300, attack: 190, speed: 3.0,
        value: 4200, rarity: 'epic', shape: 'angler', finColor: '#4c1d95',
        desc: 'Its lure shows you what you want most. Then teeth.',
        skills: ['lure', 'voidPull', 'drain'], skillName: 'Lure / Drain'
    },
    {
        id: 'tide_rex', name: 'Tide Rex', color: '#047857', accent: '#6ee7b7',
        size: 62, maxHp: 6500, staminaMax: 2600, attack: 320, speed: 4.8,
        value: 15000, rarity: 'legendary', shape: 'prehistoric', finColor: '#065f46',
        desc: 'Apex of the shallows. The tide moves for it, not you.',
        skills: ['charge', 'tidalSlam', 'bloodFrenzy', 'elderCharge'], skillName: 'Apex Rush / Slam'
    },
    {
        id: 'volcano_eel', name: 'Volcano Eel', color: '#dc2626', accent: '#fca5a5',
        size: 48, maxHp: 5500, staminaMax: 2400, attack: 300, speed: 5.4,
        value: 13500, rarity: 'legendary', shape: 'serpent', finColor: '#7f1d1d',
        desc: 'Nests in magma vents. Its blood boils the sea around it.',
        skills: ['inferno', 'magmaShower', 'magmaPillars'], skillName: 'Eruption'
    },
    {
        id: 'frost_serpent', name: 'Frost Serpent', color: '#a5f3fc', accent: '#ffffff',
        size: 52, maxHp: 6000, staminaMax: 2500, attack: 290, speed: 5.0,
        value: 14200, rarity: 'legendary', shape: 'serpent', finColor: '#0e7490',
        desc: 'Winter given fangs. Freezes the surf it swims through.',
        skills: ['frostbite', 'iceSpikeRing', 'blizzardNova'], skillName: 'Deep Freeze'
    },
    {
        id: 'leviathan_calf', name: 'Leviathan Calf', color: '#1e3a8a', accent: '#60a5fa',
        size: 70, maxHp: 9000, staminaMax: 3200, attack: 380, speed: 3.6,
        value: 26000, rarity: 'mythic', shape: 'leviathan', finColor: '#172554',
        desc: 'A baby. A BABY. Imagine the mother.',
        skills: ['tidalCrush', 'leviathanRoar', 'tsunami'], skillName: 'Calf Tantrum'
    },
    {
        id: 'ember_megalodon', name: 'Ember Megalodon', color: '#7c2d12', accent: '#fb923c',
        size: 95, maxHp: 16000, staminaMax: 4500, attack: 460, speed: 5.2,
        value: 60000, rarity: 'mythic', shape: 'shark', finColor: '#431407',
        desc: 'Ancient shark wreathed in living flame. The sea boils in its wake.',
        skills: ['inferno', 'firestormNova', 'supernova', 'charge'], skillName: 'Firestorm'
    },
    {
        id: 'void_kraken', name: 'Void Kraken', color: '#4c1d95', accent: '#c084fc',
        size: 85, maxHp: 14000, staminaMax: 5000, attack: 420, speed: 3.4,
        value: 55000, rarity: 'mythic', shape: 'kraken', finColor: '#2e1065',
        desc: 'Eight arms reaching out of nothing. It pulls ships AND shadows.',
        skills: ['voidPull', 'voidCollapse', 'tentacleSlam', 'gravitationalPull'], skillName: 'Event Maw'
    },
    {
        id: 'colossal_whale', name: 'Colossal Whale', color: '#3b82f6', accent: '#93c5fd',
        size: 150, maxHp: 30000, staminaMax: 12000, attack: 500, speed: 1.2,
        value: 120000, rarity: 'mythic', shape: 'titan', finColor: '#1e3a8a',
        desc: 'A living island. When it breaches the sky, the earth answers.',
        skills: ['titanSlam', 'tidalCrush', 'tsunami'], skillName: 'BREACH / QUAKE'
    },
    // --- EVENT TIDE: 30 newcomers (strict schedules bite ONLY in-window) ---
    // Commons: open water, always biting.
    {
        id: 'sunfin_tetra', name: 'Sunfin Tetra', color: '#fbbf24', accent: '#f59e0b',
        size: 12, maxHp: 120, staminaMax: 110, attack: 6, speed: 2.6,
        value: 22, rarity: 'common', shape: 'minnow', finColor: '#d97706',
        desc: 'Glints like a coin at noon. Loves a clear day.',
        skills: ['dart', 'flashBang'], skillName: 'Sun Flicker'
    },
    {
        id: 'drizzle_minnow', name: 'Drizzle Minnow', color: '#7dd3fc', accent: '#0284c7',
        size: 11, maxHp: 110, staminaMax: 100, attack: 5, speed: 2.8,
        value: 18, rarity: 'common', shape: 'minnow', finColor: '#0369a1',
        desc: 'Rises with the first raindrops. Monsoon herald.',
        skills: ['dart', 'waterJet'], skillName: 'Rain Rise'
    },
    {
        id: 'fog_guppy', name: 'Fog Guppy', color: '#cbd5e1', accent: '#64748b',
        size: 10, maxHp: 100, staminaMax: 95, attack: 5, speed: 2.4,
        value: 20, rarity: 'common', shape: 'goldfish', finColor: '#475569',
        desc: 'Vanishes between fog banks. Follow the grey.',
        skills: ['dart', 'camouflaged'], skillName: 'Grey Veil'
    },
    {
        id: 'dusk_glimmer', name: 'Dusk Glimmer', color: '#c084fc', accent: '#7c3aed',
        size: 13, maxHp: 130, staminaMax: 120, attack: 7, speed: 2.7,
        value: 26, rarity: 'common', shape: 'wrasse', finColor: '#5b21b6',
        desc: 'Only glows as the sun gives up.',
        skills: ['dart', 'lure'], skillName: 'Last Light'
    },
    {
        id: 'night_ripple', name: 'Night Ripple', color: '#312e81', accent: '#6366f1',
        size: 12, maxHp: 125, staminaMax: 115, attack: 6, speed: 2.5,
        value: 24, rarity: 'common', shape: 'anchovy', finColor: '#4338ca',
        desc: 'A rumor with fins. Bites after dark.',
        skills: ['dart', 'inkCloud'], skillName: 'Dark Water'
    },
    {
        id: 'tidepool_blenny', name: 'Tidepool Blenny', color: '#65a30d', accent: '#365314',
        size: 11, maxHp: 115, staminaMax: 105, attack: 6, speed: 2.3,
        value: 16, rarity: 'common', shape: 'frogfish', finColor: '#1a2e05',
        desc: 'King of puddles. Grumpy, edible.',
        skills: ['mudSlime', 'spineVolley'], skillName: 'Mud Grumble'
    },
    {
        id: 'cloudskipper', name: 'Cloudskipper', color: '#e0f2fe', accent: '#0ea5e9',
        size: 14, maxHp: 140, staminaMax: 130, attack: 8, speed: 3.2,
        value: 28, rarity: 'common', shape: 'trout', finColor: '#0284c7',
        desc: 'Skips the surface when clouds gather.',
        skills: ['dart', 'charge'], skillName: 'Skip Jump'
    },
    {
        id: 'ember_anchovy', name: 'Ember Anchovy', color: '#fb923c', accent: '#c2410c',
        size: 12, maxHp: 120, staminaMax: 110, attack: 7, speed: 3.0,
        value: 25, rarity: 'common', shape: 'anchovy', finColor: '#7c2d12',
        desc: 'Warm to the touch. Dawn fishermen swear by it.',
        skills: ['dart', 'emberBreath'], skillName: 'Warm Trail'
    },
    // Rares: half scheduled, half open.
    {
        id: 'monsoon_garpike', name: 'Monsoon Garpike', color: '#0e7490', accent: '#164e63',
        size: 30, maxHp: 620, staminaMax: 420, attack: 55, speed: 4.2,
        value: 420, rarity: 'rare', shape: 'pike', finColor: '#0c4a6e',
        desc: 'Only hunts while the rain hammers down.',
        hours: null, weather: ['rain'], strict: true,
        skills: ['charge', 'waterJet', 'tidalWave'], skillName: 'Rain Spear'
    },
    {
        id: 'mistwisp_eel', name: 'Mistwisp Eel', color: '#a5b4fc', accent: '#4f46e5',
        size: 26, maxHp: 540, staminaMax: 400, attack: 48, speed: 4.6,
        value: 380, rarity: 'rare', shape: 'eel', finColor: '#312e81',
        desc: 'A ribbon of living fog. Never seen on clear days.',
        hours: null, weather: ['fog'], strict: true,
        skills: ['shock', 'camouflaged', 'drain'], skillName: 'Grey Coil'
    },
    {
        id: 'dawn_runner', name: 'Dawn Runner', color: '#fdba74', accent: '#ea580c',
        size: 28, maxHp: 560, staminaMax: 430, attack: 50, speed: 5.2,
        value: 450, rarity: 'rare', shape: 'trout', finColor: '#9a3412',
        desc: 'Sprints the sunrise. Gone by full morning — 05:00 to 07:00 only.',
        hours: [5, 7], weather: null, strict: true,
        skills: ['charge', 'dart', 'solarBeam'], skillName: 'Sunrise Sprint'
    },
    {
        id: 'stormpetrel_fish', name: 'Stormpetrel Fish', color: '#475569', accent: '#0f172a',
        size: 24, maxHp: 500, staminaMax: 380, attack: 46, speed: 5.0,
        value: 400, rarity: 'rare', shape: 'swordfish', finColor: '#020617',
        desc: 'Rides the storm front. Calm seas never hold it.',
        hours: null, weather: ['storm'], strict: true,
        skills: ['thunderDive', 'charge', 'chainLightning'], skillName: 'Front Rider'
    },
    {
        id: 'bloodfin_tetra', name: 'Bloodfin Tetra', color: '#dc2626', accent: '#7f1d1d',
        size: 22, maxHp: 480, staminaMax: 360, attack: 44, speed: 4.0,
        value: 390, rarity: 'rare', shape: 'minnow', finColor: '#450a0a',
        desc: 'Smells iron on the night rain.',
        hours: [20, 23], weather: ['rain', 'storm', 'clear'], strict: true,
        skills: ['bloodFrenzy', 'dart', 'lure'], skillName: 'Iron Scent'
    },
    {
        id: 'coral_squire', name: 'Coral Squire', color: '#fb7185', accent: '#be123c',
        size: 24, maxHp: 520, staminaMax: 390, attack: 47, speed: 3.6,
        value: 360, rarity: 'rare', shape: 'snapper', finColor: '#881337',
        desc: 'Polite, bright, and completely fearless at noon.',
        skills: ['radiantBarb', 'coralSnare', 'charge'], skillName: 'Reef Oath'
    },
    {
        id: 'abyss_lanternfish', name: 'Abyss Lanternfish', color: '#22d3ee', accent: '#0e7490',
        size: 20, maxHp: 460, staminaMax: 350, attack: 42, speed: 3.4,
        value: 350, rarity: 'rare', shape: 'angler', finColor: '#155e75',
        desc: 'Carries its own moon wherever it goes.',
        skills: ['lure', 'inkCloud', 'shock'], skillName: 'Deep Lamp'
    },
    {
        id: 'typhoon_dart', name: 'Typhoon Dart', color: '#67e8f9', accent: '#0e7490',
        size: 26, maxHp: 550, staminaMax: 410, attack: 52, speed: 6.4,
        value: 480, rarity: 'rare', shape: 'pike', finColor: '#164e63',
        desc: 'Outruns the wind it was born in. Storms only.',
        hours: null, weather: ['storm'], strict: true,
        skills: ['blink', 'charge', 'stormField'], skillName: 'Wind Edge'
    },
    {
        id: 'midnight_rainfish', name: 'Midnight Rainfish', color: '#1e1b4b', accent: '#818cf8',
        size: 25, maxHp: 530, staminaMax: 400, attack: 49, speed: 3.8,
        value: 460, rarity: 'rare', shape: 'trout', finColor: '#312e81',
        desc: 'Exists 20:00-23:00 on rainy nights, and never otherwise.',
        hours: [20, 23], weather: ['rain', 'storm'], strict: true,
        skills: ['inkCloud', 'drain', 'chainLightning'], skillName: 'Night Pour'
    },
    // Epics: event headliners.
    {
        id: 'tempest_queenfish', name: 'Tempest Queenfish', color: '#38bdf8', accent: '#075985',
        size: 46, maxHp: 1700, staminaMax: 900, attack: 122, speed: 6.2,
        value: 2300, rarity: 'epic', shape: 'marlin', finColor: '#0c4a6e',
        desc: 'Crowned in the typhoon wall. Bows to no angler.',
        skills: ['stormField', 'chainLightning', 'tidalWave', 'blink'], skillName: 'Storm Crown'
    },
    {
        id: 'bloodmoon_raya', name: 'Bloodmoon Raya', color: '#991b1b', accent: '#fecaca',
        size: 44, maxHp: 1650, staminaMax: 880, attack: 118, speed: 4.4,
        value: 2200, rarity: 'epic', shape: 'manta', finColor: '#450a0a',
        desc: 'Glides out only under a clear 20:00-23:00 moon.',
        hours: [20, 23], weather: ['clear'], strict: true,
        skills: ['bloodFrenzy', 'mirrorImage', 'tidalSlam'], skillName: 'Red Eclipse'
    },
    {
        id: 'fogmother_eel', name: 'Fogmother Eel', color: '#d8b4fe', accent: '#6b21a8',
        size: 48, maxHp: 1750, staminaMax: 920, attack: 120, speed: 4.8,
        value: 2350, rarity: 'epic', shape: 'eel', finColor: '#3b0764',
        desc: 'Nurses a hundred mistwisps. Fog is her nursery.',
        hours: null, weather: ['fog'], strict: true,
        skills: ['sandVeil', 'shock', 'summonShades', 'drain'], skillName: 'Nursery Mist'
    },
    {
        id: 'dawnherald_marlin', name: 'Dawnherald Marlin', color: '#fdba74', accent: '#c2410c',
        size: 47, maxHp: 1720, staminaMax: 900, attack: 124, speed: 7.2,
        value: 2300, rarity: 'epic', shape: 'marlin', finColor: '#7c2d12',
        desc: 'First fin of the chorus. Dawn only.',
        hours: [5, 7], weather: null, strict: true,
        skills: ['solarBeam', 'charge', 'flashBang', 'blink'], skillName: 'Herald Dash'
    },
    {
        id: 'monsoon_leopardfish', name: 'Monsoon Leopardfish', color: '#15803d', accent: '#052e16',
        size: 43, maxHp: 1600, staminaMax: 860, attack: 116, speed: 5.6,
        value: 2100, rarity: 'epic', shape: 'grouper', finColor: '#14532d',
        desc: 'Spotted bomber of the downpour.',
        skills: ['tidalWave', 'poisonBarb', 'charge'], skillName: 'Spotted Surge'
    },
    {
        id: 'sunscorch_damsel', name: 'Sunscorch Damsel', color: '#fde047', accent: '#b45309',
        size: 40, maxHp: 1500, staminaMax: 820, attack: 112, speed: 5.2,
        value: 2000, rarity: 'epic', shape: 'butterfly', finColor: '#78350f',
        desc: 'Basks in punishing noon sun. Sunspell regular.',
        skills: ['solarBeam', 'radiantBarb', 'flashBang'], skillName: 'Noon Glare'
    },
    {
        id: 'abyssal_anglerfish', name: 'Abyssal Anglerfish', color: '#4c1d95', accent: '#c4b5fd',
        size: 45, maxHp: 1680, staminaMax: 890, attack: 119, speed: 3.6,
        value: 2250, rarity: 'epic', shape: 'angler', finColor: '#2e1065',
        desc: 'Its lamp never lies. It promises teeth.',
        skills: ['lure', 'abyssalGaze', 'voidRend', 'inkBurst'], skillName: 'False Promise'
    },
    // Legendaries: storm-and-moon royalty.
    {
        id: 'typhoon_wyrm', name: 'Typhoon Wyrm', color: '#0ea5e9', accent: '#082f49',
        size: 60, maxHp: 3400, staminaMax: 1700, attack: 175, speed: 5.8,
        value: 6200, rarity: 'legendary', shape: 'serpent', finColor: '#0c4a6e',
        desc: 'The typhoon made flesh. Exists only inside the storm.',
        hours: null, weather: ['storm'], strict: true,
        skills: ['stormSpiral', 'chainLightning', 'tidalCrush', 'stormField'], skillName: 'Wyrm Spiral'
    },
    {
        id: 'pale_mistlord', name: 'Pale Mistlord', color: '#e2e8f0', accent: '#64748b',
        size: 58, maxHp: 3300, staminaMax: 1650, attack: 170, speed: 4.2,
        value: 6000, rarity: 'legendary', shape: 'leviathan', finColor: '#334155',
        desc: 'Rules what the fog hides. Fog only.',
        hours: null, weather: ['fog'], strict: true,
        skills: ['mirrorImage', 'camouflaged', 'voidCollapse', 'tidalSlam'], skillName: 'Grey Throne'
    },
    {
        id: 'crimson_tidereaver', name: 'Crimson Tidereaver', color: '#ef4444', accent: '#450a0a',
        size: 62, maxHp: 3600, staminaMax: 1750, attack: 185, speed: 5.4,
        value: 6800, rarity: 'legendary', shape: 'shark', finColor: '#7f1d1d',
        desc: 'Reaves the 20:00-23:00 tide, rain or shine.',
        hours: [20, 23], weather: ['clear', 'rain'], strict: true,
        skills: ['bloodFrenzy', 'titanSlam', 'whirlpool', 'charge'], skillName: 'Reave Tide'
    },
    {
        id: 'solar_crownfish', name: 'Solar Crownfish', color: '#facc15', accent: '#92400e',
        size: 57, maxHp: 3250, staminaMax: 1620, attack: 172, speed: 5.0,
        value: 6100, rarity: 'legendary', shape: 'angelfish', finColor: '#78350f',
        desc: 'Crowned at high noon under a cloudless sky.',
        hours: [7, 17], weather: ['clear'], strict: true,
        skills: ['solarBeam', 'supernova', 'radiantBarb', 'starFall'], skillName: 'Crown Fire'
    },
    // Mythics: event apices.
    {
        id: 'maelstrom_titan', name: 'Maelstrom Titan', color: '#155e75', accent: '#67e8f9',
        size: 88, maxHp: 9500, staminaMax: 3200, attack: 320, speed: 3.2,
        value: 26000, rarity: 'mythic', shape: 'kraken', finColor: '#0e7490',
        desc: 'The surge before dawn, given arms. Storm 00:00-05:00 only.',
        hours: [0, 5], weather: ['storm'], strict: true,
        skills: ['bossWhirlpool', 'tidalCrush', 'nineHeadVolley', 'stormField'], skillName: 'Surge Arms'
    },
    {
        id: 'moonfall_seraph', name: 'Moonfall Seraph', color: '#fef3c7', accent: '#d97706',
        size: 70, maxHp: 8800, staminaMax: 3000, attack: 300, speed: 4.4,
        value: 24000, rarity: 'mythic', shape: 'manta', finColor: '#92400e',
        desc: 'Falls with the clear 20:00-23:00 moon. Never twice.',
        hours: [20, 23], weather: ['clear'], strict: true,
        skills: ['starFall', 'timeWarp', 'mirrorImage', 'supernova'], skillName: 'Moon Descent'
    },
];

const Projectiles = {
    update(state, delta) {
        if (!state.projectiles) state.projectiles = [];
        const p = state.player;
        const B = CONFIG.WORLD;

        for (let i = state.projectiles.length - 1; i >= 0; i--) {
            const proj = state.projectiles[i];

            // Ownership: my own hooked-fish shots fully simulate (and can
            // hurt ME, the catcher). Another catcher's shots ALSO fully
            // simulate here (shared threat — homing picks the nearest of
            // me/catcher, damage is personal per machine). Echoes of MY
            // own shots (owner===me, non-local) and ownerless boss shots
            // stay visual-only (echoes were already resolved by my sim;
            // boss hits arrive via damage intake).
            let mine = true;
            try {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.roomCode) {
                    mine = Multiplayer.isHost ? !proj.remote : !!proj.local;
                }
            } catch (e) {}
            let visualOnly = false;
            if (!mine) {
                try {
                    const owner = proj.ownerPid || proj.owner;
                    const me = (typeof Multiplayer !== 'undefined' && Multiplayer.localClientId) || null;
                    if (owner && me && owner === me && !proj.local) visualOnly = true;
                    else if (!owner) visualOnly = true;
                } catch (e) { visualOnly = true; }
            }
            if (!mine && visualOnly) {
                this._moveRemote(state, proj, delta);
                if (proj.life <= 0) state.projectiles.splice(i, 1);
                continue;
            }

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

            // Homing logic with improved turn speed. Shared-fight
            // retarget: catcher-owned shots hunt the NEAREST of {me,
            // catcher}, so hooked fish threaten helpers too — not just
            // whoever cast the line.
            if (proj.isHoming && proj.life > 0.3) {
                const tgt = this._homingTarget(state, proj);
                const angle = Math.atan2(tgt.y - proj.y, tgt.x - proj.x);
                proj.vx += Math.cos(angle) * (proj.homingForce || 350) * delta;
                proj.vy += Math.sin(angle) * (proj.homingForce || 350) * delta;
            }

            // Throttled particle trail (was: every frame) so projectiles
            // stay visible instead of drowning in their own sparks.
            // Hydra storm orbs drag lightning behind them: bolts hammer
            // the sea along the flight path + a green wake churns below.
            if (proj._hydraMega && !proj._hydraDead) {
                proj._hydraBoltT = (proj._hydraBoltT || 0) - delta;
                if (proj._hydraBoltT <= 0) {
                    proj._hydraBoltT = 0.12;
                    try {
                        if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                            Combat.strikeLightning(state, proj.x, proj.y, { color: '#6ee7b7', shake: 0 });
                        }
                        if (typeof Particles !== 'undefined' && Particles.spawnWaterSplashes) {
                            Particles.spawnWaterSplashes(state, proj.x, proj.y + 10, 3);
                        }
                    } catch (e2) {}
                }
            }
            const spawnRate = proj.particleDensity || 0.6;
            proj._trailAcc = (proj._trailAcc || 0) + delta;
            if (proj._trailAcc >= 0.06 && Math.random() < spawnRate) {
                proj._trailAcc = 0;
                const count = Math.max(1, Math.round((proj.trailCount || 1) * 0.6));
                Particles.spawnParticles(state, proj.x, proj.y, proj.color, count, {
                    glow: proj.glow || false,
                    size: proj.radius * 0.5
                });
            }

            // 2. Player Collision Check
            // Void mega-orb arrival: burst into 7 small orbs the moment it
            // reaches its locked target (even if the player already moved).
            if (proj._voidMega && typeof proj._voidTX === 'number') {
                const dt2 = Math.hypot(proj._voidTX - proj.x, proj._voidTY - proj.y);
                if (dt2 < Math.max(40, (proj.radius || 26) + 14)) {
                    try { Projectiles._detonateVoidMega(state, proj); } catch (e) {}
                    try {
                        Particles.showFloatingText(state, '🌌 STAR-EATER BURST — 7 ORBS!', proj.x, proj.y - 40, '#c084fc');
                    } catch (e2) {}
                    state.projectiles.splice(i, 1);
                    continue;
                }
            }
            const dist = Math.hypot(p.x - proj.x, p.y - proj.y);
            if (dist < p.radius + proj.radius) {
                // Armor counts vs fish skillshots (was raw hp-=, unfair).
                // damagePlayer handles HUD + flash + death — never die() twice.
                const seq0 = state._deathSeq || 0;
                let dealt = proj.damage;
                if (typeof Combat !== 'undefined' && Combat.damagePlayer) {
                    dealt = Combat.damagePlayer(state, proj.damage, { knockback: 0 });
                } else {
                    p.hp -= proj.damage;
                    Player.refreshHUD(state);
                    if (typeof UI !== 'undefined' && UI.triggerDamageFlash) UI.triggerDamageFlash();
                    if (p.hp <= 0) Player.die(state);
                }
                const died = (state._deathSeq || 0) > seq0;
                if (typeof audio !== 'undefined' && audio.playHit) audio.playHit();
                
                // Burst impact visual (kept small to stay readable)
                Particles.spawnParticles(state, proj.x, proj.y, proj.glowColor || proj.color, 6, {
                    speed: 150,
                    size: proj.radius
                });

                Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25, proj.color);
                Player.refreshHUD(state);
                state.screenShake = proj.impactShake || 10;

                if (!died) {
                    // Knockback away from projectile trajectory — as pull
                    // VELOCITY (0.25s), never a teleport (see Player.addPull).
                    if (typeof Player !== 'undefined' && Player.addPull) {
                        try { Player.addPull(state, (proj.vx > 0 ? 1 : -1) * 100, (proj.vy > 0 ? 1 : -1) * 100, 0.25); } catch (e) {}
                    } else {
                        p.x += (proj.vx > 0 ? 1 : -1) * (proj.knockback || 25);
                        p.y += (proj.vy > 0 ? 1 : -1) * (proj.knockback || 25);
                    }
                    // On-hit riders: stun / slow / shove / grapple / screen fx.
                    // Everything lands ONLY on a real hit — dodge the missile,
                    // dodge the effect.
                    if (proj.stunOnHit) p.stunTimer = Math.max(p.stunTimer || 0, proj.stunOnHit);
                    if (proj.slowOnHit) p.slowTimer = Math.max(p.slowTimer || 0, proj.slowOnHit);
                    if (proj.pushOnHit) {
                        const pv = Math.hypot(proj.vx, proj.vy) || 1;
                        const sp = proj.pushOnHit / 0.25;
                        if (typeof Player !== 'undefined' && Player.addPull) {
                            try { Player.addPull(state, (proj.vx / pv) * sp, (proj.vy / pv) * sp, 0.25); } catch (e) {}
                        } else {
                            p.x += (proj.vx / pv) * proj.pushOnHit;
                            p.y += (proj.vy / pv) * proj.pushOnHit;
                        }
                    }
                    if (proj.pullOnHit && proj.pullX !== undefined && proj.pullY !== undefined) {
                        const pdx = proj.pullX - p.x, pdy = proj.pullY - p.y;
                        const pd = Math.hypot(pdx, pdy) || 1;
                        const sp = proj.pullOnHit / 0.25;
                        if (typeof Player !== 'undefined' && Player.addPull) {
                            try { Player.addPull(state, (pdx / pd) * sp, (pdy / pd) * sp, 0.3); } catch (e) {}
                        } else {
                            p.x += (pdx / pd) * proj.pullOnHit;
                            p.y += (pdy / pd) * proj.pullOnHit;
                        }
                    }
                    // Hydra grasping tide: arrowhead lands -> 5s living
                    // leash anchored to the hydra body (see Player.update).
                    if (proj.tetherDur && !died) {
                        try {
                            const s = proj.tetherSrc || null;
                            p.tether = {
                                src: s, timer: proj.tetherDur,
                                x: (s && Number.isFinite(s.x)) ? s.x : p.x,
                                y: (s && Number.isFinite(s.y)) ? s.y : p.y,
                            };
                            Particles.showFloatingText(state, '🪢 TETHERED — IT DRAGS YOU IN!', p.x, p.y - 60, '#4ade80');
                        } catch (e) {}
                    }
                    if (proj.flashOnHit) p.flashTimer = Math.max(p.flashTimer || 0, proj.flashOnHit);
                    if (proj.blurOnHit) p.blurTimer = Math.max(p.blurTimer || 0, proj.blurOnHit);

                    // Clamp player within walkable bounds — map-aware (the old
                    // mainland-only clamp teleported isle players to the far
                    // surf after a pull; see WorldSystem.clampEntity).
                    if (typeof WorldSystem !== 'undefined' && WorldSystem.clampEntity) {
                        try { WorldSystem.clampEntity(state, p, p.radius); } catch (e) {}
                    } else {
                    p.x = Utils.clamp(p.x, B.MIN_X + p.radius, state.waterBoundaryX - p.radius);
                    p.y = Utils.clamp(p.y, B.MIN_Y + p.radius, B.MAX_Y - p.radius);
                    }
                }

                // Remove projectile (mega-orbs burst on impact too)
                try {
                    if (proj._voidMega) Projectiles._detonateVoidMega(state, proj);
                    if (proj._hydraMega) Projectiles._detonateHydraMega(state, proj);
                } catch (e) {}
                state.projectiles.splice(i, 1);
                continue;
            }

            // 3. Expiration / Out of Bounds Cleanup
            if (proj.life <= 0 || proj.x < B.MIN_X || proj.y < B.MIN_Y || proj.y > B.MAX_Y) {
                try {
                    if (proj._voidMega) Projectiles._detonateVoidMega(state, proj);
                    if (proj._hydraMega) Projectiles._detonateHydraMega(state, proj);
                } catch (e) {}
                Particles.spawnParticles(state, proj.x, proj.y, proj.color, proj.radius > 12 ? 5 : 3);
                state.projectiles.splice(i, 1);
            }
        }
    },

    // Shared-fight homing target: nearest of {my body, catcher body}.
    // Solo / ownerless shots always hunt me (unchanged base behavior).
    _homingTarget(state, proj) {
        const p = state.player;
        let tx = p.x, ty = p.y;
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.roomCode) return { x: tx, y: ty };
            const owner = proj.ownerPid || proj.owner;
            if (!owner) return { x: tx, y: ty };
            let cx = null, cy = null;
            if (state.remotePlayers && state.remotePlayers[owner]) {
                const rp = state.remotePlayers[owner];
                cx = (typeof rp.rx === 'number') ? rp.rx : rp.x;
                cy = (typeof rp.ry === 'number') ? rp.ry : rp.y;
            } else if (Multiplayer.hostPeers && Multiplayer.hostPeers[owner]) {
                cx = Multiplayer.hostPeers[owner].x;
                cy = Multiplayer.hostPeers[owner].y;
            }
            if (typeof cx !== 'number' || typeof cy !== 'number') return { x: tx, y: ty };
            // Owner IS me (my own shots): target me, exactly like solo.
            const me = Multiplayer.localClientId || null;
            if (me && owner === me) return { x: tx, y: ty };
            const dMe = Math.hypot(p.x - proj.x, p.y - proj.y);
            const dC = Math.hypot(cx - proj.x, cy - proj.y);
            if (dC < dMe) { tx = cx; ty = cy; }
        } catch (e) {}
        return { x: tx, y: ty };
    },

    // Dead-reckoning for another catcher's skill shots (shared fight
    // visibility): integrate motion, home toward the CATCHER's body
    // (remote snapshot or host roster — never toward my own player),
    // suppressed trail only, silent expiry. No collision, no damage,
    // nothing re-emitted: the catcher's sim owns all of that.
    _moveRemote(state, proj, delta) {
        try {
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 0, MAX_X: 9999, MIN_Y: 0, MAX_Y: 9999 };
            proj.x += (proj.vx || 0) * delta;
            proj.y += (proj.vy || 0) * delta;
            proj.life = (proj.life || 0) - delta;
            if (proj.isSpiral) {
                proj.spiralAngle = (proj.spiralAngle || 0) + delta * 8;
                proj.x += Math.cos(proj.spiralAngle) * (proj.spiralRadius || 3);
                proj.y += Math.sin(proj.spiralAngle) * (proj.spiralRadius || 3);
            }
            // Catcher position: remote snapshot on clients, host roster
            // on the host (hostPeers mirrors every client's latest input).
            let tx = null, ty = null;
            try {
                const o = proj.ownerPid || proj.owner;
                if (o && state.remotePlayers && state.remotePlayers[o]) {
                    const rp = state.remotePlayers[o];
                    tx = (typeof rp.rx === 'number') ? rp.rx : rp.x;
                    ty = (typeof rp.ry === 'number') ? rp.ry : rp.y;
                } else if (o && typeof Multiplayer !== 'undefined' && Multiplayer.hostPeers && Multiplayer.hostPeers[o]) {
                    tx = Multiplayer.hostPeers[o].x;
                    ty = Multiplayer.hostPeers[o].y;
                }
            } catch (e) {}
            if (proj.isHoming && proj.life > 0.3 && typeof tx === 'number' && typeof ty === 'number') {
                const angle = Math.atan2(ty - proj.y, tx - proj.x);
                proj.vx = (proj.vx || 0) + Math.cos(angle) * (proj.homingForce || 350) * delta;
                proj.vy = (proj.vy || 0) + Math.sin(angle) * (proj.homingForce || 350) * delta;
            }
            // Arrival burst at the catcher: eye candy only.
            if (typeof tx === 'number' && typeof ty === 'number' &&
                Math.hypot(tx - proj.x, ty - proj.y) < (proj.radius || 8) + 18) {
                proj.life = 0;
            }
            if (proj.x < B.MIN_X || proj.y < B.MIN_Y || proj.y > B.MAX_Y) proj.life = 0;
            // Suppressed trail: local-only, never echoed back to the room.
            let suppress = false;
            try {
                if (typeof Multiplayer !== 'undefined' && !Multiplayer._suppressFxEmit) {
                    Multiplayer._suppressFxEmit = true;
                    suppress = true;
                }
            } catch (e) {}
            try {
                if (proj.life > 0 && Math.random() < 0.5 && typeof Particles !== 'undefined') {
                    Particles.spawnParticles(state, proj.x, proj.y, proj.color, 1, { size: (proj.radius || 8) * 0.4 });
                }
                if (proj.life <= 0 && typeof Particles !== 'undefined') {
                    Particles.spawnParticles(state, proj.x, proj.y, proj.color, 4, { size: 3 });
                }
            } finally {
                try { if (suppress && typeof Multiplayer !== 'undefined') Multiplayer._suppressFxEmit = false; } catch (e) {}
            }
        } catch (e) {}
    },

    spawn(state, x, y, targetX, targetY, speed, damage, color, options = {}) {
        if (!state.projectiles) state.projectiles = [];
        const angle = Math.atan2(targetY - y, targetX - x);

        state.projectiles.push({
            id: 'p' + (state._pjSeq = (state._pjSeq || 0) + 1),
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
            knockback: options.knockback || 25,
            // On-hit riders (all dodgeable — they land only on real impact)
            stunOnHit: options.stunOnHit || 0,
            slowOnHit: options.slowOnHit || 0,
            pullOnHit: options.pullOnHit || 0, // px dragged toward (pullX, pullY)
            pullX: options.pullX, pullY: options.pullY,
            pushOnHit: options.pushOnHit || 0, // px shoved along flight dir
            flashOnHit: options.flashOnHit || 0, // sec of white screen flash
            blurOnHit: options.blurOnHit || 0,    // sec of blurred screen
            // Void mega-orb split (Star-Eater Orb): when the huge orb
            // reaches its locked target it bursts into N small orbs.
            _voidMega: !!options._voidMega,
            _voidTX: options._voidTX, _voidTY: options._voidTY,
            _voidSplit: options._voidSplit || 7,
            _voidDead: false,
            // Hydra storm orb: lightning hammers the sea behind it as it
            // flies + a green wake. Single huge impact, no split.
            _hydraMega: !!options._hydraMega,
            _hydraBoltT: 0,
            _hydraDead: false
        });
    },

    // Mega-orb arrival burst: exactly N small orbs, radial, no homing.
    // Shared by arrival-at-target, player impact and expiry so the split
    // ALWAYS happens once, wherever the huge orb dies.
    _detonateVoidMega(state, proj) {
        try {
            if (!proj || proj._voidDead) return;
            proj._voidDead = true;
            const n = Math.max(1, Math.min(12, proj._voidSplit || 7));
            const dmg = Math.max(1, Math.round((proj.damage || 40) * 0.35));
            for (let i = 0; i < n; i++) {
                const a = (Math.PI * 2 / n) * i;
                Projectiles.spawn(state, proj.x, proj.y,
                    proj.x + Math.cos(a) * 500, proj.y + Math.sin(a) * 500,
                    380, dmg, '#c084fc', {
                        radius: 10, life: 2.2, glow: true, glowColor: '#22d3ee',
                    });
            }
            try {
                state.delayedBlasts = state.delayedBlasts || [];
                state.delayedBlasts.push({
                    x: proj.x, y: proj.y, radius: 110, damage: Math.round(dmg * 0.8),
                    timer: 0.25, color: '#a855f7', shake: 16,
                });
                Particles.spawnParticles(state, proj.x, proj.y, '#e9d5ff', 24, { size: 5 });
                Particles.spawnParticles(state, proj.x, proj.y, '#a855f7', 16, { size: 4 });
                state.screenShake = Math.max(state.screenShake || 0, 16);
                try { audio.playExplosion(); } catch (e) {}
            } catch (e) {}
        } catch (e) {}
    },

    // Storm-orb impact: one huge green detonation + a sky bolt straight
    // down onto it. Single hit, no split — dodge the orb, dodge it all.
    _detonateHydraMega(state, proj) {
        try {
            if (!proj || proj._hydraDead) return;
            proj._hydraDead = true;
            const dmg = Math.max(1, Math.round(proj.damage || 60));
            try {
                state.delayedBlasts = state.delayedBlasts || [];
                state.delayedBlasts.push({
                    x: proj.x, y: proj.y, radius: 130, damage: dmg,
                    timer: 0.3, color: '#10b981', shake: 20, stunOnBlast: 0.5,
                });
                if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                    Combat.strikeLightning(state, proj.x, proj.y, { color: '#a7f3d0', shake: 10 });
                }
                Particles.spawnParticles(state, proj.x, proj.y, '#ecfdf5', 26, { size: 6 });
                Particles.spawnParticles(state, proj.x, proj.y, '#10b981', 18, { size: 4 });
                state.screenShake = Math.max(state.screenShake || 0, 20);
                try { audio.playExplosion(); } catch (e) {}
            } catch (e) {}
        } catch (e) {}
    }
};

// Full-roster roll table: EVERY unique non-boss species is catchable.
// (The old hand-picked 34-entry table left 204 species — incl. 44 of the
// 50 commons — impossible to hook, which is why indexes stalled at ~25.)
// Bosses are excluded on purpose: BOSS_TIDE (below) is their only hook.
const FISH_ROLL_TABLE = (() => {
    const base = { common: 12, rare: 8, epic: 4.2, legendary: 1.5, mythic: 0.45 };
    const seen = new Set();
    const out = [];
    FISH_SPECIES.forEach((s, i) => {
        if (!s || !s.id || s.isBoss || seen.has(s.id)) return;
        seen.add(s.id);
        const w = (base[s.rarity] || 6) * (0.85 + 0.3 * (((i * 37) % 100) / 100));
        out.push({ species: s, weight: Math.max(0.05, w) });
    });
    return out;
})();
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
    // Equipped bait luck stacks on top (1 bait eaten per hook)
    let baitLuck = 0;
    try {
        const hb = (typeof Ritual !== 'undefined' && Ritual.equippedBait && state) ? Ritual.equippedBait(state) : null;
        if (hb && hb.luckBonus) baitLuck = hb.luckBonus;
    } catch (e) {}
    const effLuck = luck + baitLuck + ((state && state.player && (state.player.luckT || 0) > 0) ? 2.0 : 0);

    // BOSS TIDE — very rare hook. Bosses previously could never be rolled,
    // so the boss bar / boss fights were unreachable. High level + luck
    // slightly raise the odds. Hydra + Crimson bite far rarer than the
    // other two (they also have their own dedicated paths: Hydra Lure /
    // high-tier water), so the tide table weights them down.
    const BOSS_TIDE_WEIGHTS = { stormlord_hydra: 0.25, crimson_emperor: 0.25 };
    const pLevel = (state && state.player && state.player.level) || 1;
    const bossChance = 0.004 + effLuck * 0.002 + (pLevel >= 10 ? 0.002 : 0);
    if (Math.random() < bossChance) {
        const bosses = FISH_SPECIES.filter(f => f.isBoss);
        if (bosses.length) {
            // Weighted pick (default weight 1): hydra/crimson = rare guests.
            let totalW = 0;
            for (const b of bosses) totalW += BOSS_TIDE_WEIGHTS[b.id] || 1;
            let rollW = Math.random() * totalW;
            let boss = bosses[bosses.length - 1];
            for (const b of bosses) {
                rollW -= BOSS_TIDE_WEIGHTS[b.id] || 1;
                if (rollW <= 0) { boss = b; break; }
            }
            if (typeof Particles !== 'undefined' && state) {
                Particles.showFloatingText(state, '⚠ BOSS TIDE! ⚠', state.player.x, state.player.y - 70, '#ef4444');
            }
            try { if (typeof audio !== 'undefined') audio.playRoar(); } catch (e) {}
            return boss;
        }
    }

    // Build a weighted table (recompute each roll so it always uses current luck)
    const luckMult = {
        common:    1.0,                       // never boosted
        rare:      1.0 + effLuck * 0.10,      // small bump
        epic:      1.0 + effLuck * 0.35,      // medium bump
        legendary: 1.0 + effLuck * 0.65,      // big bump
        mythic:    1.0 + effLuck * 1.00,      // full luck multiplier
        boss:      1.0 + effLuck * 1.00
    };

    let total = 0;
    const weighted = FISH_ROLL_TABLE.map(entry => {
        const rarity = (entry.species && entry.species.rarity) || 'common';
        const mult = luckMult[rarity] || 1.0;
        // 1.1.5 WORLD: time / weather / water-tier conditions reshape the
        // table — matching fish get up to ~9x weight (see WorldSystem).
        let cond = 1;
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.bonusFor && state) {
                cond = WorldSystem.bonusFor(entry.species, state) || 1;
            }
        } catch (e) { cond = 1; }
        // Hard spawn gates: strict-schedule fish (20:00–23:00 + rain, …)
        // weigh ZERO outside their window — they simply do not exist then.
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.spawnAllowed && state) {
                if (!WorldSystem.spawnAllowed(entry.species, state)) cond = 0;
            }
        } catch (e) {}
        const w = entry.weight * mult * cond;
        total += w;
        return { species: entry.species, weight: w };
    });

    // Weighted random selection. Empty table (every gate closed — should
    // be impossible, but never hand back a gate-bypassed index-0 fish):
    // prefer a table entry, else null (callers null-check).
    if (!(total > 0)) return (FISH_ROLL_TABLE[0] && FISH_ROLL_TABLE[0].species) || null;
    const roll = Math.random() * total;
    let acc = 0;
    for (const entry of weighted) {
        acc += entry.weight;
        if (roll < acc) return entry.species;
    }
    return FISH_SPECIES[0];
}

// ============================================================
//  PER-CATCH INSTANCE — size variation, dot patterns, shinies.
//  Clones the species so per-fish mods never mutate the globals.
//  value x3, maxHp/attack x1.5 on shiny.
// ============================================================
// ============================================================
//  MUTATION SYSTEM — 32 catchable mutations. Each tints the body
//  (accent override + aura in Render), and scales HP / damage / value.
//  Blood fuels the Leviathan Priest chain (Marlin -> Heart -> rite).
//  { w: catch weight, pre: name prefix, color, hp/atk/val mults }
// ============================================================
const MUTATIONS = {
    void:      { w: 8,  pre: 'Void',     color: '#a855f7', hp: 1.0,  atk: 1.2,  val: 1.5 },
    golden:    { w: 4,  pre: 'Golden',   color: '#fbbf24', hp: 1.0,  atk: 1.0,  val: 2.0 },
    giant:     { w: 6,  pre: 'Giant',    color: '#fb923c', hp: 1.6,  atk: 1.0,  val: 1.3, big: true },
    blood:     { w: 0,  pre: 'Blood',    color: '#dc2626', hp: 1.3,  atk: 1.3,  val: 1.5 },
    toxic:     { w: 7,  pre: 'Toxic',    color: '#84cc16', hp: 1.1,  atk: 1.25, val: 1.3 },
    diamond:   { w: 2,  pre: 'Diamond',  color: '#e0f2fe', hp: 1.4,  atk: 1.1,  val: 3.0 },
    ember:     { w: 6,  pre: 'Ember',    color: '#f97316', hp: 1.15, atk: 1.3,  val: 1.6 },
    frost:     { w: 6,  pre: 'Frost',    color: '#bae6fd', hp: 1.2,  atk: 1.0,  val: 1.5 },
    storm:     { w: 5,  pre: 'Storm',    color: '#38bdf8', hp: 1.1,  atk: 1.35, val: 1.7 },
    mossy:     { w: 8,  pre: 'Mossy',    color: '#4d7c0f', hp: 1.25, atk: 0.9,  val: 1.2 },
    venom:     { w: 5,  pre: 'Venom',    color: '#4ade80', hp: 1.05, atk: 1.4,  val: 1.6 },
    crystal:   { w: 4,  pre: 'Crystal',  color: '#a5f3fc', hp: 1.3,  atk: 1.0,  val: 2.0 },
    shadow:    { w: 5,  pre: 'Shadow',   color: '#64748b', hp: 1.2,  atk: 1.3,  val: 1.8 },
    radiant:   { w: 3,  pre: 'Radiant',  color: '#fef08a', hp: 1.1,  atk: 1.1,  val: 2.2 },
    magma:     { w: 4,  pre: 'Magma',    color: '#ef4444', hp: 1.2,  atk: 1.45, val: 1.9 },
    tidal:     { w: 6,  pre: 'Tidal',    color: '#22d3ee', hp: 1.15, atk: 1.15, val: 1.5 },
    electric:  { w: 4,  pre: 'Electric', color: '#fde047', hp: 1.05, atk: 1.5,  val: 1.8 },
    frozen:    { w: 5,  pre: 'Frozen',   color: '#cffafe', hp: 1.35, atk: 0.95, val: 1.6 },
    obsidian:  { w: 3,  pre: 'Obsidian', color: '#44403c', hp: 1.5,  atk: 1.3,  val: 2.0 },
    pearl:     { w: 3,  pre: 'Pearl',    color: '#fdf4ff', hp: 1.0,  atk: 1.0,  val: 2.4 },
    copper:    { w: 7,  pre: 'Copper',   color: '#b45309', hp: 1.1,  atk: 1.05, val: 1.4 },
    silver:    { w: 5,  pre: 'Silver',   color: '#e2e8f0', hp: 1.15, atk: 1.05, val: 1.8 },
    platinum:  { w: 2,  pre: 'Platinum', color: '#f8fafc', hp: 1.25, atk: 1.15, val: 2.6 },
    rainbow:   { w: 2,  pre: 'Rainbow',  color: '#f0abfc', hp: 1.2,  atk: 1.2,  val: 2.8 },
    ghost:     { w: 4,  pre: 'Ghost',    color: '#cbd5e1', hp: 0.9,  atk: 1.1,  val: 1.7 },
    lunar:     { w: 4,  pre: 'Lunar',    color: '#c4b5fd', hp: 1.2,  atk: 1.2,  val: 2.0 },
    solar:     { w: 4,  pre: 'Solar',    color: '#fdba74', hp: 1.2,  atk: 1.3,  val: 2.0 },
    algae:     { w: 8,  pre: 'Algae',    color: '#65a30d', hp: 1.3,  atk: 0.85, val: 1.1 },
    sandy:     { w: 7,  pre: 'Sandy',    color: '#d4a373', hp: 1.15, atk: 1.0,  val: 1.2 },
    abyssal:   { w: 2,  pre: 'Abyssal',  color: '#818cf8', hp: 1.4,  atk: 1.4,  val: 2.2 },
    thunder:   { w: 3,  pre: 'Thunder',  color: '#a5b4fc', hp: 1.1,  atk: 1.45, val: 1.9 },
    kelp:      { w: 6,  pre: 'Kelp',     color: '#16a34a', hp: 1.2,  atk: 0.95, val: 1.25 },
};

// Blood odds scale with rarity (endgame chase, not lottery).
const BLOOD_CHANCE = { common: 0.005, rare: 0.01, epic: 0.10, legendary: 0.18, mythic: 0.25 };

function applyMutation(sp, mutId) {
    const def = (typeof MUTATIONS !== 'undefined' && MUTATIONS[mutId]) || null;
    if (!sp || !def) return sp;
    sp.mutation = mutId;
    sp.name = def.pre + ' ' + sp.name;
    sp.mutColor = def.color;
    sp.maxHp = Math.round((sp.maxHp || 100) * (def.hp || 1));
    sp.attack = Math.round((sp.attack || 10) * (def.atk || 1));
    sp.value = Math.round((sp.value || 10) * (def.val || 1));
    if (def.big) sp.size = Math.round((sp.size || 14) * 1.4);
    return sp;
}

function makeCatchInstance(base, luck, wx) {
    if (!base) return null;
    const sp = Object.assign({}, base);
    luck = luck || 0;
    const sizeMult = 0.85 + Math.random() * 0.35; // 0.85x - 1.2x
    sp.size = Math.max(6, Math.round((sp.size || 14) * sizeMult));
    sp.sizeMult = sizeMult;
    const n = Math.floor(Math.random() * 9); // 0-8 random dots
    sp.pattern = { dots: [] };
    for (let i = 0; i < n; i++) {
        sp.pattern.dots.push({
            dx: (Math.random() - 0.5) * 1.2,
            dy: (Math.random() - 0.5) * 0.9,
            r: 0.04 + Math.random() * 0.08
        });
    }
    const chance = Math.min(0.08, 0.015 + luck * 0.01);
    sp.shiny = Math.random() < chance;
    if (sp.shiny) {
        sp.name = '✨ Shiny ' + sp.name;
        sp.value = Math.round((sp.value || 10) * 3);
        sp.maxHp = Math.round((sp.maxHp || 100) * 1.5);
        sp.attack = Math.round((sp.attack || 10) * 1.5);
        sp.staminaMax = Math.round((sp.staminaMax || 100) * 1.25);
    }
    // MUTATIONS (skip if shiny — one special trait per fish).
    // Blood rolls on its own rarity-scaled odds (priest chain);
    // everything else shares one weighted ~12% roll. Both scale with
    // the sky surge multiplier wx (aurora/storm/monsoon).
    if (!sp.shiny && !base.isBoss) {
        const rar = base.rarity || 'common';
        const wxm = Math.max(1, Math.min(3, Number(wx) || 1));
        const bloodCh = Math.min(0.6, (((typeof BLOOD_CHANCE !== 'undefined' && BLOOD_CHANCE[rar]) || 0)) * wxm);
        if (bloodCh > 0 && Math.random() < bloodCh) {
            applyMutation(sp, 'blood');
        } else if (Math.random() < Math.min(0.32, 0.12 * wxm) && typeof MUTATIONS !== 'undefined') {
            let total = 0;
            for (const k in MUTATIONS) {
                if (k === 'blood') continue;
                total += (MUTATIONS[k].w || 1);
            }
            let roll = Math.random() * total, pick = null;
            for (const k in MUTATIONS) {
                if (k === 'blood') continue;
                roll -= (MUTATIONS[k].w || 1);
                if (roll <= 0) { pick = k; break; }
            }
            if (pick) applyMutation(sp, pick);
        }
    }
    // BRUTAL TIDE difficulty: every catch is tankier, angrier, and pays
    // less. Tuned in one place via CONFIG.DIFFICULTY.
    try {
        const D = (typeof CONFIG !== 'undefined' && CONFIG.DIFFICULTY) || {};
        sp.maxHp = Math.round((sp.maxHp || 100) * (D.FISH_HP_MULT || 1));
        sp.staminaMax = Math.round((sp.staminaMax || 100) * (D.FISH_STAMINA_MULT || 1));
        sp.attack = Math.max(1, Math.round((sp.attack || 10) * (D.FISH_ATK_MULT || 1)));
        sp.value = Math.max(1, Math.round((sp.value || 10) * (D.FISH_VALUE_MULT || 1)));
    } catch (e) {}
    return sp;
}

// Extra skill assignments (appended, never duplicated)
const SKILL_PATCH = {
    inkBurst: ['prism_squid', 'chronos_squid', 'giant_squid', 'colossal_squid', 'cuttlefish', 'moon_jelly'],
    bubblePrison: ['puffer', 'toadfish', 'frogfish', 'ocean_sunfish', 'angler', 'seahorse'],
    bloodFrenzy: ['shark', 'tiger_shark', 'great_white', 'megalodon', 'megalodon_prime', 'barracuda', 'bluefish', 'dogtooth_tuna'],
    mirrorImage: ['neon_tetra', 'sardine', 'herring', 'pilchard', 'anchovy', 'sprat', 'minnow'],
    sandVeil: ['flounder', 'halibut', 'sole', 'turbot', 'flatfish', 'plaice', 'goby', 'mudskipper'],
    thunderDive: ['thunder_ray', 'electric_ray', 'electric_eel_giant', 'eel'],
    coralSnare: ['coral_dragon', 'parrotfish', 'butterflyfish', 'angelfish'],
    abyssalGaze: ['viperfish', 'angler', 'void_drake', 'storm_hydra']
};
try {
    for (const [skill, ids] of Object.entries(SKILL_PATCH)) {
        for (const s of FISH_SPECIES) {
            if (ids.includes(s.id)) {
                if (!Array.isArray(s.skills)) s.skills = [s.skills || 'waterJet'];
                if (!s.skills.includes(skill)) s.skills.push(skill);
            }
        }
    }
} catch (e) {}

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
        // 6 delayed meteor impacts forming a rough line toward the player
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = 0; i < 6; i++) {
            const t = i / 5;
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
        // Two-stage: 9-burst nova, then a delayed big blast
        for (let i = 0; i < 9; i++) {
            const a = (Math.PI * 2 / 9) * i + Math.atan2(p.y - fish.y, p.x - fish.x);
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 550, fish.y + Math.sin(a) * 550,
                560, dmg, '#f59e0b', { radius: 15, glow: true, particleDensity: 0.6 });
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
        // Grapple orb: slow, homing — dodge it or get yanked toward the
        // fish ON IMPACT. No more instant yank (was unfair).
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 340, dmg, '#c084fc', {
            radius: 15, isHoming: true, homingForce: 420,
            life: 5.0, glow: true, glowColor: '#f472b6', trailCount: 2,
            pullOnHit: 180, pullX: fish.x, pullY: fish.y
        });
        // Void rift where the player stood when cast (telegraphed — move!)
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
            trailCount: 3, impactShake: 24
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
        // Drag orb: dodge it or get reeled 200px toward the fish on impact
        Projectiles.spawn(ctx.state, fish.x, fish.y, p.x, p.y, 360, Math.round(dmg * 0.6), '#0284c7', {
            radius: 16, isHoming: true, homingForce: 380,
            life: 4.0, glow: true, glowColor: '#7dd3fc',
            pullOnHit: 200, pullX: fish.x, pullY: fish.y
        });

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
        // BACKSTAB, telegraphed: mark the strike point behind the player
        // FIRST (warning ring + shout), and only blink in when it lands.
        // Sidestep the ring and the ambush whiffs.
        const a = Math.atan2(p.y - fish.y, p.x - fish.x) + Math.PI;
        const d = 60;
        const sx = Utils.clamp(p.x + Math.cos(a) * d,
            ctx.state.waterBoundaryX + 20, CONFIG.WORLD.MAX_X - 30);
        const sy = Utils.clamp(p.y + Math.sin(a) * d,
            CONFIG.WORLD.MIN_Y + 30, CONFIG.WORLD.MAX_Y - 30);
        const dmg = getSkillDamage(fish, 0.9);
        ctx.state.delayedBlasts.push({
            x: sx, y: sy, radius: 55, damage: 0,
            timer: 0.75, color: '#fde047', shake: 0,
            onDetonate: () => {
                if (!fish || fish.isDead) return;
                fish.x = sx;
                fish.y = sy;
                ctx.spawnParticles(sx, sy, '#fde047', 20);
                ctx.state.delayedBlasts.push({
                    x: sx, y: sy, radius: 55, damage: dmg,
                    timer: 0.25, color: '#fde047', shake: 12
                });
            }
        });
        ctx.showFloatingText("⚠ BEHIND YOU!", p.x, p.y - 55, '#fde047');
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
        // The flash IS the effect: white-screen blindness, no damage, no
        // stun — vision comes back on its own. Sparks + patch still burn.
        p.flashTimer = Math.max(p.flashTimer || 0, 0.6);
        UI.triggerDamageFlash();
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
        // Wind-up first: warning ring on the charger, THEN the dash fires
        // down the telegraphed lane (cast-time angle — dodgers are safe).
        ctx.state.delayedBlasts.push({
            x: fish.x, y: fish.y, radius: 55, damage: 0,
            timer: 0.45, color: '#f87171', shake: 0,
            onDetonate: () => {
                if (!fish || fish.isDead) return;
                const tgt = fish._monster || fish;
                tgt.vx = (tgt.vx || 0) + Math.cos(angle) * 800;
                tgt.vy = (tgt.vy || 0) + Math.sin(angle) * 800;
                ctx.state.screenShake = 10;
            }
        });
        // Dust trail telegraphing the charge lane
        for (let i = 1; i <= 6; i++) {
            ctx.state.delayedBlasts.push({
                x: fish.x + Math.cos(angle) * i * 60,
                y: fish.y + Math.sin(angle) * i * 60,
                radius: 50, damage: getSkillDamage(fish, 0.6),
                timer: 0.45 + i * 0.1, color: '#f87171', shake: 8
            });
        }
        ctx.showFloatingText("⚠ CHARGE INCOMING!", fish.x, fish.y - 40, '#f87171');
    },

    // ============================================================
    //  HIGH-END SKILLS
    // ============================================================
    emberBreath(fish, ctx) {
        const p = ctx.state.player;
        const dmg = getSkillDamage(fish, 1.6);
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        // 5-beam cone (was 7 — same punch per beam, less wall)
        for (let i = -2; i <= 2; i++) {
            const a = baseA + i * 0.14;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                620, dmg, '#f97316', {
                    radius: 13, glow: true, glowColor: '#fed7aa', particleDensity: 0.6
                });
        }
        // Fire trails along the breath
        for (let i = 0; i < 4; i++) {
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
        // Same wind-up contract as charge, heavier dash.
        ctx.state.delayedBlasts.push({
            x: fish.x, y: fish.y, radius: 65, damage: 0,
            timer: 0.5, color: '#7c3aed', shake: 0,
            onDetonate: () => {
                if (!fish || fish.isDead) return;
                const tgt = fish._monster || fish;
                tgt.vx = (tgt.vx || 0) + Math.cos(a) * 1100;
                tgt.vy = (tgt.vy || 0) + Math.sin(a) * 1100;
                ctx.state.screenShake = 22;
            }
        });
        ctx.state.screenShake = 8;
        // Trail of blasts along the charge path
        for (let i = 1; i <= 6; i++) {
            ctx.state.delayedBlasts.push({
                x: fish.x + Math.cos(a) * i * 70,
                y: fish.y + Math.sin(a) * i * 70,
                radius: 55, damage: getSkillDamage(fish, 0.8),
                timer: 0.5 + i * 0.08, color: '#7c3aed', shake: 12
            });
        }
        ctx.showFloatingText("⚠ ELDER CHARGE!", fish.x, fish.y - 40, '#7c3aed');
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
        // Two-stage: 12-projectile nova, then 8 delayed blasts
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 / 12) * i;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                620, dmg, '#7c3aed', {
                    radius: 16, glow: true, glowColor: '#ffffff', particleDensity: 0.6
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
            trailCount: 3, impactShake: 24, knockback: 70
        });
        // Light trail of hazards behind it
        const a = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = 1; i <= 4; i++) {
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
            life: 7.0, glow: true, glowColor: '#cffafe', trailCount: 2, impactShake: 22
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
        // Spread of 7 ink globs (was 10 — same ink, less wall)
        for (let i = 0; i < 7; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = 40 + Math.random() * 120;
            Projectiles.spawn(ctx.state, fish.x, fish.y,
                fish.x + Math.cos(a) * d, fish.y + Math.sin(a) * d,
                300, dmg, '#1e293b', { radius: 14, life: 2.8, particleDensity: 0.6 });
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
            radius: 22, glow: true, glowColor: '#7dd3fc', trailCount: 2, impactShake: 22
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
        // 7 meteors, some aimed at player, some around
        for (let i = 0; i < 7; i++) {
            const usePlayer = i < 5;
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
            life: 7.0, glow: true, glowColor: '#ffffff', trailCount: 2, impactShake: 24
        });
        // Time bubble hazards that force movement
        for (let i = 0; i < 4; i++) {
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
        // The HYDRA casts with all 9 heads: 9 orbs, harder hits.
        const isHydra = fish && fish.species && fish.species.id === 'stormlord_hydra';
        const orbCount = isHydra ? 9 : 6;
        const orbDmg = isHydra ? 85 : 50;
        for (let i = 0; i < orbCount; i++) {
            const a = (Math.PI * 2 / orbCount) * i;
            const d = 80;
            const x = fish.x + Math.cos(a) * d;
            const y = fish.y + Math.sin(a) * d;
            state.delayedBlasts.push({
                x, y, radius: 45, damage: 0, timer: 0.5,
                color: '#10b981', shake: 5,
                onDetonate: () => {
                    try { if (typeof audio !== 'undefined' && audio.playSkillBlast) audio.playSkillBlast(); } catch (e) {}
                    for (let k = 0; k < 4; k++) {
                        const ka = (Math.PI * 2 / 4) * k + Math.PI / 4;
                        state.bullets.push({
                            x, y,
                            vx: Math.cos(ka) * 220,
                            vy: Math.sin(ka) * 220,
                            owner: 'enemy',
                            radius: 9, damage: orbDmg,
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
        ctx.showFloatingText(isHydra ? "⚠ 9 STORM ORBS! ⚠" : "⚠ STORM ORBS! ⚠", fish.x, fish.y - 60, '#10b981');
    },

    // HYDRA signature: all 9 heads spit at once — a wide fan of heavy bolts.
    nineHeadVolley(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = 0; i < 9; i++) {
            const a = baseA + (i - 4) * 0.14;
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 800, fish.y + Math.sin(a) * 800,
                460, 90, '#10b981', {
                    radius: 11, glow: true, glowColor: '#6ee7b7', life: 3.2
                });
        }
        // One heavy head-butt blast where you stand — the ring is the warning.
        state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 95, damage: 110,
            timer: 0.7, color: '#10b981', shake: 20, stunOnBlast: 0.6
        });
        state.screenShake = Math.max(state.screenShake || 0, 20);
        try { audio.playThunder(); } catch (e) {}
        try { audio.playSkillZap(); } catch (e) {}
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText("🐲 NINE-HEAD VOLLEY!", fish.x, fish.y - 60, '#10b981');
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
        // A dodgeable tidal wall: 5 fast projectiles that SHOVE on hit.
        // Sidestep the wall, feel nothing (was: instant 260 push + 120 dmg).
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = -2; i <= 2; i++) {
            const a = baseA + i * 0.12;
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                520, 60, '#0ea5e9', {
                    radius: 13, glow: true, glowColor: '#7dd3fc', pushOnHit: 260
                });
        }
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
        // Drag orb + vortex: dodge the slow orb or get reeled in on impact
        Projectiles.spawn(state, fish.x, fish.y, p.x, p.y, 320, 50, '#0284c7', {
            radius: 20, isHoming: true, homingForce: 350,
            life: 5.0, glow: true, glowColor: '#7dd3fc',
            pullOnHit: 220, pullX: fish.x, pullY: fish.y
        });

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
        }
        // The strike lands where you STAND in 0.55s — the ring is the
        // warning. Move out, take nothing (was: instant unavoidable 60).
        // Hydra's 9 heads charge it harder.
        const isHydraCL = fish && fish.species && fish.species.id === 'stormlord_hydra';
        state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 80, damage: isHydraCL ? 110 : 60,
            timer: 0.55, color: '#facc15', shake: 16, stunOnBlast: 0.5
        });
        state.screenShake = 16;
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText("⚡ CHAIN LIGHTNING!", fish.x, fish.y - 50, '#facc15');
    },

    stormField(fish, ctx) {
        const state = ctx.state;
        // Persistent arena-wide electric field (hydra's is wider + meaner)
        const isHydraSF = fish && fish.species && fish.species.id === 'stormlord_hydra';
        const count = isHydraSF ? 14 : 10;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 100 + Math.random() * 400;
            state.groundHazards.push({
                x: fish.x + Math.cos(a) * r,
                y: fish.y + Math.sin(a) * r,
                radius: 70, duration: 6.0,
                type: 'flash', damagePerSec: isHydraSF ? 40 : 25, color: '#10b981'
            });
        }
        ctx.showFloatingText(isHydraSF ? "⚡ SUPER STORM FIELD!" : "⚡ STORM FIELD!", fish.x, fish.y - 50, '#10b981');
    },

    voidCollapse(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Collapse orb: dodge it or get dragged to the rift on impact.
        // The detonation itself stays a 1.0s telegraphed ring.
        const cx = (p.x + fish.x) / 2;
        const cy = (p.y + fish.y) / 2;
        Projectiles.spawn(state, fish.x, fish.y, p.x, p.y, 360, 60, '#4c1d95', {
            radius: 16, isHoming: true, homingForce: 400,
            life: 5.0, glow: true, glowColor: '#a78bfa', trailCount: 2,
            pullOnHit: 140, pullX: cx, pullY: cy
        });

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
        // Gravity orb: dodge it or get dragged 220px to the boss on impact.
        // All damage now comes from the (dodgeable) orbiting projectiles.
        Projectiles.spawn(state, fish.x, fish.y, p.x, p.y, 380, 40, '#a855f7', {
            radius: 15, isHoming: true, homingForce: 420,
            life: 5.0, glow: true, glowColor: '#d8b4fe', trailCount: 2,
            pullOnHit: 220, pullX: fish.x, pullY: fish.y
        });
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
        // The roar HERALDS pain, it doesn't deal it: a slow 12-orb nova
        // with real gaps + stunning shock rings (dodge the rings, dodge
        // the stun). Was: instant unavoidable 90 dmg + 1.2s stun.
        for (let i = 0; i < 12; i++) {
            const a = (Math.PI * 2 / 12) * i;
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 600, fish.y + Math.sin(a) * 600,
                300, getSkillDamage(fish, 1.0), '#0ea5e9', {
                    radius: 13, glow: true, glowColor: '#bae6fd'
                });
        }
        state.screenShake = 32;
        // Shock rings erupt FROM THE MOUTH (shared roar system) — standing
        // in one when it pops STUNS. Plus the sonic boom visual on top.
        try {
            const mouth = (typeof Combat !== 'undefined' && Combat.mouthXY)
                ? Combat.mouthXY({ x: fish.x, y: fish.y, angle: 0, species: fish.species })
                : { x: fish.x, y: fish.y };
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 / 6) * i;
                state.delayedBlasts.push({
                    x: mouth.x + Math.cos(a) * 200,
                    y: mouth.y + Math.sin(a) * 200,
                    radius: 90, damage: 70,
                    timer: 0.8 + i * 0.1,
                    color: '#0ea5e9', shake: 20, stunOnBlast: 1.0
                });
            }
            if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                Combat.roarShockwave(state, mouth.x, mouth.y, { color: '#0ea5e9', rings: 4, maxR: 300, shake: 20 });
            }
        } catch (e) {}
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText("🌊 LEVIATHAN ROAR!", fish.x, fish.y - 70, '#0ea5e9');
    },

    // ============================================================
    //  PRIEST REWORK KIT — sea (hooked, no tension) + land bodies.
    //  Every skill runs in BOTH: host = fish._monster (land) or the
    //  hooked fish itself (sea). Positions always read off the host.
    // ============================================================
    _priestHost(fish) {
        try {
            const m = (fish && fish._monster) || null;
            if (m && typeof m.x === 'number') return m;
        } catch (e) {}
        return fish;
    },

    // P1 SEA — Abyssal Chant: mouth rings + 4 aimed orbs.
    abyssalChant(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const host = FISH_SKILLS._priestHost(fish);
        const dmg = getSkillDamage(fish, 0.9);
        try {
            const mouth = (typeof Combat !== 'undefined' && Combat.mouthXY)
                ? Combat.mouthXY({ x: host.x, y: host.y, angle: Math.atan2(p.y - host.y, p.x - host.x), species: fish.species })
                : { x: host.x, y: host.y };
            if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                Combat.roarShockwave(state, mouth.x, mouth.y, { color: '#a78bfa', rings: 3, maxR: 240, shake: 14 });
            }
        } catch (e) {}
        const base = Math.atan2(p.y - host.y, p.x - host.x);
        for (let i = 0; i < 4; i++) {
            const a = base + (i - 1.5) * 0.18;
            Projectiles.spawn(state, host.x, host.y,
                host.x + Math.cos(a) * 700, host.y + Math.sin(a) * 700,
                480, Math.round(dmg), '#a78bfa', {
                    radius: 11, glow: true, glowColor: '#7dd3fc', life: 2.4,
                });
        }
        try { audio.playSkillZap(); } catch (e) {}
        ctx.showFloatingText('🌀 ABYSSAL CHANT!', host.x, host.y - 70, '#a78bfa');
    },

    // P1 SEA — Coral Mortar: 3 red telegraphs at the feet, spikes at 1.2s.
    coralMortar(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const host = FISH_SKILLS._priestHost(fish);
        const dmg = getSkillDamage(fish, 1.1);
        for (let i = 0; i < 3; i++) {
            const ox = (Math.random() - 0.5) * 220, oy = (Math.random() - 0.5) * 160;
            state.delayedBlasts.push({
                x: p.x + ox, y: p.y + oy, radius: 85, damage: Math.round(dmg),
                timer: 1.2, color: '#f43f5e', shake: 14, stunOnBlast: 0.5,
                leaveHazard: true, hazardType: 'coral',
                hazardDps: 12, hazardDuration: 2.5,
            });
        }
        state.screenShake = Math.max(state.screenShake || 0, 12);
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText('🪸 CORAL MORTAR — 1.2s!', p.x, p.y - 60, '#f43f5e');
    },

    // P1 SEA — Phantom Eels: 2 eel minions at 80% / 65% HP (once each).
    phantomEels(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const host = FISH_SKILLS._priestHost(fish);
        const r = (host.hp || 0) / (host.maxHp || host.species.maxHp || 1);
        const mark = r <= 0.65 ? 'e65' : 'e80';
        try {
            if (host._eels80 && mark === 'e80') return;
            if (host._eels65 && mark === 'e65') return;
            if (mark === 'e80') host._eels80 = true;
            else host._eels65 = true;
        } catch (e) {}
        try {
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            const waterX = state.waterBoundaryX || 830;
            state.enemies = state.enemies || [];
            for (let i = 0; i < 2; i++) {
                let base = null;
                const pool = (typeof FISH_SPECIES !== 'undefined')
                    ? FISH_SPECIES.filter(s => s && !s.isBoss && /eel/i.test(s.id + ' ' + (s.shape || ''))) : [];
                base = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
                if (!base) {
                    for (let t = 0; t < 10 && !base; t++) {
                        const cand = (typeof rollFishSpecies === 'function')
                            ? rollFishSpecies(state) : null;
                        if (cand && !cand.isBoss) base = cand;
                    }
                }
                if (!base) continue;
                const sp = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, 0) : Object.assign({}, base);
                const sx = waterX + 120 + Math.random() * 200;
                const sy = p.y + (Math.random() - 0.5) * 420;
                const tx = Utils.clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * 90, B.MIN_X + 30, waterX - 30);
                const ty = Utils.clamp(p.y + (Math.random() - 0.5) * 160, B.MIN_Y + 30, B.MAX_Y - 30);
                const dist = Math.hypot(tx - sx, ty - sy) || 1;
                state.enemies.push({
                    id: 'pe' + Date.now() + Math.random() + i,
                    enemyType: 'jumpingFish',
                    species: sp,
                    bornDeathSeq: state._deathSeq || 0,
                    x: sx, y: sy, vx: (tx - sx), vy: (ty - sy),
                    hp: Math.max(80, (sp.maxHp || 320) * 0.5),
                    maxHp: Math.max(80, (sp.maxHp || 320) * 0.5),
                    damage: 34, state: 'leaping',
                    jumpT: 0, jumpDur: Utils.clamp(dist / 550, 0.7, 1.4),
                    sx, sy, tx, ty, leapH: 0,
                    landTimer: 30, hopTimer: 0.25, hitCd: 0,
                    skillCooldown: 2.5, isRaging: true, rageTimer: 0,
                    isInflated: false, inflateTimer: 0,
                    score: 0, xp: 40, hitFlash: 0,
                });
                Particles.spawnWaterSplashes(state, sx, sy, 10);
            }
        } catch (e) {}
        try { audio.playFishScreech(); } catch (e) {}
        ctx.showFloatingText('🐍 PHANTOM EELS!', host.x, host.y - 70, '#22d3ee');
    },

    // P1 SEA — Heartbeat Burst: 1s heart warning, then a grey 10-orb ring.
    heartbeatBurst(fish, ctx) {
        const state = ctx.state;
        const host = FISH_SKILLS._priestHost(fish);
        const dmg = getSkillDamage(fish, 1.0);
        try {
            Particles.spawnParticles(state, host.x, host.y - 40, '#e2e8f0', 24, { size: 5 });
            state.screenShake = Math.max(state.screenShake || 0, 10);
        } catch (e) {}
        ctx.showFloatingText('💓 HEARTBEAT — DODGE THE RING!', host.x, host.y - 90, '#e2e8f0');
        try {
            state.delayedBlasts = state.delayedBlasts || [];
            state.delayedBlasts.push({
                x: host.x, y: host.y, radius: 130, damage: 0,
                timer: 1.0, color: '#94a3b8', shake: 8,
                onDetonate: () => {
                    try {
                        for (let i = 0; i < 10; i++) {
                            const a = (Math.PI * 2 / 10) * i + Math.random() * 0.2;
                            Projectiles.spawn(state, host.x, host.y,
                                host.x + Math.cos(a) * 600, host.y + Math.sin(a) * 600,
                                340, Math.round(dmg), '#94a3b8', {
                                    radius: 11, glow: true, glowColor: '#e2e8f0', life: 2.6,
                                });
                        }
                        try { audio.playSkillBlast(); } catch (e2) {}
                        state.screenShake = Math.max(state.screenShake || 0, 14);
                    } catch (e2) {}
                },
            });
        } catch (e) {}
        try { audio.playSkillCast(); } catch (e) {}
    },

    // P2 LAND — Scythe Slash: 180° front cone, telegraphed 0.5s.
    // Dash i-frames dodge it; else damage + knockback.
    scytheSlash(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const host = FISH_SKILLS._priestHost(fish);
        const dmg = getSkillDamage(fish, 1.3);
        const RANGE = 260;
        // Telegraph: arc sparks across the front.
        try {
            const fa = Math.atan2(p.y - host.y, p.x - host.x);
            host._scytheFace = fa;
            for (let i = -4; i <= 4; i++) {
                const a = fa + i * (Math.PI / 8);
                Particles.spawnParticles(state, host.x + Math.cos(a) * RANGE, host.y + Math.sin(a) * RANGE, '#f43f5e', 2, { size: 4 });
            }
            state.screenShake = Math.max(state.screenShake || 0, 8);
        } catch (e) {}
        ctx.showFloatingText('⚔ SCYTHE WIND-UP — DASH THROUGH!', host.x, host.y - 80, '#f43f5e');
        try {
            state.delayedBlasts = state.delayedBlasts || [];
            state.delayedBlasts.push({
                x: host.x, y: host.y, radius: RANGE, damage: 0, hidden: true,
                timer: 0.5, color: '#f43f5e', shake: 0,
                onDetonate: () => {
                    try {
                        const m = (fish && fish._monster) || host;
                        const mx = (m && typeof m.x === 'number') ? m.x : host.x;
                        const my = (m && typeof m.y === 'number') ? m.y : host.y;
                        const fa2 = (typeof host._scytheFace === 'number')
                            ? host._scytheFace : Math.atan2(p.y - my, p.x - mx);
                        const dx = p.x - mx, dy = p.y - my;
                        const d = Math.hypot(dx, dy) || 1;
                        let da = Math.atan2(dy, dx) - fa2;
                        while (da > Math.PI) da -= Math.PI * 2;
                        while (da < -Math.PI) da += Math.PI * 2;
                        const inArc = Math.abs(da) <= Math.PI / 2 + 0.15;
                        const dodged = (p.iframes || 0) > 0 || (p.dashT || 0) > 0;
                        // Slash visual: crescent sparks.
                        for (let i = -6; i <= 6; i++) {
                            const a = fa2 + i * (Math.PI / 14);
                            Particles.spawnParticles(state, mx + Math.cos(a) * RANGE * 0.9, my + Math.sin(a) * RANGE * 0.9, '#fecaca', 2, { size: 5 });
                        }
                        try { audio.playSkillBlast(); } catch (e2) {}
                        if (d < RANGE + (p.radius || 15) && inArc && !dodged && (p.hp || 0) > 0) {
                            let dealt = dmg;
                            if (typeof Combat !== 'undefined' && Combat.damagePlayer) {
                                dealt = Combat.damagePlayer(state, dmg, { knockback: 0 });
                            } else {
                                p.hp = Math.max(0, (p.hp || 0) - dmg);
                            }
                            Particles.showFloatingText(state, `-${dealt}`, p.x, p.y - 25, '#f43f5e');
                            try {
                                if (typeof Player !== 'undefined' && Player.addPull) {
                                    Player.addPull(state, (dx / d) * 1400, (dy / d) * 1400, 0.3);
                                }
                            } catch (e2) {}
                            try { if (typeof Player !== 'undefined') Player.refreshHUD(state); } catch (e2) {}
                        }
                    } catch (e2) {}
                },
            });
        } catch (e) {}
        try { audio.playRoar(); } catch (e) {}
    },

    // P2 LAND — Slam & Bone Spike: spike row toward the player + 1s stun.
    slamSpikes(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const host = FISH_SKILLS._priestHost(fish);
        const dmg = getSkillDamage(fish, 1.2);
        const dx = p.x - host.x, dy = p.y - host.y;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;
        try {
            state.delayedBlasts = state.delayedBlasts || [];
            for (let i = 1; i <= 5; i++) {
                const sx = host.x + nx * (i * 110), sy = host.y + ny * (i * 110);
                state.delayedBlasts.push({
                    x: sx, y: sy, radius: 80, damage: Math.round(dmg),
                    timer: 0.4 + i * 0.15, color: '#d6a373', shake: 14, stunOnBlast: 1.0,
                    leaveHazard: true, hazardType: 'coral',
                    hazardDps: 10, hazardDuration: 2.5,
                    onDetonate: () => {
                        try {
                            if (typeof Player !== 'undefined' && Player.addPull && (p.hp || 0) > 0) {
                                const qx = p.x - host.x, qy = p.y - host.y;
                                const qd = Math.hypot(qx, qy) || 1;
                                Player.addPull(state, (qx / qd) * 900, (qy / qd) * 900, 0.25);
                            }
                            Particles.spawnParticles(state, sx, sy - 60, '#e7c58a', 14, { size: 5 });
                        } catch (e2) {}
                    },
                });
            }
            state.screenShake = Math.max(state.screenShake || 0, 16);
        } catch (e) {}
        try { audio.playExplosion(); } catch (e) {}
        ctx.showFloatingText('🦴 BONE SPIKES — SIDESTEP!', host.x, host.y - 70, '#d6a373');
    },

    // P2 LAND — Heart Overload: 14 slow magic bullets, full 360°.
    heartOverload(fish, ctx) {
        const state = ctx.state;
        const host = FISH_SKILLS._priestHost(fish);
        const dmg = getSkillDamage(fish, 1.0);
        try {
            Particles.spawnParticles(state, host.x, host.y - 40, '#f0abfc', 30, { size: 6 });
            state.screenShake = Math.max(state.screenShake || 0, 14);
        } catch (e) {}
        ctx.showFloatingText('💜 HEART OVERLOAD — THREAD THE GAPS!', host.x, host.y - 90, '#f0abfc');
        for (let i = 0; i < 14; i++) {
            const a = (Math.PI * 2 / 14) * i;
            Projectiles.spawn(state, host.x, host.y,
                host.x + Math.cos(a) * 600, host.y + Math.sin(a) * 600,
                240, Math.round(dmg), '#e879f9', {
                    radius: 12, glow: true, glowColor: '#f0abfc', life: 3.4,
                });
        }
        try { audio.playSkillBlast(); } catch (e) {}
    },

    // ============================================================
    //  GENERIC DANMAKU TRIO (touhou) — default projectile skills for
    //  every boss, tinted by the caster's own species color. Pure
    //  bullets: dodge, don't tank. Counts kept modest so snapshots
    //  (40-projectile cap) and frame rate survive the spam.
    // ============================================================
    danmakuSpiral(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const col = (fish.species && fish.species.color) || '#f87171';
        const dmg = getSkillDamage(fish, 0.75);
        for (let arm = 0; arm < 2; arm++) {
            for (let i = 0; i < 10; i++) {
                const a = arm * Math.PI + i * 0.35;
                const ox = fish.x + Math.cos(a) * 30, oy = fish.y + Math.sin(a) * 30;
                Projectiles.spawn(state, ox, oy,
                    ox + Math.cos(a) * 600, oy + Math.sin(a) * 600,
                    300, Math.round(dmg), col, {
                        radius: 10, glow: true, glowColor: col, life: 3.0,
                        isSpiral: true, spiralRadius: 4,
                    });
            }
        }
        try { audio.playSkillZap(); } catch (e) {}
        ctx.showFloatingText('🌀 SPIRAL DANMAKU!', fish.x, fish.y - 70, col);
    },

    danmakuFan(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const col = (fish.species && fish.species.color) || '#f87171';
        const dmg = getSkillDamage(fish, 0.85);
        const base = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = 0; i < 7; i++) {
            const a = base + (i - 3) * 0.12;
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                620, Math.round(dmg), col, {
                    radius: 10, glow: true, glowColor: col, life: 2.0,
                });
        }
        try { audio.playWhoosh(); } catch (e) {}
        ctx.showFloatingText('🔱 DANMAKU FAN!', fish.x, fish.y - 70, col);
    },

    danmakuRing(fish, ctx) {
        const state = ctx.state;
        const col = (fish.species && fish.species.color) || '#f87171';
        const dmg = getSkillDamage(fish, 0.7);
        for (let ring = 0; ring < 2; ring++) {
            const n = 12, off = ring * 0.26 + Math.random() * 0.2;
            for (let i = 0; i < n; i++) {
                const a = off + (i / n) * Math.PI * 2;
                Projectiles.spawn(state, fish.x, fish.y,
                    fish.x + Math.cos(a) * 600, fish.y + Math.sin(a) * 600,
                    300 + ring * 60, Math.round(dmg), col, {
                        radius: 9, glow: true, glowColor: col, life: 3.2,
                    });
            }
        }
        try { audio.playSkillZap(); } catch (e) {}
        ctx.showFloatingText('⭕ RING DANMAKU!', fish.x, fish.y - 70, col);
    },

    // ============================================================
    //  HYDRA REWORK KIT (sea + shore). Every skill runs in BOTH
    //  arenas: hooked-fish context (triggerSkill) and the land bridge
    //  (virtualFish with _monster back-ref) — same code, same damage.
    // ============================================================
    _hydraMouth(fish) {
        try {
            const m = (fish && fish._monster) || fish || {};
            const ang = (typeof m.angle === 'number') ? m.angle
                : (typeof fish.angle === 'number' ? fish.angle : 0);
            if (typeof Combat !== 'undefined' && Combat.mouthXY) {
                return Combat.mouthXY({ x: m.x || fish.x, y: m.y || fish.y, angle: ang, species: (m.species || fish.species) });
            }
        } catch (e) {}
        return { x: fish.x, y: fish.y };
    },

    // 1. STORMCALL — thiên lôi: 6 sấm telegraphed đánh quanh player.
    hydraLightning(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.4);
        for (let i = 0; i < 6; i++) {
            const ox = (Math.random() - 0.5) * 300, oy = (Math.random() - 0.5) * 300;
            const bx = p.x + ox, by = p.y + oy;
            state.delayedBlasts.push({
                x: bx, y: by, radius: 100, damage: Math.round(dmg),
                timer: 0.6 + i * 0.12, color: '#facc15', shake: 16, stunOnBlast: 0.4,
                onDetonate: () => {
                    try {
                        if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                            Combat.strikeLightning(state, bx, by, { color: '#fef08a', shake: 0 });
                        }
                    } catch (e) {}
                },
            });
            Particles.spawnParticles(state, p.x + ox, p.y + oy - 160, '#fef08a', 8, { size: 4 });
        }
        state.screenShake = Math.max(state.screenShake || 0, 12);
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText('⛈ STORMCALL!', fish.x, fish.y - 70, '#facc15');
    },

    // 1b. STORM ORB — giant thunder projectile. Condenses above the
    // hydra (~2s, lightning strikes INTO it, nothing else casts), then
    // hurls one HUGE orb straight at the player. Lightning hammers the
    // sea behind it as it flies + a green wake churns underneath.
    hydraStormOrb(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const m = fish._monster || null;
        const host = m || fish;
        const bx = m ? m.x : fish.x, by = m ? m.y : fish.y;
        try {
            if (m) m._hydraChannelCd = 2.3;
            else fish._hydraChannelCd = 2.3;
        } catch (e) {}
        const dmg = getSkillDamage(fish, 1.1);
        const cx = bx, cy = by - 110;
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText('⛈ STORM ORB — CONDENSING!', bx, by - 140, '#6ee7b7');
        try { state.screenShake = Math.max(state.screenShake || 0, 10); } catch (e2) {}
        // Round thunder ball growing above the heads (the visual).
        try { host._chargeOrb = { t: 0, dur: 2.0, r: 28, color: '#10b981', core: '#ecfdf5', oy: -110 }; } catch (e) {}
        // Bolts strike INTO the condensing orb (theatre, harmless).
        for (let i = 0; i < 4; i++) {
            setTimeout(() => {
                try {
                    if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                        Combat.strikeLightning(state, cx + (Math.random() - 0.5) * 60, cy, { color: '#a7f3d0', shake: 0 });
                    }
                    Particles.spawnParticles(state, cx, cy, '#6ee7b7', 8, { size: 4 });
                } catch (e2) {}
            }, 300 + i * 450);
        }
        try {
            state.delayedBlasts = state.delayedBlasts || [];
            state.delayedBlasts.push({
                x: cx, y: cy, radius: 130, damage: 0, hidden: true,
                timer: 2.0, color: '#10b981', shake: 10,
                onDetonate: () => {
                    try { host._chargeOrb = null; } catch (e2) {}
                    try {
                        const tx = p.x, ty = p.y;
                        const d = Math.hypot(tx - cx, ty - cy) || 1;
                        const spd = 560;
                        Projectiles.spawn(state, cx, cy, tx, ty, spd,
                            Math.round(dmg * 1.7), '#ecfdf5', {
                                radius: 24, life: d / spd + 0.4,
                                glow: true, glowColor: '#10b981',
                                trailCount: 3, impactShake: 22,
                                _hydraMega: true,
                            });
                        try { audio.playThunder(); } catch (e3) {}
                        try {
                            if (typeof Combat !== 'undefined' && Combat.strikeLightning) {
                                Combat.strikeLightning(state, cx, cy, { color: '#6ee7b7', shake: 8 });
                            }
                            Particles.spawnParticles(state, cx, cy, '#a7f3d0', 26, { size: 6 });
                        } catch (e3) {}
                        state.screenShake = Math.max(state.screenShake || 0, 18);
                    } catch (e2) {}
                },
            });
        } catch (e) {}
    },

    // 2. OCEAN KING'S ROAR — gầm đỏ + shockwave từ miệng + gọi 4 cá
    // jumping fish ngẫu nhiên lên đánh player.
    hydraRoar(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const mouth = FISH_SKILLS._hydraMouth(fish);
        // Grand red roar: 5 rings out of the mouth (theatre + shove).
        try {
            if (typeof Combat !== 'undefined' && Combat.roarShockwave) {
                Combat.roarShockwave(state, mouth.x, mouth.y, {
                    color: '#ef4444', rings: 5, maxR: 340, damage: 0, shake: 20, gap: 0.16,
                });
            }
        } catch (e) {}
        // Point-blank roar STUNS (1.5s): too close to the mouth and the
        // scream locks your legs. Dodge out of the 380px scream zone.
        try {
            const d = Math.hypot(p.x - mouth.x, p.y - mouth.y) || 1;
            if (d < 380) {
                p.stunTimer = Math.max(p.stunTimer || 0, 1.5);
                Particles.showFloatingText(state, '😱 STUNNED 1.5s!', p.x, p.y - 60, '#f87171');
            }
        } catch (e) {}
        try {
            Particles.spawnParticles(state, mouth.x, mouth.y, '#ef4444', 30, { size: 6 });
            Particles.spawnParticles(state, mouth.x, mouth.y, '#fecaca', 16, { size: 4 });
        } catch (e) {}
        // The roar answers — THREE TIERS top up to quota while the pack
        // thins: 5 common soldiers (rare fish), 4 elites (epic), 2 royals
        // (legendary-or-mythic). Wipe them and it just calls more — that
        // pressure IS the Hydra's difficulty. Works ashore too.
        try {
            const host = fish._monster || fish;
            const B = (typeof CONFIG !== 'undefined' && CONFIG.WORLD) || { MIN_X: 40, MAX_X: 4500, MIN_Y: 40, MAX_Y: 3500 };
            const waterX = state.waterBoundaryX || 830;
            const pickBase = (rarities) => {
                const pool = (typeof FISH_SPECIES !== 'undefined')
                    ? FISH_SPECIES.filter(s => s && !s.isBoss && rarities.includes(s.rarity))
                    : [];
                if (!pool.length) return null;
                return pool[Math.floor(Math.random() * pool.length)];
            };
            const summonTier = (rarities, quota, tag, hpMult, dmg, landSecs, xp) => {
                const alive = (state.enemies || []).filter(e => e && e._roarSpawned && e._roarTier === tag && (e.hp || 0) > 0).length;
                const need = Math.max(0, quota - alive);
                for (let i = 0; i < need; i++) {
                    const base = pickBase(rarities);
                    if (!base) continue;
                    const sp = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, 0) : Object.assign({}, base);
                    const sx = waterX + 120 + Math.random() * 200;
                    const sy = p.y + (Math.random() - 0.5) * 420;
                    const tx = Utils.clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * (70 + Math.random() * 90), B.MIN_X + 30, waterX - 30);
                    const ty = Utils.clamp(p.y + (Math.random() - 0.5) * 180, B.MIN_Y + 30, B.MAX_Y - 30);
                    const dist = Math.hypot(tx - sx, ty - sy) || 1;
                    state.enemies = state.enemies || [];
                    state.enemies.push({
                        id: 'hr' + Date.now() + Math.random() + tag + i,
                        enemyType: 'hydraSoldier', // hydra's own brood: separate
                        species: sp,               // from wild jumpingFish so the
                        bornDeathSeq: state._deathSeq || 0, // two never share bugs
                        _roarSpawned: true, // the King's call — topped up per tier
                        _roarTier: tag,
                        x: sx, y: sy,
                        vx: (tx - sx), vy: (ty - sy),
                        hp: Math.max(80, (sp.maxHp || 320) * hpMult),
                        maxHp: Math.max(80, (sp.maxHp || 320) * hpMult),
                        damage: dmg,
                        state: 'leaping',
                        jumpT: 0,
                        jumpDur: Utils.clamp(dist / 550, 0.7, 1.4),
                        sx, sy, tx, ty,
                        leapH: 0,
                        landTimer: landSecs,
                        hopTimer: 0.25,
                        hitCd: 0,
                        skillCooldown: 2.5,
                        isRaging: tag !== 'soldier',
                        rageTimer: 0,
                        isInflated: false,
                        inflateTimer: 0,
                        score: 0, xp,
                        hitFlash: 0,
                    });
                    Particles.spawnWaterSplashes(state, sx, sy, 10);
                }
                return need;
            };
            host._roarWaves = (host._roarWaves || 0) + 1;
            // ONE tier per roar, drawn at random: soldiers (5× rare),
            // elites (4× epic) or royals (2× legendary/mythic).
            const roll = Math.random();
            let n1 = 0, n2 = 0, n3 = 0;
            if (roll < 0.45) {
                n1 = summonTier(['rare'], 5, 'soldier', 0.5, 34, 25, 40);
                if (n1 > 0) Particles.showFloatingText(state, `🐍 SOLDIERS ×${n1} RISE!`, fish.x, fish.y - 110, '#6ee7b7');
            } else if (roll < 0.8) {
                n2 = summonTier(['epic'], 4, 'elite', 0.6, 44, 32, 70);
                if (n2 > 0) Particles.showFloatingText(state, `⚔ ELITES ×${n2} RISE!`, fish.x, fish.y - 110, '#34d399');
            } else {
                n3 = summonTier(['legendary', 'mythic'], 2, 'royal', 0.7, 58, 40, 120);
                if (n3 > 0) Particles.showFloatingText(state, `👑 ROYALS ×${n3} RISE!`, fish.x, fish.y - 110, '#fbbf24');
            }
        } catch (e) {}
        try { audio.playBossRoar(); } catch (e) {}
        ctx.showFloatingText("👑 ROAR OF THE OCEAN KING!", fish.x, fish.y - 80, '#ef4444');
    },

    // 3a. RIFT BITE (biển) — MỘT nhát chém không gian bay thẳng tới
    // player. Một projectile duy nhất, nhanh, rộng — không spam.
    hydraBiteSea(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.6);
        const mouth = FISH_SKILLS._hydraMouth(fish);
        Projectiles.spawn(state, mouth.x, mouth.y, p.x, p.y, 640, Math.round(dmg), '#e2e8f0', {
            radius: 26, glow: true, glowColor: '#ef4444', life: 1.6,
            knockback: 60, trailCount: 3, particleDensity: 0.9,
        });
        try { audio.playWhoosh(); } catch (e) {}
        ctx.showFloatingText('🗡 RIFT BITE!', fish.x, fish.y - 70, '#e2e8f0');
    },

    // 3b. SHORE LUNGE (bờ) — nhảy bổ tới player rồi cắn: lướt thân +
    // nổ cắn tại vị trí player đứng.
    hydraBiteShore(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.5);
        const m = fish._monster || null;
        if (m) {
            const dx = p.x - m.x, dy = p.y - m.y;
            const d = Math.hypot(dx, dy) || 1;
            const lunge = Math.min(d * 0.65, 420);
            m.x += (dx / d) * lunge;
            m.y += (dy / d) * lunge;
            Particles.spawnParticles(state, m.x, m.y, '#a7f3d0', 22, { size: 5 });
            state.screenShake = Math.max(state.screenShake || 0, 14);
        }
        state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 110, damage: Math.round(dmg),
            timer: 0.35, color: '#ef4444', shake: 18, stunOnBlast: 0.4,
        });
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText('🦷 SHORE LUNGE — MOVE!', (m ? m.x : fish.x), (m ? m.y : fish.y) - 70, '#ef4444');
    },

    // 4. GRASPING TIDE — rắn dây câu: projectile bay serpentine, đầu
    // mũi tên; dính đòn player bị trói và kéo về hydra suốt 5s.
    hydraTether(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const src = fish._monster || fish;
        const mouth = FISH_SKILLS._hydraMouth(fish);
        Projectiles.spawn(state, mouth.x, mouth.y, p.x, p.y, 380, Math.round(getSkillDamage(fish, 0.6)), '#4ade80', {
            radius: 12, glow: true, glowColor: '#86efac', life: 3.2,
            isHoming: true, homingForce: 520,
            isSpiral: true, spiralRadius: 5,
            trailCount: 3, particleDensity: 0.9,
        });
        // Anchor the leash to the hydra body (follows it while tethered).
        try {
            const pr = state.projectiles[state.projectiles.length - 1];
            if (pr) { pr.tetherDur = 5; pr.tetherSrc = src; }
        } catch (e) {}
        try { audio.playWhoosh(); } catch (e) {}
        ctx.showFloatingText('🐍 GRASPING TIDE!', fish.x, fish.y - 70, '#4ade80');
    },

    // 5. VENOM TIDE — vùng độc 5s tại chân player, -5hp/s đúng spec.
    hydraVenom(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        state.groundHazards.push({
            x: p.x, y: p.y, radius: 110, duration: 5,
            type: 'poison', damagePerSec: 5, color: '#4ade80',
        });
        ctx.showFloatingText('☠️ VENOM TIDE — RUN!', p.x, p.y - 60, '#4ade80');
    },

    // ============================================================
    //  CRIMSON EMPEROR KIT — Sovereign of the Blood Tides.
    //  P1 hunter (breach / tail / bubbles), P2 carnage (charge /
    //  maelstrom / barbs under the Blood Moon), P3 mutation
    //  (tentacles / beam / last bite). Land pickSkill gates by phase;
    //  hooked (sea) instances roll the full list.
    // ============================================================
    _crimsonMouth(fish) {
        try {
            const m = (fish && fish._monster) || fish || {};
            const ang = (typeof m.angle === 'number') ? m.angle
                : (typeof fish.angle === 'number' ? fish.angle : 0);
            if (typeof Combat !== 'undefined' && Combat.mouthXY) {
                return Combat.mouthXY({ x: m.x || fish.x, y: m.y || fish.y, angle: ang, species: (m.species || fish.species) });
            }
        } catch (e) {}
        return { x: fish.x, y: fish.y };
    },

    // P1 — BLOOD BREACHING: dives, shadow under the player, erupts AoE.
    crimsonBreach(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.3);
        state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 130, damage: Math.round(dmg),
            timer: 0.9, color: '#dc2626', shake: 18, stunOnBlast: 0.4,
        });
        // The Emperor itself breaches toward you (half the distance).
        const m = fish._monster || null;
        const bx = m ? m.x : fish.x, by = m ? m.y : fish.y;
        const dx = p.x - bx, dy = p.y - by;
        const d = Math.hypot(dx, dy) || 1;
        const lunge = Math.min(d * 0.5, 380);
        if (m) { m.x += (dx / d) * lunge; m.y += (dy / d) * lunge; }
        else { fish.x += (dx / d) * lunge; fish.y += (dy / d) * lunge; }
        try {
            Particles.spawnWaterSplashes(state, bx + (dx / d) * lunge, by + (dy / d) * lunge, 16);
            state.screenShake = Math.max(state.screenShake || 0, 16);
            try { audio.playSplash(); } catch (e) {}
        } catch (e) {}
        ctx.showFloatingText('🩸 BLOOD BREACH — MOVE!', p.x, p.y - 60, '#dc2626');
    },

    // P1 — TAIL SLAP WAVE: 3 blood fan waves, gaps between them.
    tailSlapWave(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.9);
        const base = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.26;
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                520, Math.round(dmg), '#f87171', {
                    radius: 12, glow: true, glowColor: '#7f1d1d', life: 2.2,
                });
        }
        try { audio.playWhoosh(); } catch (e) {}
        ctx.showFloatingText('🌊 TAIL SLAP!', fish.x, fish.y - 70, '#f87171');
    },

    // P1 — HOMING CRIMSON BUBBLES: 4-6 slow chasers, shootable.
    homingBubbles(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.7);
        const n = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 / n) * i;
            Projectiles.spawn(state, fish.x + Math.cos(a) * 40, fish.y + Math.sin(a) * 40,
                p.x, p.y, 240, Math.round(dmg), '#ef4444', {
                    radius: 11, glow: true, glowColor: '#fca5a5', life: 5,
                    isHoming: true, homingForce: 300,
                });
        }
        try { audio.playFishScreech(); } catch (e) {}
        ctx.showFloatingText('🫧 BLOOD BUBBLES — SHOOT THEM!', fish.x, fish.y - 70, '#ef4444');
    },

    // P2 — ABYSSAL CHARGE: blurs across through you, bleeding trail.
    abyssalCharge(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const m = fish._monster || null;
        const sx = m ? m.x : fish.x, sy = m ? m.y : fish.y;
        const dx = p.x - sx, dy = p.y - sy;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;
        const run = 560;
        // Trail of boiling blood along the whole lane.
        for (let i = 0; i <= 5; i++) {
            const t = (i / 5) * run - 80;
            state.groundHazards.push({
                x: sx + nx * t, y: sy + ny * t, radius: 60, duration: 3,
                type: 'fire', damagePerSec: 12, color: '#dc2626',
            });
        }
        if (m) { m.x = sx + nx * run; m.y = sy + ny * run; }
        else { fish.x = sx + nx * run; fish.y = sy + ny * run; }
        state.screenShake = Math.max(state.screenShake || 0, 18);
        try { audio.playWhoosh(); } catch (e) {}
        try {
            Particles.spawnParticles(state, sx + nx * run, sy + ny * run, '#dc2626', 30, { size: 5 });
        } catch (e) {}
        ctx.showFloatingText('👑 ABYSSAL CHARGE — DASH!', p.x, p.y - 60, '#dc2626');
    },

    // P2 — CRIMSON MAELSTROM: vortex drags you to the fangs. Finite
    // pull — run against it (Adrenaline helps if caught deep).
    crimsonMaelstrom(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const cx = fish.x, cy = fish.y;
        try {
            if (typeof Player !== 'undefined' && Player.addPull) {
                const dx = cx - p.x, dy = cy - p.y;
                const d = Math.hypot(dx, dy) || 1;
                const sp = 700 / 0.9;
                Player.addPull(state, (dx / d) * sp, (dy / d) * sp, 0.9);
            }
        } catch (e) {}
        for (let i = 0; i < 3; i++) {
            state.delayedBlasts.push({
                x: cx, y: cy, radius: 150 + i * 90, damage: 0,
                timer: 0.3 + i * 0.25, color: '#991b1b', shake: 16,
            });
        }
        try {
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2;
                Particles.spawnParticles(state, cx + Math.cos(a) * 200, cy + Math.sin(a) * 200, '#ef4444', 2, { size: 4 });
            }
        } catch (e) {}
        state.screenShake = Math.max(state.screenShake || 0, 16);
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText('🌀 CRIMSON MAELSTROM — RUN!', p.x, p.y - 60, '#991b1b');
    },

    // P2 — GORE BARBS: coral-spike rain across the beach.
    goreBarbs(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.9);
        for (let i = 0; i < 8; i++) {
            state.delayedBlasts.push({
                x: p.x + (Math.random() - 0.5) * 640,
                y: p.y + (Math.random() - 0.5) * 480,
                radius: 70, damage: Math.round(dmg),
                timer: 0.8 + Math.random() * 0.6,
                color: '#f87171', shake: 12,
            });
        }
        try { audio.playFishScreech(); } catch (e) {}
        ctx.showFloatingText('🪸 GORE BARBS — KEEP MOVING!', p.x, p.y - 60, '#f87171');
    },

    // P3 — TENTACLE SLAM: 4 tendrils hammer where you stand, staggered.
    tentacleSlam(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.3);
        const spots = [
            [p.x, p.y], [p.x + 95, p.y - 40],
            [p.x - 90, p.y + 55], [p.x + 30, p.y + 100],
        ];
        spots.forEach(([sx, sy], i) => {
            state.delayedBlasts.push({
                x: sx, y: sy, radius: 100, damage: Math.round(dmg),
                timer: 0.4 + i * 0.16, color: '#7f1d1d', shake: 18, stunOnBlast: 0.4,
            });
            try {
                Particles.spawnParticles(state, sx, sy - 120, '#7f1d1d', 10, { size: 5 });
            } catch (e) {}
        });
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText('🦑 TENTACLE SLAM — RED MEANS RUN!', p.x, p.y - 60, '#7f1d1d');
    },

    // P3 — BLOOD BEAM: eye charges 1s, then a 180° coral-laser sweep.
    // Dash through the beam line as it passes — tanking all 7 is death.
    bloodBeam(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.2);
        const mouth = FISH_SKILLS._crimsonMouth(fish);
        const base = Math.atan2(p.y - mouth.y, p.x - mouth.x);
        try {
            Particles.spawnParticles(state, mouth.x, mouth.y, '#fca5a5', 30, { size: 5 });
            try { audio.playThunder(); } catch (e) {}
        } catch (e) {}
        for (let i = 0; i < 7; i++) {
            const a = base + (-75 + i * 25) * (Math.PI / 180);
            const R = 380;
            state.delayedBlasts.push({
                x: mouth.x + Math.cos(a) * R, y: mouth.y + Math.sin(a) * R,
                radius: 70, damage: Math.round(dmg),
                timer: 1.0 + i * 0.12, color: '#dc2626', shake: 16,
            });
        }
        ctx.showFloatingText('👁 BLOOD BEAM — DASH THE SWEEP!', p.x, p.y - 60, '#dc2626');
    },

    // P3 death-throe (<10%): relentless shore-bites until it drops.
    sovereignBite(fish, ctx) {        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.7);
        const m = fish._monster || null;
        const bx = m ? m.x : fish.x, by = m ? m.y : fish.y;
        const dx = p.x - bx, dy = p.y - by;
        const d = Math.hypot(dx, dy) || 1;
        const lunge = Math.min(d * 0.8, 520);
        if (m) { m.x += (dx / d) * lunge; m.y += (dy / d) * lunge; }
        else { fish.x += (dx / d) * lunge; fish.y += (dy / d) * lunge; }
        state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 130, damage: Math.round(dmg),
            timer: 0.32, color: '#991b1b', shake: 20, stunOnBlast: 0.6,
        });
        state.screenShake = Math.max(state.screenShake || 0, 20);
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText('👑 SOVEREIGN BITE!', p.x, p.y - 60, '#991b1b');
    },

    // ============================================================
    //  VOID LEVIATHAN KIT — The Star-Eater. P1 unstable star
    //  (spit / geyser / tentacles), beach-breach QTE at 65%, P2 cosmic
    //  rift (shear / well / rain), P3 star-eater (beam / barrage /
    //  apocalypse). Land pickSkill gates by phase; hooked instances
    //  roll the full list.
    // ============================================================
    // VOID BARRAGE — signature spam: 3 aimed bursts x 4 fast orbs
    // (12 total). No homing — pure dodge-by-movement, cheap sprites so
    // volume never lags. The boss's bread-and-butter at every phase.
    voidBarrage(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.8);
        const base = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let b = 0; b < 3; b++) {
            for (let i = 0; i < 4; i++) {
                const a = base + (b - 1) * 0.22 + (i - 1.5) * 0.12;
                Projectiles.spawn(state, fish.x, fish.y,
                    fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
                    560, Math.round(dmg), '#a855f7', {
                        radius: 10, glow: true, glowColor: '#22d3ee', life: 2.0,
                    });
            }
        }
        try { audio.playSkillZap(); } catch (e) {}
        ctx.showFloatingText('🟣 VOID BARRAGE!', fish.x, fish.y - 70, '#a855f7');
    },

    // P1 — VOID SPITTING: 6 chasing star-orbs, shootable.
    voidSpitting(fish, ctx) {        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.7);
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 / 6) * i;
            Projectiles.spawn(state, fish.x + Math.cos(a) * 50, fish.y + Math.sin(a) * 50,
                p.x, p.y, 300, Math.round(dmg), '#c084fc', {
                    radius: 11, glow: true, glowColor: '#22d3ee', life: 4,
                    isHoming: true, homingForce: 380,
                });
        }
        try { audio.playFishScreech(); } catch (e) {}
        ctx.showFloatingText('🟣 VOID SPITTING — SHOOT THEM!', fish.x, fish.y - 70, '#c084fc');
    },

    // P1 — ABYSSAL GEYSER: 3 warning rings, eruption after 2s.
    abyssalGeyser(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.2);
        const spots = [[p.x, p.y], [p.x + 130, p.y - 60], [p.x - 120, p.y + 70]];
        spots.forEach(([sx, sy], i) => {
            state.delayedBlasts.push({
                x: sx, y: sy, radius: 95, damage: Math.round(dmg),
                timer: 2.0, color: '#7c3aed', shake: 16,
                onDetonate: () => {
                    try {
                        Particles.spawnParticles(state, sx, sy - 60, '#22d3ee', 20, { size: 5 });
                        state.screenShake = Math.max(state.screenShake || 0, 12);
                    } catch (e) {}
                },
            });
        });
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText('🌋 ABYSSAL GEYSER — 2s!', p.x, p.y - 60, '#7c3aed');
    },

    // P1 — VOID TENTACLE SLAM: dorsal tendrils hammer the sand,
    // leaving crackling energy fissures.
    voidTentacle(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.2);
        const spots = [
            [p.x, p.y], [p.x + 100, p.y - 50],
            [p.x - 95, p.y + 60], [p.x + 20, p.y + 110],
        ];
        spots.forEach(([sx, sy], i) => {
            state.delayedBlasts.push({
                x: sx, y: sy, radius: 95, damage: Math.round(dmg),
                timer: 0.5 + i * 0.18, color: '#6d28d9', shake: 16, stunOnBlast: 0.4,
                leaveHazard: true, hazardType: 'fire', hazardDps: 6, hazardDuration: 3,
            });
            try {
                Particles.spawnParticles(state, sx, sy - 130, '#6d28d9', 10, { size: 5 });
            } catch (e) {}
        });
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText('🦑 VOID TENDRILS — RED MEANS RUN!', p.x, p.y - 60, '#6d28d9');
    },

    // P2 — REALITY SHEAR: dashes through you, 3 rifts that detonate
    // after 3s, dragging victims in.
    realityShear(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const m = fish._monster || null;
        const sx = m ? m.x : fish.x, sy = m ? m.y : fish.y;
        const dx = p.x - sx, dy = p.y - sy;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;
        const run = 520;
        for (let i = 1; i <= 3; i++) {
            const rx = sx + nx * (run * i / 3), ry = sy + ny * (run * i / 3);
            state.delayedBlasts.push({
                x: rx, y: ry, radius: 100, damage: Math.round(getSkillDamage(fish, 1.2)),
                timer: 3.0, color: '#4c1d95', shake: 16, stunOnBlast: 0.5,
                onDetonate: () => {
                    try {
                        if (typeof Player !== 'undefined' && Player.addPull) {
                            const qx = rx - p.x, qy = ry - p.y;
                            const qd = Math.hypot(qx, qy) || 1;
                            Player.addPull(state, (qx / qd) * (420 / 0.5), (qy / qd) * (420 / 0.5), 0.5);
                        }
                        Particles.spawnParticles(state, rx, ry, '#a855f7', 25, { size: 5 });
                    } catch (e) {}
                },
            });
        }
        if (m) { m.x = sx + nx * run; m.y = sy + ny * run; }
        else { fish.x = sx + nx * run; fish.y = sy + ny * run; }
        state.screenShake = Math.max(state.screenShake || 0, 16);
        try { audio.playWhoosh(); } catch (e) {}
        ctx.showFloatingText('✂ REALITY SHEAR — RIFTS IN 3s!', p.x, p.y - 60, '#4c1d95');
    },

    // P2 — VOID PIT: two black holes bloom around the player for 5s,
    // then collapse. Dragged into the maw = CONSUMED (instant death).
    // Plus a pair of void-touched jumpers to hunt while you run.
    voidPit(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const spots = [
            [p.x - 150, p.y - 90], [p.x + 150, p.y + 90],
        ];
        spots.forEach(([sx, sy], i) => {
            state.groundHazards.push({
                x: sx, y: sy, radius: 110, duration: 5,
                type: 'void', voidPit: true, damagePerSec: 0, color: '#0f172a',
            });
            try {
                state.realmFx = state.realmFx || [];
                state.realmFx.push({ x: sx, y: sy, t0: state.time || 0, dur: 5, pit: true });
            } catch (e) {}
        });
        // Void-touched hunters rise with the pits.
        try {
            state.enemies = state.enemies || [];
            for (let i = 0; i < 2; i++) {
                let base = null;
                for (let t = 0; t < 10 && !base; t++) {
                    const cand = (typeof rollFishSpecies === 'function')
                        ? rollFishSpecies(state)
                        : FISH_SPECIES[Math.floor(Math.random() * FISH_SPECIES.length)];
                    if (cand && !cand.isBoss) base = cand;
                }
                if (!base) continue;
                const sp = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, 0) : Object.assign({}, base);
                sp.mutation = 'void';
                sp.color = '#a855f7';
                const sx = spots[i][0] + (Math.random() - 0.5) * 200;
                const sy = spots[i][1] - 160;
                const tx = Utils.clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * 90, 40, (state.waterBoundaryX || 830) - 30);
                const ty = Utils.clamp(p.y + (Math.random() - 0.5) * 160, 40, 3500);
                const dist = Math.hypot(tx - sx, ty - sy) || 1;
                state.enemies.push({
                    id: 'vp' + Date.now() + Math.random() + i,
                    enemyType: 'jumpingFish',
                    species: sp,
                    bornDeathSeq: state._deathSeq || 0,
                    x: sx, y: sy, vx: (tx - sx), vy: (ty - sy),
                    hp: Math.max(80, (sp.maxHp || 320) * 0.5),
                    maxHp: Math.max(80, (sp.maxHp || 320) * 0.5),
                    damage: 34, state: 'leaping',
                    jumpT: 0, jumpDur: Utils.clamp(dist / 550, 0.7, 1.4),
                    sx, sy, tx, ty, leapH: 0,
                    landTimer: 30, hopTimer: 0.25, hitCd: 0,
                    skillCooldown: 2.5, isRaging: false, rageTimer: 0,
                    isInflated: false, inflateTimer: 0,
                    score: 0, xp: 40, hitFlash: 0,
                });
            }
        } catch (e) {}
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText('🕳 VOID PITS — DON’T FALL IN!', p.x, p.y - 60, '#0f172a');
    },

    // P2 — GRAVITY WELL: a black hole blooms mid-beach and drinks you in.
    // P2 — STAR RAIN: violet shrapnel across the beach.
    starRain(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.9);
        for (let i = 0; i < 8; i++) {
            state.delayedBlasts.push({
                x: p.x + (Math.random() - 0.5) * 640,
                y: p.y + (Math.random() - 0.5) * 480,
                radius: 70, damage: Math.round(dmg),
                timer: 0.8 + Math.random() * 0.6,
                color: '#c084fc', shake: 12,
            });
        }
        try { audio.playFishScreech(); } catch (e) {}
        ctx.showFloatingText('🌠 STAR RAIN — KEEP MOVING!', p.x, p.y - 60, '#c084fc');
    },

    // P3 — COSMIC BLAST: eyes charge 1s, then a 180° void-laser sweep.
    cosmicBlast(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.4);
        let mx = fish.x, my = fish.y;
        try {
            const m = (fish && fish._monster) || fish || {};
            const ang = (typeof m.angle === 'number') ? m.angle : 0;
            if (typeof Combat !== 'undefined' && Combat.mouthXY) {
                const mt = Combat.mouthXY({ x: m.x || fish.x, y: m.y || fish.y, angle: ang, species: (m.species || fish.species) });
                mx = mt.x; my = mt.y;
            }
        } catch (e) {}
        const base = Math.atan2(p.y - my, p.x - mx);
        try {
            Particles.spawnParticles(state, mx, my, '#e9d5ff', 30, { size: 5 });
            try { audio.playThunder(); } catch (e) {}
        } catch (e) {}
        for (let i = 0; i < 7; i++) {
            const a = base + (-75 + i * 25) * (Math.PI / 180);
            const R = 380;
            state.delayedBlasts.push({
                x: mx + Math.cos(a) * R, y: my + Math.sin(a) * R,
                radius: 70, damage: Math.round(dmg),
                timer: 1.0 + i * 0.12, color: '#7c3aed', shake: 16,
            });
        }
        ctx.showFloatingText('👁 COSMIC BLAST — DASH THE SWEEP!', p.x, p.y - 60, '#7c3aed');
    },

    // P3 death-throe (<10%): frenzied crawling bites, non-stop.
    phaseBarrage(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.1);
        const m = fish._monster || null;
        const bx = m ? m.x : fish.x, by = m ? m.y : fish.y;
        const dx = p.x - bx, dy = p.y - by;
        const d = Math.hypot(dx, dy) || 1;
        const lunge = Math.min(d * 0.5, 380);
        if (m) { m.x += (dx / d) * lunge; m.y += (dy / d) * lunge; }
        else { fish.x += (dx / d) * lunge; fish.y += (dy / d) * lunge; }
        for (let i = 0; i < 3; i++) {
            state.delayedBlasts.push({
                x: p.x + (Math.random() - 0.5) * 120,
                y: p.y + (Math.random() - 0.5) * 120,
                radius: 80, damage: Math.round(dmg),
                timer: 0.3 + i * 0.2, color: '#a855f7', shake: 14,
            });
        }
        state.screenShake = Math.max(state.screenShake || 0, 14);
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText('🌀 FRENZY BARRAGE!', p.x, p.y - 60, '#a855f7');
    },

    // VOID STAR-EATER ORB (10th skill, projective signature):
    //  P1 converge: a violet energy ball gathers above the boss for ~2s.
    //  While converging the boss CANNOT cast anything else (channel lock
    //  via _voidChannelCd, gated in Combat.pickSkill). Then it fires ONE
    //  huge orb straight at the player's position (locked at fire time).
    //  When the mega orb reaches its target it detonates and splits into
    //  exactly 7 small orbs (radial). Works on land + hooked instances.
    voidStarEaterOrb(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const m = fish._monster || null;
        const host = m || fish;
        const bx = m ? m.x : fish.x, by = m ? m.y : fish.y;
        // Channel lock: no other skill until convergence ends.
        try {
            if (m) m._voidChannelCd = 2.3;
            else fish._voidChannelCd = 2.3;
        } catch (e) {}
        const dmg = getSkillDamage(fish, 1.1);
        const cx = bx, cy = by - 90;
        try { audio.playSkillZap(); } catch (e) {}
        ctx.showFloatingText('🌌 STAR-EATER ORB — CONVERGING!', bx, by - 120, '#a855f7');
        try { state.screenShake = Math.max(state.screenShake || 0, 10); } catch (e) {}
        // Round energy ball condensing above the head (the visual).
        // The hidden blast below owns the 2s timer — no ground ring.
        try { host._chargeOrb = { t: 0, dur: 2.0, r: 30, color: '#a855f7', core: '#e9d5ff', oy: -90 }; } catch (e) {}
        // Converge visual: harmless imploding rings (damage 0). The real
        // shot fires in onDetonate, AFTER the lock window, so nothing
        // else can interleave.
        try {
            state.delayedBlasts = state.delayedBlasts || [];
            state.delayedBlasts.push({
                x: cx, y: cy, radius: 130, damage: 0, hidden: true,
                timer: 2.0, color: '#a855f7', shake: 10,
                onDetonate: () => {
                    try { host._chargeOrb = null; } catch (e2) {}
                    try {
                        // Lock the player's position AT FIRE TIME, shoot straight.
                        const tx = p.x, ty = p.y;
                        const d = Math.hypot(tx - cx, ty - cy) || 1;
                        const spd = 520;
                        const life = d / spd + 0.35;
                        Projectiles.spawn(state, cx, cy, tx, ty, spd,
                            Math.round(dmg * 1.6), '#e9d5ff', {
                                radius: 26, life,
                                glow: true, glowColor: '#a855f7',
                                trailCount: 3, impactShake: 20,
                                _voidMega: true, _voidTX: tx, _voidTY: ty, _voidSplit: 7,
                            });
                        try { audio.playThunder(); } catch (e2) {}
                        try {
                            Particles.spawnParticles(state, cx, cy, '#e9d5ff', 30, { size: 6 });
                            Particles.spawnParticles(state, cx, cy, '#a855f7', 20, { size: 4 });
                        } catch (e2) {}
                        state.screenShake = Math.max(state.screenShake || 0, 18);
                    } catch (e2) {}
                },
            });
            // Imploding sparks during converge (theatre).
            for (let i = 0; i < 10; i++) {
                const a = (Math.PI * 2 / 10) * i;
                Particles.spawnParticles(state, cx + Math.cos(a) * 150, cy + Math.sin(a) * 150, '#c084fc', 2, { size: 3 });
            }
        } catch (e) {}
    },

    // ============================================================
    //  NEW SKILLS — ink, bubbles, frenzy, mirrors, sand, storm, coral, gaze
    // ============================================================
    inkBurst(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.7);
        // Ring of slow ink globs + numbs the player's legs
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 / 8) * i;
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 450, fish.y + Math.sin(a) * 450,
                420, dmg, '#1e293b', { radius: 11, glow: true, glowColor: '#475569', slowOnHit: 1.5 });
        }
        // Ink in the water slows + blurs while you stand in it — walk out
        state.groundHazards.push({
            x: p.x, y: p.y, radius: 70, duration: 3.5,
            type: 'ink', damagePerSec: 8, color: '#1e293b'
        });
        ctx.showFloatingText("🦑 INK BURST!", fish.x, fish.y - 40, '#94a3b8');
    },

    bubblePrison(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.9);
        // Bubble missile: slow and homing — sidestep it or get trapped
        // (stun) on impact, then the bubble pops.
        Projectiles.spawn(state, fish.x, fish.y, p.x, p.y, 300, Math.round(dmg * 0.5), '#a5f3fc', {
            radius: 14, isHoming: true, homingForce: 380,
            life: 4.0, glow: true, glowColor: '#ecfeff', trailCount: 2,
            stunOnHit: 0.8
        });
        state.delayedBlasts.push({
            x: p.x, y: p.y, radius: 70, damage: dmg,
            timer: 0.9, color: '#a5f3fc', shake: 10
        });
        for (let i = 0; i < 10; i++) {
            const a = (Math.PI * 2 / 10) * i;
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 350, fish.y + Math.sin(a) * 350,
                360, Math.round(dmg * 0.3), '#67e8f9', { radius: 6 });
        }
        ctx.showFloatingText("🫧 BUBBLE PRISON!", fish.x, fish.y - 40, '#a5f3fc');
    },

    bloodFrenzy(fish, ctx) {
        // Self-buff: enrages, heals a little, darts at the player
        fish.isRaging = true;
        fish.rageTimer = Math.max(fish.rageTimer || 0, 4.0);
        fish.hp = Math.min(fish.maxHp || fish.hp, fish.hp + Math.round((fish.maxHp || 100) * 0.12));
        const p = ctx.state.player;
        const a = Math.atan2(p.y - fish.y, p.x - fish.x);
        fish.vx = (fish.vx || 0) + Math.cos(a) * 500;
        fish.vy = (fish.vy || 0) + Math.sin(a) * 500;
        ctx.showFloatingText("🩸 BLOOD FRENZY!", fish.x, fish.y - 40, '#dc2626');
    },

    mirrorImage(fish, ctx) {
        // Quick dash + hardens (brief damage reduction), confuses with flashes
        const p = ctx.state.player;
        const a = Math.atan2(fish.y - p.y, fish.x - p.x);
        fish.vx = (fish.vx || 0) + Math.cos(a) * 650;
        fish.vy = (fish.vy || 0) + Math.sin(a) * 650;
        fish.isInflated = true;
        fish.inflateTimer = Math.max(fish.inflateTimer || 0, 1.5);
        for (let i = 0; i < 3; i++) {
            ctx.spawnParticles(fish.x + (Math.random() - 0.5) * 60, fish.y + (Math.random() - 0.5) * 60, '#e2e8f0', 6);
        }
        ctx.showFloatingText("✨ MIRROR IMAGE!", fish.x, fish.y - 40, '#e2e8f0');
    },

    sandVeil(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.6);
        // Kicks up blinding sand around the player, then bolts away.
        // Slow + blur come from STANDING in the sand — keep moving.
        for (let i = 0; i < 4; i++) {
            state.groundHazards.push({
                x: p.x + (Math.random() - 0.5) * 160,
                y: p.y + (Math.random() - 0.5) * 160,
                radius: 45, duration: 3.0,
                type: 'sand', damagePerSec: 7, color: '#d6b98c'
            });
        }
        const a = Math.atan2(fish.y - p.y, fish.x - p.x);
        fish.vx = (fish.vx || 0) + Math.cos(a) * 550;
        fish.vy = (fish.vy || 0) + Math.sin(a) * 550;
        try {
            const proj = Projectiles.spawn(state, fish.x, fish.y, p.x, p.y, 500, dmg, '#d6b98c', {
                radius: 9, slowOnHit: 1.0, blurOnHit: 0.8
            });
            void proj;
        } catch (e) {}
        ctx.showFloatingText("🏜️ SAND VEIL!", fish.x, fish.y - 40, '#d6b98c');
    },

    thunderDive(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.1);
        // Blinks beside the player and discharges
        const side = Math.random() < 0.5 ? -1 : 1;
        fish.x += side * 120;
        ctx.spawnParticles(fish.x, fish.y, '#fde047', 14);
        const baseA = Math.atan2(p.y - fish.y, p.x - fish.x);
        for (let i = -1; i <= 1; i++) {
            const a = baseA + i * 0.15;
            // Stun rides the bolts now — sidestep all three, feel nothing
            Projectiles.spawn(state, fish.x, fish.y,
                fish.x + Math.cos(a) * 500, fish.y + Math.sin(a) * 500,
                640, dmg, '#fde047', { radius: 9, glow: true, glowColor: '#fef08a', stunOnHit: 0.5 });
        }
        try { audio.playThunder(); } catch (e) {}
        ctx.showFloatingText("⚡ THUNDER DIVE!", fish.x, fish.y - 40, '#fde047');
    },

    coralSnare(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 0.8);
        // Living reef grows around the player: standing in it roots + hurts.
        // The barb itself is the dodgeable part.
        state.groundHazards.push({
            x: p.x, y: p.y, radius: 75, duration: 4.0,
            type: 'coral', damagePerSec: 12, color: '#14b8a6'
        });
        // The barb roots on impact — dodge it, don't tank it
        Projectiles.spawn(state, fish.x, fish.y, p.x, p.y, 480, dmg, '#2dd4bf', {
            radius: 10, glow: true, slowOnHit: 2.0
        });
        ctx.showFloatingText("🪸 CORAL SNARE!", fish.x, fish.y - 40, '#2dd4bf');
    },

    abyssalGaze(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 1.0);
        // Dread beam: fast but sidesteppable. Hurls back + stuns + flashes
        // ONLY on a real hit — no more instant punish.
        const a = Math.atan2(p.y - fish.y, p.x - fish.x);
        Projectiles.spawn(state, fish.x, fish.y,
            fish.x + Math.cos(a) * 700, fish.y + Math.sin(a) * 700,
            750, dmg, '#a855f7', {
                radius: 12, glow: true, glowColor: '#e9d5ff',
                pushOnHit: 130, stunOnHit: 0.6, flashOnHit: 0.4
            });
        state.screenShake = Math.max(state.screenShake || 0, 10);
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText("👁️ ABYSSAL GAZE!", fish.x, fish.y - 40, '#a855f7');
    },

    lure(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        // Hypnotic glow: slows the angler and saps stamina while they stare.
        // Keep moving to break the trance (slow falls off outside the glow).
        p.slowTimer = Math.max(p.slowTimer || 0, 2.5);
        p.slowMult = 0.45;
        state.groundHazards.push({
            x: fish.x, y: fish.y, radius: 130, duration: 3.5,
            type: 'lure', damagePerSec: 6, color: '#c4b5fd'
        });
        ctx.spawnParticles(fish.x, fish.y, '#c4b5fd', 16);
        ctx.showFloatingText("💡 LURED! Keep moving!", fish.x, fish.y - 40, '#c4b5fd');
    },

    titanSlam(fish, ctx) {
        const state = ctx.state;
        const p = state.player;
        const dmg = getSkillDamage(fish, 2.2);
        // THE BREACH: the whale rockets skyward (visible leap), hangs a
        // beat, then comes down on the angler's position — earthquake.
        fish.vx = (fish.vx || 0) * 0.2;
        fish.vy = (fish.vy || 0) * 0.2 - 1050;
        fish._slamT = 0.85;
        fish._slamDmg = Math.round(dmg * 1.4);
        ctx.spawnParticles(fish.x, fish.y, '#bae6fd', 30);
        ctx.spawnParticles(fish.x, fish.y, '#ffffff', 18);
        state.screenShake = Math.max(state.screenShake || 0, 14);
        try { audio.playRoar(); } catch (e) {}
        ctx.showFloatingText("🐋 BREACH! IT'S COMING DOWN — RUN!", fish.x, fish.y - 90, '#93c5fd');
    },
};