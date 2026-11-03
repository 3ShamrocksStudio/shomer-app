# SH✡MER: SOS push alarm (app closed / phone locked)

> Branch `sos-push-alarm`, 3 Nov 2026. Trigger: Dave's test on 3 Nov. An SOS gave the other users
> **no alarm at all** while their app was closed. They saw only a small red banner if they opened the app.

## 1. What exists today (before this branch)

| Piece | Where | State |
|---|---|---|
| SOS record | `fbPublishSOS` (shomer.html) writes `sos/<senderUid>` = `{uid,id,lat,lng,type,typeState,ts,resolved}`. One record per person, overwritten by each new SOS. Rules: only the sender writes it, and only the sender's paired SHOMERs can read it. | Works |
| Public dashboard row | `fbDashSos` writes `dashfeed/sf_<random>` (type, ~1 km point, no id). | Works. The push function does **not** write dashfeed. |
| In-app alert (app open) | Live listener on `sos/<partnerUid>` → `onPartnerSOS` → a 2.5 s siren and the `.in-sos` card. | Works only while the app is on screen. |
| `sosFanout` Cloud Function | functions/index.js | **Never deployed** (no Firebase login or CI secret; the 31 Oct rules workflow failed with "NO CREDENTIAL"). Bugs: a device with no location counted as "near", so every user was alarmed; it used `sos.name`, which the rules forbid; it sent a *notification* message that cannot ring an alarm. |
| `alarmFanout` | functions/index.js, fed by `fbAlertPairedSos` (`alarms/*`, tag `sos`) | Not deployed. It would be a **second** push for the same SOS. |
| Cloudflare Worker push | worker/, `SHOMER_PUSH_URL` = `''` | Not deployed. It is also broken: it reads `sos/<sosId>` (records are keyed by uid) and reads `tokens` without admin access. **Superseded by sosFanout. Leave the URL empty.** |
| FCM tokens | Web only: `initFCM` (browser + VAPID) wrote `tokens/<uid>` = `{token,ts,lat,lng}` with a **precise** location. Native: `@capacitor/push-notifications` is **not installed** and there is no `google-services.json`, so the Android app never had a token. | Native: none |
| Native background | `ShakeService` (on by default) runs `BeatTask` each minute. It polls `ping/<me>` for guardian Alert/Alarm only. It did **not** look at SOS. | Partial |
| Twilio | SMS **verification** only (privacy.html). It is not used for SOS. | n/a |

## 2. Root cause

Nothing could wake a closed app:
1. **No sender.** The only push sender (`sosFanout`) was never deployed. The Worker alternative is empty and broken.
2. **No receiver on Android.** The native app had no FCM: no plugin, no `google-services.json`, no messaging service, no token. Even a deployed function had no Android device to reach.
3. **No background check of SOS.** The native minute poll covered guardian alerts, not SOS.
4. The in-app alert only ran while the WebView was in the foreground. Android freezes the WebView otherwise. With the app open it was a 2.5 s sound and a card, not a takeover.

## 3. Design

