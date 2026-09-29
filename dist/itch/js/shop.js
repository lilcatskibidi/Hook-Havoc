const RARITY_LABELS = {
    common:    { label: 'Common',    color: '#94a3b8' },
    rare:      { label: 'Rare',      color: '#38bdf8' },
    epic:      { label: 'Epic',      color: '#a855f7' },
    legendary: { label: 'Legendary', color: '#f59e0b' },
    mythic:    { label: 'Mythic',    color: '#e879f9' }
};

const Shop = {
    init(state) {
        const modal = document.getElementById('shop-modal');

        document.getElementById('btn-open-shop').onclick = () => {
            try { audio.playUIClick(); } catch (e) {}
            this.renderTab(state, 'sell');
            modal.classList.remove('hidden');
            Player.refreshHUD(state);
        };

        document.querySelectorAll('.shop-close').forEach(b => {
            b.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                modal.classList.add('hidden');
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
        else if (tab === 'ammo')    this.renderAmmo(state, content);
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
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                this.renderTab(state, 'ammo');
            };
        });
    }
};