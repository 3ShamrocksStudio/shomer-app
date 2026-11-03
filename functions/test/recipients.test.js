/* Unit tests for SOS recipient resolution + message privacy.  Run:  cd functions && npm test
   Uses made-up ids and fake tokens only - nothing is sent anywhere. */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../recipients');

const NOW = 1_800_000_000_000;
const TLV = {lat: 32.0853, lng: 34.7818};            // sender, Tel Aviv
const sos = {uid: 'sender', id: 's1', lat: TLV.lat, lng: TLV.lng, ts: NOW - 1000, type: 'med', resolved: false};
const near = {lat: 32.09, lng: 34.79};                 // ~1 km away
const far = {lat: 31.7683, lng: 35.2137};              // Jerusalem, ~54 km

function run(tokens, pairs, extra) { return R.resolveRecipients(Object.assign({sos, tokens, pairs, now: NOW}, extra)); }

test('paired SHOMER gets it at any distance', () => {
  const r = run({p1: {d1: {token: 'T-p1', ts: NOW, plat: 'android', lat: far.lat, lng: far.lng}}}, {p1: {name: 'x'}});
  assert.deepStrictEqual(r.map(x => [x.uid, x.role]), [['p1', 'paired']]);
});

test('paired SHOMER with no location still gets it', () => {
  const r = run({p1: {d1: {token: 'T-p1', ts: NOW - 100 * 86400000, plat: 'android'}}}, {p1: {}});
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].role, 'paired');
});

test('nearby stranger within 5 km with a fresh point gets it', () => {
  const r = run({n1: {d1: {token: 'T-n1', ts: NOW - 3600000, plat: 'android', lat: near.lat, lng: near.lng}}}, {});
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].role, 'nearby'); assert.ok(r[0].distM < 5000);
});

test('stranger far away gets nothing', () => {
  assert.strictEqual(run({f1: {d1: {token: 'T-f1', ts: NOW, plat: 'android', lat: far.lat, lng: far.lng}}}, {}).length, 0);
});

test('stranger with NO location gets nothing (old code pushed to everyone without a point)', () => {
  assert.strictEqual(run({x: {d1: {token: 'T-x', ts: NOW, plat: 'android'}}}, {}).length, 0);
});

test('stranger whose point is older than 2 days gets nothing', () => {
  assert.strictEqual(run({x: {d1: {token: 'T-x', ts: NOW - 3 * 86400000, plat: 'android', lat: near.lat, lng: near.lng}}}, {}).length, 0);
});

test('sender never gets their own SOS', () => {
  assert.strictEqual(run({sender: {d1: {token: 'T-s', ts: NOW, plat: 'android', lat: TLV.lat, lng: TLV.lng}}}, {sender: {}}).length, 0);
});

test('every device of a user is reached; duplicate tokens are sent once', () => {
  const r = run({p1: {a: {token: 'T-a', ts: NOW, plat: 'android'}, b: {token: 'T-b', ts: NOW, plat: 'web'}, c: {token: 'T-a', ts: NOW, plat: 'android'}}}, {p1: {}});
  assert.deepStrictEqual(r.map(x => x.token).sort(), ['T-a', 'T-b']);
});

test('old single-device token shape still works', () => {
  const r = run({p1: {token: 'T-old', ts: NOW}}, {p1: {}});
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].plat, 'web'); assert.strictEqual(r[0].dev, null);
});

test('resolved / location-less SOS has no recipients', () => {
  assert.strictEqual(R.resolveRecipients({sos: Object.assign({}, sos, {resolved: true}), tokens: {p1: {token: 'T'}}, pairs: {p1: {}}, now: NOW}).length, 0);
  assert.strictEqual(R.resolveRecipients({sos: Object.assign({}, sos, {lat: null}), tokens: {p1: {token: 'T'}}, pairs: {p1: {}}, now: NOW}).length, 0);
});

test('new-SOS detection: new id or re-open pushes; type/position updates do not', () => {
  assert.ok(R.isNewSos(null, sos));
  assert.ok(R.isNewSos(Object.assign({}, sos, {resolved: true}), sos));
  assert.ok(R.isNewSos(Object.assign({}, sos, {id: 's0'}), sos));
  assert.ok(!R.isNewSos(sos, Object.assign({}, sos, {type: 'viol', lat: 32.1})));
  assert.ok(R.isResolved(sos, Object.assign({}, sos, {resolved: true})));
  assert.ok(R.isResolved(sos, null));
  assert.ok(!R.isResolved(Object.assign({}, sos, {resolved: true}), Object.assign({}, sos, {resolved: true})));
});

test('android message: data-only, high priority, TTL, no precise location', () => {
  const m = R.buildMessage(sos, {token: 'T', plat: 'android', role: 'paired', lang: 'he'}, 'Dana');
  assert.strictEqual(m.notification, undefined);
  assert.strictEqual(m.android.priority, 'high');
  assert.strictEqual(m.android.ttl, R.TTL_S * 1000);
  assert.strictEqual(m.data.kind, 'sos'); assert.strictEqual(m.data.from, 'sender'); assert.ok(m.data.title.includes('Dana'));
  Object.values(m.data).forEach(v => assert.strictEqual(typeof v, 'string'));   // FCM data values must be strings
  assert.ok(!JSON.stringify(m).includes(String(TLV.lat)), 'precise lat leaked');
  assert.ok(!('alat' in m.data));
});

test('nearby message: no account id, no name, only ~1 km area', () => {
  const m = R.buildMessage(sos, {token: 'T', plat: 'android', role: 'nearby', lang: 'en', distM: 1234}, 'Dana');
  const j = JSON.stringify(m);
  assert.ok(!j.includes('sender'), 'account id leaked to a stranger');
  assert.ok(!j.includes('Dana'), 'name leaked to a stranger');
  assert.ok(!j.includes(String(TLV.lat)) && !j.includes(String(TLV.lng)), 'precise location leaked');
  assert.strictEqual(m.data.alat, '32.09'); assert.strictEqual(m.data.alng, '34.78');
  assert.ok(m.data.body.includes('1 km'));
});

test('web message keeps a visible notification + urgent webpush headers', () => {
  const m = R.buildMessage(sos, {token: 'T', plat: 'web', role: 'paired', lang: 'en'}, '');
  assert.ok(m.notification.title.includes('Your SHOMER'));
  assert.strictEqual(m.webpush.headers.Urgency, 'high');
  assert.strictEqual(m.webpush.headers.TTL, String(R.TTL_S));
});

test('clear message: android only, no location', () => {
  const c = R.buildClear(sos, {token: 'T', plat: 'android', role: 'nearby'});
  assert.strictEqual(c.data.kind, 'sos_clear'); assert.strictEqual(c.data.from, '');
  assert.strictEqual(R.buildClear(sos, {token: 'T', plat: 'web', role: 'paired'}), null);
});

test('lifecycle spec states: closed states end it, reopen re-alarms', () => {
  for (const st of ['cancelled', 'false_alarm', 'expired', 'resolved']) {
    const closed = Object.assign({}, sos, {state: st});
    assert.ok(R.isResolved(sos, closed), st);
    assert.ok(!R.isNewSos(sos, closed), st);
    assert.ok(R.isNewSos(closed, Object.assign({}, sos, {state: 'open'})), 'reopen after ' + st);
    assert.strictEqual(R.resolveRecipients({sos: closed, tokens: {p1: {token: 'T'}}, pairs: {p1: {}}, now: NOW}).length, 0);
  }
  assert.ok(!R.isNewSos(Object.assign({}, sos, {state: 'accepted'}), Object.assign({}, sos, {state: 'onscene'})));
});
