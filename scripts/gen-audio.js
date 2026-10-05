// Offline SFX/music synthesizer — zero dependencies.
// Renders real .wav assets into assets/audio/ with deterministic DSP
// (seeded noise), so the game can play files first and fall back to
// live WebAudio synthesis when a file is missing/undecodable.
const fs = require('fs');
const path = require('path');

const SR = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(OUT, { recursive: true });

// Deterministic PRNG (mulberry32) — same bytes on every machine.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sine = p => Math.sin(2 * Math.PI * p);
const saw = p => 2 * ((p % 1 + 1) % 1) - 1;
const sqr = p => (((p % 1 + 1) % 1) < 0.5 ? 1 : -1);

// One-pole lowpass over a Float64Array, cutoff in Hz.
function lowpass(x, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / SR;
  const a = dt / (rc + dt);
  let y = 0;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); out[i] = y; }
  return out;
}

// Exponential decay envelope with attack.
function adsr(n, attackSec, decayTau) {
  const env = new Float64Array(n);
  const a = Math.max(1, Math.floor(attackSec * SR));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const atk = Math.min(1, i / a);
    env[i] = atk * Math.exp(-t / decayTau);
  }
  return env;
}

function normalize(x, peak) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m < 1e-6) return x;
  const k = peak / m;
  for (let i = 0; i < x.length; i++) x[i] *= k;
  return x;
}

function writeWav(name, x) {
  const p = path.join(OUT, name);
  // NEVER clobber the player's own files: the audio Readme states some
  // sounds are already custom. Skip existing files unless --force is given.
  if (fs.existsSync(p) && !process.argv.includes('--force')) {
    console.log(name, 'SKIPPED (custom file kept) — rerun with --force to overwrite');
    return;
  }
  const n = x.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, x[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(p, buf);
  console.log(name, (buf.length / 1024).toFixed(1) + 'KB');
}

const N = sec => Math.floor(sec * SR);

// ---- ROAR: abyssal beast (1.4s) ----
(function roar() {
  const n = N(1.4), R = rng(7);
  const x = new Float64Array(n);
  let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 1.4;
    const f1 = 90 - 45 * k, f2 = 135 - 60 * k, f3 = 700 - 480 * k;
    p1 += f1 / SR; p2 += f2 / SR; p3 += f3 / SR;
    const am = 0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * t);
    x[i] = (saw(p1) * 0.5 + saw(p2) * 0.28 + sqr(p3) * 0.10 * am) * Math.exp(-t / 0.75)
         + (R() * 2 - 1) * 0.22 * Math.exp(-t / 0.5);
  }
  // sub thump under it
  let ps = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ps += (65 - 35 * (t / 1.4)) / SR;
    x[i] += sine(ps) * 0.35 * Math.exp(-t / 0.6);
  }
  writeWav('roar.wav', normalize(Float64Array.from(lowpass(x, 2400)), 0.85));
})();

// ---- SKILL_CAST: rising charge (0.4s) ----
(function cast() {
  const n = N(0.4);
  const x = new Float64Array(n);
  let p = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 0.4;
    const f = 220 + 1180 * k * k;
    p += f / SR; p2 += f * 1.5 / SR;
    x[i] = (sine(p) * 0.55 + sine(p2) * 0.25) * Math.min(1, t / 0.03) * (1 - k * 0.25);
  }
  writeWav('skill_cast.wav', normalize(x, 0.8));
})();

// ---- SKILL_ZAP: crackling discharge (0.45s) ----
(function zap() {
  const n = N(0.45), R = rng(21);
  const x = new Float64Array(n);
  const env = adsr(n, 0.004, 0.10);
  for (let i = 0; i < n; i++) {
    // random impulse crackle
    const imp = R() < 0.22 ? (R() * 2 - 1) * 1.4 : (R() * 2 - 1) * 0.18;
    x[i] = imp * env[i];
  }
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (1900 - 1500 * (t / 0.45)) / SR;
    x[i] += sqr(p) * 0.22 * Math.exp(-t / 0.12);
  }
  writeWav('skill_zap.wav', normalize(x, 0.8));
})();

