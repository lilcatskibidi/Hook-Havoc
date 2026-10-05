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
    _editMode: false,
    _layoutKey: 'ah_touch_layout_v1',

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

    // ---- UI tier: scale touch controls + hooks for CSS per phone size ----
    // xs: small phones (<=380px min-dim) · sm: phones · md: large phones /
    // small tablets · lg: tablets/desktop. CSS keys off body[data-uitier]
    // so one stylesheet covers Android fragmentation + iPhones + iPads.
    // Also re-applies the manual UI SIZE % (Settings) on top.
    applyUiTier() {
        try {
            let w = 0, h = 0;
            try {
                if (window.visualViewport && window.visualViewport.width > 2) {
                    w = window.visualViewport.width;
                    h = window.visualViewport.height;
                }
            } catch (e) {}
            if (!(w > 2)) w = window.innerWidth || 0;
            if (!(h > 2)) h = window.innerHeight || 0;
            const m = Math.min(w, h) || 800;
            const tier = m <= 380 ? 'xs' : m <= 640 ? 'sm' : m <= 1024 ? 'md' : 'lg';
            document.body.dataset.uitier = tier;
            document.body.dataset.orient = (h < w) ? 'land' : 'port';
            try { if (typeof Settings !== 'undefined' && Settings.applyUiScale) Settings.applyUiScale(); } catch (e) {}
            return tier;
        } catch (e) { return 'lg'; }
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
            // Edit-mode drag for every button + joystick.
            try {
                const ui = document.getElementById('touch-ui');
                if (ui) {
                    ui.querySelectorAll('[data-tbtn]').forEach(el => {
                        this._makeDraggable(el, el.getAttribute('data-tbtn'));
                    });
                    const joy = document.getElementById('touch-joy');
                    if (joy) this._makeDraggable(joy, '_joy');
                }
                const t = document.getElementById('touch-edit-toggle');
                if (t && !t._bound) {
                    t._bound = true;
                    t.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.setEditMode(!this._editMode);
                    });
                }
            } catch (e) {}
        }
        // UI tier always applies (CSS hooks), even on desktop
        try { this.applyUiTier(); } catch (e) {}
        if (!this._tierBound) {
            this._tierBound = true;
            window.addEventListener('resize', () => { try { this.applyUiTier(); } catch (e) {} });
            try {
                if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { try { this.applyUiTier(); } catch (e) {} });
            } catch (e) {}
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
        try { this.applyLayout(); } catch (e) {}
        // Show the ✥ move chip only on touch UI.
        try {
            const t = document.getElementById('touch-edit-toggle');
            if (t) t.classList.remove('hidden');
        } catch (e) {}
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

    // ---- Custom button layout (player-arranged, persisted) ----
    // Each draggable keeps {dx, dy} px offsets from its CSS home, plus a
    // global size scale. Edit mode is toggled from Settings or the ✥ chip.
    loadLayout() {
        try {
            const raw = localStorage.getItem(this._layoutKey);
            if (!raw) return { pos: {}, scale: 1 };
            const d = JSON.parse(raw);
            return { pos: (d && d.pos) || {}, scale: (d && d.scale) || 1 };
        } catch (e) { return { pos: {}, scale: 1 }; }
    },

    saveLayout() {
        try {
            const cur = this.loadLayout();
            localStorage.setItem(this._layoutKey, JSON.stringify(cur));
        } catch (e) {}
    },

    setScale(s) {
        try {
            s = Math.max(0.8, Math.min(1.6, Number(s) || 1));
            const cur = this.loadLayout();
            cur.scale = s;
            localStorage.setItem(this._layoutKey, JSON.stringify(cur));
            this.applyLayout();
        } catch (e) {}
    },

    resetLayout() {
        try { localStorage.removeItem(this._layoutKey); } catch (e) {}
        try { this.applyLayout(); } catch (e) {}
    },

    applyLayout() {
        try {
            const { pos, scale } = this.loadLayout();
            const ui = document.getElementById('touch-ui');
            if (ui) ui.style.setProperty('--touch-scale', String(scale || 1));
            // Per-button offsets (dragged in edit mode).
            const els = ui ? ui.querySelectorAll('[data-tbtn]') : [];
            els.forEach(el => {
                const k = el.getAttribute('data-tbtn');
                const o = pos && pos[k];
                if (o && (o.dx || o.dy)) {
                    el.style.transform = `translate(${o.dx}px, ${o.dy}px)`;
                    el.dataset._moved = '1';
                } else {
                    el.style.transform = '';
                    delete el.dataset._moved;
                }
            });
            // Joystick offset too.
            const joy = document.getElementById('touch-joy');
            if (joy) {
                const o = pos && pos._joy;
                joy.style.transform = (o && (o.dx || o.dy)) ? `translate(${o.dx}px, ${o.dy}px)` : '';
            }
        } catch (e) {}
    },

    setEditMode(on) {
        this._editMode = !!on;
        try {
            const ui = document.getElementById('touch-ui');
            if (ui) ui.classList.toggle('touch-edit', this._editMode);
            const t = document.getElementById('touch-edit-toggle');
            if (t) {
                t.innerText = this._editMode ? '✓' : '✥';
                t.title = this._editMode ? 'Done — tap to lock buttons' : 'Move buttons';
            }
            if (!this._editMode) this.saveLayout();
        } catch (e) {}
    },

    _makeDraggable(el, key) {
        if (!el || el._touchDragBound) return;
        el._touchDragBound = true;
        let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
        const getPos = () => {
            const cur = this.loadLayout();
            return (cur.pos && cur.pos[key]) || { dx: 0, dy: 0 };
        };
        el.addEventListener('touchstart', (e) => {
            if (!this._editMode) return;
            e.preventDefault(); e.stopPropagation();
            const t = e.changedTouches[0];
            const p = getPos();
            sx = t.clientX; sy = t.clientY; ox = p.dx || 0; oy = p.dy || 0;
            dragging = true;
        }, { passive: false });
        el.addEventListener('touchmove', (e) => {
            if (!this._editMode || !dragging) return;
            e.preventDefault(); e.stopPropagation();
            const t = e.changedTouches[0];
            const dx = Math.round(ox + (t.clientX - sx));
            const dy = Math.round(oy + (t.clientY - sy));
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            el._pendingPos = { dx, dy };
        }, { passive: false });
        const end = (e) => {
            if (!this._editMode || !dragging) return;
            dragging = false;
            try {
                if (el._pendingPos) {
                    const cur = this.loadLayout();
                    cur.pos = cur.pos || {};
                    cur.pos[key] = el._pendingPos;
                    localStorage.setItem(this._layoutKey, JSON.stringify(cur));
                    delete el._pendingPos;
                }
            } catch (err) {}
        };
        el.addEventListener('touchend', end);
        el.addEventListener('touchcancel', end);
        // Mouse fallback for desktop testing of edit mode.
        el.addEventListener('mousedown', (e) => {
            if (!this._editMode) return;
            e.preventDefault(); e.stopPropagation();
            const p = getPos();
            sx = e.clientX; sy = e.clientY; ox = p.dx || 0; oy = p.dy || 0;
            dragging = true;
            const mv = (ev) => {
                if (!dragging) return;
                const dx = Math.round(ox + (ev.clientX - sx));
                const dy = Math.round(oy + (ev.clientY - sy));
                el.style.transform = `translate(${dx}px, ${dy}px)`;
                el._pendingPos = { dx, dy };
            };
            const up = () => {
                dragging = false;
                window.removeEventListener('mousemove', mv);
                window.removeEventListener('mouseup', up);
                end();
            };
            window.addEventListener('mousemove', mv);
            window.addEventListener('mouseup', up);
        });
    },

    _bindJoystick(state) {
        const zone = this._zone('touch-joy');
        const knob = this._zone('touch-joy-knob');
        if (!zone) return;
        const R = 62; // px travel (bigger thumb zone)
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
            if (this._editMode) return; // edit mode: drag handler owns it
            e.preventDefault();
            try { if (typeof audio !== 'undefined' && audio.init) audio.init(); } catch (err) {}
            const t = e.changedTouches[0];
            this.joy.id = t.identifier;
            handle(t);
        }, { passive: false });
        zone.addEventListener('touchmove', (e) => {
            if (this._editMode) return;
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
        const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
        el.addEventListener('touchstart', (e) => {
            // Edit mode: drag instead of pressing.
            if (this._editMode) return;
            e.preventDefault();
            try { if (typeof audio !== 'undefined' && audio.init) audio.init(); } catch (err) {}
            try { el.classList.add('active-touch'); } catch (err) {}
            buzz(8);
            try { down(); } catch (err) {}
        }, { passive: false });
        const release = (e) => {
            if (this._editMode) return;
            if (e) e.preventDefault();
            try { el.classList.remove('active-touch'); } catch (err) {}
            try { if (up) up(); } catch (err) {}
        };
        el.addEventListener('touchend', release);
        el.addEventListener('touchcancel', release);
        el.addEventListener('contextmenu', (e) => { try { e.preventDefault(); } catch (err) {} });
        // Mouse fallback (desktop testing / hybrid laptops)
        el.addEventListener('mousedown', (e) => { if (this._editMode) return; e.preventDefault(); try { el.classList.add('active-touch'); } catch (err) {} try { down(); } catch (err) {} });
        el.addEventListener('mouseup', () => { try { el.classList.remove('active-touch'); } catch (err) {} try { if (up) up(); } catch (err) {} });
        // Bulletproof: pointer slides off the button (mouseup lands outside)
        // must still release — otherwise FIRE/CAST sticks and the game plays
        // itself. up() is idempotent, so a double release is harmless.
        el.addEventListener('mouseleave', () => {
            try { el.classList.remove('active-touch'); } catch (err) {}
            try { if (!this._editMode && up) up(); } catch (err) {}
        });
    },

    _bindButtons(state) {
        // CAST = SPACE (cast / reel / pull bobber back). The virtual SPACE
        // key MUST mirror the press: hooked-fish reeling reads
        // state.keys[' '] every frame (keyboard holds it natively; touch
        // and gamepad must set it or mobile can never reel).
        this._press(this._zone('touch-cast'),
            () => { try { state.keys[' '] = true; } catch (e) {} if (typeof Fishing !== 'undefined') Fishing.onSpaceDown(state); },
            () => { if (typeof Fishing !== 'undefined') Fishing.onSpaceUp(state); try { state.keys[' '] = false; } catch (e) {} });
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
        // E interact (items are used via the F key / item-bar slot tap)
        this._press(this._zone('touch-act'),
            () => { if (typeof Input !== 'undefined') Input.interact(state); });
        // R reload (manual — auto-reload also runs in update())
        this._press(this._zone('touch-reload'),
            () => { if (typeof WeaponSystem !== 'undefined') WeaponSystem.reload(state); });
        // Backpack (B on keyboard) — the full-bucket fix tool on mobile
        this._press(this._zone('touch-bag'),
            () => { try { if (typeof Inventory !== 'undefined') Inventory.toggle(state); } catch (e) {} });
        // F use equipped item
        this._press(this._zone('touch-item'),
            () => {
                try {
                    if (typeof ItemSystem !== 'undefined' && ItemSystem.useEquipped) ItemSystem.useEquipped(state);
                    else if (typeof Items !== 'undefined' && Items.useEquipped) Items.useEquipped(state);
                } catch (e) {}
            });
        // Weapon cycle
        this._press(this._zone('touch-weapon'),
            () => {
                try {
                    if (typeof GamepadControls !== 'undefined') GamepadControls._cycleWeapon(state, 1);
                    else if (typeof Player !== 'undefined') Player.selectWeapon(state, (state.player.activeSlot + 1) % 4);
                } catch (e) {}
            });
        // Dash (Q on keyboard)
        this._press(this._zone('touch-dash'),
            () => { try { if (typeof Player !== 'undefined') Player.tryDash(state); } catch (e) {} });
        // Camera zoom (Z/X on keyboard, wheel on desktop)
        const zoomBy = (d) => {
            try {
                if (typeof CONFIG === 'undefined' || !state.camera) return;
                state.camera.targetZoom = Utils.clamp(
                    (state.camera.targetZoom || 1) + d,
                    CONFIG.CAMERA_ZOOM_MIN, CONFIG.CAMERA_ZOOM_MAX);
                const zl = document.getElementById('zoom-level');
                if (zl) zl.innerText = (state.camera.targetZoom || 1).toFixed(1) + 'x';
            } catch (e) {}
        };
        this._press(this._zone('touch-zoom-in'), () => zoomBy(0.25));
        this._press(this._zone('touch-zoom-out'), () => zoomBy(-0.25));
    },

    // CAST button mirrors the rod state: IDLE=CAST · charging=THROW ·
    // waiting/hooked=REEL. Updated once per frame (cheap string guard).
    _castLabel: '',
    syncCastLabel(state) {
        try {
            const el = this._zone('touch-cast');
            if (!el) return;
            const mode = (state && state.fishing && state.fishing.mode) || 'IDLE';
            let key = 'touch_cast', txt = 'CAST';
            try {
                if (typeof T === 'function') {
                    if (mode === 'CASTING') key = 'touch_release';
                    else if (mode === 'WAITING_BITES' || mode === 'HOOKED' || mode === 'CAST_FLY') key = 'touch_reel';
                    txt = T(key);
                } else {
                    txt = mode === 'CASTING' ? 'THROW' : (mode === 'IDLE' ? 'CAST' : 'REEL');
                }
            } catch (e) {
                txt = mode === 'CASTING' ? 'THROW' : (mode === 'IDLE' ? 'CAST' : 'REEL');
            }
            if (txt !== this._castLabel || el.textContent !== txt) {
                this._castLabel = txt;
                el.textContent = txt;
                // Reel state glows amber so thumbs know "hold to reel".
                try {
                    el.classList.toggle('is-reel',
                        mode === 'WAITING_BITES' || mode === 'HOOKED' || mode === 'CAST_FLY');
                } catch (e) {}
            }
        } catch (e) {}
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
        try { this.syncCastLabel(state); } catch (e) {}
        if (!state.player || state.player.isDead || state.paused) {
            this.fireHeld = false;
            try {
                for (const k of Object.keys(this._padKeys)) {
                    if (this._padKeys[k]) {
                        state.keys[k] = false;
                        this._padKeys[k] = false;
                    }
                }
                // Virtual SPACE from the CAST button must never stick
                state.keys[' '] = false;
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
        // AUTO RELOAD on mobile: empty mag (non-pistol, non-reloading,
        // affordable/owned ammo) reloads itself — no tiny R hunt mid-fight.
        try {
            if (typeof WeaponSystem !== 'undefined' && WeaponSystem.getActiveWeapon) {
                const w = WeaponSystem.getActiveWeapon(state);
                if (w && w.id !== 'pistol' && !state.player.reloading) {
                    const max = (typeof CONFIG !== 'undefined' && CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id]) || Infinity;
                    const cur = state.player.weaponAmmo ? state.player.weaponAmmo[w.id] : undefined;
                    if (max !== Infinity && cur !== undefined && cur <= 0) {
                        WeaponSystem.reload(state);
                    }
                }
            }
        } catch (e) {}
    },
};

window.TouchControls = TouchControls;
