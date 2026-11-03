# SH✡MER iPhone build runbook

From "Apple account + Xcode exist" to TestFlight and App Store submission.
Branch `ios-native`. Project: `native/ios/App/App.xcworkspace`. Bundle id: `com.shamrocks.shomer`.

**Who does what**
- **CLAUDE**: Claude does it on Dave's Mac. It drives Terminal and Xcode through screen control (computer use, which Dave allows once), and uses Dave's browser when he is already signed in.
- **DAVE**: needs Dave's Apple ID password or 2FA code, or his explicit green light. Claude never types passwords.

Nothing is submitted, published or paid for without Dave's green light.

---

## 0. Before the session (DAVE, one-time)

| Step | Who | What |
|---|---|---|
| 0.1 | DAVE | **Apple Developer Program enrolment, US$99/year** (needs your approval to pay). https://developer.apple.com/programs/enroll/ |
| | | *Organisation* (recommended for a product sold to municipalities): the seller shown on the App Store is "3Shamrocks Studio". It needs a registered legal entity and a free D-U-N-S number; Apple does not accept a sole proprietorship (עוסק) as an organisation. Takes about 1–3 weeks. |
| | | *Individual*: the seller shown is "Dave Markovich". Usually approved in 1–2 days. It can be moved to an organisation later through Apple support. |
| 0.2 | DAVE | Install **Xcode** from the Mac App Store (free, large download). Open it once and accept the licence. Apple requires uploads to use a recent Xcode/SDK: https://developer.apple.com/news/upcoming-requirements/ |
| 0.3 | DAVE | On the iPhone used for testing: Settings → Privacy & Security → **Developer Mode** → on (the phone restarts). It appears after the first install from Xcode. |

## 1. Mac tooling (CLAUDE, ~20 min)

```bash
xcode-select -p || sudo xcode-select --switch /Applications/Xcode.app   # sudo asks Dave's Mac password: DAVE types it
brew --version || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node cocoapods
```

## 2. Get the project building (CLAUDE, 2–4 h)

```bash
git clone https://github.com/3ShamrocksStudio/shomer-app.git && cd shomer-app
git checkout ios-native
cd native
npm install
node scripts/copy-web.js          # fills www/ (offline fallback page)
npx cap sync ios                  # copies web + plugins, runs pod install on the Mac
open ios/App/App.xcworkspace      # always the .xcworkspace, never the .xcodeproj
```

Then in Xcode:
1. Build once (⌘B). The Swift files `ShomerNativePlugin.swift`, `ShomerBeat.swift` and
   `ShomerViewController.swift` were written on Linux and have **never been compiled**. Fix whatever
   the compiler reports, keeping the JS method names unchanged.
2. Check `@capacitor-community/text-to-speech` 5.1.0 (a Capacitor 5 plugin) passes `pod install`.
   If it fails, move to the Capacitor 6 release of that plugin.
3. Commit the fixes to `ios-native` (one commit per logical change).

## 3. Signing (DAVE once, then CLAUDE)

| Step | Who | What |
|---|---|---|
| 3.1 | DAVE | Xcode → Settings → Accounts → **+** → Apple ID → sign in (password + 2FA code). |
| 3.2 | CLAUDE | Target **App** → Signing & Capabilities → Team = Dave's team, "Automatically manage signing" on. Xcode registers `com.shamrocks.shomer` and creates the profiles. |
| 3.3 | CLAUDE | Confirm the capabilities: Background Modes (Location updates, Audio; already in Info.plist) and Time Sensitive Notifications (already in `App.entitlements`). |

**Bundle id decision (NEEDS YOUR EYES):** iOS uses `com.shamrocks.shomer`, as requested. Android
is `il.co.shomerapp`. Different ids per platform work fine. But once the first build is uploaded,
the iOS id **can never change**. To match Android instead, change `PRODUCT_BUNDLE_IDENTIFIER` (2 lines in
`project.pbxproj`) before step 3.2.

