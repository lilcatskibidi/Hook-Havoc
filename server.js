/**
 * WebSocket Signaling + Static File Server for LAN Multiplayer
 * Run with: node server.js
 * Serves the game over HTTP and handles multiplayer signaling over WebSocket.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Load ws, with a helpful error if missing -------------------------------
let WebSocket;
try {
    WebSocket = require('ws');
} catch (err) {
    console.error('\n[FATAL] The "ws" package is not installed.');
    console.error('Run this in your project folder:\n');
    console.error('    npm init -y');
    console.error('    npm install ws\n');
    process.exit(1);
}

const PORT = process.env.PORT || 8080;
const ROOT = __dirname; // serve files from this script's folder

// --- In-memory state --------------------------------------------------------
const clients = new Map(); // clientId -> { ws, roomId, isHost }
const rooms = new Map();   // roomCode -> { id, hostId, clients:Set, createdAt }

// --- Helpers ----------------------------------------------------------------
function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

function generateRoomCode() {
    // Avoid ambiguous chars (0/O, 1/I) for readability
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function safeSend(ws, obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
    }
}

// --- Static file server -----------------------------------------------------
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.wav':  'audio/wav',
    '.mp3':  'audio/mpeg',
    '.ogg':  'audio/ogg',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf'
};

const server = http.createServer((req, res) => {
    // Decode URL and strip query string
    let urlPath;
    try {
        urlPath = decodeURIComponent(req.url.split('?')[0]);
    } catch {
        res.writeHead(400); res.end('Bad Request'); return;
    }

    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    // Resolve to a path inside ROOT (prevent path traversal)
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            // Fallback: serve index.html for SPA-style routes
            if (!path.extname(filePath)) {
                return fs.readFile(path.join(ROOT, 'index.html'), (e2, content) => {
                    if (e2) { res.writeHead(404); res.end('404 Not Found'); return; }
                    res.writeHead(200, { 'Content-Type': MIME['.html'] });
                    res.end(content);
                });
            }
            res.writeHead(404); res.end('404 Not Found'); return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err2, content) => {
            if (err2) { res.writeHead(500); res.end('Server Error'); return; }
            res.writeHead(200, { 'Content-Type': type });
            res.end(content);
        });
    });
});

// --- WebSocket server -------------------------------------------------------
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const clientId = generateId();
    clients.set(clientId, { ws, roomId: null, isHost: false });
    console.log(`[+] Client connected: ${clientId} (total ${clients.size})`);

    safeSend(ws, { type: 'welcome', clientId });

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (e) {
            console.warn(`Invalid JSON from ${clientId}`);
            return;
        }
        try {
            handleMessage(clientId, msg);
        } catch (e) {
            console.error(`Error handling message from ${clientId}:`, e.message);
        }
    });

    ws.on('close', () => {
        const client = clients.get(clientId);
        if (client && client.roomId) leaveRoom(clientId);
        clients.delete(clientId);
        console.log(`[-] Client disconnected: ${clientId} (total ${clients.size})`);
    });

    ws.on('error', (err) => {
        console.error(`WS error for ${clientId}:`, err.message);
    });
});

function handleMessage(clientId, msg) {
    const client = clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
        // Your game uses these two names:
        case 'create':
        case 'createRoom':
            createRoom(clientId);
            break;

        case 'join':
        case 'joinRoom':
            joinRoom(clientId, msg.roomCode);
            break;

        case 'leave':
        case 'leaveRoom':
            leaveRoom(clientId);
            break;

        // WebRTC signaling
        case 'offer':
        case 'answer':
        case 'candidate':
        case 'signal':
            relaySignal(clientId, msg);
            break;

        // Gameplay relay
        case 'gameState':
            relayGameState(clientId, msg);
            break;

        case 'playerInput':
        case 'state':
            relayPlayerInput(clientId, msg);
            break;

        // Shared-world actions (clients -> host only).
        // Loot is first-come: whoever picks it up keeps it personally,
        // the host just deletes it so nobody else can grab it too.
        case 'lootDelete':
        case 'beachClaim':
            relayToHost(clientId, msg);
            break;

        // Lobby -> in-game transition + sync handshake.
        // Relayed to room peers so the game starts even if the
        // WebRTC data channel isn't open yet.
        case 'gameStart':
        case 'gameStartAck':
        case 'syncRequest':
            relayToRoom(clientId, { type: msg.type, from: clientId });
            break;

        default:
            console.warn(`Unknown message type from ${clientId}:`, msg.type);
    }
}

// Forward a client message to the room host only
function relayToHost(fromId, msg) {
    const client = clients.get(fromId);
    if (!client || !client.roomId || client.isHost) return;
    const room = rooms.get(client.roomId);
    if (!room) return;
    const host = clients.get(room.hostId);
    if (!host) return;
    const payload = { ...msg, from: fromId };
    safeSend(host.ws, payload);
}

// Broadcast a payload to every other member of the sender's room
function relayToRoom(fromId, payload) {
    const client = clients.get(fromId);
    if (!client || !client.roomId) return;
    const room = rooms.get(client.roomId);
    if (!room) return;
    room.clients.forEach(toId => {
        if (toId === fromId) return;
        const to = clients.get(toId);
        if (to) safeSend(to.ws, payload);
    });
}

// --- Room management --------------------------------------------------------
function createRoom(clientId) {
    const client = clients.get(clientId);
    if (!client) return;

    // If already in a room, leave first
    if (client.roomId) leaveRoom(clientId);

    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) roomCode = generateRoomCode();

    rooms.set(roomCode, {
        id: roomCode,
        hostId: clientId,
        clients: new Set([clientId]),
        createdAt: Date.now()
    });

    client.roomId = roomCode;
    client.isHost = true;

    // Send BOTH common payload shapes so whichever the client expects works.
    safeSend(client.ws, {
        type: 'roomCreated',
        created: true,
        roomCode,
        code: roomCode,
        isHost: true,
        count: 1
    });

    console.log(`[R] Room ${roomCode} created by ${clientId}`);
}

function joinRoom(clientId, rawCode) {
    const client = clients.get(clientId);
    if (!client) return;

    const roomCode = (rawCode || '').toString().toUpperCase().trim();
    if (!roomCode) {
        safeSend(client.ws, { type: 'error', message: 'Room code required' });
        return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
        safeSend(client.ws, { type: 'error', message: 'Room not found' });
        return;
    }

    if (room.clients.size >= 4) {
        safeSend(client.ws, { type: 'error', message: 'Room is full (max 4 players)' });
        return;
    }

    if (client.roomId) leaveRoom(clientId);

    room.clients.add(clientId);
    client.roomId = roomCode;
    client.isHost = false;

    // Notify host + existing members
    const host = clients.get(room.hostId);
    if (host) safeSend(host.ws, { type: 'playerJoined', joined: true, peerJoined: true, playerId: clientId, count: room.clients.size });
    room.clients.forEach(otherId => {
        if (otherId === clientId || otherId === room.hostId) return;
        const other = clients.get(otherId);
        if (other) safeSend(other.ws, { type: 'playerJoined', joined: true, peerJoined: true, playerId: clientId, count: room.clients.size });
    });

    // Acknowledge joiner (multiple aliases for compatibility)
    safeSend(client.ws, {
        type: 'roomJoined',
        joined: true,
        roomCode: room.id,
        code: room.id,
        isHost: false,
        hostId: room.hostId,
        count: room.clients.size
    });

    console.log(`[R] ${clientId} joined room ${roomCode}`);
}

function leaveRoom(clientId) {
    const client = clients.get(clientId);
    if (!client || !client.roomId) return;

    const room = rooms.get(client.roomId);
    if (!room) {
        client.roomId = null;
        client.isHost = false;
        return;
    }

    room.clients.delete(clientId);

    if (client.isHost) {
        // Host leaving → notify everyone else and delete the room
        room.clients.forEach(otherId => {
            const other = clients.get(otherId);
            if (other) {
                safeSend(other.ws, { type: 'hostLeft', peerLeft: true });
                other.roomId = null;
                other.isHost = false;
            }
        });
        rooms.delete(room.id);
        console.log(`[R] Room ${room.id} closed (host left)`);
    } else {
        // Client leaving → notify everyone left in the room
        room.clients.forEach(otherId => {
            const other = clients.get(otherId);
            if (other) safeSend(other.ws, { type: 'playerLeft', left: true, peerLeft: true, playerId: clientId, count: room.clients.size });
        });
        console.log(`[R] ${clientId} left room ${room.id}`);
    }

    client.roomId = null;
    client.isHost = false;
}

// --- Relays -----------------------------------------------------------------
function relaySignal(fromId, msg) {
    const client = clients.get(fromId);
    if (!client || !client.roomId) return;
    const room = rooms.get(client.roomId);
    if (!room) return;

    room.clients.forEach(toId => {
        if (toId === fromId) return;
        const to = clients.get(toId);
        if (!to) return;

        // Support both 'signal' wrapper and direct offer/answer/candidate
        const payload = msg.payload !== undefined
            ? { type: msg.type, payload: msg.payload, from: fromId }
            : { ...msg, from: fromId };

        safeSend(to.ws, payload);
    });
}

function relayGameState(fromId, msg) {
    const client = clients.get(fromId);
    if (!client || !client.roomId || !client.isHost) return;
    const room = rooms.get(client.roomId);
    if (!room) return;

    room.clients.forEach(toId => {
        if (toId === fromId) return;
        const to = clients.get(toId);
        if (to) safeSend(to.ws, { type: 'gameState', state: msg.state });
    });
}

function relayPlayerInput(fromId, msg) {
    const client = clients.get(fromId);
    if (!client || !client.roomId) return;
    if (client.isHost) return; // host receives input, doesn't send

    const room = rooms.get(client.roomId);
    if (!room) return;

    const host = clients.get(room.hostId);
    if (host) {
        safeSend(host.ws, {
            type: 'playerInput',
            playerId: fromId,
            input: msg.input !== undefined ? msg.input : msg.payload
        });
    }
}

function relayHealRequest(fromId, msg) {
    // Heal feature removed — ignore legacy messages.
    void fromId; void msg;
}

function relayChat(fromId, msg) {
    // Chat feature removed — ignore legacy messages.
    void fromId; void msg;
}

// --- Cleanup ----------------------------------------------------------------
setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, code) => {
        if (room.clients.size === 0 && now - room.createdAt > 60_000) {
            rooms.delete(code);
            console.log(`[R] Cleaned up empty room: ${code}`);
        }
    });
}, 30_000);

// --- Start ------------------------------------------------------------------
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== Fishing Game Server ===`);
    console.log(`HTTP  : http://localhost:${PORT}`);
    console.log(`WS    : ws://localhost:${PORT}/`);

    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(name => {
        interfaces[name].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`LAN   : http://${iface.address}:${PORT}`);
            }
        });
    });
    console.log(`\nOpen the HTTP URL in your browser to play.\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    wss.clients.forEach(ws => { try { ws.close(); } catch {} });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000);
});