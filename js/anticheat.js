// ============================================================
// AntiCheat — lightweight console-tamper guard for a local game.
// Cannot make cheating impossible in browser JS, but it detects
// impossible jumps (coins/tokens/level/ammo), reverts them, and
// warns. Legit gains go through markLegit() / trackEarn().
// ============================================================
const AntiCheat = {
    state: null,
    last: null,
    violations: 0,
    // Per-tick legit allowances (generous so real play never trips)
    LIMITS: {
        coinsPerSec: 50000,
        tokensPerSec: 5000,
        xpPerSec: 50000,
        levelPerSec: 2,
    },

    init(state) {
        this.state = state;
        this.last = this.snapshot(state);
        this.lastTime = performance.now();
        // Hide the raw handle a bit: keep a non-enumerable backup
        try {
            Object.defineProperty(window, '__gameState', {
                value: state, writable: false, configurable: false, enumerable: false
            });
        } catch (e) {}
        setInterval(() => this.check(), 1000);
        // Detect direct localStorage save editing
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

    // Call when the game itself grants currency (shop sell, casino, rewards)
    // so the next check treats it as legit.
    markLegit() {
        if (!this.state) return;
        this.last = this.snapshot(this.state);
        this.lastTime = performance.now();
    },

    trackEarn() { this.markLegit(); },

    check(fromStorage) {
        if (!this.state || !this.last) return;
        const now = performance.now();
        const dt = Math.max(1, (now - (this.lastTime || now)) / 1000);
        const p = this.state.player;
        const cur = this.snapshot(this.state);
        const cheat = [];

        const dCoins = cur.coins - this.last.coins;
        if (dCoins > this.LIMITS.coinsPerSec * dt + 2000) cheat.push(`coins +${dCoins}`);
        if (!Number.isFinite(cur.coins) || cur.coins < 0) cheat.push('coins invalid');

        const dTok = cur.tokens - this.last.tokens;
        if (dTok > this.LIMITS.tokensPerSec * dt + 500) cheat.push(`tokens +${dTok}`);
        if (!Number.isFinite(cur.tokens) || cur.tokens < 0) cheat.push('tokens invalid');

        const dXp = cur.xp - this.last.xp;
        if (dXp > this.LIMITS.xpPerSec * dt + 2000) cheat.push(`xp +${dXp}`);
        if ((cur.level - this.last.level) > Math.ceil(this.LIMITS.levelPerSec * dt) + 1) cheat.push('level jump');

        // Ammo sanity: any negative or absurd value
        try {
            const ammo = p.weaponAmmo || {};
            for (const [k, v] of Object.entries(ammo)) {
                const max = (typeof CONFIG !== 'undefined' && CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[k]) || Infinity;
                if (typeof v !== 'number' || isNaN(v) || v < 0 || (max !== Infinity && v > max * 2)) {
                    cheat.push(`ammo ${k}`);
                    break;
                }
            }
        } catch (e) {}

        // Owned-item count can only grow via shop (1-2 per sec max legit)
        if (cur.owned - this.last.owned > 3) cheat.push('weapons unlock jump');
        if (cur.rods - this.last.rods > 2) cheat.push('rods unlock jump');

        if (cheat.length) {
            this.violations++;
            console.warn(`[AntiCheat] tamper detected (${cheat.join(', ')}). Reverting. Violation #${this.violations}`);
            // Revert currency fields to last known-good values
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
                // Escalate: force-save clean state + harder lock
                try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(this.state); } catch (e) {}
            }
        } else {
            this.last = cur;
            this.lastTime = now;
        }
    }
};

window.AntiCheat = AntiCheat;
