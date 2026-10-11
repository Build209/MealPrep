/**
 * Usage log checks: what may be recorded, how it is batched, and that the database file, the app
 * wiring and the privacy page agree. Run: npm run test:usage-log
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUsageEventRow,
  cleanUsageProps,
  enqueueUsageEvent,
  groceryListJustCompleted,
  isNewUsageSession,
  takeUsageBatch,
  USAGE_EVENT_NAMES,
  USAGE_LOG_LIMITS,
  USAGE_PROP_KEYS,
  usageSendOutcome,
  type UsageEventRow,
} from '../lib/usage/usageEvents.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');

// --- Event names fit the database rule (lowercase, 3 to 40 characters) and are unique.
const DB_NAME_RULE = /^[a-z][a-z0-9_]{2,39}$/;
for (const name of USAGE_EVENT_NAMES) assert.match(name, DB_NAME_RULE, `${name} fits the table's name rule`);
assert.equal(new Set(USAGE_EVENT_NAMES).size, USAGE_EVENT_NAMES.length);

// --- Nothing personal can ride along: unknown keys and free text are dropped.
assert.deepEqual(
  cleanUsageProps({
    prompt: 'aisleSort',
    count: 12.6,
    standalone: true,
    kind: 'whole milk 2%', // an item name: has spaces, so it is not a code word
    source: 'I am allergic to peanuts',
    question: 'what can I cook',
    itemName: 'eggs',
    email: 'a@b.co',
    plan: 'year',
    action: { nested: true },
  }),
  { prompt: 'aisleSort', count: 13, standalone: true, plan: 'year' },
);
assert.deepEqual(cleanUsageProps(null), {});
assert.deepEqual(cleanUsageProps('text'), {});
assert.deepEqual(cleanUsageProps({ count: -5 }), { count: 0 });
assert.deepEqual(cleanUsageProps({ count: Number.NaN, prompt: 'x'.repeat(40) }), {});
// The key list holds nothing that names food, health or a person. A new key must be argued for here.
assert.deepEqual([...USAGE_PROP_KEYS].sort(), ['action', 'count', 'kind', 'plan', 'prompt', 'source', 'standalone']);
// Every row stays far below the table's 600-byte limit on props.
const biggest = cleanUsageProps(Object.fromEntries(USAGE_PROP_KEYS.map((key) => [key, 'x'.repeat(32)])));
assert.ok(JSON.stringify(biggest).length < 400);

// --- Rows: unknown names are refused; platform and session are bounded.
assert.equal(buildUsageEventRow('made_up_event', {}, 's', 'web'), null);
assert.deepEqual(buildUsageEventRow('scan_saved', { kind: 'receipt', count: 14 }, 's'.repeat(80), 'windows'), {
  name: 'scan_saved',
  props: { kind: 'receipt', count: 14 },
  session_id: 's'.repeat(40),
  platform: 'web',
});
assert.equal(buildUsageEventRow('app_open', {}, 's', 'ios')?.platform, 'ios');
// A row only ever has the columns the app is allowed to write (the id and the time are the server's).
assert.deepEqual(Object.keys(buildUsageEventRow('app_open', {}, 's', 'web') ?? {}).sort(), ['name', 'platform', 'props', 'session_id']);

// --- Queue: bounded, oldest dropped first, sent in batches.
let queue: UsageEventRow[] = [];
for (let i = 0; i < USAGE_LOG_LIMITS.maxQueued + 25; i += 1) {
  queue = enqueueUsageEvent(queue, { name: 'grocery_item_checked', props: { count: i }, session_id: 's', platform: 'web' });
}
assert.equal(queue.length, USAGE_LOG_LIMITS.maxQueued);
assert.equal(queue[0].props.count, 25, 'the oldest were dropped');
const { batch, rest } = takeUsageBatch(queue);
assert.equal(batch.length, USAGE_LOG_LIMITS.maxBatch);
assert.equal(rest.length, USAGE_LOG_LIMITS.maxQueued - USAGE_LOG_LIMITS.maxBatch);

// --- A missing table or a refused write stops the log for the visit; a dropped connection retries.
assert.equal(usageSendOutcome(null), 'sent');
assert.equal(usageSendOutcome({ code: '42P01' }), 'stop');
assert.equal(usageSendOutcome({ code: 'PGRST205', status: 404 }), 'stop');
assert.equal(usageSendOutcome({ code: '42501', status: 403 }), 'stop');
assert.equal(usageSendOutcome({ code: '23514', status: 400 }), 'stop');
assert.equal(usageSendOutcome({ code: '', status: 0 }), 'retry');
assert.equal(usageSendOutcome({ code: '57014', status: 500 }), 'retry');

// --- Sessions: half an hour away starts a new one.
assert.equal(isNewUsageSession(null, 1_000_000), false);
assert.equal(isNewUsageSession(0, 29 * 60 * 1000), false);
assert.equal(isNewUsageSession(0, 30 * 60 * 1000), true);

// --- "List completed": the tick that leaves nothing unticked on a list of three or more.
const list = (checked: boolean[]) => checked.map((value, i) => ({ id: `g${i}`, checked: value }));
assert.equal(groceryListJustCompleted(list([true, true, false]), ['g2']), true);
assert.equal(groceryListJustCompleted(list([true, false, false]), ['g2']), false);
assert.equal(groceryListJustCompleted(list([false, false, false]), ['g0', 'g1', 'g2']), true);
assert.equal(groceryListJustCompleted(list([true, false]), ['g1']), false, 'two items is not a shopping trip');
assert.equal(groceryListJustCompleted(list([true, true, true]), ['g0']), false, 'already complete');
assert.equal(groceryListJustCompleted(list([true, true, false]), []), false);

// --- The sender: signed-in only, never throws, and the app's root switches it on and off.
const sender = read('lib/usage/usageLog.ts');
assert.match(sender, /if \(!enabled \|\| stopped\) return;/, 'nothing is queued unless an account is active');
assert.match(sender, /export const USAGE_EVENTS_TABLE = 'app_events';/);
assert.doesNotMatch(sender, /console\.(log|warn|error)/, 'the log stays silent');
assert.doesNotMatch(sender, /user_id/, 'the account comes from the sign-in token, never from the app');
const appContext = read('context/AppContext.tsx');
assert.match(appContext, /setUsageLogAccount\(!demoMode && Boolean\(sessionUserId\)\);/, 'guests and demo mode are never logged');

// --- Every event the app sends is on the list, and every listed event is sent from somewhere.
const sources = [
  'context/AppContext.tsx',
  'app/(tabs)/pantry.tsx',
  'components/forkinator/ForkinatorOverlay.tsx',
  'components/forkinator/AskForkySheet.tsx',
  'components/billing/PlusUpgradeOptions.tsx',
  'components/billing/PlusUpgradeSheet.tsx',
  'components/grocery/UsualItemsCard.tsx',
  'lib/usage/usageLog.ts',
].map(read).join('\n');
const sent = new Set([...sources.matchAll(/logUsageEvent\(\s*'([a-z_]+)'/g)].map((match) => match[1]));
for (const name of sent) assert.ok((USAGE_EVENT_NAMES as readonly string[]).includes(name), `${name} is on the list`);
for (const name of USAGE_EVENT_NAMES) assert.ok(sent.has(name), `${name} is sent from somewhere`);
// Forky's six prompts are the only prompt names.
const prompts = new Set([...sources.matchAll(/prompt: '([A-Za-z]+)'/g)].map((match) => match[1]));
assert.deepEqual([...prompts].sort(), ['aisleSort', 'expiration', 'forkInRoad', 'greeting', 'restock', 'scanner']);

// --- The database file: own rows only, no edits, a daily cap, 13 months, gone with the account.
const migration = read('supabase/migrations/20261011070000_app_events.sql');
assert.match(migration, /enable row level security/);
assert.match(migration, /for insert to authenticated\s+with check \(user_id = \(select auth\.uid\(\)\)\)/);
assert.match(migration, /for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\)/);
assert.match(migration, /revoke all on public\.app_events from public, anon, authenticated;/);
assert.match(migration, /grant insert \(user_id, name, props, session_id, platform\) on public\.app_events to authenticated;/);
assert.doesNotMatch(migration, /grant[^;]*(update|delete)[^;]*to authenticated/i, 'the app cannot change or delete rows');
assert.match(migration, /references auth\.users \(id\) on delete cascade/);
assert.match(migration, /interval '13 months'/);
assert.match(migration, /v_today_count >= 500/);
assert.ok(migration.includes(`name ~ '${DB_NAME_RULE.source}'`), 'the name rule here matches the table');

// --- The privacy page says what is recorded before the app records it (CalOPPA; compliance rule 2).
const privacy = read('public/privacy.html').replace(/\s+/g, ' ');
assert.match(privacy, /Usage log/);
assert.match(privacy, /13 months/);
assert.match(privacy, /do not use it for advertising/);
assert.match(privacy, /Last updated: October 11, 2026/);

console.log('usage-log-check: ok');
