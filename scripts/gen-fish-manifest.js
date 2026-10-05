// Lists shipped fish art into assets/fish/manifest.json so the game
// never 404-probes species without PNGs. Run after adding art:
//   node scripts/gen-fish-manifest.mjs
// Lazy loader consults this allowlist; misses stay procedural with
// zero requests. Player uploads (localStorage) always bypass it.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets', 'fish');
fs.mkdirSync(DIR, { recursive: true });
const ids = fs.readdirSync(DIR)
  .filter(f => f.toLowerCase().endsWith('.png'))
  .map(f => f.slice(0, -4))
  .sort();
const out = { ids };
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(out));
console.log('fish art:', ids.length ? ids.join(', ') : '(none)', '-> assets/fish/manifest.json');
