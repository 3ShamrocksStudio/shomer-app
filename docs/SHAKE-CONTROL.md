# Shake-to-SOS control (branch `shake-control`, v333). Staging only. NEEDS YOUR EYES

Dave, 8 Nov: playing with the phone or running set off the alarm several times. A security
person on a secret mission must be able to send an SOS without any sound.

## What changed
| Where | Change |
|---|---|
| `shomer.html` (between `SHAKE-DETECTOR-BEGIN/END`) | New pattern detector. A shake must be a fast back-and-forth: strong peaks that flip direction, each within 280-300 ms of the last. Running (foot strikes all point the same way, arm swing reverses every 330-450 ms) and walking cannot build that chain. Gravity filter is now time-based (250 ms), so it behaves the same at 50, 60 or 100 Hz. |
| Settings → Shake-to-SOS | On/Off (unchanged), **Low / Medium / High** chips (replace the raw slider), **Silent mode** switch, and the line "Before anything is sent: a countdown with a Cancel button". HE / AR / EN. |
| SOS flow | Silent mode + shake: the countdown only vibrates (one buzz per second), Cancel works as before, then the existing silent-SOS path sends the alert and live location to the circle with nothing on screen and no sound. A second shake never turns a silent SOS loud. Normal mode is unchanged: 3 s vibrate, then the siren, inside the same countdown. |
| Android `ShakeDetector.java` (new), `ShakeService.java`, `ShomerNativePlugin.java` | Same detector as the web (1:1 port, checked by the tests). New plugin method `setShakeConfig({sens, silent})` saves the level and Silent mode in SharedPreferences (`shomer_native`: `shake_sens`, `shake_silent`); the service re-reads them at once and after reboot. In Silent mode the screen-off launch notification has no sound and neutral text. |
| `tests/shake-detector.test.js`, `tests/shake-traces.js` | Synthetic accelerometer traces. `node tests/shake-detector.test.js --java` also runs the Java detector. |
| `tools/build-shake-preview.py` | Same method and safety as `tools/build-nature-preview.py` (production endpoints replaced, Firebase config removed, CSP cut, guard script blocks every write, noindex, banner). |

## Levels (m/s², gravity removed)
| Level | Peak must exceed | Alternating peaks | Within | Max gap | User sees |
|---|---|---|---|---|---|
| Low | 21 | 5 | 2 s | 280 ms | 3 strong shakes |
| Medium (default) | 17 | 5 | 2 s | 300 ms | 3 shakes |
| High | 13 | 4 | 1.5 s | 300 ms | 2 quick shakes (may fire on a hard sprint, said in Settings) |

Defaults: Shake-to-SOS **On**, **Medium**, Silent **Off**. Existing users keep their On/Off;
a saved slider value keeps the level it showed (below 21 = Low, above 27 = High).

## Results
- Unit tests: 528 traces x 3 levels, all pass. Running 2.2-3 Hz (incl. 2.5 Hz): 0 fires at Low and Medium. Walking: 0 at every level. Triple strong shake (2.5-5 Hz): fires exactly once at every level. JS and Java identical on all 1,584 runs.
- Random stress (600 running traces): Low 0, Medium 0, High 34; old v332 detector fired on 14 and caught 0 of 300 triple shakes (it needed 8 peaks).
- Playwright at 390 px, HE / AR / EN: settings render, save and come back after reload, no horizontal scroll; silent countdown has no siren, Cancel works, normal mode still sounds after 3 s.

## Going live (after Dave's GO)
1. Merge `shake-control` into `main` (the web part reaches the website and the installed app at once, because the app loads the live `shomer.html`).
2. New Android build for the native part (level and Silent mode in the background detector). Until phones update, the old background detector still uses its fixed 8-peak rule, and its screen-off notification still makes a sound. The web On/Off and Silent mode still apply to what it triggers.

## Merging with `nature-layer` later
A trial merge of `shake-control` into `nature-layer` gives **one** conflict caused by this branch, in
`shomer.html` `renderCountdown()`: nature-layer reworded the countdown line ("למשתמשים" /
"للمستخدمين"), this branch wrapped it in a silent-mode `if/else`. Resolve by keeping the
`if(window._shakeQuiet){...} else {...}` structure with nature-layer's wording inside `else`.
The other conflicts in that trial (`index.html`, `nature.html`, `nature/index.html`, `sitemap.xml`)
are between `main` and `nature-layer` and exist without this branch. Both branches started from v332:
whichever merges second takes the next number (`version.json`, `sw.js` `CACHE_NAME`, `APP_VER`)
and joins both release notes.