// ---- SKILL_BLAST: heavy detonation (0.9s) ----
(function blast() {
  const n = N(0.9), R = rng(33);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 0.9;
    const f = 130 - 100 * k;
    p += f / SR;
    x[i] = sine(p) * 0.7 * Math.exp(-t / 0.35)
         + (R() * 2 - 1) * 0.5 * Math.exp(-t / 0.28);
  }
  // click transient
  for (let i = 0; i < Math.floor(0.008 * SR); i++) x[i] += (R() * 2 - 1) * 0.5;
  writeWav('skill_blast.wav', normalize(Float64Array.from(lowpass(x, 3200)), 0.85));
})();

// ---- THROW: bobber launch whoosh (0.32s) ----
(function throwing() {
  const n = N(0.32), R = rng(44);
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  // band feel: highpass-ish by differentiating + lowpass cap
  const lp = lowpass(raw, 3800);
  const x = new Float64Array(n);
  for (let i = 1; i < n; i++) x[i] = (lp[i] - lp[i - 1]) * 2.2;
  const env = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    env[i] = Math.sin(Math.PI * Math.min(1, k * 1.15)); // swell then cut
  }
  for (let i = 0; i < n; i++) x[i] *= env[i];
  writeWav('throw.wav', normalize(x, 0.8));
})();

// ---- WATER_TOUCH: droplet plip + splash (0.5s) ----
(function touch() {
  const n = N(0.5), R = rng(55);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 950 - 620 * Math.min(1, t / 0.09);
    p += f / SR;
    x[i] = sine(p) * 0.5 * Math.exp(-t / 0.07);
  }
  const noise = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    noise[i] = (R() * 2 - 1) * Math.exp(-Math.max(0, t - 0.05) / 0.11) * (t >= 0.05 ? 1 : 0);
  }
  const spl = lowpass(noise, 2600);
  for (let i = 0; i < n; i++) x[i] += spl[i] * 0.8;
  // two late droplets
  [[0.22, 1400], [0.33, 1100]].forEach(([dt, f0]) => {
    let pp = 0;
    const s0 = Math.floor(dt * SR);
    for (let i = s0; i < n; i++) {
      const t = (i - s0) / SR;
      pp += (f0 - 500 * Math.min(1, t / 0.06)) / SR;
      x[i] += sine(pp) * 0.25 * Math.exp(-t / 0.05);
    }
  });
  writeWav('water_touch.wav', normalize(x, 0.8));
})();

// ---- RELOAD: staged click-clack (0.8s) ----
(function reload() {
  const n = N(0.8), R = rng(66);
  const x = new Float64Array(n);
  function click(at, body, bright) {
    const s0 = Math.floor(at * SR);
    let p = 0;
    for (let i = s0; i < Math.min(n, s0 + Math.floor(0.09 * SR)); i++) {
      const t = (i - s0) / SR;
      p += 2100 / SR;
      x[i] += (sine(p) * 0.4 + (R() * 2 - 1) * 0.6) * Math.exp(-t / 0.018) * body
            + sine(p * 0.5) * 0.3 * Math.exp(-t / 0.03) * bright;
    }
  }
  function slide(at, dur) {
    const s0 = Math.floor(at * SR), m = Math.floor(dur * SR);
    for (let i = s0; i < Math.min(n, s0 + m); i++) {
      const t = (i - s0) / SR;
      x[i] += (R() * 2 - 1) * 0.30 * Math.sin(Math.PI * (i - s0) / m);
    }
  }
  click(0.05, 1.0, 0.6);   // mag out
  slide(0.22, 0.16);       // slide rack
  click(0.42, 0.9, 0.8);   // mag in
  click(0.62, 1.1, 1.0);   // snap shut
  writeWav('reload.wav', normalize(Float64Array.from(lowpass(x, 6500)), 0.82));
})();

