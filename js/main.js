// ==========================================
// UI HELPER SYSTEM & STATUS OVERLAYS
// ==========================================
const UI = {
    updateStatusBanner(text, stepTag = 'Info', theme = 'sky') {
        const banner = document.getElementById('status-banner');
        if (banner) {
            banner.innerHTML = `<span class="text-amber-400 font-extrabold uppercase mr-1">[${stepTag}]:</span> ${text}`;
        }
    },

    updateTensionBar(state) {
        const f = state.fishing;
        const rod = state.player.equippedRod || (typeof RODS !== 'undefined' ? RODS[0] : { tensionMax: 100 });
        const bar = document.getElementById('tension-bar');
        const txt = document.getElementById('tension-text');
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
        const el = document.getElementById('damage-flash');
        if (!el) return;
        el.classList.remove('active');
        void el.offsetWidth;
        el.classList.add('active');
    },

    showCatchPopup(species) {
        const container = document.getElementById('catch-popup-container');
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

        if (p.activeSlot === slotIdx) Player.refreshWeaponHUD(state);
        this.renderWeaponToolbar(state);
        return true;
    },

    unequipSlot(state, slotIdx) {
        const p = state.player;
        if (slotIdx < 0 || slotIdx >= EQUIP_SLOTS) return;
        p.equippedWeapons[slotIdx] = null;
        if (p.activeSlot === slotIdx) Player.refreshWeaponHUD(state);
        this.renderWeaponToolbar(state);
    },

    renderWeaponToolbar(state) {
        const toolbar = document.getElementById('weapon-toolbar');
        if (!toolbar || typeof WEAPONS === 'undefined') return;
        const p = state.player;
        toolbar.innerHTML = '';

        for (let i = 0; i < EQUIP_SLOTS; i++) {
            const weaponId = p.equippedWeapons[i];
            const w = weaponId ? WEAPONS.find(x => x.id === weaponId) : null;
            const active = p.activeSlot === i;

            const slot = document.createElement('div');
            slot.className = `weapon-slot relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${
                active ? 'active' : 'border-slate-700/60 bg-slate-900/60'
            } ${w ? '' : 'opacity-40'}`;
            slot.innerHTML = w
                ? `<i class="fa-solid ${w.icon} text-lg text-amber-400"></i>
                   <span class="text-[9px] font-bold mt-0.5 text-slate-300">${i + 1}</span>`
                : `<i class="fa-solid fa-plus text-lg text-slate-600"></i>
                   <span class="text-[9px] font-bold mt-0.5 text-slate-600">${i + 1}</span>`;
            slot.onclick = () => Player.selectWeapon(state, i);
            slot.oncontextmenu = (e) => {
                e.preventDefault();
                UI.unequipSlot(state, i);
            };
            toolbar.appendChild(slot);
        }
    },

    renderStatusEffectsHUD(state) {
        const p = state.player;
        let hud = document.getElementById('status-effects-hud');
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
        const el = document.getElementById('luck-display');
        if (!el) return;
        const rod = state.player.equippedRod;
        const luck = rod && typeof rod.luck === 'number' ? rod.luck : 0;
        el.innerText = `+${Math.round(luck * 100)}%`;
    },
	
	    updateBossBar(state) {
        const barWrap = document.getElementById('boss-bar');
        if (!barWrap) return;

        const boss = state.activeBoss;
        if (!boss || boss.hp <= 0 || !state.monstersOnLand.includes(boss)) {
            barWrap.classList.add('hidden');
            return;
        }

        barWrap.classList.remove('hidden');

        const nameEl = document.getElementById('boss-name');
        const hpTextEl = document.getElementById('boss-hp-text');
        const hpBarEl = document.getElementById('boss-hp-bar');
        const phaseEl = document.getElementById('boss-phase-text');

        const maxHp = boss.maxHp || boss.species.maxHp || 1;
        const ratio = Math.max(0, Math.min(1, boss.hp / maxHp));
        const pct = Math.round(ratio * 100);

        if (nameEl) nameEl.innerText = boss.species.name.toUpperCase();
        if (hpTextEl) hpTextEl.innerText = `${Math.round(boss.hp).toLocaleString()} / ${maxHp.toLocaleString()}`;
        if (hpBarEl) hpBarEl.style.width = `${pct}%`;

        const phase = ratio > 0.4 ? 'PHASE 1' : 'PHASE 2 — ENRAGED';
        if (phaseEl) {
            phaseEl.innerText = phase;
            phaseEl.className = ratio > 0.4
                ? 'text-[10px] text-amber-300 font-bold mt-1 tracking-wider'
                : 'text-[10px] text-rose-400 font-black mt-1 tracking-wider animate-pulse';
        }
    },
	
};

