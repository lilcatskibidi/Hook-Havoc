// ==========================================
// MENU BACKGROUND ANIMATION - NPC Shooting Fish
// ==========================================
const MenuBackground = {
    canvas: null,
    ctx: null,
    time: 0,
    npc: {
        x: 150, y: 300,
        angle: 0,
        shootTimer: 0,
        shootCooldown: 1.5,
        recoil: 0,
        frame: 0
    },
    fish: [],
    particles: [],
    
    init() {
        this.canvas = $('menu-bg-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    },
    
    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    },
    
    animate() {
        if (!this.ctx || !this.canvas) return;
        
        const delta = 1/60;
        this.time += delta;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw water background
        this.drawWaterBackground();
        
        // Update and draw NPC
        this.updateNPC(delta);
        this.drawNPC();
        
        // Update and draw fish
        this.updateFish(delta);
        this.drawFish();
        
        // Update and draw particles
        this.updateParticles(delta);
        this.drawParticles();
        
        requestAnimationFrame(() => this.animate());
    },
    
    drawWaterBackground() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const waterX = w * 0.52;
        
        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, '#0c1a2a');
        skyGrad.addColorStop(0.5, '#0f172a');
        skyGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);
        
        // Water area
        const waterGrad = ctx.createLinearGradient(waterX, 0, w, 0);
        waterGrad.addColorStop(0, '#0c4a6e');
        waterGrad.addColorStop(0.5, '#075985');
        waterGrad.addColorStop(1, '#082f49');
        ctx.fillStyle = waterGrad;
        ctx.fillRect(waterX, 0, w - waterX, h);
        
        // Animated water surface lines
        ctx.strokeStyle = 'rgba(125,211,252,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 15; i++) {
            const y = (h / 15) * i + (this.time * 30) % (h / 15);
            ctx.beginPath();
            ctx.moveTo(waterX, y);
            for (let x = waterX; x < w; x += 20) {
                const wave = Math.sin((x + this.time * 100) * 0.02) * 8;
                ctx.lineTo(x, y + wave);
            }
            ctx.stroke();
        }
        
        // Caustics
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
            const x = waterX + 50 + i * 120 + Math.sin(this.time + i) * 30;
            const rayGrad = ctx.createRadialGradient(x, h/2, 0, x, h/2, 200);
            rayGrad.addColorStop(0, 'rgba(125,211,252,0.1)');
            rayGrad.addColorStop(1, 'rgba(125,211,252,0)');
            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(x - 50, 0);
            ctx.lineTo(x + 50, 0);
            ctx.lineTo(x + 150, h);
            ctx.lineTo(x - 150, h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
        
        // Shore line
        const shoreGrad = ctx.createLinearGradient(waterX - 30, 0, waterX + 20, 0);
        shoreGrad.addColorStop(0, 'rgba(180,140,90,0)');
        shoreGrad.addColorStop(0.5, 'rgba(150,115,75,0.4)');
        shoreGrad.addColorStop(1, 'rgba(90,70,50,0.8)');
        ctx.fillStyle = shoreGrad;
        ctx.fillRect(waterX - 30, 0, 50, h);
    },
    
    updateNPC(delta) {
        const waterX = this.canvas.width * 0.52;
        const npc = this.npc;
        
        // Gentle bobbing
        npc.y = 250 + Math.sin(this.time * 1.5) * 15;
        npc.angle = Math.sin(this.time * 0.8) * 0.15;
        
        // Shooting logic
        npc.shootTimer -= delta;
        if (npc.shootTimer <= 0) {
            npc.shootTimer = npc.shootCooldown + Math.random() * 1.0;
            npc.recoil = 8;
            this.shootFish();
        }
        
        if (npc.recoil > 0) npc.recoil -= delta * 30;
    },
    
    shootFish() {
        const waterX = this.canvas.width * 0.52;
        const npc = this.npc;
        
        // Random fish type
        const fishTypes = [
            { id: 'sardine', color: '#cbd5e1', size: 10, speed: 400, value: 'common' },
            { id: 'bass', color: '#34d399', size: 14, speed: 350, value: 'common' },
            { id: 'stingray', color: '#a78bfa', size: 18, speed: 300, value: 'rare' },
            { id: 'lionfish', color: '#fb7185', size: 16, speed: 380, value: 'rare' },
            { id: 'thunder_ray', color: '#38bdf8', size: 22, speed: 280, value: 'epic' },
            { id: 'coral_dragon', color: '#f97316', size: 24, speed: 260, value: 'epic' },
            { id: 'star_ray', color: '#c084fc', size: 26, speed: 240, value: 'legendary' },
            { id: 'elder_dragon', color: '#7c3aed', size: 32, speed: 200, value: 'mythic' }
        ];
        
        const type = fishTypes[Math.floor(Math.random() * fishTypes.length)];
        const angle = npc.angle + (Math.random() - 0.5) * 0.3;
        
        this.fish.push({
            x: npc.x + Math.cos(npc.angle) * 40,
            y: npc.y + Math.sin(npc.angle) * 40,
            vx: Math.cos(angle) * type.speed,
            vy: Math.sin(angle) * type.speed,
            angle: angle,
            rotationSpeed: (Math.random() - 0.5) * 4,
            size: type.size,
            color: type.color,
            type: type.value,
            life: 5,
            trail: []
        });
        
        // Muzzle flash particles
        for (let i = 0; i < 8; i++) {
            const a = npc.angle + (Math.random() - 0.5) * 0.5;
            this.particles.push({
                x: npc.x + Math.cos(npc.angle) * 40,
                y: npc.y + Math.sin(npc.angle) * 40,
                vx: Math.cos(a) * (100 + Math.random() * 200),
                vy: Math.sin(a) * (100 + Math.random() * 200),
                color: type.color,
                life: 0.2,
                size: 2 + Math.random() * 3
            });
        }
        
        // Shell ejection
        for (let i = 0; i < 2; i++) {
            this.particles.push({
                x: npc.x + 20,
                y: npc.y - 5,
                vx: Math.cos(npc.angle + Math.PI/2) * (50 + Math.random() * 50),
                vy: Math.sin(npc.angle + Math.PI/2) * (50 + Math.random() * 50),
                color: '#fbbf24',
                life: 1.0,
                size: 3,
                gravity: true
            });
        }
    },
    
    drawNPC() {
        const ctx = this.ctx;
        const npc = this.npc;
        
        ctx.save();
        ctx.translate(npc.x, npc.y);
        ctx.rotate(npc.angle);
        
        // Recoil
        ctx.translate(-npc.recoil * 0.5, 0);
        
        // Body
        const bodyGrad = ctx.createRadialGradient(-5, -5, 2, 0, 0, 20);
        bodyGrad.addColorStop(0, '#38bdf8');
        bodyGrad.addColorStop(1, '#0369a1');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Gun (Harpoon Launcher style)
        ctx.fillStyle = '#92400e';
        ctx.fillRect(18, -6, 30, 12);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(18, -6, 30, 3);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(48, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(38, 4, 6, 10);
        
        ctx.restore();
        
        // Name tag
        ctx.font = 'bold 10px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText('NPC HUNTER', npc.x, npc.y - 40);
        ctx.fillText('NPC HUNTER', npc.x, npc.y - 40);
    },
    
    updateFish(delta) {
        for (let i = this.fish.length - 1; i >= 0; i--) {
            const f = this.fish[i];
            f.x += f.vx * delta;
            f.y += f.vy * delta;
            f.angle += f.rotationSpeed * delta;
            f.life -= delta;
            
            // Trail
            f.trail.push({ x: f.x, y: f.y });
            if (f.trail.length > 10) f.trail.shift();
            
            // Remove if off screen or dead
            if (f.life <= 0 || f.x > this.canvas.width + 50 || f.x < -50 || f.y > this.canvas.height + 50 || f.y < -50) {
                this.fish.splice(i, 1);
            }
        }
    },
    
    drawFish() {
        const ctx = this.ctx;
        
        this.fish.forEach(f => {
            // Trail
            ctx.strokeStyle = f.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            f.trail.forEach((pt, i) => {
                const alpha = (i / f.trail.length) * 0.5;
                ctx.globalAlpha = alpha * 0.3;
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
            ctx.globalAlpha = 1;
            
            // Fish body
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate(f.angle);
            
            // Rarity glow
            const rarityGlow = {
                common: 'rgba(148,163,184,0.5)',
                rare: 'rgba(56,189,248,0.6)',
                epic: 'rgba(168,85,247,0.7)',
                legendary: 'rgba(245,158,11,0.8)',
                mythic: 'rgba(232,121,249,0.9)'
            }[f.type];
            
            ctx.shadowColor = rarityGlow;
            ctx.shadowBlur = 15;
            
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, f.size, f.size * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Tail
            ctx.beginPath();
            ctx.moveTo(-f.size, 0);
            ctx.lineTo(-f.size * 1.5, -f.size * 0.5);
            ctx.lineTo(-f.size * 1.5, f.size * 0.5);
            ctx.closePath();
            ctx.fill();
            
            // Eye
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(f.size * 0.4, -f.size * 0.15, f.size * 0.12, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        });
    },
    
    updateParticles(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            if (p.gravity) p.vy += 200 * delta;
            p.vx *= 0.98;
            p.vy *= 0.98;
            p.life -= delta;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    },
    
    drawParticles() {
        const ctx = this.ctx;
        this.particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }
};

// Make globally available
window.MenuBackground = MenuBackground;

// ==========================================
// UI HELPER SYSTEM & STATUS OVERLAYS
// ==========================================
const $ = (id) => document.getElementById(id);

const UI = {
    updateStatusBanner(text, stepTag = 'Info', theme = 'sky') {
        const banner = $('status-banner');
        if (banner) {
            banner.innerHTML = `<span class="text-amber-400 font-extrabold uppercase mr-1">[${stepTag}]:</span> ${text}`;
        }
    },

    updateTensionBar(state) {
        const f = state.fishing;
        const rod = state.player.equippedRod || (typeof RODS !== 'undefined' ? RODS[0] : { tensionMax: 100 });
        const bar = $('tension-bar');
        const txt = $('tension-text');
        if (!bar || !txt) return;

        const ratio = Math.min(1.0, f.lineTension / rod.tensionMax);
        const percent = Math.round(ratio * 100);
        txt.innerText = `${percent}%`;
        bar.style.width = `${percent}%`;

        if (ratio > 0.8) {
            bar.className = 'h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-75 pulse-danger';
            txt.className = 'text-rose-500 font-extrabold';
        } else if (ratio > 0.45) {
            bar.className = 'h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-75';
            txt.className = 'text-amber-400 font-bold';
        } else {
            bar.className = 'h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75';
            txt.className = 'text-emerald-400 font-bold';
        }
    },

    triggerDamageFlash() {
        const el = $('damage-flash');
        if (!el) return;
        el.classList.remove('active');
        void el.offsetWidth;
        el.classList.add('active');
    },

    showCatchPopup(species) {
        const container = $('catch-popup-container');
        if (!container) return;
        const div = document.createElement('div');
        const rc = (CONFIG.RARITY_COLORS && CONFIG.RARITY_COLORS[species.rarity]) || '#cbd5e1';
        div.className = 'catch-popup glass-panel px-4 py-3 rounded-2xl flex items-center gap-3 border-2';
        div.style.borderColor = rc;
        div.style.boxShadow = `0 0 24px ${rc}80`;
        div.innerHTML = `
            <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${species.color}30;border:1px solid ${species.color}">
                <i class="fa-solid fa-fish text-lg" style="color:${species.color}"></i>
            </div>
            <div>
                <div class="text-[10px] font-black uppercase tracking-widest" style="color:${rc}">${species.rarity}</div>
                <div class="font-bold text-white text-sm">${species.name}</div>
                <div class="text-[10px] text-amber-400 font-bold">+${species.value} coins</div>
            </div>
        `;
        container.appendChild(div);
        setTimeout(() => div.remove(), 1500);
    },

    equipToSlot(state, weaponId, slotIdx) {
        const p = state.player;
        if (!p.ownedWeapons.includes(weaponId)) return false;
        if (slotIdx < 0 || slotIdx >= EQUIP_SLOTS) return false;

        const existingSlot = p.equippedWeapons.indexOf(weaponId);
        if (existingSlot !== -1 && existingSlot !== slotIdx) {
            p.equippedWeapons[existingSlot] = p.equippedWeapons[slotIdx];
        }
        p.equippedWeapons[slotIdx] = weaponId;

        if (p.activeSlot === slotIdx && typeof Player !== 'undefined') Player.refreshWeaponHUD(state);
        this.renderWeaponToolbar(state);
        return true;
    },

    unequipSlot(state, slotIdx) {
        const p = state.player;
        if (slotIdx < 0 || slotIdx >= EQUIP_SLOTS) return;
        p.equippedWeapons[slotIdx] = null;
        if (p.activeSlot === slotIdx && typeof Player !== 'undefined') Player.refreshWeaponHUD(state);
        this.renderWeaponToolbar(state);
    },

    renderWeaponToolbar(state) {
        const toolbar = $('weapon-toolbar');
        if (!toolbar || typeof WEAPONS === 'undefined') return;
        const p = state.player;
        toolbar.innerHTML = '';

        // Weapon slots (1-4)
        for (let i = 0; i < EQUIP_SLOTS; i++) {
            const weaponId = p.equippedWeapons[i];
            const w = weaponId ? WEAPONS.find(x => x.id === weaponId) : null;
            const active = p.activeSlot === i;

            const slot = document.createElement('div');
            slot.className = `weapon-slot relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${
                active ? 'active' : 'border-slate-700/60 bg-slate-900/60'
            } ${w ? '' : 'opacity-40'}`;
            slot.innerHTML = w
                ? `<i class="fa-solid ${w.icon} text-lg text-amber-400"></i>
                   <span class="text-[9px] font-bold mt-0.5 text-slate-300">${i + 1}</span>`
                : `<i class="fa-solid fa-plus text-lg text-slate-600"></i>
                   <span class="text-[9px] font-bold mt-0.5 text-slate-600">${i + 1}</span>`;
            slot.onclick = () => { if (typeof Player !== 'undefined') Player.selectWeapon(state, i); };
            slot.oncontextmenu = (e) => {
                e.preventDefault();
                UI.unequipSlot(state, i);
            };
            toolbar.appendChild(slot);
        }

        // Rod slot (5th slot - R key)
        const rod = p.equippedRod;
        const rodActive = p.activeSlot === 4; // Using 4 as rod slot index
        const rodSlot = document.createElement('div');
        rodSlot.className = `weapon-slot relative w-14 h-14 rounded-xl flex flex-col items-center justify-center border ${
            rodActive ? 'active' : 'border-emerald-700/60 bg-emerald-900/60'
        } ${rod ? '' : 'opacity-40'}`;
        rodSlot.innerHTML = rod
            ? `<i class="fa-solid fa-fishing-rod text-lg text-emerald-400"></i>
               <span class="text-[9px] font-bold mt-0.5 text-slate-300">R</span>`
            : `<i class="fa-solid fa-plus text-lg text-slate-600"></i>
               <span class="text-[9px] font-bold mt-0.5 text-slate-600">R</span>`;
        rodSlot.title = 'Rod Slot (R) - Click to equip rod';
        rodSlot.onclick = () => { if (typeof Player !== 'undefined') Player.selectRod(state); };
        rodSlot.oncontextmenu = (e) => {
            e.preventDefault();
            if (p.equippedRod) { p.equippedRod = RODS[0]; UI.refreshLuckDisplay(state); UI.renderWeaponToolbar(state); }
        };
        toolbar.appendChild(rodSlot);
    },

    renderStatusEffectsHUD(state) {
        const p = state.player;
        let hud = $('status-effects-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'status-effects-hud';
            hud.className = 'fixed top-20 left-6 flex gap-2 z-50 pointer-events-none';
            document.body.appendChild(hud);
        }

        let html = '';
        if (p.stunTimer > 0) {
            html += `<span class="px-2.5 py-1 bg-amber-500/20 border border-amber-400/60 rounded-lg text-amber-300 text-xs font-black animate-pulse">⚡ STUNNED (${p.stunTimer.toFixed(1)}s)</span>`;
        }
        if (p.slowTimer > 0) {
            html += `<span class="px-2.5 py-1 bg-sky-500/20 border border-sky-400/60 rounded-lg text-sky-300 text-xs font-black animate-pulse">❄️ SLOWED (${p.slowTimer.toFixed(1)}s)</span>`;
        }
        if (p.burnTimer > 0) {
            html += `<span class="px-2.5 py-1 bg-rose-500/20 border border-rose-400/60 rounded-lg text-rose-300 text-xs font-black animate-pulse">🔥 BURNING (${p.burnTimer.toFixed(1)}s)</span>`;
        }
        hud.innerHTML = html;
    },

    refreshLuckDisplay(state) {
        const el = $('luck-display');
        if (!el) return;
        const rod = state.player.equippedRod;
        const luck = rod && typeof rod.luck === 'number' ? rod.luck : 0;
        el.innerText = `+${Math.round(luck * 100)}%`;
    },

    updateBossBar(state) {
        const barWrap = $('boss-bar');
        if (!barWrap) return;

        const boss = state.activeBoss;
        if (!boss || boss.hp <= 0 || !state.monstersOnLand.includes(boss)) {
            barWrap.classList.add('hidden');
            return;
        }

        barWrap.classList.remove('hidden');

        const nameEl = $('boss-name');
        const hpTextEl = $('boss-hp-text');
        const hpBarEl = $('boss-hp-bar');
        const phaseEl = $('boss-phase-text');

        const maxHp = boss.maxHp || (boss.species && boss.species.maxHp) || 1;
        const ratio = Math.max(0, Math.min(1, boss.hp / maxHp));
        const pct = Math.round(ratio * 100);

        if (nameEl) nameEl.innerText = boss.species.name.toUpperCase();
        if (hpTextEl) hpTextEl.innerText = `${Math.round(boss.hp).toLocaleString()} / ${maxHp.toLocaleString()}`;
        if (hpBarEl) hpBarEl.style.width = `${pct}%`;

        const phase = ratio > 0.4 ? 'PHASE 1' : 'PHASE 2 — ENRAGED';
        if (phaseEl) {
            const dist = Math.round(Math.hypot(boss.x - state.player.x, boss.y - state.player.y));
            phaseEl.innerText = `${phase} · 📍 ${dist}m — follow the red arrow!`;
            phaseEl.className = ratio > 0.4
                ? 'text-[10px] text-amber-300 font-bold mt-1 tracking-wider'
                : 'text-[10px] text-rose-400 font-black mt-1 tracking-wider animate-pulse';
        }
    },

    updateMultiplayerHUD(info) {
        const statusEl = $('mp-status');
        const healEl = $('mp-heal-btn');
        const healCdEl = $('mp-heal-cooldown');

        if (statusEl) {
            if (info.isConnected) {
                statusEl.innerHTML = `<i class="fa-solid fa-circle text-emerald-400 animate-pulse mr-1"></i>${info.isHost ? 'Host' : 'Client'} · Room: ${info.roomCode}`;
                statusEl.className = 'text-emerald-400';
            } else {
                statusEl.innerHTML = `<i class="fa-solid fa-circle text-rose-400 mr-1"></i>Disconnected`;
                statusEl.className = 'text-rose-400';
            }
        }

        if (healEl && healCdEl) {
            if (info.healCooldown > 0) {
                healEl.disabled = true;
                healEl.innerHTML = `<i class="fa-solid fa-heart-pulse mr-1"></i>Heal (${info.healCooldown.toFixed(1)}s)`;
                healCdEl.style.width = `${(1 - info.healCooldown / 10) * 100}%`;
            } else if (info.healsRemaining > 0) {
                healEl.disabled = false;
                healEl.innerHTML = `<i class="fa-solid fa-heart-pulse mr-1"></i>Heal (${info.healsRemaining})`;
                healCdEl.style.width = '100%';
            } else {
                healEl.disabled = true;
                healEl.innerHTML = `<i class="fa-solid fa-heart-crack mr-1"></i>No Heals`;
                healCdEl.style.width = '0%';
            }
        }
    },

    addChatMessage(from, message, isHost) {
        const chatEl = $('mp-chat-messages');
        if (!chatEl) return;

        const div = document.createElement('div');
        div.className = 'text-xs';
        div.innerHTML = `<span class="font-bold ${isHost ? 'text-amber-400' : 'text-sky-400'}">${isHost ? 'Host' : 'Client'}:</span> <span class="text-slate-300">${message}</span>`;
        chatEl.appendChild(div);
        chatEl.scrollTop = chatEl.scrollHeight;

        while (chatEl.children.length > 20) {
            chatEl.removeChild(chatEl.firstChild);
        }
    }
};

// ==========================================
// CANVAS SETUP & RESIZING
// ==========================================
const canvas = $('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() {
    if (!canvas || !state) return;
    canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth : window.innerWidth;
    canvas.height = canvas.parentElement ? canvas.parentElement.clientHeight : window.innerHeight;
    state.canvasWidth = canvas.width;
    state.canvasHeight = canvas.height;
    state.waterBoundaryX = canvas.width * ((typeof CONFIG !== 'undefined' && CONFIG.WATER_BOUNDARY_RATIO) || 0.65);
}

// ==========================================
// GLOBAL ENGINE STATE
// ==========================================
const state = {
    player: {
        x: 300, y: 300,
        radius: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_RADIUS) || 16,
        speed: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_SPEED) || 220,
        hp: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_MAX_HP) || 100,
        maxHp: (typeof CONFIG !== 'undefined' && CONFIG.PLAYER_MAX_HP) || 100,

        equippedWeapons: ['pistol', null, null, null],
        activeSlot: 0,
        ownedWeapons: ['pistol'],

        weaponAmmo: { pistol: Infinity, shotgun: 20, rifle: 60, harpoon: 10 },
        equippedRod: (typeof RODS !== 'undefined' && RODS[0]) || { tensionMax: 100, luck: 0 },
        unlockedRods: ['rod_starter'],
        coins: 150,
        bucket: [],
        bucketCapacity: 15,
        caughtFish: [], // Fish index - tracks unique species caught

        lastShotTime: -999,
        weaponRecoil: 0,
        muzzleFlash: 0,
        reloading: false,
        reloadTimer: 0,

        xp: 0,
        level: 1,
        xpToNext: (typeof CONFIG !== 'undefined' && CONFIG.XP_LEVEL_BASE) || 100,
        facing: 1,

        stunTimer: 0,
        slowTimer: 0,
        burnTimer: 0,
        burnTick: 0
    },
    keys: {},
    mouse: { x: 0, y: 0, isDown: false, worldX: 0, worldY: 0 },
    camera: { x: 300, y: 300, zoom: 1.0, targetZoom: 1.0, shakeX: 0, shakeY: 0 },
    fishing: {
        mode: 'IDLE',
        castPower: 0,
        castDir: 1,
        bobber: { x: 0, y: 0 },
        lineTension: 0,
        hookedFish: null,
        biteTimer: 0,
        waitingTime: 0
    },
    activeBoss: null,
    monstersOnLand: [],
    groundHazards: [],
    bullets: [],
    delayedBlasts: [],
    particles: [],
    floatingTexts: [],
    groundLoot: [],
    waterBoundaryX: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    screenShake: 0,
    time: 0,

    paused: true,

    remotePlayer: null,
    remotePlayers: {},
    multiplayer: null
};