// ---- MUSIC_LOOP: seamless ambient tide (9.6s) ----
(function music() {
  const DUR = 9.6, n = N(DUR), R = rng(99);
  const x = new Float64Array(n);
  // Pad: Am throughout, inner voices cycle with WHOLE periods (seamless).
  const voices = [
    { f: 110.00, a: 0.20, cyc: 3 },  // A2
    { f: 164.81, a: 0.14, cyc: 5 },  // E3
    { f: 220.00, a: 0.16, cyc: 4 },  // A3
    { f: 261.63, a: 0.10, cyc: 6 },  // C4
    { f: 329.63, a: 0.08, cyc: 7 },  // E4
  ];
  const vph = voices.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    voices.forEach((v, vi) => {
      vph[vi] += v.f / SR;
      const lfo = 0.7 + 0.3 * Math.sin(2 * Math.PI * v.cyc * t / DUR);
      s += (sine(vph[vi]) * 0.8 + sine(vph[vi] * 2.001) * 0.2) * v.a * lfo;
    });
    // gentle swell, 1 whole cycle -> seamless
    x[i] = s * (0.75 + 0.25 * Math.sin(2 * Math.PI * t / DUR - Math.PI / 2));
  }
  // Surf: 3.2s seamless tile (raised-cosine edge blend) repeated 3x.
  const TILE = 3.2, tn = N(TILE);
  const traw = new Float64Array(tn);
  for (let i = 0; i < tn; i++) traw[i] = R() * 2 - 1;
  const tsurf = lowpass(traw, 500);
  const B = Math.floor(0.3 * SR);
  for (let i = 0; i < B; i++) {
    const k = i / B, w = 0.5 - 0.5 * Math.cos(Math.PI * k);
    tsurf[i] = tsurf[i] * w + tsurf[tn - B + i] * (1 - w);
  }
  const tile = tsurf.slice(0, tn - B);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * t / TILE - Math.PI / 2);
    x[i] += tile[i % tile.length] * 0.35 * (0.35 + 0.65 * swell);
  }
  // soft sub pulse, whole cycles
  let ps = 0;
  for (let i = 0; i < n; i++) {
    ps += 55 / SR;
    x[i] += sine(ps) * 0.05 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * (i / SR) / DUR));
  }
  writeWav('music_loop.wav', normalize(Float64Array.from(lowpass(x, 1800)), 0.5));
})();

// ---- BOSS_ROAR: deeper, longer war-horn beast (2.0s) ----
(function bossRoar() {
  const n = N(2.0), R = rng(101);
  const x = new Float64Array(n);
  let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 2.0;
    const f1 = 70 - 32 * k, f2 = 105 - 45 * k, f3 = 520 - 360 * k;
    p1 += f1 / SR; p2 += f2 / SR; p3 += f3 / SR;
    const am = 0.55 + 0.45 * Math.sin(2 * Math.PI * 7 * t);
    x[i] = (saw(p1) * 0.55 + saw(p2) * 0.3 + sqr(p3) * 0.12 * am) * Math.exp(-t / 1.1)
         + (R() * 2 - 1) * 0.20 * Math.exp(-t / 0.8);
  }
  let ps = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ps += (50 - 26 * (t / 2.0)) / SR;
    x[i] += sine(ps) * 0.4 * Math.exp(-t / 0.9);
  }
  writeWav('boss_roar.wav', normalize(Float64Array.from(lowpass(x, 2000)), 0.85));
})();

// ---- BOSS_THEME: dark war-drum loop, seamless (12.8s) ----
(function bossTheme() {
  const DUR = 12.8, n = N(DUR), R = rng(202);
  const x = new Float64Array(n);
  // War drums: 4-on-floor kicks (2 whole bars of 4/4 at 75bpm = 12.8s)
  const BEAT = DUR / 16;
  function kick(at) {
    const s0 = Math.floor(at * SR);
    let p = 0;
    for (let i = s0; i < Math.min(n, s0 + Math.floor(0.35 * SR)); i++) {
      const t = (i - s0) / SR;
      p += (110 - 260 * Math.min(1, t / 0.3)) / SR;
      x[i] += sine(p) * 0.9 * Math.exp(-t / 0.12);
    }
  }
  function snare(at) {
    const s0 = Math.floor(at * SR);
    for (let i = s0; i < Math.min(n, s0 + Math.floor(0.18 * SR)); i++) {
      const t = (i - s0) / SR;
      x[i] += (R() * 2 - 1) * 0.4 * Math.exp(-t / 0.05);
    }
  }
  for (let b = 0; b < 16; b++) {
    kick(b * BEAT);
    if (b % 4 === 2) snare(b * BEAT);
  }
  // Dread choir-ish pad: D minor drone, whole-cycle swells (seamless)
  const drone = [73.42, 87.31, 110.0, 146.83];
  const dph = drone.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    drone.forEach((f, vi) => {
      dph[vi] += f / SR;
      s += (saw(dph[vi]) * 0.5 + sine(dph[vi] * 0.5) * 0.5) * 0.09;
    });
    s *= 0.7 + 0.3 * Math.sin(2 * Math.PI * 2 * t / DUR);
    x[i] += s;
  }
  // Distant metallic alarm every 2 bars (whole cycles only)
  for (let rep = 0; rep < 4; rep++) {
    const at = Math.floor((rep * 3.2 + 1.6) * SR);
    let p = 0;
    for (let i = at; i < Math.min(n, at + Math.floor(0.8 * SR)); i++) {
      const t = (i - at) / SR;
      p += 1240 / SR;
      x[i] += sine(p) * 0.10 * Math.exp(-t / 0.4);
    }
  }
  writeWav('boss_theme.wav', normalize(Float64Array.from(lowpass(x, 3600)), 0.55));
})();

