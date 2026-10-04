// ============================================================
// SecureServer — client for server-authoritative RNG.
// Tries same-origin /api/casino/bet (works under `node server.js`).
// Returns null when offline (itch.io static) -> caller falls back
// to local Math.random. Server wins are the only cheat-proof path.
// ============================================================
const SecureServer = {
    _available: null, // null = unknown, true/false = probed
    _probeAt: 0,

    async probe() {
        // Cache probe 60s so we don't spam /api/health per spin.
        const now = Date.now();
        if (this._available !== null && now - this._probeAt < 60000) return this._available;
        try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 2000);
            const r = await fetch('/api/health', { signal: ctl.signal, cache: 'no-store' });
            clearTimeout(t);
            this._available = !!(r.ok && (await r.json()).authoritative);
        } catch (e) {
            this._available = false;
        }
        this._probeAt = now;
        return this._available;
    },

    // game: 'roulette' | 'slots' | 'fishbet' | 'highlow'
    // Returns server result object or null (fallback to local RNG).
    async roll(game, bet, extra) {
        try {
            if (!(await this.probe())) return null;
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 2500);
            const r = await fetch('/api/casino/bet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ game, bet, extra: extra || {} }),
                signal: ctl.signal,
            });
            clearTimeout(t);
            if (!r.ok) return null;
            const data = await r.json();
            if (!data || !data.ok || !data.result) return null;
            // Tag source so UI can show a lock icon when authoritative.
            data.result._server = true;
            return data.result;
        } catch (e) {
            return null;
        }
    },
    // --- Shop: server-canonical price (anti price=0 edits) ----------------
    // Returns { price } or null (offline -> trust local data files).
    async quote(kind, id, qty) {
        try {
            if (!(await this.probe())) return null;
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 2500);
            const r = await fetch('/api/shop/quote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, id, qty: qty || 1 }),
                signal: ctl.signal,
            });
            clearTimeout(t);
            if (!r.ok) return null;
            const data = await r.json();
            if (!data || !data.ok || typeof data.price !== 'number') return null;
            return data;
        } catch (e) { return null; }
    },

    // --- Shop sell: server clamps impossible values -----------------------
    // items: [{ id, value }]. Returns approvedTotal or null (offline).
    async sellClamp(items) {
        try {
            if (!(await this.probe())) return null;
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 3000);
            const r = await fetch('/api/shop/sell', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
                signal: ctl.signal,
            });
            clearTimeout(t);
            if (!r.ok) return null;
            const data = await r.json();
            if (!data || !data.ok || typeof data.approvedTotal !== 'number') return null;
            return data;
        } catch (e) { return null; }
    },

    // --- Save: local tamper-evident seal (detects casual edits) -----------
    // NOT cryptographic security offline (key is visible) — real proof is the
    // server receipt via signSaveOnline when hosted on node server.js.
    _pepper: 'ah1-save-seal',
    seal(saveObj) {
        try {
            const s = JSON.stringify(saveObj);
            let h1 = 0x811c9dc5, h2 = 0x01000193;
            const str = this._pepper + s + s.length;
            for (let i = 0; i < str.length; i++) {
                h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
                h2 = Math.imul(h2 + str.charCodeAt(i), 31) >>> 0;
            }
            return (h1.toString(16) + '-' + h2.toString(16));
        } catch (e) { return ''; }
    },
    async signSaveOnline(saveObj) {
        try {
            if (!(await this.probe())) return null;
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 3000);
            const r = await fetch('/api/save/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ save: saveObj }),
                signal: ctl.signal,
            });
            clearTimeout(t);
            if (!r.ok) return null;
            const data = await r.json();
            return (data && data.ok) ? data : null;
        } catch (e) { return null; }
    },
};

window.SecureServer = SecureServer;
