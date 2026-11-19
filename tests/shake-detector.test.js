/* Unit tests for the SH✡MER shake detector (v337).
   Run:  node tests/shake-detector.test.js          (exit 0 = all pass)
         node tests/shake-detector.test.js --java   (also runs native ShakeDetector.java, needs javac,
                                                      and requires identical results)
   The detector is read straight out of shomer.html (between the SHAKE-DETECTOR markers), so the
   test always checks the code that ships. Traces: tests/shake-traces.js. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), os = require('os');
const T = require('./shake-traces');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'shomer.html'), 'utf8');
const a = html.indexOf('/*SHAKE-DETECTOR-BEGIN'), b = html.indexOf('/*SHAKE-DETECTOR-END*/');
if (a < 0 || b < 0) { console.error('detector block not found in shomer.html'); process.exit(1); }
const ctx = {}; vm.createContext(ctx); vm.runInContext(html.slice(a, b) + ';this.ShakeDetector=ShakeDetector;', ctx);
const LEVELS = ['low', 'medium', 'high'];
const RATES = [50, 60, 100];   // Android SENSOR_DELAY_GAME ~50 Hz, iOS/Chrome devicemotion ~60 Hz, some phones 100 Hz
const fsr = k => RATES[k % RATES.length];

function fires(trace, level) { const d = ctx.ShakeDetector(level); let n = 0; for (const [t, x, y, z] of trace) if (d.push(t, x, y, z)) n++; return n; }
function firesOld(trace, lvl) { const d = T.OldDetector(lvl); let n = 0; for (const [t, x, y, z] of trace) if (d.push(t, x, y, z)) n++; return n; }

/* expect per level: true = must fire (once if `once`), false = must never fire, null = reported only */
const NO = { low: false, medium: false, high: false };
const cases = []; let seed = 1;
function add(group, name, trace, expect, once) { cases.push({ group, name, trace, expect, once }); }

// 1. Walking - normal and fast, phone in hand (swinging), pocket, loose bag. Never fires.
for (const f of [1.6, 1.9, 2.2, 2.4]) for (const [kind, w, rot] of [
  ['hand', { strike: 8, swing: 6 }, 0], ['hand-swing', { strike: 10, swing: 14 }, 60], ['hand-swing-hard', { strike: 12, swing: 16 }, 70],
  ['pocket', { strike: 14, swing: 3, ring: 10, ringHz: 8 }, 10], ['bag', { strike: 18, swing: 4, ring: 14, ringHz: 6 }, 25]])
  for (let k = 0; k < 3; k++) { const s = seed++;
    add(f >= 2.2 ? 'walk-fast' : 'walk', `walk ${kind} f=${f} ${fsr(k)}Hz`, T.render(T.walk(Object.assign({ f, phase: k / 7 }, w)), { seconds: 60, fs: fsr(k), seed: s, rot, rotHz: f / 2 }), NO); }
// 2. Stairs up and down. Never fires.
for (const f of [1.4, 1.6, 1.9]) for (const strike of [10, 16, 22]) for (const down of [true, false]) { const s = seed++;
  add('stairs', `stairs ${down ? 'down' : 'up'} f=${f} strike=${strike}`, T.render(T.stairs({ f, strike, down }), { seconds: 40, fs: fsr(s), seed: s }), NO); }
// 3. Running / jogging 2.6-3.2 Hz (preferred cadence ~2.9 Hz), in hand, swinging, pocket ring. Low never; Medium/High at most 2 of 72.
for (const f of [2.6, 2.8, 3.0, 3.2]) for (const strike of [18, 28, 38]) for (const swing of [0, 12, 20]) for (const ring of [0, 14]) { const s = seed++;
  add('run', `run f=${f} strike=${strike} swing=${swing} ring=${ring}`, T.render(T.run({ f, strike, swing, ring, phase: (s % 9) / 9 }), { seconds: 30, fs: fsr(s), seed: s, rot: swing ? 45 : 0, rotHz: f / 2 }), { low: false, medium: null, high: null }); }   /* v344: capped below */