// ---- COIN: bright two-ping chime (0.3s) ----
(function coin() {
  const n = N(0.3);
  const x = new Float64Array(n);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p1 += 987.77 / SR;
    x[i] += sine(p1) * 0.5 * Math.exp(-t / 0.06) * (t < 0.12 ? 1 : 0);
    if (t >= 0.08) {
      p2 += 1318.51 / SR;
      x[i] += sine(p2) * 0.5 * Math.exp(-(t - 0.08) / 0.09);
    }
  }
  writeWav('coin.wav', normalize(x, 0.8));
})();

// ---- HIT: dry impact thock (0.12s) ----
(function hit() {
  const n = N(0.12), R = rng(303);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (230 - 700 * Math.min(1, t / 0.1)) / SR;
    x[i] = (sqr(p) * 0.5 + (R() * 2 - 1) * 0.4) * Math.exp(-t / 0.03);
  }
  writeWav('hit.wav', normalize(x, 0.8));
})();

// ---- UI_CLICK: soft blip (0.07s) ----
(function ui() {
  const n = N(0.07);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (800 + 1400 * (t / 0.07)) / SR;
    x[i] = sine(p) * 0.6 * Math.exp(-t / 0.02);
  }
  writeWav('ui_click.wav', normalize(x, 0.75));
})();

// ---- PORTAL: void traverse swell + shimmer (1.0s) ----
(function portal() {
  const n = N(1.0), R = rng(404);
  const x = new Float64Array(n);
  // deep swell diving down, then blooming back up
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 1.0;
    const f = 160 - 110 * Math.sin(Math.PI * Math.min(1, k));
    p += f / SR;
    const env = Math.sin(Math.PI * Math.min(1, k * 1.05));
    x[i] = (sine(p) * 0.6 + sine(p * 2.02) * 0.2) * env;
  }
  // void shimmer: airy band swept upward
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  const air = lowpass(raw, 5200);
  for (let i = 1; i < n; i++) {
    const t = i / SR;
    x[i] += (air[i] - air[i - 1]) * 1.6 * Math.sin(Math.PI * Math.min(1, t)) * 0.8;
  }
  // arrival chime
  let pc = 0;
  const s0 = Math.floor(0.72 * SR);
  for (let i = s0; i < n; i++) {
    const t = (i - s0) / SR;
    pc += 1568 / SR;
    x[i] += sine(pc) * 0.22 * Math.exp(-t / 0.09);
  }
  writeWav('portal.wav', normalize(x, 0.8));
})();

// ---- THUNDER: rolling crack (1.1s) ----
(function thunder() {
  const n = N(1.1), R = rng(505);
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  const x = Float64Array.from(lowpass(raw, 420));
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (75 - 45 * (t / 1.1)) / SR;
    x[i] = x[i] * 0.9 * Math.exp(-t / 0.55) + sine(p) * 0.45 * Math.exp(-t / 0.5);
  }
  // initial crack transient
  for (let i = 0; i < Math.floor(0.02 * SR); i++) x[i] += (R() * 2 - 1) * 0.7;
  writeWav('thunder.wav', normalize(x, 0.85));
})();

// ---- EXPLOSION: deep boom + debris (0.9s) ----
(function explosion() {
  const n = N(0.9), R = rng(606);
  const x = new Float64Array(n);
  let p = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 0.9;
    p += (95 - 65 * k) / SR; p2 += (58 - 32 * k) / SR;
    x[i] = sine(p) * 0.6 * Math.exp(-t / 0.3)
         + sine(p2) * 0.4 * Math.exp(-t / 0.45)
         + (R() * 2 - 1) * 0.45 * Math.exp(-t / 0.25);
  }
  writeWav('explosion.wav', normalize(Float64Array.from(lowpass(x, 2800)), 0.85));
})();

