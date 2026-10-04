/* ====================================================================
 * ItemSystem — buyable consumables (shop Items tab) + one equipped item
 * on E + dash slot. State: p.itemStock {id:count}, p.equippedItem id.
 *   bandage:    +60 HP
 *   adrenaline: dash cooldown reset + 1.5x move speed for 8s
 *   smoke:      stun nearby threats 2.5s + 1s i-frames
 * E uses the equipped item when Input.interact finds nothing nearby.
 * Only ONE item equipped at a time; quantities stack per id.
 * ================================================================== */
const ItemSystem = {
    ITEMS: [
        { id: 'bandage', name: 'Bandage', icon: '🩹', desc: 'Restore 60 HP on use.', price: 150, max: 5 },
        { id: 'adrenaline', name: 'Adrenaline', icon: '💉', desc: 'Reset dash cooldown + 1.5× speed for 8s.', price: 300, max: 3 },
        { id: 'smoke', name: 'Smoke Bomb', icon: '💨', desc: 'Stun nearby threats 2.5s + dodge 1s.', price: 250, max: 3 },
    ],

    def(id) {
        try { return this.ITEMS.find(i => i.id === id) || null; } catch (e) { return null; }
    },

    ensure(state) {
        try {
            const p = state.player;
            if (!p.itemStock || typeof p.itemStock !== 'object') p.itemStock = {};
            if (typeof p.equippedItem !== 'string') p.equippedItem = null;
            if (p.equippedItem && !this.def(p.equippedItem)) p.equippedItem = null;
        } catch (e) {}
    },

    stock(state, id) {
        try {
            this.ensure(state);
            return Math.max(0, Math.floor(Number(state.player.itemStock[id]) || 0));
        } catch (e) { return 0; }
    },

    // ---- shop ----
    buy(state, id) {
        try {
            const def = this.def(id);
            if (!def) return false;
            const p = state.player;
            this.ensure(state);
            if (this.stock(state, id) >= def.max) {
                try { audio.playError(); } catch (e) {}
                return false;
            }
            if ((p.coins || 0) < def.price) {
                try { audio.playError(); } catch (e) {}
                return false;
            }
            p.coins -= def.price;
            p.itemStock[id] = this.stock(state, id) + 1;
            if (!p.equippedItem) p.equippedItem = id; // first buy auto-equips
            try { audio.playCoin(); } catch (e) {}
            if (typeof Player !== 'undefined') {
                try { Player.refreshHUD(state); } catch (e) {}
            }
            if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
                try { UI.renderWeaponToolbar(state); } catch (e) {}
            }
            try { if (typeof AntiCheat !== 'undefined' && AntiCheat.markLegit) AntiCheat.markLegit(); } catch (e) {}
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    equip(state, id) {
        try {
            this.ensure(state);
            if (!this.def(id) || this.stock(state, id) <= 0) return false;
            state.player.equippedItem = (state.player.equippedItem === id) ? null : id;
            try { audio.playUIClick(); } catch (e) {}
            if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
                try { UI.renderWeaponToolbar(state); } catch (e) {}
            }
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    // ---- use (E fallback) ----
    useEquipped(state) {
        try {
            const p = state.player;
            if (!p || p.isDead || state.paused) return false;
            this.ensure(state);
            if ((p.itemCd || 0) > 0) return false;
            const id = p.equippedItem;
            const def = id && this.def(id);
            if (!def) {
                try {
                    Particles.showFloatingText(state, 'No item equipped (Items tab in shop)', p.x, p.y - 50, '#94a3b8');
                } catch (e) {}
                return false;
            }
            if (this.stock(state, id) <= 0) {
                try {
                    Particles.showFloatingText(state, `No ${def.name} left!`, p.x, p.y - 50, '#f87171');
                    try { audio.playError(); } catch (e) {}
                } catch (e) {}
                return false;
            }
            // Bandage at full HP is wasted — refuse instead of burning stock.
            if (id === 'bandage' && (p.hp || 0) >= (p.maxHp || 1)) {
                try {
                    Particles.showFloatingText(state, 'HP already full!', p.x, p.y - 50, '#94a3b8');
                } catch (e) {}
                return false;
            }
            p.itemStock[id] = this.stock(state, id) - 1;
            p.itemCd = 0.8;
            let ok = false;
            if (id === 'bandage') {
                if (typeof Player !== 'undefined' && Player.heal) {
                    try { Player.heal(state, 60); ok = true; } catch (e) {}
                }
            } else if (id === 'adrenaline') {
                p.dashCd = 0;
                p.adrenalineT = 8;
                try {
                    Particles.showFloatingText(state, '⚡ ADRENALINE! Dash ready, speed up!', p.x, p.y - 50, '#fde047');
                    try { audio.playLevelUp(); } catch (e) {}
                    ok = true;
                } catch (e) { ok = true; }
            } else if (id === 'smoke') {
                const R = 420;
                let hit = 0;
                try {
                    for (const e of (state.enemies || [])) {
                        if (!e || (e.hp || 0) <= 0) continue;
                        if (Math.hypot(e.x - p.x, e.y - p.y) < R) {
                            e.stunTimer = Math.max(e.stunTimer || 0, 2.5);
                            hit++;
                        }
                    }
                    for (const m of (state.monstersOnLand || [])) {
                        if (!m || (m.hp || 0) <= 0) continue;
                        if (Math.hypot(m.x - p.x, m.y - p.y) < R) {
                            m.stunTimer = Math.max(m.stunTimer || 0, 2.5);
                            hit++;
                        }
                    }
                } catch (e) {}
                p.iframes = Math.max(p.iframes || 0, 1.0);
                try {
                    Particles.spawnParticles(state, p.x, p.y, '#cbd5e1', 24, { size: 6 });
                    Particles.showFloatingText(state, hit > 0 ? `💨 Smoked ${hit} threats!` : '💨 Vanish...', p.x, p.y - 50, '#e2e8f0');
                    try { audio.playWhoosh(); } catch (e) {}
                    ok = true;
                } catch (e) { ok = true; }
            }
            if (ok) {
                if (typeof Player !== 'undefined') {
                    try { Player.refreshHUD(state); } catch (e) {}
                }
                if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
                    try { UI.renderWeaponToolbar(state); } catch (e) {}
                }
                if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
                return true;
            }
            // Effect failed: refund the stock.
            p.itemStock[id] = this.stock(state, id) + 1;
            return false;
        } catch (e) { return false; }
    },

    // ---- shop tab ----
    renderItemsTab(state, content) {
        try {
            const p = state.player;
            this.ensure(state);
            const head = document.createElement('div');
            head.className = 'text-[10px] font-black tracking-widest text-slate-500 mt-1 mb-1 px-1';
            head.innerText = 'CONSUMABLES — BUY STACKS, EQUIP ONE, PRESS [F] TO USE';
            content.appendChild(head);
            for (const def of this.ITEMS) {
                const n = this.stock(state, def.id);
                const equipped = p.equippedItem === def.id;
                const full = n >= def.max;
                const afford = (p.coins || 0) >= def.price;
                const div = document.createElement('div');
                div.className = 'shop-item glass-panel-light p-3 rounded-xl flex items-center justify-between' +
                    (equipped ? ' border border-emerald-500/60' : '');
                div.innerHTML =
                    '<div class="flex items-center gap-3">' +
                        `<div class="w-10 h-10 rounded-lg flex items-center justify-center text-2xl" style="background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.35)">${def.icon}</div>` +
                        '<div>' +
                            `<div class="font-bold text-white text-sm">${def.name} <span class="text-xs text-emerald-300">×${n}</span>` +
                            (equipped ? ' <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200">[E] EQUIPPED</span>' : '') +
                            '</div>' +
                            `<div class="text-[10px] text-slate-400">${def.desc} Max ${def.max}.</div>` +
                        '</div>' +
                    '</div>' +
                    '<div class="flex items-center gap-1.5 shrink-0">' +
                        `<button data-item-equip="${def.id}" title="Equip on [F]" class="px-2.5 h-8 rounded-lg text-[11px] font-black border transition-all ${equipped ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500/50' : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'}">F</button>` +
                        `<button data-item-buy="${def.id}" title="Buy 1 for ${def.price}c" ${(!afford || full) ? 'disabled' : ''} class="btn-buy px-3 h-8 rounded-lg text-[11px] font-black text-slate-950">` +
                            `<i class="fa-solid fa-coins mr-1"></i>${def.price}c</button>` +
                    '</div>';
                content.appendChild(div);
            }
            content.querySelectorAll('[data-item-buy]').forEach(btn => {
                btn.onclick = () => {
                    try {
                        if (this.buy(state, btn.dataset.itemBuy) && typeof Shop !== 'undefined' && Shop.renderTab) {
                            Shop.renderTab(state, 'items');
                        }
                    } catch (e) {}
                };
            });
            content.querySelectorAll('[data-item-equip]').forEach(btn => {
                btn.onclick = () => {
                    try {
                        if (this.equip(state, btn.dataset.itemEquip) && typeof Shop !== 'undefined' && Shop.renderTab) {
                            Shop.renderTab(state, 'items');
                        }
                    } catch (e) {}
                };
            });
        } catch (e) {}
    },

    // ---- hotbar (item slot + dash cooldown), change-guarded ----
    _lastBar: '',
    updateHUD(state) {
        try {
            const bar = document.getElementById('item-bar');
            if (!bar) return;
            this.ensure(state);
            const p = state.player;
            const eq = p.equippedItem;
            const def = eq && this.def(eq);
            const n = eq ? this.stock(state, eq) : 0;
            const dashCd = Math.max(0, Number(p.dashCd) || 0);
            const dashMax = (typeof Player !== 'undefined' && Player.DASH_CD) || 2.5;
            const key = `${eq || '-'}|${n}|${Math.ceil(dashCd * 5)}|${(p.adrenalineT || 0) > 0 ? 1 : 0}`;
            if (key === this._lastBar) return;
            this._lastBar = key;
            const cdPct = dashCd > 0 ? Math.round((1 - dashCd / dashMax) * 100) : 100;
            bar.innerHTML =
                `<div class="flex items-end gap-1.5">` +
                `<div id="item-slot" title="${def ? `${def.name} ×${n} — press F` : 'No item (buy in shop)'}" class="weapon-slot relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${def ? 'border-emerald-700/60 bg-emerald-900/60' : 'border-slate-700/60 bg-slate-900/60 opacity-60'}">` +
                    `<span class="text-xl leading-none">${def ? def.icon : '🎒'}</span>` +
                    `<span class="text-[9px] font-bold mt-0.5 ${def ? 'text-emerald-300' : 'text-slate-600'}">F${def ? ' ×' + n : ''}</span>` +
                `</div>` +
                `<div title="Dash [Q] — i-frame dodge${dashCd > 0 ? ` (${dashCd.toFixed(1)}s)` : ' READY'}" class="relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${dashCd > 0 ? 'border-slate-700/60 bg-slate-900/60' : 'border-sky-500/60 bg-sky-900/40'}">` +
                    `<span class="text-xl leading-none" style="${dashCd > 0 ? 'filter:grayscale(1);opacity:0.5;' : ''}">💨</span>` +
                    `<span class="text-[9px] font-bold mt-0.5 ${dashCd > 0 ? 'text-slate-500' : 'text-sky-300'}">${dashCd > 0 ? dashCd.toFixed(1) + 's' : 'Q'}</span>` +
                    (dashCd > 0 ? `<div class="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"><div class="absolute bottom-0 left-0 right-0 bg-sky-500/25" style="height:${cdPct}%"></div></div>` : '') +
                `</div>` +
                `</div>`;
            const slot = document.getElementById('item-slot');
            if (slot) slot.onclick = () => { try { this.useEquipped(state); } catch (e) {} };
        } catch (e) {}
    },
};

window.ItemSystem = ItemSystem;
