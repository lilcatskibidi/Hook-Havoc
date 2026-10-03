// ==========================================
// MENU BACKGROUND — live beach diorama.
// Sand + surf on the left, open water on the right, and REAL fish from
// the Fish Index (FISH_SPECIES) cruising past, drawn with the game's own
// Render.drawFishModel. Pure ambience: no gameplay, no cost.
// ==========================================
const MenuBackground = {
    canvas: null,
    ctx: null,
    time: 0,
    swimmers: [],
    bubbles: [],
    spawnTimer: 0,

    init() {
        this.canvas = $('menu-bg-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    },

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = Math.max(2, rect.width);
        this.canvas.height = Math.max(2, rect.height);
    },

    pickSpecies() {
        try {
            if (typeof FISH_SPECIES === 'undefined' || !FISH_SPECIES.length) return null;
            // Weighted to pretty groups: mostly common/rare/epic, rare
            // legendary+ cameos, never bosses (too big for the menu tank).
            const pool = FISH_SPECIES.filter(s => s && !s.isBoss && (s.size || 20) <= 64);
            if (!pool.length) return null;
            const r = Math.random();
            const want = r < 0.55 ? ['common']
                : r < 0.8 ? ['common', 'rare']
                : r < 0.95 ? ['rare', 'epic']
                : ['epic', 'legendary', 'mythic'];
            const group = pool.filter(s => want.includes(s.rarity));
            const src = group.length ? group : pool;
            return src[Math.floor(Math.random() * src.length)];
        } catch (e) { return null; }
    },

    spawnSwimmer(fromEdge) {
        const w = this.canvas.width, h = this.canvas.height;
        const waterX = w * 0.40;
        const sp = this.pickSpecies();
        if (!sp) return;
        const leftToRight = fromEdge !== undefined ? fromEdge : Math.random() < 0.5;
        const depth = Math.random(); // 0 = surface, 1 = deep
        const y = h * (0.18 + Math.random() * 0.72);
        const speed = (60 + Math.random() * 70) * (1 - depth * 0.35);
        const scale = (0.45 + Math.random() * 0.35) * (1 - depth * 0.25);
        this.swimmers.push({
            sp,
            x: leftToRight ? -80 : w + 80,
            y,
            vx: leftToRight ? speed : -speed,
            dir: leftToRight ? 1 : -1,
            scale,
            depth,
            bobPhase: Math.random() * Math.PI * 2,
            bobAmp: 6 + Math.random() * 10,
            labelT: (sp.rarity === 'legendary' || sp.rarity === 'mythic') ? 3.5 : 0,
        });
        if (this.swimmers.length > 10) this.swimmers.shift();
    },

    animate() {
        if (!this.ctx || !this.canvas) return;
        try {
            const menu = document.getElementById('main-menu');
            if (menu && menu.classList.contains('hidden')) {
                requestAnimationFrame(() => this.animate());
                return;
            }
        } catch (e) {}

        const delta = 1 / 60;
        this.time += delta;
        const w = this.canvas.width, h = this.canvas.height;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, w, h);

        this.drawBeach(ctx, w, h);

        // Keep the tank stocked
        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0 && this.swimmers.length < 8) {
            this.spawnTimer = 0.8 + Math.random() * 1.6;
            this.spawnSwimmer();
        }
        this.updateSwimmers(delta, w, h);
        this.drawSwimmers(ctx);
        this.updateBubbles(delta, w, h);
        this.drawBubbles(ctx);

        requestAnimationFrame(() => this.animate());
    },

    drawBeach(ctx, w, h) {
        const t = this.time;
        const waterX = w * 0.40;

        // Dawn sky
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#0b1026');
        sky.addColorStop(0.45, '#13233d');
        sky.addColorStop(0.75, '#1e3a5f');
        sky.addColorStop(1, '#0c4a6e');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Sun + halo
        const sunX = w * 0.72, sunY = h * 0.24;
        const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
        halo.addColorStop(0, 'rgba(253,224,71,0.85)');
        halo.addColorStop(0.25, 'rgba(251,191,36,0.35)');
        halo.addColorStop(1, 'rgba(251,191,36,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(sunX, sunY, 120, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fde68a';
        ctx.beginPath(); ctx.arc(sunX, sunY, 20 + Math.sin(t * 1.5) * 1.5, 0, Math.PI * 2); ctx.fill();

        // Sand (left) with wet band near the water
        const sand = ctx.createLinearGradient(0, 0, waterX, 0);
        sand.addColorStop(0, '#8a6a42');
        sand.addColorStop(0.7, '#c99b63');
        sand.addColorStop(0.92, '#a07a4d');
        sand.addColorStop(1, '#6b5233');
        ctx.fillStyle = sand;
        ctx.fillRect(0, 0, waterX, h);
        // Sand shimmer speckles (static hash — never swims)
        ctx.fillStyle = 'rgba(255,240,210,0.10)';
        for (let i = 0; i < 40; i++) {
            const hx = Math.sin(i * 12.9898) * 43758.5453;
            const fx = hx - Math.floor(hx);
            const hy = Math.sin(i * 78.233) * 12543.123;
            const fy = hy - Math.floor(hy);
            ctx.fillRect(fx * waterX, fy * h, 2, 2);
        }

        // Water (right)
        const sea = ctx.createLinearGradient(waterX, 0, w, 0);
        sea.addColorStop(0, '#0e7490');
        sea.addColorStop(0.35, '#075985');
        sea.addColorStop(1, '#082f49');
        ctx.fillStyle = sea;
        ctx.fillRect(waterX, 0, w - waterX, h);

        // Animated surf: 3 foam lines rolling onto the sand
        for (let k = 0; k < 3; k++) {
            const phase = ((t * 0.35 + k / 3) % 1);
            const fx = waterX - 70 + phase * 90;
            ctx.globalAlpha = (1 - phase) * 0.55;
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 2.5 - k * 0.5;
            ctx.beginPath();
            for (let y = 0; y <= h; y += 8) {
                const x = fx + Math.sin(y * 0.05 + t * 2 + k) * 7;
                if (y === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Light rays through the water
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
            const rx = waterX + 40 + i * ((w - waterX) / 4) + Math.sin(t * 0.6 + i * 1.7) * 14;
            const ray = ctx.createLinearGradient(rx, 0, rx + 50, h);
            ray.addColorStop(0, 'rgba(125,211,252,0.10)');
            ray.addColorStop(1, 'rgba(125,211,252,0)');
            ctx.fillStyle = ray;
            ctx.beginPath();
            ctx.moveTo(rx, 0); ctx.lineTo(rx + 34, 0);
            ctx.lineTo(rx + 90, h); ctx.lineTo(rx + 56, h);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();

        // Water surface sparkles
        ctx.fillStyle = 'rgba(224,242,254,0.5)';
        for (let i = 0; i < 24; i++) {
            const sx = waterX + ((Math.sin(i * 91.7) * 43758.5 % 1 + 1) % 1) * (w - waterX);
            const sy = ((Math.sin(i * 47.3) * 12543.1 % 1 + 1) % 1) * h;
            const tw = 0.5 + Math.sin(t * 3 + i * 1.9) * 0.5;
            ctx.globalAlpha = 0.12 + tw * 0.3;
            ctx.fillRect(sx, sy, 2, 1.5);
        }
        ctx.globalAlpha = 1;
    },

    updateSwimmers(delta, w, h) {
        for (let i = this.swimmers.length - 1; i >= 0; i--) {
            const s = this.swimmers[i];
            s.x += s.vx * delta;
            s.bobPhase += delta * 2;
            if (s.labelT > 0) s.labelT -= delta;
            if ((s.dir > 0 && s.x > w + 90) || (s.dir < 0 && s.x < -90)) {
                this.swimmers.splice(i, 1);
            }
        }
    },

    drawSwimmers(ctx) {
        const canModel = typeof Render !== 'undefined' && Render.drawFishModel;
        this.swimmers.forEach(s => {
            const y = s.y + Math.sin(s.bobPhase) * s.bobAmp;
            // Deep swimmers dim behind "water"
            ctx.save();
            ctx.globalAlpha = 1 - s.depth * 0.35;
            if (canModel) {
                try {
                    Render.drawFishModel(ctx, s.x, y, (s.sp.size || 16) * s.scale, s.sp, {
                        angle: s.dir > 0 ? 0 : Math.PI,
                    });
                } catch (e) {
                    ctx.fillStyle = s.sp.color || '#38bdf8';
                    ctx.beginPath(); ctx.ellipse(s.x, y, 12 * s.scale, 7 * s.scale, 0, 0, Math.PI * 2); ctx.fill();
                }
            } else {
                ctx.fillStyle = (s.sp && s.sp.color) || '#38bdf8';
                ctx.beginPath(); ctx.ellipse(s.x, y, 12 * s.scale, 7 * s.scale, 0, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
            // Rare-fish cameo label (shows these are real index fish)
            if (s.labelT > 0) {
                ctx.save();
                ctx.globalAlpha = Math.min(1, s.labelT);
                ctx.font = 'bold 10px Work Sans';
                ctx.textAlign = 'center';
                ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.strokeText(s.sp.name, s.x, y - 22 * s.scale - 8);
                ctx.fillStyle = s.sp.color || '#fff';
                ctx.fillText(s.sp.name, s.x, y - 22 * s.scale - 8);
                ctx.restore();
            }
        });
    },

    updateBubbles(delta, w, h) {
        if (Math.random() < 0.15 && this.bubbles.length < 26) {
            const waterX = w * 0.40;
            this.bubbles.push({
                x: waterX + 10 + Math.random() * (w - waterX - 20),
                y: h + 6,
                vy: -(24 + Math.random() * 40),
                r: 1 + Math.random() * 2.5,
                wob: Math.random() * Math.PI * 2,
            });
        }
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const b = this.bubbles[i];
            b.y += b.vy * delta;
            b.wob += delta * 3;
            b.x += Math.sin(b.wob) * 12 * delta;
            if (b.y < -8) this.bubbles.splice(i, 1);
        }
    },

    drawBubbles(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(186,230,253,0.5)';
        ctx.lineWidth = 1;
        this.bubbles.forEach(b => {
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.restore();
    }
};

// Make globally available
window.MenuBackground = MenuBackground;

// ==========================================
// UI HELPER SYSTEM & STATUS OVERLAYS
// ==========================================
const $ = (id) => document.getElementById(id);

const UI = {
    updateStatusBanner(text, stepTag = 'Info', theme = 'sky') {
        const banner = $('status-banner');
        if (banner) {
            // Tutorial hides the banner when done — danger always breaks through
            if (theme === 'rose') banner.style.display = '';
            banner.innerHTML = `<span class="text-amber-400 font-extrabold uppercase mr-1">[${stepTag}]:</span> ${text}`;
        }
    },

    updateTensionBar(state) {
        const f = state.fishing;
        const rod = state.player.equippedRod || (typeof RODS !== 'undefined' ? RODS[0] : { tensionMax: 100 });
        const bar = $('tension-bar');
        const txt = $('tension-text');
        if (!bar || !txt) return;

        const ratio = Math.min(1.0, f.lineTension / rod.tensionMax);
        const percent = Math.round(ratio * 100);
        txt.innerText = `${percent}%`;
        bar.style.width = `${percent}%`;

        if (ratio > 0.8) {
            bar.className = 'h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-75 pulse-danger';
            txt.className = 'text-rose-500 font-extrabold';
        } else if (ratio > 0.45) {
            bar.className = 'h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-75';
            txt.className = 'text-amber-400 font-bold';
        } else {
            bar.className = 'h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75';
            txt.className = 'text-emerald-400 font-bold';
        }
    },

    triggerDamageFlash() {
        const el = $('damage-flash');
        if (!el) return;
        el.classList.remove('active');
        void el.offsetWidth;
        el.classList.add('active');
    },

    showCatchPopup(species) {
        const container = $('catch-popup-container');
        if (!container) return;
        const div = document.createElement('div');
        const rc = (CONFIG.RARITY_COLORS && CONFIG.RARITY_COLORS[species.rarity]) || '#cbd5e1';
        div.className = 'catch-popup glass-panel px-4 py-3 rounded-2xl flex items-center gap-3 border-2';
        div.style.borderColor = rc;
        div.style.boxShadow = `0 0 24px ${rc}80`;
        div.innerHTML = `
            <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${species.color}30;border:1px solid ${species.color}">
                <i class="fa-solid fa-fish text-lg" style="color:${species.color}"></i>
            </div>
            <div>
                <div class="text-[10px] font-black uppercase tracking-widest" style="color:${rc}">${species.rarity}</div>
                <div class="font-bold text-white text-sm">${species.name}</div>
                <div class="text-[10px] text-amber-400 font-bold">+${species.value} coins</div>
            </div>
        `;
        container.appendChild(div);
        setTimeout(() => div.remove(), 1500);
    },

    equipToSlot(state, weaponId, slotIdx) {
        const p = state.player;
        if (!p.ownedWeapons.includes(weaponId)) return false;
        if (slotIdx < 0 || slotIdx >= EQUIP_SLOTS) return false;

        const existingSlot = p.equippedWeapons.indexOf(weaponId);
        if (existingSlot !== -1 && existingSlot !== slotIdx) {
            p.equippedWeapons[existingSlot] = p.equippedWeapons[slotIdx];
        }
        p.equippedWeapons[slotIdx] = weaponId;

        if (p.activeSlot === slotIdx && typeof Player !== 'undefined') Player.refreshWeaponHUD(state);
        this.renderWeaponToolbar(state);
        return true;
    },

    unequipSlot(state, slotIdx) {
        const p = state.player;
        if (slotIdx < 0 || slotIdx >= EQUIP_SLOTS) return;
        p.equippedWeapons[slotIdx] = null;
        if (p.activeSlot === slotIdx && typeof Player !== 'undefined') Player.refreshWeaponHUD(state);
        this.renderWeaponToolbar(state);
    },

    renderWeaponToolbar(state) {
        const toolbar = $('weapon-toolbar');
        if (!toolbar || typeof WEAPONS === 'undefined') return;
        const p = state.player;
        toolbar.innerHTML = '';

        // Weapon slots (1-4)
        for (let i = 0; i < EQUIP_SLOTS; i++) {
            const weaponId = p.equippedWeapons[i];
            const w = weaponId ? WEAPONS.find(x => x.id === weaponId) : null;
            const active = p.activeSlot === i;

            const slot = document.createElement('div');
            slot.className = `weapon-slot relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${
                active ? 'active' : 'border-slate-700/60 bg-slate-900/60'
            } ${w ? '' : 'opacity-40'}`;
            // Live gun-model thumbnail (procedural or custom skin), FA icon fallback.
            let slotArt = `<i class="fa-solid fa-plus text-lg text-slate-600"></i>`;
            if (w) {
                slotArt = `<i class="fa-solid ${w.icon} text-lg text-amber-400"></i>`;
                try {
                    if (typeof Render !== 'undefined' && Render.gunPreview) {
                        const snap = Render.gunPreview(w, p.gunSkins);
                        if (snap) slotArt = `<img src="${snap}" class="gun-preview max-w-[50px] max-h-[26px] object-contain" alt="">`;
                    }
                } catch (e) {}
            }
            slot.innerHTML = w
                ? `${slotArt}
                   <span class="text-[9px] font-bold mt-0.5 text-slate-300">${i + 1}</span>`
                : `${slotArt}
                   <span class="text-[9px] font-bold mt-0.5 text-slate-600">${i + 1}</span>`;
            slot.onclick = () => { if (typeof Player !== 'undefined') Player.selectWeapon(state, i); };
            slot.oncontextmenu = (e) => {
                e.preventDefault();
                UI.unequipSlot(state, i);
            };
            toolbar.appendChild(slot);
        }

        // Rod slot (5th slot - R key)
        const rod = p.equippedRod;
        const rodActive = p.activeSlot === 4; // Using 4 as rod slot index
        const rodSlot = document.createElement('div');
        rodSlot.className = `weapon-slot relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${
            rodActive ? 'active' : 'border-emerald-700/60 bg-emerald-900/60'
        } ${rod ? '' : 'opacity-40'}`;
        rodSlot.innerHTML = rod
            ? `<i class="fa-solid fa-fishing-rod text-lg text-emerald-400"></i>
               <span class="text-[9px] font-bold mt-0.5 text-slate-300">R</span>`
            : `<i class="fa-solid fa-plus text-lg text-slate-600"></i>
               <span class="text-[9px] font-bold mt-0.5 text-slate-600">R</span>`;
        rodSlot.title = 'Rod Slot (R) - Click to equip rod';
        rodSlot.onclick = () => { if (typeof Player !== 'undefined') Player.selectRod(state); };
        rodSlot.oncontextmenu = (e) => {
            e.preventDefault();
            if (p.equippedRod) { p.equippedRod = RODS[0]; UI.refreshLuckDisplay(state); UI.renderWeaponToolbar(state); }
        };
        toolbar.appendChild(rodSlot);
    },

    renderStatusEffectsHUD(state) {
        const p = state.player;
        let hud = $('status-effects-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'status-effects-hud';
            hud.className = 'fixed top-20 left-6 flex gap-2 z-50 pointer-events-none';
            document.body.appendChild(hud);
        }

        let html = '';
        if (p.stunTimer > 0) {
            html += `<span class="px-2.5 py-1 bg-amber-500/20 border border-amber-400/60 rounded-lg text-amber-300 text-xs font-black animate-pulse">⚡ STUNNED (${p.stunTimer.toFixed(1)}s)</span>`;
        }
        if (p.slowTimer > 0) {
            html += `<span class="px-2.5 py-1 bg-sky-500/20 border border-sky-400/60 rounded-lg text-sky-300 text-xs font-black animate-pulse">❄️ SLOWED (${p.slowTimer.toFixed(1)}s)</span>`;
        }
        if (p.burnTimer > 0) {
            html += `<span class="px-2.5 py-1 bg-rose-500/20 border border-rose-400/60 rounded-lg text-rose-300 text-xs font-black animate-pulse">🔥 BURNING (${p.burnTimer.toFixed(1)}s)</span>`;
        }
        hud.innerHTML = html;
    },

    refreshLuckDisplay(state) {
        const el = $('luck-display');
        if (!el) return;
        const rod = state.player.equippedRod;
        const luck = rod && typeof rod.luck === 'number' ? rod.luck : 0;
        el.innerText = `+${Math.round(luck * 100)}%`;
    },

    updateBossBar(state) {
        const barWrap = $('boss-bar');
        if (!barWrap) return;

        // Priority 1: land boss fish. Priority 2: STORMCALLER (lives in
        // state.enemies, never in monstersOnLand, so the old code hid the
        // top bar for her entirely). Priority 3: hooked water boss
        // (line snapped — fight it with guns, reel it when weakened).
        let boss = null, bossKind = 'fish';
        const ab = state.activeBoss;
        if (ab && ab.hp > 0 && state.monstersOnLand.includes(ab)) {
            boss = ab;
        } else {
            const storm = (state.enemies || []).find(e => e && e.isBoss && (e.hp || 0) > 0);
            if (storm) { boss = storm; bossKind = 'storm'; }
            else {
                const hf = state.fishing && state.fishing.mode === 'HOOKED' ? state.fishing.hookedFish : null;
                if (hf && hf.species && hf.species.isBoss && (hf.hp || 0) > 0) { boss = hf; bossKind = 'hooked'; }
            }
        }
        if (!boss) {
            barWrap.classList.add('hidden');
            return;
        }

        barWrap.classList.remove('hidden');

        const nameEl = $('boss-name');
        const hpTextEl = $('boss-hp-text');
        const hpBarEl = $('boss-hp-bar');
        const phaseEl = $('boss-phase-text');

        let name, hp, maxHp, phase1;
        if (bossKind === 'storm') {
            name = '⛈ ' + (boss.bossName || 'STORMCALLER');
            hp = boss.hp; maxHp = boss.maxHp || Math.max(1, hp);
            phase1 = true;
        } else if (bossKind === 'hooked') {
            name = boss.species.name.toUpperCase();
            maxHp = boss.maxHp || boss.species.maxHp || 1;
            hp = boss.hp;
            phase1 = (hp / maxHp) > 0.4;
        } else {
            name = boss.species.name.toUpperCase();
            maxHp = boss.maxHp || (boss.species && boss.species.maxHp) || 1;
            hp = boss.hp;
            const ratio = hp / maxHp;
            phase1 = ratio > 0.4;
            if (boss.phase === 2) phase1 = false;
        }
        const ratio = Math.max(0, Math.min(1, hp / maxHp));
        const pct = Math.round(ratio * 100);

        if (nameEl) nameEl.innerText = name;
        if (hpTextEl) hpTextEl.innerText = `${Math.max(0, Math.round(hp)).toLocaleString()} / ${maxHp.toLocaleString()}`;
        if (hpBarEl) hpBarEl.style.width = `${pct}%`;

        const phase = phase1 ? 'PHASE 1' : 'PHASE 2 — ENRAGED';
        if (phaseEl) {
            const dist = Math.round(Math.hypot(boss.x - state.player.x, boss.y - state.player.y));
            let extra = bossKind === 'storm' ? 'MINIBOSS' : phase;
            if (bossKind === 'hooked') {
                extra = (boss.lineBroken === false && boss.hp / (boss.maxHp || 1) <= 0.30)
                    ? 'WEAKENED — REEL!'
                    : 'LINE BROKEN — SHOOT IT!';
            }
            phaseEl.innerText = `${extra} · 📍 ${dist}m`;
            phaseEl.className = phase1
                ? 'text-xs text-amber-300 font-bold mt-1 tracking-wider'
                : 'text-xs text-rose-400 font-black mt-1 tracking-wider animate-pulse';
        }
        // 10-death boss rule: chances left (see Player.die)
        try {
            const livesEl = $('boss-lives');
            if (livesEl) {
                const left = Math.max(0, 10 - (state.bossDeaths || 0));
                livesEl.innerText = `❤ ×${left}`;
            }
        } catch (e) {}
    },

    // Small per-fish combat cards (many can show at once): hooked fish +
    // every beached land monster (bosses excluded — they own the top bar) +
    // damaged open-world enemies. Rebuilds at most 5x/sec.
    _fightLastHTML: '',
    _fightLastTime: 0,
    updateFightList(state) {
        const wrap = $('fight-list');
        const rowsEl = $('fight-list-rows');
        const headEl = $('fight-list-header');
        if (!wrap || !rowsEl) return;
        const now = (typeof performance !== 'undefined' ? performance.now() : 0);
        if (now - this._fightLastTime < 200) return;
        this._fightLastTime = now;

        const rows = [];
        const f = state.fishing;
        if (f && f.mode === 'HOOKED' && f.hookedFish) {
            const hf = f.hookedFish;
            const sp = hf.species || {};
            const isBoss = !!sp.isBoss;
            rows.push({
                name: sp.name || 'Hooked Fish',
                color: sp.color || '#38bdf8',
                hp: Math.max(0, hf.hp || 0), max: Math.max(1, hf.maxHp || 1),
                sub: (hf.stamina !== undefined && hf.staminaMax)
                    ? { v: Math.max(0, hf.stamina), m: hf.staminaMax, c: '#facc15', label: 'STAM' } : null,
                tag: hf.isDead ? 'EXHAUSTED' : (isBoss ? (hf.lineBroken === false && hf.hp / (hf.maxHp || 1) <= 0.30 ? 'WEAKENED' : 'BOSS') : 'HOOKED'),
                tagCls: hf.isDead ? 'bg-slate-500/30 text-slate-300'
                    : isBoss ? 'bg-red-500/30 text-red-200' : 'bg-sky-500/30 text-sky-200'
            });
        }
        for (const m of (state.monstersOnLand || [])) {
            if (!m || (m.hp || 0) <= 0) continue;
            if (m.species && m.species.isBoss) continue; // top bar owns bosses
            const sp = m.species || {};
            rows.push({
                name: sp.name || 'Beached Fish',
                color: sp.color || '#f87171',
                hp: Math.max(0, m.hp), max: Math.max(1, m.maxHp || sp.maxHp || 1),
                sub: null,
                tag: 'LAND',
                tagCls: 'bg-amber-500/30 text-amber-200'
            });
        }
        for (const e of (state.enemies || [])) {
            if (!e || e.isBoss || (e.hp || 0) <= 0) continue;
            if (e.burrowed || e.state === 'burrowed') continue;
            // Only enemies actually being fought (damaged) get a card
            if (e.maxHp && e.hp >= e.maxHp) continue;
            const sp = e.species || {};
            rows.push({
                name: sp.name || (e.enemyType === 'seagull' ? 'Seagull' : e.enemyType === 'beachCrab' ? 'Beach Crab' : 'Enemy'),
                color: sp.color || '#fbbf24',
                hp: Math.max(0, e.hp), max: Math.max(1, e.maxHp || 1),
                sub: null,
                tag: 'WILD',
                tagCls: 'bg-emerald-500/30 text-emerald-200'
            });
        }

        if (!rows.length) {
            if (this._fightLastHTML !== '') { this._fightLastHTML = ''; wrap.classList.add('hidden'); }
            return;
        }
        const MAX_ROWS = 8;
        const shown = rows.slice(0, MAX_ROWS);
        const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : '' + Math.round(n);
        let html = shown.map(r => {
            const pct = Math.max(0, Math.min(100, Math.round((r.hp / r.max) * 100)));
            const low = pct <= 25;
            return `<div class="px-2 py-1.5 rounded-xl bg-slate-900/70 border border-slate-700/60 border-l-4" style="border-left-color:${r.color}">
                <div class="flex justify-between items-center gap-1">
                    <span class="text-[11px] font-bold text-white truncate">${r.name}</span>
                    <span class="text-[8px] font-black px-1 py-px rounded ${r.tagCls} shrink-0">${r.tag}</span>
                </div>
                <div class="flex justify-between text-[9px] font-bold mt-0.5">
                    <span class="${low ? 'text-rose-400' : 'text-slate-300'}">${fmt(r.hp)} / ${fmt(r.max)}</span>
                    <span class="${low ? 'text-rose-400' : 'text-slate-500'}">${pct}%</span>
                </div>
                <div class="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mt-0.5">
                    <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${r.color}"></div>
                </div>
                ${r.sub ? `<div class="w-full h-1 bg-slate-950 rounded-full overflow-hidden mt-0.5" title="Stamina">
                    <div class="h-full rounded-full" style="width:${Math.max(0, Math.min(100, Math.round((r.sub.v / r.sub.m) * 100)))}%;background:${r.sub.c}"></div>
                </div>` : ''}
            </div>`;
        }).join('');
        if (rows.length > MAX_ROWS) {
            html += `<div class="text-center text-[9px] font-black text-slate-400">+${rows.length - MAX_ROWS} more fighting…</div>`;
        }
        if (html !== this._fightLastHTML) {
            this._fightLastHTML = html;
            rowsEl.innerHTML = html;
            if (headEl) headEl.innerText = `⚔ IN COMBAT (${rows.length})`;
        }
        wrap.classList.remove('hidden');
    },

    updateMultiplayerHUD(info) {
        const statusEl = $('mp-status');
        if (statusEl) {
            const skins = (info && info.skins) ? ` · ${info.skins}` : '';
            if (info.isConnected) {
                const n = info.playerCount || 1;
                statusEl.innerHTML = `<i class="fa-solid fa-circle text-emerald-400 animate-pulse mr-1"></i>${info.isHost ? 'Host' : 'Client'} · ${info.roomCode} · ${n}/4${skins}`;
                statusEl.className = 'text-xs font-bold text-emerald-400';
            } else if (info.roomCode) {
                statusEl.innerHTML = `<i class="fa-solid fa-circle text-amber-400 mr-1"></i>Lobby: ${info.roomCode}${skins}`;
                statusEl.className = 'text-xs font-bold text-amber-400';
            } else {
                statusEl.innerHTML = `<i class="fa-solid fa-circle text-rose-400 mr-1"></i>Disconnected`;
                statusEl.className = 'text-xs font-bold text-rose-400';
            }
        }
    }
};

// ==========================================
// CANVAS SETUP & RESIZING
// ==========================================
const canvas = $('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() {
    if (!canvas || !state) return;
    const cssW = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
    const cssH = canvas.parentElement ? canvas.parentElement.clientHeight : window.innerHeight;
    // Low-tier mobile renders fewer backing pixels (CSS stretches the
    // result). Gameplay coordinates (water boundary) always use CSS size
    // so the world never shrinks with the resolution.
    let scale = 1;
    try { if (typeof TouchControls !== 'undefined') scale = TouchControls.renderScale() || 1; } catch (e) {}
    canvas.width = Math.max(2, Math.round(cssW * scale));
    canvas.height = Math.max(2, Math.round(cssH * scale));
    state.canvasWidth = canvas.width;
    state.canvasHeight = canvas.height;
    state.renderScale = scale;
    state.waterBoundaryX = cssW * ((typeof CONFIG !== 'undefined' && CONFIG.WATER_BOUNDARY_RATIO) || 0.65);
}

// ==========================================
// GLOBAL ENGINE STATE
// ==========================================
const state = {
    player: {
        x: 300, y: 300,
        radius: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_RADIUS) || 16,
        speed: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_SPEED) || 220,
        hp: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_MAX_HP) || 100,
        maxHp: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_MAX_HP) || 100,

        equippedWeapons: ['pistol', null, null, null],
        activeSlot: 0,
        ownedWeapons: ['pistol'],
        gunSkins: {},

        weaponAmmo: { pistol: Infinity, shotgun: 20, rifle: 60, harpoon: 10 },
        equippedRod: (typeof RODS !== 'undefined' && RODS[0]) || { tensionMax: 100, luck: 0 },
        unlockedRods: ['rod_starter'],
        coins: 150,
        bucket: [],
        bucketCapacity: 15,
        caughtFish: [], // Fish index - tracks unique species caught
        slainBosses: [], // Boss index - boss ids killed (incl. 'stormcaller')
        achievements: { unlocked: [], progress: {} }, // Achievement records
        totalFishCaught: 0, // Lifetime catches (fishing achievements)
        totalKills: 0, // Lifetime enemy kills (combat achievements)
        bossKills: 0, // Lifetime boss kills
        casinoTotalLost: 0, // Lifetime casino losses (bankrupt achievement)
        baitStock: {}, // Crafted bait counts (Ritual system)
        activeBait: null, // Equipped fishing bait id (per-hook stock model)
        inCave: false, // Inside the sealed cave map (E at the beach hole)
        returnPos: null, // Beach spot to return to on cave exit

        lastShotTime: -999,
        weaponRecoil: 0,
        muzzleFlash: 0,
        reloading: false,
        reloadTimer: 0,

        xp: 0,
        level: 1,
        xpToNext: (typeof CONFIG !== 'undefined' && CONFIG.XP_LEVEL_BASE) || 100,
        facing: 1,

        stunTimer: 0,
        slowTimer: 0,
        burnTimer: 0,
        burnTick: 0,
        seagullKills: 0
    },
    keys: {},
    mouse: { x: 0, y: 0, isDown: false, worldX: 0, worldY: 0 },
    camera: { x: 300, y: 300, zoom: 1.0, targetZoom: 1.0, shakeX: 0, shakeY: 0 },
    fishing: {
        mode: 'IDLE',
        castPower: 0,
        castDir: 1,
        bobber: { x: 0, y: 0 },
        lineTension: 0,
        hookedFish: null,
        biteTimer: 0,
        waitingTime: 0
    },
    activeBoss: null,
    bossDeaths: 0, // deaths spent in the current boss fight (10 = it leaves)
    monstersOnLand: [],
    groundHazards: [],
    bullets: [],
    delayedBlasts: [],
    particles: [],
    floatingTexts: [],
    groundLoot: [],
    waterBoundaryX: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    screenShake: 0,
    time: 0,

    paused: true,

    remotePlayer: null,
    remotePlayers: {},
    multiplayer: null
};

// Size the canvas now that `state` exists
window.addEventListener('resize', resizeCanvas);
// Some mobile browsers don't fire resize reliably on rotation.
window.addEventListener('orientationchange', () => {
    setTimeout(() => { try { resizeCanvas(); } catch (e) {} }, 120);
    setTimeout(() => { try { resizeCanvas(); } catch (e) {} }, 500);
});
resizeCanvas();

// Init subsystems
if (typeof Input !== 'undefined' && canvas) Input.init(state, canvas);
if (typeof TouchControls !== 'undefined') TouchControls.init(state);
if (typeof Shop !== 'undefined') Shop.init(state);

// Procedural art is the default everywhere. PNGs are opt-in:
//  - fish: only species with explicit `image: 'name'` (see js/fishData.js)
//    plus per-fish player uploads from the Fish Index.
//  - guns/bobbers: only player uploads are restored at boot. Shipped
//    assets/guns/*.png and assets/bobbers/*.png files are probed lazily
//    (once per session) when the Guns/Rods tab renders, so a fresh page
//    load never fires hundreds of 404s for files that don't exist.
try {
    if (typeof FishImageLoader !== 'undefined' && typeof FISH_SPECIES !== 'undefined') {
        FishImageLoader.preload(FISH_SPECIES);
    }
    if (typeof GunSkinLoader !== 'undefined' && typeof WEAPONS !== 'undefined') {
        GunSkinLoader.restoreUploads(WEAPONS.map(w => w.skin || w.id));
    }
    if (typeof BobberLoader !== 'undefined' && typeof RODS !== 'undefined') {
        BobberLoader.restoreUploads([...new Set(RODS.map(r => r.bobberModel || 'classic'))]);
    }
} catch (e) {}

// Audio toggle
const audioBtn = $('btn-audio');
if (audioBtn) {
    audioBtn.onclick = () => {
        if (typeof audio !== 'undefined') {
            const m = !audio.muted;
            if (typeof audio.setMuted === 'function') audio.setMuted(m);
            else audio.muted = m;
            const icon = $('audio-icon');
            if (icon) {
                icon.className = audio.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
            }
        }
    };
}

// ==========================================
// MULTIPLAYER UI
// ==========================================
const MultiplayerUI = {
    currentPanel: 'main',
    state: null,

    init(state) {
        this.state = state;
        this.bindEvents();
    },

    bindEvents() {
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

        on('btn-multiplayer', () => this.showPanel('multiplayer'));
        on('btn-host',        () => this.hostGame());
        on('btn-join',        () => this.showPanel('join'));
        on('btn-mp-back',     () => this.showPanel('main'));
        on('btn-join-back',   () => this.showPanel('multiplayer'));
        on('btn-copy-room',   () => this.copyRoomCode());
        on('btn-leave-lobby', () => this.leaveLobby());
        on('btn-start-mp',    () => this.startMultiplayerGame());
        on('mp-exit-btn',     () => this.forceExitMultiplayer());
        on('btn-mp-new',      () => this.selectExpedition('new'));
        on('btn-mp-continue', () => this.selectExpedition('continue'));

        // Pilot name: asked once, remembered, shown to the whole room.
        ['mp-player-name', 'mp-player-name-join'].forEach(id => {
            const inp = $(id);
            if (inp) {
                inp.addEventListener('input', () => this.syncNameInputs(id));
                inp.addEventListener('keydown', (e) => { e.stopPropagation(); });
            }
        });

        document.querySelectorAll('.mp-slot-btn').forEach(btn => {
            btn.onclick = () => {
                const slot = parseInt(btn.dataset.slot, 10) || 1;
                try { audio.playUIClick(); } catch (e) {}
                this.selectMPSlot(slot);
            };
        });

        document.querySelectorAll('.save-slot-btn').forEach(btn => {
            btn.onclick = () => {
                if (typeof SaveSystem !== 'undefined' && this.state) {
                    this.state.saveSlot = parseInt(btn.dataset.slot, 10) || 1;
                    SaveSystem.setSlot(this.state.saveSlot);
                    try { audio.playUIClick(); } catch (e) {}
                    this.refreshSlotRow();
                    if (typeof MainMenu !== 'undefined') MainMenu.refreshContinueBtn();
                }
            };
        });

        const joinSubmit = $('btn-join-submit');
        const joinInput = $('join-room-code');
        if (joinSubmit) joinSubmit.onclick = () => this.joinGame(joinInput ? joinInput.value : '');
        if (joinInput) {
            joinInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.joinGame(joinInput.value);
            });
        }
    },

    // ---- Single-player save slots ----
    refreshSlotRow() {
        if (typeof SaveSystem === 'undefined' || !this.state) return;
        const cur = this.state.saveSlot || SaveSystem.getSlot();
        document.querySelectorAll('.save-slot-btn').forEach(btn => {
            const slot = parseInt(btn.dataset.slot, 10);
            const meta = SaveSystem.slotMeta(slot);
            const active = slot === cur;
            btn.className = `save-slot-btn flex-1 px-2 py-1.5 rounded-lg text-xs font-black border transition-all ${
                active
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700 text-slate-300'
            }`;
            btn.innerHTML = meta ? `Slot ${slot}<br><span class="text-[9px] font-bold opacity-80">Lv.${meta.level} · ${meta.coins}c</span>` : `Slot ${slot}<br><span class="text-[9px] font-bold opacity-60">empty</span>`;
        });
        const metaEl = $('save-slot-meta');
        if (metaEl) {
            const meta = SaveSystem.slotMeta(cur);
            metaEl.innerText = meta && meta.savedAt
                ? `Slot ${cur} · Lv.${meta.level} · ${meta.coins}c · saved ${new Date(meta.savedAt).toLocaleString()}`
                : `Slot ${cur} selected · no save yet`;
        }
    },

    // ---- Multiplayer identity: pilot name (asked, remembered, shown) ----
    esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    paintNameInputs() {
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.playerName) return;
            const cur = Multiplayer.playerName() || '';
            ['mp-player-name', 'mp-player-name-join'].forEach(id => {
                const el = $(id);
                if (el && document.activeElement !== el && !el.value) el.value = cur;
            });
        } catch (e) {}
    },

    syncNameInputs(fromId) {
        try {
            const src = $(fromId);
            if (!src || typeof Multiplayer === 'undefined' || !Multiplayer.setPlayerName) return;
            const saved = Multiplayer.setPlayerName(src.value);
            ['mp-player-name', 'mp-player-name-join'].forEach(id => {
                if (id === fromId) return;
                const el = $(id);
                if (el && document.activeElement !== el) el.value = saved;
            });
            if (typeof Multiplayer.getRoster === 'function') this.refreshRoster();
        } catch (e) {}
    },

    // Returns the pilot name, or '' + points at the field when missing.
    requireName(joinFlow) {
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.playerName) return 'Angler';
            let nm = Multiplayer.playerName();
            if (!nm) {
                const el = $(joinFlow ? 'mp-player-name-join' : 'mp-player-name');
                if (el && el.value && el.value.trim()) {
                    nm = Multiplayer.setPlayerName(el.value);
                }
            }
            if (!nm) {
                if (joinFlow) this.setJoinStatus('Type your pilot name first — the room will see it.', 'rose');
                else UI.updateStatusBanner('Type your pilot name first — the room will see it.', 'Name', 'rose');
                const el = $(joinFlow ? 'mp-player-name-join' : 'mp-player-name');
                if (el) el.focus();
                return '';
            }
            return nm;
        } catch (e) { return 'Angler'; }
    },

    // ---- Personal MP files: slots 1-3, separate from single player ----
    mpSlot() {
        try {
            if (this.state && this.state.mpSaveSlot) return this.state.mpSaveSlot;
            if (typeof SaveSystem !== 'undefined') return SaveSystem.getMPSlot();
        } catch (e) {}
        return 1;
    },

    refreshMPSlotRow() {
        try {
            if (typeof SaveSystem === 'undefined' || !this.state) return;
            const cur = this.mpSlot();
            document.querySelectorAll('.mp-slot-btn').forEach(btn => {
                const slot = parseInt(btn.dataset.slot, 10);
                const meta = SaveSystem.mpMeta(slot);
                const active = slot === cur;
                btn.className = `mp-slot-btn flex-1 px-2 py-1.5 rounded-lg text-xs font-black border transition-all ${
                    active
                        ? 'bg-sky-500/25 border-sky-400 text-sky-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300'
                }`;
                btn.innerHTML = meta ? `Slot ${slot}<br><span class="text-[9px] font-bold opacity-80">Lv.${meta.level} · ${meta.coins}c</span>` : `Slot ${slot}<br><span class="text-[9px] font-bold opacity-60">empty</span>`;
            });
            const metaEl = $('mp-slot-meta');
            if (metaEl) {
                const meta = SaveSystem.mpMeta(cur);
                metaEl.innerText = meta && meta.savedAt
                    ? `Slot ${cur} · Lv.${meta.level} · ${meta.coins}c · saved ${new Date(meta.savedAt).toLocaleString()}`
                    : `Slot ${cur} selected · no MP save yet (fresh pilot)`;
            }
        } catch (e) {}
    },

    selectMPSlot(slot) {
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.enterMPProfile) {
                Multiplayer.enterMPProfile(slot);
            }
            this.refreshMPSlotRow();
            this.refreshExpeditionBox();
            this.refreshRoster();
        } catch (e) {}
    },

    // ---- Lobby roster (names, not just counts) ----
    refreshRoster() {
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.getRoster) return;
            const roster = Multiplayer.getRoster();
            this.renderLobbyPlayers(roster);
            const cnt = roster.length;
            const startBtn = $('btn-start-mp');
            if (startBtn && window.Multiplayer && window.Multiplayer.isHost) {
                startBtn.disabled = cnt < 2;
            }
        } catch (e) {}
    },

    // ---- Host expedition save (shared MP file) ----
    expeditionMode: 'continue', // 'new' | 'continue'

    refreshExpeditionBox() {
        const isHostView = !window.Multiplayer || window.Multiplayer.isHost || !window.Multiplayer.roomCode;
        const box = $('mp-expedition-box');
        if (box) box.style.display = isHostView ? '' : 'none';
        const title = $('mp-expedition-title');
        if (title) title.innerText = isHostView ? 'EXPEDITION SAVE (YOUR MP FILE)' : 'EXPEDITION SAVE';
        const slot = this.mpSlot();
        const metaEl = $('mp-save-meta');
        if (typeof SaveSystem !== 'undefined' && metaEl) {
            const meta = SaveSystem.mpMeta(slot);
            metaEl.innerText = meta && meta.savedAt
                ? `Slot ${slot} · Lv.${meta.level} · ${meta.coins}c · ${new Date(meta.savedAt).toLocaleString()}`
                : `Slot ${slot} has no expedition yet — pick NEW`;
            if (!meta && this.expeditionMode === 'continue') this.expeditionMode = 'new';
        }
        const nBtn = $('btn-mp-new');
        const cBtn = $('btn-mp-continue');
        if (nBtn) nBtn.className = `flex-1 px-2 py-2 rounded-xl text-xs font-black border transition-all ${this.expeditionMode === 'new' ? 'bg-sky-500/25 border-sky-400 text-sky-300' : 'bg-slate-800/60 border-slate-600 text-slate-200'}`;
        if (cBtn) {
            const has = typeof SaveSystem !== 'undefined' && SaveSystem.existsMP(this.mpSlot());
            cBtn.disabled = !has;
            cBtn.className = `flex-1 px-2 py-2 rounded-xl text-xs font-black border transition-all ${this.expeditionMode === 'continue' ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300' : 'bg-slate-800/60 border-slate-600 text-slate-200'} ${has ? '' : 'opacity-40 cursor-not-allowed'}`;
        }
    },

    selectExpedition(mode) {
        this.expeditionMode = mode;
        try { audio.playUIClick(); } catch (e) {}
        this.refreshExpeditionBox();
    },

    showPanel(panel) {
        document.querySelectorAll('.mp-panel').forEach(p => p.classList.add('hidden'));
        const panelEl = $(`mp-panel-${panel}`);
        if (panelEl) panelEl.classList.remove('hidden');
        this.currentPanel = panel;
        if (panel === 'multiplayer') { this.refreshPeerRow(); this.paintNameInputs(); }
        if (panel === 'join') this.paintNameInputs();
        if (panel === 'lobby') {
            this.paintNameInputs();
            this.refreshMPSlotRow();
            this.refreshExpeditionBox();
            this.refreshRoster();
        }
        if (panel === 'main' && typeof MainMenu !== 'undefined' && MainMenu.refreshContinueBtn) {
            try { MainMenu.refreshContinueBtn(); } catch (e) {}
        }
    },

    // PeerJS cloud status (no localhost server needed anymore).
    // Pre-warms the cloud link so Host/Join is instant.
    refreshPeerRow() {
        try {
            const status = $('mp-peer-status');
            const verTag = $('mp-version-tag');
            if (verTag) {
                const v = (typeof GAME_VERSION === 'string' && GAME_VERSION) ? GAME_VERSION : '1.2.5';
                verTag.innerText = 'v' + v + ' · same version required to play together';
            }
            if (!status) return;
            if (typeof PeerLink === 'undefined' || typeof Peer === 'undefined') {
                status.innerText = 'PeerJS library blocked — check connection/adblock and reload.';
                status.className = 'text-[10px] mt-1 text-rose-400';
                return;
            }
            const paint = () => {
                const el = $('mp-peer-status');
                if (!el) return;
                const st = (typeof PeerLink !== 'undefined' && PeerLink.cloud) || 'idle';
                if (st === 'online') {
                    el.innerText = '● PeerJS cloud: online — host or join with a 4-character code.';
                    el.className = 'text-[10px] mt-1 text-emerald-400';
                } else if (st === 'connecting') {
                    el.innerText = '● PeerJS cloud: connecting…';
                    el.className = 'text-[10px] mt-1 text-sky-400';
                } else if (st === 'error') {
                    el.innerText = '● PeerJS cloud: ' + ((PeerLink && PeerLink.cloudError) || 'unreachable — Try again.');
                    el.className = 'text-[10px] mt-1 text-rose-400';
                } else {
                    el.innerText = '● PeerJS cloud: checking…';
                    el.className = 'text-[10px] mt-1 text-slate-500';
                }
            };
            paint();
            if (typeof PeerLink !== 'undefined' && PeerLink.warmup && !window.Multiplayer.roomCode) {
                PeerLink.onCloudStatus = () => paint();
                PeerLink.warmup(9000).then(paint, paint);
            }
        } catch (e) {}
    },

    async hostGame() {
        if (!window.Multiplayer) {
            UI.updateStatusBanner('Multiplayer module not loaded', 'Error', 'rose');
            return;
        }
        // Pilot name first — the room sees it, and rejoining with it works.
        if (!this.requireName(false)) return;

        this.showPanel('lobby');
        this.setLobbyStatus('Creating room...');
        this.refreshRoster();

        try {
            const roomCode = await window.Multiplayer.createRoom();
            // Switch to the personal MP profile (SP files stay untouched).
            if (window.Multiplayer.enterMPProfile) window.Multiplayer.enterMPProfile();
            this.setLobbyStatus(`Room created: ${roomCode} - Waiting for player...`);
            const codeEl = $('mp-room-code');
            if (codeEl) codeEl.innerText = roomCode;
            // Start stays disabled until Player 2 joins
            const startBtn = $('btn-start-mp');
            if (startBtn) startBtn.disabled = true;
            this.refreshMPSlotRow();
            this.refreshExpeditionBox();
            this.refreshRoster();
        } catch (e) {
            this.setLobbyStatus(`Failed: ${e.message}`, 'rose');
            this.showPanel('multiplayer');
        }
    },

    async joinGame(roomCode) {
        if (!window.Multiplayer) {
            UI.updateStatusBanner('Multiplayer module not loaded', 'Error', 'rose');
            return;
        }

        if (!roomCode || roomCode.length !== 4) {
            this.setJoinStatus('Enter a 4-character room code', 'rose');
            return;
        }
        if (!this.requireName(true)) return;

        this.setJoinStatus('Connecting...');

        try {
            await window.Multiplayer.joinRoom(roomCode.toUpperCase());
            // Personal MP profile for this browser (SP files stay untouched).
            if (window.Multiplayer.enterMPProfile) window.Multiplayer.enterMPProfile();
            this.showPanel('lobby');
            this.setLobbyStatus(`Joined room: ${roomCode.toUpperCase()} - Waiting for host to start...`);
            const codeEl = $('mp-room-code');
            if (codeEl) codeEl.innerText = roomCode.toUpperCase();
            const startBtn = $('btn-start-mp');
            if (startBtn) startBtn.disabled = true;
            this.refreshMPSlotRow();
            this.refreshExpeditionBox();
            this.refreshRoster();
        } catch (e) {
            const msg = (e && e.message) || 'Join failed';
            if (/Name taken/i.test(msg)) {
                // Same-origin tabs share localStorage — and a DUPLICATED
                // tab even clones sessionStorage — so the rejected name
                // may not be the player's fault at all. Hand them a free
                // name instead of a dead end (retrying with it succeeds).
                try {
                    const inp = $('mp-player-name-join');
                    const raw = ((inp && inp.value) || (window.Multiplayer && window.Multiplayer.playerName && window.Multiplayer.playerName()) || 'Angler');
                    const base = String(raw).replace(/[<>&"']/g, '').trim().slice(0, 9) || 'Angler';
                    const sug = (base + Math.floor(Math.random() * 90 + 10)).slice(0, 12);
                    if (inp) { inp.value = sug; inp.focus(); inp.select(); }
                    if (window.Multiplayer && window.Multiplayer.setPlayerName) window.Multiplayer.setPlayerName(sug);
                    try { if (window.Multiplayer && window.Multiplayer.mpLog) window.Multiplayer.mpLog('name-taken', `"${base}" taken — suggested "${sug}"`); } catch (ee) {}
                    this.setJoinStatus(`"${base}" is taken in this room — try "${sug}" (filled in, hit Join again).`, 'rose');
                } catch (ee) {
                    this.setJoinStatus(`Failed: ${msg}`, 'rose');
                }
                return;
            }
            this.setJoinStatus(`Failed: ${msg}`, 'rose');
        }
    },

    renderLobbyPlayers(roster) {
        const list = $('mp-lobby-players');
        const countEl = $('mp-lobby-count');
        // Legacy callers passed a headcount — upgrade to a 1-deep roster.
        if (typeof roster === 'number') {
            const n = Math.min(4, Math.max(1, roster));
            roster = [];
            for (let i = 0; i < n; i++) {
                roster.push({ id: 'p' + i, name: i === 0 ? 'Host' : 'Player ' + (i + 1), isYou: false, isHost: i === 0 });
            }
        }
        if (!Array.isArray(roster)) roster = [];
        roster = roster.slice(0, 4);
        const count = Math.max(1, roster.length);
        if (countEl) countEl.innerText = `${count} / 4`;
        if (!list) return;
        const row = (name, badge, badgeCls, dot) => `
            <div class="flex items-center gap-2 glass-panel px-3 py-2 rounded-xl">
                <span class="w-2 h-2 rounded-full ${dot}"></span>
                <i class="fa-solid fa-user text-slate-400 text-xs"></i>
                <span class="text-xs font-bold text-white flex-1">${name}</span>
                <span class="px-1.5 py-0.5 rounded text-[9px] font-black ${badgeCls}">${badge}</span>
            </div>`;
        let html = '';
        roster.forEach((m, i) => {
            const nm = this.esc(m.name || ('Player ' + (i + 1)));
            const tags = [];
            if (m.isHost) tags.push('HOST');
            if (m.isYou) tags.push('YOU');
            const badge = tags.length ? tags.join(' · ') : ('P' + (i + 1));
            html += row(
                nm,
                badge,
                m.isYou
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : (m.isHost
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'),
                'bg-emerald-400 animate-pulse'
            );
        });
        for (let i = roster.length; i < 4; i++) {
            html += row(
                `Player ${i + 1}`,
                'WAITING...',
                'bg-slate-700/60 text-slate-400 border border-slate-600',
                'bg-slate-500'
            );
        }
        list.innerHTML = html;
    },

    showLoading(text, sub) {
        const ov = $('mp-loading-overlay');
        if (!ov) return;
        const t = $('mp-loading-text');
        const s = $('mp-loading-sub');
        if (t && text) t.innerText = text;
        if (s && sub) s.innerText = sub;
        ov.classList.remove('hidden');
        ov.classList.add('flex');
    },

    hideLoading() {
        const ov = $('mp-loading-overlay');
        if (!ov) return;
        ov.classList.add('hidden');
        ov.classList.remove('flex');
    },

    setLobbyStatus(msg, theme = 'sky') {
        const el = $('mp-lobby-status');
        if (el) {
            el.innerText = msg;
            el.className = `text-sm font-bold ${theme === 'rose' ? 'text-rose-400' : theme === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`;
        }
    },

    setJoinStatus(msg, theme = 'sky') {
        const el = $('mp-join-status');
        if (el) {
            el.innerText = msg;
            el.className = `text-sm font-bold ${theme === 'rose' ? 'text-rose-400' : theme === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`;
        }
    },

    copyRoomCode() {
        const codeEl = $('mp-room-code');
        if (!codeEl) return;
        const code = codeEl.innerText;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(() => {
                this.setLobbyStatus('Room code copied!', 'emerald');
                setTimeout(() => this.setLobbyStatus(`Room: ${code} - Waiting for player...`), 1500);
            }).catch(() => this.setLobbyStatus('Copy failed — select manually.', 'rose'));
        } else {
            this.setLobbyStatus('Clipboard unavailable — select manually.', 'rose');
        }
    },

    leaveLobby() {
        this.hideLoading();
        if (window.Multiplayer) {
            if (window.Multiplayer.exitMPProfile) window.Multiplayer.exitMPProfile();
            window.Multiplayer.leaveRoom();
        }
        this.showPanel('multiplayer');
    },

    async startMultiplayerGame() {
        if (!window.Multiplayer || !window.Multiplayer.isHost) return;
        // Apply the host's expedition choice on THEIR MP slot: shared
        // world for the room, personal file for the host.
        if (typeof SaveSystem !== 'undefined') {
            const slot = this.mpSlot();
            if (this.expeditionMode === 'continue' && SaveSystem.existsMP(slot)) {
                SaveSystem.loadMP(this.state, slot);
                UI.updateStatusBanner(`Expedition slot ${slot} loaded.`, 'Expedition', 'emerald');
            } else {
                SaveSystem.wipeMP(slot);
                SaveSystem.freshPlayer(this.state);
                SaveSystem.saveMP(this.state, slot);
                this.expeditionMode = 'new';
                UI.updateStatusBanner(`New expedition started (slot ${slot}).`, 'Expedition', 'emerald');
            }
            if (typeof Player !== 'undefined') {
                Player.refreshHUD(this.state);
                Player.refreshWeaponHUD(this.state);
            }
            if (typeof Casino !== 'undefined') {
                try { Casino.tokens = this.state.player.casinoTokens || 0; Casino.updateTokenDisplay(); } catch (e) {}
            }
            this.refreshExpeditionBox();
        }
        // Loading on the host screen while the client is pulled in
        this.showLoading('STARTING...', 'Waiting for players');
        if (typeof MainMenu !== 'undefined') MainMenu.hide();
        this.showInGameHUD();
        // Host sim stays authoritative — start pushing world state now
        if (window.Multiplayer.startStateSync) window.Multiplayer.startStateSync();
        const acked = await window.Multiplayer.sendGameStartWithRetry();
        // Custom-art sync: everyone publishes their skins so all peers
        // render the same pixels (streams in background, game is playable).
        try {
            if (typeof PeerSkins !== 'undefined') PeerSkins.startSession();
        } catch (e) {}
        this.hideLoading();
        if (acked) {
            this.setLobbyStatus('Player 2 is in!', 'emerald');
            UI.updateStatusBanner('Player 2 joined the hunt!', 'Start', 'emerald');
        } else {
            UI.updateStatusBanner('Started without Player 2 ack — they may still be loading', 'Start', 'amber');
        }
    },

    showInGameHUD() {
        const hud = $('mp-hud');
        if (hud) hud.classList.remove('hidden');
    },

    hideInGameHUD() {
        const hud = $('mp-hud');
        if (hud) hud.classList.add('hidden');
    },

    forceExitMultiplayer() {
        this.hideLoading();
        if (window.Multiplayer) {
            // Saves the MP character, restores the SP slot, then leaves.
            if (window.Multiplayer.exitMPProfile) window.Multiplayer.exitMPProfile();
            window.Multiplayer.cleanup();
        }
        this.hideInGameHUD();
        if (typeof MainMenu !== 'undefined') MainMenu.show();
        UI.updateStatusBanner('Left multiplayer session (single-player save restored)', 'Exit', 'amber');
    },

    updateHUD() {
        if (window.Multiplayer) {
            const info = window.Multiplayer.getConnectionInfo();
            UI.updateMultiplayerHUD(info);
        }
    },

    // Player-visible MP event log: last 5 in the lobby box, last event
    // on the in-game HUD. Called by Multiplayer.mpLog on every event.
    refreshMpLog() {
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.mpLogList) return;
            const list = Multiplayer.mpLogList().slice(-5);
            const box = $('mp-log-list');
            if (box) {
                if (!list.length) {
                    box.innerHTML = '<div class="text-slate-600">— no events yet —</div>';
                } else {
                    box.innerHTML = list.map(e => {
                        const d = new Date(e.t);
                        const hh = String(d.getHours()).padStart(2, '0');
                        const mm = String(d.getMinutes()).padStart(2, '0');
                        const ss = String(d.getSeconds()).padStart(2, '0');
                        const hot = /reject|mismatch|full|taken|unavailable|left|no-snapshot|bad-pid|fail|error/i.test(e.code);
                        return `<div class="${hot ? 'text-rose-300' : 'text-slate-400'}">[${hh}:${mm}:${ss}] <b>${this.esc(e.code)}</b>: ${this.esc(e.msg)}</div>`;
                    }).join('');
                    box.scrollTop = box.scrollHeight;
                }
            }
            const hud = $('mp-hud-log');
            if (hud) {
                const last = Multiplayer.mpLogList().slice(-1)[0];
                hud.innerText = last ? `${last.code}: ${last.msg}` : '—';
            }
            // Feedback panel preview stays fresh while open.
            try {
                if (typeof Feedback !== 'undefined' && !document.getElementById('feedback-modal').classList.contains('hidden')) {
                    Feedback.refreshLogPreview();
                }
            } catch (e) {}
        } catch (e) {}
    },

    onPlayerJoined() {
        const cnt = (window.Multiplayer && window.Multiplayer._lobbyCount) || 2;
        this.setLobbyStatus(`Player joined! (${cnt}/4) Ready to start.`, 'emerald');
        this.refreshRoster();
        const startBtn = $('btn-start-mp');
        if (startBtn) startBtn.disabled = false;
    },

    onPlayerLeft() {
        const cnt = (window.Multiplayer && window.Multiplayer._lobbyCount) || 1;
        this.setLobbyStatus(`Player left. (${cnt}/4) Waiting for players...`, 'rose');
        this.refreshRoster();
        const startBtn = $('btn-start-mp');
        if (startBtn) startBtn.disabled = cnt < 2;
    }
};