## 4. First run on Dave's iPhone (CLAUDE drives, DAVE holds the phone, ~1–2 h)

Connect the iPhone by cable and press ▶ Run with the phone as destination. Then test:

- [ ] Sign-in with the Firebase test phone number
- [ ] Location prompt shows the Hebrew text on a Hebrew phone, English on an English one
- [ ] Turn on sharing → iOS later offers "Change to Always Allow" → accept
- [ ] Lock the phone and walk 100 m → a second phone (Android) sees the position move
- [ ] SOS → alarm audible **with the Silent switch on** → cancel within the countdown
- [ ] Lock the phone with sharing on → shake hard 6× → "SOS countdown started" notification → does the countdown continue while locked? (Parity row 5. If not, build the native countdown fallback)
- [ ] Alert from a linked SHOMER while this phone is locked → alarm + notification within ~60 s
- [ ] Contacts picker, fake call (voice answer + typing), theft selfie camera
- [ ] Notch and home-indicator layout, Hebrew RTL

## 5. Push to a closed iPhone (CLAUDE + DAVE logins, ~4–8 h, can come after the first TestFlight)

| Step | Who | What |
|---|---|---|
| 5.1 | DAVE | Sign in to the Firebase console in the browser (if not already). |
| 5.2 | CLAUDE | Firebase project `shomergency` → Add app → iOS → bundle id `com.shamrocks.shomer` → download **GoogleService-Info.plist** → place at `native/ios/App/App/GoogleService-Info.plist` and add it to the App target. Never type or invent its keys; it is git-ignored. |
| 5.3 | DAVE | Sign in at developer.apple.com in the browser (2FA). |
| 5.4 | CLAUDE | Certificates, IDs & Profiles → Keys → **+** → Apple Push Notifications service → download the `.p8` (downloadable **once**; store it with the Android keystore). Firebase → Project settings → Cloud Messaging → Apple app → upload the `.p8` with its Key ID and the Team ID. |
| 5.5 | CLAUDE | Add the Push Notifications capability (adds `aps-environment`) and Background Modes → Remote notifications. |
| 5.6 | CLAUDE | Client: the Capacitor push plugin returns an **APNs** token on iOS, but `functions/index.js` sends with FCM. Use `@capacitor-firebase/messaging` (or the FirebaseMessaging pod in `AppDelegate.swift`) so iOS registers an **FCM** token into `tokens/<uid>`. Add it in a way that cannot touch Android until `google-services.json` exists there; the Android push `register()` fails without it. |
| 5.7 | CLAUDE | Server: add `apns: {payload: {aps: {sound: 'default', 'interruption-level': 'time-sensitive'}}}` to `alarmFanout`, and a new trigger on `ping/{uid}/{from}` that pushes alerts from linked SHOMERs. Check the data policy in `CLAUDE.md` first: no new data fields. |
| 5.8 | DAVE | Green light to deploy functions. Check that the Firebase plan allows Cloud Functions (Blaze). **Zero spend: no plan change without Dave's OK.** Then CLAUDE runs `firebase deploy --only functions --project shomergency`. |

## 6. Invite links open the iPhone app (CLAUDE, DAVE green light for the live site, ~1 h)

1. Add the Associated Domains capability: `applinks:www.shomer-app.co.il` and `applinks:shomer-app.co.il`.
2. Add this file to the site as `/.well-known/apple-app-site-association` (no extension). The site
   already has `.nojekyll` and `/.well-known/assetlinks.json`. `TEAMID` is shown in the developer account.
   ```json
   {"applinks":{"details":[{"appIDs":["TEAMID.com.shamrocks.shomer"],"components":[{"/":"/i"},{"/":"/i/*"}]}]}}
   ```
3. It goes on `main`, which is the live site, so it needs **Dave's green light**.
4. Verify through Apple's CDN: `https://app-site-association.cdn-apple.com/a/v1/www.shomer-app.co.il`.

