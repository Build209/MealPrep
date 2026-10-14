/**
 * Old-app half of supabase/scripts/plan-tiers-check.ts: the server's plan table must match the
 * app's copy of it, the buy screen prices, the Terms of Use page and the migration in mobile/.
 * The server-only checks moved to supabase/scripts/ with the functions.
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
import { TERMS_VERSION } from '../../supabase/functions/_shared/billingText.ts';
import * as server from '../../supabase/functions/_shared/planTiers.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8').replace(/\r\n/g, '\n');
const flat = (text: string) => text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

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
// A bigger plan is never cheaper.
const order = ['free', 'plus', 'pro', 'family'] as const;
for (let i = 2; i < order.length; i += 1) {
  const [lower, higher] = [order[i - 1], order[i]] as ['plus' | 'pro', 'pro' | 'family'];
  assert.ok(TIER_PRICING[higher].month.unitAmount > TIER_PRICING[lower].month.unitAmount);
  assert.ok(TIER_PRICING[higher].year.unitAmount > TIER_PRICING[lower].year.unitAmount, 'a bigger plan is never cheaper by the year');
}

// --- Which tier an account is on (the app's copy of the rule) ----------------------------------
for (const tierFor of [app.tierForProfile]) {
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
assert.equal(app.usageMonth(new Date('2026-11-01T00:00:00Z')), '2026-11', 'the app reads the same row the server counts in');

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

// --- Migration --------------------------------------------------------------------------------
assert.match(read('supabase/migrations/20261011180000_plan_tiers.sql'), /plan_tier = coalesce\(live_tier, 'plus'\)/, 'a tier never outlives its subscription');
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

console.log('plan-tiers-mobile-check: ok');
