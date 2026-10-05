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
    // the Sell tab (Beach Shop tab was removed).
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

    closeShop(state) {
        const modal = document.getElementById('shop-modal');
        if (modal) modal.classList.add('hidden');
        const mpHud = document.getElementById('mp-hud');
        if (mpHud && state.multiplayer && state.multiplayer.isConnected) mpHud.classList.remove('hidden');
    },

    init(state) {
        const modal = document.getElementById('shop-modal');
        if (!modal) return; // bulletproof: no shop DOM (embed/partial) — never throw
        const mpHud = document.getElementById('mp-hud');

        // When a gun PNG finishes probing, refresh the open Guns tab so
        // the SKIN button flips from NO PNG to PNG without reopening
        // (and the model previews pick up the custom art).
        try {
            if (typeof GunSkinLoader !== 'undefined') {
                GunSkinLoader.onReady = () => {
                    try {
                        if (typeof Render !== 'undefined') Render._gunPreviewRev++;
                        if (!modal.classList.contains('hidden') && this._tab === 'weapons') {
                            this.renderTab(state, 'weapons');
                        }
                    } catch (e) {}
                };
            }
            if (typeof BobberLoader !== 'undefined') {
                BobberLoader.onReady = () => {
                    try {
                        if (!modal.classList.contains('hidden') && this._tab === 'rods') {
                            this.renderTab(state, 'rods');
                        }
                    } catch (e) {}
                };
            }
        } catch (e) {}

        // Walk-to-shop design: no HUD quick-open button (removed) — the
        // beach/casino zones + NPC open it via E. Guarded for old saves.
        try {
            const shopBtn = document.getElementById('btn-open-shop');
            if (shopBtn) shopBtn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                this.renderTab(state, 'sell');
                modal.classList.remove('hidden');
                if (mpHud) mpHud.classList.add('hidden'); // Hide MP HUD when shop opens
                Player.refreshHUD(state);
            };
        } catch (e) {}

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

        const sellAllBtn = document.getElementById('btn-sell-all');
        if (!sellAllBtn) return;
        sellAllBtn.onclick = async () => {
            // In-flight guard: the server clamp awaits network, and a lagged
            // double-click must not sell twice.
            if (this._selling) return;
            this._selling = true;
            try { document.getElementById('btn-sell-all').disabled = true; } catch (e) {}
            try {
            const keyVal = (f) => {
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.entryValue) return Ritual.entryValue(f);
                } catch (e) {}
                return (f && f.value) || 0;
            };
            const sellable = (state.player.bucket || []).filter(f => !f.locked);
            const lockedKept = (state.player.bucket || []).length - sellable.length;
            let total = sellable.reduce((acc, f) => acc + keyVal(f), 0);
            if (total === 0) {
                try { audio.playError(); } catch (e) {}
                return;
            }
            // Server sell-clamp (anti-F12 value edits): never pay more than
            // the server approves when online. Offline (itch.io) = local.
            try {
                if (typeof SecureServer !== 'undefined') {
                    const clamp = await SecureServer.sellClamp(sellable.map(f => ({ id: f.id, value: keyVal(f) })));
                    if (clamp && typeof clamp.approvedTotal === 'number') {
                        if (clamp.approvedTotal < total) {
                            total = clamp.approvedTotal;
                            if (typeof AntiCheat !== 'undefined') AntiCheat.violations++;
                        }
                    }
                }
            } catch (e) {}
            if (total <= 0) {
                try { audio.playError(); } catch (e) {}
                return;
            }
            state.player.coins += total;
            // Keepers stay: anything 🔒 locked (fish or key).
            state.player.bucket = (state.player.bucket || []).filter(f => f.locked);
            try { audio.playCoin(); } catch (e) {}
            if (lockedKept > 0) {
                const keysKept = (state.player.bucket || []).filter(f => f.keyItem).length;
                const tag = keysKept > 0 ? `🔒+🔑` : `🔒`;
                Particles.showFloatingText(state, `SOLD +${total}c · KEPT ${lockedKept} ${tag}`, state.player.x, state.player.y - 50, '#facc15');
            }
            Player.addXP(state, Math.round(total / 5));
            Player.refreshHUD(state);
            // Sold quest fish no longer count — resync Marlin's job progress
            try {
                if (typeof NPC !== 'undefined' && NPC.syncActive) NPC.syncActive(state);
                if (typeof NPC !== 'undefined' && NPC.updateTracker) NPC.updateTracker(state);
            } catch (e) {}
            if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            this.renderTab(state, 'sell');
            } finally {
                this._selling = false;
                try { document.getElementById('btn-sell-all').disabled = false; } catch (e) {}
            }
        };
    },

    renderTab(state, tab, sub) {
        this._tab = tab;
        const content = document.getElementById('shop-content');
        if (!content || !state || !state.player) return;
        content.innerHTML = '';

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const activeTab = document.getElementById('tab-' + tab);
        if (activeTab) activeTab.classList.add('active');

        if (tab === 'sell')         this.renderSell(state, content);
        else if (tab === 'weapons') this.renderWeapons(state, content);
        else if (tab === 'rods')    this.renderRods(state, content);
        else if (tab === 'armor')   this.renderArmorTab(state, content);
        else if (tab === 'ammo')    this.renderAmmo(state, content);
        else if (tab === 'bucket')  this.renderBucketTab(state, content);
        else if (tab === 'bait')    this.renderBaitTab(state, content);
        else if (tab === 'craft') {
            if (typeof Craft !== 'undefined') Craft.renderTab(state, content, sub);
        }
        else if (tab === 'items') {
            if (typeof ItemSystem !== 'undefined') ItemSystem.renderItemsTab(state, content);
        }
        else if (tab === 'casino')  this.renderCasinoTab(state, content);
    },

    // Lock a bucket fish so SELL ALL skips it (quest fish keeper).
    // Clones into the bucket slot instead of mutating, so a shared
    // species ref (post-load pristine fish) can never be polluted.
    setFishLock(state, fish, lock) {
        const bucket = state.player.bucket || [];
        const i = bucket.indexOf(fish);
        if (i < 0) return;
        const copy = Object.assign({}, fish);
        if (lock) copy.locked = true;
        else delete copy.locked;
        bucket[i] = copy;
    },

    // Discard bucket entries (thinning a full bucket). Locked entries are
    // keepers and are never removed — unlock first. Groups of more than 2
    // ask how many to drop (oldest unlocked first) via the in-game picker.
    dropGroup(state, id, isKey) {
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
        const doDrop = (n) => {
            n = Math.max(1, Math.min(unlocked.length, Math.floor(Number(n)) || 0));
            if (!n) return;
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
                if (typeof Player !== 'undefined') {
                    try { Player.refreshHUD(state); } catch (e) {}
                    try { if (typeof UI !== 'undefined') UI.renderWeaponToolbar(state); } catch (e) {}
                }
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                this.renderTab(state, 'sell');
            }
        };
        if (items.length > 2) {
            // In-game picker (async) — falls back to dropping all on legacy.
            try {
                if (typeof QtyModal !== 'undefined' && QtyModal.ask) {
                    QtyModal.ask({
                        title: 'REMOVE FISH?',
                        sub: `${name} — ${unlocked.length} unlocked`,
                        min: 1, max: unlocked.length, value: unlocked.length,
                    }).then((n) => { if (n !== null && n !== undefined) doDrop(n); });
                    return;
                }
            } catch (e) {}
            doDrop(unlocked.length);
            return;
        }
        doDrop(unlocked.length);
    },

    // Sell ONE group (a fish species or a summon key) with a picker
    // quantity — same economics + server clamp as SELL ALL, but scoped to
    // this id. Locked keepers are never touched.
    async sellGroup(state, id, isKey) {
        const bucket = state.player.bucket || [];
        const items = bucket.filter(f => f && f.id === id && !!f.keyItem === !!isKey);
        const unlocked = items.filter(f => !f.locked);
        const name = (items[0] && items[0].name) || id;
        if (!unlocked.length) {
            try { audio.playError(); } catch (e) {}
            if (typeof Particles !== 'undefined') {
                Particles.showFloatingText(state, `All ${name} locked — unlock first!`, state.player.x, state.player.y - 50, '#fbbf24');
            }
            return;
        }
        const keyVal = (f) => {
            try {
                if (typeof Ritual !== 'undefined' && Ritual.entryValue) return Ritual.entryValue(f);
            } catch (e) {}
            return (f && f.value) || 0;
        };
        const doSell = async (n) => {
            if (this._selling) return;
            this._selling = true;
            try {
                n = Math.max(1, Math.min(unlocked.length, Math.floor(Number(n)) || 0));
                if (!n) return;
                const subset = unlocked.slice(0, n);
                let total = subset.reduce((acc, f) => acc + keyVal(f), 0);
                if (total <= 0) {
                    try { audio.playError(); } catch (e) {}
                    return;
                }
                // Same server sell-clamp as SELL ALL (anti-F12 value edits).
                try {
                    if (typeof SecureServer !== 'undefined') {
                        const clamp = await SecureServer.sellClamp(subset.map(f => ({ id: f.id, value: keyVal(f) })));
                        if (clamp && typeof clamp.approvedTotal === 'number') {
                            if (clamp.approvedTotal < total) {
                                total = clamp.approvedTotal;
                                if (typeof AntiCheat !== 'undefined') AntiCheat.violations++;
                            }
                        }
                    }
                } catch (e) {}
                if (total <= 0) {
                    try { audio.playError(); } catch (e) {}
                    return;
                }
                state.player.coins += total;
                // Remove EXACTLY n (count-based, not identity-based: loaded
                // plain fish share one species ref, so a Set would wipe every
                // duplicate while paying for one).
                let left = subset.length;
                state.player.bucket = (state.player.bucket || []).filter(f => {
                    if (left > 0 && f && f.id === id && !!f.keyItem === !!isKey && !f.locked) { left--; return false; }
                    return true;
                });
                try { audio.playCoin(); } catch (e) {}
                if (typeof Particles !== 'undefined') {
                    Particles.showFloatingText(state, `SOLD ×${subset.length} ${name} +${total}c`, state.player.x, state.player.y - 50, '#facc15');
                }
                Player.addXP(state, Math.round(total / 5));
                Player.refreshHUD(state);
                try {
                    if (typeof NPC !== 'undefined' && NPC.syncActive) NPC.syncActive(state);
                    if (typeof NPC !== 'undefined' && NPC.updateTracker) NPC.updateTracker(state);
                } catch (e) {}
                if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                this.renderTab(state, 'sell');
            } finally {
                this._selling = false;
            }
        };
        if (unlocked.length > 1) {
            try {
                if (typeof QtyModal !== 'undefined' && QtyModal.ask) {
                    const unit = keyVal(unlocked[0]);
                    QtyModal.ask({
                        title: 'SELL ' + String(name).toUpperCase(),
                        sub: `${unit}c each · ${unlocked.length} unlocked`,
                        min: 1, max: unlocked.length, value: unlocked.length,
                    }).then((n) => { if (n !== null && n !== undefined) doSell(n); });
                    return;
                }
            } catch (e) {}
        }
        doSell(unlocked.length);
    },

    renderSell(state, content) {
        const bucket = state.player.bucket || [];
        const keyVal = (f) => {
            try {
                if (typeof Ritual !== 'undefined' && Ritual.entryValue) return Ritual.entryValue(f);
            } catch (e) {}
            return (f && f.value) || 0;
        };
        const sellable = bucket.filter(f => !f.locked);
        const totalVal = sellable.reduce((acc, f) => acc + keyVal(f), 0);
        const lockedCount = bucket.filter(f => f.locked && !f.keyItem).length;
        const lockedKeys = bucket.filter(f => f.locked && f.keyItem).length;
        const keyItems = bucket.filter(f => f.keyItem);

        if (bucket.length === 0) {
            content.innerHTML = `<div class="text-center py-16">
                <i class="fa-solid fa-fish text-5xl text-slate-700 mb-3"></i>
                <p class="text-slate-500 text-sm">Your fishing bucket is empty!</p>
            </div>`;
        } else {
            if (lockedCount > 0 || lockedKeys > 0) {
                const note = document.createElement('div');
                note.className = 'glass-panel-light p-2.5 rounded-xl text-center text-xs font-bold text-amber-300 border border-amber-500/30 mb-1';
                const bits = [];
                if (lockedCount > 0) bits.push(`🔒 ${lockedCount} locked fish`);
                if (lockedKeys > 0) bits.push(`🔑 ${lockedKeys} locked keys`);
                note.innerHTML = `${bits.join(' · ')} kept safe from SELL ALL`;
                content.appendChild(note);
            }
            const grouped = {};
            bucket.forEach(fish => {
                if (fish.keyItem) return; // key items get their own section below
                if (!grouped[fish.id]) grouped[fish.id] = { species: fish, count: 0, locked: 0 };
                grouped[fish.id].count++;
                if (fish.locked) grouped[fish.id].locked++;
            });

            Object.values(grouped).forEach(({ species, count, locked }) => {
                const r = RARITY_LABELS[species.rarity] || RARITY_LABELS.common;
                const unlocked = count - locked;
                const allLocked = locked === count;
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
                            <span class="text-xs text-slate-400">×${count} · ${keyVal(species)}c each${locked > 0 ? ` · <span class="text-amber-300 font-bold">🔒${locked} locked</span>` : ''}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <button data-lock-group="${species.id}" title="${allLocked ? 'Unlock all (allow selling)' : 'Lock all (protect from SELL ALL)'}"
                                class="w-8 h-8 rounded-lg text-sm font-black border transition-all ${allLocked ? 'bg-amber-500/25 text-amber-300 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}">
                            ${allLocked ? '🔒' : '🔓'}
                        </button>
                        <button data-drop-group="${species.id}" title="Remove from bucket (discard)"
                                class="w-8 h-8 rounded-lg text-sm font-black border transition-all bg-slate-800 text-slate-400 border-slate-600 hover:bg-rose-900/60 hover:text-rose-300 hover:border-rose-500/50">
                            🗑
                        </button>
                        <button data-sell-group="${species.id}" title="Sell this fish (pick quantity)" ${allLocked ? 'disabled' : ''}
                                class="px-2.5 h-8 rounded-lg text-[11px] font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                            SELL
                        </button>
                        <span class="text-amber-400 font-bold">
                            <i class="fa-solid fa-coins mr-1"></i>${keyVal(species) * unlocked}
                        </span>
                    </div>
                `;
                content.appendChild(div);
            });

            content.querySelectorAll('[data-lock-group]').forEach(btn => {
                btn.onclick = () => {
                    try { audio.playUIClick(); } catch (e) {}
                    const items = (state.player.bucket || []).filter(f => f && f.id === btn.dataset.lockGroup);
                    if (!items.length) return;
                    const lock = !items.every(f => f.locked);
                    items.forEach(f => this.setFishLock(state, f, lock));
                    if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                    this.renderTab(state, 'sell');
                };
            });
            content.querySelectorAll('[data-drop-group]').forEach(btn => {
                btn.onclick = () => this.dropGroup(state, btn.dataset.dropGroup, false);
            });
            content.querySelectorAll('[data-sell-group]').forEach(btn => {
                btn.onclick = () => this.sellGroup(state, btn.dataset.sellGroup, false);
            });

            // Summon keys / trophies: sellable like fish (🔒 locks protect
            // them from SELL ALL AND from ritual/craft spending).
            if (keyItems.length) {
                const kNote = document.createElement('div');
                kNote.className = 'text-[10px] font-black tracking-widest text-slate-500 mt-2 mb-1 px-1';
                kNote.innerText = '🔑 SUMMON ITEMS (SELL FOR COINS OR SPEND AT RITUALS — 🔒 TO KEEP)';
                content.appendChild(kNote);
                const kGrouped = {};
                keyItems.forEach(it => {
                    if (!kGrouped[it.id]) kGrouped[it.id] = { item: it, count: 0, locked: 0, unlocked: 0 };
                    kGrouped[it.id].count++;
                    if (it.locked) kGrouped[it.id].locked++;
                    else kGrouped[it.id].unlocked++;
                });
                Object.entries(kGrouped).forEach(([kid, { item, count, locked, unlocked }]) => {
                    const price = keyVal(item);
                    const allLocked = locked === count;
                    const hint = item.id === 'storm_egg' ? 'Bake into a Hydra Lure (Bait tab)' : item.id === 'shard' ? '7 open the Void Gate (Ritual)' : item.id === 'void_key' ? 'Shrine center pillar (fish the sea)' : 'Emperor gate piece (Ritual)';
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
                                <div class="text-[10px] text-slate-500">${hint}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <button data-lock-key="${kid}" title="${allLocked ? 'Unlock all (allow selling/spending)' : 'Lock all (protect from SELL ALL + rituals)'}"
                                    class="w-8 h-8 rounded-lg text-sm font-black border transition-all ${allLocked ? 'bg-amber-500/25 text-amber-300 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700'}">
                                ${allLocked ? '🔒' : '🔓'}
                            </button>
                            <button data-drop-key="${kid}" title="Remove from bucket (discard)"
                                    class="w-8 h-8 rounded-lg text-sm font-black border transition-all bg-slate-800 text-slate-400 border-slate-600 hover:bg-rose-900/60 hover:text-rose-300 hover:border-rose-500/50">
                                🗑
                            </button>
                            <button data-sell-key="${kid}" title="Sell this item (pick quantity)" ${allLocked ? 'disabled' : ''}
                                    class="px-2.5 h-8 rounded-lg text-[11px] font-black bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                                SELL
                            </button>
                            <span class="text-amber-400 font-bold">
                                <i class="fa-solid fa-coins mr-1"></i>${price * unlocked}
                            </span>
                        </div>
                    `;
                    content.appendChild(div);
                });
                content.querySelectorAll('[data-lock-key]').forEach(btn => {
                    btn.onclick = () => {
                        try { audio.playUIClick(); } catch (e) {}
                        const items = (state.player.bucket || []).filter(f => f && f.keyItem && f.id === btn.dataset.lockKey);
                        if (!items.length) return;
                        const lock = !items.every(f => f.locked);
                        items.forEach(f => this.setFishLock(state, f, lock));
                        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                        this.renderTab(state, 'sell');
                    };
                });
                content.querySelectorAll('[data-drop-key]').forEach(btn => {
                    btn.onclick = () => this.dropGroup(state, btn.dataset.dropKey, true);
                });
                content.querySelectorAll('[data-sell-key]').forEach(btn => {
                    btn.onclick = () => this.sellGroup(state, btn.dataset.sellKey, true);
                });
            }
        }

        const totalEl = document.getElementById('shop-total-val');
        if (totalEl) totalEl.innerText = T('coins_fmt', { n: totalVal });

        const sellBtn = document.getElementById('btn-sell-all');
        if (sellBtn) sellBtn.disabled = (totalVal === 0);
    },

    // DPS + special-skill chips shown on every gun card so the power
    // ladder reads at a glance (rarity should always mean stronger).
    weaponDPS(w) {
        return Math.round(((w.damage || 0) * (w.count || 1)) / (w.fireRate || 1));
    },

    weaponTags(w) {
        const tags = [];
        const T = (t, c) => tags.push({ t, c });
        if (w.pierce) T('PIERCE', '#93c5fd');
        if (w.explosive) T('BLAST', '#fb923c');
        if (w.burn) T(`BURN ${w.burnDps || 12}/s`, '#f87171');
        if (w.poison) T('VENOM', '#a3e635');
        if (w.freeze) T('FREEZE', '#67e8f9');
        if (w.stun) T('STUN', '#fde047');
        if (w.chain) T('CHAIN', '#38bdf8');
        if (w.lifesteal) T(`DRAIN ${Math.round(w.lifesteal * 100)}%`, '#34d399');
        if (w.coral) T('REEF', '#2dd4bf');
        if (w.slowHook) T('SLOW HOOK', '#7dd3fc');
        if (w.drainMult) T(`STAM X${w.drainMult}`, '#f0abfc');
        if (w.critCh) T(`CRIT ${Math.round(w.critCh * 100)}%`, '#fbbf24');
        if (w.executeMult) T(`EXEC X${w.executeMult}`, '#ef4444');
        if (w.bossMult) T(`BOSS X${w.bossMult}`, '#c084fc');
        if (w.ecoCh) T(`ECO ${Math.round(w.ecoCh * 100)}%`, '#86efac');
        if (w.knockMult) T(`KNOCK X${w.knockMult}`, '#fdba74');
        return tags;
    },

    renderWeapons(state, content) {
        const p = state.player;

        // Lazy PNG probe: only owned guns are checked, once per session
        // (failed probes are cached). No boot-time 404 storm.
        try {
            if (typeof GunSkinLoader !== 'undefined') {
                [...new Set((p.ownedWeapons || []).map(id => {
                    const w = WEAPONS.find(x => x.id === id);
                    return w ? (w.skin || w.id) : id;
                }))].forEach(skinId => {
                    if (!GunSkinLoader.get(skinId) && !(GunSkinLoader.failed || new Set()).has(skinId)) GunSkinLoader.load(skinId);
                });
            }
        } catch (e) {}

        // Rarity order: common -> mythic, cheapest first inside each tier
        const RARITY_ORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
        this._lastWeaponRar = null;
        [...WEAPONS]
            .sort((a, b) => ((RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9)) || a.price - b.price)
            .forEach((w) => {
            const owned = p.ownedWeapons.includes(w.id);
            const equippedAt = p.equippedWeapons.indexOf(w.id);
            const r = RARITY_LABELS[w.rarity] || RARITY_LABELS.common;
            const rarKey = w.rarity || 'common';
            if (this._lastWeaponRar !== rarKey) {
                this._lastWeaponRar = rarKey;
                const h = document.createElement('div');
                h.className = 'text-[10px] font-black tracking-widest mt-2 px-1';
                h.style.color = r.color;
                h.innerText = `— ${r.label.toUpperCase()} —`;
                content.appendChild(h);
            }

            const div = document.createElement('div');
            div.className = `shop-item glass-panel-light p-4 rounded-xl flex items-center justify-between rarity-${w.rarity}`;

            // Live gun-model preview (procedural model or custom PNG skin),
            // so buyers see the actual gun. Falls back to the FA icon.
            let gunArt = `<i class="fa-solid ${w.icon} text-amber-400 text-lg"></i>`;
            try {
                if (typeof Render !== 'undefined' && Render.gunPreview) {
                    const snap = Render.gunPreview(w, p.gunSkins);
                    if (snap) gunArt = `<img src="${snap}" class="gun-preview max-w-[72px] max-h-[36px] object-contain" alt="${w.name}">`;
                }
            } catch (e) {}
            const leftHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-[84px] h-12 rounded-xl flex items-center justify-center bg-slate-900/60 border border-slate-700 shrink-0 overflow-hidden px-1">
                        ${gunArt}
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
                            <span class="text-emerald-400">⚡ ~${Shop.weaponDPS(w)} DPS</span>
                        </div>
                        <div class="flex gap-1 mt-1 flex-wrap">
                            ${Shop.weaponTags(w).map(t => `<span class="text-[9px] font-black px-1.5 py-px rounded border" style="color:${t.c};border-color:${t.c}55;background:${t.c}14">${t.t}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `;

            const right = document.createElement('div');
            right.className = 'flex flex-col items-end gap-1 shrink-0';

            if (!owned) {
                const btn = document.createElement('button');
                // Craft-only forge pieces (no coin price): point at Craft.
                const craftOnly = !!(w.recipe && (w.price === undefined || w.price === null));
                if (craftOnly) {
                    btn.className = 'btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl';
                    btn.textContent = 'CRAFT ONLY';
                    btn.onclick = () => {
                        try { audio.playUIClick(); } catch (e) {}
                        this.renderTab(state, 'craft', 'weapons');
                    };
                    right.appendChild(btn);
                } else {
                    btn.className = 'btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl';
                    btn.innerText = w.price + ' C';
                    btn.disabled = p.coins < w.price;
                    btn.onclick = async () => {
                    // In-flight guard: the server quote awaits network — a
                    // lagged double-click must not buy (and push) twice.
                    if (btn.disabled) return;
                    btn.disabled = true;
                    // Server-canonical price (anti-F12 price=0 edits).
                    let price = w.price;
                    try {
                        if (typeof SecureServer !== 'undefined') {
                            const q = await SecureServer.quote('weapon', w.id, 1);
                            if (q && typeof q.price === 'number') price = q.price;
                        }
                    } catch (e) {}
                    // Re-check AFTER the await: the first tap may have
                    // completed while this one was in flight.
                    if (p.ownedWeapons.includes(w.id)) {
                        this.renderTab(state, 'weapons');
                        return;
                    }
                    if (p.coins < price) {
                        try { audio.playError(); } catch (e) {}
                        btn.disabled = false;
                        return;
                    }
                    p.coins -= price;
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
                } // end craftOnly else (buy path)
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

                // PNG skin toggle for owned guns (assets/guns/<id>.png)
                const skinBtn = document.createElement('button');
                const pngReady = (typeof GunSkinLoader !== 'undefined' && GunSkinLoader.has(w.skin || w.id));
                const prefClassic = p.gunSkins && p.gunSkins[w.id] === 'classic';
                const effectiveCustom = !prefClassic && pngReady;
                skinBtn.className = 'text-[9px] font-black px-2 py-1 rounded-lg border mt-0.5 transition-all ' + (effectiveCustom ? 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700');
                skinBtn.innerText = pngReady ? (effectiveCustom ? 'SKIN: PNG' : 'SKIN: CLASSIC') : 'SKIN: NO PNG';
                skinBtn.title = pngReady ? 'Toggle custom PNG skin (assets/guns/' + (w.skin || w.id) + '.png)' : 'Drop ' + (w.skin || w.id) + '.png into assets/guns/ to unlock a skin';
                skinBtn.onclick = () => {
                    if (!pngReady) {
                        try { audio.playError(); } catch (e) {}
                        Particles.showFloatingText(state, `ADD ${(w.skin || w.id).toUpperCase()}.PNG TO assets/guns/`, p.x, p.y - 40, '#f87171');
                        return;
                    }
                    if (!p.gunSkins) p.gunSkins = {};
                    if (p.gunSkins[w.id] === 'classic') delete p.gunSkins[w.id];
                    else p.gunSkins[w.id] = 'classic';
                    try { audio.playUIClick(); } catch (e) {}
                    if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                    // Live: the room sees the new pref instantly (no snapshot wait).
                    try { if (typeof Multiplayer !== 'undefined' && Multiplayer.pushSkinPrefs) Multiplayer.pushSkinPrefs(); } catch (e) {}
                    this.renderTab(state, 'weapons');
                };
                right.appendChild(skinBtn);

                // Custom upload: any image, fitted without stretching.
                // Left-click = pick/replace, right-click = remove upload.
                const upBtn = document.createElement('button');
                const hasUp = (() => { try { return !!localStorage.getItem('ah_gunskin_' + (w.skin || w.id)); } catch (e) { return false; } })();
                upBtn.className = 'text-[9px] font-black px-2 py-1 rounded-lg border mt-0.5 transition-all ' + (hasUp ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700');
                upBtn.innerText = hasUp ? 'UPLOAD ✓' : 'UPLOAD';
                upBtn.title = 'Upload your own skin (left-click: pick/replace, right-click: remove). Faces right, any size.';
                upBtn.onclick = () => {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = 'image/*';
                    inp.onchange = () => {
                        const f = inp.files && inp.files[0];
                        if (!f) return;
                        if (!p.gunSkins) p.gunSkins = {};
                        delete p.gunSkins[w.id]; // show the upload, not classic
                        GunSkinLoader.saveUpload(w.skin || w.id, f).then(
                            () => {
                                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                                this.renderTab(state, 'weapons');
                                Particles.showFloatingText(state, 'SKIN UPLOADED!', p.x, p.y - 40, '#38bdf8');
                            },
                            (err) => {
                                Particles.showFloatingText(state, (err && err.message) || 'UPLOAD FAILED', p.x, p.y - 40, '#f87171');
                                this.renderTab(state, 'weapons');
                            }
                        );
                    };
                    inp.click();
                };
                upBtn.oncontextmenu = (ev) => {
                    ev.preventDefault();
                    GunSkinLoader.clearUpload(w.skin || w.id);
                    this.renderTab(state, 'weapons');
                    Particles.showFloatingText(state, 'UPLOAD REMOVED', p.x, p.y - 40, '#94a3b8');
                };
                right.appendChild(upBtn);

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

        // Lazy bobber PNG probe: only models of unlocked rods, once per session.
        try {
            if (typeof BobberLoader !== 'undefined') {
                [...new Set(RODS.filter(r => (p.unlockedRods || []).includes(r.id)).map(r => r.bobberModel || 'classic'))].forEach(model => {
                    if (!BobberLoader.get(model) && !(BobberLoader.failed || new Set()).has(model)) BobberLoader.load(model);
                });
            }
        } catch (e) {}

        // Cheapest first — power progression reads top to bottom
        // (craft-only forge pieces sink to the bottom).
        [...RODS.map((r, i) => ({ r, i }))]
            .sort((a, b) => ((a.r.price === undefined || a.r.price === null) ? Infinity : a.r.price) - ((b.r.price === undefined || b.r.price === null) ? Infinity : b.r.price))
            .forEach((o) => {
            const r = o.r;
            const idx = o.i;
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
                <div class="shrink-0 flex flex-col items-end gap-1">
                    ${isEquipped
                        ? `<span class="text-xs text-emerald-400 font-bold px-3 py-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/30">EQUIPPED</span>`
                        : isUnlocked
                            ? `<button data-equip-rod="${idx}" class="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black rounded-xl">EQUIP</button>`
                            : (r.recipe && (r.price === undefined || r.price === null))
                                ? `<button data-craft-rod-go="${idx}" class="btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl"><i class="fa-solid fa-hammer mr-1"></i>CRAFT ONLY</button>`
                                : `<button data-buy-rod="${idx}" class="btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl" ${p.coins < r.price ? 'disabled' : ''}>${r.price} C</button>`}
                    <div class="flex items-center gap-1">
                        <span class="text-[9px] font-black text-slate-400">BOBBER: <span style="color:${r.color}">${(r.bobberModel || 'classic').toUpperCase()}</span></span>
                        <button data-upload-bobber="${idx}" class="text-[9px] font-black px-2 py-0.5 rounded-lg border bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700" title="Upload a custom bobber PNG for this model (left-click: pick/replace, right-click: remove)">UPLOAD</button>
                    </div>
                </div>
            `;
            content.appendChild(div);
        });

        content.querySelectorAll('[data-craft-rod-go]').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                this.renderTab(state, 'craft', 'rods');
            };
        });

        content.querySelectorAll('[data-buy-rod]').forEach(btn => {
            btn.onclick = async () => {
                if (btn.disabled) return;
                btn.disabled = true;
                const idx = +btn.dataset.buyRod;
                const r = RODS[idx];
                const p = state.player;
                let price = r.price;
                try {
                    if (typeof SecureServer !== 'undefined') {
                        const q = await SecureServer.quote('rod', r.id, 1);
                        if (q && typeof q.price === 'number') price = q.price;
                    }
                } catch (e) {}
                if (p.coins >= price && !p.unlockedRods.includes(r.id)) {
                    p.coins -= price;
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
                    try { btn.disabled = false; } catch (e) {}
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

        content.querySelectorAll('[data-upload-bobber]').forEach(btn => {
            const rod = RODS[+btn.dataset.uploadBobber];
            const model = rod ? (rod.bobberModel || 'classic') : 'classic';
            try {
                if (typeof BobberLoader !== 'undefined' && BobberLoader.has(model)) {
                    btn.innerText = 'UPLOAD ✓';
                    btn.classList.add('text-sky-300', 'border-sky-500/40');
                }
            } catch (e) {}
            btn.onclick = () => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'image/*';
                inp.onchange = () => {
                    const f = inp.files && inp.files[0];
                    if (!f || typeof BobberLoader === 'undefined') return;
                    BobberLoader.saveUpload(model, f).then(
                        () => {
                            Particles.showFloatingText(state, 'BOBBER UPLOADED!', state.player.x, state.player.y - 40, '#38bdf8');
                            this.renderTab(state, 'rods');
                        },
                        (err) => {
                            Particles.showFloatingText(state, (err && err.message) || 'UPLOAD FAILED', state.player.x, state.player.y - 40, '#f87171');
                            this.renderTab(state, 'rods');
                        }
                    );
                };
                inp.click();
            };
            btn.oncontextmenu = (ev) => {
                ev.preventDefault();
                try { BobberLoader.clearUpload(model); } catch (e) {}
                this.renderTab(state, 'rods');
                Particles.showFloatingText(state, 'BOBBER UPLOAD REMOVED', state.player.x, state.player.y - 40, '#94a3b8');
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
                    rarity: w.rarity,
                    unit,
                    max,
                    pack: Math.max(10, Math.round(max / 4))
                };
            })
            .sort((a, b) => {
                const order = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
                return ((order[a.rarity] ?? 9) - (order[b.rarity] ?? 9)) || a.unit - b.unit;
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
                // Bulletproof: dataset is DOM-editable — pack must be a
                // positive finite int or the math below mints NaN/free coins.
                let pack = Math.floor(Number(btn.dataset.buyAmmoPack));
                if (!Number.isFinite(pack) || pack < 1) {
                    try { audio.playError(); } catch (e) {}
                    return;
                }
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

    renderBucketTab(state, content) {
        const p = state.player;
        const cap = p.bucketCapacity || 15;
        const list = (typeof BUCKET_UPGRADES !== 'undefined') ? BUCKET_UPGRADES : [];

        const head = document.createElement('div');
        head.className = 'glass-panel-light p-4 rounded-xl text-center mb-2';
        head.innerHTML = `
            <div class="w-14 h-14 mx-auto mb-2 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, #38bdf8, #0ea5e9);">
                <i class="fa-solid fa-bucket text-2xl text-white"></i>
            </div>
            <h3 class="font-bold text-sky-300 text-lg">Fish Bucket</h3>
            <p class="text-slate-400 text-sm">Currently holds <span class="text-white font-bold">${cap} fish</span> (${(p.bucket || []).length} inside)</p>
        `;
        content.appendChild(head);

        list.forEach(u => {
            const owned = cap >= u.cap;
            const isCurrent = cap === u.cap;
            const div = document.createElement('div');
            div.className = 'shop-item glass-panel-light p-4 rounded-xl flex items-center justify-between mb-2';
            div.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900/60 border border-slate-700">
                        <i class="fa-solid ${u.icon || 'fa-bucket'} text-sky-400 text-lg"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-white text-base">${u.name}</h3>
                        <p class="text-xs text-slate-400 mt-0.5">${u.desc}</p>
                        <div class="text-[10px] font-bold text-sky-400 mt-0.5">CAPACITY ${u.cap}</div>
                    </div>
                </div>`;
            const right = document.createElement('div');
            right.className = 'shrink-0';
            if (isCurrent) {
                right.innerHTML = `<span class="text-xs text-emerald-400 font-bold px-3 py-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/30">CURRENT</span>`;
            } else if (owned) {
                right.innerHTML = `<span class="text-xs text-slate-500 font-bold px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700">OWNED</span>`;
            } else {
                const btn = document.createElement('button');
                btn.className = 'btn-buy px-4 py-2 text-slate-950 text-xs font-black rounded-xl';
                btn.innerText = `${u.price.toLocaleString()} C`;
                btn.disabled = p.coins < u.price;
                btn.onclick = () => {
                    if (p.coins < u.price || (p.bucketCapacity || 15) >= u.cap) {
                        try { audio.playError(); } catch (e) {}
                        return;
                    }
                    p.coins -= u.price;
                    p.bucketCapacity = u.cap;
                    try { audio.playCoin(); } catch (e) {}
                    Player.refreshHUD(state);
                    if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
                    if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                    Particles.showFloatingText(state, `BUCKET UPGRADED: ${u.cap} SLOTS!`, p.x, p.y - 40, '#38bdf8');
                    this.renderTab(state, 'bucket');
                };
                right.appendChild(btn);
            }
            div.appendChild(right);
            content.appendChild(div);
        });
    },

    renderBaitTab(state, content) {
        const p = state.player;
        if (typeof Ritual !== 'undefined' && Ritual.ensure) Ritual.ensure(state);
        const stock = p.baitStock || {};
        const activeId = (typeof p.activeBait === 'string') ? p.activeBait : null;
        const activeDef = activeId ? BAITS.find(b => b.id === activeId) : null;

        const head = document.createElement('div');
        head.className = 'glass-panel-light p-4 rounded-xl text-center mb-2';
        head.innerHTML = `
            <div class="w-14 h-14 mx-auto mb-2 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, #f59e0b, #ef4444);">
                <i class="fa-solid fa-worm text-2xl text-white"></i>
            </div>
            <h3 class="font-bold text-amber-300 text-lg">Bait Box</h3>
            <p class="text-slate-400 text-sm">1 craft = 10 baits · 1 hook eats 1 bait. Locked 🔒 keepers are never used.</p>
            ${activeDef ? `<p class="text-xs font-bold mt-1" style="color:${activeDef.color}">◉ ${activeDef.name} on the hook — ×${stock[activeDef.id] || 0} left</p>`
                  : `<p class="text-xs text-slate-500 mt-1">No bait on the hook.</p>`}
        `;
        content.appendChild(head);

        // Summon keys & trophies live here too (discovery hub, live bucket counts)
        const keysBox = document.createElement('div');
        keysBox.className = 'glass-panel-light p-3 rounded-xl mb-2 text-center';
        keysBox.innerHTML = `
            <div class="text-[10px] font-black tracking-widest text-slate-400 mb-1.5">SUMMON STASH (in your bucket)</div>
            ${(typeof Ritual !== 'undefined' && Ritual.stashLine) ? Ritual.stashLine(state) : ''}
            <div class="text-[10px] text-slate-500 mt-1.5">🥚 Stormcaller + gulls + legendary catches · 🔮 void-tainted jumpers/catches only · 🏆 boss kills · 🌊 Marlin's rite calls the Priest · 🌀 fish with a Hydra Lure equipped</div>
        `;
        content.appendChild(keysBox);

        BAITS.forEach(def => {
            const have = stock[def.id] || 0;
            const isActive = activeId === def.id;
            const chk = (typeof Ritual !== 'undefined' && Ritual.canCraft)
                ? Ritual.canCraft(state, def.id) : { ok: false, why: '' };
            const buyPrice = (typeof BAIT_PRICES !== 'undefined' && BAIT_PRICES[def.id]) || 0;
            // Explicit fish + coins recipes render Craft-style have/need
            // rows (same look as armor crafts); legacy tier recipes keep
            // the one-line text.
            const explicit = !!(def.recipe && (def.recipe.fish || def.recipe.coins) && typeof Craft !== 'undefined');
            const recipeTxt = (def.recipe.key ? `${BOSS_KEYS[def.recipe.key].icon} ${BOSS_KEYS[def.recipe.key].name} ×1 + ` : '') +
                `${def.recipe.count}× ${def.recipe.tier} fish → +${def.yield || 10}`;
            const reqRows = explicit ? Craft._reqRows(state, def.recipe).rows : '';
            const div = document.createElement('div');
            div.className = 'shop-item glass-panel-light p-4 rounded-xl flex items-center justify-between mb-2';
            div.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-900/60 border border-slate-700 shrink-0">
                        <i class="fa-solid ${def.icon} text-lg" style="color:${def.color}"></i>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h3 class="font-bold text-white text-base break-words">${def.name}</h3>
                            ${def.hookBait ? '<span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/50">HOOKS HYDRA</span>' : ''}
                            ${isActive ? '<span class="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">ON HOOK</span>' : ''}
                        </div>
                        <p class="text-xs text-slate-400 mt-0.5 break-words">${def.desc}</p>
                        ${explicit
                            ? `<div class="flex flex-col gap-0.5 mt-1 w-full">${reqRows}</div><p class="text-[11px] text-slate-500 mt-0.5">Craft → +${def.yield || 10} · Stock: <span class="text-white font-bold">${have}</span></p>`
                            : `<p class="text-[11px] text-slate-500 mt-0.5 break-words">Craft: ${recipeTxt} · Stock: <span class="text-white font-bold">${have}</span></p>`}
                        ${!chk.ok ? `<p class="text-[11px] text-amber-300/90 break-words">${chk.why || 'Missing ingredients.'}</p>` : ''}
                    </div>
                </div>`;
            const right = document.createElement('div');
            right.className = 'flex flex-col gap-1 shrink-0 ml-2';
            const craftBtn = document.createElement('button');
            craftBtn.className = 'px-3 py-1.5 text-slate-950 text-xs font-black rounded-lg ' +
                (chk.ok ? 'bg-amber-500 hover:bg-amber-400' : 'bg-slate-700 text-slate-500 cursor-not-allowed');
            craftBtn.innerText = `CRAFT +${def.yield || 10}`;
            craftBtn.disabled = !chk.ok;
            craftBtn.onclick = () => {
                if (typeof Ritual !== 'undefined' && Ritual.craftBait) Ritual.craftBait(state, def.id);
                this.renderTab(state, 'bait');
            };
            right.appendChild(craftBtn);
            if (buyPrice > 0) {
                const buyBtn = document.createElement('button');
                const afford = p.coins >= buyPrice;
                buyBtn.className = 'px-3 py-1.5 text-xs font-black rounded-lg ' +
                    (afford ? 'bg-yellow-500 hover:bg-yellow-400 text-slate-950' : 'bg-slate-800 text-slate-500 cursor-not-allowed');
                buyBtn.innerText = `BUY +10 · ${buyPrice}c`;
                buyBtn.disabled = !afford;
                buyBtn.onclick = () => {
                    if (typeof Ritual !== 'undefined' && Ritual.buyBait(state, def.id)) this.renderTab(state, 'bait');
                };
                right.appendChild(buyBtn);
            }
            const useBtn = document.createElement('button');
            useBtn.className = 'px-3 py-1.5 text-xs font-black rounded-lg ' +
                (have > 0 && !isActive ? 'bg-sky-500 hover:bg-sky-400 text-slate-950' : 'bg-slate-800 text-slate-500 cursor-not-allowed');
            useBtn.innerText = isActive ? 'EQUIPPED' : 'USE';
            useBtn.disabled = !(have > 0) || isActive;
            useBtn.onclick = () => {
                if (typeof Ritual !== 'undefined' && Ritual.useBait(state, def.id)) this.renderTab(state, 'bait');
            };
            right.appendChild(useBtn);
            div.appendChild(right);
            content.appendChild(div);
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
                <p class="text-xs text-slate-500 mt-2">Also accessible from the Casino pad & HUD button</p>
            </div>
        `;
        
        const btn = document.getElementById('btn-open-casino-from-shop');
        if (btn) btn.onclick = () => {
            if (typeof Casino !== 'undefined') Casino.open();
            document.getElementById('shop-modal').classList.add('hidden');
        };
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
        // Craft-only pieces (fish + coins recipes) never sell for coins.
        if (item.recipe) {
            try { audio.playError(); } catch (e) {}
            return;
        }
        if (p.coins < item.price) { try { audio.playError(); } catch (e) {} return; }
        p.coins -= item.price;
        p.ownedArmor.push(id);
        // Auto-equip (sets occupy all slots)
        this.equipArmor(state, id, true);
        // Fresh purchase patches you up: buying (not swapping) heals the
        // piece's HP bonus once — swapping owned sets can't farm heals.
        if (item.hpBonus) {
            p.hp = Math.min(p.maxHp, p.hp + item.hpBonus);
            Particles.showFloatingText(state, `+${item.hpBonus} HP ${item.name}!`, p.x, p.y - 50, '#34d399');
        }
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
        const oldMax = p.maxHp;
        if (item.type === 'set') {
            ['head', 'chest', 'hands', 'feet'].forEach(s => { p.equippedArmor[s] = id; });
        } else {
            // Unequip same-slot, and clear set occupying that slot
            p.equippedArmor[item.type] = id;
        }
        this.applyArmorStats(state);
        // Make the gain visible: max HP up already means real HP up (ratio
        // preserve) — flash exactly what changed so wearing feels rewarding
        const gained = (p.maxHp || 0) - (oldMax || 0);
        if (gained !== 0 && !silent) {
            Particles.showFloatingText(state,
                gained > 0 ? `MAX HP +${gained} (${p.maxHp})` : `MAX HP ${gained} (${p.maxHp})`,
                p.x, p.y - 50, gained > 0 ? '#34d399' : '#94a3b8');
        }
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
            'Light': armorItems.filter(a => a.weight === 'Light').sort((a, b) => (a.price || 0) - (b.price || 0)),
            'Medium': armorItems.filter(a => a.weight === 'Medium').sort((a, b) => (a.price || 0) - (b.price || 0)),
            'Heavy': armorItems.filter(a => a.weight === 'Heavy').sort((a, b) => (a.price || 0) - (b.price || 0)),
            'Legendary': armorItems.filter(a => a.rarity === 'legendary').sort((a, b) => (a.price || (a.recipe && a.recipe.coins) || 0) - (b.price || (b.recipe && b.recipe.coins) || 0)),
            'Mythic': [...armorItems.filter(a => a.rarity === 'mythic'), ...sets].sort((a, b) => (a.price || 0) - (b.price || 0)),
            'Crafted': armorItems.filter(a => a.recipe),
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
                const craftChk = (item.recipe && typeof Craft !== 'undefined')
                    ? Craft.check(state, item.recipe) : { ok: true, why: '' };
                const div = document.createElement('div');
                div.className = `shop-item glass-panel p-3 rounded-xl flex items-center justify-between rarity-${item.rarity} ${isEquipped ? 'ring-2 ring-emerald-400' : ''}`;
                div.innerHTML = `
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style="background:${item.color}20;border:1px solid ${item.color}60">
                            <i class="fa-solid fa-${this.armorIcon(item.type)} text-lg" style="color:${item.color}"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h3 class="font-bold text-white text-sm break-words">${item.name}</h3>
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
                            ${item.recipe && typeof Craft !== 'undefined' ? `<div class="flex flex-col gap-0.5 mt-1.5 pt-1.5 border-t border-slate-700/50 w-full">${Craft._reqRows(state, item.recipe).rows}</div>` : ''}
                        </div>
                    </div>
                    <div class="shrink-0 flex flex-col items-end gap-1 ml-2">
                        ${isEquipped
                            ? `<span class="text-xs text-emerald-400 font-bold px-2 py-1 bg-emerald-500/20 rounded">EQUIPPED</span>`
                            : isOwned
                                ? `<button data-equip-armor="${item.id}" class="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black rounded-lg">EQUIP</button>`
                                : item.recipe
                                    ? `<button data-craft-armor="${item.id}" ${craftChk.ok ? '' : 'disabled'} class="btn-buy px-3 py-1.5 text-slate-950 text-xs font-black rounded-lg"><i class="fa-solid fa-hammer mr-1"></i>CRAFT</button>
                                       ${!craftChk.ok && !isOwned ? `<div class="text-[10px] text-amber-300/80 text-right">${craftChk.why || ''}</div>` : ''}`
                                    : `<button data-buy-armor="${item.id}" class="btn-buy px-3 py-1.5 text-slate-950 text-xs font-black rounded-lg" ${p.coins < item.price ? 'disabled' : ''}>${item.price.toLocaleString()} C</button>`}
                    </div>`;
                grid.appendChild(div);
            });
        }
        content.querySelectorAll('[data-buy-armor]').forEach(btn => { btn.onclick = () => this.buyArmor(state, btn.dataset.buyArmor); });
        content.querySelectorAll('[data-craft-armor]').forEach(btn => {
            btn.onclick = () => {
                try {
                    if (typeof Craft !== 'undefined' && Craft.craftArmor(state, btn.dataset.craftArmor)) this.renderTab(state, 'armor');
                } catch (e) {}
            };
        });
        content.querySelectorAll('[data-equip-armor]').forEach(btn => { btn.onclick = () => this.equipArmor(state, btn.dataset.equipArmor); });
        content.querySelectorAll('[data-unequip-armor]').forEach(btn => { btn.onclick = () => this.unequipArmor(state, btn.dataset.unequipArmor); });
    }
};