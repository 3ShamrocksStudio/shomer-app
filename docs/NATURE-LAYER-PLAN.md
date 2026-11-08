# SH✡MER Nature as a layer of SH✡MER: implementation plan

Source decision: `SHOMER-AND-NATURE-DECISION-2026-11-07.md` (Hebrew, approved by Dave 7 Nov 2026).
Branch: `nature-layer` (shomer-app, and shomer-nature). **Never merged to `main`: main is LIVE at www.shomer-app.co.il.**
Status: staging preview only. Nothing here is live until Dave says so.

## 1. What the decision requires (short)
- One app for free users. Nature is a layer inside SH✡MER, not a second store app.
- One SOS button. It sends without asking for a type. An unclassified SOS = a person in distress, SH✡MER layer only.
- After sending, an optional type. Animal / environmental hazard re-routes to Nature, and people already alerted see "nature report, not a person in distress".
- A separate, quieter "Nature report". Nature layer only, except a fire near a settlement, which also goes to SH✡MER.
- Routing: lives/community in danger → SH✡MER. Animals/environment harmed → Nature. Both → both layers, one alert. Uncertain → SH✡MER. Never Nature from location alone.
- One dashboard, two layers (Person, Nature), each showing only what that role needs, no names or identifying details. An org turns on one or both in one account.
- Three packages: Person only, Nature only, combined bundle. Price by org size and type. No double charge.
- Branding outside: two names, two visual languages. Inside the app: one brand, no identity switch in an emergency.

## 2. Inventory (planning pass, 8 Nov 2026)

