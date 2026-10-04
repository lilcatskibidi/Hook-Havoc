/* ====================================================================
 * FishRadar — the spawn-camp forecast board. A wooden radar prop stands
 * next to the beach umbrella at spawn; press E beside it to open the
 * bite forecast: which species currently favor your conditions, where
 * (MAIN shore/shallow/deep or ISLE 1/2/3), in which time window and
 * which weather — all read live from WorldSystem.prefsFor/bonusFor,
 * the same tables that roll real bites. Computed on open, never per frame.
 * ================================================================== */
const FishRadar = {
    // Board prop next to the spawn umbrella (mainland beach only).
    pos() { return { x: 385, y: 300 }; },
    RADIUS: 110,

    near(state) {
        try {
            if (!state || !state.player) return false;
            if (state.player.inCave || state.player.onIsland) return false;
            const r = this.pos();
            return Math.hypot(state.player.x - r.x, state.player.y - r.y) < this.RADIUS;
        } catch (e) { return false; }
    },

    isOpen() {
        try {
            const el = document.getElementById('radar-modal');
            return !!(el && !el.classList.contains('hidden'));
        } catch (e) { return false; }
    },

    open(state) {
        try {
            if (typeof audio !== 'undefined' && audio.playUIClick) audio.playUIClick();
        } catch (e) {}
        this.render(state);
        try {
            const el = document.getElementById('radar-modal');
            if (el) el.classList.remove('hidden');
            const c = document.getElementById('radar-close');
            if (c) c.onclick = () => this.close();
        } catch (e) {}
    },

    close() {
        try {
            const el = document.getElementById('radar-modal');
            if (el) el.classList.add('hidden');
        } catch (e) {}
        try {
            if (typeof audio !== 'undefined' && audio.playUIClick) audio.playUIClick();
        } catch (e) {}
    },

    // (Retired with boostRarity — island identity now comes from events.)

    _weatherIcon(w) {
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.weatherIcon) {
                return WorldSystem.weatherIcon(w);
            }
        } catch (e) {}
        return { clear: '☀', clouds: '☁', rain: '🌧', storm: '⛈', fog: '🌫', any: '🎲' }[w] || '🎲';
    },

    // Current bite multiplier for a species (same roll math as fishing).
    _chance(state, sp) {
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.bonusFor) {
                return WorldSystem.bonusFor(sp, state);
            }
        } catch (e) {}
        return 1;
    },

    // Projected odds per spot under the SAME clock/weather: here vs each
    // island's shallows (honest geometry — real sand distance, real zones).
    // This is what sends players ferry-hopping on luck.
    project(state, sp) {
        const out = [];
        try {
            out.push({ isle: 'HERE', mult: this._chance(state, sp) });
            if (typeof WorldSystem === 'undefined') return out;
            const H = (WorldSystem.sandHalf && WorldSystem.sandHalf()) || 560;
            for (const id of ['isle_sun', 'isle_mist', 'isle_abyss']) {
                try {
                    const isl = WorldSystem.islandById(id);
                    if (!isl) continue;
                    const cx = (isl.room.x0 + isl.room.x1) / 2;
                    const cy = (isl.room.y0 + isl.room.y1) / 2;
                    const pst = Object.assign({}, state, {
                        player: Object.assign({}, state.player, {
                            onIsland: id, x: cx + H + 400, y: cy,
                        }),
                    });
                    out.push({ isle: id, mult: this._chance(pst, sp) });
                } catch (e) {}
            }
        } catch (e) {}
        return out;
    },

    // Full island names on the radar (never ISLE 1/2/3).
    _isleShort(id) {
        try {
            if (id === 'isle_sun') return 'SUNSPILL';
            if (id === 'isle_mist') return 'MISTFALL';
            if (id === 'isle_abyss') return 'ABYSS';
        } catch (e) {}
        return 'HERE';
    },

    // Event tag for a target species (first scheduling event), else '—'.
    _eventTag(sp) {
        try {
            const evs = (typeof WorldSystem !== 'undefined' && WorldSystem.EVENTS) || [];
            const hit = evs.find(e => e.targets && e.targets[sp.id] !== undefined);
            if (hit) return `${hit.icon} ${hit.name}`;
        } catch (e) {}
        return '—';
    },

    // Display window: explicit species schedule wins over hash prefs.
    _sched(sp, pref) {
        let time = (pref && pref.time) || 'any';
        let weather = (pref && pref.weather) || 'any';
        try {
            if (Array.isArray(sp.hours) && sp.hours.length === 2) {
                time = `${sp.hours[0]}–${sp.hours[1]}h`;
            }
            if (Array.isArray(sp.weather) && sp.weather.length) {
                weather = sp.weather.join('/');
            }
        } catch (e) {}
        return { time, weather };
    },

    _prefs(sp) {
        try {
            if (typeof WorldSystem !== 'undefined' && WorldSystem.prefsFor) {
                return WorldSystem.prefsFor(sp);
            }
        } catch (e) {}
        return { time: 'any', weather: 'any', zone: 'any' };
    },

    rows(state) {
        const out = [];
        try {
            const list = (typeof FISH_SPECIES !== 'undefined' && FISH_SPECIES) || [];
            for (const sp of list) {
                if (!sp || !sp.id) continue;
                const mult = this._chance(state, sp);
                const pref = this._prefs(sp);
                // Best ferry trip right now (same clock/weather).
                let best = 'HERE', bestMult = mult;
                try {
                    for (const pr of this.project(state, sp)) {
                        if (pr.mult > bestMult + 0.001) { bestMult = pr.mult; best = pr.isle; }
                    }
                } catch (e) {}
                out.push({
                    id: sp.id,
                    name: sp.name || sp.id,
                    color: sp.color || '#38bdf8',
                    rarity: sp.rarity || 'common',
                    boss: !!sp.isBoss,
                    mult,
                    best, bestMult,
                    strict: !!sp.strict,
                    sched: this._sched(sp, pref),
                    zone: pref.zone || 'any',
                    evtag: this._eventTag(sp),
                });
            }
            out.sort((a, b) => b.mult - a.mult);
        } catch (e) {}
        return out.slice(0, 18);
    },

    _rarityColor(r) {
        try {
            if (typeof CONFIG !== 'undefined' && CONFIG.RARITY_COLORS && CONFIG.RARITY_COLORS[r]) {
                return CONFIG.RARITY_COLORS[r];
            }
        } catch (e) {}
        return '#cbd5e1';
    },

    render(state) {
        try {
            const box = document.getElementById('radar-list');
            const head = document.getElementById('radar-head');
            if (!box) return;
            let cond = '';
            try {
                const w = state.world || {};
                const period = (typeof WorldSystem !== 'undefined' && WorldSystem.periodOf)
                    ? WorldSystem.periodOf(w.hour || 9) : '?';
                const wname = (typeof WorldSystem !== 'undefined' && WorldSystem.weatherName)
                    ? WorldSystem.weatherName(w.weather || 'clear') : '';
                const hh = String(Math.floor(w.hour || 9) % 24).padStart(2, '0');
                cond = `DAY ${w.day || 1} · ${hh}:00 ${period.toUpperCase()} · ${this._weatherIcon(w.weather)} ${wname}`;
                if (typeof WorldSystem !== 'undefined' && WorldSystem.activeEvents) {
                    const evs = WorldSystem.activeEvents(state);
                    if (evs.length) cond += ' · ' + evs.map(e => `${e.icon} ${e.name}`).join(' + ');
                }
            } catch (e) {}
            if (head) head.innerText = cond;
            const rows = this.rows(state);
            if (!rows.length) {
                box.innerHTML = '<div class="text-center text-slate-500 text-sm py-8">No sonar contacts…</div>';
                return;
            }
            box.innerHTML = rows.map(r => {
                const pct = Math.max(4, Math.min(100, Math.round(r.mult / 9 * 100)));
                const rc = this._rarityColor(r.rarity);
                const bestHere = r.best === 'HERE';
                const bestTag = bestHere
                    ? `<span class="text-[8px] font-black px-1 py-px rounded bg-emerald-500/25 text-emerald-300">★ BEST HERE</span>`
                    : `<span class="text-[8px] font-black px-1 py-px rounded bg-amber-500/25 text-amber-300">★ ${this._isleShort(r.best)} ×${r.bestMult.toFixed(1)}</span>`;
                const wicons = String(r.sched.weather).split('/').map(w => this._weatherIcon(w)).join('');
                return `<div class="glass-panel-light px-3 py-2 rounded-xl flex items-center gap-3">` +
                    `<div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${r.color}22;border:1px solid ${r.color}66">` +
                        `<i class="fa-solid fa-fish" style="color:${r.color}"></i></div>` +
                    `<div class="flex-1 min-w-0">` +
                        `<div class="flex items-center gap-1.5 flex-wrap">` +
                            `<span class="font-bold text-white text-xs truncate">${r.boss ? '👑 ' : ''}${r.name}</span>` +
                            `<span class="text-[8px] font-black px-1 py-px rounded" style="background:${rc}20;color:${rc}">${String(r.rarity).toUpperCase()}</span>` +
                            `<span class="text-[8px] font-black px-1 py-px rounded bg-fuchsia-500/20 text-fuchsia-300">${r.evtag}</span>` +
                            bestTag +
                        `</div>` +
                        `<div class="text-[10px] text-slate-400 font-bold">⏰ ${r.sched.time}${r.strict ? ' STRICT' : ''} · ${wicons} ${r.sched.weather} · ${r.zone}</div>` +
                        `<div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1">` +
                            `<div class="h-full rounded-full" style="width:${pct}%;background:${rc}"></div>` +
                        `</div>` +
                    `</div>` +
                    `<span class="text-xs font-black shrink-0" style="color:${rc}">×${r.mult.toFixed(1)}</span>` +
                `</div>`;
            }).join('');
        } catch (e) {}
    },
};

window.FishRadar = FishRadar;