// ---- SPLASH: water slap (0.35s) ----
(function splash() {
  const n = N(0.35), R = rng(707);
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  const x = Float64Array.from(lowpass(raw, 1800));
  const env = adsr(n, 0.005, 0.09);
  for (let i = 0; i < n; i++) x[i] *= env[i];
  writeWav('splash.wav', normalize(x, 0.8));
})();

// ---- CAST: line whistle up (0.18s) ----
(function cast() {
  const n = N(0.18);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 0.18;
    p += (200 + 420 * k) / SR;
    x[i] = sine(p) * 0.6 * Math.sin(Math.PI * Math.min(1, k * 1.1));
  }
  writeWav('cast.wav', normalize(x, 0.75));
})();

// ---- SNAP: line crack (0.12s) ----
(function snap() {
  const n = N(0.12), R = rng(808);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (900 - 780 * Math.min(1, t / 0.1)) / SR;
    x[i] = (saw(p) * 0.6 + (R() * 2 - 1) * 0.4) * Math.exp(-t / 0.035);
  }
  writeWav('snap.wav', normalize(x, 0.8));
})();

// ---- BEACH: soft thud + droplets (0.45s) ----
(function beach() {
  const n = N(0.45), R = rng(909);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (120 - 80 * Math.min(1, t / 0.3)) / SR;
    x[i] = sine(p) * 0.55 * Math.exp(-t / 0.16);
  }
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  const spl = lowpass(raw, 2200);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] += spl[i] * 0.5 * Math.exp(-Math.max(0, t - 0.06) / 0.1) * (t >= 0.06 ? 1 : 0);
  }
  writeWav('beach.wav', normalize(x, 0.8));
})();

// ---- LEVELUP: rising arp (0.55s) ----
(function levelup() {
  const n = N(0.55);
  const x = new Float64Array(n);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    let p = 0;
    const s0 = Math.floor(i * 0.1 * SR);
    for (let j = s0; j < n; j++) {
      const t = (j - s0) / SR;
      p += f / SR;
      x[j] += sine(p) * 0.3 * Math.exp(-t / 0.14);
    }
  });
  writeWav('levelup.wav', normalize(x, 0.8));
})();

// ---- REELTICK: tiny click (0.05s) ----
(function reeltick() {
  const n = N(0.05);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (1100 - 200 * (t / 0.05)) / SR;
    x[i] = sqr(p) * 0.4 * Math.exp(-t / 0.015);
  }
  writeWav('reeltick.wav', normalize(x, 0.7));
})();

// ---- TENSIONSTRESS: strained whine (0.2s) ----
(function tensionstress() {
  const n = N(0.2);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (1800 + 500 * Math.sin(2 * Math.PI * 30 * t)) / SR;
    x[i] = saw(p) * 0.4 * Math.exp(-t / 0.09);
  }
  writeWav('tensionstress.wav', normalize(Float64Array.from(lowpass(x, 5000)), 0.75));
})();

// ---- FISHSCREECH: wet shriek (0.35s) ----
(function fishscreech() {
  const n = N(0.35), R = rng(111);
  const x = new Float64Array(n);
  let p = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 0.35;
    p += (820 - 480 * k) / SR; p2 += (1230 - 700 * k) / SR;
    x[i] = (saw(p) * 0.35 + sine(p2) * 0.3) * Math.exp(-t / 0.16)
         + (R() * 2 - 1) * 0.12 * Math.exp(-t / 0.1);
  }
  writeWav('fishscreech.wav', normalize(x, 0.8));
})();

// ---- WHOOSH: air rush (0.3s) ----
(function whoosh() {
  const n = N(0.3), R = rng(222);
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  const lp = lowpass(raw, 2400);
  const x = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const k = i / n;
    x[i] = (lp[i] - lp[i - 1]) * 2.4 * Math.sin(Math.PI * k);
  }
  writeWav('whoosh.wav', normalize(x, 0.8));
})();

// ---- BUBBLE: rising blip (0.16s) ----
(function bubble() {
  const n = N(0.16);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 0.16;
    p += (320 + 560 * k) / SR;
    x[i] = sine(p) * 0.55 * Math.sin(Math.PI * k);
  }
  writeWav('bubble.wav', normalize(x, 0.75));
})();

