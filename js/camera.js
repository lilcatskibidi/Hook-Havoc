const Camera = {
    update(state, delta) {
        const cam = state.camera;
        // Boss-intro lock: hold the shot on the boss (tracks it live,
        // releases when the timer ends or the boss dies mid-intro).
        try {
            const ic = state._introCam;
            if (ic && ic.t > 0) {
                ic.t -= delta;
                if (ic.boss && typeof ic.boss.x === 'number' && typeof ic.boss.y === 'number') {
                    ic.x = ic.boss.x;
                    ic.y = ic.boss.y;
                    if (typeof ic.boss.hp === 'number' && ic.boss.hp <= 0) ic.t = 0;
                }
                if (ic.t > 0) {
                    const k = Math.min(1, delta * 3);
                    cam.x += (ic.x - cam.x) * k;
                    cam.y += (ic.y - cam.y) * k;
                    cam.zoom = Utils.smooth(cam.zoom, cam.targetZoom, CONFIG.CAMERA_ZOOM_SPEED, delta);
                    return;
                }
            }
        } catch (e) {}
        cam.x = Utils.smooth(cam.x, state.player.x, CONFIG.CAMERA_FOLLOW_SPEED, delta);
        cam.y = Utils.smooth(cam.y, state.player.y, CONFIG.CAMERA_FOLLOW_SPEED, delta);
        cam.zoom = Utils.smooth(cam.zoom, cam.targetZoom, CONFIG.CAMERA_ZOOM_SPEED, delta);

        if (state.keys['z']) cam.targetZoom = Math.min(CONFIG.CAMERA_ZOOM_MAX, cam.targetZoom + 1.5 * delta);
        // NOTE: Q is dash now (see Player.tryDash) — zoom-out lives on X.
        if (state.keys['x']) cam.targetZoom = Math.max(CONFIG.CAMERA_ZOOM_MIN, cam.targetZoom - 1.5 * delta);

        if (state.screenShake > 0) {
            state.screenShake *= Math.pow(0.85, delta * 60);
            if (state.screenShake < 0.2) state.screenShake = 0;
        }
    },

    apply(state, ctx) {
        const cam = state.camera;
        const shake = state.screenShake;
        const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;

        ctx.translate(ctx.canvas.width / 2 + sx, ctx.canvas.height / 2 + sy);
        ctx.scale(cam.zoom, cam.zoom);
        ctx.translate(-cam.x, -cam.y);
    },

    screenToWorld(state, sx, sy) {
        // Backing-pixel space — matches Camera.apply (translate by
        // canvas.width/2 then scale by zoom). Callers must pass backing
        // pixels (see Input.uiScale); worldToScreen is the exact inverse.
        const cam = state.camera;
        const bw = (state && state.canvasWidth) || 1;
        const bh = (state && state.canvasHeight) || 1;
        const mx = sx - bw / 2;
        const my = sy - bh / 2;
        return {
            x: cam.x + mx / cam.zoom,
            y: cam.y + my / cam.zoom
        };
    },

    worldToScreen(state, wx, wy) {
        const cam = state.camera;
        const bw = (state && state.canvasWidth) || 1;
        const bh = (state && state.canvasHeight) || 1;
        return {
            x: (wx - cam.x) * cam.zoom + bw / 2,
            y: (wy - cam.y) * cam.zoom + bh / 2
        };
    }
};