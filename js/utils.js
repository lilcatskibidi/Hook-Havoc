// Math and general helpers
const Utils = {
    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
    lerp(a, b, t) { return a + (b - a) * t; },
    dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
    angle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },
    rand(min, max) { return Math.random() * (max - min) + min; },
    randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    now() { return performance.now() / 1000; },
    smooth(current, target, speed, dt) {
        const t = 1 - Math.pow(1 - speed, dt * 60);
        return current + (target - current) * t;
    },
    // Loop fallback: run a per-frame system without ever letting it kill
    // the game loop. Errors log throttled (once per 5s per system) instead
    // of throwing every frame into a freeze.
    _loopErrAt: {},
    safeTick(sys, fn) {
        try {
            fn();
        } catch (e) {
            try {
                const now = Date.now();
                if (!this._loopErrAt[sys] || now - this._loopErrAt[sys] > 5000) {
                    this._loopErrAt[sys] = now;
                    console.error(`[loop-guard] ${sys} threw (game continues):`, (e && e.message) || e);
                }
            } catch (ee) {}
        }
    }
};