// ---- ICECRACK: brittle snaps (0.3s) ----
(function icecrack() {
  const n = N(0.3), R = rng(333);
  const x = new Float64Array(n);
  let p = 0;
  const hits = [0.02, 0.09, 0.16, 0.23];
  hits.forEach(h => {
    const s0 = Math.floor(h * SR);
    for (let i = s0; i < Math.min(n, s0 + Math.floor(0.05 * SR)); i++) {
      const t = (i - s0) / SR;
      p += (1400 + R() * 800) / SR;
      x[i] += (sine(p) * 0.4 + (R() * 2 - 1) * 0.4) * Math.exp(-t / 0.014);
    }
  });
  writeWav('icecrack.wav', normalize(x, 0.8));
})();

// ---- HURT: player grunt-hit (0.2s) ----
(function hurt() {
  const n = N(0.2), R = rng(444);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += (190 - 120 * (t / 0.2)) / SR;
    x[i] = (saw(p) * 0.5 + (R() * 2 - 1) * 0.25) * Math.exp(-t / 0.07);
  }
  writeWav('hurt.wav', normalize(x, 0.8));
})();

// ---- FISHDEATH: descending wail (0.7s) ----
(function fishdeath() {
  const n = N(0.7), R = rng(555);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 0.7;
    p += (520 - 430 * k) / SR;
    x[i] = (saw(p) * 0.45 + (R() * 2 - 1) * 0.15) * Math.exp(-t / 0.3);
  }
  writeWav('fishdeath.wav', normalize(Float64Array.from(lowpass(x, 3000)), 0.8));
})();

// ---- BOSSKILLED: kill fanfare boom (1.4s) ----
(function bosskilled() {
  const n = N(1.4), R = rng(666);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / 1.4;
    p += (210 - 165 * k) / SR;
    x[i] = (saw(p) * 0.5 + (R() * 2 - 1) * 0.25) * Math.exp(-t / 0.5);
  }
  [523.25, 659.25, 783.99].forEach((f, i) => {
    let pp = 0;
    const s0 = Math.floor((0.35 + i * 0.14) * SR);
    for (let j = s0; j < n; j++) {
      const t = (j - s0) / SR;
      pp += f / SR;
      x[j] += sine(pp) * 0.22 * Math.exp(-t / 0.3);
    }
  });
  writeWav('bosskilled.wav', normalize(x, 0.82));
})();

// ---- VICTORY: major arp (0.6s) ----
(function victory() {
  const n = N(0.6);
  const x = new Float64Array(n);
  [392.0, 523.25, 659.25, 783.99].forEach((f, i) => {
    let p = 0;
    const s0 = Math.floor(i * 0.09 * SR);
    for (let j = s0; j < n; j++) {
      const t = (j - s0) / SR;
      p += f / SR;
      x[j] += sine(p) * 0.3 * Math.exp(-t / 0.18);
    }
  });
  writeWav('victory.wav', normalize(x, 0.8));
})();

// ---- UIHOVER: feather tick (0.04s) ----
(function uihover() {
  const n = N(0.04);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += 1400 / SR;
    x[i] = sine(p) * 0.4 * Math.exp(-t / 0.012);
  }
  writeWav('uihover.wav', normalize(x, 0.7));
})();

// ---- SAVESUCCESS: soft two-note confirm (0.3s) ----
(function savesuccess() {
  const n = N(0.3);
  const x = new Float64Array(n);
  [[660, 0], [990, 0.08]].forEach(([f, dt]) => {
    let p = 0;
    const s0 = Math.floor(dt * SR);
    for (let j = s0; j < n; j++) {
      const t = (j - s0) / SR;
      p += f / SR;
      x[j] += sine(p) * 0.35 * Math.exp(-t / 0.09);
    }
  });
  writeWav('savesuccess.wav', normalize(x, 0.78));
})();

// ---- ERROR: dull buzz (0.18s) ----
(function error() {
  const n = N(0.18);
  const x = new Float64Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    p += 160 / SR;
    x[i] = sqr(p) * 0.4 * Math.exp(-t / 0.07);
  }
  writeWav('error.wav', normalize(Float64Array.from(lowpass(x, 1200)), 0.75));
})();

// ---- BELL: deep abyssal toll (2.4s) ----
(function bell() {
  const n = N(2.4);
  const x = new Float64Array(n);
  [[98, 0.5, 2.2], [147, 0.3, 1.8], [196, 0.25, 1.5], [294, 0.12, 1.0]].forEach(([f, a, d]) => {
    let p = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      p += f / SR;
      x[i] += sine(p) * a * Math.exp(-t / (d / 2.2));
    }
  });
  writeWav('bell.wav', normalize(x, 0.8));
})();

