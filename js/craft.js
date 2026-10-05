/* ====================================================================
 * Craft — fish + coins (+ summon-key material) crafting for baits,
 * armors, rods and weapons.
 * Recipes are EXPLICIT: { coins, fish: [{ id, n }], keys: [{ id, n }] }.
 * Only unlocked (never 🔒 locked, never other summon keys) bucket fish
 * count, oldest entries go first. The grind IS the difficulty.
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
    // recipe: { coins, fish:[{id,n}], keys:[{id,n}] }
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
            // Summon-key material (priest cores, shards...): unlocked only.
            const klist = (recipe && recipe.keys) || [];
            for (const need of klist) {
                if (!need || !need.id) continue;
                const n = Math.max(1, Math.floor(Number(need.n) || 1));
                let meta = { name: need.id, color: '#fbbf24', icon: '🔑' };
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.itemDef) {
                        const def = Ritual.itemDef(need.id);
                        if (def) meta = { name: def.name || need.id, color: def.color || '#fbbf24', icon: def.icon || '🔑' };
                    }
                } catch (e) {}
                let h = 0;
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.countItem) h = Ritual.countItem(state, need.id);
                } catch (e) {}
                parts.push({ kind: 'key', id: need.id, label: `${meta.icon} ${meta.name}`, color: meta.color, have: h, need: n, ok: h >= n });
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
    // Still fails CLOSED on shortfall (returns false, touches nothing)
    // instead of handing the product for partial payment.
    consume(state, recipe) {
        try {
            const p = state.player;
            const coins = Math.max(0, Math.floor(Number((recipe && recipe.coins) || 0)));
            const bucket = p.bucket || [];
            // Pre-scan: every need must be fully payable or nothing moves.
            for (const need of ((recipe && recipe.fish) || [])) {
                if (!need || !need.id) continue;
                const n = Math.max(1, Math.floor(Number(need.n) || 1));
                let have = 0;
                for (const f of bucket) {
                    if (f && f.id === need.id && !f.locked && !f.keyItem && ++have >= n) break;
                }
                if (have < n) return false;
            }
            for (const need of ((recipe && recipe.keys) || [])) {
                if (!need || !need.id) continue;
                const n = Math.max(1, Math.floor(Number(need.n) || 1));
                let have = 0;
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.countItem) have = Ritual.countItem(state, need.id) || 0;
                } catch (e) {}
                if (have < n) return false;
            }
            if ((p.coins || 0) < coins) return false;
            // All payable — now deduct for real.
            p.coins = Math.max(0, (p.coins || 0) - coins);
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
            for (const need of ((recipe && recipe.keys) || [])) {
                if (!need || !need.id) continue;
                const n = Math.max(1, Math.floor(Number(need.n) || 1));
                try {
                    if (typeof Ritual !== 'undefined' && Ritual.consumeItems) Ritual.consumeItems(state, need.id, n);
                } catch (e) {}
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

    craftArmor(state, armorId) {        try {
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

    craftRod(state, rodId) {
        try {
            const rod = (typeof RODS !== 'undefined' ? RODS.find(r => r.id === rodId) : null);
            if (!rod || !rod.recipe) return false;
            const p = state.player;
            if (!p.unlockedRods) p.unlockedRods = ['rod_starter'];
            if (p.unlockedRods.includes(rodId)) return false;
            const chk = this.check(state, rod.recipe);
            if (!chk.ok) {
                try {
                    Particles.showFloatingText(state, chk.why, p.x, p.y - 50, '#f87171');
                    audio.playError();
                } catch (e) {}
                return false;
            }
            if (!this.consume(state, rod.recipe)) return false;
            p.unlockedRods.push(rodId);
            p.equippedRod = rod;
            try { audio.playCoin(); } catch (e) {}
            try {
                Particles.showFloatingText(state, `🎣 ${rod.name} crafted + equipped!`, p.x, p.y - 50, rod.color || '#38bdf8');
            } catch (e) {}
            if (typeof Player !== 'undefined') {
                try { Player.refreshHUD(state); } catch (e) {}
            }
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    craftWeapon(state, weaponId) {
        try {
            const w = (typeof WEAPONS !== 'undefined' ? WEAPONS.find(x => x.id === weaponId) : null);
            if (!w || !w.recipe) return false;
            const p = state.player;
            if (!p.ownedWeapons) p.ownedWeapons = ['pistol'];
            if (p.ownedWeapons.includes(weaponId)) return false;
            const chk = this.check(state, w.recipe);
            if (!chk.ok) {
                try {
                    Particles.showFloatingText(state, chk.why, p.x, p.y - 50, '#f87171');
                    audio.playError();
                } catch (e) {}
                return false;
            }
            if (!this.consume(state, w.recipe)) return false;
            p.ownedWeapons.push(weaponId);
            if (w.id !== 'pistol' && p.weaponAmmo && p.weaponAmmo[w.id] === undefined) {
                p.weaponAmmo[w.id] = (typeof CONFIG !== 'undefined' && CONFIG.MAX_AMMO && CONFIG.MAX_AMMO[w.id]) || 0;
            }
            try { audio.playCoin(); } catch (e) {}
            try {
                Particles.showFloatingText(state, `🔫 ${w.name} forged! Equip it in Guns.`, p.x, p.y - 50, '#fbbf24');
            } catch (e) {}
            if (typeof Player !== 'undefined') {
                try { Player.refreshHUD(state); } catch (e) {}
                try { Player.refreshWeaponHUD(state); } catch (e) {}
            }
            if (typeof UI !== 'undefined' && UI.renderWeaponToolbar) {
                try { UI.renderWeaponToolbar(state); } catch (e) {}
            }
            if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
            if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
            return true;
        } catch (e) { return false; }
    },

    // ---- shop Craft tab (sub-tabs: bait / armor / rods / weapons) ----
    _sub: 'bait',

    renderTab(state, content, sub) {
        try {
            if (sub) this._sub = sub;
            const head = document.createElement('div');
            head.className = 'text-[10px] font-black tracking-widest text-slate-500 mt-1 mb-1 px-1';
            head.innerText = 'CRAFT — SPECIAL FISH + COINS + CORES. LOCKED FISH ARE NEVER EATEN.';
            content.appendChild(head);
            // Sub-tab row.
            const row = document.createElement('div');
            row.className = 'flex gap-1 mb-2 flex-wrap px-1';
            const subs = [
                ['bait', '🪱 Baits'], ['armor', '🛡 Armor'],
                ['rods', '🎣 Rods'], ['weapons', '🔫 Guns'],
            ];
            for (const [id, label] of subs) {
                const b = document.createElement('button');
                const on = this._sub === id;
                b.className = 'px-3 py-1.5 rounded-lg text-xs font-black ' + (on
                    ? 'text-slate-950 bg-amber-400'
                    : 'text-slate-300 bg-slate-800/60 border border-slate-700 hover:bg-slate-700');
                b.innerText = label;
                b.onclick = () => {
                    try {
                        if (typeof Shop !== 'undefined' && Shop.renderTab) Shop.renderTab(state, 'craft', id);
                        else this.renderTab(state, content, id);
                    } catch (e) {}
                };
                row.appendChild(b);
            }
            content.appendChild(row);
            const conf = {
                bait: { title: '🪱 CRAFT BAITS', list: this._baitRecipes() },
                armor: { title: '🛡 CRAFT ARMOR', list: this._armorRecipes() },
                rods: { title: '🎣 CRAFT RODS', list: this._rodRecipes() },
                weapons: { title: '🔫 CRAFT GUNS', list: this._weaponRecipes() },
            }[this._sub] || { title: '', list: [] };
            if (!conf.list.length) {
                const empty = document.createElement('div');
                empty.className = 'text-xs text-slate-500 px-1 py-2';
                empty.innerText = 'Nothing craftable here yet.';
                content.appendChild(empty);
                return;
            }
            const box = document.createElement('div');
            box.className = 'glass-panel-light p-3 rounded-xl mb-2';
            box.innerHTML = `<h4 class="font-bold text-amber-300 mb-2">${conf.title}</h4>`;
            const grid = document.createElement('div');
            grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-2';
            box.appendChild(grid);
            content.appendChild(box);
            for (const r of conf.list) grid.appendChild(this._card(state, r));
            const rerender = () => {
                try {
                    if (typeof Shop !== 'undefined' && Shop.renderTab) Shop.renderTab(state, 'craft', this._sub);
                } catch (e) {}
            };
            content.querySelectorAll('[data-craft-bait]').forEach(btn => {
                btn.onclick = () => {
                    try { if (this.craftBait(state, btn.dataset.craftBait)) rerender(); } catch (e) {}
                };
            });
            content.querySelectorAll('[data-craft-armor]').forEach(btn => {
                btn.onclick = () => {
                    try { if (this.craftArmor(state, btn.dataset.craftArmor)) rerender(); } catch (e) {}
                };
            });
            content.querySelectorAll('[data-craft-rod]').forEach(btn => {
                btn.onclick = () => {
                    try { if (this.craftRod(state, btn.dataset.craftRod)) rerender(); } catch (e) {}
                };
            });
            content.querySelectorAll('[data-craft-weapon]').forEach(btn => {
                btn.onclick = () => {
                    try { if (this.craftWeapon(state, btn.dataset.craftWeapon)) rerender(); } catch (e) {}
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

    _rodRecipes() {
        try {
            if (typeof RODS === 'undefined') return [];
            return RODS.filter(r => r && r.recipe)
                .map(r => ({ kind: 'rod', id: r.id, name: r.name, icon: 'fa-fishing-rod', color: r.color || '#38bdf8', desc: r.desc || '', recipe: r.recipe, rod: r }));
        } catch (e) { return []; }
    },

    _weaponRecipes() {
        try {
            if (typeof WEAPONS === 'undefined') return [];
            return WEAPONS.filter(w => w && w.recipe)
                .map(w => ({ kind: 'weapon', id: w.id, name: w.name, icon: w.icon || 'fa-gun', color: '#fbbf24', desc: w.desc || '', recipe: w.recipe, weapon: w }));
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
        let art = `<i class="fa-solid ${r.icon} text-lg" style="color:${r.color}"></i>`;
        let sub = '';
        let owned = false;
        if (r.kind === 'armor' && r.armor) {
            art = `<i class="fa-solid fa-shield-halved text-lg" style="color:${r.color}"></i>`;
            sub = `DEF +${r.armor.defense || 0}${r.armor.hpBonus ? ` · HP +${r.armor.hpBonus}` : ''}${r.armor.luckBonus ? ` · Luck +${Math.round(r.armor.luckBonus * 100)}%` : ''}${r.armor.speedBonus ? ` · SPD +${r.armor.speedBonus}%` : ''}${r.armor.reelPowerBonus ? ` · Reel +${r.armor.reelPowerBonus}` : ''}`;
            owned = ((state.player.ownedArmor || []).includes(r.id));
        } else if (r.kind === 'rod' && r.rod) {
            art = `<i class="fa-solid fa-fishing-rod text-lg" style="color:${r.color}"></i>`;
            sub = `TEN ${r.rod.tensionMax} · REEL ${r.rod.reelPower} · LUCK +${Math.round((r.rod.luck || 0) * 100)}%`;
            owned = ((state.player.unlockedRods || []).includes(r.id));
        } else if (r.kind === 'weapon' && r.weapon) {
            sub = `DMG ${r.weapon.damage} · ${r.weapon.pellets || ''} · RNG ${r.weapon.range}`;
            owned = ((state.player.ownedWeapons || []).includes(r.id));
        } else if (r.kind === 'bait' && typeof Ritual !== 'undefined' && Ritual.baitDef && Ritual.baitDef(r.id)) {
            sub = `Luck +${Math.round((Ritual.baitDef(r.id).luckBonus || 0) * 100)}% · yield ${Ritual.baitDef(r.id).yield || 10}`;
        }
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
