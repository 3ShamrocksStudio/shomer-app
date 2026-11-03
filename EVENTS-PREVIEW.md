# SH✡MER · Events preview (3 Nov 2026), staging only. Not public.

## Turning it on
- **Phone:** nothing to do. The preview loads automatically when the signed-in account is a preview account:
  - its uid is in the rules-protected `/founders` node (`.write:false`; it currently holds `pAXxay512NTeT2MQOgzjrNJEUXu2`), **or**
  - the device is verified with the founder phone (`isFounder()` + `phoneVerified`). This is the same check as the founder crest.
- `?evp=1` turns it back on and flies the map to event 1. `?evp=0` turns it off on that device.
- **Dashboard:** `dashboard.html?evp=1` adds the published-news layer and its banner. The dashboard gate is the URL only. That layer reads no user data and writes nothing.
- Everyone else never downloads `events-preview.js` or `events-preview-dash.js`, so they see no change.

## Files
| File | What it does |
|---|---|
| `events-preview.js` | App preview: pins, bottom card, confirm/dispute, confidence chip, 3-tap report |
| `events-seed.json` | Seeded events from published news. Dave can edit the wording here, and it refreshes on the next app open. |
| `events-preview-dash.js` | Dashboard preview layer (seed file only) |
| `tools/events_seed_daily.py` | Daily candidates from ynet / N12 / Haaretz RSS → human edit → `--approve` |
| `shomer.html` | `evpMaybeLoad()`, the gate. About 15 lines. |
| `dashboard.html` | One line that loads the layer only with `?evp=1` |

## Data, checked against the 28 Oct policy and privacy.html
- **Seed rows:** stored at `events/<key>` and owned by the viewer.
  - Under the existing rules only the owner can read them.
  - Fields: `seed:true`, `source:url`, the town-level point (2 dp ≈ 1 km), and the summary.
  - They are never written to `dashfeed` and never counted in any statistic or aggregate.
  - They are shown as "מתוך פרסום בתקשורת · <source>". They are never presented as user reports.
- **Preview user reports:** `events/<random e_ key>` holding `{by, ts, type, lat, lng (2 dp), note ≤80, pv:1, status}`.
  - No name field. Anonymous by default.
  - Not pushed to `dashfeed` while in preview (`EVP.FEED=false`).
- **Votes:** `events/<key>/confirms/<uid>` or `disputes/<uid>` = `{ts, w}`.
  - One per user, written atomically, so a vote is a confirm or a dispute, never both. Tapping again undoes it.
  - No location is stored. `w` (0.2–1) is the distance and time weight, computed on the phone.
  - Other users never see who voted.
- **Confidence:** `(prior + Σw confirms) / (prior + 1 + Σw confirms + Σw disputes)`.
  - The prior is 3 for a sourced news event and 1 for a user report.
  - Chip: ≥75% אמין, ≥50% סביר, below that שנוי במחלוקת. A user report with no votes shows טרם אומת.
- **Expiry:** on load, the owner deletes their preview reports older than 90 days. Seed rows refresh on every open.
- **Paid dashboard (planned):** `EVP.feedRow()` builds aggregate-only rows `{type, lat, lng (2 dp), ts, c, d, cf}` for user reports. It never includes ids or names, and never includes seed rows. It is off until Dave approves and the rules below are deployed.

## Needed before making it official (NOT deployed, NEEDS YOUR EYES)
Rules additions (`database.rules.json`):
```json
"events": { "$id": {
  "confirms": { "$uid": { ".write": "auth != null && $uid === auth.uid",
    ".validate": "newData.hasChildren(['ts']) && newData.child('ts').val() <= now + 60000 && (!newData.child('w').exists() || (newData.child('w').isNumber() && newData.child('w').val() > 0 && newData.child('w').val() <= 1)) && !newData.parent().parent().child('disputes').child($uid).exists()" } },
  "disputes": { "$uid": { ".write": "auth != null && $uid === auth.uid",
    ".validate": "newData.hasChildren(['ts']) && newData.child('ts').val() <= now + 60000 && (!newData.child('w').exists() || (newData.child('w').isNumber() && newData.child('w').val() > 0 && newData.child('w').val() <= 1)) && !newData.parent().parent().child('confirms').child($uid).exists()" } }
}},
"dashfeed": { "$id": {
  "c":  { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 999" },
  "d":  { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 999" },
  "cf": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" }
}}
```
- **Official version:** other users must be able to read an event without seeing its voters' uids.
  - Move votes to `evotes/<eid>/<uid>` with `.read:false`.
  - A Cloud Function writes the counts to `evagg/<eid>`.
  - It needs a deploy, so it needs Dave's OK.
- **Retention:** extend `functions/retention.js` to delete `events/*` older than 90 days.
- **Daily seeding as a Cloud Function:** a scheduled job runs `events_seed_daily.py` logic into a review queue. Nothing reaches users without a human edit.

## Draft privacy-policy lines (NEEDS YOUR EYES, not published)
- HE: "כשאת/ה מאשר/ת או מסמן/ת 'לא נכון' על אירוע, נשמרים רק סימון אחד לכל משתמש, זמן הסימון ומשקל מחושב (קרבה וזמן) - בלי מיקום. משתמשים אחרים לא רואים מי סימן. הסימון נמחק אחרי 90 יום."
- HE: "דיווח שנשלח נשמר עם סוג האירוע, שורת טקסט קצרה ומיקום מעוגל לאזור (כ-1 ק״מ), בלי שם. ללוח הרשות עוברים רק ספירות ומדד אמינות, בלי מזהה, שם או מיקום מדויק."
- HE: "חלק מהאירועים במפה לקוחים מפרסומים בתקשורת ומסומנים כך, עם קישור למקור. הם אינם דיווחי משתמשים ואינם נכללים בסטטיסטיקה."
- EN: "When you confirm or mark an event as not true, we keep one mark per user, its time and a computed weight (distance and time), with no location. Other users can't see who marked it. Marks are deleted after 90 days."
- EN: "A report keeps the event type, one short line and a location rounded to the area (about 1 km), with no name. Municipal dashboards get only counts and a confidence score, never an id, a name or a precise location."
- EN: "Some map events come from published news. They are labelled as such and link to the source. They are not user reports and are not counted in statistics."
