/**
 * Multiplayer Module for Aquatic Havoc
 * Handles WebRTC peer-to-peer connections, game state synchronization, and healing system
 */

/**
 * Work out which WebSocket signaling server to use.
 *
 * Priority:
 *   1. ?server= query param   -> e.g. index.html?server=wss://my-host.onrender.com
 *      (required for itch.io builds, where the page host is not your server)
 *   2. localStorage override  -> set once, remembered across sessions
 *   3. same hostname, :8080   -> LAN default (npm start)
 */
function resolveSignalingUrl() {
    const toWebSocket = (raw) => {
        if (raw === null || raw === undefined) return null; // .get() returns null when absent
        const value = String(raw).trim();
        if (!value) return null;
        if (/^wss?:\/\//i.test(value)) return value;
        if (/^https:\/\//i.test(value)) return 'wss://' + value.slice('https://'.length);
        if (/^http:\/\//i.test(value)) return 'ws://' + value.slice('http://'.length);
        return 'ws://' + value.replace(/^\/+/, '');
    };

    try {
        const fromQuery = new URLSearchParams(window.location.search).get('server');
        const resolved = toWebSocket(fromQuery);
        if (resolved) return resolved;
    } catch (e) { /* malformed URL, fall through */ }

    try {
        const resolved = toWebSocket(localStorage.getItem('ah_signaling_server'));
        if (resolved) return resolved;
    } catch (e) { /* storage blocked, fall through */ }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // file:// has no hostname (double-clicked zip build) -> assume local server
    const host = window.location.hostname || 'localhost';
    return `${protocol}//${host}:8080`;
}

const Multiplayer = {
    // Connection state
    isHost: false,
    isConnected: false,
    roomCode: null,
    peerConnection: null,
    dataChannel: null,
    signalingWs: null,
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
    
    // Healing system (removed — no heal feature)
    // Chat system (removed — no chat feature)

    // Config
    signalingUrl: 'ws://localhost:8080', // Will be overridden by current host
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    
    // Connection retry config
    maxReconnectAttempts: 3,
    reconnectDelay: 2000,
    _reconnectAttempts: 0,
    
    // Callbacks
    onStatusChange: null,
    onPlayerJoined: null,
    onPlayerLeft: null,
    onGameStart: null,
    onError: null,

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
    
    // Initialize multiplayer system
    init(state, callbacks = {}) {
        this.state = state;
        this.onStatusChange = callbacks.onStatusChange || (() => {});
        this.onPlayerJoined = callbacks.onPlayerJoined || (() => {});
        this.onPlayerLeft = callbacks.onPlayerLeft || (() => {});
        this.onGameStart = callbacks.onGameStart || (() => {});
        this.onError = callbacks.onError || ((msg) => console.error(msg));
        
        // Resolve the signaling server URL
        this.signalingUrl = resolveSignalingUrl();
        this._installFxTap();
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
            let dmg = Math.max(1, Math.round(fh.dmg || 0));
            if (hooked.isInflated) dmg = Math.max(1, Math.round(dmg * 0.5));
            hooked.hp -= dmg;
            hooked.stamina -= dmg * ((typeof CONFIG !== 'undefined' && CONFIG.STAMINA_DRAIN_PER_BULLET) || 0.5);
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
            Particles.showFloatingText(st, `-${Math.round(dmg)}`, hooked.x, hooked.y - 20, '#38bdf8');
            if (hooked.hp <= 0) {
                hooked.hp = 0;
                if (typeof Fishing !== 'undefined') Fishing.killHookedFish(st);
            }
        } catch (e) {}
    },
    
    // Create a new room (host)
    async createRoom() {
        try {
            this.updateStatus('Connecting to signaling server...');
            await this.connectSignaling();
            
            return new Promise((resolve, reject) => {
                this._createRoomResolve = resolve;
                this._createRoomReject = reject;
                
                const timeout = setTimeout(() => {
                    this._createRoomResolve = null;
                    this._createRoomReject = null;
                    reject(new Error('Room creation timeout'));
                }, 15000);
                
                const handler = (msg) => {
                    if (msg.type === 'roomCreated') {
                        clearTimeout(timeout);
                        this.signalingWs.removeEventListener('message', handler);
                    } else if (msg.type === 'error') {
                        clearTimeout(timeout);
                        this.signalingWs.removeEventListener('message', handler);
                    }
                };
                
                this.signalingWs.addEventListener('message', handler);
                this.signalingWs.send(JSON.stringify({ type: 'createRoom' }));
            });
        } catch (e) {
            this.updateStatus(`Failed to create room: ${e.message}`);
            this.onError(e.message);
            throw e;
        }
    },
    
    // Join an existing room
    async joinRoom(roomCode) {
        try {
            this.updateStatus('Connecting to signaling server...');
            await this.connectSignaling();
            
            return new Promise((resolve, reject) => {
                this._joinRoomResolve = resolve;
                this._joinRoomReject = reject;
                
                const timeout = setTimeout(() => {
                    this._joinRoomResolve = null;
                    this._joinRoomReject = null;
                    reject(new Error('Join timeout'));
                }, 15000);
                
                const handler = (msg) => {
                    if (msg.type === 'roomJoined') {
                        clearTimeout(timeout);
                        this.signalingWs.removeEventListener('message', handler);
                    } else if (msg.type === 'error') {
                        clearTimeout(timeout);
                        this.signalingWs.removeEventListener('message', handler);
                    } else if (msg.type === 'playerJoined' && this.isHost) {
                        this.remoteClientId = msg.playerId;
                        this.onPlayerJoined(msg.playerId);
                    }
                };
                
                this.signalingWs.addEventListener('message', handler);
                this.signalingWs.send(JSON.stringify({ type: 'joinRoom', roomCode: roomCode.toUpperCase() }));
            });
        } catch (e) {
            this.updateStatus(`Failed to join: ${e.message}`);
            this.onError(e.message);
            throw e;
        }
    },
    
    // Connect to signaling server
    // On hosted pages (itch.io) there is no LAN server to auto-find, so
    // failures explain where to paste a public wss:// URL.
    _signalHelp() {
        try {
            const host = window.location.hostname || '';
            const onItch = /itch(\.io|zone)$/.test(host) || /itch\.io/.test(host);
            if (onItch || window.location.protocol === 'https:' && (host && host !== 'localhost' && host !== '127.0.0.1')) {
                return 'On itch.io you need a PUBLIC signaling server: deploy server.js (free on Render), then paste its wss:// URL in Multiplayer menu → SIGNALING SERVER → Save. Same URL on both PCs.';
            }
        } catch (e) {}
        return 'Make sure server.js is running (npm start), both PCs are on the same Wi-Fi, and the port 8080 is allowed through the firewall.';
    },

    connectSignaling() {
        return new Promise((resolve, reject) => {
            let url = this.signalingUrl;
            // Never try ws(s)://<itch-host>:8080 — browsers block it and it
            // can never work (no server runs on itch's CDN).
            try {
                const host = window.location.hostname || '';
                const u = new URL(url);
                if (host && u.hostname === host && !/localhost|127\.0\.0\.1/.test(host)) {
                    reject(new Error(this._signalHelp()));
                    return;
                }
            } catch (e) {}
            this.signalingWs = new WebSocket(url);
            let resolved = false;
            
            this.signalingWs.onopen = () => {
                console.log('Connected to signaling server');
                resolved = true;
                resolve();
            };
            
            this.signalingWs.onerror = (err) => {
                console.error('Signaling connection error:', err);
                if (!resolved) {
                    resolved = true;
                    reject(new Error('Cannot connect to signaling server. ' + this._signalHelp()));
                }
            };
            
            this.signalingWs.onclose = (event) => {
                console.log('Disconnected from signaling server', event.code, event.reason);
                if (!resolved) {
                    resolved = true;
                    reject(new Error('Signaling connection closed before handshake. ' + this._signalHelp()));
                } else {
                    this.handleDisconnect();
                }
            };
            
            this.signalingWs.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleSignalingMessage(msg);
                } catch (e) {
                    console.error('Failed to parse signaling message:', e);
                }
            };
            
            // Connection timeout
            setTimeout(() => {
                if (!resolved && this.signalingWs && this.signalingWs.readyState !== WebSocket.OPEN) {
                    resolved = true;
                    this.signalingWs.close();
                    reject(new Error('Signaling connection timeout (' + url + '). ' + this._signalHelp()));
                }
            }, 10000);
        });
    },
    
    // Handle incoming signaling messages
    handleSignalingMessage(msg) {
        switch (msg.type) {
            case 'welcome':
                this.signalingWs.clientId = msg.clientId;
                break;
                
            case 'roomCreated':
                // Handle room creation response
                if (msg.roomCode || msg.code) {
                    this.isHost = true;
                    this.roomCode = msg.roomCode || msg.code;
                    this.localClientId = this.signalingWs.clientId;
                    this._lobbyCount = msg.count || 1;
                    this.hostPeers = {};
                    this.hostPeerOrder = [];
                    this.setupPeerConnection(true);
                    this.updateStatus(`Room created: ${this.roomCode} (Share this code)`);
                    if (this._createRoomResolve) {
                        this._createRoomResolve(this.roomCode);
                        this._createRoomResolve = null;
                    }
                }
                break;
                
            case 'roomJoined':
                // Handle join room response
                if (msg.roomCode || msg.code) {
                    this.isHost = false;
                    this.roomCode = msg.roomCode || msg.code;
                    this.localClientId = this.signalingWs.clientId;
                    this.remoteClientId = msg.hostId;
                    this._lobbyCount = msg.count || 2;
                    this.setupPeerConnection(false);
                    this.updateStatus(`Joined room: ${this.roomCode}`);
                    if (this._joinRoomResolve) {
                        this._joinRoomResolve();
                        this._joinRoomResolve = null;
                    }
                }
                break;

            case 'playerJoined':
                if (msg.count) this._lobbyCount = msg.count;
                else this._lobbyCount = Math.min(4, this._lobbyCount + 1);
                if (this.isHost) {
                    this.remoteClientId = this.remoteClientId || msg.playerId;
                    this.onPlayerJoined(msg.playerId);
                    // Single WebRTC attempt for the first peer only — extra
                    // players sync via the signaling relay (no mesh needed)
                    if (this._lobbyCount <= 2) {
                        setTimeout(() => this.createOffer(), 300);
                    }
                } else {
                    this.onPlayerJoined(msg.playerId);
                }
                break;
                
            case 'playerLeft':
                if (msg.count) this._lobbyCount = msg.count;
                else this._lobbyCount = Math.max(1, this._lobbyCount - 1);
                if (this.isHost && this.hostPeers && msg.playerId) {
                    delete this.hostPeers[msg.playerId];
                    if (this.hostPeerOrder) this.hostPeerOrder = this.hostPeerOrder.filter(id => id !== msg.playerId);
                    if (this.state) {
                        if (this.state.remotePlayers) delete this.state.remotePlayers[msg.playerId];
                        if (this.state.remotePlayer && this.state.remotePlayer._pid === msg.playerId) this.state.remotePlayer = null;
                    }
                }
                if (msg.playerId === this.remoteClientId) {
                    this.handleRemoteDisconnect();
                }
                this.onPlayerLeft(msg.playerId);
                break;
                
            case 'hostLeft':
                this.updateStatus('Host left the game');
                this.cleanup();
                break;
                
            case 'signal':
                // Server relayed signaling (offer/answer/candidate wrapped)
                if (msg.payload) {
                    const payload = msg.payload;
                    if (payload.type === 'offer') {
                        this.handleOffer(msg.from, payload.offer);
                    } else if (payload.type === 'answer') {
                        this.handleAnswer(payload.answer);
                    } else if (payload.type === 'candidate') {
                        this.handleCandidate(msg.from, payload.candidate);
                    }
                }
                break;
                
            case 'offer':
                this.handleOffer(msg.from, msg.offer);
                break;
                
            case 'answer':
                this.handleAnswer(msg.answer);
                break;
                
            case 'candidate':
                this.handleCandidate(msg.from, msg.candidate);
                break;
                
            case 'gameState':
                this.handleGameState(msg.state);
                break;
                
            case 'playerInput':
                this.handlePlayerInput(msg.playerId, msg.input);
                break;
                
            case 'gameStart':
                // Host signaled game start
                if (!this.isHost) {
                    this.onGameStart();
                }
                break;

            case 'gameStartAck':
                // Client confirmed it entered the game
                if (this.isHost && this._startAckResolve) {
                    this._startAckResolve();
                }
                break;

            case 'syncRequest':
                // Client wants a full snapshot — host only
                if (this.isHost) {
                    this.sendLocalState();
                }
                break;
                
            case 'error':
                this.updateStatus(`Server error: ${msg.message}`, 'rose');
                if (this._createRoomReject) {
                    this._createRoomReject(new Error(msg.message));
                    this._createRoomReject = null;
                }
                if (this._joinRoomReject) {
                    this._joinRoomReject(new Error(msg.message));
                    this._joinRoomReject = null;
                }
                break;
        }
    },
    
    // Setup WebRTC peer connection
    setupPeerConnection(isInitiator) {
        this.peerConnection = new RTCPeerConnection({ 
            iceServers: this.iceServers,
            iceCandidatePoolSize: 10
        });
        
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
                this.signalingWs.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate
                }));
            }
        };
        
        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            console.log('ICE connection state:', state);
            
            if (state === 'failed' || state === 'disconnected') {
                this.handleConnectionFailure();
            } else if (state === 'connected' || state === 'completed') {
                this._reconnectAttempts = 0; // Reset on successful connection
            }
        };
        
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log('Connection state:', state);
            
            if (state === 'connected') {
                this.isConnected = true;
                this.updateStatus('Connected! Game synchronized');
                this.startStateSync();
            } else if (state === 'disconnected' || state === 'failed') {
                this.isConnected = false;
                this.updateStatus('Connection lost. Reconnecting...');
                this.handleConnectionFailure();
            }
        };
        
        // Data channel setup
        if (isInitiator) {
            this.dataChannel = this.peerConnection.createDataChannel('game', { 
                ordered: true,
                maxRetransmits: 0 // Unreliable for lower latency
            });
            this.setupDataChannel();
        } else {
            this.peerConnection.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this.setupDataChannel();
            };
        }
    },
    
    handleConnectionFailure() {
        if (this._reconnectAttempts < this.maxReconnectAttempts) {
            this._reconnectAttempts++;
            this.updateStatus(`Connection failed. Retry ${this._reconnectAttempts}/${this.maxReconnectAttempts}...`);
            
            setTimeout(() => {
                if (this.isHost) {
                    this.createOffer();
                }
            }, this.reconnectDelay * this._reconnectAttempts);
        } else {
            this.updateStatus('Connection failed. Max retries reached.', 'rose');
            this.onError('WebRTC connection failed after multiple retries');
            this.cleanup();
        }
    },
    
    // Setup data channel handlers
    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('Data channel open');
            this.sendLocalState(); // Send initial state
        };
        
        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            this.isConnected = false;
        };
        
        this.dataChannel.onerror = (err) => {
            console.error('Data channel error:', err);
        };
        
        this.dataChannel.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            this.handleDataChannelMessage(msg);
        };
    },
    
    // Handle data channel messages (direct peer-to-peer)
    handleDataChannelMessage(msg) {
        switch (msg.type) {
            case 'gameState':
                this.handleGameState(msg.state);
                break;
            case 'playerInput':
                this.handlePlayerInput((msg.input && msg.input._from) || this.remoteClientId, msg.input);
                break;
            case 'lootDelete':
                if (this.isHost) this.handleLootDelete((msg.input && msg.input._from) || msg.from || this.remoteClientId, msg.lootId);
                break;
            case 'beachClaim':
                if (this.isHost) this.handleBeachClaim((msg.input && msg.input._from) || msg.from || this.remoteClientId, msg.fish);
                break;
            case 'syncRequest':
                if (this.isHost) this.sendLocalState();
                break;
            case 'gameStart':
                if (this.onGameStart) this.onGameStart();
                break;
            case 'gameStartAck':
                if (this.isHost && this._startAckResolve) this._startAckResolve();
                break;
        }
    },
    
    // Create WebRTC offer (host)
    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
                this.signalingWs.send(JSON.stringify({
                    type: 'offer',
                    offer: offer
                }));
            }
        } catch (e) {
            console.error('Error creating offer:', e);
        }
    },
    
    // Handle incoming offer (client)
    async handleOffer(fromId, offer) {
        try {
            this.remoteClientId = fromId;
            // Ensure peer connection exists
            if (!this.peerConnection) {
                console.log('Peer connection not ready, creating...');
                this.setupPeerConnection(false);
            }
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            this._processPendingCandidates();
            
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
                this.signalingWs.send(JSON.stringify({
                    type: 'answer',
                    answer: answer
                }));
            }
        } catch (e) {
            console.error('Error handling offer:', e);
        }
    },
    
    // Handle answer (host)
    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            this._processPendingCandidates();
        } catch (e) {
            console.error('Error handling answer:', e);
        }
    },
    
    // Handle ICE candidate
    async handleCandidate(fromId, candidate) {
        try {
            if (this.peerConnection && this.peerConnection.remoteDescription) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // Queue candidate for later
                if (!this._pendingCandidates) this._pendingCandidates = [];
                this._pendingCandidates.push(candidate);
            }
        } catch (e) {
            console.error('Error adding ICE candidate:', e);
        }
    },
    
    // Process queued ICE candidates
    _processPendingCandidates() {
        if (this._pendingCandidates && this._pendingCandidates.length > 0 && this.peerConnection && this.peerConnection.remoteDescription) {
            this._pendingCandidates.forEach(candidate => {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => console.error('Error adding queued ICE candidate:', e));
            });
            this._pendingCandidates = [];
        }
    },
    
    // Send local game state to peer (host -> client).
    // Prefers the WebRTC data channel, falls back to the signaling
    // server (throttled) so sync works even without WebRTC.
    sendLocalState() {
        const p = this.state.player;
        const f = this.state.fishing;
        const R1 = (v) => Math.round((v || 0) * 10) / 10;
        const RI = (v) => Math.round(v || 0);

        // Drop peers silent for >12s (left without a clean leaveRoom).
        // Live peers send input at ~15Hz, so this only kills real ghosts.
        try {
            const now = Date.now();
            for (const pid of Object.keys(this.hostPeers || {})) {
                const rp = this.hostPeers[pid];
                if (!rp || !rp._lastUpdate || now - rp._lastUpdate > 12000) {
                    delete this.hostPeers[pid];
                    if (Array.isArray(this.hostPeerOrder)) {
                        this.hostPeerOrder = this.hostPeerOrder.filter(id => id !== pid);
                    }
                    if (this.state && this.state.remotePlayers) delete this.state.remotePlayers[pid];
                }
            }
        } catch (e) {}
        // Lobby snapshots: host + every known peer (clients render all)
        try {
            if (this.state && this.state.mouse) {
                p.aim = Math.atan2(this.state.mouse.worldY - p.y, this.state.mouse.worldX - p.x);
            }
        } catch (e) {}
        const players = [this._packPlayer(p, this.localClientId || 'host', 'Host', this.state.fishing)];
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
                    species: f.hookedFish.species,
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
                species: m.species,
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
            groundLoot: this.state.groundLoot.map(l => ({
                id: l.id,
                species: l.species,
                x: RI(l.x),
                y: RI(l.y)
            })),
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
            // Open-world enemies (host spawns; clients render + touch, host kills)
            enemies: (this.state.enemies || []).slice(0, 24).map(e => ({
                enemyType: e.enemyType,
                speciesId: e.species ? e.species.id : null,
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
                x: RI(b.x),
                y: RI(b.y),
                vx: RI(b.vx),
                vy: RI(b.vy),
                damage: b.damage,
                color: b.color,
                radius: b.radius,
                life: R1(b.life)
            })),
            waterBoundaryX: this.state.waterBoundaryX,
            time: R1(this.state.time),
            screenShake: RI(this.state.screenShake),
            activeBoss: this.state.activeBoss ? {
                id: this.state.activeBoss.id,
                species: this.state.activeBoss.species,
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

        const payload = JSON.stringify({
            type: 'gameState',
            state: gameState
        });

        const dcOpen = this.dataChannel && this.dataChannel.readyState === 'open';
        const wsOpen = this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN;
        if (dcOpen) {
            try { this.dataChannel.send(payload); } catch (e) {}
        }
        // 3-4 player rooms: some peers only have the relay — broadcast there
        // too (clients dedupe by timestamp). Otherwise WS is just a fallback.
        const needRelay = (this._lobbyCount || 1) > 2;
        if (wsOpen && (needRelay || !dcOpen)) {
            const now = Date.now();
            if (needRelay || now - (this._lastFallbackSync || 0) > 150) {
                this._lastFallbackSync = now;
                try { this.signalingWs.send(payload); } catch (e) {}
            }
        }

        this.lastSentState = Date.now();
    },

    // Client -> host ack that it entered the game (both channels)
    sendGameStartAck() {
        const ack = JSON.stringify({ type: 'gameStartAck' });
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try { this.dataChannel.send(ack); } catch (e) {}
        }
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            try { this.signalingWs.send(ack); } catch (e) {}
        }
    },

    // Client -> host full-state request (both channels)
    sendSyncRequest() {
        const req = JSON.stringify({ type: 'syncRequest' });
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try { this.dataChannel.send(req); } catch (e) {}
        }
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            try { this.signalingWs.send(req); } catch (e) {}
        }
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
                if (!pl || pl.id === this.localClientId) continue;
                if (!pl.id || pl.id === 'peer') continue; // never render unknowns
                seen[pl.id] = true;
                const cur = this.state.remotePlayers[pl.id] || {};
                const firstSeen = !cur._seen;
                Object.assign(cur, pl, { _pid: pl.id, _seen: true });
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

            // Sync monsters
            if (remoteState.monstersOnLand) {
                this.syncMonsters(remoteState.monstersOnLand);
            }

            // Sync open-world enemies (host spawns them)
            if (remoteState.enemies) {
                this.syncEnemies(remoteState.enemies);
            }

            // Sync enemy skill shots (host simulates them)
            if (remoteState.projectiles) {
                this.syncProjectiles(remoteState.projectiles);
            }
            
            // Sync bullets
            if (remoteState.bullets) {
                this.syncBullets(remoteState.bullets);
            }

            // Sync host monster skill shots
            if (remoteState.enemyBullets) {
                this.syncEnemyBullets(remoteState.enemyBullets);
            }
            
            // Sync loot
            if (remoteState.groundLoot) {
                this.syncLoot(remoteState.groundLoot);
            }
            
            // Sync hazards
            if (remoteState.groundHazards) {
                this.syncHazards(remoteState.groundHazards);
            }
            
            // Sync delayed blasts
            if (remoteState.delayedBlasts) {
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
                    if (fh && fh.to === this.localClientId) this._applyFishHit(fh);
                }
            }
            
            // Sync boss
            if (remoteState.activeBoss) {
                this.syncBoss(remoteState.activeBoss);
            }
            
            // Screen shake
            if (remoteState.screenShake > this.state.screenShake) {
                this.state.screenShake = remoteState.screenShake;
            }
        }
    },
    
    // Sync monsters from host
    syncMonsters(remoteMonsters) {
        // Simple sync - replace with interpolation for smoother results
        this.state.monstersOnLand = remoteMonsters.map(m => ({
            ...m,
            species: this.findSpecies(m.species.id) || m.species
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
    
    // Sync loot (ids preserved for first-come delete messages)
    syncLoot(remoteLoot) {
        this.state.groundLoot = remoteLoot.map(l => ({
            ...l,
            species: this.findSpecies(l.species.id) || l.species
        }));
    },

    // Sync enemies from host
    syncEnemies(remoteEnemies) {
        this.state.enemies = remoteEnemies.map(e => {
            const out = { ...e, hitFlash: e.hitFlash || 0, vx: e.vx || 0, vy: e.vy || 0, leapH: e.leapH || 0 };
            if (e.enemyType === 'jumpingFish' && e.speciesId) {
                out.species = this.findSpecies(e.speciesId) || { id: e.speciesId, name: 'Fish', color: '#38bdf8', size: 16 };
            }
            return out;
        });
    },

    // Sync enemy skill shots from host (host simulates them).
    // Client's own hooked-fish shots (local:true) are preserved.
    syncProjectiles(remoteBullets) {
        const mine = (this.state.projectiles || []).filter(b => b.local);
        this.state.projectiles = (remoteBullets || []).map(b => ({ ...b, trail: [] }));
        for (const b of mine) this.state.projectiles.push(b);
    },

    // Sync hazards
    syncHazards(remoteHazards) {
        this.state.groundHazards = remoteHazards;
    },
    
    // Sync delayed blasts
    syncDelayedBlasts(remoteBlasts) {
        this.state.delayedBlasts = remoteBlasts;
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
        // Kill-credit award ack
        if (this._awardAckPending) {
            input.awardAck = this._awardAckPending;
            this._awardAckPending = null;
        }
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try { this.dataChannel.send(JSON.stringify({ type: 'playerInput', input })); } catch (e) {}
        } else if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            // Signaling fallback — throttled to ~10Hz
            const now = Date.now();
            if (now - (this._lastInputFallback || 0) > 100) {
                this._lastInputFallback = now;
                try { this.signalingWs.send(JSON.stringify({ type: 'playerInput', input })); } catch (e) {}
            }
        }
    },

    // Queue a locally-fired bullet for the host sim (client only)
    queueBullet(bullet) {
        if (!this._outboxBullets) this._outboxBullets = [];
        this._outboxBullets.push(bullet);
        if (this._outboxBullets.length > 40) this._outboxBullets.splice(0, this._outboxBullets.length - 40);
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
        const pid = (input && input._from) || playerId;
        if (!pid) return; // never file under a 'peer' key — that's the ghost bug
        if (!this.hostPeers[pid]) {
            this.hostPeerOrder.push(pid);
        }
        const rp = this.hostPeers[pid] || {};
        rp._lastUpdate = Date.now();
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
                if (!fh || !fh.to || !fh.bid) continue;
                // Hits on the HOST's own hooked fish apply right here —
                // the host never reads its own gameState snapshots.
                if (fh.to === this.localClientId) { this._applyFishHit(fh); continue; }
                const arr = this._fishHitOutbox[fh.to] || (this._fishHitOutbox[fh.to] = []);
                if (arr.some(x => x.bid === fh.bid)) continue;
                if (arr.length < 20) arr.push(fh);
            }
        }
        if (Array.isArray(input.fx) && input.fx.length && this.state) {
            this._suppressFxEmit = true;
            try { this._applyFx(input.fx); }
            finally { this._suppressFxEmit = false; }
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
                    slowHook: nb.slowHook, hitSet: new Set(), trail: []
                });
            }
        }
        // Player 2/3/4 by join order (host is Player 1)
        const idx = this.hostPeerOrder.indexOf(pid);
        rp.label = idx >= 0 ? `Player ${idx + 2}` : 'Player ?';
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
                    size: sp.size || 16,
                    shiny: !!sp.shiny,
                    pattern: sp.pattern || null,
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
        const msg = JSON.stringify({ type: 'lootDelete', lootId });
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try { this.dataChannel.send(msg); } catch (e) {}
        }
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            try { this.signalingWs.send(msg); } catch (e) {}
        }
    },

    handleLootDelete(fromId, lootId) {
        if (!this.isHost || !lootId) return;
        if (this.state.groundLoot) {
            this.state.groundLoot = this.state.groundLoot.filter(l => l.id !== lootId);
        }
    },

    // Client beached a fish: host spawns it as a SHARED monster (or shared
    // loot if already dead) so everyone sees and fights the same thing.
    sendBeachClaim(fish) {
        if (!this.isClient() || !fish || !fish.species) return false;
        const sp = fish.species;
        const msg = JSON.stringify({
            type: 'beachClaim',
            fish: {
                species: { id: sp.id, name: sp.name, value: sp.value, size: sp.size, shiny: !!sp.shiny, color: sp.color, rarity: sp.rarity, maxHp: sp.maxHp, attack: sp.attack, staminaMax: sp.staminaMax },
                x: Math.round(fish.x), y: Math.round(fish.y),
                hp: Math.round(fish.hp), isDead: !!fish.isDead
            }
        });
        let sent = false;
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try { this.dataChannel.send(msg); sent = true; } catch (e) {}
        }
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            try { this.signalingWs.send(msg); sent = true; } catch (e) {}
        }
        return sent;
    },

    handleBeachClaim(fromId, data) {
        if (!this.isHost || !data) return;
        let species = null;
        if (typeof FISH_SPECIES !== 'undefined' && data.species) {
            const base = FISH_SPECIES.find(s => s.id === data.species.id);
            if (base) {
                species = Object.assign({}, base);
                if (data.species.shiny) { species.shiny = true; species.name = data.species.name || species.name; species.value = data.species.value || species.value; }
                if (typeof data.species.size === 'number') species.size = data.species.size;
            }
        }
        if (!species && data.species) species = data.species;
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

    // Send game start signal (host only) — both channels so the client
    // gets it even when the WebRTC data channel isn't open yet.
    sendGameStart() {
        if (!this.isHost) return;
        const startData = JSON.stringify({ type: 'gameStart' });

        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try { this.dataChannel.send(startData); } catch (e) {}
        }
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            try { this.signalingWs.send(startData); } catch (e) {}
        }
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
    
    // Per-frame tick (cooldown-free since heal removal)
    update(delta) {
        void delta;
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
    
    // Handle disconnect
    handleDisconnect() {
        this.isConnected = false;
        this.stopStateSync();
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.dataChannel) {
            this.dataChannel = null;
        }
        
        this.updateStatus('Disconnected from server');
    },
    
    // Leave room
    leaveRoom() {
        if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify({ type: 'leaveRoom' }));
        }
        this.cleanup();
    },
    
    // Full cleanup
    cleanup() {
        this.stopStateSync();
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.dataChannel) {
            this.dataChannel = null;
        }
        
        if (this.signalingWs) {
            this.signalingWs.close();
            this.signalingWs = null;
        }
        
        this.isHost = false;
        this.isConnected = false;
        this.roomCode = null;
        this.localClientId = null;
        this.remoteClientId = null;
        this.remotePlayerState = null;
        this._lobbyCount = 1;
        this.hostPeers = {};
        this.hostPeerOrder = [];
        this._lastGameStateTs = 0;
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
        return {
            isHost: this.isHost,
            isConnected: this.isConnected,
            roomCode: this.roomCode,
            playerCount: this._lobbyCount || 1
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

        // Muzzle edge -> local puff so shots look the same everywhere
        // (the heavier smoke/sound already arrives via the shared FX tap).
        const flash = rp.muzzleFlash || 0;
        if (flash > 0.4 && !rp._wasFlashing && typeof Particles !== 'undefined' && this.state) {
            try {
                this._suppressFxEmit = true;
                Particles.spawnParticles(this.state, rp.rx + Math.cos(aimAngle) * 26, rp.ry + Math.sin(aimAngle) * 26, '#fbbf24', 3, { size: 3 });
            } catch (e) {}
            finally { this._suppressFxEmit = false; }
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
            if (def) Render.drawGun(ctx, { muzzleFlash: rp.muzzleFlash || 0, weaponRecoil: rp.weaponRecoil || 0, gunSkins: rp.gunSkins || {} }, def);
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

        // Name tag + HP bar (screen space)
        ctx.save();
        ctx.font = 'bold 12px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f472b6';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        const name = rp.label || (this.isHost ? 'Player 2' : 'Host');
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
                    pattern: (h.pattern !== undefined ? h.pattern : species.pattern) || null
                });
            }
            if (!species) {
                species = { id: h.id || 'remote', name: h.name || 'Fish', color: h.color || '#38bdf8', accent: h.color || '#38bdf8', shape: h.shape || 'oval', size: h.size || 16, rarity: h.rarity || 'common', shiny: !!h.shiny, pattern: h.pattern || null };
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