// ==========================================
// CANVAS SETUP & RESIZING
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    state.canvasWidth = canvas.width;
    state.canvasHeight = canvas.height;
    state.waterBoundaryX = canvas.width * (CONFIG.WATER_BOUNDARY_RATIO || 0.65);
}

// ==========================================
// GLOBAL ENGINE STATE
// ==========================================
const state = {
    player: {
        x: 300, y: 300, radius: CONFIG.PLAYER_RADIUS || 16, speed: CONFIG.PLAYER_SPEED || 220,
        hp: CONFIG.PLAYER_MAX_HP || 100, maxHp: CONFIG.PLAYER_MAX_HP || 100,

        equippedWeapons: ['pistol', null, null, null],
        activeSlot: 0,
        ownedWeapons: ['pistol'],

        weaponAmmo: { pistol: Infinity, shotgun: 20, rifle: 60, harpoon: 10 },
        equippedRod: RODS[0], unlockedRods: ['rod_starter'],
        coins: 150, bucket: [], bucketCapacity: 15,

        lastShotTime: -999,
        weaponRecoil: 0, muzzleFlash: 0,
        reloading: false, reloadTimer: 0,

        xp: 0, level: 1, xpToNext: CONFIG.XP_LEVEL_BASE || 100,
        facing: 1,

        stunTimer: 0,
        slowTimer: 0,
        burnTimer: 0,
        burnTick: 0
    },
    keys: {},
    mouse: { x: 0, y: 0, isDown: false, worldX: 0, worldY: 0 },
    camera: { x: 300, y: 300, zoom: 1.0, targetZoom: 1.0, shakeX: 0, shakeY: 0 },
    fishing: {
        mode: 'IDLE', castPower: 0, castDir: 1,
        bobber: { x: 0, y: 0 }, lineTension: 0,
        hookedFish: null, biteTimer: 0, waitingTime: 0
    },
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

    // NEW — pause game until menu dismissed
    paused: true
};

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Init subsystems
if (typeof Input !== 'undefined') Input.init(state, canvas);
if (typeof Shop !== 'undefined') Shop.init(state);

// Audio toggle
const audioBtn = document.getElementById('btn-audio');
if (audioBtn) {
    audioBtn.onclick = () => {
        if (typeof audio !== 'undefined') {
            audio.muted = !audio.muted;
            const icon = document.getElementById('audio-icon');
            if (icon) {
                icon.className = audio.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
            }
        }
    };
}

// ==========================================
// MAIN MENU WIRING
// ==========================================
const MainMenu = {
    show() {
        const menu = document.getElementById('main-menu');
        if (menu) menu.classList.remove('hidden');
        document.getElementById('menu-buttons').classList.remove('hidden');
        document.getElementById('menu-about').classList.add('hidden');
        state.paused = true;
        // Refresh Continue button state
        const contBtn = document.getElementById('btn-load');
        if (contBtn) {
            const hasSave = (typeof SaveSystem !== 'undefined') && SaveSystem.exists();
            contBtn.disabled = !hasSave;
            contBtn.querySelector('span').innerText = hasSave ? 'Continue' : 'No Save Found';
        }
    },

    hide() {
        const menu = document.getElementById('main-menu');
        if (menu) menu.classList.add('hidden');
        state.paused = false;
    },

    init(state) {
        const self = this;

        document.getElementById('btn-start').onclick = () => {
            // Wipe any old save and start fresh
            if (typeof SaveSystem !== 'undefined') SaveSystem.wipe();
            self.hide();
            UI.updateStatusBanner('New game started. Cast your line!', 'Start', 'emerald');
        };

        document.getElementById('btn-load').onclick = () => {
            if (typeof SaveSystem === 'undefined') return;
            const ok = SaveSystem.load(state);
            if (ok) {
                // Refresh everything after load
                if (typeof Player.initWeaponAmmo === 'function') Player.initWeaponAmmo(state);
                Player.refreshHUD(state);
                Player.refreshWeaponHUD(state);
                UI.renderWeaponToolbar(state);
                UI.refreshLuckDisplay(state);
                self.hide();
                UI.updateStatusBanner('Progress loaded.', 'Loaded', 'emerald');
            } else {
                UI.updateStatusBanner('No save found.', 'Load', 'rose');
            }
        };

        document.getElementById('btn-save-menu').onclick = () => {
            if (typeof SaveSystem === 'undefined') return;
            const ok = SaveSystem.save(state);
            UI.updateStatusBanner(
                ok ? 'Progress saved.' : 'Save failed.',
                'Save', ok ? 'emerald' : 'rose'
            );
        };

        document.getElementById('btn-about').onclick = () => {
            document.getElementById('menu-buttons').classList.add('hidden');
            document.getElementById('menu-about').classList.remove('hidden');
        };

        document.getElementById('btn-about-back').onclick = () => {
            document.getElementById('menu-about').classList.add('hidden');
            document.getElementById('menu-buttons').classList.remove('hidden');
        };

        // Menu button in HUD
        const hudMenuBtn = document.getElementById('btn-menu');
        if (hudMenuBtn) {
            hudMenuBtn.onclick = () => self.show();
        }

        // ESC opens the menu
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // If the shop is open, close it first
                const shop = document.getElementById('shop-modal');
                if (shop && !shop.classList.contains('hidden')) {
                    shop.classList.add('hidden');
                    return;
                }
                const menu = document.getElementById('main-menu');
                if (menu && !menu.classList.contains('hidden')) {
                    // If menu is showing and we're NOT in the about panel, close the menu
                    if (!document.getElementById('menu-buttons').classList.contains('hidden')) {
                        self.hide();
                    }
                } else {
                    self.show();
                }
            }
        });

        // Open the menu on boot
        self.show();
    }
};

