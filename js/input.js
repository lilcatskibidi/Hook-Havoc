const Input = {
    init(state, canvas) {
        window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
    if (e.key === '1') Player.selectWeapon(state, 0);
    if (e.key === '2') Player.selectWeapon(state, 1);
    if (e.key === '3') Player.selectWeapon(state, 2);
    if (e.key === '4') Player.selectWeapon(state, 3);
    if (e.key.toLowerCase() === 'r') WeaponSystem.reload(state);
    if (e.code === 'Space') { e.preventDefault(); Fishing.onSpaceDown(state); }
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