// ---- GUNSHOTS: per-family shots ----
(function gunshots() {
  function shot(name, seed, dur, fn) {
    const n = N(dur), R = rng(seed);
    const x = new Float64Array(n);
    fn(x, n, R);
    writeWav(name + '.wav', normalize(x, 0.82));
  }
  shot('gun_pistol', 1001, 0.12, (x, n, R) => {
    let p = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; p += (320 - 260 * (t / 0.12)) / SR; x[i] = saw(p) * 0.6 * Math.exp(-t / 0.035); }
  });
  shot('gun_shotgun', 1002, 0.3, (x, n, R) => {
    for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (R() * 2 - 1) * 0.8 * Math.exp(-t / 0.07); }
    const lp = lowpass(x, 1400);
    for (let i = 0; i < n; i++) x[i] = lp[i];
  });
  shot('gun_rifle', 1003, 0.1, (x, n) => {
    let p = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; p += (480 - 390 * (t / 0.1)) / SR; x[i] = sqr(p) * 0.55 * Math.exp(-t / 0.03); }
  });
  shot('gun_harpoon', 1004, 0.25, (x, n) => {
    let p = 0, p2 = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; p += (150 + 450 * (t / 0.25)) / SR; p2 += 90 / SR; x[i] = (sine(p) * 0.5 + sine(p2) * 0.3) * Math.exp(-t / 0.1); }
  });
  shot('gun_smg', 1005, 0.07, (x, n) => {
    let p = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; p += (620 - 480 * (t / 0.07)) / SR; x[i] = sqr(p) * 0.45 * Math.exp(-t / 0.02); }
  });
  shot('gun_rail', 1006, 0.4, (x, n, R) => {
    let p = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; p += (180 + 720 * (t / 0.4)) / SR; x[i] = (saw(p) * 0.5 + (R() * 2 - 1) * 0.2) * Math.exp(-t / 0.14); }
  });
  shot('gun_plasma', 1007, 0.2, (x, n) => {
    let p = 0, p2 = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; p += (500 + 700 * (t / 0.2)) / SR; p2 += (200 - 140 * (t / 0.2)) / SR; x[i] = (sine(p) * 0.4 + sine(p2) * 0.3) * Math.exp(-t / 0.08); }
  });
  shot('gun_flame', 1008, 0.15, (x, n, R) => {
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
    const lp = lowpass(raw, 900);
    for (let i = 0; i < n; i++) { const t = i / SR; x[i] = lp[i] * 0.8 * Math.exp(-t / 0.06); }
  });
  shot('gun_launcher', 1009, 0.35, (x, n, R) => {
    let p = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; p += (120 - 80 * (t / 0.35)) / SR; x[i] = (sine(p) * 0.6 + (R() * 2 - 1) * 0.35) * Math.exp(-t / 0.12); }
  });
})();

// ---- SACRIFICE: dark choir swell + heart thump (2.2s) ----
(function sacrifice() {
  const n = N(2.2), R = rng(777);
  const x = new Float64Array(n);
  // low choir swell
  [73.42, 87.31, 110.0, 130.81].forEach((f, vi) => {
    let p = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, k = t / 2.2;
      p += f / SR;
      const env = Math.sin(Math.PI * Math.min(1, k * 1.05));
      x[i] += (saw(p) * 0.22 + sine(p * 0.5) * 0.18) * env;
    }
  });
  // heart thumps, accelerating
  [0.5, 0.95, 1.3, 1.58, 1.8].forEach(dt => {
    let p = 0;
    const s0 = Math.floor(dt * SR);
    for (let i = s0; i < Math.min(n, s0 + Math.floor(0.22 * SR)); i++) {
      const t = (i - s0) / SR;
      p += (70 - 40 * Math.min(1, t / 0.2)) / SR;
      x[i] += sine(p) * 0.5 * Math.exp(-t / 0.09);
    }
  });
  // ash noise wash
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  const wash = lowpass(raw, 900);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    x[i] += wash[i] * 0.22 * Math.sin(Math.PI * k);
  }
  writeWav('sacrifice.wav', normalize(Float64Array.from(lowpass(x, 2400)), 0.85));
})();

