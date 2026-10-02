const Input = {
    init(state, canvas) {
        window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
    // Corpses don't act — respawn first (death menu has the buttons)
    if (state.player && state.player.isDead) return;
    if (e.key === '1') Player.selectWeapon(state, 0);
    if (e.key === '2') Player.selectWeapon(state, 1);
    if (e.key === '3') Player.selectWeapon(state, 2);
    if (e.key === '4') Player.selectWeapon(state, 3);
    if (e.key.toLowerCase() === 'r') WeaponSystem.reload(state);
    if (e.key.toLowerCase() === 'j') {
        if (typeof FishIndex !== 'undefined' && !state.paused) FishIndex.toggleInGame();
    }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) Fishing.onSpaceDown(state); }
    if (e.key.toLowerCase() === 'e') {
        // Cave door first: exit marker (inside) / hole (beach)
        if (typeof Ritual !== 'undefined') {
            try {
                if (!state.paused && state.player.inCave && Ritual.nearExit(state) < 110) {
                    Ritual.exit(state);
                    return;
                }
                if (!state.paused && !state.player.inCave && Ritual.nearHole(state) < 110) {
                    Ritual.enter(state);
                    return;
                }
            } catch (err) {}
        }
        // Old Marlin first — quests beat shopping
        if (typeof NPC !== 'undefined' && NPC.near) {
            try {
                if (!state.paused && NPC.near(state) < (NPC.RADIUS || 115)) {
                    NPC.open(state);
                    return;
                }
            } catch (err) {}
        }
        // Boss ritual pad — summoning circle
        if (typeof Ritual !== 'undefined' && Ritual.near) {
            try {
                if (!state.paused && Ritual.near(state) < (Ritual.RADIUS || 110)) {
                    Ritual.open(state);
                    return;
                }
            } catch (err) {}
        }
        // World SHOP / CASINO pads only — no more opening shops from
        // anywhere near the sea. SHOP pad = beach shop (same shop).
        if (typeof Render !== 'undefined' && Render.nearestShopZone) {
            const near = Render.nearestShopZone(state);
            if (near && near.dist < near.zone.radius + 30) {
                if (near.zone.id === 'casino') {
                    if (typeof Casino !== 'undefined') Casino.open();
                } else {
                    if (typeof Shop !== 'undefined') Shop.openBeach(state);
                }
            }
        }
    }
});

        window.addEventListener('keyup', (e) => {
            state.keys[e.key.toLowerCase()] = false;
            if (e.code === 'Space') Fishing.onSpaceUp(state);
        });

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            state.mouse.x = e.clientX - rect.left;
            state.mouse.y = e.clientY - rect.top;
            const w = Camera.screenToWorld(state, state.mouse.x, state.mouse.y);
            state.mouse.worldX = w.x;
            state.mouse.worldY = w.y;
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
    }
};