// Size the canvas now that `state` exists
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Init subsystems
if (typeof Input !== 'undefined' && canvas) Input.init(state, canvas);
if (typeof Shop !== 'undefined') Shop.init(state);

// Audio toggle
const audioBtn = $('btn-audio');
if (audioBtn) {
    audioBtn.onclick = () => {
        if (typeof audio !== 'undefined') {
            audio.muted = !audio.muted;
            const icon = $('audio-icon');
            if (icon) {
                icon.className = audio.muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
            }
        }
    };
}

// ==========================================
// MULTIPLAYER UI
// ==========================================
const MultiplayerUI = {
    currentPanel: 'main',
    state: null,

    init(state) {
        this.state = state;
        this.bindEvents();
    },

    bindEvents() {
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

        on('btn-multiplayer', () => this.showPanel('multiplayer'));
        on('btn-host',        () => this.hostGame());
        on('btn-join',        () => this.showPanel('join'));
        on('btn-mp-back',     () => this.showPanel('main'));
        on('btn-join-back',   () => this.showPanel('multiplayer'));
        on('btn-copy-room',   () => this.copyRoomCode());
        on('btn-leave-lobby', () => this.leaveLobby());
        on('btn-start-mp',    () => this.startMultiplayerGame());
        on('mp-heal-btn',     () => this.requestHeal());
        on('mp-exit-btn',     () => this.forceExitMultiplayer());

        const joinSubmit = $('btn-join-submit');
        const joinInput = $('join-room-code');
        if (joinSubmit) joinSubmit.onclick = () => this.joinGame(joinInput ? joinInput.value : '');
        if (joinInput) {
            joinInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.joinGame(joinInput.value);
            });
        }

        const chatToggle = $('mp-chat-toggle');
        const chatPanel = $('mp-chat-panel');
        if (chatToggle && chatPanel) {
            chatToggle.onclick = () => chatPanel.classList.toggle('hidden');
        }

        const chatSend = $('mp-chat-send');
        const chatInput = $('mp-chat-input');
        if (chatSend) chatSend.onclick = () => this.sendChat(chatInput ? chatInput.value : '');
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.sendChat(chatInput.value);
                    chatInput.value = '';
                }
            });
        }
    },

    showPanel(panel) {
        document.querySelectorAll('.mp-panel').forEach(p => p.classList.add('hidden'));
        const panelEl = $(`mp-panel-${panel}`);
        if (panelEl) panelEl.classList.remove('hidden');
        this.currentPanel = panel;
    },

    async hostGame() {
        if (!window.Multiplayer) {
            UI.updateStatusBanner('Multiplayer module not loaded', 'Error', 'rose');
            return;
        }

        this.showPanel('lobby');
        this.setLobbyStatus('Creating room...');
        this.renderLobbyPlayers(1, true);

        try {
            const roomCode = await window.Multiplayer.createRoom();
            this.setLobbyStatus(`Room created: ${roomCode} - Waiting for player...`);
            const codeEl = $('mp-room-code');
            if (codeEl) codeEl.innerText = roomCode;
            // Start stays disabled until Player 2 joins
            const startBtn = $('btn-start-mp');
            if (startBtn) startBtn.disabled = true;
        } catch (e) {
            this.setLobbyStatus(`Failed: ${e.message}`, 'rose');
            this.showPanel('multiplayer');
        }
    },

    async joinGame(roomCode) {
        if (!window.Multiplayer) {
            UI.updateStatusBanner('Multiplayer module not loaded', 'Error', 'rose');
            return;
        }

        if (!roomCode || roomCode.length !== 4) {
            this.setJoinStatus('Enter a 4-character room code', 'rose');
            return;
        }

        this.setJoinStatus('Connecting...');

        try {
            await window.Multiplayer.joinRoom(roomCode.toUpperCase());
            this.showPanel('lobby');
            this.setLobbyStatus(`Joined room: ${roomCode.toUpperCase()} - Waiting for host to start...`);
            const codeEl = $('mp-room-code');
            if (codeEl) codeEl.innerText = roomCode.toUpperCase();
            const startBtn = $('btn-start-mp');
            if (startBtn) startBtn.disabled = true;
            const cnt = (window.Multiplayer && window.Multiplayer._lobbyCount) || 2;
            this.renderLobbyPlayers(cnt, false);
        } catch (e) {
            this.setJoinStatus(`Failed: ${e.message}`, 'rose');
        }
    },

    renderLobbyPlayers(count, isHost) {
        const list = $('mp-lobby-players');
        const countEl = $('mp-lobby-count');
        count = Math.min(4, Math.max(1, count));
        if (countEl) countEl.innerText = `${count} / 4`;
        if (!list) return;
        const row = (name, badge, badgeCls, dot) => `
            <div class="flex items-center gap-2 glass-panel px-3 py-2 rounded-xl">
                <span class="w-2 h-2 rounded-full ${dot}"></span>
                <i class="fa-solid fa-user text-slate-400 text-xs"></i>
                <span class="text-xs font-bold text-white flex-1">${name}</span>
                <span class="px-1.5 py-0.5 rounded text-[9px] font-black ${badgeCls}">${badge}</span>
            </div>`;
        let html = row(
            isHost ? 'Player 1 (You)' : 'Player 1 (Host)',
            isHost ? 'HOST · YOU' : 'HOST',
            'bg-amber-500/20 text-amber-300 border border-amber-500/30',
            'bg-emerald-400 animate-pulse'
        );
        for (let i = 2; i <= 4; i++) {
            const filled = i <= count;
            const you = filled && !isHost && i === count;
            html += row(
                filled ? (you ? `Player ${i} (You)` : `Player ${i}`) : `Player ${i}`,
                filled ? (you ? 'YOU' : 'JOINED') : 'WAITING...',
                filled
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-700/60 text-slate-400 border border-slate-600',
                filled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
            );
        }
        list.innerHTML = html;
    },

    showLoading(text, sub) {
        const ov = $('mp-loading-overlay');
        if (!ov) return;
        const t = $('mp-loading-text');
        const s = $('mp-loading-sub');
        if (t && text) t.innerText = text;
        if (s && sub) s.innerText = sub;
        ov.classList.remove('hidden');
        ov.classList.add('flex');
    },

    hideLoading() {
        const ov = $('mp-loading-overlay');
        if (!ov) return;
        ov.classList.add('hidden');
        ov.classList.remove('flex');
    },

    setLobbyStatus(msg, theme = 'sky') {
        const el = $('mp-lobby-status');
        if (el) {
            el.innerText = msg;
            el.className = `text-sm font-bold ${theme === 'rose' ? 'text-rose-400' : theme === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`;
        }
    },

    setJoinStatus(msg, theme = 'sky') {
        const el = $('mp-join-status');
        if (el) {
            el.innerText = msg;
            el.className = `text-sm font-bold ${theme === 'rose' ? 'text-rose-400' : theme === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`;
        }
    },

    copyRoomCode() {
        const codeEl = $('mp-room-code');
        if (!codeEl) return;
        const code = codeEl.innerText;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(() => {
                this.setLobbyStatus('Room code copied!', 'emerald');
                setTimeout(() => this.setLobbyStatus(`Room: ${code} - Waiting for player...`), 1500);
            }).catch(() => this.setLobbyStatus('Copy failed — select manually.', 'rose'));
        } else {
            this.setLobbyStatus('Clipboard unavailable — select manually.', 'rose');
        }
    },

    leaveLobby() {
        this.hideLoading();
        if (window.Multiplayer) window.Multiplayer.leaveRoom();
        this.showPanel('multiplayer');
    },

    async startMultiplayerGame() {
        if (!window.Multiplayer || !window.Multiplayer.isHost) return;
        // Loading on the host screen while the client is pulled in
        this.showLoading('STARTING...', 'Waiting for Player 2');
        if (typeof MainMenu !== 'undefined') MainMenu.hide();
        this.showInGameHUD();
        // Host sim stays authoritative — start pushing world state now
        if (window.Multiplayer.startStateSync) window.Multiplayer.startStateSync();
        const acked = await window.Multiplayer.sendGameStartWithRetry();
        this.hideLoading();
        if (acked) {
            this.setLobbyStatus('Player 2 is in!', 'emerald');
            UI.updateStatusBanner('Player 2 joined the hunt!', 'Start', 'emerald');
        } else {
            UI.updateStatusBanner('Started without Player 2 ack — they may still be loading', 'Start', 'amber');
        }
    },

    showInGameHUD() {
        const hud = $('mp-hud');
        if (hud) hud.classList.remove('hidden');
    },

    hideInGameHUD() {
        const hud = $('mp-hud');
        if (hud) hud.classList.add('hidden');
    },

    forceExitMultiplayer() {
        this.hideLoading();
        if (window.Multiplayer) {
            window.Multiplayer.cleanup();
        }
        this.hideInGameHUD();
        if (typeof MainMenu !== 'undefined') MainMenu.show();
        UI.updateStatusBanner('Left multiplayer session (Emergency Exit)', 'Exit', 'amber');
    },

    requestHeal() {
        if (window.Multiplayer) window.Multiplayer.requestHeal('all');
    },

    sendChat(message) {
        if (!message || !message.trim()) return;
        if (window.Multiplayer) window.Multiplayer.sendChat(message);
        const input = $('mp-chat-input');
        if (input) input.value = '';
    },

    updateHUD() {
        if (window.Multiplayer) {
            const info = window.Multiplayer.getConnectionInfo();
            UI.updateMultiplayerHUD(info);
        }
    },

    onChatMessage(from, message, isHost) {
        UI.addChatMessage(from, message, isHost);
    },

    onHealReceived(amount, isSelf) {
        if (isSelf) {
            UI.updateStatusBanner(`You were healed for ${amount} HP!`, 'Heal', 'emerald');
        } else {
            UI.updateStatusBanner(`Your partner healed you for ${amount} HP!`, 'Heal', 'emerald');
        }
    },

    onPlayerJoined() {
        const cnt = (window.Multiplayer && window.Multiplayer._lobbyCount) || 2;
        this.setLobbyStatus(`Player joined! (${cnt}/4) Ready to start.`, 'emerald');
        this.renderLobbyPlayers(cnt, true);
        const startBtn = $('btn-start-mp');
        if (startBtn) startBtn.disabled = false;
    },

    onPlayerLeft() {
        const cnt = (window.Multiplayer && window.Multiplayer._lobbyCount) || 1;
        this.setLobbyStatus(`Player left. (${cnt}/4) Waiting for players...`, 'rose');
        this.renderLobbyPlayers(cnt, true);
        const startBtn = $('btn-start-mp');
        if (startBtn) startBtn.disabled = cnt < 2;
    }
};

