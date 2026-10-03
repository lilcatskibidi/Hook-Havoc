/**
 * PeerLink — PeerJS transport for Aquatic Havoc multiplayer (v1.2.0+).
 *
 * Replaces the old LAN-only WebSocket signaling server + hand-rolled
 * RTCPeerConnection code. Peers connect through the free PeerJS cloud
 * (0.peerjs.com), so a room works from anywhere — including itch.io —
 * with no localhost server. Game data still flows peer-to-peer over
 * WebRTC; the cloud only brokers the handshake.
 *
 * Room model (unchanged for players): the host claims a fixed PeerJS id
 *   `aquatic-havoc-v<VERSION>-<CODE>` (e.g. aquatic-havoc-v120-AB7K).
 * The version digits are baked into the id, so different game versions
 * can never even find each other's rooms; the hello handshake carries
 * an explicit version string too, for a human-readable reject message.
 * Topology stays star-shaped (max 4): clients only ever connect to the
 * host, and the host relays client<->client traffic (announces, skins).
 *
 * Also in this file:
 *   PeerSkins    — shares per-PC custom art (fish/gun/bobber PNG uploads)
 *                  so every peer renders the SAME pixels. Rule: your own
 *                  local art always wins on your screen; remote art only
 *                  fills slots where you have none. Session-only, never
 *                  written to your localStorage.
 *   PeerAnnounce — mirrors catch popups + boss banners so all peers see
 *                  the same text/colors. Local Settings (day/night FX,
 *                  particles, shake, volumes) intentionally stay per-client,
 *                  so screens may differ slightly there — by design.
 */

function peerRoomPrefix() {
    try {
        const v = (typeof GAME_VERSION === 'string' && GAME_VERSION) ? GAME_VERSION : '1.2.5';
        return 'aquatic-havoc-v' + String(v).replace(/[^0-9]/g, '') + '-';
    } catch (e) {
        return 'aquatic-havoc-v125-';
    }
}

function peerGameVersion() {
    try {
        return (typeof GAME_VERSION === 'string' && GAME_VERSION) ? GAME_VERSION : '1.2.5';
    } catch (e) {
        return '1.2.5';
    }
}

