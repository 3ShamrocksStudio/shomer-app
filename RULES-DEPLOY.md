# SHOMER — Secure RTDB Rules Deployment (v64)

The live database `shomergency-default-rtdb` currently runs **temporary fully-public rules**
(`{".read":true,".write":true}`). This replaces them with **auth-scoped secure rules**.
The secure rules live in [`database.rules.json`](./database.rules.json).

## ⚠️ Order matters — do this in sequence

The secure rules require every client to be authenticated (anonymous auth). The **v64 client**
does that; older cached clients do not. So:

1. **v64 is already deployed** to GitHub Pages (this commit). Open the app and confirm it updated:
   open `…/shomer.html?diag` (or long-press the logo) and check:
   - `app` / `sw` = **v64**
   - `secure identity` = **ready (auth.uid)**
   - `auth state` = **ok**
   - `RTDB socket` = **connected**
   Reopen the app once or twice if it still shows v63 (auto-update fetches `version.json`).

2. **Confirm Anonymous sign-in is enabled** (it already tested as ENABLED on 2026-06-27):
   Firebase console → **Authentication → Sign-in method → Anonymous → Enabled**.

3. **Apply the secure rules.** Either:
   - **Console:** Firebase console → **Realtime Database → Rules** → paste the entire contents
     of `database.rules.json` → **Publish**. (The editor validates before publishing.)
   - **CLI** (if you have it): `firebase deploy --only database`

4. **Verify immediately** (see below). The "insecure rules" banner in the console clears within
   a minute of publishing non-public rules.

## Instant rollback

If anything misbehaves, paste this back into the console Rules editor and Publish — it restores
the old open behaviour instantly:

```json
{ "rules": { ".read": true, ".write": true } }
```

Then ping me and we diagnose. (Keep this snippet handy before you publish.)

## Post-apply verification (two sessions)

- Two phones / two browser profiles, both on v64.
- Phone A and Phone B both onboard → each gets a distinct `auth uid` (check `?diag`).
- Both show **nearby SHOMERs** when near each other (presence).
- Phone A triggers **SOS** → Phone B gets the alert (SOS broadcast+receive).
- Add Phone B as **My SHOMER** on Phone A via phone number → pairing links.
- Close & reopen each app → stays logged in, **same auth uid** (pairing survives).
- `?diag` shows zero `last error`, `secure identity: ready`.

## What the rules enforce (verified offline with 38 allow/deny assertions)

- **No global read/write.** Root denies by default.
- **presence/$uid** — read: any authed user; write: only `auth.uid === $uid`; coarse lat/lng only, no extra fields.
- **sos/$id** — read: any authed user; create/update/resolve: only the creator (`uid === auth.uid`).
- **registry/$phoneHash** — key MUST be a 64-char SHA-256 hash (raw numbers rejected); entry owned by `auth.uid`.
- **pairs/$uid** — readable only by the owner; mutual link writes allowed only when the leaf key is your own uid.
- **invites/$token** — inviter owns it; an accepter may only add their own `acceptedBy`.
- **tokens/$uid**, **tombstones/$uid**, **geo/positions/checkin** — owner-scoped.
- **alarms** — write-only by the sender (`fromUid === auth.uid`); not client-readable (Cloud Function reads via admin).
- Field-level type/size/range validation on every node; unknown fields rejected.

## App Check (optional, free, defense-in-depth — needs console steps)

Client scaffold is in place but **dormant**. To enable:
1. Firebase console → **App Check** → register this web app with **reCAPTCHA v3**, copy the **site key**.
2. In `shomer.html` config block, set `window.SHOMER_APPCHECK_KEY = '<site key>'`.
3. Add to the CSP `script-src`: `https://www.google.com https://www.gstatic.com` (gstatic already present)
   and `connect-src`: `https://content-firebaseappcheck.googleapis.com`.
4. In the console, set RTDB App Check enforcement to **Enforced** — only **after** confirming clients send tokens.

## Migration note

Pre-v64 data was keyed by device-id; v64 keys by `auth.uid`. Old presence/SOS expire on their own
(90 s / 25 min). `registry` re-publishes under the new uid automatically on launch. Any pairings made
on v63 (device-id) won't carry over — re-pair once on v64. Acceptable for pre-launch testing.

## Retention function `privacyRetention` (2026-10-31, NOT DEPLOYED, needs Dave's OK)

`functions/retention.js`, scheduled daily 03:17 Israel time. It **deletes** closed person alerts
whose close time (`resolvedTs`, else `ts`) is older than 90 days, plus their `dashown/<id>` owner
record, and moves the old creator id on AEDs from `aeds/<id>/by` into the private `dashown/aed_<id>`.
Tested on the local emulator only (`/home/claude/weekend/qa/fn/retention_test.js`, 6/6).

What deploying it needs:
1. The Firebase project `shomergency` on the **Blaze** plan (scheduled functions need Cloud Scheduler;
   the first 3 jobs per billing account are free, then about $0.10 per job per month).
2. `cd functions && npm install && cd ..`
3. `firebase deploy --only functions:privacyRetention --project shomergency` (only this function).
   Note: a plain `firebase deploy --only functions` (or `database,functions`) now deploys it too.
4. Afterwards remove the "automatic deletion starts with a server update" clause from privacy.html
   and the Nature privacy page.

Without the function, the rules already let any signed-in account delete a closed alert whose
`resolvedTs` is older than 90 days (and nobody can edit or reopen it), so a manual cleanup can be run
with an ordinary account once Dave OKs it. The app hides closed alerts older than 90 days.