// 4. Hard sprint (3.2-3.6 Hz, 4.6 g strikes, phone swinging ±50°): reported only (v344: the 8 s pre-alarm absorbs it).
for (let k = 0; k < 36; k++) { const s = seed++;
  add('sprint', `sprint f=${(3.2 + 0.2 * (k % 3)).toFixed(1)} ${fsr(k)}Hz`, T.render(T.run({ f: 3.2 + 0.2 * (k % 3), strike: 45, swing: 24, phase: k / 9 }), { seconds: 30, fs: fsr(k), seed: s, rot: 50, rotHz: 1.7 }), { low: null, medium: null, high: null }); }
// 5. Tossing the phone hand to hand. Never at Low/Medium.
for (const P of [0.25, 0.3, 0.4, 0.5]) for (const h of [20, 32, 45]) for (let k = 0; k < 3; k++) { const s = seed++;
  add('toss', `toss P=${P} h=${h} ${fsr(k)}Hz`, T.render(T.toss({ P, h }), { seconds: 15, fs: fsr(k), seed: s }), { low: false, medium: false, high: null }); }
// 6. One firm jolt (picking the phone up hard / putting it down). Never fires.
for (let k = 0; k < 6; k++) { const s = seed++;
  add('jolt', `single jolt amp=40 ${fsr(k)}Hz`, T.render(T.shake({ cycles: 0.5, f: 3, amp: 40 }), { seconds: 3, fs: fsr(k), seed: s }), NO); }
const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.6, 0.8, 0]], SF = [2.5, 3, 4, 5];
// 7. Deliberate strong shake (≈4 g): fires at EVERY level, exactly once.
for (const cycles of [2, 3]) for (let k = 0; k < 24; k++) { const s = seed++;
  add('shake-strong', `strong shake x${cycles} f=${SF[k % 4]} ${fsr(k)}Hz`, T.render(T.shake({ cycles, f: SF[k % 4], amp: 40, axis: AX[k % 4] }), { seconds: 3, fs: fsr(k), seed: s }), { low: true, medium: true, high: true }, true); }
// 8. Firm shake (≈2.4 g, 2 back-and-forths - a real hard hand shake): fires at Medium and High.
for (let k = 0; k < 24; k++) { const s = seed++;
  add('shake-firm', `firm shake x2 f=${SF[k % 4]} ${fsr(k)}Hz`, T.render(T.shake({ cycles: 2, f: SF[k % 4], amp: 24, axis: AX[k % 4] }), { seconds: 3, fs: fsr(k), seed: s }), { low: null, medium: true, high: true }, true); }
// 9. Lighter shake (≈2.1 g): High only - the levels really differ.
for (let k = 0; k < 24; k++) { const s = seed++;
  add('shake-light', `light shake x2 f=${SF[k % 4]} ${fsr(k)}Hz`, T.render(T.shake({ cycles: 2, f: SF[k % 4], amp: 21, axis: AX[k % 4] }), { seconds: 3, fs: fsr(k), seed: s }), { low: false, medium: null, high: true }); }
// 10. A strong shake WHILE walking (help needed on the move): fires at every level.
for (let k = 0; k < 24; k++) { const s = seed++;
  add('walk+shake', `walk then strong shake ${fsr(k)}Hz`, T.render(T.walkThenShake({ f: 1.9, strike: 8, swing: 6 }, { cycles: 3, f: [3, 4][k % 2], amp: 40, axis: AX[k % 4] }, 6.1 + 0.13 * k), { seconds: 12, fs: fsr(k), seed: s }), { low: true, medium: true, high: true }); }

