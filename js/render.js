// ============================================================
//  GUN SKIN LOADER — custom PNG art per weapon from assets/guns/
//  Drop `<weapon-id>.png` (e.g. `railgun.png`) in that folder and any
//  owned gun of that type can wear it. Art must face RIGHT (muzzle +x)
//  on a transparent background, any size/aspect — it is fitted into the
//  gun's footprint without stretching pixels.
//  Per-weapon override: `skin: 'shared-name'` reuses one file,
//  `skin: false` forces the procedural model.
// ============================================================
const GunSkinLoader = {
    cache: new Map(),
    loading: new Map(),
    failed: new Set(),
    available: {},
    shipped: new Set(), // ids that came from assets/guns/*.png (neutral,
    // shared by everyone — as opposed to per-PC uploads in localStorage)
    onReady: null, // Shop hooks this to refresh the skin buttons

    load(id) {
        if (this.cache.has(id)) return this.cache.get(id);
        if (this.failed.has(id)) return Promise.resolve(null);
        if (this.loading.has(id)) return this.loading.get(id);
        const promise = new Promise((resolve) => {
            const img = new Image();
            img.src = `assets/guns/${id}.png`;
            img.onload = () => {
                this.cache.set(id, img);
                this.shipped.add(id);
                this.loading.delete(id);
                this.available[id] = true;
                try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
                resolve(img);
            };
            img.onerror = () => {
                this.loading.delete(id);
                this.failed.add(id); // probe once per session — no log spam
                resolve(null); // no file -> procedural model
            };
        });
        this.loading.set(id, promise);
        return promise;
    },

    get(id) {
        return this.cache.get(id) || null;
    },

    has(id) {
        return !!this.available[id];
    },

    // Player uploads (local only — each PC uses its own files).
    // Downscaled to <=256px so a skin survives localStorage quotas.
    storageKey(id) {
        return 'ah_gunskin_' + id;
    },

    // Neutral shipped art only (never a per-PC upload): safe to show on
    // FOREIGN bodies in a room — it looks identical for everyone.
    getShipped(id) {
        try {
            if (!this.shipped.has(id)) return null;
            return this.cache.get(id) || null;
        } catch (e) { return null; }
    },

    saveUpload(id, file) {
        return new Promise((resolve, reject) => {
            try {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    try {
                        const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
                        const cw = Math.max(1, Math.round(img.naturalWidth * k));
                        const ch = Math.max(1, Math.round(img.naturalHeight * k));
                        const cv = document.createElement('canvas');
                        cv.width = cw; cv.height = ch;
                        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
                        const dataUrl = cv.toDataURL('image/png');
                        URL.revokeObjectURL(url);
                        const done = new Image();
                        done.onload = () => {
                            this.cache.set(id, done);
                            this.available[id] = true;
                            try { localStorage.setItem(this.storageKey(id), dataUrl); } catch (se) {
                                reject(new Error('STORAGE FULL — skin kept for this session only'));
                                try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
                                resolve({ sessionOnly: true });
                                return;
                            }
                            try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
                            resolve({ sessionOnly: false });
                        };
                        done.onerror = () => reject(new Error('BAD IMAGE'));
                        done.src = dataUrl;
                    } catch (e) { reject(e); }
                };
                img.onerror = () => reject(new Error('BAD IMAGE'));
                img.src = url;
            } catch (e) { reject(e); }
        });
    },

    clearUpload(id) {
        try { localStorage.removeItem(this.storageKey(id)); } catch (e) {}
        // Drop the uploaded bitmap; a shipped assets/guns file (if any)
        // will be picked back up by preload below.
        this.cache.delete(id);
        this.available[id] = false;
        try { this.load(id); } catch (e) {}
    },

    restoreUploads(ids) {
        (ids || []).forEach(id => {
            let raw = null;
            try { raw = localStorage.getItem(this.storageKey(id)); } catch (e) {}
            if (!raw) return;
            const img = new Image();
            img.onload = () => {
                this.cache.set(id, img);
                this.available[id] = true;
                try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
            };
            img.onerror = () => { try { localStorage.removeItem(this.storageKey(id)); } catch (e) {} };
            img.src = raw;
        });
    },

    preload(ids) {
        (ids || []).forEach(id => {
            try { this.load(id); } catch (e) {}
        });
    }
};

window.GunSkinLoader = GunSkinLoader;

// ============================================================
//  BOBBER LOADER — custom PNG art per bobber model from
//  assets/bobbers/<model>.png (classic/slim/bulb/glow/feather/rocket).
//  Same rules as gun skins: any size, fitted without stretching,
//  plus per-file player uploads (localStorage ah_bobber_<model>).
// ============================================================
const BobberLoader = {
    cache: new Map(),
    loading: new Map(),
    failed: new Set(),
    available: {},
    onReady: null,

    load(id) {
        if (this.cache.has(id)) return this.cache.get(id);
        if (this.failed.has(id)) return Promise.resolve(null);
        if (this.loading.has(id)) return this.loading.get(id);
        const promise = new Promise((resolve) => {
            const img = new Image();
            img.src = `assets/bobbers/${id}.png`;
            img.onload = () => {
                this.cache.set(id, img);
                this.loading.delete(id);
                this.available[id] = true;
                try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
                resolve(img);
            };
            img.onerror = () => {
                this.loading.delete(id);
                this.failed.add(id); // probe once per session — no log spam
                resolve(null);
            };
        });
        this.loading.set(id, promise);
        return promise;
    },

    get(id) {
        return this.cache.get(id) || null;
    },

    has(id) {
        return !!this.available[id];
    },

    storageKey(id) {
        return 'ah_bobber_' + id;
    },

    saveUpload(id, file) {
        return new Promise((resolve, reject) => {
            try {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    try {
                        const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
                        const cw = Math.max(1, Math.round(img.naturalWidth * k));
                        const ch = Math.max(1, Math.round(img.naturalHeight * k));
                        const cv = document.createElement('canvas');
                        cv.width = cw; cv.height = ch;
                        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
                        const dataUrl = cv.toDataURL('image/png');
                        URL.revokeObjectURL(url);
                        const done = new Image();
                        done.onload = () => {
                            this.cache.set(id, done);
                            this.available[id] = true;
                            try { localStorage.setItem(this.storageKey(id), dataUrl); } catch (se) {
                                try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
                                resolve({ sessionOnly: true });
                                return;
                            }
                            try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
                            resolve({ sessionOnly: false });
                        };
                        done.onerror = () => reject(new Error('BAD IMAGE'));
                        done.src = dataUrl;
                    } catch (e) { reject(e); }
                };
                img.onerror = () => reject(new Error('BAD IMAGE'));
                img.src = url;
            } catch (e) { reject(e); }
        });
    },

    clearUpload(id) {
        try { localStorage.removeItem(this.storageKey(id)); } catch (e) {}
        this.cache.delete(id);
        this.available[id] = false;
        try { this.load(id); } catch (e) {}
    },

    restoreUploads(ids) {
        (ids || []).forEach(id => {
            let raw = null;
            try { raw = localStorage.getItem(this.storageKey(id)); } catch (e) {}
            if (!raw) return;
            const img = new Image();
            img.onload = () => {
                this.cache.set(id, img);
                this.available[id] = true;
                try { if (typeof this.onReady === 'function') this.onReady(id); } catch (e) {}
            };
            img.onerror = () => { try { localStorage.removeItem(this.storageKey(id)); } catch (e) {} };
            img.src = raw;
        });
    },

    preload(ids) {
        (ids || []).forEach(id => {
            try { this.load(id); } catch (e) {}
        });
    }
};

window.BobberLoader = BobberLoader;

