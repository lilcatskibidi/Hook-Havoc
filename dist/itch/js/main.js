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
	
    // Multiplayer HUD updates
    updateMultiplayerHUD(info) {
        const statusEl = document.getElementById('mp-status');
        const healEl = document.getElementById('mp-heal-btn');
        const healCdEl = document.getElementById('mp-heal-cooldown');
        const chatEl = document.getElementById('mp-chat-messages');
        
        if (statusEl) {
            if (info.isConnected) {
                statusEl.innerHTML = `<i class="fa-solid fa-circle text-emerald-400 animate-pulse mr-1"></i>${info.isHost ? 'Host' : 'Client'} · Room: ${info.roomCode}`;
                statusEl.className = 'text-emerald-400';
            } else {
                statusEl.innerHTML = `<i class="fa-solid fa-circle text-rose-400 mr-1"></i>Disconnected`;
                statusEl.className = 'text-rose-400';
            }
        }
        
        if (healEl && healCdEl) {
            if (info.healCooldown > 0) {
                healEl.disabled = true;
                healEl.innerHTML = `<i class="fa-solid fa-heart-pulse mr-1"></i>Heal (${info.healCooldown.toFixed(1)}s)`;
                healCdEl.style.width = `${(1 - info.healCooldown / 10) * 100}%`;
            } else if (info.healsRemaining > 0) {
                healEl.disabled = false;
                healEl.innerHTML = `<i class="fa-solid fa-heart-pulse mr-1"></i>Heal (${info.healsRemaining})`;
                healCdEl.style.width = '100%';
            } else {
                healEl.disabled = true;
                healEl.innerHTML = `<i class="fa-solid fa-heart-crack mr-1"></i>No Heals`;
                healCdEl.style.width = '0%';
            }
        }
    },
    
    addChatMessage(from, message, isHost) {
        const chatEl = document.getElementById('mp-chat-messages');
        if (!chatEl) return;
        
        const div = document.createElement('div');
        div.className = 'text-xs';
        div.innerHTML = `<span class="font-bold ${isHost ? 'text-amber-400' : 'text-sky-400'}">${isHost ? 'Host' : 'Client'}:</span> <span class="text-slate-300">${message}</span>`;
        chatEl.appendChild(div);
        chatEl.scrollTop = chatEl.scrollHeight;
        
        // Limit messages
        while (chatEl.children.length > 20) {
            chatEl.removeChild(chatEl.firstChild);
        }
    }
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

// NOTE: the initial resizeCanvas() call happens *after* `state` is declared
// below — reading `state` before its `const` is initialized throws a TDZ
// ReferenceError and aborts the rest of this script.

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
    paused: true,
    
    // Multiplayer
    remotePlayer: null,
    multiplayer: null
};