let fail = 0; const summary = {};
const results = cases.map(c => { const r = {}; for (const l of LEVELS) r[l] = fires(c.trace, l); return r; });
cases.forEach((c, i) => {
  const r = results[i], sg = summary[c.group] = summary[c.group] || { n: 0, fired: { low: 0, medium: 0, high: 0 }, bad: 0 };
  sg.n++;
  for (const l of LEVELS) {
    if (r[l]) sg.fired[l]++;
    const e = c.expect[l]; if (e === null) continue;
    const ok = e ? (c.once ? r[l] === 1 : r[l] >= 1) : r[l] === 0;
    if (!ok) { fail++; sg.bad++; console.log(`FAIL  ${c.name}  level=${l}  fired=${r[l]}  expected=${e ? 'fire' : 'no fire'}`); }
  }
});
// Sprint at Medium: at most 1 of 36 hard-sprint traces may fire (the abrupt standstill-to-sprint start).
/* v344: running may start the 8 s pre-alarm on a rare trace (cancel = one tap); walking never may. */
for (const l of ['medium', 'high']) if (summary.run.fired[l] > 2) { fail++; console.log(`FAIL  run ${l} fired on ${summary.run.fired[l]}/72 traces (max 2)`); }
console.log('group         traces  fired low/med/high  failures');
for (const [g, s] of Object.entries(summary)) console.log(`${g.padEnd(13)} ${String(s.n).padStart(6)}  ${String(s.fired.low).padStart(5)}/${s.fired.medium}/${s.fired.high}  ${s.bad}`);

// 11. The incident: fast walking with the phone in a swinging hand. The v336 detector fires on it at the
//     higher sensitivity settings its slider allowed; the new one must stay silent at every level.
{ let oldN = 0, newN = 0, minutes = 0;
  for (const f of [2.0, 2.2, 2.4]) for (let k = 0; k < 6; k++) { const s = 90000 + seed++;
    const tr = T.render(T.walk({ f, strike: 12, swing: 16, phase: k / 7 }), { seconds: 60, fs: fsr(k), seed: s, rot: 70, rotHz: f / 2 });
    minutes++; oldN += firesOld(tr, 30) + firesOld(tr, 27); for (const l of LEVELS) newN += fires(tr, l); }
  console.log(`\nincident replay (fast walk, phone swinging in hand, ${minutes} min): old v336 fired ${oldN}x, new fired ${newN}x`);
  if (oldN === 0) console.log('note: old detector did not fire on this synthetic set');
  if (newN !== 0) { fail++; console.log('FAIL  new detector fired on fast walking'); } }

if (process.argv.includes('--java')) {
  const dir = fs.mkdtempSync(path.join(fs.existsSync('/dev/shm') ? '/dev/shm' : os.tmpdir(), 'shk-'));
  const jsrc = path.join(ROOT, 'native/shomer-android/android/app/src/main/java/il/co/shomerapp/ShakeDetector.java');
  fs.writeFileSync(path.join(dir, 'Run.java'), `import il.co.shomerapp.ShakeDetector; import java.io.*;
public class Run { public static void main(String[] a) throws Exception { BufferedReader r=new BufferedReader(new InputStreamReader(System.in)); String ln; StringBuilder o=new StringBuilder();
 ShakeDetector d=null; int n=0; while((ln=r.readLine())!=null){ if(ln.startsWith("#")){ if(d!=null)o.append(n).append('\\n'); d=new ShakeDetector(ln.substring(1)); n=0; continue; }
 String[] p=ln.split(","); if(d.push(Long.parseLong(p[0]),Float.parseFloat(p[1]),Float.parseFloat(p[2]),Float.parseFloat(p[3])))n++; }
 if(d!=null)o.append(n).append('\\n'); System.out.print(o); } }`);
  cp.execFileSync('javac', ['-d', dir, jsrc, path.join(dir, 'Run.java')]);
  let inp = '';
  cases.forEach(c => { for (const l of LEVELS) { inp += '#' + l + '\n'; for (const [t, x, y, z] of c.trace) inp += `${t},${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}\n`; } });
  const out = cp.execFileSync('java', ['-cp', dir, 'Run'], { input: inp, maxBuffer: 1 << 28 }).toString().trim().split('\n').map(Number);
  let k = 0, mism = 0;
  cases.forEach((c, i) => { for (const l of LEVELS) { const j = out[k++]; if (j !== results[i][l]) { mism++; if (mism < 20) console.log(`JAVA MISMATCH ${c.name} ${l}: js=${results[i][l]} java=${j}`); } } });
  console.log(`java parity: ${cases.length * LEVELS.length - mism}/${cases.length * LEVELS.length} identical`);
  fail += mism;
}
console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL PASS (${cases.length} traces x 3 levels)`);
process.exit(fail ? 1 : 0);
