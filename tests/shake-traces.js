/* Synthetic accelerometer traces for the shake detector tests (SH✡MER v333).
   Every trace is a list of [t_ms, x, y, z] in m/s², INCLUDING gravity, as the phone
   reports it (DeviceMotionEvent.accelerationIncludingGravity / Android TYPE_ACCELEROMETER).
   The motion is built in a body frame (x forward, y up, z sideways) and then rotated into
   a random phone orientation, so no test depends on how the phone is held. */
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
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

/* body-frame linear acceleration fn(t_s) -> [fx, fy(up), fz]; returns phone-frame samples incl. gravity */
function render(fn, { seconds, fs, seed, noise = 0.4, lead = 1.5 }) {
  const r = rng(seed), M = rotMatrix(r), out = [], dt = 1 / fs;
  const jitter = () => (r() - 0.5) * 0.25 / fs;   // real sensors do not tick perfectly
  for (let t = 0; t < seconds + lead; t += dt) {
    const tt = t + jitter();
    const lin = t < lead ? [0, 0, 0] : fn(tt - lead);
    const body = [lin[0], lin[1] + G, lin[2]];
    const p = apply(M, body).map(v => v + gauss(r) * noise);
    out.push([Math.round(tt * 1000), p[0], p[1], p[2]]);
  }
  return out;
}

/* Walking: heel strike + bob at cadence f, arm swing at f/2. Phone in hand or pocket. */
function walk({ f = 1.8, strike = 6, bob = 2.5, swing = 4, phase = 0 }) {
  const T = 1 / f;
  return t => {
    const ph = ((t + phase * T) % T) / T;
    const s = ph < 0.12 ? strike * Math.sin(Math.PI * ph / 0.12) : 0;
    const up = s + bob * Math.sin(2 * Math.PI * f * t) - strike * 0.12 * 2 / Math.PI;
    const fwd = swing * Math.sin(Math.PI * f * t + phase) + 1.5 * Math.sin(2 * Math.PI * f * t);
    return [fwd, up, 1.2 * Math.sin(Math.PI * f * t)];
  };
}
/* Running / jogging at cadence f (steps/s). Foot strike = half-sine pulse, flight phase
   pulls back toward free fall (never below -1 g). Arm swing (hand-held) at f/2, plus an
   optional loose-pocket ring after each strike. */
function run({ f = 2.5, strike = 28, contact = 0.11, swing = 16, sway = 4, ring = 0, ringHz = 9, phase = 0 }) {
  const T = 1 / f, duty = contact / T, mean = strike * duty * 2 / Math.PI;
  return t => {
    const tp = (t + phase * T) % T;
    let up = (tp < contact ? strike * Math.sin(Math.PI * tp / contact) : 0) - mean;
    if (ring && tp >= contact) { const u = tp - contact; up += ring * Math.exp(-u * 18) * Math.sin(2 * Math.PI * ringHz * u); }
    up = Math.max(up, -G);
    const sw = 2 * Math.PI * (f / 2) * t + phase * 3;
    // a swinging arm reverses sharply at each end: sharpen the sine a little
    const s = Math.sin(sw), fwd = swing * Math.sign(s) * Math.pow(Math.abs(s), 0.7);
    return [fwd, up, sway * Math.sin(sw + 1)];
  };
}
/* A deliberate shake: `cycles` back-and-forth strokes along one axis at f Hz. */
function shake({ cycles = 3, f = 3.5, amp = 30, axis = [1, 0, 0], wobble = 3 }) {
  const dur = cycles / f;
  return t => {
    if (t < 0 || t > dur) return [0, 0, 0];
    const a = amp * Math.sin(2 * Math.PI * f * t), w = wobble * Math.sin(2 * Math.PI * f * 2 * t);
    return [axis[0] * a + w, axis[1] * a, axis[2] * a - w];
  };
}
module.exports = { render, walk, run, shake, G };
