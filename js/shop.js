const RARITY_LABELS = {
    common:    { label: 'Common',    color: '#94a3b8' },
    rare:      { label: 'Rare',      color: '#38bdf8' },
    epic:      { label: 'Epic',      color: '#a855f7' },
    legendary: { label: 'Legendary', color: '#f59e0b' },
    mythic:    { label: 'Mythic',    color: '#e879f9' },
    boss:      { label: 'BOSS',      color: '#ef4444' }
};

const Shop = {
    // Open the shop modal on a specific tab. The world SHOP circle opens
    // the Beach tab — yes, SHOP and the beach shop are the same shop.
    openShop(state, tab = 'sell') {
        const modal = document.getElementById('shop-modal');
        if (!modal) return;
        try { audio.playUIClick(); } catch (e) {}
        this.renderTab(state, tab);
        modal.classList.remove('hidden');
        const mpHud = document.getElementById('mp-hud');
        if (mpHud) mpHud.classList.add('hidden');
        Player.refreshHUD(state);
    },

    openBeach(state) {
        this.openShop(state, 'beach');
    },

    closeShop(state) {
        const modal = document.getElementById('shop-modal');
        if (modal) modal.classList.add('hidden');
        const mpHud = document.getElementById('mp-hud');
        if (mpHud && state.multiplayer && state.multiplayer.isConnected) mpHud.classList.remove('hidden');
    },

    init(state) {
        const modal = document.getElementById('shop-modal');
        const mpHud = document.getElementById('mp-hud');

        document.getElementById('btn-open-shop').onclick = () => {
            try { audio.playUIClick(); } catch (e) {}
            this.renderTab(state, 'sell');
            modal.classList.remove('hidden');
            if (mpHud) mpHud.classList.add('hidden'); // Hide MP HUD when shop opens
            Player.refreshHUD(state);
        };

        document.querySelectorAll('.shop-close').forEach(b => {
            b.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                modal.classList.add('hidden');
                if (mpHud && state.multiplayer && state.multiplayer.isConnected) {
                    mpHud.classList.remove('hidden'); // Show MP HUD when shop closes
                }
            };
        });

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderTab(state, btn.id.replace('tab-', ''));
            };
        });

        document.getElementById('btn-sell-all').onclick = () => {
            const total = state.player.bucket.reduce((acc, f) => acc + (f.value || 0), 0);
            if (total === 0) {
                try { audio.playError(); } catch (e) {}
                return;
            }
            state.player.coins += total;
            state.player.bucket = [];
            try { audio.playCoin(); } catch (e) {}
            Player.addXP(state, Math.round(total / 5));
            Player.refreshHUD(state);
            if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            this.renderTab(state, 'sell');
        };
    },

    renderTab(state, tab) {
        const content = document.getElementById('shop-content');
        content.innerHTML = '';

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const activeTab = document.getElementById('tab-' + tab);
        if (activeTab) activeTab.classList.add('active');

        if (tab === 'sell')         this.renderSell(state, content);
        else if (tab === 'weapons') this.renderWeapons(state, content);
        else if (tab === 'rods')    this.renderRods(state, content);
        else if (tab === 'armor')   this.renderArmorTab(state, content);
        else if (tab === 'ammo')    this.renderAmmo(state, content);
        else if (tab === 'casino')  this.renderCasinoTab(state, content);
        else if (tab === 'beach')   this.renderBeachTab(state, content);
    },

    renderSell(state, content) {
        let totalVal = 0;
        const bucket = state.player.bucket;

        if (!bucket || bucket.length === 0) {
            content.innerHTML = `<div class="text-center py-16">
                <i class="fa-solid fa-fish text-5xl text-slate-700 mb-3"></i>
                <p class="text-slate-500 text-sm">Your fishing bucket is empty!</p>
            </div>`;
        } else {
            const grouped = {};
            bucket.forEach(fish => {
                if (!grouped[fish.id]) grouped[fish.id] = { species: fish, count: 0 };
                grouped[fish.id].count++;
                totalVal += (fish.value || 0);
            });

            Object.values(grouped).forEach(({ species, count }) => {
                const r = RARITY_LABELS[species.rarity] || RARITY_LABELS.common;
                const div = document.createElement('div');
                div.className = `shop-item glass-panel-light p-3 rounded-xl flex items-center justify-between rarity-${species.rarity}`;
                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                             style="background:${species.color}30;border:1px solid ${species.color}">
                            <i class="fa-solid fa-fish" style="color:${species.color}"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-white text-sm">${species.name}</span>
                                <span class="text-[10px] font-black px-1.5 py-0.5 rounded"
                                      style="background:${r.color}20;color:${r.color}">${r.label}</span>
                            </div>
                            <span class="text-xs text-slate-400">×${count} · ${species.value}c each</span>
                        </div>
                    </div>
                    <span class="text-amber-400 font-bold">
                        <i class="fa-solid fa-coins mr-1"></i>${species.value * count}
                    </span>
                `;
                content.appendChild(div);
            });
        }

        const totalEl = document.getElementById('shop-total-val');
        if (totalEl) totalEl.innerText = `${totalVal} Coins`;

        const sellBtn = document.getElementById('btn-sell-all');
        if (sellBtn) sellBtn.disabled = (totalVal === 0);
    },

    renderWeapons(state, content) {
        const p = state.player;

        WEAPONS.forEach((w, idx) => {
            const owned = p.ownedWeapons.includes(w.id);
            const equippedAt = p.equippedWeapons.indexOf(w.id);
            const r = RARITY_LABELS[w.rarity] || RARITY_LABELS.common;

            const div = document.createElement('div');
            div.className = `shop-item glass-panel-light p-4 rounded-xl flex items-center justify-between rarity-${w.rarity}`;

            const leftHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900/60 border border-slate-700">
                        <i class="fa-solid ${w.icon} text-amber-400 text-lg"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-bold text-white text-base">${w.name}</h3>
                            <span class="text-[10px] font-black px-1.5 py-0.5 rounded"
                                  style="background:${r.color}20;color:${r.color}">${r.label}</span>
                            ${equippedAt !== -1
                                ? `<span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">SLOT ${equippedAt + 1}</span>`
                                : ''}
                        </div>
                        <p class="text-xs text-slate-400 mt-0.5">${w.desc}</p>
                        <div class="flex gap-3 mt-1 text-[10px] font-bold">
                            <span class="text-rose-400">DMG ${w.damage}</span>
                            <span class="text-amber-400">${w.pellets}</span>
                            <span class="text-sky-400">RNG ${w.range}</span>
                        </div>
                    </div>
                </div>
            `;

            const right = document.createElement('div');
            right.className = 'flex flex-col items-end gap-1 shrink-0';

            if (!owned) {
                const btn = document.createElement('button');
                btn.className = 'btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl';
                btn.innerText = `${w.price} C`;
                btn.disabled = p.coins < w.price;
                btn.onclick = () => {
                    if (p.coins < w.price) {
                        try { audio.playError(); } catch (e) {}
                        return;
                    }
                    p.coins -= w.price;
                    p.ownedWeapons.push(w.id);

                    if (w.id !== 'pistol' && p.weaponAmmo[w.id] === undefined) {
                        p.weaponAmmo[w.id] = CONFIG.MAX_AMMO[w.id] || 0;
                    }

                    try { audio.playCoin(); } catch (e) {}
                    Player.refreshHUD(state);
                    Player.refreshWeaponHUD(state);
                    UI.renderWeaponToolbar(state);
                    if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
                    if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                    this.renderTab(state, 'weapons');
                };
                right.appendChild(btn);
            } else {
                const label = document.createElement('div');
                label.className = 'text-[9px] text-slate-400 font-bold uppercase';
                label.innerText = 'Equip to slot';
                right.appendChild(label);

                const slotRow = document.createElement('div');
                slotRow.className = 'flex gap-1';

                for (let i = 0; i < EQUIP_SLOTS; i++) {
                    const slotBtn = document.createElement('button');
                    const isHere = p.equippedWeapons[i] === w.id;
                    slotBtn.className = `w-7 h-7 rounded-md text-[11px] font-black border transition ${
                        isHere
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
                    }`;
                    slotBtn.innerText = i + 1;
                    slotBtn.onclick = () => {
                        try { audio.playUIClick(); } catch (e) {}
                        UI.equipToSlot(state, w.id, i);
                        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                        this.renderTab(state, 'weapons');
                    };
                    slotRow.appendChild(slotBtn);
                }
                right.appendChild(slotRow);

                if (equippedAt !== -1 && w.id !== 'pistol') {
                    const un = document.createElement('button');
                    un.className = 'text-[9px] text-rose-400 hover:text-rose-300 font-bold mt-0.5';
                    un.innerText = 'Unequip';
                    un.onclick = () => {
                        try { audio.playUIClick(); } catch (e) {}
                        UI.unequipSlot(state, equippedAt);
                        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                        this.renderTab(state, 'weapons');
                    };
                    right.appendChild(un);
                }
            }

            div.innerHTML = leftHTML;
            div.appendChild(right);
            content.appendChild(div);
        });
    },

    renderRods(state, content) {
        const p = state.player;

        RODS.forEach((r, idx) => {
            const isEquipped = p.equippedRod && p.equippedRod.id === r.id;
            const isUnlocked = p.unlockedRods.includes(r.id);
            const rar = RARITY_LABELS[r.rarity] || RARITY_LABELS.common;

            const div = document.createElement('div');
            div.className = `shop-item glass-panel-light p-4 rounded-xl flex items-center justify-between rarity-${r.rarity}`;
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center"
                         style="background:${r.color}20;border:1px solid ${r.color}60">
                        <i class="fa-solid fa-fish-fins" style="color:${r.color}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="font-bold text-white text-base">${r.name}</h3>
                            <span class="text-[10px] font-black px-1.5 py-0.5 rounded"
                                  style="background:${rar.color}20;color:${rar.color}">${rar.label}</span>
                        </div>
                        <p class="text-xs text-slate-400 mt-0.5">${r.desc}</p>
                        <div class="flex gap-3 mt-1 text-[10px] font-bold">
                            <span class="text-rose-400">TENSION ${r.tensionMax}</span>
                            <span class="text-emerald-400">REEL ${r.reelPower}</span>
                            <span class="text-fuchsia-400">LUCK +${Math.round((r.luck || 0) * 100)}%</span>
                        </div>
                    </div>
                </div>
                <div class="shrink-0">
                    ${isEquipped
                        ? `<span class="text-xs text-emerald-400 font-bold px-3 py-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/30">EQUIPPED</span>`
                        : isUnlocked
                            ? `<button data-equip-rod="${idx}" class="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black rounded-xl">EQUIP</button>`
                            : `<button data-buy-rod="${idx}" class="btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl" ${p.coins < r.price ? 'disabled' : ''}>${r.price} C</button>`}
                </div>
            `;
            content.appendChild(div);
        });

        content.querySelectorAll('[data-buy-rod]').forEach(btn => {
            btn.onclick = () => {
                const idx = +btn.dataset.buyRod;
                const r = RODS[idx];
                const p = state.player;
                if (p.coins >= r.price && !p.unlockedRods.includes(r.id)) {
                    p.coins -= r.price;
                    p.unlockedRods.push(r.id);
                    p.equippedRod = r;
                    try { audio.playCoin(); } catch (e) {}

                    Player.refreshHUD(state);
                    UI.refreshLuckDisplay(state);
                    if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
                    if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);

                    this.renderTab(state, 'rods');
                } else {
                    try { audio.playError(); } catch (e) {}
                }
            };
        });

        content.querySelectorAll('[data-equip-rod]').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                state.player.equippedRod = RODS[+btn.dataset.equipRod];
                UI.refreshLuckDisplay(state);
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                this.renderTab(state, 'rods');
            };
        });
    },

    renderAmmo(state, content) {
        const p = state.player;

        const ammoItems = WEAPONS
            .filter(w => p.ownedWeapons.includes(w.id))
            .filter(w => {
                const max = CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id];
                return max !== undefined && max !== Infinity;
            })
            .map(w => {
                const max = CONFIG.MAX_AMMO[w.id];
                const unit = (CONFIG.AMMO_PRICES && CONFIG.AMMO_PRICES[w.id]) || 1;
                return {
                    id: w.id,
                    name: `${w.name} Ammo`,
                    icon: w.icon,
                    unit,
                    max,
                    pack: Math.max(10, Math.round(max / 4))
                };
            });

        if (ammoItems.length === 0) {
            content.innerHTML = `<div class="text-center py-16">
                <i class="fa-solid fa-box-open text-5xl text-slate-700 mb-3"></i>
                <p class="text-slate-500 text-sm">You don't own any weapons that need ammo yet.</p>
            </div>`;
            return;
        }

        ammoItems.forEach(item => {
            const current = p.weaponAmmo[item.id] || 0;
            const packCost = item.unit * item.pack;
            const canAfford = p.coins >= packCost;
            const isFull = current >= item.max;
            const fillPct = Math.min(100, Math.round((current / item.max) * 100));

            const div = document.createElement('div');
            div.className = 'shop-item glass-panel-light p-4 rounded-xl flex items-center justify-between';
            div.innerHTML = `
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900/60 border border-slate-700 shrink-0">
                        <i class="fa-solid ${item.icon} text-amber-400 text-lg"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-bold text-white text-base truncate">${item.name}</h3>
                        <div class="flex items-center gap-2 mt-1">
                            <div class="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700 max-w-[180px]">
                                <div class="h-full rounded-full transition-all"
                                     style="width:${fillPct}%;background:linear-gradient(90deg,#0ea5e9,#38bdf8)"></div>
                            </div>
                            <span class="text-xs ${isFull ? 'text-emerald-400' : 'text-sky-400'} font-bold whitespace-nowrap">
                                ${current} / ${item.max}
                            </span>
                        </div>
                        <p class="text-[10px] text-slate-400 mt-0.5">
                            +${item.pack} rounds · ${item.unit}c each
                        </p>
                    </div>
                </div>
                <button class="btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl shrink-0"
                        data-buy-ammo-id="${item.id}"
                        data-buy-ammo-pack="${item.pack}"
                        ${(!canAfford || isFull) ? 'disabled' : ''}>
                    ${isFull ? 'FULL' : `BUY ${item.pack} · ${packCost}c`}
                </button>
            `;
            content.appendChild(div);
        });

        content.querySelectorAll('[data-buy-ammo-id]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.buyAmmoId;
                const pack = +btn.dataset.buyAmmoPack;
                const w = WEAPONS.find(x => x.id === id);
                if (!w) return;

                const unit = (CONFIG.AMMO_PRICES && CONFIG.AMMO_PRICES[id]) || 1;
                const max = (CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[id]) || Infinity;
                if (max === Infinity) return;

                const current = p.weaponAmmo[id] || 0;
                const space = max - current;
                if (space <= 0) return;

                const toBuy = Math.min(pack, space);
                const cost = toBuy * unit;

                if (p.coins < cost) {
                    try { audio.playError(); } catch (e) {}
                    UI.updateStatusBanner('Not enough coins!', 'Shop', 'rose');
                    return;
                }

                p.coins -= cost;
                p.weaponAmmo[id] = current + toBuy;
                try { audio.playCoin(); } catch (e) {}

                Player.refreshHUD(state);
                Player.refreshWeaponHUD(state);
                if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                this.renderTab(state, 'ammo');
            };
        });
    },

    renderCasinoTab(state, content) {
        content.innerHTML = `
            <div class="glass-panel-light p-4 rounded-xl text-center">
                <div class="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, #f0abfc, #d946ef);">
                    <i class="fa-solid fa-dice-d6 text-3xl text-white"></i>
                </div>
                <h3 class="font-bold text-fuchsia-300 text-lg mb-2">Deep Sea Casino</h3>
                <p class="text-slate-400 text-sm mb-4">Gamble your tokens for big rewards. The house edge is 2.7%.</p>
                <div class="flex gap-2 mb-4">
                    <div class="flex-1 glass-panel p-3 rounded-xl">
                        <div class="text-2xl font-bold text-amber-300">${state.player.casinoTokens || 0}</div>
                        <div class="text-xs text-slate-400">Tokens</div>
                    </div>
                    <div class="flex-1 glass-panel p-3 rounded-xl">
                        <div class="text-2xl font-bold text-fuchsia-300">${state.player.casinoLifetimeWinnings || 0}</div>
                        <div class="text-xs text-slate-400">Lifetime Won</div>
                    </div>
                </div>
                <button id="btn-open-casino-from-shop" class="w-full px-4 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all shadow-lg">
                    <i class="fa-solid fa-dice mr-2"></i> OPEN CASINO
                </button>
                <p class="text-xs text-slate-500 mt-2">Also accessible from Beach Shop when near shore</p>
            </div>
        `;
        
        const btn = document.getElementById('btn-open-casino-from-shop');
        if (btn) btn.onclick = () => {
            if (typeof Casino !== 'undefined') Casino.open();
            document.getElementById('shop-modal').classList.add('hidden');
        };
    },

    renderBeachTab(state, content) {
        const p = state.player;
        const nearShore = p.x >= state.waterBoundaryX - 100;
        const canAccess = nearShore || p.beachShopUnlocked;

        const baitLeft = Math.max(0, Math.ceil(p.baitTimer || 0));
        const umbLeft = Math.max(0, Math.ceil(p.umbrellaTimer || 0));

        content.innerHTML = `
            <div class="glass-panel-light p-4 rounded-xl text-center">
                <div class="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, #fbbf24, #f59e0b);">
                    <i class="fa-solid fa-umbrella-beach text-3xl text-white"></i>
                </div>
                <h3 class="font-bold text-amber-300 text-lg mb-2">Beach Shop</h3>
                <p class="text-slate-400 text-sm mb-3">
                    ${canAccess ? 'Welcome to the beach shop!' : 'Walk to the shoreline to access the beach shop.'}
                </p>
                ${(baitLeft > 0 || umbLeft > 0) ? `
                    <div class="flex gap-2 justify-center mb-3 text-xs font-bold">
                        ${baitLeft > 0 ? `<span class="px-2 py-1 bg-sky-500/20 border border-sky-500/40 rounded-lg text-sky-300">🪱 Bait ${baitLeft}s</span>` : ''}
                        ${umbLeft > 0 ? `<span class="px-2 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-emerald-300">⛱️ Umbrella ${umbLeft}s</span>` : ''}
                    </div>` : ''}

                ${!canAccess ? `
                    <div class="glass-panel p-4 rounded-xl mb-4">
                        <i class="fa-solid fa-location-arrow text-2xl text-sky-400 mb-2"></i>
                        <p class="text-slate-300">Distance to shore: ${Math.max(0, Math.round(state.waterBoundaryX - p.x))}m</p>
                        <p class="text-xs text-slate-500 mt-1">Press <kbd class="bg-slate-800 px-2 py-1 rounded text-xs">E</kbd> near shore, or walk closer</p>
                    </div>` : ''}

                <div class="space-y-2">
                    <button id="beach-open-casino" class="w-full px-4 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all ${!canAccess ? 'opacity-50 cursor-not-allowed' : ''}" ${!canAccess ? 'disabled' : ''}>
                        <i class="fa-solid fa-dice mr-2"></i> Open Casino (${p.casinoTokens || 0}T)
                    </button>
                    <button id="beach-buy-bait" class="w-full px-4 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-black rounded-xl transition-all ${(!canAccess || p.coins < 500) ? 'opacity-50 cursor-not-allowed' : ''}" ${(!canAccess || p.coins < 500) ? 'disabled' : ''}>
                        <i class="fa-solid fa-fish-fins mr-2"></i> Buy Bait — 20% faster bites, 5 min (500c)
                    </button>
                    <button id="beach-buy-umbrella" class="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-xl transition-all ${(!canAccess || p.coins < 1000) ? 'opacity-50 cursor-not-allowed' : ''}" ${(!canAccess || p.coins < 1000) ? 'disabled' : ''}>
                        <i class="fa-solid fa-umbrella-beach mr-2"></i> Rent Umbrella — safe zone + regen, 5 min (1000c)
                    </button>
                    <button id="beach-appraise" class="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl transition-all ${(!canAccess || p.coins < 200 || !(p.bucket || []).length) ? 'opacity-50 cursor-not-allowed' : ''}" ${(!canAccess || p.coins < 200 || !(p.bucket || []).length) ? 'disabled' : ''}>
                        <i class="fa-solid fa-gem mr-2"></i> Appraise Catch — +15% bucket value (200c)
                    </button>
                </div>
                <p class="text-xs text-slate-500 mt-4">Beach shop unlocks permanently after first visit</p>
            </div>`;

        if (nearShore && !p.beachShopUnlocked) {
            p.beachShopUnlocked = true;
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            Particles.showFloatingText(state, 'Beach Shop Unlocked!', p.x, p.y - 50, '#facc15');
        }
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        on('beach-open-casino', () => {
            document.getElementById('shop-modal').classList.add('hidden');
            if (typeof Casino !== 'undefined') Casino.open();
        });
        on('beach-buy-bait', () => this.buyBait(state));
        on('beach-buy-umbrella', () => this.buyUmbrella(state));
        on('beach-appraise', () => this.appraiseCatch(state));
    },

    buyBait(state) {
        const p = state.player;
        if (p.coins < 500) { try { audio.playError(); } catch (e) {} return; }
        p.coins -= 500;
        p.baitTimer = 300;
        try { audio.playCoin(); } catch (e) {}
        Particles.showFloatingText(state, 'BAIT ACTIVE 5:00!', p.x, p.y - 50, '#38bdf8');
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.renderTab(state, 'beach');
    },

    buyUmbrella(state) {
        const p = state.player;
        if (p.coins < 1000) { try { audio.playError(); } catch (e) {} return; }
        p.coins -= 1000;
        p.umbrellaTimer = 300;
        p.hp = Math.min(p.maxHp, p.hp + 40);
        try { audio.playCoin(); } catch (e) {}
        Particles.showFloatingText(state, 'UMBRELLA SAFE ZONE 5:00!', p.x, p.y - 50, '#34d399');
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.renderTab(state, 'beach');
    },

    appraiseCatch(state) {
        const p = state.player;
        if (p.coins < 200 || !(p.bucket || []).length) { try { audio.playError(); } catch (e) {} return; }
        p.coins -= 200;
        p.bucket.forEach(f => { if (!f.appraised) { f.value = Math.round((f.value || 0) * 1.15); f.appraised = true; } });
        try { audio.playCoin(); } catch (e) {}
        const total = p.bucket.reduce((a, f) => a + (f.value || 0), 0);
        Particles.showFloatingText(state, `APPRAISED! Bucket now ${total}c`, p.x, p.y - 50, '#facc15');
        Player.addXP(state, 25);
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.renderTab(state, 'beach');
    },

    armorIcon(type) {
        return type === 'head' ? 'helmet' : type === 'chest' ? 'vest' : type === 'hands' ? 'hand-fist' : type === 'feet' ? 'shoe-prints' : 'crown';
    },

    applyArmorStats(state) {
        const p = state.player;
        if (!p.equippedArmor) p.equippedArmor = {};
        const items = Object.values(p.equippedArmor)
            .map(id => (typeof ARMOR !== 'undefined' ? ARMOR.find(a => a.id === id) : null))
            .filter(Boolean);
        const sum = (k) => items.reduce((a, it) => a + (it[k] || 0), 0);
        p.armorDefense = sum('defense');
        p.armorReflect = items.reduce((a, it) => a + (it.damageReflect || 0), 0);
        p.armorLuck = items.reduce((a, it) => a + (it.luckBonus || 0), 0);
        p.armorReel = sum('reelPowerBonus');
        p.armorAnchor = items.some(it => it.anchorBonus);
        p.armorWaterWalk = items.some(it => it.waterWalk);
        const setItem = items.find(it => it.type === 'set' && it.fullSetBonus);
        p.armorSetBonus = setItem ? setItem.fullSetBonus : null;
        // Recompute max HP: base 100 + level bonus + armor
        const levelBonus = ((p.level || 1) - 1) * 15;
        const newMax = 100 + levelBonus + sum('hpBonus');
        if (newMax !== p.maxHp) {
            const ratio = p.maxHp ? (p.hp / p.maxHp) : 1;
            p.maxHp = newMax;
            p.hp = Math.min(newMax, Math.max(1, Math.round(newMax * ratio)));
        }
        // Speed: percent based
        const spdBonus = sum('speedBonus') - sum('speedPenalty');
        p.speed = (CONFIG.PLAYER_SPEED || 4.2) * (1 + spdBonus / 100);
        p.speed = Math.max(2.0, p.speed);
        if (typeof Player !== 'undefined') Player.refreshHUD(state);
    },

    getDamageReduction(state) {
        const p = state.player;
        const def = p.armorDefense || 0;
        let dr = def / (def + 100); // diminishing returns
        if (p.armorSetBonus) dr += p.armorSetBonus.damageReduction || 0;
        return Math.min(0.75, dr);
    },

    buyArmor(state, id) {
        const p = state.player;
        if (!p.ownedArmor) p.ownedArmor = ['vest_light'];
        const item = ARMOR.find(a => a.id === id);
        if (!item || p.ownedArmor.includes(id)) return;
        if (p.coins < item.price) { try { audio.playError(); } catch (e) {} return; }
        p.coins -= item.price;
        p.ownedArmor.push(id);
        // Auto-equip (sets occupy all slots)
        this.equipArmor(state, id, true);
        try { audio.playCoin(); } catch (e) {}
        Player.refreshHUD(state);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.renderTab(state, 'armor');
    },

    equipArmor(state, id, silent) {
        const p = state.player;
        if (!p.equippedArmor) p.equippedArmor = {};
        const item = ARMOR.find(a => a.id === id);
        if (!item || !(p.ownedArmor || []).includes(id)) return;
        if (item.type === 'set') {
            ['head', 'chest', 'hands', 'feet'].forEach(s => { p.equippedArmor[s] = id; });
        } else {
            // Unequip same-slot, and clear set occupying that slot
            p.equippedArmor[item.type] = id;
        }
        this.applyArmorStats(state);
        if (!silent) try { audio.playUIClick(); } catch (e) {}
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.renderTab(state, 'armor');
    },

    unequipArmor(state, slot) {
        const p = state.player;
        if (!p.equippedArmor) return;
        const cur = p.equippedArmor[slot];
        if (!cur) return;
        const item = ARMOR.find(a => a.id === cur);
        if (item && item.type === 'set') {
            ['head', 'chest', 'hands', 'feet'].forEach(s => { if (p.equippedArmor[s] === cur) delete p.equippedArmor[s]; });
        } else delete p.equippedArmor[slot];
        this.applyArmorStats(state);
        try { audio.playUIClick(); } catch (e) {}
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.renderTab(state, 'armor');
    },

    renderArmorTab(state, content) {
        const p = state.player;
        if (!p.equippedArmor) p.equippedArmor = {};
        if (!p.ownedArmor) p.ownedArmor = ['vest_light'];
        this.applyArmorStats(state);

        const armorItems = ARMOR.filter(a => a.type !== 'set');
        const sets = ARMOR.filter(a => a.type === 'set');

        let equippedHTML = `<div class="glass-panel-light p-3 rounded-xl mb-3"><h4 class="font-bold text-emerald-300 mb-2 flex items-center gap-2"><i class="fa-solid fa-shirt"></i> Equipped — DEF ${p.armorDefense || 0} · DR ${Math.round(this.getDamageReduction(state) * 100)}%</h4><div class="grid grid-cols-2 sm:grid-cols-4 gap-2">`;
        ['head', 'chest', 'hands', 'feet'].forEach(slot => {
            const equipped = p.equippedArmor[slot];
            const item = equipped ? ARMOR.find(a => a.id === equipped) : null;
            equippedHTML += `
                <div class="glass-panel p-2 rounded-xl text-center ${item ? '' : 'opacity-40'}">
                    <div class="w-10 h-10 mx-auto mb-1 rounded-lg flex items-center justify-center" style="background: ${item ? item.color + '20' : '#1e293b'}; border: 1px solid ${item ? item.color : '#374151'}">
                        ${item ? `<i class="fa-solid fa-${this.armorIcon(item.type)} text-lg" style="color: ${item.color}"></i>` : `<span class="text-xs text-slate-500">${slot.charAt(0).toUpperCase() + slot.slice(1)}</span>`}
                    </div>
                    <div class="text-[9px] font-bold ${item ? 'text-white' : 'text-slate-500'}">${item ? item.name : 'Empty'}</div>
                    ${item ? `<div class="text-[8px] text-emerald-400">DEF +${item.defense || 0}</div><button data-unequip-armor="${slot}" class="text-[8px] text-rose-400 hover:text-rose-300 font-bold mt-1">UNEQUIP</button>` : ''}
                </div>`;
        });
        equippedHTML += '</div></div>';
        content.innerHTML = equippedHTML;

        const categories = {
            'Light': armorItems.filter(a => a.weight === 'Light'),
            'Medium': armorItems.filter(a => a.weight === 'Medium'),
            'Heavy': armorItems.filter(a => a.weight === 'Heavy'),
            'Legendary': armorItems.filter(a => a.rarity === 'legendary'),
            'Mythic': [...armorItems.filter(a => a.rarity === 'mythic'), ...sets],
        };

        for (const [cat, items] of Object.entries(categories)) {
            if (items.length === 0) continue;
            const catEl = document.createElement('div');
            catEl.className = 'glass-panel-light p-3 rounded-xl mb-3';
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-2';
            catEl.innerHTML = `<h4 class="font-bold text-emerald-300 mb-2 flex items-center gap-2"><i class="fa-solid fa-shield"></i> ${cat} Armor</h4>`;
            catEl.appendChild(grid);
            content.appendChild(catEl);
            items.forEach(item => {
                const isOwned = p.ownedArmor.includes(item.id);
                const isEquipped = Object.values(p.equippedArmor).includes(item.id);
                const div = document.createElement('div');
                div.className = `shop-item glass-panel p-3 rounded-xl flex items-center justify-between rarity-${item.rarity} ${isEquipped ? 'ring-2 ring-emerald-400' : ''}`;
                div.innerHTML = `
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background:${item.color}20;border:1px solid ${item.color}60">
                            <i class="fa-solid fa-${this.armorIcon(item.type)} text-lg" style="color:${item.color}"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-bold text-white text-sm truncate">${item.name}</h3>
                                <span class="text-[10px] font-black px-1.5 py-0.5 rounded" style="background:${RARITY_LABELS[item.rarity]?.color || '#94a3b8'}20;color:${RARITY_LABELS[item.rarity]?.color || '#94a3b8'}">${RARITY_LABELS[item.rarity]?.label || item.rarity.toUpperCase()}</span>
                                ${isEquipped ? '<span class="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/20">EQUIPPED</span>' : ''}
                            </div>
                            <p class="text-xs text-slate-400 mt-0.5">${item.desc}</p>
                            <div class="flex gap-2 mt-1 text-[10px] font-bold flex-wrap">
                                <span class="text-rose-400">DEF +${item.defense || 0}</span>
                                ${item.hpBonus ? `<span class="text-red-400">HP +${item.hpBonus}</span>` : ''}
                                ${item.speedBonus ? `<span class="text-sky-400">SPD +${item.speedBonus}%</span>` : ''}
                                ${item.speedPenalty ? `<span class="text-amber-400">SPD -${item.speedPenalty}%</span>` : ''}
                                ${item.luckBonus ? `<span class="text-fuchsia-400">Luck +${Math.round(item.luckBonus * 100)}%</span>` : ''}
                                ${item.reelPowerBonus ? `<span class="text-emerald-400">Reel +${item.reelPowerBonus}</span>` : ''}
                                ${item.damageReflect ? `<span class="text-fuchsia-400">Reflect ${Math.round(item.damageReflect * 100)}%</span>` : ''}
                                ${item.anchorBonus ? `<span class="text-amber-300">Unmovable</span>` : ''}
                                ${item.waterWalk ? `<span class="text-sky-300">Water Walk</span>` : ''}
                                ${item.fullSetBonus ? `<span class="text-yellow-300">Set: Regen ${item.fullSetBonus.hpRegen}/s, DR ${Math.round(item.fullSetBonus.damageReduction * 100)}%</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="shrink-0 flex flex-col items-end gap-1 ml-2">
                        ${isEquipped
                            ? `<span class="text-xs text-emerald-400 font-bold px-2 py-1 bg-emerald-500/20 rounded">EQUIPPED</span>`
                            : isOwned
                                ? `<button data-equip-armor="${item.id}" class="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black rounded-lg">EQUIP</button>`
                                : `<button data-buy-armor="${item.id}" class="btn-buy px-3 py-1.5 text-slate-950 text-xs font-black rounded-lg" ${p.coins < item.price ? 'disabled' : ''}>${item.price.toLocaleString()} C</button>`}
                    </div>`;
                grid.appendChild(div);
            });
        }
        content.querySelectorAll('[data-buy-armor]').forEach(btn => { btn.onclick = () => this.buyArmor(state, btn.dataset.buyArmor); });
        content.querySelectorAll('[data-equip-armor]').forEach(btn => { btn.onclick = () => this.equipArmor(state, btn.dataset.equipArmor); });
        content.querySelectorAll('[data-unequip-armor]').forEach(btn => { btn.onclick = () => this.unequipArmor(state, btn.dataset.unequipArmor); });
    }
};