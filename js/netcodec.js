/* ====================================================================
 * NetCodec — compact binary codec for the P2P fast lane.
 *
 * WHY: JSON input snapshots cost ~200+ bytes (full `keys` object, nested
 * mouse/player objects, key names per packet). At 15-30 TPS x 3 clients
 * the host's upstream chokes on phones. This packs a client input tick
 * into 14 bytes:
 *
 *   byte 0    : 0x01 (INPUT tag — lets the receiver tell binary/JSON apart)
 *   byte 1    : bitmask W=1 A=2 S=4 D=8 SPACE=16 FIRE=32 ACT=64 RELOAD=128
 *   int16 x,y : quantized world pos (Math.round, clamped to ±30000)
 *   int16 aim : radians * 10000 (±3.2 rad fits easily)
 *   uint16 seq: monotonic packet sequence (unordered-lane stale drop)
 *   uint8 hp  : quantized hp for the TAB roster dot (0-255 clamp)
 *   uint8 aux : bit0 weapon-cycle pressed, bit1 menu, bits reserved
 *
 * Host->client snapshots stay JSON (heterogeneous: species/monsters/
 * awards/roster don't fit a fixed schema; already quantized via RI/R1
 * and capped: bullets -80, enemyBullets -30). Only the hot input path
 * goes binary — biggest win, zero schema risk.
 *
 * Transport: PeerJS DataConnection with {reliable:false} sends
 * ArrayBuffers as binary; receivers may get ArrayBuffer | Uint8Array |
 * Blob (Chrome Blob quirk) — see `isBinary()` / `fromWire()`.
 * Anything unrecognized falls back to the JSON path untouched.
 * ================================================================== */
const NetCodec = {
    TAG_INPUT: 0x01,
    LEN_INPUT: 14,

    BIT_W: 1, BIT_A: 2, BIT_S: 4, BIT_D: 8,
    BIT_SPACE: 16, BIT_FIRE: 32, BIT_ACT: 64, BIT_RELOAD: 128,

    _clampI16(v) {
        v = Math.round(v || 0);
        return v < -30000 ? -30000 : v > 30000 ? 30000 : v;
    },

    // Build the 1-byte action mask from a full input object (or live
    // state when called pre-send). Reads the same sources the JSON path
    // uses so binary == JSON semantically.
    maskOf(input, state) {
        let m = 0;
        try {
            const k = (input && input.keys) || (state && state.keys) || {};
            if (k['w'] || k['arrowup']) m |= this.BIT_W;
            if (k['a'] || k['arrowleft']) m |= this.BIT_A;
            if (k['s'] || k['arrowdown']) m |= this.BIT_S;
            if (k['d'] || k['arrowright']) m |= this.BIT_D;
            if (k[' ']) m |= this.BIT_SPACE;
            const ms = (input && input.mouse) || (state && state.mouse) || {};
            if (ms.isDown) m |= this.BIT_FIRE;
            if (input && input._actPressed) m |= this.BIT_ACT;
            if (input && input._reloadPressed) m |= this.BIT_RELOAD;
        } catch (e) {}
        return m;
    },

    // Full input object (mpClientInput shape) -> 14-byte ArrayBuffer.
    // Returns null if the input lacks position data (menu/loading).
    encodeInput(input, state) {
        try {
            const pl = (input && input.player) || (state && state.player) || {};
            if (typeof pl.x !== 'number' || typeof pl.y !== 'number') return null;
            const buf = new ArrayBuffer(this.LEN_INPUT);
            const dv = new DataView(buf);
            dv.setUint8(0, this.TAG_INPUT);
            dv.setUint8(1, this.maskOf(input, state));
            dv.setInt16(2, this._clampI16(pl.x), true);
            dv.setInt16(4, this._clampI16(pl.y), true);
            let aim = 0;
            try {
                aim = (typeof input.aim === 'number') ? input.aim
                    : (pl && typeof pl.aim === 'number') ? pl.aim : 0;
            } catch (e) {}
            dv.setInt16(6, Math.max(-32767, Math.min(32767, Math.round(aim * 10000))), true);
            dv.setUint16(8, (input && input._seq >>> 0) || 0, true);
            let hp = 0;
            try { hp = Math.max(0, Math.min(255, Math.round(pl.hp || 0))); } catch (e) {}
            dv.setUint8(10, hp);
            let aux = 0;
            try {
                if (input && input._weaponCycle) aux |= 1;
                if (input && input._menuPressed) aux |= 2;
            } catch (e) {}
            dv.setUint8(11, aux);
            // bytes 12-13: reserved (death-seq edge trigger rides JSON only)
            dv.setUint8(12, 0);
            dv.setUint8(13, 0);
            return buf;
        } catch (e) { return null; }
    },

    isBinary(v) {
        try {
            if (!v) return false;
            if (v instanceof ArrayBuffer) return true;
            if (typeof Uint8Array !== 'undefined' && v instanceof Uint8Array) return true;
            if (typeof Blob !== 'undefined' && v instanceof Blob) return true;
            // PeerJS may hand back {__peerData,n} wrappers on old builds.
            if (v && v.constructor && v.constructor.name === 'ArrayBuffer') return true;
        } catch (e) {}
        return false;
    },

    // Normalize wire binary -> Uint8Array (async only for Blob).
    async fromWire(v) {
        try {
            if (v instanceof ArrayBuffer) return new Uint8Array(v);
            if (typeof Uint8Array !== 'undefined' && v instanceof Uint8Array) return v;
            if (typeof Blob !== 'undefined' && v instanceof Blob) {
                const ab = await v.arrayBuffer();
                return new Uint8Array(ab);
            }
        } catch (e) {}
        return null;
    },

    fromWireSync(v) {
        try {
            if (v instanceof ArrayBuffer) return new Uint8Array(v);
            if (typeof Uint8Array !== 'undefined' && v instanceof Uint8Array) return v;
        } catch (e) {}
        return null;
    },

    // 14-byte packet -> minimal input the host's handlePlayerInput
    // understands (player x/y, aim, bitmask-derived keys/mouse).
    decodeInput(u8) {
        try {
            if (!u8 || u8.length < this.LEN_INPUT) return null;
            if (u8[0] !== this.TAG_INPUT) return null;
            const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            const mask = dv.getUint8(1);
            const x = dv.getInt16(2, true);
            const y = dv.getInt16(4, true);
            const aim = dv.getInt16(6, true) / 10000;
            const seq = dv.getUint16(8, true);
            const hp = dv.getUint8(10);
            return {
                _binary: true,
                _seq: seq,
                mask,
                keys: {
                    'w': !!(mask & this.BIT_W),
                    'a': !!(mask & this.BIT_A),
                    's': !!(mask & this.BIT_S),
                    'd': !!(mask & this.BIT_D),
                    ' ': !!(mask & this.BIT_SPACE),
                },
                mouse: { isDown: !!(mask & this.BIT_FIRE) },
                aim,
                player: { x, y, hp, maxHp: 100, facing: 1, aim },
                _actPressed: !!(mask & this.BIT_ACT),
                _reloadPressed: !!(mask & this.BIT_RELOAD),
            };
        } catch (e) { return null; }
    },

    // Byte-size proof for the MP log / diagnostics panel.
    describeInput(input, state) {
        try {
            const bin = this.encodeInput(input, state);
            let json = 0;
            try { json = JSON.stringify({ type: 'playerInput', input }).length; } catch (e) {}
            return { binary: bin ? bin.byteLength : 0, json };
        } catch (e) { return { binary: 0, json: 0 }; }
    },
};

window.NetCodec = NetCodec;
