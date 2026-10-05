const Input = {
    // Minecraft-style rebinds (Settings > Controls). Movement stays on
    // WASD/arrows; everything else reads these e.code bindings.
    DEFAULT_BINDS: {
        dash: 'KeyQ', interact: 'KeyE', useItem: 'KeyF', cast: 'Space',
        reload: 'KeyR', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3',
        slot4: 'Digit4', index: 'KeyJ', inventory: 'KeyB',
    },
    BIND_LABELS: {
        dash: 'Dash', interact: 'Interact', useItem: 'Use Item',
        cast: 'Cast / Reel', reload: 'Reload', slot1: 'Weapon 1',
        slot2: 'Weapon 2', slot3: 'Weapon 3', slot4: 'Weapon 4',
        index: 'Fish Index', inventory: 'Backpack',
    },

    binds() {
        try {
            const saved = (typeof Settings !== 'undefined' && Settings.data && Settings.data.binds) || {};
            return Object.assign({}, this.DEFAULT_BINDS, saved);
        } catch (e) {
            return Object.assign({}, this.DEFAULT_BINDS);
        }
    },

    match(e, action) {
        try {
            const b = this.binds();
            return !!e && e.code === b[action];
        } catch (err) { return false; }
    },

    // Friendly key cap label: KeyQ→Q, Digit1→1, Space→SPACE, ArrowUp→↑…
    keyName(code) {
        try {
            if (!code) return '—';
            if (code.indexOf('Key') === 0) return code.slice(3);
            if (code.indexOf('Digit') === 0) return code.slice(5);
            const map = {
                Space: 'SPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
                ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL',
                AltLeft: 'L-ALT', Tab: 'TAB', CapsLock: 'CAPS', Escape: 'ESC',
            };
            return map[code] || code;
        } catch (e) { return String(code); }
    },

    init(state, canvas) {
        // Bulletproof: booting twice (hot-reload, re-init) must not stack
        // duplicate key handlers that double-fire every action.
        if (this._bound) return;
        this._bound = true;
        window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
    // Corpses don't act — respawn first (death menu has the buttons)
    if (state.player && state.player.isDead) return;
    if (this.match(e, 'slot1')) Player.selectWeapon(state, 0);
    if (this.match(e, 'slot2')) Player.selectWeapon(state, 1);
    if (this.match(e, 'slot3')) Player.selectWeapon(state, 2);
    if (this.match(e, 'slot4')) Player.selectWeapon(state, 3);
    // Dash (default Q): i-frame dodge.
    if (this.match(e, 'dash') && !e.repeat) {
        try { if (typeof Player !== 'undefined') Player.tryDash(state); } catch (err) {}
    }
    if (this.match(e, 'reload')) WeaponSystem.reload(state);
    if (this.match(e, 'index')) {
        if (typeof FishIndex !== 'undefined' && !state.paused) FishIndex.toggleInGame();
    }
    if (this.match(e, 'inventory')) {
        if (typeof Inventory !== 'undefined' && !state.paused) Inventory.toggle(state);
    }
    // Cast mirrors the virtual SPACE key (reeling reads keys[' '] every
    // frame, like the touch/gamepad buttons) so rebinding keeps working.
    if (this.match(e, 'cast') || e.code === 'Space') {
        e.preventDefault();
        try { state.keys[' '] = true; } catch (err) {}
        if (this.match(e, 'cast') && !e.repeat) Fishing.onSpaceDown(state);
    }
    if (this.match(e, 'interact') && !e.repeat) {
        Input.interact(state);
    }
    // Use the equipped consumable (see Items tab in the shop).
    if (this.match(e, 'useItem') && !e.repeat) {
        try { if (typeof ItemSystem !== 'undefined') ItemSystem.useEquipped(state); } catch (err) {}
    }
    // F3 perf overlay (diagnostic): works even while dead/paused.
    if (e.key === 'F3') {
        try { e.preventDefault(); } catch (err) {}
        try { if (typeof PerfOverlay !== 'undefined') PerfOverlay.toggle(); } catch (err) {}
    }
});

        window.addEventListener('keyup', (e) => {
            state.keys[e.key.toLowerCase()] = false;
            if (this.match(e, 'cast') || e.code === 'Space') {
                try { state.keys[' '] = false; } catch (err) {}
                Fishing.onSpaceUp(state);
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const s = Input.uiScale();
            state.mouse.x = (e.clientX - rect.left) * s;
            state.mouse.y = (e.clientY - rect.top) * s;
            const w = Camera.screenToWorld(state, state.mouse.x, state.mouse.y);
            state.mouse.worldX = w.x;
            state.mouse.worldY = w.y;
            state.mouse._moved = true; // aim input exists (fresh page falls back to facing)
        });

        // FIX #4b: audio.init guarded so a throw doesn't abort the click
        canvas.addEventListener('mousedown', (e) => {
            if (typeof audio !== 'undefined' && audio.init) audio.init();
            if (state.player && state.player.isDead) return;
            // No shooting during the boss-fight countdown.
            if (typeof state._fightFreezeUntil === 'number' && state.time < state._fightFreezeUntil) return;
            state.mouse.isDown = true;
            WeaponSystem.shoot(state);
        });

        canvas.addEventListener('mouseup', () => { state.mouse.isDown = false; });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            state.camera.targetZoom = Utils.clamp(
                state.camera.targetZoom - e.deltaY * 0.001,
                CONFIG.CAMERA_ZOOM_MIN,
                CONFIG.CAMERA_ZOOM_MAX
            );
        }, { passive: false });
    },

    updateMouseWorld(state) {
        const w = Camera.screenToWorld(state, state.mouse.x, state.mouse.y);
        state.mouse.worldX = w.x;
        state.mouse.worldY = w.y;
    },

    // Backing-store scale (canvas.width / CSS width). Mouse and touch
    // coordinates arrive in CSS pixels and must be scaled to backing
    // pixels — the space Camera.screenToWorld / worldToScreen use.
    uiScale() {
        try {
            const c = document.getElementById('gameCanvas');
            if (c) {
                const r = c.getBoundingClientRect();
                if (r && r.width > 2 && c.width > 2) return c.width / r.width;
            }
        } catch (e) {}
        try {
            if (typeof TouchControls !== 'undefined') return TouchControls.renderScale() || 1;
        } catch (e) {}
        return 1;
    },

    // Shared interact action (E key, gamepad B, touch E button).
    // Returns true when something acted (used by the E-fallback: no
    // interaction nearby → consume the equipped item instead).
    interact(state) {
        if (!state.player || state.player.isDead || state.paused) return false;
        // Hands on the gunwale mid-voyage: no E interactions while sailing.
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.boatRiding && WorldSystem.boatRiding(state)) return false;
        } catch (err) {}
        // Radar board by the spawn umbrella (mainland beach only).
        if (typeof FishRadar !== 'undefined' && FishRadar.near) {
            try {
                if (!state.paused && FishRadar.near(state)) { FishRadar.open(state); return true; }
            } catch (err) {}
        }
        // 1.1.5 WORLD: island dock exit first, then the ferryman's boat.
        if (typeof WorldSystem !== 'undefined') {
            try {
                if (state.player.onIsland && WorldSystem.nearIslandExit(state) < 120) {
                    WorldSystem.sailBack(state);
                    return true;
                }
                if (WorldSystem.isBoatMenuOpen && WorldSystem.isBoatMenuOpen()) {
                    WorldSystem.closeBoatMenu();
                    return true;
                }
                if (!state.player.onIsland && !state.player.inCave && WorldSystem.nearBoat(state) < 130) {
                    WorldSystem.openBoatMenu(state);
                    return true;
                }
            } catch (err) {}
        }
        // Cave door first: exit marker (inside) / hole (beach)
        if (typeof Ritual !== 'undefined') {
            try {
                // Void shrine first (own map inside the cave flag).
                if (!state.paused && state.player.inVoidTemple && Ritual.nearTempleExit(state) < 110) {
                    Ritual.exitVoidTemple(state);
                    return true;
                }
                if (!state.paused && state.player.inVoidTemple) {
                    if (Ritual.nearVoidBook && Ritual.nearVoidBook(state) < 110) {
                        Ritual.readVoidBook(state);
                        return true;
                    }
                    const hit = Ritual.nearTemplePillar(state);
                    if (hit && hit.i >= 0 && hit.d < (hit.pillar.r + 70)) {
                        Ritual.offerAtPillar(state);
                        return true;
                    }
                }
                if (!state.paused && Ritual.nearVoidGate && Ritual.nearVoidGate(state) < 150) {
                    Ritual.enterVoidTemple(state);
                    return true;
                }
                if (!state.paused && state.player.inCave && Ritual.nearExit(state) < 110) {
                    Ritual.exit(state);
                    return true;
                }
                if (!state.paused && !state.player.inCave && Ritual.nearHole(state) < 110) {
                    Ritual.enter(state);
                    return true;
                }
            } catch (err) {}
        }
        // Kneeling priest finisher FIRST — rip the heart before shopping.
        try {
            if (!state.paused && typeof Ritual !== 'undefined' && Ritual.nearKneelingPriest) {
                if (Ritual.nearKneelingPriest(state)) {
                    Ritual.startHeartRip(state);
                    return true;
                }
            }
        } catch (err) {}
        // Old Marlin first — quests beat shopping
        if (typeof NPC !== 'undefined' && NPC.near) {
            try {
                if (!state.paused && NPC.near(state) < (NPC.RADIUS || 115)) {
                    NPC.open(state);
                    return true;
                }
            } catch (err) {}
        }
        // Boss ritual pad — summoning circle
        if (typeof Ritual !== 'undefined' && Ritual.near) {
            try {
                if (!state.paused && Ritual.near(state) < (Ritual.RADIUS || 110)) {
                    Ritual.open(state);
                    return true;
                }
            } catch (err) {}
        }
        // World SHOP / CASINO pads: SHOP pad opens the main shop
        // (Beach Shop tab was removed), CASINO pad opens the casino.
        if (typeof Render !== 'undefined' && Render.nearestShopZone) {
            const near = Render.nearestShopZone(state);
            if (near && near.dist < near.zone.radius + 30) {
                if (near.zone.id === 'casino') {
                    if (typeof Casino !== 'undefined') Casino.open();
                } else {
                    if (typeof Shop !== 'undefined') Shop.openShop(state, 'sell');
                }
                return true;
            }
        }
        return false;
    },

    // Shared menu toggle (ESC key, gamepad Start, touch menu button).
    // Mirrors the ESC handler in MainMenu.init.
    toggleMenu(state) {
        // Intro finishes on ESC (same as Begin/Skip)
        if (typeof Intro !== 'undefined' && Intro.isOpen && Intro.isOpen()) {
            Intro.finish();
            return;
        }
        // The dead don't get menus — respawn first
        if (typeof state !== 'undefined' && state.player && state.player.isDead) return;
        const byId = (id) => document.getElementById(id);
        if (typeof WorldSystem !== 'undefined' && WorldSystem.isBoatMenuOpen && WorldSystem.isBoatMenuOpen()) {
            WorldSystem.closeBoatMenu();
            return;
        }
        const shop = byId('shop-modal');
        if (shop && !shop.classList.contains('hidden')) {
            shop.classList.add('hidden');
            return;
        }
        const indexModal = byId('index-modal');
        if (indexModal && !indexModal.classList.contains('hidden')) {
            indexModal.classList.add('hidden');
            return;
        }
        const invModal = byId('inventory-modal');
        if (invModal && !invModal.classList.contains('hidden')) {
            invModal.classList.add('hidden');
            return;
        }
        const casinoModal = byId('casino-modal');
        if (casinoModal && !casinoModal.classList.contains('hidden')) {
            casinoModal.classList.add('hidden');
            return;
        }
        if (typeof NPC !== 'undefined' && NPC.isOpen && NPC.isOpen()) {
            NPC.close();
            return;
        }
        if (typeof Ritual !== 'undefined' && Ritual.isOpen && Ritual.isOpen()) {
            Ritual.close();
            return;
        }
        const menu = byId('main-menu');
        if (menu && !menu.classList.contains('hidden')) {
            if (typeof MainMenu !== 'undefined') MainMenu.hide();
        } else {
            if (typeof MainMenu !== 'undefined') MainMenu.show();
        }
    },
};