const Render = {
    // Visible world rect (with margin) — culls the heavy decor loops
    // so they cost the same on a 4K screen as on a phone.
    _view(state, ctx, margin = 120) {
        const cam = state.camera;
        const w = ctx.canvas.width / cam.zoom / 2 + margin;
        const h = ctx.canvas.height / cam.zoom / 2 + margin;
        return { x0: cam.x - w, x1: cam.x + w, y0: cam.y - h, y1: cam.y + h };
    },

    // Decor density scale: keeps screen-space density constant so zooming
    // out doesn't multiply grain/ripple/arc counts (the far-zoom stutter
    // and moire bug). 1x at zoom >= 1, up to 4x steps when zoomed far out.
    _ds(state) {
        try {
            const z = (state.camera && state.camera.zoom) || 1;
            return Utils.clamp(1 / Math.max(0.25, z), 1, 4);
        } catch (e) { return 1; }
    },

    // Decor fade: high-frequency detail (sand grain, water arcs, foam
    // bubbles) aliases into crawling shimmer when zoomed far out, so it
    // fades away below 1x zoom instead of sparkling. Full detail >= 1.0.
    _fade(state) {
        try {
            const z = (state.camera && state.camera.zoom) || 1;
            return Utils.clamp((z - 0.55) / 0.45, 0, 1);
        } catch (e) { return 1; }
    },

    // World-snapped loop start: decor lattices must be anchored to the
    // WORLD grid, never to the view edge — otherwise the whole lattice
    // slides with the camera (decor "follows" the player, then snaps back).
    // NOTE: no min-clamp here on purpose — clamping re-breaks congruence
    // at the world edge. Cull out-of-world points per-iteration instead.
    _snapStart(viewStart, margin, step) {
        return Math.floor((viewStart - margin) / step) * step;
    },

    // Adaptive quality: sustained slow frames -> halve decor work
    _adapt(state, delta) {
        state._ft = (state._ft || 0) * 0.95 + delta * 1000 * 0.05;
        if (!state._lowFx && state._ft > 26) state._lowFx = true;
        else if (state._lowFx && state._ft < 17) state._lowFx = false;
    },

    drawWorld(state, ctx) {
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Frame-time tracking for adaptive quality
        try {
            const now = performance.now();
            if (state._lastFrame) this._adapt(state, (now - state._lastFrame) / 1000);
            state._lastFrame = now;
        } catch (e) {}

        ctx.save();
        Camera.apply(state, ctx);

        // Base fill over the whole visible view: at far zoom the camera sees
        // past the painted land/water rects — without this that's flickering
        // clear-color void.
        try {
            const v0 = this._view(state, ctx, 600);
            ctx.fillStyle = '#020617';
            ctx.fillRect(v0.x0, v0.y0, v0.x1 - v0.x0, v0.y1 - v0.y0);
        } catch (e) {}

        // The cave is a whole new place: its own backdrop replaces the
        // beach/sea/border/foam while inside. Entities draw on top as usual.
        // NOTE: the flag lives on the PLAYER (p.inCave), not on state.
        const inCave = !!(state.player && state.player.inCave);
        const onIsland = !!((typeof WorldSystem !== 'undefined' && WorldSystem.islandOf)
            ? WorldSystem.islandOf(state) : (state.player && state.player.onIsland));
        if (inCave && typeof Ritual !== 'undefined' && Ritual.drawCaveInterior) {
            Ritual.drawCaveInterior(state, ctx);
        } else if (onIsland && typeof WorldSystem !== 'undefined' && WorldSystem.drawIslandBase) {
            // 1.2.1: detached isle — its own sand + lakes + pier, not the beach.
            WorldSystem.drawIslandBase(state, ctx);
        } else {
            this.drawLand(state, ctx);
            this.drawWater(state, ctx);
            // 1.2.1: pier deck + ferry boat over the surf (tiers read from water color).
            try {
                if (typeof WorldSystem !== 'undefined' && WorldSystem.drawUnder) WorldSystem.drawUnder(state, ctx);
            } catch (e) {}
            this.drawWorldBorder(state, ctx);
            this.drawShoreFoam(state, ctx);
        }
        this.drawDelayedBlasts(state, ctx);
        this.drawGroundLoot(state, ctx);
        this.drawBobber(state, ctx);
        this.drawHookedFish(state, ctx);
        this.drawLandMonsters(state, ctx);
        this.drawEnemies(state, ctx);
        if (!inCave && !onIsland) this.drawShopZones(state, ctx);
        if (!inCave && !onIsland && typeof NPC !== 'undefined' && NPC.drawWorld) NPC.drawWorld(state, ctx);
        if (!onIsland && typeof Ritual !== 'undefined' && Ritual.drawWorld) Ritual.drawWorld(state, ctx);
        this.drawBullets(state, ctx);
        // Ferry hull under the sailing player (boat rides only).
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.drawBoatRide) WorldSystem.drawBoatRide(state, ctx);
        } catch (e) {}
        this.drawPlayer(state, ctx);
        this.drawParticles(state, ctx);
        // Cave darkness + player lantern: after the world + player so the
        // fog settles over rock AND entities, but under floating texts.
        if (inCave && typeof Ritual !== 'undefined' && Ritual.drawCaveFog) Ritual.drawCaveFog(state, ctx);
        this.drawFloatingTexts(state, ctx);

        ctx.restore();

        // 1.1.5 WORLD: day/night lighting + rain/storm/fog (screen-space).
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.drawScreenFx) WorldSystem.drawScreenFx(state, ctx);
        } catch (e) {}
        this.drawBossArrow(state, ctx);
        this.drawCrosshair(state, ctx);
        const zoomEl = document.getElementById('zoom-level');
        if (zoomEl) zoomEl.innerText = state.camera.zoom.toFixed(1) + 'x';
    },

    drawLand(state, ctx) {
        const w = state.waterBoundaryX;
        const B = CONFIG.WORLD;
        const t = state.time;

        const beachStart = B.MIN_X - 500;
        const beachEnd   = w;
        const beachTop   = B.MIN_Y - 500;
        const beachBot   = B.MAX_Y + 500;

        const dryGrad = ctx.createLinearGradient(0, beachTop, 0, beachBot);
        dryGrad.addColorStop(0.00, '#a07a4d');
        dryGrad.addColorStop(0.15, '#c99b63');
        dryGrad.addColorStop(0.45, '#e6bd82');
        dryGrad.addColorStop(0.80, '#d8a96d');
        dryGrad.addColorStop(1.00, '#b98a54');
        ctx.fillStyle = dryGrad;
        ctx.fillRect(beachStart, beachTop, beachEnd - beachStart, beachBot - beachTop);

        const tideWobble = Math.sin(t * 0.35) * 8 + Math.sin(t * 0.8) * 3;
        const wetWidthBase = 140;
        const wetStart = w - wetWidthBase - tideWobble;
        const wetEnd   = w + 20;

        const wetGrad = ctx.createLinearGradient(wetStart, 0, wetEnd, 0);
        wetGrad.addColorStop(0.00, 'rgba(180,140,90,0)');
        wetGrad.addColorStop(0.35, 'rgba(150,115,75,0.55)');
        wetGrad.addColorStop(0.70, 'rgba(120,90,60,0.85)');
        wetGrad.addColorStop(1.00, 'rgba(90,70,50,0.95)');
        ctx.fillStyle = wetGrad;
        ctx.fillRect(wetStart, beachTop, wetEnd - wetStart, beachBot - beachTop);

        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7cb0c9';
        const vw0 = this._view(state, ctx);
        const pudStep = this._ds(state);
        const pudSX = 420 * pudStep, pudSY = 380 * pudStep;
        for (let px = this._snapStart(vw0.x0, 420, pudSX); px < Math.min(w, vw0.x1); px += pudSX) {
            for (let py = this._snapStart(vw0.y0, 380, pudSY); py < Math.min(B.MAX_Y, vw0.y1); py += pudSY) {
                if (px < B.MIN_X - pudSX || py < B.MIN_Y - pudSY) continue;
                const seedX = px * 0.913 + py * 0.417;
                const seedY = py * 0.731 + px * 0.223;
                const rx = 30 + (Math.sin(seedX) * 0.5 + 0.5) * 45;
                const ry = 12 + (Math.cos(seedY) * 0.5 + 0.5) * 18;
                const cx = px + ((Math.sin(seedX * 2.1) * 0.5 + 0.5) * 200);
                const cy = py + ((Math.cos(seedY * 1.9) * 0.5 + 0.5) * 180);
                if (cx > w - 320 && cx < w - 20) {
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, rx, ry, Math.sin(seedX) * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();

        const grainFade = this._fade(state);
        if (grainFade > 0) {
        ctx.save();
        ctx.globalAlpha = 0.18 * grainFade;
        const vwGrain = this._view(state, ctx);
        const grainStep = (state._lowFx ? 30 : 14) * this._ds(state);
        for (let gx = this._snapStart(vwGrain.x0, grainStep, grainStep); gx < Math.min(beachEnd, vwGrain.x1); gx += grainStep) {
            for (let gy = this._snapStart(vwGrain.y0, grainStep, grainStep); gy < Math.min(beachBot, vwGrain.y1); gy += grainStep) {
                if (gx < beachStart - grainStep || gy < beachTop - grainStep) continue;
                const h1 = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
                const h2 = Math.sin(gx * 39.346 + gy * 11.135) * 24634.6345;
                const ox = (h1 - Math.floor(h1)) * grainStep;
                const oy = (h2 - Math.floor(h2)) * grainStep;
                const shade = (h1 - Math.floor(h1)) > 0.5 ? '#8a6a42' : '#f0d6a5';
                ctx.fillStyle = shade;
                ctx.fillRect(gx + ox, gy + oy, 1.2, 1.2);
            }
        }
        ctx.restore();
        }

        // (Beach speckles — shells/pebbles/driftwood — were removed here:
        // their lattice was view-anchored and visibly swam with the camera.)

        ctx.save();
        ctx.globalAlpha = 0.35;
        const duneGrad = ctx.createLinearGradient(0, B.MIN_Y - 200, 0, B.MIN_Y + 120);
        duneGrad.addColorStop(0, 'rgba(60,40,25,0.65)');
        duneGrad.addColorStop(1, 'rgba(60,40,25,0)');
        ctx.fillStyle = duneGrad;
        ctx.fillRect(beachStart, B.MIN_Y - 200, beachEnd - beachStart, 320);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.10;
        ctx.strokeStyle = '#7e5c37';
        ctx.lineWidth = 1;
        const vwRip = this._view(state, ctx);
        const ripStep = this._ds(state);
        const ripRowH = 22 * ripStep;
        let ripRow = 0;
        for (let y = this._snapStart(vwRip.y0, ripRowH, ripRowH); y < Math.min(B.MAX_Y, vwRip.y1); y += ripRowH) {
            if (y < B.MIN_Y + 40 - ripRowH) continue;
            if (state._lowFx && (ripRow++ % 2)) continue;
            ctx.beginPath();
            for (let x = Math.max(B.MIN_X, vwRip.x0); x < Math.min(w - 40, vwRip.x1); x += 24 * ripStep) {
                // Carved static sand ripples: shape comes from position only.
                // (The old time-driven crawl made the whole beach shimmer.)
                const wy = y + Math.sin(x * 0.02 + y * 0.05) * 2;
                if (x === B.MIN_X) ctx.moveTo(x, wy);
                else ctx.lineTo(x, wy);
            }
            ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        const sun = ctx.createRadialGradient(
            w * 0.45, B.MIN_Y + (B.MAX_Y - B.MIN_Y) * 0.4, 50,
            w * 0.45, B.MIN_Y + (B.MAX_Y - B.MIN_Y) * 0.4, 900
        );
        sun.addColorStop(0, 'rgba(255, 230, 170, 0.20)');
        sun.addColorStop(1, 'rgba(255, 230, 170, 0)');
        ctx.fillStyle = sun;
        ctx.fillRect(beachStart, beachTop, beachEnd - beachStart, beachBot - beachTop);
        ctx.restore();
    },

    drawWater(state, ctx) {
        const w = state.waterBoundaryX;
        const B = CONFIG.WORLD;
        const t = state.time;

        // Tier-tinted water: light shallow near the surf, dark deep far
        // out. The COLOR is the zone map now (no more label orbs).
        // Edges come from WorldSystem.ZONE_EDGES — the same detector
        // that decides spawn rates (see seaCellAt), so tint == rules.
        const ZE = (typeof WorldSystem !== 'undefined' && WorldSystem.ZONE_EDGES) || { SHORE: 250, SHALLOW: 650 };
        const span = Math.max(1, (B.MAX_X + 2000) - w);
        const fShore = Math.min(0.5, ZE.SHORE / span);
        const fDeep = Math.min(0.9, ZE.SHALLOW / span);
        const grad = ctx.createLinearGradient(w, 0, B.MAX_X + 2000, 0);
        grad.addColorStop(0, '#1093b8');
        grad.addColorStop(fShore, '#0c6e94');
        grad.addColorStop(fDeep, '#075985');
        grad.addColorStop(1, '#041f33');
        ctx.fillStyle = grad;
        ctx.fillRect(w, B.MIN_Y - 500, (B.MAX_X - w) + 2000, (B.MAX_Y - B.MIN_Y) + 1000);

        const depthGrad = ctx.createLinearGradient(0, B.MIN_Y, 0, B.MAX_Y);
        depthGrad.addColorStop(0, 'rgba(2,132,199,0.15)');
        depthGrad.addColorStop(1, 'rgba(2,6,23,0.5)');
        ctx.fillStyle = depthGrad;
        ctx.fillRect(w, B.MIN_Y - 500, (B.MAX_X - w) + 2000, (B.MAX_Y - B.MIN_Y) + 1000);

        ctx.strokeStyle = 'rgba(125,211,252,0.12)';
        ctx.lineWidth = 1.5;
        const vwWater = this._view(state, ctx);
        const arcStep = (state._lowFx ? 140 : 70) * this._ds(state);
        const arcFade = this._fade(state);
        if (arcFade > 0) {
        ctx.save();
        ctx.globalAlpha = arcFade;
        for (let x = this._snapStart(vwWater.x0, arcStep, arcStep); x < Math.min(B.MAX_X + 200, vwWater.x1); x += arcStep) {
            for (let y = this._snapStart(vwWater.y0, arcStep, arcStep); y < Math.min(B.MAX_Y + 200, vwWater.y1); y += arcStep) {
                if (x < w + 30 - arcStep || y < B.MIN_Y - 100 - arcStep) continue;
                // Gentle breathing sway only — the old ±12px crawl made the
                // whole sea look like it was shimmering.
                ctx.beginPath();
                ctx.arc(
                    x + Math.sin(t * 1.5 + y * 0.02) * 2,
                    y + Math.cos(t * 1.2 + x * 0.02) * 1.5,
                    18, 0, Math.PI
                );
                ctx.stroke();
            }
        }
        ctx.restore();
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 8; i++) {
            const rx = w + 100 + i * 180;
            if (rx > B.MAX_X + 200) break;
            const rayGrad = ctx.createLinearGradient(rx, 0, rx + 60, B.MAX_Y);
            rayGrad.addColorStop(0, 'rgba(125,211,252,0.08)');
            rayGrad.addColorStop(1, 'rgba(125,211,252,0)');
            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(rx, B.MIN_Y - 100);
            ctx.lineTo(rx + 80, B.MIN_Y - 100);
            ctx.lineTo(rx + 200, B.MAX_Y + 100);
            ctx.lineTo(rx + 120, B.MAX_Y + 100);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    },

    drawWorldBorder(state, ctx) {
        const B = CONFIG.WORLD;
        const t = state.time;

        if (B.SHOW_GRID) {
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
            ctx.lineWidth = 1;
            const vwGrid = this._view(state, ctx);
            ctx.beginPath();
            for (let x = this._snapStart(vwGrid.x0, B.GRID_SIZE, B.GRID_SIZE); x <= Math.min(B.MAX_X, vwGrid.x1); x += B.GRID_SIZE) {
                if (x < B.MIN_X - B.GRID_SIZE) continue;
                ctx.moveTo(x, Math.max(B.MIN_Y, vwGrid.y0));
                ctx.lineTo(x, Math.min(B.MAX_Y, vwGrid.y1));
            }
            for (let y = this._snapStart(vwGrid.y0, B.GRID_SIZE, B.GRID_SIZE); y <= Math.min(B.MAX_Y, vwGrid.y1); y += B.GRID_SIZE) {
                if (y < B.MIN_Y - B.GRID_SIZE) continue;
                ctx.moveTo(Math.max(B.MIN_X, vwGrid.x0), y);
                ctx.lineTo(Math.min(B.MAX_X, vwGrid.x1), y);
            }
            ctx.stroke();
            ctx.restore();
        }

        const stripeOffset = (t * 40) % 40;

        const drawEdge = (x1, y1, x2, y2) => {
            const len = Math.hypot(x2 - x1, y2 - y1);
            const angle = Math.atan2(y2 - y1, x2 - x1);

            ctx.save();
            ctx.translate(x1, y1);
            ctx.rotate(angle);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(0, -B.BORDER_THICKNESS / 2, len, B.BORDER_THICKNESS);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, -B.BORDER_THICKNESS / 2, len, B.BORDER_THICKNESS);
            ctx.clip();

            for (let i = -B.BORDER_THICKNESS; i < len + B.BORDER_THICKNESS; i += 40) {
                ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
                ctx.save();
                ctx.translate(i + stripeOffset, 0);
                ctx.beginPath();
                ctx.moveTo(0, -B.BORDER_THICKNESS / 2);
                ctx.lineTo(20, -B.BORDER_THICKNESS / 2);
                ctx.lineTo(20 - B.BORDER_THICKNESS, B.BORDER_THICKNESS / 2);
                ctx.lineTo(0 - B.BORDER_THICKNESS, B.BORDER_THICKNESS / 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();

            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = B.BORDER_GLOW;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -B.BORDER_THICKNESS / 2);
            ctx.lineTo(len, -B.BORDER_THICKNESS / 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, B.BORDER_THICKNESS / 2);
            ctx.lineTo(len, B.BORDER_THICKNESS / 2);
            ctx.stroke();

            ctx.restore();
        };

        drawEdge(B.MIN_X, B.MIN_Y, B.MAX_X, B.MIN_Y);
        drawEdge(B.MIN_X, B.MAX_Y, B.MAX_X, B.MAX_Y);
        drawEdge(B.MIN_X, B.MIN_Y, B.MIN_X, B.MAX_Y);
        drawEdge(B.MAX_X, B.MIN_Y, B.MAX_X, B.MAX_Y);

        const drawCorner = (x, y) => {
            ctx.save();
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 24;
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fill();
            const pulse = 4 + Math.sin(t * 4) * 2;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(x, y, pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };
        drawCorner(B.MIN_X, B.MIN_Y);
        drawCorner(B.MAX_X, B.MIN_Y);
        drawCorner(B.MIN_X, B.MAX_Y);
        drawCorner(B.MAX_X, B.MAX_Y);

        const cam = state.camera;
        const canvasDiag = Math.hypot(ctx.canvas.width, ctx.canvas.height) / cam.zoom;
        const labelDist = canvasDiag * 0.7;

        const drawLabel = (x, y, text, rotation = 0) => {
            const d = Math.hypot(cam.x - x, cam.y - y);
            if (d > labelDist) return;
            const alpha = Utils.clamp(1 - d / labelDist, 0, 1);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            ctx.rotate(rotation);
            ctx.font = 'bold 14px Work Sans';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText(text, 0, 0);
            ctx.fillStyle = '#f59e0b';
            ctx.fillText(text, 0, 0);
            ctx.restore();
        };

        const cx = (B.MIN_X + B.MAX_X) / 2;
        const cy = (B.MIN_Y + B.MAX_Y) / 2;
        drawLabel(cx, B.MIN_Y - 26, '⛔ NORTH BORDER ⛔', 0);
        drawLabel(cx, B.MAX_Y + 26, '⛔ SOUTH BORDER ⛔', 0);
        drawLabel(B.MIN_X - 26, cy, '⛔ WEST BORDER ⛔', -Math.PI / 2);
        drawLabel(B.MAX_X + 26, cy, '⛔ EAST BORDER ⛔', Math.PI / 2);
    },

    drawShoreFoam(state, ctx) {
        const w = state.waterBoundaryX;
        const B = CONFIG.WORLD;
        const t = state.time;

        const foamGrad = ctx.createLinearGradient(w - 45, 0, w + 30, 0);
        foamGrad.addColorStop(0.00, 'rgba(255, 250, 235, 0)');
        foamGrad.addColorStop(0.20, 'rgba(255, 250, 235, 0.25)');
        foamGrad.addColorStop(0.55, 'rgba(245, 240, 225, 0.85)');
        foamGrad.addColorStop(0.80, 'rgba(224, 242, 254, 0.90)');
        foamGrad.addColorStop(1.00, 'rgba(224, 242, 254, 0)');
        ctx.fillStyle = foamGrad;
        ctx.fillRect(w - 45, B.MIN_Y - 500, 75, (B.MAX_Y - B.MIN_Y) + 1000);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = B.MIN_Y - 100; y < B.MAX_Y + 100; y += 6) {
            const wave1 = Math.sin(y * 0.045 + t * 2.2) * 4;
            const wave2 = Math.sin(y * 0.11 - t * 3.1) * 2;
            const x = w + wave1 + wave2;
            if (y === B.MIN_Y - 100) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let y = B.MIN_Y - 100; y < B.MAX_Y + 100; y += 6) {
            const wave = Math.sin(y * 0.06 + t * 1.6 + 0.9) * 5;
            const x = w - 8 + wave;
            if (y === B.MIN_Y - 100) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = this._fade(state);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        for (let y = B.MIN_Y - 50; y < B.MAX_Y + 50; y += 24) {
            const phase = Math.sin(y * 0.02 + t * 1.8) * 0.5 + 0.5;
            const bx = w - 6 - phase * 22;
            const by = y;
            const radius = 0.9 + phase * 1.4;
            ctx.beginPath();
            ctx.arc(bx, by, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(60, 40, 25, 0.35)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let y = B.MIN_Y - 100; y < B.MAX_Y + 100; y += 8) {
            const wave = Math.sin(y * 0.04 + t * 1.5) * 3;
            const x = w + wave;
            if (y === B.MIN_Y - 100) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    },

    drawGroundLoot(state, ctx) {
        if (!state.groundLoot) return;
        const p = state.player;

        state.groundLoot.forEach(item => {
            const bob = Math.sin(state.time * 3 + item.x) * 3;
            const distToP = Math.hypot(p.x - item.x, p.y - item.y);
            // Sinking out: fade + settle + shrink over the sink timer
            let alpha = 1, sinkY = 0, sinkScale = 1;
            if (item.sinking) {
                const k = Math.max(0, item.sinking / (item.sinkMax || 1.2));
                alpha = k;
                sinkY = (1 - k) * 26;
                sinkScale = 0.4 + 0.6 * k;
            }

            if (distToP < 90 && !item.sinking) {
                ctx.save();
                ctx.strokeStyle = `rgba(56,189,248,${0.5 * (1 - distToP / 90)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(item.x, item.y, 18 + Math.sin(state.time * 6) * 3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.globalAlpha = alpha;
            // Summon-item loot (boss keys/trophies): emoji model + glow ring
            if (item.item && item.item.keyItem) {
                const bobY = item.y + bob + sinkY;
                ctx.shadowColor = item.item.color || '#fff';
                ctx.shadowBlur = 18;
                ctx.font = '30px serif';
                ctx.textAlign = 'center';
                ctx.fillText(item.item.icon || '❔', item.x, bobY);
                ctx.shadowBlur = 0;
                ctx.globalAlpha = alpha * (0.55 + Math.sin(state.time * 5 + item.x) * 0.25);
                ctx.strokeStyle = item.item.color || '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(item.x, bobY - 10, 20 * sinkScale, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha;
            } else {
            // Fish loot without species data can never render — skip it
            // instead of crashing the whole loot pass.
            if (!item.species) { ctx.restore(); return; }
            ctx.shadowColor = item.species.color;
            ctx.shadowBlur = 15;
            this.drawFishModel(ctx, item.x, item.y + bob + sinkY, item.species.size * 0.6 * sinkScale, item.species, {});
            }
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 11px Work Sans';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            const labelName = (item.item && item.item.keyItem) ? `${item.item.icon || ''} ${item.item.name}` : item.species.name;
            const labelY = item.y - 22 + bob + sinkY;
            ctx.strokeText(labelName, item.x, labelY);
            ctx.fillStyle = (item.item && item.item.keyItem) ? (item.item.color || '#fff') : '#fff';
            ctx.fillText(labelName, item.x, labelY);
            ctx.restore();
        });
    },

    // Per-rod bobber art. PNG (assets/bobbers/<model>.png or player
    // upload) wins when present, fitted without stretching; otherwise one
    // of the 6 procedural models. accent = rod color, sc = scale, t = time.
    drawBobberModel(ctx, x, y, model, accent, sc, t) {
        sc = sc || 1;
        accent = accent || '#ef4444';
        const img = (typeof BobberLoader !== 'undefined' && model) ? BobberLoader.get(model) : null;
        if (img && img.complete && img.naturalWidth > 0) {
            const iw = img.naturalWidth, ih = img.naturalHeight;
            const k = Math.min(30 * sc / iw, 30 * sc / ih);
            ctx.drawImage(img, x - iw * k / 2, y - ih * k / 2, iw * k, ih * k);
            return;
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(sc, sc);
        switch (model) {
            case 'slim': {
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath(); ctx.roundRect(-2.5, -9, 5, 18, 2.5); ctx.fill();
                ctx.fillStyle = accent;
                ctx.fillRect(-2.5, -9, 5, 5);
                ctx.fillStyle = '#0f172a';
                ctx.beginPath(); ctx.arc(0, -11, 2, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'bulb': {
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = accent;
                ctx.fillRect(-8, -2.5, 16, 5);
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath(); ctx.arc(0, -8, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = accent; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
                break;
            }
            case 'glow': {
                const pulse = 14 + Math.sin((t || 0) * 5) * 5;
                ctx.shadowColor = accent; ctx.shadowBlur = pulse;
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'feather': {
                ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -10); ctx.stroke();
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath(); ctx.ellipse(0, -2, 3.5, 9, 0.15, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = accent;
                ctx.beginPath(); ctx.ellipse(0, -8, 2.5, 4.5, 0.15, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'rocket': {
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.moveTo(0, -11); ctx.lineTo(5, 2); ctx.lineTo(-5, 2);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(-5, 2, 10, 5);
                ctx.fillStyle = accent;
                ctx.beginPath();
                ctx.moveTo(-5, 4); ctx.lineTo(-9, 10); ctx.lineTo(-5, 10);
                ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(5, 4); ctx.lineTo(9, 10); ctx.lineTo(5, 10);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#fde047';
                ctx.beginPath(); ctx.arc(0, -6, 2, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'classic':
            default: {
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.arc(0, 0, 7, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, 0, 7, Math.PI, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(15,23,42,0.6)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
                break;
            }
        }
        ctx.restore();
    },

    drawBobber(state, ctx) {
        const f = state.fishing;
        const p = state.player;
        if (!f) return;

        if (f.mode === 'CASTING') {
            const meterW = 80;
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(p.x - 40, p.y - 55, meterW, 12, 4);
            ctx.fill(); ctx.stroke();

            const g = ctx.createLinearGradient(p.x - 40, 0, p.x + 40, 0);
            g.addColorStop(0, '#10b981');
            g.addColorStop(0.6, '#fbbf24');
            g.addColorStop(1, '#ef4444');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.roundRect(p.x - 38, p.y - 53, (f.castPower / 100) * (meterW - 4), 8, 3);
            ctx.fill();
        }

        if (f.mode === 'CAST_FLY') {
            const rod = p.equippedRod || {};
            const model = rod.bobberModel || 'classic';
            const lineCol = rod.lineColor || 'rgba(148,163,184,0.9)';
            const t = Math.min(1, (f.castT || 0) / (f.castDur || 0.5));
            const h = Math.sin(t * Math.PI); // 0 -> 1 -> 0 across the throw
            const lift = h * 50;
            const bx = f.bobber.x, by = f.bobber.y - lift;
            // Stretching line from the rod tip to the flying bobber
            ctx.strokeStyle = lineCol;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.quadraticCurveTo((p.x + bx) / 2, (p.y + by) / 2 + 20 * (1 - h), bx, by);
            ctx.stroke();
            // The bobber itself, riding high mid-flight
            this.drawBobberModel(ctx, bx, by, model, rod.color || lineCol, 1 + h * 0.4, state.time);
            return;
        }

        if (f.mode === 'WAITING_BITES') {
            const bob = Math.sin(state.time * 4) * 3;
            const rod = p.equippedRod || {};
            const model = rod.bobberModel || 'classic';
            const lineCol = rod.lineColor || 'rgba(148,163,184,0.7)';
            ctx.strokeStyle = 'rgba(125,211,252,0.5)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                ctx.globalAlpha = 0.5 - i * 0.15;
                ctx.beginPath();
                ctx.arc(f.bobber.x, f.bobber.y + bob,
                    8 + i * 8 + Math.sin(state.time * 3 + i) * 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            this.drawBobberModel(ctx, f.bobber.x, f.bobber.y + bob, model, rod.color || lineCol, 1, state.time);

            ctx.strokeStyle = lineCol;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.quadraticCurveTo((p.x + f.bobber.x) / 2,
                                 (p.y + f.bobber.y) / 2 + 30,
                                 f.bobber.x, f.bobber.y + bob);
            ctx.stroke();
        }
    },

    drawHookedFish(state, ctx) {
        const f = state.fishing;
        const p = state.player;
        if (f.mode !== 'HOOKED' || !f.hookedFish) return;

        const fish = f.hookedFish;
        const broken = !!fish.lineBroken;
        const isHighTension = !broken && f.lineTension / p.equippedRod.tensionMax > 0.8;
        const rodCol = (p.equippedRod && p.equippedRod.lineColor) || '#38bdf8';

        // Snapped line (boss fight): no line rendered at all
        if (!broken) {
        ctx.strokeStyle = isHighTension ? '#f43f5e' : (fish.isDead ? '#94a3b8' : rodCol);
        ctx.lineWidth = isHighTension ? 3 : 2;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = isHighTension ? 12 : 6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const midX = (p.x + fish.x) / 2;
        const midY = (p.y + fish.y) / 2 + f.lineTension * 0.3;
        ctx.quadraticCurveTo(midX, midY, fish.x, fish.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        }

        ctx.save();
        if (fish.isDead) ctx.globalAlpha = 0.6;
        this.drawFishModel(ctx, fish.x, fish.y, fish.species.size, fish.species, {
            angle: fish.rotation,
            isRaging: fish.isRaging && !fish.isDead,
            isInflated: fish.isInflated,
            glow: (fish.species.rarity === 'legendary' || fish.species.mutation === 'void') && !fish.isDead ? 1 : 0
        });
        ctx.restore();

        if (fish.isDead) {
            ctx.font = 'bold 20px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ef4444';
            ctx.fillText('☠', fish.x, fish.y - fish.species.size - 12);
            return;
        }

        const barW = 60;
        const barY = fish.y - fish.species.size - 24;
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.beginPath();
        ctx.roundRect(fish.x - barW / 2 - 2, barY - 2, barW + 4, 16, 4);
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(fish.x - barW / 2, barY, (fish.hp / fish.maxHp) * barW, 5, 2);
        ctx.fill();

        const staminaRatio = fish.stamina / fish.staminaMax;
        if (staminaRatio <= 0.01) {
            ctx.fillStyle = `rgba(251, 191, 36, ${0.6 + Math.sin(state.time * 8) * 0.4})`;
        } else {
            ctx.fillStyle = '#facc15';
        }
        ctx.beginPath();
        ctx.roundRect(fish.x - barW / 2, barY + 7, staminaRatio * barW, 5, 2);
        ctx.fill();

        if (fish.skillCooldown < 0.5) {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 11px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillText(`⚠ ${fish.species.skillName}`, fish.x, barY - 8);
        }
    },

    drawLandMonsters(state, ctx) {
        const p = state.player;
        if (!state.monstersOnLand) return;
        state.monstersOnLand.forEach(m => {
            // Bosses get their own fancy renderer (aura, crown, phase glow)
            if (m.species && m.species.isBoss) {
                this.drawBossMonster(state, ctx, m);
                return;
            }

            const angle = Math.atan2(p.y - m.y, p.x - m.x);
            this.drawFishModel(ctx, m.x, m.y, m.species.size, m.species, { angle: angle + Math.PI });

            const barW = 50;
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.fillRect(m.x - barW / 2, m.y - m.species.size - 18, barW, 7);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(m.x - barW / 2, m.y - m.species.size - 18, (m.hp / m.maxHp) * barW, 7);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(m.x - barW / 2, m.y - m.species.size - 18, barW, 7);

            if (m.isCharging) {
                ctx.fillStyle = '#f87171';
                ctx.font = 'bold 10px Work Sans';
                ctx.textAlign = 'center';
                ctx.fillText('CHARGING!', m.x, m.y - m.species.size - 24);
            }
        });
    },

    // ============================================================
    //  BOSS RENDERING
    // ============================================================
    drawBossMonster(state, ctx, m) {
        const p = state.player;
        const species = m.species;
        const hpRatio = m.hp / (m.maxHp || species.maxHp || 1);
        const phase2 = m.phase === 2;
        const t = state.time;

        const angle = Math.atan2(p.y - m.y, p.x - m.x) + Math.PI;

        // Ground aura ring
        ctx.save();
        const auraR = species.size * 1.9;
        const auraPulse = 1 + Math.sin(t * 3) * 0.08;
        const auraColor = phase2 ? '#dc2626' : species.color;

        const auraGrad = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, auraR * auraPulse);
        auraGrad.addColorStop(0, this._hexWithAlpha(auraColor, 0.35));
        auraGrad.addColorStop(0.6, this._hexWithAlpha(auraColor, 0.12));
        auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, auraR * auraPulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = this._hexWithAlpha(auraColor, 0.7);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -t * 30;
        ctx.beginPath();
        ctx.arc(m.x, m.y, auraR * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Phase 2 orbiting flame sparks
        if (phase2) {
            ctx.save();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + t * 1.5;
                const rr = auraR * 0.85;
                const fx = m.x + Math.cos(a) * rr;
                const fy = m.y + Math.sin(a) * rr;
                const flameSize = 4 + Math.sin(t * 8 + i) * 2;
                ctx.fillStyle = 'rgba(220,38,38,0.8)';
                ctx.beginPath();
                ctx.arc(fx, fy, flameSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(251,191,36,0.7)';
                ctx.beginPath();
                ctx.arc(fx, fy, flameSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // The fish model
        ctx.save();
        ctx.shadowColor = phase2 ? '#dc2626' : species.color;
        ctx.shadowBlur = 30 + Math.sin(t * 4) * 8;
        this.drawFishModel(ctx, m.x, m.y, species.size, species, {
            angle: angle,
            isRaging: true,
            isInflated: m.isInflated
        });
        ctx.restore();

        // Crown
        const crownY = m.y - species.size - 24;
        const crownX = m.x;
        ctx.save();
        ctx.translate(crownX, crownY);
        ctx.shadowColor = phase2 ? '#dc2626' : '#f59e0b';
        ctx.shadowBlur = 18;
        ctx.fillStyle = phase2 ? '#dc2626' : '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-10, 4);
        ctx.lineTo(-10, -2);
        ctx.lineTo(-5, 2);
        ctx.lineTo(0, -6);
        ctx.lineTo(5, 2);
        ctx.lineTo(10, -2);
        ctx.lineTo(10, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = phase2 ? '#991b1b' : '#b45309';
        ctx.fillRect(-10, 4, 20, 2);
        ctx.restore();

        // Inline HP bar
        const barW = species.size * 2.6;
        const barH = 8;
        const barY = m.y - species.size - 46;
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.95)';
        ctx.strokeStyle = phase2 ? '#dc2626' : '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(m.x - barW / 2 - 2, barY - 2, barW + 4, barH + 4, 3);
        ctx.fill();
        ctx.stroke();

        const fillW = Math.max(0, Math.min(1, hpRatio)) * barW;
        const hpGrad = ctx.createLinearGradient(m.x - barW / 2, 0, m.x + barW / 2, 0);
        if (phase2) {
            hpGrad.addColorStop(0, '#dc2626');
            hpGrad.addColorStop(1, '#f59e0b');
        } else {
            hpGrad.addColorStop(0, '#f59e0b');
            hpGrad.addColorStop(1, '#ef4444');
        }
        ctx.fillStyle = hpGrad;
        ctx.beginPath();
        ctx.roundRect(m.x - barW / 2, barY, fillW, barH, 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x - barW / 2 + barW * 0.4, barY);
        ctx.lineTo(m.x - barW / 2 + barW * 0.4, barY + barH);
        ctx.stroke();

        ctx.font = 'bold 10px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 3;
        const labelText = species.name.toUpperCase() + (phase2 ? ' ⚠' : '');
        ctx.strokeText(labelText, m.x, barY - 6);
        ctx.fillText(labelText, m.x, barY - 6);
        ctx.restore();

        // Charging indicator
        if (m.isCharging) {
            ctx.save();
            ctx.font = 'bold 11px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f87171';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText('CHARGING!', m.x, barY - 20);
            ctx.fillText('CHARGING!', m.x, barY - 20);
            ctx.restore();
        }

        // Stunned indicator
        if (m.stunTimer > 0) {
            ctx.save();
            ctx.font = 'bold 12px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#facc15';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText('⚡ STUNNED', m.x, m.y - species.size - 60);
            ctx.fillText('⚡ STUNNED', m.x, m.y - species.size - 60);
            ctx.restore();
        }
    },

    _hexWithAlpha(hex, alpha) {
        if (!hex || hex[0] !== '#') return `rgba(255,255,255,${alpha})`;
        const h = hex.slice(1);
        const full = h.length === 3
            ? h.split('').map(c => c + c).join('')
            : h;
        const n = parseInt(full, 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    },

    // ============================================================
    //  ENEMY RENDERING (Seagulls, Jumping Fish, Beach Crabs)
    // ============================================================
    drawEnemies(state, ctx) {
        if (!state.enemies) return;
        state.enemies.forEach(e => {
            if (e.enemyType === 'seagull' && typeof renderSeagull === 'function') {
                renderSeagull(ctx, e);
            } else if (e.enemyType === 'gullMissile' && typeof renderGullMissile === 'function') {
                renderGullMissile(ctx, e);
            } else if (e.enemyType === 'jumpingFish' && typeof renderJumpingFish === 'function') {
                renderJumpingFish(ctx, e);
            } else if (e.enemyType === 'beachCrab' && typeof renderBeachCrab === 'function') {
                renderBeachCrab(ctx, e);
            }
            
            // Health bar for enemies (boss gets a wider bar)
            if (e.maxHp && e.hp < e.maxHp) {
                const barW = e.isBoss ? 90 : 40;
                ctx.fillStyle = 'rgba(15,23,42,0.9)';
                ctx.fillRect(e.x - barW / 2, e.y - (e.isBoss ? 52 : 30), barW, e.isBoss ? 7 : 5);
                ctx.fillStyle = e.isBoss ? '#f59e0b' : '#ef4444';
                ctx.fillRect(e.x - barW / 2, e.y - (e.isBoss ? 52 : 30), (e.hp / e.maxHp) * barW, e.isBoss ? 7 : 5);
            }
            
            // Enemy type label
            ctx.font = e.isBoss ? 'black 13px Work Sans' : 'bold 9px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = e.isBoss ? '#f87171' : '#fbbf24';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 2;
            const label = e.isBoss ? `⛈ ${(e.bossName || 'STORMCALLER')} (MINIBOSS)` :
                e.enemyType === 'seagull' ? 'Seagull (loot!)' :
                e.enemyType === 'gullMissile' ? '!' :
                e.enemyType === 'jumpingFish' ? `${(e.species && e.species.name) || 'Jumping Fish'}` : 'Beach Crab (loot!)';
            ctx.strokeText(label, e.x, e.y - (e.isBoss ? 58 : 35));
            ctx.fillText(label, e.x, e.y - (e.isBoss ? 58 : 35));
        });
    },

    // ============================================================
    //  WORLD SHOP / CASINO ZONES — walk in, press E
    //  SHOP circle = Beach Shop (shop modal opens on Beach tab).
    // ============================================================
    getShopZones(state) {
        const B = CONFIG.WORLD;
        // Deep inside the beach, away from the surf (playable on any screen
        // width — clamped so the pads never leave the sand).
        const x = Utils.clamp(state.waterBoundaryX - 320, B.MIN_X + 130, state.waterBoundaryX - 110);
        const clampY = (y) => Utils.clamp(y, B.MIN_Y + 120, B.MAX_Y - 120);
        return [
            { id: 'shop',   x, y: clampY(B.MIN_Y + 560),  radius: 90, color: '#f59e0b', label: 'SHOP',   icon: '🏪' },
            { id: 'casino', x, y: clampY(B.MIN_Y + 1560), radius: 90, color: '#e879f9', label: 'CASINO', icon: '🎰' },
        ];
    },

    nearestShopZone(state) {
        const p = state.player;
        let best = null, bestD = Infinity;
        for (const z of this.getShopZones(state)) {
            const d = Math.hypot(p.x - z.x, p.y - z.y);
            if (d < bestD) { bestD = d; best = z; }
        }
        return best ? { zone: best, dist: bestD } : null;
    },

    drawShopZones(state, ctx) {
        const t = state.time;
        const p = state.player;
        for (const z of this.getShopZones(state)) {
            const near = Math.hypot(p.x - z.x, p.y - z.y) < z.radius + 50;
            // Base pad
            ctx.save();
            ctx.globalAlpha = near ? 0.35 : 0.18;
            ctx.fillStyle = z.color;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            // Two pulsing rings
            for (let k = 0; k < 2; k++) {
                const phase = ((t * 0.7 + k * 0.5) % 1);
                const r = z.radius * (0.55 + phase * 0.65);
                ctx.globalAlpha = (1 - phase) * (near ? 0.9 : 0.5);
                ctx.strokeStyle = z.color;
                ctx.lineWidth = near ? 4 : 2.5;
                ctx.beginPath(); ctx.arc(z.x, z.y, r, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            // Solid rim
            ctx.strokeStyle = z.color;
            ctx.lineWidth = 3;
            ctx.setLineDash([12, 8]);
            ctx.lineDashOffset = -t * 40;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            // Label
            ctx.textAlign = 'center';
            ctx.font = 'black 26px Work Sans';
            ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText(`${z.icon} ${z.label}`, z.x, z.y - 8);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${z.icon} ${z.label}`, z.x, z.y - 8);
            ctx.font = 'bold 15px Work Sans';
            const hint = near ? 'Press E!' : 'Walk in + Press E';
            ctx.lineWidth = 4;
            ctx.strokeText(hint, z.x, z.y + 22);
            ctx.fillStyle = near ? '#fef08a' : z.color;
            ctx.fillText(hint, z.x, z.y + 22);
            ctx.restore();
        }
    },

    // Screen-space arrow pointing at the live boss when off-screen
    drawBossArrow(state, ctx) {
        const boss = state.activeBoss;
        if (!boss || boss.hp <= 0) return;
        if (state.monstersOnLand && !state.monstersOnLand.includes(boss)) return;
        const canvas = ctx.canvas;
        const cam = state.camera;
        const sx = (boss.x - cam.x) * cam.zoom + canvas.width / 2;
        const sy = (boss.y - cam.y) * cam.zoom + canvas.height / 2;
        const margin = 70;
        if (sx > margin && sx < canvas.width - margin && sy > margin && sy < canvas.height - margin) return;
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const ax = cx + Math.cos(a) * (Math.min(canvas.width, canvas.height) / 2 - margin);
        const ay = cy + Math.sin(a) * (Math.min(canvas.width, canvas.height) / 2 - margin);
        const dist = Math.round(Math.hypot(boss.x - state.player.x, boss.y - state.player.y));
        const pulse = 1 + Math.sin(state.time * 6) * 0.12;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(a);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(22, 0); ctx.lineTo(-10, -14); ctx.lineTo(-4, 0); ctx.lineTo(-10, 14);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'black 13px Work Sans';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        const label = `BOSS ${dist}m`;
        ctx.strokeText(label, ax, ay + 30);
        ctx.fillStyle = '#f87171';
        ctx.fillText(label, ax, ay + 30);
        ctx.restore();
    },

    drawBullets(state, ctx) {
        if (!state.bullets) return;
        state.bullets.forEach(b => {
            const isPlayerBullet = b.type && b.type !== 'enemy_spark' && b.type !== 'enemy_quill';

            if (b.trail && b.trail.length) {
                b.trail.forEach((pt, i) => {
                    ctx.globalAlpha = (i / b.trail.length) * 0.5;
                    ctx.fillStyle = isPlayerBullet
                        ? (b.type === 'harpoon' || b.type === 'rail' ? '#38bdf8'
                            : b.type === 'plasma' ? '#a5f3fc'
                            : b.type === 'flame' ? '#fb923c'
                            : '#facc15')
                        : (b.color || '#facc15');
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
            }

            let fill = b.color || '#facc15';
            let glow = b.color || '#facc15';
            let radius = b.radius || 3;

            if (isPlayerBullet) {
                if (b.type === 'harpoon' || b.type === 'rail') { fill = glow = '#38bdf8'; radius = 5; }
                else if (b.type === 'plasma') { fill = '#a5f3fc'; glow = '#67e8f9'; radius = 5; }
                else if (b.type === 'flame') { fill = '#fb923c'; glow = '#f97316'; radius = 4; }
                else if (b.type === 'launcher') { fill = '#dc2626'; glow = '#f87171'; radius = 5; }
                // NEW BULLET TYPES
                else if (b.type === 'crossbow') { fill = '#84cc16'; glow = '#a3e635'; radius = 4; }
                else if (b.type === 'tesla') { fill = '#38bdf8'; glow = '#bae6fd'; radius = 4; }
                else if (b.type === 'void') { fill = '#f472b6'; glow = '#e879f9'; radius = 6; }
                else if (b.type === 'coral_launcher') { fill = '#14b8a6'; glow = '#5eead4'; radius = 6; }
                else if (b.type === 'frost_bow') { fill = '#67e8f9'; glow = '#a5f3fc'; radius = 4; }
                else if (b.type === 'magma_shotgun') { fill = '#f97316'; glow = '#fb923c'; radius = 4; }
                else if (b.type === 'sonic') { fill = '#22d3ee'; glow = '#67e8f9'; radius = 5; }
            }

            ctx.shadowColor = glow;
            ctx.shadowBlur = 12;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    },

    drawDelayedBlasts(state, ctx) {
        if (!state.delayedBlasts || state.delayedBlasts.length === 0) return;
        const t = state.time;

        state.delayedBlasts.forEach(b => {
            const progress = 1 - Math.max(0, b.timer) / 1.5;
            const pulse = 0.5 + Math.sin(t * 20) * 0.5;

            ctx.save();

            ctx.globalAlpha = 0.35 + pulse * 0.35;
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.globalAlpha = 0.12 + pulse * 0.12;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 0.75;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const inner = b.radius * (1 - progress);
            if (inner > 2) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, inner, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();
        });
    },

    drawPlayer(state, ctx) {
        const p = state.player;
        ctx.save();
        ctx.translate(p.x, p.y);
        const aimAngle = Math.atan2(state.mouse.worldY - p.y, state.mouse.worldX - p.x);
        ctx.rotate(aimAngle);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(2, 4, p.radius, p.radius * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, p.radius);
        g.addColorStop(0, '#38bdf8');
        g.addColorStop(1, '#0369a1');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.stroke();

        const weaponId = p.equippedWeapons && p.equippedWeapons[p.activeSlot];
        const w = weaponId ? WEAPONS.find(x => x.id === weaponId) : null;
        if (w) {
            // Own body: my holder id == me → my art (see drawGun).
            let holder = null;
            try {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.roomCode && Multiplayer.localClientId) {
                    holder = { pid: Multiplayer.localClientId, me: Multiplayer.localClientId };
                }
            } catch (e) {}
            this.drawGun(ctx, p, w, holder);
        }

        ctx.restore();
    },

    drawGun(ctx, p, w, holder) {
        if (!w) return;

        const recoil = p.weaponRecoil || 0;
        ctx.translate(-recoil * 0.6, 0);

        const STEEL  = '#cbd5e1';
        const DARK   = '#334155';
        const BLACK  = '#0f172a';
        const GRIP   = '#1e293b';
        const WOOD   = '#7c4a21';
        const ACCENT = w.rarity === 'mythic'    ? '#e879f9'
                     : w.rarity === 'legendary' ? '#f59e0b'
                     : w.rarity === 'epic'      ? '#a855f7'
                     : w.rarity === 'rare'      ? '#38bdf8'
                     : '#94a3b8';
        // Helpers: filled rounded box + trigger guard stroke. Everything
        // points +x; origin sits at the shooter's hand.
        const box = (c, x, y, ww, hh, r) => {
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.roundRect(x, y, ww, hh, r === undefined ? 2 : r);
            ctx.fill();
        };
        const guard = (x, y, ww, hh) => {
            ctx.strokeStyle = DARK;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(x, y, ww, hh, 3);
            ctx.stroke();
        };
        const dot = (c, x, y, r, glow, glowC) => {
            if (glow) { ctx.shadowColor = glowC || c; ctx.shadowBlur = glow; }
            ctx.fillStyle = c;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        };

        // Custom PNG skin: fitted into the 80x40 gun footprint at (22, 0),
        // aspect preserved, never stretched. Falls through to procedural.
        const skinPref = (p.gunSkins && p.gunSkins[w.id]) || 'auto';
        let skinImg = null;
        if (w.skin !== false && skinPref !== 'classic' && typeof GunSkinLoader !== 'undefined') {
            // holder = { pid, me } or pid string: a FOREIGN body in a room
            // wears ONLY that holder's own custom art (else neutral shipped
            // art — never YOUR upload). Own body/shop/hotbar: your art.
            const skinId = w.skin || w.id;
            const holderPid = (typeof holder === 'string') ? holder : (holder && holder.pid);
            const myPid = (holder && typeof holder === 'object') ? holder.me : null;
            if (holderPid && myPid && holderPid !== myPid && typeof PeerSkins !== 'undefined' && PeerSkins.resolveGun) {
                skinImg = PeerSkins.resolveGun(skinId, holderPid) || GunSkinLoader.getShipped(skinId);
            } else {
                skinImg = GunSkinLoader.get(skinId);
            }
        }
        if (skinImg && skinImg.complete && skinImg.naturalWidth > 0) {
            const iw = skinImg.naturalWidth, ih = skinImg.naturalHeight;
            const k = Math.min(80 / iw, 40 / ih);
            ctx.drawImage(skinImg, 22 - iw * k / 2, -ih * k / 2, iw * k, ih * k);
        } else switch (w.type) {

            case 'pistol': {
                box(DARK, 0, -3, 12, 6);            // frame
                box(STEEL, 6, -6, 26, 9);           // slide
                box(BLACK, 6, -6, 26, 3, 1);        // slide shading
                box(BLACK, 8, -9, 5, 3, 1);         // rear sight
                box(BLACK, 28, -9, 3, 3, 1);        // front sight
                box(BLACK, 32, -4, 5, 8, 1);        // muzzle
                box('#000', 35, -1.5, 2, 3, 1);     // bore
                box(GRIP, 6, 3, 10, 13);            // grip
                box(ACCENT, 8, 5, 6, 2, 1);         // grip medallion
                guard(15, 3, 10, 6);                // trigger guard
                box(DARK, -4, -4, 5, 5, 1);         // hammer
                break;
            }

            case 'smg': {
                box(BLACK, -12, -2, 12, 5);         // stock
                box(DARK, 0, -4, 32, 9);            // receiver
                box(ACCENT, 2, -1, 28, 2, 1);       // side stripe
                box(STEEL, 4, -7, 18, 3, 1);        // top rail
                box(BLACK, 6, -10, 4, 3, 1);        // rear sight
                box(STEEL, 32, -3, 8, 6);           // barrel shroud
                box(BLACK, 40, -4, 11, 8, 3);       // suppressor
                box(DARK, 44, -4, 3, 8, 1);         // suppressor ring
                box(GRIP, 12, 5, 8, 14, 1);         // magazine
                box(GRIP, 26, 5, 7, 10);            // foregrip
                guard(20, 4, 8, 5);
                break;
            }

            case 'rifle': {
                box(BLACK, -14, -3, 14, 7);         // stock
                box(STEEL, 0, -4, 28, 9);           // receiver
                box(DARK, 2, -7, 20, 3, 1);         // carry rail
                box(BLACK, 4, -10, 4, 3, 1);        // rear sight
                box(DARK, 28, -4, 16, 8);           // handguard
                ctx.fillStyle = BLACK;              // handguard ribs
                for (let i = 0; i < 3; i++) ctx.fillRect(31 + i * 5, -4, 2, 8);
                box(BLACK, 44, -2, 7, 4);           // barrel
                box(STEEL, 51, -3, 4, 6, 1);        // muzzle brake
                box(BLACK, 34, -10, 3, 3, 1);       // front sight
                box(GRIP, 12, 5, 8, 12, 1);         // curved mag
                box(GRIP, 12, 15, 8, 4, 1);
                box(GRIP, 2, 5, 8, 11);             // grip
                guard(9, 5, 8, 5);
                box(ACCENT, 0, 2, 28, 2, 1);        // accent stripe
                break;
            }

            case 'shotgun': {
                box(WOOD, -18, -4, 14, 9, 3);       // stock
                box(DARK, -6, -5, 12, 10);          // receiver
                box(STEEL, 4, -7, 34, 14, 4);       // thick barrel
                box(DARK, 4, -7, 32, 3, 1);         // top rib
                box(WOOD, 12, -5, 14, 10, 3);       // pump
                ctx.fillStyle = DARK;               // pump grooves
                ctx.fillRect(15, -5, 2, 10);
                ctx.fillRect(21, -5, 2, 10);
                box(BLACK, 38, -8, 5, 16, 2);       // muzzle
                dot('#000', 40.5, 0, 3);            // bore
                dot(ACCENT, 34, -8.5, 1.6);         // bead sight
                guard(0, 5, 9, 5);
                break;
            }

            case 'harpoon': {
                box(DARK, 0, -5, 26, 10, 3);        // gun body
                box(ACCENT, 8, -6, 3, 12, 1);       // power bands
                box(ACCENT, 15, -6, 3, 12, 1);
                box(STEEL, 26, -1.5, 26, 3);        // spear shaft
                ctx.fillStyle = '#facc15';          // spear tip + barb
                ctx.beginPath();
                ctx.moveTo(52, -5); ctx.lineTo(62, 0); ctx.lineTo(52, 5);
                ctx.lineTo(55, 0);
                ctx.closePath(); ctx.fill();
                dot(DARK, 6, 9, 6);                 // line drum
                dot(ACCENT, 6, 9, 2.5);             // drum hub
                box(GRIP, 2, 5, 8, 11);             // grip
                guard(9, 5, 8, 5);
                break;
            }

            case 'launcher': {
                box(BLACK, -8, -8, 8, 16, 3);       // rear cap
                box('#7c2d12', -2, -10, 38, 20, 8); // fat tube
                box('#fbbf24', 4, -8, 4, 5, 1);      // hazard stripes
                box('#fbbf24', 4, 3, 4, 5, 1);
                box(DARK, 10, -14, 10, 4, 1);       // top sight
                box(BLACK, 34, -11, 8, 22, 4);      // muzzle ring
                dot('#7f1d1d', 38, 0, 5);           // bore
                dot('#ef4444', 38, 0, 2.5, 8);      // loaded glow
                box(GRIP, 12, 10, 8, 11);           // grip
                guard(19, 10, 8, 4);
                break;
            }

            case 'flame': {
                dot('#9a3412', 0, 0, 11);           // fuel tank
                dot(ACCENT, 0, 0, 4);               // gauge
                box('#c2410c', -4, -4, 18, 8, 3);   // tank body
                box(DARK, 14, -4, 20, 8, 3);        // gun body
                box('#fbbf24', 34, -3, 8, 6, 2);    // brass nozzle
                box(BLACK, 42, -2, 4, 4, 1);        // nozzle tip
                const fl = 3 + Math.abs(Math.sin(performance.now() / 90)) * 4;
                ctx.fillStyle = '#fde047';          // pilot flame
                ctx.beginPath();
                ctx.moveTo(46, -2); ctx.lineTo(46 + fl + 4, 0); ctx.lineTo(46, 2);
                ctx.closePath(); ctx.fill();
                box(GRIP, 18, 4, 8, 11);            // grip
                guard(25, 4, 7, 5);
                break;
            }

            case 'rail': {
                box(BLACK, -14, -2, 12, 5);         // stock
                box(DARK, -2, -4, 32, 9);           // base
                box(ACCENT, 28, -6, 24, 2.5, 1);    // twin rails
                box(ACCENT, 28, 3.5, 24, 2.5, 1);
                ctx.fillStyle = STEEL;              // insulators
                for (let i = 0; i < 4; i++) { ctx.fillRect(32 + i * 6, -6, 2.5, 12); }
                dot('#164e63', 8, 0, 8);            // power cell
                dot('#67e8f9', 8, 0, 4, 14);        // cell glow
                dot('#fff', 8, 0, 1.8);
                box(STEEL, 52, -5, 7, 3, 1);        // prongs
                box(STEEL, 52, 2, 7, 3, 1);
                box(GRIP, 2, 5, 8, 11);
                guard(9, 5, 8, 5);
                break;
            }

            case 'plasma': {
                dot('#164e63', -2, 0, 9);           // rear tank
                box('#155e75', 2, -7, 30, 14, 5);   // body
                box('#67e8f9', 6, -4, 15, 8, 3);    // cell window
                dot('#ecfeff', 13, 0, 3, 10);       // cell core
                ctx.strokeStyle = '#22d3ee';        // emitter rings
                ctx.lineWidth = 2.5;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath(); ctx.arc(26 + i * 5, 0, 6 - i, 0, Math.PI * 2); ctx.stroke();
                }
                dot('#a5f3fc', 42, 0, 5, 16);       // muzzle orb
                dot('#fff', 42, 0, 2);
                box(GRIP, 10, 7, 8, 11);
                break;
            }

            // NEW WEAPON TYPES
            case 'crossbow': {
                box(WOOD, -2, -2, 42, 5);           // tiller stock
                box(DARK, -2, -2, 42, 2, 1);        // rail groove shade
                ctx.strokeStyle = STEEL;            // bow limbs
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(34, 0); ctx.quadraticCurveTo(18, -16, 6, -18);
                ctx.moveTo(34, 0); ctx.quadraticCurveTo(18, 16, 6, 18);
                ctx.stroke();
                ctx.strokeStyle = '#fde047';        // string
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(6, -18); ctx.lineTo(30, 0); ctx.lineTo(6, 18);
                ctx.stroke();
                box(STEEL, 12, -1, 28, 2, 1);       // bolt shaft
                ctx.fillStyle = ACCENT;             // bolt tip + fletching
                ctx.beginPath();
                ctx.moveTo(40, -2.5); ctx.lineTo(46, 0); ctx.lineTo(40, 2.5);
                ctx.closePath(); ctx.fill();
                box(ACCENT, 12, -3.5, 5, 2, 1);
                ctx.strokeStyle = DARK;             // stirrup
                ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.arc(42, 0, 5, -1.2, 1.2); ctx.stroke();
                dot(DARK, 2, -6, 3.5);              // scope
                dot(ACCENT, 2, -6, 1.5);
                break;
            }

            case 'tesla': {
                box(DARK, -2, -6, 32, 13, 3);       // housing
                box(BLACK, -2, -6, 32, 4, 2);       // top shade
                for (let i = 0; i < 3; i++) {       // coil towers
                    const cx = 4 + i * 9;
                    box(STEEL, cx, -16, 4, 11, 1);
                    ctx.strokeStyle = ACCENT;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.arc(cx + 2, -11, 4, 0, Math.PI * 2); ctx.stroke();
                    dot('#bae6fd', cx + 2, -17, 2.5, 10);
                }
                ctx.strokeStyle = '#38bdf8';        // emitter dish
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(30, 0, 8, -1.1, 1.1); ctx.stroke();
                dot('#e0f2fe', 34, 0, 3, 12);       // dish core
                ctx.fillStyle = DARK;               // side vents
                for (let i = 0; i < 3; i++) ctx.fillRect(2, -2 + i * 3, 8, 1.5);
                box(GRIP, 8, 7, 8, 11);
                break;
            }

            case 'void': {
                box('#1e1b4b', -6, -7, 42, 14, 4);   // dark shroud
                ctx.strokeStyle = '#7c3aed';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.roundRect(-6, -7, 42, 14, 4); ctx.stroke();
                const vg = ctx.createRadialGradient(14, 0, 1, 14, 0, 13);
                vg.addColorStop(0, '#fdf4ff');
                vg.addColorStop(0.35, '#f472b6');
                vg.addColorStop(0.7, '#a855f7');
                vg.addColorStop(1, 'rgba(168,85,247,0)');
                ctx.fillStyle = vg;                 // collapsing core
                ctx.beginPath(); ctx.arc(14, 0, 13, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#1e1b4b';          // front prongs
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(34, i * 5 - 2);
                    ctx.lineTo(50, i * 2.5);
                    ctx.lineTo(34, i * 5 + 2);
                    ctx.closePath(); ctx.fill();
                }
                dot('#f0abfc', 50, 0, 2.5, 12);     // tip spark
                box(BLACK, -12, -2, 7, 5, 1);       // rear spike mount
                break;
            }

            case 'coral_launcher': {
                box('#0f766e', -2, -9, 36, 18, 7);   // mortar tube
                box('#115e59', -2, -9, 36, 5, 3);    // top shade
                ctx.fillStyle = '#14b8a6';          // coral branches
                for (let i = 0; i < 5; i++) {
                    const bx = 2 + i * 6;
                    ctx.beginPath();
                    ctx.moveTo(bx, -9);
                    ctx.quadraticCurveTo(bx - 3, -16, bx + 3, -10);
                    ctx.lineTo(bx + 5, -13); ctx.lineTo(bx + 3, -9);
                    ctx.closePath(); ctx.fill();
                }
                dot('#042f2e', 34, 0, 6);           // mouth
                dot('#5eead4', 34, 0, 3.5, 12);     // mouth glow
                dot('#14b8a6', 0, 4, 2);            // barnacles
                dot('#14b8a6', 24, 7, 1.6);
                box(WOOD, 8, 9, 8, 10);             // grip
                guard(15, 9, 7, 4);
                break;
            }

            case 'frost_bow': {
                box('#0c4a6e', -2, -2, 42, 5);      // tiller
                ctx.save();                         // ice limbs
                ctx.globalAlpha = 0.9;
                ctx.strokeStyle = '#7dd3fc';
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(36, 0); ctx.quadraticCurveTo(20, -18, 8, -20);
                ctx.moveTo(36, 0); ctx.quadraticCurveTo(20, 18, 8, 20);
                ctx.stroke();
                ctx.restore();
                ctx.fillStyle = '#e0f2fe';          // ice crystals
                for (let i = 0; i < 3; i++) {
                    const cx = 16 + i * 7;
                    const cy = i % 2 ? 11 : -11;
                    ctx.beginPath();
                    ctx.moveTo(cx - 3, cy > 0 ? 6 : -6);
                    ctx.lineTo(cx, cy);
                    ctx.lineTo(cx + 3, cy > 0 ? 6 : -6);
                    ctx.closePath(); ctx.fill();
                }
                ctx.strokeStyle = '#f0f9ff';        // string
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(8, -20); ctx.lineTo(32, 0); ctx.lineTo(8, 20);
                ctx.stroke();
                box('#bae6fd', 14, -1, 28, 2, 1);   // ice bolt
                dot('#fff', 43, 0, 2.5, 10);        // bolt tip
                dot(DARK, 0, -7, 3);                // snowflake sight
                dot('#e0f2fe', 0, -7, 1.4);
                break;
            }

            case 'magma_shotgun': {
                box(WOOD, -18, -4, 14, 9, 3);       // stock
                box('#7c2d12', -6, -6, 12, 12);      // receiver
                box('#9a3412', 2, -8, 34, 16, 5);    // heavy barrels
                box('#c2410c', 2, -8, 34, 4, 2);     // top heat shade
                for (let i = 0; i < 4; i++)         // heat vents
                    dot('#fb923c', 10 + i * 7, -4, 2.2, 8);
                box(WOOD, 10, -6, 14, 12, 3);       // pump
                box(BLACK, 36, -9, 6, 18, 3);       // muzzle
                const mg = 4 + Math.abs(Math.sin(performance.now() / 130)) * 3;
                dot('#f97316', 39, 0, mg, 14);      // molten core
                dot('#fde047', 39, 0, 2);
                guard(0, 6, 9, 5);
                break;
            }

            case 'sonic': {
                box(DARK, -2, -5, 30, 11, 3);       // body
                box(BLACK, -2, -5, 30, 3, 1);       // top shade
                box('#164e63', 2, -3, 8, 6, 1);      // power cells
                box('#164e63', 2, 3 - 3, 8, 3, 1);
                dot('#22d3ee', 6, 0, 1.6, 6);
                ctx.strokeStyle = '#22d3ee';        // resonance rings
                ctx.lineWidth = 2;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath(); ctx.arc(28, 0, 5 + i * 4, -1.1, 1.1); ctx.stroke();
                }
                dot('#a5f3fc', 30, 0, 3.5, 12);     // emitter core
                dot('#fff', 30, 0, 1.5);
                box(GRIP, 4, 6, 8, 11);             // grip
                guard(11, 6, 7, 4);
                box(ACCENT, -2, 1, 30, 2, 1);       // accent stripe
                break;
            }

            default: {
                ctx.fillStyle = STEEL; ctx.fillRect(8, -3, 24, 6);
                ctx.fillStyle = DARK;  ctx.fillRect(8, -3, 24, 2);
            }
        }

        const flash = p.muzzleFlash || 0;
        if (flash > 0) {
            const barrelLen = ({
                pistol: 30, smg: 34, rifle: 40, shotgun: 44,
                harpoon: 54, launcher: 48, flame: 40,
                rail: 54, plasma: 44,
                crossbow: 46, tesla: 38, void: 56,
                coral_launcher: 50, frost_bow: 46, magma_shotgun: 52, sonic: 34
            })[w.type] || 34;

            ctx.save();
            ctx.globalAlpha = Math.min(1, flash);
            const grad = ctx.createRadialGradient(barrelLen, 0, 0, barrelLen, 0, 18);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(0.4, 'rgba(251,191,36,0.8)');
            grad.addColorStop(1, 'rgba(251,191,36,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(barrelLen, 0, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(barrelLen, 0);
                ctx.lineTo(barrelLen + Math.cos(a) * 20, Math.sin(a) * 20);
                ctx.stroke();
            }
            ctx.restore();
        }
    },

    // Shop snapshot: render the ACTUAL gun model (procedural or custom PNG
    // skin) to an offscreen canvas and return a dataURL <img> source, so
    // buyers see what they're buying. Cached per weapon+skin-revision.
    // The render is auto-trimmed to its opaque pixels, then scaled to FILL
    // the box and centered — small pistols and long harpoons alike land
    // dead-center at maximum size instead of rattling in a corner.
    _gunPreviewRev: 0,
    _gunPreviewCache: {},
    gunPreview(w, gunSkins, holder) {
        if (!w) return null;
        const skinId = w.skin || w.id;
        const custom = !!(typeof GunSkinLoader !== 'undefined' &&
            gunSkins && gunSkins[w.id] !== 'classic' && w.skin !== false &&
            GunSkinLoader.get(skinId));
        const key = w.id + (custom ? ':c' : ':p') + ':r' + this._gunPreviewRev;
        if (this._gunPreviewCache[key]) return this._gunPreviewCache[key];
        try {
            const W = 132, H = 64, PAD = 5;
            // 1. Rough render onto scratch (generous margins).
            const tmp = document.createElement('canvas');
            tmp.width = 176; tmp.height = 96;
            const t = tmp.getContext('2d');
            t.save();
            t.translate(40, 48);
            this.drawGun(t, { weaponRecoil: 0, gunSkins: gunSkins || {}, muzzleFlash: 0 }, w, holder);
            t.restore();
            // 2. Trim to opaque bbox.
            const px = t.getImageData(0, 0, tmp.width, tmp.height).data;
            let x0 = tmp.width, y0 = tmp.height, x1 = -1, y1 = -1;
            for (let y = 0; y < tmp.height; y++) {
                for (let x = 0; x < tmp.width; x++) {
                    if (px[(y * tmp.width + x) * 4 + 3] > 8) {
                        if (x < x0) x0 = x;
                        if (x > x1) x1 = x;
                        if (y < y0) y0 = y;
                        if (y > y1) y1 = y;
                    }
                }
            }
            if (x1 < x0 || y1 < y0) return null; // nothing drawn
            const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            // 3. Refit: scale to fill (with padding), centered.
            const sc = Math.min((W - PAD * 2) / bw, (H - PAD * 2) / bh);
            const dw = Math.max(1, Math.round(bw * sc));
            const dh = Math.max(1, Math.round(bh * sc));
            const cv = document.createElement('canvas');
            cv.width = W; cv.height = H;
            const c = cv.getContext('2d');
            c.imageSmoothingEnabled = true;
            c.drawImage(tmp, x0, y0, bw, bh,
                Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
            const url = cv.toDataURL('image/png');
            // Bound the cache (weapons x2 variants is small, but be safe).
            const keys = Object.keys(this._gunPreviewCache);
            if (keys.length > 120) this._gunPreviewCache = {};
            this._gunPreviewCache[key] = url;
            return url;
        } catch (e) { return null; }
    },

    drawParticles(state, ctx) {
        if (!state.particles) return;
        state.particles.forEach(pt => {
            ctx.globalAlpha = Math.max(0, pt.life / 0.5);
            if (pt.glow) {
                ctx.shadowColor = pt.color;
                ctx.shadowBlur = 10;
            }
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size || 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
        ctx.globalAlpha = 1;
    },

    drawFloatingTexts(state, ctx) {
        if (!state.floatingTexts) return;
        state.floatingTexts.forEach(t => {
            ctx.globalAlpha = Math.min(1, t.life);
            ctx.font = 'bold 15px Work Sans';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, t.x, t.y);
        });
        ctx.globalAlpha = 1;
    },

    drawCrosshair(state, ctx) {
        const cx = state.mouse.x, cy = state.mouse.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 6, cy);
        ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 18, cy);
        ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 6);
        ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 18);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    },

    // ============================================================
    //  FISH MODEL DISPATCH
    // ============================================================
    drawFishModel(ctx, x, y, size, species, opts = {}) {
        const { angle = 0, isRaging = false, isInflated = false, glow = 0 } = opts;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const s = size * (isInflated ? 1.4 : 1);
        const col = species.color;
        const acc = species.accent;
        this._cur = species;

        if (glow > 0) {
            ctx.shadowColor = col;
            ctx.shadowBlur = 20 * glow;
        }

        // Custom art is OPT-IN only: player upload (by species id) wins,
        // then explicit species.image. Everything else is procedural —
        // no network request, no 404.
        if (typeof FishImageLoader !== 'undefined') {
            const customImg = FishImageLoader.get(species.id);
            const imgId = customImg ? species.id
                : (typeof species.image === 'string' && species.image.length > 0 ? species.image : null);
            const img = imgId ? (customImg || FishImageLoader.get(imgId)) : null;
            if (img && img.complete && img.naturalWidth > 0) {
                // Contain (never stretch): any shape — square, 1900x800,
                // portrait — fits inside the s*2.5 box keeping its pixels.
                const iw = img.naturalWidth, ih = img.naturalHeight;
                const k = (s * 2.5) / Math.max(iw, ih);
                ctx.drawImage(img, -iw * k / 2, -ih * k / 2, iw * k, ih * k);
                // Shiny aura still applies on top of custom art
                if (species.shiny) {
                    ctx.strokeStyle = '#fde047';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#fde047';
                    ctx.shadowBlur = 22;
                    ctx.beginPath();
                    ctx.arc(0, 0, s * 1.35, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
                ctx.restore();
                return;
            }
        }

        switch (species.shape) {
            // Existing shapes
            case 'manta':      this._drawManta(ctx, s, col, acc); break;
            case 'ray':        this._drawRay(ctx, s, col, acc); break;
            case 'swordfish':  this._drawSwordfish(ctx, s, col, acc); break;
            case 'jellyfish':  this._drawJellyfish(ctx, s, col, acc); break;
            case 'angler':     this._drawAngler(ctx, s, col, acc); break;
            case 'hammerhead': this._drawHammerhead(ctx, s, col, acc); break;
            case 'eel':        this._drawEel(ctx, s, col, acc); break;
            case 'puffer':     this._drawPuffer(ctx, s, col, acc, isInflated); break;
            case 'shark':      this._drawShark(ctx, s, col, acc); break;
            case 'kraken':     this._drawKraken(ctx, s, col, acc); break;
            case 'koi':        this._drawKoi(ctx, s, col, acc); break;
            case 'spiky':      this._drawSpiky(ctx, s, col, acc); break;
            case 'crab':       this._drawCrab(ctx, s, col, acc); break;
            case 'turtle':     this._drawTurtle(ctx, s, col, acc); break;
            case 'dragon':     this._drawDragon(ctx, s, col, acc); break;

            // NEW SHAPES for expanded roster
            case 'tuna':       this._drawTuna(ctx, s, col, acc); break;
            case 'marlin':     this._drawMarlin(ctx, s, col, acc); break;
            case 'snapper':    this._drawSnapper(ctx, s, col, acc); break;
            case 'grouper':    this._drawGrouper(ctx, s, col, acc); break;
            case 'flatfish':   this._drawFlatfish(ctx, s, col, acc); break;
            case 'catfish':    this._drawCatfish(ctx, s, col, acc); break;
            case 'sturgeon':   this._drawSturgeon(ctx, s, col, acc); break;
            case 'oarfish':    this._drawOarfish(ctx, s, col, acc); break;
            case 'squid':      this._drawSquid(ctx, s, col, acc); break;
            case 'prehistoric': this._drawPrehistoric(ctx, s, col, acc); break;
            case 'leviathan':  this._drawLeviathan(ctx, s, col, acc); break;
            case 'serpent':    this._drawSerpent(ctx, s, col, acc); break;
            case 'titan':      this._drawTitan(ctx, s, col, acc); break;
            case 'bass':       this._drawBass(ctx, s, col, acc); break;
            case 'trout':      this._drawTrout(ctx, s, col, acc); break;
            case 'salmon':     this._drawSalmon(ctx, s, col, acc); break;
            case 'pike':       this._drawPike(ctx, s, col, acc); break;
            case 'carp':       this._drawCarp(ctx, s, col, acc); break;
            case 'wrasse':     this._drawWrasse(ctx, s, col, acc); break;
            case 'butterfly':  this._drawButterfly(ctx, s, col, acc); break;
            case 'angelfish':  this._drawAngelfish(ctx, s, col, acc); break;
            case 'clownfish':  this._drawClownfish(ctx, s, col, acc); break;
            case 'seahorse':   this._drawSeahorse(ctx, s, col, acc); break;
            case 'lionfish':   this._drawLionfish(ctx, s, col, acc); break;
            case 'stonefish':  this._drawStonefish(ctx, s, col, acc); break;
            case 'frogfish':   this._drawFrogfish(ctx, s, col, acc); break;
            case 'anchovy':    this._drawAnchovy(ctx, s, col, acc); break;
            case 'minnow':     this._drawMinnow(ctx, s, col, acc); break;
            case 'goldfish':   this._drawGoldfish(ctx, s, col, acc); break;

            case 'oval':
            default:           this._drawOval(ctx, s, col, acc); break;
        }

        // Per-catch variation: random dot pattern clipped to the body core
        if (species.pattern && species.pattern.dots && species.pattern.dots.length) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(0, 0, s * 0.95, s * 0.6, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = acc;
            ctx.globalAlpha = 0.55;
            for (const d of species.pattern.dots) {
                ctx.beginPath();
                ctx.arc(d.dx * s, d.dy * s, Math.max(1.5, d.r * s), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Shiny: gold aura + orbiting sparkles, worth 3x
        if (species.shiny) {
            const t = performance.now() / 300;
            ctx.save();
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#fde047';
            ctx.shadowBlur = 22;
            ctx.beginPath();
            ctx.arc(0, 0, s * 1.35, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fef9c3';
            for (let i = 0; i < 3; i++) {
                const a = t + (i / 3) * Math.PI * 2;
                const px = Math.cos(a) * s * 1.35;
                const py = Math.sin(a) * s * 1.35;
                const r = 2 + Math.abs(Math.sin(t * 2 + i)) * 2;
                ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        if (isRaging) {
            ctx.strokeStyle = `rgba(239,68,68,${0.4 + Math.sin(performance.now() / 100) * 0.3})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, s * 1.4, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    },

    // ============================================================
    //  EXISTING SHAPE DRAWERS
    // ============================================================
    _drawRay(ctx, s, col, acc) {
        const t = performance.now() / 400;
        const flap = 1 + Math.sin(t * 3) * 0.12;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.15, 0);
        ctx.quadraticCurveTo(s * 0.6,  -s * 0.7 * flap, -s * 0.1, -s * 1.5 * flap);
        ctx.quadraticCurveTo(-s * 0.6, -s * 0.9 * flap, -s * 1.3, -s * 0.3 * flap);
        ctx.quadraticCurveTo(-s * 1.0,  0,              -s * 1.3,  s * 0.3 * flap);
        ctx.quadraticCurveTo(-s * 0.6,  s * 0.9 * flap, -s * 0.1,  s * 1.5 * flap);
        ctx.quadraticCurveTo(s * 0.6,   s * 0.7 * flap,  s * 1.15, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 6; i++) {
            const px = (Math.random() - 0.5) * s * 1.2;
            const py = (Math.random() - 0.5) * s * 0.9;
            ctx.beginPath();
            ctx.arc(px, py, s * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.28, s * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.55,  s * 0.28, s * 0.09, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.beginPath();
        ctx.moveTo(-s * 1.3, 0);
        ctx.quadraticCurveTo(-s * 2.2, Math.sin(t * 5) * s * 0.35, -s * 3.2, Math.sin(t * 5 + 1) * s * 0.15);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 2.1, Math.sin(t * 5) * s * 0.32);
        ctx.lineTo(-s * 2.35, Math.sin(t * 5) * s * 0.32 - s * 0.15);
        ctx.lineTo(-s * 2.25, Math.sin(t * 5) * s * 0.32);
        ctx.closePath();
        ctx.fill();
    },

    _drawManta(ctx, s, col, acc) {
        const t = performance.now() / 500;
        const flap = 1 + Math.sin(t * 2.4) * 0.18;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.3, 0);
        ctx.quadraticCurveTo(s * 0.4, -s * 0.9 * flap, -s * 0.3, -s * 1.9 * flap);
        ctx.quadraticCurveTo(-s * 1.0, -s * 1.0 * flap, -s * 1.4, -s * 0.25 * flap);
        ctx.quadraticCurveTo(-s * 0.9, 0, -s * 1.4, s * 0.25 * flap);
        ctx.quadraticCurveTo(-s * 1.0, s * 1.0 * flap, -s * 0.3, s * 1.9 * flap);
        ctx.quadraticCurveTo(s * 0.4, s * 0.9 * flap, s * 1.3, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.2, 0, s * 0.8, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.1, -s * 0.15);
        ctx.quadraticCurveTo(s * 1.9, -s * 0.45, s * 1.65, -s * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 1.1, s * 0.15);
        ctx.quadraticCurveTo(s * 1.9, s * 0.45, s * 1.65, s * 0.05);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(s * 0.9, -s * 0.32, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.9,  s * 0.32, s * 0.1, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.beginPath();
        ctx.moveTo(-s * 1.3, 0);
        ctx.quadraticCurveTo(-s * 2.2, Math.sin(t * 4) * s * 0.2, -s * 3.0, 0);
        ctx.stroke();
    },

    _drawSwordfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(-s * 0.2, 0, s * 1.3, s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.8, -s * 0.05);
        ctx.lineTo(s * 2.5, 0);
        ctx.lineTo(s * 0.8, s * 0.05);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 0.45);
        ctx.quadraticCurveTo(-s * 0.2, -s * 1.5, -s * 0.6, -s * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0);
        ctx.lineTo(-s * 2.1, -s * 0.9);
        ctx.lineTo(-s * 1.7, 0);
        ctx.lineTo(-s * 2.1, s * 0.9);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.1, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.53, -s * 0.1, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    _drawJellyfish(ctx, s, col, acc) {
        const t = performance.now() / 300;
        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1, s * 0.12);
        ctx.lineCap = 'round';
        for (let i = -3; i <= 3; i++) {
            const offsetX = i * (s * 0.22);
            ctx.beginPath();
            ctx.moveTo(-s * 0.2 + offsetX, 0);
            ctx.quadraticCurveTo(
                -s * 0.8 + offsetX + Math.sin(t + i) * s * 0.3,
                s * 0.5 * (i % 2 === 0 ? 1 : -1),
                -s * 1.8 + offsetX + Math.cos(t + i) * s * 0.4,
                0
            );
            ctx.stroke();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(s * 0.2, 0, s * 0.8, -Math.PI / 2, Math.PI / 2, true);
        ctx.quadraticCurveTo(-s * 0.1, 0, s * 0.2, -s * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.2, 0, s * 0.2, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    _drawAngler(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.1, s * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(s * 0.3, s * 0.1, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(s * 0.1 + i * s * 0.12, s * 0.35);
            ctx.lineTo(s * 0.16 + i * s * 0.12, s * 0.1);
            ctx.lineTo(s * 0.22 + i * s * 0.12, s * 0.35);
            ctx.closePath();
            ctx.fill();
        }

        ctx.strokeStyle = acc;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.8);
        ctx.quadraticCurveTo(s * 0.8, -s * 1.6, s * 1.2, -s * 0.5);
        ctx.stroke();

        ctx.shadowColor = acc;
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s * 1.2, -s * 0.5, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.4, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.22, -s * 0.4, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    _drawHammerhead(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(-s * 0.2, 0, s * 1.4, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.roundRect(s * 0.8, -s * 1.1, s * 0.4, s * 2.2, s * 0.1);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.55);
        ctx.lineTo(s * 0.3, -s * 1.3);
        ctx.lineTo(s * 0.5, -s * 0.55);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.5, 0);
        ctx.lineTo(-s * 2.2, -s * 0.8);
        ctx.lineTo(-s * 1.8, 0);
        ctx.lineTo(-s * 2.2, s * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.0, -s * 1.0, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 1.0, s * 1.0, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.03, -s * 1.0, s * 0.05, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 1.03, s * 1.0, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    _drawOval(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.2, s * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, -s * 0.65); ctx.lineTo(s * 0.1, -s * 1.1); ctx.lineTo(s * 0.4, -s * 0.6);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0); ctx.lineTo(-s * 1.7, -s * 0.55); ctx.lineTo(-s * 1.7, s * 0.55);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.65, -s * 0.15, s * 0.17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    _drawSpiky(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.2, s * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(i * s * 0.35, -s * 0.6);
            ctx.lineTo(i * s * 0.35 + s * 0.1, -s * 1.1);
            ctx.lineTo(i * s * 0.35 + s * 0.2, -s * 0.6);
            ctx.closePath(); ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0); ctx.lineTo(-s * 1.8, -s * 0.7); ctx.lineTo(-s * 1.8, s * 0.7);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.15, s * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.65, -s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    _drawEel(ctx, s, col, acc) {
        // Long snake-like body: wavy segments + pointed head + dorsal spikes
        const t = performance.now() / 350;
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(4, s * 0.55);
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
            const px = s * 1.6 - i * s * 0.42;
            const py = Math.sin(t + i * 0.8) * s * 0.28;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        // Belly highlight
        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.22);
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
            const px = s * 1.6 - i * s * 0.42;
            const py = Math.sin(t + i * 0.8) * s * 0.28 + s * 0.14;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        // Dorsal spikes
        ctx.fillStyle = acc;
        for (let i = 1; i <= 5; i++) {
            const px = s * 1.6 - i * s * 0.55;
            const py = Math.sin(t + i * 0.8) * s * 0.28 - s * 0.35;
            ctx.beginPath();
            ctx.moveTo(px - s * 0.12, py + s * 0.2);
            ctx.lineTo(px, py - s * 0.15);
            ctx.lineTo(px + s * 0.12, py + s * 0.2);
            ctx.closePath(); ctx.fill();
        }
        // Head
        const hy = Math.sin(t) * s * 0.28;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(s * 1.7, hy, s * 0.5, s * 0.34, 0, 0, Math.PI * 2); ctx.fill();
        // Forked tongue
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.beginPath();
        ctx.moveTo(s * 2.15, hy);
        ctx.lineTo(s * 2.5, hy - s * 0.1);
        ctx.moveTo(s * 2.15, hy);
        ctx.lineTo(s * 2.5, hy + s * 0.1);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 1.8, hy - s * 0.14, s * 0.11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.82, hy - s * 0.14, s * 0.055, 0, Math.PI * 2); ctx.fill();
    },

    _drawPuffer(ctx, s, col, acc, isInflated) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
        if (isInflated) {
            ctx.fillStyle = acc;
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.9);
                ctx.lineTo(Math.cos(a) * s * 1.4, Math.sin(a) * s * 1.4);
                ctx.lineTo(Math.cos(a + 0.3) * s * 0.9, Math.sin(a + 0.3) * s * 0.9);
                ctx.closePath(); ctx.fill();
            }
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.3, s * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.9, 0); ctx.lineTo(-s * 1.5, -s * 0.5); ctx.lineTo(-s * 1.5, s * 0.5);
        ctx.closePath(); ctx.fill();
    },

    _drawShark(ctx, s, col, acc) {
        // Pointed snout, gill slits, pectoral fins, tall heterocercal tail.
        // Reads apart from the tuna silhouette on purpose.
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.9, 0);                       // nose tip
        ctx.quadraticCurveTo(s * 1.0, -s * 0.75, -s * 0.6, -s * 0.62);
        ctx.quadraticCurveTo(-s * 1.3, -s * 0.5, -s * 1.5, 0);
        ctx.quadraticCurveTo(-s * 1.3, s * 0.5, -s * 0.6, s * 0.62);
        ctx.quadraticCurveTo(s * 1.0, s * 0.75, s * 1.9, 0);
        ctx.closePath();
        ctx.fill();
        // Pale belly
        ctx.fillStyle = 'rgba(241,245,249,0.85)';
        ctx.beginPath();
        ctx.moveTo(s * 1.8, s * 0.08);
        ctx.quadraticCurveTo(s * 0.6, s * 0.6, -s * 0.8, s * 0.45);
        ctx.quadraticCurveTo(s * 0.4, s * 0.3, s * 1.8, s * 0.08);
        ctx.closePath();
        ctx.fill();
        // Gill slits
        ctx.strokeStyle = 'rgba(15,23,42,0.7)';
        ctx.lineWidth = Math.max(1.5, s * 0.05);
        for (let i = 0; i < 3; i++) {
            const gx = s * (0.75 - i * 0.16);
            ctx.beginPath();
            ctx.moveTo(gx, -s * 0.42);
            ctx.quadraticCurveTo(gx - s * 0.08, 0, gx, s * 0.42);
            ctx.stroke();
        }
        // Dorsal fin
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.55);
        ctx.lineTo(s * 0.35, -s * 1.5);
        ctx.lineTo(s * 0.6, -s * 0.55);
        ctx.closePath(); ctx.fill();
        // Pectoral fins (shark-only trait)
        ctx.beginPath();
        ctx.moveTo(s * 0.5, s * 0.35);
        ctx.lineTo(s * 0.1, s * 1.15);
        ctx.lineTo(s * 0.75, s * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.5, -s * 0.35);
        ctx.lineTo(s * 0.1, -s * 1.15);
        ctx.lineTo(s * 0.75, -s * 0.5);
        ctx.closePath(); ctx.fill();
        // Heterocercal tail: big upper lobe
        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0);
        ctx.lineTo(-s * 2.0, -s * 1.3);
        ctx.lineTo(-s * 1.75, -s * 0.15);
        ctx.lineTo(-s * 2.0, s * 0.55);
        ctx.lineTo(-s * 1.6, s * 0.1);
        ctx.closePath(); ctx.fill();
        // Tiger stripes
        if (this._cur && this._cur.tigerStripes) {
            ctx.strokeStyle = 'rgba(10,10,12,0.75)';
            ctx.lineWidth = Math.max(2, s * 0.09);
            for (let i = 0; i < 5; i++) {
                const bx = s * (0.5 - i * 0.32);
                ctx.beginPath();
                ctx.moveTo(bx, -s * 0.6);
                ctx.quadraticCurveTo(bx - s * 0.12, 0, bx, s * 0.6);
                ctx.stroke();
            }
        }
        // Angry eye + toothy grin
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.25, -s * 0.18, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.3, -s * 0.18, s * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.beginPath();
        ctx.moveTo(s * 1.35, s * 0.22);
        ctx.quadraticCurveTo(s * 1.0, s * 0.34, s * 0.7, s * 0.26);
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        for (let i = 0; i < 3; i++) {
            const tx = s * (1.25 - i * 0.15);
            ctx.beginPath();
            ctx.moveTo(tx, s * 0.27);
            ctx.lineTo(tx - s * 0.04, s * 0.36);
            ctx.lineTo(tx + s * 0.04, s * 0.36);
            ctx.closePath(); ctx.fill();
        }
    },

    _drawKraken(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(-s * 0.3, 0, s * 1.1, s * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = s * 0.22;
        ctx.lineCap = 'round';
        const t = performance.now() / 400;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const wave = Math.sin(t + i) * s * 0.3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
            ctx.quadraticCurveTo(
                Math.cos(a) * s * 1.8 + wave,
                Math.sin(a) * s * 1.8 + wave,
                Math.cos(a) * s * 2.5,
                Math.sin(a) * s * 2.5
            );
            ctx.stroke();
        }

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.3, s * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.35, s * 0.3, s * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.42, s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },

    _drawKoi(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.3, s * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.3, -s * 1.5, s * 0.6, -s * 0.4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, s * 0.5); ctx.quadraticCurveTo(s * 0.3, s * 1.5, s * 0.6, s * 0.4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 1.2, 0);
        ctx.quadraticCurveTo(-s * 2.2, -s * 1, -s * 1.8, 0);
        ctx.quadraticCurveTo(-s * 2.2, s * 1, -s * 1.2, 0);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.15, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },

    _drawCrab(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.1, s * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.14);
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            const off = -s * 0.4 + i * s * 0.3;
            ctx.beginPath();
            ctx.moveTo(-s * 0.6, off);
            ctx.lineTo(-s * 1.4, off - s * 0.3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(s * 0.6, off);
            ctx.lineTo(s * 1.4, off - s * 0.3);
            ctx.stroke();
        }

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.arc(-s * 1.2, -s * 0.9, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 1.2, -s * 0.9, s * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = col;
        ctx.fillRect(-s * 0.3, -s * 1.0, s * 0.1, s * 0.4);
        ctx.fillRect(s * 0.2, -s * 1.0, s * 0.1, s * 0.4);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-s * 0.25, -s * 1.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.25, -s * 1.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-s * 0.25, -s * 1.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.25, -s * 1.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    _drawTurtle(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            const px = Math.cos(a) * s * 1.1;
            const py = Math.sin(a) * s * 1.0;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.8);
        }
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.9, -s * 0.7, s * 0.4, s * 0.18, Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(s * 0.9, s * 0.7, s * 0.4, s * 0.18, -Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.9, -s * 0.7, s * 0.35, s * 0.15, -Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.9, s * 0.7, s * 0.35, s * 0.15, Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(s * 1.3, 0, s * 0.35, s * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.4, -s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.42, -s * 0.08, s * 0.05, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 1.0, 0);
        ctx.lineTo(-s * 1.4, -s * 0.15);
        ctx.lineTo(-s * 1.4, s * 0.15);
        ctx.closePath();
        ctx.fill();
    },

    _drawDragon(ctx, s, col, acc) {
        const t = performance.now() / 400;
        const wingY = Math.sin(t * 2) * s * 0.15;

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.4, -s * 0.3);
        ctx.lineTo(s * 0.2, -s * 1.8 + wingY);
        ctx.lineTo(-s * 0.6, -s * 0.8 + wingY);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.4, s * 0.3);
        ctx.lineTo(s * 0.2, s * 1.8 - wingY);
        ctx.lineTo(-s * 0.6, s * 0.8 - wingY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.6, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(s * 1.5, 0, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 1.9, 0);
        ctx.lineTo(s * 2.5, -s * 0.15);
        ctx.lineTo(s * 2.5, s * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, -s * 0.4);
        ctx.lineTo(s * 1.4, -s * 1.0);
        ctx.lineTo(s * 1.5, -s * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 1.2, s * 0.4);
        ctx.lineTo(s * 1.4, s * 1.0);
        ctx.lineTo(s * 1.5, s * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 1.55, -s * 0.15, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.58, -s * 0.15, s * 0.05, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-s * 1.5, 0);
        ctx.quadraticCurveTo(-s * 2.3, Math.sin(t * 3) * s * 0.4, -s * 2.8, Math.sin(t * 3 + 1) * s * 0.2);
        ctx.lineTo(-s * 2.6, s * 0.15);
        ctx.quadraticCurveTo(-s * 2.2, Math.sin(t * 3) * s * 0.4, -s * 1.5, s * 0.15);
        ctx.closePath();
        ctx.fill();
    },

    // ============================================================
    //  NEW SHAPE DRAWERS — EXPANDED ROSTER
    // ============================================================

    // --- TUNA (torpedo body, crescent tail, racing stripes) ---
    _drawTuna(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.6, 0);
        ctx.quadraticCurveTo(s * 0.8, -s * 0.85, -s * 0.3, -s * 0.7);
        ctx.quadraticCurveTo(-s * 1.2, -s * 0.5, -s * 1.5, 0);
        ctx.quadraticCurveTo(-s * 1.2, s * 0.5, -s * 0.3, s * 0.7);
        ctx.quadraticCurveTo(s * 0.8, s * 0.85, s * 1.6, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, -s * 0.2);
        ctx.quadraticCurveTo(0, -s * 0.75, -s * 1.3, -s * 0.15);
        ctx.quadraticCurveTo(0, -s * 0.55, s * 1.2, -s * 0.2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0);
        ctx.quadraticCurveTo(-s * 2.2, -s * 1.1, -s * 2.6, -s * 0.9);
        ctx.quadraticCurveTo(-s * 2.0, -s * 0.2, -s * 1.8, 0);
        ctx.quadraticCurveTo(-s * 2.0, s * 0.2, -s * 2.6, s * 0.9);
        ctx.quadraticCurveTo(-s * 2.2, s * 1.1, -s * 1.4, 0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.3, s * 0.2);
        ctx.lineTo(s * 0.5, s * 0.95);
        ctx.lineTo(s * 0.9, s * 0.3);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.3, -s * 0.6);
        ctx.lineTo(s * 0.1, -s * 1.1);
        ctx.lineTo(s * 0.5, -s * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.0, -s * 0.15, s * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.05, -s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();

        // Finlets: the unmistakable tuna trait (sharks don't have these)
        ctx.fillStyle = acc;
        for (let i = 0; i < 4; i++) {
            const fx = -s * 0.55 - i * s * 0.22;
            const fh = s * (0.22 - i * 0.03);
            ctx.beginPath();
            ctx.moveTo(fx, -s * 0.62);
            ctx.lineTo(fx - s * 0.08, -s * 0.62 - fh);
            ctx.lineTo(fx - s * 0.16, -s * 0.62);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(fx, s * 0.62);
            ctx.lineTo(fx - s * 0.08, s * 0.62 + fh);
            ctx.lineTo(fx - s * 0.16, s * 0.62);
            ctx.closePath(); ctx.fill();
        }
    },

    // --- MARLIN (long bill, high dorsal sail) ---
    _drawMarlin(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.4, s * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, -s * 0.06);
        ctx.lineTo(s * 3.0, 0);
        ctx.lineTo(s * 1.2, s * 0.06);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.6, -s * 0.5);
        ctx.quadraticCurveTo(s * 0.0, -s * 1.9, -s * 0.6, -s * 0.5);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0);
        ctx.quadraticCurveTo(-s * 2.2, -s * 1.0, -s * 2.7, -s * 0.8);
        ctx.quadraticCurveTo(-s * 2.0, 0, -s * 2.7, s * 0.8);
        ctx.quadraticCurveTo(-s * 2.2, s * 1.0, -s * 1.4, 0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.4, s * 0.3);
        ctx.lineTo(s * 0.6, s * 1.0);
        ctx.lineTo(s * 1.0, s * 0.3);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.8, -s * 0.12, s * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.83, -s * 0.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    // --- SNAPPER (deep-bodied, big eye, forked tail) ---
    _drawSnapper(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.1, 0);
        ctx.quadraticCurveTo(s * 0.7, -s * 0.95, -s * 0.3, -s * 0.9);
        ctx.quadraticCurveTo(-s * 1.1, -s * 0.6, -s * 1.2, 0);
        ctx.quadraticCurveTo(-s * 1.1, s * 0.6, -s * 0.3, s * 0.9);
        ctx.quadraticCurveTo(s * 0.7, s * 0.95, s * 1.1, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.4, -s * 0.8);
        ctx.quadraticCurveTo(-s * 0.1, -s * 1.5, -s * 0.6, -s * 0.75);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0);
        ctx.lineTo(-s * 1.9, -s * 0.85);
        ctx.lineTo(-s * 1.6, 0);
        ctx.lineTo(-s * 1.9, s * 0.85);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.4, s * 0.75);
        ctx.quadraticCurveTo(-s * 0.6, s * 1.3, -s * 0.9, s * 0.65);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.65, -s * 0.2, s * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.68, -s * 0.2, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },

    // --- GROUPER (massive mouth, bulky body) ---
    _drawGrouper(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.3, s * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.1);
        ctx.beginPath();
        ctx.moveTo(s * 0.2, s * 0.25);
        ctx.quadraticCurveTo(s * 0.85, s * 0.35, s * 1.15, s * 0.15);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.3, -s * 0.85);
        ctx.quadraticCurveTo(0, -s * 1.6, -s * 0.5, -s * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(-s * 1.45, 0, s * 0.4, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(s * 0.5, s * 0.5, s * 0.35, s * 0.5, Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.3, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.72, -s * 0.3, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    // --- FLATFISH (flat, both eyes on one side, wavy margin) ---
    _drawFlatfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.3, 0);
        ctx.quadraticCurveTo(s * 0.8, -s * 1.1, -s * 0.2, -s * 0.95);
        ctx.quadraticCurveTo(-s * 1.0, -s * 0.6, -s * 1.3, 0);
        ctx.quadraticCurveTo(-s * 1.0, s * 0.6, -s * 0.2, s * 0.95);
        ctx.quadraticCurveTo(s * 0.8, s * 1.1, s * 1.3, 0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const r = s * 1.05 + Math.sin(i * 2) * s * 0.08;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.35, s * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.3, s * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.35, s * 0.07, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.3, s * 0.07, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 1.2, 0);
        ctx.lineTo(-s * 1.6, -s * 0.4);
        ctx.lineTo(-s * 1.6, s * 0.4);
        ctx.closePath();
        ctx.fill();
    },

    // --- CATFISH (whiskers, flat head, long body) ---
    _drawCatfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.3, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(s * 0.9, 0, s * 0.6, s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * 1.3, -s * 0.2);
        ctx.quadraticCurveTo(s * 2.0, -s * 0.6, s * 2.3, -s * 0.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 1.3, -s * 0.1);
        ctx.quadraticCurveTo(s * 1.9, -s * 0.2, s * 2.2, s * 0.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 1.3, s * 0.2);
        ctx.quadraticCurveTo(s * 1.9, s * 0.5, s * 2.1, s * 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 1.3, s * 0.3);
        ctx.quadraticCurveTo(s * 1.7, s * 0.7, s * 1.9, s * 0.9);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.3, -s * 0.55);
        ctx.quadraticCurveTo(0, -s * 1.2, -s * 0.4, -s * 0.5);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.2, 0);
        ctx.lineTo(-s * 2.0, -s * 0.7);
        ctx.lineTo(-s * 1.7, 0);
        ctx.lineTo(-s * 2.0, s * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.0, -s * 0.2, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.02, -s * 0.2, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    // --- STURGEON (armored scutes, long snout, ancient) ---
    _drawSturgeon(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.6, 0);
        ctx.quadraticCurveTo(s * 0.8, -s * 0.65, -s * 0.5, -s * 0.6);
        ctx.quadraticCurveTo(-s * 1.3, -s * 0.4, -s * 1.5, 0);
        ctx.quadraticCurveTo(-s * 1.3, s * 0.4, -s * 0.5, s * 0.6);
        ctx.quadraticCurveTo(s * 0.8, s * 0.65, s * 1.6, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 5; i++) {
            const px = -s * 0.9 + i * s * 0.45;
            ctx.beginPath();
            ctx.moveTo(px, -s * 0.55);
            ctx.lineTo(px + s * 0.15, -s * 0.75);
            ctx.lineTo(px + s * 0.3, -s * 0.55);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.4, -s * 0.15);
        ctx.lineTo(s * 2.4, 0);
        ctx.lineTo(s * 1.4, s * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1, s * 0.04);
        ctx.beginPath();
        ctx.moveTo(s * 1.5, s * 0.1);
        ctx.quadraticCurveTo(s * 1.9, s * 0.3, s * 2.0, s * 0.5);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0);
        ctx.quadraticCurveTo(-s * 2.0, -s * 1.0, -s * 2.4, -s * 0.8);
        ctx.quadraticCurveTo(-s * 1.9, -s * 0.2, -s * 1.8, 0);
        ctx.quadraticCurveTo(-s * 2.0, s * 0.5, -s * 2.2, s * 0.7);
        ctx.quadraticCurveTo(-s * 1.8, s * 0.4, -s * 1.4, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.0, -s * 0.15, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.02, -s * 0.15, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    // --- OARFISH (ribbon body, crest, long) ---
    _drawOarfish(ctx, s, col, acc) {
        const t = performance.now() / 500;

        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(4, s * 0.45);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * 1.5, 0);
        for (let i = 0; i <= 8; i++) {
            const px = s * 1.5 - i * s * 0.45;
            const py = Math.sin(t * 2 + i * 0.8) * s * 0.3;
            ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.15);
        ctx.beginPath();
        ctx.moveTo(s * 1.4, -s * 0.1);
        for (let i = 0; i <= 6; i++) {
            const px = s * 1.4 - i * s * 0.4;
            const py = Math.sin(t * 2 + i * 0.8) * s * 0.3 - s * 0.1;
            ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(s * 1.0, -s * 0.2);
        ctx.quadraticCurveTo(s * 1.2, -s * 1.2, s * 1.6, -s * 0.9);
        ctx.quadraticCurveTo(s * 1.4, -s * 0.4, s * 1.4, -s * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(s * 1.5, 0, s * 0.35, s * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.6, -s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.62, -s * 0.08, s * 0.05, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(s * 1.3, s * 0.15);
        ctx.lineTo(s * 1.5, s * 0.5);
        ctx.lineTo(s * 1.5, s * 0.2);
        ctx.closePath();
        ctx.fill();
    },

    // --- SQUID (mantle, tentacles, big eyes) ---
    _drawSquid(ctx, s, col, acc) {
        const t = performance.now() / 400;

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.12);
        ctx.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 1.2 - Math.PI * 0.6;
            const wave = Math.sin(t * 3 + i) * s * 0.2;
            ctx.beginPath();
            ctx.moveTo(-s * 0.2, 0);
            ctx.quadraticCurveTo(
                -s * 0.8 + Math.cos(a) * s * 0.3,
                Math.sin(a) * s * 0.5 + wave,
                -s * 1.5 + Math.cos(a) * s * 0.5,
                Math.sin(a) * s * 0.9 + wave
            );
            ctx.stroke();
        }
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        for (let i = 0; i < 2; i++) {
            const dir = i === 0 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(-s * 0.2, 0);
            ctx.quadraticCurveTo(
                -s * 1.2, dir * s * 0.6 + Math.sin(t * 2 + i) * s * 0.3,
                -s * 2.2, dir * s * 0.3 + Math.sin(t * 2.5 + i) * s * 0.4
            );
            ctx.stroke();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, 0);
        ctx.quadraticCurveTo(s * 0.8, -s * 0.9, -s * 0.2, -s * 0.7);
        ctx.quadraticCurveTo(-s * 0.6, 0, -s * 0.2, s * 0.7);
        ctx.quadraticCurveTo(s * 0.8, s * 0.9, s * 1.2, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.8, -s * 0.2);
        ctx.quadraticCurveTo(0, -s * 0.6, -s * 0.3, 0);
        ctx.quadraticCurveTo(0, -s * 0.3, s * 0.8, -s * 0.2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.35, s * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.5, s * 0.35, s * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.35, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.55, s * 0.35, s * 0.12, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.1, -s * 0.1);
        ctx.lineTo(s * 1.7, -s * 0.6);
        ctx.lineTo(s * 1.7, s * 0.6);
        ctx.lineTo(s * 1.1, s * 0.1);
        ctx.closePath();
        ctx.fill();
    },

    // --- PREHISTORIC (massive jaws, armored, ancient) ---
    _drawPrehistoric(ctx, s, col, acc) {
        const t = performance.now() / 600;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.8, 0);
        ctx.quadraticCurveTo(s * 0.8, -s * 1.0, -s * 0.6, -s * 0.85);
        ctx.quadraticCurveTo(-s * 1.5, -s * 0.6, -s * 1.6, 0);
        ctx.quadraticCurveTo(-s * 1.5, s * 0.6, -s * 0.6, s * 0.85);
        ctx.quadraticCurveTo(s * 0.8, s * 1.0, s * 1.8, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 6; i++) {
            const px = -s * 1.0 + i * s * 0.5;
            ctx.beginPath();
            ctx.moveTo(px, -s * 0.75);
            ctx.lineTo(px + s * 0.2, -s * 0.95);
            ctx.lineTo(px + s * 0.4, -s * 0.75);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(s * 1.5, -s * 0.5);
        ctx.quadraticCurveTo(s * 2.3, -s * 0.7, s * 2.6, -s * 0.3);
        ctx.lineTo(s * 1.5, -s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 1.5, s * 0.5);
        ctx.quadraticCurveTo(s * 2.3, s * 0.7, s * 2.6, s * 0.3);
        ctx.lineTo(s * 1.5, s * 0.2);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        for (let i = 0; i < 5; i++) {
            const tx = s * 1.6 + i * s * 0.2;
            const ty = -s * 0.35;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + s * 0.1, ty + s * 0.25);
            ctx.lineTo(tx + s * 0.2, ty);
            ctx.closePath();
            ctx.fill();
        }
        for (let i = 0; i < 5; i++) {
            const tx = s * 1.6 + i * s * 0.2;
            const ty = s * 0.35;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + s * 0.1, ty - s * 0.25);
            ctx.lineTo(tx + s * 0.2, ty);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.3, -s * 0.9);
        ctx.lineTo(s * 0.0, -s * 1.7);
        ctx.lineTo(s * 0.5, -s * 0.95);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.5, 0);
        ctx.quadraticCurveTo(-s * 2.3, -s * 1.3, -s * 2.8, -s * 1.1);
        ctx.quadraticCurveTo(-s * 2.1, -s * 0.2, -s * 1.9, 0);
        ctx.quadraticCurveTo(-s * 2.1, s * 0.2, -s * 2.8, s * 1.1);
        ctx.quadraticCurveTo(-s * 2.3, s * 1.3, -s * 1.5, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(s * 1.2, -s * 0.25, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.22, -s * 0.25, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    // --- LEVIATHAN (island-sized, multiple fins, terror) ---
    _drawLeviathan(ctx, s, col, acc) {
        const t = performance.now() / 500;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 2.0, 0);
        ctx.quadraticCurveTo(s * 0.8, -s * 1.3, -s * 0.8, -s * 1.0);
        ctx.quadraticCurveTo(-s * 1.8, -s * 0.7, -s * 2.0, 0);
        ctx.quadraticCurveTo(-s * 1.8, s * 0.7, -s * 0.8, s * 1.0);
        ctx.quadraticCurveTo(s * 0.8, s * 1.3, s * 2.0, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.3, s * 0.3, s * 1.2, s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 3; i++) {
            const px = -s * 0.3 + i * s * 0.6;
            ctx.beginPath();
            ctx.moveTo(px, -s * 0.9);
            ctx.lineTo(px + s * 0.1, -s * 1.8);
            ctx.lineTo(px + s * 0.3, -s * 0.9);
            ctx.closePath();
            ctx.fill();
        }

        ctx.beginPath();
        ctx.moveTo(-s * 1.8, 0);
        ctx.quadraticCurveTo(-s * 2.8, -s * 1.5, -s * 3.5, -s * 1.2);
        ctx.quadraticCurveTo(-s * 2.5, -s * 0.3, -s * 2.3, 0);
        ctx.quadraticCurveTo(-s * 2.5, s * 0.3, -s * 3.5, s * 1.2);
        ctx.quadraticCurveTo(-s * 2.8, s * 1.5, -s * 1.8, 0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(s * 0.8, s * 0.7, s * 0.7, s * 0.3, Math.PI * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(s * 0.8, -s * 0.7, s * 0.7, s * 0.3, -Math.PI * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(s * 1.8, 0, s * 0.6, s * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(s * 2.2, -s * 0.15);
        ctx.quadraticCurveTo(s * 2.8, -s * 0.3, s * 2.9, 0);
        ctx.quadraticCurveTo(s * 2.8, s * 0.3, s * 2.2, s * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        for (let i = 0; i < 4; i++) {
            const tx = s * 2.3 + i * s * 0.15;
            ctx.beginPath();
            ctx.moveTo(tx, -s * 0.12);
            ctx.lineTo(tx + s * 0.05, s * 0.0);
            ctx.lineTo(tx + s * 0.1, -s * 0.12);
            ctx.closePath();
            ctx.fill();
        }

        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(s * 1.8, -s * 0.25, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.82, -s * 0.25, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    // --- SERPENT (long snake-like, many coils) ---
    _drawSerpent(ctx, s, col, acc) {
        const t = performance.now() / 400;
        // STORMLORD HYDRA: 9 heads fanning from one trunk (myth accurate).
        const sp = this._cur;
        if (sp && sp.id === 'stormlord_hydra') {
            this._drawHydra(ctx, s, col, acc);
            return;
        }

        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(5, s * 0.5);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * 1.5, 0);
        for (let i = 0; i <= 10; i++) {
            const px = s * 1.5 - i * s * 0.35;
            const py = Math.sin(t * 2 + i * 0.7) * s * 0.5;
            ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.2);
        ctx.beginPath();
        ctx.moveTo(s * 1.4, -s * 0.15);
        for (let i = 0; i <= 8; i++) {
            const px = s * 1.4 - i * s * 0.35;
            const py = Math.sin(t * 2 + i * 0.7) * s * 0.5 - s * 0.15;
            ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(s * 1.5, 0, s * 0.45, s * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(s * 1.8, -s * 0.1);
        ctx.lineTo(s * 2.3, -s * 0.15);
        ctx.lineTo(s * 2.3, s * 0.15);
        ctx.lineTo(s * 1.8, s * 0.1);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(s * 2.0, -s * 0.1);
        ctx.lineTo(s * 2.1, s * 0.05);
        ctx.lineTo(s * 2.15, -s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 2.0, s * 0.1);
        ctx.lineTo(s * 2.1, -s * 0.05);
        ctx.lineTo(s * 2.15, s * 0.1);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 1.7, -s * 0.15, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.72, -s * 0.15, s * 0.05, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.3, -s * 0.35);
        ctx.quadraticCurveTo(s * 1.5, -s * 1.0, s * 1.8, -s * 0.5);
        ctx.quadraticCurveTo(s * 1.7, -s * 0.3, s * 1.5, -s * 0.25);
        ctx.closePath();
        ctx.fill();
    },

    // --- STORMLORD HYDRA: one trunk, 9 serpent heads on arched necks.
    // Heads sway out of phase, eyes glow, center head biggest. Deterministic
    // (time-driven sway, no per-frame alloc beyond the loop).
    _drawHydra(ctx, s, col, acc) {
        const t = performance.now() / 450;
        // Shared trunk: thick coiled body trailing behind the necks
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(7, s * 0.62);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * 0.6, 0);
        for (let i = 0; i <= 8; i++) {
            const px = s * 0.6 - i * s * 0.38;
            const py = Math.sin(t * 1.6 + i * 0.8) * s * 0.45;
            ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2.5, s * 0.24);
        ctx.beginPath();
        ctx.moveTo(s * 0.55, -s * 0.14);
        for (let i = 0; i <= 7; i++) {
            const px = s * 0.55 - i * s * 0.38;
            const py = Math.sin(t * 1.6 + i * 0.8) * s * 0.45 - s * 0.14;
            ctx.lineTo(px, py);
        }
        ctx.stroke();
        // 9 necks fanning forward (+x), arched upward in a crown
        for (let k = 0; k < 9; k++) {
            const f = (k - 4) / 4; // -1 .. 1 across the fan
            const sway = Math.sin(t * 2.2 + k * 1.4) * s * 0.14;
            const baseX = s * 0.55, baseY = 0;
            const neckEX = s * 1.15 + Math.abs(f) * s * 0.12;
            const neckEY = f * s * 1.05 + sway;
            const headX = s * 1.55 + Math.abs(f) * s * 0.18;
            const headY = f * s * 1.3 + sway * 1.4;
            const center = 1 - Math.abs(f) * 0.35; // center heads bigger
            // Neck
            ctx.strokeStyle = col;
            ctx.lineWidth = Math.max(3.5, s * 0.3 * center);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(baseX, baseY);
            ctx.quadraticCurveTo(neckEX, neckEY, headX, headY);
            ctx.stroke();
            // Dorsal fin on the neck
            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.moveTo(neckEX - s * 0.1, neckEY - s * 0.16 * center);
            ctx.quadraticCurveTo(neckEX + s * 0.12, neckEY - s * 0.55 * center, neckEX + s * 0.24, neckEY - s * 0.14 * center);
            ctx.quadraticCurveTo(neckEX + s * 0.1, neckEY - s * 0.1, neckEX - s * 0.1, neckEY - s * 0.16 * center);
            ctx.closePath();
            ctx.fill();
            // Head: elongated snout
            const hs = s * 0.34 * center;
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.ellipse(headX, headY, hs * 1.35, hs * 0.8, f * 0.35, 0, Math.PI * 2);
            ctx.fill();
            // Open jaw with fangs
            const jawOpen = 0.35 + Math.sin(t * 3 + k * 2.1) * 0.12;
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.moveTo(headX + hs * 0.2, headY);
            ctx.lineTo(headX + hs * 1.5, headY - hs * jawOpen);
            ctx.lineTo(headX + hs * 1.5, headY + hs * jawOpen);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.moveTo(headX + hs * 0.9, headY - hs * jawOpen * 0.7);
            ctx.lineTo(headX + hs * 1.05, headY - hs * jawOpen * 0.25);
            ctx.lineTo(headX + hs * 1.12, headY - hs * jawOpen * 0.7);
            ctx.closePath(); ctx.fill();
            ctx.beginPath();
            ctx.moveTo(headX + hs * 0.9, headY + hs * jawOpen * 0.7);
            ctx.lineTo(headX + hs * 1.05, headY + hs * jawOpen * 0.25);
            ctx.lineTo(headX + hs * 1.12, headY + hs * jawOpen * 0.7);
            ctx.closePath(); ctx.fill();
            // Glowing eye
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(headX + hs * 0.25, headY - hs * 0.35, hs * 0.24, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(headX + hs * 0.3, headY - hs * 0.35, hs * 0.11, 0, Math.PI * 2); ctx.fill();
        }
    },

    // --- TITAN (world-ending, cosmic, huge) ---
    _drawTitan(ctx, s, col, acc) {
        const t = performance.now() / 700;

        ctx.save();
        ctx.globalAlpha = 0.3;
        const auraGrad = ctx.createRadialGradient(0, 0, s * 0.5, 0, 0, s * 2.5);
        auraGrad.addColorStop(0, col);
        auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath(); ctx.arc(0, 0, s * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 2.0, s * 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const r = s * (0.5 + Math.random() * 0.8);
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r * 0.5;
            ctx.beginPath();
            ctx.arc(px, py, s * 0.06, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = acc;
        for (let i = 0; i < 5; i++) {
            const px = -s * 0.8 + i * s * 0.5;
            ctx.beginPath();
            ctx.moveTo(px, -s * 0.9);
            ctx.quadraticCurveTo(px + s * 0.15, -s * 2.2, px + s * 0.4, -s * 0.9);
            ctx.closePath();
            ctx.fill();
        }

        ctx.beginPath();
        ctx.moveTo(-s * 1.8, 0);
        ctx.quadraticCurveTo(-s * 2.8, -s * 1.4, -s * 3.5, -s * 1.0);
        ctx.quadraticCurveTo(-s * 2.5, 0, -s * 3.5, s * 1.0);
        ctx.quadraticCurveTo(-s * 2.8, s * 1.4, -s * 1.8, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(s * 1.8, 0, s * 0.7, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 1.8, -s * 0.25, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 1.8, s * 0.25, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 2.1, 0, s * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    },

    // --- BASS (deep body, big mouth, aggressive) ---
    _drawBass(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, 0);
        ctx.quadraticCurveTo(s * 0.6, -s * 0.95, -s * 0.3, -s * 0.85);
        ctx.quadraticCurveTo(-s * 1.1, -s * 0.6, -s * 1.2, 0);
        ctx.quadraticCurveTo(-s * 1.1, s * 0.6, -s * 0.3, s * 0.85);
        ctx.quadraticCurveTo(s * 0.6, s * 0.95, s * 1.2, 0);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.beginPath();
        ctx.moveTo(s * 1.0, 0);
        ctx.quadraticCurveTo(0, -s * 0.15, -s * 1.0, 0);
        ctx.stroke();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.1);
        ctx.beginPath();
        ctx.moveTo(s * 0.4, s * 0.2);
        ctx.quadraticCurveTo(s * 0.9, s * 0.4, s * 1.1, s * 0.15);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.4, -s * 0.8);
        ctx.lineTo(s * 0.2, -s * 1.4);
        ctx.lineTo(s * 0.0, -s * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.85);
        ctx.quadraticCurveTo(-s * 0.4, -s * 1.3, -s * 0.7, -s * 0.75);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0);
        ctx.lineTo(-s * 1.8, -s * 0.7);
        ctx.lineTo(-s * 1.6, 0);
        ctx.lineTo(-s * 1.8, s * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.25, s * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.73, -s * 0.25, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    // --- TROUT (streamlined, spotted, forked tail) ---
    _drawTrout(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.3, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 15; i++) {
            const px = (Math.random() - 0.5) * s * 2.0;
            const py = (Math.random() - 0.5) * s * 0.8;
            ctx.beginPath();
            ctx.arc(px, py, s * 0.04, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.beginPath();
        ctx.moveTo(s * 1.0, -s * 0.05);
        ctx.quadraticCurveTo(0, -s * 0.15, -s * 1.0, -s * 0.05);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, -s * 0.5);
        ctx.lineTo(-s * 0.6, -s * 0.7);
        ctx.lineTo(-s * 0.3, -s * 0.5);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.2, 0);
        ctx.lineTo(-s * 1.8, -s * 0.6);
        ctx.lineTo(-s * 1.6, 0);
        ctx.lineTo(-s * 1.8, s * 0.6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.75, -s * 0.15, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.78, -s * 0.15, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    // --- SALMON (torpedo, hooked jaw when spawning) ---
    _drawSalmon(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.4, 0);
        ctx.quadraticCurveTo(s * 0.6, -s * 0.75, -s * 0.3, -s * 0.65);
        ctx.quadraticCurveTo(-s * 1.1, -s * 0.45, -s * 1.3, 0);
        ctx.quadraticCurveTo(-s * 1.1, s * 0.45, -s * 0.3, s * 0.65);
        ctx.quadraticCurveTo(s * 0.6, s * 0.75, s * 1.4, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 10; i++) {
            const px = (Math.random() - 0.5) * s * 1.8;
            const py = (Math.random() - 0.5) * s * 0.7;
            ctx.beginPath();
            ctx.arc(px, py, s * 0.04, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.1);
        ctx.beginPath();
        ctx.moveTo(s * 0.8, s * 0.1);
        ctx.quadraticCurveTo(s * 1.2, s * 0.3, s * 1.3, -s * 0.1);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 0.6);
        ctx.quadraticCurveTo(-s * 0.1, -s * 1.1, -s * 0.4, -s * 0.55);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.2, 0);
        ctx.lineTo(-s * 1.9, -s * 0.7);
        ctx.lineTo(-s * 1.6, 0);
        ctx.lineTo(-s * 1.9, s * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.85, -s * 0.18, s * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.88, -s * 0.18, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    // --- PIKE (long, toothy, ambush predator) ---
    _drawPike(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.6, 0);
        ctx.quadraticCurveTo(s * 0.5, -s * 0.6, -s * 0.5, -s * 0.55);
        ctx.quadraticCurveTo(-s * 1.4, -s * 0.4, -s * 1.5, 0);
        ctx.quadraticCurveTo(-s * 1.4, s * 0.4, -s * 0.5, s * 0.55);
        ctx.quadraticCurveTo(s * 0.5, s * 0.6, s * 1.6, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 12; i++) {
            const px = (Math.random() - 0.5) * s * 2.0;
            const py = (Math.random() - 0.5) * s * 0.6;
            ctx.beginPath();
            ctx.ellipse(px, py, s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.4, -s * 0.15);
        ctx.lineTo(s * 2.2, 0);
        ctx.lineTo(s * 1.4, s * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        for (let i = 0; i < 4; i++) {
            const tx = s * 1.5 + i * s * 0.15;
            ctx.beginPath();
            ctx.moveTo(tx, s * 0.05);
            ctx.lineTo(tx + s * 0.04, s * 0.2);
            ctx.lineTo(tx + s * 0.08, s * 0.05);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, -s * 0.5);
        ctx.lineTo(-s * 0.7, -s * 0.95);
        ctx.lineTo(-s * 0.9, -s * 0.45);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0);
        ctx.lineTo(-s * 2.0, -s * 0.65);
        ctx.lineTo(-s * 1.8, 0);
        ctx.lineTo(-s * 2.0, s * 0.65);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 1.0, -s * 0.2, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.02, -s * 0.2, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    // --- CARP (deep body, barbels, large scales) ---
    _drawCarp(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(0.8, s * 0.04);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 3; j++) {
                const px = -s * 0.8 + i * s * 0.5;
                const py = -s * 0.5 + j * s * 0.5;
                ctx.beginPath();
                ctx.arc(px, py, s * 0.2, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * 1.0, s * 0.15);
        ctx.quadraticCurveTo(s * 1.4, s * 0.4, s * 1.5, s * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 1.0, s * 0.25);
        ctx.quadraticCurveTo(s * 1.3, s * 0.5, s * 1.4, s * 0.7);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.4, -s * 0.75);
        ctx.quadraticCurveTo(-s * 0.2, -s * 1.3, -s * 0.8, -s * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0);
        ctx.lineTo(-s * 1.8, -s * 0.75);
        ctx.lineTo(-s * 1.6, 0);
        ctx.lineTo(-s * 1.8, s * 0.75);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.2, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.73, -s * 0.2, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    // --- WRASSE (elongated, colorful, pointed snout) ---
    _drawWrasse(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.4, 0);
        ctx.quadraticCurveTo(s * 0.6, -s * 0.65, -s * 0.3, -s * 0.6);
        ctx.quadraticCurveTo(-s * 1.1, -s * 0.4, -s * 1.2, 0);
        ctx.quadraticCurveTo(-s * 1.1, s * 0.4, -s * 0.3, s * 0.6);
        ctx.quadraticCurveTo(s * 0.6, s * 0.65, s * 1.4, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(-s * 0.6 + i * s * 0.35, -s * 0.5);
            ctx.lineTo(-s * 0.5 + i * s * 0.35, 0);
            ctx.lineTo(-s * 0.6 + i * s * 0.35, s * 0.5);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, -s * 0.15);
        ctx.lineTo(s * 1.8, 0);
        ctx.lineTo(s * 1.2, s * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.6, -s * 0.55);
        ctx.quadraticCurveTo(0, -s * 1.0, -s * 0.8, -s * 0.5);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0);
        ctx.quadraticCurveTo(-s * 1.8, -s * 0.6, -s * 1.9, 0);
        ctx.quadraticCurveTo(-s * 1.8, s * 0.6, -s * 1.1, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.85, -s * 0.18, s * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.88, -s * 0.18, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    // --- BUTTERFLYFISH (disc body, long snout, stripes) ---
    _drawButterfly(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.0, s * 1.0, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(-s * 0.5 + i * s * 0.4, -s * 0.9);
            ctx.lineTo(-s * 0.35 + i * s * 0.4, 0);
            ctx.lineTo(-s * 0.5 + i * s * 0.4, s * 0.9);
            ctx.closePath();
            ctx.fill();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 0.9, -s * 0.1);
        ctx.lineTo(s * 1.5, 0);
        ctx.lineTo(s * 0.9, s * 0.1);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.5, -s * 0.9);
        ctx.quadraticCurveTo(0, -s * 1.4, -s * 0.5, -s * 0.9);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.9, 0);
        ctx.lineTo(-s * 1.3, -s * 0.5);
        ctx.lineTo(-s * 1.3, s * 0.5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.2, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.2, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    // --- ANGELFISH (tall disc, trailing fins, majestic) ---
    _drawAngelfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.0, 0);
        ctx.quadraticCurveTo(s * 0.6, -s * 1.2, -s * 0.2, -s * 1.3);
        ctx.quadraticCurveTo(-s * 0.8, -s * 0.8, -s * 1.0, 0);
        ctx.quadraticCurveTo(-s * 0.8, s * 0.8, -s * 0.2, s * 1.3);
        ctx.quadraticCurveTo(s * 0.6, s * 1.2, s * 1.0, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(-s * 0.4 + i * s * 0.45, -s * 1.1);
            ctx.lineTo(-s * 0.25 + i * s * 0.45, 0);
            ctx.lineTo(-s * 0.4 + i * s * 0.45, s * 1.1);
            ctx.closePath();
            ctx.fill();
        }

        ctx.beginPath();
        ctx.moveTo(s * 0.3, -s * 1.0);
        ctx.quadraticCurveTo(-s * 0.2, -s * 2.0, -s * 0.6, -s * 1.8);
        ctx.quadraticCurveTo(-s * 0.3, -s * 1.3, -s * 0.2, -s * 1.0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.3, s * 1.0);
        ctx.quadraticCurveTo(-s * 0.2, s * 2.0, -s * 0.6, s * 1.8);
        ctx.quadraticCurveTo(-s * 0.3, s * 1.3, -s * 0.2, s * 1.0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.9, 0);
        ctx.lineTo(-s * 1.3, -s * 0.6);
        ctx.lineTo(-s * 1.3, s * 0.6);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.25, s * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.43, -s * 0.25, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    // --- CLOWNFISH (orange with white stripes, rounded) ---
    _drawClownfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.1, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(s * 0.5, 0, s * 0.12, s * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.1, 0, s * 0.15, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.7, 0, s * 0.1, s * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.beginPath();
        ctx.ellipse(s * 0.5, 0, s * 0.12, s * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-s * 0.1, 0, s * 0.15, s * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-s * 0.7, 0, s * 0.1, s * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.3, -s * 0.65);
        ctx.quadraticCurveTo(0, -s * 1.1, -s * 0.4, -s * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(s * 0.2, s * 0.4, s * 0.25, s * 0.15, Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 1.2, 0, s * 0.25, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.75, -s * 0.15, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.78, -s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    // --- SEAHORSE (upright, curled tail, tube snout) ---
    _drawSeahorse(ctx, s, col, acc) {
        const t = performance.now() / 600;

        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(4, s * 0.35);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.2);
        ctx.quadraticCurveTo(s * 0.4, -s * 0.8, s * 0.1, -s * 0.3);
        ctx.quadraticCurveTo(-s * 0.2, s * 0.2, s * 0.1, s * 0.6);
        ctx.quadraticCurveTo(s * 0.3, s * 1.0, -s * 0.1, s * 1.1);
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, -s * 1.3, s * 0.3, s * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 1.4);
        ctx.lineTo(s * 0.8, -s * 1.3);
        ctx.lineTo(s * 0.8, -s * 1.2);
        ctx.lineTo(s * 0.2, -s * 1.25);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 1.6);
        ctx.lineTo(s * 0.1, -s * 2.0);
        ctx.lineTo(s * 0.2, -s * 1.55);
        ctx.closePath();
        ctx.fill();

        const flutter = Math.sin(t * 8) * s * 0.1;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, -s * 0.6);
        ctx.quadraticCurveTo(-s * 0.7 + flutter, -s * 0.3, -s * 0.2, 0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(s * 0.15, -s * 0.7, s * 0.15, s * 0.08, Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.05, -s * 1.4, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.07, -s * 1.4, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    // --- LIONFISH (fan-like fins, venomous spines) ---
    _drawLionfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.0, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(-s * 0.6 + i * s * 0.3, -s * 0.65);
            ctx.lineTo(-s * 0.45 + i * s * 0.3, 0);
            ctx.lineTo(-s * 0.6 + i * s * 0.3, s * 0.65);
            ctx.closePath();
            ctx.fill();
        }

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < 7; i++) {
                const a = -Math.PI * 0.3 + (i / 6) * Math.PI * 0.6;
                ctx.beginPath();
                ctx.moveTo(s * 0.2 * side, 0);
                ctx.quadraticCurveTo(
                    Math.cos(a) * s * 0.8 * side,
                    Math.sin(a) * s * 0.8,
                    Math.cos(a) * s * 1.4 * side,
                    Math.sin(a) * s * 1.4
                );
                ctx.stroke();
            }
        }

        for (let i = 0; i < 8; i++) {
            const px = -s * 0.7 + i * s * 0.2;
            ctx.beginPath();
            ctx.moveTo(px, -s * 0.6);
            ctx.quadraticCurveTo(px - s * 0.1, -s * 1.3, px + s * 0.1, -s * 1.5);
            ctx.stroke();
        }

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 1.0, 0);
        ctx.lineTo(-s * 1.6, -s * 0.7);
        ctx.lineTo(-s * 1.4, 0);
        ctx.lineTo(-s * 1.6, s * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.2, s * 0.13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.63, -s * 0.2, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    // --- STONEFISH (lumpy, camouflaged, venomous) ---
    _drawStonefish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 10; i++) {
            const px = (Math.random() - 0.5) * s * 2.0;
            const py = (Math.random() - 0.5) * s * 1.5;
            ctx.beginPath();
            ctx.arc(px, py, s * 0.1 + Math.random() * s * 0.1, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, s * 0.1);
        ctx.beginPath();
        ctx.arc(s * 0.6, s * 0.15, s * 0.25, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.08);
        for (let i = 0; i < 6; i++) {
            const px = -s * 0.5 + i * s * 0.25;
            ctx.beginPath();
            ctx.moveTo(px, -s * 0.8);
            ctx.lineTo(px, -s * 1.3);
            ctx.stroke();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(s * 0.4, s * 0.7, s * 0.4, s * 0.2, Math.PI * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(-s * 1.3, 0, s * 0.3, s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.72, -s * 0.3, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    // --- FROGFISH (lumpy, lure, walking fins) ---
    _drawFrogfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.1, s * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 8; i++) {
            const px = (Math.random() - 0.5) * s * 1.8;
            const py = (Math.random() - 0.5) * s * 1.3;
            ctx.beginPath();
            ctx.arc(px, py, s * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, s * 0.12);
        ctx.beginPath();
        ctx.arc(s * 0.6, 0, s * 0.35, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.stroke();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 0.7);
        ctx.quadraticCurveTo(s * 0.8, -s * 1.5, s * 1.2, -s * 1.0);
        ctx.stroke();

        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(s * 1.2, -s * 1.0, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.3, s * 0.6, s * 0.15, s * 0.3, Math.PI * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.2, s * 0.6, s * 0.15, s * 0.3, -Math.PI * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(-s * 1.2, 0, s * 0.25, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.3, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.53, -s * 0.3, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    // --- ANCHOVY (tiny, silver, schooling) ---
    _drawAnchovy(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.0, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1, s * 0.08);
        ctx.beginPath();
        ctx.moveTo(s * 0.8, 0);
        ctx.lineTo(-s * 0.8, 0);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.1, -s * 0.35);
        ctx.lineTo(-s * 0.1, -s * 0.6);
        ctx.lineTo(-s * 0.3, -s * 0.35);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.9, 0);
        ctx.lineTo(-s * 1.4, -s * 0.4);
        ctx.lineTo(-s * 1.2, 0);
        ctx.lineTo(-s * 1.4, s * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.1, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },

    // --- MINNOW (tiny, simple, silver) ---
    _drawMinnow(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.9, s * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(0.8, s * 0.06);
        ctx.beginPath();
        ctx.moveTo(s * 0.7, 0);
        ctx.lineTo(-s * 0.7, 0);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.1, -s * 0.3);
        ctx.lineTo(-s * 0.1, -s * 0.55);
        ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.8, 0);
        ctx.lineTo(-s * 1.2, -s * 0.35);
        ctx.lineTo(-s * 1.1, 0);
        ctx.lineTo(-s * 1.2, s * 0.35);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.08, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    // --- GOLDFISH (fancy, flowing fins, bright) ---
    _drawGoldfish(ctx, s, col, acc) {
        const t = performance.now() / 500;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.1, s * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.2, s * 0.2, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.4, -s * 0.7);
        ctx.quadraticCurveTo(s * 0.0 + Math.sin(t * 3) * s * 0.15, -s * 1.6, -s * 0.5, -s * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.0, 0);
        ctx.quadraticCurveTo(-s * 1.8 + Math.sin(t * 2) * s * 0.2, -s * 1.0, -s * 2.0, -s * 0.3);
        ctx.quadraticCurveTo(-s * 1.6, -s * 0.1, -s * 1.4, 0);
        ctx.quadraticCurveTo(-s * 1.6, s * 0.1, -s * 2.0, s * 0.3);
        ctx.quadraticCurveTo(-s * 1.8 + Math.sin(t * 2) * s * 0.2, s * 1.0, -s * 1.0, 0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.3, s * 0.4);
        ctx.quadraticCurveTo(s * 0.0 + Math.sin(t * 4) * s * 0.15, s * 1.2, s * 0.6, s * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.2, s * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.73, -s * 0.2, s * 0.1, 0, Math.PI * 2); ctx.fill();
    }
};