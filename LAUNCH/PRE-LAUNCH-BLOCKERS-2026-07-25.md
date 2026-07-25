# SH✡MER — pre-launch blockers, 25.07.26

Shipped this session: **v202** (`b5fd009`) — verified live.
Everything below is blocked on a credential or console I do not hold. Each item is
finished: paste the command, done.

---

## BLOCKER 1 — seven RTDB paths have no published rule (SEVERITY: HIGH)

`database.rules.json` defines rules for 8 paths. The app reads/writes **15**.
RTDB does not cascade permissively, and the root has no `.read`/`.write`, so every
unruled path is **denied for every user — silently**.

Empirically confirmed: unauthenticated probes of `/pairs /registry /presence
/responders /sos /invites` all return **401** (good — nothing is world-readable),
but the seven paths below are denied for *authenticated* users too.

| Path | Feature it kills | Code ref |
|---|---|---|
| **`responders`** | **"N שומרים בדרך" + converging responder markers** | `fbRespondersListen()` L9115 |
| `tokens` | FCM push registration | `fbRegisterToken()` L9143 |
| `alarms` | queued push to a guardian | `fbQueueAlarm()` L9146 |
| `tombstones` | detecting a partner deleted their account | L3245, L10525 |
| `theft` | theft-evidence selfie + location | L4708 |
| `founders` | founder list | L9431 |
| `analytics` | install / DAU counters | L10799, L10806 |

`responders` is the one that matters tomorrow. It is the core coordination loop —
someone taps "אני בדרך", the person in danger sees help is coming. The listener's
error callback is empty (`/* denied until /responders rule published */`), so it
fails with **no error, no toast, no console line**. It just never works.

Note: the new hero image advertises "3 שומרים בדרך". Until this rule is published,
the site promises something the backend refuses.

**Fix — ready to run.** `database.rules.json.PROPOSED` is in the repo root. It is
purely additive: 7 paths added, 0 removed, 0 existing rules changed (verified by
diff). Every new rule is self-scoped (`auth.uid == $uid`) so nobody can write as
anyone else — in particular `responders/$sosId/$uid` only lets you add *yourself*
as a responder.

```bash
cd <repo>
mv database.rules.json.PROPOSED database.rules.json
firebase deploy --only database --project shomergency
```

Then confirm in the console: Realtime Database → Rules → the 7 new keys are present.

---

## BLOCKER 2 — Twilio Fraud Guard state is unverified (SEVERITY: HIGH, financial)

**Verified live by me today:** the OTP endpoint is healthy.

```
OPTIONS https://shomer-verify-8701-prod.twil.io/sendOTP  -> 204
  access-control-allow-origin: *   allow-methods: GET, POST, OPTIONS
POST   (invalid number)                                  -> 200
  {"success":false,"error":"Invalid parameter `To`"}   [reaches Twilio Verify]
```

So registration will work tomorrow, and the client already normalises the
double-encoded JSON this function returns (`if(typeof data==="string") JSON.parse`).

**What I cannot verify:** Fraud Guard on service `VAa6d1d6e530cbcd67bda268bb22dc0ace`.
The code comment claims it is back on — a comment is not console state. It was
disabled on 09.07.26 to release your blocked 97252 prefix. If it is still off, a
public APK plus an un-guarded Verify service is textbook SMS-pumping exposure, at
~$0.075/SMS in Israel.

`founderFastPath()` **is** correctly stubbed to `Promise.resolve(false)` — verified
in the live file. Revert-list item 2 is genuinely done.

**Unblock:** send me the Twilio auth token and I will confirm Fraud Guard, check
`riskCheck`/safelist state on `sendOTP`, and pull delivery logs. Or check yourself:
Console → Verify → Services → SHOMER → Fraud Guard = **Standard**.

Still open from the revert list: custom alpha sender ID (currently "SIGNAL").
Not launch-blocking — Israeli carriers drop unregistered alphanumeric senders, which
is exactly why the voice-call and WhatsApp fallbacks exist and are wired.

---

## BLOCKER 3 — returning users get their name back, not their circle (SEVERITY: MEDIUM)

Not blocking a small soft launch. **Blocking public launch.**

The v201 returning-user flow works: `ob-returning` button → phone → OTP →
`completeRegistration()` finds the registry entry, adopts the new uid, restores the
name, skips onboarding. Verified in the live file.

But guardians live at `pairs/$uid` with `.read: auth.uid == $uid`. A reinstall gets a
fresh anonymous uid, so:

- `pairs/<oldUid>` becomes **permanently unreadable** — even to its real owner.
- Every partner's back-reference `pairs/<partnerUid>/<oldUid>` still points at a dead uid.

Net: the user is welcomed back by name into an **empty circle of trust**. In a safety
product that is the worst possible silent failure — they believe they are covered.

This cannot be fixed client-side; the rules deny reading the old node, and I will not
mirror the roster into a phone-hash-keyed path (`inbox/$phoneHash` is readable by any
authed user — that would expose whole trust circles to anyone who can hash a phone
number).

**Correct fix: make the uid deterministic from the verified phone.** Then a reinstall
lands on the *same* uid and every existing node just works — no migration, no
back-reference rewrite, and it fixes users who have *already* reinstalled.

A Cloud Function mints a custom token after Twilio approves the code:

```js
// functions/index.js
exports.shomerToken = functions.https.onCall(async (data) => {
  const check = await twilio.verify.v2.services(VERIFY_SID)
    .verificationChecks.create({ to: data.phone, code: data.code });
  if (check.status !== 'approved') throw new functions.https.HttpsError('permission-denied');
  const uid = 'ph_' + crypto.createHash('sha256').update(data.phone).digest('hex').slice(0, 32);
  return { token: await admin.auth().createCustomToken(uid) };
});
```

Client swaps `signInAnonymously()` for `signInWithCustomToken(token)` on the verify path.

Needs `firebase deploy --only functions` + the Twilio auth token — both yours.
**This is a post-soft-launch change.** I would not re-plumb identity the night before.

---

## Recommendation

Ship the soft launch **after Blocker 1** (one command, ~2 minutes, purely additive).
Without it the responder loop — the thing the whole product is for — does not run.

Confirm Blocker 2 in the console before the APK goes to anyone outside your circle.

Blocker 3: schedule for the week after. Until it lands, tell early users not to
uninstall/reinstall.