// ==========================================
// FISH INDEX
// ==========================================
const FishIndex = {
    currentFilter: 'all',
    ingameFilter: 'all',

    init(state) {
        this.state = state;
        this.bindEvents();
    },

    bindEvents() {
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

        on('btn-fish-index', () => this.show());
        on('btn-fish-index-back', () => this.hide());
        on('btn-achievements', () => this.showAchievements());
        on('btn-open-index', () => this.openInGame());
        on('btn-index-close', () => this.closeInGame());

        // Menu filter buttons
        document.querySelectorAll('.fish-filter-btn').forEach(btn => {
            btn.onclick = () => {
                this.currentFilter = btn.dataset.filter;
                document.querySelectorAll('.fish-filter-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                    b.classList.toggle('bg-fuchsia-500', b === btn);
                    b.classList.toggle('text-white', b === btn);
                    if (b !== btn) {
                        b.classList.add('bg-slate-800/50', 'text-slate-300');
                        b.classList.remove('bg-fuchsia-500', 'text-white');
                    }
                });
                this.renderGrid();
            };
        });

        // In-game modal filter buttons
        document.querySelectorAll('.index-filter-btn').forEach(btn => {
            btn.onclick = () => {
                this.ingameFilter = btn.dataset.filter;
                document.querySelectorAll('.index-filter-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                    b.classList.toggle('bg-fuchsia-500', b === btn);
                    b.classList.toggle('text-white', b === btn);
                    if (b !== btn) {
                        b.classList.add('bg-slate-800/50');
                        b.classList.remove('bg-fuchsia-500', 'text-white');
                    }
                });
                this.renderInGame();
            };
        });
    },

    // ---- In-game modal (no need to visit the menu) ----
    openInGame() {
        const modal = $('index-modal');
        if (!modal) return;
        try { audio.playUIClick(); } catch (e) {}
        this.renderInGame();
        modal.classList.remove('hidden');
    },

    closeInGame() {
        const modal = $('index-modal');
        if (modal) modal.classList.add('hidden');
    },

    toggleInGame() {
        const modal = $('index-modal');
        if (!modal) return;
        if (modal.classList.contains('hidden')) this.openInGame();
        else this.closeInGame();
    },

    renderInGame() {
        const grid = $('index-grid-ingame');
        if (!grid) return;
        const caught = (this.state.player.caughtFish || []).filter(f => FISH_SPECIES.some(s => s.id === f.id));
        const caughtIds = new Set(caught.map(f => f.id));
        const species = this._filteredSpecies(this.ingameFilter, caughtIds);
        grid.innerHTML = species.map(fish => this._cardHTML(fish, caughtIds.has(fish.id))).join('');
        this._paintModels(grid);
        const total = FISH_SPECIES.filter(f => !f.isBoss).length;
        const countEl = $('index-count-ingame');
        const progressEl = $('index-progress-ingame');
        if (countEl) countEl.innerText = `${caught.length} / ${total}`;
        if (progressEl) progressEl.style.width = `${total > 0 ? (caught.length / total * 100).toFixed(1) : 0}%`;
    },

    _filteredSpecies(filter, caughtIds) {
        let species = FISH_SPECIES.filter(f => !f.isBoss);
        if (filter && filter !== 'all') species = species.filter(f => f.rarity === filter);
        const rarityOrder = { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, boss: 6 };
        species.sort((a, b) => {
            const aCaught = caughtIds.has(a.id);
            const bCaught = caughtIds.has(b.id);
            if (aCaught !== bCaught) return aCaught ? -1 : 1;
            return (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0);
        });
        return species;
    },

    _cardHTML(fish, isCaught) {
        return `
            <div class="fish-index-card relative glass-panel p-3 rounded-xl border-2 ${!isCaught ? 'border-slate-700/60 opacity-50' : ''} transition-all hover:scale-[1.02] cursor-pointer"
                 data-fish-id="${fish.id}"
                 style="${!isCaught ? 'filter: grayscale(1);' : ''}">
                <div class="w-full aspect-square relative mb-2">
                    <canvas class="w-full h-full" data-fish-model="${fish.id}" width="80" height="80"></canvas>
                    ${!isCaught ? '<div class="absolute inset-0 bg-slate-900/80 flex items-center justify-center"><i class="fa-solid fa-question text-2xl text-slate-600"></i></div>' : ''}
                    <div class="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${this._getRarityBadgeClass(fish.rarity)}">${fish.rarity}</div>
                </div>
                <div class="text-center">
                    <div class="font-bold text-xs text-white truncate">${isCaught ? fish.name : '???'}</div>
                    <div class="text-[9px] text-slate-400">${isCaught ? fish.value + ' coins' : 'Undiscovered'}</div>
                </div>
            </div>
        `;
    },

    _paintModels(grid) {
        setTimeout(() => {
            grid.querySelectorAll('canvas[data-fish-model]').forEach(canvas => {
                const fishId = canvas.dataset.fishModel;
                const fish = FISH_SPECIES.find(f => f.id === fishId);
                if (fish) {
                    const ctx = canvas.getContext('2d');
                    const size = Math.min(canvas.width, canvas.height) * 0.4;
                    Render.drawFishModel(ctx, canvas.width / 2, canvas.height / 2, size, fish, { angle: -0.3 });
                }
            });
        }, 0);
    },
    
    show() {
        this.renderGrid();
        this.updateProgress();
        this.showPanel('fish-index');
    },
    
    hide() {
        this.showPanel('main');
    },
    
    showPanel(panel) {
        const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-fish-index', 'mp-panel-achievements'];
        panels.forEach(id => {
            const el = $(id);
            if (el) el.classList.add('hidden');
        });
        const target = $(`mp-panel-${panel}`);
        if (target) target.classList.remove('hidden');
    },
    
    showAchievements() {
        this.showPanel('achievements');
        if (typeof Achievements !== 'undefined') {
            Achievements.renderPanel($('achievements-container'));
        }
    },
    
    updateProgress() {
        const caught = (this.state.player.caughtFish || []).filter(f => FISH_SPECIES.some(s => s.id === f.id));
        const total = FISH_SPECIES.filter(f => !f.isBoss).length;
        const countEl = $('fish-index-count');
        const progressEl = $('fish-index-progress');
        
        if (countEl) countEl.innerText = `${caught.length} / ${total}`;
        if (progressEl) progressEl.style.width = `${total > 0 ? (caught.length / total * 100).toFixed(1) : 0}%`;
    },
    
    renderGrid() {
        const grid = $('fish-index-grid');
        if (!grid) return;

        const caught = (this.state.player.caughtFish || []).filter(f => FISH_SPECIES.some(s => s.id === f.id));
        const caughtIds = new Set(caught.map(f => f.id));
        const species = this._filteredSpecies(this.currentFilter, caughtIds);

        grid.innerHTML = species.map(fish => this._cardHTML(fish, caughtIds.has(fish.id))).join('');
        this._paintModels(grid);
    },
    
    _getTailwindColor(rarity) {
        const map = { common: 'slate', rare: 'sky', epic: 'fuchsia', legendary: 'amber', mythic: 'yellow' };
        return map[rarity] || 'slate';
    },
    
    _getRarityBadgeClass(rarity) {
        const map = {
            common: 'bg-slate-700 text-slate-300',
            rare: 'bg-sky-900/50 text-sky-300 border border-sky-500/30',
            epic: 'bg-fuchsia-900/50 text-fuchsia-300 border border-fuchsia-500/30',
            legendary: 'bg-amber-900/50 text-amber-300 border border-amber-500/30',
            mythic: 'bg-yellow-900/50 text-yellow-300 border border-yellow-500/30'
        };
        return map[rarity] || map.common;
    }
};

