/* Nature case lifecycle and metrics.  Run: node --test tests/nature-cases.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../nature-cases.js');

const T0 = Date.UTC(2026, 10, 8, 8, 0);
const MIN = 60000;

test('N1 lifecycle: reported -> en route -> handled -> closed with outcome', () => {
  let s = null;
  assert.equal(C.statusOf(s), 'open');
  s = C.step(s, 'enroute', {ts: T0 + 5 * MIN});
  assert.equal(s.status, 'enroute');
  s = C.step(s, 'handled', {ts: T0 + 40 * MIN, note: 'הועבר לווטרינר'});
  assert.equal(s.status, 'handled');
  s = C.step(s, 'closed', {ts: T0 + 60 * MIN, outcome: 'animal_vet', note: 'נקלט בבית חולים לחיות בר'});
  assert.equal(s.status, 'closed');
  assert.equal(s.outcome, 'animal_vet');
  assert.deepEqual(s.log.map((x) => x.st), ['enroute', 'handled', 'closed']);
});

test('N2 closing needs a known outcome', () => {
  assert.equal(C.step({status: 'handled'}, 'closed', {}), null);
  assert.equal(C.step({status: 'handled'}, 'closed', {outcome: 'zzz'}), null);
  assert.ok(C.step({status: 'handled'}, 'closed', {outcome: 'waste_removed'}));
});

test('N3 no moving backwards; a step may be skipped; reopen only from closed', () => {
  assert.equal(C.step({status: 'handled'}, 'enroute'), null);
  assert.equal(C.step({status: 'enroute'}, 'enroute'), null);
  assert.ok(C.step({status: 'open'}, 'closed', {outcome: 'duplicate'}), 'duplicate closes straight away');
  assert.equal(C.step({status: 'handled'}, 'open'), null);
  const re = C.step({status: 'closed', outcome: 'no_finding'}, 'open');
  assert.equal(re.status, 'open');
  assert.equal(re.outcome, undefined);
  assert.equal(C.step(null, 'bogus'), null);
});

test('N4 time to handle = report -> first handled (or closed if skipped)', () => {
  let s = C.step(null, 'enroute', {ts: T0 + 10 * MIN});
  assert.equal(C.handleMinutes(T0, s), null, 'en route is not handled');
  s = C.step(s, 'handled', {ts: T0 + 45 * MIN});
  s = C.step(s, 'closed', {ts: T0 + 90 * MIN, outcome: 'fire_out'});
  assert.equal(C.handleMinutes(T0, s), 45);
  const d = C.step(null, 'closed', {ts: T0 + 7 * MIN, outcome: 'duplicate'});
  assert.equal(C.handleMinutes(T0, d), 7);
});

test('N5 metrics: open / en route / closed, median time to handle, documentation', () => {
  const now = T0 + 120 * MIN;
  const closed = C.step(C.step(null, 'handled', {ts: T0 + 30 * MIN}), 'closed', {ts: T0 + 50 * MIN, outcome: 'waste_removed'});
  const handled = C.step(null, 'handled', {ts: T0 + 60 * MIN});
  const cases = [
    {id: 'a', type: 'dumping', ts: T0, photo: 'x', state: closed},
    {id: 'b', type: 'dumping', ts: T0, state: handled},
    {id: 'c', type: 'wildfire', ts: T0, note: 'עשן', state: C.step(null, 'enroute', {ts: T0 + MIN})},
    {id: 'd', type: 'pollution', ts: T0, state: null},
    {id: 'bad', type: 'dumping'}
  ];
  const m = C.metrics(cases, {now: now, days: 30});
  assert.equal(m.total, 4);
  assert.equal(m.open, 1);
  assert.equal(m.enroute, 1);
  assert.equal(m.handled, 1);
  assert.equal(m.closed, 1);
  assert.equal(m.closedInPeriod, 1);
  assert.equal(m.medianHandleMin, 45, 'median of 30 and 60');
  assert.equal(m.documentedPct, 50);
  assert.deepEqual(m.byType, {dumping: 2, wildfire: 1, pollution: 1});
  assert.equal(C.metrics([], {now: now}).medianHandleMin, null);
});

test('N6 dashboard location is ~1 km (2 decimals), never the precise point', () => {
  assert.deepEqual(C.coarse(31.90567, 34.98412), {lat: 31.91, lng: 34.98});
  assert.equal(C.coarse(null, 1), null);
  assert.equal(C.coarse(NaN, 1), null);
});

test('N7 area = nearest named field area within its radius', () => {
  const A = [{id: 'ben-shemen', lat: 31.95, lng: 34.93, r: 3}, {id: 'canada', lat: 31.84, lng: 34.99, r: 3}];
  assert.equal(C.areaOf(31.94, 34.94, A), 'ben-shemen');
  assert.equal(C.areaOf(31.845, 34.985, A), 'canada');
  assert.equal(C.areaOf(32.5, 35.5, A), null);
});

test('N8 the reporter only ever sees received or handled', () => {
  assert.equal(C.reporterStatus('open'), 'received');
  assert.equal(C.reporterStatus('enroute'), 'received');
  assert.equal(C.reporterStatus('handled'), 'handled');
  assert.equal(C.reporterStatus('closed'), 'handled');
  assert.equal(C.reporterStatus(undefined), 'received');
});

test('N9 filters by type, area and status', () => {
  const cs = [
    {type: 'dumping', area: 'x', state: {status: 'closed'}},
    {type: 'dumping', area: 'y', state: null},
    {type: 'wildfire', area: 'x', state: {status: 'enroute'}}
  ];
  assert.equal(C.filter(cs, {type: 'dumping'}).length, 2);
  assert.equal(C.filter(cs, {area: 'x'}).length, 2);
  assert.equal(C.filter(cs, {status: 'active'}).length, 2);
  assert.equal(C.filter(cs, {status: 'closed'}).length, 1);
  assert.equal(C.filter(cs, {type: 'all', area: 'all', status: 'all'}).length, 3);
});

test('N10 CSV export quotes text and never lets a cell run as a formula', () => {
  const csv = C.toCSV(['a', 'b'], [['=1+1', 'x,"y"'], ['-2', 'שלום']]);
  assert.equal(csv, 'a,b\r\n\'=1+1,"x,""y"""\r\n\'-2,שלום');
});
