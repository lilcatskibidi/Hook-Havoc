/* ====================================================================
 * Craft — fish + coins crafting for new baits and armors.
 * Recipes are EXPLICIT (fish A x N + fish B x M + coins), unlike the old
 * tier-based bait recipes: only unlocked (never 🔒 locked, never summon
 * keys) bucket fish count, oldest entries go first. The grind IS the
 * difficulty: event/weather-gated fish must actually be caught.
 *   recipe: { coins: n, fish: [{ id, n }] }
 * ================================================================== */
const Craft = {
    // Unlocked, spendable bucket fish of one species id.
    fishCount(state, id) {
        try {
            const bucket = (state.player && state.player.bucket) || [];
            let n = 0;
            for (const f of bucket) {
                if (f && f.id === id && !f.locked && !f.keyItem) n++;
            }
            return n;
        } catch (e) { return 0; }
    },

    fishName(id) {
        try {
            if (typeof FISH_SPECIES !== 'undefined') {
                const sp = FISH_SPECIES.find(s => s && s.id === id);
                if (sp) return { name: sp.name || id, color: sp.color || '#38bdf8' };
            }
        } catch (e) {}
        return { name: id, color: '#94a3b8' };
    },

    // Full requirement check with per-part have/need (for UI rows).
    // recipe: { coins, fish:[{id,n}] }
    check(state, recipe) {
        const parts = [];
        try {
            const p = state.player;
            const coins = Math.max(0, Math.floor(Number((recipe && recipe.coins) || 0)));
            const have = Math.max(0, Math.floor(Number((p && p.coins) || 0)));
            parts.push({ kind: 'coins', label: 'Coins', have, need: coins, ok: have >= coins });
            const list = (recipe && recipe.fish) || [];
            for (const need of list) {
                if (!need || !need.id) continue;
                const n = Math.max(1, Math.floor(Number(need.n) || 1));
                const meta = this.fishName(need.id);
                const h = this.fishCount(state, need.id);
                parts.push({ kind: 'fish', id: need.id, label: meta.name, color: meta.color, have: h, need: n, ok: h >= n });
            }
            const bad = parts.find(x => !x.ok);
            if (bad) {
                const why = bad.kind === 'coins'
                    ? `Need ${bad.need}c (have ${bad.have}c).`
                    : `Need ${bad.need}× ${bad.label} (have ${bad.have}).`;
                return { ok: false, why, parts };
            }
            return { ok: true, why: '', parts };
        } catch (e) {
            return { ok: false, why: 'Cannot craft.', parts };
        }
    },

    // Spend a checked recipe (no re-check inside — call check() first).
    consume(state, recipe) {
        try {
            const p = state.player;
            const coins = Math.max(0, Math.floor(Number((recipe && recipe.coins) || 0)));
            p.coins = Math.max(0, (p.coins || 0) - coins);
            const bucket = p.bucket || [];
            for (const need of ((recipe && recipe.fish) || [])) {
                if (!need || !need.id) continue;
                let left = Math.max(1, Math.floor(Number(need.n) || 1));
                for (let i = bucket.length - 1; i >= 0 && left > 0; i--) {
                    const f = bucket[i];
                    if (f && f.id === need.id && !f.locked && !f.keyItem) {
                        bucket.splice(i, 1);
                        left--;
                    }
                }
            }
            return true;
        } catch (e) { return false; }
    },

    craftBait(state, baitId) {
        try {
            const def = (typeof Ritual !== 'undefined' && Ritual.baitDef) ? Ritual.baitDef(baitId) : null;
            if (!def || !def.recipe || (!def.recipe.fish && !def.recipe.coins)) return false;
            const chk = this.check(state, def.recipe);
            if (!chk.ok) {
                try {
                    Particles.showFloatingText(state, chk.why, state.player.x, state.player.y - 50, '#f87171');
                    audio.playError();
                } catch (e) {}
                return false;
            }
            if (!this.consume(state, def.recipe)) return false;
            const n = def.yield || 10;
            state.player.baitStock[def.id] = (state.player.baitStock[def.id] || 0) + n;
            try { audio.playCoin(); } catch (e) {}
            try {
                Particles.showFloatingText(state, `Crafted +${n} ${def.name}!`, state.player.x, state.player.y - 50, def.color);
            } catch (e) {}
            if (typeof Player !== 'undefined') {
                try { Player.refreshHUD(state); } catch (e) {}
            }
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    craftArmor(state, armorId) {
        try {
            const item = (typeof ARMOR !== 'undefined' ? ARMOR.find(a => a.id === armorId) : null);
            if (!item || !item.recipe) return false;
            const p = state.player;
            if (!p.ownedArmor) p.ownedArmor = ['vest_light'];
            if (p.ownedArmor.includes(armorId)) return false;
            const chk = this.check(state, item.recipe);
            if (!chk.ok) {
                try {
                    Particles.showFloatingText(state, chk.why, p.x, p.y - 50, '#f87171');
                    audio.playError();
                } catch (e) {}
                return false;
            }
            if (!this.consume(state, item.recipe)) return false;
            p.ownedArmor.push(armorId);
            if (typeof Shop !== 'undefined' && Shop.equipArmor) {
                try { Shop.equipArmor(state, armorId, true); } catch (e) {}
            }
            if (item.hpBonus) {
                p.hp = Math.min(p.maxHp, (p.hp || 0) + item.hpBonus);
                try {
                    Particles.showFloatingText(state, `+${item.hpBonus} HP ${item.name}!`, p.x, p.y - 50, '#34d399');
                } catch (e) {}
            }
            try { audio.playCoin(); } catch (e) {}
            if (typeof Player !== 'undefined') {
                try { Player.refreshHUD(state); } catch (e) {}
            }
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    // ---- shop Craft tab ----
    renderTab(state, content) {
        try {
            const head = document.createElement('div');
            head.className = 'text-[10px] font-black tracking-widest text-slate-500 mt-1 mb-1 px-1';
            head.innerText = 'CRAFT — SPECIAL FISH + COINS. LOCKED FISH ARE NEVER EATEN.';
            content.appendChild(head);
            const sections = [
                { title: '🪱 CRAFT BAITS', list: this._baitRecipes(), kind: 'bait' },
                { title: '🛡 CRAFT ARMOR', list: this._armorRecipes(), kind: 'armor' },
            ];
            for (const sec of sections) {
                if (!sec.list.length) continue;
                const box = document.createElement('div');
                box.className = 'glass-panel-light p-3 rounded-xl mb-2';
                box.innerHTML = `<h4 class="font-bold text-amber-300 mb-2">${sec.title}</h4>`;
                const grid = document.createElement('div');
                grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-2';
                box.appendChild(grid);
                content.appendChild(box);
                for (const r of sec.list) grid.appendChild(this._card(state, r));
            }
            content.querySelectorAll('[data-craft-bait]').forEach(btn => {
                btn.onclick = () => {
                    try {
                        if (this.craftBait(state, btn.dataset.craftBait) && typeof Shop !== 'undefined' && Shop.renderTab) {
                            Shop.renderTab(state, 'craft');
                        }
                    } catch (e) {}
                };
            });
            content.querySelectorAll('[data-craft-armor]').forEach(btn => {
                btn.onclick = () => {
                    try {
                        if (this.craftArmor(state, btn.dataset.craftArmor) && typeof Shop !== 'undefined' && Shop.renderTab) {
                            Shop.renderTab(state, 'craft');
                        }
                    } catch (e) {}
                };
            });
        } catch (e) {}
    },

    _baitRecipes() {
        try {
            if (typeof BAITS === 'undefined') return [];
            return BAITS.filter(b => b && b.recipe && (b.recipe.fish || b.recipe.coins))
                .map(b => ({ kind: 'bait', id: b.id, name: b.name, icon: b.icon || 'fa-flask', color: b.color || '#38bdf8', desc: b.desc || '', recipe: b.recipe }));
        } catch (e) { return []; }
    },

    _armorRecipes() {
        try {
            if (typeof ARMOR === 'undefined') return [];
            return ARMOR.filter(a => a && a.recipe)
                .map(a => ({ kind: 'armor', id: a.id, name: a.name, icon: null, color: a.color || '#38bdf8', desc: a.desc || '', recipe: a.recipe, armor: a }));
        } catch (e) { return []; }
    },

    _reqRows(state, recipe) {
        try {
            const chk = this.check(state, recipe);
            const rows = chk.parts.map(x => {
                if (x.kind === 'coins') {
                    return `<div class="flex justify-between gap-2 text-[11px] font-bold"><span class="text-slate-400">Coins</span><span class="shrink-0 ${x.ok ? 'text-emerald-300' : 'text-rose-400'}">${x.have} / ${x.need}c</span></div>`;
                }
                const dot = x.color ? `<span class="inline-block w-2 h-2 rounded-full mr-1 shrink-0" style="background:${x.color}"></span>` : '';
                return `<div class="flex justify-between gap-2 text-[11px] font-bold"><span class="text-slate-300 break-words min-w-0 flex-1">${dot}${x.label}</span><span class="shrink-0 ${x.ok ? 'text-emerald-300' : 'text-rose-400'}">${x.have} / ${x.need}</span></div>`;
            }).join('');
            return { rows, ok: chk.ok, why: chk.why };
        } catch (e) { return { rows: '', ok: false, why: '' }; }
    },

    _card(state, r) {
        const div = document.createElement('div');
        div.className = 'shop-item glass-panel p-3 rounded-xl';
        const { rows, ok } = this._reqRows(state, r.recipe);
        const art = r.kind === 'armor' && r.armor
            ? `<i class="fa-solid fa-shield-halved text-lg" style="color:${r.color}"></i>`
            : `<i class="fa-solid ${r.icon} text-lg" style="color:${r.color}"></i>`;
        const sub = r.kind === 'armor' && r.armor
            ? `DEF +${r.armor.defense || 0}${r.armor.hpBonus ? ` · HP +${r.armor.hpBonus}` : ''}${r.armor.luckBonus ? ` · Luck +${Math.round(r.armor.luckBonus * 100)}%` : ''}${r.armor.speedBonus ? ` · SPD +${r.armor.speedBonus}%` : ''}${r.armor.reelPowerBonus ? ` · Reel +${r.armor.reelPowerBonus}` : ''}`
            : (r.kind === 'bait' && typeof Ritual !== 'undefined' && Ritual.baitDef && Ritual.baitDef(r.id)
                ? `Luck +${Math.round((Ritual.baitDef(r.id).luckBonus || 0) * 100)}% · yield ${Ritual.baitDef(r.id).yield || 10}`
                : '');
        const owned = r.kind === 'armor' && ((state.player.ownedArmor || []).includes(r.id));
        div.innerHTML =
            `<div class="flex items-center gap-3 mb-1.5">` +
                `<div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style="background:${r.color}20;border:1px solid ${r.color}60">${art}</div>` +
                `<div class="min-w-0"><div class="font-bold text-white text-sm break-words">${r.name}${owned ? ' <span class="text-[9px] text-emerald-300 font-black">OWNED</span>' : ''}</div>` +
                `<div class="text-[10px] text-slate-400">${sub}</div></div>` +
            `</div>` +
            `<div class="flex flex-col gap-0.5 mb-2">${rows}</div>` +
            (owned ? '' : `<button data-craft-${r.kind}="${r.id}" ${ok ? '' : 'disabled'} class="btn-buy w-full py-2 text-slate-950 text-xs font-black rounded-lg">` +
                `<i class="fa-solid fa-hammer mr-1"></i>CRAFT</button>`);
        return div;
    },
};

window.Craft = Craft;