// Make globally available
window.FishIndex = FishIndex;
const MainMenu = {
    show() {
        const menu = $('main-menu');
        if (menu) menu.classList.remove('hidden');

        const setHidden = (id, hidden) => {
            const el = $(id);
            if (el) el.classList.toggle('hidden', hidden);
        };

        setHidden('mp-panel-main', false);
        setHidden('mp-panel-multiplayer', true);
        setHidden('mp-panel-join', true);
        setHidden('mp-panel-lobby', true);
        setHidden('menu-about', true);
        setHidden('mp-panel-fish-index', true);

        state.paused = true;

        // Refresh Continue button state
        const contBtn = $('btn-load');
        if (contBtn) {
            const hasSave = (typeof SaveSystem !== 'undefined') && SaveSystem.exists();
            contBtn.disabled = !hasSave;
            const span = contBtn.querySelector('span');
            if (span) span.innerText = hasSave ? 'Continue' : 'No Save Found';
        }
    },

    hide() {
        const menu = $('main-menu');
        if (menu) menu.classList.add('hidden');
        state.paused = false;
    },

    init(state) {
        const self = this;
        const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

        on('btn-start', () => {
            if (typeof SaveSystem !== 'undefined') SaveSystem.wipe();
            self.hide();
            UI.updateStatusBanner('New game started. Cast your line!', 'Start', 'emerald');
        });

        on('btn-load', () => {
            if (typeof SaveSystem === 'undefined') return;
            const ok = SaveSystem.load(state);
            if (ok) {
                if (typeof Player !== 'undefined') {
                    if (typeof Player.initWeaponAmmo === 'function') Player.initWeaponAmmo(state);
                    Player.refreshHUD(state);
                    Player.refreshWeaponHUD(state);
                }
                UI.renderWeaponToolbar(state);
                UI.refreshLuckDisplay(state);
                self.hide();
                UI.updateStatusBanner('Progress loaded.', 'Loaded', 'emerald');
            } else {
                UI.updateStatusBanner('No save found.', 'Load', 'rose');
            }
        });

        on('btn-save-menu', () => {
            if (typeof SaveSystem === 'undefined') return;
            const ok = SaveSystem.save(state);
            UI.updateStatusBanner(
                ok ? 'Progress saved.' : 'Save failed.',
                'Save', ok ? 'emerald' : 'rose'
            );
        });

        on('btn-about', () => {
            const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'mp-panel-fish-index'];
            panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
            const about = $('menu-about');
            if (about) about.classList.remove('hidden');
        });

        on('btn-about-back', () => {
            const about = $('menu-about');
            const main = $('mp-panel-main');
            if (about) about.classList.add('hidden');
            if (main) main.classList.remove('hidden');
        });

        // Fish Index button
        on('btn-fish-index', () => {
            const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-achievements'];
            panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
            const fishIndex = $('mp-panel-fish-index');
            if (fishIndex) fishIndex.classList.remove('hidden');
            if (typeof FishIndex !== 'undefined') FishIndex.show();
        });

        // Achievements button
        on('btn-achievements', () => {
            const panels = ['mp-panel-main', 'mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-fish-index'];
            panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
            const achievements = $('mp-panel-achievements');
            if (achievements) achievements.classList.remove('hidden');
            if (typeof Achievements !== 'undefined') Achievements.renderPanel($('achievements-container'));
        });

        // Menu button in HUD
        const hudMenuBtn = $('btn-menu');
        if (hudMenuBtn) hudMenuBtn.onclick = () => self.show();

        // ESC opens the menu
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const shop = $('shop-modal');
                if (shop && !shop.classList.contains('hidden')) {
                    shop.classList.add('hidden');
                    return;
                }
                const indexModal = $('index-modal');
                if (indexModal && !indexModal.classList.contains('hidden')) {
                    indexModal.classList.add('hidden');
                    return;
                }
                const casinoModal = $('casino-modal');
                if (casinoModal && !casinoModal.classList.contains('hidden')) {
                    casinoModal.classList.add('hidden');
                    return;
                }
                const menu = $('main-menu');
                if (menu && !menu.classList.contains('hidden')) {
                    const main = $('mp-panel-main');
                    const mpMain = $('mp-panel-multiplayer');
                    const fishIdx = $('mp-panel-fish-index');
                    const achieveIdx = $('mp-panel-achievements');
                    const about = $('menu-about');
                    if (main && !main.classList.contains('hidden') &&
                        mpMain && !mpMain.classList.contains('hidden') &&
                        fishIdx && fishIdx.classList.contains('hidden') &&
                        achieveIdx && achieveIdx.classList.contains('hidden') &&
                        about && about.classList.contains('hidden')) {
                        self.hide();
                    } else {
                        // Close sub-panels, show main
                        const panels = ['mp-panel-multiplayer', 'mp-panel-join', 'mp-panel-lobby', 'menu-about', 'mp-panel-fish-index', 'mp-panel-achievements'];
                        panels.forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
                        if (main) main.classList.remove('hidden');
                    }
                } else {
                    self.show();
                }
            }
        });

        // Open the menu on boot
        self.show();
    }
};

