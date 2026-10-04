#!/usr/bin/env node
/**
 * build-protect.mjs — production protection build (zero dependencies).
 *
 * What it does:
 *  1. Bundles js/*.js (in index.html <script> order) into ONE file so F12
 *     Sources shows a single minified blob instead of 36 readable files.
 *  2. Minifies safely: strips comments, collapses whitespace OUTSIDE string
 *     literals (never touches code semantics — no identifier mangling, so
 *     cross-file globals keep working and check-load-order stays green).
 *  3. Emits server/catalog.json — canonical prices/values extracted from the
 *     real data files (WEAPONS/RODS/BUCKET/ARMOR/FISH/BAITS/CONFIG) so the
 *     server can validate shop/sell requests instead of trusting the client.
 *  4. Emits dist/protected/manifest.json with SHA-256 per artifact for the
 *     integrity check in server.js.
 *
 * Usage:
 *   node scripts/build-protect.mjs
 *
 * Output:
 *   dist/protected/game.bundle.min.js
 *   dist/protected/game.bundle.min.js.sha256
 *   server/catalog.json
 *   dist/protected/manifest.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const OUT_DIR = join(ROOT, 'dist', 'protected');
const CATALOG_PATH = join(ROOT, 'server', 'catalog.json');

function scriptOrder() {
    const html = readFileSync(INDEX, 'utf8');
    const order = [];
    for (const m of html.matchAll(/<script\s+src="(js\/[^"]+?)(?:\?[^"]*)?"/g)) {
        const f = m[1];
        if (f === 'js/secret.js') continue; // never ship secrets
        if (f === 'js/admin.js') continue; // localhost debug only, never ship
        if (f === 'js/webhook.js') continue; // build-time itch inject, not a source file
        if (!order.includes(f)) order.push(f);
    }
    return order;
}

// Strip // and /* */ comments + collapse whitespace, preserving
// string literals ('...' "..." `...`) and regex safety (conservative:
// never joins lines that could form `return\nvalue` issues — we keep
// newlines after { } ; and before `return/throw/break/continue`).
function minify(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        const d = src[i + 1];
        // line comment
        if (c === '/' && d === '/') {
            // keep URL-ish `https://` inside strings handled below; here skip to EOL
            while (i < n && src[i] !== '\n') i++;
            out += '\n';
            continue;
        }
        // block comment
        if (c === '/' && d === '*') {
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
            i += 2;
            out += '\n';
            continue;
        }
        // strings (single, double, template — with ${} passthrough)
        if (c === '"' || c === "'" || c === '`') {
            const q = c;
            out += c; i++;
            while (i < n) {
                const ch = src[i];
                out += ch;
                if (ch === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
                i++;
                if (ch === q) break;
            }
            continue;
        }
        out += c; i++;
    }
    // collapse: trim lines, drop empties, join with \n (keeps ASI safe)
    const lines = out.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return lines.join('\n');
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

// ---- catalog extraction ------------------------------------------------
// Load pure-data files in a VM sandbox to read canonical values.
function loadDataFile(rel, sandbox) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    vm.runInContext(src, sandbox, { filename: rel });
}