const PeerLink = {
    peer: null,
    myId: null,
    roomCode: null,
    isHost: false,
    conns: {},        // host side: remotePeerId -> DataConnection
    hostConn: null,   // client side: connection to host
    members: [],      // host side: [remotePeerId, ...] in join order
    memberNames: {},  // host side: remotePeerId -> display name
    cloud: 'idle',    // idle|connecting|online|error
    cloudError: '',
    _helloTimers: {},

    // Wired by Multiplayer.init()
    onMessage: null,      // (msg, fromId) => void
    onMemberJoin: null,   // (peerId) => void      (host side)
    onMemberLeave: null,  // (peerId) => void
    onHostLeft: null,     // () => void            (client side)
    onCloudStatus: null,  // (status, error) => void

    CODE_ALPHABET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',

    genCode() {
        let s = '';
        for (let i = 0; i < 4; i++) {
            s += this.CODE_ALPHABET[Math.floor(Math.random() * this.CODE_ALPHABET.length)];
        }
        return s;
    },

    ensureLib() {
        if (typeof Peer === 'undefined') {
            throw new Error('PeerJS library not loaded (CDN blocked?). Check your connection and reload.');
        }
    },

    _setCloud(status, err) {
        this.cloud = status;
        this.cloudError = err || '';
        try { if (this.onCloudStatus) this.onCloudStatus(status, this.cloudError); } catch (e) {}
    },

    _waitFor(peer, event, timeoutMs) {
        return new Promise((resolve, reject) => {
            let done = false;
            const timer = setTimeout(() => {
                if (done) return;
                done = true;
                reject(new Error('timeout'));
            }, timeoutMs);
            peer.once(event, (...args) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(args);
            });
        });
    },

    // ---- PeerJS constructor options (NAT traversal) ----
    // Default cloud (0.peerjs.com) ships Google STUN only and NO TURN
    // (free TURN was discontinued) — two players behind strict NATs can
    // reach the cloud yet never open the P2P channel. Extra public STUNs
    // help many of those cases; symmetric NAT still needs a TURN server.
    // Override without code edits:
    //   window.PEER_CONFIG = { config: { iceServers: [...] } }
    // or localStorage `ah_peer_ice` = JSON array of {urls,username?,credential?}.
    DEFAULT_STUN: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478',
    ],

    peerOptions(idOrUndefined) {
        const iceServers = this.DEFAULT_STUN.map(u => ({ urls: u }));
        try {
            const raw = localStorage.getItem('ah_peer_ice');
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length) {
                    return { debug: 0, config: { iceServers: arr.slice(0, 8) } };
                }
            }
        } catch (e) {}
        let opt = { debug: 0, config: { iceServers } };
        try {
            if (typeof window !== 'undefined' && window.PEER_CONFIG && typeof window.PEER_CONFIG === 'object') {
                opt = Object.assign({}, opt, window.PEER_CONFIG);
            }
        } catch (e) {}
        return opt;
    },

    // ---- Host: claim `prefix+code` as our peer id -------------------------
    async hostRoom(maxTries) {
        this.ensureLib();
        this.destroy();
        maxTries = maxTries || 6;
        let lastErr = null;
        for (let attempt = 0; attempt < maxTries; attempt++) {
            const code = this.genCode();
            try {
                await this._claimRoom(code);
                return code;
            } catch (e) {
                lastErr = e;
                // Code collision: someone else already hosts this code.
                if (e && e._peerTaken) continue;
                throw e;
            }
        }
        throw lastErr || new Error('Could not claim a room code. Try again.');
    },

    _claimRoom(code) {
        return new Promise((resolve, reject) => {
            let peer = null;
            let settled = false;
            const fail = (err) => {
                if (settled) return;
                settled = true;
                try { if (peer) peer.destroy(); } catch (e) {}
                reject(err);
            };
            try {
                this._setCloud('connecting');
                peer = new Peer(peerRoomPrefix() + code, this.peerOptions());
            } catch (e) {
                this._setCloud('error', String((e && e.message) || e));
                fail(e);
                return;
            }
            peer.once('open', (id) => {
                if (settled) return;
                settled = true;
                this.peer = peer;
                this.myId = id;
                this.roomCode = code;
                this.isHost = true;
                this.conns = {};
                this.members = [];
                this._setCloud('online');
                peer.on('connection', (conn) => this._onInbound(conn));
                peer.on('disconnected', () => {
                    // Lost the cloud socket (game data keeps flowing P2P).
                    this._setCloud('connecting', 'reconnecting to cloud…');
                    try { peer.reconnect(); } catch (e) {}
                });
                peer.on('error', (err) => this._onPeerError(err, false));
                resolve(code);
            });
            peer.once('error', (err) => {
                // Claim-phase errors: only 'unavailable-id' is retryable.
                if (settled) return;
                const type = err && err.type;
                if (type === 'unavailable-id') {
                    const clash = new Error('code taken');
                    clash._peerTaken = true;
                    fail(clash);
                } else {
                    fail(new Error(this._friendlyPeerError(err)));
                }
            });
            // If the cloud never answers, don't hang the UI.
            setTimeout(() => {
                if (!settled) fail(new Error('PeerJS cloud unreachable (offline?). Try again.'));
            }, 12000);
        });
    },

    // ---- Client: join a host's room ---------------------------------------
    async joinRoom(code) {
        this.ensureLib();
        this.destroy();
        code = String(code || '').toUpperCase().trim();
        if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error('Enter the 4-character room code.');
        return new Promise((resolve, reject) => {
            let settled = false;
            let peer = null;
            let conn = null;
            // Timer guards, declared FIRST: every fail path (including the
            // synchronous `new Peer` throw below) touches them, so a later
            // declaration would throw a TDZ ReferenceError.
            let openTimer = null;
            const clearOpen = () => { try { if (openTimer) clearTimeout(openTimer); openTimer = null; } catch (e) {} };
            const fail = (err) => {
                if (settled) return;
                settled = true;
                clearOpen();
                // Null FIRST: conn.close() can fire 'close' synchronously,
                // and the handler must not mistake our own teardown for
                // "Host left the game".
                this._welcomed = false;
                const c = conn, p = peer;
                conn = null;
                this.peer = null;
                this.hostConn = null;
                try { if (c) c.close(); } catch (e) {}
                try { if (p) p.destroy(); } catch (e) {}
                reject(err);
            };
            const win = (welcome) => {
                if (settled) return;
                settled = true;
                this.isHost = false;
                this.roomCode = code;
                this._welcomed = true;
                resolve(welcome);
            };
            try {
                this._setCloud('connecting');
                peer = new Peer(undefined, this.peerOptions());
            } catch (e) {
                this._setCloud('error', String((e && e.message) || e));
                fail(e);
                return;
            }
            const overallTimeout = setTimeout(() => {
                fail(new Error('Room not found — check the code and make sure the host is on v' + peerGameVersion() + '.'));
            }, 20000);
            const clearOverall = () => { try { clearTimeout(overallTimeout); } catch (e) {} clearOpen(); };
            peer.once('open', (id) => {
                this.peer = peer;
                this.myId = id;
                this._setCloud('online');
                peer.on('disconnected', () => {
                    this._setCloud('connecting', 'reconnecting to cloud…');
                    try { peer.reconnect(); } catch (e) {}
                });
                peer.on('error', (err) => this._onPeerError(err, true));
                try {
                    conn = peer.connect(peerRoomPrefix() + code, { reliable: true });
                } catch (e) {
                    clearOverall();
                    fail(e);
                    return;
                }
                if (!conn) {
                    clearOverall();
                    fail(new Error('Could not open a connection to the room.'));
                    return;
                }
                this.hostConn = conn;
                // P2P-blocked watchdog: cloud OK + room EXISTS (no
                // peer-unavailable) but the DataChannel never opens in
                // 10s = NAT/firewall in the way, NOT a wrong code. Without
                // this the 20s overall timeout misreports "Room not found".
                openTimer = setTimeout(() => {
                    if (!settled) {
                        clearOverall();
                        fail(new Error('P2P channel blocked — the room exists, but your networks cannot connect directly (NAT/firewall). Same WiFi usually works; otherwise the host needs a TURN server (see Feedback panel).'));
                    }
                }, 10000);
                conn.once('open', () => {
                    // Identity rides the hello: this TAB's transport id +
                    // this TAB's pilot name (session-scoped, never another
                    // tab's localStorage value) + STABLE per-browser pid so
                    // the host can scope saves per server population.
                    let nm = '';
                    let spid = '';
                    try {
                        nm = (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
                            ? Multiplayer.playerName() : '';
                        spid = (typeof Multiplayer !== 'undefined' && Multiplayer.localPid)
                            ? Multiplayer.localPid() : '';
                    } catch (e) {}
                    this._sendDirect(conn, { t: 'hello', v: peerGameVersion(), id, name: nm, pid: spid });
                    // The host answers with welcome/reject (handled below).
                });
                conn.on('data', (msg) => {
                    try {
                        if (msg && msg.t === 'welcome') {
                            clearOverall();
                            win(msg);
                        } else if (msg && msg.t === 'reject') {
                            clearOverall();
                            fail(new Error(msg.why || 'Join rejected by host.'));
                        } else if (msg) {
                            try { if (this.onMessage) this.onMessage(msg, 'host'); } catch (e) {}
                        }
                    } catch (e) {}
                });
                conn.once('close', () => {
                    if (!settled) {
                        clearOverall();
                        fail(new Error('Room not found — check the code and make sure the host is on v' + peerGameVersion() + '.'));
                    } else if (this._welcomed && this.hostConn === conn) {
                        // Genuine host disconnect mid-session (failed joins
                        // never set _welcomed, and our own Leave nulls
                        // hostConn in destroy() before close lands).
                        this.hostConn = null;
                        try { if (this.onHostLeft) this.onHostLeft(); } catch (e) {}
                    } else {
                        this.hostConn = null;
                    }
                });
                conn.once('error', () => {
                    if (!settled) {
                        clearOverall();
                        fail(new Error('Room not found — check the code and make sure the host is on v' + peerGameVersion() + '.'));
                    }
                });
            });
            peer.once('error', (err) => {
                if (settled) return;
                const type = err && err.type;
                if (type === 'peer-unavailable') {
                    clearOverall();
                    fail(new Error('Room not found — check the code and make sure the host is on v' + peerGameVersion() + '.'));
                } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
                    clearOverall();
                    fail(new Error('PeerJS cloud unreachable (offline?). Try again.'));
                }
                // Other errors (e.g. transient) are reported via peer.on('error') too;
                // the overall timeout above is the final backstop.
            });
        });
    },

    // ---- Inbound (host side) ------------------------------------------------
    _onInbound(conn) {
        if (!conn) return;
        const remoteId = conn.peer;
        let helloOk = false;
        // Must say hello quickly or it's a stray connection.
        const helloTimer = setTimeout(() => {
            if (!helloOk) { try { conn.close(); } catch (e) {} }
        }, 8000);
        try { this._helloTimers[remoteId] = helloTimer; } catch (e) {}
        conn.on('open', () => {
            // Channel ready: if the hello already arrived (admitted
            // member), flush a snapshot now — the admit-time unicast may
            // have hit a not-yet-open channel and queued nothing.
            try {
                if (this.isHost && this.conns[conn.peer] &&
                    typeof Multiplayer !== 'undefined' && Multiplayer.sendStateTo) {
                    Multiplayer.sendStateTo(conn.peer);
                }
            } catch (e) {}
        });
        conn.on('data', (msg) => {
            try {
                if (msg && msg.t === 'hello') {
                    helloOk = true;
                    try { clearTimeout(helloTimer); } catch (e) {}
                    this._admitMember(conn, msg);
                    return;
                }
                if (!helloOk) return; // ignore pre-hello chatter
                try { if (this.onMessage) this.onMessage(msg, remoteId); } catch (e) {}
            } catch (e) {}
        });
        const drop = () => {
            try { clearTimeout(helloTimer); } catch (e) {}
            try { delete this._helloTimers[remoteId]; } catch (e) {}
            if (helloOk) this._removeMember(remoteId);
        };
        conn.on('close', drop);
        conn.on('error', drop);
    },

    // This tab's stable per-browser pid — the SERVER identity clients
    // scope their per-host character files against.
    _hostPid() {
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.localPid) {
                return Multiplayer.localPid() || '';
            }
        } catch (e) {}
        return '';
    },

    _cleanName(name, fallback) {        try {
            name = String(name || '').replace(/[<>&"']/g, '').trim().slice(0, 12);
            return name || fallback;
        } catch (e) { return fallback; }
    },

    _roster() {
        // [{id, name}] in join order — the lobby + tags read this.
        try {
            const out = [];
            for (const id of (this.members || [])) {
                out.push({ id, name: this.memberNames[id] || ('Player-' + String(id).slice(-4)) });
            }
            return out;
        } catch (e) { return []; }
    },

    _admitMember(conn, hello) {
        const remoteId = conn.peer;
        const hv = (hello && hello.v) || '?';
        if (hv !== peerGameVersion()) {
            try {
                conn.send({ t: 'reject', why: 'Version mismatch — host is on v' + peerGameVersion() + ', you are on v' + hv + '. Update the game and try again.' });
            } catch (e) {}
            setTimeout(() => { try { conn.close(); } catch (e) {} }, 400);
            return;
        }
        if (Object.keys(this.conns).length >= 3) {
            try { conn.send({ t: 'reject', why: 'Room is full (4 players max).' }); } catch (e) {}
            setTimeout(() => { try { conn.close(); } catch (e) {} }, 400);
            return;
        }
        // Duplicate-name guard: every pilot in the room needs a unique
        // name (host acts as the mini-server roster authority). The
        // joiner must pick another name BEFORE entering the room.
        try {
            const want = this._cleanName(hello && hello.name, '');
            let hostName = 'Host';
            try {
                hostName = (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
                    ? (Multiplayer.playerName() || 'Host') : 'Host';
            } catch (e) {}
            // Belt + suspenders: the frozen room name AND the live read
            // (both are this TAB's own session name — never another tab's).
            let frozen = '';
            try { frozen = (typeof Multiplayer !== 'undefined' && Multiplayer._hostPilot) || ''; } catch (e) {}
            const taken = [String(hostName || '').toLowerCase()];
            if (frozen) taken.push(String(frozen).toLowerCase());
            for (const id of Object.keys(this.memberNames || {})) {
                taken.push(String(this.memberNames[id] || '').toLowerCase());
            }
            if (want && taken.includes(String(want).toLowerCase())) {
                try { conn.send({ t: 'reject', why: 'Name taken — "' + want + '" is already in this room. Change your pilot name before joining.' }); } catch (e) {}
                setTimeout(() => { try { conn.close(); } catch (e) {} }, 400);
                return;
            }
        } catch (e) {}
        this.conns[remoteId] = conn;
        if (!this.members.includes(remoteId)) this.members.push(remoteId);
        // Remember their chosen name (fallback: short peer id).
        try {
            this.memberNames[remoteId] = this._cleanName(hello && hello.name, 'Player-' + String(remoteId).slice(-4));
        } catch (e) {}
        const count = 1 + Object.keys(this.conns).length;
        let hostName = '';
        try {
            hostName = (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
                ? (Multiplayer.playerName() || 'Host') : 'Host';
        } catch (e) { hostName = 'Host'; }
        try {
            conn.send({ t: 'welcome', room: this.roomCode, id: remoteId, count, members: this.members.slice(), roster: this._roster(), hostName, hostPid: this._hostPid(), v: peerGameVersion() });
        } catch (e) {}
        this._broadcastLobby();
        try { if (this.onMemberJoin) this.onMemberJoin(remoteId); } catch (e) {}
    },

    _removeMember(remoteId) {
        let changed = false;
        if (this.conns[remoteId]) { delete this.conns[remoteId]; changed = true; }
        try { delete this.memberNames[remoteId]; } catch (e) {}
        const i = this.members.indexOf(remoteId);
        if (i >= 0) { this.members.splice(i, 1); changed = true; }
        if (changed) {
            this._broadcastLobby();
            try { if (this.onMemberLeave) this.onMemberLeave(remoteId); } catch (e) {}
        }
    },

    _broadcastLobby() {
        const count = 1 + Object.keys(this.conns).length;
        let hostName = 'Host';
        try {
            hostName = (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
                ? (Multiplayer.playerName() || 'Host') : 'Host';
        } catch (e) {}
        this.broadcast({ t: 'lobby', count, members: this.members.slice(), roster: this._roster(), hostName, v: peerGameVersion() });
    },

    memberCount() {
        return 1 + Object.keys(this.conns || {}).length;
    },

    // ---- Sending ------------------------------------------------------------
    // The last send failure reason (read by Multiplayer for honest logs —
    // PeerJS throws inside conn.send for closed/oversize payloads).
    _lastSendError: '',

    lastSendError() {
        return this._lastSendError || '';
    },

    _sendDirect(conn, obj) {
        this._lastSendError = '';
        try {
            if (conn && conn.open) { conn.send(obj); return true; }
            this._lastSendError = !conn ? 'no conn' : 'not open';
        } catch (e) {
            this._lastSendError = 'threw: ' + String((e && e.message) || e).slice(0, 140);
        }
        return false;
    },

    sendToHost(obj) {
        return this._sendDirect(this.hostConn, obj);
    },

    sendTo(peerId, obj) {
        if (!this.isHost) return false;
        return this._sendDirect(this.conns[peerId], obj);
    },

    broadcast(obj) {
        if (!this.isHost) return 0;
        let n = 0;
        for (const id of Object.keys(this.conns)) {
            if (this._sendDirect(this.conns[id], obj)) n++;
        }
        return n;
    },

    // Host relay: forward one member's message to everyone else (or to
    // a single target for skin-request / skin-chunk via `to`).
    relay(obj, fromId) {
        if (!this.isHost) return 0;
        if (obj && typeof obj.to === 'string' && obj.to && this.conns[obj.to]) {
            return this._sendDirect(this.conns[obj.to], obj) ? 1 : 0;
        }
        let n = 0;
        for (const id of Object.keys(this.conns)) {
            if (id === fromId) continue;
            if (this._sendDirect(this.conns[id], obj)) n++;
        }
        return n;
    },

    // ---- Misc ----------------------------------------------------------------
    _friendlyPeerError(err) {
        const type = err && err.type;
        if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
            return 'PeerJS cloud unreachable (offline?). Try again.';
        }
        if (type === 'peer-unavailable') {
            return 'Room not found — check the code and make sure the host is on v' + peerGameVersion() + '.';
        }
        if (type === 'unavailable-id') return 'Room code collision — retrying.';
        if (type === 'browser-incompatible') return 'This browser cannot do WebRTC (needed for multiplayer).';
        return (err && err.message) || 'Peer connection error.';
    },

    _onPeerError(err, isClient) {
        const type = err && err.type;
        // Claim-phase 'unavailable-id' is consumed by _claimRoom's own
        // handler; post-open ones just mean a ghost retry — ignore.
        if (!this.peer) return;
        try {
            if (typeof Multiplayer !== 'undefined' && Multiplayer.mpLog && type &&
                type !== 'unavailable-id') {
                Multiplayer.mpLog('cloud-error', 'PeerJS: ' + type);
            }
        } catch (e) {}
        if (type === 'peer-unavailable' && isClient && !this.roomCode) {
            this._setCloud('error', this._friendlyPeerError(err));
            return;
        }
        if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
            this._setCloud('error', this._friendlyPeerError(err));
        }
        // 'unavailable-id' after open (duplicate tab hosting same code),
        // 'invalid-id', etc: surface quietly, keep session alive.
        try { console.warn('[PeerLink]', type || err); } catch (e) {}
    },

    // Lightweight cloud reachability probe for the menu status box.
    async warmup(timeoutMs) {
        this.ensureLib();
        if (this.peer) {
            this._setCloud('online');
            return true;
        }
        return new Promise((resolve) => {
            let probe = null;
            let done = false;
            const finish = (ok, err) => {
                if (done) return;
                done = true;
                try { if (probe) probe.destroy(); } catch (e) {}
                if (ok) this._setCloud('online');
                else this._setCloud('error', err || 'unreachable');
                resolve(ok);
            };
            try {
                this._setCloud('connecting');
                probe = new Peer(this.peerOptions());
            } catch (e) {
                finish(false, String((e && e.message) || e));
                return;
            }
            probe.once('open', () => finish(true));
            probe.once('error', () => finish(false, 'PeerJS cloud unreachable (offline?).'));
            setTimeout(() => finish(false, 'PeerJS cloud timeout — still offline?'), timeoutMs || 9000);
        });
    },

    destroy() {
        this._welcomed = false;        try {
            for (const id of Object.keys(this._helloTimers || {})) {
                try { clearTimeout(this._helloTimers[id]); } catch (e) {}
            }
        } catch (e) {}
        this._helloTimers = {};
        try {
            for (const id of Object.keys(this.conns || {})) {
                try { this.conns[id].close(); } catch (e) {}
            }
        } catch (e) {}
        try { if (this.hostConn) this.hostConn.close(); } catch (e) {}
        try { if (this.peer) this.peer.destroy(); } catch (e) {}
        this.peer = null;
        this.myId = null;
        this.roomCode = null;
        this.isHost = false;
        this.conns = {};
        this.hostConn = null;
        this.members = [];
        this.memberNames = {};
        this._setCloud('idle');
    }
};

window.PeerLink = PeerLink;

/* ====================================================================
 * PeerSkins — custom-art sync so every peer renders the SAME pixels.
 *
 * Each PC keeps its own uploads in localStorage (ah_fishimg_*,
 * ah_gunskin_*, ah_bobber_*). At session start every peer publishes a
 * manifest; peers pull the items they lack, in ~30KB chunks, relayed
 * through the host. RULE: your own local art always wins on YOUR
 * screen (body/shop/hotbar); a FOREIGN body wears ONLY its owner's art
 * (PeerSkins.remote per-owner registry, resolved in drawGun). Remote
 * art is session-only, never written to your localStorage.
 * ================================================================== */
const PeerSkins = {
    CHUNK: 30000,
    MAX_ITEM_BYTES: 350000,
    MAX_TOTAL_BYTES: 4 * 1024 * 1024,

    _inflight: {},   // `${from}:${kind}:${id}` -> {parts, total, timer}
    _progress: { got: 0, total: 0 },
    onProgress: null, // (got, total) => void
    // Remote art per OWNER: remote[kind][id][pid] = Image. Never merged
    // into the shared loader caches — your shop/hotbar/body always render
    // YOUR art, while foreign bodies render THEIR owner's art (global
    // hold, per-holder skins). Session-only, never localStorage.
    remote: { fish: {}, gun: {}, bobber: {} },

    _loaders() {
        const out = {};
        try {
            if (typeof FishImageLoader !== 'undefined' && FishImageLoader.cache) {
                out.fish = { loader: FishImageLoader, prefix: 'ah_fishimg_' };
            }
        } catch (e) {}
        try {
            if (typeof GunSkinLoader !== 'undefined' && GunSkinLoader.cache) {
                out.gun = { loader: GunSkinLoader, prefix: 'ah_gunskin_' };
            }
        } catch (e) {}
        try {
            if (typeof BobberLoader !== 'undefined' && BobberLoader.cache) {
                out.bobber = { loader: BobberLoader, prefix: 'ah_bobber_' };
            }
        } catch (e) {}
        return out;
    },

    _hash(s) {
        let h = 5381;
        for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
        return (h >>> 0).toString(16);
    },

    // Everything THIS pc customized (localStorage = owned art).
    collectLocal() {
        const items = [];
        let bytes = 0;
        try {
            const loaders = this._loaders();
            for (const kind of Object.keys(loaders)) {
                const { prefix } = loaders[kind];
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.indexOf(prefix) === 0) keys.push(k);
                }
                keys.sort();
                for (const k of keys) {
                    let url = null;
                    try { url = localStorage.getItem(k); } catch (e) {}
                    if (!url || typeof url !== 'string' || url.length < 100) continue;
                    if (url.length > this.MAX_ITEM_BYTES) continue; // too big to share
                    if (bytes + url.length > this.MAX_TOTAL_BYTES) break;
                    bytes += url.length;
                    items.push({ kind, id: k.slice(prefix.length), hash: this._hash(url), len: url.length });
                }
            }
        } catch (e) {}
        return items;
    },

    _localDataUrl(kind, id) {
        try {
            const loaders = this._loaders();
            const L = loaders[kind];
            if (!L) return null;
            return localStorage.getItem(L.prefix + id);
        } catch (e) {
            return null;
        }
    },

    _hasLocal(kind, id) {
        try {
            const loaders = this._loaders();
            const L = loaders[kind];
            if (!L) return false;
            return !!localStorage.getItem(L.prefix + id);
        } catch (e) {
            return false;
        }
    },

    _cacheHas(kind, id) {
        try {
            const loaders = this._loaders();
            const L = loaders[kind];
            return !!(L && L.loader.cache && L.loader.cache.has(id));
        } catch (e) {
            return false;
        }
    },

    // Items in a manifest that we actually want to pull: art we neither
    // own locally NOR already hold from that same owner.
    _needed(manifest, owner) {
        const out = [];
        if (!Array.isArray(manifest)) return out;
        for (const it of manifest) {
            if (!it || !it.kind || !it.id) continue;
            if (this._hasLocal(it.kind, it.id)) continue;  // mine wins
            if (this._cacheHas(it.kind, it.id)) continue;  // already have
            try {
                const slot = (this.remote[it.kind] || {})[it.id];
                if (slot && owner && slot[owner]) continue; // have THEIR copy
            } catch (e) {}
            out.push(it);
        }
        return out;
    },

    _bumpProgress(got, total) {
        this._progress.got = got;
        this._progress.total = total;
        try { if (this.onProgress) this.onProgress(got, total); } catch (e) {}
    },

    progressText() {
        const p = this._progress;
        if (!p.total) return '';
        if (p.got >= p.total) return '';
        return '🎨' + p.got + '/' + p.total;
    },

    resetProgress() {
        this._progress = { got: 0, total: 0 };
        try { if (this.onProgress) this.onProgress(0, 0); } catch (e) {}
    },

    // Called by both host and client right after the game starts.
    startSession() {
        this.resetProgress();
        try {
            const items = this.collectLocal();
            if (typeof Multiplayer === 'undefined') return;
            // Identity fallback is the STABLE per-browser pid (never the
            // shared 'me' placeholder — two id-less peers must not collide).
            const me = Multiplayer.localClientId || (Multiplayer.localPid && Multiplayer.localPid()) || 'me';
            if (Multiplayer.isHost) {
                // Host already knows every member: push my manifest out.
                PeerLink.broadcast({ t: 'skin-manifest', from: me, items });
                this._expect(items.length ? 0 : 0, 0);
            } else {
                PeerLink.sendToHost({ t: 'skin-manifest', from: me, items });
            }
        } catch (e) {}
    },

    _expect(got, total) {
        // Placeholder for symmetry; real totals come from manifests.
        this._bumpProgress(got, total);
    },

    // A manifest arrived (possibly relayed). Pull what we lack.
    onManifest(msg) {
        try {
            if (!msg || !Array.isArray(msg.items)) return;
            const owner = msg.from;
            if (!owner) return;
            const myId = (typeof Multiplayer !== 'undefined' && (Multiplayer.localClientId || (Multiplayer.localPid && Multiplayer.localPid()))) || null;
            if (owner === myId) return; // never pull our own art back
            const need = this._needed(msg.items, owner).slice(0, 24); // per-peer cap
            if (!need.length) return;
            const p = this._progress;
            this._bumpProgress(p.got, p.total + need.length);
            // Stagger requests so a 4-player room doesn't burst.
            need.forEach((it, i) => {
                setTimeout(() => {
                    try {
                        const me2 = (typeof Multiplayer !== 'undefined' && (Multiplayer.localClientId || (Multiplayer.localPid && Multiplayer.localPid()))) || 'me';
                        const req = { t: 'skin-request', from: me2, to: owner, kind: it.kind, id: it.id };
                        if (typeof Multiplayer !== 'undefined' && Multiplayer.isHost) PeerLink.sendTo(owner, req);
                        else PeerLink.sendToHost(req);
                    } catch (e) {}
                }, i * 150);
            });
        } catch (e) {}
    },

    // The owner answers a request with chunked data.
    onRequest(msg) {
        try {
            if (!msg || !msg.kind || !msg.id) return;
            if (!msg.from) {
                try { if (typeof Multiplayer !== 'undefined' && Multiplayer.mpLog) Multiplayer.mpLog('skin-fail', 'skin-request without sender id — dropped'); } catch (e) {}
                return;
            }
            const url = this._localDataUrl(msg.kind, msg.id);
            if (!url) return; // no longer have it (or never did)
            const total = Math.max(1, Math.ceil(url.length / this.CHUNK));
            const me3 = (typeof Multiplayer !== 'undefined' && (Multiplayer.localClientId || (Multiplayer.localPid && Multiplayer.localPid()))) || 'host';
            for (let seq = 0; seq < total; seq++) {
                const chunk = {
                    t: 'skin-chunk', from: me3,
                    to: msg.from, kind: msg.kind, id: msg.id,
                    seq, total, hash: this._hash(url),
                    data: url.slice(seq * this.CHUNK, (seq + 1) * this.CHUNK)
                };
                if (typeof Multiplayer !== 'undefined' && Multiplayer.isHost) PeerLink.sendTo(msg.from, chunk);
                else PeerLink.sendToHost(chunk);
            }
        } catch (e) {}
    },

    onChunk(msg) {
        try {
            if (!msg || !msg.kind || !msg.id || typeof msg.data !== 'string') return;
            const key = (msg.from || '?') + ':' + msg.kind + ':' + msg.id;
            let slot = this._inflight[key];
            if (!slot || slot.total !== msg.total || slot.hash !== msg.hash) {
                if (slot && slot.timer) { try { clearTimeout(slot.timer); } catch (e) {} }
                slot = this._inflight[key] = {
                    parts: new Array(msg.total).fill(null),
                    total: msg.total, hash: msg.hash, got: 0, timer: null
                };
                slot.timer = setTimeout(() => { try { delete this._inflight[key]; } catch (e) {} }, 45000);
            }
            if (slot.parts[msg.seq] === null) {
                slot.parts[msg.seq] = msg.data;
                slot.got++;
            }
            if (slot.got >= slot.total) {
                try { clearTimeout(slot.timer); } catch (e) {}
                delete this._inflight[key];
                const url = slot.parts.join('');
                if (this._hash(url) !== slot.hash) return; // corrupted, drop
                this.applyRemote(msg.kind, msg.id, url, msg.from);
            }
        } catch (e) {}
    },

    // Gun art owned by a SPECIFIC peer (for foreign bodies). Your own
    // uploads/shipped art never live here — see drawGun holder logic.
    resolveGun(skinId, holderPid) {
        try {
            const slot = (this.remote.gun || {})[skinId];
            const img = slot ? slot[holderPid] : null;
            if (img && img.complete !== false && (img.naturalWidth || 0) > 0) return img;
            // Still decoding (naturalWidth 0)? Return it anyway — the
            // canvas draw simply skips until ready, then picks it up.
            return img || null;
        } catch (e) { return null; }
    },

    applyRemote(kind, id, dataUrl, fromPid) {
        try {
            if (this._hasLocal(kind, id)) return Promise.resolve('local-wins');
            if (!fromPid) {
                if (this._cacheHas(kind, id)) return Promise.resolve('have');
            } else {
                try {
                    const slot = (this.remote[kind] || {})[id];
                    if (slot && slot[fromPid]) return Promise.resolve('have');
                } catch (e) {}
            }
            const loaders = this._loaders();
            const L = loaders[kind];
            if (!L || !L.loader.cache) return Promise.resolve('no-loader');
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        if (fromPid) {
                            // Foreign art: per-owner registry ONLY (never the
                            // shared loader cache — see header).
                            if (!this.remote[kind]) this.remote[kind] = {};
                            if (!this.remote[kind][id]) this.remote[kind][id] = {};
                            this.remote[kind][id][fromPid] = img;
                        } else {
                            L.loader.cache.set(id, img);
                        }
                        // Session-only: never touch localStorage (see header).
                        const p = this._progress;
                        this._bumpProgress(Math.min(p.total, p.got + 1), p.total);
                        this._repaintIndex();
                    } catch (e) {}
                    resolve('ok');
                };
                img.onerror = () => resolve('bad-image');
                img.src = dataUrl;
            });
        } catch (e) {
            return Promise.resolve('error');
        }
    },

    // A fresh upload happened mid-session: push it to everyone (they
    // apply it only if they have nothing local for that slot).
    offerLocal(kind, id) {
        try {
            if (typeof Multiplayer === 'undefined' || !Multiplayer.roomCode) return;
            const url = this._localDataUrl(kind, id);
            if (!url || url.length > this.MAX_ITEM_BYTES) return;
            const myId = (typeof Multiplayer !== 'undefined' && (Multiplayer.localClientId || (Multiplayer.localPid && Multiplayer.localPid()))) || 'host';
            const manifest = { t: 'skin-manifest', from: myId, items: [{ kind, id, hash: this._hash(url), len: url.length }] };
            if (Multiplayer.isHost) PeerLink.broadcast(manifest);
            else PeerLink.sendToHost(manifest);
            // Push the bytes too (no request round-trip for live uploads).
            const total = Math.max(1, Math.ceil(url.length / this.CHUNK));
            for (let seq = 0; seq < total; seq++) {
                const chunk = {
                    t: 'skin-chunk', from: myId, to: '', kind, id,
                    seq, total, hash: this._hash(url),
                    data: url.slice(seq * this.CHUNK, (seq + 1) * this.CHUNK)
                };
                if (Multiplayer.isHost) PeerLink.broadcast(chunk);
                else PeerLink.sendToHost(chunk);
            }
        } catch (e) {}
    },

    // Wrap the three loaders' saveUpload so new art goes out live.
    installUploadTap() {
        if (this._tapInstalled) return;
        this._tapInstalled = true;
        const kinds = ['fish', 'gun', 'bobber'];
        const ofKind = (kind) => {
            try {
                const loaders = this._loaders();
                const L = loaders[kind];
                if (!L || !L.loader.saveUpload || L.loader.saveUpload._peerTapped) return;
                const orig = L.loader.saveUpload.bind(L.loader);
                const fn = (id, file) => orig(id, file).then(
                    (res) => { try { this.offerLocal(kind, id); } catch (e) {} return res; },
                    (err) => { throw err; }
                );
                fn._peerTapped = true;
                L.loader.saveUpload = fn;
            } catch (e) {}
        };
        kinds.forEach(ofKind);
        // Loaders may restore uploads later; re-tap once to be safe.
        try { setTimeout(() => kinds.forEach(ofKind), 2000); } catch (e) {}
    },

    _repaintIndex() {
        try {
            if (typeof FishIndex === 'undefined') return;
            const modal = document.getElementById('index-modal');
            const menuGrid = document.getElementById('fish-index-grid');
            if (modal && !modal.classList.contains('hidden') && FishIndex.renderInGame) {
                try { FishIndex.renderInGame(); } catch (e) {}
            } else if (menuGrid && menuGrid.children.length && FishIndex.renderGrid) {
                try { FishIndex.renderGrid(); } catch (e) {}
            }
        } catch (e) {}
    }
};

