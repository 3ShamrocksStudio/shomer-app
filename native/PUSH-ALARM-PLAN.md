# SH✡MER: SOS push alarm (app closed / phone locked)

> Branch `sos-push-alarm`, 3 Nov 2026. Trigger: Dave's test on 3 Nov. An SOS gave the other users
> **no alarm at all** while their app was closed. They saw only a small red banner if they opened the app.
> Updated after the independent verifier's review (D1-D8).

## 1. What existed before this branch

| Piece | Where | State |
|---|---|---|
| SOS record | `fbPublishSOS` writes `sos/<senderUid>` = `{uid,id,lat,lng,type,typeState,ts,resolved}`. One record per person. Only the sender writes it; only people the sender paired with can read it. | Works |
| Public dashboard row | `fbDashSos` → `dashfeed/sf_<random>` (type, ~1 km, no id) | Works. The push function writes **no** dashfeed row. |
| In-app alert | Listener on `sos/<partner>` → `onPartnerSOS`: a 2.5 s siren and a card | Foreground only |
| `sosFanout` | functions/index.js | **Never deployed.** Bugs: a device with no location counted as "near"; it used `sos.name` (forbidden by the rules); a notification message cannot ring an alarm. |
| `alarmFanout` + `fbAlertPairedSos` (`alarms/*`, tag `sos`) | functions/index.js | Not deployed. It would be a 2nd push per SOS. |
| Cloudflare Worker | worker/, `SHOMER_PUSH_URL=''` | Not deployed, and broken (reads `sos/<sosId>`, reads `tokens` without admin). **Superseded. Keep the URL empty.** |
| FCM tokens | Web only, `tokens/<uid>` = `{token,ts,lat,lng}` with a **precise** point, no expiry, not disclosed. Native: no FCM at all. | Fixed live in **v313**: the web token no longer stores any location. |
| Native background | `ShakeService` (on by default) → `BeatTask` each minute. It polled guardian alerts only. | Partial |
| Twilio | SMS verification only | n/a |

## 2. Root cause
1. **No sender.** `sosFanout` was never deployed: no Firebase credential, and Blaze not approved.
2. **No receiver on Android.** No FCM plugin, no `google-services.json`, no messaging service, no token.
3. **No background SOS check.** The native poll covered guardian alerts only.
4. **Weak in-app alert.** It worked only in the foreground: 2.5 s of sound and a card.

## 3. Design

### 3.1 Server (functions/index.js + functions/recipients.js, pure + unit-tested)
**One trigger:** `onValueWritten('/sos/{uid}')`, and the record's `uid` must equal the key.
- **Start** (new id/ts, or reopened) → alarm push. **End** (`resolved:true`, a lifecycle `state` of cancelled / false_alarm / expired / resolved, or deleted) → silent `sos_clear` to the same people. Type, position and heartbeat updates send nothing.
- `alarmFanout` skips `tag:'sos'`. Each SOS gets exactly one push.

**Abuse guards:**
- **Paired = linked both ways.** Both `pairs/<sender>/<uid>` and `pairs/<uid>/<sender>` must exist (D1). A one-sided link gets nothing from far away; up close it is treated as a nearby stranger, with no name and no id.
- **Cooldown:** at most 1 SOS push per sender per 2 minutes (D2). `pushlog/<uid>` is set in a transaction; it is server-only (rules deny clients) and deleted after 1 day.
  - Trade-off: a re-press within 2 min of the last push does not re-push. The in-app listener and the native poll still alarm paired SHOMERs.

**Recipients:**
- *Paired*: mutual, any distance.
- *Nearby*: other devices with a ~1 km point younger than 2 days, within 5 km. A device with no point is **never** nearby.
- The sender is excluded. Each token is sent once, and paired wins.