// ==========================================
// SAVE SYSTEM BOOT
// ==========================================
let loadedFromSave = false;
if (typeof SaveSystem !== 'undefined') {
    loadedFromSave = SaveSystem.load(state);
}

if (typeof Player !== 'undefined' && typeof Player.initWeaponAmmo === 'function') {
    Player.initWeaponAmmo(state);
}

// Init Menu Background Animation
if (typeof MenuBackground !== 'undefined') MenuBackground.init();

// Init the menu (this also shows it)
if (typeof MainMenu !== 'undefined') MainMenu.init(state);

// Init Fish Index
if (typeof FishIndex !== 'undefined') FishIndex.init(state);

// Init Casino
if (typeof Casino !== 'undefined') Casino.init(state);

// Init Enemy Spawner
if (typeof EnemySpawner !== 'undefined') EnemySpawner.init(state);

// Init Achievements
if (typeof Achievements !== 'undefined') Achievements.init(state);

// Init AntiCheat (console tamper guard)
if (typeof AntiCheat !== 'undefined') AntiCheat.init(state);

// Apply armor stats from save
if (typeof Shop !== 'undefined' && Shop.applyArmorStats) {
    try { Shop.applyArmorStats(state); } catch (e) {}
}

// Init Multiplayer UI
if (typeof MultiplayerUI !== 'undefined') MultiplayerUI.init(state);

