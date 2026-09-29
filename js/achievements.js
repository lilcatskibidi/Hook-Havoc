const Achievements = {
    state: null,
    unlocked: new Set(),
    progress: {},
    
    init(state) {
        this.state = state;
        this.loadProgress();
        this.checkAll(state);
    },
    
    loadProgress() {
        if (!this.state.player.achievements) {
            this.state.player.achievements = { unlocked: [], progress: {} };
        }
        this.unlocked = new Set(this.state.player.achievements.unlocked || []);
        this.progress = this.state.player.achievements.progress || {};
    },
    
    saveProgress() {
        this.state.player.achievements = {
            unlocked: [...this.unlocked],
            progress: this.progress
        };
        if (typeof SaveSystem !== 'undefined') SaveSystem.save(this.state);
    },
    
    unlock(id) {
        if (this.unlocked.has(id)) return false;
        
        const ach = CONFIG.ACHIEVEMENTS[id];
        if (!ach) return false;
        
        this.unlocked.add(id);
        this.saveProgress();
        
        // Give rewards
        if (ach.reward) {
            if (ach.reward.coins) {
                this.state.player.coins += ach.reward.coins;
            }
            if (ach.reward.xp) {
                Player.addXP(this.state, ach.reward.xp);
            }
        }
        
        // Show notification
        this.showUnlockNotification(ach);
        
        // Update HUD
        Player.refreshHUD(this.state);
        
        return true;
    },
    
    addProgress(id, amount = 1) {
        if (this.unlocked.has(id)) return;
        
        const ach = CONFIG.ACHIEVEMENTS[id];
        if (!ach) return;
        
        this.progress[id] = (this.progress[id] || 0) + amount;
        
        // Check if completed
        const target = this.getTarget(id);
        if (this.progress[id] >= target) {
            this.unlock(id);
        }
        
        this.saveProgress();
    },
    
    getTarget(id) {
        // Extract target from achievement id
        const targets = {
            'catch_10': 10,
            'catch_100': 100,
            'catch_1000': 1000,
            'kill_10': 10,
            'kill_100': 100,
            'kill_5_bosses': 5,
            'level_10': 10,
            'level_25': 25,
            'level_50': 50,
            'level_100': 100,
            'fish_index_25': 25,
            'fish_index_50': 50,
            'fish_index_100': 100,
            'fish_index_all': FISH_SPECIES.filter(f => !f.isBoss).length,
        };
        return targets[id] || 1;
    },
    
    checkAll(state) {
        const p = state.player;
        
        // Fishing
        const totalCaught = p.totalFishCaught || 0;
        this.setProgress('catch_10', totalCaught);
        this.setProgress('catch_100', totalCaught);
        this.setProgress('catch_1000', totalCaught);
        
        // Level
        this.setProgress('level_10', p.level);
        this.setProgress('level_25', p.level);
        this.setProgress('level_50', p.level);
        this.setProgress('level_100', p.level);
        
        // Fish index
        const caughtCount = (p.caughtFish || []).length;
        this.setProgress('fish_index_25', caughtCount);
        this.setProgress('fish_index_50', caughtCount);
        this.setProgress('fish_index_100', caughtCount);
        this.setProgress('fish_index_all', caughtCount);
        
        // Rods
        const allRods = RODS.map(r => r.id);
        const hasAllRods = allRods.every(id => p.unlockedRods?.includes(id));
        if (hasAllRods) this.unlock('max_rods');
        
        // Weapons
        const allWeapons = WEAPONS.map(w => w.id);
        const hasAllWeapons = allWeapons.every(id => p.ownedWeapons?.includes(id));
        if (hasAllWeapons) this.unlock('max_weapons');
    },
    
    setProgress(id, value) {
        const target = this.getTarget(id);
        this.progress[id] = Math.min(value, target);
        if (this.progress[id] >= target && !this.unlocked.has(id)) {
            this.unlock(id);
        }
    },
    
    checkEnemyKill(state, enemyType) {
        // General kill count
        const totalKills = (state.player.totalKills || 0) + 1;
        state.player.totalKills = totalKills;
        this.setProgress('kill_10', totalKills);
        this.setProgress('kill_100', totalKills);
        
        // Boss kills
        if (enemyType === 'boss') {
            const bossKills = (state.player.bossKills || 0) + 1;
            state.player.bossKills = bossKills;
            this.setProgress('kill_5_bosses', bossKills);
        }
        
        this.saveProgress();
    },
    
    checkFishCatch(state, fish) {
        // Total fish
        const totalCaught = (state.player.totalFishCaught || 0) + 1;
        state.player.totalFishCaught = totalCaught;
        
        // Rarity specific
        if (fish.rarity === 'rare' && !this.unlocked.has('catch_rare')) this.unlock('catch_rare');
        if (fish.rarity === 'epic' && !this.unlocked.has('catch_epic')) this.unlock('catch_epic');
        if (fish.rarity === 'legendary' && !this.unlocked.has('catch_legendary')) this.unlock('catch_legendary');
        if (fish.rarity === 'mythic' && !this.unlocked.has('catch_mythic')) this.unlock('catch_mythic');
        
        // First catch
        if (!this.unlocked.has('first_catch')) this.unlock('first_catch');
        
        this.saveProgress();
    },
    
    checkCasino(state, type, amount) {
        if (type === 'win' && amount >= 1000 && !this.unlocked.has('casino_win_1000')) {
            this.unlock('casino_win_1000');
        }
        if (type === 'jackpot' && !this.unlocked.has('casino_jackpot')) {
            this.unlock('casino_jackpot');
        }
        if (type === 'lose') {
            const totalLost = (state.player.casinoTotalLost || 0) + amount;
            state.player.casinoTotalLost = totalLost;
            if (totalLost >= 10000 && !this.unlocked.has('casino_bankrupt')) {
                this.unlock('casino_bankrupt');
            }
        }
    },
    
    checkSurvival(state, timeAlive) {
        if (timeAlive >= 3600 && !this.unlocked.has('no_death_1hr')) { // 1 hour
            this.unlock('no_death_1hr');
        }
    },
    
    showUnlockNotification(ach) {
        const p = this.state.player;
        
        // Big center notification
        Particles.showFloatingText(this.state, `🏆 ACHIEVEMENT UNLOCKED!`, p.x, p.y - 80, '#fde047');
        setTimeout(() => {
            Particles.showFloatingText(this.state, `${ach.name}`, p.x, p.y - 100, '#facc15');
        }, 500);
        setTimeout(() => {
            Particles.showFloatingText(this.state, ach.desc, p.x, p.y - 120, '#38bdf8');
        }, 1000);
        
        // Reward text
        if (ach.reward) {
            let rewardText = '';
            if (ach.reward.coins) rewardText += `+${ach.reward.coins} coins `;
            if (ach.reward.xp) rewardText += `+${ach.reward.xp} XP`;
            setTimeout(() => {
                Particles.showFloatingText(this.state, rewardText, p.x, p.y - 140, '#34d399');
            }, 1500);
        }
        
        // Screen effect
        this.state.screenShake = 12;
        try { audio.playLevelUp(); } catch (e) {}
    },
    
    // UI for achievements panel
    renderPanel(container) {
        const categories = {
            'Fishing': ['first_catch', 'catch_10', 'catch_100', 'catch_1000'],
            'Rarity': ['catch_rare', 'catch_epic', 'catch_legendary', 'catch_mythic'],
            'Combat': ['kill_10', 'kill_100', 'kill_boss', 'kill_5_bosses'],
            'Casino': ['casino_win_1000', 'casino_jackpot', 'casino_bankrupt'],
            'Progression': ['level_10', 'level_25', 'level_50', 'level_100'],
            'Collection': ['fish_index_25', 'fish_index_50', 'fish_index_100', 'fish_index_all'],
            'Hardcore': ['no_death_1hr', 'max_rods', 'max_weapons'],
        };
        
        let html = `
            <div class="space-y-4">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-fuchsia-300 text-lg">Achievements</h3>
                    <div class="glass-panel px-3 py-1 rounded-xl">
                        <span class="font-bold text-amber-300">${this.unlocked.size}</span> / 
                        <span class="text-slate-400">${Object.keys(CONFIG.ACHIEVEMENTS).length}</span>
                    </div>
                </div>
        `;
        
        for (const [cat, ids] of Object.entries(categories)) {
            html += `
                <div class="glass-panel-light p-3 rounded-xl">
                    <h4 class="font-bold text-fuchsia-300 mb-2">${cat}</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            `;
            
            for (const id of ids) {
                const configKey = id.toUpperCase();
                const ach = CONFIG.ACHIEVEMENTS[configKey];
                if (!ach) continue; // Skip missing achievements
                const unlocked = this.unlocked.has(id);
                const prog = this.progress[id] || 0;
                const target = this.getTarget(id);
                const pct = target > 0 ? Math.min(100, Math.round(prog / target * 100)) : 0;
                
                html += `
                    <div class="achievement-card glass-panel p-3 rounded-xl ${unlocked ? 'border-fuchsia-500/40' : 'opacity-60 grayscale'}" style="${!unlocked ? 'filter: grayscale(0.8);' : ''}">
                        <div class="w-12 h-12 mx-auto mb-2 rounded-xl flex items-center justify-center ${unlocked ? 'bg-gradient-to-br from-fuchsia-500/30 to-pink-600/20' : 'bg-slate-800'}" style="border: 1px solid ${unlocked ? '#d946ef' : '#374151'}">
                            <i class="fa-solid ${ach.icon} text-xl" style="color: ${unlocked ? '#f0abfc' : '#6b7280'}"></i>
                        </div>
                        <div class="font-bold text-xs text-center ${unlocked ? 'text-white' : 'text-slate-500'}">${ach.name}</div>
                        <div class="text-[9px] text-center ${unlocked ? 'text-fuchsia-400' : 'text-slate-500'}">${ach.desc}</div>
                        ${!unlocked && target > 1 ? `
                            <div class="w-full h-1.5 bg-slate-800 rounded mt-2 overflow-hidden">
                                <div class="h-full bg-gradient-to-r from-fuchsia-500 to-pink-500 transition-all" style="width: ${pct}%"></div>
                            </div>
                            <div class="text-[8px] text-center text-slate-500 mt-1">${prog}/${target}</div>
                        ` : ''}
                        ${unlocked ? '<div class="text-center text-fuchsia-400 text-[9px] mt-1"><i class="fa-solid fa-check"></i> UNLOCKED</div>' : ''}
                    </div>
                `;
            }
            
            html += `</div></div>`;
        }
        
        html += `</div>`;
        container.innerHTML = html;
    }
};

window.Achievements = Achievements;