/* Routing truth table — every row of docs/NATURE-LAYER-PLAN.md §3.  Run: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../layer-routing.js');

const T = [
  // [id, input, expected layers, expected reason]
  ['1  SOS, no type',                 {origin: 'sos'},                                  ['shomer'], 'sos-unclassified'],
  ['2  SOS, type unknown',            {origin: 'sos', type: 'unknown'},                 ['shomer'], 'sos-unclassified'],
  ['3  SOS, violence',                {origin: 'sos', type: 'viol'},                    ['shomer'], 'sos-person'],
  ['4  SOS, medical',                 {origin: 'sos', type: 'med'},                     ['shomer'], 'sos-person'],
  ['5  SOS, harassment',              {origin: 'sos', type: 'sex'},                     ['shomer'], 'sos-person'],
  ['6  SOS, interception debris',     {origin: 'sos', type: 'interception'},            ['shomer'], 'sos-person'],
  ['7  SOS, sinkhole',                {origin: 'sos', type: 'sinkhole'},                ['shomer'], 'sos-person'],
  ['8  SOS, person bitten (rabies)',  {origin: 'sos', type: 'rabies_exposure'},         ['shomer'], 'sos-person'],
  ['9  SOS, marked animal',           {origin: 'sos', type: 'animal'},                  ['nature'], 'sos-marked-nature'],
  ['10 SOS, marked env. hazard',      {origin: 'sos', type: 'envhaz'},                  ['nature'], 'sos-marked-nature'],
  ['11 SOS, marked forest fire',      {origin: 'sos', type: 'wildfire'},                ['shomer', 'nature'], 'sos-both'],
  ['12 SOS, rabid animal + people',   {origin: 'sos', type: 'rabies_animal'},           ['shomer', 'nature'], 'sos-both'],
  ['13 Nature, injured animal',       {origin: 'nature', type: 'animal_injured'},       ['nature'], 'nature-report'],
  ['14 Nature, animal abuse',         {origin: 'nature', type: 'animal_abuse'},         ['nature'], 'nature-report'],
  ['15 Nature, dumping',              {origin: 'nature', type: 'dumping'},              ['nature'], 'nature-report'],
  ['16 Nature, pollution',            {origin: 'nature', type: 'pollution'},            ['nature'], 'nature-report'],
  ['17 Nature, reserve hazard',       {origin: 'nature', type: 'reserve_hazard'},       ['nature'], 'nature-report'],
  ['18 Nature, fire near settlement', {origin: 'nature', type: 'wildfire', nearSettlement: true},  ['shomer', 'nature'], 'nature-fire-near-settlement'],
  ['19 Nature, fire far away',        {origin: 'nature', type: 'wildfire', nearSettlement: false}, ['nature'], 'nature-fire-far'],
  ['20 Nature, fire, not sure',       {origin: 'nature', type: 'wildfire', nearSettlement: null},  ['shomer', 'nature'], 'nature-fire-uncertain'],
  ['21 Nature, fire, field missing',  {origin: 'nature', type: 'wildfire'},             ['shomer', 'nature'], 'nature-fire-uncertain'],
  ['22 Nature, rabid animal',         {origin: 'nature', type: 'rabies_animal'},        ['nature'], 'nature-report'],
  ['23 Nature, unrecognised type',    {origin: 'nature', type: 'zzz'},                  ['shomer'], 'nature-unrecognised-failsafe'],
  ['24 Nature, no type',              {origin: 'nature'},                               ['shomer'], 'nature-unrecognised-failsafe'],
  ['25 Nature, person type',          {origin: 'nature', type: 'violence'},             ['shomer'], 'nature-unrecognised-failsafe'],
  ['26 Unknown origin, animal',       {origin: 'zzz', type: 'animal'},                  ['nature'], 'sos-marked-nature'],
  ['27 Unknown origin, no type',      {origin: 'zzz'},                                  ['shomer'], 'sos-unclassified'],
  ['28 SOS, unrecognised type',       {origin: 'sos', type: 'zzz'},                     ['shomer'], 'sos-person'],
  ['29 SOS, odd casing/space',        {origin: 'sos', type: '  Animal '},               ['nature'], 'sos-marked-nature'],
  ['30 SOS, non-string type',         {origin: 'sos', type: 42},                        ['shomer'], 'sos-unclassified'],
];

for (const [id, input, layers, reason] of T) {
  test(id, () => {
    const r = R.route(input);
    assert.deepEqual(r.layers, layers);
    assert.equal(r.reason, reason);
    assert.equal(r.alerts, 1, 'one alert per user, whatever the layers');
    assert.equal(r.personAlert, layers.includes('shomer'));
    assert.equal(r.layer, layers.length === 2 ? 'both' : layers[0]);
  });
}

test('31 garbage input fails safe to SH✡MER', () => {
  for (const x of [undefined, null, 0, '', 'sos', [], {}, {type: null}]) {
    assert.deepEqual(R.route(x).layers, ['shomer']);
  }
});

test('32 location alone never makes an event Nature', () => {
  const inReserve = {origin: 'sos', lat: 32.73, lng: 35.03, inReserve: true, nearSettlement: false};
  assert.deepEqual(R.route(inReserve).layers, ['shomer']);
  assert.deepEqual(R.route(Object.assign({type: 'unknown'}, inReserve)).layers, ['shomer']);
});

test('33 an unclassified SOS never reaches the Nature layer', () => {
  assert.equal(R.route({origin: 'sos'}).nature, false);
});

test('34 a Nature report never goes to SH✡MER except fire near/uncertain', () => {
  for (const t of R.NATURE_ONLY.concat(R.BOTH)) {
    const r = R.route({origin: 'nature', type: t, nearSettlement: false});
    assert.deepEqual(r.layers, ['nature'], t);
  }
});

test('35 feedLayer: explicit layer wins, old rows stay SH✡MER', () => {
  assert.equal(R.feedLayer({type: 'sos'}), 'shomer');
  assert.equal(R.feedLayer({type: 'presence'}), 'shomer');
  assert.equal(R.feedLayer({type: 'suspicious'}), 'shomer');
  assert.equal(R.feedLayer({type: 'dumping'}), 'nature');
  assert.equal(R.feedLayer({type: 'wildfire'}), 'both');
  assert.equal(R.feedLayer({type: 'wildfire', layer: 'nature'}), 'nature');
  assert.equal(R.feedLayer({type: 'sos', layer: 'bogus'}), 'shomer');
  assert.equal(R.feedLayer(null), 'shomer');
  assert.equal(R.inLayer({layer: 'both'}, 'shomer'), true);
  assert.equal(R.inLayer({layer: 'both'}, 'nature'), true);
  assert.equal(R.inLayer({layer: 'nature'}, 'shomer'), false);
});

test('36 fan-out: new SOS = one alert; re-mark nature = one replacing update', () => {
  const base = {uid: 'u', id: 's1', ts: 1, lat: 32, lng: 35, type: 'unknown'};
  assert.equal(R.fanoutAction(null, base), 'alert');
  assert.equal(R.fanoutAction(base, Object.assign({}, base, {lat: 32.001})), 'none');
  const nat = Object.assign({}, base, {type: 'animal', layer: 'nature'});
  assert.equal(R.fanoutAction(base, nat), 'nature-update');
  assert.equal(R.fanoutAction(nat, nat), 'none');
  assert.equal(R.fanoutAction(nat, Object.assign({}, base, {type: 'med', layer: 'shomer'})), 'person-update');
  const both = Object.assign({}, base, {type: 'wildfire', layer: 'both'});
  assert.equal(R.fanoutAction(base, both), 'none', 'both keeps the person alert: no second alert');
  assert.equal(R.fanoutAction(base, Object.assign({}, base, {resolved: true})), 'none');
  assert.equal(R.fanoutAction(Object.assign({}, base, {resolved: true}), Object.assign({}, base, {ts: 2, id: 's2'})), 'alert');
});

test('37 functions/ copy is byte-identical', () => {
  const a = fs.readFileSync(path.join(__dirname, '..', 'layer-routing.js'));
  const b = fs.readFileSync(path.join(__dirname, '..', 'functions', 'layer-routing.js'));
  assert.ok(a.equals(b), 'run: cp layer-routing.js functions/layer-routing.js');
});
