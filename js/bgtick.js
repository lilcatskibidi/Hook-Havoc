// ============================================================
// BackgroundTick — keep the world alive while the tab is hidden.
//
// Browsers stop requestAnimationFrame in background tabs, which used to
// freeze the whole sim (and MP rooms force-paused you to the menu on
// tab-out). Instead, a 1s interval advances the SAME update functions
// with fixed 1s steps while hidden: clock/weather, fishing,
// combat, loot, enemies, boat rides — plus MP heartbeats so the host
// never ghost-drops a tabbed-out member, and autosaves.
//
// Rules mirror the foreground loop exactly:
//   - menu-paused / dead / 0-HP  -> sim stays frozen (net + save continue)
//   - Settings/audio stay local; we suspend the AudioContext on hide
//     and clear possibly-stuck inputs on return.
// Catch-up is capped per tick so a heavily-throttled timer can't spiral.
// ============================================================
const BackgroundTick = {
    state: null,
    timer: null,
    lastWall: 0,
    saveAcc: 0,
    MAX_CATCHUP: 120, // max sim-seconds processed per 1s tick

    init(state) {
        this.state = state;
        try { this.lastWall = performance.now(); } catch (e) { this.lastWall = 0; }
        if (this.timer) { try { clearInterval(this.timer); } catch (e) {} }
        this.timer = setInterval(() => { try { this.tick(); } catch (e) {} }, 1000);
        document.addEventListener('visibilitychange', () => {
            try {
                if (document.hidden) this.onHide();
                else this.onShow();
            } catch (e) {}
        });
    },

    // Same run-gate as the foreground main loop.
    running() {
        const st = this.state;
        return !!(st && st.player && !st.paused && !st.player.isDead && (st.player.hp || 0) > 0);
    },

    onHide() {
        try { this.lastWall = performance.now(); } catch (e) {}
        this.saveAcc = 0;
        // Suspend the webaudio graph so loops don't glitch under throttle.
        try {
            if (typeof audio !== 'undefined' && audio.ctx &&
                audio.ctx.state === 'running' && !audio.muted) {
                audio.ctx.suspend();
                audio._bgSuspended = true;
            }
        } catch (e) {}
    },

    onShow() {
        const st = this.state;
        // Stuck-input guard: keys/mouse released while hidden never fire
        // events, so a held SPACE/W/click would reel/walk/shoot forever.
        try {
            if (st) {
                st.keys = {};
                if (st.mouse) st.mouse.isDown = false;
            }
        } catch (e) {}
        try {
            if (typeof audio !== 'undefined' && audio.ctx && audio._bgSuspended && !audio.muted) {
                audio._bgSuspended = false;
                if (audio.ctx.state === 'suspended') audio.ctx.resume();
            }
        } catch (e) {}
        try { this.lastWall = performance.now(); } catch (e) {}
    },

    tick() {
        try {
            if (!document.hidden) {
                try { this.lastWall = performance.now(); } catch (e) {}
                return; // foreground rAF loop owns the sim
            }
        } catch (e) { return; }
        let now = 0;
        try { now = performance.now(); } catch (e) { return; }
        let elapsed = (now - (this.lastWall || now)) / 1000;
        this.lastWall = now;
        if (!(elapsed > 0)) return;
        const st = this.state;
        if (!st || !st.player) return;
        if (this.running()) {
            const n = Math.min(Math.floor(elapsed), this.MAX_CATCHUP);
            for (let i = 0; i < n; i++) {
                // Death mid-catch-up freezes the rest (mirrors foreground).
                if (this.stepSim(1.0) === 'dead') break;
            }
            this.saveAcc += elapsed;
            if (this.saveAcc >= 30) { this.saveAcc = 0; this.autosave(); }
        }
        this.netTick();
    },

    // One fixed second of world. Same systems, same order as mainLoop —
    // minus camera/mouse/render (nothing to draw while hidden).
    // Returns 'dead' when the player died mid-step.
    stepSim(dt) {
        const st = this.state;
        st.time += dt;
        if (typeof WorldSystem !== 'undefined' && WorldSystem.update) {
            try { WorldSystem.update(st, dt); } catch (e) {}
        }
        if (typeof Player !== 'undefined') {
            try { Player.update(st, dt); } catch (e) {}
        }
        if (!st.player || st.player.isDead || (st.player.hp || 0) <= 0) return 'dead';
        if (typeof Ritual !== 'undefined' && Ritual.update) {
            try { Ritual.update(st, dt); } catch (e) {}
        }
        if (typeof Fishing !== 'undefined') {
            try { Fishing.update(st, dt); } catch (e) {}
        }
        if (typeof WeaponSystem !== 'undefined') {
            try { WeaponSystem.update(st, dt); } catch (e) {}
        }
        if (typeof Combat !== 'undefined') {
            try { Combat.update(st, dt); } catch (e) {}
        }
        if (typeof Particles !== 'undefined') {
            try { Particles.update(st, dt); } catch (e) {}
        }
        if (typeof EnemySpawner !== 'undefined') {
            try { EnemySpawner.update(dt); } catch (e) {}
        }
        // Survival achievement clock (mirrors foreground).
        try {
            if (!st.paused && st.player.hp > 0) {
                st.player.survivalTime = (st.player.survivalTime || 0) + dt;
                if (st.player.survivalTime >= 3600 && typeof Achievements !== 'undefined') {
                    Achievements.checkSurvival(st, st.player.survivalTime);
                }
            }
        } catch (e) {}
        return 'ok';
    },

    // Keep the room alive: host broadcasts, clients send input.
    // (Without this the host's 12s ghost-drop eats tabbed-out members.)
    netTick() {
        const st = this.state;
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.roomCode) return;
            if (!st.multiplayer) return;
            if (Multiplayer.isHost) {
                if (Multiplayer.sendLocalState) {
                    try { Multiplayer.sendLocalState(); } catch (e) {}
                }
            } else {
                const build = (typeof mpClientInput === 'function') ? mpClientInput() : null;
                if (build && Multiplayer.sendInput) {
                    try { Multiplayer.sendInput(build); } catch (e) {}
                }
            }
        } catch (e) {}
    },

    // Same save router as the foreground autosaver.
    autosave() {
        const st = this.state;
        try {
            if (!st || st.paused) return;
            if (st.player && st.player.isDead) return; // never save a corpse
            if (typeof SaveSystem === 'undefined') return;
            if (typeof Multiplayer !== 'undefined' && Multiplayer.isHost && Multiplayer.roomCode) {
                SaveSystem.saveMP(st);
            } else if (!(typeof Multiplayer !== 'undefined' && Multiplayer.roomCode)) {
                SaveSystem.save(st);
            }
        } catch (e) {}
    }
};

window.BackgroundTick = BackgroundTick;
