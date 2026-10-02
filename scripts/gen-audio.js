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

console.log('done ->', OUT);