### 3.1 Server: one trigger, one push per SOS
`sosFanout` = `onValueWritten('/sos/{uid}')` (functions/index.js + functions/recipients.js, which is pure and unit-tested).
- **Start** (new `id`/`ts`, or reopened after closed) → alarm push. **End** (`resolved:true`, a lifecycle `state` of cancelled / false_alarm / expired / resolved, or deleted) → silent `sos_clear` to the same people. Type, position and heartbeat updates send nothing.
- Lifecycle `state` values from EVENT-LIFECYCLE-SPEC.md are already understood.
- `alarmFanout` now **skips** `tag:'sos'` items. Each SOS gets exactly one push.
- **Recipients** (the app's existing rules):
  - *Paired*: every uid in `pairs/<sender>`, at any distance. These are exactly the people the rules let read `sos/<sender>`.
  - *Nearby*: other devices whose ~1 km point is less than 2 days old and within 5 km. A device with **no point is never "nearby"** (this fixes the old bug).
  - The sender is excluded. Each token is sent once, and paired wins.
- **Message**:
  - Android tokens: **data-only**, `android.priority: high`, `ttl: 900 s` (15 min; later is too late to help). A data-only message reaches SHOMER's own service even when the app is killed. A "notification" message is drawn by the system instead, with no alarm and no full-screen screen.
  - Web tokens: notification + `webpush` `Urgency: high`, `TTL: 900`, tag `sos-<id>`. A later update replaces the notification instead of stacking (as the lifecycle spec asks).
  - Title and body are built on the server in the device's language (he / en / ar).
- **Dead tokens** (unregistered or invalid) are deleted after each send.
- In the emulator the function **never contacts FCM**. It logs a dry run instead.

### 3.2 Android
- `ShomerMessagingService` (FirebaseMessagingService, priority 0, which beats Firebase's default service at -500) → `SosPush.handle`:
  - Dedupe by SOS id.
  - Starts `AlarmForegroundService` in "incoming" mode. A high-priority FCM message lets the app start a foreground service from the background. It plays a looping alarm on the **ALARM stream at max volume** (it ignores silent mode), vibrates, and posts a full-screen-intent notification with a "Silence" action.
  - If Android refuses the service, an **insistent** notification goes out instead (the sound repeats until opened) on channel `shomer_sos_alert`. That channel has the custom sound `res/raw/sos_alarm.wav`, alarm usage, vibration and bypass-DND.
  - `sos_clear` stops the ringing.
- **Full-screen intent.**
  - Android ≤13: shown over the lock screen.
  - Android 14+: only if the user allows it. This needs the Play "full-screen intent" declaration, which is already made for Shake-to-SOS. The app already has `canFullScreen` and `openFullScreenSettings`. Without the permission it falls back to a heads-up notification plus the looping alarm.
- **Tap** → MainActivity shows over the lock screen and passes the push data to `window.__shomerSosPush`, retrying until the page is ready. The web takeover then rings, and the native push alarm stops.
- **Token** → `ShomerNativePlugin.pushToken()`, plus `onNewToken` → `window.__shomerPushToken` (token refresh).
- **POST_NOTIFICATIONS** (Android 13+): already asked at start-up through LocalNotifications. The missing `notifPermCallback` in `ShomerNativePlugin.requestNotifications` is now added (that call never resolved before).
- **Backup with no server at all**: `BeatTask.checkPartnerSos` reads `pairs/<me>`, then each `sos/<partner>`, once a minute while the app is off-screen. A live SOS (under 25 min old) rings the same alarm through `SosPush`, with the same dedupe. Paired only. It needs the background shake service, which is on by default. Doze can delay it on a deeply idle phone. **This works the moment the new build installs, even before any Firebase deploy.**
- **Build** (CI): adds `firebase-messaging` (BoM 33.5.1). `google-services.json` comes from the secret `GOOGLE_SERVICES_JSON` or from `native/android-config/google-services.json`. Without it the build still succeeds: push is off and the poll backup still rings. Verified locally: the debug APK builds, the merged manifest has the service, and `raw/sos_alarm` is present.

### 3.3 Web (shomer.html, two isolated blocks before `</body>`)
- **A. SOS takeover** (safe for main alone):
  - A full-screen flashing red screen. The flash is ~1.1/s, under the 3/s seizure limit, and slower with reduced-motion.
  - A looping alarm (the existing `playAlarm`; on native, the ALARM-stream player), plus vibration.
  - "I see it, open the event" and "Silence" buttons. The 100/101/102 line stays.
  - It wraps `onPartnerSOS` / `onPartnerSOSClear` only. A fresh SOS takes over the screen; an "older SOS" does not.
  - Once acknowledged, the same SOS does not come back. A clear closes it.
- **B. Push tokens**:
  - Writes `tokens/<uid>/<device>` = `{token, ts, plat, lang, lat?, lng?}`.
  - The point is rounded to 2 decimals (~1 km). It is left out in ghost mode.
  - Removes the old single record, which held a precise point. Replaces `fbRegisterToken`.

### 3.4 Database rules
`tokens/<uid>/<device>`:
- Only the owner writes. Nobody reads (only the server can).
- Required fields: `token` (20-4096 chars), `ts`, `plat` (android|web).
- Optional fields: `lang` (he|en|ar), `lat`, `lng`.
- Any other field is rejected. The old flat shape is rejected, but deleting it is allowed.
- Verified in the database emulator: 7/7 cases.

## 4. Privacy (CLAUDE.md policy of 28 Oct + privacy.html)
- **No push carries the precise SOS location.**
  - Paired recipients read it from `sos/<sender>` after opening, through the existing rules.
  - Nearby recipients get only a ~1 km area point and "about N km". They get **no account id and no name**. This is unit-tested.
- The name in a paired push is the name **that recipient saved** for the sender (`pairs/<recipient>/<sender>/name`). It is never the sender's self-chosen name, and it is never sent to nearby people.
- The token's point is ~1 km, the same as live presence. It is not stored in ghost mode. `privacyRetention` removes it after **2 days** and the device record after **90 days** (both unit-tested). This is stricter than before, when the web token held a precise point forever.
- **NEEDS YOUR EYES (privacy policy).** `privacy.html` says *"we don't track location in the background; location is shared only by your deliberate action"*. A ~1 km point next to a push token is new stored data. It is required for "SOS near you". Draft lines, **not published**:
  - HE: **התראות SOS.** כדי שנוכל להעיר את הטלפון שלך כשמישהו מהשומרים שלך, או מישהו בקרבתך, לוחץ SOS, נשמר בשרת מזהה התראות של המכשיר (push token), שפת האפליקציה, ונקודה מעוגלת (כ-1 ק"מ) של המקום שבו פתחת את האפליקציה לאחרונה. במצב "רוח רפאים" הנקודה לא נשמרת. הנקודה נמחקת אחרי יומיים, ומזהה המכשיר אחרי 90 יום ללא שימוש. ההתראה שמקבלים אנשים בקרבתך כוללת רק אזור משוער (כ-1 ק"מ), בלי שם ובלי מזהה.
  - EN: **SOS alerts.** So we can wake your phone when one of your SHOMERs, or someone near you, presses SOS, the server stores your device's notification id (push token), the app language, and a rounded point (about 1 km) of where you last opened the app. In ghost mode no point is stored. The point is deleted after 2 days, and the device id after 90 days without use. People near you get only an approximate area (about 1 km), with no name or id.
- **NEEDS YOUR EYES (product).** Nearby strangers currently get the **full** alarm, as asked: looping sound and full-screen. To soften it to a single loud heads-up, set `NEARBY_ALARM = false` in functions/recipients.js (one line).
- Until Dave approves the policy line, **block B (tokens) stays on the branch**. Only block A (takeover) goes to main.

## 5. Deploy: what is live and what is blocked

| Step | Status | What is needed |
|---|---|---|
| Web takeover (block A) | Merged to main → www.shomer-app.co.il (staging; the native app loads this page too) | none |
| Rules + functions deploy | **Blocked** | No Firebase credential in this environment or in repo secrets. The 31 Oct workflow failed with "NO CREDENTIAL". Cloud Functions also need the **Blaze plan, which is pending Dave's explicit yes** (do not upgrade without it). Expected cost at this volume: $0, inside the free tier, but Blaze needs a billing account. |
| `google-services.json` (Android app in Firebase) | **Blocked** | Firebase console → Project settings → Add app → Android → package `il.co.shomerapp` → download. Then add it as repo secret `GOOGLE_SERVICES_JSON` (or give it to Claude). |
| Native build | CI ready (`android-build.yml`). versionCode/versionName = run number (auto-bumped, >61). Branch builds no longer overwrite the website APK. | Dispatch from this branch (or from main after merge) |
| Play testing track | Auto-upload step added. It runs only if the secret `PLAY_SERVICE_ACCOUNT_JSON` exists. | Today: Dave uploads the AAB artifact in Play Console → Testing → Internal testing → Create release. Testers then update automatically. |

**Fastest path to testers.** The native build alone (poll backup) gives paired SHOMERs a real locked-phone alarm within about 1 minute, with no Firebase deploy. The full instant push needs: Blaze yes, a Firebase credential, and `google-services.json`.

Deploy commands, once a credential exists:
```
firebase deploy --only database,functions:sosFanout,functions:alarmFanout,functions:privacyRetention --project shomergency
```
`privacyRetention` should go out with the rest because it enforces the 2-day and 90-day token limits.

## 6. Tests (all without real pushes)
- `cd functions && npm test`: 17 unit tests covering recipients (paired at any distance, nearby within 5 km, no-point and stale-point excluded, sender excluded, multi-device and dedupe, old shape), lifecycle states, message privacy (no precise location; no id or name for nearby), TTL and priority, and token retention.
- Firebase emulator (project `demo-shomer`, fake tokens, FCM never contacted):
  - Start → paired + nearby only.
  - Type/position update → nothing.
  - Resolve → clear.
  - Token rules: 7/7.
- Playwright (network blocked except localhost):
  - The takeover covers the full screen and rings.
  - Ack → it closes and the card stays.
  - No re-show for the same SOS. Clear → it closes. A new SOS → it shows again. An older SOS → no takeover.
  - Nearby push → "SOS near you" with no name.
  - Token block → ~1 km point, no point in ghost mode, valid device keys.
- Android: debug APK compiled locally with the CI steps.
