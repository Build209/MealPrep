/**
 * Old-app half of supabase/scripts/stripe-webhook-check.ts: the parts that read files in mobile/.
 * The function checks themselves moved to supabase/scripts/ with the functions.
 * Run from mobile/: npm run test:billing
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUS_ACTIVE_STATUSES } from '../../supabase/functions/stripe-webhook/subscriptionState.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The SQL that derives the plan must use the same list as the webhook.
assert.deepEqual([...PLUS_ACTIVE_STATUSES], ['active', 'trialing', 'past_due']);
const migration = fs.readFileSync(
  path.join(mobileRoot, 'supabase/migrations/20261009020000_billing_subscriptions.sql'),
  'utf8',
);
assert.match(migration, /b\.status in \('active', 'trialing', 'past_due'\)/);

console.log('stripe-webhook-mobile-check: ok');
