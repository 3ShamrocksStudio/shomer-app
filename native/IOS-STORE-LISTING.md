# SH✡MER App Store listing (draft)

Branch `ios-native`, 2026-11-03. Every limit below was counted by script.
Rules followed: SH✡MER is always written with ✡; the people a user links with are "My Shomers" /
"השומרים שלי"; no numbers or claims that the app can't back up.
**NEEDS YOUR EYES:** all copy below before it goes into App Store Connect.

Localizations: **Hebrew (primary)** and **English (U.S.)**. Both are shown and searchable in the Israeli store.

## App name (max 30)

| Field | Text | Length |
|---|---|---|
| Name (same in both localizations) | `SH✡MER — SHOMER app` | 19/30 |
| Fallback name | `SHOMER app — שומר` | 17/30 |

"SHOMER app" in the name is the strongest search signal, and it makes SH✡MER findable as "SHOMER app".
Risk: ✡ (U+2721) is also an emoji character, and App Store Connect sometimes rejects emoji in app
names. If the field refuses it, use the fallback name; SH✡MER stays in the subtitle-free description,
screenshots and icon. The home-screen name stays "SHOMER" (`CFBundleDisplayName`).

## Subtitle (max 30)

| Localization | Text | Length |
|---|---|---|
| Hebrew | `ביטחון אישי עם השומרים שלי` | 26/30 |
| English | `Personal safety, My Shomers` | 27/30 |

## Keywords (max 100 each, comma-separated, words in the name are already indexed)

| Localization | Keywords | Length |
|---|---|---|
| Hebrew | `שומר,השומר,שומר אפליקציה,ביטחון,בטיחות,מצוקה,לחצן מצוקה,SOS,שיתוף מיקום,קהילה,משפחה,התראה` | 89/100 |
| English | `shomerapp,hashomer,sos,safety,personal safety,panic button,location sharing,family,community,alarm` | 98/100 |

No competitor or trademark names (Guideline 2.3.7).

## Promotional text (max 170, editable without a new build)

- **HE** (80): ניעור ל-SOS, אזעקה שנשמעת גם במצב שקט, ומיקום חי רק לאנשים שבחרת ב"השומרים שלי".
- **EN** (112): Shake-to-SOS, an alarm that plays even on silent, and live location only for the people you chose in My Shomers.

## Description: Hebrew

SH✡MER — אזרחים למען אזרחים.

כשמרגישים לא בטוח, לחיצה אחת שולחת SOS עם המיקום שלך לאנשים שבחרת ב"השומרים שלי". בלי מוקד ובלי המתנה: הם רואים איפה את/ה ויכולים לפעול.

מה יש ב-SH✡MER
• השומרים שלי: מזמינים בני משפחה וחברים, ושני הצדדים מאשרים את החיבור.
• SOS עם ספירה לאחור: כמה שניות לביטול לפני שמשהו נשלח, כדי שלחיצה בטעות לא תשאיר עקבות.
• ניעור ל-SOS: ניעור חזק מתחיל SOS, גם כשהטלפון בכיס.
• אזעקה שנשמעת גם כשמתג השקט מופעל.
• שיתוף מיקום חי — רק כשבחרת. אפשר להשהות בכל רגע (מצב רפאים).
• התראות מהשומרים שלך מגיעות גם כשהטלפון נעול.
• צ'ק-אין: שיחה מדומה שבודקת שהכול בסדר. אם לא עונים, נשלחת התראה.
• מפה קהילתית של אירועי ביטחון ורפואה בסביבתך, דפיברילטורים שהקהילה הוסיפה, והתראות על אדם נעדר.
• מדריך עזרה ראשונה: החייאה, חנק, דימום ועוד.
• עברית, ערבית ואנגלית.

פרטיות
המיקום שלך משותף רק עם מי שאישרת, ורק כשהפעלת שיתוף. לא מוכרים מידע, אין פרסומות ואין כלי מעקב. אפשר למחוק את החשבון מתוך האפליקציה.

