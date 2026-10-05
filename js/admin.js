// ============================================================
// ADMIN — local-only debug console for boss testing.
// ACTIVE ONLY on localhost / 127.0.0.1 / file:// — everywhere else
// (itch.io included) nothing is exposed: every binding below is
// script-scoped (let/const), and window.AH is assigned in __AH_boot
// only when local. Excluded from the itch zip (see build-itch
// SKIP_FILES) and the protected bundle (see build-protect SKIP).
// Usage (local): press F9 for buttons, or window.AH.* in console.
// ============================================================
let __AH_isLocal = false;
try {
    let __AH_h = (typeof location !== 'undefined' && location.hostname) || '';
    let __AH_p = (typeof location !== 'undefined' && location.protocol) || '';
    __AH_isLocal = !__AH_h || __AH_h === 'localhost' || __AH_h === '127.0.0.1' ||
        __AH_h === '0.0.0.0' || __AH_h === '[::1]' || __AH_p === 'file:';
} catch (e) {}

const __AH_st = function () {
    try { if (typeof state !== 'undefined' && state.player) return state; } catch (e) {}
    return null;
};

const __AH_say = function (msg, color) {
    try {
        const s = __AH_st();
        if (s && typeof Particles !== 'undefined') {
            Particles.showFloatingText(s, msg, s.player.x, s.player.y - 60, color || '#facc15');
        }
    } catch (e) {}
    try { console.log('[ADMIN]', msg); } catch (e) {}
};

const __AH_hydraSpecies = function () {
    try {
        return (typeof FISH_SPECIES !== 'undefined' && FISH_SPECIES.find(s => s.id === 'stormlord_hydra')) || null;
    } catch (e) { return null; }
};

let __AH_panel = null;

const __AH_toggle = function () {
    try {
        if (__AH_panel) { __AH_panel.remove(); __AH_panel = null; return; }
        __AH_panel = document.createElement('div');
        __AH_panel.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9999;background:rgba(2,6,23,0.92);border:1px solid #f59e0b;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:6px;max-width:220px;';
        const title = document.createElement('div');
        title.style.cssText = 'color:#fbbf24;font-weight:900;font-size:11px;letter-spacing:0.1em;';
        title.innerText = 'ADMIN (localhost only)';
        __AH_panel.appendChild(title);
        [['Kit (lure+coins)', 'kit'], ['Hook hydra', 'hook'], ['Force P2 (49%)', 'p2'],
         ['Land hydra P2', 'land'], ['Boss…', 'boss'], ['Void kit', 'voidkit'], ['Blood kit', 'bloodkit'],
         ['Mythical 🐟', 'mythical'], ['Coins 999k', 'coins'], ['All guns', 'guns'],
         ['Storm intro', 'storm'], ['God', 'god'],
         ['Heal', 'heal'], ['TP shore', 'shore'], ['Clear trash', 'clear'],
         ['Hydra 1hp', 'kill']].forEach(function (pair) {
            const label = pair[0], fn = pair[1];
            const b = document.createElement('button');
            b.style.cssText = 'background:#1e293b;color:#fff;border:1px solid #475569;border-radius:8px;padding:6px;font-size:12px;font-weight:700;cursor:pointer;text-align:left;';
            b.innerText = label;
            b.onclick = function () {
                if (fn === 'boss') {
                    const id = window.prompt('boss id (crimson_emperor, void_shepherd, leviathan_priest, stormlord_hydra):', 'crimson_emperor');
                    if (id) { try { window.AH.boss(id); } catch (e) {} }
                } else { try { window.AH[fn](); } catch (e) {} }
            };
            __AH_panel.appendChild(b);
        });
        document.body.appendChild(__AH_panel);
    } catch (e) {}
};