// ==========================================
// PAUSE MENU (in-game ESC — never jumps to the main menu)
// ==========================================
const PauseMenu = {
    isOpen() {
        const el = $('pause-menu');
        return !!(el && !el.classList.contains('hidden'));
    },

    open() {
        const el = $('pause-menu');
        if (!el) return;
        try {
            if (typeof state !== 'undefined' && state.player && state.player.isDead) return;
        } catch (e) {}
        const quit = $('btn-pause-quit');
        if (quit) {
            const span = quit.querySelector('span');
            let inRoom = false;
            try { inRoom = !!(typeof Multiplayer !== 'undefined' && Multiplayer.roomCode); } catch (e) {}
            if (span) span.innerText = inRoom ? 'Leave Server' : 'Leave to Main Menu';
        }
        const msg = $('pause-save-msg');
        if (msg) msg.innerText = '';
        el.classList.remove('hidden');
        el.classList.add('flex');
        try { if (typeof state !== 'undefined') state.paused = true; } catch (e) {}
    },

    close(resume) {
        const el = $('pause-menu');
        if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
        if (resume === false) return;
        try {
            const menu = $('main-menu');
            const dead = state.player && state.player.isDead;
            if ((!menu || menu.classList.contains('hidden')) && !dead) state.paused = false;
        } catch (e) {}
    },

    bind() {
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
        on('btn-pause-resume', () => {
            try { audio.playUIClick(); } catch (e) {}
            this.close(true);
        });
        on('btn-pause-save', () => {
            try { audio.playUIClick(); } catch (e) {}
            const msg = $('pause-save-msg');
            let ok = false;
            try { if (typeof SaveSystem !== 'undefined') ok = SaveSystem.save(state); } catch (e) {}
            if (msg) {
                msg.innerText = ok ? 'Progress saved!' : 'Save failed.';
                msg.className = 'text-center text-[11px] font-bold min-h-[1rem] ' + (ok ? 'text-emerald-300' : 'text-rose-300');
            }
        });
        on('btn-pause-quit', () => {
            try { audio.playUIClick(); } catch (e) {}
            this.close(false);
            try {
                if (typeof MultiplayerUI !== 'undefined' && window.Multiplayer && window.Multiplayer.roomCode) {
                    MultiplayerUI.forceExitMultiplayer();
                } else if (typeof MainMenu !== 'undefined') {
                    MainMenu.show();
                }
            } catch (e) {}
        });
    }
};

