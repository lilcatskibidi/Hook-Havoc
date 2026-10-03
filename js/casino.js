const Casino = {
    state: null,
    currentTab: 'roulette',
    tokens: 0,
    betAmount: 1,
    rouletteNumber: null,
    rouletteSpinning: false,
    rouletteMsg: 'Place bets, then SPIN',
    rouletteMsgColor: 'text-slate-400',
    slotsReels: [0, 0, 0],
    slotsSpinning: false,
    slotsResult: '',
    slotsResultColor: 'text-slate-400',
    slotsBest: -1,
    fishBetSelected: null,
    fishBetResult: '',
    highlowCard: null,
    highlowNextCard: null,
    highlowResult: '',
    highlowPot: 0,

    TOKEN_PRICE: 100,
    CASHOUT_RATE: 70, // 1T -> 70c (house cut just went up)

    // Fish-betting odds: every rarity is priced against the player.
    // EV ranges from -23% (common) to -40% (legendary). The house thanks you.
    FISHBET_ODDS: {
        common:    { mult: 1.2, ch: 35 },
        rare:      { mult: 1.6, ch: 28 },
        epic:      { mult: 2.5, ch: 20 },
        legendary: { mult: 5,   ch: 10 },
        mythic:    { mult: 12,  ch: 5 }
    },

    slotSymbols: [
        { id: 'sardine', name: 'Sardine', color: '#cbd5e1', weight: 30, payout: 2 },
        { id: 'bass', name: 'Bass', color: '#34d399', weight: 25, payout: 3 },
        { id: 'stingray', name: 'Stingray', color: '#a78bfa', weight: 15, payout: 5 },
        { id: 'lionfish', name: 'Lionfish', color: '#fb7185', weight: 10, payout: 8 },
        { id: 'thunder_ray', name: 'Thunder Ray', color: '#38bdf8', weight: 8, payout: 12 },
        { id: 'coral_dragon', name: 'Coral Dragon', color: '#f97316', weight: 5, payout: 20 },
        { id: 'star_ray', name: 'Star Ray', color: '#c084fc', weight: 3, payout: 50 },
        { id: 'elder_dragon', name: 'Elder Dragon', color: '#7c3aed', weight: 2, payout: 100 },
        { id: 'jackpot', name: 'JACKPOT', color: '#fde047', weight: 1, payout: 500 },
    ],

    init(state) {
        this.state = state;
        this.tokens = state.player.casinoTokens || 0;
        this.highlowPot = 0;
        this.bindEvents();
        this.updateTokenDisplay();
    },

    bindEvents() {
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        on('btn-open-casino', () => this.open());
        on('btn-open-casino-hud', () => this.open());
        document.querySelectorAll('.casino-close').forEach(b => { b.onclick = () => this.close(); });
        document.querySelectorAll('.casino-tab-btn').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                document.querySelectorAll('.casino-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.id.replace('casino-tab-', '');
                this.renderTab();
            };
        });
        on('casino-buy-tokens', () => this.buyTokens(1));
        on('casino-buy-tokens-10', () => this.buyTokens(10));
        on('casino-buy-tokens-100', () => this.buyTokens(100));
        on('casino-cashout', () => this.cashout());
    },

    open() {
        try {
            // Late-bind the state if init ran before it existed or was missed
            if (!this.state) {
                try {
                    if (typeof state !== 'undefined' && state.player) this.state = state;
                } catch (e) {}
            }
            if (this.state && this.state.player) {
                // Sync tokens both ways so the HUD/footer never shows stale 0T
                if (typeof this.state.player.casinoTokens === 'number') this.tokens = this.state.player.casinoTokens;
                else this.state.player.casinoTokens = this.tokens;
            }
            // Never stack the shop under the casino
            try {
                const shop = document.getElementById('shop-modal');
                if (shop) shop.classList.add('hidden');
            } catch (e) {}
            const modal = document.getElementById('casino-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                this.renderTab();
                this.updateTokenDisplay();
            }
        } catch (e) {
            try { console.error('[Casino] open failed:', e); } catch (ee) {}
        }
    },

    close() {
        try {
            const modal = document.getElementById('casino-modal');
            if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        } catch (e) {}
    },

    betControlsHTML() {
        return `
            <div class="glass-panel-light p-3 rounded-xl flex items-center justify-center gap-2 flex-wrap">
                <span class="text-xs font-black text-slate-400 tracking-widest">BET</span>
                <button id="casino-bet-minus" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-lg border border-slate-600">−</button>
                <span id="casino-bet-display" class="px-4 py-1.5 bg-slate-950 border border-fuchsia-500/40 rounded-lg font-black text-fuchsia-300 min-w-[4rem] text-center">${this.betAmount}T</span>
                <button id="casino-bet-plus" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-lg border border-slate-600">+</button>
                <button id="casino-bet-max" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg">MAX</button>
                <span class="text-xs text-slate-500">Balance: <span class="text-fuchsia-300 font-bold">${this.tokens}T</span></span>
            </div>`;
    },

    updateTokenDisplay() {
        try {
            if (this.state && this.state.player) {
                const ce = document.getElementById('casino-coins-display');
                if (ce) ce.innerText = this.state.player.coins;
            }
        } catch (e) {}
        ['casino-tokens-display', 'casino-tokens-footer'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = this.tokens;
        });
        const betEl = document.getElementById('casino-bet-display');
        if (betEl) betEl.innerText = `${this.betAmount}T`;
        const cashEl = document.getElementById('casino-cashout-label');
        if (cashEl) cashEl.innerText = `${this.tokens}T → ${Math.floor(this.tokens * this.CASHOUT_RATE)}c`;
        const fb = document.getElementById('casino-tokens-footer2');
        if (fb) fb.innerText = this.tokens;
    },

    adjustBet(delta) {
        if (this.tokens <= 0) { this.betAmount = 1; }
        else this.betAmount = Math.max(1, Math.min(this.tokens, this.betAmount + delta));
        this.updateTokenDisplay();
        this.renderTab();
    },

    setMaxBet() {
        this.betAmount = Math.max(1, this.tokens);
        this.updateTokenDisplay();
        this.renderTab();
    },

    renderTab() {
        const content = document.getElementById('casino-content');
        if (!content) return;
        if (!this.state || !this.state.player) {
            content.innerHTML = `<div class="glass-panel-light p-6 rounded-xl text-center text-sm text-slate-400">Casino is warming up… close and reopen.</div>`;
            return;
        }
        switch (this.currentTab) {
            case 'roulette': this.renderRoulette(content); break;
            case 'slots': this.renderSlots(content); break;
            case 'fishbet': this.renderFishBet(content); break;
            case 'highlow': this.renderHighlow(content); break;
        }
        this.bindDynamicEvents();
        this.updateTokenDisplay();
    },

    bindDynamicEvents() {
        document.querySelectorAll('.roulette-number-btn').forEach(btn => {
            btn.onclick = () => this.placeNumberBet(btn.dataset.number === '00' ? '00' : parseInt(btn.dataset.number));
        });
        document.querySelectorAll('.roulette-color-btn').forEach(btn => {
            if (btn.dataset.color) btn.onclick = () => this.placeColorBet(btn.dataset.color);
            if (btn.dataset.parity) btn.onclick = () => this.placeParityBet(btn.dataset.parity);
            if (btn.dataset.range) btn.onclick = () => this.placeRangeBet(btn.dataset.range);
        });
        document.querySelectorAll('.fish-bet-btn').forEach(btn => {
            btn.onclick = () => { this.fishBetSelected = btn.dataset.fishId; this.renderTab(); };
        });
        const betMinus = document.getElementById('casino-bet-minus');
        const betPlus = document.getElementById('casino-bet-plus');
        const betMax = document.getElementById('casino-bet-max');
        if (betMinus) betMinus.onclick = () => this.adjustBet(-1);
        if (betPlus) betPlus.onclick = () => this.adjustBet(1);
        if (betMax) betMax.onclick = () => this.setMaxBet();
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        on('casino-roulette-spin', () => this.spinRoulette());
        on('casino-roulette-clear', () => this.clearRouletteBets());
        on('casino-slots-spin', () => this.spinSlots());
        on('casino-fishbet-bet', () => this.placeFishBet());
        on('casino-highlow-higher', () => this.highlowGuess(true));
        on('casino-highlow-lower', () => this.highlowGuess(false));
        on('casino-highlow-new', () => this.newHighlowCard());
        on('casino-highlow-cashout', () => this.highlowCashout());
    },

    renderRoulette(content) {
        const numbers = [...Array(37).keys(), '00'];
        const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        const isGreenPocket = (n) => n === 0 || n === '00';
        content.innerHTML = `
            <div class="space-y-4">
                ${this.betControlsHTML()}
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-3">American Roulette (0 + 00 — house edge 5.26%)</h3>
                    <div class="grid grid-cols-12 gap-1 mb-4" style="max-width: 520px; margin: 0 auto;">
                        ${numbers.map(n => `
                            <button class="roulette-number-btn px-1 py-1.5 text-xs font-bold rounded transition-all hover:scale-110 ${
                                isGreenPocket(n) ? 'bg-green-900 text-green-300' :
                                redNumbers.includes(n) ? 'bg-red-900 text-red-300' : 'bg-slate-900 text-white'
                            } ${this.rouletteBetNumbers?.includes(n) ? 'ring-2 ring-amber-400 scale-110' : ''}"
                                data-number="${n}" ${this.rouletteSpinning ? 'disabled' : ''}>${n}</button>
                        `).join('')}
                    </div>
                    <div class="flex gap-2 justify-center mb-2 flex-wrap">
                        <button class="roulette-color-btn px-4 py-2 bg-red-900 text-red-300 font-bold rounded-xl ${this.rouletteBetColor === 'red' ? 'ring-2 ring-amber-400' : ''}" data-color="red" ${this.rouletteSpinning ? 'disabled' : ''}>RED (1:1)</button>
                        <button class="roulette-color-btn px-4 py-2 bg-slate-900 text-white font-bold rounded-xl ${this.rouletteBetColor === 'black' ? 'ring-2 ring-amber-400' : ''}" data-color="black" ${this.rouletteSpinning ? 'disabled' : ''}>BLACK (1:1)</button>
                        <button class="roulette-color-btn px-4 py-2 bg-green-900 text-green-300 font-bold rounded-xl ${this.rouletteBetColor === 'green' ? 'ring-2 ring-amber-400' : ''}" data-color="green" ${this.rouletteSpinning ? 'disabled' : ''}>GREEN (35:1)</button>
                    </div>
                    <div class="flex gap-2 justify-center mb-2 flex-wrap">
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetParity === 'even' ? 'ring-2 ring-amber-400' : ''}" data-parity="even" ${this.rouletteSpinning ? 'disabled' : ''}>EVEN (1:1)</button>
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetParity === 'odd' ? 'ring-2 ring-amber-400' : ''}" data-parity="odd" ${this.rouletteSpinning ? 'disabled' : ''}>ODD (1:1)</button>
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetRange === 'low' ? 'ring-2 ring-amber-400' : ''}" data-range="low" ${this.rouletteSpinning ? 'disabled' : ''}>1-18 (1:1)</button>
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetRange === 'high' ? 'ring-2 ring-amber-400' : ''}" data-range="high" ${this.rouletteSpinning ? 'disabled' : ''}>19-36 (1:1)</button>
                    </div>
                </div>
                <div class="glass-panel p-4 rounded-xl text-center">
                    <div id="roulette-result" class="roulette-ball text-6xl font-black mb-2 ${this.rouletteSpinning ? 'roulette-spinning' : ''}" style="font-family: 'Courier New', monospace;">
                        ${this.rouletteNumber !== null && this.rouletteNumber !== undefined ?
                            `<span class="${(this.rouletteNumber === 0 || this.rouletteNumber === '00') ? 'text-green-400' : (redNumbers.includes(this.rouletteNumber) ? 'text-red-400' : 'text-white')}">${this.rouletteNumber}</span>` :
                            '<span class="text-slate-600">?</span>'}
                    </div>
                    <div class="text-sm font-bold mb-3 ${this.rouletteMsgColor}">${this.rouletteMsg}</div>
                    <div class="flex gap-2 justify-center flex-wrap">
                        <button id="casino-roulette-spin" class="px-8 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all ${this.rouletteSpinning ? 'opacity-50 cursor-not-allowed' : ''}" ${this.rouletteSpinning ? 'disabled' : ''}>
                            <i class="fa-solid fa-circle-notch ${this.rouletteSpinning ? 'fa-spin' : ''} mr-2"></i> SPIN (${this.getTotalRouletteBet()}T)
                        </button>
                        <button id="casino-roulette-clear" class="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl" ${this.rouletteSpinning ? 'disabled' : ''}>CLEAR</button>
                    </div>
                    <p class="text-xs text-slate-400 mt-2">Bet: ${this.getTotalRouletteBet()}T | Tokens: ${this.tokens}T</p>
                </div>
            </div>`;
        document.querySelectorAll('.roulette-number-btn').forEach(btn => {
            btn.onclick = () => this.placeNumberBet(btn.dataset.number === '00' ? '00' : parseInt(btn.dataset.number));
        });
        document.querySelectorAll('.roulette-color-btn').forEach(btn => {
            if (btn.dataset.color) btn.onclick = () => this.placeColorBet(btn.dataset.color);
            if (btn.dataset.parity) btn.onclick = () => this.placeParityBet(btn.dataset.parity);
            if (btn.dataset.range) btn.onclick = () => this.placeRangeBet(btn.dataset.range);
        });
    },

    weightedSlotIndex() {
        const total = this.slotSymbols.reduce((a, s) => a + s.weight, 0);
        let r = Math.random() * total;
        for (let i = 0; i < this.slotSymbols.length; i++) {
            r -= this.slotSymbols[i].weight;
            if (r <= 0) return i;
        }
        return 0;
    },

    renderSlots(content) {
        const reels = this.slotsReels;
        const totalW = this.slotSymbols.reduce((a, s) => a + s.weight, 0);
        const won = !!this.slotsWon;
        content.innerHTML = `
            <div class="space-y-4">
                ${this.betControlsHTML()}
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-3 text-center">Deep Sea Slots</h3>
                    <div class="flex justify-center gap-3 mb-2">
                        ${[0, 1, 2].map(i => {
                            const s = this.slotSymbols[reels[i]] || this.slotSymbols[0];
                            const isBest = won && (this.slotsBest === i || this.slotsBest === -2);
                            return `
                            <div id="slot-reel-${i}" class="slot-reel w-24 h-24 rounded-xl flex flex-col items-center justify-center font-bold ${this.slotsSpinning ? 'slot-spinning' : ''} ${isBest ? 'slot-win' : ''}"
                                style="background: linear-gradient(135deg, ${s.color}22, ${s.color}44); border: 3px solid ${isBest ? '#fde047' : s.color + '66'}; box-shadow: ${isBest ? '0 0 24px #fde047' : 'none'};">
                                <i class="fa-solid fa-fish text-3xl" style="color: ${s.color}"></i>
                                <span class="text-[9px] font-black mt-1" style="color:${s.color}">${s.name.toUpperCase()}</span>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="text-center text-sm font-bold mb-1 ${this.slotsResultColor}">${this.slotsResult || 'Only 3 of a kind pays | Jackpot: 500x'}</div>
                    <div class="text-center text-xs text-slate-500">Pairs pay nothing · The house thanks you for playing</div>
                </div>
                <div class="glass-panel p-4 rounded-xl text-center">
                    <button id="casino-slots-spin" class="px-8 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all ${this.slotsSpinning || this.betAmount > this.tokens ? 'opacity-50 cursor-not-allowed' : ''}" ${(this.slotsSpinning || this.betAmount > this.tokens) ? 'disabled' : ''}>
                        <i class="fa-solid fa-circle-notch ${this.slotsSpinning ? 'fa-spin' : ''} mr-2"></i> SPIN (${this.betAmount}T)
                    </button>
                    <p class="text-xs text-slate-400 mt-2">Bet: ${this.betAmount}T | Tokens: ${this.tokens}T</p>
                </div>
                <div class="glass-panel-light p-3 rounded-xl text-xs text-slate-400 overflow-x-auto">
                    <table class="w-full">
                        <thead><tr><th class="text-left">Symbol</th><th class="text-right">Payout</th><th class="text-right">Chance</th></tr></thead>
                        <tbody>
                            ${this.slotSymbols.map(s => `
                                <tr class="border-t border-slate-800">
                                    <td><i class="fa-solid fa-fish mr-1" style="color: ${s.color}"></i> ${s.name}</td>
                                    <td class="text-right font-bold text-amber-300">${s.payout}x</td>
                                    <td class="text-right text-slate-500">${(s.weight / totalW * 100).toFixed(1)}%</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    },

    renderFishBet(content) {
        const caughtFish = this.state.player.caughtFish || [];
        const uniqueFish = [...new Map(caughtFish.map(f => [f.id, f])).values()];
        content.innerHTML = `
            <div class="space-y-4">
                ${this.betControlsHTML()}
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-1">Fish Betting</h3>
                    <p class="text-slate-400 text-sm mb-1">Select a caught fish. Higher rarity = higher multiplier, lower win chance.</p>
                    <div class="text-sm font-bold text-center mb-3 ${this.fishBetResultColor || 'text-slate-500'}">${this.fishBetResult || ''}</div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                        ${uniqueFish.length === 0 ? `
                            <div class="col-span-full text-center py-8 text-slate-500">
                                <i class="fa-solid fa-fish text-4xl mb-2"></i>
                                <p class="font-bold text-slate-300">No fish caught yet — this game is locked.</p>
                                <p class="text-xs mt-1">Catch any fish (or grab beached floppers) to unlock Fish Betting.<br>Try Roulette, Slots or High-Low meanwhile!</p>
                            </div>` : uniqueFish.map(fish => {
                            const odds = (this.FISHBET_ODDS && this.FISHBET_ODDS[fish.rarity]) || { mult: 1, ch: 5 };
                            const rarityMult = odds.mult;
                            const winChance = odds.ch;
                            return `
                                <button class="fish-bet-btn glass-panel p-3 rounded-xl text-center transition-all hover:scale-105 ${this.fishBetSelected === fish.id ? 'ring-2 ring-fuchsia-400 bg-fuchsia-500/10 scale-105' : ''}"
                                    data-fish-id="${fish.id}" ${this.tokens < this.betAmount ? 'disabled' : ''}>
                                    <div class="w-12 h-12 mx-auto mb-1 rounded-lg flex items-center justify-center" style="background: ${fish.color}22; border: 1px solid ${fish.color}44;">
                                        <i class="fa-solid fa-fish text-xl" style="color: ${fish.color}"></i>
                                    </div>
                                    <div class="font-bold text-xs text-white">${fish.name}</div>
                                    <div class="text-[9px] font-black text-slate-300">${fish.rarity.toUpperCase()}</div>
                                    <div class="text-[9px] text-amber-300 mt-1">${rarityMult}x payout</div>
                                    <div class="text-[8px] text-slate-500">${winChance}% win</div>
                                </button>`;
                        }).join('')}
                    </div>
                </div>
                <div class="glass-panel p-4 rounded-xl text-center">
                    <button id="casino-fishbet-bet" class="px-8 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all ${!this.fishBetSelected || this.tokens < this.betAmount ? 'opacity-50 cursor-not-allowed' : ''}" ${!this.fishBetSelected || this.tokens < this.betAmount ? 'disabled' : ''}>
                        <i class="fa-solid fa-dice mr-2"></i> BET ${this.betAmount}T ON ${this.fishBetSelected ? (uniqueFish.find(f => f.id === this.fishBetSelected)?.name || '...') : 'SELECT FISH'}
                    </button>
                    <p class="text-xs text-slate-400 mt-2">Tokens: ${this.tokens}T</p>
                </div>
            </div>`;
        document.querySelectorAll('.fish-bet-btn').forEach(btn => {
            btn.onclick = () => { this.fishBetSelected = btn.dataset.fishId; this.renderTab(); };
        });
    },

    renderHighlow(content) {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        if (!this.highlowCard) this.highlowCard = { suit: suits[Math.floor(Math.random() * 4)], value: values[Math.floor(Math.random() * 13)] };
        const revealed = this.highlowNextCard;
        content.innerHTML = `
            <div class="space-y-4">
                ${this.betControlsHTML()}
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-1 text-center">High-Low — Streak Pot</h3>
                    <p class="text-slate-400 text-xs text-center mb-3">Each win adds to the pot and deals a new card. Cash out anytime or lose it all on a wrong guess. Ties push (keep pot).</p>
                    <div class="flex justify-center gap-4 mb-3">
                        <div class="w-24 h-32 rounded-xl flex flex-col items-center justify-center font-bold text-3xl ${['♥', '♦'].includes(this.highlowCard.suit) ? 'text-red-400' : 'text-white'} bg-slate-900 border-2 border-slate-700 shadow-lg">
                            <span>${this.highlowCard.value}</span><span class="text-4xl">${this.highlowCard.suit}</span>
                        </div>
                        <span class="text-4xl text-amber-400 self-center">→</span>
                        <div class="w-24 h-32 rounded-xl flex flex-col items-center justify-center font-bold text-3xl ${revealed ? (['♥', '♦'].includes(revealed.suit) ? 'text-red-400' : 'text-white') + ' bg-slate-900 border-fuchsia-500 card-flip' : 'bg-slate-800 border-slate-600 text-slate-500'} border-2">
                            ${revealed ? `<span>${revealed.value}</span><span class="text-4xl">${revealed.suit}</span>` : '<span>?</span>'}
                        </div>
                    </div>
                    <div class="text-center text-sm font-bold ${this.highlowResultColor || 'text-slate-400'} mb-1">${this.highlowResult || ''}</div>
                    <div class="text-center text-sm">
                        <span class="font-bold text-amber-300">Pot: ${this.highlowPot}T</span> ·
                        <span class="font-bold text-fuchsia-300">Streak: ${this.highlowStreak || 0}</span>
                    </div>
                </div>
                <div class="glass-panel p-4 rounded-xl text-center">
                    <div class="flex gap-2 justify-center mb-3 flex-wrap">
                        <button id="casino-highlow-higher" class="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-xl ${(!this.highlowPot && this.betAmount > this.tokens) ? 'opacity-50 cursor-not-allowed' : ''}" ${(!this.highlowPot && this.betAmount > this.tokens) ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-up mr-2"></i> HIGHER
                        </button>
                        <button id="casino-highlow-lower" class="flex-1 px-6 py-3 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-black rounded-xl ${(!this.highlowPot && this.betAmount > this.tokens) ? 'opacity-50 cursor-not-allowed' : ''}" ${(!this.highlowPot && this.betAmount > this.tokens) ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-down mr-2"></i> LOWER
                        </button>
                    </div>
                    <div class="flex gap-2 justify-center flex-wrap">
                        <button id="casino-highlow-cashout" class="px-6 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl ${!this.highlowPot ? 'opacity-50 cursor-not-allowed' : ''}" ${!this.highlowPot ? 'disabled' : ''}>
                            <i class="fa-solid fa-sack-dollar mr-1"></i> CASH OUT POT (${this.highlowPot}T)
                        </button>
                        <button id="casino-highlow-new" class="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl">
                            <i class="fa-solid fa-redo mr-1"></i> New Card (forfeit pot)
                        </button>
                    </div>
                    <p class="text-xs text-slate-400 mt-2">Entry bet: ${this.betAmount}T | Tokens: ${this.tokens}T</p>
                </div>
            </div>`;
    },

    getRarityColor(rarity) {
        const colors = { common: 'slate', rare: 'sky', epic: 'fuchsia', legendary: 'amber', mythic: 'yellow' };
        return colors[rarity] || 'slate';
    },

    rouletteBetNumbers: [],
    rouletteBetColor: null,
    rouletteBetParity: null,
    rouletteBetRange: null,

    placeNumberBet(number) {
        if (this.rouletteSpinning || this.betAmount > this.tokens) return;
        if (!this.rouletteBetNumbers) this.rouletteBetNumbers = [];
        if (this.rouletteBetNumbers.includes(number)) this.rouletteBetNumbers = this.rouletteBetNumbers.filter(n => n !== number);
        else {
            if ((this.rouletteBetNumbers.length + (this.rouletteBetColor ? 1 : 0) + (this.rouletteBetParity ? 1 : 0) + (this.rouletteBetRange ? 1 : 0) + 1) * this.betAmount > this.tokens) return;
            this.rouletteBetNumbers.push(number);
        }
        try { audio.playUIClick(); } catch (e) {}
        this.renderTab();
    },

    placeColorBet(color) {
        if (this.rouletteSpinning || this.betAmount > this.tokens) return;
        this.rouletteBetColor = this.rouletteBetColor === color ? null : color;
        try { audio.playUIClick(); } catch (e) {}
        this.renderTab();
    },

    placeParityBet(parity) {
        if (this.rouletteSpinning || this.betAmount > this.tokens) return;
        this.rouletteBetParity = this.rouletteBetParity === parity ? null : parity;
        try { audio.playUIClick(); } catch (e) {}
        this.renderTab();
    },

    placeRangeBet(range) {
        if (this.rouletteSpinning || this.betAmount > this.tokens) return;
        this.rouletteBetRange = this.rouletteBetRange === range ? null : range;
        try { audio.playUIClick(); } catch (e) {}
        this.renderTab();
    },

    clearRouletteBets() {
        this.rouletteBetNumbers = []; this.rouletteBetColor = null; this.rouletteBetParity = null; this.rouletteBetRange = null;
        this.rouletteMsg = 'Bets cleared'; this.rouletteMsgColor = 'text-slate-400';
        this.renderTab();
    },

    getTotalRouletteBet() {
        let total = 0;
        if (this.rouletteBetNumbers) total += this.rouletteBetNumbers.length * this.betAmount;
        if (this.rouletteBetColor) total += this.betAmount;
        if (this.rouletteBetParity) total += this.betAmount;
        if (this.rouletteBetRange) total += this.betAmount;
        return total;
    },

    spinRoulette() {
        const totalBet = this.getTotalRouletteBet();
        if (this.rouletteSpinning) return;
        if (totalBet === 0) {
            this.rouletteMsg = 'Place a bet first — click numbers or RED/BLACK!';
            this.rouletteMsgColor = 'text-amber-300';
            try { audio.playError(); } catch (e) {}
            this.renderTab();
            return;
        }
        if (totalBet > this.tokens) {
            this.rouletteMsg = 'Not enough tokens — lower the bet or buy more!';
            this.rouletteMsgColor = 'text-rose-400';
            try { audio.playError(); } catch (e) {}
            this.renderTab();
            return;
        }
        this.tokens -= totalBet;
        this.rouletteSpinning = true;
        this.rouletteMsg = 'Spinning...'; this.rouletteMsgColor = 'text-amber-300';
        this.updateTokenDisplay(); this.renderTab();
        // Animated number cycling (38 pockets, American wheel)
        let ticks = 0;
        const ticker = setInterval(() => {
            const r = Math.floor(Math.random() * 38);
            this.rouletteNumber = r === 37 ? '00' : r;
            const el = document.getElementById('roulette-result');
            if (el) {
                const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
                const cls = (this.rouletteNumber === 0 || this.rouletteNumber === '00') ? 'text-green-400' : (reds.includes(this.rouletteNumber) ? 'text-red-400' : 'text-white');
                el.innerHTML = `<span class="${cls}">${this.rouletteNumber}</span>`;
            }
            if (++ticks >= 14) {
                clearInterval(ticker);
                this.resolveRoulette(totalBet);
            }
        }, 110);
    },

    resolveRoulette(totalBet) {
        const r = Math.floor(Math.random() * 38);
        this.rouletteNumber = r === 37 ? '00' : r;
        const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        const isZero = this.rouletteNumber === 0 || this.rouletteNumber === '00';
        let winnings = 0;
        if (this.rouletteBetNumbers?.includes(this.rouletteNumber)) winnings += this.betAmount * 35;
        if (this.rouletteBetColor) {
            const isRed = redNumbers.includes(this.rouletteNumber);
            const isBlack = !isZero && !isRed;
            if ((this.rouletteBetColor === 'red' && isRed) || (this.rouletteBetColor === 'black' && isBlack) || (this.rouletteBetColor === 'green' && isZero)) winnings += this.betAmount * (isZero ? 35 : 1);
        }
        if (this.rouletteBetParity && !isZero) {
            const isEven = this.rouletteNumber % 2 === 0;
            if ((this.rouletteBetParity === 'even' && isEven) || (this.rouletteBetParity === 'odd' && !isEven)) winnings += this.betAmount;
        }
        if (this.rouletteBetRange && !isZero) {
            const isLow = this.rouletteNumber <= 18;
            if ((this.rouletteBetRange === 'low' && isLow) || (this.rouletteBetRange === 'high' && !isLow)) winnings += this.betAmount;
        }
        if (winnings > 0) {
            this.tokens += winnings + totalBet;
            this.rouletteMsg = `WIN +${winnings}T! (landed ${this.rouletteNumber})`;
            this.rouletteMsgColor = 'text-emerald-400';
            try { audio.playCoin(); } catch (e) {}
            if (typeof Achievements !== 'undefined') Achievements.onCasinoWin(this.state, winnings);
        } else {
            this.rouletteMsg = `Lost ${totalBet}T — landed ${this.rouletteNumber}`;
            this.rouletteMsgColor = 'text-rose-400';
            try { audio.playError(); } catch (e) {}
            if (typeof Achievements !== 'undefined') Achievements.onCasinoLoss(this.state, totalBet);
        }
        this.rouletteSpinning = false;
        this.rouletteBetNumbers = []; this.rouletteBetColor = null; this.rouletteBetParity = null; this.rouletteBetRange = null;
        this.updateTokenDisplay();
        if (this.currentTab === 'roulette') this.renderTab();
        this.saveTokens();
    },

    spinSlots() {
        if (this.betAmount > this.tokens || this.slotsSpinning) return;
        const bet = this.betAmount;
        this.tokens -= bet;
        this.slotsSpinning = true; this.slotsBest = -1; this.slotsWon = false;
        this.slotsResult = 'Spinning...'; this.slotsResultColor = 'text-amber-300';
        this.updateTokenDisplay(); this.renderTab();
        // Staggered reel reveal animation
        const final = [this.weightedSlotIndex(), this.weightedSlotIndex(), this.weightedSlotIndex()];
        const flicker = setInterval(() => {
            for (let i = 0; i < 3; i++) {
                if (Date.now() < this['_slotLock' + i]) continue;
                this.slotsReels[i] = Math.floor(Math.random() * this.slotSymbols.length);
                const el = document.getElementById('slot-reel-' + i);
                if (el) {
                    const s = this.slotSymbols[this.slotsReels[i]];
                    el.style.borderColor = s.color + '66';
                    el.style.boxShadow = 'none';
                    el.innerHTML = `<i class="fa-solid fa-fish text-3xl" style="color:${s.color}"></i><span class="text-[9px] font-black mt-1" style="color:${s.color}">${s.name.toUpperCase()}</span>`;
                }
            }
        }, 60);
        const now = Date.now();
        this._slotLock0 = now + 600; this._slotLock1 = now + 1100; this._slotLock2 = now + 1800;
        const lockReel = (i) => {
            this.slotsReels[i] = final[i];
            const el = document.getElementById('slot-reel-' + i);
            if (el) {
                el.classList.remove('slot-spinning');
                el.classList.add('slot-lock');
                setTimeout(() => { try { el.classList.remove('slot-lock'); } catch (e) {} }, 260);
                const s = this.slotSymbols[final[i]];
                el.style.borderColor = s.color;
                el.innerHTML = `<i class="fa-solid fa-fish text-3xl" style="color:${s.color}"></i><span class="text-[9px] font-black mt-1" style="color:${s.color}">${s.name.toUpperCase()}</span>`;
            }
            try { audio.playUIClick(); } catch (e) {}
        };
        setTimeout(() => lockReel(0), 600);
        setTimeout(() => lockReel(1), 1100);
        setTimeout(() => {
            lockReel(2);
            clearInterval(flicker);
            this.resolveSlots(bet);
        }, 1800);
    },

    resolveSlots(bet) {
        const [a, b, c] = this.slotsReels;
        let winnings = 0;
        this.slotsWon = false;
        if (a === b && b === c) {
            const symbol = this.slotSymbols[a];
            winnings = bet * symbol.payout;
            this.slotsBest = -2; // all win
            this.slotsWon = true;
            this.slotsResult = `JACKPOT! 3x ${symbol.name} — +${winnings}T!`;
            this.slotsResultColor = 'text-amber-300';
            if (symbol.id === 'jackpot' && typeof Achievements !== 'undefined') Achievements.onJackpot(this.state);
        } else {
            // Pairs pay NOTHING — only 3 of a kind wins. The near-miss message
            // is honest about it instead of flashing a fake win highlight.
            const pair = (a === b || b === c || a === c);
            this.slotsBest = -1;
            this.slotsResult = pair ? `Pair — so close! Only 3 of a kind pays (lost ${bet}T)` : `No match — lost ${bet}T`;
            this.slotsResultColor = 'text-rose-400';
        }
        if (winnings > 0) {
            this.tokens += winnings + bet;
            try { audio.playCoin(); } catch (e) {}
            if (typeof Achievements !== 'undefined') Achievements.onCasinoWin(this.state, winnings);
        } else {
            try { audio.playError(); } catch (e) {}
            if (typeof Achievements !== 'undefined') Achievements.onCasinoLoss(this.state, bet);
        }
        this.slotsSpinning = false;
        this.updateTokenDisplay();
        if (this.currentTab === 'slots') this.renderTab();
        this.saveTokens();
    },

    placeFishBet() {
        if (!this.fishBetSelected || this.betAmount > this.tokens) return;
        const fish = (this.state.player.caughtFish || []).find(f => f.id === this.fishBetSelected);
        if (!fish) return;
        const odds = (this.FISHBET_ODDS && this.FISHBET_ODDS[fish.rarity]) || { mult: 1, ch: 5 };
        const rarityMult = odds.mult;
        const winChance = odds.ch;
        const bet = this.betAmount;
        this.tokens -= bet;
        const won = Math.random() * 100 < winChance;
        if (won) {
            const winnings = Math.round(bet * rarityMult);
            this.tokens += winnings + bet;
            this.fishBetResult = `WIN +${winnings}T on ${fish.name}!`;
            this.fishBetResultColor = 'text-emerald-400';
            try { audio.playCoin(); } catch (e) {}
            if (typeof Achievements !== 'undefined') Achievements.onCasinoWin(this.state, winnings);
        } else {
            this.fishBetResult = `Lost ${bet}T on ${fish.name} (${winChance}% chance)`;
            this.fishBetResultColor = 'text-rose-400';
            try { audio.playError(); } catch (e) {}
            if (typeof Achievements !== 'undefined') Achievements.onCasinoLoss(this.state, bet);
        }
        this.fishBetSelected = null;
        this.updateTokenDisplay(); this.renderTab(); this.saveTokens();
    },

    highlowStreak: 0,
    highlowMultiplier: 1,

    newHighlowCard() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.highlowCard = { suit: suits[Math.floor(Math.random() * 4)], value: values[Math.floor(Math.random() * 13)] };
        this.highlowNextCard = null;
        this.highlowStreak = 0; this.highlowMultiplier = 1; this.highlowPot = 0;
        this.highlowResult = ''; this.highlowResultColor = 'text-slate-400';
        this.renderTab();
    },

    highlowGuess(higher) {
        const entryBet = this.highlowPot > 0 ? 0 : this.betAmount;
        if (entryBet > this.tokens) return;
        if (entryBet > 0) { this.tokens -= entryBet; this.highlowPot = entryBet; }
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.highlowNextCard = { suit: suits[Math.floor(Math.random() * 4)], value: values[Math.floor(Math.random() * 13)] };
        const valueOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        const currentVal = valueOrder[this.highlowCard.value];
        const nextVal = valueOrder[this.highlowNextCard.value];
        const won = (higher && nextVal > currentVal) || (!higher && nextVal < currentVal);
        const isEqual = nextVal === currentVal;
        if (won) {
            this.highlowPot = Math.round(this.highlowPot * 1.4); // house shaved the streak growth
            this.highlowStreak++;
            this.highlowResult = `CORRECT! ${this.highlowCard.value} → ${this.highlowNextCard.value}. Pot: ${this.highlowPot}T — guess again or cash out!`;
            this.highlowResultColor = 'text-emerald-400';
            this.highlowCard = this.highlowNextCard; this.highlowNextCard = null;
            try { audio.playCoin(); } catch (e) {}
        } else if (isEqual) {
            this.highlowResult = `PUSH — both ${this.highlowNextCard.value}. Pot kept (${this.highlowPot}T).`;
            this.highlowResultColor = 'text-amber-300';
            this.highlowCard = this.highlowNextCard; this.highlowNextCard = null;
        } else {
            const lost = this.highlowPot;
            this.highlowResult = `WRONG! ${this.highlowCard.value} → ${this.highlowNextCard.value}. Lost pot ${lost}T.`;
            this.highlowResultColor = 'text-rose-400';
            this.highlowPot = 0; this.highlowStreak = 0;
            this.highlowCard = this.highlowNextCard; this.highlowNextCard = null;
            try { audio.playError(); } catch (e) {}
            if (typeof Achievements !== 'undefined') Achievements.onCasinoLoss(this.state, lost);
        }
        this.updateTokenDisplay(); this.renderTab(); this.saveTokens();
    },

    highlowCashout() {
        if (!this.highlowPot) return;
        // 10% house cut, rounded down so a 1T pot still cashes out whole —
        // previously ceil() ate the entire pot and flashed a "+0T win".
        const fee = Math.floor(this.highlowPot * 0.1);
        const payout = this.highlowPot - fee;
        this.tokens += payout;
        this.highlowResult = `Cashed out +${payout}T after ${this.highlowStreak} streak! (house took ${fee}T)`;
        this.highlowResultColor = 'text-amber-300';
        if (typeof Achievements !== 'undefined') Achievements.onCasinoWin(this.state, payout);
        this.highlowPot = 0; this.highlowStreak = 0;
        try { audio.playCoin(); } catch (e) {}
        this.updateTokenDisplay(); this.renderTab(); this.saveTokens();
    },

    buyTokens(amount = 1) {
        amount = Math.max(1, Math.floor(amount));
        const cost = amount * this.TOKEN_PRICE;
        if (this.state.player.coins >= cost) {
            this.state.player.coins -= cost;
            this.tokens += amount;
            if (this.betAmount > this.tokens) this.betAmount = this.tokens;
            this.updateTokenDisplay();
            this.saveTokens();
            Player.refreshHUD(this.state);
            const sc = document.getElementById('shop-coins-display'); if (sc) sc.innerText = this.state.player.coins;
            try { audio.playCoin(); } catch (e) {}
            this.renderTab();
        } else {
            this.rouletteMsg = `Need ${cost} coins for ${amount}T`;
            if (typeof Particles !== 'undefined') Particles.showFloatingText(this.state, `NEED ${cost} COINS`, this.state.player.x, this.state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
        }
    },

    cashout() {
        if (this.tokens <= 0) { try { audio.playError(); } catch (e) {} return; }
        const coins = Math.floor(this.tokens * this.CASHOUT_RATE);
        this.state.player.coins += coins;
        if (typeof Particles !== 'undefined') Particles.showFloatingText(this.state, `CASHED OUT +${coins}c!`, this.state.player.x, this.state.player.y - 50, '#facc15');
        this.tokens = 0; this.betAmount = 1;
        this.highlowPot = 0;
        this.updateTokenDisplay(); this.saveTokens();
        Player.refreshHUD(this.state);
        try { audio.playCoin(); } catch (e) {}
        this.renderTab();
    },

    saveTokens() {
        this.state.player.casinoTokens = this.tokens;
        if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit('casino');
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(this.state);
    },

    addTokens(amount) {
        this.tokens += amount;
        this.updateTokenDisplay();
        this.saveTokens();
    }
};

window.Casino = Casino;