// Size the canvas now that `state` exists. Must stay above Input.init/Shop.init
// because those read state.canvasWidth / state.canvasHeight.
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
// MULTIPLAYER UI
// ==========================================
const MultiplayerUI = {
    currentPanel: 'main', // 'main', 'host', 'join', 'lobby'
    
    init(state) {
        this.state = state;
        this.bindEvents();
    },
    
    bindEvents() {
        // Main menu multiplayer button
        const mpBtn = document.getElementById('btn-multiplayer');
        if (mpBtn) {
            mpBtn.onclick = () => this.showPanel('multiplayer');
        }
        
        // Host button
        const hostBtn = document.getElementById('btn-host');
        if (hostBtn) {
            hostBtn.onclick = () => this.hostGame();
        }
        
        // Join button
        const joinBtn = document.getElementById('btn-join');
        if (joinBtn) {
            joinBtn.onclick = () => this.showPanel('join');
        }
        
        // Back from multiplayer
        const backBtn = document.getElementById('btn-mp-back');
        if (backBtn) {
            backBtn.onclick = () => this.showPanel('main');
        }
        
        // Back from join
        const joinBackBtn = document.getElementById('btn-join-back');
        if (joinBackBtn) {
            joinBackBtn.onclick = () => this.showPanel('multiplayer');
        }
        
        // Join room submit
        const joinSubmit = document.getElementById('btn-join-submit');
        const joinInput = document.getElementById('join-room-code');
        if (joinSubmit && joinInput) {
            joinSubmit.onclick = () => this.joinGame(joinInput.value);
            joinInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.joinGame(joinInput.value);
            });
        }
        
        // Copy room code
        const copyBtn = document.getElementById('btn-copy-room');
        if (copyBtn) {
            copyBtn.onclick = () => this.copyRoomCode();
        }
        
        // Leave lobby
        const leaveBtn = document.getElementById('btn-leave-lobby');
        if (leaveBtn) {
            leaveBtn.onclick = () => this.leaveLobby();
        }
        
        // Start game from lobby (host only)
        const startBtn = document.getElementById('btn-start-mp');
        if (startBtn) {
            startBtn.onclick = () => this.startMultiplayerGame();
        }
        
        // Heal button
        const healBtn = document.getElementById('mp-heal-btn');
        if (healBtn) {
            healBtn.onclick = () => this.requestHeal();
        }
        
        // Chat toggle
        const chatToggle = document.getElementById('mp-chat-toggle');
        const chatPanel = document.getElementById('mp-chat-panel');
        if (chatToggle && chatPanel) {
            chatToggle.onclick = () => {
                chatPanel.classList.toggle('hidden');
            };
        }
        
        // Chat send
        const chatSend = document.getElementById('mp-chat-send');
        const chatInput = document.getElementById('mp-chat-input');
        if (chatSend && chatInput) {
            chatSend.onclick = () => this.sendChat(chatInput.value);
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.sendChat(chatInput.value);
                    chatInput.value = '';
                }
            });
        }
    },
    
    showPanel(panel) {
        // Hide all panels
        document.querySelectorAll('.mp-panel').forEach(p => p.classList.add('hidden'));
        
        // Show requested panel
        const panelEl = document.getElementById(`mp-panel-${panel}`);
        if (panelEl) panelEl.classList.remove('hidden');
        
        this.currentPanel = panel;
    },
    
    async hostGame() {
        if (!window.Multiplayer) {
            UI.updateStatusBanner('Multiplayer module not loaded', 'Error', 'rose');
            return;
        }
        
        this.showPanel('lobby');
        this.setLobbyStatus('Creating room...');
        
        try {
            const roomCode = await window.Multiplayer.createRoom();
            this.setLobbyStatus(`Room created: ${roomCode} - Waiting for player...`);
            document.getElementById('mp-room-code').innerText = roomCode;
            document.getElementById('btn-start-mp').disabled = false;
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
        
        this.setJoinStatus('Connecting...');
        
        try {
            await window.Multiplayer.joinRoom(roomCode.toUpperCase());
            this.showPanel('lobby');
            this.setLobbyStatus(`Joined room: ${roomCode.toUpperCase()} - Waiting for host to start...`);
            document.getElementById('mp-room-code').innerText = roomCode.toUpperCase();
            document.getElementById('btn-start-mp').disabled = true; // Only host can start
        } catch (e) {
            this.setJoinStatus(`Failed: ${e.message}`, 'rose');
        }
    },
    
    setLobbyStatus(msg, theme = 'sky') {
        const el = document.getElementById('mp-lobby-status');
        if (el) {
            el.innerText = msg;
            el.className = `text-sm font-bold ${theme === 'rose' ? 'text-rose-400' : theme === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`;
        }
    },
    
    setJoinStatus(msg, theme = 'sky') {
        const el = document.getElementById('mp-join-status');
        if (el) {
            el.innerText = msg;
            el.className = `text-sm font-bold ${theme === 'rose' ? 'text-rose-400' : theme === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`;
        }
    },
    
    copyRoomCode() {
        const code = document.getElementById('mp-room-code').innerText;
        navigator.clipboard.writeText(code).then(() => {
            this.setLobbyStatus('Room code copied!', 'emerald');
            setTimeout(() => this.setLobbyStatus(`Room: ${code} - Waiting for player...`), 1500);
        });
    },
    
    leaveLobby() {
        if (window.Multiplayer) {
            window.Multiplayer.leaveRoom();
        }
        this.showPanel('multiplayer');
    },
    
    startMultiplayerGame() {
        if (!window.Multiplayer || !window.Multiplayer.isHost) return;
        
        // Hide menu and start game
        MainMenu.hide();
        this.showInGameHUD();
        UI.updateStatusBanner('Multiplayer game started!', 'Start', 'emerald');
    },
    
    showInGameHUD() {
        const hud = document.getElementById('mp-hud');
        if (hud) hud.classList.remove('hidden');
    },
    
    hideInGameHUD() {
        const hud = document.getElementById('mp-hud');
        if (hud) hud.classList.add('hidden');
    },
    
    requestHeal() {
        if (window.Multiplayer) {
            window.Multiplayer.requestHeal('all'); // Heal both players
        }
    },
    
    sendChat(message) {
        if (!message.trim()) return;
        if (window.Multiplayer) {
            window.Multiplayer.sendChat(message);
        }
        const input = document.getElementById('mp-chat-input');
        if (input) input.value = '';
    },
    
    updateHUD() {
        if (window.Multiplayer) {
            const info = window.Multiplayer.getConnectionInfo();
            UI.updateMultiplayerHUD(info);
        }
    },
    
    onChatMessage(from, message, isHost) {
        UI.addChatMessage(from, message, isHost);
    },
    
    onHealReceived(amount, isSelf) {
        if (isSelf) {
            UI.updateStatusBanner(`You were healed for ${amount} HP!`, 'Heal', 'emerald');
        } else {
            UI.updateStatusBanner(`Your partner healed you for ${amount} HP!`, 'Heal', 'emerald');
        }
    },
    
    onPlayerJoined() {
        this.setLobbyStatus('Player joined! Ready to start.', 'emerald');
        document.getElementById('btn-start-mp').disabled = false;
    },
    
    onPlayerLeft() {
        this.setLobbyStatus('Player left. Waiting for new player...', 'rose');
        document.getElementById('btn-start-mp').disabled = true;
    }
};