**Message:**
- Android: **data-only**, `android.priority: high`, `ttl: 900 s`. Only a data message reaches SHOMER's own service when the app is killed.
- Web: notification + `webpush` `Urgency: high`, `TTL: 900`, tag `sos-<id>` (updates replace instead of stacking).
- Text is in the device language (he / en / ar).
- **The SOS push is an alarm only.** "הידעת?" feature tips and any other non-SOS notification must never use `kind:'sos'` or the `shomer_sos_*` channels (Dave, 3 Nov; the tips themselves are the UX agent's).

**Dead tokens** are deleted after each send. In the emulator the function **never contacts FCM** (it logs a dry run).

### 3.2 Android
- `ShomerMessagingService` (priority 0, which beats Firebase's default at -500) → `SosPush.handle`.
  - Dedupe by SOS id.
  - Starts **`IncomingAlarmService`** (D6): a separate foreground service for *someone else's* SOS.
    - Its own player and notification (id 14). `START_NOT_STICKY`. Rings at most 5 min.
    - It plays a loop on the ALARM stream at max volume, vibrates, and posts a full-screen-intent notification with "Silence".
    - My own SOS siren (`AlarmForegroundService` / `AlarmPlayer`) is untouched. Clearing an incoming alarm can never stop it.
  - If the service cannot start, an insistent notification (sound repeats) goes out on `shomer_sos_alert` (custom `res/raw/sos_alarm.wav`, alarm usage, vibration, bypass-DND).
  - `sos_clear` stops `IncomingAlarmService` only.
- **Full-screen intent.** Android ≤13: over the lock screen. Android 14+: only if the user allows it (Play declaration already made for Shake-to-SOS; the app has `canFullScreen` / `openFullScreenSettings`). Otherwise heads-up + loop.
- **Tap** → MainActivity shows over the lock screen and passes the push data to `window.__shomerSosPush`. It retries every 0.75 s for up to 45 s, also while the bridge is still `null` on a cold start (D4). The takeover then owns the ringing service.
- **Acknowledge** (web) → `stopIncomingAlarm` stops that service and clears show-over-lock (D7).
- Plugin methods: `pushToken`, `sosSeen({sid})` (no more push/poll ring for this SOS), `startIncomingAlarm`, `stopIncomingAlarm`. The missing `notifPermCallback` is added, so the POST_NOTIFICATIONS ask on Android 13+ now resolves.
- **Token refresh:** `onNewToken` → `window.__shomerPushToken`.
- **Backup with no server:** `BeatTask.checkPartnerSos` reads `pairs/<me>`, then each `sos/<partner>`, once a minute while off-screen. Mutual by construction (the rules let me read `sos/<partner>` only if they paired me). Same alarm, same dedupe. Needs the background shake service (on by default). Doze can delay it.
- **Build:** CI adds `firebase-messaging` (BoM 33.5.1). `google-services.json` comes from the secret `GOOGLE_SERVICES_JSON` or from `native/android-config/`. Without it: push off, poll on.
- `native/.gitignore` ignores every `android/` folder: new files under `native/shomer-android/android/` need `git add -f`.

### 3.3 Web (shomer.html, two isolated blocks before `</body>`)
**A. SOS takeover** (on main)
- Full-screen flashing red (~1.1 flashes/s, slower with reduced-motion), looping alarm, vibration. "I see it, open the event" and "Silence" buttons. The 100/101/102 line stays.
- Wraps `onPartnerSOS` / `onPartnerSOSClear` only.
  - A fresh SOS takes over; an "older SOS" does not.
  - A push opened on a cold start counts as paired if the server said `role:'paired'` with `from` (D5).
- **Sound:** someone else's SOS never uses or stops my own siren.
  - Native: `startIncomingAlarm`. Older builds: `startGuardAlarm`. Browser: `playAlarm` loop.
  - While my own SOS runs, the takeover only vibrates.
- **Acknowledgement:** stored in `localStorage` (`shomer_tko_ack`) by SOS id for 30 minutes, so a reload does not ring the same SOS again. A clear removes it.

**B. Push tokens** (branch only, see §5)
- `tokens/<uid>/<device>` = `{token, ts, plat, lang, lat?, lng?}`.
- The point is rounded to 2 dp (~1 km) and left out in ghost mode.
- Removes the old single record.

### 3.4 Database rules (branch only, see §5)
- `tokens/<uid>/<device>`: only the owner writes; nobody reads.
  - Required fields: `token` (20-4096 chars), `ts`, `plat` (android|web).
  - Optional fields: `lang` (he|en|ar), `lat` and `lng`, **at most 2 decimals, same check as dashfeed** (D3).
  - Any other field and the old flat shape are rejected; deleting the old shape is allowed.
- `pushlog`: no client read or write.

## 4. Privacy (CLAUDE.md policy of 28 Oct + privacy.html)
- **No push carries the precise SOS location.**
  - Paired recipients read it from `sos/<sender>` after opening (existing rules).
  - Nearby recipients get only a ~1 km area, "about N km", the type and the time. **No name, no account id.** This is unit-tested.
- The name in a paired push is the one **that recipient saved** for the sender. It is never sent to nearby people.
- Token point: ~1 km, none in ghost mode. Retention (`privacyRetention`): point removed after 2 days, device record after 90 days unused, `pushlog` after 1 day. Retention is **only active once that function is deployed**.
- **NEEDS YOUR EYES (product):** nearby strangers get the **full** alarm, as asked. `NEARBY_ALARM = false` in functions/recipients.js softens it to one loud heads-up.

**NEEDS YOUR EYES: privacy-policy draft (not published).** Add to privacy.html as a new section.

HE: **התראות SOS והתראות דחיפה**
- כשאת/ה לוחץ/ת SOS, השומרים שקישרת איתם (בשני הכיוונים) מקבלים אזעקה בטלפון גם כשהאפליקציה סגורה. היא כוללת את השם שהם שמרו עבורך, והמיקום המדויק נפתח רק בתוך האפליקציה, ורק להם.
- משתמשים אחרים במרחק של עד 5 ק"מ מקבלים אזעקה עם אזור משוער בלבד (כ-1 ק"מ), סוג האירוע והשעה, בלי שם ובלי מזהה חשבון.
- כדי לשלוח התראות כאלה נשמרים בשרת, לכל מכשיר: מזהה התראות (push token), סוג המכשיר, שפת האפליקציה, ונקודה מעוגלת (כ-1 ק"מ) של המקום שבו פתחת את האפליקציה לאחרונה. במצב "רוח רפאים" הנקודה לא נשמרת.
- עם הפעלת ניקוי השרת האוטומטי, הנקודה נמחקת אחרי יומיים, ומזהה המכשיר אחרי 90 יום ללא שימוש.
- ההתראות נשלחות דרך Google Firebase Cloud Messaging (מעבד מידע).

EN: **SOS alerts and push notifications**
- When you press SOS, the SHOMERs you linked with (both ways) get an alarm on their phone even when the app is closed. It carries the name they saved for you, and your exact location opens only inside the app, and only for them.
- Other users within 5 km get an alarm with only an approximate area (about 1 km), the type of event and the time, with no name and no account id.
- To send these alerts, the server stores for each device: a notification id (push token), the device type, the app language, and a rounded point (about 1 km) of where you last opened the app. In ghost mode no point is stored.
- Once automatic server cleanup is switched on, the point is deleted after 2 days, and the device id after 90 days without use.
- Notifications are sent through Google Firebase Cloud Messaging (a data processor).

## 5. Deploy order (D8) and status
**Deploy order: rules ship only together with block B.** The new rules reject the old flat token shape that main still writes (v313: `{token, ts}`). So:
1. Dave approves the privacy text → publish it in privacy.html.
2. Merge block B (token registration) to main **in the same release** as the rules deploy (`database`), never the rules first.
3. Deploy the functions `sosFanout`, `alarmFanout` and `privacyRetention` in the same run. Retention enforces the 2-day and 90-day limits.
4. Ship the native build with `google-services.json`.

Until step 2, main keeps the v313 writer (no location), and the deployed rules stay as they are.

| Step | Status | What is needed |
|---|---|---|
| Web takeover (block A) + v313 token privacy fix | On main → www.shomer-app.co.il (staging; the native app loads this page) | none |
| Rules + functions | **Blocked** | **Blaze plan: pending Dave's explicit yes (do not upgrade).** Expected cost $0 (free tier), but it needs a billing account. Plus a Firebase credential: repo secret `FIREBASE_SERVICE_ACCOUNT` (Firebase console → Project settings → Service accounts → Generate key) or a `firebase login:ci` token. |
| `google-services.json` | **Blocked** | Firebase console → Add app → Android → package `il.co.shomerapp` → download → repo secret `GOOGLE_SERVICES_JSON` |
| Native build | CI `android-build.yml`. versionCode = run number. Branch builds do not replace the website APK. | Rebuild after `GOOGLE_SERVICES_JSON` to turn push on |
| Play testing | Auto-upload step runs only with the secret `PLAY_SERVICE_ACCOUNT_JSON` | Today: Dave uploads the AAB artifact: Play Console → Testing → Internal testing → Create release |

Commands, once a credential exists and Blaze is approved:
`firebase deploy --only database,functions:sosFanout,functions:alarmFanout,functions:privacyRetention --project shomergency`

## 6. Tests (no real pushes)
- `cd functions && npm test`: 19 tests.
  - Recipients: mutual only, any distance, nearby within 5 km, no-point and stale-point excluded, sender excluded, multi-device and dedupe, old shape.
  - Cooldown, lifecycle states.
  - Message privacy, TTL and priority.
  - Retention: tokens and `pushlog`.
- Firebase emulator (`demo-shomer`, fake tokens, FCM never contacted):
  - Start → mutual friend + nearby only. The one-way link is excluded.
  - Update → nothing. Resolve → clear. A 2nd SOS within 2 min → skipped.
  - Rules: 9/9, including a 5-decimal point rejected and client `pushlog` writes rejected.
- Playwright (network blocked except localhost):
  - Takeover full screen and ringing; ack, no re-show, clear, new SOS shows, older SOS stays quiet.
  - Nearby push shows no name. Cold-start paired push works.
  - **Ack survives a reload.**
  - **My own siren is not stopped by silencing someone else's SOS.**
  - Token block: ~1 km point, none in ghost mode.
- Android: debug APK compiled locally; CI release builds.