// ==========================================
// TAB PLAYER LIST (Minecraft-style: visible only while TAB is held)
// Bug report + Leave server live here — nowhere else in-game.
// ==========================================
const TabList = {
    esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    isOpen() {
        const ov = $('tablist-overlay');
        return !!(ov && !ov.classList.contains('hidden'));
    },

    show() {
        const ov = $('tablist-overlay');
        if (!ov) return;
        try {
            const menu = $('main-menu');
            if (menu && !menu.classList.contains('hidden')) return; // in-game only
            if (typeof state !== 'undefined' && state.player && state.player.isDead) return;
        } catch (e) {}
        this.render();
        ov.classList.remove('hidden');
        ov.classList.add('flex');
    },

    hide() {
        const ov = $('tablist-overlay');
        if (ov) { ov.classList.add('hidden'); ov.classList.remove('flex'); }
    },

    render() {
        const rows = $('tablist-rows');
        const cnt = $('tablist-count');
        const room = $('tablist-room');
        let list = [];
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.roomCode && Multiplayer.getRoster) {
                list = Multiplayer.getRoster() || [];
            }
        } catch (e) { list = []; }
        list = list.slice(0, 4);
        const inRoom = list.length > 0;
        if (cnt) cnt.innerText = inRoom ? `${list.length}/4` : 'SOLO';
        if (room) {
            let code = '';
            try { code = (typeof Multiplayer !== 'undefined' && Multiplayer.roomCode) || ''; } catch (e) {}
            room.innerText = code ? `· ${code}` : '';
        }
        if (!rows) return;
        if (!inRoom) {
            let me = 'You';
            try {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.playerName) me = Multiplayer.playerName() || 'You';
            } catch (e) {}
            rows.innerHTML =
                `<div class="flex items-center gap-2 glass-panel px-3 py-2 rounded-xl">` +
                `<span class="w-2 h-2 rounded-full bg-sky-400"></span>` +
                `<i class="fa-solid fa-user text-slate-400 text-xs"></i>` +
                `<span class="text-xs font-bold text-white flex-1">${this.esc(me)}</span>` +
                `<span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-700/60 text-slate-300 border border-slate-600">SOLO</span></div>`;
            return;
        }
        rows.innerHTML = list.map((m, i) => {
            const nm = this.esc(m.name || ('Player ' + (i + 1)));
            const tags = [];
            if (m.isHost) tags.push('👑 HOST');
            if (m.isYou) tags.push('YOU');
            const badge = tags.length ? tags.join(' · ') : ('P' + (i + 1));
            const cls = m.isYou
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : (m.isHost
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30');
            return `<div class="flex items-center gap-2 glass-panel px-3 py-2 rounded-xl">` +
                `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>` +
                `<i class="fa-solid fa-user text-slate-400 text-xs"></i>` +
                `<span class="text-xs font-bold text-white flex-1">${nm}</span>` +
                `<span class="px-1.5 py-0.5 rounded text-[9px] font-black ${cls}">${this.esc(badge)}</span></div>`;
        }).join('');
    }
};

