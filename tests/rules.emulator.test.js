/* SH✡MER database rules - security tests against the local Realtime Database emulator.
   Never touches the real database.
   Run:  java -jar ~/.cache/firebase/emulators/firebase-database-emulator-*.jar --port 9000 &
         node tests/rules.emulator.test.js            (EMU=http://127.0.0.1:9000 by default)
   Exit code 0 = all pass. */
const fs = require('fs');
const path = require('path');
const EMU = process.env.EMU || 'http://127.0.0.1:9000';
const NS = 'shomer-rules-' + Date.now();
const RULES = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (uid) => b64({alg: 'none', typ: 'JWT'}) + '.' + b64({sub: uid, user_id: uid, iat: 1, exp: 9999999999, aud: NS, iss: 'x', firebase: {sign_in_provider: 'anonymous'}}) + '.';
async function req(method, p, uid, body) {
  const u = EMU + '/' + p.split('/').map(encodeURIComponent).join('/') + '.json?ns=' + NS + (uid && uid !== 'owner' ? '&auth=' + tok(uid) : '');
  const opt = {method, headers: {}};
  if (uid === 'owner') opt.headers.Authorization = 'Bearer owner';
  if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(u, opt);
  const t = await r.text();
  return {ok: r.ok, status: r.status, body: t};
}
let pass = 0, fail = 0;
async function expect(name, want, p) {
  const r = await p;
  const got = r.ok ? 'ALLOW' : 'DENY';
  if (got === want) { pass++; console.log('PASS', want.padEnd(5), name); }
  else { fail++; console.log('FAIL', 'want ' + want + ' got ' + got, name, r.body.slice(0, 120)); }
}
const SV = {'.sv': 'timestamp'};
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQ==';
const now = Date.now();
const alert = (o) => Object.assign({kind: 'missing', subjName: 'Dana', desc: 'red coat', lastSeen: 'park', lat: 31.9, lng: 34.8, locTs: now, byName: '', ts: now, status: 'active'}, o || {});
function pa(n) { return 'pa_' + String(n).padStart(16, '0'); }
async function createAlert(uid, id, rec, subj) {
  await req('PUT', 'dashown/' + id, uid, uid);
  const up = {};
  up['palerts/' + id] = rec;
  up['palast/' + uid] = {id, ts: SV};
  if (subj) up['pasubj/' + id] = subj;
  return req('PATCH', '', uid, up);
}

