const Casino = {
    state: null,
    currentTab: 'roulette',
    tokens: 0,
    betAmount: 1,
    rouletteNumber: null,
    rouletteSpinning: false,
    slotsReels: [0, 0, 0],
    slotsSpinning: false,
    fishBetSelected: null,
    highlowCard: null,
    highlowNextCard: null,
    
    // Symbols for slots
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
        this.bindEvents();
        this.updateTokenDisplay();
    },
    
    bindEvents() {
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
        
        // Open casino from beach shop or menu
        on('btn-open-casino', () => this.open());
        
        // Close
        document.querySelectorAll('.casino-close').forEach(b => {
            b.onclick = () => this.close();
        });
        
        // Tabs
        document.querySelectorAll('.casino-tab-btn').forEach(btn => {
            btn.onclick = () => {
                try { audio.playUIClick(); } catch (e) {}
                document.querySelectorAll('.casino-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.id.replace('casino-tab-', '');
                this.renderTab();
            };
        });
        
        // Buy tokens
        on('casino-buy-tokens', () => this.buyTokens(1));
    },
    
    open() {
        const modal = document.getElementById('casino-modal');
        const mpHud = document.getElementById('mp-hud');
        if (modal) {
            modal.classList.remove('hidden');
            if (mpHud) mpHud.classList.add('hidden');
            this.renderTab();
        }
    },
    
    close() {
        const modal = document.getElementById('casino-modal');
        const mpHud = document.getElementById('mp-hud');
        if (modal) {
            modal.classList.add('hidden');
            if (mpHud && this.state.multiplayer && this.state.multiplayer.isConnected) {
                mpHud.classList.remove('hidden');
            }
        }
    },
    
    updateTokenDisplay() {
        const displays = ['casino-coins-display', 'casino-tokens-display', 'casino-tokens-footer'];
        displays.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id.includes('coins')) el.innerText = this.state.player.coins;
                else el.innerText = this.tokens;
            }
        });
        
        // Update bet display
        const betEl = document.getElementById('casino-bet-display');
        if (betEl) betEl.innerText = this.betAmount;
    },
    
    adjustBet(delta) {
        this.betAmount = Math.max(1, Math.min(this.tokens, this.betAmount + delta));
        this.updateTokenDisplay();
    },
    
    setMaxBet() {
        this.betAmount = this.tokens;
        this.updateTokenDisplay();
    },
    
    renderTab() {
        const content = document.getElementById('casino-content');
        if (!content) return;
        
        switch (this.currentTab) {
            case 'roulette': this.renderRoulette(content); break;
            case 'slots': this.renderSlots(content); break;
            case 'fishbet': this.renderFishBet(content); break;
            case 'highlow': this.renderHighlow(content); break;
        }
        // Re-bind dynamic event listeners after render
        this.bindDynamicEvents();
    },
    
    bindDynamicEvents() {
        // Number bets for roulette
        document.querySelectorAll('.roulette-number-btn').forEach(btn => {
            btn.onclick = () => this.placeNumberBet(parseInt(btn.dataset.number));
        });
        
        // Color bets for roulette
        document.querySelectorAll('.roulette-color-btn').forEach(btn => {
            if (btn.dataset.color) btn.onclick = () => this.placeColorBet(btn.dataset.color);
            if (btn.dataset.parity) btn.onclick = () => this.placeParityBet(btn.dataset.parity);
            if (btn.dataset.range) btn.onclick = () => this.placeRangeBet(btn.dataset.range);
        });
        
        // Fish bet buttons
        document.querySelectorAll('.fish-bet-btn').forEach(btn => {
            btn.onclick = () => {
                this.fishBetSelected = btn.dataset.fishId;
                this.renderTab();
            };
        });
        
        // Bet controls
        const betMinus = document.getElementById('casino-bet-minus');
        const betPlus = document.getElementById('casino-bet-plus');
        const betMax = document.getElementById('casino-bet-max');
        if (betMinus) betMinus.onclick = () => this.adjustBet(-1);
        if (betPlus) betPlus.onclick = () => this.adjustBet(1);
        if (betMax) betMax.onclick = () => this.setMaxBet();
        
        // Game specific buttons
        const rouletteSpin = document.getElementById('casino-roulette-spin');
        const slotsSpin = document.getElementById('casino-slots-spin');
        const fishBetBtn = document.getElementById('casino-fishbet-bet');
        const highlowHigher = document.getElementById('casino-highlow-higher');
        const highlowLower = document.getElementById('casino-highlow-lower');
        const highlowNew = document.getElementById('casino-highlow-new');
        
        if (rouletteSpin) rouletteSpin.onclick = () => this.spinRoulette();
        if (slotsSpin) slotsSpin.onclick = () => this.spinSlots();
        if (fishBetBtn) fishBetBtn.onclick = () => this.placeFishBet();
        if (highlowHigher) highlowHigher.onclick = () => this.highlowGuess(true);
        if (highlowLower) highlowLower.onclick = () => this.highlowGuess(false);
        if (highlowNew) highlowNew.onclick = () => this.newHighlowCard();
    },
    
    renderRoulette(content) {
        const numbers = [...Array(37).keys()]; // 0-36
        const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        
        content.innerHTML = `
            <div class="space-y-4">
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-3">European Roulette (Single Zero)</h3>
                    <div class="grid grid-cols-12 gap-1 mb-4" style="max-width: 480px; margin: 0 auto;">
                        ${numbers.map(n => `
                            <button class="roulette-number-btn px-1 py-1.5 text-xs font-bold rounded ${
                                n === 0 ? 'bg-green-900 text-green-300' :
                                redNumbers.includes(n) ? 'bg-red-900 text-red-300' : 'bg-slate-900 text-white'
                            } ${this.rouletteBetNumbers?.includes(n) ? 'ring-2 ring-amber-400' : ''}"
                                data-number="${n}" ${this.rouletteSpinning ? 'disabled' : ''}>
                                ${n}
                            </button>
                        `).join('')}
                    </div>
                    <div class="flex gap-2 justify-center mb-4">
                        <button class="roulette-color-btn px-4 py-2 bg-red-900 text-red-300 font-bold rounded-xl ${this.rouletteBetColor === 'red' ? 'ring-2 ring-amber-400' : ''}" data-color="red" ${this.rouletteSpinning ? 'disabled' : ''}>
                            RED (1:1)
                        </button>
                        <button class="roulette-color-btn px-4 py-2 bg-slate-900 text-white font-bold rounded-xl ${this.rouletteBetColor === 'black' ? 'ring-2 ring-amber-400' : ''}" data-color="black" ${this.rouletteSpinning ? 'disabled' : ''}>
                            BLACK (1:1)
                        </button>
                        <button class="roulette-color-btn px-4 py-2 bg-green-900 text-green-300 font-bold rounded-xl ${this.rouletteBetColor === 'green' ? 'ring-2 ring-amber-400' : ''}" data-color="green" ${this.rouletteSpinning ? 'disabled' : ''}>
                            GREEN (35:1)
                        </button>
                    </div>
                    <div class="flex gap-2 justify-center mb-4">
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetParity === 'even' ? 'ring-2 ring-amber-400' : ''}" data-parity="even" ${this.rouletteSpinning ? 'disabled' : ''}>
                            EVEN (1:1)
                        </button>
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetParity === 'odd' ? 'ring-2 ring-amber-400' : ''}" data-parity="odd" ${this.rouletteSpinning ? 'disabled' : ''}>
                            ODD (1:1)
                        </button>
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetRange === 'low' ? 'ring-2 ring-amber-400' : ''}" data-range="low" ${this.rouletteSpinning ? 'disabled' : ''}>
                            1-18 (1:1)
                        </button>
                        <button class="roulette-color-btn px-4 py-2 bg-amber-900 text-amber-300 font-bold rounded-xl ${this.rouletteBetRange === 'high' ? 'ring-2 ring-amber-400' : ''}" data-range="high" ${this.rouletteSpinning ? 'disabled' : ''}>
                            19-36 (1:1)
                        </button>
                    </div>
                </div>
                
                <div class="glass-panel p-4 rounded-xl text-center">
                    <div class="text-6xl font-black mb-4 ${this.rouletteSpinning ? 'animate-pulse' : ''}" style="font-family: 'Courier New', monospace;">
                        ${this.rouletteNumber !== null ? 
                            `<span class="${this.rouletteNumber === 0 ? 'text-green-400' : (redNumbers.includes(this.rouletteNumber) ? 'text-red-400' : 'text-white')}">${this.rouletteNumber}</span>` : 
                            '?'
                        }
                    </div>
                    <button id="casino-roulette-spin" class="px-8 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all ${this.rouletteSpinning ? 'opacity-50 cursor-not-allowed' : ''}" ${this.rouletteSpinning ? 'disabled' : ''}>
                        <i class="fa-solid fa-circle-notch fa-spin mr-2"></i> SPIN (${this.betAmount}T)
                    </button>
                    <p class="text-xs text-slate-400 mt-2">Bet: ${this.getTotalRouletteBet()}T | Tokens: ${this.tokens}T</p>
                </div>
            </div>
        `;
        
        // Re-bind events for dynamically created buttons
        document.querySelectorAll('.roulette-number-btn').forEach(btn => {
            btn.onclick = () => this.placeNumberBet(parseInt(btn.dataset.number));
        });
        document.querySelectorAll('.roulette-color-btn').forEach(btn => {
            if (btn.dataset.color) btn.onclick = () => this.placeColorBet(btn.dataset.color);
            if (btn.dataset.parity) btn.onclick = () => this.placeParityBet(btn.dataset.parity);
            if (btn.dataset.range) btn.onclick = () => this.placeRangeBet(btn.dataset.range);
        });
    },
    
    renderSlots(content) {
        content.innerHTML = `
            <div class="space-y-4">
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-3 text-center">Deep Sea Slots</h3>
                    <div class="flex justify-center gap-2 mb-4">
                        ${this.slotSymbols.map((s, i) => `
                            <div class="slot-reel w-20 h-20 rounded-xl flex items-center justify-center font-bold text-2xl ${this.slotsSpinning ? 'animate-pulse' : ''}"
                                style="background: linear-gradient(135deg, ${s.color}22, ${s.color}44); border: 2px solid ${s.color}44;"
                                id="slot-reel-${i}">
                                <i class="fa-solid fa-fish" style="color: ${s.color}"></i>
                            </div>
                        `).join('')}
                    </div>
                    <div class="text-center text-sm text-slate-400 mb-4">
                        Match 3 for payout | Jackpot: 500x
                    </div>
                </div>
                
                <div class="glass-panel p-4 rounded-xl text-center">
                    <button id="casino-slots-spin" class="px-8 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all ${this.slotsSpinning ? 'opacity-50 cursor-not-allowed' : ''}" ${this.slotsSpinning ? 'disabled' : ''}>
                        <i class="fa-solid fa-circle-notch fa-spin mr-2"></i> SPIN (${this.betAmount}T)
                    </button>
                    <p class="text-xs text-slate-400 mt-2">Bet: ${this.betAmount}T | Tokens: ${this.tokens}T</p>
                </div>
                
                <div class="glass-panel-light p-3 rounded-xl text-xs text-slate-400 overflow-x-auto">
                    <table class="w-full">
                        <thead><tr><th class="text-left">Symbol</th><th class="text-right">Payout</th><th class="text-left">Chance</th></tr></thead>
                        <tbody>
                            ${this.slotSymbols.map(s => `
                                <tr class="border-t border-slate-800">
                                    <td><i class="fa-solid fa-fish mr-1" style="color: ${s.color}"></i> ${s.name}</td>
                                    <td class="text-right font-bold text-amber-300">${s.payout}x</td>
                                    <td class="text-slate-500">${(s.weight/99*100).toFixed(1)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },
    
    renderFishBet(content) {
        const caughtFish = this.state.player.caughtFish || [];
        const uniqueFish = [...new Map(caughtFish.map(f => [f.id, f])).values()];
        
        content.innerHTML = `
            <div class="space-y-4">
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-3">Fish Betting</h3>
                    <p class="text-slate-400 text-sm mb-4">Select a caught fish to bet on. Higher rarity = higher multiplier but lower win chance.</p>
                    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                        ${uniqueFish.length === 0 ? `
                            <div class="col-span-full text-center py-8 text-slate-500">
                                <i class="fa-solid fa-fish text-4xl mb-2"></i>
                                <p>No fish caught yet. Go fishing first!</p>
                            </div>
                        ` : uniqueFish.map(fish => {
                            const rarityMult = { common: 1.5, rare: 2.5, epic: 4, legendary: 8, mythic: 20 }[fish.rarity] || 1;
                            const winChance = Math.max(5, 50 - (rarityMult * 3));
                            return `
                                <button class="fish-bet-btn glass-panel p-3 rounded-xl text-center ${this.fishBetSelected === fish.id ? 'ring-2 ring-fuchsia-400 bg-fuchsia-500/10' : ''}" 
                                    data-fish-id="${fish.id}" ${this.tokens < this.betAmount ? 'disabled' : ''}>
                                    <div class="w-12 h-12 mx-auto mb-1 rounded-lg flex items-center justify-center" style="background: ${fish.color}22; border: 1px solid ${fish.color}44;">
                                        <i class="fa-solid fa-fish text-xl" style="color: ${fish.color}"></i>
                                    </div>
                                    <div class="font-bold text-xs text-white">${fish.name}</div>
                                    <div class="text-[9px] text-${this.getRarityColor(fish.rarity)}-300">${fish.rarity.toUpperCase()}</div>
                                    <div class="text-[9px] text-amber-300 mt-1">${rarityMult}x payout</div>
                                    <div class="text-[8px] text-slate-500">${winChance}% win</div>
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="glass-panel p-4 rounded-xl text-center">
                    <button id="casino-fishbet-bet" class="px-8 py-3 bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:from-fuchsia-400 hover:to-pink-500 text-slate-950 font-black rounded-xl transition-all ${!this.fishBetSelected || this.tokens < this.betAmount ? 'opacity-50 cursor-not-allowed' : ''}" ${!this.fishBetSelected || this.tokens < this.betAmount ? 'disabled' : ''}>
                        <i class="fa-solid fa-dice mr-2"></i> BET ${this.betAmount}T ON ${this.fishBetSelected ? uniqueFish.find(f => f.id === this.fishBetSelected)?.name : 'SELECT FISH'}
                    </button>
                    <p class="text-xs text-slate-400 mt-2">Tokens: ${this.tokens}T</p>
                </div>
            </div>
        `;
        
        document.querySelectorAll('.fish-bet-btn').forEach(btn => {
            btn.onclick = () => {
                this.fishBetSelected = btn.dataset.fishId;
                this.renderTab();
            };
        });
    },
    
    renderHighlow(content) {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        
        if (!this.highlowCard) {
            this.highlowCard = { suit: suits[Math.floor(Math.random() * 4)], value: values[Math.floor(Math.random() * 13)] };
        }
        
        content.innerHTML = `
            <div class="space-y-4">
                <div class="glass-panel-light p-4 rounded-xl">
                    <h3 class="font-bold text-fuchsia-300 mb-3 text-center">High-Low</h3>
                    <p class="text-slate-400 text-sm text-center mb-4">Guess if next card is higher or lower. Aces high.</p>
                    
                    <div class="flex justify-center gap-4 mb-4">
                        <div class="card-display w-24 h-32 rounded-xl flex flex-col items-center justify-center font-bold text-3xl ${['♥', '♦'].includes(this.highlowCard.suit) ? 'text-red-400' : 'text-white'} bg-slate-900 border-2 border-slate-700 shadow-lg">
                            <span>${this.highlowCard.value}</span>
                            <span class="text-4xl">${this.highlowCard.suit}</span>
                        </div>
                        <span class="text-4xl text-amber-400 self-center">→</span>
                        <div class="card-display w-24 h-32 rounded-xl flex flex-col items-center justify-center font-bold text-3xl bg-slate-800 border-2 border-slate-600">
                            <span class="text-slate-500">?</span>
                        </div>
                    </div>
                    
                    <div class="text-center text-sm">
                        <span class="font-bold text-amber-300">Streak: ${this.highlowStreak || 0}</span> | 
                        <span class="font-bold text-fuchsia-300">Multiplier: ${(this.highlowMultiplier || 1).toFixed(1)}x</span>
                    </div>
                </div>
                
                <div class="glass-panel p-4 rounded-xl text-center">
                    <div class="flex gap-4 justify-center mb-4">
                        <button id="casino-highlow-higher" class="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black rounded-xl transition-all ${this.betAmount > this.tokens ? 'opacity-50 cursor-not-allowed' : ''}" ${this.betAmount > this.tokens ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-up mr-2"></i> HIGHER
                        </button>
                        <button id="casino-highlow-lower" class="flex-1 px-6 py-3 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-black rounded-xl transition-all ${this.betAmount > this.tokens ? 'opacity-50 cursor-not-allowed' : ''}" ${this.betAmount > this.tokens ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-down mr-2"></i> LOWER
                        </button>
                    </div>
                    <button id="casino-highlow-new" class="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-bold rounded-xl transition-all">
                        <i class="fa-solid fa-redo mr-1"></i> New Card (Reset Streak)
                    </button>
                    <p class="text-xs text-slate-400 mt-2">Bet: ${this.betAmount}T | Tokens: ${this.tokens}T</p>
                </div>
            </div>
        `;
    },
    
    getRarityColor(rarity) {
        const colors = { common: 'slate', rare: 'sky', epic: 'fuchsia', legendary: 'amber', mythic: 'yellow' };
        return colors[rarity] || 'slate';
    },
    
    // Roulette logic
    rouletteBetNumbers: [],
    rouletteBetColor: null,
    rouletteBetParity: null,
    rouletteBetRange: null,
    
    placeNumberBet(number) {
        if (this.betAmount > this.tokens) return;
        if (!this.rouletteBetNumbers) this.rouletteBetNumbers = [];
        if (this.rouletteBetNumbers.includes(number)) {
            this.rouletteBetNumbers = this.rouletteBetNumbers.filter(n => n !== number);
        } else {
            this.rouletteBetNumbers.push(number);
        }
        this.renderTab();
    },
    
    placeColorBet(color) {
        if (this.betAmount > this.tokens) return;
        this.rouletteBetColor = this.rouletteBetColor === color ? null : color;
        this.renderTab();
    },
    
    placeParityBet(parity) {
        if (this.betAmount > this.tokens) return;
        this.rouletteBetParity = this.rouletteBetParity === parity ? null : parity;
        this.renderTab();
    },
    
    placeRangeBet(range) {
        if (this.betAmount > this.tokens) return;
        this.rouletteBetRange = this.rouletteBetRange === range ? null : range;
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
        if (totalBet === 0 || totalBet > this.tokens) return;
        
        this.tokens -= totalBet;
        this.rouletteSpinning = true;
        this.renderTab();
        
        setTimeout(() => {
            this.rouletteNumber = Math.floor(Math.random() * 37);
            const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
            
            let winnings = 0;
            
            // Number bets (35:1)
            if (this.rouletteBetNumbers?.includes(this.rouletteNumber)) {
                winnings += this.betAmount * 35;
            }
            
            // Color bets
            if (this.rouletteBetColor) {
                const isRed = redNumbers.includes(this.rouletteNumber);
                const isBlack = this.rouletteNumber !== 0 && !isRed;
                const isGreen = this.rouletteNumber === 0;
                
                if ((this.rouletteBetColor === 'red' && isRed) ||
                    (this.rouletteBetColor === 'black' && isBlack) ||
                    (this.rouletteBetColor === 'green' && isGreen)) {
                    winnings += this.betAmount * (isGreen ? 35 : 1);
                }
            }
            
            // Parity bets
            if (this.rouletteBetParity) {
                if (this.rouletteNumber !== 0) {
                    const isEven = this.rouletteNumber % 2 === 0;
                    if ((this.rouletteBetParity === 'even' && isEven) ||
                        (this.rouletteBetParity === 'odd' && !isEven)) {
                        winnings += this.betAmount;
                    }
                }
            }
            
            // Range bets
            if (this.rouletteBetRange) {
                if (this.rouletteNumber !== 0) {
                    const isLow = this.rouletteNumber <= 18;
                    if ((this.rouletteBetRange === 'low' && isLow) ||
                        (this.rouletteBetRange === 'high' && !isLow)) {
                        winnings += this.betAmount;
                    }
                }
            }
            
            if (winnings > 0) {
                this.tokens += winnings + totalBet; // Return bet + winnings
                Particles.showFloatingText(this.state, `WIN ${winnings}T!`, this.state.player.x, this.state.player.y - 50, '#34d399');
                try { audio.playCoin(); } catch (e) {}
            } else {
                Particles.showFloatingText(this.state, `LOST ${totalBet}T`, this.state.player.x, this.state.player.y - 50, '#f87171');
                try { audio.playError(); } catch (e) {}
            }
            
            this.updateTokenDisplay();
            this.rouletteSpinning = false;
            this.rouletteBetNumbers = [];
            this.rouletteBetColor = null;
            this.rouletteBetParity = null;
            this.rouletteBetRange = null;
            this.renderTab();
            
            this.saveTokens();
        }, 2000);
    },
    
    spinSlots() {
        if (this.betAmount > this.tokens) return;
        
        this.tokens -= this.betAmount;
        this.slotsSpinning = true;
        this.renderTab();
        
        setTimeout(() => {
            this.slotsReels = this.slotSymbols.map(() => Math.floor(Math.random() * this.slotSymbols.length));
            this.renderTab();
            
            setTimeout(() => {
                const [a, b, c] = this.slotsReels;
                let winnings = 0;
                
                if (a === b && b === c) {
                    // Three of a kind
                    const symbol = this.slotSymbols[a];
                    winnings = this.betAmount * symbol.payout;
                } else if (a === b || b === c || a === c) {
                    // Two of a kind - small payout
                    winnings = this.betAmount * 1;
                }
                
                if (winnings > 0) {
                    this.tokens += winnings + this.betAmount;
                    Particles.showFloatingText(this.state, `WIN ${winnings}T!`, this.state.player.x, this.state.player.y - 50, '#34d399');
                    try { audio.playCoin(); } catch (e) {}
                } else {
                    Particles.showFloatingText(this.state, `LOST ${this.betAmount}T`, this.state.player.x, this.state.player.y - 50, '#f87171');
                    try { audio.playError(); } catch (e) {}
                }
                
                this.updateTokenDisplay();
                this.slotsSpinning = false;
                this.renderTab();
                this.saveTokens();
            }, 1500);
        }, 500);
    },
    
    placeFishBet() {
        if (!this.fishBetSelected || this.betAmount > this.tokens) return;
        
        const fish = (this.state.player.caughtFish || []).find(f => f.id === this.fishBetSelected);
        if (!fish) return;
        
        const rarityMult = { common: 1.5, rare: 2.5, epic: 4, legendary: 8, mythic: 20 }[fish.rarity] || 1;
        const winChance = Math.max(5, 50 - (rarityMult * 3));
        
        this.tokens -= this.betAmount;
        
        const won = Math.random() * 100 < winChance;
        
        if (won) {
            const winnings = Math.round(this.betAmount * rarityMult);
            this.tokens += winnings + this.betAmount;
            Particles.showFloatingText(this.state, `WIN ${winnings}T on ${fish.name}!`, this.state.player.x, this.state.player.y - 50, '#34d399');
            try { audio.playCoin(); } catch (e) {}
        } else {
            Particles.showFloatingText(this.state, `LOST ${this.betAmount}T on ${fish.name}`, this.state.player.x, this.state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
        }
        
        this.updateTokenDisplay();
        this.fishBetSelected = null;
        this.renderTab();
        this.saveTokens();
    },
    
    highlowStreak: 0,
    highlowMultiplier: 1,
    
    newHighlowCard() {
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.highlowCard = { suit: suits[Math.floor(Math.random() * 4)], value: values[Math.floor(Math.random() * 13)] };
        this.highlowStreak = 0;
        this.highlowMultiplier = 1;
        this.renderTab();
    },
    
    highlowGuess(higher) {
        if (this.betAmount > this.tokens) return;
        
        const suits = ['♠', '♥', '♦', '♣'];
        const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        this.highlowNextCard = { suit: suits[Math.floor(Math.random() * 4)], value: values[Math.floor(Math.random() * 13)] };
        
        const valueOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        const currentVal = valueOrder[this.highlowCard.value];
        const nextVal = valueOrder[this.highlowNextCard.value];
        
        const isHigher = nextVal > currentVal;
        const isLower = nextVal < currentVal;
        const isEqual = nextVal === currentVal;
        
        const won = (higher && isHigher) || (!higher && isLower);
        
        if (won) {
            this.tokens += this.betAmount * 2; // 1:1 payout
            this.highlowStreak++;
            this.highlowMultiplier = 1 + (this.highlowStreak * 0.1);
            Particles.showFloatingText(this.state, `CORRECT! +${this.betAmount}T (Streak: ${this.highlowStreak})`, this.state.player.x, this.state.player.y - 50, '#34d399');
            try { audio.playCoin(); } catch (e) {}
        } else if (isEqual) {
            // Push - return bet
            this.tokens += this.betAmount;
            Particles.showFloatingText(this.state, `PUSH - Card was ${this.highlowNextCard.value}`, this.state.player.x, this.state.player.y - 50, '#fbbf24');
        } else {
            this.highlowStreak = 0;
            this.highlowMultiplier = 1;
            Particles.showFloatingText(this.state, `WRONG! Lost ${this.betAmount}T`, this.state.player.x, this.state.player.y - 50, '#f87171');
            try { audio.playError(); } catch (e) {}
        }
        
        this.highlowCard = this.highlowNextCard;
        this.updateTokenDisplay();
        this.renderTab();
        this.saveTokens();
    },
    
    buyTokens(amount = 1) {
        const cost = amount * 100;
        if (this.state.player.coins >= cost) {
            this.state.player.coins -= cost;
            this.tokens += amount;
            this.updateTokenDisplay();
            this.saveTokens();
            Player.refreshHUD(this.state);
            Particles.showFloatingText(this.state, `BOUGHT ${amount} TOKENS`, this.state.player.x, this.state.player.y - 50, '#facc15');
        } else {
            Particles.showFloatingText(this.state, `NEED ${cost} COINS`, this.state.player.x, this.state.player.y - 50, '#f87171');
        }
    },
    
    saveTokens() {
        this.state.player.casinoTokens = this.tokens;
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(this.state);
    },
    
    addTokens(amount) {
        this.tokens += amount;
        this.updateTokenDisplay();
        this.saveTokens();
    }
};

window.Casino = Casino;