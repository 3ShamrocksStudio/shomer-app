# SH✡MER iPhone app: App Store review risks

Branch `ios-native`, 2026-11-03. Guideline quotes are short excerpts fetched today from
**https://developer.apple.com/app-store/review/guidelines/** (the "Guidelines" link below).
Evidence for SH✡MER comes from this repo, with file and line numbers.

Items marked **NEEDS YOUR EYES** need Dave's decision or approval before submission.

## Top 3 risks

| # | Risk | Guideline | Likelihood without action | Mitigation |
|---|---|---|---|---|
| 1 | Reviewed as a "repackaged website", because the app loads the live site | 4.2, 2.5.2 | Medium–high | Ship the web app inside the iOS binary, and list the native features in the review notes (details below) |
| 2 | Privacy policy says "we do not track location in the background", but the app does when the user turns sharing on with "Always" | 5.1.1, 5.1.2, nutrition label | High: reviewers compare the policy and label with the permission prompts | Update `privacy.html` before submission (**NEEDS YOUR EYES**, legal text) |
| 3 | Background location + audio modes, and "emergency" use of location | 2.5.4, 5.1.5 | Medium | Review notes + demo video showing why each mode is needed. Position SH✡MER as consent-based personal safety, never as an emergency service |

---

## 1. Guideline 4.2 Minimum Functionality / 2.5.2 code download

