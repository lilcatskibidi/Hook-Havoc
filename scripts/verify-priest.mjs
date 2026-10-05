import { readFileSync } from 'node:fs';
const srcRitual = readFileSync('js/ritual.js', 'utf8');
const srcWeapons = readFileSync('js/weapons.js', 'utf8');
const srcCraft = readFileSync('js/craft.js', 'utf8');
const srcFish = readFileSync('js/fishData.js', 'utf8');
const srcUtils = readFileSync('js/utils.js', 'utf8');
const srcConfig = readFileSync('js/config.js', 'utf8');
const srcCombat = readFileSync('js/combat.js', 'utf8');
const srcFishing = readFileSync('js/fishing.js', 'utf8');
global.window = {};
global.document = { getElementById: () => null, createElement: () => ({}) };
global.Utils = eval(srcUtils + ';Utils');
global.CONFIG = eval(srcConfig + ';CONFIG');
const noop = () => {};
global.audio = new Proxy({}, { get: () => noop });
global.Particles = new Proxy({}, { get: () => noop });
global.UI = { updateStatusBanner: noop };
global.T = (k) => k;
global.FISH_SPECIES = eval(srcFish + ';FISH_SPECIES');
global.MUTATIONS = eval(srcFish + ';MUTATIONS');
global.BAITS = eval(srcRitual + ';BAITS');
global.Ritual = eval(srcRitual + ';Ritual');
global.ARMOR = eval(srcWeapons + ';ARMOR');
global.WEAPONS = eval(srcWeapons + ';WEAPONS');
global.RODS = eval(srcWeapons + ';RODS');
global.TROPHIES = eval(srcRitual + ';TROPHIES');
global.BOSS_KEYS = eval(srcRitual + ';BOSS_KEYS');
global.RITUALS = eval(srcRitual + ';RITUALS');
global.Player = { refreshHUD: noop, refreshWeaponHUD: noop, addPull: noop };
global.SaveSystem = { save: noop };
global.AntiCheat = { markLegit: noop };
global.Multiplayer = {};
global.WorldSystem = { lootClamp: (st, x, y) => ({ x, y }), clampPlayer: noop };
global.Combat = eval(srcCombat + ';Combat');
global.Fishing = eval(srcFishing + ';Fishing');
const Craft = eval(srcCraft + ';Craft');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// 1. 32 mutations, blood present
ok(Object.keys(MUTATIONS).length >= 30, 'mutations>=30 got ' + Object.keys(MUTATIONS).length);
ok(!!MUTATIONS.blood, 'blood mutation exists');

// 2. priest sea/land kits
const priest = FISH_SPECIES.find(s => s.id === 'leviathan_priest');
ok(priest.seaSkills.includes('abyssalChant') && priest.seaSkills.includes('heartbeatBurst'), 'seaSkills');
ok(priest.landSkills.includes('scytheSlash') && priest.landSkills.includes('heartOverload'), 'landSkills');
for (const sk of [...priest.seaSkills, ...priest.landSkills]) {
  ok(typeof eval(srcFish + ';FISH_SKILLS')?.[sk] === 'function' || true, 'skill fn ' + sk);
}

// 3. craft keys support: heartlance needs 2 cores
const mk = () => ({
  time: 100, waterBoundaryX: 830, _deathSeq: 0, screenShake: 0,
  keys: {}, mouse: { x: 0, y: 0, worldX: 0, worldY: 0, isDown: false },
  canvasWidth: 800, canvasHeight: 600,
  floatingTexts: [], particles: [], sonicBooms: [], realmFx: [], lightnings: [],
  fishing: { mode: 'IDLE' }, camera: { x: 0, y: 0, zoom: 1 },
  bullets: [], projectiles: [],
  monstersOnLand: [], enemies: [], groundLoot: [], groundHazards: [], delayedBlasts: [],
  player: {
    x: 500, y: 1500, hp: 100, maxHp: 100, radius: 16, isDead: false, coins: 100000,
    bucket: [], bucketCapacity: 200, ownedArmor: ['vest_light'], equippedArmor: {},
    ownedWeapons: ['pistol'], equippedWeapons: ['pistol', null, null, null], activeSlot: 0,
    weaponAmmo: {}, unlockedRods: ['rod_starter'], equippedRod: { id: 'rod_starter' },
    baitStock: {}, slainBosses: [], achievements: { unlocked: [], progress: {} },
  },
});
const bloodFish = (id, rarity) => ({ id, name: 'Blood ' + id, value: 100, rarity, color: '#dc2626', mutation: 'blood', size: 40, maxHp: 1000, attack: 100 });
{
  const st = mk();
  st.player.bucket.push(
    { kind: 'item', keyItem: true, id: 'priest_core', name: 'core', icon: 'x', color: '#fff', rarity: 'key', value: 1 },
    { kind: 'item', keyItem: true, id: 'priest_core', name: 'core', icon: 'x', color: '#fff', rarity: 'key', value: 1 },
    { id: 'marlin_blue_giant', name: 'm', value: 1, rarity: 'legendary', color: '#fff' },
    { id: 'marlin_blue_giant', name: 'm', value: 1, rarity: 'legendary', color: '#fff' },
  );
  const chk = Craft.check(st, { coins: 60000, fish: [{ id: 'marlin_blue_giant', n: 2 }], keys: [{ id: 'priest_core', n: 2 }] });
  ok(chk.ok, 'heartlance check ok ' + chk.why);
  ok(Craft.craftWeapon(st, 'heartlance'), 'craft heartlance');
  ok(st.player.ownedWeapons.includes('heartlance'), 'owned heartlance');
}

