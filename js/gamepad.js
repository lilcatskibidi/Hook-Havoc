// ============================================================
//  GAMEPAD — Xbox + PlayStation (standard mapping covers both).
//  Left stick move · right stick aim · RT shoot · A cast/reel ·
//  B interact (else item) · X reload · Y index · R3 dash · LB/RB cycle
//  D-pad slots 1-4 · Start menu. Rumble on hurt + boss arrival.
//  Polled once per frame from the main loop; fully guarded when no
//  pad is connected (zero cost, zero throws).
// ============================================================
const GamepadControls = {
    prevButtons: [],
    prevAxes: [],
    aimAngle: null, // persistent aim while right stick rests
    status: 'none', // none | connected (pad name in label)
    label: '',
    _rumbleAt: 0,

    pad() {
        try {
            if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
            const pads = navigator.getGamepads();
            for (let i = 0; i < pads.length; i++) {
                if (pads[i] && pads[i].connected) return pads[i];
            }
        } catch (e) {}
        return null;
    },

    name() {
        const p = this.pad();
        if (!p) return '';
        // Shorten "Xbox 360 Controller (XInput STANDARD GAMEPAD ...)" noise
        let n = String(p.id || 'Gamepad');
        n = n.replace(/\s*\(.*?STANDARD GAMEPAD.*?\)/i, '').trim();
        return (n || 'Gamepad').slice(0, 34);
    },

    _btn(gp, i) {
        try {
            const b = gp.buttons && gp.buttons[i];
            if (!b) return { pressed: false, value: 0 };
            return { pressed: !!b.pressed, value: typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0) };
        } catch (e) { return { pressed: false, value: 0 }; }
    },

    _ax(gp, i) {
        try {
            const v = gp.axes && typeof gp.axes[i] === 'number' ? gp.axes[i] : 0;
            return Math.abs(v) < 0.22 ? 0 : v; // deadzone
        } catch (e) { return 0; }
    },

    rumble(sec, strong, weak) {
        try {
            const now = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
            if (now - this._rumbleAt < 0.15) return; // throttle
            this._rumbleAt = now;
            const p = this.pad();
            const act = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0]));
            if (act && typeof act.playEffect === 'function') {
                act.playEffect('dual-rumble', {
                    duration: Math.min(1000, (sec || 0.2) * 1000),
                    strongMagnitude: strong == null ? 0.6 : strong,
                    weakMagnitude: weak == null ? 0.4 : weak,
                }).catch(() => {});
            }
        } catch (e) {}
    },

    // Aim assist: nearest shootable thing within range of the player.
    // Used by touch FIRE and by gamepad when the right stick is idle.
    autoAim(state, maxDist) {
        try {
            const p = state.player;
            const range = maxDist || 700;
            let best = null, bestD = range;
            const consider = (x, y) => {
                const d = Math.hypot(x - p.x, y - p.y);
                if (d < bestD) { bestD = d; best = { x, y }; }
            };
            const hf = state.fishing && state.fishing.mode === 'HOOKED' ? state.fishing.hookedFish : null;
            if (hf && !hf.isDead) consider(hf.x, hf.y);
            (state.monstersOnLand || []).forEach(m => { if (m && (m.hp || 0) > 0) consider(m.x, m.y); });
            (state.enemies || []).forEach(e => { if (e && (e.hp || 0) > 0 && !e.burrowed) consider(e.x, e.y); });
            return best;
        } catch (e) { return null; }
    },

    // Project a world point back to screen pixels (for the crosshair).
    // Backing-pixel space, matching Camera.screenToWorld (exact inverse).
    worldToScreen(state, wx, wy) {
        try {
            if (typeof Camera !== 'undefined' && Camera.worldToScreen) {
                return Camera.worldToScreen(state, wx, wy);
            }
            const bw = state.canvasWidth || 1;
            const bh = state.canvasHeight || 1;
            const cam = state.camera;
            return {
                x: (wx - cam.x) * cam.zoom + bw / 2,
                y: (wy - cam.y) * cam.zoom + bh / 2,
            };
        } catch (e) { return null; }
    },

    pressShoot(state, hold) {
        try {
            if (!state.player || state.player.isDead) return;
            if (typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil) return;
            if (typeof audio !== 'undefined' && audio.init) audio.init();
            if (hold) state.mouse.isDown = true;
            if (typeof WeaponSystem !== 'undefined') WeaponSystem.shoot(state);
        } catch (e) {}
    },

    update(state) {
        const gp = this.pad();
        if (!gp) {
            if (this.status !== 'none') {
                this.status = 'none';
                this.label = '';
                this.prevButtons = [];
                try {
                    const chip = document.getElementById('pad-chip');
                    if (chip) chip.classList.add('hidden');
                } catch (e) {}
            }
            return;
        }
        if (this.status === 'none') {
            this.status = 'connected';
            this.label = this.name();
            try {
                const chip = document.getElementById('pad-chip');
                const chipLabel = document.getElementById('pad-chip-label');
                if (chip) chip.classList.remove('hidden');
                if (chipLabel) chipLabel.innerText = this.label || 'Gamepad';
            } catch (e) {}
            try {
                if (typeof UI !== 'undefined' && state.player) {
                    Particles.showFloatingText(state, '🎮 ' + (this.label || 'Gamepad') + ' connected', state.player.x, state.player.y - 60, '#7dd3fc');
                }
            } catch (e) {}
        }
        if (!state.player || state.player.isDead || state.paused) {
            this.prevButtons = [];
            // Don't leave virtual movement stuck while paused/dead — and
            // never leave the virtual SPACE (A = cast/reel) held, or the
            // player respawns already reeling.
            try {
                if (!this._padKeys) this._padKeys = {};
                for (const k of Object.keys(this._padKeys)) {
                    if (this._padKeys[k]) {
                        state.keys[k] = false;
                        this._padKeys[k] = false;
                    }
                }
                state.keys[' '] = false;
                state.mouse.isDown = false;
            } catch (e) {}
            return;
        }

        const btn = (i) => this._btn(gp, i).pressed;
        const edge = (i) => btn(i) && !this.prevButtons[i];
        const release = (i) => !btn(i) && !!this.prevButtons[i];

        // --- Left stick: movement (drives the same keys WASD uses).
        // Only keys the pad itself set are ever cleared by the pad, so a
        // centered stick never eats a physically held keyboard key.
        const mx = this._ax(gp, 0), my = this._ax(gp, 1);
        const dirs = [['w', my < -0.25], ['s', my > 0.25], ['a', mx < -0.25], ['d', mx > 0.25]];
        for (const [k, down] of dirs) {
            if (down) {
                state.keys[k] = true;
                this._padKeys[k] = true;
            } else if (this._padKeys[k]) {
                state.keys[k] = false;
                this._padKeys[k] = false;
            }
        }

        // --- Right stick: aim ---
        const ax = this._ax(gp, 2), ay = this._ax(gp, 3);
        if (Math.hypot(ax, ay) > 0.25) {
            this.aimAngle = Math.atan2(ay, ax);
        }
        if (this.aimAngle == null) this.aimAngle = 0;
        try {
            const p = state.player;
            const wx = p.x + Math.cos(this.aimAngle) * 420;
            const wy = p.y + Math.sin(this.aimAngle) * 420;
            state.mouse.worldX = wx;
            state.mouse.worldY = wy;
            state.mouse._moved = true;
            const s = this.worldToScreen(state, wx, wy);
            if (s) { state.mouse.x = s.x; state.mouse.y = s.y; }
        } catch (e) {}

        // --- RT (7) or A-hold alternative: shoot ---
        const rt = this._btn(gp, 7);
        const shooting = rt.value > 0.3 || rt.pressed;
        state.mouse.isDown = shooting;
        if (edge(7) && typeof WeaponSystem !== 'undefined') this.pressShoot(state, true);

        // --- A (0): cast / reel (SPACE). Mirror the virtual SPACE key
        // like the touch CAST button — reeling reads state.keys[' '].
        if (edge(0)) {
            try { state.keys[' '] = true; this._padKeys[' '] = true; } catch (e) {}
            if (typeof Fishing !== 'undefined') Fishing.onSpaceDown(state);
        }
        if (release(0)) {
            if (typeof Fishing !== 'undefined') Fishing.onSpaceUp(state);
            try { state.keys[' '] = false; this._padKeys[' '] = false; } catch (e) {}
        }

        // --- B (1): interact, else equipped item ---
        if (edge(1) && typeof Input !== 'undefined') {
            let acted = false;
            try { acted = !!Input.interact(state); } catch (e) {}
            if (!acted) {
                try { if (typeof ItemSystem !== 'undefined') ItemSystem.useEquipped(state); } catch (e) {}
            }
        }

        // --- R3 (11): dash ---
        if (edge(11) && typeof Player !== 'undefined') {
            try { Player.tryDash(state); } catch (e) {}
        }

        // --- X (2): reload ---
        if (edge(2) && typeof WeaponSystem !== 'undefined') WeaponSystem.reload(state);

        // --- Y (3): fish index ---
        if (edge(3) && typeof FishIndex !== 'undefined' && !state.paused) FishIndex.toggleInGame();

        // --- LB/RB (4/5): cycle weapon slots ---
        if (edge(5)) this._cycleWeapon(state, 1);
        if (edge(4)) this._cycleWeapon(state, -1);

        // --- D-pad (12-15): direct slots 1-4 ---
        for (let s = 0; s < 4; s++) {
            if (edge(12 + s) && typeof Player !== 'undefined') Player.selectWeapon(state, s);
        }

        // --- Start (9): menu ---
        if (edge(9) && typeof Input !== 'undefined') Input.toggleMenu(state);

        // remember for edge detection
        this.prevButtons = [];
        try {
            for (let i = 0; i < (gp.buttons ? gp.buttons.length : 0); i++) {
                this.prevButtons[i] = !!(gp.buttons[i] && gp.buttons[i].pressed);
            }
        } catch (e) {}
    },

    // Keys currently held down by the pad (cleared on center).
    _padKeys: {},

    _cycleWeapon(state, dir) {
        try {
            const p = state.player;
            if (typeof Player === 'undefined') return;
            let slot = p.activeSlot;
            for (let i = 0; i < 4; i++) {
                slot = (slot + dir + 4) % 4;
                if (p.equippedWeapons[slot]) {
                    Player.selectWeapon(state, slot);
                    return;
                }
            }
        } catch (e) {}
    },
};

window.GamepadControls = GamepadControls;