> 4.2: "Your app should include features, content, and UI that elevate it beyond a repackaged website."
> 2.5.2: apps may not "download, install, or execute code which introduces or changes features or functionality of the app".
> Source: [Guidelines](https://developer.apple.com/app-store/review/guidelines/), sections 4.2 and 2.5.2.

**Where SH✡MER stands.** `native/capacitor.config.json` sets `server.url` to
`https://www.shomer-app.co.il/shomer.html`. The app shows the live website, and every web
deploy changes the app with no review. That is exactly the case 2.5.2 describes, and it is how
reviewers spot a "wrapper".

**What already lifts it above a website** (all real code, list it in the review notes):
- background location sharing with My Shomers (`native-bridge.js`, background-geolocation plugin);
- the native SOS alarm that plays through the Silent switch (`ShomerNativePlugin.swift`, `ShomerAlarm`);
- native Shake-to-SOS with CoreMotion (`ShomerShake`);
- background alerts from linked SHOMERs with Time Sensitive notifications (`ShomerBeat.swift`);
- the native contacts picker, on-device speech recognition and text-to-speech for the fake-call check-in;
- local notifications while the app is in the background.

**Mitigation (recommended).** For iOS, bundle the web app in the binary: `webDir: www` from
`scripts/copy-web.js`, no `server.url`, and no "hop to live site" script in the iOS copy.
Reviewers then review the code that users actually run. Trade-off: web fixes reach iPhones only
through an App Store update, which usually takes 1–2 days. Android is unaffected.
**NEEDS YOUR EYES:** bundled (lower risk, slower updates) or live (instant updates, real rejection risk)?
Claude recommends bundled for the first submission. The switch is about 1 hour of work in the build session.

## 2. Privacy: guidelines 5.1.1, 5.1.2 and the nutrition label

> 5.1.1(i): "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner."
> 5.1.1(ii): apps "must secure user consent for the collection, even if such data is considered to be anonymous".
> 5.1.1(iii): "Apps should only request access to data relevant to the core functionality of the app".
> 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app."
> 5.1.2(i): "you may not use, transmit, or share someone's personal data without first obtaining their permission."

**Gaps found (privacy.html, last updated 31.10.2026):**

| Real data flow (evidence) | What privacy.html says | Action |
|---|---|---|
| Background location while sharing is on and "Always" is granted (`native-bridge.js` `startBackground`; iOS Info.plist `NSLocationAlwaysAndWhenInUseUsageDescription`) | "לא עוקבים אחרי מיקום ברקע. המיקום משותף אך ורק בפעולה יזומה שלך" ("we do not track location in the background") | **Contradiction.** Rewrite it as: background sharing happens only after you turn sharing on and choose "Always"; you can pause it (ghost mode) or turn it off |
| Anonymous dashboard presence row, about 1 km, with a daily-rotating tag; server-side owner record `dashown/<id>` = account id (`shomer.html` ~L11388–11480; `ShomerBeat.swift`) | Not mentioned | Add it. This matches the CLAUDE.md data policy |
| Push token stored with the **precise** last position, `tokens/<uid>` = {token, lat, lng} (`shomer.html` L11740 `fbRegisterToken`) | Not mentioned | Add it, or round it to ~1 km first. Only nearby targeting (5 km) needs it |
| Theft-protection selfie sent to My Shomers with location (`shomer.html` ~L5640–5700) | Not mentioned | Add it (opt-in, camera) |
| Report / alert photos, missing-person alerts, AEDs | Covered (EN + HE) | OK |
| Phone number: hashed in `registry/`, verification through Twilio | Covered (HE only) | Add English |
| Picked contact (name + number) used for an invite | Not mentioned | Add one line |
| Speech recognition (processed by Apple; SH✡MER stores nothing) | Not mentioned | Add one line |

The core "what we collect" section exists **in Hebrew only**, and the page says the full
version comes "before the public launch". The App Store is a public launch.
**NEEDS YOUR EYES:** approve an updated privacy.html in Hebrew and English before submission.
It is a live-site change.

**Already compliant:**
- In-app privacy page and terms (`shomer.html` ~L10091–10200).
- In-app account deletion. Settings removes presence, positions, tokens, geo, check-in, registry hash, pairs and own SOS, and writes a tombstone (`shomer.html` ~L3520–3555). Small follow-up: also delete the anonymous Firebase Auth user (`currentUser.delete()`); today it only signs out. The record holds no name or phone, but Apple expects the account record itself to go. Effort XS.
- Alternatives when permission is refused (5.1.1(iv)): skip button for location, manual number entry when contacts are refused, typing instead of voice.
- No ads, no third-party analytics, no tracking.

### Draft App Privacy ("nutrition label") answers

Based on the real flows above. Apple's definitions: https://developer.apple.com/app-store/app-privacy-details/
(not reachable from this session; check the categories against it while filling in App Store Connect).

**Tracking:** No. No ads, no data brokers, nothing linked with other companies' data.

| Data type | Collected? | Linked to user? | Purpose | Source |
|---|---|---|---|---|
| Precise Location | Yes | Yes | App Functionality | SOS, live sharing with My Shomers, `tokens/<uid>` |
| Coarse Location | Yes | Yes (server-side owner record) | App Functionality, Analytics (community dashboard) | `dashfeed` ~1 km / ~10 km rows |
| Phone Number | Yes | Yes | App Functionality (verification) | Twilio Verify, hashed registry |
| Name (display name) | Yes | Yes | App Functionality | profile, invites |
| Photos | Yes | Yes | App Functionality | report / alert photos, theft selfie |
| Other User Content | Yes | Yes | App Functionality | reports, descriptions, AED entries |
| User ID | Yes | Yes | App Functionality | Firebase account id |
| Device ID | Yes | Yes | App Functionality | push token, app device id (`dev`, hashed in the dashboard tag) |
| Contacts | No (only the picked contact, used for an invite) | — | — | **Check before submitting:** if the invitee's number is sent to the server (even hashed, for the registry lookup), answer Yes / App Functionality |
| Audio Data | No (speech handled by Apple's framework; nothing stored by SH✡MER) | — | — | — |
| Health, Financial, Browsing, Search, Diagnostics | No | — | — | `fbLog` writes to the device console only |

## 3. Background modes (2.5.4) and location services (5.1.5)

> 2.5.4: "Multitasking apps may only use background services for their intended purposes: VoIP, audio playback, location, task completion, local notifications, etc."
> 5.1.5: "Location-based APIs shouldn't be used to provide emergency services or autonomous control over vehicles…"

**Modes declared** (`Info.plist`): `location` and `audio`. Push (`remote-notification`) is added only when push is wired in.
- `location`: live location shared with the people the user chose in My Shomers, background SOS location and background Shake-to-SOS. Shown by the blue status-bar pill. Gated by consent and ghost mode in `native-bridge.js`.
- `audio`: **only** the SOS alarm and alerts from linked SHOMERs (`ShomerAlarm`). Never silent audio to keep the app alive, which would be a rejection.

**Mitigation:**
1. App Review notes explaining each mode, in two sentences each.
2. A 30–60 s screen recording: turn on sharing → grant Always → lock the phone → a second phone sees the position move; then shake → SOS countdown → cancel. Android already has `demo-video.yml` for Play.
3. Wording. 5.1.5 forbids location-based "emergency services". SH✡MER's in-app disclaimer already says it is "not an emergency service and does not replace police, ambulance, or fire services. In an emergency, call 100 / 101 / 102" (`shomer.html` L10101, Hebrew L10075). Keep that framing in the listing ("personal safety and consent-based location sharing"), show the emergency-number buttons in the review notes, and never call SH✡MER an emergency service.

## Other checks

| Guideline | Status | Note |
|---|---|---|
| 1.2 User-generated content (filter, report, block, contact) | Meets | Text filter `hasAbuse`, "Report content" and "Block user" (`shomer.html` ~L6457, L12501–12547), terms L10117. Put the support email in the listing |
| 1.1.6 False information / prank calls ("Apps that enable anonymous or prank phone calls or SMS/MMS messaging will be rejected") | Low risk | The fake call is an on-screen check-in, not a real call. Describe it as a "safety check-in call screen" |
| 1.4 Physical harm | Low risk | SOS has a cancel countdown and anti-abuse limits (`shomer.html` ~L5346–5500) |
| 2.1 Demo account | Action | Login is phone + SMS. Give the reviewer a Firebase **test phone number** + fixed code (no SMS cost), in the App Review notes. `founderFastPath` must not exist in the shipped build |
| 2.3.7 Name ≤ 30 characters, honest keywords | Meets | See `IOS-STORE-LISTING.md`: no competitor or trademark names |
| 4.5.4 Push not required | Meets | The app works fully without push |
| Critical Alerts entitlement | Request | Apple grants it on request. The entitlement doc says: "To request this entitlement for your app, fill out the request form": https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/ (entitlement doc: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts). It is meant for health, home-security and public-safety alerts. Approval is not guaranteed and can take weeks. The app ships without it (Time Sensitive is used meanwhile) |
| Export compliance | Done | `ITSAppUsesNonExemptEncryption = false` (HTTPS only) |
| iPad | Avoided | iPhone-only build (`TARGETED_DEVICE_FAMILY = 1`), so iPad screenshots and an iPad layout review aren't needed |

## Draft App Review notes (paste into App Store Connect)

> SH✡MER is a personal-safety app for consent-based location sharing. It is not an emergency
> service; the app shows local emergency numbers (Israel: 100/101/102) and tells users to call them.
>
> Sign-in: phone number + SMS code. Test number: [FILL IN] code: [FILL IN].
>
> Background location: used only after the user turns on location sharing and chooses "Always". It
> keeps the user's live location visible to the people they added in "My Shomers" (each one approved
> by both sides), and lets an SOS and Shake-to-SOS work while the phone is locked. It can be paused at
> any time (ghost mode). Shown by the blue location indicator.
>
> Background audio: used only to play the SOS alarm sound and alerts from linked users. The app never
> plays silent audio.
>
> To test: My Shomers → invite → SOS button (a cancel countdown runs first; "Test" marks it as a test).
> Demo video attached.