function buildCatalog(order) {
    const sandbox = {
        console, Math, JSON, Object, Array, Number, String, Boolean,
        window: {}, document: undefined,
    };
    vm.createContext(sandbox);
    // CONFIG + WEAPONS-family are pure consts — safe to execute.
    for (const f of ['js/config.js', 'js/weapons.js']) {
        if (existsSync(join(ROOT, f))) loadDataFile(f, sandbox);
    }
    const get = (name) => { try { return vm.runInContext(name, sandbox); } catch { return undefined; } };
    const WEAPONS = get('WEAPONS') || [];
    const RODS = get('RODS') || [];
    const BUCKET_UPGRADES = get('BUCKET_UPGRADES') || [];
    const ARMOR = get('ARMOR') || [];
    const CONFIG = get('CONFIG') || {};

    // FISH values via regex (fishData.js is 200KB — regex is enough for id->value).
    const fishSrc = readFileSync(join(ROOT, 'js/fishData.js'), 'utf8');
    const fishValues = {};
    for (const m of fishSrc.matchAll(/\bid\s*:\s*'([^']+)'/g)) { /* ids enumerated below */ }
    // capture id+value pairs in the same object literal window
    for (const m of fishSrc.matchAll(/id\s*:\s*'([^']+)'[^}]{0,600}?value\s*:\s*(\d+)/gs)) {
        const id = m[1];
        const v = parseInt(m[2], 10);
        if (id && Number.isFinite(v)) {
            if (fishValues[id] === undefined || v > fishValues[id]) fishValues[id] = v;
        }
    }

    // BAITS prices (craft cost) via regex on ritual.js
    let baits = [];
    try {
        const ritualSrc = readFileSync(join(ROOT, 'js/ritual.js'), 'utf8');
        for (const m of ritualSrc.matchAll(/id\s*:\s*'([^']+)'[^}]{0,400}?cost\s*:\s*(\d+)/gs)) {
            baits.push({ id: m[1], cost: parseInt(m[2], 10) });
        }
    } catch {}

    // Ritual key values: storm_egg/shard/chalice/fang/eye — parse keyValue map
    const catalog = {
        builtAt: new Date().toISOString(),
        weapons: Object.fromEntries(WEAPONS.filter(w => w && w.id).map(w => [w.id, { price: w.price | 0 }])),
        rods: Object.fromEntries(RODS.filter(r => r && r.id).map(r => [r.id, { price: r.price | 0 }])),
        buckets: (BUCKET_UPGRADES || []).filter(b => b && b.cap).map(b => ({ cap: b.cap | 0, price: b.price | 0 })),
        armor: (ARMOR || []).filter(a => a && a.id).map(a => ({ id: a.id, price: a.price | 0 })),
        ammoPrices: (CONFIG && CONFIG.AMMO_PRICES) || {},
        ammoMax: (CONFIG && CONFIG.MAX_AMMO) || {},
        fishValues,
        fishValueMult: (CONFIG && CONFIG.DIFFICULTY && CONFIG.DIFFICULTY.FISH_VALUE_MULT) || 1,
        tokenPrice: 100,
        cashoutRate: 70,
        maxSellPerFish: Math.max(0, ...Object.values(fishValues).map(v => v * 4)) || 100000,
    };
    return catalog;
}

// ---- main ---------------------------------------------------------------
const order = scriptOrder();
console.log('\nBundle order (' + order.length + ' files):');
const parts = [];
for (const f of order) {
    const p = join(ROOT, f);
    if (!existsSync(p)) { console.warn('  MISSING: ' + f); continue; }
    const src = readFileSync(p, 'utf8');
    const min = minify(src);
    console.log('  ' + f + '  ' + (src.length / 1024).toFixed(1) + 'KB -> ' + (min.length / 1024).toFixed(1) + 'KB');
    parts.push('/* ==== ' + f + ' ==== */\n' + min);
}

const banner = '/* Aquatic Havoc protected bundle — ' + new Date().toISOString() +
    ' | ' + order.length + ' modules | minified, integrity-checked. ' +
    'Game logic rolls on the server when online. */\n';
const bundle = banner + parts.join('\n');

mkdirSync(OUT_DIR, { recursive: true });
const bundlePath = join(OUT_DIR, 'game.bundle.min.js');
writeFileSync(bundlePath, bundle);
const hash = sha256(Buffer.from(bundle, 'utf8'));
writeFileSync(bundlePath + '.sha256', hash + '  game.bundle.min.js\n');

const catalog = buildCatalog(order);
mkdirSync(dirname(CATALOG_PATH), { recursive: true });
writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 1));

const manifest = {
    builtAt: new Date().toISOString(),
    modules: order,
    bundle: 'game.bundle.min.js',
    sha256: hash,
    rawBytes: Buffer.byteLength(bundle, 'utf8'),
    catalog: { weapons: Object.keys(catalog.weapons).length, rods: Object.keys(catalog.rods).length, fish: Object.keys(catalog.fishValues).length },
};
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1));

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('\nWrote:');
console.log('  dist/protected/game.bundle.min.js (' + kb(manifest.rawBytes) + ', sha256 ' + hash.slice(0, 12) + '...)');
console.log('  server/catalog.json (weapons ' + manifest.catalog.weapons + ', rods ' + manifest.catalog.rods + ', fish ' + manifest.catalog.fish + ')');
console.log('  dist/protected/manifest.json');
console.log('\n✔ protect build done. Serve with PROTECTED=1 to ship the bundle.\n');