// Initialize Multiplayer system
if (typeof Multiplayer !== 'undefined') {
    Multiplayer.init(state, {
        onStatusChange: (msg) => {
            if (MultiplayerUI.currentPanel === 'lobby') {
                MultiplayerUI.setLobbyStatus(msg);
            }
        },
        onChatMessage: (from, message, isHost) => {
            MultiplayerUI.onChatMessage(from, message, isHost);
        },
        onHealReceived: (amount, isSelf) => {
            MultiplayerUI.onHealReceived(amount, isSelf);
        },
        onPlayerJoined: () => {
            MultiplayerUI.onPlayerJoined();
        },
        onPlayerLeft: () => {
            MultiplayerUI.onPlayerLeft();
        },
        onGameStart: () => {
            // Client receives game start signal: loading on ALL screens,
            // then enter the game and pull the host's world state.
            if (typeof MultiplayerUI !== 'undefined') {
                MultiplayerUI.showLoading('JOINING...', 'Syncing with host');
            }
            setTimeout(() => {
                if (typeof MainMenu !== 'undefined') MainMenu.hide();
                if (typeof MultiplayerUI !== 'undefined') {
                    MultiplayerUI.showInGameHUD();
                    MultiplayerUI.hideLoading();
                }
                UI.updateStatusBanner('Multiplayer game started!', 'Start', 'emerald');

                // Ack so the host's loading screen can clear
                if (window.Multiplayer) {
                    if (window.Multiplayer.sendGameStartAck) window.Multiplayer.sendGameStartAck();
                    if (window.Multiplayer.sendSyncRequest) window.Multiplayer.sendSyncRequest();
                }
            }, 1500);
        },
        onError: (msg) => {
            UI.updateStatusBanner(msg, 'Error', 'rose');
        }
    });
    state.multiplayer = Multiplayer;
}

