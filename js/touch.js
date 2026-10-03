// ============================================================
//  TOUCH — mobile controls (low-end and high-end phones/tablets).
//  Left virtual joystick to move, big CAST / FIRE buttons, E / R /
//  weapon / menu buttons. FIRE auto-aims the nearest threat (no
//  precision aiming on a touchscreen). Also auto-picks a perf tier:
//  low-end devices get reduced resolution + FX, high-end gets full.
//  Everything degrades silently on desktop (module never activates).
// ============================================================
const TouchControls = {
    active: false, // true once a touch device is detected
    joy: { id: null, cx: 0, cy: 0, dx: 0, dy: 0 },
    fireHeld: false,
    fireTimer: 0,
    _padKeys: {},
    perf: 'high', // low | high

    isTouchDevice() {
        // Real mobile/tablet: touch support AND a coarse (finger) primary
        // pointer. Hybrid laptop touchscreens report touch points but keep a
        // fine mouse pointer — those stay on desktop controls.
        try {
            const touch = ('ontouchstart' in window) ||
                (navigator.maxTouchPoints > 0) ||
                (navigator.msMaxTouchPoints > 0);
            if (!touch) return false;
            if (window.matchMedia) {
                if (window.matchMedia('(pointer: coarse)').matches) return true;
                // No coarse pointer (mouse-first device): not mobile.
                if (window.matchMedia('(pointer: fine)').matches) return false;
            }
            return true;
        } catch (e) { return false; }
    },

    // Settings override: 'auto' | 'on' | 'off'. PC hides touch buttons.
    mode() {
        try {
            if (typeof Settings !== 'undefined' && Settings.data && Settings.data.touch) {
                return Settings.data.touch;
            }
        } catch (e) {}
        return 'auto';
    },

    shouldShow() {
        const m = this.mode();
        if (m === 'on') return true;
        if (m === 'off') return false;
        return this.isTouchDevice();
    },

    // ---- perf autodetect: weak device -> low tier ----
    detectPerf() {
        try {
            const mem = navigator.deviceMemory || 8; // GB, Chrome-only
            const cores = navigator.hardwareConcurrency || 8;
            const small = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) < 500;
            if ((mem <= 4 && cores <= 4) || (small && cores <= 4)) this.perf = 'low';
            else this.perf = 'high';
        } catch (e) { this.perf = 'high'; }
        this.applyPerf();
        return this.perf;
    },

    applyPerf() {
        try {
            if (this.perf === 'low') {
                if (typeof CONFIG !== 'undefined') CONFIG.FX_DENSITY = 0.3;
                document.body.classList.add('perf-low');
            } else {
                document.body.classList.remove('perf-low');
            }
            // Re-run canvas sizing so the render scale takes effect.
            try { window.dispatchEvent(new Event('resize')); } catch (e) {}
        } catch (e) {}
        return this.perf;
    },

    renderScale() {
        // Backing-store scale for the main canvas (resizeCanvas multiplies
        // by this). Low tier renders fewer pixels = big FPS win on phones.
        return this.active && this.perf === 'low' ? 0.7 : 1;
    },

    init(state) {
        if (!this._bound) {
            this._bound = true;
            this._bindJoystick(state);
            this._bindButtons(state);
        }
        if (!this.shouldShow()) {
            this.active = false;
            const ui = document.getElementById('touch-ui');
            if (ui) ui.classList.add('hidden');
            return;
        }
        this.active = true;
        this.detectPerf();
        const ui = document.getElementById('touch-ui');
        if (ui) ui.classList.remove('hidden');
        try {
            if (typeof UI !== 'undefined' && state.player) {
                Particles.showFloatingText(state, '📱 Touch controls on (' + this.perf + ' perf)', state.player.x, state.player.y - 60, '#7dd3fc');
            }
        } catch (e) {}
    },

    // Re-evaluate visibility (called when the Touch UI setting changes).
    refresh(state) {
        this.init(state);
    },

    _zone(id) {
        return document.getElementById(id);
    },

    _bindJoystick(state) {
        const zone = this._zone('touch-joy');
        const knob = this._zone('touch-joy-knob');
        if (!zone) return;
        const R = 52; // px travel
        const setKnob = (dx, dy) => {
            if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };
        const handle = (t) => {
            const rect = zone.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            let dx = t.clientX - cx, dy = t.clientY - cy;
            const d = Math.hypot(dx, dy) || 1;
            const cl = Math.min(1, d / R);
            dx = (dx / d) * R * cl;
            dy = (dy / d) * R * cl;
            this.joy.dx = dx / R;
            this.joy.dy = dy / R;
            setKnob(dx, dy);
        };
        zone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            try { if (typeof audio !== 'undefined' && audio.init) audio.init(); } catch (err) {}
            const t = e.changedTouches[0];
            this.joy.id = t.identifier;
            handle(t);
        }, { passive: false });
        zone.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (t.identifier === this.joy.id) handle(t);
            }
        }, { passive: false });
        const end = (e) => {
            for (const t of e.changedTouches) {
                if (t.identifier === this.joy.id) {
                    this.joy.id = null;
                    this.joy.dx = 0;
                    this.joy.dy = 0;
                    setKnob(0, 0);
                }
            }
        };
        zone.addEventListener('touchend', end);
        zone.addEventListener('touchcancel', end);
    },

    _press(el, down, up) {
        if (!el) return;
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            try { if (typeof audio !== 'undefined' && audio.init) audio.init(); } catch (err) {}
            try { down(); } catch (err) {}
        }, { passive: false });
        const release = (e) => {
            if (e) e.preventDefault();
            try { if (up) up(); } catch (err) {}
        };
        el.addEventListener('touchend', release);
        el.addEventListener('touchcancel', release);
        // Mouse fallback (desktop testing / hybrid laptops)
        el.addEventListener('mousedown', (e) => { e.preventDefault(); try { down(); } catch (err) {} });
        el.addEventListener('mouseup', () => { try { if (up) up(); } catch (err) {} });
    },

    _bindButtons(state) {
        // CAST = SPACE (cast / reel / pull bobber back)
        this._press(this._zone('touch-cast'),
            () => { if (typeof Fishing !== 'undefined') Fishing.onSpaceDown(state); },
            () => { if (typeof Fishing !== 'undefined') Fishing.onSpaceUp(state); });
        // FIRE = hold to shoot (auto-aims; semi-autos re-fire on a timer)
        this._press(this._zone('touch-fire'),
            () => {
                this.fireHeld = true;
                this.fireTimer = 0;
                this.shootAimed(state);
            },
            () => {
                this.fireHeld = false;
                try { state.mouse.isDown = false; } catch (e) {}
            });
        // E interact
        this._press(this._zone('touch-act'),
            () => { if (typeof Input !== 'undefined') Input.interact(state); });
        // R reload
        this._press(this._zone('touch-reload'),
            () => { if (typeof WeaponSystem !== 'undefined') WeaponSystem.reload(state); });
        // Weapon cycle
        this._press(this._zone('touch-weapon'),
            () => {
                try {
                    if (typeof GamepadControls !== 'undefined') GamepadControls._cycleWeapon(state, 1);
                    else if (typeof Player !== 'undefined') Player.selectWeapon(state, (state.player.activeSlot + 1) % 4);
                } catch (e) {}
            });
        // Menu
        this._press(this._zone('touch-menu'),
            () => { if (typeof Input !== 'undefined') Input.toggleMenu(state); });
    },

    // Aim at the nearest threat, then fire through the normal pipeline
    // (spread, ammo, recoil, MP sync all behave like a mouse shot).
    shootAimed(state) {
        try {
            if (!state.player || state.player.isDead) return;
            if (typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil) return;
            let tgt = null;
            try {
                if (typeof GamepadControls !== 'undefined') tgt = GamepadControls.autoAim(state, 750);
            } catch (e) {}
            if (tgt) {
                state.mouse.worldX = tgt.x;
                state.mouse.worldY = tgt.y;
                state.mouse._moved = true;
                const s = GamepadControls.worldToScreen(state, tgt.x, tgt.y);
                if (s) { state.mouse.x = s.x; state.mouse.y = s.y; }
            }
            state.mouse.isDown = true;
            if (typeof WeaponSystem !== 'undefined') WeaponSystem.shoot(state);
        } catch (e) {}
    },

    update(state, delta) {
        if (!this.active) return;
        if (!state.player || state.player.isDead || state.paused) {
            this.fireHeld = false;
            try {
                for (const k of Object.keys(this._padKeys)) {
                    if (this._padKeys[k]) {
                        state.keys[k] = false;
                        this._padKeys[k] = false;
                    }
                }
                state.mouse.isDown = false;
            } catch (e) {}
            return;
        }
        // Joystick -> movement keys (8-way, pad-owned so releases are clean)
        const dz = 0.3;
        const dirs = [
            ['w', this.joy.dy < -dz], ['s', this.joy.dy > dz],
            ['a', this.joy.dx < -dz], ['d', this.joy.dx > dz],
        ];
        for (const [k, down] of dirs) {
            if (down) {
                state.keys[k] = true;
                this._padKeys[k] = true;
            } else if (this._padKeys[k]) {
                state.keys[k] = false;
                this._padKeys[k] = false;
            }
        }
        // Held FIRE keeps semi-autos firing (autos already loop on isDown)
        if (this.fireHeld) {
            this.fireTimer -= delta;
            state.mouse.isDown = true;
            if (this.fireTimer <= 0) {
                this.fireTimer = 0.28;
                this.shootAimed(state);
            }
        }
    },
};

window.TouchControls = TouchControls;