let AH = {
    // Full hydra test kit: lure stock + equipped, rich, at the shore.
    kit() {
        const s = __AH_st(); if (!s) return __AH_say('no state (open the game first)', '#f87171');
        const p = s.player;
        try {
            p.baitStock = p.baitStock || {};
            p.baitStock['lure_hydra'] = 5;
            p.activeBait = 'lure_hydra';
            p.coins = Math.max(p.coins || 0, 99999);
            p.x = (s.waterBoundaryX || 830) - 120;
            p.y = 1500;
            if (typeof Player !== 'undefined') Player.refreshHUD(s);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(s);
        } catch (e) {}
        __AH_say('HYDRA KIT: lure x5 on hook + 99999c — CAST NOW (30%/cast)', '#10b981');
    },

    // Skip fishing: hook the hydra right now (sea phase + 10s intro).
    hook() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        const sp = __AH_hydraSpecies(); if (!sp) return __AH_say('hydra species missing', '#f87171');
        try {
            const inst = (typeof makeCatchInstance === 'function')
                ? makeCatchInstance(sp, 0) : Object.assign({ species: sp }, sp);
            inst.hp = inst.maxHp; inst.lineBroken = true;
            s.fishing.mode = 'HOOKED';
            s.fishing.bobber = { x: s.player.x + 200, y: s.player.y };
            s.fishing.hookedFish = inst;
            inst.x = s.player.x + 300; inst.y = s.player.y;
            inst._hydraRising = true;
            inst._anchor = { x: inst.x, y: inst.y };
            try { if (typeof Ritual !== 'undefined' && Ritual.startHydraStorm) Ritual.startHydraStorm(s); } catch (e) {}
            if (typeof Ritual !== 'undefined' && Ritual.bossIntro) Ritual.bossIntro(s, sp, inst.x, inst.y, inst, 10, 'rise');
            if (typeof Ritual !== 'undefined' && Ritual.fightCountdown) Ritual.fightCountdown(s, inst, { noTeleport: true, delaySec: 10 });
        } catch (e) { return __AH_say('hook failed: ' + e.message, '#f87171'); }
        __AH_say('HYDRA HOOKED — sea phase', '#10b981');
    },

    // Force phase 2 breach on the hooked hydra (sets 49% HP).
    p2() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            const f = s.fishing && s.fishing.hookedFish;
            if (f && f.species && f.species.id === 'stormlord_hydra') {
                f.hp = Math.floor((f.maxHp || 34000) * 0.49);
                return __AH_say('HP -> 49% — breach imminent', '#fbbf24');
            }
            const m = (s.monstersOnLand || []).find(mm => mm.species && mm.species.id === 'stormlord_hydra');
            if (m) {
                m.hp = Math.floor((m.maxHp || 34000) * 0.49);
                return __AH_say('land hydra -> 49%', '#fbbf24');
            }
        } catch (e) {}
        __AH_say('no live hydra found', '#f87171');
    },

    // Spawn the land-phase hydra directly (phase 2 shore moveset).
    land() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        const sp = __AH_hydraSpecies(); if (!sp) return __AH_say('hydra species missing', '#f87171');
        try {
            const m = {
                id: 'boss-admin-' + Date.now(),
                species: sp, x: s.player.x - 200, y: s.player.y,
                hp: sp.maxHp, maxHp: sp.maxHp,
                vx: 0, vy: 0, chargeCooldown: 2, isCharging: false,
                phase: 2, isEnraged: true, enrageTimer: 999,
                _announced: true, _introMode: 'rise',
                dormantUntil: (s.time || 0) + 2,
            };
            s.monstersOnLand = s.monstersOnLand || [];
            s.monstersOnLand.push(m);
            s.activeBoss = m;
            try { if (typeof Ritual !== 'undefined' && Ritual.startHydraStorm) Ritual.startHydraStorm(s); } catch (e) {}
            if (typeof Ritual !== 'undefined' && Ritual.fightCountdown) Ritual.fightCountdown(s, m);
        } catch (e) { return __AH_say('spawn failed: ' + e.message, '#f87171'); }
        __AH_say('LAND HYDRA (P2 moveset)', '#10b981');
    },

    // Any boss by species id: the FULL summon cutscene (intro mode,
    // cinematic beats, name reveal, delayed countdown) exactly like a
    // real ritual — minus the item cost. Defaults to the slow swim-in
    // from the sea edge, like every boss arrival.
    // Void Leviathan always rides the NEW gate path (big offshore portal
    // + fade-in + roar + swim), same as the shrine finale.
    boss(id, mode) {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            if (typeof Ritual === 'undefined' || !Ritual.spawnBoss) return __AH_say('no Ritual', '#f87171');
            const bid = id || 'crimson_emperor';
            if (bid === 'void_shepherd') {
                try {
                    const sp = (typeof FISH_SPECIES !== 'undefined' && FISH_SPECIES.find(x => x.id === 'void_shepherd')) || null;
                    const m = Ritual.spawnVoidBossFromGate(s, sp);
                    if (!m) return __AH_say('void spawn failed (boss alive?)', '#f87171');
                } catch (e) { return __AH_say('void spawn failed: ' + e.message, '#f87171'); }
                return __AH_say('void summoned via SPACE GATE cutscene (portal + fade + roar + swim)', '#a855f7');
            }
            let def = null;
            try {
                if (typeof RITUALS !== 'undefined') def = RITUALS.find(r => r.bossId === bid) || null;
            } catch (e) {}
            const dur = (def && def.introDur) || 5;
            const how = mode || (def && def.intro) || 'swim';
            const quiet = bid === 'crimson_emperor' || bid === 'void_shepherd';
            const m = Ritual.spawnBoss(s, bid, dur, how, quiet);
            if (!m) return __AH_say('spawn failed (on island? boss alive?)', '#f87171');
            if (bid === 'crimson_emperor' && Ritual.emperorIntro) Ritual.emperorIntro(s, m);
            if (bid === 'void_shepherd' && Ritual.voidIntro) Ritual.voidIntro(s, m);
            Ritual.fightCountdown(s, m, { delaySec: dur });
        } catch (e) { return __AH_say('spawn failed: ' + e.message, '#f87171'); }
        __AH_say('boss summoned with full cutscene: ' + (id || 'crimson_emperor'), '#10b981');
    },

    // Void shrine test kit: 7 shards + 4 shrine legendaries + 1 void key.
    voidkit() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            const p = s.player;
            p.bucket = p.bucket || [];
            for (let i = 0; i < 7; i++) {
                if (typeof Ritual !== 'undefined' && Ritual.bucketItem) p.bucket.push(Ritual.bucketItem('shard'));
            }
            // One void-touched fish per rarity tier (common/rare/epic/legendary).
            const tiers = ['common', 'rare', 'epic', 'legendary'];
            tiers.forEach(rar => {
                try {
                    const pool = (typeof FISH_SPECIES !== 'undefined' && FISH_SPECIES.filter(x => x && !x.isBoss && x.rarity === rar)) || [];
                    const base = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
                    if (base) {
                        const inst = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, 0) : Object.assign({}, base);
                        if (typeof applyMutation === 'function') applyMutation(inst, 'void');
                        else { inst.mutation = 'void'; inst.name = 'Void ' + inst.name; }
                        p.bucket.push(inst);
                    }
                } catch (e) {}
            });
            if (typeof Ritual !== 'undefined' && Ritual.bucketItem) p.bucket.push(Ritual.bucketItem('void_key'));
            if (typeof Player !== 'undefined') Player.refreshHUD(s);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(s);
        } catch (e) { return __AH_say('voidkit failed: ' + e.message, '#f87171'); }
        __AH_say('VOID KIT: 7 shards + void common/rare/epic/legendary + 1 key — open ritual, OPEN GATE, E in', '#a855f7');
    },

    // Priest chain test kit: 10 blood-mutated epic+ fish for Marlin.
    bloodkit() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            const p = s.player;
            p.bucket = p.bucket || [];
            const pool = (typeof FISH_SPECIES !== 'undefined')
                ? FISH_SPECIES.filter(x => x && !x.isBoss && (x.rarity === 'epic' || x.rarity === 'legendary')) : [];
            for (let i = 0; i < 10 && pool.length; i++) {
                const base = pool[Math.floor(Math.random() * pool.length)];
                const inst = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, 0) : Object.assign({}, base);
                if (typeof applyMutation === 'function') applyMutation(inst, 'blood');
                else { inst.mutation = 'blood'; inst.name = 'Blood ' + inst.name; }
                p.bucket.push(inst);
            }
            if (typeof Player !== 'undefined') Player.refreshHUD(s);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(s);
        } catch (e) { return __AH_say('bloodkit failed: ' + e.message, '#f87171'); }
        __AH_say('BLOOD KIT: 10 blood epic+ — trade Marlin, sacrifice at ritual', '#dc2626');
    },

    // Random mythical (non-boss) straight into the bucket.
    mythical() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            const pool = (typeof FISH_SPECIES !== 'undefined')
                ? FISH_SPECIES.filter(x => x && !x.isBoss && x.rarity === 'mythic') : [];
            if (!pool.length) return __AH_say('no mythics found', '#f87171');
            const base = pool[Math.floor(Math.random() * pool.length)];
            const inst = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, 5) : Object.assign({}, base);
            s.player.bucket = s.player.bucket || [];
            s.player.bucket.push(inst);
            if (typeof Player !== 'undefined') Player.refreshHUD(s);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(s);
        } catch (e) { return __AH_say('mythical failed: ' + e.message, '#f87171'); }
        __AH_say('MYTHICAL in bucket — sell / craft / admire', '#e879f9');
    },

    coins() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            s.player.coins = Math.max(s.player.coins || 0, 999999);
            if (typeof Player !== 'undefined') Player.refreshHUD(s);
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(s);
        } catch (e) {}
        __AH_say('999999c — go shopping', '#fbbf24');
    },

    // Every gun + full ammo, no stat changes.
    guns() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            const p = s.player;
            if (typeof WEAPONS !== 'undefined') {
                p.ownedWeapons = WEAPONS.map(w => w.id);
                p.weaponAmmo = {};
                WEAPONS.forEach(w => {
                    const mx = (typeof CONFIG !== 'undefined' && CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id]);
                    p.weaponAmmo[w.id] = (mx === Infinity || mx === undefined) ? Infinity : mx;
                });
            }
            if (typeof Player !== 'undefined') { Player.refreshHUD(s); Player.refreshWeaponHUD(s); }
            if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) { try { UI.renderWeaponToolbar(s); } catch (e) {} }
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(s);
        } catch (e) { return __AH_say('guns failed: ' + e.message, '#f87171'); }
        __AH_say('ALL GUNS + full ammo', '#38bdf8');
    },

    // Stormcaller intro on demand (needs <20 kills state? forces it).
    storm() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            if (typeof EnemySpawner !== 'undefined' && EnemySpawner.startStormIntro) {
                EnemySpawner.state = EnemySpawner.state || s;
                EnemySpawner.startStormIntro();
                return __AH_say('STORM INTRO playing — 3.5s', '#facc15');
            }
        } catch (e) { return __AH_say('storm failed: ' + e.message, '#f87171'); }
        __AH_say('no spawner', '#f87171');
    },

    god() {
        const s = __AH_st(); if (!s) return __AH_say('no state', '#f87171');
        try {
            const p = s.player;
            p.maxHp = 99999; p.hp = 99999;
            p.coins = Math.max(p.coins || 0, 99999);
            if (typeof WEAPONS !== 'undefined') {
                p.ownedWeapons = WEAPONS.map(w => w.id);
                p.equippedWeapons = [p.equippedWeapons[0] || 'pistol', WEAPONS[1] && WEAPONS[1].id, WEAPONS[2] && WEAPONS[2].id, WEAPONS[3] && WEAPONS[3].id];
                p.weaponAmmo = {};
                WEAPONS.forEach(w => {
                    const mx = (typeof CONFIG !== 'undefined' && CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id]);
                    p.weaponAmmo[w.id] = (mx === Infinity || mx === undefined) ? Infinity : mx;
                });
            }
            p.level = Math.max(p.level || 1, 50);
            if (typeof Player !== 'undefined') { Player.refreshHUD(s); Player.refreshWeaponHUD(s); }
        } catch (e) {}
        __AH_say('GOD MODE', '#fbbf24');
    },

    heal() {
        const s = __AH_st(); if (!s) return;
        try { s.player.hp = s.player.maxHp; if (typeof Player !== 'undefined') Player.refreshHUD(s); } catch (e) {}
        __AH_say('healed', '#34d399');
    },

    shore() {
        const s = __AH_st(); if (!s) return;
        try { s.player.x = (s.waterBoundaryX || 830) - 120; s.player.y = 1500; } catch (e) {}
        __AH_say('teleported to shore', '#38bdf8');
    },

    clear() {
        const s = __AH_st(); if (!s) return;
        try {
            s.enemies = (s.enemies || []).filter(e => e && e.isBoss);
            s.bullets = []; s.projectiles = [];
        } catch (e) {}
        __AH_say('trash cleared (bosses kept)', '#94a3b8');
    },

    kill() {
        const s = __AH_st(); if (!s) return;
        try {
            const f = s.fishing && s.fishing.hookedFish;
            if (f && f.species && f.species.id === 'stormlord_hydra') { f.hp = 1; return __AH_say('hooked hydra -> 1hp', '#f87171'); }
            const m = (s.monstersOnLand || []).find(mm => mm.species && mm.species.id === 'stormlord_hydra');
            if (m) { m.hp = 1; return __AH_say('land hydra -> 1hp', '#f87171'); }
        } catch (e) {}
        __AH_say('no live hydra found', '#f87171');
    },
};

const __AH_boot = function () {
    if (!__AH_isLocal) return;
    try { window.AH = AH; } catch (e) {}
    try {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'F9') { try { e.preventDefault(); } catch (err) {} __AH_toggle(); }
        });
    } catch (e) {}
    try { console.log('[ADMIN] localhost debug ready — F9 panel, window.AH.* console API'); } catch (e) {}
};

__AH_boot();
