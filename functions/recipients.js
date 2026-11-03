/* SH✡MER SOS push: who gets the alarm, and what each recipient's message carries.
   Pure functions (no Firebase calls) so they can be unit-tested. Used by sosFanout in index.js.

   Recipients (same rules the app already uses):
   - PAIRED: every account the sender linked with (pairs/<sender>/<uid>), at any distance. These
     are exactly the people the database rules let read sos/<sender>.
   - NEARBY: any other account whose device reported a coarse (~1 km) point in the last 2 days,
     within 5 km of the SOS. A device with no point, or an old point, is NOT treated as nearby.

   Privacy (CLAUDE.md data policy, 28 Oct 2026):
   - No message carries the precise SOS location. Paired recipients read the location from
     sos/<sender> after opening the app (the database rules allow only them). Nearby recipients
     get only an area point rounded to ~1 km and a rounded distance.
   - Nearby recipients never get the sender's account id or name. */

const RADIUS_M = 5000;
const LOC_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;   // device points older than this are ignored
const TTL_S = 900;                                 // undelivered after 15 min = too late to help
const NEARBY_ALARM = true;                          // false = nearby strangers get a heads-up but no looping alarm

function distM(aLat, aLng, bLat, bLng) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const isNum = v => typeof v === 'number' && isFinite(v);
const coarse = v => Math.round(v * 100) / 100;     // ~1 km

/* tokens/<uid> is either the old single-device shape {token, ts, lat, lng} or the new
   per-device shape {<devKey>: {token, ts, plat, lang, lat, lng}}. Returns a flat list. */
function devicesOf(uid, rec) {
  if (!rec || typeof rec !== 'object') return [];
  if (typeof rec.token === 'string') return [Object.assign({uid, dev: null}, rec, {plat: rec.plat || 'web'})];
  return Object.keys(rec).filter(k => rec[k] && typeof rec[k] === 'object' && typeof rec[k].token === 'string')
    .map(k => Object.assign({uid, dev: k}, rec[k], {plat: rec[k].plat || 'web'}));
}

/** @returns [{uid, dev, token, plat, lang, role:'paired'|'nearby', distM?}] - one entry per token. */
function resolveRecipients({sos, tokens, pairs, now = Date.now(), radiusM = RADIUS_M}) {
  if (!isOpen(sos) || !isNum(sos.lat) || !isNum(sos.lng) || !sos.uid) return [];
  const paired = new Set(Object.keys(pairs || {}));
  const byToken = new Map();
  Object.keys(tokens || {}).forEach((uid) => {
    if (uid === sos.uid) return;
    devicesOf(uid, tokens[uid]).forEach((d) => {
      let role = null, dm;
      if (paired.has(uid)) role = 'paired';
      else if (isNum(d.lat) && isNum(d.lng) && isNum(d.ts) && now - d.ts <= LOC_MAX_AGE_MS) {
        dm = distM(sos.lat, sos.lng, d.lat, d.lng);
        if (dm <= radiusM) role = 'nearby';
      }
      if (!role) return;
      const prev = byToken.get(d.token);
      if (prev && prev.role === 'paired') return;  // paired wins over nearby for the same token
      byToken.set(d.token, {uid, dev: d.dev, token: d.token, plat: d.plat, lang: d.lang || 'he', role, distM: dm});
    });
  });
  return [...byToken.values()];
}

const TXT = {
  he: {pT: '🚨 SOS - {n} צריך/ה עזרה', pB: 'פתח/י את SH✡MER עכשיו', nT: '🚨 SOS בקרבתך', nB: 'מישהו כ-{d} ממך צריך עזרה. פתח/י את SH✡MER', who: 'שומר/ת שלך'},
  en: {pT: '🚨 SOS - {n} needs help', pB: 'Open SH✡MER now', nT: '🚨 SOS near you', nB: 'Someone about {d} away needs help. Open SH✡MER', who: 'Your SHOMER'},
  ar: {pT: '🚨 SOS - {n} بحاجة إلى مساعدة', pB: 'افتح SH✡MER الآن', nT: '🚨 SOS بالقرب منك', nB: 'شخص على بعد {d} تقريباً بحاجة إلى مساعدة. افتح SH✡MER', who: 'حارسك'}
};
function kmText(m, lang) {
  const km = Math.max(1, Math.round(m / 1000));
  return lang === 'he' ? km + ' ק"מ' : lang === 'ar' ? km + ' كم' : km + ' km';
}