(async () => {
  const set = await req('PUT', '.settings/rules', 'owner', JSON.parse(RULES));
  if (!set.ok) { console.log('could not load rules:', set.body); process.exit(2); }
  // seed: subj shares with guard (pairs/<subj>/<guard>)
  await req('PUT', 'pairs/subj', 'owner', {guard: {name: 'G', ts: now}});
  await req('PUT', 'palerts/pa_legacy1', 'owner', {kind: 'missing', ts: now, status: 'active', subjUid: 'subj', subjName: 'L'});
  await req('PUT', 'palerts/pa_legacy2', 'owner', {kind: 'missing', ts: now, status: 'active', subjUid: 'subj', subjName: 'L2'});
  await req('PUT', 'dashfeed/e_legacyRowWithUid', 'owner', {type: 'suspicious', lat: 31.9, lng: 34.8, ts: now - 864e5 * 20, status: 'active', by: 'someUid'});

  console.log('-- invite inbox sender name');
  const ih = 'a'.repeat(64);
  await expect('inbox: name with HTML (<=60) is stored as text; the app escapes it', 'ALLOW', req('PUT', 'invites/inbox_' + ih, 'atk', {fromUid: 'atk', type: 'invite', fromName: '<img src=x onerror=alert(1)>', ts: now, seen: false}));
  await expect('inbox: 61-char name rejected', 'DENY', req('PUT', 'invites/inbox_' + 'b'.repeat(64), 'atk', {fromUid: 'atk', type: 'invite', fromName: 'x'.repeat(61), ts: now, seen: false}));
  await expect('inbox: non-string name rejected', 'DENY', req('PUT', 'invites/inbox_' + 'c'.repeat(64), 'atk', {fromUid: 'atk', type: 'invite', fromName: {a: 1}, ts: now, seen: false}));

  console.log('-- person alerts: create + rate limit');
  await expect('old-style plain PUT (no rate stamp) rejected', 'DENY', (async () => { await req('PUT', 'dashown/' + pa(1), 'atk', 'atk'); return req('PUT', 'palerts/' + pa(1), 'atk', alert()); })());
  await expect('genuine alert (atomic write + stamp + private subject) allowed', 'ALLOW', createAlert('rep', pa(2), alert({subjPhoto: JPEG}), 'subj'));
  await expect('second alert by same account within 5 min rejected', 'DENY', createAlert('rep', pa(3), alert(), 'subj'));
  await expect('alert carrying subjUid (account id) rejected', 'DENY', createAlert('u1', pa(4), alert({subjUid: 'subj'})));
  await expect('alert carrying by (account id) rejected', 'DENY', createAlert('u2', pa(5), alert({by: 'u2'})));
  await expect('photo javascript: URL rejected', 'DENY', createAlert('u3', pa(6), alert({subjPhoto: 'javascript:alert(1)'})));
  await expect('photo attribute break-out rejected', 'DENY', createAlert('u4', pa(7), alert({subjPhoto: 'x" onerror="alert(1)'})));
  await expect('photo https tracking URL rejected', 'DENY', createAlert('u5', pa(8), alert({subjPhoto: 'https://evil.example/p.gif'})));
  await expect('photo data:text/html rejected', 'DENY', createAlert('u6', pa(9), alert({subjPhoto: 'data:text/html;base64,PHNjcmlwdD4='})));
  await expect('kind outside abduct/missing rejected', 'DENY', createAlert('u7', pa(10), alert({kind: '<b>x</b>'})));
  await expect('unknown extra field rejected', 'DENY', createAlert('u8', pa(11), alert({html: '<script>'})));
  await expect('61-char subject name rejected', 'DENY', createAlert('u9', pa(12), alert({subjName: 'x'.repeat(61)})));
  await expect('id not in app format rejected', 'DENY', createAlert('u10', 'pa_evil', alert()));
  await expect('alert on an id owned by someone else rejected', 'DENY', (async () => { const up = {}; up['palerts/' + pa(13)] = alert(); up['palast/atk2'] = {id: pa(13), ts: SV}; await req('PUT', 'dashown/' + pa(13), 'u11', 'u11'); return req('PATCH', '', 'atk2', up); })());

  console.log('-- person alerts: who can change / read');
  await expect('stranger cannot close someone else\'s alert', 'DENY', req('PUT', 'palerts/' + pa(2) + '/status', 'atk', 'resolved'));
  await expect('stranger cannot delete someone else\'s alert', 'DENY', req('DELETE', 'palerts/' + pa(2), 'atk'));
  await expect('stranger cannot read the private subject id', 'DENY', req('GET', 'pasubj/' + pa(2), 'atk'));
  await expect('subject can read it', 'ALLOW', req('GET', 'pasubj/' + pa(2), 'subj'));
  await expect('subject\'s SHOMER can read it', 'ALLOW', req('GET', 'pasubj/' + pa(2), 'guard'));
  await expect('reporter can read it', 'ALLOW', req('GET', 'pasubj/' + pa(2), 'rep'));
  await expect('stranger cannot overwrite the private subject id', 'DENY', req('PUT', 'pasubj/' + pa(2), 'atk', 'atk'));
  await expect('subject\'s SHOMER can close the alert', 'ALLOW', req('PUT', 'palerts/' + pa(2) + '/status', 'guard', 'resolved'));
  await expect('subject can set resolvedTs', 'ALLOW', req('PUT', 'palerts/' + pa(2) + '/resolvedTs', 'subj', now));
  await expect('status outside active/resolved rejected', 'DENY', req('PUT', 'palerts/' + pa(2) + '/status', 'rep', '<img>'));
  await expect('anyone signed in can still read alerts (feature)', 'ALLOW', req('GET', 'palerts', 'atk'));
  await expect('nobody can read the rate stamps', 'DENY', req('GET', 'palast/rep', 'rep'));

  console.log('-- legacy alerts that still carry subjUid');
  await expect('legacy subject can still close (before migration)', 'ALLOW', req('PUT', 'palerts/pa_legacy2/status', 'subj', 'resolved'));
  await expect('copy with WRONG id into private node rejected', 'DENY', req('PUT', 'pasubj/pa_legacy1', 'atk', 'atk'));
  await expect('copy legacy subjUid into private node allowed', 'ALLOW', req('PUT', 'pasubj/pa_legacy1', 'atk', 'subj'));
  await expect('remove subjUid from public alert allowed', 'ALLOW', req('DELETE', 'palerts/pa_legacy1/subjUid', 'atk'));
  await expect('putting a subjUid back rejected', 'DENY', req('PUT', 'palerts/pa_legacy1/subjUid', 'atk', 'x'));
  await expect('after migration the subject can still close', 'ALLOW', req('PUT', 'palerts/pa_legacy1/status', 'subj', 'resolved'));

  console.log('-- public dashboard feed');
  await expect('any signed-in app can delete a legacy row that names an account', 'ALLOW', req('DELETE', 'dashfeed/e_legacyRowWithUid', 'atk'));
  await expect('ordinary rows cannot be deleted by strangers', 'DENY', (async () => { await req('PUT', 'dashown/hb_00000000000000aa', 'u20', 'u20'); await req('PUT', 'dashfeed/hb_00000000000000aa', 'u20', {type: 'presence', lat: 31.9, lng: 34.8, ts: now, status: 'v2:0123456789ab'}); return req('DELETE', 'dashfeed/hb_00000000000000aa', 'atk'); })());
  await expect('heartbeat row (app format) still allowed', 'ALLOW', req('PUT', 'dashfeed/hb_00000000000000aa', 'u20', {type: 'presence', lat: 31.9, lng: 34.8, ts: now, status: 'v2:0123456789ab'}));
  await expect('daily marker row still allowed', 'ALLOW', (async () => { await req('PUT', 'dashown/hb_00000000000000bb', 'u21', 'u21'); return req('PUT', 'dashfeed/hb_00000000000000bb', 'u21', {type: 'presence', lat: 31.9, lng: 34.8, ts: now, status: 'd1:0123456789ab:2026-11-18'}); })());
  await expect('row with by (account id) rejected', 'DENY', req('PUT', 'dashfeed/hb_00000000000000aa', 'u20', {type: 'presence', lat: 31.9, lng: 34.8, ts: now, status: 'v2', by: 'u20'}));
  await expect('event row (app format) still allowed', 'ALLOW', (async () => { await req('PUT', 'events/e_00000000000000cc', 'u22', {by: 'u22', ts: now, type: 'med'}); return req('PUT', 'dashfeed/e_00000000000000cc', 'u22', {type: 'med', lat: 31.9, lng: 34.8, ts: now, status: 'active'}); })());
  await expect('HTML in type rejected', 'DENY', req('PUT', 'dashfeed/e_00000000000000cc', 'u22', {type: '<img src=x onerror=alert(1)>', lat: 31.9, lng: 34.8, ts: now, status: 'active'}));
  await expect('HTML in status rejected', 'DENY', req('PUT', 'dashfeed/e_00000000000000cc', 'u22', {type: 'med', lat: 31.9, lng: 34.8, ts: now, status: '"><svg onload=alert(1)>'}));
  await expect('quote in row id rejected', 'DENY', (async () => { await req('PUT', "events/e_x'y", 'u23', {by: 'u23', ts: now, type: 'med'}); return req('PUT', "dashfeed/e_x'y", 'u23', {type: 'med', lat: 31.9, lng: 34.8, ts: now, status: 'active'}); })());
  await expect('SOS resolve status update still allowed', 'ALLOW', req('PATCH', 'dashfeed/e_00000000000000cc', 'u22', {status: 'resolved'}));

  console.log('-- SOS');
  await expect('normal SOS still allowed', 'ALLOW', req('PUT', 'sos/s1', 's1', {uid: 's1', id: 'sos_1', lat: 31.9, lng: 34.8, type: 'unknown', typeState: 'self', ts: now, resolved: false}));
  await expect('SOS type update still allowed', 'ALLOW', req('PATCH', 'sos/s1', 's1', {type: 'viol', typeState: 'self'}));
  await expect('SOS resolve still allowed', 'ALLOW', req('PATCH', 'sos/s1', 's1', {resolved: true, resolvedTs: now, safe: true}));
  await expect('SOS free-text / HTML type rejected', 'DENY', req('PATCH', 'sos/s1', 's1', {type: 'Call me <a href=x>'}));
  await expect('SOS for another account rejected', 'DENY', req('PUT', 'sos/s1', 'atk', {uid: 'atk', lat: 1, lng: 1, ts: now}));
  /* theft alert map record (v349 client): sos/<ownUid>, type theft, no name */
  await expect('theft map record (client v349 shape) allowed', 'ALLOW', req('PUT', 'sos/s1', 's1', {uid: 's1', id: 'theft1', lat: 31.9, lng: 34.8, type: 'theft', typeState: 'self', ts: now, resolved: false}));
  await expect('old theft write (sos/<theftId> + name) still refused', 'DENY', req('PUT', 'sos/theft1', 's1', {uid: 's1', lat: 31.9, lng: 34.8, type: 'theft', typeState: 'self', ts: now, resolved: false, name: 'x'}));
  await expect('theft photo under own theft/<uid> allowed', 'ALLOW', req('PUT', 'theft/s1/theft1', 's1', {ts: now, lat: 31.9, lng: 34.8, photo: 'data:image/jpeg;base64,AA', name: 'x'}));
  await expect('theft photo of another account not readable', 'DENY', req('GET', 'theft/s1', 'atk'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