// ==========================================
// SAVE SYSTEM BOOT
// ==========================================
let loadedFromSave = false;
if (typeof SaveSystem !== 'undefined') {
    loadedFromSave = SaveSystem.load(state);
}

if (typeof Player !== 'undefined' && typeof Player.initWeaponAmmo === 'function') {
    Player.initWeaponAmmo(state);
}

// Init the menu (this also shows it)
if (typeof MainMenu !== 'undefined') MainMenu.init(state);

// ==========================================
// MAIN GAME LOOP
// ==========================================
let lastTime = performance.now();

function mainLoop(time) {
    const delta = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;

    // If paused (menu open), skip simulation but still render
    if (state.paused) {
        // Still render the world so the player sees it behind the menu
        if (typeof Render !== 'undefined' && Render.drawWorld) {
            Render.drawWorld(state, ctx);
        }
        requestAnimationFrame(mainLoop);
        return;
    }

    state.time += delta;

    if (state.screenShake > 0) {
        state.camera.shakeX = (Math.random() - 0.5) * state.screenShake * 2;
        state.camera.shakeY = (Math.random() - 0.5) * state.screenShake * 2;
        state.screenShake = Math.max(0, state.screenShake - delta * 25);
    } else {
        state.camera.shakeX = 0;
        state.camera.shakeY = 0;
    }

    if (typeof Camera !== 'undefined') Camera.update(state, delta);
    if (typeof Input !== 'undefined') Input.updateMouseWorld(state);
    if (typeof Player !== 'undefined') Player.update(state, delta);
    if (typeof Fishing !== 'undefined') Fishing.update(state, delta);
    if (typeof WeaponSystem !== 'undefined') WeaponSystem.update(state, delta);
    if (typeof Combat !== 'undefined') Combat.update(state, delta);
    if (typeof Particles !== 'undefined') Particles.update(state, delta);

    if (typeof Render !== 'undefined' && Render.drawWorld) {
        Render.drawWorld(state, ctx);
    }
	UI.updateBossBar(state);
    UI.renderStatusEffectsHUD(state);

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

// ==========================================
// AUTOSAVE + HOTKEYS
// ==========================================
if (typeof SaveSystem !== 'undefined') {
    setInterval(() => {
        if (!state.paused) SaveSystem.save(state);
    }, 30000);

    window.addEventListener('beforeunload', () => {
        if (!state.paused) SaveSystem.save(state);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && !state.paused) SaveSystem.save(state);
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'F9') {
            e.preventDefault();
            const ok = SaveSystem.save(state);
            Particles.showFloatingText(state,
                ok ? "Progress saved!" : "Save failed!",
                state.player.x, state.player.y - 40,
                ok ? '#34d399' : '#f87171');
            UI.updateStatusBanner(
                ok ? 'Progress saved to disk.' : 'Save failed.',
                'Save', ok ? 'emerald' : 'rose');
        }
    });
}