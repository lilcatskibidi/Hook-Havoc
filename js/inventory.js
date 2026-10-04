// ============================================================
// Inventory — player backpack modal (usable anywhere, even far from
// the shop). Read-only commerce: NO buying, NO selling here.
// Tabs:
//   Fish  — bucket contents (fish + summon keys): lock/unlock, remove.
//   Bait  — bait stock counts + put bait on / off the hook.
//   Items — owned consumables: equip/unequip for [F] use.
// Reuses Shop.setFishLock, Ritual.useBait and ItemSystem.equip so the
// rules stay identical to the shop versions.
// ============================================================
const Inventory = {
    _tab: 'fish',
    state: null,

    init(state) {
        this.state = state;
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        on('btn-open-inventory', () => this.open(state, 'fish'));
        on('btn-inventory-close', () => this.close());
        document.querySelectorAll('.inv-tab-btn').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                this.open(state, btn.dataset.invtab);
            };
        });
    },

    isOpen() {
        const m = document.getElementById('inventory-modal');
        return !!(m && !m.classList.contains('hidden'));
    },

    open(state, tab) {
        if (state) this.state = state;
        if (!this.state) return;
        try { audio.playUIClick(); } catch (e) {}
        this.renderTab(this.state, tab || this._tab || 'fish');
        const modal = document.getElementById('inventory-modal');
        if (modal) modal.classList.remove('hidden');
        try { Player.refreshHUD(this.state); } catch (e) {}
    },

    close() {
        const modal = document.getElementById('inventory-modal');
        if (modal) modal.classList.add('hidden');
    },

    toggle(state) {
        if (this.isOpen()) this.close();
        else this.open(state, this._tab);
    },

    renderTab(state, tab) {
        this._tab = tab || 'fish';
        if (state) this.state = state;
        const content = document.getElementById('inventory-content');
        if (!content) return;
        content.innerHTML = '';
        document.querySelectorAll('.inv-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.invtab === this._tab);
        });
        if (this._tab === 'bait') this.renderBait(state, content);
        else if (this._tab === 'items') this.renderItems(state, content);
        else this.renderFish(state, content);
    },

    render(state) { this.renderTab(state, this._tab); },

    // ---- Fish: lock/unlock + remove, never sell -------------------------
    renderFish(state, content) {
        const p = state.player;
        const bucket = p.bucket || [];
        const head = document.createElement('div');
        head.className = 'glass-panel-light p-3 rounded-xl text-center mb-1 flex items-center justify-center gap-3';
        head.innerHTML = `
            <i class="fa-solid fa-fish text-sky-400 text-xl"></i>
            <div class="text-left">
                <div class="font-bold text-white text-sm">Bucket — ${bucket.length} / ${p.bucketCapacity || 15}</div>
                <div class="text-[10px] text-slate-400">Lock keepers 🔒 · 🗑 removes · selling happens at the shop</div>
            </div>`;
        content.appendChild(head);

        if (!bucket.length) {
            content.innerHTML += `<div class="text-center py-12">
                <i class="fa-solid fa-fish text-5xl text-slate-700 mb-3"></i>
                <p class="text-slate-500 text-sm">Your bucket is empty — go fishing!</p>
            </div>`;
            return;
        }

        const grouped = {};
        bucket.forEach(fish => {
            if (!fish || fish.keyItem) return;
            if (!grouped[fish.id]) grouped[fish.id] = { species: fish, count: 0, locked: 0 };
            grouped[fish.id].count++;
            if (fish.locked) grouped[fish.id].locked++;
        });

        Object.values(grouped).forEach(({ species, count, locked }) => {
            const r = (typeof RARITY_LABELS !== 'undefined' && RARITY_LABELS[species.rarity]) || { label: species.rarity || '', color: '#94a3b8' };
            const allLocked = locked === count;
            const div = document.createElement('div');
            div.className = 'shop-item glass-panel-light p-3 rounded-xl flex items-center justify-between';
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
                        <span class="text-xs text-slate-400">×${count}${locked > 0 ? ` · <span class="text-amber-300 font-bold">🔒${locked} locked</span>` : ''}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button data-inv-lock="${species.id}" title="${allLocked ? 'Unlock all' : 'Lock all (protect from SELL ALL)'}"
                            class="w-8 h-8 rounded-lg text-sm font-black border transition-all ${allLocked ? 'bg-amber-500/25 text-amber-300 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}">
                        ${allLocked ? '🔒' : '🔓'}
                    </button>
                    <button data-inv-drop="${species.id}" title="Remove from bucket (discard)"
                            class="w-8 h-8 rounded-lg text-sm font-black border transition-all bg-slate-800 text-slate-400 border-slate-600 hover:bg-rose-900/60 hover:text-rose-300 hover:border-rose-500/50">
                        🗑
                    </button>
                </div>`;
            content.appendChild(div);
        });

        // Summon keys / trophies ride in the bucket too.
        const keys = bucket.filter(f => f && f.keyItem);
        if (keys.length) {
            const note = document.createElement('div');
            note.className = 'text-[10px] font-black tracking-widest text-slate-500 mt-2 mb-1 px-1';
            note.innerText = '🔑 SUMMON ITEMS (🔒 KEEPS THEM FROM RITUALS TOO)';
            content.appendChild(note);
            const kg = {};
            keys.forEach(it => {
                if (!kg[it.id]) kg[it.id] = { item: it, count: 0, locked: 0 };
                kg[it.id].count++;
                if (it.locked) kg[it.id].locked++;
            });
            Object.entries(kg).forEach(([kid, { item, count, locked }]) => {
                const allLocked = locked === count;
                const div = document.createElement('div');
                div.className = 'shop-item glass-panel-light p-3 rounded-xl flex items-center justify-between';
                div.style.borderLeft = `3px solid ${item.color || '#fbbf24'}`;
                div.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center text-2xl"
                             style="background:${item.color}22;border:1px solid ${item.color}66">
                            ${item.icon || '❔'}
                        </div>
                        <div>
                            <span class="font-bold text-white text-sm">${item.name}</span>
                            <span class="text-xs text-slate-400"> ×${count}${locked > 0 ? ` · <span class="text-amber-300 font-bold">🔒${locked} locked</span>` : ''}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button data-inv-lock-key="${kid}" title="${allLocked ? 'Unlock all' : 'Lock all'}"
                                class="w-8 h-8 rounded-lg text-sm font-black border transition-all ${allLocked ? 'bg-amber-500/25 text-amber-300 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}">
                            ${allLocked ? '🔒' : '🔓'}
                        </button>
                        <button data-inv-drop-key="${kid}" title="Remove from bucket (discard)"
                                class="w-8 h-8 rounded-lg text-sm font-black border transition-all bg-slate-800 text-slate-400 border-slate-600 hover:bg-rose-900/60 hover:text-rose-300 hover:border-rose-500/50">
                            🗑
                        </button>
                    </div>`;
                content.appendChild(div);
            });
            content.querySelectorAll('[data-inv-lock-key]').forEach(btn => {
                btn.onclick = () => {
                    try { audio.playUIClick(); } catch (e) {}
                    const items = (state.player.bucket || []).filter(f => f && f.keyItem && f.id === btn.dataset.invLockKey);
                    if (!items.length) return;
                    const lock = !items.every(f => f.locked);
                    items.forEach(f => { try { Shop.setFishLock(state, f, lock); } catch (e) {} });
                    try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (e) {}
                    this.render(state);
                };
            });
            content.querySelectorAll('[data-inv-drop-key]').forEach(btn => {
                btn.onclick = () => this.removeGroup(state, btn.dataset.invDropKey, true);
            });
        }

        content.querySelectorAll('[data-inv-lock]').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                const items = (state.player.bucket || []).filter(f => f && f.id === btn.dataset.invLock);
                if (!items.length) return;
                const lock = !items.every(f => f.locked);
                items.forEach(f => { try { Shop.setFishLock(state, f, lock); } catch (e) {} });
                try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (e) {}
                this.render(state);
            };
        });
        content.querySelectorAll('[data-inv-drop]').forEach(btn => {
            btn.onclick = () => this.removeGroup(state, btn.dataset.invDrop, false);
        });
    },

    // Same thinning rules as the shop (locked are keepers, prompt when
    // dropping from a group bigger than 2), but re-renders inventory.
    removeGroup(state, id, isKey) {
        const bucket = state.player.bucket || [];
        const items = bucket.filter(f => f && f.id === id && !!f.keyItem === !!isKey);
        if (!items.length) return;
        const unlocked = items.filter(f => !f.locked);
        const name = (items[0] && items[0].name) || id;
        if (!unlocked.length) {
            try { audio.playError(); } catch (e) {}
            if (typeof Particles !== 'undefined') {
                Particles.showFloatingText(state, `All ${name} locked — unlock first!`, state.player.x, state.player.y - 50, '#fbbf24');
            }
            return;
        }
        let n = unlocked.length;
        if (items.length > 2) {
            let raw = null;
            try { raw = window.prompt(`Remove how many ${name}? (1–${unlocked.length} unlocked)`, String(unlocked.length)); } catch (e) { return; }
            if (raw === null || raw === undefined) return;
            n = Math.floor(Number(raw));
            if (!n || n < 1) return;
            n = Math.min(n, unlocked.length);
        }
        let left = n;
        for (let i = 0; i < bucket.length && left > 0; i++) {
            const f = bucket[i];
            if (f && f.id === id && !!f.keyItem === !!isKey && !f.locked) {
                bucket.splice(i, 1);
                i--;
                left--;
            }
        }
        const removed = n - left;
        if (removed > 0) {
            try { audio.playUIClick(); } catch (e) {}
            if (typeof Particles !== 'undefined') {
                Particles.showFloatingText(state, `🗑 Removed ×${removed} ${name}`, state.player.x, state.player.y - 50, '#f87171');
            }
            try { if (typeof Player !== 'undefined') Player.refreshHUD(state); } catch (e) {}
            try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (e) {}
            this.render(state);
        }
    },

    // ---- Bait: stock counts + hook management, no crafting/buying -------
    renderBait(state, content) {
        const p = state.player;
        const stock = p.baitStock || {};
        const activeId = (typeof p.activeBait === 'string') ? p.activeBait : null;
        const defs = (typeof BAITS !== 'undefined') ? BAITS : [];
        const total = defs.reduce((a, d) => a + (stock[d.id] || 0), 0);

        const head = document.createElement('div');
        head.className = 'glass-panel-light p-3 rounded-xl text-center mb-1';
        head.innerHTML = `
            <div class="font-bold text-amber-300 text-sm">Bait Box — ${total} total</div>
            <div class="text-[10px] text-slate-400 mt-0.5">1 hook eats 1 bait · craft more at the shop · locked 🔒 keepers are never used</div>`;
        content.appendChild(head);

        const owned = defs.filter(d => (stock[d.id] || 0) > 0);
        if (!owned.length) {
            content.innerHTML += `<div class="text-center py-12">
                <i class="fa-solid fa-worm text-5xl text-slate-700 mb-3"></i>
                <p class="text-slate-500 text-sm">No bait — craft some at the shop Bait tab.</p>
            </div>`;
            return;
        }
        owned.forEach(def => {
            const have = stock[def.id] || 0;
            const isActive = activeId === def.id;
            const div = document.createElement('div');
            div.className = 'shop-item glass-panel-light p-3 rounded-xl flex items-center justify-between';
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                         style="background:${def.color}20;border:1px solid ${def.color}60">
                        <i class="fa-solid ${def.icon || 'fa-worm'}" style="color:${def.color}"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-white text-sm">${def.name}</span>
                            ${isActive ? '<span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ON HOOK</span>' : ''}
                        </div>
                        <div class="text-xs text-slate-400">${def.desc || ''}</div>
                        <div class="text-[10px] font-bold" style="color:${def.color}">×${have} left</div>
                    </div>
                </div>
                <button data-inv-bait="${def.id}" class="px-4 py-2 text-xs font-black rounded-xl transition-all shrink-0 ${isActive ? 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700' : 'bg-amber-500 hover:bg-amber-400 text-slate-950'}">
                    ${isActive ? 'UNHOOK' : 'USE'}
                </button>`;
            content.appendChild(div);
        });
        content.querySelectorAll('[data-inv-bait]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.invBait;
                try {
                    if (state.player.activeBait === id) {
                        state.player.activeBait = null;
                        try { audio.playUIClick(); } catch (e) {}
                        try { if (typeof SaveSystem !== 'undefined') SaveSystem.save(state); } catch (e) {}
                    } else if (typeof Ritual !== 'undefined' && Ritual.useBait) {
                        Ritual.useBait(state, id);
                    }
                } catch (e) {}
                try { if (typeof Player !== 'undefined') Player.refreshHUD(state); } catch (e) {}
                this.render(state);
            };
        });
    },

    // ---- Items: owned consumables only, equip for [F], no buying --------
    renderItems(state, content) {
        const p = state.player;
        const defs = (typeof ItemSystem !== 'undefined' && ItemSystem.ITEMS) ? ItemSystem.ITEMS : [];
        const owned = defs.filter(d => {
            try { return ItemSystem.stock(state, d.id) > 0; } catch (e) { return false; }
        });

        const head = document.createElement('div');
        head.className = 'glass-panel-light p-3 rounded-xl text-center mb-1';
        head.innerHTML = `
            <div class="font-bold text-emerald-300 text-sm">Field Kit — ${owned.length} kind${owned.length === 1 ? '' : 's'} carried</div>
            <div class="text-[10px] text-slate-400 mt-0.5">Equip one for <span class="key">F</span> · buy more at the shop Items tab</div>`;
        content.appendChild(head);

        if (!owned.length) {
            content.innerHTML += `<div class="text-center py-12">
                <i class="fa-solid fa-briefcase-medical text-5xl text-slate-700 mb-3"></i>
                <p class="text-slate-500 text-sm">No items — stock up at the shop Items tab.</p>
            </div>`;
            return;
        }
        owned.forEach(def => {
            const n = ItemSystem.stock(state, def.id);
            const equipped = p.equippedItem === def.id;
            const div = document.createElement('div');
            div.className = 'shop-item glass-panel-light p-3 rounded-xl flex items-center justify-between' +
                (equipped ? ' border border-emerald-500/60' : '');
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center text-2xl bg-slate-900/60 border border-slate-700">${def.icon || '🎒'}</div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-white text-sm">${def.name}</span>
                            <span class="text-xs text-sky-300 font-bold">×${n}</span>
                            ${equipped ? ' <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200">[F] EQUIPPED</span>' : ''}
                        </div>
                        <div class="text-xs text-slate-400">${def.desc || ''}</div>
                    </div>
                </div>
                <button data-inv-item="${def.id}" class="px-4 py-2 text-xs font-black rounded-xl transition-all shrink-0 ${equipped ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/50' : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700'}">
                    ${equipped ? 'UNEQUIP' : 'EQUIP'}
                </button>`;
            content.appendChild(div);
        });
        content.querySelectorAll('[data-inv-item]').forEach(btn => {
            btn.onclick = () => {
                try { if (typeof ItemSystem !== 'undefined') ItemSystem.equip(state, btn.dataset.invItem); } catch (e) {}
                this.render(state);
            };
        });
    },
};

window.Inventory = Inventory;
