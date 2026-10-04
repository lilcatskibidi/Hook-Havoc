import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
let n = 0;
html = html.replace(/js\/[A-Za-z0-9_-]+\.js\?v=\d+/g, (m) => {
  n++;
  return m.replace(/\?v=\d+/, '?v=141');
});
writeFileSync(join(ROOT, 'index.html'), html);
console.log('bumped', n, 'script tags');