## 7. Critical Alerts entitlement request (CLAUDE drafts, DAVE submits)

The form is https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/.
It asks how the app uses critical alerts. Draft answer:

> SH✡MER is a personal-safety app. When someone a user has linked with (both sides approved) triggers
> an SOS, the linked user must hear it even if their phone is muted or in a Focus mode. Critical alerts
> are used only for SOS events from linked people, never for marketing or routine updates.

Once Apple approves it: add `com.apple.developer.usernotifications.critical-alerts` to
`App.entitlements` and set `ShomerNotify.criticalAlertsApproved = true`.

## 8. App Store Connect record (CLAUDE in Dave's signed-in browser; DAVE 2FA once)

https://appstoreconnect.apple.com → Apps → **+** New App:
- Platform iOS · Name / subtitle / keywords / description from `IOS-STORE-LISTING.md`
- Primary language: Hebrew · Bundle id `com.shamrocks.shomer` · SKU `shomer-ios`
- Privacy Policy URL `https://www.shomer-app.co.il/privacy.html`. Update it first (`IOS-APPSTORE-READINESS.md` §2).
- App Privacy: answers from `IOS-APPSTORE-READINESS.md`
- Age rating questionnaire, category: see `IOS-STORE-LISTING.md`

## 9. Archive and upload (CLAUDE, ~30 min per build)

Bump the build number each upload: `CURRENT_PROJECT_VERSION` (1, 2, 3…). `MARKETING_VERSION` 1.0.0.

Xcode: destination **Any iOS Device (arm64)** → Product → **Archive** → Organizer → Distribute App →
App Store Connect → Upload. Or from Terminal:

```bash
cd native/ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/SHOMER.xcarchive \
  -allowProvisioningUpdates archive
cat > build/export.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>method</key><string>app-store-connect</string><key>destination</key><string>upload</string></dict></plist>
EOF
xcodebuild -exportArchive -archivePath build/SHOMER.xcarchive \
  -exportOptionsPlist build/export.plist -exportPath build/export -allowProvisioningUpdates
```

Export compliance is already answered in Info.plist (`ITSAppUsesNonExemptEncryption = false`).

## 10. TestFlight

| Step | Who | What |
|---|---|---|
| 10.1 | — | Apple processes the build (usually 10–30 min). |
| 10.2 | CLAUDE | TestFlight → Internal Testing → group "SHOMER team" → add Dave (his Apple ID email). Internal testers need no Apple review. |
| 10.3 | DAVE | Install **TestFlight** from the App Store on the iPhone → accept the invite → install SH✡MER. Turn on automatic updates in TestFlight, so new builds arrive without asking testers. |
| 10.4 | CLAUDE | External testers (e.g. the Android testers with iPhones): External group → submit for Beta App Review (usually about a day) → public link. **DAVE green light** before inviting anyone outside. |

## 11. App Store submission (DAVE green light)

1. CLAUDE: attach screenshots (`IOS-STORE-LISTING.md`), review notes + test phone number + demo video (`IOS-APPSTORE-READINESS.md`), choose the build, release option **"Manually release this version"**.
2. **DAVE**: green light → CLAUDE presses "Submit for Review". Review usually takes 1–2 days.
3. After approval it waits for Dave's manual release. Nothing goes public until he releases it.

## Estimated time

| From | To | Individual account | Organisation account |
|---|---|---|---|
| Start enrolment | Account approved | ~1–2 days | ~1–3 weeks (D-U-N-S + verification) |
| Account approved + Xcode installed | First build on Dave's iPhone | 1 working session (steps 1–4) | same |
| First build | Internal TestFlight | same day (+10–30 min processing) | same |
| **Enrolment start → internal TestFlight** | | **~2–4 days** | **~1–3 weeks** |
| Internal TestFlight | External TestFlight / App Store review | +1–2 days each (Apple review) | same |
| Closed-app push (step 5) | | +1 session, can follow the first TestFlight | same |
