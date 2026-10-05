/**
 * NPC Module — Old Marlin, the quest giver on the beach.
 * Talk with E. Quests ask for specific fish (personal progress, saved).
 * He also tracks the STORMCALLER seagull-miniboss summon count.
 */
const NPC = {
    state: null,
    RADIUS: 115,

    // Camp spot on the sand, between the SHOP and CASINO pads
    spot(state) {
        const B = CONFIG.WORLD;
        const x = Utils.clamp(state.waterBoundaryX - 230, B.MIN_X + 130, state.waterBoundaryX - 110);
        const y = Utils.clamp(B.MIN_Y + 1060, B.MIN_Y + 120, B.MAX_Y - 120);
        return { x, y };
    },

    near(state) {
        const s = this.spot(state);
        return Math.hypot(state.player.x - s.x, state.player.y - s.y);
    },

    init(state) {
        this.state = state;
        this.ensureQuests(state);
        this.bindUI();
        this.updateTracker(state);
        // Safety net: bucket changes from anywhere (sell, load, fresh run)
        // reflect in the tracker within ~1.5s even if a caller forgot to sync.
        if (!this._trackerTimer) {
            this._trackerTimer = setInterval(() => {
                try {
                    if (this.state && this.state.player) {
                        this.syncActive(this.state);
                        this.updateTracker(this.state);
                    }
                } catch (e) {}
            }, 1500);
        }
    },

    // ================= QUEST TRACKER HUD =================
    // Persistent progress panel: active job, have/need, reward.
    _lastTrackerHTML: '',
    updateTracker(state) {
        try {
            const el = (typeof $ !== 'undefined' ? $('quest-tracker') : document.getElementById('quest-tracker'));
            if (!el) return;
            const st = state || this.state;
            if (!st || !st.player) { el.classList.add('hidden'); return; }
            const q = this.syncActive(st) || (st.player.quests && st.player.quests.active);
            if (!q) {
                const html = '';
                if (html !== this._lastTrackerHTML) { this._lastTrackerHTML = html; el.innerHTML = html; }
                el.classList.add('hidden');
                return;
            }
            const sp = this.species(q);
            const done = q.have >= q.need;
            const pct = Math.min(100, Math.round((q.have / Math.max(1, q.need)) * 100));
            const jobNo = (st.player.quests.done || 0) + 1;
            const html = `
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-amber-400">🎯</span>
                    <span class="text-[10px] font-black tracking-widest text-amber-300">MARLIN'S JOB #${jobNo}</span>
                    ${done ? '<span class="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 animate-pulse">TURN IN (E)</span>' : ''}
                </div>
                <div class="text-xs font-bold text-white truncate">${sp.name} <span class="text-[10px] font-black text-slate-400">${sp.rarity.toUpperCase()}</span></div>
                <div class="flex justify-between text-[10px] font-bold mt-1">
                    <span class="${done ? 'text-emerald-300' : 'text-sky-300'}">${q.have} / ${q.need} in bucket</span>
                    <span class="text-amber-300">${q.rewardCoins}c</span>
                </div>
                <div class="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700 mt-1">
                    <div class="h-full rounded-full transition-all ${done ? 'bg-gradient-to-r from-amber-400 to-yellow-300' : 'bg-gradient-to-r from-sky-500 to-sky-400'}" style="width:${pct}%"></div>
                </div>`;
            if (html !== this._lastTrackerHTML) { this._lastTrackerHTML = html; el.innerHTML = html; }
            el.classList.remove('hidden');
            el.classList.toggle('border-amber-400', done);
        } catch (e) {}
    },

    // ================= QUESTS =================
    // One active job at a time. Progress = quest fish ACTUALLY IN the
    // bucket (sold fish don't count). Turn-in REMOVES the quest fish.
    // Difficulty scales with jobs completed (p.quests.done).
    NEED_BY_RARITY: { common: 5, rare: 4, epic: 3, legendary: 2, mythic: 1 },
    NEED_CAP: { common: 8, rare: 6, epic: 5, legendary: 4, mythic: 2 },

    ensureQuests(state) {
        const p = state.player;
        if (!p.quests || !Array.isArray(p.quests.offered)) {
            p.quests = { active: null, offered: [], done: 0 };
        }
        if (typeof p.quests.done !== 'number' || p.quests.done < 0) p.quests.done = 0;
        while (p.quests.offered.length < 3) p.quests.offered.push(this.genOffer(p.quests.done));
        this.syncActive(state);
    },

    // Higher `done` -> rarer species, bigger counts.
    rarityFor(done) {
        const r = Math.random();
        if (done < 3)  return 'common';
        if (done < 6)  return r < 0.7 ? 'common' : 'rare';
        if (done < 10) return r < 0.4 ? 'common' : (r < 0.8 ? 'rare' : 'epic');
        if (done < 15) return r < 0.25 ? 'rare' : (r < 0.7 ? 'epic' : (r < 0.95 ? 'legendary' : 'mythic'));
        if (done < 25) return r < 0.35 ? 'epic' : (r < 0.75 ? 'legendary' : 'mythic');
        return r < 0.5 ? 'legendary' : 'mythic';
    },

    genOffer(done) {
        done = Math.max(0, done | 0);
        const rarity = this.rarityFor(done);
        let pool = FISH_SPECIES.filter(f => !f.isBoss && f.rarity === rarity);
        if (!pool.length) pool = FISH_SPECIES.filter(f => !f.isBoss);
        const sp = pool[Math.floor(Math.random() * pool.length)];
        const base = this.NEED_BY_RARITY[sp.rarity] || 3;
        const cap = this.NEED_CAP[sp.rarity] || 5;
        const need = Math.min(cap, base + Math.floor(done / 6));
        const payMult = 1.5 + Math.min(done, 20) * 0.05;
        return {
            qid: 'q' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
            speciesId: sp.id,
            need,
            have: 0,
            rewardCoins: Math.round(sp.value * need * payMult + 100 + done * 25),
            rewardXp: Math.round(sp.value * need * 0.3) + 20 + done * 5
        };
    },

    // How many of this species are sitting in the bucket right now.
    // Locked keepers never count — a 🔒 means "never sold, never spent",
    // and the quest turn-in IS spending (same rule as shop/craft/ritual).
    countInBucket(state, speciesId) {
        const bucket = state.player.bucket || [];
        let n = 0;
        for (const f of bucket) {
            if (f && !f.locked && (f.id === speciesId || f.speciesId === speciesId)) n++;
        }
        return n;
    },

    // Recompute active progress from the bucket. Sold quest fish un-count.
    syncActive(state) {
        try {
            const p = state.player;
            const a = p.quests && p.quests.active;
            if (!a) return null;
            a.have = Math.min(a.need, this.countInBucket(state, a.speciesId));
            return a;
        } catch (e) { return null; }
    },

    species(q) {
        return FISH_SPECIES.find(s => s.id === q.speciesId) || { id: q.speciesId, name: 'Unknown Fish', color: '#94a3b8', rarity: 'common' };
    },

    accept(state, qid) {
        const p = state.player;
        this.ensureQuests(state);
        if (p.quests.active) return; // one job at a time
        const i = p.quests.offered.findIndex(o => o.qid === qid);
        if (i < 0) return;
        p.quests.active = p.quests.offered.splice(i, 1)[0];
        // Fish already in the bucket count immediately (sync from bucket)
        this.syncActive(state);
        p.quests.offered.push(this.genOffer(p.quests.done));
        try { audio.playCoin(); } catch (e) {}
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.updateTracker(state);
        this.showQuests();
    },

    abandon(state) {
        const p = state.player;
        if (!p.quests || !p.quests.active) return;
        p.quests.active = null; // kept fish stay in the bucket — no penalty
        try { audio.playUIClick(); } catch (e) {}
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.updateTracker(state);
        this.showQuests();
    },

    // Called on every loot pickup — bucket already holds the new fish,
    // so progress is synced from the bucket (never double-counts).
    onCatch(state, species) {
        const p = state.player;
        this.ensureQuests(state);
        const a = this.syncActive(state);
        if (!a || !species || species.id !== a.speciesId) {
            this.updateTracker(state);
            return null;
        }
        const sp = this.species(a);
        if (a.have >= a.need) {
            Particles.showFloatingText(state, 'QUEST COMPLETE! Bring the fish to Old Marlin (E)', p.x, p.y - 60, '#facc15');
            try { audio.playLevelUp(); } catch (e) {}
        } else {
            Particles.showFloatingText(state, `Quest: ${sp.name} ${a.have}/${a.need}`, p.x, p.y - 50, '#38bdf8');
        }
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.updateTracker(state);
        return a;
    },

    claim(state) {
        const p = state.player;
        this.syncActive(state);
        const a = p.quests && p.quests.active;
        if (!a || a.have < a.need) {
            // Fish were sold or never caught — no turn-in without the goods
            const missing = a ? (a.need - a.have) : 0;
            const sp = a ? this.species(a) : null;
            let lockedN = 0;
            try {
                if (a) for (const f of (p.bucket || [])) {
                    if (f && f.locked && (f.id === a.speciesId || f.speciesId === a.speciesId)) lockedN++;
                }
            } catch (e) {}
            Particles.showFloatingText(state,
                a ? `NEED ${missing} MORE ${sp.name.toUpperCase()} IN BUCKET!${lockedN > 0 ? ` (🔒${lockedN} locked — unlock to spend)` : ''}` : 'NO ACTIVE QUEST',
                p.x, p.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
            this.showQuests();
            return;
        }
        // Take the quest fish out of the bucket (hand them to Marlin).
        // Locked keepers are exempt — unlock them first.
        let toRemove = a.need;
        p.bucket = (p.bucket || []).filter(f => {
            if (toRemove > 0 && f && !f.locked && (f.id === a.speciesId || f.speciesId === a.speciesId)) {
                toRemove--;
                return false;
            }
            return true;
        });
        p.coins += a.rewardCoins;
        p.quests.done++;
        p.quests.active = null;
        const sp = this.species(a);
        Particles.showFloatingText(state, `+${a.rewardCoins}c QUEST DONE! (${sp.name} ×${a.need} delivered)`, p.x, p.y - 50, '#facc15');
        if (typeof Player !== 'undefined') {
            Player.addXP(state, a.rewardXp);
            Player.refreshHUD(state);
        }
        try { audio.playVictory(); } catch (e) {}
        if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit();
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(state);
        this.updateTracker(state);
        this.showQuests();
    },

    claimable(state) {
        const a = this.syncActive(state);
        return !!(a && a.have >= a.need);
    },

    // ================= BOSS LORE =================
    bossText(state) {
        const kills = state.player.seagullKills || 0;
        const alive = (state.enemies || []).some(e => e && e.isBoss && e.enemyType === 'seagull' && (e.hp || 0) > 0);
        if (alive) {
            return `SHE IS HERE. Put down the rod, hunter — take up the gun. Her feathers cut like glass, her roar FREEZES you for 2 seconds, and her children dive like living missiles. Stay moving. Aim for the crown.`;
        }
        const r = kills % 20;
        const left = r === 0 ? 20 : 20 - r;
        return `When the sky's children fall to human hands, their fury feeds the STORMCALLER. Slay gulls, and their mother will come for you.\n\nThe sky mourns ${r} of 20. ${left} more ${left === 1 ? 'gull' : 'gulls'} before SHE comes.\n\nHooked horrors from the deep? Same rule: shoot them weak, drag them beached, finish it on the sand.`;
    },

    rumors: [
        'Red line means the line is about to SNAP. Ease off SPACE and let it breathe.',
        'A tired fish drags easy. Shoot the hooked one to drain its stamina first.',
        'Shiny fish pay triple. If you see gold, drop everything.',
        'Armor from the shop shrugs off monster hits. Cowardice works — dress for it.',
        'Reloading costs coins per bullet. The Tac-Pistol is free forever — poverty has perks.',
        'Casino tokens cash out at a 30% cut. The house thanks you for playing.',
        'Jumpers flop back to the sea after a minute. Kill fast or lose the loot.'
    ],

    // ================= DIALOGUE UI =================
    bindUI() {
        const close = $('npc-close');
        if (close) close.onclick = () => this.close();
    },

    open(state) {
        this.state = state || this.state;
        this.ensureQuests(this.state);
        const modal = $('npc-modal');
        if (!modal) return;
        try { audio.playUIClick(); } catch (e) {}
        modal.classList.remove('hidden');
        this.showMain();
    },

    close() {
        const modal = $('npc-modal');
        if (modal) modal.classList.add('hidden');
        try { audio.playUIClick(); } catch (e) {}
    },

    isOpen() {
        const modal = $('npc-modal');
        return !!(modal && !modal.classList.contains('hidden'));
    },

    say(html) {
        const t = $('npc-text');
        if (t) t.innerHTML = html;
    },

    opts(list) {
        // list of [label, fn, style]
        const box = $('npc-buttons');
        if (!box) return;
        box.innerHTML = '';
        list.forEach(([label, fn, cls]) => {
            const b = document.createElement('button');
            b.className = 'w-full text-left px-4 py-2.5 rounded-xl font-bold text-sm transition-all border ' + (cls || 'bg-slate-800/70 hover:bg-slate-700/70 border-slate-700 text-slate-200');
            b.innerHTML = label;
            b.onclick = () => { try { audio.playUIClick(); } catch (e) {} fn(); };
            box.appendChild(b);
        });
    },

    showMain() {
        const st = this.state;
        const q = this.syncActive(st) || st.player.quests.active;
        const dot = (q && q.have >= q.need) ? ' <span class="text-amber-300 font-black">[!]</span>' : '';
        this.say(`Ho, hunter. The sea provides — <b>for a price</b>. What do ye need?${q ? `<br><br>Current job: <b>${this.species(q).name}</b> ${q.have}/${q.need} in bucket.` : ''}`);
        this.opts([
            [`📜 Quest Board${dot}`, () => this.showQuests(), 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-200'],
            ['⛈ Ask about the bosses', () => this.showBosses()],
            ['💬 Hear a rumor', () => this.showRumor()],
            ['Leave', () => this.close()]
        ]);
    },

    showQuests() {
        const st = this.state;
        this.ensureQuests(st);
        this.syncActive(st);
        const box = $('npc-buttons');
        box.innerHTML = '';
        const a = st.player.quests.active;
        let html = '';
        if (a) {
            const sp = this.species(a);
            const done = a.have >= a.need;
            html += `<div class="glass-panel-light p-3 rounded-xl mb-2 border ${done ? 'border-amber-400' : 'border-slate-700'}">
                <div class="font-bold text-white text-sm">🎯 ${sp.name} <span class="text-xs text-slate-400">${sp.rarity.toUpperCase()}</span></div>
                <div class="text-xs text-slate-300">Bucket ${a.have}/${a.need} · Reward ${a.rewardCoins}c + ${a.rewardXp} XP</div>
                ${!done ? `<div class="text-[10px] text-slate-500 mt-0.5">Keep the fish in your bucket — sold fish don't count. Turn-in removes them. Tip: 🔒 lock them in Shop > Sell so SELL ALL skips them.</div>` : `<div class="text-[10px] text-amber-300 font-bold mt-0.5">Turn-in removes ${a.need}× ${sp.name} from your bucket.</div>`}
                <div class="flex gap-2 mt-2">
                    ${done ? `<button id="npc-claim" class="flex-1 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl">CLAIM REWARD</button>` : ''}
                    <button id="npc-abandon" class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded-xl">ABANDON</button>
                </div>
            </div>`;
        } else {
            html += `<div class="text-xs text-slate-400 mb-2">No active job. Pick one below (one at a time):</div>`;
        }
        html += `<div class="text-[10px] font-black tracking-widest text-slate-500 mt-1 mb-1">AVAILABLE JOBS</div>`;
        // HEART OF THE SEA: Marlin trades 10 blood-mutated epic+ catches
        // for the Heart of the Sea (priest chain). Repeatable — each
        // sacrifice burns one heart.
        try {
            const heartHave = (typeof Ritual !== 'undefined' && Ritual.countMutation)
                ? Ritual.countMutation(st, 'blood') : 0;
            const heartBusy = typeof Ritual !== 'undefined' && Ritual.bossAlive && Ritual.bossAlive(st);
            html += `<div class="glass-panel p-2.5 rounded-xl mb-1.5 border border-sky-500/40">
                <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                        <div class="font-bold text-white text-xs">💙 HEART OF THE SEA</div>
                        <div class="text-[10px] text-slate-400">Deliver 10× 🩸 blood-mutated <b>epic+</b> catches — Marlin trades you the <b>Heart of the Sea</b>. Blood in bucket: ${heartHave}/10.</div>
                    </div>
                    <button id="npc-heart" class="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] font-black rounded-lg shrink-0" ${(heartHave >= 10 && !heartBusy) ? '' : 'disabled style="opacity:.4"'}>TRADE</button>
                </div>
            </div>`;
        } catch (e) {}
        st.player.quests.offered.forEach(o => {
            const sp = this.species(o);
            html += `<div class="glass-panel p-2.5 rounded-xl mb-1.5 flex items-center justify-between gap-2">
                <div class="min-w-0">
                    <div class="font-bold text-white text-xs truncate">${sp.name} <span class="text-[9px] text-slate-400">${sp.rarity.toUpperCase()} ×${o.need}</span></div>
                    <div class="text-[10px] text-amber-300 font-bold">${o.rewardCoins}c + ${o.rewardXp} XP</div>
                </div>
                <button data-accept="${o.qid}" class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black rounded-lg shrink-0" ${a ? 'disabled style="opacity:.4"' : ''}>${a ? 'BUSY' : 'ACCEPT'}</button>
            </div>`;
        });
        this.say(html + `<div class="text-[10px] text-slate-500 mt-1">Jobs completed: ${st.player.quests.done} · harder jobs unlock as you finish</div>`);
        this.opts([['← Back', () => this.showMain()]]);
        const claim = $('npc-claim');
        if (claim) claim.onclick = () => this.claim(st);
        const ab = $('npc-abandon');
        if (ab) ab.onclick = () => this.abandon(st);
        // NOTE: ACCEPT buttons live inside #npc-text (say), not #npc-buttons —
        // querying the buttons box here always found nothing (accept never fired).
        const scope = $('npc-modal') || document;
        scope.querySelectorAll('[data-accept]').forEach(b => {
            b.onclick = () => this.accept(st, b.dataset.accept);
        });
        const rite = $('npc-heart');
        if (rite) rite.onclick = () => this.tradeHeart(st);
    },

    // HEART OF THE SEA: 10 blood-mutated epic+ catches for Marlin ->
    // he trades the Heart of the Sea (priest sacrifice fuel). No spawn.
    tradeHeart(st) {
        const p = st.player;
        if (typeof Multiplayer !== 'undefined' && Multiplayer.isClient && Multiplayer.isClient()) {
            Particles.showFloatingText(st, 'Only the host can trade.', p.x, p.y - 50, '#f87171');
            return;
        }
        if (typeof Ritual === 'undefined' || !Ritual.countMutation || !Ritual.consumeMutation) return;
        if (Ritual.bossAlive && Ritual.bossAlive(st)) {
            Particles.showFloatingText(st, 'A boss already walks!', p.x, p.y - 50, '#f87171');
            return;
        }
        if (Ritual.countMutation(st, 'blood') < 10) {
            try { audio.playError(); } catch (e) {}
            return;
        }
        Ritual.consumeMutation(st, 'blood', 10);
        Ritual.grantItem(st, 'heart_sea', "Marlin's trade");
        try { audio.playLevelUp(); } catch (e) {}
        Particles.showFloatingText(st, '💙 Marlin presses a beating heart into your hands...', p.x, p.y - 70, '#38bdf8');
        Player.refreshHUD(st);
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(st);
        this.close();
    },

    showBosses() {
        this.say(this.bossText(this.state).replace(/\n/g, '<br>'));
        this.opts([['← Back', () => this.showMain()]]);
    },

    showRumor() {
        const r = this.rumors[Math.floor(Math.random() * this.rumors.length)];
        this.say(`Old Marlin leans in...<br><br><i>"${r}"</i>`);
        this.opts([
            ['Another one', () => this.showRumor()],
            ['← Back', () => this.showMain()]
        ]);
    },

    // ================= WORLD RENDER =================
    drawWorld(state, ctx) {
        const s = this.spot(state);
        const t = state.time || 0;
        const bob = Math.sin(t * 2) * 2;
        const facing = state.player.x >= s.x ? 1 : -1;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + 16, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Coat
        ctx.fillStyle = '#1e3a5f';
        ctx.beginPath();
        ctx.roundRect(s.x - 12, s.y - 8 + bob * 0.3, 24, 26, 8);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(s.x - 12, s.y + 6, 24, 3); // belt

        // Head + beard
        ctx.fillStyle = '#fcd9b8';
        ctx.beginPath();
        ctx.arc(s.x, s.y - 16 + bob * 0.3, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0'; // beard
        ctx.beginPath();
        ctx.moveTo(s.x - 8, s.y - 12 + bob * 0.3);
        ctx.lineTo(s.x + 8, s.y - 12 + bob * 0.3);
        ctx.lineTo(s.x, s.y + 2 + bob * 0.3);
        ctx.closePath();
        ctx.fill();
        // Sailor cap
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - 24 + bob * 0.3, 11, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(s.x - 11, s.y - 25 + bob * 0.3, 22, 2.5);

        // Rod toward the water + own little bobber ripple
        const hx = s.x + facing * 8;
        const rodTipX = hx + facing * 46, rodTipY = s.y - 6 + bob * 0.3;
        ctx.strokeStyle = '#7c4a21';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(hx, s.y - 2);
        ctx.lineTo(rodTipX, rodTipY);
        ctx.stroke();
        const bx = rodTipX + facing * 26, by = rodTipY + 26;
        ctx.strokeStyle = 'rgba(148,163,184,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rodTipX, rodTipY);
        ctx.quadraticCurveTo((rodTipX + bx) / 2, (rodTipY + by) / 2 + 10, bx, by + Math.sin(t * 4) * 2);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(bx, by + Math.sin(t * 4) * 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Quest marker + name
        if (this.claimable(state)) {
            ctx.font = 'black 22px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = `rgba(251,191,36,${0.7 + Math.sin(t * 6) * 0.3})`;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText('!', s.x, s.y - 44 + bob * 0.3);
            ctx.fillText('!', s.x, s.y - 44 + bob * 0.3);
        }
        ctx.font = 'bold 11px Work Sans';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText('OLD MARLIN', s.x, s.y + 32);
        ctx.fillStyle = '#fcd34d';
        ctx.fillText('OLD MARLIN', s.x, s.y + 32);
    }
};

window.NPC = NPC;