// ==========================================
// MAIN MENU WIRING
// ==========================================
const MainMenu = {
    show() {
        const menu = document.getElementById('main-menu');
        if (menu) menu.classList.remove('hidden');
        document.getElementById('menu-buttons').classList.remove('hidden');
        document.getElementById('menu-about').classList.add('hidden');
        document.getElementById('mp-panel-main').classList.remove('hidden');
        document.getElementById('mp-panel-multiplayer').classList.add('hidden');
        document.getElementById('mp-panel-join').classList.add('hidden');
        document.getElementById('mp-panel-lobby').classList.add('hidden');
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
                    if (!document.getElementById('menu-buttons').classList.contains('hidden') &&
                        !document.getElementById('mp-panel-multiplayer').classList.contains('hidden')) {
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

// Init Multiplayer UI
if (typeof MultiplayerUI !== 'undefined') MultiplayerUI.init(state);

// Initialize Multiplayer system
if (typeof Multiplayer !== 'undefined') {
    Multiplayer.init(state, {
        onStatusChange: (msg) => {
            if (MultiplayerUI.currentPanel === 'lobby') {
                MultiplayerUI.setLobbyStatus(msg);
            }
        },
        onChatMessage: (from, message, isHost) => {
            MultiplayerUI.onChatMessage(from, message, isHost);
        },
        onHealReceived: (amount, isSelf) => {
            MultiplayerUI.onHealReceived(amount, isSelf);
        },
        onPlayerJoined: () => {
            MultiplayerUI.onPlayerJoined();
        },
        onPlayerLeft: () => {
            MultiplayerUI.onPlayerLeft();
        },
        onError: (msg) => {
            UI.updateStatusBanner(msg, 'Error', 'rose');
        }
    });
    state.multiplayer = Multiplayer;
}

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
        
        // Update multiplayer HUD even in menu
        if (typeof MultiplayerUI !== 'undefined') {
            MultiplayerUI.updateHUD();
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
    
    // Update multiplayer
    if (typeof Multiplayer !== 'undefined' && state.multiplayer) {
        state.multiplayer.update(delta);
        
        // Send input if connected
        if (state.multiplayer.isConnected && !state.multiplayer.isHost) {
            const input = {
                keys: { ...state.keys },
                mouse: { 
                    x: state.mouse.x, 
                    y: state.mouse.y,
                    worldX: state.mouse.worldX,
                    worldY: state.mouse.worldY,
                    isDown: state.mouse.isDown
                },
                player: {
                    x: state.player.x,
                    y: state.player.y,
                    hp: state.player.hp,
                    facing: state.player.facing,
                    activeSlot: state.player.activeSlot
                }
            };
            state.multiplayer.sendInput(input);
        }
        
        // Update multiplayer HUD
        if (typeof MultiplayerUI !== 'undefined') {
            MultiplayerUI.updateHUD();
        }
    }

    if (typeof Render !== 'undefined' && Render.drawWorld) {
        Render.drawWorld(state, ctx);
    }
    
    // Render remote player
    if (typeof Multiplayer !== 'undefined' && state.multiplayer && state.multiplayer.isConnected) {
        if (typeof Multiplayer.renderRemotePlayer === 'function') {
            Multiplayer.renderRemotePlayer(ctx);
        }
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
        
        // Multiplayer hotkeys
        if (e.key === 'h' && !state.paused && state.multiplayer && state.multiplayer.isConnected) {
            // H key for heal
            e.preventDefault();
            state.multiplayer.requestHeal('all');
        }
        
        if (e.key === 'Enter' && !state.paused && state.multiplayer && state.multiplayer.isConnected) {
            // Enter to focus chat (if not already typing)
            const chatInput = document.getElementById('mp-chat-input');
            if (chatInput && document.activeElement !== chatInput) {
                chatInput.focus();
            }
        }
    });
}