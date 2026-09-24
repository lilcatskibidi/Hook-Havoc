class SoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        // Persistent ambient nodes (loops)
        this._ambient = null;
        this._reelLoop = null;
    }

    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    _gate() { return this.muted || !this.ctx; }

    // ------------------------------------------------------------
    //  INTERNAL HELPERS
    // ------------------------------------------------------------
    _noiseBuffer(durationSec) {
        const len = Math.max(1, Math.floor(this.ctx.sampleRate * durationSec));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    // Filtered noise burst, low→high or high→low via filter sweep
    _noiseBurst(opts = {}) {
        if (this._gate()) return;
        const {
            duration = 0.2,
            startFreq = 800,
            endFreq = 100,
            gain = 0.35,
            filterType = 'lowpass'
        } = opts;

        const now = this.ctx.currentTime;
        const buf = this._noiseBuffer(duration);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;

        const filt = this.ctx.createBiquadFilter();
        filt.type = filterType;
        filt.frequency.setValueAtTime(startFreq, now);
        filt.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);

        src.connect(filt); filt.connect(g); g.connect(this.ctx.destination);
        src.start(now);
        src.stop(now + duration + 0.02);
    }

    // Simple tone with start/end freq, gain, duration
    _tone(opts = {}) {
        if (this._gate()) return;
        const {
            type = 'sine',
            freq = 440,
            endFreq = null,
            gain = 0.25,
            duration = 0.15,
            attack = 0.005,
            delay = 0
        } = opts;

        const now = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, now);
        if (endFreq && endFreq !== freq) {
            o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
        }

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gain, now + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        o.connect(g); g.connect(this.ctx.destination);
        o.start(now);
        o.stop(now + duration + 0.02);
    }

    // ------------------------------------------------------------
    //  EXISTING — GUNS, FISHING, UI
    // ------------------------------------------------------------
    playGunshot(type) {
        if (this._gate()) return;
        const now = this.ctx.currentTime;

        if (type === 'pistol') {
            this._tone({ type: 'sawtooth', freq: 320, endFreq: 40, gain: 0.35, duration: 0.1 });
        } else if (type === 'shotgun') {
            this._noiseBurst({ duration: 0.25, startFreq: 1200, endFreq: 60, gain: 0.6 });
        } else if (type === 'rifle') {
            this._tone({ type: 'square', freq: 480, endFreq: 80, gain: 0.3, duration: 0.08 });
        } else if (type === 'harpoon') {
            this._tone({ type: 'triangle', freq: 150, endFreq: 600, gain: 0.45, duration: 0.2 });
        } else if (type === 'smg') {
            this._tone({ type: 'square', freq: 620, endFreq: 120, gain: 0.18, duration: 0.05 });
        } else if (type === 'rail') {
            // Heavy charged shot: upward sweep + noise tail
            this._tone({ type: 'sawtooth', freq: 180, endFreq: 900, gain: 0.4, duration: 0.35 });
            this._noiseBurst({ duration: 0.4, startFreq: 400, endFreq: 40, gain: 0.35 });
        } else if (type === 'plasma') {
            this._tone({ type: 'sine', freq: 500, endFreq: 1200, gain: 0.3, duration: 0.15 });
            this._tone({ type: 'triangle', freq: 200, endFreq: 60, gain: 0.2, duration: 0.2 });
        } else if (type === 'flame') {
            this._noiseBurst({ duration: 0.12, startFreq: 600, endFreq: 200, gain: 0.15 });
        } else if (type === 'launcher') {
            this._tone({ type: 'sawtooth', freq: 120, endFreq: 40, gain: 0.5, duration: 0.3 });
            this._noiseBurst({ duration: 0.35, startFreq: 800, endFreq: 80, gain: 0.5 });
        }
    }

    playCast() {
        this._tone({ type: 'sine', freq: 200, endFreq: 600, gain: 0.25, duration: 0.15 });
    }

    playSplash() {
        this._noiseBurst({ duration: 0.2, startFreq: 800, endFreq: 100, gain: 0.4 });
    }

    playSnap() {
        this._tone({ type: 'sawtooth', freq: 900, endFreq: 100, gain: 0.5, duration: 0.1 });
    }

    playCoin() {
        const now = this.ctx ? this.ctx.currentTime : 0;
        this._tone({ type: 'sine', freq: 987.77, gain: 0.2, duration: 0.12 });
        this._tone({ type: 'sine', freq: 1318.51, gain: 0.2, duration: 0.18, delay: 0.08 });
    }

    playHit() {
        this._tone({ type: 'square', freq: 220, endFreq: 60, gain: 0.25, duration: 0.08 });
    }

    playBeach() {
        this._tone({ type: 'sine', freq: 120, endFreq: 40, gain: 0.5, duration: 0.3 });
        this.playSplash();
    }

    playLevelUp() {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            this._tone({ type: 'sine', freq, gain: 0.25, duration: 0.28, delay: i * 0.1 });
        });
    }

    // ------------------------------------------------------------
    //  NEW — REELING
    // ------------------------------------------------------------
    // Short tick each time the reel clicks (call on a timer while reeling)
    playReelTick() {
        this._tone({ type: 'square', freq: 1100, endFreq: 900, gain: 0.08, duration: 0.03 });
        this._noiseBurst({ duration: 0.03, startFreq: 3000, endFreq: 1500, gain: 0.05, filterType: 'highpass' });
    }

    // Continuous reel loop — start it when the player begins holding Space near a hooked fish
    startReelLoop() {
        if (this._gate() || this._reelLoop) return;
        const now = this.ctx.currentTime;
        const buf = this._noiseBuffer(1.0);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;

        const filt = this.ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.value = 1400;
        filt.Q.value = 1.2;

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.12, now + 0.1);

        src.connect(filt); filt.connect(g); g.connect(this.ctx.destination);
        src.start(now);
        this._reelLoop = { src, gain: g };
    }

    stopReelLoop() {
        if (!this._reelLoop) return;
        const { src, gain } = this._reelLoop;
        const now = this.ctx.currentTime;
        try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
            src.stop(now + 0.15);
        } catch (e) {}
        this._reelLoop = null;
    }

    // Line tension stress — high pitched whine when tension is critical
    playTensionStress() {
        this._tone({ type: 'sawtooth', freq: 1800, endFreq: 2200, gain: 0.12, duration: 0.15 });
    }

    // ------------------------------------------------------------
    //  NEW — FISH MONSTER SOUNDS
    // ------------------------------------------------------------
    // Big beast roar — used when a boss is hooked or phase changes
    playRoar() {
        if (this._gate()) return;
        const now = this.ctx.currentTime;

        // Low growl
        const growl = this.ctx.createOscillator();
        const gg = this.ctx.createGain();
        growl.type = 'sawtooth';
        growl.frequency.setValueAtTime(90, now);
        growl.frequency.exponentialRampToValueAtTime(45, now + 0.9);
        gg.gain.setValueAtTime(0.35, now);
        gg.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        growl.connect(gg); gg.connect(this.ctx.destination);
        growl.start(now); growl.stop(now + 1.0);

        // Modulated scream overlay
        const scream = this.ctx.createOscillator();
        const sg = this.ctx.createGain();
        scream.type = 'square';
        scream.frequency.setValueAtTime(180, now);
        scream.frequency.exponentialRampToValueAtTime(70, now + 0.6);
        sg.gain.setValueAtTime(0.15, now);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        scream.connect(sg); sg.connect(this.ctx.destination);
        scream.start(now); scream.stop(now + 0.8);

        // Airy noise tail
        this._noiseBurst({ duration: 0.8, startFreq: 900, endFreq: 100, gain: 0.25 });
    }

    // Smaller aggressive screech for common/rare fish
    playFishScreech() {
        this._tone({ type: 'sawtooth', freq: 800, endFreq: 300, gain: 0.2, duration: 0.25 });
        this._tone({ type: 'triangle', freq: 1200, endFreq: 500, gain: 0.15, duration: 0.2, delay: 0.05 });
    }

    // Fish bolting / darting away
    playWhoosh() {
        this._noiseBurst({ duration: 0.35, startFreq: 200, endFreq: 1800, gain: 0.3, filterType: 'bandpass' });
    }

    // Bubbling underwater sound
    playBubble() {
        const now = this.ctx ? this.ctx.currentTime : 0;
        for (let i = 0; i < 5; i++) {
            const delay = i * 0.08 + Math.random() * 0.04;
            this._tone({ type: 'sine', freq: 300 + Math.random() * 400, endFreq: 900, gain: 0.12, duration: 0.1, delay });
        }
    }

    // ------------------------------------------------------------
    //  NEW — EXPLOSIONS / IMPACTS
    // ------------------------------------------------------------
    playExplosion() {
        if (this._gate()) return;
        const now = this.ctx.currentTime;

        // Deep boom
        this._tone({ type: 'sawtooth', freq: 90, endFreq: 30, gain: 0.55, duration: 0.7 });
        // Crackling noise
        this._noiseBurst({ duration: 0.7, startFreq: 900, endFreq: 50, gain: 0.5 });
        // Secondary "thump" for depth
        this._tone({ type: 'triangle', freq: 60, endFreq: 25, gain: 0.4, duration: 0.5, delay: 0.02 });
    }

    playThunder() {
        this._noiseBurst({ duration: 1.2, startFreq: 200, endFreq: 40, gain: 0.45 });
        this._tone({ type: 'sawtooth', freq: 70, endFreq: 25, gain: 0.35, duration: 0.9 });
    }

    playIceCrack() {
        for (let i = 0; i < 6; i++) {
            this._tone({ type: 'square', freq: 1400 + Math.random() * 800, endFreq: 600, gain: 0.08, duration: 0.04, delay: i * 0.03 });
        }
        this._noiseBurst({ duration: 0.25, startFreq: 3000, endFreq: 800, gain: 0.2, filterType: 'highpass' });
    }

    // ------------------------------------------------------------
    //  NEW — STATUS / DEATH / MISC
    // ------------------------------------------------------------
    playHurt() {
        this._tone({ type: 'sawtooth', freq: 180, endFreq: 60, gain: 0.35, duration: 0.15 });
        this._noiseBurst({ duration: 0.15, startFreq: 400, endFreq: 80, gain: 0.2 });
    }

    playFishDeath() {
        // Descending wail
        this._tone({ type: 'sawtooth', freq: 500, endFreq: 80, gain: 0.3, duration: 0.6 });
        this._noiseBurst({ duration: 0.4, startFreq: 600, endFreq: 100, gain: 0.25 });
    }

    playBossKilled() {
        // Bigger, deeper death jingle for legendary/mythic
        this._tone({ type: 'sawtooth', freq: 200, endFreq: 40, gain: 0.45, duration: 1.2 });
        this._noiseBurst({ duration: 1.0, startFreq: 1200, endFreq: 60, gain: 0.4 });
        // A victory triad
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            this._tone({ type: 'sine', freq, gain: 0.2, duration: 0.5, delay: 0.3 + i * 0.12 });
        });
    }

    playVictory() {
        // Ascending arpeggio — used after beachFish succeeds
        [392.0, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            this._tone({ type: 'triangle', freq, gain: 0.22, duration: 0.35, delay: i * 0.09 });
        });
    }

    // ------------------------------------------------------------
    //  NEW — AMBIENT LOOP
    // ------------------------------------------------------------
    startAmbient() {
        if (this._gate() || this._ambient) return;
        const now = this.ctx.currentTime;

        // Slow surf loop
        const surf = this.ctx.createBufferSource();
        surf.buffer = this._noiseBuffer(4.0);
        surf.loop = true;

        const surfFilt = this.ctx.createBiquadFilter();
        surfFilt.type = 'lowpass';
        surfFilt.frequency.value = 380;

        const surfGain = this.ctx.createGain();
        surfGain.gain.setValueAtTime(0.0001, now);
        surfGain.gain.linearRampToValueAtTime(0.035, now + 1.2);

        surf.connect(surfFilt); surfFilt.connect(surfGain); surfGain.connect(this.ctx.destination);
        surf.start(now);

        // Low underwater hum
        const hum = this.ctx.createOscillator();
        const humGain = this.ctx.createGain();
        hum.type = 'sine';
        hum.frequency.value = 55;
        humGain.gain.setValueAtTime(0.0001, now);
        humGain.gain.linearRampToValueAtTime(0.02, now + 2.0);
        hum.connect(humGain); humGain.connect(this.ctx.destination);
        hum.start(now);

        this._ambient = { surf, surfGain, hum, humGain };
    }

    stopAmbient() {
        if (!this._ambient) return;
        const { surf, surfGain, hum, humGain } = this._ambient;
        const now = this.ctx.currentTime;
        try {
            surfGain.gain.cancelScheduledValues(now);
            surfGain.gain.setValueAtTime(surfGain.gain.value, now);
            surfGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
            humGain.gain.cancelScheduledValues(now);
            humGain.gain.setValueAtTime(humGain.gain.value, now);
            humGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
            surf.stop(now + 0.6);
            hum.stop(now + 0.6);
        } catch (e) {}
        this._ambient = null;
    }

    // ------------------------------------------------------------
    //  NEW — MENU / UI
    // ------------------------------------------------------------
    playUIClick() {
        this._tone({ type: 'square', freq: 800, endFreq: 1000, gain: 0.12, duration: 0.05 });
    }

    playUIHover() {
        this._tone({ type: 'sine', freq: 1400, gain: 0.06, duration: 0.03 });
    }

    playSaveSuccess() {
        this._tone({ type: 'sine', freq: 660, gain: 0.2, duration: 0.12 });
        this._tone({ type: 'sine', freq: 990, gain: 0.18, duration: 0.18, delay: 0.08 });
    }

    playError() {
        this._tone({ type: 'square', freq: 200, endFreq: 120, gain: 0.25, duration: 0.15 });
        this._tone({ type: 'square', freq: 180, endFreq: 100, gain: 0.25, duration: 0.15, delay: 0.16 });
    }
}

const audio = new SoundEngine();