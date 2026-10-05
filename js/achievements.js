const Achievements = {
    state: null,
    unlocked: new Set(),
    progress: {},

    // CONFIG keys are UPPERCASE (FIRST_CATCH) but callers pass lowercase
    // ids ('first_catch') — this mismatch used to make every unlock fail.
    cfg(id) {
        if (typeof CONFIG === 'undefined' || !CONFIG.ACHIEVEMENTS) return null;
        return CONFIG.ACHIEVEMENTS[id] || CONFIG.ACHIEVEMENTS[String(id).toUpperCase()] || null;
    },
    
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

        const ach = this.cfg(id);
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
            // Top achievements pay up to 500k coins / 100k XP in one tick —
            // re-baseline the tamper guard so it never eats legit rewards.
            try { if (typeof AntiCheat !== 'undefined') AntiCheat.markLegit(); } catch (e) {}
        }
        
        // Show notification
        this.showUnlockNotification(ach);
        
        // Update HUD
        Player.refreshHUD(this.state);
        
        return true;
    },
    
    addProgress(id, amount = 1) {
        if (this.unlocked.has(id)) return;

        const ach = this.cfg(id);
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
        const uniqueFish = () => {
            try {
                return new Set(FISH_SPECIES.filter(f => !f.isBoss).map(f => f.id)).size;
            } catch (e) { return 100; }
        };
        const targets = {
            'catch_10': 10,
            'catch_100': 100,
            'catch_500': 500,
            'catch_1000': 1000,
            'kill_10': 10,
            'kill_100': 100,
            'kill_500': 500,
            'kill_crab_25': 25,
            'kill_gull_50': 50,
            'kill_beetle_20': 20,
            'kill_boss': 1,
            'kill_5_bosses': 5,
            'kill_10_bosses': 10,
            'level_10': 10,
            'level_25': 25,
            'level_50': 50,
            'level_100': 100,
            'fish_index_25': 25,
            'fish_index_50': 50,
            'fish_index_100': 100,
            'fish_index_all': uniqueFish(),
        };
        return targets[id] || 1;
    },
    
    checkAll(state) {
        const p = state.player;

        // Backfill for saves from before catch counting worked: lifetime
        // catches can't be below your discovery count.
        try {
            const discovered = (p.caughtFish || []).length;
            if ((p.totalFishCaught || 0) < discovered) p.totalFishCaught = discovered;
        } catch (e) {}

        // Fishing
        const totalCaught = p.totalFishCaught || 0;
        this.setProgress('catch_10', totalCaught);
        this.setProgress('catch_100', totalCaught);
        this.setProgress('catch_500', totalCaught);
        this.setProgress('catch_1000', totalCaught);
        if (totalCaught > 0 && !this.unlocked.has('first_catch')) this.unlock('first_catch');

        // Rarity backfill from the fish index (old catches still count)
        try {
            const rars = new Set((p.caughtFish || []).map(f => f && f.rarity));
            if (rars.has('rare')) this.unlock('catch_rare');
            if (rars.has('epic')) this.unlock('catch_epic');
            if (rars.has('legendary')) this.unlock('catch_legendary');
            if (rars.has('mythic')) this.unlock('catch_mythic');
        } catch (e) {}

        // Kills (incl. the single-boss achievement, previously unwired)
        const totalKills = p.totalKills || 0;
        this.setProgress('kill_10', totalKills);
        this.setProgress('kill_100', totalKills);
        this.setProgress('kill_500', totalKills);
        const bossKills = p.bossKills || 0;
        if (bossKills > 0 && !this.unlocked.has('kill_boss')) this.unlock('kill_boss');
        this.setProgress('kill_5_bosses', bossKills);
        this.setProgress('kill_10_bosses', bossKills);

        // Casino bankroll backfill
        try {
            if ((p.casinoTotalLost || 0) >= 10000 && !this.unlocked.has('casino_bankrupt')) {
                this.unlock('casino_bankrupt');
            }
        } catch (e) {}

        // Fortune backfill: tycoon / full hold / marlin quests
        try {
            if ((p.coins || 0) >= 100000 && !this.unlocked.has('tycoon_100k')) this.unlock('tycoon_100k');
            if ((p.bucket || []).length >= (p.bucketCapacity || 15) && (p.bucket || []).length > 0 && !this.unlocked.has('full_bucket')) {
                this.unlock('full_bucket');
            }
            if (p.quests && (p.quests.done || 0) >= 5 && !this.unlocked.has('quest_5')) this.unlock('quest_5');
        } catch (e) {}
        
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
        this.setProgress('kill_500', totalKills);

        // Per-species extermination counts
        if (enemyType === 'beachCrab') this.addProgress('kill_crab_25');
        if (enemyType === 'seagull') this.addProgress('kill_gull_50');
        if (enemyType === 'duneBeetle') this.addProgress('kill_beetle_20');
        
        // Boss kills
        if (enemyType === 'boss') {
            const bossKills = (state.player.bossKills || 0) + 1;
            state.player.bossKills = bossKills;
            if (!this.unlocked.has('kill_boss')) this.unlock('kill_boss');
            this.setProgress('kill_5_bosses', bossKills);
            this.setProgress('kill_10_bosses', bossKills);
        }
        
        this.saveProgress();
    },
    
    checkFishCatch(state, fish) {
        // Total fish (+ graduated catch achievements, previously never fed)
        const totalCaught = (state.player.totalFishCaught || 0) + 1;
        state.player.totalFishCaught = totalCaught;
        this.setProgress('catch_10', totalCaught);
        this.setProgress('catch_100', totalCaught);
        this.setProgress('catch_500', totalCaught);
        this.setProgress('catch_1000', totalCaught);

        // The whale itself is an achievement (hook = unlock, not just catch)
        if (fish && fish.id === 'colossal_whale' && !this.unlocked.has('whale_watcher')) {
            this.unlock('whale_watcher');
        }
        // Shiny catches
        if (fish && fish.shiny && !this.unlocked.has('catch_shiny')) {
            this.unlock('catch_shiny');
        }
        
        // Rarity specific (fish null-guarded: callers may pass a bare id)
        if (fish && fish.rarity === 'rare' && !this.unlocked.has('catch_rare')) this.unlock('catch_rare');
        if (fish && fish.rarity === 'epic' && !this.unlocked.has('catch_epic')) this.unlock('catch_epic');
        if (fish && fish.rarity === 'legendary' && !this.unlocked.has('catch_legendary')) this.unlock('catch_legendary');
        if (fish && fish.rarity === 'mythic' && !this.unlocked.has('catch_mythic')) this.unlock('catch_mythic');
        
        // First catch
        if (!this.unlocked.has('first_catch')) this.unlock('first_catch');
        
        this.saveProgress();
    },
    
    checkCasino(state, type, amount) {
        if (type === 'win' && amount >= 1000 && !this.unlocked.has('casino_win_1000')) {
            this.unlock('casino_win_1000');
        }
        if (type === 'win' && amount >= 5000 && !this.unlocked.has('casino_high_roller')) {
            this.unlock('casino_high_roller');
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
        // Lifetime winnings tracker (shown in shop casino tab)
        if (type === 'win' && state && state.player) {
            state.player.casinoLifetimeWinnings = (state.player.casinoLifetimeWinnings || 0) + amount;
        }
    },

    // Compat wrappers used by Casino UI
    onCasinoWin(state, amount) { try { this.checkCasino(state, 'win', amount); } catch (e) {} },
    onCasinoLoss(state, amount) { try { this.checkCasino(state, 'lose', amount); } catch (e) {} },
    onJackpot(state) { try { this.checkCasino(state, 'jackpot', 0); } catch (e) {} },
    
    checkSurvival(state, timeAlive) {
        if (timeAlive >= 3600 && !this.unlocked.has('no_death_1hr')) { // 1 hour
            this.unlock('no_death_1hr');
        }
    },

    // Live wealth checks (called from Player.refreshHUD — cheap guards only)
    checkWealth(state) {
        try {
            const p = state && state.player;
            if (!p) return;
            if ((p.coins || 0) >= 100000 && !this.unlocked.has('tycoon_100k')) this.unlock('tycoon_100k');
            if ((p.bucket || []).length >= (p.bucketCapacity || 15) && (p.bucket || []).length > 0 && !this.unlocked.has('full_bucket')) {
                this.unlock('full_bucket');
            }
            if (p.quests && (p.quests.done || 0) >= 5 && !this.unlocked.has('quest_5')) this.unlock('quest_5');
        } catch (e) {}
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
            'Fishing': ['first_catch', 'catch_10', 'catch_100', 'catch_500', 'catch_1000', 'catch_shiny', 'whale_watcher'],
            'Rarity': ['catch_rare', 'catch_epic', 'catch_legendary', 'catch_mythic'],
            'Combat': ['kill_10', 'kill_100', 'kill_500', 'kill_crab_25', 'kill_gull_50', 'kill_beetle_20', 'kill_boss', 'kill_5_bosses', 'kill_10_bosses'],
            'Casino': ['casino_win_1000', 'casino_high_roller', 'casino_jackpot', 'casino_bankrupt'],
            'Fortune': ['tycoon_100k', 'full_bucket', 'quest_5'],
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
                const ach = this.cfg(id);
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