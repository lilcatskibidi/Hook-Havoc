const Particles = {
    spawnBloodImpact(state, x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 180,
                vy: (Math.random() - 0.5) * 180 - 30,
                color, life: 0.5 + Math.random() * 0.3,
                size: 2 + Math.random() * 3
            });
        }
    },

    spawnWaterSplashes(state, x, y, count = 3) {
        for (let i = 0; i < count; i++) {
            state.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 100,
                vy: (Math.random() - 0.5) * 100 - 20,
                color: Math.random() < 0.5 ? '#38bdf8' : '#7dd3fc',
                life: 0.4, size: 2 + Math.random() * 2
            });
        }
    },

    spawnParticles(state, x, y, color, count = 8, opts = {}) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 80 + Math.random() * 200;
            state.particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                color, life: 0.5 + Math.random() * 0.5,
                size: opts.size !== undefined ? opts.size : (2 + Math.random() * 4),
                glow: opts.glow !== undefined ? opts.glow : true
            });
        }
    },    spawnDragTrail(state, x, y) {
        state.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 30,
            vy: (Math.random() - 0.5) * 30 - 10,
            color: 'rgba(224, 242, 254, 0.9)',
            life: 0.6, size: 3 + Math.random() * 2, drag: true
        });
    },

    showFloatingText(state, text, x, y, color = '#ffffff') {
        state.floatingTexts.push({ text, x, y, color, life: 1.2, vy: -30 });
    },

    update(state, delta) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.vy += 80 * delta;
            p.vx *= 0.98; p.vy *= 0.98;
            p.life -= delta;
            if (p.life <= 0) state.particles.splice(i, 1);
        }
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const t = state.floatingTexts[i];
            t.y += t.vy * delta;
            t.vy *= 0.95;
            t.life -= delta;
            if (t.life <= 0) state.floatingTexts.splice(i, 1);
        }
    }
};