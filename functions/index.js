/* SH✡MER Cloud Functions (Blaze) — closed-app / background push via FCM.
   - sosFanout:   on a new /sos event, push to the sender's paired guardians (even if app closed).
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

function distM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/* SOS fan-out → the sender's PAIRED guardians only.
   sos/<uid> is ONE record per person (v261+), overwritten by every new SOS, so this fires on
   any write and pushes only when a NEW SOS event starts (new id/ts, or re-opened after resolve).
   Type / position / resolve updates on the same event do not re-push.
   v344: tokens/<uid> carry no location since v313 (privacy), so the old "nearby (<=5 km)" test
   matched EVERY device and would have pushed each SOS to every user. Paired guardians only. */
exports.sosFanout = onValueWritten('/sos/{id}', async (event) => {
  const sos = event.data.after.val();
  const prev = event.data.before.val();
  if (!sos || sos.resolved || !sos.uid) return;
  const isNew = !prev || prev.resolved || (sos.id || sos.ts) !== (prev.id || prev.ts);
  if (!isNew) return;
  const pairsSnap = await db.ref('pairs/' + sos.uid).get();
  const paired = pairsSnap.val() ? Object.keys(pairsSnap.val()) : [];
  const tokenSet = new Set();
  await Promise.all(paired.filter((uid) => uid !== sos.uid).map(async (uid) => {
    const t = (await db.ref('tokens/' + uid + '/token').get()).val();
    if (t) tokenSet.add(t);
  }));
  const tokens = [...tokenSet];
  if (!tokens.length) return;
  await admin.messaging().sendEachForMulticast({
    tokens: tokens.slice(0, 500),
    notification: {title: '🆘 SH✡MER SOS', body: 'SOS מהשומר/ת שלך - פתחו את SH✡MER עכשיו · Your SHOMER sent an SOS - open the app'},
    data: {tag: 'sos-' + (sos.id || event.params.id), url: LINK},
    webpush: {fcmOptions: {link: LINK}, headers: {Urgency: 'high', TTL: '600'}},
    android: {priority: 'high', ttl: 600000, notification: {channelId: 'shomer-sos', sound: 'default', defaultVibrateTimings: true}},
    apns: {headers: {'apns-priority': '10'}}
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
          // v438: honour a per-alarm destination. Every push used to carry the same fixed LINK,
          // so an "update needed" notice could only ever open the app's front door and leave the
          // reader to find the download themselves. An update alarm now carries the APK url.
          data: {tag: a.tag || 'shomer', url: a.url || LINK},
          webpush: {fcmOptions: {link: a.url || LINK}, headers: {Urgency: 'high'}},
          android: {priority: 'high', notification: {channelId: String(a.tag || '').indexOf('sos') === 0 ? 'shomer-sos' : 'shomer-alerts', sound: 'default'}},
          apns: {headers: {'apns-priority': '10'}}
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