// ---- THEME_CAVE: deep stone drone + drips (8s, seamless) ----
(function themeCave() {
  const DUR = 8, n = N(DUR);
  const x = new Float64Array(n);
  const drone = [36.71, 55.0, 73.42];
  const dph = drone.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    drone.forEach((f, vi) => {
      dph[vi] += f / SR;
      s += (sine(dph[vi]) * 0.7 + sine(dph[vi] * 0.5) * 0.3) * 0.14;
    });
    s *= 0.8 + 0.2 * Math.sin(2 * Math.PI * t / DUR);
    x[i] = s;
  }
  // sparse drips, whole-cycle placed
  const R = rng(808);
  for (let d = 0; d < 5; d++) {
    const at = Math.floor((d * 1.6 + 0.4) * SR);
    let p = 0;
    for (let i = at; i < Math.min(n, at + Math.floor(0.3 * SR)); i++) {
      const t = (i - at) / SR;
      p += (1400 - 900 * Math.min(1, t / 0.2)) / SR;
      x[i] += sine(p) * 0.10 * Math.exp(-t / 0.08);
    }
  }
  writeWav('theme_cave.wav', normalize(Float64Array.from(lowpass(x, 900)), 0.5));
})();

// ---- THEME_TEMPLE: airy choir + soft bell (9.6s, seamless) ----
(function themeTemple() {
  const DUR = 9.6, n = N(DUR);
  const x = new Float64Array(n);
  const voices = [
    { f: 329.63, a: 0.10, cyc: 3 },
    { f: 440.00, a: 0.08, cyc: 4 },
    { f: 523.25, a: 0.06, cyc: 5 },
  ];
  const vph = voices.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    voices.forEach((v, vi) => {
      vph[vi] += v.f / SR;
      const lfo = 0.65 + 0.35 * Math.sin(2 * Math.PI * v.cyc * t / DUR);
      s += sine(vph[vi]) * v.a * lfo;
    });
    x[i] = s * (0.8 + 0.2 * Math.sin(2 * Math.PI * t / DUR));
  }
  // soft bell each 3.2s (whole cycles)
  for (let rep = 0; rep < 3; rep++) {
    const at = Math.floor(rep * 3.2 * SR);
    let p = 0;
    for (let i = at; i < Math.min(n, at + Math.floor(1.4 * SR)); i++) {
      const t = (i - at) / SR;
      p += 196 / SR;
      x[i] += sine(p) * 0.10 * Math.exp(-t / 0.7);
    }
  }
  writeWav('theme_temple.wav', normalize(x, 0.5));
})();

// ---- THEME_ISLE: bright breeze + plucks (8s, seamless) ----
(function themeIsle() {
  const DUR = 8, n = N(DUR), R = rng(909);
  const x = new Float64Array(n);
  const pad = [261.63, 329.63, 392.0, 523.25];
  const pph = pad.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    pad.forEach((f, vi) => {
      pph[vi] += f / SR;
      s += sine(pph[vi]) * 0.09 * (0.7 + 0.3 * Math.sin(2 * Math.PI * (vi + 1) * t / DUR));
    });
    x[i] = s;
  }
  // pentatonic plucks, whole-cycle placed
  const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33];
  notes.forEach((f, ni) => {
    const at = Math.floor(ni * 1.0 * SR);
    let p = 0;
    for (let i = at; i < Math.min(n, at + Math.floor(0.5 * SR)); i++) {
      const t = (i - at) / SR;
      p += f / SR;
      x[i] += sine(p) * 0.14 * Math.exp(-t / 0.16);
    }
  });
  // gull-cry-ish chirps (pitched blips, whole cycles)
  [[1.7, 2100], [4.3, 2400], [6.9, 1900]].forEach(([dt, f0]) => {
    let p = 0;
    const s0 = Math.floor(dt * SR);
    for (let i = s0; i < Math.min(n, s0 + Math.floor(0.28 * SR)); i++) {
      const t = (i - s0) / SR;
      p += (f0 - 900 * Math.min(1, t / 0.2)) / SR;
      x[i] += sine(p) * 0.07 * Math.exp(-t / 0.1);
    }
  });
  // sea breeze wash
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = R() * 2 - 1;
  const br = lowpass(raw, 700);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] += br[i] * 0.10 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t / DUR));
  }
  writeWav('theme_isle.wav', normalize(Float64Array.from(lowpass(x, 3200)), 0.5));
})();

console.log('done ->', OUT);
