/**
 * Old-app half of supabase/scripts/delete-account-billing-check.ts: the parts that read files in mobile/.
 * The function checks themselves moved to supabase/scripts/ with the functions.
 * Run from mobile/: npm run test:billing
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- Terms and privacy pages (compliance handoff 1, items 5 and 7) ---
const terms = fs.readFileSync(path.join(mobileRoot, 'public/terms.html'), 'utf8').replace(/\s+/g, ' ');
for (const phrase of [
  'Plans and prices</h2>',
  '$4.99 a month',
  '$53.88 a year',
  '$8.99 a month',
  '$93.84 a year',
  '$20 a month',
  '$192 a year',
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
  '15 scans, 5 recipe imports and 15 Ask Forky questions a month',
  '3 scans, 2 recipe imports and 5 Ask Forky questions a month',
]) {
  assert.ok(terms.includes(phrase), `terms.html should say: ${phrase}`);
}
assert.doesNotMatch(terms, /\[[^\]]*(legal|entity|name|city)[^\]]*\]/i, 'no unfilled blanks on the public terms page');
assert.doesNotMatch(terms, /\$6\.99|\$60\b|\$39\b/, 'old prices must not appear');

const privacy = fs.readFileSync(path.join(mobileRoot, 'public/privacy.html'), 'utf8').replace(/\s+/g, ' ');
assert.ok(privacy.includes('<strong>Stripe</strong>'), 'privacy.html names Stripe as the payment provider');
assert.ok(privacy.includes('We keep billing records'), 'privacy.html says billing records outlive the account');
assert.ok(privacy.includes('MealPlanatic is operated by'), 'privacy.html names who operates the app');

console.log('delete-account-billing-mobile-check: ok');
