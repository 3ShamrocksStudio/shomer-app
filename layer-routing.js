/* SH✡MER layer routing — the ONE place that decides which layer an event belongs to.
   Product decision 2026-11-07 (SHOMER-AND-NATURE-DECISION):
     - lives / the community in danger          -> SH✡MER layer ('shomer')
     - harm to those without a voice (animals,
       the environment)                         -> Nature layer ('nature')
     - both                                     -> both layers, ONE alert to the user
     - uncertain                                -> SH✡MER (fail-safe)
   An unclassified SOS is always a person in distress and goes to SH✡MER only.
   A Nature report (started without SOS) goes to Nature only, except a fire near a
   settlement, or a reporter who answers "yes, someone is in danger", which also go to SH✡MER. Location alone NEVER makes an event Nature.
   Pure functions, no I/O. Used by the app, the dashboard, Cloud Functions and the tests.
   functions/layer-routing.js must stay a byte-identical copy (a test checks it). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShomerRouting = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Event types by layer. Examples from the decision, not a closed list:
     anything not listed here is treated as a person event (fail-safe). */
  var NATURE_ONLY = {
    animal: 1,          // SOS picker: "animal" (injured / trapped / in danger)
    envhaz: 1,          // SOS picker: "environmental hazard"
    animal_injured: 1,  // חיה פצועה
    animal_abuse: 1,    // התעללות בבעל חיים
    dumping: 1,         // השלכת אשפה
    pollution: 1,       // זיהום
    reserve_hazard: 1   // מפגע בשמורה
  };
  var BOTH = {
    wildfire: 1,        // שריפת חורש
    rabies_animal: 1    // כלבת: חיה מסוכנת בשטח + סיכון לאנשים
  };
  /* Person types are listed for documentation and for the dashboard legend only;
     routing never needs this list, because "not nature" already means SH✡MER. */
  var PERSON = ['unknown', 'sos', 'viol', 'med', 'sex', 'stalk', 'theft', 'drug', 'new',
    'abduct', 'missing', 'suspicious', 'harass', 'violence', 'weapon', 'medical', 'hazard',
    'fire', 'bomb', 'interception', 'sinkhole', 'shooting', 'rabies_exposure', 'bite'];

  var LAYERS = { shomer: 1, nature: 1, both: 1 };

  function clean(t) { return (typeof t === 'string') ? t.trim().toLowerCase() : ''; }
  function isNatureOnly(t) { return NATURE_ONLY.hasOwnProperty(clean(t)); }
  function isBoth(t) { return BOTH.hasOwnProperty(clean(t)); }

  function result(layers, reason) {
    var s = layers.indexOf('shomer') >= 0, n = layers.indexOf('nature') >= 0;
    return {
      layers: layers,                       // ['shomer'] | ['nature'] | ['shomer','nature']
      layer: s && n ? 'both' : (n ? 'nature' : 'shomer'),
      shomer: s,
      nature: n,
      personAlert: s,                       // nearby users / "the people you chose" get a person alert
      alerts: 1,                            // the same event = ONE alert per user, whatever the layers
      reason: reason
    };
  }

  /* route({origin, type, nearSettlement, peopleInDanger})
     origin:         'sos' | 'nature'   (anything else is treated as 'sos')
     type:           event type string  (missing / unknown / unrecognised = person)
     nearSettlement: true | false | null (only read for a fire in a Nature report;
                     null = "not sure" = uncertain = SH✡MER too)
     peopleInDanger: "is anyone in danger?" - true escalates a Nature report to SH✡MER
                     as well. false / missing = no. Any other value is unclear = SH✡MER too.
     Any other field (lat, lng, inReserve, ...) is ignored on purpose. */
  function route(input) {
    var o = (input && typeof input === 'object') ? input : {};
    var origin = o.origin === 'nature' ? 'nature' : 'sos';
    var t = clean(o.type);

    if (origin === 'sos') {
      if (!t || t === 'unknown') return result(['shomer'], 'sos-unclassified');
      if (isBoth(t)) return result(['shomer', 'nature'], 'sos-both');
      if (isNatureOnly(t)) return result(['nature'], 'sos-marked-nature');
      return result(['shomer'], 'sos-person');
    }
    /* Nature report (started without SOS) */
    var pd = o.peopleInDanger;
    if ((isNatureOnly(t) || isBoth(t)) && pd !== undefined && pd !== null && pd !== false)
      return result(['shomer', 'nature'], 'nature-people-in-danger');
    if (t === 'wildfire') {
      if (o.nearSettlement === false) return result(['nature'], 'nature-fire-far');
      return result(['shomer', 'nature'],
        o.nearSettlement === true ? 'nature-fire-near-settlement' : 'nature-fire-uncertain');
    }
    if (isNatureOnly(t) || isBoth(t)) return result(['nature'], 'nature-report');
    return result(['shomer'], 'nature-unrecognised-failsafe');
  }

  /* Layer of a stored dashboard row. Rows written before this change carry no layer:
     derive it from the type (SOS origin rules), so old rows stay in the SH✡MER layer. */
  function feedLayer(row) {
    var r = row || {};
    if (typeof r.layer === 'string' && LAYERS.hasOwnProperty(r.layer)) return r.layer;
    return route({ origin: 'sos', type: r.type }).layer;
  }
  function inLayer(row, layer) {
    var l = feedLayer(row);
    return l === 'both' || l === layer;
  }

  /* What the push fan-out does when sos/<uid> changes (Cloud Functions).
     'alert'          new SOS -> ONE person alert (always SH✡MER first: it starts unclassified)
     'nature-update'  the owner re-marked it as nature -> ONE update with the SAME tag, so it
                      replaces the earlier alert on the device ("nature report, not human distress")
     'person-update'  re-marked back from nature to a person event -> same tag, back to SOS
     'none'           anything else (position, other type changes, resolve) */
  function fanoutAction(prev, next) {
    if (!next || next.resolved || next.lat == null) return 'none';
    var isNew = !prev || prev.resolved || (next.id || next.ts) !== (prev.id || prev.ts);
    if (isNew) return 'alert';
    var was = feedLayer(prev), now = feedLayer(next);
    if (was !== 'nature' && now === 'nature') return 'nature-update';
    if (was === 'nature' && now !== 'nature') return 'person-update';
    return 'none';
  }

  return {
    route: route,
    feedLayer: feedLayer,
    inLayer: inLayer,
    fanoutAction: fanoutAction,
    isNatureOnly: isNatureOnly,
    isBoth: isBoth,
    NATURE_ONLY: Object.keys(NATURE_ONLY),
    BOTH: Object.keys(BOTH),
    PERSON: PERSON.slice()
  };
});
