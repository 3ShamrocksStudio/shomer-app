/* Retention for push tokens, against an in-memory fake database (nothing real is touched). */
const test = require('node:test');
const assert = require('node:assert');
const {runRetention} = require('../retention');
const DAY = 86400000, NOW = 1_800_000_000_000;
function fakeDb(tree) {
  let applied = null;
  return {applied: () => applied, ref: (p) => ({get: async () => ({val: () => (p ? tree[p] : tree)}), update: async (u) => { applied = u; }})};
}
test('tokens: 90-day devices deleted, 2-day points stripped, fresh kept', async () => {
  const db = fakeDb({palerts: {}, aeds: {}, tokens: {
    a: {d1: {token: 'T1', ts: NOW - 91 * DAY}, d2: {token: 'T2', ts: NOW - 3 * DAY, lat: 32.1, lng: 34.8}, d3: {token: 'T3', ts: NOW - DAY, lat: 32.1, lng: 34.8}},
    b: {token: 'T4', ts: NOW - 100 * DAY, lat: 1, lng: 2}
  }});
  const r = await runRetention(db, NOW);
  const u = db.applied();
  assert.strictEqual(r.tokensDeleted, 2); assert.strictEqual(r.tokenPointsStripped, 1);
  assert.ok('tokens/a/d1' in u && u['tokens/a/d1'] === null);
  assert.ok('tokens/b' in u);
  assert.ok(u['tokens/a/d2/lat'] === null && u['tokens/a/d2/lng'] === null);
  assert.ok(!Object.keys(u).some(k => k.startsWith('tokens/a/d3')));
});