// ==========================================
// FISH INDEX (now includes BOSSES — kill to discover)
// ==========================================
// Stormcaller isn't a hooked fish (she's a seagull miniboss), so she gets
// a virtual index entry. Slain by either route lands in
// player.slainBosses; the card paints with the real seagull renderer.
const STORMCALLER_INFO = {
    id: 'stormcaller', name: 'Stormcaller', color: '#f87171', accent: '#fecaca',
    size: 34, maxHp: 9000, staminaMax: 3000, attack: 70, speed: 5.5,
    value: 4000, rarity: 'boss', shape: 'seagull', finColor: '#991b1b',
    desc: 'Mother of gulls. Comes when 20 of her children fall. Enrages under 40% HP.',
    skills: ['strike', 'feathers', 'roar'], skillName: 'Strike / Feather Barrage / Roar'
};

const FishIndex = {
    currentFilter: 'all',
    ingameFilter: 'all',

    // All displayable entries: every fish + Stormcaller (bosses included —
    // kill to discover, shown under the Boss filter)
    allEntries() {
        return [...FISH_SPECIES, STORMCALLER_INFO];
    },

    // Discovered ids = caught fish + slain bosses (kill counts even if
    // the loot was never picked up)
    discoveredIds() {
        const caught = (this.state.player.caughtFish || []).filter(f => FISH_SPECIES.some(s => s.id === f.id));
        const slain = (this.state.player.slainBosses || []).filter(id =>
            id === STORMCALLER_INFO.id || FISH_SPECIES.some(s => s.id === id));
        return new Set([...caught.map(f => f.id), ...slain]);
    },

    indexTotal() {
        // Unique ids only: the roster contains duplicate id entries, and
        // only unique ids (+ Stormcaller) are actually discoverable.
        try {
            return new Set(this.allEntries().map(f => f.id)).size;
        } catch (e) {
            return FISH_SPECIES.length + 1; // + Stormcaller
        }
    },

    init(state) {
        this.state = state;
        this.bindEvents();
    },

    bindEvents() {
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

        on('btn-fish-index', () => this.show());
        on('btn-fish-index-back', () => this.hide());
        on('btn-achievements', () => this.showAchievements());
        on('btn-achievements-back', () => this.showPanel('main'));
        on('btn-open-index', () => this.openInGame());
        on('btn-index-close', () => this.closeInGame());

        // Menu filter buttons
        document.querySelectorAll('.fish-filter-btn').forEach(btn => {
            btn.onclick = () => {
                this.currentFilter = btn.dataset.filter;
                document.querySelectorAll('.fish-filter-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                    b.classList.toggle('bg-fuchsia-500', b === btn);
                    b.classList.toggle('text-white', b === btn);
                    if (b !== btn) {
                        b.classList.add('bg-slate-800/50', 'text-slate-300');
                        b.classList.remove('bg-fuchsia-500', 'text-white');
                    }
                });
                this.renderGrid();
            };
        });

        // In-game modal filter buttons
        document.querySelectorAll('.index-filter-btn').forEach(btn => {
            btn.onclick = () => {
                this.ingameFilter = btn.dataset.filter;
                document.querySelectorAll('.index-filter-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                    b.classList.toggle('bg-fuchsia-500', b === btn);
                    b.classList.toggle('text-white', b === btn);
                    if (b !== btn) {
                        b.classList.add('bg-slate-800/50');
                        b.classList.remove('bg-fuchsia-500', 'text-white');
                    }
                });
                this.renderInGame();
            };
        });
    },

    // ---- In-game modal (no need to visit the menu) ----
    openInGame() {
        const modal = $('index-modal');
        if (!modal) return;
        try { audio.playUIClick(); } catch (e) {}
        this.renderInGame();
        modal.classList.remove('hidden');
    },

    closeInGame() {
        const modal = $('index-modal');
        if (modal) modal.classList.add('hidden');
    },

    toggleInGame() {
        const modal = $('index-modal');
        if (!modal) return;
        if (modal.classList.contains('hidden')) this.openInGame();
        else this.closeInGame();
    },

    renderInGame() {
        const grid = $('index-grid-ingame');
        if (!grid) return;
        const caughtIds = this.discoveredIds();
        const species = this._filteredSpecies(this.ingameFilter, caughtIds);
        grid.innerHTML = species.map(fish => this._cardHTML(fish, caughtIds.has(fish.id))).join('');
        this._paintModels(grid);
        this._bindCustomButtons(grid);
        const total = this.indexTotal();
        const countEl = $('index-count-ingame');
        const progressEl = $('index-progress-ingame');
        if (countEl) countEl.innerText = `${caughtIds.size} / ${total}`;
        if (progressEl) progressEl.style.width = `${total > 0 ? (caughtIds.size / total * 100).toFixed(1) : 0}%`;
    },

    _filteredSpecies(filter, caughtIds) {
        let species = this.allEntries();
        if (filter && filter !== 'all') species = species.filter(f => f.rarity === filter);
        const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, boss: 6 };
        species.sort((a, b) => {
            const aCaught = caughtIds.has(a.id);
            const bCaught = caughtIds.has(b.id);
            if (aCaught !== bCaught) return aCaught ? -1 : 1;
            return (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0);
        });
        return species;
    },

    _cardHTML(fish, isCaught) {
        let hasCustom = false;
        try { hasCustom = typeof FishImageLoader !== 'undefined' && !!FishImageLoader.get(fish.id); } catch (e) {}
        return `
            <div class="fish-index-card min-w-0 relative glass-panel p-3 rounded-xl border-2 ${!isCaught ? 'border-slate-700/60 opacity-50' : ''} transition-all hover:scale-[1.02] cursor-pointer"
                 data-fish-id="${fish.id}"
                 style="${!isCaught ? 'filter: grayscale(1);' : ''}">
                <div class="w-full aspect-square relative mb-2 overflow-hidden">
                    <canvas class="w-full h-auto block" data-fish-model="${fish.id}" width="160" height="160"></canvas>
                    ${!isCaught ? '<div class="absolute inset-0 bg-slate-900/80 flex items-center justify-center"><i class="fa-solid fa-question text-2xl text-slate-600"></i></div>' : ''}
                    <div class="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${this._getRarityBadgeClass(fish.rarity)}">${fish.rarity}</div>
                    ${hasCustom ? '<div class="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-sky-500/80 text-white">CUSTOM</div>' : ''}
                </div>
                <div class="text-center">
                    <div class="font-bold text-xs text-white truncate">${isCaught ? fish.name : '???'}</div>
                    <div class="text-[9px] text-slate-400">${isCaught ? fish.value + ' coins' : 'Undiscovered'}</div>
                    <div class="flex gap-1 justify-center mt-1.5">
                        <button data-fish-upload="${fish.id}" class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-slate-800 text-sky-300 border border-sky-500/40 hover:bg-slate-700" title="Upload your own art for this fish (PNG/JPG, any size, faces right). Saved on this PC.">SET IMG</button>
                        ${hasCustom ? `<button data-fish-reset="${fish.id}" class="px-2 py-0.5 rounded-lg text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-600 hover:bg-slate-700" title="Remove your custom art and go back to procedural/shipped art">RESET</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    _bindCustomButtons(grid) {
        if (!grid) return;
        grid.querySelectorAll('[data-fish-upload]').forEach(btn => {
            btn.onclick = (ev) => {
                ev.stopPropagation();
                const fishId = btn.dataset.fishUpload;
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'image/*';
                inp.onchange = () => {
                    const f = inp.files && inp.files[0];
                    if (!f || typeof FishImageLoader === 'undefined') return;
                    FishImageLoader.saveUpload(fishId, f).then(
                        () => {
                            try { audio.playUIClick(); } catch (e) {}
                            // Repaint both index grids so the new art shows instantly
                            this.renderInGame();
                            this.renderGrid();
                            if (typeof Particles !== 'undefined' && typeof state !== 'undefined') {
                                try { Particles.showFloatingText(state, 'FISH SKIN SAVED!', state.player.x, state.player.y - 40, '#38bdf8'); } catch (e) {}
                            }
                        },
                        (err) => {
                            if (typeof Particles !== 'undefined' && typeof state !== 'undefined') {
                                try { Particles.showFloatingText(state, (err && err.message) || 'UPLOAD FAILED', state.player.x, state.player.y - 40, '#f87171'); } catch (e) {}
                            } else {
                                try { alert((err && err.message) || 'UPLOAD FAILED'); } catch (e) {}
                            }
                        }
                    );
                };
                inp.click();
            };
        });
        grid.querySelectorAll('[data-fish-reset]').forEach(btn => {
            btn.onclick = (ev) => {
                ev.stopPropagation();
                const fishId = btn.dataset.fishReset;
                try { FishImageLoader.clearUpload(fishId); } catch (e) {}
                try { audio.playUIClick(); } catch (e) {}
                this.renderInGame();
                this.renderGrid();
            };
        });
    },

    _paintModels(grid) {
        setTimeout(() => {
            grid.querySelectorAll('canvas[data-fish-model]').forEach(canvas => {
                const fishId = canvas.dataset.fishModel;
                const fish = FISH_SPECIES.find(f => f.id === fishId)
                    || (fishId === STORMCALLER_INFO.id ? STORMCALLER_INFO : null);
                if (fish) {
                    const paint = () => {
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        // Stormcaller is a bird: paint with her real renderer
                        if (fish.id === STORMCALLER_INFO.id && typeof renderSeagull === 'function') {
                            renderSeagull(ctx, { x: canvas.width / 2, y: canvas.height / 2, vx: 1, vy: 0.2, isBoss: true });
                            return;
                        }
                        const size = Math.min(canvas.width, canvas.height) * 0.4;
                        Render.drawFishModel(ctx, canvas.width / 2, canvas.height / 2, size, fish, { angle: -0.3 });
                    };
                    paint();
                    // Repaint when opt-in art lands: player upload (by species
                    // id) or explicit species.image. Procedural-only species
                    // never fetch, so cards paint exactly once.
                    try {
                        if (typeof FishImageLoader !== 'undefined') {
                            const wanted = FishImageLoader.resolveId
                                ? FishImageLoader.resolveId(fish)
                                : ((typeof fish.image === 'string' && fish.image.length > 0) ? fish.image : null);
                            if (wanted && !FishImageLoader.get(wanted)) {
                                FishImageLoader.load(wanted).then(img => { if (img) paint(); });
                            }
                        }
                    } catch (e) {}
                }
            });
        }, 0);
    },
    
    show() {
        this.renderGrid();
        this.updateProgress();
        this.showPanel('fish-index');
    },
    
    hide() {
        this.showPanel('main');
    },
    
    showPanel(panel) {
        const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-fish-index', 'mp-panel-achievements', 'mp-panel-help', 'mp-panel-settings'];
        panels.forEach(id => {
            const el = $(id);
            if (el) el.classList.add('hidden');
        });
        const target = $(`mp-panel-${panel}`);
        if (target) target.classList.remove('hidden');
    },
    
    showAchievements() {
        this.showPanel('achievements');
        if (typeof Achievements !== 'undefined') {
            Achievements.renderPanel($('achievements-container'));
        }
    },
    
    updateProgress() {
        const caughtIds = this.discoveredIds();
        const total = this.indexTotal();
        const countEl = $('fish-index-count');
        const progressEl = $('fish-index-progress');
        
        if (countEl) countEl.innerText = `${caughtIds.size} / ${total}`;
        if (progressEl) progressEl.style.width = `${total > 0 ? (caughtIds.size / total * 100).toFixed(1) : 0}%`;
    },
    
    renderGrid() {
        const grid = $('fish-index-grid');
        if (!grid) return;

        const caughtIds = this.discoveredIds();
        const species = this._filteredSpecies(this.currentFilter, caughtIds);

        grid.innerHTML = species.map(fish => this._cardHTML(fish, caughtIds.has(fish.id))).join('');
        this._paintModels(grid);
        this._bindCustomButtons(grid);
    },
    
    _getTailwindColor(rarity) {
        const map = { common: 'slate', rare: 'sky', epic: 'fuchsia', legendary: 'amber', mythic: 'yellow' };
        return map[rarity] || 'slate';
    },
    
    _getRarityBadgeClass(rarity) {
        const map = {
            common: 'bg-slate-700 text-slate-300',
            rare: 'bg-sky-900/50 text-sky-300 border border-sky-500/30',
            epic: 'bg-fuchsia-900/50 text-fuchsia-300 border border-fuchsia-500/30',
            legendary: 'bg-amber-900/50 text-amber-300 border border-amber-500/30',
            mythic: 'bg-yellow-900/50 text-yellow-300 border border-yellow-500/30',
            boss: 'bg-red-900/60 text-red-300 border border-red-500/50'
        };
        return map[rarity] || map.common;
    }
};

