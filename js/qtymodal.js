// ============================================================
//  QTYMODAL — in-game number picker + confirm dialog.
//  Replaces window.prompt / window.confirm (which break fullscreen,
//  pause, and mobile) with a touch-friendly modal: big - / + pads,
//  slider, quick 1/Half/Max chips, and a numeric field.
//  API (Promise-based):
//    QtyModal.ask({title, sub, min, max, value}) -> Promise<number|null>
//    QtyModal.confirm({title, sub, okText, danger}) -> Promise<boolean>
// ============================================================
const QtyModal = {
    _askResolve: null,
    _confirmResolve: null,
    _askState: null,

    _el(id) { try { return document.getElementById(id); } catch (e) { return null; } },

    _show(id) {
        const el = this._el(id);
        if (el) { el.classList.remove('hidden'); el.classList.add('flex'); }
    },

    _hide(id) {
        const el = this._el(id);
        if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
    },

    _clampAsk() {
        const s = this._askState;
        if (!s) return 1;
        let v = Math.floor(Number(s.value));
        if (!isFinite(v)) v = s.min;
        v = Math.max(s.min, Math.min(s.max, v));
        s.value = v;
        return v;
    },

    _renderAsk() {
        const s = this._askState;
        if (!s) return;
        const v = this._clampAsk();
        const num = this._el('qtymodal-num');
        const range = this._el('qtymodal-range');
        const field = this._el('qtymodal-field');
        if (num) num.innerText = '×' + v;
        if (range) {
            range.min = String(s.min);
            range.max = String(s.max);
            if (document.activeElement !== range) range.value = String(v);
        }
        if (field && document.activeElement !== field) field.value = String(v);
        const ok = this._el('qtymodal-ok');
        if (ok) ok.innerHTML = `<i class="fa-solid fa-check mr-1"></i> OK ×${v}`;
    },

    // Number picker. Resolves the picked int, or null on cancel.
    // Bulletproof: opening a second picker resolves the stale promise with
    // null first — rapid double-clicks can never strand an await forever.
    ask(opts) {
        opts = opts || {};
        if (typeof this._askResolve === 'function') {
            try { this._askResolve(null); } catch (e) {}
            this._askResolve = null;
            this._askState = null;
        }
        const min = Math.max(1, Math.floor(Number(opts.min) || 1));
        const max = Math.max(min, Math.floor(Number(opts.max) || min));
        let def = Math.floor(Number(opts.value));
        if (!isFinite(def)) def = max;
        def = Math.max(min, Math.min(max, def));
        return new Promise((resolve) => {
            this._askResolve = resolve;
            this._askState = { min, max, value: def };
            const t = this._el('qtymodal-title');
            const s = this._el('qtymodal-sub');
            if (t) t.innerText = opts.title || 'HOW MANY?';
            if (s) s.innerText = opts.sub || `Pick 1–${max}`;
            // Quick chips
            try {
                const chips = this._el('qtymodal-chips');
                if (chips) {
                    chips.innerHTML = '';
                    const half = Math.max(min, Math.floor(max / 2));
                    const defs = [
                        { label: '1', v: min },
                        { label: '½', v: half },
                        { label: 'MAX', v: max },
                    ];
                    defs.forEach(d => {
                        const b = document.createElement('button');
                        b.className = 'px-3 py-2 rounded-xl text-xs font-black bg-slate-700/70 border border-slate-600 text-slate-200 hover:bg-slate-600/70';
                        b.innerText = d.label;
                        b.onclick = () => {
                            this._askState.value = Math.max(min, Math.min(max, d.v));
                            this._renderAsk();
                            try { if (typeof audio !== 'undefined' && audio.playUIClick) audio.playUIClick(); } catch (e) {}
                        };
                        chips.appendChild(b);
                    });
                }
            } catch (e) {}
            this._renderAsk();
            this._show('qtymodal-overlay');
            try { if (typeof audio !== 'undefined' && audio.playUIClick) audio.playUIClick(); } catch (e) {}
        });
    },

    _finishAsk(val) {
        this._hide('qtymodal-overlay');
        const r = this._askResolve;
        this._askResolve = null;
        this._askState = null;
        if (typeof r === 'function') { try { r(val); } catch (e) {} }
    },

    // Confirm dialog. Resolves true/false. danger=true paints OK red.
    confirm(opts) {
        opts = opts || {};
        if (typeof this._confirmResolve === 'function') {
            try { this._confirmResolve(false); } catch (e) {}
            this._confirmResolve = null;
        }
        return new Promise((resolve) => {
            this._confirmResolve = resolve;
            const t = this._el('confirmmodal-title');
            const s = this._el('confirmmodal-sub');
            const ok = this._el('confirmmodal-ok');
            if (t) t.innerText = opts.title || 'ARE YOU SURE?';
            if (s) s.innerText = opts.sub || '';
            if (ok) {
                ok.innerHTML = `<i class="fa-solid fa-check mr-1"></i> ${opts.okText || 'CONFIRM'}`;
                ok.className = 'flex-1 px-4 py-3 font-black rounded-xl transition-all shadow-lg active:scale-95 text-sm ' +
                    (opts.danger === false
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950'
                        : 'bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white');
            }
            this._show('confirmmodal-overlay');
            try { if (typeof audio !== 'undefined' && audio.playUIClick) audio.playUIClick(); } catch (e) {}
        });
    },

    _finishConfirm(val) {
        this._hide('confirmmodal-overlay');
        const r = this._confirmResolve;
        this._confirmResolve = null;
        if (typeof r === 'function') { try { r(!!val); } catch (e) {} }
    },

    init() {
        if (this._bound) return;
        this._bound = true;
        const on = (id, fn) => {
            const el = this._el(id);
            if (el && !el._qtyBound) { el._qtyBound = true; el.onclick = fn; }
        };
        on('qtymodal-minus', () => {
            if (!this._askState) return;
            this._askState.value = Math.max(this._askState.min, this._askState.value - 1);
            this._renderAsk();
        });
        on('qtymodal-plus', () => {
            if (!this._askState) return;
            this._askState.value = Math.min(this._askState.max, this._askState.value + 1);
            this._renderAsk();
        });
        on('qtymodal-minus10', () => {
            if (!this._askState) return;
            this._askState.value = Math.max(this._askState.min, this._askState.value - 10);
            this._renderAsk();
        });
        on('qtymodal-plus10', () => {
            if (!this._askState) return;
            this._askState.value = Math.min(this._askState.max, this._askState.value + 10);
            this._renderAsk();
        });
        const range = this._el('qtymodal-range');
        if (range && !range._qtyBound) {
            range._qtyBound = true;
            range.oninput = () => {
                if (!this._askState) return;
                this._askState.value = Math.floor(Number(range.value) || this._askState.min);
                this._renderAsk();
            };
        }
        const field = this._el('qtymodal-field');
        if (field && !field._qtyBound) {
            field._qtyBound = true;
            field.oninput = () => {
                if (!this._askState) return;
                const v = Math.floor(Number(field.value));
                if (isFinite(v)) { this._askState.value = v; this._renderAsk(); }
            };
            field.onchange = () => this._renderAsk();
        }
        on('qtymodal-cancel', () => this._finishAsk(null));
        on('qtymodal-ok', () => {
            if (!this._askState) { this._finishAsk(null); return; }
            this._finishAsk(this._clampAsk());
        });
        on('confirmmodal-cancel', () => this._finishConfirm(false));
        on('confirmmodal-ok', () => this._finishConfirm(true));
        // ESC cancels whichever is open.
        window.addEventListener('keydown', (e) => {
            try {
                if (e.code === 'Escape' || e.code === 'NumpadEnter') { /* let game menus own ESC */ }
            } catch (err) {}
        }, true);
    },
};

window.QtyModal = QtyModal;
