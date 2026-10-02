// ============================================================
//  ASSET PACK — share custom skins as a .zip and wear others'.
//  Export: every localStorage custom PNG (guns/bobbers/fish) is packed
//    into aquatic-havoc-skinpack.zip as guns/<id>.png etc.
//  Import: reads a zip back (stored + deflate entries) and installs
//    each file into the matching loader + localStorage.
//  Zero dependencies: minimal ZIP reader/writer + DecompressionStream.
// ============================================================
const AssetPack = {
    // ---- CRC32 (standard polynomial) ----
    _crcTable: null,
    _crc() {
        if (this._crcTable) return this._crcTable;
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            t[n] = c >>> 0;
        }
        this._crcTable = t;
        return t;
    },
    crc32(bytes) {
        const t = this._crc();
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    },

    _dosTime(d) {
        const dt = d || new Date();
        const time = ((dt.getHours() & 31) << 11) | ((dt.getMinutes() & 63) << 5) | ((Math.floor(dt.getSeconds() / 2)) & 31);
        const date = (((dt.getFullYear() - 1980) & 127) << 9) | (((dt.getMonth() + 1) & 15) << 5) | (dt.getDate() & 31);
        return { time, date };
    },

    // ---- Collect installed customs: [{ path, dataUrl }] ----
    collect() {
        const out = [];
        let storage = null;
        try { storage = window.localStorage; } catch (e) { return out; }
        if (!storage) return out;
        const groups = [
            { prefix: 'ah_gunskin_', dir: 'guns' },
            { prefix: 'ah_bobber_', dir: 'bobbers' },
            { prefix: 'ah_fishimg_', dir: 'fish' },
        ];
        try {
            for (let i = 0; i < storage.length; i++) {
                let key = null;
                try { key = storage.key(i); } catch (e) { continue; }
                if (!key) continue;
                for (const g of groups) {
                    if (key.indexOf(g.prefix) === 0) {
                        const id = key.slice(g.prefix.length).replace(/[\\/]/g, '_');
                        if (!id) break;
                        let raw = null;
                        try { raw = storage.getItem(key); } catch (e) { break; }
                        if (typeof raw !== 'string' || raw.indexOf('data:image/') !== 0) break;
                        const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,/.exec(raw);
                        const ext = !m ? 'png'
                            : m[1] === 'image/jpeg' ? 'jpg'
                            : m[1] === 'image/webp' ? 'webp'
                            : m[1] === 'image/gif' ? 'gif' : 'png';
                        out.push({ path: `${g.dir}/${id}.${ext}`, dataUrl: raw });
                        break;
                    }
                }
            }
        } catch (e) {}
        return out;
    },

    _dataUrlToBytes(dataUrl) {
        const comma = dataUrl.indexOf(',');
        const b64 = dataUrl.slice(comma + 1);
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    },

    _bytesToDataUrl(bytes, mime) {
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return `data:${mime || 'image/png'};base64,` + btoa(bin);
    },

    _mimeFor(name) {
        const n = String(name).toLowerCase();
        if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
        if (n.endsWith('.webp')) return 'image/webp';
        if (n.endsWith('.gif')) return 'image/gif';
        return 'image/png';
    },

    // ---- Minimal stored-zip builder (no compression; max compat) ----
    buildZip(files) {
        const enc = new TextEncoder();
        const chunks = [];
        const central = [];
        let offset = 0;
        const { time, date } = this._dosTime();
        const putU16 = v => chunks.push(v & 0xFF, (v >>> 8) & 0xFF);
        const putU32 = v => chunks.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
        const putBytes = b => { for (let i = 0; i < b.length; i++) chunks.push(b[i]); };
        files.forEach(f => {
            const nameB = enc.encode(f.path);
            const crc = this.crc32(f.bytes);
            // local header
            putU32(0x04034b50); putU16(20); putU16(0x0800); putU16(0);
            putU16(time); putU16(date); putU32(crc);
            putU32(f.bytes.length); putU32(f.bytes.length);
            putU16(nameB.length); putU16(0);
            putBytes(nameB); putBytes(f.bytes);
            central.push({ nameB, crc, size: f.bytes.length, offset });
            offset += 30 + nameB.length + f.bytes.length;
        });
        const centralStart = offset;
        const out = [];
        const cU16 = v => out.push(v & 0xFF, (v >>> 8) & 0xFF);
        const cU32 = v => out.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
        const cB = b => { for (let i = 0; i < b.length; i++) out.push(b[i]); };
        central.forEach(c => {
            cU32(0x02014b50); cU16(20); cU16(20); cU16(0x0800); cU16(0);
            cU16(time); cU16(date); cU32(c.crc);
            cU32(c.size); cU32(c.size);
            cU16(c.nameB.length); cU16(0); cU16(0); cU16(0); cU16(0); cU32(0); cU32(c.offset);
            cB(c.nameB);
        });
        const centralSize = out.length;
        // end record
        cU32(0x06054b50); cU16(0); cU16(0);
        cU16(central.length); cU16(central.length);
        cU32(centralSize); cU32(centralStart); cU16(0);
        return new Uint8Array(chunks.concat(out));
    },

    // ---- Minimal zip parser (central directory; stored + deflate) ----
    async parseZip(u8) {
        const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const u32 = i => dv.getUint32(i, true);
        const u16 = i => dv.getUint16(i, true);
        // Find end-of-central-directory (scan last 64KB + 22)
        let eocd = -1;
        const scanFrom = Math.max(0, u8.length - 65558);
        for (let i = u8.length - 22; i >= scanFrom; i--) {
            if (u32(i) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('Not a zip file (no end record).');
        const count = u16(eocd + 10);
        let coff = u32(eocd + 16);
        const dec = new TextDecoder('utf-8');
        const entries = [];
        for (let k = 0; k < count; k++) {
            if (u32(coff) !== 0x02014b50) throw new Error('Corrupt zip (bad central entry).');
            const method = u16(coff + 10);
            const csize = u32(coff + 20);
            const usize = u32(coff + 24);
            const fnlen = u16(coff + 28);
            const eflen = u16(coff + 30);
            const clen = u16(coff + 32);
            const localOff = u32(coff + 42);
            const nameBytes = u8.subarray(coff + 46, coff + 46 + fnlen);
            const entryName = dec.decode(nameBytes);
            coff += 46 + fnlen + eflen + clen;
            // data via local header
            if (u32(localOff) !== 0x04034b50) throw new Error('Corrupt zip (bad local header).');
            const lfn = u16(localOff + 26);
            const leflen = u16(localOff + 28);
            const dataStart = localOff + 30 + lfn + leflen;
            const dataEnd = dataStart + csize;
            if (dataEnd > u8.length) throw new Error('Corrupt zip (truncated entry).');
            const raw = u8.subarray(dataStart, dataEnd);
            entries.push({ name: entryName, method, csize, usize, raw });
        }
        // inflate
        const out = [];
        for (const e of entries) {
            if (e.name.endsWith('/')) continue; // directory
            if (e.method === 0) {
                out.push({ name: e.name, bytes: e.raw.slice() });
            } else if (e.method === 8) {
                if (typeof DecompressionStream === 'undefined') {
                    throw new Error(`"${e.name}" uses deflate but this browser has no DecompressionStream. Re-save the zip uncompressed (store) and retry.`);
                }
                const ds = new DecompressionStream('deflate-raw');
                const stream = new Blob([e.raw]).stream().pipeThrough(ds);
                const buf = await new Response(stream).arrayBuffer();
                out.push({ name: e.name, bytes: new Uint8Array(buf) });
            } else {
                throw new Error(`"${e.name}" uses unsupported compression (${e.method}).`);
            }
        }
        return out;
    },

    _loaderFor(dir) {
        try {
            if (dir === 'guns' && typeof GunSkinLoader !== 'undefined') return GunSkinLoader;
            if (dir === 'bobbers' && typeof BobberLoader !== 'undefined') return BobberLoader;
            if (dir === 'fish' && typeof FishImageLoader !== 'undefined') return FishImageLoader;
        } catch (e) {}
        return null;
    },

    // Install one image: downscale, cache, persist, notify.
    _setImage(loader, id, dataUrl) {
        return new Promise((resolve, reject) => {
            try {
                const img = new Image();
                img.onload = () => {
                    try {
                        const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
                        const cw = Math.max(1, Math.round(img.naturalWidth * k));
                        const ch = Math.max(1, Math.round(img.naturalHeight * k));
                        const cv = document.createElement('canvas');
                        cv.width = cw; cv.height = ch;
                        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
                        const small = cv.toDataURL('image/png');
                        const done = new Image();
                        done.onload = () => {
                            try {
                                if (loader.cache) loader.cache.set(id, done);
                                if (loader.failed && loader.failed.delete) loader.failed.delete(id);
                                if (loader.available) loader.available[id] = true;
                                try { localStorage.setItem(loader.storageKey(id), small); } catch (se) {
                                    // Quota full: session-only, still wearable now.
                                    try { if (typeof loader.onReady === 'function') loader.onReady(id); } catch (e) {}
                                    resolve({ sessionOnly: true });
                                    return;
                                }
                                try { if (typeof loader.onReady === 'function') loader.onReady(id); } catch (e) {}
                                resolve({ sessionOnly: false });
                            } catch (e) { reject(e); }
                        };
                        done.onerror = () => reject(new Error('BAD IMAGE'));
                        done.src = small;
                    } catch (e) { reject(e); }
                };
                img.onerror = () => reject(new Error('BAD IMAGE'));
                img.src = dataUrl;
            } catch (e) { reject(e); }
        });
    },

    setStatus(msg, ok) {
        try {
            const el = document.getElementById('assetpack-status');
            if (el) {
                el.innerText = msg;
                el.className = 'text-[10px] mt-1.5 ' + (ok ? 'text-emerald-300 font-bold' : 'text-slate-500');
            }
        } catch (e) {}
    },

    async exportPack() {
        try {
            const items = this.collect();
            if (!items.length) {
                this.setStatus('Nothing custom yet — upload a gun/bobber/fish skin first.', false);
                return;
            }
            const files = items.map(it => ({
                path: it.path,
                bytes: this._dataUrlToBytes(it.dataUrl),
            }));
            const zip = this.buildZip(files);
            const blob = new Blob([zip], { type: 'application/zip' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'aquatic-havoc-skinpack.zip';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 2000);
            try { if (typeof audio !== 'undefined') audio.playSaveSuccess(); } catch (e) {}
            this.setStatus(`Exported ${files.length} skin${files.length === 1 ? '' : 's'} → aquatic-havoc-skinpack.zip`, true);
        } catch (e) {
            this.setStatus('Export failed: ' + (e && e.message ? e.message : e), false);
        }
    },

    async importPack(file) {
        if (!file) return;
        this.setStatus(`Reading ${file.name}…`, false);
        try {
            const buf = await file.arrayBuffer();
            const entries = await this.parseZip(new Uint8Array(buf));
            let installed = 0, skipped = 0;
            const bad = [];
            for (const e of entries) {
                const m = /^(guns|bobbers|fish)\/([^\\/]+)\.(png|jpg|jpeg|webp|gif)$/i.exec(e.name);
                if (!m) { skipped++; continue; }
                const loader = this._loaderFor(m[1].toLowerCase());
                const id = m[2];
                if (!loader || !id) { skipped++; continue; }
                try {
                    const dataUrl = this._bytesToDataUrl(e.bytes, this._mimeFor(e.name));
                    await this._setImage(loader, id, dataUrl);
                    installed++;
                } catch (err) {
                    bad.push(e.name);
                }
            }
            try { if (typeof audio !== 'undefined') audio.playUIClick(); } catch (e) {}
            let msg = `Installed ${installed} skin${installed === 1 ? '' : 's'}`;
            if (skipped) msg += `, skipped ${skipped} (not guns|bobbers|fish/*.png)`;
            if (bad.length) msg += ` — ${bad.length} unreadable: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`;
            this.setStatus(msg + '.', installed > 0);
            // Refresh any open shop tab so new art shows immediately.
            try {
                if (typeof Shop !== 'undefined' && Shop._tab) Shop.renderTab(typeof state !== 'undefined' ? state : null, Shop._tab);
            } catch (e) {}
        } catch (e) {
            this.setStatus('Import failed: ' + (e && e.message ? e.message : e), false);
        }
    },

    bindSettings() {
        try {
            const ex = document.getElementById('btn-asset-export');
            const im = document.getElementById('btn-asset-import');
            const fi = document.getElementById('asset-import-file');
            if (ex) ex.onclick = () => { try { this.exportPack(); } catch (e) {} };
            if (im && fi) {
                im.onclick = () => { try { fi.click(); } catch (e) {} };
                fi.onchange = () => {
                    try {
                        if (fi.files && fi.files[0]) this.importPack(fi.files[0]);
                        fi.value = '';
                    } catch (e) {}
                };
            }
        } catch (e) {}
    }
};

window.AssetPack = AssetPack;
try { AssetPack.bindSettings(); } catch (e) {}