חשוב
SH✡MER אינו שירות חירום ואינו מחליף משטרה, מד"א או כבאות. בחירום חייגו 100 / 101 / 102.

## Description: English

SH✡MER — citizens for citizens.

When you feel unsafe, one tap sends an SOS with your location to the people you chose in My Shomers. No call center, no waiting: they see where you are and can act.

What SH✡MER does
• My Shomers: invite family and friends; both sides approve the link.
• SOS with a countdown: a few seconds to cancel before anything is sent, so a mistaken press leaves no trace.
• Shake-to-SOS: shaking hard starts an SOS, even with the phone in your pocket.
• An alarm that plays even with the Silent switch on.
• Live location sharing, only when you choose. Pause it at any time (ghost mode).
• Alerts from your Shomers reach you even when your phone is locked.
• Check-in: a simulated call that checks you're OK. If you don't answer, an alert goes out.
• A community map of nearby security and medical events, defibrillators added by the community, and missing-person alerts.
• First-aid guide: CPR, choking, bleeding and more.
• Hebrew, Arabic and English.

Privacy
Your location is shared only with people you approved, and only when sharing is on. Nothing is sold, there are no ads and no tracking tools. You can delete your account inside the app.

Important
SH✡MER is not an emergency service and does not replace police, ambulance or fire services. In an emergency, call your local emergency number (in Israel 100 / 101 / 102).

## Screenshots

Captured from the **real iOS build**: Xcode Simulator `xcrun simctl io booted screenshot`, or the TestFlight build on Dave's iPhone.
The Android `app-v200-*.jpg` files can't be used, because the App Store needs iPhone screens.
Use the store-review test account. On every screen, show only the test account's own data and
public events. Nothing staged or invented, and no other user's name or exact location.

| Size | Pixels (portrait) | Simulator | App Store Connect slot |
|---|---|---|---|
| 6.7" | 1290 × 2796 | iPhone 15 Pro Max / 15 Plus | 6.9" display (6.7" is accepted there) |
| 6.5" | 1242 × 2688 | iPhone 11 Pro Max / XS Max | 6.5" display |

Six screens, both sizes, Hebrew set + English set (24 images):

| # | Screen | Shows |
|---|---|---|
| 1 | Home map | Live map with nearby events and the SOS button |
| 2 | SOS countdown | The cancellable countdown, practice/test mode |
| 3 | השומרים שלי / My Shomers | Linked people and the invite flow |
| 4 | Shake-to-SOS + alarm settings | Shake switch on, alarm choice |
| 5 | Check-in call | The simulated check-in call screen |
| 6 | First-aid guide | One guide card (e.g. CPR) |

Optional: a 15–30 s app preview video of the SOS countdown and cancel (reuse the review demo video).

## Category and age rating

- **Primary category: Lifestyle. Secondary: Navigation.** Medical is avoided on purpose, because it brings extra review of medical claims (Guideline 1.4.1). Play uses Medical/Health; the stores don't have to match.
- **Age rating:** answer Apple's questionnaire honestly. Relevant answers: user-generated content (reports, photos, alerts): **yes**; location sharing with other users: **yes**; medical/treatment information (first-aid guide): **infrequent/mild**; violence, sexual content, gambling, ads: **none**. Apple computes the rating from these answers. The in-app terms say SH✡MER is "not directed to minors under 16 without parent/SHOMER consent", which is consistent with any rating Apple gives. No manual override is planned.

## Other fields

| Field | Value |
|---|---|
| Support URL | https://www.shomer-app.co.il |
| Marketing URL | https://www.shomer-app.co.il |
| Privacy Policy URL | https://www.shomer-app.co.il/privacy.html (update first, see readiness doc §2) |
| Contact | support@shomer-app.co.il |
| Copyright | © 2026 3Shamrocks Studio |
| Price | Free |