// ==========================================
// MAIN GAME LOOP
// ==========================================
let lastTime = performance.now();

function mainLoop(time) {
    const delta = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;

    // If paused (menu open), skip simulation but still render
    if (state.paused) {
        if (typeof Render !== 'undefined' && Render.drawWorld && ctx) {
            Render.drawWorld(state, ctx);
        }
        if (typeof MultiplayerUI !== 'undefined') {
            MultiplayerUI.updateHUD();
        }
        requestAnimationFrame(mainLoop);
        return;
    }

    state.time += delta;

    if (state.screenShake > 0) {
        state.camera.shakeX = (Math.random() - 0.5) * state.screenShake * 2;
        state.camera.shakeY = (Math.random() - 0.5) * state.screenShake * 2;
        state.screenShake = Math.max(0, state.screenShake - delta * 25);
    } else {
        state.camera.shakeX = 0;
        state.camera.shakeY = 0;
    }

    if (typeof Camera !== 'undefined') Camera.update(state, delta);
    if (typeof Input !== 'undefined') Input.updateMouseWorld(state);
    if (typeof Player !== 'undefined') Player.update(state, delta);
    if (typeof Fishing !== 'undefined') Fishing.update(state, delta);
    if (typeof WeaponSystem !== 'undefined') WeaponSystem.update(state, delta);
    if (typeof Combat !== 'undefined') Combat.update(state, delta);
    if (typeof Particles !== 'undefined') Particles.update(state, delta);

    // Update enemies
    if (typeof EnemySpawner !== 'undefined') EnemySpawner.update(delta);

    // Update multiplayer
    if (typeof Multiplayer !== 'undefined' && state.multiplayer) {
        state.multiplayer.update(delta);

        if (state.multiplayer.isConnected && !state.multiplayer.isHost) {
            const input = {
                keys: { ...state.keys },
                mouse: {
                    x: state.mouse.x,
                    y: state.mouse.y,
                    worldX: state.mouse.worldX,
                    worldY: state.mouse.worldY,
                    isDown: state.mouse.isDown
                },
                player: {
                    x: state.player.x,
                    y: state.player.y,
                    hp: state.player.hp,
                    maxHp: state.player.maxHp,
                    facing: state.player.facing,
                    activeSlot: state.player.activeSlot,
                    equippedWeapons: [...state.player.equippedWeapons]
                }
            };
            state.multiplayer.sendInput(input);
        }

        if (typeof MultiplayerUI !== 'undefined') {
            MultiplayerUI.updateHUD();
        }
    }

    if (typeof Render !== 'undefined' && Render.drawWorld && ctx) {
        Render.drawWorld(state, ctx);
    }

    // Render remote players (either side) whenever snapshots exist —
    // no longer gated on the WebRTC flag, so signaling fallback works too
    const hasRemotes = state.remotePlayer ||
        (state.remotePlayers && Object.keys(state.remotePlayers).length > 0);
    if (typeof Multiplayer !== 'undefined' && state.multiplayer && hasRemotes) {
        if (typeof Multiplayer.renderRemotePlayer === 'function') {
            Multiplayer.renderRemotePlayer(ctx);
        }
    }

    UI.updateBossBar(state);
    UI.renderStatusEffectsHUD(state);

    // World SHOP / CASINO zone prompt (double-circle pads on the beach)
    const beachIndicator = $('beach-shop-indicator');
    if (beachIndicator) {
        let prompt = null;
        if (typeof Render !== 'undefined' && Render.nearestShopZone) {
            const near = Render.nearestShopZone(state);
            if (near && near.dist < near.zone.radius + 60) {
                prompt = near.zone.id === 'casino' ? 'CASINO' : 'SHOP';
            }
        }
        if (!prompt && state.player.x >= state.waterBoundaryX - 100 && !state.player.beachShopUnlocked) prompt = 'SHOP';
        if (prompt) {
            beachIndicator.classList.remove('hidden');
            const label = beachIndicator.querySelector('span');
            if (label) label.innerHTML = `Press <kbd class="bg-slate-800 px-2 py-1 rounded text-xs">E</kbd> to open ${prompt}`;
        } else {
            beachIndicator.classList.add('hidden');
        }
    }

    // Survival time tracking (for achievement)
    if (!state.paused && state.player.hp > 0) {
        state.player.survivalTime = (state.player.survivalTime || 0) + delta;
        if (state.player.survivalTime >= 3600 && typeof Achievements !== 'undefined') {
            Achievements.checkSurvival(state, state.player.survivalTime);
        }
    }

    requestAnimationFrame(mainLoop);
}

