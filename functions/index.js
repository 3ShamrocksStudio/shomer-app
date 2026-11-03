/* SH✡MER Cloud Functions (Blaze) — closed-app / background push via FCM.
   - sosFanout:   on a new SOS, push the alarm to the sender's SHOMERs + nearby devices (app closed too).
   - alarmFanout: on a /alarms/{id} item {toUid,title,body}, push to that user's device (used by
                  the mutual check-in miss + geofence arrival), then delete the queue item.
   Deploy:  firebase deploy --only functions
   Cost note: FCM is free; these only run on real events (SOS / missed check-in / arrival). */
const {onValueCreated, onValueWritten} = require('firebase-functions/v2/database');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({region: 'us-central1', maxInstances: 10});
const db = admin.database();
const LINK = 'https://www.shomer-app.co.il/shomer.html';

/* SOS fan-out (see native/PUSH-ALARM-PLAN.md). sos/<uid> is ONE record per person, overwritten
   by every new SOS. A NEW SOS (new id/ts, or re-opened after resolve) pushes the alarm to the
   sender's paired SHOMERs (any distance) and nearby devices (<=5 km, fresh ~1 km point only).
   Ending the SOS sends a silent "clear" so the alarm stops on Android phones.
   Type / position updates on the same event do not re-push. Logic: ./recipients.js. */
const R = require('./recipients');
async function sendAll(msgs) {
  const out = {sent: 0, failed: 0, dead: []};
  if (process.env.FUNCTIONS_EMULATOR === 'true') {   // tests: never contact FCM from the emulator
    msgs.forEach(m => console.log('EMULATOR-DRY-RUN', JSON.stringify({role: m.r.role, plat: m.r.plat, msg: m.msg})));
    return out;
  }
  for (let i = 0; i < msgs.length; i += 500) {
    const chunk = msgs.slice(i, i + 500);
    const res = await admin.messaging().sendEach(chunk.map(m => m.msg));
    res.responses.forEach((r, j) => {
      if (r.success) { out.sent++; return; }
      out.failed++;
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') out.dead.push(chunk[j].r);
    });
  }
  return out;
}
exports.sosFanout = onValueWritten('/sos/{id}', async (event) => {
  const sos = event.data.after.val();
  const prev = event.data.before.val();
  const starting = R.isNewSos(prev, sos);
  const ending = R.isResolved(prev, sos);
  if (!starting && !ending) return;
  const rec = starting ? sos : prev;   // ending: same people as the alarm went to
  if (!rec || !rec.uid || rec.uid !== event.params.id) return;   // sos/<uid> must be the sender's own record
  if (starting) {
    // Abuse guard: one SOS push per sender per 2 min (pushlog/<uid> is server-only).
    const logRef = db.ref('pushlog/' + rec.uid);
    const tx = await logRef.transaction((last) => (R.cooldownOk(last) ? Date.now() : undefined));
    if (!tx.committed) { console.log('sosFanout start skipped: cooldown'); return; }
  }
  const [toksSnap, pairsSnap] = await Promise.all([db.ref('tokens').get(), db.ref('pairs/' + rec.uid).get()]);
  const pairs = pairsSnap.val() || {};
  // Paired = linked both ways: read each partner's own record for the sender (also holds the
  // name that partner saved for them - used only in that partner's push).
  const back = {};
  await Promise.all(Object.keys(pairs).slice(0, 200).map(async (uid) => {
    try { back[uid] = (await db.ref('pairs/' + uid + '/' + rec.uid).get()).val(); } catch (e) { back[uid] = null; }
  }));
  const recips = R.resolveRecipients({sos: rec, tokens: toksSnap.val() || {}, pairs, back});
  if (!recips.length) { console.log('sosFanout', starting ? 'start' : 'end', 'no recipients'); return; }
  let msgs;
  if (starting) {
    // The name each paired recipient saved for the sender - never sent to nearby people.
    msgs = recips.map(r => ({r, msg: R.buildMessage(rec, r, r.role === 'paired' && back[r.uid] ? back[r.uid].name : null)}));
  } else {
    msgs = recips.map(r => ({r, msg: R.buildClear(rec, r)})).filter(m => m.msg);
  }
  const out = await sendAll(msgs);
  // Tokens FCM says are gone (app uninstalled / token rotated): remove them.
  const rm = {};
  out.dead.forEach((r) => { rm['tokens/' + r.uid + (r.dev ? '/' + r.dev : '')] = null; });
  if (Object.keys(rm).length) { try { await db.ref().update(rm); } catch (e) {} }
  console.log('sosFanout', starting ? 'start' : 'end', JSON.stringify({recipients: recips.length,
    paired: recips.filter(r => r.role === 'paired').length, sent: out.sent, failed: out.failed, pruned: out.dead.length}));
});

/* Targeted alarm queue → one user's device (check-in miss, geofence arrival, guardian alerts). */
exports.alarmFanout = onValueCreated('/alarms/{id}', async (event) => {
  const a = event.data.val();
  try {
    // SOS itself is pushed ONCE, by sosFanout (alarm + full-screen). The app also queues a paired
    // "SOS from <name>" item here (fbAlertPairedSos) - skip it so nobody gets two pushes per SOS.
    if (a && a.toUid && a.tag !== 'sos') {
      const devs = R.devicesOf(a.toUid, (await db.ref('tokens/' + a.toUid).get()).val());
      for (const {token} of devs) {
        await admin.messaging().send({
          token,
          notification: {title: a.title || 'SH✡MER', body: a.body || ''},
          data: {tag: a.tag || 'shomer', url: LINK},
          webpush: {fcmOptions: {link: LINK}, headers: {Urgency: 'high'}}
        }).catch((e) => console.log('alarmFanout send failed', e && e.code));
      }
    }
  } finally {
    await event.data.ref.remove(); // one-shot: clean up the queue item
  }
});

/* Privacy retention, once a day (NOT DEPLOYED). Deletes closed person alerts older than 90 days and
   moves old AED creator ids into the private owner records. Logic: ./retention.js.
   Deploy only this one:  firebase deploy --only functions:privacyRetention --project shomergency */
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {runRetention} = require('./retention');
exports.privacyRetention = onSchedule({schedule: 'every day 03:17', timeZone: 'Asia/Jerusalem'}, async () => {
  const r = await runRetention(db);
  console.log('privacyRetention', JSON.stringify(r));
});
