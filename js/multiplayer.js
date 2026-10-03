/**
 * Multiplayer Module for Aquatic Havoc
 * Online P2P via PeerJS cloud (no localhost server needed — works on itch.io).
 * Transport lives in js/peerlink.js; this file owns game-state sync.
 */

const Multiplayer = {
    // Connection state (transport owned by PeerLink — see js/peerlink.js)
    isHost: false,
    isConnected: false,
    roomCode: null,
    localClientId: null,
    remoteClientId: null,
    
    // Game state
    localPlayerState: null,
    remotePlayerState: null,
    pendingInputs: [],
    lastSentState: 0,
    stateSendInterval: null,

    // Lobby / room (up to 4 players, star topology via host)
    _lobbyCount: 1,
    hostPeers: null,      // host-only: clientId -> snapshot
    hostPeerOrder: null,  // host-only: join order for Player 2/3/4 labels
    _lastGameStateTs: 0,
    _lastInputSent: 0,
    _roomRoster: null,    // client-side copy: [{id, name}] + hostName
    _hostName: 'Host',

    // ---- MP diagnostics: player-visible event/error log ----
    // Every connection/sync/id problem lands here with a short code, so
    // players can quote EXACTLY what happened (see the Feedback panel).
    _mpLog: null,       // [{t, code, msg}]
    _mpLogSeen: null,   // code -> last timestamp (throttle repeats)

    // Short, stable, player-quotable peer id for logs (never the full
    // PeerJS room id — those are long and contain the room code).
    shortId(id) {
        try {
            const s = String(id == null ? '' : id);
            if (!s) return '?';
            if (s.indexOf('aquatic-havoc-') === 0) return '…' + s.slice(-4);
            return s.length > 8 ? s.slice(0, 4) + '…' + s.slice(-4) : s;
        } catch (e) { return '?'; }
    },

    // code: 'join-reject' | 'version-mismatch' | 'room-full' |
    //   'name-taken' | 'peer-unavailable' | 'p2p-blocked' | 'cloud-error' |
    //   'host-left' | 'member-left' | 'no-snapshot' | 'bad-pid' | 'send-fail' |
    //   'skin-fail' | 'sync-ok' | 'sync-restored' | 'info'
    mpLog(code, msg) {
        try {
            if (!this._mpLog) this._mpLog = [];
            const now = Date.now();
            // Throttle identical repeats to 1 per 8s (input/snapshot loops).
            const k = String(code) + '|' + String(msg || '').slice(0, 80);
            if (!this._mpLogSeen) this._mpLogSeen = {};
            if (this._mpLogSeen[k] && now - this._mpLogSeen[k] < 8000) return;
            this._mpLogSeen[k] = now;
            this._mpLog.push({ t: now, code: String(code || 'info'), msg: String(msg || '').slice(0, 220) });
            if (this._mpLog.length > 60) this._mpLog.splice(0, this._mpLog.length - 60);
            try {
                if (typeof MultiplayerUI !== 'undefined' && MultiplayerUI.refreshMpLog) MultiplayerUI.refreshMpLog();
            } catch (e) {}
        } catch (e) {}
    },

    mpLogList() {
        return Array.isArray(this._mpLog) ? this._mpLog.slice() : [];
    },

    mpLogText(max) {
        try {
            const list = this.mpLogList().slice(-(max || 12));
            return list.map(e => {
                const d = new Date(e.t);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                return `[${hh}:${mm}:${ss}] ${e.code}: ${e.msg}`;
            }).join('\n');
        } catch (e) { return ''; }
    },

    // ---- Peer-id guard: every id crossing the wire is validated ----
    // Rejects junk placeholders ('peer', 'self', 'me', 'undefined', …)
    // that used to file ghosts into hostPeers / remotePlayers.
    _normPid(v, where) {
        try {
            if (typeof v !== 'string') {
                if (v !== undefined && v !== null) this.mpLog('bad-pid', `non-string id from ${where || '?'}`);
                return null;
            }
            const s = v.trim();
            if (!s || s === 'peer' || s === 'self' || s === 'me' ||
                s === 'undefined' || s === 'null' || s === 'unknown') {
                this.mpLog('bad-pid', `placeholder id "${s}" from ${where || '?'}`);
                return null;
            }
            return s;
        } catch (e) { return null; }
    },

    // Roster for lobby + HUD: [{id, name, isYou, isHost}]. Host builds it
    // from members; clients replay the last roster broadcast.
    getRoster() {
        try {
            const out = [];
            const me = this.localClientId || 'host';
            if (this.isHost || !this.roomCode) {
                let myName = 'Host';
                try { myName = this.playerName() || 'Host'; } catch (e) {}
                out.push({ id: me, name: myName, isYou: true, isHost: true });
                const order = Array.isArray(this.hostPeerOrder) ? this.hostPeerOrder : Object.keys(this.hostPeers || {});
                for (const pid of order) {
                    let nm = 'Player-' + String(pid == null ? '?' : pid).slice(-4);
                    try {
                        if (typeof PeerLink !== 'undefined' && PeerLink.memberNames && PeerLink.memberNames[pid]) {
                            nm = PeerLink.memberNames[pid];
                        }
                    } catch (e) {}
                    const rp = (this.hostPeers || {})[pid];
                    if (rp && rp.playerName) nm = rp.playerName;
                    out.push({ id: pid, name: nm, isYou: false, isHost: false });
                }
            } else {
                const roster = Array.isArray(this._roomRoster) ? this._roomRoster : [];
                out.push({ id: 'host', name: this._hostName || 'Host', isYou: false, isHost: true });
                for (const m of roster) {
                    if (!m || !m.id) continue;
                    out.push({ id: m.id, name: m.name || ('Player-' + String(m.id).slice(-4)), isYou: m.id === me, isHost: false });
                }
            }
            return out;
        } catch (e) { return []; }
    },

    // Room-wide boss lock: a boss ANYWHERE (host sim or a peer's hooked
    // fish) blocks every other summon — one boss per room, period.
    roomBossBusy() {
        try {
            if (!this.roomCode || !this.state) return null;
            if (typeof Ritual !== 'undefined' && Ritual.bossAlive && Ritual.bossAlive(this.state)) {
                return { by: 'the room' };
            }
            const hookedIsBoss = (f) => {
                try {
                    const h = f && f.mode === 'HOOKED' ? (f.hooked || (f.hookedFish && { species: f.hookedFish.species })) : null;
                    const sp = h && h.species ? h.species : (h && h.id ? h : null);
                    if (!sp) return false;
                    if (sp.isBoss) return true;
                    return (sp.rarity === 'boss');
                } catch (e) { return false; }
            };
            if (this.isHost) {
                for (const [pid, rp] of Object.entries(this.hostPeers || {})) {
                    if (rp && hookedIsBoss(rp.fishing)) {
                        return { by: (rp.playerName || rp.label || 'a crewmate') };
                    }
                }
            } else {
                for (const rp of Object.values(this.state.remotePlayers || {})) {
                    if (rp && hookedIsBoss(rp.fishing)) {
                        return { by: (rp.label || rp.playerName || 'a crewmate') };
                    }
                }
            }
            return null;
        } catch (e) { return null; }
    },
    
    // Healing system (removed — no heal feature)
    // Chat system (removed — no chat feature)

    // Config: PeerJS cloud (free broker) + public STUN. No self-hosted
    // signaling server needed — rooms work from anywhere, itch.io included.
    // Same-version gate: the room id embeds the version digits.
    peerRoomPrefix() {
        try {
            const v = (typeof GAME_VERSION === 'string' && GAME_VERSION) ? GAME_VERSION : '1.2.5';
            return 'aquatic-havoc-v' + String(v).replace(/[^0-9]/g, '') + '-';
        } catch (e) {
            return 'aquatic-havoc-v120-';
        }
    },
    
    // Callbacks
    onStatusChange: null,
    onPlayerJoined: null,
    onPlayerLeft: null,
    onGameStart: null,
    onError: null,
    onHostLeftCb: null,

    // Client outbox (bullets fired since last input send)
    _outboxBullets: null,
    _awardSeq: 0,
    _pendingAwards: null, // host: pid -> { aid, coins, xp }
    _appliedAwards: null, // client: aid -> true
    _fxOutbox: null,
    _suppressFxEmit: false,
    _ownBulletIds: null,
    _fishHitClaims: null, // client outbox: hits on ANOTHER player's hooked fish
    _fishHitOutbox: null, // host: targetPid -> [hits] to forward
    _fishHitApplied: null, // catcher dedupe: bid -> timestamp

    // True when this peer is a non-host member of a room
    isClient() {
        return !this.isHost && !!this.roomCode;
    },

    // ---- Persistent MP identity: stable pid per browser + chosen name ----
    // Rejoining with the same name just works: the pid never changes, the
    // name is remembered and shown to the room every session.
    PID_KEY: 'ah_mp_pid',
    NAME_KEY: 'ah_mp_name',
    // Per-TAB override (sessionStorage): two tabs on one origin (same
    // localhost, two windows) share localStorage, so without this the
    // 2nd tab's typing would OVERWRITE the host tab's name and every
    // join would falsely report "Name taken". Session reads win.
    TAB_NAME_KEY: 'ah_mp_name_tab',

    ensureIdentity() {
        try {
            let pid = null;
            try { pid = localStorage.getItem(this.PID_KEY); } catch (e) {}
            if (!pid) {
                pid = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 0xffffff).toString(36);
                try { localStorage.setItem(this.PID_KEY, pid); } catch (e) {}
            }
            return pid;
        } catch (e) {
            return 'p' + Math.floor(Math.random() * 0xffffffff).toString(36);
        }
    },

    localPid() {
        try {
            if (!this._pid) this._pid = this.ensureIdentity();
            return this._pid;
        } catch (e) { return 'p0'; }
    },

    // Display name (1-12 chars, markup stripped). This TAB's choice
    // wins (sessionStorage); localStorage is only the cross-session
    // default prefilled into empty fields.
    playerName() {
        try {
            const t = sessionStorage.getItem(this.TAB_NAME_KEY);
            if (typeof t === 'string' && t.trim()) return t.trim().slice(0, 12);
        } catch (e) {}
        try {
            const n = localStorage.getItem(this.NAME_KEY);
            return (typeof n === 'string' && n.trim()) ? n.trim().slice(0, 12) : '';
        } catch (e) { return ''; }
    },

    setPlayerName(name) {
        try {
            name = String(name || '').replace(/[<>&"']/g, '').trim().slice(0, 12);
            if (!name) return '';
            try { sessionStorage.setItem(this.TAB_NAME_KEY, name); } catch (e) {}
            try { localStorage.setItem(this.NAME_KEY, name); } catch (e) {}
            return name;
        } catch (e) { return ''; }
    },

    // ---- MP profile: separate slots + saves, never SP files ----
    // Entering a room snapshots the SP slot, switches to the MP namespace
    // (own slots 1-3) and loads-or-freshens it. Leaving restores SP.
    // CLIENT files are scoped per host server (hostPid): joining a
    // DIFFERENT host loads a DIFFERENT character — old servers' inventory
    // never leaks across. The HOST's expedition stays global (unscoped).
    enterMPProfile(slot) {
        try {
            if (typeof SaveSystem === 'undefined' || !this.state) return false;
            if (this.state._spSlotBackup == null) {
                this.state._spSlotBackup = this.state.saveSlot || SaveSystem.getSlot();
            }
            try {
                if (typeof SaveSystem.setMPScope === 'function') {
                    SaveSystem.setMPScope(this.isHost ? null : (this.hostPid || null));
                }
            } catch (e) {}
            slot = SaveSystem.MP_SLOTS.includes(slot) ? slot : SaveSystem.getMPSlot();
            if (!SaveSystem.loadMP(this.state, slot)) {
                SaveSystem.freshPlayer(this.state);
                SaveSystem.saveMP(this.state, slot);
                try { this.mpLog('info', this.isHost ? 'fresh expedition started' : `fresh character for server ${this.shortId(this.hostPid)}`); } catch (e) {}
            } else if (!this.isHost) {
                try { this.mpLog('info', `character restored for server ${this.shortId(this.hostPid)}`); } catch (e) {}
            }
            this.refreshMPHud();
            return true;
        } catch (e) { return false; }
    },

    exitMPProfile() {
        try {
            if (typeof SaveSystem === 'undefined' || !this.state) return false;
            // Idempotent: without a backed-up SP slot we are not on a
            // profile (already exited) — never snapshot SP state into MP.
            if (this.state._spSlotBackup == null) return false;
            // Persist the MP character first, then go home to single player.
            try { SaveSystem.saveMP(this.state); } catch (e) {}
            // Scope ends with the room: the next room re-scopes on enter.
            try { if (typeof SaveSystem.setMPScope === 'function') SaveSystem.setMPScope(null); } catch (e) {}
            this.hostPid = null;
            const backup = (this.state._spSlotBackup != null)
                ? this.state._spSlotBackup
                : (this.state.saveSlot || SaveSystem.getSlot());
            this.state._spSlotBackup = null;
            this.state.mpSaveSlot = null;
            SaveSystem.load(this.state, backup);
            this.refreshMPHud();
            return true;
        } catch (e) { return false; }
    },

    refreshMPHud() {
        try {
            if (typeof Player !== 'undefined' && this.state) {
                Player.refreshHUD(this.state);
                Player.refreshWeaponHUD(this.state);
            }
        } catch (e) {}
        try {
            if (typeof UI !== 'undefined' && this.state) {
                UI.renderWeaponToolbar(this.state);
                UI.refreshLuckDisplay(this.state);
            }
        } catch (e) {}
        try {
            if (typeof Casino !== 'undefined' && this.state) {
                Casino.tokens = this.state.player.casinoTokens || 0;
                Casino.updateTokenDisplay();
            }
        } catch (e) {}
    },
    
    // Initialize multiplayer system
    init(state, callbacks = {}) {
        this.state = state;
        this.onStatusChange = callbacks.onStatusChange || (() => {});
        this.onPlayerJoined = callbacks.onPlayerJoined || (() => {});
        this.onPlayerLeft = callbacks.onPlayerLeft || (() => {});
        this.onGameStart = callbacks.onGameStart || (() => {});
        this.onError = callbacks.onError || ((msg) => console.error(msg));
        this.onHostLeftCb = callbacks.onHostLeft || null;

        this._installFxTap();
        // Same text/colors everywhere: mirror catch popups + boss banners,
        // and share custom art so remote renders match local renders.
        try {
            if (typeof PeerAnnounce !== 'undefined') PeerAnnounce.installTap();
        } catch (e) {}
        try {
            if (typeof PeerSkins !== 'undefined') PeerSkins.installUploadTap();
        } catch (e) {}
        this.updateStatus('Ready to play multiplayer');
    },

    // Tap shared Particles helpers so every splash / blood / muzzle puff /
    // floating text spawned locally is mirrored to the other peer(s).
    // Remote-applied FX run with _suppressFxEmit so they never echo back.
    _installFxTap() {
        if (this._fxTapInstalled) return;
        this._fxTapInstalled = true;
        const self = this;
        const tap = (name) => {
            try {
                if (typeof Particles === 'undefined' || !Particles[name]) return;
                if (Particles[name]._mpTapped) return;
                const orig = Particles[name].bind(Particles);
                const fn = function (...args) {
                    const r = orig(...args);
                    try {
                        if (!self._suppressFxEmit && self.roomCode && self.state && !self.state.paused) {
                            if (!self._fxOutbox) self._fxOutbox = [];
                            if (self._fxOutbox.length < 60) {
                                // Quantize positions to cut bandwidth; keep color/count.
                                const q = (v) => Math.round((v || 0) * 2) / 2;
                                const st = self.state;
                                const rel = (x, y) => ({ x: q(x), y: q(y) });
                                if (name === 'showFloatingText' && args.length >= 4) {
                                    const p = rel(args[2], args[3]);
                                    self._fxOutbox.push({ fn: name, t: String(args[1]).slice(0, 40), x: p.x, y: p.y, c: String(args[4] || '#fff').slice(0, 24) });
                                } else if (args.length >= 3) {
                                    const p = rel(args[1], args[2]);
                                    self._fxOutbox.push({ fn: name, x: p.x, y: p.y, c: String(args[3] || '#fff').slice(0, 24), n: Math.min(24, args[4] | 0 || 8) });
                                }
                            }
                        }
                    } catch (e) {}
                    return r;
                };
                fn._mpTapped = true;
                Particles[name] = fn;
            } catch (e) {}
        };
        // Defer a tick: Particles may load after this file.
        const names = ['spawnParticles', 'spawnBloodImpact', 'spawnWaterSplashes', 'spawnDragTrail', 'spawnLightning', 'showFloatingText'];
        names.forEach(tap);
        try { setTimeout(() => names.forEach(tap), 1500); } catch (e) {}
    },

    _drainFx() {
        const out = this._fxOutbox && this._fxOutbox.length ? this._fxOutbox : null;
        this._fxOutbox = [];
        return out || [];
    },

    _applyFx(list) {
        if (!Array.isArray(list) || !list.length) return;
        if (typeof Particles === 'undefined' || !this.state) return;
        this._suppressFxEmit = true;
        try {
            for (const e of list.slice(0, 60)) {
                if (!e || !e.fn) continue;
                try {
                    if (e.fn === 'showFloatingText') Particles.showFloatingText(this.state, e.t, e.x, e.y, e.c);
                    else if (e.fn === 'spawnBloodImpact') Particles.spawnBloodImpact(this.state, e.x, e.y, e.c, e.n);
                    else if (e.fn === 'spawnWaterSplashes') Particles.spawnWaterSplashes(this.state, e.x, e.y, e.n);
                    else if (e.fn === 'spawnDragTrail') Particles.spawnDragTrail(this.state, e.x, e.y);
                    else if (e.fn === 'spawnLightning' && Particles.spawnLightning) Particles.spawnLightning(this.state, e.x, e.y, e.x + 40, e.y, e.c);
                    else Particles.spawnParticles(this.state, e.x, e.y, e.c, e.n);
                } catch (err) {}
            }
        } finally {
            this._suppressFxEmit = false;
        }
    },

    // Someone else's bullet hit MY hooked fish (same math as a local hit,
    // deduped by bullet id so overlap + claim can never double-apply).
    _applyFishHit(fh) {
        try {
            if (!this._fishHitApplied) this._fishHitApplied = {};
            if (this._fishHitApplied[fh.bid]) return;
            this._fishHitApplied[fh.bid] = Date.now();
            // Prune old ids
            const keys = Object.keys(this._fishHitApplied);
            if (keys.length > 200) {
                keys.slice(0, keys.length - 200).forEach(k => delete this._fishHitApplied[k]);
            }
            const st = this.state;
            const hooked = st && st.fishing && st.fishing.mode === 'HOOKED' ? st.fishing.hookedFish : null;
            if (!hooked || hooked.isDead) return;
            // Same roll as a local hit: crit x execute x boss-bane
            let dmg = Math.max(1, Math.round((fh.dmg || 0) * (fh.critMult || 1)));
            const crit = (fh.critMult || 1) > 1;
            if (fh.executeMult && hooked.maxHp > 0 && hooked.hp / hooked.maxHp < 0.35) dmg = Math.max(1, Math.round(dmg * fh.executeMult));
            if (fh.bossMult && hooked.species &&
                (hooked.species.isBoss || hooked.species.rarity === 'legendary' ||
                 hooked.species.rarity === 'mythic' || hooked.species.rarity === 'boss')) dmg = Math.max(1, Math.round(dmg * fh.bossMult));
            if (hooked.isInflated) dmg = Math.max(1, Math.round(dmg * 0.5));
            hooked.hp -= dmg;
            hooked.stamina -= dmg * ((typeof CONFIG !== 'undefined' && CONFIG.STAMINA_DRAIN_PER_BULLET) || 0.5) * (fh.drainMult || 1);
            if (fh.burn) { hooked.burnTimer = Math.max(hooked.burnTimer || 0, 3.0); hooked.burnDps = fh.burnDps || 12; }
            if (fh.poison) { hooked.poisonTimer = Math.max(hooked.poisonTimer || 0, 5.0); hooked.poisonDps = Math.round(dmg * (fh.poisonDpsMult || 0.3)); }
            if (fh.freeze) { hooked.freezeTimer = Math.max(hooked.freezeTimer || 0, fh.freezeTime || 2.5); }
            if (fh.stun) { hooked.stunTimer = Math.max(hooked.stunTimer || 0, fh.stunTime || 1.5); }
            if (fh.slowHook) { hooked.slowTimer = Math.max(hooked.slowTimer || 0, 3.0); hooked.slowMult = fh.slowHook; }
            if (fh.explosive) {
                hooked.hp -= dmg * 0.15;
                hooked.stamina -= dmg * 0.15 * ((typeof CONFIG !== 'undefined' && CONFIG.STAMINA_DRAIN_PER_BULLET) || 0.5);
                Particles.spawnParticles(st, hooked.x, hooked.y, '#f97316', 6, { size: 5 });
            }
            try { audio.playHit(); } catch (e) {}
            Particles.spawnWaterSplashes(st, hooked.x, hooked.y, 5);
            try {
                Particles.showFloatingText(st, (crit ? 'CRIT -' : '-') + Math.round(dmg),
                    hooked.x + (Math.random() - 0.5) * 40, hooked.y - 20 + (Math.random() - 0.5) * 20,
                    crit ? '#fde047' : '#38bdf8');
            } catch (e) {}
            if (hooked.hp <= 0) {
                hooked.hp = 0;
                if (typeof Fishing !== 'undefined') Fishing.killHookedFish(st);
            }
        } catch (e) {}
    },
    
    // ---- PeerJS transport (v1.2.0+): online P2P via the PeerJS cloud ----
    // Room identity: PeerLink claims `prefix+code` (see js/peerlink.js).
    // Same-version gate is enforced twice: the peer id itself embeds the
    // version digits, and the hello handshake carries an explicit version.
    _wirePeerLink() {
        if (this._peerWired || typeof PeerLink === 'undefined') return;
        this._peerWired = true;
        PeerLink.onMessage = (msg, fromId) => this.handlePeerMessage(msg, fromId);
        PeerLink.onMemberJoin = (peerId) => {
            this.remoteClientId = this.remoteClientId || peerId;
            this._lobbyCount = PeerLink.memberCount();
            this.onPlayerJoined(peerId);
            // New member needs the world NOW (targeted reply, not the
            // next broadcast tick): unicast a full snapshot so the
            // newcomer sees the host on the very first packet.
            try {
                if (this.isHost && this.isConnected) this.sendStateTo(peerId);
            } catch (e) {}
        };
        PeerLink.onMemberLeave = (peerId) => {
            try { this.mpLog('member-left', `${this.shortId(peerId)} left`); } catch (e) {}
            if (this.hostPeers) delete this.hostPeers[peerId];
            if (this.hostPeerOrder) this.hostPeerOrder = this.hostPeerOrder.filter(id => id !== peerId);
            if (this.state) {
                if (this.state.remotePlayers) delete this.state.remotePlayers[peerId];
                if (this.state.remotePlayer && this.state.remotePlayer._pid === peerId) this.state.remotePlayer = null;
            }
            if (peerId === this.remoteClientId) this.remoteClientId = null;
            this._lobbyCount = PeerLink.memberCount();
            this.onPlayerLeft(peerId);
        };
        PeerLink.onHostLeft = () => {
            this.updateStatus('Host left the game');
            try { this.mpLog('host-left', 'host connection closed'); } catch (e) {}
            this.cleanup();
            try { if (this.onHostLeftCb) this.onHostLeftCb(); } catch (e) {}
        };
        try {
            if (typeof PeerSkins !== 'undefined') {
                PeerSkins.onProgress = () => {
                    try {
                        if (typeof MultiplayerUI !== 'undefined' && MultiplayerUI.updateHUD) MultiplayerUI.updateHUD();
                    } catch (e) {}
                };
            }
        } catch (e) {}
    },

    // Create a new room (host)
    async createRoom() {
        try {
            this._wirePeerLink();
            this.updateStatus('Claiming room on PeerJS cloud...');
            const code = await PeerLink.hostRoom();
            this.isHost = true;
            this.roomCode = code;
            this.localClientId = PeerLink.myId;
            // Freeze THIS tab's pilot name for the room roster: other tabs
            // on the same origin share localStorage, so the live read must
            // never come from there (see TAB_NAME_KEY).
            try { this._hostPilot = this.playerName() || 'Host'; } catch (e) { this._hostPilot = 'Host'; }
            // The host's own expedition file stays GLOBAL (unscoped) — the
            // host IS the server. Clients scope per hostPid (see joinRoom).
            try {
                this.hostPid = this.localPid() || null;
                if (typeof SaveSystem !== 'undefined') SaveSystem.setMPScope(null);
            } catch (e) {}
            this._lobbyCount = 1;
            this.hostPeers = {};
            this.hostPeerOrder = [];
            this.isConnected = true;
            this.updateStatus(`Room created: ${code} (Share this code)`);
            this.mpLog('info', `hosting room ${code} as ${this.shortId(this.localClientId)}`);
            return code;
        } catch (e) {
            this.updateStatus(`Failed to create room: ${e.message}`);
            this.mpLog('send-fail', `create room failed: ${e.message}`);
            this.onError(e.message);
            throw e;
        }
    },

    // Join an existing room (client)
    async joinRoom(roomCode) {
        try {
            this._wirePeerLink();
            const code = String(roomCode || '').toUpperCase().trim();
            if (!code || code.length !== 4) throw new Error('Enter the 4-character room code.');
            this.updateStatus('Connecting to host via PeerJS cloud...');
            const welcome = await PeerLink.joinRoom(code);
            this.isHost = false;
            this.roomCode = code;
            this.localClientId = PeerLink.myId;
            this.remoteClientId = 'host';
            this._lobbyCount = (welcome && welcome.count) || 2;
            if (welcome) {
                if (Array.isArray(welcome.roster)) this._roomRoster = welcome.roster;
                if (welcome.hostName) this._hostName = welcome.hostName;
                // Server identity for per-host character scoping: a
                // DIFFERENT host's room loads a DIFFERENT character file,
                // never the previous server's inventory.
                this.hostPid = (welcome.hostPid && String(welcome.hostPid)) || ('room:' + code);
            } else {
                this.hostPid = 'room:' + code;
            }
            this.isConnected = true;
            this.updateStatus(`Joined room: ${code}`);
            this.mpLog('info', `joined room ${code} as ${this.shortId(this.localClientId)} (server ${this.shortId(this.hostPid)})`);
        } catch (e) {
            this.updateStatus(`Failed to join: ${e.message}`);
            const m = String((e && e.message) || '');
            const code = /Name taken/i.test(m) ? 'name-taken'
                : /full/i.test(m) ? 'room-full'
                : /Version mismatch/i.test(m) ? 'version-mismatch'
                : /P2P channel blocked/i.test(m) ? 'p2p-blocked'
                : /not found/i.test(m) ? 'peer-unavailable' : 'join-reject';
            this.mpLog(code, m.slice(0, 160));
            this.onError(e.message);
            throw e;
        }
    },

    // Loading-screen helper: true once the first host snapshot landed.
    hasEverSynced() {
        return !!this._hasEverSynced;
    },

    // Sync counters: prove the host->client direction is alive.
    // Host: sent snapshots. Client: received snapshots + age of the last.
    mpStats() {
        try {
            const last = this._lastSyncAt || 0;
            return {
                sent: this._sentStates || 0,
                recv: this._recvStates || 0,
                lastSyncAgo: last ? Math.round((Date.now() - last) / 1000) : -1,
            };
        } catch (e) { return { sent: 0, recv: 0, lastSyncAgo: -1 }; }
    },

    // True when the host link has gone quiet mid-game (client only).
    // Callers freeze INCOMING danger (not the client's own actions) so a
    // tabbed-out host can't kill you with frozen bullets/enemies.
    syncStale() {
        try {
            if (!this.isClient() || !this.isConnected || !this._hasEverSynced) return false;
            return (Date.now() - (this._lastSyncAt || 0)) > 8000;
        } catch (e) { return false; }
    },

    // Single entry point for every PeerLink message.
    // NOTE (v1.2.3 fix): game-protocol sends use `{type: ...}` while
    // peerlink-internal ones use `{t: ...}` — accept BOTH here, otherwise
    // every gameState/input/start message is silently dropped and clients
    // never enter the game.
    handlePeerMessage(msg, fromId) {
        if (!msg) return;
        const kind = (typeof msg.t === 'string') ? msg.t
            : (typeof msg.type === 'string') ? msg.type : null;
        if (!kind) return;
        switch (kind) {
            case 'lobby': {
                const was = this._lobbyCount || 1;
                if (msg.count) this._lobbyCount = msg.count;
                if (Array.isArray(msg.roster)) this._roomRoster = msg.roster;
                if (msg.hostName) this._hostName = msg.hostName;
                if (!this.isHost) {
                    if ((this._lobbyCount || 1) > was) this.onPlayerJoined();
                    else if ((this._lobbyCount || 1) < was) this.onPlayerLeft();
                    else if (typeof MultiplayerUI !== 'undefined' && MultiplayerUI.refreshRoster) {
                        try { MultiplayerUI.refreshRoster(); } catch (e) {}
                    }
                }
                break;
            }
            case 'gameState':
                this.handleGameState(msg.state);
                break;
            case 'playerInput':
                this.handlePlayerInput(fromId, msg.input);
                break;
            case 'lootDelete':
                if (this.isHost) this.handleLootDelete(fromId, msg.lootId);
                break;
            case 'beachClaim':
                if (this.isHost) this.handleBeachClaim(fromId, msg.fish);
                break;
            case 'syncRequest':
                // Targeted reply (not broadcast): the requester alone gets
                // a fresh snapshot — the classic host->client async answer.
                if (this.isHost) this.sendStateTo(fromId);
                break;
            case 'gameStart':
                if (!this.isHost && this.onGameStart) this.onGameStart();
                break;
            case 'gameStartAck':
                if (this.isHost && this._startAckResolve) this._startAckResolve();
                break;
            case 'announce':
                // Same text/colors for everyone: relay, then show locally.
                if (this.isHost) PeerLink.relay(msg, fromId);
                try {
                    if (typeof PeerAnnounce !== 'undefined' && this.state) PeerAnnounce.apply(msg, this.state);
                } catch (e) {}
                break;
            case 'skin-manifest':
                if (this.isHost) PeerLink.relay(msg, fromId);
                try {
                    if (typeof PeerSkins !== 'undefined') PeerSkins.onManifest(msg);
                } catch (e) {}
                break;
            case 'skin-request':
                // Directed at one owner: forward, or answer when it's us.
                if (this.isHost && msg.to && msg.to !== this.localClientId) {
                    PeerLink.relay(msg, fromId);
                } else {
                    try {
                        if (typeof PeerSkins !== 'undefined') PeerSkins.onRequest(msg);
                    } catch (e) {}
                }
                break;
            case 'skin-chunk':
                if (this.isHost && msg.to && msg.to !== this.localClientId) {
                    PeerLink.relay(msg, fromId); // passing through
                } else {
                    try {
                        if (typeof PeerSkins !== 'undefined') PeerSkins.onChunk(msg);
                    } catch (e) {}
                    // Live pushes (no target) fan out to the rest of the room.
                    if (this.isHost && !msg.to) PeerLink.relay(msg, fromId);
                }
                break;
        }
    },
    

    
    // Send local game state to peer (host -> client) over reliable
    // PeerJS broadcast (star topology, ~12Hz).
    sendLocalState() {
        // Bufferbloat guard (HaxBall #4): while the path is down, tick at
        // ~2.5Hz instead of 12Hz so we stop piling a dead channel.
        try {
            if (this._bcastSkipUntil && Date.now() < this._bcastSkipUntil) return;
        } catch (e) {}
        let gameState = this._buildGameState();
        if (!gameState) return;
        gameState = this._wireSafe(gameState);
        if (!gameState) return;
        // One reliable PeerJS broadcast reaches every member (star topology).
        let reached = 0;
        try {
            if (typeof PeerLink !== 'undefined') reached = PeerLink.broadcast({ type: 'gameState', state: gameState }) || 0;
        } catch (e) { reached = 0; }
        if (!reached) {
            // Audible instead of silent: broadcast hitting 0 members means
            // every host->client send is failing (conns closed/not open).
            try { this.mpLog('send-fail', 'broadcast reached 0 members — host→client path down?'); } catch (e) {}
            try { this._bcastSkipUntil = Date.now() + 400; } catch (e) {}
        } else {
            try { this._bcastSkipUntil = 0; } catch (e) {}
        }

        this.lastSentState = Date.now();
        this._sentStates = (this._sentStates || 0) + 1;
    },

    // Wire-safe serialize: JSON round-trip drops undefined/functions and
    // maps Infinity->null. PeerJS BinaryPack chokes on some of those and
    // throws INSIDE conn.send — the deterministic "send threw with conn
    // open" failure. Falls back to a minimal snapshot (host body + clock)
    // so the client at least SEES the host even when the full shape dies.
    _wireSafe(gameState) {
        try {
            return JSON.parse(JSON.stringify(gameState));
        } catch (e) {
            try { this.mpLog('send-fail', 'snapshot not JSON-safe — downgraded to minimal'); } catch (ee) {}
            return this._minimalState();
        }
    },

    // Smallest useful snapshot: host body + shared clock. ~1KB, proves
    // the channel itself when the full snapshot won't go through.
    _minimalState() {
        try {
            if (!this.state || !this.state.player) return null;
            const p = this.state.player;
            return {
                players: [this._packPlayer(p, this.localClientId || 'host', this.playerName() || 'Host', this.state.fishing)],
                world: this._packWorld(),
                timestamp: Date.now(),
                minimal: true,
            };
        } catch (e) { return null; }
    },

    // Shared clock block (broadcast + minimal use the same shape).
    _packWorld() {
        try {
            const w = this.state.world;
            if (!w) return null;
            return {
                hour: Math.round((w.hour || 9) * 100) / 100,
                day: w.day || 1,
                weather: w.weather || 'clear',
                weatherT: Math.round(w.weatherT || 90)
            };
        } catch (e) { return null; }
    },

    // Targeted reply: full snapshot to ONE newcomer (unicast). Called the
    // moment a member joins (or asks via syncRequest), so a client sees
    // the host on the very first packet instead of waiting for the next
    // broadcast tick.
    sendStateTo(peerId) {
        peerId = this._normPid(peerId, 'sendStateTo');
        if (!peerId || !this.isHost) return false;
        let gameState = this._buildGameState();
        if (!gameState) return false;
        gameState = this._wireSafe(gameState);
        if (!gameState) return false;
        const wasMinimal = !!gameState.minimal;
        let detail = '';
        try {
            const c = (typeof PeerLink !== 'undefined' && PeerLink.conns) ? PeerLink.conns[peerId] : null;
            if (!c) detail = 'no conn entry (peer gone?)';
            else if (!c.open) {
                detail = 'conn not open yet — queued for open';
                // The hello arrived before 'open' fired: flush the moment
                // the channel is ready instead of dropping the snapshot.
                try { c.once('open', () => { try { this.sendStateTo(peerId); } catch (e) {} }); } catch (e) {}
                try { this.mpLog('send-fail', `unicast to ${this.shortId(peerId)}: ${detail}`); } catch (e) {}
                return false;
            }
        } catch (e) {}
        let ok = false;
        try {
            if (typeof PeerLink !== 'undefined') ok = !!PeerLink.sendTo(peerId, { type: 'gameState', state: gameState });
        } catch (e) { ok = false; }
        if (!ok) {
            // Real reason, not a guess: PeerLink records the throw text.
            try {
                if (typeof PeerLink !== 'undefined' && PeerLink.lastSendError) {
                    const le = PeerLink.lastSendError();
                    if (le) detail = le;
                }
            } catch (e) {}
            if (!detail) {
                try {
                    const c2 = (typeof PeerLink !== 'undefined' && PeerLink.conns) ? PeerLink.conns[peerId] : null;
                    detail = !c2 ? 'no conn entry' : (!c2.open ? 'conn not open' : 'send threw (no detail)');
                } catch (e) { detail = 'send failed'; }
            }
            // Shape-vs-channel test: if the FULL snapshot won't go, ONE
            // minimal retry tells us whether the channel itself is alive.
            if (!wasMinimal) {
                try {
                    const m = this._minimalState();
                    if (m && typeof PeerLink !== 'undefined' && PeerLink.sendTo(peerId, { type: 'gameState', state: m })) {
                        try { this.mpLog('send-fail', `full snapshot rejected (${detail}) — MINIMAL delivered, channel alive`); } catch (e) {}
                        this._sentStates = (this._sentStates || 0) + 1;
                        return true;
                    }
                } catch (e) {}
            }
            try { this.mpLog('send-fail', `unicast snapshot to ${this.shortId(peerId)} failed: ${detail}`); } catch (e) {}
        } else {
            this._sentStates = (this._sentStates || 0) + 1;
        }
        return ok;
    },

    // Snapshot builder shared by broadcast + unicast (null while the sim
    // is not ready yet — e.g. host still sitting in the menu).
    _buildGameState() {
        if (!this.state || !this.state.player || !this.state.fishing) return null;
        const p = this.state.player;
        const f = this.state.fishing;
        const R1 = (v) => Math.round((v || 0) * 10) / 10;
        const RI = (v) => Math.round(v || 0);

        // Drop peers silent for >30s (left without a clean leaveRoom).
        // Live peers send input at ~15Hz, so this only kills real ghosts.
        // Skipped while THIS tab is hidden: a background host can't judge
        // liveness (its timers are throttled) — pruning resumes on return.
        // (30s, not 12s: hidden-tab heartbeats can legally gap that long.)
        try {
            let hidden = false;
            try { hidden = !!(typeof document !== 'undefined' && document.hidden); } catch (e) {}
            if (!hidden) {
            const now = Date.now();
            for (const pid of Object.keys(this.hostPeers || {})) {
                const rp = this.hostPeers[pid];
                if (!rp || !rp._lastUpdate || now - rp._lastUpdate > 30000) {
                    delete this.hostPeers[pid];
                    if (Array.isArray(this.hostPeerOrder)) {
                        this.hostPeerOrder = this.hostPeerOrder.filter(id => id !== pid);
                    }
                    if (this.state && this.state.remotePlayers) delete this.state.remotePlayers[pid];
                }
            }
            }
        } catch (e) {}
        // Lobby snapshots: host + every known peer (clients render all)
        try {
            if (this.state && this.state.mouse) {
                p.aim = Math.atan2(this.state.mouse.worldY - p.y, this.state.mouse.worldX - p.x);
            }
        } catch (e) {}
        const players = [this._packPlayer(p, this.localClientId || 'host', this.playerName() || 'Host', this.state.fishing)];
        for (const [pid, rp] of Object.entries(this.hostPeers || {})) {
            if (rp && typeof rp.x === 'number') players.push(this._packPlayer(rp, pid, rp.label || 'Player ?'));
        }
        // Pending kill-credit awards for clients (cleared on ack)
        const awards = {};
        for (const [pid, a] of Object.entries(this._pendingAwards || {})) {
            if (a && (a.coins > 0 || a.xp > 0)) awards[pid] = a;
        }

        // Only send essential state for synchronization (quantized).
        // NOTE: wallets/inventories are PERSONAL — each player owns their
        // own file. Only the shared world (below) is broadcast.
        const gameState = {
            players,
            awards,
            // Host player state (authoritative)
            player: {
                x: RI(p.x),
                y: RI(p.y),
                hp: RI(p.hp),
                maxHp: RI(p.maxHp),
                facing: p.facing,
                activeSlot: p.activeSlot,
                weaponRecoil: p.weaponRecoil,
                muzzleFlash: p.muzzleFlash,
                reloading: p.reloading,
                coins: p.coins,
                bucket: p.bucket.map(b => ({ id: b.id, name: b.name, value: b.value, rarity: b.rarity, color: b.color })),
                level: p.level,
                xp: p.xp,
                equippedWeapons: p.equippedWeapons,
                weaponAmmo: p.weaponAmmo,
                equippedRod: p.equippedRod ? { id: p.equippedRod.id, tensionMax: p.equippedRod.tensionMax, reelPower: p.equippedRod.reelPower, luck: p.equippedRod.luck } : null,
                stunTimer: p.stunTimer,
                slowTimer: p.slowTimer,
                burnTimer: p.burnTimer
            },
            // Fishing state
            fishing: {
                mode: f.mode,
                castPower: f.castPower,
                castDir: f.castDir,
                bobber: { x: RI(f.bobber.x), y: RI(f.bobber.y) },
                lineTension: R1(f.lineTension),
                hookedFish: f.hookedFish ? {
                    // Slim species: render-only fields (full base objects
                    // with desc/skills balloon the snapshot past what a
                    // DataChannel reliably delivers — that silent drop is
                    // exactly "client never sees host").
                    species: this._slimSpecies(f.hookedFish.species),
                    x: RI(f.hookedFish.x),
                    y: RI(f.hookedFish.y),
                    hp: RI(f.hookedFish.hp),
                    maxHp: RI(f.hookedFish.maxHp),
                    stamina: R1(f.hookedFish.stamina),
                    staminaMax: R1(f.hookedFish.staminaMax),
                    dragState: f.hookedFish.dragState,
                    rotation: R1(f.hookedFish.rotation),
                    isDead: f.hookedFish.isDead
                } : null,
                biteTimer: RI(f.biteTimer),
                waitingTime: RI(f.waitingTime)
            },
            // World state
            monstersOnLand: this.state.monstersOnLand.map(m => ({
                id: m.id,
                species: this._slimSpecies(this._instanceSpecies(m.species) || m.species),
                x: RI(m.x),
                y: RI(m.y),
                hp: RI(m.hp),
                maxHp: RI(m.maxHp),
                aiState: m.aiState,
                isCharging: m.isCharging,
                phase: m.phase,
                isEnraged: m.isEnraged
            })),
            bullets: this.state.bullets.filter(b => b.owner === 'player').slice(-80).map(b => ({
                id: b.id,
                pid: b.pid || null,
                x: RI(b.x),
                y: RI(b.y),
                vx: RI(b.vx),
                vy: RI(b.vy),
                damage: b.damage,
                type: b.type,
                pierce: b.pierce,
                explosive: b.explosive,
                burn: b.burn
            })),
            // Host monster skill shots (clients take hits, never simulate)
            enemyBullets: this.state.bullets.filter(b => b.owner !== 'player').slice(-30).map(b => ({
                id: b.id,
                x: RI(b.x),
                y: RI(b.y),
                vx: RI(b.vx),
                vy: RI(b.vy),
                damage: b.damage,
                color: b.color,
                radius: b.radius,
                life: R1(b.life)
            })),
            groundLoot: this.state.groundLoot.map(l => {
                if (!l) return l;
                // Summon key/trophy items ride as data (species-less).
                if (l.item) return { id: l.id, item: l.item, x: RI(l.x), y: RI(l.y) };
                if (!l.species) return { id: l.id, x: RI(l.x), y: RI(l.y) };
                return {
                    id: l.id,
                    species: this._slimSpecies(l.species),
                    x: RI(l.x),
                    y: RI(l.y)
                };
            }),
            groundHazards: this.state.groundHazards.map(h => ({
                x: RI(h.x),
                y: RI(h.y),
                radius: RI(h.radius),
                duration: R1(h.duration),
                type: h.type,
                damagePerSec: h.damagePerSec,
                color: h.color
            })),
            delayedBlasts: this.state.delayedBlasts.map(b => ({
                x: RI(b.x),
                y: RI(b.y),
                radius: RI(b.radius),
                damage: b.damage,
                timer: R1(b.timer),
                color: b.color,
                leaveHazard: b.leaveHazard,
                hazardType: b.hazardType
            })),
            // Open-world enemies (host spawns; clients render + touch, host kills).
            // Jumping fish carry their instance overlays (see _instanceSpecies).
            enemies: (this.state.enemies || []).slice(0, 24).map(e => ({
                enemyType: e.enemyType,
                speciesId: e.species ? e.species.id : null,
                inst: (e.enemyType === 'jumpingFish' && e.species) ? {
                    id: e.species.id, name: e.species.name, color: e.species.color,
                    size: e.species.size, shiny: !!e.species.shiny,
                    pattern: e.species.pattern || null, mutation: e.species.mutation || null
                } : null,
                x: RI(e.x),
                y: RI(e.y),
                vx: RI(e.vx),
                vy: RI(e.vy),
                hp: RI(e.hp),
                maxHp: RI(e.maxHp),
                damage: e.damage,
                hitFlash: e.hitFlash || 0,
                isBoss: !!e.isBoss,
                bossName: e.bossName || null,
                enraged: !!e.enraged,
                state: e.state || null,
                leapH: e.leapH || 0,
                jumpT: e.jumpT || 0,
                jumpDur: e.jumpDur || 0
            })),
            // Enemy skill shots (host simulates; clients take the hits)
            projectiles: (this.state.projectiles || []).slice(0, 40).map(b => ({
                id: b.id,
                // ownerPid: who caught the fish that fired it (viewers home
                // the shot toward the CATCHER, never toward themselves).
                owner: b.ownerPid || null,
                remote: !!b.remote,
                x: RI(b.x),
                y: RI(b.y),
                vx: RI(b.vx),
                vy: RI(b.vy),
                damage: b.damage,
                color: b.color,
                radius: b.radius,
                life: R1(b.life),
                isHoming: !!b.isHoming,
                homingForce: b.homingForce || 0,
                isSpiral: !!b.isSpiral,
                spiralRadius: b.spiralRadius || 0,
                catcherOnly: !!b.catcherOnly
            })),
            waterBoundaryX: this.state.waterBoundaryX,
            time: R1(this.state.time),
            // Shared sky: hour/day/weather ride along so every peer fishes
            // the same conditions (personal Settings visuals stay local).
            world: this._packWorld(),
            // Portal state: unlock is SHARED (one room, one seal), the cave
            // itself runs as a personal instance per peer (see same-map
            // gate in applyRemoteState).
            cave: { unlocked: !!(this.state.player && this.state.player.caveUnlocked) },
            screenShake: RI(this.state.screenShake),
            activeBoss: this.state.activeBoss ? {
                id: this.state.activeBoss.id,
                species: this._slimSpecies(this.state.activeBoss.species),
                x: RI(this.state.activeBoss.x),
                y: RI(this.state.activeBoss.y),
                hp: RI(this.state.activeBoss.hp),
                maxHp: RI(this.state.activeBoss.maxHp),
                phase: this.state.activeBoss.phase
            } : null,
            timestamp: Date.now(),
            fx: this._drainFx(),
            fishHits: (() => {
                const out = [];
                for (const arr of Object.values(this._fishHitOutbox || {})) {
                    for (const fh of arr) {
                        if (out.length >= 20) break;
                        out.push(fh);
                    }
                }
                this._fishHitOutbox = {};
                return out;
            })()
        };

        return gameState;
    },

    // Client -> host ack that it entered the game
    sendGameStartAck() {
        try {
            if (typeof PeerLink !== 'undefined') PeerLink.sendToHost({ type: 'gameStartAck' });
        } catch (e) {}
    },

    // Client -> host full-state request
    sendSyncRequest() {
        try {
            if (typeof PeerLink !== 'undefined') PeerLink.sendToHost({ type: 'syncRequest' });
        } catch (e) {}
    },
    
    // Handle incoming game state (client receives from host)
    handleGameState(remoteState) {
        if (this.isHost) return; // Host doesn't receive state
        if (!remoteState) return;

        // Drop stale duplicates (dual DC+relay delivery in 3-4p rooms)
        const ts = remoteState.timestamp || 0;
        if (ts && ts <= (this._lastGameStateTs || 0)) return;
        this._lastGameStateTs = ts;

        this.remotePlayerState = remoteState;

        // First-snapshot flag: the client's loading screen waits for
        // THIS (not a fixed timer) before revealing the world.
        if (!this._hasEverSynced) {
            try { this.mpLog('sync-ok', `first host snapshot (${this.shortId(this.remoteClientId)})`); } catch (e) {}
        }
        this._hasEverSynced = true;
        this._lastSyncAt = Date.now();
        this._recvStates = (this._recvStates || 0) + 1;

        // Apply remote state to local game (interpolation would be better but this works for LAN)
        this.applyRemoteState(remoteState);
    },

    // Apply remote state to local game
    applyRemoteState(remoteState) {
        // Lobby roster: everyone the host knows about, minus self
        if (!this.state.remotePlayers) this.state.remotePlayers = {};
        if (Array.isArray(remoteState.players)) {
            const seen = {};
            for (const pl of remoteState.players) {
                if (!pl) continue;
                const pid = this._normPid(pl.id, 'gameState.player');
                if (!pid) continue; // logged — never render unknowns
                if (pid === this.localClientId) continue;
                seen[pid] = true;
                const cur = this.state.remotePlayers[pid] || {};
                const firstSeen = !cur._seen;
                Object.assign(cur, pl, { id: pid, _pid: pid, _seen: true });
                if (firstSeen || typeof cur.rx !== 'number') {
                    cur.rx = pl.x; cur.ry = pl.y;
                    cur._lastFxMode = cur.fishing && cur.fishing.mode;
                    cur._hx = cur.fishing && cur.fishing.hooked ? cur.fishing.hooked.x : null;
                    cur._hy = cur.fishing && cur.fishing.hooked ? cur.fishing.hooked.y : null;
                    cur._bx = cur.fishing && cur.fishing.bobber ? cur.fishing.bobber.x : null;
                    cur._by = cur.fishing && cur.fishing.bobber ? cur.fishing.bobber.y : null;
                }
                this.state.remotePlayers[pl.id] = cur;
            }
            for (const id of Object.keys(this.state.remotePlayers)) {
                if (!seen[id]) delete this.state.remotePlayers[id];
            }
            const first = Object.values(this.state.remotePlayers)[0] || null;
            this.state.remotePlayer = first; // legacy single view
        } else {
            // Legacy host payload without roster
            this.state.remotePlayer = remoteState.player;
        }
        
        // For non-host, we don't override local player but we sync world state.
        // Progression stays PERSONAL — only kill-credit awards apply here.
        if (!this.isHost) {
            // Shared sky: adopt the host's clock so weather/time (and the
            // fish conditions driven by them) match everywhere. Personal
            // render Settings (day/night FX etc.) stay local by design.
            if (remoteState.world) {
                try {
                    if (typeof WorldSystem !== 'undefined') WorldSystem.ensure(this.state);
                    const w = this.state.world;
                    if (w && remoteState.world) {
                        const oldWeather = w.weather;
                        if (typeof remoteState.world.hour === 'number') w.hour = remoteState.world.hour;
                        if (typeof remoteState.world.day === 'number') w.day = remoteState.world.day;
                        if (typeof remoteState.world.weather === 'string') w.weather = remoteState.world.weather;
                        if (typeof remoteState.world.weatherT === 'number') w.weatherT = remoteState.world.weatherT;
                        // Same announcement the host saw when it rolled in.
                        if (w.weather !== oldWeather && typeof WorldSystem.weatherTip === 'function') {
                            try {
                                if (typeof Particles !== 'undefined') {
                                    Particles.showFloatingText(this.state,
                                        `${WorldSystem.weatherIcon(w.weather)} ${WorldSystem.weatherName(w.weather)} rolls in — fish moods shift!`,
                                        this.state.player.x, this.state.player.y - 60, '#7dd3fc');
                                }
                                if (typeof UI !== 'undefined') {
                                    UI.updateStatusBanner(`Weather: <b>${WorldSystem.weatherName(w.weather)}</b> — ${WorldSystem.weatherTip(w.weather)}`, 'Weather', 'sky');
                                }
                                if (w.weather === 'storm' && typeof audio !== 'undefined' && audio.playThunder) {
                                    try { audio.playThunder(); } catch (e2) {}
                                }
                            } catch (e2) {}
                        }
                    }
                } catch (e) {}
            }

            // Kill-credit awards from the host (acked, applied once)
            if (remoteState.awards && remoteState.awards[this.localClientId]) {
                const a = remoteState.awards[this.localClientId];
                if (!this._appliedAwards) this._appliedAwards = {};
                if (a && a.aid && !this._appliedAwards[a.aid]) {
                    this._appliedAwards[a.aid] = true;
                    this._awardAckPending = a.aid;
                    const p = this.state.player;
                    if (a.coins) {
                        p.coins += a.coins;
                        if (typeof Particles !== 'undefined') Particles.showFloatingText(this.state, `+${a.coins}c bounty!`, p.x, p.y - 50, '#facc15');
                    }
                    if (a.xp && typeof Player !== 'undefined') {
                        try { Player.addXP(this.state, a.xp); } catch (e) {}
                    }
                    if (typeof Player !== 'undefined') {
                        try { Player.refreshHUD(this.state); } catch (e) {}
                    }
                    if (typeof AntiCheat !== 'undefined') {
                        try { AntiCheat.markLegit(); } catch (e) {}
                    }
                }
            }

            // Portal seal: adopt the room's unlock (never revoke mine).
            if (remoteState.cave && remoteState.cave.unlocked && this.state.player && !this.state.player.caveUnlocked) {
                this.state.player.caveUnlocked = true;
            }

            // Same-map gate: the host sim and I must be on the SAME map
            // slice (mainland / same isle / cave) for world sync. Otherwise
            // mainland coords would overwrite my cave/isle bodies, loot and
            // shots every snapshot. Roster + clock + fx always apply.
            let sameMap = true;
            try {
                const hostEntry = Array.isArray(remoteState.players) ? remoteState.players[0] : null;
                const me = this.state.player || {};
                const myIsle = me.onIsland || null, myCave = !!me.inCave;
                const hIsle = (hostEntry && hostEntry.onIsland) || null;
                const hCave = !!(hostEntry && hostEntry.inCave);
                sameMap = (myIsle === hIsle) && (myCave === hCave);
            } catch (e) { sameMap = true; }

            // Sync monsters
            if (sameMap && remoteState.monstersOnLand) {
                this.syncMonsters(remoteState.monstersOnLand);
            }

            // Sync open-world enemies (host spawns them)
            if (sameMap && remoteState.enemies) {
                this.syncEnemies(remoteState.enemies);
            }

            // Sync enemy skill shots (host simulates them)
            if (sameMap && remoteState.projectiles) {
                this.syncProjectiles(remoteState.projectiles);
            }
            
            // Sync bullets
            if (sameMap && remoteState.bullets) {
                this.syncBullets(remoteState.bullets);
            }

            // Sync host monster skill shots
            if (sameMap && remoteState.enemyBullets) {
                this.syncEnemyBullets(remoteState.enemyBullets);
            }
            
            // Sync loot
            if (sameMap && remoteState.groundLoot) {
                this.syncLoot(remoteState.groundLoot);
            }
            
            // Sync hazards
            if (sameMap && remoteState.groundHazards) {
                this.syncHazards(remoteState.groundHazards);
            }
            
            // Sync delayed blasts
            if (sameMap && remoteState.delayedBlasts) {
                this.syncDelayedBlasts(remoteState.delayedBlasts);
            }

            // NOTE: never copy the host's own fishing rig into the client's
            // local fishing sim. The host rig is rendered via the players
            // roster above — copying it here overwrote the client's own
            // bobber/hooked fish and produced the ghost-line / snapped-line
            // bugs. The client's personal fishing sim stays authoritative.

            // Shared one-shot FX (splashes, blood, muzzle puffs, texts)
            if (remoteState.fx) {
                this._suppressFxEmit = true;
                try { this._applyFx(remoteState.fx); }
                finally { this._suppressFxEmit = false; }
            }

            // Helper hits on MY hooked fish (applied once per bullet id)
            if (Array.isArray(remoteState.fishHits)) {
                for (const fh of remoteState.fishHits) {
                    if (!fh || !fh.bid) continue;
                    const to = this._normPid(fh.to, 'snapshot.fishHit');
                    if (!to || to !== this.localClientId) continue;
                    this._applyFishHit(fh);
                }
            }
            
            // Sync boss
            if (sameMap && remoteState.activeBoss) {
                this.syncBoss(remoteState.activeBoss);
            }
            
            // Screen shake
            if (remoteState.screenShake > this.state.screenShake) {
                this.state.screenShake = remoteState.screenShake;
            }
        }
    },
    
    // Sync monsters from host — instance overlays (shiny/size/pattern/
    // mutation/name) survive so clients render the catcher's exact fish.
    syncMonsters(remoteMonsters) {
        // Simple sync - replace with interpolation for smoother results
        this.state.monstersOnLand = remoteMonsters.map(m => ({
            ...m,
            species: this._instanceSpecies(m.species) || m.species
        }));
    },
    
    // Sync bullets: keep enemy shots + our own local bullets, take the
    // host sim for everything else (skips our own echo by bullet id).
    // Host monster skill shots merge in as enemy bullets (hit once by id).
    syncBullets(remoteBullets) {
        if (!this._ownBulletIds) this._ownBulletIds = {};
        const now = Date.now();
        const mine = new Set(Object.keys(this._ownBulletIds));
        this.state.bullets = this.state.bullets.filter(b => {
            if (b.owner === 'enemy') return true;
            if (b.local) {
                if (b.id) {
                    mine.add(b.id);
                    this._ownBulletIds[b.id] = now + 4000;
                }
                return true;
            }
            return false;
        });
        // Expire old ids so the registry can't grow forever
        for (const id of Object.keys(this._ownBulletIds)) {
            if (this._ownBulletIds[id] < now) delete this._ownBulletIds[id];
        }
        remoteBullets.forEach(b => {
            if (b.id && mine.has(b.id)) return;
            this.state.bullets.push({ ...b, owner: 'player', hitSet: new Set() });
        });
    },

    // Merge host monster skill shots (called with snapshot.enemyBullets)
    syncEnemyBullets(remoteBullets) {
        if (!Array.isArray(remoteBullets)) return;
        const seen = new Set((this.state.bullets || []).filter(b => b.owner === 'enemy' && b.id).map(b => b.id));
        this.state.bullets = this.state.bullets.filter(b => b.owner !== 'enemy' || (b.id && seen.has(b.id) && remoteBullets.some(rb => rb.id === b.id)));
        // Drop local enemy-bullet entries the host no longer has, add new ones
        const remoteIds = new Set(remoteBullets.map(b => b.id).filter(Boolean));
        this.state.bullets = this.state.bullets.filter(b => b.owner !== 'enemy' || (b.id && remoteIds.has(b.id)));
        for (const b of remoteBullets) {
            if (b.id && seen.has(b.id)) continue;
            this.state.bullets.push({ ...b, owner: 'enemy', life: b.life || 2.5, radius: b.radius || 6, color: b.color || '#facc15', trail: [] });
        }
    },
    
    // Sync loot (ids preserved for first-come delete messages).
    // Summon-item loot has no species — pass it through untouched.
    // Fish loot keeps its instance overlays (see _instanceSpecies).
    syncLoot(remoteLoot) {
        this.state.groundLoot = (remoteLoot || []).map(l => {
            if (!l) return null;
            if (l.item) return { ...l };
            if (!l.species) return null; // malformed — never render-crash
            return { ...l, species: this._slimSpecies(this._instanceSpecies(l.species) || l.species) };
        }).filter(Boolean);
    },

    // Sync enemies from host (jumping fish keep instance overlays too).
    syncEnemies(remoteEnemies) {
        this.state.enemies = remoteEnemies.map(e => {
            const out = { ...e, hitFlash: e.hitFlash || 0, vx: e.vx || 0, vy: e.vy || 0, leapH: e.leapH || 0 };
            if (e.enemyType === 'jumpingFish' && (e.speciesId || e.inst)) {
                out.species = this._instanceSpecies(e.inst || { id: e.speciesId })
                    || { id: e.speciesId, name: 'Fish', color: '#38bdf8', size: 16 };
            }
            return out;
        });
    },

    // Sync enemy skill shots from host (host simulates them).
    // Client's own hooked-fish shots (local:true) are preserved, and the
    // host's relayed echo of those same shots (matched by owner+id) is
    // dropped so the catcher never renders duplicates of their own fire.
    syncProjectiles(remoteBullets) {
        const mine = (this.state.projectiles || []).filter(b => b.local);
        const myIds = new Set();
        try {
            const me = this.localClientId || null;
            for (const b of mine) {
                if (b && b.id !== undefined) myIds.add((me || '?') + ':' + b.id);
            }
        } catch (e) {}
        const me2 = (this.localClientId || null);
        const incoming = (remoteBullets || [])
            .filter(b => !(b && b.id !== undefined && b.owner === me2 && myIds.has(b.owner + ':' + b.id)));
        // Foreign skill shots materialize audibly: one soft zap per batch
        // (deduped by id — snapshots resend the same shots every 80ms).
        try {
            if (!this._heardProj) this._heardProj = {};
            let fresh = false;
            for (const b of incoming) {
                if (!b || b.id === undefined || b.local) continue;
                const k = (b.owner || '?') + ':' + b.id;
                if (!this._heardProj[k]) { this._heardProj[k] = 1; fresh = true; }
            }
            const hkeys = Object.keys(this._heardProj);
            if (hkeys.length > 300) hkeys.slice(0, hkeys.length - 300).forEach(k => delete this._heardProj[k]);
            if (fresh && typeof audio !== 'undefined' && audio.playSkillZap) {
                const nowS = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                if (!this._lastSkillSfx || nowS - this._lastSkillSfx > 600) {
                    this._lastSkillSfx = nowS;
                    audio.playSkillZap();
                }
            }
        } catch (e) {}
        this.state.projectiles = incoming.map(b => ({ ...b, trail: [] }));
        for (const b of mine) this.state.projectiles.push(b);
    },

    // Sync hazards. Relayed echoes of MY OWN forwarded skill zones
    // (matched by _mpid) are dropped — my local copies already run.
    syncHazards(remoteHazards) {
        try {
            const mine = new Set();
            for (const h of (this.state.groundHazards || [])) {
                if (h && h._mpid) mine.add(h._mpid);
            }
            const keepLocal = (this.state.groundHazards || []).filter(h => h && h._mpid);
            const fresh = (remoteHazards || []).filter(h => !(h && h.id && mine.has(h.id)));
            this.state.groundHazards = fresh.concat(keepLocal);
        } catch (e) {
            this.state.groundHazards = remoteHazards;
        }
    },
    
    // Sync delayed blasts (same echo rule as hazards).
    syncDelayedBlasts(remoteBlasts) {
        try {
            const mine = new Set();
            for (const b of (this.state.delayedBlasts || [])) {
                if (b && b._mpid) mine.add(b._mpid);
            }
            const keepLocal = (this.state.delayedBlasts || []).filter(b => b && b._mpid);
            const fresh = (remoteBlasts || []).filter(b => !(b && b.id && mine.has(b.id)));
            this.state.delayedBlasts = fresh.concat(keepLocal);
        } catch (e) {
            this.state.delayedBlasts = remoteBlasts;
        }
    },
    
    // Sync fishing
    syncFishing(remoteFishing) {
        Object.assign(this.state.fishing, remoteFishing);
        if (remoteFishing.hookedFish) {
            this.state.fishing.hookedFish.species = this.findSpecies(remoteFishing.hookedFish.species.id) || remoteFishing.hookedFish.species;
        }
    },
    
    // Sync boss
    syncBoss(remoteBoss) {
        if (!this.state.activeBoss) {
            this.state.activeBoss = remoteBoss;
        } else {
            Object.assign(this.state.activeBoss, remoteBoss);
        }
    },
    
    // Find species by ID
    findSpecies(id) {
        if (typeof FISH_SPECIES !== 'undefined') {
            return FISH_SPECIES.find(s => s.id === id);
        }
        return null;
    },
    
    // Send player input to host (client only) — throttled to ~15Hz.
    // Carries fresh bullets, fishing state and grant acks.
    sendInput(input) {
        if (this.isHost) return; // Host handles input locally

        const now = Date.now();
        if (now - (this._lastInputSent || 0) < 66) return;
        this._lastInputSent = now;

        input = input || {};
        // Self-identifying: the host files this under input._from, so a
        // stale/missing transport id can never create a 'peer' ghost copy
        // that trails the real player.
        try { input._from = this.localClientId || null; } catch (e) {}
        // Drain fired-bullet outbox (spawn events with ids)
        if (this._outboxBullets && this._outboxBullets.length) {
            input.bullets = this._outboxBullets;
            this._outboxBullets = [];
            if (!this._ownBulletIds) this._ownBulletIds = {};
            const exp = Date.now() + 4000;
            for (const b of input.bullets) if (b && b.id) this._ownBulletIds[b.id] = exp;
        }
        // Fishing snapshot for remote visibility
        try {
            const f = this.state.fishing;
            const rod = this.state.player.equippedRod;
            if (f && f.mode !== 'IDLE') {
                input.fishing = this._packPlayer(
                    { x: 0, y: 0, hp: 0, maxHp: 1, facing: 1, activeSlot: 0, equippedRod: rod },
                    'self', '', f.hookedFish ? {
                        mode: f.mode,
                        bobber: f.bobber,
                        lineTension: f.lineTension,
                        tensionMax: (rod && rod.tensionMax) || 100,
                        hookedFish: f.hookedFish
                    } : { mode: f.mode, bobber: f.bobber, castPower: f.castPower, lineTension: f.lineTension, tensionMax: (rod && rod.tensionMax) || 100 }
                ).fishing;
            } else if (f) {
                input.fishing = { mode: f.mode, bobber: null, hooked: null };
            }
        } catch (e) {}
        try {
            input.muzzleFlash = this.state.player.muzzleFlash || 0;
            input.weaponRecoil = this.state.player.weaponRecoil || 0;
            input.reloading = !!this.state.player.reloading;
            if (this.state.mouse) {
                input.aim = Math.atan2(this.state.mouse.worldY - this.state.player.y, this.state.mouse.worldX - this.state.player.x);
            }
        } catch (e) {}
        const fx = this._drainFx();
        if (fx.length) input.fx = fx;
        // Hits my bullets scored on ANOTHER player's hooked fish (the
        // catcher applies these — my screen only showed a visual splash).
        if (this._fishHitClaims && this._fishHitClaims.length) {
            input.fishHits = this._fishHitClaims.slice(0, 10);
            this._fishHitClaims = [];
        }
        // My hooked fish's skill side-effects (shots + zones) for the host
        // to merge and share with the room (see mirrorSkill).
        if (this._skillShotOutbox && this._skillShotOutbox.length) {
            input.skillShots = this._skillShotOutbox.slice(0, 12);
            this._skillShotOutbox = [];
        }
        if (this._skillZoneOutbox && this._skillZoneOutbox.length) {
            input.skillZones = this._skillZoneOutbox.slice(0, 12);
            this._skillZoneOutbox = [];
        }
        // Kill-credit award ack
        if (this._awardAckPending) {
            input.awardAck = this._awardAckPending;
            this._awardAckPending = null;
        }
        try {
            if (typeof PeerLink !== 'undefined') PeerLink.sendToHost({ type: 'playerInput', input });
        } catch (e) {}
    },

    // Queue a locally-fired bullet for the host sim (client only)
    queueBullet(bullet) {
        if (!this._outboxBullets) this._outboxBullets = [];
        this._outboxBullets.push(bullet);
        if (this._outboxBullets.length > 40) this._outboxBullets.splice(0, this._outboxBullets.length - 40);
    },

    // My hooked fish fired a skill: mirror its side-effects (projectile
    // spawns + hazard/blast zones) to the room so every peer sees the
    // SAME fight. Called with pre-handler array lengths (see triggerSkill).
    // Damage authority stays with the catcher — viewers render visual-only
    // copies that home toward the CATCHER, never toward themselves.
    mirrorSkill(state, beforeP, beforeH, beforeB) {
        try {
            if (!this.isClient() || !state) return;
            const me = this.localClientId || null;
            if (!me) return;
            const R1 = (v) => Math.round((v || 0) * 10) / 10;
            if (!this._skillShotOutbox) this._skillShotOutbox = [];
            if (!this._skillZoneOutbox) this._skillZoneOutbox = [];
            if (state.projectiles && beforeP >= 0) {
                for (let i = beforeP; i < state.projectiles.length && this._skillShotOutbox.length < 12; i++) {
                    const pr = state.projectiles[i];
                    if (!pr || pr.id === undefined) continue;
                    this._skillShotOutbox.push({
                        id: pr.id, x: R1(pr.x), y: R1(pr.y),
                        vx: R1(pr.vx), vy: R1(pr.vy),
                        damage: pr.damage || 0, color: pr.color || '#fff',
                        radius: pr.radius || 8, life: R1(pr.life || 3),
                        isHoming: !!pr.isHoming, homingForce: pr.homingForce || 0,
                        isSpiral: !!pr.isSpiral, spiralRadius: pr.spiralRadius || 0,
                        owner: me,
                    });
                }
            }
            const pushZone = (arr, from, kind) => {
                if (!arr || from < 0) return;
                for (let i = from; i < arr.length && this._skillZoneOutbox.length < 12; i++) {
                    const z = arr[i];
                    if (!z) continue;
                    if (!z._mpid) z._mpid = me + ':z' + (state._skillSeq = (state._skillSeq || 0) + 1);
                    const out = { zid: z._mpid, kind, owner: me,
                        x: R1(z.x), y: R1(z.y), radius: z.radius || 40,
                        color: z.color || '#fff' };
                    if (kind === 'hazard') {
                        out.duration = R1(z.duration || 3);
                        out.type = z.type || 'fire';
                        out.damagePerSec = z.damagePerSec || 8;
                    } else {
                        out.damage = z.damage || 10;
                        out.timer = R1(z.timer === undefined ? 0.6 : z.timer);
                        if (z.leaveHazard !== undefined) out.leaveHazard = !!z.leaveHazard;
                        if (z.hazardType !== undefined) out.hazardType = z.hazardType;
                        if (z.hazardDps !== undefined) out.hazardDps = z.hazardDps;
                        if (z.hazardDuration !== undefined) out.hazardDuration = z.hazardDuration;
                        if (z.shake !== undefined) out.shake = z.shake;
                    }
                    this._skillZoneOutbox.push(out);
                }
            };
            pushZone(state.groundHazards, beforeH, 'hazard');
            pushZone(state.delayedBlasts, beforeB, 'blast');
        } catch (e) {}
    },

    // My bullet visually overlapped ANOTHER player's hooked fish. The
    // catcher owns that fish, so the hit is claimed here and applied
    // there (once per bullet id — never double damage).
    queueFishHit(hit) {
        if (!hit || !hit.to || !hit.bid) return;
        if (this.isHost) {
            if (!this._fishHitOutbox) this._fishHitOutbox = {};
            const arr = this._fishHitOutbox[hit.to] || (this._fishHitOutbox[hit.to] = []);
            if (arr.length < 20) arr.push(hit);
            return;
        }
        if (!this._fishHitClaims) this._fishHitClaims = [];
        if (this._fishHitClaims.length < 10) this._fishHitClaims.push(hit);
    },
    
    // Handle player input (host receives from each client).
    // Positions every remote player so the host sees the whole lobby.
    handlePlayerInput(playerId, input) {
        if (!input) return;
        if (!this.hostPeers) this.hostPeers = {};
        if (!Array.isArray(this.hostPeerOrder)) this.hostPeerOrder = [];
        // Prefer the sender-stamped id (DC messages carry no envelope).
        // BOTH are validated: a stale/missing transport id or a junk
        // placeholder can never create a ghost copy that trails the player.
        let pid = this._normPid(input && input._from, 'input._from');
        if (!pid) pid = this._normPid(playerId, 'transport');
        if (!pid) return; // logged inside _normPid — drop the snapshot
        // Id-overwrite guard: the host's own id can never be a client —
        // a forged or echoed snapshot must not file over the host entry
        // and make the host "become" a client.
        if (pid === this.localClientId) return;
        if (!this.hostPeers[pid]) {
            this.hostPeerOrder.push(pid);
            try { this.mpLog('info', `${this.shortId(pid)} checked in`); } catch (e) {}
        }
        const rp = this.hostPeers[pid] || {};
        rp._lastUpdate = Date.now();
        // Identity: the sender's chosen name rides every snapshot so the
        // host (and through the roster, everyone) always shows it.
        if (input.playerName && typeof input.playerName === 'string') {
            rp.playerName = input.playerName.slice(0, 12);
        }
        // Map flags: which world slice this peer is on (mainland / isle /
        // cave). Remote bodies on another map are culled at render.
        if (input.player && (typeof input.player.onIsland !== 'undefined' || typeof input.player.inCave !== 'undefined')) {
            rp.onIsland = input.player.onIsland || null;
            rp.inCave = !!input.player.inCave;
        }
        if (input.player && typeof input.player.x === 'number') {
            rp.x = input.player.x;
            rp.y = input.player.y;
            if (typeof input.player.hp === 'number') rp.hp = input.player.hp;
            if (typeof input.player.maxHp === 'number') rp.maxHp = input.player.maxHp;
            if (typeof input.player.facing !== 'undefined') rp.facing = input.player.facing;
            if (typeof input.player.activeSlot !== 'undefined') rp.activeSlot = input.player.activeSlot;
            if (input.player.equippedWeapons) rp.equippedWeapons = input.player.equippedWeapons;
            if (input.player.gunSkins) rp.gunSkins = input.player.gunSkins;
        }
        if (input.mouse) rp.input = input;
        else if (input.mouseX !== undefined) rp.input = input;
        rp._pid = pid;
        if (typeof input.aim === 'number') rp.aim = input.aim;
        else if (input.player && typeof input.player.aim === 'number') rp.aim = input.player.aim;
        if (typeof input.muzzleFlash === 'number') rp.muzzleFlash = input.muzzleFlash;
        if (typeof input.weaponRecoil === 'number') rp.weaponRecoil = input.weaponRecoil;
        if (typeof input.reloading === 'boolean') rp.reloading = input.reloading;
        if (input.fishing) rp.fishing = input.fishing;
        // Forwarded helper hits: my bullets -> someone else's hooked fish
        if (Array.isArray(input.fishHits) && input.fishHits.length) {
            if (!this._fishHitOutbox) this._fishHitOutbox = {};
            for (const fh of input.fishHits.slice(0, 10)) {
                if (!fh || !fh.bid) continue;
                const to = this._normPid(fh.to, 'fishHit.to');
                if (!to) continue; // logged — never route damage nowhere
                // Hits on the HOST's own hooked fish apply right here —
                // the host never reads its own gameState snapshots.
                if (to === this.localClientId) { this._applyFishHit(fh); continue; }
                if (!this.hostPeers[to] && !this._knownPeer(to)) {
                    this.mpLog('bad-pid', `fishHit to unknown ${this.shortId(to)} — dropped`);
                    continue;
                }
                const arr = this._fishHitOutbox[to] || (this._fishHitOutbox[to] = []);
                if (arr.some(x => x.bid === fh.bid)) continue;
                if (arr.length < 20) arr.push(fh);
            }
        }
        if (Array.isArray(input.fx) && input.fx.length && this.state) {
            this._suppressFxEmit = true;
            try { this._applyFx(input.fx); }
            finally { this._suppressFxEmit = false; }
            // Re-emit the TEXT banners room-wide (skill names, damage
            // numbers): the sender + host already saw them, every OTHER
            // peer still needs them. Particle spam is NOT re-emitted.
            try {
                if (!this._fxOutbox) this._fxOutbox = [];
                for (const e of input.fx) {
                    if (e && e.fn === 'showFloatingText' && this._fxOutbox.length < 60) {
                        this._fxOutbox.push(e);
                    }
                }
            } catch (e) {}
        }
        // Catcher's hooked-fish skill side-effects: merge mirrored shots
        // into the sim (relayed, visual for everyone but the catcher) and
        // plant mirrored zones (they threaten whoever stands in them).
        if (Array.isArray(input.skillShots) && input.skillShots.length && this.state) {
            try {
                if (!this.state.projectiles) this.state.projectiles = [];
                if (!this._projIds) this._projIds = {};
                const keys = Object.keys(this._projIds);
                if (keys.length > 400) {
                    keys.slice(0, keys.length - 400).forEach(k => delete this._projIds[k]);
                }
                for (const s of input.skillShots.slice(0, 12)) {
                    if (!s || s.id === undefined) continue;
                    const owner = this._normPid(s.owner, 'skillShot.owner') || pid;
                    const key = owner + ':' + s.id;
                    if (this._projIds[key]) continue;
                    this._projIds[key] = Date.now();
                    if (this.state.projectiles.length > 80) break;
                    this.state.projectiles.push({
                        id: s.id, ownerPid: owner, remote: true,
                        // Foreign-catcher shots threaten their CATCHER
                        // only — viewers render them, never take the hit
                        // (see applyClientIntake).
                        catcherOnly: true,
                        x: s.x || 0, y: s.y || 0, vx: s.vx || 0, vy: s.vy || 0,
                        damage: s.damage || 0, color: s.color || '#fff',
                        radius: s.radius || 8, life: s.life || 3,
                        isHoming: !!s.isHoming, homingForce: s.homingForce || 0,
                        isSpiral: !!s.isSpiral, spiralRadius: s.spiralRadius || 0,
                        trail: [],
                    });
                }
            } catch (e) {}
        }
        if (Array.isArray(input.skillZones) && input.skillZones.length && this.state) {
            try {
                if (!this._zoneIds) this._zoneIds = {};
                const zkeys = Object.keys(this._zoneIds);
                if (zkeys.length > 400) {
                    zkeys.slice(0, zkeys.length - 400).forEach(k => delete this._zoneIds[k]);
                }
                for (const z of input.skillZones.slice(0, 12)) {
                    if (!z || !z.zid || this._zoneIds[z.zid]) continue;
                    this._zoneIds[z.zid] = Date.now();
                    if (z.kind === 'hazard') {
                        if (!this.state.groundHazards) this.state.groundHazards = [];
                        if (this.state.groundHazards.length > 40) break;
                        this.state.groundHazards.push({
                            id: z.zid, remote: true,
                            x: z.x, y: z.y, radius: z.radius || 40,
                            duration: z.duration || 3, type: z.type || 'fire',
                            damagePerSec: z.damagePerSec || 8, color: z.color || '#fff',
                        });
                    } else {
                        if (!this.state.delayedBlasts) this.state.delayedBlasts = [];
                        if (this.state.delayedBlasts.length > 30) break;
                        const b = {
                            id: z.zid, remote: true,
                            x: z.x, y: z.y, radius: z.radius || 40,
                            damage: z.damage || 10, timer: (z.timer === undefined ? 0.6 : z.timer),
                            color: z.color || '#fff',
                        };
                        if (z.leaveHazard !== undefined) b.leaveHazard = z.leaveHazard;
                        if (z.hazardType !== undefined) b.hazardType = z.hazardType;
                        if (z.hazardDps !== undefined) b.hazardDps = z.hazardDps;
                        if (z.hazardDuration !== undefined) b.hazardDuration = z.hazardDuration;
                        if (z.shake !== undefined) b.shake = z.shake;
                        this.state.delayedBlasts.push(b);
                    }
                }
            } catch (e) {}
        }
        // Award ack: client confirms kill-credit receipt
        if (input.awardAck && this._pendingAwards) {
            for (const [apid, a] of Object.entries(this._pendingAwards)) {
                if (apid === pid && a && a.aid === input.awardAck) delete this._pendingAwards[apid];
            }
        }
        // Merge this client's fresh bullets into the host sim (dedupe by id)
        if (Array.isArray(input.bullets)) {
            if (!this.state.bullets) this.state.bullets = [];
            const known = new Set(this.state.bullets.map(b => b.id));
            for (const nb of input.bullets) {
                if (!nb || !nb.id || known.has(nb.id)) continue;
                known.add(nb.id);
                this.state.bullets.push({
                    id: nb.id,
                    pid: nb.pid || pid,
                    x: nb.x, y: nb.y, vx: nb.vx, vy: nb.vy,
                    damage: nb.damage, range: nb.range, distTraveled: 0,
                    type: nb.type, owner: 'player',
                    pierce: !!nb.pierce, explosive: !!nb.explosive, burn: !!nb.burn,
                    burnDps: nb.burnDps, poison: !!nb.poison, poisonDpsMult: nb.poisonDpsMult,
                    chain: !!nb.chain, chainMult: nb.chainMult, lifesteal: nb.lifesteal || 0,
                    coral: !!nb.coral, coralDps: nb.coralDps, freeze: !!nb.freeze,
                    freezeTime: nb.freezeTime, stun: !!nb.stun, stunTime: nb.stunTime,
                    slowHook: nb.slowHook,
                    critMult: nb.critMult || 1, executeMult: nb.executeMult || 0,
                    bossMult: nb.bossMult || 0, drainMult: nb.drainMult || 0,
                    knockMult: nb.knockMult || 0, scatter: !!nb.scatter,
                    hitSet: new Set(), trail: []
                });
            }
        }
        // Player 2/3/4 by join order (host is Player 1) — named when known.
        const idx = this.hostPeerOrder.indexOf(pid);
        rp.label = rp.playerName || (idx >= 0 ? `Player ${idx + 2}` : 'Player ?');
        this.hostPeers[pid] = rp;
        // Legacy single-remote view + new map
        if (this.state) {
            if (!this.state.remotePlayers) this.state.remotePlayers = {};
            this.state.remotePlayers[pid] = rp;
            if (!this.state.remotePlayer) this.state.remotePlayer = rp;
        }
    },

    // Compact player snapshot for the wire (quantized to cut bandwidth).
    // Fishing accepts both shapes: host {mode,bobber,hookedFish} and
    // client {mode,bobber,hooked}.
    _packPlayer(p, id, label, fishingOverride) {
        const f = fishingOverride || p.fishing || null;
        let hooked = null;
        if (f && f.mode === 'HOOKED') {
            if (f.hooked) {
                hooked = f.hooked;
                // Ensure the full model keys exist for Render.drawFishModel
                if (hooked && !hooked.shape && hooked.color) hooked.shape = hooked.shape || 'oval';
            }
            else if (f.hookedFish && f.hookedFish.species) {
                const sp = f.hookedFish.species;
                hooked = {
                    id: sp.id,
                    name: sp.name || 'Fish',
                    color: sp.color || '#38bdf8',
                    shape: sp.shape || 'oval',
                    rarity: sp.rarity || 'common',
                    isBoss: !!sp.isBoss,
                    size: sp.size || 16,
                    shiny: !!sp.shiny,
                    pattern: sp.pattern || null,
                    mutation: sp.mutation || null,
                    skillName: sp.skillName || '',
                    x: Math.round(f.hookedFish.x),
                    y: Math.round(f.hookedFish.y),
                    hp: Math.round(f.hookedFish.hp),
                    maxHp: Math.round(f.hookedFish.maxHp || 1),
                    stamina: Math.round(f.hookedFish.stamina),
                    staminaMax: Math.round(f.hookedFish.staminaMax || 1),
                    rotation: f.hookedFish.rotation || 0,
                    skillCooldown: Math.round((f.hookedFish.skillCooldown || 0) * 100) / 100,
                    isDead: !!f.hookedFish.isDead,
                    isRaging: !!f.hookedFish.isRaging,
                    isInflated: !!f.hookedFish.isInflated
                };
            }
        }
        return {
            id,
            label,
            // Identity + map slice: name tags show who is who, and bodies
            // on another island/cave are culled instead of misrendered.
            name: (p && p.playerName) || label || 'Player ?',
            onIsland: (p && p.onIsland) || null,
            inCave: !!(p && p.inCave),
            x: Math.round(p.x || 0),
            y: Math.round(p.y || 0),
            hp: Math.round(p.hp || 0),
            maxHp: Math.round(p.maxHp || 100),
            facing: p.facing || 1,
            aim: typeof p.aim === 'number' ? Math.round(p.aim * 100) / 100 : undefined,
            activeSlot: p.activeSlot || 0,
            equippedWeapons: p.equippedWeapons || [],
            gunSkins: p.gunSkins || {},
            muzzleFlash: p.muzzleFlash || 0,
            weaponRecoil: Math.round((p.weaponRecoil || 0) * 10) / 10,
            reloading: !!p.reloading,
            fishing: f ? {
                mode: f.mode,
                castPower: f.castPower || 0,
                lineTension: Math.round((f.lineTension || 0) * 10) / 10,
                tensionMax: (p.equippedRod && p.equippedRod.tensionMax) || f.tensionMax || 100,
                bobber: f.bobber ? { x: Math.round(f.bobber.x), y: Math.round(f.bobber.y) } : null,
                bobberModel: (p.equippedRod && p.equippedRod.bobberModel) || f.bobberModel || 'classic',
                lineColor: (p.equippedRod && p.equippedRod.lineColor) || f.lineColor || '#94a3b8',
                hooked
            } : null
        };
    },
    
    // ---- Personal-ownership actions (client -> host) ----
    // Loot is first-come: client already took it personally, host just
    // deletes the shared drop so it can't be grabbed twice.
    sendLootDelete(lootId) {
        if (!this.isClient() || !lootId) return;
        try {
            if (typeof PeerLink !== 'undefined') PeerLink.sendToHost({ type: 'lootDelete', lootId });
        } catch (e) {}
    },

    handleLootDelete(fromId, lootId) {
        if (!this.isHost || !lootId) return;
        fromId = this._normPid(fromId, 'lootDelete');
        if (!fromId) return;
        if (this.state.groundLoot) {
            this.state.groundLoot = this.state.groundLoot.filter(l => l.id !== lootId);
        }
    },

    // Client beached a fish: host spawns it as a SHARED monster (or shared
    // loot if already dead) so everyone sees and fights the same thing.
    sendBeachClaim(fish) {
        if (!this.isClient() || !fish || !fish.species) return false;
        const sp = fish.species;
        // Per-catch instance fields ride along (pattern/mutation/name) so
        // the shared monster renders EXACTLY like the catcher's fish.
        const msg = {
            type: 'beachClaim',
            fish: {
                species: {
                    id: sp.id, name: sp.name, value: sp.value, size: sp.size,
                    shiny: !!sp.shiny, color: sp.color, rarity: sp.rarity,
                    maxHp: sp.maxHp, attack: sp.attack, staminaMax: sp.staminaMax,
                    pattern: sp.pattern || null, mutation: sp.mutation || null
                },
                x: Math.round(fish.x), y: Math.round(fish.y),
                hp: Math.round(fish.hp), isDead: !!fish.isDead
            }
        };
        let sent = false;
        try {
            if (typeof PeerLink !== 'undefined' && PeerLink.sendToHost(msg)) sent = true;
        } catch (e) {}
        return sent;
    },

    // Merge a per-catch instance over the same-version base species so the
    // render matches the catcher's screen pixel-for-pixel (base data is
    // identical on same-version peers; instance overlays must survive).
    _instanceSpecies(dataSpecies) {
        if (!dataSpecies) return null;
        let species = null;
        if (typeof FISH_SPECIES !== 'undefined' && dataSpecies.id) {
            const base = FISH_SPECIES.find(s => s.id === dataSpecies.id);
            if (base) species = Object.assign({}, base);
        }
        if (!species) {
            // Unknown id (shouldn't happen same-version): use wire copy as-is.
            species = Object.assign({}, dataSpecies);
            return species;
        }
        for (const k of ['name', 'color', 'size', 'shiny', 'pattern', 'mutation', 'value']) {
            if (dataSpecies[k] !== undefined) species[k] = dataSpecies[k];
        }
        return species;
    },

    // Slim species for the WIRE: render/fight-only fields. Full base
    // objects carry desc/skills/tables that balloon a snapshot past what
    // a DataChannel delivers in one send — oversized sends fail SILENTLY
    // (the classic "host sees client, client never sees host": tiny
    // inputs flow fine, the big snapshot never lands).
    _slimSpecies(sp) {
        if (!sp) return null;
        return {
            id: sp.id, name: sp.name, color: sp.color, size: sp.size,
            shiny: !!sp.shiny, rarity: sp.rarity, shape: sp.shape || 'oval',
            pattern: sp.pattern || null, mutation: sp.mutation || null,
            skillName: sp.skillName || '', isBoss: !!sp.isBoss,
            value: sp.value, attack: sp.attack,
        };
    },

    handleBeachClaim(fromId, data) {
        if (!this.isHost || !data) return;
        fromId = this._normPid(fromId, 'beachClaim');
        if (!fromId) return;
        const species = this._instanceSpecies(data.species);
        if (!species) return;
        const fish = {
            species,
            x: data.x, y: data.y,
            hp: data.hp, maxHp: species.maxHp || data.hp,
            stamina: species.staminaMax || 100, staminaMax: species.staminaMax || 100,
            vx: 0, vy: 0, rotation: 0,
            isDead: !!data.isDead, isRaging: false, rageTimer: 0,
            isInflated: false, inflateTimer: 0,
            dragState: 'BEACHED', beachedTimer: 99,
            skillCooldown: 2, targetAngle: 0,
            seaTimer: 0, seaEscapeLimit: 999
        };
        if (typeof Fishing !== 'undefined' && Fishing.beachFish) {
            try { Fishing.beachFish(this.state, fish); } catch (e) {}
        }
    },

    // Kill credit: a client's killing blow pays THEM (coins + xp).
    // Queued per-player, acked, applied once.
    queueAward(pid, coins, xp) {
        pid = this._normPid(pid, 'queueAward');
        if (!pid) return;
        this._awardSeq = (this._awardSeq || 0) + 1;
        if (!this._pendingAwards) this._pendingAwards = {};
        const prev = this._pendingAwards[pid];
        this._pendingAwards[pid] = {
            aid: this._awardSeq,
            coins: (prev ? prev.coins : 0) + (coins || 0),
            xp: (prev ? prev.xp : 0) + (xp || 0)
        };
    },

    // Host-side peer lookup: transport members OR already-known snapshots.
    _knownPeer(pid) {
        try {
            if (typeof PeerLink !== 'undefined' && PeerLink.conns && PeerLink.conns[pid]) return true;
            if (this.hostPeers && this.hostPeers[pid]) return true;
        } catch (e) {}
        return false;
    },

    // Send game start signal (host only) — reliable PeerJS broadcast.
    sendGameStart() {
        if (!this.isHost) return;
        try {
            if (typeof PeerLink !== 'undefined') PeerLink.broadcast({ type: 'gameStart' });
        } catch (e) {}
    },

    // Host: send gameStart a few times until the client acks (or timeout).
    // Resolves true on ack, false on timeout — game starts either way.
    sendGameStartWithRetry(retries = 4, intervalMs = 500, timeoutMs = 5000) {
        return new Promise((resolve) => {
            let done = false;
            const finish = (acked) => {
                if (done) return;
                done = true;
                clearInterval(timer);
                clearTimeout(timer2);
                this._startAckResolve = null;
                resolve(acked);
            };
            this._startAckResolve = () => finish(true);
            const timer = setInterval(() => {
                if (done) return;
                this.sendGameStart();
            }, intervalMs);
            const timer2 = setTimeout(() => finish(false), timeoutMs);
            this.sendGameStart();
        });
    },
    
    // Start periodic state synchronization (host only)
    startStateSync() {
        if (!this.isHost) return;
        if (this.stateSendInterval) return; // already running

        this.stateSendInterval = setInterval(() => {
            this.sendLocalState();
        }, 80); // ~12 updates per second (was 20 — host lag fix)
    },
    
    // Stop state synchronization
    stopStateSync() {
        if (this.stateSendInterval) {
            clearInterval(this.stateSendInterval);
            this.stateSendInterval = null;
        }
    },
    
    // Per-frame tick: client snapshot watchdog (host pushes at ~12Hz).
    // If snapshots stop arriving mid-game, the player gets a quotable
    // `no-snapshot` event instead of a silent frozen world, plus an
    // automatic re-ask (syncRequest -> host unicast reply).
    update(delta) {
        void delta;
        try {
            if (this.isClient() && this.isConnected && this._hasEverSynced) {
                const last = this._lastSyncAt || 0;
                if (last && Date.now() - last > 6000) {
                    this.mpLog('no-snapshot', `no host snapshot for ${Math.round((Date.now() - last) / 1000)}s — host lag or disconnect?`);
                    // Re-ask (throttled): a busy-but-alive host answers a
                    // syncRequest with a fresh unicast snapshot.
                    try {
                        if (!this._lastSyncReq || Date.now() - this._lastSyncReq > 2500) {
                            this._lastSyncReq = Date.now();
                            this.sendSyncRequest();
                        }
                    } catch (e) {}
                    this._lastSyncAt = Date.now(); // re-arm (mpLog throttles anyway)
                }
            }
        } catch (e) {}
    },
    
    // Update status display
    updateStatus(message) {
        console.log('[Multiplayer]', message);
        this.onStatusChange(message);
    },
    
    // Handle remote disconnect (one peer; keep the session if others remain)
    handleRemoteDisconnect() {
        const peersLeft = this.isHost
            ? Object.keys(this.hostPeers || {}).length
            : Math.max(0, this._lobbyCount - 1);
        this.remoteClientId = null;
        this.remotePlayerState = null;
        if (peersLeft <= 0) {
            this.isConnected = false;
            this.updateStatus('Other player disconnected');
            if (this.state) this.state.remotePlayer = null;
        } else {
            this.updateStatus(`A player disconnected (${peersLeft} still here)`);
        }
    },
    
    // Handle disconnect (PeerJS cloud link; P2P data may survive)
    handleDisconnect() {
        this.isConnected = false;
        this.stopStateSync();
        this.updateStatus('Disconnected from PeerJS cloud');
    },

    // Leave room (closing the connection tells the other side via onclose)
    leaveRoom() {
        try {
            if (typeof PeerLink !== 'undefined') PeerLink.destroy();
        } catch (e) {}
        this.cleanup();
    },

    // Full cleanup
    cleanup() {
        this.stopStateSync();

        try {
            if (typeof PeerLink !== 'undefined') PeerLink.destroy();
        } catch (e) {}
        try {
            if (typeof PeerSkins !== 'undefined') PeerSkins.resetProgress();
        } catch (e) {}

        this.isHost = false;
        this.isConnected = false;
        this.roomCode = null;
        this.localClientId = null;
        this.remoteClientId = null;
        this.remotePlayerState = null;
        this._lobbyCount = 1;
        this.hostPeers = {};
        this.hostPeerOrder = [];
        this._roomRoster = null;
        this._hostName = 'Host';
           this._hostPilot = null;
        this.hostPid = null;
        try { if (typeof SaveSystem !== 'undefined' && SaveSystem.setMPScope) SaveSystem.setMPScope(null); } catch (e) {}
        this._lastGameStateTs = 0;
        this._hasEverSynced = false;
        this._lastSyncAt = 0;
        this._fxOutbox = [];
        this._fishHitClaims = [];
        this._fishHitOutbox = {};
        this._fishHitApplied = {};
        this._ownBulletIds = {};
        if (this.state) {
            this.state.remotePlayer = null;
            this.state.remotePlayers = {};
        }

        this.updateStatus('Left multiplayer session');
    },

    // Get connection info for UI
    getConnectionInfo() {
        let skins = '';
        try {
            if (typeof PeerSkins !== 'undefined') skins = PeerSkins.progressText();
        } catch (e) {}
        let cloud = 'idle';
        try {
            if (typeof PeerLink !== 'undefined') cloud = PeerLink.cloud || 'idle';
        } catch (e) {}
        return {
            isHost: this.isHost,
            isConnected: this.isConnected,
            roomCode: this.roomCode,
            playerCount: this._lobbyCount || 1,
            cloud,
            skins
        };
    },
    
    // Render remote players — screen space (called after drawWorld's
    // ctx.restore(), so world coords must be projected through the camera).
    renderRemotePlayer(ctx) {
        if (!this.state) return;
        const map = this.state.remotePlayers && Object.keys(this.state.remotePlayers).length
            ? this.state.remotePlayers
            : (this.state.remotePlayer ? { solo: this.state.remotePlayer } : null);
        if (!map) return;
        for (const rp of Object.values(map)) {
            this._drawRemotePlayer(ctx, rp);
        }
    },

    _drawRemotePlayer(ctx, rp) {
        if (!rp || typeof rp.x !== 'number') return;
        // Per-player travel: a mate on another island/cave stays there —
        // never render their body (or bobber) on the wrong map.
        try {
            const me = this.state.player || {};
            const myIsle = me.onIsland || null, myCave = !!me.inCave;
            const rpIsle = rp.onIsland || null, rpCave = !!rp.inCave;
            if (myIsle !== rpIsle || myCave !== rpCave) return;
        } catch (e) {}

        const canvas = ctx.canvas;
        const cam = this.state.camera;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const dt = Math.min(0.1, Math.max(0.001, now - (rp._lastDraw || now)));
        rp._lastDraw = now;
        // Frame-rate independent smoothing; snap on teleports/respawns
        // so no ghost trail is left behind.
        if (typeof rp.rx !== 'number') { rp.rx = rp.x; rp.ry = rp.y; }
        const distJump = Math.hypot(rp.x - rp.rx, rp.y - rp.ry);
        if (distJump > 320) { rp.rx = rp.x; rp.ry = rp.y; }
        else {
            const k = 1 - Math.pow(0.0001, dt); // ~12Hz -> smooth, 60fps -> stable
            rp.rx += (rp.x - rp.rx) * k;
            rp.ry += (rp.y - rp.ry) * k;
        }
        const sx = (rp.rx - cam.x) * cam.zoom + canvas.width / 2;
        const sy = (rp.ry - cam.y) * cam.zoom + canvas.height / 2;
        const margin = 60;
        if (sx < -margin || sx > canvas.width + margin || sy < -margin || sy > canvas.height + margin) return;

        const sc = cam.zoom;
        // Aim: explicit wire field first (identical on both peers),
        // fall back to the legacy mouse-world derivation.
        let aimAngle = (typeof rp.aim === 'number') ? rp.aim : 0;
        let aimKnown = (typeof rp.aim === 'number');
        if (!aimKnown && rp.input) {
            const ix = rp.input.mouseX !== undefined ? rp.input.mouseX : (rp.input.mouse && rp.input.mouse.worldX);
            const iy = rp.input.mouseY !== undefined ? rp.input.mouseY : (rp.input.mouse && rp.input.mouse.worldY);
            if (typeof ix === 'number' && typeof iy === 'number') {
                aimAngle = Math.atan2(iy - rp.ry, ix - rp.rx);
                aimKnown = true;
            }
        }
        if (!aimKnown) aimAngle = (rp.facing === -1 ? Math.PI : 0);

        // Muzzle edge -> local puff + remote gunshot sound so shots look
        // AND sound the same everywhere. (Heavier smoke arrives via the
        // shared FX tap; audio never rides the wire — each peer plays its
        // own sounds locally. Off-screen peers are culled above, so this
        // only fires for visible shooters. Throttled per pid for SMGs.)
        const flash = rp.muzzleFlash || 0;
        if (flash > 0.4 && !rp._wasFlashing && typeof Particles !== 'undefined' && this.state) {
            try {
                this._suppressFxEmit = true;
                Particles.spawnParticles(this.state, rp.rx + Math.cos(aimAngle) * 26, rp.ry + Math.sin(aimAngle) * 26, '#fbbf24', 3, { size: 3 });
            } catch (e) {}
            finally { this._suppressFxEmit = false; }
            try {
                const nowSfx = (typeof performance !== 'undefined' ? performance.now() : Date.now());
                if (!rp._lastShotSfx || nowSfx - rp._lastShotSfx > 120) {
                    rp._lastShotSfx = nowSfx;
                    const wid = rp.equippedWeapons && rp.equippedWeapons[rp.activeSlot];
                    let snd = null;
                    try {
                        if (wid && typeof WEAPONS !== 'undefined') {
                            const def = WEAPONS.find(x => x.id === wid);
                            if (def) snd = def.sound || def.type;
                        }
                    } catch (e) {}
                    if (typeof audio !== 'undefined' && audio.playGunshot) audio.playGunshot(snd || 'pistol');
                }
            } catch (e) {}
        }
        rp._wasFlashing = flash > 0.4;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(sc, sc); // world units from here — identical to drawPlayer

        // Shadow (same as single player)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(2, 4, 16, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body — same shape as single player, pink so you can tell who's who
        const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, 16);
        g.addColorStop(0, '#f472b6');
        g.addColorStop(1, '#be185d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Facing visor: makes turns/spins visible even though the body
        // is a circle (single-player aim is mirrored 1:1 via rp.aim).
        ctx.save();
        ctx.rotate(aimAngle);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(9, -5, 3, 0, Math.PI * 2);
        ctx.arc(9, 5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(10, -5, 1.5, 0, Math.PI * 2);
        ctx.arc(10, 5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Gun — the REAL single-player model via Render.drawGun
        // (same shapes, same rarity accents, same muzzle flash/recoil)
        ctx.save();
        ctx.rotate(aimAngle);
        const w = rp.equippedWeapons && rp.equippedWeapons[rp.activeSlot];
        if (w && typeof WEAPONS !== 'undefined' && typeof Render !== 'undefined' && Render.drawGun) {
            const def = WEAPONS.find(x => x.id === w);
            // Foreign body: holder = THEM → their art on them (global hold,
            // per-holder skins). Shop/hotbar/previews always use own art.
            let holder = null;
            try {
                if (typeof Multiplayer !== 'undefined' && Multiplayer.localClientId) {
                    holder = { pid: rp._pid || rp.id, me: Multiplayer.localClientId };
                }
            } catch (e) {}
            if (def) Render.drawGun(ctx, { muzzleFlash: rp.muzzleFlash || 0, weaponRecoil: rp.weaponRecoil || 0, gunSkins: rp.gunSkins || {} }, def, holder);
            if (rp.reloading) {
                ctx.fillStyle = '#fbbf24';
                ctx.font = 'bold 11px Work Sans';
                ctx.textAlign = 'center';
                ctx.fillText('R…', 0, -20);
            }
        }
        ctx.restore();
        ctx.restore();

        // Remote fishing: bobber + line + hooked catch (same models)
        if (rp.fishing && rp.fishing.mode && rp.fishing.mode !== 'IDLE') {
            this._drawRemoteFishing(ctx, rp, sx, sy, sc);
        }

        // Name tag + HP bar (screen space) — the player's chosen name.
        ctx.save();
        ctx.font = 'bold 12px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f472b6';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        const name = rp.playerName || rp.label || 'Player ?';
        ctx.strokeText(name, sx, sy - 35 * sc);
        ctx.fillText(name, sx, sy - 35 * sc);

        const barW = 50 * sc;
        const hpRatio = Math.max(0, Math.min(1, (rp.hp || 1) / (rp.maxHp || 100)));
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.fillRect(sx - barW / 2, sy - 45 * sc, barW, 5);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(sx - barW / 2, sy - 45 * sc, hpRatio * barW, 5);
        ctx.restore();
    },

    _drawRemoteFishing(ctx, rp, sx, sy, sc) {
        const cam = this.state.camera;
        const canvas = ctx.canvas;
        const toScreen = (wx, wy) => ({
            x: (wx - cam.x) * cam.zoom + canvas.width / 2,
            y: (wy - cam.y) * cam.zoom + canvas.height / 2
        });
        const f = rp.fishing;
        const t = (this.state.time || 0);
        // Smooth bobber + hooked-fish targets so the line never snaps
        // between quantized 12Hz snapshots (the "broke line" jitter).
        const smoothTo = (key, tx, ty, snap) => {
            if (typeof tx !== 'number' || typeof ty !== 'number') return null;
            const kx = key + 'x', ky = key + 'y';
            if (typeof rp[kx] !== 'number' || Math.hypot(tx - rp[kx], ty - rp[ky]) > (snap || 320)) {
                rp[kx] = tx; rp[ky] = ty;
            } else {
                rp[kx] += (tx - rp[kx]) * 0.4;
                rp[ky] += (ty - rp[ky]) * 0.4;
            }
            return { x: rp[kx], y: rp[ky] };
        };
        // Tension color identical to single player (grey -> rod color -> red)
        const tensionMax = f.tensionMax || 100;
        const tensionRatio = Math.min(1, (f.lineTension || 0) / tensionMax);
        const rodLine = f.lineColor || '#38bdf8';
        const lineColor = tensionRatio > 0.8 ? '#f43f5e' : (f.mode === 'HOOKED' && f.hooked && f.hooked.isDead ? '#94a3b8' : rodLine);
        ctx.save();
        if (f.mode === 'CASTING') {
            // Same power meter as single player
            const meterW = 80 * sc;
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(sx - 40 * sc, sy - 55 * sc, meterW, 12 * sc, 4);
            ctx.fill(); ctx.stroke();
            const g = ctx.createLinearGradient(sx - 40 * sc, 0, sx + 40 * sc, 0);
            g.addColorStop(0, '#10b981');
            g.addColorStop(0.6, '#fbbf24');
            g.addColorStop(1, '#ef4444');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.roundRect(sx - 38 * sc, sy - 53 * sc, ((f.castPower || 0) / 100) * (meterW - 4 * sc), 8 * sc, 3);
            ctx.fill();
        } else if ((f.mode === 'WAITING_BITES' || f.mode === 'BITING' || f.mode === 'CAST_FLY') && f.bobber) {
            // Same bobber as single player: ripple rings + red/white float + line
            const sm = smoothTo('_b', f.bobber.x, f.bobber.y) || f.bobber;
            const b = toScreen(sm.x, sm.y);
            const bob = Math.sin(t * 4) * 3 * sc;
            ctx.strokeStyle = 'rgba(125,211,252,0.5)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                ctx.globalAlpha = 0.5 - i * 0.15;
                ctx.beginPath();
                ctx.arc(b.x, b.y + bob, (8 + i * 8) * sc + Math.sin(t * 3 + i) * 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            if (typeof Render !== 'undefined' && Render.drawBobberModel) {
                try { Render.drawBobberModel(ctx, b.x, b.y + bob, f.bobberModel || 'classic', rodLine, sc, t); } catch (e) {}
            }
            ctx.strokeStyle = rodLine;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo((sx + b.x) / 2, (sy + b.y) / 2 + 30 * sc, b.x, b.y + bob);
            ctx.stroke();
        } else if (f.mode === 'HOOKED' && f.hooked) {
            const h = f.hooked;
            const sm = smoothTo('_h', h.x, h.y) || h;
            const hp = toScreen(sm.x, sm.y);
            // Same tension line as single player (red when nearly snapping)
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = tensionRatio > 0.8 ? 3 : 2;
            ctx.shadowColor = lineColor;
            ctx.shadowBlur = tensionRatio > 0.8 ? 12 : 6;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            const sag = 30 * sc + (f.lineTension || 0) * 0.3 * sc;
            ctx.quadraticCurveTo((sx + hp.x) / 2, (sy + hp.y) / 2 + sag, hp.x, hp.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            // THE SAME fish model: base species for the shape drawer, but
            // per-catch instance fields (size/shiny/pattern/color) win, so
            // viewers see exactly what the catcher sees.
            let species = null;
            if (h.id && typeof this.findSpecies === 'function') {
                try { species = this.findSpecies(h.id); } catch (e) {}
            }
            if (species) {
                species = Object.assign({}, species, {
                    name: h.name || species.name,
                    color: h.color || species.color,
                    size: h.size || species.size,
                    shiny: !!h.shiny,
                    pattern: (h.pattern !== undefined ? h.pattern : species.pattern) || null,
                    mutation: (h.mutation !== undefined ? h.mutation : species.mutation) || null
                });
            }
            if (!species) {
                species = { id: h.id || 'remote', name: h.name || 'Fish', color: h.color || '#38bdf8', accent: h.color || '#38bdf8', shape: h.shape || 'oval', size: h.size || 16, rarity: h.rarity || 'common', shiny: !!h.shiny, pattern: h.pattern || null, mutation: h.mutation || null };
            }
            if (typeof Render !== 'undefined' && Render.drawFishModel) {
                try {
                    Render.drawFishModel(ctx, hp.x, hp.y, (species.size || h.size || 16) * sc, species, {
                        angle: h.rotation || 0,
                        isRaging: !!h.isRaging && !h.isDead,
                        isInflated: !!h.isInflated,
                        glow: species.rarity === 'legendary' && !h.isDead ? 1 : 0
                    });
                } catch (e) {}
            }
            if (h.isDead) {
                ctx.font = `bold ${20 * sc}px Work Sans`;
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ef4444';
                ctx.fillText('☠', hp.x, hp.y - (species.size || 16) * sc - 12);
            } else {
                // Same hp + stamina bars as single player
                const barW = 60 * sc;
                const barY = hp.y - (species.size || 16) * sc - 24;
                const ratio = Math.max(0, Math.min(1, (h.hp || 0) / (h.maxHp || 1)));
                ctx.fillStyle = 'rgba(15,23,42,0.9)';
                ctx.beginPath();
                ctx.roundRect(hp.x - barW / 2 - 2, barY - 2, barW + 4, 16 * sc, 4);
                ctx.fill();
                ctx.fillStyle = '#38bdf8';
                ctx.beginPath();
                ctx.roundRect(hp.x - barW / 2, barY, ratio * barW, 5 * sc, 2);
                ctx.fill();
                if (h.staminaMax) {
                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.roundRect(hp.x - barW / 2, barY + 7 * sc, Math.max(0, (h.stamina || 0) / h.staminaMax) * barW, 5 * sc, 2);
                    ctx.fill();
                }
                // Same labels as single player: always the catch name, plus
                // the red skill warning right before it fires.
                ctx.textAlign = 'center';
                if ((h.skillCooldown || 99) < 0.5 && !h.isDead) {
                    ctx.fillStyle = '#ef4444';
                    ctx.font = `bold ${11 * sc}px Work Sans`;
                    ctx.fillText(`⚠ ${h.skillName || 'SKILL'}`, hp.x, barY - 8);
                } else {
                    ctx.fillStyle = '#f472b6';
                    ctx.font = `bold ${10 * sc}px Work Sans`;
                    ctx.fillText(`🎣 ${h.name || species.name || ''}`, hp.x, barY - 6);
                }
            }
        }
        ctx.restore();
    }
};

// Make globally available
window.Multiplayer = Multiplayer;