#!/usr/bin/env node
/**
 * build-itch.mjs — packages Aquatic Havoc for itch.io
 *
 * itch.io expects a ZIP that contains `index.html` at the ROOT of the archive.
 * Zipping the whole repo would ship node_modules/, server.js and the docs, so
 * this script builds the archive from an explicit allow-list instead.
 *
 * Output:
 *   dist/itch/       staged folder (this is what `butler push` uploads)
 *   dist/itch.zip    archive (drag-and-drop upload to itch.io, or CI artifact)
 *
 * Usage:
 *   node scripts/build-itch.mjs
 *   node scripts/build-itch.mjs --out dist/itch.zip
 *
 * Zero dependencies — only Node built-ins (fs / path / zlib).
 */

import { deflateRawSync } from 'node:zlib';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ config */

// Must exist — itch.io will not launch the game without a root index.html.
const REQUIRED_FILES = ['index.html'];

// Shipped if present. index.html loads `css/style.css` and `js/*.js`.
const OPTIONAL_DIRS = ['css', 'js', 'assets', 'images', 'fonts', 'audio', 'sounds', 'media'];
const OPTIONAL_FILES = ['itch.json', 'favicon.ico', 'manifest.json'];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  '.vscode',
  '.idea',
  'dist',
  'scripts',
  'coverage',
  '.cache',
]);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini', '.gitkeep', '.gitignore', 'secret.js']);
const SKIP_EXT = new Set(['.map', '.log', '.md', '.psd', '.zip']);

// itch.io free hosting is fine with small games; warn early if something is off.
const SIZE_WARN_BYTES = 200 * 1024 * 1024;

/* ------------------------------------------------------------------- args */

function parseArgs(argv) {
  const opts = { out: join(ROOT, 'dist', 'itch.zip') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = resolve(ROOT, argv[++i] ?? 'dist/itch.zip');
    else if (argv[i] === '--help' || argv[i] === '-h') opts.help = true;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log('Usage: node scripts/build-itch.mjs [--out dist/itch.zip]');
  process.exit(0);
}

/* ------------------------------------------------------------ file gather */

function walk(absDir, out) {
  const entries = readdirSync(absDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(abs, out);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (SKIP_EXT.has(extname(entry.name).toLowerCase())) continue;
      out.push(abs);
    }
  }
  return out;
}

const collected = [];
const missing = [];

for (const name of REQUIRED_FILES) {
  const abs = join(ROOT, name);
  if (existsSync(abs) && statSync(abs).isFile()) collected.push(abs);
  else missing.push(name);
}

if (missing.length) {
  console.error(`\n✖ Missing required file(s): ${missing.join(', ')}`);
  console.error('  index.html must sit at the root of the project for itch.io.\n');
  process.exit(1);
}

for (const name of OPTIONAL_FILES) {
  const abs = join(ROOT, name);
  if (existsSync(abs) && statSync(abs).isFile()) collected.push(abs);
}

const presentDirs = [];
for (const name of OPTIONAL_DIRS) {
  const abs = join(ROOT, name);
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    presentDirs.push(name);
    walk(abs, collected);
  }
}

const entries = collected.map((abs) => ({
  abs,
  name: relative(ROOT, abs).split(sep).join(posix.sep), // forward slashes inside the zip
}));

/* -------------------------------------------------------------- zip writer */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// Fixed timestamp (2020-01-01 00:00) so identical sources produce identical
// archives — makes it obvious when a deploy changed real content.
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const data = file.data;
    const crc = crc32(data);

    const deflated = deflateRawSync(data, { level: 9 });
    const compress = deflated.length < data.length;
    const payload = compress ? deflated : data;
    const method = compress ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(0x031e, 4); // made by: unix, v3.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: -rw-r--r--
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

/* ------------------------------------------------------------------- build */

const outDir = join(ROOT, 'dist');
const stageDir = join(outDir, 'itch');
const outFile = opts.out;
const outFileDir = dirname(outFile);

console.log('\n🎮  Aquatic Havoc — building itch.io package\n');

rmSync(stageDir, { recursive: true, force: true });
rmSync(outFile, { force: true });
mkdirSync(stageDir, { recursive: true });
mkdirSync(outFileDir, { recursive: true });

let totalRaw = 0;
const files = [];

for (const entry of entries) {
  const data = readFileSync(entry.abs);
  totalRaw += data.length;
  files.push({ name: entry.name, data });

  const dest = join(stageDir, ...entry.name.split('/'));
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(entry.abs, dest);
}

const zip = buildZip(files);
writeFileSync(outFile, zip);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log(`   directories : ${presentDirs.join(', ') || '(none found — add css/ and js/)'}`);
console.log(`   files       : ${files.length}`);
console.log(`   staged dir  : ${relative(ROOT, stageDir)}`);
console.log(`   zip         : ${relative(ROOT, outFile)} (${kb(zip.length)}, from ${kb(totalRaw)} raw)`);
console.log('');

const rootEntries = files.map((f) => f.name);
if (!rootEntries.includes('index.html')) {
  console.error('✖ index.html is not at the archive root — itch.io will not launch it.\n');
  process.exit(1);
}
if (files.some((f) => f.name.startsWith('node_modules/') || f.name === 'server.js')) {
  console.error('✖ Archive contains server-side files. Adjust SKIP_DIRS/REQUIRED in the build script.\n');
  process.exit(1);
}
if (zip.length > SIZE_WARN_BYTES) {
  console.warn(`⚠ Archive is ${kb(zip.length)} — consider shrinking assets before uploading.\n`);
}

console.log('✔ itch.io package ready.\n');
console.log('  Manual upload : drag the zip onto https://itch.io/game/<your-game>/upload');
console.log('  CI upload     : push a v* tag, or run the "Deploy to itch.io" workflow');
console.log('');
