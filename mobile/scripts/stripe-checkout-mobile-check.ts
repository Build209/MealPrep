/**
 * Old-app half of supabase/scripts/stripe-checkout-check.ts: the parts that read files in mobile/.
 * The function checks themselves moved to supabase/scripts/ with the functions.
 * Run from mobile/: npm run test:billing
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERMS_VERSION } from '../../supabase/functions/_shared/billingText.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(mobileRoot, rel), 'utf8');

// The terms version we record must be the date printed on the live terms page.
const termsHtml = read('public/terms.html');
const [year, month, day] = TERMS_VERSION.split('-').map(Number);
const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
assert.ok(
  termsHtml.includes(`${monthName} ${day}, ${year}`),
  `terms.html should be dated ${monthName} ${day}, ${year} to match TERMS_VERSION`,
);

console.log('stripe-checkout-mobile-check: ok');
