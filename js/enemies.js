const EnemySpawner = {
    state: null,
    timers: {
        seagull: 0,
        jumpingFish: 0,
        beachCrab: 0,
    },
    
    init(state) {
        this.state = state;
        this.timers.seagull = CONFIG.ENEMIES.SEAGULL.spawnInterval;
        this.timers.jumpingFish = CONFIG.ENEMIES.JUMPING_FISH.spawnInterval;
        this.timers.beachCrab = CONFIG.ENEMIES.BEACH_CRAB.spawnInterval;
    },
    
    update(delta) {
        if (!this.state) return;
        
        // Don't spawn during menu
        if (this.state.paused) return;
        
        // Only spawn if player is alive
        if (this.state.player.hp <= 0) return;
        
        this.updateTimers(delta);
        this.trySpawnEnemies(delta);
        this.updateSeagulls(delta);
        this.updateJumpingFish(delta);
        this.updateBeachCrabs(delta);
    },
    
    updateTimers(delta) {
        this.timers.seagull -= delta;
        this.timers.jumpingFish -= delta;
        this.timers.beachCrab -= delta;
    },
    
    trySpawnEnemies(delta) {
        // Seagulls
        if (this.timers.seagull <= 0) {
            this.timers.seagull = CONFIG.ENEMIES.SEAGULL.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.SEAGULL.spawnChance) {
                this.spawnSeagull();
            }
        }
        
        // Jumping Fish
        if (this.timers.jumpingFish <= 0) {
            this.timers.jumpingFish = CONFIG.ENEMIES.JUMPING_FISH.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.JUMPING_FISH.spawnChance) {
                this.spawnJumpingFish();
            }
        }
        
        // Beach Crabs
        if (this.timers.beachCrab <= 0) {
            this.timers.beachCrab = CONFIG.ENEMIES.BEACH_CRAB.spawnInterval;
            if (Math.random() < CONFIG.ENEMIES.BEACH_CRAB.spawnChance) {
                this.spawnBeachCrab();
            }
        }
    },
    
    countEnemies(type) {
        if (!this.state.enemies) return 0;
        return this.state.enemies.filter(e => e.enemyType === type).length;
    },
    
    spawnSeagull() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('seagull') >= CONFIG.ENEMIES.SEAGULL.maxCount) return;
        
        const p = this.state.player;
        const B = CONFIG.WORLD;
        const waterX = this.state.waterBoundaryX;
        
        // Spawn above player, off-screen
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = p.x + side * (B.MAX_X / 2 + Math.random() * 200);
        const y = p.y + (Math.random() - 0.5) * 400;
        
        const cfg = CONFIG.ENEMIES.SEAGULL;
        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'seagull',
            x, y,
            vx: 0, vy: 0,
            hp: cfg.hp,
            maxHp: cfg.hp,
            damage: cfg.damage,
            speed: cfg.speed,
            diveSpeed: cfg.diveSpeed,
            diveCooldown: 0,
            diveTimer: cfg.diveCooldown,
            state: 'circling', // circling, diving, retreating
            targetX: p.x,
            targetY: p.y,
            circleAngle: Math.random() * Math.PI * 2,
            circleRadius: 150 + Math.random() * 100,
            circleDirection: Math.random() < 0.5 ? 1 : -1,
            score: cfg.score,
            xp: cfg.xp,
            hitFlash: 0,
        });
    },
    
    // Shared damage-over-time from gun effects (burn / poison) + stun.
    // Returns true if the tick killed the enemy.
    tickStatus(e, delta) {
        let died = false;
        if (e.burnTimer > 0) {
            e.burnTimer -= delta;
            e.hp -= (e.burnDps || 12) * delta;
            if (Math.random() < 0.25 && this.state) {
                Particles.spawnParticles(this.state, e.x, e.y, '#f97316', 1, { size: 3 });
            }
        }
        if (e.poisonTimer > 0) {
            e.poisonTimer -= delta;
            e.hp -= (e.poisonDps || 10) * delta;
        }
        if (e.freezeTimer > 0) e.freezeTimer -= delta;
        if (e.stunTimer > 0) e.stunTimer -= delta;
        e.hitFlash = Math.max(0, (e.hitFlash || 0) - delta);
        if (e.hp <= 0 && !e._dead) {
            e._dead = true;
            this.onEnemyKilled(e);
            died = true;
        }
        return died;
    },

    spawnJumpingFish() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('jumpingFish') >= CONFIG.ENEMIES.JUMPING_FISH.maxCount) return;

        const p = this.state.player;
        const B = CONFIG.WORLD;
        const waterX = this.state.waterBoundaryX;

        // Beached flopper: spawns DIRECTLY on land near the player — no
        // fishing required. It flops toward the player and stays until killed.
        const cfg = CONFIG.ENEMIES.JUMPING_FISH;
        const base = FISH_SPECIES[Math.floor(Math.random() * FISH_SPECIES.length)];
        const species = (typeof makeCatchInstance === 'function') ? makeCatchInstance(base, 0) : Object.assign({}, base);
        const x = Utils.clamp(p.x + (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 120), B.MIN_X + 30, waterX - 30);
        const y = Utils.clamp(p.y + (Math.random() - 0.5) * 240, B.MIN_Y + 30, B.MAX_Y - 30);

        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'jumpingFish',
            species: species,
            x, y,
            vx: 0, vy: 0,
            hp: Math.max(60, (species.maxHp || cfg.baseHp) * 0.4),
            maxHp: Math.max(60, (species.maxHp || cfg.baseHp) * 0.4),
            damage: cfg.damage,
            state: 'onLand', // always starts beached on land now
            landTimer: 60,   // flops back after 60s if ignored
            hopTimer: 0.5,
            hitCd: 0,
            score: Math.max(20, Math.round((species.value || 100) * 0.3)),
            xp: cfg.xp,
            hitFlash: 0,
        });
        Particles.showFloatingText(this.state, `🐟 ${species.name} flopped ashore!`, x, y - 40, species.color || '#38bdf8');
    },
    
    spawnBeachCrab() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('beachCrab') >= CONFIG.ENEMIES.BEACH_CRAB.maxCount) return;
        
        const p = this.state.player;
        const waterX = this.state.waterBoundaryX;
        const B = CONFIG.WORLD;
        
        // Spawn on beach near player
        const x = Utils.clamp(p.x + (Math.random() - 0.5) * 400, waterX - 200, waterX + 50);
        const y = Utils.clamp(p.y + (Math.random() - 0.5) * 400, B.MIN_Y + 50, B.MAX_Y - 50);
        
        const cfg = CONFIG.ENEMIES.BEACH_CRAB;
        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'beachCrab',
            x, y,
            vx: 0, vy: 0,
            hp: cfg.hp,
            maxHp: cfg.hp,
            damage: cfg.damage,
            speed: cfg.speed,
            burrowCooldown: 0,
            burrowTimer: cfg.burrowCooldown,
            state: 'walking', // walking, burrowed, charging
            burrowed: false,
            score: cfg.score,
            xp: cfg.xp,
            hitFlash: 0,
        });
    },
    
    updateSeagulls(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        
        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'seagull') return;
            if (this.tickStatus(e, delta)) return;
            if (e.stunTimer > 0) return;

            e.diveTimer -= delta;
            
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy);
            
            switch (e.state) {
                case 'circling':
                    // Circle around player
                    e.circleAngle += e.circleDirection * delta * 0.5;
                    e.targetX = p.x + Math.cos(e.circleAngle) * e.circleRadius;
                    e.targetY = p.y + Math.sin(e.circleAngle) * e.circleRadius;
                    
                    const tx = e.targetX - e.x;
                    const ty = e.targetY - e.y;
                    const td = Math.hypot(tx, ty);
                    if (td > 0) {
                        e.vx += (tx / td) * e.speed * delta;
                        e.vy += (ty / td) * e.speed * delta;
                    }
                    
                    // Dive attack
                    if (e.diveTimer <= 0 && dist < 300 && Math.random() < 0.02) {
                        e.state = 'diving';
                        e.diveTimer = 3;
                    }
                    break;
                    
                case 'diving':
                    // Fast dive towards player
                    if (dist > 0) {
                        e.vx += (dx / dist) * e.diveSpeed * delta;
                        e.vy += (dy / dist) * e.diveSpeed * delta;
                    }
                    
                    // Check collision with player
                    if (dist < p.radius + 15) {
                        this.hitPlayer(e);
                        e.state = 'retreating';
                    }
                    
                    if (dist > 400) {
                        e.state = 'retreating';
                    }
                    break;
                    
                case 'retreating':
                    // Fly away and reset
                    const retreatX = e.x - dx * 0.5;
                    const retreatY = e.y - dy * 0.5;
                    const rd = Math.hypot(retreatX - e.x, retreatY - e.y);
                    if (rd > 0) {
                        e.vx += ((retreatX - e.x) / rd) * e.speed * delta;
                        e.vy += ((retreatY - e.y) / rd) * e.speed * delta;
                    }
                    
                    if (dist > 500) {
                        e.state = 'circling';
                        e.diveTimer = CONFIG.ENEMIES.SEAGULL.diveCooldown;
                        e.circleAngle = Math.random() * Math.PI * 2;
                    }
                    break;
            }
            
            // Apply velocity
            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.95;
            e.vy *= 0.95;
            
            // Clamp to world
            const B = CONFIG.WORLD;
            e.x = Utils.clamp(e.x, B.MIN_X, this.state.waterBoundaryX + 500);
            e.y = Utils.clamp(e.y, B.MIN_Y, B.MAX_Y);
        });
    },
    
    updateJumpingFish(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        const waterX = this.state.waterBoundaryX;
        const B = CONFIG.WORLD;

        for (let idx = this.state.enemies.length - 1; idx >= 0; idx--) {
            const e = this.state.enemies[idx];
            if (e.enemyType !== 'jumpingFish') continue;
            if (this.tickStatus(e, delta)) continue;
            if (e.stunTimer > 0) continue;

            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            const slowMult = e.freezeTimer > 0 ? 0.3 : 1.0;

            // Flop-hop toward the player
            e.hopTimer -= delta;
            if (e.hopTimer <= 0) {
                e.hopTimer = 0.7 + Math.random() * 0.5;
                e.vx += (dx / dist) * 220 * slowMult;
                e.vy += (dy / dist) * 220 * slowMult;
                if (typeof Particles !== 'undefined') Particles.spawnParticles(this.state, e.x, e.y, '#fef3c7', 3, { size: 2 });
            }

            e.hitCd = Math.max(0, (e.hitCd || 0) - delta);
            if (dist < 32 && e.hitCd <= 0) {
                this.hitPlayer(e);
                e.hitCd = 0.8;
            }

            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.90;
            e.vy *= 0.90;
            e.x = Utils.clamp(e.x, B.MIN_X + 20, waterX - 15);
            e.y = Utils.clamp(e.y, B.MIN_Y + 20, B.MAX_Y - 20);

            // Flops back to sea if ignored too long
            e.landTimer -= delta;
            if (e.landTimer <= 0) {
                Particles.showFloatingText(this.state, 'Fish flopped back to sea...', e.x, e.y - 30, '#94a3b8');
                this.state.enemies = this.state.enemies.filter(en => en !== e);
            }
        }
    },
    
    updateBeachCrabs(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        
        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'beachCrab') return;
            if (this.tickStatus(e, delta)) return;
            if (e.stunTimer > 0) return;

            e.burrowTimer -= delta;
            
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy);
            
            switch (e.state) {
                case 'walking':
                    if (e.burrowed) {
                        e.state = 'burrowed';
                        break;
                    }
                    
                    // Walk randomly on beach
                    if (e.walkTimer === undefined) e.walkTimer = 2 + Math.random() * 3;
                    e.walkTimer -= delta;
                    
                    if (e.walkTimer <= 0) {
                        e.walkTargetX = e.x + (Math.random() - 0.5) * 200;
                        e.walkTargetY = e.y + (Math.random() - 0.5) * 200;
                        e.walkTimer = 2 + Math.random() * 3;
                    }
                    
                    const wdx = e.walkTargetX - e.x;
                    const wdy = e.walkTargetY - e.y;
                    const wdist = Math.hypot(wdx, wdy);
                    
                    if (wdist > 0) {
                        e.vx += (wdx / wdist) * e.speed * delta;
                        e.vy += (wdy / wdist) * e.speed * delta;
                    }
                    
                    // Burrow
                    if (e.burrowTimer <= 0 && Math.random() < 0.01) {
                        e.state = 'burrowed';
                        e.burrowTimer = 5 + Math.random() * 5;
                    }
                    
                    // Charge player if close
                    if (dist < 150 && Math.random() < 0.005) {
                        e.state = 'charging';
                    }
                    break;
                    
                case 'charging':
                    if (dist > 0) {
                        e.vx += (dx / dist) * e.speed * 3 * delta;
                        e.vy += (dy / dist) * e.speed * 3 * delta;
                    }
                    
                    if (dist < 25) {
                        this.hitPlayer(e);
                        e.state = 'walking';
                    }
                    
                    if (dist > 300) {
                        e.state = 'walking';
                    }
                    break;
                    
                case 'burrowed':
                    // Immune to damage, wait
                    if (e.burrowTimer <= 0) {
                        e.burrowed = false;
                        e.state = 'walking';
                        e.burrowTimer = CONFIG.ENEMIES.BEACH_CRAB.burrowCooldown;
                    }
                    break;
            }
            
            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.9;
            e.vy *= 0.9;
            
            // Clamp to beach area
            const B = CONFIG.WORLD;
            const waterX = this.state.waterBoundaryX;
            e.x = Utils.clamp(e.x, B.MIN_X, waterX + 50);
            e.y = Utils.clamp(e.y, B.MIN_Y, B.MAX_Y);
        });
    },
    
    hitPlayer(enemy) {
        const p = this.state.player;
        if (p.hp <= 0 || p.isDead) return;

        // Armor / umbrella aware (same mitigation as land monsters)
        let dealt = enemy.damage;
        if (typeof Combat !== 'undefined' && Combat.damagePlayer) {
            dealt = Combat.damagePlayer(this.state, enemy.damage, { knockback: 0 });
        } else {
            p.hp -= enemy.damage;
            Player.refreshHUD(this.state);
            if (p.hp <= 0) Player.die(this.state);
        }
        this.state.screenShake = Math.max(this.state.screenShake || 0, 8);
        try { audio.playHurt(); } catch (e) {}
        try { UI.triggerDamageFlash(); } catch (e2) {}
        Particles.showFloatingText(this.state, `-${dealt}`, p.x, p.y - 30, '#f87171');
    },

    // Called when enemy is killed by player
    onEnemyKilled(enemy) {
        // Award score and XP
        if (this.state.player) {
            this.state.player.coins += enemy.score || 0;
            Player.addXP(this.state, enemy.xp || 0);

            // Check achievements
            if (typeof Achievements !== 'undefined') {
                Achievements.checkEnemyKill(this.state, enemy.enemyType);
            }

            Particles.showFloatingText(this.state, `+${enemy.score} coins!`, enemy.x, enemy.y - 30, '#facc15');
            Particles.showFloatingText(this.state, `+${enemy.xp} XP`, enemy.x, enemy.y - 50, '#38bdf8');
        }

        // Sellable loot — seagulls & crabs drop meat, jumping fish drop
        // their real species. Pick it up and sell it in the shop like fish.
        if (!this.state.groundLoot) this.state.groundLoot = [];
        let loot = null;
        if (enemy.enemyType === 'seagull') {
            loot = { id: 'seagull_meat', name: 'Seagull Meat', value: Math.max(15, enemy.score || 50), color: '#e2e8f0', rarity: 'common', size: 14 };
        } else if (enemy.enemyType === 'beachCrab') {
            loot = { id: 'crab_meat', name: 'Crab Meat', value: Math.max(20, enemy.score || 75), color: '#d97706', rarity: 'common', size: 16 };
        } else if (enemy.enemyType === 'jumpingFish' && enemy.species) {
            loot = enemy.species;
        }
        if (loot) {
            this.state.groundLoot.push({ species: loot, x: enemy.x, y: enemy.y });
            Particles.showFloatingText(this.state, `+1 ${loot.name}!`, enemy.x, enemy.y - 65, '#34d399');
        }

        // Remove enemy
        this.state.enemies = this.state.enemies.filter(e => e !== enemy);
    }
};

