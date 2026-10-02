class SoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        // Persistent ambient nodes (loops)
        this._ambient = null;
        this._reelLoop = null;
        // File-asset layer (assets/audio/*.wav). Missing/undecodable files
        // fall back to the synthesized versions below — the game never
        // goes silent and loader failures never throw.
        this._buf = {};      // name -> decoded AudioBuffer
        this._missing = {};  // name -> true (404/decode fail: don't retry)
        this._inflight = {}; // name -> true (fetch in progress)
        this._preloadStarted = false;
        this._music = null;  // loop nodes for music_loop.wav
        this._bossTheme = null; // loop nodes for boss_theme music
        // Volume buses (created on init): sfx + music -> master -> out.
        // Volumes are 0..1 fractions set by Settings (master/music/sfx).
        this._master = null;
        this._sfxBus = null;
        this._musBus = null;
        this.vol = { master: 1, music: 0.8, sfx: 1 };
    }

    init() {
        try {
            if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { this.ctx = null; return; }
        try {
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        } catch (e) {}
        try { this._ensureBuses(); } catch (e) {}
        // Fire-and-forget asset preload + music (both fully guarded).
        try { this.preloadAssets(); } catch (e) {}
        try { this.startMusic(); } catch (e) {}
    }

    // Volume bus graph: [sfx]--+-->[master]-->destination
    //                  [music]-+
    _ensureBuses() {
        if (!this.ctx || this._master) return;
        try {
            this._master = this.ctx.createGain();
            this._sfxBus = this.ctx.createGain();
            this._musBus = this.ctx.createGain();
            this._sfxBus.connect(this._master);
            this._musBus.connect(this._master);
            this._master.connect(this.ctx.destination);
            this.applyVolumes();
        } catch (e) { this._master = null; }
    }

    _sfx() {
        try { this._ensureBuses(); } catch (e) {}
        return (this._sfxBus) || (this.ctx && this.ctx.destination) || null;
    }

    _mus() {
        try { this._ensureBuses(); } catch (e) {}
        return (this._musBus) || (this.ctx && this.ctx.destination) || null;
    }

    // Fractions 0..1 (Settings stores 0..100). Never throws.
    applyVolumes(master, music, sfx) {
        try {
            const cl = v => Math.max(0, Math.min(1, (typeof v === 'number') ? v : 1));
            if (typeof master === 'number') this.vol.master = cl(master);
            if (typeof music === 'number') this.vol.music = cl(music);
            if (typeof sfx === 'number') this.vol.sfx = cl(sfx);
            if (!this.ctx) return;
            this._ensureBuses();
            const now = this.ctx.currentTime;
            if (this._master) {
                this._master.gain.cancelScheduledValues(now);
                this._master.gain.setValueAtTime(this.vol.master, now);
            }
            if (this._sfxBus) {
                this._sfxBus.gain.cancelScheduledValues(now);
                this._sfxBus.gain.setValueAtTime(this.vol.sfx, now);
            }
            if (this._musBus) {
                this._musBus.gain.cancelScheduledValues(now);
                this._musBus.gain.setValueAtTime(this.vol.music, now);
            }
        } catch (e) {}
    }

    _gate() { return this.muted || !this.ctx; }

    // Mute that actually silences loops too (suspend the whole graph).
    setMuted(m) {
        this.muted = !!m;
        try {
            if (!this.ctx) return;
            if (this.muted && this.ctx.state === 'running') this.ctx.suspend();
            else if (!this.muted && this.ctx.state === 'suspended') this.ctx.resume();
        } catch (e) {}
    }

    // ------------------------------------------------------------
    //  FILE ASSETS with bulletproof fallback
    //  Base names only — the loader tries .mp3, then .ogg, then .wav,
    //  so dropping ANY of `roar.mp3` / `roar.ogg` / `roar.wav` into
    //  assets/audio/ just works. (The old code hardcoded .wav, which is
    //  why mp3 files were silently ignored.) Undecodable bytes fall back
    //  to live synthesis; nothing here ever throws.
    // ------------------------------------------------------------
    static get ASSETS() {
        return {
            roar: 'assets/audio/roar',
            boss_roar: 'assets/audio/boss_roar',
            skill_cast: 'assets/audio/skill_cast',
            skill_zap: 'assets/audio/skill_zap',
            skill_blast: 'assets/audio/skill_blast',
            throw: 'assets/audio/throw',
            water_touch: 'assets/audio/water_touch',
            reload: 'assets/audio/reload',
            thunder: 'assets/audio/skill_blast',
            explosion: 'assets/audio/skill_blast',
            splash: 'assets/audio/water_touch',
            cast: 'assets/audio/throw',
            coin: 'assets/audio/coin',
            hit: 'assets/audio/hit',
            ui: 'assets/audio/ui_click',
            portal: 'assets/audio/portal',
            music: 'assets/audio/music_loop',
            boss_theme: 'assets/audio/boss_theme',
        };
    }

    // Extension priority: mp3 first (smallest), then ogg, then wav.
    static get ASSET_EXTS() { return ['mp3', 'ogg', 'wav']; }

    preloadAssets() {
        if (this._preloadStarted || !this.ctx) return;
        this._preloadStarted = true;
        const names = Object.keys(SoundEngine.ASSETS);
        names.forEach(n => { try { this._loadAsset(n); } catch (e) {} });
    }

    _fetchUrl(url, timeoutMs) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
        let ctrl = null, timer = null;
        try {
            if (typeof AbortController !== 'undefined') {
                ctrl = new AbortController();
                timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, timeoutMs || 8000);
            }
        } catch (e) { ctrl = null; }
        const opts = ctrl ? { signal: ctrl.signal } : undefined;
        return fetch(url, opts).then(res => {
            if (!res || !res.ok) throw new Error('http ' + (res && res.status));
            return res.arrayBuffer();
        }).then(ab => {
            if (timer) clearTimeout(timer);
            return ab;
        }).catch(err => {
            if (timer) clearTimeout(timer);
            throw err;
        });
    }

    _loadAsset(name) {
        if (!this.ctx || this._buf[name] || this._missing[name] || this._inflight[name]) return;
        const base = SoundEngine.ASSETS[name];
        if (!base) { this._missing[name] = true; return; }
        this._inflight[name] = true;
        const exts = SoundEngine.ASSET_EXTS.slice();
        const tryNext = () => {
            if (!exts.length) {
                // Every format failed: synth takes over, never retry.
                this._missing[name] = true;
                delete this._inflight[name];
                return;
            }
            const url = base + '.' + exts.shift();
            this._fetchUrl(url).then(ab => this._decode(ab)).then(decoded => {
                if (decoded) {
                    this._buf[name] = decoded;
                    delete this._inflight[name];
                    // Music files landing late still start their loops.
                    if ((name === 'music' || name === 'boss_theme')) {
                        try {
                            if (name === 'music') this.startMusic();
                        } catch (e) {}
                    }
                } else {
                    tryNext(); // undecodable bytes: try next extension
                }
            }).catch(() => tryNext()); // 404/offline/abort: next extension
        };
        tryNext();
    }

    _decode(ab) {
        if (!this.ctx || !ab) return Promise.resolve(null);
        try {
            const p = this.ctx.decodeAudioData(ab.slice ? ab.slice(0) : ab);
            if (p && typeof p.then === 'function') {
                return p.catch(() => null);
            }
        } catch (e) {}
        // Legacy callback form (old Safari).
        return new Promise(resolve => {
            try {
                this.ctx.decodeAudioData(ab,
                    buf => resolve(buf || null),
                    () => resolve(null));
            } catch (e) { resolve(null); }
        });
    }

    // Play a file asset. Returns true when actually played; false means
    // the caller must run its synthesized fallback (or stay silent).
    _playFile(name, opts = {}) {
        try {
            if (this._gate() || !this._buf[name]) return false;
            const { gain = 1, rate = 1 } = opts;
            const src = this.ctx.createBufferSource();
            src.buffer = this._buf[name];
            src.playbackRate.value = rate;
            const g = this.ctx.createGain();
            g.gain.value = gain;
            src.connect(g); g.connect(this._sfx() || this.ctx.destination);
            src.start(this.ctx.currentTime);
            return true;
        } catch (e) { return false; }
    }

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

        src.connect(filt); filt.connect(g); g.connect(this._sfx() || this.ctx.destination);
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

        o.connect(g); g.connect(this._sfx() || this.ctx.destination);
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
        if (this._playFile('cast', { gain: 0.9 })) return;
        this._tone({ type: 'sine', freq: 200, endFreq: 600, gain: 0.25, duration: 0.15 });
    }

    playSplash() {
        if (this._playFile('splash', { gain: 0.9 })) return;
        this._noiseBurst({ duration: 0.2, startFreq: 800, endFreq: 100, gain: 0.4 });
    }

    playSnap() {
        this._tone({ type: 'sawtooth', freq: 900, endFreq: 100, gain: 0.5, duration: 0.1 });
    }

    playCoin() {
        if (this._playFile('coin', { gain: 0.9 })) return;
        const now = this.ctx ? this.ctx.currentTime : 0;
        this._tone({ type: 'sine', freq: 987.77, gain: 0.2, duration: 0.12 });
        this._tone({ type: 'sine', freq: 1318.51, gain: 0.2, duration: 0.18, delay: 0.08 });
    }

    playHit() {
        if (this._playFile('hit', { gain: 0.9 })) return;
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

        src.connect(filt); filt.connect(g); g.connect(this._sfx() || this.ctx.destination);
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
    // Big beast roar — file asset first, synth fallback second.
    playRoar() {
        if (this._playFile('roar', { gain: 1 })) return;
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
        growl.connect(gg); gg.connect(this._sfx() || this.ctx.destination);
        growl.start(now); growl.stop(now + 1.0);

        // Modulated scream overlay
        const scream = this.ctx.createOscillator();
        const sg = this.ctx.createGain();
        scream.type = 'square';
        scream.frequency.setValueAtTime(180, now);
        scream.frequency.exponentialRampToValueAtTime(70, now + 0.6);
        sg.gain.setValueAtTime(0.15, now);
        sg.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        scream.connect(sg); sg.connect(this._sfx() || this.ctx.destination);
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
        if (this._playFile('explosion', { gain: 1 })) return;
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
        if (this._playFile('thunder', { gain: 0.9 })) return;
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

        surf.connect(surfFilt); surfFilt.connect(surfGain); surfGain.connect(this._mus() || this.ctx.destination);
        surf.start(now);

        // Low underwater hum
        const hum = this.ctx.createOscillator();
        const humGain = this.ctx.createGain();
        hum.type = 'sine';
        hum.frequency.value = 55;
        humGain.gain.setValueAtTime(0.0001, now);
        humGain.gain.linearRampToValueAtTime(0.02, now + 2.0);
        hum.connect(humGain); humGain.connect(this._mus() || this.ctx.destination);
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
    //  NEW — THROW / WATER TOUCH / RELOAD / SKILLS (file-first)
    // ------------------------------------------------------------
    // Bobber launch. Fallback: rising cast tone.
    playThrow() {
        if (this._playFile('throw', { gain: 0.9 })) return;
        this._tone({ type: 'sine', freq: 200, endFreq: 600, gain: 0.25, duration: 0.15 });
    }

    // Bobber touchdown on water. Fallback: generic splash.
    playWaterTouch() {
        if (this._playFile('water_touch', { gain: 0.9 })) return;
        this._noiseBurst({ duration: 0.2, startFreq: 800, endFreq: 100, gain: 0.4 });
    }

    // Staged mag-out / rack / mag-in / snap. Fallback: two dry clicks.
    playReload() {
        if (this._playFile('reload', { gain: 1 })) return;
        this._tone({ type: 'square', freq: 1800, gain: 0.12, duration: 0.03 });
        this._tone({ type: 'square', freq: 1200, gain: 0.14, duration: 0.04, delay: 0.18 });
        this._tone({ type: 'square', freq: 2200, gain: 0.14, duration: 0.04, delay: 0.42 });
    }

    // Fish/boss skill charge-up. Fallback: rising zap tone.
    playSkillCast() {
        if (this._playFile('skill_cast', { gain: 0.85 })) return;
        this._tone({ type: 'sawtooth', freq: 220, endFreq: 1300, gain: 0.16, duration: 0.3 });
    }

    // Electric discharge. Fallback: crackle approximation.
    playSkillZap() {
        if (this._playFile('skill_zap', { gain: 0.9 })) return;
        this._tone({ type: 'square', freq: 1900, endFreq: 320, gain: 0.14, duration: 0.18 });
        this._noiseBurst({ duration: 0.2, startFreq: 4000, endFreq: 900, gain: 0.14, filterType: 'highpass' });
    }

    // Heavy skill detonation. Fallback: compact boom.
    playSkillBlast() {
        if (this._playFile('skill_blast', { gain: 1 })) return;
        this._tone({ type: 'sawtooth', freq: 120, endFreq: 30, gain: 0.4, duration: 0.5 });
        this._noiseBurst({ duration: 0.5, startFreq: 900, endFreq: 60, gain: 0.35 });
    }

    // ------------------------------------------------------------
    //  MUSIC — looping tide (file) with synth-ambient fallback
    // ------------------------------------------------------------
    startMusic() {
        if (this._gate() || this._music) return;
        // File loop needs the buffer; otherwise the synth surf takes over.
        if (!this._buf.music) {
            try { this._loadAsset('music'); } catch (e) {}
            try { this.startAmbient(); } catch (e) {}
            return;
        }
        try {
            const now = this.ctx.currentTime;
            // File loop wins over the synth surf — never layer both.
            try { this.stopAmbient(); } catch (e) {}
            const src = this.ctx.createBufferSource();
            src.buffer = this._buf.music;
            src.loop = true;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.0001, now);
            g.gain.linearRampToValueAtTime(0.30, now + 2.0);
            src.connect(g); g.connect(this._mus() || this.ctx.destination);
            src.start(now);
            this._music = { src, gain: g };
        } catch (e) { this._music = null; }
    }

    stopMusic() {
        if (this._music) {
            const { src, gain } = this._music;
            try {
                const now = this.ctx.currentTime;
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
                src.stop(now + 0.6);
            } catch (e) {}
            this._music = null;
        }
        try { this.stopAmbient(); } catch (e) {}
    }

    // Boss war-drum loop. Ducks the tide music while it plays; resumes it
    // after. File-first, silent when the asset is missing.
    startBossTheme() {
        if (this._gate() || this._bossTheme) return;
        if (!this._buf.boss_theme) {
            try { this._loadAsset('boss_theme'); } catch (e) {}
            return;
        }
        try {
            const now = this.ctx.currentTime;
            try { this.stopMusic(); } catch (e) {}
            const src = this.ctx.createBufferSource();
            src.buffer = this._buf.boss_theme;
            src.loop = true;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.0001, now);
            g.gain.linearRampToValueAtTime(0.5, now + 1.5);
            src.connect(g); g.connect(this._mus() || this.ctx.destination);
            src.start(now);
            this._bossTheme = { src, gain: g };
        } catch (e) { this._bossTheme = null; }
    }

    stopBossTheme() {
        if (!this._bossTheme) return;
        const { src, gain } = this._bossTheme;
        try {
            const now = this.ctx.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
            src.stop(now + 0.8);
        } catch (e) {}
        this._bossTheme = null;
        // Tide music comes back (file loop or synth surf, whichever exists)
        try { this.startMusic(); } catch (e) {}
    }

    // War-horn boss roar. Fallback: the regular roar synth.
    playBossRoar() {
        if (this._playFile('boss_roar', { gain: 1 })) return;
        try { this.playRoar(); } catch (e) {}
    }

    // Void portal traverse. Fallback: whoosh + low bloom.
    playPortal() {
        if (this._playFile('portal', { gain: 1 })) return;
        this._noiseBurst({ duration: 0.5, startFreq: 300, endFreq: 2400, gain: 0.3, filterType: 'bandpass' });
        this._tone({ type: 'sine', freq: 160, endFreq: 70, gain: 0.3, duration: 0.6 });
    }

    // ------------------------------------------------------------
    //  NEW — MENU / UI
    // ------------------------------------------------------------
    playUIClick() {
        if (this._playFile('ui', { gain: 0.8 })) return;
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

// Auto-unlock on first gesture (autoplay policy): init is idempotent and
// fully guarded, so attaching it everywhere is safe.
try {
    const unlock = () => { try { audio.init(); } catch (e) {} };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
} catch (e) {}