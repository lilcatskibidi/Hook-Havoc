const Render = {
    drawWorld(state, ctx) {
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        Camera.apply(state, ctx);

        this.drawLand(state, ctx);
        this.drawWater(state, ctx);
        this.drawWorldBorder(state, ctx);
        this.drawShoreFoam(state, ctx);
        this.drawDelayedBlasts(state, ctx);
        this.drawGroundLoot(state, ctx);
        this.drawBobber(state, ctx);
        this.drawHookedFish(state, ctx);
        this.drawLandMonsters(state, ctx);
        this.drawBullets(state, ctx);
        this.drawPlayer(state, ctx);
        this.drawParticles(state, ctx);
        this.drawFloatingTexts(state, ctx);

        ctx.restore();

        this.drawCrosshair(state, ctx);
        const zoomEl = document.getElementById('zoom-level');
        if (zoomEl) zoomEl.innerText = state.camera.zoom.toFixed(1) + 'x';
    },

    drawLand(state, ctx) {
        const w = state.waterBoundaryX;
        const B = CONFIG.WORLD;
        const t = state.time;

        const beachStart = B.MIN_X - 500;
        const beachEnd   = w;
        const beachTop   = B.MIN_Y - 500;
        const beachBot   = B.MAX_Y + 500;

        const dryGrad = ctx.createLinearGradient(0, beachTop, 0, beachBot);
        dryGrad.addColorStop(0.00, '#a07a4d');
        dryGrad.addColorStop(0.15, '#c99b63');
        dryGrad.addColorStop(0.45, '#e6bd82');
        dryGrad.addColorStop(0.80, '#d8a96d');
        dryGrad.addColorStop(1.00, '#b98a54');
        ctx.fillStyle = dryGrad;
        ctx.fillRect(beachStart, beachTop, beachEnd - beachStart, beachBot - beachTop);

        const tideWobble = Math.sin(t * 0.35) * 12 + Math.sin(t * 0.8) * 6;
        const wetWidthBase = 140;
        const wetStart = w - wetWidthBase - tideWobble;
        const wetEnd   = w + 20;

        const wetGrad = ctx.createLinearGradient(wetStart, 0, wetEnd, 0);
        wetGrad.addColorStop(0.00, 'rgba(180,140,90,0)');
        wetGrad.addColorStop(0.35, 'rgba(150,115,75,0.55)');
        wetGrad.addColorStop(0.70, 'rgba(120,90,60,0.85)');
        wetGrad.addColorStop(1.00, 'rgba(90,70,50,0.95)');
        ctx.fillStyle = wetGrad;
        ctx.fillRect(wetStart, beachTop, wetEnd - wetStart, beachBot - beachTop);

        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#7cb0c9';
        for (let px = B.MIN_X; px < w; px += 420) {
            for (let py = B.MIN_Y; py < B.MAX_Y; py += 380) {
                const seedX = px * 0.913 + py * 0.417;
                const seedY = py * 0.731 + px * 0.223;
                const rx = 30 + (Math.sin(seedX) * 0.5 + 0.5) * 45;
                const ry = 12 + (Math.cos(seedY) * 0.5 + 0.5) * 18;
                const cx = px + ((Math.sin(seedX * 2.1) * 0.5 + 0.5) * 200);
                const cy = py + ((Math.cos(seedY * 1.9) * 0.5 + 0.5) * 180);
                if (cx > w - 320 && cx < w - 20) {
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, rx, ry, Math.sin(seedX) * 0.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.18;
        const grainStep = 14;
        for (let gx = beachStart; gx < beachEnd; gx += grainStep) {
            for (let gy = beachTop; gy < beachBot; gy += grainStep) {
                const h1 = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
                const h2 = Math.sin(gx * 39.346 + gy * 11.135) * 24634.6345;
                const ox = (h1 - Math.floor(h1)) * grainStep;
                const oy = (h2 - Math.floor(h2)) * grainStep;
                const shade = (h1 - Math.floor(h1)) > 0.5 ? '#8a6a42' : '#f0d6a5';
                ctx.fillStyle = shade;
                ctx.fillRect(gx + ox, gy + oy, 1.2, 1.2);
            }
        }
        ctx.restore();

        ctx.save();
        for (let px = B.MIN_X; px < w; px += 260) {
            for (let py = B.MIN_Y; py < B.MAX_Y; py += 240) {
                const h = Math.sin(px * 0.317 + py * 0.921) * 61728.35;
                const r = h - Math.floor(h);
                if (r < 0.25) {
                    const cx = px + r * 200;
                    const cy = py + (Math.sin(px * 5.3 + py * 3.1) * 0.5 + 0.5) * 180;
                    const kind = Math.floor(r * 100) % 3;
                    if (kind === 0) {
                        ctx.fillStyle = '#f5e6d0';
                        ctx.beginPath();
                        ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(200,170,130,0.7)';
                        ctx.lineWidth = 0.6;
                        ctx.stroke();
                    } else if (kind === 1) {
                        ctx.fillStyle = '#7e6a58';
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, 3, 2.2, r * 6, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.strokeStyle = '#6b4f34';
                        ctx.lineWidth = 1.4;
                        ctx.beginPath();
                        ctx.moveTo(cx - 4, cy);
                        ctx.lineTo(cx + 4, cy + 1);
                        ctx.stroke();
                    }
                }
            }
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.35;
        const duneGrad = ctx.createLinearGradient(0, B.MIN_Y - 200, 0, B.MIN_Y + 120);
        duneGrad.addColorStop(0, 'rgba(60,40,25,0.65)');
        duneGrad.addColorStop(1, 'rgba(60,40,25,0)');
        ctx.fillStyle = duneGrad;
        ctx.fillRect(beachStart, B.MIN_Y - 200, beachEnd - beachStart, 320);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.10;
        ctx.strokeStyle = '#7e5c37';
        ctx.lineWidth = 1;
        for (let y = B.MIN_Y + 40; y < B.MAX_Y; y += 22) {
            ctx.beginPath();
            for (let x = B.MIN_X; x < w - 40; x += 24) {
                const wy = y + Math.sin(x * 0.02 + y * 0.05 + t * 0.4) * 2;
                if (x === B.MIN_X) ctx.moveTo(x, wy);
                else ctx.lineTo(x, wy);
            }
            ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        const sun = ctx.createRadialGradient(
            w * 0.45, B.MIN_Y + (B.MAX_Y - B.MIN_Y) * 0.4, 50,
            w * 0.45, B.MIN_Y + (B.MAX_Y - B.MIN_Y) * 0.4, 900
        );
        sun.addColorStop(0, 'rgba(255, 230, 170, 0.20)');
        sun.addColorStop(1, 'rgba(255, 230, 170, 0)');
        ctx.fillStyle = sun;
        ctx.fillRect(beachStart, beachTop, beachEnd - beachStart, beachBot - beachTop);
        ctx.restore();
    },

    drawWater(state, ctx) {
        const w = state.waterBoundaryX;
        const B = CONFIG.WORLD;
        const t = state.time;

        const grad = ctx.createLinearGradient(w, 0, B.MAX_X + 2000, 0);
        grad.addColorStop(0, '#0c4a6e');
        grad.addColorStop(0.3, '#075985');
        grad.addColorStop(1, '#082f49');
        ctx.fillStyle = grad;
        ctx.fillRect(w, B.MIN_Y - 500, (B.MAX_X - w) + 2000, (B.MAX_Y - B.MIN_Y) + 1000);

        const depthGrad = ctx.createLinearGradient(0, B.MIN_Y, 0, B.MAX_Y);
        depthGrad.addColorStop(0, 'rgba(2,132,199,0.15)');
        depthGrad.addColorStop(1, 'rgba(2,6,23,0.5)');
        ctx.fillStyle = depthGrad;
        ctx.fillRect(w, B.MIN_Y - 500, (B.MAX_X - w) + 2000, (B.MAX_Y - B.MIN_Y) + 1000);

        ctx.strokeStyle = 'rgba(125,211,252,0.12)';
        ctx.lineWidth = 1.5;
        for (let x = w + 30; x < B.MAX_X + 200; x += 70) {
            for (let y = B.MIN_Y - 100; y < B.MAX_Y + 200; y += 70) {
                ctx.beginPath();
                ctx.arc(
                    x + Math.sin(t * 1.5 + y * 0.02) * 12,
                    y + Math.cos(t * 1.2 + x * 0.02) * 8,
                    18, 0, Math.PI
                );
                ctx.stroke();
            }
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 8; i++) {
            const rx = w + 100 + i * 180;
            if (rx > B.MAX_X + 200) break;
            const rayGrad = ctx.createLinearGradient(rx, 0, rx + 60, B.MAX_Y);
            rayGrad.addColorStop(0, 'rgba(125,211,252,0.08)');
            rayGrad.addColorStop(1, 'rgba(125,211,252,0)');
            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(rx, B.MIN_Y - 100);
            ctx.lineTo(rx + 80, B.MIN_Y - 100);
            ctx.lineTo(rx + 200, B.MAX_Y + 100);
            ctx.lineTo(rx + 120, B.MAX_Y + 100);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    },

    drawWorldBorder(state, ctx) {
        const B = CONFIG.WORLD;
        const t = state.time;

        if (B.SHOW_GRID) {
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = B.MIN_X; x <= B.MAX_X; x += B.GRID_SIZE) {
                ctx.moveTo(x, B.MIN_Y);
                ctx.lineTo(x, B.MAX_Y);
            }
            for (let y = B.MIN_Y; y <= B.MAX_Y; y += B.GRID_SIZE) {
                ctx.moveTo(B.MIN_X, y);
                ctx.lineTo(B.MAX_X, y);
            }
            ctx.stroke();
            ctx.restore();
        }

        const stripeOffset = (t * 40) % 40;

        const drawEdge = (x1, y1, x2, y2) => {
            const len = Math.hypot(x2 - x1, y2 - y1);
            const angle = Math.atan2(y2 - y1, x2 - x1);

            ctx.save();
            ctx.translate(x1, y1);
            ctx.rotate(angle);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(0, -B.BORDER_THICKNESS / 2, len, B.BORDER_THICKNESS);

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, -B.BORDER_THICKNESS / 2, len, B.BORDER_THICKNESS);
            ctx.clip();

            for (let i = -B.BORDER_THICKNESS; i < len + B.BORDER_THICKNESS; i += 40) {
                ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
                ctx.save();
                ctx.translate(i + stripeOffset, 0);
                ctx.beginPath();
                ctx.moveTo(0, -B.BORDER_THICKNESS / 2);
                ctx.lineTo(20, -B.BORDER_THICKNESS / 2);
                ctx.lineTo(20 - B.BORDER_THICKNESS, B.BORDER_THICKNESS / 2);
                ctx.lineTo(0 - B.BORDER_THICKNESS, B.BORDER_THICKNESS / 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();

            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = B.BORDER_GLOW;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -B.BORDER_THICKNESS / 2);
            ctx.lineTo(len, -B.BORDER_THICKNESS / 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, B.BORDER_THICKNESS / 2);
            ctx.lineTo(len, B.BORDER_THICKNESS / 2);
            ctx.stroke();

            ctx.restore();
        };

        drawEdge(B.MIN_X, B.MIN_Y, B.MAX_X, B.MIN_Y);
        drawEdge(B.MIN_X, B.MAX_Y, B.MAX_X, B.MAX_Y);
        drawEdge(B.MIN_X, B.MIN_Y, B.MIN_X, B.MAX_Y);
        drawEdge(B.MAX_X, B.MIN_Y, B.MAX_X, B.MAX_Y);

        const drawCorner = (x, y) => {
            ctx.save();
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 24;
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fill();
            const pulse = 4 + Math.sin(t * 4) * 2;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(x, y, pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };
        drawCorner(B.MIN_X, B.MIN_Y);
        drawCorner(B.MAX_X, B.MIN_Y);
        drawCorner(B.MIN_X, B.MAX_Y);
        drawCorner(B.MAX_X, B.MAX_Y);

        const cam = state.camera;
        const canvasDiag = Math.hypot(ctx.canvas.width, ctx.canvas.height) / cam.zoom;
        const labelDist = canvasDiag * 0.7;

        const drawLabel = (x, y, text, rotation = 0) => {
            const d = Math.hypot(cam.x - x, cam.y - y);
            if (d > labelDist) return;
            const alpha = Utils.clamp(1 - d / labelDist, 0, 1);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            ctx.rotate(rotation);
            ctx.font = 'bold 14px Work Sans';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText(text, 0, 0);
            ctx.fillStyle = '#f59e0b';
            ctx.fillText(text, 0, 0);
            ctx.restore();
        };

        const cx = (B.MIN_X + B.MAX_X) / 2;
        const cy = (B.MIN_Y + B.MAX_Y) / 2;
        drawLabel(cx, B.MIN_Y - 26, '⛔ NORTH BORDER ⛔', 0);
        drawLabel(cx, B.MAX_Y + 26, '⛔ SOUTH BORDER ⛔', 0);
        drawLabel(B.MIN_X - 26, cy, '⛔ WEST BORDER ⛔', -Math.PI / 2);
        drawLabel(B.MAX_X + 26, cy, '⛔ EAST BORDER ⛔', Math.PI / 2);
    },

    drawShoreFoam(state, ctx) {
        const w = state.waterBoundaryX;
        const B = CONFIG.WORLD;
        const t = state.time;

        const foamGrad = ctx.createLinearGradient(w - 45, 0, w + 30, 0);
        foamGrad.addColorStop(0.00, 'rgba(255, 250, 235, 0)');
        foamGrad.addColorStop(0.20, 'rgba(255, 250, 235, 0.25)');
        foamGrad.addColorStop(0.55, 'rgba(245, 240, 225, 0.85)');
        foamGrad.addColorStop(0.80, 'rgba(224, 242, 254, 0.90)');
        foamGrad.addColorStop(1.00, 'rgba(224, 242, 254, 0)');
        ctx.fillStyle = foamGrad;
        ctx.fillRect(w - 45, B.MIN_Y - 500, 75, (B.MAX_Y - B.MIN_Y) + 1000);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = B.MIN_Y - 100; y < B.MAX_Y + 100; y += 6) {
            const wave1 = Math.sin(y * 0.045 + t * 2.2) * 4;
            const wave2 = Math.sin(y * 0.11 - t * 3.1) * 2;
            const x = w + wave1 + wave2;
            if (y === B.MIN_Y - 100) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let y = B.MIN_Y - 100; y < B.MAX_Y + 100; y += 6) {
            const wave = Math.sin(y * 0.06 + t * 1.6 + 0.9) * 5;
            const x = w - 8 + wave;
            if (y === B.MIN_Y - 100) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        for (let y = B.MIN_Y - 50; y < B.MAX_Y + 50; y += 24) {
            const phase = Math.sin(y * 0.02 + t * 1.8) * 0.5 + 0.5;
            const bx = w - 6 - phase * 22;
            const by = y;
            const radius = 0.9 + phase * 1.4;
            ctx.beginPath();
            ctx.arc(bx, by, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(60, 40, 25, 0.35)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let y = B.MIN_Y - 100; y < B.MAX_Y + 100; y += 8) {
            const wave = Math.sin(y * 0.04 + t * 1.5) * 3;
            const x = w + wave;
            if (y === B.MIN_Y - 100) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    },

    drawGroundLoot(state, ctx) {
        if (!state.groundLoot) return;
        const p = state.player;

        state.groundLoot.forEach(item => {
            const bob = Math.sin(state.time * 3 + item.x) * 3;
            const distToP = Math.hypot(p.x - item.x, p.y - item.y);

            if (distToP < 90) {
                ctx.save();
                ctx.strokeStyle = `rgba(56,189,248,${0.5 * (1 - distToP / 90)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(item.x, item.y, 18 + Math.sin(state.time * 6) * 3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.shadowColor = item.species.color;
            ctx.shadowBlur = 15;
            this.drawFishModel(ctx, item.x, item.y + bob, item.species.size * 0.6, item.species, {});
            ctx.restore();

            ctx.font = 'bold 11px Work Sans';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(item.species.name, item.x, item.y - 22 + bob);
            ctx.fillStyle = '#fff';
            ctx.fillText(item.species.name, item.x, item.y - 22 + bob);
        });
    },

    drawBobber(state, ctx) {
        const f = state.fishing;
        const p = state.player;
        if (!f) return;

        if (f.mode === 'CASTING') {
            const meterW = 80;
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(p.x - 40, p.y - 55, meterW, 12, 4);
            ctx.fill(); ctx.stroke();

            const g = ctx.createLinearGradient(p.x - 40, 0, p.x + 40, 0);
            g.addColorStop(0, '#10b981');
            g.addColorStop(0.6, '#fbbf24');
            g.addColorStop(1, '#ef4444');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.roundRect(p.x - 38, p.y - 53, (f.castPower / 100) * (meterW - 4), 8, 3);
            ctx.fill();
        }

        if (f.mode === 'WAITING_BITES') {
            const bob = Math.sin(state.time * 4) * 3;
            ctx.strokeStyle = 'rgba(125,211,252,0.5)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                ctx.globalAlpha = 0.5 - i * 0.15;
                ctx.beginPath();
                ctx.arc(f.bobber.x, f.bobber.y + bob,
                    8 + i * 8 + Math.sin(state.time * 3 + i) * 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(f.bobber.x, f.bobber.y + bob, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(f.bobber.x, f.bobber.y + bob, 7, Math.PI, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(148,163,184,0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.quadraticCurveTo((p.x + f.bobber.x) / 2,
                                 (p.y + f.bobber.y) / 2 + 30,
                                 f.bobber.x, f.bobber.y + bob);
            ctx.stroke();
        }
    },

    drawHookedFish(state, ctx) {
        const f = state.fishing;
        const p = state.player;
        if (f.mode !== 'HOOKED' || !f.hookedFish) return;

        const fish = f.hookedFish;
        const isHighTension = f.lineTension / p.equippedRod.tensionMax > 0.8;

        ctx.strokeStyle = isHighTension ? '#f43f5e' : (fish.isDead ? '#94a3b8' : '#38bdf8');
        ctx.lineWidth = isHighTension ? 3 : 2;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = isHighTension ? 12 : 6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        const midX = (p.x + fish.x) / 2;
        const midY = (p.y + fish.y) / 2 + f.lineTension * 0.3;
        ctx.quadraticCurveTo(midX, midY, fish.x, fish.y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.save();
        if (fish.isDead) ctx.globalAlpha = 0.6;
        this.drawFishModel(ctx, fish.x, fish.y, fish.species.size, fish.species, {
            angle: fish.rotation,
            isRaging: fish.isRaging && !fish.isDead,
            isInflated: fish.isInflated,
            glow: fish.species.rarity === 'legendary' && !fish.isDead ? 1 : 0
        });
        ctx.restore();

        if (fish.isDead) {
            ctx.font = 'bold 20px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ef4444';
            ctx.fillText('☠', fish.x, fish.y - fish.species.size - 12);
            return;
        }

        const barW = 60;
        const barY = fish.y - fish.species.size - 24;
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.beginPath();
        ctx.roundRect(fish.x - barW / 2 - 2, barY - 2, barW + 4, 16, 4);
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(fish.x - barW / 2, barY, (fish.hp / fish.maxHp) * barW, 5, 2);
        ctx.fill();

        const staminaRatio = fish.stamina / fish.staminaMax;
        if (staminaRatio <= 0.01) {
            ctx.fillStyle = `rgba(251, 191, 36, ${0.6 + Math.sin(state.time * 8) * 0.4})`;
        } else {
            ctx.fillStyle = '#facc15';
        }
        ctx.beginPath();
        ctx.roundRect(fish.x - barW / 2, barY + 7, staminaRatio * barW, 5, 2);
        ctx.fill();

        if (fish.skillCooldown < 0.5) {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 11px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillText(`⚠ ${fish.species.skillName}`, fish.x, barY - 8);
        }
    },

    drawLandMonsters(state, ctx) {
        const p = state.player;
        if (!state.monstersOnLand) return;
        state.monstersOnLand.forEach(m => {
            // Bosses get their own fancy renderer (aura, crown, phase glow)
            if (m.species && m.species.isBoss) {
                this.drawBossMonster(state, ctx, m);
                return;
            }

            const angle = Math.atan2(p.y - m.y, p.x - m.x);
            this.drawFishModel(ctx, m.x, m.y, m.species.size, m.species, { angle: angle + Math.PI });

            const barW = 50;
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.fillRect(m.x - barW / 2, m.y - m.species.size - 18, barW, 7);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(m.x - barW / 2, m.y - m.species.size - 18, (m.hp / m.maxHp) * barW, 7);
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(m.x - barW / 2, m.y - m.species.size - 18, barW, 7);

            if (m.isCharging) {
                ctx.fillStyle = '#f87171';
                ctx.font = 'bold 10px Work Sans';
                ctx.textAlign = 'center';
                ctx.fillText('CHARGING!', m.x, m.y - m.species.size - 24);
            }
        });
    },

    // ============================================================
    //  BOSS RENDERING
    // ============================================================
    drawBossMonster(state, ctx, m) {
        const p = state.player;
        const species = m.species;
        const hpRatio = m.hp / (m.maxHp || species.maxHp || 1);
        const phase2 = m.phase === 2;
        const t = state.time;

        const angle = Math.atan2(p.y - m.y, p.x - m.x) + Math.PI;

        // Ground aura ring
        ctx.save();
        const auraR = species.size * 1.9;
        const auraPulse = 1 + Math.sin(t * 3) * 0.08;
        const auraColor = phase2 ? '#dc2626' : species.color;

        const auraGrad = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, auraR * auraPulse);
        auraGrad.addColorStop(0, this._hexWithAlpha(auraColor, 0.35));
        auraGrad.addColorStop(0.6, this._hexWithAlpha(auraColor, 0.12));
        auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, auraR * auraPulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = this._hexWithAlpha(auraColor, 0.7);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -t * 30;
        ctx.beginPath();
        ctx.arc(m.x, m.y, auraR * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Phase 2 orbiting flame sparks
        if (phase2) {
            ctx.save();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + t * 1.5;
                const rr = auraR * 0.85;
                const fx = m.x + Math.cos(a) * rr;
                const fy = m.y + Math.sin(a) * rr;
                const flameSize = 4 + Math.sin(t * 8 + i) * 2;
                ctx.fillStyle = 'rgba(220,38,38,0.8)';
                ctx.beginPath();
                ctx.arc(fx, fy, flameSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(251,191,36,0.7)';
                ctx.beginPath();
                ctx.arc(fx, fy, flameSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // The fish model
        ctx.save();
        ctx.shadowColor = phase2 ? '#dc2626' : species.color;
        ctx.shadowBlur = 30 + Math.sin(t * 4) * 8;
        this.drawFishModel(ctx, m.x, m.y, species.size, species, {
            angle: angle,
            isRaging: true,
            isInflated: m.isInflated
        });
        ctx.restore();

        // Crown
        const crownY = m.y - species.size - 24;
        const crownX = m.x;
        ctx.save();
        ctx.translate(crownX, crownY);
        ctx.shadowColor = phase2 ? '#dc2626' : '#f59e0b';
        ctx.shadowBlur = 18;
        ctx.fillStyle = phase2 ? '#dc2626' : '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-10, 4);
        ctx.lineTo(-10, -2);
        ctx.lineTo(-5, 2);
        ctx.lineTo(0, -6);
        ctx.lineTo(5, 2);
        ctx.lineTo(10, -2);
        ctx.lineTo(10, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = phase2 ? '#991b1b' : '#b45309';
        ctx.fillRect(-10, 4, 20, 2);
        ctx.restore();

        // Inline HP bar
        const barW = species.size * 2.6;
        const barH = 8;
        const barY = m.y - species.size - 46;
        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.95)';
        ctx.strokeStyle = phase2 ? '#dc2626' : '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(m.x - barW / 2 - 2, barY - 2, barW + 4, barH + 4, 3);
        ctx.fill();
        ctx.stroke();

        const fillW = Math.max(0, Math.min(1, hpRatio)) * barW;
        const hpGrad = ctx.createLinearGradient(m.x - barW / 2, 0, m.x + barW / 2, 0);
        if (phase2) {
            hpGrad.addColorStop(0, '#dc2626');
            hpGrad.addColorStop(1, '#f59e0b');
        } else {
            hpGrad.addColorStop(0, '#f59e0b');
            hpGrad.addColorStop(1, '#ef4444');
        }
        ctx.fillStyle = hpGrad;
        ctx.beginPath();
        ctx.roundRect(m.x - barW / 2, barY, fillW, barH, 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x - barW / 2 + barW * 0.4, barY);
        ctx.lineTo(m.x - barW / 2 + barW * 0.4, barY + barH);
        ctx.stroke();

        ctx.font = 'bold 10px Work Sans';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 3;
        const labelText = species.name.toUpperCase() + (phase2 ? ' ⚠' : '');
        ctx.strokeText(labelText, m.x, barY - 6);
        ctx.fillText(labelText, m.x, barY - 6);
        ctx.restore();

        // Charging indicator
        if (m.isCharging) {
            ctx.save();
            ctx.font = 'bold 11px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f87171';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText('CHARGING!', m.x, barY - 20);
            ctx.fillText('CHARGING!', m.x, barY - 20);
            ctx.restore();
        }

        // Stunned indicator
        if (m.stunTimer > 0) {
            ctx.save();
            ctx.font = 'bold 12px Work Sans';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#facc15';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText('⚡ STUNNED', m.x, m.y - species.size - 60);
            ctx.fillText('⚡ STUNNED', m.x, m.y - species.size - 60);
            ctx.restore();
        }
    },

    _hexWithAlpha(hex, alpha) {
        if (!hex || hex[0] !== '#') return `rgba(255,255,255,${alpha})`;
        const h = hex.slice(1);
        const full = h.length === 3
            ? h.split('').map(c => c + c).join('')
            : h;
        const n = parseInt(full, 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    },

    drawBullets(state, ctx) {
        if (!state.bullets) return;
        state.bullets.forEach(b => {
            const isPlayerBullet = b.type && b.type !== 'enemy_spark' && b.type !== 'enemy_quill';

            if (b.trail && b.trail.length) {
                b.trail.forEach((pt, i) => {
                    ctx.globalAlpha = (i / b.trail.length) * 0.5;
                    ctx.fillStyle = isPlayerBullet
                        ? (b.type === 'harpoon' || b.type === 'rail' ? '#38bdf8'
                            : b.type === 'plasma' ? '#a5f3fc'
                            : b.type === 'flame' ? '#fb923c'
                            : '#facc15')
                        : (b.color || '#facc15');
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
            }

            let fill = b.color || '#facc15';
            let glow = b.color || '#facc15';
            let radius = b.radius || 3;

            if (isPlayerBullet) {
                if (b.type === 'harpoon' || b.type === 'rail') { fill = glow = '#38bdf8'; radius = 5; }
                else if (b.type === 'plasma') { fill = '#a5f3fc'; glow = '#67e8f9'; radius = 5; }
                else if (b.type === 'flame') { fill = '#fb923c'; glow = '#f97316'; radius = 4; }
                else if (b.type === 'launcher') { fill = '#dc2626'; glow = '#f87171'; radius = 5; }
            }

            ctx.shadowColor = glow;
            ctx.shadowBlur = 12;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    },

    drawDelayedBlasts(state, ctx) {
        if (!state.delayedBlasts || state.delayedBlasts.length === 0) return;
        const t = state.time;

        state.delayedBlasts.forEach(b => {
            const progress = 1 - Math.max(0, b.timer) / 1.5;
            const pulse = 0.5 + Math.sin(t * 20) * 0.5;

            ctx.save();

            ctx.globalAlpha = 0.35 + pulse * 0.35;
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.globalAlpha = 0.12 + pulse * 0.12;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 0.75;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const inner = b.radius * (1 - progress);
            if (inner > 2) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, inner, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();
        });
    },

    drawPlayer(state, ctx) {
        const p = state.player;
        ctx.save();
        ctx.translate(p.x, p.y);
        const aimAngle = Math.atan2(state.mouse.worldY - p.y, state.mouse.worldX - p.x);
        ctx.rotate(aimAngle);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(2, 4, p.radius, p.radius * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, p.radius);
        g.addColorStop(0, '#38bdf8');
        g.addColorStop(1, '#0369a1');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.stroke();

        const weaponId = p.equippedWeapons && p.equippedWeapons[p.activeSlot];
        const w = weaponId ? WEAPONS.find(x => x.id === weaponId) : null;
        if (w) this.drawGun(ctx, p, w);

        ctx.restore();
    },

    drawGun(ctx, p, w) {
        if (!w) return;

        const recoil = p.weaponRecoil || 0;
        ctx.translate(-recoil * 0.6, 0);

        const STEEL  = '#cbd5e1';
        const DARK   = '#334155';
        const BLACK  = '#0f172a';
        const ACCENT = w.rarity === 'mythic'    ? '#e879f9'
                     : w.rarity === 'legendary' ? '#f59e0b'
                     : w.rarity === 'epic'      ? '#a855f7'
                     : w.rarity === 'rare'      ? '#38bdf8'
                     : '#94a3b8';

        switch (w.type) {

            case 'pistol': {
                ctx.fillStyle = STEEL; ctx.fillRect(8, -4, 22, 8);
                ctx.fillStyle = DARK;  ctx.fillRect(8, -4, 22, 3);
                ctx.fillStyle = BLACK; ctx.fillRect(11, 3, 8, 10);
                ctx.strokeStyle = DARK; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(20, 4, 5, 0, Math.PI); ctx.stroke();
                break;
            }

            case 'smg': {
                ctx.fillStyle = STEEL; ctx.fillRect(6, -3, 26, 6);
                ctx.fillStyle = DARK;  ctx.fillRect(6, -3, 26, 2);
                ctx.fillStyle = BLACK; ctx.fillRect(14, 3, 6, 14);
                ctx.fillStyle = BLACK; ctx.fillRect(22, 3, 6, 10);
                ctx.fillStyle = DARK;  ctx.fillRect(6, 3, 4, 8);
                break;
            }

            case 'rifle': {
                ctx.fillStyle = STEEL; ctx.fillRect(6, -4, 34, 8);
                ctx.fillStyle = DARK;  ctx.fillRect(6, -4, 34, 3);
                ctx.fillStyle = BLACK;
                for (let i = 0; i < 4; i++) ctx.fillRect(8 + i * 3, -3, 1.5, 6);
                ctx.fillStyle = DARK;  ctx.fillRect(0, -3, 8, 6);
                ctx.fillStyle = BLACK; ctx.fillRect(20, 3, 7, 14);
                ctx.fillStyle = BLACK; ctx.fillRect(28, 3, 6, 10);
                break;
            }

            case 'shotgun': {
                ctx.fillStyle = STEEL; ctx.fillRect(6, -6, 34, 12);
                ctx.fillStyle = DARK;  ctx.fillRect(6, -6, 34, 4);
                ctx.strokeStyle = BLACK; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(40, 0); ctx.stroke();
                ctx.fillStyle = BLACK; ctx.fillRect(12, -3, 10, 6);
                ctx.fillStyle = DARK;  ctx.fillRect(0, -4, 8, 8);
                ctx.fillStyle = BLACK; ctx.fillRect(28, 3, 6, 10);
                break;
            }

            case 'harpoon': {
                ctx.fillStyle = '#0284c7'; ctx.fillRect(6, -3, 36, 6);
                ctx.fillStyle = DARK;      ctx.fillRect(6, -3, 36, 2);
                ctx.fillStyle = '#facc15';
                ctx.beginPath();
                ctx.moveTo(44, 0); ctx.lineTo(54, -6); ctx.lineTo(54, 6);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(44, 0); ctx.lineTo(38, 0); ctx.stroke();
                break;
            }

            case 'launcher': {
                ctx.fillStyle = '#92400e'; ctx.fillRect(4, -8, 34, 16);
                ctx.fillStyle = BLACK;     ctx.fillRect(4, -8, 34, 4);
                ctx.fillStyle = '#dc2626';
                ctx.beginPath(); ctx.arc(40, 0, 7, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = BLACK; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = BLACK; ctx.fillRect(20, 6, 6, 10);
                break;
            }

            case 'flame': {
                ctx.fillStyle = '#f97316'; ctx.fillRect(6, -3, 26, 6);
                ctx.fillStyle = DARK;      ctx.fillRect(6, -3, 26, 2);
                ctx.fillStyle = '#ea580c';
                ctx.beginPath(); ctx.arc(-2, 0, 8, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = BLACK; ctx.stroke();
                ctx.fillStyle = '#fde047';
                ctx.beginPath();
                ctx.moveTo(32, -5); ctx.lineTo(40, 0); ctx.lineTo(32, 5);
                ctx.closePath(); ctx.fill();
                break;
            }

            case 'rail': {
                ctx.fillStyle = ACCENT; ctx.fillRect(0, -3, 46, 6);
                ctx.fillStyle = '#0f172a'; ctx.fillRect(0, -3, 46, 2);
                ctx.fillStyle = '#38bdf8';
                for (let i = 0; i < 5; i++) ctx.fillRect(8 + i * 6, -6, 3, 12);
                ctx.fillStyle = BLACK; ctx.fillRect(46, -5, 6, 10);
                break;
            }

            case 'plasma': {
                ctx.fillStyle = '#0e7490'; ctx.fillRect(6, -5, 28, 10);
                ctx.fillStyle = '#22d3ee'; ctx.fillRect(8, -3, 24, 6);
                ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 12;
                ctx.fillStyle = '#a5f3fc';
                ctx.beginPath(); ctx.arc(36, 0, 6, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = BLACK; ctx.fillRect(18, 5, 6, 10);
                break;
            }

            default: {
                ctx.fillStyle = STEEL; ctx.fillRect(8, -3, 24, 6);
                ctx.fillStyle = DARK;  ctx.fillRect(8, -3, 24, 2);
            }
        }

        const flash = p.muzzleFlash || 0;
        if (flash > 0) {
            const barrelLen = ({
                pistol: 30, smg: 34, rifle: 40, shotgun: 44,
                harpoon: 54, launcher: 48, flame: 40,
                rail: 54, plasma: 44
            })[w.type] || 34;

            ctx.save();
            ctx.globalAlpha = Math.min(1, flash);
            const grad = ctx.createRadialGradient(barrelLen, 0, 0, barrelLen, 0, 18);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(0.4, 'rgba(251,191,36,0.8)');
            grad.addColorStop(1, 'rgba(251,191,36,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(barrelLen, 0, 18, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(barrelLen, 0);
                ctx.lineTo(barrelLen + Math.cos(a) * 20, Math.sin(a) * 20);
                ctx.stroke();
            }
            ctx.restore();
        }
    },

    drawParticles(state, ctx) {
        if (!state.particles) return;
        state.particles.forEach(pt => {
            ctx.globalAlpha = Math.max(0, pt.life / 0.5);
            if (pt.glow) {
                ctx.shadowColor = pt.color;
                ctx.shadowBlur = 10;
            }
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size || 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });
        ctx.globalAlpha = 1;
    },

    drawFloatingTexts(state, ctx) {
        if (!state.floatingTexts) return;
        state.floatingTexts.forEach(t => {
            ctx.globalAlpha = Math.min(1, t.life);
            ctx.font = 'bold 15px Work Sans';
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 4;
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, t.x, t.y);
        });
        ctx.globalAlpha = 1;
    },

    drawCrosshair(state, ctx) {
        const cx = state.mouse.x, cy = state.mouse.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 18, cy); ctx.lineTo(cx - 6, cy);
        ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 18, cy);
        ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 6);
        ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 18);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    },

    // ============================================================
    //  FISH MODEL DISPATCH
    // ============================================================
    drawFishModel(ctx, x, y, size, species, opts = {}) {
        const { angle = 0, isRaging = false, isInflated = false, glow = 0 } = opts;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const s = size * (isInflated ? 1.4 : 1);
        const col = species.color;
        const acc = species.accent;

        if (glow > 0) {
            ctx.shadowColor = col;
            ctx.shadowBlur = 20 * glow;
        }

        switch (species.shape) {
            case 'manta':      this._drawManta(ctx, s, col, acc); break;
            case 'ray':        this._drawRay(ctx, s, col, acc); break;
            case 'swordfish':  this._drawSwordfish(ctx, s, col, acc); break;
            case 'jellyfish':  this._drawJellyfish(ctx, s, col, acc); break;
            case 'angler':     this._drawAngler(ctx, s, col, acc); break;
            case 'hammerhead': this._drawHammerhead(ctx, s, col, acc); break;
            case 'eel':        this._drawEel(ctx, s, col, acc); break;
            case 'puffer':     this._drawPuffer(ctx, s, col, acc, isInflated); break;
            case 'shark':      this._drawShark(ctx, s, col, acc); break;
            case 'kraken':     this._drawKraken(ctx, s, col, acc); break;
            case 'koi':        this._drawKoi(ctx, s, col, acc); break;
            case 'spiky':      this._drawSpiky(ctx, s, col, acc); break;
            case 'crab':       this._drawCrab(ctx, s, col, acc); break;
            case 'turtle':     this._drawTurtle(ctx, s, col, acc); break;
            case 'dragon':     this._drawDragon(ctx, s, col, acc); break;
            case 'oval':
            default:           this._drawOval(ctx, s, col, acc); break;
        }

        if (isRaging) {
            ctx.strokeStyle = `rgba(239,68,68,${0.4 + Math.sin(performance.now() / 100) * 0.3})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, s * 1.4, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    },

    // ============================================================
    //  SHAPE DRAWERS
    // ============================================================
    _drawRay(ctx, s, col, acc) {
        const t = performance.now() / 400;
        const flap = 1 + Math.sin(t * 3) * 0.12;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.15, 0);
        ctx.quadraticCurveTo(s * 0.6,  -s * 0.7 * flap, -s * 0.1, -s * 1.5 * flap);
        ctx.quadraticCurveTo(-s * 0.6, -s * 0.9 * flap, -s * 1.3, -s * 0.3 * flap);
        ctx.quadraticCurveTo(-s * 1.0,  0,              -s * 1.3,  s * 0.3 * flap);
        ctx.quadraticCurveTo(-s * 0.6,  s * 0.9 * flap, -s * 0.1,  s * 1.5 * flap);
        ctx.quadraticCurveTo(s * 0.6,   s * 0.7 * flap,  s * 1.15, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        for (let i = 0; i < 6; i++) {
            const px = (Math.random() - 0.5) * s * 1.2;
            const py = (Math.random() - 0.5) * s * 0.9;
            ctx.beginPath();
            ctx.arc(px, py, s * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.28, s * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.55,  s * 0.28, s * 0.09, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.beginPath();
        ctx.moveTo(-s * 1.3, 0);
        ctx.quadraticCurveTo(-s * 2.2, Math.sin(t * 5) * s * 0.35, -s * 3.2, Math.sin(t * 5 + 1) * s * 0.15);
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 2.1, Math.sin(t * 5) * s * 0.32);
        ctx.lineTo(-s * 2.35, Math.sin(t * 5) * s * 0.32 - s * 0.15);
        ctx.lineTo(-s * 2.25, Math.sin(t * 5) * s * 0.32);
        ctx.closePath();
        ctx.fill();
    },

    _drawManta(ctx, s, col, acc) {
        const t = performance.now() / 500;
        const flap = 1 + Math.sin(t * 2.4) * 0.18;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(s * 1.3, 0);
        ctx.quadraticCurveTo(s * 0.4, -s * 0.9 * flap, -s * 0.3, -s * 1.9 * flap);
        ctx.quadraticCurveTo(-s * 1.0, -s * 1.0 * flap, -s * 1.4, -s * 0.25 * flap);
        ctx.quadraticCurveTo(-s * 0.9, 0, -s * 1.4, s * 0.25 * flap);
        ctx.quadraticCurveTo(-s * 1.0, s * 1.0 * flap, -s * 0.3, s * 1.9 * flap);
        ctx.quadraticCurveTo(s * 0.4, s * 0.9 * flap, s * 1.3, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.2, 0, s * 0.8, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.1, -s * 0.15);
        ctx.quadraticCurveTo(s * 1.9, -s * 0.45, s * 1.65, -s * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 1.1, s * 0.15);
        ctx.quadraticCurveTo(s * 1.9, s * 0.45, s * 1.65, s * 0.05);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(s * 0.9, -s * 0.32, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.9,  s * 0.32, s * 0.1, 0, Math.PI * 2); ctx.fill();

        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.beginPath();
        ctx.moveTo(-s * 1.3, 0);
        ctx.quadraticCurveTo(-s * 2.2, Math.sin(t * 4) * s * 0.2, -s * 3.0, 0);
        ctx.stroke();
    },

    _drawSwordfish(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(-s * 0.2, 0, s * 1.3, s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.8, -s * 0.05);
        ctx.lineTo(s * 2.5, 0);
        ctx.lineTo(s * 0.8, s * 0.05);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 0.2, -s * 0.45);
        ctx.quadraticCurveTo(-s * 0.2, -s * 1.5, -s * 0.6, -s * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0);
        ctx.lineTo(-s * 2.1, -s * 0.9);
        ctx.lineTo(-s * 1.7, 0);
        ctx.lineTo(-s * 2.1, s * 0.9);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.1, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.53, -s * 0.1, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    _drawJellyfish(ctx, s, col, acc) {
        const t = performance.now() / 300;
        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1, s * 0.12);
        ctx.lineCap = 'round';
        for (let i = -3; i <= 3; i++) {
            const offsetX = i * (s * 0.22);
            ctx.beginPath();
            ctx.moveTo(-s * 0.2 + offsetX, 0);
            ctx.quadraticCurveTo(
                -s * 0.8 + offsetX + Math.sin(t + i) * s * 0.3,
                s * 0.5 * (i % 2 === 0 ? 1 : -1),
                -s * 1.8 + offsetX + Math.cos(t + i) * s * 0.4,
                0
            );
            ctx.stroke();
        }

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(s * 0.2, 0, s * 0.8, -Math.PI / 2, Math.PI / 2, true);
        ctx.quadraticCurveTo(-s * 0.1, 0, s * 0.2, -s * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.2, 0, s * 0.2, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
    },

    _drawAngler(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.1, s * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(s * 0.3, s * 0.1, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(s * 0.1 + i * s * 0.12, s * 0.35);
            ctx.lineTo(s * 0.16 + i * s * 0.12, s * 0.1);
            ctx.lineTo(s * 0.22 + i * s * 0.12, s * 0.35);
            ctx.closePath();
            ctx.fill();
        }

        ctx.strokeStyle = acc;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.8);
        ctx.quadraticCurveTo(s * 0.8, -s * 1.6, s * 1.2, -s * 0.5);
        ctx.stroke();

        ctx.shadowColor = acc;
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s * 1.2, -s * 0.5, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.2, -s * 0.4, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.22, -s * 0.4, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    _drawHammerhead(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(-s * 0.2, 0, s * 1.4, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.roundRect(s * 0.8, -s * 1.1, s * 0.4, s * 2.2, s * 0.1);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.55);
        ctx.lineTo(s * 0.3, -s * 1.3);
        ctx.lineTo(s * 0.5, -s * 0.55);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-s * 1.5, 0);
        ctx.lineTo(-s * 2.2, -s * 0.8);
        ctx.lineTo(-s * 1.8, 0);
        ctx.lineTo(-s * 2.2, s * 0.8);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.0, -s * 1.0, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 1.0, s * 1.0, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.03, -s * 1.0, s * 0.05, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 1.03, s * 1.0, s * 0.05, 0, Math.PI * 2); ctx.fill();
    },

    _drawOval(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.2, s * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, -s * 0.65); ctx.lineTo(s * 0.1, -s * 1.1); ctx.lineTo(s * 0.4, -s * 0.6);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0); ctx.lineTo(-s * 1.7, -s * 0.55); ctx.lineTo(-s * 1.7, s * 0.55);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.65, -s * 0.15, s * 0.17, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    _drawSpiky(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.2, s * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(i * s * 0.35, -s * 0.6);
            ctx.lineTo(i * s * 0.35 + s * 0.1, -s * 1.1);
            ctx.lineTo(i * s * 0.35 + s * 0.2, -s * 0.6);
            ctx.closePath(); ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(-s * 1.1, 0); ctx.lineTo(-s * 1.8, -s * 0.7); ctx.lineTo(-s * 1.8, s * 0.7);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.6, -s * 0.15, s * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.65, -s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    _drawEel(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.2, s * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 1.5, 0); ctx.lineTo(-s * 2.2, -s * 0.6); ctx.lineTo(-s * 2.2, s * 0.6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.9, -s * 0.15, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.92, -s * 0.15, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    _drawPuffer(ctx, s, col, acc, isInflated) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
        if (isInflated) {
            ctx.fillStyle = acc;
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.9);
                ctx.lineTo(Math.cos(a) * s * 1.4, Math.sin(a) * s * 1.4);
                ctx.lineTo(Math.cos(a + 0.3) * s * 0.9, Math.sin(a + 0.3) * s * 0.9);
                ctx.closePath(); ctx.fill();
            }
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.3, s * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.45, -s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.9, 0); ctx.lineTo(-s * 1.5, -s * 0.5); ctx.lineTo(-s * 1.5, s * 0.5);
        ctx.closePath(); ctx.fill();
    },

    _drawShark(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.5, s * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.6); ctx.lineTo(s * 0.4, -s * 1.4); ctx.lineTo(s * 0.6, -s * 0.6);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 1.4, 0); ctx.lineTo(-s * 2.1, -s * 0.8); ctx.lineTo(-s * 1.8, 0); ctx.lineTo(-s * 2.1, s * 0.8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 0.9, -s * 0.2, s * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.arc(s * 0.95, -s * 0.2, s * 0.08, 0, Math.PI * 2); ctx.fill();
    },

    _drawKraken(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(-s * 0.3, 0, s * 1.1, s * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = s * 0.22;
        ctx.lineCap = 'round';
        const t = performance.now() / 400;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const wave = Math.sin(t + i) * s * 0.3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
            ctx.quadraticCurveTo(
                Math.cos(a) * s * 1.8 + wave,
                Math.sin(a) * s * 1.8 + wave,
                Math.cos(a) * s * 2.5,
                Math.sin(a) * s * 2.5
            );
            ctx.stroke();
        }

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 0.35, -s * 0.3, s * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.35, s * 0.3, s * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.42, s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },

    _drawKoi(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.3, s * 0.65, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.5); ctx.quadraticCurveTo(s * 0.3, -s * 1.5, s * 0.6, -s * 0.4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, s * 0.5); ctx.quadraticCurveTo(s * 0.3, s * 1.5, s * 0.6, s * 0.4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 1.2, 0);
        ctx.quadraticCurveTo(-s * 2.2, -s * 1, -s * 1.8, 0);
        ctx.quadraticCurveTo(-s * 2.2, s * 1, -s * 1.2, 0);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 0.7, -s * 0.15, s * 0.1, 0, Math.PI * 2); ctx.fill();
    },

    _drawCrab(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.1, s * 0.85, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(2, s * 0.14);
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            const off = -s * 0.4 + i * s * 0.3;
            ctx.beginPath();
            ctx.moveTo(-s * 0.6, off);
            ctx.lineTo(-s * 1.4, off - s * 0.3);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(s * 0.6, off);
            ctx.lineTo(s * 1.4, off - s * 0.3);
            ctx.stroke();
        }

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.arc(-s * 1.2, -s * 0.9, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 1.2, -s * 0.9, s * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = col;
        ctx.fillRect(-s * 0.3, -s * 1.0, s * 0.1, s * 0.4);
        ctx.fillRect(s * 0.2, -s * 1.0, s * 0.1, s * 0.4);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-s * 0.25, -s * 1.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.25, -s * 1.05, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(-s * 0.25, -s * 1.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.25, -s * 1.05, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },

    _drawTurtle(ctx, s, col, acc) {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            const px = Math.cos(a) * s * 1.1;
            const py = Math.sin(a) * s * 1.0;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = acc;
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.8);
        }
        ctx.stroke();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.ellipse(s * 0.9, -s * 0.7, s * 0.4, s * 0.18, Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(s * 0.9, s * 0.7, s * 0.4, s * 0.18, -Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.9, -s * 0.7, s * 0.35, s * 0.15, -Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.9, s * 0.7, s * 0.35, s * 0.15, Math.PI * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(s * 1.3, 0, s * 0.35, s * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s * 1.4, -s * 0.08, s * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.42, -s * 0.08, s * 0.05, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(-s * 1.0, 0);
        ctx.lineTo(-s * 1.4, -s * 0.15);
        ctx.lineTo(-s * 1.4, s * 0.15);
        ctx.closePath();
        ctx.fill();
    },

    _drawDragon(ctx, s, col, acc) {
        const t = performance.now() / 400;
        const wingY = Math.sin(t * 2) * s * 0.15;

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 0.4, -s * 0.3);
        ctx.lineTo(s * 0.2, -s * 1.8 + wingY);
        ctx.lineTo(-s * 0.6, -s * 0.8 + wingY);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.4, s * 0.3);
        ctx.lineTo(s * 0.2, s * 1.8 - wingY);
        ctx.lineTo(-s * 0.6, s * 0.8 - wingY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.6, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(s * 1.5, 0, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(s * 1.9, 0);
        ctx.lineTo(s * 2.5, -s * 0.15);
        ctx.lineTo(s * 2.5, s * 0.15);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = acc;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, -s * 0.4);
        ctx.lineTo(s * 1.4, -s * 1.0);
        ctx.lineTo(s * 1.5, -s * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 1.2, s * 0.4);
        ctx.lineTo(s * 1.4, s * 1.0);
        ctx.lineTo(s * 1.5, s * 0.4);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(s * 1.55, -s * 0.15, s * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(s * 1.58, -s * 0.15, s * 0.05, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-s * 1.5, 0);
        ctx.quadraticCurveTo(-s * 2.3, Math.sin(t * 3) * s * 0.4, -s * 2.8, Math.sin(t * 3 + 1) * s * 0.2);
        ctx.lineTo(-s * 2.6, s * 0.15);
        ctx.quadraticCurveTo(-s * 2.2, Math.sin(t * 3) * s * 0.4, -s * 1.5, s * 0.15);
        ctx.closePath();
        ctx.fill();
    }
};