// Seagull rendering
function renderSeagull(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    
    const angle = Math.atan2(e.vy, e.vx);
    ctx.rotate(angle);
    
    // Body
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Wings
    const wingFlap = Math.sin(performance.now() / 100) * 0.5;
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.ellipse(-5, -8 * wingFlap, 25, 8, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-5, 8 * wingFlap, 25, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Head
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(18, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Beak
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(32, -3);
    ctx.lineTo(32, 3);
    ctx.closePath();
    ctx.fill();
    
    // Eyes
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(20, -3, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Hit flash
    if (e.hitFlash > 0) {
        ctx.fillStyle = `rgba(248,113,113,${e.hitFlash * 2})`;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// Jumping Fish rendering (uses fish model)
function renderJumpingFish(ctx, e) {
    if (e.species && typeof Render !== 'undefined') {
        Render.drawFishModel(ctx, e.x, e.y, e.species.size * 0.8, e.species, { 
            angle: Math.atan2(e.vy, e.vx),
            glow: e.hitFlash
        });
    }
}

// Beach Crab rendering
function renderBeachCrab(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    
    if (e.burrowed) {
        // Just sand mound with eyes
        ctx.fillStyle = '#a16207';
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI);
        ctx.fill();
        
        ctx.fillStyle = '#1e293b';
        ctx.beginPath(); ctx.arc(-6, -3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(6, -3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        return;
    }
    
    const angle = Math.atan2(e.vy, e.vx);
    ctx.rotate(angle);
    
    // Body
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Shell pattern
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Claws
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.moveTo(20, -8);
    ctx.quadraticCurveTo(30, -12, 35, -5);
    ctx.quadraticCurveTo(30, -2, 20, -4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(20, 8);
    ctx.quadraticCurveTo(30, 12, 35, 5);
    ctx.quadraticCurveTo(30, 2, 20, 4);
    ctx.fill();
    
    // Legs
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-5 + i * 8, 5);
        ctx.lineTo(-15 + i * 8, 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-5 + i * 8, -5);
        ctx.lineTo(-15 + i * 8, -15);
        ctx.stroke();
    }
    
    // Eyes on stalks
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(-8, -12, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -12, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath(); ctx.arc(-8, -12, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -12, 1.5, 0, Math.PI * 2); ctx.fill();
    
    // Hit flash
    if (e.hitFlash > 0) {
        ctx.fillStyle = `rgba(248,113,113,${e.hitFlash * 2})`;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

// Register renderers globally
window.renderSeagull = renderSeagull;
window.renderJumpingFish = renderJumpingFish;
window.renderBeachCrab = renderBeachCrab;
window.EnemySpawner = EnemySpawner;