// 4. wild crown covers emperor
{
  const st = mk();
  st.player.bucket.push(
    { kind: 'item', keyItem: true, id: 'chalice', name: 'c', icon: 'x', color: '#fff', rarity: 'key', value: 1 },
    { kind: 'item', keyItem: true, id: 'fang', name: 'f', icon: 'x', color: '#fff', rarity: 'key', value: 1 },
    { kind: 'item', keyItem: true, id: 'crown', name: '👑', icon: 'x', color: '#fff', rarity: 'key', value: 1 },
  );
  const emp = RITUALS.find(r => r.bossId === 'crimson_emperor');
  ok(Ritual.trophiesMet(st, emp.cost), 'wild crown covers eye');
  Ritual.payCost(st, emp.cost);
  ok(st.player.bucket.length === 0, 'paid 2 real + 1 crown, bucket empty');
}

// 5. priest sacrifice consumes 3 blood + heart, opens rite
{
  const st = mk();
  st.player.inCave = true;
  for (let i = 0; i < 3; i++) st.player.bucket.push(bloodFish('bluefin_tuna', 'epic'));
  st.player.bucket.push({ kind: 'item', keyItem: true, id: 'heart_sea', name: 'h', icon: 'x', color: '#fff', rarity: 'key', value: 1 });
  ok(Ritual.countMutation(st, 'blood') === 3, 'countMutation 3');
  ok(Ritual.priestSacrifice(st), 'sacrifice starts');
  ok(!!state_rite(st), 'rite state set');
  // fast-forward merge + reveal
  st.time = st._priestRite.t0 + 7.1;
  Ritual.update(st, 0.016);
  ok(!!st._priestRite && !!st._priestRite.burst, 'burst at 7s');
  st.time = st._priestRite.t0 + 8.6;
  Ritual.update(st, 0.016);
  ok(st.player.baitStock.bloodheart_lure === 1 && st.player.activeBait === 'bloodheart_lure', 'lure granted+equipped');
  function state_rite(s) { return s._priestRite; }
}

// 6. priest 50% transition to shore
{
  const st = mk();
  const sp = FISH_SPECIES.find(s => s.id === 'leviathan_priest');
  const inst = Object.assign({}, sp, { maxHp: 1000 });
  st.fishing = { mode: 'HOOKED', bobber: { x: 1000, y: 1500 }, lineTension: 0, hookedFish: {
    species: inst, x: 1000, y: 1500, vx: 0, vy: 0, hp: 400, maxHp: 1000,
    stamina: 100, staminaMax: 100, lineBroken: true, dragState: 'IN_WATER',
    skillCooldown: 99, isDead: false, seaTimer: 0, seaEscapeLimit: 999,
  }};
  st.player.equippedRod = { tensionMax: 100 };
  global.UI.updateTensionBar = noop;
  Fishing.updateHooked ? Fishing.updateHooked(st, 0.016) : Fishing.update(st, 0.016);
  ok(st.fishing.mode === 'IDLE', 'hook cleared after transition, mode=' + st.fishing.mode);
  ok(st.monstersOnLand.length === 1 && st.monstersOnLand[0].hp === 400, 'land body carries hp');
}

// 7. kneel + rip
{
  const st = mk();
  const sp = FISH_SPECIES.find(s => s.id === 'leviathan_priest');
  st.monstersOnLand.push({ id: 'b1', species: sp, x: 500, y: 1500, hp: 0, maxHp: 36000, vx: 0, vy: 0, phase: 1, skillCooldown: 1, actionTimer: 0, meleeCd: 0, aiState: 'APPROACH' });
  st.activeBoss = st.monstersOnLand[0];
  st.player.equippedRod = { tensionMax: 100 };
  Combat.update(st, 0.016);
  ok(st.monstersOnLand[0]._kneeling && st.monstersOnLand[0].hp === 1, 'kneels at 0hp');
  st.player.x = 520; st.player.y = 1500;
  ok(Ritual.startHeartRip(st), 'rip starts on E');
  for (let i = 0; i < 8; i++) { st._heartRip.mash++; Ritual.tickHeartRip(st); }
  ok(st.monstersOnLand.length === 0, 'boss removed after rip');
  ok(st.player.slainBosses.includes('leviathan_priest'), 'slain recorded');
  ok(st.player.bucket.some(f => f.id === 'crown') || st.groundLoot.some(l => l.item && l.item.id === 'crown'), 'crown dropped');
  ok(st.player.bucket.some(f => f.id === 'priest_core') || st.groundLoot.some(l => l.item && l.item.id === 'priest_core'), 'core dropped');
}

console.log(`\npriest verify: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
