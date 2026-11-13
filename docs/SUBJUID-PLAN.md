# Person alerts: take `subjUid` out of the readable record (plan, not deployed)

Status: plan only, 9 Nov 2026. Nothing here is live. Checked against the data and privacy policy in CLAUDE.md (Dave, 28 Oct) and the published privacy page (`privacy.html`, section "התראת אדם נעדר / חטיפה").
NEEDS YOUR EYES before any build: the privacy-page wording in step 5 changes.

## The problem
`palerts/$id` is readable by every signed-in user (`".read": "auth != null"`). Each record carries `subjUid`, the account id of the missing person (`shomer.html` `paCreate`, `rec.subjUid = m.partnerUid`). The privacy page discloses it ("ומזהה החשבון של האדם"), so nothing is hidden from users, but an account id is more than the search needs: anyone signed in can collect the ids of people who were reported missing.

Today `subjUid` is used for two things only:
1. **Rules:** the subject may update or close the alert (`data.child('subjUid').val() === auth.uid` in the `palerts/$id` write rule).
2. **Client:** `paCanResolve(a)` shows the close button to the subject (`FB.uid === a.subjUid`) and to the subject's own Shomers (`isGuardianOf(a.subjUid)`).

## The change
1. **Private subject record.** On create, the reporter also writes `pasubj/$id = <subject uid>`, next to the existing `dashown/$id = <reporter uid>`.
   - Rules: `pasubj` has `".read": false`. `$id` is writable once, only by the `dashown` owner of the same id, only while `palerts/$id` does not exist yet, value a string of 28 chars at most.
2. **Rules switch.** In the `palerts/$id` write rule replace `data.child('subjUid').val() === auth.uid` with `root.child('pasubj').child($id).val() === auth.uid`. Add `"subjUid": {".validate": false}` so new records can no longer carry it.
3. **Matching tag instead of the id.** The public record gets `subjTag = SHA-256(subjectUid + ':' + alertId)`, hex, first 32 chars.
   - The subject's app computes the tag from its own uid and the alert id. Each of the subject's Shomers computes it from the `partnerUid` values it already holds. Everyone else sees a value that differs per alert and cannot be linked across alerts or back to an account.
   - `paCanResolve` compares tags instead of uids. Close still goes through the rules in step 2, so a guessed tag gives no write access.
4. **Expiry.** `pasubj/$id` is deleted together with `palerts/$id` and `dashown/$id`: the existing 90-day rule after `resolvedTs`, and the `privacyRetention` function (branch `dashboard-lock`, not deployed) gets `pasubj` added to its list.
5. **Privacy page.** Replace "ומזהה החשבון של האדם (כדי שיוכל לסגור את ההתראה בעצמו)" with: "מזהה החשבון של האדם נשמר ברשומה נפרדת שאף משתמש לא יכול לקרוא, רק כדי שהוא והשומרים שלו יוכלו לסגור את ההתראה". Same change in the other language sections of the page.

## Order (each step safe on its own)
1. Client writes `pasubj` and `subjTag`, and still writes `subjUid`. Old and new apps keep working.
2. Deploy rules (steps 1 and 2) together with the "yes Firebase" rules batch that is already waiting on Dave.
3. Client stops writing `subjUid`. After 90 days no record holds it. A one-off clean-up can strip it from older records earlier.
4. Privacy page text (step 5) goes live with step 3.

## Checks before it ships
- Rules emulator: the subject closes its own alert; a Shomer of the subject closes it; a stranger who knows the tag cannot; nobody can read `pasubj`.
- An abduction alert must never fail to send. The client keeps today's fallback path (write without the private record if the rules refuse) until step 2 is live.
- Policy check: the new field `subjTag` is a per-alert hash. It names nobody and cannot be linked across alerts, so it fits rule 1 of the data policy. No new reader of user data is added.
