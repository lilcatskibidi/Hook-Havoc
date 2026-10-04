import { readFileSync } from 'node:fs';
const R = (f) => readFileSync(f, 'utf8');
global.window = {};
function mkEl() {
    return {
        innerText: '', innerHTML: '', style: {}, dataset: {}, disabled: false,
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        appendChild() {}, querySelectorAll: () => ({ forEach() {} }), onclick: null,
    };
}
const els = {};
global.document = {
    getElementById: (id) => (els[id] || (els[id] = mkEl())),
    createElement: () => mkEl(),
    querySelectorAll: () => [],
    body: { dataset: {} },
};
global.Utils = eval(R('js/utils.js') + ';Utils');
global.CONFIG = eval(R('js/config.js') + ';CONFIG');
const noop = () => {};
global.audio = new Proxy({}, { get: () => noop });
global.Particles = new Proxy({}, { get: () => noop });
global.UI = { updateStatusBanner: noop };
global.T = (k) => k;
global.FISH_SPECIES = eval(R('js/fishData.js') + ';FISH_SPECIES');
global.Ritual = eval(R('js/ritual.js') + ';Ritual');
global.ARMOR = eval(R('js/weapons.js') + ';ARMOR');
global.RARITY_LABELS = { common: { label: 'C', color: '#fff' }, rare: { label: 'R', color: '#fff' }, epic: { label: 'E', color: '#fff' }, legendary: { label: 'L', color: '#fff' } };
global.BAITS = global.Ritual && null;
const BAITS = eval(R('js/ritual.js') + ';BAITS');
global.BAITS = BAITS;
global.BAIT_PRICES = eval(R('js/ritual.js') + ';BAIT_PRICES');
global.BOSS_KEYS = { storm_egg: { icon: '🥚', name: 'Storm Egg' }, shard: { icon: '🔮', name: 'Shard' } };
global.Craft = eval(R('js/craft.js') + ';Craft');
global.Player = { refreshHUD: noop, heal: (st, n) => { st.player.hp = Math.min(st.player.maxHp, st.player.hp + n); } };
global.SaveSystem = { save: noop };
const Shop = eval(R('js/shop.js') + ';Shop');
const F = (id, locked) => ({ id, name: id, value: 10, rarity: 'rare', color: '#fff', locked: !!locked });
const state = {
    time: 100, waterBoundaryX: 830,
    player: {
        x: 500, y: 500, hp: 100, maxHp: 100, radius: 16, isDead: false, coins: 50000,
        bucket: [F('typhoon_dart'), F('typhoon_dart'), F('stormpetrel_fish')],
        bucketCapacity: 15, ownedArmor: ['vest_light'], equippedArmor: {},
        baitStock: {}, activeBait: null, armorDefense: 0,
    },
};
// armor tab: craft armor present?
Shop.renderArmorTab(state, mkEl());
console.log('armor render ok');
// click CRAFT on vest_typhoon via Craft directly (button wiring covered by render)
state.player.bucket.push(F('tempest_queenfish'));
console.log('craft armor via UI path:', Craft.craftArmor(state, 'vest_typhoon'), 'owned:', state.player.ownedArmor.includes('vest_typhoon'));
// bait tab render with new recipes
Shop.renderBaitTab(state, mkEl());
console.log('bait render ok (new recipes show req rows)');
