// Regenerates assets/audio/manifest.json from the files actually on
// disk, so swapped customs (mp3 <-> wav) are found on first try.
// Run after adding/replacing sounds:  npm run gen-audio-manifest
//
// Keys MUST match SoundEngine.ASSETS keys in js/audio.js (e.g. `ui`,
// not `ui_click`; `music`, not `music_loop`). Filenames are mapped back
// through the ASSETS table, so aliased sounds resolve to the right key
// instead of their raw basename (the old generator wrote `music_loop`
// / `ui_click`, which the loader never looks up — those sounds always
// fell back to 404-probing or synth).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets', 'audio');
const EXTS = ['mp3', 'ogg', 'wav'];

// Parse `key: 'assets/audio/base'` pairs out of SoundEngine.ASSETS.
// (Static regex over the source — no need to boot the engine.)
let baseToKeys = {};
try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8');
    const re = /([A-Za-z0-9_]+)\s*:\s*['"]assets\/audio\/([A-Za-z0-9_]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
        const key = m[1], base = m[2];
        if (!baseToKeys[base]) baseToKeys[base] = [];
        if (!baseToKeys[base].includes(key)) baseToKeys[base].push(key);
    }
} catch (e) { baseToKeys = {}; }

const out = {};
for (const f of fs.readdirSync(DIR)) {
    const m = f.match(/^(.*)\.(mp3|ogg|wav)$/i);
    if (!m) continue;
    const base = m[1], ext = m[2].toLowerCase();
    // ASSETS key(s) for this file, or the raw basename for unknowns
    // (e.g. a future `dash.mp3` before any code references it).
    const keys = baseToKeys[base] || [base];
    for (const key of keys) {
        if (!out[key]) out[key] = [];
        if (!out[key].includes(ext)) out[key].push(ext);
    }
}
// manifest note preserved
let note = '';
try {
    const cur = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
    if (cur && typeof cur._note === 'string') note = cur._note;
} catch (e) {}
const ordered = {};
if (note) ordered._note = note;
for (const k of Object.keys(out).sort()) {
    // keep loader priority mp3 -> ogg -> wav
    ordered[k] = EXTS.filter(e => out[k].includes(e));
}
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(ordered, null, 4) + '\n');
console.log('audio manifest:', Object.keys(out).length, 'sounds -> assets/audio/manifest.json');