// Make globally available
window.FishIndex = FishIndex;
// ==========================================
// TUTORIAL — guided first catch, then it hides itself for good.
// Progress persists per save (tutorialDone). Danger banners (rose)
// always show even after completion.
// ==========================================
const Tutorial = {
    fresh(p) {
        p.tutorialDone = false;
        p.tut = { cast: false, hook: false, beach: false };
    },

    onCast(state) {
        const p = state.player;
        if (p.tutorialDone) return;
        if (!p.tut) this.fresh(p);
        p.tut.cast = true;
    },

    onHook(state) {
        const p = state.player;
        if (p.tutorialDone) return;
        if (!p.tut) this.fresh(p);
        p.tut.hook = true;
    },

    onBeach(state) {
        const p = state.player;
        if (p.tutorialDone) return;
        if (!p.tut) this.fresh(p);
        p.tut.beach = true;
    },

    onLoot(state) {
        const p = state.player;
        if (p.tutorialDone) return;
        if (!p.tut) this.fresh(p);
        if (p.tut.cast && p.tut.hook && p.tut.beach) this.complete(state);
    },

    complete(state) {
        const p = state.player;
        if (p.tutorialDone) return;
        p.tutorialDone = true;
        UI.updateStatusBanner('Tutorial complete! Talk to <b>OLD MARLIN</b> (E) on the beach for quests.', 'Done', 'emerald');
        setTimeout(() => {
            const banner = $('status-banner');
            if (banner && state.player.tutorialDone) banner.style.display = 'none';
        }, 6000);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
    },

    // Called whenever the game unpauses into gameplay
    applyStart(state) {
        const banner = $('status-banner');
        if (!banner) return;
        if (state.player.tutorialDone) {
            banner.style.display = 'none';
        } else {
            banner.style.display = '';
            if (!state.player.tut) this.fresh(state.player);
        }
    },

    replay(state) {
        this.fresh(state.player);
        const banner = $('status-banner');
        if (banner) {
            banner.style.display = '';
            banner.innerHTML = '<span class="text-amber-400 font-extrabold uppercase">Step 1:</span> Stand near water & Hold <span class="key">SPACE</span> to Cast!';
        }
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
    }
};

