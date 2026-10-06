// ============================================================
// AntiCheat — lightweight console-tamper guard for a local game.
// Cannot make cheating impossible in browser JS; server-authoritative
// rolls (server/authority.js) are the real protection when online.
// This guard only catches crude F12 edits, and is tuned to NEVER
// punish legit play:
//  - every legit earner calls markLegit() (shop, casino, quests,
//    achievements, boss kills, save loads)
//  - first 2 anomalies per session only WARN (no revert)
//  - revert only on 3rd+ anomaly, or instantly on hard-invalid
//    (NaN, negative, > 1e9 — values the game can never produce)
//  - a grace window after loads/earns skips rate checks entirely
// Limits reflect the real economy (v1.3.x): casino jackpot pays up to
// 500k tokens in one spin, cashout up to ~35M coins, top achievements
// grant 500k coins / 100k XP, bulk bucket sells clear millions.
// ============================================================
const AntiCheat = {
    state: null,
    last: null,
    violations: 0,   // reverts performed
    warns: 0,        // soft warnings (no revert)
    graceUntil: 0,
    lastTime: 0,

    // Backstop for UNMARKED gains (anything legit calls markLegit first,
    // so these only trip on console edits between two ticks).
    LIMITS: {
        coinsPerSec: 5_000_000,
        tokensPerSec: 1_000_000,
        xpPerSec: 1_000_000,
        levelPerSec: 10,
    },
    HARD_CAP: 1_000_000_000, // save.js clamps to 1e9 — above is impossible
    GRACE_MS: 3000,
    WARN_ONLY: 2, // first N anomalies per session: warn, don't revert

    init(state) {
        this.state = state;
        this.last = this.snapshot(state);
        this.lastTime = performance.now();
        this.graceUntil = performance.now() + this.GRACE_MS; // boot grace
        try {
            Object.defineProperty(window, '__gameState', {
                value: state, writable: false, configurable: false, enumerable: false
            });
        } catch (e) {}
        setInterval(() => this.check(), 1000);
        window.addEventListener('storage', () => this.check(true));
    },

    snapshot(state) {
        const p = state.player;
        return {
            coins: p.coins || 0,
            tokens: (typeof Casino !== 'undefined' ? Casino.tokens : p.casinoTokens) || 0,
            xp: p.xp || 0,
            level: p.level || 1,
            ammo: JSON.stringify(p.weaponAmmo || {}),
            owned: (p.ownedWeapons || []).length,
            rods: (p.unlockedRods || []).length,
        };
    },

    // Call when the game itself grants currency/items (shop sell, casino,
    // rewards, kills) so the next check treats it as legit.
    // Also opens a short grace window for multi-tick earn animations.
    markLegit() {
        if (!this.state) return;
        this.last = this.snapshot(this.state);
        this.lastTime = performance.now();
        this.graceUntil = performance.now() + this.GRACE_MS;
    },

    // Call after SaveSystem.load/loadMP applies a save: a rich save looks
    // exactly like a cheat jump vs. the pre-load snapshot, so re-baseline.
    notifyLoad() { this.markLegit(); },

    trackEarn() { this.markLegit(); },

    badNumber(v) {
        return (typeof v !== 'number') || !Number.isFinite(v) || v < 0 || v > this.HARD_CAP;
    },

    check(fromStorage) {
        if (!this.state || !this.last) return;
        const now = performance.now();
        // Grace window (boot, save loads, recent legit earns): just re-baseline.
        if (now < this.graceUntil) {
            this.last = this.snapshot(this.state);
            this.lastTime = now;
            return;
        }
        const dt = Math.max(1, (now - (this.lastTime || now)) / 1000);
        const p = this.state.player;
        const cur = this.snapshot(this.state);
        const cheat = [];
        let hard = false;

        // Hard-invalid: the game can never produce these — revert instantly.
        if (this.badNumber(cur.coins)) { cheat.push('coins invalid'); hard = true; }
        if (this.badNumber(cur.tokens)) { cheat.push('tokens invalid'); hard = true; }
        if (this.badNumber(cur.xp)) { cheat.push('xp invalid'); hard = true; }
        if (!Number.isFinite(cur.level) || cur.level < 1 || cur.level > 999) { cheat.push('level invalid'); hard = true; }

        // Rate backstop (only for unmarked gains — legit flows markLegit).
        const dCoins = cur.coins - this.last.coins;
        if (dCoins > this.LIMITS.coinsPerSec * dt) cheat.push(`coins +${dCoins}`);
        const dTok = cur.tokens - this.last.tokens;
        if (dTok > this.LIMITS.tokensPerSec * dt) cheat.push(`tokens +${dTok}`);
        const dXp = cur.xp - this.last.xp;
        if (dXp > this.LIMITS.xpPerSec * dt) cheat.push(`xp +${dXp}`);
        if ((cur.level - this.last.level) > Math.ceil(this.LIMITS.levelPerSec * dt)) cheat.push('level jump');

        // Ammo sanity: negative or above 2x magazine (Infinity = endless gun).
        try {
            const ammo = p.weaponAmmo || {};
            for (const [k, v] of Object.entries(ammo)) {
                if (v === Infinity) continue; // pistol & endless guns
                const max = (typeof CONFIG !== 'undefined' && CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[k]) || Infinity;
                if (typeof v !== 'number' || isNaN(v) || v < 0 || (max !== Infinity && v > max * 2)) {
                    cheat.push(`ammo ${k}`);
                    break;
                }
            }
        } catch (e) {}

        // Bulk unlocks happen on save-load (covered by grace) — only flag
        // absurd same-tick jumps of 6+ weapons / 4+ rods.
        if (cur.owned - this.last.owned > 5) cheat.push('weapons unlock jump');
        if (cur.rods - this.last.rods > 3) cheat.push('rods unlock jump');

        if (!cheat.length) {
            this.last = cur;
            this.lastTime = now;
            return;
        }

        // Soft path: first anomalies only warn (avoids punishing edge-case
        // legit gains the limits didn't foresee).
        if (!hard && this.warns < this.WARN_ONLY) {
            this.warns++;
            console.warn(`[AntiCheat] anomaly (${cheat.join(', ')}). Warning ${this.warns}/${this.WARN_ONLY} — no revert. If legit, tell us!`);
            this.last = cur;
            this.lastTime = now;
            return;
        }

        this.violations++;
        console.warn(`[AntiCheat] tamper detected (${cheat.join(', ')}). Reverting. Violation #${this.violations}`);
        p.coins = this.last.coins;
        if (typeof Casino !== 'undefined') { Casino.tokens = this.last.tokens; try { Casino.updateTokenDisplay(); } catch (e) {} }
        p.casinoTokens = this.last.tokens;
        p.xp = this.last.xp;
        p.level = this.last.level;
        if (typeof Player !== 'undefined') {
            try { Player.refreshHUD(this.state); Player.refreshWeaponHUD(this.state); } catch (e) {}
        }
        if (typeof Particles !== 'undefined') {
            Particles.showFloatingText(this.state, '⚠ CHEAT DETECTED — REVERTED', p.x, p.y - 60, '#f87171');
        }
        if (this.violations >= 5) {
            try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(this.state); } catch (e) {}
        }
    }
};

window.AntiCheat = AntiCheat;
