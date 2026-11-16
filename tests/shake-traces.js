/* Synthetic accelerometer traces for the SH✡MER shake detector tests (v337).
   Every trace is a list of [t_ms, x, y, z] in m/s², INCLUDING gravity, as the phone reports it
   (DeviceMotionEvent.accelerationIncludingGravity / Android TYPE_ACCELEROMETER).
   Motion is built in a body frame (x forward, y up, z sideways) and turned into a random phone
   orientation. With `rot` the phone also SWINGS (a hand swinging while walking, a bag on the
   shoulder): its orientation rocks by ±rot degrees at the stride rate, so gravity leaks into
   every axis - the effect that fooled the old detector. */
'use strict';
const G = 9.81;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function rotMatrix(r) {
  const a = r() * 2 * Math.PI, b = r() * 2 * Math.PI, c = r() * 2 * Math.PI;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [[ca * cb, ca * sb * sc - sa * cc, ca * sb * cc + sa * sc],
          [sa * cb, sa * sb * sc + ca * cc, sa * sb * cc - ca * sc],
          [-sb, cb * sc, cb * cc]];
}
function apply(M, v) { return [0, 1, 2].map(i => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]); }
function rotZ(th, v) { const c = Math.cos(th), s = Math.sin(th); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

/* fn(t_s) -> body-frame linear acceleration [fx, fy(up), fz].
   rot = swing amplitude in degrees, rotHz = swing rate (stride = cadence/2). */
function render(fn, { seconds, fs, seed, noise = 0.4, lead = 1.5, rot = 0, rotHz = 1 }) {
  const r = rng(seed), M = rotMatrix(r), out = [], dt = 1 / fs, ph = r() * 6.28;
  const jitter = () => (r() - 0.5) * 0.25 / fs;   // real sensors do not tick perfectly
  for (let t = 0; t < seconds + lead; t += dt) {
    const tt = t + jitter();
    const lin = t < lead ? [0, 0, 0] : fn(tt - lead);
    let body = [lin[0], lin[1] + G, lin[2]];
    if (rot && t >= lead) body = rotZ((rot * Math.PI / 180) * Math.sin(2 * Math.PI * rotHz * (tt - lead) + ph), body);
    const p = apply(M, body).map(v => v + gauss(r) * noise);
    out.push([Math.round(tt * 1000), p[0], p[1], p[2]]);
  }
  return out;
}

/* Walking at cadence f steps/s: heel strike (half-sine, `strike` m/s²) + body bob, arm swing at f/2.
   ring = a loose phone rattling in a pocket / bag after each strike. */
function walk({ f = 1.9, strike = 8, bob = 2.5, swing = 4, ring = 0, ringHz = 7, phase = 0 }) {
  const T = 1 / f, c = 0.12 * T;
  return t => {
    const tp = (t + phase * T) % T;
    let up = (tp < c ? strike * Math.sin(Math.PI * tp / c) : 0) - strike * 0.12 * 2 / Math.PI + bob * Math.sin(2 * Math.PI * f * t);
    if (ring && tp >= c) { const u = tp - c; up += ring * Math.exp(-u * 10) * Math.sin(2 * Math.PI * ringHz * u); }
    const fwd = swing * Math.sin(Math.PI * f * t + phase) + 1.5 * Math.sin(2 * Math.PI * f * t);
    return [fwd, Math.max(up, -G), 1.2 * Math.sin(Math.PI * f * t)];
  };
}
/* Stairs: slower cadence, harder landings (down) or pushes (up). */
function stairs({ f = 1.6, strike = 14, down = true }) {
  const T = 1 / f, c = (down ? 0.1 : 0.2) * T;
  return t => {
    const tp = t % T, s = tp < c ? strike * Math.sin(Math.PI * tp / c) : 0;
    return [2 * Math.sin(Math.PI * f * t), s - strike * (c / T) * 2 / Math.PI, 1.5 * Math.sin(Math.PI * f * t + 1)];
  };
}
/* Running / jogging at cadence f (steps/s). Foot strike = half-sine pulse, flight pulls toward free
   fall (never below -1 g). Arm swing (hand-held) at f/2, optional loose-pocket ring. */
function run({ f = 2.8, strike = 28, contact = 0.11, swing = 16, sway = 4, ring = 0, ringHz = 9, phase = 0 }) {
  const T = 1 / f, duty = contact / T, mean = strike * duty * 2 / Math.PI;
  return t => {
    const tp = (t + phase * T) % T;
    let up = (tp < contact ? strike * Math.sin(Math.PI * tp / contact) : 0) - mean;
    if (ring && tp >= contact) { const u = tp - contact; up += ring * Math.exp(-u * 18) * Math.sin(2 * Math.PI * ringHz * u); }
    up = Math.max(up, -G);
    const sw = 2 * Math.PI * (f / 2) * t + phase * 3;
    const s = Math.sin(sw), fwd = swing * Math.sign(s) * Math.pow(Math.abs(s), 0.7);
    return [fwd, up, sway * Math.sin(sw + 1)];
  };
}
/* A deliberate shake: `cycles` back-and-forth strokes along one axis at f Hz, peak `amp` m/s². */
function shake({ cycles = 3, f = 3.5, amp = 32, axis = [1, 0, 0], wobble = 3 }) {
  const dur = cycles / f;
  return t => {
    if (t < 0 || t > dur) return [0, 0, 0];
    const a = amp * Math.sin(2 * Math.PI * f * t), w = wobble * Math.sin(2 * Math.PI * f * 2 * t);
    return [axis[0] * a + w, axis[1] * a, axis[2] * a - w];
  };
}
/* Shake while walking: the walk continues, a deliberate shake starts at `at` seconds. */
function walkThenShake(w, s, at) { const W = walk(w), S = shake(s); return t => { const a = W(t), b = S(t - at); return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }; }
/* Hand-to-hand toss: catch+throw every P s, free fall in between. */
function toss({ P = 0.3, ev = 0.11, h = 30, spin = 3 }) {
  const up = G * (P - ev) * Math.PI / (2 * ev);
  return t => {
    const k = Math.floor(t / P), tp = t - k * P, sgn = k % 2 ? -1 : 1;
    if (tp < ev) { const a = Math.sin(Math.PI * tp / ev); return [sgn * h * a, up * a, 0]; }
    return [spin * Math.sin(40 * t), -G + spin * Math.cos(40 * t) * 0.5, spin * Math.cos(33 * t) * 0.5];
  };
}

/* The detector that shipped up to v336 (web + Android), kept here only to show why fast walking
   fired it: magnitude above 42-level (18 m/s² at the default), 8 peaks >120 ms apart inside a
   1.4 s window, gravity removed by a per-sample 0.9 filter, no direction check, no gait check. */
function OldDetector(level = 24) {
  const thr = 42 - level, WINDOW = 1400, REQUIRED = 8, MIN_GAP = 120;
  let gx = 0, gy = 0, gz = 0, count = 0, firstT = 0, lastPeak = 0, lastFire = -1e9;
  return { push(t, x, y, z) {
    gx = 0.9 * gx + 0.1 * x; gy = 0.9 * gy + 0.1 * y; gz = 0.9 * gz + 0.1 * z;
    const m = Math.hypot(x - gx, y - gy, z - gz);
    if (m > thr && t - lastPeak > MIN_GAP) {
      if (!firstT || t - firstT > WINDOW) { firstT = t; count = 0; }
      count++; lastPeak = t;
      if (count >= REQUIRED) { count = 0; firstT = 0; if (t - lastFire < 8000) return false; lastFire = t; return true; }
    }
    return false;
  } };
}
module.exports = { render, walk, stairs, run, shake, walkThenShake, toss, OldDetector, G };
