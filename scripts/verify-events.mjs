import { readFileSync } from 'node:fs';
const srcFish = readFileSync('js/fishData.js', 'utf8');
const srcUtils = readFileSync('js/utils.js', 'utf8');
const srcConfig = readFileSync('js/config.js', 'utf8');
const srcWorld = readFileSync('js/world.js', 'utf8');
const loadFish = (ret) => eval(srcFish + ';' + ret);
global.window = {};
global.document = { getElementById: () => null };
const U = eval(srcUtils + ';Utils');
const C = eval(srcConfig + ';CONFIG');
global.Utils = U; global.CONFIG = C;
global.WorldSystem = eval(srcWorld + ';WorldSystem');
global.audio = new Proxy({}, { get: () => () => {} });
const FISH_SPECIES = loadFish('FISH_SPECIES');
console.log('species total:', FISH_SPECIES.length);
const strict = FISH_SPECIES.filter(s => s.strict);
console.log('strict:', strict.length, '(expect 16)');
const byId = (id) => FISH_SPECIES.find(s => s.id === id);
console.log('has midnight_rainfish:', !!byId('midnight_rainfish'), 'maelstrom:', !!byId('maelstrom_titan'));
// strict gate: midnight_rainfish at noon clear must be excluded
const stNoon = { time: 100, waterBoundaryX: 830, player: { x: 700, y: 1500, equippedRod: { luck: 0 }, level: 1 }, fishing: { mode: 'IDLE', bobber: { x: 900, y: 1500 } }, world: { hour: 12, day: 1, weather: 'clear' } };
const stNight = { time: 100, waterBoundaryX: 830, player: { x: 700, y: 1500, equippedRod: { luck: 0 }, level: 1 }, fishing: { mode: 'IDLE', bobber: { x: 900, y: 1500 } }, world: { hour: 21, day: 1, weather: 'rain' } };
const WS = global.WorldSystem;
const mr = byId('midnight_rainfish');
console.log('midnight @noon-clear allowed:', WS.spawnAllowed(mr, stNoon), '(expect false)');
console.log('midnight @21h-rain allowed:', WS.spawnAllowed(mr, stNight), '(expect true)');
// event mult: typhoon storm at abyss for tempest_queenfish (non-strict? tempest has no strict -> allowed; typhoon target)
const stStorm = { time: 100, waterBoundaryX: 830, player: { x: 9700, y: 1500, onIsland: 'isle_abyss', equippedRod: { luck: 0 }, level: 1 }, fishing: { mode: 'IDLE', bobber: { x: 14000, y: 1500 } }, world: { hour: 14, day: 1, weather: 'storm' } };
console.log('active events @storm:', WS.activeEvents(stStorm).map(e => e.id).join(','));
const tq = byId('tempest_queenfish');
console.log('tempest bonus @abyss-storm:', WS.bonusFor(tq, stStorm).toFixed(2), '(expect >= 3ish with typhoon x3)');
console.log('tempest bonus @main-clear-noon:', WS.bonusFor(tq, stNoon).toFixed(2), '(expect low)');
// roll distribution sanity: 2000 rolls at storm-abyss-night — strict species appear, commons dominate
global.Ritual = { equippedBait: () => null };
global.Particles = { showFloatingText: () => {} };
const rollFishSpecies = loadFish('rollFishSpecies');
const stBoss = { time: 100, waterBoundaryX: 830, player: { x: 14000, y: 1500, onIsland: 'isle_abyss', equippedRod: { luck: 0 }, level: 1 }, fishing: { mode: 'IDLE', bobber: { x: 14000, y: 1500 } }, world: { hour: 2, day: 1, weather: 'storm' } };
const counts = {};
for (let i = 0; i < 10000; i++) {
    const sp = rollFishSpecies(stBoss);
    if (!sp || !sp.id) continue;
    counts[sp.id] = (counts[sp.id] || 0) + 1;
}
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('top bites @02h-storm-abyss:', top.map(([id, n]) => `${id}:${n}`).join(' '));
console.log('maelstrom hits:', counts['maelstrom_titan'] || 0, '(expect >0 over 10000)');
// midnight at noon-clear must NEVER appear
const counts2 = {};
for (let i = 0; i < 10000; i++) {
    const sp = rollFishSpecies(stNoon);
    if (sp && sp.id) counts2[sp.id] = (counts2[sp.id] || 0) + 1;
}
console.log('midnight hits @noon-clear:', counts2['midnight_rainfish'] || 0, '(expect 0)');
console.log('typhoon_wyrm @noon-clear:', counts2['typhoon_wyrm'] || 0, '(expect 0)');
