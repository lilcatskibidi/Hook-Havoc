const Camera = {
    update(state, delta) {
        const cam = state.camera;
        cam.x = Utils.smooth(cam.x, state.player.x, CONFIG.CAMERA_FOLLOW_SPEED, delta);
        cam.y = Utils.smooth(cam.y, state.player.y, CONFIG.CAMERA_FOLLOW_SPEED, delta);
        cam.zoom = Utils.smooth(cam.zoom, cam.targetZoom, CONFIG.CAMERA_ZOOM_SPEED, delta);

        if (state.keys['q']) cam.targetZoom = Math.max(CONFIG.CAMERA_ZOOM_MIN, cam.targetZoom - 1.5 * delta);
        if (state.keys['e']) cam.targetZoom = Math.min(CONFIG.CAMERA_ZOOM_MAX, cam.targetZoom + 1.5 * delta);

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
        const cam = state.camera;
        const mx = sx - ctx.canvas.width / 2;
        const my = sy - ctx.canvas.height / 2;
        return {
            x: cam.x + mx / cam.zoom,
            y: cam.y + my / cam.zoom
        };
    }
};