// Boot-time HUD refresh
if (typeof Player !== 'undefined') {
    Player.refreshHUD(state);
    Player.refreshWeaponHUD(state);
}
UI.renderWeaponToolbar(state);
UI.refreshLuckDisplay(state);

requestAnimationFrame(mainLoop);

// ==========================================
// AUTOSAVE + HOTKEYS
// ==========================================
if (typeof SaveSystem !== 'undefined') {
    setInterval(() => {
        if (!state.paused) SaveSystem.save(state);
    }, 30000);

    window.addEventListener('beforeunload', () => {
        if (!state.paused) SaveSystem.save(state);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && !state.paused) SaveSystem.save(state);
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'F9') {
            e.preventDefault();
            const ok = SaveSystem.save(state);
            if (typeof Particles !== 'undefined' && Particles.showFloatingText) {
                Particles.showFloatingText(state,
                    ok ? "Progress saved!" : "Save failed!",
                    state.player.x, state.player.y - 40,
                    ok ? '#34d399' : '#f87171');
            }
            UI.updateStatusBanner(
                ok ? 'Progress saved to disk.' : 'Save failed.',
                'Save', ok ? 'emerald' : 'rose');
        }

        // Multiplayer hotkeys
        if (e.key === 'h' && !state.paused && state.multiplayer && state.multiplayer.isConnected) {
            e.preventDefault();
            state.multiplayer.requestHeal('all');
        }

        if (e.key === 'Enter' && !state.paused && state.multiplayer && state.multiplayer.isConnected) {
            const chatInput = $('mp-chat-input');
            if (chatInput && document.activeElement !== chatInput) {
                chatInput.focus();
            }
        }
    });
}