| Area | Where | Finding | Change on this branch |
|---|---|---|---|
| SOS flow | `shomer.html` `beginSOS` → countdown → broadcast; `classifySOS`, `SOS_TYPES`, `buildSosTypeBar` | Type is already optional and after send (SOS-TYPE-SOLUTION.md, reused). A simulated "nearby responder" auto-typed an unclassified SOS as medical after 14 s. | Nature types added to the post-send bar (animal, env. hazard, forest fire). `classifySOS` routes through `layer-routing.js` and writes `layer` to `sos/<uid>` and the dashboard row. Simulated auto-type removed: an unchosen SOS stays an unclassified person SOS. |
| Receiver side | `sosWatchPartners` record loop, `showIncomingSOS` | Reads `sos/<uid>`. | `sosApplyLayerNotice`: the open alert card turns into "nature report, not a person in distress" (green, the short receiver beep is stopped, never the receiver's own SOS siren). |
| Report flows | `openReport`, `EVT.TYPES`, `evtCreate`, `dashFeedPush` | Person reports only. | `EVT.NATURE` + `openNatureReport()` (quiet link at the bottom of the report sheet). Fire asks "near a settlement? yes / no / not sure". `evtCreate(type, note, {origin:'nature', nearSettlement})` stores `origin`, `layer`, `near`. Dashboard row gets `layer` for nature/both only. |
| Existing nature code | `nature/nature.html` (the separate SH✡MER Nature app, 15k lines), shomer-nature repo | Separate PWA + Android package `il.co.shomernature`. | Not merged in: the in-app layer reuses its type set. App left untouched; its fate is a NEEDS YOUR EYES item (§8). |
| Native | `native/` Capacitor, `appId il.co.shomerapp`, `server.url` = live `shomer.html` | The native app loads the live page, so it gets the layer when the web page goes live. Intent filters: only the `/i` invite App Link, nothing per-product. `il.co.shomerapp` and `il.co.shomernature` both return 404 on the public Play store (8 Nov). | No native change needed. `layer-routing.js` must be deployed next to `shomer.html` (it is a `<script src>`; missing file = fail-safe to SH✡MER). |
| Data model | RTDB `sos/<uid>` (extra fields allowed), `events/<id>` (extra fields allowed), `dashfeed/<id>` (`$other: false`) | `dashfeed` rejects unknown fields. | `database.rules.json`: `dashfeed/$id/layer` ∈ {shomer, nature, both}. **Not deployed.** |
| Push fan-out | `functions/index.js` `sosFanout` | Pushes only on a new SOS. | Uses `routing.fanoutAction`: new SOS = one alert; re-marked nature = one update with the same tag / collapse id (replaces the alert on the device); back to a person type = SOS again. **Not deployed.** |
| Dashboard | `dashboard.html` | One board, no layers. Demo row showed a person's name ("דנה ל."). | Layer toggles (👤 אדם / 🌿 טבע) in the top bar, entitlement per account (`user_metadata.layers`, default person only), per-layer row fields, "אדם + טבע" tag on shared events, 📦 packages panel. Demo name removed. |
| Landing | `index.html` Nature band, `nature.html`, `nature/index.html` | "Coming soon", "Urban SH✡MER", waitlist, "Try the beta" link to the separate app, "guardian network" in EN. | One app, one store link (`SHOMER.apk`, same as the home page). Nature keeps its green visual language and tagline. "Try the beta" removed. Copy made honest about where reports go. Footer link to packages. |
| Pricing | none on the site; tiers with prices on the shomer-nature landing; `outputs/SHOMER-Pilot-PRICING.md` | Old 4-tier nature prices conflict with the decision. | New `pricing.html` (HE/EN/AR): three packages, prices "TBD · NEEDS YOUR EYES". Dashboard packages panel. No payment changes. |
| Legal | `privacy.html`, `terms.html` | No layers. | New "two layers" sections (HE + EN). |
| Sitemap | `sitemap.xml` | | `pricing.html` added, dates bumped. |
| Studio site / marketing | `3shamrocksstudio.github.io/work/shomer.html` ("SH✡MER Nature · Coming soon"), `outputs/channels/CHANNELS.md` (Nature not mentioned until tested), `outputs/shomer-sales`, `outputs/li`, `ig-queue` | No "separate Nature app" CTA found in drafts; studio line should become "nature reporting inside SH✡MER". | **Not edited** (live site / approved copies). Listed for Dave in §8. |
| Store listings | Play/App Store copy | SH✡MER listing does not mention nature reporting; no Nature listing should be submitted. | Listed for Dave in §8. |
| Tnufa (תנופה) | `/mnt/user-data/outputs/tnufa/`, `outputs/תנופה-SHOMER-*.docx/.xlsx` | | **Untouched.** |

## 3. Routing truth table (`layer-routing.js`, tests in `tests/layer-routing.test.js`)

| # | Origin | Type | Near settlement | Layers | Notes |
|---|---|---|---|---|---|
| 1-2 | SOS | none / unknown | – | SH✡MER | unclassified = person in distress |
| 3-8 | SOS | person type (violence, medical, harassment, interception debris, sinkhole, person bitten…) | – | SH✡MER | |
| 9-10 | SOS | animal, env. hazard | – | Nature | re-route; recipients see "nature report" |
| 11-12 | SOS | forest fire, rabid animal | – | both | one alert |
| 13-17 | Nature | injured animal, abuse, dumping, pollution, reserve hazard | – | Nature | |
| 18 | Nature | forest fire | yes | both | the one exception |
| 19 | Nature | forest fire | no | Nature | |
| 20-21 | Nature | forest fire | not sure / missing | both | uncertain → SH✡MER |
| 22 | Nature | rabid animal | – | Nature | the report sheet tells people in danger to press SOS |
| 23-25 | Nature | unknown / none / person type | – | SH✡MER | fail-safe |
| 26-30 | other origin, odd casing, non-string | – | – | as SOS | fail-safe |
| 31-34 | garbage input; location only (in a reserve); unclassified never Nature; Nature never SH✡MER except fire | | | | |
| 35 | dashboard rows: explicit `layer` wins; old rows (no layer) stay SH✡MER | | | | |
| 36 | push: new SOS → `alert`; → nature → `nature-update` (same tag); both → no 2nd alert; back → `person-update` | | | | |
| 37 | `functions/layer-routing.js` is byte-identical to `/layer-routing.js` | | | | |

Run: `node --test tests/layer-routing.test.js` → 37/37 pass.

## 4. Data model (added fields only)
- `sos/<uid>`: `layer: 'shomer'|'nature'|'both'` (set at start = `shomer`, updated on classify).
- `events/<id>` (Nature report): `origin: 'nature'`, `layer`, `near: true|false` (omitted when "not sure"). Readable only by the reporter (existing rule).
- `dashfeed/<id>`: `layer` only when `nature` or `both`. Rows without it are SH✡MER. Still no account id, no name, ~1 km location.
- Org entitlement: Supabase `user_metadata.layers` = `['shomer']`, `['nature']` or both. Missing = person only (today's accounts).

## 5. Privacy check (CLAUDE.md policy, 2026-10-28)
No new personal field reaches any public or org view. Dashboard nature rows: type, layer, time, ~1 km point, status. The `near` answer stays in the reporter-only `events` record. Demo data no longer shows a name. Privacy page updated before shipping.

## 6. Tests and QA (done on the preview)
- Unit: 37/37 routing tests.
- Playwright, Hebrew, 390 px and 1440 px: app (SOS → type bar with nature options → re-route to Nature → receiver card notice → back to person; report sheet → Nature report → fire question), dashboard (both / nature-only / person-only counts, packages panel), landing, Nature (both copies), pricing, privacy, terms. EN and AR checked for nature, nature/, pricing.
- No sideways scroll on any page. No request to a production host, no network write (guard log + request log).
- Console: 0 errors on landing, legal, pricing, dashboard. The app shows the same 1-3 intermittent 404s (`'+a.subjPhoto+'` etc.) that the current live `main` shows too: a browser preload quirk, not caused by this branch.
- Screenshots: `/tmp/claude-0/pw/nature-layer-*.png`.

## 7. Rollout (staging → Dave's approval → live)
1. Dave reviews the preview: https://3shamrocksstudio.github.io/shomer-nature-layer-preview/ (noindex, banner "PREVIEW, NOT LIVE").
2. Dave answers the NEEDS YOUR EYES items (§8), especially prices.
3. Deploy RTDB rules first (`dashfeed/layer`), because the live rules reject the new field: `firebase deploy --only database` (see RULES-DEPLOY.md).
4. Deploy Cloud Functions (`sosFanout` with the replacing nature update): `firebase deploy --only functions:sosFanout`.
5. Merge `nature-layer` → `main` (deploys www.shomer-app.co.il: `shomer.html`, `layer-routing.js`, `dashboard.html`, landing, `pricing.html`, legal, sitemap). Bump the app version per the usual release step.
6. Set `user_metadata.layers` for each paying org.
7. After live: studio site line, store listing copy, IG/LinkedIn drafts (§8), and the timeline dashboard.
Rollback: revert the merge commit; rules and function are backward compatible (rows without `layer` = SH✡MER).

## 8. NEEDS YOUR EYES
1. **Prices** for Person / Nature / combined (by org size and type). All show "TBD". The old shomer-nature tiers (₪249 / ₪149 / ₪2,500) and `SHOMER-Pilot-PRICING.md` conflict with the three-package model.
2. **Wording**: app strings (SOS nature options, receiver "זה דיווח טבע, לא מצוקת אדם", Nature report sheet), landing copy, privacy/terms sections, packages page.
3. **Fire "not sure"** is treated as near a settlement (both layers), per "when uncertain, SH✡MER".
4. **The 10-second cancel countdown** before an SOS broadcasts is unchanged. The decision says "sends immediately"; it does not ask for a type, but it does wait 10 s.
5. **The separate SH✡MER Nature app** (`nature/nature.html`, shomer-nature repo, `il.co.shomernature`): retire it, or keep it only as an internal test build. It must not go to the store.
6. **Store listing**: add "nature report" to the SH✡MER listing text; do not submit a Nature listing.
7. **Studio site** `work/shomer.html`: change "SH✡MER Nature · Coming soon" to "nature reporting inside SH✡MER".
8. **Nature report photo**: the app report has no photo yet (the dashboard "documentation" field shows only what exists).
