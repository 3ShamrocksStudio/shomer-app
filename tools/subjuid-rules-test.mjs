// Rules test for database.rules.json.SUBJUID-PROPOSED (plan steps 1+2).
// Run: npx -y firebase-tools@13 emulators:exec --only database --project demo-shomer "node tools/subjuid-rules-test.mjs"
// Set RUT_DIR to the folder whose node_modules holds @firebase/rules-unit-testing (default: cwd).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const req = createRequire((process.env.RUT_DIR || process.cwd()) + '/');
const { initializeTestEnvironment, assertSucceeds, assertFails } = req('@firebase/rules-unit-testing');
const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-shomer',
  database: { host, port: +port, rules: readFileSync(new URL('../database.rules.json.SUBJUID-PROPOSED', import.meta.url), 'utf8') },
});
const db = u => env.authenticatedContext(u).database();
const rec = { kind: 'abduct', subjName: 'x', ts: Date.now(), status: 'active', subjTag: 'abcd'.repeat(8) };
let fail = 0;
async function t(name, fn, expectOk) {
  try { await (expectOk ? assertSucceeds(fn()) : assertFails(fn())); console.log('PASS', name); }
  catch (e) { fail++; console.log('FAIL', name, '-', String(e.message).split('\n')[0]); }
}
await env.clearDatabase();
// reporter-created flow (as the client does: dashown, pasubj, palerts)
await t('reporter writes dashown/pa_1', () => db('rep').ref('dashown/pa_1').set('rep'), true);
await t('reporter writes pasubj/pa_1 (subject uid)', () => db('rep').ref('pasubj/pa_1').set('subj'), true);
await t('reporter writes palerts/pa_1', () => db('rep').ref('palerts/pa_1').set(rec), true);
await t('subject closes own alert (status resolved)', () => db('subj').ref('palerts/pa_1/status').set('resolved'), true);
await t('reporter closes own alert', () => db('rep').ref('palerts/pa_1/resolvedTs').set(Date.now()), true);
await t('stranger knowing subjTag cannot write alert', () => db('evil').ref('palerts/pa_1/status').set('resolved'), false);
await t('stranger cannot rewrite whole alert', () => db('evil').ref('palerts/pa_1').set(rec), false);
await t('nobody can read pasubj (subject)', () => db('subj').ref('pasubj/pa_1').get(), false);
await t('nobody can read pasubj (reporter)', () => db('rep').ref('pasubj/pa_1').get(), false);
await t('nobody can read pasubj (stranger)', () => db('evil').ref('pasubj/pa_1').get(), false);
await t('second write to existing pasubj denied (reporter)', () => db('rep').ref('pasubj/pa_1').set('evil'), false);
await t('second write to existing pasubj denied (stranger)', () => db('evil').ref('pasubj/pa_1').set('evil'), false);
await t('pasubj by non-dashown-owner denied', () => db('evil').ref('pasubj/pa_9').set('evil'), false);
await t('pasubj after palerts already exists denied', async () => {
  await env.withSecurityRulesDisabled(async c => { await c.database().ref('dashown/pa_2').set('rep'); await c.database().ref('palerts/pa_2').set(rec); });
  return db('rep').ref('pasubj/pa_2').set('subj');
}, false);
await t('pasubj value longer than 28 chars denied', async () => { await db('rep').ref('dashown/pa_3').set('rep'); return db('rep').ref('pasubj/pa_3').set('x'.repeat(29)); }, false);
await env.cleanup();
console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
process.exit(fail ? 1 : 0);
