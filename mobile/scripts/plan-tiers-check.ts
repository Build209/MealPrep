/**
 * Plan tiers (Free, Plus, Pro, Family): the limits and prices must be the same in the four places
 * a customer or the server reads them: the server table, the app's copy of it, the buy screen
 * prices and the Terms of Use page. Also covers the recipe-import allowance and the migration.
 *
 * Run from mobile/: npm run test:plan-tiers
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as app from '../config/planTiers.ts';
import { planLabel } from '../config/plans.ts';
import { TIER_PRICING } from '../config/pricing.ts';
import { formatTierPrice } from '../lib/billing/pricing.ts';
import { TERMS_VERSION } from '../supabase/functions/_shared/billingText.ts';
import * as server from '../supabase/functions/_shared/planTiers.ts';
import {
  claimImport,
  importCounts,
  importLimitBody,
  refundImport,
} from '../supabase/functions/recipe-import/importAllowance.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (text: string) => text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

// --- The owner's numbers (2026-10-11) -------------------------------------------------------
assert.deepEqual(server.TIER_LIMITS, {
  free: { scans: 3, imports: 2, forkyQuestions: 5, priceTagScans: 0 },
  plus: { scans: 15, imports: 5, forkyQuestions: 15, priceTagScans: 200 },
  pro: { scans: 25, imports: 10, forkyQuestions: 30, priceTagScans: 200 },
  family: { scans: 50, imports: 25, forkyQuestions: 60, priceTagScans: 200 },
});
// The price the app states is the price checkout insists on.
for (const tier of server.PAID_TIERS) {
  assert.equal(TIER_PRICING[tier].month.unitAmount, server.TIER_PRICE_CENTS[tier].month, `${tier} monthly`);
  assert.equal(TIER_PRICING[tier].year.unitAmount, server.TIER_PRICE_CENTS[tier].year, `${tier} yearly`);
  assert.equal(TIER_PRICING[tier].month.currency, 'usd');
}
// The app shows exactly what the server enforces.
assert.deepEqual(app.TIER_LIMITS, server.TIER_LIMITS);
assert.deepEqual(app.TIER_NAMES, server.TIER_NAMES);
assert.deepEqual([...app.PAID_TIERS], [...server.PAID_TIERS]);
// A bigger tier never gives less of anything.
const order = ['free', 'plus', 'pro', 'family'] as const;
for (let i = 1; i < order.length; i += 1) {
  for (const field of ['scans', 'imports', 'forkyQuestions', 'priceTagScans'] as const) {
    assert.ok(server.TIER_LIMITS[order[i]][field] >= server.TIER_LIMITS[order[i - 1]][field], `${order[i]} ${field}`);
  }
  if (i > 1) {
    const [lower, higher] = [order[i - 1], order[i]] as ['plus' | 'pro', 'pro' | 'family'];
    assert.ok(TIER_PRICING[higher].month.unitAmount > TIER_PRICING[lower].month.unitAmount);
    assert.ok(TIER_PRICING[higher].year.unitAmount > TIER_PRICING[lower].year.unitAmount, 'a bigger plan is never cheaper by the year');
  }
}

// --- Which tier an account is on --------------------------------------------------------------
for (const tierFor of [server.tierForProfile, app.tierForProfile]) {
  assert.equal(tierFor('free', null), 'free');
  assert.equal(tierFor(null, 'family'), 'free', 'a tier on a free account means nothing');
  assert.equal(tierFor('free', 'pro'), 'free');
  assert.equal(tierFor('paid', 'plus'), 'plus');
  assert.equal(tierFor('paid', 'pro'), 'pro');
  assert.equal(tierFor('paid', 'family'), 'family');
  assert.equal(tierFor('paid', null), 'plus', 'paid with no tier on file is the smallest paid tier');
  assert.equal(tierFor('paid', undefined), 'plus');
  assert.equal(tierFor('paid', 'FAMILY'), 'plus', 'anything unrecognised is never read as a bigger tier');
  assert.equal(tierFor('paid', 'free'), 'plus');
}
assert.equal(planLabel('free', 'family'), 'Free');
assert.equal(planLabel('paid', undefined), 'MealPlanatic Plus');
assert.equal(planLabel('paid', 'pro'), 'MealPlanatic Pro');
assert.equal(planLabel('paid', 'family'), 'MealPlanatic Family');
assert.equal(app.tierLimitsLine('plus'), '15 scans, 5 recipe imports and 15 Ask Forky questions a month');
assert.equal(app.tierLimitsLine('free'), '3 scans, 2 recipe imports and 5 Ask Forky questions a month');

// --- Months and Stripe lookup keys ------------------------------------------------------------
assert.equal(server.usageMonth(new Date('2026-10-31T23:59:59Z')), '2026-10');
assert.equal(server.usageMonth(new Date('2026-11-01T00:00:00Z')), '2026-11');
assert.equal(app.usageMonth(new Date('2026-11-01T00:00:00Z')), '2026-11', 'the app reads the same row the server counts in');
for (const tier of server.PAID_TIERS) {
  for (const interval of ['month', 'year'] as const) {
    const key = server.priceLookupKey(tier, interval);
    assert.match(key, /^(plus|pro|family)_(monthly|yearly)$/);
    assert.equal(server.tierFromLookupKey(key), tier, 'a price found by its key maps back to the tier it was sold as');
  }
}
for (const bad of ['plus', 'pro_month', 'family_yearly_v2', ' pro_yearly_', 'free_monthly', null, undefined, 7]) {
  assert.equal(server.tierFromLookupKey(bad), null, String(bad));
}

// --- The emergency brake only lowers ----------------------------------------------------------
assert.deepEqual(server.tierLimits('plus'), server.TIER_LIMITS.plus);
assert.deepEqual(server.tierLimits('plus', ''), server.TIER_LIMITS.plus);
assert.deepEqual(server.tierLimits('plus', 'not json'), server.TIER_LIMITS.plus);
assert.deepEqual(server.tierLimits('plus', '[1,2]'), server.TIER_LIMITS.plus);
assert.equal(server.tierLimits('free', '{"free":{"scans":0}}').scans, 0);
assert.equal(server.tierLimits('free', '{"free":{"scans":0}}').imports, 2, 'other limits are untouched');
assert.equal(server.tierLimits('plus', '{"free":{"scans":0}}').scans, 15, 'other tiers are untouched');
assert.equal(server.tierLimits('family', '{"family":{"imports":10}}').imports, 10);
for (const raise of ['{"plus":{"scans":16}}', '{"plus":{"scans":15.5}}', '{"plus":{"scans":-1}}', '{"plus":{"scans":"3"}}', '{"plus":{"scans":null}}']) {
  assert.equal(server.tierLimits('plus', raise).scans, 15, raise);
}
assert.equal(server.TIER_LIMITS.plus.scans, 15, 'the published table is never changed by an override');

// --- Terms of Use page says the same numbers and prices ---------------------------------------
const terms = flat(read('public/terms.html'));
const limitWords = (tier: server.PlanTier) => {
  const l = server.TIER_LIMITS[tier];
  return `${l.scans} scans, ${l.imports} recipe imports and ${l.forkyQuestions} Ask Forky questions a month`;
};
assert.ok(terms.includes(`Free: ${limitWords('free')}.`), 'terms state the free limits');
for (const [tier, name] of [['plus', 'Plus'], ['pro', 'Pro'], ['family', 'Family']] as const) {
  assert.ok(terms.includes(`${name}: ${limitWords(tier)}.`), `terms state the ${name} limits`);
  const prices = `${formatTierPrice(tier, 'month')} a month or ${formatTierPrice(tier, 'year')} a year`;
  assert.ok(terms.includes(`${limitWords(tier)}. ${prices}.`), `terms state the ${name} prices: ${prices}`);
}
assert.ok(terms.includes('up to 200 store price-tag scans a month'));
assert.equal(server.TIER_LIMITS.plus.priceTagScans, 200);
assert.match(terms, /Limits start again on the first day of each month/);
assert.match(terms, /renews automatically/);
assert.match(terms, /You can cancel at any time/);
// No old prices or limits are left behind.
assert.doesNotMatch(terms, /\$6\.99|\$60 a year|40 shelf|3 shelf scans in total/);
// No savings claims on the terms page either: prices only.
assert.doesNotMatch(terms, /\d+ ?% off|save \$/i);
// The version stored with each purchase is the date printed on the page.
const [year, month, day] = TERMS_VERSION.split('-').map(Number);
const printed = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
assert.ok(terms.includes(`Last updated: ${printed}`), `terms page is dated ${printed} (TERMS_VERSION ${TERMS_VERSION})`);
// The privacy page says the import count is kept.
assert.ok(flat(read('public/privacy.html')).includes('We keep a count of how many scans and recipe imports your account has used each month'));

// --- Recipe-import allowance (against a stand-in for Supabase) ----------------------------------
type Row = { plan: string; role?: string; plan_tier?: string };
const env: Record<string, string> = { SUPABASE_URL: 'https://project.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-role-test' };
(globalThis as Record<string, unknown>).Deno = { env: { get: (name: string) => env[name] } };
let profile: Row | null = { plan: 'free' };
let counterExists = true;
let planTierColumnExists = true;
const counts = new Map<string, number>();
const realFetch = globalThis.fetch;
const realWarn = console.warn;
console.warn = () => {};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer service-role-test');
  if (url.includes('/rest/v1/profiles')) {
    if (url.includes('plan_tier') && !planTierColumnExists) return new Response('{"code":"42703"}', { status: 400 });
    return new Response(JSON.stringify(profile ? [profile] : []), { status: 200 });
  }
  if (!counterExists) return new Response('{"message":"function not found"}', { status: 404 });
  const args = JSON.parse(String(init?.body)) as { p_user_id: string; p_period: string; p_limit?: number };
  const key = `${args.p_user_id}|${args.p_period}`;
  const used = counts.get(key) ?? 0;
  if (url.endsWith('/claim_recipe_import')) {
    if (used >= args.p_limit!) return new Response('-1', { status: 200 });
    counts.set(key, used + 1);
    return new Response(String(args.p_limit! - used - 1), { status: 200 });
  }
  if (url.endsWith('/refund_recipe_import')) {
    counts.set(key, Math.max(0, used - 1));
    return new Response('null', { status: 200 });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

(async () => {
  const oct = new Date('2026-10-11T16:00:00Z');
  const nov = new Date('2026-11-01T00:00:01Z');

  // Free: two imports a month, then refused; they come back on the 1st.
  let claim = await claimImport('user-free', oct);
  assert.deepEqual(claim, { state: 'claimed', tier: 'free', period: '2026-10', limit: 2, remaining: 1 });
  assert.equal((await claimImport('user-free', oct)).state, 'claimed');
  claim = await claimImport('user-free', oct);
  assert.deepEqual(claim, { state: 'used-up', tier: 'free', limit: 2 });
  assert.equal(counts.get('user-free|2026-10'), 2, 'a refused import takes nothing');
  assert.equal((await claimImport('user-free', nov)).state, 'claimed', 'a new month starts again');

  // An import that produced no recipe is given back.
  await refundImport('user-free', '2026-10');
  assert.equal(counts.get('user-free|2026-10'), 1);
  assert.equal((await claimImport('user-free', oct)).state, 'claimed');

  // Paid tiers get their own number.
  for (const [planTier, limit] of [['plus', 5], ['pro', 10], ['family', 25]] as const) {
    profile = { plan: 'paid', plan_tier: planTier };
    claim = await claimImport(`user-${planTier}`, oct);
    assert.deepEqual(claim, { state: 'claimed', tier: planTier, period: '2026-10', limit, remaining: limit - 1 });
  }
  // Before the plan_tiers migration a paid account is Plus.
  planTierColumnExists = false;
  profile = { plan: 'paid' };
  claim = await claimImport('user-nocolumn', oct);
  assert.equal(claim.state === 'claimed' && claim.limit, 5);
  planTierColumnExists = true;

  // Admin accounts are not counted.
  profile = { plan: 'free', role: 'admin' };
  assert.deepEqual(await claimImport('user-admin', oct), { state: 'uncounted', tier: 'admin' });
  assert.ok(!counts.has('user-admin|2026-10'));

  // The counter is not there yet, or the plan cannot be read: imports run uncounted, as before.
  counterExists = false;
  profile = { plan: 'free' };
  assert.deepEqual(await claimImport('user-nomig', oct), { state: 'uncounted', tier: 'free' });
  counterExists = true;
  profile = null;
  assert.deepEqual(await claimImport('user-gone', oct), { state: 'uncounted', tier: null });

  // The emergency brake can switch imports off for a tier.
  profile = { plan: 'free' };
  assert.deepEqual(await claimImport('user-brake', oct, '{"free":{"imports":0}}'), { state: 'used-up', tier: 'free', limit: 0 });

  globalThis.fetch = realFetch;
  console.warn = realWarn;

  // What counts as an import: a recipe extracted for this request. Not an error, not "not a
  // recipe", not an answer from the shared cache.
  assert.equal(importCounts(200, { recipe: { title: 'Soup' }, cached: false }), true);
  assert.equal(importCounts(200, { recipe: { title: 'Soup' } }), true);
  assert.equal(importCounts(200, { recipe: { title: 'Soup' }, cached: true }), false);
  assert.equal(importCounts(422, { error: 'not a recipe', code: 'NOT_RECIPE' }), false);
  assert.equal(importCounts(502, { error: 'x' }), false);
  assert.equal(importCounts(200, {}), false);
  assert.equal(importCounts(200, null), false);

  // Limit message: says the number, when it resets, and (free only) that paid plans include more.
  const freeBody = importLimitBody('free', 2) as { error: string; code: string; usage: Record<string, unknown> };
  assert.equal(freeBody.code, 'IMPORT_LIMIT_REACHED');
  assert.match(freeBody.error, /used your 2 free recipe imports for this month\. They reset on the 1st\./);
  assert.deepEqual(freeBody.usage, { remaining: 0, limit: 2, isPlus: false, tier: 'free' });
  const proBody = importLimitBody('pro', 10) as { error: string };
  assert.match(proBody.error, /used all 10 recipe imports for this month\. They reset on the 1st\.$/);
  assert.doesNotMatch(proBody.error, /paid plan/);

  // --- Function wiring, checked in the source -------------------------------------------------
  const importFn = read('supabase/functions/recipe-import/index.ts');
  const serveAt = importFn.indexOf('Deno.serve(async (req) => {');
  const wrapper = importFn.slice(serveAt, importFn.indexOf('async function handleImportRequest('));
  assert.ok(serveAt > 0 && wrapper.length > 0);
  assert.ok(wrapper.indexOf('claimImport(') < wrapper.indexOf('handleImportRequest(req);\n  } catch'), 'the import is claimed before any work');
  assert.match(wrapper, /if \(claim\.state === 'used-up'\) \{\s*return jsonResponse\(importLimitBody\(claim\.tier, claim\.limit\), 429\);/);
  assert.match(wrapper, /if \(!importCounts\(response\.status, body\)\) \{\s*await refundImport\(userId, claim\.period\);/);
  assert.match(wrapper, /catch \(error\) \{\s*if \(claim\.state === 'claimed'\) await refundImport/);
  assert.equal((importFn.match(/Deno\.serve\(/g) ?? []).length, 1);

  const vision = read('supabase/functions/pantry-vision/index.ts');
  assert.match(vision, /from '\.\.\/_shared\/planTiers\.ts'/);
  assert.doesNotMatch(vision, /Deno\.env\.get\('PANTRY_(PLUS|FREE)_/, 'old limit secrets cannot override the published numbers');
  const forky = read('supabase/functions/ask-forky/index.ts');
  assert.doesNotMatch(forky, /Deno\.env\.get\('FORKY_(PLUS|FREE)_/, 'old limit secrets cannot override the published numbers');
  assert.match(forky, /error\?\.code === '42703'/, 'works before the plan_tiers migration');

  // The webhook stores the tier and survives a missing column; it never writes the profile itself.
  const webhook = read('supabase/functions/stripe-webhook/index.ts');
  assert.match(webhook, /upsert\(\{ \.\.\.stored, plan_tier: row\.plan_tier \}/);
  assert.match(webhook, /isMissingPlanTierColumn\(upsertError\)/);
  assert.doesNotMatch(webhook, /from\('profiles'\)\s*\.update/);
  // Checkout sells nothing at a price other than the published one, and no Pro or Family before
  // the tier can be stored; the tier is written on the subscription itself.
  const checkoutFn = read('supabase/functions/stripe-checkout/index.ts');
  assert.match(checkoutFn, /price\.unit_amount !== TIER_PRICE_CENTS\[tier\]\[interval\]/);
  assert.ok(checkoutFn.indexOf('TIER_PRICE_CENTS[tier][interval]') < checkoutFn.indexOf("'POST', '/checkout/sessions', {"), 'checked before a page is created');
  assert.match(checkoutFn, /if \(tier !== 'plus'\) \{[\s\S]{0,200}select\('plan_tier'\)/);
  assert.match(checkoutFn, /metadata: \{ supabase_user_id: userId, plan_tier: tier \}/);
  assert.match(read('supabase/migrations/20261011180000_plan_tiers.sql'), /plan_tier = coalesce\(live_tier, 'plus'\)/, 'a tier never outlives its subscription');

  // --- Migration --------------------------------------------------------------------------------
  const sql = read('supabase/migrations/20261011180000_plan_tiers.sql');
  assert.match(sql, /add column if not exists plan_tier text not null default 'plus'/);
  assert.match(sql, /check \(plan_tier in \('plus', 'pro', 'family'\)\)/);
  // A user can never give themselves a bigger tier: the trigger guards plan_tier with plan.
  assert.match(sql, /or new\.plan_tier is distinct from old\.plan_tier\) then/);
  assert.match(sql, /new\.plan_tier := 'plus';/, 'sign-up cannot arrive with a tier');
  assert.match(sql, /if not public\.is_admin\(\) then\s+raise exception/);
  // recompute stays the one writer, locked to the service role.
  assert.ok(sql.includes('revoke all on function public.recompute_user_plan(uuid) from public, anon, authenticated'));
  assert.ok(sql.includes('grant execute on function public.recompute_user_plan(uuid) to service_role'));
  // The import counter: own row readable, never writable by a client, claim guarded in one update.
  assert.match(sql, /create table if not exists public\.recipe_import_usage/);
  assert.match(sql, /references auth\.users \(id\) on delete cascade/, 'counts go when the account is deleted');
  assert.match(sql, /alter table public\.recipe_import_usage enable row level security/);
  assert.match(sql, /for select to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to (anon|authenticated)/i);
  assert.match(sql, /and imports < p_limit/);
  for (const fn of ['claim_recipe_import(uuid, text, integer)', 'refund_recipe_import(uuid, text)']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated`), `${fn} locked down`);
    assert.ok(sql.includes(`grant execute on function public.${fn} to service_role`));
  }
  assert.doesNotMatch(sql, /drop table|truncate|delete from|update public\.profiles\s+set plan\b/i, 'additive: no existing plan is changed');
  assert.doesNotMatch(sql, /(url|link|title|recipe_text|content)\s+text\b/i, 'the counter holds no links or recipe text');

  console.log('plan-tiers-check: ok');
})().catch((error) => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.error(error);
  process.exit(1);
});
