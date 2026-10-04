import { readFileSync } from 'node:fs';
const srcRitual = readFileSync('js/ritual.js', 'utf8');
const srcShop = readFileSync('js/shop.js', 'utf8');
const srcWeapons = readFileSync('js/weapons.js', 'utf8');
const srcCraft = readFileSync('js/craft.js', 'utf8');
const srcFish = readFileSync('js/fishData.js', 'utf8');
const srcUtils = readFileSync('js/utils.js', 'utf8');
const srcConfig = readFileSync('js/config.js', 'utf8');
global.window = {};
global.document = { getElementById: () => null };
global.Utils = eval(srcUtils + ';Utils');
global.CONFIG = eval(srcConfig + ';CONFIG');
const noop = () => {};
global.audio = new Proxy({}, { get: () => noop });
global.Particles = new Proxy({}, { get: () => noop });
global.UI = { updateStatusBanner: noop };
global.T = (k) => k;
global.FISH_SPECIES = eval(srcFish + ';FISH_SPECIES');
global.BAITS = eval(srcRitual + ';BAITS');
global.Ritual = eval(srcRitual + ';Ritual');
global.ARMOR = eval(srcWeapons + ';ARMOR');
global.Shop = eval(srcShop + ';Shop');
global.Player = { refreshHUD: noop, heal: (st, n) => { st.player.hp = Math.min(st.player.maxHp, st.player.hp + n); } };
global.SaveSystem = { save: noop };
global.AntiCheat = {};
const Craft = eval(srcCraft + ';Craft');
const F = (id, locked) => ({ id, name: id, value: 10, rarity: 'rare', color: '#fff', locked: !!locked });
const st = {
    time: 100, waterBoundaryX: 830,
    player: {
        x: 500, y: 500, hp: 100, maxHp: 100, radius: 16, isDead: false, coins: 5000,
        bucket: [F('typhoon_dart'), F('typhoon_dart'), F('stormpetrel_fish'), F('bloodfin_tetra', true)],
        bucketCapacity: 15, ownedArmor: ['vest_light'], equippedArmor: {}, baitStock: {},
    },
};
// 1. bait craft success: stormchum needs dartx2 + petrel + 800c
console.log('stormchum check:', JSON.stringify(Craft.check(st, { coins: 800, fish: [{ id: 'typhoon_dart', n: 2 }, { id: 'stormpetrel_fish', n: 1 }] })));
console.log('craft:', Craft.craftBait(st, 'stormchum'), 'stock:', st.player.baitStock.stormchum, 'coins:', st.player.coins, 'bucket left:', st.player.bucket.length, '(expect true 8 4200 1)');
// 2. locked bloodfin NOT eaten
console.log('locked count:', Craft.fishCount(st, 'bloodfin_tetra'), '(expect 0)');
// 3. fail path: moonpaste needs bloodmoon_raya (missing)
console.log('moonpaste check ok:', Craft.check(st, { coins: 1500, fish: [{ id: 'bloodmoon_raya', n: 1 }] }).ok, '(expect false)');
// 4. armor craft: give mats for vest_typhoon (tempest x1 + dart x2 + 8000c)
st.player.bucket.push(F('tempest_queenfish'), F('typhoon_dart'), F('typhoon_dart'));
st.player.coins = 20000;
console.log('armor craft:', Craft.craftArmor(st, 'vest_typhoon'), 'owned:', st.player.ownedArmor.includes('vest_typhoon'), 'equipped chest:', st.player.equippedArmor.chest, 'coins:', st.player.coins, '(expect true true vest_typhoon 12000)');
// 5. already owned -> refuse
console.log('recraft refuse:', Craft.craftArmor(st, 'vest_typhoon') === false, '(expect true)');
// 6. old tier recipes untouched
console.log('old worm recipe:', JSON.stringify(global.Ritual.canCraft(st, 'worm')));
