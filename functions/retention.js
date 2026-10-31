/* SH✡MER privacy retention (NOT DEPLOYED, needs Dave's OK). See RULES-DEPLOY.md "Retention function".
   Policy (CLAUDE.md, 2026-10-28): nothing is kept longer than 90 days.
   1. Closed person alerts (palerts, status 'resolved') whose close time is older than 90 days are
      deleted, with their private owner record dashown/<id>. Close time = resolvedTs, or the alert
      time ts for old alerts that never got a resolvedTs.
   2. AED records written before the ownership change still carry the creator's account id in `by`.
      The id is moved to the private dashown/aed_<id> record and removed from the shared record.
   Open (active) alerts are never touched. */
const DAY = 24 * 60 * 60 * 1000;
const KEEP = 90 * DAY;

async function runRetention(db, now = Date.now()) {
  const out = {palertsDeleted: 0, aedsStripped: 0};
  const updates = {};
  const pa = (await db.ref('palerts').get()).val() || {};
  Object.keys(pa).forEach((id) => {
    const a = pa[id];
    if (!a || a.status !== 'resolved') return;
    const closed = typeof a.resolvedTs === 'number' ? a.resolvedTs : (typeof a.ts === 'number' ? a.ts : 0);
    if (now - closed <= KEEP) return;
    updates['palerts/' + id] = null;
    updates['dashown/' + id] = null;
    out.palertsDeleted++;
  });
  const aeds = (await db.ref('aeds').get()).val() || {};
  Object.keys(aeds).forEach((id) => {
    const a = aeds[id];
    if (!a || typeof a.by !== 'string' || !a.by) return;
    updates['dashown/aed_' + id] = a.by;
    updates['aeds/' + id + '/by'] = null;
    out.aedsStripped++;
  });
  if (Object.keys(updates).length) await db.ref().update(updates);
  return out;
}

module.exports = {runRetention, KEEP};