// ==========================================
// SETTINGS — persisted in localStorage (all saves share them)
// ==========================================
const Settings = {
    KEY: 'ah_settings',
    data: { sound: true, fx: 'med', shake: true, dayNightFx: true, master: 100, music: 80, sfx: 100, touch: 'auto' },

    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (typeof d.sound === 'boolean') this.data.sound = d.sound;
                if (['low', 'med', 'high'].includes(d.fx)) this.data.fx = d.fx;
                if (typeof d.shake === 'boolean') this.data.shake = d.shake;
                // 1.1.5: day/night LIGHTING toggle (time always keeps running)
                if (typeof d.dayNightFx === 'boolean') this.data.dayNightFx = d.dayNightFx;
                if (typeof d.dayNight === 'boolean' && typeof d.dayNightFx !== 'boolean') this.data.dayNightFx = d.dayNight;
                ['master', 'music', 'sfx'].forEach(k => {
                    if (typeof d[k] === 'number') this.data[k] = Math.max(0, Math.min(100, Math.round(d[k])));
                });
                if (['auto', 'on', 'off'].includes(d.touch)) this.data.touch = d.touch;
            }
        } catch (e) {}
        return this.data;
    },

    save() {
        try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
    },

    apply() {
        try {
            if (typeof audio !== 'undefined') {
                if (typeof audio.setMuted === 'function') audio.setMuted(!this.data.sound);
                else audio.muted = !this.data.sound;
                if (typeof audio.applyVolumes === 'function') {
                    audio.applyVolumes(this.data.master / 100, this.data.music / 100, this.data.sfx / 100);
                }
            }
            const icon = $('audio-icon');
            if (icon) icon.className = this.data.sound ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        } catch (e) {}
        try {
            if (typeof CONFIG !== 'undefined') {
                CONFIG.FX_DENSITY = this.data.fx === 'low' ? 0.3 : this.data.fx === 'high' ? 1 : 0.55;
            }
        } catch (e) {}
    },

    render() {
        const set = (id, val, on) => {
            const el = $(id);
            if (el) {
                el.innerText = val;
                el.className = (on ? 'text-emerald-300' : 'text-rose-400') + ' font-black';
            }
        };
        set('set-sound-val', this.data.sound ? 'ON' : 'OFF', this.data.sound);
        set('set-fx-val', this.data.fx.toUpperCase(), true);
        set('set-shake-val', this.data.shake ? 'ON' : 'OFF', this.data.shake);
        // 1.1.5: lighting only — the clock keeps ticking when OFF.
        set('set-daynight-val', this.data.dayNightFx !== false ? 'ON' : 'OFF', this.data.dayNightFx !== false);
        set('set-touch-val', this.data.touch.toUpperCase(), this.data.touch !== 'off');
        ['master', 'music', 'sfx'].forEach(k => {
            const r = $(`set-${k}`);
            const v = $(`set-${k}-val`);
            if (r) r.value = this.data[k];
            if (v) v.innerText = `${this.data[k]}%`;
        });
    },

    init() {
        this.load();
        this.apply();
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
        on('set-sound', () => { this.data.sound = !this.data.sound; this.save(); this.apply(); this.render(); });
        on('set-fx', () => {
            this.data.fx = this.data.fx === 'low' ? 'med' : this.data.fx === 'med' ? 'high' : 'low';
            this.save(); this.apply(); this.render();
        });
        on('set-shake', () => { this.data.shake = !this.data.shake; this.save(); this.render(); });
        on('set-daynight', () => {
            this.data.dayNightFx = !(this.data.dayNightFx !== false);
            this.save(); this.render();
            try { if (typeof audio !== 'undefined' && audio.playUIClick) audio.playUIClick(); } catch (e) {}
        });
        on('set-touch', () => {
            this.data.touch = this.data.touch === 'auto' ? 'on' : this.data.touch === 'on' ? 'off' : 'auto';
            this.save(); this.render();
            try {
                if (typeof TouchControls !== 'undefined' && typeof state !== 'undefined') TouchControls.refresh(state);
            } catch (e) {}
        });
        ['master', 'music', 'sfx'].forEach(k => {
            const r = $(`set-${k}`);
            if (r) r.oninput = () => {
                this.data[k] = Math.max(0, Math.min(100, Math.round(Number(r.value) || 0)));
                this.save(); this.apply();
                const v = $(`set-${k}-val`);
                if (v) v.innerText = `${this.data[k]}%`;
            };
        });
        on('set-tutorial', () => {
            if (typeof state !== 'undefined') Tutorial.replay(state);
            try { audio.playUIClick(); } catch (e) {}
        });
        this.render();
    }
};

// Make globally available
window.Tutorial = Tutorial;
window.Settings = Settings;
// ==========================================
// INTRO — story pages on New Game (skippable)
// ==========================================
const Intro = {
    idx: 0,
    pages: [
        // 1.1.5 PROLOGUE: every new game washes you ashore (drift intro).
        {
            kicker: 'PROLOGUE',
            title: 'ADRIFT',
            body: 'You wake to gulls and salt. Your boat went down in the night storm — ' +
                'all that is left is you, a rod, and a splintered plank. ' +
                'The current drags you toward a lamplit shore…',
        },
        {
            kicker: 'PROLOGUE',
            title: 'BLACKTIDE SHORE',
            body: 'Sand under your boots. Someone left a tackle box by the pier, ' +
                'and Old Marlin is already watching from his camp. ' +
                'The sea took everything once — time to take back more.',
        },
        {
            kicker: 'CHAPTER I',
            title: 'THE HOLLOW TIDE',
            body: 'Blacktide village has fished these waters for a hundred years. ' +
                'This season the sea turned hungry: lines come back empty, gulls fall screaming, ' +
                'and Old Marlin swears something vast is circling underneath.',
        },
        {
            kicker: 'CHAPTER II',
            title: 'THINGS THAT HUNGER',
            body: 'The Stormcaller rides the gulls. Four deep bosses answer blood rituals: ' +
                'a chanting Priest, a lightning Hydra, a Shepherd of the void, a Crimson Emperor. ' +
                'Fish for their eggs and shards — or die trying.',
        },
        {
            kicker: 'CHAPTER III',
            title: 'THE HUNT',
            body: 'WASD to move · hold SPACE to cast, ease off before the line snaps · ' +
                'click to shoot hooked horrors · E talks, shops and rituals · ' +
                'J opens the fish index. Walk the pier for deeper water, watch the clock ' +
                'chip (time + weather + tier), and save coins for the ferryman\'s 3 wild isles. ' +
                'North of the beach, a sealed cave waits for clever feet.',
        },
    ],

    isOpen() {
        const el = $('intro-overlay');
        return !!(el && !el.classList.contains('hidden'));
    },

    show() {
        this.idx = 0;
        const menu = $('main-menu');
        if (menu) menu.classList.add('hidden');
        const el = $('intro-overlay');
        if (!el) return;
        el.classList.remove('hidden');
        el.classList.add('flex');
        this.paint();
        const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
        on('btn-intro-back', () => this.back());
        on('btn-intro-next', () => this.next());
        on('btn-intro-skip', () => this.finish());
    },

    paint() {
        const pg = this.pages[this.idx];
        const set = (id, txt) => { const el = $(id); if (el) el.innerText = txt; };
        set('intro-kicker', pg.kicker);
        set('intro-title', pg.title);
        const body = $('intro-body');
        if (body) body.innerText = pg.body;
        const dots = $('intro-dots');
        if (dots) {
            dots.innerHTML = this.pages.map((_, i) =>
                `<span class="w-2 h-2 rounded-full ${i === this.idx ? 'bg-sky-400' : 'bg-slate-600'}"></span>`).join('');
        }
        const back = $('btn-intro-back');
        if (back) back.style.visibility = this.idx === 0 ? 'hidden' : 'visible';
        const next = $('btn-intro-next');
        if (next) next.innerText = this.idx === this.pages.length - 1 ? 'Begin the Hunt' : 'Next →';
    },

    back() {
        if (this.idx > 0) { this.idx--; this.paint(); }
        try { audio.playUIClick(); } catch (e) {}
    },

    next() {
        try { audio.playUIClick(); } catch (e) {}
        if (this.idx < this.pages.length - 1) { this.idx++; this.paint(); }
        else this.finish();
    },

    finish() {
        const el = $('intro-overlay');
        if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
        if (typeof MainMenu !== 'undefined') MainMenu.hide();
        UI.updateStatusBanner('New game started. Cast your line!', 'Start', 'emerald');
    },
};

// Single source of truth for the displayed game version.
const GAME_VERSION = '1.2.5';

// Newest first. Shown in Menu > Updates.
const CHANGELOG = [
    {
        ver: 'v1.2.5', date: 'Oct 2026', tag: 'LATEST',
        items: [
            'Multiplayer identities: pilot name asked once, remembered, shown in lobby + name tags (same name rejoins seamlessly)',
            'Separate MP save system: personal slots 1-3 per browser, never touches single-player files; per-slot NEW/CONTINUE expedition',
            'Shared everything, personal everything: host clock/weather syncs to all, one boss per room (peers’ hooked bosses block summons), cross-island bodies culled — while catches, casino tokens, assets and Settings stay personal',
            'Island/cave travel is strictly per-player; host leaving banks your MP file and returns you to single player',
        ],
    },
    {
        ver: 'v1.2.4', date: 'Oct 2026', tag: '',
        items: [
            'FIXED: invisible surf-line wall blocked every dragged catch from beaching — BEACHING fish can cross onto sand/deck again, dead fish shift inward to loot even from afar',
            'Beached fish tire fast: stronger beach drag + eased tension on land (no more line snaps meters from your hands)',
            'Bobber now flies toward the mouse on every map (touch/gamepad aim included), with walk-back water validation; falls back to facing',
            'Sea detection cells unified: one detector drives spawn rates, bite waits and water tint (shore/shallow/deep/island)',
        ],
    },
    {
        ver: 'v1.2.3', date: 'Oct 2026', tag: '',
        items: [
            'FIXED: clients never entered the game on host start (message envelope mismatch dropped every gameState/input/start packet) — host start now loads + renders for everyone',
            'Dying on an isle respawns you at the island dock (stays on the isle); beach/camp still return to the mainland',
            'Ritual summons stay on the mainland beach — only bait-hooked bosses fight on the isles',
            'BOSS TIDE: Hydra + Crimson now bite far rarer than the other bosses',
        ],
    },
    {
        ver: 'v1.2.2', date: 'Oct 2026', tag: '',
        items: [
            'Background run: the world keeps simulating while the tab is hidden (1s steps) — no more freeze, no more forced pause-to-menu in MP rooms',
            'MP heartbeats in background so the host never ghost-drops a tabbed-out member; autosaves keep going',
            'Tab-return guards: stuck keys/mouse cleared, audio resumed, fresh snapshot for clients',
        ],
    },
    {
        ver: 'v1.2.1', date: 'Oct 2026', tag: '',
        items: [
            'Isle rework: shared-style open sea around every isle (shore/shallow/deep from the sand edge) + per-isle lakes (lagoon / river / twin ponds) + its own pier and dock',
            'Ferry rides are real boat trips now: board, sail with a wake, then the crossing (same sailing home)',
            'Pier/isle fishing fixed: deck and sand count as shore for beaching, loot no longer sinks on piers or isles, knockbacks can\'t nudge you off the deck',
            'Zone orbs removed — water color itself shows the tiers (light shallow → dark deep); catches announce normally again',
        ],
    },
    {
        ver: 'v1.2.0', date: 'Oct 2026', tag: '',
        items: [
            'Online P2P multiplayer (PeerJS): no localhost server — host/join from anywhere, itch.io included, same version required',
            'Shared vision: custom fish/gun/bobber art syncs across peers, catch popups + boss banners mirrored (same text/colors/pixels)',
            'Kept personal: your Settings (day/night FX, particles, shake, volumes) stay local, so screens may differ slightly there',
        ],
    },
    {
        ver: 'v1.1.5', date: 'Oct 2026', tag: '',
        items: [
            'Map expansion: long pier reaches SHALLOW then DEEP water — sea tiers by distance (Shore / Shallow / Deep)',
            'Ferryman boat at the pier end: 3 detached wild isles (Sunspill 500c, Mistfall 1500c, Abyssal Maw 3000c) with loading screens + sailing intros',
            'Time + weather system: day/night cycle, clear/clouds/rain/storm/fog — matching fish get big spawn-rate boosts',
            'Clock chip in the HUD (time · weather · water tier) + Day/Night FX toggle in Settings (time keeps running when OFF)',
            'New-game drift intro: you wash ashore from a wreck before Chapter I',
            'Menu safety: Slot 1 pre-selected, TOP button is Continue, New Game sits below with a wipe confirm',
        ],
    },
    {
        ver: 'v1.1.0', date: 'Oct 2026', tag: '',
        items: [
            'Update log added — this panel, with the current version up top',
            'Teleport loading screen for cave descents and returns',
            'Menu remake: hero header, PLAY/EXPLORE columns, live beach background with real index fish',
            'Full SFX assets (roar, skills, throw, splash, reload, boss roar/theme, coin, hit, UI) — mp3/ogg/wav drop-in support',
            'Volume mixer: Master / Music / SFX sliders in Settings',
            'Skin-pack sharing: export all custom skins to a zip, import a zip to wear them',
            'Shop gun cards show the real gun model (procedural or custom skin)',
        ],
    },
    {
        ver: 'v1.0.0', date: 'Sep 2026', tag: 'RELEASE',
        items: [
            'Sealed cave rework: corner void portal, fog + lantern light, fish-offering rune puzzle',
            'Stormlord Hydra: 9 heads, sea-phase hunt, nine-head volley, cinematic boss intros',
            'Achievements repaired (unlock, counting, persistence) + full-roster hook table (213 species)',
            'Bait luck fixed: rod + bait luck feed rarity weights and shiny rolls',
            'Boot + teleport loading screens, boss war-drum theme',
        ],
    },
];

