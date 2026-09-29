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
    
    spawnJumpingFish() {
        if (!this.state.enemies) this.state.enemies = [];
        if (this.countEnemies('jumpingFish') >= CONFIG.ENEMIES.JUMPING_FISH.maxCount) return;
        
        const p = this.state.player;
        const waterX = this.state.waterBoundaryX;
        
        // Spawn from water, jump towards player
        const x = waterX + 50 + Math.random() * 200;
        const y = p.y + (Math.random() - 0.5) * 300;
        
        const cfg = CONFIG.ENEMIES.JUMPING_FISH;
        // Pick a random fish species for visual
        const species = FISH_SPECIES[Math.floor(Math.random() * FISH_SPECIES.length)];
        
        this.state.enemies.push({
            id: Date.now() + Math.random(),
            enemyType: 'jumpingFish',
            species: species,
            x, y,
            vx: 0, vy: 0,
            hp: cfg.baseHp,
            maxHp: cfg.baseHp,
            damage: cfg.damage,
            jumpSpeed: cfg.jumpSpeed,
            jumpHeight: cfg.jumpHeight,
            landTime: cfg.landTime,
            landTimer: 0,
            state: 'inWater', // inWater, jumping, onLand, returning
            jumpTargetX: p.x,
            jumpTargetY: p.y,
            score: cfg.score,
            xp: cfg.xp,
            hitFlash: 0,
        });
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
            
            e.hitFlash = Math.max(0, e.hitFlash - delta);
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
        
        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'jumpingFish') return;
            
            e.hitFlash = Math.max(0, e.hitFlash - delta);
            
            const dx = p.x - e.x;
            const dy = p.y - e.y;
            const dist = Math.hypot(dx, dy);
            
            switch (e.state) {
                case 'inWater':
                    // Swim in water, occasionally jump
                    e.x += (Math.random() - 0.5) * 50 * delta;
                    e.y += (Math.random() - 0.5) * 50 * delta;
                    
                    // Jump towards player
                    if (e.x > waterX && dist < 400 && Math.random() < 0.01) {
                        e.state = 'jumping';
                        e.jumpTargetX = p.x;
                        e.jumpTargetY = p.y;
                    }
                    break;
                    
                case 'jumping':
                    // Arc jump towards player
                    const jdx = e.jumpTargetX - e.x;
                    const jdy = e.jumpTargetY - e.y;
                    const jdist = Math.hypot(jdx, jdy);
                    
                    if (jdist > 0) {
                        e.vx += (jdx / jdist) * e.jumpSpeed * delta;
                        e.vy += (jdy / jdist) * e.jumpSpeed * delta;
                    }
                    
                    // Arc height
                    const progress = 1 - jdist / Math.hypot(e.jumpTargetX - (e.x - e.vx * delta), e.jumpTargetY - (e.y - e.vy * delta));
                    if (progress < 0.5) {
                        e.vy -= e.jumpHeight * delta * 4;
                    } else {
                        e.vy += e.jumpHeight * delta * 4;
                    }
                    
                    // Landed
                    if (e.x <= waterX + 20 && e.vy > 0) {
                        e.state = 'onLand';
                        e.landTimer = e.landTime;
                        e.x = waterX - 10;
                    }
                    break;
                    
                case 'onLand':
                    e.landTimer -= delta;
                    // Flop towards player
                    if (dist > 0 && dist < 200) {
                        e.vx += (dx / dist) * 50 * delta;
                        e.vy += (dy / dist) * 50 * delta;
                    }
                    
                    // Attack player
                    if (dist < 30) {
                        this.hitPlayer(e);
                    }
                    
                    // Return to water
                    if (e.landTimer <= 0) {
                        e.state = 'returning';
                    }
                    break;
                    
                case 'returning':
                    // Jump back to water
                    const rdx = waterX + 100 - e.x;
                    const rdy = 0;
                    const rdist = Math.hypot(rdx, rdy);
                    
                    if (rdist > 0) {
                        e.vx += (rdx / rdist) * e.jumpSpeed * delta;
                        e.vy += (rdy / rdist) * e.jumpSpeed * delta;
                    }
                    
                    if (e.x >= waterX) {
                        this.state.enemies = this.state.enemies.filter(en => en !== e);
                    }
                    break;
            }
            
            e.x += e.vx * delta;
            e.y += e.vy * delta;
            e.vx *= 0.98;
            e.vy *= 0.98;
        });
    },
    
    updateBeachCrabs(delta) {
        if (!this.state.enemies) return;
        const p = this.state.player;
        
        this.state.enemies.forEach(e => {
            if (e.enemyType !== 'beachCrab') return;
            
            e.hitFlash = Math.max(0, e.hitFlash - delta);
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
        if (p.hp <= 0) return;
        
        p.hp -= enemy.damage;
        this.state.screenShake = 8;
        try { audio.playHurt(); } catch (e) {}
        UI.triggerDamageFlash();
        Particles.showFloatingText(this.state, `-${enemy.damage}`, p.x, p.y - 30, '#f87171');
        Player.refreshHUD(this.state);
        
        if (p.hp <= 0) {
            Player.die(this.state);
        }
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