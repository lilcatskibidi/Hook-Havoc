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

    // Built-in TURN fallback (Open Relay free tier — shared, rate-limited).
    // Shipped by default so VPN / strict-NAT players connect with ZERO
    // manual setup: ICE only spends relay candidates when the direct
    // host/srflx paths fail, so working P2P costs nothing extra. Heavy
    // hosts should still paste their own relay below (it takes precedence).
    DEFAULT_TURN: [
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    ],

    peerOptions(idOrUndefined) {
        const iceServers = this.DEFAULT_STUN.map(u => ({ urls: u }));
        // Built-in TURN fallback rides along (used only when direct fails).
        try {
            for (const t of (this.DEFAULT_TURN || [])) {
                if (t && t.urls) iceServers.push({ urls: t.urls, username: t.username, credential: t.credential });
            }
        } catch (e) {}
        let opt = { debug: 0, config: { iceServers } };
        // HTTPS pages (GitHub Pages, itch.io) MUST signal over WSS or the
        // browser blocks it as mixed content and the cloud never connects
        // (the classic "works on localhost http, dead on github"). Pin the
        // cloud endpoint explicitly instead of trusting library defaults.
        // Localhost http keeps library defaults (don't fix what's working).
        try {
            if (typeof location !== 'undefined' && location.protocol === 'https:') {
                opt.secure = true;
                opt.host = '0.peerjs.com';
                opt.port = 443;
                opt.path = '/';
            }
        } catch (e) {}
        // VPN fix: many VPNs block UDP or hand out unreachable exit IPs,
        // so direct host/srflx paths die the same "P2P blocked" death.
        // Relay-only forces EVERYTHING through the TURN server (use
        // TURNS on port 443 — plain TLS, passes virtually any VPN or
        // firewall). Flag lives in localStorage `ah_peer_relay_only`.
        // `_forceRelayOnce` is the join flow's automatic one-shot retry
        // (set when the direct attempt times out behind a VPN).
        try {
            if ((typeof localStorage !== 'undefined' && localStorage.getItem('ah_peer_relay_only') === '1') || this._forceRelayOnce) {
                opt.config.iceTransportPolicy = 'relay';
            }
        } catch (e) {}
        try {
            if (typeof window !== 'undefined' && window.PEER_CONFIG && typeof window.PEER_CONFIG === 'object') {
                opt = Object.assign({}, opt, window.PEER_CONFIG);
            }
        } catch (e) {}
        // Saved TURN credentials MERGE with (never replace) the default
        // STUNs, so adding a relay can't break what already worked.
        try {
            const raw = localStorage.getItem('ah_peer_ice');
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length) {
                    const seen = {};
                    for (const s of opt.config.iceServers) {
                        const k = s && s.urls;
                        seen[Array.isArray(k) ? k.join(',') : k] = 1;
                    }
                    for (const e of arr.slice(0, 8)) {
                        if (!e || !e.urls) continue;
                        const k = Array.isArray(e.urls) ? e.urls.join(',') : e.urls;
                        if (seen[k]) continue;
                        seen[k] = 1;
                        opt.config.iceServers.push(e);
                    }
                }
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
                this.fastConns = {};
                this.members = [];
                this.memberNames = {};
                // Game-pid <-> transport-id links (hello carries the stable
                // per-browser pid; the wire uses transport ids). Powers the
                // TAB roster union + host kick-by-row.
                this.pidToPeer = {};
                this.peerToPid = {};
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
                // Terminal: consume one-shot relay flags so the next manual
                // join starts fresh (the auto-retry path below bypasses fail).
                try { this._forceRelayOnce = false; this._relayRetried = false; } catch (e) {}
                clearOpen();
                // Null FIRST: conn.close() can fire 'close' synchronously,
                // and the handler must not mistake our own teardown for
                // "Host left the game".
                this._welcomed = false;
                const c = conn, p = peer;
                conn = null;
                this.peer = null;
                this.hostConn = null;
                try { if (this.hostFast) this.hostFast.close(); } catch (e) {}
                this.hostFast = null;
                try { if (c) c.close(); } catch (e) {}
                try { if (p) p.destroy(); } catch (e) {}
                reject(err);
            };
            const win = (welcome) => {
                if (settled) return;
                settled = true;
                try { this._forceRelayOnce = false; this._relayRetried = false; } catch (e) {}
                this.isHost = false;
                this.roomCode = code;
                this._welcomed = true;
                // Reliable handshake done — open the fast lane for snapshots.
                try { this._openFast(); } catch (e) {}
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
                // VPN fix: first timeout auto-retries ONCE through a forced
                // TURN relay (TURNS:443 passes virtually any VPN/firewall)
                // instead of failing outright — the recursive join builds a
                // fresh Peer with iceTransportPolicy 'relay'.
                openTimer = setTimeout(() => {
                    if (!settled) {
                        if (!this._relayRetried && !this._forceRelayOnce) {
                            this._relayRetried = true;
                            this._forceRelayOnce = true;
                            try { if (conn) conn.close(); } catch (e) {}
                            try { if (peer) peer.destroy(); } catch (e) {}
                            try { if (this.hostFast) this.hostFast.close(); } catch (e) {}
                            this.hostFast = null;
                            clearOverall();
                            settled = true; // abandon silently — retry owns the outcome
                            try { if (typeof Multiplayer !== 'undefined' && Multiplayer.mpLog) Multiplayer.mpLog('info', 'direct P2P blocked — retrying via TURN relay…'); } catch (e) {}
                            this.joinRoom(code).then(resolve, reject);
                            return;
                        }
                        clearOverall();
                        fail(new Error('P2P channel blocked — the room exists, but no route opened (NAT/firewall/VPN), even via TURN relay. On VPN: use WireGuard-style UDP or a node near the HOST; as last resort paste a private TURNS:443 relay in Multiplayer → TURN RELAY and tick force-relay.'));
                    }
                }, 10000);
                conn.once('open', () => {
                    // Identity rides the hello: this TAB's transport id +
                    // this TAB's pilot name (session-scoped, never another
                    // tab's localStorage value) + STABLE per-browser pid so
                    // the host can scope saves per server population.
                    let nm = '';
                    let spid = '';
                    let skin = '';
                    try {
                        nm = (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
                            ? Multiplayer.playerName() : '';
                        spid = (typeof Multiplayer !== 'undefined' && Multiplayer.localPid)
                            ? Multiplayer.localPid() : '';
                        skin = (typeof Multiplayer !== 'undefined' && Multiplayer.playerSkin)
                            ? Multiplayer.playerSkin() : '';
                    } catch (e) {}
                    this._sendDirect(conn, { t: 'hello', v: peerGameVersion(), id, name: nm, pid: spid, skin });
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
        // Fast-lane data channel: no handshake, member must be admitted.
        try {
            if (conn.label === this.FAST_LABEL) { this._onFastInbound(conn); return; }
        } catch (e) {}
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
        // [{id, name, skin}] in join order — the lobby + tags read this.
        try {
            const out = [];
            for (const id of (this.members || [])) {
                let skin = null;
                try { skin = (this.memberSkins && this.memberSkins[id]) || null; } catch (e) {}
                out.push({ id, name: this.memberNames[id] || ('Player-' + String(id).slice(-4)), skin });
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
        // Remember their diver color for the lobby roster.
        try {
            if (!this.memberSkins) this.memberSkins = {};
            const sk = (hello && typeof hello.skin === 'string' && hello.skin) ? hello.skin.slice(0, 16) : null;
            if (sk) this.memberSkins[remoteId] = { color: sk };
            else delete this.memberSkins[remoteId];
        } catch (e) {}
        // Link stable game pid <-> transport id (used by roster + kick).
        try {
            const spid = (hello && typeof hello.pid === 'string' && hello.pid.trim()) ? hello.pid.trim() : null;
            if (!this.pidToPeer) this.pidToPeer = {};
            if (!this.peerToPid) this.peerToPid = {};
            if (spid) {
                this.pidToPeer[spid] = remoteId;
                this.peerToPid[remoteId] = spid;
            }
        } catch (e) {}
        const count = 1 + Object.keys(this.conns).length;
        let hostName = '';
        let hostSkin = null;
        try {
            hostName = (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
                ? (Multiplayer.playerName() || 'Host') : 'Host';
            hostSkin = (typeof Multiplayer !== 'undefined' && Multiplayer.playerSkin)
                ? { color: Multiplayer.playerSkin() } : null;
        } catch (e) { hostName = 'Host'; }
        try {
            conn.send({ t: 'welcome', room: this.roomCode, id: remoteId, count, members: this.members.slice(), roster: this._roster(), hostName, hostSkin, hostPid: this._hostPid(), v: peerGameVersion() });
        } catch (e) {}
        this._broadcastLobby();
        try { if (this.onMemberJoin) this.onMemberJoin(remoteId); } catch (e) {}
    },

    _removeMember(remoteId) {
        let changed = false;
        if (this.conns[remoteId]) { delete this.conns[remoteId]; changed = true; }
        try { if (this.fastConns && this.fastConns[remoteId]) delete this.fastConns[remoteId]; } catch (e) {}
        try { delete this.memberNames[remoteId]; } catch (e) {}
        try { if (this.memberSkins) delete this.memberSkins[remoteId]; } catch (e) {}
        try {
            const spid = this.peerToPid && this.peerToPid[remoteId];
            if (spid && this.pidToPeer) delete this.pidToPeer[spid];
            if (this.peerToPid) delete this.peerToPid[remoteId];
        } catch (e) {}
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
        let hostSkin = null;
        try {
            hostName = (typeof Multiplayer !== 'undefined' && Multiplayer.playerName)
                ? (Multiplayer.playerName() || 'Host') : 'Host';
            hostSkin = (typeof Multiplayer !== 'undefined' && Multiplayer.playerSkin)
                ? { color: Multiplayer.playerSkin() } : null;
        } catch (e) {}
        this.broadcast({ t: 'lobby', count, members: this.members.slice(), roster: this._roster(), hostName, hostSkin, v: peerGameVersion() });
    },

    // Host kick: warn the peer, then drop both channels. The close
    // handlers run _removeMember (lobby rebroadcast + onMemberLeave).
    closePeer(tid) {
        try {
            const c = (this.conns || {})[tid];
            if (c && c.open) {
                try { c.send({ t: 'kicked', why: 'Kicked by host.' }); } catch (e) {}
            }
        } catch (e) {}
        setTimeout(() => {
            try {
                const c2 = (this.conns || {})[tid];
                if (c2) { try { c2.close(); } catch (e) {} }
            } catch (e) {}
            try {
                const f = (this.fastConns || {})[tid];
                if (f) { try { f.close(); } catch (e) {} }
            } catch (e) {}
            try { this._removeMember(tid); } catch (e) {}
        }, 350);
        return true;
    },

    memberCount() {
        return 1 + Object.keys(this.conns || {}).length;
    },

    // ---- Fast lane: unordered + unreliable snapshots ----------------------
    // gameState (~12Hz) and playerInput (~15Hz, or 14-byte NetCodec binary
    // ticks) are ephemeral: a dropped packet is obsolete 80ms later.
    // Sending them over the reliable channel means ONE lost packet stalls
    // EVERYTHING behind a retransmit (head-of-line blocking = visible
    // teleporting). The fast lane drops instead of stalling.
    // UDP-like mapping: PeerJS `{reliable: false}` negotiates the SCTP
    // channel as {ordered: false, maxRetransmits: 0} — fire-and-forget,
    // exactly the UDP semantics netcode wants. Lobby/awards/skins/
    // gameStart stay on the reliable channel.
    // Binary (ArrayBuffer from NetCodec) is passed through untouched;
    // receivers may see ArrayBuffer | Uint8Array | Blob per browser —
    // Multiplayer.handlePeerMessage normalizes all three.
    FAST_LABEL: 'ah-fast',
    FAST_MAX_BUFFER: 48 * 1024, // bytes queued per channel before we skip a snapshot
    fastConns: null, // host: peerId -> fast DataConnection
    hostFast: null,  // client: fast DataConnection to host

    // Open (or check) the fast lane: fresh snapshots only, never queued.
    _fastOk(conn) {
        try {
            if (!conn || !conn.open) return false;
            const dc = conn.dataChannel;
            if (dc && typeof dc.bufferedAmount === 'number' && dc.bufferedAmount > this.FAST_MAX_BUFFER) return false;
            return true;
        } catch (e) { return false; }
    },

    sendFastToHost(obj) {
        try {
            if (this._fastOk(this.hostFast)) { this.hostFast.send(obj); return 'fast'; }
        } catch (e) {}
        try { return this.sendToHost(obj) ? 'slow' : false; } catch (e) { return false; }
    },

    sendFastTo(peerId, obj) {
        try {
            const c = (this.fastConns || {})[peerId];
            if (this._fastOk(c)) { c.send(obj); return 'fast'; }
        } catch (e) {}
        try { return this.sendTo(peerId, obj) ? 'slow' : false; } catch (e) { return false; }
    },

    broadcastFast(obj) {
        if (!this.isHost) return 0;
        let n = 0;
        try {
            for (const id of Object.keys(this.fastConns || {})) {
                try {
                    const c = this.fastConns[id];
                    if (this._fastOk(c)) { c.send(obj); n++; }
                } catch (e) {}
            }
        } catch (e) {}
        return n;
    },

    fastReady(peerId) {
        try {
            if (peerId) return !!((this.fastConns || {})[peerId] && this.fastConns[peerId].open);
            if (!this.isHost) return !!(this.hostFast && this.hostFast.open);
            return Object.keys(this.fastConns || {}).length > 0;
        } catch (e) { return false; }
    },

    // Client: open the fast lane after the reliable hello/welcome handshake.
    // UDP-like: {reliable:false} -> SCTP {ordered:false, maxRetransmits:0}.
    _openFast() {
        try {
            if (this.isHost || !this.peer || !this.roomCode) return false;
            if (this.hostFast && this.hostFast.open) return true;
            const conn = this.peer.connect(peerRoomPrefix() + this.roomCode, { reliable: false, label: this.FAST_LABEL });
            if (!conn) return false;
            this.hostFast = conn;
            try { conn.binaryType = 'arraybuffer'; } catch (e) {}
            conn.on('data', (msg) => { try { if (msg && this.onMessage) this.onMessage(msg, 'host'); } catch (e) {} });
            const drop = () => { try { if (this.hostFast === conn) this.hostFast = null; } catch (e) {} };
            conn.on('close', drop);
            conn.on('error', drop);
            return true;
        } catch (e) { return false; }
    },

    // Host: accept a fast lane only from an already-admitted member
    // (the reliable channel authenticated them — no second handshake).
    _onFastInbound(conn) {
        if (!conn) return;
        const remoteId = conn.peer;
        if (!this.isHost || !this.conns || !this.conns[remoteId]) {
            try { conn.close(); } catch (e) {}
            return;
        }
        if (!this.fastConns) this.fastConns = {};
        try { conn.binaryType = 'arraybuffer'; } catch (e) {}
        try {
            const old = this.fastConns[remoteId];
            if (old && old !== conn) { try { old.close(); } catch (e) {} }
        } catch (e) {}
        this.fastConns[remoteId] = conn;
        conn.on('data', (msg) => { try { if (this.onMessage) this.onMessage(msg, remoteId); } catch (e) {} });
        const drop = () => { try { if (this.fastConns && this.fastConns[remoteId] === conn) delete this.fastConns[remoteId]; } catch (e) {} };
        conn.on('close', drop);
        conn.on('error', drop);
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

    // Full API check: library + cloud broker + STUN reachability +
    // Discord webhook validity (GET only — never posts). Every result is
    // reported back through cb so nothing fails silently / blocked-quietly.
    async diagnose(cb) {
        const out = [];
        const push = (ok, text) => {
            out.push({ ok: !!ok, text: String(text) });
            try { if (cb) cb(out.slice(), false); } catch (e) {}
        };
        // Amber warning: worth acting on, but not a hard failure.
        const pushWarn = (text) => {
            out.push({ ok: true, warn: true, text: String(text) });
            try { if (cb) cb(out.slice(), false); } catch (e) {}
        };
        // 1. Library present?
        try {
            this.ensureLib();
            push(true, 'PeerJS library loaded');
        } catch (e) {
            push(false, 'PeerJS library missing: ' + String((e && e.message) || e).slice(0, 100));
            try { if (cb) cb(out.slice(), true); } catch (ee) {}
            return out;
        }
        // 2. Cloud broker reachable?
        try {
            const ok = await this.warmup(8000);
            push(!!ok, ok ? 'Cloud broker reachable (0.peerjs.com:443)' : ('Cloud broker unreachable: ' + (this.cloudError || 'timeout')));
        } catch (e) {
            push(false, 'Cloud check failed: ' + String((e && e.message) || e).slice(0, 100));
        }
        // 3. STUN reachable (can we learn our public address for P2P)?
        // Also reports TURN relay candidates when a relay is configured.
        // Relay-only mode (VPN) is noted so the report reads correctly.
        try {
            let relayOnly = false;
            try { relayOnly = localStorage.getItem('ah_peer_relay_only') === '1'; } catch (e) {}
            const r = await this._stunCheck(6000);
            if (r.relay > 0) {
                push(true, `TURN relay OK (${r.relay} relay candidate${r.relay > 1 ? 's' : ''}) — strict NATs/VPN can connect${relayOnly ? ' (relay-only mode)' : ''}`);
            } else if (r.srflx > 0) {
                push(true, `STUN OK (${r.srflx} public candidate${r.srflx > 1 ? 's' : ''}) — direct P2P likely; built-in TURN fallback covers VPN/strict NAT automatically`);
            } else {
                pushWarn('STUN blocked — no public address learned. Direct P2P will fail, but join auto-retries via the built-in TURN relay (TCP 443).');
            }
        } catch (e) {
            push(false, 'STUN check failed: ' + String((e && e.message) || e).slice(0, 100));
        }
        // 4. Discord webhook valid? (GET validates, posts nothing.)
        try {
            let wh = '';
            try {
                if (typeof Feedback !== 'undefined' && Feedback.getWebhook) wh = Feedback.getWebhook() || '';
            } catch (e) {}
            if (!wh) {
                push(true, 'Discord webhook not set (reports copy to clipboard instead)');
            } else {
                const r = await fetch(wh, { method: 'GET' });
                if (r.ok) {
                    let nm = '';
                    try {
                        const j = await r.json();
                        if (j && j.name) nm = j.name + (j.channel_id ? ' #' + j.channel_id : '');
                    } catch (e) {}
                    push(true, 'Discord webhook valid' + (nm ? ' (' + nm + ')' : ''));
                } else {
                    push(false, `Discord webhook rejected (HTTP ${r.status}) — check js/secret.js`);
                }
            }
        } catch (e) {
            push(false, 'Discord webhook unreachable: ' + String((e && e.message) || e).slice(0, 100));
        }
        // 5. NAT behavior for UDP hole punching (dual-STUN comparison).
        let nat = { type: 'unknown' };
        try {
            nat = await this._natCheck();
            if (nat.warn) pushWarn(nat.text);
            else push(!!nat.ok, nat.text);
        } catch (e) {
            push(false, 'NAT check failed: ' + String((e && e.message) || e).slice(0, 100));
        }
        // 6. VPN / Cloudflare WARP check (informational — VPN is not a fail).
        let vpn = { status: 'unknown' };
        try {
            let stunIp = null;
            try { stunIp = nat.ip || null; } catch (e) {}
            vpn = await this._vpnCheck(stunIp);
            push(true, vpn.text);
        } catch (e) {
            push(true, 'VPN: check skipped — P2P unaffected.');
        }
        // 7. Recommendation combining NAT + VPN + relay state.
        try {
            push(true, this._punchAdvice(nat, vpn));
        } catch (e) {}
        try { if (cb) cb(out.slice(), true); } catch (e) {}
        return out;
    },

    // One-line recommendation from the checks above (HaxBall wisdom:
    // closest relay to the HOST, WireGuard-style UDP, split tunneling).
    _punchAdvice(nat, vpn) {
        let relay = false, relayOnly = false;
        try {
            const raw = localStorage.getItem('ah_peer_ice');
            relay = !!(raw && JSON.parse(raw).length);
        } catch (e) {}
        try { relayOnly = localStorage.getItem('ah_peer_relay_only') === '1'; } catch (e) {}
        const t = (nat && nat.type) || 'unknown';
        const warp = !!(vpn && vpn.warp);
        if (t === 'blocked') {
            return 'Advice: UDP is blocked here — join now auto-retries via the built-in TURN relay (TCP 443), so just join normally. ' + (relay
                ? 'Your saved relay takes precedence; keep force-relay ticked on VPN.'
                : 'If even the relay fails, paste a private TURNS:443 relay below and tick force-relay.');
        }
        if (t === 'rotating' || t === 'restricted' || t === 'partial') {
            return 'Advice: ' + (relay
                ? 'Your TURN relay is ready — join auto-retries through it when direct P2P stalls; prefer relays closest to the HOST.'
                : 'Direct P2P usually connects (auto relay-retry is the backup). For a personal relay, paste TURNS:443 below — closest to the HOST, not to you.');
        }
        if (warp && !relayOnly) {
            return 'Advice: WARP passes game UDP fine — no action needed. If a room will not connect, tick force-relay (TURNS:443) instead of disconnecting WARP.';
        }
        return 'Advice: direct P2P should work. If a far-away room lags, choose rooms near you — or a VPN node near the HOST, never the reverse.';
    },

    // STUN probe: gather ICE candidates, count server-reflexive (public)
    // and relayed (TURN) candidates.
    _stunCheck(timeoutMs) {        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve({ srflx: srflxN, relay: relayN });
            };
            let srflxN = 0, relayN = 0;
            try {
                if (typeof RTCPeerConnection === 'undefined') { finish(); return; }
                const servers = [];
                try {
                    const o = this.peerOptions ? this.peerOptions() : null;
                    if (o && o.config && Array.isArray(o.config.iceServers)) {
                        for (const s of o.config.iceServers) {
                            const u = s && s.urls;
                            const arr = Array.isArray(u) ? u : [u];
                            for (const x of arr) {
                                if (typeof x === 'string' && (x.indexOf('stun:') === 0 || x.indexOf('turn:') === 0 || x.indexOf('turns:') === 0)) {
                                    servers.push(Object.assign({}, s, { urls: x }));
                                }
                            }
                        }
                    }
                } catch (e) {}
                if (!servers.length) servers.push({ urls: 'stun:stun.l.google.com:19302' });
                const pc = new RTCPeerConnection({ iceServers: servers });
                try {
                    pc.onicecandidate = (ev) => {
                        try {
                            if (ev && ev.candidate && typeof ev.candidate.candidate === 'string') {
                                const c = ev.candidate.candidate;
                                if (c.indexOf('srflx') >= 0) srflxN++;
                                else if (c.indexOf('relay') >= 0) relayN++;
                            }
                        } catch (e) {}
                    };
                } catch (e) {}
                try { pc.createDataChannel('probe'); } catch (e) {}
                pc.createOffer()
                    .then(o => pc.setLocalDescription(o))
                    .catch(() => finish());
                setTimeout(() => { try { pc.close(); } catch (e) {} finish(); }, timeoutMs || 6000);
            } catch (e) { finish(); }
        });
    },

    // Single-STUN probe: first server-reflexive candidate + how long the
    // STUN round-trip took. Null when this STUN server is unreachable.
    _natProbe(url, timeoutMs) {
        return new Promise((resolve) => {
            let done = false;
            const t0 = Date.now();
            const finish = (found) => {
                if (done) return;
                done = true;
                try { pc.close(); } catch (e) {}
                resolve(found || null);
            };
            let pc = null;
            try {
                if (typeof RTCPeerConnection === 'undefined') { finish(null); return; }
                pc = new RTCPeerConnection({ iceServers: [{ urls: url }] });
                pc.onicecandidate = (ev) => {
                    try {
                        const c = ev && ev.candidate && ev.candidate.candidate;
                        if (typeof c === 'string' && c.indexOf('srflx') >= 0) {
                            // candidate:<found> <comp> udp <prio> <IP> <port> typ srflx ...
                            const parts = c.split(' ');
                            finish({ ip: parts[4] || '?', port: parts[5] || '?', ms: Date.now() - t0 });
                        }
                    } catch (e) {}
                };
                try { pc.createDataChannel('natprobe'); } catch (e) {}
                pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => finish(null));
                setTimeout(() => finish(null), timeoutMs || 4000);
            } catch (e) { finish(null); }
        });
    },

    // NAT behavior heuristic for UDP hole punching (HaxBall-style prognosis).
    // Compares the mapped address seen by TWO different STUN servers:
    //   same IP+port  -> open / full-cone (punching works)
    //   same IP, new port per server -> port-restricted / symmetric
    //       (punching usually still works when BOTH peers punch; host-side
    //       TURN relay recommended for strict cases)
    //   different IPs -> rotating egress (VPN exit rotation / multi-homed)
    //   none -> UDP blocked (same-network only, unless TURN relay saved)
    async _natCheck() {
        const A_URL = 'stun:stun.l.google.com:19302';
        const B_URL = 'stun:stun.cloudflare.com:3478';
        let a = null, b = null;
        try { a = await this._natProbe(A_URL, 4000); } catch (e) { a = null; }
        try { b = await this._natProbe(B_URL, 4000); } catch (e) { b = null; }
        if (!a && !b) {
            return { type: 'blocked', ok: false, text: 'NAT: UDP blocked — no STUN server answered. P2P cannot punch through; same-network only unless a TURN relay is saved.' };
        }
        if (a && b) {
            if (a.ip === b.ip && a.port === b.port) {
                return { type: 'open', ok: true, ip: a.ip, text: `NAT: open / full-cone (${a.ip}, STUN ${a.ms}ms/${b.ms}ms) — UDP hole punching should just work.` };
            }
            if (a.ip === b.ip) {
                return { type: 'restricted', warn: true, ip: a.ip, text: `NAT: restricted / symmetric (${a.ip}, port changes per server) — P2P usually connects when both sides punch; save a TURN relay if hosting fails.` };
            }
            return { type: 'rotating', warn: true, text: `NAT: rotating egress (Google sees ${a.ip}, Cloudflare sees ${b.ip}) — VPN exit rotation or multi-homed network. If rooms drop, enable force-relay.` };
        }
        const one = a || b;
        const which = a ? 'Cloudflare' : 'Google';
        return { type: 'partial', warn: true, ip: one.ip, text: `NAT: partial — ${which} STUN unreachable, mapped as ${one.ip}. P2P may still work; re-run to confirm.` };
    },

    // VPN / Cloudflare WARP check via the Cloudflare trace endpoint.
    // Informational only (a VPN is not a failure): reports WARP on/off,
    // the egress IP + country, and whether UDP maps to a different
    // egress than HTTPS (split-tunnel / proxy hint).
    async _vpnCheck(stunIp) {
        const parse = (txt) => {
            const m = {};
            String(txt || '').split('\n').forEach(line => {
                const i = line.indexOf('=');
                if (i > 0) m[line.slice(0, i).trim()] = line.slice(i + 1).trim();
            });
            return m;
        };
        try {
            if (typeof fetch === 'undefined') return { status: 'unknown', ok: true, text: 'VPN: check unavailable (no fetch) — P2P unaffected.' };
            const ctl = new AbortController();
            const t = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, 6000);
            let txt = '';
            try {
                const r = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store', signal: ctl.signal });
                txt = await r.text();
            } finally {
                clearTimeout(t);
            }
            const m = parse(txt);
            if (!m.ip) return { status: 'unknown', ok: true, text: 'VPN: Cloudflare trace unreachable (adblock/VPN may block it) — status unknown, P2P unaffected.' };
            const warp = (m.warp || 'off').toLowerCase();
            const loc = (m.loc || '?').toUpperCase();
            if (warp === 'on' || warp === 'plus') {
                let extra = '';
                if (stunIp && stunIp !== m.ip) extra = ' UDP maps elsewhere — split egress, expect occasional re-routes.';
                return { status: 'warp', ok: true, warp: true, ip: m.ip, loc, text: `VPN: Cloudflare WARP ${warp.toUpperCase()} (egress ${m.ip} · ${loc}).${extra} WARP usually passes game UDP; if P2P fails, tick force-relay with TURNS:443.` };
            }
            let extra = '';
            if (stunIp && stunIp !== m.ip) extra = ' (HTTPS and UDP exit via different IPs — VPN or proxy likely routing one of them; pick the relay closest to the HOST.)';
            return { status: 'direct', ok: true, warp: false, ip: m.ip, loc, text: `VPN: no WARP (direct egress ${m.ip} · ${loc}).${extra}` };
        } catch (e) {
            return { status: 'unknown', ok: true, text: 'VPN: Cloudflare trace blocked/unreachable — status unknown, P2P unaffected.' };
        }
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
        this._welcomed = false;
        try { this._forceRelayOnce = false; this._relayRetried = false; } catch (e) {}
        try {
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
        try {
            for (const id of Object.keys(this.fastConns || {})) {
                try { this.fastConns[id].close(); } catch (e) {}
            }
        } catch (e) {}
        try { if (this.hostConn) this.hostConn.close(); } catch (e) {}
        try { if (this.hostFast) this.hostFast.close(); } catch (e) {}
        try { if (this.peer) this.peer.destroy(); } catch (e) {}
        this.peer = null;
        this.myId = null;
        this.roomCode = null;
        this.isHost = false;
        this.conns = {};
        this.fastConns = {};
        this.hostConn = null;
        this.hostFast = null;
        this.pidToPeer = {};
        this.peerToPid = {};
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

    // Items in a manifest that we actually want to pull: art we don't
    // already hold from that same owner. NOTE: having our OWN art for the
    // same id does NOT skip the pull — each diver's art lives in a
    // dedicated per-owner slot (see storeFor), and the renderer picks the
    // HOLDER's copy. Skipping on local-cache hits was exactly why peers
    // kept rendering the default gun instead of each other's skins.
    // Identical bytes are still skipped via the hash set.
    _needed(manifest, owner) {
        const out = [];
        if (!Array.isArray(manifest)) return out;
        for (const it of manifest) {
            if (!it || !it.kind || !it.id) continue;
            try {
                const slot = (this.remote[it.kind] || {})[it.id];
                if (slot && owner && slot[owner]) continue; // have THEIR copy
            } catch (e) {}
            try {
                if (it.hash && this._seenHash && this._seenHash[it.kind + ':' + it.id + ':' + it.hash]) continue;
            } catch (e) {}
            out.push(it);
        }
        return out;
    },

    // Dedicated per-player skin storage: { guns, fish, bobbers } holding
    // THIS owner's art only (session-only, never localStorage). Renderers
    // and the TAB/lobby UI read through here instead of touching the raw
    // registry.
    storeFor(pid) {
        const store = { guns: {}, fish: {}, bobbers: {} };
        if (!pid) return store;
        try {
            for (const kind of ['gun', 'fish', 'bobber']) {
                const byId = this.remote[kind] || {};
                for (const [id, owners] of Object.entries(byId)) {
                    if (owners && owners[pid]) {
                        const img = owners[pid];
                        if (kind === 'gun') store.guns[id] = img;
                        else if (kind === 'fish') store.fish[id] = img;
                        else store.bobbers[id] = img;
                    }
                }
            }
        } catch (e) {}
        return store;
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
            // Seed the known-bytes set with our own art so identical
            // uploads from peers are skipped (different bytes still pull).
            try {
                if (!this._seenHash) this._seenHash = {};
                for (const it of (items || [])) {
                    if (it && it.hash) this._seenHash[it.kind + ':' + it.id + ':' + it.hash] = 1;
                }
            } catch (e) {}
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
            // Local-first: art we've seen before (same content hash) is in
            // localStorage — apply instantly, no re-download, no request.
            // Only unknown bytes go over the wire (staggered).
            const fetch = [];
            for (const it of need) {
                let hit = null;
                try { if (it.hash) hit = this._lsGet(it.kind, it.id, it.hash); } catch (e) {}
                if (hit) { try { this.applyRemote(it.kind, it.id, hit, owner, it.hash); } catch (e) {} continue; }
                fetch.push(it);
            }
            // Stagger requests so a 4-player room doesn't burst.
            fetch.forEach((it, i) => {
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

    // Local art vault: received PNGs persist by CONTENT HASH (same bytes =
    // same key, across sessions and owners), so the second meeting with an
    // art costs zero bytes. Bounded (~40 entries, 200KB each) with oldest-
    // first eviction — quota errors degrade to memory-only, never throw.
    _lsKey(kind, id, hash) {
        try { return 'ah_pskin_' + kind + '_' + String(id).slice(0, 40) + '_' + String(hash || '').slice(0, 16); }
        catch (e) { return ''; }
    },

    _lsGet(kind, id, hash) {
        try {
            const u = localStorage.getItem(this._lsKey(kind, id, hash));
            return (u && u.indexOf('data:image') === 0) ? u : null;
        } catch (e) { return null; }
    },

    _lsPut(kind, id, hash, url) {
        try {
            if (!hash || !url || url.length > 200 * 1024) return;
            localStorage.setItem(this._lsKey(kind, id, hash), url);
            let idx = {};
            try { idx = JSON.parse(localStorage.getItem('ah_pskin_idx') || '{}'); } catch (e) { idx = {}; }
            idx[this._lsKey(kind, id, hash)] = Date.now();
            const keys = Object.keys(idx).sort((a, b) => idx[a] - idx[b]);
            while (keys.length > 40) {
                const k = keys.shift();
                try { localStorage.removeItem(k); } catch (e) {}
                delete idx[k];
            }
            try { localStorage.setItem('ah_pskin_idx', JSON.stringify(idx)); } catch (e) {}
        } catch (e) {
            // Quota hit: evict the oldest third, skip this round.
            try {
                let idx = JSON.parse(localStorage.getItem('ah_pskin_idx') || '{}');
                const keys = Object.keys(idx).sort((a, b) => idx[a] - idx[b]).slice(0, 15);
                for (const k of keys) { try { localStorage.removeItem(k); } catch (ee) {} delete idx[k]; }
                try { localStorage.setItem('ah_pskin_idx', JSON.stringify(idx)); } catch (ee) {}
            } catch (ee) {}
        }
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
                this.applyRemote(msg.kind, msg.id, url, msg.from, slot.hash);
            }
        } catch (e) {}
    },

    // Visible receipt for shared art: floating text + MP LOG so the
    // room (host included) knows WHO uploaded WHAT. Throttled per item.
    // Example: client 1 uploads pistol.png → everyone sees
    // "🎨 LilCat shared gun skin!" and their body renders that art.
    _announceSkin(kind, id, fromPid) {
        try {
            if (!fromPid) return;
            if (typeof Multiplayer === 'undefined' || !Multiplayer.roomCode || !Multiplayer.state) return;
            if (!this._announced) this._announced = {};
            const key = fromPid + ':' + kind + ':' + id;
            const now = Date.now();
            if (this._announced[key] && now - this._announced[key] < 30000) return;
            this._announced[key] = now;
            // Owner display name: host roster/member names, or the remote
            // body label on clients (the host packs its pilot name there).
            let nm = 'A crewmate';
            try {
                if (Multiplayer.isHost) {
                    const rp = (Multiplayer.hostPeers || {})[fromPid];
                    if (rp && rp.playerName) nm = rp.playerName;
                    else if (PeerLink.memberNames && PeerLink.memberNames[fromPid]) nm = PeerLink.memberNames[fromPid];
                } else {
                    const rp = (Multiplayer.state.remotePlayers || {})[fromPid];
                    if (rp && (rp.playerName || rp.label)) nm = rp.playerName || rp.label;
                }
            } catch (e) {}
            const kindWord = kind === 'gun' ? 'gun' : (kind === 'fish' ? 'fish' : 'bobber');
            const label = `🎨 ${nm} shared ${kindWord} skin!`;
            try {
                if (typeof Particles !== 'undefined' && Multiplayer.state.player) {
                    Particles.showFloatingText(Multiplayer.state, label,
                        Multiplayer.state.player.x, Multiplayer.state.player.y - 70, '#f0abfc');
                }
            } catch (e) {}
            try { if (Multiplayer.mpLog) Multiplayer.mpLog('skin', `${nm} shared ${kind}:${id}`); } catch (e) {}
        } catch (e) {}
    },

    // Per-owner art lookup shared by gun / bobber / fish renderers: each
    // diver's body wears ONLY that holder's own uploads (never yours).
    // Returns the Image (possibly still decoding — canvas skips until
    // ready) or null when this owner shared nothing for the id.
    resolveArt(kind, id, holderPid) {
        try {
            if (!kind || !id || !holderPid) return null;
            const slot = (this.remote[kind] || {})[id];
            const img = slot ? slot[holderPid] : null;
            return img || null;
        } catch (e) { return null; }
    },

    resolveBobber(modelId, holderPid) { return this.resolveArt('bobber', modelId, holderPid); },

    resolveFish(speciesId, holderPid) { return this.resolveArt('fish', speciesId, holderPid); },

    // Gun art owned by a SPECIFIC peer (for foreign bodies). Your own
    // uploads/shipped art never live here — see drawGun holder logic.
    resolveGun(skinId, holderPid) {        try {
            const slot = (this.remote.gun || {})[skinId];
            const img = slot ? slot[holderPid] : null;
            if (img && img.complete !== false && (img.naturalWidth || 0) > 0) return img;
            // Still decoding (naturalWidth 0)? Return it anyway — the
            // canvas draw simply skips until ready, then picks it up.
            return img || null;
        } catch (e) { return null; }
    },

    applyRemote(kind, id, dataUrl, fromPid, hash) {
        try {
            // Per-owner slots: my own same-id art never blocks THEIR copy
            // (each diver renders the holder's art — see storeFor).
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
                            // Vault it locally: next session this hash
                            // applies instantly with zero download.
                            try { this._lsPut(kind, id, hash, dataUrl); } catch (e) {}
                            try {
                                if (!this._seenHash) this._seenHash = {};
                                if (hash) this._seenHash[kind + ':' + id + ':' + hash] = 1;
                            } catch (e) {}
                            // Visible receipt: the room learns WHO shared
                            // WHAT (host included — see _announceSkin).
                            try { this._announceSkin(kind, id, fromPid); } catch (e) {}
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
                            // Pre-mark so a relayed echo of our own summon
                            // can't banner us twice (see _bossBannerOnly).
                            try {
                                if (!this._bannerSeen) this._bannerSeen = {};
                                this._bannerSeen[sp.id] = Date.now();
                            } catch (e) {}
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
    // Dedupe: the same boss arriving via local trigger + network announce
    // (or a lagged re-announce) must not banner twice within 10s.
    _bossBannerOnly(state, msg) {
        try {
            const id = (msg && msg.id) || '?';
            const now = Date.now();
            if (!this._bannerSeen) this._bannerSeen = {};
            if (this._bannerSeen[id] && now - this._bannerSeen[id] < 10000) return;
            this._bannerSeen[id] = now;
        } catch (e) {}
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
