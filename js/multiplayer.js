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
    return `${protocol}//${window.location.hostname}:8080`;
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
    
    // Healing system
    healCooldown: 0,
    healCooldownMax: 10, // seconds
    healAmount: 30,
    sharedHeals: 3, // max heals per player per session
    healsUsed: 0,
    
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
    onChatMessage: null,
    onHealReceived: null,
    onPlayerJoined: null,
    onPlayerLeft: null,
    onGameStart: null,
    onError: null,
    
    // Initialize multiplayer system
    init(state, callbacks = {}) {
        this.state = state;
        this.onStatusChange = callbacks.onStatusChange || (() => {});
        this.onChatMessage = callbacks.onChatMessage || (() => {});
        this.onHealReceived = callbacks.onHealReceived || (() => {});
        this.onPlayerJoined = callbacks.onPlayerJoined || (() => {});
        this.onPlayerLeft = callbacks.onPlayerLeft || (() => {});
        this.onGameStart = callbacks.onGameStart || (() => {});
        this.onError = callbacks.onError || ((msg) => console.error(msg));
        
        // Resolve the signaling server URL
        this.signalingUrl = resolveSignalingUrl();
        
        this.updateStatus('Ready to play multiplayer');
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
    connectSignaling() {
        return new Promise((resolve, reject) => {
            this.signalingWs = new WebSocket(this.signalingUrl);
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
                    reject(new Error('Cannot connect to signaling server. Make sure server.js is running.'));
                }
            };
            
            this.signalingWs.onclose = (event) => {
                console.log('Disconnected from signaling server', event.code, event.reason);
                if (!resolved) {
                    resolved = true;
                    reject(new Error('Signaling connection closed before handshake'));
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
                    reject(new Error('Signaling connection timeout'));
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
                
            case 'healRequest':
                this.handleHealRequest(msg.from, msg.targetId, msg.amount);
                break;
                
            case 'heal':
                // Direct heal from peer
                if (msg.targetId === this.localClientId || msg.targetId === 'all') {
                    this.applyHeal(this.localClientId, msg.amount);
                    this.onHealReceived(msg.amount, msg.from === this.localClientId);
                }
                break;
                
            case 'chat':
                this.onChatMessage(msg.from, msg.message, msg.isHost);
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
                this.handlePlayerInput(this.remoteClientId, msg.input);
                break;
            case 'healRequest':
                this.handleHealRequest(this.remoteClientId, msg.targetId, msg.amount);
                break;
            case 'chat':
                this.onChatMessage(this.remoteClientId, msg.message, false);
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

        // Lobby snapshots: host + every known peer (clients render all)
        const players = [this._packPlayer(p, this.localClientId || 'host', 'Host')];
        for (const [pid, rp] of Object.entries(this.hostPeers || {})) {
            if (rp && typeof rp.x === 'number') players.push(this._packPlayer(rp, pid, rp.label || 'Player ?'));
        }

        // Only send essential state for synchronization (quantized)
        const gameState = {
            players,
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
            groundLoot: this.state.groundLoot.map(l => ({
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
            timestamp: Date.now()
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
                seen[pl.id] = true;
                const cur = this.state.remotePlayers[pl.id] || {};
                Object.assign(cur, pl, { _pid: pl.id });
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
        
        // For non-host, we don't override local player but we sync world state
        if (!this.isHost) {
            // Sync monsters
            if (remoteState.monstersOnLand) {
                this.syncMonsters(remoteState.monstersOnLand);
            }
            
            // Sync bullets
            if (remoteState.bullets) {
                this.syncBullets(remoteState.bullets);
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
            
            // Sync fishing (if not locally fishing)
            if (remoteState.fishing && this.state.fishing.mode === 'IDLE') {
                this.syncFishing(remoteState.fishing);
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
    
    // Sync bullets
    syncBullets(remoteBullets) {
        // Remove old remote bullets, add new ones
        this.state.bullets = this.state.bullets.filter(b => b.owner === 'enemy');
        remoteBullets.forEach(b => {
            this.state.bullets.push({ ...b, owner: 'player', hitSet: new Set() });
        });
    },
    
    // Sync loot
    syncLoot(remoteLoot) {
        this.state.groundLoot = remoteLoot.map(l => ({
            ...l,
            species: this.findSpecies(l.species.id) || l.species
        }));
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
    
    // Send player input to host (client only) — throttled to ~15Hz
    sendInput(input) {
        if (this.isHost) return; // Host handles input locally

        const now = Date.now();
        if (now - (this._lastInputSent || 0) < 66) return;
        this._lastInputSent = now;
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
    
    // Handle player input (host receives from each client).
    // Positions every remote player so the host sees the whole lobby.
    handlePlayerInput(playerId, input) {
        if (!input) return;
        if (!this.hostPeers) this.hostPeers = {};
        if (!Array.isArray(this.hostPeerOrder)) this.hostPeerOrder = [];
        const pid = playerId || 'peer';
        if (!this.hostPeers[pid]) {
            this.hostPeerOrder.push(pid);
        }
        const rp = this.hostPeers[pid] || {};
        if (input.player && typeof input.player.x === 'number') {
            rp.x = input.player.x;
            rp.y = input.player.y;
            if (typeof input.player.hp === 'number') rp.hp = input.player.hp;
            if (typeof input.player.maxHp === 'number') rp.maxHp = input.player.maxHp;
            if (typeof input.player.facing !== 'undefined') rp.facing = input.player.facing;
            if (typeof input.player.activeSlot !== 'undefined') rp.activeSlot = input.player.activeSlot;
            if (input.player.equippedWeapons) rp.equippedWeapons = input.player.equippedWeapons;
        }
        if (input.mouse) rp.input = input;
        else if (input.mouseX !== undefined) rp.input = input;
        rp._pid = pid;
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

    // Compact player snapshot for the wire (quantized to cut bandwidth)
    _packPlayer(p, id, label) {
        return {
            id,
            label,
            x: Math.round(p.x || 0),
            y: Math.round(p.y || 0),
            hp: Math.round(p.hp || 0),
            maxHp: Math.round(p.maxHp || 100),
            facing: p.facing || 1,
            activeSlot: p.activeSlot || 0,
            equippedWeapons: p.equippedWeapons || []
        };
    },
    
    // Request heal for a player
    requestHeal(targetId, amount = this.healAmount) {
        if (this.healCooldown > 0) {
            this.updateStatus(`Heal on cooldown: ${this.healCooldown.toFixed(1)}s`);
            return false;
        }
        
        if (this.healsUsed >= this.sharedHeals) {
            this.updateStatus('No heals remaining this session');
            return false;
        }
        
        this.healCooldown = this.healCooldownMax;
        this.healsUsed++;
        
        const healData = {
            type: 'healRequest',
            targetId: targetId,
            amount: amount
        };
        
        // Send via data channel
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(healData));
        } else if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify(healData));
        }
        
        // Apply locally immediately for responsiveness
        this.applyHeal(targetId, amount);
        
        this.updateStatus(`Heal sent! (${this.sharedHeals - this.healsUsed} remaining)`);
        return true;
    },
    
    // Handle incoming heal request
    handleHealRequest(fromId, targetId, amount) {
        // If target is me, apply heal
        if (targetId === this.localClientId || targetId === 'all') {
            this.applyHeal(this.localClientId, amount);
            this.onHealReceived(amount, fromId === this.localClientId);
        }
    },
    
    // Apply heal to player
    applyHeal(targetId, amount) {
        if (typeof Player !== 'undefined' && Player.heal) {
            Player.heal(this.state, amount);
        } else {
            // Fallback
            const p = this.state.player;
            const oldHp = p.hp;
            p.hp = Math.min(p.maxHp, p.hp + amount);
            
            if (p.hp > oldHp) {
                if (typeof Particles !== 'undefined') {
                    Particles.showFloatingText(this.state, `+${p.hp - oldHp} HP`, p.x, p.y - 40, '#34d399');
                }
                if (typeof UI !== 'undefined' && UI.triggerDamageFlash) {
                    const el = document.getElementById('damage-flash');
                    if (el) {
                        el.style.background = 'rgba(52, 211, 153, 0.3)';
                        el.classList.remove('active');
                        void el.offsetWidth;
                        el.classList.add('active');
                        setTimeout(() => el.style.background = '', 300);
                    }
                }
                if (typeof Player !== 'undefined') {
                    Player.refreshHUD(this.state);
                }
            }
        }
    },
    
    // Send chat message
    sendChat(message) {
        const chatData = {
            type: 'chat',
            message: message
        };
        
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(chatData));
        } else if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify(chatData));
        }
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
    
    // Update heal cooldown
    update(delta) {
        if (this.healCooldown > 0) {
            this.healCooldown = Math.max(0, this.healCooldown - delta);
        }
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
            playerCount: this._lobbyCount || 1,
            healsRemaining: this.sharedHeals - this.healsUsed,
            healCooldown: this.healCooldown
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
        // Cheap smoothing between 12Hz snapshots (no extra bandwidth)
        if (typeof rp.rx !== 'number') { rp.rx = rp.x; rp.ry = rp.y; }
        rp.rx += (rp.x - rp.rx) * 0.35;
        rp.ry += (rp.y - rp.ry) * 0.35;
        const sx = (rp.rx - cam.x) * cam.zoom + canvas.width / 2;
        const sy = (rp.ry - cam.y) * cam.zoom + canvas.height / 2;
        const margin = 60;
        if (sx < -margin || sx > canvas.width + margin || sy < -margin || sy > canvas.height + margin) return;

        const sc = cam.zoom;
        ctx.save();
        ctx.translate(sx, sy);

        // Aim angle from input or mouse
        let aimAngle = 0;
        if (rp.input) {
            const ix = rp.input.mouseX !== undefined ? rp.input.mouseX : (rp.input.mouse && rp.input.mouse.worldX);
            const iy = rp.input.mouseY !== undefined ? rp.input.mouseY : (rp.input.mouse && rp.input.mouse.worldY);
            if (typeof ix === 'number' && typeof iy === 'number') {
                aimAngle = Math.atan2(iy - rp.y, ix - rp.x);
            }
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(2 * sc, 4 * sc, 16 * sc, 11 * sc, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body (pink = remote player)
        const g = ctx.createRadialGradient(-4 * sc, -4 * sc, 2, 0, 0, 16 * sc);
        g.addColorStop(0, '#f472b6');
        g.addColorStop(1, '#be185d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 16 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Gun rotated toward aim
        ctx.save();
        ctx.rotate(aimAngle);
        const w = rp.equippedWeapons && rp.equippedWeapons[rp.activeSlot];
        if (w) {
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 4 * sc;
            ctx.beginPath();
            ctx.moveTo(10 * sc, 0);
            ctx.lineTo(30 * sc, 0);
            ctx.stroke();
        }
        ctx.restore();
        ctx.restore();

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
    }
};

// Make globally available
window.Multiplayer = Multiplayer;