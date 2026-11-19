# Shake-to-SOS detection (v337)

Why it changed: on 16 Nov 2026 a tester's SOS fired by itself while she was walking fast, and she
could not stop it. Shake-to-SOS is now **off by default**, a detection never sounds the siren directly
(8 s pre-alarm with a huge Cancel), and the detector looks for a deliberate pattern instead of force.

## What the old detector did (v336 and the Android app up to build 68)
- Gravity removed by a per-sample 0.9 filter; then **any** sample above a force line counted, in any
  direction, at most once per 120 ms. 8 counts inside a 1.4 s window (Android: 1.5 s, fixed 18 m/s²) = SOS.
- The force line was `42 - slider`; the slider went to 30, i.e. **12 m/s² (1.2 g)** - an ordinary arm swing.
- One long arm swing stays above the line for 250-400 ms, so it counted 2-3 times. Three fast steps
  with the phone in a swinging hand = 8 counts. In the synthetic replay (tests) the old detector fired
  41 times in 18 minutes of fast walking at the upper slider settings; at the default setting it did not
  fire on our synthetic walk, but real phones in a loose bag/hand peak higher than our model.
- Nothing checked direction, rhythm or walking cadence.

## New detector (`ShakeDetector`, shomer.html between the SHAKE-DETECTOR markers; Java port 1:1)
| Step | Rule |
|---|---|
| High-pass | gravity = 250 ms time-constant low-pass (same at 50/60/100 Hz); the rest is motion |
| Peak | one peak per burst; a burst ends when force drops below half the line or flips direction |
| Chain | each peak above the line, **direction reversed** (cos < -0.5) vs the previous one, 75-260 ms after it, and rhythmic (each gap within ½-2× the previous gap) |
| Fire | the chain has N peaks inside 1.5 s; then 2 s quiet (one shake = one detection) |
| Gait rejection | bursts above 0.6× the line are clustered (150 ms) into beats; 5 beats with 4 steady intervals (±20 %) at 270-720 ms = walking/running rhythm (1.4-3.7 Hz). While a gait rhythm is on, one more reversal is required |
| Toss / drop | ≥70 ms of free fall (|a| < 5 m/s²) wipes the chain |
| Long push | a peak above the line for longer than 220-260 ms is not a jerk and wipes the chain |

| Level | Line (gravity removed) | Reversals | User text |
|---|---|---|---|
| Low | 2.5 g | 4 | very strong shake, back and forth twice |
| **Medium (default)** | 2.0 g | 3 | strong shake, 3 quick back-and-forth moves |
| High | 1.9 g | 3 | slightly lighter shake; a hard sprint may start the countdown |

## v344 recalibration (19 Nov 2026)
At 2.7 g (Medium) a shake fired only when the synthetic stroke peaked at about 3.3 g; 2.5 g shakes never fired.
A hard shake by hand is about 2-2.5 g, so testers could not trigger it. The lines are now Low 2.5 g, Medium 2.0 g,
High 1.9 g. Walking (incl. the 16 Nov incident pattern) and stairs stay at 0 at every level, and so does tossing.
The cost is running: Medium fires on 1 of 72 jogging traces and 12 of 36 hard-sprint traces. Each of those
only starts the 8 s pre-alarm (vibration + soft beeps, nothing sent), which is cancelled with one tap.
Below 1.9 g the fast-walk-with-swinging-phone pattern starts firing again (1.8 g: 7 times in 78 minutes).

## Why these numbers (sources)
1. **Bourke AK, O'Brien JV, Lyons GM (2007). Evaluation of a threshold-based tri-axial accelerometer fall
   detection algorithm. Gait & Posture 26(2):194-199.** Peak resultant acceleration of daily activities of
   older adults (walking, stairs, sitting/standing, getting in/out of bed and car) stayed below a single
   upper threshold of roughly 3 g at the trunk, which separated them from falls. -> a deliberate shake must
   reach the 2.5-3 g band, above what everyday movement produces.
   https://read.qxmd.com/read/17101272/evaluation-of-a-threshold-based-tri-axial-accelerometer-fall-detection-algorithm
   (The exact trunk value, about 3.5 g, is from memory of the paper; the full text could not be opened to recheck it.)
2. **Pachi A, Ji T (2005). Frequency and velocity of people walking. The Structural Engineer 83(3).**
   Average walking step frequency 1.8 Hz (footbridges) to 2.0 Hz (shopping floors); women walk at a higher
   frequency than men. -> the gait band starts at 1.4 Hz and walking beats are rejected.
   https://www.istructe.org/journal/volumes/volume-83-(published-in-2005)/issue-3/frequency-and-velocity-of-people-walking/
3. **Heiderscheit BC et al. (2011). Effects of step rate manipulation on joint mechanics during running.
   Med Sci Sports Exerc 43(2):296-302.** Preferred running step rate 172.6 ± 8.8 steps/min (≈2.9 Hz),
   studied at ±10 % (≈2.6-3.2 Hz). -> the gait band reaches 3.7 Hz, and a shake must reverse faster than
   arm swing while running (≥ every 260 ms vs 330-450 ms).
   https://pmc.ncbi.nlm.nih.gov/articles/PMC3022995

## Tests
`node tests/shake-detector.test.js --java` - 348 synthetic traces x 3 levels, JS and Java identical (1044/1044).
| Group | Traces | Fired Low/Med/High |
|---|---|---|
| walking (incl. phone swinging in hand ±60-70°, pocket, loose bag) 1.6-2.4 Hz | 60 x 60 s | 0/0/0 |
| stairs up/down | 18 | 0/0/0 |
| running 2.6-3.2 Hz (hand, swing, pocket ring) | 72 | 0/0/0 |
| hard sprint 3.2-3.6 Hz, 4.6 g strikes, phone swinging ±50° | 36 | 0/1/8 (Medium: only the instant standstill-to-sprint start) |
| toss hand to hand | 36 | 0/0/0 |
| single hard jolt | 6 | 0/0/0 |
| strong shake ≈4 g, 2-3 back-and-forths | 48 | 48/48/48 (exactly once each) |
| firm shake ≈3.3 g | 24 | 0/24/24 |
| lighter shake ≈2.9 g | 24 | 0/4/24 |
| strong shake while walking | 24 | 24/24/24 |

Browser flow test: `tools/e2e_shake_cancel.py` (replays the traces as real `devicemotion` events, all network blocked).
