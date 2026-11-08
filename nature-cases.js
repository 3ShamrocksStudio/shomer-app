/* SH✡MER Nature: case lifecycle and metrics for the Nature dashboard view.
   Pure functions, no I/O, no DOM. Used by dashboard.html (Nature view) and the tests.
   Lifecycle: reported (store code 'open') -> en route ('enroute') -> handled -> closed with an outcome.
   Privacy (CLAUDE.md, 2026-10-28): a case carries type, layer, time, a location rounded to
   ~1 km, documentation flags and its status trail. Never a name, an account id or a precise point. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NatureCases = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATUSES = ['open', 'enroute', 'handled', 'closed'];
  var RANK = { open: 0, enroute: 1, handled: 2, closed: 3 };
  /* How a case ended. Codes only; the dashboard holds the words (HE / AR / EN). */
  var OUTCOMES = ['animal_rescued', 'animal_vet', 'waste_removed', 'source_stopped',
    'fire_out', 'enforcement', 'no_finding', 'duplicate'];
  var TYPES = ['dumping', 'reserve_hazard', 'pollution', 'animal_injured', 'animal_abuse', 'wildfire'];

  function statusOf(state) {
    var s = state && state.status;
    return RANK.hasOwnProperty(s) ? s : 'open';
  }

  /* Can a case move from -> to? Forward only (a step may be skipped: a duplicate is closed
     straight away). Closing needs an outcome. Reopening a closed case goes back to 'open'. */
  function canMove(from, to, outcome) {
    from = RANK.hasOwnProperty(from) ? from : 'open';
    if (!RANK.hasOwnProperty(to)) return false;
    if (to === 'open') return from === 'closed';
    if (RANK[to] <= RANK[from]) return false;
    if (to === 'closed') return OUTCOMES.indexOf(outcome) >= 0;
    return true;
  }

  /* Returns the new state, or null when the move is not allowed. The trail keeps every step. */
  function step(state, to, opts) {
    var o = opts || {};
    var from = statusOf(state);
    if (!canMove(from, to, o.outcome)) return null;
    var prev = state || {};
    var log = (Array.isArray(prev.log) ? prev.log : []).slice(-49);
    var ts = typeof o.ts === 'number' ? o.ts : Date.now();
    var note = String(o.note == null ? '' : o.note).slice(0, 300);
    log.push({ ts: ts, st: to, note: note, outcome: to === 'closed' ? o.outcome : undefined });
    return {
      status: to,
      note: to === 'closed' || note ? note : (prev.note || ''),
      outcome: to === 'closed' ? o.outcome : (to === 'open' ? undefined : prev.outcome),
      at: ts,
      log: log,
      resp: prev.resp
    };
  }

  /* Minutes from the report to the first time it was handled (or closed, if "handled" was skipped).
     null while it is still open or on its way. */
  function handleMinutes(reportTs, state) {
    var log = (state && Array.isArray(state.log)) ? state.log : [];
    for (var i = 0; i < log.length; i++) {
      if (log[i] && (log[i].st === 'handled' || log[i].st === 'closed') && typeof log[i].ts === 'number') {
        return Math.max(0, Math.round((log[i].ts - reportTs) / 60000));
      }
    }
    return null;
  }

  function median(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  /* cases: [{id, type, ts, photo?, note?, state}]  ->  numbers for the KPI strip */
  function metrics(cases, opts) {
    var o = opts || {}, now = typeof o.now === 'number' ? o.now : Date.now();
    var since = now - (o.days || 30) * 864e5;
    var m = { total: 0, open: 0, enroute: 0, handled: 0, closed: 0, closedInPeriod: 0,
      medianHandleMin: null, documented: 0, documentedPct: null, byType: {} };
    var mins = [];
    (cases || []).forEach(function (c) {
      if (!c || typeof c.ts !== 'number') return;
      m.total++;
      var st = statusOf(c.state);
      m[st]++;
      m.byType[c.type] = (m.byType[c.type] || 0) + 1;
      if (c.photo || c.note) m.documented++;
      if (st === 'closed' && c.state && typeof c.state.at === 'number' && c.state.at >= since) m.closedInPeriod++;
      var h = handleMinutes(c.ts, c.state);
      if (h != null && c.ts >= since) mins.push(h);
    });
    m.medianHandleMin = median(mins);
    m.documentedPct = m.total ? Math.round(m.documented / m.total * 100) : null;
    return m;
  }

  /* Location shown on the dashboard: ~1 km (2 decimals), same as the public feed. */
  function coarse(lat, lng) {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return null;
    return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
  }

  function km(a, b, c, d) {
    var R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r;
    var h = Math.sin(x / 2) * Math.sin(x / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) * Math.sin(y / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /* The org's named field area nearest to the point (within its radius), or null. */
  function areaOf(lat, lng, areas) {
    var best = null, bd = Infinity;
    (areas || []).forEach(function (a) {
      var d = km(lat, lng, a.lat, a.lng);
      if (d <= (a.r || 4) && d < bd) { bd = d; best = a; }
    });
    return best ? best.id : null;
  }

  /* What the reporter sees about their own report: received, or handled. Nothing else. */
  function reporterStatus(status) {
    return (status === 'handled' || status === 'closed') ? 'handled' : 'received';
  }

  function filter(cases, f) {
    f = f || {};
    return (cases || []).filter(function (c) {
      if (f.type && f.type !== 'all' && c.type !== f.type) return false;
      if (f.area && f.area !== 'all' && c.area !== f.area) return false;
      if (f.status && f.status !== 'all') {
        var st = statusOf(c.state);
        if (f.status === 'active' ? (st === 'handled' || st === 'closed') : st !== f.status) return false;
      }
      return true;
    });
  }

  /* CSV cell: quotes, and a leading ' so a spreadsheet never runs text as a formula. */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(header, rows) {
    return [header].concat(rows || []).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  return {
    STATUSES: STATUSES.slice(), OUTCOMES: OUTCOMES.slice(), TYPES: TYPES.slice(),
    statusOf: statusOf, canMove: canMove, step: step, handleMinutes: handleMinutes,
    metrics: metrics, coarse: coarse, areaOf: areaOf, reporterStatus: reporterStatus,
    filter: filter, toCSV: toCSV, csvCell: csvCell, median: median
  };
});
