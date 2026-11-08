/* Unit tests for the SH✡MER shake detector (v333).
   Run:  node tests/shake-detector.test.js   (exit 0 = all pass)
   The detector is read straight out of shomer.html (between the SHAKE-DETECTOR markers),
   so the test always checks the code that ships. With --java it also runs the same traces
   through native ShakeDetector.java (needs javac) and requires identical results. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), os = require('os');
const { render, walk, run, shake, toss } = require('./shake-traces');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'shomer.html'), 'utf8');
const src = html.slice(html.indexOf('/*SHAKE-DETECTOR-BEGIN'), html.indexOf('/*SHAKE-DETECTOR-END*/'));
if (!src) { console.error('detector block not found in shomer.html'); process.exit(1); }
const ctx = {}; vm.createContext(ctx); vm.runInContext(src + ';this.ShakeDetector=ShakeDetector;', ctx);
const LEVELS = ['low', 'medium', 'high'];
const RATES = [50, 60, 100];   // Android SENSOR_DELAY_GAME ~50 Hz, iOS/Chrome devicemotion ~60 Hz, some phones 100 Hz

function fires(trace, level) {
  const d = ctx.ShakeDetector(level); let n = 0;
  for (const [t, x, y, z] of trace) if (d.push(t, x, y, z)) n++;
  return n;
}
const cases = [];   // {name, trace, expect: {low,medium,high} true=must fire, false=must not, null=either}
let seed = 1;
// 1. Running / jogging at ~2.5 Hz (and around it) must NOT fire at Low or Medium.
for (const f of [2.2, 2.5, 2.8, 3.0]) for (const strike of [18, 28, 38]) for (const swing of [0, 12, 20])
  for (const ring of [0, 14]) for (const fsr of RATES) for (const phase of [0, 0.37]) {
    const s = seed++;
    cases.push({ name: `run f=${f} strike=${strike} swing=${swing} ring=${ring} ${fsr}Hz ph=${phase}`, group: f === 2.5 ? 'run2.5' : 'run',
      trace: render(run({ f, strike, swing, ring, phase }), { seconds: 20, fs: fsr, seed: s }),
      expect: { low: false, medium: false, high: null } });
  }
// 2. Walking must NEVER fire, at any level.
for (const f of [1.4, 1.8, 2.2]) for (const strike of [4, 8, 12]) for (const swing of [2, 6]) for (const fsr of RATES) {
  const s = seed++;
  cases.push({ name: `walk f=${f} strike=${strike} swing=${swing} ${fsr}Hz`, group: 'walk',
    trace: render(walk({ f, strike, swing, phase: (s % 7) / 7 }), { seconds: 30, fs: fsr, seed: s }),
    expect: { low: false, medium: false, high: false } });
}
// 2b. Tossing the phone hand to hand (1.5-4 catches per second) must not fire at Low or Medium.
for (const P of [0.25, 0.3, 0.4, 0.5, 0.65]) for (const h of [20, 32, 45]) for (const spin of [0, 4]) for (const fsr of RATES) {
  const s = seed++;
  cases.push({ name: `toss P=${P}s h=${h} spin=${spin} ${fsr}Hz`, group: 'toss',
    trace: render(toss({ P, h, spin }), { seconds: 15, fs: fsr, seed: s }),
    expect: { low: false, medium: false, high: null } });
}
// 3. A deliberate triple strong shake must fire at EVERY level (once).
for (const f of [2.5, 3, 4, 5]) for (const amp of [26, 32, 40]) for (const fsr of RATES) {
  const s = seed++;
  const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.6, 0.8, 0]][s % 4];
  cases.push({ name: `triple shake f=${f} amp=${amp} ${fsr}Hz`, group: 'shake3',
    trace: render(shake({ cycles: 3, f, amp, axis: ax }), { seconds: 3, fs: fsr, seed: s }),
    expect: { low: true, medium: true, high: true }, once: true });
}
// 4. Sensitivity really differs: a soft double shake fires on High only.
for (const fsr of RATES) {
  const s = seed++;
  cases.push({ name: `soft double shake amp=16 ${fsr}Hz`, group: 'soft',
    trace: render(shake({ cycles: 2, f: 3.5, amp: 16 }), { seconds: 3, fs: fsr, seed: s }),
    expect: { low: false, medium: false, high: true } });
}
// 5. One firm back-and-forth (picking up / putting down the phone hard) fires nowhere.
for (const fsr of RATES) {
  const s = seed++;
  cases.push({ name: `single jolt amp=35 ${fsr}Hz`, group: 'jolt',
    trace: render(shake({ cycles: 1, f: 3, amp: 35 }), { seconds: 3, fs: fsr, seed: s }),
    expect: { low: false, medium: false, high: false } });
}

let fail = 0; const summary = {};
const results = cases.map(c => { const r = {}; for (const l of LEVELS) r[l] = fires(c.trace, l); return r; });
cases.forEach((c, i) => {
  const r = results[i]; summary[c.group] = summary[c.group] || { n: 0, fired: { low: 0, medium: 0, high: 0 }, bad: 0 };
  const sg = summary[c.group]; sg.n++;
  for (const l of LEVELS) {
    if (r[l]) sg.fired[l]++;
    const e = c.expect[l]; if (e === null) continue;
    const ok = e ? (c.once ? r[l] === 1 : r[l] >= 1) : r[l] === 0;
    if (!ok) { fail++; sg.bad++; console.log(`FAIL  ${c.name}  level=${l}  fired=${r[l]}  expected=${e ? 'fire' : 'no fire'}`); }
  }
});
for (const [g, s] of Object.entries(summary))
  console.log(`${g.padEnd(8)} traces=${String(s.n).padStart(3)}  fired low/med/high = ${s.fired.low}/${s.fired.medium}/${s.fired.high}  failures=${s.bad}`);

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
  const out = cp.execFileSync('java', ['-cp', dir, 'Run'], { input: inp, maxBuffer: 1 << 26 }).toString().trim().split('\n').map(Number);
  let k = 0, mism = 0;
  cases.forEach((c, i) => { for (const l of LEVELS) { const j = out[k++]; if ((j > 0) !== (results[i][l] > 0)) { mism++; console.log(`JAVA MISMATCH ${c.name} ${l}: js=${results[i][l]} java=${j}`); } } });
  console.log(`java parity: ${cases.length * LEVELS.length - mism}/${cases.length * LEVELS.length} identical`);
  if (mism) fail += mism;
}
console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL PASS (${cases.length} traces x 3 levels)`);
process.exit(fail ? 1 : 0);
