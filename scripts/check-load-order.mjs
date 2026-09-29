#!/usr/bin/env node
/**
 * check-load-order.mjs — catches temporal-dead-zone (TDZ) crashes at load time.
 *
 * These files are classic <script> tags, not modules, so they all share one
 * global scope and execute top-to-bottom in the order index.html lists them.
 * A `const` is hoisted but NOT initialized, so if top-level code calls a
 * function that reads a `const` declared further down the same file, you get:
 *
 *   Uncaught ReferenceError: Cannot access 'state' before initialization
 *
 * That throw aborts the remainder of the script, so the game silently dies
 * half-way through initialising. This was a real bug in main.js (resizeCanvas
 * ran before `const state`), so the check runs in CI to stop it coming back.
 *
 * Usage: node scripts/check-load-order.mjs [dir]   (default: ./js)
 * Exits 1 if any hazard is found.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(ROOT, process.argv[2] ?? 'js');

if (!existsSafely(dir)) {
  console.error(`✖ No such directory: ${dir}`);
  process.exit(1);
}

function existsSafely(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Blank out comments and string/template literals, preserving offsets and
 *  newlines so character positions still map to the original line numbers. */
function scrub(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') out += ' ', i++;
    } else if (c === '/' && d === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += ' ';
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += ' ';
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const IDENT = /[A-Za-z_$][\w$]*/g;
const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;

/**
 * Yields identifiers that are genuine *variable reads*, skipping:
 *   - object-literal keys        { id: 1 }
 *   - member / optional access   a.b, a?.b
 * Neither touches a binding, so they can't hit the TDZ.
 */
function* varRefs(code) {
  for (const m of code.matchAll(IDENT)) {
    const after = code.slice(m.index + m[0].length);
    const before = code.slice(0, m.index);
    if (/^\s*:/.test(after) && !/^\s*::/.test(after)) continue;
    if (/\.\s*$/.test(before) || /\?\s*$/.test(before)) continue;
    yield m[0];
  }
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .sort();

let hazards = 0;

for (const file of files) {
  const src = scrub(readFileSync(join(dir, file), 'utf8'));

  // every declaration in this file -> the line it first appears on
  const declLine = new Map();
  for (const m of src.matchAll(/\b(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) {
    if (!declLine.has(m[1])) declLine.set(m[1], lineAt(src, m.index));
  }

  // top-level function declarations -> { body, header }
  const funcs = new Map();
  for (const m of src.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const brace = src.indexOf('{', m.index);
    if (brace === -1) continue;
    let depth = 0;
    let end = brace;
    for (let i = brace; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    funcs.set(m[1], { body: src.slice(brace, end + 1), header: src.slice(m.index, brace) });
  }

  // split top-level statements on `;` and on any brace closing back to depth 0
  const statements = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      if (--depth === 0) statements.push([start, i]), (start = i + 1);
    } else if (c === ';' && depth === 0) statements.push([start, i]), (start = i + 1);
  }

  const found = new Set();

  for (const [from, to] of statements) {
    const text = src.slice(from, to + 1);
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (/^(?:const|let|var|function|class|if|for|while|do|switch|try)\b/.test(trimmed)) continue;

    const at = lineAt(src, from);
    const shown = trimmed.replace(/\s+/g, ' ').slice(0, 54);

    // top-level code directly touching a later binding
    for (const id of varRefs(text)) {
      const l = declLine.get(id);
      if (l !== undefined && l > at) found.add(`  line ${at}: \`${shown}\` uses '${id}' declared at line ${l}`);
    }

    // top-level code calling a local function that touches a later binding
    for (const m of text.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const info = funcs.get(m[1]);
      if (!info) continue;
      const params = new Set([...info.header.matchAll(IDENT)].map((p) => p[0])); // params shadow
      for (const id of varRefs(info.body)) {
        if (params.has(id)) continue;
        const l = declLine.get(id);
        if (l !== undefined && l > at) found.add(`  line ${at}: \`${shown}\` calls ${m[1]}() -> '${id}' (line ${l})`);
      }
    }
  }

  if (found.size) {
    console.log(`\n${file}:`);
    [...found].forEach((f) => console.log(f));
    hazards += found.size;
  }
}

if (hazards) {
  console.log(`\n✖ ${hazards} load-order hazard(s).`);
  console.log('  Move the initialising call *after* the declaration, or hoist the declaration above it.\n');
  process.exit(1);
}

console.log(`✔ load order clean (${files.length} files scanned)`);