const MainMenu = {
    show() {
        const menu = $('main-menu');
        if (menu) menu.classList.remove('hidden');

        const setHidden = (id, hidden) => {
            const el = $(id);
            if (el) el.classList.toggle('hidden', hidden);
        };

        setHidden('mp-panel-main', false);
        setHidden('mp-panel-multiplayer', true);
        setHidden('mp-panel-join', true);
        setHidden('mp-panel-lobby', true);
        setHidden('menu-about', true);
        setHidden('mp-panel-changelog', true);
        setHidden('mp-panel-fish-index', true);
        setHidden('mp-panel-help', true);
        setHidden('mp-panel-settings', true);

        state.paused = true;

        // Refresh Continue button + slot picker
        this.refreshContinueBtn();
        if (typeof MultiplayerUI !== 'undefined' && MultiplayerUI.refreshSlotRow) {
            try { MultiplayerUI.refreshSlotRow(); } catch (e) {}
        }
    },

    // 1.1.5 MENU SAFETY: Slot 1 is always pre-selected at boot, and the
    // TOP button is Continue (never a save-wiping New Game). The New Game
    // action lives UNDERNEATH and asks for confirmation when the slot
    // already has progress. With zero saves anywhere, the top button IS
    // Start New Game and no Continue shows at all.
    anySave() {
        try {
            if (typeof SaveSystem === 'undefined') return false;
            return (SaveSystem.SLOTS || [1, 2, 3]).some(s => SaveSystem.exists(s));
        } catch (e) { return false; }
    },

    refreshContinueBtn() {
        const topBtn = $('btn-start');
        const newBtn = $('btn-load');
        if (!topBtn || !newBtn || typeof SaveSystem === 'undefined') return;
        const slot = (typeof state !== 'undefined' && state.saveSlot) || SaveSystem.getSlot() || 1;
        const hasAny = this.anySave();
        const hasSlot = SaveSystem.exists(slot);
        const topSpan = topBtn.querySelector('span');
        const newSpan = newBtn.querySelector('span');
        const topIcon = topBtn.querySelector('i');
        const newIcon = newBtn.querySelector('i');
        if (!hasAny) {
            // Fresh player: one big Start button, no Continue to misclick.
            topBtn.dataset.mode = 'new';
            topBtn.disabled = false;
            if (topSpan) topSpan.innerText = 'Start New Game';
            if (topIcon) topIcon.className = 'fa-solid fa-play';
            newBtn.classList.add('hidden');
        } else {
            // TOP = Continue (safe default), BELOW = Start New Game.
            topBtn.dataset.mode = 'continue';
            topBtn.disabled = !hasSlot;
            if (topSpan) topSpan.innerText = hasSlot ? `Continue (Slot ${slot})` : `Slot ${slot} Empty — Pick a Save`;
            if (topIcon) topIcon.className = 'fa-solid fa-folder-open';
            try { topBtn.title = hasSlot ? 'Load this slot and jump straight back in' : 'This slot is empty — pick a slot with progress, or start new below'; } catch (e) {}
            newBtn.classList.remove('hidden');
            newBtn.dataset.mode = 'new';
            newBtn.disabled = false;
            if (newSpan) newSpan.innerText = hasSlot ? `Start New Game (Slot ${slot})` : `Start New Game (Slot ${slot})`;
            if (newIcon) newIcon.className = 'fa-solid fa-play';
            try { newBtn.title = 'Fresh expedition in this slot (asks before wiping; records kept)'; } catch (e) {}
        }
        const saveBtn = $('btn-save-menu');
        if (saveBtn) {
            const sspan = saveBtn.querySelector('span');
            if (sspan) sspan.innerText = `Save Game (Slot ${slot})`;
        }
    },

    hide() {
        const menu = $('main-menu');
        if (menu) menu.classList.add('hidden');
        state.paused = false;
        if (typeof Tutorial !== 'undefined') Tutorial.applyStart(state);
    },

    // Stamp the single-source version everywhere it shows.
    stampVersion() {
        try {
            const v = (typeof GAME_VERSION === 'string' && GAME_VERSION) ? GAME_VERSION : 'v1.2.5';
            const disp = v.startsWith('v') ? v : 'v' + v;
            ['menu-ver-hero', 'menu-ver-foot', 'menu-ver-chip', 'changelog-ver'].forEach(id => {
                const el = $(id);
                if (el) el.innerText = disp;
            });
        } catch (e) {}
    },

    renderChangelog() {
        const list = $('changelog-list');
        if (!list || typeof CHANGELOG === 'undefined') return;
        list.innerHTML = CHANGELOG.map((rel, i) => `
            <div class="glass-panel-light p-3 rounded-xl ${i === 0 ? 'border border-amber-500/40' : ''}">
                <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span class="font-black text-white text-sm">${rel.ver}</span>
                    <span class="text-[9px] font-black px-1.5 py-px rounded ${i === 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}">${rel.tag || ''}</span>
                    <span class="text-[10px] text-slate-500 ml-auto">${rel.date || ''}</span>
                </div>
                <ul class="text-xs text-slate-300 leading-relaxed space-y-1">
                    ${(rel.items || []).map(it => `<li class="flex gap-1.5"><span class="text-amber-400 font-black">•</span><span>${it}</span></li>`).join('')}
                </ul>
            </div>
        `).join('');
    },

    init(state) {
        const self = this;
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

        on('btn-start', () => {
            const mode = ($('btn-start') && $('btn-start').dataset.mode) || (self.anySave() ? 'continue' : 'new');
            if (mode === 'continue') {
                // TOP button: always a safe load, never a wipe.
                if (typeof SaveSystem === 'undefined') return;
                const ok = SaveSystem.load(state);
                if (ok) {
                    if (typeof Player !== 'undefined') {
                        if (typeof Player.initWeaponAmmo === 'function') Player.initWeaponAmmo(state);
                        Player.refreshHUD(state);
                        Player.refreshWeaponHUD(state);
                    }
                    UI.renderWeaponToolbar(state);
                    UI.refreshLuckDisplay(state);
                    if (typeof Casino !== 'undefined') {
                        try { Casino.tokens = state.player.casinoTokens || 0; Casino.updateTokenDisplay(); } catch (e) {}
                    }
                    try {
                        if (typeof WorldSystem !== 'undefined' && WorldSystem.refreshClockUI) WorldSystem.refreshClockUI(state);
                    } catch (e) {}
                    self.hide();
                    UI.updateStatusBanner('Progress loaded.', 'Loaded', 'emerald');
                } else {
                    UI.updateStatusBanner('No save found in this slot — pick a slot with progress.', 'Load', 'rose');
                }
                return;
            }
            // Fresh run in the selected slot (records kept). Confirm when
            // this would wipe an existing expedition.
            if (typeof SaveSystem !== 'undefined') {
                const slot = (typeof state !== 'undefined' && state.saveSlot) || SaveSystem.getSlot();
                if (SaveSystem.exists(slot)) {
                    const okGo = window.confirm(`Start a NEW game in Slot ${slot}? This wipes that slot's expedition (records kept).`);
                    if (!okGo) return;
                }
                SaveSystem.wipe(slot);
                // Fresh run in the selected slot (records kept)
                SaveSystem.freshPlayer(state);
                SaveSystem.save(state, slot);
            }
            if (typeof Intro !== 'undefined') Intro.show();
            else {
                self.hide();
                UI.updateStatusBanner('New game started. Cast your line!', 'Start', 'emerald');
            }
        });

        on('btn-load', () => {
            // SECOND button: explicit Start New Game (confirm on wipe).
            if (typeof SaveSystem === 'undefined') return;
            const slot = (typeof state !== 'undefined' && state.saveSlot) || SaveSystem.getSlot();
            if (SaveSystem.exists(slot)) {
                const okGo = window.confirm(`Start a NEW game in Slot ${slot}? This wipes that slot's expedition (records kept).`);
                if (!okGo) return;
                SaveSystem.wipe(slot);
            }
            SaveSystem.freshPlayer(state);
            SaveSystem.save(state, slot);
            if (typeof Intro !== 'undefined') Intro.show();
            else {
                self.hide();
                UI.updateStatusBanner('New game started. Cast your line!', 'Start', 'emerald');
            }
        });

        on('btn-save-menu', () => {
            if (typeof SaveSystem === 'undefined') return;
            const ok = SaveSystem.save(state);
            UI.updateStatusBanner(
                ok ? 'Progress saved.' : 'Save failed.',
                'Save', ok ? 'emerald' : 'rose'
            );
        });

        on('btn-about', () => {
            const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'mp-panel-fish-index', 'mp-panel-help', 'mp-panel-settings'];
            panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
            const about = $('menu-about');
            if (about) about.classList.remove('hidden');
        });

        on('btn-about-back', () => {
            const about = $('menu-about');
            const main = $('mp-panel-main');
            if (about) about.classList.add('hidden');
            const log = $('mp-panel-changelog');
            if (log) log.classList.add('hidden');
            if (main) main.classList.remove('hidden');
        });

        // Fish Index button
        on('btn-fish-index', () => {
            const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-changelog', 'mp-panel-achievements', 'mp-panel-help', 'mp-panel-settings'];
            panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
            const fishIndex = $('mp-panel-fish-index');
            if (fishIndex) fishIndex.classList.remove('hidden');
            if (typeof FishIndex !== 'undefined') FishIndex.show();
        });

        // Achievements button
        on('btn-achievements', () => {
            const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-changelog', 'mp-panel-fish-index', 'mp-panel-help', 'mp-panel-settings'];
            panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
            const achievements = $('mp-panel-achievements');
            if (achievements) achievements.classList.remove('hidden');
            if (typeof Achievements !== 'undefined') Achievements.renderPanel($('achievements-container'));
        });

        // Changelog (update log + current version)
        const showMenuPanel = (id) => {
            const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-changelog', 'mp-panel-fish-index', 'mp-panel-achievements', 'mp-panel-help', 'mp-panel-settings'];
            panels.forEach(p => { const el = $(p); if (el) el.classList.add('hidden'); });
            const target = $(id);
            if (target) target.classList.remove('hidden');
            if (id === 'mp-panel-settings' && typeof Settings !== 'undefined') Settings.render();
            if (id === 'mp-panel-changelog') self.renderChangelog();
        };
        // Changelog (update log + current version)
        on('btn-changelog', () => showMenuPanel('mp-panel-changelog'));
        on('btn-changelog-back', () => showMenuPanel('mp-panel-main'));
        on('btn-how-to-play', () => showMenuPanel('mp-panel-help'));
        on('btn-help-back', () => showMenuPanel('mp-panel-main'));
        on('btn-settings', () => showMenuPanel('mp-panel-settings'));
        on('btn-settings-back', () => showMenuPanel('mp-panel-main'));

        // Menu button in HUD (not for corpses) — opens the in-game
        // pause menu, never the main menu.
        const hudMenuBtn = $('btn-menu');
        if (hudMenuBtn) hudMenuBtn.onclick = () => {
            if (state.player && state.player.isDead) return;
            if (typeof PauseMenu !== 'undefined') PauseMenu.open();
        };

        // TAB-hold player list (Minecraft-style). preventDefault stops
        // focus-jumping; ignored while typing in any field.
        const typingTarget = (e) => {
            try {
                const t = e.target;
                if (!t || !t.tagName) return false;
                const tag = t.tagName.toUpperCase();
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
                return !!(t.isContentEditable);
            } catch (ee) { return false; }
        };
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (typingTarget(e)) return;
                e.preventDefault();
                if (!e.repeat && typeof TabList !== 'undefined') TabList.show();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Tab' && typeof TabList !== 'undefined') TabList.hide();
        });
        window.addEventListener('blur', () => {
            try { if (typeof TabList !== 'undefined') TabList.hide(); } catch (e) {}
        });
        // Touch fallback (no TAB key): tapping the MP status bar toggles
        // the same player list.
        try {
            const hud = $('mp-hud');
            if (hud) hud.onclick = () => {
                if (typeof TabList === 'undefined') return;
                if (TabList.isOpen()) TabList.hide();
                else TabList.show();
            };
        } catch (e) {}
        if (typeof PauseMenu !== 'undefined') PauseMenu.bind();

        // ESC opens the menu
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // 1.1.5: ferry menu closes first
                try {
                    if (typeof WorldSystem !== 'undefined' && WorldSystem.isBoatMenuOpen && WorldSystem.isBoatMenuOpen()) {
                        WorldSystem.closeBoatMenu();
                        return;
                    }
                } catch (ee) {}
                // Intro finishes on ESC (same as Begin/Skip)
                if (typeof Intro !== 'undefined' && Intro.isOpen && Intro.isOpen()) {
                    Intro.finish();
                    return;
                }
                // The dead don't get menus — respawn first
                if (typeof state !== 'undefined' && state.player && state.player.isDead) return;
                const shop = $('shop-modal');
                if (shop && !shop.classList.contains('hidden')) {
                    shop.classList.add('hidden');
                    return;
                }
                const indexModal = $('index-modal');
                if (indexModal && !indexModal.classList.contains('hidden')) {
                    indexModal.classList.add('hidden');
                    return;
                }
                const casinoModal = $('casino-modal');
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
                const fb = $('feedback-modal');
                if (fb && !fb.classList.contains('hidden')) {
                    try { if (typeof Feedback !== 'undefined') Feedback.close(); }
                    catch (e) { fb.classList.add('hidden'); }
                    return;
                }
                const menu = $('main-menu');
                if (menu && !menu.classList.contains('hidden')) {
                    const main = $('mp-panel-main');
                    const mpMain = $('mp-panel-multiplayer');
                    const fishIdx = $('mp-panel-fish-index');
                    const achieveIdx = $('mp-panel-achievements');
                    const about = $('menu-about');
                    if (main && !main.classList.contains('hidden') &&
                        mpMain && !mpMain.classList.contains('hidden') &&
                        fishIdx && fishIdx.classList.contains('hidden') &&
                        achieveIdx && achieveIdx.classList.contains('hidden') &&
                        about && about.classList.contains('hidden')) {
                        self.hide();
                    } else {
                        // Close sub-panels, show main
                        const panels = ['mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-changelog', 'mp-panel-fish-index', 'mp-panel-achievements', 'mp-panel-help', 'mp-panel-settings'];
                        panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
                        if (main) main.classList.remove('hidden');
                    }
                } else {
                    // In-game ESC toggles the pause menu — it never jumps
                    // straight to the main menu anymore.
                    if (typeof PauseMenu !== 'undefined') {
                        if (PauseMenu.isOpen()) PauseMenu.close(true);
                        else PauseMenu.open();
                    }
                }
            }
        });

        // Open the menu on boot
        self.show();
        self.stampVersion();
    }
};

// ==========================================
// SAVE SYSTEM BOOT
// ==========================================
let loadedFromSave = false;
if (typeof SaveSystem !== 'undefined') {
    // 1.1.5: always pre-select Slot 1 at boot (no surprise slot).
    try { SaveSystem.setSlot(1); } catch (e) {}
    state.saveSlot = 1;
    loadedFromSave = SaveSystem.load(state, 1);
    // Booting straight into a detached island is disorienting — start the
    // session back on the beach, keeping the island unlocks/fees intact.
    try {
        if (state.player && state.player.onIsland) {
            state.player.onIsland = null;
            state.player.boatReturn = null;
            state.player.islandSpawn = null;
            state.player.x = 300; state.player.y = 300;
        }
        if (state.player && state.player.inCave) {
            state.player.inCave = false;
            state.player.returnPos = null;
        }
    } catch (e) {}
}

if (typeof Player !== 'undefined' && typeof Player.initWeaponAmmo === 'function') {
    Player.initWeaponAmmo(state);
}

// Init Menu Background Animation
if (typeof MenuBackground !== 'undefined') MenuBackground.init();

// Init the menu (this also shows it)
if (typeof MainMenu !== 'undefined') MainMenu.init(state);

// Init Fish Index
if (typeof FishIndex !== 'undefined') FishIndex.init(state);

// Init Casino
if (typeof Casino !== 'undefined') Casino.init(state);

// Init Enemy Spawner
if (typeof EnemySpawner !== 'undefined') EnemySpawner.init(state);

// Init Achievements
if (typeof Achievements !== 'undefined') Achievements.init(state);

// Init AntiCheat (console tamper guard)
if (typeof AntiCheat !== 'undefined') AntiCheat.init(state);

// Init NPC quest giver (Old Marlin)
if (typeof NPC !== 'undefined') NPC.init(state);

// Init Settings (sound / particles / shake / tutorial)
if (typeof Settings !== 'undefined') Settings.init();

// Init World (1.1.5: clock, weather, pier, ferry isles)
if (typeof WorldSystem !== 'undefined' && WorldSystem.init) {
    try { WorldSystem.init(state); } catch (e) {}
}

