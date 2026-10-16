/**
 * The public Terms of Use and Privacy Policy pages (app/public/terms.html, privacy.html, served at
 * https://mealplanatic.app/terms.html and /privacy.html) must say what the functions enforce and record.
 *
 * Ported at the switch-over from the old app's page checks, which read mobile/public:
 * plan-tiers-mobile-check, delete-account-billing-mobile-check, stripe-checkout-mobile-check,
 * scan-photo-retention-mobile-check and ask-forky-mobile-check (their page parts only; the old-app
 * code and old-migration parts retired with mobile/). A missing page is a failure.
 *
 * Run from supabase/: npm run test:legal-pages
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPrice, TERMS_VERSION } from '../functions/_shared/billingText.ts';
import { PAID_TIERS, TIER_LIMITS, TIER_NAMES, TIER_PRICE_CENTS, type PlanTier } from '../functions/_shared/planTiers.ts';
import { SCAN_RETENTION_DAYS } from '../functions/_shared/scanRetention.ts';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'public');
const read = (name: string) => {
  const file = path.join(publicDir, name);
  assert.ok(fs.existsSync(file), `app/public/${name} is missing`);
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
};
const flat = (text: string) => text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const squeeze = (text: string) => text.replace(/\s+/g, ' ');

const termsHtml = read('terms.html');
const privacyHtml = read('privacy.html');
const terms = flat(termsHtml);
const termsSqueezed = squeeze(termsHtml);
const privacy = flat(privacyHtml);
const privacySqueezed = squeeze(privacyHtml);

// --- Terms state the limits and prices every function enforces (was plan-tiers-mobile-check). ---
const limitWords = (tier: PlanTier) => {
  const l = TIER_LIMITS[tier];
  return `${l.scans} scans, ${l.imports} recipe imports and ${l.forkyQuestions} Ask Forky questions a month`;
};
assert.ok(terms.includes(`Free: ${limitWords('free')}.`), 'terms state the free limits');
for (const tier of PAID_TIERS) {
  const name = TIER_NAMES[tier].replace(/^MealPlanatic /, '');
  assert.ok(terms.includes(`${name}: ${limitWords(tier)}.`), `terms state the ${name} limits`);
  const prices = `${formatPrice(TIER_PRICE_CENTS[tier].month, 'usd')} a month or ${formatPrice(TIER_PRICE_CENTS[tier].year, 'usd')} a year`;
  assert.ok(terms.includes(`${limitWords(tier)}. ${prices}.`), `terms state the ${name} prices: ${prices}`);
}
assert.ok(terms.includes(`up to ${TIER_LIMITS.plus.priceTagScans} store price-tag scans a month`));
assert.match(terms, /Limits start again on the first day of each month/);
assert.match(terms, /renews automatically/);
assert.match(terms, /You can cancel at any time/);
assert.doesNotMatch(terms, /\$6\.99|\$60 a year|\$60\b|\$39\b|40 shelf|3 shelf scans in total/, 'no old prices or limits');
assert.doesNotMatch(terms, /\d+ ?% off|save \$/i, 'no savings claims on the terms page');

// --- The terms version stored with each purchase is the date printed on the page (was stripe-checkout-mobile-check). ---
const [year, month, day] = TERMS_VERSION.split('-').map(Number);
const printed = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
assert.ok(terms.includes(`Last updated: ${printed}`), `terms page is dated ${printed} (TERMS_VERSION ${TERMS_VERSION})`);

// --- Terms wording compliance handoff 1 relies on (was delete-account-billing-mobile-check, items 5 and 7). ---
for (const phrase of [
  'Plans and prices</h2>',
  'renews automatically',
  'Manage subscription',
  'Cancelling stops future charges',
  'We do not give refunds for part of a period',
  'at least 7 days and no more than 30 days',
  'Deleting your account cancels your paid plan straight away',
  'Time left in a period you already paid for is not refunded',
  'You must be 18 or older to use MealPlanatic',
  'MealPlanatic is operated by',
  'governed by the laws of the State of California',
]) {
  assert.ok(termsSqueezed.includes(phrase), `terms.html should say: ${phrase}`);
}
assert.doesNotMatch(termsSqueezed, /\[[^\]]*(legal|entity|name|city)[^\]]*\]/i, 'no unfilled blanks on the public terms page');

// --- Privacy page (was delete-account-billing, plan-tiers, scan-photo-retention and ask-forky mobile checks). ---
assert.ok(privacySqueezed.includes('<strong>Stripe</strong>'), 'privacy.html names Stripe as the payment provider');
assert.ok(privacySqueezed.includes('We keep billing records'), 'privacy.html says billing records outlive the account');
assert.ok(privacySqueezed.includes('MealPlanatic is operated by'), 'privacy.html names who operates the app');
assert.ok(privacy.includes('We keep a count of how many scans and recipe imports your account has used each month'));
assert.ok(privacySqueezed.includes(`<strong>${SCAN_RETENTION_DAYS} days</strong>`), `privacy.html states the ${SCAN_RETENTION_DAYS}-day scan photo window`);
assert.match(privacy, /Ask Forky/);
assert.match(privacy, /Anthropic/, 'privacy page names the AI provider (compliance rule 2)');
assert.match(privacy, /household size, the names of items you buy regularly, and the titles of meals you recently marked as made/);
assert.match(privacySqueezed, /If you have saved allergens, they are also sent to Anthropic with your question/);
assert.match(privacySqueezed, /We do not send your name, email, photos, diets, or dietary notes/);
assert.doesNotMatch(privacySqueezed, /or your dietary and allergy settings/, 'old no-allergens sentence must be gone');

console.log('legal-pages-check: ok');
