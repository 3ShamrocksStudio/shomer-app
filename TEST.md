# SHOMER — Guardian & Live-Location: Test Guide + What's Real vs Backend-Phase

**App:** single-file PWA (`shomer.html`)
**Live URL:** https://3shamrocksstudio.github.io/shomergency/

This document covers the **Connect a Guardian** feature and the live-location map.
For the full SOS / false-alarm / onboarding test pass, see [TEST_AUDIT.md](TEST_AUDIT.md).

> **Honesty first.** A consumer "always-on, cross-device, background" tracker
> (Life360 / Find My style) is **not** possible from a web page alone — it needs a
> server, accounts, and native background-location permission. So this build does
> the **whole experience as far as the open web allows**, and clearly labels — in
> the app *and* here — what is real today vs. what waits for the backend/native phase.

---

## ✓ Real now (works in this build, no server)

| Capability | How it's real |
|---|---|
| **Your live location** | `navigator.geolocation.watchPosition()` drives your pulsing blue marker; it follows your real device position. |
| **Shareable invite link** | "Invite a guardian" mints a real link (`…/shomer.html?g=<token>#n=<name>`) and shares it via the native share sheet (`navigator.share`) or clipboard. |
| **Accept flow** | Opening an invite link shows a real accept dialog and creates the pairing locally; the URL is cleaned so a reload won't re-prompt. |
| **Live-location transport** | A real `BroadcastChannel` + `localStorage` relay carries your **actual GPS position** between **windows/tabs of the app on the same browser**, keyed by each pair's token. Each tab has its own sender id (`sessionStorage`), so two windows genuinely act as two people exchanging live coordinates → the guardian flips to a green **LIVE** marker using real coordinates. |
| **Who-sees-whom** | Per-guardian **"I see"** switch, which controls whether that SHOMER appears on YOUR map. There is no per-guardian "stop sharing MY location": presence is one record read by every approved SHOMER, so the only real controls are ghost mode (everyone) and removing that SHOMER. |
| **Ghost / pause** | One switch pauses all outgoing sharing instantly. |
| **Disconnect** | One tap removes a pairing and its marker. |
| **Privacy posture** | Everything is stored on-device in `localStorage`; nothing leaves the device except via the link you choose to share. |

## ⏳ Backend / native phase (flagged in-app, not faked)

| Capability | Why it needs a backend / native app |
|---|---|
| **Live across *different* devices** | Two phones on two networks can't exchange position without a relay server (WebSocket / push). Same-browser windows work today; cross-device is the next phase. |
| **Always-on background tracking** | Browsers stop a page's geolocation when it's backgrounded. Continuous background location needs a native iOS/Android app with the OS background-location permission. |
| **Accounts + verified invites** | Real identity, invite revocation, and abuse prevention need server-side accounts. |
| **End-to-end encryption** | Encrypting positions in transit/at rest needs a key-exchange backend. |

When **no** live peer is broadcasting on a pair (the normal cross-device case), the
guardian's marker is shown at a **clearly badged "simulated"** position so the map UX
is complete — it never pretends to be the real person's live location.

---

## How to test

### A. Your own live location (1 device)
1. Open the app over **HTTPS** (the live URL) on a phone, finish onboarding, allow location.
2. On the map, tap the 📍 button. **Expected:** the blue dot snaps to your real position and follows you as you move.

### B. Invite + accept (1 device, real link)
1. Menu **☰ → Connect a Guardian** (top of the Circles sheet).
2. Tap **Invite a guardian**. **Expected:** a real link appears; **Copy** and **Share** work.
3. Tap **I have a code**, paste a link/code, **Connect**.
   **Expected:** a connected guardian row appears; a badged **simulated** marker shows on the map; **Locate 🎯** flies to it with a radar ping.

### C. ⭐ Real live sync between two windows (1 device, no server)
1. **Invite a guardian** and **Copy** the link.
2. Open a **second window/tab of the same browser** and paste the link.
   **Expected:** a toast confirms the live link is active.
3. Move around (or, on desktop, watch the markers).
   **Expected:** in **both** windows the guardian flips to a green **LIVE** marker and tracks the **real** device position in real time — proof the live transport is genuine. (Both windows report the same device GPS, so the markers sit together; *two separate devices* moving independently is the cross-device backend phase.)

### D. Privacy controls
1. On a guardian's card, tap **"I see"** off → their marker disappears and Find refuses to locate them. An SOS always overrides it. There is no per-guardian share switch - see Who-sees-whom above.
2. Flip **Ghost mode** → all outgoing sharing pauses.
3. **Disconnect** → the pairing and marker are removed.

### E. Compliance — disclaimer, ToS/Privacy, consent gate
1. **Onboarding** shows the red emergency disclaimer ("NOT a replacement for emergency services… call 100/101/102"); footer links to **Terms · Privacy · Disclaimer**.
2. On the map, tap **ⓘ** under the SOS button → the **Disclaimer page** opens with 100/101/102 call buttons. **Settings → Safety & legal** opens the same three pages; ToS & Privacy are marked **"Draft."**
3. Press **SOS** and watch the countdown → it shows *"Shomer does not call authorities. Dial 100/101/102 yourself."* Cancel it (false alarm, no trace).
4. **Consent gate:** with sharing not yet consented, tap **Invite a guardian** → the **Location-sharing consent** dialog appears first; **no pairing is created** and **nothing is broadcast** until you tap **"I agree to share my location."** After agreeing, the invite proceeds and consent is recorded (revocable via ghost/disconnect/reset).
   - **Accuracy check:** the disclaimer/ToS never claim Shomer auto-alerts authorities or works always-on/background — because it doesn't.

### F. No regressions
- SOS, the cancel-countdown, false-alarm "leaves no trace", Dead Man's Switch, and Shake-to-SOS all still work — see [TEST_AUDIT.md](TEST_AUDIT.md).
- No console errors at any step.

---

*SHOMER™ · © 2026 3Shamrocks Studio*