// Init BackgroundTick (keeps the sim + MP alive while the tab is hidden)
if (typeof BackgroundTick !== 'undefined' && BackgroundTick.init) {
    try { BackgroundTick.init(state); } catch (e) {}
}

// Apply armor stats from save
if (typeof Shop !== 'undefined' && Shop.applyArmorStats) {
    try { Shop.applyArmorStats(state); } catch (e) {}
}

// Init Multiplayer UI
if (typeof MultiplayerUI !== 'undefined') MultiplayerUI.init(state);

// Init Feedback panel (Discord webhook bug reports + MP log attach)
if (typeof Feedback !== 'undefined') {
    try { Feedback.init(); } catch (e) {}
    try {
        if (typeof MultiplayerUI !== 'undefined' && MultiplayerUI.refreshMpLog) {
            MultiplayerUI.refreshMpLog();
        }
    } catch (e) {}
}

// Initialize Multiplayer system
if (typeof Multiplayer !== 'undefined') {
    Multiplayer.init(state, {
        onStatusChange: (msg) => {
            if (MultiplayerUI.currentPanel === 'lobby') {
                MultiplayerUI.setLobbyStatus(msg);
            }
        },
        onPlayerJoined: () => {
            MultiplayerUI.onPlayerJoined();
        },
        onPlayerLeft: () => {
            MultiplayerUI.onPlayerLeft();
        },
        onGameStart: () => {
            // Client receives game start signal: opaque loading on ALL
            // screens, then enter the game ONLY after the first host
            // snapshot lands (no more fixed-timer reveal into an empty
            // world where the host is invisible).
            if (typeof MultiplayerUI !== 'undefined') {
                MultiplayerUI.showLoading('JOINING...', 'Syncing with host');
            }
            try {
                if (window.Multiplayer) {
                    window.Multiplayer._hasEverSynced = false;
                    if (window.Multiplayer.sendGameStartAck) window.Multiplayer.sendGameStartAck();
                    if (window.Multiplayer.sendSyncRequest) window.Multiplayer.sendSyncRequest();
                }
            } catch (e) {}
            const t0 = Date.now();
            const waitFirst = () => {
                let ready = false;
                try { ready = !!(window.Multiplayer && window.Multiplayer.hasEverSynced && window.Multiplayer.hasEverSynced()); } catch (e) {}
                if (ready || Date.now() - t0 > 8000) {
                    if (typeof MainMenu !== 'undefined') MainMenu.hide();
                    if (typeof MultiplayerUI !== 'undefined') {
                        MultiplayerUI.showInGameHUD();
                        MultiplayerUI.hideLoading();
                    }
                    if (!ready) {
                        UI.updateStatusBanner('Still syncing with host… moving you in anyway (snapshot on the way).', 'Start', 'amber');
                    } else {
                        UI.updateStatusBanner('Multiplayer game started!', 'Start', 'emerald');
                    }

                    // Ack so the host's loading screen can clear
                    if (window.Multiplayer) {
                        if (window.Multiplayer.sendGameStartAck) window.Multiplayer.sendGameStartAck();
                        if (window.Multiplayer.sendSyncRequest) window.Multiplayer.sendSyncRequest();
                        // Publish our custom art so the room renders the same skins
                        try {
                            if (typeof PeerSkins !== 'undefined') PeerSkins.startSession();
                        } catch (e) {}
                    }
                    return;
                }
                // Keep asking until the host answers (join-while-host-busy).
                try {
                    if (window.Multiplayer && window.Multiplayer.sendSyncRequest && (Date.now() - t0) % 1000 < 120) {
                        window.Multiplayer.sendSyncRequest();
                    }
                } catch (e) {}
                setTimeout(waitFirst, 120);
            };
            setTimeout(waitFirst, 150);
        },
        onError: (msg) => {
            UI.updateStatusBanner(msg, 'Error', 'rose');
        },
        onHostLeft: () => {
            // No host = no shared world. Bank the MP character, restore
            // single player, and go back to the menu (never strand the
            // MP character in SP slots, never freeze in a dead room).
            if (typeof MultiplayerUI !== 'undefined') {
                MultiplayerUI.hideLoading();
                MultiplayerUI.hideInGameHUD();
            }
            if (window.Multiplayer && window.Multiplayer.exitMPProfile) {
                window.Multiplayer.exitMPProfile();
            }
            if (typeof MainMenu !== 'undefined') MainMenu.show();
            UI.updateStatusBanner('Host left — single-player save restored.', 'Exit', 'amber');
        }
    });
    state.multiplayer = Multiplayer;
}

// ==========================================
// MAIN GAME LOOP
// ==========================================
let lastTime = performance.now();

// Shared client input snapshot (foreground loop + background ticks so a
// tabbed-out member keeps heartbeating and is never ghost-dropped).
function mpClientInput() {
    return {
        keys: { ...state.keys },
        // Identity + map slice ride every snapshot: the host always
        // knows WHO (name) and WHERE (mainland / isle / cave) we are.
        playerName: (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
            ? (Multiplayer.playerName() || '') : '',
        mouse: {
            x: state.mouse.x,
            y: state.mouse.y,
            worldX: state.mouse.worldX,
            worldY: state.mouse.worldY,
            isDown: state.mouse.isDown
        },
        aim: Math.atan2(state.mouse.worldY - state.player.y, state.mouse.worldX - state.player.x),
        // Death counter: the host watches it edge-trigger a shared boss
        // life loss (ONE room counter — any player's death counts).
        _deathSeq: state._deathSeq || 0,
        player: {
            x: state.player.x,
            y: state.player.y,
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            facing: state.player.facing,
            aim: Math.atan2(state.mouse.worldY - state.player.y, state.mouse.worldX - state.player.x),
            activeSlot: state.player.activeSlot,
            equippedWeapons: [...state.player.equippedWeapons],
            gunSkins: state.player.gunSkins ? { ...state.player.gunSkins } : {},
            onIsland: state.player.onIsland || null,
            inCave: !!state.player.inCave
        }
    };
}

function mainLoop(time) {
    const delta = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;

    // If paused (menu open), skip simulation but still render.
    // Death NO LONGER freezes anything: the world, enemies and MP keep
    // running while the corpse waits (MP rooms survive anyone's death) —
    // the death menu takes over input, the body renders a skull marker.
    if (state.paused) {
        if (typeof Render !== 'undefined' && Render.drawWorld && ctx) {
            Render.drawWorld(state, ctx);
        }
        if (typeof MultiplayerUI !== 'undefined') {
            MultiplayerUI.updateHUD();
        }
        requestAnimationFrame(mainLoop);
        return;
    }

    state.time += delta;

    // 1.1.5 WORLD: clock + weather always tick while playing.
    if (typeof WorldSystem !== 'undefined' && WorldSystem.update) {
        try { WorldSystem.update(state, delta); } catch (e) {}
    }

    if (state.screenShake > 0) {
        if (typeof Settings !== 'undefined' && Settings.data.shake === false) {
            state.screenShake = 0;
            state.camera.shakeX = 0;
            state.camera.shakeY = 0;
        } else {
            state.camera.shakeX = (Math.random() - 0.5) * state.screenShake * 2;
            state.camera.shakeY = (Math.random() - 0.5) * state.screenShake * 2;
            state.screenShake = Math.max(0, state.screenShake - delta * 25);
        }
    } else {
        state.camera.shakeX = 0;
        state.camera.shakeY = 0;
    }

    if (typeof Camera !== 'undefined') Camera.update(state, delta);
    if (typeof Input !== 'undefined') Input.updateMouseWorld(state);
    // Alt controls: gamepad (Xbox/PlayStation) + touch joysticks feed the
    // same keys/mouse pipeline, so everything downstream just works.
    if (typeof GamepadControls !== 'undefined') {
        try { GamepadControls.update(state); } catch (e) {}
    }
    if (typeof TouchControls !== 'undefined') {
        try { TouchControls.update(state, delta); } catch (e) {}
    }
    if (typeof Player !== 'undefined') Player.update(state, delta);
    if (typeof Ritual !== 'undefined' && Ritual.update) {
        try { Ritual.update(state, delta); } catch (e) {}
    }
    if (typeof Fishing !== 'undefined') Fishing.update(state, delta);
    if (typeof WeaponSystem !== 'undefined') WeaponSystem.update(state, delta);
    if (typeof Combat !== 'undefined') Combat.update(state, delta);
    if (typeof Particles !== 'undefined') Particles.update(state, delta);

    // Update enemies
    if (typeof EnemySpawner !== 'undefined') EnemySpawner.update(delta);

    // Update multiplayer
    if (typeof Multiplayer !== 'undefined' && state.multiplayer) {
        state.multiplayer.update(delta);

        if (state.multiplayer.roomCode && !state.multiplayer.isHost) {
            const input = mpClientInput();
            state.multiplayer.sendInput(input);
        }

        if (typeof MultiplayerUI !== 'undefined') {
            MultiplayerUI.updateHUD();
        }
    }

    if (typeof Render !== 'undefined' && Render.drawWorld && ctx) {
        Render.drawWorld(state, ctx);
    }

    // Render remote players (either side) whenever snapshots exist —
    // no longer gated on the WebRTC flag, so signaling fallback works too
    const hasRemotes = state.remotePlayer ||
        (state.remotePlayers && Object.keys(state.remotePlayers).length > 0);
    if (typeof Multiplayer !== 'undefined' && state.multiplayer && hasRemotes) {
        if (typeof Multiplayer.renderRemotePlayer === 'function') {
            Multiplayer.renderRemotePlayer(ctx);
        }
    }

    UI.updateBossBar(state);
    UI.updateFightList(state);
    UI.renderStatusEffectsHUD(state);

    // World SHOP / CASINO zone prompt (pads deep on the beach only —
    // no prompt near the sea anymore)
    const beachIndicator = $('beach-shop-indicator');
    if (beachIndicator) {
        let prompt = null;
        // 1.1.5 WORLD: ferry + island dock prompts first (never mid-voyage)
        try {
            if (typeof WorldSystem !== 'undefined' && !state.paused &&
                !(WorldSystem.boatRiding && WorldSystem.boatRiding(state))) {
                if (state.player.onIsland && WorldSystem.nearIslandExit(state) < 120 + 60) {
                    prompt = 'SAIL HOME (free)';
                } else if (!state.player.onIsland && !state.player.inCave && WorldSystem.nearBoat(state) < 130 + 60) {
                    prompt = "FERRYMAN'S BOAT";
                }
            }
        } catch (e) {}
        try {
            if (!prompt && typeof NPC !== 'undefined' && NPC.near && !state.paused && NPC.near(state) < (NPC.RADIUS || 115) + 40) {
                prompt = 'TALK TO OLD MARLIN';
            }
        } catch (e) {}
        if (!prompt && typeof Ritual !== 'undefined' && Ritual.near) {
            try {
                if (!state.paused && state.player.inCave) {
                    if (Ritual.nearExit(state) < 110 + 60) prompt = 'LEAVE THE CAVE';
                    else if (Ritual.near(state) < (Ritual.RADIUS || 110) + 60) prompt = 'RITUAL';
                } else if (!state.paused && Ritual.nearHole && Ritual.nearHole(state) < 170) {
                    prompt = 'ENTER THE CAVE';
                }
            } catch (e) {}
        }
        if (!prompt && typeof Render !== 'undefined' && Render.nearestShopZone) {
            const near = Render.nearestShopZone(state);
            if (near && near.dist < near.zone.radius + 60) {
                prompt = near.zone.id === 'casino' ? 'CASINO' : 'SHOP';
            }
        }
        if (prompt) {
            beachIndicator.classList.remove('hidden');
            const label = beachIndicator.querySelector('span');
            if (label) {
                label.innerHTML = prompt.indexOf('TALK') === 0
                    ? `Press <kbd class="bg-slate-800 px-2 py-1 rounded text-xs">E</kbd> to ${prompt}`
                    : `Press <kbd class="bg-slate-800 px-2 py-1 rounded text-xs">E</kbd> to open ${prompt}`;
            }
        } else {
            beachIndicator.classList.add('hidden');
        }
    }

    // Survival time tracking (for achievement)
    if (!state.paused && state.player.hp > 0) {
        state.player.survivalTime = (state.player.survivalTime || 0) + delta;
        if (state.player.survivalTime >= 3600 && typeof Achievements !== 'undefined') {
            Achievements.checkSurvival(state, state.player.survivalTime);
        }
    }

    requestAnimationFrame(mainLoop);
}

// Boot-time HUD refresh
if (typeof Player !== 'undefined') {
    Player.refreshHUD(state);
    Player.refreshWeaponHUD(state);
}
UI.renderWeaponToolbar(state);
UI.refreshLuckDisplay(state);

requestAnimationFrame(mainLoop);

// Boot loading screen: tips rotate while assets settle, then fade out
// once the first frames + menu background are up.
function bootScreen() {
    const tips = [
        'Casting the line…',
        'Hold SPACE near water to charge your cast…',
        'Rare fish bite faster on Blood Bait…',
        'The NW corner hides a sealed void portal…',
        'Runes hunger for fish: 🐟 → 💎 → 👑…',
        'Bosses snap lines — bring guns…',
    ];
    const el = document.getElementById('boot-overlay');
    const tip = document.getElementById('boot-tip');
    let i = 0;
    const tick = setInterval(() => {
        if (!el || el.classList.contains('hidden')) { clearInterval(tick); return; }
        i = (i + 1) % tips.length;
        if (tip) tip.innerText = tips[i];
    }, 450);
    setTimeout(() => {
        clearInterval(tick);
        if (el) {
            el.classList.add('hidden');
            setTimeout(() => { try { el.remove(); } catch (e) {} }, 600);
        }
    }, 1400);
}
bootScreen();

// ==========================================
// AUTOSAVE + HOTKEYS
// ==========================================
if (typeof SaveSystem !== 'undefined') {
    // Save router: in-room (host or client) -> personal MP-slot file,
    // single player -> selected local slot. MP never touches SP slots.
    const autoSave = () => {
        if (state.paused) return;
        if (state.player && state.player.isDead) return; // never save a corpse
        SaveSystem.save(state);
    };
    setInterval(autoSave, 30000);

    window.addEventListener('beforeunload', autoSave);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Save immediately. The sim itself keeps running via
            // BackgroundTick (1s steps) — no more forced pause-to-menu,
            // so tabbing out mid-room no longer kicks you out of the game.
            autoSave();
            // Held TAB never fires keyup when the tab loses focus.
            try { if (typeof TabList !== 'undefined') TabList.hide(); } catch (e) {}
        } else {
            // Back: MP clients pull a fresh snapshot, host broadcast resumes
            if (typeof Multiplayer !== 'undefined' && !Multiplayer.isHost && Multiplayer.roomCode) {
                if (Multiplayer.sendSyncRequest) {
                    try { Multiplayer.sendSyncRequest(); } catch (e) {}
                }
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'F9') {
            e.preventDefault();
            // SaveSystem.save routes itself: MP room -> MP slot file,
            // single player -> local slot. Never cross the streams.
            const ok = SaveSystem.save(state);
            const inRoom = (typeof Multiplayer !== 'undefined' && Multiplayer.roomCode);
            const label = ok
                ? (inRoom ? 'MP file saved (personal slot).' : 'Progress saved to disk.')
                : 'Save failed.';
            if (typeof Particles !== 'undefined' && Particles.showFloatingText) {
                Particles.showFloatingText(state,
                    ok ? "Progress saved!" : "Save failed!",
                    state.player.x, state.player.y - 40,
                    ok ? '#34d399' : '#f87171');
            }
            UI.updateStatusBanner(label, 'Save', ok ? 'emerald' : 'rose');
        }
    });
}