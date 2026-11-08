/* SH✡MER Cloud Functions (Blaze) — closed-app / background push via FCM.
   - sosFanout:   on a new /sos event, push to nearby SHOMERs and the people the user chose (even if
                  app closed); a later re-mark as a nature report sends one replacing update (same tag).
   - alarmFanout: on a /alarms/{id} item {toUid,title,body}, push to that user's device (used by
                  the mutual check-in miss + geofence arrival), then delete the queue item.
   Deploy:  firebase deploy --only functions
   Cost note: FCM is free; these only run on real events (SOS / missed check-in / arrival). */
const {onValueCreated, onValueWritten} = require('firebase-functions/v2/database');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const routing = require('./layer-routing');   // byte-identical copy of /layer-routing.js (tests check it)

admin.initializeApp();
setGlobalOptions({region: 'us-central1', maxInstances: 10});
const db = admin.database();
const LINK = 'https://www.shomer-app.co.il/shomer.html';

function distM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* SOS fan-out → nearby guardians (≤5 km), excluding the sender.
   sos/<uid> is ONE record per person (v261+), overwritten by every new SOS, so this fires on
   any write and pushes only when a NEW SOS event starts (new id/ts, or re-opened after resolve).
   Type / position / resolve updates on the same event do not re-push. */
exports.sosFanout = onValueWritten('/sos/{id}', async (event) => {
  const sos = event.data.after.val();
  const prev = event.data.before.val();
  if (!sos || sos.resolved || sos.lat == null) return;
  /* Nature layer (decision 2026-11-07): a new SOS is ALWAYS a person alert (it starts unclassified).
     If the owner then marks it animal / environmental hazard, the same people get ONE update with the
     SAME tag, which replaces the alert on their device: "nature report, not a person in distress". */
  const action = routing.fanoutAction(prev, sos);
  if (action === 'none') return;
  // Targets = every PAIRED guardian (always, any distance) + every NEARBY SHOMER (≤5 km).
  const [toksSnap, pairsSnap] = await Promise.all([
    db.ref('tokens').get(),
    db.ref('pairs/' + sos.uid).get()
  ]);
  const toks = toksSnap.val() || {};
  const paired = new Set(pairsSnap.val() ? Object.keys(pairsSnap.val()) : []);
  const tokenSet = new Set();
  Object.keys(toks).forEach((uid) => {
    if (uid === sos.uid) return;
    const t = toks[uid];
    if (!t || !t.token) return;
    const isPaired = paired.has(uid);
    const isNear = t.lat == null || distM(sos.lat, sos.lng, t.lat, t.lng) <= 5000;
    if (isPaired || isNear) tokenSet.add(t.token);
  });
  const tokens = [...tokenSet];
  if (!tokens.length) return;
  const type = sos.type && sos.type !== 'unknown' ? ' · ' + sos.type : '';
  const note = action === 'nature-update'
    ? {title: '🌿 SH✡MER — עדכון: דיווח טבע', body: 'זה דיווח טבע, לא מצוקת אדם · Nature report, not a person in distress'}
    : {title: '🚨 SH✡MER — SOS nearby', body: (sos.name || 'Someone') + ' needs help' + type};
  await admin.messaging().sendEachForMulticast({
    tokens: tokens.slice(0, 500),
    notification: note,
    data: {tag: 'sos-' + (sos.id || event.params.id), url: LINK},
    webpush: {fcmOptions: {link: LINK}, headers: {Urgency: action === 'nature-update' ? 'normal' : 'high', TTL: '600'}},
    android: {priority: 'high', notification: {tag: 'sos-' + (sos.id || event.params.id)}},
    apns: {headers: {'apns-priority': '10', 'apns-collapse-id': 'sos-' + (sos.id || event.params.id)}}
  });
});

/* Targeted alarm queue → one user's device (check-in miss, geofence arrival, guardian alerts). */
exports.alarmFanout = onValueCreated('/alarms/{id}', async (event) => {
  const a = event.data.val();
  try {
    if (a && a.toUid) {
      const token = (await db.ref('tokens/' + a.toUid + '/token').get()).val();
      if (token) {
        await admin.messaging().send({
          token,
          notification: {title: a.title || 'SH✡MER', body: a.body || ''},
          data: {tag: a.tag || 'shomer', url: LINK},
          webpush: {fcmOptions: {link: LINK}, headers: {Urgency: 'high'}}
        });
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
