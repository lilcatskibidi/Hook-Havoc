class SoundEngine {
    constructor() { this.ctx = null; this.muted = false; }
    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    _gate() { return this.muted || !this.ctx; }

    playGunshot(type) {
        if (this._gate()) return;
        const now = this.ctx.currentTime;
        if (type === 'pistol') {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(320, now);
            o.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            g.gain.setValueAtTime(0.35, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + 0.1);
        } else if (type === 'shotgun') {
            const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            const n = this.ctx.createBufferSource(); n.buffer = buf;
            const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
            f.frequency.setValueAtTime(1200, now); f.frequency.exponentialRampToValueAtTime(60, now + 0.25);
            const g = this.ctx.createGain(); g.gain.setValueAtTime(0.6, now);
            g.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            n.connect(f); f.connect(g); g.connect(this.ctx.destination); n.start(now);
        } else if (type === 'rifle') {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'square'; o.frequency.setValueAtTime(480, now);
            o.frequency.exponentialRampToValueAtTime(80, now + 0.08);
            g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + 0.08);
        } else if (type === 'harpoon') {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'triangle'; o.frequency.setValueAtTime(150, now);
            o.frequency.exponentialRampToValueAtTime(600, now + 0.2);
            g.gain.setValueAtTime(0.45, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + 0.2);
        }
    }

    playCast() {
        if (this._gate()) return;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(200, this.ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15);
        g.gain.setValueAtTime(0.25, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.15);
    }

    playSplash() {
        if (this._gate()) return;
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const n = this.ctx.createBufferSource(); n.buffer = buf;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(800, this.ctx.currentTime);
        f.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.2);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.4, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        n.connect(f); f.connect(g); g.connect(this.ctx.destination); n.start();
    }

    playSnap() {
        if (this._gate()) return;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(900, this.ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.5, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.1);
    }

    playCoin() {
        if (this._gate()) return;
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(987.77, now);
        o.frequency.setValueAtTime(1318.51, now + 0.08);
        g.gain.setValueAtTime(0.2, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + 0.25);
    }

    playHit() {
        if (this._gate()) return;
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'square'; o.frequency.setValueAtTime(220, now);
        o.frequency.exponentialRampToValueAtTime(60, now + 0.08);
        g.gain.setValueAtTime(0.25, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + 0.08);
    }

    playBeach() {
        if (this._gate()) return;
        const now = this.ctx.currentTime;
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(120, now);
        o.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + 0.3);
        this.playSplash();
    }

    playLevelUp() {
        if (this._gate()) return;
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(freq, now + i * 0.1);
            g.gain.setValueAtTime(0, now + i * 0.1);
            g.gain.linearRampToValueAtTime(0.25, now + i * 0.1 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.25);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.3);
        });
    }
}

const audio = new SoundEngine();