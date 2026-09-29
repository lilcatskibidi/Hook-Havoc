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
                    this.setupPeerConnection(false);
                    this.updateStatus(`Joined room: ${this.roomCode}`);
                    if (this._joinRoomResolve) {
                        this._joinRoomResolve();
                        this._joinRoomResolve = null;
                    }
                }
                break;
                
            case 'playerJoined':
                if (this.isHost) {
                    this.remoteClientId = msg.playerId;
                    this.onPlayerJoined(msg.playerId);
                    // Create offer for new player - small delay to let client set up peer connection
                    setTimeout(() => this.createOffer(), 300);
                }
                break;
                
            case 'playerLeft':
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
                this.sendLocalState();
                break;
            case 'gameStart':
                if (this.onGameStart) this.onGameStart();
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
    
    // Send local game state to peer
    sendLocalState() {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
        
        const p = this.state.player;
        const f = this.state.fishing;
        
        // Only send essential state for synchronization
        const gameState = {
            // Host player state (authoritative)
            player: {
                x: p.x,
                y: p.y,
                hp: p.hp,
                maxHp: p.maxHp,
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
                bobber: { x: f.bobber.x, y: f.bobber.y },
                lineTension: f.lineTension,
                hookedFish: f.hookedFish ? {
                    species: f.hookedFish.species,
                    x: f.hookedFish.x,
                    y: f.hookedFish.y,
                    hp: f.hookedFish.hp,
                    maxHp: f.hookedFish.maxHp,
                    stamina: f.hookedFish.stamina,
                    staminaMax: f.hookedFish.staminaMax,
                    dragState: f.hookedFish.dragState,
                    rotation: f.hookedFish.rotation,
                    isDead: f.hookedFish.isDead
                } : null,
                biteTimer: f.biteTimer,
                waitingTime: f.waitingTime
            },
            // World state
            monstersOnLand: this.state.monstersOnLand.map(m => ({
                id: m.id,
                species: m.species,
                x: m.x,
                y: m.y,
                hp: m.hp,
                maxHp: m.maxHp,
                aiState: m.aiState,
                isCharging: m.isCharging,
                phase: m.phase,
                isEnraged: m.isEnraged
            })),
            bullets: this.state.bullets.filter(b => b.owner === 'player').map(b => ({
                x: b.x,
                y: b.y,
                vx: b.vx,
                vy: b.vy,
                damage: b.damage,
                type: b.type,
                pierce: b.pierce,
                explosive: b.explosive,
                burn: b.burn
            })),
            groundLoot: this.state.groundLoot.map(l => ({
                species: l.species,
                x: l.x,
                y: l.y
            })),
            groundHazards: this.state.groundHazards.map(h => ({
                x: h.x,
                y: h.y,
                radius: h.radius,
                duration: h.duration,
                type: h.type,
                damagePerSec: h.damagePerSec,
                color: h.color
            })),
            delayedBlasts: this.state.delayedBlasts.map(b => ({
                x: b.x,
                y: b.y,
                radius: b.radius,
                damage: b.damage,
                timer: b.timer,
                color: b.color,
                leaveHazard: b.leaveHazard,
                hazardType: b.hazardType
            })),
            camera: {
                x: this.state.camera.x,
                y: this.state.camera.y,
                zoom: this.state.camera.zoom
            },
            waterBoundaryX: this.state.waterBoundaryX,
            time: this.state.time,
            screenShake: this.state.screenShake,
            activeBoss: this.state.activeBoss ? {
                id: this.state.activeBoss.id,
                species: this.state.activeBoss.species,
                x: this.state.activeBoss.x,
                y: this.state.activeBoss.y,
                hp: this.state.activeBoss.hp,
                maxHp: this.state.activeBoss.maxHp,
                phase: this.state.activeBoss.phase
            } : null,
            timestamp: Date.now()
        };
        
        this.dataChannel.send(JSON.stringify({
            type: 'gameState',
            state: gameState
        }));
        
        this.lastSentState = Date.now();
    },
    
    // Handle incoming game state (client receives from host)
    handleGameState(remoteState) {
        if (this.isHost) return; // Host doesn't receive state
        
        this.remotePlayerState = remoteState;
        
        // Apply remote state to local game (interpolation would be better but this works for LAN)
        this.applyRemoteState(remoteState);
    },
    
    // Apply remote state to local game
    applyRemoteState(remoteState) {
        // Update remote player visualization
        this.state.remotePlayer = remoteState.player;
        
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
    
    // Send player input to host
    sendInput(input) {
        if (this.isHost) return; // Host handles input locally
        
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'playerInput',
                input: input
            }));
        } else if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            // Fallback to signaling server
            this.signalingWs.send(JSON.stringify({
                type: 'playerInput',
                input: input
            }));
        }
    },
    
    // Handle player input (host receives from client)
    handlePlayerInput(playerId, input) {
        // Apply input to remote player simulation
        if (this.state.remotePlayer) {
            // Store for rendering remote player
            this.state.remotePlayer.input = input;
        }
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
    
    // Send game start signal (host only)
    sendGameStart() {
        if (!this.isHost) return;
        const startData = { type: 'gameStart' };
        
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(startData));
        } else if (this.signalingWs && this.signalingWs.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify(startData));
        }
    },
    
    // Start periodic state synchronization (host only)
    startStateSync() {
        if (!this.isHost) return;
        
        this.stateSendInterval = setInterval(() => {
            if (this.isConnected) {
                this.sendLocalState();
            }
        }, 50); // 20 updates per second
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
    
    // Handle remote disconnect
    handleRemoteDisconnect() {
        this.isConnected = false;
        this.remoteClientId = null;
        this.remotePlayerState = null;
        this.updateStatus('Other player disconnected');
        
        // Remove remote player visual
        this.state.remotePlayer = null;
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
        this.state.remotePlayer = null;
        
        this.updateStatus('Left multiplayer session');
    },
    
    // Get connection info for UI
    getConnectionInfo() {
        return {
            isHost: this.isHost,
            isConnected: this.isConnected,
            roomCode: this.roomCode,
            healsRemaining: this.sharedHeals - this.healsUsed,
            healCooldown: this.healCooldown
        };
    },
    
    // Render remote player
    renderRemotePlayer(ctx) {
        if (!this.state.remotePlayer || !this.isConnected) return;
        
        const rp = this.state.remotePlayer;
        const cam = this.state.camera;
        
        ctx.save();
        ctx.translate(rp.x, rp.y);
        
        // Determine aim angle from input or mouse
        let aimAngle = 0;
        if (rp.input) {
            aimAngle = Math.atan2(rp.input.mouseY - rp.y, rp.input.mouseX - rp.x);
        }
        ctx.rotate(aimAngle);
        
        // Draw player shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(2, 4, 16, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw player body (different color for remote)
        const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, 16);
        g.addColorStop(0, '#f472b6'); // Pink for remote player
        g.addColorStop(1, '#be185d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f472b6';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw weapon
        const w = rp.equippedWeapons && rp.equippedWeapons[rp.activeSlot];
        if (w) {
            const weaponDef = WEAPONS.find(wd => wd.id === w);
            if (weaponDef && typeof Render !== 'undefined' && Render.drawGun) {
                Render.drawGun(ctx, rp, weaponDef);
            }
        }
        
        ctx.restore();
        
        // Draw name tag
        ctx.save();
        ctx.font = 'bold 12px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f472b6';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        const name = this.isHost ? 'Player 2' : 'Host';
        ctx.strokeText(name, rp.x, rp.y - 35);
        ctx.fillText(name, rp.x, rp.y - 35);
        
        // HP bar
        const barW = 50;
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.fillRect(rp.x - barW / 2, rp.y - 45, barW, 5);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(rp.x - barW / 2, rp.y - 45, (rp.hp / rp.maxHp) * barW, 5);
        ctx.restore();
    }
};

// Make globally available
window.Multiplayer = Multiplayer;