window.PeerSkins = PeerSkins;

/* ====================================================================
 * PeerAnnounce — mirror catch popups + boss banners across peers.
 * Same text, same colors. (Camera locks, SFX and music stay local to
 * whoever triggered the event — Settings/audio remain per-client.)
 * ================================================================== */
const PeerAnnounce = {
    _suppress: false,

    installTap() {
        if (this._tapInstalled) return;
        this._tapInstalled = true;
        // NOTE: catch popups are PERSONAL — every angler only ever sees
        // their own catches (like their own casino tokens). Only boss
        // banners are mirrored, because boss fights are shared.
        // Boss arrivals (Ritual.bossIntro) — broadcast the banner facts.
        try {
            if (typeof Ritual !== 'undefined' && Ritual.bossIntro && !Ritual.bossIntro._peerTapped) {
                const orig = Ritual.bossIntro.bind(Ritual);
                const fn = (state, sp, px, py, bossRef, durSec) => {
                    const r = orig(state, sp, px, py, bossRef, durSec);
                    try {
                        if (!this._suppress && typeof Multiplayer !== 'undefined' && Multiplayer.roomCode && sp) {
                            const me4 = Multiplayer.localClientId || (Multiplayer.localPid && Multiplayer.localPid()) || 'host';
                            const msg = {
                                t: 'announce', kind: 'boss',
                                from: me4,
                                id: sp.id, name: sp.name
                            };
                            if (Multiplayer.isHost) PeerLink.broadcast(msg);
                            else PeerLink.sendToHost(msg);
                        }
                    } catch (e) {}
                    return r;
                };
                fn._peerTapped = true;
                Ritual.bossIntro = fn;
            }
        } catch (e) {}
    },

    apply(msg, state) {
        if (!msg || msg.kind === undefined) return;
        this._suppress = true;
        try {
            // 'catch' announces are legacy/no-op: catches stay personal.
            if (msg.kind === 'boss' && msg.id) {
                this._bossBannerOnly(state, msg);
            }
        } finally {
            this._suppress = false;
        }
    },

    // Banner + floating text only: no camera lock, no SFX — those stay
    // with the triggering peer (their Settings/audio may differ anyway).
    _bossBannerOnly(state, msg) {
        try {
            let meta = { title: 'BOSS', color: '#ef4444', glow: '#fbbf24' };
            try {
                if (typeof Ritual !== 'undefined' && Ritual.BOSS_TITLES && Ritual.BOSS_TITLES[msg.id]) {
                    meta = Ritual.BOSS_TITLES[msg.id];
                }
            } catch (e) {}
            const name = (msg.name || 'BOSS').toUpperCase();
            try {
                if (state && typeof Particles !== 'undefined' && state.player) {
                    Particles.showFloatingText(state, '🕯 ' + name + ' RISES!', state.player.x, state.player.y - 110, '#ef4444');
                }
            } catch (e) {}
            try {
                const host = document.getElementById('game-container') || document.body;
                const old = document.getElementById('boss-intro-banner');
                if (old) old.remove();
                const div = document.createElement('div');
                div.id = 'boss-intro-banner';
                div.innerHTML =
                    '<div class="boss-intro-kicker">⚠ WARNING ⚠</div>' +
                    '<div class="boss-intro-name" style="--boss-color:' + meta.color + ';--boss-glow:' + meta.glow + ';">' + name + '</div>' +
                    '<div class="boss-intro-sub">' + meta.title + '</div>';
                host.appendChild(div);
                setTimeout(() => { try { div.remove(); } catch (e) {} }, 3000);
            } catch (e) {}
        } catch (e) {}
    }
};

window.PeerAnnounce = PeerAnnounce;