/** The FCM message for one recipient. `nameFor` = the name THIS recipient saved for the sender
 *  (pairs/<recipient>/<sender>/name), only used for paired recipients. */
function buildMessage(sos, r, nameFor) {
  const t = TXT[r.lang] || TXT.he;
  const sid = String(sos.id || sos.ts || '');
  const type = typeof sos.type === 'string' ? sos.type.slice(0, 16) : 'unknown';
  let title, body;
  const data = {kind: 'sos', role: r.role, sid, type, ts: String(sos.ts || ''),
    alarm: (r.role === 'paired' || NEARBY_ALARM) ? '1' : '0'};
  if (r.role === 'paired') {
    const n = (typeof nameFor === 'string' && nameFor.trim()) ? nameFor.trim().slice(0, 40) : t.who;
    title = t.pT.replace('{n}', n); body = t.pB;
    data.from = sos.uid;                     // they already know it (pairing) - lets the app open the event
  } else {
    title = t.nT; body = t.nB.replace('{d}', kmText(r.distM || 0, r.lang));
    data.alat = String(coarse(sos.lat)); data.alng = String(coarse(sos.lng));   // ~1 km area only
  }
  data.title = title; data.body = body;
  const LINK = 'https://www.shomer-app.co.il/shomer.html';
  if (r.plat === 'android') {
    // DATA-ONLY + high priority: Android hands it to SHOMER's own messaging service even when the
    // app is closed, which then sounds the looping alarm and shows the full-screen alert. A
    // "notification" message would be drawn by the system instead, with no alarm and no takeover.
    return {token: r.token, data, android: {priority: 'high', ttl: TTL_S * 1000}};
  }
  return {token: r.token, data: Object.assign({tag: 'sos-' + sid, url: LINK}, data),
    notification: {title, body},
    webpush: {fcmOptions: {link: LINK}, headers: {Urgency: 'high', TTL: String(TTL_S)}},
    apns: {headers: {'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + TTL_S)}}};
}

/** "SOS ended" - silences the alarm on the recipients' phones. No location, no name. */
function buildClear(sos, r) {
  const sid = String(sos.id || sos.ts || '');
  if (r.plat === 'android') return {token: r.token, data: {kind: 'sos_clear', sid, from: r.role === 'paired' ? sos.uid : ''}, android: {priority: 'high', ttl: TTL_S * 1000}};
  return null;   // web: the notification just stays until tapped; the app shows the event as ended
}

/* Open / closed. Today the record has resolved:true|false. EVENT-LIFECYCLE-SPEC.md adds
   state: cancelled | false_alarm | expired | resolved (closed) and reopen - both are understood. */
const CLOSED = {cancelled: 1, false_alarm: 1, expired: 1, resolved: 1};
function isOpen(s) { return !!s && s.resolved !== true && !CLOSED[s.state]; }

/** Is this write the START of a new SOS (or a reopen) - not a type/position/heartbeat update? */
function isNewSos(prev, sos) {
  if (!isOpen(sos) || !isNum(sos.lat)) return false;
  return !isOpen(prev) || (sos.id || sos.ts) !== (prev.id || prev.ts);
}
/** Did an open SOS just close (or get deleted)? */
function isResolved(prev, sos) {
  return isOpen(prev) && !isOpen(sos);
}

module.exports = {isOpen, resolveRecipients, buildMessage, buildClear, isNewSos, isResolved, devicesOf, distM, coarse,
  RADIUS_M, LOC_MAX_AGE_MS, TTL_S, NEARBY_ALARM};
